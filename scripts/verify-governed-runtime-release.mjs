import assert from "node:assert/strict";
import {
  EpochFenceV1,
  InMemoryDurableStateStoreV1,
  createGovernedCollectiveRuntimeV1,
} from "@agentplat/collective-runtime";

const policy = {
  schemaVersion: 1,
  policyId: "local-release-smoke",
  policyVersion: 1,
  policyDigest: "sha256:local-release-smoke",
  maximumCycles: 3,
  pauseOnDeniedApproval: true,
  safeStopOnPhaseFailure: true,
};

const phases = Object.fromEntries(
  ["observe", "partition", "topology", "strategy", "approval", "inference", "effect", "forensics"].map((phase) => [phase, async () => ({ status: "applied", metadata: { phase } })]),
);

const store = new InMemoryDurableStateStoreV1();
const first = createGovernedCollectiveRuntimeV1({ missionId: "release-smoke", policy, profile: "reference-integrated", phases, durableStore: store, idempotencyLedger: store });
const receipt = await first.run({ operationId: "op-1", intent: { action: "local-smoke" } });
assert.equal(receipt.status, "applied");
assert.equal(receipt.completedPhases.length, 8);
assert.equal((await store.load("governed-runtime:release-smoke")).state.lastOperationId, "op-1");

const replay = await first.run({ operationId: "op-1", intent: { action: "local-smoke" } });
assert.equal(replay.receiptDigest, receipt.receiptDigest, "replay must return the same receipt");
await assert.rejects(() => first.run({ operationId: "op-1", intent: { action: "different" } }), /idempotency conflict/);

const restarted = createGovernedCollectiveRuntimeV1({ missionId: "release-smoke", policy, profile: "reference-integrated", phases, durableStore: store, idempotencyLedger: store });
const afterRestart = await restarted.run({ operationId: "op-2", intent: { action: "after-restart" } });
assert.equal(afterRestart.cycle, 2);

const fence = new EpochFenceV1();
fence.observe("release-smoke", 4);
assert.throws(() => fence.observe("release-smoke", 3), /epoch rollback/);
assert.throws(() => fence.assert("release-smoke", 5), /stale epoch/);

const conflictStore = new InMemoryDurableStateStoreV1();
await conflictStore.save({ key: "cas", state: { value: 1 }, expectedRevision: null, epoch: 0 });
await assert.rejects(() => conflictStore.save({ key: "cas", state: { value: 2 }, expectedRevision: null, epoch: 0 }), /revision conflict/);

console.log("governed runtime release smoke: PASS (restart, idempotency, CAS, epoch fence)");
