import {
  compareMeshTimestamps,
  type MeshAudienceTopic,
} from '@agentplat/mesh-protocol';

import type { MeshPeerIdentity } from './contracts.js';
import type {
  MeshCapabilityProjection,
  MeshDiscoveryAdmission,
  MeshDiscoveryLimits,
  MeshDiscoveryRuntimeState,
  MeshDiscoveryState,
  MeshDiscoveryStateOptions,
  MeshPeerCardProjection,
  MeshPeerViewProjection,
} from './coordination-discovery-contracts.js';
import type { MeshCoordinationState } from './coordination-contracts.js';
import { assertFrozenMeshCoordinationState } from './coordination-state.js';
import {
  assertMeshLogicalTime,
  assertMeshMessageId,
  createFrozenRecord,
} from './state.js';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const utf8Encoder = new TextEncoder();
const allowedSubscriptions = new Set<MeshAudienceTopic>([
  'membership',
  'capability',
  'objective',
]);

export const DEFAULT_MESH_DISCOVERY_LIMITS: Readonly<MeshDiscoveryLimits> =
  Object.freeze({
    maximumAdmissions: 256,
    maximumInstancesPerAdmission: 16,
    maximumPeerCards: 256,
    maximumPeerViews: 128,
    maximumPeerCardBytes: 65_536,
    maximumCapabilities: 2_048,
    maximumCapabilitiesPerPeer: 64,
    maximumCapabilityBytes: 65_536,
    maximumSubscriptions: 3,
    maximumFanout: 32,
    maximumRequirementCapabilityKeys: 64,
    maximumRequirementAttributes: 128,
    maximumRequirementBytes: 65_536,
  });

/** Creates one empty discovery projection with explicit local admission. */
export function createMeshDiscoveryState(
  options: MeshDiscoveryStateOptions
): MeshDiscoveryState {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Mesh discovery state options are required');
  }
  assertExactKeys(
    options,
    ['admittedPeers', 'identity', 'limits', 'subscriptions'],
    ['identity']
  );
  const limits = resolveLimits(options.limits, false);
  const admittedPeers = options.admittedPeers ?? [];
  const subscriptions = options.subscriptions ?? [];
  if (!Array.isArray(admittedPeers) || !Array.isArray(subscriptions)) {
    throw new TypeError('Mesh discovery collections must be arrays');
  }
  if (admittedPeers.length > limits.maximumAdmissions) {
    throw new RangeError('Mesh discovery admission limit exceeded');
  }
  const admissions = admittedPeers.map((admission) => {
    const frozen = freezeAdmission(admission, limits);
    return [frozen.peerId, frozen] as const;
  });
  const frozenSubscriptions = freezeSubscriptions(subscriptions, limits);
  return Object.freeze({
    schemaVersion: 1,
    identity: freezeIdentity(options.identity),
    admittedPeers: createFrozenRecord(
      admissions,
      'Duplicate Mesh discovery admission'
    ),
    peerCards: createFrozenRecord<MeshPeerCardProjection>([]),
    peerViews: createFrozenRecord<MeshPeerViewProjection>([]),
    capabilities: createFrozenRecord<MeshCapabilityProjection>([]),
    subscriptions: frozenSubscriptions,
    limits,
    lastLogicalTime: 0,
  });
}

/** Strictly restores a decoded discovery snapshot. */
export function restoreMeshDiscoveryState(
  snapshot: unknown
): MeshDiscoveryState {
  const parsed = validateSnapshot(snapshot);
  return Object.freeze({
    schemaVersion: 1,
    identity: freezeIdentity(parsed.identity),
    admittedPeers: createFrozenRecord(
      parsed.admittedPeers.map(([key, value]) => [
        key,
        freezeAdmission(value, parsed.limits),
      ])
    ),
    peerCards: createFrozenRecord(
      parsed.peerCards.map(([key, value]) => [key, freezePeerCard(value)])
    ),
    peerViews: createFrozenRecord(
      parsed.peerViews.map(([key, value]) => [key, Object.freeze({ ...value })])
    ),
    capabilities: createFrozenRecord(
      parsed.capabilities.map(([key, value]) => [key, freezeCapability(value)])
    ),
    subscriptions: Object.freeze([...parsed.subscriptions]),
    limits: Object.freeze({ ...parsed.limits }),
    lastLogicalTime: parsed.lastLogicalTime,
  });
}

