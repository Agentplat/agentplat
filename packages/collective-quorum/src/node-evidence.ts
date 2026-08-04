import type {
  CollectivePeerNodeQuorumEvidenceOptionsV1,
  CollectiveQuorumAssignmentRequestPayloadV1,
  CollectiveQuorumRecoveryAcceptPayloadV1,
  CollectiveQuorumRecoveryPreparePayloadV1,
  CollectiveQuorumRecoveryValueV1,
  CollectiveQuorumSemanticEvidencePortV1,
} from "./contracts.js";

/**
 * Reads the durable node projection instead of treating transport delivery as
 * semantic acknowledgement. No callback may manufacture assignment facts.
 */
export class CollectivePeerNodeQuorumEvidenceV1 implements CollectiveQuorumSemanticEvidencePortV1 {
  constructor(readonly options: CollectivePeerNodeQuorumEvidenceOptionsV1) {
    if (!options?.scope || typeof options.readState !== "function")
      throw new TypeError("scope and readState are required");
  }

  async confirmAssignment(input: {
    readonly request: CollectiveQuorumAssignmentRequestPayloadV1;
    readonly localPeerId: string;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly acceptanceId: string;
    readonly confirmedLeaseExpiresAt: string;
    readonly attesterRole: "owner" | "witness";
  } | null> {
    const state = await this.options.readState();
    const request = input.request;
    if (
      state.scope.tenantId !== this.options.scope.tenantId ||
      state.scope.meshId !== this.options.scope.meshId ||
      state.scope.peerId !== input.localPeerId ||
      state.scope.peerId !== this.options.scope.peerId ||
      state.scope.instanceId !== this.options.scope.instanceId ||
      state.scope.policyDomainId !== request.policyDomainId ||
      state.scope.policyDomainId !== this.options.scope.policyDomainId
    )
      return null;
    const allocation = state.runtime.mesh.allocation;
    const role =
      input.localPeerId === request.ownerPeerId
        ? "owner"
        : request.eligibleWitnessPeerIds.includes(input.localPeerId)
          ? "witness"
          : null;
    if (!role) return null;
    const lease =
      role === "owner"
        ? Object.values(allocation.leaseHeads).find((candidate) =>
            leaseMatches(candidate, request, input.logicalTimeMs),
          )
        : Object.values(allocation.witnessAssignments)
            .map(({ leaseHead }) => leaseHead)
            .find(
              (candidate) =>
                candidate !== undefined &&
                leaseMatches(candidate, request, input.logicalTimeMs),
            );
    if (!lease) return null;
    const acceptanceEnvelope =
      role === "owner"
        ? Object.values(allocation.assignmentResponses).find(
            ({ envelope }) =>
              envelope.messageId === request.acceptanceMessageId &&
              envelope.payload.type === "work.accept",
          )?.envelope
        : Object.values(allocation.witnessAssignments).find(
            ({ leaseHead }) => leaseHead === lease,
          )?.acceptanceEnvelope;
    if (
      !acceptanceEnvelope ||
      acceptanceEnvelope.messageId !== request.acceptanceMessageId ||
      acceptanceEnvelope.sender.peerId !== request.assignedPeerId ||
      acceptanceEnvelope.sender.instanceId !== request.assignedInstanceId ||
      acceptanceEnvelope.payload.type !== "work.accept"
    )
      return null;
    return Object.freeze({
      acceptanceId: lease.acceptanceId,
      confirmedLeaseExpiresAt: lease.currentLeaseExpiresAt,
      attesterRole: role,
    });
  }

  async acceptsRecoveryValue(input: {
    readonly request:
      | CollectiveQuorumRecoveryPreparePayloadV1
      | CollectiveQuorumRecoveryAcceptPayloadV1;
    readonly selected: CollectiveQuorumRecoveryValueV1;
    readonly localPeerId: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    if (!input.request.eligibleWitnessPeerIds.includes(input.localPeerId))
      return false;
    const state = await this.options.readState();
    if (
      state.scope.tenantId !== this.options.scope.tenantId ||
      state.scope.meshId !== this.options.scope.meshId ||
      state.scope.peerId !== input.localPeerId ||
      state.scope.peerId !== this.options.scope.peerId ||
      state.scope.instanceId !== this.options.scope.instanceId ||
      state.scope.policyDomainId !== this.options.scope.policyDomainId
    )
      return false;
    const retained =
      state.runtime.mesh.allocation.takeoverProposals[
        input.selected.selectedProposalId
      ];
    if (!retained || retained.acceptedAt > input.logicalTimeMs) return false;
    const payload = retained.envelope.payload;
    const declared = input.request.proposals.find(
      ({ takeoverProposalId }) =>
        takeoverProposalId === input.selected.selectedProposalId,
    );
    return Boolean(
      declared &&
      declared.proposedAssigneePeerId ===
        input.selected.selectedAssigneePeerId &&
      declared.acceptedAtLogicalMs === retained.acceptedAt &&
      payload.proposedAssigneePeerId ===
        input.selected.selectedAssigneePeerId &&
      payload.objectiveId === input.request.objectiveId &&
      payload.objectiveRevision === input.request.objectiveRevision &&
      payload.workItemId === input.request.workItemId &&
      payload.workItemRevision === input.request.workItemRevision &&
      payload.assignmentEpoch === input.request.priorAssignmentEpoch &&
      payload.proposedAssignmentEpoch === input.request.proposedAssignmentEpoch,
    );
  }
}

function leaseMatches(
  lease: {
    readonly objectiveId: string;
    readonly objectiveRevision: number;
    readonly workItemId: string;
    readonly workItemRevision: number;
    readonly ownerPeerId: string;
    readonly assigneePeerId: string;
    readonly assignmentAuthorityId: string;
    readonly assignmentEpoch: number;
    readonly fencingToken: string;
    readonly acceptanceMessageId: string;
    readonly latestLeaseRenewalId?: string;
    readonly currentLeaseExpiresAtLogical: number;
    readonly status: string;
  },
  request: CollectiveQuorumAssignmentRequestPayloadV1,
  logicalTimeMs: number,
): boolean {
  return (
    lease.status === "active" &&
    lease.objectiveId === request.objectiveId &&
    lease.objectiveRevision === request.objectiveRevision &&
    lease.workItemId === request.workItemId &&
    lease.workItemRevision === request.workItemRevision &&
    lease.ownerPeerId === request.ownerPeerId &&
    lease.assigneePeerId === request.assignedPeerId &&
    lease.assignmentAuthorityId === request.assignmentAuthorityId &&
    lease.assignmentEpoch === request.assignmentEpoch &&
    lease.fencingToken === request.fencingToken &&
    lease.acceptanceMessageId === request.acceptanceMessageId &&
    (lease.latestLeaseRenewalId ?? null) === request.latestLeaseRenewalId &&
    logicalTimeMs < lease.currentLeaseExpiresAtLogical
  );
}
