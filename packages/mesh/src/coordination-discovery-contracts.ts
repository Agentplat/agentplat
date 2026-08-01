import type {
  CapabilityAdvertisePayload,
  CapabilityWithdrawPayload,
  MeshAudienceTopic,
  PeerCardPayload,
  PeerGoodbyePayload,
  VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';

import type { MeshLogicalTime, MeshPeerIdentity } from './contracts.js';
import type { MeshCoordinationState } from './coordination-contracts.js';
import type { MeshWireVersionHighWater } from './coordination-wire-version-contracts.js';

/** Local admission is configured independently from discovery self-claims. */
export interface MeshDiscoveryAdmission {
  readonly peerId: string;
  readonly instanceIds: readonly string[];
  readonly validUntil: string;
}

/** Current accepted Peer Card head, including non-routable terminal status. */
export interface MeshPeerCardProjection {
  readonly peerId: string;
  readonly instanceId: string;
  readonly peerCardId: string;
  readonly cardRevision: number;
  readonly protocolVersions: readonly number[];
  readonly transportHints: readonly string[];
  readonly capabilityIds: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly validityVerifiedAt: string;
  readonly acceptedMessageId: string;
  readonly acceptedAt: MeshLogicalTime;
  readonly expiresAt: MeshLogicalTime;
  readonly status: 'active' | 'departed' | 'expired';
}

/** Bounded local routing projection; absence never revokes admission. */
export interface MeshPeerViewProjection {
  readonly peerId: string;
  readonly peerCardId: string;
  readonly cardRevision: number;
  readonly observedAt: MeshLogicalTime;
  readonly expiresAt: MeshLogicalTime;
}

/** Current capability revision retained as a self-claim and high-water mark. */
export interface MeshCapabilityProjection {
  readonly ownerPeerId: string;
  readonly instanceId: string;
  readonly advertisementId: string;
  readonly capabilityId: string;
  readonly capabilityRevision: number;
  readonly capabilityKey: string;
  readonly version: string;
  readonly variant?: string;
  readonly inputMediaTypes: readonly string[];
  readonly outputMediaTypes: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly validityVerifiedAt: string;
  readonly maximumConcurrency?: number;
  readonly maximumPayloadBytes?: number;
  readonly acceptedMessageId: string;
  readonly acceptedAt: MeshLogicalTime;
  readonly expiresAt: MeshLogicalTime;
  readonly status: 'active' | 'withdrawn' | 'departed' | 'expired';
}

/** Hard ceilings for the independently restorable discovery projection. */
export interface MeshDiscoveryLimits {
  readonly maximumAdmissions: number;
  readonly maximumInstancesPerAdmission: number;
  readonly maximumPeerCards: number;
  readonly maximumPeerViews: number;
  readonly maximumPeerCardBytes: number;
  readonly maximumCapabilities: number;
  readonly maximumCapabilitiesPerPeer: number;
  readonly maximumCapabilityBytes: number;
  readonly maximumSubscriptions: number;
  readonly maximumFanout: number;
  readonly maximumRequirementCapabilityKeys: number;
  readonly maximumRequirementAttributes: number;
  readonly maximumRequirementBytes: number;
}

/** Immutable discovery projection composed with the coordination core. */
export interface MeshDiscoveryState {
  readonly schemaVersion: 2;
  readonly identity: MeshPeerIdentity;
  readonly admittedPeers: Readonly<Record<string, MeshDiscoveryAdmission>>;
  readonly peerCards: Readonly<Record<string, MeshPeerCardProjection>>;
  readonly peerViews: Readonly<Record<string, MeshPeerViewProjection>>;
  readonly capabilities: Readonly<Record<string, MeshCapabilityProjection>>;
  readonly wireVersionHighWaters: Readonly<
    Record<string, MeshWireVersionHighWater>
  >;
  readonly subscriptions: readonly MeshAudienceTopic[];
  readonly limits: MeshDiscoveryLimits;
  readonly lastLogicalTime: MeshLogicalTime;
}

/** Construction options keep admission and subscriptions explicit. */
export interface MeshDiscoveryStateOptions {
  readonly identity: MeshPeerIdentity;
  readonly admittedPeers?: readonly MeshDiscoveryAdmission[];
  readonly subscriptions?: readonly MeshAudienceTopic[];
  readonly limits?: Partial<MeshDiscoveryLimits>;
}

/** Composite state passed to pure discovery evaluators. */
export interface MeshDiscoveryRuntimeState {
  readonly coordination: MeshCoordinationState;
  readonly discovery: MeshDiscoveryState;
}

export type MeshDiscoveryPayload =
  | PeerCardPayload
  | PeerGoodbyePayload
  | CapabilityAdvertisePayload
  | CapabilityWithdrawPayload;

/** Already-verified record plus trusted receiver time. */
export interface MeshVerifiedDiscoveryRequest {
  readonly envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>;
  readonly verifiedAt: string;
  readonly receivedAt: MeshLogicalTime;
  readonly supportedCriticalExtensions?: readonly string[];
}

export type MeshDiscoveryRejectionCode =
  | 'invalid_verified_envelope'
  | 'scope_mismatch'
  | 'audience_mismatch'
  | 'topic_not_subscribed'
  | 'sender_not_admitted'
  | 'sender_instance_not_admitted'
  | 'sender_admission_expired'
  | 'message_expired'
  | 'message_from_future'
  | 'unknown_critical_extension'
  | 'record_expired'
  | 'validity_exceeds_admission'
  | 'domain_record_conflict'
  | 'domain_capacity_exceeded'
  | 'journal_capacity_exceeded'
  | 'peer_card_missing'
  | 'peer_card_not_active'
  | 'peer_card_revision_invalid'
  | 'peer_card_predecessor_invalid'
  | 'peer_card_capacity_exceeded'
  | 'peer_view_capacity_exceeded'
  | 'capability_not_listed'
  | 'capability_missing'
  | 'capability_not_active'
  | 'capability_revision_invalid'
  | 'capability_predecessor_invalid'
  | 'capability_capacity_exceeded';

export type MeshDiscoveryDecision =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly state: MeshDiscoveryRuntimeState;
    }
  | {
      readonly accepted: false;
      readonly code: MeshDiscoveryRejectionCode;
      readonly state: MeshDiscoveryRuntimeState;
    };

