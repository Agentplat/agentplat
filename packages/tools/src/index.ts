import type { AgentPlatID, JsonObject, JsonValue, Metadata, TenantContext } from '@agentplat/core';

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
  invoke(input: JsonObject, context: ToolInvocationContext): Promise<ToolInvocationResult>;
}

export interface ToolRegistry {
  register(definition: ToolDefinition, handler: ToolHandler): Promise<void>;
  get(toolId: AgentPlatID): Promise<{ definition: ToolDefinition; handler: ToolHandler } | undefined>;
  list(): Promise<ToolDefinition[]>;
}
