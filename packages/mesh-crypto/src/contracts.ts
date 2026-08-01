import type {
  MeshMessagePayload,
  MeshProtocolOptions,
  MeshSignatureAlgorithm,
  MeshWireVersion,
  SignedMeshEnvelope,
  UnsignedMeshEnvelope,
  VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';

/** Locally configured live verification status for one public key. */
export type MeshKeyStatus = 'active' | 'revoked';

/**
 * Preprovisioned identity and public-key binding.
 *
 * `validFrom` is inclusive and `validUntil` is exclusive.
 */
interface MeshKeyRecordBase {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly keyId: string;
  readonly algorithm: MeshSignatureAlgorithm;
  readonly publicKey: CryptoKey;
  readonly validFrom: string;
  readonly validUntil: string;
}

/** Live key record whose validity interval has not been revoked. */
export interface MeshActiveKeyRecord extends MeshKeyRecordBase {
  readonly status: 'active';
  readonly revokedAt?: never;
}

/** Key record explicitly removed from live verification. */
export interface MeshRevokedKeyRecord extends MeshKeyRecordBase {
  readonly status: 'revoked';
  readonly revokedAt: string;
}

export type MeshKeyRecord = MeshActiveKeyRecord | MeshRevokedKeyRecord;

/**
 * Bounded local key lookup. The synchronous return type intentionally prevents
 * network access from being hidden in the inbound verification path.
 */
export interface MeshKeyResolver {
  resolve(input: {
    tenantId: string;
    meshId: string;
    peerId: string;
    keyId: string;
    algorithm: MeshSignatureAlgorithm;
  }): MeshKeyRecord | undefined;
}

/** Cryptographic suites and key states accepted by one local peer. */
export interface MeshCryptoPolicy {
  readonly allowedAlgorithms: readonly MeshSignatureAlgorithm[];
  /** Defaults to every built-in readable version when omitted. */
  readonly allowedWireVersions?: readonly MeshWireVersion[];
}

/** Immutable outbound policy; compatibility v0 must be listed explicitly. */
export interface MeshSigningPolicy {
  readonly allowedWireVersions: readonly MeshWireVersion[];
}

/** Construction options for a policy-bound reference signer. */
export interface WebCryptoMeshEnvelopeSignerOptions {
  readonly signingPolicy?: MeshSigningPolicy;
}

/** Input required to canonicalize and hash one protocol payload. */
export interface MeshDigestRequest<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> {
  readonly payload: TPayload;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
}

/** Input required to hash and sign one outbound envelope. */
export interface MeshSignRequest<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
> {
  readonly envelope: UnsignedMeshEnvelope<TPayload, TWireVersion>;
  readonly privateKey: CryptoKey;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
}

/** Input required for bounded local signature verification. */
export interface MeshVerifyRequest<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
> {
  readonly envelope: SignedMeshEnvelope<TPayload, TWireVersion>;
  readonly resolver: MeshKeyResolver;
  readonly policy: MeshCryptoPolicy;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
}

/** Stable fail-closed verification failures safe for redacted telemetry. */
export type MeshCryptoRejectionCode =
  | 'crypto_unavailable'
  | 'crypto_operation_failed'
  | 'invalid_envelope'
  | 'invalid_verification_time'
  | 'unsupported_algorithm'
  | 'unsupported_wire_version'
  | 'payload_hash_mismatch'
  | 'key_not_found'
  | 'key_resolution_failed'
  | 'key_binding_mismatch'
  | 'invalid_key_record'
  | 'invalid_key_material'
  | 'key_not_yet_valid'
  | 'key_expired'
  | 'key_revoked'
  | 'signature_invalid';

/** Stable signer/digest failure raised without including sensitive input. */
export type MeshCryptoErrorCode =
  | 'crypto_unavailable'
  | 'crypto_operation_failed'
  | 'invalid_envelope'
  | 'invalid_private_key'
  | 'invalid_public_key'
  | 'unsupported_algorithm'
  | 'unsupported_wire_version';

/** Typed operational failure for digest and signing APIs. */
export class MeshCryptoError extends Error {
  readonly name = 'MeshCryptoError';

  constructor(readonly code: MeshCryptoErrorCode) {
    super(code);
  }
}

/** Result returned by the reference envelope verifier. */
export type MeshVerificationResult<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
> =
  | {
      readonly verified: true;
      readonly envelope: VerifiedMeshEnvelope<TPayload, TWireVersion>;
      readonly key: MeshKeyRecord;
    }
  | {
      readonly verified: false;
      readonly code: MeshCryptoRejectionCode;
    };

/** Injectable signer used by production and loopback drivers. */
export interface MeshEnvelopeSigner {
  sign<
    TPayload extends MeshMessagePayload,
    TWireVersion extends MeshWireVersion = MeshWireVersion,
  >(
    request: MeshSignRequest<TPayload, TWireVersion>
  ): Promise<SignedMeshEnvelope<TPayload, TWireVersion>>;
}

/** Injectable verifier used before local admission and replay checks. */
export interface MeshEnvelopeVerifier {
  verify<
    TPayload extends MeshMessagePayload,
    TWireVersion extends MeshWireVersion = MeshWireVersion,
  >(
    request: MeshVerifyRequest<TPayload, TWireVersion>
  ): Promise<MeshVerificationResult<TPayload, TWireVersion>>;
}

/** Construction bound for the static in-memory key resolver. */
export interface StaticMeshKeyResolverOptions {
  readonly maximumRecords?: number;
}
