import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryAutonomousCollectiveNodeStoreV1 } from "../dist/autonomous-collective-node.js";

function nodeState(revision) {
  return {
    schemaVersion: 1,
    runtimeId: "node:one",
    status: "accepted",
    revision,
    logicalTimeHighWaterMs: 10,
    intent: null,
    cycle: null,
    localGraph: null,
    graph: null,
    graphMerge: null,
    localBids: [],
    plan: null,
    planningDecisionDigest: null,
    planningEvidenceMessageDigests: [],
    planningFinality: null,
    executionReceipts: [],
    semanticSequenceHighWater: 0,
    awardOperations: [],
    adaptationDecision: null,
    cycleOutcome: null,
    blockingReason: null,
    nextWakeAtLogicalMs: 10,
    previousStateDigest: null,
    stateDigest: `sha256:${String(revision).padStart(64, "0")}`,
  };
}

test("only one process reserves an advance and stale fences cannot commit", async () => {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1();
  assert.equal(await store.save(nodeState(0), null), true);

  const [winner, loser] = await Promise.all([
    store.reserveAdvance({
      runtimeId: "node:one",
      expectedRevision: 0,
      requestedLogicalTimeMs: 10,
      holderId: "worker:a",
      leaseDurationMs: 5,
    }),
    store.reserveAdvance({
      runtimeId: "node:one",
      expectedRevision: 0,
      requestedLogicalTimeMs: 10,
      holderId: "worker:b",
      leaseDurationMs: 5,
    }),
  ]);
  assert.equal([winner, loser].filter(Boolean).length, 1);
  const first = winner ?? loser;
  assert.equal(await store.assertAdvanceFence(first, 15), true);

  const takeover = await store.reserveAdvance({
    runtimeId: "node:one",
    expectedRevision: 0,
    requestedLogicalTimeMs: 16,
    holderId: "worker:c",
    leaseDurationMs: 5,
  });
  assert.ok(takeover);
  assert.equal(takeover.advanceId, first.advanceId);
  assert.equal(takeover.canonicalLogicalTimeMs, 10);
  assert.equal(takeover.fence, first.fence + 1);
  assert.equal(await store.assertAdvanceFence(first, 10), false);
  assert.equal(await store.saveAdvance(nodeState(1), 0, first), false);
  assert.equal(await store.saveAdvance(nodeState(1), 0, takeover), true);
});

test("a mismatched revision cannot reserve or release another holder's advance", async () => {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1();
  assert.equal(await store.save(nodeState(0), null), true);
  assert.equal(
    await store.reserveAdvance({
      runtimeId: "node:one",
      expectedRevision: 1,
      requestedLogicalTimeMs: 10,
      holderId: "worker:a",
      leaseDurationMs: 5,
    }),
    null,
  );
  const reservation = await store.reserveAdvance({
    runtimeId: "node:one",
    expectedRevision: 0,
    requestedLogicalTimeMs: 10,
    holderId: "worker:a",
    leaseDurationMs: 5,
  });
  assert.ok(reservation);
  assert.equal(
    await store.releaseAdvance({ ...reservation, holderId: "worker:b" }),
    false,
  );
  assert.equal(await store.assertAdvanceFence(reservation, 10), true);
});

test("takeover cannot cross the atomic fence-to-command dispatch boundary", async () => {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1();
  assert.equal(await store.save(nodeState(0), null), true);
  const reservation = await store.reserveAdvance({
    runtimeId: "node:one",
    expectedRevision: 0,
    requestedLogicalTimeMs: 10,
    holderId: "worker:a",
    leaseDurationMs: 1,
  });
  assert.ok(reservation);
  let enter;
  const entered = new Promise((resolve) => (enter = resolve));
  let resume;
  const paused = new Promise((resolve) => (resume = resolve));
  const dispatch = store.runAdvanceCommand({
    reservation,
    commandId: "publish:one",
    commandDigest: `sha256:${"a".repeat(64)}`,
    commandBinding: {},
    effect: async () => {
      enter();
      await paused;
      return { receiptId: "receipt:one" };
    },
    recovery: "repeatable",
  });
  await entered;
  const stolen = await store.reserveAdvance({
    runtimeId: "node:one",
    expectedRevision: 0,
    requestedLogicalTimeMs: 12,
    holderId: "worker:b",
    leaseDurationMs: 1,
  });
  assert.equal(stolen, null);
  resume();
  assert.deepEqual(await dispatch, { receiptId: "receipt:one" });
  assert.deepEqual(
    await store.runAdvanceCommand({
      reservation,
      commandId: "publish:one",
      commandDigest: `sha256:${"a".repeat(64)}`,
      commandBinding: {},
      effect: async () => assert.fail("completed command must replay"),
      recovery: "repeatable",
    }),
    { receiptId: "receipt:one" },
  );
  await assert.rejects(
    store.runAdvanceCommand({
      reservation,
      commandId: "publish:one",
      commandDigest: `sha256:${"b".repeat(64)}`,
      commandBinding: {},
      effect: async () => null,
      recovery: "repeatable",
    }),
    /digest mismatch/,
  );
});

