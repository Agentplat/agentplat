import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  GovernedMissionLifecycleRuntimeV1,
  InMemoryGovernedMissionStoreV1,
  governedMissionAuthorizationDigestV1,
  governedMissionControlProposalDigestV1,
  governedMissionRequestDigestV1,
  governedMissionScopeDigestV1,
} from "../packages/collective-runtime/dist/mission-lifecycle.js";
import {
  InMemoryMissionContinuityAuthorityPortV1,
  InMemoryMissionContinuityAvailabilityPortV1,
  InMemoryMissionContinuityRepositoryV1,
  InMemoryMissionContinuityRestorePortV1,
  InMemoryMissionContinuityStoreV1,
  MissionContinuityRuntimeV1,
  createMissionContinuityAuthorityV1,
  validateMissionContinuityCheckpointV1,
} from "../packages/collective-runtime/dist/mission-continuity.js";

const digest = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const policyDigest = digest("continuity-policy");
const planInputDigest = digest("continuity-plan");

function missionScope() {
  const body = {
    tenantId: "tenant-1",
    missionId: "mission-1",
    missionIntentId: "intent-1",
    objectiveId: "objective-1",
    workItemId: "work-1",
    workItemRevision: 1,
    authorityId: "authority-1",
    authorityEpoch: 7,
    fencingToken: "mission-fence-7",
  };
  return { ...body, scopeDigest: governedMissionScopeDigestV1(body) };
}

function lifecyclePolicy() {
  return {
    schemaVersion: 1,
    policyId: "policy-1",
    policyVersion: 1,
    policyDigest,
    requestId: "request-1",
    planInputDigest,
    budget: {
      maximumActionUnits: 12,
      maximumReconfigurations: 2,
      maximumCommitAttempts: 4,
      maximumTransitionsPerInvocation: 20,
    },
  };
}

function missionRequest(logicalTimeMs = 10) {
  const body = {
    schemaVersion: 1,
    requestId: "request-1",
    scope: missionScope(),
    policyDigest,
    planInputDigest,
    logicalTimeMs,
  };
  return { ...body, requestDigest: governedMissionRequestDigestV1(body) };
}

function lifecyclePorts(stopAction = null, resultVariant = "one") {
  const authorizations = new Map();
  const invoke = (action, result) => {
    if (action === stopAction) throw new Error(`stop:${action}`);
    return result;
  };
  return {
    authorization: {
      async authorize(input) {
        const body = {
          authorizationId: `authorization-${input.operationId}`,
          action: input.action,
          operationId: input.operationId,
          intentDigest: input.intentDigest,
          scopeDigest: input.scope.scopeDigest,
          authorityEpoch: input.scope.authorityEpoch,
          fencingToken: input.scope.fencingToken,
          issuedAtLogicalMs: input.logicalTimeMs,
          expiresAtLogicalMs: input.logicalTimeMs + 100,
        };
        const value = {
          ...body,
          authorizationDigest: governedMissionAuthorizationDigestV1(body),
        };
        authorizations.set(value.authorizationDigest, value);
        return value;
      },
      async verify(input) {
        return authorizations.get(input.authorizationDigest) ?? null;
      },
    },
    decision: {
      async certifyPlan() {
        return invoke("certify_plan", {
          decisionDigest: digest(`decision-${resultVariant}`),
        });
      },
    },
    allocation: {
      async activateAllocation() {
        return invoke("activate_allocation", {
          allocationDigest: digest(`allocation-${resultVariant}`),
        });
      },
    },
    formation: {
      async activateTeam() {
        return invoke("activate_team", {
          teamDigest: digest(`team-${resultVariant}`),
        });
      },
    },
    execution: {
      async observeExecution() {
        return invoke("observe_execution", {
          observationDigest: digest(`observation-${resultVariant}`),
        });
      },
    },
    control: {
      async evaluate(input) {
        const body = {
          proposalId: "proposal-continue",
          scopeDigest: input.scope.scopeDigest,
          authorityEpoch: input.scope.authorityEpoch,
          action: "continue",
          evaluatedAtLogicalMs: input.logicalTimeMs,
          expiresAtLogicalMs: input.logicalTimeMs + 10,
          advisoryOnly: true,
        };
        return {
          ...body,
          proposalDigest: governedMissionControlProposalDigestV1(body),
        };
      },
    },
    reconfiguration: {
      async enact() {
        throw new Error("unexpected reconfiguration");
      },
    },
  };
}

async function lifecycleState(stopAction = null, resultVariant = "one") {
  const store = new InMemoryGovernedMissionStoreV1();
  const runtime = new GovernedMissionLifecycleRuntimeV1({
    stateKey: "mission-state-1",
    policy: lifecyclePolicy(),
    store,
    ports: lifecyclePorts(stopAction, resultVariant),
  });
  if (stopAction) {
    await assert.rejects(
      runtime.advance(missionRequest()),
      new RegExp(stopAction),
    );
  } else {
    await runtime.advance(missionRequest());
  }
  return { state: await store.load("mission-state-1"), store };
}

