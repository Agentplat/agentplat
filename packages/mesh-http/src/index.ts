import {
  DEFAULT_MESH_PROTOCOL_LIMITS,
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
  parseSignedMeshEnvelope,
  validateSignedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import type {
  MeshProtocolOptions,
  MeshWireVersion,
  SignedMeshEnvelope,
} from "@agentplat/mesh-protocol";

export { createMeshHttpDurableOutboxDeliver } from "./durable-outbox.js";

export const MESH_HTTP_RECEIPT_SCHEMA_VERSION = 1 as const;
export const MESH_HTTP_V0_PATH = "/agentplat/mesh/v0/envelopes";
export const MESH_HTTP_V1_PATH = "/agentplat/mesh/v1/envelopes";
export const DEFAULT_MESH_HTTP_PATH = MESH_HTTP_V1_PATH;

export interface MeshHttpTarget {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
}

export interface MeshHttpEndpoint {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Required when delivering a compatibility v0 envelope. */
  readonly wireVersion?: MeshWireVersion;
}

export type MeshHttpEndpointResolver = (
  target: MeshHttpTarget,
) => MeshHttpEndpoint | Promise<MeshHttpEndpoint>;

export type MeshHttpDiagnostic =
  | {
      readonly kind: "client.failure";
      readonly code:
        | "aborted"
        | "endpoint_invalid"
        | "network_failure"
        | "response_invalid"
        | "response_too_large"
        | "timeout";
      readonly target: MeshHttpTarget;
    }
  | {
      readonly kind: "handler.failure";
      readonly code:
        | "acceptor_failure"
        | "authentication_failure"
        | "body_failure"
        | "scope_rejected";
      readonly messageId?: string;
    };

export type MeshHttpReceiptDisposition =
  "accepted" | "permanent_rejection" | "retryable";

export interface MeshHttpReceipt {
  readonly schemaVersion: typeof MESH_HTTP_RECEIPT_SCHEMA_VERSION;
  readonly disposition: MeshHttpReceiptDisposition;
  readonly messageId?: string;
  readonly retryAfterMs?: number;
}

export interface MeshHttpDeliveryResult {
  readonly receipt: MeshHttpReceipt;
  readonly status: number;
}

export interface MeshHttpDeliverInput {
  readonly envelope: SignedMeshEnvelope;
  /** Required for topic audiences; must match a direct audience when present. */
  readonly targetPeerId?: string;
  readonly signal?: AbortSignal;
}

export interface MeshHttpClientOptions {
  readonly resolveEndpoint: MeshHttpEndpointResolver;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly maximumResponseBytes?: number;
  readonly allowedSchemes?: readonly ("http:" | "https:")[];
  readonly protocolOptions?: MeshProtocolOptions;
  readonly onDiagnostic?: (diagnostic: MeshHttpDiagnostic) => void;
}

export interface MeshHttpClient {
  deliver(input: MeshHttpDeliverInput): Promise<MeshHttpDeliveryResult>;
}

export interface MeshHttpIngressContext {
  readonly target: MeshHttpTarget & { readonly instanceId: string };
  readonly request: Request;
}

export type MeshHttpIngressDecision =
  | {
      readonly accepted: true;
      /** Local-only detail. It is deliberately omitted from the HTTP receipt. */
      readonly duplicate?: boolean;
    }
  | {
      readonly accepted: false;
      readonly disposition: "permanent_rejection" | "retryable";
      readonly retryAfterMs?: number;
    };

export type MeshHttpChannelAuthenticator = (
  request: Request,
  target: MeshHttpIngressContext["target"],
) => boolean | Promise<boolean>;

export interface MeshHttpCorsPolicy {
  readonly allowedOrigins: readonly string[];
  readonly allowedRequestHeaders?: readonly string[];
  readonly maxAgeSeconds?: number;
}

export interface MeshHttpHandlerOptions {
  readonly target: MeshHttpIngressContext["target"];
  readonly accept: (
    envelope: SignedMeshEnvelope,
    context: MeshHttpIngressContext,
  ) => MeshHttpIngressDecision | Promise<MeshHttpIngressDecision>;
  readonly path?: string;
  /** Defaults to the current v1 route; v0 must be enabled explicitly. */
  readonly wireVersion?: MeshWireVersion;
  readonly authenticate?: MeshHttpChannelAuthenticator;
  readonly cors?: MeshHttpCorsPolicy;
  readonly maximumBodyBytes?: number;
  readonly protocolOptions?: MeshProtocolOptions;
  readonly onDiagnostic?: (diagnostic: MeshHttpDiagnostic) => void;
}

export type MeshHttpHandler = (request: Request) => Promise<Response>;

/** Creates an inert client. Delivery performs exactly one bounded HTTP attempt. */
export function createMeshHttpClient(
  options: MeshHttpClientOptions,
): MeshHttpClient {
  if (!options || typeof options.resolveEndpoint !== "function") {
    throw new TypeError("Mesh HTTP endpoint resolver is required");
  }
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("Mesh HTTP fetch implementation is required");
  }
  const timeoutMs = positiveInteger(
    options.timeoutMs ?? 10_000,
    "timeoutMs",
    120_000,
  );
  const maximumResponseBytes = positiveInteger(
    options.maximumResponseBytes ?? 16_384,
    "maximumResponseBytes",
    1_048_576,
  );
  const allowedSchemes = new Set(options.allowedSchemes ?? ["https:"]);
  if (
    allowedSchemes.size === 0 ||
    [...allowedSchemes].some(
      (scheme) => scheme !== "http:" && scheme !== "https:",
    )
  ) {
    throw new TypeError("Mesh HTTP allowed schemes are invalid");
  }

  return Object.freeze({
    async deliver(
      input: MeshHttpDeliverInput,
    ): Promise<MeshHttpDeliveryResult> {
      const validated = validateSignedMeshEnvelope(
        input?.envelope,
        options.protocolOptions,
      );
      if (!validated.ok) {
        throw new TypeError("Mesh HTTP delivery requires a signed envelope");
      }
      const envelope = validated.value;
      const target = targetFor(envelope, input.targetPeerId);
      let endpoint: MeshHttpEndpoint;
      try {
        endpoint = await options.resolveEndpoint(target);
      } catch {
        diagnostic(options, {
          kind: "client.failure",
          code: "endpoint_invalid",
          target,
        });
        return retryableResult(503);
      }
      let url: URL;
      let headers: Headers;
      try {
        ({ url, headers } = validateEndpoint(
          endpoint,
          allowedSchemes,
          envelope.wireVersion,
        ));
      } catch {
        diagnostic(options, {
          kind: "client.failure",
          code: "endpoint_invalid",
          target,
        });
        return permanentResult(422);
      }
      const body = canonicalizeMeshJsonBytes(envelope, options.protocolOptions);
      if (!body.ok) {
        throw new TypeError("Mesh HTTP envelope cannot be canonicalized");
      }
      const requestBody = new ArrayBuffer(body.value.byteLength);
      new Uint8Array(requestBody).set(body.value);
      headers.set("content-type", "application/json");
      headers.set("accept", "application/json");

      const timeoutController = new AbortController();
      const timer = setTimeout(
        () => timeoutController.abort("mesh_http_timeout"),
        timeoutMs,
      );
      const combined = combineSignals(input.signal, timeoutController.signal);
      try {
        const response = await fetchImplementation(url, {
          method: "POST",
          headers,
          body: requestBody,
          redirect: "manual",
          signal: combined.signal,
        });
        if (response.status >= 300 && response.status < 400) {
          diagnostic(options, {
            kind: "client.failure",
            code: "response_invalid",
            target,
          });
          return permanentResult(response.status);
        }
        const parsed = await readReceipt(response, maximumResponseBytes);
        if (!parsed.receipt) {
          diagnostic(options, {
            kind: "client.failure",
            code: parsed.tooLarge ? "response_too_large" : "response_invalid",
            target,
          });
          return response.status >= 500 || response.status === 429
            ? retryableResult(response.status)
            : permanentResult(response.status);
        }
        if (
          parsed.receipt.messageId !== undefined &&
          parsed.receipt.messageId !== envelope.messageId
        ) {
          diagnostic(options, {
            kind: "client.failure",
            code: "response_invalid",
            target,
          });
          return retryableResult(502);
        }
        if (!receiptMatchesStatus(parsed.receipt, response.status)) {
          diagnostic(options, {
            kind: "client.failure",
            code: "response_invalid",
            target,
          });
          return retryableResult(502);
        }
        return Object.freeze({
          receipt: parsed.receipt,
          status: response.status,
        });
      } catch (error) {
        const externalAbort = input.signal?.aborted === true;
        const timeout = timeoutController.signal.aborted && !externalAbort;
        const code = externalAbort
          ? "aborted"
          : timeout
            ? "timeout"
            : "network_failure";
        diagnostic(options, { kind: "client.failure", code, target });
        return retryableResult(externalAbort ? 499 : timeout ? 504 : 503);
      } finally {
        clearTimeout(timer);
        combined.cleanup();
      }
    },
  });
}