test("a pending command reconciles its external receipt before any retry", async () => {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1();
  assert.equal(await store.save(nodeState(0), null), true);
  const reservation = await store.reserveAdvance({
    runtimeId: "node:one",
    expectedRevision: 0,
    requestedLogicalTimeMs: 10,
    holderId: "worker:a",
    leaseDurationMs: 5,
  });
  assert.ok(reservation);
  let externalEffects = 0;
  let externalReceipt = null;
  await assert.rejects(
    store.runAdvanceCommand({
      reservation,
      commandId: "assurance:one",
      commandDigest: `sha256:${"c".repeat(64)}`,
      commandBinding: {},
      effect: async () => {
        externalEffects += 1;
        externalReceipt = { executionId: "execution:one" };
        throw new Error("crash after external effect");
      },
      recovery: "reconcile",
      reconcile: async () => ({ found: false }),
    }),
    /crash after external effect/,
  );
  const replayed = await store.runAdvanceCommand({
    reservation,
    commandId: "assurance:one",
    commandDigest: `sha256:${"c".repeat(64)}`,
    commandBinding: {},
    effect: async () => {
      externalEffects += 1;
      return { executionId: "execution:duplicate" };
    },
    recovery: "reconcile",
    reconcile: async () =>
      externalReceipt
        ? { found: true, value: externalReceipt }
        : { found: false },
  });
  assert.deepEqual(replayed, { executionId: "execution:one" });
  assert.equal(externalEffects, 1);
  externalReceipt = { executionId: "execution:authoritative" };
  assert.deepEqual(
    await store.runAdvanceCommand({
      reservation,
      commandId: "assurance:one",
      commandDigest: `sha256:${"c".repeat(64)}`,
      commandBinding: {},
      effect: async () => assert.fail("completed command must not apply"),
      recovery: "reconcile",
      reconcile: async () => ({ found: true, value: externalReceipt }),
    }),
    externalReceipt,
  );
  await assert.rejects(
    store.runAdvanceCommand({
      reservation,
      commandId: "assurance:one",
      commandDigest: `sha256:${"c".repeat(64)}`,
      commandBinding: {},
      effect: async () => assert.fail("completed command must not apply"),
      recovery: "reconcile",
      reconcile: async () => ({ found: false }),
    }),
    /no authoritative receipt/,
  );
});

test("pending command retains its original evidence snapshot when late evidence arrives", async () => {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1();
  assert.equal(await store.save(nodeState(0), null), true);
  const reservation = await store.reserveAdvance({
    runtimeId: "node:one",
    expectedRevision: 0,
    requestedLogicalTimeMs: 10,
    holderId: "worker:a",
    leaseDurationMs: 5,
  });
  const original = {
    cycleId: "cycle:one",
    graphDigest: `sha256:${"d".repeat(64)}`,
    admittedMessageDigests: [`sha256:${"e".repeat(64)}`],
  };
  await assert.rejects(
    store.runAdvanceCommand({
      reservation,
      commandId: "planning:allocate",
      commandDigest: `sha256:${"f".repeat(64)}`,
      commandBinding: original,
      recovery: "repeatable",
      effect: async () => {
        throw new Error("crash before allocation result");
      },
    }),
    /crash before allocation result/,
  );
  const lateHead = {
    ...original,
    admittedMessageDigests: [
      ...original.admittedMessageDigests,
      `sha256:${"1".repeat(64)}`,
    ].sort(),
  };
  assert.notDeepEqual(lateHead, original);
  assert.deepEqual(
    await store.loadAdvanceCommandBinding(reservation, "planning:allocate"),
    original,
  );
});
