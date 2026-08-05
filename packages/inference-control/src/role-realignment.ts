import type { JsonObject, JsonValue } from "@agentplat/core";
import {
  normalizeRoleBindingV1,
  type PortableAgentRoleBindingV1,
} from "@agentplat/runtime/adapter";

import { canonicalizeControlJsonV1, utf8ByteLength } from "./canonical.js";
import {
  assertRoleAlignmentStateV1,
  type RoleAlignmentPolicyV1,
  type RoleAlignmentStateV1,
} from "./role-alignment.js";
import { sha256Hex } from "./sha256.js";
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertOneOf,
  assertSafeInteger,
  assertStrictJsonValue,
  assertString,
  compareCodeUnits,
  deepFreeze,
  sortedUnique,
} from "./validation.js";

export const ROLE_REALIGNMENT_SCHEMA_VERSION_V1 = 1 as const;
export const ROLE_REALIGNMENT_BASIS_POINTS_V1 = 10_000 as const;

export type RoleRealignmentStateStatusV1 =
  | "requested"
  | "collecting"
  | "selected"
  | "certified"
  | "activating"
  | "activated"
  | "expired"
  | "failed";

export type RoleRealignmentEventTypeV1 =
  | "request_created"
  | "candidate_admitted"
  | "evaluation_recorded"
  | "candidate_selected"
  | "selection_certified"
  | "activation_started"
  | "activation_completed"
  | "session_rebound"
  | "expired"
  | "failed";

export interface RoleRealignmentScoringWeightsV1 {
  readonly roleFitBps: number;
  readonly missionContributionBps: number;
  readonly uncertaintyPenaltyBps: number;
  readonly transitionRiskPenaltyBps: number;
}

export interface RoleRealignmentThresholdsV1 {
  readonly minimumRoleFitBps: number;
  readonly minimumMissionContributionBps: number;
  readonly maximumUncertaintyBps: number;
  readonly maximumTransitionRiskBps: number;
}

export interface RoleRealignmentLimitsV1 {
  readonly maximumProposers: number;
  readonly maximumCandidates: number;
  readonly maximumEvaluationsPerCandidate: number;
  readonly maximumReasonCodes: number;
  readonly maximumEvidenceReferences: number;
  readonly maximumCapabilities: number;
  readonly maximumResourceClasses: number;
  readonly maximumInstructions: number;
  readonly maximumInstructionBytes: number;
  readonly maximumConstraintsBytes: number;
  readonly maximumRequestTtlMs: number;
  readonly maximumEvaluationTtlMs: number;
  readonly maximumCertificationTtlMs: number;
  readonly maximumRetainedEvents: number;
  readonly maximumStateBytes: number;
}

export interface RoleRealignmentPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly parentPolicyDigest: string | null;
  readonly minimumIndependentEvaluations: number;
  readonly minimumCertificationWitnesses: number;
  readonly thresholds: RoleRealignmentThresholdsV1;
  readonly scoringWeights: RoleRealignmentScoringWeightsV1;
  readonly limits: RoleRealignmentLimitsV1;
}

export interface RoleRealignmentPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: RoleRealignmentPolicyV1;
  readonly policyDigest: string;
}

/** Descriptive ceiling copied from current authority; never effect authority. */
export interface RoleAuthorityCeilingV1 {
  readonly schemaVersion: 1;
  readonly mandateDigest: string;
  readonly capabilityKeys: readonly string[];
  readonly resourceClasses: readonly string[];
  readonly maximumActionBudgetUnits: number;
  readonly validUntilLogicalMs: number;
  readonly ceilingDigest: string;
}

/** Trusted local catalog record. Peer proposals never contain this content. */
export interface TrustedRoleDefinitionV1 {
  readonly schemaVersion: 1;
  readonly catalogId: string;
  readonly definitionId: string;
  readonly definitionRevision: number;
  readonly predecessorDefinitionDigest: string | null;
  readonly roleKey: string;
  readonly instructions: readonly string[];
  readonly constraints: JsonObject;
  readonly requiredCapabilityKeys: readonly string[];
  readonly requiredResourceClasses: readonly string[];
  readonly maximumActionBudgetUnits: number;
  readonly validFromLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly definitionDigest: string;
}

export interface RoleRealignmentRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly objectiveId: string;
  readonly alignmentControllerId: string;
  readonly alignmentControllerVersion: number;
  readonly alignmentImplementationId: string;
  readonly alignmentPolicyDigest: string;
  readonly alignmentStateRevision: number;
  readonly alignmentStateDigest: string;
  readonly triggerEventDigest: string;
  readonly currentRoleAnchorDigest: string;
  readonly currentRoleBindingId: string;
  readonly currentRoleRevision: number;
  readonly currentRoleContentDigest: string;
  readonly authorityCeiling: RoleAuthorityCeilingV1;
  readonly createdAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly requestDigest: string;
}

/** Content-free proposal from a local or peer discovery strategy. */
export interface RoleCandidateProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly requestDigest: string;
  readonly proposerId: string;
  readonly proposerVersion: number;
  readonly proposerBindingDigest: string;
  readonly definitionId: string;
  readonly definitionRevision: number;
  readonly definitionDigest: string;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly proposalDigest: string;
}

export interface AdmittedRoleCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly requestDigest: string;
  readonly proposal: RoleCandidateProposalV1;
  readonly proposerEligibilityDecisionDigest: string;
  readonly catalogId: string;
  readonly admittedAtLogicalMs: number;
  readonly candidateDigest: string;
}

export interface RoleCandidateEvaluationV1 {
  readonly schemaVersion: 1;
  readonly evaluationId: string;
  readonly requestDigest: string;
  readonly candidateDigest: string;
  readonly definitionDigest: string;
  readonly evaluatorId: string;
  readonly evaluatorVersion: number;
  readonly evaluatorBindingDigest: string;
  readonly eligibilityDecisionDigest: string;
  readonly eligible: boolean;
  readonly roleFitBps: number;
  readonly missionContributionBps: number;
  readonly uncertaintyBps: number;
  readonly transitionRiskBps: number;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly evaluationDigest: string;
}

export interface RoleCandidateAggregateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly definitionDigest: string;
  readonly eligibleEvaluationDigests: readonly string[];
  readonly meanRoleFitBps: number;
  readonly meanMissionContributionBps: number;
  readonly meanUncertaintyBps: number;
  readonly meanTransitionRiskBps: number;
  readonly aggregateScore: number;
}

export interface RoleRealignmentSelectionV1 {
  readonly schemaVersion: 1;
  readonly selectionId: string;
  readonly requestDigest: string;
  readonly stateRevision: number;
  readonly aggregates: readonly RoleCandidateAggregateV1[];
  readonly selectedCandidateId: string;
  readonly selectedCandidateDigest: string;
  readonly selectedDefinitionDigest: string;
  readonly selectedAtLogicalMs: number;
  readonly selectionDigest: string;
}

export type RoleRealignmentCertificationKindV1 =
  "local_policy" | "collective_agreement";

export interface RoleRealignmentCertificateV1 {
  readonly schemaVersion: 1;
  readonly certificateId: string;
  readonly certificationKind: RoleRealignmentCertificationKindV1;
  readonly certifierId: string;
  readonly certifierVersion: number;
  readonly certifierBindingDigest: string;
  readonly requestDigest: string;
  readonly selectionDigest: string;
  readonly selectedCandidateDigest: string;
  readonly selectedDefinitionDigest: string;
  readonly authorityCeilingDigest: string;
  readonly witnessIds: readonly string[];
  readonly membershipEpoch: number | null;
  readonly membershipConfigurationDigest: string | null;
  readonly sourceCertificateDigest: string;
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly certificateDigest: string;
}

export interface RoleRealignmentActivationV1 {
  readonly schemaVersion: 1;
  readonly activationId: string;
  readonly requestDigest: string;
  readonly selectionDigest: string;
  readonly certificateDigest: string;
  readonly definition: TrustedRoleDefinitionV1;
  readonly roleBinding: PortableAgentRoleBindingV1;
  readonly roleBindingDigest: string;
  readonly startedAtLogicalMs: number;
  readonly completedAtLogicalMs: number | null;
  readonly runtimeSessionRevision: number | null;
  readonly alignmentStateRevision: number | null;
  readonly alignmentRoleAnchorDigest: string | null;
  readonly activationDigest: string;
}

export interface RoleRealignmentEventV1 {
  readonly schemaVersion: 1;
  readonly eventSequence: number;
  readonly eventType: RoleRealignmentEventTypeV1;
  readonly inputDigest: string;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
  readonly previousEventDigest: string | null;
  readonly eventDigest: string;
}

export interface RoleRealignmentStateV1 {
  readonly schemaVersion: 1;
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly originSessionId: string;
  readonly activeSessionId: string;
  readonly originAgentId: string;
  readonly activeAgentId: string;
  readonly activeRoleAnchorDigest: string;
  readonly tenantId: string;
  readonly objectiveId: string;
  readonly request: RoleRealignmentRequestV1;
  readonly status: RoleRealignmentStateStatusV1;
  readonly revision: number;
  readonly candidates: readonly AdmittedRoleCandidateV1[];
  readonly evaluations: readonly RoleCandidateEvaluationV1[];
  readonly selection: RoleRealignmentSelectionV1 | null;
  readonly certificate: RoleRealignmentCertificateV1 | null;
  readonly activation: RoleRealignmentActivationV1 | null;
  readonly lastLogicalTimeMs: number;
  readonly lastEventDigest: string;
  readonly events: readonly RoleRealignmentEventV1[];
  readonly stateDigest: string;
}

export interface RoleRealignmentTransitionV1 {
  readonly state: RoleRealignmentStateV1;
  readonly event: RoleRealignmentEventV1;
}

/** Pluggable certification boundary; agreement is optional and policy-owned. */
export interface RoleRealignmentCertificationPortV1 {
  certify(input: {
    readonly state: RoleRealignmentStateV1;
    readonly policy: RoleRealignmentPolicyV1;
    readonly logicalTimeMs: number;
    readonly expiresAtLogicalMs: number;
    readonly signal?: AbortSignal;
  }):
    | Promise<RoleRealignmentCertificateV1 | null>
    | RoleRealignmentCertificateV1
    | null;
}

const encoder = new TextEncoder();
const statuses: readonly RoleRealignmentStateStatusV1[] = [
  "requested",
  "collecting",
  "selected",
  "certified",
  "activating",
  "activated",
  "expired",
  "failed",
];
const eventTypes: readonly RoleRealignmentEventTypeV1[] = [
  "request_created",
  "candidate_admitted",
  "evaluation_recorded",
  "candidate_selected",
  "selection_certified",
  "activation_started",
  "activation_completed",
  "session_rebound",
  "expired",
  "failed",
];
const certificationKinds: readonly RoleRealignmentCertificationKindV1[] = [
  "local_policy",
  "collective_agreement",
];

export function digestRoleRealignmentJsonV1(
  domain:
    | "policy"
    | "authority"
    | "definition"
    | "request"
    | "proposal"
    | "candidate"
    | "evaluation"
    | "selection"
    | "certificate"
    | "role_binding"
    | "activation"
    | "event"
    | "state"
    | "handoff",
  value: JsonValue,
): string {
  return `sha256:${sha256Hex(
    encoder.encode(
      `agentplat.inference-control/role-realignment/${domain}/v1\0${canonicalizeControlJsonV1(value)}`,
    ),
  )}`;
}

