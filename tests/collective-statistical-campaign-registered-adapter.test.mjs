import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationRunKeyV1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignRegistrationV1,
} from '../packages/collective-planning/dist/evaluation.js';
import {
  createCollectiveStatisticalCampaignExecutionArtifactsV1,
  createCollectiveStatisticalCampaignRegisteredProjectorV1,
  createCollectiveStatisticalCampaignRegisteredRunnerV1,
} from '../packages/mesh-sim/dist/index.js';

const d = (value) => `sha256:${value.repeat(64)}`;

function registration() {
  const campaignId = 'campaign:registered-adapter-test';
  return createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile: COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    sourceDigest: d('1'),
    packageDigest: d('2'),
    fixtureManifestDigest: d('3'),
    policyDigest: d('4'),
    environmentDigest: d('5'),
    observationPolicyDigest: d('6'),
    monitorDigest: d('7'),
    hiddenCanaryDigest: d('8'),
    runners: ['adaptive_collective', 'centralized_planner'],
    maximumInteractions: 5_000,
    cells: collectiveEvaluationCampaignProfileCellsV1(
      COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
      campaignId,
    ).map((cell) => ({
      schemaVersion: 1,
      ...cell,
      maximumInteractions:
        cell.peerCount === 50
          ? 1_000
          : cell.peerCount === 100
            ? 1_600
            : cell.peerCount === 250
              ? 3_000
              : 5_000,
      scaleConfigurationDigest: d('9'),
      adaptiveDefinitionDigest: d('a'),
      centralizedDefinitionDigest: d('b'),
      faultPlanDigest: d('c'),
      faultMatrixBindingDigest: d('d'),
    })),
  });
}

let referenceOutputPromise;

function referenceOutput(cell) {
  referenceOutputPromise ??=
    createCollectiveStatisticalCampaignRegisteredRunnerV1().executeV1({
      schemaVersion: 1,
      executionId: 'execution:projector-source',
      registrationDigest: d('1'),
      runKey: 'run:projector-source',
      cell,
      runner: 'adaptive_collective',
      attempt: 'first',
      maximumInteractions: 1_000,
      renewLeaseV1: async () => undefined,
    });
  return referenceOutputPromise;
}

async function executionFixture({
  failed = false,
  corruptLedger = false,
  corruptMonitor = false,
} = {}) {
  const registered = registration();
  const cell = registered.cells[0];
  const executionId = 'execution:registered-adapter-test';
  const runKey = collectiveEvaluationRunKeyV1({
    executionId,
    registrationDigest: registered.registrationDigest,
    cellId: cell.cellId,
    runner: 'adaptive_collective',
    attempt: 'first',
  });
  const source = await referenceOutput(cell);
  const output = {
    ...source,
    status: failed ? 'failed' : source.status,
    reasonCode: failed ? 'mission_or_safety_failure' : source.reasonCode,
    outcome: corruptMonitor
      ? {
          ...source.outcome,
          monitorVerdict: {
            ...source.outcome.monitorVerdict,
            objectiveValue: source.outcome.monitorVerdict.objectiveValue + 1,
          },
        }
      : source.outcome,
    ledgerRecords: corruptLedger
      ? [
          {
            ...source.ledgerRecords[0],
            total: source.ledgerRecords[0].total + 1,
          },
        ]
      : source.ledgerRecords,
  };
  const execution = createCollectiveStatisticalCampaignExecutionArtifactsV1({
    schemaVersion: 1,
    executionId,
    runKey,
    registrationDigest: registered.registrationDigest,
    cell,
    runner: 'adaptive_collective',
    attempt: 'first',
    output,
  });
  return { registered, execution };
}

