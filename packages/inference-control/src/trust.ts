import {
  assertExactKeys,
  assertSafeInteger,
  createTrustEligibilityRequestV1,
  createEvidenceClaimV1,
  deepFreeze,
  digestScopeV1,
  digestSubjectV1,
  digestTrustProfileKeyV1,
  digestTrustJsonV1,
  evaluateTrustEligibilityV1,
  restoreEvidenceTrustSnapshotV1,
  validateEvidenceScopeV1,
  validateEvidenceTrustStateV1,
  validateTrustSubjectV1,
  type EvidenceClaimV1,
  type EvidenceOutcomeV1,
  type EvidenceReferenceV1,
  type EvidenceScopeV1,
  type EvidenceTrustDependencyBindingV1,
  type EvidenceTrustRestoreOptionsV1,
  type EvidenceTrustRollbackAnchorV1,
  type EvidenceTrustSnapshotProtectorV1,
  type EvidenceTrustSnapshotV1,
  type EvidenceTrustStateV1,
  type TrustEligibilityDecisionV1 as EvidenceTrustEligibilityDecisionV1,
  type TrustEligibilityRequirementV1,
  type TrustReasonCodeV1,
  type TrustSubjectV1,
} from "@agentplat/trust";

import { digestControlJsonV1 } from "./canonical.js";
import type {
  AssessmentRequestV1,
  ControlScopeV1,
  InferenceAssessmentV1,
} from "./types.js";
import {
  actionDigest,
  scopeDigest,
  type ActionBinding,
  type ActionDispatcher,
  type ActionGrant,
  type ActionScope,
} from "./tools.js";
import {
  outboundMessageDigest,
  type OutboundMessage,
  type OutboundMessageAttempt,
  type OutboundMessageDispatcher,
} from "./messages.js";

/**
 * Local mapping from an accepted Inference Control outcome to a Trust Claim.
 * It contains no model, action, or message content.
 */
export interface InferenceControlTrustClaimMappingV1 {
  readonly schemaVersion: 1;
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly mappingDigest: string;
  readonly sourceId: string;
  readonly subject: TrustSubjectV1;
  readonly scope: EvidenceScopeV1;
  readonly criterionId: string;
  readonly outcome: EvidenceOutcomeV1;
}

export interface CreateInferenceControlTrustClaimMappingInputV1 {
  readonly schemaVersion: 1;
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly sourceId: string;
  readonly subject: TrustSubjectV1;
  readonly scope: EvidenceScopeV1;
  readonly criterionId: string;
  readonly outcome: EvidenceOutcomeV1;
}

export interface AcceptedInferenceOutcomeClaimInputV1 {
  readonly schemaVersion: 1;
  readonly assessmentRequest: AssessmentRequestV1;
  readonly assessment: InferenceAssessmentV1;
  readonly assessorBindingDigest: string;
  readonly dependencyBindingDigest: string;
  readonly mapping: InferenceControlTrustClaimMappingV1;
  readonly observedAt: string | null;
}

export interface AcceptedActionDispatchClaimInputV1 extends AcceptedInferenceOutcomeClaimInputV1 {
  readonly grant: ActionGrant;
  readonly binding: ActionBinding;
  readonly dispatcher: ActionDispatcher;
}

export interface AcceptedOutboundMessageClaimInputV1 extends AcceptedInferenceOutcomeClaimInputV1 {
  readonly attempt: OutboundMessageAttempt;
  readonly dispatcher: OutboundMessageDispatcher;
}

/**
 * Returns an exact, content-free reference to the accepted assessment request.
 * The reference digest commits to the whole request record, including its
 * target and scope, but the Claim only carries this digest and identifiers.
 */
export function createAssessmentRequestReferenceV1(
  request: AssessmentRequestV1,
): EvidenceReferenceV1 {
  return controlReference(
    "assessment_request",
    request.assessmentRequestId,
    digestControlJsonV1("trace", request as never),
  );
}

/**
 * Creates a local Claim candidate only; callers decide whether to admit it to
 * Trust state. Candidate references intentionally bind identifiers and
 * digests, never prompts, output, arguments, or message payloads.
 */
export function createClaimCandidateFromAcceptedInferenceOutcomeV1(
  input: AcceptedInferenceOutcomeClaimInputV1,
): EvidenceClaimV1 {
  return createAcceptedOutcomeClaimCandidate(input, []);
}

/**
 * Converts a terminal, dispatched Action Gateway outcome to a local Claim
 * candidate. It verifies an already accepted assessment; it never creates or
 * consumes an Action Grant.
 */
export function createClaimCandidateFromAcceptedActionDispatchV1(
  input: AcceptedActionDispatchClaimInputV1,
): EvidenceClaimV1 {
  assertAcceptedAssessment(input.assessmentRequest, input.assessment);
  const dispatcherBindingDigest = digestActionDispatcherBindingV1(
    input.dispatcher,
  );
  const grant = input.grant;
  if (
    input.assessmentRequest.checkpoint !== "pre_tool" ||
    input.assessmentRequest.targetKind !== "action" ||
    grant.status !== "dispatched" ||
    grant.assessmentRequestId !== input.assessmentRequest.assessmentRequestId ||
    grant.assessmentId !== input.assessment.assessmentId ||
    grant.assessmentTargetDigest !== input.assessment.targetDigest ||
    grant.scopeDigest !== controlScopeDigest(input.assessmentRequest.scope) ||
    grant.scopeDigest !== controlScopeDigest(grant.scope) ||
    grant.actionBindingId !== input.binding.actionBindingId ||
    grant.actionBindingVersion !== input.binding.actionBindingVersion ||
    grant.namespace !== input.binding.namespace ||
    grant.toolId !== input.binding.toolId ||
    grant.operation !== input.binding.operation ||
    grant.handlerDigest !== input.binding.handlerDigest ||
    input.binding.dispatcherId !== input.dispatcher.dispatcherId ||
    input.binding.dispatcherVersion !== input.dispatcher.dispatcherVersion ||
    input.binding.fencingMode !== input.dispatcher.fencingMode ||
    grant.actionDigest !== actionDigest(grant, input.binding)
  )
    throw new Error("accepted_terminal_outcome_mismatch");
  return createAcceptedOutcomeClaimCandidate(input, [
    controlReference(
      "action_gateway_outcome",
      grant.grantId,
      digestControlJsonV1("trace", {
        schemaVersion: 1,
        grantId: grant.grantId,
        stateGeneration: grant.stateGeneration,
        scopeDigest: grant.scopeDigest,
        actionDigest: grant.actionDigest,
        assessmentRequestId: grant.assessmentRequestId,
        assessmentId: grant.assessmentId,
        status: grant.status,
      }),
    ),
    trustReference(
      "action_dispatcher_binding",
      input.dispatcher.dispatcherId,
      dispatcherBindingDigest,
    ),
  ]);
}

/**
 * Converts a terminal, sent outbound-message outcome to a local Claim
 * candidate. It references digests only and never copies the message body.
 */
