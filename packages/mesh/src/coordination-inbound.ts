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
  MeshCoordinationInboundState,
  MeshAllocationInboundDecision,
  MeshAllocationInboundProcessor,
  MeshAllocationInboundProcessorOptions,
  MeshAllocationInboundRejectionCode,
  MeshAllocationInboundRequest,
  MeshAllocationInboundRuntimeState,
  MeshAllocationInboundPayload,
  MeshDiscoveryInboundDecision,
  MeshDiscoveryInboundProcessor,
  MeshDiscoveryInboundProcessorOptions,
  MeshDiscoveryInboundRejectionCode,
  MeshDiscoveryInboundRequest,
  MeshDiscoveryInboundRuntimeState,
  MeshObjectiveInboundDecision,
  MeshObjectiveInboundProcessor,
  MeshObjectiveInboundProcessorOptions,
  MeshObjectiveInboundRejectionCode,
  MeshObjectiveInboundRequest,
  MeshObjectiveInboundRuntimeState,
} from './coordination-inbound-contracts.js';
import {
  assertFrozenMeshCoordinationInboundState,
  createMeshAllocationInboundRuntimeState,
  createMeshDiscoveryInboundRuntimeState,
  createMeshObjectiveInboundRuntimeState,
  synchronizeMeshObjectiveLogicalTime,
} from './coordination-inbound-state.js';
import type {
  MeshDiscoveryPayload,
  MeshDiscoveryRejectionCode,
} from './coordination-discovery-contracts.js';
import { evaluateVerifiedMeshDiscoveryEnvelope } from './coordination-discovery.js';
import { createMeshDiscoveryRuntimeState } from './coordination-discovery-state.js';
import type {
  MeshObjectivePayload,
  MeshObjectiveWorkRejectionCode,
} from './coordination-objective-work-contracts.js';
import {
  createMeshObjectiveWorkRuntimeState,
  evaluateVerifiedMeshObjectiveEnvelope,
} from './coordination-objective-work.js';
import type {
  MeshAllocationPayload,
  MeshAllocationRejectionCode,
  MeshAllocationRuntimeState,
} from './coordination-allocation-contracts.js';
import { evaluateVerifiedMeshAllocationEnvelope } from './coordination-allocation.js';
import { createMeshAllocationRuntimeState } from './coordination-allocation-state.js';
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

interface TrustedObjectiveDecisionBinding {
  readonly state: MeshObjectiveInboundRuntimeState;
  readonly request: MeshObjectiveInboundRequest;
}

const trustedObjectiveDecisionBindings = new WeakMap<
  object,
  TrustedObjectiveDecisionBinding
>();

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

/** Binds local trust dependencies once, outside the Objective message path. */
export function createMeshObjectiveInboundProcessor(
  options: MeshObjectiveInboundProcessorOptions
): MeshObjectiveInboundProcessor {
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
    process: async (
      state: MeshObjectiveInboundRuntimeState,
      request: MeshObjectiveInboundRequest
    ) => {
      const decision = await processMeshObjectiveEnvelope(
        state,
        request,
        configuration
      );
      trustedObjectiveDecisionBindings.set(
        decision,
        Object.freeze({ state, request })
      );
      return decision;
    },
  });
}

/** Binds local trust dependencies once, outside the allocation message path. */
export function createMeshAllocationInboundProcessor(
  options: MeshAllocationInboundProcessorOptions
): MeshAllocationInboundProcessor {
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
      state: MeshAllocationInboundRuntimeState,
      request: MeshAllocationInboundRequest
    ) => processMeshAllocationEnvelope(state, request, configuration),
  });
}

/**
 * Package-internal attestation used by the reference topic driver. It prevents
 * a processor wrapper from substituting a decision produced for different
 * state or input while keeping the public decision contract serializable.
 */
