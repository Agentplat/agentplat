import {
  deepFreezePlanning,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  MultiDomainEnvironmentDescriptorV1,
  MultiDomainScenarioManifestV1,
} from "./multi-domain-environment-contracts.js";
import {
  validateMultiDomainEnvironmentDescriptorV1,
  validateMultiDomainScenarioManifestV1,
} from "./multi-domain-environment-validation.js";
import {
  shardedSimulationDigestV1,
  shardedSimulationScaleProfileV1,
  type ShardedSimulationScaleProfileV1,
} from "./sharded-simulation-contracts.js";
import type {
  BenchmarkArtifactSourceLockV1,
  BenchmarkSuiteManifestV1,
  BenchmarkTraceEvidenceV1,
  EvaluationParticipantDescriptorV1,
  MetricProjectionV2,
  PairedBaselineEvidenceV1,
  VerifiedBenchmarkSubmissionV1,
} from "./verified-benchmark-contracts.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_CAPABILITIES = 64;
const MAXIMUM_IDENTIFIER_LENGTH = 256;
const MAXIMUM_INTERACTIONS = 1_000_000;
const BPS = 10_000;

export function verifiedBenchmarkDigestV1(
  domain: string,
  value: unknown,
): PlanningDigestV1 {
  return shardedSimulationDigestV1(`verified-benchmark/${domain}/v1`, value);
}

export function createEvaluationParticipantDescriptorV1(input: {
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly coordinationModel: "centralized" | "collective";
  readonly implementationDigest: PlanningDigestV1;
  readonly capabilities: readonly string[];
}): EvaluationParticipantDescriptorV1 {
  const value = object(
    input,
    "participant_descriptor_input",
  ) as unknown as EvaluationParticipantDescriptorV1;
  exact(
    value,
    [
      "adapterId",
      "adapterVersion",
      "coordinationModel",
      "implementationDigest",
      "capabilities",
    ],
    "participant_descriptor_input",
  );
  identifier(value.adapterId, "participant_adapter_id");
  positive(value.adapterVersion, "participant_adapter_version");
  if (
    value.coordinationModel !== "centralized" &&
    value.coordinationModel !== "collective"
  )
    fail("participant_coordination_model_invalid");
  digest(value.implementationDigest, "participant_implementation_digest");
  const capabilities = canonicalIdentifiers(
    value.capabilities,
    MAXIMUM_CAPABILITIES,
    "participant_capabilities",
  );
  const body = {
    schemaVersion: 1 as const,
    adapterId: value.adapterId,
    adapterVersion: value.adapterVersion,
    coordinationModel: value.coordinationModel,
    implementationDigest: value.implementationDigest,
    capabilities,
  };
  return freeze({
    ...body,
    descriptorDigest: verifiedBenchmarkDigestV1("participant-descriptor", body),
  });
}

export function validateEvaluationParticipantDescriptorV1(
  input: unknown,
): EvaluationParticipantDescriptorV1 {
  const value = object(
    input,
    "participant_descriptor",
  ) as unknown as EvaluationParticipantDescriptorV1;
  exact(
    value,
    [
      "schemaVersion",
      "adapterId",
      "adapterVersion",
      "coordinationModel",
      "implementationDigest",
      "capabilities",
      "descriptorDigest",
    ],
    "participant_descriptor",
  );
  if (value.schemaVersion !== 1) fail("participant_descriptor_schema_invalid");
  const rebuilt = createEvaluationParticipantDescriptorV1({
    adapterId: value.adapterId,
    adapterVersion: value.adapterVersion,
    coordinationModel: value.coordinationModel,
    implementationDigest: value.implementationDigest,
    capabilities: value.capabilities,
  });
  same(value, rebuilt, "participant_descriptor_digest_invalid");
  return rebuilt;
}

