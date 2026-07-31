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
  MeshLocalAwardProjection,
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
    (command.kind !== "allocation.offer" && command.kind !== "allocation.award")
  )
    throw new TypeError("Invalid Mesh allocation command");
  if (command.kind === "allocation.award")
    return evaluateAwardCommand(state, command, verifiedAt, receivedAt);
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

/** Evaluates a verified direct bid at the local offer owner. */
export function evaluateVerifiedMeshAllocationEnvelope(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
): MeshAllocationDecision {
  assertRuntime(state, request.receivedAt);
  const context = validateContext(state, request);
  if (context) return reject(state, context);
  if (
    request.envelope.payload.type === "work.accept" ||
    request.envelope.payload.type === "work.decline"
  )
    return evaluateAssignmentResponse(state, request);
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
    timers: createFrozenRecord(
      recordEntries(state.coordination.timers).filter(
        ([key]) => key !== timer.timerId,
      ),
    ),
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
    WorkOfferPayload | WorkBidPayload | WorkAwardPayload
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