function authority(generation, resumeCheckpointDigest = null) {
  const scope = missionScope();
  return createMissionContinuityAuthorityV1({
    schemaVersion: 1,
    authorityId: scope.authorityId,
    authorityEpoch: scope.authorityEpoch,
    fencingToken: scope.fencingToken,
    scopeDigest: scope.scopeDigest,
    policyDigest,
    generation,
    holder: {
      holderId: `holder-${generation}`,
      instanceId: `instance-${generation}`,
    },
    resumeCheckpointDigest,
    validUntilLogicalMs: 1_000,
  });
}

function continuity(source, options = {}) {
  const authorityPort =
    options.authorityPort ??
    new InMemoryMissionContinuityAuthorityPortV1(authority(1));
  const repository =
    options.repository ?? new InMemoryMissionContinuityRepositoryV1();
  const restore =
    options.restore ?? new InMemoryMissionContinuityRestorePortV1();
  const store = options.store ?? new InMemoryMissionContinuityStoreV1();
  return {
    authorityPort,
    repository,
    restore,
    store,
    runtime: new MissionContinuityRuntimeV1({
      stateKey: "continuity-state-1",
      missionStateKey: "mission-state-1",
      scopeDigest: missionScope().scopeDigest,
      policyDigest,
      source,
      restore,
      authority: authorityPort,
      availability:
        options.availability ??
        new InMemoryMissionContinuityAvailabilityPortV1(
          ["replica-a", "replica-b", "replica-c"],
          2,
        ),
      repository,
      store,
      maximumCommitAttempts: 4,
      maximumOperations: 32,
    }),
  };
}

async function createCheckpoint(stateAndStore, options = {}) {
  const setup = continuity(stateAndStore.store, options);
  const snapshot = await setup.runtime.snapshot({
    operationId: "operation-snapshot-1",
    snapshotId: "snapshot-1",
    checkpointId: "checkpoint-1",
    expectedMissionStateDigest: stateAndStore.state.stateDigest,
    logicalTimeMs: 20,
  });
  const certificate = await setup.runtime.replicate({
    operationId: "operation-replicate-1",
    snapshotDigest: snapshot.snapshotDigest,
    logicalTimeMs: 21,
  });
  const checkpoint = await setup.runtime.checkpoint({
    operationId: "operation-checkpoint-1",
    snapshotDigest: snapshot.snapshotDigest,
    certificateDigest: certificate.certificateDigest,
    logicalTimeMs: 22,
  });
  const snapshotReplay = await setup.runtime.snapshot({
    operationId: "operation-snapshot-1",
    snapshotId: "snapshot-1",
    checkpointId: "checkpoint-1",
    expectedMissionStateDigest: stateAndStore.state.stateDigest,
    logicalTimeMs: 20,
  });
  assert.equal(snapshotReplay.snapshotDigest, snapshot.snapshotDigest);
  return { ...setup, snapshot, certificate, checkpoint };
}

test("snapshots every active lifecycle phase and preserves prepared operation identity", async () => {
  const cases = [
    ["certify_plan", "planning", 0],
    ["activate_allocation", "allocation", 1],
    ["activate_team", "formation", 2],
    ["observe_execution", "execution", 3],
  ];
  for (const [stopAction, phase, applied] of cases) {
    const source = await lifecycleState(stopAction);
    const setup = continuity(source.store);
    const snapshot = await setup.runtime.snapshot({
      operationId: `snapshot-operation-${phase}`,
      snapshotId: `snapshot-${phase}`,
      checkpointId: `checkpoint-${phase}`,
      expectedMissionStateDigest: source.state.stateDigest,
      logicalTimeMs: 20,
    });
    assert.equal(snapshot.missionState.phase, phase);
    assert.equal(snapshot.missionState.pendingOperation.action, stopAction);
    assert.equal(
      snapshot.missionState.outbox.filter((entry) => entry.status === "applied")
        .length,
      applied,
    );
    assert.equal(snapshot.missionState.stateDigest, source.state.stateDigest);
  }
});

