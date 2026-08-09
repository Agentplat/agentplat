import type { JsonValue } from "@agentplat/core";
import { canonicalizeControlJsonV1 } from "./canonical.js";
import {
  SEMANTIC_CONTROL_CHECKPOINTS_V1,
  SEMANTIC_CONTROL_DIMENSIONS_V1,
  type SemanticAggregateAssessmentV1,
  type SemanticActionAuthorizationClaimsV1,
  type SemanticActionAuthorizationV1,
  type SemanticActionEffectReceiptV1,
  type SemanticAssessorAssessmentV1,
  type SemanticAssessorBasisV1,
  type SemanticAssessorDescriptorV1,
  type SemanticConstraintViolationV1,
  type SemanticControlBindingV1,
  type SemanticControlDecisionV1,
  type SemanticControlDimensionV1,
  type SemanticControlDispositionV1,
  type SemanticControlPolicyV1,
  type SemanticControlRequestV1,
  type SemanticMetricVectorV1,
} from "./semantic-alignment-contracts.js";
import { sha256Hex } from "./sha256.js";
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertOneOf,
  assertSafeInteger,
  assertString,
  deepFreeze,
} from "./validation.js";

const encoder = new TextEncoder();
const dispositions = ["allow", "steer", "block", "abstain"] as const;
const bases = [
  "application_semantic_model",
  "provider_semantic_model",
  "representation_model",
  "structured_policy",
  "reference_digest_heuristic",
] as const;
const violations = ["role_constraint", "mission_constraint"] as const;
const modalities = ["text", "image", "audio", "video", "sensor"] as const;
const policyInputKeys = ["enforcingAssessorIds", "limits", "minimumGroupsPerDimension", "minimumIndependenceGroups", "policyId", "policyVersion", "schemaVersion", "thresholds"];
const thresholdKeys = ["maximumContextConflictBps", "maximumUncertaintyBps", "minimumCourseActionDiversityBps", "minimumCourseActionNoveltyBps", "minimumMissionAlignmentBps", "minimumRoleCoherenceBps"];
const limitKeys = ["actionAuthorizationTtlMs", "assessorTimeoutMs", "maximumActionPayloadBytes", "maximumAssessors", "maximumCommitAttempts", "maximumCourseActionCandidates", "maximumCourseActionHistory", "maximumEvidenceDigests", "maximumLogicalTimeMs", "maximumReasonCodes", "maximumRetainedDecisions", "maximumSequence"];
const bindingInputKeys = ["agentId", "authorityDigest", "bindingId", "missionAnchorDigest", "missionId", "roleAnchorDigest", "roleId", "schemaVersion", "sessionId"];
const descriptorInputKeys = ["assessorId", "assessorImplementationDigest", "assessorVersion", "basis", "independenceGroup", "schemaVersion", "supportedDimensions"];
const requestInputKeys = ["actionPayloadDigest", "authorityDigest", "bindingDigest", "candidateCourseActionDigests", "checkpoint", "contextDigest", "logicalTimeMs", "materialDigest", "materialHandle", "missionAnchorDigest", "modalities", "priorCourseActionDigests", "requestId", "roleAnchorDigest", "schemaVersion", "selectedCourseActionDigest", "sequence", "step", "targetDigest"];
const metricKeys = ["contextConflictBps", "courseActionDiversityBps", "courseActionNoveltyBps", "missionAlignmentBps", "roleCoherenceBps", "uncertaintyBps"];
const assessorAssessmentInputKeys = ["assessorId", "assessorImplementationDigest", "assessorVersion", "evidenceDigests", "hardConstraintViolations", "independenceGroup", "metrics", "reasonCodes", "recommendation", "requestDigest", "schemaVersion"];
const actionAuthorizationClaimsInputKeys = ["actionPayloadDigest", "assessorSetDigest", "authorityDigest", "authorizationId", "bindingDigest", "committedStateRevision", "decisionDigest", "effectConsumerDigest", "materialDigest", "policyDigest", "requestDigest", "schemaVersion", "sequence", "sinkId", "sinkKeyDigest", "targetDigest", "validFromLogicalTimeMs", "validUntilLogicalTimeMs"];
const actionAuthorizationKeys = ["authorizationDigest", "claims", "issuerId", "issuerKeyDigest", "schemaVersion"];
const actionEffectReceiptInputKeys = ["authorizationDigest", "committedAtLogicalTimeMs", "effectConsumerDigest", "outcomeDigest", "schemaVersion", "sinkId", "sinkKeyDigest"];

