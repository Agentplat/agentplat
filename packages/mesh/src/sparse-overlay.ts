import { sha256Base64Url } from './sha256.js';
import type {
  MeshSparseDeliveryV2,
  MeshSparseOverlayDigestV2,
  MeshSparseOverlayProfileIdV2,
  MeshSparseOverlayProfileV2,
  MeshSparseOverlayUpdateIdV2,
  MeshSparsePeerViewV2,
  MeshSparsePublishResultV2,
  MeshSparseReceiveResultV2,
  MeshSparseRecentUpdateV2,
  MeshSparseRoutingStateV2,
  MeshSparseUpdateV2,
} from './sparse-overlay-contracts.js';

export const MESH_SPARSE_OVERLAY_SCHEMA_VERSION_V2 = 2 as const;
export const MESH_SPARSE_OVERLAY_PROFILE_IDS_V2 = Object.freeze([
  'standard-500',
  'large-5000',
  'frontier-100000',
] as const);

const MAXIMUM_UPDATE_LIFETIME_V2 = 86_400_000;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const UPDATE_ID = /^overlay-update:[A-Za-z0-9_-]{43}$/u;
const TOPIC = /^[a-z0-9](?:[a-z0-9._/-]{0,126}[a-z0-9])?$/u;
const utf8 = new TextEncoder();
const emptyDeliveries = Object.freeze([]) as readonly [];
const profileIds = new Set<string>(MESH_SPARSE_OVERLAY_PROFILE_IDS_V2);

const profileKeys = [
  'activeNeighborCount',
  'maximumFanout',
  'maximumHops',
  'maximumInteractions',
  'maximumPeers',
  'maximumRecentUpdates',
  'profileDigest',
  'profileId',
  'reserveNeighborCount',
  'schemaVersion',
] as const;
const viewKeys = [
  'activeNeighborIndexes',
  'excludedNeighborIndexes',
  'peerId',
  'peerIndex',
  'profileDigest',
  'reserveNeighborIndexes',
  'revision',
  'schemaVersion',
  'topologySeed',
  'viewDigest',
] as const;
const stateKeys = [
  'acceptedRemoteUpdates',
  'lastLogicalTime',
  'maximumOutboundInteractions',
  'nextOriginSequence',
  'outboundInteractions',
  'profileDigest',
  'recentUpdates',
  'schemaVersion',
  'stateDigest',
  'view',
] as const;
const updateKeys = [
  'createdAtLogicalTime',
  'expiresAtLogicalTime',
  'maximumHops',
  'originPeerId',
  'originPeerIndex',
  'originSequence',
  'payloadDigest',
  'profileDigest',
  'schemaVersion',
  'topic',
  'updateDigest',
  'updateId',
] as const;
const deliveryKeys = [
  'deliveryDigest',
  'hop',
  'previousDeliveryDigest',
  'recipientPeerIndex',
  'schemaVersion',
  'senderPeerIndex',
  'senderViewDigest',
  'update',
] as const;

function profileBody(profileId: MeshSparseOverlayProfileIdV2) {
  const maximumPeers =
    profileId === 'standard-500'
      ? 500
      : profileId === 'large-5000'
        ? 5_000
        : 100_000;
  const maximumInteractions =
    profileId === 'standard-500'
      ? 5_000
      : profileId === 'large-5000'
        ? 50_000
        : 1_000_000;
  const activeNeighborCount = Math.ceil(Math.log2(maximumPeers));
  return {
    schemaVersion: 2 as const,
    profileId,
    maximumPeers: maximumPeers as 500 | 5_000 | 100_000,
    maximumInteractions: maximumInteractions as 5_000 | 50_000 | 1_000_000,
    activeNeighborCount,
    reserveNeighborCount: activeNeighborCount,
    maximumFanout: 2,
    maximumHops: activeNeighborCount * 2,
    maximumRecentUpdates: activeNeighborCount * 128,
  };
}

/** Returns one of the closed, immutable overlay scale profiles. */
export function meshSparseOverlayProfileV2(
  profileId: MeshSparseOverlayProfileIdV2
): MeshSparseOverlayProfileV2 {
  requireProfileId(profileId);
  const body = profileBody(profileId);
  return freeze({
    ...body,
    profileDigest: digest(body),
  }) as MeshSparseOverlayProfileV2;
}

export const MESH_SPARSE_OVERLAY_PROFILES_V2 = Object.freeze(
  MESH_SPARSE_OVERLAY_PROFILE_IDS_V2.map((profileId) =>
    meshSparseOverlayProfileV2(profileId)
  )
);

export function validateMeshSparseOverlayProfileV2(
  input: unknown
): MeshSparseOverlayProfileV2 {
  const value = exactRecord(input, profileKeys, [], 'sparse overlay profile');
  requireProfileId(value.profileId);
  const rebuilt = meshSparseOverlayProfileV2(value.profileId);
  if (!same(value, rebuilt)) fail('sparse overlay profile binding is invalid');
  return rebuilt;
}

