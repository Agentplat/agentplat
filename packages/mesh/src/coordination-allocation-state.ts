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
  type WorkProgressPayload,
  type WorkCheckpointPayload,
  type WorkResultPayload,
  type WorkReleasePayload,
  type WorkCancelPayload,
  type LeaseRenewPayload,
  type LeaseTakeoverProposalPayload,
  type LeaseVotePayload,
  type LeaseCertificatePayload,
  type WorkOfferPayload,
} from "@agentplat/mesh-protocol";

import type { MeshPeerIdentity } from "./contracts.js";
import type {
  MeshAcceptedBidEvidence,
  MeshAcceptedAssignmentResponseEvidence,
  MeshAssigneeAssignmentAuthorityProjection,
  MeshAssignmentFenceHeadProjection,
  MeshAllocationLimits,
  MeshAllocationReservation,
  MeshAllocationRuntimeState,
  MeshAllocationState,
  MeshAllocationStateOptions,
  MeshAllocationWorkBinding,
  MeshBidHeadProjection,
  MeshLocalOfferProjection,
  MeshLocalAwardProjection,
  MeshLocalAssignmentResponseEvidence,
  MeshLocalBidProjection,
  MeshPreparedAwardEnvelope,
  MeshPreparedOfferEnvelope,
  MeshReceivedAwardProjection,
  MeshReceivedOfferProjection,
  MeshExecutionHeadProjection,
  MeshLeaseHeadProjection,
  MeshLeaseRenewalEvidence,
  MeshLeaseVoteProjection,
  MeshRecoveryCertificateProjection,
  MeshTakeoverProposalProjection,
  MeshWitnessAssignmentProjection,
  MeshExecutionPayload,
  MeshExecutionRecordProjection,
  MeshWorkAllocationProjection,
} from "./coordination-allocation-contracts.js";
import type {
  MeshCoordinationState,
  MeshCoordinationTimer,
} from "./coordination-contracts.js";
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
  recordEntries,
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
  "maximumAssignmentFenceHeads",
  "maximumAssignmentResponses",
  "maximumAssignmentAuthorities",
  "maximumExecutionHeads",
  "maximumExecutionRecords",
  "maximumExecutionRecordsPerAssignment",
  "maximumLeaseRenewals",
  "maximumLeaseVotes",
  "maximumAwards",
  "maximumBidHeads",
  "maximumBidsPerOffer",
  "maximumOffers",
  "maximumOffersPerWorkItem",
  "maximumProjectionBytes",
  "maximumLocalAssignmentResponses",
  "maximumLocalBids",
  "maximumReceivedAwards",
  "maximumReceivedOffers",
  "maximumRecipientsPerOffer",
  "maximumRecoveryCertificates",
  "maximumTakeoverProposals",
  "maximumWitnessAssignments",
] as const;

/** Fixed ceilings; a caller can only configure lower bounds. */
export const DEFAULT_MESH_ALLOCATION_LIMITS: Readonly<MeshAllocationLimits> =
  Object.freeze({
    maximumAssignmentFenceHeads: 8_192,
    maximumAssignmentResponses: 8_192,
    maximumAssignmentAuthorities: 8_192,
    maximumExecutionHeads: 8_192,
    maximumExecutionRecords: 32_768,
    maximumExecutionRecordsPerAssignment: 1_024,
    maximumLeaseRenewals: 8_192,
    maximumLeaseVotes: 32_768,
    maximumAwards: 8_192,
    maximumOffers: 8_192,
    maximumOffersPerWorkItem: 32,
    maximumBidHeads: 32_768,
    maximumBidsPerOffer: 512,
    maximumRecipientsPerOffer: 128,
    maximumProjectionBytes: 262_144,
    maximumLocalAssignmentResponses: 8_192,
    maximumLocalBids: 8_192,
    maximumReceivedAwards: 8_192,
    maximumReceivedOffers: 8_192,
    maximumRecoveryCertificates: 8_192,
    maximumTakeoverProposals: 8_192,
    maximumWitnessAssignments: 8_192,
  });

/** Checks every retained Allocation envelope, including fanout and witness copies. */
export function meshAllocationRetainsMessageId(
  state: MeshAllocationRuntimeState,
  messageId: string,
): boolean {
  const recoveryEvidence = [
    ...Object.values(state.allocation.takeoverProposals),
    ...Object.values(state.allocation.leaseVotes),
    ...Object.values(state.allocation.recoveryCertificates),
  ];
  return (
    Object.values(state.coordination.domainRecords).some(
      (record) => record.messageId === messageId,
    ) ||
    Object.values(state.allocation.localOffers).some((offer) =>
      Object.values(offer.recipientOffers).some(
        (prepared) => prepared.messageId === messageId,
      ),
    ) ||
    Object.values(state.allocation.acceptedBidEvidence).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localAwards).some(
      (record) => record.recipientAward.messageId === messageId,
    ) ||
    Object.values(state.allocation.assignmentResponses).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.receivedOffers).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localBids).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.receivedAwards).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localAssignmentResponses).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.executionRecords).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.leaseRenewals).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    recoveryEvidence.some(
      (record) =>
        record.envelope.messageId === messageId ||
        Object.values(record.recipientEnvelopes ?? {}).some(
          (envelope) => envelope.messageId === messageId,
        ),
    ) ||
    Object.values(state.allocation.witnessAssignments).some(
      (witness) =>
        witness.awardEnvelope.messageId === messageId ||
        witness.acceptanceEnvelope?.messageId === messageId ||
        witness.leaseRenewals.some(
          (renewal) => renewal.envelope.messageId === messageId,
        ) ||
        witness.latestCheckpoint?.envelope.messageId === messageId,
    )
  );
}

