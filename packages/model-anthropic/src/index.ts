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

export interface AnthropicModelAdapterOptions {
  apiKey?: string;
  apiVersion?: string;
  baseURL?: string;
  defaultModel?: string;
  maxTokens?: number;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}

/** Native Anthropic Messages API adapter with normalized streaming events. */
export class AnthropicModelAdapter implements ModelAdapter {
  readonly id = 'anthropic';
  readonly capabilities: ModelAdapterCapabilities = {
    streaming: true,
    tools: false,
    structuredOutput: false,
    vision: false,
  };
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly baseURL: string;
  constructor(private readonly options: AnthropicModelAdapterOptions = {}) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!this.fetchImplementation)
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        'A fetch implementation is required by the Anthropic adapter'
      );
    this.baseURL = (options.baseURL ?? 'https://api.anthropic.com/v1').replace(
      /\/+$/,
      ''
    );
  }
  async generate(
    request: ModelRequest,
    context: ModelExecutionContext
  ): Promise<ModelResult> {
    const payload = await this.json(
      await this.request(request, context, false)
    );
    return result(payload);
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
          'Anthropic returned no streaming body'
        );
      yield {
        type: 'started',
        model: request.model ?? this.options.defaultModel,
      };
      let content = '';
      let final: JsonObject | undefined;
      for await (const payload of sse(response.body)) {
        const type = text(payload.type);
        if (type === 'content_block_delta') {
          const delta = object(payload.delta);
          const chunk = text(delta?.text);
          if (chunk) {
            content += chunk;
            yield { type: 'text_delta', content: chunk };
          }
        }
        if (type === 'message_delta')
          final = object(payload.usage)
            ? { ...payload, usage: payload.usage }
            : payload;
      }
      const usage = usageOf(final?.usage);
      yield {
        type: 'completed',
        result: {
          content,
          model: request.model ?? this.options.defaultModel,
          finishReason: 'stop',
          ...(usage ? { usage } : {}),
        },
      };
    } catch (error) {
      const message = messageOf(error);
      yield { type: 'failed', errorMessage: message };
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
        'A model is required for Anthropic generation'
      );
    const key =
      context.credentials?.anthropicApiKey ??
      context.credentials?.apiKey ??
      this.options.apiKey;
    if (!key)
      throw new AgentPlatError(
        'UNAUTHORIZED',
        'An Anthropic API key is required',
        { statusCode: 401 }
      );
    const system = request.messages
      .filter((m) => m.role === 'system' || m.role === 'developer')
      .map((m) => content(m.content))
      .join('\n');
    const messages = request.messages
      .filter((m) => m.role !== 'system' && m.role !== 'developer')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: content(m.content),
      }));
    const response = await this.fetchImplementation(
      `${this.baseURL}/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': this.options.apiVersion ?? '2023-06-01',
          ...this.options.headers,
        },
        body: JSON.stringify({
          model,
          max_tokens:
            request.options?.maxOutputTokens ?? this.options.maxTokens ?? 1024,
          ...(system ? { system } : {}),
          messages,
          stream,
        }),
        signal: context.signal,
      }
    );
    if (!response.ok)
      throw new AgentPlatError(
        response.status === 401 ? 'UNAUTHORIZED' : 'ADAPTER_ERROR',
        `Anthropic endpoint returned HTTP ${response.status}`,
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
export const anthropic = (options: AnthropicModelAdapterOptions = {}) =>
  new AnthropicModelAdapter(options);
function content(value: string | { type: string; text?: string }[]): string {
  return typeof value === 'string'
    ? value
    : value
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('');
}
function object(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function usageOf(value: unknown): ModelUsage | undefined {
  const data = object(value);
  if (!data) return undefined;
  const inputTokens = data.input_tokens;
  const outputTokens = data.output_tokens;
  return typeof inputTokens === 'number' || typeof outputTokens === 'number'
    ? {
        ...(typeof inputTokens === 'number' ? { inputTokens } : {}),
        ...(typeof outputTokens === 'number' ? { outputTokens } : {}),
        totalTokens:
          (typeof inputTokens === 'number' ? inputTokens : 0) +
          (typeof outputTokens === 'number' ? outputTokens : 0),
      }
    : undefined;
}
function result(payload: JsonObject): ModelResult {
  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const content = blocks
    .map(object)
    .filter(Boolean)
    .filter((block) => block?.type === 'text')
    .map((block) => text(block?.text) ?? '')
    .join('');
  return {
    id: text(payload.id),
    model: text(payload.model),
    content,
    finishReason:
      text(payload.stop_reason) === 'max_tokens' ? 'length' : 'stop',
    ...(usageOf(payload.usage) ? { usage: usageOf(payload.usage) } : {}),
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
        const parsed = object(JSON.parse(line.slice(5).trim()));
        if (parsed) yield parsed;
      }
  }
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
