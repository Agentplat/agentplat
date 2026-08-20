import {
  budgetReservationDigestV1,
  governedActionPermitDigestV1,
  validateCollectiveAuthorityStateV1,
  type BudgetReservationV1,
  type CollectiveAuthorityStateV1,
  type GovernedActionPermitV1,
  type WorkContractV1,
} from "@agentplat/collective-control";
import {
  createGovernedActionGatewayFactoryV1,
  LocalPolicyAdapterV1,
  type GovernedActionDispatchDecisionV1,
} from "@agentplat/collective-control/actions";
import {
  MemoryCollectiveEvidenceSinkV1,
  MemoryCollectiveExecutionRepositoryV1,
} from "@agentplat/collective-control/memory";
import {
  actionInputDigest,
  controlDigest,
  issueActionGrantV1,
  LocalGrantLedger,
  scopeDigest,
  type ActionBinding,
  type ActionDispatchPermit,
  type ActionGrant,
  type ActionScope,
  type ControlJsonObject,
} from "@agentplat/inference-control/tools";
import {
  reduceInferenceControlStateV1,
  type ActionGrantStateV1,
  type AssessmentRequestV1,
  type InferenceAssessmentV1,
  type InferenceControlStateV1,
} from "@agentplat/inference-control";
import {
  createCollectiveProtectedEffectAttemptV1,
  type CollectiveEnvironmentPortV1,
  type CollectiveProtectedEffectAttemptV1,
  type CollectiveProtectedEffectReceiptV1,
} from "@agentplat/collective-planning/evaluation";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import {
  digestTrustEligibilityDecisionV1,
  evaluateTrustEligibilityV1,
  type EvidenceTrustStateV1,
  type TrustEligibilityDecisionV1,
  type TrustEligibilityRequestV1,
} from "@agentplat/trust";
import { collectiveTraceJournalForOwnerV2 } from "./collective-trace-journal.js";
import { createEvaluatorOwnedSemanticTraceEvidenceV1 } from './semantic-trace-evidence.js';
import { recordCollectiveEffectReceiptProvenanceV1 } from "./collective-effect-provenance.js";

/**
 * The current Mesh projection required to cross the governed action boundary.
 * It deliberately contains no proposal, adaptive-role, or assignee lookup.
 */
export interface CollectiveClosedLoopCurrentMeshV1 {
  readonly meshId: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly assignedPeerId: string;
  readonly assignedInstanceId: string;
  readonly assignmentAuthorityId: string;
  readonly assignmentEpoch: number;
  readonly authorityGeneration: number;
  readonly fencingToken: string;
  readonly leaseExpiresAtLogicalMs: number;
  readonly objectiveTerminal: boolean;
  readonly workTerminal: boolean;
}

export interface CollectiveClosedLoopEffectMetadataV1 {
  readonly registrationDigest: PlanningDigestV1;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly actionClass: string;
}

export interface CollectiveClosedLoopActionInputV1 {
  /** A mandate already accepted by this exact authority state. */
  readonly mandate: Parameters<
    MemoryCollectiveExecutionRepositoryV1["registerWork"]
  >[0]["mandate"];
  readonly authorityState: CollectiveAuthorityStateV1;
  /** Must have been derived from a current accepted Mesh assignment. */
  readonly workContract: WorkContractV1;
  readonly mesh: CollectiveClosedLoopCurrentMeshV1;
  readonly environment: CollectiveEnvironmentPortV1;
  readonly effect: CollectiveClosedLoopEffectMetadataV1;
  readonly actionBinding: ActionBinding;
  readonly actionInput: ControlJsonObject;
  readonly trustState: EvidenceTrustStateV1;
  readonly trustRequest: TrustEligibilityRequestV1;
  /** State has a registered policy, current run and negotiated capability. */
  readonly inferenceState: InferenceControlStateV1;
  readonly assessmentRequest: AssessmentRequestV1;
  readonly assessment: InferenceAssessmentV1;
  readonly actionGrant: ActionGrantStateV1;
  readonly logicalTimeMs: number;
  readonly wallTime: string;
  readonly gatewayId: string;
  readonly reservationId: string;
  readonly permitId: string;
  readonly decisionId: string;
}

