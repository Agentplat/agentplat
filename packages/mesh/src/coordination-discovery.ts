import {
  compareMeshTimestamps,
  validateMeshEnvelopeContext,
  type CapabilityAdvertisePayload,
  type MeshAudienceTopic,
  type PeerCardPayload,
  type VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';

import type {
  MeshCapabilityMatch,
  MeshCapabilityMatchEvaluation,
  MeshCapabilityMatchReason,
  MeshCapabilityMatchResult,
  MeshCapabilityProjection,
  MeshCapabilityRequirement,
  MeshDiscoveryAdvanceDecision,
  MeshDiscoveryDecision,
  MeshDiscoveryLimits,
  MeshDiscoveryPayload,
  MeshDiscoveryRejectionCode,
  MeshDiscoveryRuntimeState,
  MeshPeerCardProjection,
  MeshPeerViewProjection,
  MeshVerifiedDiscoveryRequest,
} from './coordination-discovery-contracts.js';
import {
  assertFrozenMeshDiscoveryState,
  createMeshDiscoveryRuntimeState,
} from './coordination-discovery-state.js';
import type {
  MeshCoordinationDomainRecord,
  MeshCoordinationJournalEntry,
  MeshCoordinationState,
} from './coordination-contracts.js';
import { assertFrozenMeshCoordinationState } from './coordination-state.js';
import {
  assertMeshLogicalTime,
  createFrozenRecord,
  recordEntries,
} from './state.js';

const payloadDigestPattern = /^[A-Za-z0-9_-]{43}$/;
const utf8Encoder = new TextEncoder();

/**
 * Applies one already-verified discovery record. Signature verification and
 * key resolution remain the responsibility of the next inbound-boundary slice.
 */
export function evaluateVerifiedMeshDiscoveryEnvelope(
  state: MeshDiscoveryRuntimeState,
  request: MeshVerifiedDiscoveryRequest
): MeshDiscoveryDecision {
  assertRuntimeState(state);
  if (!request || typeof request !== 'object') {
    throw new TypeError('Mesh verified discovery request is required');
  }
  assertExactKeys(
    request,
    ['envelope', 'receivedAt', 'supportedCriticalExtensions', 'verifiedAt'],
    ['envelope', 'receivedAt', 'verifiedAt']
  );
  if (
    request.supportedCriticalExtensions !== undefined &&
    (!Array.isArray(request.supportedCriticalExtensions) ||
      request.supportedCriticalExtensions.some(
        (extension) => typeof extension !== 'string' || extension.length < 1
      ) ||
      new Set(request.supportedCriticalExtensions).size !==
        request.supportedCriticalExtensions.length)
  ) {
    throw new TypeError(
      'Mesh discovery supported critical extensions are invalid'
    );
  }
  assertMeshLogicalTime(request.receivedAt);
  if (
    request.receivedAt < state.coordination.lastLogicalTime ||
    request.receivedAt < state.discovery.lastLogicalTime
  ) {
    throw new RangeError('Mesh discovery logical time cannot move backwards');
  }
  const envelope = request.envelope;
  const contextFailure = validateContext(state, request);
  if (contextFailure) return rejection(state, contextFailure);
  const commonFailure = validateCommon(state, envelope, request.verifiedAt);
  if (commonFailure) return rejection(state, commonFailure);

  const metadata = domainMetadata(envelope);
  const existing = state.coordination.domainRecords[metadata.recordKey];
  if (existing) {
    return existing.contentDigest === metadata.contentDigest &&
      isExactProjectedDuplicate(state, envelope, existing.messageId)
      ? Object.freeze({ accepted: true, duplicate: true, state })
      : rejection(state, 'domain_record_conflict');
  }
  if (
    Object.keys(state.coordination.domainRecords).length >=
    state.coordination.limits.maximumDomainRecords
  ) {
    return rejection(state, 'domain_capacity_exceeded');
  }
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  ) {
    return rejection(state, 'journal_capacity_exceeded');
  }

  const decision = evaluatePayload(state, request, metadata);
  if ('code' in decision) return rejection(state, decision.code);
  return acceptRecord(state, request, metadata, decision.discovery);
}

