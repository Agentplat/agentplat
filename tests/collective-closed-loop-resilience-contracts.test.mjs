import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  createCollectiveClosedLoopFaultPlanV1,
  createCollectiveClosedLoopReferenceScenarioV1,
  createCollectiveClosedLoopResilienceCampaignEvidenceV1,
  createCollectiveClosedLoopResilienceDefinitionV1,
  createCollectiveClosedLoopResilienceResultV1,
  createCollectiveClosedLoopRunResultV1,
  validateCollectiveClosedLoopFaultPlanV1,
  validateCollectiveClosedLoopResilienceCampaignEvidenceV1,
  validateCollectiveClosedLoopResilienceCampaignEvidenceForResultV1,
  validateCollectiveClosedLoopResilienceDefinitionV1,
  validateCollectiveClosedLoopResilienceResultV1,
  validateCollectiveClosedLoopResilienceResultForDefinitionV1,
} from "@agentplat/mesh-sim";

const digest = (label) =>
  digestPlanningJsonV1("environment-state-v1", { label, schemaVersion: 1 });

function target(peerId) {
  return { schemaVersion: 1, peerId };
}

function link(fromPeerId, toPeerId) {
  return { schemaVersion: 1, fromPeerId, toPeerId };
}

function fault({
  faultId,
  family,
  logicalTimeMs,
  predecessors = [],
  links = [],
  targets = [],
  causalEventDigest = null,
}) {
  return {
    schemaVersion: 1,
    faultId,
    family,
    trigger:
      causalEventDigest === null
        ? {
            schemaVersion: 1,
            kind: "logical_time",
            logicalTimeMs,
            causalEventDigest: null,
          }
        : {
            schemaVersion: 1,
            kind: "trace_event",
            logicalTimeMs,
            causalEventDigest,
          },
    causalPredecessorFaultIds: predecessors,
    links,
    targets,
  };
}

async function fixture() {
  const input = await createCollectiveClosedLoopReferenceScenarioV1({
    runner: "adaptive_collective",
    peerCount: 3,
  });
  const definition = input.definition;
  const peer0 = definition.peers[0].peerId;
  const peer1 = definition.peers[1].peerId;
  const peer2 = definition.peers[2].peerId;
  const plan = createCollectiveClosedLoopFaultPlanV1({
    schemaVersion: 1,
    nominalDefinitionDigest: definition.definitionDigest,
    faults: [
      fault({
        faultId: "fault:01-crash",
        family: "peer.crash",
        logicalTimeMs: 10,
        targets: [target(peer1)],
      }),
      fault({
        faultId: "fault:02-restart",
        family: "peer.restart",
        logicalTimeMs: 20,
        predecessors: ["fault:01-crash"],
        targets: [target(peer1)],
      }),
      fault({
        faultId: "fault:03-partition",
        family: "network.partition",
        logicalTimeMs: 30,
        links: [link(peer0, peer2)],
      }),
      fault({
        faultId: "fault:04-heal",
        family: "network.heal",
        logicalTimeMs: 40,
        predecessors: ["fault:03-partition"],
        links: [link(peer0, peer2)],
      }),
      fault({
        faultId: "fault:05-withdraw",
        family: "capability.withdraw",
        logicalTimeMs: 50,
        targets: [target(peer2)],
      }),
    ],
  });
  const resilience = createCollectiveClosedLoopResilienceDefinitionV1({
    schemaVersion: 1,
    nominalDefinition: definition,
    faultPlan: plan,
    maximumEpochs: 2,
  });
  const run = createCollectiveClosedLoopRunResultV1({
    schemaVersion: 1,
    registrationBindingDigest: definition.registration.bindingDigest,
    runner: "adaptive_collective",
    stopReason: "plan_completed",
    finalLogicalTimeMs: 99,
    planningStateRoots: [digest("planning")],
    meshStateRoots: [digest("mesh")],
    governanceStateRoots: [digest("governance")],
    publicArtifacts: [],
  });
  const result = createCollectiveClosedLoopResilienceResultV1({
    schemaVersion: 1,
    resilienceDefinitionDigest: resilience.resilienceDefinitionDigest,
    run,
    epochs: [
      {
        schemaVersion: 1,
        epoch: 1,
        startedAtLogicalMs: 0,
        endedAtLogicalMs: 50,
        planningStateRoot: digest("p1"),
        meshStateRoot: digest("m1"),
        governanceStateRoot: digest("g1"),
      },
      {
        schemaVersion: 1,
        epoch: 2,
        startedAtLogicalMs: 50,
        endedAtLogicalMs: 99,
        planningStateRoot: digest("p2"),
        meshStateRoot: digest("m2"),
        governanceStateRoot: digest("g2"),
      },
    ],
    faultObservations: plan.faults.map((item) => ({
      schemaVersion: 1,
      faultId: item.faultId,
      scheduledEventDigest: digest(`${item.faultId}:scheduled`),
      injectedEventDigest: digest(`${item.faultId}:injected`),
      observedEventDigest: digest(`${item.faultId}:observed`),
    })),
    staleResultRejections: [
      {
        schemaVersion: 1,
        rejectionId: "stale-result:01",
        faultId: "fault:02-restart",
        rejectedAtLogicalMs: 60,
        staleFenceDigest: digest("old-fence"),
        currentFenceDigest: digest("new-fence"),
        rejectionEventDigest: digest("stale-result-rejected"),
      },
    ],
  });
  const faultIds = plan.faults.map((item) => item.faultId);
  const evidence = createCollectiveClosedLoopResilienceCampaignEvidenceV1({
    schemaVersion: 1,
    resilienceDefinitionDigest: resilience.resilienceDefinitionDigest,
    resilienceResultDigest: result.resilienceResultDigest,
    runner: "adaptive_collective",
    seed: definition.registration.seed,
    limits: {
      schemaVersion: 1,
      maximumFaults: 8,
      maximumEpochs: 2,
      maximumInteractions: definition.registration.limits.maximumInteractions,
    },
    scheduledFaultIds: faultIds,
    injectedFaultIds: faultIds,
    observedFaultIds: faultIds,
    staleResultRejectionIds: ["stale-result:01"],
  });
  return {
    definition,
    plan,
    resilience,
    result,
    evidence,
    peer0,
    peer1,
    peer2,
  };
}

