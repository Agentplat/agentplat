import {
  createMeshObjectiveInboundRuntimeState,
  type MeshAssignmentFenceHeadProjection,
  type MeshExecutionHeadProjection,
  type MeshObjectiveInboundDecision,
  type MeshObjectiveInboundProcessor,
  type MeshObjectiveInboundRejectionCode,
  type MeshObjectiveInboundRequest,
  type MeshObjectiveInboundRuntimeState,
  type MeshObjectiveProjection,
  type MeshWorkItemProjection,
} from "@agentplat/mesh/coordination";
import type { MeshPeerIdentity } from "@agentplat/mesh";

import { digestCollectiveJsonV1 } from "./canonical.js";
import type {
  CollectiveDigestV1,
  DelegationMandateV1,
  WorkContractV1,
} from "./contracts.js";
import {
  authorizeDelegationMandateAtV1,
  validateCollectiveAuthorityStateV1,
  type CollectiveAuthorityStateV1,
} from "./state.js";
import {
  validateDelegationMandateV1,
  validateWorkContractV1,
  workContractDigestV1,
} from "./validation.js";

export const DELEGATION_MANDATE_REFERENCE_PREFIX_V1 =
  "urn:agentplat:delegation-mandate:" as const;

const mandateReferencePattern =
  /^urn:agentplat:delegation-mandate:(sha256:[0-9a-f]{64})$/u;

export type GovernedMeshObjectiveRejectionCodeV1 =
  | MeshObjectiveInboundRejectionCode
  | "governed_boundary_invalid"
  | "mandate_reference_required"
  | "mandate_not_installed"
  | "mandate_not_current"
  | "mandate_scope_mismatch"
  | "mandate_objective_mismatch"
  | "mandate_issuer_mismatch"
  | "mandate_subject_mismatch"
  | "mandate_capability_mismatch"
  | "mandate_budget_mismatch"
  | "mandate_validity_mismatch";

export type GovernedMeshObjectiveInboundDecisionV1 =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly envelope: Extract<
        MeshObjectiveInboundDecision,
        { accepted: true }
      >["envelope"];
      readonly mandateDigest: CollectiveDigestV1;
      readonly state: MeshObjectiveInboundRuntimeState;
    }
  | {
      readonly accepted: false;
      readonly code: GovernedMeshObjectiveRejectionCodeV1;
      readonly state: MeshObjectiveInboundRuntimeState;
    };

export interface GovernedMeshObjectiveInboundProcessorV1 {
  process(
    state: MeshObjectiveInboundRuntimeState,
    request: MeshObjectiveInboundRequest,
  ): Promise<GovernedMeshObjectiveInboundDecisionV1>;
}

export interface CollectiveAuthorityStateReaderV1 {
  read(): CollectiveAuthorityStateV1 | Promise<CollectiveAuthorityStateV1>;
}

/** Parses only the exact governed reference form. A digest is never authority. */
export function parseDelegationMandateReferenceV1(
  value: string,
): CollectiveDigestV1 | null {
  const match = mandateReferencePattern.exec(value);
  return (match?.[1] as CollectiveDigestV1 | undefined) ?? null;
}

/**
 * Adds a local mandate gate after the existing authenticated Objective
 * processor. A governed rejection keeps only the processor's replay state.
 */
