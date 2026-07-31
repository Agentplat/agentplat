import type {
  SignedMeshEnvelope,
  VerifiedMeshEnvelope,
  WorkBidPayload,
  WorkOfferPayload,
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
export type MeshWorkAllocationPhase = "ready" | "offered";

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

/** Local first-offer head and all of its causation-capable recipient evidence. */
export interface MeshLocalOfferProjection extends MeshAllocationWorkBinding {
  readonly offerId: string;
  readonly offerAttempt: number;
  readonly previousOfferId?: string;
  readonly bidDeadline: string;
  readonly bidDeadlineAt: MeshLogicalTime;
  readonly bidDeadlineTimerId: string;
  readonly bidDeadlineTimerGeneration: number;
  readonly createdAt: MeshLogicalTime;
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

/** Reservation opened with one local offer and released when its bid window closes. */
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
  readonly status: "reserved" | "released";
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
}

/** Independently restorable first-offer / bid allocation projection. */
export interface MeshAllocationState {
  readonly schemaVersion: 1;
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

export type MeshAllocationPayload = WorkOfferPayload | WorkBidPayload;

/** A verified remote offer or bid together with receiver-controlled time. */
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

/** Explicit bidder selection from a retained current bid head. */
export interface MeshAllocationSelectionInput {
  readonly offerId: string;
  readonly evaluatedAt: MeshLogicalTime;
}

export type MeshAllocationCommand = MeshLocalOfferCommand;

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
export interface MeshAllocationEffect {
  readonly kind: "allocation.offer.dispatch";
  readonly offerId: string;
  readonly recipientPeerId: string;
  readonly messageId: string;
  readonly envelope: SignedMeshEnvelope<WorkOfferPayload>;
}

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
