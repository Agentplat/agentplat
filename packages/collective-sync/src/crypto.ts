import type { MeshKeyRecord, MeshKeyResolver } from "@agentplat/mesh-crypto";
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
} from "@agentplat/mesh-protocol";
import type {
  CollectiveSyncPayloadV1,
  SignedCollectiveSyncEnvelopeV1,
  UnsignedCollectiveSyncEnvelopeV1,
} from "./contracts.js";
import {
  validateSignedCollectiveSyncEnvelopeV1,
  validateUnsignedCollectiveSyncEnvelopeV1,
} from "./codec.js";

export async function collectiveSyncDigestV1(
  value: unknown,
  injected?: Crypto,
): Promise<string> {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok) throw new TypeError("sync_value_not_canonical");
  const digest = await cryptoOf(injected).subtle.digest(
    "SHA-256",
    copy(canonical.value),
  );
  return `sha256:${hex(new Uint8Array(digest))}`;
}

export async function collectiveSyncMessageIdV1(
  domain: string,
  value: unknown,
  injected?: Crypto,
): Promise<string> {
  const digest = await collectiveSyncDigestV1(
    { domain: `agentplat.collective-sync.${domain}.v1`, value },
    injected,
  );
  return `sync.${domain}.${digest.slice(7, 47)}`;
}

export async function signCollectiveSyncEnvelopeV1<
  TPayload extends CollectiveSyncPayloadV1,
>(input: {
  readonly envelope: UnsignedCollectiveSyncEnvelopeV1<TPayload>;
  readonly privateKey: CryptoKey;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveSyncEnvelopeV1<TPayload>> {
  const envelope = validateUnsignedCollectiveSyncEnvelopeV1<TPayload>(
    input.envelope,
  );
  if (!envelope || !ed25519(input.privateKey, "private", "sign"))
    throw new TypeError("invalid_sync_signing_input");
  const signature = await cryptoOf(input.crypto).subtle.sign(
    MESH_SIGNATURE_ALGORITHM,
    input.privateKey,
    copy(signingBytes(envelope)),
  );
  const signed = validateSignedCollectiveSyncEnvelopeV1<TPayload>({
    ...envelope,
    proof: { ...envelope.proof, value: base64url(new Uint8Array(signature)) },
  });
  if (!signed) throw new TypeError("invalid_sync_signature_output");
  return signed;
}

export async function verifyCollectiveSyncEnvelopeV1<
  TPayload extends CollectiveSyncPayloadV1 = CollectiveSyncPayloadV1,
>(input: {
  readonly envelope: unknown;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveSyncEnvelopeV1<TPayload> | null> {
  const envelope = validateSignedCollectiveSyncEnvelopeV1<TPayload>(
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
  try {
    const verified = await cryptoOf(input.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      copy(signature),
      copy(signingBytes(envelope)),
    );
    return verified ? envelope : null;
  } catch {
    return null;
  }
}

function signingBytes(
  envelope: SignedCollectiveSyncEnvelopeV1 | UnsignedCollectiveSyncEnvelopeV1,
): Uint8Array {
  const canonical = canonicalizeMeshJsonBytes({
    ...envelope,
    proof: { algorithm: envelope.proof.algorithm, keyId: envelope.proof.keyId },
  });
  if (!canonical.ok) throw new TypeError("sync_envelope_not_canonical");
  return canonical.value;
}

function validKey(
  key: MeshKeyRecord,
  envelope: SignedCollectiveSyncEnvelopeV1,
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
  const value = injected ?? globalThis.crypto;
  if (!value?.subtle) throw new TypeError("crypto_unavailable");
  return value;
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
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const decoded = Uint8Array.from(
      atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)),
      (entry) => entry.charCodeAt(0),
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