export function digestSemanticControlV1(
  domain:
    | "policy"
    | "binding"
    | "descriptor"
    | "request"
    | "assessor-assessment"
    | "aggregate-assessment"
    | "decision"
    | "state"
    | "assessor-set"
    | "route"
    | "operation-payload"
    | "action-authorization-claims"
    | "action-authorization"
    | "action-effect-receipt",
  value: JsonValue,
): string {
  return `sha256:${sha256Hex(
    encoder.encode(
      `agentplat.inference-control/semantic-alignment-agility/${domain}/v1\0${canonicalizeControlJsonV1(value)}`,
    ),
  )}`;
}

export function createSemanticControlPolicyV1(
  input: Omit<SemanticControlPolicyV1, "policyDigest">,
): SemanticControlPolicyV1 {
  assertExactKeys(input, policyInputKeys, "semantic policy input");
  assertExactKeys(input.thresholds, thresholdKeys, "semantic policy thresholds");
  assertExactKeys(input.limits, limitKeys, "semantic policy limits");
  if (input.schemaVersion !== 1) fail("semantic_policy_schema_invalid");
  id(input.policyId, "policyId");
  positive(input.policyVersion, "policyVersion");
  const thresholds = deepFreeze({
    minimumRoleCoherenceBps: bps(input.thresholds.minimumRoleCoherenceBps, "minimumRoleCoherenceBps"),
    minimumMissionAlignmentBps: bps(input.thresholds.minimumMissionAlignmentBps, "minimumMissionAlignmentBps"),
    maximumContextConflictBps: bps(input.thresholds.maximumContextConflictBps, "maximumContextConflictBps"),
    maximumUncertaintyBps: bps(input.thresholds.maximumUncertaintyBps, "maximumUncertaintyBps"),
    minimumCourseActionDiversityBps: bps(input.thresholds.minimumCourseActionDiversityBps, "minimumCourseActionDiversityBps"),
    minimumCourseActionNoveltyBps: bps(input.thresholds.minimumCourseActionNoveltyBps, "minimumCourseActionNoveltyBps"),
  });
  const limits = deepFreeze({
    maximumAssessors: positive(input.limits.maximumAssessors, "maximumAssessors"),
    maximumReasonCodes: positive(input.limits.maximumReasonCodes, "maximumReasonCodes"),
    maximumEvidenceDigests: positive(input.limits.maximumEvidenceDigests, "maximumEvidenceDigests"),
    maximumCourseActionCandidates: positive(input.limits.maximumCourseActionCandidates, "maximumCourseActionCandidates"),
    maximumCourseActionHistory: positive(input.limits.maximumCourseActionHistory, "maximumCourseActionHistory"),
    maximumRetainedDecisions: positive(input.limits.maximumRetainedDecisions, "maximumRetainedDecisions"),
    maximumCommitAttempts: positive(input.limits.maximumCommitAttempts, "maximumCommitAttempts"),
    maximumSequence: positive(input.limits.maximumSequence, "maximumSequence"),
    maximumLogicalTimeMs: positive(input.limits.maximumLogicalTimeMs, "maximumLogicalTimeMs"),
    maximumActionPayloadBytes: positive(input.limits.maximumActionPayloadBytes, "maximumActionPayloadBytes"),
    actionAuthorizationTtlMs: positive(input.limits.actionAuthorizationTtlMs, "actionAuthorizationTtlMs"),
    assessorTimeoutMs: positive(input.limits.assessorTimeoutMs, "assessorTimeoutMs"),
  });
  const enforcingAssessorIds = identifiers(input.enforcingAssessorIds, "enforcingAssessorIds", limits.maximumAssessors);
  const minimumIndependenceGroups = positive(input.minimumIndependenceGroups, "minimumIndependenceGroups");
  const minimumGroupsPerDimension = positive(input.minimumGroupsPerDimension, "minimumGroupsPerDimension");
  if (minimumIndependenceGroups > limits.maximumAssessors || minimumGroupsPerDimension > limits.maximumAssessors)
    fail("semantic_policy_quorum_exceeds_assessor_limit");
  const body = deepFreeze({
    schemaVersion: 1 as const,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    thresholds,
    minimumIndependenceGroups,
    minimumGroupsPerDimension,
    enforcingAssessorIds,
    limits,
  });
  return deepFreeze({
    ...body,
    policyDigest: digestSemanticControlV1("policy", body as unknown as JsonValue),
  });
}