export function createRoleRealignmentPolicyRecordV1(
  input: RoleRealignmentPolicyV1,
): RoleRealignmentPolicyRecordV1 {
  const policy = validateRoleRealignmentPolicyV1(input);
  return deepFreeze({
    schemaVersion: 1,
    policy,
    policyDigest: digestRoleRealignmentJsonV1(
      "policy",
      policy as unknown as JsonValue,
    ),
  });
}

export function validateRoleRealignmentPolicyV1(
  input: RoleRealignmentPolicyV1,
): RoleRealignmentPolicyV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "policyId",
      "policyVersion",
      "parentPolicyDigest",
      "minimumIndependentEvaluations",
      "minimumCertificationWitnesses",
      "thresholds",
      "scoringWeights",
      "limits",
    ],
    "role realignment policy",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_realignment_policy_invalid");
  assertIdentifier(input.policyId, "policyId");
  assertSafeInteger(input.policyVersion, "policyVersion", 1);
  if (input.parentPolicyDigest !== null)
    assertDigest(input.parentPolicyDigest, "parentPolicyDigest");
  assertSafeInteger(
    input.minimumIndependentEvaluations,
    "minimumIndependentEvaluations",
    1,
  );
  assertSafeInteger(
    input.minimumCertificationWitnesses,
    "minimumCertificationWitnesses",
    1,
  );
  validateThresholds(input.thresholds);
  validateWeights(input.scoringWeights);
  validateLimits(input.limits);
  if (
    input.minimumIndependentEvaluations >
      input.limits.maximumEvaluationsPerCandidate ||
    input.minimumCertificationWitnesses > 128
  )
    throw new TypeError("role_realignment_policy_limits_invalid");
  return freezeClone(input);
}

export function createRoleAuthorityCeilingV1(input: {
  readonly mandateDigest: string;
  readonly capabilityKeys: readonly string[];
  readonly resourceClasses: readonly string[];
  readonly maximumActionBudgetUnits: number;
  readonly validUntilLogicalMs: number;
}): RoleAuthorityCeilingV1 {
  const withoutDigest = normalizeAuthorityCeiling(input);
  return deepFreeze({
    ...withoutDigest,
    ceilingDigest: digestRoleRealignmentJsonV1(
      "authority",
      withoutDigest as unknown as JsonValue,
    ),
  });
}

export function validateRoleAuthorityCeilingV1(
  input: RoleAuthorityCeilingV1,
  policy?: RoleRealignmentPolicyV1,
): RoleAuthorityCeilingV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "mandateDigest",
      "capabilityKeys",
      "resourceClasses",
      "maximumActionBudgetUnits",
      "validUntilLogicalMs",
      "ceilingDigest",
    ],
    "role authority ceiling",
  );
  const { ceilingDigest, ...body } = input;
  assertDigest(ceilingDigest, "ceilingDigest");
  const normalized = normalizeAuthorityCeiling(body);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRealignmentJsonV1("authority", body as unknown as JsonValue) !==
      ceilingDigest
  )
    throw new TypeError("role_authority_ceiling_invalid");
  if (
    policy &&
    (input.capabilityKeys.length > policy.limits.maximumCapabilities ||
      input.resourceClasses.length > policy.limits.maximumResourceClasses)
  )
    throw new TypeError("role_realignment_capacity_exhausted");
  return freezeClone(input);
}

export function createTrustedRoleDefinitionV1(
  input: Omit<TrustedRoleDefinitionV1, "schemaVersion" | "definitionDigest">,
): TrustedRoleDefinitionV1 {
  const body = normalizeRoleDefinition({ schemaVersion: 1, ...input });
  return deepFreeze({
    ...body,
    definitionDigest: digestRoleRealignmentJsonV1(
      "definition",
      body as unknown as JsonValue,
    ),
  });
}

export function validateTrustedRoleDefinitionV1(
  input: TrustedRoleDefinitionV1,
  policy: RoleRealignmentPolicyV1,
): TrustedRoleDefinitionV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "catalogId",
      "definitionId",
      "definitionRevision",
      "predecessorDefinitionDigest",
      "roleKey",
      "instructions",
      "constraints",
      "requiredCapabilityKeys",
      "requiredResourceClasses",
      "maximumActionBudgetUnits",
      "validFromLogicalMs",
      "validUntilLogicalMs",
      "definitionDigest",
    ],
    "trusted role definition",
  );
  const { definitionDigest, ...body } = input;
  assertDigest(definitionDigest, "definitionDigest");
  const normalized = normalizeRoleDefinition(body);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    digestRoleRealignmentJsonV1("definition", body as unknown as JsonValue) !==
      definitionDigest
  )
    throw new TypeError("role_definition_invalid");
  if (
    input.instructions.length > policy.limits.maximumInstructions ||
    input.instructions.some(
      (value) => utf8ByteLength(value) > policy.limits.maximumInstructionBytes,
    ) ||
    input.requiredCapabilityKeys.length > policy.limits.maximumCapabilities ||
    input.requiredResourceClasses.length >
      policy.limits.maximumResourceClasses ||
    utf8ByteLength(canonicalizeControlJsonV1(input.constraints)) >
      policy.limits.maximumConstraintsBytes
  )
    throw new TypeError("role_realignment_capacity_exhausted");
  return freezeClone(input);
}

