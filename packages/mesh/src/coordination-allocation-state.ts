import {
  canonicalizeMeshPayload,
  compareMeshTimestamps,
  validateMeshEnvelopeContext,
  validateSignedMeshEnvelope,
  type SignedMeshEnvelope,
  type WorkBidPayload,
  type WorkAcceptPayload,
  type WorkAwardPayload,
  type WorkDeclinePayload,
  type WorkOfferPayload,
} from "@agentplat/mesh-protocol";

import type { MeshPeerIdentity } from "./contracts.js";
import type {
  MeshAcceptedBidEvidence,
  MeshAcceptedAssignmentResponseEvidence,
  MeshAllocationLimits,
  MeshAllocationReservation,
  MeshAllocationRuntimeState,
  MeshAllocationState,
  MeshAllocationStateOptions,
  MeshAllocationWorkBinding,
  MeshBidHeadProjection,
  MeshLocalOfferProjection,
  MeshLocalAwardProjection,
  MeshPreparedAwardEnvelope,
  MeshPreparedOfferEnvelope,
  MeshWorkAllocationProjection,
} from "./coordination-allocation-contracts.js";
import type { MeshCoordinationState } from "./coordination-contracts.js";
import type { MeshDiscoveryState } from "./coordination-discovery-contracts.js";
import type {
  MeshObjectiveWorkState,
  MeshWorkItemProjection,
  MeshWorkObjectivePolicySnapshot,
} from "./coordination-objective-work-contracts.js";
import { assertFrozenMeshCoordinationState } from "./coordination-state.js";
import { assertFrozenMeshDiscoveryState } from "./coordination-discovery-state.js";
import { assertFrozenMeshObjectiveWorkState } from "./coordination-objective-work-state.js";
import { logicalDeadline } from "./coordination-objective-work-time.js";
import { sha256Base64Url } from "./sha256.js";
import {
  assertMeshLogicalTime,
  assertMeshMessageId,
  createFrozenRecord,
} from "./state.js";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const rfc3339Pattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const utf8Encoder = new TextEncoder();
const identityKeys = [
  "instanceId",
  "keyId",
  "meshId",
  "peerId",
  "tenantId",
] as const;
const limitKeys = [
  "maximumAssignmentResponses",
  "maximumAwards",
  "maximumBidHeads",
  "maximumBidsPerOffer",
  "maximumOffers",
  "maximumOffersPerWorkItem",
  "maximumProjectionBytes",
  "maximumRecipientsPerOffer",
] as const;

/** Fixed ceilings; a caller can only configure lower bounds. */
export const DEFAULT_MESH_ALLOCATION_LIMITS: Readonly<MeshAllocationLimits> =
  Object.freeze({
    maximumAssignmentResponses: 8_192,
    maximumAwards: 8_192,
    maximumOffers: 8_192,
    maximumOffersPerWorkItem: 32,
    maximumBidHeads: 32_768,
    maximumBidsPerOffer: 512,
    maximumRecipientsPerOffer: 128,
    maximumProjectionBytes: 262_144,
  });

/** Creates an empty separately restorable allocation projection. */
export function createMeshAllocationState(
  options: MeshAllocationStateOptions,
): MeshAllocationState {
  assertPlainRecord(options, "allocation state options");
  assertExactKeys(options, ["identity", "limits"], ["identity"]);
  return Object.freeze({
    schemaVersion: 2,
    identity: freezeIdentity(options.identity),
    workAllocations: createFrozenRecord<MeshWorkAllocationProjection>([]),
    localOffers: createFrozenRecord<MeshLocalOfferProjection>([]),
    bidHeads: createFrozenRecord<MeshBidHeadProjection>([]),
    acceptedBidEvidence: createFrozenRecord<MeshAcceptedBidEvidence>([]),
    localAwards: createFrozenRecord<MeshLocalAwardProjection>([]),
    assignmentResponses:
      createFrozenRecord<MeshAcceptedAssignmentResponseEvidence>([]),
    reservations: createFrozenRecord<MeshAllocationReservation>([]),
    limits: resolveLimits(options.limits, false),
    lastLogicalTime: 0,
  });
}

