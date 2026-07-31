import type {
  MeshCryptoPolicy,
  MeshCryptoRejectionCode,
  MeshKeyResolver,
} from '@agentplat/mesh-crypto';
import type {
  MeshProtocolOptions,
  SignedMeshEnvelope,
  VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';

import type { MeshLogicalTime, MeshPeerIdentity } from './contracts.js';
import type {
  MeshDiscoveryPayload,
  MeshDiscoveryRejectionCode,
  MeshDiscoveryState,
} from './coordination-discovery-contracts.js';
import type { MeshCoordinationState } from './coordination-contracts.js';
import type {
  MeshObjectivePayload,
  MeshObjectiveWorkRejectionCode,
  MeshObjectiveWorkState,
} from './coordination-objective-work-contracts.js';
import type {
  MeshAllocationPayload,
  MeshAllocationRejectionCode,
  MeshAllocationState,
} from './coordination-allocation-contracts.js';

/** One bounded replay window for an admitted peer and instance pair. */
export interface MeshCoordinationInboundReplayWindow {
  readonly highestSequence: number;
  readonly seenOffsets: readonly number[];
}

/** Hard ceilings for non-evictable inbound security state. */
export interface MeshCoordinationInboundLimits {
  readonly replayWindowSize: number;
  readonly maximumReplayWindows: number;
  readonly maximumTrackedMessageIds: number;
  readonly messageIdRetentionMs: number;
}

/** Independently versioned replay and message-id security snapshot. */
export interface MeshCoordinationInboundState {
  readonly schemaVersion: 1;
  readonly identity: MeshPeerIdentity;
  readonly replay: Readonly<
    Record<string, MeshCoordinationInboundReplayWindow>
  >;
  readonly messageIds: Readonly<Record<string, MeshLogicalTime>>;
  readonly limits: MeshCoordinationInboundLimits;
  readonly lastLogicalTime: MeshLogicalTime;
}

/** Options for a new empty coordination inbound snapshot. */
export interface MeshCoordinationInboundStateOptions {
  readonly identity: MeshPeerIdentity;
  readonly limits?: Partial<MeshCoordinationInboundLimits>;
}

/** Composite state used by the signed discovery acceptance boundary. */
export interface MeshDiscoveryInboundRuntimeState {
  readonly coordination: MeshCoordinationState;
  readonly discovery: MeshDiscoveryState;
  readonly inbound: MeshCoordinationInboundState;
}

/** Trusted construction-time dependencies for the discovery inbound boundary. */
export interface MeshDiscoveryInboundProcessorOptions {
  readonly resolver: MeshKeyResolver;
  readonly cryptoPolicy: MeshCryptoPolicy;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
  readonly supportedCriticalExtensions?: readonly string[];
}

/** Remote message data accepted by a configured discovery inbound boundary. */
export interface MeshDiscoveryInboundRequest {
  readonly envelope: SignedMeshEnvelope<MeshDiscoveryPayload>;
  readonly verifiedAt: string;
  readonly receivedAt: MeshLogicalTime;
}

/** Stable fail-closed outcomes from the signed discovery boundary. */
export type MeshDiscoveryInboundRejectionCode =
  | MeshCryptoRejectionCode
  | MeshDiscoveryRejectionCode
  | 'logical_time_regressed'
  | 'message_replayed'
  | 'sequence_outside_window'
  | 'replay_capacity_exceeded'
  | 'message_not_authorized'
  | 'unsupported_message_type';

/** Result of verifying and applying one signed discovery coordination message. */
export type MeshDiscoveryInboundDecision =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>;
      readonly state: MeshDiscoveryInboundRuntimeState;
    }
  | {
      readonly accepted: false;
      readonly code: MeshDiscoveryInboundRejectionCode;
      readonly state: MeshDiscoveryInboundRuntimeState;
    };

/** Authenticated boundary with immutable construction-time trust dependencies. */
export interface MeshDiscoveryInboundProcessor {
  process(
    state: MeshDiscoveryInboundRuntimeState,
    request: MeshDiscoveryInboundRequest
  ): Promise<MeshDiscoveryInboundDecision>;
}

