import {
  MESH_SUPPORTED_WIRE_VERSIONS,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  canonicalizeMeshPayload,
  canonicalizeMeshSigningDocument,
  compareMeshTimestamps,
  validateSignedMeshEnvelope,
  type MeshEnvelope,
  type MeshMessagePayload,
  type MeshWireVersion,
  type SignedMeshEnvelope,
  type VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';

import { decodeBase64Url, encodeBase64Url } from './base64url.js';
import {
  MeshCryptoError,
  type MeshCryptoPolicy,
  type MeshCryptoRejectionCode,
  type MeshDigestRequest,
  type MeshEnvelopeSigner,
  type MeshEnvelopeVerifier,
  type MeshKeyRecord,
  type MeshSignRequest,
  type MeshSigningPolicy,
  type MeshVerificationResult,
  type MeshVerifyRequest,
  type WebCryptoMeshEnvelopeSignerOptions,
} from './contracts.js';

const placeholderPayloadHash =
  'sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const placeholderSignature =
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Strict default policy for the reference cryptographic suite. */
export const DEFAULT_MESH_CRYPTO_POLICY: Readonly<MeshCryptoPolicy> =
  Object.freeze({
    allowedAlgorithms: Object.freeze([MESH_SIGNATURE_ALGORITHM]),
    allowedWireVersions: MESH_SUPPORTED_WIRE_VERSIONS,
  });

/** Strict outbound default: only the current wire version may be signed. */
export const DEFAULT_MESH_SIGNING_POLICY: Readonly<MeshSigningPolicy> =
  Object.freeze({
    allowedWireVersions: Object.freeze([MESH_WIRE_VERSION]),
  });

/** Computes the canonical SHA-256 payload representation. */
export async function computeMeshPayloadHash<
  TPayload extends MeshMessagePayload,
>(request: MeshDigestRequest<TPayload>): Promise<string> {
  try {
    return await computeMeshPayloadHashInternal(request);
  } catch (error) {
    throw normalizeCryptoError(error);
  }
}

async function computeMeshPayloadHashInternal<
  TPayload extends MeshMessagePayload,
>(request: MeshDigestRequest<TPayload>): Promise<string> {
  if (!request || typeof request !== 'object') {
    throw new MeshCryptoError('invalid_envelope');
  }
  const crypto = resolveCrypto(request.crypto);
  const payloadBytes = canonicalizeMeshPayload(
    request.payload,
    request.protocolOptions
  );
  if (!payloadBytes.ok) throw new MeshCryptoError('invalid_envelope');
  let digest: Uint8Array;
  try {
    digest = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        copyToArrayBuffer(payloadBytes.value)
      )
    );
  } catch {
    throw new MeshCryptoError('crypto_operation_failed');
  }
  if (digest.byteLength !== 32) {
    throw new MeshCryptoError('crypto_operation_failed');
  }
  return `sha256:${encodeBase64Url(digest)}`;
}

/** Hashes, constructs and signs one structurally valid outbound envelope. */
export async function signMeshEnvelope<
  TPayload extends MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
>(
  request: MeshSignRequest<TPayload, TWireVersion>
): Promise<SignedMeshEnvelope<TPayload, TWireVersion>> {
  try {
    return await signMeshEnvelopeInternal(request, DEFAULT_MESH_SIGNING_POLICY);
  } catch (error) {
    throw normalizeCryptoError(error);
  }
}

async function signMeshEnvelopeInternal<
  TPayload extends MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