/** Creates an inert Fetch handler. No server or listener is started. */
export function createMeshHttpHandler(
  options: MeshHttpHandlerOptions,
): MeshHttpHandler {
  if (!options || typeof options.accept !== "function") {
    throw new TypeError("Mesh HTTP durable acceptor is required");
  }
  const target = freezeIngressTarget(options.target);
  const wireVersion = meshHttpWireVersion(
    options.wireVersion ?? MESH_WIRE_VERSION,
  );
  const path = exactPath(
    options.path ??
      (wireVersion === MESH_WIRE_VERSION
        ? MESH_HTTP_V1_PATH
        : MESH_HTTP_V0_PATH),
  );
  assertPathVersionCoherence(path, wireVersion);
  const protocolMaximum =
    options.protocolOptions?.limits?.maximumEnvelopeBytes ??
    DEFAULT_MESH_PROTOCOL_LIMITS.maximumEnvelopeBytes;
  const maximumBodyBytes = positiveInteger(
    options.maximumBodyBytes ?? protocolMaximum,
    "maximumBodyBytes",
    DEFAULT_MESH_PROTOCOL_LIMITS.maximumEnvelopeBytes,
  );
  const cors = normalizeCorsPolicy(options.cors);

  return async (request: Request): Promise<Response> => {
    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url);
    } catch {
      return receiptResponse(400, "permanent_rejection");
    }
    const origin = request.headers.get("origin");
    const respond = (
      status: number,
      disposition: MeshHttpReceiptDisposition,
      messageId?: string,
      retryAfterMs?: number,
    ) =>
      applyCors(
        receiptResponse(status, disposition, messageId, retryAfterMs),
        origin,
        cors,
      );
    if (request.method.toUpperCase() === "OPTIONS") {
      if (requestUrl.pathname !== path || requestUrl.search !== "") {
        return respond(405, "permanent_rejection");
      }
      return corsPreflight(request, cors);
    }
    if (
      request.method.toUpperCase() !== "POST" ||
      requestUrl.pathname !== path ||
      requestUrl.search !== ""
    ) {
      return respond(405, "permanent_rejection");
    }
    if (origin !== null && cors && !cors.allowedOrigins.has(origin)) {
      return receiptResponse(403, "permanent_rejection");
    }
    if (options.authenticate) {
      try {
        if (!(await options.authenticate(request, target))) {
          return respond(401, "permanent_rejection");
        }
      } catch {
        diagnostic(options, {
          kind: "handler.failure",
          code: "authentication_failure",
        });
        return respond(401, "permanent_rejection");
      }
    }
    const mediaType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== "application/json") {
      return respond(415, "permanent_rejection");
    }
    const encoding = request.headers
      .get("content-encoding")
      ?.trim()
      .toLowerCase();
    if (encoding && encoding !== "identity") {
      return respond(415, "permanent_rejection");
    }
    const declaredLength = request.headers.get("content-length");
    if (
      declaredLength !== null &&
      (!/^\d+$/u.test(declaredLength) ||
        Number(declaredLength) > maximumBodyBytes)
    ) {
      return respond(413, "permanent_rejection");
    }

    let bytes: Uint8Array;
    try {
      bytes = await readBoundedBody(request, maximumBodyBytes);
    } catch {
      diagnostic(options, { kind: "handler.failure", code: "body_failure" });
      return respond(413, "permanent_rejection");
    }
    const parsed = parseSignedMeshEnvelope(bytes, {
      ...options.protocolOptions,
      acceptedWireVersions: [wireVersion],
    });
    if (!parsed.ok) return respond(400, "permanent_rejection");
    const envelope = parsed.value;
    if (!envelopeTargets(envelope, target)) {
      diagnostic(options, {
        kind: "handler.failure",
        code: "scope_rejected",
        messageId: envelope.messageId,
      });
      return respond(422, "permanent_rejection");
    }

    let decision: MeshHttpIngressDecision;
    try {
      decision = await options.accept(envelope, { target, request });
      validateIngressDecision(decision);
    } catch {
      diagnostic(options, {
        kind: "handler.failure",
        code: "acceptor_failure",
        messageId: envelope.messageId,
      });
      return respond(503, "retryable", envelope.messageId);
    }
    if (decision.accepted) {
      return respond(202, "accepted", envelope.messageId);
    }
    const status =
      decision.disposition === "retryable"
        ? decision.retryAfterMs === undefined
          ? 503
          : 429
        : 422;
    return respond(
      status,
      decision.disposition,
      envelope.messageId,
      decision.retryAfterMs,
    );
  };
}

