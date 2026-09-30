import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { runMigrations, PostgresActionGrantRepositoryV1 } from '../packages/collective-control-postgres/dist/index.js';
import { runActionApprovalMigrationsV1, PostgresActionApprovalRepositoryV1 }
  from '../packages/collective-control-postgres/dist/action-approvals.js';
import { runActionAdmissionMigrationsV1, PostgresActionAdmissionStoreV1 }
  from '../packages/collective-control-postgres/dist/action-admission.js';
import { ActionAdmissionServiceV1, createActionAdmissionDispatcherV1 }
  from '../packages/inference-control/dist/action-admission.js';
import { ActionGateway, actionInputDigest, scopeDigest, issueActionGrantV1, reconcileActionGrantV1 }
  from '../packages/inference-control/dist/tools.js';
import { approved, grant as prepareGrant, resolver, scope, binding, approver }
  from './helpers/action-approval-fixtures.mjs';
import { request, fences, accounts } from './helpers/action-admission-scenarios.mjs';

const enabled = process.env.AGENTPLAT_POSTGRES_TEST === '1';
import { setup, gateway, invoke } from './helpers/action-control-fixtures.mjs';

test('persistent composed gateway reconciles committed effect after response loss without redispatch', { skip: !enabled }, async () => {
  const schema = `control_test_${randomUUID().replaceAll('-', '')}`;
  let pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
  try {
    const profile = await setup(schema, pool);
    await pool.query(`CREATE TABLE "${schema}".external_receipts (effect_id text PRIMARY KEY, request_digest text NOT NULL)`);
    const g = gateway(profile, async () => {
      const state = await profile.store.transaction(scope.tenantId, state => ({ state, result: state }));
      const receipt = state.effects[0];
      await pool.query(`INSERT INTO "${schema}".external_receipts VALUES ($1,$2)`, [receipt.request.effectId, receipt.requestDigest]);
      throw Error('external_response_lost');
    });
    await assert.rejects(invoke(g), /external_response_lost/);
    const failed = await profile.grants.loadGrant('grant:1');
    assert.equal(failed.status, 'indeterminate');
    await pool.end();
    pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
    const store = new PostgresActionAdmissionStoreV1(pool, { schema, tenantId: scope.tenantId });
    const admission = new ActionAdmissionServiceV1(store);
    const grants = new PostgresActionGrantRepositoryV1(pool, { schema, tenantId: scope.tenantId, gatewayId: 'gateway:persistent' });
    const reconciled = await admission.reconcile(scope.tenantId, 'effect:persistent', async receipt => {
      const { rows } = await pool.query(`SELECT request_digest FROM "${schema}".external_receipts WHERE effect_id=$1`, [receipt.request.effectId]);
      return rows[0]?.request_digest === receipt.requestDigest ? {
        requestDigest: receipt.requestDigest, outcome: 'succeeded', proofRef: 'verified:external:receipt' } : null;
    });
    assert.equal(reconciled.status, 'succeeded');
    await reconcileActionGrantV1(grants, { grantId: failed.grantId,
      reservationId: failed.reservation.reservationId, dispatchAttemptId: failed.reservation.dispatchAttemptId, outcome: 'dispatched' });
    assert.equal((await grants.loadGrant(failed.grantId)).status, 'dispatched');
    const state = await store.transaction(scope.tenantId, state => ({ state, result: state }));
    assert.deepEqual(state.budgets.map(x => x.usedUnits), [1, 10]);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM "${schema}".external_receipts`)).rows[0].count, 1);
    const approvals = new PostgresActionApprovalRepositoryV1(pool, { schema, tenantId: scope.tenantId });
    let redispatches = 0;
    await assert.rejects(invoke(gateway({ ...profile, grants, admission, approvals }, async () => { redispatches++; return { ok: true }; })));
    assert.equal(redispatches, 0);
  } finally { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); }
});

test('approval invalidation while quoting wins before admission, with no budget charge or effect', { skip: !enabled }, async () => {
  const schema = `control_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
  try {
    const profile = await setup(schema, pool);
    let effects = 0;
    const g = gateway(profile, async () => { effects++; return { ok: true }; }, async () => {
      await profile.approvalService.invalidate(approver, { tenantId: scope.tenantId,
        approvalId: profile.record.approvalId, targetDigest: profile.record.targetDigest, nowMs: 3 });
    });
    await assert.rejects(invoke(g), /action_approval_stale/);
    const state = await profile.store.transaction(scope.tenantId, state => ({ state, result: state }));
    assert.equal(state.effects.length, 0);
    assert.deepEqual(state.budgets.map(x => x.usedUnits), [0, 0]);
    assert.equal(effects, 0);
  } finally { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); }
});

