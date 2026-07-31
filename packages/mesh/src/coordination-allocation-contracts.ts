import type {
  SignedMeshEnvelope,
  VerifiedMeshEnvelope,
  WorkBidPayload,
  WorkAcceptPayload,
  WorkAwardPayload,
  WorkDeclinePayload,
  WorkOfferPayload,
  WorkProgressPayload,
  WorkCheckpointPayload,
  WorkResultPayload,
  WorkReleasePayload,
  WorkCancelPayload,
} from "@agentplat/mesh-protocol";

import type { MeshLogicalTime, MeshPeerIdentity } from "./contracts.js";
import type {
  MeshCoordinationState,
  MeshCoordinationTimer,
  MeshCoordinationTimerFiredInput,
} from "./coordination-contracts.js";
import type { MeshDiscoveryState } from "./coordination-discovery-contracts.js";
import type {
  MeshObjectiveWorkState,
  MeshWorkItemProjection,
  MeshWorkObjectivePolicySnapshot,
} from "./coordination-objective-work-contracts.js";

/** The externally visible allocation status for one local Work Item. */
export type MeshWorkAllocationPhase =
  | "ready"
  | "offered"
  | "award_pending"
  | "active"
  | "completed"
  | "released"
  | "cancelled";

/** Exact normalized Objective, policy, and Work revision used for allocation. */
export interface MeshAllocationWorkBinding {
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly objectivePolicy: MeshWorkObjectivePolicySnapshot;
  readonly work: MeshWorkItemProjection;
}

/** Operational allocation head for one local Work Item revision. */
export interface MeshWorkAllocationProjection extends MeshAllocationWorkBinding {
  readonly workKey: string;
  readonly phase: MeshWorkAllocationPhase;
  readonly activeOfferId?: string;
  readonly bidDeadlineAt?: MeshLogicalTime;
  readonly reservationId?: string;
  readonly activeAwardId?: string;
  readonly activeAcceptanceId?: string;
  readonly updatedAt: MeshLogicalTime;
}

/** One recipient-specific signed offer prepared by the local owner. */
export interface MeshPreparedOfferEnvelope {
  readonly recipientPeerId: string;
  /** Exact signed message ID used as the bid causationId. */
  readonly messageId: string;
  readonly preparedAt: MeshLogicalTime;
  readonly envelope: SignedMeshEnvelope<WorkOfferPayload>;
}

/** One retained local offer attempt and its recipient-specific causal evidence. */
export interface MeshLocalOfferProjection extends MeshAllocationWorkBinding {
  readonly offerId: string;
  readonly offerAttempt: number;
  readonly previousOfferId?: string;
  readonly bidDeadline: string;
  readonly bidDeadlineAt: MeshLogicalTime;
  readonly bidDeadlineTimerId: string;
  readonly bidDeadlineTimerGeneration: number;
  readonly createdAt: MeshLogicalTime;
  readonly validityVerifiedAt: string;
  readonly reservationId: string;
  readonly recipientOffers: Readonly<Record<string, MeshPreparedOfferEnvelope>>;
}

/** Accepted, signed bid evidence retained for audit and causal validation. */
export interface MeshAcceptedBidEvidence {
  readonly bidId: string;
  readonly offerId: string;
  readonly bidderPeerId: string;
  readonly bidRevision: number;
  readonly previousBidId?: string;
  readonly acceptedAt: MeshLogicalTime;
  readonly validityVerifiedAt: string;
  readonly supportedCriticalExtensions?: readonly string[];
  readonly envelope: SignedMeshEnvelope<WorkBidPayload>;
}

/** One assignee-specific signed award prepared by the local owner. */
export interface MeshPreparedAwardEnvelope {
  readonly recipientPeerId: string;
  readonly messageId: string;
  readonly preparedAt: MeshLogicalTime;
  readonly envelope: SignedMeshEnvelope<WorkAwardPayload>;
}

