import type {
  AgentPlatID,
  JsonObject,
  Metadata,
  TenantContext,
} from '@agentplat/core';

/** A provider-neutral role in a model conversation. */
export type ChatRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool';

/** A text part in a multimodal message. */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/** A remote image reference. Providers decide which URL schemes they accept. */
export interface ImageContentPart {
  type: 'image_url';
  url: string;
  detail?: 'auto' | 'low' | 'high';
}

/** A provider-neutral message content part. */
export type ModelContentPart = TextContentPart | ImageContentPart;

/** A single message passed to a model adapter. */
export interface ChatMessage {
  role: ChatRole;
  content: string | ModelContentPart[];
  name?: string;
  toolCallId?: AgentPlatID;
  metadata?: Metadata;
}

/** A function-like tool declaration exposed to a model. */
export interface ModelToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

/** A model-requested tool invocation. Execution remains an application concern. */
export interface ModelToolCall {
  id: AgentPlatID;
  name: string;
  arguments: JsonObject;
}

/** Portable response-shaping options. Unsupported options may be rejected. */
export interface ModelGenerationOptions {
  temperature?: number;
  maxOutputTokens?: number;
  stop?: string[];
  responseFormat?: 'text' | 'json';
  metadata?: Metadata;
}

/** A provider-neutral generation request. */
export interface ModelRequest {
  messages: ChatMessage[];
  model?: string;
  tools?: ModelToolDefinition[];
  options?: ModelGenerationOptions;
}

/** Normalized model token accounting when a provider reports it. */
export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** Why a model stopped generating. */
export type ModelFinishReason =
  'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | 'unknown';

/** A completed provider-neutral model result. */
export interface ModelResult {
  id?: AgentPlatID;
  model?: string;
  content: string;
  finishReason: ModelFinishReason;
  toolCalls?: ModelToolCall[];
  usage?: ModelUsage;
  metadata?: Metadata;
}

/** Execution-scoped data that must not be persisted by an adapter by default. */
export interface ModelExecutionContext {
  tenant: TenantContext;
  requestId?: AgentPlatID;
  signal?: AbortSignal;
  credentials?: Record<string, string>;
  metadata?: Metadata;
}

/** Capabilities advertised by a model adapter. */
export interface ModelAdapterCapabilities {
  streaming: boolean;
  tools: boolean;
  structuredOutput: boolean;
  vision: boolean;
}

/** Events emitted by streaming model adapters. */
export type ModelStreamEvent =
  | { type: 'started'; id?: AgentPlatID; model?: string }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call'; call: ModelToolCall }
  | { type: 'completed'; result: ModelResult }
  | { type: 'failed'; errorMessage: string };

/**
 * Lowest-level model portability boundary in AgentPlat.
 *
 * Implementations perform model I/O only. They must honor `context.signal`,
 * avoid persisting credentials, and leave agent loops and tool execution to
 * higher layers.
 */
export interface ModelAdapter {
  readonly id: string;
  readonly capabilities: ModelAdapterCapabilities;
  generate(
    request: ModelRequest,
    context: ModelExecutionContext
  ): Promise<ModelResult>;
  stream?(
    request: ModelRequest,
    context: ModelExecutionContext
  ): AsyncIterable<ModelStreamEvent>;
}
