import type { VerifiedMeshEnvelope } from '@agentplat/mesh-protocol';

import type {
  MeshEffectResultInput,
  MeshEventEffect,
  MeshPeerEffect,
  MeshPeerInput,
  MeshPeerState,
  MeshPeerTransition,
  MeshPeerView,
  MeshPendingPing,
  MeshPendingPreparation,
} from './contracts.js';
import {
  assertMeshLogicalTime,
  assertMeshMessageId,
  createFrozenRecord,
  freezePeerState,
  recordEntries,
} from './state.js';

const emptyEffects = Object.freeze([]) as readonly MeshPeerEffect[];
const pingLifetimeMs = 30_000;

/** Pure Alpha 1 peer reducer shared by direct and simulation drivers. */
export function reduceMeshPeer(
  state: MeshPeerState,
  input: MeshPeerInput,
  logicalTime: number
): MeshPeerTransition {
  assertReducerInput(state, input, logicalTime);

  switch (input.kind) {
    case 'peer.start':
      return reduceStart(state, logicalTime);
    case 'peer.stop':
      return reduceStop(state, logicalTime, input.reason);
    case 'peer.ping':
      return reducePingRequest(state, input.peerId, logicalTime);
    case 'effect.result':
      return reduceEffectResult(state, input, logicalTime);
    default:
      throw new TypeError('Unsupported Mesh reducer input');
  }
}

/**
 * Package-internal accepted-message transition. The public package entrypoint
 * does not expose this function or an input that can invoke it.
 */
