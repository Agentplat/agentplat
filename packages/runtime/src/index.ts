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
  runId?: AgentPlatID;
  agentId: AgentPlatID;
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

export interface AgentStreamEvent {
  type: 'started' | 'token' | 'tool_call' | 'completed' | 'failed';
  runId?: AgentPlatID;
  content?: string;
  payload?: JsonObject;
}

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