/** Composes separately versioned core and discovery snapshots. */
export function createMeshDiscoveryRuntimeState(
  coordination: MeshCoordinationState,
  discovery: MeshDiscoveryState
): MeshDiscoveryRuntimeState {
  assertFrozenMeshCoordinationState(coordination);
  assertFrozenMeshDiscoveryState(discovery);
  if (
    coordination.identity.tenantId !== discovery.identity.tenantId ||
    coordination.identity.meshId !== discovery.identity.meshId ||
    coordination.identity.peerId !== discovery.identity.peerId ||
    coordination.identity.instanceId !== discovery.identity.instanceId ||
    coordination.identity.keyId !== discovery.identity.keyId ||
    coordination.lastLogicalTime !== discovery.lastLogicalTime
  ) {
    throw new TypeError('Mesh discovery runtime snapshots are not aligned');
  }
  assertProjectionDomainBindings(coordination, discovery);
  return Object.freeze({ coordination, discovery });
}

/** Package-internal strict assertion shared by pure discovery functions. */
export function assertFrozenMeshDiscoveryState(
  state: MeshDiscoveryState
): void {
  if (
    !state ||
    typeof state !== 'object' ||
    !Object.isFrozen(state) ||
    !Object.isFrozen(state.identity) ||
    !Object.isFrozen(state.admittedPeers) ||
    !Object.isFrozen(state.peerCards) ||
    !Object.isFrozen(state.peerViews) ||
    !Object.isFrozen(state.capabilities) ||
    !Object.isFrozen(state.subscriptions) ||
    !Object.isFrozen(state.limits) ||
    Object.getPrototypeOf(state.admittedPeers) !== null ||
    Object.getPrototypeOf(state.peerCards) !== null ||
    Object.getPrototypeOf(state.peerViews) !== null ||
    Object.getPrototypeOf(state.capabilities) !== null ||
    Object.values(state.admittedPeers).some(
      (entry) => !Object.isFrozen(entry) || !Object.isFrozen(entry.instanceIds)
    ) ||
    Object.values(state.peerCards).some(
      (entry) =>
        !Object.isFrozen(entry) ||
        !Object.isFrozen(entry.protocolVersions) ||
        !Object.isFrozen(entry.transportHints) ||
        !Object.isFrozen(entry.capabilityIds)
    ) ||
    Object.values(state.peerViews).some((entry) => !Object.isFrozen(entry)) ||
    Object.values(state.capabilities).some(
      (entry) =>
        !Object.isFrozen(entry) ||
        !Object.isFrozen(entry.inputMediaTypes) ||
        !Object.isFrozen(entry.outputMediaTypes) ||
        !Object.isFrozen(entry.attributes) ||
        Object.getPrototypeOf(entry.attributes) !== null
    )
  ) {
    throw new TypeError('Mesh discovery state must be an immutable snapshot');
  }
  validateSnapshot(state);
}

