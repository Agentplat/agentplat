/** Closed, interoperable scale profiles for the sparse overlay. */
export type MeshSparseOverlayProfileIdV2 =
  'standard-500' | 'large-5000' | 'frontier-100000';

export type MeshSparseOverlayDigestV2 = `sha256:${string}`;
export type MeshSparseOverlayUpdateIdV2 = `overlay-update:${string}`;

/** Immutable population, topology and resource bounds. */
export interface MeshSparseOverlayProfileV2 {
  readonly schemaVersion: 2;
  readonly profileId: MeshSparseOverlayProfileIdV2;
  readonly maximumPeers: 500 | 5_000 | 100_000;
  readonly maximumInteractions: 5_000 | 50_000 | 1_000_000;
  readonly activeNeighborCount: number;
  readonly reserveNeighborCount: number;
  readonly maximumFanout: number;
  readonly maximumHops: number;
  readonly maximumRecentUpdates: number;
  readonly profileDigest: MeshSparseOverlayDigestV2;
}

/** One peer's complete bounded routing knowledge. */
export interface MeshSparsePeerViewV2 {
  readonly schemaVersion: 2;
  readonly profileDigest: MeshSparseOverlayDigestV2;
  readonly topologySeed: number;
  readonly peerIndex: number;
  readonly peerId: string;
  readonly revision: number;
  readonly activeNeighborIndexes: readonly number[];
  readonly reserveNeighborIndexes: readonly number[];
  readonly excludedNeighborIndexes: readonly number[];
  readonly viewDigest: MeshSparseOverlayDigestV2;
}

/** Content-free update identity propagated by the overlay. */
export interface MeshSparseUpdateV2 {
  readonly schemaVersion: 2;
  readonly profileDigest: MeshSparseOverlayDigestV2;
  readonly updateId: MeshSparseOverlayUpdateIdV2;
  readonly originPeerIndex: number;
  readonly originPeerId: string;
  readonly originSequence: number;
  readonly topic: string;
  readonly payloadDigest: MeshSparseOverlayDigestV2;
  readonly createdAtLogicalTime: number;
  readonly expiresAtLogicalTime: number;
  readonly maximumHops: number;
  readonly updateDigest: MeshSparseOverlayDigestV2;
}

/** One transport-agnostic delivery plan in an auditable forwarding chain. */
export interface MeshSparseDeliveryV2 {
  readonly schemaVersion: 2;
  readonly update: MeshSparseUpdateV2;
  readonly senderPeerIndex: number;
  readonly recipientPeerIndex: number;
  readonly hop: number;
  readonly senderViewDigest: MeshSparseOverlayDigestV2;
  readonly previousDeliveryDigest: MeshSparseOverlayDigestV2 | null;
  readonly deliveryDigest: MeshSparseOverlayDigestV2;
}

export interface MeshSparseRecentUpdateV2 {
  readonly updateId: MeshSparseOverlayUpdateIdV2;
  readonly expiresAtLogicalTime: number;
}

/** Construction-bound local routing state; it never contains global state. */
export interface MeshSparseRoutingStateV2 {
  readonly schemaVersion: 2;
  readonly profileDigest: MeshSparseOverlayDigestV2;
  readonly view: MeshSparsePeerViewV2;
  readonly recentUpdates: readonly MeshSparseRecentUpdateV2[];
  readonly nextOriginSequence: number;
  readonly maximumOutboundInteractions: number;
  readonly outboundInteractions: number;
  readonly acceptedRemoteUpdates: number;
  readonly lastLogicalTime: number;
  readonly stateDigest: MeshSparseOverlayDigestV2;
}

export interface MeshSparsePublishResultV2 {
  readonly state: MeshSparseRoutingStateV2;
  readonly update: MeshSparseUpdateV2;
  readonly deliveries: readonly MeshSparseDeliveryV2[];
}

export type MeshSparseReceiveRejectionCodeV2 =
  | 'profile_mismatch'
  | 'recipient_mismatch'
  | 'update_expired'
  | 'hop_limit_exceeded'
  | 'recent_update_capacity_exceeded';

export type MeshSparseReceiveResultV2 =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly state: MeshSparseRoutingStateV2;
      readonly deliveries: readonly MeshSparseDeliveryV2[];
    }
  | {
      readonly accepted: false;
      readonly code: MeshSparseReceiveRejectionCodeV2;
      readonly state: MeshSparseRoutingStateV2;
      readonly deliveries: readonly [];
    };
