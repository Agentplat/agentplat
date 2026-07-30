import {
  compareMeshTimestamps,
  validateMeshEnvelopeContext,
  type MeshMessagePayload,
  type VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';

import type {
  MeshAdmissionPolicy,
  MeshInboundDecision,
  MeshInboundRejectionCode,
  MeshInboundRequest,
  MeshLogicalTime,
  MeshPeerEffect,
  MeshPeerState,
  MeshReplayWindow,
} from './contracts.js';
import { reduceAcceptedMeshEnvelope } from './reducer.js';
import {
  DEFAULT_MESH_PEER_LIMITS,
  assertMeshLogicalTime,
  assertMeshMessageId,
  createFrozenRecord,
  freezePeerState,
  recordEntries,
} from './state.js';

const emptyEffects = Object.freeze([]) as readonly [];

/** Additional policy hook that cannot override preprovisioned admission state. */
export const ALLOW_PREPROVISIONED_MESH_ADMISSION: Readonly<MeshAdmissionPolicy> =
  Object.freeze({
    isPeerAdmitted: () => true,
  });

/** Verifies one signed envelope before entering the synchronous local boundary. */
export async function processMeshEnvelope<TPayload extends MeshMessagePayload>(
  state: MeshPeerState,
  request: MeshInboundRequest<TPayload>
): Promise<MeshInboundDecision<TPayload>> {
  assertFrozenSecurityState(state);
  if (!request || typeof request !== 'object') {
    throw new TypeError('Mesh inbound request is required');
  }
  if (state.status !== 'running') {
    return rejection(state, 'peer_not_running');
  }
  const envelope = request.envelope;
  const verifiedAt = request.verifiedAt;
  const receivedAt = request.receivedAt;
  const verifier = request.verifier;
  const resolver = request.resolver;
  const cryptoPolicy = Object.freeze({
    allowedAlgorithms: Object.freeze([
      ...request.cryptoPolicy.allowedAlgorithms,
    ]),
  });
  const admissionPolicy = request.admissionPolicy;
  const crypto = request.crypto;
  const protocolOptions =
    request.protocolOptions === undefined
      ? undefined
      : Object.freeze({
          ...(request.protocolOptions.limits === undefined
            ? {}
            : {
                limits: Object.freeze({
                  ...request.protocolOptions.limits,
                }),
              }),
        });
  const supportedCriticalExtensions =
    request.supportedCriticalExtensions === undefined
      ? undefined
      : Object.freeze([...request.supportedCriticalExtensions]);
  assertMeshLogicalTime(receivedAt);
  if (receivedAt < state.lastLogicalTime) {
    return rejection(state, 'logical_time_regressed');
  }

  const context = validateMeshEnvelopeContext(
    envelope,
    {
      tenantId: state.identity.tenantId,
      meshId: state.identity.meshId,
      peerId: state.identity.peerId,
      receivedAt: verifiedAt,
      ...(supportedCriticalExtensions === undefined
        ? {}
        : { supportedCriticalExtensions }),
    },
    protocolOptions
  );
  if (!context.ok) {
    return rejection(state, contextRejection(context.issues[0]?.code));
  }
  if (
    context.value.audience.kind !== 'peer' ||
    context.value.audience.peerId !== state.identity.peerId
  ) {
    return rejection(state, 'audience_mismatch');
  }

  let verification;
  try {
    verification = await verifier.verify({
      envelope: context.value as typeof envelope,
      resolver,
      policy: cryptoPolicy,
      verifiedAt,
      crypto,
      protocolOptions,
    });
  } catch {
    return rejection(state, 'crypto_operation_failed');
  }
  try {
    if (
      !verification ||
      typeof verification !== 'object' ||
      verification.verified !== true
    ) {
      return rejection(
        state,
        verification?.verified === false
          ? verification.code
          : 'crypto_operation_failed'
      );
    }
  } catch {
    return rejection(state, 'crypto_operation_failed');
  }
  return processVerifiedMeshEnvelope(state, {
    envelope: verification.envelope as VerifiedMeshEnvelope<TPayload>,
    verifiedAt,
    receivedAt,
    admissionPolicy,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions }),
  });
}

/**
 * Applies scope, admission, replay, idempotency and causality before invoking
 * the reducer exactly once.
 */