/** Materializes expiry using only caller-supplied logical time. */
export function advanceMeshDiscoveryState(
  state: MeshDiscoveryRuntimeState,
  logicalTime: number
): MeshDiscoveryAdvanceDecision {
  assertRuntimeState(state);
  assertMeshLogicalTime(logicalTime);
  if (
    logicalTime < state.coordination.lastLogicalTime ||
    logicalTime < state.discovery.lastLogicalTime
  ) {
    throw new RangeError('Mesh discovery logical time cannot move backwards');
  }

  const expiredCardIds = new Set<string>();
  const peerCards = recordEntries(state.discovery.peerCards).map(
    ([peerId, card]) => {
      if (card.status !== 'active' || card.expiresAt > logicalTime) {
        return [peerId, card] as const;
      }
      expiredCardIds.add(peerId);
      return [
        peerId,
        Object.freeze({ ...card, status: 'expired' as const }),
      ] as const;
    }
  );
  const capabilities = recordEntries(state.discovery.capabilities).map(
    ([key, capability]) => {
      if (capability.status !== 'active') return [key, capability] as const;
      const card = state.discovery.peerCards[capability.ownerPeerId];
      if (capability.expiresAt <= logicalTime) {
        return [
          key,
          Object.freeze({ ...capability, status: 'expired' as const }),
        ] as const;
      }
      if (
        !card ||
        card.status !== 'active' ||
        expiredCardIds.has(card.peerId)
      ) {
        return [
          key,
          Object.freeze({
            ...capability,
            status: card?.status === 'departed' ? 'departed' : 'expired',
          }),
        ] as const;
      }
      return [key, capability] as const;
    }
  );
  const changedCards = peerCards.filter(
    ([peerId, card]) => card !== state.discovery.peerCards[peerId]
  );
  const changedCapabilities = capabilities.filter(
    ([key, capability]) => capability !== state.discovery.capabilities[key]
  );
  const expiredRecords = changedCards.length + changedCapabilities.length;
  if (
    state.coordination.journal.length + expiredRecords >
    state.coordination.limits.maximumJournalEntries
  ) {
    return Object.freeze({
      accepted: false,
      code: 'journal_capacity_exceeded',
      state,
    });
  }
  if (
    state.coordination.localEventSequence >
    Number.MAX_SAFE_INTEGER - expiredRecords
  ) {
    throw new RangeError('Mesh coordination event sequence exhausted');
  }

  const journalEntries: MeshCoordinationJournalEntry[] = [];
  for (const [, card] of changedCards) {
    journalEntries.push(
      expiryJournalEntry(
        state,
        journalEntries.length,
        logicalTime,
        JSON.stringify(['peer.card', card.peerCardId])
      )
    );
  }
  for (const [, capability] of changedCapabilities) {
    journalEntries.push(
      expiryJournalEntry(
        state,
        journalEntries.length,
        logicalTime,
        JSON.stringify(['capability.advertise', capability.advertisementId])
      )
    );
  }

  const coordination = Object.freeze({
    ...state.coordination,
    journal: Object.freeze([...state.coordination.journal, ...journalEntries]),
    localEventSequence: state.coordination.localEventSequence + expiredRecords,
    lastLogicalTime: logicalTime,
  });
  const discovery = Object.freeze({
    ...state.discovery,
    peerCards: createFrozenRecord(peerCards),
    peerViews: createFrozenRecord(
      recordEntries(state.discovery.peerViews).filter(
        ([peerId, view]) =>
          view.expiresAt > logicalTime &&
          !expiredCardIds.has(peerId) &&
          state.discovery.peerCards[peerId]?.status === 'active'
      )
    ),
    capabilities: createFrozenRecord(capabilities),
    lastLogicalTime: logicalTime,
  });
  return Object.freeze({
    accepted: true,
    expiredRecords,
    state: createMeshDiscoveryRuntimeState(coordination, discovery),
  });
}

/** Pure matching over locally visible, admitted and unexpired self-claims. */
export function matchMeshDiscoveryCapabilities(
  state: MeshDiscoveryRuntimeState,
  requirement: MeshCapabilityRequirement,
  logicalTime: number
): MeshCapabilityMatchResult {
  assertRuntimeState(state);
  assertMeshLogicalTime(logicalTime);
  if (logicalTime < state.discovery.lastLogicalTime) {
    throw new RangeError('Mesh discovery logical time cannot move backwards');
  }
  assertRequirement(requirement, state.discovery.limits);

  const eligible: MeshCapabilityMatch[] = [];
  const evaluations: MeshCapabilityMatchEvaluation[] = [];
  for (const peerId of Object.keys(state.discovery.admittedPeers).sort()) {
    const evaluated = evaluatePeerMatch(
      state,
      peerId,
      requirement,
      logicalTime
    );
    if ('match' in evaluated) {
      eligible.push(evaluated.match);
      evaluations.push(Object.freeze({ peerId, reason: 'eligible' }));
    } else {
      evaluations.push(Object.freeze({ peerId, reason: evaluated.reason }));
    }
  }

  const matches = eligible.slice(0, requirement.fanout);
  const selected = new Set(matches.map((match) => match.peerId));
  const finalEvaluations = evaluations.map((evaluation) =>
    evaluation.reason === 'eligible' && !selected.has(evaluation.peerId)
      ? Object.freeze({
          peerId: evaluation.peerId,
          reason: 'fanout_limited' as const,
        })
      : evaluation
  );
  return Object.freeze({
    matches: Object.freeze(matches),
    evaluations: Object.freeze(finalEvaluations),
  });
}