export function reduceAcceptedMeshEnvelope(
  state: MeshPeerState,
  envelope: VerifiedMeshEnvelope,
  logicalTime: number
): MeshPeerTransition {
  assertReducerState(state, logicalTime);
  if (state.status !== 'running') {
    throw new TypeError('Accepted Mesh envelope requires a running peer');
  }
  const admission = state.admittedPeers[envelope.sender.peerId];
  if (!admission) {
    throw new TypeError('Accepted Mesh sender lacks local admission state');
  }

  const previous = state.peers[envelope.sender.peerId];
  const status =
    envelope.type === 'peer.ping_ack'
      ? 'responsive'
      : envelope.type === 'peer.hello' || envelope.type === 'peer.ping'
        ? 'observed'
        : (previous?.status ?? 'admitted');
  const peerView = Object.freeze<MeshPeerView>({
    peerId: envelope.sender.peerId,
    instanceId: envelope.sender.instanceId,
    peerCardId: admission.peerCardId,
    cardRevision: admission.cardRevision,
    status,
    ...(previous?.lastObservedAt === undefined
      ? {}
      : { lastObservedAt: previous.lastObservedAt }),
    ...(previous?.lastResponsiveAt === undefined
      ? {}
      : { lastResponsiveAt: previous.lastResponsiveAt }),
    ...(envelope.type === 'peer.hello' || envelope.type === 'peer.ping'
      ? { lastObservedAt: logicalTime }
      : {}),
    ...(envelope.type === 'peer.ping_ack'
      ? { lastResponsiveAt: logicalTime }
      : {}),
  });
  const peers = createFrozenRecord<MeshPeerView>([
    ...recordEntries(state.peers).filter(
      ([peerId]) => peerId !== peerView.peerId
    ),
    [peerView.peerId, peerView],
  ]);
  const activePreparations = activePreparationEntries(state, logicalTime);
  const sequence = nextEventSequence(state);

  if (envelope.type !== 'peer.ping') {
    const nextState = freezePeerState({
      ...state,
      peers,
      pendingPreparations:
        activePreparations.length ===
        Object.keys(state.pendingPreparations).length
          ? state.pendingPreparations
          : createFrozenRecord(activePreparations),
      localEventSequence: sequence,
      lastLogicalTime: logicalTime,
    });
    return transition(nextState, [
      acceptedEvent(nextState, sequence, 0, envelope, logicalTime),
    ]);
  }

  if (activePreparations.length >= state.limits.maximumPendingPings) {
    const nextState = freezePeerState({
      ...state,
      peers,
      pendingPreparations: createFrozenRecord(activePreparations),
      localEventSequence: sequence,
      lastLogicalTime: logicalTime,
    });
    return transition(nextState, [
      Object.freeze({
        kind: 'intake.backpressure',
        effectId: effectId(nextState, sequence, 0),
        reason: 'queue_limit',
      }),
      acceptedEvent(nextState, sequence, 1, envelope, logicalTime),
    ]);
  }

  const preparationEffectId = effectId(state, sequence, 0);
  const preparation = createPreparation(
    preparationEffectId,
    'peer.ping_ack',
    envelope.sender.peerId,
    pingLifetimeMs,
    logicalTime
  );
  const nextState = freezePeerState({
    ...state,
    peers,
    pendingPreparations: createFrozenRecord([
      ...activePreparations,
      [preparationEffectId, preparation],
    ]),
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  return transition(nextState, [
    Object.freeze({
      kind: 'message.prepare',
      effectId: preparationEffectId,
      intent: Object.freeze({
        type: 'peer.ping_ack',
        audiencePeerId: envelope.sender.peerId,
        payload: Object.freeze({ type: 'peer.ping_ack' }),
        causationId: envelope.messageId,
        correlationId: envelope.correlationId ?? envelope.messageId,
        maximumLifetimeMs: pingLifetimeMs,
      }),
    }),
    acceptedEvent(nextState, sequence, 1, envelope, logicalTime),
  ]);
}

function reduceStart(
  state: MeshPeerState,
  logicalTime: number
): MeshPeerTransition {
  if (state.status !== 'created') return unchangedAt(state, logicalTime);
  const sequence = nextEventSequence(state);
  const nextState = freezePeerState({
    ...state,
    status: 'running',
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  return transition(nextState, [
    eventEffect(nextState, sequence, 0, {
      type: 'mesh.peer.started',
      peerId: state.identity.peerId,
      occurredAt: logicalTime,
    }),
  ]);
}

function reduceStop(
  state: MeshPeerState,
  logicalTime: number,
  reasonCode: string
): MeshPeerTransition {
  if (state.status === 'stopped') return unchangedAt(state, logicalTime);
  const sequence = nextEventSequence(state);
  const nextState = freezePeerState({
    ...state,
    status: 'stopped',
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  return transition(nextState, [
    eventEffect(nextState, sequence, 0, {
      type: 'mesh.peer.stopped',
      peerId: state.identity.peerId,
      occurredAt: logicalTime,
      reasonCode,
    }),
  ]);
}

function reducePingRequest(
  state: MeshPeerState,
  peerId: string,
  logicalTime: number
): MeshPeerTransition {
  if (state.status !== 'running') return unchangedAt(state, logicalTime);
  if (typeof peerId !== 'string' || !state.admittedPeers[peerId]) {
    throw new TypeError('Mesh ping target is not admitted');
  }
  const activePings = activePingEntries(state, logicalTime);
  const activePreparations = activePreparationEntries(state, logicalTime);
  const reservedPings = activePreparations.filter(
    ([, preparation]) => preparation.type === 'peer.ping'
  ).length;
  const sequence = nextEventSequence(state);
  if (
    activePings.length + reservedPings >=
      state.limits.maximumPendingPings ||
    activePreparations.length >= state.limits.maximumPendingPings
  ) {
    const nextState = freezePeerState({
      ...state,
      pendingPings: createFrozenRecord(activePings),
      pendingPreparations: createFrozenRecord(activePreparations),
      localEventSequence: sequence,
      lastLogicalTime: logicalTime,
    });
    return transition(nextState, [
      Object.freeze({
        kind: 'intake.backpressure',
        effectId: effectId(nextState, sequence, 0),
        reason: 'queue_limit',
      }),
    ]);
  }

  const preparationEffectId = effectId(state, sequence, 0);
  const preparation = createPreparation(
    preparationEffectId,
    'peer.ping',
    peerId,
    pingLifetimeMs,
    logicalTime
  );
  const nextState = freezePeerState({
    ...state,
    pendingPings: createFrozenRecord(activePings),
    pendingPreparations: createFrozenRecord([
      ...activePreparations,
      [preparationEffectId, preparation],
    ]),
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  return transition(nextState, [
    Object.freeze({
      kind: 'message.prepare',
      effectId: preparationEffectId,
      intent: Object.freeze({
        type: 'peer.ping',
        audiencePeerId: peerId,
        payload: Object.freeze({ type: 'peer.ping' }),
        maximumLifetimeMs: pingLifetimeMs,
      }),
    }),
    eventEffect(nextState, sequence, 1, {
      type: 'mesh.ping.preparation_requested',
      peerId,
      messageType: 'peer.ping',
      occurredAt: logicalTime,
    }),
  ]);
}

function reduceEffectResult(
  state: MeshPeerState,
  input: MeshEffectResultInput,
  logicalTime: number
): MeshPeerTransition {
  if (typeof input.effectId !== 'string') {
    throw new TypeError('Invalid Mesh effect result');
  }
  const expected = state.pendingPreparations[input.effectId];
  if (!expected) {
    throw new TypeError('Unsolicited Mesh preparation result');
  }
  const remainingPreparations = recordEntries(state.pendingPreparations).filter(
    ([effectId]) =>
      effectId !== input.effectId &&
      state.pendingPreparations[effectId].prepareBy > logicalTime
  );
  const sequence = nextEventSequence(state);

  if (input.status === 'failed' || expected.prepareBy <= logicalTime) {
    const nextState = freezePeerState({
      ...state,
      pendingPreparations: createFrozenRecord(remainingPreparations),
      localEventSequence: sequence,
      lastLogicalTime: logicalTime,
    });
    return transition(nextState, [
      eventEffect(nextState, sequence, 0, {
        type: 'mesh.message.preparation_failed',
        peerId: expected.audiencePeerId,
        messageType: expected.type,
        occurredAt: logicalTime,
        reasonCode:
          expected.prepareBy <= logicalTime
            ? 'preparation_expired'
            : 'preparation_failed',
      }),
    ]);
  }
  if (input.status !== 'succeeded' || !input.preparedMessage) {
    throw new TypeError('Invalid Mesh preparation result');
  }

  const prepared = input.preparedMessage;
  assertMeshMessageId(prepared.messageId);
  if (
    prepared.type !== expected.type ||
    prepared.audiencePeerId !== expected.audiencePeerId ||
    !Number.isSafeInteger(prepared.expiresAt) ||
    prepared.expiresAt <= logicalTime ||
    prepared.expiresAt - logicalTime > expected.maximumLifetimeMs
  ) {
    throw new TypeError('Mesh preparation result does not match its effect');
  }

  const activePings = activePingEntries(state, logicalTime);
  let pendingPings = createFrozenRecord(activePings);
  if (expected.type === 'peer.ping') {
    if (state.pendingPings[prepared.messageId]) {
      throw new TypeError('Duplicate prepared Mesh ping messageId');
    }
    if (activePings.length >= state.limits.maximumPendingPings) {
      throw new RangeError('Mesh pending ping limit exceeded');
    }
    const pending = Object.freeze<MeshPendingPing>({
      messageId: prepared.messageId,
      peerId: prepared.audiencePeerId,
      expiresAt: prepared.expiresAt,
    });
    pendingPings = createFrozenRecord([
      ...activePings,
      [pending.messageId, pending],
    ]);
  }

  const nextState = freezePeerState({
    ...state,
    pendingPings,
    pendingPreparations: createFrozenRecord(remainingPreparations),
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  return transition(nextState, [
    Object.freeze({
      kind: 'message.deliver',
      effectId: effectId(nextState, sequence, 0),
      preparationEffectId: input.effectId,
      messageId: prepared.messageId,
      audiencePeerId: prepared.audiencePeerId,
    }),
    eventEffect(nextState, sequence, 1, {
      type: 'mesh.message.prepared',
      peerId: prepared.audiencePeerId,
      messageType: prepared.type,
      messageId: prepared.messageId,
      occurredAt: logicalTime,
    }),
  ]);
}

function acceptedEvent(
  state: MeshPeerState,
  sequence: number,
  index: number,
  envelope: VerifiedMeshEnvelope,
  logicalTime: number
): MeshEventEffect {
  return eventEffect(state, sequence, index, {
    type: 'mesh.message.accepted',
    peerId: envelope.sender.peerId,
    messageType: envelope.type,
    messageId: envelope.messageId,
    occurredAt: logicalTime,
  });
}

function createPreparation(
  preparationEffectId: string,
  type: 'peer.ping' | 'peer.ping_ack',
  audiencePeerId: string,
  maximumLifetimeMs: number,
  logicalTime: number
): MeshPendingPreparation {
  if (logicalTime > Number.MAX_SAFE_INTEGER - maximumLifetimeMs) {
    throw new RangeError('Mesh logical time cannot represent preparation TTL');
  }
  return Object.freeze({
    effectId: preparationEffectId,
    type,
    audiencePeerId,
    maximumLifetimeMs,
    prepareBy: logicalTime + maximumLifetimeMs,
  });
}

function activePingEntries(
  state: MeshPeerState,
  logicalTime: number
): readonly (readonly [string, MeshPendingPing])[] {
  return recordEntries(state.pendingPings).filter(
    ([, ping]) => ping.expiresAt > logicalTime
  );
}

function activePreparationEntries(
  state: MeshPeerState,
  logicalTime: number
): readonly (readonly [string, MeshPendingPreparation])[] {
  return recordEntries(state.pendingPreparations).filter(
    ([, preparation]) => preparation.prepareBy > logicalTime
  );
}

function assertReducerInput(
  state: MeshPeerState,
  input: MeshPeerInput,
  logicalTime: number
): void {
  assertReducerState(state, logicalTime);
  if (!input || typeof input !== 'object') {
    throw new TypeError('Mesh reducer input is required');
  }
}

function assertReducerState(state: MeshPeerState, logicalTime: number): void {
  assertMeshLogicalTime(logicalTime);
  if (!state || typeof state !== 'object') {
    throw new TypeError('Mesh reducer state is required');
  }
  if (
    !Number.isSafeInteger(state.lastLogicalTime) ||
    logicalTime < state.lastLogicalTime
  ) {
    throw new RangeError('Mesh logical time cannot move backwards');
  }
}

function nextEventSequence(state: MeshPeerState): number {
  if (
    !Number.isSafeInteger(state.localEventSequence) ||
    state.localEventSequence < 0 ||
    state.localEventSequence >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError('Mesh local event sequence exhausted');
  }
  return state.localEventSequence + 1;
}

function eventEffect(
  state: MeshPeerState,
  sequence: number,
  index: number,
  event: MeshEventEffect['event']
): MeshEventEffect {
  return Object.freeze({
    kind: 'event.emit',
    effectId: effectId(state, sequence, index),
    event: Object.freeze(event),
  });
}

function effectId(
  state: MeshPeerState,
  sequence: number,
  index: number
): string {
  return `mesh:${state.identity.peerId}:${sequence}:${index}`;
}

function unchangedAt(
  state: MeshPeerState,
  logicalTime: number
): MeshPeerTransition {
  if (state.lastLogicalTime === logicalTime) {
    return Object.freeze({ state, effects: emptyEffects });
  }
  return Object.freeze({
    state: freezePeerState({ ...state, lastLogicalTime: logicalTime }),
    effects: emptyEffects,
  });
}

function transition(
  state: MeshPeerState,
  effects: readonly MeshPeerEffect[]
): MeshPeerTransition {
  return Object.freeze({
    state,
    effects: Object.freeze(effects),
  });
}