export function createBenchmarkArtifactSourceLockV1(input: {
  readonly sourceId: string;
  readonly sourceDigest: PlanningDigestV1;
  readonly artifactId: string;
  readonly artifactDigest: PlanningDigestV1;
  readonly buildDigest: PlanningDigestV1;
}): BenchmarkArtifactSourceLockV1 {
  const value = object(
    input,
    "artifact_lock_input",
  ) as unknown as BenchmarkArtifactSourceLockV1;
  exact(
    value,
    ["sourceId", "sourceDigest", "artifactId", "artifactDigest", "buildDigest"],
    "artifact_lock_input",
  );
  identifier(value.sourceId, "source_id");
  identifier(value.artifactId, "artifact_id");
  digest(value.sourceDigest, "source_digest");
  digest(value.artifactDigest, "artifact_digest");
  digest(value.buildDigest, "build_digest");
  const body = {
    schemaVersion: 1 as const,
    sourceId: value.sourceId,
    sourceDigest: value.sourceDigest,
    artifactId: value.artifactId,
    artifactDigest: value.artifactDigest,
    buildDigest: value.buildDigest,
  };
  return freeze({
    ...body,
    lockDigest: verifiedBenchmarkDigestV1("artifact-source-lock", body),
  });
}

export function validateBenchmarkArtifactSourceLockV1(
  input: unknown,
): BenchmarkArtifactSourceLockV1 {
  const value = object(
    input,
    "artifact_lock",
  ) as unknown as BenchmarkArtifactSourceLockV1;
  exact(
    value,
    [
      "schemaVersion",
      "sourceId",
      "sourceDigest",
      "artifactId",
      "artifactDigest",
      "buildDigest",
      "lockDigest",
    ],
    "artifact_lock",
  );
  if (value.schemaVersion !== 1) fail("artifact_lock_schema_invalid");
  const rebuilt = createBenchmarkArtifactSourceLockV1({
    sourceId: value.sourceId,
    sourceDigest: value.sourceDigest,
    artifactId: value.artifactId,
    artifactDigest: value.artifactDigest,
    buildDigest: value.buildDigest,
  });
  same(value, rebuilt, "artifact_lock_digest_invalid");
  return rebuilt;
}

export function createBenchmarkSuiteManifestV1(input: {
  readonly suiteId: string;
  readonly suiteVersion: number;
  readonly environmentDescriptor: MultiDomainEnvironmentDescriptorV1;
  readonly scenarioManifest: MultiDomainScenarioManifestV1;
  readonly baselineParticipant: EvaluationParticipantDescriptorV1;
  readonly baselineArtifactLock: BenchmarkArtifactSourceLockV1;
}): BenchmarkSuiteManifestV1 {
  const value = object(input, "suite_manifest_input") as Record<
    string,
    unknown
  >;
  exact(
    value,
    [
      "suiteId",
      "suiteVersion",
      "environmentDescriptor",
      "scenarioManifest",
      "baselineParticipant",
      "baselineArtifactLock",
    ],
    "suite_manifest_input",
  );
  identifier(value.suiteId, "suite_id");
  positive(value.suiteVersion, "suite_version");
  const environment = validateMultiDomainEnvironmentDescriptorV1(
    value.environmentDescriptor,
  );
  const scenario = validateMultiDomainScenarioManifestV1(
    value.scenarioManifest,
    environment,
  );
  const profile = canonicalProfile(scenario.scaleProfileId);
  const baselineParticipant = validateEvaluationParticipantDescriptorV1(
    value.baselineParticipant,
  );
  const baselineArtifactLock = validateBenchmarkArtifactSourceLockV1(
    value.baselineArtifactLock,
  );
  const resourceBudgetDigest = verifiedBenchmarkDigestV1(
    "scenario-resource-budget",
    scenario.resourceBudget,
  );
  const body = {
    schemaVersion: 1 as const,
    suiteId: value.suiteId as string,
    suiteVersion: value.suiteVersion as number,
    environmentDescriptorDigest: environment.descriptorDigest,
    scenarioManifest: scenario,
    scaleProfile: profile,
    seed: scenario.seed,
    resourceBudgetDigest,
    baselineParticipant,
    baselineArtifactLock,
  };
  return freeze({
    ...body,
    manifestDigest: verifiedBenchmarkDigestV1("suite-manifest", body),
  });
}