/** Resolves bounded topic recipients from the sender's local view only. */
export function selectMeshDiscoveryTopicRecipients(
  state: MeshDiscoveryRuntimeState,
  topic: MeshAudienceTopic,
  logicalTime: number,
  fanout = state.discovery.limits.maximumFanout
): readonly string[] {
  assertRuntimeState(state);
  assertMeshLogicalTime(logicalTime);
  if (
    logicalTime < state.coordination.lastLogicalTime ||
    logicalTime < state.discovery.lastLogicalTime
  ) {
    throw new RangeError('Mesh discovery logical time cannot move backwards');
  }
  if (
    (topic !== 'membership' && topic !== 'capability') ||
    !Number.isSafeInteger(fanout) ||
    fanout < 1 ||
    fanout > state.discovery.limits.maximumFanout
  ) {
    throw new RangeError('Invalid Mesh discovery topic fanout');
  }
  const peers = recordEntries(state.discovery.peerViews)
    .filter(([peerId, view]) => {
      const card = state.discovery.peerCards[peerId];
      if (!card || card.status !== 'active' || view.expiresAt <= logicalTime) {
        return false;
      }
      return (
        topic === 'membership' ||
        Object.values(state.discovery.capabilities).some(
          (capability) =>
            capability.ownerPeerId === peerId &&
            capability.status === 'active' &&
            capability.expiresAt > logicalTime
        )
      );
    })
    .map(([peerId]) => peerId)
    .sort()
    .slice(0, fanout);
  return Object.freeze(peers);
}

function evaluatePayload(
  state: MeshDiscoveryRuntimeState,
  request: MeshVerifiedDiscoveryRequest,
  metadata: ReturnType<typeof domainMetadata>
):
  | { readonly discovery: MeshDiscoveryRuntimeState['discovery'] }
  | { readonly code: MeshDiscoveryRejectionCode } {
  switch (request.envelope.payload.type) {
    case 'peer.card':
      return evaluatePeerCard(state, request, metadata);
    case 'peer.goodbye':
      return evaluatePeerGoodbye(state, request);
    case 'capability.advertise':
      return evaluateCapabilityAdvertisement(state, request, metadata);
    case 'capability.withdraw':
      return evaluateCapabilityWithdrawal(state, request);
    default:
      throw new TypeError('Unsupported verified Mesh discovery payload');
  }
}

function evaluatePeerCard(
  state: MeshDiscoveryRuntimeState,
  request: MeshVerifiedDiscoveryRequest,
  metadata: ReturnType<typeof domainMetadata>
):
  | { readonly discovery: MeshDiscoveryRuntimeState['discovery'] }
  | { readonly code: MeshDiscoveryRejectionCode } {
  const envelope = request.envelope as VerifiedMeshEnvelope<PeerCardPayload>;
  const payload = envelope.payload;
  const admission = state.discovery.admittedPeers[envelope.sender.peerId];
  if (
    payload.subjectPeerId !== envelope.sender.peerId ||
    payload.instanceId !== envelope.sender.instanceId
  ) {
    return { code: 'sender_instance_not_admitted' };
  }
  if (compare(payload.validUntil, admission.validUntil) > 0) {
    return { code: 'validity_exceeds_admission' };
  }
  const expiresAt = logicalExpiry(
    payload.validFrom,
    payload.validUntil,
    request.verifiedAt,
    request.receivedAt
  );
  if (expiresAt === undefined) return { code: 'record_expired' };

  const current = state.discovery.peerCards[payload.subjectPeerId];
  if (
    current?.status === 'departed' &&
    current.instanceId === payload.instanceId
  ) {
    return { code: 'peer_card_not_active' };
  }
  if (
    (!current && payload.cardRevision !== 1) ||
    (current && payload.cardRevision !== current.cardRevision + 1)
  ) {
    return { code: 'peer_card_revision_invalid' };
  }
  if (
    (!current &&
      (payload.previousPeerCardId !== undefined ||
        envelope.causationId !== undefined)) ||
    (current &&
      (payload.previousPeerCardId !== current.peerCardId ||
        envelope.causationId !== current.acceptedMessageId))
  ) {
    return { code: 'peer_card_predecessor_invalid' };
  }
  if (
    !current &&
    Object.keys(state.discovery.peerCards).length >=
      state.discovery.limits.maximumPeerCards
  ) {
    return { code: 'peer_card_capacity_exceeded' };
  }

  const card = freezePeerCard({
    peerId: payload.subjectPeerId,
    instanceId: payload.instanceId,
    peerCardId: payload.peerCardId,
    cardRevision: payload.cardRevision,
    protocolVersions: payload.protocolVersions,
    transportHints: payload.transportHints,
    capabilityIds: payload.capabilityIds,
    validFrom: payload.validFrom,
    validUntil: payload.validUntil,
    validityVerifiedAt: request.verifiedAt,
    acceptedMessageId: envelope.messageId,
    acceptedAt: request.receivedAt,
    expiresAt,
    status: 'active',
  });
  if (encodedBytes(card) > state.discovery.limits.maximumPeerCardBytes) {
    return { code: 'peer_card_capacity_exceeded' };
  }
  const peerCards = createFrozenRecord([
    ...recordEntries(state.discovery.peerCards).filter(
      ([peerId]) => peerId !== card.peerId
    ),
    [card.peerId, card],
  ]);
  const view = Object.freeze<MeshPeerViewProjection>({
    peerId: card.peerId,
    peerCardId: card.peerCardId,
    cardRevision: card.cardRevision,
    observedAt: request.receivedAt,
    expiresAt,
  });
  const peerViews = insertPeerView(state, view, request.receivedAt);
  const capabilities = createFrozenRecord(
    recordEntries(state.discovery.capabilities).map(([key, capability]) =>
      capability.ownerPeerId === card.peerId &&
      capability.status === 'active' &&
      (capability.instanceId !== card.instanceId ||
        !card.capabilityIds.includes(capability.capabilityId) ||
        compare(capability.validUntil, card.validUntil) > 0)
        ? [
            key,
            Object.freeze({
              ...capability,
              status: 'departed' as const,
            }),
          ]
        : [key, capability]
    )
  );
  return {
    discovery: Object.freeze({
      ...state.discovery,
      peerCards,
      peerViews,
      capabilities,
    }),
  };
}

