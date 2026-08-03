import type {
  DelegationMandateV1,
  WorkContractV1,
} from "@agentplat/collective-control";
import { createWorkContractFromMeshV1 } from "@agentplat/collective-control/mesh";
import type { MissionIntentV1 } from "@agentplat/collective-planning";
import {
  validateCollectiveProtectedEffectAttemptV1,
  validateCollectiveProtectedEffectReceiptV1,
  type CollectiveProtectedEffectAttemptV1,
  type CollectiveProtectedEffectReceiptV1,
} from "@agentplat/collective-planning/evaluation";
import {
  createMeshAllocationInboundProcessor,
  createMeshAllocationInboundRuntimeState,
  createMeshAllocationRuntimeState,
  evaluateMeshAllocationCommand,
  evaluateMeshAllocationTimer,
  evaluateVerifiedMeshAllocationEnvelope,
  restoreMeshAllocationState,
  restoreMeshDiscoveryState,
  restoreMeshObjectiveWorkState,
  type MeshAllocationInboundRuntimeState,
  type MeshAllocationPayload,
  type MeshAssignmentFenceHeadProjection,
  type MeshExecutionHeadProjection,
  type MeshExecutionRecordProjection,
  type MeshLocalRecoveryPreparedRecipient,
  type MeshObjectiveProjection,
  type MeshWorkItemProjection,
} from "@agentplat/mesh/coordination";
import { verifyMeshEnvelope } from "@agentplat/mesh-crypto";
import {
  canonicalizeMeshPayload,
  validateSignedMeshEnvelope,
  type MeshMessagePayload,
  type SignedMeshEnvelope,
  type UnsignedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import type { CollectiveClosedLoopPreEffectHandleV1 } from "./collective-closed-loop-runtime.js";
import type {
  CollectiveClosedLoopFinalizationInputV1,
  CollectiveClosedLoopRuntimePeerV1,
  CollectiveClosedLoopRuntimeRunnerV1,
} from "./collective-closed-loop-runtime.js";
import { assertCollectiveEffectReceiptProvenanceV1 } from "./collective-effect-provenance.js";

/**
 * Internal Increment 6 recovery seam. It is deliberately not exported from
 * the package root until the resilient-runner contract is public.
 *
 * Recovery requires the original mandate because a replacement receives a new
 * Work Contract; the old contract cannot be widened or rewritten in place.
 */
export interface CollectiveClosedLoopCertifiedRecoveryInputV1 {
  readonly schemaVersion: 1;
  readonly preEffect: CollectiveClosedLoopPreEffectHandleV1;
  readonly peers: readonly CollectiveClosedLoopRuntimePeerV1[];
  readonly runner: CollectiveClosedLoopRuntimeRunnerV1;
  readonly missionIntent: MissionIntentV1;
  readonly mandate: DelegationMandateV1;
  readonly failedWinnerPeerId: string;
  readonly replacementPeerId: string;
  /** Receiver-controlled logical time at which recovery is requested. */
  readonly faultLogicalTimeMs: number;
}

export interface CollectiveClosedLoopCertifiedRecoveryResultV1 {
  readonly schemaVersion: 1;
  readonly failedWinnerPeerId: string;
  readonly replacementPeerId: string;
  readonly recoveryLogicalTimeMs: number;
  readonly leaseStartsAt: string;
  readonly takeoverProposalId: string;
  readonly leaseVoteIds: readonly string[];
  readonly certificateId: string;
  readonly recoveryAwardId: string;
  readonly recoveryAcceptanceId: string;
  readonly resumedCheckpointId: string;
  readonly workContract: WorkContractV1;
  readonly execution: MeshExecutionHeadProjection;
  readonly fenceHead: MeshAssignmentFenceHeadProjection;
  readonly checkpoint: MeshExecutionRecordProjection;
  readonly staleRejectionCodes: readonly string[];
  readonly staleRejections: readonly CollectiveClosedLoopStaleRejectionV1[];
  readonly meshStates: Readonly<
    Record<string, MeshAllocationInboundRuntimeState>
  >;
  finalizeAfterCommittedEffect(
    input: CollectiveClosedLoopFinalizationInputV1,
  ): Promise<CollectiveClosedLoopRecoveredFinalizedResultV1>;
}

export interface CollectiveClosedLoopStaleRejectionV1 {
  readonly recordType: "work.progress" | "work.result";
  readonly recordId: string;
  readonly envelope: SignedMeshEnvelope<MeshAllocationPayload>;
  readonly rejectionCode: string;
  readonly logicalTimeMs: number;
  readonly stateUnchanged: true;
}

export interface CollectiveClosedLoopRecoveredFinalizedResultV1 {
  readonly schemaVersion: 1;
  readonly winnerPeerId: string;
  readonly workContract: WorkContractV1;
  readonly result: MeshExecutionRecordProjection;
  readonly meshStates: Readonly<
    Record<string, MeshAllocationInboundRuntimeState>
  >;
  readonly logicalTimeMs: number;
  readonly interactionCount: number;
}

interface RecoveryContext {
  readonly input: CollectiveClosedLoopCertifiedRecoveryInputV1;
  readonly peersById: ReadonlyMap<string, CollectiveClosedLoopRuntimePeerV1>;
  readonly sequences: Map<string, number>;
  nextMessage: number;
  interactionCount: number;
}

const WIRE_VERSION = 0 as const;
const RECOVERY_LEASE_MS = 120_000;
const RECOVERY_ENVELOPE_TTL_MS = 59_000;

/**
 * Applies a real, certificate-backed reassignment to an Increment 5
 * pre-effect checkpoint. Every state change below passes through the public
 * Mesh allocation reducers; this module only signs and routes the records.
 */
export async function recoverCollectiveClosedLoopAssignmentV1(
  rawInput: CollectiveClosedLoopCertifiedRecoveryInputV1,
): Promise<CollectiveClosedLoopCertifiedRecoveryResultV1> {
  const input = validateInput(rawInput);
  const context: RecoveryContext = {
    input,
    peersById: new Map(input.peers.map((peer) => [peer.peerId, peer])),
    sequences: new Map(),
    nextMessage: 1,
    interactionCount: input.preEffect.interactionCount,
  };
  let states: Record<string, MeshAllocationInboundRuntimeState> = {
    ...input.preEffect.meshStates,
  };
  // Admission is local transport configuration, not assignment authority. The
  // nominal star topology only admits owner<->peer traffic, while certificate
  // witnesses must receive signed copies from the original assignee. Expand
  // the already configured in-memory admission set to the closed peer roster;
  // every subsequent authority transition still goes through Mesh reducers.
  states = extendRecoveryAdmission(context, states);
  const ownerPeerId = input.preEffect.workContract.assignment.ownerPeerId;
  const failed = input.preEffect.workContract.assignment.assignedPeerId;
  if (failed !== input.failedWinnerPeerId)
    throw new TypeError("closed_loop_recovery_failed_winner_mismatch");
  const owner = peer(context, ownerPeerId);
  const replacement = peer(context, input.replacementPeerId);
  if (replacement.peerId === failed || replacement.peerId === owner.peerId)
    throw new TypeError("closed_loop_recovery_replacement_invalid");

  const oldAward =
    states[failed]?.allocation.receivedAwards[input.preEffect.execution.awardId]
      ?.envelope;
  const oldAcceptance =
    states[failed]?.allocation.localAssignmentResponses[
      input.preEffect.execution.awardId
    ]?.envelope;
  const oldCheckpoint = input.preEffect.checkpoint.envelope;
  if (!oldAward || !oldAcceptance || !oldCheckpoint)
    throw new Error("closed_loop_recovery_original_evidence_missing");

  const objective =
    states[owner.peerId]?.objectives.objectives[
      input.missionIntent.objective.objectiveId
    ];
  if (!objective) throw new Error("closed_loop_recovery_objective_missing");
  const witnesses = objective.recoveryWitnessPeerIds.filter((peerId) =>
    context.peersById.has(peerId),
  );
  if (witnesses.length < objective.recoveryWitnessThreshold)
    throw new Error("closed_loop_recovery_witness_quorum_unavailable");

  // A witness needs exact direct copies, not a reconstructed authority. The
  // source records remain signed by their original issuer and are routed again
  // to each configured in-mesh witness.
  for (const witnessPeerId of witnesses) {
    if (witnessPeerId === failed) continue;
    const awardCopy = await copyForWitness(context, oldAward, witnessPeerId);
    states = await deliver(
      context,
      states,
      witnessPeerId,
      awardCopy,
      input.preEffect.logicalTimeMs + 1,
      oldAward.sentAt,
    );
    const acceptanceCopy = await copyForWitness(
      context,
      oldAcceptance,
      witnessPeerId,
      awardCopy.messageId,
    );
    states = await deliver(
      context,
      states,
      witnessPeerId,
      acceptanceCopy,
      input.preEffect.logicalTimeMs + 1,
      oldAcceptance.sentAt,
    );
    const checkpointCopy = await copyForWitness(
      context,
      oldCheckpoint,
      witnessPeerId,
      acceptanceCopy.messageId,
    );
    states = await deliver(
      context,
      states,
      witnessPeerId,
      checkpointCopy,
      input.preEffect.logicalTimeMs + 1,
      oldCheckpoint.sentAt,
    );
  }

  const recoveryTime = expireLeases(
    states,
    [owner.peerId, failed, ...witnesses],
    input.faultLogicalTimeMs,
  );
  states = recoveryTime.states;
  let logicalTimeMs = recoveryTime.logicalTimeMs;
  const oldLease =
    states[failed]?.allocation.leaseHeads[
      input.preEffect.execution.executionScopeKey
    ];
  if (!oldLease || oldLease.status !== "expired")
    throw new Error("closed_loop_recovery_expiry_missing");
  const recoveryAt = Math.max(
    logicalTimeMs,
    oldLease.currentLeaseExpiresAtLogical + objective.recoveryGraceMs,
  );
  logicalTimeMs = recoveryAt;

  const proposalId = "recovery:takeover:1";
  const replacementWitness = Object.values(
    states[replacement.peerId]!.allocation.witnessAssignments,
  ).find((assignment) => assignment.leaseHead?.status === "expired");
  const proposalCausationId = replacementWitness?.acceptanceEnvelope?.messageId;
  if (!proposalCausationId)
    throw new Error("closed_loop_recovery_replacement_witness_missing");
  const proposalPayload = {
    type: "lease.takeover_proposal" as const,
    takeoverProposalId: proposalId,
    proposalAuthority: "candidate" as const,
    proposerPeerId: replacement.peerId,
    proposedAssigneePeerId: replacement.peerId,
    proposedAssignmentEpoch: input.preEffect.execution.assignmentEpoch + 1,
    objectiveId: input.preEffect.execution.objectiveId,
    objectiveDocumentId: input.preEffect.execution.objectiveDocumentId,
    objectiveRevision: input.preEffect.execution.objectiveRevision,
    workItemId: input.preEffect.execution.workItemId,
    workItemRevision: input.preEffect.execution.workItemRevision,
    ownerPeerId,
    ownerEpoch: input.preEffect.execution.ownerEpoch,
    assigneePeerId: failed,
    awardId: input.preEffect.execution.awardId,
    acceptanceId: input.preEffect.execution.acceptanceId,
    assignmentEpoch: input.preEffect.execution.assignmentEpoch,
    assignmentAuthorityId: input.preEffect.execution.assignmentAuthorityId,
    fencingToken: input.preEffect.execution.fencingToken,
    leaseExpiresAt: oldLease.currentLeaseExpiresAt,
    leaseRenewalSequence: oldLease.leaseRenewalSequence,
    ...(oldLease.latestLeaseRenewalId === undefined
      ? {}
      : { latestLeaseRenewalId: oldLease.latestLeaseRenewalId }),
  };
  const proposalRecipients = await recoveryRecipients(
    context,
    replacement.peerId,
    proposalPayload,
    proposalCausationId,
    logicalTimeMs,
  );
  states = applyLocalRecovery(
    context,
    states,
    replacement.peerId,
    proposalRecipients,
    logicalTimeMs,
  );
  states = await deliverRecoveryEffects(
    context,
    states,
    replacement.peerId,
    proposalRecipients,
    logicalTimeMs,
  );

  const voteIds: string[] = [];
  for (const witnessPeerId of witnesses.sort()) {
    const voteId = `recovery:vote:${voteIds.length + 1}`;
    voteIds.push(voteId);
    logicalTimeMs += 1;
    const proposalForWitness =
      states[witnessPeerId]?.allocation.takeoverProposals[proposalId]?.envelope;
    if (!proposalForWitness)
      throw new Error("closed_loop_recovery_witness_proposal_missing");
    const votePayload = {
      type: "lease.vote" as const,
      leaseVoteId: voteId,
      takeoverProposalId: proposalId,
      witnessPeerId,
      objectiveId: input.preEffect.execution.objectiveId,
    };
    const recipients = await recoveryRecipients(
      context,
      witnessPeerId,
      votePayload,
      proposalForWitness.messageId,
      logicalTimeMs,
    );
    states = applyLocalRecovery(
      context,
      states,
      witnessPeerId,
      recipients,
      logicalTimeMs,
    );
    states = await deliverRecoveryEffects(
      context,
      states,
      witnessPeerId,
      recipients,
      logicalTimeMs,
    );
  }

  logicalTimeMs += 1;
  const certificateId = "recovery:certificate:1";
  const ownerProposal =
    states[owner.peerId]?.allocation.takeoverProposals[proposalId]?.envelope;
  if (!ownerProposal)
    throw new Error("closed_loop_recovery_owner_proposal_missing");
  const certificatePayload = {
    type: "lease.certificate" as const,
    certificateId,
    certificateAssemblerPeerId: owner.peerId,
    takeoverProposalId: proposalId,
    leaseVoteIds: [...voteIds].sort(),
    objectiveId: input.preEffect.execution.objectiveId,
  };
  const certificateRecipients = await recoveryRecipients(
    context,
    owner.peerId,
    certificatePayload,
    ownerProposal.messageId,
    logicalTimeMs,
  );
  states = applyLocalRecovery(
    context,
    states,
    owner.peerId,
    certificateRecipients,
    logicalTimeMs,
  );
  states = await deliverRecoveryEffects(
    context,
    states,
    owner.peerId,
    certificateRecipients,
    logicalTimeMs,
  );

  logicalTimeMs += 1;
  const ownerState = states[owner.peerId];
  const replacementBid = Object.values(ownerState.allocation.bidHeads).find(
    (bid) => bid.bidderPeerId === replacement.peerId,
  );
  if (!replacementBid)
    throw new Error("closed_loop_recovery_replacement_bid_missing");
  const ownerOffer = ownerState.allocation.localOffers[replacementBid.offerId];
  if (!ownerOffer) throw new Error("closed_loop_recovery_offer_missing");
  const certificateForReplacement =
    ownerState.allocation.recoveryCertificates[certificateId]
      ?.recipientEnvelopes?.[replacement.peerId];
  if (!certificateForReplacement)
    throw new Error("closed_loop_recovery_certificate_delivery_missing");
  const recoveryAwardId = "recovery:award:1";
  const awardSentAt = wallTime(input.missionIntent, logicalTimeMs);
  const leaseExpiresAt = earlierTimestamp(
    input.preEffect.workContract.assignment.workDeadline,
    wallTime(input.missionIntent, logicalTimeMs + RECOVERY_LEASE_MS),
  );
  const acceptanceDeadline = wallTime(
    input.missionIntent,
    logicalTimeMs + 30_000,
  );
  const award = await signEnvelope(
    context,
    owner.peerId,
    "work.award",
    {
      type: "work.award" as const,
      awardId: recoveryAwardId,
      offerId: ownerOffer.offerId,
      bidId: replacementBid.bidId,
      bidRevision: replacementBid.bidRevision,
      objectiveId: input.preEffect.execution.objectiveId,
      objectiveDocumentId: input.preEffect.execution.objectiveDocumentId,
      objectiveRevision: input.preEffect.execution.objectiveRevision,
      workItemId: input.preEffect.execution.workItemId,
      workItemRevision: input.preEffect.execution.workItemRevision,
      ownerPeerId,
      ownerEpoch: input.preEffect.execution.ownerEpoch,
      offerAttempt: ownerOffer.offerAttempt,
      assigneePeerId: replacement.peerId,
      assignmentEpoch: input.preEffect.execution.assignmentEpoch + 1,
      authorityKind: "recovery_certificate" as const,
      recoveryCertificateId: certificateId,
      assignmentAuthorityId: certificateId,
      fencingToken: certificateId,
      budgetReservationUnits: ownerOffer.work.budgetReservationUnits,
      workDeadline: ownerOffer.work.workDeadline,
      resumeCheckpointId: input.preEffect.checkpoint.recordId,
      leaseStartsAt: awardSentAt,
      leaseExpiresAt,
      acceptanceDeadline,
    },
    replacement.peerId,
    certificateForReplacement.messageId,
    {
      sentAt: awardSentAt,
      expiresAt: acceptanceDeadline,
    },
  );
  const awarded = evaluateMeshAllocationCommand(
    allocationRuntime(ownerState),
    {
      kind: "allocation.recovery_award",
      certificateId,
      recipient: {
        recipientPeerId: replacement.peerId,
        preparedAt: logicalTimeMs,
        envelope: award,
      },
    },
    recoveryVerifiedAt(input.missionIntent, logicalTimeMs),
    logicalTimeMs,
  );
  states = acceptLocal(
    states,
    owner.peerId,
    awarded,
    "closed_loop_recovery_award_rejected",
  );
  states = await deliver(
    context,
    states,
    replacement.peerId,
    award,
    logicalTimeMs,
  );

  logicalTimeMs += 1;
  const recoveryAcceptanceId = "recovery:acceptance:1";
  const acceptanceSentAt = wallTime(input.missionIntent, logicalTimeMs);
  const acceptance = await signEnvelope(
    context,
    replacement.peerId,
    "work.accept",
    {
      type: "work.accept" as const,
      acceptanceId: recoveryAcceptanceId,
      awardId: recoveryAwardId,
      objectiveId: input.preEffect.execution.objectiveId,
      objectiveDocumentId: input.preEffect.execution.objectiveDocumentId,
      objectiveRevision: input.preEffect.execution.objectiveRevision,
      workItemId: input.preEffect.execution.workItemId,
      workItemRevision: input.preEffect.execution.workItemRevision,
      ownerPeerId,
      ownerEpoch: input.preEffect.execution.ownerEpoch,
      assigneePeerId: replacement.peerId,
      assignmentEpoch: input.preEffect.execution.assignmentEpoch + 1,
      assignmentAuthorityId: certificateId,
      fencingToken: certificateId,
      acceptanceDeadline: award.payload.acceptanceDeadline,
    },
    owner.peerId,
    award.messageId,
    {
      sentAt: acceptanceSentAt,
      expiresAt: acceptanceDeadline,
    },
  );
  const accepted = evaluateMeshAllocationCommand(
    allocationRuntime(states[replacement.peerId]),
    {
      kind: "allocation.assignment_response",
      awardId: recoveryAwardId,
      preparedAt: logicalTimeMs,
      envelope: acceptance,
    },
    recoveryVerifiedAt(input.missionIntent, logicalTimeMs),
    logicalTimeMs,
  );
  states = acceptLocal(
    states,
    replacement.peerId,
    accepted,
    "closed_loop_recovery_acceptance_rejected",
  );
  states = await deliver(
    context,
    states,
    owner.peerId,
    acceptance,
    logicalTimeMs,
  );

  logicalTimeMs += 1;
  const resumedCheckpointId = "recovery:checkpoint:2";
  const checkpointSentAt = wallTime(input.missionIntent, logicalTimeMs);
  const checkpoint = await signEnvelope(
    context,
    replacement.peerId,
    "work.checkpoint",
    {
      type: "work.checkpoint" as const,
      checkpointId: resumedCheckpointId,
      checkpointSequence: 2,
      previousCheckpointId: input.preEffect.checkpoint.recordId,
      objectiveId: input.preEffect.execution.objectiveId,
      objectiveDocumentId: input.preEffect.execution.objectiveDocumentId,
      objectiveRevision: input.preEffect.execution.objectiveRevision,
      workItemId: input.preEffect.execution.workItemId,
      workItemRevision: input.preEffect.execution.workItemRevision,
      ownerPeerId,
      ownerEpoch: input.preEffect.execution.ownerEpoch,
      assigneePeerId: replacement.peerId,
      awardId: recoveryAwardId,
      acceptanceId: recoveryAcceptanceId,
      assignmentEpoch: input.preEffect.execution.assignmentEpoch + 1,
      assignmentAuthorityId: certificateId,
      fencingToken: certificateId,
      leaseExpiresAt,
      checkpointDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      checkpointSummary: "Recovered execution checkpoint.",
    },
    owner.peerId,
    acceptance.messageId,
    {
      sentAt: checkpointSentAt,
      expiresAt: wallTime(
        input.missionIntent,
        logicalTimeMs + RECOVERY_ENVELOPE_TTL_MS,
      ),
    },
  );
  const checkpointed = evaluateMeshAllocationCommand(
    allocationRuntime(states[replacement.peerId]),
    {
      kind: "allocation.execution",
      preparedAt: logicalTimeMs,
      envelope: checkpoint,
    },
    recoveryVerifiedAt(input.missionIntent, logicalTimeMs),
    logicalTimeMs,
  );
  states = acceptLocal(
    states,
    replacement.peerId,
    checkpointed,
    "closed_loop_recovery_checkpoint_rejected",
  );
  states = await deliver(
    context,
    states,
    owner.peerId,
    checkpoint,
    logicalTimeMs,
  );

  const current = currentAuthority(
    states,
    owner.peerId,
    replacement.peerId,
    resumedCheckpointId,
  );
  const workContract = createWorkContractFromMeshV1({
    workContractId: "recovery:work-contract:2",
    identity: identity(input.missionIntent, replacement),
    objective: current.objective,
    workItem: current.workItem,
    execution: current.execution,
    fenceHead: current.fenceHead,
    mandate: input.mandate,
    roleKey: input.preEffect.workContract.roleKey,
    trustPolicyId: input.preEffect.workContract.trustPolicyId,
    inferencePolicyId: input.preEffect.workContract.inferencePolicyId,
    maximumActionBudgetUnits:
      input.preEffect.workContract.maximumActionBudgetUnits,
    createdAtLogicalMs: logicalTimeMs,
  });

  const staleRejections = await rejectStaleEpochOneRecords(
    context,
    states,
    owner.peerId,
    failed,
    oldLease.currentLeaseExpiresAt,
    input.preEffect,
    logicalTimeMs + 1,
  );
  if (
    !staleRejections.every(
      (item) => item.rejectionCode === "execution_authority_invalid",
    )
  )
    throw new Error("closed_loop_recovery_stale_fencing_failed");

  let finalization:
    Promise<CollectiveClosedLoopRecoveredFinalizedResultV1> | undefined;
  let finalizationBinding: string | undefined;
  const recovery: CollectiveClosedLoopCertifiedRecoveryResultV1 = Object.freeze(
    {
      schemaVersion: 1,
      failedWinnerPeerId: failed,
      replacementPeerId: replacement.peerId,
      recoveryLogicalTimeMs: logicalTimeMs,
      leaseStartsAt: awardSentAt,
      takeoverProposalId: proposalId,
      leaseVoteIds: Object.freeze([...voteIds].sort()),
      certificateId,
      recoveryAwardId,
      recoveryAcceptanceId,
      resumedCheckpointId,
      workContract,
      execution: current.execution,
      fenceHead: current.fenceHead,
      checkpoint: current.checkpoint,
      staleRejectionCodes: Object.freeze(
        staleRejections.map((item) => item.rejectionCode),
      ),
      staleRejections: Object.freeze(staleRejections),
      meshStates: Object.freeze({ ...states }),
      async finalizeAfterCommittedEffect(
        finalizeInput: CollectiveClosedLoopFinalizationInputV1,
      ) {
        const attempt = validateCollectiveProtectedEffectAttemptV1(
          finalizeInput.effectAttempt,
        );
        const rawReceipt = finalizeInput.effectReceipt;
        const receipt = validateCollectiveProtectedEffectReceiptV1(rawReceipt);
        assertRecoveredEffectBound(attempt, receipt, workContract);
        // The original evaluator binding is retained by preEffect. Recovery does
        // not create an alternate effect path or a second receipt authority.
        assertCollectiveEffectReceiptProvenanceV1(
          input.preEffect,
          attempt,
          rawReceipt,
        );
        if (
          receipt.status !== "committed" ||
          receipt.outputDigest !== finalizeInput.resultDigest
        )
          throw new Error("closed_loop_effect_not_committed");
        const binding = `${attempt.attemptDigest}:${receipt.receiptDigest}:${finalizeInput.resultDigest}:${finalizeInput.resultSummary}`;
        if (finalization !== undefined) {
          if (binding !== finalizationBinding)
            throw new Error("closed_loop_finalization_conflict");
          return finalization;
        }
        finalizationBinding = binding;
        finalization = finalizeRecoveredResult({
          context,
          states,
          ownerPeerId: owner.peerId,
          replacementPeerId: replacement.peerId,
          workContract,
          checkpoint: current.checkpoint,
          recoveryAwardId,
          recoveryAcceptanceId,
          leaseExpiresAt,
          resultDigest: finalizeInput.resultDigest,
          resultSummary: finalizeInput.resultSummary,
          logicalTimeMs,
        });
        return finalization;
      },
    },
  );
  return recovery;
}

async function finalizeRecoveredResult(input: {
  readonly context: RecoveryContext;
  readonly states: Readonly<Record<string, MeshAllocationInboundRuntimeState>>;
  readonly ownerPeerId: string;
  readonly replacementPeerId: string;
  readonly workContract: WorkContractV1;
  readonly checkpoint: MeshExecutionRecordProjection;
  readonly recoveryAwardId: string;
  readonly recoveryAcceptanceId: string;
  readonly leaseExpiresAt: string;
  readonly resultDigest: string;
  readonly resultSummary: string;
  readonly logicalTimeMs: number;
}): Promise<CollectiveClosedLoopRecoveredFinalizedResultV1> {
  const logicalTimeMs = input.logicalTimeMs + 1;
  const resultId = "recovery:result:2";
  const resultEnvelope = await signEnvelope(
    input.context,
    input.replacementPeerId,
    "work.result",
    {
      type: "work.result" as const,
      resultId,
      resultDigest: meshContentDigest(input.resultDigest),
      objectiveId: input.workContract.objective.objectiveId,
      objectiveDocumentId: input.workContract.objective.objectiveDocumentId,
      objectiveRevision: input.workContract.objective.objectiveRevision,
      workItemId: input.workContract.assignment.workItemId,
      workItemRevision: input.workContract.assignment.workItemRevision,
      ownerPeerId: input.workContract.assignment.ownerPeerId,
      ownerEpoch: 1,
      assigneePeerId: input.replacementPeerId,
      awardId: input.recoveryAwardId,
      acceptanceId: input.recoveryAcceptanceId,
      assignmentEpoch: input.workContract.assignment.assignmentEpoch,
      assignmentAuthorityId:
        input.workContract.assignment.assignmentAuthorityId,
      fencingToken: input.workContract.assignment.fencingToken,
      leaseExpiresAt: input.leaseExpiresAt,
      checkpointId: input.checkpoint.recordId,
      resultSummary: input.resultSummary,
    },
    input.ownerPeerId,
    input.checkpoint.envelope.messageId,
    {
      sentAt: wallTime(input.context.input.missionIntent, logicalTimeMs),
      expiresAt: wallTime(
        input.context.input.missionIntent,
        logicalTimeMs + RECOVERY_ENVELOPE_TTL_MS,
      ),
    },
  );
  const local = evaluateMeshAllocationCommand(
    allocationRuntime(input.states[input.replacementPeerId]!),
    {
      kind: "allocation.execution",
      preparedAt: logicalTimeMs,
      envelope: resultEnvelope,
    },
    recoveryVerifiedAt(input.context.input.missionIntent, logicalTimeMs),
    logicalTimeMs,
  );
  let states = acceptLocal(
    { ...input.states },
    input.replacementPeerId,
    local,
    "closed_loop_recovery_result_rejected",
  );
  states = await deliver(
    input.context,
    states,
    input.ownerPeerId,
    resultEnvelope,
    logicalTimeMs,
  );
  const result =
    states[input.replacementPeerId]!.allocation.executionRecords[resultId];
  if (!result || result.recordType !== "result")
    throw new Error("closed_loop_recovery_result_evidence_missing");
  return Object.freeze({
    schemaVersion: 1,
    winnerPeerId: input.replacementPeerId,
    workContract: input.workContract,
    result,
    meshStates: Object.freeze(states),
    logicalTimeMs,
    interactionCount: input.context.interactionCount,
  });
}

function assertRecoveredEffectBound(
  attempt: CollectiveProtectedEffectAttemptV1,
  receipt: CollectiveProtectedEffectReceiptV1,
  workContract: WorkContractV1,
): void {
  if (
    receipt.attemptDigest !== attempt.attemptDigest ||
    receipt.idempotencyKey !== attempt.idempotencyKey ||
    attempt.tenantId !== workContract.tenantId ||
    attempt.peerId !== workContract.assignment.assignedPeerId ||
    attempt.peerInstanceId !== workContract.assignment.assignedInstanceId ||
    attempt.workItemId !== workContract.assignment.workItemId ||
    attempt.workItemRevision !== workContract.assignment.workItemRevision ||
    attempt.workContractId !== workContract.workContractId ||
    attempt.workContractDigest !== workContract.workContractDigest ||
    attempt.assignmentEpoch !== workContract.assignment.assignmentEpoch ||
    attempt.authorityGeneration !==
      workContract.assignment.authorityGeneration ||
    attempt.fencingToken !== workContract.assignment.fencingToken
  )
    throw new Error("closed_loop_effect_binding_mismatch");
}

function validateInput(
  value: CollectiveClosedLoopCertifiedRecoveryInputV1,
): CollectiveClosedLoopCertifiedRecoveryInputV1 {
  if (
    value?.schemaVersion !== 1 ||
    !value.preEffect ||
    !Array.isArray(value.peers) ||
    !value.runner ||
    !value.missionIntent ||
    !value.mandate ||
    typeof value.failedWinnerPeerId !== "string" ||
    typeof value.replacementPeerId !== "string" ||
    !Number.isSafeInteger(value.faultLogicalTimeMs) ||
    value.faultLogicalTimeMs < 0
  )
    throw new TypeError("closed_loop_recovery_input_invalid");
  if (value.peers.length < 3 || value.peers.length > 100)
    throw new TypeError("closed_loop_recovery_roster_size_invalid");
  const peersById = new Map(value.peers.map((peer) => [peer.peerId, peer]));
  if (
    peersById.size !== value.peers.length ||
    value.peers.some(
      (peer) =>
        peer.schemaVersion !== 1 ||
        typeof peer.peerId !== "string" ||
        peer.peerId.length === 0 ||
        typeof peer.peerInstanceId !== "string" ||
        peer.peerInstanceId.length === 0,
    )
  )
    throw new TypeError("closed_loop_recovery_roster_invalid");
  const contract = value.preEffect.workContract;
  if (
    value.missionIntent.tenantId !== contract.tenantId ||
    value.missionIntent.policyDomainId !== contract.policyDomainId ||
    value.missionIntent.mandateDigest !== value.mandate.mandateDigest ||
    contract.mandate.mandateDigest !== value.mandate.mandateDigest ||
    value.missionIntent.objective.meshId !== contract.objective.meshId ||
    value.missionIntent.objective.objectiveId !==
      contract.objective.objectiveId ||
    value.missionIntent.objective.objectiveRevision !==
      contract.objective.objectiveRevision ||
    value.missionIntent.missionIntentId !==
      value.preEffect.roleBinding.missionIntentId ||
    value.missionIntent.revision !==
      value.preEffect.roleBinding.intentRevision ||
    value.missionIntent.intentDigest !==
      value.preEffect.roleBinding.intentDigest ||
    value.failedWinnerPeerId !== value.preEffect.winnerPeerId ||
    value.failedWinnerPeerId !== contract.assignment.assignedPeerId ||
    value.replacementPeerId === value.failedWinnerPeerId ||
    value.preEffect.execution.assigneePeerId !==
      contract.assignment.assignedPeerId ||
    value.preEffect.execution.assignmentEpoch !==
      contract.assignment.assignmentEpoch ||
    value.preEffect.execution.fencingToken !==
      contract.assignment.fencingToken ||
    !peersById.has(contract.assignment.ownerPeerId) ||
    !peersById.has(contract.assignment.assignedPeerId) ||
    !peersById.has(value.replacementPeerId) ||
    !peersById.has(value.failedWinnerPeerId) ||
    !Object.hasOwn(value.runner.privateKeys, contract.assignment.ownerPeerId) ||
    !Object.hasOwn(
      value.runner.privateKeys,
      contract.assignment.assignedPeerId,
    ) ||
    !Object.hasOwn(value.runner.privateKeys, value.replacementPeerId) ||
    value.peers.some(
      (peer) => !Object.hasOwn(value.runner.privateKeys, peer.peerId),
    ) ||
    value.faultLogicalTimeMs < value.preEffect.logicalTimeMs ||
    Object.keys(value.preEffect.meshStates).length !== value.peers.length ||
    value.peers.some((peer) => {
      const state = value.preEffect.meshStates[peer.peerId];
      return (
        !state ||
        state.coordination.identity.peerId !== peer.peerId ||
        state.coordination.identity.instanceId !== peer.peerInstanceId ||
        state.coordination.identity.tenantId !== value.missionIntent.tenantId ||
        state.coordination.identity.meshId !==
          value.missionIntent.objective.meshId
      );
    })
  )
    throw new TypeError("closed_loop_recovery_binding_invalid");
  return value;
}

function peer(
  context: RecoveryContext,
  peerId: string,
): CollectiveClosedLoopRuntimePeerV1 {
  const value = context.peersById.get(peerId);
  if (!value || !context.input.runner.privateKeys[peerId])
    throw new Error("closed_loop_recovery_peer_missing");
  return value;
}

function allocationRuntime(state: MeshAllocationInboundRuntimeState) {
  return createMeshAllocationRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    state.allocation,
  );
}