export function validateBenchmarkSuiteManifestV1(
  input: unknown,
  environmentDescriptor: MultiDomainEnvironmentDescriptorV1,
): BenchmarkSuiteManifestV1 {
  const value = object(
    input,
    "suite_manifest",
  ) as unknown as BenchmarkSuiteManifestV1;
  exact(
    value,
    [
      "schemaVersion",
      "suiteId",
      "suiteVersion",
      "environmentDescriptorDigest",
      "scenarioManifest",
      "scaleProfile",
      "seed",
      "resourceBudgetDigest",
      "baselineParticipant",
      "baselineArtifactLock",
      "manifestDigest",
    ],
    "suite_manifest",
  );
  if (value.schemaVersion !== 1) fail("suite_manifest_schema_invalid");
  const environment = validateMultiDomainEnvironmentDescriptorV1(
    environmentDescriptor,
  );
  if (value.environmentDescriptorDigest !== environment.descriptorDigest)
    fail("suite_environment_binding_invalid");
  const rebuilt = createBenchmarkSuiteManifestV1({
    suiteId: value.suiteId,
    suiteVersion: value.suiteVersion,
    environmentDescriptor: environment,
    scenarioManifest: value.scenarioManifest,
    baselineParticipant: value.baselineParticipant,
    baselineArtifactLock: value.baselineArtifactLock,
  });
  same(value, rebuilt, "suite_manifest_digest_invalid");
  return rebuilt;
}

export function createBenchmarkTraceEvidenceV1(input: {
  readonly traceId: string;
  readonly participantDescriptor: EvaluationParticipantDescriptorV1;
  readonly scenarioManifest: MultiDomainScenarioManifestV1;
  readonly artifactLock: BenchmarkArtifactSourceLockV1;
  readonly interactionCount: number;
  readonly successfulObjectiveCount: number;
  readonly recoveryToBaselineCount: number;
  readonly roleCoherenceLength: number;
}): BenchmarkTraceEvidenceV1 {
  const value = object(input, "trace_evidence_input") as Record<
    string,
    unknown
  >;
  exact(
    value,
    [
      "traceId",
      "participantDescriptor",
      "scenarioManifest",
      "artifactLock",
      "interactionCount",
      "successfulObjectiveCount",
      "recoveryToBaselineCount",
      "roleCoherenceLength",
    ],
    "trace_evidence_input",
  );
  identifier(value.traceId, "trace_id");
  const participant = validateEvaluationParticipantDescriptorV1(
    value.participantDescriptor,
  );
  const scenario = object(
    value.scenarioManifest,
    "trace_scenario",
  ) as unknown as MultiDomainScenarioManifestV1;
  // Its digest was established by the suite's environment-bound validation.
  digest(scenario.manifestDigest, "trace_scenario_manifest_digest");
  const artifactLock = validateBenchmarkArtifactSourceLockV1(
    value.artifactLock,
  );
  metrics(
    value.interactionCount,
    value.successfulObjectiveCount,
    value.recoveryToBaselineCount,
    value.roleCoherenceLength,
  );
  const body = {
    schemaVersion: 1 as const,
    traceId: value.traceId as string,
    participantDescriptorDigest: participant.descriptorDigest,
    scenarioManifestDigest: scenario.manifestDigest,
    artifactLockDigest: artifactLock.lockDigest,
    interactionCount: value.interactionCount as number,
    successfulObjectiveCount: value.successfulObjectiveCount as number,
    recoveryToBaselineCount: value.recoveryToBaselineCount as number,
    roleCoherenceLength: value.roleCoherenceLength as number,
  };
  return freeze({
    ...body,
    traceDigest: verifiedBenchmarkDigestV1("trace-evidence", body),
  });
}