function evaluatePeerGoodbye(
  state: MeshDiscoveryRuntimeState,
  request: MeshVerifiedDiscoveryRequest
):
  | { readonly discovery: MeshDiscoveryRuntimeState['discovery'] }
  | { readonly code: MeshDiscoveryRejectionCode } {
  const envelope = request.envelope;
  const payload = envelope.payload;
  if (payload.type !== 'peer.goodbye') throw new TypeError('Invalid payload');
  const current = state.discovery.peerCards[envelope.sender.peerId];
  if (!current) return { code: 'peer_card_missing' };
  if (current.status !== 'active' || current.expiresAt <= request.receivedAt) {
    return { code: 'peer_card_not_active' };
  }
  if (
    envelope.sender.instanceId !== current.instanceId ||
    payload.peerCardId !== current.peerCardId ||
    payload.cardRevision !== current.cardRevision ||
    payload.instanceId !== current.instanceId ||
    envelope.causationId !== current.acceptedMessageId
  ) {
    return { code: 'peer_card_predecessor_invalid' };
  }
  const peerCards = createFrozenRecord([
    ...recordEntries(state.discovery.peerCards).filter(
      ([peerId]) => peerId !== current.peerId
    ),
    [
      current.peerId,
      Object.freeze({
        ...current,
        acceptedMessageId: envelope.messageId,
        acceptedAt: request.receivedAt,
        status: 'departed' as const,
      }),
    ],
  ]);
  const capabilities = createFrozenRecord(
    recordEntries(state.discovery.capabilities).map(([key, capability]) =>
      capability.ownerPeerId === current.peerId &&
      capability.status === 'active'
        ? [
            key,
            Object.freeze({
              ...capability,
              status: 'departed' as const,
            }),
          ]
        : [key, capability]
    )
  );
  return {
    discovery: Object.freeze({
      ...state.discovery,
      peerCards,
      peerViews: createFrozenRecord(
        recordEntries(state.discovery.peerViews).filter(
          ([peerId]) => peerId !== current.peerId
        )
      ),
      capabilities,
    }),
  };
}

function evaluateCapabilityAdvertisement(
  state: MeshDiscoveryRuntimeState,
  request: MeshVerifiedDiscoveryRequest,
  metadata: ReturnType<typeof domainMetadata>
):
  | { readonly discovery: MeshDiscoveryRuntimeState['discovery'] }
  | { readonly code: MeshDiscoveryRejectionCode } {
  const envelope =
    request.envelope as VerifiedMeshEnvelope<CapabilityAdvertisePayload>;
  const payload = envelope.payload;
  if (payload.ownerPeerId !== envelope.sender.peerId) {
    return { code: 'sender_not_admitted' };
  }
  const card = state.discovery.peerCards[payload.ownerPeerId];
  if (!card) return { code: 'peer_card_missing' };
  if (
    card.instanceId !== envelope.sender.instanceId ||
    card.status !== 'active' ||
    card.expiresAt <= request.receivedAt ||
    !Object.hasOwn(state.discovery.peerViews, payload.ownerPeerId)
  ) {
    return { code: 'peer_card_not_active' };
  }
  if (!card.capabilityIds.includes(payload.capabilityId)) {
    return { code: 'capability_not_listed' };
  }
  if (compare(payload.validUntil, card.validUntil) > 0) {
    return { code: 'validity_exceeds_admission' };
  }
  const expiresAt = logicalExpiry(
    payload.validFrom,
    payload.validUntil,
    request.verifiedAt,
    request.receivedAt
  );
  if (expiresAt === undefined) return { code: 'record_expired' };

  const key = JSON.stringify([payload.ownerPeerId, payload.capabilityId]);
  const current = state.discovery.capabilities[key];
  if (
    (!current && payload.capabilityRevision !== 1) ||
    (current && payload.capabilityRevision !== current.capabilityRevision + 1)
  ) {
    return { code: 'capability_revision_invalid' };
  }
  if (
    (!current &&
      (payload.previousAdvertisementId !== undefined ||
        envelope.causationId !== undefined)) ||
    (current &&
      (payload.previousAdvertisementId !== current.advertisementId ||
        envelope.causationId !== current.acceptedMessageId))
  ) {
    return { code: 'capability_predecessor_invalid' };
  }
  if (!current) {
    const total = Object.keys(state.discovery.capabilities).length;
    const perPeer = Object.values(state.discovery.capabilities).filter(
      (capability) => capability.ownerPeerId === payload.ownerPeerId
    ).length;
    if (
      total >= state.discovery.limits.maximumCapabilities ||
      perPeer >= state.discovery.limits.maximumCapabilitiesPerPeer
    ) {
      return { code: 'capability_capacity_exceeded' };
    }
  }

  const capability = freezeCapability({
    ownerPeerId: payload.ownerPeerId,
    instanceId: envelope.sender.instanceId,
    advertisementId: payload.advertisementId,
    capabilityId: payload.capabilityId,
    capabilityRevision: payload.capabilityRevision,
    capabilityKey: payload.capabilityKey,
    version: payload.version,
    ...(payload.variant === undefined ? {} : { variant: payload.variant }),
    inputMediaTypes: payload.inputMediaTypes,
    outputMediaTypes: payload.outputMediaTypes,
    attributes: payload.attributes,
    validFrom: payload.validFrom,
    validUntil: payload.validUntil,
    validityVerifiedAt: request.verifiedAt,
    ...(payload.maximumConcurrency === undefined
      ? {}
      : { maximumConcurrency: payload.maximumConcurrency }),
    ...(payload.maximumPayloadBytes === undefined
      ? {}
      : { maximumPayloadBytes: payload.maximumPayloadBytes }),
    acceptedMessageId: envelope.messageId,
    acceptedAt: request.receivedAt,
    expiresAt,
    status: 'active',
  });
  if (
    encodedBytes(capability) > state.discovery.limits.maximumCapabilityBytes
  ) {
    return { code: 'capability_capacity_exceeded' };
  }
  return {
    discovery: Object.freeze({
      ...state.discovery,
      capabilities: createFrozenRecord([
        ...recordEntries(state.discovery.capabilities).filter(
          ([entryKey]) => entryKey !== key
        ),
        [key, capability],
      ]),
    }),
  };
}

