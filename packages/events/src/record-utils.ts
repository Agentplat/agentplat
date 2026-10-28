import { AgentPlatError } from "@agentplat/core";

function portableText(value: string): void {
  if (value.includes("\u0000") || /[\uD800-\uDFFF]/u.test(value))
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Record text must be portable Unicode without NUL",
    );
}
export function eventTokenV1(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 1024 ||
    /[\u0000-\u001F\u007F]/u.test(value)
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Expected bounded record identity",
    );
  portableText(value);
}
export function eventTimestampV1(value: unknown): asserts value is string {
  try {
    if (typeof value !== "string" || new Date(value).toISOString() !== value)
      throw Error();
  } catch {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Expected canonical UTC timestamp",
    );
  }
}
/** Canonical finite JSON, bounded structurally before hashing or comparing identities. */
export function canonicalEventJsonV1(
  value: unknown,
  maximumBytes = 4_194_304,
): string {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0)
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid record byte budget");
  let nodes = 0,
    bytes = 0;
  const encoder = new TextEncoder();
  const reserve = (token: string) => {
    bytes += encoder.encode(token).length;
    if (bytes > maximumBytes)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Record exceeds byte budget",
      );
    return token;
  };
  const seen = new Set<object>();
  function visit(v: unknown, depth: number): string {
    if (typeof v === "string") portableText(v);
    if (++nodes > 1_000_000 || depth > 64)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Record JSON exceeds structural bounds",
      );
    if (typeof v === "string" && v.length > maximumBytes - bytes)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Record exceeds byte budget",
      );
    if (v === null || typeof v === "string" || typeof v === "boolean")
      return reserve(JSON.stringify(v));
    if (typeof v === "number" && Number.isFinite(v))
      return reserve(JSON.stringify(v));
    if (
      v &&
      typeof v === "object" &&
      (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype)
    ) {
      if (seen.has(v))
        throw new AgentPlatError("VALIDATION_ERROR", "Cyclic record JSON");
      if (
        Array.isArray(v) &&
        (Object.keys(v).length !== v.length ||
          !Array.from({ length: v.length }, (_, i) =>
            Object.hasOwn(v, i),
          ).every(Boolean))
      )
        throw new AgentPlatError(
          "VALIDATION_ERROR",
          "Sparse arrays are not JSON records",
        );
      seen.add(v);
      const parts: string[] = [];
      reserve(Array.isArray(v) ? "[" : "{");
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          if (i) reserve(",");
          parts.push(visit(v[i], depth + 1));
        }
      } else {
        const keys = Object.keys(v)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined);
        for (let i = 0; i < keys.length; i++) {
          if (i) reserve(",");
          const key = keys[i];
          portableText(key);
          if (key.length > maximumBytes - bytes)
            throw new AgentPlatError(
              "VALIDATION_ERROR",
              "Record exceeds byte budget",
            );
          const field = reserve(JSON.stringify(key));
          reserve(":");
          parts.push(
            `${field}:${visit((v as Record<string, unknown>)[key], depth + 1)}`,
          );
        }
      }
      reserve(Array.isArray(v) ? "]" : "}");
      const result = Array.isArray(v)
        ? `[${parts.join(",")}]`
        : `{${parts.join(",")}}`;
      seen.delete(v);
      return result;
    }
    throw new AgentPlatError("VALIDATION_ERROR", "Expected finite JSON data");
  }
  return visit(value, 0);
}
export function boundedEventJsonV1(
  value: unknown,
  maximumBytes = 65_536,
): string {
  return canonicalEventJsonV1(value, maximumBytes);
}
export async function eventRecordDigestV1(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalEventJsonV1(value));
  return `sha256:${[...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
/** Matches indexed PostgreSQL COLLATE "C" ordering for portable keyset pages. */
export function compareEventTokensV1(a: string, b: string): number {
  const left = new TextEncoder().encode(a),
    right = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++)
    if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}
