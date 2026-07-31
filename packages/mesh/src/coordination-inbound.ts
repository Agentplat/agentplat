import type {
  MeshCryptoPolicy,
  MeshCryptoRejectionCode,
  MeshKeyResolver,
  MeshVerificationResult,
} from '@agentplat/mesh-crypto';
import { verifyMeshEnvelope } from '@agentplat/mesh-crypto';
import {
  canonicalizeMeshJson,
  compareMeshTimestamps,
  DEFAULT_MESH_PROTOCOL_LIMITS,
  validateMeshEnvelopeContext,
  type MeshAudienceTopic,
  type MeshProtocolOptions,
  type MeshProtocolErrorCode,
  type SignedMeshEnvelope,
  type VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';

import type {
  MeshCoordinationInboundReplayWindow,
  MeshDiscoveryInboundDecision,
  MeshDiscoveryInboundProcessor,
  MeshDiscoveryInboundProcessorOptions,
  MeshDiscoveryInboundRejectionCode,
  MeshDiscoveryInboundRequest,
  MeshDiscoveryInboundRuntimeState,
} from './coordination-inbound-contracts.js';
import {
  assertFrozenMeshCoordinationInboundState,
  createMeshDiscoveryInboundRuntimeState,
} from './coordination-inbound-state.js';
import type {
  MeshDiscoveryPayload,
  MeshDiscoveryRejectionCode,
} from './coordination-discovery-contracts.js';
import { evaluateVerifiedMeshDiscoveryEnvelope } from './coordination-discovery.js';
import { createMeshDiscoveryRuntimeState } from './coordination-discovery-state.js';
import {
  assertMeshLogicalTime,
  createFrozenRecord,
  recordEntries,
} from './state.js';

const cryptoRejectionCodes = new Set<MeshCryptoRejectionCode>([
  'crypto_unavailable',
  'crypto_operation_failed',
  'invalid_envelope',
  'invalid_verification_time',
  'unsupported_algorithm',
  'payload_hash_mismatch',
  'key_not_found',
  'key_resolution_failed',
  'key_binding_mismatch',
  'invalid_key_record',
  'invalid_key_material',
  'key_not_yet_valid',
  'key_expired',
  'key_revoked',
  'signature_invalid',
]);

interface TrustedInboundConfiguration {
  readonly resolver: MeshKeyResolver;
  readonly cryptoPolicy: MeshCryptoPolicy;
  readonly crypto: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
  readonly supportedCriticalExtensions?: readonly string[];
}

/**
 * Binds local trust dependencies once, outside the remote-message path.
 */
export function createMeshDiscoveryInboundProcessor(
  options: MeshDiscoveryInboundProcessorOptions
): MeshDiscoveryInboundProcessor {
  assertProcessorOptions(options);
  const resolve = options.resolver.resolve.bind(options.resolver);
  const crypto = snapshotCrypto(options.crypto);
  const configuration: TrustedInboundConfiguration = Object.freeze({
    resolver: Object.freeze({ resolve }),
    cryptoPolicy: Object.freeze({
      allowedAlgorithms: Object.freeze([
        ...options.cryptoPolicy.allowedAlgorithms,
      ]),
    }),
    crypto,
    ...(options.protocolOptions === undefined
      ? {}
      : {
          protocolOptions: Object.freeze({
            ...(options.protocolOptions.limits === undefined
              ? {}
              : {
                  limits: Object.freeze({
                    ...options.protocolOptions.limits,
                  }),
                }),
          }),
        }),
    ...(options.supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...options.supportedCriticalExtensions,
          ]),
        }),
  });
  return Object.freeze({
    process: (
      state: MeshDiscoveryInboundRuntimeState,
      request: MeshDiscoveryInboundRequest
    ) => processMeshDiscoveryEnvelope(state, request, configuration),
  });
}

/**
 * Authenticates one signed discovery envelope before admission, replay and
 * projection. Rejections after replay admission retain only security state.
 */