/** Derives one peer's O(log N) active and reserve view without a global graph. */
export function createMeshSparsePeerViewV2(input: {
  readonly schemaVersion: 2;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly topologySeed: number;
  readonly peerIndex: number;
  readonly revision?: number;
  readonly excludedNeighborIndexes?: readonly number[];
}): MeshSparsePeerViewV2 {
  exactRecord(
    input,
    ['peerIndex', 'profile', 'schemaVersion', 'topologySeed'],
    ['excludedNeighborIndexes', 'revision'],
    'sparse peer view input'
  );
  if (input.schemaVersion !== 2) fail('sparse peer view schema is invalid');
  const profile = validateMeshSparseOverlayProfileV2(input.profile);
  safeInteger(input.topologySeed, 'topologySeed', 0, 0xffff_ffff);
  safeInteger(input.peerIndex, 'peerIndex', 0, profile.maximumPeers - 1);
  const revision = input.revision ?? 0;
  safeInteger(revision, 'revision', 0, Number.MAX_SAFE_INTEGER);
  const excluded = normalizeIndexes(
    input.excludedNeighborIndexes ?? [],
    profile,
    input.peerIndex,
    profile.activeNeighborCount + profile.reserveNeighborCount,
    'excludedNeighborIndexes'
  );
  return buildView(
    profile,
    input.topologySeed,
    input.peerIndex,
    revision,
    excluded
  );
}

export function validateMeshSparsePeerViewV2(
  profileInput: MeshSparseOverlayProfileV2,
  input: unknown
): MeshSparsePeerViewV2 {
  const profile = validateMeshSparseOverlayProfileV2(profileInput);
  const value = exactRecord(input, viewKeys, [], 'sparse peer view');
  if (value.schemaVersion !== 2) fail('sparse peer view schema is invalid');
  if (value.profileDigest !== profile.profileDigest)
    fail('sparse peer view profile binding is invalid');
  safeInteger(value.topologySeed, 'topologySeed', 0, 0xffff_ffff);
  safeInteger(value.peerIndex, 'peerIndex', 0, profile.maximumPeers - 1);
  safeInteger(value.revision, 'revision', 0, Number.MAX_SAFE_INTEGER);
  if (value.peerId !== peerId(profile, value.peerIndex))
    fail('sparse peer view peer identity is invalid');
  const excluded = normalizeIndexes(
    value.excludedNeighborIndexes,
    profile,
    value.peerIndex,
    profile.activeNeighborCount + profile.reserveNeighborCount,
    'excludedNeighborIndexes'
  );
  const active = normalizeIndexes(
    value.activeNeighborIndexes,
    profile,
    value.peerIndex,
    profile.activeNeighborCount,
    'activeNeighborIndexes',
    false
  );
  const reserve = normalizeIndexes(
    value.reserveNeighborIndexes,
    profile,
    value.peerIndex,
    profile.reserveNeighborCount,
    'reserveNeighborIndexes',
    false
  );
  if (
    active.length !== profile.activeNeighborCount ||
    reserve.length !== profile.reserveNeighborCount
  )
    fail('sparse peer view neighbor count is invalid');
  const combined = new Set([...active, ...reserve]);
  if (combined.size !== active.length + reserve.length)
    fail('sparse peer view neighbors overlap');
  if ([...combined].some((index) => excluded.includes(index)))
    fail('sparse peer view contains an excluded neighbor');
  const rebuilt = buildView(
    profile,
    value.topologySeed,
    value.peerIndex,
    value.revision,
    excluded
  );
  if (!same(value, rebuilt)) fail('sparse peer view binding is invalid');
  return rebuilt;
}

/** Promotes reserves and deterministically refills one local view. */
export function refreshMeshSparsePeerViewV2(input: {
  readonly schemaVersion: 2;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly view: MeshSparsePeerViewV2;
  readonly excludedNeighborIndexes: readonly number[];
}): MeshSparsePeerViewV2 {
  exactRecord(
    input,
    ['excludedNeighborIndexes', 'profile', 'schemaVersion', 'view'],
    [],
    'sparse peer view refresh input'
  );
  if (input.schemaVersion !== 2)
    fail('sparse peer view refresh schema is invalid');
  const profile = validateMeshSparseOverlayProfileV2(input.profile);
  const view = validateMeshSparsePeerViewV2(profile, input.view);
  if (view.revision === Number.MAX_SAFE_INTEGER)
    fail('sparse peer view revision is exhausted');
  const excluded = normalizeIndexes(
    input.excludedNeighborIndexes,
    profile,
    view.peerIndex,
    profile.activeNeighborCount + profile.reserveNeighborCount,
    'excludedNeighborIndexes'
  );
  return buildView(
    profile,
    view.topologySeed,
    view.peerIndex,
    view.revision + 1,
    excluded
  );
}