export function validateSemanticControlPolicyV1(input: SemanticControlPolicyV1): SemanticControlPolicyV1 {
  const { policyDigest, ...body } = input;
  assertDigest(policyDigest, "policyDigest");
  const rebuilt = createSemanticControlPolicyV1(body);
  if (rebuilt.policyDigest !== policyDigest) fail("semantic_policy_digest_invalid");
  return rebuilt;
}

export function createSemanticControlBindingV1(
  input: Omit<SemanticControlBindingV1, "bindingDigest">,
): SemanticControlBindingV1 {
  assertExactKeys(input, bindingInputKeys, "semantic binding input");
  if (input.schemaVersion !== 1) fail("semantic_binding_schema_invalid");
  for (const [key, value] of Object.entries(input)) {
    if (key.endsWith("Digest")) assertDigest(value, key);
    else if (key !== "schemaVersion") id(value, key);
  }
  const body = deepFreeze({ ...input });
  return deepFreeze({
    ...body,
    bindingDigest: digestSemanticControlV1("binding", body as unknown as JsonValue),
  });
}

export function validateSemanticControlBindingV1(input: SemanticControlBindingV1): SemanticControlBindingV1 {
  const { bindingDigest, ...body } = input;
  assertDigest(bindingDigest, "bindingDigest");
  const rebuilt = createSemanticControlBindingV1(body);
  if (rebuilt.bindingDigest !== bindingDigest) fail("semantic_binding_digest_invalid");
  return rebuilt;
}

export function createSemanticAssessorDescriptorV1(
  input: Omit<SemanticAssessorDescriptorV1, "descriptorDigest">,
): SemanticAssessorDescriptorV1 {
  assertExactKeys(input, descriptorInputKeys, "semantic assessor descriptor input");
  if (input.schemaVersion !== 1) fail("semantic_assessor_schema_invalid");
  id(input.assessorId, "assessorId");
  positive(input.assessorVersion, "assessorVersion");
  assertDigest(input.assessorImplementationDigest, "assessorImplementationDigest");
  id(input.independenceGroup, "independenceGroup");
  assertOneOf(input.basis, bases, "basis");
  const supportedDimensions = dimensions(input.supportedDimensions, "supportedDimensions");
  if (!supportedDimensions.length) fail("semantic_assessor_dimensions_empty");
  if (
    input.basis === "reference_digest_heuristic" &&
    supportedDimensions.some((dimension) =>
      !["course_action_diversity", "course_action_novelty"].includes(dimension),
    )
  ) fail("reference_digest_heuristic_cannot_claim_semantic_dimensions");
  const body = deepFreeze({ ...input, supportedDimensions });
  return deepFreeze({
    ...body,
    descriptorDigest: digestSemanticControlV1("descriptor", body as unknown as JsonValue),
  });
}

