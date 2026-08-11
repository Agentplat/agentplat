import {
  canonicalizeMeshPayload,
  compareMeshTimestamps,
  validateMeshEnvelopeContext,
  validateSignedMeshEnvelope,
  type LeaseCertificatePayload,
  type LeaseRenewPayload,
  type LeaseTakeoverProposalPayload,
  type LeaseVotePayload,
  type SignedMeshEnvelope,
  type WorkAcceptPayload,
  type WorkAwardPayload,
  type WorkCheckpointPayload,
} from "@agentplat/mesh-protocol";

import type {
  MeshAllocationDecision,
  MeshAllocationEffect,
  MeshAllocationRejectionCode,
  MeshAllocationRuntimeState,
  MeshAssignmentFenceHeadProjection,
  MeshExecutionRecordProjection,
  MeshLeaseHeadProjection,
  MeshLeaseRenewalEvidence,
  MeshLeaseVoteProjection,
  MeshLocalRecoveryCommand,
  MeshRecoveryCertificateProjection,
  MeshTakeoverProposalProjection,
  MeshVerifiedAllocationRequest,
  MeshWitnessAssignmentProjection,
} from "./coordination-allocation-contracts.js";
import {
  createMeshAllocationRuntimeState,
  meshAllocationRetainsMessageId,
  meshAssignmentFenceKey,
  restoreMeshAllocationState,
} from "./coordination-allocation-state.js";
import { logicalDeadline } from "./coordination-objective-work-time.js";
import { sha256Base64Url } from "./sha256.js";
import { createFrozenRecord, recordEntries } from "./state.js";

type RecoveryPayload =
  LeaseTakeoverProposalPayload | LeaseVotePayload | LeaseCertificatePayload;
type WitnessPayload =
  | WorkAwardPayload
  | WorkAcceptPayload
  | LeaseRenewPayload
  | WorkCheckpointPayload;
type Direction = "local" | "received";
const utf8Encoder = new TextEncoder();

/** Applies a locally signed recovery proposal, vote, or certificate. */
export function evaluateMeshRecoveryCommand(
  state: MeshAllocationRuntimeState,
  command: MeshLocalRecoveryCommand,
  verifiedAt: string,
  receivedAt: number,
): MeshAllocationDecision {
  if (
    !command ||
    typeof command !== "object" ||
    Object.keys(command).sort().join(",") !== "kind,recipients" ||
    command.kind !== "allocation.recovery" ||
    !Array.isArray(command.recipients) ||
    command.recipients.length === 0 ||
    command.recipients.length > 32 ||
    command.recipients.some(
      (recipient) =>
        !recipient ||
        typeof recipient !== "object" ||
        Object.keys(recipient).sort().join(",") !==
          "envelope,preparedAt,recipientPeerId" ||
        typeof recipient.recipientPeerId !== "string" ||
        !Number.isSafeInteger(recipient.preparedAt) ||
        recipient.preparedAt !== receivedAt,
    )
  )
    throw new TypeError("Invalid Mesh recovery command");
  const parsed = command.recipients.map((recipient) => ({
    recipient,
    result: validateSignedMeshEnvelope(recipient.envelope),
  }));
  if (
    parsed.some(({ result }) => !result.ok) ||
    parsed.some(
      ({ result }) => result.ok && !isRecoveryPayload(result.value.payload),
    )
  )
    return reject(state, "recovery_invalid");
  const prepared = parsed
    .map(({ recipient, result }) => {
      if (!result.ok) throw new TypeError("Invalid Mesh recovery envelope");
      return {
        recipientPeerId: recipient.recipientPeerId,
        envelope: result.value as SignedMeshEnvelope<RecoveryPayload>,
      };
    })
    .sort((left, right) =>
      compareText(left.recipientPeerId, right.recipientPeerId),
    );
  const first = prepared[0]!.envelope;
  const expectedRecipients = expectedRecoveryRecipients(state, first.payload);
  const recipientPeerIds = prepared.map(
    (recipient) => recipient.recipientPeerId,
  );
  if (
    expectedRecipients === undefined ||
    !sameArray(recipientPeerIds, expectedRecipients) ||
    new Set(recipientPeerIds).size !== recipientPeerIds.length ||
    prepared.some(
      ({ envelope, recipientPeerId }) =>
        envelope.audience.kind !== "peer" ||
        envelope.audience.peerId !== recipientPeerId ||
        envelope.sender.peerId !== state.allocation.identity.peerId ||
        envelope.sender.instanceId !== state.allocation.identity.instanceId ||
        envelope.proof.keyId !== state.allocation.identity.keyId ||
        !sameData(envelope.payload, first.payload) ||
        envelope.payloadHash !== first.payloadHash ||
        envelope.sentAt !== first.sentAt ||
        envelope.expiresAt !== first.expiresAt ||
        envelope.causationId !== first.causationId ||
        envelope.correlationId !== first.correlationId ||
        !sameData(envelope.criticalExtensions, first.criticalExtensions) ||
        !canonicalDigest(envelope) ||
        !validateMeshEnvelopeContext(envelope, {
          tenantId: state.allocation.identity.tenantId,
          meshId: state.allocation.identity.meshId,
          peerId: recipientPeerId,
          receivedAt: verifiedAt,
        }).ok,
    )
  )
    return reject(state, "recovery_invalid");
  const recipientEnvelopes = createFrozenRecord(
    prepared.map(({ recipientPeerId, envelope }) => [
      recipientPeerId,
      envelope,
    ]),
  );
  return applyRecovery(
    state,
    first,
    verifiedAt,
    receivedAt,
    "local",
    undefined,
    recipientEnvelopes,
  );
}

/** Applies one authenticated remote recovery proposal, vote, or certificate. */
export function evaluateVerifiedMeshRecoveryEnvelope(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
): MeshAllocationDecision {
  if (!isRecoveryPayload(request.envelope.payload))
    return reject(state, "recovery_invalid");
  return applyRecovery(
    state,
    request.envelope as SignedMeshEnvelope<RecoveryPayload>,
    request.verifiedAt,
    request.receivedAt,
    "received",
    request.supportedCriticalExtensions,
  );
}

/**
 * Retains assignment authority delivered directly to a configured witness.
 *
 * Award, acceptance, renewal, and checkpoint copies use the normal
 * authenticated inbound boundary. They never grant local execution authority.
 */