/** Constructs a bounded local routing state and exact outbound quota. */
export function createMeshSparseRoutingStateV2(input: {
  readonly schemaVersion: 2;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly view: MeshSparsePeerViewV2;
  readonly logicalTime?: number;
}): MeshSparseRoutingStateV2 {
  exactRecord(
    input,
    ['profile', 'schemaVersion', 'view'],
    ['logicalTime'],
    'sparse routing state input'
  );
  if (input.schemaVersion !== 2) fail('sparse routing state schema is invalid');
  const profile = validateMeshSparseOverlayProfileV2(input.profile);
  const view = validateMeshSparsePeerViewV2(profile, input.view);
  const logicalTime = input.logicalTime ?? 0;
  safeInteger(logicalTime, 'logicalTime', 0, Number.MAX_SAFE_INTEGER);
  return buildState({
    profile,
    view,
    recentUpdates: [],
    nextOriginSequence: 1,
    maximumOutboundInteractions: outboundQuota(profile, view.peerIndex),
    outboundInteractions: 0,
    acceptedRemoteUpdates: 0,
    lastLogicalTime: logicalTime,
  });
}

export function validateMeshSparseRoutingStateV2(
  profileInput: MeshSparseOverlayProfileV2,
  input: unknown
): MeshSparseRoutingStateV2 {
  const profile = validateMeshSparseOverlayProfileV2(profileInput);
  const value = exactRecord(input, stateKeys, [], 'sparse routing state');
  if (value.schemaVersion !== 2) fail('sparse routing state schema is invalid');
  if (value.profileDigest !== profile.profileDigest)
    fail('sparse routing state profile binding is invalid');
  const view = validateMeshSparsePeerViewV2(profile, value.view);
  safeInteger(
    value.nextOriginSequence,
    'nextOriginSequence',
    1,
    Number.MAX_SAFE_INTEGER
  );
  safeInteger(
    value.maximumOutboundInteractions,
    'maximumOutboundInteractions',
    0,
    profile.maximumInteractions
  );
  if (
    value.maximumOutboundInteractions !== outboundQuota(profile, view.peerIndex)
  )
    fail('sparse routing outbound quota is invalid');
  safeInteger(
    value.outboundInteractions,
    'outboundInteractions',
    0,
    value.maximumOutboundInteractions
  );
  safeInteger(
    value.acceptedRemoteUpdates,
    'acceptedRemoteUpdates',
    0,
    Number.MAX_SAFE_INTEGER
  );
  safeInteger(
    value.lastLogicalTime,
    'lastLogicalTime',
    0,
    Number.MAX_SAFE_INTEGER
  );
  const recentUpdates = normalizeRecentUpdates(
    value.recentUpdates,
    profile.maximumRecentUpdates
  );
  if (
    recentUpdates.some(
      (entry) => entry.expiresAtLogicalTime <= value.lastLogicalTime
    )
  )
    fail('sparse routing state retains an expired update');
  const rebuilt = buildState({
    profile,
    view,
    recentUpdates,
    nextOriginSequence: value.nextOriginSequence,
    maximumOutboundInteractions: value.maximumOutboundInteractions,
    outboundInteractions: value.outboundInteractions,
    acceptedRemoteUpdates: value.acceptedRemoteUpdates,
    lastLogicalTime: value.lastLogicalTime,
  });
  if (!same(value, rebuilt)) fail('sparse routing state binding is invalid');
  return rebuilt;
}

/** Refreshes the construction-bound view without resetting counters or dedupe. */
export function refreshMeshSparseRoutingStateV2(input: {
  readonly schemaVersion: 2;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly state: MeshSparseRoutingStateV2;
  readonly excludedNeighborIndexes: readonly number[];
  readonly logicalTime: number;
}): MeshSparseRoutingStateV2 {
  exactRecord(
    input,
    [
      'excludedNeighborIndexes',
      'logicalTime',
      'profile',
      'schemaVersion',
      'state',
    ],
    [],
    'sparse routing refresh input'
  );
  if (input.schemaVersion !== 2)
    fail('sparse routing refresh schema is invalid');
  const profile = validateMeshSparseOverlayProfileV2(input.profile);
  const state = validateMeshSparseRoutingStateV2(profile, input.state);
  logicalTime(input.logicalTime, state.lastLogicalTime);
  const view = refreshMeshSparsePeerViewV2({
    schemaVersion: 2,
    profile,
    view: state.view,
    excludedNeighborIndexes: input.excludedNeighborIndexes,
  });
  return buildState({
    profile,
    view,
    recentUpdates: pruneRecent(state.recentUpdates, input.logicalTime),
    nextOriginSequence: state.nextOriginSequence,
    maximumOutboundInteractions: state.maximumOutboundInteractions,
    outboundInteractions: state.outboundInteractions,
    acceptedRemoteUpdates: state.acceptedRemoteUpdates,
    lastLogicalTime: input.logicalTime,
  });
}

