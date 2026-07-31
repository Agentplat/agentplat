import { DEFAULT_MESH_PROTOCOL_LIMITS } from '@agentplat/mesh-protocol';

import type { MeshPeerIdentity } from './contracts.js';
import type {
  MeshCoordinationInboundLimits,
  MeshCoordinationInboundReplayWindow,
  MeshCoordinationInboundState,
  MeshCoordinationInboundStateOptions,
  MeshDiscoveryInboundRuntimeState,
} from './coordination-inbound-contracts.js';
import type { MeshDiscoveryState } from './coordination-discovery-contracts.js';
import type { MeshCoordinationState } from './coordination-contracts.js';
import { createMeshDiscoveryRuntimeState } from './coordination-discovery-state.js';
import {
  assertMeshLogicalTime,
  assertMeshMessageId,
  createFrozenRecord,
} from './state.js';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const utf8Encoder = new TextEncoder();
const stateKeys = [
  'identity',
  'lastLogicalTime',
  'limits',
  'messageIds',
  'replay',
  'schemaVersion',
] as const;
const identityKeys = [
  'instanceId',
  'keyId',
  'meshId',
  'peerId',
  'tenantId',
] as const;
const limitKeys = [
  'maximumReplayWindows',
  'maximumTrackedMessageIds',
  'messageIdRetentionMs',
  'replayWindowSize',
] as const;
const replayWindowKeys = ['highestSequence', 'seenOffsets'] as const;

/** Fixed ceilings that callers may only reduce without weakening protocol v0. */
export const DEFAULT_MESH_COORDINATION_INBOUND_LIMITS: Readonly<MeshCoordinationInboundLimits> =
  Object.freeze({
    replayWindowSize: DEFAULT_MESH_PROTOCOL_LIMITS.replayWindowSize,
    maximumReplayWindows: 4_096,
    maximumTrackedMessageIds: 16_384,
    messageIdRetentionMs:
      DEFAULT_MESH_PROTOCOL_LIMITS.maximumLifetimeMs +
      2 * DEFAULT_MESH_PROTOCOL_LIMITS.clockSkewAllowanceMs,
  });

/** Creates an empty, deeply immutable coordination inbound snapshot. */
export function createMeshCoordinationInboundState(
  options: MeshCoordinationInboundStateOptions
): MeshCoordinationInboundState {
  assertPlainRecord(options, 'state options');
  assertExactDataKeys(options, ['identity', 'limits'], ['identity']);
  return Object.freeze({
    schemaVersion: 1,
    identity: freezeIdentity(options.identity),
    replay: createFrozenRecord<MeshCoordinationInboundReplayWindow>([]),
    messageIds: createFrozenRecord<number>([]),
    limits: resolveLimits(options.limits, false),
    lastLogicalTime: 0,
  });
}

/** Strictly validates and canonicalizes an untrusted decoded snapshot. */
export function restoreMeshCoordinationInboundState(
  snapshot: unknown
): MeshCoordinationInboundState {
  const parsed = validateSnapshot(snapshot);
  return Object.freeze({
    schemaVersion: 1,
    identity: freezeIdentity(parsed.identity),
    replay: createFrozenRecord(
      parsed.replay.map(([key, window]) => [
        key,
        Object.freeze({
          highestSequence: window.highestSequence,
          seenOffsets: Object.freeze([...window.seenOffsets]),
        }),
      ])
    ),
    messageIds: createFrozenRecord(parsed.messageIds),
    limits: Object.freeze({ ...parsed.limits }),
    lastLogicalTime: parsed.lastLogicalTime,
  });
}

/** Strict assertion used before security-sensitive inbound transitions. */
export function assertFrozenMeshCoordinationInboundState(
  state: MeshCoordinationInboundState
): void {
  validateSnapshot(state);
  if (
    !state ||
    typeof state !== 'object' ||
    Object.getPrototypeOf(state) !== Object.prototype ||
    !Object.isFrozen(state) ||
    Object.getPrototypeOf(state.identity) !== Object.prototype ||
    !Object.isFrozen(state.identity) ||
    Object.getPrototypeOf(state.replay) !== null ||
    !Object.isFrozen(state.replay) ||
    Object.getPrototypeOf(state.messageIds) !== null ||
    !Object.isFrozen(state.messageIds) ||
    Object.getPrototypeOf(state.limits) !== Object.prototype ||
    !Object.isFrozen(state.limits) ||
    Object.values(state.replay).some(
      (window) =>
        Object.getPrototypeOf(window) !== Object.prototype ||
        !Object.isFrozen(window) ||
        Object.getPrototypeOf(window.seenOffsets) !== Array.prototype ||
        !Object.isFrozen(window.seenOffsets)
    )
  ) {
    throw new TypeError(
      'Mesh coordination inbound state must be an immutable snapshot'
    );
  }
}

