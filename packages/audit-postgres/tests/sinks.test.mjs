import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditRollbackConfirmation,
  getAuditMigrationStatus,
  PostgresAuditSink,
  PostgresSessionEventSink,
  rollbackAuditMigrations,
  runAuditMigrations,
} from '../dist/index.js';
import { checkPostgresPool, createPostgresPool } from '@agentplat/postgres';

function poolFixture() {
  const calls = [];
  return {
    calls,
    pool: {
      async query(text, values) {
        calls.push({ text, values });
        return { rows: [], rowCount: 1 };
      },
    },
  };
}

test('writes redacted audit and Session events to an isolated schema', async () => {
  const fixture = poolFixture();
  const audit = new PostgresAuditSink(fixture.pool, {
    schema: 'agentplat_orders',
  });
  await audit.write({
    id: 'audit-1',
    tenantId: 'tenant-a',
    action: 'session.started',
    resource: { type: 'agent_session', id: 'session-a' },
    details: { apiKey: 'secret', safe: 'value' },
    createdAt: '2026-07-16T12:00:00.000Z',
  });

  const sessions = new PostgresSessionEventSink(fixture.pool, {
    schema: 'agentplat_orders',
  });
  await sessions.append({
    tenantId: 'tenant-a',
    sessionId: 'session-a',
    eventId: 'session-a:1',
    sequence: 1,
    occurredAt: '2026-07-16T12:00:00.000Z',
    event: {
      type: 'session_started',
      payload: { sessionId: 'session-a', token: 'secret' },
    },
  });

  assert.match(fixture.calls[0].text, /"agentplat_orders"\."audit_records"/);
  assert.deepEqual(JSON.parse(fixture.calls[0].values[6]), {
    apiKey: '[REDACTED]',
    safe: 'value',
  });
  assert.match(fixture.calls[1].text, /"agentplat_orders"\."session_events"/);
  assert.equal(
    JSON.parse(fixture.calls[1].values[5]).payload.token,
    '[REDACTED]'
  );
});

const postgresEnabled = process.env.AGENTPLAT_POSTGRES_TEST === '1';

test(
  'migrates append-only sinks in a custom schema and guards destructive down',
  {
    skip: postgresEnabled
      ? false
      : 'set AGENTPLAT_POSTGRES_TEST=1 for PostgreSQL integration tests',
  },
  async () => {
    const schema = 'agentplat_audit_test';
    const pool = createPostgresPool();
    try {
      const health = await checkPostgresPool(pool);
      assert.equal(health.ok, true);
      const migrated = await runAuditMigrations(pool, {
        schema,
        createSchema: true,
      });
      assert.equal(migrated.currentVersion, 1);

      const audit = new PostgresAuditSink(pool, { schema });
      await audit.write({
        id: 'integration-audit',
        tenantId: 'tenant-a',
        action: 'integration.write',
        resource: { type: 'test', id: 'one' },
        createdAt: '2026-07-16T12:00:00.000Z',
      });
      await assert.rejects(
        pool.query(
          `DELETE FROM "${schema}".audit_records WHERE tenant_id = $1`,
          ['tenant-a']
        ),
        /append-only/
      );
      await assert.rejects(
        rollbackAuditMigrations(pool, {
          schema,
          expectedCurrentVersion: 1,
          confirm: auditRollbackConfirmation(schema, 1),
        }),
        /allowDataLoss/
      );
      const rolledBack = await rollbackAuditMigrations(pool, {
        schema,
        expectedCurrentVersion: 1,
        confirm: auditRollbackConfirmation(schema, 1),
        allowDataLoss: true,
      });
      assert.equal(rolledBack.currentVersion, 0);
    } finally {
      const status = await getAuditMigrationStatus(pool, { schema }).catch(
        () => undefined
      );
      if (status?.currentVersion === 1) {
        await rollbackAuditMigrations(pool, {
          schema,
          expectedCurrentVersion: 1,
          confirm: auditRollbackConfirmation(schema, 1),
          allowDataLoss: true,
        });
      }
      await pool.end();
    }
  }
);
