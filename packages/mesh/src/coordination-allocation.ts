import {
  canonicalizeMeshPayload,
  compareMeshTimestamps,
  validateMeshEnvelopeContext,
  validateSignedMeshEnvelope,
  type SignedMeshEnvelope,
  type VerifiedMeshEnvelope,
  type WorkBidPayload,
  type WorkAcceptPayload,
  type WorkAwardPayload,
  type WorkDeclinePayload,
  type WorkOfferPayload,
} from "@agentplat/mesh-protocol";

import type {
  MeshAcceptedBidEvidence,
  MeshAcceptedAssignmentResponseEvidence,
  MeshAssigneeAssignmentAuthorityProjection,
  MeshAllocationBidSelection,
  MeshAllocationCommand,
  MeshAllocationDecision,
  MeshAllocationEffect,
  MeshAllocationRejectionCode,
  MeshAllocationRuntimeState,
  MeshAllocationSelectionInput,
  MeshAllocationTimerDecision,
  MeshAllocationTimerInput,
  MeshBidHeadProjection,
  MeshLocalOfferProjection,
  MeshLocalAssignmentResponseEvidence,
  MeshLocalBidProjection,
  MeshLocalAwardProjection,
  MeshLeaseHeadProjection,
  MeshReceivedAwardProjection,
  MeshReceivedOfferProjection,
  MeshVerifiedAllocationRequest,
  MeshWorkAllocationProjection,
} from "./coordination-allocation-contracts.js";
import {
  createMeshAllocationRuntimeState,
  restoreMeshAllocationState,
} from "./coordination-allocation-state.js";
import type {
  MeshCoordinationDomainRecord,
  MeshCoordinationJournalEntry,
  MeshCoordinationTimer,
} from "./coordination-contracts.js";
import { matchMeshDiscoveryCapabilities } from "./coordination-discovery.js";
import {
  evaluateMeshExecutionCommand,
  evaluateVerifiedMeshExecutionEnvelope,
} from "./coordination-execution.js";
import {
  evaluateMeshLeaseExpiryTimer,
  evaluateMeshLeaseRenewalCommand,
  evaluateVerifiedMeshLeaseRenewalEnvelope,
} from "./coordination-lease-renewal.js";
import { createMeshDiscoveryRuntimeState } from "./coordination-discovery-state.js";
import { logicalDeadline } from "./coordination-objective-work-time.js";
import { sha256Base64Url } from "./sha256.js";
import {
  assertMeshLogicalTime,
  createFrozenRecord,
  recordEntries,
} from "./state.js";

const utf8Encoder = new TextEncoder();

/** Commits a prepared local offer or award; signing and delivery stay outside. */
export function evaluateMeshAllocationCommand(
  state: MeshAllocationRuntimeState,
  command: MeshAllocationCommand,
  verifiedAt: string,
  receivedAt: number,
): MeshAllocationDecision {
  assertRuntime(state, receivedAt);
  if (
    !command ||
    ![
      "allocation.offer",
      "allocation.award",
      "allocation.bid",
      "allocation.assignment_response",
      "allocation.execution",
      "allocation.lease_renew",
    ].includes(command.kind)
  )
    throw new TypeError("Invalid Mesh allocation command");
  if (command.kind === "allocation.award")
    return evaluateAwardCommand(state, command, verifiedAt, receivedAt);
  if (command.kind === "allocation.bid")
    return evaluateBidCommand(state, command, verifiedAt, receivedAt);
  if (command.kind === "allocation.assignment_response")
    return evaluateLocalAssignmentResponseCommand(
      state,
      command,
      verifiedAt,
      receivedAt,
    );
  if (command.kind === "allocation.execution")
    return evaluateMeshExecutionCommand(state, command, verifiedAt, receivedAt);
  if (command.kind === "allocation.lease_renew")
    return evaluateMeshLeaseRenewalCommand(
      state,
      command,
      verifiedAt,
      receivedAt,
    );
  if (
    Object.keys(command).sort().join(",") !==
      "expectedWorkItemRevision,kind,objectiveId,recipients,workItemId" ||
    typeof command.objectiveId !== "string" ||
    typeof command.workItemId !== "string" ||
    !Number.isSafeInteger(command.expectedWorkItemRevision) ||
    command.expectedWorkItemRevision < 1 ||
    !Array.isArray(command.recipients) ||
    command.recipients.some(
      (recipient) =>
        !recipient ||
        typeof recipient !== "object" ||
        Object.keys(recipient).sort().join(",") !==
          "envelope,preparedAt,recipientPeerId" ||
        typeof recipient.recipientPeerId !== "string" ||
        !Number.isSafeInteger(recipient.preparedAt) ||
        recipient.preparedAt < 0 ||
        !recipient.envelope ||
        typeof recipient.envelope !== "object",
    )
  )
    throw new TypeError("invalid mesh local offer command");
  const work =
    state.objectives.workItems[
      workKey(command.objectiveId, command.workItemId)
    ];
  if (!work) return reject(state, "work_missing");
  if (
    work.objectiveId !== command.objectiveId ||
    work.workItemRevision !== command.expectedWorkItemRevision
  )
    return reject(state, "work_revision_conflict");
  if (
    work.ownerPeerId !== state.allocation.identity.peerId ||
    work.status !== "ready"
  )
    return reject(state, "work_not_ready");
  const objective = state.objectives.objectives[work.objectiveId];
  if (
    !objective ||
    objective.status !== "active" ||
    receivedAt >= objective.expiresAt ||
    compare(verifiedAt, objective.validUntil) >= 0 ||
    work.objectiveDocumentId !== objective.objectiveDocumentId ||
    work.objectiveRevision !== objective.objectiveRevision ||
    work.objectivePolicy !==
      state.objectives.objectivePolicies[
        policyKey(work.objectiveId, work.objectiveRevision)
      ]
  )
    return reject(state, "offer_invalid");
  const existing =
    state.allocation.workAllocations[
      workKey(work.objectiveId, work.workItemId)
    ];
  if (existing && existing.phase !== "ready")
    return reject(state, "work_not_ready");
  const priorOffers = Object.values(state.allocation.localOffers)
    .filter(
      (offer) =>
        offer.objectiveId === work.objectiveId &&
        offer.work.workItemId === work.workItemId,
    )
    .sort((a, b) => a.offerAttempt - b.offerAttempt);
  const prepared = validatePrepared(
    command.recipients,
    state,
    work,
    verifiedAt,
    receivedAt,
    priorOffers.at(-1),
  );
  if ("code" in prepared) return reject(state, prepared.code);
  const { payload, entries, bidDeadlineAt } = prepared;
  if (
    payload.offerAttempt !== priorOffers.length + 1 ||
    payload.previousOfferId !== priorOffers.at(-1)?.offerId ||
    payload.ownerPeerId !== state.allocation.identity.peerId ||
    payload.ownerEpoch !== 1 ||
    payload.objectiveId !== work.objectiveId ||
    payload.objectiveDocumentId !== work.objectiveDocumentId ||
    payload.objectiveRevision !== work.objectiveRevision ||
    payload.workItemId !== work.workItemId ||
    payload.workItemRevision !== work.workItemRevision ||
    payload.budgetReservationUnits !== work.budgetReservationUnits ||
    payload.workDeadline !== work.workDeadline ||
    !sameArray(payload.requiredCapabilityKeys, work.requiredCapabilityKeys) ||
    !sameRecord(payload.matchingAttributes, work.matchingAttributes) ||
    !sameArray(payload.completionCriteria, work.completionCriteria) ||
    !sameInput(payload, work)
  )
    return reject(state, "offer_invalid");
  const signedBidWindowDurations = entries.map(({ envelope }) =>
    logicalDeadline(payload.bidDeadline, envelope.sentAt, 0),
  );
  if (
    bidDeadlineAt > work.workDeadlineAt ||
    bidDeadlineAt - receivedAt > objective.bidWindowMs ||
    signedBidWindowDurations.some(
      (duration) => duration === undefined || duration > objective.bidWindowMs,
    )
  )
    return reject(state, "offer_invalid");
  if (
    objective.committedBudgetUnits >
      objective.maximumBudgetUnits - objective.reservedBudgetUnits ||
    work.budgetReservationUnits >
      objective.maximumBudgetUnits -
        objective.reservedBudgetUnits -
        objective.committedBudgetUnits
  )
    return reject(state, "offer_invalid");
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  )
    return reject(state, "journal_capacity_exceeded");
  if (
    Object.keys(state.coordination.timers).length >=
    state.coordination.limits.maximumTimers
  )
    return reject(state, "timer_capacity_exceeded");
  if (
    Object.keys(state.allocation.localOffers).length >=
    state.allocation.limits.maximumOffers
  )
    return reject(state, "offer_capacity_exceeded");
  const offerRecordKey = offerDomainKey(payload.offerId);
  if (state.coordination.domainRecords[offerRecordKey])
    return reject(state, "offer_duplicate_conflict");
  if (
    Object.keys(state.coordination.domainRecords).length >=
    state.coordination.limits.maximumDomainRecords
  )
    return reject(state, "domain_capacity_exceeded");
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");
  const reservationId = `allocation.reservation.${payload.offerId}`;
  const timerId = `allocation.bid.${payload.offerId}`;
  if (state.coordination.timers[timerId])
    return reject(state, "timer_id_conflict");
  const generation = 1;
  const binding = {
    objectiveId: work.objectiveId,
    objectiveDocumentId: work.objectiveDocumentId,
    objectiveRevision: work.objectiveRevision,
    objectivePolicy: work.objectivePolicy,
    work,
  };
  const localOffer: MeshLocalOfferProjection = {
    ...binding,
    offerId: payload.offerId,
    offerAttempt: payload.offerAttempt,
    ...(payload.previousOfferId === undefined
      ? {}
      : { previousOfferId: payload.previousOfferId }),
    bidDeadline: payload.bidDeadline,
    bidDeadlineAt,
    bidDeadlineTimerId: timerId,
    bidDeadlineTimerGeneration: generation,
    createdAt: receivedAt,
    validityVerifiedAt: verifiedAt,
    reservationId,
    recipientOffers: createFrozenRecord(
      entries.map(
        ({ recipientPeerId, preparedAt, envelope }) =>
          [
            recipientPeerId,
            Object.freeze({
              recipientPeerId,
              preparedAt,
              messageId: envelope.messageId,
              envelope,
            }),
          ] as const,
      ),
    ),
  };
  const allocationWork: MeshWorkAllocationProjection = Object.freeze({
    ...binding,
    workKey: workKey(work.objectiveId, work.workItemId),
    phase: "offered",
    activeOfferId: payload.offerId,
    bidDeadlineAt,
    reservationId,
    updatedAt: receivedAt,
  });
  const allocation = restoreMeshAllocationState({
    ...state.allocation,
    workAllocations: createFrozenRecord([
      ...recordEntries(state.allocation.workAllocations).filter(
        ([key]) => key !== allocationWork.workKey,
      ),
      [allocationWork.workKey, allocationWork],
    ]),
    localOffers: createFrozenRecord([
      ...recordEntries(state.allocation.localOffers),
      [payload.offerId, localOffer],
    ]),
    reservations: createFrozenRecord([
      ...recordEntries(state.allocation.reservations),
      [
        reservationId,
        Object.freeze({
          reservationId,
          workKey: allocationWork.workKey,
          offerId: payload.offerId,
          objectiveId: work.objectiveId,
          objectiveDocumentId: work.objectiveDocumentId,
          objectiveRevision: work.objectiveRevision,
          workItemId: work.workItemId,
          workItemRevision: work.workItemRevision,
          budgetReservationUnits: work.budgetReservationUnits,
          reservedAt: receivedAt,
          status: "reserved" as const,
        }),
      ],
    ]),
    lastLogicalTime: receivedAt,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const offerRecord: MeshCoordinationDomainRecord = Object.freeze({
    recordKey: offerRecordKey,
    recordType: "work.offer",
    recordId: payload.offerId,
    contentDigest: payloadDigest(entries[0]!.envelope),
    messageId: entries[0]!.envelope.messageId,
    acceptedAt: receivedAt,
    objectiveId: payload.objectiveId,
  });
  const journal: MeshCoordinationJournalEntry = Object.freeze({
    sequence,
    occurredAt: receivedAt,
    kind: "command.accepted",
    domainRecordKey: offerDomainKey(payload.offerId),
  });
  const timer: MeshCoordinationTimer = Object.freeze({
    timerId,
    kind: "work.bid_deadline",
    dueAt: bidDeadlineAt,
    generation,
    domainRecordKey: offerDomainKey(payload.offerId),
  });
  const coordination = Object.freeze({
    ...state.coordination,
    domainRecords: createFrozenRecord([
      ...recordEntries(state.coordination.domainRecords),
      [offerRecordKey, offerRecord],
    ]),
    timers: createFrozenRecord([
      ...recordEntries(state.coordination.timers),
      [timerId, timer],
    ]),
    journal: Object.freeze([...state.coordination.journal, journal]),
    localEventSequence: sequence,
    lastLogicalTime: receivedAt,
  });
  const nextObjective = Object.freeze({
    ...objective,
    reservedBudgetUnits:
      objective.reservedBudgetUnits + work.budgetReservationUnits,
  });
  const objectives = Object.freeze({
    ...state.objectives,
    objectives: createFrozenRecord([
      ...recordEntries(state.objectives.objectives).filter(
        ([key]) => key !== objective.objectiveId,
      ),
      [objective.objectiveId, nextObjective],
    ]),
    lastLogicalTime: receivedAt,
  });
  const next = createMeshAllocationRuntimeState(
    coordination,
    Object.freeze({ ...state.discovery, lastLogicalTime: receivedAt }),
    objectives,
    allocation,
  );
  const storedOffer = allocation.localOffers[
    payload.offerId
  ] as MeshLocalOfferProjection;
  const effects: readonly MeshAllocationEffect[] = Object.freeze(
    entries.map(({ recipientPeerId }) => {
      const stored = storedOffer.recipientOffers[recipientPeerId]!;
      return Object.freeze({
        kind: "allocation.offer.dispatch" as const,
        offerId: payload.offerId,
        recipientPeerId,
        messageId: stored.messageId,
        envelope: stored.envelope,
      });
    }),
  );
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: next,
    effects,
  });
}