export function validateSemanticAssessorDescriptorV1(input: SemanticAssessorDescriptorV1): SemanticAssessorDescriptorV1 {
  const { descriptorDigest, ...body } = input;
  assertDigest(descriptorDigest, "descriptorDigest");
  const rebuilt = createSemanticAssessorDescriptorV1(body);
  if (rebuilt.descriptorDigest !== descriptorDigest) fail("semantic_assessor_descriptor_digest_invalid");
  return rebuilt;
}

export function createSemanticControlRequestV1(
  input: Omit<SemanticControlRequestV1, "requestDigest">,
): SemanticControlRequestV1 {
  assertExactKeys(input, requestInputKeys, "semantic request input");
  if (input.schemaVersion !== 1) fail("semantic_request_schema_invalid");
  id(input.requestId, "requestId");
  assertOneOf(input.checkpoint, SEMANTIC_CONTROL_CHECKPOINTS_V1, "checkpoint");
  assertDigest(input.bindingDigest, "bindingDigest");
  assertDigest(input.missionAnchorDigest, "missionAnchorDigest");
  assertDigest(input.roleAnchorDigest, "roleAnchorDigest");
  assertDigest(input.authorityDigest, "authorityDigest");
  positive(input.sequence, "sequence");
  nonNegative(input.step, "step");
  nonNegative(input.logicalTimeMs, "logicalTimeMs");
  assertDigest(input.targetDigest, "targetDigest");
  assertDigest(input.contextDigest, "contextDigest");
  assertDigest(input.materialDigest, "materialDigest");
  if (input.actionPayloadDigest !== null)
    assertDigest(input.actionPayloadDigest, "actionPayloadDigest");
  if ((input.checkpoint === "pre_action") !== (input.actionPayloadDigest !== null))
    fail("semantic_action_payload_digest_checkpoint_mismatch");
  if (input.selectedCourseActionDigest !== null)
    assertDigest(input.selectedCourseActionDigest, "selectedCourseActionDigest");
  const candidateCourseActionDigests = digestList(input.candidateCourseActionDigests, "candidateCourseActionDigests");
  const priorCourseActionDigests = digestList(input.priorCourseActionDigests, "priorCourseActionDigests");
  const normalizedModalities = uniqueSorted(input.modalities, "modalities");
  for (const modality of normalizedModalities) assertOneOf(modality, modalities, "modality");
  assertString(input.materialHandle, "materialHandle");
  if (encoder.encode(input.materialHandle).byteLength > 2048) fail("semantic_material_handle_too_large");
  const digestBody = deepFreeze({
    schemaVersion: 1 as const,
    requestId: input.requestId,
    checkpoint: input.checkpoint,
    bindingDigest: input.bindingDigest,
    missionAnchorDigest: input.missionAnchorDigest,
    roleAnchorDigest: input.roleAnchorDigest,
    authorityDigest: input.authorityDigest,
    sequence: input.sequence,
    step: input.step,
    logicalTimeMs: input.logicalTimeMs,
    targetDigest: input.targetDigest,
    contextDigest: input.contextDigest,
    selectedCourseActionDigest: input.selectedCourseActionDigest,
    candidateCourseActionDigests,
    priorCourseActionDigests,
    modalities: normalizedModalities,
    materialDigest: input.materialDigest,
    actionPayloadDigest: input.actionPayloadDigest,
  });
  return deepFreeze({
    ...digestBody,
    materialHandle: input.materialHandle,
    requestDigest: digestSemanticControlV1("request", digestBody as unknown as JsonValue),
  });
}

export function digestSemanticOperationPayloadV1(
  payload: string,
  maximumBytes?: number,
): string {
  assertString(payload, "operationPayload");
  if (maximumBytes !== undefined) {
    positive(maximumBytes, "maximumActionPayloadBytes");
    if (encoder.encode(payload).byteLength > maximumBytes)
      fail("semantic_action_payload_too_large");
  }
  return digestSemanticControlV1("operation-payload", payload);
}