/** Creates one local update plus a bounded, budget-accounted first fanout. */
export function publishMeshSparseUpdateV2(input: {
  readonly schemaVersion: 2;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly state: MeshSparseRoutingStateV2;
  readonly topic: string;
  readonly payloadDigest: MeshSparseOverlayDigestV2;
  readonly logicalTime: number;
  readonly lifetime: number;
  readonly fanout?: number;
}): MeshSparsePublishResultV2 {
  exactRecord(
    input,
    [
      'lifetime',
      'logicalTime',
      'payloadDigest',
      'profile',
      'schemaVersion',
      'state',
      'topic',
    ],
    ['fanout'],
    'sparse publish input'
  );
  if (input.schemaVersion !== 2) fail('sparse publish schema is invalid');
  const profile = validateMeshSparseOverlayProfileV2(input.profile);
  const state = validateMeshSparseRoutingStateV2(profile, input.state);
  logicalTime(input.logicalTime, state.lastLogicalTime);
  topic(input.topic);
  assertDigest(input.payloadDigest, 'payloadDigest');
  safeInteger(input.lifetime, 'lifetime', 1, MAXIMUM_UPDATE_LIFETIME_V2);
  if (input.logicalTime > Number.MAX_SAFE_INTEGER - input.lifetime)
    fail('sparse update expiry exceeds safe logical time');
  const fanout = input.fanout ?? profile.maximumFanout;
  safeInteger(fanout, 'fanout', 1, profile.maximumFanout);
  if (state.nextOriginSequence === Number.MAX_SAFE_INTEGER)
    fail('sparse update origin sequence is exhausted');
  const update = buildUpdate({
    profile,
    originPeerIndex: state.view.peerIndex,
    originSequence: state.nextOriginSequence,
    topic: input.topic,
    payloadDigest: input.payloadDigest,
    createdAtLogicalTime: input.logicalTime,
    expiresAtLogicalTime: input.logicalTime + input.lifetime,
  });
  const recent = pruneRecent(state.recentUpdates, input.logicalTime);
  if (recent.length >= profile.maximumRecentUpdates)
    fail('sparse recent update capacity is exhausted');
  const withUpdate = insertRecent(recent, update);
  const available =
    state.maximumOutboundInteractions - state.outboundInteractions;
  const recipientIndexes = selectRecipients(
    state.view,
    update,
    0,
    null,
    Math.min(fanout, available)
  );
  const deliveries = Object.freeze(
    recipientIndexes.map((recipientPeerIndex) =>
      buildDelivery({
        update,
        senderView: state.view,
        recipientPeerIndex,
        hop: 1,
        previousDeliveryDigest: null,
      })
    )
  );
  const nextState = buildState({
    profile,
    view: state.view,
    recentUpdates: withUpdate,
    nextOriginSequence: state.nextOriginSequence + 1,
    maximumOutboundInteractions: state.maximumOutboundInteractions,
    outboundInteractions: state.outboundInteractions + deliveries.length,
    acceptedRemoteUpdates: state.acceptedRemoteUpdates,
    lastLogicalTime: input.logicalTime,
  });
  return freeze({
    state: nextState,
    update,
    deliveries,
  }) as MeshSparsePublishResultV2;
}

export function validateMeshSparseUpdateV2(
  profileInput: MeshSparseOverlayProfileV2,
  input: unknown
): MeshSparseUpdateV2 {
  const profile = validateMeshSparseOverlayProfileV2(profileInput);
  const value = exactRecord(input, updateKeys, [], 'sparse update');
  if (value.schemaVersion !== 2) fail('sparse update schema is invalid');
  if (value.profileDigest !== profile.profileDigest)
    fail('sparse update profile binding is invalid');
  safeInteger(
    value.originPeerIndex,
    'originPeerIndex',
    0,
    profile.maximumPeers - 1
  );
  if (value.originPeerId !== peerId(profile, value.originPeerIndex))
    fail('sparse update origin identity is invalid');
  safeInteger(
    value.originSequence,
    'originSequence',
    1,
    Number.MAX_SAFE_INTEGER
  );
  topic(value.topic);
  assertDigest(value.payloadDigest, 'payloadDigest');
  safeInteger(
    value.createdAtLogicalTime,
    'createdAtLogicalTime',
    0,
    Number.MAX_SAFE_INTEGER
  );
  safeInteger(
    value.expiresAtLogicalTime,
    'expiresAtLogicalTime',
    1,
    Number.MAX_SAFE_INTEGER
  );
  if (
    value.expiresAtLogicalTime <= value.createdAtLogicalTime ||
    value.expiresAtLogicalTime - value.createdAtLogicalTime >
      MAXIMUM_UPDATE_LIFETIME_V2
  )
    fail('sparse update lifetime is invalid');
  if (value.maximumHops !== profile.maximumHops)
    fail('sparse update hop binding is invalid');
  if (typeof value.updateId !== 'string' || !UPDATE_ID.test(value.updateId))
    fail('sparse update ID is invalid');
  assertDigest(value.updateDigest, 'updateDigest');
  const rebuilt = buildUpdate({
    profile,
    originPeerIndex: value.originPeerIndex,
    originSequence: value.originSequence,
    topic: value.topic,
    payloadDigest: value.payloadDigest,
    createdAtLogicalTime: value.createdAtLogicalTime,
    expiresAtLogicalTime: value.expiresAtLogicalTime,
  });
  if (!same(value, rebuilt)) fail('sparse update binding is invalid');
  return rebuilt;
}