function evaluateCapabilityWithdrawal(
  state: MeshDiscoveryRuntimeState,
  request: MeshVerifiedDiscoveryRequest
):
  | { readonly discovery: MeshDiscoveryRuntimeState['discovery'] }
  | { readonly code: MeshDiscoveryRejectionCode } {
  const envelope = request.envelope;
  const payload = envelope.payload;
  if (payload.type !== 'capability.withdraw') {
    throw new TypeError('Invalid payload');
  }
  const key = JSON.stringify([envelope.sender.peerId, payload.capabilityId]);
  const current = state.discovery.capabilities[key];
  if (!current) return { code: 'capability_missing' };
  if (
    current.instanceId !== envelope.sender.instanceId ||
    current.status !== 'active' ||
    current.expiresAt <= request.receivedAt
  ) {
    return { code: 'capability_not_active' };
  }
  if (
    payload.advertisementId !== current.advertisementId ||
    payload.capabilityRevision !== current.capabilityRevision ||
    envelope.causationId !== current.acceptedMessageId
  ) {
    return { code: 'capability_predecessor_invalid' };
  }
  return {
    discovery: Object.freeze({
      ...state.discovery,
      capabilities: createFrozenRecord([
        ...recordEntries(state.discovery.capabilities).filter(
          ([entryKey]) => entryKey !== key
        ),
        [
          key,
          Object.freeze({
            ...current,
            acceptedMessageId: envelope.messageId,
            acceptedAt: request.receivedAt,
            status: 'withdrawn' as const,
          }),
        ],
      ]),
    }),
  };
}

function validateContext(
  state: MeshDiscoveryRuntimeState,
  request: MeshVerifiedDiscoveryRequest
): MeshDiscoveryRejectionCode | undefined {
  const result = validateMeshEnvelopeContext(request.envelope, {
    tenantId: state.discovery.identity.tenantId,
    meshId: state.discovery.identity.meshId,
    peerId: state.discovery.identity.peerId,
    receivedAt: request.verifiedAt,
    subscribedTopics: state.discovery.subscriptions,
    ...(request.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: request.supportedCriticalExtensions,
        }),
  });
  if (result.ok) return undefined;
  const code = result.issues[0]?.code;
  switch (code) {
    case 'scope_mismatch':
      return 'scope_mismatch';
    case 'invalid_audience':
      return request.envelope.audience.kind === 'mesh' &&
        !state.discovery.subscriptions.includes(request.envelope.audience.topic)
        ? 'topic_not_subscribed'
        : 'audience_mismatch';
    case 'message_expired':
      return 'message_expired';
    case 'message_from_future':
      return 'message_from_future';
    case 'unknown_critical_extension':
      return 'unknown_critical_extension';
    default:
      return 'invalid_verified_envelope';
  }
}

