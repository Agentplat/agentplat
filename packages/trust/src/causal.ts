import type { JsonValue } from "@agentplat/core";
import {
  deepFreeze,
  digestTrustJsonV1,
  TrustValidationError,
} from "./canonical.js";
import type {
  EvidenceCausalAuthorizationBasisV1,
  EvidenceCausalAuthorizationV1,
  EvidenceReferenceKindV1,
} from "./types.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  assertToken,
  assertTrustDigest,
  validateEvidenceReferenceV1,
} from "./validation.js";

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const relationValues = new Set([
  "subject_self",
  "work_assignee",
  "work_owner",
  "objective_observer",
  "recovery_witness",
  "local_system",
  "target_author",
]);
const authorizationKeys = [
  "schemaVersion",
  "authorizationId",
  "authorizationDigest",
  "recordId",
  "recordDigest",
  "recordKind",
  "policyDigest",
  "criterionId",
  "subjectDigest",
  "scopeDigest",
  "targetRecordId",
  "targetRecordDigest",
  "sourceRelation",
  "authorityBindingDigest",
  "authorityProofDigest",
  "bases",
  "authorizedAtLogicalMs",
] as const;
const basisKeys = [
  "schemaVersion",
  "kind",
  "referenceType",
  "referenceId",
  "referenceDigest",
  "resolvedDigest",
  "trustedEffectiveAtLogicalMs",
  "resolverBindingDigest",
  "resolutionProofDigest",
] as const;

function referenceKey(value: EvidenceCausalAuthorizationBasisV1): string {
  return `${value.kind}\u0000${value.referenceType}\u0000${value.referenceId}\u0000${value.referenceDigest}`;
}
export function validateEvidenceCausalAuthorizationBasisV1(
  value: unknown,
): EvidenceCausalAuthorizationBasisV1 {
  assertExactKeys(value, basisKeys, "causal authorization basis");
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1)
    throw new TrustValidationError(
      "causal authorization basis schema is invalid",
    );
  // Reuse the public reference grammar, including Mesh and Control digest domains.
  validateEvidenceReferenceV1({
    schemaVersion: v.schemaVersion,
    kind: v.kind,
    referenceType: v.referenceType,
    referenceId: v.referenceId,
    referenceDigest: v.referenceDigest,
  });
  assertTrustDigest(v.resolvedDigest, "resolvedDigest");
  assertSafeInteger(
    v.trustedEffectiveAtLogicalMs,
    "trustedEffectiveAtLogicalMs",
  );
  if (v.kind === "evidence") {
    if (v.resolverBindingDigest !== null || v.resolutionProofDigest !== null)
      throw new TrustValidationError(
        "evidence causal basis may not carry a resolver proof",
      );
  } else {
    assertTrustDigest(v.resolverBindingDigest, "resolverBindingDigest");
    assertTrustDigest(v.resolutionProofDigest, "resolutionProofDigest");
  }
  return deepFreeze(
    structuredClone(v) as unknown as EvidenceCausalAuthorizationBasisV1,
  );
}

function authorizationBody(
  value: EvidenceCausalAuthorizationV1,
): Omit<
  EvidenceCausalAuthorizationV1,
  "authorizationId" | "authorizationDigest"
