import type {
  ObjectiveAnnouncePayload,
  ObjectiveCancelPayload,
  ObjectiveRevisePayload,
  SignedMeshEnvelope,
  VerifiedMeshEnvelope,
} from "@agentplat/mesh-protocol";

import type { MeshLogicalTime, MeshPeerIdentity } from "./contracts.js";
import type { MeshCoordinationState } from "./coordination-contracts.js";
import type {
  MeshCoordinationTimer,
  MeshCoordinationTimerFiredInput,
} from "./coordination-contracts.js";
import type { MeshDiscoveryState } from "./coordination-discovery-contracts.js";

/** A locally provisioned signer authorized to issue Objective documents. */
export interface MeshObjectiveIssuerAuthority {
  readonly peerId: string;
  readonly keyIds: readonly string[];
  readonly validUntil: string;
}

/** The current immutable head for one Objective identifier. */
export interface MeshObjectiveProjection {
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly issuerPeerId: string;
  readonly issuerKeyId: string;
  readonly summary?: string;
  readonly contentReference?: string;
  readonly successCriteria: readonly string[];
  readonly permittedCapabilityKeys: readonly string[];
  readonly maximumWorkItems: number;
  readonly maximumConcurrentAssignments: number;
  readonly maximumBudgetUnits: number;
  readonly bidWindowMs: number;
  readonly acceptanceWindowMs: number;
  readonly maximumLeaseDurationMs: number;
  readonly recoveryGraceMs: number;
  readonly maximumLeaseRenewals: number;
  readonly recoveryWitnessPeerIds: readonly string[];
  readonly recoveryWitnessThreshold: number;
  readonly authorizedObserverPeerIds?: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly validityVerifiedAt: string;
  readonly acceptedMessageId: string;
  readonly acceptedAt: MeshLogicalTime;
  readonly expiresAt: MeshLogicalTime;
  readonly expiryTimerId?: string;
  readonly expiryTimerGeneration?: number;
  readonly workItemCount: number;
  readonly reservedBudgetUnits: number;
  readonly committedBudgetUnits: number;
  /** The accepted cancellation domain record when status is terminal. */
  readonly terminalRecordKey?: string;
  readonly terminalCancellation?: MeshAcceptedObjectiveCancellation;
  readonly terminalAt?: MeshLogicalTime;
  readonly status: "active" | "cancelled" | "expired";
}

/** Immutable Objective policy snapshot that authorized one local Work revision. */
export interface MeshWorkObjectivePolicySnapshot {
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly acceptedMessageId: string;
  readonly acceptedAt: MeshLogicalTime;
  readonly expiresAt: MeshLogicalTime;
  readonly permittedCapabilityKeys: readonly string[];
  readonly maximumBudgetUnits: number;
  readonly validUntil: string;
}

export type MeshObjectiveRevisionPayload =
  ObjectiveAnnouncePayload | ObjectiveRevisePayload;

/**
 * Signed evidence retained for one accepted Objective revision.
 *
 * The envelope was verified before acceptance. Restore revalidates its closed
 * wire shape and canonical payload digest; proof re-verification remains an
 * authenticated-snapshot/driver responsibility.
 */
export interface MeshAcceptedObjectiveDocument {
  readonly envelope: SignedMeshEnvelope<MeshObjectiveRevisionPayload>;
  readonly validityVerifiedAt: string;
  readonly acceptedAt: MeshLogicalTime;
  readonly expiresAt: MeshLogicalTime;
}

/** Signed evidence retained for one accepted Objective cancellation. */
export interface MeshAcceptedObjectiveCancellation {
  readonly envelope: SignedMeshEnvelope<ObjectiveCancelPayload>;
  readonly validityVerifiedAt: string;
}

/** Current locally-owned Work Item head, including terminal allocation lifecycle. */
export interface MeshWorkItemProjection {
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly objectivePolicy: MeshWorkObjectivePolicySnapshot;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly ownerEpoch: 1;
  readonly requiredCapabilityKeys: readonly string[];
  readonly matchingAttributes: Readonly<Record<string, string>>;
  readonly completionCriteria: readonly string[];
  readonly inputSummary?: string;
  readonly inputReference?: string;
  readonly budgetReservationUnits: number;
  readonly workDeadline: string;
  readonly workDeadlineAt: MeshLogicalTime;
  readonly offerAttempt: number;
  readonly expiryTimerId?: string;
  readonly expiryTimerGeneration?: number;
  readonly terminalAt?: MeshLogicalTime;
  readonly status: "ready" | "completed" | "released" | "cancelled" | "expired";
  readonly createdAt: MeshLogicalTime;
  readonly updatedAt: MeshLogicalTime;
}

/** Hard non-evictable limits for Objective and Work Item projections. */
export interface MeshObjectiveWorkLimits {
  readonly maximumIssuerAuthorities: number;
  readonly maximumIssuerKeys: number;
  readonly maximumObjectives: number;
  readonly maximumObjectivePolicies: number;
  readonly maximumWorkItems: number;
  readonly maximumWorkItemsPerObjective: number;
  readonly maximumRequiredCapabilityKeys: number;
  readonly maximumMatchingAttributes: number;
  readonly maximumCriteria: number;
  readonly maximumProjectionBytes: number;
}