export function createRoleRealignmentRequestV1(input: {
  readonly requestId: string;
  readonly policy: RoleRealignmentPolicyV1;
  readonly alignmentPolicy: RoleAlignmentPolicyV1;
  readonly alignmentState: RoleAlignmentStateV1;
  readonly authorityCeiling: RoleAuthorityCeilingV1;
  readonly createdAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}): RoleRealignmentRequestV1 {
  assertIdentifier(input.requestId, "requestId");
  const policyRecord = createRoleRealignmentPolicyRecordV1(input.policy);
  assertRoleAlignmentStateV1(input.alignmentState, input.alignmentPolicy);
  if (
    input.alignmentState.status !== "realignment_required" ||
    input.alignmentState.lastEventDigest === null
  )
    throw new TypeError("role_realignment_not_required");
  const authorityCeiling = validateRoleAuthorityCeilingV1(
    input.authorityCeiling,
    policyRecord.policy,
  );
  assertSafeInteger(input.createdAtLogicalMs, "createdAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs", 1);
  if (
    input.createdAtLogicalMs < input.alignmentState.lastLogicalTimeMs ||
    input.expiresAtLogicalMs <= input.createdAtLogicalMs ||
    input.expiresAtLogicalMs - input.createdAtLogicalMs >
      policyRecord.policy.limits.maximumRequestTtlMs ||
    input.expiresAtLogicalMs > authorityCeiling.validUntilLogicalMs
  )
    throw new TypeError("role_realignment_request_lifetime_invalid");
  const state = input.alignmentState;
  const body = {
    schemaVersion: 1 as const,
    requestId: input.requestId,
    policyId: policyRecord.policy.policyId,
    policyVersion: policyRecord.policy.policyVersion,
    policyDigest: policyRecord.policyDigest,
    tenantId: state.tenantId,
    sessionId: state.sessionId,
    agentId: state.agentId,
    objectiveId: state.objectiveId,
    alignmentControllerId: state.controllerId,
    alignmentControllerVersion: state.controllerVersion,
    alignmentImplementationId: state.implementationId,
    alignmentPolicyDigest: state.policyDigest,
    alignmentStateRevision: state.revision,
    alignmentStateDigest: state.stateDigest,
    triggerEventDigest: state.lastEventDigest as string,
    currentRoleAnchorDigest: state.roleAnchor.anchorDigest,
    currentRoleBindingId: state.roleAnchor.roleBindingId,
    currentRoleRevision: state.roleAnchor.roleRevision,
    currentRoleContentDigest: state.roleAnchor.roleContentDigest,
    authorityCeiling,
    createdAtLogicalMs: input.createdAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  };
  return deepFreeze({
    ...body,
    requestDigest: digestRoleRealignmentJsonV1(
      "request",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRealignmentRequestV1(
  input: RoleRealignmentRequestV1,
  policy: RoleRealignmentPolicyV1,
): RoleRealignmentRequestV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "requestId",
      "policyId",
      "policyVersion",
      "policyDigest",
      "tenantId",
      "sessionId",
      "agentId",
      "objectiveId",
      "alignmentControllerId",
      "alignmentControllerVersion",
      "alignmentImplementationId",
      "alignmentPolicyDigest",
      "alignmentStateRevision",
      "alignmentStateDigest",
      "triggerEventDigest",
      "currentRoleAnchorDigest",
      "currentRoleBindingId",
      "currentRoleRevision",
      "currentRoleContentDigest",
      "authorityCeiling",
      "createdAtLogicalMs",
      "expiresAtLogicalMs",
      "requestDigest",
    ],
    "role realignment request",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_realignment_request_invalid");
  for (const [label, value] of [
    ["requestId", input.requestId],
    ["tenantId", input.tenantId],
    ["sessionId", input.sessionId],
    ["agentId", input.agentId],
    ["objectiveId", input.objectiveId],
    ["alignmentControllerId", input.alignmentControllerId],
    ["alignmentImplementationId", input.alignmentImplementationId],
    ["currentRoleBindingId", input.currentRoleBindingId],
  ] as const)
    assertIdentifier(value, label);
  for (const [label, value] of [
    ["policyVersion", input.policyVersion],
    ["alignmentControllerVersion", input.alignmentControllerVersion],
    ["alignmentStateRevision", input.alignmentStateRevision],
    ["currentRoleRevision", input.currentRoleRevision],
    ["createdAtLogicalMs", input.createdAtLogicalMs],
    ["expiresAtLogicalMs", input.expiresAtLogicalMs],
  ] as const)
    assertSafeInteger(value, label, label === "createdAtLogicalMs" ? 0 : 1);
  for (const [label, value] of [
    ["policyDigest", input.policyDigest],
    ["alignmentPolicyDigest", input.alignmentPolicyDigest],
    ["alignmentStateDigest", input.alignmentStateDigest],
    ["triggerEventDigest", input.triggerEventDigest],
    ["currentRoleAnchorDigest", input.currentRoleAnchorDigest],
    ["currentRoleContentDigest", input.currentRoleContentDigest],
    ["requestDigest", input.requestDigest],
  ] as const)
    assertDigest(value, label);
  const policyRecord = createRoleRealignmentPolicyRecordV1(policy);
  validateRoleAuthorityCeilingV1(input.authorityCeiling, policyRecord.policy);
  const { requestDigest, ...body } = input;
  if (
    input.policyId !== policyRecord.policy.policyId ||
    input.policyVersion !== policyRecord.policy.policyVersion ||
    input.policyDigest !== policyRecord.policyDigest ||
    input.expiresAtLogicalMs <= input.createdAtLogicalMs ||
    input.expiresAtLogicalMs - input.createdAtLogicalMs >
      policyRecord.policy.limits.maximumRequestTtlMs ||
    input.expiresAtLogicalMs > input.authorityCeiling.validUntilLogicalMs ||
    digestRoleRealignmentJsonV1("request", body as unknown as JsonValue) !==
      requestDigest
  )
    throw new TypeError("role_realignment_request_invalid");
  return freezeClone(input);
}

export function createRoleCandidateProposalV1(
  input: Omit<RoleCandidateProposalV1, "schemaVersion" | "proposalDigest">,
): RoleCandidateProposalV1 {
  const body = normalizeProposal({ schemaVersion: 1, ...input });
  return deepFreeze({
    ...body,
    proposalDigest: digestRoleRealignmentJsonV1(
      "proposal",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleCandidateProposalV1(
  input: RoleCandidateProposalV1,
  request: RoleRealignmentRequestV1,
  policy: RoleRealignmentPolicyV1,
): RoleCandidateProposalV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "proposalId",
      "requestDigest",
      "proposerId",
      "proposerVersion",
      "proposerBindingDigest",
      "definitionId",
      "definitionRevision",
      "definitionDigest",
      "reasonCodes",
      "evidenceReferenceIds",
      "proposedAtLogicalMs",
      "expiresAtLogicalMs",
      "proposalDigest",
    ],
    "role candidate proposal",
  );
  const { proposalDigest, ...body } = input;
  assertDigest(proposalDigest, "proposalDigest");
  const normalized = normalizeProposal(body);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    input.requestDigest !== request.requestDigest ||
    input.proposedAtLogicalMs < request.createdAtLogicalMs ||
    input.expiresAtLogicalMs > request.expiresAtLogicalMs ||
    input.reasonCodes.length > policy.limits.maximumReasonCodes ||
    input.evidenceReferenceIds.length >
      policy.limits.maximumEvidenceReferences ||
    digestRoleRealignmentJsonV1("proposal", body as unknown as JsonValue) !==
      proposalDigest
  )
    throw new TypeError("role_candidate_proposal_invalid");
  return freezeClone(input);
}

export function createRoleCandidateEvaluationV1(
  input: Omit<RoleCandidateEvaluationV1, "schemaVersion" | "evaluationDigest">,
): RoleCandidateEvaluationV1 {
  const body = normalizeEvaluation({ schemaVersion: 1, ...input });
  return deepFreeze({
    ...body,
    evaluationDigest: digestRoleRealignmentJsonV1(
      "evaluation",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleCandidateEvaluationV1(
  input: RoleCandidateEvaluationV1,
  state: RoleRealignmentStateV1,
  policy: RoleRealignmentPolicyV1,
): RoleCandidateEvaluationV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "evaluationId",
      "requestDigest",
      "candidateDigest",
      "definitionDigest",
      "evaluatorId",
      "evaluatorVersion",
      "evaluatorBindingDigest",
      "eligibilityDecisionDigest",
      "eligible",
      "roleFitBps",
      "missionContributionBps",
      "uncertaintyBps",
      "transitionRiskBps",
      "reasonCodes",
      "evidenceReferenceIds",
      "evaluatedAtLogicalMs",
      "expiresAtLogicalMs",
      "evaluationDigest",
    ],
    "role candidate evaluation",
  );
  const { evaluationDigest, ...body } = input;
  assertDigest(evaluationDigest, "evaluationDigest");
  const normalized = normalizeEvaluation(body);
  const candidate = state.candidates.find(
    (item) => item.candidateDigest === input.candidateDigest,
  );
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    !candidate ||
    input.requestDigest !== state.request.requestDigest ||
    input.definitionDigest !== candidate.proposal.definitionDigest ||
    input.evaluatedAtLogicalMs < candidate.admittedAtLogicalMs ||
    input.expiresAtLogicalMs > state.request.expiresAtLogicalMs ||
    input.expiresAtLogicalMs - input.evaluatedAtLogicalMs >
      policy.limits.maximumEvaluationTtlMs ||
    input.reasonCodes.length > policy.limits.maximumReasonCodes ||
    input.evidenceReferenceIds.length >
      policy.limits.maximumEvidenceReferences ||
    digestRoleRealignmentJsonV1("evaluation", body as unknown as JsonValue) !==
      evaluationDigest
  )
    throw new TypeError("role_candidate_evaluation_invalid");
  return freezeClone(input);
}

export function createRoleRealignmentStateV1(input: {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policy: RoleRealignmentPolicyV1;
  readonly request: RoleRealignmentRequestV1;
  readonly createdAtLogicalMs: number;
}): RoleRealignmentStateV1 {
  assertIdentifier(input.controllerId, "controllerId");
  assertSafeInteger(input.controllerVersion, "controllerVersion", 1);
  assertIdentifier(input.implementationId, "implementationId");
  const policyRecord = createRoleRealignmentPolicyRecordV1(input.policy);
  const request = validateRoleRealignmentRequestV1(
    input.request,
    policyRecord.policy,
  );
  assertSafeInteger(input.createdAtLogicalMs, "createdAtLogicalMs");
  if (
    input.createdAtLogicalMs < request.createdAtLogicalMs ||
    input.createdAtLogicalMs >= request.expiresAtLogicalMs
  )
    throw new TypeError("role_realignment_request_expired");
  const event = createRoleRealignmentEventV1({
    eventSequence: 1,
    eventType: "request_created",
    inputDigest: request.requestDigest,
    reasonCode: "role_realignment_requested",
    logicalTimeMs: input.createdAtLogicalMs,
    previousEventDigest: null,
  });
  const state = withRoleRealignmentStateDigestV1({
    schemaVersion: 1,
    controllerId: input.controllerId,
    controllerVersion: input.controllerVersion,
    implementationId: input.implementationId,
    policyId: policyRecord.policy.policyId,
    policyVersion: policyRecord.policy.policyVersion,
    policyDigest: policyRecord.policyDigest,
    originSessionId: request.sessionId,
    activeSessionId: request.sessionId,
    originAgentId: request.agentId,
    activeAgentId: request.agentId,
    activeRoleAnchorDigest: request.currentRoleAnchorDigest,
    tenantId: request.tenantId,
    objectiveId: request.objectiveId,
    request,
    status: "requested",
    revision: 1,
    candidates: [],
    evaluations: [],
    selection: null,
    certificate: null,
    activation: null,
    lastLogicalTimeMs: input.createdAtLogicalMs,
    lastEventDigest: event.eventDigest,
    events: [event],
  });
  ensureRoleRealignmentStateCapacityV1(state, policyRecord.policy);
  return state;
}

export function admitRoleCandidateV1(
  stateInput: RoleRealignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly proposal: RoleCandidateProposalV1;
    readonly proposerEligibilityDecisionDigest: string;
    readonly definition: TrustedRoleDefinitionV1;
    readonly logicalTimeMs: number;
  },
  policyInput: RoleRealignmentPolicyV1,
): RoleRealignmentTransitionV1 {
  const policy = assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentRevisionV1(state, input.expectedRevision);
  requireRoleRealignmentOpenV1(state, ["requested", "collecting"]);
  requireRoleRealignmentTimeV1(state, input.logicalTimeMs);
  const proposal = validateRoleCandidateProposalV1(
    input.proposal,
    state.request,
    policy,
  );
  assertDigest(
    input.proposerEligibilityDecisionDigest,
    "proposerEligibilityDecisionDigest",
  );
  const definition = validateTrustedRoleDefinitionV1(input.definition, policy);
  if (
    proposal.definitionId !== definition.definitionId ||
    proposal.definitionRevision !== definition.definitionRevision ||
    proposal.definitionDigest !== definition.definitionDigest ||
    proposal.expiresAtLogicalMs <= input.logicalTimeMs ||
    definition.validFromLogicalMs > input.logicalTimeMs ||
    definition.validUntilLogicalMs <= input.logicalTimeMs
  )
    throw new TypeError("role_candidate_definition_binding_invalid");
  assertTrustedRoleDefinitionWithinAuthorityCeilingV1(
    definition,
    state.request.authorityCeiling,
  );
  if (
    state.candidates.some(
      ({ proposal: admitted }) =>
        admitted.proposalId === proposal.proposalId ||
        admitted.proposalDigest === proposal.proposalDigest,
    )
  )
    throw new TypeError("role_candidate_proposal_already_admitted");
  if (
    state.candidates.some(
      ({ proposal: admitted }) =>
        admitted.definitionDigest === definition.definitionDigest,
    )
  )
    throw new TypeError("role_candidate_definition_already_admitted");
  const proposerBindings = new Set(
    state.candidates.map(({ proposal: item }) => item.proposerBindingDigest),
  );
  proposerBindings.add(proposal.proposerBindingDigest);
  if (
    state.candidates.length >= policy.limits.maximumCandidates ||
    proposerBindings.size > policy.limits.maximumProposers
  )
    throw new TypeError("role_realignment_capacity_exhausted");
  const candidateBody = {
    schemaVersion: 1 as const,
    candidateId: `candidate-${proposal.proposalDigest.slice(7, 39)}`,
    requestDigest: state.request.requestDigest,
    proposal,
    proposerEligibilityDecisionDigest: input.proposerEligibilityDecisionDigest,
    catalogId: definition.catalogId,
    admittedAtLogicalMs: input.logicalTimeMs,
  };
  const candidate = deepFreeze({
    ...candidateBody,
    candidateDigest: digestRoleRealignmentJsonV1(
      "candidate",
      candidateBody as unknown as JsonValue,
    ),
  });
  const candidates = [...state.candidates, candidate].sort((left, right) =>
    compareCodeUnits(left.candidateDigest, right.candidateDigest),
  );
  return transitionRoleRealignmentStateV1({
    state,
    policy,
    eventType: "candidate_admitted",
    inputDigest: candidate.candidateDigest,
    reasonCode: "trusted_role_candidate_admitted",
    logicalTimeMs: input.logicalTimeMs,
    patch: { status: "collecting", candidates },
  });
}

export function recordRoleCandidateEvaluationV1(
  stateInput: RoleRealignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly evaluation: RoleCandidateEvaluationV1;
    readonly logicalTimeMs: number;
  },
  policyInput: RoleRealignmentPolicyV1,
): RoleRealignmentTransitionV1 {
  const policy = assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentRevisionV1(state, input.expectedRevision);
  requireRoleRealignmentOpenV1(state, ["collecting"]);
  requireRoleRealignmentTimeV1(state, input.logicalTimeMs);
  const evaluation = validateRoleCandidateEvaluationV1(
    input.evaluation,
    state,
    policy,
  );
  if (
    evaluation.evaluatedAtLogicalMs > input.logicalTimeMs ||
    evaluation.expiresAtLogicalMs <= input.logicalTimeMs
  )
    throw new TypeError("role_candidate_evaluation_expired");
  const forCandidate = state.evaluations.filter(
    ({ candidateDigest }) => candidateDigest === evaluation.candidateDigest,
  );
  if (
    state.evaluations.some(
      ({ evaluationId, evaluationDigest }) =>
        evaluationId === evaluation.evaluationId ||
        evaluationDigest === evaluation.evaluationDigest,
    ) ||
    forCandidate.some(
      ({ evaluatorBindingDigest }) =>
        evaluatorBindingDigest === evaluation.evaluatorBindingDigest,
    )
  )
    throw new TypeError("role_candidate_evaluation_already_recorded");
  if (forCandidate.length >= policy.limits.maximumEvaluationsPerCandidate)
    throw new TypeError("role_realignment_capacity_exhausted");
  const evaluations = [...state.evaluations, evaluation].sort((left, right) =>
    compareCodeUnits(left.evaluationDigest, right.evaluationDigest),
  );
  return transitionRoleRealignmentStateV1({
    state,
    policy,
    eventType: "evaluation_recorded",
    inputDigest: evaluation.evaluationDigest,
    reasonCode: evaluation.eligible
      ? "candidate_evaluation_eligible"
      : "candidate_evaluation_ineligible",
    logicalTimeMs: input.logicalTimeMs,
    patch: { evaluations },
  });
}

