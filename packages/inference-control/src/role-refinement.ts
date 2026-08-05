import type { JsonObject, JsonValue } from "@agentplat/core";

import { canonicalizeControlJsonV1 } from "./canonical.js";
import { sha256Hex } from "./sha256.js";
import {
  assertTrustedRoleDefinitionWithinAuthorityCeilingV1,
  createTrustedRoleDefinitionV1,
  validateRoleAuthorityCeilingV1,
  validateTrustedRoleDefinitionV1,
  type RoleAuthorityCeilingV1,
  type RoleRealignmentPolicyV1,
  type TrustedRoleDefinitionV1,
} from "./role-realignment.js";
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertOneOf,
  assertPlainRecord,
  assertSafeInteger,
  assertStrictJsonValue,
  compareCodeUnits,
  deepFreeze,
  sortedUnique,
} from "./validation.js";

export const ROLE_REFINEMENT_SCHEMA_VERSION_V1 = 1 as const;
export const ROLE_REFINEMENT_BASIS_POINTS_V1 = 10_000 as const;

export type RoleRefinementStatusV1 =
  | "requested"
  | "collecting"
  | "selected"
  | "certified"
  | "published"
  | "monitoring"
  | "confirmed"
  | "rollback_required"
  | "rollback_certified"
  | "rolled_back"
  | "quarantined"
  | "expired"
  | "failed";

export type RoleRefinementEventTypeV1 =
  | "requested"
  | "candidate_admitted"
  | "candidate_evaluated"
  | "candidate_selected"
  | "publication_certified"
  | "revision_published"
  | "revision_activated"
  | "observation_recorded"
  | "revision_confirmed"
  | "rollback_required"
  | "rollback_certified"
  | "revision_rolled_back"
  | "revision_quarantined"
  | "expired"
  | "failed"
  | "session_rebound";

export interface RoleRefinementThresholdsV1 {
  readonly minimumPredictedCoherenceBps: number;
  readonly minimumPredictedContributionBps: number;
  readonly maximumPredictedUncertaintyBps: number;
  readonly maximumTransitionRiskBps: number;
  readonly confirmationCoherenceBps: number;
  readonly confirmationContributionBps: number;
  readonly confirmationMaximumUncertaintyBps: number;
  readonly rollbackCoherenceBps: number;
  readonly rollbackContributionBps: number;
  readonly rollbackUncertaintyBps: number;
}

export interface RoleRefinementScoringWeightsV1 {
  readonly coherenceBps: number;
  readonly contributionBps: number;
  readonly uncertaintyPenaltyBps: number;
  readonly transitionRiskPenaltyBps: number;
}

export interface RoleRefinementLimitsV1 {
  readonly maximumCandidates: number;
  readonly maximumStrategies: number;
  readonly maximumEvaluators: number;
  readonly maximumPatchOperations: number;
  readonly maximumInstructions: number;
  readonly maximumInstructionBytes: number;
  readonly maximumConstraintsBytes: number;
  readonly maximumReasonCodes: number;
  readonly maximumEvidenceReferences: number;
  readonly maximumObservations: number;
  readonly maximumEvents: number;
  readonly maximumRequestLifetimeMs: number;
  readonly maximumEvaluationLifetimeMs: number;
  readonly maximumCertificateLifetimeMs: number;
  readonly maximumMonitoringLifetimeMs: number;
}

export interface RoleRefinementPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly minimumIndependentEvaluations: number;
  readonly minimumCertificationWitnesses: number;
  readonly minimumMonitoringObservations: number;
  readonly maximumConsecutiveDegradedObservations: number;
  readonly thresholds: RoleRefinementThresholdsV1;
  readonly scoringWeights: RoleRefinementScoringWeightsV1;
  readonly limits: RoleRefinementLimitsV1;
}

export interface RoleRefinementPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: RoleRefinementPolicyV1;
  readonly policyDigest: string;
}

export interface RoleRefinementEvidenceSummaryV1 {
  readonly schemaVersion: 1;
  readonly alignmentStateRevision: number;
  readonly alignmentStateDigest: string;
  readonly rollingCoherenceBps: number;
  readonly degraded: boolean;
  readonly observedSignalCount: number;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly summarizedAtLogicalMs: number;
  readonly evidenceDigest: string;
}

export interface RoleRefinementRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly selectionId: string;
  readonly publicationId: string;
  readonly activationId: string;
  readonly rollbackId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly objectiveId: string;
  readonly predecessorCatalogId: string;
  readonly predecessorDefinitionId: string;
  readonly predecessorDefinitionRevision: number;
  readonly predecessorDefinitionDigest: string;
  readonly predecessorRoleAnchorDigest: string;
  readonly authorityCeiling: RoleAuthorityCeilingV1;
  readonly evidence: RoleRefinementEvidenceSummaryV1;
  readonly createdAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly requestDigest: string;
}

export interface InstructionInsertOperationV1 {
  readonly operationId: string;
  readonly kind: "instruction_insert";
  readonly index: number;
  readonly instruction: string;
}

export interface InstructionReplaceOperationV1 {
  readonly operationId: string;
  readonly kind: "instruction_replace";
  readonly index: number;
  readonly expectedInstructionDigest: string;
  readonly instruction: string;
}

export interface InstructionRemoveOperationV1 {
  readonly operationId: string;
  readonly kind: "instruction_remove";
  readonly index: number;
  readonly expectedInstructionDigest: string;
}

export interface ConstraintAddOperationV1 {
  readonly operationId: string;
  readonly kind: "constraint_add";
  readonly path: string;
  readonly value: JsonValue;
}

export interface ConstraintReplaceOperationV1 {
  readonly operationId: string;
  readonly kind: "constraint_replace";
  readonly path: string;
  readonly expectedValueDigest: string;
  readonly value: JsonValue;
}

export type RoleRefinementPatchOperationV1 =
  | InstructionInsertOperationV1
  | InstructionReplaceOperationV1
  | InstructionRemoveOperationV1
  | ConstraintAddOperationV1
  | ConstraintReplaceOperationV1;

export interface RoleRefinementAuthorityNarrowingV1 {
  readonly requiredCapabilityKeys: readonly string[];
  readonly requiredResourceClasses: readonly string[];
  readonly maximumActionBudgetUnits: number;
  readonly validUntilLogicalMs: number;
}

export interface RoleRefinementPatchV1 {
  readonly schemaVersion: 1;
  readonly predecessorDefinitionDigest: string;
  readonly operations: readonly RoleRefinementPatchOperationV1[];
  readonly authority: RoleRefinementAuthorityNarrowingV1;
  readonly patchDigest: string;
}

/** Exact local proposal. Coordination state retains only its digests. */
export interface RoleRefinementProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly requestDigest: string;
  readonly proposerId: string;
  readonly proposerVersion: number;
  readonly proposerBindingDigest: string;
  readonly patch: RoleRefinementPatchV1;
  readonly refinedDefinitionDigest: string;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly proposalDigest: string;
}

export interface RoleRefinementSemanticDecisionV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly patchDigest: string;
  readonly refinedDefinitionDigest: string;
  readonly validatorId: string;
  readonly validatorVersion: number;
  readonly validatorBindingDigest: string;
  readonly accepted: boolean;
  readonly objectiveAligned: boolean;
  readonly constraintsNotWeaker: boolean;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly decidedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly decisionDigest: string;
}

/** Content-free candidate persisted and exchanged by the control plane. */
export interface AdmittedRoleRefinementCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly requestDigest: string;
  readonly proposalId: string;
  readonly proposerId: string;
  readonly proposerVersion: number;
  readonly proposerBindingDigest: string;
  readonly proposerTrustDecisionDigest: string;
  readonly draftId: string;
  readonly patchDigest: string;
  readonly refinedDefinitionDigest: string;
  readonly semanticDecisionDigest: string;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly candidateDigest: string;
}

export interface RoleRefinementEvaluationV1 {
  readonly schemaVersion: 1;
  readonly evaluationId: string;
  readonly requestDigest: string;
  readonly candidateDigest: string;
  readonly patchDigest: string;
  readonly refinedDefinitionDigest: string;
  readonly evaluatorId: string;
  readonly evaluatorVersion: number;
  readonly evaluatorBindingDigest: string;
  readonly evaluatorTrustDecisionDigest: string;
  readonly eligible: boolean;
  readonly predictedCoherenceBps: number;
  readonly predictedContributionBps: number;
  readonly uncertaintyBps: number;
  readonly transitionRiskBps: number;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly evaluationDigest: string;
}

export interface RoleRefinementCandidateAggregateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly refinedDefinitionDigest: string;
  readonly eligibleEvaluationDigests: readonly string[];
  readonly meanPredictedCoherenceBps: number;
  readonly meanPredictedContributionBps: number;
  readonly meanUncertaintyBps: number;
  readonly meanTransitionRiskBps: number;
  readonly score: number;
}

export interface RoleRefinementSelectionV1 {
  readonly schemaVersion: 1;
  readonly selectionId: string;
  readonly requestDigest: string;
  readonly selectedCandidateDigest: string;
  readonly selectedPatchDigest: string;
  readonly selectedDefinitionDigest: string;
  readonly aggregates: readonly RoleRefinementCandidateAggregateV1[];
  readonly stateRevision: number;
  readonly selectedAtLogicalMs: number;
  readonly selectionDigest: string;
}

export type RoleRefinementCertificateActionV1 = "publish" | "rollback";

export interface RoleRefinementCertificateV1 {
  readonly schemaVersion: 1;
  readonly certificateId: string;
  readonly action: RoleRefinementCertificateActionV1;
  readonly certifierId: string;
  readonly certifierVersion: number;
  readonly certifierBindingDigest: string;
  readonly requestDigest: string;
  readonly selectionDigest: string;
  readonly predecessorDefinitionDigest: string;
  readonly refinedDefinitionDigest: string;
  readonly patchDigest: string;
  readonly authorityCeilingDigest: string;
  readonly activationDigest: string | null;
  readonly monitoringDigest: string | null;
  readonly witnessIds: readonly string[];
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly sourceCertificateDigest: string;
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly certificateDigest: string;
}

export interface RoleRefinementPublicationV1 {
  readonly schemaVersion: 1;
  readonly publicationId: string;
  readonly catalogId: string;
  readonly definitionId: string;
  readonly definitionRevision: number;
  readonly predecessorDefinitionDigest: string;
  readonly refinedDefinitionDigest: string;
  readonly certificateDigest: string;
  readonly publishedAtLogicalMs: number;
  readonly publicationDigest: string;
}

export interface RoleRefinementActivationV1 {
  readonly schemaVersion: 1;
  readonly activationId: string;
  readonly publicationDigest: string;
  readonly predecessorDefinitionDigest: string;
  readonly refinedDefinitionDigest: string;
  readonly roleBindingId: string;
  readonly roleRevision: number;
  readonly roleContentDigest: string;
  readonly runtimeSessionRevision: number;
  readonly activatedAtLogicalMs: number;
  readonly monitoringExpiresAtLogicalMs: number;
  readonly activationDigest: string;
}

export interface RoleRefinementObservationV1 {
  readonly schemaVersion: 1;
  readonly observationId: string;
  readonly requestDigest: string;
  readonly activationDigest: string;
  readonly observerId: string;
  readonly observerVersion: number;
  readonly observerBindingDigest: string;
  readonly observerTrustDecisionDigest: string;
  readonly coherenceBps: number;
  readonly contributionBps: number;
  readonly uncertaintyBps: number;
  readonly hardViolation: boolean;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly observationDigest: string;
}

export interface RoleRefinementMonitoringV1 {
  readonly schemaVersion: 1;
  readonly observationDigests: readonly string[];
  readonly meanCoherenceBps: number;
  readonly meanContributionBps: number;
  readonly meanUncertaintyBps: number;
  readonly consecutiveDegradedObservations: number;
  readonly hardViolationObserved: boolean;
  readonly evaluatedAtLogicalMs: number;
  readonly monitoringDigest: string;
}

export interface RoleRefinementRollbackV1 {
  readonly schemaVersion: 1;
  readonly rollbackId: string;
  readonly activationDigest: string;
  readonly monitoringDigest: string;
  readonly rollbackCertificateDigest: string;
  readonly restoredDefinitionDigest: string;
  readonly quarantinedDefinitionDigest: string;
  readonly runtimeSessionRevision: number;
  readonly rolledBackAtLogicalMs: number;
  readonly rollbackDigest: string;
}

export interface RoleRefinementEventV1 {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly eventType: RoleRefinementEventTypeV1;
  readonly inputDigest: string;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
  readonly previousEventDigest: string | null;
  readonly eventDigest: string;
}

export interface RoleRefinementStateV1 {
  readonly schemaVersion: 1;
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly tenantId: string;
  readonly activeSessionId: string;
  readonly agentId: string;
  readonly objectiveId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly revision: number;
  readonly status: RoleRefinementStatusV1;
  readonly request: RoleRefinementRequestV1;
  readonly candidates: readonly AdmittedRoleRefinementCandidateV1[];
  readonly evaluations: readonly RoleRefinementEvaluationV1[];
  readonly selection: RoleRefinementSelectionV1 | null;
  readonly publicationCertificate: RoleRefinementCertificateV1 | null;
  readonly publication: RoleRefinementPublicationV1 | null;
  readonly activation: RoleRefinementActivationV1 | null;
  readonly observations: readonly RoleRefinementObservationV1[];
  readonly monitoring: RoleRefinementMonitoringV1 | null;
  readonly rollbackCertificate: RoleRefinementCertificateV1 | null;
  readonly rollback: RoleRefinementRollbackV1 | null;
  readonly events: readonly RoleRefinementEventV1[];
  readonly lastLogicalTimeMs: number;
  readonly stateDigest: string;
}

