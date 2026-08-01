import assert from "node:assert/strict";
import test from "node:test";

import { computeMeshDurableValueDigest } from "@agentplat/mesh/durability";

import {
  PostgresMeshDurableRepository,
  backfillLegacySnapshots,
  getRollbackReadiness,
  rollbackMigrations,
} from "@agentplat/mesh-postgres";

const scope = {
  tenantId: "tenant-a",
  meshId: "mesh-a",
  peerId: "peer-a",
  instanceId: "instance-a",
};
const claim = {
  workerId: "worker-a",
  leaseToken: "token-a",
  generation: 1,
  expiresAt: "2026-08-01T00:01:00.000Z",
};

function repository() {
  return new PostgresMeshDurableRepository({
    connect() {
      throw new Error("invalid input must fail before database access");
    },
  });
}

test("PostgreSQL adapter rejects malformed direct settlements before I/O", async () => {
  await assert.rejects(
    repository().settleOutbox({
      outbox: {
        scope,
        claim,
        effectId: "effect-a",
        status: "delivering",
      },
      settlement: { disposition: "unexpected" },
    }),
    /settlement is invalid/u,
  );
});

test("legacy snapshot backfill is bounded, resumable and deterministic", async () => {
  const state = { schemaVersion: 1, value: "fixture" };
  const calls = [];
  let released = false;
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text === "BEGIN" || text === "COMMIT") return { rows: [] };
      if (text.includes("FOR UPDATE SKIP LOCKED")) {
        return {
          rows: [
            {
              tenant_id: scope.tenantId,
              mesh_id: scope.meshId,
              peer_id: scope.peerId,
              instance_id: scope.instanceId,
              state,
              state_digest: await computeMeshDurableValueDigest(state),
              snapshot_format: "application/json; profile=legacy-opaque",
              snapshot_schema_version: 0,
            },
          ],
        };
      }
      if (text.startsWith("UPDATE")) return { rowCount: 1, rows: [] };
      if (text.includes("count(*)")) return { rows: [{ count: "0" }] };
      throw new Error(`unexpected query: ${text}`);
    },
    release() {
      released = true;
    },
  };
  const result = await backfillLegacySnapshots(
    {
      async connect() {
        return client;
      },
    },
    {
      schema: "mesh_fixture",
      batchSize: 10,
      target: {
        format: "application/vnd.example.peer-state+json",
        schemaVersion: 2,
      },
      migrate({ state: input, sourceSchemaVersion }) {
        assert.equal(Object.isFrozen(input), true);
        assert.equal(sourceSchemaVersion, 0);
        return { ...input, schemaVersion: 2 };
      },
    },
  );
  assert.deepEqual(result, {
    selected: 1,
    migrated: 1,
    remainingLegacyRows: 0,
    complete: true,
  });
  assert.equal(released, true);
  assert.equal(calls.at(-1).text, "COMMIT");
  const update = calls.find(({ text }) => text.startsWith("UPDATE"));
  assert.equal(update.values[6], "application/vnd.example.peer-state+json");
  assert.equal(update.values[7], 2);
});

test("legacy snapshot backfill rolls back nondeterministic batches", async () => {
  const state = { value: "fixture" };
  let invocation = 0;
  const commands = [];
  const client = {
    async query(text) {
      commands.push(text);
      if (text === "BEGIN" || text === "ROLLBACK") return { rows: [] };
      if (text.includes("FOR UPDATE SKIP LOCKED")) {
        return {
          rows: [
            {
              tenant_id: scope.tenantId,
              mesh_id: scope.meshId,
              peer_id: scope.peerId,
              instance_id: scope.instanceId,
              state,
              state_digest: await computeMeshDurableValueDigest(state),
              snapshot_format: "application/json; profile=legacy-opaque",
              snapshot_schema_version: 0,
            },
          ],
        };
      }
      throw new Error(`unexpected query: ${text}`);
    },
    release() {},
  };
  await assert.rejects(
    () =>
      backfillLegacySnapshots(
        {
          async connect() {
            return client;
          },
        },
        {
          target: {
            format: "application/vnd.example.peer-state+json",
            schemaVersion: 2,
          },
          migrate(input) {
            invocation += 1;
            return { ...input.state, invocation };
          },
        },
      ),
    /nondeterministic/u,
  );
  assert.equal(commands.at(-1), "ROLLBACK");
});