function processVerifiedMeshEnvelope<TPayload extends MeshMessagePayload>(
  state: MeshPeerState,
  request: {
    readonly envelope: VerifiedMeshEnvelope<TPayload>;
    readonly verifiedAt: string;
    readonly receivedAt: MeshLogicalTime;
    readonly admissionPolicy: MeshAdmissionPolicy;
    readonly supportedCriticalExtensions?: readonly string[];
  }
): MeshInboundDecision<TPayload> {
  assertFrozenSecurityState(state);
  if (!request || typeof request !== 'object') {
    throw new TypeError('Verified Mesh inbound request is required');
  }
  const envelope = request.envelope;
  const verifiedAt = request.verifiedAt;
  const receivedAt = request.receivedAt;
  const admissionPolicy = request.admissionPolicy;
  const supportedCriticalExtensions =
    request.supportedCriticalExtensions === undefined
      ? undefined
      : Object.freeze([...request.supportedCriticalExtensions]);
  assertMeshLogicalTime(receivedAt);
  if (receivedAt < state.lastLogicalTime) {
    return rejection(state, 'logical_time_regressed');
  }

  if (state.status !== 'running') {
    return rejection(state, 'peer_not_running');
  }
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: state.identity.tenantId,
    meshId: state.identity.meshId,
    peerId: state.identity.peerId,
    receivedAt: verifiedAt,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions }),
  });
  if (!context.ok) {
    return rejection(state, contextRejection(context.issues[0]?.code));
  }
  const contextualEnvelope = context.value as VerifiedMeshEnvelope<TPayload>;
  if (
    contextualEnvelope.audience.kind !== 'peer' ||
    contextualEnvelope.audience.peerId !== state.identity.peerId
  ) {
    return rejection(state, 'audience_mismatch');
  }

  const admission = state.admittedPeers[contextualEnvelope.sender.peerId];
  if (!admission) return rejection(state, 'sender_not_admitted');
  if (!admission.instanceIds.includes(contextualEnvelope.sender.instanceId)) {
    return rejection(state, 'sender_instance_not_admitted');
  }
  const admissionExpiry = compareMeshTimestamps(
    verifiedAt,
    admission.validUntil
  );
  if (!admissionExpiry.ok || admissionExpiry.value >= 0) {
    return rejection(state, 'sender_admission_expired');
  }
  let policyAccepted = false;
  try {
    policyAccepted =
      admissionPolicy.isPeerAdmitted({
        localPeer: state.identity,
        senderPeerId: contextualEnvelope.sender.peerId,
        senderInstanceId: contextualEnvelope.sender.instanceId,
        messageType: contextualEnvelope.type,
      }) === true;
  } catch {
    policyAccepted = false;
  }
  if (!policyAccepted) return rejection(state, 'message_not_authorized');

  const authorityFailure = validateMessageAuthority(state, contextualEnvelope);
  if (authorityFailure) return rejection(state, authorityFailure);

  const replay = advanceReplayState(state, contextualEnvelope, receivedAt);
  if ('code' in replay) return rejection(state, replay.code);
  const causalityFailure = validateCausality(
    state,
    contextualEnvelope,
    receivedAt
  );
  if (causalityFailure) return rejection(state, causalityFailure);
  const acceptedState = consumeCausation(replay.state, contextualEnvelope);
  const transition = reduceAcceptedMeshEnvelope(
    acceptedState,
    contextualEnvelope,
    receivedAt
  );
  const effects = freezeEffects(transition.effects);
  return Object.freeze({
    accepted: true,
    envelope: contextualEnvelope,
    state: transition.state,
    effects,
  });
}

function validateMessageAuthority(
  state: MeshPeerState,
  envelope: VerifiedMeshEnvelope
): MeshInboundRejectionCode | undefined {
  const admission = state.admittedPeers[envelope.sender.peerId];
  switch (envelope.payload.type) {
    case 'peer.hello':
      return envelope.payload.peerCardId !== admission.peerCardId ||
        envelope.payload.cardRevision !== admission.cardRevision ||
        envelope.causationId !== admission.acceptedCardMessageId
        ? 'message_not_authorized'
        : undefined;
    case 'peer.ping':
      return envelope.causationId === undefined
        ? undefined
        : 'message_not_authorized';
    case 'peer.ping_ack':
      return undefined;
    default:
      return 'unsupported_message_type';
  }
}