export type MeshDiscoveryAdvanceDecision =
  | {
      readonly accepted: true;
      readonly expiredRecords: number;
      readonly state: MeshDiscoveryRuntimeState;
    }
  | {
      readonly accepted: false;
      readonly code: 'journal_capacity_exceeded';
      readonly state: MeshDiscoveryRuntimeState;
    };

export interface MeshCapabilityRequirement {
  readonly capabilityKeys: readonly string[];
  readonly attributes?: Readonly<Record<string, string>>;
  readonly inputMediaType?: string;
  readonly outputMediaType?: string;
  readonly fanout: number;
}

export type MeshCapabilityMatchReason =
  | 'eligible'
  | 'peer_view_missing'
  | 'peer_card_inactive'
  | 'capability_key_missing'
  | 'capability_expired'
  | 'attribute_mismatch'
  | 'input_media_type_mismatch'
  | 'output_media_type_mismatch'
  | 'fanout_limited';

export interface MeshCapabilityMatch {
  readonly peerId: string;
  readonly capabilities: readonly {
    readonly capabilityKey: string;
    readonly capabilityId: string;
    readonly capabilityRevision: number;
    readonly advertisementId: string;
  }[];
}

export interface MeshCapabilityMatchEvaluation {
  readonly peerId: string;
  readonly reason: MeshCapabilityMatchReason;
}

export interface MeshCapabilityMatchResult {
  readonly matches: readonly MeshCapabilityMatch[];
  readonly evaluations: readonly MeshCapabilityMatchEvaluation[];
}
