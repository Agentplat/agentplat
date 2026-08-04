import type {
  CollectiveQuorumRequestPayloadV1,
  CollectiveQuorumResponsePayloadV1,
  CollectiveQuorumTransportV1,
  SignedCollectiveQuorumEnvelopeV1,
} from "./contracts.js";
import type { CollectiveQuorumPeerV1 } from "./peer.js";

const DEFAULT_MAXIMUM_RESPONSE_BYTES = 1_048_576;

export interface CollectiveQuorumHttpTransportOptionsV1 {
  readonly endpointForPeer: (peerId: string) => string | URL;
  readonly fetch?: typeof globalThis.fetch;
  readonly maximumResponseBytes?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

/** WHATWG Fetch transport; usable in Node, edge runtimes and service workers. */
export class CollectiveQuorumHttpTransportV1 implements CollectiveQuorumTransportV1 {
  readonly #fetch: typeof globalThis.fetch;
  readonly #maximumResponseBytes: number;

  constructor(readonly options: CollectiveQuorumHttpTransportOptionsV1) {
    if (!options || typeof options.endpointForPeer !== "function")
      throw new TypeError("endpointForPeer is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function")
      throw new TypeError("Fetch implementation is required");
    this.#maximumResponseBytes =
      options.maximumResponseBytes ?? DEFAULT_MAXIMUM_RESPONSE_BYTES;
    if (
      !Number.isSafeInteger(this.#maximumResponseBytes) ||
      this.#maximumResponseBytes < 1 ||
      this.#maximumResponseBytes > 8_388_608
    )
      throw new RangeError("maximumResponseBytes is out of range");
  }

  async exchange<TRequest extends CollectiveQuorumRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveQuorumEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1> | null> {
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
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > this.#maximumResponseBytes
    )
      return null;
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > this.#maximumResponseBytes)
      return null;
    try {
      return JSON.parse(
        text,
      ) as SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1>;
    } catch {
      return null;
    }
  }
}

/** Strict HTTP ingress boundary for one independently hosted quorum peer. */
export async function handleCollectiveQuorumHttpRequestV1(
  peer: CollectiveQuorumPeerV1,
  request: Request,
  options: { readonly maximumRequestBytes?: number } = {},
): Promise<Response> {
  const maximumRequestBytes =
    options.maximumRequestBytes ?? DEFAULT_MAXIMUM_RESPONSE_BYTES;
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json")
    return new Response(null, { status: 415 });
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumRequestBytes)
    return new Response(null, { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumRequestBytes)
    return new Response(null, { status: 413 });
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const result = await peer.handle(candidate);
  if (!result.accepted || !result.response)
    return Response.json({ code: result.code }, { status: 409 });
  return Response.json(result.response, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