export function isTrustedMeshObjectiveInboundDecision(
  decision: unknown,
  state: MeshObjectiveInboundRuntimeState,
  request: MeshObjectiveInboundRequest
): decision is MeshObjectiveInboundDecision {
  if (!decision || typeof decision !== 'object') return false;
  const binding = trustedObjectiveDecisionBindings.get(decision);
  return binding?.state === state && binding.request === request;
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

  const replay = advanceReplayState(
    state.inbound,
    verifiedEnvelope,
    receivedAt
  );
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

/**
 * Authenticates one signed Objective envelope before admission, replay and
 * projection. Rejections after replay admission retain only security state.
 */
async function processMeshObjectiveEnvelope(
  state: MeshObjectiveInboundRuntimeState,
  request: MeshObjectiveInboundRequest,
  configuration: TrustedInboundConfiguration
): Promise<MeshObjectiveInboundDecision> {
  assertObjectiveRuntimeState(state);
  assertObjectiveRequest(request);

  const receivedAt = request.receivedAt;
  const verifiedAt = request.verifiedAt;
  assertMeshLogicalTime(receivedAt);
  if (
    receivedAt <
    Math.max(
      state.coordination.lastLogicalTime,
      state.discovery.lastLogicalTime,
      state.objectives.lastLogicalTime,
      state.inbound.lastLogicalTime
    )
  ) {
    return objectiveRejection(state, 'logical_time_regressed');
  }

  const context = validateMeshEnvelopeContext(
    request.envelope,
    {
      tenantId: state.discovery.identity.tenantId,
      meshId: state.discovery.identity.meshId,
      peerId: state.discovery.identity.peerId,
      receivedAt: verifiedAt,
      subscribedTopics: state.discovery.subscriptions,
      ...(configuration.supportedCriticalExtensions === undefined
        ? {}
        : {
            supportedCriticalExtensions:
              configuration.supportedCriticalExtensions,
          }),
    },
    configuration.protocolOptions
  );
  if (!context.ok) {
    return objectiveRejection(
      state,
      objectiveContextRejection(
        context.issues[0]?.code,
        request.envelope,
        state.discovery.subscriptions
      )
    );
  }
  const contextualEnvelope = context.value;
  const familyFailure = validateObjectiveFamily(contextualEnvelope);
  if (familyFailure) return objectiveRejection(state, familyFailure);

  let verification: MeshVerificationResult | undefined;
  try {
    verification = await verifyMeshEnvelope({
      envelope: contextualEnvelope,
      resolver: configuration.resolver,
      policy: configuration.cryptoPolicy,
      verifiedAt,
      crypto: configuration.crypto,
      protocolOptions: configuration.protocolOptions,
    });
  } catch {
    return objectiveRejection(state, 'crypto_operation_failed');
  }

  let verifiedEnvelope: VerifiedMeshEnvelope<MeshObjectivePayload>;
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
      return objectiveRejection(state, code);
    }
    const rebound = validateMeshEnvelopeContext(
      verification.envelope,
      {
        tenantId: state.discovery.identity.tenantId,
        meshId: state.discovery.identity.meshId,
        peerId: state.discovery.identity.peerId,
        receivedAt: verifiedAt,
        subscribedTopics: state.discovery.subscriptions,
        ...(configuration.supportedCriticalExtensions === undefined
          ? {}
          : {
              supportedCriticalExtensions:
                configuration.supportedCriticalExtensions,
            }),
      },
      configuration.protocolOptions
    );
    if (
      !rebound.ok ||
      !sameCanonicalEnvelope(
        contextualEnvelope,
        rebound.value,
        configuration.protocolOptions
      )
    ) {
      return objectiveRejection(state, 'crypto_operation_failed');
    }
    verifiedEnvelope =
      rebound.value as VerifiedMeshEnvelope<MeshObjectivePayload>;
  } catch {
    return objectiveRejection(state, 'crypto_operation_failed');
  }

  const admissionFailure = validateObjectiveAdmission(
    state,
    verifiedEnvelope,
    verifiedAt
  );
  if (admissionFailure) return objectiveRejection(state, admissionFailure);
  const authorityFailure = validateObjectiveIssuerAuthority(
    state,
    verifiedEnvelope,
    verifiedAt
  );
  if (authorityFailure) return objectiveRejection(state, authorityFailure);

  const replay = advanceReplayState(
    state.inbound,
    verifiedEnvelope,
    receivedAt
  );
  if ('code' in replay) return objectiveRejection(state, replay.code);
  const replayRuntime = createMeshObjectiveInboundRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    replay.inbound
  );
  const projection = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      state.coordination,
      state.discovery,
      synchronizeMeshObjectiveLogicalTime(
        state.objectives,
        state.coordination.lastLogicalTime
      )
    ),
    {
      envelope: verifiedEnvelope,
      verifiedAt,
      receivedAt,
      ...(configuration.supportedCriticalExtensions === undefined
        ? {}
        : {
            supportedCriticalExtensions:
              configuration.supportedCriticalExtensions,
          }),
    }
  );
  if (!projection.accepted)
    return objectiveRejection(replayRuntime, projection.code);
  return objectiveAcceptance(
    createMeshObjectiveInboundRuntimeState(
      projection.state.coordination,
      projection.state.discovery,
      projection.state.objectives,
      replay.inbound
    ),
    verifiedEnvelope,
    projection.duplicate
  );
}

