import type { JsonValue } from "@agentplat/core";

import {
  CollectivePlanningValidationError,
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
  digestPlanningJsonV1,
} from "./canonical.js";
import type { PlanningDigestV1 } from "./contracts.js";
import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  type CollectiveEvaluationCampaignRegistrationV1,
  type CollectiveEvaluationCampaignRunnerV1,
  type CollectiveEvaluationCampaignScaleV1,
  type CollectiveEvaluationCampaignStratumV1,
} from "./evaluation-campaign.js";

export const NORMATIVE_OPERATION_SCHEMA_VERSION_V1 = 1 as const;
export const NORMATIVE_OPERATION_SHARD_COUNT_V1 = 48 as const;
export const NORMATIVE_OPERATION_CELLS_PER_SHARD_V1 = 5 as const;
export const NORMATIVE_OPERATION_EXPECTED_CELL_COUNT_V1 = 240 as const;
export const NORMATIVE_OPERATION_SLOTS_PER_CELL_V1 = 4 as const;
export const NORMATIVE_OPERATION_EXPECTED_SLOT_COUNT_V1 = 960 as const;

export const NORMATIVE_OPERATION_LIMITS_V1 = deepFreezePlanning({
  schemaVersion: 1 as const,
  shardCount: NORMATIVE_OPERATION_SHARD_COUNT_V1,
  cellsPerShard: NORMATIVE_OPERATION_CELLS_PER_SHARD_V1,
  expectedCellCount: NORMATIVE_OPERATION_EXPECTED_CELL_COUNT_V1,
  slotsPerCell: NORMATIVE_OPERATION_SLOTS_PER_CELL_V1,
  expectedSlotCount: NORMATIVE_OPERATION_EXPECTED_SLOT_COUNT_V1,
  maximumAdapterIdentifierBytes: 128,
  maximumExecutionIdentifierBytes: 128,
  maximumCapabilityValues: 32,
  maximumFaultFamilies: 64,
  maximumProjectionEventIds: 512,
  maximumReasonCodes: 32,
  maximumContractBytes: 1_048_576,
  maximumTraceEventsPerExecution: 100_000,
  maximumArtifactBytesPerExecution: 67_108_864,
});

export type NormativeRunnerClassV1 =
  "diagnostic" | "synthetic_conformance" | "normative_candidate";

export interface NormativeRunnerCapabilitiesV1 {
  readonly schemaVersion: 1;
  readonly runners: readonly CollectiveEvaluationCampaignRunnerV1[];
  readonly scales: readonly CollectiveEvaluationCampaignScaleV1[];
  readonly strata: readonly CollectiveEvaluationCampaignStratumV1[];
  readonly traceSchemaVersion: 2;
  readonly accountingVersion: "interaction-accounting-v2";
  readonly environmentPortVersion: 1;
  readonly monitorPortVersion: 1;
  readonly exactReplay: boolean;
  readonly evaluatorOwnedMetrics: boolean;
}

export interface NormativeRunnerDigestsV1 {
  readonly schemaVersion: 1;
  readonly implementationDigest: PlanningDigestV1;
  readonly evaluatorDigest: PlanningDigestV1;
  readonly scenarioDefinitionDigest: PlanningDigestV1;
  readonly fixtureDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly environmentDigest: PlanningDigestV1;
  readonly observationPolicyDigest: PlanningDigestV1;
  readonly monitorDigest: PlanningDigestV1;
}

export interface NormativeRunnerLimitsV1 {
  readonly schemaVersion: 1;
  readonly maximumAgents: number;
  readonly maximumOutdegree: number;
  readonly maximumInteractionsPerExecution: number;
  readonly maximumTraceEventsPerExecution: number;
  readonly maximumArtifactBytesPerExecution: number;
  readonly maximumConcurrentCells: number;
}

export interface NormativeRunnerDescriptorV1 {
  readonly schemaVersion: 1;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly runnerClass: NormativeRunnerClassV1;
  readonly capabilities: NormativeRunnerCapabilitiesV1;
  readonly digests: NormativeRunnerDigestsV1;
  readonly limits: NormativeRunnerLimitsV1;
  readonly descriptorDigest: PlanningDigestV1;
}

export interface NormativeDetachedAuthenticationV1 {
  readonly schemaVersion: 1;
  readonly credentialId: string;
  readonly algorithm: "ed25519";
  /** Unpadded base64url encoding of the detached 64-byte Ed25519 signature. */
  readonly signature: string;
}

export interface NormativeOperationAuthorizationV1 {
  readonly schemaVersion: 1;
  readonly authorizationId: string;
  readonly issuerId: string;
  readonly audience: string;
  /** Credential identity is signed as statement content; the signature is not. */
  readonly credentialId: string;
  readonly signatureAlgorithm: "ed25519";
  readonly planDigest: PlanningDigestV1;
  readonly registrationDigest: PlanningDigestV1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly adapterDigest: PlanningDigestV1;
  readonly executionId: string;
  readonly shardIndices: readonly number[];
  readonly authorizedAt: string;
  readonly expiresAt: string;
  readonly maximumCells: number;
  readonly authorizationDigest: PlanningDigestV1;
  readonly authentication: NormativeDetachedAuthenticationV1;
}

export interface NormativeOperationAuthorizationContextV1 {
  readonly schemaVersion: 1;
  readonly audience: string;
  readonly planDigest: PlanningDigestV1;
  readonly registrationDigest: PlanningDigestV1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly adapterDigest: PlanningDigestV1;
  readonly executionId: string;
  readonly shardIndices: readonly number[];
  readonly maximumCells: number;
}

export interface NormativeOperationAuthorizationVerifierPortV1 {
  readonly schemaVersion: 1;
  verifyDetachedAuthorizationV1(
    input: Readonly<{
      schemaVersion: 1;
      purpose: "normative-operation-authorization-v1";
      authorizationDigest: PlanningDigestV1;
      issuerId: string;
      audience: string;
      authentication: NormativeDetachedAuthenticationV1;
    }>,
  ): Promise<boolean> | boolean;
}

export type NormativeOperationAuthorizationBodyV1 = Omit<
  NormativeOperationAuthorizationV1,
  "authorizationDigest" | "authentication"
>;
export type CreateNormativeOperationAuthorizationInputV1 =
  NormativeOperationAuthorizationBodyV1 &
    Readonly<{ authentication: NormativeDetachedAuthenticationV1 }>;

export interface NormativeOperationShardV1 {
  readonly schemaVersion: 1;
  readonly shardIndex: number;
  readonly cellIds: readonly string[];
  readonly cellCount: 5;
  readonly slotCount: 20;
  readonly shardDigest: PlanningDigestV1;
}

export interface NormativeOperationPlanV1 {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly adapterDigest: PlanningDigestV1;
  readonly adapterClass: NormativeRunnerClassV1;
  readonly profile: typeof COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1;
  readonly cellIds: readonly string[];
  readonly expectedCellCount: 240;
  readonly expectedSlotCount: 960;
  readonly slotsPerCell: 4;
  readonly shardCount: 48;
  readonly cellsPerShard: 5;
  readonly shards: readonly NormativeOperationShardV1[];
  readonly planDigest: PlanningDigestV1;
}

export type NormativeExecutionStatusV1 =
  "completed" | "infrastructure_invalid" | "aborted";
export type NormativeValidityV1 = "valid" | "invalid";
export type NormativeMissionOutcomeV1 =
  "success" | "partial_success" | "terminal_failure" | "not_available";

export interface NormativeMetricEventBindingV1 {
  readonly schemaVersion: 1;
  readonly boundaryEvidenceDigest: PlanningDigestV1;
  readonly traceDigest: PlanningDigestV1;
  readonly traceRoot: PlanningDigestV1 | null;
  readonly monitorVerdictDigest: PlanningDigestV1;
  readonly firstEventId: string;
  readonly lastEventId: string;
  readonly terminalEventId: string;
  readonly eventCount: number;
  readonly projectedEventIds: readonly string[];
  readonly projectedEventIdsDigest: PlanningDigestV1;
}

export interface NormativeSafetyMetricsV1 {
  readonly schemaVersion: 1;
  readonly authorizationViolations: number;
  readonly planAuthorityViolations: number;
  readonly staleFenceViolations: number;
  readonly duplicateEffectViolations: number;
  readonly hiddenStateViolations: number;
  readonly globalMembershipViolations: number;
  readonly directAssignmentViolations: number;
  readonly directContractViolations: number;
  readonly syntheticLedgerViolations: number;
  readonly constantMetricViolations: number;
  readonly canaryLeakViolations: number;
  readonly evaluationIntegrityViolations: number;
}

export interface NormativeFaultEventBindingV1 {
  readonly schemaVersion: 1;
  readonly family: string;
  readonly scheduleEventId: string;
  readonly injectionEventId: string | null;
  readonly observationEventId: string | null;
}

export interface NormativeFaultMetricsV1 {
  readonly schemaVersion: 1;
  readonly registeredFamilies: readonly string[];
  readonly events: readonly NormativeFaultEventBindingV1[];
}

export interface NormativeRecoveryMetricsV1 {
  readonly schemaVersion: 1;
  readonly disruptionEventId: string | null;
  readonly replanEventId: string | null;
  readonly assignmentChangeEventId: string | null;
  readonly recoveryEventId: string | null;
  readonly interactionsToReplan: number | null;
  readonly interactionsToRecovery: number | null;
}

export interface NormativeConvergenceMetricsV1 {
  readonly schemaVersion: 1;
  readonly healOrQuiescenceEventId: string | null;
  readonly agreementEventId: string | null;
  readonly healthyParticipantCount: number;
  readonly agreeingParticipantCount: number;
  readonly interactionsToAgreement: number | null;
}

