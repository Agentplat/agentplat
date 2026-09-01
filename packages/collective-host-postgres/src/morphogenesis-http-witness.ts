import { createHash } from "node:crypto";
import type { MorphogenesisPostgresRollbackWitnessV1 } from "./morphogenesis.js";

type VerifyInput = Parameters<MorphogenesisPostgresRollbackWitnessV1["verify"]>[0];
type RecordInput = Parameters<MorphogenesisPostgresRollbackWitnessV1["record"]>[0];

export interface HttpMorphogenesisRollbackWitnessOptionsV1 {
  readonly endpoint: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly authorizationHeader?: () => Promise<string>;
  readonly timeoutMs?: number;
}

/**
 * Fail-closed HTTPS client for a monotonic witness operated outside the
 * PostgreSQL and workload protection domains. The service owns durability;
 * this adapter never caches or manufactures a witness head.
 */
export class HttpMorphogenesisRollbackWitnessV1
  implements MorphogenesisPostgresRollbackWitnessV1
{
  readonly #endpoint: URL;
  readonly #fetch: typeof globalThis.fetch;
  readonly #authorizationHeader?: () => Promise<string>;
  readonly #timeoutMs: number;

  constructor(options: HttpMorphogenesisRollbackWitnessOptionsV1) {
    const endpoint = new URL(options.endpoint);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username !== "" ||
      endpoint.password !== "" ||
      endpoint.search !== "" ||
      endpoint.hash !== ""
    )
      throw new TypeError("Morphogenesis rollback witness endpoint must be credential-free HTTPS");
    const timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000)
      throw new TypeError("Morphogenesis rollback witness timeout is invalid");
    this.#endpoint = endpoint;
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function")
      throw new TypeError("Morphogenesis rollback witness fetch is unavailable");
    this.#authorizationHeader = options.authorizationHeader;
    this.#timeoutMs = timeoutMs;
  }

  async verify(input: VerifyInput): Promise<boolean> {
    return this.#request("verify", validateVerify(input));
  }

  async record(input: RecordInput): Promise<boolean> {
    return this.#request("record", validateRecord(input));
  }

  async #request(
    operation: "verify" | "record",
    input: VerifyInput | RecordInput,
  ): Promise<boolean> {
    const bodyWithoutDigest = {
      schemaVersion: 1,
      kind: `agentplat-morphogenesis-rollback-witness-${operation}-request-v1`,
      operation,
      input,
    } as const;
    const requestDigest = digest(
      `agentplat-morphogenesis-rollback-witness-${operation}-request-v1`,
      bodyWithoutDigest,
    );
    const authorization = await this.#authorizationHeader?.();
    if (authorization !== undefined && authorization.trim() === "")
      throw new TypeError("Morphogenesis rollback witness authorization is empty");
    const response = await this.#fetch(
      new URL(`v1/${operation}`, normalizedBase(this.#endpoint)),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(authorization === undefined ? {} : { authorization }),
        },
        body: JSON.stringify({ ...bodyWithoutDigest, requestDigest }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      },
    );
    if (!response.ok)
      throw new Error("Morphogenesis rollback witness request failed closed");
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0];
    if (mediaType !== "application/json")
      throw new Error("Morphogenesis rollback witness response type is invalid");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 16_384)
      throw new Error("Morphogenesis rollback witness response is oversized");
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("Morphogenesis rollback witness response is invalid JSON");
    }
    const result = validateResponse(value, operation, requestDigest);
    if (!result.accepted) return false;
    const expectedRevision = operation === "verify"
      ? (input as VerifyInput).revision
      : (input as RecordInput).nextRevision;
    const expectedDigest = operation === "verify"
      ? (input as VerifyInput).digest
      : (input as RecordInput).nextDigest;
    if (
      result.head === null ||
      result.head.revision !== expectedRevision ||
      result.head.digest !== expectedDigest
    )
      throw new Error("Morphogenesis rollback witness accepted a divergent head");
    return true;
  }
}

function validateVerify(input: VerifyInput): VerifyInput {
  exactKeys(input, ["digest", "revision", "scopeId", "stateKey", "stateKind"]);
  common(input);
  revision(input.revision, "witness revision");
  sha(input.digest, "witness digest");
  return Object.freeze({ ...input });
}

function validateRecord(input: RecordInput): RecordInput {
  exactKeys(input, [
    "nextDigest", "nextRevision", "previousDigest", "previousRevision",
    "scopeId", "stateKey", "stateKind",
  ]);
  common(input);
  revision(input.nextRevision, "witness next revision");
  sha(input.nextDigest, "witness next digest");
  if ((input.previousRevision === null) !== (input.previousDigest === null))
    throw new TypeError("Morphogenesis rollback witness predecessor is incomplete");
  if (input.previousRevision === null) {
    if (input.nextRevision !== 0)
      throw new TypeError("Morphogenesis rollback witness initial revision is invalid");
  } else {
    revision(input.previousRevision, "witness previous revision");
    sha(input.previousDigest, "witness previous digest");
    if (input.nextRevision !== input.previousRevision + 1)
      throw new TypeError("Morphogenesis rollback witness revision is discontinuous");
  }
  return Object.freeze({ ...input });
}

function validateResponse(
  input: unknown,
  operation: "verify" | "record",
  requestDigest: string,
): {
  readonly accepted: boolean;
  readonly head: { readonly revision: number; readonly digest: `sha256:${string}` } | null;
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Morphogenesis rollback witness response is invalid");
  const value = input as Record<string, unknown>;
  exactKeys(value, ["accepted", "head", "kind", "requestDigest", "schemaVersion"]);
  if (
    value.schemaVersion !== 1 ||
    value.kind !== `agentplat-morphogenesis-rollback-witness-${operation}-response-v1` ||
    value.requestDigest !== requestDigest ||
    typeof value.accepted !== "boolean"
  )
    throw new Error("Morphogenesis rollback witness response binding is invalid");
  if (value.head === null) return { accepted: value.accepted, head: null };
  if (!value.head || typeof value.head !== "object" || Array.isArray(value.head))
    throw new Error("Morphogenesis rollback witness head is invalid");
  const head = value.head as Record<string, unknown>;
  exactKeys(head, ["digest", "revision"]);
  revision(head.revision, "witness response revision");
  sha(head.digest, "witness response digest");
  return {
    accepted: value.accepted,
    head: {
      revision: head.revision as number,
      digest: head.digest as `sha256:${string}`,
    },
  };
}

function common(input: VerifyInput | RecordInput) {
  identifier(input.scopeId, "witness scope ID");
  identifier(input.stateKey, "witness state key");
  if (!new Set([
    "morphology-head",
    "morphogenesis-execution",
    "morphogenesis-budget-reservation",
  ]).has(input.stateKind))
    throw new TypeError("Morphogenesis rollback witness state kind is invalid");
}

function exactKeys(input: object, expected: readonly string[]) {
  const actual = Object.keys(input).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index]))
    throw new TypeError("Morphogenesis rollback witness object shape is invalid");
}

function identifier(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function revision(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} is invalid`);
}

function sha(value: unknown, label: string): asserts value is `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function normalizedBase(endpoint: URL) {
  const value = new URL(endpoint);
  value.pathname = `${value.pathname.replace(/\/+$/u, "")}/`;
  return value;
}

function digest(domain: string, value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(`${domain}\n${JSON.stringify(value)}`)
    .digest("hex")}`;
}