/** A locally issued award and its causation-capable assignee evidence. */
export interface MeshLocalAwardProjection extends MeshAllocationWorkBinding {
  readonly awardId: string;
  readonly offerId: string;
  readonly bidId: string;
  readonly bidRevision: number;
  readonly offerAttempt: number;
  readonly assigneePeerId: string;
  readonly assignmentEpoch: 1;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly budgetReservationUnits: number;
  readonly workDeadline: string;
  readonly leaseStartsAt: string;
  readonly leaseExpiresAt: string;
  readonly leaseExpiresAtLogical: MeshLogicalTime;
  readonly acceptanceDeadline: string;
  readonly acceptanceDeadlineAt: MeshLogicalTime;
  readonly acceptanceDeadlineTimerId: string;
  readonly acceptanceDeadlineTimerGeneration: number;
  readonly createdAt: MeshLogicalTime;
  readonly validityVerifiedAt: string;
  readonly reservationId: string;
  readonly status:
    "awaiting_acceptance" | "accepted" | "declined" | "timed_out" | "cancelled";
  readonly recipientAward: MeshPreparedAwardEnvelope;
}

/** One accepted assignee response retained with its exact signed evidence. */
export interface MeshAcceptedAssignmentResponseEvidence {
  readonly awardId: string;
  readonly responseId: string;
  readonly kind: "work.accept" | "work.decline";
  readonly acceptedAt: MeshLogicalTime;
  readonly validityVerifiedAt: string;
  readonly supportedCriticalExtensions?: readonly string[];
  readonly envelope: SignedMeshEnvelope<WorkAcceptPayload | WorkDeclinePayload>;
}

/** One verified direct offer received by the local potential assignee. */
export interface MeshReceivedOfferProjection {
  readonly offerId: string;
  readonly receivedAt: MeshLogicalTime;
  readonly validityVerifiedAt: string;
  readonly supportedCriticalExtensions?: readonly string[];
  readonly bidDeadlineAt: MeshLogicalTime;
  readonly workDeadlineAt: MeshLogicalTime;
  readonly envelope: SignedMeshEnvelope<WorkOfferPayload>;
}

/** A locally prepared bid; its signed message is the only valid award cause. */
export interface MeshLocalBidProjection {
  readonly bidId: string;
  readonly offerId: string;
  readonly bidRevision: number;
  readonly previousBidId?: string;
  readonly preparedAt: MeshLogicalTime;
  readonly validityVerifiedAt: string;
  readonly bidExpiresAt: string;
  readonly bidExpiresAtLogical: MeshLogicalTime;
  readonly envelope: SignedMeshEnvelope<WorkBidPayload>;
}

/** One verified award received by the local assignee. */
export interface MeshReceivedAwardProjection {
  readonly awardId: string;
  readonly offerId: string;
  readonly bidId: string;
  readonly bidRevision: number;
  readonly receivedAt: MeshLogicalTime;
  readonly validityVerifiedAt: string;
  readonly supportedCriticalExtensions?: readonly string[];
  readonly acceptanceDeadlineAt: MeshLogicalTime;
  readonly acceptanceDeadlineTimerId: string;
  readonly acceptanceDeadlineTimerGeneration: number;
  readonly leaseExpiresAtLogical: MeshLogicalTime;
  readonly status:
    "awaiting_response" | "accepted" | "declined" | "timed_out" | "cancelled";
  readonly envelope: SignedMeshEnvelope<WorkAwardPayload>;
}

/** Exact local accept or decline evidence emitted in response to one award. */
export interface MeshLocalAssignmentResponseEvidence {
  readonly awardId: string;
  readonly responseId: string;
  readonly kind: "work.accept" | "work.decline";
  readonly preparedAt: MeshLogicalTime;
  readonly validityVerifiedAt: string;
  readonly envelope: SignedMeshEnvelope<WorkAcceptPayload | WorkDeclinePayload>;
}