export function createSemanticActionAuthorizationClaimsV1(
  input: Omit<SemanticActionAuthorizationClaimsV1, "claimsDigest">,
): SemanticActionAuthorizationClaimsV1 {
  assertExactKeys(input, actionAuthorizationClaimsInputKeys, "semantic action authorization claims input");
  if (input.schemaVersion !== 1) fail("semantic_action_authorization_claims_schema_invalid");
  id(input.authorizationId, "authorizationId");
  assertDigest(input.requestDigest, "requestDigest");
  assertDigest(input.decisionDigest, "decisionDigest");
  assertDigest(input.bindingDigest, "bindingDigest");
  assertDigest(input.authorityDigest, "authorityDigest");
  assertDigest(input.policyDigest, "policyDigest");
  assertDigest(input.assessorSetDigest, "assessorSetDigest");
  assertDigest(input.effectConsumerDigest, "effectConsumerDigest");
  id(input.sinkId, "sinkId");
  assertDigest(input.sinkKeyDigest, "sinkKeyDigest");
  assertDigest(input.targetDigest, "targetDigest");
  assertDigest(input.materialDigest, "materialDigest");
  assertDigest(input.actionPayloadDigest, "actionPayloadDigest");
  positive(input.sequence, "sequence");
  positive(input.committedStateRevision, "committedStateRevision");
  nonNegative(input.validFromLogicalTimeMs, "validFromLogicalTimeMs");
  nonNegative(input.validUntilLogicalTimeMs, "validUntilLogicalTimeMs");
  if (input.validUntilLogicalTimeMs < input.validFromLogicalTimeMs)
    fail("semantic_action_authorization_window_invalid");
  const body = deepFreeze({ ...input });
  return deepFreeze({
    ...body,
    claimsDigest: digestSemanticControlV1("action-authorization-claims", body as unknown as JsonValue),
  });
}

export function validateSemanticActionAuthorizationClaimsV1(
  input: SemanticActionAuthorizationClaimsV1,
): SemanticActionAuthorizationClaimsV1 {
  const { claimsDigest, ...body } = input;
  assertDigest(claimsDigest, "claimsDigest");
  const rebuilt = createSemanticActionAuthorizationClaimsV1(body);
  if (rebuilt.claimsDigest !== claimsDigest)
    fail("semantic_action_authorization_claims_digest_invalid");
  return rebuilt;
}

export function validateSemanticActionAuthorizationV1(
  input: SemanticActionAuthorizationV1,
  expected?: { readonly issuerId: string; readonly issuerKeyDigest: string },
): SemanticActionAuthorizationV1 {
  assertExactKeys(input, actionAuthorizationKeys, "semantic action authorization");
  if (input.schemaVersion !== 1) fail("semantic_action_authorization_schema_invalid");
  const claims = validateSemanticActionAuthorizationClaimsV1(input.claims);
  id(input.issuerId, "issuerId");
  assertDigest(input.issuerKeyDigest, "issuerKeyDigest");
  assertDigest(input.authorizationDigest, "authorizationDigest");
  if (
    expected &&
    (input.issuerId !== expected.issuerId ||
      input.issuerKeyDigest !== expected.issuerKeyDigest)
  ) fail("semantic_action_authorization_issuer_mismatch");
  return deepFreeze({ ...input, claims });
}

export function createSemanticActionEffectReceiptV1(
  input: Omit<SemanticActionEffectReceiptV1, "receiptDigest">,
): SemanticActionEffectReceiptV1 {
  assertExactKeys(input, actionEffectReceiptInputKeys, "semantic action effect receipt input");
  if (input.schemaVersion !== 1) fail("semantic_action_effect_receipt_schema_invalid");
  assertDigest(input.authorizationDigest, "authorizationDigest");
  assertDigest(input.effectConsumerDigest, "effectConsumerDigest");
  id(input.sinkId, "sinkId");
  assertDigest(input.sinkKeyDigest, "sinkKeyDigest");
  assertDigest(input.outcomeDigest, "outcomeDigest");
  nonNegative(input.committedAtLogicalTimeMs, "committedAtLogicalTimeMs");
  const body = deepFreeze({ ...input });
  return deepFreeze({
    ...body,
    receiptDigest: digestSemanticControlV1(
      "action-effect-receipt",
      body as unknown as JsonValue,
    ),
  });
}