export function evaluateVerifiedMeshWitnessEnvelope(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
): MeshAllocationDecision {
  const payload = request.envelope.payload;
  if (!isWitnessPayload(payload))
    return reject(state, "witness_assignment_invalid");
  const envelope = request.envelope as SignedMeshEnvelope<WitnessPayload>;
  const policy = historicalPolicy(
    state,
    payload.objectiveId,
    payload.objectiveRevision,
  );
  if (
    policy === undefined ||
    !policy.recoveryWitnessPeerIds.includes(state.allocation.identity.peerId) ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== state.allocation.identity.peerId
  )
    return reject(state, "witness_assignment_invalid");
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: state.allocation.identity.tenantId,
    meshId: state.allocation.identity.meshId,
    peerId: state.allocation.identity.peerId,
    receivedAt: request.verifiedAt,
    ...(request.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: request.supportedCriticalExtensions,
        }),
  });
  if (!context.ok || !canonicalDigest(envelope))
    return reject(state, "witness_assignment_invalid");
  const retainedWitnessEnvelope = retainedWitnessEnvelopeByMessageId(
    state,
    envelope.messageId,
  );
  if (retainedWitnessEnvelope !== undefined)
    return sameData(retainedWitnessEnvelope, envelope)
      ? acceptedDuplicate(state)
      : reject(state, "witness_assignment_duplicate_conflict");
  if (meshAllocationRetainsMessageId(state, envelope.messageId))
    return reject(state, "witness_assignment_duplicate_conflict");
  const fenceKey = meshAssignmentFenceKey(payload);
  const prior = state.allocation.witnessAssignments[fenceKey];
  if (payload.type === "work.award")
    return acceptWitnessAward(
      state,
      request,
      policy.recoveryWitnessPeerIds,
      prior,
    );
  if (prior === undefined) return reject(state, "witness_assignment_invalid");
  if (payload.type === "work.accept")
    return acceptWitnessAcceptance(state, request, prior);
  if (payload.type === "lease.renew")
    return acceptWitnessRenewal(
      state,
      request,
      prior,
      policy.maximumLeaseDurationMs,
      policy.maximumLeaseRenewals,
    );
  return acceptWitnessCheckpoint(state, request, prior);
}

function applyRecovery(
  state: MeshAllocationRuntimeState,
  envelope: SignedMeshEnvelope<RecoveryPayload>,
  verifiedAt: string,
  acceptedAt: number,
  direction: Direction,
  supportedCriticalExtensions?: readonly string[],
  recipientEnvelopes?: Readonly<
    Record<string, SignedMeshEnvelope<RecoveryPayload>>
  >,
): MeshAllocationDecision {
  const payload = envelope.payload;
  const recordType = payload.type;
  const recordId = recoveryRecordId(payload);
  const existing = recoveryProjection(state, payload);
  if (existing !== undefined)
    return existing.direction === direction &&
      sameData(existing.envelope, envelope)
      ? acceptedDuplicate(state)
      : reject(state, "recovery_duplicate_conflict");
  if (
    state.coordination.domainRecords[domainKey(recordType, recordId)] !==
    undefined
  )
    return reject(state, "domain_record_conflict");
  if (meshAllocationRetainsMessageId(state, envelope.messageId))
    return reject(state, "recovery_duplicate_conflict");
  if (
    envelope.audience.kind !== "peer" ||
    (direction === "received" &&
      envelope.audience.peerId !== state.allocation.identity.peerId) ||
    (direction === "local" &&
      (envelope.sender.peerId !== state.allocation.identity.peerId ||
        envelope.sender.instanceId !== state.allocation.identity.instanceId ||
        envelope.proof.keyId !== state.allocation.identity.keyId))
  )
    return reject(state, "recovery_invalid");
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: state.allocation.identity.tenantId,
    meshId: state.allocation.identity.meshId,
    peerId: envelope.audience.peerId,
    receivedAt: verifiedAt,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions }),
  });
  if (!context.ok || !canonicalDigest(envelope))
    return reject(state, "recovery_invalid");
  if (payload.type === "lease.takeover_proposal")
    return applyProposal(
      state,
      envelope as SignedMeshEnvelope<LeaseTakeoverProposalPayload>,
      verifiedAt,
      acceptedAt,
      direction,
      supportedCriticalExtensions,
      recipientEnvelopes as
        | Readonly<
            Record<string, SignedMeshEnvelope<LeaseTakeoverProposalPayload>>
          >
        | undefined,
    );
  if (payload.type === "lease.vote")
    return applyVote(
      state,
      envelope as SignedMeshEnvelope<LeaseVotePayload>,
      verifiedAt,
      acceptedAt,
      direction,
      supportedCriticalExtensions,
      recipientEnvelopes as
        | Readonly<Record<string, SignedMeshEnvelope<LeaseVotePayload>>>
        | undefined,
    );
  return applyCertificate(
    state,
    envelope as SignedMeshEnvelope<LeaseCertificatePayload>,
    verifiedAt,
    acceptedAt,
    direction,
    supportedCriticalExtensions,
    recipientEnvelopes as
      | Readonly<Record<string, SignedMeshEnvelope<LeaseCertificatePayload>>>
      | undefined,
  );
}

