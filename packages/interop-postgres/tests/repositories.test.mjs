import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { interopDigestV1 } from "@agentplat/interop";
import { createWebCryptoCognitiveIntegrityV2 } from "@agentplat/runtime/cognitive-adapter";
import { createPostgresPool } from "@agentplat/postgres";
import {
  getMigrationStatus,
  PostgresGovernedInteropSessionStoreV1,
  PostgresInteropIdempotencyStoreV1,
  PostgresInteropSequenceStoreV1,
  PostgresCognitiveDurableOperationStoreV2,
  PostgresInteropOutboundSequenceStoreV1,
  migrationDirectory,
  rollbackConfirmation,
  rollbackMigrations,
  runMigrations,
} from "../dist/index.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;

async function record({ revision = 0, predecessor = null } = {}) {
  const body = {
    format: "agentplat-interop/governed-session-record/1",
    schemaVersion: 1,
    recordKey: "governed-interop-session:session-a",
    admissionId: "admission-a",
    sessionId: "session-a",
    issuerId: "client-a",
    requestDigest: DIGEST_A,
    agentId: "agent-a",
    peerId: "peer-a",
    instanceId: "instance-a",
    endpointId: "endpoint-a",
    manifestDigest: DIGEST_A,
    capabilityProfileDigest: DIGEST_A,
    roleProfileDigest: DIGEST_A,
    status: "prepared",
    revision,
    membershipConfigurationDigest: null,
    membershipEpoch: null,
    lineageDigest: null,
    retirementDigest: null,
    retiredAtLogicalMs: null,
    logicalTimeHighWaterMs: revision + 10,
    predecessorRecordDigest: predecessor,
  };
  return {
    ...body,
    recordDigest: await interopDigestV1("governed-session-record", body),
  };
}

function durableFakePool() {
  const idempotency = new Map();
  const inbound = new Map();
  const cognitiveSessions = new Map();
  const cognitiveOperations = new Map();
  const query = async (text, values = []) => {
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK")
      return { rows: [], rowCount: null };
    if (/interop_idempotency_records/u.test(text)) {
      const key = `${values[0]}\u0000${values[1]}`;
      if (/^SELECT request_digest, reservation_id/u.test(text)) {
        const row = idempotency.get(key);
        return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
      }
      if (/^SELECT request_digest, response/u.test(text)) {
        const row = idempotency.get(key);
        return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
      }
      if (/^SELECT request_digest, reservation_id, response/u.test(text)) {
        const row = idempotency.get(key);
        return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
      }
      if (/^INSERT INTO/u.test(text)) {
        if (idempotency.has(key)) return { rows: [], rowCount: 0 };
        idempotency.set(key, {
          request_digest: values[2], reservation_id: values[3],
          reserved_until_logical_ms: values[4], response: null,
        });
        return { rows: [], rowCount: 1 };
      }
      if (/SET reservation_id/u.test(text)) {
        const row = idempotency.get(key);
        row.reservation_id = values[2]; row.reserved_until_logical_ms = values[3];
        return { rows: [], rowCount: 1 };
      }
      if (/SET response/u.test(text)) {
        idempotency.get(key).response = JSON.parse(values[2]);
        return { rows: [], rowCount: 1 };
      }
    }
    if (/interop_inbound_sequence_heads/u.test(text)) {
      const key = values.slice(0, 4).join("\u0000");
      if (/^INSERT INTO/u.test(text)) {
        if (inbound.has(key)) return { rows: [], rowCount: 0 };
        inbound.set(key, { sequence: values[4], request_digest: values[5] });
        return { rows: [], rowCount: 1 };
      }
      if (/^SELECT sequence/u.test(text)) {
        const row = inbound.get(key);
        return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
      }
      if (/^UPDATE/u.test(text)) {
        inbound.set(key, { sequence: values[4], request_digest: values[5] });
        return { rows: [], rowCount: 1 };
      }
    }
    if (/interop_cognitive_sessions/u.test(text)) {
      const key = `${values[0]}\u0000${/^INSERT INTO/u.test(text) ? values[2] : values[1]}`;
      if (/^SELECT (revision, tenant_id|tenant_id, agent_id, revision, state_digest)/u.test(text)) {
        const row = cognitiveSessions.get(key);
        return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
      }
      if (/^INSERT INTO/u.test(text)) {
        if (cognitiveSessions.has(key)) return { rows: [], rowCount: 0 };
        cognitiveSessions.set(key, {
          tenant_id: values[1], session_id: values[2], agent_id: values[3],
          revision: values[4], state_digest: values[5], state: JSON.parse(values[6]),
        });
        return { rows: [], rowCount: 1 };
      }
    }
    if (/interop_cognitive_operations/u.test(text)) {
      const key = values.slice(0, 4).join("\u0000");
      if (/^INSERT INTO/u.test(text)) {
        if (cognitiveOperations.has(key)) return { rows: [], rowCount: 0 };
        cognitiveOperations.set(key, { operation: JSON.parse(values[6]) });
        return { rows: [], rowCount: 1 };
      }
      if (/^SELECT operation FROM/u.test(text)) {
        const row = cognitiveOperations.get(key);
        return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
      }
    }
    throw new Error(`unexpected durable SQL: ${text}`);
  };
  return { pool: { query, async connect() { return { query, release() {} }; } } };
}

