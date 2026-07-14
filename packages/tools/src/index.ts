import { AgentPlatError } from '@agentplat/core';
import type {
  AgentPlatID,
  JsonObject,
  JsonValue,
  Metadata,
  TenantContext,
} from '@agentplat/core';

export interface ToolParameterSchema {
  type: 'object';
  properties?: Record<string, JsonObject>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface CredentialRequirement {
  id: string;
  provider?: string;
  required: boolean;
  description?: string;
}

export interface ToolDefinition {
  id: AgentPlatID;
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  credentialRequirements?: CredentialRequirement[];
  metadata?: Metadata;
}

export interface ToolInvocationContext {
  tenant: TenantContext;
  toolId: AgentPlatID;
  runId?: AgentPlatID;
  credentials?: Record<string, string>;
  metadata?: Metadata;
}

export interface ToolInvocationResult<TValue extends JsonValue = JsonValue> {
  ok: boolean;
  value?: TValue;
  errorMessage?: string;
  metadata?: Metadata;
}

export interface ToolHandler {
  invoke(
    input: JsonObject,
    context: ToolInvocationContext
  ): Promise<ToolInvocationResult>;
}

export interface ToolRegistry {
  register(definition: ToolDefinition, handler: ToolHandler): Promise<void>;
  get(
    toolId: AgentPlatID
  ): Promise<{ definition: ToolDefinition; handler: ToolHandler } | undefined>;
  list(): Promise<ToolDefinition[]>;
}

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly entries = new Map<
    AgentPlatID,
    { definition: ToolDefinition; handler: ToolHandler }
  >();

  async register(
    definition: ToolDefinition,
    handler: ToolHandler
  ): Promise<void> {
    if (!definition.id.trim()) {
      throw new AgentPlatError('VALIDATION_ERROR', 'Tool id is required');
    }
    if (this.entries.has(definition.id)) {
      throw new AgentPlatError(
        'CONFLICT',
        `Tool "${definition.id}" is already registered`
      );
    }
    this.entries.set(definition.id, { definition, handler });
  }

  async get(
    toolId: AgentPlatID
  ): Promise<{ definition: ToolDefinition; handler: ToolHandler } | undefined> {
    return this.entries.get(toolId);
  }

  async list(): Promise<ToolDefinition[]> {
    return [...this.entries.values()].map(({ definition }) => definition);
  }
}
