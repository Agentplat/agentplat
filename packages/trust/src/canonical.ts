import type { JsonValue } from "@agentplat/core";
import type { TrustDigestDomainV1 } from "./types.js";
import { sha256Hex } from "./sha256.js";

const encoder = new TextEncoder();

export class TrustValidationError extends Error {
  readonly name = "TrustValidationError";
}

export interface StrictJsonLimitsV1 {
  readonly maximumBytes: number;
  readonly maximumDepth: number;
  readonly maximumNodes: number;
  readonly maximumKeysPerObject: number;
  readonly maximumItemsPerArray: number;
}

export const DEFAULT_STRICT_JSON_LIMITS_V1: Readonly<StrictJsonLimitsV1> =
  Object.freeze({
    maximumBytes: 65_536,
    maximumDepth: 32,
    maximumNodes: 4_096,
    maximumKeysPerObject: 256,
    maximumItemsPerArray: 4_096,
  });

function assertWellFormedUnicode(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      index += 1;
      if (
        index >= value.length ||
        value.charCodeAt(index) < 0xdc00 ||
        value.charCodeAt(index) > 0xdfff
      )
        throw new TrustValidationError(
          `${label} contains an unpaired surrogate`,
        );
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TrustValidationError(`${label} contains an unpaired surrogate`);
    }
  }
}

function canonical(
  value: unknown,
  seen: Set<object>,
  limits: StrictJsonLimitsV1,
  depth: number,
  counters: { nodes: number },
): string {
  if (depth > limits.maximumDepth)
    throw new TrustValidationError("JSON maximum depth exceeded");
  counters.nodes += 1;
  if (counters.nodes > limits.maximumNodes)
    throw new TrustValidationError("JSON maximum nodes exceeded");
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      assertWellFormedUnicode(value, "JSON string");
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value))
        throw new TrustValidationError("JSON numbers must be finite");
      if (Number.isInteger(value) && !Number.isSafeInteger(value))
        throw new TrustValidationError("JSON integers must be safe");
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "object":
      break;
    default:
      throw new TrustValidationError("JSON contains a non-JSON value");
  }
  if (seen.has(value))
    throw new TrustValidationError("JSON may not contain cycles");
  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    if (value.length > limits.maximumItemsPerArray)
      throw new TrustValidationError("JSON maximum array items exceeded");
    if (Object.getOwnPropertySymbols(value).length)
      throw new TrustValidationError("JSON arrays may not contain symbol keys");
    const names = Object.getOwnPropertyNames(value);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor)
        throw new TrustValidationError("JSON arrays may not be sparse");
      if (!descriptor.enumerable || descriptor.get || descriptor.set)
        throw new TrustValidationError(
          "JSON arrays must contain enumerable data",
        );
    }
    if (names.length !== value.length + 1 || !names.includes("length"))
      throw new TrustValidationError(
        "JSON arrays may not contain extra properties",
      );
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || lengthDescriptor.get || lengthDescriptor.set)
      throw new TrustValidationError(
        "JSON arrays have an invalid length property",
      );
    result = `[${value.map((item) => canonical(item, seen, limits, depth + 1, counters)).join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TrustValidationError("JSON requires plain objects");
    if (Object.getOwnPropertySymbols(value).length)
      throw new TrustValidationError("JSON may not contain symbol keys");
    const keys = Object.getOwnPropertyNames(value);
    if (keys.length > limits.maximumKeysPerObject)
      throw new TrustValidationError("JSON maximum object keys exceeded");
    keys.sort();
    for (const key of keys) {
      assertWellFormedUnicode(key, "JSON key");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        descriptor.get ||
        descriptor.set
      )
        throw new TrustValidationError(
          "JSON must contain enumerable data properties",
        );
    }
    result = `{${keys.map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], seen, limits, depth + 1, counters)}`).join(",")}}`;
  }
  seen.delete(value);
  return result;
}

export function canonicalizeTrustJsonV1(
  value: JsonValue,
  limits: StrictJsonLimitsV1 = DEFAULT_STRICT_JSON_LIMITS_V1,
): string {
  const result = canonical(value, new Set(), limits, 0, { nodes: 0 });
  if (encoder.encode(result).byteLength > limits.maximumBytes)
    throw new TrustValidationError("JSON maximum bytes exceeded");
  return result;
}

export function canonicalTrustJsonBytesV1(
  value: JsonValue,
  limits?: StrictJsonLimitsV1,
): Uint8Array {
  return encoder.encode(canonicalizeTrustJsonV1(value, limits));
}

export function digestTrustJsonV1(
  domain: TrustDigestDomainV1,
  value: JsonValue,
): string {
  return sha256Hex(
    encoder.encode(
      `agentplat.trust/${domain}/v1\0${canonicalizeTrustJsonV1(value)}`,
    ),
  );
}

export function sha256TrustBytesV1(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

export function utf8ByteLengthV1(value: string): number {
  assertWellFormedUnicode(value, "string");
  return encoder.encode(value).byteLength;
}

export function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === "object" && !seen.has(value as object)) {
    seen.add(value as object);
    for (const item of Object.values(value as Record<string, unknown>))
      deepFreeze(item, seen);
    Object.freeze(value);
  }
  return value;
}