function retainInbound(
  prior: MeshAllocationInboundRuntimeState,
  state: ReturnType<typeof createMeshAllocationRuntimeState>,
): MeshAllocationInboundRuntimeState {
  return createMeshAllocationInboundRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    state.allocation,
    prior.inbound,
  );
}

function extendRecoveryAdmission(
  context: RecoveryContext,
  states: Record<string, MeshAllocationInboundRuntimeState>,
): Record<string, MeshAllocationInboundRuntimeState> {
  const configuredPeers = Object.fromEntries(
    context.input.peers.map((candidate) => [
      candidate.peerId,
      {
        peerId: candidate.peerId,
        instanceIds: [candidate.peerInstanceId],
        validUntil: context.input.missionIntent.validUntil,
      },
    ]),
  );
  return Object.fromEntries(
    Object.entries(states).map(([peerId, state]) => [
      peerId,
      createMeshAllocationInboundRuntimeState(
        state.coordination,
        restoreMeshDiscoveryState({
          ...state.discovery,
          admittedPeers: Object.fromEntries([
            ...Object.entries(configuredPeers),
            ...Object.values(state.objectives.objectivePolicies)
              .flatMap((policy) => policy.recoveryWitnessPeerIds)
              .filter(
                (witnessPeerId) =>
                  !Object.hasOwn(configuredPeers, witnessPeerId),
              )
              .map((witnessPeerId) => [
                witnessPeerId,
                {
                  peerId: witnessPeerId,
                  instanceIds: [`instance:${witnessPeerId}`],
                  validUntil: context.input.missionIntent.validUntil,
                },
              ]),
          ]),
          lastLogicalTime: state.discovery.lastLogicalTime,
        }),
        state.objectives,
        state.allocation,
        state.inbound,
      ),
    ]),
  );
}

