import test from "node:test";
import assert from "node:assert/strict";
import { PostgresArtifactStore, artifactMigrations } from "../dist/index.js";

function fakePool(rowCount = 1) {
  const calls = [];
  const client = {
    query: async (sql, args) => {
      calls.push({ sql, args });
      return { rowCount, rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  return { calls, pool: { query: client.query, connect: async () => client } };
}
const doc = (revision = 1) => ({
  artifact: {
    id: "a1",
    tenantId: "t1",
    ownerId: "owner",
    name: "a.html",
    format: "html",
    mimeType: "text/html; charset=utf-8",
    revision,
    authorId: "owner",
    links: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    digest: `d${revision}`,
    byteLength: 1,
  },
  revision: {
    artifactId: "a1",
    tenantId: "t1",
    revision,
    content: "<h1>x</h1>",
    byteLength: 1,
    digest: `d${revision}`,
    authorId: "owner",
    createdAt: "2026-01-01T00:00:00Z",
    expectedPreviousRevision: revision === 1 ? null : revision - 1,
  },
});

test("create and CAS persist head and revision atomically with tenant-bound SQL", async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresArtifactStore(pool, "artifact_test");
  assert.equal(await store.create(doc()), true);
  const next = doc(2);
  assert.equal(await store.compareAndSet(next, 1), true);
  assert.deepEqual(
    calls
      .filter((call) => call.sql === "BEGIN" || call.sql === "COMMIT")
      .map((call) => call.sql),
    ["BEGIN", "COMMIT", "BEGIN", "COMMIT"],
  );
  assert.match(
    calls.find((call) => call.sql.startsWith("UPDATE")).sql,
    /tenant_id=\$1 AND artifact_id=\$2 AND revision=\$5/,
  );
  assert.deepEqual(calls.find((call) => call.sql.startsWith("UPDATE")).args, [
    "t1",
    "a1",
    2,
    next,
    1,
  ]);
  assert.throws(
    () => new PostgresArtifactStore(pool, "bad;DROP"),
    /identifier/,
  );
});

test("artifact change and event reference share one database transaction", async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresArtifactStore(pool, "artifact_test");
  const event = {
    id: "event-1",
    tenantId: "t1",
    type: "artifact.created",
    source: "@agentplat/artifacts",
    subject: { type: "artifact", id: "a1" },
    payload: {
      reference: { type: "artifact", id: "a1", tenantId: "t1", revision: 1 },
    },
    occurredAt: "2026-01-01T00:00:00Z",
  };
  assert.equal(await store.createWithEvent(doc(), event), true);
  const outboxInsert = calls.find((call) =>
    call.sql.includes('INSERT INTO "artifact_test"."artifact_event_outbox"'),
  );
  assert.ok(outboxInsert);
  assert.deepEqual(
    calls
      .filter((call) => call.sql === "BEGIN" || call.sql === "COMMIT")
      .map((call) => call.sql),
    ["BEGIN", "COMMIT"],
  );
  assert.equal(artifactMigrations[1].name, "artifact_event_outbox");
});

test("outbox dispatcher leases pending events and acknowledges successful delivery", async () => {
  const calls = [];
  const event = {
    id: "evt-2",
    tenantId: "t1",
    type: "artifact.updated",
    source: "@agentplat/artifacts",
    payload: { reference: { id: "a1", revision: 2 } },
    occurredAt: "2026-01-01T00:00:00Z",
  };
  const query = async (sql, args) => {
    calls.push({ sql, args });
    return {
      rowCount: 1,
      rows: sql.startsWith("SELECT event_id,event")
        ? [{ event_id: event.id, event }]
        : [],
    };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const store = new PostgresArtifactStore(pool);
  const delivered = [];
  assert.equal(
    await store.dispatchOutbox({
      publish: async (value) => delivered.push(value),
    }),
    1,
  );
  assert.deepEqual(delivered, [event]);
  assert.ok(calls.some((call) => call.sql.includes("FOR UPDATE SKIP LOCKED")));
  assert.ok(calls.some((call) => call.sql.includes("SET delivered_at=now()")));
});

test("stale compare-and-set does not append a revision", async () => {
  const { pool, calls } = fakePool(0);
  const store = new PostgresArtifactStore(pool);
  assert.equal(await store.compareAndSet(doc(2), 1), false);
  assert.equal(
    calls.some((call) =>
      call.sql.startsWith("INSERT INTO public.artifact_revisions"),
    ),
    false,
  );
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("revision migration is tenant-keyed and rollback is explicitly destructive", () => {
  assert.match(
    artifactMigrations[0].up,
    /PRIMARY KEY \(tenant_id, artifact_id, revision\)/,
  );
  assert.equal(artifactMigrations[0].destructiveDown, true);
});
