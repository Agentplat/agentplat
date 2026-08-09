import assert from "node:assert/strict";
import test from "node:test";
import {
  auditRollbackConfirmation,
  getAuditMigrationStatus,
  PostgresAuditSink,
  PostgresCollectiveTelemetryMonotonicAnchorV1,
  PostgresCollectiveTelemetryStoreV1,
  PostgresSessionEventSink,
  rollbackAuditMigrations,
  runAuditMigrations,
} from "../dist/index.js";
import { checkPostgresPool, createPostgresPool } from "@agentplat/postgres";

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

test("writes redacted audit and Session events to an isolated schema", async () => {
  const fixture = poolFixture();
  const audit = new PostgresAuditSink(fixture.pool, {
    schema: "agentplat_orders",
  });
  await audit.write({
    id: "audit-1",
    tenantId: "tenant-a",
    action: "session.started",
    resource: { type: "agent_session", id: "session-a" },
    details: { apiKey: "secret", safe: "value" },
    createdAt: "2026-07-16T12:00:00.000Z",
  });

  const sessions = new PostgresSessionEventSink(fixture.pool, {
    schema: "agentplat_orders",
  });
  await sessions.append({
    tenantId: "tenant-a",
    sessionId: "session-a",
    eventId: "session-a:1",
    sequence: 1,
    occurredAt: "2026-07-16T12:00:00.000Z",
    event: {
      type: "session_started",
      payload: { sessionId: "session-a", token: "secret" },
    },
  });

  assert.match(fixture.calls[0].text, /"agentplat_orders"\."audit_records"/);
  assert.deepEqual(JSON.parse(fixture.calls[0].values[6]), {
    apiKey: "[REDACTED]",
    safe: "value",
  });
  assert.match(fixture.calls[1].text, /"agentplat_orders"\."session_events"/);
  assert.equal(
    JSON.parse(fixture.calls[1].values[5]).payload.token,
    "[REDACTED]",
  );
});

test("telemetry repositories capture tenant and PostgreSQL methods at construction", async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      throw new Error("connect is not used by load");
    },
  };
  const options = { schema: "agentplat_audit", tenantId: "tenant:original" };
  const store = new PostgresCollectiveTelemetryStoreV1(pool, options);
  const anchor = new PostgresCollectiveTelemetryMonotonicAnchorV1(
    pool,
    options,
  );
  options.tenantId = "tenant:mutated";
  pool.query = async () => {
    throw new Error("replaced pool query executed");
  };
  assert.equal(await store.load("stream:one"), null);
  assert.equal(await anchor.load("anchor:one"), null);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].values[0], "tenant:original");
  assert.equal(calls[1].values[0], "tenant:original");
});

const postgresEnabled = process.env.AGENTPLAT_POSTGRES_TEST === "1";

test(
  "migrates append-only sinks in a custom schema and guards destructive down",
  {
    skip: postgresEnabled
      ? false
      : "set AGENTPLAT_POSTGRES_TEST=1 for PostgreSQL integration tests",
  },
  async () => {
    const schema = "agentplat_audit_test";
    const pool = createPostgresPool();
    try {
      const health = await checkPostgresPool(pool);
      assert.equal(health.ok, true);
      const migrated = await runAuditMigrations(pool, {
        schema,
        createSchema: true,
      });
      assert.equal(migrated.currentVersion, 4);

      const audit = new PostgresAuditSink(pool, { schema });
      await audit.write({
        id: "integration-audit",
        tenantId: "tenant-a",
        action: "integration.write",
        resource: { type: "test", id: "one" },
        createdAt: "2026-07-16T12:00:00.000Z",
      });
      const anchor = new PostgresCollectiveTelemetryMonotonicAnchorV1(pool, {
        schema,
        tenantId: "tenant-a",
      });
      const initialAnchor = {
        revision: 0,
        sequence: 0,
        stateDigest: `sha256:${"a".repeat(64)}`,
        logicalTimeHighWaterMs: 1,
      };
      assert.equal(
        await anchor.save({
          anchorKey: "anchor:integration",
          anchor: initialAnchor,
          expectedRevision: null,
          expectedStateDigest: null,
        }),
        true,
      );
      const successors = await Promise.all(
        ["b", "c"].map((character) =>
          anchor.save({
            anchorKey: "anchor:integration",
            anchor: {
              revision: 1,
              sequence: 1,
              stateDigest: `sha256:${character.repeat(64)}`,
              logicalTimeHighWaterMs: 2,
            },
            expectedRevision: 0,
            expectedStateDigest: initialAnchor.stateDigest,
          }),
        ),
      );
      assert.deepEqual([...successors].sort(), [false, true]);
      const retainedAnchor = await anchor.load("anchor:integration");
      assert.equal(retainedAnchor.revision, 1);
      await assert.rejects(
        pool.query(
          `UPDATE "${schema}".collective_telemetry_monotonic_anchors
              SET revision = revision + 2, sequence = sequence + 2
            WHERE tenant_id = $1 AND anchor_key = $2`,
          ["tenant-a", "anchor:integration"],
        ),
        /must advance exactly once/,
      );
      await assert.rejects(
        pool.query(
          `DELETE FROM "${schema}".audit_records WHERE tenant_id = $1`,
          ["tenant-a"],
        ),
        /append-only/,
      );
      await assert.rejects(
        rollbackAuditMigrations(pool, {
          schema,
          expectedCurrentVersion: 4,
          confirm: auditRollbackConfirmation(schema, 4),
        }),
        /allowDataLoss/,
      );
      const rolledBack = await rollbackAuditMigrations(pool, {
        schema,
        expectedCurrentVersion: 4,
        confirm: auditRollbackConfirmation(schema, 4),
        allowDataLoss: true,
      });
      assert.equal(rolledBack.currentVersion, 3);
    } finally {
      let status = await getAuditMigrationStatus(pool, { schema }).catch(
        () => undefined,
      );
      while (status && status.currentVersion > 0) {
        status = await rollbackAuditMigrations(pool, {
          schema,
          expectedCurrentVersion: status.currentVersion,
          confirm: auditRollbackConfirmation(schema, status.currentVersion),
          allowDataLoss: true,
        });
      }
      await pool.end();
    }
  },
);