function targetFor(
  envelope: SignedMeshEnvelope,
  explicitPeerId: string | undefined,
): MeshHttpTarget {
  const audiencePeerId =
    envelope.audience.kind === "peer" ? envelope.audience.peerId : undefined;
  if (
    explicitPeerId !== undefined &&
    (!validIdentifier(explicitPeerId) ||
      (audiencePeerId !== undefined && explicitPeerId !== audiencePeerId))
  ) {
    throw new TypeError("Mesh HTTP target peer does not match the envelope");
  }
  const peerId = explicitPeerId ?? audiencePeerId;
  if (!peerId) {
    throw new TypeError("Mesh HTTP topic delivery requires targetPeerId");
  }
  return Object.freeze({
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    peerId,
  });
}

function validateEndpoint(
  endpoint: MeshHttpEndpoint,
  allowedSchemes: ReadonlySet<string>,
  envelopeWireVersion: MeshWireVersion,
): { url: URL; headers: Headers } {
  if (!endpoint || typeof endpoint !== "object") {
    throw new TypeError("Mesh HTTP endpoint is required");
  }
  const url = new URL(endpoint.url);
  const endpointWireVersion = meshHttpWireVersion(
    endpoint.wireVersion ?? MESH_WIRE_VERSION,
  );
  if (
    endpointWireVersion !== envelopeWireVersion ||
    !allowedSchemes.has(url.protocol) ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError("Mesh HTTP endpoint URL is not allowed");
  }
  assertPathVersionCoherence(url.pathname, endpointWireVersion);
  const headers = new Headers();
  for (const [name, value] of Object.entries(endpoint.headers ?? {})) {
    const lower = name.toLowerCase();
    if (
      [
        "accept",
        "connection",
        "content-length",
        "content-type",
        "host",
        "transfer-encoding",
      ].includes(lower) ||
      typeof value !== "string" ||
      value.length > 8_192
    ) {
      throw new TypeError("Mesh HTTP endpoint header is not allowed");
    }
    headers.set(name, value);
  }
  return { url, headers };
}

