import type {
  PartialViewClaimVerificationPortV1,
  PartialViewSnapshotWitnessV1,
  PartialViewValidatorClaimV1,
  PartialViewWitnessPortV1,
} from "./partial-view-agreement.js";
import {
  sparseAggregateSignerSetDigestV2,
  type SparseAggregateSignaturePortV2,
  type SparseAggregateSignatureV2,
  type SparseAgreementShareV2,
  type SparseAgreementValidatorV2,
} from "./sparse-agreement.js";

export interface WebCryptoSparsePublicKeyResolverV1 {
  resolve(input: {
    readonly peerId: string;
    readonly instanceId: string;
    readonly keyId: string;
  }): Promise<CryptoKey | null>;
}

export interface WebCryptoSparsePrivateSignerV1 {
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
  readonly independenceGroupId: string;
  readonly privateKey: CryptoKey;
}

interface MultiSignatureEntryV1 {
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
  readonly signature: string;
}

/** Portable Ed25519 multi-signature bundle for the sparse signature port. */
export class WebCryptoSparseMultiSignaturePortV1 implements SparseAggregateSignaturePortV2 {
  readonly algorithm = "Ed25519-multisig-v1";

  constructor(
    readonly keys: WebCryptoSparsePublicKeyResolverV1,
    readonly crypto: Crypto = globalThis.crypto,
  ) {
    if (!crypto?.subtle || !keys || typeof keys.resolve !== "function")
      throw new TypeError("Web Crypto sparse signature dependencies are required");
  }

  async verifyShare(input: {
    readonly validator: SparseAgreementValidatorV2;
    readonly messageDigest: string;
    readonly signature: string;
  }): Promise<boolean> {
    const key = await this.keys.resolve(input.validator);
    if (!key) return false;
    try {
      return await this.crypto.subtle.verify(
        "Ed25519",
        key,
        decodeBase64Url(input.signature),
        new TextEncoder().encode(input.messageDigest),
      );
    } catch { return false; }
  }

  async aggregate(input: {
    readonly messageDigest: string;
    readonly shares: readonly SparseAgreementShareV2[];
  }): Promise<SparseAggregateSignatureV2> {
    const entries: MultiSignatureEntryV1[] = input.shares.map((share) => ({
      peerId: share.signerPeerId,
      instanceId: share.signerInstanceId,
      keyId: share.signerKeyId,
      signature: share.signature,
    })).sort((left, right) => left.peerId.localeCompare(right.peerId));
    const signerPeerIds = entries.map((item) => item.peerId);
    if (new Set(signerPeerIds).size !== signerPeerIds.length)
      throw new TypeError("sparse multi-signature signer is duplicated");
    return Object.freeze({
      algorithm: this.algorithm,
      signerPeerIds: Object.freeze(signerPeerIds),
      signerSetDigest: await sparseAggregateSignerSetDigestV2(this.algorithm, signerPeerIds, this.crypto),
      value: encodeBase64Url(new TextEncoder().encode(JSON.stringify(entries))),
    });
  }

  async verifyAggregate(input: {
    readonly messageDigest: string;
    readonly validators: readonly SparseAgreementValidatorV2[];
    readonly signature: SparseAggregateSignatureV2;
  }): Promise<boolean> {
    if (input.signature.algorithm !== this.algorithm) return false;
    let entries: readonly MultiSignatureEntryV1[];
    try {
      entries = JSON.parse(new TextDecoder().decode(decodeBase64Url(input.signature.value))) as MultiSignatureEntryV1[];
    } catch { return false; }
    if (!Array.isArray(entries) || entries.length !== input.validators.length) return false;
    const validators = [...input.validators].sort((left, right) => left.peerId.localeCompare(right.peerId));
    for (const [index, validator] of validators.entries()) {
      const entry = entries[index];
      if (!entry || entry.peerId !== validator.peerId || entry.instanceId !== validator.instanceId || entry.keyId !== validator.keyId)
        return false;
      if (!(await this.verifyShare({ validator, messageDigest: input.messageDigest, signature: entry.signature })))
        return false;
    }
    const signerPeerIds = validators.map((item) => item.peerId);
    return input.signature.signerPeerIds.length === signerPeerIds.length &&
      input.signature.signerPeerIds.every((item, index) => item === signerPeerIds[index]) &&
      input.signature.signerSetDigest === await sparseAggregateSignerSetDigestV2(this.algorithm, signerPeerIds, this.crypto);
  }
}