test("replicates, certifies, and takes over a prepared lifecycle without applying effects", async () => {
  const source = await lifecycleState("observe_execution");
  const setup = await createCheckpoint(source);
  setup.authorityPort.set(authority(2, setup.checkpoint.checkpointDigest));
  const result = await setup.runtime.takeover({
    operationId: "operation-takeover-1",
    checkpointDigest: setup.checkpoint.checkpointDigest,
    logicalTimeMs: 23,
  });
  assert.equal(result.pendingOperationPreserved, true);
  assert.equal(result.appliedOperationCount, 3);
  assert.equal(
    result.missionState.pendingOperation.operationId,
    source.state.pendingOperation.operationId,
  );
  assert.equal(result.missionState.stateDigest, source.state.stateDigest);
  assert.equal(result.continuityState.outbox.at(-1).status, "applied");

  const replay = await setup.runtime.takeover({
    operationId: "operation-takeover-1",
    checkpointDigest: setup.checkpoint.checkpointDigest,
    logicalTimeMs: 23,
  });
  assert.equal(replay.missionState.stateDigest, source.state.stateDigest);
  assert.equal(
    replay.continuityState.outbox.filter(
      (entry) => entry.operationId === "operation-takeover-1",
    ).length,
    1,
  );
});

test("restores a completed lifecycle with every applied receipt unchanged", async () => {
  const source = await lifecycleState();
  const setup = await createCheckpoint(source);
  setup.authorityPort.set(authority(2, setup.checkpoint.checkpointDigest));
  const result = await setup.runtime.takeover({
    operationId: "operation-takeover-complete",
    checkpointDigest: setup.checkpoint.checkpointDigest,
    logicalTimeMs: 24,
  });
  assert.equal(result.missionState.phase, "completed");
  assert.equal(result.pendingOperationPreserved, false);
  assert.equal(result.appliedOperationCount, 4);
  assert.deepEqual(result.missionState.outbox, source.state.outbox);
});

test("resumes snapshot after a repository crash without forking its ID", async () => {
  const source = await lifecycleState("activate_team");
  const base = new InMemoryMissionContinuityRepositoryV1();
  let failAfterPut = true;
  const repository = {
    getSnapshot: (...args) => base.getSnapshot(...args),
    getSnapshotById: (...args) => base.getSnapshotById(...args),
    async putSnapshot(value) {
      await base.putSnapshot(value);
      if (failAfterPut) {
        failAfterPut = false;
        throw new Error("repository interrupted after durable put");
      }
    },
    getCertificate: (...args) => base.getCertificate(...args),
    getCertificateForCheckpoint: (...args) =>
      base.getCertificateForCheckpoint(...args),
    putCertificate: (...args) => base.putCertificate(...args),
    getCheckpoint: (...args) => base.getCheckpoint(...args),
    getCheckpointById: (...args) => base.getCheckpointById(...args),
    putCheckpoint: (...args) => base.putCheckpoint(...args),
  };
  const setup = continuity(source.store, { repository });
  const request = {
    operationId: "operation-snapshot-crash",
    snapshotId: "snapshot-crash",
    checkpointId: "checkpoint-crash",
    expectedMissionStateDigest: source.state.stateDigest,
    logicalTimeMs: 20,
  };
  await assert.rejects(setup.runtime.snapshot(request), /interrupted/);
  assert.equal(
    (await setup.runtime.loadState()).pendingOperation.status,
    "prepared",
  );
  const snapshot = await setup.runtime.snapshot(request);
  assert.equal(snapshot.snapshotId, "snapshot-crash");
  const state = await setup.runtime.loadState();
  assert.equal(state.pendingOperation, null);
  assert.equal(state.outbox[0].status, "applied");
});

test("resumes takeover after restore succeeds but its continuity receipt is interrupted", async () => {
  const source = await lifecycleState("observe_execution");
  const restoreBase = new InMemoryMissionContinuityRestorePortV1();
  let failAfterRestore = true;
  const restore = {
    load: (...args) => restoreBase.load(...args),
    async restoreState(input) {
      return restoreBase.restore(input);
    },
    async restore(input) {
      const saved = await restoreBase.restore(input);
      if (saved && failAfterRestore) {
        failAfterRestore = false;
        throw new Error("restore interrupted after durable CAS");
      }
      return saved;
    },
  };
  const setup = await createCheckpoint(source, { restore });
  setup.authorityPort.set(authority(2, setup.checkpoint.checkpointDigest));
  const request = {
    operationId: "operation-takeover-crash",
    checkpointDigest: setup.checkpoint.checkpointDigest,
    logicalTimeMs: 23,
  };
  await assert.rejects(setup.runtime.takeover(request), /interrupted/);
  assert.equal(
    (await setup.runtime.loadState()).pendingOperation.status,
    "prepared",
  );
  const result = await setup.runtime.takeover(request);
  assert.equal(result.missionState.stateDigest, source.state.stateDigest);
  assert.equal(result.continuityState.pendingOperation, null);
});