test("closed-loop resilience contracts bind a bounded causal fault plan and its evidence", async () => {
  const { plan, resilience, result, evidence } = await fixture();
  assert.deepEqual(
    validateCollectiveClosedLoopFaultPlanV1(structuredClone(plan)),
    plan,
  );
  assert.deepEqual(
    validateCollectiveClosedLoopResilienceDefinitionV1(
      structuredClone(resilience),
    ),
    resilience,
  );
  assert.deepEqual(
    validateCollectiveClosedLoopResilienceResultV1(structuredClone(result)),
    result,
  );
  assert.deepEqual(
    validateCollectiveClosedLoopResilienceCampaignEvidenceV1(
      structuredClone(evidence),
    ),
    evidence,
  );
  assert.deepEqual(
    validateCollectiveClosedLoopResilienceResultForDefinitionV1(
      result,
      resilience,
    ),
    result,
  );
  assert.deepEqual(
    validateCollectiveClosedLoopResilienceCampaignEvidenceForResultV1(
      evidence,
      resilience,
      result,
    ),
    evidence,
  );
  assert.equal(Object.isFrozen(resilience.faultPlan.faults), true);
  assert.equal(result.epochs.length, 2);
  assert.equal(evidence.scheduledFaultIds.length, plan.faults.length);
});