export function createClaimCandidateFromAcceptedOutboundMessageV1(
  input: AcceptedOutboundMessageClaimInputV1,
): EvidenceClaimV1 {
  assertAcceptedAssessment(input.assessmentRequest, input.assessment);
  const dispatcherBindingDigest = digestOutboundMessageDispatcherBindingV1(
    input.dispatcher,
  );
  const attempt = input.attempt;
  if (
    input.assessmentRequest.checkpoint !== "pre_message" ||
    input.assessmentRequest.targetKind !== "outbound_message" ||
    attempt.status !== "sent" ||
    attempt.assessmentRequestId !==
      input.assessmentRequest.assessmentRequestId ||
    attempt.assessmentId !== input.assessment.assessmentId ||
    attempt.scopeDigest !== controlScopeDigest(input.assessmentRequest.scope) ||
    attempt.messageDigest !== input.assessment.targetDigest ||
    attempt.dispatcherId !== input.dispatcher.dispatcherId ||
    attempt.dispatcherVersion !== input.dispatcher.dispatcherVersion ||
    attempt.dispatcherDigest !== input.dispatcher.dispatcherDigest
  )
    throw new Error("accepted_terminal_outcome_mismatch");
  return createAcceptedOutcomeClaimCandidate(input, [
    controlReference(
      "outbound_message_gateway_outcome",
      attempt.messageAttemptId,
      digestControlJsonV1("trace", {
        schemaVersion: 1,
        messageAttemptId: attempt.messageAttemptId,
        messageId: attempt.messageId,
        scopeDigest: attempt.scopeDigest,
        messageDigest: attempt.messageDigest,
        assessmentRequestId: attempt.assessmentRequestId,
        assessmentId: attempt.assessmentId,
        status: attempt.status,
      }),
    ),
    trustReference(
      "outbound_message_dispatcher_binding",
      input.dispatcher.dispatcherId,
      dispatcherBindingDigest,
    ),
  ]);
}

export function createInferenceControlTrustClaimMappingV1(
  input: CreateInferenceControlTrustClaimMappingInputV1,
): InferenceControlTrustClaimMappingV1 {
  if (input.schemaVersion !== 1) throw new TypeError("trust_mapping_invalid");
  assertIdentifier(input.mappingId, "mappingId");
  assertPositiveInteger(input.mappingVersion, "mappingVersion");
  assertIdentifier(input.sourceId, "sourceId");
  assertIdentifier(input.criterionId, "criterionId");
  if (!["satisfied", "violated", "inconclusive"].includes(input.outcome))
    throw new TypeError("trust_mapping_invalid");
  const mappingDigest = digestTrustJsonV1("dependency-binding", {
    schemaVersion: 1,
    mappingId: input.mappingId,
    mappingVersion: input.mappingVersion,
    sourceId: input.sourceId,
    subject: input.subject,
    scope: input.scope,
    criterionId: input.criterionId,
    outcome: input.outcome,
  } as never);
  return Object.freeze({ ...input, mappingDigest });
}

export type TrustEligibilityModeV1 = "observe" | "restrict";
export type TrustEligibilityStatusV1 =
  | "eligible"
  | "restricted"
  | "unavailable"
  | "stale"
  | "mismatch"
  | "quarantined";
export type TrustEligibilityOperationV1 =
  "model" | "action" | "outbound_message";

/** A content-free subject for an opt-in eligibility lookup. */
export interface TrustEligibilityTargetV1 {
  readonly schemaVersion: 1;
  readonly operation: TrustEligibilityOperationV1;
  readonly tenantId: string;
  readonly runId: string;
  readonly scopeDigest: string;
  readonly targetDigest: string;
}

export interface TrustEligibilityDecisionV1 {
  readonly schemaVersion: 1;
  readonly status: TrustEligibilityStatusV1;
  readonly policyDigest: string;
  readonly resolverDigest: string;
  readonly mappingDigest: string;
  readonly scopeDigest: string;
  readonly targetDigest: string;
}

/**
 * This is deliberately synchronous. Wrappers invoke it immediately before
 * delegation, leaving no asynchronous gap after their final revalidation.
 */
export interface TrustEligibilityResolverV1 {
  readonly resolverId: string;
  readonly resolverVersion: number;
  readonly resolverDigest: string;
  resolve(target: TrustEligibilityTargetV1): TrustEligibilityDecisionV1;
}

export interface TrustEligibilityPolicyBindingV1 {
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly mode: TrustEligibilityModeV1;
}

export interface TrustEligibilityMappingBindingV1 {
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly mappingDigest: string;
}

export interface TrustEligibilityIntegrationV1 {
  readonly policy: TrustEligibilityPolicyBindingV1;
  readonly resolver: TrustEligibilityResolverV1;
  readonly mapping: TrustEligibilityMappingBindingV1;
  readonly onDiagnostic?: (diagnostic: TrustEligibilityDiagnosticV1) => void;
}

/** Model-boundary bindings must be explicit because no dispatcher is present. */
export interface TrustModelEligibilityIntegrationV1 extends TrustEligibilityIntegrationV1 {
  readonly modelBindingDigest: string;
}

export interface TrustEligibilityDiagnosticV1 {
  readonly schemaVersion: 1;
  readonly operation: TrustEligibilityOperationV1;
  readonly mode: TrustEligibilityModeV1;
  readonly status: TrustEligibilityStatusV1;
  readonly bindingDigest: string;
}

export interface TrustBoundActionDispatcherV1 extends ActionDispatcher {
  readonly trustBindingDigest: string;
}

export interface TrustBoundOutboundMessageDispatcherV1 extends OutboundMessageDispatcher {
  readonly trustBindingDigest: string;
}

export interface InferenceControlTrustModelBoundaryV1<T> {
  readonly modelBoundaryId: string;
  readonly modelBoundaryVersion: number;
  readonly implementationDigest: string;
  run(target: TrustEligibilityTargetV1): T;
}

export interface TrustBoundModelBoundaryV1<
  T,
> extends InferenceControlTrustModelBoundaryV1<T> {
  readonly trustBindingDigest: string;
}

export interface InferenceControlTrustSubjectMappingInputV1 {
  readonly controlTenantId: string;
  readonly controlRunId: string;
  readonly controlScopeDigest: string;
  readonly trustSubject: TrustSubjectV1;
  readonly trustScope: EvidenceScopeV1;
}

export interface InferenceControlTrustRuntimeSourceBindingInputV1 {
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly protectorBindingDigest: string;
}

export interface InferenceControlTrustStateEligibilityConfigV1 extends InferenceControlTrustSubjectMappingInputV1 {
  readonly schemaVersion: 1;
  readonly operation: TrustEligibilityOperationV1;
  readonly mode: TrustEligibilityModeV1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly maximumProfileAgeMs: number;
  readonly requirements: readonly TrustEligibilityRequirementV1[];
  readonly subjectMappingDigest: string;
  readonly runtimeSourceBindingDigest: string;
  readonly profileResolverBindingDigest: string;
  readonly boundaryBindingDigest: string;
  readonly baseBindingDigest: string;
}

export interface InferenceControlTrustEligibilityRuntimeV1 {
  readonly schemaVersion: 1;
  readonly runtimeId: string;
}

export interface InferenceControlTrustEligibilityRuntimeSampleV1 {
  readonly schemaVersion: 1;
  readonly runtime: InferenceControlTrustEligibilityRuntimeV1;
  readonly rollbackAnchor: EvidenceTrustRollbackAnchorV1;
}

/**
 * Trusted-computing-base adapter for the application's durable Trust head.
 * `current` must synchronously and atomically read the durable high-water
 * anchor and return its exact restored token; it must not serve a cache.
 */
export interface InferenceControlTrustEligibilityRuntimeSourceV1 extends InferenceControlTrustRuntimeSourceBindingInputV1 {
  readonly bindingDigest: string;
  current(): InferenceControlTrustEligibilityRuntimeSampleV1;
}

export interface InferenceControlTrustStateIntegrationV1 {
  readonly config: InferenceControlTrustStateEligibilityConfigV1;
  readonly runtime: InferenceControlTrustEligibilityRuntimeSourceV1;
  readonly onDiagnostic?: (diagnostic: TrustEligibilityDiagnosticV1) => void;
}

export interface InferenceControlTrustStateEligibilityResultV1 {
  readonly status: "eligible" | "restricted" | "quarantined" | "unavailable";
  readonly eligibilityDecisionId: string | null;
  readonly reasonCodes: readonly TrustReasonCodeV1[];
}

