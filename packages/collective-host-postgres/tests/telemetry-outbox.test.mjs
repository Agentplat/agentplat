import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PostgresAutonomousCollectiveNodeStoreV1,
} from "../dist/index.js";
import {
  compareCollectiveHostTelemetryOutboxEntriesV1,
  createCollectiveHostTelemetryOutboxEntryV1,
} from "../../collective-host/dist/collective-telemetry.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

async function entry({
  sourceId,
  sourceSequence = 1,
  operationDigest = digest(String(sourceSequence)),
}) {
  return createCollectiveHostTelemetryOutboxEntryV1({
    sourceKind: "autonomous_node",
    sourceId,
    sourceSequence,
    ordinal: 0,
    event: {
      category: "execution",
      operation: "node.transition",
      outcome: "completed",
      logicalTimeMs: sourceSequence,
      operationDigest,
      evidenceDigests: [operationDigest],
    },
  });
}

function persistedRow(value, deliveryState = value.deliveryState) {
  return {
    source_kind: value.sourceKind,
    source_id: value.sourceId,
    source_sequence: String(value.sourceSequence),
    ordinal: value.ordinal,
    delivery_digest: value.deliveryDigest,
    delivery_state: deliveryState,
    envelope: value,
  };
}

test("PostgreSQL load uses the same canonical total order as memory", async () => {
  const expected = [
    await entry({ sourceId: "node:z" }),
    await entry({ sourceId: "node:a", sourceSequence: 2 }),
    await entry({ sourceId: "node:a" }),
  ].sort(compareCollectiveHostTelemetryOutboxEntriesV1);
  let queryText = "";
  const pool = {
    async query(text) {
      queryText = text;
      return {
        rows: expected.map((value) => persistedRow(value)),
      };
    },
  };
  const store = new PostgresAutonomousCollectiveNodeStoreV1(pool, {
    scopeId: "scope:test",
  });
  assert.deepEqual(await store.loadPendingTelemetry(), expected);
  assert.match(queryText, /source_kind COLLATE "C" ASC/u);
  assert.match(queryText, /source_id COLLATE "C" ASC/u);
  assert.match(
    queryText,
    /source_sequence ASC, ordinal ASC,[\s\S]*delivery_digest COLLATE "C" ASC/u,
  );
});

test("PostgreSQL load rejects corruption and database order divergence", async () => {
  const first = await entry({ sourceId: "node:a" });
  const second = await entry({ sourceId: "node:z" });
  const corruptedPool = {
    async query() {
      return { rows: [{
        ...persistedRow(first),
        envelope: {
          ...first,
          event: { ...first.event, outcome: "failed" },
        },
      }] };
    },
  };
  await assert.rejects(
    new PostgresAutonomousCollectiveNodeStoreV1(corruptedPool, {
      scopeId: "scope:test",
    }).loadPendingTelemetry(),
    /delivery digest is invalid/u,
  );

  const reversedPool = {
    async query() {
      return { rows: [second, first].map((value) => persistedRow(value)) };
    },
  };
  await assert.rejects(
    new PostgresAutonomousCollectiveNodeStoreV1(reversedPool, {
      scopeId: "scope:test",
    }).loadPendingTelemetry(),
    /order diverged/u,
  );

  const divergentColumnsPool = {
    async query() {
      return { rows: [{
        ...persistedRow(first),
        source_id: "node:different",
      }] };
    },
  };
  await assert.rejects(
    new PostgresAutonomousCollectiveNodeStoreV1(divergentColumnsPool, {
      scopeId: "scope:test",
    }).loadPendingTelemetry(),
    /columns diverged/u,
  );
});

test("PostgreSQL mark validates the locked envelope before mutation", async () => {
  const valid = await entry({ sourceId: "node:a" });
  const commands = [];
  const client = {
    async query(text) {
      commands.push(text);
      if (/SELECT source_kind/u.test(text)) return { rows: [{
        ...persistedRow(valid),
        envelope: { ...valid, sourceId: "node:corrupted" },
      }] };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const store = new PostgresAutonomousCollectiveNodeStoreV1(pool, {
    scopeId: "scope:test",
  });
  await assert.rejects(
    store.markTelemetryRecorded(valid.deliveryDigest),
    /delivery digest is invalid/u,
  );
  assert.equal(commands.some((value) => /SET delivery_state/u.test(value)), false);
  assert.equal(commands.at(-1), "ROLLBACK");
});

test("PostgreSQL ACK validates a recorded envelope before deletion", async () => {
  const valid = await entry({ sourceId: "node:a" });
  const commands = [];
  const client = {
    async query(text) {
      commands.push(text);
      if (/SELECT source_kind/u.test(text)) return { rows: [{
        ...persistedRow(valid, "recorded"),
        envelope: {
          ...valid,
          event: { ...valid.event, extra: true },
        },
      }] };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const store = new PostgresAutonomousCollectiveNodeStoreV1(pool, {
    scopeId: "scope:test",
  });
  await assert.rejects(
    store.acknowledgeTelemetry(valid.deliveryDigest),
    /event fields are invalid/u,
  );
  assert.equal(commands.some((value) => /DELETE FROM/u.test(value)), false);
  assert.equal(commands.at(-1), "ROLLBACK");
});

test("PostgreSQL enqueue validates before opening a transaction", async () => {
  const valid = await entry({ sourceId: "node:a" });
  let connected = false;
  const pool = {
    async connect() {
      connected = true;
      throw new Error("unexpected connection");
    },
  };
  const store = new PostgresAutonomousCollectiveNodeStoreV1(pool, {
    scopeId: "scope:test",
  });
  await assert.rejects(store.saveWithTelemetry({
    schemaVersion: 1,
    runtimeId: "node:a",
    status: "accepted",
    revision: 1,
    logicalTimeHighWaterMs: 1,
    previousStateDigest: digest("0"),
    stateDigest: digest("1"),
  }, 0, [{
    ...valid,
    event: { ...valid.event, outcome: "failed" },
  }]), /delivery digest is invalid/u);
  assert.equal(connected, false);
});

test("migration constrains coordinates without an ACK-blocking dependency", async () => {
  const sql = await readFile(new URL(
    "../migrations/005_collective_host_telemetry_outbox.up.sql",
    import.meta.url,
  ), "utf8");
  assert.match(sql, /source_sequence BETWEEN 1 AND 9007199254740991/u);
  assert.match(sql, /source_kind <> 'autonomous_node' OR ordinal = 0/u);
  assert.match(
    sql,
    /source_kind <> 'assurance_execution' OR[\s\S]*source_sequence = 1 AND ordinal <= 1/u,
  );
  assert.match(
    sql,
    /UNIQUE \(scope_id, source_kind, source_id, source_sequence, ordinal\)/u,
  );
  assert.doesNotMatch(sql, /FOREIGN KEY/u);
  assert.doesNotMatch(sql, /outbox_order/u);
});