export interface NormativeRoleCoherenceMetricsV1 {
  readonly schemaVersion: 1;
  readonly firstDecisionEventId: string | null;
  readonly lastDecisionEventId: string | null;
  readonly firstUnsafeEventId: string | null;
  readonly decisionCount: number;
  readonly coherentDecisionCount: number;
  readonly usefulDecisionCount: number;
  readonly unsafeExecutableCount: number;
}

export interface NormativeMetricProjectionV1 {
  readonly schemaVersion: 1;
  readonly projectionOwner: "evaluator";
  readonly evaluatorDigest: PlanningDigestV1;
  readonly executionId: string;
  readonly runKey: string;
  readonly attempt: "first" | "replay";
  readonly registrationDigest: PlanningDigestV1;
  readonly cellId: string;
  readonly seed: number;
  readonly runner: CollectiveEvaluationCampaignRunnerV1;
  readonly executionStatus: NormativeExecutionStatusV1;
  readonly validity: NormativeValidityV1;
  readonly missionOutcome: NormativeMissionOutcomeV1;
  readonly reasonCode: string | null;
  readonly interactionTotal: number;
  readonly interactionCeiling: number;
  readonly eventBinding: NormativeMetricEventBindingV1;
  readonly safety: NormativeSafetyMetricsV1;
  readonly faults: NormativeFaultMetricsV1;
  readonly recovery: NormativeRecoveryMetricsV1;
  readonly convergence: NormativeConvergenceMetricsV1;
  readonly roleCoherence: NormativeRoleCoherenceMetricsV1;
  readonly projectionDigest: PlanningDigestV1;
}

export const CAMPAIGN_ELIGIBILITY_REASON_CODES_V1 = Object.freeze([
  "adapter_not_normative",
  "adapter_capability_mismatch",
  "authorization_missing",
  "authorization_invalid",
  "source_lock_mismatch",
  "dirty_source",
  "campaign_incomplete",
  "slot_missing",
  "slot_duplicate",
  "execution_invalid",
  "replay_diverged",
  "trace_invalid",
  "ledger_mismatch",
  "monitor_mismatch",
  "topology_mismatch",
  "fault_coverage_incomplete",
  "safety_violation",
  "evaluation_integrity_violation",
  "threshold_not_met",
  "analysis_policy_mismatch",
  "negative_control_failed",
  "artifact_limit_exceeded",
] as const);

export type CampaignEligibilityReasonCodeV1 =
  (typeof CAMPAIGN_ELIGIBILITY_REASON_CODES_V1)[number];
export type CampaignEligibilityStatusV1 =
  "eligible" | "ineligible" | "incomplete";

export interface CampaignEligibilityAttestationV1 {
  readonly schemaVersion: 1;
  readonly status: CampaignEligibilityStatusV1;
  readonly reasonCodes: readonly CampaignEligibilityReasonCodeV1[];
  readonly campaignId: string;
  readonly executionId: string;
  readonly planDigest: PlanningDigestV1;
  readonly registrationDigest: PlanningDigestV1;
  readonly bundleDigest: PlanningDigestV1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly adapterClass: NormativeRunnerClassV1;
  readonly adapterDigest: PlanningDigestV1;
  readonly authorizationDigest: PlanningDigestV1;
  readonly analyzerDigest: PlanningDigestV1;
  readonly analysisPolicyDigest: PlanningDigestV1;
  readonly analysisDigest: PlanningDigestV1;
  readonly metricProjectionRootDigest: PlanningDigestV1;
  readonly closureProofDigest: PlanningDigestV1;
  readonly analyzedCellCount: number;
  readonly analyzedSlotCount: number;
  readonly createdAt: string;
  readonly attestationDigest: PlanningDigestV1;
}

export interface CampaignEligibilityClosureChecksV1 {
  readonly schemaVersion: 1;
  readonly authorizationValid: boolean;
  readonly sourceLockMatches: boolean;
  readonly cleanSource: boolean;
  readonly adapterCapabilitiesMatch: boolean;
  readonly executionsValid: boolean;
  readonly replayMatches: boolean;
  readonly tracesValid: boolean;
  readonly ledgersMatch: boolean;
  readonly monitorMatches: boolean;
  readonly topologyMatches: boolean;
  readonly faultCoverageComplete: boolean;
  readonly safetyPassed: boolean;
  readonly evaluationIntegrityPassed: boolean;
  readonly thresholdsPassed: boolean;
  readonly analysisPolicyMatches: boolean;
  readonly negativeControlsPassed: boolean;
  readonly artifactLimitsPassed: boolean;
}

/**
 * Authenticated output of the evidence-owning layer. It contains raw closure
 * sets and closed checks, but no caller-selected status, counts or reasons.
 */
export interface CampaignEligibilityVerifiedClosureProofV1 {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly executionId: string;
  readonly planDigest: PlanningDigestV1;
  readonly registrationDigest: PlanningDigestV1;
  readonly bundleDigest: PlanningDigestV1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly adapterClass: NormativeRunnerClassV1;
  readonly adapterDigest: PlanningDigestV1;
  readonly authorizationDigest: PlanningDigestV1;
  readonly analyzerDigest: PlanningDigestV1;
  readonly analysisPolicyDigest: PlanningDigestV1;
  readonly analysisDigest: PlanningDigestV1;
  readonly metricProjectionRootDigest: PlanningDigestV1;
  readonly expectedCellIds: readonly string[];
  readonly verifiedCellIds: readonly string[];
  readonly expectedRunKeys: readonly string[];
  readonly verifiedRunKeys: readonly string[];
  readonly checks: CampaignEligibilityClosureChecksV1;
  readonly proofDigest: PlanningDigestV1;
  readonly authentication: NormativeDetachedAuthenticationV1;
}

export interface CampaignEligibilityClosureProofVerifierPortV1 {
  readonly schemaVersion: 1;
  verifyClosureProofV1(
    input: Readonly<{
      schemaVersion: 1;
      purpose: "campaign-eligibility-closure-proof-v1";
      proofDigest: PlanningDigestV1;
      authentication: NormativeDetachedAuthenticationV1;
      executionId: string;
      planDigest: PlanningDigestV1;
      bundleDigest: PlanningDigestV1;
      metricProjectionRootDigest: PlanningDigestV1;
      analyzerDigest: PlanningDigestV1;
      analysisDigest: PlanningDigestV1;
    }>,
  ): Promise<boolean> | boolean;
}

const descriptorBodyKeys = [
  "schemaVersion",
  "adapterId",
  "adapterVersion",
  "runnerClass",
  "capabilities",
  "digests",
  "limits",
] as const;
const descriptorKeys = [...descriptorBodyKeys, "descriptorDigest"] as const;
const capabilityKeys = [
  "schemaVersion",
  "runners",
  "scales",
  "strata",
  "traceSchemaVersion",
  "accountingVersion",
  "environmentPortVersion",
  "monitorPortVersion",
  "exactReplay",
  "evaluatorOwnedMetrics",
] as const;
const runnerDigestKeys = [
  "schemaVersion",
  "implementationDigest",
  "evaluatorDigest",
  "scenarioDefinitionDigest",
  "fixtureDigest",
  "policyDigest",
  "environmentDigest",
  "observationPolicyDigest",
  "monitorDigest",
] as const;
const runnerLimitKeys = [
  "schemaVersion",
  "maximumAgents",
  "maximumOutdegree",
  "maximumInteractionsPerExecution",
  "maximumTraceEventsPerExecution",
  "maximumArtifactBytesPerExecution",
  "maximumConcurrentCells",
] as const;
const authorizationBodyKeys = [
  "schemaVersion",
  "authorizationId",
  "issuerId",
  "audience",
  "credentialId",
  "signatureAlgorithm",
  "planDigest",
  "registrationDigest",
  "sourceCommit",
  "sourceTreeDigest",
  "adapterDigest",
  "executionId",
  "shardIndices",
  "authorizedAt",
  "expiresAt",
  "maximumCells",
] as const;
const authorizationKeys = [
  ...authorizationBodyKeys,
  "authorizationDigest",
  "authentication",
] as const;
const authenticationKeys = [
  "schemaVersion",
  "credentialId",
  "algorithm",
  "signature",
] as const;
const authorizationContextKeys = [
  "schemaVersion",
  "audience",
  "planDigest",
  "registrationDigest",
  "sourceCommit",
  "sourceTreeDigest",
  "adapterDigest",
  "executionId",
  "shardIndices",
  "maximumCells",
] as const;
const shardBodyKeys = [
  "schemaVersion",
  "shardIndex",
  "cellIds",
  "cellCount",
  "slotCount",
] as const;
const shardKeys = [...shardBodyKeys, "shardDigest"] as const;
const planBodyKeys = [
  "schemaVersion",
  "campaignId",
  "registrationDigest",
  "sourceCommit",
  "sourceTreeDigest",
  "adapterDigest",
  "adapterClass",
  "profile",
  "cellIds",
  "expectedCellCount",
  "expectedSlotCount",
  "slotsPerCell",
  "shardCount",
  "cellsPerShard",
  "shards",
] as const;
const planKeys = [...planBodyKeys, "planDigest"] as const;
const metricBodyKeys = [
  "schemaVersion",
  "projectionOwner",
  "evaluatorDigest",
  "executionId",
  "runKey",
  "attempt",
  "registrationDigest",
  "cellId",
  "seed",
  "runner",
  "executionStatus",
  "validity",
  "missionOutcome",
  "reasonCode",
  "interactionTotal",
  "interactionCeiling",
  "eventBinding",
  "safety",
  "faults",
  "recovery",
  "convergence",
  "roleCoherence",
] as const;
const metricKeys = [...metricBodyKeys, "projectionDigest"] as const;
const eventBindingBodyKeys = [
  "schemaVersion",
  "boundaryEvidenceDigest",
  "traceDigest",
  "traceRoot",
  "monitorVerdictDigest",
  "firstEventId",
  "lastEventId",
  "terminalEventId",
  "eventCount",
  "projectedEventIds",
  "projectedEventIdsDigest",
] as const;
const safetyKeys = [
  "schemaVersion",
  "authorizationViolations",
  "planAuthorityViolations",
  "staleFenceViolations",
  "duplicateEffectViolations",
  "hiddenStateViolations",
  "globalMembershipViolations",
  "directAssignmentViolations",
  "directContractViolations",
  "syntheticLedgerViolations",
  "constantMetricViolations",
  "canaryLeakViolations",
  "evaluationIntegrityViolations",
] as const;
const faultKeys = ["schemaVersion", "registeredFamilies", "events"] as const;
const faultEventKeys = [
  "schemaVersion",
  "family",
  "scheduleEventId",
  "injectionEventId",
  "observationEventId",
] as const;
const recoveryKeys = [
  "schemaVersion",
  "disruptionEventId",
  "replanEventId",
  "assignmentChangeEventId",
  "recoveryEventId",
  "interactionsToReplan",
  "interactionsToRecovery",
] as const;
const convergenceKeys = [
  "schemaVersion",
  "healOrQuiescenceEventId",
  "agreementEventId",
  "healthyParticipantCount",
  "agreeingParticipantCount",
  "interactionsToAgreement",
] as const;
const roleKeys = [
  "schemaVersion",
  "firstDecisionEventId",
  "lastDecisionEventId",
  "firstUnsafeEventId",
  "decisionCount",
  "coherentDecisionCount",
  "usefulDecisionCount",
  "unsafeExecutableCount",
] as const;
const attestationBodyKeys = [
  "schemaVersion",
  "status",
  "reasonCodes",
  "campaignId",
  "executionId",
  "planDigest",
  "registrationDigest",
  "bundleDigest",
  "sourceCommit",
  "sourceTreeDigest",
  "adapterClass",
  "adapterDigest",
  "authorizationDigest",
  "analyzerDigest",
  "analysisPolicyDigest",
  "analysisDigest",
  "metricProjectionRootDigest",
  "closureProofDigest",
  "analyzedCellCount",
  "analyzedSlotCount",
  "createdAt",
] as const;
const attestationKeys = [...attestationBodyKeys, "attestationDigest"] as const;
const closureCheckKeys = [
  "schemaVersion",
  "authorizationValid",
  "sourceLockMatches",
  "cleanSource",
  "adapterCapabilitiesMatch",
  "executionsValid",
  "replayMatches",
  "tracesValid",
  "ledgersMatch",
  "monitorMatches",
  "topologyMatches",
  "faultCoverageComplete",
  "safetyPassed",
  "evaluationIntegrityPassed",
  "thresholdsPassed",
  "analysisPolicyMatches",
  "negativeControlsPassed",
  "artifactLimitsPassed",
] as const;
const closureProofBodyKeys = [
  "schemaVersion",
  "campaignId",
  "executionId",
  "planDigest",
  "registrationDigest",
  "bundleDigest",
  "sourceCommit",
  "sourceTreeDigest",
  "adapterClass",
  "adapterDigest",
  "authorizationDigest",
  "analyzerDigest",
  "analysisPolicyDigest",
  "analysisDigest",
  "metricProjectionRootDigest",
  "expectedCellIds",
  "verifiedCellIds",
  "expectedRunKeys",
  "verifiedRunKeys",
  "checks",
] as const;
const closureProofKeys = [
  ...closureProofBodyKeys,
  "proofDigest",
  "authentication",
] as const;

