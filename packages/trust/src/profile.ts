import type { JsonValue } from "@agentplat/core";
import {
  deepFreeze,
  digestTrustJsonV1,
  TrustValidationError,
} from "./canonical.js";
import { digestScopeV1, digestSubjectV1 } from "./evidence.js";
import {
  digestEvidenceFusionPolicyV1,
  validateEvidenceFusionPolicyV1,
} from "./policy.js";
import { validateEvidenceFusionDecisionV1 } from "./fusion.js";
import type {
  EvidenceFusionDecisionV1,
  EvidenceFusionPolicyV1,
  TrustDimensionStateV1,
  TrustProfileHeadV1,
  TrustProfileStatusV1,
  TrustProfileV1,
} from "./types.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  assertTrustDigest,
  validateEvidenceScopeV1,
  validateTrustSubjectV1,
} from "./validation.js";

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const profileKeys = [
  "schemaVersion",
  "profileId",
  "profileDigest",
  "revision",
  "previousProfileId",
  "previousProfileDigest",
  "tenantId",
  "subject",
  "subjectDigest",
  "scope",
  "scopeDigest",
  "policyId",
  "policyVersion",
  "policyDigest",
  "dimensions",
  "fusionDecisionId",
  "fusionDecisionDigest",
  "inputSetDigest",
  "updatedAtLogicalMs",
  "status",
] as const;
const headKeys = [
  "profileKey",
  "profileId",
  "profileDigest",
  "revision",
] as const;