function applyProposal(
  state: MeshAllocationRuntimeState,
  envelope: SignedMeshEnvelope<LeaseTakeoverProposalPayload>,
  verifiedAt: string,
  acceptedAt: number,
  direction: Direction,
  supportedCriticalExtensions?: readonly string[],
  recipientEnvelopes?: Readonly<
    Record<string, SignedMeshEnvelope<LeaseTakeoverProposalPayload>>
  >,
): MeshAllocationDecision {
  const payload = envelope.payload;
  if (envelope.audience.kind !== "peer")
    return reject(state, "recovery_invalid");
  const recipientPeerId = envelope.audience.peerId;
  const key = meshAssignmentFenceKey(payload);
  const fence = state.allocation.assignmentFenceHeads[key];
  const witness = state.allocation.witnessAssignments[key];
  const lease = currentLeaseForFence(state, fence, witness);
  const policy = historicalPolicy(
    state,
    payload.objectiveId,
    payload.objectiveRevision,
  );
  if (
    fence === undefined ||
    fence.phase !== "expired" ||
    lease === undefined ||
    lease.status !== "expired" ||
    policy === undefined ||
    acceptedAt < lease.currentLeaseExpiresAtLogical + policy.recoveryGraceMs ||
    payload.proposedAssignmentEpoch !== fence.assignmentEpoch + 1 ||
    !proposalMatchesLease(payload, lease) ||
    envelope.sender.peerId !== payload.proposerPeerId ||
    !isRecoveryParticipant(
      recipientPeerId,
      payload,
      policy.recoveryWitnessPeerIds,
      true,
    ) ||
    !isAdmittedPeer(state, payload.proposedAssigneePeerId, verifiedAt)
  )
    return reject(
      state,
      acceptedAt <
        (lease?.currentLeaseExpiresAtLogical ?? 0) +
          (policy?.recoveryGraceMs ?? 0)
        ? "recovery_grace_not_elapsed"
        : "recovery_authority_stale",
    );
  if (payload.proposalAuthority === "witness") {
    if (!policy.recoveryWitnessPeerIds.includes(payload.proposerPeerId))
      return reject(state, "recovery_invalid");
    const consent =
      state.allocation.takeoverProposals[payload.candidateConsentProposalId];
    if (
      consent === undefined ||
      consent.envelope.payload.proposalAuthority !== "candidate" ||
      consent.envelope.payload.proposedAssigneePeerId !==
        payload.proposedAssigneePeerId ||
      consent.envelope.payload.proposedAssignmentEpoch !==
        payload.proposedAssignmentEpoch ||
      meshAssignmentFenceKey(consent.envelope.payload) !== key ||
      (direction === "local" &&
        envelope.causationId !==
          recoveryEnvelopeForPeer(consent, payload.proposerPeerId).messageId)
    )
      return reject(state, "recovery_invalid");
  } else {
    if (
      payload.proposerPeerId !== payload.proposedAssigneePeerId ||
      (direction === "local" &&
        envelope.causationId !== currentLeaseCausationMessageId(witness, lease))
    )
      return reject(state, "recovery_invalid");
  }
  if (
    Object.keys(state.allocation.takeoverProposals).length >=
    state.allocation.limits.maximumTakeoverProposals
  )
    return reject(state, "recovery_capacity_exceeded");
  const projection: MeshTakeoverProposalProjection = Object.freeze({
    takeoverProposalId: payload.takeoverProposalId,
    direction,
    acceptedAt,
    validityVerifiedAt: verifiedAt,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...supportedCriticalExtensions,
          ]),
        }),
    envelope,
    ...(recipientEnvelopes === undefined ? {} : { recipientEnvelopes }),
  });
  return commitRecord(
    state,
    {
      ...state.allocation,
      takeoverProposals: createFrozenRecord([
        ...recordEntries(state.allocation.takeoverProposals),
        [payload.takeoverProposalId, projection],
      ]),
    },
    envelope,
    payload.type,
    payload.takeoverProposalId,
    acceptedAt,
    direction,
    recoveryEffects(
      envelope,
      payload.takeoverProposalId,
      direction,
      recipientEnvelopes,
    ),
  );
}

function applyVote(
  state: MeshAllocationRuntimeState,
  envelope: SignedMeshEnvelope<LeaseVotePayload>,
  verifiedAt: string,
  acceptedAt: number,
  direction: Direction,
  supportedCriticalExtensions?: readonly string[],
  recipientEnvelopes?: Readonly<
    Record<string, SignedMeshEnvelope<LeaseVotePayload>>
  >,
): MeshAllocationDecision {
  const payload = envelope.payload;
  if (envelope.audience.kind !== "peer")
    return reject(state, "recovery_invalid");
  const recipientPeerId = envelope.audience.peerId;
  const proposal =
    state.allocation.takeoverProposals[payload.takeoverProposalId];
  if (proposal === undefined) return reject(state, "recovery_invalid");
  const proposalPayload = proposal.envelope.payload;
  const policy = historicalPolicy(
    state,
    proposalPayload.objectiveId,
    proposalPayload.objectiveRevision,
  );
  const key = meshAssignmentFenceKey(proposalPayload);
  const fence = state.allocation.assignmentFenceHeads[key];
  if (
    policy === undefined ||
    fence === undefined ||
    fence.phase !== "expired" ||
    payload.objectiveId !== proposalPayload.objectiveId ||
    acceptedAt < proposal.acceptedAt ||
    (direction === "local" &&
      envelope.causationId !==
        recoveryEnvelopeForPeer(proposal, payload.witnessPeerId).messageId) ||
    !policy.recoveryWitnessPeerIds.includes(payload.witnessPeerId) ||
    envelope.sender.peerId !== payload.witnessPeerId ||
    !isRecoveryParticipant(
      recipientPeerId,
      proposalPayload,
      policy.recoveryWitnessPeerIds,
    )
  )
    return reject(state, "recovery_authority_stale");
  const conflicting = Object.values(state.allocation.leaseVotes).find(
    (vote) => {
      const votedProposal =
        state.allocation.takeoverProposals[vote.takeoverProposalId];
      return (
        vote.witnessPeerId === payload.witnessPeerId &&
        votedProposal !== undefined &&
        meshAssignmentFenceKey(votedProposal.envelope.payload) === key &&
        votedProposal.envelope.payload.proposedAssignmentEpoch ===
          proposalPayload.proposedAssignmentEpoch
      );
    },
  );
  if (conflicting !== undefined) return reject(state, "recovery_vote_conflict");
  if (
    Object.keys(state.allocation.leaseVotes).length >=
    state.allocation.limits.maximumLeaseVotes
  )
    return reject(state, "recovery_capacity_exceeded");
  const projection: MeshLeaseVoteProjection = Object.freeze({
    leaseVoteId: payload.leaseVoteId,
    takeoverProposalId: payload.takeoverProposalId,
    witnessPeerId: payload.witnessPeerId,
    direction,
    acceptedAt,
    validityVerifiedAt: verifiedAt,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...supportedCriticalExtensions,
          ]),
        }),
    envelope,
    ...(recipientEnvelopes === undefined ? {} : { recipientEnvelopes }),
  });
  return commitRecord(
    state,
    {
      ...state.allocation,
      leaseVotes: createFrozenRecord([
        ...recordEntries(state.allocation.leaseVotes),
        [payload.leaseVoteId, projection],
      ]),
    },
    envelope,
    payload.type,
    payload.leaseVoteId,
    acceptedAt,
    direction,
    recoveryEffects(
      envelope,
      payload.leaseVoteId,
      direction,
      recipientEnvelopes,
    ),
  );
}

