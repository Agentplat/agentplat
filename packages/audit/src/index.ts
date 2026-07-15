import type {
  AgentPlatID,
  ISODateTime,
  JsonObject,
  JsonValue,
  ResourceRef,
  TenantScoped,
} from '@agentplat/core';
import type { SessionEventRecord, SessionEventSink } from '@agentplat/sessions';

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

/** Options for adapting an Agent Room-style audit sink to ephemeral sessions. */
export interface SessionAuditSinkOptions {
  audit: AuditSink;
  actorId?: AgentPlatID;
  actorType?: 'human' | 'machine' | 'system';
  actionPrefix?: string;
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

/** Create an inspectable, redacting audit sink for local development and tests. */
export function createMemoryAuditSink(): InMemoryAuditSink {
  return new InMemoryAuditSink();
}

/** Minimal log surface accepted by the development console audit sink. */
export interface AuditLogger {
  info(record: AuditRecord): void;
}

/** Writes already-redacted audit records to a supplied development logger. */
export class ConsoleAuditSink implements AuditSink {
  constructor(private readonly logger: AuditLogger = console) {}

  async write(record: AuditRecord): Promise<void> {
    this.logger.info({
      ...record,
      details: record.details ? redactAuditDetails(record.details) : undefined,
    });
  }
}

/** Create a redacting console sink for local development only. */
export function createConsoleAuditSink(logger?: AuditLogger): ConsoleAuditSink {
  return new ConsoleAuditSink(logger);
}

/**
 * Converts append-only session event records into redacted AuditRecords.
 *
 * The adapter is observational: use a session sink with `sinkFailureMode:
 * 'required'` when a caller must fail rather than continue without a trail.
 */
export class SessionAuditSink implements SessionEventSink {
  constructor(private readonly options: SessionAuditSinkOptions) {}

  async append(record: SessionEventRecord): Promise<void> {
    const actionPrefix = this.options.actionPrefix?.trim() || 'session';
    await this.options.audit.write({
      id: record.eventId,
      tenantId: record.tenantId,
      actorId: this.options.actorId,
      actorType: this.options.actorType ?? 'system',
      action: `${actionPrefix}.${record.event.type}`,
      resource: {
        type: 'agent_session',
        id: record.sessionId,
        tenantId: record.tenantId,
      },
      details: redactAuditDetails({
        sequence: record.sequence,
        occurredAt: record.occurredAt,
        event: record.event as unknown as JsonObject,
      }),
      createdAt: record.occurredAt,
    });
  }
}

/** Create a redacting `SessionEventSink` from any public audit sink. */
export function createSessionAuditSink(
  options: SessionAuditSinkOptions
): SessionAuditSink {
  return new SessionAuditSink(options);
}