function acceptLocal(
  states: Record<string, MeshAllocationInboundRuntimeState>,
  peerId: string,
  decision: ReturnType<typeof evaluateMeshAllocationCommand>,
  label: string,
): Record<string, MeshAllocationInboundRuntimeState> {
  if (!decision.accepted) throw new Error(`${label}:${decision.code}`);
  return {
    ...states,
    [peerId]: retainInbound(states[peerId]!, decision.state),
  };
}

async function deliver(
  context: RecoveryContext,
  states: Record<string, MeshAllocationInboundRuntimeState>,
  peerId: string,
  envelope: SignedMeshEnvelope<MeshAllocationPayload>,
  logicalTimeMs: number,
  verifiedAt = recoveryVerifiedAt(context.input.missionIntent, logicalTimeMs),
): Promise<Record<string, MeshAllocationInboundRuntimeState>> {
  const state = states[peerId];
  if (!state) return states;
  const processor = createMeshAllocationInboundProcessor({
    resolver: context.input.runner.resolver,
    cryptoPolicy: context.input.runner.cryptoPolicy,
    crypto: context.input.runner.crypto,
  });
  const decision = await processor.process(state, {
    envelope,
    verifiedAt,
    receivedAt: logicalTimeMs,
  });
  if (!decision.accepted)
    throw new Error(
      `closed_loop_recovery_delivery_rejected:${envelope.payload.type}:${decision.code}`,
    );
  context.interactionCount += 1;
  return { ...states, [peerId]: decision.state };
}

