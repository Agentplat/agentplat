import type {
  CollectiveSyncRequestPayloadV1,
  CollectiveSyncResponsePayloadV1,
  CollectiveSyncTransportV1,
  SignedCollectiveSyncEnvelopeV1,
} from "./contracts.js";
import { COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1 } from "./contracts.js";
import { validateSignedCollectiveSyncEnvelopeV1 } from "./codec.js";
import type { CollectiveSyncPeerV1 } from "./peer.js";

export interface CollectiveSyncHttpTransportOptionsV1 {
  readonly endpoints: Readonly<Record<string, string>>;
  readonly path?: string;
  readonly fetch?: typeof fetch;
  readonly headers?: Readonly<Record<string, string>>;
}

export class CollectiveSyncHttpTransportV1 implements CollectiveSyncTransportV1 {
  readonly #fetch: typeof fetch;
  readonly #path: string;
  constructor(readonly options: CollectiveSyncHttpTransportOptionsV1) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function")
      throw new TypeError("fetch is unavailable");
    this.#path = options.path ?? "/agentplat/collective-sync/v1/exchange";
  }
  async exchange<TRequest extends CollectiveSyncRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveSyncEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveSyncEnvelopeV1<CollectiveSyncResponsePayloadV1> | null> {
    const base = this.options.endpoints[input.peerId];
    if (!base) return null;
    const response = await this.#fetch(new URL(this.#path, base), {
      method: "POST",
      headers: { "content-type": "application/json", ...this.options.headers },
      body: JSON.stringify(input.request),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok)
      throw new Error(`collective_sync_http_${response.status}`);
    if (
      advertisedTooLarge(
        response.headers.get("content-length"),
        COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
      )
    )
      throw new Error("collective_sync_response_too_large");
    const text = await readBoundedUtf8(
      response.body,
      COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
      "collective_sync_response_too_large",
    );
    try {
      return validateSignedCollectiveSyncEnvelopeV1<CollectiveSyncResponsePayloadV1>(
        JSON.parse(text),
      );
    } catch {
      throw new Error("collective_sync_response_invalid_json");
    }
  }
}

export async function handleCollectiveSyncHttpRequestV1(
  peer: CollectiveSyncPeerV1,
  request: Request,
  options: { readonly path?: string } = {},
): Promise<Response> {
  const path = options.path ?? "/agentplat/collective-sync/v1/exchange";
  if (request.method !== "POST" || new URL(request.url).pathname !== path)
    return new Response(null, { status: 404 });
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (type !== "application/json") return new Response(null, { status: 415 });
  if (
    advertisedTooLarge(
      request.headers.get("content-length"),
      COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
    )
  )
    return new Response(null, { status: 413 });
  let text: string;
  try {
    text = await readBoundedUtf8(
      request.body,
      COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
      "collective_sync_request_too_large",
    );
  } catch (error) {
    return new Response(null, {
      status:
        error instanceof Error &&
        error.message === "collective_sync_request_too_large"
          ? 413
          : 400,
    });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const response = await peer.handle(value);
  return response
    ? Response.json(response, {
        status: 200,
        headers: { "cache-control": "no-store" },
      })
    : new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store" },
      });
}

function advertisedTooLarge(
  value: string | null,
  maximumBytes: number,
): boolean {
  if (value === null) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > maximumBytes;
}

async function readBoundedUtf8(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  overflowCode: string,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel(overflowCode).catch(() => undefined);
        throw new Error(overflowCode);
      }
      chunks.push(value.slice());
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("collective_sync_body_invalid_utf8");
  }
}