test("closed-loop resilience contracts reject causal, target, coverage, and digest substitution", async () => {
  const {
    definition,
    plan,
    resilience,
    result,
    evidence,
    peer0,
    peer1,
    peer2,
  } = await fixture();
  const noCrash = structuredClone(plan);
  delete noCrash.faultPlanDigest;
  noCrash.faults[1].causalPredecessorFaultIds = [];
  assert.throws(
    () => createCollectiveClosedLoopFaultPlanV1(noCrash),
    /restart requires a causal crash/,
  );

  const wrongNetworkTarget = structuredClone(plan);
  delete wrongNetworkTarget.faultPlanDigest;
  wrongNetworkTarget.faults[2].targets = [target(peer0)];
  assert.throws(
    () => createCollectiveClosedLoopFaultPlanV1(wrongNetworkTarget),
    /invalid links or targets/,
  );

  const unknownTargetPlan = createCollectiveClosedLoopFaultPlanV1({
    schemaVersion: 1,
    nominalDefinitionDigest: definition.definitionDigest,
    faults: [
      fault({
        faultId: "fault:01-decline",
        family: "assignment.decline",
        logicalTimeMs: 1,
        targets: [target("peer:unknown")],
      }),
    ],
  });
  assert.throws(
    () =>
      createCollectiveClosedLoopResilienceDefinitionV1({
        schemaVersion: 1,
        nominalDefinition: definition,
        faultPlan: unknownTargetPlan,
        maximumEpochs: 2,
      }),
    /outside the nominal definition/,
  );

  const nonEdgePlan = createCollectiveClosedLoopFaultPlanV1({
    schemaVersion: 1,
    nominalDefinitionDigest: definition.definitionDigest,
    faults: [
      fault({
        faultId: "fault:01-partition",
        family: "network.partition",
        logicalTimeMs: 1,
        links: [link(peer1, peer2)],
      }),
    ],
  });
  assert.throws(
    () =>
      createCollectiveClosedLoopResilienceDefinitionV1({
        schemaVersion: 1,
        nominalDefinition: definition,
        faultPlan: nonEdgePlan,
        maximumEpochs: 2,
      }),
    /outside the nominal topology/,
  );

  const outOfBoundsPlan = createCollectiveClosedLoopFaultPlanV1({
    schemaVersion: 1,
    nominalDefinitionDigest: definition.definitionDigest,
    faults: [
      fault({
        faultId: "fault:01-decline",
        family: "assignment.decline",
        logicalTimeMs: definition.maximumLogicalTimeMs + 1,
        targets: [target(peer0)],
      }),
    ],
  });
  assert.throws(
    () =>
      createCollectiveClosedLoopResilienceDefinitionV1({
        schemaVersion: 1,
        nominalDefinition: definition,
        faultPlan: outOfBoundsPlan,
        maximumEpochs: 2,
      }),
    /exceeds the nominal logical-time bound/,
  );

  const incompleteCoverage = structuredClone(evidence);
  delete incompleteCoverage.campaignEvidenceDigest;
  incompleteCoverage.observedFaultIds =
    incompleteCoverage.observedFaultIds.slice(1);
  assert.throws(
    () =>
      createCollectiveClosedLoopResilienceCampaignEvidenceV1(
        incompleteCoverage,
      ),
    /fault coverage is incomplete/,
  );

  const missingResultCoverage = structuredClone(result);
  delete missingResultCoverage.resilienceResultDigest;
  missingResultCoverage.faultObservations.pop();
  const reducedResult = createCollectiveClosedLoopResilienceResultV1(
    missingResultCoverage,
  );
  assert.throws(
    () =>
      validateCollectiveClosedLoopResilienceResultForDefinitionV1(
        reducedResult,
        resilience,
      ),
    /fault coverage is incomplete/,
  );

  const staleFenceReuse = structuredClone(result);
  delete staleFenceReuse.resilienceResultDigest;
  staleFenceReuse.staleResultRejections[0].currentFenceDigest =
    staleFenceReuse.staleResultRejections[0].staleFenceDigest;
  assert.throws(
    () => createCollectiveClosedLoopResilienceResultV1(staleFenceReuse),
    /distinct fences/,
  );

  for (const mutate of [
    (epochs) => {
      epochs[0].startedAtLogicalMs = 1;
    },
    (epochs) => {
      epochs[1].startedAtLogicalMs = epochs[0].endedAtLogicalMs + 1;
    },
  ]) {
    const discontinuous = structuredClone(result);
    delete discontinuous.resilienceResultDigest;
    mutate(discontinuous.epochs);
    assert.throws(
      () => createCollectiveClosedLoopResilienceResultV1(discontinuous),
      /epochs are not ordered/,
    );
  }

  const runEndMismatch = structuredClone(result);
  delete runEndMismatch.resilienceResultDigest;
  runEndMismatch.epochs.at(-1).endedAtLogicalMs -= 1;
  assert.throws(
    () => createCollectiveClosedLoopResilienceResultV1(runEndMismatch),
    /epochs do not close the run/,
  );

  const reusedFaultDigest = structuredClone(result);
  delete reusedFaultDigest.resilienceResultDigest;
  reusedFaultDigest.faultObservations[0].observedEventDigest =
    reusedFaultDigest.faultObservations[0].injectedEventDigest;
  assert.throws(
    () => createCollectiveClosedLoopResilienceResultV1(reusedFaultDigest),
    /fault evidence digest is reused/,
  );

  const lateRejection = structuredClone(result);
  delete lateRejection.resilienceResultDigest;
  lateRejection.staleResultRejections[0].rejectedAtLogicalMs =
    lateRejection.run.finalLogicalTimeMs + 1;
  assert.throws(
    () => createCollectiveClosedLoopResilienceResultV1(lateRejection),
    /stale result rejection is outside the run/,
  );

  const prematureRejectionInput = structuredClone(result);
  delete prematureRejectionInput.resilienceResultDigest;
  prematureRejectionInput.staleResultRejections[0].rejectedAtLogicalMs = 19;
  const prematureRejection = createCollectiveClosedLoopResilienceResultV1(
    prematureRejectionInput,
  );
  assert.throws(
    () =>
      validateCollectiveClosedLoopResilienceResultForDefinitionV1(
        prematureRejection,
        resilience,
      ),
    /stale result rejection is outside the fault plan/,
  );

  const lateFaultPlanInput = structuredClone(plan);
  delete lateFaultPlanInput.faultPlanDigest;
  lateFaultPlanInput.faults.at(-1).trigger.logicalTimeMs =
    result.run.finalLogicalTimeMs + 1;
  const lateFaultPlan =
    createCollectiveClosedLoopFaultPlanV1(lateFaultPlanInput);
  const lateFaultDefinition = createCollectiveClosedLoopResilienceDefinitionV1({
    schemaVersion: 1,
    nominalDefinition: definition,
    faultPlan: lateFaultPlan,
    maximumEpochs: 2,
  });
  const lateFaultResultInput = structuredClone(result);
  delete lateFaultResultInput.resilienceResultDigest;
  lateFaultResultInput.resilienceDefinitionDigest =
    lateFaultDefinition.resilienceDefinitionDigest;
  const lateFaultResult =
    createCollectiveClosedLoopResilienceResultV1(lateFaultResultInput);
  assert.throws(
    () =>
      validateCollectiveClosedLoopResilienceResultForDefinitionV1(
        lateFaultResult,
        lateFaultDefinition,
      ),
    /fault trigger is outside the run/,
  );

  const tampered = structuredClone(resilience);
  tampered.maximumEpochs = 3;
  assert.throws(
    () => validateCollectiveClosedLoopResilienceDefinitionV1(tampered),
    /digest is invalid/,
  );
  void peer1;
  void peer2;
});