test('registered closed-loop runner replays with construction-bound identities', async () => {
  const runner = createCollectiveStatisticalCampaignRegisteredRunnerV1();
  const context = {
    schemaVersion: 1,
    executionId: 'execution:runner-test',
    registrationDigest: d('1'),
    runKey: 'run:runner-test',
    cell: {
      schemaVersion: 1,
      cellId: 'cell:runner-test',
      peerCount: 3,
      stratum: 'nominal',
      seed: 0,
      maximumInteractions: 1_000,
    },
    runner: 'adaptive_collective',
    attempt: 'first',
    maximumInteractions: 1_000,
    renewLeaseV1: async () => undefined,
  };
  const first = await runner.executeV1(context);
  const replay = await runner.executeV1({ ...context, attempt: 'replay' });
  assert.equal(first.status, 'passed');
  assert.deepEqual(first.traceRecords, replay.traceRecords);
  assert.deepEqual(first.ledgerRecords, replay.ledgerRecords);
  assert.deepEqual(first.observations, replay.observations);
});

test('registered projector replays evidence and preserves runner failures as evaluated outcomes', async () => {
  const projector = createCollectiveStatisticalCampaignRegisteredProjectorV1(
    d('e'),
  );
  const passing = await executionFixture();
  const projection = projector.projectV1({
    schemaVersion: 1,
    registration: passing.registered,
    execution: passing.execution,
  });
  assert.equal(projection.executionStatus, 'completed');
  assert.equal(projection.validity, 'valid');
  assert.equal(projection.missionOutcome, 'success');
  assert.ok(projection.interactionTotal > 0);
  assert.ok(projection.roleCoherence.decisionCount > 0);

  const failing = await executionFixture({ failed: true });
  const failedProjection = projector.projectV1({
    schemaVersion: 1,
    registration: failing.registered,
    execution: failing.execution,
  });
  assert.equal(failedProjection.executionStatus, 'completed');
  assert.equal(failedProjection.validity, 'valid');
  assert.equal(failedProjection.missionOutcome, 'partial_success');
  assert.equal(failedProjection.reasonCode, null);
});

test('registered projector rejects a runner ledger that does not replay from trace events', async () => {
  const projector = createCollectiveStatisticalCampaignRegisteredProjectorV1(
    d('e'),
  );
  const fixture = await executionFixture({ corruptLedger: true });
  assert.throws(
    () =>
      projector.projectV1({
        schemaVersion: 1,
        registration: fixture.registered,
        execution: fixture.execution,
      }),
    /interaction_ledger_replay_mismatch/u,
  );
});

test('registered projector rejects a runner-supplied monitor verdict that does not replay', async () => {
  const projector = createCollectiveStatisticalCampaignRegisteredProjectorV1(
    d('e'),
  );
  const fixture = await executionFixture({ corruptMonitor: true });
  assert.throws(
    () =>
      projector.projectV1({
        schemaVersion: 1,
        registration: fixture.registered,
        execution: fixture.execution,
      }),
    /monitor_verdict_replay_mismatch/u,
  );
});

test('registered projector rejects infrastructure runner failures before evidence replay', async () => {
  const registered = registration();
  const cell = registered.cells[0];
  const executionId = 'execution:runner-exception-test';
  const runKey = collectiveEvaluationRunKeyV1({
    executionId,
    registrationDigest: registered.registrationDigest,
    cellId: cell.cellId,
    runner: 'adaptive_collective',
    attempt: 'first',
  });
  const execution = createCollectiveStatisticalCampaignExecutionArtifactsV1({
    schemaVersion: 1,
    executionId,
    runKey,
    registrationDigest: registered.registrationDigest,
    cell,
    runner: 'adaptive_collective',
    attempt: 'first',
    output: {
      schemaVersion: 1,
      status: 'failed',
      reasonCode: 'runner_exception',
      outcome: { reasonCode: 'runner_exception' },
      traceRecords: [],
      ledgerRecords: [],
      observations: [],
    },
  });
  const projector = createCollectiveStatisticalCampaignRegisteredProjectorV1(
    d('e')
  );

  assert.throws(
    () =>
      projector.projectV1({
        schemaVersion: 1,
        registration: registered,
        execution,
      }),
    /runner_execution_invalid/u
  );
});