export interface CollectiveClosedLoopActionResultV1 {
  /** Runner-owned wall time used to authorize this exact governed action. */
  readonly authorizedAt: string;
  readonly trustDecision: TrustEligibilityDecisionV1;
  readonly inferenceState: InferenceControlStateV1;
  readonly actionGrant: ActionGrant;
  readonly budgetReservation: BudgetReservationV1;
  readonly actionPermit: GovernedActionPermitV1;
  readonly executionStateDigest: string;
  readonly action: GovernedActionDispatchDecisionV1;
  readonly effectAttempt: CollectiveProtectedEffectAttemptV1 | null;
  readonly receipt: CollectiveProtectedEffectReceiptV1 | null;
}

/**
 * Runs one protected action through real Trust, inference, Collective Control
 * and the fenced evaluation sink.  It is intentionally a one-shot composition
 * boundary: callers produce observations/results outside this module.
 */
export async function runCollectiveClosedLoopActionV1(
  input: CollectiveClosedLoopActionInputV1,
): Promise<CollectiveClosedLoopActionResultV1> {
  const authorityState = validateCollectiveAuthorityStateV1(
    input.authorityState,
  );
  assertAcceptedMandate(authorityState, input.mandate);
  assertCurrentMesh(input.workContract, input.mesh);
  assertTrustScope(input.trustRequest, input.workContract, input.mesh);
  assertActionScope(input.actionGrant, input.workContract, input.mesh);
  if (actionInputDigest(input.actionInput) !== input.actionGrant.inputDigest)
    throw new Error("closed_loop_action_input_mismatch");
  if (
    input.actionGrant.actionBindingId !== input.actionBinding.actionBindingId ||
    input.actionGrant.actionBindingVersion !==
      input.actionBinding.actionBindingVersion ||
    input.actionGrant.namespace !== input.actionBinding.namespace ||
    input.actionGrant.toolId !== input.actionBinding.toolId ||
    input.actionGrant.operation !== input.actionBinding.operation ||
    input.actionGrant.handlerDigest !== input.actionBinding.handlerDigest
  )
    throw new Error("closed_loop_action_binding_mismatch");
  if (input.actionBinding.fencingMode !== "downstream_atomic")
    throw new Error("closed_loop_action_fencing_required");

  const trustDecision = evaluateTrustEligibilityV1(
    input.trustState,
    input.trustRequest,
    input.logicalTimeMs,
  );
  if (trustDecision.disposition !== "eligible")
    throw new Error("closed_loop_trust_ineligible");
  appendActionTrace(
    input,
    "trust.assessed",
    asSha256Digest(digestTrustEligibilityDecisionV1(trustDecision)),
  );

  const inferenceState = reduceToIssuedGrant(input);
  const retainedGrant = inferenceState.grants.find(
    (grant) => grant.grantId === input.actionGrant.grantId,
  );
  if (
    !retainedGrant ||
    retainedGrant.status !== "issued" ||
    retainedGrant.reservation !== null
  )
    throw new Error("closed_loop_grant_not_issued");
  const actionGrant = toActionGrant(retainedGrant);
  const semanticEvidence = createEvaluatorOwnedSemanticTraceEvidenceV1({
    traceEventId: `inference.assessed:${input.assessment.assessmentId}`,
    assessmentDigest: asDigest(controlDigest("message", input.assessment as never)),
    evidenceDigest: asDigest(controlDigest("message", input.assessment as never)),
    metrics: (input.assessment as unknown as { metrics?: Record<string, number | null> }).metrics ?? {},
  });
  appendActionTrace(input, "inference.assessed", semanticEvidence.evidenceDigest);

  const grantLedger = new LocalGrantLedger(input.gatewayId);
  await issueActionGrantV1(grantLedger, actionGrant);
  appendActionTrace(
    input,
    "authority.grant",
    asDigest(
      controlDigest(
        "grant",
        actionGrant as unknown as import("@agentplat/inference-control/tools").ControlJson,
      ),
    ),
  );
  const execution = new MemoryCollectiveExecutionRepositoryV1({
    tenantId: input.workContract.tenantId,
    policyDomainId: input.workContract.policyDomainId,
  });
  const opened = execution.registerWork({
    mandate: input.mandate,
    workContract: input.workContract,
    authorizedAt: input.wallTime,
    acceptedAtLogicalMs: input.logicalTimeMs,
  });
  if (!opened.accepted) throw new Error(`closed_loop_work_${opened.code}`);

  const budgetReservation = reservationFor(input, actionGrant);
  const actionPermit = permitFor(
    input,
    actionGrant,
    budgetReservation,
    trustDecision,
  );
  const issued = execution.issuePermit({
    mandate: input.mandate,
    budgetReservation,
    actionPermit,
    authorizedAt: input.wallTime,
    acceptedAtLogicalMs: input.logicalTimeMs,
  });
  if (!issued.accepted) throw new Error(`closed_loop_permit_${issued.code}`);
  appendActionTrace(
    input,
    "authority.reservation",
    budgetReservation.reservationDigest,
  );
  appendActionTrace(input, "authority.permit", actionPermit.permitDigest);

  let effectAttempt: CollectiveProtectedEffectAttemptV1 | null = null;
  let receipt: CollectiveProtectedEffectReceiptV1 | null = null;
  const evidence = new MemoryCollectiveEvidenceSinkV1(
    input.workContract.tenantId,
    input.workContract.policyDomainId,
  );
  const currentness = currentnessFor(input, trustDecision, inferenceState);
  const adapter = new LocalPolicyAdapterV1(
    { read: () => authorityState },
    execution,
    { wallTimeForLogical: () => input.wallTime },
    currentness,
    evidence,
  );
  const gatewayFactory = createGovernedActionGatewayFactoryV1({
    grantRepository: grantLedger,
    binding: input.actionBinding,
    downstream: {
      dispatcherId: input.actionBinding.dispatcherId,
      dispatcherVersion: input.actionBinding.dispatcherVersion,
      fencingMode: "downstream_atomic",
      async dispatch({ permit }) {
        const nextAttempt = effectAttemptFor(input, actionPermit, permit);
        appendActionTrace(
          input,
          "effect.dispatch",
          nextAttempt.attemptDigest,
        );
        const nextReceipt = input.environment.applyEffect(nextAttempt);
        recordCollectiveEffectReceiptProvenanceV1(
          input.environment,
          nextAttempt,
          nextReceipt,
        );
        effectAttempt = nextAttempt;
        receipt = nextReceipt;
        return nextReceipt.status === "committed"
          ? {
              ok: true as const,
              value: {
                receiptDigest: nextReceipt.receiptDigest,
                effectId: nextReceipt.effectId,
                status: nextReceipt.status,
              },
            }
          : {
              ok: false as const,
              error: { code: nextReceipt.reasonCode ?? nextReceipt.status },
            };
      },
    },
    contextResolver: {
      contextResolverId: input.actionBinding.contextResolverId,
      contextResolverVersion: input.actionBinding.contextResolverVersion,
      async resolve(scope) {
        return {
          tenant: { tenantId: scope.tenantId },
          toolId: input.actionBinding.toolId,
          runId: scope.runId,
        };
      },
    },
    baseAuthorityResolver: {
      resolverId: "collective-closed-loop-mesh-currentness",
      resolverVersion: 1,
      async resolve(scope, actionDigestValue) {
        if (
          !meshScopeMatches(scope, input.mesh) ||
          actionDigestValue !== actionGrant.actionDigest
        )
          return unavailableAuthority(scope, actionDigestValue);
        return {
          schemaVersion: 1 as const,
          status: "current" as const,
          resolverId: "collective-closed-loop-mesh-currentness",
          resolverVersion: 1,
          scopeDigest: scopeDigest(scope),
          actionDigest: actionDigestValue,
          scope,
          authorityGeneration: input.mesh.authorityGeneration,
          fencingToken: input.mesh.fencingToken,
        };
      },
    },
    assessmentResolver: {
      assessorId: input.assessment.assessorId,
      assessorVersion: input.assessment.assessorVersion,
      async consumeCurrent(grant, logicalTimeMs) {
        return assessmentIsCurrent(inferenceState, input, grant, logicalTimeMs);
      },
    },
    guard: adapter.guard,
  });
  const dispatched = await adapter.dispatchGovernedAction({
    gatewayFactory,
    permitId: actionPermit.permitId,
    actionInput: input.actionInput,
    logicalTimeMs: input.logicalTimeMs,
    decisionId: input.decisionId,
  });
  if (dispatched.action === null)
    throw new Error(`closed_loop_action_${dispatched.code}`);
  appendActionTrace(
    input,
    "evidence.appended",
    asDigest(dispatched.action.state.stateDigest),
  );
  return Object.freeze({
    authorizedAt: input.wallTime,
    trustDecision,
    inferenceState,
    actionGrant,
    budgetReservation,
    actionPermit,
    executionStateDigest: dispatched.action.state.stateDigest,
    action: dispatched.action,
    effectAttempt,
    receipt,
  });
}

