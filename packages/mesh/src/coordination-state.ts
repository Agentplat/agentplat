import type { MeshMessagePayload } from '@agentplat/mesh-protocol';

import type { MeshPeerIdentity } from './contracts.js';
import type {
  MeshCoordinationDomainRecord,
  MeshCoordinationJournalEntry,
  MeshCoordinationLimits,
  MeshCoordinationState,
  MeshCoordinationStateOptions,
  MeshCoordinationTimer,
} from './coordination-contracts.js';
import {
  assertMeshLogicalTime,
  assertMeshMessageId,
  createFrozenRecord,
} from './state.js';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const contentDigestPattern = /^[A-Za-z0-9_-]{43}$/;
const maximumIdentifierBytes = 256;
const maximumTimerIdentifierBytes = 768;
const utf8Encoder = new TextEncoder();
const coordinationRecordTypes = new Set<MeshMessagePayload['type']>([
  'peer.card',
  'peer.goodbye',
  'capability.advertise',
  'capability.withdraw',
  'objective.announce',
  'objective.revise',
  'objective.cancel',
  'work.offer',
  'work.bid',
  'work.award',
  'work.accept',
  'work.decline',
  'work.progress',
  'work.checkpoint',
  'work.result',
  'work.release',
  'work.cancel',
  'lease.renew',
  'lease.takeover_proposal',
  'lease.vote',
  'lease.certificate',
]);
const timerKinds = new Set([
  'capability.expiry',
  'objective.expiry',
  'work.deadline',
  'work.bid_deadline',
  'work.acceptance_deadline',
  'lease.expiry',
  'recovery.grace',
]);
const journalKinds = new Set([
  'domain.accepted',
  'domain.rejected',
  'timer.fired',
  'command.accepted',
]);
const journalKeys = new Set([
  'sequence',
  'occurredAt',
  'kind',
  'domainRecordKey',
  'timerId',
  'reasonCode',
]);

/** Fixed ceilings that callers may only reduce. */
export const DEFAULT_MESH_COORDINATION_LIMITS: Readonly<MeshCoordinationLimits> =
  Object.freeze({
    maximumDomainRecords: 16_384,
    maximumTimers: 4_096,
    maximumJournalEntries: 8_192,
  });

/** Creates one empty, deeply immutable coordination snapshot. */
export function createMeshCoordinationState(
  options: MeshCoordinationStateOptions
): MeshCoordinationState {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Mesh coordination state options are required');
  }
  assertExactKeys(options, ['identity', 'limits'], ['identity']);
  return Object.freeze({
    schemaVersion: 1,
    identity: freezeIdentity(options.identity),
    domainRecords: createFrozenRecord<MeshCoordinationDomainRecord>([]),
    timers: createFrozenRecord<MeshCoordinationTimer>([]),
    journal: Object.freeze([]),
    limits: resolveLimits(options.limits),
    localEventSequence: 0,
    lastLogicalTime: 0,
  });
}

/**
 * Strictly validates an untrusted in-memory or decoded snapshot and returns a
 * fresh immutable representation. Import never performs this restoration.
 */
export function restoreMeshCoordinationState(
  snapshot: unknown
): MeshCoordinationState {
  const parsed = validateSnapshot(snapshot);
  return Object.freeze({
    schemaVersion: 1,
    identity: freezeIdentity(parsed.identity),
    domainRecords: createFrozenRecord(
      parsed.domainRecords.map(([key, value]) => [
        key,
        Object.freeze({ ...value }),
      ])
    ),
    timers: createFrozenRecord(
      parsed.timers.map(([key, value]) => [key, Object.freeze({ ...value })])
    ),
    journal: Object.freeze(
      parsed.journal.map((entry) => Object.freeze({ ...entry }))
    ),
    limits: Object.freeze({ ...parsed.limits }),
    localEventSequence: parsed.localEventSequence,
    lastLogicalTime: parsed.lastLogicalTime,
  });
}

/** Package-internal validation for pure coordination evaluators. */
export function assertFrozenMeshCoordinationState(
  state: MeshCoordinationState
): void {
  if (
    !state ||
    typeof state !== 'object' ||
    !Object.isFrozen(state) ||
    !Object.isFrozen(state.identity) ||
    !Object.isFrozen(state.domainRecords) ||
    !Object.isFrozen(state.timers) ||
    !Object.isFrozen(state.journal) ||
    !Object.isFrozen(state.limits) ||
    Object.getPrototypeOf(state.domainRecords) !== null ||
    Object.getPrototypeOf(state.timers) !== null ||
    Object.values(state.domainRecords).some(
      (entry) => !Object.isFrozen(entry)
    ) ||
    Object.values(state.timers).some((entry) => !Object.isFrozen(entry)) ||
    state.journal.some((entry) => !Object.isFrozen(entry))
  ) {
    throw new TypeError(
      'Mesh coordination state must be an immutable snapshot'
    );
  }
  validateSnapshot(state);
}