function evaluateAwardCommand(
  state: MeshAllocationRuntimeState,
  command: Extract<
    MeshAllocationCommand,
    { readonly kind: "allocation.award" }
  >,
  verifiedAt: string,
  receivedAt: number,
): MeshAllocationDecision {
  if (
    Object.keys(command).sort().join(",") !==
      "bidId,bidRevision,kind,offerId,recipient" ||
    !command.recipient ||
    Object.keys(command.recipient).sort().join(",") !==
      "envelope,preparedAt,recipientPeerId"
  )
    throw new TypeError("invalid mesh local award command");
  const offer = state.allocation.localOffers[command.offerId];
  if (!offer) return reject(state, "offer_missing");
  if (
    Object.values(state.allocation.localAwards).some(
      (award) =>
        award.objectiveId === offer.objectiveId &&
        award.work.workItemId === offer.work.workItemId &&
        award.work.workItemRevision === offer.work.workItemRevision &&
        award.assignmentEpoch === 1,
    )
  )
    return reject(state, "award_invalid");
  const selected = selectMeshAllocationBid(state, {
    offerId: offer.offerId,
    evaluatedAt: receivedAt,
  });
  if (
    selected.reason !== "selected" ||
    !selected.bid ||
    selected.bid.bidId !== command.bidId ||
    selected.bid.bidRevision !== command.bidRevision
  )
    return reject(state, "bid_invalid");
  const bid = selected.bid;
  const work =
    state.allocation.workAllocations[
      workKey(offer.objectiveId, offer.work.workItemId)
    ];
  const reservation = state.allocation.reservations[offer.reservationId];
  const bidTimer = state.coordination.timers[offer.bidDeadlineTimerId];
  const objective = state.objectives.objectives[offer.objectiveId];
  if (
    !work ||
    work.phase !== "offered" ||
    work.activeOfferId !== offer.offerId ||
    !reservation ||
    reservation.status !== "reserved" ||
    !bidTimer ||
    !objective ||
    objective.status !== "active" ||
    objective.objectiveDocumentId !== offer.objectiveDocumentId ||
    objective.objectiveRevision !== offer.objectiveRevision ||
    receivedAt >= objective.expiresAt ||
    compare(verifiedAt, objective.validUntil) >= 0 ||
    compare(verifiedAt, offer.bidDeadline) >= 0
  )
    return reject(state, "offer_invalid");
  if (
    Object.values(state.allocation.workAllocations).filter(
      (entry) =>
        entry.objectiveId === offer.objectiveId &&
        (entry.phase === "award_pending" || entry.phase === "active"),
    ).length >= objective.maximumConcurrentAssignments
  )
    return reject(state, "assignment_capacity_exceeded");
  const parsed = validateSignedMeshEnvelope(command.recipient.envelope);
  if (!parsed.ok || parsed.value.payload.type !== "work.award")
    return reject(state, "award_invalid");
  const envelope = parsed.value as SignedMeshEnvelope<WorkAwardPayload>;
  const payload = envelope.payload;
  const acceptanceDeadlineAt = logicalDeadline(
    payload.acceptanceDeadline,
    verifiedAt,
    receivedAt,
  );
  const leaseExpiresAtLogical = logicalDeadline(
    payload.leaseExpiresAt,
    verifiedAt,
    receivedAt,
  );
  const signedAcceptanceDuration = logicalDeadline(
    payload.acceptanceDeadline,
    envelope.sentAt,
    0,
  );
  const signedLeaseDuration = logicalDeadline(
    payload.leaseExpiresAt,
    payload.leaseStartsAt,
    0,
  );
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: state.allocation.identity.tenantId,
    meshId: state.allocation.identity.meshId,
    peerId: bid.bidderPeerId,
    receivedAt: verifiedAt,
  });
  if (
    !context.ok ||
    command.recipient.preparedAt !== receivedAt ||
    !canonicalDigest(envelope) ||
    !acceptanceDeadlineAt ||
    !leaseExpiresAtLogical ||
    !signedAcceptanceDuration ||
    !signedLeaseDuration ||
    acceptanceDeadlineAt <= receivedAt ||
    leaseExpiresAtLogical <= receivedAt ||
    signedAcceptanceDuration > objective.acceptanceWindowMs ||
    signedLeaseDuration > objective.maximumLeaseDurationMs ||
    leaseExpiresAtLogical > offer.work.workDeadlineAt ||
    leaseExpiresAtLogical > objective.expiresAt ||
    envelope.sender.peerId !== state.allocation.identity.peerId ||
    envelope.sender.instanceId !== state.allocation.identity.instanceId ||
    envelope.proof.keyId !== state.allocation.identity.keyId ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== bid.bidderPeerId ||
    command.recipient.recipientPeerId !== bid.bidderPeerId ||
    envelope.causationId !== bid.acceptedMessageId ||
    payload.awardId === "" ||
    payload.offerId !== offer.offerId ||
    payload.bidId !== bid.bidId ||
    payload.bidRevision !== bid.bidRevision ||
    payload.assigneePeerId !== bid.bidderPeerId ||
    payload.assignmentEpoch !== 1 ||
    payload.authorityKind !== "award" ||
    payload.assignmentAuthorityId !== payload.awardId ||
    payload.fencingToken !== payload.awardId ||
    payload.budgetReservationUnits !== reservation.budgetReservationUnits ||
    payload.workDeadline !== offer.work.workDeadline ||
    payload.objectiveId !== offer.objectiveId ||
    payload.objectiveDocumentId !== offer.objectiveDocumentId ||
    payload.objectiveRevision !== offer.objectiveRevision ||
    payload.workItemId !== offer.work.workItemId ||
    payload.workItemRevision !== offer.work.workItemRevision ||
    payload.ownerPeerId !== state.allocation.identity.peerId ||
    payload.ownerEpoch !== 1 ||
    payload.offerAttempt !== offer.offerAttempt
  )
    return reject(state, "award_invalid");
  const awardKey = awardDomainKey(payload.awardId);
  if (
    Object.values(state.coordination.domainRecords).some(
      (record) => record.messageId === envelope.messageId,
    ) ||
    Object.values(state.allocation.localOffers).some((entry) =>
      Object.values(entry.recipientOffers).some(
        (prepared) => prepared.messageId === envelope.messageId,
      ),
    ) ||
    Object.values(state.allocation.acceptedBidEvidence).some(
      (entry) => entry.envelope.messageId === envelope.messageId,
    ) ||
    Object.values(state.allocation.localAwards).some(
      (entry) => entry.recipientAward.messageId === envelope.messageId,
    )
  )
    return reject(state, "award_duplicate_conflict");
  if (state.coordination.domainRecords[awardKey])
    return reject(state, "domain_record_conflict");
  const timerId = `allocation.acceptance.${payload.awardId}`;
  if (state.coordination.timers[timerId])
    return reject(state, "timer_id_conflict");
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  )
    return reject(state, "journal_capacity_exceeded");
  if (
    Object.keys(state.coordination.domainRecords).length >=
    state.coordination.limits.maximumDomainRecords
  )
    return reject(state, "domain_capacity_exceeded");
  if (
    Object.keys(state.allocation.localAwards).length >=
    state.allocation.limits.maximumAwards
  )
    return reject(state, "award_capacity_exceeded");
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");
  const award: MeshLocalAwardProjection = Object.freeze({
    objectiveId: offer.objectiveId,
    objectiveDocumentId: offer.objectiveDocumentId,
    objectiveRevision: offer.objectiveRevision,
    objectivePolicy: offer.objectivePolicy,
    work: offer.work,
    awardId: payload.awardId,
    offerId: payload.offerId,
    bidId: payload.bidId,
    bidRevision: payload.bidRevision,
    offerAttempt: payload.offerAttempt,
    assigneePeerId: payload.assigneePeerId,
    assignmentEpoch: 1,
    assignmentAuthorityId: payload.awardId,
    fencingToken: payload.awardId,
    budgetReservationUnits: payload.budgetReservationUnits,
    workDeadline: payload.workDeadline,
    leaseStartsAt: payload.leaseStartsAt,
    leaseExpiresAt: payload.leaseExpiresAt,
    leaseExpiresAtLogical,
    acceptanceDeadline: payload.acceptanceDeadline,
    acceptanceDeadlineAt,
    acceptanceDeadlineTimerId: timerId,
    acceptanceDeadlineTimerGeneration: 1,
    createdAt: receivedAt,
    validityVerifiedAt: verifiedAt,
    reservationId: reservation.reservationId,
    status: "awaiting_acceptance" as const,
    recipientAward: Object.freeze({
      recipientPeerId: bid.bidderPeerId,
      messageId: envelope.messageId,
      preparedAt: command.recipient.preparedAt,
      envelope,
    }),
  });
  const allocation = restoreMeshAllocationState({
    ...state.allocation,
    workAllocations: createFrozenRecord([
      ...recordEntries(state.allocation.workAllocations).filter(
        ([key]) => key !== work.workKey,
      ),
      [
        work.workKey,
        Object.freeze({
          ...work,
          phase: "award_pending",
          activeOfferId: undefined,
          bidDeadlineAt: undefined,
          activeAwardId: payload.awardId,
          updatedAt: receivedAt,
        }),
      ],
    ]),
    localAwards: createFrozenRecord([
      ...recordEntries(state.allocation.localAwards),
      [payload.awardId, award],
    ]),
    lastLogicalTime: receivedAt,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...state.coordination,
    domainRecords: createFrozenRecord([
      ...recordEntries(state.coordination.domainRecords),
      [
        awardKey,
        Object.freeze({
          recordKey: awardKey,
          recordType: "work.award" as const,
          recordId: payload.awardId,
          contentDigest: payloadDigest(envelope),
          messageId: envelope.messageId,
          acceptedAt: receivedAt,
          objectiveId: payload.objectiveId,
        }),
      ],
    ]),
    timers: createFrozenRecord([
      ...recordEntries(state.coordination.timers).filter(
        ([key]) => key !== bidTimer.timerId,
      ),
      [
        timerId,
        Object.freeze({
          timerId,
          kind: "work.acceptance_deadline" as const,
          dueAt: acceptanceDeadlineAt,
          generation: 1,
          domainRecordKey: awardKey,
        }),
      ],
    ]),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: receivedAt,
        kind: "command.accepted" as const,
        domainRecordKey: awardKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: receivedAt,
  });
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: createMeshAllocationRuntimeState(
      coordination,
      Object.freeze({ ...state.discovery, lastLogicalTime: receivedAt }),
      Object.freeze({ ...state.objectives, lastLogicalTime: receivedAt }),
      allocation,
    ),
    effects: Object.freeze([
      Object.freeze({
        kind: "allocation.award.dispatch" as const,
        awardId: payload.awardId,
        recipientPeerId: bid.bidderPeerId,
        messageId: envelope.messageId,
        envelope,
      }),
    ]),
  });
}