>(
  request: MeshSignRequest<TPayload, TWireVersion>,
  signingPolicy: Readonly<MeshSigningPolicy>
): Promise<SignedMeshEnvelope<TPayload, TWireVersion>> {
  if (!request || typeof request !== 'object') {
    throw new MeshCryptoError('invalid_envelope');
  }
  const inputEnvelope = request.envelope;
  const privateKey = request.privateKey;
  const injectedCrypto = request.crypto;
  const protocolOptions = snapshotProtocolOptions(request.protocolOptions);
  if (
    !inputEnvelope ||
    typeof inputEnvelope !== 'object' ||
    !inputEnvelope.proof ||
    typeof inputEnvelope.proof !== 'object'
  ) {
    throw new MeshCryptoError('invalid_envelope');
  }
  if (inputEnvelope.proof.algorithm !== MESH_SIGNATURE_ALGORITHM) {
    throw new MeshCryptoError('unsupported_algorithm');
  }
  if (!signingPolicy.allowedWireVersions.includes(inputEnvelope.wireVersion)) {
    throw new MeshCryptoError('unsupported_wire_version');
  }
  if (!isEd25519Key(privateKey, 'private', 'sign')) {
    throw new MeshCryptoError('invalid_private_key');
  }
  const inputValidation = validateSignedMeshEnvelope(
    {
      ...inputEnvelope,
      payloadHash: placeholderPayloadHash,
      proof: {
        ...inputEnvelope.proof,
        value: placeholderSignature,
      },
    },
    protocolOptions
  );
  if (!inputValidation.ok) {
    throw new MeshCryptoError('invalid_envelope');
  }
  const envelopeSnapshot = inputValidation.value as SignedMeshEnvelope<
    TPayload,
    TWireVersion
  >;
  const crypto = resolveCrypto(injectedCrypto);
  const payloadHash = await computeMeshPayloadHash({
    payload: envelopeSnapshot.payload,
    crypto,
    protocolOptions,
  });
  const structuralCandidate: MeshEnvelope<TPayload, TWireVersion> = {
    ...envelopeSnapshot,
    payloadHash,
  };
  const structuralValidation = validateSignedMeshEnvelope(
    structuralCandidate,
    protocolOptions
  );
  if (!structuralValidation.ok) {
    throw new MeshCryptoError('invalid_envelope');
  }
  const structuralEnvelope = structuralValidation.value as SignedMeshEnvelope<
    TPayload,
    TWireVersion
  >;
  const signingBytes = canonicalizeMeshSigningDocument(
    structuralEnvelope,
    protocolOptions
  );
  if (!signingBytes.ok) throw new MeshCryptoError('invalid_envelope');

  let signature: Uint8Array;
  try {
    signature = new Uint8Array(
      await crypto.subtle.sign(
        MESH_SIGNATURE_ALGORITHM,
        privateKey,
        copyToArrayBuffer(signingBytes.value)
      )
    );
  } catch {
    throw new MeshCryptoError('crypto_operation_failed');
  }
  if (signature.byteLength !== 64) {
    throw new MeshCryptoError('crypto_operation_failed');
  }

  const signedCandidate: MeshEnvelope<TPayload, TWireVersion> = {
    ...structuralEnvelope,
    proof: {
      ...structuralEnvelope.proof,
      value: encodeBase64Url(signature),
    },
  };
  const signedValidation = validateSignedMeshEnvelope(
    signedCandidate,
    protocolOptions
  );
  if (!signedValidation.ok) throw new MeshCryptoError('invalid_envelope');
  return signedValidation.value as SignedMeshEnvelope<TPayload, TWireVersion>;
}

/** Verifies digest, proof, key binding, validity and revocation fail-closed. */
export async function verifyMeshEnvelope<
  TPayload extends MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
>(
  request: MeshVerifyRequest<TPayload, TWireVersion>
): Promise<MeshVerificationResult<TPayload, TWireVersion>> {
  try {
    return await verifyMeshEnvelopeInternal(request);
  } catch (error) {
    return rejection(
      error instanceof MeshCryptoError ? error.code : 'crypto_operation_failed'
    );
  }
}

async function verifyMeshEnvelopeInternal<
  TPayload extends MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