export class WebCryptoPartialViewWitnessPortV1 implements PartialViewWitnessPortV1 {
  readonly localPeerId: string;
  readonly localInstanceId: string;
  readonly localKeyId: string;
  readonly localIndependenceGroupId: string;

  constructor(
    readonly signer: WebCryptoSparsePrivateSignerV1,
    readonly keys: WebCryptoSparsePublicKeyResolverV1,
    readonly crypto: Crypto = globalThis.crypto,
  ) {
    this.localPeerId = signer.peerId;
    this.localInstanceId = signer.instanceId;
    this.localKeyId = signer.keyId;
    this.localIndependenceGroupId = signer.independenceGroupId;
    if (!crypto?.subtle) throw new TypeError("Web Crypto is unavailable");
  }

  async sign(messageDigest: string): Promise<string> {
    digest(messageDigest, "messageDigest");
    return encodeBase64Url(new Uint8Array(await this.crypto.subtle.sign(
      "Ed25519",
      this.signer.privateKey,
      new TextEncoder().encode(messageDigest),
    )));
  }

  async verify(input: { readonly witness: PartialViewSnapshotWitnessV1; readonly messageDigest: string }): Promise<boolean> {
    const key = await this.keys.resolve({
      peerId: input.witness.witnessPeerId,
      instanceId: input.witness.witnessInstanceId,
      keyId: input.witness.witnessKeyId,
    });
    if (!key) return false;
    try {
      return await this.crypto.subtle.verify(
        "Ed25519", key, decodeBase64Url(input.witness.signature), new TextEncoder().encode(input.messageDigest),
      );
    } catch { return false; }
  }
}

export class WebCryptoPartialViewClaimVerificationPortV1 implements PartialViewClaimVerificationPortV1 {
  constructor(
    readonly keys: WebCryptoSparsePublicKeyResolverV1,
    readonly verifyMembershipProof: (claim: PartialViewValidatorClaimV1) => Promise<boolean>,
    readonly crypto: Crypto = globalThis.crypto,
  ) {
    if (!crypto?.subtle || typeof verifyMembershipProof !== "function")
      throw new TypeError("partial-view claim verification dependencies are required");
  }

  async verify(input: { readonly claim: PartialViewValidatorClaimV1; readonly claimMessageDigest: string }): Promise<boolean> {
    if (!(await this.verifyMembershipProof(input.claim))) return false;
    const key = await this.keys.resolve({
      peerId: input.claim.sourcePeerId,
      instanceId: input.claim.sourceInstanceId,
      keyId: input.claim.sourceKeyId,
    });
    if (!key) return false;
    try {
      return await this.crypto.subtle.verify(
        "Ed25519", key, decodeBase64Url(input.claim.signature), new TextEncoder().encode(input.claimMessageDigest),
      );
    } catch { return false; }
  }
}

export function createWebCryptoSparseLocalSignerV1(
  signer: WebCryptoSparsePrivateSignerV1,
  crypto: Crypto = globalThis.crypto,
) {
  if (!crypto?.subtle) throw new TypeError("Web Crypto is unavailable");
  identifier(signer.peerId, "signer.peerId");
  identifier(signer.instanceId, "signer.instanceId");
  identifier(signer.keyId, "signer.keyId");
  return Object.freeze({
    peerId: signer.peerId,
    instanceId: signer.instanceId,
    keyId: signer.keyId,
    async sign(messageDigest: string): Promise<string> {
      digest(messageDigest, "messageDigest");
      return encodeBase64Url(new Uint8Array(await crypto.subtle.sign(
        "Ed25519", signer.privateKey, new TextEncoder().encode(messageDigest),
      )));
    },
  });
}

function encodeBase64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const block = (first << 16) | (second << 8) | third;
    output += alphabet[(block >>> 18) & 63] + alphabet[(block >>> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(block >>> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[block & 63] : "=";
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError("base64url value is invalid");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const output: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const chars = normalized.slice(index, index + 4);
    const values = [...chars].map((char) => alphabet.indexOf(char));
    if (values.some((item) => item < 0)) throw new TypeError("base64url value is invalid");
    const block = ((values[0] ?? 0) << 18) | ((values[1] ?? 0) << 12) | ((values[2] ?? 0) << 6) | (values[3] ?? 0);
    output.push((block >>> 16) & 255);
    if (chars.length > 2) output.push((block >>> 8) & 255);
    if (chars.length > 3) output.push(block & 255);
  }
  const decoded = new Uint8Array(output.length);
  decoded.set(output);
  return decoded;
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}