function reduceToIssuedGrant(
  input: CollectiveClosedLoopActionInputV1,
): InferenceControlStateV1 {
  let state = input.inferenceState;
  for (const [inputId, type, value] of [
    [
      "closed-loop:assessment-request",
      "assessment_requested",
      input.assessmentRequest,
    ],
    ["closed-loop:assessment", "assessment_received", input.assessment],
    ["closed-loop:grant", "grant_issued", input.actionGrant],
  ] as const) {
    const reduction = reduceInferenceControlStateV1(state, {
      schemaVersion: 1,
      inputId: `${inputId}:${input.actionGrant.grantId}`,
      expectedStateGeneration: state.stateGeneration,
      logicalTimeMs: input.logicalTimeMs,
      ...(type === "assessment_requested"
        ? { type, request: value }
        : type === "assessment_received"
          ? { type, assessment: value }
          : { type, grant: value }),
    });
    if (!reduction.accepted)
      throw new Error(`closed_loop_inference_${reduction.reasonCode}`);
    state = reduction.state;
  }
  return state;
}

function reservationFor(
  input: CollectiveClosedLoopActionInputV1,
  grant: ActionGrant,
): BudgetReservationV1 {
  const body = {
    schemaVersion: 1 as const,
    reservationId: input.reservationId,
    generation: 1,
    tenantId: input.workContract.tenantId,
    policyDomainId: input.workContract.policyDomainId,
    mandateId: input.mandate.statement.mandateId,
    mandateRevision: input.mandate.statement.revision,
    mandateDigest: input.mandate.mandateDigest,
    workContractId: input.workContract.workContractId,
    permitId: input.permitId,
    idempotencyKey: grant.idempotencyKey,
    units: input.workContract.maximumActionBudgetUnits,
    reservedAtLogicalMs: input.logicalTimeMs,
    expiresAtLogicalMs: grant.expiresAtLogicalMs,
    status: "reserved" as const,
    outcomeId: null,
  };
  return Object.freeze({
    ...body,
    reservationDigest: budgetReservationDigestV1(body),
  });
}

