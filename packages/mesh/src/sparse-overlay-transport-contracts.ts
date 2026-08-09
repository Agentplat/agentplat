import type {
  MeshSparseDeliveryV2,
  MeshSparseOverlayDigestV2,
  MeshSparseOverlayProfileV2,
  MeshSparsePeerViewV2,
  MeshSparseUpdateV2,
} from "./sparse-overlay-contracts.js";
import type {
  MeshSparseDurableAdmissionV1,
  MeshSparseMembershipPeerV1,
  MeshSparseMembershipPortV1,
  MeshSparsePeerPlaneReceiveResultV1,
} from "./sparse-overlay-runtime-contracts.js";

export const MESH_SPARSE_TRANSPORT_SCHEMA_VERSION_V1 = 1 as const;

export type MeshSparseTransportConnectivityV1 =
  | "active"
  | "partitioned"
  | "rejoining";

export interface MeshSparseTransportOutboxRecordV1 {
  readonly recipient: MeshSparseMembershipPeerV1;
  readonly delivery: MeshSparseDeliveryV2;
  readonly attempts: number;
  readonly queuedAtLogicalTime: number;
  readonly availableAtLogicalTime: number;
  readonly lastReasonCode: string | null;
}

export interface MeshSparseTransportInboxRecordV1 {
  readonly sender: MeshSparseMembershipPeerV1;
  readonly delivery: MeshSparseDeliveryV2;
  readonly attempts: number;
  readonly queuedAtLogicalTime: number;
  readonly availableAtLogicalTime: number;
  readonly lastReasonCode: string | null;
}

export interface MeshSparseTransportUpdateRecordV1 {
  readonly update: MeshSparseUpdateV2;
  readonly admittedAtLogicalTime: number;
}

export interface MeshSparseAcknowledgedUpdateV1 {
  readonly updateId: MeshSparseUpdateV2["updateId"];
  readonly updateDigest: MeshSparseOverlayDigestV2;
  readonly acknowledgedAtLogicalTime: number;
}

/** Bounded causal evidence retained by one peer, not a collective-wide log. */
export interface MeshSparseTransportHistoryRecordV1 {
  readonly localSequence: number;
  readonly delivery: MeshSparseDeliveryV2;
  readonly observedAtLogicalTime: number;
}

export interface MeshSparseNeighborCursorV1 {
  readonly peerIndex: number;
  readonly peerId: string;
  readonly acknowledgedSequence: number;
}

/** Durable transport state for one peer and one sparse overlay. */
export interface MeshSparseTransportStateV1 {
  readonly schemaVersion: 1;
  readonly overlayId: string;
  readonly localPeerIndex: number;
  readonly localPeerId: string;
  readonly membershipDigest: MeshSparseOverlayDigestV2;
  readonly profileDigest: MeshSparseOverlayDigestV2;
  readonly revision: number;
  readonly connectivity: MeshSparseTransportConnectivityV1;
  readonly nextHistorySequence: number;
  readonly outbox: readonly MeshSparseTransportOutboxRecordV1[];
  readonly inbox: readonly MeshSparseTransportInboxRecordV1[];
  readonly updates: readonly MeshSparseTransportUpdateRecordV1[];
  readonly acknowledgedUpdates: readonly MeshSparseAcknowledgedUpdateV1[];
  readonly history: readonly MeshSparseTransportHistoryRecordV1[];
  readonly neighborCursors: readonly MeshSparseNeighborCursorV1[];
  readonly lastLogicalTime: number;
  readonly stateDigest: MeshSparseOverlayDigestV2;
}

export interface MeshSparseTransportStoreV1 {
  load(overlayId: string): Promise<MeshSparseTransportStateV1 | undefined>;
  compareAndSwap(input: {
    readonly overlayId: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: MeshSparseOverlayDigestV2 | null;
    readonly next: MeshSparseTransportStateV1;
  }): Promise<boolean>;
}

export interface MeshSparseTransportLimitsV1 {
  readonly maximumOutbox: number;
  readonly maximumInbox: number;
  readonly maximumUpdates: number;
  readonly maximumHistory: number;
  readonly maximumDirectPeers: number;
  readonly maximumBatchItems: number;
  readonly maximumCatchUpItems: number;
  readonly maximumCommitAttempts: number;
  readonly retryBaseDelay: number;
  readonly retryMaximumDelay: number;
}

