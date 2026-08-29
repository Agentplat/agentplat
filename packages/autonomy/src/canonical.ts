import type { JsonValue } from "@agentplat/core";

import { sha256HexAutonomyV1 } from "./sha256.js";

const encoder = new TextEncoder();

export type AutonomyDigestV1 = `sha256:${string}`;

export class AutonomyValidationErrorV1 extends TypeError {
  readonly name = "AutonomyValidationErrorV1";
}

export function canonicalizeAutonomyJsonV1(value: JsonValue): string {
  return canonical(value, new Set(), 0, { nodes: 0 });
}

export function digestAutonomyJsonV1(
  domain: string,
  value: JsonValue,
): AutonomyDigestV1 {
  token(domain, "digest_domain");
  const bytes = encoder.encode(
    `agentplat.autonomy/${domain}/v1\0${canonicalizeAutonomyJsonV1(value)}`,
  );
  if (bytes.byteLength > 1_048_576) fail("autonomy_digest_input_too_large");
  return `sha256:${sha256HexAutonomyV1(bytes)}`;
}

export function deepFreezeAutonomyV1<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === "object" && !seen.has(value as object)) {
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreezeAutonomyV1(child, seen);
    Object.freeze(value);
  }
  return value;
}

function canonical(
  value: unknown,
  seen: Set<object>,
  depth: number,
  count: { nodes: number },
): string {
  if (depth > 32) fail("autonomy_json_depth_exceeded");
  if (++count.nodes > 16_384) fail("autonomy_json_nodes_exceeded");
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value))
    )
      fail("autonomy_json_number_invalid");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (!value || typeof value !== "object") fail("autonomy_json_value_invalid");
  if (seen.has(value)) fail("autonomy_json_cycle");
  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    if (
      value.length > 4_096 ||
      Object.getOwnPropertyNames(value).length !== value.length + 1 ||
      Object.getOwnPropertySymbols(value).length > 0
    )
      fail("autonomy_json_array_invalid");
    result = `[${value.map((child) => canonical(child, seen, depth + 1, count)).join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      fail("autonomy_json_object_invalid");
    const keys = Object.getOwnPropertyNames(value).sort();
    if (keys.length > 256 || Object.getOwnPropertySymbols(value).length > 0)
      fail("autonomy_json_object_invalid");
    result = `{${keys
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || descriptor.get || descriptor.set)
          fail("autonomy_json_property_invalid");
        return `${JSON.stringify(key)}:${canonical(descriptor.value, seen, depth + 1, count)}`;
      })
      .join(",")}}`;
  }
  seen.delete(value);
  return result;
}

function token(value: unknown, label: string): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(`autonomy_${label}_invalid`);
}

function fail(message: string): never {
  throw new AutonomyValidationErrorV1(message);
}