/** Composite state used by the signed Objective acceptance boundary. */
export interface MeshObjectiveInboundRuntimeState {
  readonly coordination: MeshCoordinationState;
  readonly discovery: MeshDiscoveryState;
  readonly objectives: MeshObjectiveWorkState;
  readonly inbound: MeshCoordinationInboundState;
}

/** Trusted construction-time dependencies for the Objective inbound boundary. */
export interface MeshObjectiveInboundProcessorOptions {
  readonly resolver: MeshKeyResolver;
  readonly cryptoPolicy: MeshCryptoPolicy;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
  readonly supportedCriticalExtensions?: readonly string[];
}

/** Remote Objective message data accepted by a configured inbound boundary. */
export interface MeshObjectiveInboundRequest {
  readonly envelope: SignedMeshEnvelope<MeshObjectivePayload>;
  readonly verifiedAt: string;
  readonly receivedAt: MeshLogicalTime;
}

/** Stable fail-closed outcomes from the signed Objective boundary. */
export type MeshObjectiveInboundRejectionCode =
  | MeshCryptoRejectionCode
  | MeshObjectiveWorkRejectionCode
  | 'logical_time_regressed'
  | 'message_replayed'
  | 'sequence_outside_window'
  | 'replay_capacity_exceeded'
  | 'unsupported_message_type';

/** Result of verifying and applying one signed Objective coordination message. */
export type MeshObjectiveInboundDecision =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly envelope: VerifiedMeshEnvelope<MeshObjectivePayload>;
      readonly state: MeshObjectiveInboundRuntimeState;
    }
  | {
      readonly accepted: false;
      readonly code: MeshObjectiveInboundRejectionCode;
      readonly state: MeshObjectiveInboundRuntimeState;
    };

/** Authenticated boundary with immutable construction-time trust dependencies. */
export interface MeshObjectiveInboundProcessor {
  process(
    state: MeshObjectiveInboundRuntimeState,
    request: MeshObjectiveInboundRequest
  ): Promise<MeshObjectiveInboundDecision>;
}

/** Allocation messages authenticated at the common coordination boundary. */
export type MeshAllocationInboundPayload = MeshAllocationPayload;

/** Composite state used by the signed allocation acceptance boundary. */
export interface MeshAllocationInboundRuntimeState {
  readonly coordination: MeshCoordinationState;
  readonly discovery: MeshDiscoveryState;
  readonly objectives: MeshObjectiveWorkState;
  readonly allocation: MeshAllocationState;
  readonly inbound: MeshCoordinationInboundState;
}

/** Trusted construction-time dependencies for the allocation inbound boundary. */
export interface MeshAllocationInboundProcessorOptions {
  readonly resolver: MeshKeyResolver;
  readonly cryptoPolicy: MeshCryptoPolicy;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
  readonly supportedCriticalExtensions?: readonly string[];
}

/** Remote allocation message data accepted by a configured inbound boundary. */
export interface MeshAllocationInboundRequest {
  readonly envelope: SignedMeshEnvelope<MeshAllocationInboundPayload>;
  readonly verifiedAt: string;
  readonly receivedAt: MeshLogicalTime;
}

/** Stable fail-closed outcomes from the signed allocation boundary. */
export type MeshAllocationInboundRejectionCode =
  | MeshCryptoRejectionCode
  | MeshAllocationRejectionCode
  | 'logical_time_regressed'
  | 'message_replayed'
  | 'sequence_outside_window'
  | 'replay_capacity_exceeded'
  | 'unsupported_message_type';

/** Result of verifying and applying one signed allocation coordination message. */
export type MeshAllocationInboundDecision =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly envelope: VerifiedMeshEnvelope<MeshAllocationInboundPayload>;
      readonly state: MeshAllocationInboundRuntimeState;
    }
  | {
      readonly accepted: false;
      readonly code: MeshAllocationInboundRejectionCode;
      readonly state: MeshAllocationInboundRuntimeState;
    };

/** Authenticated boundary with immutable construction-time trust dependencies. */
export interface MeshAllocationInboundProcessor {
  process(
    state: MeshAllocationInboundRuntimeState,
    request: MeshAllocationInboundRequest
  ): Promise<MeshAllocationInboundDecision>;
}
