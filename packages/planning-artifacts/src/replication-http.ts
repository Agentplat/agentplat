import {
  PLANNING_ARTIFACT_REPLICATION_MAX_CANONICAL_BYTES_V1,
  type PlanningArtifactReplicationHttpTransportOptionsV1,
  type PlanningArtifactReplicationRequestPayloadV1,
  type PlanningArtifactReplicationResponsePayloadV1,
  type PlanningArtifactReplicationTransportV1,
  type SignedPlanningArtifactReplicationEnvelopeV1,
} from "./replication-contracts.js";
import { validateSignedPlanningArtifactReplicationEnvelopeV1 } from "./replication-codec.js";
import type { PlanningArtifactReplicationPeerV1 } from "./replication.js";

export class PlanningArtifactReplicationHttpTransportV1 implements PlanningArtifactReplicationTransportV1 {
  readonly #fetch: typeof fetch;
  readonly #path: string;
  readonly #endpoints: Readonly<Record<string, string>>;

  constructor(
    readonly options: PlanningArtifactReplicationHttpTransportOptionsV1,
  ) {
    if (!options || !plainRecord(options.endpoints))
      throw new TypeError("planning_artifact_replication_endpoints_invalid");
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function")
      throw new TypeError("fetch is unavailable");
    this.#path = options.path ?? "/agentplat/planning-artifacts/v1/replicate";
    if (!safePath(this.#path))
      throw new TypeError("planning_artifact_replication_path_invalid");
    this.#endpoints = Object.freeze(
      Object.fromEntries(
        Object.entries(options.endpoints).map(([peerId, endpoint]) => {
          if (!peerId || !safeEndpoint(endpoint))
            throw new TypeError(
              "planning_artifact_replication_endpoint_invalid",
            );
          return [peerId, endpoint];
        }),
      ),
    );
  }

  async exchange(input: {
    readonly peerId: string;
    readonly request: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationRequestPayloadV1>;
    readonly signal?: AbortSignal;
  }): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationResponsePayloadV1> | null> {
    const base = this.#endpoints[input.peerId];
    if (!base) return null;
    const response = await this.#fetch(new URL(this.#path, base), {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", ...this.options.headers },
      body: JSON.stringify(input.request),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok)
      throw new Error(`planning_artifact_replication_http_${response.status}`);
    if (
      advertisedTooLarge(
        response.headers.get("content-length"),
        PLANNING_ARTIFACT_REPLICATION_MAX_CANONICAL_BYTES_V1,
      )
    )
      throw new Error("planning_artifact_replication_response_too_large");
    const text = await readBoundedUtf8(
      response.body,
      PLANNING_ARTIFACT_REPLICATION_MAX_CANONICAL_BYTES_V1,
      "planning_artifact_replication_response_too_large",
    );
    try {
      return validateSignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationResponsePayloadV1>(
        JSON.parse(text),
      );
    } catch {
      throw new Error("planning_artifact_replication_response_invalid_json");
    }
  }
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

export async function handlePlanningArtifactReplicationHttpRequestV1(
  peer: PlanningArtifactReplicationPeerV1,
  request: Request,
  options: { readonly path?: string } = {},
): Promise<Response> {
  const path = options.path ?? "/agentplat/planning-artifacts/v1/replicate";
  if (request.method !== "POST" || new URL(request.url).pathname !== path)
    return new Response(null, { status: 404 });
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (type !== "application/json") return new Response(null, { status: 415 });
  if (
    advertisedTooLarge(
      request.headers.get("content-length"),
      PLANNING_ARTIFACT_REPLICATION_MAX_CANONICAL_BYTES_V1,
    )
  )
    return new Response(null, { status: 413 });
  let text: string;
  try {
    text = await readBoundedUtf8(
      request.body,
      PLANNING_ARTIFACT_REPLICATION_MAX_CANONICAL_BYTES_V1,
      "planning_artifact_replication_request_too_large",
    );
  } catch (error) {
    return new Response(null, {
      status:
        error instanceof Error &&
        error.message === "planning_artifact_replication_request_too_large"
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
  } catch {
    return new Response(null, {
      status: 409,
      headers: { "cache-control": "no-store" },
    });
  }
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
    throw new Error("planning_artifact_replication_body_invalid_utf8");
  }
}
