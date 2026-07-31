import { canonicalizeJsonValue } from './canonical-json.js';
import {
  normalizeMeshEvidenceAttestationV1,
  normalizeMeshEvidenceChallengeV1,
  normalizeMeshEvidenceClaimV1,
  normalizeMeshEvidenceRetractionV1,
  normalizeMeshTrustObservationV1,
} from '@agentplat/trust/mesh-records';
import type { TrustReasonCodeV1 } from '@agentplat/trust';
import {
  DEFAULT_MESH_PROTOCOL_LIMITS,
  MESH_AUDIENCE_TOPICS,
  MESH_MESSAGE_TYPES,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  type CapabilityAdvertisePayload,
  type CapabilityWithdrawPayload,
  type EvidenceAttestationPayload,
  type EvidenceChallengePayload,
  type EvidenceClaimPayload,
  type EvidenceRetractionPayload,
  type LeaseCertificatePayload,
  type LeaseRenewPayload,
  type LeaseTakeoverProposalPayload,
  type LeaseVotePayload,
  type MeshAudience,
  type MeshAudienceTopic,
  type MeshEnvelope,
  type MeshEnvelopeContext,
  type MeshEvidenceContent,
  type MeshEvidenceReference,
  type MeshEvidenceScope,
  type MeshEvidenceSubject,
  type MeshJsonValue,
  type MeshMessagePayload,
  type MeshProtocolErrorCode,
  type MeshProtocolIssue,
  type MeshProtocolLimits,
  type MeshProtocolOptions,
  type MeshProtocolResult,
  type MeshSender,
  type MeshSigningDocument,
  type MeshTimestampOrder,
  type ObjectiveAnnouncePayload,
  type ObjectiveCancelPayload,
  type ObjectiveDocumentContent,
  type ObjectiveDocumentFields,
  type ObjectiveRevisePayload,
  type PeerCardPayload,
  type PeerGoodbyePayload,
  type PeerHelloPayload,
  type PeerPingAckPayload,
  type PeerPingPayload,
  type SignedMeshEnvelope,
  type TrustObservationPayload,
  type WorkBidPayload,
  type WorkAcceptPayload,
  type WorkAssignmentAuthorityFields,
  type WorkAwardFields,
  type WorkAwardPayload,
  type WorkCancelPayload,
  type WorkCheckpointContent,
  type WorkCheckpointPayload,
  type WorkDeclinePayload,
  type WorkExecutionAuthorityFields,
  type WorkOfferFields,
  type WorkOfferInput,
  type WorkOfferPayload,
  type WorkProgressPayload,
  type WorkReleasePayload,
  type WorkResultContent,
  type WorkResultPayload,
} from './contracts.js';
import {
  parseStrictJsonDocument,
  type StrictJsonLimits,
} from './strict-json.js';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const rfc3339Pattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const base64UrlAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const maximumIssuePathLength = 256;
const maximumDomainStringBytes = 4_096;
const maximumProtocolVersions = 8;
const maximumTransportHints = 8;
const maximumTransportHintBytes = 2_048;
const maximumTransportHintsBytes = 8_192;
const maximumCapabilityIds = 32;
const maximumMediaTypes = 16;
const maximumMediaTypeBytes = 128;
const maximumAttributes = 32;
const maximumAttributeKeyBytes = 128;
const maximumAttributeValueBytes = 1_024;
const maximumAttributesBytes = 16_384;
const maximumVersionBytes = 128;
const maximumAdvertisementValidityMs = 24 * 60 * 60 * 1_000;
const maximumObjectiveValidityMs = 30 * 24 * 60 * 60 * 1_000;
const maximumObjectiveTextBytes = 4_096;
const maximumSuccessCriteria = 32;
const maximumSuccessCriteriaBytes = 16_384;
const maximumPermittedCapabilityKeys = 32;
const maximumRecoveryWitnesses = 32;
const minimumRecoveryWitnesses = 3;
const maximumAuthorizedObservers = 32;
const maximumObjectiveWorkItems = 1_000_000;
const maximumBidWindowMs = 60 * 60 * 1_000;
const maximumAcceptanceWindowMs = 15 * 60 * 1_000;
const maximumLeaseDurationMs = 24 * 60 * 60 * 1_000;
const maximumRecoveryGraceMs = 60 * 60 * 1_000;
const maximumLeaseRenewals = 100;
const maximumWorkCapabilityKeys = 32;
const maximumWorkTextBytes = 4_096;
const maximumWorkListItems = 32;
const maximumWorkListBytes = 16_384;
const maximumCapacityReservationUnits = 1_000_000;
const maximumWorkBidWindowMs = 60 * 60 * 1_000;
const maximumWorkDeadlineMs = 30 * 24 * 60 * 60 * 1_000;
const maximumWorkExecutionLifetimeMs = 5 * 60 * 1_000;
const maximumEvidenceLifetimeMs = 5 * 60 * 1_000;
const maximumEvidenceReferences = 32;
const maximumEvidenceReferenceBytes = 4_096;
const maximumEvidenceContentBytes = 4_096;
const maximumEvidenceIdentifierBytes = 256;
const maximumEvidenceReasonCodes = 32;
const trustDigestPattern = /^[0-9a-f]{64}$/;
const knownMessageTypes = new Set<string>(MESH_MESSAGE_TYPES);
const knownTopics = new Set<string>(MESH_AUDIENCE_TOPICS);
const utf8Encoder = new TextEncoder();

const topLevelRequiredKeys = Object.freeze([
  'audience',
  'expiresAt',
  'meshId',
  'messageId',
  'payload',
  'payloadHash',
  'proof',
  'protocol',
  'sender',
  'sentAt',
  'sequence',
  'tenantId',
  'type',
  'wireVersion',
]);
const topLevelOptionalKeys = Object.freeze([
  'causationId',
  'correlationId',
  'criticalExtensions',
  'extensions',
  'objectiveId',
]);

class ValidationFailure extends Error {
  constructor(
    readonly code: MeshProtocolErrorCode,
    readonly path: string
  ) {
    super(code);
  }
}

/** Strictly parses any bounded JSON value without losing duplicate-key data. */
export function parseMeshJson(
  input: string | Uint8Array,
  options: MeshProtocolOptions = {}
): MeshProtocolResult<MeshJsonValue> {
  const limits = resolveLimits(options.limits);
  const parsed = parseStrictJsonDocument(input, strictLimits(limits));
  if (!parsed.ok) return failure(parsed.code, parsed.path);
  return success(parsed.value as MeshJsonValue);
}

/** Canonicalizes an I-JSON-compatible value using RFC 8785 ordering rules. */
export function canonicalizeMeshJson(
  input: unknown,
  options: MeshProtocolOptions = {}
): MeshProtocolResult<string> {
  const result = canonicalizeMeshJsonInternal(input, options);
  return result.ok ? success(result.value) : result;
}

/** Canonicalizes a value and returns the exact UTF-8 bytes used by hashing. */
export function canonicalizeMeshJsonBytes(
  input: unknown,
  options: MeshProtocolOptions = {}
): MeshProtocolResult<Uint8Array> {
  const result = canonicalizeMeshJsonInternal(input, options);
  return result.ok ? success(result.bytes) : result;
}

/** Compares two timestamps using the exact protocol v0 timestamp profile. */
export function compareMeshTimestamps(
  left: string,
  right: string
): MeshProtocolResult<MeshTimestampOrder> {
  try {
    const leftInstant = parseRfc3339(
      assertString(left, '$["left"]', 'invalid_timestamp'),
      '$["left"]'
    );
    const rightInstant = parseRfc3339(
      assertString(right, '$["right"]', 'invalid_timestamp'),
      '$["right"]'
    );
    return success(
      leftInstant < rightInstant ? -1 : leftInstant > rightInstant ? 1 : 0
    );
  } catch (error) {
    return validationFailure(error);
  }
}

/**
 * Parses and statically validates one complete implemented Mesh envelope.
 * This stage does not verify the payload digest or proof.
 */
export function parseSignedMeshEnvelope(
  input: Uint8Array,
  options: MeshProtocolOptions = {}
): MeshProtocolResult<SignedMeshEnvelope> {
  const limits = resolveLimits(options.limits);
  const parsed = parseStrictJsonDocument(input, strictLimits(limits));
  if (!parsed.ok) return failure(parsed.code, parsed.path);
  if (
    parsed.payloadByteLength !== undefined &&
    parsed.payloadByteLength > limits.maximumPayloadBytes
  ) {
    return failure('structural_limit_exceeded', '$["payload"]');
  }
  return validateSignedMeshEnvelope(parsed.value, { limits });
}

/**
 * Validates an in-memory envelope and returns a deeply frozen signed value.
 * This stage does not verify the payload digest or proof.
 */
export function validateSignedMeshEnvelope(
  input: unknown,
  options: MeshProtocolOptions = {}
): MeshProtocolResult<SignedMeshEnvelope> {
  const limits = resolveLimits(options.limits);
  try {
    const envelopeCanonicalization = canonicalizeJsonValue(
      input,
      strictLimits(limits),
      limits.maximumEnvelopeBytes
    );
    if (!envelopeCanonicalization.ok) {
      return failure(
        envelopeCanonicalization.code,
        envelopeCanonicalization.path
      );
    }
    const envelope = validateEnvelope(input, limits);
    const payloadCanonicalization = canonicalizeJsonValue(
      envelope.payload,
      strictLimits(limits),
      limits.maximumPayloadBytes
    );
    if (!payloadCanonicalization.ok) {
      return failure(
        payloadCanonicalization.code,
        prefixPath('$["payload"]', payloadCanonicalization.path)
      );
    }
    return success(deepFreeze(envelope) as SignedMeshEnvelope);
  } catch (error) {
    return validationFailure(error);
  }
}

/**
 * Applies receiver scope, freshness and critical-extension support.
 * This stage does not perform peer admission or replay acceptance.
 */
export function validateMeshEnvelopeContext(
  envelope: SignedMeshEnvelope,
  context: MeshEnvelopeContext,
  options: MeshProtocolOptions = {}
): MeshProtocolResult<SignedMeshEnvelope> {
  const limits = resolveLimits(options.limits);
  try {
    const structuralValidation = validateSignedMeshEnvelope(envelope, {
      limits,
    });
    if (!structuralValidation.ok) return structuralValidation;
    const validatedEnvelope = structuralValidation.value;

    assertIdentifier(context.tenantId, '$context["tenantId"]', limits);
    assertIdentifier(context.meshId, '$context["meshId"]', limits);
    assertIdentifier(context.peerId, '$context["peerId"]', limits);
    if (
      validatedEnvelope.tenantId !== context.tenantId ||
      validatedEnvelope.meshId !== context.meshId
    ) {
      fail('scope_mismatch', '$');
    }

    if (validatedEnvelope.audience.kind === 'peer') {
      if (validatedEnvelope.audience.peerId !== context.peerId) {
        fail('invalid_audience', '$["audience"]');
      }
    } else if (
      !context.subscribedTopics?.includes(validatedEnvelope.audience.topic)
    ) {
      fail('invalid_audience', '$["audience"]["topic"]');
    }

    const receivedAt = parseRfc3339(
      assertString(
        context.receivedAt,
        '$context["receivedAt"]',
        'invalid_timestamp'
      ),
      '$context["receivedAt"]'
    );
    const sentAt = parseRfc3339(validatedEnvelope.sentAt, '$["sentAt"]');
    const expiresAt = parseRfc3339(
      validatedEnvelope.expiresAt,
      '$["expiresAt"]'
    );
    if (
      sentAt >
      receivedAt + BigInt(limits.clockSkewAllowanceMs) * 1_000_000n
    ) {
      fail('message_from_future', '$["sentAt"]');
    }
    if (expiresAt <= receivedAt) {
      fail('message_expired', '$["expiresAt"]');
    }

    const supported = new Set(context.supportedCriticalExtensions ?? []);
    for (const [index, extension] of (
      validatedEnvelope.criticalExtensions ?? []
    ).entries()) {
      if (!supported.has(extension)) {
        fail('unknown_critical_extension', `$["criticalExtensions"][${index}]`);
      }
    }
    return success(validatedEnvelope);
  } catch (error) {
    return validationFailure(error);
  }
}

/** Builds the closed document whose canonical bytes are signed. */
export function createMeshSigningDocument<TPayload extends MeshMessagePayload>(
  envelope: MeshEnvelope<TPayload>
): MeshSigningDocument<TPayload> {
  const document: MeshSigningDocument<TPayload> = {
    protocol: envelope.protocol,
    wireVersion: envelope.wireVersion,
    messageId: envelope.messageId,
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    ...(envelope.objectiveId === undefined
      ? {}
      : { objectiveId: envelope.objectiveId }),
    type: envelope.type,
    sender: envelope.sender,
    audience: envelope.audience,
    sequence: envelope.sequence,
    sentAt: envelope.sentAt,
    expiresAt: envelope.expiresAt,
    payloadHash: envelope.payloadHash,
    ...(envelope.correlationId === undefined
      ? {}
      : { correlationId: envelope.correlationId }),
    ...(envelope.causationId === undefined
      ? {}
      : { causationId: envelope.causationId }),
    ...(envelope.extensions === undefined
      ? {}
      : { extensions: envelope.extensions }),
    ...(envelope.criticalExtensions === undefined
      ? {}
      : { criticalExtensions: envelope.criticalExtensions }),
    proof: {
      algorithm: envelope.proof.algorithm,
      keyId: envelope.proof.keyId,
    },
  };
  return deepFreeze(document);
}

/** Returns canonical signing-document bytes without the payload or signature. */
export function canonicalizeMeshSigningDocument(
  envelope: MeshEnvelope,
  options: MeshProtocolOptions = {}
): MeshProtocolResult<Uint8Array> {
  return canonicalizeMeshJsonBytes(
    createMeshSigningDocument(envelope),
    options
  );
}

/** Returns canonical payload bytes used by the reference digest contract. */
export function canonicalizeMeshPayload(
  payload: MeshMessagePayload,
  options: MeshProtocolOptions = {}
): MeshProtocolResult<Uint8Array> {
  const limits = resolveLimits(options.limits);
  const result = canonicalizeJsonValue(
    payload,
    strictLimits(limits),
    limits.maximumPayloadBytes
  );
  return result.ok ? success(result.bytes) : failure(result.code, result.path);
}

function validateEnvelope(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): MeshEnvelope {
  const envelope = assertClosedRecord(
    input,
    [],
    [...topLevelRequiredKeys, ...topLevelOptionalKeys],
    '$',
    'unknown_envelope_field'
  );
  if (envelope.protocol !== MESH_PROTOCOL) {
    fail('invalid_protocol', '$["protocol"]');
  }
  if (envelope.wireVersion !== MESH_WIRE_VERSION) {
    fail('unsupported_wire_version', '$["wireVersion"]');
  }

  const messageId = assertMessageId(envelope.messageId, '$["messageId"]');
  const tenantId = assertIdentifier(envelope.tenantId, '$["tenantId"]', limits);
  const meshId = assertIdentifier(envelope.meshId, '$["meshId"]', limits);
  const objectiveId =
    envelope.objectiveId === undefined
      ? undefined
      : assertIdentifier(envelope.objectiveId, '$["objectiveId"]', limits);
  const type = assertString(
    envelope.type,
    '$["type"]',
    'unsupported_message_type'
  );
  if (!knownMessageTypes.has(type)) {
    fail('unsupported_message_type', '$["type"]');
  }
  if (!isImplementedMessageType(type)) {
    fail('unsupported_message_type', '$["type"]');
  }

  const sender = validateSender(envelope.sender, limits);
  const audience = validateAudience(envelope.audience, limits);
  const sequence = assertPositiveSafeInteger(
    envelope.sequence,
    '$["sequence"]'
  );
  const sentAtText = assertString(
    envelope.sentAt,
    '$["sentAt"]',
    'invalid_timestamp'
  );
  const expiresAtText = assertString(
    envelope.expiresAt,
    '$["expiresAt"]',
    'invalid_timestamp'
  );
  const sentAt = parseRfc3339(sentAtText, '$["sentAt"]');
  const expiresAt = parseRfc3339(expiresAtText, '$["expiresAt"]');
  validateLifetime(type, sentAt, expiresAt, limits);

  const correlationId =
    envelope.correlationId === undefined
      ? undefined
      : assertMessageId(envelope.correlationId, '$["correlationId"]');
  const causationId =
    envelope.causationId === undefined
      ? undefined
      : assertMessageId(envelope.causationId, '$["causationId"]');
  const payloadHash = assertPayloadHash(
    envelope.payloadHash,
    '$["payloadHash"]'
  );
  const payload = validatePayload(type, envelope.payload, limits);
  const proof = validateProof(envelope.proof, limits);
  const extensions =
    envelope.extensions === undefined
      ? undefined
      : validateExtensions(envelope.extensions, limits);
  const criticalExtensions =
    envelope.criticalExtensions === undefined
      ? undefined
      : validateCriticalExtensions(
          envelope.criticalExtensions,
          extensions,
          limits
        );

  if (payload.type !== type) {
    fail('type_payload_mismatch', '$["payload"]["type"]');
  }
  validateMessageSpecificEnvelope(
    type,
    sender,
    audience,
    objectiveId,
    causationId,
    payload,
    sentAt,
    expiresAt
  );
  validateEvidenceTrustBinding(
    tenantId,
    meshId,
    objectiveId,
    sender,
    causationId,
    payload
  );

  return {
    protocol: MESH_PROTOCOL,
    wireVersion: MESH_WIRE_VERSION,
    messageId,
    tenantId,
    meshId,
    ...(objectiveId === undefined ? {} : { objectiveId }),
    type,
    sender,
    audience,
    sequence,
    sentAt: sentAtText,
    expiresAt: expiresAtText,
    payloadHash,
    payload,
    proof,
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(causationId === undefined ? {} : { causationId }),
    ...(extensions === undefined ? {} : { extensions }),
    ...(criticalExtensions === undefined ? {} : { criticalExtensions }),
  } as MeshEnvelope;
}

