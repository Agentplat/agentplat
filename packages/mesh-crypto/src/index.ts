import type {
  MeshMessagePayload,
  MeshSignatureAlgorithm,
  SignedMeshEnvelope,
  UnsignedMeshEnvelope,
  VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';

/** Locally configured live verification status for one public key. */
export type MeshKeyStatus = 'active' | 'revoked';

/** Preprovisioned identity and public-key binding. */
export interface MeshKeyRecord {
  readonly peerId: string;
  readonly keyId: string;
  readonly algorithm: MeshSignatureAlgorithm;
  readonly publicKey: CryptoKey;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly status: MeshKeyStatus;
  readonly revokedAt?: string;
}

/**
 * Bounded local key lookup. The synchronous return type intentionally prevents
 * network access from being hidden in the inbound verification path.
 */
export interface MeshKeyResolver {
  resolve(input: {
    peerId: string;
    keyId: string;
    algorithm: MeshSignatureAlgorithm;
  }): MeshKeyRecord | undefined;
}

/** Cryptographic suites and key states accepted by one local peer. */
export interface MeshCryptoPolicy {
  readonly allowedAlgorithms: readonly MeshSignatureAlgorithm[];
  readonly rejectRevokedKeys: boolean;
}

/** Input required to hash and sign one outbound envelope. */
export interface MeshSignRequest<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> {
  readonly envelope: UnsignedMeshEnvelope<TPayload>;
  readonly privateKey: CryptoKey;
  readonly crypto?: Crypto;
}

/** Input required for bounded local signature verification. */
export interface MeshVerifyRequest<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> {
  readonly envelope: SignedMeshEnvelope<TPayload>;
  readonly resolver: MeshKeyResolver;
  readonly policy: MeshCryptoPolicy;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}

/** Stable fail-closed verification failures safe for redacted telemetry. */
export type MeshCryptoRejectionCode =
  | 'crypto_unavailable'
  | 'unsupported_algorithm'
  | 'payload_hash_mismatch'
  | 'key_not_found'
  | 'key_binding_mismatch'
  | 'key_not_yet_valid'
  | 'key_expired'
  | 'key_revoked'
  | 'signature_invalid';

/** Result returned by the reference envelope verifier. */
export type MeshVerificationResult<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> =
  | {
      readonly verified: true;
      readonly envelope: VerifiedMeshEnvelope<TPayload>;
      readonly key: MeshKeyRecord;
    }
  | {
      readonly verified: false;
      readonly code: MeshCryptoRejectionCode;
    };

/** Injectable signer used by production and loopback drivers. */
export interface MeshEnvelopeSigner {
  sign<TPayload extends MeshMessagePayload>(
    request: MeshSignRequest<TPayload>
  ): Promise<SignedMeshEnvelope<TPayload>>;
}

/** Injectable verifier used before local admission and replay checks. */
export interface MeshEnvelopeVerifier {
  verify<TPayload extends MeshMessagePayload>(
    request: MeshVerifyRequest<TPayload>
  ): Promise<MeshVerificationResult<TPayload>>;
}