function evaluateBidCommand(
  state: MeshAllocationRuntimeState,
  command: Extract<MeshAllocationCommand, { readonly kind: "allocation.bid" }>,
  verifiedAt: string,
  receivedAt: number,
): MeshAllocationDecision {
  if (
    Object.keys(command).sort().join(",") !==
      "envelope,kind,offerId,preparedAt" ||
    typeof command.offerId !== "string" ||
    !Number.isSafeInteger(command.preparedAt) ||
    command.preparedAt < 0
  )
    throw new TypeError("invalid mesh local bid command");
  const offer = state.allocation.receivedOffers[command.offerId];
  if (!offer) return reject(state, "offer_missing");
  if (
    Object.values(state.allocation.receivedAwards).some(
      (award) => award.offerId === offer.offerId,
    )
  )
    return reject(state, "local_bid_invalid");
  const objective =
    state.objectives.objectives[offer.envelope.payload.objectiveId];
  if (
    !objective ||
    objective.status !== "active" ||
    objective.objectiveDocumentId !==
      offer.envelope.payload.objectiveDocumentId ||
    objective.objectiveRevision !== offer.envelope.payload.objectiveRevision ||
    receivedAt >= objective.expiresAt ||
    compare(verifiedAt, objective.validUntil) >= 0
  )
    return reject(state, "local_bid_invalid");
  if (
    receivedAt >= offer.bidDeadlineAt ||
    compare(verifiedAt, offer.envelope.payload.bidDeadline) >= 0
  )
    return reject(state, "bid_deadline_elapsed");
  const parsed = validateSignedMeshEnvelope(command.envelope);
  if (!parsed.ok || parsed.value.payload.type !== "work.bid")
    return reject(state, "local_bid_invalid");
  const envelope = parsed.value as SignedMeshEnvelope<WorkBidPayload>;
  const payload = envelope.payload;
  const bidExpiresAtLogical = logicalDeadline(
    payload.bidExpiresAt,
    verifiedAt,
    receivedAt,
  );
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: state.allocation.identity.tenantId,
    meshId: state.allocation.identity.meshId,
    peerId: offer.envelope.sender.peerId,
    receivedAt: verifiedAt,
  });
  if (
    !context.ok ||
    !canonicalDigest(envelope) ||
    command.preparedAt !== receivedAt ||
    !bidExpiresAtLogical ||
    bidExpiresAtLogical <= receivedAt ||
    bidExpiresAtLogical > offer.workDeadlineAt ||
    payload.budgetUnits > offer.envelope.payload.budgetReservationUnits ||
    envelope.sender.peerId !== state.allocation.identity.peerId ||
    envelope.sender.instanceId !== state.allocation.identity.instanceId ||
    envelope.proof.keyId !== state.allocation.identity.keyId ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== offer.envelope.sender.peerId ||
    envelope.causationId !== offer.envelope.messageId ||
    payload.bidderPeerId !== state.allocation.identity.peerId ||
    !matchesReceivedOffer(payload, offer)
  )
    return reject(state, "local_bid_invalid");
  const prior = Object.values(state.allocation.localBids)
    .filter((bid) => bid.offerId === offer.offerId)
    .sort((left, right) => left.bidRevision - right.bidRevision)
    .at(-1);
  if (
    payload.bidRevision !== (prior?.bidRevision ?? 0) + 1 ||
    payload.previousBidId !== prior?.bidId
  )
    return reject(state, "bid_predecessor_invalid");
  if (state.allocation.localBids[payload.bidId])
    return sameData(
      state.allocation.localBids[payload.bidId]!.envelope,
      envelope,
    )
      ? Object.freeze({
          accepted: true,
          duplicate: true,
          state,
          effects: Object.freeze([]),
        })
      : reject(state, "local_bid_duplicate_conflict");
  const domainKey = bidDomainKey(payload.bidId);
  if (
    messageAlreadyRetained(state, envelope.messageId) ||
    state.coordination.domainRecords[domainKey]
  )
    return reject(state, "local_bid_duplicate_conflict");
  if (
    Object.keys(state.allocation.localBids).length >=
    state.allocation.limits.maximumLocalBids
  )
    return reject(state, "local_bid_capacity_exceeded");
  const capacity = allocationWriteCapacity(state);
  if (capacity) return reject(state, capacity);
  const bid: MeshLocalBidProjection = Object.freeze({
    bidId: payload.bidId,
    offerId: payload.offerId,
    bidRevision: payload.bidRevision,
    ...(payload.previousBidId === undefined
      ? {}
      : { previousBidId: payload.previousBidId }),
    preparedAt: receivedAt,
    validityVerifiedAt: verifiedAt,
    bidExpiresAt: payload.bidExpiresAt,
    bidExpiresAtLogical,
    envelope,
  });
  return acceptAssigneeWrite(
    state,
    receivedAt,
    domainKey,
    "work.bid",
    payload.bidId,
    payload.objectiveId,
    envelope,
    {
      ...state.allocation,
      localBids: createFrozenRecord([
        ...recordEntries(state.allocation.localBids),
        [payload.bidId, bid],
      ]),
      lastLogicalTime: receivedAt,
    },
    Object.freeze({
      kind: "allocation.bid.dispatch" as const,
      bidId: payload.bidId,
      recipientPeerId: offer.envelope.sender.peerId,
      messageId: envelope.messageId,
      envelope,
    }),
  );
}

function evaluateLocalAssignmentResponseCommand(
  state: MeshAllocationRuntimeState,
  command: Extract<
    MeshAllocationCommand,
    { readonly kind: "allocation.assignment_response" }
  >,
  verifiedAt: string,
  receivedAt: number,
): MeshAllocationDecision {
  if (
    Object.keys(command).sort().join(",") !==
      "awardId,envelope,kind,preparedAt" ||
    typeof command.awardId !== "string" ||
    !Number.isSafeInteger(command.preparedAt) ||
    command.preparedAt < 0
  )
    throw new TypeError("invalid mesh local assignment response command");
  const award = state.allocation.receivedAwards[command.awardId];
  if (!award) return reject(state, "award_missing");
  const existing = state.allocation.localAssignmentResponses[award.awardId];
  if (existing)
    return sameData(existing.envelope, command.envelope)
      ? Object.freeze({
          accepted: true,
          duplicate: true,
          state,
          effects: Object.freeze([]),
        })
      : reject(state, "local_assignment_response_duplicate_conflict");
  if (
    award.status !== "awaiting_response" ||
    receivedAt >= award.acceptanceDeadlineAt ||
    compare(verifiedAt, award.envelope.payload.acceptanceDeadline) >= 0
  )
    return reject(state, "local_assignment_response_deadline_elapsed");
  const parsed = validateSignedMeshEnvelope(command.envelope);
  if (
    !parsed.ok ||
    (parsed.value.payload.type !== "work.accept" &&
      parsed.value.payload.type !== "work.decline")
  )
    return reject(state, "local_assignment_response_invalid");
  const envelope = parsed.value as SignedMeshEnvelope<
    WorkAcceptPayload | WorkDeclinePayload
  >;
  const payload = envelope.payload;
  const objective = state.objectives.objectives[payload.objectiveId];
  const policy =
    state.objectives.objectivePolicies[
      JSON.stringify([payload.objectiveId, payload.objectiveRevision])
    ];
  const responseId =
    payload.type === "work.accept" ? payload.acceptanceId : payload.declineId;
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: state.allocation.identity.tenantId,
    meshId: state.allocation.identity.meshId,
    peerId: award.envelope.sender.peerId,
    receivedAt: verifiedAt,
  });
  if (
    !context.ok ||
    !canonicalDigest(envelope) ||
    !objective ||
    objective.status !== "active" ||
    !policy ||
    policy.objectiveDocumentId !== payload.objectiveDocumentId ||
    receivedAt >= policy.expiresAt ||
    compare(verifiedAt, policy.validUntil) >= 0 ||
    command.preparedAt !== receivedAt ||
    envelope.sender.peerId !== state.allocation.identity.peerId ||
    envelope.sender.instanceId !== state.allocation.identity.instanceId ||
    envelope.proof.keyId !== state.allocation.identity.keyId ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== award.envelope.sender.peerId ||
    envelope.causationId !== award.envelope.messageId ||
    !matchesAwardResponse(payload, award) ||
    messageAlreadyRetained(state, envelope.messageId)
  )
    return reject(state, "local_assignment_response_invalid");
  const domainKey = JSON.stringify([payload.type, responseId]);
  if (state.coordination.domainRecords[domainKey])
    return reject(state, "domain_record_conflict");
  if (
    Object.keys(state.allocation.localAssignmentResponses).length >=
    state.allocation.limits.maximumLocalAssignmentResponses
  )
    return reject(state, "local_assignment_response_capacity_exceeded");
  if (
    payload.type === "work.accept" &&
    Object.keys(state.allocation.assigneeAuthorities).length >=
      state.allocation.limits.maximumAssignmentAuthorities
  )
    return reject(state, "assignment_authority_capacity_exceeded");
  if (
    payload.type === "work.accept" &&
    Object.keys(state.allocation.leaseHeads).length >=
      state.allocation.limits.maximumExecutionHeads
  )
    return reject(state, "execution_head_capacity_exceeded");
  const capacity = allocationWriteCapacity(state);
  if (capacity) return reject(state, capacity);
  const response: MeshLocalAssignmentResponseEvidence = Object.freeze({
    awardId: award.awardId,
    responseId,
    kind: payload.type,
    preparedAt: receivedAt,
    validityVerifiedAt: verifiedAt,
    envelope,
  });
  const accepted = payload.type === "work.accept";
  if (
    accepted &&
    Object.values(state.allocation.assigneeAuthorities).some(
      (authority) =>
        authority.objectiveId === payload.objectiveId &&
        authority.workItemId === payload.workItemId &&
        authority.workItemRevision === payload.workItemRevision &&
        authority.assignmentEpoch === payload.assignmentEpoch &&
        authority.assignmentAuthorityId !== payload.assignmentAuthorityId,
    )
  )
    return reject(state, "local_assignment_response_invalid");
  const authority: MeshAssigneeAssignmentAuthorityProjection | undefined =
    !accepted
      ? undefined
      : Object.freeze({
          awardId: award.awardId,
          acceptanceId: responseId,
          objectiveId: payload.objectiveId,
          objectiveDocumentId: payload.objectiveDocumentId,
          objectiveRevision: payload.objectiveRevision,
          workItemId: payload.workItemId,
          workItemRevision: payload.workItemRevision,
          ownerPeerId: payload.ownerPeerId,
          ownerEpoch: payload.ownerEpoch,
          assigneePeerId: payload.assigneePeerId,
          assignmentEpoch: 1,
          assignmentAuthorityId: payload.assignmentAuthorityId,
          fencingToken: payload.fencingToken,
          workDeadline: award.envelope.payload.workDeadline,
          workDeadlineAt:
            state.allocation.receivedOffers[award.offerId]!.workDeadlineAt,
          leaseExpiresAt: award.envelope.payload.leaseExpiresAt,
          leaseExpiresAtLogical: award.leaseExpiresAtLogical,
          activatedAt: receivedAt,
        });
  const leaseActivation =
    authority === undefined
      ? undefined
      : createInitialLeaseActivation({
          ...authority,
          acceptanceMessageId: response.envelope.messageId,
        });
  if (
    leaseActivation !== undefined &&
    state.coordination.timers[leaseActivation.timer.timerId] !== undefined
  )
    return reject(state, "timer_id_conflict");
  return acceptAssigneeWrite(
    state,
    receivedAt,
    domainKey,
    payload.type,
    responseId,
    payload.objectiveId,
    envelope,
    {
      ...state.allocation,
      receivedAwards: createFrozenRecord([
        ...recordEntries(state.allocation.receivedAwards).filter(
          ([key]) => key !== award.awardId,
        ),
        [
          award.awardId,
          Object.freeze({
            ...award,
            status: accepted ? ("accepted" as const) : ("declined" as const),
          }),
        ],
      ]),
      localAssignmentResponses: createFrozenRecord([
        ...recordEntries(state.allocation.localAssignmentResponses),
        [award.awardId, response],
      ]),
      assigneeAuthorities: createFrozenRecord(
        accepted
          ? [
              ...recordEntries(state.allocation.assigneeAuthorities),
              [award.awardId, authority!],
            ]
          : recordEntries(state.allocation.assigneeAuthorities),
      ),
      leaseHeads: createFrozenRecord(
        leaseActivation === undefined
          ? recordEntries(state.allocation.leaseHeads)
          : [
              ...recordEntries(state.allocation.leaseHeads),
              [leaseActivation.head.executionScopeKey, leaseActivation.head],
            ],
      ),
      lastLogicalTime: receivedAt,
    },
    Object.freeze({
      kind: "allocation.assignment_response.dispatch" as const,
      awardId: award.awardId,
      responseId,
      recipientPeerId: award.envelope.sender.peerId,
      messageId: envelope.messageId,
      envelope,
    }),
    leaseActivation?.timer,
    award.acceptanceDeadlineTimerId,
  );
}