/**
 * Authenticates one signed allocation envelope before admission, replay and
 * the authoritative allocation reducer. Rejections after replay retain only
 * inbound security accounting.
 */
async function processMeshAllocationEnvelope(
  state: MeshAllocationInboundRuntimeState,
  request: MeshAllocationInboundRequest,
  configuration: TrustedInboundConfiguration
): Promise<MeshAllocationInboundDecision> {
  assertAllocationRuntimeState(state);
  assertAllocationRequest(request);

  const receivedAt = request.receivedAt;
  const verifiedAt = request.verifiedAt;
  assertMeshLogicalTime(receivedAt);
  if (
    receivedAt <
    Math.max(
      state.coordination.lastLogicalTime,
      state.discovery.lastLogicalTime,
      state.objectives.lastLogicalTime,
      state.allocation.lastLogicalTime,
      state.inbound.lastLogicalTime
    )
  ) {
    return allocationRejection(state, 'logical_time_regressed');
  }

  const context = validateMeshEnvelopeContext(
    request.envelope,
    {
      tenantId: state.discovery.identity.tenantId,
      meshId: state.discovery.identity.meshId,
      peerId: state.discovery.identity.peerId,
      receivedAt: verifiedAt,
      subscribedTopics: state.discovery.subscriptions,
      ...(configuration.supportedCriticalExtensions === undefined
        ? {}
        : {
            supportedCriticalExtensions:
              configuration.supportedCriticalExtensions,
          }),
    },
    configuration.protocolOptions
  );
  if (!context.ok) {
    return allocationRejection(
      state,
      allocationContextRejection(
        context.issues[0]?.code,
        request.envelope,
        state.discovery.subscriptions
      )
    );
  }
  const contextualEnvelope = context.value;
  const familyFailure = validateAllocationFamily(contextualEnvelope);
  if (familyFailure) return allocationRejection(state, familyFailure);

  let verification: MeshVerificationResult | undefined;
  try {
    verification = await verifyMeshEnvelope({
      envelope: contextualEnvelope,
      resolver: configuration.resolver,
      policy: configuration.cryptoPolicy,
      verifiedAt,
      crypto: configuration.crypto,
      protocolOptions: configuration.protocolOptions,
    });
  } catch {
    return allocationRejection(state, 'crypto_operation_failed');
  }

  let verifiedEnvelope: VerifiedMeshEnvelope<MeshAllocationInboundPayload>;
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
      return allocationRejection(state, code);
    }
    const rebound = validateMeshEnvelopeContext(
      verification.envelope,
      {
        tenantId: state.discovery.identity.tenantId,
        meshId: state.discovery.identity.meshId,
        peerId: state.discovery.identity.peerId,
        receivedAt: verifiedAt,
        subscribedTopics: state.discovery.subscriptions,
        ...(configuration.supportedCriticalExtensions === undefined
          ? {}
          : {
              supportedCriticalExtensions:
                configuration.supportedCriticalExtensions,
            }),
      },
      configuration.protocolOptions
    );
    if (
      !rebound.ok ||
      !sameCanonicalEnvelope(
        contextualEnvelope,
        rebound.value,
        configuration.protocolOptions
      )
    ) {
      return allocationRejection(state, 'crypto_operation_failed');
    }
    verifiedEnvelope =
      rebound.value as VerifiedMeshEnvelope<MeshAllocationInboundPayload>;
  } catch {
    return allocationRejection(state, 'crypto_operation_failed');
  }

  const admissionFailure = validateAllocationAdmission(
    state,
    verifiedEnvelope,
    verifiedAt
  );
  if (admissionFailure) return allocationRejection(state, admissionFailure);

  const replay = advanceReplayState(
    state.inbound,
    verifiedEnvelope,
    receivedAt
  );
  if ('code' in replay) return allocationRejection(state, replay.code);
  const replayRuntime = createMeshAllocationInboundRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    state.allocation,
    replay.inbound
  );

  const projection = evaluateVerifiedMeshAllocationEnvelope(
    createMeshAllocationRuntimeState(
      state.coordination,
      state.discovery,
      state.objectives,
      state.allocation
    ),
    {
      envelope: verifiedEnvelope as VerifiedMeshEnvelope<MeshAllocationPayload>,
      verifiedAt,
      receivedAt,
      ...(configuration.supportedCriticalExtensions === undefined
        ? {}
        : {
            supportedCriticalExtensions:
              configuration.supportedCriticalExtensions,
          }),
    }
  );
  if (!projection.accepted)
    return allocationRejection(replayRuntime, projection.code);
  return allocationAcceptance(
    createMeshAllocationInboundRuntimeState(
      projection.state.coordination,
      projection.state.discovery,
      projection.state.objectives,
      projection.state.allocation,
      replay.inbound
    ),
    verifiedEnvelope,
    projection.duplicate
  );
}