const runners = Object.freeze([
  "adaptive_collective",
  "centralized_planner",
] as const);
const scales = Object.freeze([50, 100, 250, 500] as const);
const strata = Object.freeze([
  "nominal",
  "benign",
  "adversarial",
  "mixed",
] as const);
const runnerClasses = new Set<NormativeRunnerClassV1>([
  "diagnostic",
  "synthetic_conformance",
  "normative_candidate",
]);
const executionStatuses = new Set<NormativeExecutionStatusV1>([
  "completed",
  "infrastructure_invalid",
  "aborted",
]);
const validityValues = new Set<NormativeValidityV1>(["valid", "invalid"]);
const missionOutcomes = new Set<NormativeMissionOutcomeV1>([
  "success",
  "partial_success",
  "terminal_failure",
  "not_available",
]);
const eligibilityStatuses = new Set<CampaignEligibilityStatusV1>([
  "eligible",
  "ineligible",
  "incomplete",
]);
const eligibilityReasonCodes = new Set<string>(
  CAMPAIGN_ELIGIBILITY_REASON_CODES_V1,
);
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const commitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;
const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

export function normativeRunnerDescriptorDigestV1(
  input: Omit<NormativeRunnerDescriptorV1, "descriptorDigest">,
): PlanningDigestV1 {
  const body = normalizeDescriptorBody(input);
  return digest("normative-runner-descriptor-v1", body);
}

export function createNormativeRunnerDescriptorV1(
  input: Omit<NormativeRunnerDescriptorV1, "descriptorDigest">,
): NormativeRunnerDescriptorV1 {
  const body = normalizeDescriptorBody(input);
  return freeze({
    ...body,
    descriptorDigest: digest("normative-runner-descriptor-v1", body),
  });
}

export function validateNormativeRunnerDescriptorV1(
  input: unknown,
): NormativeRunnerDescriptorV1 {
  exact(input, descriptorKeys, "normative runner descriptor");
  const value = input as unknown as NormativeRunnerDescriptorV1;
  const rebuilt = createNormativeRunnerDescriptorV1(
    without(value, "descriptorDigest"),
  );
  digestValue(value.descriptorDigest, "descriptorDigest");
  equalCanonical(value, rebuilt, "normative runner descriptor");
  return rebuilt;
}

function normalizeDescriptorBody(
  input: Omit<NormativeRunnerDescriptorV1, "descriptorDigest">,
): Omit<NormativeRunnerDescriptorV1, "descriptorDigest"> {
  exact(input, descriptorBodyKeys, "normative runner descriptor input");
  if (input.schemaVersion !== 1) invalid("descriptor schema is invalid");
  token(
    input.adapterId,
    "adapterId",
    NORMATIVE_OPERATION_LIMITS_V1.maximumAdapterIdentifierBytes,
  );
  token(input.adapterVersion, "adapterVersion", 64);
  if (!runnerClasses.has(input.runnerClass)) invalid("runner class is invalid");
  const capabilities = normalizeCapabilities(input.capabilities);
  const digests = normalizeRunnerDigests(input.digests);
  const limits = normalizeRunnerLimits(input.limits);
  if (input.runnerClass === "normative_candidate") {
    if (
      !sameValues(capabilities.runners, runners) ||
      !sameValues(capabilities.scales, scales) ||
      !sameValues(capabilities.strata, strata) ||
      !capabilities.exactReplay ||
      !capabilities.evaluatorOwnedMetrics ||
      limits.maximumAgents !== 500 ||
      limits.maximumOutdegree < 9 ||
      limits.maximumInteractionsPerExecution !== 5_000
    )
      invalid("normative candidate does not cover the closed campaign");
  }
  return freeze({
    schemaVersion: 1,
    adapterId: input.adapterId,
    adapterVersion: input.adapterVersion,
    runnerClass: input.runnerClass,
    capabilities,
    digests,
    limits,
  });
}

function normalizeCapabilities(
  input: NormativeRunnerCapabilitiesV1,
): NormativeRunnerCapabilitiesV1 {
  exact(input, capabilityKeys, "normative runner capabilities");
  if (
    input.schemaVersion !== 1 ||
    input.traceSchemaVersion !== 2 ||
    input.accountingVersion !== "interaction-accounting-v2" ||
    input.environmentPortVersion !== 1 ||
    input.monitorPortVersion !== 1 ||
    typeof input.exactReplay !== "boolean" ||
    typeof input.evaluatorOwnedMetrics !== "boolean"
  )
    invalid("normative runner capabilities are invalid");
  return freeze({
    schemaVersion: 1,
    runners: enumArray(input.runners, runners, "capability runners"),
    scales: enumArray(input.scales, scales, "capability scales"),
    strata: enumArray(input.strata, strata, "capability strata"),
    traceSchemaVersion: 2,
    accountingVersion: "interaction-accounting-v2",
    environmentPortVersion: 1,
    monitorPortVersion: 1,
    exactReplay: input.exactReplay,
    evaluatorOwnedMetrics: input.evaluatorOwnedMetrics,
  });
}

function normalizeRunnerDigests(
  input: NormativeRunnerDigestsV1,
): NormativeRunnerDigestsV1 {
  exact(input, runnerDigestKeys, "normative runner digests");
  if (input.schemaVersion !== 1) invalid("runner digest schema is invalid");
  for (const key of runnerDigestKeys.slice(1))
    digestValue(input[key as keyof NormativeRunnerDigestsV1], String(key));
  return freeze({ ...input });
}

function normalizeRunnerLimits(
  input: NormativeRunnerLimitsV1,
): NormativeRunnerLimitsV1 {
  exact(input, runnerLimitKeys, "normative runner limits");
  if (input.schemaVersion !== 1) invalid("runner limit schema is invalid");
  integer(input.maximumAgents, "maximumAgents", 3, 500);
  integer(input.maximumOutdegree, "maximumOutdegree", 1, 32);
  integer(
    input.maximumInteractionsPerExecution,
    "maximumInteractionsPerExecution",
    1,
    5_000,
  );
  integer(
    input.maximumTraceEventsPerExecution,
    "maximumTraceEventsPerExecution",
    1,
    NORMATIVE_OPERATION_LIMITS_V1.maximumTraceEventsPerExecution,
  );
  integer(
    input.maximumArtifactBytesPerExecution,
    "maximumArtifactBytesPerExecution",
    1,
    NORMATIVE_OPERATION_LIMITS_V1.maximumArtifactBytesPerExecution,
  );
  integer(
    input.maximumConcurrentCells,
    "maximumConcurrentCells",
    1,
    NORMATIVE_OPERATION_EXPECTED_CELL_COUNT_V1,
  );
  return freeze({ ...input });
}