function validateSnapshot(snapshot: unknown): {
  readonly identity: MeshPeerIdentity;
  readonly admittedPeers: readonly (readonly [
    string,
    MeshDiscoveryAdmission,
  ])[];
  readonly peerCards: readonly (readonly [string, MeshPeerCardProjection])[];
  readonly peerViews: readonly (readonly [string, MeshPeerViewProjection])[];
  readonly capabilities: readonly (readonly [
    string,
    MeshCapabilityProjection,
  ])[];
  readonly subscriptions: readonly MeshAudienceTopic[];
  readonly limits: MeshDiscoveryLimits;
  readonly lastLogicalTime: number;
} {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('Mesh discovery snapshot is required');
  }
  const candidate = snapshot as MeshDiscoveryState;
  assertExactKeys(
    candidate,
    [
      'admittedPeers',
      'capabilities',
      'identity',
      'lastLogicalTime',
      'limits',
      'peerCards',
      'peerViews',
      'schemaVersion',
      'subscriptions',
    ],
    [
      'admittedPeers',
      'capabilities',
      'identity',
      'lastLogicalTime',
      'limits',
      'peerCards',
      'peerViews',
      'schemaVersion',
      'subscriptions',
    ]
  );
  if (candidate.schemaVersion !== 1) {
    throw new TypeError('Mesh discovery schema version is unsupported');
  }
  freezeIdentity(candidate.identity);
  const limits = resolveLimits(candidate.limits, true);
  assertMeshLogicalTime(candidate.lastLogicalTime);
  assertRecordObject(candidate.admittedPeers, 'admittedPeers');
  assertRecordObject(candidate.peerCards, 'peerCards');
  assertRecordObject(candidate.peerViews, 'peerViews');
  assertRecordObject(candidate.capabilities, 'capabilities');
  if (!Array.isArray(candidate.subscriptions)) {
    throw new TypeError('Mesh discovery subscriptions must be an array');
  }
  freezeSubscriptions(candidate.subscriptions, limits);

  const admittedPeers = Object.entries(candidate.admittedPeers);
  const peerCards = Object.entries(candidate.peerCards);
  const peerViews = Object.entries(candidate.peerViews);
  const capabilities = Object.entries(candidate.capabilities);
  if (
    admittedPeers.length > limits.maximumAdmissions ||
    peerCards.length > limits.maximumPeerCards ||
    peerViews.length > limits.maximumPeerViews ||
    capabilities.length > limits.maximumCapabilities
  ) {
    throw new RangeError('Mesh discovery snapshot exceeds its limits');
  }

  for (const [peerId, admission] of admittedPeers) {
    if (freezeAdmission(admission, limits).peerId !== peerId) {
      throw new TypeError('Mesh discovery admission key is invalid');
    }
  }
  for (const [peerId, card] of peerCards) {
    validatePeerCard(card, candidate.lastLogicalTime, limits);
    const admission = candidate.admittedPeers[peerId];
    if (
      card.peerId !== peerId ||
      !Object.hasOwn(candidate.admittedPeers, peerId) ||
      !admission.instanceIds.includes(card.instanceId) ||
      compare(card.validUntil, admission.validUntil) > 0
    ) {
      throw new TypeError('Mesh discovery Peer Card binding is invalid');
    }
  }
  for (const [peerId, view] of peerViews) {
    assertExactKeys(
      view,
      ['cardRevision', 'expiresAt', 'observedAt', 'peerCardId', 'peerId'],
      ['cardRevision', 'expiresAt', 'observedAt', 'peerCardId', 'peerId']
    );
    const card = candidate.peerCards[peerId];
    if (
      view.peerId !== peerId ||
      !card ||
      card.status !== 'active' ||
      view.peerCardId !== card.peerCardId ||
      view.cardRevision !== card.cardRevision ||
      view.expiresAt !== card.expiresAt ||
      !isLogicalTimeAtMost(view.observedAt, candidate.lastLogicalTime) ||
      !isLogicalTimeAtLeast(view.expiresAt, view.observedAt)
    ) {
      throw new TypeError('Mesh discovery Peer View is invalid');
    }
  }

  const capabilityCounts = new Map<string, number>();
  for (const [capabilityKey, capability] of capabilities) {
    validateCapability(capability, candidate.lastLogicalTime, limits);
    const expectedKey = JSON.stringify([
      capability.ownerPeerId,
      capability.capabilityId,
    ]);
    const card = candidate.peerCards[capability.ownerPeerId];
    if (
      capabilityKey !== expectedKey ||
      !card ||
      (capability.status === 'active' &&
        (capability.instanceId !== card.instanceId ||
          !card.capabilityIds.includes(capability.capabilityId) ||
          compare(capability.validUntil, card.validUntil) > 0))
    ) {
      throw new TypeError('Mesh discovery capability binding is invalid');
    }
    const nextCount = (capabilityCounts.get(capability.ownerPeerId) ?? 0) + 1;
    capabilityCounts.set(capability.ownerPeerId, nextCount);
    if (nextCount > limits.maximumCapabilitiesPerPeer) {
      throw new RangeError('Mesh discovery per-peer capability limit exceeded');
    }
  }

  return {
    identity: candidate.identity,
    admittedPeers,
    peerCards,
    peerViews,
    capabilities,
    subscriptions: candidate.subscriptions,
    limits,
    lastLogicalTime: candidate.lastLogicalTime,
  };
}

