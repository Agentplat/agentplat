import type { JsonValue } from "@agentplat/core";

import type { PlanningDigestDomainV1, PlanningDigestV1 } from "./contracts.js";
import { sha256HexPlanningV1 } from "./sha256.js";

const encoder = new TextEncoder();
const digestDomains = new Set<PlanningDigestDomainV1>([
  "mission-intent",
  "mission-observation",
  "proposal-identity",
  "plan-fragment-proposal",
  "plan-selection-policy",
  "plan-fragment-decision",
  "plan-fragment",
  "plan-view",
  "adaptive-role-binding",
  "collective-planning-snapshot",
  "planning-reducer-command-identity",
  "planning-reducer-command",
  "planning-reducer-transition",
  "planning-reducer-state",
  "planning-reducer-event",
  "planning-reducer-snapshot",
  "evaluation-registration-binding",
  "collective-trace-event-v2",
  "collective-trace-chain-v2",
  "collective-trace-v2",
  "interaction-ledger-v2",
  "environment-initialization-v1",
  "environment-initialization-receipt-v1",
  "environment-observation-request-v1",
  "environment-observation-receipt-v1",
  "protected-effect-attempt-v1",
  "protected-effect-receipt-v1",
  "environment-advance-v1",
  "environment-advance-receipt-v1",
  "environment-state-v1",
  "environment-snapshot-handle-v1",
  "environment-restore-receipt-v1",
  "invariant-monitor-policy-v1",
  "invariant-monitor-event-v1",
  "invariant-monitor-verdict-v1",
  "invariant-monitor-snapshot-v1",
  "evaluation-public-artifact-v1",
  "evaluation-boundary-evidence-v1",
  "evaluation-campaign-cell-v1",
  "evaluation-campaign-registration-v1",
  "evaluation-campaign-manifest-entry-v1",
  "evaluation-campaign-manifest-v1",
  "evaluation-campaign-artifact-v1",
  "evaluation-campaign-bundle-v1",
  "evaluation-campaign-topology-v1",
  "evaluation-campaign-scale-configuration-v1",
  "evaluation-campaign-fault-matrix-v1",
  "evaluation-campaign-fault-coverage-v1",
  "progressive-scale-profile-v1",
  "progressive-scale-topology-v1",
  "progressive-scale-shard-v1",
  "progressive-scale-plan-v1",
  "progressive-scale-role-coherence-v1",
  "progressive-scale-shard-result-v1",
  "progressive-scale-report-v1",
  "progressive-scale-overlay-binding-v2",
  "capability-state-policy",
  "capability-state-candidate",
  "capability-state-request",
  "capability-state-signal",
  "capability-state-head",
  "capability-state-decision",
  "capability-state-state",
  "local-strategy-definition",
  "local-strategy-catalog",
  "local-strategy-adaptation-policy",
  "local-strategy-selection-request",
  "local-strategy-safety-signal",
  "local-strategy-feedback-signal",
  "local-strategy-feedback-batch",
  "local-strategy-adaptation-state",
  "local-strategy-selection-decision",
  "local-strategy-feedback-decision",
  "local-strategy-adaptation-handoff",
  "local-strategy-entropy-draw",
  "local-strategy-safety-head",
  "local-strategy-feedback-head",
  "local-strategy-collective-prior",
  "peer-strategy-evidence-admission",
  "peer-strategy-evidence-binding",
  "peer-strategy-evidence-certificate",
  "peer-strategy-evidence-certificate-decision",
  "peer-strategy-evidence-cohort",
  "peer-strategy-evidence-handoff",
  "peer-strategy-evidence-eligibility",
  "peer-strategy-evidence-policy",
  "peer-strategy-evidence-prior",
  "peer-strategy-evidence-source-head",
  "peer-strategy-evidence-state",
  "peer-strategy-outcome-attestation",
]);

export class CollectivePlanningValidationError extends Error {
  readonly name = "CollectivePlanningValidationError";
}

export interface PlanningJsonLimitsV1 {
  readonly maximumBytes: number;
  readonly maximumDepth: number;
  readonly maximumNodes: number;
  readonly maximumKeysPerObject: number;
  readonly maximumItemsPerArray: number;
}

export const DEFAULT_PLANNING_JSON_LIMITS_V1: Readonly<PlanningJsonLimitsV1> =
  Object.freeze({
    maximumBytes: 262_144,
    maximumDepth: 32,
    maximumNodes: 16_384,
    maximumKeysPerObject: 256,
    maximumItemsPerArray: 4_096,
  });

