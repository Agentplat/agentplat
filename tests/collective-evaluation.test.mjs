import assert from "node:assert/strict";
import test from "node:test";

import {
  createCollectiveEvaluationComparisonV1,
  pairedBootstrapSuccessDifferenceV1,
  validateCollectiveEvaluationReportV1,
  validateCollectiveMissionV1,
  wilsonInterval95V1,
} from "@agentplat/collective-control/evaluation";
import {
  createReferenceCollectiveMissionV1,
  createReferenceExperimentRegistrationV1,
  runCollectiveEvaluationSampleV1,
  runReferenceRoleCoherenceV1,
  runRegisteredCollectiveEvaluationV1,
} from "@agentplat/mesh-sim";
import { digestCollectiveJsonV1 } from "@agentplat/collective-control";

const sourceCommit = "1090a1b330b5bb2dd9c6702f1121bcd257b73334";
const digest = (label) =>
  digestCollectiveJsonV1("state", { schemaVersion: 1, label });

function registration(mission, runner, stratum = "mixed", seeds = [1, 2]) {
  return createReferenceExperimentRegistrationV1({
    registrationId: `registration:${runner}:${stratum}:${mission.agents.length}`,
    sourceCommit,
    dirtyWorktree: true,
    runner,
    stratum,
    seeds,
    mission,
    implementationDigest: digest("implementation"),
    fixtureDigest: digest("fixture"),
    aggregationSeed: 0x5eed,
  });
}

test("mission and registration contracts are strict, bounded and digest-bound", () => {
  const mission = createReferenceCollectiveMissionV1({ agentCount: 50 });
  assert.deepEqual(validateCollectiveMissionV1(mission), mission);
  assert.equal(mission.agents.length, 50);
  assert.equal(mission.limits.maximumInteractions, 5_000);
  assert.throws(
    () => validateCollectiveMissionV1({ ...mission, missionId: "changed" }),
    /digest is invalid/u,
  );
  assert.throws(
    () => validateCollectiveMissionV1({ ...mission, unknown: true }),
    /invalid shape/u,
  );
  assert.throws(
    () => createReferenceCollectiveMissionV1({ agentCount: 501 }),
    /agentCount/u,
  );
});

test("governed and centralized runners are exact, bounded and paired", async () => {
  const mission = createReferenceCollectiveMissionV1({ agentCount: 20 });
  const collectiveRegistration = registration(mission, "governed_collective");
  const baselineRegistration = registration(mission, "centralized_baseline");
  const collective = await runRegisteredCollectiveEvaluationV1({
    registration: collectiveRegistration,
    mission,
  });
  const baseline = await runRegisteredCollectiveEvaluationV1({
    registration: baselineRegistration,
    mission,
  });
  assert.deepEqual(
    validateCollectiveEvaluationReportV1(collective),
    collective,
  );
  assert.equal(collective.status, "complete");
  assert.equal(baseline.status, "complete");
  for (const report of [collective, baseline]) {
    assert.equal(report.aggregate.authorizationViolations, 0);
    assert.equal(report.aggregate.staleFenceViolations, 0);
    assert.equal(report.aggregate.duplicateEffectViolations, 0);
    assert.equal(report.aggregate.exactReplayFailures, 0);
    assert.ok(report.aggregate.maximumInteractionsObserved <= 5_000);
    assert.equal(
      report.samples.every((sample) => sample.missionSuccess),
      true,
    );
  }
  const interval = pairedBootstrapSuccessDifferenceV1({
    collective: collective.samples.map((sample) => sample.missionSuccess),
    baseline: baseline.samples.map((sample) => sample.missionSuccess),
    seed: 123,
    resamples: 10_000,
  });
  const comparison = createCollectiveEvaluationComparisonV1({
    schemaVersion: 1,
    collectiveRegistrationDigest: collective.registration.registrationDigest,
    baselineRegistrationDigest: baseline.registration.registrationDigest,
    missionDigest: mission.missionDigest,
    pairedSuccessDifference: interval,
    equivalenceMargin: 0.05,
  });
  assert.equal(comparison.equivalent, true);
  assert.deepEqual(interval, {
    schemaVersion: 1,
    method: "paired_bootstrap_percentile_95",
    pairCount: 2,
    resamples: 10_000,
    estimate: 0,
    lower: 0,
    upper: 0,
  });
});

test("report validation rejects omissions, changed totals and hidden failures", async () => {
  const mission = createReferenceCollectiveMissionV1({ agentCount: 10 });
  const registered = registration(mission, "governed_collective", "nominal");
  const report = await runRegisteredCollectiveEvaluationV1({
    registration: registered,
    mission,
  });
  assert.throws(
    () =>
      validateCollectiveEvaluationReportV1({
        ...report,
        samples: report.samples.slice(1),
      }),
    /report status is inconsistent|digest is invalid/u,
  );
  const sample = await runCollectiveEvaluationSampleV1({
    registration: registered,
    mission,
    seed: registered.seeds[0],
  });
  assert.throws(
    () =>
      validateCollectiveEvaluationReportV1({
        ...report,
        samples: [
          {
            ...sample,
            interactionLedger: {
              ...sample.interactionLedger,
              total: sample.interactionLedger.total + 1,
            },
          },
          report.samples[1],
        ],
      }),
    /interaction ledger total|sample digest/u,
  );
});

test("statistical and role-coherence helpers meet fixed protocol bounds", () => {
  const interval = wilsonInterval95V1(80, 80);
  assert.ok(interval.lower >= 0.95);
  const mission = createReferenceCollectiveMissionV1({ agentCount: 50 });
  const role = runReferenceRoleCoherenceV1({ mission, seed: 7 });
  assert.equal(role.steps, 1_000);
  assert.equal(role.coherentSteps, 1_000);
  assert.equal(role.unsafeActions, 0);
  assert.ok(role.usefulDecisionRate >= 0.7);
});