async function copyForWitness(
  context: RecoveryContext,
  source: SignedMeshEnvelope<MeshAllocationPayload>,
  witnessPeerId: string,
  causationId = source.causationId,
): Promise<SignedMeshEnvelope<MeshAllocationPayload>> {
  return signEnvelope(
    context,
    source.sender.peerId,
    source.type,
    source.payload,
    witnessPeerId,
    causationId,
    { sentAt: source.sentAt, expiresAt: source.expiresAt },
  );
}

function expireLeases(
  initial: Record<string, MeshAllocationInboundRuntimeState>,
  peerIds: readonly string[],
  floor: number,
): {
  readonly states: Record<string, MeshAllocationInboundRuntimeState>;
  readonly logicalTimeMs: number;
} {
  let states = initial;
  let logicalTimeMs = floor;
  for (const peerId of [...new Set(peerIds)].sort()) {
    const state = states[peerId];
    if (!state) continue;
    const timer = Object.values(state.coordination.timers).find(
      (candidate) => candidate.kind === "lease.expiry",
    );
    if (!timer) continue;
    logicalTimeMs = Math.max(logicalTimeMs, timer.dueAt);
    const decision = evaluateMeshAllocationTimer(
      allocationRuntime(state),
      {
        kind: "timer.fired",
        timerId: timer.timerId,
        generation: timer.generation,
      },
      logicalTimeMs,
    );
    if (!decision.accepted)
      throw new Error(`closed_loop_recovery_expiry_rejected:${decision.code}`);
    states = { ...states, [peerId]: retainInbound(state, decision.state) };
  }
  return { states, logicalTimeMs };
}