/** Independently restorable Objective and Work Item projection. */
export interface MeshObjectiveWorkState {
  readonly schemaVersion: 1;
  readonly identity: MeshPeerIdentity;
  readonly issuerAuthorities: Readonly<
    Record<string, MeshObjectiveIssuerAuthority>
  >;
  readonly objectives: Readonly<Record<string, MeshObjectiveProjection>>;
  /** Signed accepted revisions keyed by `[objectiveId, revision]`. */
  readonly objectiveDocuments: Readonly<
    Record<string, MeshAcceptedObjectiveDocument>
  >;
  /** Non-evicting accepted policy heads keyed by `[objectiveId, revision]`. */
  readonly objectivePolicies: Readonly<
    Record<string, MeshWorkObjectivePolicySnapshot>
  >;
  readonly workItems: Readonly<Record<string, MeshWorkItemProjection>>;
  readonly limits: MeshObjectiveWorkLimits;
  readonly lastLogicalTime: MeshLogicalTime;
}

export interface MeshObjectiveWorkStateOptions {
  readonly identity: MeshPeerIdentity;
  readonly issuerAuthorities?: readonly MeshObjectiveIssuerAuthority[];
  readonly limits?: Partial<MeshObjectiveWorkLimits>;
}

/** Composes aligned core, discovery and Objective/Work projections. */
export interface MeshObjectiveWorkRuntimeState {
  readonly coordination: MeshCoordinationState;
  readonly discovery: MeshDiscoveryState;
  readonly objectives: MeshObjectiveWorkState;
}

export type MeshObjectivePayload =
  ObjectiveAnnouncePayload | ObjectiveRevisePayload | ObjectiveCancelPayload;

/** Already verified Objective record and driver-supplied trusted time. */
export interface MeshVerifiedObjectiveRequest {
  readonly envelope: VerifiedMeshEnvelope<MeshObjectivePayload>;
  readonly verifiedAt: string;
  readonly receivedAt: MeshLogicalTime;
  readonly supportedCriticalExtensions?: readonly string[];
}

export type MeshObjectiveWorkRejectionCode =
  | "invalid_verified_envelope"
  | "scope_mismatch"
  | "audience_mismatch"
  | "topic_not_subscribed"
  | "sender_not_admitted"
  | "sender_instance_not_admitted"
  | "sender_admission_expired"
  | "issuer_not_authorized"
  | "issuer_key_not_authorized"
  | "issuer_authority_expired"
  | "message_expired"
  | "message_from_future"
  | "unknown_critical_extension"
  | "objective_revision_invalid"
  | "objective_predecessor_invalid"
  | "objective_terminal"
  | "objective_cancel_invalid"
  | "objective_capacity_exceeded"
  | "objective_policy_capacity_exceeded"
  | "objective_limit_exceeded"
  | "objective_limit_below_committed"
  | "domain_record_conflict"
  | "domain_capacity_exceeded"
  | "journal_capacity_exceeded"
  | "timer_capacity_exceeded"
  | "timer_id_conflict"
  | "timer_generation_exhausted"
  | "work_objective_missing"
  | "work_objective_not_active"
  | "work_revision_invalid"
  | "work_capacity_exceeded"
  | "work_limit_exceeded"
  | "work_duplicate_conflict";

export type MeshObjectiveWorkDecision =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly state: MeshObjectiveWorkRuntimeState;
    }
  | {
      readonly accepted: false;
      readonly code: MeshObjectiveWorkRejectionCode;
      readonly state: MeshObjectiveWorkRuntimeState;
    };

/** Generation-fenced trusted timer evaluation for Objective and Work state. */
export type MeshObjectiveWorkTimerDecision =
  | {
      readonly accepted: true;
      readonly timer: MeshCoordinationTimer;
      readonly state: MeshObjectiveWorkRuntimeState;
    }
  | {
      readonly accepted: false;
      readonly code:
        | "timer_unknown"
        | "timer_generation_stale"
        | "timer_not_due"
        | "journal_capacity_exceeded";
      readonly state: MeshObjectiveWorkRuntimeState;
    };

export type MeshObjectiveWorkTimerInput = MeshCoordinationTimerFiredInput;

export interface MeshLocalWorkCreateInput {
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly matchingAttributes?: Readonly<Record<string, string>>;
  readonly completionCriteria: readonly string[];
  readonly inputSummary?: string;
  readonly inputReference?: string;
  readonly budgetReservationUnits: number;
  readonly workDeadline: string;
}

/** A revision supplies replacement content; the evaluator derives revision n + 1. */
export type MeshLocalWorkReviseInput = MeshLocalWorkCreateInput;

/** Driver-supplied time for local Objective/Work commands; never read a host clock. */
export interface MeshObjectiveWorkTrustedTime {
  readonly verifiedAt: string;
  readonly receivedAt: MeshLogicalTime;
}

export type MeshObjectiveWorkCommand =
  | { readonly kind: "work.create"; readonly input: MeshLocalWorkCreateInput }
  | {
      readonly kind: "work.revise";
      readonly input: MeshLocalWorkReviseInput;
      readonly expectedWorkItemRevision: number;
    }
  | {
      readonly kind: "work.cancel";
      readonly objectiveId: string;
      readonly workItemId: string;
      readonly expectedWorkItemRevision: number;
    };