async function cognitiveState() {
  const integrity = createWebCryptoCognitiveIntegrityV2();
  const body = {
    schemaVersion: 2, tenantId: "tenant.one", sessionId: "session.one",
    agentId: "agent.one", adapterId: "adapter.one", adapterVersion: "2.0.0",
    implementationId: "adapter.one.build", revision: 0, logicalTimeHighWaterMs: 0,
    receipts: [],
  };
  return { ...body, stateDigest: await integrity.digest("cognitive-session-state-v2", body) };
}

async function preparedCognitiveOperation(state, operation = "memory_mutation") {
  const integrity = createWebCryptoCognitiveIntegrityV2();
  const body = {
    schemaVersion: 2, tenantId: state.tenantId, sessionId: state.sessionId,
    agentId: state.agentId, operationId: `operation.${operation}`, operation,
    adapterId: state.adapterId, adapterVersion: state.adapterVersion,
    implementationId: state.implementationId, requestDigest: DIGEST_A,
    idempotencyKey: DIGEST_A, expectedSessionRevision: 0,
    previousStateDigest: state.stateDigest, preparedAtLogicalMs: 10,
    status: "prepared", journalRevision: 0, outcome: null,
  };
  return { ...body, recordDigest: await integrity.digest("cognitive-durable-operation-v2", body) };
}

function replayResponse() {
  return {
    schemaVersion: 1, protocol: "agentplat-interop/1", requestDigest: DIGEST_A,
    endpointId: "endpoint-a", sessionId: "session-a", operation: "agent.step",
    sequence: 1, status: "completed", reasonCode: "completed", payload: { ok: true },
    payloadDigest: DIGEST_A, responseDigest: DIGEST_A, signature: null,
  };
}