function validateLimits(limits: PlanningJsonLimitsV1): void {
  if (
    limits === null ||
    typeof limits !== "object" ||
    Array.isArray(limits) ||
    (Object.getPrototypeOf(limits) !== Object.prototype &&
      Object.getPrototypeOf(limits) !== null)
  )
    throw new CollectivePlanningValidationError(
      "JSON limits must be a plain object",
    );
  const names = Object.getOwnPropertyNames(limits).sort();
  const expected = [
    "maximumBytes",
    "maximumDepth",
    "maximumItemsPerArray",
    "maximumKeysPerObject",
    "maximumNodes",
  ].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index]) ||
    Object.getOwnPropertySymbols(limits).length > 0
  )
    throw new CollectivePlanningValidationError(
      "JSON limits have invalid shape",
    );
  const hardMaximums: Record<string, number> = {
    maximumBytes: 67_108_864,
    maximumDepth: 64,
    maximumNodes: 2_000_000,
    maximumKeysPerObject: 4_096,
    maximumItemsPerArray: 262_144,
  };
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(limits, name);
    const value =
      descriptor && "value" in descriptor ? descriptor.value : undefined;
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      !Number.isSafeInteger(value) ||
      (value as number) < 1 ||
      (value as number) > hardMaximums[name]
    )
      throw new CollectivePlanningValidationError(
        `JSON limit ${name} must be a bounded positive safe integer`,
      );
  }
}

function utf8ByteLength(
  value: string,
  label: string,
  maximumBytes = Number.MAX_SAFE_INTEGER,
): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      index += 1;
      if (
        index >= value.length ||
        value.charCodeAt(index) < 0xdc00 ||
        value.charCodeAt(index) > 0xdfff
      )
        throw new CollectivePlanningValidationError(
          `${label} contains an unpaired surrogate`,
        );
      bytes += 4;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new CollectivePlanningValidationError(
        `${label} contains an unpaired surrogate`,
      );
    } else bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
    if (bytes > maximumBytes)
      throw new CollectivePlanningValidationError(
        "JSON maximum bytes exceeded",
      );
  }
  return bytes;
}

function jsonStringByteLength(
  value: string,
  label: string,
  maximumBytes: number,
): number {
  let bytes = 2;
  if (bytes > maximumBytes)
    throw new CollectivePlanningValidationError("JSON maximum bytes exceeded");
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      index += 1;
      if (
        index >= value.length ||
        value.charCodeAt(index) < 0xdc00 ||
        value.charCodeAt(index) > 0xdfff
      )
        throw new CollectivePlanningValidationError(
          `${label} contains an unpaired surrogate`,
        );
      bytes += 4;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new CollectivePlanningValidationError(
        `${label} contains an unpaired surrogate`,
      );
    } else if (code === 0x22 || code === 0x5c) bytes += 2;
    else if (code <= 0x1f)
      bytes +=
        code === 0x08 ||
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0c ||
        code === 0x0d
          ? 2
          : 6;
    else bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
    if (bytes > maximumBytes)
      throw new CollectivePlanningValidationError(
        "JSON maximum bytes exceeded",
      );
  }
  return bytes;
}

interface CanonicalCounters {
  bytes: number;
  nodes: number;
}

function chargeBytes(
  bytes: number,
  counters: CanonicalCounters,
  limits: PlanningJsonLimitsV1,
): void {
  counters.bytes += bytes;
  if (counters.bytes > limits.maximumBytes)
    throw new CollectivePlanningValidationError("JSON maximum bytes exceeded");
}