async function processMeshDiscoveryEnvelope(
  state: MeshDiscoveryInboundRuntimeState,
  request: MeshDiscoveryInboundRequest,
  configuration: TrustedInboundConfiguration
): Promise<MeshDiscoveryInboundDecision> {
  assertRuntimeState(state);
  assertRequest(request);

  const receivedAt = request.receivedAt;
  const verifiedAt = request.verifiedAt;
  const resolver = configuration.resolver;
  const crypto = configuration.crypto;
  const cryptoPolicy = configuration.cryptoPolicy;
  const protocolOptions = configuration.protocolOptions;
  const supportedCriticalExtensions = configuration.supportedCriticalExtensions;

  assertMeshLogicalTime(receivedAt);
  if (
    receivedAt <
    Math.max(
      state.coordination.lastLogicalTime,
      state.discovery.lastLogicalTime,
      state.inbound.lastLogicalTime
    )
  ) {
    return rejection(state, 'logical_time_regressed');
  }

  const context = validateMeshEnvelopeContext(
    request.envelope,
    {
      tenantId: state.discovery.identity.tenantId,
      meshId: state.discovery.identity.meshId,
      peerId: state.discovery.identity.peerId,
      receivedAt: verifiedAt,
      subscribedTopics: state.discovery.subscriptions,
      ...(supportedCriticalExtensions === undefined
        ? {}
        : { supportedCriticalExtensions }),
    },
    protocolOptions
  );
  if (!context.ok) {
    return rejection(
      state,
      contextRejection(
        context.issues[0]?.code,
        request.envelope,
        state.discovery.subscriptions
      )
    );
  }
  const contextualEnvelope = context.value;
  const familyFailure = validateDiscoveryFamily(contextualEnvelope);
  if (familyFailure) return rejection(state, familyFailure);

  let verification: MeshVerificationResult | undefined;
  try {
    verification = await verifyMeshEnvelope({
      envelope: contextualEnvelope,
      resolver,
      policy: cryptoPolicy,
      verifiedAt,
      crypto,
      protocolOptions,
    });
  } catch {
    return rejection(state, 'crypto_operation_failed');
  }

  let verifiedEnvelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>;
  try {
    if (
      !verification ||
      typeof verification !== 'object' ||
      verification.verified !== true
    ) {
      const code =
        verification?.verified === false &&
        cryptoRejectionCodes.has(verification.code)
          ? verification.code
          : 'crypto_operation_failed';
      return rejection(state, code);
    }
    const rebound = validateMeshEnvelopeContext(
      verification.envelope,
      {
        tenantId: state.discovery.identity.tenantId,
        meshId: state.discovery.identity.meshId,
        peerId: state.discovery.identity.peerId,
        receivedAt: verifiedAt,
        subscribedTopics: state.discovery.subscriptions,
        ...(supportedCriticalExtensions === undefined
          ? {}
          : { supportedCriticalExtensions }),
      },
      protocolOptions
    );
    if (
      !rebound.ok ||
      !sameCanonicalEnvelope(contextualEnvelope, rebound.value, protocolOptions)
    ) {
      return rejection(state, 'crypto_operation_failed');
    }
    verifiedEnvelope =
      rebound.value as VerifiedMeshEnvelope<MeshDiscoveryPayload>;
  } catch {
    return rejection(state, 'crypto_operation_failed');
  }

  const authorityFailure = validateAdmissionAndOwnership(
    state,
    verifiedEnvelope,
    verifiedAt
  );
  if (authorityFailure) return rejection(state, authorityFailure);

  const replay = advanceReplayState(state, verifiedEnvelope, receivedAt);
  if ('code' in replay) return rejection(state, replay.code);
  const replayRuntime = createMeshDiscoveryInboundRuntimeState(
    state.coordination,
    state.discovery,
    replay.inbound
  );

  if (isAuthenticatedDomainDuplicate(state, verifiedEnvelope)) {
    return acceptance(replayRuntime, verifiedEnvelope, true);
  }

  const projection = evaluateVerifiedMeshDiscoveryEnvelope(
    createMeshDiscoveryRuntimeState(state.coordination, state.discovery),
    {
      envelope: verifiedEnvelope,
      verifiedAt,
      receivedAt,
      ...(supportedCriticalExtensions === undefined
        ? {}
        : { supportedCriticalExtensions }),
    }
  );
  if (!projection.accepted) {
    return rejection(replayRuntime, projection.code);
  }
  return acceptance(
    createMeshDiscoveryInboundRuntimeState(
      projection.state.coordination,
      projection.state.discovery,
      replay.inbound
    ),
    verifiedEnvelope,
    projection.duplicate
  );
}

