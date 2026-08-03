import assert from "node:assert/strict";

import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationRunKeyV1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  createNormativeMetricProjectionV1,
  createNormativeOperationPlanV1,
  createNormativeRunnerDescriptorV1,
  normativeProjectedEventIdsDigestV1,
} from "@agentplat/collective-planning/evaluation";
import {
  COLLECTIVE_NORMATIVE_ANALYSIS_RESAMPLES_V1,
  analyzeCollectiveStatisticalCampaignNormativeV1,
  runCollectiveStatisticalCampaignNormativeOperationV1,
} from "@agentplat/mesh-sim";

const digest = (character) => `sha256:${character.repeat(64)}`;
const campaignId = "consumer:normative-control-plane";
const registration = createCollectiveEvaluationCampaignRegistrationV1({
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
    maximumInteractions:
      cell.peerCount === 50
        ? 1_000
        : cell.peerCount === 100
          ? 1_600
          : cell.peerCount === 250
            ? 3_000
            : 5_000,
    scaleConfigurationDigest: digest("9"),
    adaptiveDefinitionDigest: digest("a"),
    centralizedDefinitionDigest: digest("b"),
    faultPlanDigest: digest("c"),
    faultMatrixBindingDigest: digest("d"),
  })),
});
const adapter = createNormativeRunnerDescriptorV1({
  schemaVersion: 1,
  adapterId: "consumer:normative-adapter",
  adapterVersion: "1.0.0",
  runnerClass: "normative_candidate",
  capabilities: {
    schemaVersion: 1,
    runners: ["adaptive_collective", "centralized_planner"],
    scales: [50, 100, 250, 500],
    strata: ["nominal", "benign", "adversarial", "mixed"],
    traceSchemaVersion: 2,
    accountingVersion: "interaction-accounting-v2",
    environmentPortVersion: 1,
    monitorPortVersion: 1,
    exactReplay: true,
    evaluatorOwnedMetrics: true,
  },
  digests: {
    schemaVersion: 1,
    implementationDigest: digest("1"),
    evaluatorDigest: digest("f"),
    scenarioDefinitionDigest: digest("2"),
    fixtureDigest: digest("3"),
    policyDigest: digest("4"),
    environmentDigest: digest("5"),
    observationPolicyDigest: digest("6"),
    monitorDigest: digest("7"),
  },
  limits: {
    schemaVersion: 1,
    maximumAgents: 500,
    maximumOutdegree: 9,
    maximumInteractionsPerExecution: 5_000,
    maximumTraceEventsPerExecution: 100_000,
    maximumArtifactBytesPerExecution: 67_108_864,
    maximumConcurrentCells: 1,
  },
});
const plan = createNormativeOperationPlanV1({
  schemaVersion: 1,
  registration,
  sourceCommit: "a".repeat(40),
  sourceTreeDigest: digest("e"),
  adapter,
});
assert.deepEqual(
  [plan.expectedCellCount, plan.expectedSlotCount, plan.shards.length],
  [240, 960, 48],
);
assert.equal(
  typeof runCollectiveStatisticalCampaignNormativeOperationV1,
  "function",
);

// Projections are evaluator-owned evidence, not a runner-supplied score.
const projectedEventIds = ["event:consumer:terminal"];
const executionId = "execution:consumer-control-plane";
const runKey = collectiveEvaluationRunKeyV1({
  executionId,
  registrationDigest: registration.registrationDigest,
  cellId: plan.cellIds[0],
  runner: "adaptive_collective",
  attempt: "first",
});
const projection = createNormativeMetricProjectionV1({
  schemaVersion: 1,
  projectionOwner: "evaluator",
  evaluatorDigest: digest("f"),
  executionId,
  runKey,
  attempt: "first",
  registrationDigest: registration.registrationDigest,
  cellId: plan.cellIds[0],
  seed: 0,
  runner: "adaptive_collective",
  executionStatus: "completed",
  validity: "valid",
  missionOutcome: "success",
  reasonCode: null,
  interactionTotal: 1,
  interactionCeiling: 1_000,
  eventBinding: {
    schemaVersion: 1,
    boundaryEvidenceDigest: digest("1"),
    traceDigest: digest("2"),
    traceRoot: digest("3"),
    monitorVerdictDigest: digest("4"),
    firstEventId: projectedEventIds[0],
    lastEventId: projectedEventIds[0],
    terminalEventId: projectedEventIds[0],
    eventCount: 1,
    projectedEventIds,
    projectedEventIdsDigest:
      normativeProjectedEventIdsDigestV1(projectedEventIds),
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
  faults: { schemaVersion: 1, registeredFamilies: [], events: [] },
  recovery: {
    schemaVersion: 1,
    disruptionEventId: null,
    replanEventId: null,
    assignmentChangeEventId: null,
    recoveryEventId: null,
    interactionsToReplan: null,
    interactionsToRecovery: null,
  },
  convergence: {
    schemaVersion: 1,
    healOrQuiescenceEventId: null,
    agreementEventId: null,
    healthyParticipantCount: 0,
    agreeingParticipantCount: 0,
    interactionsToAgreement: null,
  },
  roleCoherence: {
    schemaVersion: 1,
    firstDecisionEventId: null,
    lastDecisionEventId: null,
    firstUnsafeEventId: null,
    decisionCount: 0,
    coherentDecisionCount: 0,
    usefulDecisionCount: 0,
    unsafeExecutableCount: 0,
  },
});
assert.equal(projection.projectionOwner, "evaluator");

// Deliberately incomplete input must never produce eligibility or run work.
const analysis = analyzeCollectiveStatisticalCampaignNormativeV1({
  schemaVersion: 1,
  registration,
  executionId,
  aggregationSeed: 0,
  bootstrapResamples: COLLECTIVE_NORMATIVE_ANALYSIS_RESAMPLES_V1,
  projections: [],
});
assert.equal(analysis.decision, "incomplete");
assert.ok(analysis.reasonCodes.length > 0);
process.stdout.write(
  `${JSON.stringify({ status: "passed", campaign: "control-plane-only", cells: plan.expectedCellCount, slots: plan.expectedSlotCount, projectionOwner: projection.projectionOwner, analysis: analysis.decision })}\n`,
);
