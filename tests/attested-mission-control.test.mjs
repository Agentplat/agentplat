import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  AttestedMissionControlRuntimeV1,
  InMemoryAttestedMissionControlMonotonicAnchorV1,
  InMemoryAttestedMissionControlStoreV1,
  attestedMissionFenceDigestV1,
  createAttestedMissionControlDecisionV1,
  createAttestedMissionControlPolicyV1,
} from "../packages/collective-runtime/dist/attested-mission-control.js";
import { governedMissionScopeDigestV1 } from "../packages/collective-runtime/dist/mission-lifecycle.js";

const digest = (value) =>
  `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;

function scope(missionId = "mission-1", epoch = 1, fence = "fence-1") {
  const body = {
    tenantId: "tenant-1",
    missionId,
    missionIntentId: `intent-${missionId}`,
    objectiveId: `objective-${missionId}`,
    workItemId: `work-${missionId}`,
    workItemRevision: 1,
    authorityId: "authority-1",
    authorityEpoch: epoch,
    fencingToken: fence,
  };
  return { ...body, scopeDigest: governedMissionScopeDigestV1(body) };
}

function policy(overrides = {}) {
  return createAttestedMissionControlPolicyV1({
    schemaVersion: 1,
    policyId: "control-policy-1",
    policyVersion: 1,
    sourceId: "control-source-1",
    sourceEpoch: 1,
    initialSequence: 1,
    requiredHealthySteps: 10_000,
    maximumWindowMs: 1_000_000,
    maximumSequenceGap: 10_000,
    maximumRetainedDecisions: 8,
    maximumCommitAttempts: 4,
    discontinuityAction: "pause_dispatch",
    ...overrides,
  });
}

function source({ conflicts = new Set(), sequenceByMission = false } = {}) {
  let globalSequence = 1;
  const missionSequences = new Map();
  return {
    async propose(input) {
      const sequence = sequenceByMission
        ? (missionSequences.get(input.scope.missionId) ?? 1)
        : globalSequence;
      if (sequenceByMission)
        missionSequences.set(input.scope.missionId, sequence + 1);
      else globalSequence += 1;
      return createAttestedMissionControlDecisionV1({
        schemaVersion: 1,
        proposalId: `proposal-${input.scope.missionId}-${sequence}`,
        scopeDigest: input.scope.scopeDigest,
        authorityEpoch: input.scope.authorityEpoch,
        fenceDigest: attestedMissionFenceDigestV1(input.scope),
        executionObservationDigest: conflicts.has(sequence)
          ? digest(`conflicting-observation-${sequence}`)
          : input.executionObservationDigest,
        sourceId: "control-source-1",
        sourceEpoch: 1,
        sequence,
        windowId: `window-${input.scope.missionId}`,
        windowOpenedAtLogicalMs: 0,
        evaluatedAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs: 1_000_000,
        action: "continue",
      });
    },
    async verify() {
      return true;
    },
  };
}

function runtime({
  runtimePolicy = policy(),
  runtimeSource = source(),
  store = new InMemoryAttestedMissionControlStoreV1(),
  anchor = new InMemoryAttestedMissionControlMonotonicAnchorV1(),
  stateKey = "attested-control-state-1",
  anchorKey = "attested-control-anchor-1",
} = {}) {
  return new AttestedMissionControlRuntimeV1({
    stateKey,
    anchorKey,
    policy: runtimePolicy,
    source: runtimeSource,
    store,
    monotonicAnchor: anchor,
  });
}

async function evaluate(instance, inputScope, step) {
  return instance.evaluate({
    scope: inputScope,
    logicalTimeMs: step,
    executionObservationDigest: digest(
      `observation-${inputScope.missionId}-${step}`,
    ),
  });
}

test("requires all 10,000 contiguous verified healthy steps before continue", async () => {
  const instance = runtime();
  const mission = scope();
  for (let step = 1; step < 10_000; step += 1)
    assert.equal(
      (await evaluate(instance, mission, step)).action,
      "pause_dispatch",
    );
  assert.equal((await evaluate(instance, mission, 10_000)).action, "continue");
});

for (const conflictAt of [1, 5_000, 9_999]) {
  test(`a conflicting observation at step ${conflictAt} restarts the full continuity requirement`, async () => {
    const instance = runtime({
      runtimeSource: source({ conflicts: new Set([conflictAt]) }),
    });
    const mission = scope();
    for (let step = 1; step < conflictAt + 10_000; step += 1)
      assert.equal(
        (await evaluate(instance, mission, step)).action,
        "pause_dispatch",
      );
    assert.equal(
      (await evaluate(instance, mission, conflictAt + 10_000)).action,
      "continue",
    );
  });
}

test("continues the durable healthy counter after a runtime restart", async () => {
  const store = new InMemoryAttestedMissionControlStoreV1();
  const anchor = new InMemoryAttestedMissionControlMonotonicAnchorV1();
  const runtimeSource = source();
  const runtimePolicy = policy({ requiredHealthySteps: 4 });
  const mission = scope();
  const first = runtime({ store, anchor, runtimeSource, runtimePolicy });
  assert.equal((await evaluate(first, mission, 1)).action, "pause_dispatch");
  assert.equal((await evaluate(first, mission, 2)).action, "pause_dispatch");
  const restarted = runtime({ store, anchor, runtimeSource, runtimePolicy });
  assert.equal(
    (await evaluate(restarted, mission, 3)).action,
    "pause_dispatch",
  );
  assert.equal((await evaluate(restarted, mission, 4)).action, "continue");
});

test("retries a lost CAS without requesting a second source decision", async () => {
  const inner = new InMemoryAttestedMissionControlStoreV1();
  let saves = 0;
  let proposals = 0;
  const runtimeSource = source();
  const store = {
    load: (key) => inner.load(key),
    async save(input) {
      saves += 1;
      if (saves === 1) return false;
      return inner.save(input);
    },
  };
  const countedSource = {
    async propose(input) {
      proposals += 1;
      return runtimeSource.propose(input);
    },
    verify: (input) => runtimeSource.verify(input),
  };
  const proposal = await evaluate(
    runtime({
      runtimePolicy: policy({ requiredHealthySteps: 1 }),
      runtimeSource: countedSource,
      store,
    }),
    scope(),
    1,
  );
  assert.equal(proposal.action, "continue");
  assert.equal(proposals, 1);
  assert.equal(saves, 2);
});

test("isolates mission bindings sharing a mistakenly reused state key", async () => {
  const store = new InMemoryAttestedMissionControlStoreV1();
  const anchor = new InMemoryAttestedMissionControlMonotonicAnchorV1();
  const instance = runtime({
    runtimePolicy: policy({ requiredHealthySteps: 2 }),
    runtimeSource: source({ sequenceByMission: true }),
    store,
    anchor,
  });
  const missionOne = scope("mission-1");
  const missionTwo = scope("mission-2");
  assert.equal(
    (await evaluate(instance, missionOne, 1)).action,
    "pause_dispatch",
  );
  const before = await store.load("attested-control-state-1");
  const isolated = await evaluate(instance, missionTwo, 2);
  assert.equal(isolated.action, "pause_dispatch");
  assert.equal(isolated.scopeDigest, missionTwo.scopeDigest);
  assert.equal(
    (await store.load("attested-control-state-1")).stateDigest,
    before.stateDigest,
  );
  assert.equal((await evaluate(instance, missionOne, 3)).action, "continue");
});

test("an authority epoch and fence transition durably resets continuity", async () => {
  const store = new InMemoryAttestedMissionControlStoreV1();
  const sequences = new Map();
  const runtimeSource = {
    async propose(input) {
      const sequence = sequences.get(input.scope.authorityEpoch) ?? 1;
      sequences.set(input.scope.authorityEpoch, sequence + 1);
      return createAttestedMissionControlDecisionV1({
        schemaVersion: 1,
        proposalId: `epoch-${input.scope.authorityEpoch}-${sequence}`,
        scopeDigest: input.scope.scopeDigest,
        authorityEpoch: input.scope.authorityEpoch,
        fenceDigest: attestedMissionFenceDigestV1(input.scope),
        executionObservationDigest: input.executionObservationDigest,
        sourceId: "control-source-1",
        sourceEpoch: 1,
        sequence,
        windowId: `epoch-window-${input.scope.authorityEpoch}`,
        windowOpenedAtLogicalMs: 0,
        evaluatedAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs: 1_000_000,
        action: "continue",
      });
    },
    async verify() {
      return true;
    },
  };
  const instance = runtime({
    runtimePolicy: policy({ requiredHealthySteps: 2 }),
    runtimeSource,
    store,
  });
  assert.equal((await evaluate(instance, scope(), 1)).action, "pause_dispatch");
  const rotated = scope("mission-1", 2, "fence-2");
  assert.equal((await evaluate(instance, rotated, 2)).action, "pause_dispatch");
  assert.equal((await evaluate(instance, rotated, 3)).action, "pause_dispatch");
  assert.equal((await evaluate(instance, rotated, 4)).action, "continue");
  const state = await store.load("attested-control-state-1");
  assert.equal(state.authorityEpoch, 2);
  assert.equal(state.fenceDigest, attestedMissionFenceDigestV1(rotated));
});

test("bounds retained source decisions independently of a long execution", async () => {
  const store = new InMemoryAttestedMissionControlStoreV1();
  const instance = runtime({
    runtimePolicy: policy({
      requiredHealthySteps: 1,
      maximumRetainedDecisions: 4,
    }),
    store,
  });
  const mission = scope();
  for (let step = 1; step <= 1_000; step += 1)
    await evaluate(instance, mission, step);
  const state = await store.load("attested-control-state-1");
  assert.equal(state.recentDecisions.length, 4);
  assert.deepEqual(
    state.recentDecisions.map((entry) => entry.sequence),
    [997, 998, 999, 1_000],
  );
});

test("replay, sequence gaps, and expired decisions fail closed and reset continuity", async () => {
  const mission = scope();
  const decisions = [
    { sequence: 1, expires: 1_000_000 },
    { sequence: 1, expires: 1_000_000 },
    { sequence: 4, expires: 1_000_000 },
    { sequence: 5, expires: 4 },
    { sequence: 6, expires: 1_000_000 },
    { sequence: 7, expires: 1_000_000 },
    { sequence: 8, expires: 1_000_000 },
  ];
  let index = 0;
  const runtimeSource = {
    async propose(input) {
      const item = decisions[index++];
      return createAttestedMissionControlDecisionV1({
        schemaVersion: 1,
        proposalId: `proposal-${index}`,
        scopeDigest: input.scope.scopeDigest,
        authorityEpoch: input.scope.authorityEpoch,
        fenceDigest: attestedMissionFenceDigestV1(input.scope),
        executionObservationDigest: input.executionObservationDigest,
        sourceId: "control-source-1",
        sourceEpoch: 1,
        sequence: item.sequence,
        windowId: "window-1",
        windowOpenedAtLogicalMs: 0,
        evaluatedAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs: item.expires,
        action: "continue",
      });
    },
    async verify() {
      return true;
    },
  };
  const instance = runtime({
    runtimePolicy: policy({ requiredHealthySteps: 2 }),
    runtimeSource,
  });
  for (let step = 1; step <= 6; step += 1)
    assert.equal(
      (await evaluate(instance, mission, step)).action,
      "pause_dispatch",
    );
  assert.equal((await evaluate(instance, mission, 7)).action, "continue");
});

test("an oversized verified sequence jump cannot move the high-water mark", async () => {
  const mission = scope();
  const sequences = [1, 100, 2, 3];
  let index = 0;
  const runtimeSource = {
    async propose(input) {
      const sequence = sequences[index++];
      return createAttestedMissionControlDecisionV1({
        schemaVersion: 1,
        proposalId: `bounded-gap-${sequence}`,
        scopeDigest: input.scope.scopeDigest,
        authorityEpoch: input.scope.authorityEpoch,
        fenceDigest: attestedMissionFenceDigestV1(input.scope),
        executionObservationDigest: input.executionObservationDigest,
        sourceId: "control-source-1",
        sourceEpoch: 1,
        sequence,
        windowId: "window-1",
        windowOpenedAtLogicalMs: 0,
        evaluatedAtLogicalMs: input.logicalTimeMs,
        expiresAtLogicalMs: 1_000_000,
        action: "continue",
      });
    },
    async verify() {
      return true;
    },
  };
  const instance = runtime({
    runtimePolicy: policy({
      requiredHealthySteps: 2,
      maximumSequenceGap: 1,
    }),
    runtimeSource,
  });
  assert.equal((await evaluate(instance, mission, 1)).action, "pause_dispatch");
  assert.equal((await evaluate(instance, mission, 2)).action, "pause_dispatch");
  assert.equal((await evaluate(instance, mission, 3)).action, "pause_dispatch");
  assert.equal((await evaluate(instance, mission, 4)).action, "continue");
});

test("a monotonic anchor detects restored state and never emits continue", async () => {
  let state = null;
  const store = {
    async load() {
      return state;
    },
    async save(input) {
      state = input.state;
      return true;
    },
  };
  const anchor = new InMemoryAttestedMissionControlMonotonicAnchorV1();
  const instance = runtime({
    runtimePolicy: policy({ requiredHealthySteps: 2 }),
    store,
    anchor,
  });
  const mission = scope();
  await evaluate(instance, mission, 1);
  const older = state;
  assert.equal((await evaluate(instance, mission, 2)).action, "continue");
  state = older;
  assert.equal((await evaluate(instance, mission, 3)).action, "pause_dispatch");
  assert.equal(state.stateDigest, older.stateDigest);
});
