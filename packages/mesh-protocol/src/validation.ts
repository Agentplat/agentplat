import { canonicalizeJsonValue } from './canonical-json.js';
import {
  DEFAULT_MESH_PROTOCOL_LIMITS,
  MESH_AUDIENCE_TOPICS,
  MESH_MESSAGE_TYPES,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  type MeshAudience,
  type MeshAudienceTopic,
  type MeshEnvelope,
  type MeshEnvelopeContext,
  type MeshJsonValue,
  type MeshMessagePayload,
  type MeshProtocolErrorCode,
  type MeshProtocolIssue,
  type MeshProtocolLimits,
  type MeshProtocolOptions,
  type MeshProtocolResult,
  type MeshSigningDocument,
  type PeerHelloPayload,
  type PeerPingAckPayload,
  type PeerPingPayload,
  type SignedMeshEnvelope,
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

/**
 * Parses and statically validates one complete Alpha 1 envelope.
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
  if (!isAlphaOneMessageType(type)) {
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
  validateMessageSpecificEnvelope(type, audience, objectiveId, causationId);

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
  const payload = assertClosedRecord(
    input,
    ['type'],
    [],
    '$["payload"]',
    'invalid_payload'
  );
  const result: PeerPingAckPayload = {
    type: assertPayloadType(payload.type, 'peer.ping_ack'),
  };
  return result;
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
  audience: MeshAudience,
  objectiveId: string | undefined,
  causationId: string | undefined
): void {
  if (type === 'peer.hello') {
    if (audience.kind === 'mesh' && audience.topic !== 'membership') {
      fail('invalid_audience', '$["audience"]["topic"]');
    }
    return;
  }
  if (audience.kind !== 'peer') {
    fail('invalid_audience', '$["audience"]');
  }
  if (objectiveId !== undefined) {
    fail('invalid_payload', '$["objectiveId"]');
  }
  if (type === 'peer.ping_ack' && causationId === undefined) {
    fail('invalid_payload', '$["causationId"]');
  }
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
  const messageMaximum = type === 'peer.hello' ? 120_000 : 30_000;
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

function isAlphaOneMessageType(
  value: string
): value is MeshMessagePayload['type'] {
  return (
    value === 'peer.hello' || value === 'peer.ping' || value === 'peer.ping_ack'
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