export function validateMeshSparseDeliveryV2(
  profileInput: MeshSparseOverlayProfileV2,
  input: unknown
): MeshSparseDeliveryV2 {
  const profile = validateMeshSparseOverlayProfileV2(profileInput);
  const value = exactRecord(input, deliveryKeys, [], 'sparse delivery');
  if (value.schemaVersion !== 2) fail('sparse delivery schema is invalid');
  const update = validateMeshSparseUpdateV2(profile, value.update);
  safeInteger(
    value.senderPeerIndex,
    'senderPeerIndex',
    0,
    profile.maximumPeers - 1
  );
  safeInteger(
    value.recipientPeerIndex,
    'recipientPeerIndex',
    0,
    profile.maximumPeers - 1
  );
  if (value.senderPeerIndex === value.recipientPeerIndex)
    fail('sparse delivery cannot target its sender');
  safeInteger(value.hop, 'hop', 1, profile.maximumHops + 1);
  assertDigest(value.senderViewDigest, 'senderViewDigest');
  if (value.previousDeliveryDigest !== null)
    assertDigest(value.previousDeliveryDigest, 'previousDeliveryDigest');
  if (value.hop === 1 && value.previousDeliveryDigest !== null)
    fail('sparse first delivery cannot have a predecessor');
  if (value.hop > 1 && value.previousDeliveryDigest === null)
    fail('sparse forwarded delivery requires a predecessor');
  assertDigest(value.deliveryDigest, 'deliveryDigest');
  const rebuilt = buildDelivery({
    update,
    senderView: {
      peerIndex: value.senderPeerIndex,
      viewDigest: value.senderViewDigest,
    },
    recipientPeerIndex: value.recipientPeerIndex,
    hop: value.hop,
    previousDeliveryDigest: value.previousDeliveryDigest,
  });
  if (!same(value, rebuilt)) fail('sparse delivery binding is invalid');
  return rebuilt;
}

/** Accepts one authenticated transport delivery and plans bounded forwarding. */
export function receiveMeshSparseDeliveryV2(input: {
  readonly schemaVersion: 2;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly state: MeshSparseRoutingStateV2;
  readonly delivery: MeshSparseDeliveryV2;
  readonly logicalTime: number;
}): MeshSparseReceiveResultV2 {
  exactRecord(
    input,
    ['delivery', 'logicalTime', 'profile', 'schemaVersion', 'state'],
    [],
    'sparse receive input'
  );
  if (input.schemaVersion !== 2) fail('sparse receive schema is invalid');
  const profile = validateMeshSparseOverlayProfileV2(input.profile);
  const state = validateMeshSparseRoutingStateV2(profile, input.state);
  logicalTime(input.logicalTime, state.lastLogicalTime);
  const rawUpdate = dataProperty(input.delivery, 'update');
  const rawProfileDigest = dataProperty(rawUpdate, 'profileDigest');
  if (rawProfileDigest !== profile.profileDigest)
    return rejection(state, 'profile_mismatch');
  const delivery = validateMeshSparseDeliveryV2(profile, input.delivery);
  if (delivery.recipientPeerIndex !== state.view.peerIndex)
    return rejection(state, 'recipient_mismatch');
  if (input.logicalTime < delivery.update.createdAtLogicalTime)
    fail('sparse delivery logical time precedes update creation');
  if (input.logicalTime >= delivery.update.expiresAtLogicalTime)
    return rejection(state, 'update_expired');
  if (delivery.hop > delivery.update.maximumHops)
    return rejection(state, 'hop_limit_exceeded');
  const recent = pruneRecent(state.recentUpdates, input.logicalTime);
  if (recent.some((entry) => entry.updateId === delivery.update.updateId)) {
    const next = buildState({
      profile,
      view: state.view,
      recentUpdates: recent,
      nextOriginSequence: state.nextOriginSequence,
      maximumOutboundInteractions: state.maximumOutboundInteractions,
      outboundInteractions: state.outboundInteractions,
      acceptedRemoteUpdates: state.acceptedRemoteUpdates,
      lastLogicalTime: input.logicalTime,
    });
    return freeze({
      accepted: true as const,
      duplicate: true as const,
      state: next,
      deliveries: emptyDeliveries,
    }) as MeshSparseReceiveResultV2;
  }
  if (recent.length >= profile.maximumRecentUpdates)
    return rejection(state, 'recent_update_capacity_exceeded');
  const withUpdate = insertRecent(recent, delivery.update);
  const available =
    state.maximumOutboundInteractions - state.outboundInteractions;
  const forwardCount =
    delivery.hop < delivery.update.maximumHops
      ? Math.min(profile.maximumFanout, available)
      : 0;
  const recipientIndexes = selectRecipients(
    state.view,
    delivery.update,
    delivery.hop,
    delivery.senderPeerIndex,
    forwardCount
  );
  const deliveries = Object.freeze(
    recipientIndexes.map((recipientPeerIndex) =>
      buildDelivery({
        update: delivery.update,
        senderView: state.view,
        recipientPeerIndex,
        hop: delivery.hop + 1,
        previousDeliveryDigest: delivery.deliveryDigest,
      })
    )
  );
  const next = buildState({
    profile,
    view: state.view,
    recentUpdates: withUpdate,
    nextOriginSequence: state.nextOriginSequence,
    maximumOutboundInteractions: state.maximumOutboundInteractions,
    outboundInteractions: state.outboundInteractions + deliveries.length,
    acceptedRemoteUpdates: state.acceptedRemoteUpdates + 1,
    lastLogicalTime: input.logicalTime,
  });
  return freeze({
    accepted: true as const,
    duplicate: false as const,
    state: next,
    deliveries,
  }) as MeshSparseReceiveResultV2;
}