test('persisted approval expiry survives reopening and cannot be undone with an earlier time', { skip: !enabled }, async () => {
  const schema = `control_test_${randomUUID().replaceAll('-', '')}`;
  let pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
  try {
    const profile = await setup(schema, pool);
    assert.equal(await resolver(profile.approvals).consumeCurrent(profile.grant, 1000), false);
    const expired = await profile.approvals.load(scope.tenantId, profile.record.approvalId);
    assert.equal(expired.status, 'expired');
    assert.equal(expired.decidedAtMs, profile.record.decidedAtMs);
    await pool.end();
    pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
    const reopened = new PostgresActionApprovalRepositoryV1(pool, { schema, tenantId: scope.tenantId });
    assert.equal(await resolver(reopened).consumeCurrent(profile.grant, 3), false);
    assert.deepEqual(await reopened.load(scope.tenantId, profile.record.approvalId), expired);
  } finally { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); }
});

test('conditional external write rejects a resource changed after approval and refunds only its terminal receipt', { skip: !enabled }, async () => {
  const { createConditionalActionDispatcherV1 } = await import('../packages/inference-control/dist/action-effects.js');
  const { controlDigest } = await import('../packages/inference-control/dist/tools.js');
  const schema = `control_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
  try {
    const profile = await setup(schema, pool);
    await pool.query(`CREATE TABLE "${schema}".resource (id text PRIMARY KEY, value integer NOT NULL, version integer NOT NULL)`);
    await pool.query(`INSERT INTO "${schema}".resource VALUES ('one',1,1)`);
    await pool.query(`CREATE TABLE "${schema}".conditional_receipts (idempotency_key text PRIMARY KEY, receipt jsonb NOT NULL)`);
    const conditional = createConditionalActionDispatcherV1({ dispatcherId: binding.dispatcherId, dispatcherVersion: 1,
      fencingMode: 'local_only', resolvePreconditions: async () => ({ preconditions: { version: 1 },
        approvedPreconditionsDigest: profile.record.target.preconditionsDigest }),
      port: {
        capabilities: { executorId: 'postgres:test:conditional', executorVersion: 1,
          atomicPreconditions: true, idempotency: 'durable_adapter', receiptLookup: true },
        async execute(q) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            // The fixture's destination owns both resource and receipt atomically.
            await client.query(`LOCK TABLE "${schema}".conditional_receipts IN EXCLUSIVE MODE`);
            const old = await client.query(`SELECT receipt FROM "${schema}".conditional_receipts WHERE idempotency_key=$1`, [q.permit.idempotencyKey]);
            if (old.rows[0]) { await client.query('COMMIT'); return old.rows[0].receipt; }
            const write = await client.query(`UPDATE "${schema}".resource SET value=$1, version=version+1 WHERE id='one' AND version=$2`,
              [q.input.value, q.preconditions.version]);
            const outcome = write.rowCount === 1 ? 'succeeded' : 'not_applied';
            const receipt = { schemaVersion: 1, idempotencyKey: q.permit.idempotencyKey,
              actionDigest: q.permit.actionDigest, inputDigest: actionInputDigest(q.input),
              preconditionsDigest: q.preconditionsDigest, outcome, proofRef: `destination:${q.permit.idempotencyKey}`,
              result: { ok: outcome === 'succeeded', errorMessage: outcome === 'not_applied' ? 'precondition_failed' : undefined } };
            await client.query(`INSERT INTO "${schema}".conditional_receipts VALUES ($1,$2::jsonb)`, [receipt.idempotencyKey, JSON.stringify(receipt)]);
            await client.query('COMMIT'); return receipt;
          } catch (error) { await client.query('ROLLBACK'); throw error; }
          finally { client.release(); }
        },
      },
    });
    // Change at the destination after assessment, before the conditional effect.
    const g = gateway(profile, conditional.dispatch.bind(conditional), async () => {
      await pool.query(`UPDATE "${schema}".resource SET version=2 WHERE id='one'`);
    });
    const result = await invoke(g);
    assert.equal(result.ok, false);
    assert.equal(result.errorMessage, 'precondition_failed');
    assert.equal((await pool.query(`SELECT value FROM "${schema}".resource WHERE id='one'`)).rows[0].value, 1);
    let state = await profile.store.transaction(scope.tenantId, state => ({ state, result: state }));
    assert.equal(state.effects[0].status, 'indeterminate');
    assert.deepEqual(state.budgets.map(x => x.usedUnits), [1, 10]);
    await profile.admission.reconcile(scope.tenantId, 'effect:persistent', async effect => {
      const { rows } = await pool.query(`SELECT receipt FROM "${schema}".conditional_receipts WHERE idempotency_key=$1`, [effect.request.idempotencyKey]);
      const receipt = rows[0]?.receipt;
      return receipt?.outcome === 'not_applied' && receipt.actionDigest === effect.request.actionDigest &&
        receipt.inputDigest === effect.request.inputDigest && receipt.preconditionsDigest === profile.record.target.preconditionsDigest ? {
          requestDigest: effect.requestDigest, outcome: 'not_applied', proofRef: receipt.proofRef } : null;
    });
    state = await profile.store.transaction(scope.tenantId, state => ({ state, result: state }));
    assert.deepEqual(state.budgets.map(x => x.usedUnits), [0, 0]);
    assert.equal(state.effects[0].status, 'not_applied');
  } finally { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); }
});

test('hard worker termination retains the reserved grant and requires a verified recovery fence', { skip: !enabled }, async () => {
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { recoverReservedActionGrantV1 } = await import('../packages/inference-control/dist/tools.js');
  const schema = `control_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
  try {
    const profile = await setup(schema, pool);
    await pool.query(`CREATE TABLE "${schema}".external_receipts (effect_id text PRIMARY KEY, request_digest text NOT NULL)`);
    const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers/action-control-crash-worker.mjs', import.meta.url)), schema],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostic = '';
    child.stderr.on('data', chunk => diagnostic += chunk.toString());
    const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    assert.equal(exitCode, 70, diagnostic);
    const stopped = await profile.grants.loadGrant('grant:1');
    assert.equal(stopped.status, 'reserved');
    const recovery = { grantId: stopped.grantId, reservationId: stopped.reservation.reservationId,
      dispatchAttemptId: stopped.reservation.dispatchAttemptId };
    await assert.rejects(recoverReservedActionGrantV1(profile.grants, recovery, async () => false));
    const recovered = await recoverReservedActionGrantV1(profile.grants, recovery, async () => child.exitCode === 70);
    assert.equal(recovered.status, 'indeterminate');
    const receipt = await profile.admission.reconcile(scope.tenantId, 'effect:persistent', async effect => {
      const result = await pool.query(`SELECT request_digest FROM "${schema}".external_receipts WHERE effect_id=$1`, [effect.request.effectId]);
      return result.rows[0]?.request_digest === effect.requestDigest ? {
        requestDigest: effect.requestDigest, outcome: 'succeeded', proofRef: 'receipt:stopped-worker' } : null;
    });
    assert.equal(receipt.status, 'succeeded');
    await reconcileActionGrantV1(profile.grants, { ...recovery, outcome: 'dispatched' });
    let duplicates = 0;
    await assert.rejects(invoke(gateway(profile, async () => { duplicates++; return { ok: true }; })));
    assert.equal(duplicates, 0);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM "${schema}".external_receipts`)).rows[0].count, 1);
  } finally { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); }
});
