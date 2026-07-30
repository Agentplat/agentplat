import type {
  MeshCryptoPolicy,
  MeshCryptoRejectionCode,
  MeshEnvelopeVerifier,
  MeshKeyResolver,
} from '@agentplat/mesh-crypto';
import type {
  MeshMessagePayload,
  MeshMessageType,
  MeshProtocolOptions,
  SignedMeshEnvelope,
  VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';

/** Integer virtual or wall-clock-derived milliseconds supplied by a driver. */
export type MeshLogicalTime = number;

/** Identity and scope owned by one independently executing peer. */
export interface MeshPeerIdentity {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
}

/** Locally preprovisioned admission information for one peer instance. */
export interface MeshAdmittedPeer {
  readonly peerId: string;
  readonly instanceIds: readonly string[];
  readonly peerCardId: string;
  readonly acceptedCardMessageId: string;
  readonly cardRevision: number;
  readonly validUntil: string;
}

/** Latest locally accepted membership projection for one admitted peer. */
export interface MeshPeerView {
  readonly peerId: string;
  readonly instanceId: string;
  readonly peerCardId: string;
  readonly cardRevision: number;
  readonly status: 'admitted' | 'observed' | 'responsive' | 'departed';
  readonly lastObservedAt?: MeshLogicalTime;
  readonly lastResponsiveAt?: MeshLogicalTime;
}

/** Replay and idempotency state for one admitted peer and instance pair. */
export interface MeshReplayWindow {
  readonly highestSequence: number;
  /** Sequence offsets retained within the bounded replay window. */
  readonly seenOffsets: readonly number[];
}

/** One locally dispatched ping awaiting a causally bound acknowledgement. */
export interface MeshPendingPing {
  readonly messageId: string;
  readonly peerId: string;
  readonly expiresAt: MeshLogicalTime;
}

/** One outbound message waiting for a driver to prepare signed bytes. */
export interface MeshPendingPreparation {
  readonly effectId: string;
  readonly type: MeshMessageType;
  readonly audiencePeerId: string;
  readonly maximumLifetimeMs: number;
  readonly prepareBy: MeshLogicalTime;
}

/** Fixed local resource bounds applied by the inbound acceptance boundary. */
export interface MeshPeerLimits {
  readonly replayWindowSize: number;
  readonly maximumTrackedMessageIds: number;
  readonly messageIdRetentionMs: number;
  readonly maximumPendingPings: number;
  readonly maximumAdmittedPeers: number;
  readonly maximumInstancesPerPeer: number;
}

/** Immutable state consumed and returned by a peer reducer. */
export interface MeshPeerState {
  readonly identity: MeshPeerIdentity;
  readonly status: 'created' | 'running' | 'stopped';
  readonly admittedPeers: Readonly<Record<string, MeshAdmittedPeer>>;
  readonly peers: Readonly<Record<string, MeshPeerView>>;
  readonly replay: Readonly<Record<string, MeshReplayWindow>>;
  /** Mesh-wide IDs mapped to their local exclusive retention deadline. */
  readonly messageIds: Readonly<Record<string, MeshLogicalTime>>;
  readonly pendingPings: Readonly<Record<string, MeshPendingPing>>;
  readonly pendingPreparations: Readonly<Record<string, MeshPendingPreparation>>;
  readonly limits: MeshPeerLimits;
  readonly localEventSequence: number;
  readonly lastLogicalTime: MeshLogicalTime;
}

/** Input used to construct one bounded local peer state. */
export interface MeshPeerStateOptions {
  readonly identity: MeshPeerIdentity;
  readonly admittedPeers: readonly MeshAdmittedPeer[];
  readonly limits?: Partial<MeshPeerLimits>;
}

/** Starts an already configured peer without reading a clock or transport. */
export interface MeshPeerStartInput {
  readonly kind: 'peer.start';
}

/** Stops local scheduling without changing remote identity history. */
export interface MeshPeerStopInput {
  readonly kind: 'peer.stop';
  readonly reason: 'requested' | 'resource_limit' | 'policy';
}

/** Requests a causally tracked liveness probe to one admitted peer. */
export interface MeshPeerPingInput {
  readonly kind: 'peer.ping';
  readonly peerId: string;
}

/** Returns one interpreted effect result to the pure reducer. */
export interface MeshEffectResultInput {
  readonly kind: 'effect.result';
  readonly effectId: string;
  readonly status: 'succeeded' | 'failed';
  readonly errorCode?: string;
  readonly preparedMessage?: {
    readonly messageId: string;
    readonly type: MeshMessageType;
    readonly audiencePeerId: string;
    readonly expiresAt: MeshLogicalTime;
  };
}

/** Every input accepted by the initial peer kernel. */
export type MeshPeerInput =
  | MeshPeerStartInput
  | MeshPeerStopInput
  | MeshPeerPingInput
  | MeshEffectResultInput;

/** A message request that has not yet received identity, time or proof fields. */
export interface MeshOutboundIntent<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> {
  readonly type: TPayload['type'];
  readonly audiencePeerId: string;
  readonly objectiveId?: string;
  readonly payload: TPayload;
  readonly causationId?: string;
  readonly correlationId?: string;
  readonly maximumLifetimeMs: number;
}

/** Requests that a driver serialize and sign without delivering yet. */
export interface MeshPrepareEffect {
  readonly kind: 'message.prepare';
  readonly effectId: string;
  readonly intent: MeshOutboundIntent;
}

/** Releases previously prepared bytes only after causal state is committed. */
export interface MeshDeliverEffect {
  readonly kind: 'message.deliver';
  readonly effectId: string;
  readonly preparationEffectId: string;
  readonly messageId: string;
  readonly audiencePeerId: string;
}

/** Requests a logical timer without reading a host clock inside the reducer. */
export interface MeshScheduleEffect {
  readonly kind: 'timer.schedule';
  readonly effectId: string;
  readonly timerId: string;
  readonly dueAt: MeshLogicalTime;
}

/** Emits redacted operational data without changing a peer decision. */
export interface MeshEventEffect {
  readonly kind: 'event.emit';
  readonly effectId: string;
  readonly event: {
    readonly type: string;
    readonly peerId: string;
    readonly messageType?: MeshMessageType;
    readonly messageId?: string;
    readonly occurredAt: MeshLogicalTime;
    readonly reasonCode?: string;
  };
}

/** Stops additional intake when a configured bound would be exceeded. */
export interface MeshBackpressureEffect {
  readonly kind: 'intake.backpressure';
  readonly effectId: string;
  readonly reason: 'event_limit' | 'queue_limit' | 'replay_limit';
}

/** Ordered effects that may be interpreted by production or simulation drivers. */
export type MeshPeerEffect =
  | MeshPrepareEffect
  | MeshDeliverEffect
  | MeshScheduleEffect
  | MeshEventEffect
  | MeshBackpressureEffect;

/** One synchronous peer state transition. */
export interface MeshPeerTransition {
  readonly state: MeshPeerState;
  readonly effects: readonly MeshPeerEffect[];
}

/** Production and simulation use the same reducer contract. */
export type MeshPeerReducer = (
  state: MeshPeerState,
  input: MeshPeerInput,
  logicalTime: MeshLogicalTime
) => MeshPeerTransition;

/** Synchronous local authority policy evaluated after signature verification. */
export interface MeshAdmissionPolicy {
  isPeerAdmitted(input: {
    localPeer: MeshPeerIdentity;
    senderPeerId: string;
    senderInstanceId: string;
    messageType: MeshMessageType;
  }): boolean;
}

/** Stable inbound rejection reasons safe for redacted telemetry. */
export type MeshInboundRejectionCode =
  | MeshCryptoRejectionCode
  | 'scope_mismatch'
  | 'audience_mismatch'
  | 'message_expired'
  | 'message_from_future'
  | 'logical_time_regressed'
  | 'unknown_critical_extension'
  | 'peer_not_running'
  | 'sender_not_admitted'
  | 'sender_instance_not_admitted'
  | 'sender_admission_expired'
  | 'message_not_authorized'
  | 'causation_rejected'
  | 'message_replayed'
  | 'sequence_outside_window'
  | 'replay_capacity_exceeded'
  | 'unsupported_message_type';

/** Complete signed-envelope request for the reference inbound boundary. */
export interface MeshInboundRequest<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> {
  readonly envelope: SignedMeshEnvelope<TPayload>;
  readonly verifiedAt: string;
  readonly receivedAt: MeshLogicalTime;
  readonly verifier: MeshEnvelopeVerifier;
  readonly resolver: MeshKeyResolver;
  readonly cryptoPolicy: MeshCryptoPolicy;
  readonly admissionPolicy: MeshAdmissionPolicy;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
  readonly supportedCriticalExtensions?: readonly string[];
}

/** Result returned by the local acceptance and reducer boundary. */
export type MeshInboundDecision<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> =
  | {
      readonly accepted: true;
      readonly envelope: VerifiedMeshEnvelope<TPayload>;
      readonly state: MeshPeerState;
      readonly effects: readonly MeshPeerEffect[];
    }
  | {
      readonly accepted: false;
      readonly code: MeshInboundRejectionCode;
      readonly state: MeshPeerState;
      readonly effects: readonly [];
    };