/** Composes aligned coordination, discovery, and inbound snapshots. */
export function createMeshDiscoveryInboundRuntimeState(
  coordination: MeshCoordinationState,
  discovery: MeshDiscoveryState,
  inbound: MeshCoordinationInboundState
): MeshDiscoveryInboundRuntimeState {
  createMeshDiscoveryRuntimeState(coordination, discovery);
  assertFrozenMeshCoordinationInboundState(inbound);
  if (!identitiesEqual(coordination.identity, inbound.identity)) {
    throw new TypeError('Mesh discovery inbound snapshots are not aligned');
  }
  for (const replayKey of Object.keys(inbound.replay)) {
    const [peerId, instanceId] = parseReplayKey(replayKey);
    const admission = discovery.admittedPeers[peerId];
    if (!admission || !admission.instanceIds.includes(instanceId)) {
      throw new TypeError(
        'Mesh discovery inbound replay window is not admitted'
      );
    }
  }
  return Object.freeze({ coordination, discovery, inbound });
}

function validateSnapshot(snapshot: unknown): {
  readonly identity: MeshPeerIdentity;
  readonly replay: readonly (readonly [
    string,
    MeshCoordinationInboundReplayWindow,
  ])[];
  readonly messageIds: readonly (readonly [string, number])[];
  readonly limits: MeshCoordinationInboundLimits;
  readonly lastLogicalTime: number;
} {
  assertPlainRecord(snapshot, 'snapshot');
  assertExactDataKeys(snapshot, stateKeys, stateKeys);
  const candidate = snapshot as unknown as MeshCoordinationInboundState;
  if (candidate.schemaVersion !== 1) {
    throw new TypeError(
      'Mesh coordination inbound schema version is unsupported'
    );
  }
  freezeIdentity(candidate.identity);
  const limits = resolveLimits(candidate.limits, true);
  assertMeshLogicalTime(candidate.lastLogicalTime);
  assertRecord(candidate.replay, 'replay');
  assertRecord(candidate.messageIds, 'messageIds');

  const replay = Object.entries(candidate.replay);
  const messageIds = Object.entries(candidate.messageIds);
  if (
    replay.length > limits.maximumReplayWindows ||
    messageIds.length > limits.maximumTrackedMessageIds
  ) {
    throw new RangeError(
      'Mesh coordination inbound snapshot exceeds its limits'
    );
  }
  for (const [key, window] of replay) {
    parseReplayKey(key);
    validateReplayWindow(window, limits);
  }
  for (const [messageId, expiresAt] of messageIds) {
    assertMeshMessageId(messageId);
    assertMeshLogicalTime(expiresAt);
    if (
      expiresAt <= candidate.lastLogicalTime ||
      candidate.lastLogicalTime >
        Number.MAX_SAFE_INTEGER - limits.messageIdRetentionMs ||
      expiresAt > candidate.lastLogicalTime + limits.messageIdRetentionMs
    ) {
      throw new TypeError(
        'Mesh coordination inbound message-id retention is invalid'
      );
    }
  }

  return {
    identity: candidate.identity,
    replay,
    messageIds,
    limits,
    lastLogicalTime: candidate.lastLogicalTime,
  };
}

function validateReplayWindow(
  window: MeshCoordinationInboundReplayWindow,
  limits: MeshCoordinationInboundLimits
): void {
  assertPlainRecord(window, 'replay window');
  assertExactDataKeys(window, replayWindowKeys, replayWindowKeys);
  if (
    !Number.isSafeInteger(window.highestSequence) ||
    window.highestSequence < 1 ||
    !isDenseDataArray(window.seenOffsets) ||
    window.seenOffsets.length < 1 ||
    window.seenOffsets[0] !== 0 ||
    window.seenOffsets.some(
      (offset, index) =>
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset >= window.highestSequence ||
        offset >= limits.replayWindowSize ||
        (index > 0 && offset <= window.seenOffsets[index - 1])
    )
  ) {
    throw new TypeError('Mesh coordination inbound replay window is invalid');
  }
}