function buildView(
  profile: MeshSparseOverlayProfileV2,
  topologySeed: number,
  peerIndex: number,
  revision: number,
  excludedNeighborIndexes: readonly number[]
): MeshSparsePeerViewV2 {
  const excluded = new Set(excludedNeighborIndexes);
  const selected: number[] = [];
  const selectedSet = new Set<number>();
  const add = (candidate: number) => {
    if (
      candidate !== peerIndex &&
      !excluded.has(candidate) &&
      !selectedSet.has(candidate)
    ) {
      selectedSet.add(candidate);
      selected.push(candidate);
    }
  };
  const successor = (peerIndex + 1) % profile.maximumPeers;
  add(successor);
  const needed = profile.activeNeighborCount + profile.reserveNeighborCount;
  const modulus = profile.maximumPeers - 1;
  const stride = coprimeMultiplier(
    modulus,
    mix32(topologySeed ^ peerIndex ^ 0x85eb_ca6b)
  );
  const offset =
    mix32(topologySeed + Math.imul(peerIndex + 1, 0x9e37_79b1)) % modulus;
  const revisionWindow =
    ((revision % modulus) * (profile.activeNeighborCount - 1)) % modulus;
  for (let slot = 0; selected.length < needed && slot < modulus; slot += 1) {
    const position = (revisionWindow + slot) % modulus;
    const jump = 1 + ((offset + Math.imul(position, stride)) % modulus);
    add((peerIndex + jump) % profile.maximumPeers);
  }
  if (selected.length !== needed)
    fail('sparse peer view cannot satisfy neighbor bounds');
  const activeNeighborIndexes = Object.freeze(
    selected.slice(0, profile.activeNeighborCount)
  );
  const reserveNeighborIndexes = Object.freeze(
    selected.slice(profile.activeNeighborCount)
  );
  const body = {
    schemaVersion: 2 as const,
    profileDigest: profile.profileDigest,
    topologySeed,
    peerIndex,
    peerId: peerId(profile, peerIndex),
    revision,
    activeNeighborIndexes,
    reserveNeighborIndexes,
    excludedNeighborIndexes: Object.freeze([...excludedNeighborIndexes]),
  };
  return freeze({ ...body, viewDigest: digest(body) }) as MeshSparsePeerViewV2;
}

function buildState(input: {
  readonly profile: MeshSparseOverlayProfileV2;
  readonly view: MeshSparsePeerViewV2;
  readonly recentUpdates: readonly MeshSparseRecentUpdateV2[];
  readonly nextOriginSequence: number;
  readonly maximumOutboundInteractions: number;
  readonly outboundInteractions: number;
  readonly acceptedRemoteUpdates: number;
  readonly lastLogicalTime: number;
}): MeshSparseRoutingStateV2 {
  const body = {
    schemaVersion: 2 as const,
    profileDigest: input.profile.profileDigest,
    view: input.view,
    recentUpdates: Object.freeze([...input.recentUpdates]),
    nextOriginSequence: input.nextOriginSequence,
    maximumOutboundInteractions: input.maximumOutboundInteractions,
    outboundInteractions: input.outboundInteractions,
    acceptedRemoteUpdates: input.acceptedRemoteUpdates,
    lastLogicalTime: input.lastLogicalTime,
  };
  return freeze({
    ...body,
    stateDigest: digest(body),
  }) as MeshSparseRoutingStateV2;
}