function permitFor(
  input: CollectiveClosedLoopActionInputV1,
  grant: ActionGrant,
  reservation: BudgetReservationV1,
  trust: TrustEligibilityDecisionV1,
): GovernedActionPermitV1 {
  const scope = grant.scope;
  if (scope.kind !== "coordinated")
    throw new Error("closed_loop_scope_not_coordinated");
  const body = {
    schemaVersion: 1 as const,
    permitId: input.permitId,
    generation: 1,
    gatewayId: input.gatewayId,
    tenantId: input.workContract.tenantId,
    policyDomainId: input.workContract.policyDomainId,
    mandateId: input.mandate.statement.mandateId,
    mandateRevision: input.mandate.statement.revision,
    mandateDigest: input.mandate.mandateDigest,
    workContractId: input.workContract.workContractId,
    workContractDigest: input.workContract.workContractDigest,
    actionGrantId: grant.grantId,
    actionGrantDigest: asDigest(
      controlDigest(
        "grant",
        grant as unknown as import("@agentplat/inference-control/tools").ControlJson,
      ),
    ),
    actionScopeDigest: asDigest(grant.scopeDigest),
    assignmentAuthorityId: scope.assignmentAuthorityId,
    assignedPeerId: scope.peerId,
    assignedInstanceId: scope.instanceId,
    assignmentEpoch: scope.assignmentEpoch,
    authorityGeneration: scope.authorityGeneration,
    fencingToken: scope.fencingToken,
    namespace: input.actionBinding.namespace,
    toolId: input.actionBinding.toolId,
    operation: input.actionBinding.operation,
    actionBindingId: input.actionBinding.actionBindingId,
    actionBindingVersion: input.actionBinding.actionBindingVersion,
    handlerDigest: asDigest(input.actionBinding.handlerDigest),
    inputDigest: asDigest(grant.inputDigest),
    assessmentDigest: asDigest(
      controlDigest("message", input.assessment as never),
    ),
    trustDecisionDigest: asSha256Digest(
      digestTrustEligibilityDecisionV1(trust),
    ),
    budgetReservationId: reservation.reservationId,
    budgetUnits: reservation.units,
    idempotencyKey: grant.idempotencyKey,
    issuedAtLogicalMs: input.logicalTimeMs,
    expiresAtLogicalMs: grant.expiresAtLogicalMs,
    status: "issued" as const,
    outcomeId: null,
  };
  return Object.freeze({
    ...body,
    permitDigest: governedActionPermitDigestV1(body),
  });
}