export interface MeshSparseTransportIdentityV1 {
  readonly peerIndex: number;
  readonly peerId: string;
}

export interface MeshSparseTransportCatchUpResponseV1 {
  readonly overlayId: string;
  readonly membershipDigest: MeshSparseOverlayDigestV2;
  readonly provider: MeshSparseTransportIdentityV1;
  readonly earliestAvailableSequence: number;
  readonly latestSequence: number;
  readonly truncated: boolean;
  readonly records: readonly {
    readonly providerSequence: number;
    readonly delivery: MeshSparseDeliveryV2;
  }[];
}

export interface MeshSparseTransportEndpointV1 {
  receive(input: {
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly sender: MeshSparseMembershipPeerV1;
    readonly delivery: MeshSparseDeliveryV2;
    readonly logicalTime: number;
  }): Promise<MeshSparseDurableAdmissionV1>;
  catchUp(input: {
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly requester: MeshSparseMembershipPeerV1;
    readonly afterSequence: number;
    readonly maximumItems: number;
    readonly logicalTime: number;
  }): Promise<MeshSparseTransportCatchUpResponseV1>;
  fetchCausal(input: {
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly requester: MeshSparseMembershipPeerV1;
    readonly deliveryDigest: MeshSparseOverlayDigestV2;
    readonly logicalTime: number;
  }): Promise<MeshSparseDeliveryV2 | undefined>;
}

/** A peer owns only explicitly connected next-hop endpoints. */
export interface MeshSparseNextHopTransportV1 {
  deliver(input: {
    readonly recipient: MeshSparseMembershipPeerV1;
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly sender: MeshSparseMembershipPeerV1;
    readonly delivery: MeshSparseDeliveryV2;
    readonly logicalTime: number;
  }): Promise<MeshSparseDurableAdmissionV1>;
  catchUp(input: {
    readonly recipient: MeshSparseMembershipPeerV1;
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly requester: MeshSparseMembershipPeerV1;
    readonly afterSequence: number;
    readonly maximumItems: number;
    readonly logicalTime: number;
  }): Promise<MeshSparseTransportCatchUpResponseV1>;
  fetchCausal(input: {
    readonly recipient: MeshSparseMembershipPeerV1;
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly requester: MeshSparseMembershipPeerV1;
    readonly deliveryDigest: MeshSparseOverlayDigestV2;
    readonly logicalTime: number;
  }): Promise<MeshSparseDeliveryV2 | undefined>;
}

export interface MeshSparsePeerTransportOptionsV1 {
  readonly overlayId: string;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly membershipDigest: MeshSparseOverlayDigestV2;
  readonly localPeerIndex: number;
  readonly localPeerId: string;
  readonly store: MeshSparseTransportStoreV1;
  readonly membership: MeshSparseMembershipPortV1;
  readonly nextHop: MeshSparseNextHopTransportV1;
  /** Returns the current local sparse view; it must never return a global graph. */
  readonly currentView: () =>
    | MeshSparsePeerViewV2
    | Promise<MeshSparsePeerViewV2>;
  readonly limits?: Partial<MeshSparseTransportLimitsV1>;
}

export interface MeshSparseTransportBatchResultV1 {
  readonly attempted: number;
  readonly completed: number;
  readonly duplicates: number;
  readonly deferred: number;
  readonly rejected: number;
  readonly remaining: number;
}

export interface MeshSparseTransportRejoinResultV1 {
  readonly contacted: number;
  readonly admitted: number;
  readonly duplicates: number;
  readonly deferred: number;
  readonly gaps: readonly string[];
  readonly state: MeshSparseTransportStateV1;
}

export type MeshSparseTransportInboundHandlerV1 = (input: {
  readonly delivery: MeshSparseDeliveryV2;
  readonly logicalTime: number;
}) =>
  | Promise<MeshSparsePeerPlaneReceiveResultV1>
  | MeshSparsePeerPlaneReceiveResultV1;
