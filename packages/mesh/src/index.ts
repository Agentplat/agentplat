import type {
  MeshMessagePayload,
  MeshMessageType,
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

/** Replay window for one admitted peer and instance pair. */
export interface MeshReplayWindow {
  readonly highestSequence: number;
  /** Sequence offsets retained within the bounded replay window. */
  readonly seenOffsets: readonly number[];
}

/** Immutable state consumed and returned by a peer reducer. */
export interface MeshPeerState {
  readonly identity: MeshPeerIdentity;
  readonly status: 'created' | 'running' | 'stopped';
  readonly peers: Readonly<Record<string, MeshPeerView>>;
  readonly replay: Readonly<Record<string, MeshReplayWindow>>;
  readonly localEventSequence: number;
}

declare const acceptedMeshMessageBrand: unique symbol;

/**
 * A verified message that has also passed local scope, admission, authority and
 * replay policy. Only the inbound acceptance boundary may construct it.
 */
export type AcceptedMeshMessage<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = Readonly<{
  envelope: VerifiedMeshEnvelope<TPayload>;
  receivedAt: MeshLogicalTime;
  [acceptedMeshMessageBrand]: true;
}>;

/** Starts an already configured peer without reading a clock or transport. */
export interface MeshPeerStartInput {
  readonly kind: 'peer.start';
}

/** Stops local scheduling without changing remote identity history. */
export interface MeshPeerStopInput {
  readonly kind: 'peer.stop';
  readonly reason: 'requested' | 'resource_limit' | 'policy';
}

/** Delivers one fully accepted message to the domain reducer. */
export interface MeshAcceptedMessageInput {
  readonly kind: 'message.accepted';
  readonly message: AcceptedMeshMessage;
}

/** Returns one interpreted effect result to the pure reducer. */
export interface MeshEffectResultInput {
  readonly kind: 'effect.result';
  readonly effectId: string;
  readonly status: 'succeeded' | 'failed';
  readonly errorCode?: string;
}

/** Every input accepted by the initial peer kernel. */
export type MeshPeerInput =
  | MeshPeerStartInput
  | MeshPeerStopInput
  | MeshAcceptedMessageInput
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

/** Requests that a driver serialize, sign and deliver one direct message. */
export interface MeshSendEffect {
  readonly kind: 'message.send';
  readonly effectId: string;
  readonly intent: MeshOutboundIntent;
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
  | MeshSendEffect
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
  | 'scope_mismatch'
  | 'audience_mismatch'
  | 'message_expired'
  | 'sender_not_admitted'
  | 'sender_instance_not_admitted'
  | 'message_not_authorized'
  | 'message_replayed'
  | 'sequence_outside_window'
  | 'unsupported_message_type';

/** Result returned before and after the local acceptance boundary. */
export type MeshInboundDecision<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> =
  | {
      readonly accepted: true;
      readonly message: AcceptedMeshMessage<TPayload>;
      readonly state: MeshPeerState;
    }
  | {
      readonly accepted: false;
      readonly code: MeshInboundRejectionCode;
      readonly state: MeshPeerState;
    };
