import type { JsonValue } from "@agentplat/core";
import {
  canonicalizeTrustJsonV1,
  deepFreeze,
  TrustValidationError,
  utf8ByteLengthV1,
} from "./canonical.js";
import {
  TRUST_REASON_CODES_V1,
  type EvidenceReferenceV1,
  type EvidenceScopeV1,
  type TrustReasonCodeV1,
  type TrustSubjectV1,
} from "./types.js";

const trustDigest = /^[0-9a-f]{64}$/u;
const meshDigest = /^sha256:[A-Za-z0-9_-]{43}$/u;
const controlDigest = /^sha256:[0-9a-f]{64}$/u;
const token = /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/u;

export { TrustValidationError };

export function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TrustValidationError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length
  )
    throw new TrustValidationError(`${label} must be a plain object`);
  const actual = Object.getOwnPropertyNames(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    throw new TrustValidationError(`${label} has an invalid shape`);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      descriptor.get ||
      descriptor.set
    )
      throw new TrustValidationError(
        `${label} may only contain enumerable data properties`,
      );
  }
}
export function assertIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8ByteLengthV1(value) > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new TrustValidationError(`${label} must be a bounded identifier`);
}
export function assertToken(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length > 128 || !token.test(value))
    throw new TrustValidationError(`${label} must be a token`);
}
export function assertSafeInteger(
  value: unknown,
  label: string,
  minimum = 0,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new TrustValidationError(`${label} must be a safe integer`);
}
export function assertTrustDigest(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !trustDigest.test(value))
    throw new TrustValidationError(`${label} must be a Trust digest`);
}
export function assertNullableTrustDigest(
  value: unknown,
  label: string,
): asserts value is string | null {
  if (value !== null) assertTrustDigest(value, label);
}
export function assertRfc3339OrNull(
  value: unknown,
  label: string,
): asserts value is string | null {
  if (value === null) return;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) ||
    Number.isNaN(Date.parse(value))
  )
    throw new TrustValidationError(`${label} must be RFC 3339 or null`);
}
export function validateEvidenceScopeV1(value: unknown): EvidenceScopeV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TrustValidationError("scope is invalid");
  const scope = value as Record<string, unknown>;
  const common = (keys: readonly string[]) => {
    assertExactKeys(scope, keys, "scope");
    if (scope.schemaVersion !== 1)
      throw new TrustValidationError("scope schema is invalid");
  };
  switch (scope.kind) {
    case "standalone":
      common(["schemaVersion", "kind", "tenantId", "namespace", "scopeId"]);
      assertIdentifier(scope.tenantId, "tenantId");
      assertToken(scope.namespace, "namespace");
      assertIdentifier(scope.scopeId, "scopeId");
      break;
    case "mesh":
      common(["schemaVersion", "kind", "tenantId", "meshId"]);
      assertIdentifier(scope.tenantId, "tenantId");
      assertIdentifier(scope.meshId, "meshId");
      break;
    case "objective":
      common([
        "schemaVersion",
        "kind",
        "tenantId",
        "meshId",
        "objectiveId",
        "objectiveRevision",
      ]);
      assertIdentifier(scope.tenantId, "tenantId");
      assertIdentifier(scope.meshId, "meshId");
      assertIdentifier(scope.objectiveId, "objectiveId");
      assertSafeInteger(scope.objectiveRevision, "objectiveRevision", 1);
      break;
    case "work":
      common([
        "schemaVersion",
        "kind",
        "tenantId",
        "meshId",
        "objectiveId",
        "objectiveRevision",
        "workItemId",
        "workItemRevision",
        "assignmentEpoch",
        "assignmentAuthorityId",
        "fencingToken",
      ]);
      for (const key of [
        "tenantId",
        "meshId",
        "objectiveId",
        "workItemId",
        "assignmentAuthorityId",
      ] as const)
        assertIdentifier(scope[key], key);
      for (const key of [
        "objectiveRevision",
        "workItemRevision",
        "assignmentEpoch",
      ] as const)
        assertSafeInteger(scope[key], key, 1);
      assertToken(scope.fencingToken, "fencingToken");
      break;
    case "controlled_run":
      common([
        "schemaVersion",
        "kind",
        "tenantId",
        "runId",
        "agentId",
        "controlPolicyId",
        "controlPolicyVersion",
        "coordinatedScopeDigest",
      ]);
      for (const key of [
        "tenantId",
        "runId",
        "agentId",
        "controlPolicyId",
      ] as const)
        assertIdentifier(scope[key], key);
      assertSafeInteger(scope.controlPolicyVersion, "controlPolicyVersion", 1);
      assertNullableTrustDigest(
        scope.coordinatedScopeDigest,
        "coordinatedScopeDigest",
      );
      break;
    default:
      throw new TrustValidationError("scope kind is invalid");
  }
  return deepFreeze(structuredClone(scope) as unknown as EvidenceScopeV1);
}
export function validateTrustSubjectV1(value: unknown): TrustSubjectV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TrustValidationError("subject is invalid");
  const subject = value as Record<string, unknown>;
  if (subject.kind === "peer") {
    assertExactKeys(subject, ["schemaVersion", "kind", "peerId"], "subject");
    if (subject.schemaVersion !== 1)
      throw new TrustValidationError("subject schema is invalid");
    assertIdentifier(subject.peerId, "peerId");
  } else if (subject.kind === "peer_capability") {
    assertExactKeys(
      subject,
      [
        "schemaVersion",
        "kind",
        "peerId",
        "capabilityKey",
        "capabilityVersion",
        "capabilityRevision",
      ],
      "subject",
    );
    if (subject.schemaVersion !== 1)
      throw new TrustValidationError("subject schema is invalid");
    assertIdentifier(subject.peerId, "peerId");
    assertToken(subject.capabilityKey, "capabilityKey");
    assertIdentifier(subject.capabilityVersion, "capabilityVersion");
    assertSafeInteger(subject.capabilityRevision, "capabilityRevision", 1);
  } else throw new TrustValidationError("subject kind is invalid");
  return deepFreeze(structuredClone(subject) as unknown as TrustSubjectV1);
}
export function validateEvidenceReferenceV1(
  value: unknown,
): EvidenceReferenceV1 {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "kind",
      "referenceType",
      "referenceId",
      "referenceDigest",
    ],
    "reference",
  );
  const reference = value as Record<string, unknown>;
  if (
    reference.schemaVersion !== 1 ||
    !["evidence", "mesh_record", "control_record", "external"].includes(
      reference.kind as string,
    )
  )
    throw new TrustValidationError("reference kind is invalid");
  assertToken(reference.referenceType, "referenceType");
  assertIdentifier(reference.referenceId, "referenceId");
  const digest = reference.referenceDigest;
  if (
    typeof digest !== "string" ||
    (reference.kind === "mesh_record"
      ? !meshDigest.test(digest)
      : reference.kind === "control_record"
        ? !controlDigest.test(digest)
        : !trustDigest.test(digest))
  )
    throw new TrustValidationError("reference digest is invalid");
  return deepFreeze(
    structuredClone(reference) as unknown as EvidenceReferenceV1,
  );
}
export function validateSortedReferencesV1(
  value: unknown,
  label: string,
  nonEmpty = false,
): readonly EvidenceReferenceV1[] {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0))
    throw new TrustValidationError(`${label} is invalid`);
  const references = value.map(validateEvidenceReferenceV1);
  const keys = references.map(
    (reference) =>
      `${reference.kind}\u0000${reference.referenceType}\u0000${reference.referenceId}\u0000${reference.referenceDigest}`,
  );
  if (keys.some((key, index) => index > 0 && keys[index - 1] >= key))
    throw new TrustValidationError(`${label} must be sorted and unique`);
  return deepFreeze(references);
}
export function validateReasonCodeV1(value: unknown): TrustReasonCodeV1 {
  if (
    typeof value !== "string" ||
    !(TRUST_REASON_CODES_V1 as readonly string[]).includes(value)
  )
    throw new TrustValidationError("reasonCode is invalid");
  return value as TrustReasonCodeV1;
}
export function assertStrictTrustJsonV1(
  value: unknown,
): asserts value is JsonValue {
  canonicalizeTrustJsonV1(value as JsonValue);
}