export function createGovernedMeshObjectiveInboundProcessorV1(input: {
  readonly processor: MeshObjectiveInboundProcessor;
  readonly authority: CollectiveAuthorityStateReaderV1;
}): GovernedMeshObjectiveInboundProcessorV1 {
  if (!input?.processor || typeof input.processor.process !== "function")
    throw new TypeError("A Mesh Objective inbound processor is required");
  if (!input.authority || typeof input.authority.read !== "function")
    throw new TypeError("A collective authority reader is required");
  const process = input.processor.process.bind(input.processor);
  const read = input.authority.read.bind(input.authority);
  return Object.freeze({
    async process(
      state: MeshObjectiveInboundRuntimeState,
      request: MeshObjectiveInboundRequest,
    ) {
      let candidate: MeshObjectiveInboundDecision;
      try {
        candidate = await process(state, request);
      } catch {
        return rejectObjective(state, "governed_boundary_invalid");
      }
      if (!candidate.accepted) return candidate;
      let authority: CollectiveAuthorityStateV1;
      try {
        authority = validateCollectiveAuthorityStateV1(await read());
      } catch {
        return rejectObjective(
          replayOnlyState(state, candidate.state),
          "governed_boundary_invalid",
        );
      }
      const payload = candidate.envelope.payload;
      const reference =
        payload.type === "objective.cancel"
          ? state.objectives.objectives[payload.objectiveId]?.contentReference
          : payload.contentReference;
      const mandateDigest =
        reference === undefined
          ? null
          : parseDelegationMandateReferenceV1(reference);
      if (!mandateDigest)
        return rejectObjective(
          replayOnlyState(state, candidate.state),
          "mandate_reference_required",
        );
      const record = authority.mandates.find(
        (item) => item.mandate.mandateDigest === mandateDigest,
      );
      if (!record)
        return rejectObjective(
          replayOnlyState(state, candidate.state),
          "mandate_not_installed",
        );
      const mandate = record.mandate;
      if (payload.type === "objective.cancel") {
        const code = validateCancellationBinding(state, payload, mandate);
        return code
          ? rejectObjective(replayOnlyState(state, candidate.state), code)
          : acceptObjective(candidate, mandateDigest);
      }
      const authorization = authorizeDelegationMandateAtV1(authority, {
        mandateId: mandate.statement.mandateId,
        mandateDigest,
        at: request.verifiedAt,
      });
      if (!authorization.authorized)
        return rejectObjective(
          replayOnlyState(state, candidate.state),
          "mandate_not_current",
        );
      const code = validateObjectiveBinding(
        state.objectives.identity,
        candidate.envelope.sender.peerId,
        payload,
        authorization.mandate,
      );
      return code
        ? rejectObjective(replayOnlyState(state, candidate.state), code)
        : acceptObjective(candidate, mandateDigest);
    },
  });
}

export interface MeshWorkContractSourceV1 {
  readonly workContractId: string;
  readonly identity: MeshPeerIdentity;
  readonly objective: MeshObjectiveProjection;
  readonly workItem: MeshWorkItemProjection;
  readonly execution: MeshExecutionHeadProjection;
  readonly fenceHead: MeshAssignmentFenceHeadProjection;
  readonly mandate: DelegationMandateV1;
  readonly roleKey: string;
  readonly trustPolicyId: string;
  readonly inferencePolicyId: string;
  readonly maximumActionBudgetUnits: number;
  readonly createdAtLogicalMs: number;
}