>(
  request: MeshVerifyRequest<TPayload, TWireVersion>
): Promise<MeshVerificationResult<TPayload, TWireVersion>> {
  if (!request || typeof request !== 'object') {
    return rejection('invalid_envelope');
  }
  const inputEnvelope = request.envelope;
  if (!inputEnvelope || typeof inputEnvelope !== 'object') {
    return rejection('invalid_envelope');
  }
  const resolver = request.resolver;
  const allowedAlgorithms = Array.from(request.policy.allowedAlgorithms);
  const verifiedAt = request.verifiedAt;
  const injectedCrypto = request.crypto;
  const protocolOptions = snapshotProtocolOptions(request.protocolOptions);
  const structuralValidation = validateSignedMeshEnvelope(
    inputEnvelope,
    protocolOptions
  );
  if (!structuralValidation.ok) return rejection('invalid_envelope');
  const envelope = structuralValidation.value as SignedMeshEnvelope<
    TPayload,
    TWireVersion
  >;
  const allowedWireVersions = snapshotWireVersions(
    request.policy.allowedWireVersions ?? MESH_SUPPORTED_WIRE_VERSIONS
  );
  if (!allowedWireVersions.includes(envelope.wireVersion)) {
    return rejection('unsupported_wire_version');
  }
  if (
    envelope.proof.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !allowedAlgorithms.includes(envelope.proof.algorithm)
  ) {
    return rejection('unsupported_algorithm');
  }
  if (!compareMeshTimestamps(verifiedAt, verifiedAt).ok) {
    return rejection('invalid_verification_time');
  }

  let resolvedKey: MeshKeyRecord | undefined;
  try {
    resolvedKey = resolver.resolve({
      tenantId: envelope.tenantId,
      meshId: envelope.meshId,
      peerId: envelope.sender.peerId,
      keyId: envelope.proof.keyId,
      algorithm: envelope.proof.algorithm,
    });
  } catch {
    return rejection('key_resolution_failed');
  }
  if (!resolvedKey) return rejection('key_not_found');
  if (isPromiseLike(resolvedKey)) return rejection('invalid_key_record');
  let key: MeshKeyRecord;
  try {
    key = Object.freeze({ ...resolvedKey });
  } catch {
    return rejection('invalid_key_record');
  }
  if (!isEd25519Key(key.publicKey, 'public', 'verify')) {
    return rejection('invalid_key_material');
  }

  let payloadHash: string;
  try {
    payloadHash = await computeMeshPayloadHash({
      payload: envelope.payload,
      crypto: injectedCrypto,
      protocolOptions,
    });
  } catch (error) {
    return rejection(
      error instanceof MeshCryptoError ? error.code : 'crypto_operation_failed'
    );
  }
  if (payloadHash !== envelope.payloadHash) {
    return rejection('payload_hash_mismatch');
  }

  const signature = decodeBase64Url(envelope.proof.value, 64);
  const signingBytes = canonicalizeMeshSigningDocument(
    envelope,
    protocolOptions
  );
  if (!signature || !signingBytes.ok) return rejection('invalid_envelope');
  const crypto = optionalCrypto(injectedCrypto);
  if (!crypto) return rejection('crypto_unavailable');

  let signatureValid: unknown;
  try {
    signatureValid = await crypto.subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      copyToArrayBuffer(signature),
      copyToArrayBuffer(signingBytes.value)
    );
  } catch {
    return rejection('crypto_operation_failed');
  }
  if (signatureValid !== true) return rejection('signature_invalid');

  const keyState = validateKeyState(
    key,
    envelope.tenantId,
    envelope.meshId,
    envelope.sender.peerId,
    envelope.proof.keyId,
    envelope.proof.algorithm,
    verifiedAt
  );
  if (keyState) return rejection(keyState);

  return {
    verified: true,
    envelope: envelope as VerifiedMeshEnvelope<TPayload, TWireVersion>,
    key,
  };
}

/** Imports one extractable raw 32-byte Ed25519 public key. */
export async function importMeshEd25519PublicKey(
  rawKey: Uint8Array,
  injectedCrypto?: Crypto
): Promise<CryptoKey> {
  if (!(rawKey instanceof Uint8Array) || rawKey.byteLength !== 32) {
    throw new MeshCryptoError('invalid_public_key');
  }
  try {
    const crypto = resolveCrypto(injectedCrypto);
    const key = await crypto.subtle.importKey(
      'raw',
      copyToArrayBuffer(rawKey),
      { name: MESH_SIGNATURE_ALGORITHM },
      true,
      ['verify']
    );
    if (!isEd25519Key(key, 'public', 'verify')) {
      throw new MeshCryptoError('invalid_public_key');
    }
    return key;
  } catch (error) {
    throw normalizeCryptoError(error);
  }
}

