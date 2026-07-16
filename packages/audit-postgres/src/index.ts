import { redactAuditDetails } from '@agentplat/audit';
import type { AuditRecord, AuditSink } from '@agentplat/audit';
import type { JsonObject } from '@agentplat/core';
import {
  defaultPostgresSchema,
  qualifyPostgresName,
} from '@agentplat/postgres';
import type { SessionEventRecord, SessionEventSink } from '@agentplat/sessions';
import type { Pool } from 'pg';

export {
  auditMigrationDirectory,
  auditRollbackConfirmation,
  getAuditMigrationStatus,
  rollbackAuditMigrations,
  runAuditMigrations,
} from './migrations.js';
export type { AuditPostgresMigrationOptions } from './migrations.js';

export interface PostgresSinkOptions {
  schema?: string;
}

/** Append-only, redacting PostgreSQL AuditSink. */
export class PostgresAuditSink implements AuditSink {
  private readonly table: string;

  constructor(
    private readonly pool: Pool,
    options: PostgresSinkOptions = {}
  ) {
    this.table = qualifyPostgresName(
      options.schema ?? defaultPostgresSchema,
      'audit_records'
    );
  }

  async write(record: AuditRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table} (
         tenant_id, id, actor_id, actor_type, action, resource, details,
         ip_address, user_agent, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [
        record.tenantId,
        record.id,
        record.actorId ?? null,
        record.actorType ?? null,
        record.action,
        JSON.stringify(record.resource),
        JSON.stringify(
          record.details ? redactAuditDetails(record.details) : {}
        ),
        record.ipAddress ?? null,
        record.userAgent ?? null,
        record.createdAt,
      ]
    );
  }
}

/** Durable SessionEventSink that does not require any Agent Room tables. */
export class PostgresSessionEventSink implements SessionEventSink {
  private readonly table: string;

  constructor(
    private readonly pool: Pool,
    options: PostgresSinkOptions = {}
  ) {
    this.table = qualifyPostgresName(
      options.schema ?? defaultPostgresSchema,
      'session_events'
    );
  }

  async append(record: SessionEventRecord): Promise<void> {
    const event = redactAuditDetails(record.event as unknown as JsonObject);
    await this.pool.query(
      `INSERT INTO ${this.table} (
         tenant_id, session_id, sequence, event_id, occurred_at, event
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (tenant_id, event_id) DO NOTHING`,
      [
        record.tenantId,
        record.sessionId,
        record.sequence,
        record.eventId,
        record.occurredAt,
        JSON.stringify(event),
      ]
    );
  }
}

export function createPostgresAuditSink(
  pool: Pool,
  options?: PostgresSinkOptions
): PostgresAuditSink {
  return new PostgresAuditSink(pool, options);
}

export function createPostgresSessionEventSink(
  pool: Pool,
  options?: PostgresSinkOptions
): PostgresSessionEventSink {
  return new PostgresSessionEventSink(pool, options);
}