function applyCertificate(
  state: MeshAllocationRuntimeState,
  envelope: SignedMeshEnvelope<LeaseCertificatePayload>,
  verifiedAt: string,
  acceptedAt: number,
  direction: Direction,
  supportedCriticalExtensions?: readonly string[],
  recipientEnvelopes?: Readonly<
    Record<string, SignedMeshEnvelope<LeaseCertificatePayload>>
  >,
): MeshAllocationDecision {
  const payload = envelope.payload;
  if (envelope.audience.kind !== "peer")
    return reject(state, "recovery_invalid");
  const recipientPeerId = envelope.audience.peerId;
  const proposal =
    state.allocation.takeoverProposals[payload.takeoverProposalId];
  if (proposal === undefined) return reject(state, "recovery_invalid");
  const proposalPayload = proposal.envelope.payload;
  const key = meshAssignmentFenceKey(proposalPayload);
  const fence = state.allocation.assignmentFenceHeads[key];
  const policy = historicalPolicy(
    state,
    proposalPayload.objectiveId,
    proposalPayload.objectiveRevision,
  );
  const votes = payload.leaseVoteIds.map(
    (voteId) => state.allocation.leaseVotes[voteId],
  );
  const witnesses = new Set(
    votes.map((vote) => vote?.witnessPeerId).filter(Boolean),
  );
  if (
    policy === undefined ||
    fence === undefined ||
    fence.phase !== "expired" ||
    fence.assignmentEpoch + 1 !== proposalPayload.proposedAssignmentEpoch ||
    payload.objectiveId !== proposalPayload.objectiveId ||
    envelope.sender.peerId !== payload.certificateAssemblerPeerId ||
    acceptedAt < proposal.acceptedAt ||
    (direction === "local" &&
      envelope.causationId !==
        recoveryEnvelopeForPeer(proposal, payload.certificateAssemblerPeerId)
          .messageId) ||
    !isRecoveryParticipant(
      payload.certificateAssemblerPeerId,
      proposalPayload,
      policy.recoveryWitnessPeerIds,
    ) ||
    !isRecoveryParticipant(
      recipientPeerId,
      proposalPayload,
      policy.recoveryWitnessPeerIds,
      true,
    ) ||
    votes.some(
      (vote) =>
        vote === undefined ||
        vote.takeoverProposalId !== payload.takeoverProposalId ||
        vote.acceptedAt > acceptedAt ||
        !policy.recoveryWitnessPeerIds.includes(vote.witnessPeerId),
    ) ||
    witnesses.size !== votes.length
  )
    return reject(state, "recovery_authority_stale");
  if (votes.length < policy.recoveryWitnessThreshold)
    return reject(state, "recovery_quorum_insufficient");
  if (
    Object.keys(state.allocation.recoveryCertificates).length >=
    state.allocation.limits.maximumRecoveryCertificates
  )
    return reject(state, "recovery_capacity_exceeded");
  const projection: MeshRecoveryCertificateProjection = Object.freeze({
    certificateId: payload.certificateId,
    takeoverProposalId: payload.takeoverProposalId,
    direction,
    acceptedAt,
    validityVerifiedAt: verifiedAt,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...supportedCriticalExtensions,
          ]),
        }),
    envelope,
    ...(recipientEnvelopes === undefined ? {} : { recipientEnvelopes }),
  });
  const nextFence: MeshAssignmentFenceHeadProjection = Object.freeze({
    ...fence,
    assignmentEpoch: proposalPayload.proposedAssignmentEpoch,
    assignmentAuthorityId: payload.certificateId,
    fencingToken: payload.certificateId,
    assigneePeerId: proposalPayload.proposedAssigneePeerId,
    activeAwardId: undefined,
    recoveryCertificateId: payload.certificateId,
    phase: "recovering",
  });
  const workKey = JSON.stringify([
    proposalPayload.objectiveId,
    proposalPayload.workItemId,
  ]);
  const work = state.allocation.workAllocations[workKey];
  const allocation = {
    ...state.allocation,
    assignmentFenceHeads: createFrozenRecord([
      ...recordEntries(state.allocation.assignmentFenceHeads).filter(
        ([entryKey]) => entryKey !== key,
      ),
      [key, nextFence],
    ]),
    recoveryCertificates: createFrozenRecord([
      ...recordEntries(state.allocation.recoveryCertificates),
      [payload.certificateId, projection],
    ]),
    ...(work === undefined
      ? {}
      : {
          workAllocations: createFrozenRecord([
            ...recordEntries(state.allocation.workAllocations).filter(
              ([entryKey]) => entryKey !== workKey,
            ),
            [
              workKey,
              Object.freeze({
                ...work,
                phase: "recovering" as const,
                activeAwardId: undefined,
                activeAcceptanceId: undefined,
                updatedAt: acceptedAt,
              }),
            ],
          ]),
        }),
  };
  return commitRecord(
    state,
    allocation,
    envelope,
    payload.type,
    payload.certificateId,
    acceptedAt,
    direction,
    recoveryEffects(
      envelope,
      payload.certificateId,
      direction,
      recipientEnvelopes,
    ),
  );
}

function acceptWitnessAward(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
  witnesses: readonly string[],
  prior: MeshWitnessAssignmentProjection | undefined,
): MeshAllocationDecision {
  const envelope = request.envelope as SignedMeshEnvelope<WorkAwardPayload>;
  const payload = envelope.payload;
  if (
    !witnesses.includes(state.allocation.identity.peerId) ||
    envelope.sender.peerId !== payload.ownerPeerId
  )
    return reject(state, "witness_assignment_invalid");
  if (prior !== undefined && sameData(prior.awardEnvelope, envelope))
    return acceptedDuplicate(state);
  const recoveryAward = payload.authorityKind === "recovery_certificate";
  const certificate = recoveryAward
    ? state.allocation.recoveryCertificates[payload.recoveryCertificateId]
    : undefined;
  const fence =
    state.allocation.assignmentFenceHeads[meshAssignmentFenceKey(payload)];
  if (
    prior !== undefined &&
    (!recoveryAward ||
      certificate === undefined ||
      prior.leaseHead?.status !== "expired" ||
      payload.assignmentEpoch !== prior.leaseHead.assignmentEpoch + 1 ||
      payload.resumeCheckpointId !== prior.latestCheckpoint?.recordId ||
      fence === undefined ||
      !["recovering", "award_pending"].includes(fence.phase) ||
      fence.recoveryCertificateId !== certificate.certificateId ||
      fence.assignmentEpoch !== payload.assignmentEpoch ||
      fence.assignmentAuthorityId !== payload.assignmentAuthorityId ||
      fence.fencingToken !== payload.fencingToken ||
      fence.assigneePeerId !== payload.assigneePeerId)
  )
    return reject(state, "witness_assignment_duplicate_conflict");
  if (
    prior === undefined &&
    Object.keys(state.allocation.witnessAssignments).length >=
      state.allocation.limits.maximumWitnessAssignments
  )
    return reject(state, "witness_assignment_capacity_exceeded");
  const key = meshAssignmentFenceKey(payload);
  const projection: MeshWitnessAssignmentProjection = Object.freeze({
    assignmentFenceKey: key,
    observedAt: request.receivedAt,
    awardValidityVerifiedAt: request.verifiedAt,
    ...(request.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...request.supportedCriticalExtensions,
          ]),
        }),
    awardEnvelope: envelope,
    leaseRenewals: Object.freeze([]),
  });
  const nextFence =
    !recoveryAward || fence === undefined
      ? undefined
      : Object.freeze({
          ...fence,
          activeAwardId: payload.awardId,
          phase: "award_pending" as const,
        });
  return commitRecord(
    state,
    {
      ...state.allocation,
      witnessAssignments: createFrozenRecord([
        ...recordEntries(state.allocation.witnessAssignments).filter(
          ([entryKey]) => entryKey !== key,
        ),
        [key, projection],
      ]),
      ...(nextFence === undefined
        ? {}
        : {
            assignmentFenceHeads: replaceRecord(
              state.allocation.assignmentFenceHeads,
              key,
              nextFence,
            ),
          }),
    },
    envelope,
    payload.type,
    payload.awardId,
    request.receivedAt,
    "received",
  );
}