const maximumTrustEligibilityStateIdentities = 4_096;
const verifiedTrustEligibilityRuntimes = new WeakMap<
  object,
  {
    readonly runtimeId: string;
    readonly stateId: string;
    readonly generation: number;
    readonly snapshotDigest: string;
    readonly logicalTimeMs: number;
    readonly runtimeSourceBindingDigest: string;
    readonly rollbackAnchor: EvidenceTrustRollbackAnchorV1;
    readonly state: EvidenceTrustStateV1;
  }
>();
const latestTrustEligibilitySnapshotByStateId = new Map<
  string,
  { readonly generation: number; readonly snapshotDigest: string }
>();

export function digestInferenceControlTrustRuntimeSourceBindingV1(
  value: InferenceControlTrustRuntimeSourceBindingInputV1,
): string {
  assertIdentifier(value.sourceId, "sourceId");
  assertPositiveInteger(value.sourceVersion, "sourceVersion");
  assertTrustDigest(value.protectorBindingDigest, "protectorBindingDigest");
  return digestTrustJsonV1("dependency-binding", {
    schemaVersion: 1,
    kind: "inference_trust_runtime_source",
    sourceId: value.sourceId,
    sourceVersion: value.sourceVersion,
    protectorBindingDigest: value.protectorBindingDigest,
  });
}

export function digestInferenceControlTrustSubjectMappingV1(
  value: InferenceControlTrustSubjectMappingInputV1,
): string {
  assertIdentifier(value.controlTenantId, "controlTenantId");
  assertIdentifier(value.controlRunId, "controlRunId");
  assertControlDigest(value.controlScopeDigest, "controlScopeDigest");
  const trustSubject = validateTrustSubjectV1(value.trustSubject);
  const trustScope = validateEvidenceScopeV1(value.trustScope);
  if (trustScope.tenantId !== value.controlTenantId)
    throw new TypeError("trust_state_mapping_invalid");
  return digestTrustJsonV1("inference-subject-mapping", {
    schemaVersion: 1,
    controlTenantId: value.controlTenantId,
    controlRunId: value.controlRunId,
    controlScopeDigest: value.controlScopeDigest,
    trustSubjectDigest: digestSubjectV1(trustSubject),
    trustScopeDigest: digestScopeV1(trustScope),
  });
}

const stateEligibilityConfigKeys = [
  "schemaVersion",
  "operation",
  "mode",
  "controlTenantId",
  "controlRunId",
  "controlScopeDigest",
  "trustSubject",
  "trustScope",
  "policyId",
  "policyVersion",
  "policyDigest",
  "maximumProfileAgeMs",
  "requirements",
  "subjectMappingDigest",
  "runtimeSourceBindingDigest",
  "profileResolverBindingDigest",
  "boundaryBindingDigest",
  "baseBindingDigest",
] as const;

export function createInferenceControlTrustStateEligibilityConfigV1(
  value: InferenceControlTrustStateEligibilityConfigV1,
): InferenceControlTrustStateEligibilityConfigV1 {
  try {
    assertExactKeys(
      value,
      stateEligibilityConfigKeys,
      "Inference Control Trust config",
    );
    if (
      value.schemaVersion !== 1 ||
      !["model", "action", "outbound_message"].includes(value.operation) ||
      (value.mode !== "observe" && value.mode !== "restrict")
    )
      throw new TypeError("trust_state_config_invalid");
    assertIdentifier(value.policyId, "policyId");
    assertSafeInteger(value.policyVersion, "policyVersion", 1);
    assertTrustDigest(value.policyDigest, "policyDigest");
    for (const digest of [
      value.subjectMappingDigest,
      value.runtimeSourceBindingDigest,
      value.profileResolverBindingDigest,
      value.boundaryBindingDigest,
      value.baseBindingDigest,
    ])
      assertTrustDigest(digest, "Trust binding digest");
    if (
      value.profileResolverBindingDigest === value.boundaryBindingDigest ||
      value.subjectMappingDigest !==
        digestInferenceControlTrustSubjectMappingV1(value)
    )
      throw new TypeError("trust_state_config_invalid");
    const trustSubject = validateTrustSubjectV1(value.trustSubject);
    const trustScope = validateEvidenceScopeV1(value.trustScope);
    const validationProfileDigest = "0".repeat(64);
    const request = createTrustEligibilityRequestV1({
      schemaVersion: 1,
      tenantId: value.controlTenantId,
      subject: trustSubject,
      subjectDigest: digestSubjectV1(trustSubject),
      scope: trustScope,
      scopeDigest: digestScopeV1(trustScope),
      policyId: value.policyId,
      policyVersion: value.policyVersion,
      policyDigest: value.policyDigest,
      profileId: `profile:${validationProfileDigest}`,
      profileDigest: validationProfileDigest,
      maximumProfileAgeMs: value.maximumProfileAgeMs,
      requirements: value.requirements,
    });
    return deepFreeze({
      ...value,
      trustSubject,
      trustScope,
      requirements: request.requirements,
    });
  } catch (error) {
    throw new TypeError("trust_state_config_invalid", { cause: error });
  }
}

export function digestInferenceControlTrustStateEligibilityConfigV1(
  value: InferenceControlTrustStateEligibilityConfigV1,
): string {
  const config = createInferenceControlTrustStateEligibilityConfigV1(value);
  return digestTrustJsonV1("inference-eligibility-config", {
    schemaVersion: config.schemaVersion,
    operation: config.operation,
    mode: config.mode,
    controlTenantId: config.controlTenantId,
    controlRunId: config.controlRunId,
    controlScopeDigest: config.controlScopeDigest,
    trustSubject: config.trustSubject,
    trustScope: config.trustScope,
    policyId: config.policyId,
    policyVersion: config.policyVersion,
    policyDigest: config.policyDigest,
    maximumProfileAgeMs: config.maximumProfileAgeMs,
    requirements: config.requirements,
    subjectMappingDigest: config.subjectMappingDigest,
    runtimeSourceBindingDigest: config.runtimeSourceBindingDigest,
    baseBindingDigest: config.baseBindingDigest,
  } as never);
}

export function restoreInferenceControlTrustEligibilityRuntimeV1(
  snapshot: EvidenceTrustSnapshotV1,
  anchor: EvidenceTrustRollbackAnchorV1,
  protector: EvidenceTrustSnapshotProtectorV1,
  runtimeSourceBindingDigest: string,
  options: EvidenceTrustRestoreOptionsV1 = {},
): InferenceControlTrustEligibilityRuntimeV1 {
  assertTrustDigest(runtimeSourceBindingDigest, "runtimeSourceBindingDigest");
  const state = restoreEvidenceTrustSnapshotV1(
    snapshot,
    anchor,
    protector,
    options,
  );
  const prior = latestTrustEligibilitySnapshotByStateId.get(snapshot.stateId);
  if (
    !prior &&
    latestTrustEligibilitySnapshotByStateId.size >=
      maximumTrustEligibilityStateIdentities
  )
    throw new TypeError("trust_state_capacity_exceeded");
  if (
    prior &&
    (snapshot.generation < prior.generation ||
      (snapshot.generation === prior.generation &&
        snapshot.snapshotDigest !== prior.snapshotDigest))
  )
    throw new TypeError("trust_state_snapshot_not_current");
  latestTrustEligibilitySnapshotByStateId.set(snapshot.stateId, {
    generation: snapshot.generation,
    snapshotDigest: snapshot.snapshotDigest,
  });
  const rollbackAnchor = deepFreeze({ ...anchor });
  const runtimeId = digestTrustJsonV1("dependency-binding", {
    schemaVersion: 1,
    kind: "inference_trust_eligibility_runtime",
    stateId: snapshot.stateId,
    generation: snapshot.generation,
    snapshotDigest: snapshot.snapshotDigest,
    logicalTimeMs: snapshot.createdAtLogicalMs,
    runtimeSourceBindingDigest,
    rollbackAnchor,
  } as never);
  const runtime = Object.freeze({
    schemaVersion: 1 as const,
    runtimeId,
  });
  verifiedTrustEligibilityRuntimes.set(runtime, {
    runtimeId,
    stateId: snapshot.stateId,
    generation: snapshot.generation,
    snapshotDigest: snapshot.snapshotDigest,
    logicalTimeMs: snapshot.createdAtLogicalMs,
    runtimeSourceBindingDigest,
    rollbackAnchor,
    state,
  });
  return runtime;
}