/** Evaluates a verified direct bid at the local offer owner. */
export function evaluateVerifiedMeshAllocationEnvelope(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
): MeshAllocationDecision {
  assertRuntime(state, request.receivedAt);
  const context = validateContext(state, request);
  if (context) return reject(state, context);
  if (request.envelope.payload.type === "work.offer")
    return evaluateReceivedOffer(state, request);
  if (request.envelope.payload.type === "work.award")
    return evaluateReceivedAward(state, request);
  if (
    request.envelope.payload.type === "work.accept" ||
    request.envelope.payload.type === "work.decline"
  )
    return evaluateAssignmentResponse(state, request);
  if (
    request.envelope.payload.type === "work.progress" ||
    request.envelope.payload.type === "work.checkpoint" ||
    request.envelope.payload.type === "work.result" ||
    request.envelope.payload.type === "work.release" ||
    request.envelope.payload.type === "work.cancel"
  )
    return evaluateVerifiedMeshExecutionEnvelope(state, request);
  if (request.envelope.payload.type === "lease.renew")
    return evaluateVerifiedMeshLeaseRenewalEnvelope(state, request);
  if (request.envelope.payload.type !== "work.bid")
    return reject(state, "invalid_verified_envelope");
  const envelope = request.envelope as VerifiedMeshEnvelope<WorkBidPayload>;
  const payload = envelope.payload;
  const offer = state.allocation.localOffers[payload.offerId];
  if (!offer) return reject(state, "offer_missing");
  const allocationWork =
    state.allocation.workAllocations[
      workKey(offer.objectiveId, offer.work.workItemId)
    ];
  const reservation = state.allocation.reservations[offer.reservationId];
  const timer = state.coordination.timers[offer.bidDeadlineTimerId];
  if (
    !allocationWork ||
    allocationWork.phase !== "offered" ||
    allocationWork.activeOfferId !== offer.offerId ||
    allocationWork.reservationId !== offer.reservationId ||
    !reservation ||
    reservation.status !== "reserved" ||
    !timer ||
    timer.kind !== "work.bid_deadline" ||
    timer.generation !== offer.bidDeadlineTimerGeneration
  )
    return reject(state, "bid_deadline_elapsed");
  if (
    request.receivedAt >= offer.bidDeadlineAt ||
    compare(request.verifiedAt, offer.bidDeadline) >= 0
  )
    return reject(state, "bid_deadline_elapsed");
  if (
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== state.allocation.identity.peerId ||
    envelope.sender.peerId !== payload.bidderPeerId
  )
    return reject(state, "audience_mismatch");
  const prepared = offer.recipientOffers[payload.bidderPeerId];
  if (!prepared) return reject(state, "bidder_not_recipient");
  if (envelope.causationId !== prepared.messageId)
    return reject(state, "bid_causation_invalid");
  if (
    !matchesOffer(payload, offer) ||
    payload.bidDeadline !== offer.bidDeadline ||
    payload.workDeadline !== offer.work.workDeadline ||
    payload.budgetUnits > reservation.budgetReservationUnits
  )
    return reject(state, "bid_invalid");
  if (
    !hasActiveCapability(
      state,
      offer,
      envelope,
      request.verifiedAt,
      request.receivedAt,
    )
  )
    return reject(state, "bid_invalid");
  const bidExpiresAtLogical = logicalDeadline(
    payload.bidExpiresAt,
    request.verifiedAt,
    request.receivedAt,
  );
  if (
    bidExpiresAtLogical === undefined ||
    bidExpiresAtLogical <= request.receivedAt
  )
    return reject(state, "bid_invalid");
  const key = bidKey(payload.offerId, payload.bidderPeerId);
  const current = state.allocation.bidHeads[key];
  const domainKey = bidDomainKey(payload.bidId);
  const messageDomain = Object.values(state.coordination.domainRecords).find(
    (record) => record.messageId === envelope.messageId,
  );
  if (
    (messageDomain && messageDomain.recordKey !== domainKey) ||
    Object.values(state.allocation.localOffers).some((localOffer) =>
      Object.values(localOffer.recipientOffers).some(
        (recipient) => recipient.messageId === envelope.messageId,
      ),
    )
  )
    return reject(state, "bid_duplicate_conflict");
  const existingDomain = state.coordination.domainRecords[domainKey];
  if (existingDomain)
    return existingDomain.contentDigest === payloadDigest(envelope) &&
      existingDomain.messageId === envelope.messageId
      ? Object.freeze({
          accepted: true,
          duplicate: true,
          state,
          effects: Object.freeze([]),
        })
      : reject(state, "domain_record_conflict");
  if (
    current &&
    (payload.bidRevision !== current.bidRevision + 1 ||
      payload.previousBidId !== current.bidId)
  )
    return reject(state, "bid_predecessor_invalid");
  if (
    !current &&
    (payload.bidRevision !== 1 || payload.previousBidId !== undefined)
  )
    return reject(state, "bid_predecessor_invalid");
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
  if (
    !current &&
    Object.keys(state.allocation.bidHeads).length >=
      state.allocation.limits.maximumBidHeads
  )
    return reject(state, "bid_capacity_exceeded");
  if (
    Object.values(state.allocation.acceptedBidEvidence).filter(
      (entry) => entry.offerId === payload.offerId,
    ).length >= state.allocation.limits.maximumBidsPerOffer
  )
    return reject(state, "bid_capacity_exceeded");
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");
  const evidence: MeshAcceptedBidEvidence = Object.freeze({
    bidId: payload.bidId,
    offerId: payload.offerId,
    bidderPeerId: payload.bidderPeerId,
    bidRevision: payload.bidRevision,
    ...(payload.previousBidId === undefined
      ? {}
      : { previousBidId: payload.previousBidId }),
    acceptedAt: request.receivedAt,
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
  const head: MeshBidHeadProjection = Object.freeze({
    bidKey: key,
    offerId: payload.offerId,
    bidderPeerId: payload.bidderPeerId,
    bidId: payload.bidId,
    bidRevision: payload.bidRevision,
    ...(payload.previousBidId === undefined
      ? {}
      : { previousBidId: payload.previousBidId }),
    acceptedMessageId: envelope.messageId,
    acceptedAt: request.receivedAt,
    capacityReservationUnits: payload.capacityReservationUnits,
    budgetUnits: payload.budgetUnits,
    expectedCompletionAt: payload.expectedCompletionAt,
    bidExpiresAt: payload.bidExpiresAt,
    bidExpiresAtLogical,
  });
  const allocation = restoreMeshAllocationState({
    ...state.allocation,
    bidHeads: createFrozenRecord([
      ...recordEntries(state.allocation.bidHeads).filter(
        ([entry]) => entry !== key,
      ),
      [key, head],
    ]),
    acceptedBidEvidence: createFrozenRecord([
      ...recordEntries(state.allocation.acceptedBidEvidence),
      [payload.bidId, evidence],
    ]),
    lastLogicalTime: request.receivedAt,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const record: MeshCoordinationDomainRecord = Object.freeze({
    recordKey: domainKey,
    recordType: "work.bid",
    recordId: payload.bidId,
    contentDigest: payloadDigest(envelope),
    messageId: envelope.messageId,
    acceptedAt: request.receivedAt,
    objectiveId: payload.objectiveId,
  });
  const coordination = Object.freeze({
    ...state.coordination,
    domainRecords: createFrozenRecord([
      ...recordEntries(state.coordination.domainRecords),
      [domainKey, record],
    ]),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: request.receivedAt,
        kind: "domain.accepted" as const,
        domainRecordKey: domainKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: request.receivedAt,
  });
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: createMeshAllocationRuntimeState(
      coordination,
      Object.freeze({
        ...state.discovery,
        lastLogicalTime: request.receivedAt,
      }),
      Object.freeze({
        ...state.objectives,
        lastLogicalTime: request.receivedAt,
      }),
      allocation,
    ),
    effects: Object.freeze([]),
  });
}

function evaluateReceivedOffer(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
): MeshAllocationDecision {
  const envelope = request.envelope as VerifiedMeshEnvelope<WorkOfferPayload>;
  const payload = envelope.payload;
  const objective = state.objectives.objectives[payload.objectiveId];
  const bidDeadlineAt = logicalDeadline(
    payload.bidDeadline,
    request.verifiedAt,
    request.receivedAt,
  );
  const workDeadlineAt = logicalDeadline(
    payload.workDeadline,
    request.verifiedAt,
    request.receivedAt,
  );
  const signedBidWindow = logicalDeadline(
    payload.bidDeadline,
    envelope.sentAt,
    0,
  );
  if (
    !canonicalDigest(envelope) ||
    !objective ||
    objective.status !== "active" ||
    objective.objectiveDocumentId !== payload.objectiveDocumentId ||
    objective.objectiveRevision !== payload.objectiveRevision ||
    request.receivedAt >= objective.expiresAt ||
    compare(request.verifiedAt, objective.validUntil) >= 0 ||
    !bidDeadlineAt ||
    !workDeadlineAt ||
    !signedBidWindow ||
    bidDeadlineAt <= request.receivedAt ||
    workDeadlineAt <= request.receivedAt ||
    bidDeadlineAt > workDeadlineAt ||
    signedBidWindow > objective.bidWindowMs ||
    workDeadlineAt > objective.expiresAt ||
    compare(payload.workDeadline, objective.validUntil) > 0 ||
    payload.budgetReservationUnits > objective.maximumBudgetUnits ||
    payload.requiredCapabilityKeys.some(
      (key) => !objective.permittedCapabilityKeys.includes(key),
    ) ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== state.allocation.identity.peerId ||
    envelope.sender.peerId !== payload.ownerPeerId ||
    payload.ownerPeerId === state.allocation.identity.peerId
  )
    return reject(state, "received_offer_invalid");
  const existing = state.allocation.receivedOffers[payload.offerId];
  if (existing)
    return sameData(existing.envelope, envelope)
      ? Object.freeze({
          accepted: true,
          duplicate: true,
          state,
          effects: Object.freeze([]),
        })
      : reject(state, "received_offer_duplicate_conflict");
  const priorOffers = Object.values(state.allocation.receivedOffers)
    .filter((offer) => sameReceivedOfferScope(offer.envelope.payload, payload))
    .sort(
      (left, right) =>
        left.envelope.payload.offerAttempt -
        right.envelope.payload.offerAttempt,
    );
  const predecessor = priorOffers.at(-1);
  const predecessorAwards =
    predecessor === undefined
      ? []
      : Object.values(state.allocation.receivedAwards).filter(
          (award) => award.offerId === predecessor.offerId,
        );
  const predecessorIsTerminal = predecessorAwards.some(
    (award) => award.status === "declined" || award.status === "timed_out",
  );
  if (
    payload.offerAttempt !==
      (predecessor?.envelope.payload.offerAttempt ?? 0) + 1 ||
    payload.previousOfferId !== predecessor?.offerId ||
    (predecessor === undefined
      ? envelope.causationId !== undefined
      : envelope.causationId !== predecessor.envelope.messageId) ||
    (predecessor !== undefined &&
      !sameReceivedOfferWorkTerms(predecessor.envelope.payload, payload)) ||
    (predecessor !== undefined &&
      request.receivedAt < predecessor.receivedAt) ||
    predecessorAwards.some(
      (award) =>
        award.status === "awaiting_response" || award.status === "accepted",
    ) ||
    (predecessor !== undefined &&
      !predecessorIsTerminal &&
      request.receivedAt < predecessor.bidDeadlineAt)
  )
    return reject(state, "received_offer_invalid");
  const domainKey = offerDomainKey(payload.offerId);
  if (
    messageAlreadyRetained(state, envelope.messageId) ||
    state.coordination.domainRecords[domainKey]
  )
    return reject(state, "received_offer_duplicate_conflict");
  if (
    Object.keys(state.allocation.receivedOffers).length >=
    state.allocation.limits.maximumReceivedOffers
  )
    return reject(state, "received_offer_capacity_exceeded");
  const capacity = allocationWriteCapacity(state);
  if (capacity) return reject(state, capacity);
  const offer: MeshReceivedOfferProjection = Object.freeze({
    offerId: payload.offerId,
    receivedAt: request.receivedAt,
    validityVerifiedAt: request.verifiedAt,
    ...(request.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...request.supportedCriticalExtensions,
          ]),
        }),
    bidDeadlineAt,
    workDeadlineAt,
    envelope,
  });
  return acceptAssigneeWrite(
    state,
    request.receivedAt,
    domainKey,
    "work.offer",
    payload.offerId,
    payload.objectiveId,
    envelope,
    {
      ...state.allocation,
      receivedOffers: createFrozenRecord([
        ...recordEntries(state.allocation.receivedOffers),
        [payload.offerId, offer],
      ]),
      lastLogicalTime: request.receivedAt,
    },
  );
}

