import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresActionAdmissionStoreV1, runActionAdmissionMigrationsV1 }
  from '../packages/collective-control-postgres/dist/action-admission.js';
import { sharedAdmissionScenarios, snapshot, tenantId, request }
  from './helpers/action-admission-scenarios.mjs';
import { ActionAdmissionServiceV1 } from '../packages/inference-control/dist/action-admission.js';

test('PostgreSQL atomic admission persists fences, budgets and receipts across pool reopen',
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== '1' }, async () => {
  const schema = `admission_test_${randomUUID().replaceAll('-', '')}`;
  let pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
  try {
    await runActionAdmissionMigrationsV1(pool, { schema, createSchema: true });
    const store = new PostgresActionAdmissionStoreV1(pool, { schema, tenantId });
    const second = new PostgresActionAdmissionStoreV1(pool, { schema, tenantId });
    await sharedAdmissionScenarios(store, second);
    const before = await snapshot(store);
    await pool.end();
    pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
    const reopened = new PostgresActionAdmissionStoreV1(pool, { schema, tenantId });
    assert.deepEqual(await snapshot(reopened), before);
    await assert.rejects(new ActionAdmissionServiceV1(reopened).reserve(request('after-restart', { nowMs: 4 })));
    await assert.rejects(reopened.transaction('another-tenant', state => ({ state, result: null })));
    await runActionAdmissionMigrationsV1(pool, { schema });
  } finally { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); }
});