function assertDimensions(value: unknown): readonly TrustDimensionStateV1[] {
  if (!Array.isArray(value))
    throw new TrustValidationError("profile dimensions are invalid");
  const dimensions = value as TrustDimensionStateV1[];
  for (const dimension of dimensions) {
    assertExactKeys(
      dimension,
      [
        "dimensionId",
        "scoreBasisPoints",
        "uncertaintyBasisPoints",
        "effectiveWeightBasisPoints",
        "coverageBasisPoints",
        "ageUncertaintyBasisPoints",
        "contradictionPressureBasisPoints",
        "includedClaimIds",
        "excludedClaimIds",
        "claimSourceDependencyGroupIds",
        "latestQualifyingEffectiveAtLogicalMs",
      ],
      "profile dimension",
    );
    assertIdentifier(dimension.dimensionId, "dimensionId");
    for (const key of [
      "scoreBasisPoints",
      "uncertaintyBasisPoints",
      "coverageBasisPoints",
      "ageUncertaintyBasisPoints",
      "contradictionPressureBasisPoints",
    ] as const) {
      assertSafeInteger(dimension[key], `dimension.${key}`);
      if (dimension[key] > 10_000)
        throw new TrustValidationError(
          `dimension.${key} is outside basis-point range`,
        );
    }
    assertSafeInteger(
      dimension.effectiveWeightBasisPoints,
      "dimension.effectiveWeightBasisPoints",
    );
    if (dimension.latestQualifyingEffectiveAtLogicalMs !== null)
      assertSafeInteger(
        dimension.latestQualifyingEffectiveAtLogicalMs,
        "latestQualifyingEffectiveAtLogicalMs",
      );
    for (const key of [
      "includedClaimIds",
      "excludedClaimIds",
      "claimSourceDependencyGroupIds",
    ] as const) {
      if (
        !Array.isArray(dimension[key]) ||
        dimension[key].some((item) => {
          try {
            assertIdentifier(item, `dimension.${key}`);
            return false;
          } catch {
            return true;
          }
        }) ||
        dimension[key].some(
          (item, index) =>
            index > 0 && compare(dimension[key][index - 1], item) >= 0,
        )
      )
        throw new TrustValidationError(
          `dimension.${key} must be canonically ordered and unique`,
        );
    }
  }
  if (
    dimensions.some(
      (item, index) =>
        index > 0 &&
        compare(dimensions[index - 1].dimensionId, item.dimensionId) >= 0,
    )
  )
    throw new TrustValidationError(
      "profile dimensions must be canonically ordered and unique",
    );
  return dimensions;
}
function profileBody(
  profile: TrustProfileV1,
): Omit<TrustProfileV1, "profileId" | "profileDigest"> {
  const { profileId: _id, profileDigest: _digest, ...body } = profile;
  return body;
}
export function digestTrustProfileKeyV1(value: {
  readonly tenantId: string;
  readonly scopeDigest: string;
  readonly subjectDigest: string;
  readonly policyDigest: string;
}): string {
  assertExactKeys(
    value,
    ["tenantId", "scopeDigest", "subjectDigest", "policyDigest"],
    "profile key",
  );
  assertIdentifier(value.tenantId, "tenantId");
  assertTrustDigest(value.scopeDigest, "scopeDigest");
  assertTrustDigest(value.subjectDigest, "subjectDigest");
  assertTrustDigest(value.policyDigest, "policyDigest");
  return digestTrustJsonV1("profile-key", value as JsonValue);
}
export function digestTrustProfileV1(value: TrustProfileV1): string {
  return digestTrustJsonV1(
    "profile",
    profileBody(value) as unknown as JsonValue,
  );
}
export function deriveTrustProfileStatusV1(
  dimensions: readonly TrustDimensionStateV1[],
  policy: EvidenceFusionPolicyV1,
): TrustProfileStatusV1 {
  if (
    dimensions.some(
      (dimension) => dimension.contradictionPressureBasisPoints > 0,
    )
  )
    return "contested";
  if (
    dimensions.every((dimension) => dimension.effectiveWeightBasisPoints === 0)
  )
    return "unknown";
  const byId = new Map(
    policy.dimensions.map((dimension) => [dimension.dimensionId, dimension]),
  );
  if (
    dimensions.some((dimension) => {
      const configured = byId.get(dimension.dimensionId);
      return (
        !configured ||
        dimension.scoreBasisPoints <=
          configured.degradedScoreAtOrBelowBasisPoints ||
        dimension.uncertaintyBasisPoints >=
          configured.degradedUncertaintyAtOrAboveBasisPoints
      );
    })
  )
    return "degraded";
  return "supported";
}
export function validateTrustProfileV1(value: unknown): TrustProfileV1 {
  assertExactKeys(value, profileKeys, "trust profile");
  const profile = value as unknown as TrustProfileV1;
  if (profile.schemaVersion !== 1)
    throw new TrustValidationError("profile schema is invalid");
  assertIdentifier(profile.profileId, "profileId");
  assertTrustDigest(profile.profileDigest, "profileDigest");
  assertSafeInteger(profile.revision, "revision", 1);
  if (
    (profile.previousProfileId === null) !==
    (profile.previousProfileDigest === null)
  )
    throw new TrustValidationError("profile predecessor is inconsistent");
  if (profile.previousProfileId !== null) {
    assertIdentifier(profile.previousProfileId, "previousProfileId");
    assertTrustDigest(profile.previousProfileDigest, "previousProfileDigest");
    if (
      profile.previousProfileId !== `profile:${profile.previousProfileDigest}`
    )
      throw new TrustValidationError("profile predecessor digest is invalid");
  }
  assertIdentifier(profile.tenantId, "tenantId");
  const subject = validateTrustSubjectV1(profile.subject),
    scope = validateEvidenceScopeV1(profile.scope);
  if (
    scope.tenantId !== profile.tenantId ||
    profile.subjectDigest !== digestSubjectV1(subject) ||
    profile.scopeDigest !== digestScopeV1(scope)
  )
    throw new TrustValidationError(
      "profile subject or scope binding is invalid",
    );
  assertTrustDigest(profile.subjectDigest, "subjectDigest");
  assertTrustDigest(profile.scopeDigest, "scopeDigest");
  assertIdentifier(profile.policyId, "policyId");
  assertSafeInteger(profile.policyVersion, "policyVersion", 1);
  assertTrustDigest(profile.policyDigest, "policyDigest");
  assertDimensions(profile.dimensions);
  for (const key of ["fusionDecisionId"] as const)
    assertIdentifier(profile[key], key);
  for (const key of ["fusionDecisionDigest", "inputSetDigest"] as const)
    assertTrustDigest(profile[key], key);
  assertSafeInteger(profile.updatedAtLogicalMs, "updatedAtLogicalMs");
  if (
    profile.dimensions.some(
      (dimension) =>
        dimension.latestQualifyingEffectiveAtLogicalMs !== null &&
        dimension.latestQualifyingEffectiveAtLogicalMs >
          profile.updatedAtLogicalMs,
    )
  )
    throw new TrustValidationError(
      "profile qualifying evidence comes from the future",
    );
  if (
    !(["unknown", "supported", "contested", "degraded"] as string[]).includes(
      profile.status,
    )
  )
    throw new TrustValidationError("profile status is invalid");
  if (
    profile.profileId !== `profile:${profile.profileDigest}` ||
    profile.profileDigest !== digestTrustProfileV1(profile)
  )
    throw new TrustValidationError("profile digest is invalid");
  return deepFreeze(
    structuredClone({ ...profile, subject, scope }) as TrustProfileV1,
  );
}
export function createTrustProfileV1(input: {
  readonly fusionDecision: EvidenceFusionDecisionV1;
  readonly policy: EvidenceFusionPolicyV1;
  readonly revision: number;
  readonly previousProfileId: string | null;
  readonly previousProfileDigest: string | null;
  readonly updatedAtLogicalMs: number;
}): TrustProfileV1 {
  assertExactKeys(
    input,
    [
      "fusionDecision",
      "policy",
      "revision",
      "previousProfileId",
      "previousProfileDigest",
      "updatedAtLogicalMs",
    ],
    "profile creation input",
  );
  const decision = validateEvidenceFusionDecisionV1(input.fusionDecision);
  const policy = validateEvidenceFusionPolicyV1(input.policy);
  const policyDigest = digestEvidenceFusionPolicyV1(policy);
  if (
    decision.policyId !== policy.policyId ||
    decision.policyVersion !== policy.policyVersion ||
    decision.policyDigest !== policyDigest
  )
    throw new TrustValidationError(
      "profile policy does not bind fusion decision",
    );
  if (input.updatedAtLogicalMs !== decision.evaluatedAtLogicalMs)
    throw new TrustValidationError(
      "profile clock does not match fusion decision",
    );
  if (decision.previousProfileDigest !== input.previousProfileDigest)
    throw new TrustValidationError(
      "profile predecessor does not match fusion decision",
    );
  assertSafeInteger(input.revision, "revision", 1);
  assertSafeInteger(input.updatedAtLogicalMs, "updatedAtLogicalMs");
  if (
    (input.revision === 1) !==
    (input.previousProfileId === null && input.previousProfileDigest === null)
  )
    throw new TrustValidationError("profile revision lineage is invalid");
  if (
    input.revision > 1 &&
    (input.previousProfileId === null || input.previousProfileDigest === null)
  )
    throw new TrustValidationError("profile revision lineage is invalid");
  const dimensions = assertDimensions(decision.dimensions);
  if (
    dimensions.length !== policy.dimensions.length ||
    dimensions.some(
      (dimension, index) =>
        dimension.dimensionId !== policy.dimensions[index]?.dimensionId,
    )
  )
    throw new TrustValidationError("profile dimensions do not match policy");
  const bare = {
    schemaVersion: 1 as const,
    revision: input.revision,
    previousProfileId: input.previousProfileId,
    previousProfileDigest: input.previousProfileDigest,
    tenantId: decision.tenantId,
    subject: decision.subject,
    subjectDigest: decision.subjectDigest,
    scope: decision.scope,
    scopeDigest: decision.scopeDigest,
    policyId: decision.policyId,
    policyVersion: decision.policyVersion,
    policyDigest: decision.policyDigest,
    dimensions,
    fusionDecisionId: decision.fusionDecisionId,
    fusionDecisionDigest: decision.fusionDecisionDigest,
    inputSetDigest: decision.inputSetDigest,
    updatedAtLogicalMs: input.updatedAtLogicalMs,
    status: deriveTrustProfileStatusV1(dimensions, policy),
  };
  const profileDigest = digestTrustJsonV1(
    "profile",
    bare as unknown as JsonValue,
  );
  return validateTrustProfileV1({
    ...bare,
    profileDigest,
    profileId: `profile:${profileDigest}`,
  });
}
export function trustProfileHeadV1(
  profile: TrustProfileV1,
): TrustProfileHeadV1 {
  const value = validateTrustProfileV1(profile);
  return deepFreeze({
    profileKey: digestTrustProfileKeyV1({
      tenantId: value.tenantId,
      scopeDigest: value.scopeDigest,
      subjectDigest: value.subjectDigest,
      policyDigest: value.policyDigest,
    }),
    profileId: value.profileId,
    profileDigest: value.profileDigest,
    revision: value.revision,
  } as TrustProfileHeadV1);
}
export function validateTrustProfileHeadV1(value: unknown): TrustProfileHeadV1 {
  assertExactKeys(value, headKeys, "profile head");
  const head = value as unknown as TrustProfileHeadV1;
  assertTrustDigest(head.profileKey, "profileKey");
  assertIdentifier(head.profileId, "profileId");
  assertTrustDigest(head.profileDigest, "profileDigest");
  assertSafeInteger(head.revision, "revision", 1);
  if (head.profileId !== `profile:${head.profileDigest}`)
    throw new TrustValidationError("profile head digest is invalid");
  return deepFreeze(structuredClone(head));
}
