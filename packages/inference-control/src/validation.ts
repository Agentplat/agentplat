import type { JsonValue } from '@agentplat/core';
import {
  INFERENCE_CONTROL_REASON_CODES_V1,
  type InferenceControlLimitsV1,
  type InferenceControlReasonCodeV1,
} from './types.js';

export const INFERENCE_CONTROL_LIMITS_V1: Readonly<InferenceControlLimitsV1> =
  Object.freeze({
    maxContextEntriesPerRun: 256,
    maxContextEntryBytes: 65_536,
    maxContextBytesPerRun: 1_048_576,
    maxProvenanceReferencesPerEntry: 16,
    maxAssessmentsPerRun: 128,
    maxAssessmentBytes: 65_536,
    maxEvidenceReferencesPerAssessment: 32,
    maxRevisionsPerRun: 8,
    maxRetriesPerRun: 8,
    maxChallengesPerRun: 8,
    maxOutputChunksPerRun: 8_192,
    maxOutputChunkBytes: 65_536,
    maxPendingWindowBytes: 262_144,
    maxBufferedOutputBytes: 4_194_304,
    maxActionInputBytes: 65_536,
    maxOutboundMessageBytes: 65_536,
    maxDispatchAttemptsPerRun: 1_024,
    maxActiveGrants: 1_024,
    maxRetainedGrantRecords: 4_096,
    maxActiveMessageAttempts: 1_024,
    maxRetainedMessageAttempts: 4_096,
    maxDiagnostics: 4_096,
    maxStateBytes: 16_777_216,
    maxRunDurationMs: 86_400_000,
    maxAssessorResponseTimeoutMs: 60_000,
    maxAssessmentTtlMs: 300_000,
    maxGrantTtlMs: 120_000,
    maxMessagePermitTtlMs: 120_000,
  });

export class InferenceControlValidationError extends Error {
  readonly name = 'InferenceControlValidationError';
}
export function assertPlainRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length
  )
    throw new InferenceControlValidationError(
      `${label} must be a plain record`,
    );
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set)
      throw new InferenceControlValidationError(
        `${label}.${key} may not be an accessor`,
      );
  }
}
export function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  assertPlainRecord(value, label);
  const actual = Object.keys(value).sort(),
    wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    throw new InferenceControlValidationError(`${label} has an invalid shape`);
}
export function assertString(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    hasUnpairedSurrogate(value)
  )
    throw new InferenceControlValidationError(
      `${label} must be a nonempty string`,
    );
}

/** Existing AgentPlat identifiers are bounded transport-safe strings. */
export function assertIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  assertString(value, label);
  if (
    new TextEncoder().encode(value).byteLength > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new InferenceControlValidationError(
      `${label} must be a bounded identifier`,
    );
  }
}

/** Policy-controlled operation/channel names must be portable ASCII tokens. */
export function assertControlToken(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value) ||
    value.length > 128
  ) {
    throw new InferenceControlValidationError(
      `${label} must be a control token`,
    );
  }
}
export function assertSafeInteger(
  value: unknown,
  label: string,
  minimum = 0,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new InferenceControlValidationError(
      `${label} must be a safe integer >= ${minimum}`,
    );
}
export function assertOneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): asserts value is T {
  if (typeof value !== 'string' || !values.includes(value as T))
    throw new InferenceControlValidationError(`${label} is invalid`);
}
export function assertDigest(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value))
    throw new InferenceControlValidationError(
      `${label} must be a sha256 digest`,
    );
}
export function isInferenceControlReasonCodeV1(
  value: unknown,
): value is InferenceControlReasonCodeV1 {
  return (
    typeof value === 'string' &&
    (INFERENCE_CONTROL_REASON_CODES_V1 as readonly string[]).includes(value)
  );
}

export function assertStrictJsonValue(
  value: unknown,
  seen = new Set<object>(),
): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new InferenceControlValidationError('JSON number must be finite');
    return;
  }
  if (typeof value !== 'object')
    throw new InferenceControlValidationError('Value is not JSON');
  if (seen.has(value))
    throw new InferenceControlValidationError('JSON value may not be cyclic');
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i))
        throw new InferenceControlValidationError(
          'JSON arrays may not be sparse',
        );
      assertStrictJsonValue(value[i], seen);
    }
  } else {
    assertPlainRecord(value, 'JSON object');
    for (const key of Object.keys(value))
      assertStrictJsonValue(value[key], seen);
  }
  seen.delete(value);
}
export function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === 'object' && !seen.has(value as object)) {
    seen.add(value as object);
    for (const item of Object.values(value as Record<string, unknown>))
      deepFreeze(item, seen);
    Object.freeze(value);
  }
  return value;
}
export function sortedUnique(values: readonly string[], label: string): void {
  if (values.some((value, index) => index > 0 && values[index - 1] >= value))
    throw new InferenceControlValidationError(
      `${label} must be sorted and unique`,
    );
}

/** Host-independent UTF-16 code-unit order, matching ECMAScript default sort. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (++index >= value.length) return true;
      const low = value.charCodeAt(index);
      if (low < 0xdc00 || low > 0xdfff) return true;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}