function currentnessFor(
  input: CollectiveClosedLoopActionInputV1,
  initialTrust: TrustEligibilityDecisionV1,
  inferenceState: InferenceControlStateV1,
) {
  return {
    check({
      permit,
      scope,
      logicalTimeMs,
    }: {
      readonly permit: GovernedActionPermitV1;
      readonly scope: ActionScope | null;
      readonly logicalTimeMs: number;
    }) {
      if (
        (scope !== null && !meshScopeMatches(scope, input.mesh)) ||
        permit.assignmentAuthorityId !== input.mesh.assignmentAuthorityId ||
        permit.assignedPeerId !== input.mesh.assignedPeerId ||
        permit.assignedInstanceId !== input.mesh.assignedInstanceId ||
        permit.assignmentEpoch !== input.mesh.assignmentEpoch ||
        permit.authorityGeneration !== input.mesh.authorityGeneration ||
        permit.fencingToken !== input.mesh.fencingToken
      )
        return { allowed: false as const, code: "mesh_assignment_not_current" };
      if (
        !assessmentIsCurrent(
          inferenceState,
          input,
          toActionGrant(input.actionGrant),
          logicalTimeMs,
        )
      )
        return {
          allowed: false as const,
          code: "inference_assessment_not_current",
        };
      try {
        const currentTrust = evaluateTrustEligibilityV1(
          input.trustState,
          input.trustRequest,
          logicalTimeMs,
        );
        if (
          currentTrust.disposition !== "eligible" ||
          digestTrustEligibilityDecisionV1(currentTrust) !==
            digestTrustEligibilityDecisionV1(initialTrust)
        )
          return { allowed: false as const, code: "trust_not_current" };
      } catch {
        return { allowed: false as const, code: "trust_unavailable" };
      }
      return { allowed: true as const, code: "allowed" as const };
    },
  };
}

function effectAttemptFor(
  input: CollectiveClosedLoopActionInputV1,
  governedPermit: GovernedActionPermitV1,
  dispatchPermit: ActionDispatchPermit,
) {
  if (
    dispatchPermit.authorityGeneration !== input.mesh.authorityGeneration ||
    dispatchPermit.fencingToken !== input.mesh.fencingToken ||
    dispatchPermit.idempotencyKey !== governedPermit.idempotencyKey
  )
    throw new Error("closed_loop_dispatch_fence_mismatch");
  return createCollectiveProtectedEffectAttemptV1({
    schemaVersion: 1,
    attemptId: `attempt:${dispatchPermit.dispatchAttemptId}`,
    idempotencyKey: dispatchPermit.idempotencyKey,
    registrationDigest: input.effect.registrationDigest,
    tenantId: input.workContract.tenantId,
    missionIntentId: input.effect.missionIntentId,
    intentRevision: input.effect.intentRevision,
    intentDigest: input.effect.intentDigest,
    peerId: input.mesh.assignedPeerId,
    peerInstanceId: input.mesh.assignedInstanceId,
    workItemId: input.mesh.workItemId,
    workItemRevision: input.mesh.workItemRevision,
    workContractId: input.workContract.workContractId,
    workContractDigest: input.workContract.workContractDigest,
    assignmentEpoch: input.mesh.assignmentEpoch,
    authorityGeneration: input.mesh.authorityGeneration,
    fencingToken: input.mesh.fencingToken,
    actionClass: input.effect.actionClass,
    inputDigest: governedPermit.inputDigest,
    attemptedAtLogicalMs: input.logicalTimeMs,
  });
}