function acceptWitnessAcceptance(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
  prior: MeshWitnessAssignmentProjection,
): MeshAllocationDecision {
  const envelope = request.envelope as SignedMeshEnvelope<WorkAcceptPayload>;
  const payload = envelope.payload;
  const award = prior.awardEnvelope.payload;
  if (
    prior.acceptanceEnvelope !== undefined ||
    envelope.sender.peerId !== award.assigneePeerId ||
    envelope.causationId !== prior.awardEnvelope.messageId ||
    !responseMatchesAward(payload, award)
  )
    return reject(state, "witness_assignment_invalid");
  const leaseLogical = logicalDeadline(
    award.leaseExpiresAt,
    request.verifiedAt,
    request.receivedAt,
  );
  const workLogical = logicalDeadline(
    award.workDeadline,
    request.verifiedAt,
    request.receivedAt,
  );
  if (
    leaseLogical === undefined ||
    workLogical === undefined ||
    leaseLogical <= request.receivedAt ||
    leaseLogical > workLogical
  )
    return reject(state, "witness_assignment_invalid");
  const scope = executionScopeKey(award);
  const timerId = witnessLeaseTimerId(prior.assignmentFenceKey);
  if (
    state.coordination.timers[timerId] !== undefined ||
    Object.keys(state.coordination.timers).length >=
      state.coordination.limits.maximumTimers
  )
    return reject(state, "timer_capacity_exceeded");
  const leaseHead: MeshLeaseHeadProjection = Object.freeze({
    executionScopeKey: scope,
    objectiveId: award.objectiveId,
    objectiveDocumentId: award.objectiveDocumentId,
    objectiveRevision: award.objectiveRevision,
    workItemId: award.workItemId,
    workItemRevision: award.workItemRevision,
    ownerPeerId: award.ownerPeerId,
    ownerEpoch: award.ownerEpoch,
    assigneePeerId: award.assigneePeerId,
    awardId: award.awardId,
    assignmentEpoch: award.assignmentEpoch,
    assignmentAuthorityId: award.assignmentAuthorityId,
    fencingToken: award.fencingToken,
    acceptanceId: payload.acceptanceId,
    acceptanceMessageId: envelope.messageId,
    originalLeaseExpiresAt: award.leaseExpiresAt,
    originalLeaseExpiresAtLogical: leaseLogical,
    workDeadline: award.workDeadline,
    workDeadlineAt: workLogical,
    leaseRenewalSequence: 0,
    currentLeaseExpiresAt: award.leaseExpiresAt,
    currentLeaseExpiresAtLogical: leaseLogical,
    status: "active",
    expiryTimerId: timerId,
    expiryTimerGeneration: 1,
  });
  const projection: MeshWitnessAssignmentProjection = Object.freeze({
    ...prior,
    observedAt: request.receivedAt,
    acceptanceValidityVerifiedAt: request.verifiedAt,
    acceptanceEnvelope: envelope,
    leaseHead,
  });
  const fence = state.allocation.assignmentFenceHeads[prior.assignmentFenceKey];
  if (
    fence !== undefined &&
    (fence.phase !== "award_pending" ||
      fence.assignmentEpoch !== award.assignmentEpoch ||
      fence.assignmentAuthorityId !== award.assignmentAuthorityId ||
      fence.assigneePeerId !== award.assigneePeerId)
  )
    return reject(state, "recovery_authority_stale");
  const nextFence: MeshAssignmentFenceHeadProjection = Object.freeze({
    assignmentFenceKey: prior.assignmentFenceKey,
    objectiveId: award.objectiveId,
    objectiveRevision: award.objectiveRevision,
    workItemId: award.workItemId,
    workItemRevision: award.workItemRevision,
    ownerPeerId: award.ownerPeerId,
    ownerEpoch: award.ownerEpoch,
    assignmentEpoch: award.assignmentEpoch,
    assignmentAuthorityId: award.assignmentAuthorityId,
    fencingToken: award.fencingToken,
    assigneePeerId: award.assigneePeerId,
    activeAwardId: award.awardId,
    ...(award.authorityKind === "recovery_certificate"
      ? { recoveryCertificateId: award.recoveryCertificateId }
      : {}),
    phase: "active",
  });
  return commitRecord(
    state,
    {
      ...state.allocation,
      witnessAssignments: replaceRecord(
        state.allocation.witnessAssignments,
        prior.assignmentFenceKey,
        projection,
      ),
      assignmentFenceHeads: replaceRecord(
        state.allocation.assignmentFenceHeads,
        prior.assignmentFenceKey,
        nextFence,
      ),
    },
    envelope,
    payload.type,
    payload.acceptanceId,
    request.receivedAt,
    "received",
    undefined,
    Object.freeze({
      timerId,
      kind: "lease.expiry" as const,
      dueAt: leaseLogical,
      generation: 1,
      domainRecordKey: domainKey(payload.type, payload.acceptanceId),
    }),
  );
}