/** Strictly validates decoded allocation state and returns a canonical frozen snapshot. */
export function restoreMeshAllocationState(
  snapshot: unknown,
): MeshAllocationState {
  const parsed = validateSnapshot(snapshot);
  const workAllocations = createFrozenRecord(
    parsed.workAllocations.map(([key, value]) => [
      key,
      freezeWorkAllocation(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const localOffers = createFrozenRecord(
    parsed.localOffers.map(([key, value]) => [
      key,
      freezeLocalOffer(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const acceptedBidEvidence = createFrozenRecord(
    parsed.acceptedBidEvidence.map(([key, value]) => [
      key,
      freezeAcceptedBidEvidence(
        value,
        parsed.lastLogicalTime,
        parsed.limits,
        true,
      ),
    ]),
  );
  const bidHeads = createFrozenRecord(
    parsed.bidHeads.map(([key, value]) => [
      key,
      freezeBidHead(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const reservations = createFrozenRecord(
    parsed.reservations.map(([key, value]) => [
      key,
      freezeReservation(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const localAwards = createFrozenRecord(
    parsed.localAwards.map(([key, value]) => [
      key,
      freezeLocalAward(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const assignmentResponses = createFrozenRecord(
    parsed.assignmentResponses.map(([key, value]) => [
      key,
      freezeAssignmentResponse(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const state = Object.freeze({
    schemaVersion: 2 as const,
    identity: freezeIdentity(parsed.identity),
    workAllocations,
    localOffers,
    bidHeads,
    acceptedBidEvidence,
    localAwards,
    assignmentResponses,
    reservations,
    limits: Object.freeze({ ...parsed.limits }),
    lastLogicalTime: parsed.lastLogicalTime,
  });
  validateStateRelations(state, false);
  return state;
}

/** Strict assertion for pure allocation evaluators. */
export function assertFrozenMeshAllocationState(
  state: MeshAllocationState,
): void {
  validateSnapshot(state);
  if (
    !Object.isFrozen(state) ||
    !Object.isFrozen(state.identity) ||
    !Object.isFrozen(state.workAllocations) ||
    !Object.isFrozen(state.localOffers) ||
    !Object.isFrozen(state.bidHeads) ||
    !Object.isFrozen(state.acceptedBidEvidence) ||
    !Object.isFrozen(state.localAwards) ||
    !Object.isFrozen(state.assignmentResponses) ||
    !Object.isFrozen(state.reservations) ||
    !Object.isFrozen(state.limits) ||
    [
      state.workAllocations,
      state.localOffers,
      state.bidHeads,
      state.acceptedBidEvidence,
      state.localAwards,
      state.assignmentResponses,
      state.reservations,
    ].some((record) => Object.getPrototypeOf(record) !== null) ||
    Object.values(state.workAllocations).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.localOffers).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.bidHeads).some((value) => !isDeepFrozenData(value)) ||
    Object.values(state.acceptedBidEvidence).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.localAwards).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.assignmentResponses).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.reservations).some((value) => !isDeepFrozenData(value))
  )
    throw new TypeError(
      "Mesh allocation reservation state must be an immutable snapshot",
    );
  validateStateRelations(state, true);
}

/** Composes aligned coordination, discovery, Objective/Work, and allocation snapshots. */
export function createMeshAllocationRuntimeState(
  coordination: MeshCoordinationState,
  discovery: MeshDiscoveryState,
  objectives: MeshObjectiveWorkState,
  allocation: MeshAllocationState,
): MeshAllocationRuntimeState {
  assertFrozenMeshCoordinationState(coordination);
  assertFrozenMeshDiscoveryState(discovery);
  assertFrozenMeshObjectiveWorkState(objectives);
  assertFrozenMeshAllocationState(allocation);
  assertAlignedIdentity(coordination.identity, discovery.identity, "discovery");
  assertAlignedIdentity(
    coordination.identity,
    objectives.identity,
    "Objective/Work",
  );
  assertAlignedIdentity(
    coordination.identity,
    allocation.identity,
    "allocation",
  );
  if (
    coordination.lastLogicalTime !== discovery.lastLogicalTime ||
    coordination.lastLogicalTime !== objectives.lastLogicalTime ||
    coordination.lastLogicalTime !== allocation.lastLogicalTime
  )
    throw new TypeError("Mesh allocation runtime snapshots are not aligned");
  const domainKeysByMessageId = new Map(
    Object.entries(coordination.domainRecords).map(([key, record]) => [
      record.messageId,
      key,
    ]),
  );

  for (const allocationWork of Object.values(allocation.workAllocations)) {
    const work =
      objectives.workItems[
        workKey(allocationWork.objectiveId, allocationWork.work.workItemId)
      ];
    if (!work || !bindingsEqual(allocationWork, work)) {
      throw new TypeError("Mesh allocation Work binding is invalid");
    }
  }
  for (const offer of Object.values(allocation.localOffers)) {
    const work =
      objectives.workItems[workKey(offer.objectiveId, offer.work.workItemId)];
    if (!work || !bindingsEqual(offer, work)) {
      throw new TypeError("Mesh local offer Work binding is invalid");
    }
    const allocationWork =
      allocation.workAllocations[
        workKey(offer.objectiveId, offer.work.workItemId)
      ];
    const reservation = allocation.reservations[offer.reservationId];
    const timer = coordination.timers[offer.bidDeadlineTimerId];
    const domain =
      coordination.domainRecords[domainRecordKey("work.offer", offer.offerId)];
    const offerDomainKey = domainRecordKey("work.offer", offer.offerId);
    const recipientOffers = Object.values(offer.recipientOffers);
    const objectiveDocument =
      objectives.objectiveDocuments[
        JSON.stringify([offer.objectiveId, offer.objectiveRevision])
      ];
    const signedBidWindowDurations = recipientOffers.map((prepared) =>
      logicalDeadline(offer.bidDeadline, prepared.envelope.sentAt, 0),
    );
    if (
      !objectiveDocument ||
      objectiveDocument.envelope.payload.objectiveDocumentId !==
        offer.objectiveDocumentId ||
      signedBidWindowDurations.some(
        (duration) =>
          duration === undefined ||
          duration > objectiveDocument.envelope.payload.bidWindowMs,
      ) ||
      offer.bidDeadlineAt > offer.work.workDeadlineAt ||
      offer.bidDeadlineAt > offer.objectivePolicy.expiresAt ||
      !domain ||
      domain.recordType !== "work.offer" ||
      domain.recordId !== offer.offerId ||
      domain.contentDigest !==
        recipientOffers[0]!.envelope.payloadHash.slice("sha256:".length) ||
      !recipientOffers.some(
        (prepared) => prepared.messageId === domain.messageId,
      ) ||
      recipientOffers.some((prepared) => {
        const claimedDomainKey = domainKeysByMessageId.get(prepared.messageId);
        return (
          claimedDomainKey !== undefined && claimedDomainKey !== offerDomainKey
        );
      }) ||
      domain.acceptedAt !== offer.createdAt ||
      domain.objectiveId !== offer.objectiveId
    ) {
      throw new TypeError("Mesh local offer domain record binding is invalid");
    }
    const active = allocationWork?.activeOfferId === offer.offerId;
    if (
      active
        ? !reservation ||
          reservation.status !== "reserved" ||
          !timer ||
          timer.kind !== "work.bid_deadline" ||
          timer.dueAt !== offer.bidDeadlineAt ||
          timer.generation !== offer.bidDeadlineTimerGeneration ||
          timer.domainRecordKey !== domainRecordKey("work.offer", offer.offerId)
        : timer !== undefined
    ) {
      throw new TypeError(
        "Mesh local offer timer or reservation binding is invalid",
      );
    }
  }
  for (const timer of Object.values(coordination.timers)) {
    if (
      timer.kind === "work.bid_deadline" &&
      !Object.values(allocation.localOffers).some(
        (offer) =>
          offer.bidDeadlineTimerId === timer.timerId &&
          offer.bidDeadlineTimerGeneration === timer.generation,
      )
    ) {
      throw new TypeError("Mesh allocation bid timer is orphaned");
    }
    if (
      timer.kind === "work.acceptance_deadline" &&
      !Object.values(allocation.localAwards).some(
        (award) =>
          award.status === "awaiting_acceptance" &&
          award.acceptanceDeadlineTimerId === timer.timerId &&
          award.acceptanceDeadlineTimerGeneration === timer.generation,
      )
    ) {
      throw new TypeError("Mesh allocation acceptance timer is orphaned");
    }
  }
  for (const evidence of Object.values(allocation.acceptedBidEvidence)) {
    const domainKey = domainRecordKey("work.bid", evidence.bidId);
    const domain = coordination.domainRecords[domainKey];
    if (
      !domain ||
      domain.recordType !== "work.bid" ||
      domain.recordId !== evidence.bidId ||
      domain.messageId !== evidence.envelope.messageId ||
      domain.acceptedAt !== evidence.acceptedAt ||
      domain.objectiveId !== evidence.envelope.payload.objectiveId ||
      domain.contentDigest !==
        evidence.envelope.payloadHash.slice("sha256:".length)
    )
      throw new TypeError("Mesh remote bid domain record binding is invalid");
  }
  const retainedMessageIds = new Set<string>([
    ...Object.values(allocation.localOffers).flatMap((offer) =>
      Object.values(offer.recipientOffers).map(
        (prepared) => prepared.messageId,
      ),
    ),
    ...Object.values(allocation.acceptedBidEvidence).map(
      (evidence) => evidence.envelope.messageId,
    ),
  ]);
  for (const award of Object.values(allocation.localAwards)) {
    const domain =
      coordination.domainRecords[domainRecordKey("work.award", award.awardId)];
    const work =
      allocation.workAllocations[
        workKey(award.objectiveId, award.work.workItemId)
      ];
    const offer = allocation.localOffers[award.offerId];
    const objective = objectives.objectives[award.objectiveId];
    const objectiveDocument =
      objectives.objectiveDocuments[
        JSON.stringify([award.objectiveId, award.objectiveRevision])
      ];
    const reservation = allocation.reservations[award.reservationId];
    const timer = coordination.timers[award.acceptanceDeadlineTimerId];
    const bid = Object.values(allocation.bidHeads).find(
      (entry) => entry.offerId === award.offerId && entry.bidId === award.bidId,
    );
    const awardContext = validateMeshEnvelopeContext(
      award.recipientAward.envelope,
      {
        tenantId: allocation.identity.tenantId,
        meshId: allocation.identity.meshId,
        peerId: award.assigneePeerId,
        receivedAt: award.validityVerifiedAt,
      },
    );
    const signedAcceptanceDuration = logicalDeadline(
      award.acceptanceDeadline,
      award.recipientAward.envelope.sentAt,
      0,
    );
    const signedLeaseDuration = logicalDeadline(
      award.leaseExpiresAt,
      award.leaseStartsAt,
      0,
    );
    if (
      !awardContext.ok ||
      !objective ||
      !objectiveDocument ||
      objectiveDocument.envelope.payload.objectiveDocumentId !==
        award.objectiveDocumentId ||
      !signedAcceptanceDuration ||
      signedAcceptanceDuration >
        objectiveDocument.envelope.payload.acceptanceWindowMs ||
      !signedLeaseDuration ||
      signedLeaseDuration >
        objectiveDocument.envelope.payload.maximumLeaseDurationMs ||
      award.leaseExpiresAtLogical > award.work.workDeadlineAt ||
      award.leaseExpiresAtLogical > objective.expiresAt ||
      !domain ||
      domain.recordType !== "work.award" ||
      domain.recordId !== award.awardId ||
      domain.messageId !== award.recipientAward.messageId ||
      domain.acceptedAt !== award.createdAt ||
      domain.objectiveId !== award.objectiveId ||
      domain.contentDigest !==
        award.recipientAward.envelope.payloadHash.slice("sha256:".length) ||
      award.recipientAward.preparedAt !== award.createdAt ||
      award.recipientAward.envelope.tenantId !== allocation.identity.tenantId ||
      award.recipientAward.envelope.meshId !== allocation.identity.meshId ||
      award.recipientAward.envelope.objectiveId !== award.objectiveId ||
      award.recipientAward.envelope.sender.peerId !==
        allocation.identity.peerId ||
      award.recipientAward.envelope.sender.instanceId !==
        allocation.identity.instanceId ||
      award.recipientAward.envelope.proof.keyId !== allocation.identity.keyId ||
      !work ||
      !offer ||
      !bindingsEqual(award, work.work) ||
      !bindingsEqual(award, offer.work) ||
      award.offerAttempt !== offer.offerAttempt ||
      !reservation ||
      !bid ||
      bid.bidRevision !== award.bidRevision ||
      bid.bidderPeerId !== award.assigneePeerId ||
      award.createdAt < bid.acceptedAt ||
      award.createdAt >= offer.bidDeadlineAt ||
      compareTimestamp(award.validityVerifiedAt, offer.bidDeadline) >= 0 ||
      award.recipientAward.envelope.causationId !== bid.acceptedMessageId ||
      reservation.offerId !== award.offerId ||
      reservation.budgetReservationUnits !== award.budgetReservationUnits
    )
      throw new TypeError("Mesh local award domain binding is invalid");
    if (retainedMessageIds.has(award.recipientAward.messageId))
      throw new TypeError(
        "Mesh award messageId conflicts with retained evidence",
      );
    retainedMessageIds.add(award.recipientAward.messageId);
    const response = allocation.assignmentResponses[award.awardId];
    if (award.status === "awaiting_acceptance") {
      if (
        response ||
        work.phase !== "award_pending" ||
        work.activeAwardId !== award.awardId ||
        reservation.status !== "reserved" ||
        !timer ||
        timer.kind !== "work.acceptance_deadline" ||
        timer.dueAt !== award.acceptanceDeadlineAt ||
        timer.generation !== award.acceptanceDeadlineTimerGeneration ||
        timer.domainRecordKey !== domainRecordKey("work.award", award.awardId)
      )
        throw new TypeError("Mesh pending award timer binding is invalid");
    } else if (
      timer ||
      (award.status === "timed_out" ? response !== undefined : !response) ||
      (award.status === "accepted" &&
        (work.phase !== "active" ||
          work.activeAcceptanceId !== response?.responseId ||
          response?.kind !== "work.accept" ||
          reservation.status !== "committed")) ||
      (award.status === "declined" &&
        (response?.kind !== "work.decline" ||
          reservation.status !== "released" ||
          work.activeAwardId === award.awardId ||
          work.reservationId === reservation.reservationId)) ||
      (award.status === "timed_out" &&
        (reservation.status !== "released" ||
          work.activeAwardId === award.awardId ||
          work.reservationId === reservation.reservationId))
    ) {
      throw new TypeError("Mesh terminal award binding is invalid");
    }
  }
  for (const response of Object.values(allocation.assignmentResponses)) {
    const award = allocation.localAwards[response.awardId];
    const domain =
      coordination.domainRecords[
        domainRecordKey(response.kind, response.responseId)
      ];
    const payload = response.envelope.payload;
    const responseContext = validateMeshEnvelopeContext(response.envelope, {
      tenantId: allocation.identity.tenantId,
      meshId: allocation.identity.meshId,
      peerId: allocation.identity.peerId,
      receivedAt: response.validityVerifiedAt,
      ...(response.supportedCriticalExtensions === undefined
        ? {}
        : {
            supportedCriticalExtensions: response.supportedCriticalExtensions,
          }),
    });
    if (
      !responseContext.ok ||
      !award ||
      !domain ||
      domain.recordType !== response.kind ||
      domain.recordId !== response.responseId ||
      domain.messageId !== response.envelope.messageId ||
      domain.acceptedAt !== response.acceptedAt ||
      domain.objectiveId !== award.objectiveId ||
      domain.contentDigest !==
        response.envelope.payloadHash.slice("sha256:".length) ||
      retainedMessageIds.has(response.envelope.messageId) ||
      response.envelope.tenantId !== allocation.identity.tenantId ||
      response.envelope.meshId !== allocation.identity.meshId ||
      response.envelope.objectiveId !== award.objectiveId ||
      response.envelope.audience.kind !== "peer" ||
      response.envelope.audience.peerId !== allocation.identity.peerId ||
      response.envelope.sender.peerId !== award.assigneePeerId ||
      response.envelope.causationId !== award.recipientAward.messageId ||
      response.acceptedAt < award.createdAt ||
      response.acceptedAt >= award.acceptanceDeadlineAt ||
      compareTimestamp(response.validityVerifiedAt, award.acceptanceDeadline) >=
        0 ||
      response.acceptedAt >= award.objectivePolicy.expiresAt ||
      compareTimestamp(
        response.validityVerifiedAt,
        award.objectivePolicy.validUntil,
      ) >= 0 ||
      payload.objectiveId !== award.objectiveId ||
      payload.objectiveDocumentId !== award.objectiveDocumentId ||
      payload.objectiveRevision !== award.objectiveRevision ||
      payload.workItemId !== award.work.workItemId ||
      payload.workItemRevision !== award.work.workItemRevision ||
      payload.ownerPeerId !== allocation.identity.peerId ||
      payload.ownerEpoch !== 1 ||
      payload.assigneePeerId !== award.assigneePeerId ||
      payload.assignmentEpoch !== award.assignmentEpoch ||
      payload.assignmentAuthorityId !== award.assignmentAuthorityId ||
      payload.fencingToken !== award.fencingToken ||
      payload.acceptanceDeadline !== award.acceptanceDeadline
    )
      throw new TypeError("Mesh assignment response domain binding is invalid");
    retainedMessageIds.add(response.envelope.messageId);
  }
  const reservedByObjective = new Map<string, number>();
  const committedByObjective = new Map<string, number>();
  for (const reservation of Object.values(allocation.reservations)) {
    if (reservation.status === "committed") {
      const current = committedByObjective.get(reservation.objectiveId) ?? 0;
      if (
        current >
        Number.MAX_SAFE_INTEGER - reservation.budgetReservationUnits
      ) {
        throw new TypeError("Mesh allocation committed accounting is invalid");
      }
      committedByObjective.set(
        reservation.objectiveId,
        current + reservation.budgetReservationUnits,
      );
      continue;
    }
    if (reservation.status !== "reserved") continue;
    const current = reservedByObjective.get(reservation.objectiveId) ?? 0;
    if (
      current >
      Number.MAX_SAFE_INTEGER - reservation.budgetReservationUnits
    ) {
      throw new TypeError("Mesh allocation reservation accounting is invalid");
    }
    reservedByObjective.set(
      reservation.objectiveId,
      current + reservation.budgetReservationUnits,
    );
  }
  for (const objective of Object.values(objectives.objectives)) {
    if (
      objective.reservedBudgetUnits !==
        (reservedByObjective.get(objective.objectiveId) ?? 0) ||
      objective.committedBudgetUnits !==
        (committedByObjective.get(objective.objectiveId) ?? 0)
    ) {
      throw new TypeError(
        "Mesh allocation Objective reservation accounting is invalid",
      );
    }
    const concurrentAssignments = Object.values(
      allocation.workAllocations,
    ).filter(
      (work) =>
        work.objectiveId === objective.objectiveId &&
        (work.phase === "award_pending" || work.phase === "active"),
    ).length;
    if (concurrentAssignments > objective.maximumConcurrentAssignments) {
      throw new TypeError(
        "Mesh allocation concurrent assignment limit is invalid",
      );
    }
  }
  return Object.freeze({ coordination, discovery, objectives, allocation });
}

function validateSnapshot(snapshot: unknown): ParsedState {
  assertPlainRecord(snapshot, "allocation snapshot");
  const legacy = (snapshot as { schemaVersion?: unknown }).schemaVersion === 1;
  assertExactKeys(
    snapshot,
    [
      "acceptedBidEvidence",
      "assignmentResponses",
      "bidHeads",
      "identity",
      "lastLogicalTime",
      "limits",
      "localOffers",
      "localAwards",
      "reservations",
      "schemaVersion",
      "workAllocations",
    ],
    legacy
      ? [
          "acceptedBidEvidence",
          "bidHeads",
          "identity",
          "lastLogicalTime",
          "limits",
          "localOffers",
          "reservations",
          "schemaVersion",
          "workAllocations",
        ]
      : [
          "acceptedBidEvidence",
          "assignmentResponses",
          "bidHeads",
          "identity",
          "lastLogicalTime",
          "limits",
          "localAwards",
          "localOffers",
          "reservations",
          "schemaVersion",
          "workAllocations",
        ],
  );
  const raw = snapshot as Record<string, unknown>;
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2)
    throw new TypeError("Mesh allocation schema version is unsupported");
  const candidate = (legacy
    ? {
        ...raw,
        schemaVersion: 2,
        localOffers: migrateLegacyOffers(raw.localOffers),
        localAwards: Object.create(null),
        assignmentResponses: Object.create(null),
        limits: {
          ...(raw.limits as object),
          maximumAwards: (raw.limits as MeshAllocationLimits).maximumOffers,
          maximumAssignmentResponses: (raw.limits as MeshAllocationLimits)
            .maximumOffers,
        },
      }
    : raw) as unknown as MeshAllocationState;
  const identity = freezeIdentity(candidate.identity);
  const limits = resolveLimits(candidate.limits, true);
  assertMeshLogicalTime(candidate.lastLogicalTime);
  for (const [name, record] of Object.entries({
    workAllocations: candidate.workAllocations,
    localOffers: candidate.localOffers,
    bidHeads: candidate.bidHeads,
    acceptedBidEvidence: candidate.acceptedBidEvidence,
    localAwards: candidate.localAwards,
    assignmentResponses: candidate.assignmentResponses,
    reservations: candidate.reservations,
  }))
    assertRecord(record, name);
  const parsed: ParsedState = {
    identity,
    limits,
    lastLogicalTime: candidate.lastLogicalTime,
    workAllocations: Object.entries(candidate.workAllocations),
    localOffers: Object.entries(candidate.localOffers),
    bidHeads: Object.entries(candidate.bidHeads),
    acceptedBidEvidence: Object.entries(candidate.acceptedBidEvidence),
    localAwards: Object.entries(candidate.localAwards),
    assignmentResponses: Object.entries(candidate.assignmentResponses),
    reservations: Object.entries(candidate.reservations),
  };
  if (
    parsed.localOffers.length > limits.maximumOffers ||
    parsed.bidHeads.length > limits.maximumBidHeads ||
    parsed.localAwards.length > limits.maximumAwards ||
    parsed.assignmentResponses.length > limits.maximumAssignmentResponses
  )
    throw new RangeError("Mesh allocation snapshot exceeds its limits");
  for (const [key, value] of parsed.workAllocations) {
    if (key !== value.workKey)
      throw new TypeError("Mesh allocation Work key is invalid");
    freezeWorkAllocation(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.localOffers) {
    if (key !== value.offerId)
      throw new TypeError("Mesh local offer key is invalid");
    freezeLocalOffer(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.bidHeads) {
    if (key !== value.bidKey)
      throw new TypeError("Mesh bid head key is invalid");
    freezeBidHead(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.acceptedBidEvidence) {
    if (key !== value.bidId)
      throw new TypeError("Mesh accepted bid evidence key is invalid");
    freezeAcceptedBidEvidence(value, parsed.lastLogicalTime, limits, true);
  }
  for (const [key, value] of parsed.reservations) {
    if (key !== value.reservationId)
      throw new TypeError("Mesh allocation reservation key is invalid");
    freezeReservation(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.localAwards) {
    if (key !== value.awardId)
      throw new TypeError("Mesh local award key is invalid");
    freezeLocalAward(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.assignmentResponses) {
    if (key !== value.awardId)
      throw new TypeError("Mesh assignment response key is invalid");
    freezeAssignmentResponse(value, parsed.lastLogicalTime, limits);
  }
  if (!legacy) validateStateRelations(candidate, false);
  return parsed;
}

interface ParsedState {
  readonly identity: MeshPeerIdentity;
  readonly limits: MeshAllocationLimits;
  readonly lastLogicalTime: number;
  readonly workAllocations: readonly (readonly [
    string,
    MeshWorkAllocationProjection,
  ])[];
  readonly localOffers: readonly (readonly [
    string,
    MeshLocalOfferProjection,
  ])[];
  readonly bidHeads: readonly (readonly [string, MeshBidHeadProjection])[];
  readonly acceptedBidEvidence: readonly (readonly [
    string,
    MeshAcceptedBidEvidence,
  ])[];
  readonly reservations: readonly (readonly [
    string,
    MeshAllocationReservation,
  ])[];
  readonly localAwards: readonly (readonly [
    string,
    MeshLocalAwardProjection,
  ])[];
  readonly assignmentResponses: readonly (readonly [
    string,
    MeshAcceptedAssignmentResponseEvidence,
  ])[];
}

function validateStateRelations(
  state: MeshAllocationState,
  requireFrozen: boolean,
): void {
  const offerCounts = new Map<string, number>();
  const recipientMessageIds = new Set<string>();
  for (const offer of Object.values(state.localOffers)) {
    const workAllocation =
      state.workAllocations[workKey(offer.objectiveId, offer.work.workItemId)];
    const reservation = state.reservations[offer.reservationId];
    if (
      offer.work.ownerPeerId !== state.identity.peerId ||
      !workAllocation ||
      !reservation ||
      !bindingsEqual(offer, workAllocation.work)
    ) {
      throw new TypeError(
        "Mesh local offer is orphaned from its Work allocation",
      );
    }
    if (
      workAllocation.activeOfferId === offer.offerId &&
      (workAllocation.phase !== "offered" ||
        workAllocation.reservationId !== offer.reservationId ||
        workAllocation.bidDeadlineAt !== offer.bidDeadlineAt)
    ) {
      throw new TypeError(
        "Mesh active local offer is not bound to its Work allocation",
      );
    }
    const key = workKey(offer.objectiveId, offer.work.workItemId);
    offerCounts.set(key, (offerCounts.get(key) ?? 0) + 1);
    for (const prepared of Object.values(offer.recipientOffers)) {
      const context = validateMeshEnvelopeContext(prepared.envelope, {
        tenantId: state.identity.tenantId,
        meshId: state.identity.meshId,
        peerId: prepared.recipientPeerId,
        receivedAt: offer.validityVerifiedAt,
      });
      if (
        !context.ok ||
        prepared.preparedAt !== offer.createdAt ||
        prepared.envelope.tenantId !== state.identity.tenantId ||
        prepared.envelope.meshId !== state.identity.meshId ||
        prepared.envelope.sender.peerId !== state.identity.peerId ||
        prepared.envelope.sender.instanceId !== state.identity.instanceId ||
        prepared.envelope.proof.keyId !== state.identity.keyId
      )
        throw new TypeError("Mesh prepared offer sender scope is invalid");
      if (recipientMessageIds.has(prepared.messageId))
        throw new TypeError("Mesh prepared offer messageId is not unique");
      recipientMessageIds.add(prepared.messageId);
      if (requireFrozen && !isDeepFrozenData(prepared))
        throw new TypeError("Mesh prepared offer evidence is mutable");
    }
  }
  if (
    [...offerCounts.values()].some(
      (count) => count > state.limits.maximumOffersPerWorkItem,
    )
  ) {
    throw new RangeError("Mesh offers per Work Item limit exceeded");
  }
  const offersByWork = new Map<string, MeshLocalOfferProjection[]>();
  for (const offer of Object.values(state.localOffers)) {
    const key = workKey(offer.objectiveId, offer.work.workItemId);
    const offers = offersByWork.get(key) ?? [];
    offers.push(offer);
    offersByWork.set(key, offers);
  }
  for (const offers of offersByWork.values()) {
    offers.sort((left, right) => left.offerAttempt - right.offerAttempt);
    for (let index = 0; index < offers.length; index += 1) {
      const offer = offers[index] as MeshLocalOfferProjection;
      const predecessor = offers[index - 1];
      const predecessorReservation =
        predecessor === undefined
          ? undefined
          : state.reservations[predecessor.reservationId];
      if (
        offer.offerAttempt !== index + 1 ||
        offer.previousOfferId !== predecessor?.offerId ||
        (predecessor !== undefined &&
          offer.createdAt <= predecessor.createdAt) ||
        (predecessor !== undefined &&
          (predecessorReservation?.status !== "released" ||
            predecessorReservation.releasedAt === undefined ||
            offer.createdAt < predecessorReservation.releasedAt))
      ) {
        throw new TypeError("Mesh local offer predecessor chain is invalid");
      }
      for (const prepared of Object.values(offer.recipientOffers)) {
        const expectedCausation =
          predecessor?.recipientOffers[prepared.recipientPeerId]?.messageId;
        if (prepared.envelope.causationId !== expectedCausation) {
          throw new TypeError(
            "Mesh prepared offer predecessor causation is invalid",
          );
        }
      }
    }
  }

  const evidenceById = new Map<string, MeshAcceptedBidEvidence>();
  const evidenceByPair = new Map<string, MeshAcceptedBidEvidence[]>();
  const evidenceMessageIds = new Set<string>();
  for (const evidence of Object.values(state.acceptedBidEvidence)) {
    const offer = state.localOffers[evidence.offerId];
    const context = validateMeshEnvelopeContext(evidence.envelope, {
      tenantId: state.identity.tenantId,
      meshId: state.identity.meshId,
      peerId: state.identity.peerId,
      receivedAt: evidence.validityVerifiedAt,
      ...(evidence.supportedCriticalExtensions === undefined
        ? {}
        : {
            supportedCriticalExtensions: evidence.supportedCriticalExtensions,
          }),
    });
    if (
      !context.ok ||
      !offer ||
      !bidPayloadMatchesOffer(evidence.envelope.payload, offer) ||
      evidence.acceptedAt < offer.createdAt ||
      evidence.acceptedAt >= offer.bidDeadlineAt ||
      compareTimestamp(evidence.validityVerifiedAt, offer.bidDeadline) >= 0 ||
      evidence.envelope.tenantId !== state.identity.tenantId ||
      evidence.envelope.meshId !== state.identity.meshId ||
      evidence.envelope.audience.kind !== "peer" ||
      evidence.envelope.audience.peerId !== state.identity.peerId ||
      recipientMessageIds.has(evidence.envelope.messageId) ||
      evidenceMessageIds.has(evidence.envelope.messageId)
    )
      throw new TypeError(
        "Mesh accepted bid evidence references an unknown or cross-linked offer",
      );
    evidenceMessageIds.add(evidence.envelope.messageId);
    const pairKey = bidKey(evidence.offerId, evidence.bidderPeerId);
    const list = evidenceByPair.get(pairKey) ?? [];
    list.push(evidence);
    evidenceByPair.set(pairKey, list);
    evidenceById.set(evidence.bidId, evidence);
  }
  const evidenceCounts = new Map<string, number>();
  for (const [key, head] of Object.entries(state.bidHeads)) {
    if (key !== bidKey(head.offerId, head.bidderPeerId))
      throw new TypeError("Mesh bid head key is invalid");
    const evidence = evidenceById.get(head.bidId);
    if (!evidence || !bidHeadMatchesEvidence(head, evidence))
      throw new TypeError("Mesh bid head is orphaned from accepted evidence");
    const chain = evidenceByPair.get(key) ?? [];
    validateBidChain(head, chain);
    evidenceCounts.set(
      head.offerId,
      (evidenceCounts.get(head.offerId) ?? 0) + chain.length,
    );
  }
  for (const [pairKey, evidence] of evidenceByPair) {
    if (!state.bidHeads[pairKey])
      throw new TypeError(
        "Mesh accepted bid evidence is orphaned from a bid head",
      );
    if (
      evidence.some(
        (entry) =>
          !entry.envelope.causationId ||
          !preparedCausationExists(
            state.localOffers[entry.offerId] as MeshLocalOfferProjection,
            entry.bidderPeerId,
            entry.envelope.causationId,
          ),
      )
    ) {
      throw new TypeError(
        "Mesh bid evidence causation does not bind a recipient offer message",
      );
    }
  }
  if (
    [...evidenceCounts.values()].some(
      (count) => count > state.limits.maximumBidsPerOffer,
    )
  ) {
    throw new RangeError("Mesh retained bids per offer limit exceeded");
  }
  const retainedMessageIds = new Set([
    ...recipientMessageIds,
    ...evidenceMessageIds,
  ]);
  const awardedOfferIds = new Set<string>();
  const awardedReservationIds = new Set<string>();
  for (const award of Object.values(state.localAwards)) {
    const response = state.assignmentResponses[award.awardId];
    const work =
      state.workAllocations[workKey(award.objectiveId, award.work.workItemId)];
    const offer = state.localOffers[award.offerId];
    const bid = Object.values(state.bidHeads).find(
      (entry) => entry.offerId === award.offerId && entry.bidId === award.bidId,
    );
    const envelope = award.recipientAward.envelope;
    const context = validateMeshEnvelopeContext(envelope, {
      tenantId: state.identity.tenantId,
      meshId: state.identity.meshId,
      peerId: award.assigneePeerId,
      receivedAt: award.validityVerifiedAt,
    });
    if (
      awardedOfferIds.has(award.offerId) ||
      awardedReservationIds.has(award.reservationId) ||
      !context.ok ||
      !work ||
      !offer ||
      !bindingsEqual(award, work.work) ||
      !bindingsEqual(award, offer.work) ||
      award.offerAttempt !== offer.offerAttempt ||
      !bid ||
      bid.bidRevision !== award.bidRevision ||
      bid.bidderPeerId !== award.assigneePeerId ||
      award.createdAt < bid.acceptedAt ||
      award.createdAt >= offer.bidDeadlineAt ||
      compareTimestamp(award.validityVerifiedAt, offer.bidDeadline) >= 0 ||
      retainedMessageIds.has(envelope.messageId) ||
      envelope.tenantId !== state.identity.tenantId ||
      envelope.meshId !== state.identity.meshId ||
      envelope.objectiveId !== award.objectiveId ||
      envelope.sender.peerId !== state.identity.peerId ||
      envelope.sender.instanceId !== state.identity.instanceId ||
      envelope.proof.keyId !== state.identity.keyId ||
      envelope.causationId !== bid.acceptedMessageId ||
      (award.status === "awaiting_acceptance" && response !== undefined) ||
      (award.status === "accepted" && response?.kind !== "work.accept") ||
      (award.status === "declined" && response?.kind !== "work.decline") ||
      (award.status === "timed_out" && response !== undefined)
    )
      throw new TypeError(
        "Mesh local award terminal response binding is invalid",
      );
    retainedMessageIds.add(envelope.messageId);
    awardedOfferIds.add(award.offerId);
    awardedReservationIds.add(award.reservationId);
  }
  for (const response of Object.values(state.assignmentResponses)) {
    const award = state.localAwards[response.awardId];
    const envelope = response.envelope;
    const payload = envelope.payload;
    const context = validateMeshEnvelopeContext(envelope, {
      tenantId: state.identity.tenantId,
      meshId: state.identity.meshId,
      peerId: state.identity.peerId,
      receivedAt: response.validityVerifiedAt,
      ...(response.supportedCriticalExtensions === undefined
        ? {}
        : {
            supportedCriticalExtensions: response.supportedCriticalExtensions,
          }),
    });
    if (
      !context.ok ||
      !award ||
      retainedMessageIds.has(envelope.messageId) ||
      envelope.tenantId !== state.identity.tenantId ||
      envelope.meshId !== state.identity.meshId ||
      envelope.objectiveId !== award.objectiveId ||
      envelope.audience.kind !== "peer" ||
      envelope.audience.peerId !== state.identity.peerId ||
      envelope.sender.peerId !== award.assigneePeerId ||
      envelope.causationId !== award.recipientAward.messageId ||
      response.acceptedAt < award.createdAt ||
      response.acceptedAt >= award.acceptanceDeadlineAt ||
      compareTimestamp(response.validityVerifiedAt, award.acceptanceDeadline) >=
        0 ||
      payload.objectiveId !== award.objectiveId ||
      payload.objectiveDocumentId !== award.objectiveDocumentId ||
      payload.objectiveRevision !== award.objectiveRevision ||
      payload.workItemId !== award.work.workItemId ||
      payload.workItemRevision !== award.work.workItemRevision ||
      payload.ownerPeerId !== state.identity.peerId ||
      payload.ownerEpoch !== award.work.ownerEpoch ||
      payload.assigneePeerId !== award.assigneePeerId ||
      payload.assignmentEpoch !== award.assignmentEpoch ||
      payload.assignmentAuthorityId !== award.assignmentAuthorityId ||
      payload.fencingToken !== award.fencingToken ||
      payload.acceptanceDeadline !== award.acceptanceDeadline
    )
      throw new TypeError(
        "Mesh assignment response evidence binding is invalid",
      );
    retainedMessageIds.add(envelope.messageId);
  }
  for (const reservation of Object.values(state.reservations)) {
    const work = state.workAllocations[reservation.workKey];
    const offer = state.localOffers[reservation.offerId];
    const award = Object.values(state.localAwards).find(
      (entry) => entry.reservationId === reservation.reservationId,
    );
    const response =
      award === undefined
        ? undefined
        : state.assignmentResponses[award.awardId];
    if (
      !work ||
      !offer ||
      offer.reservationId !== reservation.reservationId ||
      reservation.objectiveId !== work.objectiveId ||
      reservation.objectiveDocumentId !== work.objectiveDocumentId ||
      reservation.objectiveRevision !== work.objectiveRevision ||
      reservation.workItemId !== work.work.workItemId ||
      reservation.workItemRevision !== work.work.workItemRevision ||
      reservation.budgetReservationUnits !== work.work.budgetReservationUnits ||
      reservation.reservedAt !== offer.createdAt
    ) {
      throw new TypeError("Mesh allocation reservation binding is invalid");
    }
    if (
      reservation.status === "reserved" &&
      (work.reservationId !== reservation.reservationId ||
        !["offered", "award_pending"].includes(work.phase) ||
        (work.phase === "offered" &&
          work.activeOfferId !== reservation.offerId) ||
        (work.phase === "award_pending" &&
          state.localAwards[work.activeAwardId as string]?.reservationId !==
            reservation.reservationId))
    ) {
      throw new TypeError(
        "Mesh active allocation reservation binding is invalid",
      );
    }
    if (
      reservation.status === "released" &&
      (work.activeOfferId === reservation.offerId ||
        work.reservationId === reservation.reservationId)
    ) {
      throw new TypeError(
        "Mesh released allocation reservation is still active",
      );
    }
    if (
      reservation.status === "committed" &&
      (work.phase !== "active" ||
        work.reservationId !== reservation.reservationId ||
        state.localAwards[work.activeAwardId as string]?.status !==
          "accepted" ||
        response?.kind !== "work.accept" ||
        reservation.committedAt !== response.acceptedAt)
    ) {
      throw new TypeError(
        "Mesh committed allocation reservation binding is invalid",
      );
    }
    if (
      reservation.status === "released" &&
      ((award === undefined &&
        (reservation.releasedAt as number) < offer.bidDeadlineAt) ||
        (award?.status === "declined" &&
          (response?.kind !== "work.decline" ||
            reservation.releasedAt !== response.acceptedAt)) ||
        (award?.status === "timed_out" &&
          (response !== undefined ||
            (reservation.releasedAt as number) < award.acceptanceDeadlineAt)) ||
        (award !== undefined &&
          award.status !== "declined" &&
          award.status !== "timed_out"))
    ) {
      throw new TypeError(
        "Mesh released allocation reservation time is invalid",
      );
    }
  }
  for (const work of Object.values(state.workAllocations)) {
    const workOffers = Object.values(state.localOffers).filter(
      (offer) =>
        workKey(offer.objectiveId, offer.work.workItemId) === work.workKey,
    );
    const workReservations = Object.values(state.reservations).filter(
      (reservation) => reservation.workKey === work.workKey,
    );
    const latestReleasedAt = workReservations.reduce<number | undefined>(
      (latest, reservation) =>
        reservation.status === "released" &&
        reservation.releasedAt !== undefined &&
        (latest === undefined || reservation.releasedAt > latest)
          ? reservation.releasedAt
          : latest,
      undefined,
    );
    if (workOffers.length < 1 || workReservations.length < 1)
      throw new TypeError("Mesh Work allocation is orphaned");
    if (
      work.phase === "ready" &&
      (work.activeOfferId !== undefined ||
        work.bidDeadlineAt !== undefined ||
        work.reservationId !== undefined ||
        work.activeAwardId !== undefined ||
        work.activeAcceptanceId !== undefined ||
        (workReservations.length > 0 && work.updatedAt !== latestReleasedAt))
    ) {
      throw new TypeError(
        "Mesh ready Work allocation has allocation references",
      );
    }
    if (
      work.phase === "offered" &&
      (!work.activeOfferId ||
        work.bidDeadlineAt === undefined ||
        !work.reservationId ||
        work.activeAwardId !== undefined ||
        work.activeAcceptanceId !== undefined ||
        work.updatedAt !== state.localOffers[work.activeOfferId]?.createdAt)
    ) {
      throw new TypeError("Mesh offered Work allocation is invalid");
    }
    if (
      work.phase === "award_pending" &&
      (!work.activeAwardId ||
        !work.reservationId ||
        work.activeOfferId !== undefined ||
        work.bidDeadlineAt !== undefined ||
        work.activeAcceptanceId !== undefined ||
        work.updatedAt !== state.localAwards[work.activeAwardId]?.createdAt)
    )
      throw new TypeError(
        "Mesh pending award Work allocation has invalid keys",
      );
    if (
      work.phase === "active" &&
      (!work.activeAwardId ||
        !work.activeAcceptanceId ||
        !work.reservationId ||
        work.activeOfferId !== undefined ||
        work.bidDeadlineAt !== undefined ||
        work.updatedAt !==
          state.assignmentResponses[work.activeAwardId]?.acceptedAt)
    )
      throw new TypeError("Mesh active Work allocation is invalid");
    if (work.activeOfferId !== undefined) {
      const activeOffer = state.localOffers[work.activeOfferId];
      if (
        !activeOffer ||
        activeOffer.reservationId !== work.reservationId ||
        activeOffer.bidDeadlineAt !== work.bidDeadlineAt
      ) {
        throw new TypeError("Mesh Work allocation active offer is invalid");
      }
    }
  }
}

function freezeWorkAllocation(
  value: MeshWorkAllocationProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshWorkAllocationProjection {
  assertPlainRecord(value, "Work allocation");
  assertExactKeys(
    value,
    [
      "activeOfferId",
      "activeAwardId",
      "activeAcceptanceId",
      "bidDeadlineAt",
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "phase",
      "reservationId",
      "updatedAt",
      "work",
      "workKey",
    ],
    [
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "phase",
      "updatedAt",
      "work",
      "workKey",
    ],
  );
  freezeBinding(value, last, limits);
  if (
    value.workKey !== workKey(value.objectiveId, value.work.workItemId) ||
    !["ready", "offered", "award_pending", "active"].includes(value.phase)
  )
    throw new TypeError("Mesh Work allocation identity is invalid");
  assertOptionalIdentifier(value.activeOfferId, "active offerId");
  assertOptionalIdentifier(value.reservationId, "reservationId");
  if (value.bidDeadlineAt !== undefined)
    assertMeshLogicalTime(value.bidDeadlineAt);
  assertMeshLogicalTime(value.updatedAt);
  if (value.updatedAt > last)
    throw new TypeError("Mesh Work allocation time is invalid");
  assertByteBound(
    value,
    limits.maximumProjectionBytes,
    "Work allocation projection",
  );
  return Object.freeze({
    ...value,
    objectivePolicy: freezePolicy(value.objectivePolicy),
    work: freezeWork(value.work),
  });
}

function freezeLocalOffer(
  value: MeshLocalOfferProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshLocalOfferProjection {
  assertPlainRecord(value, "local offer");
  assertExactKeys(
    value,
    [
      "bidDeadline",
      "bidDeadlineAt",
      "bidDeadlineTimerGeneration",
      "bidDeadlineTimerId",
      "createdAt",
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "offerAttempt",
      "offerId",
      "previousOfferId",
      "recipientOffers",
      "reservationId",
      "validityVerifiedAt",
      "work",
    ],
    [
      "bidDeadline",
      "bidDeadlineAt",
      "bidDeadlineTimerGeneration",
      "bidDeadlineTimerId",
      "createdAt",
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "offerAttempt",
      "offerId",
      "recipientOffers",
      "reservationId",
      "validityVerifiedAt",
      "work",
    ],
  );
  freezeBinding(value, last, limits);
  assertIdentifier(value.offerId, "offerId");
  assertIdentifier(value.reservationId, "offer reservationId");
  assertTimestamp(value.bidDeadline, "offer bidDeadline");
  assertTimestamp(value.validityVerifiedAt, "offer validityVerifiedAt");
  const expectedBidDeadline = logicalDeadline(
    value.bidDeadline,
    value.validityVerifiedAt,
    value.createdAt,
  );
  if (
    !Number.isSafeInteger(value.offerAttempt) ||
    value.offerAttempt < 1 ||
    !Number.isSafeInteger(value.bidDeadlineTimerGeneration) ||
    value.bidDeadlineTimerGeneration < 1
  )
    throw new TypeError("Mesh local offer version is invalid");
  assertOptionalIdentifier(value.previousOfferId, "previousOfferId");
  if (
    value.previousOfferId === value.offerId ||
    (value.offerAttempt === 1 && value.previousOfferId !== undefined) ||
    (value.offerAttempt > 1 && value.previousOfferId === undefined) ||
    value.bidDeadlineTimerId !== bidDeadlineTimerId(value.offerId) ||
    expectedBidDeadline !== value.bidDeadlineAt
  )
    throw new TypeError("Mesh local offer predecessor or timer is invalid");
  assertMeshLogicalTime(value.bidDeadlineAt);
  assertMeshLogicalTime(value.createdAt);
  if (value.createdAt > value.bidDeadlineAt || value.createdAt > last)
    throw new TypeError("Mesh local offer time is invalid");
  assertRecord(value.recipientOffers, "recipient offers");
  const entries = Object.entries(value.recipientOffers);
  if (entries.length < 1 || entries.length > limits.maximumRecipientsPerOffer)
    throw new RangeError("Mesh local offer recipient limit exceeded");
  const recipientOffers = createFrozenRecord(
    entries.map(([peerId, prepared]) => {
      if (peerId !== prepared.recipientPeerId)
        throw new TypeError("Mesh prepared offer recipient key is invalid");
      return [
        peerId,
        freezePreparedOffer(prepared, value, last, limits),
      ] as const;
    }),
  );
  assertByteBound(
    value,
    limits.maximumProjectionBytes,
    "local offer projection",
  );
  return Object.freeze({
    ...value,
    objectivePolicy: freezePolicy(value.objectivePolicy),
    work: freezeWork(value.work),
    recipientOffers,
  });
}

function freezePreparedOffer(
  value: MeshPreparedOfferEnvelope,
  offer: MeshLocalOfferProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshPreparedOfferEnvelope {
  assertPlainRecord(value, "prepared offer envelope");
  assertExactKeys(
    value,
    ["envelope", "messageId", "preparedAt", "recipientPeerId"],
    ["envelope", "messageId", "preparedAt", "recipientPeerId"],
  );
  assertIdentifier(value.recipientPeerId, "prepared offer recipientPeerId");
  assertMeshMessageId(value.messageId);
  assertMeshLogicalTime(value.preparedAt);
  if (value.preparedAt > last)
    throw new TypeError("Mesh prepared offer time is invalid");
  const envelope = validateOfferEnvelope(value.envelope, true);
  if (
    envelope.messageId !== value.messageId ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== value.recipientPeerId ||
    !offerPayloadMatchesBinding(envelope.payload, offer) ||
    envelope.payload.offerId !== offer.offerId ||
    envelope.payload.offerAttempt !== offer.offerAttempt ||
    envelope.payload.previousOfferId !== offer.previousOfferId ||
    envelope.payload.bidDeadline !== offer.bidDeadline
  ) {
    throw new TypeError("Mesh prepared offer envelope binding is invalid");
  }
  const frozen = Object.freeze({
    recipientPeerId: value.recipientPeerId,
    messageId: value.messageId,
    preparedAt: value.preparedAt,
    envelope: deepFreezeCopy(envelope) as SignedMeshEnvelope<WorkOfferPayload>,
  });
  assertByteBound(
    frozen,
    limits.maximumProjectionBytes,
    "prepared offer envelope",
  );
  return frozen;
}

function freezeAcceptedBidEvidence(
  value: MeshAcceptedBidEvidence,
  last: number,
  limits: MeshAllocationLimits,
  verifyDigest: boolean,
): MeshAcceptedBidEvidence {
  assertPlainRecord(value, "accepted bid evidence");
  assertExactKeys(
    value,
    [
      "acceptedAt",
      "bidId",
      "bidRevision",
      "bidderPeerId",
      "envelope",
      "offerId",
      "previousBidId",
      "supportedCriticalExtensions",
      "validityVerifiedAt",
    ],
    [
      "acceptedAt",
      "bidId",
      "bidRevision",
      "bidderPeerId",
      "envelope",
      "offerId",
      "validityVerifiedAt",
    ],
  );
  assertIdentifier(value.bidId, "bidId");
  assertIdentifier(value.offerId, "offerId");
  assertIdentifier(value.bidderPeerId, "bidderPeerId");
  assertOptionalIdentifier(value.previousBidId, "previousBidId");
  assertTimestamp(value.validityVerifiedAt, "bid validityVerifiedAt");
  if (
    value.supportedCriticalExtensions !== undefined &&
    (!Array.isArray(value.supportedCriticalExtensions) ||
      value.supportedCriticalExtensions.some(
        (extension) => typeof extension !== "string" || extension.length === 0,
      ) ||
      new Set(value.supportedCriticalExtensions).size !==
        value.supportedCriticalExtensions.length)
  )
    throw new TypeError("Mesh accepted bid critical extensions are invalid");
  assertMeshLogicalTime(value.acceptedAt);
  if (
    value.acceptedAt > last ||
    !Number.isSafeInteger(value.bidRevision) ||
    value.bidRevision < 1 ||
    value.previousBidId === value.bidId
  )
    throw new TypeError("Mesh accepted bid version or time is invalid");
  const envelope = validateBidEnvelope(value.envelope, verifyDigest);
  const payload = envelope.payload;
  if (
    payload.bidId !== value.bidId ||
    payload.offerId !== value.offerId ||
    payload.bidderPeerId !== value.bidderPeerId ||
    payload.bidRevision !== value.bidRevision ||
    payload.previousBidId !== value.previousBidId ||
    envelope.sender.peerId !== value.bidderPeerId
  )
    throw new TypeError("Mesh accepted bid evidence binding is invalid");
  const frozen = Object.freeze({
    ...value,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...value.supportedCriticalExtensions,
          ]),
        }),
    envelope: deepFreezeCopy(envelope) as SignedMeshEnvelope<WorkBidPayload>,
  });
  assertByteBound(
    frozen,
    limits.maximumProjectionBytes,
    "accepted bid evidence",
  );
  return frozen;
}

function freezeBidHead(
  value: MeshBidHeadProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshBidHeadProjection {
  assertPlainRecord(value, "bid head");
  assertExactKeys(
    value,
    [
      "acceptedAt",
      "acceptedMessageId",
      "bidExpiresAt",
      "bidExpiresAtLogical",
      "bidId",
      "bidKey",
      "bidRevision",
      "bidderPeerId",
      "budgetUnits",
      "capacityReservationUnits",
      "expectedCompletionAt",
      "offerId",
      "previousBidId",
    ],
    [
      "acceptedAt",
      "acceptedMessageId",
      "bidExpiresAt",
      "bidExpiresAtLogical",
      "bidId",
      "bidKey",
      "bidRevision",
      "bidderPeerId",
      "budgetUnits",
      "capacityReservationUnits",
      "expectedCompletionAt",
      "offerId",
    ],
  );
  assertIdentifier(value.offerId, "bid offerId");
  assertIdentifier(value.bidderPeerId, "bidderPeerId");
  assertIdentifier(value.bidId, "bidId");
  assertOptionalIdentifier(value.previousBidId, "previousBidId");
  assertMeshMessageId(value.acceptedMessageId);
  assertTimestamp(value.expectedCompletionAt, "expected completion");
  assertTimestamp(value.bidExpiresAt, "bid expiry");
  assertMeshLogicalTime(value.acceptedAt);
  assertMeshLogicalTime(value.bidExpiresAtLogical);
  if (
    value.bidKey !== bidKey(value.offerId, value.bidderPeerId) ||
    value.acceptedAt > last ||
    value.bidExpiresAtLogical <= value.acceptedAt ||
    !Number.isSafeInteger(value.bidRevision) ||
    value.bidRevision < 1 ||
    !Number.isSafeInteger(value.capacityReservationUnits) ||
    value.capacityReservationUnits < 0 ||
    !Number.isSafeInteger(value.budgetUnits) ||
    value.budgetUnits < 0
  )
    throw new TypeError("Mesh bid head is invalid");
  assertByteBound(value, limits.maximumProjectionBytes, "bid head projection");
  return Object.freeze({ ...value });
}

function freezeLocalAward(
  value: MeshLocalAwardProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshLocalAwardProjection {
  assertPlainRecord(value, "local award");
  assertExactKeys(
    value,
    [
      "acceptanceDeadline",
      "acceptanceDeadlineAt",
      "acceptanceDeadlineTimerGeneration",
      "acceptanceDeadlineTimerId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assigneePeerId",
      "awardId",
      "bidId",
      "bidRevision",
      "budgetReservationUnits",
      "createdAt",
      "fencingToken",
      "leaseExpiresAt",
      "leaseExpiresAtLogical",
      "leaseStartsAt",
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "offerAttempt",
      "offerId",
      "recipientAward",
      "reservationId",
      "status",
      "work",
      "workDeadline",
      "validityVerifiedAt",
    ],
    [
      "acceptanceDeadline",
      "acceptanceDeadlineAt",
      "acceptanceDeadlineTimerGeneration",
      "acceptanceDeadlineTimerId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assigneePeerId",
      "awardId",
      "bidId",
      "bidRevision",
      "budgetReservationUnits",
      "createdAt",
      "fencingToken",
      "leaseExpiresAt",
      "leaseExpiresAtLogical",
      "leaseStartsAt",
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "offerAttempt",
      "offerId",
      "recipientAward",
      "reservationId",
      "status",
      "work",
      "workDeadline",
      "validityVerifiedAt",
    ],
  );
  freezeBinding(value, last, limits);
  for (const name of [
    "awardId",
    "offerId",
    "bidId",
    "assigneePeerId",
    "assignmentAuthorityId",
    "fencingToken",
    "reservationId",
  ])
    assertIdentifier((value as Record<string, unknown>)[name], name);
  if (
    value.assignmentEpoch !== 1 ||
    value.assignmentAuthorityId !== value.awardId ||
    value.fencingToken !== value.awardId ||
    value.acceptanceDeadlineTimerId !==
      `allocation.acceptance.${value.awardId}` ||
    !["awaiting_acceptance", "accepted", "declined", "timed_out"].includes(
      value.status,
    )
  )
    throw new TypeError("Mesh local award authority is invalid");
  assertTimestamp(value.acceptanceDeadline, "award acceptanceDeadline");
  assertMeshLogicalTime(value.acceptanceDeadlineAt);
  assertMeshLogicalTime(value.createdAt);
  assertTimestamp(value.workDeadline, "award workDeadline");
  assertTimestamp(value.validityVerifiedAt, "award validityVerifiedAt");
  assertTimestamp(value.leaseStartsAt, "award leaseStartsAt");
  assertTimestamp(value.leaseExpiresAt, "award leaseExpiresAt");
  assertMeshLogicalTime(value.leaseExpiresAtLogical);
  if (
    value.createdAt > last ||
    value.acceptanceDeadlineAt <= value.createdAt ||
    value.leaseExpiresAtLogical <= value.createdAt ||
    !Number.isSafeInteger(value.offerAttempt) ||
    value.offerAttempt < 1 ||
    !Number.isSafeInteger(value.bidRevision) ||
    value.bidRevision < 1 ||
    !Number.isSafeInteger(value.budgetReservationUnits) ||
    value.budgetReservationUnits < 0 ||
    !Number.isSafeInteger(value.acceptanceDeadlineTimerGeneration) ||
    value.acceptanceDeadlineTimerGeneration < 1
  )
    throw new TypeError("Mesh local award time is invalid");
  const prepared = value.recipientAward;
  assertPlainRecord(prepared, "prepared award");
  assertExactKeys(
    prepared,
    ["envelope", "messageId", "preparedAt", "recipientPeerId"],
    ["envelope", "messageId", "preparedAt", "recipientPeerId"],
  );
  assertMeshMessageId(prepared.messageId);
  assertMeshLogicalTime(prepared.preparedAt);
  const parsed = validateSignedMeshEnvelope(prepared.envelope);
  const expectedAcceptanceDeadline = logicalDeadline(
    value.acceptanceDeadline,
    value.validityVerifiedAt,
    value.createdAt,
  );
  const expectedLeaseExpiry = logicalDeadline(
    value.leaseExpiresAt,
    value.validityVerifiedAt,
    value.createdAt,
  );
  if (
    !parsed.ok ||
    parsed.value.payload.type !== "work.award" ||
    !canonicalDigest(parsed.value as SignedMeshEnvelope<WorkAwardPayload>) ||
    prepared.envelope.messageId !== prepared.messageId ||
    prepared.envelope.audience.kind !== "peer" ||
    prepared.envelope.audience.peerId !== value.assigneePeerId ||
    prepared.recipientPeerId !== value.assigneePeerId ||
    prepared.preparedAt !== value.createdAt ||
    prepared.envelope.objectiveId !== value.objectiveId ||
    prepared.envelope.payload.authorityKind !== "award" ||
    prepared.envelope.payload.awardId !== value.awardId ||
    prepared.envelope.payload.offerId !== value.offerId ||
    prepared.envelope.payload.bidId !== value.bidId ||
    prepared.envelope.payload.bidRevision !== value.bidRevision ||
    prepared.envelope.payload.offerAttempt !== value.offerAttempt ||
    prepared.envelope.payload.objectiveId !== value.objectiveId ||
    prepared.envelope.payload.objectiveDocumentId !==
      value.objectiveDocumentId ||
    prepared.envelope.payload.objectiveRevision !== value.objectiveRevision ||
    prepared.envelope.payload.workItemId !== value.work.workItemId ||
    prepared.envelope.payload.workItemRevision !==
      value.work.workItemRevision ||
    prepared.envelope.payload.ownerPeerId !== value.work.ownerPeerId ||
    prepared.envelope.payload.ownerEpoch !== value.work.ownerEpoch ||
    prepared.envelope.payload.assigneePeerId !== value.assigneePeerId ||
    prepared.envelope.payload.assignmentEpoch !== value.assignmentEpoch ||
    prepared.envelope.payload.assignmentAuthorityId !==
      value.assignmentAuthorityId ||
    prepared.envelope.payload.fencingToken !== value.fencingToken ||
    prepared.envelope.payload.budgetReservationUnits !==
      value.budgetReservationUnits ||
    prepared.envelope.payload.workDeadline !== value.workDeadline ||
    prepared.envelope.payload.leaseStartsAt !== value.leaseStartsAt ||
    prepared.envelope.payload.leaseExpiresAt !== value.leaseExpiresAt ||
    prepared.envelope.payload.acceptanceDeadline !== value.acceptanceDeadline
  )
    throw new TypeError("Mesh prepared award binding is invalid");
  if (
    expectedAcceptanceDeadline !== value.acceptanceDeadlineAt ||
    expectedLeaseExpiry !== value.leaseExpiresAtLogical
  )
    throw new TypeError("Mesh local award logical deadline is invalid");
  assertByteBound(
    value,
    limits.maximumProjectionBytes,
    "local award projection",
  );
  return Object.freeze({
    ...value,
    objectivePolicy: freezePolicy(value.objectivePolicy),
    work: freezeWork(value.work),
    recipientAward: Object.freeze({
      ...prepared,
      envelope: deepFreezeCopy(
        parsed.value,
      ) as SignedMeshEnvelope<WorkAwardPayload>,
    }),
  });
}

function freezeAssignmentResponse(
  value: MeshAcceptedAssignmentResponseEvidence,
  last: number,
  limits: MeshAllocationLimits,
): MeshAcceptedAssignmentResponseEvidence {
  assertPlainRecord(value, "assignment response");
  assertExactKeys(
    value,
    [
      "acceptedAt",
      "awardId",
      "envelope",
      "kind",
      "responseId",
      "supportedCriticalExtensions",
      "validityVerifiedAt",
    ],
    [
      "acceptedAt",
      "awardId",
      "envelope",
      "kind",
      "responseId",
      "validityVerifiedAt",
    ],
  );
  assertIdentifier(value.awardId, "response awardId");
  assertIdentifier(value.responseId, "responseId");
  assertMeshLogicalTime(value.acceptedAt);
  assertTimestamp(value.validityVerifiedAt, "response validityVerifiedAt");
  if (
    value.supportedCriticalExtensions !== undefined &&
    (!Array.isArray(value.supportedCriticalExtensions) ||
      value.supportedCriticalExtensions.some(
        (extension) => typeof extension !== "string" || extension.length === 0,
      ) ||
      new Set(value.supportedCriticalExtensions).size !==
        value.supportedCriticalExtensions.length)
  )
    throw new TypeError(
      "Mesh assignment response critical extensions are invalid",
    );
  const parsed = validateSignedMeshEnvelope(value.envelope);
  const context =
    parsed.ok &&
    validateMeshEnvelopeContext(parsed.value, {
      tenantId: value.envelope.tenantId,
      meshId: value.envelope.meshId,
      peerId:
        value.envelope.audience.kind === "peer"
          ? value.envelope.audience.peerId
          : "",
      receivedAt: value.validityVerifiedAt,
      ...(value.supportedCriticalExtensions === undefined
        ? {}
        : { supportedCriticalExtensions: value.supportedCriticalExtensions }),
    });
  if (
    !parsed.ok ||
    !context ||
    !context.ok ||
    !canonicalDigest(
      parsed.value as SignedMeshEnvelope<
        WorkAcceptPayload | WorkDeclinePayload
      >,
    ) ||
    (parsed.value.payload.type !== "work.accept" &&
      parsed.value.payload.type !== "work.decline") ||
    parsed.value.payload.awardId !== value.awardId ||
    (parsed.value.payload.type === "work.accept"
      ? parsed.value.payload.acceptanceId
      : parsed.value.payload.declineId) !== value.responseId ||
    parsed.value.payload.type !== value.kind ||
    value.acceptedAt > last
  )
    throw new TypeError("Mesh assignment response binding is invalid");
  assertByteBound(
    value,
    limits.maximumProjectionBytes,
    "assignment response evidence",
  );
  return Object.freeze({
    ...value,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...value.supportedCriticalExtensions,
          ]),
        }),
    envelope: deepFreezeCopy(parsed.value) as SignedMeshEnvelope<
      WorkAcceptPayload | WorkDeclinePayload
    >,
  });
}

function freezeReservation(
  value: MeshAllocationReservation,
  last: number,
  limits: MeshAllocationLimits,
): MeshAllocationReservation {
  assertPlainRecord(value, "allocation reservation");
  assertExactKeys(
    value,
    [
      "budgetReservationUnits",
      "committedAt",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "offerId",
      "releasedAt",
      "reservationId",
      "reservedAt",
      "status",
      "workItemId",
      "workItemRevision",
      "workKey",
    ],
    [
      "budgetReservationUnits",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "offerId",
      "reservationId",
      "reservedAt",
      "status",
      "workItemId",
      "workItemRevision",
      "workKey",
    ],
  );
  for (const [name, id] of Object.entries({
    reservationId: value.reservationId,
    offerId: value.offerId,
    objectiveId: value.objectiveId,
    objectiveDocumentId: value.objectiveDocumentId,
    workItemId: value.workItemId,
  }))
    assertIdentifier(id, name);
  assertMeshLogicalTime(value.reservedAt);
  if (
    value.workKey !== workKey(value.objectiveId, value.workItemId) ||
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1 ||
    !Number.isSafeInteger(value.workItemRevision) ||
    value.workItemRevision < 1 ||
    value.reservedAt > last ||
    !Number.isSafeInteger(value.budgetReservationUnits) ||
    value.budgetReservationUnits < 0 ||
    !["reserved", "committed", "released"].includes(value.status)
  )
    throw new TypeError("Mesh allocation reservation is invalid");
  if (
    (value.status !== "committed" && value.committedAt !== undefined) ||
    (value.status === "committed" &&
      (value.committedAt === undefined ||
        !Number.isSafeInteger(value.committedAt) ||
        value.committedAt < value.reservedAt ||
        value.committedAt > last)) ||
    (value.status !== "released" && value.releasedAt !== undefined) ||
    (value.status === "released" &&
      (value.releasedAt === undefined ||
        !Number.isSafeInteger(value.releasedAt) ||
        value.releasedAt < value.reservedAt ||
        value.releasedAt > last))
  )
    throw new TypeError("Mesh allocation reservation release is invalid");
  assertByteBound(
    value,
    limits.maximumProjectionBytes,
    "allocation reservation",
  );
  return Object.freeze({ ...value });
}

function freezeBinding(
  value: MeshAllocationWorkBinding,
  last: number,
  limits: MeshAllocationLimits,
): void {
  for (const [name, id] of Object.entries({
    objectiveId: value.objectiveId,
    objectiveDocumentId: value.objectiveDocumentId,
  }))
    assertIdentifier(id, name);
  if (
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1
  )
    throw new TypeError("Mesh allocation Objective revision is invalid");
  const policy = freezePolicy(value.objectivePolicy);
  const work = freezeWork(value.work);
  if (
    policy.objectiveId !== value.objectiveId ||
    policy.objectiveDocumentId !== value.objectiveDocumentId ||
    policy.objectiveRevision !== value.objectiveRevision ||
    work.objectiveId !== value.objectiveId ||
    work.objectiveDocumentId !== value.objectiveDocumentId ||
    work.objectiveRevision !== value.objectiveRevision ||
    !deepEqual(policy, work.objectivePolicy)
  )
    throw new TypeError(
      "Mesh allocation Work/Objective policy binding is invalid",
    );
  if (work.status !== "ready" || work.ownerEpoch !== 1 || work.updatedAt > last)
    throw new TypeError("Mesh allocation Work is not operational");
  assertByteBound(
    value,
    limits.maximumProjectionBytes,
    "allocation Work binding",
  );
}

function freezePolicy(
  value: MeshWorkObjectivePolicySnapshot,
): MeshWorkObjectivePolicySnapshot {
  assertPlainRecord(value, "allocation Objective policy");
  assertExactKeys(
    value,
    [
      "acceptedAt",
      "acceptedMessageId",
      "expiresAt",
      "maximumBudgetUnits",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "permittedCapabilityKeys",
      "validUntil",
    ],
    [
      "acceptedAt",
      "acceptedMessageId",
      "expiresAt",
      "maximumBudgetUnits",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "permittedCapabilityKeys",
      "validUntil",
    ],
  );
  assertIdentifier(value.objectiveId, "policy objectiveId");
  assertIdentifier(value.objectiveDocumentId, "policy objectiveDocumentId");
  assertMeshMessageId(value.acceptedMessageId);
  assertTimestamp(value.validUntil, "policy validUntil");
  if (
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1 ||
    !Number.isSafeInteger(value.maximumBudgetUnits) ||
    value.maximumBudgetUnits < 0 ||
    !Array.isArray(value.permittedCapabilityKeys) ||
    value.permittedCapabilityKeys.some((key) => typeof key !== "string") ||
    !Number.isSafeInteger(value.acceptedAt) ||
    value.acceptedAt < 0 ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt <= value.acceptedAt
  )
    throw new TypeError("Mesh allocation Objective policy is invalid");
  const copy = deepFreezeCopy(value) as MeshWorkObjectivePolicySnapshot;
  return copy;
}
function freezeWork(value: MeshWorkItemProjection): MeshWorkItemProjection {
  assertPlainRecord(value, "allocation Work");
  assertExactKeys(
    value,
    [
      "budgetReservationUnits",
      "completionCriteria",
      "createdAt",
      "expiryTimerGeneration",
      "expiryTimerId",
      "inputReference",
      "inputSummary",
      "matchingAttributes",
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "offerAttempt",
      "ownerEpoch",
      "ownerPeerId",
      "requiredCapabilityKeys",
      "status",
      "terminalAt",
      "updatedAt",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
    [
      "budgetReservationUnits",
      "completionCriteria",
      "createdAt",
      "matchingAttributes",
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "offerAttempt",
      "ownerEpoch",
      "ownerPeerId",
      "requiredCapabilityKeys",
      "status",
      "updatedAt",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
  );
  for (const [name, id] of Object.entries({
    objectiveId: value.objectiveId,
    objectiveDocumentId: value.objectiveDocumentId,
    workItemId: value.workItemId,
    ownerPeerId: value.ownerPeerId,
  }))
    assertIdentifier(id, name);
  if (
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1 ||
    !Number.isSafeInteger(value.workItemRevision) ||
    value.workItemRevision < 1 ||
    !Number.isSafeInteger(value.offerAttempt) ||
    value.offerAttempt < 0 ||
    !Number.isSafeInteger(value.budgetReservationUnits) ||
    value.budgetReservationUnits < 0 ||
    !Number.isSafeInteger(value.workDeadlineAt) ||
    value.workDeadlineAt < 0 ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < 0 ||
    value.ownerEpoch !== 1 ||
    value.status !== "ready" ||
    !Array.isArray(value.requiredCapabilityKeys) ||
    !Array.isArray(value.completionCriteria) ||
    !value.matchingAttributes ||
    typeof value.matchingAttributes !== "object" ||
    (Object.getPrototypeOf(value.matchingAttributes) !== null &&
      Object.getPrototypeOf(value.matchingAttributes) !== Object.prototype) ||
    typeof value.workDeadline !== "string"
  )
    throw new TypeError("Mesh allocation Work is invalid");
  return Object.freeze({
    ...(deepFreezeCopy(value) as MeshWorkItemProjection),
    matchingAttributes: createFrozenRecord(
      Object.entries(value.matchingAttributes),
    ),
  });
}

function validateOfferEnvelope(
  input: unknown,
  verifyDigest: boolean,
): SignedMeshEnvelope<WorkOfferPayload> {
  const validated = validateSignedMeshEnvelope(input);
  if (!validated.ok || validated.value.payload.type !== "work.offer")
    throw new TypeError("Mesh signed work offer envelope is invalid");
  const envelope = validated.value as SignedMeshEnvelope<WorkOfferPayload>;
  if (verifyDigest) assertCanonicalPayloadDigest(envelope);
  return envelope;
}
function validateBidEnvelope(
  input: unknown,
  verifyDigest: boolean,
): SignedMeshEnvelope<WorkBidPayload> {
  const validated = validateSignedMeshEnvelope(input);
  if (!validated.ok || validated.value.payload.type !== "work.bid")
    throw new TypeError("Mesh signed work bid envelope is invalid");
  const envelope = validated.value as SignedMeshEnvelope<WorkBidPayload>;
  if (verifyDigest) assertCanonicalPayloadDigest(envelope);
  return envelope;
}
function assertCanonicalPayloadDigest(
  envelope: SignedMeshEnvelope<
    | WorkOfferPayload
    | WorkBidPayload
    | WorkAwardPayload
    | WorkAcceptPayload
    | WorkDeclinePayload
  >,
): void {
  const canonical = canonicalizeMeshPayload(envelope.payload);
  if (
    !canonical.ok ||
    envelope.payloadHash !== `sha256:${sha256Base64Url(canonical.value)}`
  )
    throw new TypeError("Mesh signed allocation payload digest is invalid");
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
  try {
    assertCanonicalPayloadDigest(envelope);
    return true;
  } catch {
    return false;
  }
}

function offerPayloadMatchesBinding(
  payload: WorkOfferPayload,
  binding: MeshAllocationWorkBinding,
): boolean {
  const work = binding.work;
  return (
    payload.objectiveId === binding.objectiveId &&
    payload.objectiveDocumentId === binding.objectiveDocumentId &&
    payload.objectiveRevision === binding.objectiveRevision &&
    payload.workItemId === work.workItemId &&
    payload.workItemRevision === work.workItemRevision &&
    payload.ownerPeerId === work.ownerPeerId &&
    payload.ownerEpoch === work.ownerEpoch &&
    payload.requiredCapabilityKeys.length ===
      work.requiredCapabilityKeys.length &&
    payload.requiredCapabilityKeys.every(
      (value, index) => value === work.requiredCapabilityKeys[index],
    ) &&
    deepEqual(payload.matchingAttributes, work.matchingAttributes) &&
    payload.completionCriteria.length === work.completionCriteria.length &&
    payload.completionCriteria.every(
      (value, index) => value === work.completionCriteria[index],
    ) &&
    payload.budgetReservationUnits === work.budgetReservationUnits &&
    payload.workDeadline === work.workDeadline &&
    ((payload.inputSummary === work.inputSummary &&
      payload.inputReference === undefined) ||
      (payload.inputReference === work.inputReference &&
        payload.inputSummary === undefined))
  );
}
function bidPayloadMatchesOffer(
  payload: WorkBidPayload,
  offer: MeshLocalOfferProjection,
): boolean {
  const work = offer.work;
  return (
    payload.offerId === offer.offerId &&
    payload.objectiveId === offer.objectiveId &&
    payload.objectiveDocumentId === offer.objectiveDocumentId &&
    payload.objectiveRevision === offer.objectiveRevision &&
    payload.workItemId === work.workItemId &&
    payload.workItemRevision === work.workItemRevision &&
    payload.ownerPeerId === work.ownerPeerId &&
    payload.ownerEpoch === work.ownerEpoch &&
    payload.offerAttempt === offer.offerAttempt &&
    payload.bidDeadline === offer.bidDeadline &&
    payload.workDeadline === work.workDeadline &&
    payload.capacityReservationUnits >= 0 &&
    payload.budgetUnits >= 0
  );
}
function bidHeadMatchesEvidence(
  head: MeshBidHeadProjection,
  evidence: MeshAcceptedBidEvidence,
): boolean {
  const payload = evidence.envelope.payload;
  const bidExpiresAtLogical = logicalDeadline(
    payload.bidExpiresAt,
    evidence.validityVerifiedAt,
    evidence.acceptedAt,
  );
  return (
    head.offerId === evidence.offerId &&
    head.bidderPeerId === evidence.bidderPeerId &&
    head.bidId === evidence.bidId &&
    head.bidRevision === evidence.bidRevision &&
    head.previousBidId === evidence.previousBidId &&
    head.acceptedMessageId === evidence.envelope.messageId &&
    head.acceptedAt === evidence.acceptedAt &&
    head.capacityReservationUnits === payload.capacityReservationUnits &&
    head.budgetUnits === payload.budgetUnits &&
    head.expectedCompletionAt === payload.expectedCompletionAt &&
    head.bidExpiresAt === payload.bidExpiresAt &&
    head.bidExpiresAtLogical === bidExpiresAtLogical
  );
}
function validateBidChain(
  head: MeshBidHeadProjection,
  evidence: readonly MeshAcceptedBidEvidence[],
): void {
  const byId = new Map(evidence.map((entry) => [entry.bidId, entry]));
  if (byId.size !== evidence.length)
    throw new TypeError("Mesh bid evidence identifiers are not unique");
  let current = byId.get(head.bidId);
  let expectedRevision = head.bidRevision;
  const seen = new Set<string>();
  while (current) {
    if (
      seen.has(current.bidId) ||
      current.bidRevision !== expectedRevision ||
      current.offerId !== head.offerId ||
      current.bidderPeerId !== head.bidderPeerId
    )
      throw new TypeError("Mesh bid evidence chain is invalid");
    seen.add(current.bidId);
    if (current.bidRevision === 1) {
      if (current.previousBidId !== undefined)
        throw new TypeError("Mesh initial bid predecessor is invalid");
      break;
    }
    const previous =
      current.previousBidId === undefined
        ? undefined
        : byId.get(current.previousBidId);
    if (!previous || previous.acceptedAt > current.acceptedAt)
      throw new TypeError("Mesh bid predecessor binding is invalid");
    current = previous;
    expectedRevision -= 1;
  }
  if (seen.size !== evidence.length || expectedRevision !== 1)
    throw new TypeError("Mesh bid evidence is orphaned or incomplete");
}
function preparedCausationExists(
  offer: MeshLocalOfferProjection,
  bidderPeerId: string,
  causationId: string,
): boolean {
  const prepared = offer.recipientOffers[bidderPeerId];
  return prepared !== undefined && prepared.messageId === causationId;
}
function bindingsEqual(
  binding: MeshAllocationWorkBinding,
  work: MeshWorkItemProjection,
): boolean {
  return (
    binding.objectiveId === work.objectiveId &&
    binding.objectiveDocumentId === work.objectiveDocumentId &&
    binding.objectiveRevision === work.objectiveRevision &&
    deepEqual(binding.objectivePolicy, work.objectivePolicy) &&
    deepEqual(binding.work, work)
  );
}
function workKey(objectiveId: string, workItemId: string): string {
  return JSON.stringify([objectiveId, workItemId]);
}
function bidKey(offerId: string, bidderPeerId: string): string {
  return JSON.stringify([offerId, bidderPeerId]);
}
function domainRecordKey(type: string, id: string): string {
  return JSON.stringify([type, id]);
}
function bidDeadlineTimerId(offerId: string): string {
  return `allocation.bid.${offerId}`;
}

function migrateLegacyOffers(value: unknown): unknown {
  assertPlainRecord(value, "legacy local offers");
  return Object.fromEntries(
    Object.entries(value).map(([key, rawOffer]) => {
      assertPlainRecord(rawOffer, "legacy local offer");
      const createdAt = rawOffer.createdAt;
      const bidDeadlineAt = rawOffer.bidDeadlineAt;
      const bidDeadline = rawOffer.bidDeadline;
      if (
        !Number.isSafeInteger(createdAt) ||
        !Number.isSafeInteger(bidDeadlineAt) ||
        (bidDeadlineAt as number) <= (createdAt as number) ||
        typeof bidDeadline !== "string"
      ) {
        throw new TypeError("Mesh legacy local offer deadline is invalid");
      }
      let validityVerifiedAt = subtractTimestampMilliseconds(
        bidDeadline,
        (bidDeadlineAt as number) - (createdAt as number),
      );
      assertPlainRecord(
        rawOffer.recipientOffers,
        "legacy local offer recipients",
      );
      for (const rawPrepared of Object.values(rawOffer.recipientOffers)) {
        assertPlainRecord(rawPrepared, "legacy prepared offer");
        assertPlainRecord(
          rawPrepared.envelope,
          "legacy prepared offer envelope",
        );
        const sentAt = rawPrepared.envelope.sentAt;
        if (typeof sentAt !== "string")
          throw new TypeError("Mesh legacy local offer deadline is invalid");
        if (compareTimestamp(validityVerifiedAt, sentAt) < 0)
          validityVerifiedAt = sentAt;
      }
      if (
        logicalDeadline(
          bidDeadline,
          validityVerifiedAt,
          createdAt as number,
        ) !== bidDeadlineAt
      )
        throw new TypeError("Mesh legacy local offer deadline is invalid");
      return [
        key,
        {
          ...rawOffer,
          validityVerifiedAt,
        },
      ];
    }),
  );
}

function subtractTimestampMilliseconds(
  timestamp: string,
  milliseconds: number,
): string {
  const match = rfc3339Pattern.exec(timestamp);
  if (!match || !Number.isSafeInteger(milliseconds) || milliseconds < 1)
    throw new TypeError("Mesh legacy local offer deadline is invalid");
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText = "",
    zone,
    offsetSign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const offsetMinutes =
    zone === "Z"
      ? 0
      : (Number(offsetHourText) * 60 + Number(offsetMinuteText)) *
        (offsetSign === "+" ? 1 : -1);
  const wholeMilliseconds =
    Date.UTC(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      Number(hourText),
      Number(minuteText),
      Number(secondText),
    ) -
    offsetMinutes * 60_000;
  const timestampNanoseconds =
    BigInt(wholeMilliseconds) * 1_000_000n +
    BigInt(fractionText.padEnd(9, "0"));
  const anchorNanoseconds =
    timestampNanoseconds - BigInt(milliseconds) * 1_000_000n;
  if (anchorNanoseconds < 0n)
    throw new TypeError("Mesh legacy local offer deadline is invalid");
  const wholeSeconds = anchorNanoseconds / 1_000_000_000n;
  const fraction = anchorNanoseconds % 1_000_000_000n;
  const epochMilliseconds = wholeSeconds * 1_000n;
  if (
    epochMilliseconds > 8_640_000_000_000_000n ||
    epochMilliseconds < -8_640_000_000_000_000n
  )
    throw new TypeError("Mesh legacy local offer deadline is invalid");
  const base = new Date(Number(epochMilliseconds)).toISOString().slice(0, 19);
  return `${base}.${fraction.toString().padStart(9, "0")}Z`;
}

function resolveLimits(
  overrides: Partial<MeshAllocationLimits> | undefined,
  complete: boolean,
): MeshAllocationLimits {
  if (overrides !== undefined) {
    assertPlainRecord(overrides, "allocation limits");
    assertExactKeys(overrides, limitKeys, complete ? limitKeys : []);
  }
  const limits = { ...DEFAULT_MESH_ALLOCATION_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    const ceiling =
      DEFAULT_MESH_ALLOCATION_LIMITS[name as keyof MeshAllocationLimits];
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling)
      throw new RangeError(`Mesh allocation limit ${name} is invalid`);
  }
  return Object.freeze(limits);
}
function freezeIdentity(identity: MeshPeerIdentity): MeshPeerIdentity {
  assertPlainRecord(identity, "allocation identity");
  assertExactKeys(identity, identityKeys, identityKeys);
  for (const [name, value] of Object.entries(identity))
    assertIdentifier(value, name);
  return Object.freeze({ ...identity });
}
function assertAlignedIdentity(
  expected: MeshPeerIdentity,
  actual: MeshPeerIdentity,
  name: string,
): void {
  for (const key of identityKeys)
    if (expected[key] !== actual[key])
      throw new TypeError(`Mesh ${name} runtime identity is not aligned`);
}
function assertIdentifier(value: unknown, name: string): void {
  if (
    typeof value !== "string" ||
    !identifierPattern.test(value) ||
    utf8Encoder.encode(value).byteLength > 256
  )
    throw new TypeError(`Invalid Mesh allocation ${name}`);
}
function assertOptionalIdentifier(value: unknown, name: string): void {
  if (value !== undefined) assertIdentifier(value, name);
}
function assertOptionalBidKey(value: unknown): void {
  if (value !== undefined) {
    if (typeof value !== "string")
      throw new TypeError("Mesh bid key is invalid");
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 2)
      throw new TypeError("Mesh bid key is invalid");
    assertIdentifier(parsed[0], "bid key offerId");
    assertIdentifier(parsed[1], "bid key bidderPeerId");
    if (value !== bidKey(parsed[0], parsed[1]))
      throw new TypeError("Mesh bid key is invalid");
  }
}
function assertTimestamp(value: unknown, name: string): void {
  if (typeof value !== "string" || !compareMeshTimestamps(value, value).ok)
    throw new TypeError(`Invalid Mesh allocation ${name}`);
}
function compareTimestamp(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError("Invalid Mesh allocation timestamp");
  return result.value;
}
function assertRecord(
  value: unknown,
  name: string,
): asserts value is Readonly<Record<string, unknown>> {
  assertPlainRecord(value, name);
}
function assertPlainRecord(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(`Mesh allocation ${name} must be a plain record`);
}
function assertExactKeys(
  value: object,
  allowed: readonly string[],
  required: readonly string[],
): void {
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw new TypeError("Mesh allocation record has invalid keys");
}
function assertByteBound(value: unknown, maximum: number, name: string): void {
  let encoded: Uint8Array;
  try {
    encoded = utf8Encoder.encode(JSON.stringify(value));
  } catch {
    throw new TypeError(`Mesh allocation ${name} is not serializable`);
  }
  if (encoded.byteLength > maximum)
    throw new RangeError(`Mesh allocation ${name} exceeds its byte limit`);
}
function deepFreezeCopy(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreezeCopy));
  if (value && typeof value === "object") {
    const copy = Object.create(
      Object.getPrototypeOf(value) === null ? null : Object.prototype,
    ) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(value))
      copy[key] = deepFreezeCopy(entry);
    return Object.freeze(copy);
  }
  return value;
}
function isDeepFrozenData(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeepFrozenData);
}
function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