export function normativeOperationAuthorizationDigestV1(
  input: NormativeOperationAuthorizationBodyV1,
): PlanningDigestV1 {
  const body = normalizeAuthorizationBody(input);
  return digest("normative-operation-authorization-v1", body);
}

export function createNormativeOperationAuthorizationV1(
  input: CreateNormativeOperationAuthorizationInputV1,
): NormativeOperationAuthorizationV1 {
  exact(
    input,
    [...authorizationBodyKeys, "authentication"],
    "normative operation authorization factory input",
  );
  const { authentication: authenticationInput, ...bodyInput } = input;
  const body = normalizeAuthorizationBody(bodyInput);
  const authentication = normalizeDetachedAuthentication(authenticationInput);
  if (
    authentication.credentialId !== body.credentialId ||
    authentication.algorithm !== body.signatureAlgorithm
  )
    invalid("authorization authentication identity does not match statement");
  return freeze({
    ...body,
    authorizationDigest: digest("normative-operation-authorization-v1", body),
    authentication,
  });
}

export function validateNormativeOperationAuthorizationV1(
  input: unknown,
): NormativeOperationAuthorizationV1 {
  exact(input, authorizationKeys, "normative operation authorization");
  const value = input as unknown as NormativeOperationAuthorizationV1;
  const { authorizationDigest: _authorizationDigest, ...factoryInput } = value;
  const rebuilt = createNormativeOperationAuthorizationV1(factoryInput);
  digestValue(value.authorizationDigest, "authorizationDigest");
  equalCanonical(value, rebuilt, "normative operation authorization");
  return rebuilt;
}

function normalizeAuthorizationBody(
  input: NormativeOperationAuthorizationBodyV1,
): NormativeOperationAuthorizationBodyV1 {
  exact(
    input,
    authorizationBodyKeys,
    "normative operation authorization input",
  );
  if (input.schemaVersion !== 1) invalid("authorization schema is invalid");
  token(input.authorizationId, "authorizationId", 128);
  token(input.issuerId, "issuerId", 128);
  token(input.audience, "audience", 128);
  token(input.credentialId, "credentialId", 128);
  if (input.signatureAlgorithm !== "ed25519")
    invalid("authorization signature algorithm is invalid");
  digestValue(input.planDigest, "planDigest");
  digestValue(input.registrationDigest, "registrationDigest");
  commit(input.sourceCommit);
  digestValue(input.sourceTreeDigest, "sourceTreeDigest");
  digestValue(input.adapterDigest, "adapterDigest");
  token(
    input.executionId,
    "executionId",
    NORMATIVE_OPERATION_LIMITS_V1.maximumExecutionIdentifierBytes,
  );
  const shardIndices = integerArray(
    input.shardIndices,
    "shardIndices",
    0,
    NORMATIVE_OPERATION_SHARD_COUNT_V1 - 1,
  );
  if (shardIndices.length === 0)
    invalid("authorization must contain at least one shard");
  timestamp(input.authorizedAt, "authorizedAt");
  timestamp(input.expiresAt, "expiresAt");
  if (Date.parse(input.expiresAt) <= Date.parse(input.authorizedAt))
    invalid("authorization expiry must follow authorization time");
  integer(
    input.maximumCells,
    "maximumCells",
    shardIndices.length * NORMATIVE_OPERATION_CELLS_PER_SHARD_V1,
    shardIndices.length * NORMATIVE_OPERATION_CELLS_PER_SHARD_V1,
  );
  return freeze({ ...input, shardIndices });
}

/**
 * Verifies structure, validity time, exact execution context and the detached
 * signature through a caller-owned trust port. A canonical digest alone is
 * never treated as authority.
 */
export async function verifyNormativeOperationAuthorizationV1(
  input: Readonly<{
    schemaVersion: 1;
    authorization: NormativeOperationAuthorizationV1;
    context: NormativeOperationAuthorizationContextV1;
    now: string;
    verifier: NormativeOperationAuthorizationVerifierPortV1;
  }>,
): Promise<NormativeOperationAuthorizationV1> {
  exact(
    input,
    ["schemaVersion", "authorization", "context", "now", "verifier"],
    "authorization verification input",
  );
  if (input.schemaVersion !== 1)
    invalid("authorization verification schema is invalid");
  const authorization = validateNormativeOperationAuthorizationV1(
    input.authorization,
  );
  const context = normalizeAuthorizationContext(input.context);
  timestamp(input.now, "now");
  const nowMs = Date.parse(input.now);
  if (
    nowMs < Date.parse(authorization.authorizedAt) ||
    nowMs >= Date.parse(authorization.expiresAt)
  )
    invalid("authorization is not valid at the requested time");
  if (
    authorization.audience !== context.audience ||
    authorization.planDigest !== context.planDigest ||
    authorization.registrationDigest !== context.registrationDigest ||
    authorization.sourceCommit !== context.sourceCommit ||
    authorization.sourceTreeDigest !== context.sourceTreeDigest ||
    authorization.adapterDigest !== context.adapterDigest ||
    authorization.executionId !== context.executionId ||
    authorization.maximumCells !== context.maximumCells ||
    !sameValues(authorization.shardIndices, context.shardIndices)
  )
    invalid("authorization context does not match exactly");
  const verifier = normalizeAuthorizationVerifier(input.verifier);
  const authentic = await verifier.verifyDetachedAuthorizationV1(
    freeze({
      schemaVersion: 1,
      purpose: "normative-operation-authorization-v1",
      authorizationDigest: authorization.authorizationDigest,
      issuerId: authorization.issuerId,
      audience: authorization.audience,
      authentication: authorization.authentication,
    }),
  );
  if (authentic !== true) invalid("authorization authentication failed");
  return authorization;
}

function normalizeAuthorizationContext(
  input: NormativeOperationAuthorizationContextV1,
): NormativeOperationAuthorizationContextV1 {
  exact(input, authorizationContextKeys, "authorization context");
  if (input.schemaVersion !== 1)
    invalid("authorization context schema is invalid");
  token(input.audience, "audience", 128);
  digestValue(input.planDigest, "planDigest");
  digestValue(input.registrationDigest, "registrationDigest");
  commit(input.sourceCommit);
  digestValue(input.sourceTreeDigest, "sourceTreeDigest");
  digestValue(input.adapterDigest, "adapterDigest");
  token(
    input.executionId,
    "executionId",
    NORMATIVE_OPERATION_LIMITS_V1.maximumExecutionIdentifierBytes,
  );
  const shardIndices = integerArray(input.shardIndices, "shardIndices", 0, 47);
  if (shardIndices.length === 0)
    invalid("authorization context requires shards");
  integer(
    input.maximumCells,
    "maximumCells",
    shardIndices.length * NORMATIVE_OPERATION_CELLS_PER_SHARD_V1,
    shardIndices.length * NORMATIVE_OPERATION_CELLS_PER_SHARD_V1,
  );
  return freeze({ ...input, shardIndices });
}

function normalizeAuthorizationVerifier(
  input: NormativeOperationAuthorizationVerifierPortV1,
): NormativeOperationAuthorizationVerifierPortV1 {
  exact(
    input,
    ["schemaVersion", "verifyDetachedAuthorizationV1"],
    "authorization verifier port",
  );
  if (
    input.schemaVersion !== 1 ||
    typeof input.verifyDetachedAuthorizationV1 !== "function"
  )
    invalid("authorization verifier port is invalid");
  return input;
}

function normalizeDetachedAuthentication(
  input: NormativeDetachedAuthenticationV1,
): NormativeDetachedAuthenticationV1 {
  exact(input, authenticationKeys, "detached authentication");
  if (input.schemaVersion !== 1 || input.algorithm !== "ed25519")
    invalid("detached authentication algorithm is invalid");
  token(input.credentialId, "credentialId", 128);
  if (
    typeof input.signature !== "string" ||
    !/^[A-Za-z0-9_-]{85}[AQgw]$/u.test(input.signature)
  )
    invalid("detached Ed25519 signature is invalid");
  return freeze({ ...input });
}

export function normativeOperationShardDigestV1(
  input: Omit<NormativeOperationShardV1, "shardDigest">,
): PlanningDigestV1 {
  const body = normalizeShardBody(input);
  return digest("normative-operation-shard-v1", body);
}

function createShard(
  input: Omit<NormativeOperationShardV1, "shardDigest">,
): NormativeOperationShardV1 {
  const body = normalizeShardBody(input);
  return freeze({
    ...body,
    shardDigest: digest("normative-operation-shard-v1", body),
  });
}

function normalizeShardBody(
  input: Omit<NormativeOperationShardV1, "shardDigest">,
): Omit<NormativeOperationShardV1, "shardDigest"> {
  exact(input, shardBodyKeys, "normative operation shard input");
  if (
    input.schemaVersion !== 1 ||
    input.cellCount !== 5 ||
    input.slotCount !== 20
  )
    invalid("normative operation shard constants are invalid");
  integer(input.shardIndex, "shardIndex", 0, 47);
  const cellIds = tokenArray(input.cellIds, "shard cellIds", 5, 5);
  return freeze({ ...input, cellIds });
}

export function normativeOperationPlanDigestV1(
  input: Omit<NormativeOperationPlanV1, "planDigest">,
): PlanningDigestV1 {
  return digest("normative-operation-plan-v1", normalizePlanBody(input));
}

