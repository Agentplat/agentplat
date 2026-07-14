import type {
  AgentPlatID,
  ISODateTime,
  JsonObject,
  JsonValue,
  ResourceRef,
  TenantScoped,
} from '@agentplat/core';

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
    redacted[key] = secretKeyPattern.test(key)
      ? '[REDACTED]'
      : redactValue(value);
  }
  return redacted as T;
}

function redactValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value !== null && typeof value === 'object') {
    return redactAuditDetails(value);
  }
  return value;
}

export class InMemoryAuditSink implements AuditSink {
  private readonly records: AuditRecord[] = [];

  async write(record: AuditRecord): Promise<void> {
    this.records.push({
      ...record,
      details: record.details ? redactAuditDetails(record.details) : undefined,
    });
  }

  list(tenantId?: AgentPlatID): AuditRecord[] {
    return this.records.filter(
      (record) => tenantId === undefined || record.tenantId === tenantId
    );
  }

  clear(): void {
    this.records.length = 0;
  }
}