/** Authority available locally only after an accepted assignment response. */
export interface MeshAssigneeAssignmentAuthorityProjection {
  readonly awardId: string;
  readonly acceptanceId: string;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly ownerEpoch: number;
  readonly assigneePeerId: string;
  readonly assignmentEpoch: 1;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly workDeadline: string;
  readonly workDeadlineAt: MeshLogicalTime;
  readonly leaseExpiresAt: string;
  readonly leaseExpiresAtLogical: MeshLogicalTime;
  readonly activatedAt: MeshLogicalTime;
}

/** Execution record families retained under a single assignment authority. */
export type MeshExecutionRecordType =
  "progress" | "checkpoint" | "result" | "release" | "cancel";

export type MeshExecutionPayload =
  | WorkProgressPayload
  | WorkCheckpointPayload
  | WorkResultPayload
  | WorkReleasePayload
  | WorkCancelPayload;

/** Immutable signed execution evidence, keyed by its payload-specific record ID. */
export interface MeshExecutionRecordProjection {
  readonly recordType: MeshExecutionRecordType;
  readonly recordId: string;
  readonly direction: "local" | "received";
  readonly recordedAt: MeshLogicalTime;
  readonly validityVerifiedAt: string;
  readonly supportedCriticalExtensions?: readonly string[];
  readonly envelope: SignedMeshEnvelope<MeshExecutionPayload>;
}

/** Full accepted authority and current lifecycle heads for one assignment scope. */
export interface MeshExecutionHeadProjection {
  readonly executionScopeKey: string;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly ownerEpoch: number;
  readonly assigneePeerId: string;
  readonly awardId: string;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly acceptanceId: string;
  /** Signed message ID of the acceptance that activated this authority. */
  readonly acceptanceMessageId: string;
  readonly workDeadline: string;
  readonly workDeadlineAt: MeshLogicalTime;
  readonly leaseExpiresAt: string;
  readonly leaseExpiresAtLogical: MeshLogicalTime;
  readonly phase: "active" | "completed" | "released" | "cancelled";
  readonly latestProgressId?: string;
  readonly latestProgressSequence?: number;
  readonly latestCheckpointId?: string;
  readonly latestCheckpointSequence?: number;
  readonly resultId?: string;
  readonly terminalRecordId?: string;
  readonly terminalAt?: MeshLogicalTime;
}

/** Current bid revision for exactly one [offerId, bidderPeerId] pair. */
export interface MeshBidHeadProjection {
  readonly bidKey: string;
  readonly offerId: string;
  readonly bidderPeerId: string;
  readonly bidId: string;
  readonly bidRevision: number;
  readonly previousBidId?: string;
  readonly acceptedMessageId: string;
  readonly acceptedAt: MeshLogicalTime;
  readonly capacityReservationUnits: number;
  readonly budgetUnits: number;
  readonly expectedCompletionAt: string;
  readonly bidExpiresAt: string;
  readonly bidExpiresAtLogical: MeshLogicalTime;
}

/** Reservation opened by an offer and later committed or released exactly once. */
export interface MeshAllocationReservation {
  readonly reservationId: string;
  readonly workKey: string;
  readonly offerId: string;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly budgetReservationUnits: number;
  readonly reservedAt: MeshLogicalTime;
  readonly status: "reserved" | "committed" | "released";
  readonly committedAt?: MeshLogicalTime;
  readonly releasedAt?: MeshLogicalTime;
}