function buildUpdate(input: {
  readonly profile: MeshSparseOverlayProfileV2;
  readonly originPeerIndex: number;
  readonly originSequence: number;
  readonly topic: string;
  readonly payloadDigest: MeshSparseOverlayDigestV2;
  readonly createdAtLogicalTime: number;
  readonly expiresAtLogicalTime: number;
}): MeshSparseUpdateV2 {
  const identity = {
    schemaVersion: 2 as const,
    profileDigest: input.profile.profileDigest,
    originPeerIndex: input.originPeerIndex,
    originPeerId: peerId(input.profile, input.originPeerIndex),
    originSequence: input.originSequence,
    topic: input.topic,
    payloadDigest: input.payloadDigest,
    createdAtLogicalTime: input.createdAtLogicalTime,
    expiresAtLogicalTime: input.expiresAtLogicalTime,
    maximumHops: input.profile.maximumHops,
  };
  const identityDigest = digest(identity);
  const updateId =
    `overlay-update:${identityDigest.slice('sha256:'.length)}` as const;
  const body = { ...identity, updateId };
  return freeze({ ...body, updateDigest: digest(body) }) as MeshSparseUpdateV2;
}

function buildDelivery(input: {
  readonly update: MeshSparseUpdateV2;
  readonly senderView: Pick<MeshSparsePeerViewV2, 'peerIndex' | 'viewDigest'>;
  readonly recipientPeerIndex: number;
  readonly hop: number;
  readonly previousDeliveryDigest: MeshSparseOverlayDigestV2 | null;
}): MeshSparseDeliveryV2 {
  const body = {
    schemaVersion: 2 as const,
    update: input.update,
    senderPeerIndex: input.senderView.peerIndex,
    recipientPeerIndex: input.recipientPeerIndex,
    hop: input.hop,
    senderViewDigest: input.senderView.viewDigest,
    previousDeliveryDigest: input.previousDeliveryDigest,
  };
  return freeze({
    ...body,
    deliveryDigest: digest(body),
  }) as MeshSparseDeliveryV2;
}

function selectRecipients(
  view: MeshSparsePeerViewV2,
  update: MeshSparseUpdateV2,
  hop: number,
  excludedPeerIndex: number | null,
  count: number
): readonly number[] {
  if (count === 0) return Object.freeze([]);
  const candidates = view.activeNeighborIndexes.filter(
    (index) => index !== excludedPeerIndex
  );
  if (candidates.length === 0) return Object.freeze([]);
  const selected: number[] = [];
  const successor =
    (view.peerIndex + 1) % profileMaximumPeers(update.profileDigest);
  if (candidates.includes(successor)) selected.push(successor);
  const offset =
    stringHash32(
      `${update.updateDigest}:${view.peerIndex}:${hop}:${view.revision}`
    ) % candidates.length;
  for (
    let slot = 0;
    selected.length < count && slot < candidates.length;
    slot += 1
  ) {
    const candidate = candidates[(offset + slot) % candidates.length];
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return Object.freeze(selected.slice(0, count));
}

function profileMaximumPeers(profileDigest: MeshSparseOverlayDigestV2): number {
  const profile = MESH_SPARSE_OVERLAY_PROFILES_V2.find(
    (candidate) => candidate.profileDigest === profileDigest
  );
  if (!profile) fail('sparse overlay profile digest is unknown');
  return profile.maximumPeers;
}

function outboundQuota(
  profile: MeshSparseOverlayProfileV2,
  peerIndex: number
): number {
  const base = Math.floor(profile.maximumInteractions / profile.maximumPeers);
  const remainder = profile.maximumInteractions % profile.maximumPeers;
  return base + (peerIndex < remainder ? 1 : 0);
}

function insertRecent(
  recent: readonly MeshSparseRecentUpdateV2[],
  update: MeshSparseUpdateV2
): readonly MeshSparseRecentUpdateV2[] {
  return Object.freeze(
    [
      ...recent,
      Object.freeze({
        updateId: update.updateId,
        expiresAtLogicalTime: update.expiresAtLogicalTime,
      }),
    ].sort(compareRecent)
  );
}

function pruneRecent(
  recent: readonly MeshSparseRecentUpdateV2[],
  logicalTimeValue: number
): readonly MeshSparseRecentUpdateV2[] {
  return Object.freeze(
    recent.filter((entry) => entry.expiresAtLogicalTime > logicalTimeValue)
  );
}

function normalizeRecentUpdates(
  input: unknown,
  maximum: number
): readonly MeshSparseRecentUpdateV2[] {
  const values = denseArray(input, maximum, 'recentUpdates');
  const normalized: MeshSparseRecentUpdateV2[] = [];
  const ids = new Set<string>();
  for (const entry of values) {
    const value = exactRecord(
      entry,
      ['expiresAtLogicalTime', 'updateId'],
      [],
      'recent update'
    );
    if (typeof value.updateId !== 'string' || !UPDATE_ID.test(value.updateId))
      fail('recent update ID is invalid');
    if (ids.has(value.updateId)) fail('recent update IDs must be unique');
    ids.add(value.updateId);
    safeInteger(
      value.expiresAtLogicalTime,
      'recent update expiresAtLogicalTime',
      1,
      Number.MAX_SAFE_INTEGER
    );
    normalized.push(
      Object.freeze({
        updateId: value.updateId as MeshSparseOverlayUpdateIdV2,
        expiresAtLogicalTime: value.expiresAtLogicalTime,
      })
    );
  }
  const sorted = [...normalized].sort(compareRecent);
  if (normalized.some((entry, index) => entry !== sorted[index]))
    fail('recent updates must be canonically ordered');
  return Object.freeze(normalized);
}

function compareRecent(
  left: MeshSparseRecentUpdateV2,
  right: MeshSparseRecentUpdateV2
): number {
  return (
    left.expiresAtLogicalTime - right.expiresAtLogicalTime ||
    compareAscii(left.updateId, right.updateId)
  );
}

function normalizeIndexes(
  input: unknown,
  profile: MeshSparseOverlayProfileV2,
  peerIndex: number,
  maximum: number,
  label: string,
  requireSorted = true
): readonly number[] {
  const values = denseArray(input, maximum, label);
  const normalized: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    safeInteger(value, label, 0, profile.maximumPeers - 1);
    if (value === peerIndex) fail(`${label} cannot contain the local peer`);
    if (seen.has(value)) fail(`${label} must contain unique indexes`);
    seen.add(value);
    normalized.push(value);
  }
  if (requireSorted) {
    const sorted = [...normalized].sort((left, right) => left - right);
    if (normalized.some((value, index) => value !== sorted[index]))
      fail(`${label} must be sorted`);
  }
  return Object.freeze(normalized);
}