export function createNormativeOperationPlanV1(
  input: Readonly<{
    schemaVersion: 1;
    registration: CollectiveEvaluationCampaignRegistrationV1;
    sourceCommit: string;
    sourceTreeDigest: PlanningDigestV1;
    adapter: NormativeRunnerDescriptorV1;
  }>,
): NormativeOperationPlanV1 {
  exact(
    input,
    [
      "schemaVersion",
      "registration",
      "sourceCommit",
      "sourceTreeDigest",
      "adapter",
    ],
    "normative operation plan factory input",
  );
  if (input.schemaVersion !== 1) invalid("plan factory schema is invalid");
  const registration = requireNormativeRegistration(input.registration);
  const adapter = validateNormativeRunnerDescriptorV1(input.adapter);
  commit(input.sourceCommit);
  digestValue(input.sourceTreeDigest, "sourceTreeDigest");
  const cellIds = Object.freeze(registration.cells.map((cell) => cell.cellId));
  const shards = Object.freeze(
    Array.from(
      { length: NORMATIVE_OPERATION_SHARD_COUNT_V1 },
      (_, shardIndex) =>
        createShard({
          schemaVersion: 1,
          shardIndex,
          cellIds: cellIds.slice(
            shardIndex * NORMATIVE_OPERATION_CELLS_PER_SHARD_V1,
            (shardIndex + 1) * NORMATIVE_OPERATION_CELLS_PER_SHARD_V1,
          ),
          cellCount: 5,
          slotCount: 20,
        }),
    ),
  );
  const body = normalizePlanBody({
    schemaVersion: 1,
    campaignId: registration.campaignId,
    registrationDigest: registration.registrationDigest,
    sourceCommit: input.sourceCommit,
    sourceTreeDigest: input.sourceTreeDigest,
    adapterDigest: adapter.descriptorDigest,
    adapterClass: adapter.runnerClass,
    profile: COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    cellIds,
    expectedCellCount: 240,
    expectedSlotCount: 960,
    slotsPerCell: 4,
    shardCount: 48,
    cellsPerShard: 5,
    shards,
  });
  return freeze({
    ...body,
    planDigest: digest("normative-operation-plan-v1", body),
  });
}

export function validateNormativeOperationPlanV1(
  input: unknown,
  registrationInput: CollectiveEvaluationCampaignRegistrationV1,
  adapterInput: NormativeRunnerDescriptorV1,
): NormativeOperationPlanV1 {
  exact(input, planKeys, "normative operation plan");
  const value = input as unknown as NormativeOperationPlanV1;
  const registration = requireNormativeRegistration(registrationInput);
  const adapter = validateNormativeRunnerDescriptorV1(adapterInput);
  const rebuilt = createNormativeOperationPlanV1({
    schemaVersion: 1,
    registration,
    sourceCommit: value.sourceCommit,
    sourceTreeDigest: value.sourceTreeDigest,
    adapter,
  });
  digestValue(value.planDigest, "planDigest");
  equalCanonical(value, rebuilt, "normative operation plan");
  return rebuilt;
}

function normalizePlanBody(
  input: Omit<NormativeOperationPlanV1, "planDigest">,
): Omit<NormativeOperationPlanV1, "planDigest"> {
  exact(input, planBodyKeys, "normative operation plan input");
  if (
    input.schemaVersion !== 1 ||
    input.profile !== COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1 ||
    input.expectedCellCount !== 240 ||
    input.expectedSlotCount !== 960 ||
    input.slotsPerCell !== 4 ||
    input.shardCount !== 48 ||
    input.cellsPerShard !== 5
  )
    invalid("normative operation plan constants are invalid");
  token(input.campaignId, "campaignId", 256);
  digestValue(input.registrationDigest, "registrationDigest");
  commit(input.sourceCommit);
  digestValue(input.sourceTreeDigest, "sourceTreeDigest");
  digestValue(input.adapterDigest, "adapterDigest");
  if (!runnerClasses.has(input.adapterClass))
    invalid("plan adapter class is invalid");
  const cellIds = tokenArray(input.cellIds, "plan cellIds", 240, 240);
  if (!Array.isArray(input.shards) || input.shards.length !== 48)
    invalid("normative operation plan must contain 48 shards");
  const shards = input.shards.map((shard, shardIndex) => {
    exact(shard, shardKeys, "normative operation shard");
    const shardValue = shard as unknown as NormativeOperationShardV1;
    const rebuilt = createShard(without(shardValue, "shardDigest"));
    if (rebuilt.shardIndex !== shardIndex)
      invalid("normative operation shards are not ordered");
    digestValue(shardValue.shardDigest, "shardDigest");
    equalCanonical(shardValue, rebuilt, "normative operation shard");
    const expected = cellIds.slice(shardIndex * 5, (shardIndex + 1) * 5);
    if (!sameStrings(rebuilt.cellIds, expected))
      invalid("normative operation shard partition is invalid");
    return rebuilt;
  });
  return freeze({ ...input, cellIds, shards: Object.freeze(shards) });
}

export function normativeMetricProjectionDigestV1(
  input: Omit<NormativeMetricProjectionV1, "projectionDigest">,
): PlanningDigestV1 {
  const body = normalizeMetricBody(input);
  return digest("normative-metric-projection-v1", body);
}

export function normativeProjectedEventIdsDigestV1(
  input: readonly string[],
): PlanningDigestV1 {
  const eventIds = tokenArray(
    input,
    "projectedEventIds",
    1,
    NORMATIVE_OPERATION_LIMITS_V1.maximumProjectionEventIds,
  );
  return digest("normative-projected-event-ids-v1", eventIds);
}

export function createNormativeMetricProjectionV1(
  input: Omit<NormativeMetricProjectionV1, "projectionDigest">,
): NormativeMetricProjectionV1 {
  const body = normalizeMetricBody(input);
  return freeze({
    ...body,
    projectionDigest: digest("normative-metric-projection-v1", body),
  });
}

export function validateNormativeMetricProjectionV1(
  input: unknown,
): NormativeMetricProjectionV1 {
  exact(input, metricKeys, "normative metric projection");
  const value = input as unknown as NormativeMetricProjectionV1;
  const rebuilt = createNormativeMetricProjectionV1(
    without(value, "projectionDigest"),
  );
  digestValue(value.projectionDigest, "projectionDigest");
  equalCanonical(value, rebuilt, "normative metric projection");
  return rebuilt;
}

function normalizeMetricBody(
  input: Omit<NormativeMetricProjectionV1, "projectionDigest">,
): Omit<NormativeMetricProjectionV1, "projectionDigest"> {
  exact(input, metricBodyKeys, "normative metric projection input");
  if (input.schemaVersion !== 1 || input.projectionOwner !== "evaluator")
    invalid("metric projection must be evaluator-owned");
  digestValue(input.evaluatorDigest, "evaluatorDigest");
  token(
    input.executionId,
    "executionId",
    NORMATIVE_OPERATION_LIMITS_V1.maximumExecutionIdentifierBytes,
  );
  token(input.runKey, "runKey", 512);
  if (input.attempt !== "first" && input.attempt !== "replay")
    invalid("metric projection attempt is invalid");
  digestValue(input.registrationDigest, "registrationDigest");
  token(input.cellId, "cellId", 512);
  integer(input.seed, "seed", 0, Number.MAX_SAFE_INTEGER);
  if (!runners.includes(input.runner))
    invalid("metric projection runner is invalid");
  if (!executionStatuses.has(input.executionStatus))
    invalid("execution status is invalid");
  if (!validityValues.has(input.validity))
    invalid("projection validity is invalid");
  if (!missionOutcomes.has(input.missionOutcome))
    invalid("mission outcome is invalid");
  nullableToken(input.reasonCode, "reasonCode", 128);
  if (
    input.executionStatus !== "completed" &&
    (input.validity !== "invalid" ||
      input.missionOutcome !== "not_available" ||
      input.reasonCode === null)
  )
    invalid("non-completed execution must be invalid and outcome-unavailable");
  if (
    input.executionStatus === "completed" &&
    input.validity === "valid" &&
    input.missionOutcome === "not_available"
  )
    invalid("valid completed execution must contain a mission outcome");
  if (input.validity === "invalid" && input.reasonCode === null)
    invalid("invalid projection must contain a reason code");
  if (input.validity === "valid" && input.reasonCode !== null)
    invalid("valid projection cannot contain a reason code");
  integer(input.interactionCeiling, "interactionCeiling", 1, 5_000);
  if (![1_000, 1_600, 3_000, 5_000].includes(input.interactionCeiling))
    invalid("interaction ceiling is outside the registered ladder");
  integer(
    input.interactionTotal,
    "interactionTotal",
    0,
    input.interactionCeiling,
  );
  const eventBinding = normalizeEventBinding(input.eventBinding);
  const safety = normalizeSafety(input.safety);
  const faults = normalizeFaults(input.faults);
  const recovery = normalizeRecovery(input.recovery);
  const convergence = normalizeConvergence(input.convergence);
  const roleCoherence = normalizeRole(input.roleCoherence);
  const referenced = new Set(eventBinding.projectedEventIds);
  for (const eventId of projectionMetricEventIds(
    faults,
    recovery,
    convergence,
    roleCoherence,
  ))
    if (eventId !== null && !referenced.has(eventId))
      invalid("metric event is outside projected event binding");
  return freeze({
    ...input,
    eventBinding,
    safety,
    faults,
    recovery,
    convergence,
    roleCoherence,
  });
}

