import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  CompromiseAwareRecoveryRuntimeV1,
  InMemoryCompromiseRecoveryStoreV1,
  compromiseAwareRecoveryScopeV1,
  createCompromiseRecoverySparseExclusionPortV1,
  invokeCompromiseAwareRecoveryLoadV1,
  isCompromiseAwareRecoveryRuntimeV1,
} from "@agentplat/collective-runtime/compromise-aware-recovery";

const digest = (value) =>
  digestPlanningJsonV1("mission-observation", { value });

test("replayed sparse exclusion retains the original durable application receipt", async () => {
  const certificateDigest = digest("adaptive-certificate");
  const application = Object.freeze({
    certificateDigest,
    appliedAtLogicalMs: 11,
    applicationDigest: digest("adaptive-application"),
  });
  const calls = [];
  const exclusion = createCompromiseRecoverySparseExclusionPortV1({
    async applyAdaptation(input) {
      calls.push(input);
      return {
        adaptation: {
          decision: "duplicate",
          reasonCode: "application_duplicate",
          applied: application,
          state: { applied: application },
        },
        state: {
          routing: {
            view: {
              excludedNeighborIndexes: [7],
              viewDigest: digest("excluded-view"),
              revision: 4,
            },
          },
        },
      };
    },
  });
  const receipt = await exclusion.exclude({
    operationId: "recovery.exclude.1",
    verdict: {
      subjectPeerId: "peer-7",
      subjectPeerIndex: 7,
      certificateDigest: digest("compromise-verdict"),
      expectedAdaptiveRevision: 3,
      sparseExclusionCertificate: { certificateDigest },
    },
    logicalTimeMs: 19,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedRevision, 3);
  assert.equal(receipt.appliedAtLogicalMs, 11);
  assert.equal(receipt.resultingViewRevision, 4);
});

test("recovery runtime identity and construction-time ports resist structural fakes and rebinding", async () => {
  const scope = {
    tenantId: "tenant:recovery-brand",
    meshId: "mesh:recovery-brand",
    missionIntentId: "mission:recovery-brand",
    objectiveId: "objective:recovery-brand",
    workItemId: "work:recovery-brand",
  };
  const store = new InMemoryCompromiseRecoveryStoreV1();
  const options = {
    stateKey: "state:recovery-brand",
    anchorKey: "anchor:recovery-brand",
    scope,
    policy: {
      schemaVersion: 1,
      policyId: "policy:recovery-brand",
      policyVersion: 1,
      policyDigest: `sha256:${"1".repeat(64)}`,
      maximumVerdictLifetimeMs: 1_000,
      maximumTakeoverProposals: 4,
      maximumWitnesses: 4,
      maximumExcludedPeers: 4,
      maximumCompletedCertificates: 4,
      maximumCommitAttempts: 2,
      maximumRunSteps: 4,
    },
    store,
    verification: { async verify() { return true; } },
    exclusion: { async exclude() { throw new Error("not used"); } },
    fencing: { async fence() { throw new Error("not used"); } },
    activation: { async activate() { throw new Error("not used"); } },
    restoration: {
      async restoreCheckpoint() { throw new Error("not used"); },
      async activateReauction() { throw new Error("not used"); },
      async requestReplanning() { throw new Error("not used"); },
    },
  };
  class OverridingRecovery extends CompromiseAwareRecoveryRuntimeV1 {
    async load() {
      throw new Error("subclass load override must not run");
    }
  }
  const runtime = new OverridingRecovery(options);
  assert.equal(isCompromiseAwareRecoveryRuntimeV1(runtime), true);
  assert.equal(
    isCompromiseAwareRecoveryRuntimeV1({
      load: runtime.load.bind(runtime),
      submit: runtime.submit.bind(runtime),
      runToTerminal: runtime.runToTerminal.bind(runtime),
      gateExecution: runtime.gateExecution.bind(runtime),
    }),
    false,
  );
  const initial = await invokeCompromiseAwareRecoveryLoadV1(runtime, 1);
  assert.equal(initial.revision, 0);
  runtime.load = async () => {
    throw new Error("monkey-patched load must not run");
  };
  store.loadCurrent = async () => {
    throw new Error("rebound store load must not run");
  };
  store.save = async () => {
    throw new Error("rebound store save must not run");
  };
  options.scope.missionIntentId = "mission:mutated";
  const replay = await invokeCompromiseAwareRecoveryLoadV1(runtime, 2);
  assert.equal(replay.stateDigest, initial.stateDigest);
  assert.equal(
    compromiseAwareRecoveryScopeV1(runtime).missionIntentId,
    "mission:recovery-brand",
  );
});