function validateSender(input: unknown, limits: Readonly<MeshProtocolLimits>) {
  const sender = assertClosedRecord(
    input,
    ['instanceId', 'peerId'],
    [],
    '$["sender"]',
    'invalid_payload'
  );
  return {
    peerId: assertIdentifier(sender.peerId, '$["sender"]["peerId"]', limits),
    instanceId: assertIdentifier(
      sender.instanceId,
      '$["sender"]["instanceId"]',
      limits
    ),
  };
}

function validateAudience(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): MeshAudience {
  const audience = assertRecord(input, '$["audience"]', 'invalid_audience');
  if (audience.kind === 'peer') {
    assertExactKeys(
      audience,
      ['kind', 'peerId'],
      '$["audience"]',
      'invalid_audience'
    );
    return {
      kind: 'peer',
      peerId: assertIdentifier(
        audience.peerId,
        '$["audience"]["peerId"]',
        limits
      ),
    };
  }
  if (audience.kind === 'mesh') {
    assertExactKeys(
      audience,
      ['kind', 'topic'],
      '$["audience"]',
      'invalid_audience'
    );
    const topic = assertString(
      audience.topic,
      '$["audience"]["topic"]',
      'invalid_audience'
    );
    if (!knownTopics.has(topic)) {
      fail('invalid_audience', '$["audience"]["topic"]');
    }
    return { kind: 'mesh', topic: topic as MeshAudienceTopic };
  }
  return fail('invalid_audience', '$["audience"]["kind"]');
}

function validatePayload(
  type: MeshMessagePayload['type'],
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): MeshMessagePayload {
  if (type === 'peer.hello') {
    const payload = assertClosedRecord(
      input,
      ['cardRevision', 'peerCardId', 'type'],
      [],
      '$["payload"]',
      'invalid_payload'
    );
    const result: PeerHelloPayload = {
      type: assertPayloadType(payload.type, type),
      peerCardId: assertIdentifier(
        payload.peerCardId,
        '$["payload"]["peerCardId"]',
        limits
      ),
      cardRevision: assertPositiveSafeInteger(
        payload.cardRevision,
        '$["payload"]["cardRevision"]',
        'invalid_payload'
      ),
    };
    return result;
  }
  if (type === 'peer.card') {
    const payload = assertClosedRecord(
      input,
      [
        'capabilityIds',
        'cardRevision',
        'instanceId',
        'peerCardId',
        'protocolVersions',
        'subjectPeerId',
        'transportHints',
        'type',
        'validFrom',
        'validUntil',
      ],
      ['previousPeerCardId'],
      '$["payload"]',
      'invalid_payload'
    );
    const peerCardId = assertIdentifier(
      payload.peerCardId,
      '$["payload"]["peerCardId"]',
      limits
    );
    const cardRevision = assertPositiveSafeInteger(
      payload.cardRevision,
      '$["payload"]["cardRevision"]',
      'invalid_payload'
    );
    const previousPeerCardId =
      payload.previousPeerCardId === undefined
        ? undefined
        : assertIdentifier(
            payload.previousPeerCardId,
            '$["payload"]["previousPeerCardId"]',
            limits
          );
    validateRevisionPredecessor(
      cardRevision,
      previousPeerCardId,
      '$["payload"]["previousPeerCardId"]'
    );
    if (previousPeerCardId === peerCardId) {
      fail('invalid_payload', '$["payload"]["previousPeerCardId"]');
    }
    const validFrom = assertRfc3339PayloadTimestamp(
      payload.validFrom,
      '$["payload"]["validFrom"]'
    );
    const validUntil = assertRfc3339PayloadTimestamp(
      payload.validUntil,
      '$["payload"]["validUntil"]'
    );
    assertBoundedValidity(validFrom.instant, validUntil.instant);
    const result: PeerCardPayload = {
      type: assertPayloadType(payload.type, type),
      peerCardId,
      cardRevision,
      subjectPeerId: assertIdentifier(
        payload.subjectPeerId,
        '$["payload"]["subjectPeerId"]',
        limits
      ),
      instanceId: assertIdentifier(
        payload.instanceId,
        '$["payload"]["instanceId"]',
        limits
      ),
      protocolVersions: validateProtocolVersions(payload.protocolVersions),
      transportHints: validateBoundedStringArray(
        payload.transportHints,
        '$["payload"]["transportHints"]',
        maximumTransportHints,
        maximumTransportHintBytes,
        maximumTransportHintsBytes,
        true
      ),
      capabilityIds: validateIdentifierArray(
        payload.capabilityIds,
        '$["payload"]["capabilityIds"]',
        maximumCapabilityIds,
        limits
      ),
      validFrom: validFrom.text,
      validUntil: validUntil.text,
      ...(previousPeerCardId === undefined ? {} : { previousPeerCardId }),
    };
    return result;
  }
  if (type === 'peer.ping') {
    const payload = assertClosedRecord(
      input,
      ['type'],
      [],
      '$["payload"]',
      'invalid_payload'
    );
    const result: PeerPingPayload = {
      type: assertPayloadType(payload.type, type),
    };
    return result;
  }
  if (type === 'peer.ping_ack') {
    const payload = assertClosedRecord(
      input,
      ['type'],
      [],
      '$["payload"]',
      'invalid_payload'
    );
    const result: PeerPingAckPayload = {
      type: assertPayloadType(payload.type, type),
    };
    return result;
  }
  if (type === 'peer.goodbye') {
    const payload = assertClosedRecord(
      input,
      ['cardRevision', 'instanceId', 'peerCardId', 'type'],
      [],
      '$["payload"]',
      'invalid_payload'
    );
    const result: PeerGoodbyePayload = {
      type: assertPayloadType(payload.type, type),
      peerCardId: assertIdentifier(
        payload.peerCardId,
        '$["payload"]["peerCardId"]',
        limits
      ),
      cardRevision: assertPositiveSafeInteger(
        payload.cardRevision,
        '$["payload"]["cardRevision"]',
        'invalid_payload'
      ),
      instanceId: assertIdentifier(
        payload.instanceId,
        '$["payload"]["instanceId"]',
        limits
      ),
    };
    return result;
  }
  if (type === 'capability.advertise') {
    const payload = assertClosedRecord(
      input,
      [
        'advertisementId',
        'attributes',
        'capabilityId',
        'capabilityKey',
        'capabilityRevision',
        'inputMediaTypes',
        'outputMediaTypes',
        'ownerPeerId',
        'type',
        'validFrom',
        'validUntil',
        'version',
      ],
      [
        'maximumConcurrency',
        'maximumPayloadBytes',
        'previousAdvertisementId',
        'variant',
      ],
      '$["payload"]',
      'invalid_payload'
    );
    const advertisementId = assertIdentifier(
      payload.advertisementId,
      '$["payload"]["advertisementId"]',
      limits
    );
    const capabilityRevision = assertPositiveSafeInteger(
      payload.capabilityRevision,
      '$["payload"]["capabilityRevision"]',
      'invalid_payload'
    );
    const previousAdvertisementId =
      payload.previousAdvertisementId === undefined
        ? undefined
        : assertIdentifier(
            payload.previousAdvertisementId,
            '$["payload"]["previousAdvertisementId"]',
            limits
          );
    validateRevisionPredecessor(
      capabilityRevision,
      previousAdvertisementId,
      '$["payload"]["previousAdvertisementId"]'
    );
    if (previousAdvertisementId === advertisementId) {
      fail('invalid_payload', '$["payload"]["previousAdvertisementId"]');
    }
    const validFrom = assertRfc3339PayloadTimestamp(
      payload.validFrom,
      '$["payload"]["validFrom"]'
    );
    const validUntil = assertRfc3339PayloadTimestamp(
      payload.validUntil,
      '$["payload"]["validUntil"]'
    );
    assertBoundedValidity(validFrom.instant, validUntil.instant);
    const result: CapabilityAdvertisePayload = {
      type: assertPayloadType(payload.type, type),
      advertisementId,
      capabilityId: assertIdentifier(
        payload.capabilityId,
        '$["payload"]["capabilityId"]',
        limits
      ),
      capabilityRevision,
      ownerPeerId: assertIdentifier(
        payload.ownerPeerId,
        '$["payload"]["ownerPeerId"]',
        limits
      ),
      capabilityKey: assertBoundedString(
        payload.capabilityKey,
        '$["payload"]["capabilityKey"]',
        maximumDomainStringBytes
      ),
      version: assertBoundedString(
        payload.version,
        '$["payload"]["version"]',
        maximumVersionBytes
      ),
      ...(payload.variant === undefined
        ? {}
        : {
            variant: assertBoundedString(
              payload.variant,
              '$["payload"]["variant"]',
              maximumVersionBytes
            ),
          }),
      inputMediaTypes: validateBoundedStringArray(
        payload.inputMediaTypes,
        '$["payload"]["inputMediaTypes"]',
        maximumMediaTypes,
        maximumMediaTypeBytes,
        undefined,
        true
      ),
      outputMediaTypes: validateBoundedStringArray(
        payload.outputMediaTypes,
        '$["payload"]["outputMediaTypes"]',
        maximumMediaTypes,
        maximumMediaTypeBytes,
        undefined,
        true
      ),
      attributes: validateAttributes(payload.attributes),
      validFrom: validFrom.text,
      validUntil: validUntil.text,
      ...(payload.maximumConcurrency === undefined
        ? {}
        : {
            maximumConcurrency: assertPositiveSafeInteger(
              payload.maximumConcurrency,
              '$["payload"]["maximumConcurrency"]',
              'invalid_payload'
            ),
          }),
      ...(payload.maximumPayloadBytes === undefined
        ? {}
        : {
            maximumPayloadBytes: assertPositiveSafeInteger(
              payload.maximumPayloadBytes,
              '$["payload"]["maximumPayloadBytes"]',
              'invalid_payload'
            ),
          }),
      ...(previousAdvertisementId === undefined
        ? {}
        : { previousAdvertisementId }),
    };
    return result;
  }
  if (type === 'capability.withdraw') {
    const payload = assertClosedRecord(
      input,
      ['advertisementId', 'capabilityId', 'capabilityRevision', 'type'],
      [],
      '$["payload"]',
      'invalid_payload'
    );
    const result: CapabilityWithdrawPayload = {
      type: assertPayloadType(payload.type, type),
      capabilityId: assertIdentifier(
        payload.capabilityId,
        '$["payload"]["capabilityId"]',
        limits
      ),
      capabilityRevision: assertPositiveSafeInteger(
        payload.capabilityRevision,
        '$["payload"]["capabilityRevision"]',
        'invalid_payload'
      ),
      advertisementId: assertIdentifier(
        payload.advertisementId,
        '$["payload"]["advertisementId"]',
        limits
      ),
    };
    return result;
  }
  if (type === 'objective.announce') {
    const document = validateObjectiveDocument(input, type, limits);
    if (document.objectiveRevision !== 1) {
      fail('invalid_payload', '$["payload"]["objectiveRevision"]');
    }
    const result: ObjectiveAnnouncePayload = {
      type,
      ...document,
    };
    return result;
  }
  if (type === 'objective.revise') {
    const document = validateObjectiveDocument(input, type, limits);
    if (document.objectiveRevision < 2) {
      fail('invalid_payload', '$["payload"]["objectiveRevision"]');
    }
    const payload = input as Record<string, unknown>;
    const previousObjectiveDocumentId = assertIdentifier(
      payload.previousObjectiveDocumentId,
      '$["payload"]["previousObjectiveDocumentId"]',
      limits
    );
    if (previousObjectiveDocumentId === document.objectiveDocumentId) {
      fail('invalid_payload', '$["payload"]["previousObjectiveDocumentId"]');
    }
    const result: ObjectiveRevisePayload = {
      type,
      ...document,
      previousObjectiveDocumentId,
    };
    return result;
  }
  if (type === 'objective.cancel') {
    const payload = assertClosedRecord(
      input,
      [
        'cancellationId',
        'objectiveDocumentId',
        'objectiveId',
        'objectiveRevision',
        'type',
      ],
      [],
      '$["payload"]',
      'invalid_payload'
    );
    const result: ObjectiveCancelPayload = {
      type: assertPayloadType(payload.type, type),
      cancellationId: assertIdentifier(
        payload.cancellationId,
        '$["payload"]["cancellationId"]',
        limits
      ),
      objectiveId: assertIdentifier(
        payload.objectiveId,
        '$["payload"]["objectiveId"]',
        limits
      ),
      objectiveRevision: assertPositiveSafeInteger(
        payload.objectiveRevision,
        '$["payload"]["objectiveRevision"]',
        'invalid_payload'
      ),
      objectiveDocumentId: assertIdentifier(
        payload.objectiveDocumentId,
        '$["payload"]["objectiveDocumentId"]',
        limits
      ),
    };
    return result;
  }
  if (type === 'work.offer') {
    return validateWorkOffer(input, limits);
  }
  if (type === 'work.bid') {
    return validateWorkBid(input, limits);
  }
  if (type === 'work.award') {
    return validateWorkAward(input, limits);
  }
  if (type === 'work.accept') {
    return validateWorkAccept(input, limits);
  }
  if (type === 'work.decline') {
    return validateWorkDecline(input, limits);
  }
  if (type === 'work.progress') {
    return validateWorkProgress(input, limits);
  }
  if (type === 'work.checkpoint') {
    return validateWorkCheckpoint(input, limits);
  }
  if (type === 'work.result') {
    return validateWorkResult(input, limits);
  }
  if (type === 'work.release') {
    return validateWorkRelease(input, limits);
  }
  if (type === 'work.cancel') {
    return validateWorkCancel(input, limits);
  }
  if (type === 'lease.renew') {
    return validateLeaseRenew(input, limits);
  }
  if (type === 'lease.takeover_proposal') {
    return validateLeaseTakeoverProposal(input, limits);
  }
  if (type === 'lease.vote') {
    return validateLeaseVote(input, limits);
  }
  if (type === 'lease.certificate') {
    return validateLeaseCertificate(input, limits);
  }
  if (type === 'evidence.claim') {
    return validateEvidenceClaim(input, limits);
  }
  if (type === 'evidence.attest') {
    return validateEvidenceAttestation(input, limits);
  }
  if (type === 'evidence.challenge') {
    return validateEvidenceChallenge(input, limits);
  }
  if (type === 'evidence.retract') {
    return validateEvidenceRetraction(input, limits);
  }
  if (type === 'trust.observation') {
    return validateTrustObservation(input, limits);
  }
  return fail('unsupported_message_type', '$["type"]');
}