function evaluateReceivedAward(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
): MeshAllocationDecision {
  const envelope = request.envelope as VerifiedMeshEnvelope<WorkAwardPayload>;
  const payload = envelope.payload;
  const offer = state.allocation.receivedOffers[payload.offerId];
  const bid = state.allocation.localBids[payload.bidId];
  if (!offer || !bid || bid.offerId !== offer.offerId)
    return reject(state, "received_award_invalid");
  const currentBid = Object.values(state.allocation.localBids)
    .filter((candidate) => candidate.offerId === offer.offerId)
    .sort((left, right) => left.bidRevision - right.bidRevision)
    .at(-1);
  if (!currentBid || currentBid.bidId !== bid.bidId)
    return reject(state, "received_award_invalid");
  const objective = state.objectives.objectives[payload.objectiveId];
  const acceptanceDeadlineAt = logicalDeadline(
    payload.acceptanceDeadline,
    request.verifiedAt,
    request.receivedAt,
  );
  const leaseExpiresAtLogical = logicalDeadline(
    payload.leaseExpiresAt,
    request.verifiedAt,
    request.receivedAt,
  );
  const signedAcceptanceDuration = logicalDeadline(
    payload.acceptanceDeadline,
    envelope.sentAt,
    0,
  );
  const signedLeaseDuration = logicalDeadline(
    payload.leaseExpiresAt,
    payload.leaseStartsAt,
    0,
  );
  if (
    !canonicalDigest(envelope) ||
    !objective ||
    objective.status !== "active" ||
    objective.objectiveDocumentId !== payload.objectiveDocumentId ||
    objective.objectiveRevision !== payload.objectiveRevision ||
    request.receivedAt >= objective.expiresAt ||
    compare(request.verifiedAt, objective.validUntil) >= 0 ||
    !acceptanceDeadlineAt ||
    !leaseExpiresAtLogical ||
    !signedAcceptanceDuration ||
    !signedLeaseDuration ||
    acceptanceDeadlineAt <= request.receivedAt ||
    leaseExpiresAtLogical <= request.receivedAt ||
    request.receivedAt >= bid.bidExpiresAtLogical ||
    compare(request.verifiedAt, bid.bidExpiresAt) >= 0 ||
    signedAcceptanceDuration > objective.acceptanceWindowMs ||
    signedLeaseDuration > objective.maximumLeaseDurationMs ||
    leaseExpiresAtLogical > offer.workDeadlineAt ||
    leaseExpiresAtLogical > objective.expiresAt ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== state.allocation.identity.peerId ||
    envelope.sender.peerId !== offer.envelope.sender.peerId ||
    envelope.causationId !== bid.envelope.messageId ||
    payload.assigneePeerId !== state.allocation.identity.peerId ||
    payload.assignmentEpoch !== 1 ||
    payload.authorityKind !== "award" ||
    payload.assignmentAuthorityId !== payload.awardId ||
    payload.fencingToken !== payload.awardId ||
    payload.bidId !== bid.bidId ||
    payload.bidRevision !== bid.bidRevision ||
    !matchesAwardOffer(payload, offer)
  )
    return reject(state, "received_award_invalid");
  const conflictingScopeAward = Object.values(
    state.allocation.receivedAwards,
  ).find(
    (award) =>
      award.envelope.payload.objectiveId === payload.objectiveId &&
      award.envelope.payload.workItemId === payload.workItemId &&
      award.envelope.payload.workItemRevision === payload.workItemRevision &&
      award.envelope.payload.assignmentEpoch === payload.assignmentEpoch &&
      award.awardId !== payload.awardId,
  );
  if (conflictingScopeAward)
    return reject(state, "received_award_duplicate_conflict");
  const existing = state.allocation.receivedAwards[payload.awardId];
  if (existing)
    return sameData(existing.envelope, envelope)
      ? Object.freeze({
          accepted: true,
          duplicate: true,
          state,
          effects: Object.freeze([]),
        })
      : reject(state, "received_award_duplicate_conflict");
  const domainKey = awardDomainKey(payload.awardId);
  if (
    messageAlreadyRetained(state, envelope.messageId) ||
    state.coordination.domainRecords[domainKey]
  )
    return reject(state, "received_award_duplicate_conflict");
  if (
    Object.keys(state.allocation.receivedAwards).length >=
    state.allocation.limits.maximumReceivedAwards
  )
    return reject(state, "received_award_capacity_exceeded");
  const award: MeshReceivedAwardProjection = Object.freeze({
    awardId: payload.awardId,
    offerId: payload.offerId,
    bidId: payload.bidId,
    bidRevision: payload.bidRevision,
    receivedAt: request.receivedAt,
    validityVerifiedAt: request.verifiedAt,
    ...(request.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...request.supportedCriticalExtensions,
          ]),
        }),
    acceptanceDeadlineAt,
    acceptanceDeadlineTimerId: `allocation.assignee_response.${payload.awardId}`,
    acceptanceDeadlineTimerGeneration: 1,
    leaseExpiresAtLogical,
    status: "awaiting_response",
    envelope,
  });
  const timerId = `allocation.assignee_response.${payload.awardId}`;
  if (state.coordination.timers[timerId])
    return reject(state, "timer_id_conflict");
  const capacity = allocationWriteCapacity(state, true);
  if (capacity) return reject(state, capacity);
  return acceptAssigneeWrite(
    state,
    request.receivedAt,
    domainKey,
    "work.award",
    payload.awardId,
    payload.objectiveId,
    envelope,
    {
      ...state.allocation,
      receivedAwards: createFrozenRecord([
        ...recordEntries(state.allocation.receivedAwards),
        [payload.awardId, award],
      ]),
      lastLogicalTime: request.receivedAt,
    },
    undefined,
    Object.freeze({
      timerId,
      kind: "work.acceptance_deadline" as const,
      dueAt: acceptanceDeadlineAt,
      generation: 1,
      domainRecordKey: domainKey,
    }),
  );
}

function evaluateAssignmentResponse(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
): MeshAllocationDecision {
  const envelope = request.envelope as VerifiedMeshEnvelope<
    WorkAcceptPayload | WorkDeclinePayload
  >;
  const payload = envelope.payload;
  const award = state.allocation.localAwards[payload.awardId];
  if (!award) return reject(state, "award_missing");
  const responseId =
    payload.type === "work.accept" ? payload.acceptanceId : payload.declineId;
  const kind = payload.type;
  const existingResponse = state.allocation.assignmentResponses[award.awardId];
  if (existingResponse)
    return sameData(existingResponse.envelope, envelope)
      ? Object.freeze({
          accepted: true,
          duplicate: true,
          state,
          effects: Object.freeze([]),
        })
      : reject(state, "assignment_response_duplicate_conflict");
  const work =
    state.allocation.workAllocations[
      workKey(award.objectiveId, award.work.workItemId)
    ];
  const reservation = state.allocation.reservations[award.reservationId];
  const timer = state.coordination.timers[award.acceptanceDeadlineTimerId];
  const objective = state.objectives.objectives[award.objectiveId];
  if (
    request.receivedAt >= award.acceptanceDeadlineAt ||
    compare(request.verifiedAt, award.acceptanceDeadline) >= 0 ||
    award.status === "timed_out"
  )
    return reject(state, "assignment_response_deadline_elapsed");
  if (
    !work ||
    !reservation ||
    !timer ||
    !objective ||
    objective.status !== "active" ||
    request.receivedAt >= award.objectivePolicy.expiresAt ||
    compare(request.verifiedAt, award.objectivePolicy.validUntil) >= 0 ||
    award.status !== "awaiting_acceptance" ||
    work.phase !== "award_pending" ||
    work.activeAwardId !== award.awardId ||
    reservation.status !== "reserved" ||
    timer.kind !== "work.acceptance_deadline" ||
    timer.generation !== award.acceptanceDeadlineTimerGeneration ||
    timer.dueAt !== award.acceptanceDeadlineAt ||
    timer.domainRecordKey !== awardDomainKey(award.awardId) ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== state.allocation.identity.peerId ||
    envelope.sender.peerId !== award.assigneePeerId ||
    envelope.causationId !== award.recipientAward.messageId ||
    payload.objectiveId !== award.objectiveId ||
    payload.objectiveDocumentId !== award.objectiveDocumentId ||
    payload.objectiveRevision !== award.objectiveRevision ||
    payload.workItemId !== award.work.workItemId ||
    payload.workItemRevision !== award.work.workItemRevision ||
    payload.ownerPeerId !== state.allocation.identity.peerId ||
    payload.ownerEpoch !== 1 ||
    payload.assigneePeerId !== award.assigneePeerId ||
    payload.assignmentEpoch !== award.assignmentEpoch ||
    payload.assignmentAuthorityId !== award.assignmentAuthorityId ||
    payload.fencingToken !== award.fencingToken ||
    payload.acceptanceDeadline !== award.acceptanceDeadline ||
    objective.reservedBudgetUnits < reservation.budgetReservationUnits ||
    (payload.type === "work.accept" &&
      objective.committedBudgetUnits >
        Number.MAX_SAFE_INTEGER - reservation.budgetReservationUnits)
  )
    return reject(state, "assignment_response_invalid");
  const domainKey = JSON.stringify([kind, responseId]);
  if (
    Object.values(state.coordination.domainRecords).some(
      (record) => record.messageId === envelope.messageId,
    ) ||
    Object.values(state.allocation.localOffers).some((entry) =>
      Object.values(entry.recipientOffers).some(
        (prepared) => prepared.messageId === envelope.messageId,
      ),
    ) ||
    Object.values(state.allocation.acceptedBidEvidence).some(
      (entry) => entry.envelope.messageId === envelope.messageId,
    ) ||
    Object.values(state.allocation.localAwards).some(
      (entry) => entry.recipientAward.messageId === envelope.messageId,
    )
  )
    return reject(state, "assignment_response_duplicate_conflict");
  if (state.coordination.domainRecords[domainKey])
    return reject(state, "domain_record_conflict");
  if (
    Object.keys(state.allocation.assignmentResponses).length >=
    state.allocation.limits.maximumAssignmentResponses
  )
    return reject(state, "assignment_response_capacity_exceeded");
  if (
    kind === "work.accept" &&
    Object.keys(state.allocation.leaseHeads).length >=
      state.allocation.limits.maximumExecutionHeads
  )
    return reject(state, "execution_head_capacity_exceeded");
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
  const evidence: MeshAcceptedAssignmentResponseEvidence = Object.freeze({
    awardId: award.awardId,
    responseId,
    kind,
    acceptedAt: request.receivedAt,
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
  const accepted = kind === "work.accept";
  const leaseActivation = accepted
    ? createInitialLeaseActivation({
        objectiveId: award.objectiveId,
        objectiveDocumentId: award.objectiveDocumentId,
        objectiveRevision: award.objectiveRevision,
        workItemId: award.work.workItemId,
        workItemRevision: award.work.workItemRevision,
        ownerPeerId: award.work.ownerPeerId,
        ownerEpoch: award.work.ownerEpoch,
        assigneePeerId: award.assigneePeerId,
        awardId: award.awardId,
        assignmentEpoch: award.assignmentEpoch,
        assignmentAuthorityId: award.assignmentAuthorityId,
        fencingToken: award.fencingToken,
        acceptanceId: responseId,
        acceptanceMessageId: evidence.envelope.messageId,
        workDeadline: award.workDeadline,
        workDeadlineAt: award.work.workDeadlineAt,
        leaseExpiresAt: award.leaseExpiresAt,
        leaseExpiresAtLogical: award.leaseExpiresAtLogical,
      })
    : undefined;
  if (
    leaseActivation !== undefined &&
    state.coordination.timers[leaseActivation.timer.timerId] !== undefined
  )
    return reject(state, "timer_id_conflict");
  const nextWork = Object.freeze({
    ...work,
    phase: accepted ? ("active" as const) : ("ready" as const),
    activeAwardId: accepted ? award.awardId : undefined,
    activeAcceptanceId: accepted ? responseId : undefined,
    reservationId: accepted ? reservation.reservationId : undefined,
    updatedAt: request.receivedAt,
  });
  const nextReservation = Object.freeze({
    ...reservation,
    status: accepted ? ("committed" as const) : ("released" as const),
    ...(accepted
      ? { committedAt: request.receivedAt }
      : { releasedAt: request.receivedAt }),
  });
  const allocation = restoreMeshAllocationState({
    ...state.allocation,
    workAllocations: createFrozenRecord([
      ...recordEntries(state.allocation.workAllocations).filter(
        ([key]) => key !== work.workKey,
      ),
      [work.workKey, nextWork],
    ]),
    localAwards: createFrozenRecord([
      ...recordEntries(state.allocation.localAwards).filter(
        ([key]) => key !== award.awardId,
      ),
      [
        award.awardId,
        Object.freeze({
          ...award,
          status: accepted ? ("accepted" as const) : ("declined" as const),
        }),
      ],
    ]),
    assignmentResponses: createFrozenRecord([
      ...recordEntries(state.allocation.assignmentResponses),
      [award.awardId, evidence],
    ]),
    leaseHeads: createFrozenRecord(
      leaseActivation === undefined
        ? recordEntries(state.allocation.leaseHeads)
        : [
            ...recordEntries(state.allocation.leaseHeads),
            [leaseActivation.head.executionScopeKey, leaseActivation.head],
          ],
    ),
    reservations: createFrozenRecord([
      ...recordEntries(state.allocation.reservations).filter(
        ([key]) => key !== reservation.reservationId,
      ),
      [reservation.reservationId, nextReservation],
    ]),
    lastLogicalTime: request.receivedAt,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...state.coordination,
    domainRecords: createFrozenRecord([
      ...recordEntries(state.coordination.domainRecords),
      [
        domainKey,
        Object.freeze({
          recordKey: domainKey,
          recordType: kind,
          recordId: responseId,
          contentDigest: payloadDigest(envelope),
          messageId: envelope.messageId,
          acceptedAt: request.receivedAt,
          objectiveId: payload.objectiveId,
        }),
      ],
    ]),
    timers: createFrozenRecord([
      ...recordEntries(state.coordination.timers).filter(
        ([key]) => key !== timer.timerId,
      ),
      ...(leaseActivation === undefined
        ? []
        : [[leaseActivation.timer.timerId, leaseActivation.timer] as const]),
    ]),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: request.receivedAt,
        kind: "domain.accepted" as const,
        domainRecordKey: domainKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: request.receivedAt,
  });
  const objectives = Object.freeze({
    ...state.objectives,
    objectives: createFrozenRecord([
      ...recordEntries(state.objectives.objectives).filter(
        ([key]) => key !== objective.objectiveId,
      ),
      [
        objective.objectiveId,
        Object.freeze({
          ...objective,
          reservedBudgetUnits:
            objective.reservedBudgetUnits - reservation.budgetReservationUnits,
          committedBudgetUnits:
            objective.committedBudgetUnits +
            (accepted ? reservation.budgetReservationUnits : 0),
        }),
      ],
    ]),
    lastLogicalTime: request.receivedAt,
  });
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: createMeshAllocationRuntimeState(
      coordination,
      Object.freeze({
        ...state.discovery,
        lastLogicalTime: request.receivedAt,
      }),
      objectives,
      allocation,
    ),
    effects: Object.freeze([]),
  });
}

