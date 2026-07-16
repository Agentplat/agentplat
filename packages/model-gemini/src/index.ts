import { AgentPlatError } from '@agentplat/core';
import type { JsonObject } from '@agentplat/core';
import type {
  ModelAdapter,
  ModelAdapterCapabilities,
  ModelExecutionContext,
  ModelRequest,
  ModelResult,
  ModelStreamEvent,
  ModelUsage,
} from '@agentplat/model';
export interface GeminiModelAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}
/** Native Gemini GenerateContent adapter; no Google SDK dependency is required. */
export class GeminiModelAdapter implements ModelAdapter {
  readonly id = 'gemini';
  readonly capabilities: ModelAdapterCapabilities = {
    streaming: true,
    tools: false,
    structuredOutput: true,
    vision: false,
  };
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly baseURL: string;
  constructor(private readonly options: GeminiModelAdapterOptions = {}) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!this.fetchImplementation)
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        'A fetch implementation is required by the Gemini adapter'
      );
    this.baseURL = (
      options.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/+$/, '');
  }
  async generate(
    request: ModelRequest,
    context: ModelExecutionContext
  ): Promise<ModelResult> {
    return parse(
      await this.json(await this.request(request, context, false)),
      request.model ?? this.options.defaultModel
    );
  }
  async *stream(
    request: ModelRequest,
    context: ModelExecutionContext
  ): AsyncIterable<ModelStreamEvent> {
    try {
      const response = await this.request(request, context, true);
      if (!response.body)
        throw new AgentPlatError(
          'ADAPTER_ERROR',
          'Gemini returned no streaming body'
        );
      yield {
        type: 'started',
        model: request.model ?? this.options.defaultModel,
      };
      let output = '';
      let latest: JsonObject | undefined;
      for await (const data of sse(response.body)) {
        latest = data;
        const chunk = content(data);
        if (chunk) {
          output += chunk;
          yield { type: 'text_delta', content: chunk };
        }
      }
      const parsed = parse(
        latest ?? {},
        request.model ?? this.options.defaultModel
      );
      yield {
        type: 'completed',
        result: { ...parsed, content: output || parsed.content },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      yield { type: 'failed', errorMessage };
      throw error;
    }
  }
  private async request(
    request: ModelRequest,
    context: ModelExecutionContext,
    stream: boolean
  ): Promise<Response> {
    const model = request.model ?? this.options.defaultModel;
    if (!model)
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'A model is required for Gemini generation'
      );
    const key =
      context.credentials?.geminiApiKey ??
      context.credentials?.apiKey ??
      this.options.apiKey;
    if (!key)
      throw new AgentPlatError('UNAUTHORIZED', 'A Gemini API key is required', {
        statusCode: 401,
      });
    const system = request.messages
      .filter((m) => m.role === 'system' || m.role === 'developer')
      .map((m) => plain(m.content))
      .join('\n');
    const contents = request.messages
      .filter((m) => m.role !== 'system' && m.role !== 'developer')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: plain(m.content) }],
      }));
    const endpoint = `${this.baseURL}/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    const response = await this.fetchImplementation(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
        ...this.options.headers,
      },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        ...(request.options?.maxOutputTokens
          ? {
              generationConfig: {
                maxOutputTokens: request.options.maxOutputTokens,
              },
            }
          : {}),
      }),
      signal: context.signal,
    });
    if (!response.ok)
      throw new AgentPlatError(
        response.status === 401 ? 'UNAUTHORIZED' : 'ADAPTER_ERROR',
        `Gemini endpoint returned HTTP ${response.status}`,
        {
          statusCode: response.status,
          details: (await response.text()).slice(0, 1000),
        }
      );
    return response;
  }
  private async json(response: Response): Promise<JsonObject> {
    return object(await response.json()) ?? {};
  }
}
export const gemini = (options: GeminiModelAdapterOptions = {}) =>
  new GeminiModelAdapter(options);
function object(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}
function plain(value: string | { type: string; text?: string }[]): string {
  return typeof value === 'string'
    ? value
    : value
        .filter((p) => p.type === 'text')
        .map((p) => p.text ?? '')
        .join('');
}
function content(payload: JsonObject): string {
  const candidates = payload.candidates;
  if (!Array.isArray(candidates)) return '';
  const candidate = object(candidates[0]);
  const value = object(candidate?.content);
  const parts = value?.parts;
  return Array.isArray(parts)
    ? parts
        .map(object)
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
    : '';
}
function parse(payload: JsonObject, model: string | undefined): ModelResult {
  const usage = object(payload.usageMetadata);
  const inputTokens = usage?.promptTokenCount;
  const outputTokens = usage?.candidatesTokenCount;
  const normalized: ModelUsage | undefined =
    typeof inputTokens === 'number' || typeof outputTokens === 'number'
      ? {
          ...(typeof inputTokens === 'number' ? { inputTokens } : {}),
          ...(typeof outputTokens === 'number' ? { outputTokens } : {}),
          totalTokens:
            (typeof inputTokens === 'number' ? inputTokens : 0) +
            (typeof outputTokens === 'number' ? outputTokens : 0),
        }
      : undefined;
  return {
    model,
    content: content(payload),
    finishReason: 'stop',
    ...(normalized ? { usage: normalized } : {}),
  };
}
async function* sse(
  body: ReadableStream<Uint8Array>
): AsyncIterable<JsonObject> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines)
      if (line.startsWith('data:')) {
        const value = object(JSON.parse(line.slice(5).trim()));
        if (value) yield value;
      }
  }
}