async function recoveryRecipients<
  T extends Extract<
    MeshMessagePayload,
    {
      readonly type:
        "lease.takeover_proposal" | "lease.vote" | "lease.certificate";
    }
  >,
>(
  context: RecoveryContext,
  senderPeerId: string,
  payload: T,
  causationId: string | undefined,
  logicalTimeMs: number,
): Promise<readonly MeshLocalRecoveryPreparedRecipient[]> {
  const policy =
    context.input.preEffect.meshStates[
      context.input.preEffect.workContract.assignment.ownerPeerId
    ]!.objectives.objectives[
      context.input.missionIntent.objective.objectiveId
    ]!;
  const recipients = [
    context.input.preEffect.workContract.assignment.ownerPeerId,
    context.input.failedWinnerPeerId,
    context.input.replacementPeerId,
    ...policy.recoveryWitnessPeerIds,
  ]
    .filter(
      (peerId, index, all) =>
        peerId !== senderPeerId && all.indexOf(peerId) === index,
    )
    .sort();
  return Promise.all(
    recipients.map(async (recipientPeerId) => ({
      recipientPeerId,
      preparedAt: logicalTimeMs,
      envelope: await signEnvelope(
        context,
        senderPeerId,
        payload.type,
        payload,
        recipientPeerId,
        causationId,
      ),
    })),
  );
}