function assessmentIsCurrent(
  state: InferenceControlStateV1,
  input: CollectiveClosedLoopActionInputV1,
  grant: ActionGrant,
  logicalTimeMs: number,
): boolean {
  const request = state.assessmentRequests.find(
    (item) => item.assessmentRequestId === grant.assessmentRequestId,
  );
  const assessment = state.assessments.find(
    (item) => item.assessmentId === grant.assessmentId,
  );
  return Boolean(
    request &&
    assessment &&
    request.status === "accepted" &&
    request.checkpoint === "pre_tool" &&
    request.targetDigest === grant.assessmentTargetDigest &&
    assessment.disposition === "allow" &&
    assessment.assessmentRequestId === request.assessmentRequestId &&
    assessment.requestGeneration === request.requestGeneration &&
    logicalTimeMs < request.expiresAtLogicalMs &&
    logicalTimeMs < assessment.expiresAtLogicalMs &&
    grant.grantId === input.actionGrant.grantId,
  );
}

function assertAcceptedMandate(
  authority: CollectiveAuthorityStateV1,
  mandate: CollectiveClosedLoopActionInputV1["mandate"],
) {
  if (
    !authority.mandates.some(
      (item) =>
        item.mandate.statement.mandateId === mandate.statement.mandateId &&
        item.mandate.mandateDigest === mandate.mandateDigest,
    )
  )
    throw new Error("closed_loop_mandate_not_accepted");
}

function assertCurrentMesh(
  work: WorkContractV1,
  mesh: CollectiveClosedLoopCurrentMeshV1,
) {
  const assignment = work.assignment;
  if (
    work.status !== "active" ||
    work.objective.meshId !== mesh.meshId ||
    work.objective.objectiveId !== mesh.objectiveId ||
    work.objective.objectiveRevision !== mesh.objectiveRevision ||
    assignment.workItemId !== mesh.workItemId ||
    assignment.workItemRevision !== mesh.workItemRevision ||
    assignment.assignedPeerId !== mesh.assignedPeerId ||
    assignment.assignedInstanceId !== mesh.assignedInstanceId ||
    assignment.assignmentAuthorityId !== mesh.assignmentAuthorityId ||
    assignment.assignmentEpoch !== mesh.assignmentEpoch ||
    assignment.authorityGeneration !== mesh.authorityGeneration ||
    assignment.fencingToken !== mesh.fencingToken ||
    assignment.leaseExpiresAtLogicalMs !== mesh.leaseExpiresAtLogicalMs ||
    mesh.objectiveTerminal ||
    mesh.workTerminal
  )
    throw new Error("closed_loop_mesh_not_current");
}

function assertActionScope(
  grant: ActionGrantStateV1,
  work: WorkContractV1,
  mesh: CollectiveClosedLoopCurrentMeshV1,
) {
  if (
    grant.scope.kind !== "coordinated" ||
    grant.scope.tenantId !== work.tenantId ||
    grant.scope.policyId !== work.inferencePolicyId ||
    !meshScopeMatches(grant.scope, mesh)
  )
    throw new Error("closed_loop_scope_not_current");
}

function assertTrustScope(
  request: TrustEligibilityRequestV1,
  work: WorkContractV1,
  mesh: CollectiveClosedLoopCurrentMeshV1,
): void {
  const scope = request.scope;
  if (
    request.tenantId !== work.tenantId ||
    request.policyId !== work.trustPolicyId ||
    request.subject.kind !== "peer" ||
    request.subject.peerId !== mesh.assignedPeerId ||
    scope.kind !== "work" ||
    scope.tenantId !== work.tenantId ||
    scope.meshId !== mesh.meshId ||
    scope.objectiveId !== mesh.objectiveId ||
    scope.objectiveRevision !== mesh.objectiveRevision ||
    scope.workItemId !== mesh.workItemId ||
    scope.workItemRevision !== mesh.workItemRevision ||
    scope.assignmentEpoch !== mesh.assignmentEpoch ||
    scope.assignmentAuthorityId !== mesh.assignmentAuthorityId ||
    scope.fencingToken !== mesh.fencingToken
  )
    throw new Error("closed_loop_trust_scope_not_current");
}