function normalizeEventBinding(
  input: NormativeMetricEventBindingV1,
): NormativeMetricEventBindingV1 {
  exact(input, eventBindingBodyKeys, "normative metric event binding");
  if (input.schemaVersion !== 1)
    invalid("metric event binding schema is invalid");
  digestValue(input.boundaryEvidenceDigest, "boundaryEvidenceDigest");
  digestValue(input.traceDigest, "traceDigest");
  nullableDigest(input.traceRoot, "traceRoot");
  digestValue(input.monitorVerdictDigest, "monitorVerdictDigest");
  token(input.firstEventId, "firstEventId", 256);
  token(input.lastEventId, "lastEventId", 256);
  token(input.terminalEventId, "terminalEventId", 256);
  integer(
    input.eventCount,
    "eventCount",
    1,
    NORMATIVE_OPERATION_LIMITS_V1.maximumTraceEventsPerExecution,
  );
  const projectedEventIds = tokenArray(
    input.projectedEventIds,
    "projectedEventIds",
    1,
    NORMATIVE_OPERATION_LIMITS_V1.maximumProjectionEventIds,
  );
  if (projectedEventIds.length > input.eventCount)
    invalid("projected event ids exceed the bound trace event count");
  for (const required of [
    input.firstEventId,
    input.lastEventId,
    input.terminalEventId,
  ])
    if (!projectedEventIds.includes(required))
      invalid("event binding omits a chain anchor");
  const projectedEventIdsDigest =
    normativeProjectedEventIdsDigestV1(projectedEventIds);
  if (input.projectedEventIdsDigest !== projectedEventIdsDigest)
    invalid("projectedEventIdsDigest does not match event ids");
  return freeze({ ...input, projectedEventIds, projectedEventIdsDigest });
}

function normalizeSafety(
  input: NormativeSafetyMetricsV1,
): NormativeSafetyMetricsV1 {
  exact(input, safetyKeys, "normative safety metrics");
  if (input.schemaVersion !== 1) invalid("safety metric schema is invalid");
  for (const key of safetyKeys.slice(1))
    integer(
      input[key as keyof NormativeSafetyMetricsV1],
      String(key),
      0,
      1_000_000,
    );
  return freeze({ ...input });
}

function normalizeFaults(
  input: NormativeFaultMetricsV1,
): NormativeFaultMetricsV1 {
  exact(input, faultKeys, "normative fault metrics");
  if (input.schemaVersion !== 1) invalid("fault metric schema is invalid");
  const registeredFamilies = tokenArray(
    input.registeredFamilies,
    "registeredFamilies",
    0,
    NORMATIVE_OPERATION_LIMITS_V1.maximumFaultFamilies,
  );
  if (!isLexicallyOrdered(registeredFamilies))
    invalid("registered fault families must use canonical order");
  if (
    !Array.isArray(input.events) ||
    input.events.length !== registeredFamilies.length
  )
    invalid("fault events must cover registered families one-to-one");
  const seen = new Set<string>();
  const events = input.events.map((event) => {
    exact(event, faultEventKeys, "fault event binding");
    const eventValue = event as unknown as NormativeFaultEventBindingV1;
    if (eventValue.schemaVersion !== 1)
      invalid("fault event binding schema is invalid");
    token(eventValue.family, "fault family", 128);
    if (
      !registeredFamilies.includes(eventValue.family) ||
      seen.has(eventValue.family)
    )
      invalid("fault event family is unregistered or duplicated");
    seen.add(eventValue.family);
    token(eventValue.scheduleEventId, "scheduleEventId", 256);
    nullableToken(eventValue.injectionEventId, "injectionEventId", 256);
    nullableToken(eventValue.observationEventId, "observationEventId", 256);
    if (
      eventValue.observationEventId !== null &&
      eventValue.injectionEventId === null
    )
      invalid("observed fault must bind an injection");
    return freeze({ ...eventValue });
  });
  if (events.some((event, index) => event.family !== registeredFamilies[index]))
    invalid("fault events must follow canonical registered-family order");
  return freeze({
    schemaVersion: 1,
    registeredFamilies,
    events: Object.freeze(events),
  });
}

function normalizeRecovery(
  input: NormativeRecoveryMetricsV1,
): NormativeRecoveryMetricsV1 {
  exact(input, recoveryKeys, "normative recovery metrics");
  if (input.schemaVersion !== 1) invalid("recovery metric schema is invalid");
  const events = [
    input.disruptionEventId,
    input.replanEventId,
    input.assignmentChangeEventId,
    input.recoveryEventId,
  ];
  for (const event of events) nullableToken(event, "recovery event id", 256);
  nullableInteger(input.interactionsToReplan, "interactionsToReplan", 0, 5_000);
  nullableInteger(
    input.interactionsToRecovery,
    "interactionsToRecovery",
    0,
    5_000,
  );
  const empty = events.every((event) => event === null);
  if (
    empty !==
    (input.interactionsToReplan === null &&
      input.interactionsToRecovery === null)
  )
    invalid("recovery event and interaction bindings conflict");
  if (!empty && events.some((event) => event === null))
    invalid("recovery metrics require a complete causal event chain");
  if (
    input.interactionsToReplan !== null &&
    input.interactionsToRecovery !== null &&
    input.interactionsToReplan > input.interactionsToRecovery
  )
    invalid("recovery interaction ordering is invalid");
  return freeze({ ...input });
}

function normalizeConvergence(
  input: NormativeConvergenceMetricsV1,
): NormativeConvergenceMetricsV1 {
  exact(input, convergenceKeys, "normative convergence metrics");
  if (input.schemaVersion !== 1)
    invalid("convergence metric schema is invalid");
  nullableToken(input.healOrQuiescenceEventId, "healOrQuiescenceEventId", 256);
  nullableToken(input.agreementEventId, "agreementEventId", 256);
  integer(input.healthyParticipantCount, "healthyParticipantCount", 0, 500);
  integer(
    input.agreeingParticipantCount,
    "agreeingParticipantCount",
    0,
    input.healthyParticipantCount,
  );
  nullableInteger(
    input.interactionsToAgreement,
    "interactionsToAgreement",
    0,
    5_000,
  );
  const hasEvents =
    input.healOrQuiescenceEventId !== null || input.agreementEventId !== null;
  if (
    hasEvents !== (input.interactionsToAgreement !== null) ||
    (hasEvents &&
      (input.healOrQuiescenceEventId === null ||
        input.agreementEventId === null))
  )
    invalid("convergence event and interaction bindings conflict");
  if (
    !hasEvents &&
    (input.healthyParticipantCount !== 0 ||
      input.agreeingParticipantCount !== 0)
  )
    invalid("unbound convergence counts must be zero");
  return freeze({ ...input });
}

function normalizeRole(
  input: NormativeRoleCoherenceMetricsV1,
): NormativeRoleCoherenceMetricsV1 {
  exact(input, roleKeys, "normative role coherence metrics");
  if (input.schemaVersion !== 1) invalid("role metric schema is invalid");
  nullableToken(input.firstDecisionEventId, "firstDecisionEventId", 256);
  nullableToken(input.lastDecisionEventId, "lastDecisionEventId", 256);
  nullableToken(input.firstUnsafeEventId, "firstUnsafeEventId", 256);
  integer(input.decisionCount, "decisionCount", 0, 100_000);
  integer(
    input.coherentDecisionCount,
    "coherentDecisionCount",
    0,
    input.decisionCount,
  );
  integer(
    input.usefulDecisionCount,
    "usefulDecisionCount",
    0,
    input.coherentDecisionCount,
  );
  integer(
    input.unsafeExecutableCount,
    "unsafeExecutableCount",
    0,
    input.decisionCount,
  );
  if (
    (input.decisionCount === 0) !==
    (input.firstDecisionEventId === null && input.lastDecisionEventId === null)
  )
    invalid("role decision event bindings conflict");
  if (
    (input.unsafeExecutableCount === 0) !==
    (input.firstUnsafeEventId === null)
  )
    invalid("unsafe decision event binding conflicts with count");
  return freeze({ ...input });
}

export function campaignEligibilityAttestationDigestV1(
  input: Omit<CampaignEligibilityAttestationV1, "attestationDigest">,
): PlanningDigestV1 {
  const body = normalizeAttestationBody(input, true);
  return digest("campaign-eligibility-attestation-v1", body);
}

export function createCampaignEligibilityAttestationV1(
  input: Omit<CampaignEligibilityAttestationV1, "attestationDigest">,
): CampaignEligibilityAttestationV1 {
  if (input.status === "eligible")
    invalid("eligible attestations require verified closure derivation");
  return createAttestation(input, false);
}

/** Structural validation only; trust requires verifyCampaignEligibilityAttestationV1. */
export function validateCampaignEligibilityAttestationV1(
  input: unknown,
): CampaignEligibilityAttestationV1 {
  exact(input, attestationKeys, "campaign eligibility attestation");
  const value = input as unknown as CampaignEligibilityAttestationV1;
  const body = normalizeAttestationBody(
    without(value, "attestationDigest"),
    true,
  );
  const rebuilt = freeze({
    ...body,
    attestationDigest: digest("campaign-eligibility-attestation-v1", body),
  });
  digestValue(value.attestationDigest, "attestationDigest");
  equalCanonical(value, rebuilt, "campaign eligibility attestation");
  return rebuilt;
}