function applyLocalRecovery(
  context: RecoveryContext,
  states: Record<string, MeshAllocationInboundRuntimeState>,
  senderPeerId: string,
  recipients: readonly MeshLocalRecoveryPreparedRecipient[],
  logicalTimeMs: number,
): Record<string, MeshAllocationInboundRuntimeState> {
  const state = states[senderPeerId];
  if (!state) throw new Error("closed_loop_recovery_sender_state_missing");
  const decision = evaluateMeshAllocationCommand(
    allocationRuntime(state),
    { kind: "allocation.recovery", recipients },
    recoveryVerifiedAt(context.input.missionIntent, logicalTimeMs),
    logicalTimeMs,
  );
  return acceptLocal(
    states,
    senderPeerId,
    decision,
    "closed_loop_recovery_record_rejected",
  );
}

async function deliverRecoveryEffects(
  context: RecoveryContext,
  states: Record<string, MeshAllocationInboundRuntimeState>,
  senderPeerId: string,
  recipients: readonly MeshLocalRecoveryPreparedRecipient[],
  logicalTimeMs: number,
): Promise<Record<string, MeshAllocationInboundRuntimeState>> {
  let next = states;
  for (const recipient of recipients) {
    if (
      recipient.recipientPeerId === senderPeerId ||
      !next[recipient.recipientPeerId]
    )
      continue;
    next = await deliver(
      context,
      next,
      recipient.recipientPeerId,
      recipient.envelope,
      logicalTimeMs,
    );
  }
  return next;
}