function validateObjectiveFamily(
  envelope: SignedMeshEnvelope
): MeshObjectiveInboundRejectionCode | undefined {
  const payload = envelope.payload;
  if (
    payload.type !== 'objective.announce' &&
    payload.type !== 'objective.revise' &&
    payload.type !== 'objective.cancel'
  ) {
    return 'unsupported_message_type';
  }
  if (
    envelope.audience.kind === 'mesh' &&
    envelope.audience.topic !== 'objective'
  ) {
    return 'audience_mismatch';
  }
  return payload.type !== 'objective.cancel' &&
    envelope.sender.peerId !== payload.issuerPeerId
    ? 'issuer_not_authorized'
    : undefined;
}

function validateAllocationFamily(
  envelope: SignedMeshEnvelope
): MeshAllocationInboundRejectionCode | undefined {
  const type = envelope.payload.type;
  if (
    type !== 'work.offer' &&
    type !== 'work.bid' &&
    type !== 'work.award' &&
    type !== 'work.accept' &&
    type !== 'work.decline' &&
    type !== 'work.progress' &&
    type !== 'work.checkpoint' &&
    type !== 'work.result' &&
    type !== 'work.release' &&
    type !== 'work.cancel' &&
    type !== 'lease.renew'
  ) {
    return 'unsupported_message_type';
  }
  return undefined;
}

function validateObjectiveAdmission(
  state: MeshObjectiveInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshObjectivePayload>,
  verifiedAt: string
): MeshObjectiveInboundRejectionCode | undefined {
  const admission = state.discovery.admittedPeers[envelope.sender.peerId];
  if (!admission) return 'sender_not_admitted';
  if (!admission.instanceIds.includes(envelope.sender.instanceId)) {
    return 'sender_instance_not_admitted';
  }
  const expiry = compareMeshTimestamps(verifiedAt, admission.validUntil);
  return !expiry.ok || expiry.value >= 0
    ? 'sender_admission_expired'
    : undefined;
}

function validateAllocationAdmission(
  state: MeshAllocationInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshAllocationInboundPayload>,
  verifiedAt: string
): MeshAllocationInboundRejectionCode | undefined {
  const admission = state.discovery.admittedPeers[envelope.sender.peerId];
  if (!admission) return 'sender_not_admitted';
  if (!admission.instanceIds.includes(envelope.sender.instanceId)) {
    return 'sender_instance_not_admitted';
  }
  const expiry = compareMeshTimestamps(verifiedAt, admission.validUntil);
  return !expiry.ok || expiry.value >= 0
    ? 'sender_admission_expired'
    : undefined;
}