export function selectRoleCandidateV1(
  stateInput: RoleRealignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly selectionId: string;
    readonly logicalTimeMs: number;
  },
  policyInput: RoleRealignmentPolicyV1,
): RoleRealignmentTransitionV1 {
  const policy = assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentRevisionV1(state, input.expectedRevision);
  requireRoleRealignmentOpenV1(state, ["collecting"]);
  requireRoleRealignmentTimeV1(state, input.logicalTimeMs);
  assertIdentifier(input.selectionId, "selectionId");
  const aggregates = state.candidates
    .map((candidate) =>
      aggregateRoleCandidateV1(
        candidate,
        state.evaluations,
        policy,
        input.logicalTimeMs,
      ),
    )
    .filter((item): item is RoleCandidateAggregateV1 => item !== null)
    .sort((left, right) =>
      compareCodeUnits(left.candidateDigest, right.candidateDigest),
    );
  if (!aggregates.length)
    throw new TypeError("role_realignment_no_eligible_candidate");
  const ranked = [...aggregates].sort(
    (left, right) =>
      right.aggregateScore - left.aggregateScore ||
      compareCodeUnits(left.definitionDigest, right.definitionDigest) ||
      compareCodeUnits(left.candidateDigest, right.candidateDigest),
  );
  const selected = ranked[0]!;
  const body = {
    schemaVersion: 1 as const,
    selectionId: input.selectionId,
    requestDigest: state.request.requestDigest,
    stateRevision: state.revision,
    aggregates,
    selectedCandidateId: selected.candidateId,
    selectedCandidateDigest: selected.candidateDigest,
    selectedDefinitionDigest: selected.definitionDigest,
    selectedAtLogicalMs: input.logicalTimeMs,
  };
  const selection = deepFreeze({
    ...body,
    selectionDigest: digestRoleRealignmentJsonV1(
      "selection",
      body as unknown as JsonValue,
    ),
  });
  return transitionRoleRealignmentStateV1({
    state,
    policy,
    eventType: "candidate_selected",
    inputDigest: selection.selectionDigest,
    reasonCode: "candidate_selected_deterministically",
    logicalTimeMs: input.logicalTimeMs,
    patch: { status: "selected", selection },
  });
}

export function createRoleRealignmentCertificateV1(
  input: Omit<
    RoleRealignmentCertificateV1,
    "schemaVersion" | "certificateDigest"
  >,
): RoleRealignmentCertificateV1 {
  const body = normalizeCertificate({ schemaVersion: 1, ...input });
  return deepFreeze({
    ...body,
    certificateDigest: digestRoleRealignmentJsonV1(
      "certificate",
      body as unknown as JsonValue,
    ),
  });
}

export function validateRoleRealignmentCertificateV1(
  input: RoleRealignmentCertificateV1,
  state: RoleRealignmentStateV1,
  policy: RoleRealignmentPolicyV1,
): RoleRealignmentCertificateV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "certificateId",
      "certificationKind",
      "certifierId",
      "certifierVersion",
      "certifierBindingDigest",
      "requestDigest",
      "selectionDigest",
      "selectedCandidateDigest",
      "selectedDefinitionDigest",
      "authorityCeilingDigest",
      "witnessIds",
      "membershipEpoch",
      "membershipConfigurationDigest",
      "sourceCertificateDigest",
      "certifiedAtLogicalMs",
      "expiresAtLogicalMs",
      "certificateDigest",
    ],
    "role realignment certificate",
  );
  if (!state.selection)
    throw new TypeError("role_realignment_selection_required");
  const { certificateDigest, ...body } = input;
  assertDigest(certificateDigest, "certificateDigest");
  const normalized = normalizeCertificate(body);
  if (
    canonicalizeControlJsonV1(normalized as unknown as JsonValue) !==
      canonicalizeControlJsonV1(body as unknown as JsonValue) ||
    input.requestDigest !== state.request.requestDigest ||
    input.selectionDigest !== state.selection.selectionDigest ||
    input.selectedCandidateDigest !== state.selection.selectedCandidateDigest ||
    input.selectedDefinitionDigest !==
      state.selection.selectedDefinitionDigest ||
    input.authorityCeilingDigest !==
      state.request.authorityCeiling.ceilingDigest ||
    input.witnessIds.length < policy.minimumCertificationWitnesses ||
    input.certifiedAtLogicalMs < state.selection.selectedAtLogicalMs ||
    input.expiresAtLogicalMs > state.request.expiresAtLogicalMs ||
    input.expiresAtLogicalMs - input.certifiedAtLogicalMs >
      policy.limits.maximumCertificationTtlMs ||
    digestRoleRealignmentJsonV1("certificate", body as unknown as JsonValue) !==
      certificateDigest
  )
    throw new TypeError("role_realignment_certificate_invalid");
  return freezeClone(input);
}

export function certifyRoleRealignmentSelectionV1(
  stateInput: RoleRealignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly certificate: RoleRealignmentCertificateV1;
    readonly logicalTimeMs: number;
  },
  policyInput: RoleRealignmentPolicyV1,
): RoleRealignmentTransitionV1 {
  const policy = assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentRevisionV1(state, input.expectedRevision);
  requireRoleRealignmentOpenV1(state, ["selected"]);
  requireRoleRealignmentTimeV1(state, input.logicalTimeMs);
  const certificate = validateRoleRealignmentCertificateV1(
    input.certificate,
    state,
    policy,
  );
  if (
    certificate.certifiedAtLogicalMs > input.logicalTimeMs ||
    certificate.expiresAtLogicalMs <= input.logicalTimeMs
  )
    throw new TypeError("role_realignment_certificate_expired");
  return transitionRoleRealignmentStateV1({
    state,
    policy,
    eventType: "selection_certified",
    inputDigest: certificate.certificateDigest,
    reasonCode: "selection_certified",
    logicalTimeMs: input.logicalTimeMs,
    patch: { status: "certified", certificate },
  });
}

export function materializeCertifiedRoleBindingV1(
  stateInput: RoleRealignmentStateV1,
  input: {
    readonly logicalTimeMs: number;
    readonly definition: TrustedRoleDefinitionV1;
  },
  policyInput: RoleRealignmentPolicyV1,
): PortableAgentRoleBindingV1 {
  assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentOpenV1(state, ["certified", "activating"]);
  requireRoleRealignmentTimeV1(state, input.logicalTimeMs);
  if (
    !state.selection ||
    !state.certificate ||
    state.certificate.expiresAtLogicalMs <= input.logicalTimeMs
  )
    throw new TypeError("role_realignment_certificate_expired");
  const candidate = state.candidates.find(
    ({ candidateDigest }) =>
      candidateDigest === state.selection!.selectedCandidateDigest,
  );
  if (!candidate)
    throw new TypeError("role_realignment_selected_candidate_missing");
  const definition = validateTrustedRoleDefinitionV1(
    input.definition,
    policyInput,
  );
  if (
    candidate.catalogId !== definition.catalogId ||
    candidate.proposal.definitionId !== definition.definitionId ||
    candidate.proposal.definitionRevision !== definition.definitionRevision ||
    candidate.proposal.definitionDigest !== definition.definitionDigest ||
    state.selection.selectedDefinitionDigest !== definition.definitionDigest
  )
    throw new TypeError("role_realignment_selected_definition_mismatch");
  assertTrustedRoleDefinitionWithinAuthorityCeilingV1(
    definition,
    state.request.authorityCeiling,
  );
  const validFromLogicalMs = Math.max(
    input.logicalTimeMs,
    definition.validFromLogicalMs,
  );
  const validUntilLogicalMs = Math.min(
    definition.validUntilLogicalMs,
    state.request.expiresAtLogicalMs,
    state.request.authorityCeiling.validUntilLogicalMs,
  );
  if (validUntilLogicalMs <= validFromLogicalMs)
    throw new TypeError("role_realignment_role_expired");
  return normalizeRoleBindingV1({
    schemaVersion: 1,
    roleBindingId: `role-${definition.definitionDigest.slice(7, 39)}`,
    roleRevision: state.request.currentRoleRevision + 1,
    predecessorRoleBindingId: state.request.currentRoleBindingId,
    objectiveId: state.objectiveId,
    roleKey: definition.roleKey,
    instructions: definition.instructions,
    constraints: definition.constraints,
    validFromLogicalMs,
    validUntilLogicalMs,
  });
}

export function beginRoleRealignmentActivationV1(
  stateInput: RoleRealignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly activationId: string;
    readonly definition: TrustedRoleDefinitionV1;
    readonly logicalTimeMs: number;
  },
  policyInput: RoleRealignmentPolicyV1,
): RoleRealignmentTransitionV1 {
  const policy = assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentRevisionV1(state, input.expectedRevision);
  requireRoleRealignmentOpenV1(state, ["certified"]);
  assertIdentifier(input.activationId, "activationId");
  const roleBinding = materializeCertifiedRoleBindingV1(state, input, policy);
  const roleBindingDigest = digestRoleRealignmentJsonV1(
    "role_binding",
    roleBinding as unknown as JsonValue,
  );
  const body = {
    schemaVersion: 1 as const,
    activationId: input.activationId,
    requestDigest: state.request.requestDigest,
    selectionDigest: state.selection!.selectionDigest,
    certificateDigest: state.certificate!.certificateDigest,
    definition: input.definition,
    roleBinding,
    roleBindingDigest,
    startedAtLogicalMs: input.logicalTimeMs,
    completedAtLogicalMs: null,
    runtimeSessionRevision: null,
    alignmentStateRevision: null,
    alignmentRoleAnchorDigest: null,
  };
  const activation = deepFreeze({
    ...body,
    activationDigest: digestRoleRealignmentJsonV1(
      "activation",
      body as unknown as JsonValue,
    ),
  });
  return transitionRoleRealignmentStateV1({
    state,
    policy,
    eventType: "activation_started",
    inputDigest: activation.activationDigest,
    reasonCode: "certified_role_activation_started",
    logicalTimeMs: input.logicalTimeMs,
    patch: { status: "activating", activation },
  });
}

export function completeRoleRealignmentActivationV1(
  stateInput: RoleRealignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly runtimeSessionRevision: number;
    readonly alignmentStateRevision: number;
    readonly alignmentRoleAnchorDigest: string;
    readonly logicalTimeMs: number;
  },
  policyInput: RoleRealignmentPolicyV1,
): RoleRealignmentTransitionV1 {
  const policy = assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentRevisionV1(state, input.expectedRevision);
  requireRoleRealignmentOpenV1(state, ["activating"]);
  requireRoleRealignmentTimeV1(state, input.logicalTimeMs);
  if (!state.activation)
    throw new TypeError("role_realignment_activation_missing");
  assertSafeInteger(input.runtimeSessionRevision, "runtimeSessionRevision", 1);
  assertSafeInteger(input.alignmentStateRevision, "alignmentStateRevision", 1);
  assertDigest(input.alignmentRoleAnchorDigest, "alignmentRoleAnchorDigest");
  const { activationDigest: _ignored, ...previous } = state.activation;
  const body = {
    ...previous,
    completedAtLogicalMs: input.logicalTimeMs,
    runtimeSessionRevision: input.runtimeSessionRevision,
    alignmentStateRevision: input.alignmentStateRevision,
    alignmentRoleAnchorDigest: input.alignmentRoleAnchorDigest,
  };
  const activation = deepFreeze({
    ...body,
    activationDigest: digestRoleRealignmentJsonV1(
      "activation",
      body as unknown as JsonValue,
    ),
  });
  return transitionRoleRealignmentStateV1({
    state,
    policy,
    eventType: "activation_completed",
    inputDigest: activation.activationDigest,
    reasonCode: "certified_role_activated",
    logicalTimeMs: input.logicalTimeMs,
    patch: {
      status: "activated",
      activation,
      activeRoleAnchorDigest: input.alignmentRoleAnchorDigest,
    },
  });
}

