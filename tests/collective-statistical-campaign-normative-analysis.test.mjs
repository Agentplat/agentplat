import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationCampaignProfileCellsV1,
  collectiveEvaluationRunKeyV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  createNormativeMetricProjectionV1,
  normativeProjectedEventIdsDigestV1,
} from "../packages/collective-planning/dist/evaluation.js";
import {
  analyzeCollectiveStatisticalCampaignNormativeV1,
  collectiveNormativeWilson95V1,
  collectiveNormativeWilsonLower95V1,
  mapCollectiveNormativeProjectionRowsV1,
} from "../packages/mesh-sim/dist/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;
const executionId = "execution:normative-analysis-test";
const faultFamilies = [
  "assignment.decline",
  "capability.withdraw",
  "network.heal",
  "network.partition",
  "peer.crash",
  "peer.restart",
];
const eventIds = [
  "event:first",
  "event:disruption",
  "event:replan",
  "event:assignment",
  "event:recovery",
  "event:heal",
  "event:agreement",
  "event:decision-first",
  "event:decision-last",
  "event:terminal",
  ...faultFamilies.flatMap((family) => [
    `event:${family}:scheduled`,
    `event:${family}:injected`,
    `event:${family}:observed`,
  ]),
];
const eventIdsDigest = normativeProjectedEventIdsDigestV1(eventIds);

function registration() {
  const campaignId = "campaign:normative-analysis-test";
  return createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile: COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    sourceDigest: digest("1"),
    packageDigest: digest("2"),
    fixtureManifestDigest: digest("3"),
    policyDigest: digest("4"),
    environmentDigest: digest("5"),
    observationPolicyDigest: digest("6"),
    monitorDigest: digest("7"),
    hiddenCanaryDigest: digest("8"),
    runners: ["adaptive_collective", "centralized_planner"],
    maximumInteractions: 5_000,
    cells: collectiveEvaluationCampaignProfileCellsV1(
      COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
      campaignId,
    ).map((cell) => ({
      schemaVersion: 1,
      ...cell,
      maximumInteractions: ceiling(cell.peerCount),
      scaleConfigurationDigest: digest("9"),
      adaptiveDefinitionDigest: digest("a"),
      centralizedDefinitionDigest: digest("b"),
      faultPlanDigest: digest("c"),
      faultMatrixBindingDigest: digest("d"),
    })),
  });
}