/** Hard, non-evicting allocation projection ceilings. */
export interface MeshAllocationLimits {
  readonly maximumOffers: number;
  readonly maximumOffersPerWorkItem: number;
  readonly maximumBidHeads: number;
  readonly maximumBidsPerOffer: number;
  readonly maximumRecipientsPerOffer: number;
  readonly maximumProjectionBytes: number;
  readonly maximumAwards: number;
  readonly maximumAssignmentResponses: number;
  readonly maximumReceivedOffers: number;
  readonly maximumLocalBids: number;
  readonly maximumReceivedAwards: number;
  readonly maximumLocalAssignmentResponses: number;
  readonly maximumAssignmentAuthorities: number;
  readonly maximumExecutionRecords: number;
  readonly maximumExecutionHeads: number;
  readonly maximumExecutionRecordsPerAssignment: number;
}

/** Independently restorable offer, bid, award and response projection. */
export interface MeshAllocationState {
  readonly schemaVersion: 4;
  readonly identity: MeshPeerIdentity;
  readonly workAllocations: Readonly<
    Record<string, MeshWorkAllocationProjection>
  >;
  readonly localOffers: Readonly<Record<string, MeshLocalOfferProjection>>;
  /** Heads keyed by canonical `[offerId, bidderPeerId]` key. */
  readonly bidHeads: Readonly<Record<string, MeshBidHeadProjection>>;
  /** Accepted evidence keyed by bidId; every entry belongs to a retained head chain. */
  readonly acceptedBidEvidence: Readonly<
    Record<string, MeshAcceptedBidEvidence>
  >;
  readonly localAwards: Readonly<Record<string, MeshLocalAwardProjection>>;
  /** One terminal response keyed by awardId. */
  readonly assignmentResponses: Readonly<
    Record<string, MeshAcceptedAssignmentResponseEvidence>
  >;
  /** Direct offers received by this peer, keyed by offerId. */
  readonly receivedOffers: Readonly<
    Record<string, MeshReceivedOfferProjection>
  >;
  /** Locally prepared direct bids, keyed by bidId. */
  readonly localBids: Readonly<Record<string, MeshLocalBidProjection>>;
  /** Direct awards received by this peer, keyed by awardId. */
  readonly receivedAwards: Readonly<
    Record<string, MeshReceivedAwardProjection>
  >;
  /** One locally emitted terminal response per received award. */
  readonly localAssignmentResponses: Readonly<
    Record<string, MeshLocalAssignmentResponseEvidence>
  >;
  /** Active execution authority keyed by awardId. */
  readonly assigneeAuthorities: Readonly<
    Record<string, MeshAssigneeAssignmentAuthorityProjection>
  >;
  /** Retained signed execution records keyed by their payload record ID. */
  readonly executionRecords: Readonly<
    Record<string, MeshExecutionRecordProjection>
  >;
  /** Active or terminal execution lifecycle head keyed by assignment scope. */
  readonly executionHeads: Readonly<
    Record<string, MeshExecutionHeadProjection>
  >;
  readonly reservations: Readonly<Record<string, MeshAllocationReservation>>;
  readonly limits: MeshAllocationLimits;
  readonly lastLogicalTime: MeshLogicalTime;
}

export interface MeshAllocationStateOptions {
  readonly identity: MeshPeerIdentity;
  readonly limits?: Partial<MeshAllocationLimits>;
}

/** Composition of all projections required to evaluate allocation. */
export interface MeshAllocationRuntimeState {
  readonly coordination: MeshCoordinationState;
  readonly discovery: MeshDiscoveryState;
  readonly objectives: MeshObjectiveWorkState;
  readonly allocation: MeshAllocationState;
}

export type MeshAllocationPayload =
  | WorkOfferPayload
  | WorkBidPayload
  | WorkAwardPayload
  | WorkAcceptPayload
  | WorkDeclinePayload
  | WorkProgressPayload
  | WorkCheckpointPayload
  | WorkResultPayload
  | WorkReleasePayload
  | WorkCancelPayload;

/** A verified remote bid or assignment response with receiver-controlled time. */
export interface MeshVerifiedAllocationRequest {
  readonly envelope: VerifiedMeshEnvelope<MeshAllocationPayload>;
  readonly verifiedAt: string;
  readonly receivedAt: MeshLogicalTime;
  readonly supportedCriticalExtensions?: readonly string[];
}

