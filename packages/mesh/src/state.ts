import {
  DEFAULT_MESH_PROTOCOL_LIMITS,
  compareMeshTimestamps,
} from '@agentplat/mesh-protocol';

import type {
  MeshAdmittedPeer,
  MeshLogicalTime,
  MeshPeerIdentity,
  MeshPeerLimits,
  MeshPendingPreparation,
  MeshPendingPing,
  MeshPeerState,
  MeshPeerStateOptions,
  MeshPeerView,
  MeshReplayWindow,
} from './contracts.js';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const messageIdPattern = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const utf8Encoder = new TextEncoder();

/** Protocol-conformant and locally bounded Alpha 1 peer limits. */
export const DEFAULT_MESH_PEER_LIMITS: Readonly<MeshPeerLimits> = Object.freeze(
  {
    replayWindowSize: DEFAULT_MESH_PROTOCOL_LIMITS.replayWindowSize,
    maximumTrackedMessageIds: 16_384,
    messageIdRetentionMs:
      DEFAULT_MESH_PROTOCOL_LIMITS.maximumLifetimeMs +
      2 * DEFAULT_MESH_PROTOCOL_LIMITS.clockSkewAllowanceMs,
    maximumAdmittedPeers: 256,
    maximumInstancesPerPeer: 16,
    maximumPendingPings: 1_024,
  }
);

/** Constructs a deeply immutable, preprovisioned local peer state. */
export function createMeshPeerState(
  options: MeshPeerStateOptions
): MeshPeerState {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Mesh peer state options are required');
  }
  const limits = resolvePeerLimits(options.limits);
  const identity = freezeIdentity(options.identity);
  if (!Array.isArray(options.admittedPeers)) {
    throw new TypeError('Mesh admittedPeers must be an array');
  }
  if (options.admittedPeers.length > limits.maximumAdmittedPeers) {
    throw new RangeError('Mesh admitted peer limit exceeded');
  }

  const admittedPeers = createFrozenRecord<MeshAdmittedPeer>(
    options.admittedPeers.map((peer) => {
      assertIdentifier(peer?.peerId, 'admitted peerId');
      assertIdentifier(peer?.peerCardId, 'admitted peerCardId');
      assertMeshMessageId(peer?.acceptedCardMessageId);
      if (!Number.isSafeInteger(peer.cardRevision) || peer.cardRevision < 1) {
        throw new TypeError('Mesh admitted cardRevision must be positive');
      }
      if (
        !Array.isArray(peer.instanceIds) ||
        peer.instanceIds.length < 1 ||
        peer.instanceIds.length > limits.maximumInstancesPerPeer
      ) {
        throw new RangeError('Invalid Mesh admitted instance bound');
      }
      const instanceIds = [...peer.instanceIds];
      for (const instanceId of instanceIds) {
        assertIdentifier(instanceId, 'admitted instanceId');
      }
      if (new Set(instanceIds).size !== instanceIds.length) {
        throw new TypeError('Duplicate Mesh admitted instanceId');
      }
      if (!compareMeshTimestamps(peer.validUntil, peer.validUntil).ok) {
        throw new TypeError('Invalid Mesh admission expiry');
      }
      return [
        peer.peerId,
        Object.freeze({
          peerId: peer.peerId,
          instanceIds: Object.freeze(instanceIds),
          peerCardId: peer.peerCardId,
          acceptedCardMessageId: peer.acceptedCardMessageId,
          cardRevision: peer.cardRevision,
          validUntil: peer.validUntil,
        }),
      ] as const;
    }),
    'Duplicate Mesh admitted peerId'
  );

  return freezePeerState({
    identity,
    status: 'created',
    admittedPeers,
    peers: createFrozenRecord<MeshPeerView>([]),
    replay: createFrozenRecord<MeshReplayWindow>([]),
    messageIds: createFrozenRecord<MeshLogicalTime>([]),
    pendingPings: createFrozenRecord<MeshPendingPing>([]),
    pendingPreparations: createFrozenRecord<MeshPendingPreparation>([]),
    limits,
    localEventSequence: 0,
    lastLogicalTime: 0,
  });
}

export function assertMeshLogicalTime(value: MeshLogicalTime): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      'Mesh logical time must be a non-negative safe integer'
    );
  }
}

export function assertMeshMessageId(value: string): void {
  if (typeof value !== 'string' || !messageIdPattern.test(value)) {
    throw new TypeError('Invalid Mesh messageId');
  }
}

export function freezePeerState(state: MeshPeerState): MeshPeerState {
  return Object.freeze(state);
}

export function createFrozenRecord<T>(
  entries: readonly (readonly [string, T])[],
  duplicateMessage = 'Duplicate Mesh record key'
): Readonly<Record<string, T>> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    if (Object.hasOwn(record, key)) throw new TypeError(duplicateMessage);
    record[key] = value;
  }
  return Object.freeze(record);
}

export function recordEntries<T>(
  record: Readonly<Record<string, T>>
): readonly (readonly [string, T])[] {
  return Object.entries(record);
}

function resolvePeerLimits(
  overrides: Partial<MeshPeerLimits> | undefined
): Readonly<MeshPeerLimits> {
  const limits = { ...DEFAULT_MESH_PEER_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }
  if (limits.maximumTrackedMessageIds < limits.replayWindowSize) {
    throw new RangeError(
      'maximumTrackedMessageIds must cover replayWindowSize'
    );
  }
  if (limits.replayWindowSize !== DEFAULT_MESH_PEER_LIMITS.replayWindowSize) {
    throw new RangeError('replayWindowSize must match protocol v0');
  }
  if (
    limits.messageIdRetentionMs < DEFAULT_MESH_PEER_LIMITS.messageIdRetentionMs
  ) {
    throw new RangeError('messageIdRetentionMs is below the protocol minimum');
  }
  return Object.freeze(limits);
}

function freezeIdentity(identity: MeshPeerIdentity): MeshPeerIdentity {
  if (!identity || typeof identity !== 'object') {
    throw new TypeError('Mesh peer identity is required');
  }
  assertIdentifier(identity.tenantId, 'tenantId');
  assertIdentifier(identity.meshId, 'meshId');
  assertIdentifier(identity.peerId, 'peerId');
  assertIdentifier(identity.instanceId, 'instanceId');
  assertIdentifier(identity.keyId, 'keyId');
  return Object.freeze({ ...identity });
}

function assertIdentifier(value: string, name: string): void {
  if (
    typeof value !== 'string' ||
    !identifierPattern.test(value) ||
    utf8Encoder.encode(value).byteLength >
      DEFAULT_MESH_PROTOCOL_LIMITS.maximumIdBytes
  ) {
    throw new TypeError(`Invalid Mesh ${name}`);
  }
}
