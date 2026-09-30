import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import {
  defaultPostgresSchema, normalizePostgresIdentifier, quotePostgresIdentifier, runPostgresMigrations,
} from '@agentplat/postgres';
import {
  validateActionApprovalRecordV1, validateActionApprovalTransitionV1,
  type ActionApprovalRecordV1, type ActionApprovalRepositoryV1,
} from '@agentplat/inference-control/action-approvals';
import { controlDigest, type ControlJson } from '@agentplat/inference-control/tools';

/** Separate opt-in migration ledger: existing collective migrations are unchanged. */
export async function runActionApprovalMigrationsV1(pool: Pool, options: {
  readonly schema?: string; readonly createSchema?: boolean;
} = {}) {
  const up = await readFile(new URL('../migrations/001_action_approvals.up.sql', import.meta.url), 'utf8');
  const down = await readFile(new URL('../migrations/001_action_approvals.down.sql', import.meta.url), 'utf8');
  return runPostgresMigrations(pool, { applicationId: '@agentplat/collective-control-postgres/action-approvals',
    schema: options.schema, createSchema: options.createSchema,
    migrations: [{ version: 1, name: '001_action_approvals', up, down, destructiveDown: true }] });
}
function digest(value: unknown): string { return controlDigest('grant', value as ControlJson); }
export class PostgresActionApprovalRepositoryV1 implements ActionApprovalRepositoryV1 {
  private readonly table: string;
  readonly tenantId: string;
  constructor(private readonly pool: Pool, options: { readonly tenantId: string; readonly schema?: string }) {
    if (!options.tenantId.trim()) throw new TypeError('approval_tenant_required');
    this.tenantId = options.tenantId;
    this.table = `${quotePostgresIdentifier(normalizePostgresIdentifier(options.schema ?? defaultPostgresSchema, 'schema'))}.action_approvals_v1`;
  }
  async create(record: ActionApprovalRecordV1): Promise<ActionApprovalRecordV1> {
    validateActionApprovalRecordV1(record);
    const copy = structuredClone(record);
    if (copy.tenantId !== this.tenantId || copy.status !== 'pending') throw new Error('approval_scope_mismatch');
    await this.pool.query(`INSERT INTO ${this.table} (tenant_id, approval_id, record, record_digest)
      VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (tenant_id, approval_id) DO NOTHING`,
      [this.tenantId, copy.approvalId, JSON.stringify(copy), digest(copy)]);
    const retained = await this.load(this.tenantId, copy.approvalId);
    if (!retained) throw new Error('approval_store_unavailable');
    const initial = { ...retained, revision: 1, status: 'pending', decidedBy: null, decidedAtMs: null, boundEffectDigest: null, observedAtMs: retained.createdAtMs, closedAtMs: null };
    if (digest(initial) !== digest(copy)) throw new Error('approval_identity_conflict');
    return retained;
  }
  async load(tenantId: string, approvalId: string): Promise<ActionApprovalRecordV1 | undefined> {
    if (tenantId !== this.tenantId) throw new Error('approval_scope_mismatch');
    const result = await this.pool.query<{ record: ActionApprovalRecordV1; record_digest: string }>(
      `SELECT record, record_digest FROM ${this.table} WHERE tenant_id=$1 AND approval_id=$2`, [tenantId, approvalId]);
    const row = result.rows[0];
    if (!row) return undefined;
    validateActionApprovalRecordV1(row.record);
    if (row.record.tenantId !== tenantId || row.record.approvalId !== approvalId || digest(row.record) !== row.record_digest)
      throw new Error('approval_store_corrupt');
    return structuredClone(row.record);
  }
  async compareAndSwap(expected: ActionApprovalRecordV1, next: ActionApprovalRecordV1): Promise<boolean> {
    const old = structuredClone(expected), replacement = structuredClone(next);
    validateActionApprovalTransitionV1(old, replacement);
    if (old.tenantId !== this.tenantId) throw new Error('approval_scope_mismatch');
    const result = await this.pool.query(`UPDATE ${this.table} SET record=$4::jsonb, record_digest=$5
      WHERE tenant_id=$1 AND approval_id=$2 AND record_digest=$3 AND record=$6::jsonb`,
      [this.tenantId, old.approvalId, digest(old), JSON.stringify(replacement), digest(replacement), JSON.stringify(old)]);
    return result.rowCount === 1;
  }
}
