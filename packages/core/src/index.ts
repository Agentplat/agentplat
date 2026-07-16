export type AgentPlatID = string;
export type ISODateTime = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export type Metadata = Record<string, JsonValue>;

export type LifecycleStatus =
  | 'draft'
  | 'active'
  | 'inactive'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'
  | 'input_required'
  | 'auth_required'
  | 'suspended'
  | 'archived';

export interface TenantScoped {
  tenantId: AgentPlatID;
}

export interface Timestamped {
  createdAt?: ISODateTime;
  updatedAt?: ISODateTime;
}

export interface ActorContext {
  actorId?: AgentPlatID;
  actorType: 'human' | 'machine' | 'system';
  email?: string;
  roles?: string[];
}

export interface TenantContext extends TenantScoped {
  organizationId?: AgentPlatID;
  workspaceId?: AgentPlatID;
  actor?: ActorContext;
}

export interface ResourceRef {
  type: string;
  id: AgentPlatID;
  tenantId?: AgentPlatID;
}

export interface PageInfo {
  page: number;
  limit: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string;
}

export interface ApiEnvelope<T> {
  data: T;
  pagination?: PageInfo;
  requestId?: string;
}

export type AgentPlatErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'ADAPTER_ERROR';

export class AgentPlatError extends Error {
  readonly code: AgentPlatErrorCode;
  readonly statusCode?: number;
  readonly details?: unknown;

  constructor(
    code: AgentPlatErrorCode,
    message: string,
    options: { statusCode?: number; details?: unknown } = {}
  ) {
    super(message);
    this.name = 'AgentPlatError';
    this.code = code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}
