import type {
  MeshAdaptiveOverlayCertificateV1,
  MeshAdaptiveOverlayResultV1,
} from "./adaptive-overlay-contracts.js";
import type {
  MeshSparseDeliveryV2,
  MeshSparseOverlayDigestV2,
  MeshSparseOverlayProfileV2,
  MeshSparsePeerViewV2,
  MeshSparseRoutingStateV2,
  MeshSparseUpdateV2,
} from "./sparse-overlay-contracts.js";

export const MESH_SPARSE_PEER_PLANE_SCHEMA_VERSION_V1 = 1 as const;

export type MeshSparsePeerAvailabilityV1 =
  | "active"
  | "suspect"
  | "departed";

/** One bounded membership projection. It may contain only requested local-view peers. */
export interface MeshSparseMembershipPeerV1 {
  readonly peerIndex: number;
  readonly peerId: string;
  readonly availability: MeshSparsePeerAvailabilityV1;
}

export interface MeshSparseMembershipSliceV1 {
  readonly schemaVersion: 1;
  readonly overlayId: string;
  readonly membershipDigest: MeshSparseOverlayDigestV2;
  readonly observedAtLogicalTime: number;
  readonly validUntilLogicalTime: number;
  readonly peers: readonly MeshSparseMembershipPeerV1[];
}

export interface MeshSparseMembershipPortV1 {
  /** Must return no peer outside `peerIndexes`; callers never request a global graph. */
  resolve(input: {
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly peerIndexes: readonly number[];
    readonly logicalTime: number;
  }): Promise<MeshSparseMembershipSliceV1>;
}

export interface MeshSparseMembershipCatchUpPortV1 {
  /** Refreshes a lagging local projection of the same membership configuration. */
  catchUp(input: {
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly requiredPeerIndexes: readonly number[];
    readonly logicalTime: number;
  }): Promise<boolean>;
}

/** Narrow application surface implemented by MeshAdaptiveOverlayRuntimeV1. */
export interface MeshSparseAdaptiveOverlayApplicationPortV1 {
  apply(input: {
    readonly certificate: MeshAdaptiveOverlayCertificateV1;
    readonly profile: MeshSparseOverlayProfileV2;
    readonly view: MeshSparsePeerViewV2;
    /** Fences a new application; exact already-applied certificate replay is duplicate. */
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
  }): Promise<MeshAdaptiveOverlayResultV1>;
}

export interface MeshSparsePendingDeliveryV1 {
  readonly delivery: MeshSparseDeliveryV2;
  readonly queuedAtLogicalTime: number;
}

export interface MeshSparsePendingUpdateV1 {
  readonly update: MeshSparseUpdateV2;
  readonly admittedAtLogicalTime: number;
}

/** Durable local state. It contains one sparse view, never collective-wide topology. */
export interface MeshSparsePeerPlaneStateV1 {
  readonly schemaVersion: 1;
  readonly overlayId: string;
  readonly revision: number;
  readonly membershipDigest: MeshSparseOverlayDigestV2;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly routing: MeshSparseRoutingStateV2;
  readonly pendingDeliveries: readonly MeshSparsePendingDeliveryV1[];
  readonly pendingUpdates: readonly MeshSparsePendingUpdateV1[];
  readonly lastLogicalTime: number;
  readonly stateDigest: MeshSparseOverlayDigestV2;
}

/** Implementations must provide durable compare-and-swap for one local peer. */
export interface MeshSparsePeerPlaneStoreV1 {
  load(overlayId: string): Promise<MeshSparsePeerPlaneStateV1 | undefined>;
  compareAndSwap(input: {
    readonly overlayId: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: MeshSparseOverlayDigestV2 | null;
    readonly next: MeshSparsePeerPlaneStateV1;
  }): Promise<boolean>;
}

export type MeshSparseDurableAdmissionV1 =
  | { readonly status: "admitted" | "duplicate" }
  | { readonly status: "backpressured"; readonly reasonCode: string }
  | { readonly status: "rejected"; readonly reasonCode: string };

/** Durable, idempotent next-hop queue keyed by deliveryDigest. */
export interface MeshSparseDeliveryQueuePortV1 {
  pending(recipientPeerId: string): number | Promise<number>;
  enqueue(input: {
    readonly overlayId: string;
    readonly recipient: MeshSparseMembershipPeerV1;
    readonly delivery: MeshSparseDeliveryV2;
  }): Promise<MeshSparseDurableAdmissionV1>;
}

/** Durable, idempotent local announcement inbox keyed by updateId. */
export interface MeshSparseUpdateAdmissionPortV1 {
  pending(topic: string): number | Promise<number>;
  admit(input: {
    readonly overlayId: string;
    readonly update: MeshSparseUpdateV2;
  }): Promise<MeshSparseDurableAdmissionV1>;
}

export interface MeshSparsePeerPlaneLimitsV1 {
  readonly maximumPendingDeliveries: number;
  readonly maximumPendingUpdates: number;
  readonly maximumPendingPerNeighbor: number;
  readonly maximumPendingPerTopic: number;
  readonly maximumDrainItems: number;
  readonly maximumCommitAttempts: number;
}

export interface MeshSparsePeerPlaneOptionsV1 {
  readonly overlayId: string;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly topologySeed: number;
  readonly localPeerIndex: number;
  readonly membershipDigest: MeshSparseOverlayDigestV2;
  readonly store: MeshSparsePeerPlaneStoreV1;
  readonly membership: MeshSparseMembershipPortV1;
  readonly deliveryQueue: MeshSparseDeliveryQueuePortV1;
  readonly updateAdmission: MeshSparseUpdateAdmissionPortV1;
  readonly membershipCatchUp?: MeshSparseMembershipCatchUpPortV1;
  readonly adaptive?: MeshSparseAdaptiveOverlayApplicationPortV1;
  readonly limits?: Partial<MeshSparsePeerPlaneLimitsV1>;
}

export type MeshSparseTopologyFreshnessV1 = "fresh" | "stale" | "unknown";

export interface MeshSparsePeerPlaneDrainResultV1 {
  readonly attempted: number;
  readonly admitted: number;
  readonly backpressured: number;
  readonly rejected: number;
  readonly remaining: number;
}

export interface MeshSparsePeerPlanePublishResultV1 {
  readonly update: MeshSparseUpdateV2;
  readonly state: MeshSparsePeerPlaneStateV1;
  readonly drain: MeshSparsePeerPlaneDrainResultV1;
}

export interface MeshSparsePeerPlaneReceiveResultV1 {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reasonCode: string | null;
  readonly state: MeshSparsePeerPlaneStateV1;
  readonly drain: MeshSparsePeerPlaneDrainResultV1;
}

export interface MeshSparsePeerPlaneAdaptationResultV1 {
  readonly adaptation: MeshAdaptiveOverlayResultV1;
  readonly state: MeshSparsePeerPlaneStateV1;
}

export interface MeshSparsePeerPlaneAdaptivePortV1 {
  applyAdaptation(input: {
    readonly certificate: MeshAdaptiveOverlayCertificateV1;
    readonly expectedRevision: number;
    readonly logicalTime: number;
  }): Promise<MeshSparsePeerPlaneAdaptationResultV1>;
}
