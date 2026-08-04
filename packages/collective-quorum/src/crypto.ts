import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
} from "@agentplat/mesh-protocol";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";
import type {
  CollectiveQuorumPayloadV1,
  SignedCollectiveQuorumEnvelopeV1,
  UnsignedCollectiveQuorumEnvelopeV1,
} from "./contracts.js";
import {
  validateSignedCollectiveQuorumEnvelopeV1,
  validateUnsignedCollectiveQuorumEnvelopeV1,
} from "./codec.js";

export class CollectiveQuorumCryptoErrorV1 extends Error {
  readonly name = "CollectiveQuorumCryptoErrorV1";

  constructor(
    readonly code:
      | "invalid_envelope"
      | "invalid_private_key"
      | "crypto_unavailable"
      | "crypto_operation_failed",
  ) {
    super(code);
  }
}

export async function collectiveQuorumDigestV1(
  value: unknown,
  injectedCrypto?: Crypto,
): Promise<string> {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok) throw new TypeError("Value is not canonical JSON");
  const crypto = resolveCrypto(injectedCrypto);
  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", copyBuffer(canonical.value)),
    );
    return `sha256:${toHex(digest)}`;
  } catch {
    throw new CollectiveQuorumCryptoErrorV1("crypto_operation_failed");
  }
}

export async function collectiveQuorumMessageIdV1(
  kind: string,
  value: unknown,
  injectedCrypto?: Crypto,
): Promise<string> {
  const digest = await collectiveQuorumDigestV1(value, injectedCrypto);
  return `quorum.${kind}.${digest.slice("sha256:".length, 47)}`;
}

export async function signCollectiveQuorumEnvelopeV1<
  TPayload extends CollectiveQuorumPayloadV1,
>(input: {
  readonly envelope: UnsignedCollectiveQuorumEnvelopeV1<TPayload>;
  readonly privateKey: CryptoKey;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveQuorumEnvelopeV1<TPayload>> {
  const envelope = validateUnsignedCollectiveQuorumEnvelopeV1<TPayload>(
    input.envelope,
  );
  if (!envelope) throw new CollectiveQuorumCryptoErrorV1("invalid_envelope");
  if (!isEd25519Key(input.privateKey, "private", "sign"))
    throw new CollectiveQuorumCryptoErrorV1("invalid_private_key");
  const bytes = signingBytes(envelope);
  const crypto = resolveCrypto(input.crypto);
  try {
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        MESH_SIGNATURE_ALGORITHM,
        input.privateKey,
        copyBuffer(bytes),
      ),
    );
    if (signature.byteLength !== 64)
      throw new CollectiveQuorumCryptoErrorV1("crypto_operation_failed");
    const signed = validateSignedCollectiveQuorumEnvelopeV1<TPayload>({
      ...envelope,
      proof: { ...envelope.proof, value: encodeBase64Url(signature) },
    });
    if (!signed) throw new CollectiveQuorumCryptoErrorV1("invalid_envelope");
    return signed;
  } catch (error) {
    if (error instanceof CollectiveQuorumCryptoErrorV1) throw error;
    throw new CollectiveQuorumCryptoErrorV1("crypto_operation_failed");
  }
}

export async function verifyCollectiveQuorumEnvelopeV1<
  TPayload extends CollectiveQuorumPayloadV1 = CollectiveQuorumPayloadV1,
>(input: {
  readonly envelope: unknown;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveQuorumEnvelopeV1<TPayload> | null> {
  const envelope = validateSignedCollectiveQuorumEnvelopeV1<TPayload>(
    input.envelope,
  );
  if (
    !envelope ||
    !compareMeshTimestamps(input.verifiedAt, input.verifiedAt).ok
  )
    return null;
  let key;
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
  if (
    !key ||
    key.status !== "active" ||
    key.tenantId !== envelope.tenantId ||
    key.meshId !== envelope.meshId ||
    key.peerId !== envelope.senderPeerId ||
    key.keyId !== envelope.proof.keyId ||
    key.algorithm !== envelope.proof.algorithm ||
    !isEd25519Key(key.publicKey, "public", "verify") ||
    !withinKeyInterval(input.verifiedAt, key.validFrom, key.validUntil)
  )
    return null;
  const signature = decodeBase64Url(envelope.proof.value);
  if (!signature || signature.byteLength !== 64) return null;
  const unsigned = {
    ...envelope,
    proof: {
      algorithm: envelope.proof.algorithm,
      keyId: envelope.proof.keyId,
    },
  } as UnsignedCollectiveQuorumEnvelopeV1<TPayload>;
  try {
    const verified = await resolveCrypto(input.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      copyBuffer(signature),
      copyBuffer(signingBytes(unsigned)),
    );
    return verified === true ? envelope : null;
  } catch {
    return null;
  }
}

function signingBytes(
  envelope: UnsignedCollectiveQuorumEnvelopeV1,
): Uint8Array {
  const canonical = canonicalizeMeshJsonBytes(envelope);
  if (!canonical.ok)
    throw new CollectiveQuorumCryptoErrorV1("invalid_envelope");
  return canonical.value;
}

function withinKeyInterval(
  timestamp: string,
  validFrom: string,
  validUntil: string,
): boolean {
  const from = compareMeshTimestamps(timestamp, validFrom);
  const until = compareMeshTimestamps(timestamp, validUntil);
  return from.ok && until.ok && from.value >= 0 && until.value < 0;
}

function resolveCrypto(injected?: Crypto): Crypto {
  const crypto = injected ?? globalThis.crypto;
  if (!crypto?.subtle)
    throw new CollectiveQuorumCryptoErrorV1("crypto_unavailable");
  return crypto;
}

function isEd25519Key(
  key: CryptoKey,
  type: "private" | "public",
  usage: "sign" | "verify",
): boolean {
  return (
    key instanceof CryptoKey &&
    key.type === type &&
    key.algorithm.name === MESH_SIGNATURE_ALGORITHM &&
    key.usages.includes(usage)
  );
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/gu, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(normalized + padding);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