export function rebindRoleRealignmentSessionV1(
  stateInput: RoleRealignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly targetSessionId: string;
    readonly targetAgentId: string;
    readonly targetRoleAnchorDigest: string;
    readonly transferDigest: string;
    readonly logicalTimeMs: number;
  },
  policyInput: RoleRealignmentPolicyV1,
): RoleRealignmentTransitionV1 {
  const policy = assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentRevisionV1(state, input.expectedRevision);
  requireRoleRealignmentOpenV1(state, [
    "requested",
    "collecting",
    "selected",
    "certified",
    "activating",
    "activated",
  ]);
  const terminalContinuity = state.status === "activated";
  requireRoleRealignmentTimeV1(state, input.logicalTimeMs, terminalContinuity);
  assertIdentifier(input.targetSessionId, "targetSessionId");
  assertIdentifier(input.targetAgentId, "targetAgentId");
  assertDigest(input.targetRoleAnchorDigest, "targetRoleAnchorDigest");
  assertDigest(input.transferDigest, "transferDigest");
  if (input.targetSessionId === state.activeSessionId)
    throw new TypeError("role_realignment_handoff_invalid");
  return transitionRoleRealignmentStateV1({
    state,
    policy,
    eventType: "session_rebound",
    inputDigest: digestRoleRealignmentJsonV1("handoff", {
      transferDigest: input.transferDigest,
      sourceSessionId: state.activeSessionId,
      targetSessionId: input.targetSessionId,
      targetAgentId: input.targetAgentId,
      targetRoleAnchorDigest: input.targetRoleAnchorDigest,
    }),
    reasonCode: "role_realignment_session_rebound",
    logicalTimeMs: input.logicalTimeMs,
    patch: {
      activeSessionId: input.targetSessionId,
      activeAgentId: input.targetAgentId,
      activeRoleAnchorDigest: input.targetRoleAnchorDigest,
    },
    permitExpiredTime: terminalContinuity,
  });
}

export function expireRoleRealignmentV1(
  stateInput: RoleRealignmentStateV1,
  input: { readonly expectedRevision: number; readonly logicalTimeMs: number },
  policyInput: RoleRealignmentPolicyV1,
): RoleRealignmentTransitionV1 {
  const policy = assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentRevisionV1(state, input.expectedRevision);
  requireRoleRealignmentOpenV1(state, [
    "requested",
    "collecting",
    "selected",
    "certified",
    "activating",
  ]);
  assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
  if (input.logicalTimeMs < state.request.expiresAtLogicalMs)
    throw new TypeError("role_realignment_not_expired");
  return transitionRoleRealignmentStateV1({
    state,
    policy,
    eventType: "expired",
    inputDigest: state.request.requestDigest,
    reasonCode: "role_realignment_expired",
    logicalTimeMs: input.logicalTimeMs,
    patch: { status: "expired" },
    permitExpiredTime: true,
  });
}

export function failRoleRealignmentV1(
  stateInput: RoleRealignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly reasonCode: string;
    readonly failureDigest: string;
    readonly logicalTimeMs: number;
  },
  policyInput: RoleRealignmentPolicyV1,
): RoleRealignmentTransitionV1 {
  const policy = assertRoleRealignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireRoleRealignmentRevisionV1(state, input.expectedRevision);
  requireRoleRealignmentOpenV1(state, [
    "requested",
    "collecting",
    "selected",
    "certified",
    "activating",
  ]);
  requireRoleRealignmentTimeV1(state, input.logicalTimeMs, true);
  assertIdentifier(input.reasonCode, "reasonCode");
  assertDigest(input.failureDigest, "failureDigest");
  return transitionRoleRealignmentStateV1({
    state,
    policy,
    eventType: "failed",
    inputDigest: input.failureDigest,
    reasonCode: input.reasonCode,
    logicalTimeMs: input.logicalTimeMs,
    patch: { status: "failed" },
    permitExpiredTime: true,
  });
}

export function assertRoleRealignmentStateV1(
  input: RoleRealignmentStateV1,
  policyInput: RoleRealignmentPolicyV1,
  binding: {
    readonly controllerId?: string;
    readonly controllerVersion?: number;
    readonly implementationId?: string;
    readonly activeSessionId?: string;
  } = {},
): RoleRealignmentPolicyV1 {
  const policyRecord = createRoleRealignmentPolicyRecordV1(policyInput);
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "controllerId",
      "controllerVersion",
      "implementationId",
      "policyId",
      "policyVersion",
      "policyDigest",
      "originSessionId",
      "activeSessionId",
      "originAgentId",
      "activeAgentId",
      "activeRoleAnchorDigest",
      "tenantId",
      "objectiveId",
      "request",
      "status",
      "revision",
      "candidates",
      "evaluations",
      "selection",
      "certificate",
      "activation",
      "lastLogicalTimeMs",
      "lastEventDigest",
      "events",
      "stateDigest",
    ],
    "role realignment state",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_realignment_state_invalid");
  for (const [label, value] of [
    ["controllerId", input.controllerId],
    ["implementationId", input.implementationId],
    ["policyId", input.policyId],
    ["originSessionId", input.originSessionId],
    ["activeSessionId", input.activeSessionId],
    ["originAgentId", input.originAgentId],
    ["activeAgentId", input.activeAgentId],
    ["tenantId", input.tenantId],
    ["objectiveId", input.objectiveId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.controllerVersion, "controllerVersion", 1);
  assertSafeInteger(input.policyVersion, "policyVersion", 1);
  assertSafeInteger(input.revision, "revision", 1);
  assertSafeInteger(input.lastLogicalTimeMs, "lastLogicalTimeMs");
  for (const [label, value] of [
    ["policyDigest", input.policyDigest],
    ["activeRoleAnchorDigest", input.activeRoleAnchorDigest],
    ["lastEventDigest", input.lastEventDigest],
    ["stateDigest", input.stateDigest],
  ] as const)
    assertDigest(value, label);
  assertOneOf(input.status, statuses, "status");
  if (
    input.policyId !== policyRecord.policy.policyId ||
    input.policyVersion !== policyRecord.policy.policyVersion ||
    input.policyDigest !== policyRecord.policyDigest ||
    (binding.controllerId !== undefined &&
      input.controllerId !== binding.controllerId) ||
    (binding.controllerVersion !== undefined &&
      input.controllerVersion !== binding.controllerVersion) ||
    (binding.implementationId !== undefined &&
      input.implementationId !== binding.implementationId) ||
    (binding.activeSessionId !== undefined &&
      input.activeSessionId !== binding.activeSessionId)
  )
    throw new TypeError("role_realignment_state_binding_mismatch");
  const request = validateRoleRealignmentRequestV1(
    input.request,
    policyRecord.policy,
  );
  if (
    request.sessionId !== input.originSessionId ||
    request.agentId !== input.originAgentId ||
    request.tenantId !== input.tenantId ||
    request.objectiveId !== input.objectiveId
  )
    throw new TypeError("role_realignment_state_binding_mismatch");
  if (
    !Array.isArray(input.candidates) ||
    !Array.isArray(input.evaluations) ||
    !Array.isArray(input.events) ||
    input.candidates.length > policyRecord.policy.limits.maximumCandidates ||
    input.events.length > policyRecord.policy.limits.maximumRetainedEvents ||
    input.revision < input.events.length ||
    input.events.length === 0
  )
    throw new TypeError("role_realignment_state_invalid");
  sortedUnique(
    input.candidates.map(({ candidateDigest }) => candidateDigest),
    "candidate digests",
  );
  sortedUnique(
    input.evaluations.map(({ evaluationDigest }) => evaluationDigest),
    "evaluation digests",
  );
  const definitions = new Set<string>();
  const proposals = new Set<string>();
  for (const candidate of input.candidates) {
    validateAdmittedRoleCandidateV1(candidate, request, policyRecord.policy);
    if (
      definitions.has(candidate.proposal.definitionDigest) ||
      proposals.has(candidate.proposal.proposalDigest)
    )
      throw new TypeError("role_realignment_state_invalid");
    definitions.add(candidate.proposal.definitionDigest);
    proposals.add(candidate.proposal.proposalDigest);
  }
  const evaluatorBindings = new Set<string>();
  for (const evaluation of input.evaluations) {
    validateRoleCandidateEvaluationV1(evaluation, input, policyRecord.policy);
    const key = `${evaluation.candidateDigest}\0${evaluation.evaluatorBindingDigest}`;
    if (evaluatorBindings.has(key))
      throw new TypeError("role_realignment_state_invalid");
    evaluatorBindings.add(key);
  }
  for (const candidate of input.candidates) {
    if (
      input.evaluations.filter(
        ({ candidateDigest }) => candidateDigest === candidate.candidateDigest,
      ).length > policyRecord.policy.limits.maximumEvaluationsPerCandidate
    )
      throw new TypeError("role_realignment_capacity_exhausted");
  }
  if (input.selection !== null)
    validateRoleRealignmentSelectionV1(
      input.selection,
      input,
      policyRecord.policy,
    );
  if (input.certificate !== null)
    validateRoleRealignmentCertificateV1(
      input.certificate,
      input,
      policyRecord.policy,
    );
  if (input.activation !== null)
    validateRoleRealignmentActivationV1(
      input.activation,
      input,
      policyRecord.policy,
    );
  validateRoleRealignmentStatusShapeV1(input);
  const firstSequence = input.revision - input.events.length + 1;
  let previous =
    firstSequence === 1 ? null : input.events[0]!.previousEventDigest;
  let previousTime = -1;
  for (let index = 0; index < input.events.length; index += 1) {
    const event = validateRoleRealignmentEventV1(input.events[index]!);
    if (
      event.eventSequence !== firstSequence + index ||
      event.previousEventDigest !== previous ||
      event.logicalTimeMs < previousTime
    )
      throw new TypeError("role_realignment_event_chain_invalid");
    previous = event.eventDigest;
    previousTime = event.logicalTimeMs;
  }
  if (
    previous !== input.lastEventDigest ||
    input.events[input.events.length - 1]!.logicalTimeMs !==
      input.lastLogicalTimeMs
  )
    throw new TypeError("role_realignment_event_chain_invalid");
  const { stateDigest, ...body } = input;
  if (
    digestRoleRealignmentJsonV1("state", body as unknown as JsonValue) !==
    stateDigest
  )
    throw new TypeError("role_realignment_state_digest_invalid");
  ensureRoleRealignmentStateCapacityV1(input, policyRecord.policy);
  return policyRecord.policy;
}

function validateThresholds(input: RoleRealignmentThresholdsV1): void {
  assertExactKeys(
    input,
    [
      "minimumRoleFitBps",
      "minimumMissionContributionBps",
      "maximumUncertaintyBps",
      "maximumTransitionRiskBps",
    ],
    "role realignment thresholds",
  );
  for (const [label, value] of Object.entries(input)) {
    assertSafeInteger(value, label);
    if (value > ROLE_REALIGNMENT_BASIS_POINTS_V1)
      throw new TypeError("role_realignment_threshold_invalid");
  }
}

function validateWeights(input: RoleRealignmentScoringWeightsV1): void {
  assertExactKeys(
    input,
    [
      "roleFitBps",
      "missionContributionBps",
      "uncertaintyPenaltyBps",
      "transitionRiskPenaltyBps",
    ],
    "role realignment scoring weights",
  );
  let total = 0;
  for (const [label, value] of Object.entries(input)) {
    assertSafeInteger(value, label);
    if (value > ROLE_REALIGNMENT_BASIS_POINTS_V1)
      throw new TypeError("role_realignment_weight_invalid");
    total += value;
  }
  if (total !== ROLE_REALIGNMENT_BASIS_POINTS_V1)
    throw new TypeError("role_realignment_weight_total_invalid");
}

function validateLimits(input: RoleRealignmentLimitsV1): void {
  assertExactKeys(
    input,
    [
      "maximumProposers",
      "maximumCandidates",
      "maximumEvaluationsPerCandidate",
      "maximumReasonCodes",
      "maximumEvidenceReferences",
      "maximumCapabilities",
      "maximumResourceClasses",
      "maximumInstructions",
      "maximumInstructionBytes",
      "maximumConstraintsBytes",
      "maximumRequestTtlMs",
      "maximumEvaluationTtlMs",
      "maximumCertificationTtlMs",
      "maximumRetainedEvents",
      "maximumStateBytes",
    ],
    "role realignment limits",
  );
  for (const [label, value] of Object.entries(input))
    assertSafeInteger(value, label, 1);
  if (
    input.maximumCandidates > 256 ||
    input.maximumProposers > 256 ||
    input.maximumEvaluationsPerCandidate > 256 ||
    input.maximumReasonCodes > 256 ||
    input.maximumEvidenceReferences > 256 ||
    input.maximumCapabilities > 1_024 ||
    input.maximumResourceClasses > 1_024 ||
    input.maximumInstructions > 128 ||
    input.maximumInstructionBytes > 65_536 ||
    input.maximumConstraintsBytes > 1_048_576 ||
    input.maximumRetainedEvents > 65_536 ||
    input.maximumStateBytes > 67_108_864
  )
    throw new TypeError("role_realignment_limit_invalid");
}

function normalizeAuthorityCeiling(input: {
  readonly schemaVersion?: 1;
  readonly mandateDigest: string;
  readonly capabilityKeys: readonly string[];
  readonly resourceClasses: readonly string[];
  readonly maximumActionBudgetUnits: number;
  readonly validUntilLogicalMs: number;
}): Omit<RoleAuthorityCeilingV1, "ceilingDigest"> {
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1)
    throw new TypeError("role_authority_ceiling_invalid");
  assertDigest(input.mandateDigest, "mandateDigest");
  const capabilityKeys = normalizeIdentifierSet(
    input.capabilityKeys,
    "capabilityKeys",
  );
  const resourceClasses = normalizeIdentifierSet(
    input.resourceClasses,
    "resourceClasses",
  );
  assertSafeInteger(input.maximumActionBudgetUnits, "maximumActionBudgetUnits");
  assertSafeInteger(input.validUntilLogicalMs, "validUntilLogicalMs", 1);
  return deepFreeze({
    schemaVersion: 1,
    mandateDigest: input.mandateDigest,
    capabilityKeys,
    resourceClasses,
    maximumActionBudgetUnits: input.maximumActionBudgetUnits,
    validUntilLogicalMs: input.validUntilLogicalMs,
  });
}