/** Selects a currently valid bid deterministically while the window is open. */
export function selectMeshAllocationBid(
  state: MeshAllocationRuntimeState,
  input: MeshAllocationSelectionInput,
): MeshAllocationBidSelection {
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).sort().join(",") !== "evaluatedAt,offerId" ||
    typeof input.offerId !== "string" ||
    !Number.isSafeInteger(input.evaluatedAt) ||
    input.evaluatedAt < 0
  )
    throw new TypeError("Invalid Mesh allocation selection input");
  assertRuntime(state, input.evaluatedAt);
  const offer = state.allocation.localOffers[input.offerId];
  if (!offer)
    return Object.freeze({
      offerId: input.offerId,
      evaluatedAt: input.evaluatedAt,
      reason: "offer_missing",
    });
  const allocationWork =
    state.allocation.workAllocations[
      workKey(offer.objectiveId, offer.work.workItemId)
    ];
  if (
    allocationWork?.phase !== "offered" ||
    allocationWork.activeOfferId !== offer.offerId ||
    state.allocation.reservations[offer.reservationId]?.status !== "reserved"
  ) {
    return Object.freeze({
      offerId: input.offerId,
      evaluatedAt: input.evaluatedAt,
      reason: "offer_closed",
    });
  }
  if (input.evaluatedAt >= offer.bidDeadlineAt)
    return Object.freeze({
      offerId: input.offerId,
      evaluatedAt: input.evaluatedAt,
      reason: "bid_window_closed",
    });
  const eligible = Object.values(state.allocation.bidHeads).filter((bid) => {
    if (bid.offerId !== input.offerId) return false;
    const evidence = state.allocation.acceptedBidEvidence[bid.bidId];
    if (!evidence) return false;
    return (
      bid.bidExpiresAtLogical > input.evaluatedAt &&
      bid.budgetUnits <=
        (state.allocation.reservations[offer.reservationId]
          ?.budgetReservationUnits ?? -1) &&
      hasEligibleCapabilityAt(
        state,
        offer,
        evidence.envelope,
        input.evaluatedAt,
      )
    );
  });
  if (!eligible.length)
    return Object.freeze({
      offerId: input.offerId,
      evaluatedAt: input.evaluatedAt,
      reason: "no_eligible_bids",
    });
  eligible.sort(
    (a, b) =>
      a.budgetUnits - b.budgetUnits ||
      compare(a.expectedCompletionAt, b.expectedCompletionAt) ||
      utf16(a.bidderPeerId, b.bidderPeerId) ||
      utf16(a.bidId, b.bidId),
  );
  return Object.freeze({
    offerId: input.offerId,
    evaluatedAt: input.evaluatedAt,
    reason: "selected",
    bid: eligible[0],
  });
}