test("fails closed on rollback and same-revision equivocation at restore", async () => {
  const source = await lifecycleState("activate_allocation", "source");
  const setup = await createCheckpoint(source);
  setup.authorityPort.set(authority(2, setup.checkpoint.checkpointDigest));

  const newer = await lifecycleState(null, "newer");
  await setup.restore.restore({
    state: newer.state,
    expectedRevision: null,
    expectedStateDigest: null,
    checkpointDigest: setup.checkpoint.checkpointDigest,
    authority: authority(2, setup.checkpoint.checkpointDigest),
  });
  await assert.rejects(
    setup.runtime.takeover({
      operationId: "operation-takeover-rollback",
      checkpointDigest: setup.checkpoint.checkpointDigest,
      logicalTimeMs: 23,
    }),
    /rollback detected/,
  );

  const left = await lifecycleState("observe_execution", "left");
  const right = await lifecycleState("observe_execution", "right");
  assert.equal(left.state.revision, right.state.revision);
  assert.notEqual(left.state.stateDigest, right.state.stateDigest);
  const equivocationRestore = new InMemoryMissionContinuityRestorePortV1();
  const fork = await createCheckpoint(left, { restore: equivocationRestore });
  fork.authorityPort.set(authority(2, fork.checkpoint.checkpointDigest));
  await equivocationRestore.restore({
    state: right.state,
    expectedRevision: null,
    expectedStateDigest: null,
    checkpointDigest: fork.checkpoint.checkpointDigest,
    authority: authority(2, fork.checkpoint.checkpointDigest),
  });
  await assert.rejects(
    fork.runtime.takeover({
      operationId: "operation-takeover-equivocation",
      checkpointDigest: fork.checkpoint.checkpointDigest,
      logicalTimeMs: 23,
    }),
    /equivocation detected/,
  );
});

test("rejects stale takeover authority and availability failure", async () => {
  const source = await lifecycleState("observe_execution");
  const setup = await createCheckpoint(source);
  await assert.rejects(
    setup.runtime.takeover({
      operationId: "operation-takeover-stale",
      checkpointDigest: setup.checkpoint.checkpointDigest,
      logicalTimeMs: 23,
    }),
    /stale or unauthorized/,
  );
  setup.authorityPort.set(authority(2, digest("wrong-checkpoint")));
  await assert.rejects(
    setup.runtime.takeover({
      operationId: "operation-takeover-wrong-resume",
      checkpointDigest: setup.checkpoint.checkpointDigest,
      logicalTimeMs: 23,
    }),
    /stale or unauthorized/,
  );

  const unavailable = continuity(source.store, {
    availability: {
      async certify() {
        throw new Error("unused");
      },
      async verify() {
        return false;
      },
    },
    repository: setup.repository,
    authorityPort: new InMemoryMissionContinuityAuthorityPortV1(
      authority(2, setup.checkpoint.checkpointDigest),
    ),
  });
  await assert.rejects(
    unavailable.runtime.takeover({
      operationId: "operation-takeover-unavailable",
      checkpointDigest: setup.checkpoint.checkpointDigest,
      logicalTimeMs: 23,
    }),
    /availability is invalid/,
  );
});

test("checkpoint validation rejects policy, predecessor, and certificate tampering", async () => {
  const source = await lifecycleState();
  const setup = await createCheckpoint(source);
  for (const mutation of [
    { policyDigest: digest("wrong-policy") },
    { predecessorCheckpointDigest: digest("wrong-predecessor") },
    {
      availability: {
        ...setup.checkpoint.availability,
        authorityDigest: digest("wrong-authority"),
      },
    },
  ]) {
    assert.throws(
      () =>
        validateMissionContinuityCheckpointV1({
          ...setup.checkpoint,
          ...mutation,
        }),
      /invalid/,
    );
  }
});

test("rejects a continuity-store rollback behind its external monotonic anchor", async () => {
  const source = await lifecycleState("activate_team");
  let current = null;
  let anchor = null;
  const history = [];
  const store = {
    async load() {
      return current;
    },
    async readAnchor() {
      return anchor;
    },
    async save(input) {
      if (
        (current?.revision ?? null) !== input.expectedRevision ||
        (current?.stateDigest ?? null) !== input.expectedStateDigest
      )
        return false;
      current = input.state;
      history.push(current);
      anchor = {
        revision: current.revision,
        logicalTimeHighWaterMs: current.logicalTimeHighWaterMs,
        stateDigest: current.stateDigest,
      };
      return true;
    },
  };
  const setup = continuity(source.store, { store });
  await setup.runtime.snapshot({
    operationId: "operation-anchor-snapshot",
    snapshotId: "snapshot-anchor",
    checkpointId: "checkpoint-anchor",
    expectedMissionStateDigest: source.state.stateDigest,
    logicalTimeMs: 20,
  });
  assert.equal(history.length, 2);
  current = history[0];
  await assert.rejects(
    setup.runtime.loadState(),
    /state rollback or equivocation detected/,
  );
});