function normalizeRoleDefinition(
  input: Omit<TrustedRoleDefinitionV1, "definitionDigest">,
): Omit<TrustedRoleDefinitionV1, "definitionDigest"> {
  if (input.schemaVersion !== 1) throw new TypeError("role_definition_invalid");
  for (const [label, value] of [
    ["catalogId", input.catalogId],
    ["definitionId", input.definitionId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.definitionRevision, "definitionRevision", 1);
  if (input.predecessorDefinitionDigest !== null)
    assertDigest(
      input.predecessorDefinitionDigest,
      "predecessorDefinitionDigest",
    );
  if (
    (input.definitionRevision === 1 &&
      input.predecessorDefinitionDigest !== null) ||
    (input.definitionRevision > 1 && input.predecessorDefinitionDigest === null)
  )
    throw new TypeError("role_definition_lineage_invalid");
  assertString(input.roleKey, "roleKey");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(input.roleKey))
    throw new TypeError("role_definition_role_key_invalid");
  if (!Array.isArray(input.instructions))
    throw new TypeError("role_definition_instructions_invalid");
  const instructions = input.instructions.map((value, index) => {
    assertString(value, `instructions[${index}]`);
    return value;
  });
  assertStrictJsonValue(input.constraints);
  if (
    input.constraints === null ||
    typeof input.constraints !== "object" ||
    Array.isArray(input.constraints)
  )
    throw new TypeError("role_definition_constraints_invalid");
  const requiredCapabilityKeys = normalizeIdentifierSet(
    input.requiredCapabilityKeys,
    "requiredCapabilityKeys",
  );
  const requiredResourceClasses = normalizeIdentifierSet(
    input.requiredResourceClasses,
    "requiredResourceClasses",
  );
  assertSafeInteger(input.maximumActionBudgetUnits, "maximumActionBudgetUnits");
  assertSafeInteger(input.validFromLogicalMs, "validFromLogicalMs");
  assertSafeInteger(input.validUntilLogicalMs, "validUntilLogicalMs", 1);
  if (input.validUntilLogicalMs <= input.validFromLogicalMs)
    throw new TypeError("role_definition_lifetime_invalid");
  return deepFreeze({
    schemaVersion: 1,
    catalogId: input.catalogId,
    definitionId: input.definitionId,
    definitionRevision: input.definitionRevision,
    predecessorDefinitionDigest: input.predecessorDefinitionDigest,
    roleKey: input.roleKey,
    instructions,
    constraints: freezeClone(input.constraints),
    requiredCapabilityKeys,
    requiredResourceClasses,
    maximumActionBudgetUnits: input.maximumActionBudgetUnits,
    validFromLogicalMs: input.validFromLogicalMs,
    validUntilLogicalMs: input.validUntilLogicalMs,
  });
}

function normalizeProposal(
  input: Omit<RoleCandidateProposalV1, "proposalDigest">,
): Omit<RoleCandidateProposalV1, "proposalDigest"> {
  if (input.schemaVersion !== 1)
    throw new TypeError("role_candidate_proposal_invalid");
  for (const [label, value] of [
    ["proposalId", input.proposalId],
    ["proposerId", input.proposerId],
    ["definitionId", input.definitionId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.proposerVersion, "proposerVersion", 1);
  assertSafeInteger(input.definitionRevision, "definitionRevision", 1);
  for (const [label, value] of [
    ["requestDigest", input.requestDigest],
    ["proposerBindingDigest", input.proposerBindingDigest],
    ["definitionDigest", input.definitionDigest],
  ] as const)
    assertDigest(value, label);
  const reasonCodes = normalizeIdentifierSet(input.reasonCodes, "reasonCodes");
  const evidenceReferenceIds = normalizeIdentifierSet(
    input.evidenceReferenceIds,
    "evidenceReferenceIds",
  );
  assertSafeInteger(input.proposedAtLogicalMs, "proposedAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs", 1);
  if (input.expiresAtLogicalMs <= input.proposedAtLogicalMs)
    throw new TypeError("role_candidate_proposal_lifetime_invalid");
  return deepFreeze({
    schemaVersion: 1,
    proposalId: input.proposalId,
    requestDigest: input.requestDigest,
    proposerId: input.proposerId,
    proposerVersion: input.proposerVersion,
    proposerBindingDigest: input.proposerBindingDigest,
    definitionId: input.definitionId,
    definitionRevision: input.definitionRevision,
    definitionDigest: input.definitionDigest,
    reasonCodes,
    evidenceReferenceIds,
    proposedAtLogicalMs: input.proposedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  });
}

function normalizeEvaluation(
  input: Omit<RoleCandidateEvaluationV1, "evaluationDigest">,
): Omit<RoleCandidateEvaluationV1, "evaluationDigest"> {
  if (input.schemaVersion !== 1)
    throw new TypeError("role_candidate_evaluation_invalid");
  for (const [label, value] of [
    ["evaluationId", input.evaluationId],
    ["evaluatorId", input.evaluatorId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.evaluatorVersion, "evaluatorVersion", 1);
  for (const [label, value] of [
    ["requestDigest", input.requestDigest],
    ["candidateDigest", input.candidateDigest],
    ["definitionDigest", input.definitionDigest],
    ["evaluatorBindingDigest", input.evaluatorBindingDigest],
    ["eligibilityDecisionDigest", input.eligibilityDecisionDigest],
  ] as const)
    assertDigest(value, label);
  if (typeof input.eligible !== "boolean")
    throw new TypeError("role_candidate_evaluation_invalid");
  for (const [label, value] of [
    ["roleFitBps", input.roleFitBps],
    ["missionContributionBps", input.missionContributionBps],
    ["uncertaintyBps", input.uncertaintyBps],
    ["transitionRiskBps", input.transitionRiskBps],
  ] as const) {
    assertSafeInteger(value, label);
    if (value > ROLE_REALIGNMENT_BASIS_POINTS_V1)
      throw new TypeError("role_candidate_evaluation_score_invalid");
  }
  const reasonCodes = normalizeIdentifierSet(input.reasonCodes, "reasonCodes");
  const evidenceReferenceIds = normalizeIdentifierSet(
    input.evidenceReferenceIds,
    "evidenceReferenceIds",
  );
  assertSafeInteger(input.evaluatedAtLogicalMs, "evaluatedAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs", 1);
  if (input.expiresAtLogicalMs <= input.evaluatedAtLogicalMs)
    throw new TypeError("role_candidate_evaluation_lifetime_invalid");
  return deepFreeze({
    schemaVersion: 1,
    evaluationId: input.evaluationId,
    requestDigest: input.requestDigest,
    candidateDigest: input.candidateDigest,
    definitionDigest: input.definitionDigest,
    evaluatorId: input.evaluatorId,
    evaluatorVersion: input.evaluatorVersion,
    evaluatorBindingDigest: input.evaluatorBindingDigest,
    eligibilityDecisionDigest: input.eligibilityDecisionDigest,
    eligible: input.eligible,
    roleFitBps: input.roleFitBps,
    missionContributionBps: input.missionContributionBps,
    uncertaintyBps: input.uncertaintyBps,
    transitionRiskBps: input.transitionRiskBps,
    reasonCodes,
    evidenceReferenceIds,
    evaluatedAtLogicalMs: input.evaluatedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  });
}

function normalizeCertificate(
  input: Omit<RoleRealignmentCertificateV1, "certificateDigest">,
): Omit<RoleRealignmentCertificateV1, "certificateDigest"> {
  if (input.schemaVersion !== 1)
    throw new TypeError("role_realignment_certificate_invalid");
  for (const [label, value] of [
    ["certificateId", input.certificateId],
    ["certifierId", input.certifierId],
  ] as const)
    assertIdentifier(value, label);
  assertOneOf(input.certificationKind, certificationKinds, "certificationKind");
  assertSafeInteger(input.certifierVersion, "certifierVersion", 1);
  for (const [label, value] of [
    ["certifierBindingDigest", input.certifierBindingDigest],
    ["requestDigest", input.requestDigest],
    ["selectionDigest", input.selectionDigest],
    ["selectedCandidateDigest", input.selectedCandidateDigest],
    ["selectedDefinitionDigest", input.selectedDefinitionDigest],
    ["authorityCeilingDigest", input.authorityCeilingDigest],
    ["sourceCertificateDigest", input.sourceCertificateDigest],
  ] as const)
    assertDigest(value, label);
  const witnessIds = normalizeIdentifierSet(input.witnessIds, "witnessIds");
  if (input.certificationKind === "local_policy") {
    if (
      input.membershipEpoch !== null ||
      input.membershipConfigurationDigest !== null
    )
      throw new TypeError("role_realignment_certificate_membership_invalid");
  } else {
    assertSafeInteger(input.membershipEpoch, "membershipEpoch");
    assertDigest(
      input.membershipConfigurationDigest,
      "membershipConfigurationDigest",
    );
  }
  assertSafeInteger(input.certifiedAtLogicalMs, "certifiedAtLogicalMs");
  assertSafeInteger(input.expiresAtLogicalMs, "expiresAtLogicalMs", 1);
  if (input.expiresAtLogicalMs <= input.certifiedAtLogicalMs)
    throw new TypeError("role_realignment_certificate_lifetime_invalid");
  return deepFreeze({
    schemaVersion: 1,
    certificateId: input.certificateId,
    certificationKind: input.certificationKind,
    certifierId: input.certifierId,
    certifierVersion: input.certifierVersion,
    certifierBindingDigest: input.certifierBindingDigest,
    requestDigest: input.requestDigest,
    selectionDigest: input.selectionDigest,
    selectedCandidateDigest: input.selectedCandidateDigest,
    selectedDefinitionDigest: input.selectedDefinitionDigest,
    authorityCeilingDigest: input.authorityCeilingDigest,
    witnessIds,
    membershipEpoch: input.membershipEpoch,
    membershipConfigurationDigest: input.membershipConfigurationDigest,
    sourceCertificateDigest: input.sourceCertificateDigest,
    certifiedAtLogicalMs: input.certifiedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  });
}

function normalizeIdentifierSet(
  input: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(input)) throw new TypeError(`${label}_invalid`);
  const values = [...input];
  for (let index = 0; index < values.length; index += 1)
    assertIdentifier(values[index], `${label}[${index}]`);
  sortedUnique(values, label);
  return Object.freeze(values);
}

export function assertTrustedRoleDefinitionWithinAuthorityCeilingV1(
  definition: TrustedRoleDefinitionV1,
  ceiling: RoleAuthorityCeilingV1,
): void {
  const capabilities = new Set(ceiling.capabilityKeys);
  const resources = new Set(ceiling.resourceClasses);
  if (
    definition.requiredCapabilityKeys.some((key) => !capabilities.has(key)) ||
    definition.requiredResourceClasses.some((key) => !resources.has(key)) ||
    definition.maximumActionBudgetUnits > ceiling.maximumActionBudgetUnits ||
    definition.validUntilLogicalMs > ceiling.validUntilLogicalMs
  )
    throw new TypeError("role_candidate_authority_widening_denied");
}

function aggregateRoleCandidateV1(
  candidate: AdmittedRoleCandidateV1,
  evaluations: readonly RoleCandidateEvaluationV1[],
  policy: RoleRealignmentPolicyV1,
  logicalTimeMs: number,
): RoleCandidateAggregateV1 | null {
  if (candidate.proposal.expiresAtLogicalMs <= logicalTimeMs) return null;
  const eligible = evaluations
    .filter(
      (evaluation) =>
        evaluation.candidateDigest === candidate.candidateDigest &&
        evaluation.eligible &&
        evaluation.expiresAtLogicalMs > logicalTimeMs,
    )
    .sort((left, right) =>
      compareCodeUnits(left.evaluationDigest, right.evaluationDigest),
    );
  if (eligible.length < policy.minimumIndependentEvaluations) return null;
  const meanRoleFitBps = integerMean(
    eligible.map(({ roleFitBps }) => roleFitBps),
  );
  const meanMissionContributionBps = integerMean(
    eligible.map(({ missionContributionBps }) => missionContributionBps),
  );
  const meanUncertaintyBps = integerMean(
    eligible.map(({ uncertaintyBps }) => uncertaintyBps),
  );
  const meanTransitionRiskBps = integerMean(
    eligible.map(({ transitionRiskBps }) => transitionRiskBps),
  );
  if (
    meanRoleFitBps < policy.thresholds.minimumRoleFitBps ||
    meanMissionContributionBps <
      policy.thresholds.minimumMissionContributionBps ||
    meanUncertaintyBps > policy.thresholds.maximumUncertaintyBps ||
    meanTransitionRiskBps > policy.thresholds.maximumTransitionRiskBps
  )
    return null;
  const weights = policy.scoringWeights;
  const numerator =
    meanRoleFitBps * weights.roleFitBps +
    meanMissionContributionBps * weights.missionContributionBps -
    meanUncertaintyBps * weights.uncertaintyPenaltyBps -
    meanTransitionRiskBps * weights.transitionRiskPenaltyBps;
  return deepFreeze({
    schemaVersion: 1,
    candidateId: candidate.candidateId,
    candidateDigest: candidate.candidateDigest,
    definitionDigest: candidate.proposal.definitionDigest,
    eligibleEvaluationDigests: eligible.map(
      ({ evaluationDigest }) => evaluationDigest,
    ),
    meanRoleFitBps,
    meanMissionContributionBps,
    meanUncertaintyBps,
    meanTransitionRiskBps,
    aggregateScore: Math.floor(numerator / ROLE_REALIGNMENT_BASIS_POINTS_V1),
  });
}

function integerMean(values: readonly number[]): number {
  if (!values.length) throw new TypeError("role_realignment_mean_empty");
  return Math.floor(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function validateAdmittedRoleCandidateV1(
  input: AdmittedRoleCandidateV1,
  request: RoleRealignmentRequestV1,
  policy: RoleRealignmentPolicyV1,
): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "candidateId",
      "requestDigest",
      "proposal",
      "proposerEligibilityDecisionDigest",
      "catalogId",
      "admittedAtLogicalMs",
      "candidateDigest",
    ],
    "admitted role candidate",
  );
  if (input.schemaVersion !== 1) throw new TypeError("role_candidate_invalid");
  assertIdentifier(input.candidateId, "candidateId");
  assertDigest(input.requestDigest, "requestDigest");
  assertDigest(
    input.proposerEligibilityDecisionDigest,
    "proposerEligibilityDecisionDigest",
  );
  assertIdentifier(input.catalogId, "catalogId");
  assertSafeInteger(input.admittedAtLogicalMs, "admittedAtLogicalMs");
  assertDigest(input.candidateDigest, "candidateDigest");
  const proposal = validateRoleCandidateProposalV1(
    input.proposal,
    request,
    policy,
  );
  const { candidateDigest, ...body } = input;
  if (
    input.requestDigest !== request.requestDigest ||
    input.admittedAtLogicalMs < proposal.proposedAtLogicalMs ||
    input.admittedAtLogicalMs >= proposal.expiresAtLogicalMs ||
    digestRoleRealignmentJsonV1("candidate", body as unknown as JsonValue) !==
      candidateDigest
  )
    throw new TypeError("role_candidate_invalid");
}

function validateRoleRealignmentSelectionV1(
  input: RoleRealignmentSelectionV1,
  state: RoleRealignmentStateV1,
  policy: RoleRealignmentPolicyV1,
): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "selectionId",
      "requestDigest",
      "stateRevision",
      "aggregates",
      "selectedCandidateId",
      "selectedCandidateDigest",
      "selectedDefinitionDigest",
      "selectedAtLogicalMs",
      "selectionDigest",
    ],
    "role realignment selection",
  );
  if (input.schemaVersion !== 1 || !Array.isArray(input.aggregates))
    throw new TypeError("role_realignment_selection_invalid");
  assertIdentifier(input.selectionId, "selectionId");
  assertIdentifier(input.selectedCandidateId, "selectedCandidateId");
  assertSafeInteger(input.stateRevision, "stateRevision", 1);
  assertSafeInteger(input.selectedAtLogicalMs, "selectedAtLogicalMs");
  for (const [label, value] of [
    ["requestDigest", input.requestDigest],
    ["selectedCandidateDigest", input.selectedCandidateDigest],
    ["selectedDefinitionDigest", input.selectedDefinitionDigest],
    ["selectionDigest", input.selectionDigest],
  ] as const)
    assertDigest(value, label);
  sortedUnique(
    input.aggregates.map(({ candidateDigest }) => candidateDigest),
    "aggregate candidate digests",
  );
  for (const aggregate of input.aggregates)
    validateRoleCandidateAggregateV1(aggregate);
  const winner = input.aggregates.find(
    ({ candidateDigest }) => candidateDigest === input.selectedCandidateDigest,
  );
  const candidate = state.candidates.find(
    ({ candidateDigest }) => candidateDigest === input.selectedCandidateDigest,
  );
  const expectedAggregates = state.candidates
    .map((item) =>
      aggregateRoleCandidateV1(
        item,
        state.evaluations,
        policy,
        input.selectedAtLogicalMs,
      ),
    )
    .filter((item): item is RoleCandidateAggregateV1 => item !== null)
    .sort((left, right) =>
      compareCodeUnits(left.candidateDigest, right.candidateDigest),
    );
  const expectedWinner = [...expectedAggregates].sort(
    (left, right) =>
      right.aggregateScore - left.aggregateScore ||
      compareCodeUnits(left.definitionDigest, right.definitionDigest) ||
      compareCodeUnits(left.candidateDigest, right.candidateDigest),
  )[0];
  const retainedSelectionEvent = state.events.find(
    (event) =>
      event.eventType === "candidate_selected" &&
      event.inputDigest === input.selectionDigest,
  );
  const { selectionDigest, ...body } = input;
  if (
    input.requestDigest !== state.request.requestDigest ||
    input.selectedAtLogicalMs >= state.request.expiresAtLogicalMs ||
    !winner ||
    !candidate ||
    !expectedWinner ||
    canonicalizeControlJsonV1(input.aggregates as unknown as JsonValue) !==
      canonicalizeControlJsonV1(expectedAggregates as unknown as JsonValue) ||
    expectedWinner.candidateDigest !== input.selectedCandidateDigest ||
    winner.candidateId !== input.selectedCandidateId ||
    winner.definitionDigest !== input.selectedDefinitionDigest ||
    candidate.proposal.definitionDigest !== input.selectedDefinitionDigest ||
    (retainedSelectionEvent !== undefined &&
      input.stateRevision !== retainedSelectionEvent.eventSequence - 1) ||
    digestRoleRealignmentJsonV1("selection", body as unknown as JsonValue) !==
      selectionDigest
  )
    throw new TypeError("role_realignment_selection_invalid");
}

