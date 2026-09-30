import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresActionApprovalRepositoryV1, runActionApprovalMigrationsV1 }
  from '../packages/collective-control-postgres/dist/action-approvals.js';
import { approved, grant, resolver, target, requester } from './helpers/action-approval-fixtures.mjs';

const integration = process.env.AGENTPLAT_POSTGRES_TEST === '1';
test('PostgreSQL approvals survive reopen, enforce CAS and bind one effect across connections',
  { skip: !integration }, async () => {
  const schema = `approval_test_${randomUUID().replaceAll('-', '')}`;
  let pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
  try {
    await runActionApprovalMigrationsV1(pool, { schema, createSchema: true });
    const repository = new PostgresActionApprovalRepositoryV1(pool, { schema, tenantId: 'tenant:1' });
    const { record, service } = await approved(repository);
    await assert.rejects(repository.load('tenant:2', 'approval:1'));
    await pool.end();
    pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
    const reopened = new PostgresActionApprovalRepositoryV1(pool, { schema, tenantId: 'tenant:1' });
    assert.deepEqual(await reopened.load('tenant:1', record.approvalId), record);
    const second = new PostgresActionApprovalRepositoryV1(pool, { schema, tenantId: 'tenant:1' });
    const results = await Promise.all([resolver(reopened).consumeCurrent(grant(record, 'one'), 3),
      resolver(second).consumeCurrent(grant(record, 'two'), 3)]);
    assert.equal(results.filter(Boolean).length, 1);
    const old = await reopened.load('tenant:1', record.approvalId);
    const invalidated = { ...old, revision: old.revision + 1, status: 'invalidated', observedAtMs: 4, closedAtMs: 4 };
    assert.equal(await reopened.compareAndSwap(old, invalidated), true);
    assert.equal(await second.compareAndSwap(old, invalidated), false);
    assert.equal(await resolver(reopened).consumeCurrent(grant(record, results[0] ? 'one' : 'two'), 5), false);
    // Verify the opt-in migration is idempotent and does not create collective tables.
    await runActionApprovalMigrationsV1(pool, { schema });
    const table = await pool.query('SELECT to_regclass($1) AS value', [`${schema}.collective_action_grants`]);
    assert.equal(table.rows[0].value, null);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