/** Creates a local Work Contract only from a current active Mesh assignment. */
export function createWorkContractFromMeshV1(
  source: MeshWorkContractSourceV1,
): WorkContractV1 {
  const mandate = validateDelegationMandateV1(source.mandate);
  const { identity, objective, workItem, execution, fenceHead } = source;
  if (
    objective.status !== "active" ||
    workItem.status !== "ready" ||
    execution.phase !== "active" ||
    fenceHead.phase !== "active" ||
    execution.assigneePeerId !== identity.peerId ||
    execution.objectiveId !== objective.objectiveId ||
    execution.objectiveDocumentId !== objective.objectiveDocumentId ||
    execution.objectiveRevision !== objective.objectiveRevision ||
    execution.workItemId !== workItem.workItemId ||
    execution.workItemRevision !== workItem.workItemRevision ||
    execution.assignmentAuthorityId !== fenceHead.assignmentAuthorityId ||
    execution.assignmentEpoch !== fenceHead.assignmentEpoch ||
    execution.fencingToken !== fenceHead.fencingToken ||
    execution.assigneePeerId !== fenceHead.assigneePeerId ||
    workItem.objectiveId !== objective.objectiveId ||
    workItem.objectiveDocumentId !== objective.objectiveDocumentId ||
    workItem.objectiveRevision !== objective.objectiveRevision ||
    objectivePolicyDigest(objective) !==
      objectivePolicySnapshotDigest(workItem.objectivePolicy) ||
    workItem.requiredCapabilityKeys.some(
      (key) => !objective.permittedCapabilityKeys.includes(key),
    ) ||
    workItem.budgetReservationUnits > objective.maximumBudgetUnits ||
    source.createdAtLogicalMs >= execution.leaseExpiresAtLogical
  )
    throw new TypeError("Mesh work authority is not current");
  const objectiveReference = objective.contentReference;
  if (
    objectiveReference === undefined ||
    parseDelegationMandateReferenceV1(objectiveReference) !==
      mandate.mandateDigest
  )
    throw new TypeError("Mesh Objective mandate binding is invalid");
  const body = {
    schemaVersion: 1 as const,
    workContractId: source.workContractId,
    generation: 1,
    tenantId: identity.tenantId,
    policyDomainId: mandate.statement.policyDomainId,
    mandate: {
      schemaVersion: 1 as const,
      mandateId: mandate.statement.mandateId,
      mandateRevision: mandate.statement.revision,
      mandateDigest: mandate.mandateDigest,
    },
    objective: {
      schemaVersion: 1 as const,
      meshId: identity.meshId,
      objectiveId: objective.objectiveId,
      objectiveDocumentId: objective.objectiveDocumentId,
      objectiveRevision: objective.objectiveRevision,
      acceptedMessageId: objective.acceptedMessageId,
      acceptedPolicyDigest: objectivePolicySnapshotDigest(
        workItem.objectivePolicy,
      ),
    },
    assignment: {
      schemaVersion: 1 as const,
      workItemId: workItem.workItemId,
      workItemRevision: workItem.workItemRevision,
      ownerPeerId: workItem.ownerPeerId,
      assignedPeerId: execution.assigneePeerId,
      assignedInstanceId: identity.instanceId,
      assignmentAuthorityId: execution.assignmentAuthorityId,
      assignmentEpoch: execution.assignmentEpoch,
      authorityGeneration: fenceHead.assignmentEpoch,
      fencingToken: execution.fencingToken,
      leaseExpiresAtLogicalMs: execution.leaseExpiresAtLogical,
      workDeadline: execution.workDeadline,
    },
    roleKey: source.roleKey,
    requiredCapabilityKeys: workItem.requiredCapabilityKeys,
    completionCriteria: workItem.completionCriteria,
    inputReferenceDigest: inputReferenceDigest(workItem.inputReference),
    reservedBudgetUnits: workItem.budgetReservationUnits,
    maximumActionBudgetUnits: source.maximumActionBudgetUnits,
    trustPolicyId: source.trustPolicyId,
    inferencePolicyId: source.inferencePolicyId,
    createdAtLogicalMs: source.createdAtLogicalMs,
    updatedAtLogicalMs: source.createdAtLogicalMs,
    status: "active" as const,
    terminalReasonCode: null,
  };
  return validateWorkContractV1({
    ...body,
    workContractDigest: workContractDigestV1(body),
  });
}

export type WorkContractCurrentnessCodeV1 =
  | "current"
  | "mandate_not_current"
  | "objective_not_current"
  | "work_not_current"
  | "assignment_not_current"
  | "lease_expired";

export type WorkContractCurrentnessDecisionV1 =
  | { readonly current: true; readonly code: "current" }
  | {
      readonly current: false;
      readonly code: Exclude<WorkContractCurrentnessCodeV1, "current">;
      readonly terminalStatus: "revoked" | "expired" | "released";
    };