function acceptWitnessRenewal(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
  prior: MeshWitnessAssignmentProjection,
  maximumLeaseDurationMs: number,
  maximumLeaseRenewals: number,
): MeshAllocationDecision {
  const envelope = request.envelope as SignedMeshEnvelope<LeaseRenewPayload>;
  const payload = envelope.payload;
  const head = prior.leaseHead;
  if (
    prior.acceptanceEnvelope === undefined ||
    head === undefined ||
    head.status !== "active" ||
    envelope.sender.peerId !== head.assigneePeerId ||
    !authorityMatchesLease(payload, head) ||
    payload.leaseExpiresAt !== head.currentLeaseExpiresAt ||
    payload.leaseRenewalSequence !== head.leaseRenewalSequence + 1 ||
    payload.previousLeaseRenewalId !== head.latestLeaseRenewalId ||
    envelope.causationId !== currentLeaseCausationMessageId(prior, head) ||
    request.receivedAt >= head.currentLeaseExpiresAtLogical ||
    compare(request.verifiedAt, head.currentLeaseExpiresAt) >= 0 ||
    payload.leaseRenewalSequence > maximumLeaseRenewals
  )
    return reject(state, "witness_assignment_invalid");
  const renewedLogical = logicalDeadline(
    payload.renewedLeaseExpiresAt,
    head.currentLeaseExpiresAt,
    head.currentLeaseExpiresAtLogical,
  );
  if (
    renewedLogical === undefined ||
    renewedLogical <= head.currentLeaseExpiresAtLogical ||
    renewedLogical - head.currentLeaseExpiresAtLogical >
      maximumLeaseDurationMs ||
    renewedLogical > head.workDeadlineAt
  )
    return reject(state, "witness_assignment_invalid");
  const evidence: MeshLeaseRenewalEvidence = Object.freeze({
    leaseRenewalId: payload.leaseRenewalId,
    executionScopeKey: head.executionScopeKey,
    leaseRenewalSequence: payload.leaseRenewalSequence,
    ...(payload.previousLeaseRenewalId === undefined
      ? {}
      : { previousLeaseRenewalId: payload.previousLeaseRenewalId }),
    acceptedAt: request.receivedAt,
    validityVerifiedAt: request.verifiedAt,
    direction: "received",
    ...(request.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...request.supportedCriticalExtensions,
          ]),
        }),
    renewedLeaseExpiresAtLogical: renewedLogical,
    envelope,
  });
  const generation = (head.expiryTimerGeneration ?? 0) + 1;
  if (generation > Number.MAX_SAFE_INTEGER)
    return reject(state, "timer_generation_exhausted");
  const timerId = witnessLeaseTimerId(prior.assignmentFenceKey);
  const nextHead: MeshLeaseHeadProjection = Object.freeze({
    ...head,
    leaseRenewalSequence: payload.leaseRenewalSequence,
    latestLeaseRenewalId: payload.leaseRenewalId,
    currentLeaseExpiresAt: payload.renewedLeaseExpiresAt,
    currentLeaseExpiresAtLogical: renewedLogical,
    expiryTimerId: timerId,
    expiryTimerGeneration: generation,
  });
  const projection: MeshWitnessAssignmentProjection = Object.freeze({
    ...prior,
    observedAt: request.receivedAt,
    leaseHead: nextHead,
    leaseRenewals: Object.freeze([...prior.leaseRenewals, evidence]),
  });
  return commitRecord(
    state,
    {
      ...state.allocation,
      witnessAssignments: replaceRecord(
        state.allocation.witnessAssignments,
        prior.assignmentFenceKey,
        projection,
      ),
    },
    envelope,
    payload.type,
    payload.leaseRenewalId,
    request.receivedAt,
    "received",
    undefined,
    Object.freeze({
      timerId,
      kind: "lease.expiry" as const,
      dueAt: renewedLogical,
      generation,
      domainRecordKey: domainKey(payload.type, payload.leaseRenewalId),
    }),
    timerId,
  );
}

function acceptWitnessCheckpoint(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
  prior: MeshWitnessAssignmentProjection,
): MeshAllocationDecision {
  const envelope =
    request.envelope as SignedMeshEnvelope<WorkCheckpointPayload>;
  const payload = envelope.payload;
  const head = prior.leaseHead;
  const latest = prior.latestCheckpoint;
  if (
    prior.acceptanceEnvelope === undefined ||
    head === undefined ||
    head.status !== "active" ||
    envelope.sender.peerId !== head.assigneePeerId ||
    !authorityMatchesLease(payload, head) ||
    payload.leaseExpiresAt !== head.currentLeaseExpiresAt ||
    request.receivedAt >= head.currentLeaseExpiresAtLogical ||
    compare(request.verifiedAt, head.currentLeaseExpiresAt) >= 0 ||
    (latest === undefined
      ? payload.checkpointSequence !== 1 ||
        payload.previousCheckpointId !== undefined ||
        envelope.causationId !== head.acceptanceMessageId
      : payload.checkpointSequence !==
          (latest.envelope.payload as WorkCheckpointPayload)
            .checkpointSequence +
            1 ||
        payload.previousCheckpointId !== latest.recordId ||
        envelope.causationId !== latest.envelope.messageId)
  )
    return reject(state, "witness_assignment_invalid");
  const record: MeshExecutionRecordProjection = Object.freeze({
    recordType: "checkpoint",
    recordId: payload.checkpointId,
    direction: "received",
    recordedAt: request.receivedAt,
    validityVerifiedAt: request.verifiedAt,
    ...(request.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...request.supportedCriticalExtensions,
          ]),
        }),
    envelope,
  });
  const projection: MeshWitnessAssignmentProjection = Object.freeze({
    ...prior,
    observedAt: request.receivedAt,
    latestCheckpoint: record,
  });
  return commitRecord(
    state,
    {
      ...state.allocation,
      witnessAssignments: replaceRecord(
        state.allocation.witnessAssignments,
        prior.assignmentFenceKey,
        projection,
      ),
    },
    envelope,
    payload.type,
    payload.checkpointId,
    request.receivedAt,
    "received",
  );
}

