import type { AgentPlatID, ISODateTime, JsonObject, ResourceRef, TenantScoped } from '@agentplat/core';

export interface AuditRecord extends TenantScoped {
  id: AgentPlatID;
  actorId?: AgentPlatID;
  actorType?: 'human' | 'machine' | 'system';
  action: string;
  resource: ResourceRef;
  details?: JsonObject;
  ipAddress?: string;
  userAgent?: string;
  createdAt: ISODateTime;
}

export interface AuditSink {
  write(record: AuditRecord): Promise<void>;
}

const secretKeyPattern = /(secret|token|password|api[_-]?key|clientSecret)/i;

export function redactAuditDetails<T extends JsonObject>(details: T): T {
  const redacted: JsonObject = {};
  for (const [key, value] of Object.entries(details)) {
    redacted[key] = secretKeyPattern.test(key) ? '[REDACTED]' : value;
  }
  return redacted as T;
}
