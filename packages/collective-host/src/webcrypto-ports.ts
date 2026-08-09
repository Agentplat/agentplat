import type {
  DistributedCollectiveAuthenticityPortV1,
  DistributedCollectiveMembershipPortV1,
} from "./distributed-collective-protocol.js";

export interface DistributedCollectivePublicKeyResolverV1 {
  resolve(input: {
    readonly peerId: string;
    readonly instanceId: string;
    readonly keyId: string;
    readonly membershipConfigurationDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<CryptoKey | null>;
}

/** Concrete Ed25519 authenticity port for collective protocol messages. */
export class WebCryptoDistributedCollectiveAuthenticityPortV1
  implements DistributedCollectiveAuthenticityPortV1 {
  readonly localKeyId: string;

  constructor(readonly options: {
    readonly localKeyId: string;
    readonly privateKey: CryptoKey;
    readonly publicKeys: DistributedCollectivePublicKeyResolverV1;
    readonly crypto?: Crypto;
  }) {
    identifier(options.localKeyId, "localKeyId");
    if (!(options.crypto ?? globalThis.crypto)?.subtle || !options.privateKey || !options.publicKeys)
      throw new TypeError("Web Crypto collective authenticity dependencies are required");
    this.localKeyId = options.localKeyId;
  }

  async sign(messageDigest: string): Promise<string> {
    digest(messageDigest, "messageDigest");
    return encodeBase64Url(new Uint8Array(await (this.options.crypto ?? globalThis.crypto).subtle.sign(
      "Ed25519",
      this.options.privateKey,
      new TextEncoder().encode(messageDigest),
    )));
  }

  async verify(input: {
    readonly messageDigest: string;
    readonly signature: string;
    readonly issuerPeerId: string;
    readonly issuerInstanceId: string;
    readonly issuerKeyId: string;
    readonly membershipConfigurationDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    const key = await this.options.publicKeys.resolve({
      peerId: input.issuerPeerId,
      instanceId: input.issuerInstanceId,
      keyId: input.issuerKeyId,
      membershipConfigurationDigest: input.membershipConfigurationDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!key) return false;
    try {
      return await (this.options.crypto ?? globalThis.crypto).subtle.verify(
        "Ed25519",
        key,
        decodeBase64Url(input.signature),
        new TextEncoder().encode(input.messageDigest),
      );
    } catch { return false; }
  }
}

export interface DistributedCollectiveMembershipEntryV1 {
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
  readonly scopeDigest: string;
  readonly membershipConfigurationDigest: string;
  readonly validFromLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly status: "active" | "suspended" | "revoked";
}

/** Immutable membership snapshot suitable for browser and embedded peers. */
export class SnapshotDistributedCollectiveMembershipPortV1
  implements DistributedCollectiveMembershipPortV1 {
  readonly #entries: ReadonlyMap<string, DistributedCollectiveMembershipEntryV1>;

  constructor(entries: readonly DistributedCollectiveMembershipEntryV1[]) {
    const map = new Map<string, DistributedCollectiveMembershipEntryV1>();
    for (const entry of entries) {
      identifier(entry.peerId, "peerId");
      identifier(entry.instanceId, "instanceId");
      identifier(entry.keyId, "keyId");
      digest(entry.scopeDigest, "scopeDigest");
      digest(entry.membershipConfigurationDigest, "membershipConfigurationDigest");
      integer(entry.validFromLogicalMs, "validFromLogicalMs", 0, Number.MAX_SAFE_INTEGER);
      integer(entry.validUntilLogicalMs, "validUntilLogicalMs", entry.validFromLogicalMs + 1, Number.MAX_SAFE_INTEGER);
      if (!["active", "suspended", "revoked"].includes(entry.status))
        throw new TypeError("collective membership status is invalid");
      const key = membershipKey(entry.peerId, entry.instanceId, entry.keyId);
      if (map.has(key)) throw new TypeError("collective membership entry is duplicated");
      map.set(key, Object.freeze(structuredClone(entry)));
    }
    this.#entries = map;
  }

  async verifyPeer(input: {
    readonly peerId: string;
    readonly instanceId: string;
    readonly keyId: string;
    readonly membershipConfigurationDigest: string;
    readonly scopeDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    const entry = this.#entries.get(membershipKey(input.peerId, input.instanceId, input.keyId));
    return Boolean(entry && entry.status === "active" &&
      entry.scopeDigest === input.scopeDigest &&
      entry.membershipConfigurationDigest === input.membershipConfigurationDigest &&
      entry.validFromLogicalMs <= input.logicalTimeMs && input.logicalTimeMs < entry.validUntilLogicalMs);
  }
}

function membershipKey(peerId: string, instanceId: string, keyId: string): string {
  return `${peerId}\u0000${instanceId}\u0000${keyId}`;
}

function encodeBase64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const block = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    output += alphabet[(block >>> 18) & 63] + alphabet[(block >>> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(block >>> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[block & 63] : "=";
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError("base64url signature is invalid");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const output: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const chars = normalized.slice(index, index + 4);
    const values = [...chars].map((char) => alphabet.indexOf(char));
    if (values.some((item) => item < 0)) throw new TypeError("base64url signature is invalid");
    const block = ((values[0] ?? 0) << 18) | ((values[1] ?? 0) << 12) | ((values[2] ?? 0) << 6) | (values[3] ?? 0);
    output.push((block >>> 16) & 255);
    if (chars.length > 2) output.push((block >>> 8) & 255);
    if (chars.length > 3) output.push(block & 255);
  }
  return new Uint8Array(output);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}
function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}
function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new RangeError(`${label} is invalid`);
  return value as number;
}
