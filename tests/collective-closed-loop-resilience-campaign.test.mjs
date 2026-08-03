import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopResilienceReferenceScenarioV1,
  runPairedCollectiveClosedLoopResilienceCampaignV1,
} from '@agentplat/mesh-sim';

test('runs a fair adaptive and centralized resilience pair with exact replay', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(3);
  const campaign = await runPairedCollectiveClosedLoopResilienceCampaignV1({
    schemaVersion: 1,
    createAdaptiveInput: () =>
      createCollectiveClosedLoopResilienceReferenceScenarioV1({
        runner: 'adaptive_collective',
        peerCount: 3,
        runtime,
      }),
    createCentralizedInput: () =>
      createCollectiveClosedLoopResilienceReferenceScenarioV1({
        runner: 'centralized_planner',
        peerCount: 3,
        runtime,
      }),
  });

  assert.equal(campaign.matched, true);
  assert.equal(campaign.adaptive.matched, true);
  assert.equal(campaign.centralized.matched, true);
  assert.equal(campaign.adaptive.first.action.receipt?.status, 'committed');
  assert.equal(campaign.centralized.first.action.receipt?.status, 'committed');
  assert.equal(campaign.adaptive.first.resilience.epochs.length, 2);
  assert.equal(campaign.centralized.first.resilience.epochs.length, 2);
  assert.equal(campaign.adaptive.first.resilience.faultObservations.length, 6);
  assert.equal(
    campaign.centralized.first.resilience.faultObservations.length,
    6
  );
  assert.equal(
    campaign.adaptive.first.resilience.resilienceResultDigest,
    campaign.adaptive.replay.resilience.resilienceResultDigest
  );
  assert.equal(
    campaign.centralized.first.resilience.resilienceResultDigest,
    campaign.centralized.replay.resilience.resilienceResultDigest
  );
});

test('rejects a centralized input with a different public campaign binding', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(3);
  await assert.rejects(
    runPairedCollectiveClosedLoopResilienceCampaignV1({
      schemaVersion: 1,
      createAdaptiveInput: () =>
        createCollectiveClosedLoopResilienceReferenceScenarioV1({
          runner: 'adaptive_collective',
          peerCount: 3,
          runtime,
        }),
      async createCentralizedInput() {
        const value =
          await createCollectiveClosedLoopResilienceReferenceScenarioV1({
            runner: 'centralized_planner',
            peerCount: 3,
            runtime,
          });
        return Object.freeze({
          ...value,
          resultSummary: `${value.resultSummary} supplemental`,
        });
      },
    }),
    /closed_loop_resilience_pair_not_fair/
  );
});

test('rejects a different decision-policy implementation despite matching metadata', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(3);
  await assert.rejects(
    runPairedCollectiveClosedLoopResilienceCampaignV1({
      schemaVersion: 1,
      createAdaptiveInput: () =>
        createCollectiveClosedLoopResilienceReferenceScenarioV1({
          runner: 'adaptive_collective',
          peerCount: 3,
          runtime,
        }),
      async createCentralizedInput() {
        const value =
          await createCollectiveClosedLoopResilienceReferenceScenarioV1({
            runner: 'centralized_planner',
            peerCount: 3,
            runtime,
          });
        return Object.freeze({
          ...value,
          decisionPolicy: Object.freeze({
            ...value.decisionPolicy,
            decide: (context) => value.decisionPolicy.decide(context),
            decideCentralized: (context) =>
              value.decisionPolicy.decideCentralized(context),
          }),
        });
      },
    }),
    /closed_loop_resilience_pair_policy_implementation_mismatch/u
  );
});

test('rejects different evaluator environment or monitor bindings before execution', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(3);
  await assert.rejects(
    runPairedCollectiveClosedLoopResilienceCampaignV1({
      schemaVersion: 1,
      createAdaptiveInput: () =>
        createCollectiveClosedLoopResilienceReferenceScenarioV1({
          runner: 'adaptive_collective',
          peerCount: 3,
          runtime,
        }),
      async createCentralizedInput() {
        const value =
          await createCollectiveClosedLoopResilienceReferenceScenarioV1({
            runner: 'centralized_planner',
            peerCount: 3,
            runtime,
          });
        const nominal = value.definition.nominalDefinition;
        return Object.freeze({
          ...value,
          definition: Object.freeze({
            ...value.definition,
            nominalDefinition: Object.freeze({
              ...nominal,
              registration: Object.freeze({
                ...nominal.registration,
                environmentDigest: `sha256:${'e'.repeat(64)}`,
                monitorDigest: `sha256:${'f'.repeat(64)}`,
              }),
            }),
          }),
        });
      },
    }),
    /closed_loop_resilience_pair_not_fair/u
  );
});

test('rejects a substituted centralized matrix with a different binding', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(3);
  await assert.rejects(
    runPairedCollectiveClosedLoopResilienceCampaignV1({
      schemaVersion: 1,
      createAdaptiveInput: () =>
        createCollectiveClosedLoopResilienceReferenceScenarioV1({
          runner: 'adaptive_collective',
          peerCount: 3,
          runtime,
        }),
      async createCentralizedInput() {
        const value =
          await createCollectiveClosedLoopResilienceReferenceScenarioV1({
            runner: 'centralized_planner',
            peerCount: 3,
            runtime,
          });
        return Object.freeze({
          ...value,
          faultMatrix: Object.freeze({
            ...value.faultMatrix,
            bindingDigest: `sha256:${'a'.repeat(64)}`,
          }),
        });
      },
    }),
    /closed_loop_resilience_pair_not_fair/u
  );
});

test('rejects a substituted matrix even when its public binding matches', async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(3);
  await assert.rejects(
    runPairedCollectiveClosedLoopResilienceCampaignV1({
      schemaVersion: 1,
      createAdaptiveInput: () =>
        createCollectiveClosedLoopResilienceReferenceScenarioV1({
          runner: 'adaptive_collective',
          peerCount: 3,
          runtime,
        }),
      async createCentralizedInput() {
        const value =
          await createCollectiveClosedLoopResilienceReferenceScenarioV1({
            runner: 'centralized_planner',
            peerCount: 3,
            runtime,
          });
        return Object.freeze({
          ...value,
          faultMatrix: Object.freeze({ ...value.faultMatrix }),
        });
      },
    }),
    /closed_loop_resilience_execution_input_invalid/u
  );
});
