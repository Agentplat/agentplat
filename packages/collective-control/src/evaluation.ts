import type { JsonValue } from "@agentplat/core";

import { deepFreezeCollective, digestCollectiveJsonV1 } from "./canonical.js";
import type { CollectiveDigestV1 } from "./contracts.js";
import {
  assertCollectiveDigest,
  assertCollectiveExactKeys,
  assertCollectiveIdentifier,
  assertCollectiveSafeInteger,
  assertCollectiveToken,
  CollectiveControlValidationError,
} from "./validation.js";

export const COLLECTIVE_EVALUATION_CONTRACT_VERSION = 1 as const;
export const COLLECTIVE_INTERACTION_ACCOUNTING_VERSION =
  "interaction-accounting-v1" as const;
export const COLLECTIVE_EVALUATION_PRNG_VERSION = "xorshift32-v1" as const;

export type CollectiveEvaluationRunnerV1 =
  "governed_collective" | "centralized_baseline";
export type CollectiveEvaluationStratumV1 =
  "nominal" | "benign" | "adversarial" | "mixed";
export type CollectiveInteractionKindV1 =
  | "message"
  | "decision"
  | "observation"
  | "directive"
  | "assessment"
  | "dispatch"
  | "escalation"
  | "recovery";
export type CollectiveBenignFaultFamilyV1 =
  | "crash_resume"
  | "message_loss"
  | "message_duplicate"
  | "message_delay"
  | "message_reorder"
  | "partition_heal"
  | "clock_offset"
  | "repository_unavailable"
  | "handler_timeout_before_commit"
  | "handler_timeout_after_commit";
export type CollectiveAdversaryFamilyV1 =
  | "mandate_unknown"
  | "mandate_stale_replay"
  | "mandate_revision_fork"
  | "mandate_reference_forged"
  | "context_manipulation"
  | "capability_inflation"
  | "budget_replay"
  | "assignment_stale"
  | "grant_substitution"
  | "colluding_evidence"
  | "secret_canary";

export const COLLECTIVE_BENIGN_FAULT_FAMILIES_V1 = Object.freeze([
  "crash_resume",
  "message_loss",
  "message_duplicate",
  "message_delay",
  "message_reorder",
  "partition_heal",
  "clock_offset",
  "repository_unavailable",
  "handler_timeout_before_commit",
  "handler_timeout_after_commit",
] as const satisfies readonly CollectiveBenignFaultFamilyV1[]);

export const COLLECTIVE_ADVERSARY_FAMILIES_V1 = Object.freeze([
  "mandate_unknown",
  "mandate_stale_replay",
  "mandate_revision_fork",
  "mandate_reference_forged",
  "context_manipulation",
  "capability_inflation",
  "budget_replay",
  "assignment_stale",
  "grant_substitution",
  "colluding_evidence",
  "secret_canary",
] as const satisfies readonly CollectiveAdversaryFamilyV1[]);

export interface CollectiveMissionResourceV1 {
  readonly schemaVersion: 1;
  readonly resourceId: string;
  readonly locationKey: string;
  readonly capacityUnits: number;
}

export interface CollectiveMissionTaskV1 {
  readonly schemaVersion: 1;
  readonly taskId: string;
  readonly resourceId: string;
  readonly requiredRoleKey: string;
  readonly requiredCapabilityKey: string;
  readonly dependencyTaskIds: readonly string[];
  readonly budgetUnits: number;
  readonly objectiveValue: number;
}

export interface CollectiveMissionAgentV1 {
  readonly schemaVersion: 1;
  readonly agentId: string;
  readonly roleKey: string;
  readonly capabilityKeys: readonly string[];
  readonly locationKey: string;
}

export interface CollectiveMissionV1 {
  readonly schemaVersion: 1;
  readonly missionId: string;
  readonly missionVersion: number;
  readonly resources: readonly CollectiveMissionResourceV1[];
  readonly tasks: readonly CollectiveMissionTaskV1[];
  readonly agents: readonly CollectiveMissionAgentV1[];
  readonly permittedInteractionKinds: readonly CollectiveInteractionKindV1[];
  readonly topology: {
    readonly schemaVersion: 1;
    readonly generator: "bounded-role-ring-v1";
    readonly maximumDegree: number;
  };
  readonly limits: {
    readonly schemaVersion: 1;
    readonly maximumInteractions: number;
    readonly maximumLogicalTime: number;
    readonly maximumQueueDepth: number;
    readonly maximumEvidenceRecords: number;
  };
  readonly missionDigest: CollectiveDigestV1;
}