function canonical(
  value: unknown,
  seen: Set<object>,
  limits: PlanningJsonLimitsV1,
  depth: number,
  counters: CanonicalCounters,
): string {
  if (depth > limits.maximumDepth)
    throw new CollectivePlanningValidationError("JSON maximum depth exceeded");
  counters.nodes += 1;
  if (counters.nodes > limits.maximumNodes)
    throw new CollectivePlanningValidationError("JSON maximum nodes exceeded");
  if (value === null) {
    chargeBytes(4, counters, limits);
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      chargeBytes(value ? 4 : 5, counters, limits);
      return value ? "true" : "false";
    case "string": {
      const bytes = jsonStringByteLength(
        value,
        "JSON string",
        limits.maximumBytes - counters.bytes,
      );
      chargeBytes(bytes, counters, limits);
      return JSON.stringify(value);
    }
    case "number":
      if (!Number.isFinite(value))
        throw new CollectivePlanningValidationError(
          "JSON numbers must be finite",
        );
      if (Number.isInteger(value) && !Number.isSafeInteger(value))
        throw new CollectivePlanningValidationError(
          "JSON integers must be safe integers",
        );
      {
        const result = Object.is(value, -0) ? "0" : JSON.stringify(value);
        chargeBytes(result.length, counters, limits);
        return result;
      }
    case "object":
      break;
    default:
      throw new CollectivePlanningValidationError(
        "JSON contains a non-JSON value",
      );
  }

  if (seen.has(value))
    throw new CollectivePlanningValidationError("JSON may not contain cycles");
  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor))
      throw new CollectivePlanningValidationError(
        "JSON arrays must have a data length",
      );
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0)
      throw new CollectivePlanningValidationError(
        "JSON array length is invalid",
      );
    if (length > limits.maximumItemsPerArray)
      throw new CollectivePlanningValidationError(
        "JSON maximum array items exceeded",
      );
    if (Object.getOwnPropertySymbols(value).length > 0)
      throw new CollectivePlanningValidationError(
        "JSON arrays may not contain symbol keys",
      );
    const names = Object.getOwnPropertyNames(value);
    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
        throw new CollectivePlanningValidationError(
          "JSON arrays must be dense enumerable data",
        );
      items.push(descriptor.value);
    }
    if (names.length !== length + 1 || !names.includes("length"))
      throw new CollectivePlanningValidationError(
        "JSON arrays may not contain extra properties",
      );
    chargeBytes(2, counters, limits);
    const parts: string[] = [];
    for (let index = 0; index < items.length; index += 1) {
      if (index > 0) chargeBytes(1, counters, limits);
      parts.push(canonical(items[index], seen, limits, depth + 1, counters));
    }
    result = `[${parts.join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new CollectivePlanningValidationError(
        "JSON requires plain objects",
      );
    if (Object.getOwnPropertySymbols(value).length > 0)
      throw new CollectivePlanningValidationError(
        "JSON may not contain symbol keys",
      );
    const keys = Object.getOwnPropertyNames(value).sort();
    if (keys.length > limits.maximumKeysPerObject)
      throw new CollectivePlanningValidationError(
        "JSON maximum object keys exceeded",
      );
    chargeBytes(2, counters, limits);
    const parts: string[] = [];
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
        throw new CollectivePlanningValidationError(
          "JSON must contain enumerable data properties",
        );
      if (index > 0) chargeBytes(1, counters, limits);
      const keyBytes = jsonStringByteLength(
        key,
        "JSON key",
        limits.maximumBytes - counters.bytes,
      );
      chargeBytes(keyBytes + 1, counters, limits);
      parts.push(
        `${JSON.stringify(key)}:${canonical(
          descriptor.value,
          seen,
          limits,
          depth + 1,
          counters,
        )}`,
      );
    }
    result = `{${parts.join(",")}}`;
  }
  seen.delete(value);
  return result;
}

export function canonicalizePlanningJsonV1(
  value: JsonValue,
  limits: PlanningJsonLimitsV1 = DEFAULT_PLANNING_JSON_LIMITS_V1,
): string {
  validateLimits(limits);
  return canonical(value, new Set(), limits, 0, { bytes: 0, nodes: 0 });
}

export function digestPlanningJsonV1(
  domain: PlanningDigestDomainV1,
  value: JsonValue,
  limits?: PlanningJsonLimitsV1,
): PlanningDigestV1 {
  if (!digestDomains.has(domain))
    throw new CollectivePlanningValidationError("digest domain is invalid");
  const digest = sha256HexPlanningV1(
    encoder.encode(
      `agentplat.collective-planning/${domain}/v1\0${canonicalizePlanningJsonV1(
        value,
        limits,
      )}`,
    ),
  );
  return `sha256:${digest}`;
}

export function planningUtf8ByteLengthV1(value: string): number {
  return utf8ByteLength(value, "string");
}

export function deepFreezePlanning<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === "object" && !seen.has(value as object)) {
    seen.add(value as object);
    for (const key of Reflect.ownKeys(value as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
      if (!descriptor || !("value" in descriptor))
        throw new CollectivePlanningValidationError(
          "planning values may not contain accessors",
        );
      deepFreezePlanning(descriptor.value, seen);
    }
    Object.freeze(value);
  }
  return value;
}