function rejection(
  state: MeshSparseRoutingStateV2,
  code:
    | 'profile_mismatch'
    | 'recipient_mismatch'
    | 'update_expired'
    | 'hop_limit_exceeded'
    | 'recent_update_capacity_exceeded'
): MeshSparseReceiveResultV2 {
  return freeze({
    accepted: false as const,
    code,
    state,
    deliveries: emptyDeliveries,
  }) as MeshSparseReceiveResultV2;
}

function peerId(
  profile: MeshSparseOverlayProfileV2,
  peerIndex: number
): string {
  return `peer-${String(peerIndex).padStart(String(profile.maximumPeers - 1).length, '0')}`;
}

function coprimeMultiplier(modulus: number, seed: number): number {
  let candidate = seed % modulus || 1;
  while (greatestCommonDivisor(candidate, modulus) !== 1) {
    candidate += 1;
    if (candidate >= modulus) candidate = 1;
  }
  return candidate;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function mix32(value: number): number {
  let output = value >>> 0;
  output ^= output >>> 16;
  output = Math.imul(output, 0x7feb_352d);
  output ^= output >>> 15;
  output = Math.imul(output, 0x846c_a68b);
  output ^= output >>> 16;
  return output >>> 0;
}

function stringHash32(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function logicalTime(
  value: unknown,
  previous: number
): asserts value is number {
  safeInteger(value, 'logicalTime', previous, Number.MAX_SAFE_INTEGER);
}

function topic(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !TOPIC.test(value))
    fail('sparse update topic is invalid');
}

function requireProfileId(
  value: unknown
): asserts value is MeshSparseOverlayProfileIdV2 {
  if (typeof value !== 'string' || !profileIds.has(value))
    fail('sparse overlay profile ID is invalid');
}

function assertDigest(
  value: unknown,
  label: string
): asserts value is MeshSparseOverlayDigestV2 {
  if (typeof value !== 'string' || !DIGEST.test(value))
    fail(`${label} is invalid`);
}

function safeInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    fail(`${label} is outside its allowed range`);
}

function denseArray(
  value: unknown,
  maximum: number,
  label: string
): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    fail(`${label} must be a bounded array`);
  for (let index = 0; index < value.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(value, index))
      fail(`${label} cannot be sparse`);
  return value;
}

function exactRecord<R extends readonly string[], O extends readonly string[]>(
  value: unknown,
  required: R,
  optional: O,
  label: string
): Record<R[number], any> & Partial<Record<O[number], any>> {
  if (!isRecord(value)) fail(`${label} must be a plain object`);
  if (Object.getOwnPropertySymbols(value).length !== 0)
    fail(`${label} cannot contain symbol keys`);
  const allowed = new Set<string>([...required, ...optional]);
  const names = Object.getOwnPropertyNames(value);
  if (
    required.some((key) => !names.includes(key)) ||
    names.some((key) => !allowed.has(key))
  )
    fail(`${label} has invalid fields`);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail(`${label} must contain enumerable data properties only`);
  }
  return value as Record<R[number], any> & Partial<Record<O[number], any>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function dataProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function digest(value: unknown): MeshSparseOverlayDigestV2 {
  return `sha256:${sha256Base64Url(utf8.encode(stableJson(value)))}`;
}

function same(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      fail('sparse overlay JSON number is invalid');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!isRecord(value)) fail('sparse overlay value is not canonical JSON data');
  return `{${Object.keys(value)
    .sort(compareAscii)
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>))
      freeze(child);
    Object.freeze(value);
  }
  return value;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message: string): never {
  throw new TypeError(message);
}