function advanceReplayState(
  state: MeshPeerState,
  envelope: VerifiedMeshEnvelope,
  receivedAt: MeshLogicalTime
):
  | { readonly state: MeshPeerState }
  | { readonly code: MeshInboundRejectionCode } {
  const retainedIds = recordEntries(state.messageIds).filter(
    ([, expiresAt]) => expiresAt > receivedAt
  );
  if (retainedIds.some(([messageId]) => messageId === envelope.messageId)) {
    return { code: 'message_replayed' };
  }
  if (retainedIds.length >= state.limits.maximumTrackedMessageIds) {
    return { code: 'replay_capacity_exceeded' };
  }
  if (
    receivedAt >
    Number.MAX_SAFE_INTEGER - state.limits.messageIdRetentionMs
  ) {
    return { code: 'replay_capacity_exceeded' };
  }

  const replayKey = JSON.stringify([
    envelope.sender.peerId,
    envelope.sender.instanceId,
  ]);
  const current = state.replay[replayKey];
  let nextWindow: MeshReplayWindow;
  if (!current) {
    nextWindow = Object.freeze({
      highestSequence: envelope.sequence,
      seenOffsets: Object.freeze([0]),
    });
  } else if (envelope.sequence > current.highestSequence) {
    const advance = envelope.sequence - current.highestSequence;
    nextWindow = Object.freeze({
      highestSequence: envelope.sequence,
      seenOffsets: Object.freeze([
        0,
        ...current.seenOffsets
          .map((offset) => offset + advance)
          .filter((offset) => offset < state.limits.replayWindowSize),
      ]),
    });
  } else {
    const offset = current.highestSequence - envelope.sequence;
    if (offset >= state.limits.replayWindowSize) {
      return { code: 'sequence_outside_window' };
    }
    if (current.seenOffsets.includes(offset)) {
      return { code: 'message_replayed' };
    }
    nextWindow = Object.freeze({
      highestSequence: current.highestSequence,
      seenOffsets: Object.freeze(
        [...current.seenOffsets, offset].sort((left, right) => left - right)
      ),
    });
  }

  const replay = createFrozenRecord<MeshReplayWindow>([
    ...recordEntries(state.replay).filter(([key]) => key !== replayKey),
    [replayKey, nextWindow],
  ]);
  const messageIds = createFrozenRecord<MeshLogicalTime>([
    ...retainedIds,
    [envelope.messageId, receivedAt + state.limits.messageIdRetentionMs],
  ]);
  const activePings = recordEntries(state.pendingPings).filter(
    ([, ping]) => ping.expiresAt > receivedAt
  );
  const pendingPings = createFrozenRecord(activePings);
  const pendingPreparations = createFrozenRecord(
    recordEntries(state.pendingPreparations).filter(
      ([, preparation]) => preparation.prepareBy > receivedAt
    )
  );
  return {
    state: freezePeerState({
      ...state,
      replay,
      messageIds,
      pendingPings,
      pendingPreparations,
      lastLogicalTime: receivedAt,
    }),
  };
}

function validateCausality(
  state: MeshPeerState,
  envelope: VerifiedMeshEnvelope,
  receivedAt: MeshLogicalTime
): MeshInboundRejectionCode | undefined {
  if (envelope.type !== 'peer.ping_ack') return undefined;
  const causationId = envelope.causationId;
  const pending =
    causationId === undefined ? undefined : state.pendingPings[causationId];
  return !pending ||
    pending.peerId !== envelope.sender.peerId ||
    pending.expiresAt <= receivedAt
    ? 'causation_rejected'
    : undefined;
}

function consumeCausation(
  state: MeshPeerState,
  envelope: VerifiedMeshEnvelope
): MeshPeerState {
  if (envelope.type !== 'peer.ping_ack') return state;
  return freezePeerState({
    ...state,
    pendingPings: createFrozenRecord(
      recordEntries(state.pendingPings).filter(
        ([messageId]) => messageId !== envelope.causationId
      )
    ),
  });
}