/**
 * Evaluates an exact Inference Control target against a current, strictly
 * restored Trust snapshot. Runtime failures are projected as unavailable;
 * malformed construction-time configuration remains a caller error.
 */
export function evaluateInferenceControlTrustStateEligibilityV1(
  integration: InferenceControlTrustStateIntegrationV1,
  target: TrustEligibilityTargetV1,
): InferenceControlTrustStateEligibilityResultV1 {
  const snapshot = snapshotTrustStateIntegration(integration);
  assertStateEligibilityTargetBinding(snapshot.config, target);
  const result = evaluateTrustStateEligibilityFromSnapshot(snapshot, target);
  emitTrustStateDiagnostic(snapshot, target, result);
  return result;
}

/** Derives the model boundary binding from its local implementation identity. */
export function digestInferenceControlTrustModelBoundaryV1(
  boundary: Pick<
    InferenceControlTrustModelBoundaryV1<unknown>,
    "modelBoundaryId" | "modelBoundaryVersion" | "implementationDigest"
  >,
): string {
  validateTrustModelBoundaryIdentity(boundary);
  return digestTrustJsonV1("dependency-binding", {
    schemaVersion: 1,
    kind: "model_boundary",
    modelBoundaryId: boundary.modelBoundaryId,
    modelBoundaryVersion: boundary.modelBoundaryVersion,
    implementationDigest: boundary.implementationDigest,
  });
}

/** Derives the real Action dispatcher binding from its public identity. */
export function digestActionDispatcherBindingV1(
  dispatcher: Pick<
    ActionDispatcher,
    "dispatcherId" | "dispatcherVersion" | "fencingMode"
  >,
): string {
  validateActionDispatcherIdentity(dispatcher);
  return digestTrustJsonV1("dependency-binding", {
    schemaVersion: 1,
    kind: "action_dispatcher",
    dispatcherId: dispatcher.dispatcherId,
    dispatcherVersion: dispatcher.dispatcherVersion,
    fencingMode: dispatcher.fencingMode,
  });
}

/** Derives the real Message dispatcher binding, including its dispatcher digest. */
export function digestOutboundMessageDispatcherBindingV1(
  dispatcher: Pick<
    OutboundMessageDispatcher,
    "dispatcherId" | "dispatcherVersion" | "dispatcherDigest" | "fencingMode"
  >,
): string {
  validateMessageDispatcherIdentity(dispatcher);
  return digestTrustJsonV1("dependency-binding", {
    schemaVersion: 1,
    kind: "outbound_message_dispatcher",
    dispatcherId: dispatcher.dispatcherId,
    dispatcherVersion: dispatcher.dispatcherVersion,
    dispatcherDigest: dispatcher.dispatcherDigest,
    fencingMode: dispatcher.fencingMode,
  });
}

export function digestTrustEligibilityBindingV1(
  integration: TrustEligibilityIntegrationV1,
  baseBindingDigest: string,
): string {
  const snapshot = snapshotIntegration(integration);
  assertTrustDigest(baseBindingDigest, "baseBindingDigest");
  return digestTrustEligibilityBindingFromSnapshot(snapshot, baseBindingDigest);
}

/**
 * Runs a model-boundary eligibility check before starting the supplied model
 * operation. Existing executors remain untouched unless this helper is used.
 */
export function runWithTrustEligibilityV1<T>(
  integration: TrustModelEligibilityIntegrationV1,
  target: TrustEligibilityTargetV1,
  run: () => T,
): T {
  const snapshot = snapshotIntegration(integration);
  assertTrustDigest(integration.modelBindingDigest, "modelBindingDigest");
  const bindingDigest = digestTrustEligibilityBindingFromSnapshot(
    snapshot,
    integration.modelBindingDigest,
  );
  requireOrObserveEligibility(snapshot, target, bindingDigest);
  return run();
}

export function wrapActionDispatcherWithTrustV1(
  dispatcher: ActionDispatcher,
  integration: TrustEligibilityIntegrationV1,
  mapTarget: (
    input: Parameters<ActionDispatcher["dispatch"]>[0],
  ) => TrustEligibilityTargetV1,
): TrustBoundActionDispatcherV1 {
  const base = snapshotActionDispatcher(dispatcher);
  const snapshot = snapshotIntegration(integration);
  const bindingDigest = digestTrustEligibilityBindingFromSnapshot(
    snapshot,
    digestActionDispatcherBindingV1(base),
  );
  const map = mapTarget.bind(undefined);
  return Object.freeze({
    dispatcherId: base.dispatcherId,
    dispatcherVersion: base.dispatcherVersion,
    fencingMode: base.fencingMode,
    trustBindingDigest: bindingDigest,
    dispatch: async (input: Parameters<ActionDispatcher["dispatch"]>[0]) => {
      const target = map(input);
      assertActionEligibilityTargetBinding(target, input);
      requireOrObserveEligibility(snapshot, target, bindingDigest);
      return base.dispatch(input);
    },
  });
}

export function wrapOutboundMessageDispatcherWithTrustV1(
  dispatcher: OutboundMessageDispatcher,
  integration: TrustEligibilityIntegrationV1,
  mapTarget: (
    input: Parameters<OutboundMessageDispatcher["send"]>[0],
  ) => TrustEligibilityTargetV1,
): TrustBoundOutboundMessageDispatcherV1 {
  const base = snapshotOutboundMessageDispatcher(dispatcher);
  const snapshot = snapshotIntegration(integration);
  const bindingDigest = digestTrustEligibilityBindingFromSnapshot(
    snapshot,
    digestOutboundMessageDispatcherBindingV1(base),
  );
  const map = mapTarget.bind(undefined);
  return Object.freeze({
    dispatcherId: base.dispatcherId,
    dispatcherVersion: base.dispatcherVersion,
    dispatcherDigest: base.dispatcherDigest,
    fencingMode: base.fencingMode,
    trustBindingDigest: bindingDigest,
    send: async (input: Parameters<OutboundMessageDispatcher["send"]>[0]) => {
      const target = map(input);
      assertOutboundMessageEligibilityTargetBinding(target, input);
      requireOrObserveEligibility(snapshot, target, bindingDigest);
      return base.send(input);
    },
  });
}

/**
 * Runs a model operation only after sampling the current authenticated Trust
 * runtime. No asynchronous gap is introduced between the final check and run.
 */
export function runWithTrustStateEligibilityV1<T>(
  integration: InferenceControlTrustStateIntegrationV1,
  target: TrustEligibilityTargetV1,
  boundary: InferenceControlTrustModelBoundaryV1<T>,
): T {
  return wrapModelBoundaryWithTrustStateV1(boundary, integration).run(target);
}

/**
 * Construction-binds the model implementation and passes the exact target
 * checked by Trust to that same boundary.
 */