function freezeIngressTarget(
  target: MeshHttpIngressContext["target"],
): MeshHttpIngressContext["target"] {
  if (!target || typeof target !== "object") {
    throw new TypeError("Mesh HTTP ingress target is required");
  }
  const fields = ["tenantId", "meshId", "peerId", "instanceId"] as const;
  for (const field of fields) {
    if (!validIdentifier(target[field])) {
      throw new TypeError(`Mesh HTTP ingress ${field} is required`);
    }
  }
  return Object.freeze({
    tenantId: target.tenantId,
    meshId: target.meshId,
    peerId: target.peerId,
    instanceId: target.instanceId,
  });
}

function exactPath(value: string): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.length > 1_024
  ) {
    throw new TypeError("Mesh HTTP path must be an exact absolute path");
  }
  return value;
}

function meshHttpWireVersion(value: MeshWireVersion): MeshWireVersion {
  if (value !== MESH_PREVIOUS_WIRE_VERSION && value !== MESH_WIRE_VERSION) {
    throw new TypeError("Mesh HTTP wire version is unsupported");
  }
  return value;
}

function assertPathVersionCoherence(
  path: string,
  wireVersion: MeshWireVersion,
): void {
  if (
    (path === MESH_HTTP_V0_PATH &&
      wireVersion !== MESH_PREVIOUS_WIRE_VERSION) ||
    (path === MESH_HTTP_V1_PATH && wireVersion !== MESH_WIRE_VERSION)
  ) {
    throw new TypeError("Mesh HTTP path and wire version do not match");
  }
}

interface NormalizedCorsPolicy {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly allowedRequestHeaders: ReadonlySet<string>;
  readonly maxAgeSeconds: number;
}