/** Applies a due bid or acceptance deadline exactly once. */
export function evaluateMeshAllocationTimer(
  state: MeshAllocationRuntimeState,
  input: MeshAllocationTimerInput,
  logicalTime: number,
): MeshAllocationTimerDecision {
  assertRuntime(state, logicalTime);
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).length !== 3 ||
    input.kind !== "timer.fired" ||
    typeof input.timerId !== "string" ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1
  )
    throw new TypeError("Invalid Mesh allocation timer input");
  const timer = state.coordination.timers[input.timerId];
  if (!timer)
    return Object.freeze({ accepted: false, code: "timer_unknown", state });
  if (timer.generation !== input.generation)
    return Object.freeze({
      accepted: false,
      code: "timer_generation_stale",
      state,
    });
  if (logicalTime < timer.dueAt)
    return Object.freeze({ accepted: false, code: "timer_not_due", state });
  if (timer.kind === "lease.expiry")
    return evaluateMeshLeaseExpiryTimer(state, input, logicalTime);
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  )
    return Object.freeze({
      accepted: false,
      code: "journal_capacity_exceeded",
      state,
    });
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");
  if (
    timer.kind === "work.acceptance_deadline" &&
    Object.values(state.allocation.receivedAwards).some(
      (award) =>
        award.status === "awaiting_response" &&
        award.acceptanceDeadlineTimerId === timer.timerId &&
        award.acceptanceDeadlineTimerGeneration === timer.generation,
    )
  )
    return evaluateAssigneeAcceptanceDeadline(state, timer, logicalTime);
  if (timer.kind === "work.acceptance_deadline")
    return evaluateAcceptanceDeadline(state, timer, logicalTime);
  if (timer.kind !== "work.bid_deadline")
    throw new TypeError("Mesh allocation timer binding is invalid");
  const offer = Object.values(state.allocation.localOffers).find(
    (entry) =>
      entry.bidDeadlineTimerId === timer.timerId &&
      entry.bidDeadlineTimerGeneration === timer.generation,
  );
  if (!offer) throw new TypeError("Mesh allocation timer is orphaned");
  const allocationWork =
    state.allocation.workAllocations[
      workKey(offer.objectiveId, offer.work.workItemId)
    ];
  const reservation = state.allocation.reservations[offer.reservationId];
  const objective = state.objectives.objectives[offer.objectiveId];
  if (
    !allocationWork ||
    !reservation ||
    reservation.status !== "reserved" ||
    !objective ||
    objective.reservedBudgetUnits < reservation.budgetReservationUnits
  )
    throw new TypeError("Mesh allocation deadline binding is invalid");
  const ready = Object.freeze({
    ...allocationWork,
    phase: "ready" as const,
    activeOfferId: undefined,
    bidDeadlineAt: undefined,
    reservationId: undefined,
    updatedAt: logicalTime,
  });
  const allocation = restoreMeshAllocationState({
    ...state.allocation,
    workAllocations: createFrozenRecord([
      ...recordEntries(state.allocation.workAllocations).filter(
        ([key]) => key !== ready.workKey,
      ),
      [ready.workKey, ready],
    ]),
    reservations: createFrozenRecord([
      ...recordEntries(state.allocation.reservations).filter(
        ([key]) => key !== reservation.reservationId,
      ),
      [
        reservation.reservationId,
        Object.freeze({
          ...reservation,
          status: "released" as const,
          releasedAt: logicalTime,
        }),
      ],
    ]),
    lastLogicalTime: logicalTime,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...state.coordination,
    timers: createFrozenRecord(
      recordEntries(state.coordination.timers).filter(
        ([key]) => key !== timer.timerId,
      ),
    ),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: logicalTime,
        kind: "timer.fired" as const,
        timerId: timer.timerId,
        domainRecordKey: timer.domainRecordKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  const objectives = Object.freeze({
    ...state.objectives,
    objectives: createFrozenRecord([
      ...recordEntries(state.objectives.objectives).filter(
        ([key]) => key !== objective.objectiveId,
      ),
      [
        objective.objectiveId,
        Object.freeze({
          ...objective,
          reservedBudgetUnits:
            objective.reservedBudgetUnits - reservation.budgetReservationUnits,
        }),
      ],
    ]),
    lastLogicalTime: logicalTime,
  });
  return Object.freeze({
    accepted: true,
    timer,
    state: createMeshAllocationRuntimeState(
      coordination,
      Object.freeze({ ...state.discovery, lastLogicalTime: logicalTime }),
      objectives,
      allocation,
    ),
  });
}

function evaluateAssigneeAcceptanceDeadline(
  state: MeshAllocationRuntimeState,
  timer: MeshCoordinationTimer,
  logicalTime: number,
): MeshAllocationTimerDecision {
  const award = Object.values(state.allocation.receivedAwards).find(
    (entry) =>
      entry.status === "awaiting_response" &&
      entry.acceptanceDeadlineTimerId === timer.timerId &&
      entry.acceptanceDeadlineTimerGeneration === timer.generation,
  );
  if (!award) throw new TypeError("Mesh assignee acceptance timer is orphaned");
  if (
    timer.kind !== "work.acceptance_deadline" ||
    timer.dueAt !== award.acceptanceDeadlineAt ||
    timer.domainRecordKey !== awardDomainKey(award.awardId)
  )
    throw new TypeError("Mesh assignee acceptance timer binding is invalid");
  const allocation = restoreMeshAllocationState({
    ...state.allocation,
    receivedAwards: createFrozenRecord([
      ...recordEntries(state.allocation.receivedAwards).filter(
        ([key]) => key !== award.awardId,
      ),
      [
        award.awardId,
        Object.freeze({ ...award, status: "timed_out" as const }),
      ],
    ]),
    lastLogicalTime: logicalTime,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...state.coordination,
    timers: createFrozenRecord(
      recordEntries(state.coordination.timers).filter(
        ([key]) => key !== timer.timerId,
      ),
    ),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: logicalTime,
        kind: "timer.fired" as const,
        timerId: timer.timerId,
        domainRecordKey: timer.domainRecordKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  return Object.freeze({
    accepted: true,
    timer,
    state: createMeshAllocationRuntimeState(
      coordination,
      Object.freeze({ ...state.discovery, lastLogicalTime: logicalTime }),
      Object.freeze({ ...state.objectives, lastLogicalTime: logicalTime }),
      allocation,
    ),
  });
}

function evaluateAcceptanceDeadline(
  state: MeshAllocationRuntimeState,
  timer: MeshCoordinationTimer,
  logicalTime: number,
): MeshAllocationTimerDecision {
  const award = Object.values(state.allocation.localAwards).find(
    (entry) =>
      entry.acceptanceDeadlineTimerId === timer.timerId &&
      entry.acceptanceDeadlineTimerGeneration === timer.generation,
  );
  if (!award) throw new TypeError("Mesh acceptance timer is orphaned");
  const work =
    state.allocation.workAllocations[
      workKey(award.objectiveId, award.work.workItemId)
    ];
  const reservation = state.allocation.reservations[award.reservationId];
  const objective = state.objectives.objectives[award.objectiveId];
  if (
    !work ||
    !reservation ||
    !objective ||
    award.status !== "awaiting_acceptance" ||
    work.phase !== "award_pending" ||
    reservation.status !== "reserved" ||
    objective.reservedBudgetUnits < reservation.budgetReservationUnits
  )
    throw new TypeError("Mesh acceptance deadline binding is invalid");
  const allocation = restoreMeshAllocationState({
    ...state.allocation,
    workAllocations: createFrozenRecord([
      ...recordEntries(state.allocation.workAllocations).filter(
        ([key]) => key !== work.workKey,
      ),
      [
        work.workKey,
        Object.freeze({
          ...work,
          phase: "ready" as const,
          activeAwardId: undefined,
          reservationId: undefined,
          updatedAt: logicalTime,
        }),
      ],
    ]),
    localAwards: createFrozenRecord([
      ...recordEntries(state.allocation.localAwards).filter(
        ([key]) => key !== award.awardId,
      ),
      [
        award.awardId,
        Object.freeze({ ...award, status: "timed_out" as const }),
      ],
    ]),
    reservations: createFrozenRecord([
      ...recordEntries(state.allocation.reservations).filter(
        ([key]) => key !== reservation.reservationId,
      ),
      [
        reservation.reservationId,
        Object.freeze({
          ...reservation,
          status: "released" as const,
          releasedAt: logicalTime,
        }),
      ],
    ]),
    lastLogicalTime: logicalTime,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...state.coordination,
    timers: createFrozenRecord(
      recordEntries(state.coordination.timers).filter(
        ([key]) => key !== timer.timerId,
      ),
    ),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: logicalTime,
        kind: "timer.fired" as const,
        timerId: timer.timerId,
        domainRecordKey: timer.domainRecordKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  const objectives = Object.freeze({
    ...state.objectives,
    objectives: createFrozenRecord([
      ...recordEntries(state.objectives.objectives).filter(
        ([key]) => key !== objective.objectiveId,
      ),
      [
        objective.objectiveId,
        Object.freeze({
          ...objective,
          reservedBudgetUnits:
            objective.reservedBudgetUnits - reservation.budgetReservationUnits,
        }),
      ],
    ]),
    lastLogicalTime: logicalTime,
  });
  return Object.freeze({
    accepted: true,
    timer,
    state: createMeshAllocationRuntimeState(
      coordination,
      Object.freeze({ ...state.discovery, lastLogicalTime: logicalTime }),
      objectives,
      allocation,
    ),
  });
}

function validatePrepared(
  recipients: readonly {
    readonly recipientPeerId: string;
    readonly preparedAt: number;
    readonly envelope: SignedMeshEnvelope<WorkOfferPayload>;
  }[],
  state: MeshAllocationRuntimeState,
  work: MeshWorkAllocationProjection["work"],
  verifiedAt: string,
  receivedAt: number,
  previousOffer?: MeshLocalOfferProjection,
):
  | {
      readonly payload: WorkOfferPayload;
      readonly entries: readonly {
        readonly recipientPeerId: string;
        readonly preparedAt: number;
        readonly envelope: SignedMeshEnvelope<WorkOfferPayload>;
      }[];
      readonly bidDeadlineAt: number;
    }
  | { readonly code: MeshAllocationRejectionCode } {
  if (
    !Array.isArray(recipients) ||
    !recipients.length ||
    recipients.length > state.allocation.limits.maximumRecipientsPerOffer
  )
    return { code: "recipient_capacity_exceeded" };
  const first = recipients[0]?.envelope;
  const parsed = first && validateSignedMeshEnvelope(first);
  if (!parsed?.ok || parsed.value.payload.type !== "work.offer")
    return { code: "offer_invalid" };
  const payload = parsed.value.payload as WorkOfferPayload;
  const bidDeadlineAt = logicalDeadline(
    payload.bidDeadline,
    verifiedAt,
    receivedAt,
  );
  if (bidDeadlineAt === undefined) return { code: "offer_invalid" };
  const matches = matchMeshDiscoveryCapabilities(
    createMeshDiscoveryRuntimeState(state.coordination, state.discovery),
    {
      capabilityKeys: work.requiredCapabilityKeys,
      attributes: work.matchingAttributes,
      fanout: Math.min(
        state.allocation.limits.maximumRecipientsPerOffer,
        state.discovery.limits.maximumFanout,
      ),
    },
    receivedAt,
  ).matches.map((match) => match.peerId);
  const ids = recipients.map((item) => item.recipientPeerId);
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== matches.length ||
    ids.some((id, index) => id !== matches[index])
  )
    return { code: "offer_invalid" };
  const entries: {
    readonly recipientPeerId: string;
    readonly preparedAt: number;
    readonly envelope: SignedMeshEnvelope<WorkOfferPayload>;
  }[] = [];
  const retainedMessageIds = new Set([
    ...Object.values(state.coordination.domainRecords).map(
      (record) => record.messageId,
    ),
    ...Object.values(state.allocation.localOffers).flatMap((offer) =>
      Object.values(offer.recipientOffers).map(
        (recipient) => recipient.messageId,
      ),
    ),
    ...Object.values(state.allocation.acceptedBidEvidence).map(
      (evidence) => evidence.envelope.messageId,
    ),
  ]);
  const preparedMessageIds = new Set<string>();
  for (const item of recipients) {
    const result = validateMeshEnvelopeContext(item.envelope, {
      tenantId: state.allocation.identity.tenantId,
      meshId: state.allocation.identity.meshId,
      peerId: item.recipientPeerId,
      receivedAt: verifiedAt,
    });
    if (
      !result.ok ||
      result.value.payload.type !== "work.offer" ||
      item.preparedAt !== receivedAt ||
      result.value.sender.peerId !== state.allocation.identity.peerId ||
      result.value.sender.instanceId !== state.allocation.identity.instanceId ||
      result.value.proof.keyId !== state.allocation.identity.keyId ||
      result.value.audience.kind !== "peer" ||
      result.value.audience.peerId !== item.recipientPeerId ||
      (payload.offerAttempt === 1
        ? result.value.causationId !== undefined
        : result.value.causationId !==
          previousOffer?.recipientOffers[item.recipientPeerId]?.messageId) ||
      !samePayload(result.value.payload, payload) ||
      !canonicalDigest(result.value as SignedMeshEnvelope<WorkOfferPayload>)
    )
      return { code: "offer_invalid" };
    if (
      retainedMessageIds.has(result.value.messageId) ||
      preparedMessageIds.has(result.value.messageId)
    )
      return { code: "offer_duplicate_conflict" };
    preparedMessageIds.add(result.value.messageId);
    entries.push({
      recipientPeerId: item.recipientPeerId,
      preparedAt: item.preparedAt,
      envelope: result.value as SignedMeshEnvelope<WorkOfferPayload>,
    });
  }
  return { payload, entries: Object.freeze(entries), bidDeadlineAt };
}

function validateContext(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
): MeshAllocationRejectionCode | undefined {
  if (
    !request ||
    typeof request !== "object" ||
    !request.envelope ||
    typeof request.verifiedAt !== "string" ||
    !Number.isSafeInteger(request.receivedAt) ||
    request.receivedAt < 0 ||
    Object.keys(request).some(
      (key) =>
        key !== "envelope" &&
        key !== "verifiedAt" &&
        key !== "receivedAt" &&
        key !== "supportedCriticalExtensions",
    ) ||
    (request.supportedCriticalExtensions !== undefined &&
      (!Array.isArray(request.supportedCriticalExtensions) ||
        request.supportedCriticalExtensions.some(
          (value) => typeof value !== "string" || !value,
        ) ||
        new Set(request.supportedCriticalExtensions).size !==
          request.supportedCriticalExtensions.length))
  )
    throw new TypeError("Invalid Mesh verified allocation request");
  const result = validateMeshEnvelopeContext(request.envelope, {
    tenantId: state.allocation.identity.tenantId,
    meshId: state.allocation.identity.meshId,
    peerId: state.allocation.identity.peerId,
    receivedAt: request.verifiedAt,
    subscribedTopics: state.discovery.subscriptions,
    ...(request.supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions: request.supportedCriticalExtensions }),
  });
  if (!result.ok) {
    const code = result.issues[0]?.code;
    return code === "scope_mismatch"
      ? "scope_mismatch"
      : code === "message_expired"
        ? "message_expired"
        : code === "message_from_future"
          ? "message_from_future"
          : code === "unknown_critical_extension"
            ? "unknown_critical_extension"
            : code === "invalid_audience"
              ? "audience_mismatch"
              : "invalid_verified_envelope";
  }
  const admission =
    state.discovery.admittedPeers[request.envelope.sender.peerId];
  if (!admission) return "sender_not_admitted";
  if (!admission.instanceIds.includes(request.envelope.sender.instanceId))
    return "sender_instance_not_admitted";
  return compare(request.verifiedAt, admission.validUntil) >= 0
    ? "sender_admission_expired"
    : undefined;
}

function matchesOffer(
  bid: WorkBidPayload,
  offer: MeshLocalOfferProjection,
): boolean {
  const work = offer.work;
  return (
    bid.offerId === offer.offerId &&
    bid.objectiveId === offer.objectiveId &&
    bid.objectiveDocumentId === offer.objectiveDocumentId &&
    bid.objectiveRevision === offer.objectiveRevision &&
    bid.workItemId === work.workItemId &&
    bid.workItemRevision === work.workItemRevision &&
    bid.ownerPeerId === work.ownerPeerId &&
    bid.ownerEpoch === work.ownerEpoch &&
    bid.offerAttempt === offer.offerAttempt
  );
}
function hasActiveCapability(
  state: MeshAllocationRuntimeState,
  offer: MeshLocalOfferProjection,
  envelope: VerifiedMeshEnvelope<WorkBidPayload>,
  verifiedAt: string,
  logicalTime: number,
): boolean {
  const capability =
    state.discovery.capabilities[
      JSON.stringify([
        envelope.payload.bidderPeerId,
        envelope.payload.capabilityId,
      ])
    ];
  return (
    capability !== undefined &&
    compare(verifiedAt, capability.validUntil) < 0 &&
    hasEligibleCapabilityAt(state, offer, envelope, logicalTime)
  );
}

function hasEligibleCapabilityAt(
  state: MeshAllocationRuntimeState,
  offer: MeshLocalOfferProjection,
  envelope: SignedMeshEnvelope<WorkBidPayload>,
  logicalTime: number,
): boolean {
  const payload = envelope.payload;
  const capability =
    state.discovery.capabilities[
      JSON.stringify([payload.bidderPeerId, payload.capabilityId])
    ];
  const card = state.discovery.peerCards[payload.bidderPeerId];
  if (
    !capability ||
    capability.status !== "active" ||
    capability.ownerPeerId !== payload.bidderPeerId ||
    capability.instanceId !== envelope.sender.instanceId ||
    capability.advertisementId !== payload.advertisementId ||
    capability.capabilityRevision !== payload.capabilityRevision ||
    capability.expiresAt <= logicalTime ||
    !offer.work.requiredCapabilityKeys.includes(capability.capabilityKey) ||
    !Object.entries(offer.work.matchingAttributes).every(
      ([key, value]) => capability.attributes[key] === value,
    ) ||
    !card ||
    card.status !== "active" ||
    card.instanceId !== envelope.sender.instanceId ||
    card.expiresAt <= logicalTime
  ) {
    return false;
  }
  const result = matchMeshDiscoveryCapabilities(
    createMeshDiscoveryRuntimeState(state.coordination, state.discovery),
    {
      capabilityKeys: offer.work.requiredCapabilityKeys,
      attributes: offer.work.matchingAttributes,
      fanout: state.discovery.limits.maximumFanout,
    },
    logicalTime,
  );
  const evaluation = result.evaluations.find(
    (entry) => entry.peerId === payload.bidderPeerId,
  );
  return (
    evaluation?.reason === "eligible" || evaluation?.reason === "fanout_limited"
  );
}

function matchesReceivedOffer(
  bid: WorkBidPayload,
  offer: MeshReceivedOfferProjection,
): boolean {
  const payload = offer.envelope.payload;
  return (
    bid.offerId === offer.offerId &&
    bid.objectiveId === payload.objectiveId &&
    bid.objectiveDocumentId === payload.objectiveDocumentId &&
    bid.objectiveRevision === payload.objectiveRevision &&
    bid.workItemId === payload.workItemId &&
    bid.workItemRevision === payload.workItemRevision &&
    bid.ownerPeerId === payload.ownerPeerId &&
    bid.ownerEpoch === payload.ownerEpoch &&
    bid.offerAttempt === payload.offerAttempt &&
    bid.bidDeadline === payload.bidDeadline &&
    bid.workDeadline === payload.workDeadline
  );
}

function sameReceivedOfferScope(
  left: WorkOfferPayload,
  right: WorkOfferPayload,
): boolean {
  return (
    left.objectiveId === right.objectiveId &&
    left.objectiveRevision === right.objectiveRevision &&
    left.workItemId === right.workItemId &&
    left.workItemRevision === right.workItemRevision &&
    left.ownerPeerId === right.ownerPeerId &&
    left.ownerEpoch === right.ownerEpoch
  );
}

function sameReceivedOfferWorkTerms(
  left: WorkOfferPayload,
  right: WorkOfferPayload,
): boolean {
  return (
    left.objectiveDocumentId === right.objectiveDocumentId &&
    sameReceivedOfferScope(left, right) &&
    sameArray(left.requiredCapabilityKeys, right.requiredCapabilityKeys) &&
    sameRecord(left.matchingAttributes, right.matchingAttributes) &&
    sameArray(left.completionCriteria, right.completionCriteria) &&
    left.inputSummary === right.inputSummary &&
    left.inputReference === right.inputReference &&
    left.budgetReservationUnits === right.budgetReservationUnits &&
    left.workDeadline === right.workDeadline
  );
}

function matchesAwardOffer(
  award: WorkAwardPayload,
  offer: MeshReceivedOfferProjection,
): boolean {
  const payload = offer.envelope.payload;
  return (
    award.offerId === offer.offerId &&
    award.objectiveId === payload.objectiveId &&
    award.objectiveDocumentId === payload.objectiveDocumentId &&
    award.objectiveRevision === payload.objectiveRevision &&
    award.workItemId === payload.workItemId &&
    award.workItemRevision === payload.workItemRevision &&
    award.ownerPeerId === payload.ownerPeerId &&
    award.ownerEpoch === payload.ownerEpoch &&
    award.offerAttempt === payload.offerAttempt &&
    award.workDeadline === payload.workDeadline &&
    award.budgetReservationUnits === payload.budgetReservationUnits
  );
}

function matchesAwardResponse(
  response: WorkAcceptPayload | WorkDeclinePayload,
  award: MeshReceivedAwardProjection,
): boolean {
  const payload = award.envelope.payload;
  return (
    response.awardId === award.awardId &&
    response.objectiveId === payload.objectiveId &&
    response.objectiveDocumentId === payload.objectiveDocumentId &&
    response.objectiveRevision === payload.objectiveRevision &&
    response.workItemId === payload.workItemId &&
    response.workItemRevision === payload.workItemRevision &&
    response.ownerPeerId === payload.ownerPeerId &&
    response.ownerEpoch === payload.ownerEpoch &&
    response.assigneePeerId === payload.assigneePeerId &&
    response.assignmentEpoch === payload.assignmentEpoch &&
    response.assignmentAuthorityId === payload.assignmentAuthorityId &&
    response.fencingToken === payload.fencingToken &&
    response.acceptanceDeadline === payload.acceptanceDeadline
  );
}

function allocationWriteCapacity(
  state: MeshAllocationRuntimeState,
  requiresTimer = false,
): MeshAllocationRejectionCode | undefined {
  if (
    Object.keys(state.coordination.domainRecords).length >=
    state.coordination.limits.maximumDomainRecords
  )
    return "domain_capacity_exceeded";
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  )
    return "journal_capacity_exceeded";
  if (
    requiresTimer &&
    Object.keys(state.coordination.timers).length >=
      state.coordination.limits.maximumTimers
  )
    return "timer_capacity_exceeded";
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");
  return undefined;
}

function messageAlreadyRetained(
  state: MeshAllocationRuntimeState,
  messageId: string,
): boolean {
  return (
    Object.values(state.coordination.domainRecords).some(
      (record) => record.messageId === messageId,
    ) ||
    Object.values(state.allocation.receivedOffers).some(
      (entry) => entry.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localBids).some(
      (entry) => entry.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.receivedAwards).some(
      (entry) => entry.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localAssignmentResponses).some(
      (entry) => entry.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localOffers).some((entry) =>
      Object.values(entry.recipientOffers).some(
        (prepared) => prepared.messageId === messageId,
      ),
    ) ||
    Object.values(state.allocation.acceptedBidEvidence).some(
      (entry) => entry.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localAwards).some(
      (entry) => entry.recipientAward.messageId === messageId,
    ) ||
    Object.values(state.allocation.assignmentResponses).some(
      (entry) => entry.envelope.messageId === messageId,
    )
  );
}

function acceptAssigneeWrite(
  state: MeshAllocationRuntimeState,
  logicalTime: number,
  domainRecordKey: string,
  recordType:
    "work.offer" | "work.bid" | "work.award" | "work.accept" | "work.decline",
  recordId: string,
  objectiveId: string,
  envelope: SignedMeshEnvelope<
    | WorkOfferPayload
    | WorkBidPayload
    | WorkAwardPayload
    | WorkAcceptPayload
    | WorkDeclinePayload
  >,
  allocationSnapshot: unknown,
  effect?: MeshAllocationEffect,
  timer?: MeshCoordinationTimer,
  removeTimerId?: string,
): MeshAllocationDecision {
  const allocation = restoreMeshAllocationState(allocationSnapshot);
  const sequence = state.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...state.coordination,
    domainRecords: createFrozenRecord([
      ...recordEntries(state.coordination.domainRecords),
      [
        domainRecordKey,
        Object.freeze({
          recordKey: domainRecordKey,
          recordType,
          recordId,
          contentDigest: payloadDigest(envelope),
          messageId: envelope.messageId,
          acceptedAt: logicalTime,
          objectiveId,
        }),
      ],
    ]),
    timers:
      timer === undefined && removeTimerId === undefined
        ? state.coordination.timers
        : createFrozenRecord([
            ...recordEntries(state.coordination.timers).filter(
              ([key]) => key !== removeTimerId,
            ),
            ...(timer === undefined ? [] : [[timer.timerId, timer] as const]),
          ]),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: logicalTime,
        kind: "domain.accepted" as const,
        domainRecordKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: createMeshAllocationRuntimeState(
      coordination,
      Object.freeze({ ...state.discovery, lastLogicalTime: logicalTime }),
      Object.freeze({ ...state.objectives, lastLogicalTime: logicalTime }),
      allocation,
    ),
    effects: Object.freeze(effect === undefined ? [] : [effect]),
  });
}