/** Prepared recipient evidence supplied by a signer for one local offer command. */
export interface MeshLocalOfferPreparedRecipient {
  readonly recipientPeerId: string;
  readonly preparedAt: MeshLogicalTime;
  readonly envelope: SignedMeshEnvelope<WorkOfferPayload>;
}

/** Local offer request. Each recipient needs its own signed envelope and message ID. */
export interface MeshLocalOfferCommand {
  readonly kind: "allocation.offer";
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly expectedWorkItemRevision: number;
  readonly recipients: readonly MeshLocalOfferPreparedRecipient[];
}

/** Local owner command; exactly one signed direct envelope addresses the assignee. */
export interface MeshLocalAwardCommand {
  readonly kind: "allocation.award";
  readonly offerId: string;
  readonly bidId: string;
  readonly bidRevision: number;
  readonly recipient: MeshLocalAwardPreparedRecipient;
}

/** Local assignee command; the bid envelope is already signed and addressed. */
export interface MeshLocalBidCommand {
  readonly kind: "allocation.bid";
  readonly offerId: string;
  readonly preparedAt: MeshLogicalTime;
  readonly envelope: SignedMeshEnvelope<WorkBidPayload>;
}

/** Local assignee command; one already-signed direct accept or decline. */
export interface MeshLocalAssignmentResponseCommand {
  readonly kind: "allocation.assignment_response";
  readonly awardId: string;
  readonly preparedAt: MeshLogicalTime;
  readonly envelope: SignedMeshEnvelope<WorkAcceptPayload | WorkDeclinePayload>;
}

/** Local execution command; the supplied envelope is already signed and addressed. */
export interface MeshLocalExecutionCommand {
  readonly kind: "allocation.execution";
  readonly preparedAt: MeshLogicalTime;
  readonly envelope: SignedMeshEnvelope<MeshExecutionPayload>;
}

export interface MeshLocalAwardPreparedRecipient {
  readonly recipientPeerId: string;
  readonly preparedAt: MeshLogicalTime;
  readonly envelope: SignedMeshEnvelope<WorkAwardPayload>;
}

/** Explicit bidder selection from a retained current bid head. */
export interface MeshAllocationSelectionInput {
  readonly offerId: string;
  readonly evaluatedAt: MeshLogicalTime;
}

export type MeshAllocationCommand =
  | MeshLocalOfferCommand
  | MeshLocalAwardCommand
  | MeshLocalBidCommand
  | MeshLocalAssignmentResponseCommand
  | MeshLocalExecutionCommand;

export type MeshAllocationBidSelectionReason =
  | "offer_missing"
  | "offer_closed"
  | "bid_window_closed"
  | "no_eligible_bids"
  | "selected";

/** Read-only deterministic selection result; award/reservation mutation is deferred. */
export interface MeshAllocationBidSelection {
  readonly offerId: string;
  readonly evaluatedAt: MeshLogicalTime;
  readonly reason: MeshAllocationBidSelectionReason;
  readonly bid?: MeshBidHeadProjection;
}

/** Effect for dispatching one already-signed offer envelope. */
export type MeshAllocationEffect =
  | {
      readonly kind: "allocation.offer.dispatch";
      readonly offerId: string;
      readonly recipientPeerId: string;
      readonly messageId: string;
      readonly envelope: SignedMeshEnvelope<WorkOfferPayload>;
    }
  | {
      readonly kind: "allocation.award.dispatch";
      readonly awardId: string;
      readonly recipientPeerId: string;
      readonly messageId: string;
      readonly envelope: SignedMeshEnvelope<WorkAwardPayload>;
    }
  | {
      readonly kind: "allocation.bid.dispatch";
      readonly bidId: string;
      readonly recipientPeerId: string;
      readonly messageId: string;
      readonly envelope: SignedMeshEnvelope<WorkBidPayload>;
    }
  | {
      readonly kind: "allocation.assignment_response.dispatch";
      readonly awardId: string;
      readonly responseId: string;
      readonly recipientPeerId: string;
      readonly messageId: string;
      readonly envelope: SignedMeshEnvelope<
        WorkAcceptPayload | WorkDeclinePayload
      >;
    }
  | {
      readonly kind: "allocation.execution.dispatch";
      readonly recordId: string;
      readonly recordType: MeshExecutionRecordType;
      readonly recipientPeerId: string;
      readonly messageId: string;
      readonly envelope: SignedMeshEnvelope<MeshExecutionPayload>;
    };