function validateCommon(
  state: MeshDiscoveryRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>,
  verifiedAt: string
): MeshDiscoveryRejectionCode | undefined {
  if (
    envelope.payload.type !== 'peer.card' &&
    envelope.payload.type !== 'peer.goodbye' &&
    envelope.payload.type !== 'capability.advertise' &&
    envelope.payload.type !== 'capability.withdraw'
  ) {
    return 'invalid_verified_envelope';
  }
  if (
    envelope.tenantId !== state.discovery.identity.tenantId ||
    envelope.meshId !== state.discovery.identity.meshId
  ) {
    return 'scope_mismatch';
  }
  const expectedTopic =
    envelope.payload.type === 'peer.card' ||
    envelope.payload.type === 'peer.goodbye'
      ? 'membership'
      : 'capability';
  if (envelope.audience.kind === 'peer') {
    if (envelope.audience.peerId !== state.discovery.identity.peerId) {
      return 'audience_mismatch';
    }
  } else {
    if (envelope.audience.topic !== expectedTopic) {
      return 'audience_mismatch';
    }
    if (!state.discovery.subscriptions.includes(expectedTopic)) {
      return 'topic_not_subscribed';
    }
  }
  const admission = state.discovery.admittedPeers[envelope.sender.peerId];
  if (!admission) return 'sender_not_admitted';
  if (!admission.instanceIds.includes(envelope.sender.instanceId)) {
    return 'sender_instance_not_admitted';
  }
  return compare(verifiedAt, admission.validUntil) >= 0
    ? 'sender_admission_expired'
    : undefined;
}

function isExactProjectedDuplicate(
  state: MeshDiscoveryRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>,
  acceptedMessageId: string
): boolean {
  if (envelope.messageId !== acceptedMessageId) return false;
  const payload = envelope.payload;
  switch (payload.type) {
    case 'peer.card': {
      const card = state.discovery.peerCards[payload.subjectPeerId];
      return (
        payload.subjectPeerId === envelope.sender.peerId &&
        payload.instanceId === envelope.sender.instanceId &&
        card?.peerCardId === payload.peerCardId &&
        card.cardRevision === payload.cardRevision &&
        card.instanceId === envelope.sender.instanceId &&
        card.acceptedMessageId === acceptedMessageId
      );
    }
    case 'peer.goodbye': {
      const card = state.discovery.peerCards[envelope.sender.peerId];
      return (
        card?.status === 'departed' &&
        card.instanceId === envelope.sender.instanceId &&
        card.peerCardId === payload.peerCardId &&
        card.cardRevision === payload.cardRevision &&
        payload.instanceId === envelope.sender.instanceId &&
        card.acceptedMessageId === acceptedMessageId
      );
    }
    case 'capability.advertise': {
      const capability =
        state.discovery.capabilities[
          JSON.stringify([payload.ownerPeerId, payload.capabilityId])
        ];
      return (
        payload.ownerPeerId === envelope.sender.peerId &&
        capability?.instanceId === envelope.sender.instanceId &&
        capability.advertisementId === payload.advertisementId &&
        capability.capabilityRevision === payload.capabilityRevision &&
        capability.acceptedMessageId === acceptedMessageId
      );
    }
    case 'capability.withdraw': {
      const capability =
        state.discovery.capabilities[
          JSON.stringify([envelope.sender.peerId, payload.capabilityId])
        ];
      return (
        capability?.status === 'withdrawn' &&
        capability.instanceId === envelope.sender.instanceId &&
        capability.advertisementId === payload.advertisementId &&
        capability.capabilityRevision === payload.capabilityRevision &&
        capability.acceptedMessageId === acceptedMessageId
      );
    }
  }
}

function domainMetadata(envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>): {
  readonly recordKey: string;
  readonly recordId: string;
  readonly contentDigest: string;
} {
  const recordId =
    envelope.payload.type === 'peer.card' ||
    envelope.payload.type === 'peer.goodbye'
      ? envelope.payload.peerCardId
      : envelope.payload.advertisementId;
  const contentDigest = envelope.payloadHash.startsWith('sha256:')
    ? envelope.payloadHash.slice(7)
    : '';
  if (!payloadDigestPattern.test(contentDigest)) {
    throw new TypeError('Invalid verified Mesh discovery payload digest');
  }
  return {
    recordKey: JSON.stringify([envelope.payload.type, recordId]),
    recordId,
    contentDigest,
  };
}

function acceptRecord(
  state: MeshDiscoveryRuntimeState,
  request: MeshVerifiedDiscoveryRequest,
  metadata: ReturnType<typeof domainMetadata>,
  projectedDiscovery: MeshDiscoveryRuntimeState['discovery']
): MeshDiscoveryDecision {
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Mesh coordination event sequence exhausted');
  }
  const sequence = state.coordination.localEventSequence + 1;
  const record = Object.freeze<MeshCoordinationDomainRecord>({
    recordKey: metadata.recordKey,
    recordType: request.envelope.payload.type,
    recordId: metadata.recordId,
    contentDigest: metadata.contentDigest,
    messageId: request.envelope.messageId,
    acceptedAt: request.receivedAt,
  });
  const journalEntry = Object.freeze<MeshCoordinationJournalEntry>({
    sequence,
    occurredAt: request.receivedAt,
    kind: 'domain.accepted',
    domainRecordKey: metadata.recordKey,
  });
  const coordination = Object.freeze<MeshCoordinationState>({
    ...state.coordination,
    domainRecords: createFrozenRecord([
      ...recordEntries(state.coordination.domainRecords),
      [metadata.recordKey, record],
    ]),
    journal: Object.freeze([...state.coordination.journal, journalEntry]),
    localEventSequence: sequence,
    lastLogicalTime: request.receivedAt,
  });
  const discovery = Object.freeze({
    ...projectedDiscovery,
    lastLogicalTime: request.receivedAt,
  });
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: createMeshDiscoveryRuntimeState(coordination, discovery),
  });
}