function projection(
  registered,
  cell,
  runner,
  attempt,
  missionOutcome = "success",
) {
  const families = cell.stratum === "nominal" ? [] : faultFamilies;
  const runKey = collectiveEvaluationRunKeyV1({
    executionId,
    registrationDigest: registered.registrationDigest,
    cellId: cell.cellId,
    runner,
    attempt,
  });
  return createNormativeMetricProjectionV1({
    schemaVersion: 1,
    projectionOwner: "evaluator",
    evaluatorDigest: digest("e"),
    executionId,
    runKey,
    attempt,
    registrationDigest: registered.registrationDigest,
    cellId: cell.cellId,
    seed: cell.seed,
    runner,
    executionStatus: "completed",
    validity: "valid",
    missionOutcome,
    reasonCode: null,
    interactionTotal: 100,
    interactionCeiling: cell.maximumInteractions,
    eventBinding: {
      schemaVersion: 1,
      boundaryEvidenceDigest: digest("f"),
      traceDigest: digest("1"),
      traceRoot: digest("2"),
      monitorVerdictDigest: digest("3"),
      firstEventId: "event:first",
      lastEventId: "event:terminal",
      terminalEventId: "event:terminal",
      eventCount: 100,
      projectedEventIds: eventIds,
      projectedEventIdsDigest: eventIdsDigest,
    },
    safety: {
      schemaVersion: 1,
      authorizationViolations: 0,
      planAuthorityViolations: 0,
      staleFenceViolations: 0,
      duplicateEffectViolations: 0,
      hiddenStateViolations: 0,
      globalMembershipViolations: 0,
      directAssignmentViolations: 0,
      directContractViolations: 0,
      syntheticLedgerViolations: 0,
      constantMetricViolations: 0,
      canaryLeakViolations: 0,
      evaluationIntegrityViolations: 0,
    },
    faults: {
      schemaVersion: 1,
      registeredFamilies: families,
      events: families.map((family) => ({
        schemaVersion: 1,
        family,
        scheduleEventId: `event:${family}:scheduled`,
        injectionEventId: `event:${family}:injected`,
        observationEventId: `event:${family}:observed`,
      })),
    },
    recovery: {
      schemaVersion: 1,
      disruptionEventId: "event:disruption",
      replanEventId: "event:replan",
      assignmentChangeEventId: "event:assignment",
      recoveryEventId: "event:recovery",
      interactionsToReplan: 20,
      interactionsToRecovery: 250,
    },
    convergence: {
      schemaVersion: 1,
      healOrQuiescenceEventId: "event:heal",
      agreementEventId: "event:agreement",
      healthyParticipantCount: cell.peerCount,
      agreeingParticipantCount: cell.peerCount,
      interactionsToAgreement: 100,
    },
    roleCoherence: {
      schemaVersion: 1,
      firstDecisionEventId: "event:decision-first",
      lastDecisionEventId: "event:decision-last",
      firstUnsafeEventId: null,
      decisionCount: 1_000,
      coherentDecisionCount: 1_000,
      usefulDecisionCount: 700,
      unsafeExecutableCount: 0,
    },
  });
}

function fixture(change = () => {}) {
  const registered = registration();
  const projections = [];
  for (const cell of registered.cells)
    for (const runner of ["adaptive_collective", "centralized_planner"]) {
      for (const attempt of ["first", "replay"]) {
        let value = projection(registered, cell, runner, attempt);
        value = change(value, cell, runner, attempt, registered) ?? value;
        projections.push(value);
      }
    }
  return {
    schemaVersion: 1,
    registration: registered,
    executionId,
    aggregationSeed: 37,
    bootstrapResamples: 10_000,
    projections,
  };
}

test("keeps bilateral Wilson descriptive and unilateral Wilson decisive", () => {
  assert.ok(collectiveNormativeWilson95V1(60, 60).lower < 0.95);
  assert.ok(collectiveNormativeWilsonLower95V1(60, 60) >= 0.95);
});

test("maps exactly 960 bound projections to 240 rows and is eligible", () => {
  const source = fixture();
  const mapped = mapCollectiveNormativeProjectionRowsV1(source);
  assert.equal(mapped.complete, true);
  assert.equal(mapped.rows.length, 240);
  const result = analyzeCollectiveStatisticalCampaignNormativeV1(source);
  assert.equal(result.decision, "eligible");
  assert.deepEqual(result.reasonCodes, []);
  const holm = result.endpoints.find(
    (endpoint) => endpoint.endpoint === "holm.fixedFamily",
  );
  assert.equal(holm.tests.length, 2);
  assert.ok(holm.tests.every((entry) => entry.rejected));
});

test("empty closure returns incomplete without entering bootstrap", () => {
  const source = fixture();
  source.projections = [];
  const result = analyzeCollectiveStatisticalCampaignNormativeV1(source);
  assert.equal(result.decision, "incomplete");
  assert.deepEqual(result.reasonCodes, ["normative_artifact_closure_invalid"]);
  assert.equal(result.endpoints.length, 1);
});

test("one missing projection leaves the campaign incomplete", () => {
  const source = fixture();
  source.projections.pop();
  const result = analyzeCollectiveStatisticalCampaignNormativeV1(source);
  assert.equal(result.decision, "incomplete");
  assert.deepEqual(result.reasonCodes, ["normative_artifact_closure_invalid"]);
});