function validateRoleCandidateAggregateV1(
  input: RoleCandidateAggregateV1,
): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "candidateId",
      "candidateDigest",
      "definitionDigest",
      "eligibleEvaluationDigests",
      "meanRoleFitBps",
      "meanMissionContributionBps",
      "meanUncertaintyBps",
      "meanTransitionRiskBps",
      "aggregateScore",
    ],
    "role candidate aggregate",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_candidate_aggregate_invalid");
  assertIdentifier(input.candidateId, "candidateId");
  assertDigest(input.candidateDigest, "candidateDigest");
  assertDigest(input.definitionDigest, "definitionDigest");
  if (!Array.isArray(input.eligibleEvaluationDigests))
    throw new TypeError("role_candidate_aggregate_invalid");
  for (const digest of input.eligibleEvaluationDigests)
    assertDigest(digest, "eligibleEvaluationDigest");
  sortedUnique(input.eligibleEvaluationDigests, "eligible evaluation digests");
  for (const [label, value] of [
    ["meanRoleFitBps", input.meanRoleFitBps],
    ["meanMissionContributionBps", input.meanMissionContributionBps],
    ["meanUncertaintyBps", input.meanUncertaintyBps],
    ["meanTransitionRiskBps", input.meanTransitionRiskBps],
  ] as const) {
    assertSafeInteger(value, label);
    if (value > ROLE_REALIGNMENT_BASIS_POINTS_V1)
      throw new TypeError("role_candidate_aggregate_invalid");
  }
  if (!Number.isSafeInteger(input.aggregateScore))
    throw new TypeError("role_candidate_aggregate_invalid");
}