function freezeEffects(
  effects: readonly MeshPeerEffect[]
): readonly MeshPeerEffect[] {
  if (!Array.isArray(effects)) {
    throw new TypeError('Mesh reducer returned invalid effects');
  }
  return Object.freeze(
    effects.map((effect) => {
      switch (effect.kind) {
        case 'message.prepare':
          return Object.freeze({
            ...effect,
            intent: Object.freeze({
              ...effect.intent,
              payload: Object.freeze({ ...effect.intent.payload }),
            }),
          });
        case 'message.deliver':
        case 'timer.schedule':
        case 'intake.backpressure':
          return Object.freeze({ ...effect });
        case 'event.emit':
          return Object.freeze({
            ...effect,
            event: Object.freeze({ ...effect.event }),
          });
        default:
          throw new TypeError('Mesh reducer returned unknown effect');
      }
    })
  );
}

function assertFrozenSecurityState(state: MeshPeerState): void {
  if (
    !state ||
    typeof state !== 'object' ||
    !Object.isFrozen(state) ||
    !Object.isFrozen(state.identity) ||
    !Object.isFrozen(state.admittedPeers) ||
    !Object.isFrozen(state.replay) ||
    !Object.isFrozen(state.messageIds) ||
    !Object.isFrozen(state.pendingPings) ||
    !Object.isFrozen(state.pendingPreparations) ||
    !Object.isFrozen(state.limits) ||
    !Object.isFrozen(state.peers)
  ) {
    throw new TypeError('Mesh inbound state must be an immutable snapshot');
  }
  assertExactKeys(state, [
    'admittedPeers',
    'identity',
    'lastLogicalTime',
    'limits',
    'localEventSequence',
    'messageIds',
    'peers',
    'pendingPings',
    'pendingPreparations',
    'replay',
    'status',
  ]);
  if (
    (state.status !== 'created' &&
      state.status !== 'running' &&
      state.status !== 'stopped') ||
    !Number.isSafeInteger(state.localEventSequence) ||
    state.localEventSequence < 0 ||
    !Number.isSafeInteger(state.lastLogicalTime) ||
    state.lastLogicalTime < 0
  ) {
    throw new TypeError('Mesh inbound lifecycle state is invalid');
  }
  for (const record of [
    state.admittedPeers,
    state.peers,
    state.replay,
    state.messageIds,
    state.pendingPings,
    state.pendingPreparations,
  ]) {
    if (Object.getPrototypeOf(record) !== null) {
      throw new TypeError('Mesh inbound records must have null prototypes');
    }
  }
  for (const [name, value] of Object.entries(state.limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`Mesh inbound limit ${name} is invalid`);
    }
  }
  if (
    state.limits.maximumTrackedMessageIds <
      state.limits.replayWindowSize ||
    state.limits.messageIdRetentionMs <
      DEFAULT_MESH_PEER_LIMITS.messageIdRetentionMs
  ) {
    throw new TypeError('Mesh inbound limits weaken protocol bounds');
  }
  const admittedEntries = Object.entries(state.admittedPeers);
  const maximumReplayKeys = admittedEntries.reduce(
    (total, [, peer]) => total + peer.instanceIds.length,
    0
  );
  if (
    state.limits.replayWindowSize !==
      DEFAULT_MESH_PEER_LIMITS.replayWindowSize ||
    Object.keys(state.admittedPeers).length >
      state.limits.maximumAdmittedPeers ||
    Object.keys(state.messageIds).length >
      state.limits.maximumTrackedMessageIds ||
    Object.keys(state.pendingPings).length > state.limits.maximumPendingPings ||
    Object.keys(state.pendingPreparations).length >
      state.limits.maximumPendingPings ||
    Object.keys(state.peers).length > admittedEntries.length ||
    Object.keys(state.replay).length > maximumReplayKeys
  ) {
    throw new TypeError('Mesh inbound state exceeds configured bounds');
  }
  for (const [peerId, peer] of admittedEntries) {
    if (
      !Object.isFrozen(peer) ||
      !Object.isFrozen(peer.instanceIds) ||
      peer.peerId !== peerId ||
      peer.instanceIds.length < 1 ||
      peer.instanceIds.length > state.limits.maximumInstancesPerPeer ||
      new Set(peer.instanceIds).size !== peer.instanceIds.length
    ) {
      throw new TypeError('Mesh admission state must be deeply immutable');
    }
  }
  for (const [peerId, view] of Object.entries(state.peers)) {
    const admission = state.admittedPeers[peerId];
    if (
      !Object.isFrozen(view) ||
      !admission ||
      view.peerId !== peerId ||
      !admission.instanceIds.includes(view.instanceId) ||
      view.peerCardId !== admission.peerCardId ||
      view.cardRevision !== admission.cardRevision ||
      (view.lastObservedAt !== undefined &&
        (!Number.isSafeInteger(view.lastObservedAt) ||
          view.lastObservedAt < 0 ||
          view.lastObservedAt > state.lastLogicalTime)) ||
      (view.lastResponsiveAt !== undefined &&
        (!Number.isSafeInteger(view.lastResponsiveAt) ||
          view.lastResponsiveAt < 0 ||
          view.lastResponsiveAt > state.lastLogicalTime))
    ) {
      throw new TypeError('Mesh peer views must be deeply immutable');
    }
  }
  for (const [key, window] of Object.entries(state.replay)) {
    let replayPeerId: string | undefined;
    let replayInstanceId: string | undefined;
    try {
      const parsed = JSON.parse(key) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length === 2 &&
        typeof parsed[0] === 'string' &&
        typeof parsed[1] === 'string' &&
        key === JSON.stringify(parsed)
      ) {
        [replayPeerId, replayInstanceId] = parsed;
      }
    } catch {
      // Rejected by the canonical checks below.
    }
    const replayAdmission =
      replayPeerId === undefined
        ? undefined
        : state.admittedPeers[replayPeerId];
    if (
      !replayAdmission ||
      replayInstanceId === undefined ||
      !replayAdmission.instanceIds.includes(replayInstanceId) ||
      !Object.isFrozen(window) ||
      !Object.isFrozen(window.seenOffsets) ||
      !Number.isSafeInteger(window.highestSequence) ||
      window.highestSequence < 1 ||
      window.seenOffsets.length < 1 ||
      window.seenOffsets[0] !== 0 ||
      window.seenOffsets.some(
        (offset, index) =>
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          offset >= state.limits.replayWindowSize ||
          (index > 0 && offset <= window.seenOffsets[index - 1])
      )
    ) {
      throw new TypeError('Mesh replay state is not canonical');
    }
  }
  for (const [messageId, expiresAt] of Object.entries(state.messageIds)) {
    try {
      assertMeshMessageId(messageId);
    } catch {
      throw new TypeError('Mesh message ID state is invalid');
    }
    if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) {
      throw new TypeError('Mesh message ID state is invalid');
    }
  }
  for (const [messageId, ping] of Object.entries(state.pendingPings)) {
    try {
      assertMeshMessageId(messageId);
    } catch {
      throw new TypeError('Mesh pending ping state is invalid');
    }
    if (
      !Object.isFrozen(ping) ||
      ping.messageId !== messageId ||
      !state.admittedPeers[ping.peerId] ||
      !Number.isSafeInteger(ping.expiresAt) ||
      ping.expiresAt < 0
    ) {
      throw new TypeError('Mesh pending ping state is invalid');
    }
  }
  for (const [effectId, preparation] of Object.entries(
    state.pendingPreparations
  )) {
    if (
      !Object.isFrozen(preparation) ||
      preparation.effectId !== effectId ||
      (preparation.type !== 'peer.ping' &&
        preparation.type !== 'peer.ping_ack') ||
      !state.admittedPeers[preparation.audiencePeerId] ||
      preparation.maximumLifetimeMs !== 30_000 ||
      !Number.isSafeInteger(preparation.prepareBy) ||
      preparation.prepareBy < 0
    ) {
      throw new TypeError('Mesh pending preparation state is invalid');
    }
  }
}

function assertExactKeys(
  value: object,
  expectedKeys: readonly string[]
): void {
  const actualKeys = Object.keys(value).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError('Mesh inbound state contains unsupported fields');
  }
}

function contextRejection(code: string | undefined): MeshInboundRejectionCode {
  switch (code) {
    case 'scope_mismatch':
    case 'audience_mismatch':
    case 'invalid_audience':
    case 'message_expired':
    case 'message_from_future':
    case 'unknown_critical_extension':
    case 'unsupported_message_type':
      return code === 'invalid_audience' ? 'audience_mismatch' : code;
    default:
      return 'invalid_envelope';
  }
}

function rejection<TPayload extends MeshMessagePayload>(
  state: MeshPeerState,
  code: MeshInboundRejectionCode
): MeshInboundDecision<TPayload> {
  return Object.freeze({
    accepted: false,
    code,
    state,
    effects: emptyEffects,
  });
}