function validateDiscoveryFamily(
  envelope: SignedMeshEnvelope
): MeshDiscoveryInboundRejectionCode | undefined {
  const type = envelope.payload.type;
  if (
    type !== 'peer.card' &&
    type !== 'peer.goodbye' &&
    type !== 'capability.advertise' &&
    type !== 'capability.withdraw'
  ) {
    return 'unsupported_message_type';
  }
  if (envelope.audience.kind !== 'mesh') return undefined;
  const expectedTopic: MeshAudienceTopic =
    type === 'peer.card' || type === 'peer.goodbye'
      ? 'membership'
      : 'capability';
  return envelope.audience.topic === expectedTopic
    ? undefined
    : 'audience_mismatch';
}

function validateAdmissionAndOwnership(
  state: MeshDiscoveryInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>,
  verifiedAt: string
): MeshDiscoveryInboundRejectionCode | undefined {
  const admission = state.discovery.admittedPeers[envelope.sender.peerId];
  if (!admission) return 'sender_not_admitted';
  if (!admission.instanceIds.includes(envelope.sender.instanceId)) {
    return 'sender_instance_not_admitted';
  }
  const admissionExpiry = compareMeshTimestamps(
    verifiedAt,
    admission.validUntil
  );
  if (!admissionExpiry.ok || admissionExpiry.value >= 0) {
    return 'sender_admission_expired';
  }

  const payload = envelope.payload;
  switch (payload.type) {
    case 'peer.card':
      return payload.subjectPeerId === envelope.sender.peerId &&
        payload.instanceId === envelope.sender.instanceId
        ? undefined
        : 'message_not_authorized';
    case 'peer.goodbye':
      return payload.instanceId === envelope.sender.instanceId
        ? undefined
        : 'message_not_authorized';
    case 'capability.advertise': {
      if (payload.ownerPeerId !== envelope.sender.peerId) {
        return 'message_not_authorized';
      }
      const card = state.discovery.peerCards[payload.ownerPeerId];
      return card && card.instanceId !== envelope.sender.instanceId
        ? 'message_not_authorized'
        : undefined;
    }
    case 'capability.withdraw': {
      const capability =
        state.discovery.capabilities[
          JSON.stringify([envelope.sender.peerId, payload.capabilityId])
        ];
      return capability && capability.instanceId !== envelope.sender.instanceId
        ? 'message_not_authorized'
        : undefined;
    }
  }
}