> {
  const { authorizationId: _id, authorizationDigest: _digest, ...body } = value;
  return body;
}
export function digestEvidenceCausalAuthorizationV1(value: unknown): string {
  const authorization = validateCausalAuthorization(value, false);
  return digestTrustJsonV1(
    "causal-authorization",
    authorizationBody(authorization) as unknown as JsonValue,
  );
}
function validateCausalAuthorization(
  value: unknown,
  verifyDigest: boolean,
): EvidenceCausalAuthorizationV1 {
  assertExactKeys(value, authorizationKeys, "causal authorization");
  const v = value as Record<string, unknown>;
  if (
    v.schemaVersion !== 1 ||
    (v.recordKind !== "claim" && v.recordKind !== "challenge")
  )
    throw new TrustValidationError("causal authorization schema is invalid");
  for (const key of ["recordId", "criterionId"] as const)
    assertIdentifier(v[key], key);
  for (const key of [
    "recordDigest",
    "policyDigest",
    "subjectDigest",
    "scopeDigest",
    "authorityBindingDigest",
    "authorityProofDigest",
  ] as const)
    assertTrustDigest(v[key], key);
  if ((v.targetRecordId === null) !== (v.targetRecordDigest === null))
    throw new TrustValidationError(
      "causal authorization target is inconsistent",
    );
  if (v.targetRecordId !== null) {
    assertIdentifier(v.targetRecordId, "targetRecordId");
    assertTrustDigest(v.targetRecordDigest, "targetRecordDigest");
  }
  if (
    typeof v.sourceRelation !== "string" ||
    !relationValues.has(v.sourceRelation)
  )
    throw new TrustValidationError(
      "causal authorization source relation is invalid",
    );
  assertSafeInteger(v.authorizedAtLogicalMs, "authorizedAtLogicalMs");
  if (!Array.isArray(v.bases) || v.bases.length === 0)
    throw new TrustValidationError("causal authorization requires bases");
  const bases = v.bases.map(validateEvidenceCausalAuthorizationBasisV1);
  const keys = bases.map(referenceKey);
  if (
    keys.some((key, index) => index > 0 && compare(keys[index - 1], key) >= 0)
  )
    throw new TrustValidationError(
      "causal authorization bases must be canonically ordered and unique",
    );
  if (
    bases.some(
      (basis) =>
        basis.trustedEffectiveAtLogicalMs > (v.authorizedAtLogicalMs as number),
    )
  )
    throw new TrustValidationError(
      "causal authorization basis cannot come from the future",
    );
  if (verifyDigest) {
    assertTrustDigest(v.authorizationDigest, "authorizationDigest");
    const candidate = {
      ...v,
      bases,
    } as unknown as EvidenceCausalAuthorizationV1;
    const digest = digestTrustJsonV1(
      "causal-authorization",
      authorizationBody(candidate) as unknown as JsonValue,
    );
    if (
      v.authorizationDigest !== digest ||
      v.authorizationId !== `causal-authorization:${digest}`
    )
      throw new TrustValidationError("causal authorization digest is invalid");
  } else {
    assertIdentifier(v.authorizationId, "authorizationId");
    assertTrustDigest(v.authorizationDigest, "authorizationDigest");
  }
  return deepFreeze(
    structuredClone({
      ...v,
      bases,
    }) as unknown as EvidenceCausalAuthorizationV1,
  );
}
export function validateEvidenceCausalAuthorizationV1(
  value: unknown,
): EvidenceCausalAuthorizationV1 {
  return validateCausalAuthorization(value, true);
}
export function createEvidenceCausalAuthorizationV1(
  input: Omit<
    EvidenceCausalAuthorizationV1,
    "authorizationId" | "authorizationDigest"
  >,
): EvidenceCausalAuthorizationV1 {
  const body = structuredClone(input);
  // Temporary derived fields let the closed validator normalize bases before digesting.
  const provisional = validateCausalAuthorization(
    {
      ...body,
      authorizationId: "causal-authorization:pending",
      authorizationDigest: "0".repeat(64),
    },
    false,
  );
  const digest = digestTrustJsonV1(
    "causal-authorization",
    authorizationBody(provisional) as unknown as JsonValue,
  );
  return validateCausalAuthorization(
    {
      ...body,
      authorizationId: `causal-authorization:${digest}`,
      authorizationDigest: digest,
    },
    true,
  );
}

export function causalAuthorizationReferenceKeyV1(
  value: Pick<
    EvidenceCausalAuthorizationBasisV1,
    "kind" | "referenceType" | "referenceId" | "referenceDigest"
  >,
): string {
  return `${value.kind as EvidenceReferenceKindV1}\u0000${value.referenceType}\u0000${value.referenceId}\u0000${value.referenceDigest}`;
}
