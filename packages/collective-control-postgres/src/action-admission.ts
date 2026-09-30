import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { defaultPostgresSchema, normalizePostgresIdentifier, quotePostgresIdentifier,
  runPostgresMigrations } from '@agentplat/postgres';
import { assertActionApprovalAdmissionV1, validateActionAdmissionStateV1, type ActionApprovalAdmissionGuardV1, type ActionAdmissionStateV1,
  type ActionAdmissionStoreV1 } from '@agentplat/inference-control/action-admission';
import type { ActionApprovalRecordV1 } from '@agentplat/inference-control/action-approvals';
import { controlDigest, type ControlJson } from '@agentplat/inference-control/tools';

export async function runActionAdmissionMigrationsV1(pool: Pool,
  options: { readonly schema?: string; readonly createSchema?: boolean } = {}) {
  const up = await readFile(new URL('../migrations/001_action_admission.up.sql', import.meta.url), 'utf8');
  const down = await readFile(new URL('../migrations/001_action_admission.down.sql', import.meta.url), 'utf8');
  return runPostgresMigrations(pool, {
    applicationId: '@agentplat/collective-control-postgres/action-admission',
    schema: options.schema, createSchema: options.createSchema,
    migrations: [{ version: 1, name: '001_action_admission', up, down, destructiveDown: true }],
  });
}
/** Row locking serializes fence changes, shared budgets and receipts per tenant. */
export class PostgresActionAdmissionStoreV1 implements ActionAdmissionStoreV1 {
  private readonly table: string;
  private readonly approvalTable: string;
  readonly tenantId: string;
  constructor(private readonly pool: Pool, options: { readonly schema?: string; readonly tenantId: string }) {
    if (!options.tenantId.trim()) throw new TypeError('admission_tenant_required');
    this.tenantId = options.tenantId;
    const prefix = quotePostgresIdentifier(normalizePostgresIdentifier(options.schema ?? defaultPostgresSchema, 'schema'));
    this.table = `${prefix}.action_admission_states_v1`;
    this.approvalTable = `${prefix}.action_approvals_v1`;
  }
  async transaction<T>(tenantId: string, operation: (state: ActionAdmissionStateV1) => {
    readonly state: ActionAdmissionStateV1; readonly result: T;
  }, approval?: ActionApprovalAdmissionGuardV1): Promise<T> {
    if (tenantId !== this.tenantId) throw new Error('admission_scope_mismatch');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const initial: ActionAdmissionStateV1 = { tenantId, highWaterMs: 0, fences: [], budgets: [], effects: [] };
      await client.query(`INSERT INTO ${this.table} (tenant_id, record, record_digest)
        VALUES ($1,$2::jsonb,$3) ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId, JSON.stringify(initial), controlDigest('grant', initial as unknown as ControlJson)]);
      const { rows } = await client.query<{ record: ActionAdmissionStateV1; record_digest: string }>(
        `SELECT record, record_digest FROM ${this.table} WHERE tenant_id=$1 FOR UPDATE`, [tenantId]);
      const current = rows[0];
      validateActionAdmissionStateV1(current.record);
      if (current.record.tenantId !== tenantId || controlDigest('grant', current.record as unknown as ControlJson) !== current.record_digest)
        throw new Error('admission_state_corrupt');
      if (approval) {
        const result = await client.query<{ record: ActionApprovalRecordV1; record_digest: string }>(
          `SELECT record, record_digest FROM ${this.approvalTable} WHERE tenant_id=$1 AND approval_id=$2 FOR UPDATE`,
          [tenantId, approval.approvalId]);
        const row = result.rows[0];
        if (row && controlDigest('grant', row.record as unknown as ControlJson) !== row.record_digest)
          throw new Error('action_approval_corrupt');
        assertActionApprovalAdmissionV1(row?.record, tenantId, approval);
      }
      const next = operation(structuredClone(current.record));
      validateActionAdmissionStateV1(next.state);
      if (next.state.tenantId !== tenantId) throw new Error('admission_scope_mismatch');
      await client.query(`UPDATE ${this.table} SET record=$2::jsonb, record_digest=$3 WHERE tenant_id=$1`,
        [tenantId, JSON.stringify(next.state), controlDigest('grant', next.state as unknown as ControlJson)]);
      await client.query('COMMIT');
      return structuredClone(next.result);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