function commitRecord(
  state: MeshAllocationRuntimeState,
  allocationCandidate: Omit<
    MeshAllocationRuntimeState["allocation"],
    "lastLogicalTime"
  > & { readonly lastLogicalTime?: number },
  envelope: SignedMeshEnvelope<RecoveryPayload | WitnessPayload>,
  recordType: RecoveryPayload["type"] | WitnessPayload["type"],
  recordId: string,
  acceptedAt: number,
  direction: Direction,
  effect?: MeshAllocationEffect | readonly MeshAllocationEffect[],
  timer?: MeshAllocationRuntimeState["coordination"]["timers"][string],
  removeTimerId?: string,
): MeshAllocationDecision {
  if (
    Object.keys(state.coordination.domainRecords).length >=
    state.coordination.limits.maximumDomainRecords
  )
    return reject(state, "domain_capacity_exceeded");
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  )
    return reject(state, "journal_capacity_exceeded");
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");
  const recordKey = domainKey(recordType, recordId);
  if (state.coordination.domainRecords[recordKey] !== undefined)
    return reject(state, "domain_record_conflict");
  const allocation = restoreMeshAllocationState({
    ...allocationCandidate,
    lastLogicalTime: acceptedAt,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...state.coordination,
    ...(timer === undefined && removeTimerId === undefined
      ? {}
      : {
          timers: createFrozenRecord([
            ...recordEntries(state.coordination.timers).filter(
              ([timerId]) => timerId !== removeTimerId,
            ),
            ...(timer === undefined ? [] : [[timer.timerId, timer] as const]),
          ]),
        }),
    domainRecords: createFrozenRecord([
      ...recordEntries(state.coordination.domainRecords),
      [
        recordKey,
        Object.freeze({
          recordKey,
          recordType,
          recordId,
          contentDigest: envelope.payloadHash.slice("sha256:".length),
          messageId: envelope.messageId,
          acceptedAt,
          objectiveId: envelope.payload.objectiveId,
        }),
      ],
    ]),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: acceptedAt,
        kind:
          direction === "local"
            ? ("command.accepted" as const)
            : ("domain.accepted" as const),
        domainRecordKey: recordKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: acceptedAt,
  });
  const next = createMeshAllocationRuntimeState(
    coordination,
    Object.freeze({ ...state.discovery, lastLogicalTime: acceptedAt }),
    Object.freeze({ ...state.objectives, lastLogicalTime: acceptedAt }),
    allocation,
  );
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: next,
    effects: Object.freeze(
      effect === undefined
        ? []
        : Array.isArray(effect)
          ? [...effect]
          : [effect],
    ),
  });
}

function recoveryEffects<TPayload extends RecoveryPayload>(
  envelope: SignedMeshEnvelope<TPayload>,
  recordId: string,
  direction: Direction,
  recipientEnvelopes?: Readonly<Record<string, SignedMeshEnvelope<TPayload>>>,
): readonly MeshAllocationEffect[] | undefined {
  if (direction !== "local" || recipientEnvelopes === undefined)
    return undefined;
  return Object.freeze(
    recordEntries(recipientEnvelopes).map(
      ([recipientPeerId, recipientEnvelope]) =>
        Object.freeze({
          kind: "allocation.recovery.dispatch" as const,
          recordId,
          recordType: recipientEnvelope.payload.type,
          recipientPeerId,
          messageId: recipientEnvelope.messageId,
          envelope: recipientEnvelope,
        }),
    ),
  );
}

function replaceRecord<T>(
  record: Readonly<Record<string, T>>,
  key: string,
  value: T,
): Readonly<Record<string, T>> {
  return createFrozenRecord([
    ...recordEntries(record).filter(([entryKey]) => entryKey !== key),
    [key, value],
  ]);
}

function historicalPolicy(
  state: MeshAllocationRuntimeState,
  objectiveId: string,
  objectiveRevision: number,
) {
  return state.objectives.objectivePolicies[
    JSON.stringify([objectiveId, objectiveRevision])
  ];
}

function expectedRecoveryRecipients(
  state: MeshAllocationRuntimeState,
  payload: RecoveryPayload,
): readonly string[] | undefined {
  const proposal =
    payload.type === "lease.takeover_proposal"
      ? payload
      : state.allocation.takeoverProposals[payload.takeoverProposalId]?.envelope
          .payload;
  if (proposal === undefined) return undefined;
  const policy = historicalPolicy(
    state,
    proposal.objectiveId,
    proposal.objectiveRevision,
  );
  if (policy === undefined) return undefined;
  const recipients = [
    proposal.ownerPeerId,
    proposal.proposedAssigneePeerId,
    ...policy.recoveryWitnessPeerIds,
    // The former assignee receives the takeover proposal so it can observe
    // fencing, but it is not authorized to receive a vote or certificate.
    ...(payload.type === "lease.takeover_proposal"
      ? [proposal.assigneePeerId]
      : []),
  ];
  return Object.freeze(
    [...new Set(recipients)]
      .filter((peerId) => peerId !== state.allocation.identity.peerId)
      .sort(compareText),
  );
}

function recoveryEnvelopeForPeer<TPayload extends RecoveryPayload>(
  projection: Readonly<{
    envelope: SignedMeshEnvelope<TPayload>;
    recipientEnvelopes?: Readonly<Record<string, SignedMeshEnvelope<TPayload>>>;
  }>,
  peerId: string,
): SignedMeshEnvelope<TPayload> {
  return projection.recipientEnvelopes?.[peerId] ?? projection.envelope;
}

function currentLeaseForFence(
  state: MeshAllocationRuntimeState,
  fence: MeshAssignmentFenceHeadProjection | undefined,
  witness: MeshWitnessAssignmentProjection | undefined,
): MeshLeaseHeadProjection | undefined {
  if (fence === undefined) return undefined;
  return (
    Object.values(state.allocation.leaseHeads).find(
      (head) =>
        meshAssignmentFenceKey(head) === fence.assignmentFenceKey &&
        head.assignmentEpoch === fence.assignmentEpoch,
    ) ?? witness?.leaseHead
  );
}

function currentLeaseCausationMessageId(
  witness: MeshWitnessAssignmentProjection | undefined,
  lease: MeshLeaseHeadProjection,
): string | undefined {
  if (lease.latestLeaseRenewalId === undefined)
    return lease.acceptanceMessageId;
  return witness?.leaseRenewals.find(
    (renewal) => renewal.leaseRenewalId === lease.latestLeaseRenewalId,
  )?.envelope.messageId;
}

function proposalMatchesLease(
  payload: LeaseTakeoverProposalPayload,
  lease: MeshLeaseHeadProjection,
): boolean {
  return (
    authorityMatchesLease(payload, lease) &&
    payload.leaseExpiresAt === lease.currentLeaseExpiresAt &&
    payload.leaseRenewalSequence === lease.leaseRenewalSequence &&
    payload.latestLeaseRenewalId === lease.latestLeaseRenewalId
  );
}

