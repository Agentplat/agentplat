import type {
  CollectiveMembershipRequestPayloadV1,
  CollectiveMembershipResponsePayloadV1,
  CollectiveMembershipTransportV1,
  SignedCollectiveMembershipEnvelopeV1,
} from "./contracts.js";
import type { CollectiveMembershipPeerV1 } from "./peer.js";

const DEFAULT_MAXIMUM_BYTES = 1_048_576;

export class CollectiveMembershipHttpTransportV1 implements CollectiveMembershipTransportV1 {
  readonly #fetch: typeof globalThis.fetch;
  readonly #maximumResponseBytes: number;

  constructor(
    readonly options: {
      readonly endpointForPeer: (peerId: string) => string | URL;
      readonly fetch?: typeof globalThis.fetch;
      readonly maximumResponseBytes?: number;
      readonly headers?: Readonly<Record<string, string>>;
    },
  ) {
    if (!options || typeof options.endpointForPeer !== "function")
      throw new TypeError("endpointForPeer is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#maximumResponseBytes =
      options.maximumResponseBytes ?? DEFAULT_MAXIMUM_BYTES;
    if (
      typeof this.#fetch !== "function" ||
      !validByteLimit(this.#maximumResponseBytes)
    )
      throw new TypeError("Valid fetch and response limit are required");
  }

  async exchange<TRequest extends CollectiveMembershipRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveMembershipEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1> | null> {
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
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > this.#maximumResponseBytes) return null;
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }
}

export async function handleCollectiveMembershipHttpRequestV1(
  peer: CollectiveMembershipPeerV1,
  request: Request,
  options: { readonly maximumRequestBytes?: number } = {},
): Promise<Response> {
  const maximum = options.maximumRequestBytes ?? DEFAULT_MAXIMUM_BYTES;
  if (!validByteLimit(maximum))
    throw new RangeError("maximumRequestBytes is out of range");
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  if (
    request.headers.get("content-type")?.split(";", 1)[0] !== "application/json"
  )
    return new Response(null, { status: 415 });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum)
    return new Response(null, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maximum) return new Response(null, { status: 413 });
  let candidate: unknown;
  try {
    candidate = JSON.parse(new TextDecoder().decode(bytes));
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

function validByteLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 8_388_608;
}