function normalizeAttestationBody(
  input: Omit<CampaignEligibilityAttestationV1, "attestationDigest">,
  allowEligible: boolean,
): Omit<CampaignEligibilityAttestationV1, "attestationDigest"> {
  exact(input, attestationBodyKeys, "campaign eligibility attestation input");
  if (input.schemaVersion !== 1 || !eligibilityStatuses.has(input.status))
    invalid("eligibility attestation status is invalid");
  if (
    !Array.isArray(input.reasonCodes) ||
    input.reasonCodes.length > NORMATIVE_OPERATION_LIMITS_V1.maximumReasonCodes
  )
    invalid("eligibility reason codes are invalid");
  const reasonCodes = Object.freeze(
    input.reasonCodes.map((reason) => {
      if (!eligibilityReasonCodes.has(reason))
        invalid("eligibility reason code is invalid");
      return reason;
    }),
  );
  if (new Set(reasonCodes).size !== reasonCodes.length)
    invalid("eligibility reason codes are duplicated");
  token(input.campaignId, "campaignId", 256);
  token(
    input.executionId,
    "executionId",
    NORMATIVE_OPERATION_LIMITS_V1.maximumExecutionIdentifierBytes,
  );
  for (const [label, value] of [
    ["planDigest", input.planDigest],
    ["registrationDigest", input.registrationDigest],
    ["bundleDigest", input.bundleDigest],
    ["sourceTreeDigest", input.sourceTreeDigest],
    ["adapterDigest", input.adapterDigest],
    ["authorizationDigest", input.authorizationDigest],
    ["analyzerDigest", input.analyzerDigest],
    ["analysisPolicyDigest", input.analysisPolicyDigest],
    ["analysisDigest", input.analysisDigest],
    ["metricProjectionRootDigest", input.metricProjectionRootDigest],
    ["closureProofDigest", input.closureProofDigest],
  ] as const)
    digestValue(value, label);
  commit(input.sourceCommit);
  if (!runnerClasses.has(input.adapterClass))
    invalid("attestation adapter class is invalid");
  integer(input.analyzedCellCount, "analyzedCellCount", 0, 240);
  integer(input.analyzedSlotCount, "analyzedSlotCount", 0, 960);
  timestamp(input.createdAt, "createdAt");
  if (input.status === "eligible") {
    if (!allowEligible)
      invalid("eligible attestations require verified closure derivation");
    if (
      reasonCodes.length !== 0 ||
      input.adapterClass !== "normative_candidate" ||
      input.analyzedCellCount !== 240 ||
      input.analyzedSlotCount !== 960
    )
      invalid("eligible attestation does not prove exact normative closure");
  } else if (reasonCodes.length === 0) {
    invalid("non-eligible attestation must contain reason codes");
  }
  if (
    (input.adapterClass === "diagnostic" ||
      input.adapterClass === "synthetic_conformance") &&
    input.status === "eligible"
  )
    invalid("diagnostic and synthetic adapters cannot be eligible");
  if (
    input.status === "incomplete" &&
    !reasonCodes.some(
      (reason) => reason === "campaign_incomplete" || reason === "slot_missing",
    )
  )
    invalid("incomplete attestation must identify incomplete closure");
  return freeze({ ...input, reasonCodes });
}

function createAttestation(
  input: Omit<CampaignEligibilityAttestationV1, "attestationDigest">,
  allowEligible: boolean,
): CampaignEligibilityAttestationV1 {
  const body = normalizeAttestationBody(input, allowEligible);
  return freeze({
    ...body,
    attestationDigest: digest("campaign-eligibility-attestation-v1", body),
  });
}

export type CampaignEligibilityVerifiedClosureProofBodyV1 = Omit<
  CampaignEligibilityVerifiedClosureProofV1,
  "proofDigest" | "authentication"
>;
export type CreateCampaignEligibilityVerifiedClosureProofInputV1 =
  CampaignEligibilityVerifiedClosureProofBodyV1 &
    Readonly<{ authentication: NormativeDetachedAuthenticationV1 }>;

export function campaignEligibilityVerifiedClosureProofDigestV1(
  input: CampaignEligibilityVerifiedClosureProofBodyV1,
): PlanningDigestV1 {
  return digest(
    "campaign-eligibility-closure-proof-v1",
    normalizeClosureProofBody(input),
  );
}

export function createCampaignEligibilityVerifiedClosureProofV1(
  input: CreateCampaignEligibilityVerifiedClosureProofInputV1,
): CampaignEligibilityVerifiedClosureProofV1 {
  exact(
    input,
    [...closureProofBodyKeys, "authentication"],
    "campaign eligibility closure proof factory input",
  );
  const { authentication: authenticationInput, ...bodyInput } = input;
  const body = normalizeClosureProofBody(bodyInput);
  const authentication = normalizeDetachedAuthentication(authenticationInput);
  return freeze({
    ...body,
    proofDigest: digest("campaign-eligibility-closure-proof-v1", body),
    authentication,
  });
}

export function validateCampaignEligibilityVerifiedClosureProofV1(
  input: unknown,
): CampaignEligibilityVerifiedClosureProofV1 {
  exact(input, closureProofKeys, "campaign eligibility closure proof");
  const value = input as unknown as CampaignEligibilityVerifiedClosureProofV1;
  const { proofDigest: _proofDigest, ...factoryInput } = value;
  const rebuilt = createCampaignEligibilityVerifiedClosureProofV1(factoryInput);
  digestValue(value.proofDigest, "proofDigest");
  equalCanonical(value, rebuilt, "campaign eligibility closure proof");
  return rebuilt;
}

/**
 * The only public constructor that can produce `eligible`. It authenticates a
 * closure proof supplied by the evidence-owning layer, then derives closure
 * counts, status and reason codes without accepting any of them from callers.
 */
export async function deriveCampaignEligibilityAttestationV1(
  input: Readonly<{
    schemaVersion: 1;
    proof: CampaignEligibilityVerifiedClosureProofV1;
    createdAt: string;
    verifier: CampaignEligibilityClosureProofVerifierPortV1;
  }>,
): Promise<CampaignEligibilityAttestationV1> {
  exact(
    input,
    ["schemaVersion", "proof", "createdAt", "verifier"],
    "eligibility derivation input",
  );
  if (input.schemaVersion !== 1)
    invalid("eligibility derivation schema is invalid");
  timestamp(input.createdAt, "createdAt");
  const proof = validateCampaignEligibilityVerifiedClosureProofV1(input.proof);
  const verifier = normalizeClosureProofVerifier(input.verifier);
  const authentic = await verifier.verifyClosureProofV1(
    freeze({
      schemaVersion: 1,
      purpose: "campaign-eligibility-closure-proof-v1",
      proofDigest: proof.proofDigest,
      authentication: proof.authentication,
      executionId: proof.executionId,
      planDigest: proof.planDigest,
      bundleDigest: proof.bundleDigest,
      metricProjectionRootDigest: proof.metricProjectionRootDigest,
      analyzerDigest: proof.analyzerDigest,
      analysisDigest: proof.analysisDigest,
    }),
  );
  if (authentic !== true)
    invalid("eligibility closure proof authentication failed");

  const reasons = deriveEligibilityReasons(proof);
  const analyzedCellCount = intersectionCount(
    proof.expectedCellIds,
    proof.verifiedCellIds,
  );
  const analyzedSlotCount = intersectionCount(
    proof.expectedRunKeys,
    proof.verifiedRunKeys,
  );
  const incomplete =
    analyzedCellCount !== NORMATIVE_OPERATION_EXPECTED_CELL_COUNT_V1 ||
    analyzedSlotCount !== NORMATIVE_OPERATION_EXPECTED_SLOT_COUNT_V1;
  const status: CampaignEligibilityStatusV1 = incomplete
    ? "incomplete"
    : reasons.length === 0
      ? "eligible"
      : "ineligible";
  return createAttestation(
    {
      schemaVersion: 1,
      status,
      reasonCodes: reasons,
      campaignId: proof.campaignId,
      executionId: proof.executionId,
      planDigest: proof.planDigest,
      registrationDigest: proof.registrationDigest,
      bundleDigest: proof.bundleDigest,
      sourceCommit: proof.sourceCommit,
      sourceTreeDigest: proof.sourceTreeDigest,
      adapterClass: proof.adapterClass,
      adapterDigest: proof.adapterDigest,
      authorizationDigest: proof.authorizationDigest,
      analyzerDigest: proof.analyzerDigest,
      analysisPolicyDigest: proof.analysisPolicyDigest,
      analysisDigest: proof.analysisDigest,
      metricProjectionRootDigest: proof.metricProjectionRootDigest,
      closureProofDigest: proof.proofDigest,
      analyzedCellCount,
      analyzedSlotCount,
      createdAt: input.createdAt,
    },
    true,
  );
}

/** Re-authenticates and re-derives a serialized eligibility attestation. */
export async function verifyCampaignEligibilityAttestationV1(
  input: Readonly<{
    schemaVersion: 1;
    attestation: CampaignEligibilityAttestationV1;
    proof: CampaignEligibilityVerifiedClosureProofV1;
    verifier: CampaignEligibilityClosureProofVerifierPortV1;
  }>,
): Promise<CampaignEligibilityAttestationV1> {
  exact(
    input,
    ["schemaVersion", "attestation", "proof", "verifier"],
    "eligibility attestation verification input",
  );
  if (input.schemaVersion !== 1)
    invalid("eligibility attestation verification schema is invalid");
  const attestation = validateCampaignEligibilityAttestationV1(
    input.attestation,
  );
  const derived = await deriveCampaignEligibilityAttestationV1({
    schemaVersion: 1,
    proof: input.proof,
    createdAt: attestation.createdAt,
    verifier: input.verifier,
  });
  equalCanonical(attestation, derived, "authenticated eligibility attestation");
  return derived;
}

function normalizeClosureProofBody(
  input: CampaignEligibilityVerifiedClosureProofBodyV1,
): CampaignEligibilityVerifiedClosureProofBodyV1 {
  exact(
    input,
    closureProofBodyKeys,
    "campaign eligibility closure proof input",
  );
  if (input.schemaVersion !== 1) invalid("closure proof schema is invalid");
  token(input.campaignId, "campaignId", 256);
  token(
    input.executionId,
    "executionId",
    NORMATIVE_OPERATION_LIMITS_V1.maximumExecutionIdentifierBytes,
  );
  for (const [label, value] of [
    ["planDigest", input.planDigest],
    ["registrationDigest", input.registrationDigest],
    ["bundleDigest", input.bundleDigest],
    ["sourceTreeDigest", input.sourceTreeDigest],
    ["adapterDigest", input.adapterDigest],
    ["authorizationDigest", input.authorizationDigest],
    ["analyzerDigest", input.analyzerDigest],
    ["analysisPolicyDigest", input.analysisPolicyDigest],
    ["analysisDigest", input.analysisDigest],
    ["metricProjectionRootDigest", input.metricProjectionRootDigest],
  ] as const)
    digestValue(value, label);
  commit(input.sourceCommit);
  if (!runnerClasses.has(input.adapterClass))
    invalid("closure proof adapter class is invalid");
  const expectedCellIds = tokenArray(
    input.expectedCellIds,
    "expectedCellIds",
    240,
    240,
  );
  const verifiedCellIds = boundedTokenArray(
    input.verifiedCellIds,
    "verifiedCellIds",
    240,
  );
  const expectedRunKeys = tokenArray(
    input.expectedRunKeys,
    "expectedRunKeys",
    960,
    960,
  );
  const verifiedRunKeys = boundedTokenArray(
    input.verifiedRunKeys,
    "verifiedRunKeys",
    960,
  );
  const checks = normalizeClosureChecks(input.checks);
  return freeze({
    ...input,
    expectedCellIds,
    verifiedCellIds,
    expectedRunKeys,
    verifiedRunKeys,
    checks,
  });
}