test("legacy snapshot backfill bounds caller migration time and target identity", async () => {
  const commands = [];
  const client = {
    async query(text) {
      commands.push(text);
      if (text === "BEGIN" || text === "ROLLBACK") return { rows: [] };
      if (text.includes("FOR UPDATE SKIP LOCKED")) {
        const state = { value: "fixture" };
        return {
          rows: [
            {
              tenant_id: scope.tenantId,
              mesh_id: scope.meshId,
              peer_id: scope.peerId,
              instance_id: scope.instanceId,
              state,
              state_digest: await computeMeshDurableValueDigest(state),
              snapshot_format: "application/json; profile=legacy-opaque",
              snapshot_schema_version: 0,
            },
          ],
        };
      }
      throw new Error(`unexpected query: ${text}`);
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  await assert.rejects(
    () =>
      backfillLegacySnapshots(pool, {
        migrationTimeoutMs: 10,
        target: {
          format: "application/vnd.example.peer-state+json",
          schemaVersion: 2,
        },
        migrate: () => new Promise(() => {}),
      }),
    /timed out/u,
  );
  assert.equal(commands.at(-1), "ROLLBACK");
  await assert.rejects(
    () =>
      backfillLegacySnapshots(pool, {
        target: {
          format: "application/json; profile=legacy-opaque",
          schemaVersion: 0,
        },
        migrate: ({ state }) => state,
      }),
    /target is invalid/u,
  );
});

test("PostgreSQL adapter bounds direct reason codes before I/O", async () => {
  await assert.rejects(
    repository().abandonInbox({
      inbox: {
        scope,
        claim,
        messageId: "AAAAAAAAAAAAAAAAAAAAAQ",
        status: "processing",
      },
      retryAfterMs: 100,
      reasonCode: "NOT ALLOWED",
    }),
    /reasonCode is invalid/u,
  );
});

test("PostgreSQL adapter validates the complete commit shape before I/O", async () => {
  await assert.rejects(
    repository().commitInboxTransition({
      inbox: {
        scope,
        claim,
        messageId: "AAAAAAAAAAAAAAAAAAAAAQ",
        status: "processing",
      },
      expectedSnapshotRevision: 0,
      transitionId: "transition-a",
      outcome: "rejected",
      journal: [],
      outbox: [],
    }),
    /commit input is invalid/u,
  );
});

test("PostgreSQL rollback readiness is count-only and fail-closed", async () => {
  let queryText;
  const pool = {
    async query(text) {
      queryText = text;
      return {
        rows: [
          {
            incompatible_inbox: "2",
            incompatible_outbox: "1",
            incompatible_snapshots: "3",
            incompatible_journal: "4",
          },
        ],
      };
    },
  };
  assert.deepEqual(
    await getRollbackReadiness(pool, { schema: "mesh_fixture" }),
    {
      incompatibleInboxRows: 2,
      incompatibleOutboxRows: 1,
      incompatibleSnapshotRows: 3,
      incompatibleJournalRows: 4,
      incompatibleRows: 10,
      readyForAlphaReader: false,
    },
  );
  assert.match(queryText, /"mesh_fixture"\.mesh_inbox/u);
  assert.doesNotMatch(queryText, /SELECT\s+envelope\b/u);

  await assert.rejects(
    () =>
      rollbackMigrations(pool, {
        schema: "mesh_fixture",
        expectedCurrentVersion: 2,
        confirm: "unused",
        allowDataLoss: true,
      }),
    /verified external backup/u,
  );
});