function insertPeerView(
  state: MeshDiscoveryRuntimeState,
  view: MeshPeerViewProjection,
  logicalTime: number
): Readonly<Record<string, MeshPeerViewProjection>> {
  const retained = recordEntries(state.discovery.peerViews).filter(
    ([peerId, current]) =>
      peerId !== view.peerId &&
      current.expiresAt > logicalTime &&
      state.discovery.peerCards[peerId]?.status === 'active'
  );
  const candidates = [...retained, [view.peerId, view] as const];
  if (candidates.length > state.discovery.limits.maximumPeerViews) {
    candidates.sort(
      ([leftPeerId, left], [rightPeerId, right]) =>
        left.observedAt - right.observedAt ||
        compareText(leftPeerId, rightPeerId)
    );
    candidates.shift();
  }
  return createFrozenRecord(candidates);
}

function evaluatePeerMatch(
  state: MeshDiscoveryRuntimeState,
  peerId: string,
  requirement: MeshCapabilityRequirement,
  logicalTime: number
):
  | { readonly match: MeshCapabilityMatch }
  | { readonly reason: MeshCapabilityMatchReason } {
  const view = state.discovery.peerViews[peerId];
  if (!view || view.expiresAt <= logicalTime) {
    return { reason: 'peer_view_missing' };
  }
  const card = state.discovery.peerCards[peerId];
  if (!card || card.status !== 'active' || card.expiresAt <= logicalTime) {
    return { reason: 'peer_card_inactive' };
  }
  const owned = Object.values(state.discovery.capabilities)
    .filter((capability) => capability.ownerPeerId === peerId)
    .sort(
      (left, right) =>
        compareText(left.capabilityId, right.capabilityId) ||
        left.capabilityRevision - right.capabilityRevision
    );
  const selected: MeshCapabilityMatch['capabilities'][number][] = [];
  for (const capabilityKey of requirement.capabilityKeys) {
    const keyed = owned.filter(
      (capability) => capability.capabilityKey === capabilityKey
    );
    if (keyed.length === 0) return { reason: 'capability_key_missing' };
    const active = keyed.filter(
      (capability) =>
        capability.status === 'active' && capability.expiresAt > logicalTime
    );
    if (active.length === 0) return { reason: 'capability_expired' };
    const attributes = active.filter((capability) =>
      Object.entries(requirement.attributes ?? {}).every(
        ([key, value]) => capability.attributes[key] === value
      )
    );
    if (attributes.length === 0) return { reason: 'attribute_mismatch' };
    const input = attributes.filter(
      (capability) =>
        requirement.inputMediaType === undefined ||
        capability.inputMediaTypes.includes(requirement.inputMediaType)
    );
    if (input.length === 0) return { reason: 'input_media_type_mismatch' };
    const output = input.filter(
      (capability) =>
        requirement.outputMediaType === undefined ||
        capability.outputMediaTypes.includes(requirement.outputMediaType)
    );
    if (output.length === 0) return { reason: 'output_media_type_mismatch' };
    const capability = output[0];
    selected.push(
      Object.freeze({
        capabilityKey,
        capabilityId: capability.capabilityId,
        capabilityRevision: capability.capabilityRevision,
        advertisementId: capability.advertisementId,
      })
    );
  }
  return {
    match: Object.freeze({
      peerId,
      capabilities: Object.freeze(selected),
    }),
  };
}