export function validateBenchmarkTraceEvidenceV1(
  input: unknown,
): BenchmarkTraceEvidenceV1 {
  const value = object(
    input,
    "trace_evidence",
  ) as unknown as BenchmarkTraceEvidenceV1;
  exact(
    value,
    [
      "schemaVersion",
      "traceId",
      "participantDescriptorDigest",
      "scenarioManifestDigest",
      "artifactLockDigest",
      "interactionCount",
      "successfulObjectiveCount",
      "recoveryToBaselineCount",
      "roleCoherenceLength",
      "traceDigest",
    ],
    "trace_evidence",
  );
  if (value.schemaVersion !== 1) fail("trace_evidence_schema_invalid");
  identifier(value.traceId, "trace_id");
  for (const [label, candidate] of [
    ["participant_descriptor_digest", value.participantDescriptorDigest],
    ["scenario_manifest_digest", value.scenarioManifestDigest],
    ["artifact_lock_digest", value.artifactLockDigest],
  ] as const)
    digest(candidate, label);
  metrics(
    value.interactionCount,
    value.successfulObjectiveCount,
    value.recoveryToBaselineCount,
    value.roleCoherenceLength,
  );
  const body = {
    schemaVersion: 1 as const,
    traceId: value.traceId,
    participantDescriptorDigest: value.participantDescriptorDigest,
    scenarioManifestDigest: value.scenarioManifestDigest,
    artifactLockDigest: value.artifactLockDigest,
    interactionCount: value.interactionCount,
    successfulObjectiveCount: value.successfulObjectiveCount,
    recoveryToBaselineCount: value.recoveryToBaselineCount,
    roleCoherenceLength: value.roleCoherenceLength,
  };
  const rebuilt = freeze({
    ...body,
    traceDigest: verifiedBenchmarkDigestV1("trace-evidence", body),
  });
  same(value, rebuilt, "trace_evidence_digest_invalid");
  return rebuilt;
}

export function evaluatorMetricProjectionV2(
  traceEvidence: BenchmarkTraceEvidenceV1,
): MetricProjectionV2 {
  const trace = validateBenchmarkTraceEvidenceV1(traceEvidence);
  const successRateBps = ratioBps(
    trace.successfulObjectiveCount,
    trace.interactionCount,
  );
  const recoveryRateBps = ratioBps(
    trace.recoveryToBaselineCount,
    trace.interactionCount,
  );
  const coherenceRateBps = ratioBps(
    trace.roleCoherenceLength,
    trace.interactionCount,
  );
  const compositeScoreBps = Math.floor(
    (successRateBps + recoveryRateBps + coherenceRateBps) / 3,
  );
  const body = {
    schemaVersion: 2 as const,
    traceDigest: trace.traceDigest,
    interactionCount: trace.interactionCount,
    successRateBps,
    recoveryRateBps,
    coherenceRateBps,
    compositeScoreBps,
  };
  return freeze({
    ...body,
    projectionDigest: verifiedBenchmarkDigestV1("metric-projection-v2", body),
  });
}

export function benchmarkReplayDigestV1(input: {
  readonly participantDescriptorDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly artifactLockDigest: PlanningDigestV1;
  readonly traceDigest: PlanningDigestV1;
}): PlanningDigestV1 {
  const value = object(input, "replay_binding") as Record<string, unknown>;
  exact(
    value,
    [
      "participantDescriptorDigest",
      "scenarioManifestDigest",
      "artifactLockDigest",
      "traceDigest",
    ],
    "replay_binding",
  );
  for (const [label, candidate] of Object.entries(value))
    digest(candidate, label);
  return verifiedBenchmarkDigestV1("replay-binding", value);
}