function validateSnapshot(snapshot: unknown): {
  readonly identity: MeshPeerIdentity;
  readonly domainRecords: readonly (readonly [
    string,
    MeshCoordinationDomainRecord,
  ])[];
  readonly timers: readonly (readonly [string, MeshCoordinationTimer])[];
  readonly journal: readonly MeshCoordinationJournalEntry[];
  readonly limits: MeshCoordinationLimits;
  readonly localEventSequence: number;
  readonly lastLogicalTime: number;
} {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('Mesh coordination snapshot is required');
  }
  const candidate = snapshot as MeshCoordinationState;
  assertExactKeys(
    candidate,
    [
      'domainRecords',
      'identity',
      'journal',
      'lastLogicalTime',
      'limits',
      'localEventSequence',
      'schemaVersion',
      'timers',
    ],
    [
      'domainRecords',
      'identity',
      'journal',
      'lastLogicalTime',
      'limits',
      'localEventSequence',
      'schemaVersion',
      'timers',
    ]
  );
  if (candidate.schemaVersion !== 1) {
    throw new TypeError('Mesh coordination schema version is unsupported');
  }
  freezeIdentity(candidate.identity);
  const limits = resolveLimits(candidate.limits, true);
  assertMeshLogicalTime(candidate.lastLogicalTime);
  if (
    !Number.isSafeInteger(candidate.localEventSequence) ||
    candidate.localEventSequence < 0
  ) {
    throw new TypeError('Mesh coordination event sequence is invalid');
  }
  assertRecordObject(candidate.domainRecords, 'domain records');
  assertRecordObject(candidate.timers, 'timers');
  if (!Array.isArray(candidate.journal)) {
    throw new TypeError('Mesh coordination journal must be an array');
  }

  const domainRecords = Object.entries(candidate.domainRecords);
  const timers = Object.entries(candidate.timers);
  if (
    domainRecords.length > limits.maximumDomainRecords ||
    timers.length > limits.maximumTimers ||
    candidate.journal.length > limits.maximumJournalEntries
  ) {
    throw new RangeError('Mesh coordination snapshot exceeds its limits');
  }
  for (const [recordKey, record] of domainRecords) {
    assertExactKeys(
      record,
      [
        'acceptedAt',
        'contentDigest',
        'messageId',
        'objectiveId',
        'recordId',
        'recordKey',
        'recordType',
      ],
      [
        'acceptedAt',
        'contentDigest',
        'messageId',
        'recordId',
        'recordKey',
        'recordType',
      ]
    );
    assertIdentifier(record.recordId, 'domain recordId');
    assertMeshMessageId(record.messageId);
    if (
      record.recordKey !== recordKey ||
      recordKey !== JSON.stringify([record.recordType, record.recordId]) ||
      !coordinationRecordTypes.has(record.recordType) ||
      (record.objectiveId !== undefined &&
        (typeof record.objectiveId !== 'string' ||
          !identifierPattern.test(record.objectiveId) ||
          utf8Encoder.encode(record.objectiveId).byteLength >
            maximumIdentifierBytes)) ||
      typeof record.contentDigest !== 'string' ||
      !contentDigestPattern.test(record.contentDigest) ||
      !Number.isSafeInteger(record.acceptedAt) ||
      record.acceptedAt < 0 ||
      record.acceptedAt > candidate.lastLogicalTime
    ) {
      throw new TypeError('Mesh coordination domain record is invalid');
    }
  }
  for (const [timerId, timer] of timers) {
    assertExactKeys(
      timer,
      ['domainRecordKey', 'dueAt', 'generation', 'kind', 'timerId'],
      ['domainRecordKey', 'dueAt', 'generation', 'kind', 'timerId']
    );
    assertTimerIdentifier(timerId, 'timerId');
    if (
      timer.timerId !== timerId ||
      !timerKinds.has(timer.kind) ||
      !Number.isSafeInteger(timer.dueAt) ||
      timer.dueAt < 0 ||
      !Number.isSafeInteger(timer.generation) ||
      timer.generation < 1 ||
      !Object.hasOwn(candidate.domainRecords, timer.domainRecordKey)
    ) {
      throw new TypeError('Mesh coordination timer is invalid');
    }
  }

  let previousSequence = 0;
  for (const entry of candidate.journal) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Object.keys(entry).some((key) => !journalKeys.has(key)) ||
      !journalKinds.has(entry.kind) ||
      !Number.isSafeInteger(entry.sequence) ||
      entry.sequence <= previousSequence ||
      entry.sequence > candidate.localEventSequence ||
      !Number.isSafeInteger(entry.occurredAt) ||
      entry.occurredAt < 0 ||
      entry.occurredAt > candidate.lastLogicalTime ||
      (entry.domainRecordKey !== undefined &&
        !Object.hasOwn(candidate.domainRecords, entry.domainRecordKey)) ||
      (entry.reasonCode !== undefined &&
        (typeof entry.reasonCode !== 'string' ||
          entry.reasonCode.length < 1 ||
          entry.reasonCode.length > 128))
    ) {
      throw new TypeError('Mesh coordination journal entry is invalid');
    }
    if (!isJournalEntryShapeValid(entry)) {
      throw new TypeError('Mesh coordination journal entry is invalid');
    }
    if (entry.timerId !== undefined) {
      assertTimerIdentifier(entry.timerId, 'journal timerId');
    }
    previousSequence = entry.sequence;
  }

  return {
    identity: candidate.identity,
    domainRecords,
    timers,
    journal: candidate.journal,
    limits,
    localEventSequence: candidate.localEventSequence,
    lastLogicalTime: candidate.lastLogicalTime,
  };
}