function validatePeerCard(
  card: MeshPeerCardProjection,
  lastLogicalTime: number,
  limits: MeshDiscoveryLimits
): void {
  assertExactKeys(
    card,
    [
      'acceptedAt',
      'acceptedMessageId',
      'capabilityIds',
      'cardRevision',
      'expiresAt',
      'instanceId',
      'peerCardId',
      'peerId',
      'protocolVersions',
      'status',
      'transportHints',
      'validFrom',
      'validUntil',
      'validityVerifiedAt',
    ],
    [
      'acceptedAt',
      'acceptedMessageId',
      'capabilityIds',
      'cardRevision',
      'expiresAt',
      'instanceId',
      'peerCardId',
      'peerId',
      'protocolVersions',
      'status',
      'transportHints',
      'validFrom',
      'validUntil',
      'validityVerifiedAt',
    ]
  );
  assertIdentifier(card.peerId, 'Peer Card peerId');
  assertIdentifier(card.instanceId, 'Peer Card instanceId');
  assertIdentifier(card.peerCardId, 'Peer Card ID');
  assertMeshMessageId(card.acceptedMessageId);
  assertStringArray(card.transportHints, 'Peer Card transportHints');
  assertStringArray(card.capabilityIds, 'Peer Card capabilityIds');
  if (
    !Array.isArray(card.protocolVersions) ||
    card.protocolVersions.some(
      (version) => !Number.isSafeInteger(version) || version < 0
    ) ||
    !Number.isSafeInteger(card.cardRevision) ||
    card.cardRevision < 1 ||
    !['active', 'departed', 'expired'].includes(card.status) ||
    compare(card.validFrom, card.validUntil) >= 0 ||
    compare(card.validityVerifiedAt, card.validFrom) < 0 ||
    compare(card.validityVerifiedAt, card.validUntil) >= 0 ||
    !isLogicalTimeAtMost(card.acceptedAt, lastLogicalTime) ||
    !isLogicalTimeAtLeast(card.expiresAt, card.acceptedAt) ||
    (card.status !== 'departed' &&
      card.expiresAt !==
        expectedLogicalExpiry(
          card.validUntil,
          card.validityVerifiedAt,
          card.acceptedAt
        )) ||
    encodedBytes(card) > limits.maximumPeerCardBytes
  ) {
    throw new TypeError('Mesh discovery Peer Card is invalid');
  }
}

function validateCapability(
  capability: MeshCapabilityProjection,
  lastLogicalTime: number,
  limits: MeshDiscoveryLimits
): void {
  assertExactKeys(
    capability,
    [
      'acceptedAt',
      'acceptedMessageId',
      'advertisementId',
      'attributes',
      'capabilityId',
      'capabilityKey',
      'capabilityRevision',
      'expiresAt',
      'inputMediaTypes',
      'instanceId',
      'maximumConcurrency',
      'maximumPayloadBytes',
      'outputMediaTypes',
      'ownerPeerId',
      'status',
      'validFrom',
      'validUntil',
      'validityVerifiedAt',
      'variant',
      'version',
    ],
    [
      'acceptedAt',
      'acceptedMessageId',
      'advertisementId',
      'attributes',
      'capabilityId',
      'capabilityKey',
      'capabilityRevision',
      'expiresAt',
      'inputMediaTypes',
      'instanceId',
      'outputMediaTypes',
      'ownerPeerId',
      'status',
      'validFrom',
      'validUntil',
      'validityVerifiedAt',
      'version',
    ]
  );
  assertIdentifier(capability.ownerPeerId, 'capability ownerPeerId');
  assertIdentifier(capability.instanceId, 'capability instanceId');
  assertIdentifier(capability.advertisementId, 'advertisementId');
  assertIdentifier(capability.capabilityId, 'capabilityId');
  assertMeshMessageId(capability.acceptedMessageId);
  assertStringArray(capability.inputMediaTypes, 'inputMediaTypes');
  assertStringArray(capability.outputMediaTypes, 'outputMediaTypes');
  assertStringRecord(capability.attributes, 'capability attributes');
  if (
    typeof capability.capabilityKey !== 'string' ||
    capability.capabilityKey.length < 1 ||
    typeof capability.version !== 'string' ||
    capability.version.length < 1 ||
    (capability.variant !== undefined &&
      (typeof capability.variant !== 'string' ||
        capability.variant.length < 1)) ||
    !Number.isSafeInteger(capability.capabilityRevision) ||
    capability.capabilityRevision < 1 ||
    !['active', 'withdrawn', 'departed', 'expired'].includes(
      capability.status
    ) ||
    compare(capability.validFrom, capability.validUntil) >= 0 ||
    compare(capability.validityVerifiedAt, capability.validFrom) < 0 ||
    compare(capability.validityVerifiedAt, capability.validUntil) >= 0 ||
    !isLogicalTimeAtMost(capability.acceptedAt, lastLogicalTime) ||
    !isLogicalTimeAtLeast(capability.expiresAt, capability.acceptedAt) ||
    (capability.status !== 'withdrawn' &&
      capability.expiresAt !==
        expectedLogicalExpiry(
          capability.validUntil,
          capability.validityVerifiedAt,
          capability.acceptedAt
        )) ||
    (capability.maximumConcurrency !== undefined &&
      (!Number.isSafeInteger(capability.maximumConcurrency) ||
        capability.maximumConcurrency < 1)) ||
    (capability.maximumPayloadBytes !== undefined &&
      (!Number.isSafeInteger(capability.maximumPayloadBytes) ||
        capability.maximumPayloadBytes < 1)) ||
    encodedBytes(capability) > limits.maximumCapabilityBytes
  ) {
    throw new TypeError('Mesh discovery capability is invalid');
  }
}