export function validateSemanticActionEffectReceiptV1(
  input: SemanticActionEffectReceiptV1,
): SemanticActionEffectReceiptV1 {
  const { receiptDigest, ...body } = input;
  assertDigest(receiptDigest, "receiptDigest");
  const rebuilt = createSemanticActionEffectReceiptV1(body);
  if (rebuilt.receiptDigest !== receiptDigest)
    fail("semantic_action_effect_receipt_digest_invalid");
  return rebuilt;
}

export function validateSemanticControlRequestV1(input: SemanticControlRequestV1): SemanticControlRequestV1 {
  const { requestDigest, ...body } = input;
  assertDigest(requestDigest, "requestDigest");
  const rebuilt = createSemanticControlRequestV1(body);
  if (rebuilt.requestDigest !== requestDigest) fail("semantic_request_digest_invalid");
  return rebuilt;
}

export function createSemanticAssessorAssessmentV1(
  input: Omit<SemanticAssessorAssessmentV1, "assessmentDigest">,
): SemanticAssessorAssessmentV1 {
  assertExactKeys(input, assessorAssessmentInputKeys, "semantic assessor assessment input");
  assertExactKeys(input.metrics, metricKeys, "semantic assessor metrics");
  if (input.schemaVersion !== 1) fail("semantic_assessment_schema_invalid");
  assertDigest(input.requestDigest, "requestDigest");
  id(input.assessorId, "assessorId");
  positive(input.assessorVersion, "assessorVersion");
  assertDigest(input.assessorImplementationDigest, "assessorImplementationDigest");
  id(input.independenceGroup, "independenceGroup");
  const metrics = normalizeMetrics(input.metrics);
  const hardConstraintViolations = uniqueSorted(input.hardConstraintViolations, "hardConstraintViolations");
  for (const violation of hardConstraintViolations) assertOneOf(violation, violations, "hardConstraintViolation");
  assertOneOf(input.recommendation, dispositions, "recommendation");
  const reasonCodes = tokens(input.reasonCodes, "reasonCodes", 64);
  const evidenceDigests = digests(input.evidenceDigests, "evidenceDigests");
  const body = deepFreeze({ ...input, metrics, hardConstraintViolations, reasonCodes, evidenceDigests });
  return deepFreeze({
    ...body,
    assessmentDigest: digestSemanticControlV1("assessor-assessment", body as unknown as JsonValue),
  });
}

export function validateSemanticAssessorAssessmentV1(
  input: SemanticAssessorAssessmentV1,
  descriptor: SemanticAssessorDescriptorV1,
  request: SemanticControlRequestV1,
  policy: SemanticControlPolicyV1,
): SemanticAssessorAssessmentV1 {
  const { assessmentDigest, ...body } = input;
  const rebuilt = createSemanticAssessorAssessmentV1(body);
  if (rebuilt.assessmentDigest !== assessmentDigest) fail("semantic_assessment_digest_invalid");
  if (
    rebuilt.requestDigest !== request.requestDigest ||
    rebuilt.assessorId !== descriptor.assessorId ||
    rebuilt.assessorVersion !== descriptor.assessorVersion ||
    rebuilt.assessorImplementationDigest !== descriptor.assessorImplementationDigest ||
    rebuilt.independenceGroup !== descriptor.independenceGroup
  ) fail("semantic_assessment_binding_invalid");
  const values = metricEntries(rebuilt.metrics);
  for (const [dimension, value] of values)
    if (value !== null && !descriptor.supportedDimensions.includes(dimension))
      fail("semantic_assessment_unsupported_dimension");
  if (rebuilt.reasonCodes.length > policy.limits.maximumReasonCodes || rebuilt.evidenceDigests.length > policy.limits.maximumEvidenceDigests)
    fail("semantic_assessment_bounds_exceeded");
  return rebuilt;
}