export function wrapModelBoundaryWithTrustStateV1<T>(
  boundary: InferenceControlTrustModelBoundaryV1<T>,
  integration: InferenceControlTrustStateIntegrationV1,
): TrustBoundModelBoundaryV1<T> {
  const base = snapshotTrustModelBoundary(boundary);
  const snapshot = snapshotTrustStateIntegration(integration);
  const baseBindingDigest = digestInferenceControlTrustModelBoundaryV1(base);
  if (
    snapshot.config.operation !== "model" ||
    snapshot.config.baseBindingDigest !== baseBindingDigest
  )
    throw new TypeError("trust_state_binding_mismatch");
  return Object.freeze({
    modelBoundaryId: base.modelBoundaryId,
    modelBoundaryVersion: base.modelBoundaryVersion,
    implementationDigest: base.implementationDigest,
    trustBindingDigest: snapshot.config.boundaryBindingDigest,
    run: (targetValue: TrustEligibilityTargetV1) => {
      const target = snapshotTrustEligibilityTarget(targetValue);
      assertStateEligibilityTargetBinding(snapshot.config, target);
      const result = requireTrustStateEligibility(snapshot, target);
      const output = base.run(target);
      emitTrustStateDiagnostic(snapshot, target, result);
      return output;
    },
  });
}

/**
 * Adds a state-backed Trust predicate to an Action dispatcher without
 * changing its grant, authority, reservation, or fencing contracts.
 */
export function wrapActionDispatcherWithTrustStateV1(
  dispatcher: ActionDispatcher,
  integration: InferenceControlTrustStateIntegrationV1,
): TrustBoundActionDispatcherV1 {
  const base = snapshotActionDispatcher(dispatcher);
  const baseBindingDigest = digestActionDispatcherBindingV1(base);
  const snapshot = snapshotTrustStateIntegration(integration);
  if (
    snapshot.config.operation !== "action" ||
    snapshot.config.baseBindingDigest !== baseBindingDigest
  )
    throw new TypeError("trust_state_binding_mismatch");
  return Object.freeze({
    dispatcherId: base.dispatcherId,
    dispatcherVersion: base.dispatcherVersion,
    fencingMode: base.fencingMode,
    trustBindingDigest: snapshot.config.boundaryBindingDigest,
    dispatch: async (input: Parameters<ActionDispatcher["dispatch"]>[0]) => {
      const target = Object.freeze({
        schemaVersion: 1 as const,
        operation: "action" as const,
        tenantId: input.context.tenant.tenantId,
        runId: snapshot.config.controlRunId,
        scopeDigest: input.permit.scopeDigest,
        targetDigest: input.permit.actionDigest,
      });
      assertActionEligibilityTargetBinding(target, input);
      assertStateEligibilityTargetBinding(snapshot.config, target);
      const result = requireTrustStateEligibility(snapshot, target);
      const output = base.dispatch(input);
      emitTrustStateDiagnostic(snapshot, target, result);
      return output;
    },
  });
}

/**
 * Adds a state-backed Trust predicate to an outbound Message dispatcher while
 * preserving the base dispatcher's attempt and fencing behavior.
 */
export function wrapOutboundMessageDispatcherWithTrustStateV1(
  dispatcher: OutboundMessageDispatcher,
  integration: InferenceControlTrustStateIntegrationV1,
): TrustBoundOutboundMessageDispatcherV1 {
  const base = snapshotOutboundMessageDispatcher(dispatcher);
  const baseBindingDigest = digestOutboundMessageDispatcherBindingV1(base);
  const snapshot = snapshotTrustStateIntegration(integration);
  if (
    snapshot.config.operation !== "outbound_message" ||
    snapshot.config.baseBindingDigest !== baseBindingDigest
  )
    throw new TypeError("trust_state_binding_mismatch");
  return Object.freeze({
    dispatcherId: base.dispatcherId,
    dispatcherVersion: base.dispatcherVersion,
    dispatcherDigest: base.dispatcherDigest,
    fencingMode: base.fencingMode,
    trustBindingDigest: snapshot.config.boundaryBindingDigest,
    send: async (input: Parameters<OutboundMessageDispatcher["send"]>[0]) => {
      const target = Object.freeze({
        schemaVersion: 1 as const,
        operation: "outbound_message" as const,
        tenantId: input.message.tenantId,
        runId: input.message.runId,
        scopeDigest: input.permit.scopeDigest,
        targetDigest: input.permit.messageDigest,
      });
      assertOutboundMessageEligibilityTargetBinding(target, input);
      assertStateEligibilityTargetBinding(snapshot.config, target);
      const result = requireTrustStateEligibility(snapshot, target);
      const output = base.send(input);
      emitTrustStateDiagnostic(snapshot, target, result);
      return output;
    },
  });
}

type TrustEligibilityIntegrationSnapshotV1 = Readonly<{
  policy: Readonly<TrustEligibilityPolicyBindingV1>;
  resolver: Readonly<{
    resolverId: string;
    resolverVersion: number;
    resolverDigest: string;
    resolve: TrustEligibilityResolverV1["resolve"];
  }>;
  mapping: Readonly<TrustEligibilityMappingBindingV1>;
  onDiagnostic:
    ((diagnostic: TrustEligibilityDiagnosticV1) => void) | undefined;
}>;

type TrustStateIntegrationSnapshotV1 = Readonly<{
  config: InferenceControlTrustStateEligibilityConfigV1;
  current: InferenceControlTrustEligibilityRuntimeSourceV1["current"];
  runtimeSourceBindingDigest: string;
  protectorBindingDigest: string;
  onDiagnostic:
    ((diagnostic: TrustEligibilityDiagnosticV1) => void) | undefined;
}>;

function snapshotTrustStateIntegration(
  integration: InferenceControlTrustStateIntegrationV1,
): TrustStateIntegrationSnapshotV1 {
  if (!integration || typeof integration !== "object")
    throw new TypeError("trust_state_integration_invalid");
  const config = createInferenceControlTrustStateEligibilityConfigV1(
    integration.config,
  );
  const source = integration.runtime;
  if (
    !source ||
    typeof source !== "object" ||
    typeof source.current !== "function" ||
    (integration.onDiagnostic !== undefined &&
      typeof integration.onDiagnostic !== "function")
  )
    throw new TypeError("trust_state_integration_invalid");
  const runtimeSourceBindingDigest =
    digestInferenceControlTrustRuntimeSourceBindingV1(source);
  if (
    source.bindingDigest !== runtimeSourceBindingDigest ||
    config.runtimeSourceBindingDigest !== runtimeSourceBindingDigest
  )
    throw new TypeError("trust_state_integration_invalid");
  return Object.freeze({
    config,
    current: source.current.bind(source),
    runtimeSourceBindingDigest,
    protectorBindingDigest: source.protectorBindingDigest,
    onDiagnostic:
      integration.onDiagnostic === undefined
        ? undefined
        : integration.onDiagnostic.bind(integration),
  });
}

function assertStateEligibilityTargetBinding(
  config: InferenceControlTrustStateEligibilityConfigV1,
  target: TrustEligibilityTargetV1,
): void {
  validateTarget(target);
  if (
    target.operation !== config.operation ||
    target.tenantId !== config.controlTenantId ||
    target.runId !== config.controlRunId ||
    target.scopeDigest !== config.controlScopeDigest
  )
    throw new Error("trust_eligibility_target_mismatch");
}

function requireTrustStateEligibility(
  integration: TrustStateIntegrationSnapshotV1,
  target: TrustEligibilityTargetV1,
): InferenceControlTrustStateEligibilityResultV1 {
  const result = evaluateTrustStateEligibilityFromSnapshot(integration, target);
  if (integration.config.mode === "restrict" && result.status !== "eligible") {
    emitTrustStateDiagnostic(integration, target, result);
    throw new Error("trust_eligibility_restricted");
  }
  return result;
}