function validateObjectiveIssuerAuthority(
  state: MeshObjectiveInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshObjectivePayload>,
  verifiedAt: string
): MeshObjectiveInboundRejectionCode | undefined {
  const authority = state.objectives.issuerAuthorities[envelope.sender.peerId];
  if (!authority) return 'issuer_not_authorized';
  if (!authority.keyIds.includes(envelope.proof.keyId)) {
    return 'issuer_key_not_authorized';
  }
  const expiry = compareMeshTimestamps(verifiedAt, authority.validUntil);
  return !expiry.ok || expiry.value >= 0
    ? 'issuer_authority_expired'
    : undefined;
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
  inbound: MeshCoordinationInboundState,
  envelope: VerifiedMeshEnvelope,
  receivedAt: number
):
  | { readonly inbound: MeshCoordinationInboundState }
  | {
      readonly code:
        | 'message_replayed'
        | 'sequence_outside_window'
        | 'replay_capacity_exceeded';
    } {
  const retainedIds = recordEntries(inbound.messageIds).filter(
    ([, expiresAt]) => expiresAt > receivedAt
  );
  if (retainedIds.some(([messageId]) => messageId === envelope.messageId)) {
    return { code: 'message_replayed' };
  }
  if (
    retainedIds.length >= inbound.limits.maximumTrackedMessageIds ||
    receivedAt > Number.MAX_SAFE_INTEGER - inbound.limits.messageIdRetentionMs
  ) {
    return { code: 'replay_capacity_exceeded' };
  }

  const replayKey = JSON.stringify([
    envelope.sender.peerId,
    envelope.sender.instanceId,
  ]);
  const current = inbound.replay[replayKey];
  if (
    !current &&
    Object.keys(inbound.replay).length >= inbound.limits.maximumReplayWindows
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
        advance >= inbound.limits.replayWindowSize
          ? [0]
          : [
              0,
              ...current.seenOffsets
                .map((offset) => offset + advance)
                .filter((offset) => offset < inbound.limits.replayWindowSize),
            ]
      ),
    });
  } else {
    const offset = current.highestSequence - envelope.sequence;
    if (offset >= inbound.limits.replayWindowSize) {
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
      ...inbound,
      replay: createFrozenRecord([
        ...recordEntries(inbound.replay).filter(([key]) => key !== replayKey),
        [replayKey, nextWindow],
      ]),
      messageIds: createFrozenRecord([
        ...retainedIds,
        [envelope.messageId, receivedAt + inbound.limits.messageIdRetentionMs],
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

function objectiveContextRejection(
  code: MeshProtocolErrorCode | undefined,
  envelope: SignedMeshEnvelope<MeshObjectivePayload>,
  subscriptions: readonly MeshAudienceTopic[]
): MeshObjectiveInboundRejectionCode {
  switch (code) {
    case 'scope_mismatch':
      return 'scope_mismatch';
    case 'invalid_audience':
      return envelope.audience.kind === 'mesh' &&
        !subscriptions.includes('objective')
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

function allocationContextRejection(
  code: MeshProtocolErrorCode | undefined,
  envelope: SignedMeshEnvelope<MeshAllocationInboundPayload>,
  subscriptions: readonly MeshAudienceTopic[]
): MeshAllocationInboundRejectionCode {
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
      return 'invalid_verified_envelope';
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

function objectiveAcceptance(
  state: MeshObjectiveInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshObjectivePayload>,
  duplicate: boolean
): MeshObjectiveInboundDecision {
  return Object.freeze({ accepted: true, duplicate, envelope, state });
}

function allocationAcceptance(
  state: MeshAllocationInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshAllocationInboundPayload>,
  duplicate: boolean
): MeshAllocationInboundDecision {
  return Object.freeze({ accepted: true, duplicate, envelope, state });
}

function objectiveRejection(
  state: MeshObjectiveInboundRuntimeState,
  code: MeshObjectiveInboundRejectionCode | MeshObjectiveWorkRejectionCode
): MeshObjectiveInboundDecision {
  return Object.freeze({ accepted: false, code, state });
}

function allocationRejection(
  state: MeshAllocationInboundRuntimeState,
  code: MeshAllocationInboundRejectionCode | MeshAllocationRejectionCode
): MeshAllocationInboundDecision {
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

function assertObjectiveRuntimeState(
  state: MeshObjectiveInboundRuntimeState
): void {
  if (
    !state ||
    typeof state !== 'object' ||
    Object.getPrototypeOf(state) !== Object.prototype ||
    !hasExactDataKeys(
      state,
      ['coordination', 'discovery', 'inbound', 'objectives'],
      ['coordination', 'discovery', 'inbound', 'objectives']
    ) ||
    !Object.isFrozen(state)
  ) {
    throw new TypeError(
      'Mesh Objective inbound runtime state must be immutable'
    );
  }
  assertFrozenMeshCoordinationInboundState(state.inbound);
  createMeshObjectiveInboundRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    state.inbound
  );
}

function assertAllocationRuntimeState(
  state: MeshAllocationInboundRuntimeState
): void {
  if (
    !state ||
    typeof state !== 'object' ||
    Object.getPrototypeOf(state) !== Object.prototype ||
    !hasExactDataKeys(
      state,
      ['allocation', 'coordination', 'discovery', 'inbound', 'objectives'],
      ['allocation', 'coordination', 'discovery', 'inbound', 'objectives']
    ) ||
    !Object.isFrozen(state)
  ) {
    throw new TypeError(
      'Mesh allocation inbound runtime state must be immutable'
    );
  }
  assertFrozenMeshCoordinationInboundState(state.inbound);
  createMeshAllocationInboundRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    state.allocation,
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

function assertObjectiveRequest(request: MeshObjectiveInboundRequest): void {
  if (!request || typeof request !== 'object') {
    throw new TypeError('Mesh Objective inbound request is required');
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
    throw new TypeError('Invalid Mesh Objective inbound request');
  }
}

function assertAllocationRequest(request: MeshAllocationInboundRequest): void {
  if (!request || typeof request !== 'object') {
    throw new TypeError('Mesh allocation inbound request is required');
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
    throw new TypeError('Invalid Mesh allocation inbound request');
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