/** Rechecks every mutable upstream head without widening the Work Contract. */
export function evaluateWorkContractCurrentnessV1(input: {
  readonly workContract: WorkContractV1;
  readonly authorityState: CollectiveAuthorityStateV1;
  readonly objective: MeshObjectiveProjection | null;
  readonly workItem: MeshWorkItemProjection | null;
  readonly execution: MeshExecutionHeadProjection | null;
  readonly fenceHead: MeshAssignmentFenceHeadProjection | null;
  readonly wallTime: string;
  readonly logicalTimeMs: number;
}): WorkContractCurrentnessDecisionV1 {
  const work = validateWorkContractV1(input.workContract);
  const authorization = authorizeDelegationMandateAtV1(input.authorityState, {
    mandateId: work.mandate.mandateId,
    mandateDigest: work.mandate.mandateDigest,
    at: input.wallTime,
  });
  if (!authorization.authorized)
    return Object.freeze({
      current: false,
      code: "mandate_not_current",
      terminalStatus: "revoked",
    });
  const objective = input.objective;
  if (
    !objective ||
    objective.status !== "active" ||
    objective.objectiveId !== work.objective.objectiveId ||
    objective.objectiveDocumentId !== work.objective.objectiveDocumentId ||
    objective.objectiveRevision !== work.objective.objectiveRevision ||
    objective.acceptedMessageId !== work.objective.acceptedMessageId ||
    parseDelegationMandateReferenceV1(objective.contentReference ?? "") !==
      work.mandate.mandateDigest ||
    objectivePolicyDigest(objective) !== work.objective.acceptedPolicyDigest
  )
    return Object.freeze({
      current: false,
      code: "objective_not_current",
      terminalStatus: "released",
    });
  const item = input.workItem;
  if (
    !item ||
    item.status !== "ready" ||
    item.workItemId !== work.assignment.workItemId ||
    item.workItemRevision !== work.assignment.workItemRevision ||
    item.objectiveId !== work.objective.objectiveId ||
    item.objectiveDocumentId !== work.objective.objectiveDocumentId ||
    item.objectiveRevision !== work.objective.objectiveRevision ||
    objectivePolicySnapshotDigest(item.objectivePolicy) !==
      work.objective.acceptedPolicyDigest ||
    !sameStrings(item.requiredCapabilityKeys, work.requiredCapabilityKeys) ||
    !sameStrings(item.completionCriteria, work.completionCriteria) ||
    item.budgetReservationUnits !== work.reservedBudgetUnits ||
    item.workDeadline !== work.assignment.workDeadline ||
    inputReferenceDigest(item.inputReference) !== work.inputReferenceDigest
  )
    return Object.freeze({
      current: false,
      code: "work_not_current",
      terminalStatus: "released",
    });
  const execution = input.execution;
  const fence = input.fenceHead;
  if (
    !execution ||
    !fence ||
    execution.phase !== "active" ||
    fence.phase !== "active" ||
    execution.assignmentAuthorityId !== work.assignment.assignmentAuthorityId ||
    execution.assignmentEpoch !== work.assignment.assignmentEpoch ||
    execution.fencingToken !== work.assignment.fencingToken ||
    execution.assigneePeerId !== work.assignment.assignedPeerId ||
    fence.assignmentAuthorityId !== work.assignment.assignmentAuthorityId ||
    fence.assignmentEpoch !== work.assignment.assignmentEpoch ||
    fence.fencingToken !== work.assignment.fencingToken
  )
    return Object.freeze({
      current: false,
      code: "assignment_not_current",
      terminalStatus: "released",
    });
  if (
    input.logicalTimeMs >= work.assignment.leaseExpiresAtLogicalMs ||
    input.logicalTimeMs >= execution.leaseExpiresAtLogical
  )
    return Object.freeze({
      current: false,
      code: "lease_expired",
      terminalStatus: "expired",
    });
  return Object.freeze({ current: true, code: "current" });
}

function validateObjectiveBinding(
  identity: MeshPeerIdentity,
  senderPeerId: string,
  payload: Extract<
    Extract<
      MeshObjectiveInboundDecision,
      { accepted: true }
    >["envelope"]["payload"],
    { type: "objective.announce" | "objective.revise" }
  >,
  mandate: DelegationMandateV1,
): GovernedMeshObjectiveRejectionCodeV1 | null {
  const statement = mandate.statement;
  if (
    statement.tenantId !== identity.tenantId ||
    statement.objective.meshId !== identity.meshId
  )
    return "mandate_scope_mismatch";
  if (
    payload.objectiveId !== statement.objective.objectiveId ||
    payload.objectiveDocumentId !== statement.objective.objectiveDocumentId ||
    payload.objectiveRevision < statement.objective.minimumObjectiveRevision ||
    payload.objectiveRevision > statement.objective.maximumObjectiveRevision
  )
    return "mandate_objective_mismatch";
  if (
    statement.issuerId !== payload.issuerPeerId ||
    senderPeerId !== payload.issuerPeerId
  )
    return "mandate_issuer_mismatch";
  if (!statement.subjectPeerIds.includes(identity.peerId))
    return "mandate_subject_mismatch";
  if (
    payload.permittedCapabilityKeys.some(
      (key) => !statement.permittedCapabilityKeys.includes(key),
    )
  )
    return "mandate_capability_mismatch";
  if (
    payload.maximumBudgetUnits > statement.budget.totalBudgetUnits ||
    payload.maximumConcurrentAssignments >
      statement.budget.maximumConcurrentWorkReservations
  )
    return "mandate_budget_mismatch";
  if (
    Date.parse(payload.validFrom) < Date.parse(statement.validFrom) ||
    Date.parse(payload.validUntil) > Date.parse(statement.validUntil)
  )
    return "mandate_validity_mismatch";
  return null;
}