function emitTrustStateDiagnostic(
  integration: TrustStateIntegrationSnapshotV1,
  target: TrustEligibilityTargetV1,
  result: InferenceControlTrustStateEligibilityResultV1,
): void {
  try {
    integration.onDiagnostic?.(
      Object.freeze({
        schemaVersion: 1,
        operation: target.operation,
        mode: integration.config.mode,
        status: result.status,
        bindingDigest: integration.config.boundaryBindingDigest,
      }),
    );
  } catch {
    // Diagnostics are redacted, observational, and cannot alter delegation.
  }
}

function unavailableTrustStateEligibility(
  reasonCode: TrustReasonCodeV1,
): InferenceControlTrustStateEligibilityResultV1 {
  return deepFreeze({
    status: "unavailable" as const,
    eligibilityDecisionId: null,
    reasonCodes: [reasonCode],
  });
}

function trustStateDecisionResult(
  decision: EvidenceTrustEligibilityDecisionV1,
): InferenceControlTrustStateEligibilityResultV1 {
  return deepFreeze({
    status: decision.disposition,
    eligibilityDecisionId: decision.eligibilityDecisionId,
    reasonCodes: decision.reasonCodes,
  });
}

function trustDependencyBindingIsCurrent(
  state: EvidenceTrustStateV1,
  binding: EvidenceTrustDependencyBindingV1 | undefined,
  logicalTimeMs: number,
): binding is EvidenceTrustDependencyBindingV1 {
  return (
    binding !== undefined &&
    binding.registeredAtLogicalMs <= logicalTimeMs &&
    binding.validFromLogicalMs <= logicalTimeMs &&
    (binding.validUntilLogicalMs === null ||
      logicalTimeMs < binding.validUntilLogicalMs) &&
    state.dependencyBindingHeads.some(
      (head) =>
        head.bindingKind === binding.bindingKind &&
        head.bindingName === binding.bindingName &&
        head.bindingVersion === binding.bindingVersion &&
        head.bindingDigest === binding.bindingDigest,
    )
  );
}

function inferenceTrustBindingsAreCurrent(
  state: EvidenceTrustStateV1,
  config: InferenceControlTrustStateEligibilityConfigV1,
  logicalTimeMs: number,
): boolean {
  const resolver = state.dependencyBindings.find(
    (binding) => binding.bindingDigest === config.profileResolverBindingDigest,
  );
  const boundary = state.dependencyBindings.find(
    (binding) => binding.bindingDigest === config.boundaryBindingDigest,
  );
  const expectedBoundaryKind =
    config.operation === "model"
      ? "model_boundary"
      : config.operation === "action"
        ? "action_dispatcher"
        : "message_dispatcher";
  return (
    trustDependencyBindingIsCurrent(state, resolver, logicalTimeMs) &&
    resolver.bindingKind === "profile_resolver" &&
    resolver.policyDigest === config.policyDigest &&
    resolver.subjectMappingDigest === config.subjectMappingDigest &&
    trustDependencyBindingIsCurrent(state, boundary, logicalTimeMs) &&
    boundary.bindingKind === expectedBoundaryKind &&
    boundary.policyDigest === config.policyDigest &&
    boundary.subjectMappingDigest === config.subjectMappingDigest &&
    boundary.upstreamBindingDigest === resolver.bindingDigest &&
    boundary.configurationDigest ===
      digestInferenceControlTrustStateEligibilityConfigV1(config) &&
    boundary.implementationDigest === config.baseBindingDigest
  );
}

function rollbackAnchorMatches(
  left: EvidenceTrustRollbackAnchorV1,
  right: EvidenceTrustRollbackAnchorV1,
): boolean {
  return (
    left.schemaVersion === 1 &&
    left.stateId === right.stateId &&
    left.requiredGeneration === right.requiredGeneration &&
    left.requiredSnapshotDigest === right.requiredSnapshotDigest &&
    left.minimumLogicalHighWaterMs === right.minimumLogicalHighWaterMs &&
    left.protectorBindingDigest === right.protectorBindingDigest
  );
}

function evaluateTrustStateEligibilityFromSnapshot(
  integration: TrustStateIntegrationSnapshotV1,
  target: TrustEligibilityTargetV1,
): InferenceControlTrustStateEligibilityResultV1 {
  const config = integration.config;
  let state: EvidenceTrustStateV1;
  let logicalTimeMs: number;
  try {
    const sample = integration.current();
    assertExactKeys(
      sample,
      ["schemaVersion", "runtime", "rollbackAnchor"],
      "Inference Control Trust runtime sample",
    );
    if (sample.schemaVersion !== 1)
      return unavailableTrustStateEligibility("state_conflict");
    const runtime = sample.runtime;
    assertExactKeys(
      runtime,
      ["schemaVersion", "runtimeId"],
      "Inference Control Trust runtime",
    );
    assertExactKeys(
      sample.rollbackAnchor,
      [
        "schemaVersion",
        "stateId",
        "requiredGeneration",
        "requiredSnapshotDigest",
        "minimumLogicalHighWaterMs",
        "protectorBindingDigest",
      ],
      "Inference Control Trust rollback anchor",
    );
    const metadata =
      runtime && typeof runtime === "object"
        ? verifiedTrustEligibilityRuntimes.get(runtime as object)
        : undefined;
    const latest = metadata
      ? latestTrustEligibilitySnapshotByStateId.get(metadata.stateId)
      : undefined;
    if (
      !metadata ||
      !latest ||
      runtime.schemaVersion !== 1 ||
      runtime.runtimeId !== metadata.runtimeId ||
      metadata.runtimeSourceBindingDigest !==
        integration.runtimeSourceBindingDigest ||
      metadata.rollbackAnchor.protectorBindingDigest !==
        integration.protectorBindingDigest ||
      !rollbackAnchorMatches(sample.rollbackAnchor, metadata.rollbackAnchor) ||
      latest.generation !== metadata.generation ||
      latest.snapshotDigest !== metadata.snapshotDigest
    )
      return unavailableTrustStateEligibility("state_conflict");
    state = validateEvidenceTrustStateV1(metadata.state);
    logicalTimeMs = metadata.logicalTimeMs;
    if (
      state.stateId !== metadata.stateId ||
      logicalTimeMs < state.logicalTimeHighWaterMs
    )
      return unavailableTrustStateEligibility("logical_time_rollback");
  } catch {
    return unavailableTrustStateEligibility("state_conflict");
  }
  try {
    if (!inferenceTrustBindingsAreCurrent(state, config, logicalTimeMs))
      return unavailableTrustStateEligibility("dependency_binding_invalid");
    const subjectDigest = digestSubjectV1(config.trustSubject);
    const trustScopeDigest = digestScopeV1(config.trustScope);
    const profileKey = digestTrustProfileKeyV1({
      tenantId: config.controlTenantId,
      subjectDigest,
      scopeDigest: trustScopeDigest,
      policyDigest: config.policyDigest,
    });
    const profileHead = state.profileHeads.find(
      (head) => head.profileKey === profileKey,
    );
    if (!profileHead)
      return unavailableTrustStateEligibility("profile_unavailable");
    const decision = evaluateTrustEligibilityV1(
      state,
      createTrustEligibilityRequestV1({
        schemaVersion: 1,
        tenantId: config.controlTenantId,
        subject: config.trustSubject,
        subjectDigest,
        scope: config.trustScope,
        scopeDigest: trustScopeDigest,
        policyId: config.policyId,
        policyVersion: config.policyVersion,
        policyDigest: config.policyDigest,
        profileId: profileHead.profileId,
        profileDigest: profileHead.profileDigest,
        maximumProfileAgeMs: config.maximumProfileAgeMs,
        requirements: config.requirements,
      }),
      logicalTimeMs,
    );
    return trustStateDecisionResult(decision);
  } catch {
    return unavailableTrustStateEligibility("profile_unavailable");
  }
}