function fakePool() {
  const sessions = new Map();
  const heads = new Map();
  const allocations = new Map();
  const calls = [];
  const key = (values) => values.slice(0, 3).join("\u0000");
  const query = async (text, values = []) => {
    calls.push({ text, values: structuredClone(values) });
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK")
      return { rows: [], rowCount: null };
    if (/INSERT INTO .*interop_governed_sessions/u.test(text)) {
      const sessionKey = `${values[0]}\u0000${values[1]}`;
      if (sessions.has(sessionKey)) return { rows: [], rowCount: 0 };
      sessions.set(sessionKey, {
        revision: values[2],
        record_digest: values[3],
        logical_time_high_water_ms: values[4],
        record: JSON.parse(values[5]),
      });
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE .*interop_governed_sessions/u.test(text)) {
      const sessionKey = `${values[0]}\u0000${values[1]}`;
      const current = sessions.get(sessionKey);
      if (
        !current ||
        current.revision !== values[2] ||
        current.record_digest !== values[3] ||
        current.logical_time_high_water_ms > values[4]
      )
        return { rows: [], rowCount: 0 };
      sessions.set(sessionKey, {
        revision: values[5],
        record_digest: values[6],
        logical_time_high_water_ms: values[7],
        record: JSON.parse(values[8]),
      });
      return { rows: [], rowCount: 1 };
    }
    if (/FROM .*interop_governed_sessions/u.test(text)) {
      const value = sessions.get(`${values[0]}\u0000${values[1]}`);
      return {
        rows: value ? [structuredClone(value)] : [],
        rowCount: value ? 1 : 0,
      };
    }
    if (/INSERT INTO .*interop_outbound_sequence_heads/u.test(text)) {
      const scope = key(values);
      if (!heads.has(scope)) heads.set(scope, 0);
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT current_sequence/u.test(text)) {
      const value = heads.get(key(values));
      return {
        rows: value === undefined ? [] : [{ current_sequence: String(value) }],
        rowCount: value === undefined ? 0 : 1,
      };
    }
    if (/UPDATE .*interop_outbound_sequence_heads/u.test(text)) {
      heads.set(key(values), values[3]);
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT sequence/u.test(text)) {
      const value = allocations.get(`${key(values)}\u0000${values[3]}`);
      return {
        rows: value === undefined ? [] : [{ sequence: String(value) }],
        rowCount: value === undefined ? 0 : 1,
      };
    }
    if (/INSERT INTO .*interop_outbound_sequence_allocations/u.test(text)) {
      allocations.set(`${key(values)}\u0000${values[3]}`, values[4]);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected SQL: ${text}`);
  };
  return {
    calls,
    sessions,
    pool: {
      query,
      async connect() {
        return { query, release() {} };
      },
    },
  };
}

test("governed session CAS survives repository reconstruction", async () => {
  const fixture = fakePool();
  const options = { schema: "agentplat_interop", namespace: "deployment-a" };
  const first = new PostgresGovernedInteropSessionStoreV1(
    fixture.pool,
    options,
  );
  const initial = await record();
  assert.equal(
    await first.compareAndSet({
      recordKey: initial.recordKey,
      expectedRevision: null,
      expectedRecordDigest: null,
      next: initial,
    }),
    true,
  );

  const restarted = new PostgresGovernedInteropSessionStoreV1(
    fixture.pool,
    options,
  );
  assert.deepEqual(await restarted.load(initial.recordKey), initial);
  const next = await record({
    revision: 1,
    predecessor: initial.recordDigest,
  });
  assert.equal(
    await restarted.compareAndSet({
      recordKey: next.recordKey,
      expectedRevision: 0,
      expectedRecordDigest: initial.recordDigest,
      next,
    }),
    true,
  );
  assert.equal(
    await first.compareAndSet({
      recordKey: next.recordKey,
      expectedRevision: 0,
      expectedRecordDigest: initial.recordDigest,
      next,
    }),
    false,
  );
  assert.deepEqual(await first.load(next.recordKey), next);
  assert.match(
    fixture.calls.find((call) =>
      /UPDATE .*interop_governed_sessions/u.test(call.text),
    ).text,
    /"agentplat_interop"\.interop_governed_sessions/u,
  );
});

test("outbound heads and retry allocations survive allocator reconstruction", async () => {
  const fixture = fakePool();
  const options = { namespace: "deployment-a" };
  const first = new PostgresInteropOutboundSequenceStoreV1(
    fixture.pool,
    options,
  );
  const scope = {
    issuerId: "client-a",
    sessionId: "session-a",
    maximumSequence: 3,
  };
  assert.equal(await first.next({ ...scope, idempotencyKey: "request-a" }), 1);
  assert.equal(await first.next(scope), 2);

  const restarted = new PostgresInteropOutboundSequenceStoreV1(
    fixture.pool,
    options,
  );
  assert.equal(
    await restarted.next({ ...scope, idempotencyKey: "request-a" }),
    1,
  );
  assert.equal(await restarted.current(scope), 2);
  assert.equal(
    await restarted.next({ ...scope, idempotencyKey: "request-b" }),
    3,
  );
  await assert.rejects(restarted.next(scope), /capacity exceeded/u);
  assert.equal(fixture.calls.at(-1).text, "ROLLBACK");
});

test("repositories enforce the exact portable interop identifier grammar", async () => {
  const fixture = fakePool();
  const sessions = new PostgresGovernedInteropSessionStoreV1(fixture.pool, {
    namespace: "deployment-a",
  });
  await assert.rejects(sessions.load("record key with spaces"), /recordKey/u);
  const sequences = new PostgresInteropOutboundSequenceStoreV1(fixture.pool, {
    namespace: "deployment-a",
  });
  await assert.rejects(
    sequences.next({
      issuerId: "client with spaces",
      sessionId: "session-a",
      maximumSequence: 1,
    }),
    /issuerId/u,
  );
  await assert.rejects(
    sequences.next({
      issuerId: "client-a",
      sessionId: "session-a",
      maximumSequence: 1,
      idempotencyKey: "x".repeat(257),
    }),
    /idempotencyKey/u,
  );
});

test("inbound idempotency replays the exact committed response after restart and rejects mismatches", async () => {
  const fixture = durableFakePool();
  const first = new PostgresInteropIdempotencyStoreV1(fixture.pool, { namespace: "deployment-a" });
  assert.equal(await first.reserve({ idempotencyKey: "request-a", requestDigest: DIGEST_A, reservationId: "reservation-a", logicalTimeMs: 10, reservedUntilLogicalMs: 20 }), true);
  const response = replayResponse();
  assert.equal(await first.commit({ idempotencyKey: "request-a", requestDigest: DIGEST_A, reservationId: "reservation-a", response }), true);
  const restarted = new PostgresInteropIdempotencyStoreV1(fixture.pool, { namespace: "deployment-a" });
  assert.deepEqual((await restarted.load("request-a")).response, response);
  await assert.rejects(
    restarted.reserve({ idempotencyKey: "request-a", requestDigest: `sha256:${"b".repeat(64)}`, reservationId: "reservation-b", logicalTimeMs: 21, reservedUntilLogicalMs: 30 }),
    /different content/u,
  );
});

test("inbound sequence CAS is restart-safe under concurrent admission and detects equivocation", async () => {
  const fixture = durableFakePool();
  const input = { issuerId: "issuer-a", sessionId: "session-a", operation: "agent.step", sequence: 1, requestDigest: DIGEST_A };
  const first = new PostgresInteropSequenceStoreV1(fixture.pool, { namespace: "deployment-a" });
  const second = new PostgresInteropSequenceStoreV1(fixture.pool, { namespace: "deployment-a" });
  const admissions = await Promise.all([first.admit(input), second.admit(input)]);
  assert.deepEqual(admissions.sort(), ["advanced", "duplicate"]);
  const restarted = new PostgresInteropSequenceStoreV1(fixture.pool, { namespace: "deployment-a" });
  assert.equal(await restarted.admit({ ...input, requestDigest: `sha256:${"b".repeat(64)}` }), "conflict");
  assert.equal(await restarted.admit({ ...input, sequence: 2 }), "advanced");
});

test("cognitive prepared effect journal survives restart before an applied commit", async () => {
  const fixture = durableFakePool();
  const state = await cognitiveState();
  const first = new PostgresCognitiveDurableOperationStoreV2(fixture.pool, { namespace: "deployment-a" });
  assert.equal(await first.save(state, null), true);
  const prepared = await preparedCognitiveOperation(state);
  assert.equal(await first.prepareOperation({ operation: prepared }), true);
  const restarted = new PostgresCognitiveDurableOperationStoreV2(fixture.pool, { namespace: "deployment-a" });
  assert.deepEqual(await restarted.loadOperation({ tenantId: state.tenantId, sessionId: state.sessionId, operationId: prepared.operationId }), prepared);
});

test("cognitive journal accepts exactly the runtime operation vocabulary", async () => {
  const runtimeKinds = [
    "observe", "plan", "memory_query", "memory_mutation", "tool",
    "alignment", "intervention",
  ];
  for (const operation of runtimeKinds) {
    const fixture = durableFakePool();
    const state = await cognitiveState();
    const store = new PostgresCognitiveDurableOperationStoreV2(fixture.pool, { namespace: `kind-${operation}` });
    assert.equal(await store.save(state, null), true);
    assert.equal(await store.prepareOperation({ operation: await preparedCognitiveOperation(state, operation) }), true);
  }
  for (const operation of ["act", "control"]) {
    const fixture = durableFakePool();
    const state = await cognitiveState();
    const store = new PostgresCognitiveDurableOperationStoreV2(fixture.pool, { namespace: `kind-${operation}` });
    await assert.rejects(
      store.prepareOperation({ operation: await preparedCognitiveOperation(state, operation) }),
      /operation state is invalid/u,
    );
  }
});

test("package ships migrations and requires a verified backup for rollback", async () => {
  await access(`${migrationDirectory}/001_governed_interop.up.sql`);
  await access(`${migrationDirectory}/001_governed_interop.down.sql`);
  await access(`${migrationDirectory}/002_durable_interop_custody.up.sql`);
  await access(`${migrationDirectory}/002_durable_interop_custody.down.sql`);
  await assert.rejects(
    rollbackMigrations(fakePool().pool, {
      expectedCurrentVersion: 1,
      confirm: "not-used-before-backup-check",
      allowDataLoss: true,
    }),
    /verified external backup/u,
  );
});

const postgresEnabled = process.env.AGENTPLAT_POSTGRES_TEST === "1";

test(
  "real PostgreSQL migration preserves session CAS and sequence retries across restart",
  {
    skip: postgresEnabled
      ? false
      : "set AGENTPLAT_POSTGRES_TEST=1 for PostgreSQL integration tests",
  },
  async () => {
    const schema = "agentplat_interop_test";
    const pool = createPostgresPool();
    try {
      const migrated = await runMigrations(pool, {
        schema,
        createSchema: true,
      });
      assert.equal(migrated.currentVersion, 2);
      const namespace = `integration-${process.pid}-${Date.now()}`;
      const initial = await record();
      const sessions = new PostgresGovernedInteropSessionStoreV1(pool, {
        schema,
        namespace,
      });
      assert.equal(
        await sessions.compareAndSet({
          recordKey: initial.recordKey,
          expectedRevision: null,
          expectedRecordDigest: null,
          next: initial,
        }),
        true,
      );
      const restartedSessions = new PostgresGovernedInteropSessionStoreV1(
        pool,
        { schema, namespace },
      );
      assert.deepEqual(
        await restartedSessions.load(initial.recordKey),
        initial,
      );

      const scope = {
        issuerId: "client-a",
        sessionId: "session-a",
        maximumSequence: 8,
        idempotencyKey: "integration-request-a",
      };
      const sequences = new PostgresInteropOutboundSequenceStoreV1(pool, {
        schema,
        namespace,
      });
      assert.equal(await sequences.next(scope), 1);
      const restartedSequences = new PostgresInteropOutboundSequenceStoreV1(
        pool,
        { schema, namespace },
      );
      assert.equal(await restartedSequences.next(scope), 1);
      assert.equal(await restartedSequences.current(scope), 1);

      const idempotency = new PostgresInteropIdempotencyStoreV1(pool, { schema, namespace });
      const response = replayResponse();
      assert.equal(await idempotency.reserve({
        idempotencyKey: "integration-inbound-a", requestDigest: DIGEST_A,
        reservationId: "reservation-a", logicalTimeMs: 1, reservedUntilLogicalMs: 2,
      }), true);
      assert.equal(await idempotency.commit({
        idempotencyKey: "integration-inbound-a", requestDigest: DIGEST_A,
        reservationId: "reservation-a", response,
      }), true);
      const restartedIdempotency = new PostgresInteropIdempotencyStoreV1(pool, { schema, namespace });
      assert.deepEqual((await restartedIdempotency.load("integration-inbound-a")).response, response);

      const inbound = new PostgresInteropSequenceStoreV1(pool, { schema, namespace });
      const inboundInput = {
        issuerId: "client-a", sessionId: "session-a", operation: "agent.step",
        sequence: 1, requestDigest: DIGEST_A,
      };
      assert.equal(await inbound.admit(inboundInput), "advanced");
      const restartedInbound = new PostgresInteropSequenceStoreV1(pool, { schema, namespace });
      assert.equal(await restartedInbound.admit(inboundInput), "duplicate");
      assert.equal(await restartedInbound.admit({ ...inboundInput, requestDigest: `sha256:${"b".repeat(64)}` }), "conflict");
    } finally {
      const status = await getMigrationStatus(pool, { schema }).catch(
        () => undefined,
      );
      if (status?.currentVersion === 2) {
        await rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion: 2,
          confirm: rollbackConfirmation(schema, 2),
          allowDataLoss: true,
          verifiedBackup: true,
        });
      }
      await pool.end();
    }
  },
);