function meshScopeMatches(
  scope: ActionScope,
  mesh: CollectiveClosedLoopCurrentMeshV1,
): boolean {
  return (
    scope.kind === "coordinated" &&
    scope.meshId === mesh.meshId &&
    scope.objectiveId === mesh.objectiveId &&
    scope.objectiveRevision === mesh.objectiveRevision &&
    scope.workItemId === mesh.workItemId &&
    scope.workItemRevision === mesh.workItemRevision &&
    scope.peerId === mesh.assignedPeerId &&
    scope.instanceId === mesh.assignedInstanceId &&
    scope.assignmentAuthorityId === mesh.assignmentAuthorityId &&
    scope.assignmentEpoch === mesh.assignmentEpoch &&
    scope.authorityGeneration === mesh.authorityGeneration &&
    scope.fencingToken === mesh.fencingToken &&
    scope.leaseExpiresAtLogicalMs === mesh.leaseExpiresAtLogicalMs &&
    !scope.objectiveTerminal &&
    !scope.workTerminal
  );
}

function unavailableAuthority(scope: ActionScope, actionDigest: string) {
  return {
    schemaVersion: 1 as const,
    status: "unavailable" as const,
    resolverId: "collective-closed-loop-mesh-currentness",
    resolverVersion: 1,
    scopeDigest: scopeDigest(scope),
    actionDigest,
  };
}

function toActionGrant(grant: ActionGrantStateV1): ActionGrant {
  if (grant.reservation !== null) throw new Error("closed_loop_grant_reserved");
  return Object.freeze({
    schemaVersion: grant.schemaVersion,
    grantId: grant.grantId,
    stateGeneration: grant.stateGeneration,
    scope: grant.scope,
    scopeDigest: grant.scopeDigest,
    namespace: grant.namespace,
    toolId: grant.toolId,
    operation: grant.operation,
    actionBindingId: grant.actionBindingId,
    actionBindingVersion: grant.actionBindingVersion,
    handlerDigest: grant.handlerDigest,
    inputDigest: grant.inputDigest,
    actionDigest: grant.actionDigest,
    assessmentRequestId: grant.assessmentRequestId,
    assessmentId: grant.assessmentId,
    assessmentTargetDigest: grant.assessmentTargetDigest,
    idempotencyKey: grant.idempotencyKey,
    issuedAtLogicalMs: grant.issuedAtLogicalMs,
    expiresAtLogicalMs: grant.expiresAtLogicalMs,
    singleUse: grant.singleUse,
    status: grant.status,
    reservation: null,
  });
}

function asDigest(value: string): `sha256:${string}` {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new Error("closed_loop_digest_invalid");
  return value as `sha256:${string}`;
}

function asSha256Digest(value: string): `sha256:${string}` {
  return asDigest(value.startsWith("sha256:") ? value : `sha256:${value}`);
}

function appendActionTrace(
  input: CollectiveClosedLoopActionInputV1,
  kind:
    | "trust.assessed"
    | "inference.assessed"
    | "authority.grant"
    | "authority.reservation"
    | "authority.permit"
    | "effect.dispatch"
    | "evidence.appended",
  recordDigest: PlanningDigestV1,
): void {
  const journal = collectiveTraceJournalForOwnerV2(
    input.environment as object,
  );
  if (!journal) return;
  journal.append({
    logicalTimeMs: input.logicalTimeMs,
    peerId: input.mesh.assignedPeerId,
    component: kind === "evidence.appended" ? "evidence" : "governance",
    kind,
    status: "accepted",
    reasonCode: null,
    recordDigest,
    stateDigestBefore: null,
    stateDigestAfter: null,
    faultBinding: null,
  });
}