function validateEvidenceClaim(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): EvidenceClaimPayload {
  const payload = assertClosedRecord(
    input,
    [
      'assertionDigest',
      'basisReferences',
      'claimId',
      'content',
      'criterionId',
      'observedAt',
      'outcome',
      'scope',
      'subject',
      'type',
    ],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  const content = validateEvidenceContent(
    payload.content,
    '$["payload"]["content"]',
    limits
  );
  return {
    type: assertPayloadType(payload.type, 'evidence.claim'),
    claimId: assertTrustRecordId(
      payload.claimId,
      'claim',
      '$["payload"]["claimId"]'
    ),
    subject: validateEvidenceSubject(
      payload.subject,
      '$["payload"]["subject"]',
      limits
    ),
    scope: validateEvidenceScope(
      payload.scope,
      '$["payload"]["scope"]',
      limits
    ),
    criterionId: assertBoundedString(
      payload.criterionId,
      '$["payload"]["criterionId"]',
      maximumDomainStringBytes
    ),
    outcome: assertEnum(
      payload.outcome,
      ['satisfied', 'violated', 'inconclusive'],
      '$["payload"]["outcome"]'
    ),
    assertionDigest: assertTrustDigest(
      payload.assertionDigest,
      '$["payload"]["assertionDigest"]'
    ),
    content,
    basisReferences: validateEvidenceReferences(
      payload.basisReferences,
      '$["payload"]["basisReferences"]',
      limits,
      { allowControlRecords: false, minimum: 0 }
    ),
    observedAt: validateOptionalEvidenceTimestamp(
      payload.observedAt,
      '$["payload"]["observedAt"]'
    ),
  };
}

function validateEvidenceAttestation(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): EvidenceAttestationPayload {
  const payload = assertClosedRecord(
    input,
    [
      'attestationId',
      'basisReferences',
      'claimDigest',
      'claimId',
      'confidenceBasisPoints',
      'disposition',
      'observedAt',
      'scope',
      'type',
    ],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  return {
    type: assertPayloadType(payload.type, 'evidence.attest'),
    attestationId: assertTrustRecordId(
      payload.attestationId,
      'attestation',
      '$["payload"]["attestationId"]'
    ),
    scope: validateEvidenceScope(
      payload.scope,
      '$["payload"]["scope"]',
      limits
    ),
    claimId: assertTrustRecordId(
      payload.claimId,
      'claim',
      '$["payload"]["claimId"]'
    ),
    claimDigest: assertTrustDigest(
      payload.claimDigest,
      '$["payload"]["claimDigest"]'
    ),
    disposition: assertEnum(
      payload.disposition,
      ['support', 'contradict', 'inconclusive'],
      '$["payload"]["disposition"]'
    ),
    confidenceBasisPoints: assertBoundedSafeInteger(
      payload.confidenceBasisPoints,
      '$["payload"]["confidenceBasisPoints"]',
      0,
      10_000
    ),
    basisReferences: validateEvidenceReferences(
      payload.basisReferences,
      '$["payload"]["basisReferences"]',
      limits,
      { allowControlRecords: false, minimum: 0 }
    ),
    observedAt: validateOptionalEvidenceTimestamp(
      payload.observedAt,
      '$["payload"]["observedAt"]'
    ),
  };
}

function validateEvidenceChallenge(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): EvidenceChallengePayload {
  const payload = assertClosedRecord(
    input,
    [
      'basisReferences',
      'challengeId',
      'observedAt',
      'reasonCode',
      'scope',
      'targetDigest',
      'targetId',
      'targetKind',
      'type',
    ],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  const targetKind = assertEnum(
    payload.targetKind,
    ['claim', 'attestation'],
    '$["payload"]["targetKind"]'
  );
  return {
    type: assertPayloadType(payload.type, 'evidence.challenge'),
    challengeId: assertTrustRecordId(
      payload.challengeId,
      'challenge',
      '$["payload"]["challengeId"]'
    ),
    scope: validateEvidenceScope(
      payload.scope,
      '$["payload"]["scope"]',
      limits
    ),
    targetKind,
    targetId: assertTrustRecordId(
      payload.targetId,
      targetKind,
      '$["payload"]["targetId"]'
    ),
    targetDigest: assertTrustDigest(
      payload.targetDigest,
      '$["payload"]["targetDigest"]'
    ),
    reasonCode: assertBoundedString(
      payload.reasonCode,
      '$["payload"]["reasonCode"]',
      maximumDomainStringBytes
    ),
    basisReferences: validateEvidenceReferences(
      payload.basisReferences,
      '$["payload"]["basisReferences"]',
      limits,
      { allowControlRecords: false, minimum: 1 }
    ),
    observedAt: validateOptionalEvidenceTimestamp(
      payload.observedAt,
      '$["payload"]["observedAt"]'
    ),
  };
}

function validateEvidenceRetraction(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): EvidenceRetractionPayload {
  const payload = assertClosedRecord(
    input,
    [
      'observedAt',
      'reasonCode',
      'retractionId',
      'scope',
      'targetDigest',
      'targetId',
      'targetKind',
      'type',
    ],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  const targetKind = assertEnum(
    payload.targetKind,
    ['claim', 'attestation'],
    '$["payload"]["targetKind"]'
  );
  return {
    type: assertPayloadType(payload.type, 'evidence.retract'),
    retractionId: assertTrustRecordId(
      payload.retractionId,
      'retraction',
      '$["payload"]["retractionId"]'
    ),
    scope: validateEvidenceScope(
      payload.scope,
      '$["payload"]["scope"]',
      limits
    ),
    targetKind,
    targetId: assertTrustRecordId(
      payload.targetId,
      targetKind,
      '$["payload"]["targetId"]'
    ),
    targetDigest: assertTrustDigest(
      payload.targetDigest,
      '$["payload"]["targetDigest"]'
    ),
    reasonCode: assertBoundedString(
      payload.reasonCode,
      '$["payload"]["reasonCode"]',
      maximumDomainStringBytes
    ),
    observedAt: validateOptionalEvidenceTimestamp(
      payload.observedAt,
      '$["payload"]["observedAt"]'
    ),
  };
}

function validateTrustObservation(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): TrustObservationPayload {
  const payload = assertClosedRecord(
    input,
    [
      'dimensionId',
      'disposition',
      'evidenceIds',
      'fusionDecisionDigest',
      'observationId',
      'observedAt',
      'policyDigest',
      'policyId',
      'policyVersion',
      'profileDigest',
      'reasonCodes',
      'scope',
      'scoreBand',
      'subject',
      'type',
      'uncertaintyBand',
      'validUntil',
    ],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  const observedAt = assertRfc3339PayloadTimestamp(
    payload.observedAt,
    '$["payload"]["observedAt"]'
  );
  const validUntil = assertRfc3339PayloadTimestamp(
    payload.validUntil,
    '$["payload"]["validUntil"]'
  );
  if (
    validUntil.instant <= observedAt.instant ||
    validUntil.instant - observedAt.instant > 24n * 60n * 60n * 1_000_000_000n
  ) {
    fail('invalid_payload', '$["payload"]["validUntil"]');
  }
  return {
    type: assertPayloadType(payload.type, 'trust.observation'),
    observationId: assertTrustRecordId(
      payload.observationId,
      'observation',
      '$["payload"]["observationId"]'
    ),
    subject: validateEvidenceSubject(
      payload.subject,
      '$["payload"]["subject"]',
      limits
    ),
    scope: validateEvidenceScope(
      payload.scope,
      '$["payload"]["scope"]',
      limits
    ),
    policyId: assertBoundedString(
      payload.policyId,
      '$["payload"]["policyId"]',
      maximumDomainStringBytes
    ),
    policyVersion: assertPositiveSafeInteger(
      payload.policyVersion,
      '$["payload"]["policyVersion"]',
      'invalid_payload'
    ),
    policyDigest: assertTrustDigest(
      payload.policyDigest,
      '$["payload"]["policyDigest"]'
    ),
    profileDigest: assertTrustDigest(
      payload.profileDigest,
      '$["payload"]["profileDigest"]'
    ),
    fusionDecisionDigest: assertTrustDigest(
      payload.fusionDecisionDigest,
      '$["payload"]["fusionDecisionDigest"]'
    ),
    dimensionId: assertBoundedString(
      payload.dimensionId,
      '$["payload"]["dimensionId"]',
      maximumDomainStringBytes
    ),
    scoreBand: assertEnum(
      payload.scoreBand,
      ['unknown', 'low', 'medium', 'high'],
      '$["payload"]["scoreBand"]'
    ),
    uncertaintyBand: assertEnum(
      payload.uncertaintyBand,
      ['low', 'medium', 'high'],
      '$["payload"]["uncertaintyBand"]'
    ),
    disposition: assertEnum(
      payload.disposition,
      ['eligible', 'restricted', 'quarantined', 'unavailable'],
      '$["payload"]["disposition"]'
    ),
    evidenceIds: validateTrustRecordIdArray(
      payload.evidenceIds,
      '$["payload"]["evidenceIds"]'
    ),
    observedAt: observedAt.text,
    validUntil: validUntil.text,
    reasonCodes: validateBoundedStringArray(
      payload.reasonCodes,
      '$["payload"]["reasonCodes"]',
      maximumEvidenceReasonCodes,
      maximumDomainStringBytes,
      undefined,
      true
    ),
  };
}

function validateEvidenceSubject(
  input: unknown,
  path: string,
  limits: Readonly<MeshProtocolLimits>
): MeshEvidenceSubject {
  const subject = assertRecord(input, path, 'invalid_payload');
  if (subject.kind === 'peer') {
    assertExactKeys(subject, ['kind', 'peerId'], path, 'invalid_payload');
    return {
      kind: 'peer',
      peerId: assertIdentifier(subject.peerId, `${path}["peerId"]`, limits),
    };
  }
  if (subject.kind === 'peer_capability') {
    assertExactKeys(
      subject,
      [
        'capabilityKey',
        'capabilityRevision',
        'capabilityVersion',
        'kind',
        'peerId',
      ],
      path,
      'invalid_payload'
    );
    return {
      kind: 'peer_capability',
      peerId: assertIdentifier(subject.peerId, `${path}["peerId"]`, limits),
      capabilityKey: assertBoundedString(
        subject.capabilityKey,
        `${path}["capabilityKey"]`,
        maximumDomainStringBytes
      ),
      capabilityVersion: assertBoundedString(
        subject.capabilityVersion,
        `${path}["capabilityVersion"]`,
        maximumVersionBytes
      ),
      capabilityRevision: assertPositiveSafeInteger(
        subject.capabilityRevision,
        `${path}["capabilityRevision"]`,
        'invalid_payload'
      ),
    };
  }
  return fail('invalid_payload', `${path}["kind"]`);
}

function validateEvidenceScope(
  input: unknown,
  path: string,
  limits: Readonly<MeshProtocolLimits>
): MeshEvidenceScope {
  const scope = assertRecord(input, path, 'invalid_payload');
  if (scope.kind === 'mesh') {
    assertExactKeys(scope, ['kind'], path, 'invalid_payload');
    return { kind: 'mesh' };
  }
  if (scope.kind === 'objective') {
    assertExactKeys(
      scope,
      ['kind', 'objectiveRevision'],
      path,
      'invalid_payload'
    );
    return {
      kind: 'objective',
      objectiveRevision: assertPositiveSafeInteger(
        scope.objectiveRevision,
        `${path}["objectiveRevision"]`,
        'invalid_payload'
      ),
    };
  }
  if (scope.kind === 'work') {
    assertExactKeys(
      scope,
      [
        'assignmentAuthorityId',
        'assignmentEpoch',
        'fencingToken',
        'kind',
        'objectiveRevision',
        'workItemId',
        'workItemRevision',
      ],
      path,
      'invalid_payload'
    );
    const assignmentAuthorityId = assertIdentifier(
      scope.assignmentAuthorityId,
      `${path}["assignmentAuthorityId"]`,
      limits
    );
    const fencingToken = assertIdentifier(
      scope.fencingToken,
      `${path}["fencingToken"]`,
      limits
    );
    if (assignmentAuthorityId !== fencingToken) {
      fail('invalid_payload', `${path}["fencingToken"]`);
    }
    return {
      kind: 'work',
      objectiveRevision: assertPositiveSafeInteger(
        scope.objectiveRevision,
        `${path}["objectiveRevision"]`,
        'invalid_payload'
      ),
      workItemId: assertIdentifier(
        scope.workItemId,
        `${path}["workItemId"]`,
        limits
      ),
      workItemRevision: assertPositiveSafeInteger(
        scope.workItemRevision,
        `${path}["workItemRevision"]`,
        'invalid_payload'
      ),
      assignmentEpoch: assertPositiveSafeInteger(
        scope.assignmentEpoch,
        `${path}["assignmentEpoch"]`,
        'invalid_payload'
      ),
      assignmentAuthorityId,
      fencingToken,
    };
  }
  return fail('invalid_payload', `${path}["kind"]`);
}

function validateEvidenceReferences(
  input: unknown,
  path: string,
  limits: Readonly<MeshProtocolLimits>,
  {
    allowControlRecords,
    minimum,
  }: { readonly allowControlRecords: boolean; readonly minimum: number }
): readonly MeshEvidenceReference[] {
  if (
    !Array.isArray(input) ||
    input.length < minimum ||
    input.length > maximumEvidenceReferences
  ) {
    fail('invalid_payload', path);
  }
  const references = input.map((item, index) =>
    validateEvidenceReference(
      item,
      `${path}[${index}]`,
      limits,
      allowControlRecords
    )
  );
  let previous = '';
  for (const reference of references) {
    const order = JSON.stringify([
      reference.kind,
      reference.referenceType,
      reference.referenceId,
      reference.referenceDigest,
    ]);
    if (order <= previous) fail('invalid_payload', path);
    previous = order;
  }
  return Object.freeze(references);
}

function validateEvidenceReference(
  input: unknown,
  path: string,
  limits: Readonly<MeshProtocolLimits>,
  allowControlRecords: boolean
): MeshEvidenceReference {
  const reference = assertClosedRecord(
    input,
    [
      'kind',
      'referenceDigest',
      'referenceId',
      'referenceType',
      'schemaVersion',
    ],
    [],
    path,
    'invalid_payload'
  );
  if (reference.schemaVersion !== 1)
    fail('invalid_payload', `${path}["schemaVersion"]`);
  const kind = assertEnum(
    reference.kind,
    ['evidence', 'mesh_record', 'control_record', 'external'],
    `${path}["kind"]`
  );
  if (!allowControlRecords && kind === 'control_record') {
    fail('invalid_payload', `${path}["kind"]`);
  }
  const referenceDigest = assertEvidenceReferenceDigest(
    kind,
    reference.referenceDigest,
    `${path}["referenceDigest"]`
  );
  return {
    schemaVersion: 1,
    kind,
    referenceType: assertBoundedString(
      reference.referenceType,
      `${path}["referenceType"]`,
      maximumEvidenceReferenceBytes
    ),
    referenceId: assertBoundedString(
      reference.referenceId,
      `${path}["referenceId"]`,
      maximumEvidenceReferenceBytes
    ),
    referenceDigest,
  };
}

function validateEvidenceContent(
  input: unknown,
  path: string,
  limits: Readonly<MeshProtocolLimits>
): MeshEvidenceContent | null {
  if (input === null) return null;
  const content = assertRecord(input, path, 'invalid_payload');
  if (content.kind === 'inline_summary') {
    assertExactKeys(
      content,
      ['contentDigest', 'encodedBytes', 'kind', 'mediaType', 'summary'],
      path,
      'invalid_payload'
    );
    const summary = assertBoundedString(
      content.summary,
      `${path}["summary"]`,
      maximumEvidenceContentBytes
    );
    const encodedBytes = assertBoundedSafeInteger(
      content.encodedBytes,
      `${path}["encodedBytes"]`,
      0,
      maximumEvidenceContentBytes
    );
    if (utf8Encoder.encode(summary).byteLength !== encodedBytes) {
      fail('invalid_payload', `${path}["encodedBytes"]`);
    }
    return {
      kind: 'inline_summary',
      mediaType: assertBoundedString(
        content.mediaType,
        `${path}["mediaType"]`,
        maximumMediaTypeBytes
      ),
      summary,
      contentDigest: assertTrustDigest(
        content.contentDigest,
        `${path}["contentDigest"]`
      ),
      encodedBytes,
    };
  }
  if (content.kind === 'reference') {
    assertExactKeys(
      content,
      ['contentDigest', 'encodedBytes', 'kind', 'mediaType', 'reference'],
      path,
      'invalid_payload'
    );
    const reference = validateEvidenceReference(
      content.reference,
      `${path}["reference"]`,
      limits,
      false
    );
    if (reference.kind !== 'mesh_record' && reference.kind !== 'external') {
      fail('invalid_payload', `${path}["reference"]["kind"]`);
    }
    return {
      kind: 'reference',
      mediaType: assertBoundedString(
        content.mediaType,
        `${path}["mediaType"]`,
        maximumMediaTypeBytes
      ),
      reference,
      contentDigest: assertTrustDigest(
        content.contentDigest,
        `${path}["contentDigest"]`
      ),
      encodedBytes: assertBoundedSafeInteger(
        content.encodedBytes,
        `${path}["encodedBytes"]`,
        0,
        maximumEvidenceContentBytes
      ),
    };
  }
  return fail('invalid_payload', `${path}["kind"]`);
}

function validateTrustRecordIdArray(
  input: unknown,
  path: string
): readonly string[] {
  if (!Array.isArray(input) || input.length > maximumEvidenceReferences) {
    fail('invalid_payload', path);
  }
  const ids = input.map((value, index) =>
    assertBoundedString(
      value,
      `${path}[${index}]`,
      maximumEvidenceIdentifierBytes
    )
  );
  let previous = '';
  for (const id of ids) {
    if (id <= previous) fail('invalid_payload', path);
    previous = id;
  }
  return Object.freeze(ids);
}

function validateOptionalEvidenceTimestamp(
  input: unknown,
  path: string
): string | null {
  if (input === null) return null;
  return assertRfc3339PayloadTimestamp(input, path).text;
}

function assertTrustRecordId(
  input: unknown,
  prefix: string,
  path: string
): string {
  const value = assertBoundedString(
    input,
    path,
    maximumEvidenceIdentifierBytes
  );
  if (!new RegExp(`^${prefix}:[0-9a-f]{64}$`).test(value)) {
    fail('invalid_payload', path);
  }
  return value;
}

function assertTrustDigest(input: unknown, path: string): string {
  const value = assertString(input, path, 'invalid_payload');
  if (!trustDigestPattern.test(value)) fail('invalid_payload', path);
  return value;
}

function assertEvidenceReferenceDigest(
  kind: MeshEvidenceReference['kind'],
  input: unknown,
  path: string
): string {
  if (kind === 'mesh_record') return assertPayloadHash(input, path);
  if (kind === 'control_record') {
    const value = assertString(input, path, 'invalid_payload');
    if (!/^sha256:[0-9a-f]{64}$/.test(value)) fail('invalid_payload', path);
    return value;
  }
  return assertTrustDigest(input, path);
}

function assertBoundedSafeInteger(
  input: unknown,
  path: string,
  minimum: number,
  maximum: number
): number {
  if (
    !Number.isSafeInteger(input) ||
    (input as number) < minimum ||
    (input as number) > maximum
  ) {
    fail('invalid_payload', path);
  }
  return input as number;
}

function assertEnum<T extends string>(
  input: unknown,
  values: readonly T[],
  path: string
): T {
  if (typeof input !== 'string' || !values.includes(input as T)) {
    fail('invalid_payload', path);
  }
  return input as T;
}

function validateWorkOffer(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkOfferPayload {
  const payload = assertClosedRecord(
    input,
    [
      'bidDeadline',
      'budgetReservationUnits',
      'completionCriteria',
      'matchingAttributes',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'offerAttempt',
      'offerId',
      'ownerEpoch',
      'ownerPeerId',
      'requiredCapabilityKeys',
      'type',
      'workDeadline',
      'workItemId',
      'workItemRevision',
    ],
    ['inputReference', 'inputSummary', 'previousOfferId'],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, 'work.offer');

  const hasInputSummary = payload.inputSummary !== undefined;
  const hasInputReference = payload.inputReference !== undefined;
  if (hasInputSummary === hasInputReference) {
    fail('invalid_payload', '$["payload"]');
  }
  const inputSummary = hasInputSummary
    ? assertBoundedString(
        payload.inputSummary,
        '$["payload"]["inputSummary"]',
        maximumWorkTextBytes
      )
    : undefined;
  const inputReference = hasInputReference
    ? assertBoundedString(
        payload.inputReference,
        '$["payload"]["inputReference"]',
        maximumWorkTextBytes
      )
    : undefined;

  const offerId = assertIdentifier(
    payload.offerId,
    '$["payload"]["offerId"]',
    limits
  );
  const offerAttempt = assertPositiveSafeInteger(
    payload.offerAttempt,
    '$["payload"]["offerAttempt"]',
    'invalid_payload'
  );
  const previousOfferId =
    payload.previousOfferId === undefined
      ? undefined
      : assertIdentifier(
          payload.previousOfferId,
          '$["payload"]["previousOfferId"]',
          limits
        );
  validateRevisionPredecessor(
    offerAttempt,
    previousOfferId,
    '$["payload"]["previousOfferId"]'
  );
  if (previousOfferId === offerId) {
    fail('invalid_payload', '$["payload"]["previousOfferId"]');
  }

  const requiredCapabilityKeys = validateBoundedStringArray(
    payload.requiredCapabilityKeys,
    '$["payload"]["requiredCapabilityKeys"]',
    maximumWorkCapabilityKeys,
    maximumWorkTextBytes,
    undefined,
    true
  );
  if (requiredCapabilityKeys.length === 0) {
    fail('invalid_payload', '$["payload"]["requiredCapabilityKeys"]');
  }
  const completionCriteria = validateBoundedStringArray(
    payload.completionCriteria,
    '$["payload"]["completionCriteria"]',
    maximumWorkListItems,
    maximumWorkTextBytes,
    maximumWorkListBytes
  );
  if (completionCriteria.length === 0) {
    fail('invalid_payload', '$["payload"]["completionCriteria"]');
  }

  const ownerEpoch = assertPositiveSafeInteger(
    payload.ownerEpoch,
    '$["payload"]["ownerEpoch"]',
    'invalid_payload'
  );
  if (ownerEpoch !== 1) {
    fail('invalid_payload', '$["payload"]["ownerEpoch"]');
  }
  const bidDeadline = assertRfc3339PayloadTimestamp(
    payload.bidDeadline,
    '$["payload"]["bidDeadline"]'
  ).text;
  const workDeadline = assertRfc3339PayloadTimestamp(
    payload.workDeadline,
    '$["payload"]["workDeadline"]'
  ).text;

  const fields: WorkOfferFields = {
    offerId,
    objectiveId: assertIdentifier(
      payload.objectiveId,
      '$["payload"]["objectiveId"]',
      limits
    ),
    objectiveDocumentId: assertIdentifier(
      payload.objectiveDocumentId,
      '$["payload"]["objectiveDocumentId"]',
      limits
    ),
    objectiveRevision: assertPositiveSafeInteger(
      payload.objectiveRevision,
      '$["payload"]["objectiveRevision"]',
      'invalid_payload'
    ),
    workItemId: assertIdentifier(
      payload.workItemId,
      '$["payload"]["workItemId"]',
      limits
    ),
    workItemRevision: assertPositiveSafeInteger(
      payload.workItemRevision,
      '$["payload"]["workItemRevision"]',
      'invalid_payload'
    ),
    ownerPeerId: assertIdentifier(
      payload.ownerPeerId,
      '$["payload"]["ownerPeerId"]',
      limits
    ),
    ownerEpoch,
    offerAttempt,
    ...(previousOfferId === undefined ? {} : { previousOfferId }),
    requiredCapabilityKeys,
    matchingAttributes: validateAttributes(
      payload.matchingAttributes,
      '$["payload"]["matchingAttributes"]'
    ),
    completionCriteria,
    budgetReservationUnits: assertNonnegativeSafeInteger(
      payload.budgetReservationUnits,
      '$["payload"]["budgetReservationUnits"]'
    ),
    bidDeadline,
    workDeadline,
  };
  if (inputSummary !== undefined) {
    const offerInput: WorkOfferInput = { inputSummary };
    return { type: 'work.offer', ...fields, ...offerInput };
  }
  if (inputReference === undefined) {
    return fail('invalid_payload', '$["payload"]');
  }
  const offerInput: WorkOfferInput = { inputReference };
  return { type: 'work.offer', ...fields, ...offerInput };
}

function validateWorkBid(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkBidPayload {
  const payload = assertClosedRecord(
    input,
    [
      'advertisementId',
      'assumptions',
      'bidDeadline',
      'bidExpiresAt',
      'bidId',
      'bidRevision',
      'bidderPeerId',
      'budgetUnits',
      'capabilityId',
      'capabilityRevision',
      'capacityReservationUnits',
      'expectedCompletionAt',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'offerAttempt',
      'offerId',
      'ownerEpoch',
      'ownerPeerId',
      'type',
      'workDeadline',
      'workItemId',
      'workItemRevision',
    ],
    ['previousBidId'],
    '$["payload"]',
    'invalid_payload'
  );
  const bidId = assertIdentifier(
    payload.bidId,
    '$["payload"]["bidId"]',
    limits
  );
  const bidRevision = assertPositiveSafeInteger(
    payload.bidRevision,
    '$["payload"]["bidRevision"]',
    'invalid_payload'
  );
  const previousBidId =
    payload.previousBidId === undefined
      ? undefined
      : assertIdentifier(
          payload.previousBidId,
          '$["payload"]["previousBidId"]',
          limits
        );
  validateRevisionPredecessor(
    bidRevision,
    previousBidId,
    '$["payload"]["previousBidId"]'
  );
  if (previousBidId === bidId) {
    fail('invalid_payload', '$["payload"]["previousBidId"]');
  }
  const ownerEpoch = assertPositiveSafeInteger(
    payload.ownerEpoch,
    '$["payload"]["ownerEpoch"]',
    'invalid_payload'
  );
  if (ownerEpoch !== 1) {
    fail('invalid_payload', '$["payload"]["ownerEpoch"]');
  }

  return {
    type: assertPayloadType(payload.type, 'work.bid'),
    bidId,
    bidRevision,
    ...(previousBidId === undefined ? {} : { previousBidId }),
    offerId: assertIdentifier(
      payload.offerId,
      '$["payload"]["offerId"]',
      limits
    ),
    objectiveId: assertIdentifier(
      payload.objectiveId,
      '$["payload"]["objectiveId"]',
      limits
    ),
    objectiveDocumentId: assertIdentifier(
      payload.objectiveDocumentId,
      '$["payload"]["objectiveDocumentId"]',
      limits
    ),
    objectiveRevision: assertPositiveSafeInteger(
      payload.objectiveRevision,
      '$["payload"]["objectiveRevision"]',
      'invalid_payload'
    ),
    workItemId: assertIdentifier(
      payload.workItemId,
      '$["payload"]["workItemId"]',
      limits
    ),
    workItemRevision: assertPositiveSafeInteger(
      payload.workItemRevision,
      '$["payload"]["workItemRevision"]',
      'invalid_payload'
    ),
    ownerPeerId: assertIdentifier(
      payload.ownerPeerId,
      '$["payload"]["ownerPeerId"]',
      limits
    ),
    ownerEpoch,
    offerAttempt: assertPositiveSafeInteger(
      payload.offerAttempt,
      '$["payload"]["offerAttempt"]',
      'invalid_payload'
    ),
    bidderPeerId: assertIdentifier(
      payload.bidderPeerId,
      '$["payload"]["bidderPeerId"]',
      limits
    ),
    advertisementId: assertIdentifier(
      payload.advertisementId,
      '$["payload"]["advertisementId"]',
      limits
    ),
    capabilityId: assertIdentifier(
      payload.capabilityId,
      '$["payload"]["capabilityId"]',
      limits
    ),
    capabilityRevision: assertPositiveSafeInteger(
      payload.capabilityRevision,
      '$["payload"]["capabilityRevision"]',
      'invalid_payload'
    ),
    capacityReservationUnits: assertBoundedPositiveSafeInteger(
      payload.capacityReservationUnits,
      '$["payload"]["capacityReservationUnits"]',
      maximumCapacityReservationUnits
    ),
    budgetUnits: assertNonnegativeSafeInteger(
      payload.budgetUnits,
      '$["payload"]["budgetUnits"]'
    ),
    bidDeadline: assertRfc3339PayloadTimestamp(
      payload.bidDeadline,
      '$["payload"]["bidDeadline"]'
    ).text,
    workDeadline: assertRfc3339PayloadTimestamp(
      payload.workDeadline,
      '$["payload"]["workDeadline"]'
    ).text,
    expectedCompletionAt: assertRfc3339PayloadTimestamp(
      payload.expectedCompletionAt,
      '$["payload"]["expectedCompletionAt"]'
    ).text,
    bidExpiresAt: assertRfc3339PayloadTimestamp(
      payload.bidExpiresAt,
      '$["payload"]["bidExpiresAt"]'
    ).text,
    assumptions: validateBoundedStringArray(
      payload.assumptions,
      '$["payload"]["assumptions"]',
      maximumWorkListItems,
      maximumWorkTextBytes,
      maximumWorkListBytes
    ),
  };
}

function validateWorkAward(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkAwardPayload {
  const payload = assertClosedRecord(
    input,
    [
      'acceptanceDeadline',
      'assigneePeerId',
      'assignmentAuthorityId',
      'assignmentEpoch',
      'authorityKind',
      'awardId',
      'bidId',
      'bidRevision',
      'budgetReservationUnits',
      'fencingToken',
      'leaseExpiresAt',
      'leaseStartsAt',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'offerAttempt',
      'offerId',
      'ownerEpoch',
      'ownerPeerId',
      'type',
      'workDeadline',
      'workItemId',
      'workItemRevision',
    ],
    ['recoveryCertificateId', 'resumeCheckpointId'],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, 'work.award');
  const authorityKind = assertString(
    payload.authorityKind,
    '$["payload"]["authorityKind"]',
    'invalid_payload'
  );
  if (authorityKind !== 'award' && authorityKind !== 'recovery_certificate') {
    fail('invalid_payload', '$["payload"]["authorityKind"]');
  }

  const awardId = assertIdentifier(
    payload.awardId,
    '$["payload"]["awardId"]',
    limits
  );
  const assignmentEpoch = assertPositiveSafeInteger(
    payload.assignmentEpoch,
    '$["payload"]["assignmentEpoch"]',
    'invalid_payload'
  );
  const assignmentAuthorityId = assertIdentifier(
    payload.assignmentAuthorityId,
    '$["payload"]["assignmentAuthorityId"]',
    limits
  );
  const fencingToken = assertIdentifier(
    payload.fencingToken,
    '$["payload"]["fencingToken"]',
    limits
  );
  if (assignmentAuthorityId !== fencingToken) {
    fail('invalid_payload', '$["payload"]["fencingToken"]');
  }

  const ownerEpoch = assertPositiveSafeInteger(
    payload.ownerEpoch,
    '$["payload"]["ownerEpoch"]',
    'invalid_payload'
  );
  if (ownerEpoch !== 1) {
    fail('invalid_payload', '$["payload"]["ownerEpoch"]');
  }

  const fields: WorkAwardFields = {
    type: 'work.award',
    awardId,
    offerId: assertIdentifier(
      payload.offerId,
      '$["payload"]["offerId"]',
      limits
    ),
    bidId: assertIdentifier(payload.bidId, '$["payload"]["bidId"]', limits),
    bidRevision: assertPositiveSafeInteger(
      payload.bidRevision,
      '$["payload"]["bidRevision"]',
      'invalid_payload'
    ),
    objectiveId: assertIdentifier(
      payload.objectiveId,
      '$["payload"]["objectiveId"]',
      limits
    ),
    objectiveDocumentId: assertIdentifier(
      payload.objectiveDocumentId,
      '$["payload"]["objectiveDocumentId"]',
      limits
    ),
    objectiveRevision: assertPositiveSafeInteger(
      payload.objectiveRevision,
      '$["payload"]["objectiveRevision"]',
      'invalid_payload'
    ),
    workItemId: assertIdentifier(
      payload.workItemId,
      '$["payload"]["workItemId"]',
      limits
    ),
    workItemRevision: assertPositiveSafeInteger(
      payload.workItemRevision,
      '$["payload"]["workItemRevision"]',
      'invalid_payload'
    ),
    ownerPeerId: assertIdentifier(
      payload.ownerPeerId,
      '$["payload"]["ownerPeerId"]',
      limits
    ),
    ownerEpoch,
    offerAttempt: assertPositiveSafeInteger(
      payload.offerAttempt,
      '$["payload"]["offerAttempt"]',
      'invalid_payload'
    ),
    assigneePeerId: assertIdentifier(
      payload.assigneePeerId,
      '$["payload"]["assigneePeerId"]',
      limits
    ),
    assignmentEpoch,
    assignmentAuthorityId,
    fencingToken,
    budgetReservationUnits: assertNonnegativeSafeInteger(
      payload.budgetReservationUnits,
      '$["payload"]["budgetReservationUnits"]'
    ),
    workDeadline: assertRfc3339PayloadTimestamp(
      payload.workDeadline,
      '$["payload"]["workDeadline"]'
    ).text,
    leaseStartsAt: assertRfc3339PayloadTimestamp(
      payload.leaseStartsAt,
      '$["payload"]["leaseStartsAt"]'
    ).text,
    leaseExpiresAt: assertRfc3339PayloadTimestamp(
      payload.leaseExpiresAt,
      '$["payload"]["leaseExpiresAt"]'
    ).text,
    acceptanceDeadline: assertRfc3339PayloadTimestamp(
      payload.acceptanceDeadline,
      '$["payload"]["acceptanceDeadline"]'
    ).text,
  };

  if (authorityKind === 'award') {
    if (
      payload.recoveryCertificateId !== undefined ||
      payload.resumeCheckpointId !== undefined
    ) {
      fail('invalid_payload', '$["payload"]');
    }
    if (assignmentAuthorityId !== awardId) {
      fail('invalid_payload', '$["payload"]["assignmentAuthorityId"]');
    }
    return { ...fields, authorityKind };
  }

  if (assignmentEpoch < 2) {
    fail('invalid_payload', '$["payload"]["assignmentEpoch"]');
  }
  const recoveryCertificateId = assertIdentifier(
    payload.recoveryCertificateId,
    '$["payload"]["recoveryCertificateId"]',
    limits
  );
  if (assignmentAuthorityId !== recoveryCertificateId) {
    fail('invalid_payload', '$["payload"]["assignmentAuthorityId"]');
  }
  const resumeCheckpointId =
    payload.resumeCheckpointId === undefined
      ? undefined
      : assertIdentifier(
          payload.resumeCheckpointId,
          '$["payload"]["resumeCheckpointId"]',
          limits
        );
  return {
    ...fields,
    authorityKind,
    recoveryCertificateId,
    ...(resumeCheckpointId === undefined ? {} : { resumeCheckpointId }),
  };
}

function validateWorkAccept(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkAcceptPayload {
  const payload = validateWorkAssignmentResponse(
    input,
    'work.accept',
    'acceptanceId',
    limits
  );
  return {
    type: 'work.accept',
    acceptanceId: payload.responseId,
    ...payload.fields,
  };
}

function validateWorkDecline(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkDeclinePayload {
  const payload = validateWorkAssignmentResponse(
    input,
    'work.decline',
    'declineId',
    limits
  );
  return {
    type: 'work.decline',
    declineId: payload.responseId,
    ...payload.fields,
  };
}

function validateWorkProgress(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkProgressPayload {
  const payload = assertClosedRecord(
    input,
    [
      'acceptanceId',
      'assigneePeerId',
      'assignmentAuthorityId',
      'assignmentEpoch',
      'awardId',
      'fencingToken',
      'leaseExpiresAt',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'ownerEpoch',
      'ownerPeerId',
      'progressId',
      'progressSequence',
      'progressSummary',
      'type',
      'workItemId',
      'workItemRevision',
    ],
    ['checkpointId'],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, 'work.progress');
  const checkpointId =
    payload.checkpointId === undefined
      ? undefined
      : assertIdentifier(
          payload.checkpointId,
          '$["payload"]["checkpointId"]',
          limits
        );
  return {
    type: 'work.progress',
    ...validateWorkExecutionAuthorityFields(payload, limits),
    progressId: assertIdentifier(
      payload.progressId,
      '$["payload"]["progressId"]',
      limits
    ),
    progressSequence: assertPositiveSafeInteger(
      payload.progressSequence,
      '$["payload"]["progressSequence"]',
      'invalid_payload'
    ),
    progressSummary: assertBoundedString(
      payload.progressSummary,
      '$["payload"]["progressSummary"]',
      maximumWorkTextBytes
    ),
    ...(checkpointId === undefined ? {} : { checkpointId }),
  };
}

function validateWorkCheckpoint(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkCheckpointPayload {
  const payload = assertClosedRecord(
    input,
    [
      'acceptanceId',
      'assigneePeerId',
      'assignmentAuthorityId',
      'assignmentEpoch',
      'awardId',
      'checkpointDigest',
      'checkpointId',
      'checkpointSequence',
      'fencingToken',
      'leaseExpiresAt',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'ownerEpoch',
      'ownerPeerId',
      'type',
      'workItemId',
      'workItemRevision',
    ],
    ['checkpointReference', 'checkpointSummary', 'previousCheckpointId'],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, 'work.checkpoint');
  const checkpointId = assertIdentifier(
    payload.checkpointId,
    '$["payload"]["checkpointId"]',
    limits
  );
  const checkpointSequence = assertPositiveSafeInteger(
    payload.checkpointSequence,
    '$["payload"]["checkpointSequence"]',
    'invalid_payload'
  );
  const previousCheckpointId =
    payload.previousCheckpointId === undefined
      ? undefined
      : assertIdentifier(
          payload.previousCheckpointId,
          '$["payload"]["previousCheckpointId"]',
          limits
        );
  validateRevisionPredecessor(
    checkpointSequence,
    previousCheckpointId,
    '$["payload"]["previousCheckpointId"]'
  );
  if (previousCheckpointId === checkpointId) {
    fail('invalid_payload', '$["payload"]["previousCheckpointId"]');
  }
  return {
    type: 'work.checkpoint',
    ...validateWorkExecutionAuthorityFields(payload, limits),
    ...validateWorkCheckpointContent(payload, limits),
    checkpointId,
    checkpointSequence,
    ...(previousCheckpointId === undefined ? {} : { previousCheckpointId }),
    checkpointDigest: assertContentDigest(
      payload.checkpointDigest,
      '$["payload"]["checkpointDigest"]'
    ),
  };
}

function validateWorkResult(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkResultPayload {
  const payload = assertClosedRecord(
    input,
    [
      'acceptanceId',
      'assigneePeerId',
      'assignmentAuthorityId',
      'assignmentEpoch',
      'awardId',
      'fencingToken',
      'leaseExpiresAt',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'ownerEpoch',
      'ownerPeerId',
      'resultDigest',
      'resultId',
      'type',
      'workItemId',
      'workItemRevision',
    ],
    ['checkpointId', 'resultReference', 'resultSummary'],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, 'work.result');
  const checkpointId =
    payload.checkpointId === undefined
      ? undefined
      : assertIdentifier(
          payload.checkpointId,
          '$["payload"]["checkpointId"]',
          limits
        );
  return {
    type: 'work.result',
    ...validateWorkExecutionAuthorityFields(payload, limits),
    ...validateWorkResultContent(payload, limits),
    resultId: assertIdentifier(
      payload.resultId,
      '$["payload"]["resultId"]',
      limits
    ),
    resultDigest: assertContentDigest(
      payload.resultDigest,
      '$["payload"]["resultDigest"]'
    ),
    ...(checkpointId === undefined ? {} : { checkpointId }),
  };
}

function validateWorkRelease(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkReleasePayload {
  const payload = assertClosedRecord(
    input,
    [
      'acceptanceId',
      'assigneePeerId',
      'assignmentAuthorityId',
      'assignmentEpoch',
      'awardId',
      'fencingToken',
      'leaseExpiresAt',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'ownerEpoch',
      'ownerPeerId',
      'releaseAuthority',
      'releaseDisposition',
      'releaseId',
      'type',
      'workItemId',
      'workItemRevision',
    ],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, 'work.release');
  const releaseAuthority = assertString(
    payload.releaseAuthority,
    '$["payload"]["releaseAuthority"]',
    'invalid_payload'
  );
  if (releaseAuthority !== 'owner' && releaseAuthority !== 'assignee') {
    fail('invalid_payload', '$["payload"]["releaseAuthority"]');
  }
  const releaseDisposition = assertString(
    payload.releaseDisposition,
    '$["payload"]["releaseDisposition"]',
    'invalid_payload'
  );
  if (releaseDisposition !== 'reoffer' && releaseDisposition !== 'close') {
    fail('invalid_payload', '$["payload"]["releaseDisposition"]');
  }
  return {
    type: 'work.release',
    ...validateWorkExecutionAuthorityFields(payload, limits),
    releaseId: assertIdentifier(
      payload.releaseId,
      '$["payload"]["releaseId"]',
      limits
    ),
    releaseAuthority,
    releaseDisposition,
  };
}

function validateWorkCancel(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): WorkCancelPayload {
  const payload = assertClosedRecord(
    input,
    [
      'assigneePeerId',
      'assignmentAuthorityId',
      'assignmentEpoch',
      'assignmentState',
      'awardId',
      'cancellationId',
      'fencingToken',
      'leaseExpiresAt',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'ownerEpoch',
      'ownerPeerId',
      'type',
      'workItemId',
      'workItemRevision',
    ],
    ['acceptanceId'],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, 'work.cancel');
  const fields = validateWorkAssignmentAuthorityFields(payload, limits);
  const cancellationId = assertIdentifier(
    payload.cancellationId,
    '$["payload"]["cancellationId"]',
    limits
  );
  const assignmentState = assertString(
    payload.assignmentState,
    '$["payload"]["assignmentState"]',
    'invalid_payload'
  );
  if (assignmentState === 'award_pending') {
    if (Object.hasOwn(payload, 'acceptanceId')) {
      fail('invalid_payload', '$["payload"]["acceptanceId"]');
    }
    return {
      type: 'work.cancel',
      ...fields,
      cancellationId,
      assignmentState,
    };
  }
  if (assignmentState === 'active') {
    return {
      type: 'work.cancel',
      ...fields,
      cancellationId,
      assignmentState,
      acceptanceId: assertIdentifier(
        payload.acceptanceId,
        '$["payload"]["acceptanceId"]',
        limits
      ),
    };
  }
  return fail('invalid_payload', '$["payload"]["assignmentState"]');
}

function validateLeaseRenew(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): LeaseRenewPayload {
  const payload = assertClosedRecord(
    input,
    [
      'acceptanceId',
      'assigneePeerId',
      'assignmentAuthorityId',
      'assignmentEpoch',
      'awardId',
      'fencingToken',
      'leaseExpiresAt',
      'leaseRenewalId',
      'leaseRenewalSequence',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'ownerEpoch',
      'ownerPeerId',
      'renewedLeaseExpiresAt',
      'type',
      'workItemId',
      'workItemRevision',
    ],
    ['previousLeaseRenewalId'],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, 'lease.renew');
  const fields = validateWorkExecutionAuthorityFields(payload, limits);
  const leaseRenewalId = assertIdentifier(
    payload.leaseRenewalId,
    '$["payload"]["leaseRenewalId"]',
    limits
  );
  const leaseRenewalSequence = assertPositiveSafeInteger(
    payload.leaseRenewalSequence,
    '$["payload"]["leaseRenewalSequence"]',
    'invalid_payload'
  );
  if (leaseRenewalSequence > maximumLeaseRenewals) {
    fail('invalid_payload', '$["payload"]["leaseRenewalSequence"]');
  }
  const previousLeaseRenewalId =
    payload.previousLeaseRenewalId === undefined
      ? undefined
      : assertIdentifier(
          payload.previousLeaseRenewalId,
          '$["payload"]["previousLeaseRenewalId"]',
          limits
        );
  validateRevisionPredecessor(
    leaseRenewalSequence,
    previousLeaseRenewalId,
    '$["payload"]["previousLeaseRenewalId"]'
  );
  if (previousLeaseRenewalId === leaseRenewalId) {
    fail('invalid_payload', '$["payload"]["previousLeaseRenewalId"]');
  }
  const renewedLeaseExpiresAt = assertRfc3339PayloadTimestamp(
    payload.renewedLeaseExpiresAt,
    '$["payload"]["renewedLeaseExpiresAt"]'
  );
  const currentLeaseExpiresAt = parseRfc3339(
    fields.leaseExpiresAt,
    '$["payload"]["leaseExpiresAt"]'
  );
  if (renewedLeaseExpiresAt.instant <= currentLeaseExpiresAt) {
    fail('invalid_payload', '$["payload"]["renewedLeaseExpiresAt"]');
  }
  if (
    renewedLeaseExpiresAt.instant - currentLeaseExpiresAt >
    BigInt(maximumLeaseDurationMs) * 1_000_000n
  ) {
    fail('invalid_payload', '$["payload"]["renewedLeaseExpiresAt"]');
  }
  return {
    type: 'lease.renew',
    ...fields,
    leaseRenewalId,
    leaseRenewalSequence,
    ...(previousLeaseRenewalId === undefined ? {} : { previousLeaseRenewalId }),
    renewedLeaseExpiresAt: renewedLeaseExpiresAt.text,
  };
}

function validateLeaseTakeoverProposal(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): LeaseTakeoverProposalPayload {
  const payload = assertClosedRecord(
    input,
    [
      'acceptanceId',
      'assigneePeerId',
      'assignmentAuthorityId',
      'assignmentEpoch',
      'awardId',
      'fencingToken',
      'leaseExpiresAt',
      'leaseRenewalSequence',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'ownerEpoch',
      'ownerPeerId',
      'proposalAuthority',
      'proposedAssigneePeerId',
      'proposedAssignmentEpoch',
      'proposerPeerId',
      'takeoverProposalId',
      'type',
      'workItemId',
      'workItemRevision',
    ],
    ['candidateConsentProposalId', 'latestLeaseRenewalId'],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, 'lease.takeover_proposal');
  const fields = validateWorkExecutionAuthorityFields(payload, limits);
  const takeoverProposalId = assertIdentifier(
    payload.takeoverProposalId,
    '$["payload"]["takeoverProposalId"]',
    limits
  );
  const proposerPeerId = assertIdentifier(
    payload.proposerPeerId,
    '$["payload"]["proposerPeerId"]',
    limits
  );
  const proposedAssigneePeerId = assertIdentifier(
    payload.proposedAssigneePeerId,
    '$["payload"]["proposedAssigneePeerId"]',
    limits
  );
  if (proposedAssigneePeerId === fields.assigneePeerId) {
    fail('invalid_payload', '$["payload"]["proposedAssigneePeerId"]');
  }
  const proposalAuthority = assertString(
    payload.proposalAuthority,
    '$["payload"]["proposalAuthority"]',
    'invalid_payload'
  );
  if (proposalAuthority !== 'candidate' && proposalAuthority !== 'witness') {
    fail('invalid_payload', '$["payload"]["proposalAuthority"]');
  }
  if (
    proposalAuthority === 'candidate' &&
    proposerPeerId !== proposedAssigneePeerId
  ) {
    fail('invalid_payload', '$["payload"]["proposedAssigneePeerId"]');
  }
  if (
    proposalAuthority === 'witness' &&
    proposerPeerId === proposedAssigneePeerId
  ) {
    fail('invalid_payload', '$["payload"]["proposalAuthority"]');
  }
  if (
    proposalAuthority === 'candidate' &&
    Object.hasOwn(payload, 'candidateConsentProposalId')
  ) {
    fail('invalid_payload', '$["payload"]["candidateConsentProposalId"]');
  }
  const proposedAssignmentEpoch = assertPositiveSafeInteger(
    payload.proposedAssignmentEpoch,
    '$["payload"]["proposedAssignmentEpoch"]',
    'invalid_payload'
  );
  if (proposedAssignmentEpoch !== fields.assignmentEpoch + 1) {
    fail('invalid_payload', '$["payload"]["proposedAssignmentEpoch"]');
  }
  const leaseRenewalSequence = assertNonnegativeSafeInteger(
    payload.leaseRenewalSequence,
    '$["payload"]["leaseRenewalSequence"]'
  );
  if (leaseRenewalSequence > maximumLeaseRenewals) {
    fail('invalid_payload', '$["payload"]["leaseRenewalSequence"]');
  }
  const latestLeaseRenewalId =
    leaseRenewalSequence === 0
      ? undefined
      : assertIdentifier(
          payload.latestLeaseRenewalId,
          '$["payload"]["latestLeaseRenewalId"]',
          limits
        );
  if (leaseRenewalSequence === 0) {
    if (Object.hasOwn(payload, 'latestLeaseRenewalId')) {
      fail('invalid_payload', '$["payload"]["latestLeaseRenewalId"]');
    }
  }
  const proposalFields = {
    type: 'lease.takeover_proposal' as const,
    ...fields,
    takeoverProposalId,
    proposerPeerId,
    proposedAssigneePeerId,
    proposedAssignmentEpoch,
    leaseRenewalSequence,
    ...(latestLeaseRenewalId === undefined ? {} : { latestLeaseRenewalId }),
  };
  if (proposalAuthority === 'candidate') {
    return {
      ...proposalFields,
      proposalAuthority,
    };
  }
  return {
    ...proposalFields,
    proposalAuthority,
    candidateConsentProposalId: assertIdentifier(
      payload.candidateConsentProposalId,
      '$["payload"]["candidateConsentProposalId"]',
      limits
    ),
  };
}

function validateLeaseVote(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): LeaseVotePayload {
  const payload = assertClosedRecord(
    input,
    [
      'leaseVoteId',
      'objectiveId',
      'takeoverProposalId',
      'type',
      'witnessPeerId',
    ],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  return {
    type: assertPayloadType(payload.type, 'lease.vote'),
    leaseVoteId: assertIdentifier(
      payload.leaseVoteId,
      '$["payload"]["leaseVoteId"]',
      limits
    ),
    takeoverProposalId: assertIdentifier(
      payload.takeoverProposalId,
      '$["payload"]["takeoverProposalId"]',
      limits
    ),
    witnessPeerId: assertIdentifier(
      payload.witnessPeerId,
      '$["payload"]["witnessPeerId"]',
      limits
    ),
    objectiveId: assertIdentifier(
      payload.objectiveId,
      '$["payload"]["objectiveId"]',
      limits
    ),
  };
}

function validateLeaseCertificate(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): LeaseCertificatePayload {
  const payload = assertClosedRecord(
    input,
    [
      'certificateAssemblerPeerId',
      'certificateId',
      'leaseVoteIds',
      'objectiveId',
      'takeoverProposalId',
      'type',
    ],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  const leaseVoteIds = validateIdentifierArray(
    payload.leaseVoteIds,
    '$["payload"]["leaseVoteIds"]',
    maximumRecoveryWitnesses,
    limits
  );
  if (leaseVoteIds.length < 2) {
    fail('invalid_payload', '$["payload"]["leaseVoteIds"]');
  }
  return {
    type: assertPayloadType(payload.type, 'lease.certificate'),
    certificateId: assertIdentifier(
      payload.certificateId,
      '$["payload"]["certificateId"]',
      limits
    ),
    certificateAssemblerPeerId: assertIdentifier(
      payload.certificateAssemblerPeerId,
      '$["payload"]["certificateAssemblerPeerId"]',
      limits
    ),
    takeoverProposalId: assertIdentifier(
      payload.takeoverProposalId,
      '$["payload"]["takeoverProposalId"]',
      limits
    ),
    leaseVoteIds,
    objectiveId: assertIdentifier(
      payload.objectiveId,
      '$["payload"]["objectiveId"]',
      limits
    ),
  };
}

function validateWorkExecutionAuthorityFields(
  payload: Record<string, unknown>,
  limits: Readonly<MeshProtocolLimits>
): WorkExecutionAuthorityFields {
  return {
    ...validateWorkAssignmentAuthorityFields(payload, limits),
    acceptanceId: assertIdentifier(
      payload.acceptanceId,
      '$["payload"]["acceptanceId"]',
      limits
    ),
  };
}

function validateWorkAssignmentAuthorityFields(
  payload: Record<string, unknown>,
  limits: Readonly<MeshProtocolLimits>
): WorkAssignmentAuthorityFields {
  const ownerEpoch = assertPositiveSafeInteger(
    payload.ownerEpoch,
    '$["payload"]["ownerEpoch"]',
    'invalid_payload'
  );
  if (ownerEpoch !== 1) {
    fail('invalid_payload', '$["payload"]["ownerEpoch"]');
  }
  const assignmentAuthorityId = assertIdentifier(
    payload.assignmentAuthorityId,
    '$["payload"]["assignmentAuthorityId"]',
    limits
  );
  const fencingToken = assertIdentifier(
    payload.fencingToken,
    '$["payload"]["fencingToken"]',
    limits
  );
  if (assignmentAuthorityId !== fencingToken) {
    fail('invalid_payload', '$["payload"]["fencingToken"]');
  }
  return {
    objectiveId: assertIdentifier(
      payload.objectiveId,
      '$["payload"]["objectiveId"]',
      limits
    ),
    objectiveDocumentId: assertIdentifier(
      payload.objectiveDocumentId,
      '$["payload"]["objectiveDocumentId"]',
      limits
    ),
    objectiveRevision: assertPositiveSafeInteger(
      payload.objectiveRevision,
      '$["payload"]["objectiveRevision"]',
      'invalid_payload'
    ),
    workItemId: assertIdentifier(
      payload.workItemId,
      '$["payload"]["workItemId"]',
      limits
    ),
    workItemRevision: assertPositiveSafeInteger(
      payload.workItemRevision,
      '$["payload"]["workItemRevision"]',
      'invalid_payload'
    ),
    ownerPeerId: assertIdentifier(
      payload.ownerPeerId,
      '$["payload"]["ownerPeerId"]',
      limits
    ),
    ownerEpoch,
    assigneePeerId: assertIdentifier(
      payload.assigneePeerId,
      '$["payload"]["assigneePeerId"]',
      limits
    ),
    awardId: assertIdentifier(
      payload.awardId,
      '$["payload"]["awardId"]',
      limits
    ),
    assignmentEpoch: assertPositiveSafeInteger(
      payload.assignmentEpoch,
      '$["payload"]["assignmentEpoch"]',
      'invalid_payload'
    ),
    assignmentAuthorityId,
    fencingToken,
    leaseExpiresAt: assertRfc3339PayloadTimestamp(
      payload.leaseExpiresAt,
      '$["payload"]["leaseExpiresAt"]'
    ).text,
  };
}

function validateWorkCheckpointContent(
  payload: Record<string, unknown>,
  limits: Readonly<MeshProtocolLimits>
): WorkCheckpointContent {
  const hasSummary = payload.checkpointSummary !== undefined;
  const hasReference = payload.checkpointReference !== undefined;
  if (hasSummary === hasReference) {
    fail('invalid_payload', '$["payload"]');
  }
  if (hasSummary) {
    return {
      checkpointSummary: assertBoundedString(
        payload.checkpointSummary,
        '$["payload"]["checkpointSummary"]',
        maximumWorkTextBytes
      ),
    };
  }
  return {
    checkpointReference: assertBoundedString(
      payload.checkpointReference,
      '$["payload"]["checkpointReference"]',
      maximumWorkTextBytes
    ),
  };
}

function validateWorkResultContent(
  payload: Record<string, unknown>,
  limits: Readonly<MeshProtocolLimits>
): WorkResultContent {
  const hasSummary = payload.resultSummary !== undefined;
  const hasReference = payload.resultReference !== undefined;
  if (hasSummary === hasReference) {
    fail('invalid_payload', '$["payload"]');
  }
  if (hasSummary) {
    return {
      resultSummary: assertBoundedString(
        payload.resultSummary,
        '$["payload"]["resultSummary"]',
        maximumWorkTextBytes
      ),
    };
  }
  return {
    resultReference: assertBoundedString(
      payload.resultReference,
      '$["payload"]["resultReference"]',
      maximumWorkTextBytes
    ),
  };
}

function validateWorkAssignmentResponse(
  input: unknown,
  type: 'work.accept' | 'work.decline',
  responseIdKey: 'acceptanceId' | 'declineId',
  limits: Readonly<MeshProtocolLimits>
) {
  const payload = assertClosedRecord(
    input,
    [
      'acceptanceDeadline',
      'assigneePeerId',
      'assignmentAuthorityId',
      'assignmentEpoch',
      'awardId',
      'fencingToken',
      'objectiveDocumentId',
      'objectiveId',
      'objectiveRevision',
      'ownerEpoch',
      'ownerPeerId',
      responseIdKey,
      'type',
      'workItemId',
      'workItemRevision',
    ],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, type);
  const assignmentAuthorityId = assertIdentifier(
    payload.assignmentAuthorityId,
    '$["payload"]["assignmentAuthorityId"]',
    limits
  );
  const fencingToken = assertIdentifier(
    payload.fencingToken,
    '$["payload"]["fencingToken"]',
    limits
  );
  if (assignmentAuthorityId !== fencingToken) {
    fail('invalid_payload', '$["payload"]["fencingToken"]');
  }
  const ownerEpoch = assertPositiveSafeInteger(
    payload.ownerEpoch,
    '$["payload"]["ownerEpoch"]',
    'invalid_payload'
  );
  if (ownerEpoch !== 1) {
    fail('invalid_payload', '$["payload"]["ownerEpoch"]');
  }
  return {
    responseId: assertIdentifier(
      payload[responseIdKey],
      `$["payload"]["${responseIdKey}"]`,
      limits
    ),
    fields: {
      awardId: assertIdentifier(
        payload.awardId,
        '$["payload"]["awardId"]',
        limits
      ),
      objectiveId: assertIdentifier(
        payload.objectiveId,
        '$["payload"]["objectiveId"]',
        limits
      ),
      objectiveDocumentId: assertIdentifier(
        payload.objectiveDocumentId,
        '$["payload"]["objectiveDocumentId"]',
        limits
      ),
      objectiveRevision: assertPositiveSafeInteger(
        payload.objectiveRevision,
        '$["payload"]["objectiveRevision"]',
        'invalid_payload'
      ),
      workItemId: assertIdentifier(
        payload.workItemId,
        '$["payload"]["workItemId"]',
        limits
      ),
      workItemRevision: assertPositiveSafeInteger(
        payload.workItemRevision,
        '$["payload"]["workItemRevision"]',
        'invalid_payload'
      ),
      ownerPeerId: assertIdentifier(
        payload.ownerPeerId,
        '$["payload"]["ownerPeerId"]',
        limits
      ),
      ownerEpoch,
      assigneePeerId: assertIdentifier(
        payload.assigneePeerId,
        '$["payload"]["assigneePeerId"]',
        limits
      ),
      assignmentEpoch: assertPositiveSafeInteger(
        payload.assignmentEpoch,
        '$["payload"]["assignmentEpoch"]',
        'invalid_payload'
      ),
      assignmentAuthorityId,
      fencingToken,
      acceptanceDeadline: assertRfc3339PayloadTimestamp(
        payload.acceptanceDeadline,
        '$["payload"]["acceptanceDeadline"]'
      ).text,
    },
  };
}

function validateObjectiveDocument(
  input: unknown,
  type: 'objective.announce' | 'objective.revise',
  limits: Readonly<MeshProtocolLimits>
): ObjectiveDocumentFields & ObjectiveDocumentContent {
  const requiredKeys = [
    'acceptanceWindowMs',
    'bidWindowMs',
    'issuerPeerId',
    'maximumBudgetUnits',
    'maximumConcurrentAssignments',
    'maximumLeaseDurationMs',
    'maximumLeaseRenewals',
    'maximumWorkItems',
    'objectiveDocumentId',
    'objectiveId',
    'objectiveRevision',
    'permittedCapabilityKeys',
    'recoveryGraceMs',
    'recoveryWitnessPeerIds',
    'recoveryWitnessThreshold',
    'successCriteria',
    'type',
    'validFrom',
    'validUntil',
  ];
  if (type === 'objective.revise') {
    requiredKeys.push('previousObjectiveDocumentId');
  }
  const payload = assertClosedRecord(
    input,
    requiredKeys,
    ['authorizedObserverPeerIds', 'contentReference', 'summary'],
    '$["payload"]',
    'invalid_payload'
  );
  assertPayloadType(payload.type, type);

  const hasSummary = payload.summary !== undefined;
  const hasContentReference = payload.contentReference !== undefined;
  if (hasSummary === hasContentReference) {
    fail('invalid_payload', '$["payload"]');
  }
  const summary = hasSummary
    ? assertBoundedString(
        payload.summary,
        '$["payload"]["summary"]',
        maximumObjectiveTextBytes
      )
    : undefined;
  const contentReference = hasContentReference
    ? assertBoundedString(
        payload.contentReference,
        '$["payload"]["contentReference"]',
        maximumObjectiveTextBytes
      )
    : undefined;

  const successCriteria = validateBoundedStringArray(
    payload.successCriteria,
    '$["payload"]["successCriteria"]',
    maximumSuccessCriteria,
    maximumObjectiveTextBytes,
    maximumSuccessCriteriaBytes
  );
  if (successCriteria.length === 0) {
    fail('invalid_payload', '$["payload"]["successCriteria"]');
  }
  const permittedCapabilityKeys = validateBoundedStringArray(
    payload.permittedCapabilityKeys,
    '$["payload"]["permittedCapabilityKeys"]',
    maximumPermittedCapabilityKeys,
    maximumObjectiveTextBytes,
    undefined,
    true
  );
  if (permittedCapabilityKeys.length === 0) {
    fail('invalid_payload', '$["payload"]["permittedCapabilityKeys"]');
  }

  const recoveryWitnessPeerIds = validateIdentifierArray(
    payload.recoveryWitnessPeerIds,
    '$["payload"]["recoveryWitnessPeerIds"]',
    maximumRecoveryWitnesses,
    limits
  );
  if (recoveryWitnessPeerIds.length < minimumRecoveryWitnesses) {
    fail('invalid_payload', '$["payload"]["recoveryWitnessPeerIds"]');
  }
  const recoveryWitnessThreshold = assertPositiveSafeInteger(
    payload.recoveryWitnessThreshold,
    '$["payload"]["recoveryWitnessThreshold"]',
    'invalid_payload'
  );
  if (
    recoveryWitnessThreshold > recoveryWitnessPeerIds.length ||
    recoveryWitnessThreshold <= recoveryWitnessPeerIds.length / 2
  ) {
    fail('invalid_payload', '$["payload"]["recoveryWitnessThreshold"]');
  }
  const authorizedObserverPeerIds =
    payload.authorizedObserverPeerIds === undefined
      ? undefined
      : validateIdentifierArray(
          payload.authorizedObserverPeerIds,
          '$["payload"]["authorizedObserverPeerIds"]',
          maximumAuthorizedObservers,
          limits
        );

  const maximumWorkItems = assertPositiveSafeInteger(
    payload.maximumWorkItems,
    '$["payload"]["maximumWorkItems"]',
    'invalid_payload'
  );
  if (maximumWorkItems > maximumObjectiveWorkItems) {
    fail('invalid_payload', '$["payload"]["maximumWorkItems"]');
  }
  const maximumConcurrentAssignments = assertPositiveSafeInteger(
    payload.maximumConcurrentAssignments,
    '$["payload"]["maximumConcurrentAssignments"]',
    'invalid_payload'
  );
  if (maximumConcurrentAssignments > maximumWorkItems) {
    fail('invalid_payload', '$["payload"]["maximumConcurrentAssignments"]');
  }
  const maximumBudgetUnits = assertNonnegativeSafeInteger(
    payload.maximumBudgetUnits,
    '$["payload"]["maximumBudgetUnits"]'
  );
  const bidWindowMs = assertBoundedPositiveSafeInteger(
    payload.bidWindowMs,
    '$["payload"]["bidWindowMs"]',
    maximumBidWindowMs
  );
  const acceptanceWindowMs = assertBoundedPositiveSafeInteger(
    payload.acceptanceWindowMs,
    '$["payload"]["acceptanceWindowMs"]',
    maximumAcceptanceWindowMs
  );
  const maximumLeaseDuration = assertBoundedPositiveSafeInteger(
    payload.maximumLeaseDurationMs,
    '$["payload"]["maximumLeaseDurationMs"]',
    maximumLeaseDurationMs
  );
  const recoveryGraceMs = assertBoundedPositiveSafeInteger(
    payload.recoveryGraceMs,
    '$["payload"]["recoveryGraceMs"]',
    maximumRecoveryGraceMs
  );
  const maximumLeaseRenewalsValue = assertNonnegativeSafeInteger(
    payload.maximumLeaseRenewals,
    '$["payload"]["maximumLeaseRenewals"]'
  );
  if (maximumLeaseRenewalsValue > maximumLeaseRenewals) {
    fail('invalid_payload', '$["payload"]["maximumLeaseRenewals"]');
  }

  const validFrom = assertRfc3339PayloadTimestamp(
    payload.validFrom,
    '$["payload"]["validFrom"]'
  );
  const validUntil = assertRfc3339PayloadTimestamp(
    payload.validUntil,
    '$["payload"]["validUntil"]'
  );
  const validityDuration = assertObjectiveValidity(
    validFrom.instant,
    validUntil.instant
  );
  for (const [path, timer] of [
    ['$["payload"]["bidWindowMs"]', bidWindowMs],
    ['$["payload"]["acceptanceWindowMs"]', acceptanceWindowMs],
    ['$["payload"]["maximumLeaseDurationMs"]', maximumLeaseDuration],
    ['$["payload"]["recoveryGraceMs"]', recoveryGraceMs],
  ] as const) {
    if (BigInt(timer) * 1_000_000n > validityDuration) {
      fail('invalid_payload', path);
    }
  }

  const fields: ObjectiveDocumentFields = {
    objectiveDocumentId: assertIdentifier(
      payload.objectiveDocumentId,
      '$["payload"]["objectiveDocumentId"]',
      limits
    ),
    objectiveId: assertIdentifier(
      payload.objectiveId,
      '$["payload"]["objectiveId"]',
      limits
    ),
    objectiveRevision: assertPositiveSafeInteger(
      payload.objectiveRevision,
      '$["payload"]["objectiveRevision"]',
      'invalid_payload'
    ),
    issuerPeerId: assertIdentifier(
      payload.issuerPeerId,
      '$["payload"]["issuerPeerId"]',
      limits
    ),
    successCriteria,
    permittedCapabilityKeys,
    maximumWorkItems,
    maximumConcurrentAssignments,
    maximumBudgetUnits,
    bidWindowMs,
    acceptanceWindowMs,
    maximumLeaseDurationMs: maximumLeaseDuration,
    recoveryGraceMs,
    maximumLeaseRenewals: maximumLeaseRenewalsValue,
    recoveryWitnessPeerIds,
    recoveryWitnessThreshold,
    validFrom: validFrom.text,
    validUntil: validUntil.text,
    ...(authorizedObserverPeerIds === undefined
      ? {}
      : { authorizedObserverPeerIds }),
  };
  if (summary !== undefined) {
    return { ...fields, summary };
  }
  if (contentReference === undefined) {
    return fail('invalid_payload', '$["payload"]');
  }
  return { ...fields, contentReference };
}

function validateProof(input: unknown, limits: Readonly<MeshProtocolLimits>) {
  const proof = assertClosedRecord(
    input,
    ['algorithm', 'keyId', 'value'],
    [],
    '$["proof"]',
    'invalid_proof'
  );
  if (proof.algorithm !== MESH_SIGNATURE_ALGORITHM) {
    fail('invalid_proof', '$["proof"]["algorithm"]');
  }
  const value = assertString(
    proof.value,
    '$["proof"]["value"]',
    'invalid_proof'
  );
  if (!isCanonicalBase64Url(value, 64)) {
    fail('invalid_proof', '$["proof"]["value"]');
  }
  return {
    algorithm: MESH_SIGNATURE_ALGORITHM,
    keyId: assertIdentifier(proof.keyId, '$["proof"]["keyId"]', limits),
    value,
  };
}

function validateExtensions(
  input: unknown,
  limits: Readonly<MeshProtocolLimits>
): Readonly<Record<string, MeshJsonValue>> {
  const extensions = assertRecord(
    input,
    '$["extensions"]',
    'invalid_extension'
  );
  const keys = Object.keys(extensions);
  if (keys.length > limits.maximumExtensions) {
    fail('structural_limit_exceeded', '$["extensions"]');
  }
  const canonical = canonicalizeJsonValue(
    extensions,
    strictLimits(limits),
    limits.maximumEnvelopeBytes
  );
  if (!canonical.ok) {
    fail(canonical.code, prefixPath('$["extensions"]', canonical.path));
  }
  return extensions as Readonly<Record<string, MeshJsonValue>>;
}

function validateCriticalExtensions(
  input: unknown,
  extensions: Readonly<Record<string, MeshJsonValue>> | undefined,
  limits: Readonly<MeshProtocolLimits>
): readonly string[] {
  if (!Array.isArray(input)) {
    fail('invalid_extension', '$["criticalExtensions"]');
  }
  if (input.length > limits.maximumCriticalExtensions) {
    fail('structural_limit_exceeded', '$["criticalExtensions"]');
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const [index, value] of input.entries()) {
    const key = assertString(
      value,
      `$["criticalExtensions"][${index}]`,
      'invalid_extension'
    );
    if (
      key.length === 0 ||
      seen.has(key) ||
      !Object.hasOwn(extensions ?? {}, key)
    ) {
      fail('invalid_extension', `$["criticalExtensions"][${index}]`);
    }
    seen.add(key);
    result.push(key);
  }
  return result;
}

function validateMessageSpecificEnvelope(
  type: MeshMessagePayload['type'],
  sender: MeshSender,
  audience: MeshAudience,
  objectiveId: string | undefined,
  causationId: string | undefined,
  payload: MeshMessagePayload,
  sentAt: bigint,
  expiresAt: bigint
): void {
  if (payload.type === 'peer.card') {
    if (payload.subjectPeerId !== sender.peerId) {
      fail('invalid_payload', '$["payload"]["subjectPeerId"]');
    }
    if (payload.instanceId !== sender.instanceId) {
      fail('invalid_payload', '$["payload"]["instanceId"]');
    }
  } else if (
    payload.type === 'peer.goodbye' &&
    payload.instanceId !== sender.instanceId
  ) {
    fail('invalid_payload', '$["payload"]["instanceId"]');
  } else if (
    payload.type === 'capability.advertise' &&
    payload.ownerPeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["ownerPeerId"]');
  } else if (
    (payload.type === 'objective.announce' ||
      payload.type === 'objective.revise') &&
    payload.issuerPeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["issuerPeerId"]');
  } else if (
    payload.type === 'work.offer' &&
    payload.ownerPeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["ownerPeerId"]');
  } else if (
    payload.type === 'work.bid' &&
    payload.bidderPeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["bidderPeerId"]');
  } else if (
    payload.type === 'work.award' &&
    payload.ownerPeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["ownerPeerId"]');
  } else if (
    (payload.type === 'work.accept' ||
      payload.type === 'work.decline' ||
      payload.type === 'work.progress' ||
      payload.type === 'work.checkpoint' ||
      payload.type === 'work.result' ||
      payload.type === 'lease.renew') &&
    payload.assigneePeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["assigneePeerId"]');
  } else if (payload.type === 'work.release') {
    if (
      payload.releaseAuthority === 'owner' &&
      payload.ownerPeerId !== sender.peerId
    ) {
      fail('invalid_payload', '$["payload"]["ownerPeerId"]');
    }
    if (
      payload.releaseAuthority === 'assignee' &&
      payload.assigneePeerId !== sender.peerId
    ) {
      fail('invalid_payload', '$["payload"]["assigneePeerId"]');
    }
  } else if (
    payload.type === 'work.cancel' &&
    payload.ownerPeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["ownerPeerId"]');
  } else if (
    payload.type === 'lease.takeover_proposal' &&
    payload.proposerPeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["proposerPeerId"]');
  } else if (
    payload.type === 'lease.vote' &&
    payload.witnessPeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["witnessPeerId"]');
  } else if (
    payload.type === 'lease.certificate' &&
    payload.certificateAssemblerPeerId !== sender.peerId
  ) {
    fail('invalid_payload', '$["payload"]["certificateAssemblerPeerId"]');
  }

  if (
    type === 'peer.hello' ||
    type === 'peer.card' ||
    type === 'peer.goodbye'
  ) {
    if (audience.kind === 'mesh' && audience.topic !== 'membership') {
      fail('invalid_audience', '$["audience"]["topic"]');
    }
  } else if (
    type === 'capability.advertise' ||
    type === 'capability.withdraw'
  ) {
    if (audience.kind === 'mesh' && audience.topic !== 'capability') {
      fail('invalid_audience', '$["audience"]["topic"]');
    }
  } else if (
    type === 'objective.announce' ||
    type === 'objective.revise' ||
    type === 'objective.cancel'
  ) {
    if (audience.kind === 'mesh' && audience.topic !== 'objective') {
      fail('invalid_audience', '$["audience"]["topic"]');
    }
  } else if (type === 'work.offer') {
    if (audience.kind === 'mesh' && audience.topic !== 'work') {
      fail('invalid_audience', '$["audience"]["topic"]');
    }
  } else if (type === 'work.bid') {
    if (audience.kind !== 'peer') {
      fail('invalid_audience', '$["audience"]');
    }
    if (audience.peerId !== (payload as WorkBidPayload).ownerPeerId) {
      fail('invalid_audience', '$["audience"]["peerId"]');
    }
  } else if (
    type === 'evidence.claim' ||
    type === 'evidence.attest' ||
    type === 'evidence.challenge' ||
    type === 'evidence.retract'
  ) {
    if (audience.kind === 'mesh' && audience.topic !== 'evidence') {
      fail('invalid_audience', '$["audience"]["topic"]');
    }
  } else if (type === 'trust.observation') {
    if (audience.kind !== 'peer') {
      fail('invalid_audience', '$["audience"]');
    }
  } else if (
    type === 'work.award' ||
    type === 'work.accept' ||
    type === 'work.decline' ||
    type === 'work.progress' ||
    type === 'work.checkpoint' ||
    type === 'work.result' ||
    type === 'work.release' ||
    type === 'work.cancel' ||
    type === 'lease.renew' ||
    type === 'lease.takeover_proposal' ||
    type === 'lease.vote' ||
    type === 'lease.certificate'
  ) {
    if (audience.kind !== 'peer') {
      fail('invalid_audience', '$["audience"]');
    }
    if (
      type === 'work.decline' &&
      audience.peerId !== (payload as WorkDeclinePayload).ownerPeerId
    ) {
      fail('invalid_audience', '$["audience"]["peerId"]');
    }
  } else if (audience.kind !== 'peer') {
    fail('invalid_audience', '$["audience"]');
  }
  if (
    type !== 'peer.hello' &&
    type.startsWith('peer.') &&
    objectiveId !== undefined
  ) {
    fail('invalid_payload', '$["objectiveId"]');
  }
  if (
    type === 'peer.ping_ack' ||
    type === 'peer.goodbye' ||
    type === 'capability.withdraw' ||
    type === 'objective.cancel'
  ) {
    if (causationId === undefined) {
      fail('invalid_payload', '$["causationId"]');
    }
  } else if (type === 'peer.card' || type === 'capability.advertise') {
    const revision =
      payload.type === 'peer.card'
        ? payload.cardRevision
        : (payload as CapabilityAdvertisePayload).capabilityRevision;
    if (revision === 1 && causationId !== undefined) {
      fail('invalid_payload', '$["causationId"]');
    }
    if (revision > 1 && causationId === undefined) {
      fail('invalid_payload', '$["causationId"]');
    }
  } else if (type === 'objective.announce') {
    if (causationId !== undefined) {
      fail('invalid_payload', '$["causationId"]');
    }
  } else if (type === 'objective.revise' && causationId === undefined) {
    fail('invalid_payload', '$["causationId"]');
  } else if (type === 'work.offer') {
    const offer = payload as WorkOfferPayload;
    if (offer.offerAttempt === 1 && causationId !== undefined) {
      fail('invalid_payload', '$["causationId"]');
    }
    if (offer.offerAttempt > 1 && causationId === undefined) {
      fail('invalid_payload', '$["causationId"]');
    }
  } else if (
    (type === 'work.bid' ||
      type === 'work.award' ||
      type === 'work.accept' ||
      type === 'work.decline' ||
      type === 'work.progress' ||
      type === 'work.checkpoint' ||
      type === 'work.result' ||
      type === 'work.release' ||
      type === 'work.cancel' ||
      type === 'lease.renew' ||
      type === 'lease.takeover_proposal' ||
      type === 'lease.vote' ||
      type === 'lease.certificate') &&
    causationId === undefined
  ) {
    fail('invalid_payload', '$["causationId"]');
  }

  if (
    type === 'evidence.claim' ||
    type === 'evidence.attest' ||
    type === 'evidence.challenge' ||
    type === 'evidence.retract'
  ) {
    const evidencePayload = payload as
      | EvidenceClaimPayload
      | EvidenceAttestationPayload
      | EvidenceChallengePayload
      | EvidenceRetractionPayload;
    if (evidencePayload.scope.kind === 'mesh') {
      if (objectiveId !== undefined) {
        fail('invalid_payload', '$["objectiveId"]');
      }
    } else if (objectiveId === undefined) {
      fail('invalid_payload', '$["objectiveId"]');
    }

    const references =
      evidencePayload.type === 'evidence.claim' ||
      evidencePayload.type === 'evidence.attest' ||
      evidencePayload.type === 'evidence.challenge'
        ? evidencePayload.basisReferences
        : [];
    if (
      (evidencePayload.scope.kind === 'work' ||
        references.some((reference) => reference.kind === 'mesh_record')) &&
      causationId === undefined
    ) {
      fail('invalid_payload', '$["causationId"]');
    }
  }

  if (
    type === 'objective.announce' ||
    type === 'objective.revise' ||
    type === 'objective.cancel' ||
    type === 'work.offer' ||
    type === 'work.bid' ||
    type === 'work.award' ||
    type === 'work.accept' ||
    type === 'work.decline' ||
    type === 'work.progress' ||
    type === 'work.checkpoint' ||
    type === 'work.result' ||
    type === 'work.release' ||
    type === 'work.cancel' ||
    type === 'lease.renew' ||
    type === 'lease.takeover_proposal' ||
    type === 'lease.vote' ||
    type === 'lease.certificate'
  ) {
    if (
      objectiveId === undefined ||
      objectiveId !==
        (
          payload as
            | ObjectiveAnnouncePayload
            | ObjectiveRevisePayload
            | ObjectiveCancelPayload
            | WorkOfferPayload
            | WorkBidPayload
            | WorkAwardPayload
            | WorkAcceptPayload
            | WorkDeclinePayload
            | WorkProgressPayload
            | WorkCheckpointPayload
            | WorkResultPayload
            | WorkReleasePayload
            | WorkCancelPayload
            | LeaseRenewPayload
            | LeaseTakeoverProposalPayload
            | LeaseVotePayload
            | LeaseCertificatePayload
        ).objectiveId
    ) {
      fail('invalid_payload', '$["objectiveId"]');
    }
  }

  if (payload.type === 'work.offer') {
    validateWorkOfferTimes(payload, sentAt, expiresAt);
  } else if (payload.type === 'work.bid') {
    validateWorkBidTimes(payload, sentAt, expiresAt);
  } else if (payload.type === 'work.award') {
    validateWorkAwardTimes(payload, sentAt, expiresAt);
  } else if (
    payload.type === 'work.accept' ||
    payload.type === 'work.decline'
  ) {
    validateWorkAssignmentResponseTimes(payload, sentAt, expiresAt);
  } else if (
    payload.type === 'work.progress' ||
    payload.type === 'work.checkpoint' ||
    payload.type === 'work.result' ||
    payload.type === 'lease.renew'
  ) {
    validateWorkExecutionTimes(payload, sentAt, expiresAt);
  } else if (
    payload.type === 'work.release' &&
    payload.releaseAuthority === 'assignee'
  ) {
    validateWorkExecutionTimes(payload, sentAt, expiresAt);
  }
}

/**
 * The shared Trust normalizer owns every content-bound Evidence digest. Mesh
 * only supplies the signed envelope material, then compares the projected ID
 * (and Claim assertion digest) with the closed wire payload.
 */
function validateEvidenceTrustBinding(
  tenantId: string,
  meshId: string,
  objectiveId: string | undefined,
  sender: MeshSender,
  causationId: string | undefined,
  payload: MeshMessagePayload
): void {
  if (
    payload.type !== 'evidence.claim' &&
    payload.type !== 'evidence.attest' &&
    payload.type !== 'evidence.challenge' &&
    payload.type !== 'evidence.retract' &&
    payload.type !== 'trust.observation'
  ) {
    return;
  }
  const envelope = {
    schemaVersion: 1 as const,
    tenantId,
    meshId,
    objectiveId: objectiveId ?? null,
    senderPeerId: sender.peerId,
    causationId: causationId ?? null,
  };
  try {
    if (payload.type === 'evidence.claim') {
      const normalized = normalizeMeshEvidenceClaimV1(envelope, {
        subject: payload.subject,
        scope: payload.scope,
        criterionId: payload.criterionId,
        outcome: payload.outcome,
        content: payload.content,
        basisReferences: payload.basisReferences,
        observedAt: payload.observedAt,
      });
      if (normalized.claimId !== payload.claimId) {
        fail('invalid_payload', '$["payload"]["claimId"]');
      }
      if (normalized.assertionDigest !== payload.assertionDigest) {
        fail('invalid_payload', '$["payload"]["assertionDigest"]');
      }
      return;
    }
    if (payload.type === 'evidence.attest') {
      const normalized = normalizeMeshEvidenceAttestationV1(envelope, {
        scope: payload.scope,
        claimId: payload.claimId,
        claimDigest: payload.claimDigest,
        disposition: payload.disposition,
        confidenceBasisPoints: payload.confidenceBasisPoints,
        basisReferences: payload.basisReferences,
        observedAt: payload.observedAt,
      });
      if (normalized.attestationId !== payload.attestationId) {
        fail('invalid_payload', '$["payload"]["attestationId"]');
      }
      return;
    }
    if (payload.type === 'evidence.challenge') {
      const normalized = normalizeMeshEvidenceChallengeV1(envelope, {
        scope: payload.scope,
        targetKind: payload.targetKind,
        targetId: payload.targetId,
        targetDigest: payload.targetDigest,
        reasonCode: payload.reasonCode as TrustReasonCodeV1,
        basisReferences: payload.basisReferences,
        observedAt: payload.observedAt,
      });
      if (normalized.challengeId !== payload.challengeId) {
        fail('invalid_payload', '$["payload"]["challengeId"]');
      }
      return;
    }
    if (payload.type === 'trust.observation') {
      const normalized = normalizeMeshTrustObservationV1(envelope, {
        subject: payload.subject,
        scope: payload.scope,
        policyId: payload.policyId,
        policyVersion: payload.policyVersion,
        policyDigest: payload.policyDigest,
        profileDigest: payload.profileDigest,
        fusionDecisionDigest: payload.fusionDecisionDigest,
        dimensionId: payload.dimensionId,
        scoreBand: payload.scoreBand,
        uncertaintyBand: payload.uncertaintyBand,
        disposition: payload.disposition,
        evidenceIds: payload.evidenceIds,
        observedAt: payload.observedAt,
        validUntil: payload.validUntil,
        reasonCodes: payload.reasonCodes as readonly TrustReasonCodeV1[],
      });
      if (normalized.observationId !== payload.observationId) {
        fail('invalid_payload', '$["payload"]["observationId"]');
      }
      return;
    }
    const normalized = normalizeMeshEvidenceRetractionV1(envelope, {
      scope: payload.scope,
      targetKind: payload.targetKind,
      targetId: payload.targetId,
      targetDigest: payload.targetDigest,
      reasonCode: payload.reasonCode as TrustReasonCodeV1,
      observedAt: payload.observedAt,
    });
    if (normalized.retractionId !== payload.retractionId) {
      fail('invalid_payload', '$["payload"]["retractionId"]');
    }
  } catch (error) {
    if (error instanceof ValidationFailure) throw error;
    fail('invalid_payload', '$["payload"]');
  }
}

function validateWorkOfferTimes(
  payload: WorkOfferPayload,
  sentAt: bigint,
  expiresAt: bigint
): void {
  const bidDeadline = parseRfc3339(
    payload.bidDeadline,
    '$["payload"]["bidDeadline"]'
  );
  const workDeadline = parseRfc3339(
    payload.workDeadline,
    '$["payload"]["workDeadline"]'
  );
  if (bidDeadline <= sentAt) {
    fail('invalid_payload', '$["payload"]["bidDeadline"]');
  }
  if (workDeadline <= bidDeadline) {
    fail('invalid_payload', '$["payload"]["workDeadline"]');
  }
  if (bidDeadline - sentAt > BigInt(maximumWorkBidWindowMs) * 1_000_000n) {
    fail('invalid_payload', '$["payload"]["bidDeadline"]');
  }
  if (workDeadline - sentAt > BigInt(maximumWorkDeadlineMs) * 1_000_000n) {
    fail('invalid_payload', '$["payload"]["workDeadline"]');
  }
  if (expiresAt > bidDeadline) {
    fail('invalid_lifetime', '$["expiresAt"]');
  }
}

function validateWorkBidTimes(
  payload: WorkBidPayload,
  sentAt: bigint,
  expiresAt: bigint
): void {
  const bidExpiresAt = parseRfc3339(
    payload.bidExpiresAt,
    '$["payload"]["bidExpiresAt"]'
  );
  const bidDeadline = parseRfc3339(
    payload.bidDeadline,
    '$["payload"]["bidDeadline"]'
  );
  const expectedCompletionAt = parseRfc3339(
    payload.expectedCompletionAt,
    '$["payload"]["expectedCompletionAt"]'
  );
  const workDeadline = parseRfc3339(
    payload.workDeadline,
    '$["payload"]["workDeadline"]'
  );
  if (bidExpiresAt <= sentAt) {
    fail('invalid_payload', '$["payload"]["bidExpiresAt"]');
  }
  if (bidExpiresAt > bidDeadline) {
    fail('invalid_payload', '$["payload"]["bidExpiresAt"]');
  }
  if (bidDeadline >= expectedCompletionAt) {
    fail('invalid_payload', '$["payload"]["expectedCompletionAt"]');
  }
  if (expectedCompletionAt > workDeadline) {
    fail('invalid_payload', '$["payload"]["expectedCompletionAt"]');
  }
  if (bidDeadline - sentAt > BigInt(maximumWorkBidWindowMs) * 1_000_000n) {
    fail('invalid_payload', '$["payload"]["bidDeadline"]');
  }
  if (workDeadline - sentAt > BigInt(maximumWorkDeadlineMs) * 1_000_000n) {
    fail('invalid_payload', '$["payload"]["workDeadline"]');
  }
  if (expiresAt > bidExpiresAt) {
    fail('invalid_lifetime', '$["expiresAt"]');
  }
}

function validateWorkAwardTimes(
  payload: WorkAwardPayload,
  sentAt: bigint,
  expiresAt: bigint
): void {
  const leaseStartsAt = parseRfc3339(
    payload.leaseStartsAt,
    '$["payload"]["leaseStartsAt"]'
  );
  const acceptanceDeadline = parseRfc3339(
    payload.acceptanceDeadline,
    '$["payload"]["acceptanceDeadline"]'
  );
  const leaseExpiresAt = parseRfc3339(
    payload.leaseExpiresAt,
    '$["payload"]["leaseExpiresAt"]'
  );
  const workDeadline = parseRfc3339(
    payload.workDeadline,
    '$["payload"]["workDeadline"]'
  );
  if (leaseStartsAt < sentAt) {
    fail('invalid_payload', '$["payload"]["leaseStartsAt"]');
  }
  if (acceptanceDeadline <= leaseStartsAt) {
    fail('invalid_payload', '$["payload"]["acceptanceDeadline"]');
  }
  if (leaseExpiresAt < acceptanceDeadline) {
    fail('invalid_payload', '$["payload"]["leaseExpiresAt"]');
  }
  if (workDeadline < leaseExpiresAt) {
    fail('invalid_payload', '$["payload"]["workDeadline"]');
  }
  if (
    acceptanceDeadline - sentAt >
    BigInt(maximumAcceptanceWindowMs) * 1_000_000n
  ) {
    fail('invalid_payload', '$["payload"]["acceptanceDeadline"]');
  }
  if (
    leaseExpiresAt - leaseStartsAt >
    BigInt(maximumLeaseDurationMs) * 1_000_000n
  ) {
    fail('invalid_payload', '$["payload"]["leaseExpiresAt"]');
  }
  if (workDeadline - sentAt > BigInt(maximumWorkDeadlineMs) * 1_000_000n) {
    fail('invalid_payload', '$["payload"]["workDeadline"]');
  }
  if (expiresAt > acceptanceDeadline) {
    fail('invalid_lifetime', '$["expiresAt"]');
  }
}

function validateWorkAssignmentResponseTimes(
  payload: WorkAcceptPayload | WorkDeclinePayload,
  sentAt: bigint,
  expiresAt: bigint
): void {
  const acceptanceDeadline = parseRfc3339(
    payload.acceptanceDeadline,
    '$["payload"]["acceptanceDeadline"]'
  );
  if (sentAt >= acceptanceDeadline) {
    fail('invalid_payload', '$["payload"]["acceptanceDeadline"]');
  }
  if (expiresAt > acceptanceDeadline) {
    fail('invalid_lifetime', '$["expiresAt"]');
  }
}

function validateWorkExecutionTimes(
  payload:
    | WorkProgressPayload
    | WorkCheckpointPayload
    | WorkResultPayload
    | WorkReleasePayload
    | LeaseRenewPayload,
  sentAt: bigint,
  expiresAt: bigint
): void {
  const leaseExpiresAt = parseRfc3339(
    payload.leaseExpiresAt,
    '$["payload"]["leaseExpiresAt"]'
  );
  if (sentAt >= leaseExpiresAt) {
    fail('invalid_payload', '$["payload"]["leaseExpiresAt"]');
  }
  if (expiresAt > leaseExpiresAt) {
    fail('invalid_lifetime', '$["expiresAt"]');
  }
}

function validateRevisionPredecessor(
  revision: number,
  predecessor: string | undefined,
  path: string
): void {
  if (revision === 1 && predecessor !== undefined) {
    fail('invalid_payload', path);
  }
  if (revision > 1 && predecessor === undefined) {
    fail('invalid_payload', path);
  }
}

function assertBoundedValidity(validFrom: bigint, validUntil: bigint): void {
  if (validUntil <= validFrom) {
    fail('invalid_payload', '$["payload"]["validUntil"]');
  }
  if (
    validUntil - validFrom >
    BigInt(maximumAdvertisementValidityMs) * 1_000_000n
  ) {
    fail('invalid_payload', '$["payload"]["validUntil"]');
  }
}

function assertObjectiveValidity(
  validFrom: bigint,
  validUntil: bigint
): bigint {
  if (validUntil <= validFrom) {
    fail('invalid_payload', '$["payload"]["validUntil"]');
  }
  const duration = validUntil - validFrom;
  if (duration > BigInt(maximumObjectiveValidityMs) * 1_000_000n) {
    fail('invalid_payload', '$["payload"]["validUntil"]');
  }
  return duration;
}

function assertRfc3339PayloadTimestamp(
  input: unknown,
  path: string
): { readonly text: string; readonly instant: bigint } {
  const text = assertString(input, path, 'invalid_payload');
  try {
    return { text, instant: parseRfc3339(text, path) };
  } catch (error) {
    if (error instanceof ValidationFailure) {
      fail('invalid_payload', path);
    }
    throw error;
  }
}

function validateProtocolVersions(input: unknown): readonly number[] {
  const path = '$["payload"]["protocolVersions"]';
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > maximumProtocolVersions
  ) {
    fail('invalid_payload', path);
  }
  let previous: number | undefined;
  let includesCurrentWireVersion = false;
  const result: number[] = [];
  for (const [index, value] of input.entries()) {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      (previous !== undefined && value <= previous)
    ) {
      fail('invalid_payload', `${path}[${index}]`);
    }
    if (value === MESH_WIRE_VERSION) includesCurrentWireVersion = true;
    previous = value;
    result.push(value);
  }
  if (!includesCurrentWireVersion) {
    fail('invalid_payload', path);
  }
  return result;
}

function validateIdentifierArray(
  input: unknown,
  path: string,
  maximumItems: number,
  limits: Readonly<MeshProtocolLimits>
): readonly string[] {
  if (!Array.isArray(input) || input.length > maximumItems) {
    fail('invalid_payload', path);
  }
  let previous: string | undefined;
  const result: string[] = [];
  for (const [index, value] of input.entries()) {
    const itemPath = `${path}[${index}]`;
    const identifier = assertIdentifier(value, itemPath, limits);
    if (
      previous !== undefined &&
      compareUtf16CodeUnits(identifier, previous) !== 1
    ) {
      fail('invalid_payload', itemPath);
    }
    previous = identifier;
    result.push(identifier);
  }
  return result;
}

function validateBoundedStringArray(
  input: unknown,
  path: string,
  maximumItems: number,
  maximumItemBytes: number,
  maximumAggregateBytes?: number,
  sortedUnique = false
): readonly string[] {
  if (!Array.isArray(input) || input.length > maximumItems) {
    fail('invalid_payload', path);
  }
  let aggregateBytes = 0;
  let previous: string | undefined;
  const result: string[] = [];
  for (const [index, value] of input.entries()) {
    const itemPath = `${path}[${index}]`;
    const item = assertBoundedString(value, itemPath, maximumItemBytes);
    if (
      sortedUnique &&
      previous !== undefined &&
      compareUtf16CodeUnits(item, previous) !== 1
    ) {
      fail('invalid_payload', itemPath);
    }
    aggregateBytes += utf8Encoder.encode(item).byteLength;
    if (
      maximumAggregateBytes !== undefined &&
      aggregateBytes > maximumAggregateBytes
    ) {
      fail('invalid_payload', path);
    }
    previous = item;
    result.push(item);
  }
  return result;
}

/**
 * Compares raw UTF-16 code units lexicographically, matching JavaScript string
 * relational ordering and the property-name ordering used by JCS/RFC 8785.
 */
function compareUtf16CodeUnits(left: string, right: string): -1 | 0 | 1 {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftCodeUnit = left.charCodeAt(index);
    const rightCodeUnit = right.charCodeAt(index);
    if (leftCodeUnit < rightCodeUnit) return -1;
    if (leftCodeUnit > rightCodeUnit) return 1;
  }
  if (left.length < right.length) return -1;
  if (left.length > right.length) return 1;
  return 0;
}

function validateAttributes(
  input: unknown,
  path = '$["payload"]["attributes"]'
): Readonly<Record<string, string>> {
  const attributes = assertRecord(input, path, 'invalid_payload');
  const keys = Object.keys(attributes);
  if (keys.length > maximumAttributes) {
    fail('invalid_payload', path);
  }
  let aggregateBytes = 0;
  const result: Record<string, string> = {};
  for (const key of keys) {
    const keyPath = `${path}[${JSON.stringify(key)}]`;
    if (
      key.length === 0 ||
      utf8Encoder.encode(key).byteLength > maximumAttributeKeyBytes
    ) {
      fail('invalid_payload', keyPath);
    }
    const value = assertBoundedString(
      attributes[key],
      keyPath,
      maximumAttributeValueBytes
    );
    aggregateBytes +=
      utf8Encoder.encode(key).byteLength + utf8Encoder.encode(value).byteLength;
    if (aggregateBytes > maximumAttributesBytes) {
      fail('invalid_payload', path);
    }
    Object.defineProperty(result, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function assertBoundedString(
  input: unknown,
  path: string,
  maximumBytes: number
): string {
  const value = assertString(input, path, 'invalid_payload');
  if (
    value.length === 0 ||
    utf8Encoder.encode(value).byteLength > maximumBytes
  ) {
    fail('invalid_payload', path);
  }
  return value;
}

function validateLifetime(
  type: MeshMessagePayload['type'],
  sentAt: bigint,
  expiresAt: bigint,
  limits: Readonly<MeshProtocolLimits>
): void {
  if (expiresAt <= sentAt) {
    fail('invalid_lifetime', '$["expiresAt"]');
  }
  const messageMaximum =
    type === 'peer.ping' || type === 'peer.ping_ack'
      ? 30_000
      : type === 'evidence.claim' ||
          type === 'evidence.attest' ||
          type === 'evidence.challenge' ||
          type === 'evidence.retract' ||
          type === 'trust.observation'
        ? maximumEvidenceLifetimeMs
        : type === 'peer.goodbye' ||
            type === 'lease.takeover_proposal' ||
            type === 'lease.vote' ||
            type === 'lease.certificate'
          ? 60_000
          : type === 'objective.announce' || type === 'objective.revise'
            ? 5 * 60_000
            : type === 'work.progress' ||
                type === 'work.checkpoint' ||
                type === 'work.result'
              ? maximumWorkExecutionLifetimeMs
              : type === 'lease.renew'
                ? 30_000
                : 120_000;
  const maximum = Math.min(limits.maximumLifetimeMs, messageMaximum);
  if (expiresAt - sentAt > BigInt(maximum) * 1_000_000n) {
    fail('invalid_lifetime', '$["expiresAt"]');
  }
}

function assertPayloadType<T extends MeshMessagePayload['type']>(
  input: unknown,
  expected: T
): T {
  if (typeof input !== 'string') {
    fail('invalid_payload', '$["payload"]["type"]');
  }
  if (input !== expected) {
    fail('type_payload_mismatch', '$["payload"]["type"]');
  }
  return expected;
}

function assertPayloadHash(input: unknown, path: string): string {
  const value = assertString(input, path, 'invalid_payload_hash');
  if (
    !value.startsWith('sha256:') ||
    !isCanonicalBase64Url(value.slice('sha256:'.length), 32)
  ) {
    fail('invalid_payload_hash', path);
  }
  return value;
}

function assertContentDigest(input: unknown, path: string): string {
  const value = assertString(input, path, 'invalid_payload');
  if (
    !value.startsWith('sha256:') ||
    !isCanonicalBase64Url(value.slice('sha256:'.length), 32)
  ) {
    fail('invalid_payload', path);
  }
  return value;
}

function assertMessageId(input: unknown, path: string): string {
  const value = assertString(input, path, 'invalid_message_id');
  if (!isCanonicalBase64Url(value, 16)) {
    fail('invalid_message_id', path);
  }
  return value;
}

function assertIdentifier(
  input: unknown,
  path: string,
  limits: Readonly<MeshProtocolLimits>
): string {
  const value = assertString(input, path, 'invalid_identifier');
  if (value.length > limits.maximumIdBytes || !identifierPattern.test(value)) {
    fail('invalid_identifier', path);
  }
  return value;
}

function assertPositiveSafeInteger(
  input: unknown,
  path: string,
  code: MeshProtocolErrorCode = 'invalid_sequence'
): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) {
    fail(code, path);
  }
  return input;
}

function assertNonnegativeSafeInteger(input: unknown, path: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) {
    fail('invalid_payload', path);
  }
  return input;
}

function assertBoundedPositiveSafeInteger(
  input: unknown,
  path: string,
  maximum: number
): number {
  const value = assertPositiveSafeInteger(input, path, 'invalid_payload');
  if (value > maximum) {
    fail('invalid_payload', path);
  }
  return value;
}

function assertString(
  input: unknown,
  path: string,
  code: MeshProtocolErrorCode = 'invalid_payload'
): string {
  if (typeof input !== 'string') fail(code, path);
  return input;
}

function assertClosedRecord(
  input: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  path: string,
  code: MeshProtocolErrorCode
): Record<string, unknown> {
  const record = assertRecord(input, path, code);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail(code, `${path}[${JSON.stringify(key)}]`);
    }
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(record, key)) {
      fail(code, `${path}[${JSON.stringify(key)}]`);
    }
  }
  return record;
}

function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  path: string,
  code: MeshProtocolErrorCode
): void {
  const expected = new Set(keys);
  const actual = Object.keys(record);
  if (
    actual.length !== expected.size ||
    actual.some((key) => !expected.has(key))
  ) {
    fail(code, path);
  }
}

function assertRecord(
  input: unknown,
  path: string,
  code: MeshProtocolErrorCode
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail(code, path);
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(code, path);
  }
  const names = Object.getOwnPropertyNames(input);
  if (
    Object.getOwnPropertySymbols(input).length > 0 ||
    names.some((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      return !descriptor || !descriptor.enumerable || !('value' in descriptor);
    })
  ) {
    fail(code, path);
  }
  return input as Record<string, unknown>;
}

function parseRfc3339(input: string, path: string): bigint {
  const match = rfc3339Pattern.exec(input);
  if (!match) return fail('invalid_timestamp', path);
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText = '',
    zone,
    offsetSign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return fail('invalid_timestamp', path);
  }
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const offsetHours = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetHours > 23 || offsetMinute > 59) {
      return fail('invalid_timestamp', path);
    }
    offsetMinutes =
      (offsetHours * 60 + offsetMinute) * (offsetSign === '+' ? 1 : -1);
  }
  const milliseconds =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    offsetMinutes * 60_000;
  const fractionNanoseconds = BigInt(fractionText.padEnd(9, '0'));
  return BigInt(milliseconds) * 1_000_000n + fractionNanoseconds;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isCanonicalBase64Url(value: string, expectedBytes: number): boolean {
  const expectedCharacters = Math.ceil((expectedBytes * 8) / 6);
  if (value.length !== expectedCharacters || !base64UrlPattern.test(value)) {
    return false;
  }
  const significantBits = (expectedBytes * 8) % 6;
  if (significantBits === 0) return true;
  const finalIndex = base64UrlAlphabet.indexOf(value[value.length - 1]);
  const unusedBits = 6 - significantBits;
  return (finalIndex & ((1 << unusedBits) - 1)) === 0;
}

function isImplementedMessageType(
  value: string
): value is MeshMessagePayload['type'] {
  return (
    value === 'peer.hello' ||
    value === 'peer.card' ||
    value === 'peer.ping' ||
    value === 'peer.ping_ack' ||
    value === 'peer.goodbye' ||
    value === 'capability.advertise' ||
    value === 'capability.withdraw' ||
    value === 'objective.announce' ||
    value === 'objective.revise' ||
    value === 'objective.cancel' ||
    value === 'work.offer' ||
    value === 'work.bid' ||
    value === 'work.award' ||
    value === 'work.accept' ||
    value === 'work.decline' ||
    value === 'work.progress' ||
    value === 'work.checkpoint' ||
    value === 'work.result' ||
    value === 'work.release' ||
    value === 'work.cancel' ||
    value === 'lease.renew' ||
    value === 'lease.takeover_proposal' ||
    value === 'lease.vote' ||
    value === 'lease.certificate' ||
    value === 'evidence.claim' ||
    value === 'evidence.attest' ||
    value === 'evidence.challenge' ||
    value === 'evidence.retract' ||
    value === 'trust.observation'
  );
}

function canonicalizeMeshJsonInternal(
  input: unknown,
  options: MeshProtocolOptions
):
  | {
      readonly ok: true;
      readonly value: string;
      readonly bytes: Uint8Array;
    }
  | {
      readonly ok: false;
      readonly issues: readonly MeshProtocolIssue[];
    } {
  const limits = resolveLimits(options.limits);
  const result = canonicalizeJsonValue(
    input,
    strictLimits(limits),
    limits.maximumEnvelopeBytes
  );
  return result.ok
    ? result
    : {
        ok: false,
        issues: [{ code: result.code, path: result.path }],
      };
}

function resolveLimits(
  overrides: Partial<MeshProtocolLimits> | undefined
): Readonly<MeshProtocolLimits> {
  const result = {
    ...DEFAULT_MESH_PROTOCOL_LIMITS,
  } as Record<keyof MeshProtocolLimits, number>;
  if (overrides) {
    for (const key of Object.keys(overrides) as (keyof MeshProtocolLimits)[]) {
      const value = overrides[key];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
        throw new RangeError(`Invalid Mesh protocol limit: ${key}`);
      }
      if (value !== undefined) result[key] = value;
    }
  }
  return Object.freeze(result);
}

function strictLimits(limits: Readonly<MeshProtocolLimits>): StrictJsonLimits {
  return {
    maximumEnvelopeBytes: limits.maximumEnvelopeBytes,
    maximumNestingDepth: limits.maximumNestingDepth,
    maximumTotalObjectKeys: limits.maximumTotalObjectKeys,
    maximumObjectKeys: limits.maximumObjectKeys,
    maximumTotalArrayItems: limits.maximumTotalArrayItems,
    maximumArrayItems: limits.maximumArrayItems,
    maximumStringBytes: limits.maximumStringBytes,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function prefixPath(prefix: string, nested: string): string {
  return nested === '$' ? prefix : `${prefix}${nested.slice(1)}`;
}

function success<T>(value: T): MeshProtocolResult<T> {
  return { ok: true, value };
}

function failure<T = never>(
  code: MeshProtocolErrorCode,
  path: string
): MeshProtocolResult<T> {
  return { ok: false, issues: [{ code, path: boundIssuePath(path) }] };
}

function validationFailure<T>(error: unknown): MeshProtocolResult<T> {
  if (error instanceof ValidationFailure) {
    return failure(error.code, error.path);
  }
  return failure('invalid_json_value', '$');
}

function fail(code: MeshProtocolErrorCode, path: string): never {
  throw new ValidationFailure(code, path);
}

function boundIssuePath(path: string): string {
  if (path.length <= maximumIssuePathLength) return path;
  let end = maximumIssuePathLength - 3;
  const finalCodeUnit = path.charCodeAt(end - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) end -= 1;
  return `${path.slice(0, end)}...`;
}