export interface RoleRefinementTransitionV1 {
  readonly state: RoleRefinementStateV1;
  readonly event: RoleRefinementEventV1;
}

export interface RoleRefinementCertificationPortV1 {
  certify(input: {
    readonly action: RoleRefinementCertificateActionV1;
    readonly state: RoleRefinementStateV1;
    readonly policy: RoleRefinementPolicyV1;
    readonly logicalTimeMs: number;
    readonly expiresAtLogicalMs: number;
    readonly signal?: AbortSignal;
  }): Promise<RoleRefinementCertificateV1 | null>;
}

const STATUS_VALUES: readonly RoleRefinementStatusV1[] = [
  "requested",
  "collecting",
  "selected",
  "certified",
  "published",
  "monitoring",
  "confirmed",
  "rollback_required",
  "rollback_certified",
  "rolled_back",
  "quarantined",
  "expired",
  "failed",
];

const EVENT_TYPES: readonly RoleRefinementEventTypeV1[] = [
  "requested",
  "candidate_admitted",
  "candidate_evaluated",
  "candidate_selected",
  "publication_certified",
  "revision_published",
  "revision_activated",
  "observation_recorded",
  "revision_confirmed",
  "rollback_required",
  "rollback_certified",
  "revision_rolled_back",
  "revision_quarantined",
  "expired",
  "failed",
  "session_rebound",
];

export function digestRoleRefinementJsonV1(
  domain: string,
  value: JsonValue,
): string {
  assertIdentifier(domain, "role refinement digest domain");
  return `sha256:${sha256Hex(
    new TextEncoder().encode(
      `agentplat.inference-control/role-refinement/${domain}/v1\0${canonicalizeControlJsonV1(value)}`,
    ),
  )}`;
}

export function createRoleRefinementPolicyRecordV1(
  input: RoleRefinementPolicyV1,
): RoleRefinementPolicyRecordV1 {
  const policy = validateRoleRefinementPolicyV1(input);
  return deepFreeze({
    schemaVersion: 1,
    policy,
    policyDigest: digestRoleRefinementJsonV1(
      "policy",
      policy as unknown as JsonValue,
    ),
  });
}

export function validateRoleRefinementPolicyV1(
  input: RoleRefinementPolicyV1,
): RoleRefinementPolicyV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "policyId",
      "policyVersion",
      "minimumIndependentEvaluations",
      "minimumCertificationWitnesses",
      "minimumMonitoringObservations",
      "maximumConsecutiveDegradedObservations",
      "thresholds",
      "scoringWeights",
      "limits",
    ],
    "role refinement policy",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_refinement_policy_invalid");
  assertIdentifier(input.policyId, "policyId");
  for (const [label, value] of [
    ["policyVersion", input.policyVersion],
    ["minimumIndependentEvaluations", input.minimumIndependentEvaluations],
    ["minimumCertificationWitnesses", input.minimumCertificationWitnesses],
    ["minimumMonitoringObservations", input.minimumMonitoringObservations],
    [
      "maximumConsecutiveDegradedObservations",
      input.maximumConsecutiveDegradedObservations,
    ],
  ] as const)
    assertSafeInteger(value, label, 1);
  validateThresholds(input.thresholds);
  validateWeights(input.scoringWeights);
  validateLimits(input.limits);
  if (
    input.minimumIndependentEvaluations > input.limits.maximumEvaluators ||
    input.minimumMonitoringObservations > input.limits.maximumObservations ||
    input.maximumConsecutiveDegradedObservations >
      input.limits.maximumObservations
  )
    throw new TypeError("role_refinement_policy_invalid");
  return freezeClone(input);
}

