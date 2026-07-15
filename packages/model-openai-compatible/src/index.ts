import { AgentPlatError } from '@agentplat/core';
import type { JsonObject, JsonValue, Metadata } from '@agentplat/core';
import type {
  ChatMessage,
  ModelAdapter,
  ModelAdapterCapabilities,
  ModelExecutionContext,
  ModelFinishReason,
  ModelRequest,
  ModelResult,
  ModelStreamEvent,
  ModelToolCall,
  ModelUsage,
} from '@agentplat/model';

const defaultBaseURL = 'https://api.openai.com/v1';

/** Resolve an API key for a single model execution. */
export type OpenAICompatibleApiKeyResolver = (
  context: ModelExecutionContext
) => Promise<string | undefined> | string | undefined;

/** Configuration for an OpenAI-compatible Chat Completions endpoint. */
export interface OpenAICompatibleModelAdapterOptions {
  apiKey?: string;
  apiKeyResolver?: OpenAICompatibleApiKeyResolver;
  baseURL?: string;
  defaultModel?: string;
  /** Defaults to true for api.openai.com and false for custom base URLs. */
  requireApiKey?: boolean;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
  capabilities?: Partial<ModelAdapterCapabilities>;
}

/** Well-known OpenAI Chat Completions-compatible endpoints. */
export type ChatModelProvider =
  'openai' | 'gemini' | 'ollama' | 'openrouter' | 'compatible';

/**
 * A concise configuration for a Chat Completions-compatible model.
 *
 * Use `compatible` for a self-hosted or vendor endpoint not represented by a
 * preset. This factory intentionally only covers the portable Chat
 * Completions protocol; providers with a different wire protocol can be
 * supplied through the public `ModelAdapter` interface instead.
 */
export interface ChatModelOptions extends Omit<
  OpenAICompatibleModelAdapterOptions,
  'baseURL' | 'requireApiKey'
> {
  provider: ChatModelProvider;
  baseURL?: string;
  requireApiKey?: boolean;
}

/**
 * Direct Chat Completions adapter for OpenAI-compatible HTTP servers.
 *
 * It performs no agent loop and never reads environment variables implicitly.
 * Credentials are supplied at construction or in `ModelExecutionContext`.
 */
export class OpenAICompatibleModelAdapter implements ModelAdapter {
  readonly id = 'openai-compatible';
  readonly capabilities: ModelAdapterCapabilities;
  private readonly baseURL: string;
  private readonly fetchImplementation: typeof globalThis.fetch;

