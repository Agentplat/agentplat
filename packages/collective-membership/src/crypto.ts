import type { MeshKeyResolver, MeshKeyRecord } from "@agentplat/mesh-crypto";
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
} from "@agentplat/mesh-protocol";
import type {
  CollectiveMembershipKeyProofV1,
  CollectiveMembershipKeyV1,
  CollectiveMembershipPayloadV1,
  SignedCollectiveMembershipEnvelopeV1,
  UnsignedCollectiveMembershipEnvelopeV1,
} from "./contracts.js";
import {
  validateSignedCollectiveMembershipEnvelopeV1,
  validateUnsignedCollectiveMembershipEnvelopeV1,
} from "./codec.js";

const encoder = new TextEncoder();

export async function collectiveMembershipDigestV1(
  value: unknown,
  injectedCrypto?: Crypto,
): Promise<string> {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok) throw new TypeError("membership_value_not_canonical");
  const digest = await cryptoOf(injectedCrypto).subtle.digest(
    "SHA-256",
    copy(canonical.value),
  );
  return `sha256:${hex(new Uint8Array(digest))}`;
}

export async function collectiveMembershipMessageIdV1(
  domain: string,
  value: unknown,
  injectedCrypto?: Crypto,
): Promise<string> {
  const digest = await collectiveMembershipDigestV1(
    { domain: `agentplat.collective-membership.${domain}.v1`, value },
    injectedCrypto,
  );
  return `membership.${domain}.${digest.slice(7, 47)}`;
}

export async function signCollectiveMembershipEnvelopeV1<
  TPayload extends CollectiveMembershipPayloadV1,