function normalizeCorsPolicy(
  policy: MeshHttpCorsPolicy | undefined,
): NormalizedCorsPolicy | undefined {
  if (policy === undefined) return undefined;
  if (
    !policy ||
    !Array.isArray(policy.allowedOrigins) ||
    policy.allowedOrigins.length < 1 ||
    policy.allowedOrigins.length > 64
  ) {
    throw new TypeError("Mesh HTTP CORS origins are invalid");
  }
  const allowedOrigins = new Set<string>();
  for (const origin of policy.allowedOrigins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new TypeError("Mesh HTTP CORS origin is invalid");
    }
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.origin !== origin ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      allowedOrigins.has(origin)
    ) {
      throw new TypeError("Mesh HTTP CORS origin is invalid");
    }
    allowedOrigins.add(origin);
  }
  const requestHeaders = policy.allowedRequestHeaders ?? [
    "authorization",
    "content-type",
  ];
  if (
    !Array.isArray(requestHeaders) ||
    requestHeaders.length > 32 ||
    requestHeaders.some(
      (header) =>
        typeof header !== "string" ||
        header !== header.toLowerCase() ||
        !/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(header),
    )
  ) {
    throw new TypeError("Mesh HTTP CORS request headers are invalid");
  }
  const allowedRequestHeaders = new Set(requestHeaders);
  if (allowedRequestHeaders.size !== requestHeaders.length) {
    throw new TypeError("Mesh HTTP CORS request headers are invalid");
  }
  const maxAgeSeconds = policy.maxAgeSeconds ?? 600;
  if (
    !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds < 0 ||
    maxAgeSeconds > 86_400
  ) {
    throw new RangeError("Mesh HTTP CORS maxAgeSeconds is outside its range");
  }
  return Object.freeze({
    allowedOrigins,
    allowedRequestHeaders,
    maxAgeSeconds,
  });
}

function corsPreflight(
  request: Request,
  policy: NormalizedCorsPolicy | undefined,
): Response {
  if (!policy) return receiptResponse(405, "permanent_rejection");
  const origin = request.headers.get("origin");
  const method = request.headers.get("access-control-request-method");
  const requestedHeaders = (
    request.headers.get("access-control-request-headers") ?? ""
  )
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (
    origin === null ||
    !policy.allowedOrigins.has(origin) ||
    method?.toUpperCase() !== "POST" ||
    requestedHeaders.some((header) => !policy.allowedRequestHeaders.has(header))
  ) {
    return receiptResponse(403, "permanent_rejection");
  }
  const headers = new Headers({
    "access-control-allow-methods": "POST",
    "access-control-allow-origin": origin,
    "cache-control": "no-store",
    vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  });
  if (policy.allowedRequestHeaders.size > 0) {
    headers.set(
      "access-control-allow-headers",
      [...policy.allowedRequestHeaders].join(", "),
    );
  }
  headers.set("access-control-max-age", String(policy.maxAgeSeconds));
  return new Response(null, { status: 204, headers });
}

function applyCors(
  response: Response,
  origin: string | null,
  policy: NormalizedCorsPolicy | undefined,
): Response {
  if (!origin || !policy?.allowedOrigins.has(origin)) return response;
  response.headers.set("access-control-allow-origin", origin);
  response.headers.append("vary", "Origin");
  return response;
}

function envelopeTargets(
  envelope: SignedMeshEnvelope,
  target: MeshHttpIngressContext["target"],
): boolean {
  return (
    envelope.tenantId === target.tenantId &&
    envelope.meshId === target.meshId &&
    (envelope.audience.kind !== "peer" ||
      envelope.audience.peerId === target.peerId)
  );
}

async function readBoundedBody(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  return readBoundedStream(request.body, maximumBytes);
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) {
        await reader.cancel("mesh_http_non_byte_stream").catch(() => undefined);
        throw new TypeError("Mesh HTTP body stream must contain bytes");
      }
      length += next.value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel("mesh_http_body_too_large").catch(() => undefined);
        throw new RangeError("request_too_large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function readReceipt(
  response: Response,
  maximumBytes: number,
): Promise<{ receipt?: MeshHttpReceipt; tooLarge?: boolean }> {
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") return {};
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedStream(response.body, maximumBytes);
  } catch (error) {
    return error instanceof RangeError ? { tooLarge: true } : {};
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return {};
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }
  const record = candidate as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const allowed = ["disposition", "messageId", "retryAfterMs", "schemaVersion"];
  if (keys.some((key) => !allowed.includes(key))) return {};
  if (
    record.schemaVersion !== MESH_HTTP_RECEIPT_SCHEMA_VERSION ||
    !["accepted", "permanent_rejection", "retryable"].includes(
      String(record.disposition),
    ) ||
    (record.messageId !== undefined && typeof record.messageId !== "string") ||
    (record.retryAfterMs !== undefined &&
      (!Number.isSafeInteger(record.retryAfterMs) ||
        Number(record.retryAfterMs) < 1 ||
        Number(record.retryAfterMs) > 3_600_000)) ||
    (record.disposition !== "retryable" && record.retryAfterMs !== undefined)
  ) {
    return {};
  }
  return {
    receipt: Object.freeze({
      schemaVersion: MESH_HTTP_RECEIPT_SCHEMA_VERSION,
      disposition: record.disposition as MeshHttpReceiptDisposition,
      ...(record.messageId === undefined
        ? {}
        : { messageId: record.messageId as string }),
      ...(record.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: record.retryAfterMs as number }),
    }),
  };
}