export function createSemanticAggregateAssessmentV1(
  input: Omit<SemanticAggregateAssessmentV1, "assessmentDigest">,
): SemanticAggregateAssessmentV1 {
  assertDigest(input.requestDigest, "aggregate.requestDigest");
  assertOneOf(input.disposition, dispositions, "aggregate.disposition");
  normalizeMetrics(input.metrics);
  for (const count of Object.values(input.dimensionGroupCounts))
    assertSafeInteger(count, "aggregate.dimensionGroupCount");
  for (const digest of input.evidenceDigests) assertDigest(digest, "aggregate.evidenceDigest");
  const body = deepFreeze({ ...input });
  return deepFreeze({
    ...body,
    assessmentDigest: digestSemanticControlV1("aggregate-assessment", body as unknown as JsonValue),
  });
}

export function validateSemanticAggregateAssessmentV1(
  input: SemanticAggregateAssessmentV1,
): SemanticAggregateAssessmentV1 {
  const { assessmentDigest, ...body } = input;
  assertDigest(assessmentDigest, "aggregate.assessmentDigest");
  const rebuilt = createSemanticAggregateAssessmentV1(body);
  if (rebuilt.assessmentDigest !== assessmentDigest)
    fail("semantic_aggregate_assessment_digest_invalid");
  return rebuilt;
}

export function validateSemanticControlDecisionV1(
  input: SemanticControlDecisionV1,
): SemanticControlDecisionV1 {
  if (input.schemaVersion !== 1) fail("semantic_decision_schema_invalid");
  id(input.requestId, "decision.requestId");
  assertDigest(input.requestDigest, "decision.requestDigest");
  assertOneOf(input.checkpoint, SEMANTIC_CONTROL_CHECKPOINTS_V1, "decision.checkpoint");
  assertOneOf(input.disposition, dispositions, "decision.disposition");
  if (typeof input.proceed !== "boolean") fail("semantic_decision_proceed_invalid");
  if (
    input.proceed !==
      (input.disposition === "allow" ||
        (input.checkpoint === "pre_step" && input.disposition === "steer"))
  ) fail("semantic_decision_proceed_disposition_mismatch");
  validateSemanticAggregateAssessmentV1(input.aggregate);
  if (input.aggregate.requestDigest !== input.requestDigest)
    fail("semantic_decision_aggregate_binding_invalid");
  if (input.ensembleDecision !== null)
    assertOneOf(
      input.ensembleDecision,
      ["allow", "modify", "block", "unresolved"] as const,
      "decision.ensembleDecision",
    );
  if (input.ensembleVerdictDigest !== null)
    assertDigest(input.ensembleVerdictDigest, "decision.ensembleVerdictDigest");
  if ((input.ensembleDecision === null) !== (input.ensembleVerdictDigest === null))
    fail("semantic_decision_ensemble_evidence_mismatch");
  if (input.interventionAllowed !== null && typeof input.interventionAllowed !== "boolean")
    fail("semantic_decision_intervention_allowed_invalid");
  for (const digest of input.interventionAssessmentDigests)
    assertDigest(digest, "decision.interventionAssessmentDigest");
  assertSafeInteger(input.priorStateRevision, "decision.priorStateRevision");
  assertSafeInteger(input.committedStateRevision, "decision.committedStateRevision");
  const { decisionDigest, ...body } = input;
  assertDigest(decisionDigest, "decision.decisionDigest");
  if (digestSemanticControlV1("decision", body as unknown as JsonValue) !== decisionDigest)
    fail("semantic_decision_digest_invalid");
  return deepFreeze(input);
}