function advanceReplayState(
  state: MeshDiscoveryInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>,
  receivedAt: number
):
  | { readonly inbound: MeshDiscoveryInboundRuntimeState['inbound'] }
  | { readonly code: MeshDiscoveryInboundRejectionCode } {
  const retainedIds = recordEntries(state.inbound.messageIds).filter(
    ([, expiresAt]) => expiresAt > receivedAt
  );
  if (retainedIds.some(([messageId]) => messageId === envelope.messageId)) {
    return { code: 'message_replayed' };
  }
  if (
    retainedIds.length >= state.inbound.limits.maximumTrackedMessageIds ||
    receivedAt >
      Number.MAX_SAFE_INTEGER - state.inbound.limits.messageIdRetentionMs
  ) {
    return { code: 'replay_capacity_exceeded' };
  }

  const replayKey = JSON.stringify([
    envelope.sender.peerId,
    envelope.sender.instanceId,
  ]);
  const current = state.inbound.replay[replayKey];
  if (
    !current &&
    Object.keys(state.inbound.replay).length >=
      state.inbound.limits.maximumReplayWindows
  ) {
    return { code: 'replay_capacity_exceeded' };
  }

  let nextWindow: MeshCoordinationInboundReplayWindow;
  if (!current) {
    nextWindow = Object.freeze({
      highestSequence: envelope.sequence,
      seenOffsets: Object.freeze([0]),
    });
  } else if (envelope.sequence > current.highestSequence) {
    const advance = envelope.sequence - current.highestSequence;
    nextWindow = Object.freeze({
      highestSequence: envelope.sequence,
      seenOffsets: Object.freeze(
        advance >= state.inbound.limits.replayWindowSize
          ? [0]
          : [
              0,
              ...current.seenOffsets
                .map((offset) => offset + advance)
                .filter(
                  (offset) => offset < state.inbound.limits.replayWindowSize
                ),
            ]
      ),
    });
  } else {
    const offset = current.highestSequence - envelope.sequence;
    if (offset >= state.inbound.limits.replayWindowSize) {
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

  return {
    inbound: Object.freeze({
      ...state.inbound,
      replay: createFrozenRecord([
        ...recordEntries(state.inbound.replay).filter(
          ([key]) => key !== replayKey
        ),
        [replayKey, nextWindow],
      ]),
      messageIds: createFrozenRecord([
        ...retainedIds,
        [
          envelope.messageId,
          receivedAt + state.inbound.limits.messageIdRetentionMs,
        ],
      ]),
      lastLogicalTime: receivedAt,
    }),
  };
}

function isAuthenticatedDomainDuplicate(
  state: MeshDiscoveryInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>
): boolean {
  const recordId =
    envelope.payload.type === 'peer.card' ||
    envelope.payload.type === 'peer.goodbye'
      ? envelope.payload.peerCardId
      : envelope.payload.advertisementId;
  const record =
    state.coordination.domainRecords[
      JSON.stringify([envelope.payload.type, recordId])
    ];
  return (
    record !== undefined &&
    record.contentDigest === envelope.payloadHash.slice('sha256:'.length) &&
    isCurrentDuplicateHead(state, envelope)
  );
}

function isCurrentDuplicateHead(
  state: MeshDiscoveryInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>
): boolean {
  const payload = envelope.payload;
  switch (payload.type) {
    case 'peer.card': {
      const card = state.discovery.peerCards[payload.subjectPeerId];
      return (
        card?.peerCardId === payload.peerCardId &&
        card.cardRevision === payload.cardRevision &&
        card.instanceId === envelope.sender.instanceId
      );
    }
    case 'peer.goodbye': {
      const card = state.discovery.peerCards[envelope.sender.peerId];
      return (
        card?.status === 'departed' &&
        card.peerCardId === payload.peerCardId &&
        card.cardRevision === payload.cardRevision &&
        card.instanceId === envelope.sender.instanceId
      );
    }
    case 'capability.advertise': {
      const capability =
        state.discovery.capabilities[
          JSON.stringify([payload.ownerPeerId, payload.capabilityId])
        ];
      return (
        capability?.advertisementId === payload.advertisementId &&
        capability.capabilityRevision === payload.capabilityRevision &&
        capability.instanceId === envelope.sender.instanceId
      );
    }
    case 'capability.withdraw': {
      const capability =
        state.discovery.capabilities[
          JSON.stringify([envelope.sender.peerId, payload.capabilityId])
        ];
      return (
        capability?.status === 'withdrawn' &&
        capability.advertisementId === payload.advertisementId &&
        capability.capabilityRevision === payload.capabilityRevision &&
        capability.instanceId === envelope.sender.instanceId
      );
    }
  }
}

function sameCanonicalEnvelope(
  requested: SignedMeshEnvelope,
  verified: SignedMeshEnvelope,
  protocolOptions: MeshProtocolOptions | undefined
): boolean {
  const requestedCanonical = canonicalizeMeshJson(requested, protocolOptions);
  const verifiedCanonical = canonicalizeMeshJson(verified, protocolOptions);
  return (
    requestedCanonical.ok &&
    verifiedCanonical.ok &&
    requestedCanonical.value === verifiedCanonical.value
  );
}

function contextRejection(
  code: MeshProtocolErrorCode | undefined,
  envelope: SignedMeshEnvelope<MeshDiscoveryPayload>,
  subscriptions: readonly MeshAudienceTopic[]
): MeshDiscoveryInboundRejectionCode {
  switch (code) {
    case 'scope_mismatch':
      return 'scope_mismatch';
    case 'invalid_audience':
      return envelope.audience.kind === 'mesh' &&
        !subscriptions.includes(envelope.audience.topic)
        ? 'topic_not_subscribed'
        : 'audience_mismatch';
    case 'message_expired':
    case 'message_from_future':
    case 'unknown_critical_extension':
      return code;
    default:
      return 'invalid_envelope';
  }
}

function acceptance(
  state: MeshDiscoveryInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>,
  duplicate: boolean
): MeshDiscoveryInboundDecision {
  return Object.freeze({
    accepted: true,
    duplicate,
    envelope,
    state,
  });
}

function rejection(
  state: MeshDiscoveryInboundRuntimeState,
  code: MeshDiscoveryInboundRejectionCode | MeshDiscoveryRejectionCode
): MeshDiscoveryInboundDecision {
  return Object.freeze({ accepted: false, code, state });
}

function assertRuntimeState(state: MeshDiscoveryInboundRuntimeState): void {
  if (
    !state ||
    typeof state !== 'object' ||
    Object.getPrototypeOf(state) !== Object.prototype ||
    !hasExactDataKeys(
      state,
      ['coordination', 'discovery', 'inbound'],
      ['coordination', 'discovery', 'inbound']
    ) ||
    !Object.isFrozen(state)
  ) {
    throw new TypeError(
      'Mesh discovery inbound runtime state must be immutable'
    );
  }
  assertFrozenMeshCoordinationInboundState(state.inbound);
  createMeshDiscoveryInboundRuntimeState(
    state.coordination,
    state.discovery,
    state.inbound
  );
}

function assertRequest(request: MeshDiscoveryInboundRequest): void {
  if (!request || typeof request !== 'object') {
    throw new TypeError('Mesh discovery inbound request is required');
  }
  const prototype = Object.getPrototypeOf(request);
  if (
    (prototype !== null && prototype !== Object.prototype) ||
    !hasExactDataKeys(
      request,
      ['envelope', 'receivedAt', 'verifiedAt'],
      ['envelope', 'receivedAt', 'verifiedAt']
    )
  ) {
    throw new TypeError('Invalid Mesh discovery inbound request');
  }
}

function snapshotCrypto(injected: Crypto | undefined): Crypto {
  const candidate =
    injected ?? (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
  const subtle = candidate?.subtle;
  if (
    !subtle ||
    typeof subtle.digest !== 'function' ||
    typeof subtle.verify !== 'function'
  ) {
    throw new TypeError('Mesh discovery inbound processor requires Web Crypto');
  }
  const digest = subtle.digest.bind(subtle);
  const verify = subtle.verify.bind(subtle);
  return Object.freeze({
    subtle: Object.freeze({ digest, verify }) as unknown as SubtleCrypto,
  }) as unknown as Crypto;
}

function assertProcessorOptions(
  options: MeshDiscoveryInboundProcessorOptions
): void {
  if (!options || typeof options !== 'object') {
    throw new TypeError(
      'Mesh discovery inbound processor options are required'
    );
  }
  const prototype = Object.getPrototypeOf(options);
  if (
    (prototype !== null && prototype !== Object.prototype) ||
    !hasExactDataKeys(
      options,
      [
        'crypto',
        'cryptoPolicy',
        'protocolOptions',
        'resolver',
        'supportedCriticalExtensions',
      ],
      ['cryptoPolicy', 'resolver']
    ) ||
    !options.resolver ||
    typeof options.resolver.resolve !== 'function' ||
    !options.cryptoPolicy ||
    typeof options.cryptoPolicy !== 'object' ||
    Object.getPrototypeOf(options.cryptoPolicy) !== Object.prototype ||
    !hasExactDataKeys(
      options.cryptoPolicy,
      ['allowedAlgorithms'],
      ['allowedAlgorithms']
    ) ||
    !isDenseDataArray(options.cryptoPolicy.allowedAlgorithms) ||
    options.cryptoPolicy.allowedAlgorithms.length < 1 ||
    options.cryptoPolicy.allowedAlgorithms.some(
      (algorithm) => typeof algorithm !== 'string'
    ) ||
    (options.supportedCriticalExtensions !== undefined &&
      (!isDenseDataArray(options.supportedCriticalExtensions) ||
        options.supportedCriticalExtensions.length >
          DEFAULT_MESH_PROTOCOL_LIMITS.maximumCriticalExtensions ||
        new Set(options.supportedCriticalExtensions).size !==
          options.supportedCriticalExtensions.length ||
        options.supportedCriticalExtensions.some(
          (extension) => typeof extension !== 'string' || extension.length < 1
        ))) ||
    (options.protocolOptions !== undefined &&
      (!isPlainDataRecord(options.protocolOptions) ||
        !hasExactDataKeys(options.protocolOptions, ['limits'], []) ||
        (options.protocolOptions.limits !== undefined &&
          !isPlainDataRecord(options.protocolOptions.limits))))
  ) {
    throw new TypeError('Invalid Mesh discovery inbound processor options');
  }
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === null || prototype === Object.prototype) &&
    hasOnlyDataProperties(value)
  );
}

function hasOnlyDataProperties(value: object): boolean {
  return (
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.getOwnPropertyNames(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        descriptor !== undefined &&
        'value' in descriptor &&
        descriptor.enumerable === true
      );
    })
  );
}

function hasExactDataKeys(
  value: object,
  supportedKeys: readonly string[],
  requiredKeys: readonly string[]
): boolean {
  const supported = new Set(supportedKeys);
  return (
    hasOnlyDataProperties(value) &&
    Object.getOwnPropertyNames(value).every((key) => supported.has(key)) &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isDenseDataArray(value: unknown): value is readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return false;
  }
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.enumerable !== true
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
