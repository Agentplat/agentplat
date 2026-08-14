import assert from 'node:assert/strict';

import {
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopResilienceReferenceScenarioV1,
  runPairedCollectiveClosedLoopResilienceCampaignV1,
} from '@agentplat/mesh-sim';

const peerCount = 4;
const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(peerCount);
const createAdaptiveInput = () =>
  createCollectiveClosedLoopResilienceReferenceScenarioV1({
    runner: 'adaptive_collective',
    peerCount,
    runtime,
  });
const createCentralizedInput = () =>
  createCollectiveClosedLoopResilienceReferenceScenarioV1({
    runner: 'centralized_planner',
    peerCount,
    runtime,
  });

const campaign = await runPairedCollectiveClosedLoopResilienceCampaignV1({
  schemaVersion: 1,
  createAdaptiveInput,
  createCentralizedInput,
});
assert.equal(campaign.matched, true);
assert.equal(campaign.adaptive.matched, true);
assert.equal(campaign.centralized.matched, true);

const first = campaign.adaptive.first;
const centralized = campaign.centralized.first;
assert.equal(first.resilience.run.stopReason, 'plan_completed');
assert.equal(centralized.resilience.run.stopReason, 'plan_completed');
assert.equal(first.action.receipt?.status, 'committed');
assert.equal(centralized.action.receipt?.status, 'committed');
assert.equal(first.recovery.workContract.assignment.assignmentEpoch, 2);
assert.equal(
  first.resilience.epochs.some(({ epoch }) => epoch === 2),
  true
);
assert.equal(first.resilience.faultObservations.length, 6);
assert.equal(first.faultMatrix.records.length, 6);
assert.equal(
  first.faultMatrix.records.every(({ observed }) => observed),
  true
);
assert.ok(first.resilience.staleResultRejections.length > 0);
assert.equal(
  first.faultMatrixBindingDigest,
  centralized.faultMatrixBindingDigest
);
assert.equal(
  first.faultMatrix.matrixDigest,
  centralized.faultMatrix.matrixDigest
);
assert.equal(
  first.faultMatrix.scenarioDigest,
  centralized.faultMatrix.scenarioDigest
);
assert.equal(
  first.resilience.resilienceResultDigest,
  campaign.adaptive.replay.resilience.resilienceResultDigest
);
assert.equal(
  first.campaignEvidence.campaignEvidenceDigest,
  campaign.adaptive.replay.campaignEvidence.campaignEvidenceDigest
);
assert.equal(
  first.trace.traceDigest,
  campaign.adaptive.replay.trace.traceDigest
);
assert.equal(
  first.faultMatrix.matrixDigest,
  campaign.adaptive.replay.faultMatrix.matrixDigest
);
assert.equal(
  centralized.trace.traceDigest,
  campaign.centralized.replay.trace.traceDigest
);
assert.equal(
  centralized.faultMatrix.matrixDigest,
  campaign.centralized.replay.faultMatrix.matrixDigest
);

await assert.rejects(
  () =>
    runPairedCollectiveClosedLoopResilienceCampaignV1({
      schemaVersion: 1,
      createAdaptiveInput,
      createCentralizedInput: async () => {
        const input = await createCentralizedInput();
        return {
          ...input,
          faultMatrix: {
            ...input.faultMatrix,
            bindingDigest: `sha256:${'0'.repeat(64)}`,
          },
        };
      },
    }),
  /closed_loop_resilience_pair_not_fair/
);

process.stdout.write(
  `${JSON.stringify({
    status: 'passed',
    runners: [first.resilience.run.runner, centralized.resilience.run.runner],
    stopReason: first.resilience.run.stopReason,
    effectStatus: first.action.receipt.status,
    faults: first.resilience.faultObservations.length,
    assignmentEpoch: first.recovery.workContract.assignment.assignmentEpoch,
    staleRejections: first.resilience.staleResultRejections.length,
    resilienceResultDigest: first.resilience.resilienceResultDigest,
    matrixDigest: first.faultMatrix.matrixDigest,
    fairnessDigest: campaign.fairnessDigest,
    publicObservationDigest: campaign.publicObservationDigest,
  })}\n`
);
