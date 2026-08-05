import type {
  CollectiveAgreementRequestPayloadV1,
  CollectiveAgreementResponsePayloadV1,
  CollectiveAgreementTransportV1,
  SignedCollectiveAgreementEnvelopeV1,
} from "./agreement-contracts.js";
import type { CollectiveAgreementPeerV1 } from "./agreement-peer.js";

const DEFAULT_MAXIMUM_BYTES = 1_048_576;

export interface CollectiveAgreementHttpTransportOptionsV1 {
  readonly endpointForPeer: (peerId: string) => string | URL;
  readonly fetch?: typeof globalThis.fetch;
  readonly maximumResponseBytes?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Bounded WHATWG Fetch transport with redirects disabled. */
export class CollectiveAgreementHttpTransportV1 implements CollectiveAgreementTransportV1 {
  readonly #fetch: typeof globalThis.fetch;
  readonly #maximumResponseBytes: number;

  constructor(readonly options: CollectiveAgreementHttpTransportOptionsV1) {
    if (!options || typeof options.endpointForPeer !== "function")
      throw new TypeError("endpointForPeer is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function")
      throw new TypeError("Fetch implementation is required");
    this.#maximumResponseBytes =
      options.maximumResponseBytes ?? DEFAULT_MAXIMUM_BYTES;
    if (
      !Number.isSafeInteger(this.#maximumResponseBytes) ||
      this.#maximumResponseBytes < 1 ||
      this.#maximumResponseBytes > 8_388_608
    )
      throw new RangeError("maximumResponseBytes is out of range");
  }

  async exchange<TRequest extends CollectiveAgreementRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveAgreementEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementResponsePayloadV1> | null> {
    const response = await this.#fetch(
      this.options.endpointForPeer(input.peerId),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...this.options.headers,
        },
        body: JSON.stringify(input.request),
        signal: input.signal,
        redirect: "error",
      },
    );
    if (!response.ok) return null;
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > this.#maximumResponseBytes)
      return null;
    const text = await readBoundedUtf8(
      response.body,
      this.#maximumResponseBytes,
    );
    if (text === null) return null;
    try {
      return JSON.parse(
        text,
      ) as SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementResponsePayloadV1>;
    } catch {
      return null;
    }
  }
}

export async function handleCollectiveAgreementHttpRequestV1(
  peer: CollectiveAgreementPeerV1,
  request: Request,
  options: {
    readonly maximumRequestBytes?: number;
    readonly onError?: (error: unknown) => void;
  } = {},
): Promise<Response> {
  const maximum = options.maximumRequestBytes ?? DEFAULT_MAXIMUM_BYTES;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 8_388_608)
    return new Response(null, { status: 500 });
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  if (
    request.headers.get("content-type")?.split(";", 1)[0] !== "application/json"
  )
    return new Response(null, { status: 415 });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum)
    return new Response(null, { status: 413 });
  const text = await readBoundedUtf8(request.body, maximum);
  if (text === null) return new Response(null, { status: 413 });
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    const result = await peer.handle(candidate);
    if (!result.accepted || !result.response)
      return Response.json({ code: result.code }, { status: 409 });
    return Response.json(result.response, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    options.onError?.(error);
    return new Response(null, { status: 500 });
  }
}

async function readBoundedUtf8(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<string | null> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(next.value, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
}