>(input: {
  readonly envelope: UnsignedCollectiveMembershipEnvelopeV1<TPayload>;
  readonly privateKey: CryptoKey;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveMembershipEnvelopeV1<TPayload>> {
  const envelope = validateUnsignedCollectiveMembershipEnvelopeV1<TPayload>(
    input.envelope,
  );
  if (!envelope || !ed25519(input.privateKey, "private", "sign"))
    throw new TypeError("invalid_membership_signing_input");
  const bytes = signingBytes(envelope);
  const signature = await cryptoOf(input.crypto).subtle.sign(
    MESH_SIGNATURE_ALGORITHM,
    input.privateKey,
    copy(bytes),
  );
  const candidate = {
    ...envelope,
    proof: { ...envelope.proof, value: base64url(new Uint8Array(signature)) },
  };
  const signed =
    validateSignedCollectiveMembershipEnvelopeV1<TPayload>(candidate);
  if (!signed) throw new TypeError("invalid_membership_signature_output");
  return signed;
}

export async function verifyCollectiveMembershipEnvelopeV1<
  TPayload extends CollectiveMembershipPayloadV1 =
    CollectiveMembershipPayloadV1,
>(input: {
  readonly envelope: unknown;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveMembershipEnvelopeV1<TPayload> | null> {
  const envelope = validateSignedCollectiveMembershipEnvelopeV1<TPayload>(
    input.envelope,
  );
  if (
    !envelope ||
    !compareMeshTimestamps(input.verifiedAt, input.verifiedAt).ok
  )
    return null;
  let key: MeshKeyRecord | undefined;
  try {
    key = input.resolver.resolve({
      tenantId: envelope.tenantId,
      meshId: envelope.meshId,
      peerId: envelope.senderPeerId,
      keyId: envelope.proof.keyId,
      algorithm: envelope.proof.algorithm,
    });
  } catch {
    return null;
  }
  if (!key || !validKey(key, envelope, input.verifiedAt)) return null;
  const signature = decodeBase64Url(envelope.proof.value, 64);
  if (!signature) return null;
  let verified: unknown;
  try {
    verified = await cryptoOf(input.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      copy(signature),
      copy(signingBytes(envelope)),
    );
  } catch {
    return null;
  }
  return verified === true ? envelope : null;
}

export async function createCollectiveMembershipKeyProofV1(input: {
  readonly statementDigest: string;
  readonly keyId: string;
  readonly privateKey: CryptoKey;
  readonly crypto?: Crypto;
}): Promise<CollectiveMembershipKeyProofV1> {
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(input.statementDigest) ||
    !input.keyId ||
    !ed25519(input.privateKey, "private", "sign")
  )
    throw new TypeError("invalid_membership_key_proof_input");
  const bytes = proofBytes(input.statementDigest);
  const value = await cryptoOf(input.crypto).subtle.sign(
    MESH_SIGNATURE_ALGORITHM,
    input.privateKey,
    copy(bytes),
  );
  return Object.freeze({
    algorithm: MESH_SIGNATURE_ALGORITHM,
    keyId: input.keyId,
    value: base64url(new Uint8Array(value)),
  });
}

export async function verifyCollectiveMembershipKeyProofV1(input: {
  readonly statementDigest: string;
  readonly proof: CollectiveMembershipKeyProofV1;
  readonly publicKey: CryptoKey;
  readonly crypto?: Crypto;
}): Promise<boolean> {
  const signature = decodeBase64Url(input.proof.value, 64);
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(input.statementDigest) ||
    input.proof.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !signature ||
    !ed25519(input.publicKey, "public", "verify")
  )
    return false;
  try {
    return (
      (await cryptoOf(input.crypto).subtle.verify(
        MESH_SIGNATURE_ALGORITHM,
        input.publicKey,
        copy(signature),
        copy(proofBytes(input.statementDigest)),
      )) === true
    );
  } catch {
    return false;
  }
}

export async function exportCollectiveMembershipPublicKeyV1(
  publicKey: CryptoKey,
  injectedCrypto?: Crypto,
): Promise<string> {
  if (!ed25519(publicKey, "public", "verify"))
    throw new TypeError("invalid_membership_public_key");
  const raw = new Uint8Array(
    await cryptoOf(injectedCrypto).subtle.exportKey("raw", publicKey),
  );
  if (raw.byteLength !== 32)
    throw new TypeError("invalid_membership_public_key");
  return base64url(raw);
}

export async function importCollectiveMembershipPublicKeyV1(
  key: CollectiveMembershipKeyV1,
  injectedCrypto?: Crypto,
): Promise<CryptoKey> {
  const raw = decodeBase64Url(key.publicKey, 32);
  if (!raw || key.algorithm !== MESH_SIGNATURE_ALGORITHM)
    throw new TypeError("invalid_membership_public_key");
  const imported = await cryptoOf(injectedCrypto).subtle.importKey(
    "raw",
    copy(raw),
    { name: MESH_SIGNATURE_ALGORITHM },
    true,
    ["verify"],
  );
  if (!ed25519(imported, "public", "verify"))
    throw new TypeError("invalid_membership_public_key");
  return imported;
}

function signingBytes(
  envelope:
    | SignedCollectiveMembershipEnvelopeV1
    | UnsignedCollectiveMembershipEnvelopeV1,
): Uint8Array {
  const proof = {
    algorithm: envelope.proof.algorithm,
    keyId: envelope.proof.keyId,
  };
  const canonical = canonicalizeMeshJsonBytes({ ...envelope, proof });
  if (!canonical.ok) throw new TypeError("membership_envelope_not_canonical");
  return canonical.value;
}

function proofBytes(statementDigest: string): Uint8Array {
  return encoder.encode(
    `agentplat.collective-membership.key-possession.v1\n${statementDigest}`,
  );
}

function validKey(
  key: MeshKeyRecord,
  envelope: SignedCollectiveMembershipEnvelopeV1,
  verifiedAt: string,
): boolean {
  if (
    key.tenantId !== envelope.tenantId ||
    key.meshId !== envelope.meshId ||
    key.peerId !== envelope.senderPeerId ||
    key.keyId !== envelope.proof.keyId ||
    key.algorithm !== envelope.proof.algorithm ||
    key.status !== "active" ||
    !ed25519(key.publicKey, "public", "verify")
  )
    return false;
  const from = compareMeshTimestamps(verifiedAt, key.validFrom);
  const until = compareMeshTimestamps(verifiedAt, key.validUntil);
  return from.ok && until.ok && from.value >= 0 && until.value < 0;
}

function cryptoOf(injected?: Crypto): Crypto {
  const crypto = injected ?? globalThis.crypto;
  if (!crypto?.subtle) throw new TypeError("crypto_unavailable");
  return crypto;
}

function ed25519(key: CryptoKey, type: KeyType, usage: KeyUsage): boolean {
  try {
    return (
      key?.type === type &&
      key.algorithm?.name === MESH_SIGNATURE_ALGORITHM &&
      Array.from(key.usages).includes(usage)
    );
  } catch {
    return false;
  }
}

function base64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/gu, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");
}

function decodeBase64Url(value: string, bytes: number): Uint8Array | null {
  if (typeof value !== "string") return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Uint8Array.from(atob(normalized + padding), (character) =>
      character.charCodeAt(0),
    );
    return decoded.byteLength === bytes ? decoded : null;
  } catch {
    return null;
  }
}

function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function copy(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer;
}