export function createVerifiedBenchmarkSubmissionV1(input: {
  readonly submissionId: string;
  readonly participantDescriptor: EvaluationParticipantDescriptorV1;
  readonly artifactLock: BenchmarkArtifactSourceLockV1;
  readonly suiteManifest: BenchmarkSuiteManifestV1;
  readonly traceEvidence: BenchmarkTraceEvidenceV1;
  readonly pairedBaseline: PairedBaselineEvidenceV1;
}): VerifiedBenchmarkSubmissionV1 {
  const value = object(input, "submission_input") as Record<string, unknown>;
  exact(
    value,
    [
      "submissionId",
      "participantDescriptor",
      "artifactLock",
      "suiteManifest",
      "traceEvidence",
      "pairedBaseline",
    ],
    "submission_input",
  );
  identifier(value.submissionId, "submission_id");
  const participant = validateEvaluationParticipantDescriptorV1(
    value.participantDescriptor,
  );
  const artifactLock = validateBenchmarkArtifactSourceLockV1(
    value.artifactLock,
  );
  const suite = object(
    value.suiteManifest,
    "submission_suite",
  ) as unknown as BenchmarkSuiteManifestV1;
  digest(suite.manifestDigest, "submission_suite_manifest_digest");
  const trace = validateBenchmarkTraceEvidenceV1(value.traceEvidence);
  const pairedBaseline = validatePairedBaselineEvidenceV1(value.pairedBaseline);
  const replayDigest = benchmarkReplayDigestV1({
    participantDescriptorDigest: participant.descriptorDigest,
    scenarioManifestDigest: suite.scenarioManifest.manifestDigest,
    artifactLockDigest: artifactLock.lockDigest,
    traceDigest: trace.traceDigest,
  });
  const body = {
    schemaVersion: 1 as const,
    submissionId: value.submissionId as string,
    participantDescriptor: participant,
    artifactLock,
    suiteManifest: suite,
    traceEvidence: trace,
    replayDigest,
    pairedBaseline,
  };
  return freeze({
    ...body,
    submissionDigest: verifiedBenchmarkDigestV1("submission", body),
  });
}

export function validateVerifiedBenchmarkSubmissionV1(
  input: unknown,
  environmentDescriptor: MultiDomainEnvironmentDescriptorV1,
): VerifiedBenchmarkSubmissionV1 {
  const value = object(
    input,
    "submission",
  ) as unknown as VerifiedBenchmarkSubmissionV1;
  exact(
    value,
    [
      "schemaVersion",
      "submissionId",
      "participantDescriptor",
      "artifactLock",
      "suiteManifest",
      "traceEvidence",
      "replayDigest",
      "pairedBaseline",
      "submissionDigest",
    ],
    "submission",
  );
  if (value.schemaVersion !== 1) fail("submission_schema_invalid");
  const suite = validateBenchmarkSuiteManifestV1(
    value.suiteManifest,
    environmentDescriptor,
  );
  const rebuilt = createVerifiedBenchmarkSubmissionV1({
    submissionId: value.submissionId,
    participantDescriptor: value.participantDescriptor,
    artifactLock: value.artifactLock,
    suiteManifest: suite,
    traceEvidence: value.traceEvidence,
    pairedBaseline: value.pairedBaseline,
  });
  same(value, rebuilt, "submission_digest_invalid");
  return rebuilt;
}

export function createPairedBaselineEvidenceV1(input: {
  readonly participantDescriptor: EvaluationParticipantDescriptorV1;
  readonly artifactLock: BenchmarkArtifactSourceLockV1;
  readonly scenarioManifest: MultiDomainScenarioManifestV1;
  readonly traceEvidence: BenchmarkTraceEvidenceV1;
}): PairedBaselineEvidenceV1 {
  const value = object(input, "baseline_evidence_input") as Record<
    string,
    unknown
  >;
  exact(
    value,
    [
      "participantDescriptor",
      "artifactLock",
      "scenarioManifest",
      "traceEvidence",
    ],
    "baseline_evidence_input",
  );
  const participant = validateEvaluationParticipantDescriptorV1(
    value.participantDescriptor,
  );
  const artifact = validateBenchmarkArtifactSourceLockV1(value.artifactLock);
  const scenario = object(
    value.scenarioManifest,
    "baseline_scenario",
  ) as unknown as MultiDomainScenarioManifestV1;
  digest(scenario.manifestDigest, "baseline_scenario_manifest_digest");
  const trace = validateBenchmarkTraceEvidenceV1(value.traceEvidence);
  const replayDigest = benchmarkReplayDigestV1({
    participantDescriptorDigest: participant.descriptorDigest,
    scenarioManifestDigest: scenario.manifestDigest,
    artifactLockDigest: artifact.lockDigest,
    traceDigest: trace.traceDigest,
  });
  return freeze({
    schemaVersion: 1 as const,
    participantDescriptor: participant,
    artifactLock: artifact,
    traceEvidence: trace,
    replayDigest,
  });
}

