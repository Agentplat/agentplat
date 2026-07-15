import { AgentPlatError } from '@agentplat/core';
import type { JsonObject, JsonValue } from '@agentplat/core';
import type {
  ChatMessage,
  ModelAdapter,
  ModelGenerationOptions,
  ModelRequest,
  ModelResult,
} from '@agentplat/model';
import type {
  AgentCompletionPayload,
  AgentDefinition,
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  AgentStreamEvent,
  RuntimeExecutionContext,
} from './index.js';

/** Configuration for the single-generation chat provider. */
export interface ChatAgentProviderOptions {
  defaultModel?: string;
  /** Override how runtime input becomes provider-neutral chat messages. */
  messageMapper?: (
    agent: AgentDefinition,
    input: AgentRunInput
  ) => ChatMessage[];
}

/**
 * Adapts a direct `ModelAdapter` to the higher-level `AgentProvider` contract.
 *
 * This provider performs one model generation and deliberately does not own a
 * tool loop, handoffs or durable memory. Use a full agent provider for those
 * orchestration capabilities.
 */
export class ChatAgentProvider implements AgentProvider {
  constructor(
    private readonly adapter: ModelAdapter,
    private readonly options: ChatAgentProviderOptions = {}
  ) {}

  async run(
    agent: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): Promise<AgentRunResult> {
    const startedAt = performance.now();
    const result = await this.adapter.generate(
      this.request(agent, input),
      this.executionContext(context)
    );
    return this.toRunResult(
      result,
      input,
      context,
      elapsedMilliseconds(startedAt)
    );
  }

  async *stream(
    agent: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): AsyncIterable<AgentStreamEvent> {
    if (!this.adapter.stream) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        `Model adapter "${this.adapter.id}" does not support streaming`
      );
    }

    const startedAt = performance.now();
    let started = false;
    for await (const event of this.adapter.stream(
      this.request(agent, input),
      this.executionContext(context)
    )) {
      if (!started && event.type !== 'started') {
        started = true;
        yield { type: 'started', runId: context.runId };
      }
      switch (event.type) {
        case 'started':
          if (!started) {
            started = true;
            yield { type: 'started', runId: context.runId };
          }
          break;
        case 'text_delta':
          yield {
            type: 'token',
            runId: context.runId,
            content: event.content,
          };
          break;
        case 'tool_call':
          yield {
            type: 'tool_call',
            runId: context.runId,
            payload: {
              id: event.call.id,
              name: event.call.name,
              arguments: event.call.arguments,
            },
          };
          break;
        case 'completed':
          yield {
            type: 'completed',
            runId: context.runId,
            content: event.result.content,
            payload: this.resultPayload(
              event.result,
              elapsedMilliseconds(startedAt)
            ),
          };
          break;
        case 'failed':
          yield {
            type: 'failed',
            runId: context.runId,
            content: event.errorMessage,
          };
          break;
      }
    }
  }

  private request(agent: AgentDefinition, input: AgentRunInput): ModelRequest {
    const configured = this.modelOptions(agent.config);
    return {
      messages:
        this.options.messageMapper?.(agent, input) ??
        defaultMessages(agent, input),
      model: agent.modelName ?? this.options.defaultModel,
      ...(configured ? { options: configured } : {}),
    };
  }

  private executionContext(context: RuntimeExecutionContext) {
    return {
      tenant: context.tenant,
      requestId: context.runId,
      signal: context.signal,
      credentials: context.credentials,
      metadata: context.metadata,
    };
  }

  private modelOptions(
    config: JsonObject | undefined
  ): ModelGenerationOptions | undefined {
    if (!config) return undefined;
    const options: ModelGenerationOptions = {};
    if (typeof config.temperature === 'number') {
      options.temperature = config.temperature;
    }
    if (
      typeof config.maxOutputTokens === 'number' &&
      Number.isInteger(config.maxOutputTokens) &&
      config.maxOutputTokens > 0
    ) {
      options.maxOutputTokens = config.maxOutputTokens;
    }
    if (config.responseFormat === 'text' || config.responseFormat === 'json') {
      options.responseFormat = config.responseFormat;
    }
    return Object.keys(options).length > 0 ? options : undefined;
  }

  private toRunResult(
    result: ModelResult,
    input: AgentRunInput,
    context: RuntimeExecutionContext,
    latencyMs: number
  ): AgentRunResult {
    return {
      runId: context.runId,
      conversationId: input.conversationId,
      status: 'completed',
      output: result.content,
      result: this.resultPayload(result, latencyMs),
      metadata: {
        ...(result.metadata ?? {}),
        provider: 'chat',
        adapter: this.adapter.id,
        latencyMs,
        ...(result.model ? { model: result.model } : {}),
      },
    };
  }

  private resultPayload(
    result: ModelResult,
    latencyMs: number
  ): AgentCompletionPayload {
    const payload: AgentCompletionPayload = {
      finishReason: result.finishReason,
      latencyMs,
    };
    if (result.id) payload.id = result.id;
    if (result.model) payload.model = result.model;
    if (result.usage) payload.usage = compactJson(result.usage);
    if (result.toolCalls) {
      payload.toolCalls = result.toolCalls.map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
      }));
    }
    return payload;
  }
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
}

function defaultMessages(
  agent: AgentDefinition,
  input: AgentRunInput
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (agent.instructions?.trim()) {
    messages.push({ role: 'developer', content: agent.instructions.trim() });
  }
  if (typeof input.input === 'string') {
    messages.push({ role: 'user', content: input.input });
    return messages;
  }
  for (const item of input.input) {
    messages.push(toMessage(item));
  }
  return messages;
}

function toMessage(item: JsonObject): ChatMessage {
  const role = item.role;
  const content = item.content;
  if (
    (role === 'system' ||
      role === 'developer' ||
      role === 'user' ||
      role === 'assistant' ||
      role === 'tool') &&
    typeof content === 'string'
  ) {
    return { role, content };
  }
  return { role: 'user', content: JSON.stringify(item) };
}

function compactJson(value: object): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Record<string, JsonValue>;
}