/** Exports one Ed25519 public key as an independent 32-byte raw value. */
export async function exportMeshEd25519PublicKey(
  publicKey: CryptoKey,
  injectedCrypto?: Crypto
): Promise<Uint8Array> {
  if (!isEd25519Key(publicKey, 'public', 'verify')) {
    throw new MeshCryptoError('invalid_public_key');
  }
  try {
    const crypto = resolveCrypto(injectedCrypto);
    const rawKey = new Uint8Array(
      await crypto.subtle.exportKey('raw', publicKey)
    );
    if (rawKey.byteLength !== 32) {
      throw new MeshCryptoError('invalid_public_key');
    }
    return rawKey.slice();
  } catch (error) {
    throw normalizeCryptoError(error);
  }
}

/** Reference Web Crypto signer implementation. */
export class WebCryptoMeshEnvelopeSigner implements MeshEnvelopeSigner {
  readonly #signingPolicy: Readonly<MeshSigningPolicy>;

  constructor(options: WebCryptoMeshEnvelopeSignerOptions = {}) {
    this.#signingPolicy = snapshotSigningPolicy(options.signingPolicy);
  }

  sign<
    TPayload extends MeshMessagePayload,
    TWireVersion extends MeshWireVersion = MeshWireVersion,
  >(
    request: MeshSignRequest<TPayload, TWireVersion>
  ): Promise<SignedMeshEnvelope<TPayload, TWireVersion>> {
    return signMeshEnvelopeWithPolicy(request, this.#signingPolicy);
  }
}

/** Reference Web Crypto verifier implementation. */
export class WebCryptoMeshEnvelopeVerifier implements MeshEnvelopeVerifier {
  verify<
    TPayload extends MeshMessagePayload,
    TWireVersion extends MeshWireVersion = MeshWireVersion,
  >(
    request: MeshVerifyRequest<TPayload, TWireVersion>
  ): Promise<MeshVerificationResult<TPayload, TWireVersion>> {
    return verifyMeshEnvelope(request);
  }
}

/** Creates the reference signer without requiring `new`. */
export function createWebCryptoMeshEnvelopeSigner(
  options: WebCryptoMeshEnvelopeSignerOptions = {}
): WebCryptoMeshEnvelopeSigner {
  return new WebCryptoMeshEnvelopeSigner(options);
}

/** Creates the reference verifier without requiring `new`. */
export function createWebCryptoMeshEnvelopeVerifier(): WebCryptoMeshEnvelopeVerifier {
  return new WebCryptoMeshEnvelopeVerifier();
}

function validateKeyState(
  key: MeshKeyRecord,
  tenantId: string,
  meshId: string,
  peerId: string,
  keyId: string,
  algorithm: typeof MESH_SIGNATURE_ALGORITHM,
  verifiedAt: string
): MeshCryptoRejectionCode | undefined {
  if (
    key.tenantId !== tenantId ||
    key.meshId !== meshId ||
    key.peerId !== peerId ||
    key.keyId !== keyId ||
    key.algorithm !== algorithm
  ) {
    return 'key_binding_mismatch';
  }
  const from = compareMeshTimestamps(verifiedAt, key.validFrom);
  const until = compareMeshTimestamps(verifiedAt, key.validUntil);
  const interval = compareMeshTimestamps(key.validFrom, key.validUntil);
  if (!from.ok || !until.ok || !interval.ok || interval.value >= 0) {
    return 'invalid_key_record';
  }
  if (from.value < 0) return 'key_not_yet_valid';
  if (until.value >= 0) return 'key_expired';
  if (
    key.revokedAt !== undefined &&
    !compareMeshTimestamps(key.revokedAt, key.revokedAt).ok
  ) {
    return 'invalid_key_record';
  }
  if (key.status !== 'active' && key.status !== 'revoked') {
    return 'invalid_key_record';
  }
  if (key.status === 'active' && key.revokedAt !== undefined) {
    return 'invalid_key_record';
  }
  if (key.status === 'revoked') {
    if (key.revokedAt === undefined) return 'invalid_key_record';
    const revokedAfterStart = compareMeshTimestamps(
      key.revokedAt,
      key.validFrom
    );
    const revokedBeforeEnd = compareMeshTimestamps(
      key.revokedAt,
      key.validUntil
    );
    if (
      !revokedAfterStart.ok ||
      !revokedBeforeEnd.ok ||
      revokedAfterStart.value < 0 ||
      revokedBeforeEnd.value >= 0
    ) {
      return 'invalid_key_record';
    }
    return 'key_revoked';
  }
  return undefined;
}

function isEd25519Key(key: CryptoKey, type: KeyType, usage: KeyUsage): boolean {
  try {
    return (
      !!key &&
      key.type === type &&
      key.algorithm?.name === MESH_SIGNATURE_ALGORITHM &&
      Array.from(key.usages).includes(usage)
    );
  } catch {
    return false;
  }
}

function resolveCrypto(injected: Crypto | undefined): Crypto {
  const crypto = optionalCrypto(injected);
  if (!crypto) throw new MeshCryptoError('crypto_unavailable');
  return crypto;
}

function optionalCrypto(injected: Crypto | undefined): Crypto | undefined {
  const candidate =
    injected ?? (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
  return candidate?.subtle ? candidate : undefined;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function snapshotProtocolOptions(
  options: MeshSignRequest['protocolOptions']
): MeshSignRequest['protocolOptions'] {
  if (options === undefined) return undefined;
  return Object.freeze({
    ...(options.limits === undefined
      ? {}
      : { limits: Object.freeze({ ...options.limits }) }),
    ...(options.acceptedWireVersions === undefined
      ? {}
      : {
          acceptedWireVersions: Object.freeze([
            ...options.acceptedWireVersions,
          ]),
        }),
  });
}

async function signMeshEnvelopeWithPolicy<
  TPayload extends MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
>(
  request: MeshSignRequest<TPayload, TWireVersion>,
  signingPolicy: Readonly<MeshSigningPolicy>
): Promise<SignedMeshEnvelope<TPayload, TWireVersion>> {
  try {
    return await signMeshEnvelopeInternal(request, signingPolicy);
  } catch (error) {
    throw normalizeCryptoError(error);
  }
}

function snapshotSigningPolicy(
  policy: MeshSigningPolicy | undefined
): Readonly<MeshSigningPolicy> {
  return Object.freeze({
    allowedWireVersions: snapshotWireVersions(
      policy?.allowedWireVersions ??
        DEFAULT_MESH_SIGNING_POLICY.allowedWireVersions
    ),
  });
}

function snapshotWireVersions(
  versions: readonly MeshWireVersion[]
): readonly MeshWireVersion[] {
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new MeshCryptoError('unsupported_wire_version');
  }
  const result: MeshWireVersion[] = [];
  for (const version of versions) {
    if (
      !MESH_SUPPORTED_WIRE_VERSIONS.includes(version) ||
      result.includes(version)
    ) {
      throw new MeshCryptoError('unsupported_wire_version');
    }
    result.push(version);
  }
  return Object.freeze(result);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  try {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { then?: unknown }).then === 'function'
    );
  } catch {
    return true;
  }
}

function normalizeCryptoError(error: unknown): MeshCryptoError {
  return error instanceof MeshCryptoError
    ? error
    : new MeshCryptoError('crypto_operation_failed');
}

function rejection(code: MeshCryptoRejectionCode | MeshCryptoError['code']): {
  readonly verified: false;
  readonly code: MeshCryptoRejectionCode;
} {
  return {
    verified: false,
    code:
      code === 'invalid_private_key'
        ? 'invalid_key_material'
        : code === 'invalid_public_key'
          ? 'invalid_key_material'
          : code === 'unsupported_algorithm'
            ? 'unsupported_algorithm'
            : code,
  };
}