function createAcceptedOutcomeClaimCandidate(
  input: AcceptedInferenceOutcomeClaimInputV1,
  terminalReferences: readonly EvidenceReferenceV1[],
): EvidenceClaimV1 {
  if (input.schemaVersion !== 1)
    throw new TypeError("accepted_outcome_invalid");
  assertAcceptedAssessment(input.assessmentRequest, input.assessment);
  assertControlDigest(input.assessorBindingDigest, "assessorBindingDigest");
  assertControlDigest(input.dependencyBindingDigest, "dependencyBindingDigest");
  const mapping = validateClaimMapping(input.mapping);
  const scopeDigest = controlScopeDigest(input.assessmentRequest.scope);
  const assessmentDigest = digestControlJsonV1("trace", {
    schemaVersion: 1,
    assessmentId: input.assessment.assessmentId,
    assessmentRequestId: input.assessment.assessmentRequestId,
    requestGeneration: input.assessment.requestGeneration,
    targetDigest: input.assessment.targetDigest,
    checkpoint: input.assessment.checkpoint,
    disposition: input.assessment.disposition,
  });
  const reasonCodesDigest = digestControlJsonV1("trace", [
    ...input.assessment.reasonCodes,
  ]);
  const references = [
    controlReference(
      "assessment",
      input.assessment.assessmentId,
      assessmentDigest,
    ),
    createAssessmentRequestReferenceV1(input.assessmentRequest),
    controlReference(
      "assessor_binding",
      input.assessment.assessorId,
      input.assessorBindingDigest,
    ),
    controlReference(
      "control_scope",
      input.assessmentRequest.runId,
      scopeDigest,
    ),
    controlReference(
      "dependency_binding",
      input.assessment.policyId,
      input.dependencyBindingDigest,
    ),
    controlReference(
      "outcome_reason_codes",
      input.assessment.assessmentId,
      reasonCodesDigest,
    ),
    trustReference("trust_mapping", mapping.mappingId, mapping.mappingDigest),
    ...terminalReferences,
  ].sort(referenceOrder);
  return createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId: mapping.sourceId,
    sourceKind: "local",
    causationId: input.assessment.assessmentId,
    subject: mapping.subject,
    scope: mapping.scope,
    criterionId: mapping.criterionId,
    outcome: mapping.outcome,
    content: null,
    basisReferences: references,
    observedAt: input.observedAt,
  });
}

function assertActionEligibilityTargetBinding(
  target: TrustEligibilityTargetV1,
  input: Parameters<ActionDispatcher["dispatch"]>[0],
): void {
  if (
    target.operation !== "action" ||
    target.targetDigest !== input.permit.actionDigest ||
    target.scopeDigest !== input.permit.scopeDigest ||
    target.tenantId !== input.context.tenant.tenantId ||
    target.runId !== input.context.runId
  )
    throw new Error("trust_eligibility_target_mismatch");
}

function assertOutboundMessageEligibilityTargetBinding(
  target: TrustEligibilityTargetV1,
  input: Parameters<OutboundMessageDispatcher["send"]>[0],
): void {
  const message = input.message;
  const { messageDigest: declaredMessageDigest, ...unsignedMessage } = message;
  const actualMessageDigest = outboundMessageDigest(
    unsignedMessage as Omit<OutboundMessage, "messageDigest">,
  );
  const actualScopeDigest = scopeDigest(message.scope);
  if (
    target.operation !== "outbound_message" ||
    target.targetDigest !== actualMessageDigest ||
    target.scopeDigest !== actualScopeDigest ||
    target.tenantId !== message.tenantId ||
    target.runId !== message.runId ||
    declaredMessageDigest !== actualMessageDigest ||
    input.permit.messageDigest !== actualMessageDigest ||
    input.permit.scopeDigest !== actualScopeDigest
  )
    throw new Error("trust_eligibility_target_mismatch");
}

function requireOrObserveEligibility(
  integration: TrustEligibilityIntegrationSnapshotV1,
  target: TrustEligibilityTargetV1,
  bindingDigest: string,
): void {
  validateTarget(target);
  let status: TrustEligibilityStatusV1 = "unavailable";
  try {
    const decision = integration.resolver.resolve(target);
    status = eligibilityStatus(integration, target, decision) ?? "mismatch";
  } catch {
    status = "unavailable";
  }
  try {
    integration.onDiagnostic?.(
      Object.freeze({
        schemaVersion: 1,
        operation: target.operation,
        mode: integration.policy.mode,
        status,
        bindingDigest,
      }),
    );
  } catch {
    // Diagnostics are observational and cannot influence delegation.
  }
  if (integration.policy.mode === "restrict" && status !== "eligible")
    throw new Error("trust_eligibility_restricted");
}

function eligibilityStatus(
  integration: TrustEligibilityIntegrationSnapshotV1,
  target: TrustEligibilityTargetV1,
  decision: TrustEligibilityDecisionV1,
): TrustEligibilityStatusV1 | undefined {
  if (!decision || decision.schemaVersion !== 1) return undefined;
  if (!isEligibilityStatus(decision.status)) return undefined;
  if (
    decision.policyDigest !== integration.policy.policyDigest ||
    decision.resolverDigest !== integration.resolver.resolverDigest ||
    decision.mappingDigest !== integration.mapping.mappingDigest ||
    decision.scopeDigest !== target.scopeDigest ||
    decision.targetDigest !== target.targetDigest
  )
    return "mismatch";
  return decision.status;
}

function assertAcceptedAssessment(
  request: AssessmentRequestV1,
  assessment: InferenceAssessmentV1,
): void {
  if (
    request.status !== "accepted" ||
    assessment.disposition !== "allow" ||
    request.assessmentRequestId !== assessment.assessmentRequestId ||
    request.requestGeneration !== assessment.requestGeneration ||
    request.runId !== assessment.runId ||
    request.tenantId !== assessment.tenantId ||
    request.policyId !== assessment.policyId ||
    request.policyVersion !== assessment.policyVersion ||
    request.checkpoint !== assessment.checkpoint ||
    request.assessorId !== assessment.assessorId ||
    request.assessorVersion !== assessment.assessorVersion ||
    request.targetKind !== assessment.targetKind ||
    request.targetDigest !== assessment.targetDigest ||
    request.zoneDigest !== assessment.zoneDigest ||
    request.provenanceDigest !== assessment.provenanceDigest ||
    controlScopeDigest(request.scope) !== controlScopeDigest(assessment.scope)
  )
    throw new Error("accepted_outcome_mismatch");
}

function snapshotIntegration(
  integration: TrustEligibilityIntegrationV1,
): TrustEligibilityIntegrationSnapshotV1 {
  validateIntegration(integration);
  const resolver = integration.resolver;
  const onDiagnostic = integration.onDiagnostic;
  return Object.freeze({
    policy: Object.freeze({ ...integration.policy }),
    resolver: Object.freeze({
      resolverId: resolver.resolverId,
      resolverVersion: resolver.resolverVersion,
      resolverDigest: resolver.resolverDigest,
      resolve: resolver.resolve.bind(resolver),
    }),
    mapping: Object.freeze({ ...integration.mapping }),
    onDiagnostic:
      onDiagnostic === undefined ? undefined : onDiagnostic.bind(integration),
  });
}

function snapshotTrustModelBoundary<T>(
  boundary: InferenceControlTrustModelBoundaryV1<T>,
): Readonly<InferenceControlTrustModelBoundaryV1<T>> {
  validateTrustModelBoundaryIdentity(boundary);
  if (typeof boundary.run !== "function")
    throw new TypeError("model_boundary_invalid");
  return Object.freeze({
    modelBoundaryId: boundary.modelBoundaryId,
    modelBoundaryVersion: boundary.modelBoundaryVersion,
    implementationDigest: boundary.implementationDigest,
    run: boundary.run.bind(boundary),
  });
}

