import { AgentPlatError } from '@agentplat/core';
import type {
  AgentPlatID,
  JsonObject,
  Metadata,
  TenantContext,
  TenantScoped,
  Timestamped,
} from '@agentplat/core';
import type { ToolRegistry } from '@agentplat/tools';
import type { RunStatus } from '@agentplat/workflows';

export {
  ChatAgentProvider,
  type ChatAgentProviderOptions,
} from './chat-agent-provider.js';

export interface AgentDefinition extends TenantScoped, Timestamped {
  id: AgentPlatID;
  name: string;
  description?: string;
  instructions?: string;
  platform: string;
  modelName?: string;
  config?: JsonObject;
  capabilities?: JsonObject;
  skills?: JsonObject;
  memoryEnabled?: boolean;
  metadata?: Metadata;
}

export interface RuntimeExecutionContext {
  tenant: TenantContext;
  /**
   * Stable idempotency key for this execution. Side-effecting providers should
   * reuse it when retrying downstream operations.
   */
  runId?: AgentPlatID;
  agentId: AgentPlatID;
  /** Cooperative cancellation signal for timeouts and lost execution leases. */
  signal?: AbortSignal;
  credentials?: Record<string, string>;
  policies?: JsonObject;
  tools?: ToolRegistry;
  metadata?: Metadata;
}

export interface AgentRunInput {
  /** Plain text or provider-neutral structured input items. */
  input: string | JsonObject[];
  mode?: 'invoke' | 'chat';
  conversationId?: AgentPlatID;
  attachments?: JsonObject[];
  metadata?: Metadata;
}

export interface AgentRunResult {
  runId?: AgentPlatID;
  conversationId?: AgentPlatID;
  status: RunStatus;
  output?: string;
  result?: JsonObject;
  errorMessage?: string;
  metadata?: Metadata;
}

/** Minimal event shape accepted by AgentPlat stream transports. */
export interface StreamEvent<
  TType extends string = string,
  TPayload extends JsonObject = JsonObject,
> {
  type: TType;
  runId?: AgentPlatID;
  content?: string;
  payload?: TPayload;
}

/** Normalized token accounting carried by completed runtime events. */
export type AgentUsage = JsonObject & {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

/** Provider-neutral details emitted when an agent run completes. */
export type AgentCompletionPayload = JsonObject & {
  id?: AgentPlatID;
  model?: string;
  finishReason?: string;
  usage?: AgentUsage;
  latencyMs?: number;
  toolCalls?: JsonObject[];
};

/** Discriminated events emitted by one agent runtime execution. */
export type AgentStreamEvent =
  | StreamEvent<'started'>
  | (StreamEvent<'token'> & { content: string })
  | StreamEvent<'tool_call'>
  | StreamEvent<'tool_result'>
  | StreamEvent<'completed', AgentCompletionPayload>
  | (StreamEvent<'failed'> & { content: string });

export interface AgentProvider {
  run(
    agent: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): Promise<AgentRunResult>;
  stream?(
    agent: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): AsyncIterable<AgentStreamEvent>;
}

export interface AgentRuntime {
  registerProvider(platform: string, provider: AgentProvider): void;
  /** Optional capability used by higher-level composition validation. */
  hasProvider?(platform: string): boolean;
  run(
    agent: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): Promise<AgentRunResult>;
  stream(
    agent: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): AsyncIterable<AgentStreamEvent>;
}

/** Register a map of provider-neutral platforms on any AgentPlat runtime. */
export function registerRuntimeProviders(
  runtime: AgentRuntime,
  providers: Record<string, AgentProvider>
): void {
  for (const [platform, provider] of Object.entries(providers)) {
    runtime.registerProvider(platform, provider);
  }
}

export class DefaultAgentRuntime implements AgentRuntime {
  private readonly providers = new Map<string, AgentProvider>();

  registerProvider(platform: string, provider: AgentProvider): void {
    const normalizedPlatform = platform.trim().toLowerCase();
    if (!normalizedPlatform) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'Provider platform is required'
      );
    }
    this.providers.set(normalizedPlatform, provider);
  }

  /** Register several named platforms without coupling the runtime to vendor SDKs. */
  registerAll(providers: Record<string, AgentProvider>): void {
    registerRuntimeProviders(this, providers);
  }

  hasProvider(platform: string): boolean {
    return this.providers.has(platform.trim().toLowerCase());
  }

  async run(
    agent: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): Promise<AgentRunResult> {
    return this.providerFor(agent.platform).run(agent, input, context);
  }

  async *stream(
    agent: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): AsyncIterable<AgentStreamEvent> {
    const provider = this.providerFor(agent.platform);
    if (!provider.stream) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        `Provider "${agent.platform}" does not support streaming`
      );
    }
    yield* provider.stream(agent, input, context);
  }

  private providerFor(platform: string): AgentProvider {
    const provider = this.providers.get(platform.trim().toLowerCase());
    if (!provider) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        `No provider registered for platform "${platform}"`
      );
    }
    return provider;
  }
}
