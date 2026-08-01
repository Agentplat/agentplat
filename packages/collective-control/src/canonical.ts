import type { JsonValue } from "@agentplat/core";

import type {
  CollectiveDigestDomainV1,
  CollectiveDigestV1,
} from "./contracts.js";
import { sha256Hex } from "./sha256.js";

const encoder = new TextEncoder();
const digestDomains = new Set<CollectiveDigestDomainV1>([
  "mandate",
  "mandate-proof",
  "revocation",
  "work-contract",
  "action-permit",
  "budget-reservation",
  "decision-record",
  "evidence-chain",
  "state",
  "snapshot",
  "experiment-registration",
  "mission",
  "evaluation-sample",
  "evaluation-report",
  "room-proposal",
]);

export class CollectiveControlValidationError extends Error {
  readonly name = "CollectiveControlValidationError";
}

export interface CollectiveJsonLimitsV1 {
  readonly maximumBytes: number;
  readonly maximumDepth: number;
  readonly maximumNodes: number;
  readonly maximumKeysPerObject: number;
  readonly maximumItemsPerArray: number;
}

export const DEFAULT_COLLECTIVE_JSON_LIMITS_V1: Readonly<CollectiveJsonLimitsV1> =
  Object.freeze({
    maximumBytes: 262_144,
    maximumDepth: 32,
    maximumNodes: 16_384,
    maximumKeysPerObject: 256,
    maximumItemsPerArray: 4_096,
  });

function assertUnicode(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      index += 1;
      if (
        index >= value.length ||
        value.charCodeAt(index) < 0xdc00 ||
        value.charCodeAt(index) > 0xdfff
      )
        throw new CollectiveControlValidationError(
          `${label} contains an unpaired surrogate`,
        );
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new CollectiveControlValidationError(
        `${label} contains an unpaired surrogate`,
      );
    }
  }
}

function canonical(
  value: unknown,
  seen: Set<object>,
  limits: CollectiveJsonLimitsV1,
  depth: number,
  counters: { nodes: number },
): string {
  if (depth > limits.maximumDepth)
    throw new CollectiveControlValidationError("JSON maximum depth exceeded");
  counters.nodes += 1;
  if (counters.nodes > limits.maximumNodes)
    throw new CollectiveControlValidationError("JSON maximum nodes exceeded");
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      assertUnicode(value, "JSON string");
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value))
        throw new CollectiveControlValidationError(
          "JSON numbers must be finite",
        );
      if (Number.isInteger(value) && !Number.isSafeInteger(value))
        throw new CollectiveControlValidationError(
          "JSON integers must be safe",
        );
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "object":
      break;
    default:
      throw new CollectiveControlValidationError(
        "JSON contains a non-JSON value",
      );
  }

  if (seen.has(value))
    throw new CollectiveControlValidationError("JSON may not contain cycles");
  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    if (value.length > limits.maximumItemsPerArray)
      throw new CollectiveControlValidationError(
        "JSON maximum array items exceeded",
      );
    if (Object.getOwnPropertySymbols(value).length > 0)
      throw new CollectiveControlValidationError(
        "JSON arrays may not contain symbol keys",
      );
    const names = Object.getOwnPropertyNames(value);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor)
        throw new CollectiveControlValidationError(
          "JSON arrays may not be sparse",
        );
      if (!descriptor.enumerable || descriptor.get || descriptor.set)
        throw new CollectiveControlValidationError(
          "JSON arrays must contain enumerable data",
        );
    }
    if (names.length !== value.length + 1 || !names.includes("length"))
      throw new CollectiveControlValidationError(
        "JSON arrays may not contain extra properties",
      );
    result = `[${value
      .map((item) => canonical(item, seen, limits, depth + 1, counters))
      .join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new CollectiveControlValidationError("JSON requires plain objects");
    if (Object.getOwnPropertySymbols(value).length > 0)
      throw new CollectiveControlValidationError(
        "JSON may not contain symbol keys",
      );
    const keys = Object.getOwnPropertyNames(value).sort();
    if (keys.length > limits.maximumKeysPerObject)
      throw new CollectiveControlValidationError(
        "JSON maximum object keys exceeded",
      );
    for (const key of keys) {
      assertUnicode(key, "JSON key");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        descriptor.get ||
        descriptor.set
      )
        throw new CollectiveControlValidationError(
          "JSON must contain enumerable data properties",
        );
    }
    result = `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical(
            (value as Record<string, unknown>)[key],
            seen,
            limits,
            depth + 1,
            counters,
          )}`,
      )
      .join(",")}}`;
  }
  seen.delete(value);
  return result;
}

export function canonicalizeCollectiveJsonV1(
  value: JsonValue,
  limits: CollectiveJsonLimitsV1 = DEFAULT_COLLECTIVE_JSON_LIMITS_V1,
): string {
  const result = canonical(value, new Set(), limits, 0, { nodes: 0 });
  if (encoder.encode(result).byteLength > limits.maximumBytes)
    throw new CollectiveControlValidationError("JSON maximum bytes exceeded");
  return result;
}

export function digestCollectiveJsonV1(
  domain: CollectiveDigestDomainV1,
  value: JsonValue,
  limits?: CollectiveJsonLimitsV1,
): CollectiveDigestV1 {
  if (!digestDomains.has(domain))
    throw new CollectiveControlValidationError("digest domain is invalid");
  const digest = sha256Hex(
    encoder.encode(
      `agentplat.collective-control/${domain}/v1\0${canonicalizeCollectiveJsonV1(
        value,
        limits,
      )}`,
    ),
  );
  return `sha256:${digest}`;
}

export function collectiveUtf8ByteLengthV1(value: string): number {
  assertUnicode(value, "string");
  return encoder.encode(value).byteLength;
}

export function deepFreezeCollective<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === "object" && !seen.has(value as object)) {
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreezeCollective(child, seen);
    Object.freeze(value);
  }
  return value;
}
