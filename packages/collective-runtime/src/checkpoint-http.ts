import {
  EXECUTION_CHECKPOINT_HTTP_PATH_V1,
  type ExecutionCheckpointRequestPayloadV1,
  type ExecutionCheckpointResponsePayloadV1,
  type ExecutionCheckpointTransportV1,
  type SignedExecutionCheckpointEnvelopeV1,
} from "./checkpoint-contracts.js";
import type { ExecutionCheckpointReplicationPeerV1 } from "./checkpoint-replication.js";

const DEFAULT_MAXIMUM_MESSAGE_BYTES = 17 * 1_024 * 1_024;

export interface ExecutionCheckpointHttpTransportOptionsV1 {
  readonly endpoints: Readonly<Record<string, string>>;
  readonly path?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly maximumMessageBytes?: number;
  readonly fetch?: typeof fetch;
}

export class ExecutionCheckpointHttpTransportV1 implements ExecutionCheckpointTransportV1 {
  readonly #fetch: typeof fetch;
  readonly #path: string;
  readonly #maximum: number;
  readonly #endpoints: Readonly<Record<string, string>>;

  constructor(readonly options: ExecutionCheckpointHttpTransportOptionsV1) {
    if (!options || !plainRecord(options.endpoints))
      throw new TypeError("execution_checkpoint_endpoints_invalid");
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function")
      throw new TypeError("execution_checkpoint_fetch_unavailable");
    this.#path = options.path ?? EXECUTION_CHECKPOINT_HTTP_PATH_V1;
    if (!safePath(this.#path))
      throw new TypeError("execution_checkpoint_path_invalid");
    this.#maximum = byteLimit(options.maximumMessageBytes);
    this.#endpoints = Object.freeze(
      Object.fromEntries(
        Object.entries(options.endpoints).map(([peerId, endpoint]) => {
          if (!peerId || !safeEndpoint(endpoint))
            throw new TypeError("execution_checkpoint_endpoint_invalid");
          return [peerId, endpoint];
        }),
      ),
    );
  }

  async exchange(input: {
    readonly peerId: string;
    readonly request: SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointRequestPayloadV1>;
    readonly signal?: AbortSignal;
  }): Promise<SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointResponsePayloadV1> | null> {
    const endpoint = this.#endpoints[input.peerId];
    if (!endpoint) return null;
    const body = JSON.stringify(input.request);
    if (new TextEncoder().encode(body).byteLength > this.#maximum)
      throw new RangeError("execution_checkpoint_request_too_large");
    const response = await this.#fetch(new URL(this.#path, endpoint), {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", ...this.options.headers },
      body,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok)
      throw new Error(`execution_checkpoint_http_${response.status}`);
    if (
      advertisedTooLarge(response.headers.get("content-length"), this.#maximum)
    )
      throw new RangeError("execution_checkpoint_response_too_large");
    const text = await readBoundedUtf8(response.body, this.#maximum);
    try {
      const value: unknown = JSON.parse(text);
      return record(value)
        ? (value as unknown as SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointResponsePayloadV1>)
        : null;
    } catch {
      throw new Error("execution_checkpoint_response_invalid_json");
    }
  }
}

export async function handleExecutionCheckpointHttpRequestV1(
  peer: ExecutionCheckpointReplicationPeerV1,
  request: Request,
  options: {
    readonly path?: string;
    readonly maximumMessageBytes?: number;
    readonly onError?: (error: unknown) => void;
  } = {},
): Promise<Response> {
  const path = options.path ?? EXECUTION_CHECKPOINT_HTTP_PATH_V1;
  const maximum = byteLimit(options.maximumMessageBytes);
  if (!safePath(path)) return new Response(null, { status: 500 });
  if (request.method !== "POST" || new URL(request.url).pathname !== path)
    return new Response(null, { status: 404 });
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "application/json"
  )
    return new Response(null, { status: 415 });
  if (advertisedTooLarge(request.headers.get("content-length"), maximum))
    return new Response(null, { status: 413 });
  let value: unknown;
  try {
    value = JSON.parse(await readBoundedUtf8(request.body, maximum));
  } catch (error) {
    return new Response(null, {
      status:
        error instanceof RangeError &&
        error.message === "execution_checkpoint_message_too_large"
          ? 413
          : 400,
    });
  }
  try {
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
  } catch (error) {
    try {
      options.onError?.(error);
    } catch {
      // Observability hooks never alter protocol behavior.
    }
    return new Response(null, {
      status: 409,
      headers: { "cache-control": "no-store" },
    });
  }
}

function byteLimit(input?: number): number {
  const value = input ?? DEFAULT_MAXIMUM_MESSAGE_BYTES;
  if (
    !Number.isSafeInteger(value) ||
    value < 1_024 ||
    value > 32 * 1_024 * 1_024
  )
    throw new TypeError("execution_checkpoint_message_limit_invalid");
  return value;
}
function plainRecord(
  value: unknown,
): value is Readonly<Record<string, string>> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safePath(value: string): boolean {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return false;
  const parsed = new URL(value, "https://agentplat.invalid");
  return (
    parsed.origin === "https://agentplat.invalid" &&
    parsed.pathname === value &&
    parsed.search === "" &&
    parsed.hash === ""
  );
}
function safeEndpoint(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}
function advertisedTooLarge(value: string | null, maximum: number): boolean {
  if (value === null) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > maximum;
}
async function readBoundedUtf8(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
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
      if (total > maximum) {
        await reader.cancel().catch(() => undefined);
        throw new RangeError("execution_checkpoint_message_too_large");
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
    throw new TypeError("execution_checkpoint_message_invalid_utf8");
  }
}