function freezeAdmission(
  admission: MeshDiscoveryAdmission,
  limits: MeshDiscoveryLimits
): MeshDiscoveryAdmission {
  if (!admission || typeof admission !== 'object') {
    throw new TypeError('Mesh discovery admission is required');
  }
  assertExactKeys(
    admission,
    ['instanceIds', 'peerId', 'validUntil'],
    ['instanceIds', 'peerId', 'validUntil']
  );
  assertIdentifier(admission.peerId, 'admission peerId');
  if (
    !Array.isArray(admission.instanceIds) ||
    admission.instanceIds.length < 1 ||
    admission.instanceIds.length > limits.maximumInstancesPerAdmission
  ) {
    throw new RangeError('Invalid Mesh discovery admitted instance bound');
  }
  const instanceIds = [...admission.instanceIds];
  for (const instanceId of instanceIds) {
    assertIdentifier(instanceId, 'admission instanceId');
  }
  if (new Set(instanceIds).size !== instanceIds.length) {
    throw new TypeError('Duplicate Mesh discovery admitted instanceId');
  }
  compare(admission.validUntil, admission.validUntil);
  return Object.freeze({
    peerId: admission.peerId,
    instanceIds: Object.freeze(instanceIds),
    validUntil: admission.validUntil,
  });
}

function freezePeerCard(card: MeshPeerCardProjection): MeshPeerCardProjection {
  return Object.freeze({
    ...card,
    protocolVersions: Object.freeze([...card.protocolVersions]),
    transportHints: Object.freeze([...card.transportHints]),
    capabilityIds: Object.freeze([...card.capabilityIds]),
  });
}

function freezeCapability(
  capability: MeshCapabilityProjection
): MeshCapabilityProjection {
  return Object.freeze({
    ...capability,
    inputMediaTypes: Object.freeze([...capability.inputMediaTypes]),
    outputMediaTypes: Object.freeze([...capability.outputMediaTypes]),
    attributes: freezeStringRecord(capability.attributes),
  });
}

function resolveLimits(
  overrides: Partial<MeshDiscoveryLimits> | undefined,
  requireComplete: boolean
): Readonly<MeshDiscoveryLimits> {
  const names = Object.keys(DEFAULT_MESH_DISCOVERY_LIMITS).sort();
  if (overrides !== undefined) {
    assertExactKeys(overrides, names, requireComplete ? names : []);
  } else if (requireComplete) {
    throw new TypeError('Mesh discovery limits are required');
  }
  const limits = { ...DEFAULT_MESH_DISCOVERY_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    const maximum =
      DEFAULT_MESH_DISCOVERY_LIMITS[name as keyof MeshDiscoveryLimits];
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new RangeError(
        `Mesh discovery limit ${name} must be between 1 and ${maximum}`
      );
    }
  }
  if (
    limits.maximumPeerCards > limits.maximumAdmissions ||
    limits.maximumPeerViews > limits.maximumPeerCards ||
    limits.maximumCapabilitiesPerPeer > limits.maximumCapabilities
  ) {
    throw new RangeError('Mesh discovery limits are internally inconsistent');
  }
  return Object.freeze(limits);
}