export function metricEntries(metrics: SemanticMetricVectorV1): readonly (readonly [SemanticControlDimensionV1, number | null])[] {
  return [
    ["role_coherence", metrics.roleCoherenceBps],
    ["mission_alignment", metrics.missionAlignmentBps],
    ["context_conflict", metrics.contextConflictBps],
    ["uncertainty", metrics.uncertaintyBps],
    ["course_action_diversity", metrics.courseActionDiversityBps],
    ["course_action_novelty", metrics.courseActionNoveltyBps],
  ];
}

export function dimensionMetricKey(dimension: SemanticControlDimensionV1): keyof SemanticMetricVectorV1 {
  return ({
    role_coherence: "roleCoherenceBps",
    mission_alignment: "missionAlignmentBps",
    context_conflict: "contextConflictBps",
    uncertainty: "uncertaintyBps",
    course_action_diversity: "courseActionDiversityBps",
    course_action_novelty: "courseActionNoveltyBps",
  } as const)[dimension];
}

function normalizeMetrics(input: SemanticMetricVectorV1): SemanticMetricVectorV1 {
  return deepFreeze({
    roleCoherenceBps: nullableBps(input.roleCoherenceBps, "roleCoherenceBps"),
    missionAlignmentBps: nullableBps(input.missionAlignmentBps, "missionAlignmentBps"),
    contextConflictBps: nullableBps(input.contextConflictBps, "contextConflictBps"),
    uncertaintyBps: nullableBps(input.uncertaintyBps, "uncertaintyBps"),
    courseActionDiversityBps: nullableBps(input.courseActionDiversityBps, "courseActionDiversityBps"),
    courseActionNoveltyBps: nullableBps(input.courseActionNoveltyBps, "courseActionNoveltyBps"),
  });
}

function dimensions(values: readonly SemanticControlDimensionV1[], label: string) {
  const result = uniqueSorted(values, label);
  for (const value of result) assertOneOf(value, SEMANTIC_CONTROL_DIMENSIONS_V1, label);
  return result;
}
function identifiers(values: readonly string[], label: string, maximum: number) {
  if (values.length > maximum) fail(`${label}_too_many`);
  const result = uniqueSorted(values, label);
  for (const value of result) id(value, label);
  return result;
}
function tokens(values: readonly string[], label: string, maximum: number) {
  if (values.length > maximum) fail(`${label}_too_many`);
  const result = uniqueSorted(values, label);
  for (const value of result)
    if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(value)) fail(`${label}_invalid`);
  return result;
}
function digests(values: readonly string[], label: string) {
  const result = uniqueSorted(values, label);
  for (const [index, value] of result.entries()) assertDigest(value, `${label}[${index}]`);
  return result;
}
function digestList(values: readonly string[], label: string) {
  const result = [...values];
  for (const [index, value] of result.entries()) assertDigest(value, `${label}[${index}]`);
  return deepFreeze(result);
}
function uniqueSorted<T extends string>(values: readonly T[], label: string): readonly T[] {
  const result = [...new Set(values)].sort() as T[];
  if (result.length !== values.length) fail(`${label}_must_be_unique`);
  return deepFreeze(result);
}
function nullableBps(value: number | null, label: string) { return value === null ? null : bps(value, label); }
function bps(value: number, label: string) { assertSafeInteger(value, label); if (value > 10_000) fail(`${label}_must_be_bps`); return value; }
function positive(value: number, label: string) { assertSafeInteger(value, label, 1); return value; }
function nonNegative(value: number, label: string) { assertSafeInteger(value, label); return value; }
function id(value: unknown, label: string) { assertIdentifier(value, label); return value as string; }
function fail(code: string): never { throw new TypeError(code); }

export function semanticAssessorBasisV1(value: SemanticAssessorBasisV1): SemanticAssessorBasisV1 {
  assertOneOf(value, bases, "basis");
  return value;
}
export function semanticDispositionV1(value: SemanticControlDispositionV1): SemanticControlDispositionV1 {
  assertOneOf(value, dispositions, "disposition");
  return value;
}
export function semanticViolationV1(value: SemanticConstraintViolationV1): SemanticConstraintViolationV1 {
  assertOneOf(value, violations, "violation");
  return value;
}