export function validatePairedBaselineEvidenceV1(
  input: unknown,
): PairedBaselineEvidenceV1 {
  const value = object(
    input,
    "baseline_evidence",
  ) as unknown as PairedBaselineEvidenceV1;
  exact(
    value,
    [
      "schemaVersion",
      "participantDescriptor",
      "artifactLock",
      "traceEvidence",
      "replayDigest",
    ],
    "baseline_evidence",
  );
  if (value.schemaVersion !== 1) fail("baseline_evidence_schema_invalid");
  const participant = validateEvaluationParticipantDescriptorV1(
    value.participantDescriptor,
  );
  const artifact = validateBenchmarkArtifactSourceLockV1(value.artifactLock);
  const trace = validateBenchmarkTraceEvidenceV1(value.traceEvidence);
  const replayDigest = benchmarkReplayDigestV1({
    participantDescriptorDigest: participant.descriptorDigest,
    scenarioManifestDigest: trace.scenarioManifestDigest,
    artifactLockDigest: artifact.lockDigest,
    traceDigest: trace.traceDigest,
  });
  if (value.replayDigest !== replayDigest)
    fail("baseline_replay_digest_invalid");
  return freeze({
    schemaVersion: 1,
    participantDescriptor: participant,
    artifactLock: artifact,
    traceEvidence: trace,
    replayDigest,
  });
}

function canonicalProfile(
  profileId: MultiDomainScenarioManifestV1["scaleProfileId"],
): ShardedSimulationScaleProfileV1 {
  return shardedSimulationScaleProfileV1(profileId);
}
function metrics(...values: readonly unknown[]): void {
  const [interactions, success, recovery, coherence] = values;
  positive(interactions, "interaction_count");
  if (interactions > MAXIMUM_INTERACTIONS)
    fail("interaction_count_limit_exceeded");
  for (const [label, value] of [
    ["successful_objective_count", success],
    ["recovery_to_baseline_count", recovery],
    ["role_coherence_length", coherence],
  ] as const) {
    nonNegative(value, label);
    if (value > interactions) fail(`${label}_exceeds_interactions`);
  }
}
function ratioBps(numerator: number, denominator: number): number {
  return Math.floor((numerator * BPS) / denominator);
}
function canonicalIdentifiers(
  input: unknown,
  maximum: number,
  label: string,
): readonly string[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > maximum)
    fail(`${label}_invalid`);
  for (const value of input) identifier(value, label);
  const values = [...new Set(input)].sort();
  if (values.length !== input.length) fail(`${label}_duplicate`);
  return Object.freeze(values);
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${label}_invalid`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    fail(`${label}_prototype_invalid`);
  if (
    Object.values(Object.getOwnPropertyDescriptors(value)).some(
      (entry) => "get" in entry || "set" in entry,
    )
  )
    fail(`${label}_accessor_invalid`);
  return value as Record<string, unknown>;
}
function exact(value: object, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label}_shape_invalid`);
}
function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAXIMUM_IDENTIFIER_LENGTH
  )
    fail(`${label}_invalid`);
}
function digest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label}_invalid`);
}
function positive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    fail(`${label}_invalid`);
}
function nonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    fail(`${label}_invalid`);
}
function same(left: unknown, right: unknown, code: string): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) fail(code);
}
function freeze<T>(value: T): T {
  return deepFreezePlanning(value as unknown as PlanningJson) as unknown as T;
}
function fail(code: string): never {
  throw new TypeError(`verified_benchmark_${code}`);
}