  constructor(
    private readonly options: OpenAICompatibleModelAdapterOptions = {}
  ) {
    this.baseURL = (options.baseURL ?? defaultBaseURL).replace(/\/+$/, '');
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!this.fetchImplementation) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        'A fetch implementation is required by the OpenAI-compatible adapter'
      );
    }
    this.capabilities = {
      streaming: true,
      tools: true,
      structuredOutput: true,
      vision: true,
      ...options.capabilities,
    };
  }

  async generate(
    request: ModelRequest,
    context: ModelExecutionContext
  ): Promise<ModelResult> {
    const response = await this.request(request, context, false);
    const payload = await readJson(response);
    return parseCompletion(payload);
  }

  async *stream(
    request: ModelRequest,
    context: ModelExecutionContext
  ): AsyncIterable<ModelStreamEvent> {
    try {
      const response = await this.request(request, context, true);
      if (!response.body) {
        throw new AgentPlatError(
          'ADAPTER_ERROR',
          'The compatible endpoint returned no streaming body'
        );
      }

      yield {
        type: 'started',
        model: request.model ?? this.options.defaultModel,
      };
      const decoder = new TextDecoder();
      let buffer = '';
      let output = '';
      let id: string | undefined;
      let model: string | undefined;
      let finishReason: ModelFinishReason = 'unknown';
      let usage: ModelUsage | undefined;
      const pendingCalls = new Map<
        number,
        { id?: string; name?: string; arguments: string }
      >();

      for await (const chunk of response.body) {
        if (context.signal?.aborted) throw abortError(context.signal);
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const data = sseData(line);
          if (data === undefined || data === '[DONE]') continue;
          const event = parseObject(data, 'stream chunk');
          id = stringValue(event.id) ?? id;
          model = stringValue(event.model) ?? model;
          usage = parseUsage(event.usage) ?? usage;
          const choice = firstChoice(event);
          if (!choice) continue;
          finishReason = normalizeFinishReason(choice.finish_reason);
          const delta = objectValue(choice.delta);
          const content = stringValue(delta?.content);
          if (content) {
            output += content;
            yield { type: 'text_delta', content };
          }
          collectToolCallDeltas(delta?.tool_calls, pendingCalls);
        }
      }

      for (const call of completeToolCalls(pendingCalls)) {
        yield { type: 'tool_call', call };
      }
      const result: ModelResult = {
        id,
        model,
        content: output,
        finishReason,
        ...(pendingCalls.size > 0
          ? { toolCalls: completeToolCalls(pendingCalls) }
          : {}),
        ...(usage ? { usage } : {}),
      };
      yield { type: 'completed', result };
    } catch (error) {
      const adapterError = toAdapterError(error);
      yield { type: 'failed', errorMessage: adapterError.message };
      throw adapterError;
    }
  }

  private async request(
    request: ModelRequest,
    context: ModelExecutionContext,
    stream: boolean
  ): Promise<Response> {
    if (context.signal?.aborted) throw abortError(context.signal);
    const model = request.model ?? this.options.defaultModel;
    if (!model?.trim()) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'A model is required for OpenAI-compatible generation'
      );
    }
    if (request.messages.length === 0) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'At least one model message is required'
      );
    }
    const apiKey = await this.resolveApiKey(context);
    const body = requestBody(request, model, stream);
    const response = await this.fetchImplementation(
      `${this.baseURL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...this.options.headers,
        },
        body: JSON.stringify(body),
        signal: context.signal,
      }
    );
    if (!response.ok) {
      const details = (await response.text()).slice(0, 1_000);
      throw new AgentPlatError(
        response.status === 401 ? 'UNAUTHORIZED' : 'ADAPTER_ERROR',
        `OpenAI-compatible endpoint returned HTTP ${response.status}`,
        {
          statusCode: response.status,
          details: details || undefined,
        }
      );
    }
    return response;
  }

  private async resolveApiKey(
    context: ModelExecutionContext
  ): Promise<string | undefined> {
    const apiKey =
      (await this.options.apiKeyResolver?.(context)) ??
      context.credentials?.openaiApiKey ??
      context.credentials?.apiKey ??
      this.options.apiKey;
    const required =
      this.options.requireApiKey ?? this.baseURL === defaultBaseURL;
    if (required && !apiKey?.trim()) {
      throw new AgentPlatError(
        'UNAUTHORIZED',
        'An API key is required for this compatible endpoint',
        { statusCode: 401 }
      );
    }
    return apiKey?.trim() || undefined;
  }
}

/** Create an OpenAI-compatible model adapter without `new`. */
export function openAICompatible(
  options: OpenAICompatibleModelAdapterOptions = {}
): OpenAICompatibleModelAdapter {
  return new OpenAICompatibleModelAdapter(options);
}

/**
 * Create a model adapter from a named provider preset.
 *
 * This is the recommended quickstart API for OpenAI, Gemini, Ollama and
 * OpenRouter. It has no SDK dependency and callers can always override the
 * endpoint or headers when their deployment requires it.
 */
export function chatModel(
  options: ChatModelOptions
): OpenAICompatibleModelAdapter {
  const preset = chatModelPreset(options.provider);
  if (options.provider === 'compatible' && !options.baseURL?.trim()) {
    throw new AgentPlatError(
      'VALIDATION_ERROR',
      'baseURL is required when provider is "compatible"'
    );
  }
  return openAICompatible({
    ...options,
    baseURL: options.baseURL ?? preset.baseURL,
    requireApiKey: options.requireApiKey ?? preset.requireApiKey,
  });
}

function chatModelPreset(provider: ChatModelProvider): {
  baseURL: string;
  requireApiKey: boolean;
} {
  switch (provider) {
    case 'openai':
      return { baseURL: defaultBaseURL, requireApiKey: true };
    case 'gemini':
      return {
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        requireApiKey: true,
      };
    case 'ollama':
      return { baseURL: 'http://localhost:11434/v1', requireApiKey: false };
    case 'openrouter':
      return { baseURL: 'https://openrouter.ai/api/v1', requireApiKey: true };
    case 'compatible':
      return { baseURL: '', requireApiKey: false };
  }
}

function requestBody(
  request: ModelRequest,
  model: string,
  stream: boolean
): JsonObject {
  const body: JsonObject = {
    model,
    messages: request.messages.map(toWireMessage),
    stream,
  };
  if (request.options?.temperature !== undefined) {
    body.temperature = request.options.temperature;
  }
  if (request.options?.maxOutputTokens !== undefined) {
    body.max_completion_tokens = request.options.maxOutputTokens;
  }
  if (request.options?.stop) body.stop = request.options.stop;
  if (request.options?.responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }
  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }
  return body;
}

function toWireMessage(message: ChatMessage): JsonObject {
  const wire: JsonObject = {
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part): JsonObject => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            }
            const image: JsonObject = { url: part.url };
            if (part.detail) image.detail = part.detail;
            return { type: 'image_url', image_url: image };
          }),
  };
  if (message.name) wire.name = message.name;
  if (message.toolCallId) wire.tool_call_id = message.toolCallId;
  return wire;
}

async function readJson(response: Response): Promise<JsonObject> {
  const value: unknown = await response.json();
  if (!isObject(value)) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'The compatible endpoint returned an invalid JSON object'
    );
  }
  return value as JsonObject;
}

function parseCompletion(payload: JsonObject): ModelResult {
  const choice = firstChoice(payload);
  if (!choice) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'The compatible endpoint returned no completion choice'
    );
  }
  const message = objectValue(choice.message);
  const toolCalls = parseToolCalls(message?.tool_calls);
  const usage = parseUsage(payload.usage);
  return {
    id: stringValue(payload.id),
    model: stringValue(payload.model),
    content: stringValue(message?.content) ?? '',
    finishReason: normalizeFinishReason(choice.finish_reason),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(usage ? { usage } : {}),
    metadata: responseMetadata(payload),
  };
}

function firstChoice(payload: JsonObject): JsonObject | undefined {
  const choices = payload.choices;
  if (!Array.isArray(choices)) return undefined;
  return objectValue(choices[0]);
}

function parseToolCalls(value: JsonValue | undefined): ModelToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const call = objectValue(item);
    const fn = objectValue(call?.function);
    const id = stringValue(call?.id);
    const name = stringValue(fn?.name);
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        arguments: parseArguments(stringValue(fn?.arguments) ?? '{}'),
      },
    ];
  });
}

function collectToolCallDeltas(
  value: JsonValue | undefined,
  calls: Map<number, { id?: string; name?: string; arguments: string }>
): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const delta = objectValue(item);
    if (!delta) continue;
    const index = numberValue(delta.index) ?? 0;
    const current = calls.get(index) ?? { arguments: '' };
    const fn = objectValue(delta.function);
    current.id = stringValue(delta.id) ?? current.id;
    current.name = stringValue(fn?.name) ?? current.name;
    current.arguments += stringValue(fn?.arguments) ?? '';
    calls.set(index, current);
  }
}

function completeToolCalls(
  calls: Map<number, { id?: string; name?: string; arguments: string }>
): ModelToolCall[] {
  return [...calls.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, call]) =>
      call.id && call.name
        ? [
            {
              id: call.id,
              name: call.name,
              arguments: parseArguments(call.arguments || '{}'),
            },
          ]
        : []
    );
}

function parseArguments(value: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed)
      ? (parsed as JsonObject)
      : { value: parsed as JsonValue };
  } catch {
    return { raw: value };
  }
}

function parseUsage(value: JsonValue | undefined): ModelUsage | undefined {
  const usage = objectValue(value);
  if (!usage) return undefined;
  const normalized: ModelUsage = {
    inputTokens: numberValue(usage.prompt_tokens),
    outputTokens: numberValue(usage.completion_tokens),
    totalTokens: numberValue(usage.total_tokens),
  };
  return Object.values(normalized).some((item) => item !== undefined)
    ? normalized
    : undefined;
}

function responseMetadata(payload: JsonObject): Metadata | undefined {
  const fingerprint = stringValue(payload.system_fingerprint);
  const tier = stringValue(payload.service_tier);
  if (!fingerprint && !tier) return undefined;
  return {
    ...(fingerprint ? { systemFingerprint: fingerprint } : {}),
    ...(tier ? { serviceTier: tier } : {}),
  };
}

function normalizeFinishReason(
  value: JsonValue | undefined
): ModelFinishReason {
  switch (value) {
    case 'stop':
    case 'length':
    case 'tool_calls':
    case 'content_filter':
      return value;
    default:
      return 'unknown';
  }
}

function sseData(line: string): string | undefined {
  if (!line.startsWith('data:')) return undefined;
  return line.slice(5).trimStart();
}

function parseObject(value: string, label: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value);
    if (isObject(parsed)) return parsed as JsonObject;
  } catch {
    // The stable adapter error below intentionally excludes response content.
  }
  throw new AgentPlatError(
    'ADAPTER_ERROR',
    `The compatible endpoint returned an invalid ${label}`
  );
}

function objectValue(value: unknown): JsonObject | undefined {
  return isObject(value) ? (value as JsonObject) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function abortError(signal: AbortSignal): AgentPlatError {
  return new AgentPlatError(
    'ADAPTER_ERROR',
    signal.reason instanceof Error
      ? signal.reason.message
      : 'Model request aborted'
  );
}

function toAdapterError(error: unknown): AgentPlatError {
  if (error instanceof AgentPlatError) return error;
  if (error instanceof Error) {
    return new AgentPlatError('ADAPTER_ERROR', error.message, {
      details: error,
    });
  }
  return new AgentPlatError('ADAPTER_ERROR', 'Model adapter request failed');
}