function authorityMatchesLease(
  payload:
    LeaseTakeoverProposalPayload | LeaseRenewPayload | WorkCheckpointPayload,
  lease: MeshLeaseHeadProjection,
): boolean {
  return (
    payload.objectiveId === lease.objectiveId &&
    payload.objectiveDocumentId === lease.objectiveDocumentId &&
    payload.objectiveRevision === lease.objectiveRevision &&
    payload.workItemId === lease.workItemId &&
    payload.workItemRevision === lease.workItemRevision &&
    payload.ownerPeerId === lease.ownerPeerId &&
    payload.ownerEpoch === lease.ownerEpoch &&
    payload.assigneePeerId === lease.assigneePeerId &&
    payload.awardId === lease.awardId &&
    payload.acceptanceId === lease.acceptanceId &&
    payload.assignmentEpoch === lease.assignmentEpoch &&
    payload.assignmentAuthorityId === lease.assignmentAuthorityId &&
    payload.fencingToken === lease.fencingToken
  );
}

function responseMatchesAward(
  response: WorkAcceptPayload,
  award: WorkAwardPayload,
): boolean {
  return (
    response.awardId === award.awardId &&
    response.objectiveId === award.objectiveId &&
    response.objectiveDocumentId === award.objectiveDocumentId &&
    response.objectiveRevision === award.objectiveRevision &&
    response.workItemId === award.workItemId &&
    response.workItemRevision === award.workItemRevision &&
    response.ownerPeerId === award.ownerPeerId &&
    response.ownerEpoch === award.ownerEpoch &&
    response.assigneePeerId === award.assigneePeerId &&
    response.assignmentEpoch === award.assignmentEpoch &&
    response.assignmentAuthorityId === award.assignmentAuthorityId &&
    response.fencingToken === award.fencingToken &&
    response.acceptanceDeadline === award.acceptanceDeadline
  );
}

function isRecoveryParticipant(
  peerId: string,
  proposal: LeaseTakeoverProposalPayload,
  witnesses: readonly string[],
  includeOldAssignee = false,
): boolean {
  return (
    peerId === proposal.ownerPeerId ||
    peerId === proposal.proposedAssigneePeerId ||
    witnesses.includes(peerId) ||
    (includeOldAssignee && peerId === proposal.assigneePeerId)
  );
}

function isAdmittedPeer(
  state: MeshAllocationRuntimeState,
  peerId: string,
  verifiedAt: string,
): boolean {
  if (peerId === state.allocation.identity.peerId) return true;
  const admission = state.discovery.admittedPeers[peerId];
  return (
    admission !== undefined && compare(verifiedAt, admission.validUntil) < 0
  );
}

function executionScopeKey(
  authority: Pick<
    WorkAwardPayload,
    | "objectiveId"
    | "objectiveRevision"
    | "workItemId"
    | "workItemRevision"
    | "ownerPeerId"
    | "ownerEpoch"
    | "awardId"
    | "assignmentEpoch"
  >,
): string {
  return JSON.stringify([
    authority.objectiveId,
    authority.objectiveRevision,
    authority.workItemId,
    authority.workItemRevision,
    authority.ownerPeerId,
    authority.ownerEpoch,
    authority.awardId,
    authority.assignmentEpoch,
  ]);
}

function witnessLeaseTimerId(fenceKey: string): string {
  return `witness.lease.expiry:${sha256Base64Url(
    utf8Encoder.encode(fenceKey),
  )}`;
}

function recoveryProjection(
  state: MeshAllocationRuntimeState,
  payload: RecoveryPayload,
):
  | MeshTakeoverProposalProjection
  | MeshLeaseVoteProjection
  | MeshRecoveryCertificateProjection
  | undefined {
  if (payload.type === "lease.takeover_proposal")
    return state.allocation.takeoverProposals[payload.takeoverProposalId];
  if (payload.type === "lease.vote")
    return state.allocation.leaseVotes[payload.leaseVoteId];
  return state.allocation.recoveryCertificates[payload.certificateId];
}

function recoveryRecordId(payload: RecoveryPayload): string {
  if (payload.type === "lease.takeover_proposal")
    return payload.takeoverProposalId;
  if (payload.type === "lease.vote") return payload.leaseVoteId;
  return payload.certificateId;
}

function isRecoveryPayload(payload: unknown): payload is RecoveryPayload {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    ["lease.takeover_proposal", "lease.vote", "lease.certificate"].includes(
      (payload as { type?: unknown }).type as string,
    ),
  );
}

function isWitnessPayload(payload: unknown): payload is WitnessPayload {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    ["work.award", "work.accept", "lease.renew", "work.checkpoint"].includes(
      (payload as { type?: unknown }).type as string,
    ),
  );
}

function retainedWitnessEnvelopeByMessageId(
  state: MeshAllocationRuntimeState,
  messageId: string,
): SignedMeshEnvelope<WitnessPayload> | undefined {
  for (const witness of Object.values(state.allocation.witnessAssignments)) {
    const envelopes: SignedMeshEnvelope<WitnessPayload>[] = [
      witness.awardEnvelope,
      ...(witness.acceptanceEnvelope === undefined
        ? []
        : [witness.acceptanceEnvelope]),
      ...witness.leaseRenewals.map((renewal) => renewal.envelope),
      ...(witness.latestCheckpoint === undefined
        ? []
        : [
            witness.latestCheckpoint
              .envelope as SignedMeshEnvelope<WorkCheckpointPayload>,
          ]),
    ];
    const retained = envelopes.find(
      (envelope) => envelope.messageId === messageId,
    );
    if (retained !== undefined) return retained;
  }
  return undefined;
}

function canonicalDigest(
  envelope: SignedMeshEnvelope<RecoveryPayload | WitnessPayload>,
): boolean {
  const canonical = canonicalizeMeshPayload(envelope.payload);
  return (
    canonical.ok &&
    envelope.payloadHash === `sha256:${sha256Base64Url(canonical.value)}`
  );
}

function domainKey(type: string, id: string): string {
  return JSON.stringify([type, id]);
}

function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError("Invalid recovery timestamp");
  return result.value;
}

function sameData(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function acceptedDuplicate(
  state: MeshAllocationRuntimeState,
): MeshAllocationDecision {
  return Object.freeze({
    accepted: true,
    duplicate: true,
    state,
    effects: Object.freeze([]),
  });
}

function reject(
  state: MeshAllocationRuntimeState,
  code: MeshAllocationRejectionCode,
): MeshAllocationDecision {
  return Object.freeze({ accepted: false, code, state });
}