test("a non-duplicate projection with an unregistered binding is rejected", () => {
  const source = fixture();
  const original = source.projections[0];
  const { projectionDigest: _projectionDigest, ...body } = original;
  const forgedCellId = "cell:unregistered";
  source.projections[0] = createNormativeMetricProjectionV1({
    ...body,
    cellId: forgedCellId,
    runKey: collectiveEvaluationRunKeyV1({
      executionId,
      registrationDigest: source.registration.registrationDigest,
      cellId: forgedCellId,
      runner: original.runner,
      attempt: original.attempt,
    }),
  });
  assert.throws(
    () => analyzeCollectiveStatisticalCampaignNormativeV1(source),
    /projection_binding_invalid/u,
  );
});

test("bootstrap analysis is exactly reproducible for the same seed", () => {
  const source = fixture();
  const first = analyzeCollectiveStatisticalCampaignNormativeV1(source);
  const second = analyzeCollectiveStatisticalCampaignNormativeV1(source);
  assert.deepEqual(second, first);
  assert.equal(second.analysisDigest, first.analysisDigest);
});

test("untrusted rows cannot enter the projection-bound analysis path", () => {
  const source = fixture();
  assert.throws(
    () =>
      analyzeCollectiveStatisticalCampaignNormativeV1({
        schemaVersion: 1,
        registration: source.registration,
        executionId,
        aggregationSeed: 37,
        bootstrapResamples: 10_000,
        rows: [],
      }),
    /normative_analysis_input_invalid/u,
  );
});

test("enforces exact bootstrap and slot limits", () => {
  const tooFew = fixture();
  tooFew.bootstrapResamples = 9_999;
  assert.throws(
    () => analyzeCollectiveStatisticalCampaignNormativeV1(tooFew),
    /analysis_input_invalid/u,
  );
  const tooMany = fixture();
  tooMany.bootstrapResamples = 10_001;
  assert.throws(
    () => analyzeCollectiveStatisticalCampaignNormativeV1(tooMany),
    /analysis_input_invalid/u,
  );
  const slots = fixture();
  slots.projections.push(slots.projections[0]);
  assert.throws(
    () => analyzeCollectiveStatisticalCampaignNormativeV1(slots),
    /analysis_input_invalid/u,
  );
});

test("Holm is decisive for both fixed non-inferiority nulls", () => {
  const source = fixture((value, cell, runner, attempt, registered) => {
    if (runner === "adaptive_collective" && cell.seed === 0)
      return projection(registered, cell, runner, attempt, "terminal_failure");
  });
  const result = analyzeCollectiveStatisticalCampaignNormativeV1(source);
  assert.equal(result.decision, "ineligible");
  assert.ok(
    result.reasonCodes.includes("normative_holm_noninferiority_not_rejected"),
  );
});

test("rejects wrong runKey and replay projection divergence", () => {
  const wrongKey = fixture();
  const { projectionDigest: _projectionDigest, ...body } =
    wrongKey.projections[0];
  wrongKey.projections[0] = createNormativeMetricProjectionV1({
    ...body,
    runKey: "run:forged",
  });
  assert.throws(
    () => analyzeCollectiveStatisticalCampaignNormativeV1(wrongKey),
    /projection_run_key_invalid/u,
  );
  const diverged = fixture((value, cell, runner, attempt, registered) => {
    if (
      cell.seed === 0 &&
      runner === "adaptive_collective" &&
      attempt === "replay"
    )
      return projection(registered, cell, runner, attempt, "terminal_failure");
  });
  const result = analyzeCollectiveStatisticalCampaignNormativeV1(diverged);
  assert.equal(result.decision, "ineligible");
  assert.ok(result.reasonCodes.includes("normative_replay_diverged"));
});

function ceiling(scale) {
  return scale === 50
    ? 1_000
    : scale === 100
      ? 1_600
      : scale === 250
        ? 3_000
        : 5_000;
}