export type MeshAllocationRejectionCode =
  | "invalid_verified_envelope"
  | "scope_mismatch"
  | "audience_mismatch"
  | "topic_not_subscribed"
  | "sender_not_admitted"
  | "sender_instance_not_admitted"
  | "sender_admission_expired"
  | "message_expired"
  | "message_from_future"
  | "unknown_critical_extension"
  | "work_missing"
  | "work_not_ready"
  | "work_revision_conflict"
  | "offer_invalid"
  | "offer_missing"
  | "offer_duplicate_conflict"
  | "offer_capacity_exceeded"
  | "award_missing"
  | "award_invalid"
  | "award_duplicate_conflict"
  | "award_capacity_exceeded"
  | "assignment_capacity_exceeded"
  | "assignment_response_invalid"
  | "assignment_response_deadline_elapsed"
  | "assignment_response_duplicate_conflict"
  | "assignment_response_capacity_exceeded"
  | "received_offer_invalid"
  | "received_offer_duplicate_conflict"
  | "received_offer_capacity_exceeded"
  | "local_bid_invalid"
  | "local_bid_duplicate_conflict"
  | "local_bid_capacity_exceeded"
  | "received_award_invalid"
  | "received_award_duplicate_conflict"
  | "received_award_capacity_exceeded"
  | "local_assignment_response_invalid"
  | "local_assignment_response_deadline_elapsed"
  | "local_assignment_response_duplicate_conflict"
  | "local_assignment_response_capacity_exceeded"
  | "assignment_authority_capacity_exceeded"
  | "execution_invalid"
  | "execution_duplicate_conflict"
  | "execution_capacity_exceeded"
  | "execution_head_capacity_exceeded"
  | "execution_records_per_assignment_exceeded"
  | "execution_authority_invalid"
  | "execution_deadline_elapsed"
  | "execution_phase_invalid"
  | "recipient_capacity_exceeded"
  | "bid_invalid"
  | "bid_duplicate_conflict"
  | "bid_predecessor_invalid"
  | "bid_capacity_exceeded"
  | "bidder_not_recipient"
  | "bid_causation_invalid"
  | "bid_deadline_elapsed"
  | "domain_record_conflict"
  | "domain_capacity_exceeded"
  | "journal_capacity_exceeded"
  | "timer_capacity_exceeded"
  | "timer_id_conflict"
  | "timer_generation_exhausted";

export type MeshAllocationDecision =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly state: MeshAllocationRuntimeState;
      readonly effects: readonly MeshAllocationEffect[];
    }
  | {
      readonly accepted: false;
      readonly code: MeshAllocationRejectionCode;
      readonly state: MeshAllocationRuntimeState;
    };

export type MeshAllocationTimerInput = MeshCoordinationTimerFiredInput;

export type MeshAllocationTimerDecision =
  | {
      readonly accepted: true;
      readonly timer: MeshCoordinationTimer;
      readonly state: MeshAllocationRuntimeState;
    }
  | {
      readonly accepted: false;
      readonly code:
        | "timer_unknown"
        | "timer_generation_stale"
        | "timer_not_due"
        | "journal_capacity_exceeded";
      readonly state: MeshAllocationRuntimeState;
    };
