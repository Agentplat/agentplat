import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1,
  AutonomousMissionLoopRuntimeV1,
  InMemoryAutonomousMissionLoopStoreV1,
  MeshDurableAutonomousMissionLoopStoreV1,
  createAutonomousMissionLoopPolicyV1,
  createAutonomousMissionLoopScopeV1,
  createAutonomousMissionLoopStateV1,
} from "@agentplat/collective-runtime/autonomous-mission-loop";

const scope = createAutonomousMissionLoopScopeV1({
  tenantId: "tenant",
  meshId: "mesh",
  peerId: "peer",
  instanceId: "instance",
  missionIntentId: "mission",
});
const policy = createAutonomousMissionLoopPolicyV1({
  schemaVersion: 1,
  policyId: "autonomous-policy",
  policyVersion: 1,
  planningAgentIds: ["planner"],
  planWhenIdle: true,
  planningCooldownMs: 10,
  executionRetryDelayMs: 10,
  idleDelayMs: 1,
  maximumCyclesPerRun: 4,
  maximumCommitAttempts: 3,
  maximumRetainedOperations: 8,
  requestedOutputModalities: ["text"],
});

function initialState(stateKey = "autonomous-state") {
  return createAutonomousMissionLoopStateV1({
    stateKey,
    scope,
    policyDigest: policy.policyDigest,
    logicalTimeHighWaterMs: 5,
  });
}

function runtime(store) {
  return new AutonomousMissionLoopRuntimeV1({
    stateKey: "autonomous-state",
    anchorKey: "autonomous-anchor",
    scope,
    policy,
    store,
    clock: { now: () => ({ logicalTimeMs: 5 }) },
    executionMaterial: { async resolve() { return null; } },
    node: {
      async restore() { throw new Error("not reached"); },
      async runOnce() { throw new Error("not reached"); },
      async plan() { throw new Error("not reached"); },
      async execute() { throw new Error("not reached"); },
    },
  });
}

test("in-memory persistence advances state and its independently keyed anchor together", async () => {
  const store = new InMemoryAutonomousMissionLoopStoreV1();
  const state = initialState();
  assert.equal(
    await store.save({
      state,
      anchorKey: "autonomous-anchor",
      expectedRevision: null,
      expectedStateDigest: null,
    }),
    true,
  );
  const current = await store.loadCurrent({
    stateKey: state.stateKey,
    anchorKey: "autonomous-anchor",
  });
  assert.equal(current.state.stateDigest, state.stateDigest);
  assert.equal(current.anchor.stateKey, state.stateKey);
  assert.equal(current.anchor.stateDigest, state.stateDigest);
  assert.equal(current.anchor.logicalTimeHighWaterMs, 5);
});

test("runtime fails closed instead of deriving a missing anchor from state", async () => {
  let saveCalled = false;
  const loop = runtime({
    async loadCurrent() {
      return { state: initialState(), anchor: null };
    },
    async save() {
      saveCalled = true;
      return true;
    },
  });
  await assert.rejects(() => loop.loadState(), /anchor mismatch/u);
  assert.equal(saveCalled, false);
});

test("Mesh durability rejects an incomplete pair without anchor repair", async () => {
  const state = initialState();
  let commitCalled = false;
  const store = new MeshDurableAutonomousMissionLoopStoreV1({
    scope: {
      tenantId: "tenant",
      meshId: "mesh",
      peerId: "peer",
      instanceId: "instance",
    },
    repository: {
      async loadCurrent() {
        return {
          snapshot: {
            revision: 1,
            snapshotFormat: AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1,
            snapshotSchemaVersion: 1,
            state,
          },
          anchor: null,
        };
      },
      async commit() {
        commitCalled = true;
        return true;
      },
    },
  });
  await assert.rejects(
    () =>
      store.loadCurrent({
        stateKey: state.stateKey,
        anchorKey: "autonomous-anchor",
      }),
    /durable pair is incomplete/u,
  );
  assert.equal(commitCalled, false);
});