function validateRoleRealignmentActivationV1(
  input: RoleRealignmentActivationV1,
  state: RoleRealignmentStateV1,
  policy: RoleRealignmentPolicyV1,
): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "activationId",
      "requestDigest",
      "selectionDigest",
      "certificateDigest",
      "definition",
      "roleBinding",
      "roleBindingDigest",
      "startedAtLogicalMs",
      "completedAtLogicalMs",
      "runtimeSessionRevision",
      "alignmentStateRevision",
      "alignmentRoleAnchorDigest",
      "activationDigest",
    ],
    "role realignment activation",
  );
  if (input.schemaVersion !== 1 || !state.selection || !state.certificate)
    throw new TypeError("role_realignment_activation_invalid");
  assertIdentifier(input.activationId, "activationId");
  for (const [label, value] of [
    ["requestDigest", input.requestDigest],
    ["selectionDigest", input.selectionDigest],
    ["certificateDigest", input.certificateDigest],
    ["roleBindingDigest", input.roleBindingDigest],
    ["activationDigest", input.activationDigest],
  ] as const)
    assertDigest(value, label);
  const definition = validateTrustedRoleDefinitionV1(input.definition, policy);
  assertTrustedRoleDefinitionWithinAuthorityCeilingV1(
    definition,
    state.request.authorityCeiling,
  );
  const roleBinding = normalizeRoleBindingV1(input.roleBinding);
  assertSafeInteger(input.startedAtLogicalMs, "startedAtLogicalMs");
  const complete = input.completedAtLogicalMs !== null;
  if (complete) {
    assertSafeInteger(input.completedAtLogicalMs, "completedAtLogicalMs");
    assertSafeInteger(
      input.runtimeSessionRevision,
      "runtimeSessionRevision",
      1,
    );
    assertSafeInteger(
      input.alignmentStateRevision,
      "alignmentStateRevision",
      1,
    );
    assertDigest(input.alignmentRoleAnchorDigest, "alignmentRoleAnchorDigest");
  } else if (
    input.runtimeSessionRevision !== null ||
    input.alignmentStateRevision !== null ||
    input.alignmentRoleAnchorDigest !== null
  ) {
    throw new TypeError("role_realignment_activation_invalid");
  }
  const { activationDigest, ...body } = input;
  const selectedCandidate = state.candidates.find(
    ({ candidateDigest }) =>
      candidateDigest === state.selection!.selectedCandidateDigest,
  );
  const expectedValidFrom = selectedCandidate
    ? Math.max(input.startedAtLogicalMs, definition.validFromLogicalMs)
    : -1;
  const expectedValidUntil = selectedCandidate
    ? Math.min(
        definition.validUntilLogicalMs,
        state.request.expiresAtLogicalMs,
        state.request.authorityCeiling.validUntilLogicalMs,
      )
    : -1;
  if (
    input.requestDigest !== state.request.requestDigest ||
    input.selectionDigest !== state.selection.selectionDigest ||
    input.certificateDigest !== state.certificate.certificateDigest ||
    !selectedCandidate ||
    selectedCandidate.catalogId !== definition.catalogId ||
    selectedCandidate.proposal.definitionId !== definition.definitionId ||
    selectedCandidate.proposal.definitionRevision !==
      definition.definitionRevision ||
    selectedCandidate.proposal.definitionDigest !==
      definition.definitionDigest ||
    roleBinding.roleBindingId !==
      `role-${definition.definitionDigest.slice(7, 39)}` ||
    roleBinding.objectiveId !== state.objectiveId ||
    roleBinding.roleRevision !== state.request.currentRoleRevision + 1 ||
    roleBinding.predecessorRoleBindingId !==
      state.request.currentRoleBindingId ||
    roleBinding.roleKey !== definition.roleKey ||
    canonicalizeControlJsonV1(
      roleBinding.instructions as unknown as JsonValue,
    ) !==
      canonicalizeControlJsonV1(
        definition.instructions as unknown as JsonValue,
      ) ||
    canonicalizeControlJsonV1(roleBinding.constraints) !==
      canonicalizeControlJsonV1(definition.constraints) ||
    roleBinding.validFromLogicalMs !== expectedValidFrom ||
    roleBinding.validUntilLogicalMs !== expectedValidUntil ||
    digestRoleRealignmentJsonV1(
      "role_binding",
      roleBinding as unknown as JsonValue,
    ) !== input.roleBindingDigest ||
    digestRoleRealignmentJsonV1("activation", body as unknown as JsonValue) !==
      activationDigest
  )
    throw new TypeError("role_realignment_activation_invalid");
}

function validateRoleRealignmentEventV1(
  input: RoleRealignmentEventV1,
): RoleRealignmentEventV1 {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "eventSequence",
      "eventType",
      "inputDigest",
      "reasonCode",
      "logicalTimeMs",
      "previousEventDigest",
      "eventDigest",
    ],
    "role realignment event",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("role_realignment_event_invalid");
  assertSafeInteger(input.eventSequence, "eventSequence", 1);
  assertOneOf(input.eventType, eventTypes, "eventType");
  assertDigest(input.inputDigest, "inputDigest");
  assertIdentifier(input.reasonCode, "reasonCode");
  assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
  if (input.previousEventDigest !== null)
    assertDigest(input.previousEventDigest, "previousEventDigest");
  assertDigest(input.eventDigest, "eventDigest");
  const { eventDigest, ...body } = input;
  if (
    digestRoleRealignmentJsonV1("event", body as unknown as JsonValue) !==
    eventDigest
  )
    throw new TypeError("role_realignment_event_invalid");
  return freezeClone(input);
}

function validateRoleRealignmentStatusShapeV1(
  state: RoleRealignmentStateV1,
): void {
  const hasSelection = state.selection !== null;
  const hasCertificate = state.certificate !== null;
  const hasActivation = state.activation !== null;
  if (
    ((state.status === "requested" || state.status === "collecting") &&
      (hasSelection || hasCertificate || hasActivation)) ||
    (state.status === "selected" &&
      (!hasSelection || hasCertificate || hasActivation)) ||
    (state.status === "certified" &&
      (!hasSelection || !hasCertificate || hasActivation)) ||
    ((state.status === "activating" || state.status === "activated") &&
      (!hasSelection || !hasCertificate || !hasActivation)) ||
    (state.status === "activating" &&
      state.activation?.completedAtLogicalMs !== null) ||
    (state.status === "activated" &&
      state.activation?.completedAtLogicalMs === null)
  )
    throw new TypeError("role_realignment_state_status_invalid");
}

function createRoleRealignmentEventV1(input: {
  readonly eventSequence: number;
  readonly eventType: RoleRealignmentEventTypeV1;
  readonly inputDigest: string;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
  readonly previousEventDigest: string | null;
}): RoleRealignmentEventV1 {
  assertSafeInteger(input.eventSequence, "eventSequence", 1);
  assertOneOf(input.eventType, eventTypes, "eventType");
  assertDigest(input.inputDigest, "inputDigest");
  assertIdentifier(input.reasonCode, "reasonCode");
  assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
  if (input.previousEventDigest !== null)
    assertDigest(input.previousEventDigest, "previousEventDigest");
  const body = { schemaVersion: 1 as const, ...input };
  return deepFreeze({
    ...body,
    eventDigest: digestRoleRealignmentJsonV1(
      "event",
      body as unknown as JsonValue,
    ),
  });
}

function transitionRoleRealignmentStateV1(input: {
  readonly state: RoleRealignmentStateV1;
  readonly policy: RoleRealignmentPolicyV1;
  readonly eventType: RoleRealignmentEventTypeV1;
  readonly inputDigest: string;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
  readonly patch: Readonly<
    Partial<Omit<RoleRealignmentStateV1, "stateDigest">>
  >;
  readonly permitExpiredTime?: boolean;
}): RoleRealignmentTransitionV1 {
  if (!input.permitExpiredTime)
    requireRoleRealignmentTimeV1(input.state, input.logicalTimeMs);
  else {
    assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
    if (input.logicalTimeMs < input.state.lastLogicalTimeMs)
      throw new TypeError("role_realignment_clock_rollback");
  }
  const event = createRoleRealignmentEventV1({
    eventSequence: input.state.revision + 1,
    eventType: input.eventType,
    inputDigest: input.inputDigest,
    reasonCode: input.reasonCode,
    logicalTimeMs: input.logicalTimeMs,
    previousEventDigest: input.state.lastEventDigest,
  });
  const next = withRoleRealignmentStateDigestV1({
    ...withoutRoleRealignmentStateDigestV1(input.state),
    ...input.patch,
    revision: input.state.revision + 1,
    lastLogicalTimeMs: input.logicalTimeMs,
    lastEventDigest: event.eventDigest,
    events: retainRoleRealignmentEventsV1(
      input.state.events,
      event,
      input.policy,
    ),
  });
  ensureRoleRealignmentStateCapacityV1(next, input.policy);
  return deepFreeze({ state: next, event });
}

function retainRoleRealignmentEventsV1(
  events: readonly RoleRealignmentEventV1[],
  event: RoleRealignmentEventV1,
  policy: RoleRealignmentPolicyV1,
): readonly RoleRealignmentEventV1[] {
  return Object.freeze(
    [...events, event].slice(-policy.limits.maximumRetainedEvents),
  );
}

function withRoleRealignmentStateDigestV1(
  input: Omit<RoleRealignmentStateV1, "stateDigest">,
): RoleRealignmentStateV1 {
  return deepFreeze({
    ...input,
    stateDigest: digestRoleRealignmentJsonV1(
      "state",
      input as unknown as JsonValue,
    ),
  });
}

function withoutRoleRealignmentStateDigestV1(
  input: RoleRealignmentStateV1,
): Omit<RoleRealignmentStateV1, "stateDigest"> {
  const { stateDigest: _ignored, ...body } = input;
  return body;
}

function ensureRoleRealignmentStateCapacityV1(
  state: RoleRealignmentStateV1,
  policy: RoleRealignmentPolicyV1,
): void {
  if (
    utf8ByteLength(canonicalizeControlJsonV1(state as unknown as JsonValue)) >
    policy.limits.maximumStateBytes
  )
    throw new TypeError("role_realignment_capacity_exhausted");
}

function requireRoleRealignmentRevisionV1(
  state: RoleRealignmentStateV1,
  expectedRevision: number,
): void {
  assertSafeInteger(expectedRevision, "expectedRevision", 1);
  if (state.revision !== expectedRevision)
    throw new TypeError("role_realignment_revision_conflict");
}

function requireRoleRealignmentOpenV1(
  state: RoleRealignmentStateV1,
  allowed: readonly RoleRealignmentStateStatusV1[],
): void {
  if (!allowed.includes(state.status))
    throw new TypeError(`role_realignment_${state.status}`);
}

function requireRoleRealignmentTimeV1(
  state: RoleRealignmentStateV1,
  logicalTimeMs: number,
  permitExpiry = false,
): void {
  assertSafeInteger(logicalTimeMs, "logicalTimeMs");
  if (logicalTimeMs < state.lastLogicalTimeMs)
    throw new TypeError("role_realignment_clock_rollback");
  if (!permitExpiry && logicalTimeMs >= state.request.expiresAtLogicalMs)
    throw new TypeError("role_realignment_request_expired");
}

function freezeClone<T>(input: T): T {
  assertStrictJsonValue(input);
  return deepFreeze(JSON.parse(JSON.stringify(input)) as T);
}