function snapshotActionDispatcher(
  dispatcher: ActionDispatcher,
): Readonly<ActionDispatcher> {
  validateActionDispatcherIdentity(dispatcher);
  if (typeof dispatcher.dispatch !== "function")
    throw new TypeError("dispatcher_invalid");
  return Object.freeze({
    dispatcherId: dispatcher.dispatcherId,
    dispatcherVersion: dispatcher.dispatcherVersion,
    fencingMode: dispatcher.fencingMode,
    dispatch: dispatcher.dispatch.bind(dispatcher),
  });
}

function snapshotOutboundMessageDispatcher(
  dispatcher: OutboundMessageDispatcher,
): Readonly<OutboundMessageDispatcher> {
  validateMessageDispatcherIdentity(dispatcher);
  if (typeof dispatcher.send !== "function")
    throw new TypeError("dispatcher_invalid");
  return Object.freeze({
    dispatcherId: dispatcher.dispatcherId,
    dispatcherVersion: dispatcher.dispatcherVersion,
    dispatcherDigest: dispatcher.dispatcherDigest,
    fencingMode: dispatcher.fencingMode,
    send: dispatcher.send.bind(dispatcher),
  });
}

function digestTrustEligibilityBindingFromSnapshot(
  integration: TrustEligibilityIntegrationSnapshotV1,
  baseBindingDigest: string,
): string {
  return digestTrustJsonV1("dependency-binding", {
    schemaVersion: 1,
    policyDigest: integration.policy.policyDigest,
    resolverDigest: integration.resolver.resolverDigest,
    mappingDigest: integration.mapping.mappingDigest,
    baseBindingDigest,
  });
}

function validateClaimMapping(
  mapping: InferenceControlTrustClaimMappingV1,
): InferenceControlTrustClaimMappingV1 {
  const expected = createInferenceControlTrustClaimMappingV1({
    schemaVersion: mapping.schemaVersion,
    mappingId: mapping.mappingId,
    mappingVersion: mapping.mappingVersion,
    sourceId: mapping.sourceId,
    subject: mapping.subject,
    scope: mapping.scope,
    criterionId: mapping.criterionId,
    outcome: mapping.outcome,
  });
  if (expected.mappingDigest !== mapping.mappingDigest)
    throw new Error("trust_mapping_mismatch");
  return expected;
}

function controlScopeDigest(
  scope: ControlScopeV1 | ActionScope | null,
): string {
  return digestControlJsonV1("scope", scope as never);
}

function controlReference(
  referenceType: string,
  referenceId: string,
  referenceDigest: string,
): EvidenceReferenceV1 {
  return {
    schemaVersion: 1,
    kind: "control_record",
    referenceType,
    referenceId,
    referenceDigest,
  };
}

function trustReference(
  referenceType: string,
  referenceId: string,
  referenceDigest: string,
): EvidenceReferenceV1 {
  return {
    schemaVersion: 1,
    kind: "external",
    referenceType,
    referenceId,
    referenceDigest,
  };
}

function referenceOrder(
  left: EvidenceReferenceV1,
  right: EvidenceReferenceV1,
): number {
  const leftKey = `${left.kind}\u0000${left.referenceType}\u0000${left.referenceId}\u0000${left.referenceDigest}`;
  const rightKey = `${right.kind}\u0000${right.referenceType}\u0000${right.referenceId}\u0000${right.referenceDigest}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function validateIntegration(integration: TrustEligibilityIntegrationV1): void {
  const { policy, resolver, mapping } = integration;
  assertIdentifier(policy.policyId, "policyId");
  assertPositiveInteger(policy.policyVersion, "policyVersion");
  assertTrustDigest(policy.policyDigest, "policyDigest");
  if (policy.mode !== "observe" && policy.mode !== "restrict")
    throw new TypeError("trust_policy_invalid");
  assertIdentifier(resolver.resolverId, "resolverId");
  assertPositiveInteger(resolver.resolverVersion, "resolverVersion");
  assertTrustDigest(resolver.resolverDigest, "resolverDigest");
  if (typeof resolver.resolve !== "function")
    throw new TypeError("trust_resolver_invalid");
  assertIdentifier(mapping.mappingId, "mappingId");
  assertPositiveInteger(mapping.mappingVersion, "mappingVersion");
  assertTrustDigest(mapping.mappingDigest, "mappingDigest");
  if (
    integration.onDiagnostic !== undefined &&
    typeof integration.onDiagnostic !== "function"
  )
    throw new TypeError("trust_diagnostic_invalid");
}

function validateTrustModelBoundaryIdentity(
  boundary: Pick<
    InferenceControlTrustModelBoundaryV1<unknown>,
    "modelBoundaryId" | "modelBoundaryVersion" | "implementationDigest"
  >,
): void {
  assertIdentifier(boundary.modelBoundaryId, "modelBoundaryId");
  assertPositiveInteger(boundary.modelBoundaryVersion, "modelBoundaryVersion");
  assertTrustDigest(boundary.implementationDigest, "implementationDigest");
}

function validateActionDispatcherIdentity(
  dispatcher: Pick<
    ActionDispatcher,
    "dispatcherId" | "dispatcherVersion" | "fencingMode"
  >,
): void {
  assertIdentifier(dispatcher.dispatcherId, "dispatcherId");
  assertPositiveInteger(dispatcher.dispatcherVersion, "dispatcherVersion");
  if (
    dispatcher.fencingMode !== "local_only" &&
    dispatcher.fencingMode !== "downstream_atomic"
  )
    throw new TypeError("dispatcher_invalid");
}

function validateMessageDispatcherIdentity(
  dispatcher: Pick<
    OutboundMessageDispatcher,
    "dispatcherId" | "dispatcherVersion" | "dispatcherDigest" | "fencingMode"
  >,
): void {
  validateActionDispatcherIdentity(dispatcher);
  assertControlDigest(dispatcher.dispatcherDigest, "dispatcherDigest");
}

function validateTarget(target: TrustEligibilityTargetV1): void {
  if (
    target.schemaVersion !== 1 ||
    !["model", "action", "outbound_message"].includes(target.operation)
  )
    throw new TypeError("trust_eligibility_target_invalid");
  assertIdentifier(target.tenantId, "tenantId");
  assertIdentifier(target.runId, "runId");
  assertControlDigest(target.scopeDigest, "scopeDigest");
  assertControlDigest(target.targetDigest, "targetDigest");
}

function snapshotTrustEligibilityTarget(
  target: TrustEligibilityTargetV1,
): TrustEligibilityTargetV1 {
  if (!target || typeof target !== "object")
    throw new TypeError("trust_eligibility_target_invalid");
  const snapshot = Object.freeze({
    schemaVersion: target.schemaVersion,
    operation: target.operation,
    tenantId: target.tenantId,
    runId: target.runId,
    scopeDigest: target.scopeDigest,
    targetDigest: target.targetDigest,
  });
  validateTarget(snapshot);
  return snapshot;
}

function isEligibilityStatus(
  value: unknown,
): value is TrustEligibilityStatusV1 {
  return (
    typeof value === "string" &&
    [
      "eligible",
      "restricted",
      "unavailable",
      "stale",
      "mismatch",
      "quarantined",
    ].includes(value)
  );
}

function assertIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new TypeError(`${label}_invalid`);
}

function assertPositiveInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new TypeError(`${label}_invalid`);
}

function assertControlDigest(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label}_invalid`);
}

function assertTrustDigest(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label}_invalid`);
}