/** Creates an empty separately restorable allocation projection. */
export function createMeshAllocationState(
  options: MeshAllocationStateOptions,
): MeshAllocationState {
  assertPlainRecord(options, "allocation state options");
  assertExactKeys(options, ["identity", "limits"], ["identity"]);
  return Object.freeze({
    schemaVersion: 6,
    identity: freezeIdentity(options.identity),
    workAllocations: createFrozenRecord<MeshWorkAllocationProjection>([]),
    localOffers: createFrozenRecord<MeshLocalOfferProjection>([]),
    bidHeads: createFrozenRecord<MeshBidHeadProjection>([]),
    acceptedBidEvidence: createFrozenRecord<MeshAcceptedBidEvidence>([]),
    localAwards: createFrozenRecord<MeshLocalAwardProjection>([]),
    assignmentResponses:
      createFrozenRecord<MeshAcceptedAssignmentResponseEvidence>([]),
    receivedOffers: createFrozenRecord<MeshReceivedOfferProjection>([]),
    localBids: createFrozenRecord<MeshLocalBidProjection>([]),
    receivedAwards: createFrozenRecord<MeshReceivedAwardProjection>([]),
    localAssignmentResponses:
      createFrozenRecord<MeshLocalAssignmentResponseEvidence>([]),
    assigneeAuthorities:
      createFrozenRecord<MeshAssigneeAssignmentAuthorityProjection>([]),
    executionRecords: createFrozenRecord<MeshExecutionRecordProjection>([]),
    executionHeads: createFrozenRecord<MeshExecutionHeadProjection>([]),
    leaseRenewals: createFrozenRecord<MeshLeaseRenewalEvidence>([]),
    leaseHeads: createFrozenRecord<MeshLeaseHeadProjection>([]),
    assignmentFenceHeads: createFrozenRecord<MeshAssignmentFenceHeadProjection>(
      [],
    ),
    witnessAssignments: createFrozenRecord<MeshWitnessAssignmentProjection>([]),
    takeoverProposals: createFrozenRecord<MeshTakeoverProposalProjection>([]),
    leaseVotes: createFrozenRecord<MeshLeaseVoteProjection>([]),
    recoveryCertificates: createFrozenRecord<MeshRecoveryCertificateProjection>(
      [],
    ),
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
  const receivedOffers = createFrozenRecord(
    parsed.receivedOffers.map(([key, value]) => [
      key,
      freezeReceivedOffer(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const localBids = createFrozenRecord(
    parsed.localBids.map(([key, value]) => [
      key,
      freezeLocalBid(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const receivedAwards = createFrozenRecord(
    parsed.receivedAwards.map(([key, value]) => [
      key,
      freezeReceivedAward(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const localAssignmentResponses = createFrozenRecord(
    parsed.localAssignmentResponses.map(([key, value]) => [
      key,
      freezeLocalAssignmentResponse(
        value,
        parsed.lastLogicalTime,
        parsed.limits,
      ),
    ]),
  );
  const assigneeAuthorities = createFrozenRecord(
    parsed.assigneeAuthorities.map(([key, value]) => [
      key,
      freezeAssigneeAuthority(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const executionRecords = createFrozenRecord(
    parsed.executionRecords.map(([key, value]) => [
      key,
      freezeExecutionRecord(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const executionHeads = createFrozenRecord(
    parsed.executionHeads.map(([key, value]) => [
      key,
      freezeExecutionHead(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const leaseRenewals = createFrozenRecord(
    parsed.leaseRenewals.map(([key, value]) => [
      key,
      freezeLeaseRenewal(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const leaseHeads = createFrozenRecord(
    parsed.leaseHeads.map(([key, value]) => [
      key,
      freezeLeaseHead(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const assignmentFenceHeads = createFrozenRecord(
    parsed.assignmentFenceHeads.map(([key, value]) => [
      key,
      freezeAssignmentFenceHead(value, parsed.limits),
    ]),
  );
  const witnessAssignments = createFrozenRecord(
    parsed.witnessAssignments.map(([key, value]) => [
      key,
      freezeWitnessAssignment(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const takeoverProposals = createFrozenRecord(
    parsed.takeoverProposals.map(([key, value]) => [
      key,
      freezeTakeoverProposal(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const leaseVotes = createFrozenRecord(
    parsed.leaseVotes.map(([key, value]) => [
      key,
      freezeLeaseVote(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const recoveryCertificates = createFrozenRecord(
    parsed.recoveryCertificates.map(([key, value]) => [
      key,
      freezeRecoveryCertificate(value, parsed.lastLogicalTime, parsed.limits),
    ]),
  );
  const baseState: MeshAllocationState = Object.freeze({
    schemaVersion: 6 as const,
    identity: freezeIdentity(parsed.identity),
    workAllocations,
    localOffers,
    bidHeads,
    acceptedBidEvidence,
    localAwards,
    assignmentResponses,
    receivedOffers,
    localBids,
    receivedAwards,
    localAssignmentResponses,
    assigneeAuthorities,
    executionRecords,
    executionHeads,
    leaseRenewals,
    leaseHeads,
    assignmentFenceHeads,
    witnessAssignments,
    takeoverProposals,
    leaseVotes,
    recoveryCertificates,
    reservations,
    limits: Object.freeze({ ...parsed.limits }),
    lastLogicalTime: parsed.lastLogicalTime,
  });
  const migratedLeaseHeadEntries = parsed.migrateInitialLeaseHeads
    ? collectInitialLeaseHeads(baseState)
    : undefined;
  if (
    migratedLeaseHeadEntries !== undefined &&
    migratedLeaseHeadEntries.length > parsed.limits.maximumExecutionHeads
  )
    throw new RangeError("Mesh migrated lease heads exceed their limit");
  const leaseMigratedState =
    migratedLeaseHeadEntries === undefined
      ? baseState
      : Object.freeze({
          ...baseState,
          leaseHeads: createFrozenRecord(
            migratedLeaseHeadEntries.map(([key, value]) => {
              if (key !== value.executionScopeKey)
                throw new TypeError("Mesh migrated lease head key is invalid");
              return [
                key,
                freezeLeaseHead(value, parsed.lastLogicalTime, parsed.limits),
              ] as const;
            }),
          ),
        });
  const migratedFenceHeadEntries = parsed.migrateAssignmentFenceHeads
    ? collectAssignmentFenceHeads(leaseMigratedState.leaseHeads)
    : undefined;
  if (
    migratedFenceHeadEntries !== undefined &&
    migratedFenceHeadEntries.length > parsed.limits.maximumAssignmentFenceHeads
  )
    throw new RangeError(
      "Mesh migrated assignment fence heads exceed their limit",
    );
  const state =
    migratedFenceHeadEntries === undefined
      ? leaseMigratedState
      : Object.freeze({
          ...leaseMigratedState,
          assignmentFenceHeads: createFrozenRecord(
            migratedFenceHeadEntries.map(([key, value]) => [
              key,
              freezeAssignmentFenceHead(value, parsed.limits),
            ]),
          ),
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
    !Object.isFrozen(state.receivedOffers) ||
    !Object.isFrozen(state.localBids) ||
    !Object.isFrozen(state.receivedAwards) ||
    !Object.isFrozen(state.localAssignmentResponses) ||
    !Object.isFrozen(state.assigneeAuthorities) ||
    !Object.isFrozen(state.executionRecords) ||
    !Object.isFrozen(state.executionHeads) ||
    !Object.isFrozen(state.leaseRenewals) ||
    !Object.isFrozen(state.leaseHeads) ||
    !Object.isFrozen(state.assignmentFenceHeads) ||
    !Object.isFrozen(state.witnessAssignments) ||
    !Object.isFrozen(state.takeoverProposals) ||
    !Object.isFrozen(state.leaseVotes) ||
    !Object.isFrozen(state.recoveryCertificates) ||
    !Object.isFrozen(state.reservations) ||
    !Object.isFrozen(state.limits) ||
    [
      state.workAllocations,
      state.localOffers,
      state.bidHeads,
      state.acceptedBidEvidence,
      state.localAwards,
      state.assignmentResponses,
      state.receivedOffers,
      state.localBids,
      state.receivedAwards,
      state.localAssignmentResponses,
      state.assigneeAuthorities,
      state.executionRecords,
      state.executionHeads,
      state.leaseRenewals,
      state.leaseHeads,
      state.assignmentFenceHeads,
      state.witnessAssignments,
      state.takeoverProposals,
      state.leaseVotes,
      state.recoveryCertificates,
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
    Object.values(state.reservations).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.receivedOffers).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.localBids).some((value) => !isDeepFrozenData(value)) ||
    Object.values(state.receivedAwards).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.localAssignmentResponses).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.assigneeAuthorities).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.executionRecords).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.executionHeads).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.leaseRenewals).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.leaseHeads).some((value) => !isDeepFrozenData(value)) ||
    Object.values(state.assignmentFenceHeads).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.witnessAssignments).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.takeoverProposals).some(
      (value) => !isDeepFrozenData(value),
    ) ||
    Object.values(state.leaseVotes).some((value) => !isDeepFrozenData(value)) ||
    Object.values(state.recoveryCertificates).some(
      (value) => !isDeepFrozenData(value),
    )
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
  ({ coordination, allocation } = materializeInitialLeaseState(
    coordination,
    allocation,
  ));
  const domainKeysByMessageId = new Map(
    Object.entries(coordination.domainRecords).map(([key, record]) => [
      record.messageId,
      key,
    ]),
  );

  const executionJournalSequences = new Map<string, number>();
  const executionRecordIdsByScope = new Map<string, string[]>();
  for (const record of Object.values(allocation.executionRecords)) {
    const payload = record.envelope.payload;
    const key = domainRecordKey(payload.type, record.recordId);
    const domain = coordination.domainRecords[key];
    const journalEvidence = coordination.journal.filter(
      (entry) =>
        entry.domainRecordKey === key &&
        (entry.kind === "command.accepted" || entry.kind === "domain.accepted"),
    );
    const journal = journalEvidence[0];
    if (
      !domain ||
      journalEvidence.length !== 1 ||
      !journal ||
      journal.occurredAt !== record.recordedAt ||
      journal.kind !==
        (record.direction === "local"
          ? "command.accepted"
          : "domain.accepted") ||
      domain.recordType !== payload.type ||
      domain.recordId !== record.recordId ||
      domain.messageId !== record.envelope.messageId ||
      domain.acceptedAt !== record.recordedAt ||
      domain.objectiveId !== payload.objectiveId ||
      domain.contentDigest !==
        record.envelope.payloadHash.slice("sha256:".length)
    )
      throw new TypeError("Mesh execution domain record binding is invalid");
    executionJournalSequences.set(record.recordId, journal.sequence);
    const recordIds = executionRecordIdsByScope.get(executionScopeKey(payload));
    if (recordIds === undefined)
      executionRecordIdsByScope.set(executionScopeKey(payload), [
        record.recordId,
      ]);
    else recordIds.push(record.recordId);
  }

  for (const head of Object.values(allocation.executionHeads)) {
    const terminalSequence =
      head.terminalRecordId === undefined
        ? undefined
        : executionJournalSequences.get(head.terminalRecordId);
    if (
      (head.terminalRecordId !== undefined && terminalSequence === undefined) ||
      (terminalSequence !== undefined &&
        executionRecordIdsByScope
          .get(head.executionScopeKey)
          ?.some((recordId) => {
            const sequence = executionJournalSequences.get(recordId);
            return (
              recordId !== head.terminalRecordId &&
              (sequence === undefined || sequence >= terminalSequence)
            );
          }))
    )
      throw new TypeError(
        "Mesh execution terminal journal ordering is invalid",
      );
    const localAward = allocation.localAwards[head.awardId];
    if (localAward === undefined) continue;
    const currentWork =
      objectives.workItems[workKey(head.objectiveId, head.workItemId)];
    const fenceKey = meshAssignmentFenceKey(head);
    const supersedingFence = allocation.assignmentFenceHeads[fenceKey];
    const strictlySuperseded =
      supersedingFence !== undefined &&
      supersedingFence.assignmentFenceKey === fenceKey &&
      supersedingFence.objectiveId === head.objectiveId &&
      supersedingFence.objectiveRevision === head.objectiveRevision &&
      supersedingFence.workItemId === head.workItemId &&
      supersedingFence.workItemRevision === head.workItemRevision &&
      supersedingFence.ownerPeerId === head.ownerPeerId &&
      supersedingFence.ownerEpoch === head.ownerEpoch &&
      supersedingFence.assignmentEpoch > head.assignmentEpoch &&
      supersedingFence.assignmentAuthorityId !== head.assignmentAuthorityId &&
      supersedingFence.fencingToken !== head.fencingToken;
    if (
      !currentWork ||
      (head.phase === "active"
        ? currentWork.status !== "ready" && !strictlySuperseded
        : currentWork.status !== head.phase ||
          currentWork.terminalAt !== head.terminalAt)
    )
      throw new TypeError("Mesh execution Work lifecycle binding is invalid");
  }

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
      ) &&
      !Object.values(allocation.receivedAwards).some(
        (award) =>
          award.status === "awaiting_response" &&
          award.acceptanceDeadlineTimerId === timer.timerId &&
          award.acceptanceDeadlineTimerGeneration === timer.generation,
      )
    ) {
      throw new TypeError("Mesh allocation acceptance timer is orphaned");
    }
    if (
      timer.kind === "lease.expiry" &&
      !Object.values(allocation.leaseHeads).some(
        (head) =>
          head.status === "active" &&
          head.expiryTimerId === timer.timerId &&
          head.expiryTimerGeneration === timer.generation &&
          head.currentLeaseExpiresAtLogical === timer.dueAt,
      ) &&
      !Object.values(allocation.witnessAssignments).some(
        (witness) =>
          witness.leaseHead?.status === "active" &&
          witness.leaseHead.expiryTimerId === timer.timerId &&
          witness.leaseHead.expiryTimerGeneration === timer.generation &&
          witness.leaseHead.currentLeaseExpiresAtLogical === timer.dueAt,
      )
    )
      throw new TypeError("Mesh lease expiry timer is orphaned");
  }
  const leaseRenewalJournalSequences = new Map<string, number>();
  for (const renewal of Object.values(allocation.leaseRenewals)) {
    const payload = renewal.envelope.payload;
    const key = domainRecordKey("lease.renew", renewal.leaseRenewalId);
    const domain = coordination.domainRecords[key];
    const objectiveKey = JSON.stringify([
      payload.objectiveId,
      payload.objectiveRevision,
    ]);
    const objectiveDocument = objectives.objectiveDocuments[objectiveKey];
    const objectivePolicy = objectives.objectivePolicies[objectiveKey];
    const signedExtension = logicalDeadline(
      payload.renewedLeaseExpiresAt,
      payload.leaseExpiresAt,
      0,
    );
    const journal = coordination.journal.filter(
      (entry) =>
        entry.domainRecordKey === key &&
        (entry.kind === "command.accepted" || entry.kind === "domain.accepted"),
    );
    if (
      !domain ||
      journal.length !== 1 ||
      domain.recordType !== "lease.renew" ||
      domain.recordId !== renewal.leaseRenewalId ||
      domain.messageId !== renewal.envelope.messageId ||
      domain.acceptedAt !== renewal.acceptedAt ||
      domain.objectiveId !== payload.objectiveId ||
      domain.contentDigest !==
        renewal.envelope.payloadHash.slice("sha256:".length) ||
      journal[0]!.occurredAt !== renewal.acceptedAt ||
      journal[0]!.kind !==
        (renewal.direction === "local"
          ? "command.accepted"
          : "domain.accepted") ||
      !objectiveDocument ||
      !objectivePolicy ||
      objectiveDocument.envelope.payload.objectiveDocumentId !==
        payload.objectiveDocumentId ||
      objectivePolicy.objectiveDocumentId !== payload.objectiveDocumentId ||
      !signedExtension ||
      signedExtension >
        objectiveDocument.envelope.payload.maximumLeaseDurationMs ||
      payload.leaseRenewalSequence >
        objectiveDocument.envelope.payload.maximumLeaseRenewals ||
      renewal.acceptedAt >= objectivePolicy.expiresAt ||
      renewal.renewedLeaseExpiresAtLogical > objectivePolicy.expiresAt ||
      compareTimestamp(
        renewal.validityVerifiedAt,
        objectivePolicy.validUntil,
      ) >= 0 ||
      compareTimestamp(
        payload.renewedLeaseExpiresAt,
        objectivePolicy.validUntil,
      ) > 0
    )
      throw new TypeError("Mesh lease renewal domain binding is invalid");
    leaseRenewalJournalSequences.set(
      renewal.leaseRenewalId,
      journal[0]!.sequence,
    );
  }
  for (const record of Object.values(coordination.domainRecords))
    if (
      record.recordType === "lease.renew" &&
      allocation.leaseRenewals[record.recordId] === undefined
    )
      throw new TypeError("Mesh lease renewal domain record is orphaned");
  for (const executionRecord of Object.values(allocation.executionRecords)) {
    if (!executionRecordRequiresActiveLease(executionRecord.envelope.payload))
      continue;
    const executionSequence = executionJournalSequences.get(
      executionRecord.recordId,
    );
    const scope = executionScopeKey(executionRecord.envelope.payload);
    const leaseHead = allocation.leaseHeads[scope];
    if (executionSequence === undefined || leaseHead === undefined)
      throw new TypeError("Mesh execution lease journal evidence is missing");
    const renewals = Object.values(allocation.leaseRenewals)
      .filter((renewal) => renewal.executionScopeKey === scope)
      .sort(
        (left, right) => left.leaseRenewalSequence - right.leaseRenewalSequence,
      );
    const claimedExpiry = executionRecord.envelope.payload.leaseExpiresAt;
    const renewalIndex = renewals.findIndex(
      (renewal) =>
        renewal.envelope.payload.renewedLeaseExpiresAt === claimedExpiry,
    );
    const current = renewalIndex < 0 ? undefined : renewals[renewalIndex];
    const successor =
      renewalIndex < 0 ? renewals[0] : renewals[renewalIndex + 1];
    const currentSequence =
      current === undefined
        ? undefined
        : leaseRenewalJournalSequences.get(current.leaseRenewalId);
    const successorSequence =
      successor === undefined
        ? undefined
        : leaseRenewalJournalSequences.get(successor.leaseRenewalId);
    if (
      (claimedExpiry !== leaseHead.originalLeaseExpiresAt &&
        (current === undefined ||
          currentSequence === undefined ||
          (executionRecord.recordedAt === current.acceptedAt &&
            executionSequence <= currentSequence))) ||
      (successor !== undefined &&
        (successorSequence === undefined ||
          (executionRecord.recordedAt === successor.acceptedAt &&
            executionSequence >= successorSequence)))
    )
      throw new TypeError("Mesh execution lease journal ordering is invalid");
  }
  for (const head of Object.values(allocation.leaseHeads)) {
    const timer =
      head.expiryTimerId === undefined
        ? undefined
        : coordination.timers[head.expiryTimerId];
    const expectedDomainRecordKey =
      head.leaseRenewalSequence === 0
        ? domainRecordKey("work.accept", head.acceptanceId)
        : domainRecordKey("lease.renew", head.latestLeaseRenewalId!);
    if (
      head.status === "active"
        ? !timer ||
          timer.kind !== "lease.expiry" ||
          timer.generation !== head.expiryTimerGeneration ||
          timer.dueAt !== head.currentLeaseExpiresAtLogical ||
          timer.domainRecordKey !== expectedDomainRecordKey
        : timer !== undefined
    )
      throw new TypeError("Mesh lease head timer binding is invalid");
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
  const initiallyRetainedMessageIds = [
    ...Object.values(allocation.localOffers).flatMap((offer) =>
      Object.values(offer.recipientOffers).map(
        (prepared) => prepared.messageId,
      ),
    ),
    ...Object.values(allocation.acceptedBidEvidence).map(
      (evidence) => evidence.envelope.messageId,
    ),
    ...[
      ...Object.values(allocation.takeoverProposals),
      ...Object.values(allocation.leaseVotes),
      ...Object.values(allocation.recoveryCertificates),
    ].flatMap((projection) =>
      Object.values(
        projection.recipientEnvelopes ?? {
          primary: projection.envelope,
        },
      ).map((envelope) => envelope.messageId),
    ),
    ...Object.values(allocation.witnessAssignments).flatMap((witness) => [
      witness.awardEnvelope.messageId,
      ...(witness.acceptanceEnvelope === undefined
        ? []
        : [witness.acceptanceEnvelope.messageId]),
      ...witness.leaseRenewals.map((renewal) => renewal.envelope.messageId),
      ...(witness.latestCheckpoint === undefined
        ? []
        : [witness.latestCheckpoint.envelope.messageId]),
    ]),
  ];
  const retainedMessageIds = new Set<string>(initiallyRetainedMessageIds);
  if (retainedMessageIds.size !== initiallyRetainedMessageIds.length)
    throw new TypeError("Mesh retained recovery messageId is not unique");
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
    const recoveryAward =
      award.recipientAward.envelope.payload.authorityKind ===
      "recovery_certificate";
    const recoveryCertificate = recoveryAward
      ? allocation.recoveryCertificates[
          award.recipientAward.envelope.payload.recoveryCertificateId
        ]
      : undefined;
    const assignmentFence =
      allocation.assignmentFenceHeads[
        meshAssignmentFenceKey({
          objectiveId: award.objectiveId,
          objectiveRevision: award.objectiveRevision,
          workItemId: award.work.workItemId,
          workItemRevision: award.work.workItemRevision,
          ownerPeerId: award.work.ownerPeerId,
          ownerEpoch: award.work.ownerEpoch,
        })
      ];
    const supersededAward =
      assignmentFence !== undefined &&
      assignmentFence.assignmentEpoch > award.assignmentEpoch;
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
      (!recoveryAward && award.createdAt >= offer.bidDeadlineAt) ||
      (!recoveryAward &&
        compareTimestamp(award.validityVerifiedAt, offer.bidDeadline) >= 0) ||
      (recoveryAward
        ? recoveryCertificate === undefined ||
          award.recipientAward.envelope.causationId !==
            (
              recoveryCertificate.recipientEnvelopes?.[award.assigneePeerId] ??
              recoveryCertificate.envelope
            ).messageId
        : award.recipientAward.envelope.causationId !==
          bid.acceptedMessageId) ||
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
    const executionHead = Object.values(allocation.executionHeads).find(
      (head) =>
        head.awardId === award.awardId &&
        head.assignmentEpoch === award.assignmentEpoch &&
        head.assignmentAuthorityId === award.assignmentAuthorityId,
    );
    if (award.status === "awaiting_acceptance") {
      if (
        response ||
        work.phase !== "award_pending" ||
        work.activeAwardId !== award.awardId ||
        reservation.status !== (recoveryAward ? "committed" : "reserved") ||
        !timer ||
        timer.kind !== "work.acceptance_deadline" ||
        timer.dueAt !== award.acceptanceDeadlineAt ||
        timer.generation !== award.acceptanceDeadlineTimerGeneration ||
        timer.domainRecordKey !== domainRecordKey("work.award", award.awardId)
      )
        throw new TypeError("Mesh pending award timer binding is invalid");
    } else if (
      timer ||
      (["accepted", "declined"].includes(award.status)
        ? response === undefined
        : response !== undefined) ||
      (award.status === "accepted" &&
        (supersededAward
          ? response?.kind !== "work.accept" ||
            reservation.status !== "committed" ||
            ![
              "recovering",
              "award_pending",
              "active",
              "completed",
              "released",
              "cancelled",
            ].includes(work.phase)
          : ![
              "active",
              "recovering",
              "completed",
              "released",
              "cancelled",
            ].includes(work.phase) ||
            work.activeAcceptanceId !== response?.responseId ||
            response?.kind !== "work.accept" ||
            reservation.status !== "committed" ||
            (work.phase === "active"
              ? executionHead !== undefined && executionHead.phase !== "active"
              : work.phase === "recovering"
                ? executionHead !== undefined &&
                  executionHead.phase !== "active"
                : executionHead?.phase !== work.phase))) ||
      (award.status === "declined" &&
        (response?.kind !== "work.decline" ||
          (recoveryAward
            ? reservation.status !== "committed" ||
              work.phase !== "recovering" ||
              work.reservationId !== reservation.reservationId
            : reservation.status !== "released" ||
              work.reservationId === reservation.reservationId) ||
          work.activeAwardId === award.awardId)) ||
      (award.status === "timed_out" &&
        ((recoveryAward
          ? reservation.status !== "committed" ||
            work.phase !== "recovering" ||
            work.reservationId !== reservation.reservationId
          : reservation.status !== "released" ||
            work.reservationId === reservation.reservationId) ||
          work.activeAwardId === award.awardId)) ||
      (award.status === "cancelled" &&
        (response !== undefined ||
          reservation.status !== "released" ||
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
      payload.ownerEpoch !== award.work.ownerEpoch ||
      payload.assigneePeerId !== award.assigneePeerId ||
      payload.assignmentEpoch !== award.assignmentEpoch ||
      payload.assignmentAuthorityId !== award.assignmentAuthorityId ||
      payload.fencingToken !== award.fencingToken ||
      payload.acceptanceDeadline !== award.acceptanceDeadline
    )
      throw new TypeError("Mesh assignment response domain binding is invalid");
    retainedMessageIds.add(response.envelope.messageId);
  }
  validateRecoveryRuntimeRelations(
    coordination,
    discovery,
    objectives,
    allocation,
    domainKeysByMessageId,
  );
  validateWitnessCoordinationRelations(coordination, allocation);
  validateAssigneeObjectiveRelations(objectives, allocation);
  validateAssigneeCoordinationRelations(
    coordination,
    allocation,
    retainedMessageIds,
  );
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
        (work.phase === "award_pending" ||
          work.phase === "recovering" ||
          work.phase === "active"),
    ).length;
    if (concurrentAssignments > objective.maximumConcurrentAssignments) {
      throw new TypeError(
        "Mesh allocation concurrent assignment limit is invalid",
      );
    }
  }
  return Object.freeze({ coordination, discovery, objectives, allocation });
}

function validateRecoveryRuntimeRelations(
  coordination: MeshCoordinationState,
  discovery: MeshDiscoveryState,
  objectives: MeshObjectiveWorkState,
  allocation: MeshAllocationState,
  domainKeysByMessageId: ReadonlyMap<string, string>,
): void {
  const validateDomain = (
    projection:
      | MeshTakeoverProposalProjection
      | MeshLeaseVoteProjection
      | MeshRecoveryCertificateProjection,
    type: "lease.takeover_proposal" | "lease.vote" | "lease.certificate",
    id: string,
  ): void => {
    const key = domainRecordKey(type, id);
    const domain = coordination.domainRecords[key];
    const journal = coordination.journal.filter(
      (entry) =>
        entry.domainRecordKey === key &&
        (entry.kind === "command.accepted" || entry.kind === "domain.accepted"),
    );
    const fanout = Object.values(projection.recipientEnvelopes ?? {});
    if (
      domain === undefined ||
      journal.length !== 1 ||
      domain.recordType !== type ||
      domain.recordId !== id ||
      domain.messageId !== projection.envelope.messageId ||
      domain.acceptedAt !== projection.acceptedAt ||
      domain.objectiveId !== projection.envelope.payload.objectiveId ||
      domain.contentDigest !==
        projection.envelope.payloadHash.slice("sha256:".length) ||
      journal[0]!.occurredAt !== projection.acceptedAt ||
      journal[0]!.kind !==
        (projection.direction === "local"
          ? "command.accepted"
          : "domain.accepted") ||
      fanout.some((envelope) => {
        const claimed = domainKeysByMessageId.get(envelope.messageId);
        return claimed !== undefined && claimed !== key;
      })
    )
      throw new TypeError("Mesh recovery domain record binding is invalid");
  };
  for (const proposal of Object.values(allocation.takeoverProposals)) {
    const payload = proposal.envelope.payload;
    const policy =
      objectives.objectivePolicies[
        JSON.stringify([payload.objectiveId, payload.objectiveRevision])
      ];
    const oldLease = findRecoveryLease(
      allocation,
      meshAssignmentFenceKey(payload),
      payload.proposedAssignmentEpoch - 1,
    );
    const expectedRecipients =
      policy === undefined
        ? []
        : runtimeRecoveryRecipients(allocation.identity.peerId, [
            payload.ownerPeerId,
            payload.assigneePeerId,
            payload.proposedAssigneePeerId,
            ...policy.recoveryWitnessPeerIds,
          ]);
    if (
      policy === undefined ||
      oldLease === undefined ||
      proposal.acceptedAt <
        oldLease.currentLeaseExpiresAtLogical + policy.recoveryGraceMs ||
      !runtimeRecoveryRecipientSetMatches(proposal, expectedRecipients) ||
      !policy.recoveryWitnessPeerIds.every((peerId) =>
        recoveryPeerWasAdmitted(
          discovery,
          allocation.identity.peerId,
          peerId,
          proposal.validityVerifiedAt,
        ),
      ) ||
      !recoveryPeerWasAdmitted(
        discovery,
        allocation.identity.peerId,
        payload.proposedAssigneePeerId,
        proposal.validityVerifiedAt,
      ) ||
      (payload.proposalAuthority === "witness" &&
        !policy.recoveryWitnessPeerIds.includes(payload.proposerPeerId)) ||
      (proposal.direction === "received" &&
        !recoveryParticipantIncludes(
          allocation.identity.peerId,
          payload,
          policy.recoveryWitnessPeerIds,
          true,
        ))
    )
      throw new TypeError("Mesh recovery proposal policy binding is invalid");
    validateDomain(
      proposal,
      "lease.takeover_proposal",
      proposal.takeoverProposalId,
    );
  }
  for (const vote of Object.values(allocation.leaseVotes)) {
    const proposal = allocation.takeoverProposals[vote.takeoverProposalId]!;
    const payload = proposal.envelope.payload;
    const policy =
      objectives.objectivePolicies[
        JSON.stringify([payload.objectiveId, payload.objectiveRevision])
      ];
    const expectedRecipients =
      policy === undefined
        ? []
        : runtimeRecoveryRecipients(allocation.identity.peerId, [
            payload.ownerPeerId,
            payload.proposedAssigneePeerId,
            ...policy.recoveryWitnessPeerIds,
          ]);
    if (
      policy === undefined ||
      !policy.recoveryWitnessPeerIds.includes(vote.witnessPeerId) ||
      vote.acceptedAt < proposal.acceptedAt ||
      !runtimeRecoveryRecipientSetMatches(vote, expectedRecipients) ||
      (vote.direction === "received" &&
        !recoveryParticipantIncludes(
          allocation.identity.peerId,
          payload,
          policy.recoveryWitnessPeerIds,
          false,
        ))
    )
      throw new TypeError("Mesh recovery vote policy binding is invalid");
    validateDomain(vote, "lease.vote", vote.leaseVoteId);
  }
  for (const certificate of Object.values(allocation.recoveryCertificates)) {
    const proposal =
      allocation.takeoverProposals[certificate.takeoverProposalId]!;
    const payload = proposal.envelope.payload;
    const policy =
      objectives.objectivePolicies[
        JSON.stringify([payload.objectiveId, payload.objectiveRevision])
      ];
    const votes = certificate.envelope.payload.leaseVoteIds.map(
      (voteId) => allocation.leaseVotes[voteId]!,
    );
    const expectedRecipients =
      policy === undefined
        ? []
        : runtimeRecoveryRecipients(allocation.identity.peerId, [
            payload.ownerPeerId,
            payload.proposedAssigneePeerId,
            ...policy.recoveryWitnessPeerIds,
          ]);
    if (
      policy === undefined ||
      votes.length < policy.recoveryWitnessThreshold ||
      votes.some(
        (vote) =>
          !policy.recoveryWitnessPeerIds.includes(vote.witnessPeerId) ||
          certificate.acceptedAt < vote.acceptedAt,
      ) ||
      !runtimeRecoveryRecipientSetMatches(certificate, expectedRecipients) ||
      !recoveryParticipantIncludes(
        certificate.envelope.payload.certificateAssemblerPeerId,
        payload,
        policy.recoveryWitnessPeerIds,
        false,
      ) ||
      (certificate.direction === "received" &&
        !recoveryParticipantIncludes(
          allocation.identity.peerId,
          payload,
          policy.recoveryWitnessPeerIds,
          false,
        ))
    )
      throw new TypeError(
        "Mesh recovery certificate policy binding is invalid",
      );
    validateDomain(certificate, "lease.certificate", certificate.certificateId);
  }
  const recoveryAwards = [
    ...Object.values(allocation.localAwards).map(
      (award) => award.recipientAward.envelope.payload,
    ),
    ...Object.values(allocation.receivedAwards).map(
      (award) => award.envelope.payload,
    ),
  ].filter(
    (
      payload,
    ): payload is Extract<
      WorkAwardPayload,
      { authorityKind: "recovery_certificate" }
    > => payload.authorityKind === "recovery_certificate",
  );
  for (const award of recoveryAwards) {
    const certificate =
      allocation.recoveryCertificates[award.recoveryCertificateId];
    const proposal =
      certificate === undefined
        ? undefined
        : allocation.takeoverProposals[certificate.takeoverProposalId];
    const proposed = proposal?.envelope.payload;
    if (
      certificate === undefined ||
      proposed === undefined ||
      award.assignmentEpoch !== proposed.proposedAssignmentEpoch ||
      award.assigneePeerId !== proposed.proposedAssigneePeerId ||
      award.assignmentAuthorityId !== certificate.certificateId ||
      award.fencingToken !== certificate.certificateId
    )
      throw new TypeError("Mesh recovery award certificate binding is invalid");
    const fenceKey = meshAssignmentFenceKey(proposed);
    const checkpointIds = new Set(
      [
        ...Object.values(allocation.executionHeads)
          .filter(
            (head) =>
              meshAssignmentFenceKey(head) === fenceKey &&
              head.assignmentEpoch === proposed.proposedAssignmentEpoch - 1,
          )
          .map((head) => head.latestCheckpointId),
        allocation.witnessAssignments[fenceKey]?.latestCheckpoint?.recordId,
      ].filter(
        (checkpointId): checkpointId is string => checkpointId !== undefined,
      ),
    );
    if (
      checkpointIds.size > 1 ||
      award.resumeCheckpointId !== [...checkpointIds][0]
    )
      throw new TypeError("Mesh recovery award checkpoint binding is invalid");
  }
  for (const record of Object.values(coordination.domainRecords))
    if (
      (record.recordType === "lease.takeover_proposal" &&
        allocation.takeoverProposals[record.recordId] === undefined) ||
      (record.recordType === "lease.vote" &&
        allocation.leaseVotes[record.recordId] === undefined) ||
      (record.recordType === "lease.certificate" &&
        allocation.recoveryCertificates[record.recordId] === undefined)
    )
      throw new TypeError("Mesh recovery domain record is orphaned");
}

function validateWitnessCoordinationRelations(
  coordination: MeshCoordinationState,
  allocation: MeshAllocationState,
): void {
  const verify = (
    type: "work.award" | "work.accept" | "lease.renew" | "work.checkpoint",
    id: string,
    envelope: SignedMeshEnvelope<
      | WorkAwardPayload
      | WorkAcceptPayload
      | LeaseRenewPayload
      | WorkCheckpointPayload
    >,
    latestObservedAt: number,
    exactAcceptedAt?: number,
  ): void => {
    const key = domainRecordKey(type, id);
    const domain = coordination.domainRecords[key];
    const journal = coordination.journal.filter(
      (entry) =>
        entry.domainRecordKey === key && entry.kind === "domain.accepted",
    );
    if (
      domain === undefined ||
      journal.length !== 1 ||
      domain.recordType !== type ||
      domain.recordId !== id ||
      domain.messageId !== envelope.messageId ||
      domain.objectiveId !== envelope.payload.objectiveId ||
      domain.contentDigest !== envelope.payloadHash.slice("sha256:".length) ||
      domain.acceptedAt > latestObservedAt ||
      (exactAcceptedAt !== undefined &&
        domain.acceptedAt !== exactAcceptedAt) ||
      journal[0]!.occurredAt !== domain.acceptedAt
    )
      throw new TypeError("Mesh witness domain record binding is invalid");
  };
  for (const witness of Object.values(allocation.witnessAssignments)) {
    verify(
      "work.award",
      witness.awardEnvelope.payload.awardId,
      witness.awardEnvelope,
      witness.observedAt,
    );
    if (witness.acceptanceEnvelope !== undefined)
      verify(
        "work.accept",
        witness.acceptanceEnvelope.payload.acceptanceId,
        witness.acceptanceEnvelope,
        witness.observedAt,
      );
    for (const renewal of witness.leaseRenewals)
      verify(
        "lease.renew",
        renewal.leaseRenewalId,
        renewal.envelope,
        witness.observedAt,
        renewal.acceptedAt,
      );
    if (witness.latestCheckpoint !== undefined)
      verify(
        "work.checkpoint",
        witness.latestCheckpoint.recordId,
        witness.latestCheckpoint
          .envelope as SignedMeshEnvelope<WorkCheckpointPayload>,
        witness.observedAt,
        witness.latestCheckpoint.recordedAt,
      );
  }
}

function runtimeRecoveryRecipients(
  localPeerId: string,
  recipients: readonly string[],
): readonly string[] {
  return Object.freeze(
    [...new Set(recipients)]
      .filter((peerId) => peerId !== localPeerId)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

function runtimeRecoveryRecipientSetMatches(
  projection:
    | MeshTakeoverProposalProjection
    | MeshLeaseVoteProjection
    | MeshRecoveryCertificateProjection,
  expectedRecipients: readonly string[],
): boolean {
  if (projection.direction === "received")
    return projection.recipientEnvelopes === undefined;
  const actual = Object.keys(projection.recipientEnvelopes ?? {}).sort(
    (left, right) => (left < right ? -1 : left > right ? 1 : 0),
  );
  return (
    actual.length === expectedRecipients.length &&
    actual.every((peerId, index) => peerId === expectedRecipients[index])
  );
}

function recoveryPeerWasAdmitted(
  discovery: MeshDiscoveryState,
  localPeerId: string,
  peerId: string,
  verifiedAt: string,
): boolean {
  if (peerId === localPeerId) return true;
  const admission = discovery.admittedPeers[peerId];
  return (
    admission !== undefined &&
    compareTimestamp(verifiedAt, admission.validUntil) < 0
  );
}

function recoveryParticipantIncludes(
  peerId: string,
  proposal: LeaseTakeoverProposalPayload,
  witnesses: readonly string[],
  includeOldAssignee: boolean,
): boolean {
  return (
    peerId === proposal.ownerPeerId ||
    peerId === proposal.proposedAssigneePeerId ||
    witnesses.includes(peerId) ||
    (includeOldAssignee && peerId === proposal.assigneePeerId)
  );
}

/**
 * Allocation v4 snapshots predate lease heads and fresh acceptance paths also
 * compose their allocation and coordination projections independently. This
 * deterministic normalization installs the sequence-zero lease head and its
 * generation-fenced expiry timer atomically before the runtime is exposed.
 */
function materializeInitialLeaseState(
  coordination: MeshCoordinationState,
  allocation: MeshAllocationState,
): Readonly<{
  coordination: MeshCoordinationState;
  allocation: MeshAllocationState;
}> {
  const candidates = new Map(collectInitialLeaseHeads(allocation));
  const missing = [...candidates].filter(
    ([scope]) => allocation.leaseHeads[scope] === undefined,
  );
  const heads = createFrozenRecord([
    ...recordEntries(allocation.leaseHeads),
    ...missing,
  ]);
  const fenceCandidates = new Map(
    collectAssignmentFenceHeads(heads, allocation.assignmentFenceHeads),
  );
  const missingFences = [...fenceCandidates].filter(
    ([scope]) => allocation.assignmentFenceHeads[scope] === undefined,
  );
  const fenceHeads = createFrozenRecord([
    ...recordEntries(allocation.assignmentFenceHeads),
    ...missingFences,
  ]);
  const timers = new Map(recordEntries(coordination.timers));
  for (const head of Object.values(heads)) {
    if (head.status !== "active") continue;
    if (head.expiryTimerId !== undefined && timers.has(head.expiryTimerId))
      continue;
    if (head.leaseRenewalSequence !== 0) continue;
    const timer = initialLeaseTimer(head);
    timers.set(timer.timerId, timer);
  }
  if (
    missing.length === 0 &&
    missingFences.length === 0 &&
    timers.size === Object.keys(coordination.timers).length
  )
    return Object.freeze({ coordination, allocation });
  if (timers.size > coordination.limits.maximumTimers)
    throw new RangeError("Mesh initial lease timers exceed their limit");

  const normalizedAllocation =
    missing.length === 0 && missingFences.length === 0
      ? allocation
      : restoreMeshAllocationState({
          ...allocation,
          leaseHeads: heads,
          assignmentFenceHeads: fenceHeads,
        });
  const normalizedCoordination = Object.freeze({
    ...coordination,
    timers: createFrozenRecord([...timers]),
  });
  assertFrozenMeshCoordinationState(normalizedCoordination);
  return Object.freeze({
    coordination: normalizedCoordination,
    allocation: normalizedAllocation,
  });
}

function collectInitialLeaseHeads(
  allocation: MeshAllocationState,
): readonly (readonly [string, MeshLeaseHeadProjection])[] {
  const candidates = new Map<string, MeshLeaseHeadProjection>();
  for (const award of Object.values(allocation.localAwards)) {
    const response = allocation.assignmentResponses[award.awardId];
    if (award.status !== "accepted" || response?.kind !== "work.accept")
      continue;
    const scope = executionScopeKey({
      objectiveId: award.objectiveId,
      objectiveRevision: award.objectiveRevision,
      workItemId: award.work.workItemId,
      workItemRevision: award.work.workItemRevision,
      ownerPeerId: award.work.ownerPeerId,
      ownerEpoch: award.work.ownerEpoch,
      awardId: award.awardId,
      assignmentEpoch: award.assignmentEpoch,
    });
    candidates.set(
      scope,
      initialLeaseHead(
        scope,
        {
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
          acceptanceId: response.responseId,
          acceptanceMessageId: response.envelope.messageId,
          leaseExpiresAt: award.leaseExpiresAt,
          leaseExpiresAtLogical: award.leaseExpiresAtLogical,
          workDeadline: award.workDeadline,
          workDeadlineAt: award.work.workDeadlineAt,
        },
        allocation,
      ),
    );
  }
  for (const authority of Object.values(allocation.assigneeAuthorities)) {
    const response = allocation.localAssignmentResponses[authority.awardId];
    if (response?.kind !== "work.accept") continue;
    const scope = executionScopeKey(authority);
    const candidate = initialLeaseHead(
      scope,
      {
        ...authority,
        acceptanceMessageId: response.envelope.messageId,
      },
      allocation,
    );
    const existing = candidates.get(scope);
    if (existing !== undefined && !sameData(existing, candidate))
      throw new TypeError("Mesh initial lease authority is ambiguous");
    candidates.set(scope, candidate);
  }
  return Object.freeze([...candidates]);
}

function collectAssignmentFenceHeads(
  leaseHeads: Readonly<Record<string, MeshLeaseHeadProjection>>,
  existing: Readonly<
    Record<string, MeshAssignmentFenceHeadProjection>
  > = Object.create(null),
): readonly (readonly [string, MeshAssignmentFenceHeadProjection])[] {
  const candidates = new Map<string, MeshAssignmentFenceHeadProjection>();
  for (const leaseHead of Object.values(leaseHeads)) {
    const key = meshAssignmentFenceKey(leaseHead);
    if (existing[key] !== undefined) continue;
    if (candidates.has(key))
      throw new TypeError(
        "Mesh assignment fence migration has a stable scope collision",
      );
    candidates.set(
      key,
      Object.freeze({
        assignmentFenceKey: key,
        objectiveId: leaseHead.objectiveId,
        objectiveRevision: leaseHead.objectiveRevision,
        workItemId: leaseHead.workItemId,
        workItemRevision: leaseHead.workItemRevision,
        ownerPeerId: leaseHead.ownerPeerId,
        ownerEpoch: leaseHead.ownerEpoch,
        assignmentEpoch: leaseHead.assignmentEpoch,
        assignmentAuthorityId: leaseHead.assignmentAuthorityId,
        fencingToken: leaseHead.fencingToken,
        assigneePeerId: leaseHead.assigneePeerId,
        activeAwardId: leaseHead.awardId,
        phase:
          leaseHead.status === "active"
            ? "active"
            : leaseHead.status === "expired"
              ? "expired"
              : "terminal",
      }),
    );
  }
  return Object.freeze([...candidates]);
}

function initialLeaseHead(
  scope: string,
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
    leaseExpiresAt: string;
    leaseExpiresAtLogical: number;
    workDeadline: string;
    workDeadlineAt: number;
  }>,
  allocation: MeshAllocationState,
): MeshLeaseHeadProjection {
  const execution = allocation.executionHeads[scope];
  const terminal = execution !== undefined && execution.phase !== "active";
  const expired =
    !terminal && allocation.lastLogicalTime >= authority.leaseExpiresAtLogical;
  const status = terminal ? "terminal" : expired ? "expired" : "active";
  const timerId = leaseExpiryTimerId(scope);
  return Object.freeze({
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
    status,
    ...(status === "active"
      ? { expiryTimerId: timerId, expiryTimerGeneration: 1 }
      : {}),
  });
}

function initialLeaseTimer(
  head: MeshLeaseHeadProjection,
): MeshCoordinationTimer {
  if (
    head.expiryTimerId === undefined ||
    head.expiryTimerGeneration === undefined
  )
    throw new TypeError("Mesh active lease head has no expiry timer");
  return Object.freeze({
    timerId: head.expiryTimerId,
    kind: "lease.expiry",
    dueAt: head.currentLeaseExpiresAtLogical,
    generation: head.expiryTimerGeneration,
    domainRecordKey: domainRecordKey("work.accept", head.acceptanceId),
  });
}

function leaseExpiryTimerId(scope: string): string {
  return `lease.expiry:${sha256Base64Url(utf8Encoder.encode(scope))}`;
}

function sameData(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateAssigneeObjectiveRelations(
  objectives: MeshObjectiveWorkState,
  allocation: MeshAllocationState,
): void {
  const assignmentScopes = new Map<string, string>();
  for (const offer of Object.values(allocation.receivedOffers)) {
    const payload = offer.envelope.payload;
    const key = JSON.stringify([
      payload.objectiveId,
      payload.objectiveRevision,
    ]);
    const document = objectives.objectiveDocuments[key];
    const policy = objectives.objectivePolicies[key];
    const signedBidWindow = logicalDeadline(
      payload.bidDeadline,
      offer.envelope.sentAt,
      0,
    );
    if (
      !document ||
      !policy ||
      document.envelope.payload.objectiveDocumentId !==
        payload.objectiveDocumentId ||
      policy.objectiveDocumentId !== payload.objectiveDocumentId ||
      offer.receivedAt >= policy.expiresAt ||
      compareTimestamp(offer.validityVerifiedAt, policy.validUntil) >= 0 ||
      !signedBidWindow ||
      signedBidWindow > document.envelope.payload.bidWindowMs ||
      offer.workDeadlineAt > policy.expiresAt ||
      compareTimestamp(payload.workDeadline, policy.validUntil) > 0 ||
      payload.budgetReservationUnits > policy.maximumBudgetUnits ||
      payload.requiredCapabilityKeys.some(
        (capabilityKey) =>
          !policy.permittedCapabilityKeys.includes(capabilityKey),
      )
    )
      throw new TypeError("Mesh received offer Objective binding is invalid");
  }
  for (const bid of Object.values(allocation.localBids)) {
    const offer = allocation.receivedOffers[bid.offerId];
    if (
      !offer ||
      compareTimestamp(
        bid.validityVerifiedAt,
        offer.envelope.payload.bidDeadline,
      ) >= 0
    )
      throw new TypeError("Mesh local bid Objective binding is invalid");
  }
  for (const award of Object.values(allocation.receivedAwards)) {
    const payload = award.envelope.payload;
    const bid = allocation.localBids[award.bidId];
    const key = JSON.stringify([
      payload.objectiveId,
      payload.objectiveRevision,
    ]);
    const document = objectives.objectiveDocuments[key];
    const policy = objectives.objectivePolicies[key];
    const signedAcceptanceDuration = logicalDeadline(
      payload.acceptanceDeadline,
      award.envelope.sentAt,
      0,
    );
    const signedLeaseDuration = logicalDeadline(
      payload.leaseExpiresAt,
      payload.leaseStartsAt,
      0,
    );
    const assignmentScope = JSON.stringify([
      payload.objectiveId,
      payload.workItemId,
      payload.workItemRevision,
      payload.assignmentEpoch,
    ]);
    const existingAwardId = assignmentScopes.get(assignmentScope);
    if (
      !bid ||
      !document ||
      !policy ||
      document.envelope.payload.objectiveDocumentId !==
        payload.objectiveDocumentId ||
      policy.objectiveDocumentId !== payload.objectiveDocumentId ||
      award.receivedAt >= policy.expiresAt ||
      compareTimestamp(award.validityVerifiedAt, policy.validUntil) >= 0 ||
      (payload.authorityKind === "award" &&
        (award.receivedAt >= bid.bidExpiresAtLogical ||
          compareTimestamp(award.validityVerifiedAt, bid.bidExpiresAt) >= 0)) ||
      !signedAcceptanceDuration ||
      signedAcceptanceDuration > document.envelope.payload.acceptanceWindowMs ||
      !signedLeaseDuration ||
      signedLeaseDuration > document.envelope.payload.maximumLeaseDurationMs ||
      award.acceptanceDeadlineAt > policy.expiresAt ||
      award.leaseExpiresAtLogical > policy.expiresAt ||
      compareTimestamp(payload.leaseExpiresAt, policy.validUntil) > 0 ||
      (["awaiting_response", "accepted"].includes(award.status) &&
        existingAwardId !== undefined &&
        existingAwardId !== award.awardId)
    )
      throw new TypeError("Mesh received award Objective binding is invalid");
    if (["awaiting_response", "accepted"].includes(award.status))
      assignmentScopes.set(assignmentScope, award.awardId);
  }
}

function validateAssigneeCoordinationRelations(
  coordination: MeshCoordinationState,
  allocation: MeshAllocationState,
  retainedMessageIds: ReadonlySet<string>,
): void {
  const seen = new Set<string>(retainedMessageIds);
  const domainMessageIds = new Set<string>();
  for (const record of Object.values(coordination.domainRecords)) {
    if (domainMessageIds.has(record.messageId))
      throw new TypeError("Mesh coordination messageId is not unique");
    domainMessageIds.add(record.messageId);
  }
  const verify = (
    recordType:
      "work.offer" | "work.bid" | "work.award" | "work.accept" | "work.decline",
    recordId: string,
    acceptedAt: number,
    objectiveId: string,
    envelope: SignedMeshEnvelope<
      | WorkOfferPayload
      | WorkBidPayload
      | WorkAwardPayload
      | WorkAcceptPayload
      | WorkDeclinePayload
    >,
  ) => {
    const key = domainRecordKey(recordType, recordId);
    const record = coordination.domainRecords[key];
    if (
      !record ||
      record.recordType !== recordType ||
      record.recordId !== recordId ||
      record.messageId !== envelope.messageId ||
      record.acceptedAt !== acceptedAt ||
      record.objectiveId !== objectiveId ||
      record.contentDigest !== envelope.payloadHash.slice("sha256:".length) ||
      seen.has(envelope.messageId)
    )
      throw new TypeError("Mesh assignee allocation domain binding is invalid");
    seen.add(envelope.messageId);
  };
  for (const offer of Object.values(allocation.receivedOffers))
    verify(
      "work.offer",
      offer.offerId,
      offer.receivedAt,
      offer.envelope.payload.objectiveId,
      offer.envelope,
    );
  for (const bid of Object.values(allocation.localBids))
    verify(
      "work.bid",
      bid.bidId,
      bid.preparedAt,
      bid.envelope.payload.objectiveId,
      bid.envelope,
    );
  for (const award of Object.values(allocation.receivedAwards))
    verify(
      "work.award",
      award.awardId,
      award.receivedAt,
      award.envelope.payload.objectiveId,
      award.envelope,
    );
  for (const award of Object.values(allocation.receivedAwards)) {
    const timer = coordination.timers[award.acceptanceDeadlineTimerId];
    if (
      award.status === "awaiting_response"
        ? !timer ||
          timer.kind !== "work.acceptance_deadline" ||
          timer.dueAt !== award.acceptanceDeadlineAt ||
          timer.generation !== award.acceptanceDeadlineTimerGeneration ||
          timer.domainRecordKey !== domainRecordKey("work.award", award.awardId)
        : timer !== undefined
    )
      throw new TypeError("Mesh assignee acceptance timer binding is invalid");
  }
  for (const response of Object.values(allocation.localAssignmentResponses))
    verify(
      response.kind,
      response.responseId,
      response.preparedAt,
      response.envelope.payload.objectiveId,
      response.envelope,
    );
}

function validateSnapshot(snapshot: unknown): ParsedState {
  assertPlainRecord(snapshot, "allocation snapshot");
  const version = (snapshot as { schemaVersion?: unknown }).schemaVersion;
  const legacy = version === 1 || version === 2;
  const legacyV1 = version === 1;
  const legacyV3 = version === 3;
  const legacyV4 = version === 4;
  const legacyV5 = version === 5;
  assertExactKeys(
    snapshot,
    [
      "acceptedBidEvidence",
      "assigneeAuthorities",
      "assignmentResponses",
      "bidHeads",
      "executionHeads",
      "leaseHeads",
      "leaseRenewals",
      "executionRecords",
      "identity",
      "lastLogicalTime",
      "limits",
      "localAssignmentResponses",
      "localBids",
      "localOffers",
      "localAwards",
      "receivedAwards",
      "receivedOffers",
      "reservations",
      "schemaVersion",
      "workAllocations",
      ...(version === 6
        ? [
            "assignmentFenceHeads",
            "leaseVotes",
            "recoveryCertificates",
            "takeoverProposals",
            "witnessAssignments",
          ]
        : []),
    ],
    legacyV1
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
      : legacy
        ? [
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
          ]
        : legacyV3
          ? [
              "acceptedBidEvidence",
              "assigneeAuthorities",
              "assignmentResponses",
              "bidHeads",
              "identity",
              "lastLogicalTime",
              "limits",
              "localAssignmentResponses",
              "localBids",
              "localAwards",
              "localOffers",
              "receivedAwards",
              "receivedOffers",
              "reservations",
              "schemaVersion",
              "workAllocations",
            ]
          : legacyV4
            ? [
                "acceptedBidEvidence",
                "assigneeAuthorities",
                "assignmentResponses",
                "bidHeads",
                "executionHeads",
                "executionRecords",
                "identity",
                "lastLogicalTime",
                "limits",
                "localAssignmentResponses",
                "localBids",
                "localAwards",
                "localOffers",
                "receivedAwards",
                "receivedOffers",
                "reservations",
                "schemaVersion",
                "workAllocations",
              ]
            : legacyV5
              ? [
                  "acceptedBidEvidence",
                  "assigneeAuthorities",
                  "assignmentResponses",
                  "bidHeads",
                  "executionHeads",
                  "executionRecords",
                  "identity",
                  "leaseHeads",
                  "leaseRenewals",
                  "lastLogicalTime",
                  "limits",
                  "localAssignmentResponses",
                  "localBids",
                  "localAwards",
                  "localOffers",
                  "receivedAwards",
                  "receivedOffers",
                  "reservations",
                  "schemaVersion",
                  "workAllocations",
                ]
              : [
                  "acceptedBidEvidence",
                  "assignmentFenceHeads",
                  "assigneeAuthorities",
                  "assignmentResponses",
                  "bidHeads",
                  "executionHeads",
                  "executionRecords",
                  "identity",
                  "leaseHeads",
                  "leaseRenewals",
                  "leaseVotes",
                  "lastLogicalTime",
                  "limits",
                  "localAssignmentResponses",
                  "localBids",
                  "localAwards",
                  "localOffers",
                  "receivedAwards",
                  "receivedOffers",
                  "recoveryCertificates",
                  "reservations",
                  "schemaVersion",
                  "workAllocations",
                  "takeoverProposals",
                  "witnessAssignments",
                ],
  );
  const raw = snapshot as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1 &&
    raw.schemaVersion !== 2 &&
    raw.schemaVersion !== 3 &&
    raw.schemaVersion !== 4 &&
    raw.schemaVersion !== 5 &&
    raw.schemaVersion !== 6
  )
    throw new TypeError("Mesh allocation schema version is unsupported");
  const assigneeRecords = {
    receivedOffers: Object.create(null),
    localBids: Object.create(null),
    receivedAwards: Object.create(null),
    localAssignmentResponses: Object.create(null),
    assigneeAuthorities: Object.create(null),
  };
  const assigneeLimits = {
    maximumReceivedOffers: (raw.limits as MeshAllocationLimits).maximumOffers,
    maximumLocalBids: (raw.limits as MeshAllocationLimits).maximumOffers,
    maximumReceivedAwards: (raw.limits as MeshAllocationLimits).maximumOffers,
    maximumLocalAssignmentResponses: (raw.limits as MeshAllocationLimits)
      .maximumOffers,
    maximumAssignmentAuthorities: (raw.limits as MeshAllocationLimits)
      .maximumOffers,
  };
  const executionRecords = {
    executionRecords: Object.create(null),
    executionHeads: Object.create(null),
    leaseRenewals: Object.create(null),
    leaseHeads: Object.create(null),
  };
  const executionLimits = {
    maximumExecutionHeads: (raw.limits as MeshAllocationLimits).maximumOffers,
    maximumExecutionRecords: (raw.limits as MeshAllocationLimits).maximumOffers,
    maximumExecutionRecordsPerAssignment: Math.min(
      (raw.limits as MeshAllocationLimits).maximumOffers,
      DEFAULT_MESH_ALLOCATION_LIMITS.maximumExecutionRecordsPerAssignment,
    ),
    maximumLeaseRenewals: (raw.limits as MeshAllocationLimits).maximumOffers,
  };
  const candidateV5 = (legacyV1
    ? {
        ...raw,
        schemaVersion: 5,
        localOffers: migrateLegacyOffers(raw.localOffers),
        localAwards: Object.create(null),
        assignmentResponses: Object.create(null),
        ...assigneeRecords,
        ...executionRecords,
        limits: {
          ...(raw.limits as object),
          maximumAwards: (raw.limits as MeshAllocationLimits).maximumOffers,
          maximumAssignmentResponses: (raw.limits as MeshAllocationLimits)
            .maximumOffers,
          ...assigneeLimits,
          ...executionLimits,
        },
      }
    : version === 2
      ? {
          ...raw,
          schemaVersion: 5,
          ...assigneeRecords,
          ...executionRecords,
          limits: {
            ...(raw.limits as object),
            ...assigneeLimits,
            ...executionLimits,
          },
        }
      : version === 3
        ? {
            ...raw,
            schemaVersion: 5,
            ...executionRecords,
            limits: {
              ...(raw.limits as object),
              ...executionLimits,
            },
          }
        : legacyV4
          ? {
              ...raw,
              schemaVersion: 5,
              leaseRenewals: Object.create(null),
              leaseHeads: Object.create(null),
              limits: {
                ...(raw.limits as object),
                maximumLeaseRenewals: Math.min(
                  (raw.limits as MeshAllocationLimits).maximumExecutionRecords,
                  DEFAULT_MESH_ALLOCATION_LIMITS.maximumLeaseRenewals,
                ),
              },
            }
          : raw) as unknown as MeshAllocationState;
  const candidate =
    version === 6
      ? (raw as unknown as MeshAllocationState)
      : ({
          ...candidateV5,
          schemaVersion: 6,
          assignmentFenceHeads: Object.create(null),
          witnessAssignments: Object.create(null),
          takeoverProposals: Object.create(null),
          leaseVotes: Object.create(null),
          recoveryCertificates: Object.create(null),
          limits: {
            ...candidateV5.limits,
            maximumAssignmentFenceHeads: Math.min(
              candidateV5.limits.maximumExecutionHeads,
              DEFAULT_MESH_ALLOCATION_LIMITS.maximumAssignmentFenceHeads,
            ),
            maximumWitnessAssignments: Math.min(
              candidateV5.limits.maximumExecutionHeads,
              DEFAULT_MESH_ALLOCATION_LIMITS.maximumWitnessAssignments,
            ),
            maximumTakeoverProposals: Math.min(
              candidateV5.limits.maximumExecutionRecords,
              DEFAULT_MESH_ALLOCATION_LIMITS.maximumTakeoverProposals,
            ),
            maximumLeaseVotes: Math.min(
              candidateV5.limits.maximumExecutionRecords,
              DEFAULT_MESH_ALLOCATION_LIMITS.maximumLeaseVotes,
            ),
            maximumRecoveryCertificates: Math.min(
              candidateV5.limits.maximumExecutionHeads,
              DEFAULT_MESH_ALLOCATION_LIMITS.maximumRecoveryCertificates,
            ),
          },
        } as MeshAllocationState);
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
    receivedOffers: candidate.receivedOffers,
    localBids: candidate.localBids,
    receivedAwards: candidate.receivedAwards,
    localAssignmentResponses: candidate.localAssignmentResponses,
    assigneeAuthorities: candidate.assigneeAuthorities,
    executionRecords: candidate.executionRecords,
    executionHeads: candidate.executionHeads,
    leaseRenewals: candidate.leaseRenewals,
    leaseHeads: candidate.leaseHeads,
    assignmentFenceHeads: candidate.assignmentFenceHeads,
    witnessAssignments: candidate.witnessAssignments,
    takeoverProposals: candidate.takeoverProposals,
    leaseVotes: candidate.leaseVotes,
    recoveryCertificates: candidate.recoveryCertificates,
    reservations: candidate.reservations,
  }))
    assertRecord(record, name);
  const parsed: ParsedState = {
    identity,
    limits,
    lastLogicalTime: candidate.lastLogicalTime,
    migrateInitialLeaseHeads: version !== 5 && version !== 6,
    migrateAssignmentFenceHeads: version !== 6,
    workAllocations: Object.entries(candidate.workAllocations),
    localOffers: Object.entries(candidate.localOffers),
    bidHeads: Object.entries(candidate.bidHeads),
    acceptedBidEvidence: Object.entries(candidate.acceptedBidEvidence),
    localAwards: Object.entries(candidate.localAwards),
    assignmentResponses: Object.entries(candidate.assignmentResponses),
    receivedOffers: Object.entries(candidate.receivedOffers),
    localBids: Object.entries(candidate.localBids),
    receivedAwards: Object.entries(candidate.receivedAwards),
    localAssignmentResponses: Object.entries(
      candidate.localAssignmentResponses,
    ),
    assigneeAuthorities: Object.entries(candidate.assigneeAuthorities),
    executionRecords: Object.entries(candidate.executionRecords),
    executionHeads: Object.entries(candidate.executionHeads),
    leaseRenewals: Object.entries(candidate.leaseRenewals),
    leaseHeads: Object.entries(candidate.leaseHeads),
    assignmentFenceHeads: Object.entries(candidate.assignmentFenceHeads),
    witnessAssignments: Object.entries(candidate.witnessAssignments),
    takeoverProposals: Object.entries(candidate.takeoverProposals),
    leaseVotes: Object.entries(candidate.leaseVotes),
    recoveryCertificates: Object.entries(candidate.recoveryCertificates),
    reservations: Object.entries(candidate.reservations),
  };
  if (
    parsed.localOffers.length > limits.maximumOffers ||
    parsed.bidHeads.length > limits.maximumBidHeads ||
    parsed.localAwards.length > limits.maximumAwards ||
    parsed.assignmentResponses.length > limits.maximumAssignmentResponses ||
    parsed.receivedOffers.length > limits.maximumReceivedOffers ||
    parsed.localBids.length > limits.maximumLocalBids ||
    parsed.receivedAwards.length > limits.maximumReceivedAwards ||
    parsed.localAssignmentResponses.length >
      limits.maximumLocalAssignmentResponses ||
    parsed.assigneeAuthorities.length > limits.maximumAssignmentAuthorities ||
    parsed.executionRecords.length > limits.maximumExecutionRecords ||
    parsed.executionHeads.length > limits.maximumExecutionHeads ||
    parsed.leaseRenewals.length > limits.maximumLeaseRenewals ||
    parsed.leaseHeads.length > limits.maximumExecutionHeads ||
    parsed.assignmentFenceHeads.length > limits.maximumAssignmentFenceHeads ||
    parsed.witnessAssignments.length > limits.maximumWitnessAssignments ||
    parsed.takeoverProposals.length > limits.maximumTakeoverProposals ||
    parsed.leaseVotes.length > limits.maximumLeaseVotes ||
    parsed.recoveryCertificates.length > limits.maximumRecoveryCertificates
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
  for (const [key, value] of parsed.receivedOffers) {
    if (key !== value.offerId)
      throw new TypeError("Mesh received offer key is invalid");
    freezeReceivedOffer(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.localBids) {
    if (key !== value.bidId)
      throw new TypeError("Mesh local bid key is invalid");
    freezeLocalBid(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.receivedAwards) {
    if (key !== value.awardId)
      throw new TypeError("Mesh received award key is invalid");
    freezeReceivedAward(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.localAssignmentResponses) {
    if (key !== value.awardId)
      throw new TypeError("Mesh local assignment response key is invalid");
    freezeLocalAssignmentResponse(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.assigneeAuthorities) {
    if (key !== value.awardId)
      throw new TypeError("Mesh assignee authority key is invalid");
    freezeAssigneeAuthority(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.executionRecords) {
    if (key !== value.recordId)
      throw new TypeError("Mesh execution record key is invalid");
    freezeExecutionRecord(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.executionHeads) {
    if (key !== value.executionScopeKey)
      throw new TypeError("Mesh execution head key is invalid");
    freezeExecutionHead(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.leaseRenewals) {
    if (key !== value.leaseRenewalId)
      throw new TypeError("Mesh lease renewal key is invalid");
    freezeLeaseRenewal(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.leaseHeads) {
    if (key !== value.executionScopeKey)
      throw new TypeError("Mesh lease head key is invalid");
    freezeLeaseHead(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.assignmentFenceHeads) {
    if (key !== value.assignmentFenceKey)
      throw new TypeError("Mesh assignment fence head key is invalid");
    freezeAssignmentFenceHead(value, limits);
  }
  for (const [key, value] of parsed.witnessAssignments) {
    if (key !== value.assignmentFenceKey)
      throw new TypeError("Mesh witness assignment key is invalid");
    freezeWitnessAssignment(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.takeoverProposals) {
    if (key !== value.takeoverProposalId)
      throw new TypeError("Mesh takeover proposal key is invalid");
    freezeTakeoverProposal(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.leaseVotes) {
    if (key !== value.leaseVoteId)
      throw new TypeError("Mesh lease vote key is invalid");
    freezeLeaseVote(value, parsed.lastLogicalTime, limits);
  }
  for (const [key, value] of parsed.recoveryCertificates) {
    if (key !== value.certificateId)
      throw new TypeError("Mesh recovery certificate key is invalid");
    freezeRecoveryCertificate(value, parsed.lastLogicalTime, limits);
  }
  if (!legacyV1)
    validateStateRelations(candidate, false, version !== 5 && version !== 6);
  return parsed;
}

interface ParsedState {
  readonly identity: MeshPeerIdentity;
  readonly limits: MeshAllocationLimits;
  readonly lastLogicalTime: number;
  readonly migrateInitialLeaseHeads: boolean;
  readonly migrateAssignmentFenceHeads: boolean;
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
  readonly receivedOffers: readonly (readonly [
    string,
    MeshReceivedOfferProjection,
  ])[];
  readonly localBids: readonly (readonly [string, MeshLocalBidProjection])[];
  readonly receivedAwards: readonly (readonly [
    string,
    MeshReceivedAwardProjection,
  ])[];
  readonly localAssignmentResponses: readonly (readonly [
    string,
    MeshLocalAssignmentResponseEvidence,
  ])[];
  readonly assigneeAuthorities: readonly (readonly [
    string,
    MeshAssigneeAssignmentAuthorityProjection,
  ])[];
  readonly executionRecords: readonly (readonly [
    string,
    MeshExecutionRecordProjection,
  ])[];
  readonly executionHeads: readonly (readonly [
    string,
    MeshExecutionHeadProjection,
  ])[];
  readonly leaseRenewals: readonly (readonly [
    string,
    MeshLeaseRenewalEvidence,
  ])[];
  readonly leaseHeads: readonly (readonly [string, MeshLeaseHeadProjection])[];
  readonly assignmentFenceHeads: readonly (readonly [
    string,
    MeshAssignmentFenceHeadProjection,
  ])[];
  readonly witnessAssignments: readonly (readonly [
    string,
    MeshWitnessAssignmentProjection,
  ])[];
  readonly takeoverProposals: readonly (readonly [
    string,
    MeshTakeoverProposalProjection,
  ])[];
  readonly leaseVotes: readonly (readonly [string, MeshLeaseVoteProjection])[];
  readonly recoveryCertificates: readonly (readonly [
    string,
    MeshRecoveryCertificateProjection,
  ])[];
}

function validateStateRelations(
  state: MeshAllocationState,
  requireFrozen: boolean,
  allowMissingInitialLeaseHeads = false,
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
    const preparedOffers = Object.values(offer.recipientOffers);
    const firstPrepared = preparedOffers[0];
    if (
      !firstPrepared ||
      preparedOffers.some(
        (prepared) =>
          !sameCriticalOfferSemantics(
            prepared.envelope,
            firstPrepared.envelope,
          ),
      )
    )
      throw new TypeError(
        "Mesh local offer recipient critical semantics differ",
      );
    for (const prepared of preparedOffers) {
      const context = validateMeshEnvelopeContext(prepared.envelope, {
        tenantId: state.identity.tenantId,
        meshId: state.identity.meshId,
        peerId: prepared.recipientPeerId,
        receivedAt: offer.validityVerifiedAt,
        supportedCriticalExtensions: offer.supportedCriticalExtensions ?? [],
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
      const currentEnvelope = Object.values(offer.recipientOffers)[0]?.envelope;
      const predecessorEnvelope = predecessor
        ? Object.values(predecessor.recipientOffers)[0]?.envelope
        : undefined;
      if (
        offer.offerAttempt !== index + 1 ||
        offer.previousOfferId !== predecessor?.offerId ||
        (predecessor !== undefined &&
          offer.createdAt <= predecessor.createdAt) ||
        (predecessor !== undefined &&
          (predecessorReservation?.status !== "released" ||
            predecessorReservation.releasedAt === undefined ||
            offer.createdAt < predecessorReservation.releasedAt)) ||
        (predecessorEnvelope !== undefined &&
          currentEnvelope !== undefined &&
          !preservesCriticalOfferSemantics(
            currentEnvelope,
            predecessorEnvelope,
          ))
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
  const awardedAssignmentScopes = new Map<string, string>();
  for (const award of Object.values(state.localAwards)) {
    const response = state.assignmentResponses[award.awardId];
    const work =
      state.workAllocations[workKey(award.objectiveId, award.work.workItemId)];
    const offer = state.localOffers[award.offerId];
    const bid = Object.values(state.bidHeads).find(
      (entry) => entry.offerId === award.offerId && entry.bidId === award.bidId,
    );
    const envelope = award.recipientAward.envelope;
    const recoveryAward =
      envelope.payload.authorityKind === "recovery_certificate";
    const recoveryCertificate = recoveryAward
      ? state.recoveryCertificates[envelope.payload.recoveryCertificateId]
      : undefined;
    const context = validateMeshEnvelopeContext(envelope, {
      tenantId: state.identity.tenantId,
      meshId: state.identity.meshId,
      peerId: award.assigneePeerId,
      receivedAt: award.validityVerifiedAt,
    });
    const assignmentScope = JSON.stringify([
      award.objectiveId,
      award.work.workItemId,
      award.work.workItemRevision,
      award.assignmentEpoch,
    ]);
    const existingScopeAwardId = awardedAssignmentScopes.get(assignmentScope);
    if (
      existingScopeAwardId !== undefined &&
      existingScopeAwardId !== award.awardId
    )
      throw new TypeError("Mesh local award assignment scope is not unique");
    if (
      (!recoveryAward && awardedOfferIds.has(award.offerId)) ||
      (!recoveryAward && awardedReservationIds.has(award.reservationId)) ||
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
      (!recoveryAward && award.createdAt >= offer.bidDeadlineAt) ||
      (!recoveryAward &&
        compareTimestamp(award.validityVerifiedAt, offer.bidDeadline) >= 0) ||
      retainedMessageIds.has(envelope.messageId) ||
      envelope.tenantId !== state.identity.tenantId ||
      envelope.meshId !== state.identity.meshId ||
      envelope.objectiveId !== award.objectiveId ||
      envelope.sender.peerId !== state.identity.peerId ||
      envelope.sender.instanceId !== state.identity.instanceId ||
      envelope.proof.keyId !== state.identity.keyId ||
      (recoveryAward
        ? recoveryCertificate === undefined ||
          envelope.causationId !==
            (
              recoveryCertificate.recipientEnvelopes?.[award.assigneePeerId] ??
              recoveryCertificate.envelope
            ).messageId
        : envelope.causationId !== bid.acceptedMessageId) ||
      (award.status === "awaiting_acceptance" && response !== undefined) ||
      (award.status === "accepted" && response?.kind !== "work.accept") ||
      (award.status === "declined" && response?.kind !== "work.decline") ||
      (award.status === "timed_out" && response !== undefined) ||
      (award.status === "cancelled" && response !== undefined)
    )
      throw new TypeError(
        "Mesh local award terminal response binding is invalid",
      );
    retainedMessageIds.add(envelope.messageId);
    if (!recoveryAward) {
      awardedOfferIds.add(award.offerId);
      awardedReservationIds.add(award.reservationId);
    }
    awardedAssignmentScopes.set(assignmentScope, award.awardId);
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
    const awards = Object.values(state.localAwards).filter(
      (entry) => entry.reservationId === reservation.reservationId,
    );
    const award = awards.find(
      (entry) =>
        entry.recipientAward.envelope.payload.authorityKind === "award",
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
      (![
        "award_pending",
        "active",
        "recovering",
        "completed",
        "released",
        "cancelled",
      ].includes(work.phase) ||
        work.reservationId !== reservation.reservationId ||
        (work.activeAwardId !== undefined &&
          !["awaiting_acceptance", "accepted"].includes(
            state.localAwards[work.activeAwardId]?.status ?? "",
          )) ||
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
        (award?.status === "cancelled" &&
          (response !== undefined ||
            (reservation.releasedAt as number) < award.createdAt)) ||
        (award !== undefined &&
          award.status !== "declined" &&
          award.status !== "timed_out" &&
          award.status !== "cancelled"))
    ) {
      throw new TypeError(
        "Mesh released allocation reservation time is invalid",
      );
    }
  }
  for (const work of Object.values(state.workAllocations)) {
    const executionHead = Object.values(state.executionHeads).find(
      (head) => head.awardId === work.activeAwardId,
    );
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
    if (
      work.phase === "recovering" &&
      (work.activeOfferId !== undefined || work.bidDeadlineAt !== undefined)
    )
      throw new TypeError("Mesh recovering Work allocation is invalid");
    if (
      ["completed", "released", "cancelled"].includes(work.phase) &&
      (!work.activeAwardId ||
        !work.activeAcceptanceId ||
        !work.reservationId ||
        work.activeOfferId !== undefined ||
        work.bidDeadlineAt !== undefined ||
        executionHead?.phase !== work.phase ||
        work.updatedAt !== executionHead.terminalAt)
    )
      throw new TypeError("Mesh terminal Work allocation is invalid");
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
  validateRecoveryStateRelations(state, requireFrozen);
  validateAssigneeStateRelations(
    state,
    requireFrozen,
    allowMissingInitialLeaseHeads,
  );
}

function sameCriticalOfferSemantics(
  left: SignedMeshEnvelope<WorkOfferPayload>,
  right: SignedMeshEnvelope<WorkOfferPayload>,
): boolean {
  if (!sameData(left.criticalExtensions ?? [], right.criticalExtensions ?? []))
    return false;
  return (left.criticalExtensions ?? []).every((key) =>
    sameData(left.extensions?.[key], right.extensions?.[key]),
  );
}

function preservesCriticalOfferSemantics(
  current: SignedMeshEnvelope<WorkOfferPayload>,
  previous: SignedMeshEnvelope<WorkOfferPayload>,
): boolean {
  const currentCritical = new Set(current.criticalExtensions ?? []);
  return (previous.criticalExtensions ?? []).every(
    (key) =>
      currentCritical.has(key) &&
      sameData(current.extensions?.[key], previous.extensions?.[key]),
  );
}

function validateRecoveryStateRelations(
  state: MeshAllocationState,
  requireFrozen: boolean,
): void {
  const voteScopes = new Set<string>();
  const certificateScopes = new Set<string>();
  const recoveryMessageIds = new Set<string>();
  const retainRecoveryEnvelope = (
    envelope: SignedMeshEnvelope<
      LeaseTakeoverProposalPayload | LeaseVotePayload | LeaseCertificatePayload
    >,
    direction: "local" | "received",
  ): void => {
    const context = validateMeshEnvelopeContext(envelope, {
      tenantId: state.identity.tenantId,
      meshId: state.identity.meshId,
      peerId:
        direction === "local"
          ? envelope.audience.kind === "peer"
            ? envelope.audience.peerId
            : ""
          : state.identity.peerId,
      receivedAt: envelope.sentAt,
    });
    if (
      !context.ok ||
      envelope.audience.kind !== "peer" ||
      (direction === "local" &&
        (envelope.sender.peerId !== state.identity.peerId ||
          envelope.sender.instanceId !== state.identity.instanceId ||
          envelope.proof.keyId !== state.identity.keyId)) ||
      (direction === "received" &&
        envelope.audience.peerId !== state.identity.peerId) ||
      recoveryMessageIds.has(envelope.messageId)
    )
      throw new TypeError("Mesh recovery envelope relation is invalid");
    recoveryMessageIds.add(envelope.messageId);
  };
  for (const witness of Object.values(state.witnessAssignments)) {
    const award = witness.awardEnvelope.payload;
    const fence = state.assignmentFenceHeads[witness.assignmentFenceKey];
    const witnessLease = witness.leaseHead;
    const retainedPredecessor =
      witnessLease !== undefined &&
      fence !== undefined &&
      witnessLease.status === "expired" &&
      fence.assignmentFenceKey === witness.assignmentFenceKey &&
      fence.assignmentEpoch === witnessLease.assignmentEpoch + 1;
    const successorLeaseMatches =
      fence !== undefined &&
      Object.values(state.leaseHeads).some((lease) =>
        fenceMatchesLeaseHead(fence, lease),
      );
    const witnessFenceIsValid =
      witnessLease === undefined ||
      (fence !== undefined &&
        (fenceMatchesLeaseHead(fence, witnessLease) ||
          (retainedPredecessor &&
            (["recovering", "award_pending"].includes(fence.phase) ||
              successorLeaseMatches))));
    if (
      witness.assignmentFenceKey !== meshAssignmentFenceKey(award) ||
      witness.awardEnvelope.audience.kind !== "peer" ||
      witness.awardEnvelope.audience.peerId !== state.identity.peerId ||
      witness.awardEnvelope.sender.peerId !== award.ownerPeerId ||
      !witnessFenceIsValid ||
      (witnessLease?.status === "active" && fence?.phase !== "active")
    )
      throw new TypeError("Mesh witness recovery relation is invalid");
    if (requireFrozen && !isDeepFrozenData(witness))
      throw new TypeError("Mesh witness recovery evidence is mutable");
  }
  for (const proposal of Object.values(state.takeoverProposals)) {
    const payload = proposal.envelope.payload;
    const key = meshAssignmentFenceKey(payload);
    const oldLease = findRecoveryLease(
      state,
      key,
      payload.proposedAssignmentEpoch - 1,
    );
    retainRecoveryProjectionEnvelopes(proposal, retainRecoveryEnvelope);
    if (
      proposal.envelope.sender.peerId !== payload.proposerPeerId ||
      oldLease === undefined ||
      oldLease.status !== "expired" ||
      payload.proposedAssignmentEpoch !== oldLease.assignmentEpoch + 1 ||
      !takeoverProposalMatchesLease(payload, oldLease) ||
      proposal.acceptedAt < oldLease.currentLeaseExpiresAtLogical ||
      (payload.proposalAuthority === "candidate"
        ? payload.proposerPeerId !== payload.proposedAssigneePeerId
        : !witnessProposalConsentIsValid(state, proposal))
    )
      throw new TypeError("Mesh takeover proposal relation is invalid");
    if (requireFrozen && !isDeepFrozenData(proposal))
      throw new TypeError("Mesh takeover proposal evidence is mutable");
  }
  for (const vote of Object.values(state.leaseVotes)) {
    const proposal = state.takeoverProposals[vote.takeoverProposalId];
    if (proposal === undefined)
      throw new TypeError("Mesh lease vote proposal is missing");
    const proposed = proposal.envelope.payload;
    const scope = JSON.stringify([
      meshAssignmentFenceKey(proposed),
      proposed.proposedAssignmentEpoch,
      vote.witnessPeerId,
    ]);
    retainRecoveryProjectionEnvelopes(vote, retainRecoveryEnvelope);
    if (
      voteScopes.has(scope) ||
      vote.envelope.sender.peerId !== vote.witnessPeerId ||
      (vote.direction === "local" &&
        vote.envelope.causationId !==
          recoveryProjectionEnvelopeForPeer(proposal, vote.witnessPeerId)
            .messageId)
    )
      throw new TypeError("Mesh lease vote relation is invalid");
    voteScopes.add(scope);
    if (requireFrozen && !isDeepFrozenData(vote))
      throw new TypeError("Mesh lease vote evidence is mutable");
  }
  for (const certificate of Object.values(state.recoveryCertificates)) {
    const proposal = state.takeoverProposals[certificate.takeoverProposalId];
    if (proposal === undefined)
      throw new TypeError("Mesh recovery certificate proposal is missing");
    const proposed = proposal.envelope.payload;
    const votes = certificate.envelope.payload.leaseVoteIds.map(
      (voteId) => state.leaseVotes[voteId],
    );
    const scope = JSON.stringify([
      meshAssignmentFenceKey(proposed),
      proposed.proposedAssignmentEpoch,
    ]);
    retainRecoveryProjectionEnvelopes(certificate, retainRecoveryEnvelope);
    if (
      certificateScopes.has(scope) ||
      votes.length < 2 ||
      votes.some(
        (vote) =>
          vote === undefined ||
          vote.takeoverProposalId !== certificate.takeoverProposalId,
      ) ||
      new Set(votes.map((vote) => vote!.witnessPeerId)).size !== votes.length ||
      (certificate.direction === "local" &&
        certificate.envelope.causationId !==
          recoveryProjectionEnvelopeForPeer(
            proposal,
            certificate.envelope.payload.certificateAssemblerPeerId,
          ).messageId)
    )
      throw new TypeError("Mesh recovery certificate relation is invalid");
    certificateScopes.add(scope);
    if (requireFrozen && !isDeepFrozenData(certificate))
      throw new TypeError("Mesh recovery certificate evidence is mutable");
  }
  for (const fence of Object.values(state.assignmentFenceHeads)) {
    if (fence.recoveryCertificateId === undefined) continue;
    const certificate = state.recoveryCertificates[fence.recoveryCertificateId];
    const proposal =
      certificate === undefined
        ? undefined
        : state.takeoverProposals[certificate.takeoverProposalId];
    const payload = proposal?.envelope.payload;
    if (
      certificate === undefined ||
      payload === undefined ||
      fence.assignmentFenceKey !== meshAssignmentFenceKey(payload) ||
      fence.assignmentEpoch !== payload.proposedAssignmentEpoch ||
      fence.assignmentAuthorityId !== certificate.certificateId ||
      fence.fencingToken !== certificate.certificateId ||
      fence.assigneePeerId !== payload.proposedAssigneePeerId ||
      (fence.phase === "award_pending" &&
        (fence.activeAwardId === undefined ||
          !recoveryAwardMatchesFence(
            state,
            fence.activeAwardId,
            certificate.certificateId,
          ))) ||
      (fence.phase === "active" &&
        !Object.values(state.leaseHeads).some((head) =>
          fenceMatchesLeaseHead(fence, head),
        ))
    )
      throw new TypeError("Mesh recovery fence relation is invalid");
  }
}

function retainRecoveryProjectionEnvelopes<
  TPayload extends
    LeaseTakeoverProposalPayload | LeaseVotePayload | LeaseCertificatePayload,
>(
  projection: Readonly<{
    direction: "local" | "received";
    envelope: SignedMeshEnvelope<TPayload>;
    recipientEnvelopes?: Readonly<Record<string, SignedMeshEnvelope<TPayload>>>;
  }>,
  retain: (
    envelope: SignedMeshEnvelope<
      LeaseTakeoverProposalPayload | LeaseVotePayload | LeaseCertificatePayload
    >,
    direction: "local" | "received",
  ) => void,
): void {
  const envelopes =
    projection.recipientEnvelopes === undefined
      ? [projection.envelope]
      : Object.values(projection.recipientEnvelopes);
  if (
    !envelopes.some(
      (envelope) => envelope.messageId === projection.envelope.messageId,
    )
  )
    throw new TypeError("Mesh recovery primary envelope is not retained");
  for (const envelope of envelopes)
    retain(
      envelope as SignedMeshEnvelope<
        | LeaseTakeoverProposalPayload
        | LeaseVotePayload
        | LeaseCertificatePayload
      >,
      projection.direction,
    );
}

function recoveryProjectionEnvelopeForPeer<
  TPayload extends
    LeaseTakeoverProposalPayload | LeaseVotePayload | LeaseCertificatePayload,
>(
  projection: Readonly<{
    envelope: SignedMeshEnvelope<TPayload>;
    recipientEnvelopes?: Readonly<Record<string, SignedMeshEnvelope<TPayload>>>;
  }>,
  peerId: string,
): SignedMeshEnvelope<TPayload> {
  return projection.recipientEnvelopes?.[peerId] ?? projection.envelope;
}

function findRecoveryLease(
  state: MeshAllocationState,
  fenceKey: string,
  assignmentEpoch: number,
): MeshLeaseHeadProjection | undefined {
  return (
    Object.values(state.leaseHeads).find(
      (head) =>
        meshAssignmentFenceKey(head) === fenceKey &&
        head.assignmentEpoch === assignmentEpoch,
    ) ??
    Object.values(state.witnessAssignments).find(
      (witness) =>
        witness.assignmentFenceKey === fenceKey &&
        witness.leaseHead?.assignmentEpoch === assignmentEpoch,
    )?.leaseHead
  );
}

function takeoverProposalMatchesLease(
  proposal: LeaseTakeoverProposalPayload,
  lease: MeshLeaseHeadProjection,
): boolean {
  return (
    proposal.objectiveId === lease.objectiveId &&
    proposal.objectiveDocumentId === lease.objectiveDocumentId &&
    proposal.objectiveRevision === lease.objectiveRevision &&
    proposal.workItemId === lease.workItemId &&
    proposal.workItemRevision === lease.workItemRevision &&
    proposal.ownerPeerId === lease.ownerPeerId &&
    proposal.ownerEpoch === lease.ownerEpoch &&
    proposal.assigneePeerId === lease.assigneePeerId &&
    proposal.awardId === lease.awardId &&
    proposal.acceptanceId === lease.acceptanceId &&
    proposal.assignmentEpoch === lease.assignmentEpoch &&
    proposal.assignmentAuthorityId === lease.assignmentAuthorityId &&
    proposal.fencingToken === lease.fencingToken &&
    proposal.leaseExpiresAt === lease.currentLeaseExpiresAt &&
    proposal.leaseRenewalSequence === lease.leaseRenewalSequence &&
    proposal.latestLeaseRenewalId === lease.latestLeaseRenewalId
  );
}

function witnessProposalConsentIsValid(
  state: MeshAllocationState,
  proposal: MeshTakeoverProposalProjection,
): boolean {
  const payload = proposal.envelope.payload;
  if (payload.proposalAuthority !== "witness") return false;
  const consent = state.takeoverProposals[payload.candidateConsentProposalId];
  return (
    consent !== undefined &&
    consent.envelope.payload.proposalAuthority === "candidate" &&
    consent.envelope.payload.proposedAssigneePeerId ===
      payload.proposedAssigneePeerId &&
    consent.envelope.payload.proposedAssignmentEpoch ===
      payload.proposedAssignmentEpoch &&
    meshAssignmentFenceKey(consent.envelope.payload) ===
      meshAssignmentFenceKey(payload) &&
    (proposal.direction === "received" ||
      proposal.envelope.causationId ===
        recoveryProjectionEnvelopeForPeer(consent, payload.proposerPeerId)
          .messageId)
  );
}

function fenceMatchesLeaseHead(
  fence: MeshAssignmentFenceHeadProjection,
  lease: MeshLeaseHeadProjection,
): boolean {
  return (
    fence.assignmentFenceKey === meshAssignmentFenceKey(lease) &&
    fence.assignmentEpoch === lease.assignmentEpoch &&
    fence.assignmentAuthorityId === lease.assignmentAuthorityId &&
    fence.fencingToken === lease.fencingToken &&
    fence.assigneePeerId === lease.assigneePeerId &&
    fence.activeAwardId === lease.awardId
  );
}

function recoveryAwardMatchesFence(
  state: MeshAllocationState,
  awardId: string,
  certificateId: string,
): boolean {
  const payload =
    state.localAwards[awardId]?.recipientAward.envelope.payload ??
    state.receivedAwards[awardId]?.envelope.payload;
  return (
    payload?.authorityKind === "recovery_certificate" &&
    payload.recoveryCertificateId === certificateId &&
    payload.assignmentAuthorityId === certificateId &&
    payload.fencingToken === certificateId
  );
}

function validateAssigneeStateRelations(
  state: MeshAllocationState,
  requireFrozen: boolean,
  allowMissingInitialLeaseHeads: boolean,
): void {
  const messageIds = new Set<string>();
  const retainMessageId = (messageId: string): void => {
    if (messageIds.has(messageId))
      throw new TypeError("Mesh allocation messageId is not unique");
    messageIds.add(messageId);
  };
  for (const offer of Object.values(state.localOffers))
    for (const prepared of Object.values(offer.recipientOffers))
      retainMessageId(prepared.messageId);
  for (const bid of Object.values(state.acceptedBidEvidence))
    retainMessageId(bid.envelope.messageId);
  for (const award of Object.values(state.localAwards))
    retainMessageId(award.recipientAward.messageId);
  for (const response of Object.values(state.assignmentResponses))
    retainMessageId(response.envelope.messageId);
  const receivedOffersByScope = new Map<
    string,
    MeshReceivedOfferProjection[]
  >();
  for (const offer of Object.values(state.receivedOffers)) {
    const envelope = offer.envelope;
    const payload = envelope.payload;
    if (
      envelope.tenantId !== state.identity.tenantId ||
      envelope.meshId !== state.identity.meshId ||
      envelope.audience.kind !== "peer" ||
      envelope.audience.peerId !== state.identity.peerId ||
      envelope.sender.peerId !== payload.ownerPeerId ||
      payload.ownerPeerId === state.identity.peerId ||
      envelope.objectiveId !== payload.objectiveId
    )
      throw new TypeError("Mesh received offer relation is invalid");
    retainMessageId(envelope.messageId);
    if (requireFrozen && !isDeepFrozenData(offer))
      throw new TypeError("Mesh received offer evidence is mutable");
    const scope = receivedOfferScopeKey(payload);
    const chain = receivedOffersByScope.get(scope) ?? [];
    chain.push(offer);
    receivedOffersByScope.set(scope, chain);
  }
  for (const chain of receivedOffersByScope.values()) {
    chain.sort(
      (left, right) =>
        left.envelope.payload.offerAttempt -
        right.envelope.payload.offerAttempt,
    );
    for (let index = 0; index < chain.length; index += 1) {
      const offer = chain[index]!;
      const predecessor = chain[index - 1];
      const predecessorAwards =
        predecessor === undefined
          ? []
          : Object.values(state.receivedAwards).filter(
              (award) => award.offerId === predecessor.offerId,
            );
      const predecessorIsTerminal = predecessorAwards.some(
        (award) => award.status === "declined" || award.status === "timed_out",
      );
      if (
        offer.envelope.payload.offerAttempt !== index + 1 ||
        offer.envelope.payload.previousOfferId !== predecessor?.offerId ||
        (predecessor === undefined
          ? offer.envelope.causationId !== undefined
          : offer.envelope.causationId !== predecessor.envelope.messageId) ||
        (predecessor !== undefined &&
          !receivedOfferWorkTermsEqual(
            predecessor.envelope.payload,
            offer.envelope.payload,
          )) ||
        (predecessor !== undefined &&
          offer.receivedAt < predecessor.receivedAt) ||
        predecessorAwards.some(
          (award) =>
            award.status === "awaiting_response" || award.status === "accepted",
        ) ||
        (predecessor !== undefined &&
          !predecessorIsTerminal &&
          offer.receivedAt < predecessor.bidDeadlineAt)
      )
        throw new TypeError("Mesh received offer predecessor chain is invalid");
    }
  }
  const bidsByOffer = new Map<string, MeshLocalBidProjection[]>();
  for (const bid of Object.values(state.localBids)) {
    const offer = state.receivedOffers[bid.offerId];
    const envelope = bid.envelope;
    const payload = envelope.payload;
    if (
      !offer ||
      envelope.tenantId !== state.identity.tenantId ||
      envelope.meshId !== state.identity.meshId ||
      envelope.sender.peerId !== state.identity.peerId ||
      envelope.sender.instanceId !== state.identity.instanceId ||
      envelope.proof.keyId !== state.identity.keyId ||
      envelope.audience.kind !== "peer" ||
      envelope.audience.peerId !== offer.envelope.sender.peerId ||
      envelope.causationId !== offer.envelope.messageId ||
      payload.bidderPeerId !== state.identity.peerId ||
      !bidPayloadMatchesReceivedOffer(payload, offer) ||
      payload.budgetUnits > offer.envelope.payload.budgetReservationUnits ||
      bid.preparedAt < offer.receivedAt ||
      bid.preparedAt >= offer.bidDeadlineAt ||
      bid.bidExpiresAtLogical > offer.workDeadlineAt
    )
      throw new TypeError("Mesh local bid relation is invalid");
    retainMessageId(envelope.messageId);
    const chain = bidsByOffer.get(bid.offerId) ?? [];
    chain.push(bid);
    bidsByOffer.set(bid.offerId, chain);
  }
  for (const chain of bidsByOffer.values()) {
    chain.sort((left, right) => left.bidRevision - right.bidRevision);
    for (let index = 0; index < chain.length; index += 1) {
      const bid = chain[index]!;
      const previous = chain[index - 1];
      if (
        bid.bidRevision !== index + 1 ||
        bid.previousBidId !== previous?.bidId ||
        (previous && bid.preparedAt < previous.preparedAt)
      )
        throw new TypeError("Mesh local bid predecessor chain is invalid");
    }
  }
  const assignmentScopes = new Map<string, string>();
  for (const award of Object.values(state.receivedAwards)) {
    const offer = state.receivedOffers[award.offerId];
    const bid = state.localBids[award.bidId];
    const envelope = award.envelope;
    const payload = envelope.payload;
    const response = state.localAssignmentResponses[award.awardId];
    const recoveryCertificate =
      payload.authorityKind === "recovery_certificate"
        ? state.recoveryCertificates[payload.recoveryCertificateId]
        : undefined;
    if (
      !offer ||
      !bid ||
      bid.offerId !== award.offerId ||
      bidsByOffer.get(award.offerId)?.at(-1)?.bidId !== bid.bidId ||
      bid.bidRevision !== award.bidRevision ||
      envelope.tenantId !== state.identity.tenantId ||
      envelope.meshId !== state.identity.meshId ||
      envelope.sender.peerId !== offer.envelope.sender.peerId ||
      envelope.audience.kind !== "peer" ||
      envelope.audience.peerId !== state.identity.peerId ||
      (payload.authorityKind === "recovery_certificate"
        ? recoveryCertificate === undefined ||
          envelope.causationId !==
            (
              recoveryCertificate.recipientEnvelopes?.[state.identity.peerId] ??
              recoveryCertificate.envelope
            ).messageId
        : envelope.causationId !== bid.envelope.messageId) ||
      payload.assigneePeerId !== state.identity.peerId ||
      !awardAuthorityIsCanonical(payload) ||
      payload.objectiveId !== offer.envelope.payload.objectiveId ||
      payload.objectiveDocumentId !==
        offer.envelope.payload.objectiveDocumentId ||
      payload.objectiveRevision !== offer.envelope.payload.objectiveRevision ||
      payload.workItemId !== offer.envelope.payload.workItemId ||
      payload.workItemRevision !== offer.envelope.payload.workItemRevision ||
      payload.ownerPeerId !== offer.envelope.payload.ownerPeerId ||
      payload.ownerEpoch !== offer.envelope.payload.ownerEpoch ||
      payload.offerAttempt !== offer.envelope.payload.offerAttempt ||
      payload.workDeadline !== offer.envelope.payload.workDeadline ||
      award.leaseExpiresAtLogical > offer.workDeadlineAt ||
      award.receivedAt < bid.preparedAt ||
      (award.status === "awaiting_response" && response !== undefined) ||
      (award.status === "accepted" && response?.kind !== "work.accept") ||
      (award.status === "declined" && response?.kind !== "work.decline") ||
      (award.status === "timed_out" && response !== undefined) ||
      (award.status === "cancelled" && response !== undefined)
    )
      throw new TypeError("Mesh received award relation is invalid");
    const assignmentScope = JSON.stringify([
      payload.objectiveId,
      payload.workItemId,
      payload.workItemRevision,
      payload.assignmentEpoch,
    ]);
    const existingAwardId = assignmentScopes.get(assignmentScope);
    if (
      ["awaiting_response", "accepted"].includes(award.status) &&
      existingAwardId !== undefined &&
      existingAwardId !== award.awardId
    )
      throw new TypeError("Mesh received award scope is not unique");
    if (["awaiting_response", "accepted"].includes(award.status))
      assignmentScopes.set(assignmentScope, award.awardId);
    retainMessageId(envelope.messageId);
  }
  for (const response of Object.values(state.localAssignmentResponses)) {
    const award = state.receivedAwards[response.awardId];
    const envelope = response.envelope;
    const payload = envelope.payload;
    if (
      !award ||
      envelope.tenantId !== state.identity.tenantId ||
      envelope.meshId !== state.identity.meshId ||
      envelope.sender.peerId !== state.identity.peerId ||
      envelope.sender.instanceId !== state.identity.instanceId ||
      envelope.proof.keyId !== state.identity.keyId ||
      envelope.audience.kind !== "peer" ||
      envelope.audience.peerId !== award.envelope.sender.peerId ||
      envelope.causationId !== award.envelope.messageId ||
      response.preparedAt < award.receivedAt ||
      response.preparedAt >= award.acceptanceDeadlineAt ||
      payload.objectiveId !== award.envelope.payload.objectiveId ||
      payload.objectiveDocumentId !==
        award.envelope.payload.objectiveDocumentId ||
      payload.objectiveRevision !== award.envelope.payload.objectiveRevision ||
      payload.workItemId !== award.envelope.payload.workItemId ||
      payload.workItemRevision !== award.envelope.payload.workItemRevision ||
      payload.ownerPeerId !== award.envelope.payload.ownerPeerId ||
      payload.ownerEpoch !== award.envelope.payload.ownerEpoch ||
      payload.assigneePeerId !== state.identity.peerId ||
      payload.assignmentEpoch !== award.envelope.payload.assignmentEpoch ||
      payload.assignmentAuthorityId !==
        award.envelope.payload.assignmentAuthorityId ||
      payload.fencingToken !== award.envelope.payload.fencingToken ||
      payload.acceptanceDeadline !== award.envelope.payload.acceptanceDeadline
    )
      throw new TypeError("Mesh local assignment response relation is invalid");
    retainMessageId(envelope.messageId);
  }
  for (const authority of Object.values(state.assigneeAuthorities)) {
    const award = state.receivedAwards[authority.awardId];
    const response = state.localAssignmentResponses[authority.awardId];
    if (
      !award ||
      award.status !== "accepted" ||
      response?.kind !== "work.accept" ||
      response.responseId !== authority.acceptanceId ||
      authority.activatedAt !== response.preparedAt ||
      authority.assigneePeerId !== state.identity.peerId ||
      authority.objectiveId !== award.envelope.payload.objectiveId ||
      authority.objectiveDocumentId !==
        award.envelope.payload.objectiveDocumentId ||
      authority.objectiveRevision !==
        award.envelope.payload.objectiveRevision ||
      authority.workItemId !== award.envelope.payload.workItemId ||
      authority.workItemRevision !== award.envelope.payload.workItemRevision ||
      authority.ownerPeerId !== award.envelope.payload.ownerPeerId ||
      authority.ownerEpoch !== award.envelope.payload.ownerEpoch ||
      authority.workDeadline !== award.envelope.payload.workDeadline ||
      authority.workDeadlineAt !==
        state.receivedOffers[award.offerId]?.workDeadlineAt ||
      authority.leaseExpiresAt !== award.envelope.payload.leaseExpiresAt ||
      authority.leaseExpiresAtLogical !== award.leaseExpiresAtLogical
    )
      throw new TypeError("Mesh assignee authority relation is invalid");
  }
  for (const award of Object.values(state.receivedAwards)) {
    if (
      award.status === "accepted" &&
      !state.assigneeAuthorities[award.awardId]
    )
      throw new TypeError("Mesh accepted award has no local authority");
    if (award.status !== "accepted" && state.assigneeAuthorities[award.awardId])
      throw new TypeError("Mesh non-accepted award has local authority");
  }
  if (
    !allowMissingInitialLeaseHeads &&
    collectInitialLeaseHeads(state).some(
      ([scope]) => state.leaseHeads[scope] === undefined,
    )
  )
    throw new TypeError("Mesh accepted assignment has no initial lease head");
  validateExecutionStateRelations(state, messageIds, requireFrozen);
}

function validateExecutionStateRelations(
  state: MeshAllocationState,
  retainedMessageIds: Set<string>,
  requireFrozen: boolean,
): void {
  const renewalsByScope = new Map<string, MeshLeaseRenewalEvidence[]>();
  for (const renewal of Object.values(state.leaseRenewals)) {
    const payload = renewal.envelope.payload;
    const head = state.leaseHeads[renewal.executionScopeKey];
    const context =
      head === undefined
        ? undefined
        : validateMeshEnvelopeContext(renewal.envelope, {
            tenantId: state.identity.tenantId,
            meshId: state.identity.meshId,
            peerId: head.ownerPeerId,
            receivedAt: renewal.validityVerifiedAt,
            ...(renewal.supportedCriticalExtensions === undefined
              ? {}
              : {
                  supportedCriticalExtensions:
                    renewal.supportedCriticalExtensions,
                }),
          });
    if (
      !head ||
      !context?.ok ||
      renewal.executionScopeKey !== executionScopeKey(payload) ||
      !leaseRenewalAuthorityMatchesHead(payload, head) ||
      renewal.envelope.tenantId !== state.identity.tenantId ||
      renewal.envelope.meshId !== state.identity.meshId ||
      renewal.envelope.objectiveId !== payload.objectiveId ||
      renewal.envelope.sender.peerId !== head.assigneePeerId ||
      renewal.envelope.audience.kind !== "peer" ||
      renewal.envelope.audience.peerId !== head.ownerPeerId ||
      retainedMessageIds.has(renewal.envelope.messageId) ||
      (renewal.direction === "local" &&
        (state.identity.peerId !== head.assigneePeerId ||
          renewal.envelope.sender.peerId !== state.identity.peerId ||
          renewal.envelope.sender.instanceId !== state.identity.instanceId ||
          renewal.envelope.proof.keyId !== state.identity.keyId)) ||
      (renewal.direction === "received" &&
        (state.identity.peerId !== head.ownerPeerId ||
          renewal.envelope.audience.peerId !== state.identity.peerId))
    )
      throw new TypeError("Mesh lease renewal relation is invalid");
    retainedMessageIds.add(renewal.envelope.messageId);
    const chain = renewalsByScope.get(renewal.executionScopeKey) ?? [];
    chain.push(renewal);
    renewalsByScope.set(renewal.executionScopeKey, chain);
  }
  for (const [scope, chain] of renewalsByScope) {
    const head = state.leaseHeads[scope];
    chain.sort(
      (left, right) => left.leaseRenewalSequence - right.leaseRenewalSequence,
    );
    if (!head || chain.length !== head.leaseRenewalSequence)
      throw new TypeError("Mesh lease renewal head is missing");
    let previousExpiry = head.originalLeaseExpiresAt;
    let previousExpiryLogical = head.originalLeaseExpiresAtLogical;
    let previousAcceptedAt = activationAtForLeaseHead(head, state);
    if (previousAcceptedAt === undefined)
      throw new TypeError("Mesh lease renewal authority activation is missing");
    for (let index = 0; index < chain.length; index += 1) {
      const current = chain[index]!;
      const previous = chain[index - 1];
      const payload = current.envelope.payload;
      const renewedLogical = logicalDeadline(
        payload.renewedLeaseExpiresAt,
        previousExpiry,
        previousExpiryLogical,
      );
      if (
        current.leaseRenewalSequence !== index + 1 ||
        current.previousLeaseRenewalId !== previous?.leaseRenewalId ||
        payload.leaseExpiresAt !== previousExpiry ||
        current.envelope.causationId !==
          (previous === undefined
            ? head.acceptanceMessageId
            : previous.envelope.messageId) ||
        current.acceptedAt < previousAcceptedAt ||
        current.acceptedAt >= previousExpiryLogical ||
        current.acceptedAt >= head.workDeadlineAt ||
        compareTimestamp(current.validityVerifiedAt, previousExpiry) >= 0 ||
        compareTimestamp(current.validityVerifiedAt, head.workDeadline) >= 0 ||
        renewedLogical === undefined ||
        renewedLogical !== current.renewedLeaseExpiresAtLogical ||
        renewedLogical <= previousExpiryLogical ||
        renewedLogical > head.workDeadlineAt ||
        compareTimestamp(payload.renewedLeaseExpiresAt, head.workDeadline) > 0
      )
        throw new TypeError("Mesh lease renewal predecessor is invalid");
      previousExpiry = payload.renewedLeaseExpiresAt;
      previousExpiryLogical = current.renewedLeaseExpiresAtLogical;
      previousAcceptedAt = current.acceptedAt;
    }
    const latest = chain.at(-1)!;
    if (
      head.latestLeaseRenewalId !== latest.leaseRenewalId ||
      head.currentLeaseExpiresAt !==
        latest.envelope.payload.renewedLeaseExpiresAt ||
      head.currentLeaseExpiresAtLogical !== latest.renewedLeaseExpiresAtLogical
    )
      throw new TypeError("Mesh lease renewal current head is invalid");
  }
  for (const head of Object.values(state.leaseHeads)) {
    const executionHead = state.executionHeads[head.executionScopeKey];
    if (
      !leaseHeadHasAcceptedAuthority(head, state) ||
      (head.leaseRenewalSequence > 0 &&
        !renewalsByScope.has(head.executionScopeKey)) ||
      (head.leaseRenewalSequence === 0 &&
        (head.latestLeaseRenewalId !== undefined ||
          head.currentLeaseExpiresAt !== head.originalLeaseExpiresAt ||
          head.currentLeaseExpiresAtLogical !==
            head.originalLeaseExpiresAtLogical)) ||
      (head.status === "expired" &&
        state.lastLogicalTime < head.currentLeaseExpiresAtLogical) ||
      (head.status === "terminal" &&
        (executionHead === undefined || executionHead.phase === "active")) ||
      (executionHead !== undefined &&
        (executionHead.acceptanceId !== head.acceptanceId ||
          executionHead.acceptanceMessageId !== head.acceptanceMessageId ||
          executionHead.assignmentAuthorityId !== head.assignmentAuthorityId ||
          executionHead.fencingToken !== head.fencingToken ||
          executionHead.leaseExpiresAt !== head.currentLeaseExpiresAt ||
          executionHead.leaseExpiresAtLogical !==
            head.currentLeaseExpiresAtLogical))
    )
      throw new TypeError("Mesh lease head authority relation is invalid");
  }
  const recordsByScope = new Map<string, MeshExecutionRecordProjection[]>();
  for (const record of Object.values(state.executionRecords)) {
    const envelope = record.envelope;
    const payload = envelope.payload;
    const scope = executionScopeKey(payload);
    const expectedSender =
      payload.type === "work.release"
        ? payload.releaseAuthority === "owner"
          ? payload.ownerPeerId
          : payload.assigneePeerId
        : payload.type === "work.cancel"
          ? payload.ownerPeerId
          : payload.assigneePeerId;
    const expectedRecipient =
      expectedSender === payload.ownerPeerId
        ? payload.assigneePeerId
        : payload.ownerPeerId;
    if (
      envelope.tenantId !== state.identity.tenantId ||
      envelope.meshId !== state.identity.meshId ||
      envelope.objectiveId !== payload.objectiveId ||
      envelope.audience.kind !== "peer" ||
      envelope.sender.peerId !== expectedSender ||
      envelope.audience.peerId !== expectedRecipient ||
      (executionRecordRequiresActiveLease(payload) &&
        compareTimestamp(record.validityVerifiedAt, payload.leaseExpiresAt) >=
          0) ||
      retainedMessageIds.has(envelope.messageId) ||
      (record.direction === "local" &&
        (envelope.sender.peerId !== state.identity.peerId ||
          envelope.sender.instanceId !== state.identity.instanceId ||
          envelope.proof.keyId !== state.identity.keyId)) ||
      (record.direction === "received" &&
        envelope.audience.peerId !== state.identity.peerId)
    )
      throw new TypeError("Mesh execution record relation is invalid");
    retainedMessageIds.add(envelope.messageId);
    const records = recordsByScope.get(scope) ?? [];
    records.push(record);
    recordsByScope.set(scope, records);
    if (requireFrozen && !isDeepFrozenData(record))
      throw new TypeError("Mesh execution record evidence is mutable");
  }
  for (const [scope, records] of recordsByScope) {
    const head = state.executionHeads[scope];
    if (records.length > state.limits.maximumExecutionRecordsPerAssignment)
      throw new RangeError(
        "Mesh execution records per assignment limit exceeded",
      );
    if (head === undefined) {
      if (
        !records.every(
          (record) =>
            record.envelope.payload.type === "work.cancel" &&
            record.envelope.payload.assignmentState === "award_pending",
        ) ||
        records.length !== 1 ||
        !pendingCancellationMatchesAward(state, records[0]!)
      )
        throw new TypeError("Mesh pending execution cancellation is invalid");
      continue;
    }
    for (const record of records)
      if (
        !executionRecordMatchesHead(record, head, state) ||
        compareTimestamp(record.validityVerifiedAt, head.workDeadline) >= 0
      )
        throw new TypeError("Mesh execution authority binding is invalid");
  }
  for (const head of Object.values(state.executionHeads)) {
    const records = recordsByScope.get(head.executionScopeKey) ?? [];
    const localAuthority = state.assigneeAuthorities[head.awardId];
    const localAward = state.localAwards[head.awardId];
    const localResponse = state.localAssignmentResponses[head.awardId];
    const ownerResponse = state.assignmentResponses[head.awardId];
    const fence = state.assignmentFenceHeads[meshAssignmentFenceKey(head)];
    const superseded =
      fence !== undefined && fence.assignmentEpoch > head.assignmentEpoch;
    if (
      !executionHeadHasAcceptedAuthority(
        head,
        localAuthority,
        localAward,
        localResponse,
        ownerResponse,
      ) ||
      (localAward !== undefined &&
        !superseded &&
        state.workAllocations[
          workKey(localAward.objectiveId, localAward.work.workItemId)
        ]?.phase !== head.phase) ||
      (head.latestProgressId !== undefined &&
        !records.some(
          (record) =>
            record.recordType === "progress" &&
            record.recordId === head.latestProgressId,
        )) ||
      (head.latestCheckpointId !== undefined &&
        !records.some(
          (record) =>
            record.recordType === "checkpoint" &&
            record.recordId === head.latestCheckpointId,
        )) ||
      (head.resultId !== undefined &&
        !records.some(
          (record) =>
            record.recordType === "result" && record.recordId === head.resultId,
        )) ||
      (head.terminalRecordId !== undefined &&
        !records.some((record) => record.recordId === head.terminalRecordId)) ||
      !executionLifecycleMatchesHead(
        head,
        records,
        activationAtForExecutionHead(
          head,
          localAuthority,
          localResponse,
          ownerResponse,
        ),
        state,
      )
    )
      throw new TypeError("Mesh execution head relation is invalid");
    if (requireFrozen && !isDeepFrozenData(head))
      throw new TypeError("Mesh execution head is mutable");
  }
}

function leaseHeadHasAcceptedAuthority(
  head: MeshLeaseHeadProjection,
  state: MeshAllocationState,
): boolean {
  const localAward = state.localAwards[head.awardId];
  const ownerResponse = state.assignmentResponses[head.awardId];
  const assigneeAuthority = state.assigneeAuthorities[head.awardId];
  const localResponse = state.localAssignmentResponses[head.awardId];
  const common =
    head.originalLeaseExpiresAtLogical <= head.currentLeaseExpiresAtLogical &&
    head.currentLeaseExpiresAtLogical <= head.workDeadlineAt;
  if (!common) return false;
  if (
    localAward?.status === "accepted" &&
    ownerResponse?.kind === "work.accept"
  )
    return (
      ownerResponse.responseId === head.acceptanceId &&
      ownerResponse.envelope.messageId === head.acceptanceMessageId &&
      head.objectiveId === localAward.objectiveId &&
      head.objectiveDocumentId === localAward.objectiveDocumentId &&
      head.objectiveRevision === localAward.objectiveRevision &&
      head.workItemId === localAward.work.workItemId &&
      head.workItemRevision === localAward.work.workItemRevision &&
      head.ownerPeerId === localAward.work.ownerPeerId &&
      head.ownerEpoch === localAward.work.ownerEpoch &&
      head.assigneePeerId === localAward.assigneePeerId &&
      head.assignmentEpoch === localAward.assignmentEpoch &&
      head.assignmentAuthorityId === localAward.assignmentAuthorityId &&
      head.fencingToken === localAward.fencingToken &&
      head.originalLeaseExpiresAt === localAward.leaseExpiresAt &&
      head.originalLeaseExpiresAtLogical === localAward.leaseExpiresAtLogical &&
      head.workDeadline === localAward.workDeadline &&
      head.workDeadlineAt === localAward.work.workDeadlineAt
    );
  return (
    assigneeAuthority !== undefined &&
    localResponse?.kind === "work.accept" &&
    localResponse.responseId === head.acceptanceId &&
    localResponse.envelope.messageId === head.acceptanceMessageId &&
    head.objectiveId === assigneeAuthority.objectiveId &&
    head.objectiveDocumentId === assigneeAuthority.objectiveDocumentId &&
    head.objectiveRevision === assigneeAuthority.objectiveRevision &&
    head.workItemId === assigneeAuthority.workItemId &&
    head.workItemRevision === assigneeAuthority.workItemRevision &&
    head.ownerPeerId === assigneeAuthority.ownerPeerId &&
    head.ownerEpoch === assigneeAuthority.ownerEpoch &&
    head.assigneePeerId === assigneeAuthority.assigneePeerId &&
    head.assignmentEpoch === assigneeAuthority.assignmentEpoch &&
    head.assignmentAuthorityId === assigneeAuthority.assignmentAuthorityId &&
    head.fencingToken === assigneeAuthority.fencingToken &&
    head.originalLeaseExpiresAt === assigneeAuthority.leaseExpiresAt &&
    head.originalLeaseExpiresAtLogical ===
      assigneeAuthority.leaseExpiresAtLogical &&
    head.workDeadline === assigneeAuthority.workDeadline &&
    head.workDeadlineAt === assigneeAuthority.workDeadlineAt
  );
}

function leaseRenewalAuthorityMatchesHead(
  payload: LeaseRenewPayload,
  head: MeshLeaseHeadProjection,
): boolean {
  return (
    payload.objectiveId === head.objectiveId &&
    payload.objectiveDocumentId === head.objectiveDocumentId &&
    payload.objectiveRevision === head.objectiveRevision &&
    payload.workItemId === head.workItemId &&
    payload.workItemRevision === head.workItemRevision &&
    payload.ownerPeerId === head.ownerPeerId &&
    payload.ownerEpoch === head.ownerEpoch &&
    payload.assigneePeerId === head.assigneePeerId &&
    payload.awardId === head.awardId &&
    payload.acceptanceId === head.acceptanceId &&
    payload.assignmentEpoch === head.assignmentEpoch &&
    payload.assignmentAuthorityId === head.assignmentAuthorityId &&
    payload.fencingToken === head.fencingToken
  );
}

function activationAtForLeaseHead(
  head: MeshLeaseHeadProjection,
  state: MeshAllocationState,
): number | undefined {
  const ownerResponse = state.assignmentResponses[head.awardId];
  if (
    ownerResponse?.kind === "work.accept" &&
    ownerResponse.responseId === head.acceptanceId
  )
    return ownerResponse.acceptedAt;
  const localResponse = state.localAssignmentResponses[head.awardId];
  if (
    localResponse?.kind === "work.accept" &&
    localResponse.responseId === head.acceptanceId
  )
    return localResponse.preparedAt;
  return undefined;
}

function executionLifecycleMatchesHead(
  head: MeshExecutionHeadProjection,
  records: readonly MeshExecutionRecordProjection[],
  activatedAt: number | undefined,
  state: MeshAllocationState,
): boolean {
  if (activatedAt === undefined) return false;
  const resumeCheckpoint = recoveryResumeCheckpointForExecutionHead(
    state,
    head,
  );
  const resumeCheckpointId = resumeCheckpoint?.checkpointId;
  if (
    records.some((record) => {
      const leaseDeadline = executionRecordLeaseDeadline(record, head, state);
      return (
        record.recordedAt < activatedAt ||
        record.recordedAt >= head.workDeadlineAt ||
        (executionRecordRequiresActiveLease(record.envelope.payload) &&
          (leaseDeadline === undefined ||
            record.recordedAt < leaseDeadline.currentFrom ||
            (leaseDeadline.supersededAt !== undefined &&
              record.recordedAt > leaseDeadline.supersededAt) ||
            record.recordedAt >= leaseDeadline.logical ||
            compareTimestamp(record.validityVerifiedAt, leaseDeadline.wall) >=
              0))
      );
    })
  )
    return false;
  const progress = records
    .filter((record) => record.recordType === "progress")
    .sort(
      (left, right) =>
        (left.envelope.payload as WorkProgressPayload).progressSequence -
        (right.envelope.payload as WorkProgressPayload).progressSequence,
    );
  if (
    progress.some(
      (record, index) =>
        (record.envelope.payload as WorkProgressPayload).progressSequence !==
          index + 1 ||
        record.envelope.causationId !== head.acceptanceMessageId ||
        (index > 0 && record.recordedAt < progress[index - 1]!.recordedAt),
    ) ||
    (progress.length === 0
      ? head.latestProgressId !== undefined ||
        head.latestProgressSequence !== undefined
      : head.latestProgressId !== progress.at(-1)!.recordId ||
        head.latestProgressSequence !==
          (progress.at(-1)!.envelope.payload as WorkProgressPayload)
            .progressSequence)
  )
    return false;
  const checkpoints = records
    .filter((record) => record.recordType === "checkpoint")
    .sort(
      (left, right) =>
        (left.envelope.payload as WorkCheckpointPayload).checkpointSequence -
        (right.envelope.payload as WorkCheckpointPayload).checkpointSequence,
    );
  if (
    checkpoints.some(
      (record, index) =>
        (record.envelope.payload as WorkCheckpointPayload)
          .checkpointSequence !==
          (resumeCheckpoint?.checkpointSequence ?? 0) + index + 1 ||
        (record.envelope.payload as WorkCheckpointPayload)
          .previousCheckpointId !==
          (index === 0
            ? resumeCheckpointId
            : checkpoints[index - 1]?.recordId) ||
        record.envelope.causationId !==
          (index === 0
            ? head.acceptanceMessageId
            : checkpoints[index - 1]?.envelope.messageId) ||
        (index > 0 && record.recordedAt < checkpoints[index - 1]!.recordedAt),
    ) ||
    (checkpoints.length === 0
      ? head.latestCheckpointId !== undefined ||
        head.latestCheckpointSequence !== undefined
      : head.latestCheckpointId !== checkpoints.at(-1)!.recordId ||
        head.latestCheckpointSequence !==
          (checkpoints.at(-1)!.envelope.payload as WorkCheckpointPayload)
            .checkpointSequence)
  )
    return false;
  const results = records.filter((record) => record.recordType === "result");
  const latestCheckpoint = checkpoints.at(-1);
  if (
    results.some((record) => {
      const payload = record.envelope.payload as WorkResultPayload;
      return (
        payload.checkpointId !==
          (latestCheckpoint?.recordId ?? resumeCheckpointId) ||
        record.envelope.causationId !==
          (latestCheckpoint === undefined
            ? head.acceptanceMessageId
            : latestCheckpoint.envelope.messageId)
      );
    }) ||
    results.length > 1 ||
    (head.resultId === undefined) !== (results.length === 0) ||
    (results.length === 1 && head.resultId !== results[0]!.recordId)
  )
    return false;
  const terminal =
    head.terminalRecordId === undefined
      ? undefined
      : records.find((record) => record.recordId === head.terminalRecordId);
  const terminalRecords = records.filter((record) => {
    const payload = record.envelope.payload;
    return (
      record.recordType === "result" ||
      record.recordType === "release" ||
      (record.recordType === "cancel" &&
        payload.type === "work.cancel" &&
        payload.assignmentState === "active")
    );
  });
  if (
    terminalRecords.length > 1 ||
    (head.phase === "active" && terminalRecords.length !== 0) ||
    (head.phase !== "active" &&
      (terminalRecords.length !== 1 ||
        terminalRecords[0]?.recordId !== head.terminalRecordId)) ||
    (terminal !== undefined &&
      records.some(
        (record) =>
          record.recordId !== terminal.recordId &&
          record.recordedAt > (head.terminalAt as number),
      )) ||
    (head.phase === "active" && terminal !== undefined) ||
    (head.phase === "completed" &&
      (terminal?.recordType !== "result" ||
        terminal.recordedAt !== head.terminalAt)) ||
    (head.phase === "released" &&
      (terminal?.recordType !== "release" ||
        terminal.recordedAt !== head.terminalAt)) ||
    (head.phase === "cancelled" &&
      (terminal?.recordType !== "cancel" ||
        terminal.recordedAt !== head.terminalAt))
  )
    return false;
  if (
    terminal !== undefined &&
    terminal.recordType !== "result" &&
    (terminal.envelope.causationId !==
      currentLeaseCausationMessageIdForHead(head, state) ||
      (terminal.envelope.payload.type === "work.release" &&
        terminal.envelope.payload.releaseDisposition !== "close") ||
      (terminal.envelope.payload.type === "work.cancel" &&
        terminal.envelope.payload.assignmentState !== "active"))
  )
    return false;
  return true;
}

function recoveryResumeCheckpointForExecutionHead(
  state: MeshAllocationState,
  head: MeshExecutionHeadProjection,
): Readonly<{ checkpointId: string; checkpointSequence: number }> | undefined {
  const payload =
    state.localAwards[head.awardId]?.recipientAward.envelope.payload ??
    state.receivedAwards[head.awardId]?.envelope.payload;
  const checkpointId =
    payload?.authorityKind === "recovery_certificate"
      ? payload.resumeCheckpointId
      : undefined;
  if (checkpointId === undefined) return undefined;
  const record =
    state.executionRecords[checkpointId] ??
    Object.values(state.witnessAssignments)
      .map((witness) => witness.latestCheckpoint)
      .find((checkpoint) => checkpoint?.recordId === checkpointId);
  if (
    record?.envelope.payload.type !== "work.checkpoint" ||
    record.recordId !== checkpointId
  )
    return undefined;
  return Object.freeze({
    checkpointId,
    checkpointSequence: record.envelope.payload.checkpointSequence,
  });
}

function currentLeaseCausationMessageIdForHead(
  head: MeshExecutionHeadProjection,
  state: MeshAllocationState,
): string | undefined {
  const leaseHead = state.leaseHeads[head.executionScopeKey];
  if (leaseHead?.latestLeaseRenewalId === undefined)
    return head.acceptanceMessageId;
  return state.leaseRenewals[leaseHead.latestLeaseRenewalId]?.envelope
    .messageId;
}

function activationAtForExecutionHead(
  head: MeshExecutionHeadProjection,
  authority: MeshAssigneeAssignmentAuthorityProjection | undefined,
  localResponse: MeshLocalAssignmentResponseEvidence | undefined,
  ownerResponse: MeshAcceptedAssignmentResponseEvidence | undefined,
): number | undefined {
  if (authority?.awardId === head.awardId) return authority.activatedAt;
  if (localResponse?.responseId === head.acceptanceId)
    return localResponse.preparedAt;
  if (ownerResponse?.responseId === head.acceptanceId)
    return ownerResponse.acceptedAt;
  return undefined;
}

function executionRecordMatchesHead(
  record: MeshExecutionRecordProjection,
  head: MeshExecutionHeadProjection,
  state: MeshAllocationState,
): boolean {
  const payload = record.envelope.payload;
  return (
    payload.objectiveId === head.objectiveId &&
    payload.objectiveDocumentId === head.objectiveDocumentId &&
    payload.objectiveRevision === head.objectiveRevision &&
    payload.workItemId === head.workItemId &&
    payload.workItemRevision === head.workItemRevision &&
    payload.ownerPeerId === head.ownerPeerId &&
    payload.ownerEpoch === head.ownerEpoch &&
    payload.assigneePeerId === head.assigneePeerId &&
    payload.awardId === head.awardId &&
    payload.assignmentEpoch === head.assignmentEpoch &&
    payload.assignmentAuthorityId === head.assignmentAuthorityId &&
    payload.fencingToken === head.fencingToken &&
    leaseExpiryBelongsToHead(payload.leaseExpiresAt, head, state) &&
    (payload.type === "work.cancel" &&
    payload.assignmentState === "award_pending"
      ? head.phase === "cancelled"
      : payload.acceptanceId === head.acceptanceId)
  );
}

function executionRecordRequiresActiveLease(
  payload: MeshExecutionPayload,
): boolean {
  return (
    payload.type === "work.progress" ||
    payload.type === "work.checkpoint" ||
    payload.type === "work.result" ||
    (payload.type === "work.release" && payload.releaseAuthority === "assignee")
  );
}

function executionRecordLeaseDeadline(
  record: MeshExecutionRecordProjection,
  head: MeshExecutionHeadProjection,
  state: MeshAllocationState,
):
  | Readonly<{
      wall: string;
      logical: number;
      currentFrom: number;
      supersededAt?: number;
    }>
  | undefined {
  const leaseHead = state.leaseHeads[head.executionScopeKey];
  if (leaseHead === undefined) return undefined;
  const claimedExpiry = record.envelope.payload.leaseExpiresAt;
  const scopeRenewals = Object.values(state.leaseRenewals)
    .filter((entry) => entry.executionScopeKey === head.executionScopeKey)
    .sort(
      (left, right) => left.leaseRenewalSequence - right.leaseRenewalSequence,
    );
  if (claimedExpiry === leaseHead.originalLeaseExpiresAt) {
    const firstRenewal = scopeRenewals[0];
    return Object.freeze({
      wall: leaseHead.originalLeaseExpiresAt,
      logical: leaseHead.originalLeaseExpiresAtLogical,
      currentFrom: 0,
      ...(firstRenewal === undefined
        ? {}
        : { supersededAt: firstRenewal.acceptedAt }),
    });
  }
  const renewalIndex = scopeRenewals.findIndex(
    (entry) => entry.envelope.payload.renewedLeaseExpiresAt === claimedExpiry,
  );
  const renewal = scopeRenewals[renewalIndex];
  const successor = scopeRenewals[renewalIndex + 1];
  return renewal === undefined
    ? undefined
    : Object.freeze({
        wall: claimedExpiry,
        logical: renewal.renewedLeaseExpiresAtLogical,
        currentFrom: renewal.acceptedAt,
        ...(successor === undefined
          ? {}
          : { supersededAt: successor.acceptedAt }),
      });
}

function leaseExpiryBelongsToHead(
  leaseExpiresAt: string,
  head: MeshExecutionHeadProjection,
  state: MeshAllocationState,
): boolean {
  const leaseHead = state.leaseHeads[head.executionScopeKey];
  return (
    leaseExpiresAt === head.leaseExpiresAt ||
    (leaseHead !== undefined &&
      (leaseExpiresAt === leaseHead.originalLeaseExpiresAt ||
        Object.values(state.leaseRenewals).some(
          (renewal) =>
            renewal.executionScopeKey === head.executionScopeKey &&
            renewal.envelope.payload.renewedLeaseExpiresAt === leaseExpiresAt,
        )))
  );
}

function pendingCancellationMatchesAward(
  state: MeshAllocationState,
  record: MeshExecutionRecordProjection,
): boolean {
  const payload = record.envelope.payload;
  if (
    payload.type !== "work.cancel" ||
    payload.assignmentState !== "award_pending"
  )
    return false;
  const award = state.localAwards[payload.awardId];
  const receivedAward = state.receivedAwards[payload.awardId];
  const receivedOffer =
    receivedAward === undefined
      ? undefined
      : state.receivedOffers[receivedAward.offerId];
  return (
    (award !== undefined &&
      award.status === "cancelled" &&
      record.direction === "local" &&
      record.envelope.causationId === award.recipientAward.messageId &&
      record.recordedAt >= award.createdAt &&
      record.recordedAt < award.leaseExpiresAtLogical &&
      record.recordedAt < award.work.workDeadlineAt &&
      compareTimestamp(record.validityVerifiedAt, award.workDeadline) < 0 &&
      award.objectiveId === payload.objectiveId &&
      award.objectiveDocumentId === payload.objectiveDocumentId &&
      award.objectiveRevision === payload.objectiveRevision &&
      award.work.workItemId === payload.workItemId &&
      award.work.workItemRevision === payload.workItemRevision &&
      award.work.ownerPeerId === payload.ownerPeerId &&
      award.work.ownerEpoch === payload.ownerEpoch &&
      award.assigneePeerId === payload.assigneePeerId &&
      award.assignmentEpoch === payload.assignmentEpoch &&
      award.assignmentAuthorityId === payload.assignmentAuthorityId &&
      award.fencingToken === payload.fencingToken &&
      award.leaseExpiresAt === payload.leaseExpiresAt) ||
    (receivedAward !== undefined &&
      receivedOffer !== undefined &&
      receivedAward.status === "cancelled" &&
      record.direction === "received" &&
      record.envelope.causationId === receivedAward.envelope.messageId &&
      record.recordedAt >= receivedAward.receivedAt &&
      record.recordedAt < receivedAward.leaseExpiresAtLogical &&
      record.recordedAt < receivedOffer.workDeadlineAt &&
      compareTimestamp(
        record.validityVerifiedAt,
        receivedOffer.envelope.payload.workDeadline,
      ) < 0 &&
      receivedAward.envelope.payload.objectiveId === payload.objectiveId &&
      receivedAward.envelope.payload.objectiveDocumentId ===
        payload.objectiveDocumentId &&
      receivedAward.envelope.payload.objectiveRevision ===
        payload.objectiveRevision &&
      receivedAward.envelope.payload.workItemId === payload.workItemId &&
      receivedAward.envelope.payload.workItemRevision ===
        payload.workItemRevision &&
      receivedAward.envelope.payload.ownerPeerId === payload.ownerPeerId &&
      receivedAward.envelope.payload.ownerEpoch === payload.ownerEpoch &&
      receivedAward.envelope.payload.assigneePeerId ===
        payload.assigneePeerId &&
      receivedAward.envelope.payload.assignmentEpoch ===
        payload.assignmentEpoch &&
      receivedAward.envelope.payload.assignmentAuthorityId ===
        payload.assignmentAuthorityId &&
      receivedAward.envelope.payload.fencingToken === payload.fencingToken &&
      receivedAward.envelope.payload.leaseExpiresAt === payload.leaseExpiresAt)
  );
}

function executionHeadHasAcceptedAuthority(
  head: MeshExecutionHeadProjection,
  assigneeAuthority: MeshAssigneeAssignmentAuthorityProjection | undefined,
  localAward: MeshLocalAwardProjection | undefined,
  localResponse: MeshLocalAssignmentResponseEvidence | undefined,
  ownerResponse: MeshAcceptedAssignmentResponseEvidence | undefined,
): boolean {
  if (
    assigneeAuthority !== undefined &&
    assigneeAuthority.awardId === head.awardId &&
    assigneeAuthority.acceptanceId === head.acceptanceId &&
    head.objectiveId === assigneeAuthority.objectiveId &&
    head.objectiveDocumentId === assigneeAuthority.objectiveDocumentId &&
    head.objectiveRevision === assigneeAuthority.objectiveRevision &&
    head.workItemId === assigneeAuthority.workItemId &&
    head.workItemRevision === assigneeAuthority.workItemRevision &&
    head.ownerPeerId === assigneeAuthority.ownerPeerId &&
    head.ownerEpoch === assigneeAuthority.ownerEpoch &&
    head.assigneePeerId === assigneeAuthority.assigneePeerId &&
    head.assignmentEpoch === assigneeAuthority.assignmentEpoch &&
    head.assignmentAuthorityId === assigneeAuthority.assignmentAuthorityId &&
    head.fencingToken === assigneeAuthority.fencingToken &&
    head.workDeadline === assigneeAuthority.workDeadline &&
    head.workDeadlineAt === assigneeAuthority.workDeadlineAt &&
    head.leaseExpiresAtLogical >= assigneeAuthority.leaseExpiresAtLogical &&
    head.leaseExpiresAtLogical <= head.workDeadlineAt
  )
    return (
      localResponse?.kind === "work.accept" &&
      localResponse.responseId === head.acceptanceId &&
      localResponse.envelope.messageId === head.acceptanceMessageId
    );
  return (
    localAward?.status === "accepted" &&
    ownerResponse?.kind === "work.accept" &&
    ownerResponse.responseId === head.acceptanceId &&
    ownerResponse.envelope.messageId === head.acceptanceMessageId &&
    head.objectiveId === localAward.objectiveId &&
    head.objectiveDocumentId === localAward.objectiveDocumentId &&
    head.objectiveRevision === localAward.objectiveRevision &&
    head.workItemId === localAward.work.workItemId &&
    head.workItemRevision === localAward.work.workItemRevision &&
    head.ownerPeerId === localAward.work.ownerPeerId &&
    head.ownerEpoch === localAward.work.ownerEpoch &&
    head.assigneePeerId === localAward.assigneePeerId &&
    head.assignmentEpoch === localAward.assignmentEpoch &&
    head.assignmentAuthorityId === localAward.assignmentAuthorityId &&
    head.fencingToken === localAward.fencingToken &&
    head.workDeadline === localAward.workDeadline &&
    head.workDeadlineAt === localAward.work.workDeadlineAt &&
    head.leaseExpiresAtLogical >= localAward.leaseExpiresAtLogical &&
    head.leaseExpiresAtLogical <= head.workDeadlineAt
  );
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
    ![
      "ready",
      "offered",
      "award_pending",
      "recovering",
      "active",
      "completed",
      "released",
      "cancelled",
    ].includes(value.phase)
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
      "supportedCriticalExtensions",
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
  assertCriticalExtensions(value.supportedCriticalExtensions, "local offer");
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
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...value.supportedCriticalExtensions,
          ]),
        }),
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
    !Number.isSafeInteger(value.assignmentEpoch) ||
    value.assignmentEpoch < 1 ||
    value.acceptanceDeadlineTimerId !==
      `allocation.acceptance.${value.awardId}` ||
    ![
      "awaiting_acceptance",
      "accepted",
      "declined",
      "timed_out",
      "cancelled",
    ].includes(value.status)
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
    !awardAuthorityIsCanonical(prepared.envelope.payload) ||
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
      "acceptanceWindowMs",
      "acceptedAt",
      "acceptedMessageId",
      "expiresAt",
      "maximumLeaseDurationMs",
      "maximumLeaseRenewals",
      "maximumBudgetUnits",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "permittedCapabilityKeys",
      "recoveryGraceMs",
      "recoveryWitnessPeerIds",
      "recoveryWitnessThreshold",
      "validUntil",
    ],
    [
      "acceptanceWindowMs",
      "acceptedAt",
      "acceptedMessageId",
      "expiresAt",
      "maximumLeaseDurationMs",
      "maximumLeaseRenewals",
      "maximumBudgetUnits",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "permittedCapabilityKeys",
      "recoveryGraceMs",
      "recoveryWitnessPeerIds",
      "recoveryWitnessThreshold",
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
    !Number.isSafeInteger(value.acceptanceWindowMs) ||
    value.acceptanceWindowMs < 1 ||
    !Number.isSafeInteger(value.maximumLeaseDurationMs) ||
    value.maximumLeaseDurationMs < 1 ||
    !Number.isSafeInteger(value.maximumLeaseRenewals) ||
    value.maximumLeaseRenewals < 0 ||
    !Number.isSafeInteger(value.recoveryGraceMs) ||
    value.recoveryGraceMs < 1 ||
    !Array.isArray(value.permittedCapabilityKeys) ||
    value.permittedCapabilityKeys.some((key) => typeof key !== "string") ||
    !Array.isArray(value.recoveryWitnessPeerIds) ||
    value.recoveryWitnessPeerIds.length < 3 ||
    value.recoveryWitnessPeerIds.some(
      (peerId, index) =>
        typeof peerId !== "string" ||
        peerId.length === 0 ||
        (index > 0 &&
          value.recoveryWitnessPeerIds[index - 1]!.localeCompare(peerId) >= 0),
    ) ||
    !Number.isSafeInteger(value.recoveryWitnessThreshold) ||
    value.recoveryWitnessThreshold <= value.recoveryWitnessPeerIds.length / 2 ||
    value.recoveryWitnessThreshold > value.recoveryWitnessPeerIds.length ||
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

function freezeReceivedOffer(
  value: MeshReceivedOfferProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshReceivedOfferProjection {
  assertPlainRecord(value, "received offer");
  assertExactKeys(
    value,
    [
      "bidDeadlineAt",
      "envelope",
      "offerId",
      "receivedAt",
      "supportedCriticalExtensions",
      "validityVerifiedAt",
      "workDeadlineAt",
    ],
    [
      "bidDeadlineAt",
      "envelope",
      "offerId",
      "receivedAt",
      "validityVerifiedAt",
      "workDeadlineAt",
    ],
  );
  assertIdentifier(value.offerId, "received offerId");
  assertMeshLogicalTime(value.receivedAt);
  assertMeshLogicalTime(value.bidDeadlineAt);
  assertMeshLogicalTime(value.workDeadlineAt);
  assertTimestamp(
    value.validityVerifiedAt,
    "received offer validityVerifiedAt",
  );
  assertCriticalExtensions(value.supportedCriticalExtensions, "received offer");
  const envelope = validateOfferEnvelope(value.envelope, true);
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    peerId: envelope.audience.kind === "peer" ? envelope.audience.peerId : "",
    receivedAt: value.validityVerifiedAt,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions: value.supportedCriticalExtensions }),
  });
  if (
    !context.ok ||
    value.receivedAt > last ||
    value.bidDeadlineAt !==
      logicalDeadline(
        envelope.payload.bidDeadline,
        value.validityVerifiedAt,
        value.receivedAt,
      ) ||
    value.workDeadlineAt !==
      logicalDeadline(
        envelope.payload.workDeadline,
        value.validityVerifiedAt,
        value.receivedAt,
      ) ||
    value.bidDeadlineAt <= value.receivedAt ||
    value.workDeadlineAt <= value.receivedAt ||
    value.bidDeadlineAt > value.workDeadlineAt ||
    envelope.payload.offerId !== value.offerId
  )
    throw new TypeError("Mesh received offer projection is invalid");
  const frozen = Object.freeze({
    ...value,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...value.supportedCriticalExtensions,
          ]),
        }),
    envelope: deepFreezeCopy(envelope) as SignedMeshEnvelope<WorkOfferPayload>,
  });
  assertByteBound(
    frozen,
    limits.maximumProjectionBytes,
    "received offer projection",
  );
  return frozen;
}

function freezeLocalBid(
  value: MeshLocalBidProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshLocalBidProjection {
  assertPlainRecord(value, "local bid");
  assertExactKeys(
    value,
    [
      "bidExpiresAt",
      "bidExpiresAtLogical",
      "bidId",
      "bidRevision",
      "envelope",
      "offerId",
      "preparedAt",
      "previousBidId",
      "validityVerifiedAt",
    ],
    [
      "bidExpiresAt",
      "bidExpiresAtLogical",
      "bidId",
      "bidRevision",
      "envelope",
      "offerId",
      "preparedAt",
      "validityVerifiedAt",
    ],
  );
  assertIdentifier(value.bidId, "local bidId");
  assertIdentifier(value.offerId, "local bid offerId");
  assertOptionalIdentifier(value.previousBidId, "local previousBidId");
  assertTimestamp(value.bidExpiresAt, "local bid expiry");
  assertTimestamp(value.validityVerifiedAt, "local bid validityVerifiedAt");
  assertMeshLogicalTime(value.preparedAt);
  assertMeshLogicalTime(value.bidExpiresAtLogical);
  const envelope = validateBidEnvelope(value.envelope, true);
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    peerId: envelope.audience.kind === "peer" ? envelope.audience.peerId : "",
    receivedAt: value.validityVerifiedAt,
  });
  if (
    !context.ok ||
    value.preparedAt > last ||
    !Number.isSafeInteger(value.bidRevision) ||
    value.bidRevision < 1 ||
    value.previousBidId === value.bidId ||
    value.bidExpiresAtLogical !==
      logicalDeadline(
        value.bidExpiresAt,
        value.validityVerifiedAt,
        value.preparedAt,
      ) ||
    value.bidExpiresAtLogical <= value.preparedAt ||
    envelope.payload.bidId !== value.bidId ||
    envelope.payload.offerId !== value.offerId ||
    envelope.payload.bidRevision !== value.bidRevision ||
    envelope.payload.previousBidId !== value.previousBidId ||
    envelope.payload.bidExpiresAt !== value.bidExpiresAt
  )
    throw new TypeError("Mesh local bid projection is invalid");
  const frozen = Object.freeze({
    ...value,
    envelope: deepFreezeCopy(envelope) as SignedMeshEnvelope<WorkBidPayload>,
  });
  assertByteBound(
    frozen,
    limits.maximumProjectionBytes,
    "local bid projection",
  );
  return frozen;
}

function freezeReceivedAward(
  value: MeshReceivedAwardProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshReceivedAwardProjection {
  assertPlainRecord(value, "received award");
  assertExactKeys(
    value,
    [
      "acceptanceDeadlineAt",
      "acceptanceDeadlineTimerGeneration",
      "acceptanceDeadlineTimerId",
      "awardId",
      "bidId",
      "bidRevision",
      "envelope",
      "leaseExpiresAtLogical",
      "offerId",
      "receivedAt",
      "status",
      "supportedCriticalExtensions",
      "validityVerifiedAt",
    ],
    [
      "acceptanceDeadlineAt",
      "acceptanceDeadlineTimerGeneration",
      "acceptanceDeadlineTimerId",
      "awardId",
      "bidId",
      "bidRevision",
      "envelope",
      "leaseExpiresAtLogical",
      "offerId",
      "receivedAt",
      "status",
      "validityVerifiedAt",
    ],
  );
  for (const [name, id] of Object.entries({
    awardId: value.awardId,
    offerId: value.offerId,
    bidId: value.bidId,
  }))
    assertIdentifier(id, name);
  assertTimestamp(
    value.validityVerifiedAt,
    "received award validityVerifiedAt",
  );
  assertCriticalExtensions(value.supportedCriticalExtensions, "received award");
  for (const time of [
    value.receivedAt,
    value.acceptanceDeadlineAt,
    value.leaseExpiresAtLogical,
  ])
    assertMeshLogicalTime(time);
  const parsed = validateSignedMeshEnvelope(value.envelope);
  if (!parsed.ok || parsed.value.payload.type !== "work.award")
    throw new TypeError("Mesh signed received award is invalid");
  const envelope = parsed.value as SignedMeshEnvelope<WorkAwardPayload>;
  assertCanonicalPayloadDigest(envelope);
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    peerId: envelope.audience.kind === "peer" ? envelope.audience.peerId : "",
    receivedAt: value.validityVerifiedAt,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions: value.supportedCriticalExtensions }),
  });
  if (
    !context.ok ||
    value.receivedAt > last ||
    value.acceptanceDeadlineTimerId !==
      `allocation.assignee_response.${value.awardId}` ||
    !Number.isSafeInteger(value.acceptanceDeadlineTimerGeneration) ||
    value.acceptanceDeadlineTimerGeneration < 1 ||
    !Number.isSafeInteger(value.bidRevision) ||
    value.bidRevision < 1 ||
    ![
      "awaiting_response",
      "accepted",
      "declined",
      "timed_out",
      "cancelled",
    ].includes(value.status) ||
    value.acceptanceDeadlineAt !==
      logicalDeadline(
        envelope.payload.acceptanceDeadline,
        value.validityVerifiedAt,
        value.receivedAt,
      ) ||
    value.leaseExpiresAtLogical !==
      logicalDeadline(
        envelope.payload.leaseExpiresAt,
        value.validityVerifiedAt,
        value.receivedAt,
      ) ||
    value.acceptanceDeadlineAt <= value.receivedAt ||
    value.leaseExpiresAtLogical <= value.receivedAt ||
    envelope.payload.awardId !== value.awardId ||
    envelope.payload.offerId !== value.offerId ||
    envelope.payload.bidId !== value.bidId ||
    envelope.payload.bidRevision !== value.bidRevision
  )
    throw new TypeError("Mesh received award projection is invalid");
  const frozen = Object.freeze({
    ...value,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...value.supportedCriticalExtensions,
          ]),
        }),
    envelope: deepFreezeCopy(envelope) as SignedMeshEnvelope<WorkAwardPayload>,
  });
  assertByteBound(
    frozen,
    limits.maximumProjectionBytes,
    "received award projection",
  );
  return frozen;
}

function freezeLocalAssignmentResponse(
  value: MeshLocalAssignmentResponseEvidence,
  last: number,
  limits: MeshAllocationLimits,
): MeshLocalAssignmentResponseEvidence {
  assertPlainRecord(value, "local assignment response");
  assertExactKeys(
    value,
    [
      "awardId",
      "envelope",
      "kind",
      "preparedAt",
      "responseId",
      "validityVerifiedAt",
    ],
    [
      "awardId",
      "envelope",
      "kind",
      "preparedAt",
      "responseId",
      "validityVerifiedAt",
    ],
  );
  assertIdentifier(value.awardId, "local response awardId");
  assertIdentifier(value.responseId, "local responseId");
  assertMeshLogicalTime(value.preparedAt);
  assertTimestamp(
    value.validityVerifiedAt,
    "local response validityVerifiedAt",
  );
  const parsed = validateSignedMeshEnvelope(value.envelope);
  if (
    !parsed.ok ||
    (parsed.value.payload.type !== "work.accept" &&
      parsed.value.payload.type !== "work.decline")
  )
    throw new TypeError("Mesh signed local assignment response is invalid");
  const envelope = parsed.value as SignedMeshEnvelope<
    WorkAcceptPayload | WorkDeclinePayload
  >;
  assertCanonicalPayloadDigest(envelope);
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    peerId: envelope.audience.kind === "peer" ? envelope.audience.peerId : "",
    receivedAt: value.validityVerifiedAt,
  });
  const responseId =
    envelope.payload.type === "work.accept"
      ? envelope.payload.acceptanceId
      : envelope.payload.declineId;
  if (
    !context.ok ||
    value.preparedAt > last ||
    value.kind !== envelope.payload.type ||
    value.responseId !== responseId ||
    envelope.payload.awardId !== value.awardId
  )
    throw new TypeError("Mesh local assignment response projection is invalid");
  const frozen = Object.freeze({
    ...value,
    envelope: deepFreezeCopy(envelope) as SignedMeshEnvelope<
      WorkAcceptPayload | WorkDeclinePayload
    >,
  });
  assertByteBound(
    frozen,
    limits.maximumProjectionBytes,
    "local assignment response",
  );
  return frozen;
}

function freezeAssigneeAuthority(
  value: MeshAssigneeAssignmentAuthorityProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshAssigneeAssignmentAuthorityProjection {
  assertPlainRecord(value, "assignee authority");
  assertExactKeys(
    value,
    [
      "acceptanceId",
      "activatedAt",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assigneePeerId",
      "awardId",
      "fencingToken",
      "leaseExpiresAt",
      "leaseExpiresAtLogical",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "ownerEpoch",
      "ownerPeerId",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
    [
      "acceptanceId",
      "activatedAt",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assigneePeerId",
      "awardId",
      "fencingToken",
      "leaseExpiresAt",
      "leaseExpiresAtLogical",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "ownerEpoch",
      "ownerPeerId",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
  );
  for (const [name, id] of Object.entries({
    acceptanceId: value.acceptanceId,
    assignmentAuthorityId: value.assignmentAuthorityId,
    assigneePeerId: value.assigneePeerId,
    awardId: value.awardId,
    fencingToken: value.fencingToken,
    objectiveDocumentId: value.objectiveDocumentId,
    objectiveId: value.objectiveId,
    ownerPeerId: value.ownerPeerId,
    workItemId: value.workItemId,
  }))
    assertIdentifier(id, name);
  assertTimestamp(value.workDeadline, "authority workDeadline");
  assertTimestamp(value.leaseExpiresAt, "authority leaseExpiresAt");
  for (const time of [
    value.activatedAt,
    value.workDeadlineAt,
    value.leaseExpiresAtLogical,
  ])
    assertMeshLogicalTime(time);
  if (
    value.activatedAt > last ||
    !Number.isSafeInteger(value.assignmentEpoch) ||
    value.assignmentEpoch < 1 ||
    value.workDeadlineAt <= value.activatedAt ||
    value.leaseExpiresAtLogical <= value.activatedAt ||
    value.leaseExpiresAtLogical > value.workDeadlineAt ||
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1 ||
    !Number.isSafeInteger(value.workItemRevision) ||
    value.workItemRevision < 1 ||
    value.ownerEpoch !== 1
  )
    throw new TypeError("Mesh assignee authority projection is invalid");
  const frozen = Object.freeze({ ...value });
  assertByteBound(
    frozen,
    limits.maximumProjectionBytes,
    "assignee authority projection",
  );
  return frozen;
}

function freezeExecutionRecord(
  value: MeshExecutionRecordProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshExecutionRecordProjection {
  assertPlainRecord(value, "execution record");
  assertExactKeys(
    value,
    [
      "direction",
      "envelope",
      "recordedAt",
      "recordId",
      "recordType",
      "supportedCriticalExtensions",
      "validityVerifiedAt",
    ],
    [
      "direction",
      "envelope",
      "recordedAt",
      "recordId",
      "recordType",
      "validityVerifiedAt",
    ],
  );
  assertIdentifier(value.recordId, "execution recordId");
  if (
    !["progress", "checkpoint", "result", "release", "cancel"].includes(
      value.recordType,
    ) ||
    !["local", "received"].includes(value.direction)
  )
    throw new TypeError("Mesh execution record kind is invalid");
  assertMeshLogicalTime(value.recordedAt);
  assertTimestamp(value.validityVerifiedAt, "execution validityVerifiedAt");
  assertCriticalExtensions(
    value.supportedCriticalExtensions,
    "execution record",
  );
  const parsed = validateSignedMeshEnvelope(value.envelope);
  if (!parsed.ok || !isExecutionPayload(parsed.value.payload))
    throw new TypeError("Mesh signed execution envelope is invalid");
  const envelope = parsed.value as SignedMeshEnvelope<MeshExecutionPayload>;
  assertCanonicalPayloadDigest(envelope);
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    peerId: envelope.audience.kind === "peer" ? envelope.audience.peerId : "",
    receivedAt: value.validityVerifiedAt,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions: value.supportedCriticalExtensions }),
  });
  if (
    !context.ok ||
    value.recordedAt > last ||
    executionRecordType(envelope.payload) !== value.recordType ||
    executionRecordId(envelope.payload) !== value.recordId
  )
    throw new TypeError("Mesh execution record projection is invalid");
  const frozen = Object.freeze({
    ...value,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...value.supportedCriticalExtensions,
          ]),
        }),
    envelope: deepFreezeCopy(
      envelope,
    ) as SignedMeshEnvelope<MeshExecutionPayload>,
  });
  assertByteBound(frozen, limits.maximumProjectionBytes, "execution record");
  return frozen;
}

function freezeExecutionHead(
  value: MeshExecutionHeadProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshExecutionHeadProjection {
  assertPlainRecord(value, "execution head");
  assertExactKeys(
    value,
    [
      "acceptanceId",
      "acceptanceMessageId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assigneePeerId",
      "awardId",
      "executionScopeKey",
      "fencingToken",
      "latestCheckpointId",
      "latestCheckpointSequence",
      "latestProgressId",
      "latestProgressSequence",
      "leaseExpiresAt",
      "leaseExpiresAtLogical",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "ownerEpoch",
      "ownerPeerId",
      "phase",
      "resultId",
      "terminalAt",
      "terminalRecordId",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
    [
      "acceptanceId",
      "acceptanceMessageId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assigneePeerId",
      "awardId",
      "executionScopeKey",
      "fencingToken",
      "leaseExpiresAt",
      "leaseExpiresAtLogical",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "ownerEpoch",
      "ownerPeerId",
      "phase",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
  );
  for (const name of [
    "acceptanceId",
    "acceptanceMessageId",
    "assignmentAuthorityId",
    "assigneePeerId",
    "awardId",
    "fencingToken",
    "objectiveDocumentId",
    "objectiveId",
    "ownerPeerId",
    "workItemId",
  ])
    assertIdentifier((value as Record<string, unknown>)[name], name);
  assertTimestamp(value.workDeadline, "execution workDeadline");
  assertTimestamp(value.leaseExpiresAt, "execution leaseExpiresAt");
  for (const time of [value.workDeadlineAt, value.leaseExpiresAtLogical])
    assertMeshLogicalTime(time);
  for (const [name, sequence] of [
    ["latestProgressSequence", value.latestProgressSequence],
    ["latestCheckpointSequence", value.latestCheckpointSequence],
  ] as const)
    if (
      sequence !== undefined &&
      (!Number.isSafeInteger(sequence) || sequence < 1)
    )
      throw new TypeError(`Mesh execution ${name} is invalid`);
  assertOptionalIdentifier(value.latestProgressId, "latest progressId");
  assertOptionalIdentifier(value.latestCheckpointId, "latest checkpointId");
  assertOptionalIdentifier(value.resultId, "execution resultId");
  assertOptionalIdentifier(
    value.terminalRecordId,
    "execution terminal recordId",
  );
  if (value.terminalAt !== undefined) assertMeshLogicalTime(value.terminalAt);
  if (
    value.executionScopeKey !== executionScopeKey(value) ||
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1 ||
    !Number.isSafeInteger(value.workItemRevision) ||
    value.workItemRevision < 1 ||
    !Number.isSafeInteger(value.ownerEpoch) ||
    value.ownerEpoch < 1 ||
    !Number.isSafeInteger(value.assignmentEpoch) ||
    value.assignmentEpoch < 1 ||
    value.leaseExpiresAtLogical > value.workDeadlineAt ||
    !["active", "completed", "released", "cancelled"].includes(value.phase) ||
    (value.phase === "active" &&
      (value.terminalRecordId !== undefined ||
        value.terminalAt !== undefined)) ||
    (value.phase !== "active" &&
      (value.terminalRecordId === undefined ||
        value.terminalAt === undefined)) ||
    (value.terminalAt !== undefined && value.terminalAt > last) ||
    (value.phase === "completed" && value.resultId === undefined)
  )
    throw new TypeError("Mesh execution head is invalid");
  const frozen = Object.freeze({ ...value });
  assertByteBound(frozen, limits.maximumProjectionBytes, "execution head");
  return frozen;
}

function freezeLeaseRenewal(
  value: MeshLeaseRenewalEvidence,
  last: number,
  limits: MeshAllocationLimits,
): MeshLeaseRenewalEvidence {
  assertPlainRecord(value, "lease renewal");
  assertExactKeys(
    value,
    [
      "acceptedAt",
      "direction",
      "envelope",
      "executionScopeKey",
      "leaseRenewalId",
      "leaseRenewalSequence",
      "previousLeaseRenewalId",
      "renewedLeaseExpiresAtLogical",
      "supportedCriticalExtensions",
      "validityVerifiedAt",
    ],
    [
      "acceptedAt",
      "direction",
      "envelope",
      "executionScopeKey",
      "leaseRenewalId",
      "leaseRenewalSequence",
      "renewedLeaseExpiresAtLogical",
      "validityVerifiedAt",
    ],
  );
  assertIdentifier(value.leaseRenewalId, "leaseRenewalId");
  assertOptionalIdentifier(
    value.previousLeaseRenewalId,
    "previousLeaseRenewalId",
  );
  assertMeshLogicalTime(value.acceptedAt);
  assertMeshLogicalTime(value.renewedLeaseExpiresAtLogical);
  assertTimestamp(value.validityVerifiedAt, "lease renewal validityVerifiedAt");
  if (
    !Number.isSafeInteger(value.leaseRenewalSequence) ||
    value.leaseRenewalSequence < 1 ||
    value.leaseRenewalSequence > limits.maximumLeaseRenewals ||
    !["local", "received"].includes(value.direction) ||
    value.acceptedAt > last
  )
    throw new TypeError("Mesh lease renewal is invalid");
  assertCriticalExtensions(value.supportedCriticalExtensions, "lease renewal");
  const parsed = validateSignedMeshEnvelope(value.envelope);
  if (!parsed.ok || parsed.value.payload.type !== "lease.renew")
    throw new TypeError("Mesh signed lease renewal is invalid");
  const envelope = parsed.value as SignedMeshEnvelope<LeaseRenewPayload>;
  assertCanonicalPayloadDigest(envelope);
  if (
    envelope.payload.leaseRenewalId !== value.leaseRenewalId ||
    envelope.payload.leaseRenewalSequence !== value.leaseRenewalSequence ||
    envelope.payload.previousLeaseRenewalId !== value.previousLeaseRenewalId ||
    executionScopeKey(envelope.payload) !== value.executionScopeKey ||
    value.renewedLeaseExpiresAtLogical <= value.acceptedAt
  )
    throw new TypeError("Mesh lease renewal projection is invalid");
  const frozen = Object.freeze({
    ...value,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...value.supportedCriticalExtensions,
          ]),
        }),
    envelope: deepFreezeCopy(envelope) as SignedMeshEnvelope<LeaseRenewPayload>,
  });
  assertByteBound(frozen, limits.maximumProjectionBytes, "lease renewal");
  return frozen;
}

function freezeLeaseHead(
  value: MeshLeaseHeadProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshLeaseHeadProjection {
  assertPlainRecord(value, "lease head");
  assertExactKeys(
    value,
    [
      "acceptanceId",
      "acceptanceMessageId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assigneePeerId",
      "awardId",
      "currentLeaseExpiresAt",
      "currentLeaseExpiresAtLogical",
      "executionScopeKey",
      "expiryTimerGeneration",
      "expiryTimerId",
      "fencingToken",
      "latestLeaseRenewalId",
      "leaseRenewalSequence",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "originalLeaseExpiresAt",
      "originalLeaseExpiresAtLogical",
      "ownerEpoch",
      "ownerPeerId",
      "status",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
    [
      "acceptanceId",
      "acceptanceMessageId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assigneePeerId",
      "awardId",
      "currentLeaseExpiresAt",
      "currentLeaseExpiresAtLogical",
      "executionScopeKey",
      "fencingToken",
      "leaseRenewalSequence",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "originalLeaseExpiresAt",
      "originalLeaseExpiresAtLogical",
      "ownerEpoch",
      "ownerPeerId",
      "status",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
  );
  for (const field of [
    "acceptanceId",
    "acceptanceMessageId",
    "assignmentAuthorityId",
    "assigneePeerId",
    "awardId",
    "fencingToken",
    "objectiveDocumentId",
    "objectiveId",
    "ownerPeerId",
    "workItemId",
  ])
    assertIdentifier((value as Record<string, unknown>)[field], field);
  assertOptionalIdentifier(value.latestLeaseRenewalId, "latest leaseRenewalId");
  for (const time of [
    value.originalLeaseExpiresAt,
    value.currentLeaseExpiresAt,
    value.workDeadline,
  ])
    assertTimestamp(time, "lease timestamp");
  for (const time of [
    value.originalLeaseExpiresAtLogical,
    value.currentLeaseExpiresAtLogical,
    value.workDeadlineAt,
  ])
    assertMeshLogicalTime(time);
  if (
    value.executionScopeKey !== executionScopeKey(value) ||
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1 ||
    !Number.isSafeInteger(value.workItemRevision) ||
    value.workItemRevision < 1 ||
    !Number.isSafeInteger(value.ownerEpoch) ||
    value.ownerEpoch < 1 ||
    !Number.isSafeInteger(value.assignmentEpoch) ||
    value.assignmentEpoch < 1 ||
    !Number.isSafeInteger(value.leaseRenewalSequence) ||
    value.leaseRenewalSequence < 0 ||
    value.leaseRenewalSequence > limits.maximumLeaseRenewals ||
    value.currentLeaseExpiresAtLogical < value.originalLeaseExpiresAtLogical ||
    value.currentLeaseExpiresAtLogical > value.workDeadlineAt ||
    !["active", "expired", "terminal"].includes(value.status) ||
    (value.leaseRenewalSequence === 0) !==
      (value.latestLeaseRenewalId === undefined) ||
    (value.expiryTimerId === undefined) !==
      (value.expiryTimerGeneration === undefined) ||
    (value.expiryTimerGeneration !== undefined &&
      (!Number.isSafeInteger(value.expiryTimerGeneration) ||
        value.expiryTimerGeneration < 1))
  )
    throw new TypeError("Mesh lease head is invalid");
  const frozen = Object.freeze({ ...value });
  assertByteBound(frozen, limits.maximumProjectionBytes, "lease head");
  return frozen;
}

function freezeAssignmentFenceHead(
  value: MeshAssignmentFenceHeadProjection,
  limits: MeshAllocationLimits,
): MeshAssignmentFenceHeadProjection {
  assertPlainRecord(value, "assignment fence head");
  assertExactKeys(
    value,
    [
      "activeAwardId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assignmentFenceKey",
      "assigneePeerId",
      "fencingToken",
      "objectiveId",
      "objectiveRevision",
      "ownerEpoch",
      "ownerPeerId",
      "phase",
      "recoveryCertificateId",
      "workItemId",
      "workItemRevision",
    ],
    [
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assignmentFenceKey",
      "assigneePeerId",
      "fencingToken",
      "objectiveId",
      "objectiveRevision",
      "ownerEpoch",
      "ownerPeerId",
      "phase",
      "workItemId",
      "workItemRevision",
    ],
  );
  for (const [name, identifier] of Object.entries({
    assignmentAuthorityId: value.assignmentAuthorityId,
    assigneePeerId: value.assigneePeerId,
    fencingToken: value.fencingToken,
    objectiveId: value.objectiveId,
    ownerPeerId: value.ownerPeerId,
    workItemId: value.workItemId,
  }))
    assertIdentifier(identifier, name);
  assertOptionalIdentifier(value.activeAwardId, "active awardId");
  assertOptionalIdentifier(
    value.recoveryCertificateId,
    "recovery certificateId",
  );
  if (
    value.assignmentFenceKey !== meshAssignmentFenceKey(value) ||
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1 ||
    !Number.isSafeInteger(value.workItemRevision) ||
    value.workItemRevision < 1 ||
    !Number.isSafeInteger(value.ownerEpoch) ||
    value.ownerEpoch < 1 ||
    !Number.isSafeInteger(value.assignmentEpoch) ||
    value.assignmentEpoch < 1 ||
    !["active", "expired", "recovering", "award_pending", "terminal"].includes(
      value.phase,
    ) ||
    (value.phase === "recovering" &&
      (value.recoveryCertificateId === undefined ||
        value.activeAwardId !== undefined)) ||
    (value.phase === "award_pending" &&
      (value.recoveryCertificateId === undefined ||
        value.activeAwardId === undefined)) ||
    (["active", "expired", "terminal"].includes(value.phase) &&
      value.activeAwardId === undefined) ||
    (value.recoveryCertificateId !== undefined &&
      (value.assignmentAuthorityId !== value.recoveryCertificateId ||
        value.fencingToken !== value.recoveryCertificateId))
  )
    throw new TypeError("Mesh assignment fence head is invalid");
  const frozen = Object.freeze({ ...value });
  assertByteBound(
    frozen,
    limits.maximumProjectionBytes,
    "assignment fence head",
  );
  return frozen;
}

function freezeWitnessAssignment(
  value: MeshWitnessAssignmentProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshWitnessAssignmentProjection {
  assertPlainRecord(value, "witness assignment");
  assertExactKeys(
    value,
    [
      "acceptanceEnvelope",
      "acceptanceValidityVerifiedAt",
      "assignmentFenceKey",
      "awardEnvelope",
      "awardValidityVerifiedAt",
      "latestCheckpoint",
      "leaseHead",
      "leaseRenewals",
      "observedAt",
      "supportedCriticalExtensions",
    ],
    [
      "assignmentFenceKey",
      "awardEnvelope",
      "awardValidityVerifiedAt",
      "leaseRenewals",
      "observedAt",
    ],
  );
  assertMeshLogicalTime(value.observedAt);
  if (value.observedAt > last)
    throw new TypeError("Mesh witness assignment time is invalid");
  assertTimestamp(
    value.awardValidityVerifiedAt,
    "witness award validityVerifiedAt",
  );
  if (value.acceptanceValidityVerifiedAt !== undefined)
    assertTimestamp(
      value.acceptanceValidityVerifiedAt,
      "witness acceptance validityVerifiedAt",
    );
  assertCriticalExtensions(
    value.supportedCriticalExtensions,
    "witness assignment",
  );
  const award = validateSignedMeshEnvelope(value.awardEnvelope);
  if (!award.ok || award.value.payload.type !== "work.award")
    throw new TypeError("Mesh witness assignment envelopes are invalid");
  const awardEnvelope = award.value as SignedMeshEnvelope<WorkAwardPayload>;
  assertCanonicalPayloadDigest(awardEnvelope);
  const awardPayload = awardEnvelope.payload;
  if (
    value.assignmentFenceKey !== meshAssignmentFenceKey(awardPayload) ||
    awardEnvelope.objectiveId !== awardPayload.objectiveId ||
    !Array.isArray(value.leaseRenewals)
  )
    throw new TypeError("Mesh witness assignment authority is invalid");
  const hasAcceptance = value.acceptanceEnvelope !== undefined;
  if (
    hasAcceptance !== (value.acceptanceValidityVerifiedAt !== undefined) ||
    hasAcceptance !== (value.leaseHead !== undefined) ||
    (!hasAcceptance &&
      (value.leaseRenewals.length !== 0 ||
        value.latestCheckpoint !== undefined))
  )
    throw new TypeError("Mesh witness assignment authority is incomplete");
  const acceptance =
    value.acceptanceEnvelope === undefined
      ? undefined
      : validateSignedMeshEnvelope(value.acceptanceEnvelope);
  if (
    acceptance !== undefined &&
    (!acceptance.ok || acceptance.value.payload.type !== "work.accept")
  )
    throw new TypeError("Mesh witness acceptance envelope is invalid");
  const acceptanceEnvelope =
    acceptance?.ok === true
      ? (acceptance.value as SignedMeshEnvelope<WorkAcceptPayload>)
      : undefined;
  if (acceptanceEnvelope !== undefined)
    assertCanonicalPayloadDigest(acceptanceEnvelope);
  const leaseHead =
    value.leaseHead === undefined
      ? undefined
      : freezeLeaseHead(value.leaseHead, last, limits);
  if (
    acceptanceEnvelope !== undefined &&
    leaseHead !== undefined &&
    (acceptanceEnvelope.causationId !== awardEnvelope.messageId ||
      acceptanceEnvelope.objectiveId !==
        acceptanceEnvelope.payload.objectiveId ||
      !assignmentResponseMatchesAward(
        acceptanceEnvelope.payload,
        awardPayload,
      ) ||
      leaseHead.awardId !== awardPayload.awardId ||
      leaseHead.acceptanceId !== acceptanceEnvelope.payload.acceptanceId ||
      leaseHead.acceptanceMessageId !== acceptanceEnvelope.messageId ||
      !leaseHeadMatchesAward(leaseHead, awardPayload))
  )
    throw new TypeError("Mesh witness assignment authority is invalid");
  const leaseRenewals = value.leaseRenewals.map((renewal) =>
    freezeLeaseRenewal(renewal, last, limits),
  );
  if (
    leaseHead !== undefined &&
    (leaseRenewals.length !== leaseHead.leaseRenewalSequence ||
      leaseRenewals.some(
        (renewal, index) =>
          renewal.direction !== "received" ||
          renewal.executionScopeKey !== leaseHead.executionScopeKey ||
          renewal.leaseRenewalSequence !== index + 1 ||
          renewal.previousLeaseRenewalId !==
            (index === 0
              ? undefined
              : leaseRenewals[index - 1]!.leaseRenewalId),
      ) ||
      (leaseRenewals.length === 0
        ? leaseHead.latestLeaseRenewalId !== undefined
        : leaseHead.latestLeaseRenewalId !==
          leaseRenewals.at(-1)!.leaseRenewalId))
  )
    throw new TypeError("Mesh witness lease renewal chain is invalid");
  const latestCheckpoint =
    value.latestCheckpoint === undefined
      ? undefined
      : freezeExecutionRecord(value.latestCheckpoint, last, limits);
  if (
    latestCheckpoint !== undefined &&
    (latestCheckpoint.envelope.payload.type !== "work.checkpoint" ||
      leaseHead === undefined ||
      !executionAuthorityMatchesLeaseHead(
        latestCheckpoint.envelope.payload,
        leaseHead,
      ))
  )
    throw new TypeError("Mesh witness assignment checkpoint is invalid");
  const frozen = Object.freeze({
    assignmentFenceKey: value.assignmentFenceKey,
    observedAt: value.observedAt,
    awardValidityVerifiedAt: value.awardValidityVerifiedAt,
    ...(value.acceptanceValidityVerifiedAt === undefined
      ? {}
      : {
          acceptanceValidityVerifiedAt: value.acceptanceValidityVerifiedAt,
        }),
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...value.supportedCriticalExtensions,
          ]),
        }),
    awardEnvelope: deepFreezeCopy(awardEnvelope),
    ...(acceptanceEnvelope === undefined
      ? {}
      : { acceptanceEnvelope: deepFreezeCopy(acceptanceEnvelope) }),
    ...(leaseHead === undefined ? {} : { leaseHead }),
    leaseRenewals: Object.freeze(leaseRenewals),
    ...(latestCheckpoint === undefined ? {} : { latestCheckpoint }),
  }) as MeshWitnessAssignmentProjection;
  assertByteBound(frozen, limits.maximumProjectionBytes, "witness assignment");
  return frozen;
}

function freezeTakeoverProposal(
  value: MeshTakeoverProposalProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshTakeoverProposalProjection {
  assertPlainRecord(value, "takeover proposal");
  assertRecoveryEvidenceFields(value, last, "takeover proposal", [
    "takeoverProposalId",
  ]);
  assertIdentifier(value.takeoverProposalId, "takeoverProposalId");
  const parsed = validateSignedMeshEnvelope(value.envelope);
  if (!parsed.ok || parsed.value.payload.type !== "lease.takeover_proposal")
    throw new TypeError("Mesh signed takeover proposal is invalid");
  const envelope =
    parsed.value as SignedMeshEnvelope<LeaseTakeoverProposalPayload>;
  assertCanonicalPayloadDigest(envelope);
  if (
    envelope.payload.takeoverProposalId !== value.takeoverProposalId ||
    envelope.objectiveId !== envelope.payload.objectiveId
  )
    throw new TypeError("Mesh takeover proposal projection is invalid");
  return freezeRecoveryEvidence(value, envelope, limits, "takeover proposal");
}

function freezeLeaseVote(
  value: MeshLeaseVoteProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshLeaseVoteProjection {
  assertPlainRecord(value, "lease vote");
  assertRecoveryEvidenceFields(value, last, "lease vote", [
    "leaseVoteId",
    "takeoverProposalId",
    "witnessPeerId",
  ]);
  for (const [name, identifier] of Object.entries({
    leaseVoteId: value.leaseVoteId,
    takeoverProposalId: value.takeoverProposalId,
    witnessPeerId: value.witnessPeerId,
  }))
    assertIdentifier(identifier, name);
  const parsed = validateSignedMeshEnvelope(value.envelope);
  if (!parsed.ok || parsed.value.payload.type !== "lease.vote")
    throw new TypeError("Mesh signed lease vote is invalid");
  const envelope = parsed.value as SignedMeshEnvelope<LeaseVotePayload>;
  assertCanonicalPayloadDigest(envelope);
  if (
    envelope.payload.leaseVoteId !== value.leaseVoteId ||
    envelope.payload.takeoverProposalId !== value.takeoverProposalId ||
    envelope.payload.witnessPeerId !== value.witnessPeerId ||
    envelope.objectiveId !== envelope.payload.objectiveId
  )
    throw new TypeError("Mesh lease vote projection is invalid");
  return freezeRecoveryEvidence(value, envelope, limits, "lease vote");
}

function freezeRecoveryCertificate(
  value: MeshRecoveryCertificateProjection,
  last: number,
  limits: MeshAllocationLimits,
): MeshRecoveryCertificateProjection {
  assertPlainRecord(value, "recovery certificate");
  assertRecoveryEvidenceFields(value, last, "recovery certificate", [
    "certificateId",
    "takeoverProposalId",
  ]);
  assertIdentifier(value.certificateId, "certificateId");
  assertIdentifier(value.takeoverProposalId, "takeoverProposalId");
  const parsed = validateSignedMeshEnvelope(value.envelope);
  if (!parsed.ok || parsed.value.payload.type !== "lease.certificate")
    throw new TypeError("Mesh signed recovery certificate is invalid");
  const envelope = parsed.value as SignedMeshEnvelope<LeaseCertificatePayload>;
  assertCanonicalPayloadDigest(envelope);
  if (
    envelope.payload.certificateId !== value.certificateId ||
    envelope.payload.takeoverProposalId !== value.takeoverProposalId ||
    envelope.objectiveId !== envelope.payload.objectiveId
  )
    throw new TypeError("Mesh recovery certificate projection is invalid");
  return freezeRecoveryEvidence(
    value,
    envelope,
    limits,
    "recovery certificate",
  );
}

function assertRecoveryEvidenceFields(
  value:
    | MeshTakeoverProposalProjection
    | MeshLeaseVoteProjection
    | MeshRecoveryCertificateProjection,
  last: number,
  name: string,
  domainKeys: readonly string[],
): void {
  assertExactKeys(
    value,
    [
      "acceptedAt",
      "direction",
      "envelope",
      ...domainKeys,
      "recipientEnvelopes",
      "supportedCriticalExtensions",
      "validityVerifiedAt",
    ],
    [
      "acceptedAt",
      "direction",
      "envelope",
      ...domainKeys,
      "validityVerifiedAt",
    ],
  );
  assertMeshLogicalTime(value.acceptedAt);
  assertTimestamp(value.validityVerifiedAt, `${name} validityVerifiedAt`);
  assertCriticalExtensions(value.supportedCriticalExtensions, name);
  if (
    value.acceptedAt > last ||
    !["local", "received"].includes(value.direction) ||
    (value.direction === "local") !== (value.recipientEnvelopes !== undefined)
  )
    throw new TypeError(`Mesh ${name} evidence is invalid`);
}

function freezeRecoveryEvidence<
  T extends
    | MeshTakeoverProposalProjection
    | MeshLeaseVoteProjection
    | MeshRecoveryCertificateProjection,
>(
  value: T,
  envelope: T["envelope"],
  limits: MeshAllocationLimits,
  name: string,
): T {
  const recipientEnvelopes =
    value.recipientEnvelopes === undefined
      ? undefined
      : freezeRecoveryRecipientEnvelopes(
          value.recipientEnvelopes as Readonly<
            Record<
              string,
              SignedMeshEnvelope<
                | LeaseTakeoverProposalPayload
                | LeaseVotePayload
                | LeaseCertificatePayload
              >
            >
          >,
          envelope as SignedMeshEnvelope<
            | LeaseTakeoverProposalPayload
            | LeaseVotePayload
            | LeaseCertificatePayload
          >,
          name,
        );
  const frozen = Object.freeze({
    ...value,
    ...(value.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...value.supportedCriticalExtensions,
          ]),
        }),
    envelope: deepFreezeCopy(envelope),
    ...(recipientEnvelopes === undefined ? {} : { recipientEnvelopes }),
  }) as T;
  assertByteBound(frozen, limits.maximumProjectionBytes, name);
  return frozen;
}

function freezeRecoveryRecipientEnvelopes(
  value: Readonly<
    Record<
      string,
      SignedMeshEnvelope<
        | LeaseTakeoverProposalPayload
        | LeaseVotePayload
        | LeaseCertificatePayload
      >
    >
  >,
  primary: SignedMeshEnvelope<
    LeaseTakeoverProposalPayload | LeaseVotePayload | LeaseCertificatePayload
  >,
  name: string,
): Readonly<
  Record<
    string,
    SignedMeshEnvelope<
      LeaseTakeoverProposalPayload | LeaseVotePayload | LeaseCertificatePayload
    >
  >
> {
  assertPlainRecord(value, `${name} recipient envelopes`);
  const entries = Object.entries(value);
  if (entries.length === 0)
    throw new TypeError(`Mesh ${name} recipient envelopes are empty`);
  let primaryFound = false;
  const frozenEntries = entries.map(([peerId, candidate]) => {
    assertIdentifier(peerId, `${name} recipient peerId`);
    const parsed = validateSignedMeshEnvelope(candidate);
    if (
      !parsed.ok ||
      parsed.value.payload.type !== primary.payload.type ||
      parsed.value.audience.kind !== "peer" ||
      parsed.value.audience.peerId !== peerId ||
      parsed.value.sender.peerId !== primary.sender.peerId ||
      parsed.value.sender.instanceId !== primary.sender.instanceId ||
      parsed.value.proof.keyId !== primary.proof.keyId ||
      parsed.value.payloadHash !== primary.payloadHash ||
      !deepEqual(parsed.value.payload, primary.payload) ||
      parsed.value.sentAt !== primary.sentAt ||
      parsed.value.expiresAt !== primary.expiresAt ||
      parsed.value.causationId !== primary.causationId ||
      parsed.value.correlationId !== primary.correlationId ||
      !deepEqual(parsed.value.criticalExtensions, primary.criticalExtensions)
    )
      throw new TypeError(`Mesh ${name} recipient envelope is invalid`);
    assertCanonicalPayloadDigest(
      parsed.value as SignedMeshEnvelope<
        | LeaseTakeoverProposalPayload
        | LeaseVotePayload
        | LeaseCertificatePayload
      >,
    );
    if (parsed.value.messageId === primary.messageId) primaryFound = true;
    return [
      peerId,
      deepFreezeCopy(parsed.value) as SignedMeshEnvelope<
        | LeaseTakeoverProposalPayload
        | LeaseVotePayload
        | LeaseCertificatePayload
      >,
    ] as const;
  });
  if (!primaryFound)
    throw new TypeError(`Mesh ${name} primary recipient is missing`);
  return createFrozenRecord(frozenEntries);
}

function assignmentResponseMatchesAward(
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

function awardAuthorityIsCanonical(award: WorkAwardPayload): boolean {
  return award.authorityKind === "award"
    ? award.assignmentEpoch === 1 &&
        award.assignmentAuthorityId === award.awardId &&
        award.fencingToken === award.awardId
    : award.assignmentEpoch > 1 &&
        award.assignmentAuthorityId === award.recoveryCertificateId &&
        award.fencingToken === award.recoveryCertificateId;
}

function leaseHeadMatchesAward(
  head: MeshLeaseHeadProjection,
  award: WorkAwardPayload,
): boolean {
  return (
    head.executionScopeKey === executionScopeKey(award) &&
    head.objectiveId === award.objectiveId &&
    head.objectiveDocumentId === award.objectiveDocumentId &&
    head.objectiveRevision === award.objectiveRevision &&
    head.workItemId === award.workItemId &&
    head.workItemRevision === award.workItemRevision &&
    head.ownerPeerId === award.ownerPeerId &&
    head.ownerEpoch === award.ownerEpoch &&
    head.assigneePeerId === award.assigneePeerId &&
    head.awardId === award.awardId &&
    head.assignmentEpoch === award.assignmentEpoch &&
    head.assignmentAuthorityId === award.assignmentAuthorityId &&
    head.fencingToken === award.fencingToken &&
    head.originalLeaseExpiresAt === award.leaseExpiresAt &&
    head.workDeadline === award.workDeadline
  );
}

function executionAuthorityMatchesLeaseHead(
  payload: WorkCheckpointPayload,
  head: MeshLeaseHeadProjection,
): boolean {
  return (
    executionScopeKey(payload) === head.executionScopeKey &&
    payload.objectiveDocumentId === head.objectiveDocumentId &&
    payload.assigneePeerId === head.assigneePeerId &&
    payload.assignmentAuthorityId === head.assignmentAuthorityId &&
    payload.fencingToken === head.fencingToken &&
    payload.acceptanceId === head.acceptanceId
  );
}

function isExecutionPayload(payload: unknown): payload is MeshExecutionPayload {
  return (
    !!payload &&
    typeof payload === "object" &&
    [
      "work.progress",
      "work.checkpoint",
      "work.result",
      "work.release",
      "work.cancel",
    ].includes((payload as { type?: unknown }).type as string)
  );
}

function executionRecordType(
  payload: MeshExecutionPayload,
): MeshExecutionRecordProjection["recordType"] {
  switch (payload.type) {
    case "work.progress":
      return "progress";
    case "work.checkpoint":
      return "checkpoint";
    case "work.result":
      return "result";
    case "work.release":
      return "release";
    case "work.cancel":
      return "cancel";
  }
}

function executionRecordId(payload: MeshExecutionPayload): string {
  switch (payload.type) {
    case "work.progress":
      return payload.progressId;
    case "work.checkpoint":
      return payload.checkpointId;
    case "work.result":
      return payload.resultId;
    case "work.release":
      return payload.releaseId;
    case "work.cancel":
      return payload.cancellationId;
  }
}

function executionScopeKey(
  authority: Pick<
    MeshExecutionHeadProjection,
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

/** Canonical assignment scope used for epoch fencing across awards. */
export function meshAssignmentFenceKey(
  authority: Pick<
    MeshAssignmentFenceHeadProjection,
    | "objectiveId"
    | "objectiveRevision"
    | "workItemId"
    | "workItemRevision"
    | "ownerPeerId"
    | "ownerEpoch"
  >,
): string {
  return JSON.stringify([
    authority.objectiveId,
    authority.objectiveRevision,
    authority.workItemId,
    authority.workItemRevision,
    authority.ownerPeerId,
    authority.ownerEpoch,
  ]);
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
    | WorkProgressPayload
    | WorkCheckpointPayload
    | WorkResultPayload
    | WorkReleasePayload
    | WorkCancelPayload
    | LeaseRenewPayload
    | LeaseTakeoverProposalPayload
    | LeaseVotePayload
    | LeaseCertificatePayload
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

function bidPayloadMatchesReceivedOffer(
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

function receivedOfferScopeKey(offer: WorkOfferPayload): string {
  return JSON.stringify([
    offer.objectiveId,
    offer.objectiveRevision,
    offer.workItemId,
    offer.workItemRevision,
    offer.ownerPeerId,
    offer.ownerEpoch,
  ]);
}

function receivedOfferWorkTermsEqual(
  left: WorkOfferPayload,
  right: WorkOfferPayload,
): boolean {
  return (
    left.objectiveDocumentId === right.objectiveDocumentId &&
    receivedOfferScopeKey(left) === receivedOfferScopeKey(right) &&
    deepEqual(left.requiredCapabilityKeys, right.requiredCapabilityKeys) &&
    deepEqual(left.matchingAttributes, right.matchingAttributes) &&
    deepEqual(left.completionCriteria, right.completionCriteria) &&
    left.inputSummary === right.inputSummary &&
    left.inputReference === right.inputReference &&
    left.budgetReservationUnits === right.budgetReservationUnits &&
    left.workDeadline === right.workDeadline
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
    sameWorkDocument(binding.work, work)
  );
}

function sameWorkDocument(
  left: MeshWorkItemProjection,
  right: MeshWorkItemProjection,
): boolean {
  return (
    left.objectiveId === right.objectiveId &&
    left.objectiveDocumentId === right.objectiveDocumentId &&
    left.objectiveRevision === right.objectiveRevision &&
    deepEqual(left.objectivePolicy, right.objectivePolicy) &&
    left.workItemId === right.workItemId &&
    left.workItemRevision === right.workItemRevision &&
    left.ownerPeerId === right.ownerPeerId &&
    left.ownerEpoch === right.ownerEpoch &&
    deepEqual(left.requiredCapabilityKeys, right.requiredCapabilityKeys) &&
    deepEqual(left.matchingAttributes, right.matchingAttributes) &&
    deepEqual(left.completionCriteria, right.completionCriteria) &&
    left.inputSummary === right.inputSummary &&
    left.inputReference === right.inputReference &&
    left.budgetReservationUnits === right.budgetReservationUnits &&
    left.workDeadline === right.workDeadline &&
    left.workDeadlineAt === right.workDeadlineAt &&
    left.offerAttempt === right.offerAttempt &&
    left.createdAt === right.createdAt
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
function assertCriticalExtensions(
  value: readonly string[] | undefined,
  name: string,
): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) ||
      value.some(
        (extension) => typeof extension !== "string" || extension.length === 0,
      ) ||
      new Set(value).size !== value.length)
  )
    throw new TypeError(`Mesh ${name} critical extensions are invalid`);
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