function validateCancellationBinding(
  state: MeshObjectiveInboundRuntimeState,
  payload: {
    readonly objectiveId: string;
    readonly objectiveDocumentId: string;
    readonly objectiveRevision: number;
  },
  mandate: DelegationMandateV1,
): GovernedMeshObjectiveRejectionCodeV1 | null {
  const current = state.objectives.objectives[payload.objectiveId];
  if (!current) return "mandate_objective_mismatch";
  if (
    current.objectiveDocumentId !== payload.objectiveDocumentId ||
    current.objectiveRevision !== payload.objectiveRevision ||
    current.objectiveId !== mandate.statement.objective.objectiveId ||
    current.objectiveDocumentId !==
      mandate.statement.objective.objectiveDocumentId ||
    current.issuerPeerId !== mandate.statement.issuerId ||
    state.objectives.identity.tenantId !== mandate.statement.tenantId ||
    state.objectives.identity.meshId !== mandate.statement.objective.meshId
  )
    return "mandate_objective_mismatch";
  return null;
}

function objectivePolicyDigest(
  objective: MeshObjectiveProjection,
): CollectiveDigestV1 {
  return objectivePolicySnapshotDigest({
    acceptedMessageId: objective.acceptedMessageId,
    acceptedAt: objective.acceptedAt,
    acceptanceWindowMs: objective.acceptanceWindowMs,
    expiresAt: objective.expiresAt,
    maximumBudgetUnits: objective.maximumBudgetUnits,
    maximumLeaseDurationMs: objective.maximumLeaseDurationMs,
    maximumLeaseRenewals: objective.maximumLeaseRenewals,
    objectiveDocumentId: objective.objectiveDocumentId,
    objectiveId: objective.objectiveId,
    objectiveRevision: objective.objectiveRevision,
    permittedCapabilityKeys: [...objective.permittedCapabilityKeys],
    recoveryGraceMs: objective.recoveryGraceMs,
    recoveryWitnessPeerIds: [...objective.recoveryWitnessPeerIds],
    recoveryWitnessThreshold: objective.recoveryWitnessThreshold,
    validUntil: objective.validUntil,
  });
}

function objectivePolicySnapshotDigest(value: {
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly acceptedMessageId: string;
  readonly acceptedAt: number;
  readonly expiresAt: number;
  readonly permittedCapabilityKeys: readonly string[];
  readonly maximumBudgetUnits: number;
  readonly acceptanceWindowMs: number;
  readonly maximumLeaseDurationMs: number;
  readonly recoveryGraceMs: number;
  readonly maximumLeaseRenewals: number;
  readonly recoveryWitnessPeerIds: readonly string[];
  readonly recoveryWitnessThreshold: number;
  readonly validUntil: string;
}): CollectiveDigestV1 {
  return digestCollectiveJsonV1("state", {
    ...value,
    permittedCapabilityKeys: [...value.permittedCapabilityKeys],
    recoveryWitnessPeerIds: [...value.recoveryWitnessPeerIds],
    schemaVersion: 1,
  });
}

function inputReferenceDigest(
  value: string | undefined,
): CollectiveDigestV1 | null {
  return value === undefined
    ? null
    : digestCollectiveJsonV1("state", { reference: value, schemaVersion: 1 });
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

function replayOnlyState(
  original: MeshObjectiveInboundRuntimeState,
  candidate: MeshObjectiveInboundRuntimeState,
): MeshObjectiveInboundRuntimeState {
  return createMeshObjectiveInboundRuntimeState(
    original.coordination,
    original.discovery,
    original.objectives,
    candidate.inbound,
  );
}

function acceptObjective(
  candidate: Extract<MeshObjectiveInboundDecision, { accepted: true }>,
  mandateDigest: CollectiveDigestV1,
): GovernedMeshObjectiveInboundDecisionV1 {
  return Object.freeze({ ...candidate, mandateDigest });
}

function rejectObjective(
  state: MeshObjectiveInboundRuntimeState,
  code: GovernedMeshObjectiveRejectionCodeV1,
): GovernedMeshObjectiveInboundDecisionV1 {
  return Object.freeze({ accepted: false, code, state });
}