function assertRequirement(
  requirement: MeshCapabilityRequirement,
  limits: MeshDiscoveryLimits
): void {
  const prototype =
    requirement && typeof requirement === 'object'
      ? Object.getPrototypeOf(requirement)
      : null;
  if (
    !requirement ||
    typeof requirement !== 'object' ||
    (prototype !== null && prototype !== Object.prototype) ||
    !hasExactEnumerableKeys(
      requirement,
      [
        'attributes',
        'capabilityKeys',
        'fanout',
        'inputMediaType',
        'outputMediaType',
      ],
      ['capabilityKeys', 'fanout']
    ) ||
    !Array.isArray(requirement.capabilityKeys) ||
    requirement.capabilityKeys.length < 1 ||
    requirement.capabilityKeys.length >
      limits.maximumRequirementCapabilityKeys ||
    requirement.capabilityKeys.some(
      (key) => typeof key !== 'string' || key.length < 1
    ) ||
    new Set(requirement.capabilityKeys).size !==
      requirement.capabilityKeys.length ||
    !Number.isSafeInteger(requirement.fanout) ||
    requirement.fanout < 1 ||
    requirement.fanout > limits.maximumFanout ||
    (requirement.attributes !== undefined &&
      (!requirement.attributes ||
        typeof requirement.attributes !== 'object' ||
        Array.isArray(requirement.attributes) ||
        !hasRecordPrototype(requirement.attributes) ||
        Object.keys(requirement.attributes).length >
          limits.maximumRequirementAttributes ||
        !hasOnlyEnumerableStringKeys(requirement.attributes) ||
        Object.values(requirement.attributes).some(
          (value) => typeof value !== 'string'
        ))) ||
    (requirement.inputMediaType !== undefined &&
      (typeof requirement.inputMediaType !== 'string' ||
        requirement.inputMediaType.length < 1)) ||
    (requirement.outputMediaType !== undefined &&
      (typeof requirement.outputMediaType !== 'string' ||
        requirement.outputMediaType.length < 1))
  ) {
    throw new TypeError('Invalid Mesh capability requirement');
  }
  if (encodedBytes(requirement) > limits.maximumRequirementBytes) {
    throw new RangeError('Mesh capability requirement bound exceeded');
  }
}

function hasRecordPrototype(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function hasOnlyEnumerableStringKeys(value: object): boolean {
  return (
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.getOwnPropertyNames(value).every((key) =>
      Object.prototype.propertyIsEnumerable.call(value, key)
    )
  );
}

function hasExactEnumerableKeys(
  value: object,
  supportedKeys: readonly string[],
  requiredKeys: readonly string[]
): boolean {
  const supported = new Set(supportedKeys);
  return (
    hasOnlyEnumerableStringKeys(value) &&
    Object.getOwnPropertyNames(value).every((key) => supported.has(key)) &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
}

function assertExactKeys(
  value: object,
  supportedKeys: readonly string[],
  requiredKeys: readonly string[]
): void {
  if (!hasExactEnumerableKeys(value, supportedKeys, requiredKeys)) {
    throw new TypeError('Mesh discovery value contains unsupported fields');
  }
}

function expiryJournalEntry(
  state: MeshDiscoveryRuntimeState,
  offset: number,
  logicalTime: number,
  domainRecordKey: string
): MeshCoordinationJournalEntry {
  return Object.freeze({
    sequence: state.coordination.localEventSequence + offset + 1,
    occurredAt: logicalTime,
    kind: 'command.accepted',
    domainRecordKey,
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
  const attributes = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(capability.attributes)) {
    attributes[key] = value;
  }
  return Object.freeze({
    ...capability,
    inputMediaTypes: Object.freeze([...capability.inputMediaTypes]),
    outputMediaTypes: Object.freeze([...capability.outputMediaTypes]),
    attributes: Object.freeze(attributes),
  });
}

function logicalExpiry(
  validFrom: string,
  validUntil: string,
  verifiedAt: string,
  receivedAt: number
): number | undefined {
  if (
    compare(verifiedAt, validFrom) < 0 ||
    compare(verifiedAt, validUntil) >= 0
  ) {
    return undefined;
  }
  const validUntilMs = Date.parse(validUntil);
  const verifiedAtMs = Date.parse(verifiedAt);
  if (!Number.isFinite(validUntilMs) || !Number.isFinite(verifiedAtMs)) {
    throw new TypeError('Invalid Mesh discovery timestamp');
  }
  const remaining = Math.max(0, validUntilMs - verifiedAtMs);
  if (receivedAt > Number.MAX_SAFE_INTEGER - remaining) {
    throw new RangeError('Mesh discovery expiry exceeds logical time');
  }
  return receivedAt + remaining;
}

function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError('Invalid Mesh discovery timestamp');
  return result.value;
}

function encodedBytes(value: unknown): number {
  return utf8Encoder.encode(JSON.stringify(value)).byteLength;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertRuntimeState(state: MeshDiscoveryRuntimeState): void {
  if (!state || typeof state !== 'object' || !Object.isFrozen(state)) {
    throw new TypeError('Mesh discovery runtime state must be immutable');
  }
  assertFrozenMeshCoordinationState(state.coordination);
  assertFrozenMeshDiscoveryState(state.discovery);
  if (
    state.coordination.identity.tenantId !==
      state.discovery.identity.tenantId ||
    state.coordination.identity.meshId !== state.discovery.identity.meshId ||
    state.coordination.identity.peerId !== state.discovery.identity.peerId ||
    state.coordination.identity.instanceId !==
      state.discovery.identity.instanceId ||
    state.coordination.identity.keyId !== state.discovery.identity.keyId ||
    state.coordination.lastLogicalTime !== state.discovery.lastLogicalTime
  ) {
    throw new TypeError('Mesh discovery runtime snapshots are not aligned');
  }
}

function rejection(
  state: MeshDiscoveryRuntimeState,
  code: MeshDiscoveryRejectionCode
): MeshDiscoveryDecision {
  return Object.freeze({ accepted: false, code, state });
}
