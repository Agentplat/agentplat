import type { InteropEnvelopeAuthenticityPortV1 } from "./index.js";

export interface WebCryptoInteropPublicKeyResolverV1 {
  resolve(signerId: string): Promise<CryptoKey | null>;
}

/** Ed25519 envelope authenticity for clients and endpoint routers. */
export class WebCryptoInteropAuthenticityPortV1 implements InteropEnvelopeAuthenticityPortV1 {
  readonly localSignerId: string;
  readonly #privateKey: CryptoKey;
  readonly #resolvePublicKey: WebCryptoInteropPublicKeyResolverV1["resolve"];
  readonly #subtleSign: SubtleCrypto["sign"];
  readonly #subtleVerify: SubtleCrypto["verify"];

  constructor(
    readonly options: {
      readonly localSignerId: string;
      readonly privateKey: CryptoKey;
      readonly publicKeys: WebCryptoInteropPublicKeyResolverV1;
      readonly crypto?: Crypto;
    },
  ) {
    const localSignerId = options.localSignerId;
    const privateKey = options.privateKey;
    const publicKeys = options.publicKeys;
    const crypto = options.crypto ?? globalThis.crypto;
    const subtle = crypto?.subtle;
    const resolve = publicKeys?.resolve;
    const subtleSign = subtle?.sign;
    const subtleVerify = subtle?.verify;
    identifier(localSignerId, "localSignerId");
    if (
      !subtle ||
      !privateKey ||
      !publicKeys ||
      typeof resolve !== "function" ||
      typeof subtleSign !== "function" ||
      typeof subtleVerify !== "function"
    )
      throw new TypeError(
        "Web Crypto interop authenticity dependencies are required",
      );
    this.localSignerId = localSignerId;
    this.#privateKey = privateKey;
    this.#resolvePublicKey = resolve.bind(publicKeys);
    this.#subtleSign = subtleSign.bind(subtle);
    this.#subtleVerify = subtleVerify.bind(subtle);
    Object.defineProperty(this, "localSignerId", {
      value: localSignerId,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        localSignerId,
        privateKey,
        publicKeys: Object.freeze({ resolve: this.#resolvePublicKey }),
        crypto,
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperties(this, {
      sign: immutableMethod((messageDigest: string) =>
        this.#sign(messageDigest),
      ),
      verify: immutableMethod(
        (input: {
          readonly signerId: string;
          readonly digest: string;
          readonly signature: string;
        }) => this.#verify(input),
      ),
    });
  }

  sign(messageDigest: string): Promise<string> {
    return this.#sign(messageDigest);
  }

  async #sign(messageDigest: string): Promise<string> {
    digest(messageDigest, "messageDigest");
    const signature = await this.#subtleSign(
      "Ed25519",
      this.#privateKey,
      new TextEncoder().encode(messageDigest),
    );
    return encodeBase64Url(new Uint8Array(signature));
  }

  verify(input: {
    readonly signerId: string;
    readonly digest: string;
    readonly signature: string;
  }): Promise<boolean> {
    return this.#verify(input);
  }

  async #verify(input: {
    readonly signerId: string;
    readonly digest: string;
    readonly signature: string;
  }): Promise<boolean> {
    try {
      identifier(input.signerId, "signerId");
      digest(input.digest, "messageDigest");
      const key = await this.#resolvePublicKey(input.signerId);
      return Boolean(
        key &&
        (await this.#subtleVerify(
          "Ed25519",
          key,
          decodeBase64Url(input.signature),
          new TextEncoder().encode(input.digest),
        )) === true,
      );
    } catch {
      return false;
    }
  }
}

function immutableMethod<T extends (...args: never[]) => unknown>(
  value: T,
): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}

function encodeBase64Url(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const block =
      ((bytes[index] ?? 0) << 16) |
      ((bytes[index + 1] ?? 0) << 8) |
      (bytes[index + 2] ?? 0);
    output += alphabet[(block >>> 18) & 63] + alphabet[(block >>> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(block >>> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[block & 63] : "=";
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length > 16_384)
    throw new TypeError("base64url signature is invalid");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const output: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const chars = normalized.slice(index, index + 4);
    const values = [...chars].map((character) => alphabet.indexOf(character));
    if (values.some((item) => item < 0))
      throw new TypeError("base64url signature is invalid");
    const block =
      ((values[0] ?? 0) << 18) |
      ((values[1] ?? 0) << 12) |
      ((values[2] ?? 0) << 6) |
      (values[3] ?? 0);
    output.push((block >>> 16) & 255);
    if (chars.length > 2) output.push((block >>> 8) & 255);
    if (chars.length > 3) output.push(block & 255);
  }
  const decoded = new Uint8Array(output.length);
  decoded.set(output);
  return decoded;
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}