export function createRoleRefinementEvidenceSummaryV1(
  input: Omit<
    RoleRefinementEvidenceSummaryV1,
    "schemaVersion" | "evidenceDigest"
  >,
  policy: RoleRefinementPolicyV1,
): RoleRefinementEvidenceSummaryV1 {
  validateRoleRefinementPolicyV1(policy);
  const body = normalizeEvidence({ schemaVersion: 1, ...input }, policy);
  return deepFreeze({
    ...body,
    evidenceDigest: digestRoleRefinementJsonV1(
      "evidence",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRefinementEvidenceSummaryV1(
  input: RoleRefinementEvidenceSummaryV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementEvidenceSummaryV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "alignmentStateRevision",
      "alignmentStateDigest",
      "rollingCoherenceBps",
      "degraded",
      "observedSignalCount",
      "reasonCodes",
      "evidenceReferenceIds",
      "summarizedAtLogicalMs",
      "evidenceDigest",
    ],
    "role refinement evidence",
  );
  const { evidenceDigest, ...body } = input;
  assertDigest(evidenceDigest, "evidenceDigest");
  const normalized = normalizeEvidence(body, policy);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRefinementJsonV1("evidence", body as unknown as JsonValue) !==
      evidenceDigest
  )
    throw new TypeError("role_refinement_evidence_invalid");
  return freezeClone(input);
}

export function createRoleRefinementRequestV1(
  input: Omit<RoleRefinementRequestV1, "schemaVersion" | "requestDigest">,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
): RoleRefinementRequestV1 {
  const policyRecord = createRoleRefinementPolicyRecordV1(policy);
  if (
    input.policyId !== policy.policyId ||
    input.policyVersion !== policy.policyVersion ||
    input.policyDigest !== policyRecord.policyDigest
  )
    throw new TypeError("role_refinement_policy_binding_invalid");
  const body = normalizeRequest(
    { schemaVersion: 1, ...input },
    policy,
    realignmentPolicy,
  );
  return deepFreeze({
    ...body,
    requestDigest: digestRoleRefinementJsonV1(
      "request",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRefinementRequestV1(
  input: RoleRefinementRequestV1,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
): RoleRefinementRequestV1 {
  const { requestDigest, ...body } = input;
  assertDigest(requestDigest, "requestDigest");
  const normalized = normalizeRequest(body, policy, realignmentPolicy);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRefinementJsonV1("request", body as unknown as JsonValue) !==
      requestDigest
  )
    throw new TypeError("role_refinement_request_invalid");
  return freezeClone(input);
}

export function createRoleRefinementPatchV1(
  input: Omit<RoleRefinementPatchV1, "schemaVersion" | "patchDigest">,
  predecessor: TrustedRoleDefinitionV1,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
): RoleRefinementPatchV1 {
  const body = normalizePatch(
    { schemaVersion: 1, ...input },
    predecessor,
    policy,
    realignmentPolicy,
  );
  return deepFreeze({
    ...body,
    patchDigest: digestRoleRefinementJsonV1(
      "patch",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRefinementPatchV1(
  input: RoleRefinementPatchV1,
  predecessor: TrustedRoleDefinitionV1,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
): RoleRefinementPatchV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "predecessorDefinitionDigest",
      "operations",
      "authority",
      "patchDigest",
    ],
    "role refinement patch",
  );
  const { patchDigest, ...body } = input;
  assertDigest(patchDigest, "patchDigest");
  const normalized = normalizePatch(
    body,
    predecessor,
    policy,
    realignmentPolicy,
  );
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRefinementJsonV1("patch", body as unknown as JsonValue) !==
      patchDigest
  )
    throw new TypeError("role_refinement_patch_invalid");
  return freezeClone(input);
}

export function materializeRefinedRoleDefinitionV1(input: {
  readonly predecessor: TrustedRoleDefinitionV1;
  readonly patch: RoleRefinementPatchV1;
  readonly authorityCeiling: RoleAuthorityCeilingV1;
  readonly policy: RoleRefinementPolicyV1;
  readonly realignmentPolicy: RoleRealignmentPolicyV1;
}): TrustedRoleDefinitionV1 {
  const predecessor = validateTrustedRoleDefinitionV1(
    input.predecessor,
    input.realignmentPolicy,
  );
  const patch = validateRoleRefinementPatchV1(
    input.patch,
    predecessor,
    input.policy,
    input.realignmentPolicy,
  );
  const ceiling = validateRoleAuthorityCeilingV1(
    input.authorityCeiling,
    input.realignmentPolicy,
  );
  assertTrustedRoleDefinitionWithinAuthorityCeilingV1(predecessor, ceiling);
  const instructions = applyInstructionOperations(
    predecessor.instructions,
    patch.operations,
  );
  const constraints = applyConstraintOperations(
    predecessor.constraints,
    patch.operations,
  );
  const definition = createTrustedRoleDefinitionV1({
    catalogId: predecessor.catalogId,
    definitionId: predecessor.definitionId,
    definitionRevision: predecessor.definitionRevision + 1,
    predecessorDefinitionDigest: predecessor.definitionDigest,
    roleKey: predecessor.roleKey,
    instructions,
    constraints,
    requiredCapabilityKeys: patch.authority.requiredCapabilityKeys,
    requiredResourceClasses: patch.authority.requiredResourceClasses,
    maximumActionBudgetUnits: patch.authority.maximumActionBudgetUnits,
    validFromLogicalMs: predecessor.validFromLogicalMs,
    validUntilLogicalMs: patch.authority.validUntilLogicalMs,
  });
  validateTrustedRoleDefinitionV1(definition, input.realignmentPolicy);
  assertDefinitionNarrowsPredecessor(definition, predecessor);
  assertTrustedRoleDefinitionWithinAuthorityCeilingV1(definition, ceiling);
  return definition;
}

export function createRoleRefinementProposalV1(
  input: Omit<RoleRefinementProposalV1, "schemaVersion" | "proposalDigest">,
  request: RoleRefinementRequestV1,
  predecessor: TrustedRoleDefinitionV1,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
): RoleRefinementProposalV1 {
  const body = normalizeProposal(
    { schemaVersion: 1, ...input },
    request,
    predecessor,
    policy,
    realignmentPolicy,
  );
  return deepFreeze({
    ...body,
    proposalDigest: digestRoleRefinementJsonV1(
      "proposal",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRefinementProposalV1(
  input: RoleRefinementProposalV1,
  request: RoleRefinementRequestV1,
  predecessor: TrustedRoleDefinitionV1,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
): RoleRefinementProposalV1 {
  const { proposalDigest, ...body } = input;
  assertDigest(proposalDigest, "proposalDigest");
  const normalized = normalizeProposal(
    body,
    request,
    predecessor,
    policy,
    realignmentPolicy,
  );
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRefinementJsonV1("proposal", body as unknown as JsonValue) !==
      proposalDigest
  )
    throw new TypeError("role_refinement_proposal_invalid");
  return freezeClone(input);
}

export function createRoleRefinementSemanticDecisionV1(
  input: Omit<
    RoleRefinementSemanticDecisionV1,
    "schemaVersion" | "decisionDigest"
  >,
  policy: RoleRefinementPolicyV1,
): RoleRefinementSemanticDecisionV1 {
  const body = normalizeSemanticDecision(
    { schemaVersion: 1, ...input },
    policy,
  );
  return deepFreeze({
    ...body,
    decisionDigest: digestRoleRefinementJsonV1(
      "semantic-decision",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRefinementSemanticDecisionV1(
  input: RoleRefinementSemanticDecisionV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementSemanticDecisionV1 {
  const { decisionDigest, ...body } = input;
  assertDigest(decisionDigest, "decisionDigest");
  const normalized = normalizeSemanticDecision(body, policy);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRefinementJsonV1(
      "semantic-decision",
      body as unknown as JsonValue,
    ) !== decisionDigest
  )
    throw new TypeError("role_refinement_semantic_decision_invalid");
  return freezeClone(input);
}

function validateThresholds(input: RoleRefinementThresholdsV1): void {
  assertExactKeys(
    input,
    [
      "minimumPredictedCoherenceBps",
      "minimumPredictedContributionBps",
      "maximumPredictedUncertaintyBps",
      "maximumTransitionRiskBps",
      "confirmationCoherenceBps",
      "confirmationContributionBps",
      "confirmationMaximumUncertaintyBps",
      "rollbackCoherenceBps",
      "rollbackContributionBps",
      "rollbackUncertaintyBps",
    ],
    "role refinement thresholds",
  );
  for (const [key, value] of Object.entries(input))
    assertBasisPoints(value, key);
  if (
    input.rollbackCoherenceBps > input.confirmationCoherenceBps ||
    input.rollbackContributionBps > input.confirmationContributionBps ||
    input.rollbackUncertaintyBps < input.confirmationMaximumUncertaintyBps
  )
    throw new TypeError("role_refinement_thresholds_invalid");
}

function validateWeights(input: RoleRefinementScoringWeightsV1): void {
  assertExactKeys(
    input,
    [
      "coherenceBps",
      "contributionBps",
      "uncertaintyPenaltyBps",
      "transitionRiskPenaltyBps",
    ],
    "role refinement scoring weights",
  );
  for (const [key, value] of Object.entries(input))
    assertBasisPoints(value, key);
  if (
    input.coherenceBps +
      input.contributionBps +
      input.uncertaintyPenaltyBps +
      input.transitionRiskPenaltyBps !==
    ROLE_REFINEMENT_BASIS_POINTS_V1
  )
    throw new TypeError("role_refinement_weights_invalid");
}

function validateLimits(input: RoleRefinementLimitsV1): void {
  assertExactKeys(
    input,
    [
      "maximumCandidates",
      "maximumStrategies",
      "maximumEvaluators",
      "maximumPatchOperations",
      "maximumInstructions",
      "maximumInstructionBytes",
      "maximumConstraintsBytes",
      "maximumReasonCodes",
      "maximumEvidenceReferences",
      "maximumObservations",
      "maximumEvents",
      "maximumRequestLifetimeMs",
      "maximumEvaluationLifetimeMs",
      "maximumCertificateLifetimeMs",
      "maximumMonitoringLifetimeMs",
    ],
    "role refinement limits",
  );
  for (const [key, value] of Object.entries(input))
    assertSafeInteger(value, key, 1);
}

function normalizeEvidence(
  input: Omit<RoleRefinementEvidenceSummaryV1, "evidenceDigest">,
  policy: RoleRefinementPolicyV1,
) {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "alignmentStateRevision",
      "alignmentStateDigest",
      "rollingCoherenceBps",
      "degraded",
      "observedSignalCount",
      "reasonCodes",
      "evidenceReferenceIds",
      "summarizedAtLogicalMs",
    ],
    "role refinement evidence",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_refinement_evidence_invalid");
  assertSafeInteger(input.alignmentStateRevision, "alignmentStateRevision", 1);
  assertDigest(input.alignmentStateDigest, "alignmentStateDigest");
  assertBasisPoints(input.rollingCoherenceBps, "rollingCoherenceBps");
  if (typeof input.degraded !== "boolean")
    throw new TypeError("role_refinement_evidence_invalid");
  assertSafeInteger(input.observedSignalCount, "observedSignalCount");
  assertSafeInteger(input.summarizedAtLogicalMs, "summarizedAtLogicalMs");
  const reasonCodes = normalizeReferences(
    input.reasonCodes,
    policy.limits.maximumReasonCodes,
    "reasonCodes",
  );
  const evidenceReferenceIds = normalizeReferences(
    input.evidenceReferenceIds,
    policy.limits.maximumEvidenceReferences,
    "evidenceReferenceIds",
  );
  return deepFreeze({ ...input, reasonCodes, evidenceReferenceIds });
}

function normalizeRequest(
  input: Omit<RoleRefinementRequestV1, "requestDigest">,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
) {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "requestId",
      "selectionId",
      "publicationId",
      "activationId",
      "rollbackId",
      "policyId",
      "policyVersion",
      "policyDigest",
      "tenantId",
      "sessionId",
      "agentId",
      "objectiveId",
      "predecessorCatalogId",
      "predecessorDefinitionId",
      "predecessorDefinitionRevision",
      "predecessorDefinitionDigest",
      "predecessorRoleAnchorDigest",
      "authorityCeiling",
      "evidence",
      "createdAtLogicalMs",
      "expiresAtLogicalMs",
    ],
    "role refinement request",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_refinement_request_invalid");
  for (const [label, value] of [
    ["requestId", input.requestId],
    ["selectionId", input.selectionId],
    ["publicationId", input.publicationId],
    ["activationId", input.activationId],
    ["rollbackId", input.rollbackId],
    ["policyId", input.policyId],
    ["tenantId", input.tenantId],
    ["sessionId", input.sessionId],
    ["agentId", input.agentId],
    ["objectiveId", input.objectiveId],
    ["predecessorCatalogId", input.predecessorCatalogId],
    ["predecessorDefinitionId", input.predecessorDefinitionId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.policyVersion, "policyVersion", 1);
  assertDigest(input.policyDigest, "policyDigest");
  assertSafeInteger(
    input.predecessorDefinitionRevision,
    "predecessorDefinitionRevision",
    1,
  );
  assertDigest(
    input.predecessorDefinitionDigest,
    "predecessorDefinitionDigest",
  );
  assertDigest(
    input.predecessorRoleAnchorDigest,
    "predecessorRoleAnchorDigest",
  );
  assertSafeInteger(input.createdAtLogicalMs, "createdAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs");
  const policyRecord = createRoleRefinementPolicyRecordV1(policy);
  if (
    input.policyId !== policy.policyId ||
    input.policyVersion !== policy.policyVersion ||
    input.policyDigest !== policyRecord.policyDigest ||
    input.expiresAtLogicalMs <= input.createdAtLogicalMs ||
    input.expiresAtLogicalMs - input.createdAtLogicalMs >
      policy.limits.maximumRequestLifetimeMs
  )
    throw new TypeError("role_refinement_request_invalid");
  const authorityCeiling = validateRoleAuthorityCeilingV1(
    input.authorityCeiling,
    realignmentPolicy,
  );
  const evidence = validateRoleRefinementEvidenceSummaryV1(
    input.evidence,
    policy,
  );
  if (
    authorityCeiling.validUntilLogicalMs < input.expiresAtLogicalMs ||
    evidence.summarizedAtLogicalMs > input.createdAtLogicalMs
  )
    throw new TypeError("role_refinement_request_invalid");
  return deepFreeze({ ...input, authorityCeiling, evidence });
}

function normalizePatch(
  input: Omit<RoleRefinementPatchV1, "patchDigest">,
  predecessor: TrustedRoleDefinitionV1,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
) {
  assertExactKeys(
    input,
    ["schemaVersion", "predecessorDefinitionDigest", "operations", "authority"],
    "role refinement patch",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_refinement_patch_invalid");
  validateTrustedRoleDefinitionV1(predecessor, realignmentPolicy);
  assertDigest(
    input.predecessorDefinitionDigest,
    "predecessorDefinitionDigest",
  );
  if (input.predecessorDefinitionDigest !== predecessor.definitionDigest)
    throw new TypeError("role_refinement_predecessor_mismatch");
  if (
    !Array.isArray(input.operations) ||
    input.operations.length === 0 ||
    input.operations.length > policy.limits.maximumPatchOperations
  )
    throw new TypeError("role_refinement_patch_capacity_invalid");
  const operations = input.operations.map((operation) =>
    normalizePatchOperation(operation, predecessor, policy),
  );
  sortedUnique(
    operations.map(({ operationId }) => operationId),
    "role refinement operation ids",
  );
  assertUniqueOperationTargets(operations);
  const authority = normalizeAuthorityNarrowing(input.authority, predecessor);
  const projectedInstructions = applyInstructionOperations(
    predecessor.instructions,
    operations,
  );
  const projectedConstraints = applyConstraintOperations(
    predecessor.constraints,
    operations,
  );
  if (
    projectedInstructions.length > policy.limits.maximumInstructions ||
    projectedInstructions.some(
      (value) => utf8ByteLength(value) > policy.limits.maximumInstructionBytes,
    ) ||
    utf8ByteLength(canonicalizeControlJsonV1(projectedConstraints)) >
      policy.limits.maximumConstraintsBytes
  )
    throw new TypeError("role_refinement_patch_capacity_invalid");
  return deepFreeze({ ...input, operations, authority });
}

function normalizePatchOperation(
  input: RoleRefinementPatchOperationV1,
  predecessor: TrustedRoleDefinitionV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementPatchOperationV1 {
  assertPlainRecord(input, "role refinement patch operation");
  assertIdentifier(input.operationId, "operationId");
  assertOneOf(
    input.kind,
    [
      "instruction_insert",
      "instruction_replace",
      "instruction_remove",
      "constraint_add",
      "constraint_replace",
    ] as const,
    "patch operation kind",
  );
  if (input.kind === "instruction_insert") {
    assertExactKeys(
      input,
      ["operationId", "kind", "index", "instruction"],
      "instruction insert operation",
    );
    assertSafeInteger(input.index, "instruction index");
    validateInstruction(input.instruction, policy);
    if (input.index > predecessor.instructions.length)
      throw new TypeError("role_refinement_instruction_index_invalid");
  } else if (input.kind === "instruction_replace") {
    assertExactKeys(
      input,
      [
        "operationId",
        "kind",
        "index",
        "expectedInstructionDigest",
        "instruction",
      ],
      "instruction replace operation",
    );
    validateInstructionEdit(input, predecessor, policy);
  } else if (input.kind === "instruction_remove") {
    assertExactKeys(
      input,
      ["operationId", "kind", "index", "expectedInstructionDigest"],
      "instruction remove operation",
    );
    validateInstructionEdit(input, predecessor, policy);
  } else if (input.kind === "constraint_add") {
    assertExactKeys(
      input,
      ["operationId", "kind", "path", "value"],
      "constraint add operation",
    );
    validateConstraintPath(input.path);
    assertStrictJsonValue(input.value);
    if (readConstraintPath(predecessor.constraints, input.path).found)
      throw new TypeError("role_refinement_constraint_already_exists");
    requireConstraintParent(predecessor.constraints, input.path);
  } else {
    assertExactKeys(
      input,
      ["operationId", "kind", "path", "expectedValueDigest", "value"],
      "constraint replace operation",
    );
    validateConstraintPath(input.path);
    assertDigest(input.expectedValueDigest, "expectedValueDigest");
    assertStrictJsonValue(input.value);
    const current = readConstraintPath(predecessor.constraints, input.path);
    if (
      !current.found ||
      digestRoleRefinementJsonV1("constraint-value", current.value) !==
        input.expectedValueDigest
    )
      throw new TypeError("role_refinement_constraint_precondition_failed");
  }
  return freezeClone(input);
}

function normalizeAuthorityNarrowing(
  input: RoleRefinementAuthorityNarrowingV1,
  predecessor: TrustedRoleDefinitionV1,
): RoleRefinementAuthorityNarrowingV1 {
  assertExactKeys(
    input,
    [
      "requiredCapabilityKeys",
      "requiredResourceClasses",
      "maximumActionBudgetUnits",
      "validUntilLogicalMs",
    ],
    "role refinement authority narrowing",
  );
  const requiredCapabilityKeys = normalizeIdentifiers(
    input.requiredCapabilityKeys,
    "requiredCapabilityKeys",
  );
  const requiredResourceClasses = normalizeIdentifiers(
    input.requiredResourceClasses,
    "requiredResourceClasses",
  );
  assertSafeInteger(input.maximumActionBudgetUnits, "maximumActionBudgetUnits");
  assertSafeInteger(input.validUntilLogicalMs, "validUntilLogicalMs");
  const predecessorCapabilities = new Set(predecessor.requiredCapabilityKeys);
  const predecessorResources = new Set(predecessor.requiredResourceClasses);
  if (
    requiredCapabilityKeys.some((key) => !predecessorCapabilities.has(key)) ||
    requiredResourceClasses.some((key) => !predecessorResources.has(key)) ||
    input.maximumActionBudgetUnits > predecessor.maximumActionBudgetUnits ||
    input.validUntilLogicalMs > predecessor.validUntilLogicalMs ||
    input.validUntilLogicalMs <= predecessor.validFromLogicalMs
  )
    throw new TypeError("role_refinement_authority_widening_denied");
  return deepFreeze({
    requiredCapabilityKeys,
    requiredResourceClasses,
    maximumActionBudgetUnits: input.maximumActionBudgetUnits,
    validUntilLogicalMs: input.validUntilLogicalMs,
  });
}

function normalizeProposal(
  input: Omit<RoleRefinementProposalV1, "proposalDigest">,
  request: RoleRefinementRequestV1,
  predecessor: TrustedRoleDefinitionV1,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
) {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "proposalId",
      "requestDigest",
      "proposerId",
      "proposerVersion",
      "proposerBindingDigest",
      "patch",
      "refinedDefinitionDigest",
      "reasonCodes",
      "evidenceReferenceIds",
      "proposedAtLogicalMs",
      "expiresAtLogicalMs",
    ],
    "role refinement proposal",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_refinement_proposal_invalid");
  for (const [label, value] of [
    ["proposalId", input.proposalId],
    ["proposerId", input.proposerId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.proposerVersion, "proposerVersion", 1);
  for (const [label, value] of [
    ["requestDigest", input.requestDigest],
    ["proposerBindingDigest", input.proposerBindingDigest],
    ["refinedDefinitionDigest", input.refinedDefinitionDigest],
  ] as const)
    assertDigest(value, label);
  assertSafeInteger(input.proposedAtLogicalMs, "proposedAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs");
  const patch = validateRoleRefinementPatchV1(
    input.patch,
    predecessor,
    policy,
    realignmentPolicy,
  );
  const reasonCodes = normalizeReferences(
    input.reasonCodes,
    policy.limits.maximumReasonCodes,
    "reasonCodes",
  );
  const evidenceReferenceIds = normalizeReferences(
    input.evidenceReferenceIds,
    policy.limits.maximumEvidenceReferences,
    "evidenceReferenceIds",
  );
  if (
    input.requestDigest !== request.requestDigest ||
    input.proposedAtLogicalMs < request.createdAtLogicalMs ||
    input.expiresAtLogicalMs <= input.proposedAtLogicalMs ||
    input.expiresAtLogicalMs > request.expiresAtLogicalMs
  )
    throw new TypeError("role_refinement_proposal_lifetime_invalid");
  return deepFreeze({ ...input, patch, reasonCodes, evidenceReferenceIds });
}

function normalizeSemanticDecision(
  input: Omit<RoleRefinementSemanticDecisionV1, "decisionDigest">,
  policy: RoleRefinementPolicyV1,
) {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "requestDigest",
      "patchDigest",
      "refinedDefinitionDigest",
      "validatorId",
      "validatorVersion",
      "validatorBindingDigest",
      "accepted",
      "objectiveAligned",
      "constraintsNotWeaker",
      "reasonCodes",
      "evidenceReferenceIds",
      "decidedAtLogicalMs",
      "expiresAtLogicalMs",
    ],
    "role refinement semantic decision",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_refinement_semantic_decision_invalid");
  for (const [label, value] of [
    ["requestDigest", input.requestDigest],
    ["patchDigest", input.patchDigest],
    ["refinedDefinitionDigest", input.refinedDefinitionDigest],
    ["validatorBindingDigest", input.validatorBindingDigest],
  ] as const)
    assertDigest(value, label);
  assertIdentifier(input.validatorId, "validatorId");
  assertSafeInteger(input.validatorVersion, "validatorVersion", 1);
  if (
    typeof input.accepted !== "boolean" ||
    typeof input.objectiveAligned !== "boolean" ||
    typeof input.constraintsNotWeaker !== "boolean" ||
    input.accepted !== (input.objectiveAligned && input.constraintsNotWeaker)
  )
    throw new TypeError("role_refinement_semantic_decision_invalid");
  assertSafeInteger(input.decidedAtLogicalMs, "decidedAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs");
  if (input.expiresAtLogicalMs <= input.decidedAtLogicalMs)
    throw new TypeError("role_refinement_semantic_decision_invalid");
  const reasonCodes = normalizeReferences(
    input.reasonCodes,
    policy.limits.maximumReasonCodes,
    "reasonCodes",
  );
  const evidenceReferenceIds = normalizeReferences(
    input.evidenceReferenceIds,
    policy.limits.maximumEvidenceReferences,
    "evidenceReferenceIds",
  );
  return deepFreeze({ ...input, reasonCodes, evidenceReferenceIds });
}

function validateInstruction(
  value: string,
  policy: RoleRefinementPolicyV1,
): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8ByteLength(value) > policy.limits.maximumInstructionBytes
  )
    throw new TypeError("role_refinement_instruction_invalid");
}

function validateInstructionEdit(
  input: InstructionReplaceOperationV1 | InstructionRemoveOperationV1,
  predecessor: TrustedRoleDefinitionV1,
  policy: RoleRefinementPolicyV1,
): void {
  assertSafeInteger(input.index, "instruction index");
  assertDigest(input.expectedInstructionDigest, "expectedInstructionDigest");
  if (
    input.index >= predecessor.instructions.length ||
    digestInstruction(predecessor.instructions[input.index]) !==
      input.expectedInstructionDigest
  )
    throw new TypeError("role_refinement_instruction_precondition_failed");
  if (input.kind === "instruction_replace")
    validateInstruction(input.instruction, policy);
}

function assertUniqueOperationTargets(
  operations: readonly RoleRefinementPatchOperationV1[],
): void {
  const targets = new Set<string>();
  for (const operation of operations) {
    const target =
      operation.kind === "instruction_insert" ||
      operation.kind === "instruction_replace" ||
      operation.kind === "instruction_remove"
        ? `instruction:${operation.index}`
        : `constraint:${operation.path}`;
    if (targets.has(target))
      throw new TypeError("role_refinement_duplicate_patch_target");
    targets.add(target);
  }
}

function applyInstructionOperations(
  predecessor: readonly string[],
  operations: readonly RoleRefinementPatchOperationV1[],
): readonly string[] {
  const result = [...predecessor];
  const edits = operations
    .filter(
      (
        operation,
      ): operation is
        | InstructionInsertOperationV1
        | InstructionReplaceOperationV1
        | InstructionRemoveOperationV1 =>
        operation.kind.startsWith("instruction_"),
    )
    .sort((left, right) =>
      right.index !== left.index
        ? right.index - left.index
        : compareCodeUnits(left.kind, right.kind),
    );
  for (const operation of edits) {
    if (operation.kind === "instruction_insert")
      result.splice(operation.index, 0, operation.instruction);
    else if (operation.kind === "instruction_replace")
      result.splice(operation.index, 1, operation.instruction);
    else result.splice(operation.index, 1);
  }
  if (result.length === 0)
    throw new TypeError("role_refinement_instructions_empty");
  return Object.freeze(result);
}

function applyConstraintOperations(
  predecessor: JsonObject,
  operations: readonly RoleRefinementPatchOperationV1[],
): JsonObject {
  const result = cloneJson(predecessor) as JsonObject;
  const edits = operations
    .filter(
      (
        operation,
      ): operation is ConstraintAddOperationV1 | ConstraintReplaceOperationV1 =>
        operation.kind === "constraint_add" ||
        operation.kind === "constraint_replace",
    )
    .sort((left, right) => compareCodeUnits(left.path, right.path));
  for (const operation of edits)
    setConstraintPath(result, operation.path, operation.value);
  return deepFreeze(result);
}

function validateConstraintPath(path: string): void {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.length > 512 ||
    path === "/" ||
    /~(?![01])/u.test(path)
  )
    throw new TypeError("role_refinement_constraint_path_invalid");
  const tokens = parsePointer(path);
  if (
    tokens.length === 0 ||
    tokens.some(
      (token) =>
        token.length === 0 ||
        utf8ByteLength(token) > 128 ||
        /[\u0000-\u001f\u007f]/u.test(token),
    )
  )
    throw new TypeError("role_refinement_constraint_path_invalid");
}

function parsePointer(path: string): readonly string[] {
  return path
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/gu, "/").replace(/~0/gu, "~"));
}

function readConstraintPath(
  root: JsonObject,
  path: string,
): { readonly found: boolean; readonly value: JsonValue } {
  let cursor: JsonValue = root;
  for (const token of parsePointer(path)) {
    if (
      cursor === null ||
      typeof cursor !== "object" ||
      Array.isArray(cursor) ||
      !Object.hasOwn(cursor, token)
    )
      return { found: false, value: null };
    cursor = (cursor as JsonObject)[token];
  }
  return { found: true, value: cursor };
}

function requireConstraintParent(root: JsonObject, path: string): void {
  const tokens = parsePointer(path);
  let cursor: JsonValue = root;
  for (const token of tokens.slice(0, -1)) {
    if (
      cursor === null ||
      typeof cursor !== "object" ||
      Array.isArray(cursor) ||
      !Object.hasOwn(cursor, token)
    )
      throw new TypeError("role_refinement_constraint_parent_missing");
    cursor = (cursor as JsonObject)[token];
  }
  if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor))
    throw new TypeError("role_refinement_constraint_parent_invalid");
}

function setConstraintPath(
  root: JsonObject,
  path: string,
  value: JsonValue,
): void {
  const tokens = parsePointer(path);
  let cursor = root as Record<string, JsonValue>;
  for (const token of tokens.slice(0, -1))
    cursor = cursor[token] as Record<string, JsonValue>;
  cursor[tokens[tokens.length - 1]] = cloneJson(value);
}

function assertDefinitionNarrowsPredecessor(
  definition: TrustedRoleDefinitionV1,
  predecessor: TrustedRoleDefinitionV1,
): void {
  const capabilities = new Set(predecessor.requiredCapabilityKeys);
  const resources = new Set(predecessor.requiredResourceClasses);
  if (
    definition.catalogId !== predecessor.catalogId ||
    definition.definitionId !== predecessor.definitionId ||
    definition.definitionRevision !== predecessor.definitionRevision + 1 ||
    definition.predecessorDefinitionDigest !== predecessor.definitionDigest ||
    definition.roleKey !== predecessor.roleKey ||
    definition.validFromLogicalMs !== predecessor.validFromLogicalMs ||
    definition.requiredCapabilityKeys.some((key) => !capabilities.has(key)) ||
    definition.requiredResourceClasses.some((key) => !resources.has(key)) ||
    definition.maximumActionBudgetUnits >
      predecessor.maximumActionBudgetUnits ||
    definition.validUntilLogicalMs > predecessor.validUntilLogicalMs
  )
    throw new TypeError("role_refinement_authority_widening_denied");
}

function digestInstruction(value: string): string {
  return digestRoleRefinementJsonV1("instruction", value);
}

function normalizeIdentifiers(
  input: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(input)) throw new TypeError(`${label}_invalid`);
  const values = [...input];
  for (const value of values) assertIdentifier(value, label);
  sortedUnique(values, label);
  return Object.freeze(values);
}

function normalizeReferences(
  input: readonly string[],
  maximum: number,
  label: string,
): readonly string[] {
  const values = normalizeIdentifiers(input, label);
  if (values.length > maximum)
    throw new TypeError("role_refinement_capacity_exhausted");
  return values;
}

function assertBasisPoints(
  value: unknown,
  label: string,
): asserts value is number {
  assertSafeInteger(value, label);
  if ((value as number) > ROLE_REFINEMENT_BASIS_POINTS_V1)
    throw new TypeError(`${label}_invalid`);
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freezeClone<T>(value: T): T {
  return deepFreeze(cloneJson(value as unknown as JsonValue) as unknown as T);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function createRoleRefinementStateV1(input: {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly request: RoleRefinementRequestV1;
  readonly policy: RoleRefinementPolicyV1;
  readonly realignmentPolicy: RoleRealignmentPolicyV1;
}): RoleRefinementStateV1 {
  for (const [label, value] of [
    ["controllerId", input.controllerId],
    ["implementationId", input.implementationId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.controllerVersion, "controllerVersion", 1);
  const policyRecord = createRoleRefinementPolicyRecordV1(input.policy);
  const request = validateRoleRefinementRequestV1(
    input.request,
    input.policy,
    input.realignmentPolicy,
  );
  const event = createEvent(
    1,
    "requested",
    request.requestDigest,
    "role_refinement_requested",
    request.createdAtLogicalMs,
    null,
  );
  return finalizeState({
    schemaVersion: 1,
    controllerId: input.controllerId,
    controllerVersion: input.controllerVersion,
    implementationId: input.implementationId,
    tenantId: request.tenantId,
    activeSessionId: request.sessionId,
    agentId: request.agentId,
    objectiveId: request.objectiveId,
    policyId: input.policy.policyId,
    policyVersion: input.policy.policyVersion,
    policyDigest: policyRecord.policyDigest,
    revision: 1,
    status: "requested",
    request,
    candidates: [],
    evaluations: [],
    selection: null,
    publicationCertificate: null,
    publication: null,
    activation: null,
    observations: [],
    monitoring: null,
    rollbackCertificate: null,
    rollback: null,
    events: [event],
    lastLogicalTimeMs: request.createdAtLogicalMs,
  });
}

export function admitRoleRefinementCandidateV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly proposal: RoleRefinementProposalV1;
    readonly refinedDefinition: TrustedRoleDefinitionV1;
    readonly draftId: string;
    readonly semanticDecision: RoleRefinementSemanticDecisionV1;
    readonly proposerTrustDecisionDigest: string;
    readonly logicalTimeMs: number;
  },
  predecessor: TrustedRoleDefinitionV1,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  if (state.status !== "requested" && state.status !== "collecting")
    throw new TypeError("role_refinement_candidate_admission_invalid");
  if (input.logicalTimeMs >= state.request.expiresAtLogicalMs)
    throw new TypeError("role_refinement_request_expired");
  const proposal = validateRoleRefinementProposalV1(
    input.proposal,
    state.request,
    predecessor,
    policy,
    realignmentPolicy,
  );
  const definition = validateTrustedRoleDefinitionV1(
    input.refinedDefinition,
    realignmentPolicy,
  );
  const expectedDefinition = materializeRefinedRoleDefinitionV1({
    predecessor,
    patch: proposal.patch,
    authorityCeiling: state.request.authorityCeiling,
    policy,
    realignmentPolicy,
  });
  if (
    definition.definitionDigest !== expectedDefinition.definitionDigest ||
    proposal.refinedDefinitionDigest !== definition.definitionDigest
  )
    throw new TypeError("role_refinement_definition_substitution_denied");
  const semanticDecision = validateRoleRefinementSemanticDecisionV1(
    input.semanticDecision,
    policy,
  );
  assertIdentifier(input.draftId, "draftId");
  assertDigest(
    input.proposerTrustDecisionDigest,
    "proposerTrustDecisionDigest",
  );
  if (
    !semanticDecision.accepted ||
    semanticDecision.requestDigest !== state.request.requestDigest ||
    semanticDecision.patchDigest !== proposal.patch.patchDigest ||
    semanticDecision.refinedDefinitionDigest !== definition.definitionDigest ||
    semanticDecision.decidedAtLogicalMs > input.logicalTimeMs ||
    semanticDecision.expiresAtLogicalMs <= input.logicalTimeMs
  )
    throw new TypeError("role_refinement_semantic_admission_denied");
  if (
    state.candidates.length >= policy.limits.maximumCandidates ||
    state.candidates.some(
      (candidate) =>
        candidate.proposalId === proposal.proposalId ||
        candidate.patchDigest === proposal.patch.patchDigest ||
        candidate.refinedDefinitionDigest === definition.definitionDigest ||
        candidate.draftId === input.draftId,
    )
  )
    throw new TypeError("role_refinement_candidate_duplicate_or_exhausted");
  const body = {
    schemaVersion: 1 as const,
    candidateId: `refinement-${proposal.proposalDigest.slice(7, 39)}`,
    requestDigest: state.request.requestDigest,
    proposalId: proposal.proposalId,
    proposerId: proposal.proposerId,
    proposerVersion: proposal.proposerVersion,
    proposerBindingDigest: proposal.proposerBindingDigest,
    proposerTrustDecisionDigest: input.proposerTrustDecisionDigest,
    draftId: input.draftId,
    patchDigest: proposal.patch.patchDigest,
    refinedDefinitionDigest: definition.definitionDigest,
    semanticDecisionDigest: semanticDecision.decisionDigest,
    proposedAtLogicalMs: proposal.proposedAtLogicalMs,
    expiresAtLogicalMs: proposal.expiresAtLogicalMs,
  };
  const candidate = deepFreeze({
    ...body,
    candidateDigest: digestRoleRefinementJsonV1(
      "candidate",
      body as unknown as JsonValue,
    ),
  });
  const candidates = [...state.candidates, candidate].sort((left, right) =>
    compareCodeUnits(left.candidateDigest, right.candidateDigest),
  );
  return transitionState(
    state,
    "candidate_admitted",
    candidate.candidateDigest,
    "role_refinement_candidate_admitted",
    input.logicalTimeMs,
    { status: "collecting", candidates },
    policy,
  );
}

export function createRoleRefinementEvaluationV1(
  input: Omit<RoleRefinementEvaluationV1, "schemaVersion" | "evaluationDigest">,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementEvaluationV1 {
  const body = normalizeEvaluation(
    { schemaVersion: 1, ...input },
    state,
    policy,
  );
  return deepFreeze({
    ...body,
    evaluationDigest: digestRoleRefinementJsonV1(
      "evaluation",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRefinementEvaluationV1(
  input: RoleRefinementEvaluationV1,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementEvaluationV1 {
  const { evaluationDigest, ...body } = input;
  assertDigest(evaluationDigest, "evaluationDigest");
  const normalized = normalizeEvaluation(body, state, policy);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRefinementJsonV1("evaluation", body as unknown as JsonValue) !==
      evaluationDigest
  )
    throw new TypeError("role_refinement_evaluation_invalid");
  return freezeClone(input);
}

export function recordRoleRefinementEvaluationV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly evaluation: RoleRefinementEvaluationV1;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  if (state.status !== "collecting")
    throw new TypeError("role_refinement_evaluation_transition_invalid");
  const evaluation = validateRoleRefinementEvaluationV1(
    input.evaluation,
    state,
    policy,
  );
  if (
    evaluation.evaluatedAtLogicalMs > input.logicalTimeMs ||
    evaluation.expiresAtLogicalMs <= input.logicalTimeMs ||
    state.evaluations.some(
      (item) =>
        item.evaluationDigest === evaluation.evaluationDigest ||
        (item.candidateDigest === evaluation.candidateDigest &&
          item.evaluatorBindingDigest === evaluation.evaluatorBindingDigest),
    )
  )
    throw new TypeError("role_refinement_evaluation_duplicate_or_expired");
  const evaluations = [...state.evaluations, evaluation].sort((left, right) =>
    compareCodeUnits(left.evaluationDigest, right.evaluationDigest),
  );
  return transitionState(
    state,
    "candidate_evaluated",
    evaluation.evaluationDigest,
    evaluation.eligible
      ? "role_refinement_evaluation_eligible"
      : "role_refinement_evaluation_ineligible",
    input.logicalTimeMs,
    { evaluations },
    policy,
  );
}

export function selectRoleRefinementCandidateV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly selectionId: string;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  assertIdentifier(input.selectionId, "selectionId");
  if (
    state.status !== "collecting" ||
    input.selectionId !== state.request.selectionId ||
    input.logicalTimeMs >= state.request.expiresAtLogicalMs
  )
    throw new TypeError("role_refinement_selection_invalid");
  const aggregates = eligibleAggregates(state, policy, input.logicalTimeMs);
  if (aggregates.length === 0)
    throw new TypeError("role_refinement_no_eligible_candidate");
  const ranked = [...aggregates].sort((left, right) =>
    left.score !== right.score
      ? right.score - left.score
      : compareCodeUnits(left.candidateDigest, right.candidateDigest),
  );
  const winner = ranked[0];
  const selected = state.candidates.find(
    (candidate) => candidate.candidateDigest === winner.candidateDigest,
  )!;
  const body = {
    schemaVersion: 1 as const,
    selectionId: input.selectionId,
    requestDigest: state.request.requestDigest,
    selectedCandidateDigest: selected.candidateDigest,
    selectedPatchDigest: selected.patchDigest,
    selectedDefinitionDigest: selected.refinedDefinitionDigest,
    aggregates,
    stateRevision: state.revision,
    selectedAtLogicalMs: input.logicalTimeMs,
  };
  const selection = deepFreeze({
    ...body,
    selectionDigest: digestRoleRefinementJsonV1(
      "selection",
      body as unknown as JsonValue,
    ),
  });
  return transitionState(
    state,
    "candidate_selected",
    selection.selectionDigest,
    "role_refinement_candidate_selected_deterministically",
    input.logicalTimeMs,
    { status: "selected", selection },
    policy,
  );
}

export function createRoleRefinementCertificateV1(
  input: Omit<
    RoleRefinementCertificateV1,
    "schemaVersion" | "certificateDigest"
  >,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementCertificateV1 {
  const body = normalizeCertificate(
    { schemaVersion: 1, ...input },
    state,
    policy,
  );
  return deepFreeze({
    ...body,
    certificateDigest: digestRoleRefinementJsonV1(
      "certificate",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRefinementCertificateV1(
  input: RoleRefinementCertificateV1,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementCertificateV1 {
  const { certificateDigest, ...body } = input;
  assertDigest(certificateDigest, "certificateDigest");
  const normalized = normalizeCertificate(body, state, policy);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRefinementJsonV1("certificate", body as unknown as JsonValue) !==
      certificateDigest
  )
    throw new TypeError("role_refinement_certificate_invalid");
  return freezeClone(input);
}

export function certifyRoleRefinementV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly certificate: RoleRefinementCertificateV1;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  const certificate = validateRoleRefinementCertificateV1(
    input.certificate,
    state,
    policy,
  );
  if (
    certificate.certifiedAtLogicalMs > input.logicalTimeMs ||
    certificate.expiresAtLogicalMs <= input.logicalTimeMs
  )
    throw new TypeError("role_refinement_certificate_expired");
  if (certificate.action === "publish") {
    if (state.status !== "selected")
      throw new TypeError("role_refinement_publication_certification_invalid");
    return transitionState(
      state,
      "publication_certified",
      certificate.certificateDigest,
      "role_refinement_publication_certified",
      input.logicalTimeMs,
      { status: "certified", publicationCertificate: certificate },
      policy,
    );
  }
  if (state.status !== "rollback_required")
    throw new TypeError("role_refinement_rollback_certification_invalid");
  return transitionState(
    state,
    "rollback_certified",
    certificate.certificateDigest,
    "role_refinement_rollback_certified",
    input.logicalTimeMs,
    { status: "rollback_certified", rollbackCertificate: certificate },
    policy,
  );
}

export function createRoleRefinementPublicationV1(
  input: Omit<
    RoleRefinementPublicationV1,
    "schemaVersion" | "publicationDigest"
  >,
  state: RoleRefinementStateV1,
): RoleRefinementPublicationV1 {
  if (!state.selection || !state.publicationCertificate)
    throw new TypeError("role_refinement_publication_invalid");
  const body = { schemaVersion: 1 as const, ...input };
  validatePublicationBody(body, state);
  return deepFreeze({
    ...body,
    publicationDigest: digestRoleRefinementJsonV1(
      "publication",
      body as unknown as JsonValue,
    ),
  });
}

export function recordRoleRefinementPublicationV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly publication: RoleRefinementPublicationV1;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  if (state.status !== "certified")
    throw new TypeError("role_refinement_publication_transition_invalid");
  validatePublication(input.publication, state);
  if (input.publication.publishedAtLogicalMs > input.logicalTimeMs)
    throw new TypeError("role_refinement_publication_invalid");
  return transitionState(
    state,
    "revision_published",
    input.publication.publicationDigest,
    "role_refinement_revision_published",
    input.logicalTimeMs,
    { status: "published", publication: freezeClone(input.publication) },
    policy,
  );
}

export function createRoleRefinementActivationV1(
  input: Omit<RoleRefinementActivationV1, "schemaVersion" | "activationDigest">,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementActivationV1 {
  const body = { schemaVersion: 1 as const, ...input };
  validateActivationBody(body, state, policy);
  return deepFreeze({
    ...body,
    activationDigest: digestRoleRefinementJsonV1(
      "activation",
      body as unknown as JsonValue,
    ),
  });
}

export function recordRoleRefinementActivationV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly activation: RoleRefinementActivationV1;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  if (state.status !== "published")
    throw new TypeError("role_refinement_activation_transition_invalid");
  validateActivation(input.activation, state, policy);
  if (input.activation.activatedAtLogicalMs > input.logicalTimeMs)
    throw new TypeError("role_refinement_activation_invalid");
  return transitionState(
    state,
    "revision_activated",
    input.activation.activationDigest,
    "role_refinement_revision_activated_provisionally",
    input.logicalTimeMs,
    { status: "monitoring", activation: freezeClone(input.activation) },
    policy,
  );
}

export function createRoleRefinementObservationV1(
  input: Omit<
    RoleRefinementObservationV1,
    "schemaVersion" | "observationDigest"
  >,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementObservationV1 {
  const body = normalizeObservation(
    { schemaVersion: 1, ...input },
    state,
    policy,
  );
  return deepFreeze({
    ...body,
    observationDigest: digestRoleRefinementJsonV1(
      "observation",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRefinementObservationV1(
  input: RoleRefinementObservationV1,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): RoleRefinementObservationV1 {
  const { observationDigest, ...body } = input;
  assertDigest(observationDigest, "observationDigest");
  const normalized = normalizeObservation(body, state, policy);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRefinementJsonV1("observation", body as unknown as JsonValue) !==
      observationDigest
  )
    throw new TypeError("role_refinement_observation_invalid");
  return freezeClone(input);
}

export function recordRoleRefinementObservationV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly observation: RoleRefinementObservationV1;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  if (state.status !== "monitoring" || !state.activation)
    throw new TypeError("role_refinement_observation_transition_invalid");
  const observation = validateRoleRefinementObservationV1(
    input.observation,
    state,
    policy,
  );
  if (
    observation.observedAtLogicalMs > input.logicalTimeMs ||
    observation.expiresAtLogicalMs <= input.logicalTimeMs ||
    state.observations.length >= policy.limits.maximumObservations ||
    state.observations.some(
      (item) =>
        item.observationDigest === observation.observationDigest ||
        item.observationId === observation.observationId,
    )
  )
    throw new TypeError("role_refinement_observation_duplicate_or_expired");
  const observations = [...state.observations, observation].sort(
    (left, right) =>
      left.observedAtLogicalMs !== right.observedAtLogicalMs
        ? left.observedAtLogicalMs - right.observedAtLogicalMs
        : compareCodeUnits(left.observationDigest, right.observationDigest),
  );
  const monitoring = createMonitoring(
    observations,
    policy,
    input.logicalTimeMs,
  );
  const rollbackRequired = monitoringRequiresRollback(monitoring, policy);
  const confirmed = monitoringConfirms(monitoring, policy);
  const status: RoleRefinementStatusV1 = rollbackRequired
    ? "rollback_required"
    : confirmed
      ? "confirmed"
      : "monitoring";
  const primary = transitionState(
    state,
    "observation_recorded",
    observation.observationDigest,
    "role_refinement_observation_recorded",
    input.logicalTimeMs,
    { status, observations, monitoring },
    policy,
  );
  if (status === "monitoring") return primary;
  return transitionState(
    primary.state,
    status === "confirmed" ? "revision_confirmed" : "rollback_required",
    monitoring.monitoringDigest,
    status === "confirmed"
      ? "role_refinement_revision_confirmed"
      : "role_refinement_rollback_required",
    input.logicalTimeMs,
    {},
    policy,
  );
}

export function requireRoleRefinementRollbackV1(
  state: RoleRefinementStateV1,
  input: { readonly expectedRevision: number; readonly logicalTimeMs: number },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  if (
    state.status !== "monitoring" ||
    !state.activation ||
    input.logicalTimeMs < state.activation.monitoringExpiresAtLogicalMs
  )
    throw new TypeError("role_refinement_rollback_not_required");
  const monitoring =
    state.monitoring ?? createMonitoring([], policy, input.logicalTimeMs);
  return transitionState(
    state,
    "rollback_required",
    monitoring.monitoringDigest,
    "role_refinement_monitoring_expired",
    input.logicalTimeMs,
    { status: "rollback_required", monitoring },
    policy,
  );
}

export function createRoleRefinementRollbackV1(
  input: Omit<RoleRefinementRollbackV1, "schemaVersion" | "rollbackDigest">,
  state: RoleRefinementStateV1,
): RoleRefinementRollbackV1 {
  const body = { schemaVersion: 1 as const, ...input };
  validateRollbackBody(body, state);
  return deepFreeze({
    ...body,
    rollbackDigest: digestRoleRefinementJsonV1(
      "rollback",
      body as unknown as JsonValue,
    ),
  });
}

export function completeRoleRefinementRollbackV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly rollback: RoleRefinementRollbackV1;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  if (state.status !== "rollback_certified")
    throw new TypeError("role_refinement_rollback_transition_invalid");
  validateRollback(input.rollback, state);
  if (input.rollback.rolledBackAtLogicalMs > input.logicalTimeMs)
    throw new TypeError("role_refinement_rollback_invalid");
  return transitionState(
    state,
    "revision_rolled_back",
    input.rollback.rollbackDigest,
    "role_refinement_revision_rolled_back",
    input.logicalTimeMs,
    { status: "rolled_back", rollback: freezeClone(input.rollback) },
    policy,
  );
}

export function quarantineRoleRefinementRevisionV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly quarantineRecordDigest: string;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  assertDigest(input.quarantineRecordDigest, "quarantineRecordDigest");
  if (state.status !== "rolled_back")
    throw new TypeError("role_refinement_quarantine_transition_invalid");
  return transitionState(
    state,
    "revision_quarantined",
    input.quarantineRecordDigest,
    "role_refinement_revision_quarantined",
    input.logicalTimeMs,
    { status: "quarantined" },
    policy,
  );
}

export function requireRoleRefinementRollbackRecertificationV1(
  state: RoleRefinementStateV1,
  input: { readonly expectedRevision: number; readonly logicalTimeMs: number },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  const certificate = state.rollbackCertificate;
  if (
    state.status !== "rollback_certified" ||
    !certificate ||
    input.logicalTimeMs < certificate.expiresAtLogicalMs
  )
    throw new TypeError("role_refinement_rollback_recertification_invalid");
  return transitionState(
    state,
    "rollback_required",
    certificate.certificateDigest,
    "role_refinement_rollback_certificate_expired",
    input.logicalTimeMs,
    { status: "rollback_required", rollbackCertificate: null },
    policy,
  );
}

export function rebindRoleRefinementSessionV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly targetSessionId: string;
    readonly targetAgentId: string;
    readonly transferDigest: string;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  assertIdentifier(input.targetSessionId, "targetSessionId");
  assertIdentifier(input.targetAgentId, "targetAgentId");
  assertDigest(input.transferDigest, "transferDigest");
  if (input.targetSessionId === state.activeSessionId)
    throw new TypeError("role_refinement_session_rebind_invalid");
  return transitionState(
    state,
    "session_rebound",
    input.transferDigest,
    "role_refinement_session_rebound",
    input.logicalTimeMs,
    { activeSessionId: input.targetSessionId, agentId: input.targetAgentId },
    policy,
  );
}

export function expireRoleRefinementV1(
  state: RoleRefinementStateV1,
  input: { readonly expectedRevision: number; readonly logicalTimeMs: number },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  const expirable = [
    "requested",
    "collecting",
    "selected",
    "certified",
    "published",
  ].includes(state.status);
  const publicationAuthorityExpired = Boolean(
    state.publicationCertificate &&
    ["certified", "published"].includes(state.status) &&
    input.logicalTimeMs >= state.publicationCertificate.expiresAtLogicalMs,
  );
  if (
    !expirable ||
    (input.logicalTimeMs < state.request.expiresAtLogicalMs &&
      !publicationAuthorityExpired)
  )
    throw new TypeError("role_refinement_expiry_invalid");
  return transitionState(
    state,
    "expired",
    state.request.requestDigest,
    "role_refinement_request_expired",
    input.logicalTimeMs,
    { status: "expired" },
    policy,
  );
}

export function failRoleRefinementV1(
  state: RoleRefinementStateV1,
  input: {
    readonly expectedRevision: number;
    readonly failureDigest: string;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  },
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  requireTransition(state, input.expectedRevision, input.logicalTimeMs);
  assertDigest(input.failureDigest, "failureDigest");
  assertIdentifier(input.reasonCode, "reasonCode");
  if (terminal(state.status))
    throw new TypeError("role_refinement_failure_invalid");
  return transitionState(
    state,
    "failed",
    input.failureDigest,
    input.reasonCode,
    input.logicalTimeMs,
    { status: "failed" },
    policy,
  );
}

export function assertRoleRefinementStateV1(
  input: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
  realignmentPolicy: RoleRealignmentPolicyV1,
  binding?: {
    readonly controllerId: string;
    readonly controllerVersion: number;
    readonly implementationId: string;
    readonly activeSessionId: string;
  },
): RoleRefinementStateV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "controllerId",
      "controllerVersion",
      "implementationId",
      "tenantId",
      "activeSessionId",
      "agentId",
      "objectiveId",
      "policyId",
      "policyVersion",
      "policyDigest",
      "revision",
      "status",
      "request",
      "candidates",
      "evaluations",
      "selection",
      "publicationCertificate",
      "publication",
      "activation",
      "observations",
      "monitoring",
      "rollbackCertificate",
      "rollback",
      "events",
      "lastLogicalTimeMs",
      "stateDigest",
    ],
    "role refinement state",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_refinement_state_invalid");
  for (const [label, value] of [
    ["controllerId", input.controllerId],
    ["implementationId", input.implementationId],
    ["tenantId", input.tenantId],
    ["activeSessionId", input.activeSessionId],
    ["agentId", input.agentId],
    ["objectiveId", input.objectiveId],
    ["policyId", input.policyId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.controllerVersion, "controllerVersion", 1);
  assertSafeInteger(input.policyVersion, "policyVersion", 1);
  assertSafeInteger(input.revision, "revision", 1);
  assertSafeInteger(input.lastLogicalTimeMs, "lastLogicalTimeMs");
  assertOneOf(input.status, STATUS_VALUES, "role refinement status");
  assertDigest(input.policyDigest, "policyDigest");
  assertDigest(input.stateDigest, "stateDigest");
  const policyRecord = createRoleRefinementPolicyRecordV1(policy);
  const request = validateRoleRefinementRequestV1(
    input.request,
    policy,
    realignmentPolicy,
  );
  if (
    input.policyId !== policy.policyId ||
    input.policyVersion !== policy.policyVersion ||
    input.policyDigest !== policyRecord.policyDigest ||
    input.tenantId !== request.tenantId ||
    input.objectiveId !== request.objectiveId ||
    (binding &&
      (input.controllerId !== binding.controllerId ||
        input.controllerVersion !== binding.controllerVersion ||
        input.implementationId !== binding.implementationId ||
        input.activeSessionId !== binding.activeSessionId))
  )
    throw new TypeError("role_refinement_state_binding_invalid");
  if (
    !Array.isArray(input.candidates) ||
    !Array.isArray(input.evaluations) ||
    !Array.isArray(input.observations) ||
    !Array.isArray(input.events) ||
    input.candidates.length > policy.limits.maximumCandidates ||
    input.evaluations.length >
      policy.limits.maximumCandidates * policy.limits.maximumEvaluators ||
    input.observations.length > policy.limits.maximumObservations ||
    input.events.length > policy.limits.maximumEvents ||
    input.events.length === 0 ||
    input.revision !== input.events[input.events.length - 1].sequence ||
    input.lastLogicalTimeMs !==
      input.events[input.events.length - 1].logicalTimeMs
  )
    throw new TypeError("role_refinement_state_capacity_invalid");
  validateEvents(input.events);
  validateContentFreeCandidates(input.candidates, request);
  for (const evaluation of input.evaluations)
    validateRoleRefinementEvaluationV1(evaluation, input, policy);
  validateStateArtifacts(input, policy);
  const { stateDigest, ...body } = input;
  if (
    digestRoleRefinementJsonV1("state", body as unknown as JsonValue) !==
    stateDigest
  )
    throw new TypeError("role_refinement_state_digest_invalid");
  return freezeClone(input);
}

function normalizeEvaluation(
  input: Omit<RoleRefinementEvaluationV1, "evaluationDigest">,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
) {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "evaluationId",
      "requestDigest",
      "candidateDigest",
      "patchDigest",
      "refinedDefinitionDigest",
      "evaluatorId",
      "evaluatorVersion",
      "evaluatorBindingDigest",
      "evaluatorTrustDecisionDigest",
      "eligible",
      "predictedCoherenceBps",
      "predictedContributionBps",
      "uncertaintyBps",
      "transitionRiskBps",
      "reasonCodes",
      "evidenceReferenceIds",
      "evaluatedAtLogicalMs",
      "expiresAtLogicalMs",
    ],
    "role refinement evaluation",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_refinement_evaluation_invalid");
  for (const [label, value] of [
    ["evaluationId", input.evaluationId],
    ["evaluatorId", input.evaluatorId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.evaluatorVersion, "evaluatorVersion", 1);
  for (const [label, value] of [
    ["requestDigest", input.requestDigest],
    ["candidateDigest", input.candidateDigest],
    ["patchDigest", input.patchDigest],
    ["refinedDefinitionDigest", input.refinedDefinitionDigest],
    ["evaluatorBindingDigest", input.evaluatorBindingDigest],
    ["evaluatorTrustDecisionDigest", input.evaluatorTrustDecisionDigest],
  ] as const)
    assertDigest(value, label);
  if (typeof input.eligible !== "boolean")
    throw new TypeError("role_refinement_evaluation_invalid");
  for (const [label, value] of [
    ["predictedCoherenceBps", input.predictedCoherenceBps],
    ["predictedContributionBps", input.predictedContributionBps],
    ["uncertaintyBps", input.uncertaintyBps],
    ["transitionRiskBps", input.transitionRiskBps],
  ] as const)
    assertBasisPoints(value, label);
  assertSafeInteger(input.evaluatedAtLogicalMs, "evaluatedAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs");
  const candidate = state.candidates.find(
    (item) => item.candidateDigest === input.candidateDigest,
  );
  if (
    !candidate ||
    input.requestDigest !== state.request.requestDigest ||
    input.patchDigest !== candidate.patchDigest ||
    input.refinedDefinitionDigest !== candidate.refinedDefinitionDigest ||
    input.evaluatedAtLogicalMs < candidate.proposedAtLogicalMs ||
    input.expiresAtLogicalMs <= input.evaluatedAtLogicalMs ||
    input.expiresAtLogicalMs - input.evaluatedAtLogicalMs >
      policy.limits.maximumEvaluationLifetimeMs ||
    input.expiresAtLogicalMs > state.request.expiresAtLogicalMs
  )
    throw new TypeError("role_refinement_evaluation_invalid");
  const reasonCodes = normalizeReferences(
    input.reasonCodes,
    policy.limits.maximumReasonCodes,
    "reasonCodes",
  );
  const evidenceReferenceIds = normalizeReferences(
    input.evidenceReferenceIds,
    policy.limits.maximumEvidenceReferences,
    "evidenceReferenceIds",
  );
  return deepFreeze({ ...input, reasonCodes, evidenceReferenceIds });
}

function normalizeCertificate(
  input: Omit<RoleRefinementCertificateV1, "certificateDigest">,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
) {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "certificateId",
      "action",
      "certifierId",
      "certifierVersion",
      "certifierBindingDigest",
      "requestDigest",
      "selectionDigest",
      "predecessorDefinitionDigest",
      "refinedDefinitionDigest",
      "patchDigest",
      "authorityCeilingDigest",
      "activationDigest",
      "monitoringDigest",
      "witnessIds",
      "membershipEpoch",
      "membershipConfigurationDigest",
      "sourceCertificateDigest",
      "certifiedAtLogicalMs",
      "expiresAtLogicalMs",
    ],
    "role refinement certificate",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_refinement_certificate_invalid");
  assertOneOf(
    input.action,
    ["publish", "rollback"] as const,
    "certificate action",
  );
  for (const [label, value] of [
    ["certificateId", input.certificateId],
    ["certifierId", input.certifierId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.certifierVersion, "certifierVersion", 1);
  for (const [label, value] of [
    ["certifierBindingDigest", input.certifierBindingDigest],
    ["requestDigest", input.requestDigest],
    ["selectionDigest", input.selectionDigest],
    ["predecessorDefinitionDigest", input.predecessorDefinitionDigest],
    ["refinedDefinitionDigest", input.refinedDefinitionDigest],
    ["patchDigest", input.patchDigest],
    ["authorityCeilingDigest", input.authorityCeilingDigest],
    ["membershipConfigurationDigest", input.membershipConfigurationDigest],
    ["sourceCertificateDigest", input.sourceCertificateDigest],
  ] as const)
    assertDigest(value, label);
  assertSafeInteger(input.membershipEpoch, "membershipEpoch", 1);
  assertSafeInteger(input.certifiedAtLogicalMs, "certifiedAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs");
  const witnessIds = normalizeIdentifiers(input.witnessIds, "witnessIds");
  if (
    witnessIds.length < policy.minimumCertificationWitnesses ||
    input.expiresAtLogicalMs <= input.certifiedAtLogicalMs ||
    input.expiresAtLogicalMs - input.certifiedAtLogicalMs >
      policy.limits.maximumCertificateLifetimeMs ||
    !state.selection ||
    input.requestDigest !== state.request.requestDigest ||
    input.selectionDigest !== state.selection.selectionDigest ||
    input.predecessorDefinitionDigest !==
      state.request.predecessorDefinitionDigest ||
    input.refinedDefinitionDigest !==
      state.selection.selectedDefinitionDigest ||
    input.patchDigest !== state.selection.selectedPatchDigest ||
    input.authorityCeilingDigest !==
      state.request.authorityCeiling.ceilingDigest
  )
    throw new TypeError("role_refinement_certificate_invalid");
  if (
    input.action === "publish"
      ? input.activationDigest !== null ||
        input.monitoringDigest !== null ||
        input.expiresAtLogicalMs > state.request.expiresAtLogicalMs
      : !state.activation ||
        !state.monitoring ||
        input.activationDigest !== state.activation.activationDigest ||
        input.monitoringDigest !== state.monitoring.monitoringDigest
  )
    throw new TypeError("role_refinement_certificate_action_invalid");
  return deepFreeze({ ...input, witnessIds });
}

function validatePublicationBody(
  input: Omit<RoleRefinementPublicationV1, "publicationDigest">,
  state: RoleRefinementStateV1,
): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "publicationId",
      "catalogId",
      "definitionId",
      "definitionRevision",
      "predecessorDefinitionDigest",
      "refinedDefinitionDigest",
      "certificateDigest",
      "publishedAtLogicalMs",
    ],
    "role refinement publication",
  );
  if (
    input.schemaVersion !== 1 ||
    !state.selection ||
    !state.publicationCertificate
  )
    throw new TypeError("role_refinement_publication_invalid");
  for (const [label, value] of [
    ["publicationId", input.publicationId],
    ["catalogId", input.catalogId],
    ["definitionId", input.definitionId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.definitionRevision, "definitionRevision", 1);
  assertSafeInteger(input.publishedAtLogicalMs, "publishedAtLogicalMs");
  for (const [label, value] of [
    ["predecessorDefinitionDigest", input.predecessorDefinitionDigest],
    ["refinedDefinitionDigest", input.refinedDefinitionDigest],
    ["certificateDigest", input.certificateDigest],
  ] as const)
    assertDigest(value, label);
  if (
    input.publicationId !== state.request.publicationId ||
    input.catalogId !== state.request.predecessorCatalogId ||
    input.definitionId !== state.request.predecessorDefinitionId ||
    input.definitionRevision !==
      state.request.predecessorDefinitionRevision + 1 ||
    input.predecessorDefinitionDigest !==
      state.request.predecessorDefinitionDigest ||
    input.refinedDefinitionDigest !==
      state.selection.selectedDefinitionDigest ||
    input.certificateDigest !==
      state.publicationCertificate.certificateDigest ||
    input.publishedAtLogicalMs <
      state.publicationCertificate.certifiedAtLogicalMs ||
    input.publishedAtLogicalMs >=
      state.publicationCertificate.expiresAtLogicalMs
  )
    throw new TypeError("role_refinement_publication_invalid");
}

function validatePublication(
  input: RoleRefinementPublicationV1,
  state: RoleRefinementStateV1,
): void {
  const { publicationDigest, ...body } = input;
  assertDigest(publicationDigest, "publicationDigest");
  validatePublicationBody(body, state);
  if (
    digestRoleRefinementJsonV1("publication", body as unknown as JsonValue) !==
    publicationDigest
  )
    throw new TypeError("role_refinement_publication_invalid");
}

function validateActivationBody(
  input: Omit<RoleRefinementActivationV1, "activationDigest">,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "activationId",
      "publicationDigest",
      "predecessorDefinitionDigest",
      "refinedDefinitionDigest",
      "roleBindingId",
      "roleRevision",
      "roleContentDigest",
      "runtimeSessionRevision",
      "activatedAtLogicalMs",
      "monitoringExpiresAtLogicalMs",
    ],
    "role refinement activation",
  );
  if (
    input.schemaVersion !== 1 ||
    !state.publication ||
    !state.publicationCertificate
  )
    throw new TypeError("role_refinement_activation_invalid");
  for (const [label, value] of [
    ["activationId", input.activationId],
    ["roleBindingId", input.roleBindingId],
  ] as const)
    assertIdentifier(value, label);
  for (const [label, value] of [
    ["publicationDigest", input.publicationDigest],
    ["predecessorDefinitionDigest", input.predecessorDefinitionDigest],
    ["refinedDefinitionDigest", input.refinedDefinitionDigest],
    ["roleContentDigest", input.roleContentDigest],
  ] as const)
    assertDigest(value, label);
  for (const [label, value] of [
    ["roleRevision", input.roleRevision],
    ["runtimeSessionRevision", input.runtimeSessionRevision],
    ["activatedAtLogicalMs", input.activatedAtLogicalMs],
    ["monitoringExpiresAtLogicalMs", input.monitoringExpiresAtLogicalMs],
  ] as const)
    assertSafeInteger(value, label, label.includes("Revision") ? 1 : 0);
  if (
    input.activationId !== state.request.activationId ||
    input.publicationDigest !== state.publication.publicationDigest ||
    input.predecessorDefinitionDigest !==
      state.request.predecessorDefinitionDigest ||
    input.refinedDefinitionDigest !==
      state.publication.refinedDefinitionDigest ||
    input.roleRevision !== state.request.predecessorDefinitionRevision + 1 ||
    input.activatedAtLogicalMs < state.publication.publishedAtLogicalMs ||
    input.activatedAtLogicalMs >=
      state.publicationCertificate.expiresAtLogicalMs ||
    input.activatedAtLogicalMs >= state.request.expiresAtLogicalMs ||
    input.monitoringExpiresAtLogicalMs <= input.activatedAtLogicalMs ||
    input.monitoringExpiresAtLogicalMs - input.activatedAtLogicalMs >
      policy.limits.maximumMonitoringLifetimeMs
  )
    throw new TypeError("role_refinement_activation_invalid");
}

function validateActivation(
  input: RoleRefinementActivationV1,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): void {
  const { activationDigest, ...body } = input;
  assertDigest(activationDigest, "activationDigest");
  validateActivationBody(body, state, policy);
  if (
    digestRoleRefinementJsonV1("activation", body as unknown as JsonValue) !==
    activationDigest
  )
    throw new TypeError("role_refinement_activation_invalid");
}

function normalizeObservation(
  input: Omit<RoleRefinementObservationV1, "observationDigest">,
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
) {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "observationId",
      "requestDigest",
      "activationDigest",
      "observerId",
      "observerVersion",
      "observerBindingDigest",
      "observerTrustDecisionDigest",
      "coherenceBps",
      "contributionBps",
      "uncertaintyBps",
      "hardViolation",
      "reasonCodes",
      "evidenceReferenceIds",
      "observedAtLogicalMs",
      "expiresAtLogicalMs",
    ],
    "role refinement observation",
  );
  if (input.schemaVersion !== 1 || !state.activation)
    throw new TypeError("role_refinement_observation_invalid");
  for (const [label, value] of [
    ["observationId", input.observationId],
    ["observerId", input.observerId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.observerVersion, "observerVersion", 1);
  for (const [label, value] of [
    ["requestDigest", input.requestDigest],
    ["activationDigest", input.activationDigest],
    ["observerBindingDigest", input.observerBindingDigest],
    ["observerTrustDecisionDigest", input.observerTrustDecisionDigest],
  ] as const)
    assertDigest(value, label);
  for (const [label, value] of [
    ["coherenceBps", input.coherenceBps],
    ["contributionBps", input.contributionBps],
    ["uncertaintyBps", input.uncertaintyBps],
  ] as const)
    assertBasisPoints(value, label);
  if (typeof input.hardViolation !== "boolean")
    throw new TypeError("role_refinement_observation_invalid");
  assertSafeInteger(input.observedAtLogicalMs, "observedAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs");
  if (
    input.requestDigest !== state.request.requestDigest ||
    input.activationDigest !== state.activation.activationDigest ||
    input.observedAtLogicalMs < state.activation.activatedAtLogicalMs ||
    input.observedAtLogicalMs >=
      state.activation.monitoringExpiresAtLogicalMs ||
    input.expiresAtLogicalMs <= input.observedAtLogicalMs ||
    input.expiresAtLogicalMs > state.activation.monitoringExpiresAtLogicalMs
  )
    throw new TypeError("role_refinement_observation_invalid");
  const reasonCodes = normalizeReferences(
    input.reasonCodes,
    policy.limits.maximumReasonCodes,
    "reasonCodes",
  );
  const evidenceReferenceIds = normalizeReferences(
    input.evidenceReferenceIds,
    policy.limits.maximumEvidenceReferences,
    "evidenceReferenceIds",
  );
  return deepFreeze({ ...input, reasonCodes, evidenceReferenceIds });
}

function validateRollbackBody(
  input: Omit<RoleRefinementRollbackV1, "rollbackDigest">,
  state: RoleRefinementStateV1,
): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "rollbackId",
      "activationDigest",
      "monitoringDigest",
      "rollbackCertificateDigest",
      "restoredDefinitionDigest",
      "quarantinedDefinitionDigest",
      "runtimeSessionRevision",
      "rolledBackAtLogicalMs",
    ],
    "role refinement rollback",
  );
  if (
    input.schemaVersion !== 1 ||
    !state.activation ||
    !state.monitoring ||
    !state.rollbackCertificate
  )
    throw new TypeError("role_refinement_rollback_invalid");
  assertIdentifier(input.rollbackId, "rollbackId");
  for (const [label, value] of [
    ["activationDigest", input.activationDigest],
    ["monitoringDigest", input.monitoringDigest],
    ["rollbackCertificateDigest", input.rollbackCertificateDigest],
    ["restoredDefinitionDigest", input.restoredDefinitionDigest],
    ["quarantinedDefinitionDigest", input.quarantinedDefinitionDigest],
  ] as const)
    assertDigest(value, label);
  assertSafeInteger(input.runtimeSessionRevision, "runtimeSessionRevision", 1);
  assertSafeInteger(input.rolledBackAtLogicalMs, "rolledBackAtLogicalMs");
  if (
    input.rollbackId !== state.request.rollbackId ||
    input.activationDigest !== state.activation.activationDigest ||
    input.monitoringDigest !== state.monitoring.monitoringDigest ||
    input.rollbackCertificateDigest !==
      state.rollbackCertificate.certificateDigest ||
    input.restoredDefinitionDigest !==
      state.request.predecessorDefinitionDigest ||
    input.quarantinedDefinitionDigest !==
      state.activation.refinedDefinitionDigest ||
    input.rolledBackAtLogicalMs <
      state.rollbackCertificate.certifiedAtLogicalMs ||
    input.rolledBackAtLogicalMs >= state.rollbackCertificate.expiresAtLogicalMs
  )
    throw new TypeError("role_refinement_rollback_invalid");
}

function validateRollback(
  input: RoleRefinementRollbackV1,
  state: RoleRefinementStateV1,
): void {
  const { rollbackDigest, ...body } = input;
  assertDigest(rollbackDigest, "rollbackDigest");
  validateRollbackBody(body, state);
  if (
    digestRoleRefinementJsonV1("rollback", body as unknown as JsonValue) !==
    rollbackDigest
  )
    throw new TypeError("role_refinement_rollback_invalid");
}

function eligibleAggregates(
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
  logicalTimeMs: number,
): readonly RoleRefinementCandidateAggregateV1[] {
  return Object.freeze(
    state.candidates
      .map((candidate) =>
        aggregateCandidate(candidate, state.evaluations, policy, logicalTimeMs),
      )
      .filter(
        (value): value is RoleRefinementCandidateAggregateV1 => value !== null,
      )
      .sort((left, right) =>
        compareCodeUnits(left.candidateDigest, right.candidateDigest),
      ),
  );
}

function aggregateCandidate(
  candidate: AdmittedRoleRefinementCandidateV1,
  evaluations: readonly RoleRefinementEvaluationV1[],
  policy: RoleRefinementPolicyV1,
  logicalTimeMs: number,
): RoleRefinementCandidateAggregateV1 | null {
  if (candidate.expiresAtLogicalMs <= logicalTimeMs) return null;
  const eligible = evaluations.filter(
    (evaluation) =>
      evaluation.candidateDigest === candidate.candidateDigest &&
      evaluation.eligible &&
      evaluation.expiresAtLogicalMs > logicalTimeMs,
  );
  const distinct = new Set(eligible.map((item) => item.evaluatorBindingDigest));
  if (
    eligible.length < policy.minimumIndependentEvaluations ||
    distinct.size !== eligible.length
  )
    return null;
  const meanPredictedCoherenceBps = integerMean(
    eligible.map((item) => item.predictedCoherenceBps),
  );
  const meanPredictedContributionBps = integerMean(
    eligible.map((item) => item.predictedContributionBps),
  );
  const meanUncertaintyBps = integerMean(
    eligible.map((item) => item.uncertaintyBps),
  );
  const meanTransitionRiskBps = integerMean(
    eligible.map((item) => item.transitionRiskBps),
  );
  const thresholds = policy.thresholds;
  if (
    meanPredictedCoherenceBps < thresholds.minimumPredictedCoherenceBps ||
    meanPredictedContributionBps < thresholds.minimumPredictedContributionBps ||
    meanUncertaintyBps > thresholds.maximumPredictedUncertaintyBps ||
    meanTransitionRiskBps > thresholds.maximumTransitionRiskBps
  )
    return null;
  const weights = policy.scoringWeights;
  const score = Math.trunc(
    (meanPredictedCoherenceBps * weights.coherenceBps +
      meanPredictedContributionBps * weights.contributionBps -
      meanUncertaintyBps * weights.uncertaintyPenaltyBps -
      meanTransitionRiskBps * weights.transitionRiskPenaltyBps) /
      ROLE_REFINEMENT_BASIS_POINTS_V1,
  );
  return deepFreeze({
    schemaVersion: 1,
    candidateId: candidate.candidateId,
    candidateDigest: candidate.candidateDigest,
    refinedDefinitionDigest: candidate.refinedDefinitionDigest,
    eligibleEvaluationDigests: eligible
      .map((item) => item.evaluationDigest)
      .sort(compareCodeUnits),
    meanPredictedCoherenceBps,
    meanPredictedContributionBps,
    meanUncertaintyBps,
    meanTransitionRiskBps,
    score,
  });
}

function createMonitoring(
  observations: readonly RoleRefinementObservationV1[],
  policy: RoleRefinementPolicyV1,
  logicalTimeMs: number,
): RoleRefinementMonitoringV1 {
  const valid = observations.filter(
    (item) => item.expiresAtLogicalMs > logicalTimeMs,
  );
  let consecutive = 0;
  for (let index = valid.length - 1; index >= 0; index -= 1) {
    const item = valid[index];
    if (
      item.hardViolation ||
      item.coherenceBps <= policy.thresholds.rollbackCoherenceBps ||
      item.contributionBps <= policy.thresholds.rollbackContributionBps ||
      item.uncertaintyBps >= policy.thresholds.rollbackUncertaintyBps
    )
      consecutive += 1;
    else break;
  }
  const body = {
    schemaVersion: 1 as const,
    observationDigests: valid.map((item) => item.observationDigest),
    meanCoherenceBps: integerMean(valid.map((item) => item.coherenceBps)),
    meanContributionBps: integerMean(valid.map((item) => item.contributionBps)),
    meanUncertaintyBps: integerMean(valid.map((item) => item.uncertaintyBps)),
    consecutiveDegradedObservations: consecutive,
    hardViolationObserved: valid.some((item) => item.hardViolation),
    evaluatedAtLogicalMs: logicalTimeMs,
  };
  return deepFreeze({
    ...body,
    monitoringDigest: digestRoleRefinementJsonV1(
      "monitoring",
      body as unknown as JsonValue,
    ),
  });
}

function monitoringRequiresRollback(
  monitoring: RoleRefinementMonitoringV1,
  policy: RoleRefinementPolicyV1,
): boolean {
  return (
    monitoring.hardViolationObserved ||
    monitoring.consecutiveDegradedObservations >=
      policy.maximumConsecutiveDegradedObservations
  );
}

function monitoringConfirms(
  monitoring: RoleRefinementMonitoringV1,
  policy: RoleRefinementPolicyV1,
): boolean {
  return (
    monitoring.observationDigests.length >=
      policy.minimumMonitoringObservations &&
    !monitoring.hardViolationObserved &&
    monitoring.meanCoherenceBps >= policy.thresholds.confirmationCoherenceBps &&
    monitoring.meanContributionBps >=
      policy.thresholds.confirmationContributionBps &&
    monitoring.meanUncertaintyBps <=
      policy.thresholds.confirmationMaximumUncertaintyBps
  );
}

function transitionState(
  state: RoleRefinementStateV1,
  eventType: RoleRefinementEventTypeV1,
  inputDigest: string,
  reasonCode: string,
  logicalTimeMs: number,
  patch: Partial<
    Omit<
      RoleRefinementStateV1,
      "stateDigest" | "revision" | "events" | "lastLogicalTimeMs"
    >
  >,
  policy: RoleRefinementPolicyV1,
): RoleRefinementTransitionV1 {
  if (state.events.length >= policy.limits.maximumEvents)
    throw new TypeError("role_refinement_event_capacity_exhausted");
  const event = createEvent(
    state.revision + 1,
    eventType,
    inputDigest,
    reasonCode,
    logicalTimeMs,
    state.events[state.events.length - 1].eventDigest,
  );
  const { stateDigest: _stateDigest, ...stateWithoutDigest } = state;
  const next = finalizeState({
    ...stateWithoutDigest,
    ...patch,
    revision: state.revision + 1,
    events: [...state.events, event],
    lastLogicalTimeMs: logicalTimeMs,
  });
  return deepFreeze({ state: next, event });
}

function createEvent(
  sequence: number,
  eventType: RoleRefinementEventTypeV1,
  inputDigest: string,
  reasonCode: string,
  logicalTimeMs: number,
  previousEventDigest: string | null,
): RoleRefinementEventV1 {
  assertSafeInteger(sequence, "event sequence", 1);
  assertOneOf(eventType, EVENT_TYPES, "eventType");
  assertDigest(inputDigest, "event inputDigest");
  assertIdentifier(reasonCode, "event reasonCode");
  assertSafeInteger(logicalTimeMs, "event logicalTimeMs");
  if (previousEventDigest !== null)
    assertDigest(previousEventDigest, "previousEventDigest");
  const body = {
    schemaVersion: 1 as const,
    sequence,
    eventType,
    inputDigest,
    reasonCode,
    logicalTimeMs,
    previousEventDigest,
  };
  return deepFreeze({
    ...body,
    eventDigest: digestRoleRefinementJsonV1(
      "event",
      body as unknown as JsonValue,
    ),
  });
}

function finalizeState(
  input: Omit<RoleRefinementStateV1, "stateDigest"> & {
    readonly stateDigest?: never;
  },
): RoleRefinementStateV1 {
  return deepFreeze({
    ...input,
    stateDigest: digestRoleRefinementJsonV1(
      "state",
      input as unknown as JsonValue,
    ),
  });
}

function requireTransition(
  state: RoleRefinementStateV1,
  expectedRevision: number,
  logicalTimeMs: number,
): void {
  assertSafeInteger(expectedRevision, "expectedRevision", 1);
  assertSafeInteger(logicalTimeMs, "logicalTimeMs");
  if (state.revision !== expectedRevision)
    throw new TypeError("role_refinement_revision_conflict");
  if (logicalTimeMs < state.lastLogicalTimeMs)
    throw new TypeError("role_refinement_logical_time_regression");
}

function validateEvents(events: readonly RoleRefinementEventV1[]): void {
  let previous: string | null = null;
  let lastTime = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const { eventDigest, ...body } = event;
    if (
      event.schemaVersion !== 1 ||
      event.sequence !== index + 1 ||
      event.previousEventDigest !== previous ||
      event.logicalTimeMs < lastTime ||
      digestRoleRefinementJsonV1("event", body as unknown as JsonValue) !==
        eventDigest
    )
      throw new TypeError("role_refinement_event_chain_invalid");
    assertOneOf(event.eventType, EVENT_TYPES, "eventType");
    assertDigest(event.inputDigest, "event inputDigest");
    assertIdentifier(event.reasonCode, "event reasonCode");
    previous = event.eventDigest;
    lastTime = event.logicalTimeMs;
  }
}

function validateContentFreeCandidates(
  candidates: readonly AdmittedRoleRefinementCandidateV1[],
  request: RoleRefinementRequestV1,
): void {
  sortedUnique(
    candidates.map((item) => item.candidateDigest),
    "role refinement candidate digests",
  );
  const proposalIds = new Set<string>();
  const draftIds = new Set<string>();
  const definitions = new Set<string>();
  for (const candidate of candidates) {
    assertExactKeys(
      candidate,
      [
        "schemaVersion",
        "candidateId",
        "requestDigest",
        "proposalId",
        "proposerId",
        "proposerVersion",
        "proposerBindingDigest",
        "proposerTrustDecisionDigest",
        "draftId",
        "patchDigest",
        "refinedDefinitionDigest",
        "semanticDecisionDigest",
        "proposedAtLogicalMs",
        "expiresAtLogicalMs",
        "candidateDigest",
      ],
      "admitted role refinement candidate",
    );
    const { candidateDigest, ...body } = candidate;
    for (const value of [
      candidate.proposerBindingDigest,
      candidate.proposerTrustDecisionDigest,
      candidate.patchDigest,
      candidate.refinedDefinitionDigest,
      candidate.semanticDecisionDigest,
      candidate.candidateDigest,
    ])
      assertDigest(value, "candidate digest");
    for (const value of [
      candidate.candidateId,
      candidate.proposalId,
      candidate.proposerId,
      candidate.draftId,
    ])
      assertIdentifier(value, "candidate identifier");
    assertSafeInteger(candidate.proposerVersion, "proposerVersion", 1);
    if (
      candidate.schemaVersion !== 1 ||
      candidate.requestDigest !== request.requestDigest ||
      candidate.expiresAtLogicalMs <= candidate.proposedAtLogicalMs ||
      digestRoleRefinementJsonV1("candidate", body as unknown as JsonValue) !==
        candidateDigest ||
      proposalIds.has(candidate.proposalId) ||
      draftIds.has(candidate.draftId) ||
      definitions.has(candidate.refinedDefinitionDigest)
    )
      throw new TypeError("role_refinement_candidate_invalid");
    proposalIds.add(candidate.proposalId);
    draftIds.add(candidate.draftId);
    definitions.add(candidate.refinedDefinitionDigest);
  }
}

function validateStateArtifacts(
  state: RoleRefinementStateV1,
  policy: RoleRefinementPolicyV1,
): void {
  if (state.selection) {
    const { selectionDigest, ...body } = state.selection;
    assertDigest(selectionDigest, "selectionDigest");
    if (
      state.selection.requestDigest !== state.request.requestDigest ||
      digestRoleRefinementJsonV1("selection", body as unknown as JsonValue) !==
        selectionDigest
    )
      throw new TypeError("role_refinement_selection_invalid");
    const expected = eligibleAggregates(
      state,
      policy,
      state.selection.selectedAtLogicalMs,
    );
    const ranked = [...expected].sort((left, right) =>
      left.score !== right.score
        ? right.score - left.score
        : compareCodeUnits(left.candidateDigest, right.candidateDigest),
    );
    const candidate = state.candidates.find(
      (item) =>
        item.candidateDigest === state.selection!.selectedCandidateDigest,
    );
    if (
      !candidate ||
      ranked[0]?.candidateDigest !== candidate.candidateDigest ||
      candidate.patchDigest !== state.selection.selectedPatchDigest ||
      candidate.refinedDefinitionDigest !==
        state.selection.selectedDefinitionDigest ||
      canonicalizeControlJsonV1(expected as unknown as JsonValue) !==
        canonicalizeControlJsonV1(
          state.selection.aggregates as unknown as JsonValue,
        )
    )
      throw new TypeError("role_refinement_selection_substitution_denied");
  }
  if (state.publicationCertificate)
    validateRoleRefinementCertificateV1(
      state.publicationCertificate,
      state,
      policy,
    );
  if (state.publication) validatePublication(state.publication, state);
  if (state.activation) validateActivation(state.activation, state, policy);
  for (const observation of state.observations)
    validateRoleRefinementObservationV1(observation, state, policy);
  if (state.monitoring) {
    const { monitoringDigest, ...body } = state.monitoring;
    if (
      digestRoleRefinementJsonV1("monitoring", body as unknown as JsonValue) !==
        monitoringDigest ||
      state.monitoring.observationDigests.some(
        (digest) =>
          !state.observations.some(
            (observation) => observation.observationDigest === digest,
          ),
      )
    )
      throw new TypeError("role_refinement_monitoring_invalid");
  }
  if (state.rollbackCertificate)
    validateRoleRefinementCertificateV1(
      state.rollbackCertificate,
      state,
      policy,
    );
  if (state.rollback) validateRollback(state.rollback, state);
  assertRoleRefinementPhaseArtifacts(state);
}

function assertRoleRefinementPhaseArtifacts(
  state: RoleRefinementStateV1,
): void {
  const selection = state.selection !== null;
  const publicationCertificate = state.publicationCertificate !== null;
  const publication = state.publication !== null;
  const activation = state.activation !== null;
  const monitoring = state.monitoring !== null;
  const rollbackCertificate = state.rollbackCertificate !== null;
  const rollback = state.rollback !== null;
  if (
    (publicationCertificate && !selection) ||
    (publication && !publicationCertificate) ||
    (activation && !publication) ||
    ((state.observations.length > 0 || monitoring) && !activation) ||
    (rollbackCertificate && (!activation || !monitoring)) ||
    (rollback && !rollbackCertificate)
  )
    throw new TypeError("role_refinement_state_phase_invalid");
  const valid = (() => {
    switch (state.status) {
      case "requested":
      case "collecting":
        return !selection;
      case "selected":
        return selection && !publicationCertificate;
      case "certified":
        return publicationCertificate && !publication;
      case "published":
        return publication && !activation;
      case "monitoring":
        return activation && !rollbackCertificate && !rollback;
      case "confirmed":
      case "rollback_required":
        return activation && monitoring && !rollbackCertificate && !rollback;
      case "rollback_certified":
        return rollbackCertificate && !rollback;
      case "rolled_back":
      case "quarantined":
        return rollback;
      case "expired":
      case "failed":
        return true;
    }
  })();
  if (!valid) throw new TypeError("role_refinement_state_phase_invalid");
}

function integerMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.trunc(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function terminal(status: RoleRefinementStatusV1): boolean {
  return ["confirmed", "quarantined", "expired", "failed"].includes(status);
}
