import { decodeBase64Url, encodeBase64Url } from './base64url.js';
import { MeshCryptoError, type MeshExternalSignaturePort } from './contracts.js';
import { MESH_SIGNATURE_ALGORITHM } from '@agentplat/mesh-protocol';

export interface HttpMeshExternalSignaturePortOptionsV1 {
  readonly endpoint: string;
  readonly expectedKeyId: string;
  readonly authorizationHeader?: () => Promise<string>;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly crypto?: Crypto;
}

/** HTTPS KMS/HSM bridge that never accepts or returns private key material. */
export class HttpMeshExternalSignaturePortV1
  implements MeshExternalSignaturePort
{
  readonly #endpoint: URL;
  readonly #expectedKeyId: string;
  readonly #authorizationHeader?: () => Promise<string>;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  readonly #crypto: Crypto;

  constructor(options: HttpMeshExternalSignaturePortOptionsV1) {
    const endpoint = new URL(options.endpoint);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username !== '' ||
      endpoint.password !== '' ||
      endpoint.search !== '' ||
      endpoint.hash !== ''
    ) throw new TypeError('Mesh external signer endpoint must be credential-free HTTPS');
    if (
      typeof options.expectedKeyId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(options.expectedKeyId)
    ) throw new TypeError('Mesh external signer key ID is invalid');
    const timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000)
      throw new TypeError('Mesh external signer timeout is invalid');
    const crypto = options.crypto ?? globalThis.crypto;
    if (!crypto?.subtle) throw new TypeError('Mesh external signer crypto is unavailable');
    this.#endpoint = endpoint;
    this.#expectedKeyId = options.expectedKeyId;
    this.#authorizationHeader = options.authorizationHeader;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = timeoutMs;
    this.#crypto = crypto;
  }

  async sign(input: Parameters<MeshExternalSignaturePort['sign']>[0]): Promise<Uint8Array> {
    if (
      input.algorithm !== MESH_SIGNATURE_ALGORITHM ||
      input.keyId !== this.#expectedKeyId ||
      !(input.signingBytes instanceof Uint8Array) ||
      input.signingBytes.byteLength < 1 ||
      input.signingBytes.byteLength > 65_536
    ) throw new MeshCryptoError('crypto_operation_failed');
    const body = {
      schemaVersion: 1,
      kind: 'agentplat-mesh-external-signature-request-v1',
      algorithm: input.algorithm,
      keyId: input.keyId,
      signingBytes: encodeBase64Url(input.signingBytes),
    } as const;
    const requestDigest = await digest(this.#crypto, body);
    const authorization = await this.#authorizationHeader?.();
    if (authorization !== undefined && authorization.trim() === '')
      throw new MeshCryptoError('crypto_operation_failed');
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(authorization === undefined ? {} : { authorization }),
        },
        body: JSON.stringify({ ...body, requestDigest }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch {
      throw new MeshCryptoError('crypto_operation_failed');
    }
    if (!response.ok || response.headers.get('content-type')?.split(';', 1)[0] !== 'application/json')
      throw new MeshCryptoError('crypto_operation_failed');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > 16_384)
      throw new MeshCryptoError('crypto_operation_failed');
    let value: unknown;
    try { value = JSON.parse(text); }
    catch { throw new MeshCryptoError('crypto_operation_failed'); }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new MeshCryptoError('crypto_operation_failed');
    const result = value as Record<string, unknown>;
    if (
      Object.keys(result).sort().join(',') !==
        'algorithm,keyId,kind,requestDigest,schemaVersion,signature' ||
      result.schemaVersion !== 1 ||
      result.kind !== 'agentplat-mesh-external-signature-response-v1' ||
      result.requestDigest !== requestDigest ||
      result.algorithm !== input.algorithm ||
      result.keyId !== input.keyId ||
      typeof result.signature !== 'string'
    ) throw new MeshCryptoError('crypto_operation_failed');
    const signature = decodeBase64Url(result.signature, 64);
    if (signature === undefined || signature.byteLength !== 64)
      throw new MeshCryptoError('crypto_operation_failed');
    return signature;
  }
}

export function createHttpMeshExternalSignaturePortV1(
  options: HttpMeshExternalSignaturePortOptionsV1,
): HttpMeshExternalSignaturePortV1 {
  return new HttpMeshExternalSignaturePortV1(options);
}

async function digest(crypto: Crypto, body: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(
    `agentplat-mesh-external-signature-request-v1\n${JSON.stringify(body)}`,
  );
  const value = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${encodeBase64Url(value)}`;
}