function assertProjectionDomainBindings(
  coordination: MeshCoordinationState,
  discovery: MeshDiscoveryState
): void {
  for (const card of Object.values(discovery.peerCards)) {
    const recordType =
      card.status === 'departed' ? 'peer.goodbye' : 'peer.card';
    const record =
      coordination.domainRecords[JSON.stringify([recordType, card.peerCardId])];
    if (
      !record ||
      record.recordType !== recordType ||
      record.messageId !== card.acceptedMessageId ||
      record.acceptedAt !== card.acceptedAt
    ) {
      throw new TypeError(
        'Mesh discovery Peer Card domain record binding is invalid'
      );
    }
  }
  for (const capability of Object.values(discovery.capabilities)) {
    const recordType =
      capability.status === 'withdrawn'
        ? 'capability.withdraw'
        : 'capability.advertise';
    const record =
      coordination.domainRecords[
        JSON.stringify([recordType, capability.advertisementId])
      ];
    if (
      !record ||
      record.recordType !== recordType ||
      record.messageId !== capability.acceptedMessageId ||
      record.acceptedAt !== capability.acceptedAt
    ) {
      throw new TypeError(
        'Mesh discovery capability domain record binding is invalid'
      );
    }
  }
}

function expectedLogicalExpiry(
  validUntil: string,
  verifiedAt: string,
  acceptedAt: number
): number {
  const validUntilMs = Date.parse(validUntil);
  const verifiedAtMs = Date.parse(verifiedAt);
  if (!Number.isFinite(validUntilMs) || !Number.isFinite(verifiedAtMs)) {
    throw new TypeError('Invalid Mesh discovery validity timestamp');
  }
  const remaining = Math.max(0, validUntilMs - verifiedAtMs);
  if (acceptedAt > Number.MAX_SAFE_INTEGER - remaining) {
    throw new RangeError('Mesh discovery expiry exceeds logical time');
  }
  return acceptedAt + remaining;
}

function freezeSubscriptions(
  subscriptions: readonly MeshAudienceTopic[],
  limits: MeshDiscoveryLimits
): readonly MeshAudienceTopic[] {
  if (
    subscriptions.length > limits.maximumSubscriptions ||
    subscriptions.some((topic) => !allowedSubscriptions.has(topic)) ||
    new Set(subscriptions).size !== subscriptions.length
  ) {
    throw new TypeError('Invalid Mesh discovery subscriptions');
  }
  return Object.freeze([...subscriptions].sort());
}

function freezeIdentity(identity: MeshPeerIdentity): MeshPeerIdentity {
  if (!identity || typeof identity !== 'object') {
    throw new TypeError('Mesh discovery identity is required');
  }
  assertExactKeys(
    identity,
    ['instanceId', 'keyId', 'meshId', 'peerId', 'tenantId'],
    ['instanceId', 'keyId', 'meshId', 'peerId', 'tenantId']
  );
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
    utf8Encoder.encode(value).byteLength > 256
  ) {
    throw new TypeError(`Invalid Mesh discovery ${name}`);
  }
}

function assertStringArray(value: readonly string[], name: string): void {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw new TypeError(`Invalid Mesh discovery ${name}`);
  }
}

function assertStringRecord(
  value: Readonly<Record<string, string>>,
  name: string
): void {
  assertRecordObject(value, name);
  if (Object.values(value).some((entry) => typeof entry !== 'string')) {
    throw new TypeError(`Invalid Mesh discovery ${name}`);
  }
}

function freezeStringRecord(
  value: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  return createFrozenRecord(Object.entries(value));
}

function assertRecordObject(value: unknown, name: string): void {
  const prototype =
    value && typeof value === 'object' ? Object.getPrototypeOf(value) : null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (prototype !== null && prototype !== Object.prototype) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.getOwnPropertyNames(value).some(
      (key) => !Object.prototype.propertyIsEnumerable.call(value, key)
    )
  ) {
    throw new TypeError(`Mesh discovery ${name} must be a record`);
  }
}

function assertExactKeys(
  value: object,
  supportedKeys: readonly string[],
  requiredKeys: readonly string[]
): void {
  const actualKeys = Object.getOwnPropertyNames(value);
  const supported = new Set(supportedKeys);
  if (
    actualKeys.some((key) => !supported.has(key)) ||
    requiredKeys.some((key) => !Object.hasOwn(value, key)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw new TypeError('Mesh discovery value contains unsupported fields');
  }
}

function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError('Invalid Mesh discovery timestamp');
  return result.value;
}

function isLogicalTimeAtMost(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function isLogicalTimeAtLeast(value: number, minimum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum;
}

function encodedBytes(value: unknown): number {
  return utf8Encoder.encode(JSON.stringify(value)).byteLength;
}