function validateIngressDecision(decision: MeshHttpIngressDecision): void {
  if (!decision || typeof decision !== "object") {
    throw new TypeError("Mesh HTTP ingress decision is invalid");
  }
  const keys = Object.keys(decision).sort();
  if (decision.accepted === true) {
    if (
      keys.some((key) => !["accepted", "duplicate"].includes(key)) ||
      (decision.duplicate !== undefined &&
        typeof decision.duplicate !== "boolean")
    ) {
      throw new TypeError("Mesh HTTP ingress decision is invalid");
    }
    return;
  }
  if (
    decision.accepted !== false ||
    keys.some(
      (key) => !["accepted", "disposition", "retryAfterMs"].includes(key),
    ) ||
    !["permanent_rejection", "retryable"].includes(decision.disposition) ||
    (decision.retryAfterMs !== undefined &&
      (decision.disposition !== "retryable" ||
        !Number.isSafeInteger(decision.retryAfterMs) ||
        decision.retryAfterMs < 1 ||
        decision.retryAfterMs > 3_600_000))
  ) {
    throw new TypeError("Mesh HTTP ingress decision is invalid");
  }
}

function receiptMatchesStatus(
  receipt: MeshHttpReceipt,
  status: number,
): boolean {
  if (receipt.disposition === "accepted") return status >= 200 && status < 300;
  if (receipt.disposition === "retryable") {
    return status === 429 || status >= 500;
  }
  return status >= 400 && status < 500 && status !== 429;
}

function receiptResponse(
  status: number,
  disposition: MeshHttpReceiptDisposition,
  messageId?: string,
  retryAfterMs?: number,
): Response {
  const receipt: MeshHttpReceipt = {
    schemaVersion: MESH_HTTP_RECEIPT_SCHEMA_VERSION,
    disposition,
    ...(messageId === undefined ? {} : { messageId }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json",
  });
  if (retryAfterMs !== undefined) {
    headers.set(
      "retry-after",
      String(Math.max(1, Math.ceil(retryAfterMs / 1_000))),
    );
  }
  return new Response(JSON.stringify(receipt), { status, headers });
}

function retryableResult(status: number): MeshHttpDeliveryResult {
  return Object.freeze({
    status,
    receipt: Object.freeze({
      schemaVersion: MESH_HTTP_RECEIPT_SCHEMA_VERSION,
      disposition: "retryable",
    }),
  });
}

function permanentResult(status: number): MeshHttpDeliveryResult {
  return Object.freeze({
    status,
    receipt: Object.freeze({
      schemaVersion: MESH_HTTP_RECEIPT_SCHEMA_VERSION,
      disposition: "permanent_rejection",
    }),
  });
}

function combineSignals(
  external: AbortSignal | undefined,
  timeout: AbortSignal,
): { signal: AbortSignal; cleanup(): void } {
  if (!external) return { signal: timeout, cleanup() {} };
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(external.reason);
  const abortFromTimeout = () => controller.abort(timeout.reason);
  if (external.aborted) abortFromExternal();
  else external.addEventListener("abort", abortFromExternal, { once: true });
  if (timeout.aborted) abortFromTimeout();
  else timeout.addEventListener("abort", abortFromTimeout, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      external.removeEventListener("abort", abortFromExternal);
      timeout.removeEventListener("abort", abortFromTimeout);
    },
  };
}

function diagnostic(
  options: { readonly onDiagnostic?: (diagnostic: MeshHttpDiagnostic) => void },
  value: MeshHttpDiagnostic,
): void {
  try {
    options.onDiagnostic?.(Object.freeze(value));
  } catch {
    // Diagnostics never change a transport decision.
  }
}

function positiveInteger(value: number, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`Mesh HTTP ${name} is outside its supported range`);
  }
  return value;
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    new TextEncoder().encode(value).byteLength <= 256 &&
    /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u.test(value)
  );
}