function assertRuntime(state: MeshAllocationRuntimeState, time: number): void {
  if (
    !state ||
    typeof state !== "object" ||
    !Object.isFrozen(state) ||
    Object.keys(state).sort().join(",") !==
      "allocation,coordination,discovery,objectives"
  ) {
    throw new TypeError("Mesh allocation runtime state is required");
  }
  createMeshAllocationRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    state.allocation,
  );
  assertMeshLogicalTime(time);
  if (
    time < state.coordination.lastLogicalTime ||
    time < state.discovery.lastLogicalTime ||
    time < state.objectives.lastLogicalTime ||
    time < state.allocation.lastLogicalTime
  )
    throw new RangeError("Mesh allocation logical time cannot move backwards");
}
function reject(
  state: MeshAllocationRuntimeState,
  code: MeshAllocationRejectionCode,
): MeshAllocationDecision {
  return Object.freeze({ accepted: false, code, state });
}
function samePayload(a: WorkOfferPayload, b: WorkOfferPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameData(value, right[index]))
    );
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const leftKeys = Object.keys(left as Record<string, unknown>).sort(utf16);
  const rightKeys = Object.keys(right as Record<string, unknown>).sort(utf16);
  return (
    sameArray(leftKeys, rightKeys) &&
    leftKeys.every((key) =>
      sameData(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ),
    )
  );
}
function canonicalDigest(
  envelope: SignedMeshEnvelope<
    | WorkOfferPayload
    | WorkBidPayload
    | WorkAwardPayload
    | WorkAcceptPayload
    | WorkDeclinePayload
  >,
): boolean {
  const canonical = canonicalizeMeshPayload(envelope.payload);
  return (
    canonical.ok &&
    envelope.payloadHash === `sha256:${sha256Base64Url(canonical.value)}`
  );
}
function payloadDigest(
  envelope: SignedMeshEnvelope<
    | WorkOfferPayload
    | WorkBidPayload
    | WorkAwardPayload
    | WorkAcceptPayload
    | WorkDeclinePayload
  >,
): string {
  const canonical = canonicalizeMeshPayload(envelope.payload);
  if (!canonical.ok) throw new TypeError("Invalid Mesh bid payload");
  return sha256Base64Url(canonical.value);
}
function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError("Invalid Mesh allocation timestamp");
  return result.value;
}
function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
function sameRecord(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => left[key] === right[key])
  );
}
function sameInput(
  payload: WorkOfferPayload,
  work: MeshWorkAllocationProjection["work"],
): boolean {
  return (
    payload.inputSummary === work.inputSummary &&
    payload.inputReference === work.inputReference
  );
}
function createInitialLeaseActivation(
  authority: Readonly<{
    objectiveId: string;
    objectiveDocumentId: string;
    objectiveRevision: number;
    workItemId: string;
    workItemRevision: number;
    ownerPeerId: string;
    ownerEpoch: number;
    assigneePeerId: string;
    awardId: string;
    assignmentEpoch: number;
    assignmentAuthorityId: string;
    fencingToken: string;
    acceptanceId: string;
    acceptanceMessageId: string;
    workDeadline: string;
    workDeadlineAt: number;
    leaseExpiresAt: string;
    leaseExpiresAtLogical: number;
  }>,
): Readonly<{
  head: MeshLeaseHeadProjection;
  timer: MeshCoordinationTimer;
}> {
  const scope = JSON.stringify([
    authority.objectiveId,
    authority.objectiveRevision,
    authority.workItemId,
    authority.workItemRevision,
    authority.ownerPeerId,
    authority.ownerEpoch,
    authority.awardId,
    authority.assignmentEpoch,
  ]);
  const timerId = `lease.expiry:${sha256Base64Url(utf8Encoder.encode(scope))}`;
  const head: MeshLeaseHeadProjection = Object.freeze({
    executionScopeKey: scope,
    objectiveId: authority.objectiveId,
    objectiveDocumentId: authority.objectiveDocumentId,
    objectiveRevision: authority.objectiveRevision,
    workItemId: authority.workItemId,
    workItemRevision: authority.workItemRevision,
    ownerPeerId: authority.ownerPeerId,
    ownerEpoch: authority.ownerEpoch,
    assigneePeerId: authority.assigneePeerId,
    awardId: authority.awardId,
    assignmentEpoch: authority.assignmentEpoch,
    assignmentAuthorityId: authority.assignmentAuthorityId,
    fencingToken: authority.fencingToken,
    acceptanceId: authority.acceptanceId,
    acceptanceMessageId: authority.acceptanceMessageId,
    originalLeaseExpiresAt: authority.leaseExpiresAt,
    originalLeaseExpiresAtLogical: authority.leaseExpiresAtLogical,
    workDeadline: authority.workDeadline,
    workDeadlineAt: authority.workDeadlineAt,
    leaseRenewalSequence: 0,
    currentLeaseExpiresAt: authority.leaseExpiresAt,
    currentLeaseExpiresAtLogical: authority.leaseExpiresAtLogical,
    status: "active",
    expiryTimerId: timerId,
    expiryTimerGeneration: 1,
  });
  return Object.freeze({
    head,
    timer: Object.freeze({
      timerId,
      kind: "lease.expiry",
      dueAt: authority.leaseExpiresAtLogical,
      generation: 1,
      domainRecordKey: JSON.stringify(["work.accept", authority.acceptanceId]),
    }),
  });
}
function workKey(objectiveId: string, workItemId: string): string {
  return JSON.stringify([objectiveId, workItemId]);
}
function policyKey(objectiveId: string, revision: number): string {
  return JSON.stringify([objectiveId, revision]);
}
function bidKey(offerId: string, bidderPeerId: string): string {
  return JSON.stringify([offerId, bidderPeerId]);
}
function bidDomainKey(bidId: string): string {
  return JSON.stringify(["work.bid", bidId]);
}
function awardDomainKey(awardId: string): string {
  return JSON.stringify(["work.award", awardId]);
}
function offerDomainKey(offerId: string): string {
  return JSON.stringify(["work.offer", offerId]);
}