function resolveLimits(
  overrides: Partial<MeshCoordinationLimits> | undefined,
  requireComplete = false
): Readonly<MeshCoordinationLimits> {
  if (overrides !== undefined) {
    assertExactKeys(
      overrides,
      ['maximumDomainRecords', 'maximumJournalEntries', 'maximumTimers'],
      requireComplete
        ? ['maximumDomainRecords', 'maximumJournalEntries', 'maximumTimers']
        : []
    );
  }
  const limits = { ...DEFAULT_MESH_COORDINATION_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    const maximum =
      DEFAULT_MESH_COORDINATION_LIMITS[name as keyof MeshCoordinationLimits];
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new RangeError(
        `Mesh coordination limit ${name} must be between 1 and ${maximum}`
      );
    }
  }
  return Object.freeze(limits);
}

function freezeIdentity(identity: MeshPeerIdentity): MeshPeerIdentity {
  if (!identity || typeof identity !== 'object') {
    throw new TypeError('Mesh coordination identity is required');
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
    utf8Encoder.encode(value).byteLength > maximumIdentifierBytes
  ) {
    throw new TypeError(`Invalid Mesh coordination ${name}`);
  }
}

function assertTimerIdentifier(value: string, name: string): void {
  if (
    typeof value !== 'string' ||
    !identifierPattern.test(value) ||
    utf8Encoder.encode(value).byteLength > maximumTimerIdentifierBytes
  ) {
    throw new TypeError(`Invalid Mesh coordination ${name}`);
  }
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
    throw new TypeError(`Mesh coordination ${name} must be a record`);
  }
}

function assertExactKeys(
  value: object,
  supportedKeys: readonly string[],
  requiredKeys: readonly string[]
): void {
  const prototype = Object.getPrototypeOf(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors);
  const supported = new Set(supportedKeys);
  if (
    (prototype !== null && prototype !== Object.prototype) ||
    actualKeys.some((key) => !supported.has(key)) ||
    requiredKeys.some((key) => !Object.hasOwn(value, key)) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.values(descriptors).some(
      (descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
    )
  ) {
    throw new TypeError('Mesh coordination value contains unsupported fields');
  }
}

function isJournalEntryShapeValid(
  entry: MeshCoordinationJournalEntry
): boolean {
  switch (entry.kind) {
    case 'domain.accepted':
      return (
        entry.domainRecordKey !== undefined &&
        entry.timerId === undefined &&
        entry.reasonCode === undefined
      );
    case 'domain.rejected':
      return entry.timerId === undefined && entry.reasonCode !== undefined;
    case 'timer.fired':
      return (
        entry.domainRecordKey !== undefined &&
        entry.timerId !== undefined &&
        entry.reasonCode === undefined
      );
    case 'command.accepted':
      return entry.timerId === undefined && entry.reasonCode === undefined;
    default:
      return false;
  }
}