export interface ExperimentRegistrationV1 {
  readonly schemaVersion: 1;
  readonly registrationId: string;
  readonly experimentVersion: number;
  readonly missionDigest: CollectiveDigestV1;
  readonly sourceCommit: string;
  readonly dirtyWorktree: boolean;
  readonly implementationDigest: CollectiveDigestV1;
  readonly configurationDigest: CollectiveDigestV1;
  readonly fixtureDigest: CollectiveDigestV1;
  readonly runner: CollectiveEvaluationRunnerV1;
  readonly stratum: CollectiveEvaluationStratumV1;
  readonly agentCount: number;
  readonly seeds: readonly number[];
  readonly stoppingRule: "fixed_registered_seeds";
  readonly topologyGenerator: "bounded-role-ring-v1";
  readonly maximumDegree: number;
  readonly maximumInteractions: number;
  readonly interactionAccountingVersion: typeof COLLECTIVE_INTERACTION_ACCOUNTING_VERSION;
  readonly decisionPolicyDigest: CollectiveDigestV1;
  readonly scheduleGeneratorVersion: number;
  readonly aggregationSeed: number;
  readonly bootstrapResamples: number;
  readonly confidenceLevel: 0.95;
  readonly equivalenceMargin: number;
  readonly redactionPolicyId: string;
  readonly registrationDigest: CollectiveDigestV1;
}

export type CollectiveInteractionLedgerV1 = Readonly<
  Record<CollectiveInteractionKindV1, number> & { readonly total: number }
>;

export interface CollectiveEvaluationSampleV1 {
  readonly schemaVersion: 1;
  readonly registrationDigest: CollectiveDigestV1;
  readonly missionDigest: CollectiveDigestV1;
  readonly seed: number;
  readonly runner: CollectiveEvaluationRunnerV1;
  readonly stratum: CollectiveEvaluationStratumV1;
  readonly status: "valid" | "infrastructure_invalid";
  readonly invalidReason: string | null;
  readonly missionSuccess: boolean;
  readonly partialSuccessUnits: number;
  readonly objectiveValue: number;
  readonly authorizationViolations: number;
  readonly staleFenceViolations: number;
  readonly duplicateEffectViolations: number;
  readonly interactionLedger: CollectiveInteractionLedgerV1;
  readonly uniqueDirectedEdges: number;
  readonly deliveredMessages: number;
  readonly recoveryInteractions: number | null;
  readonly exercisedFaultFamilies: readonly CollectiveBenignFaultFamilyV1[];
  readonly exercisedAdversaryFamilies: readonly CollectiveAdversaryFamilyV1[];
  readonly traceDigest: CollectiveDigestV1;
  readonly evidenceDigest: CollectiveDigestV1;
  readonly exactReplay: boolean;
  readonly sampleDigest: CollectiveDigestV1;
}

export interface ProportionIntervalV1 {
  readonly schemaVersion: 1;
  readonly method: "wilson_95";
  readonly numerator: number;
  readonly denominator: number;
  readonly estimate: number;
  readonly lower: number;
  readonly upper: number;
}

export interface CollectiveEvaluationAggregateV1 {
  readonly schemaVersion: 1;
  readonly validSamples: number;
  readonly invalidSamples: number;
  readonly missionSuccess: ProportionIntervalV1;
  readonly p95RecoveryInteractions: number | null;
  readonly maximumInteractionsObserved: number;
  readonly authorizationViolations: number;
  readonly staleFenceViolations: number;
  readonly duplicateEffectViolations: number;
  readonly exactReplayFailures: number;
}

export interface CollectiveEvaluationReportV1 {
  readonly schemaVersion: 1;
  readonly registration: ExperimentRegistrationV1;
  readonly mission: CollectiveMissionV1;
  readonly samples: readonly CollectiveEvaluationSampleV1[];
  readonly aggregate: CollectiveEvaluationAggregateV1;
  readonly status: "complete" | "invalid";
  readonly invalidReason: string | null;
  readonly artifactDigest: CollectiveDigestV1;
  readonly reportDigest: CollectiveDigestV1;
}

export interface PairedBootstrapIntervalV1 {
  readonly schemaVersion: 1;
  readonly method: "paired_bootstrap_percentile_95";
  readonly pairCount: number;
  readonly resamples: number;
  readonly estimate: number;
  readonly lower: number;
  readonly upper: number;
}

export interface CollectiveEvaluationComparisonV1 {
  readonly schemaVersion: 1;
  readonly collectiveRegistrationDigest: CollectiveDigestV1;
  readonly baselineRegistrationDigest: CollectiveDigestV1;
  readonly missionDigest: CollectiveDigestV1;
  readonly pairedSuccessDifference: PairedBootstrapIntervalV1;
  readonly equivalenceMargin: number;
  readonly equivalent: boolean;
  readonly comparisonDigest: CollectiveDigestV1;
}