async function signEnvelope<T extends MeshMessagePayload>(
  context: RecoveryContext,
  senderPeerId: string,
  type: T["type"],
  payload: T,
  recipientPeerId: string,
  causationId?: string,
  timing?: { readonly sentAt: string; readonly expiresAt: string },
): Promise<SignedMeshEnvelope<T>> {
  const sender = peer(context, senderPeerId);
  const sequence = (context.sequences.get(senderPeerId) ?? 10_000) + 1;
  context.sequences.set(senderPeerId, sequence);
  // Reserve every allocator output before the first await. Recipient
  // preparation intentionally runs concurrently, so allocating afterwards
  // would make message IDs depend on crypto promise completion order.
  const envelopeMessageId = messageId(context.nextMessage++);
  const canonical = canonicalizeMeshPayload(payload);
  if (!canonical.ok) throw new Error("closed_loop_recovery_payload_invalid");
  const bytes = await context.input.runner.crypto.subtle.digest(
    "SHA-256",
    canonical.value.slice().buffer as ArrayBuffer,
  );
  const envelope = {
    protocol: "agentplat.mesh",
    wireVersion: WIRE_VERSION,
    messageId: envelopeMessageId,
    tenantId: context.input.missionIntent.tenantId,
    meshId: context.input.missionIntent.objective.meshId,
    objectiveId: context.input.missionIntent.objective.objectiveId,
    type,
    sender: { peerId: sender.peerId, instanceId: sender.peerInstanceId },
    audience: { kind: "peer", peerId: recipientPeerId },
    sequence,
    sentAt:
      timing?.sentAt ??
      recoverySentAt(
        context.input.missionIntent,
        context.input.faultLogicalTimeMs,
      ),
    expiresAt:
      timing?.expiresAt ??
      wallTime(
        context.input.missionIntent,
        context.input.faultLogicalTimeMs + RECOVERY_ENVELOPE_TTL_MS,
      ),
    ...(causationId === undefined ? {} : { causationId }),
    payloadHash: `sha256:${base64Url(new Uint8Array(bytes))}`,
    payload,
    proof: {
      algorithm: "Ed25519",
      keyId: `key:${sender.peerId}`,
      // The signer replaces this placeholder after structural validation.
      value: "A".repeat(86),
    },
  } as UnsignedMeshEnvelope<T, 0>;
  const preflight = validateSignedMeshEnvelope({
    ...envelope,
    payloadHash: `sha256:${"A".repeat(43)}`,
    proof: { ...envelope.proof, value: "A".repeat(86) },
  });
  if (!preflight.ok)
    throw new Error(
      `closed_loop_recovery_envelope_invalid:${preflight.issues
        .map((issue) => `${issue.code}:${issue.path}`)
        .join(",")}`,
    );
  return context.input.runner.signer.sign({
    envelope,
    privateKey: context.input.runner.privateKeys[senderPeerId]!,
  });
}