function normalizeClosureChecks(
  input: CampaignEligibilityClosureChecksV1,
): CampaignEligibilityClosureChecksV1 {
  exact(input, closureCheckKeys, "campaign eligibility closure checks");
  if (input.schemaVersion !== 1) invalid("closure check schema is invalid");
  for (const key of closureCheckKeys.slice(1))
    if (
      typeof input[key as keyof CampaignEligibilityClosureChecksV1] !==
      "boolean"
    )
      invalid(`${String(key)} must be boolean`);
  return freeze({ ...input });
}

function normalizeClosureProofVerifier(
  input: CampaignEligibilityClosureProofVerifierPortV1,
): CampaignEligibilityClosureProofVerifierPortV1 {
  exact(
    input,
    ["schemaVersion", "verifyClosureProofV1"],
    "closure proof verifier port",
  );
  if (
    input.schemaVersion !== 1 ||
    typeof input.verifyClosureProofV1 !== "function"
  )
    invalid("closure proof verifier port is invalid");
  return input;
}

function deriveEligibilityReasons(
  proof: CampaignEligibilityVerifiedClosureProofV1,
): readonly CampaignEligibilityReasonCodeV1[] {
  const reasons = new Set<CampaignEligibilityReasonCodeV1>();
  if (proof.adapterClass !== "normative_candidate")
    reasons.add("adapter_not_normative");
  const checkReasons: readonly [boolean, CampaignEligibilityReasonCodeV1][] = [
    [proof.checks.adapterCapabilitiesMatch, "adapter_capability_mismatch"],
    [proof.checks.authorizationValid, "authorization_invalid"],
    [proof.checks.sourceLockMatches, "source_lock_mismatch"],
    [proof.checks.cleanSource, "dirty_source"],
    [proof.checks.executionsValid, "execution_invalid"],
    [proof.checks.replayMatches, "replay_diverged"],
    [proof.checks.tracesValid, "trace_invalid"],
    [proof.checks.ledgersMatch, "ledger_mismatch"],
    [proof.checks.monitorMatches, "monitor_mismatch"],
    [proof.checks.topologyMatches, "topology_mismatch"],
    [proof.checks.faultCoverageComplete, "fault_coverage_incomplete"],
    [proof.checks.safetyPassed, "safety_violation"],
    [proof.checks.evaluationIntegrityPassed, "evaluation_integrity_violation"],
    [proof.checks.thresholdsPassed, "threshold_not_met"],
    [proof.checks.analysisPolicyMatches, "analysis_policy_mismatch"],
    [proof.checks.negativeControlsPassed, "negative_control_failed"],
    [proof.checks.artifactLimitsPassed, "artifact_limit_exceeded"],
  ];
  for (const [passed, reason] of checkReasons) if (!passed) reasons.add(reason);
  const cellSet = new Set(proof.verifiedCellIds);
  const runSet = new Set(proof.verifiedRunKeys);
  if (!sameSet(proof.expectedCellIds, cellSet))
    reasons.add("campaign_incomplete");
  if (!sameSet(proof.expectedRunKeys, runSet)) reasons.add("slot_missing");
  if (
    cellSet.size !== proof.verifiedCellIds.length ||
    runSet.size !== proof.verifiedRunKeys.length
  )
    reasons.add("slot_duplicate");
  if (
    proof.verifiedCellIds.some(
      (value) => !proof.expectedCellIds.includes(value),
    ) ||
    proof.verifiedRunKeys.some(
      (value) => !proof.expectedRunKeys.includes(value),
    )
  )
    reasons.add("execution_invalid");
  return Object.freeze(
    CAMPAIGN_ELIGIBILITY_REASON_CODES_V1.filter((reason) =>
      reasons.has(reason),
    ),
  );
}

function requireNormativeRegistration(
  input: CollectiveEvaluationCampaignRegistrationV1,
): CollectiveEvaluationCampaignRegistrationV1 {
  const registration =
    validateCollectiveEvaluationCampaignRegistrationV1(input);
  if (
    registration.profile !==
      COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1 ||
    registration.cells.length !== NORMATIVE_OPERATION_EXPECTED_CELL_COUNT_V1
  )
    invalid("normative operation requires the exact normative registration");
  return registration;
}

function projectionMetricEventIds(
  faults: NormativeFaultMetricsV1,
  recovery: NormativeRecoveryMetricsV1,
  convergence: NormativeConvergenceMetricsV1,
  role: NormativeRoleCoherenceMetricsV1,
): readonly (string | null)[] {
  return [
    ...faults.events.flatMap((event) => [
      event.scheduleEventId,
      event.injectionEventId,
      event.observationEventId,
    ]),
    recovery.disruptionEventId,
    recovery.replanEventId,
    recovery.assignmentChangeEventId,
    recovery.recoveryEventId,
    convergence.healOrQuiescenceEventId,
    convergence.agreementEventId,
    role.firstDecisionEventId,
    role.lastDecisionEventId,
    role.firstUnsafeEventId,
  ];
}

function digest(kind: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "evaluation-campaign-artifact-v1",
    {
      schemaVersion: 1,
      kind,
      value,
    } as unknown as JsonValue,
    {
      maximumBytes: NORMATIVE_OPERATION_LIMITS_V1.maximumContractBytes,
      maximumDepth: 32,
      maximumNodes: 16_384,
      maximumKeysPerObject: 256,
      maximumItemsPerArray: 4_096,
    },
  );
}

function freeze<T>(value: T): T {
  return deepFreezePlanning(value as unknown as JsonValue) as unknown as T;
}

function exact(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    invalid(`${label} must be a plain object`);
  const actual = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  if (
    Object.getOwnPropertySymbols(value).length > 0 ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    invalid(`${label} has an invalid shape`);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      invalid(`${label} must contain enumerable data properties`);
  }
}

function without<T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const result = { ...value };
  delete result[key];
  return result;
}

function digestValue(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !digestPattern.test(value))
    invalid(`${label} is invalid`);
}

function nullableDigest(value: unknown, label: string): void {
  if (value !== null) digestValue(value, label);
}

function commit(value: unknown): asserts value is string {
  if (typeof value !== "string" || !commitPattern.test(value))
    invalid("sourceCommit is invalid");
}

function token(
  value: unknown,
  label: string,
  maximumLength: number,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    !tokenPattern.test(value)
  )
    invalid(`${label} is invalid`);
}

function nullableToken(
  value: unknown,
  label: string,
  maximumLength: number,
): void {
  if (value !== null) token(value, label, maximumLength);
}

function tokenArray(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    invalid(`${label} is invalid`);
  const result = value.map((entry) => {
    token(entry, label, 512);
    return entry;
  });
  if (new Set(result).size !== result.length)
    invalid(`${label} contains duplicates`);
  return Object.freeze(result);
}

function boundedTokenArray(
  value: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum)
    invalid(`${label} is invalid`);
  return Object.freeze(
    value.map((entry) => {
      token(entry, label, 512);
      return entry;
    }),
  );
}

function enumArray<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): readonly T[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > NORMATIVE_OPERATION_LIMITS_V1.maximumCapabilityValues
  )
    invalid(`${label} is invalid`);
  const result = value.map((entry) => {
    if (!allowed.includes(entry as T))
      invalid(`${label} contains an invalid value`);
    return entry as T;
  });
  if (new Set(result).size !== result.length)
    invalid(`${label} contains duplicates`);
  const positions = result.map((entry) => allowed.indexOf(entry));
  if (
    positions.some(
      (position, index) => index > 0 && positions[index - 1]! >= position,
    )
  )
    invalid(`${label} must use canonical order`);
  return Object.freeze(result);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    invalid(`${label} is invalid`);
}

function nullableInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (value !== null) integer(value, label, minimum, maximum);
}

function integerArray(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length > NORMATIVE_OPERATION_SHARD_COUNT_V1
  )
    invalid(`${label} is invalid`);
  const result = value.map((entry) => {
    integer(entry, label, minimum, maximum);
    return entry;
  });
  if (
    new Set(result).size !== result.length ||
    result.some((entry, index) => index > 0 && result[index - 1]! >= entry)
  )
    invalid(`${label} must be unique and ordered`);
  return Object.freeze(result);
}

function timestamp(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !rfc3339Pattern.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid(`${label} is invalid`);
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameValues<T extends string | number>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isLexicallyOrdered(values: readonly string[]): boolean {
  return values.every(
    (value, index) => index === 0 || values[index - 1]! < value,
  );
}

function sameSet(
  expected: readonly string[],
  actual: ReadonlySet<string>,
): boolean {
  return (
    expected.length === actual.size &&
    expected.every((value) => actual.has(value))
  );
}

function intersectionCount(
  expected: readonly string[],
  actual: readonly string[],
): number {
  const expectedSet = new Set(expected);
  return new Set(actual.filter((value) => expectedSet.has(value))).size;
}

function equalCanonical(left: unknown, right: unknown, label: string): void {
  if (
    canonicalizePlanningJsonV1(left as JsonValue) !==
    canonicalizePlanningJsonV1(right as JsonValue)
  )
    invalid(`${label} does not match canonical content`);
}

function invalid(message: string): never {
  throw new CollectivePlanningValidationError(message);
}
