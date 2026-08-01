import {
  acceptDelegationMandateV1,
  budgetReservationDigestV1,
  createCollectiveAuthorityStateV1,
  createCollectiveDecisionRecordV1,
  createCollectiveExecutionStateV1,
  createDelegationMandateV1,
  delegationMandateDigestV1,
  digestCollectiveJsonV1,
  governedActionPermitDigestV1,
  registerWorkContractV1,
  workContractDigestV1,
  type BudgetReservationV1,
  type CollectiveDigestV1,
  type CollectiveDecisionRecordV1,
  type DelegationMandateStatementV1,
  type GovernedActionPermitV1,
  type WorkContractV1,
} from "@agentplat/collective-control";
import { createDelegationMandateProposalV1 } from "@agentplat/collective-control/rooms";
import {
  actionDigest as calculateActionDigest,
  actionInputDigest,
  controlDigest,
  scopeDigest,
  type ActionBinding,
  type ActionGrant,
  type ControlJson,
  type ControlJsonObject,
  type CoordinatedActionScope,
} from "@agentplat/inference-control/tools";

import type { ControlConformanceFixturesV1 } from "./control.js";

const digest = (label: string) =>
  digestCollectiveJsonV1("state", { label, schemaVersion: 1 });

/** Frozen fixtures shared by every adapter implementation under test. */
export function createControlConformanceFixturesV1(): ControlConformanceFixturesV1 {
  const roomProvenance = {
    schemaVersion: 1 as const,
    roomId: "room:conformance",
    approvalId: "approval:conformance",
    targetType: "task" as const,
    targetId: "work:conformance",
    targetVersion: 1,
  };
  const statement: DelegationMandateStatementV1 = {
    schemaVersion: 1,
    mandateId: "mandate:conformance",
    tenantId: "tenant:conformance",
    policyDomainId: "policy-domain:conformance",
    issuerId: "issuer:conformance",
    revision: 1,
    predecessorDigest: null,
    subjectPeerIds: ["peer:worker"],
    objective: {
      schemaVersion: 1,
      meshId: "mesh:conformance",
      objectiveId: "objective:conformance",
      objectiveDocumentId: "objective-document:conformance",
      minimumObjectiveRevision: 1,
      maximumObjectiveRevision: 1,
    },
    work: {
      schemaVersion: 1,
      workItemIds: ["work:conformance"],
      permittedRoleKeys: ["executor"],
      maximumWorkItemRevision: 1,
    },
    permittedCapabilityKeys: ["documents.write"],
    permittedActions: [
      {
        schemaVersion: 1,
        namespace: "documents",
        toolId: "writer",
        operation: "create",
      },
    ],
    budget: {
      schemaVersion: 1,
      totalBudgetUnits: 100,
      maximumWorkBudgetUnits: 100,
      maximumActionBudgetUnits: 10,
      maximumConcurrentWorkReservations: 1,
      maximumConcurrentActionReservations: 2,
      reservationLifetimeMs: 1_000,
    },
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-08-02T00:00:00.000Z",
    roomProvenance,
    evidence: {
      schemaVersion: 1,
      redactionPolicyId: "redaction:conformance",
      retentionClass: "standard",
      requireDurablePreDispatchEvidence: true,
    },
  };
  const mandateDigest = delegationMandateDigestV1(statement);
  const mandate = createDelegationMandateV1({
    statement,
    proof: {
      schemaVersion: 1,
      kind: "local_attestation",
      issuerId: statement.issuerId,
      attestorId: "attestor:conformance",
      attestationId: "attestation:conformance",
      signedDigest: mandateDigest,
    },
  });
  const accepted = acceptDelegationMandateV1(
    createCollectiveAuthorityStateV1({
      tenantId: statement.tenantId,
      policyDomainId: statement.policyDomainId,
    }),
    {
      mandate,
      verification: {
        schemaVersion: 1,
        verifierId: "verifier:conformance",
        verifierVersion: 1,
        issuerId: statement.issuerId,
        signedDigest: mandate.mandateDigest,
        verifiedAt: "2026-08-01T00:00:01.000Z",
        status: "verified",
      },
      acceptedAtLogicalMs: 1,
    },
  );
  if (!accepted.accepted) throw new Error("conformance_fixture_authority");

  const workBody: Omit<WorkContractV1, "workContractDigest"> = {
    schemaVersion: 1,
    workContractId: "work-contract:conformance",
    generation: 1,
    tenantId: statement.tenantId,
    policyDomainId: statement.policyDomainId,
    mandate: {
      schemaVersion: 1,
      mandateId: statement.mandateId,
      mandateRevision: statement.revision,
      mandateDigest: mandate.mandateDigest,
    },
    objective: {
      schemaVersion: 1,
      meshId: statement.objective.meshId,
      objectiveId: statement.objective.objectiveId,
      objectiveDocumentId: statement.objective.objectiveDocumentId,
      objectiveRevision: 1,
      acceptedMessageId: "message:objective:conformance",
      acceptedPolicyDigest: digest("objective-policy:conformance"),
    },
    assignment: {
      schemaVersion: 1,
      workItemId: "work:conformance",
      workItemRevision: 1,
      ownerPeerId: "peer:owner",
      assignedPeerId: "peer:worker",
      assignedInstanceId: "instance:worker:1",
      assignmentAuthorityId: "assignment:conformance",
      assignmentEpoch: 1,
      authorityGeneration: 1,
      fencingToken: "fence:conformance:1",
      leaseExpiresAtLogicalMs: 1_000,
      workDeadline: "2026-08-01T01:00:00.000Z",
    },
    roleKey: "executor",
    requiredCapabilityKeys: ["documents.write"],
    completionCriteria: ["Create one bounded document"],
    inputReferenceDigest: digest("work-input:conformance"),
    reservedBudgetUnits: 100,
    maximumActionBudgetUnits: 10,
    trustPolicyId: "trust-policy:conformance",
    inferencePolicyId: "inference-policy:conformance",
    createdAtLogicalMs: 10,
    updatedAtLogicalMs: 10,
    status: "active",
    terminalReasonCode: null,
  };
  const validWorkContract: WorkContractV1 = {
    ...workBody,
    workContractDigest: workContractDigestV1(workBody),
  };
  const widenedBody: Omit<WorkContractV1, "workContractDigest"> = {
    ...workBody,
    workContractId: "work-contract:conformance:widened",
    requiredCapabilityKeys: ["documents.write", "root.admin"],
  };
  const widenedWorkContract: WorkContractV1 = {
    ...widenedBody,
    workContractDigest: workContractDigestV1(widenedBody),
  };
  const emptyExecutionState = createCollectiveExecutionStateV1({
    tenantId: statement.tenantId,
    policyDomainId: statement.policyDomainId,
  });
  const registered = registerWorkContractV1(emptyExecutionState, {
    mandate,
    workContract: validWorkContract,
    authorizedAt: "2026-08-01T00:01:00.000Z",
    acceptedAtLogicalMs: 10,
  });
  if (!registered.accepted) throw new Error("conformance_fixture_work");

  const binding: ActionBinding = {
    schemaVersion: 1,
    actionBindingId: "binding:conformance",
    actionBindingVersion: 1,
    namespace: "documents",
    toolId: "writer",
    operation: "create",
    dispatcherId: "dispatcher:conformance",
    dispatcherVersion: 1,
    contextResolverId: "context:conformance",
    contextResolverVersion: 1,
    fencingMode: "downstream_atomic",
    handlerDigest: controlDigest("handler-binding", {
      schemaVersion: 1,
      handler: "conformance",
    }),
  };
  const scope: CoordinatedActionScope = {
    schemaVersion: 1,
    kind: "coordinated",
    tenantId: statement.tenantId,
    runId: "run:conformance",
    agentId: "agent:worker",
    policyId: "policy:conformance",
    policyVersion: 1,
    meshId: statement.objective.meshId,
    objectiveId: statement.objective.objectiveId,
    objectiveRevision: 1,
    workItemId: "work:conformance",
    workItemRevision: 1,
    peerId: "peer:worker",
    instanceId: "instance:worker:1",
    assignmentAuthorityId: "assignment:conformance",
    assignmentEpoch: 1,
    fencingToken: "fence:conformance:1",
    leaseExpiresAtLogicalMs: 1_000,
    authorityGeneration: 1,
    objectiveTerminal: false,
    workTerminal: false,
  };
  const grant = (grantId: string, input: ControlJsonObject): ActionGrant => {
    const draft: ActionGrant = {
      schemaVersion: 1,
      grantId,
      stateGeneration: 1,
      scope,
      scopeDigest: scopeDigest(scope),
      namespace: binding.namespace,
      toolId: binding.toolId,
      operation: binding.operation,
      actionBindingId: binding.actionBindingId,
      actionBindingVersion: binding.actionBindingVersion,
      handlerDigest: binding.handlerDigest,
      inputDigest: actionInputDigest(input),
      actionDigest: digest("pending-action:conformance"),
      assessmentRequestId: `assessment-request:${grantId}`,
      assessmentId: `assessment:${grantId}`,
      assessmentTargetDigest: digest(`assessment-target:${grantId}`),
      idempotencyKey: "idempotency:conformance",
      issuedAtLogicalMs: 20,
      expiresAtLogicalMs: 1_000,
      singleUse: true,
      status: "issued",
      reservation: null,
    };
    return Object.freeze({
      ...draft,
      actionDigest: calculateActionDigest(draft, binding),
    });
  };
  const actionGrant = grant("grant:conformance", {
    documentId: "document:a",
  });
  const conflictingActionGrant = grant("grant:conformance:substitution", {
    documentId: "document:b",
  });

  const reservationBody: Omit<BudgetReservationV1, "reservationDigest"> = {
    schemaVersion: 1,
    reservationId: "reservation:conformance",
    generation: 1,
    tenantId: statement.tenantId,
    policyDomainId: statement.policyDomainId,
    mandateId: statement.mandateId,
    mandateRevision: statement.revision,
    mandateDigest: mandate.mandateDigest,
    workContractId: validWorkContract.workContractId,
    permitId: "permit:conformance",
    idempotencyKey: actionGrant.idempotencyKey,
    units: 10,
    reservedAtLogicalMs: 20,
    expiresAtLogicalMs: 1_000,
    status: "reserved",
    outcomeId: null,
  };
  const budgetReservation: BudgetReservationV1 = {
    ...reservationBody,
    reservationDigest: budgetReservationDigestV1(reservationBody),
  };
  const permitBody: Omit<GovernedActionPermitV1, "permitDigest"> = {
    schemaVersion: 1,
    permitId: reservationBody.permitId,
    generation: 1,
    gatewayId: "gateway:conformance",
    tenantId: statement.tenantId,
    policyDomainId: statement.policyDomainId,
    mandateId: statement.mandateId,
    mandateRevision: statement.revision,
    mandateDigest: mandate.mandateDigest,
    workContractId: validWorkContract.workContractId,
    workContractDigest: validWorkContract.workContractDigest,
    actionGrantId: actionGrant.grantId,
    actionGrantDigest: collectiveDigest(
      controlDigest("grant", actionGrant as unknown as ControlJson),
    ),
    actionScopeDigest: collectiveDigest(actionGrant.scopeDigest),
    assignmentAuthorityId: scope.assignmentAuthorityId,
    assignedPeerId: scope.peerId,
    assignedInstanceId: scope.instanceId,
    assignmentEpoch: scope.assignmentEpoch,
    authorityGeneration: scope.authorityGeneration,
    fencingToken: scope.fencingToken,
    namespace: binding.namespace,
    toolId: binding.toolId,
    operation: binding.operation,
    actionBindingId: binding.actionBindingId,
    actionBindingVersion: binding.actionBindingVersion,
    handlerDigest: collectiveDigest(binding.handlerDigest),
    inputDigest: collectiveDigest(actionGrant.inputDigest),
    assessmentDigest: digest("assessment:conformance"),
    trustDecisionDigest: digest("trust:conformance"),
    budgetReservationId: budgetReservation.reservationId,
    budgetUnits: budgetReservation.units,
    idempotencyKey: actionGrant.idempotencyKey,
    issuedAtLogicalMs: 20,
    expiresAtLogicalMs: 1_000,
    status: "issued",
    outcomeId: null,
  };
  const actionPermit: GovernedActionPermitV1 = {
    ...permitBody,
    permitDigest: governedActionPermitDigestV1(permitBody),
  };

  const evidenceBase: Omit<
    CollectiveDecisionRecordV1,
    "recordId" | "logicalTimeMs" | "previousRecordDigest" | "recordDigest"
  > = {
    schemaVersion: 1,
    tenantId: statement.tenantId,
    policyDomainId: statement.policyDomainId,
    kind: "effect.dispatch",
    accepted: true,
    reasonCode: "effect_dispatched",
    mandateId: statement.mandateId,
    mandateDigest: mandate.mandateDigest,
    workContractId: validWorkContract.workContractId,
    workContractDigest: validWorkContract.workContractDigest,
    permitId: actionPermit.permitId,
    permitDigest: actionPermit.permitDigest,
    assignmentAuthorityId: scope.assignmentAuthorityId,
    assignmentEpoch: scope.assignmentEpoch,
    fencingToken: scope.fencingToken,
    budgetDeltaKind: "commit",
    budgetDeltaUnits: 10,
    inputDigest: collectiveDigest(actionGrant.inputDigest),
    actionDigest: collectiveDigest(actionGrant.actionDigest),
    assessmentDigest: permitBody.assessmentDigest,
    trustDecisionDigest: permitBody.trustDecisionDigest,
  };
  const firstEvidence = createCollectiveDecisionRecordV1({
    ...evidenceBase,
    recordId: "record:conformance:1",
    logicalTimeMs: 30,
    previousRecordDigest: null,
  });
  const secondEvidence = createCollectiveDecisionRecordV1({
    ...evidenceBase,
    recordId: "record:conformance:2",
    logicalTimeMs: 31,
    previousRecordDigest: firstEvidence.recordDigest,
  });
  const conflictingEvidenceRecord = createCollectiveDecisionRecordV1({
    ...evidenceBase,
    recordId: firstEvidence.recordId,
    logicalTimeMs: 32,
    accepted: false,
    reasonCode: "effect_denied",
    budgetDeltaKind: "none",
    budgetDeltaUnits: 0,
    previousRecordDigest: null,
  });
  const roomProposal = createDelegationMandateProposalV1({
    proposalId: "proposal:conformance",
    roomDecision: {
      ...roomProvenance,
      decidedAt: "2026-08-01T00:00:00.000Z",
      decidedBy: "peer:operator",
    },
    statement,
  });
  return Object.freeze({
    authorityState: accepted.state,
    mandate,
    emptyExecutionState,
    executionState: registered.state,
    validWorkContract,
    widenedWorkContract,
    budgetReservation,
    actionPermit,
    actionGrant,
    conflictingActionGrant,
    evidenceRecords: Object.freeze([firstEvidence, secondEvidence] as const),
    conflictingEvidenceRecord,
    secretCanary: "conformance-secret-canary-7f9d3e1a",
    roomProposal,
  });
}

function collectiveDigest(value: string): CollectiveDigestV1 {
  return value as CollectiveDigestV1;
}