function currentAuthority(
  states: Readonly<Record<string, MeshAllocationInboundRuntimeState>>,
  ownerPeerId: string,
  replacementPeerId: string,
  checkpointId: string,
): {
  readonly objective: MeshObjectiveProjection;
  readonly workItem: MeshWorkItemProjection;
  readonly execution: MeshExecutionHeadProjection;
  readonly fenceHead: MeshAssignmentFenceHeadProjection;
  readonly checkpoint: MeshExecutionRecordProjection;
} {
  const owner = states[ownerPeerId];
  const replacement = states[replacementPeerId];
  const execution = Object.values(replacement.allocation.executionHeads).find(
    (head) => head.phase === "active",
  );
  const fenceHead = Object.values(
    replacement.allocation.assignmentFenceHeads,
  ).find((head) => head.phase === "active");
  const workItem = Object.values(owner.objectives.workItems).find(
    (work) => work.workItemId === execution?.workItemId,
  );
  const objective =
    execution === undefined
      ? undefined
      : owner.objectives.objectives[execution.objectiveId];
  const checkpoint = replacement.allocation.executionRecords[checkpointId];
  if (!objective || !workItem || !execution || !fenceHead || !checkpoint)
    throw new Error("closed_loop_recovery_current_authority_missing");
  return { objective, workItem, execution, fenceHead, checkpoint };
}

async function rejectStaleEpochOneRecords(
  context: RecoveryContext,
  states: Readonly<Record<string, MeshAllocationInboundRuntimeState>>,
  ownerPeerId: string,
  failedPeerId: string,
  oldLeaseExpiresAt: string,
  preEffect: CollectiveClosedLoopPreEffectHandleV1,
  logicalTimeMs: number,
): Promise<CollectiveClosedLoopStaleRejectionV1[]> {
  const common = {
    objectiveId: preEffect.execution.objectiveId,
    objectiveDocumentId: preEffect.execution.objectiveDocumentId,
    objectiveRevision: preEffect.execution.objectiveRevision,
    workItemId: preEffect.execution.workItemId,
    workItemRevision: preEffect.execution.workItemRevision,
    ownerPeerId,
    ownerEpoch: preEffect.execution.ownerEpoch,
    assigneePeerId: failedPeerId,
    awardId: preEffect.execution.awardId,
    acceptanceId: preEffect.execution.acceptanceId,
    assignmentEpoch: preEffect.execution.assignmentEpoch,
    assignmentAuthorityId: preEffect.execution.assignmentAuthorityId,
    fencingToken: preEffect.execution.fencingToken,
    leaseExpiresAt: oldLeaseExpiresAt,
  };
  const verifiedBeforeOldLease = new Date(
    Date.parse(oldLeaseExpiresAt) - 2,
  ).toISOString();
  const staleTiming = {
    sentAt: new Date(Date.parse(oldLeaseExpiresAt) - 2).toISOString(),
    expiresAt: new Date(Date.parse(oldLeaseExpiresAt) - 1).toISOString(),
  };
  const progress = await signEnvelope(
    context,
    failedPeerId,
    "work.progress",
    {
      type: "work.progress" as const,
      progressId: "recovery:stale-progress:1",
      progressSequence: 2,
      ...common,
      progressSummary: "stale epoch one progress",
    },
    ownerPeerId,
    preEffect.checkpoint.envelope.messageId,
    staleTiming,
  );
  const result = await signEnvelope(
    context,
    failedPeerId,
    "work.result",
    {
      type: "work.result" as const,
      resultId: "recovery:stale-result:1",
      resultDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ...common,
      checkpointId: preEffect.checkpoint.recordId,
      resultSummary: "stale epoch one result",
    },
    ownerPeerId,
    preEffect.checkpoint.envelope.messageId,
    staleTiming,
  );
  const rejections: CollectiveClosedLoopStaleRejectionV1[] = [];
  for (const [recordType, recordId, envelope] of [
    ["work.progress", "recovery:stale-progress:1", progress],
    ["work.result", "recovery:stale-result:1", result],
  ] as const) {
    const verification = await verifyMeshEnvelope({
      envelope: envelope as SignedMeshEnvelope<MeshAllocationPayload>,
      resolver: context.input.runner.resolver,
      policy: context.input.runner.cryptoPolicy,
      verifiedAt: verifiedBeforeOldLease,
    });
    if (!verification.verified)
      throw new Error("closed_loop_recovery_stale_envelope_unverified");
    const before = states[ownerPeerId];
    const allocationBefore = allocationRuntime(before);
    const decision = evaluateVerifiedMeshAllocationEnvelope(allocationBefore, {
      envelope: verification.envelope,
      verifiedAt: verifiedBeforeOldLease,
      receivedAt: logicalTimeMs,
    });
    if (decision.accepted || decision.state !== allocationBefore)
      throw new Error("closed_loop_recovery_stale_record_mutated");
    rejections.push(
      Object.freeze({
        recordType,
        recordId,
        envelope,
        rejectionCode: decision.code,
        logicalTimeMs,
        stateUnchanged: true,
      }),
    );
  }
  return rejections;
}

function identity(
  missionIntent: MissionIntentV1,
  peerValue: CollectiveClosedLoopRuntimePeerV1,
) {
  return Object.freeze({
    tenantId: missionIntent.tenantId,
    meshId: missionIntent.objective.meshId,
    peerId: peerValue.peerId,
    instanceId: peerValue.peerInstanceId,
    keyId: `key:${peerValue.peerId}`,
  });
}

function recoverySentAt(
  missionIntent: MissionIntentV1,
  logicalTimeMs: number,
): string {
  return wallTime(missionIntent, logicalTimeMs);
}

function recoveryVerifiedAt(
  missionIntent: MissionIntentV1,
  logicalTimeMs: number,
): string {
  return wallTime(missionIntent, logicalTimeMs + 1);
}

function wallTime(missionIntent: MissionIntentV1, offsetMs: number): string {
  const time = Date.parse(missionIntent.validFrom) + offsetMs;
  if (
    !Number.isSafeInteger(time) ||
    time >= Date.parse(missionIntent.validUntil)
  )
    throw new RangeError("closed_loop_recovery_wall_time_invalid");
  return new Date(time).toISOString();
}

function earlierTimestamp(left: string, right: string): string {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function meshContentDigest(value: string): string {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError("closed_loop_result_digest_invalid");
  const hex = value.slice("sha256:".length);
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return `sha256:${base64Url(bytes)}`;
}

function messageId(sequence: number): string {
  const bytes = new Uint8Array(16);
  bytes[0] = 0x72;
  bytes[1] = 0x63;
  new DataView(bytes.buffer).setUint32(12, sequence);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}