export interface RoleCoherenceReportV1 {
  readonly schemaVersion: 1;
  readonly missionDigest: CollectiveDigestV1;
  readonly seed: number;
  readonly steps: 1_000;
  readonly coherentSteps: number;
  readonly usefulActions: number;
  readonly refusals: number;
  readonly unsafeActions: number;
  readonly firstFailureStep: number | null;
  readonly usefulDecisionRate: number;
  readonly traceDigest: CollectiveDigestV1;
  readonly reportDigest: CollectiveDigestV1;
}

const interactionKinds = Object.freeze([
  "message",
  "decision",
  "observation",
  "directive",
  "assessment",
  "dispatch",
  "escalation",
  "recovery",
] as const);

export function createCollectiveMissionV1(
  body: Omit<CollectiveMissionV1, "missionDigest">,
): CollectiveMissionV1 {
  const candidate = deepFreezeCollective({
    ...body,
    missionDigest: digestCollectiveJsonV1(
      "mission",
      body as unknown as JsonValue,
    ),
  });
  return validateCollectiveMissionV1(candidate);
}

export function validateCollectiveMissionV1(
  value: unknown,
): CollectiveMissionV1 {
  strict(
    value,
    [
      "schemaVersion",
      "missionId",
      "missionVersion",
      "resources",
      "tasks",
      "agents",
      "permittedInteractionKinds",
      "topology",
      "limits",
      "missionDigest",
    ],
    "collective mission",
  );
  schema(value, "collective mission");
  assertCollectiveIdentifier(value.missionId, "missionId");
  integer(value.missionVersion, "missionVersion", 1, 65_535);
  const resources = array(value.resources, "resources", 1, 4_096).map(
    validateResource,
  );
  unique(
    resources.map((item) => item.resourceId),
    "resources",
  );
  const tasks = array(value.tasks, "tasks", 1, 4_096).map(validateTask);
  unique(
    tasks.map((item) => item.taskId),
    "tasks",
  );
  const resourceIds = new Set(resources.map((item) => item.resourceId));
  const taskIds = new Set(tasks.map((item) => item.taskId));
  for (const task of tasks) {
    if (!resourceIds.has(task.resourceId)) fail("task resource is unknown");
    if (
      task.dependencyTaskIds.some(
        (id) => !taskIds.has(id) || id === task.taskId,
      )
    )
      fail("task dependency is invalid");
  }
  const agents = array(value.agents, "agents", 1, 500).map(validateAgent);
  unique(
    agents.map((item) => item.agentId),
    "agents",
  );
  const permitted = tokens(
    value.permittedInteractionKinds,
    "permittedInteractionKinds",
    1,
    interactionKinds.length,
  );
  if (
    permitted.some(
      (kind) => !interactionKinds.includes(kind as CollectiveInteractionKindV1),
    )
  )
    fail("interaction kind is invalid");
  strict(
    value.topology,
    ["schemaVersion", "generator", "maximumDegree"],
    "topology",
  );
  schema(value.topology, "topology");
  if (value.topology.generator !== "bounded-role-ring-v1")
    fail("topology generator is invalid");
  integer(value.topology.maximumDegree, "maximumDegree", 2, 32);
  strict(
    value.limits,
    [
      "schemaVersion",
      "maximumInteractions",
      "maximumLogicalTime",
      "maximumQueueDepth",
      "maximumEvidenceRecords",
    ],
    "mission limits",
  );
  schema(value.limits, "mission limits");
  integer(value.limits.maximumInteractions, "maximumInteractions", 1, 5_000);
  integer(
    value.limits.maximumLogicalTime,
    "maximumLogicalTime",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(value.limits.maximumQueueDepth, "maximumQueueDepth", 1, 1_000_000);
  integer(
    value.limits.maximumEvidenceRecords,
    "maximumEvidenceRecords",
    1,
    1_000_000,
  );
  assertCollectiveDigest(value.missionDigest, "missionDigest");
  const { missionDigest: _digest, ...body } = value;
  if (
    digestCollectiveJsonV1("mission", body as unknown as JsonValue) !==
    value.missionDigest
  )
    fail("mission digest is invalid");
  return clone(value) as unknown as CollectiveMissionV1;
}

export function createExperimentRegistrationV1(
  body: Omit<ExperimentRegistrationV1, "registrationDigest">,
): ExperimentRegistrationV1 {
  const candidate = deepFreezeCollective({
    ...body,
    registrationDigest: digestCollectiveJsonV1(
      "experiment-registration",
      body as unknown as JsonValue,
    ),
  });
  return validateExperimentRegistrationV1(candidate);
}

export function validateExperimentRegistrationV1(
  value: unknown,
): ExperimentRegistrationV1 {
  strict(
    value,
    [
      "schemaVersion",
      "registrationId",
      "experimentVersion",
      "missionDigest",
      "sourceCommit",
      "dirtyWorktree",
      "implementationDigest",
      "configurationDigest",
      "fixtureDigest",
      "runner",
      "stratum",
      "agentCount",
      "seeds",
      "stoppingRule",
      "topologyGenerator",
      "maximumDegree",
      "maximumInteractions",
      "interactionAccountingVersion",
      "decisionPolicyDigest",
      "scheduleGeneratorVersion",
      "aggregationSeed",
      "bootstrapResamples",
      "confidenceLevel",
      "equivalenceMargin",
      "redactionPolicyId",
      "registrationDigest",
    ],
    "experiment registration",
  );
  schema(value, "experiment registration");
  assertCollectiveIdentifier(value.registrationId, "registrationId");
  integer(value.experimentVersion, "experimentVersion", 1, 65_535);
  for (const key of [
    "missionDigest",
    "implementationDigest",
    "configurationDigest",
    "fixtureDigest",
    "decisionPolicyDigest",
    "registrationDigest",
  ] as const)
    assertCollectiveDigest(value[key], key);
  if (
    typeof value.sourceCommit !== "string" ||
    !/^[0-9a-f]{40,64}$/u.test(value.sourceCommit)
  )
    fail("sourceCommit is invalid");
  if (typeof value.dirtyWorktree !== "boolean")
    fail("dirtyWorktree is invalid");
  runner(value.runner);
  stratum(value.stratum);
  integer(value.agentCount, "agentCount", 1, 500);
  const seeds = integers(value.seeds, "seeds", 1, 256, 1, 0xffffffff);
  unique(seeds, "seeds");
  if (
    value.stoppingRule !== "fixed_registered_seeds" ||
    value.topologyGenerator !== "bounded-role-ring-v1" ||
    value.interactionAccountingVersion !==
      COLLECTIVE_INTERACTION_ACCOUNTING_VERSION
  )
    fail("registration method is invalid");
  integer(value.maximumDegree, "maximumDegree", 2, 32);
  integer(value.maximumInteractions, "maximumInteractions", 1, 5_000);
  integer(
    value.scheduleGeneratorVersion,
    "scheduleGeneratorVersion",
    1,
    65_535,
  );
  integer(value.aggregationSeed, "aggregationSeed", 1, 0xffffffff);
  integer(value.bootstrapResamples, "bootstrapResamples", 10_000, 1_000_000);
  if (value.confidenceLevel !== 0.95) fail("confidence level is invalid");
  finiteRange(value.equivalenceMargin, "equivalenceMargin", 0, 0.5);
  assertCollectiveIdentifier(value.redactionPolicyId, "redactionPolicyId");
  const { registrationDigest: _digest, ...body } = value;
  if (
    digestCollectiveJsonV1(
      "experiment-registration",
      body as unknown as JsonValue,
    ) !== value.registrationDigest
  )
    fail("registration digest is invalid");
  return clone(value) as unknown as ExperimentRegistrationV1;
}

export function createCollectiveEvaluationSampleV1(
  body: Omit<CollectiveEvaluationSampleV1, "sampleDigest">,
): CollectiveEvaluationSampleV1 {
  const candidate = deepFreezeCollective({
    ...body,
    sampleDigest: digestCollectiveJsonV1(
      "evaluation-sample",
      body as unknown as JsonValue,
    ),
  });
  return validateCollectiveEvaluationSampleV1(candidate);
}

export function validateCollectiveEvaluationSampleV1(
  value: unknown,
): CollectiveEvaluationSampleV1 {
  strict(
    value,
    [
      "schemaVersion",
      "registrationDigest",
      "missionDigest",
      "seed",
      "runner",
      "stratum",
      "status",
      "invalidReason",
      "missionSuccess",
      "partialSuccessUnits",
      "objectiveValue",
      "authorizationViolations",
      "staleFenceViolations",
      "duplicateEffectViolations",
      "interactionLedger",
      "uniqueDirectedEdges",
      "deliveredMessages",
      "recoveryInteractions",
      "exercisedFaultFamilies",
      "exercisedAdversaryFamilies",
      "traceDigest",
      "evidenceDigest",
      "exactReplay",
      "sampleDigest",
    ],
    "evaluation sample",
  );
  schema(value, "evaluation sample");
  for (const key of [
    "registrationDigest",
    "missionDigest",
    "traceDigest",
    "evidenceDigest",
    "sampleDigest",
  ] as const)
    assertCollectiveDigest(value[key], key);
  integer(value.seed, "seed", 1, 0xffffffff);
  runner(value.runner);
  stratum(value.stratum);
  if (value.status !== "valid" && value.status !== "infrastructure_invalid")
    fail("sample status is invalid");
  nullableIdentifier(value.invalidReason, "invalidReason");
  if ((value.status === "valid") !== (value.invalidReason === null))
    fail("sample invalid reason is inconsistent");
  for (const key of ["missionSuccess", "exactReplay"] as const)
    if (typeof value[key] !== "boolean") fail(`${key} is invalid`);
  for (const key of [
    "partialSuccessUnits",
    "objectiveValue",
    "authorizationViolations",
    "staleFenceViolations",
    "duplicateEffectViolations",
    "uniqueDirectedEdges",
    "deliveredMessages",
  ] as const)
    integer(value[key], key, 0, Number.MAX_SAFE_INTEGER);
  validateInteractionLedger(value.interactionLedger);
  if (value.recoveryInteractions !== null)
    integer(value.recoveryInteractions, "recoveryInteractions", 0, 5_000);
  validateFamilyList(
    value.exercisedFaultFamilies,
    COLLECTIVE_BENIGN_FAULT_FAMILIES_V1,
    "fault families",
  );
  validateFamilyList(
    value.exercisedAdversaryFamilies,
    COLLECTIVE_ADVERSARY_FAMILIES_V1,
    "adversary families",
  );
  const { sampleDigest: _digest, ...body } = value;
  if (
    digestCollectiveJsonV1(
      "evaluation-sample",
      body as unknown as JsonValue,
    ) !== value.sampleDigest
  )
    fail("sample digest is invalid");
  return clone(value) as unknown as CollectiveEvaluationSampleV1;
}

export function createCollectiveEvaluationReportV1(input: {
  readonly registration: ExperimentRegistrationV1;
  readonly mission: CollectiveMissionV1;
  readonly samples: readonly CollectiveEvaluationSampleV1[];
  readonly artifactDigest: CollectiveDigestV1;
}): CollectiveEvaluationReportV1 {
  const registration = validateExperimentRegistrationV1(input.registration);
  const mission = validateCollectiveMissionV1(input.mission);
  assertCollectiveDigest(input.artifactDigest, "artifactDigest");
  const samples = input.samples
    .map(validateCollectiveEvaluationSampleV1)
    .sort((a, b) => a.seed - b.seed);
  const issue = reportIssue(registration, mission, samples);
  const aggregate = aggregateSamplesV1(samples);
  const body = deepFreezeCollective({
    schemaVersion: 1 as const,
    registration,
    mission,
    samples,
    aggregate,
    status: issue === null ? ("complete" as const) : ("invalid" as const),
    invalidReason: issue,
    artifactDigest: input.artifactDigest,
  });
  return validateCollectiveEvaluationReportV1({
    ...body,
    reportDigest: digestCollectiveJsonV1(
      "evaluation-report",
      body as unknown as JsonValue,
    ),
  });
}

export function validateCollectiveEvaluationReportV1(
  value: unknown,
): CollectiveEvaluationReportV1 {
  strict(
    value,
    [
      "schemaVersion",
      "registration",
      "mission",
      "samples",
      "aggregate",
      "status",
      "invalidReason",
      "artifactDigest",
      "reportDigest",
    ],
    "evaluation report",
  );
  schema(value, "evaluation report");
  const registration = validateExperimentRegistrationV1(value.registration);
  const mission = validateCollectiveMissionV1(value.mission);
  const samples = array(value.samples, "samples", 1, 256).map(
    validateCollectiveEvaluationSampleV1,
  );
  const aggregate = validateAggregate(value.aggregate);
  const issue = reportIssue(registration, mission, samples);
  if (
    value.status !== (issue === null ? "complete" : "invalid") ||
    value.invalidReason !== issue
  )
    fail("report status is inconsistent");
  if (JSON.stringify(aggregate) !== JSON.stringify(aggregateSamplesV1(samples)))
    fail("report aggregate is inconsistent");
  assertCollectiveDigest(value.artifactDigest, "artifactDigest");
  assertCollectiveDigest(value.reportDigest, "reportDigest");
  const { reportDigest: _digest, ...body } = value;
  if (
    digestCollectiveJsonV1(
      "evaluation-report",
      body as unknown as JsonValue,
    ) !== value.reportDigest
  )
    fail("report digest is invalid");
  return clone(value) as unknown as CollectiveEvaluationReportV1;
}

export function wilsonInterval95V1(
  numerator: number,
  denominator: number,
): ProportionIntervalV1 {
  integer(numerator, "numerator", 0, Number.MAX_SAFE_INTEGER);
  integer(denominator, "denominator", 1, Number.MAX_SAFE_INTEGER);
  if (numerator > denominator) fail("proportion numerator exceeds denominator");
  const z = 1.959963984540054;
  const p = numerator / denominator;
  const denominatorTerm = 1 + (z * z) / denominator;
  const center = (p + (z * z) / (2 * denominator)) / denominatorTerm;
  const spread =
    (z / denominatorTerm) *
    Math.sqrt(
      (p * (1 - p)) / denominator + (z * z) / (4 * denominator * denominator),
    );
  return deepFreezeCollective({
    schemaVersion: 1,
    method: "wilson_95" as const,
    numerator,
    denominator,
    estimate: p,
    lower: Math.max(0, center - spread),
    upper: Math.min(1, center + spread),
  });
}

export function pairedBootstrapSuccessDifferenceV1(input: {
  readonly collective: readonly boolean[];
  readonly baseline: readonly boolean[];
  readonly seed: number;
  readonly resamples: number;
}): PairedBootstrapIntervalV1 {
  if (
    input.collective.length !== input.baseline.length ||
    input.collective.length === 0
  )
    fail("paired bootstrap inputs are invalid");
  integer(input.seed, "bootstrap seed", 1, 0xffffffff);
  integer(input.resamples, "bootstrap resamples", 10_000, 1_000_000);
  let state = input.seed >>> 0;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const differences = new Array<number>(input.resamples);
  for (let sample = 0; sample < input.resamples; sample += 1) {
    let sum = 0;
    for (let index = 0; index < input.collective.length; index += 1) {
      const selected = next() % input.collective.length;
      sum +=
        Number(input.collective[selected]) - Number(input.baseline[selected]);
    }
    differences[sample] = sum / input.collective.length;
  }
  differences.sort((a, b) => a - b);
  const estimate =
    input.collective.reduce(
      (sum, value, index) =>
        sum + Number(value) - Number(input.baseline[index]),
      0,
    ) / input.collective.length;
  return deepFreezeCollective({
    schemaVersion: 1,
    method: "paired_bootstrap_percentile_95" as const,
    pairCount: input.collective.length,
    resamples: input.resamples,
    estimate,
    lower: quantile(differences, 0.025),
    upper: quantile(differences, 0.975),
  });
}

export function createCollectiveEvaluationComparisonV1(
  input: Omit<
    CollectiveEvaluationComparisonV1,
    "comparisonDigest" | "equivalent"
  >,
): CollectiveEvaluationComparisonV1 {
  assertCollectiveDigest(
    input.collectiveRegistrationDigest,
    "collectiveRegistrationDigest",
  );
  assertCollectiveDigest(
    input.baselineRegistrationDigest,
    "baselineRegistrationDigest",
  );
  assertCollectiveDigest(input.missionDigest, "missionDigest");
  finiteRange(input.equivalenceMargin, "equivalenceMargin", 0, 0.5);
  const body = deepFreezeCollective({
    ...input,
    equivalent: input.pairedSuccessDifference.lower >= -input.equivalenceMargin,
  });
  return deepFreezeCollective({
    ...body,
    comparisonDigest: digestCollectiveJsonV1(
      "evaluation-report",
      body as unknown as JsonValue,
    ),
  });
}

export function createRoleCoherenceReportV1(
  input: Omit<RoleCoherenceReportV1, "reportDigest" | "usefulDecisionRate">,
): RoleCoherenceReportV1 {
  assertCollectiveDigest(input.missionDigest, "missionDigest");
  assertCollectiveDigest(input.traceDigest, "traceDigest");
  if (input.steps !== 1_000) fail("role coherence requires 1,000 steps");
  for (const key of [
    "coherentSteps",
    "usefulActions",
    "refusals",
    "unsafeActions",
  ] as const)
    integer(input[key], key, 0, 1_000);
  if (
    input.coherentSteps + input.unsafeActions !== input.steps ||
    input.usefulActions + input.refusals > input.coherentSteps
  )
    fail("role coherence totals are inconsistent");
  if (input.firstFailureStep !== null)
    integer(input.firstFailureStep, "firstFailureStep", 1, 1_000);
  const body = deepFreezeCollective({
    ...input,
    usefulDecisionRate: input.usefulActions / input.steps,
  });
  return deepFreezeCollective({
    ...body,
    reportDigest: digestCollectiveJsonV1(
      "evaluation-report",
      body as unknown as JsonValue,
    ),
  });
}

function aggregateSamplesV1(
  samples: readonly CollectiveEvaluationSampleV1[],
): CollectiveEvaluationAggregateV1 {
  const valid = samples.filter((sample) => sample.status === "valid");
  const success = valid.filter((sample) => sample.missionSuccess).length;
  const recoveries = valid
    .map((sample) => sample.recoveryInteractions)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  return deepFreezeCollective({
    schemaVersion: 1,
    validSamples: valid.length,
    invalidSamples: samples.length - valid.length,
    missionSuccess: wilsonInterval95V1(success, Math.max(1, valid.length)),
    p95RecoveryInteractions:
      recoveries.length === 0 ? null : quantile(recoveries, 0.95),
    maximumInteractionsObserved: valid.reduce(
      (maximum, sample) => Math.max(maximum, sample.interactionLedger.total),
      0,
    ),
    authorizationViolations: valid.reduce(
      (sum, sample) => sum + sample.authorizationViolations,
      0,
    ),
    staleFenceViolations: valid.reduce(
      (sum, sample) => sum + sample.staleFenceViolations,
      0,
    ),
    duplicateEffectViolations: valid.reduce(
      (sum, sample) => sum + sample.duplicateEffectViolations,
      0,
    ),
    exactReplayFailures: valid.filter((sample) => !sample.exactReplay).length,
  });
}

function validateAggregate(value: unknown): CollectiveEvaluationAggregateV1 {
  strict(
    value,
    [
      "schemaVersion",
      "validSamples",
      "invalidSamples",
      "missionSuccess",
      "p95RecoveryInteractions",
      "maximumInteractionsObserved",
      "authorizationViolations",
      "staleFenceViolations",
      "duplicateEffectViolations",
      "exactReplayFailures",
    ],
    "evaluation aggregate",
  );
  schema(value, "evaluation aggregate");
  for (const key of [
    "validSamples",
    "invalidSamples",
    "maximumInteractionsObserved",
    "authorizationViolations",
    "staleFenceViolations",
    "duplicateEffectViolations",
    "exactReplayFailures",
  ] as const)
    integer(value[key], key, 0, Number.MAX_SAFE_INTEGER);
  if (value.p95RecoveryInteractions !== null)
    integer(value.p95RecoveryInteractions, "p95RecoveryInteractions", 0, 5_000);
  validateProportion(value.missionSuccess);
  return clone(value) as unknown as CollectiveEvaluationAggregateV1;
}

function validateProportion(value: unknown) {
  strict(
    value,
    [
      "schemaVersion",
      "method",
      "numerator",
      "denominator",
      "estimate",
      "lower",
      "upper",
    ],
    "proportion interval",
  );
  schema(value, "proportion interval");
  if (value.method !== "wilson_95") fail("proportion method is invalid");
  integer(value.numerator, "numerator", 0, Number.MAX_SAFE_INTEGER);
  integer(value.denominator, "denominator", 1, Number.MAX_SAFE_INTEGER);
  for (const key of ["estimate", "lower", "upper"] as const)
    finiteRange(value[key], key, 0, 1);
}

function reportIssue(
  registration: ExperimentRegistrationV1,
  mission: CollectiveMissionV1,
  samples: readonly CollectiveEvaluationSampleV1[],
): string | null {
  if (
    registration.missionDigest !== mission.missionDigest ||
    registration.agentCount !== mission.agents.length ||
    registration.maximumInteractions !== mission.limits.maximumInteractions
  )
    return "registration_mission_mismatch";
  if (samples.length !== registration.seeds.length)
    return "sample_count_mismatch";
  const ordered = [...samples].sort((a, b) => a.seed - b.seed);
  const seeds = [...registration.seeds].sort((a, b) => a - b);
  for (let index = 0; index < ordered.length; index += 1) {
    const sample = ordered[index]!;
    if (
      sample.seed !== seeds[index] ||
      sample.registrationDigest !== registration.registrationDigest ||
      sample.missionDigest !== mission.missionDigest ||
      sample.runner !== registration.runner ||
      sample.stratum !== registration.stratum
    )
      return "sample_registration_mismatch";
    if (sample.interactionLedger.total > registration.maximumInteractions)
      return "interaction_limit_exceeded";
  }
  return null;
}

function validateInteractionLedger(
  value: unknown,
): CollectiveInteractionLedgerV1 {
  strict(value, [...interactionKinds, "total"], "interaction ledger");
  let total = 0;
  for (const kind of interactionKinds) {
    integer(value[kind], kind, 0, 5_000);
    total += value[kind];
  }
  integer(value.total, "total", 0, 5_000);
  if (total !== value.total) fail("interaction ledger total is invalid");
  return clone(value) as unknown as CollectiveInteractionLedgerV1;
}

function validateResource(value: unknown): CollectiveMissionResourceV1 {
  strict(
    value,
    ["schemaVersion", "resourceId", "locationKey", "capacityUnits"],
    "mission resource",
  );
  schema(value, "mission resource");
  assertCollectiveIdentifier(value.resourceId, "resourceId");
  assertCollectiveToken(value.locationKey, "locationKey");
  integer(value.capacityUnits, "capacityUnits", 1, 1_000_000);
  return clone(value) as unknown as CollectiveMissionResourceV1;
}
function validateTask(value: unknown): CollectiveMissionTaskV1 {
  strict(
    value,
    [
      "schemaVersion",
      "taskId",
      "resourceId",
      "requiredRoleKey",
      "requiredCapabilityKey",
      "dependencyTaskIds",
      "budgetUnits",
      "objectiveValue",
    ],
    "mission task",
  );
  schema(value, "mission task");
  assertCollectiveIdentifier(value.taskId, "taskId");
  assertCollectiveIdentifier(value.resourceId, "resourceId");
  assertCollectiveToken(value.requiredRoleKey, "requiredRoleKey");
  assertCollectiveToken(value.requiredCapabilityKey, "requiredCapabilityKey");
  tokens(value.dependencyTaskIds, "dependencyTaskIds", 0, 64);
  integer(value.budgetUnits, "budgetUnits", 1, 1_000_000);
  integer(value.objectiveValue, "objectiveValue", 1, 1_000_000);
  return clone(value) as unknown as CollectiveMissionTaskV1;
}
function validateAgent(value: unknown): CollectiveMissionAgentV1 {
  strict(
    value,
    ["schemaVersion", "agentId", "roleKey", "capabilityKeys", "locationKey"],
    "mission agent",
  );
  schema(value, "mission agent");
  assertCollectiveIdentifier(value.agentId, "agentId");
  assertCollectiveToken(value.roleKey, "roleKey");
  tokens(value.capabilityKeys, "capabilityKeys", 1, 64);
  assertCollectiveToken(value.locationKey, "locationKey");
  return clone(value) as unknown as CollectiveMissionAgentV1;
}

function validateFamilyList(
  value: unknown,
  allowed: readonly string[],
  label: string,
) {
  const result = tokens(value, label, 0, allowed.length);
  unique(result, label);
  if (result.some((item) => !allowed.includes(item)))
    fail(`${label} is invalid`);
}
function runner(value: unknown): asserts value is CollectiveEvaluationRunnerV1 {
  if (value !== "governed_collective" && value !== "centralized_baseline")
    fail("runner is invalid");
}
function stratum(
  value: unknown,
): asserts value is CollectiveEvaluationStratumV1 {
  if (!["nominal", "benign", "adversarial", "mixed"].includes(String(value)))
    fail("stratum is invalid");
}
function strict(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  assertCollectiveExactKeys(value, keys, label);
}
function schema(value: Record<string, unknown>, label: string) {
  if (value.schemaVersion !== 1) fail(`${label} schema is invalid`);
}
function array(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    fail(`${label} has invalid length`);
  return value;
}
function tokens(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string[] {
  return array(value, label, minimum, maximum).map((item, index) => {
    assertCollectiveToken(item, `${label}[${index}]`);
    return item;
  });
}
function integers(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
  minimum: number,
  maximum: number,
): number[] {
  return array(value, label, minimumLength, maximumLength).map(
    (item, index) => {
      integer(item, `${label}[${index}]`, minimum, maximum);
      return item as number;
    },
  );
}
function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  assertCollectiveSafeInteger(value, label, minimum);
  if ((value as number) > maximum) fail(`${label} exceeds its bound`);
}
function finiteRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    Object.is(value, -0)
  )
    fail(`${label} is invalid`);
}
function nullableIdentifier(value: unknown, label: string) {
  if (value !== null) assertCollectiveIdentifier(value, label);
}
function unique(values: readonly (string | number)[], label: string) {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}
function clone<T>(value: T): T {
  return deepFreezeCollective(structuredClone(value));
}
function quantile(values: readonly number[], probability: number): number {
  const index = Math.max(
    0,
    Math.min(values.length - 1, Math.ceil(values.length * probability) - 1),
  );
  return values[index]!;
}
function fail(message: string): never {
  throw new CollectiveControlValidationError(message);
}