function resolveLimits(
  overrides: Partial<MeshCoordinationInboundLimits> | undefined,
  requireComplete: boolean
): Readonly<MeshCoordinationInboundLimits> {
  if (overrides !== undefined) {
    assertPlainRecord(overrides, 'limits');
    assertExactDataKeys(overrides, limitKeys, requireComplete ? limitKeys : []);
  } else if (requireComplete) {
    throw new TypeError('Mesh coordination inbound limits are required');
  }
  const limits = {
    ...DEFAULT_MESH_COORDINATION_INBOUND_LIMITS,
    ...overrides,
  };
  for (const [name, value] of Object.entries(limits)) {
    const maximum =
      DEFAULT_MESH_COORDINATION_INBOUND_LIMITS[
        name as keyof MeshCoordinationInboundLimits
      ];
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new RangeError(
        `Mesh coordination inbound limit ${name} must be between 1 and ${maximum}`
      );
    }
  }
  const minimumRetention =
    DEFAULT_MESH_PROTOCOL_LIMITS.maximumLifetimeMs +
    2 * DEFAULT_MESH_PROTOCOL_LIMITS.clockSkewAllowanceMs;
  if (
    limits.replayWindowSize !== DEFAULT_MESH_PROTOCOL_LIMITS.replayWindowSize ||
    limits.messageIdRetentionMs < minimumRetention ||
    limits.maximumTrackedMessageIds < limits.replayWindowSize
  ) {
    throw new RangeError(
      'Mesh coordination inbound limits weaken protocol replay bounds'
    );
  }
  return Object.freeze(limits);
}

function freezeIdentity(identity: MeshPeerIdentity): MeshPeerIdentity {
  assertPlainRecord(identity, 'identity');
  assertExactDataKeys(identity, identityKeys, identityKeys);
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
    throw new TypeError(`Invalid Mesh coordination inbound ${name}`);
  }
}

function parseReplayKey(key: string): readonly [string, string] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch {
    throw new TypeError('Mesh coordination inbound replay key is invalid');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== 'string' ||
    typeof parsed[1] !== 'string' ||
    key !== JSON.stringify(parsed)
  ) {
    throw new TypeError('Mesh coordination inbound replay key is invalid');
  }
  assertIdentifier(parsed[0], 'replay peerId');
  assertIdentifier(parsed[1], 'replay instanceId');
  return [parsed[0], parsed[1]];
}

function identitiesEqual(
  left: MeshPeerIdentity,
  right: MeshPeerIdentity
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.meshId === right.meshId &&
    left.peerId === right.peerId &&
    left.instanceId === right.instanceId &&
    left.keyId === right.keyId
  );
}

function assertPlainRecord(
  value: unknown,
  name: string
): asserts value is object {
  const prototype =
    value && typeof value === 'object' ? Object.getPrototypeOf(value) : null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError(`Mesh coordination inbound ${name} must be a record`);
  }
}

function assertRecord(value: unknown, name: string): void {
  assertPlainRecord(value, name);
  const propertyNames = Object.getOwnPropertyNames(value);
  if (
    Object.getOwnPropertySymbols(value).length > 0 ||
    propertyNames.some(
      (key) =>
        !Object.prototype.propertyIsEnumerable.call(value, key) ||
        !isDataProperty(value, key)
    )
  ) {
    throw new TypeError(
      `Mesh coordination inbound ${name} must contain enumerable data properties`
    );
  }
}

function assertExactDataKeys(
  value: object,
  supportedKeys: readonly string[],
  requiredKeys: readonly string[]
): void {
  const actualKeys = Object.getOwnPropertyNames(value);
  const supported = new Set(supportedKeys);
  if (
    Object.getOwnPropertySymbols(value).length > 0 ||
    actualKeys.some(
      (key) =>
        !supported.has(key) ||
        !Object.prototype.propertyIsEnumerable.call(value, key) ||
        !isDataProperty(value, key)
    ) ||
    requiredKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new TypeError(
      'Mesh coordination inbound value contains unsupported fields'
    );
  }
}

function isDataProperty(value: object, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && 'value' in descriptor;
}

function isDenseDataArray(value: readonly unknown[]): boolean {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return false;
  }
  const propertyNames = Object.getOwnPropertyNames(value);
  if (propertyNames.length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (
      !Object.hasOwn(value, key) ||
      !Object.prototype.propertyIsEnumerable.call(value, key) ||
      !isDataProperty(value, key)
    ) {
      return false;
    }
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  return (
    lengthDescriptor !== undefined &&
    'value' in lengthDescriptor &&
    lengthDescriptor.enumerable === false
  );
}
