import type { JsonValue } from "@agentplat/core";
import {
  deepFreeze,
  digestTrustJsonV1,
  TrustValidationError,
} from "./canonical.js";
import type {
  ChallengeAuthorityRuleV1,
  ClaimAuthorityRuleV1,
  DependencyGroupPolicyV1,
  EvidenceBasisRuleV1,
  EvidenceCriterionPolicyV1,
  EvidenceFusionPolicyV1,
  EvidenceSourceBindingV1,
  EvidenceTrustDependencyBindingHeadV1,
  EvidenceTrustDependencyBindingKindV1,
  EvidenceTrustDependencyBindingV1,
  EvidenceTrustLimitsV1,
  QuarantinePolicyV1,
  RecoveryPolicyV1,
  TrustDimensionPolicyV1,
  TrustEligibilityRuleV1,
} from "./types.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertNullableTrustDigest,
  assertSafeInteger,
  assertToken,
  assertTrustDigest,
} from "./validation.js";

const compareUnicode = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
const assertOrdered = (values: readonly string[], label: string): void => {
  if (values.some((value, index) => index > 0 && values[index - 1] >= value))
    throw new TrustValidationError(
      `${label} must be canonically ordered and unique`,
    );
};
const assertBasisPoints = (
  value: unknown,
  label: string,
  minimum = 0,
): void => {
  assertSafeInteger(value, label, minimum);
  if ((value as number) > 10_000)
    throw new TrustValidationError(`${label} must be at most 10000`);
};
const ceiling: EvidenceTrustLimitsV1 = {
  maximumPolicies: 16,
  maximumDimensionsPerPolicy: 16,
  maximumCriteriaPerPolicy: 64,
  maximumSourceBindingsPerPolicy: 256,
  maximumDependencyGroupsPerPolicy: 64,
  maximumClaims: 4096,
  maximumAttestations: 16384,
  maximumChallenges: 4096,
  maximumChallengesPerSourceScope: 64,
  maximumPendingChallengesPerSourceScope: 16,
  maximumRetractions: 4096,
  maximumContentResolutions: 4096,
  maximumContentInvalidations: 4096,
  maximumCausalAuthorizations: 4096,
  maximumDependencyBindingVersions: 256,
  maximumPendingRecords: 1024,
  maximumPendingAgeMs: 86_400_000,
  maximumBasisReferencesPerRecord: 32,
  maximumRelationshipDepth: 16,
  maximumConsideredRecordsPerFusion: 1024,
  maximumRetainedFusionDecisions: 4096,
  maximumProfileHeads: 2048,
  maximumProfileRevisionsPerHead: 32,
  maximumQuarantineHeads: 2048,
  maximumDiagnostics: 1024,
  maximumRecordCanonicalBytes: 65_536,
  maximumContentReferenceBytes: 4096,
  maximumInlineSummaryBytes: 4096,
  maximumStateCanonicalBytes: 67_108_864,
  maximumEvidenceAgeMs: 2_592_000_000,
  maximumReviewIntervalMs: 604_800_000,
};
const limitKeys = Object.keys(ceiling) as (keyof EvidenceTrustLimitsV1)[];

function validateLimits(
  value: unknown,
  limits: EvidenceTrustLimitsV1,
): EvidenceTrustLimitsV1 {
  assertExactKeys(value, limitKeys, "policy limits");
  const candidate = value as Record<string, unknown>;
  for (const key of limitKeys) {
    assertSafeInteger(candidate[key], `limits.${key}`, 1);
    if ((candidate[key] as number) > limits[key])
      throw new TrustValidationError(`limits.${key} exceeds state limit`);
  }
  return structuredClone(candidate) as unknown as EvidenceTrustLimitsV1;
}
function validateBasisRules(
  value: unknown,
  label: string,
): EvidenceBasisRuleV1[] {
  if (!Array.isArray(value))
    throw new TrustValidationError(`${label} must be an array`);
  const rules = value.map((entry) => {
    assertExactKeys(
      entry,
      ["kind", "referenceType", "minimumCount", "maximumCount"],
      label,
    );
    const rule = entry as Record<string, unknown>;
    if (
      !["evidence", "mesh_record", "control_record", "external"].includes(
        rule.kind as string,
      )
    )
      throw new TrustValidationError(`${label}.kind is invalid`);
    assertToken(rule.referenceType, `${label}.referenceType`);
    assertSafeInteger(rule.minimumCount, `${label}.minimumCount`);
    assertSafeInteger(rule.maximumCount, `${label}.maximumCount`, 1);
    if ((rule.minimumCount as number) > (rule.maximumCount as number))
      throw new TrustValidationError(`${label} count range is invalid`);
    return structuredClone(rule) as unknown as EvidenceBasisRuleV1;
  });
  assertOrdered(
    rules.map((rule) => `${rule.kind}\u0000${rule.referenceType}`),
    label,
  );
  return rules;
}
function validateClaimAuthority(value: unknown): ClaimAuthorityRuleV1 {
  assertExactKeys(
    value,
    ["allowedSourceRelations", "allowedBasisReferences"],
    "claimAuthority",
  );
  const rule = value as Record<string, unknown>;
  if (!Array.isArray(rule.allowedSourceRelations))
    throw new TrustValidationError(
      "claimAuthority.allowedSourceRelations is invalid",
    );
  const relations = rule.allowedSourceRelations.map((entry) => {
    if (
      ![
        "subject_self",
        "work_assignee",
        "work_owner",
        "objective_observer",
        "recovery_witness",
        "local_system",
      ].includes(entry as string)
    )
      throw new TrustValidationError("claimAuthority relation is invalid");
    return entry as ClaimAuthorityRuleV1["allowedSourceRelations"][number];
  });
  assertOrdered(relations, "claimAuthority.allowedSourceRelations");
  return {
    allowedSourceRelations: relations,
    allowedBasisReferences: validateBasisRules(
      rule.allowedBasisReferences,
      "claimAuthority.allowedBasisReferences",
    ),
  };
}
function validateChallengeAuthority(value: unknown): ChallengeAuthorityRuleV1 {
  assertExactKeys(
    value,
    [
      "allowedSourceRelations",
      "allowedBasisReferences",
      "requireResolvedBasis",
    ],
    "challengeAuthority",
  );
  const rule = value as Record<string, unknown>;
  if (
    rule.requireResolvedBasis !== true ||
    !Array.isArray(rule.allowedSourceRelations)
  )
    throw new TrustValidationError("challengeAuthority is invalid");
  const relations = rule.allowedSourceRelations.map((entry) => {
    if (
      ![
        "target_author",
        "subject_self",
        "work_assignee",
        "work_owner",
        "objective_observer",
        "recovery_witness",
        "local_system",
      ].includes(entry as string)
    )
      throw new TrustValidationError("challengeAuthority relation is invalid");
    return entry as ChallengeAuthorityRuleV1["allowedSourceRelations"][number];
  });
  assertOrdered(relations, "challengeAuthority.allowedSourceRelations");
  return {
    allowedSourceRelations: relations,
    allowedBasisReferences: validateBasisRules(
      rule.allowedBasisReferences,
      "challengeAuthority.allowedBasisReferences",
    ),
    requireResolvedBasis: true,
  };
}
function validateDimension(
  value: unknown,
  limits: EvidenceTrustLimitsV1,
): TrustDimensionPolicyV1 {
  const keys = [
    "dimensionId",
    "priorScoreBasisPoints",
    "priorWeightBasisPoints",
    "minimumUncertaintyBasisPoints",
    "coverageTargetBasisPoints",
    "decayIntervalMs",
    "decayBasisPointsPerInterval",
    "uncertaintyGrowthBasisPointsPerInterval",
    "minimumRetainedWeightBasisPoints",
    "contradictionUncertaintyBasisPointsPerClaim",
    "maximumContradictionUncertaintyBasisPoints",
    "degradedScoreAtOrBelowBasisPoints",
    "degradedUncertaintyAtOrAboveBasisPoints",
  ];
  assertExactKeys(value, keys, "dimension");
  const v = value as Record<string, unknown>;
  assertToken(v.dimensionId, "dimensionId");
  for (const key of keys
    .slice(1)
    .filter((candidate) => candidate !== "decayIntervalMs"))
    assertBasisPoints(v[key], `dimension.${key}`);
  assertBasisPoints(
    v.priorWeightBasisPoints,
    "dimension.priorWeightBasisPoints",
    1,
  );
  assertBasisPoints(
    v.coverageTargetBasisPoints,
    "dimension.coverageTargetBasisPoints",
    1,
  );
  assertSafeInteger(v.decayIntervalMs, "dimension.decayIntervalMs", 1);
  if ((v.decayIntervalMs as number) > limits.maximumEvidenceAgeMs)
    throw new TrustValidationError("dimension decay interval exceeds limit");
  assertBasisPoints(
    v.contradictionUncertaintyBasisPointsPerClaim,
    "dimension.contradictionUncertaintyBasisPointsPerClaim",
    1,
  );
  if (
    (v.minimumRetainedWeightBasisPoints as number) >
      (v.priorWeightBasisPoints as number) ||
    (v.contradictionUncertaintyBasisPointsPerClaim as number) >
      (v.maximumContradictionUncertaintyBasisPoints as number)
  )
    throw new TrustValidationError("dimension bounds are invalid");
  return structuredClone(v) as unknown as TrustDimensionPolicyV1;
}
function validateCriterion(
  value: unknown,
  dimensions: ReadonlySet<string>,
  limits: EvidenceTrustLimitsV1,
): EvidenceCriterionPolicyV1 {
  const keys = [
    "criterionId",
    "dimensionId",
    "satisfiedValueBasisPoints",
    "violatedValueBasisPoints",
    "inconclusiveValueBasisPoints",
    "baseWeightBasisPoints",
    "maximumClaimWeightBasisPoints",
    "maximumSourceGroupContributionWeightBasisPoints",
    "minimumSupportGroups",
    "minimumSupportWeightBasisPoints",
    "minimumContradictionGroups",
    "minimumContradictionWeightBasisPoints",
    "allowClaimSourceAttestation",
    "contentRequired",
    "quarantineEligible",
    "recoveryEligible",
    "maximumAgeMs",
    "claimAuthority",
    "challengeAuthority",
    "challengeResolution",
  ];
  assertExactKeys(value, keys, "criterion");
  const v = value as Record<string, unknown>;
  assertToken(v.criterionId, "criterionId");
  assertToken(v.dimensionId, "dimensionId");
  if (!dimensions.has(v.dimensionId as string))
    throw new TrustValidationError("criterion dimension is undeclared");
  for (const key of [
    "satisfiedValueBasisPoints",
    "violatedValueBasisPoints",
    "baseWeightBasisPoints",
    "maximumClaimWeightBasisPoints",
    "maximumSourceGroupContributionWeightBasisPoints",
    "minimumSupportWeightBasisPoints",
    "minimumContradictionWeightBasisPoints",
  ])
    assertBasisPoints(v[key], `criterion.${key}`);
  for (const key of [
    "minimumSupportWeightBasisPoints",
    "minimumContradictionWeightBasisPoints",
  ])
    assertBasisPoints(v[key], `criterion.${key}`, 1);
  if (v.inconclusiveValueBasisPoints !== null)
    assertBasisPoints(
      v.inconclusiveValueBasisPoints,
      "criterion.inconclusiveValueBasisPoints",
    );
  for (const key of ["minimumSupportGroups", "minimumContradictionGroups"])
    assertSafeInteger(v[key], `criterion.${key}`, 1);
  if (
    (v.baseWeightBasisPoints as number) >
      (v.maximumClaimWeightBasisPoints as number) ||
    (v.maximumSourceGroupContributionWeightBasisPoints as number) >
      (v.maximumClaimWeightBasisPoints as number)
  )
    throw new TrustValidationError("criterion weight bounds are invalid");
  for (const key of [
    "allowClaimSourceAttestation",
    "contentRequired",
    "quarantineEligible",
    "recoveryEligible",
  ])
    if (typeof v[key] !== "boolean")
      throw new TrustValidationError(`criterion.${key} is invalid`);
  assertSafeInteger(v.maximumAgeMs, "criterion.maximumAgeMs", 1);
  if ((v.maximumAgeMs as number) > limits.maximumEvidenceAgeMs)
    throw new TrustValidationError("criterion maximum age exceeds limit");
  const challenge = v.challengeResolution;
  assertExactKeys(
    challenge,
    [
      "minimumCorroboratingGroups",
      "minimumCorroboratingWeightBasisPoints",
      "minimumOpposingGroups",
      "minimumOpposingWeightBasisPoints",
    ],
    "challengeResolution",
  );
  const c = challenge as Record<string, unknown>;
  for (const key of ["minimumCorroboratingGroups", "minimumOpposingGroups"])
    assertSafeInteger(c[key], `challengeResolution.${key}`, 1);
  for (const key of [
    "minimumCorroboratingWeightBasisPoints",
    "minimumOpposingWeightBasisPoints",
  ])
    assertBasisPoints(c[key], `challengeResolution.${key}`, 1);
  return {
    ...structuredClone(v),
    claimAuthority: validateClaimAuthority(v.claimAuthority),
    challengeAuthority: validateChallengeAuthority(v.challengeAuthority),
    challengeResolution: structuredClone(
      c,
    ) as unknown as EvidenceCriterionPolicyV1["challengeResolution"],
  } as EvidenceCriterionPolicyV1;
}
function validateSourceBindings(
  value: unknown,
  groups: ReadonlySet<string>,
): EvidenceSourceBindingV1[] {
  if (!Array.isArray(value))
    throw new TrustValidationError("sourceBindings must be an array");
  const bindings = value.map((entry) => {
    assertExactKeys(
      entry,
      [
        "sourceId",
        "sourceKind",
        "dependencyGroupId",
        "roles",
        "maximumWeightBasisPoints",
        "validFromLogicalMs",
        "validUntilLogicalMs",
      ],
      "source binding",
    );
    const v = entry as Record<string, unknown>;
    assertIdentifier(v.sourceId, "sourceId");
    if (v.sourceKind !== "local" && v.sourceKind !== "peer")
      throw new TrustValidationError("sourceKind is invalid");
    assertToken(v.dependencyGroupId, "dependencyGroupId");
    if (!groups.has(v.dependencyGroupId as string))
      throw new TrustValidationError("source binding group is undeclared");
    if (!Array.isArray(v.roles))
      throw new TrustValidationError("source binding roles are invalid");
    const roles = v.roles.map((role) => {
      if (!["claim", "attest", "challenge", "observe"].includes(role as string))
        throw new TrustValidationError("source binding role is invalid");
      return role as EvidenceSourceBindingV1["roles"][number];
    });
    assertOrdered(roles, "source binding roles");
    if (roles.length === 0)
      throw new TrustValidationError("source binding roles are empty");
    assertBasisPoints(
      v.maximumWeightBasisPoints,
      "source binding maximumWeightBasisPoints",
    );
    assertSafeInteger(
      v.validFromLogicalMs,
      "source binding validFromLogicalMs",
    );
    assertSafeInteger(
      v.validUntilLogicalMs,
      "source binding validUntilLogicalMs",
      1,
    );
    if ((v.validUntilLogicalMs as number) <= (v.validFromLogicalMs as number))
      throw new TrustValidationError("source binding validity is invalid");
    return {
      ...structuredClone(v),
      roles,
    } as unknown as EvidenceSourceBindingV1;
  });
  assertOrdered(
    bindings.map((b) => `${b.sourceKind}\u0000${b.sourceId}`),
    "sourceBindings",
  );
  return bindings;
}
function validateEligibility(
  value: unknown,
  dimensions: ReadonlySet<string>,
  limits: EvidenceTrustLimitsV1,
): TrustEligibilityRuleV1[] {
  if (!Array.isArray(value))
    throw new TrustValidationError("eligibilityRules must be an array");
  const rules = value.map((entry) => {
    assertExactKeys(
      entry,
      ["ruleId", "maximumProfileAgeMs", "requirements"],
      "eligibility rule",
    );
    const v = entry as Record<string, unknown>;
    assertToken(v.ruleId, "ruleId");
    assertSafeInteger(v.maximumProfileAgeMs, "maximumProfileAgeMs", 1);
    if ((v.maximumProfileAgeMs as number) > limits.maximumEvidenceAgeMs)
      throw new TrustValidationError("maximumProfileAgeMs exceeds limit");
    if (!Array.isArray(v.requirements) || v.requirements.length === 0)
      throw new TrustValidationError("eligibility requirements are invalid");
    const requirements = v.requirements.map((item) => {
      assertExactKeys(
        item,
        [
          "dimensionId",
          "minimumScoreBasisPoints",
          "maximumUncertaintyBasisPoints",
        ],
        "eligibility requirement",
      );
      const q = item as Record<string, unknown>;
      assertToken(q.dimensionId, "dimensionId");
      if (!dimensions.has(q.dimensionId as string))
        throw new TrustValidationError("eligibility dimension is undeclared");
      assertBasisPoints(q.minimumScoreBasisPoints, "minimumScoreBasisPoints");
      assertBasisPoints(
        q.maximumUncertaintyBasisPoints,
        "maximumUncertaintyBasisPoints",
      );
      return structuredClone(
        q,
      ) as unknown as TrustEligibilityRuleV1["requirements"][number];
    });
    assertOrdered(
      requirements.map((q) => q.dimensionId),
      "eligibility requirements",
    );
    return {
      ruleId: v.ruleId as string,
      maximumProfileAgeMs: v.maximumProfileAgeMs as number,
      requirements,
    };
  });
  assertOrdered(
    rules.map((rule) => rule.ruleId),
    "eligibilityRules",
  );
  return rules;
}
function validateQuarantine(
  value: unknown,
  dimensions: ReadonlySet<string>,
  limits: EvidenceTrustLimitsV1,
): QuarantinePolicyV1 {
  assertExactKeys(
    value,
    ["enabled", "rules", "maximumActiveRecords"],
    "quarantinePolicy",
  );
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== "boolean" || !Array.isArray(v.rules))
    throw new TrustValidationError("quarantinePolicy is invalid");
  assertSafeInteger(v.maximumActiveRecords, "maximumActiveRecords", 1);
  if ((v.maximumActiveRecords as number) > limits.maximumQuarantineHeads)
    throw new TrustValidationError("maximumActiveRecords exceeds limit");
  const rules = v.rules.map((item) => {
    assertExactKeys(
      item,
      [
        "dimensionId",
        "activationScoreAtOrBelowBasisPoints",
        "minimumNegativeClaimSourceGroups",
        "minimumNegativeWeightBasisPoints",
        "reviewIntervalMs",
      ],
      "quarantine rule",
    );
    const q = item as Record<string, unknown>;
    assertToken(q.dimensionId, "dimensionId");
    if (!dimensions.has(q.dimensionId as string))
      throw new TrustValidationError("quarantine dimension is undeclared");
    assertBasisPoints(
      q.activationScoreAtOrBelowBasisPoints,
      "activationScoreAtOrBelowBasisPoints",
    );
    assertSafeInteger(
      q.minimumNegativeClaimSourceGroups,
      "minimumNegativeClaimSourceGroups",
      1,
    );
    assertBasisPoints(
      q.minimumNegativeWeightBasisPoints,
      "minimumNegativeWeightBasisPoints",
      1,
    );
    assertSafeInteger(q.reviewIntervalMs, "reviewIntervalMs", 1);
    if ((q.reviewIntervalMs as number) > limits.maximumReviewIntervalMs)
      throw new TrustValidationError("review interval exceeds limit");
    return structuredClone(q) as unknown as QuarantinePolicyV1["rules"][number];
  });
  assertOrdered(
    rules.map((rule) => rule.dimensionId),
    "quarantine rules",
  );
  return {
    enabled: v.enabled as boolean,
    rules,
    maximumActiveRecords: v.maximumActiveRecords as number,
  };
}
function validateRecovery(
  value: unknown,
  dimensions: ReadonlySet<string>,
  limits: EvidenceTrustLimitsV1,
): RecoveryPolicyV1 {
  assertExactKeys(value, ["rules"], "recoveryPolicy");
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.rules))
    throw new TrustValidationError("recoveryPolicy rules are invalid");
  const rules = v.rules.map((item) => {
    assertExactKeys(
      item,
      [
        "dimensionId",
        "recoveryScoreAtOrAboveBasisPoints",
        "maximumRecoveryUncertaintyBasisPoints",
        "minimumRecoveryClaimSourceGroups",
        "minimumRecoveryWeightBasisPoints",
        "maximumRecoveryEvidenceAgeMs",
      ],
      "recovery rule",
    );
    const q = item as Record<string, unknown>;
    assertToken(q.dimensionId, "dimensionId");
    if (!dimensions.has(q.dimensionId as string))
      throw new TrustValidationError("recovery dimension is undeclared");
    assertBasisPoints(
      q.recoveryScoreAtOrAboveBasisPoints,
      "recoveryScoreAtOrAboveBasisPoints",
    );
    assertBasisPoints(
      q.maximumRecoveryUncertaintyBasisPoints,
      "maximumRecoveryUncertaintyBasisPoints",
    );
    assertSafeInteger(
      q.minimumRecoveryClaimSourceGroups,
      "minimumRecoveryClaimSourceGroups",
      1,
    );
    assertBasisPoints(
      q.minimumRecoveryWeightBasisPoints,
      "minimumRecoveryWeightBasisPoints",
      1,
    );
    assertSafeInteger(
      q.maximumRecoveryEvidenceAgeMs,
      "maximumRecoveryEvidenceAgeMs",
      1,
    );
    if (
      (q.maximumRecoveryEvidenceAgeMs as number) > limits.maximumEvidenceAgeMs
    )
      throw new TrustValidationError(
        "maximumRecoveryEvidenceAgeMs exceeds limit",
      );
    return structuredClone(q) as unknown as RecoveryPolicyV1["rules"][number];
  });
  assertOrdered(
    rules.map((rule) => rule.dimensionId),
    "recovery rules",
  );
  return { rules };
}

export function validateEvidenceFusionPolicyV1(
  value: unknown,
  stateLimits: EvidenceTrustLimitsV1 = ceiling,
): EvidenceFusionPolicyV1 {
  const keys = [
    "schemaVersion",
    "policyId",
    "policyVersion",
    "parentPolicyDigest",
    "mode",
    "dimensions",
    "criteria",
    "sourceBindings",
    "dependencyGroups",
    "eligibilityRules",
    "quarantinePolicy",
    "recoveryPolicy",
    "limits",
    "diagnosticsPolicyId",
    "redactionPolicyId",
  ];
  assertExactKeys(value, keys, "fusion policy");
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || (v.mode !== "observe" && v.mode !== "restrict"))
    throw new TrustValidationError("fusion policy is invalid");
  assertIdentifier(v.policyId, "policyId");
  assertSafeInteger(v.policyVersion, "policyVersion", 1);
  assertNullableTrustDigest(v.parentPolicyDigest, "parentPolicyDigest");
  assertIdentifier(v.diagnosticsPolicyId, "diagnosticsPolicyId");
  assertIdentifier(v.redactionPolicyId, "redactionPolicyId");
  const limits = validateLimits(v.limits, stateLimits);
  if (
    !Array.isArray(v.dimensions) ||
    v.dimensions.length === 0 ||
    v.dimensions.length > limits.maximumDimensionsPerPolicy
  )
    throw new TrustValidationError("policy dimensions exceed limit");
  const dimensions = v.dimensions.map((dimension) =>
    validateDimension(dimension, limits),
  );
  assertOrdered(
    dimensions.map((d) => d.dimensionId),
    "dimensions",
  );
  const dimensionIds = new Set(dimensions.map((d) => d.dimensionId));
  if (
    !Array.isArray(v.criteria) ||
    v.criteria.length === 0 ||
    v.criteria.length > limits.maximumCriteriaPerPolicy
  )
    throw new TrustValidationError("policy criteria exceed limit");
  const criteria = v.criteria.map((q) =>
    validateCriterion(q, dimensionIds, limits),
  );
  assertOrdered(
    criteria.map((q) => q.criterionId),
    "criteria",
  );
  if (
    !Array.isArray(v.dependencyGroups) ||
    v.dependencyGroups.length === 0 ||
    v.dependencyGroups.length > limits.maximumDependencyGroupsPerPolicy
  )
    throw new TrustValidationError("policy dependency groups exceed limit");
  const groups = v.dependencyGroups.map((entry) => {
    assertExactKeys(
      entry,
      [
        "dependencyGroupId",
        "maximumAttestationWeightPerClaimBasisPoints",
        "maximumProfileWeightPerDimensionCriterionBasisPoints",
      ],
      "dependency group",
    );
    const group = entry as Record<string, unknown>;
    assertToken(group.dependencyGroupId, "dependencyGroupId");
    assertBasisPoints(
      group.maximumAttestationWeightPerClaimBasisPoints,
      "maximumAttestationWeightPerClaimBasisPoints",
    );
    assertBasisPoints(
      group.maximumProfileWeightPerDimensionCriterionBasisPoints,
      "maximumProfileWeightPerDimensionCriterionBasisPoints",
    );
    return structuredClone(group) as unknown as DependencyGroupPolicyV1;
  });
  assertOrdered(
    groups.map((g) => g.dependencyGroupId),
    "dependencyGroups",
  );
  if (
    !Array.isArray(v.sourceBindings) ||
    v.sourceBindings.length > limits.maximumSourceBindingsPerPolicy
  )
    throw new TrustValidationError("policy source bindings exceed limit");
  const sourceBindings = validateSourceBindings(
    v.sourceBindings,
    new Set(groups.map((g) => g.dependencyGroupId)),
  );
  return deepFreeze({
    schemaVersion: 1,
    policyId: v.policyId as string,
    policyVersion: v.policyVersion as number,
    parentPolicyDigest: v.parentPolicyDigest as string | null,
    mode: v.mode as "observe" | "restrict",
    dimensions,
    criteria,
    sourceBindings,
    dependencyGroups: groups,
    eligibilityRules: validateEligibility(
      v.eligibilityRules,
      dimensionIds,
      limits,
    ),
    quarantinePolicy: validateQuarantine(
      v.quarantinePolicy,
      dimensionIds,
      limits,
    ),
    recoveryPolicy: validateRecovery(v.recoveryPolicy, dimensionIds, limits),
    limits,
    diagnosticsPolicyId: v.diagnosticsPolicyId as string,
    redactionPolicyId: v.redactionPolicyId as string,
  });
}
export const createEvidenceFusionPolicyV1 = validateEvidenceFusionPolicyV1;
export function digestEvidenceFusionPolicyV1(value: unknown): string {
  return digestTrustJsonV1(
    "policy",
    validateEvidenceFusionPolicyV1(value) as unknown as JsonValue,
  );
}

const policyRequired = new Set<EvidenceTrustDependencyBindingKindV1>([
  "content_resolver",
  "causal_authority",
  "mesh_ingress",
  "mesh_eligibility",
  "profile_resolver",
  "model_boundary",
  "action_dispatcher",
  "message_dispatcher",
]);
const upstreamRequired = new Set<EvidenceTrustDependencyBindingKindV1>([
  "causal_authority",
  "mesh_ingress",
  "mesh_eligibility",
  "verified_mesh_origin_verifier",
  "model_boundary",
  "action_dispatcher",
  "message_dispatcher",
]);
const bindingKeys = [
  "schemaVersion",
  "bindingName",
  "bindingVersion",
  "parentBindingDigest",
  "bindingKind",
  "implementationId",
  "implementationDigest",
  "configurationDigest",
  "policyDigest",
  "subjectMappingDigest",
  "upstreamBindingDigest",
  "registeredAtLogicalMs",
  "validFromLogicalMs",
  "validUntilLogicalMs",
  "bindingDigest",
];
function validateBinding(
  value: unknown,
  verifyDigest: boolean,
): EvidenceTrustDependencyBindingV1 {
  assertExactKeys(value, bindingKeys, "dependency binding");
  const v = value as Record<string, unknown>;
  if (
    v.schemaVersion !== 1 ||
    ![
      "content_resolver",
      "causal_authority",
      "mesh_ingress",
      "mesh_eligibility",
      "profile_resolver",
      "snapshot_protector",
      "verified_mesh_origin_verifier",
      "model_boundary",
      "action_dispatcher",
      "message_dispatcher",
    ].includes(v.bindingKind as string)
  )
    throw new TrustValidationError("dependency binding kind is invalid");
  assertIdentifier(v.bindingName, "bindingName");
  assertSafeInteger(v.bindingVersion, "bindingVersion", 1);
  assertNullableTrustDigest(v.parentBindingDigest, "parentBindingDigest");
  assertIdentifier(v.implementationId, "implementationId");
  assertTrustDigest(v.implementationDigest, "implementationDigest");
  assertTrustDigest(v.configurationDigest, "configurationDigest");
  assertNullableTrustDigest(v.policyDigest, "policyDigest");
  assertNullableTrustDigest(v.subjectMappingDigest, "subjectMappingDigest");
  assertNullableTrustDigest(v.upstreamBindingDigest, "upstreamBindingDigest");
  assertSafeInteger(v.registeredAtLogicalMs, "registeredAtLogicalMs");
  assertSafeInteger(v.validFromLogicalMs, "validFromLogicalMs");
  if ((v.validFromLogicalMs as number) < (v.registeredAtLogicalMs as number))
    throw new TrustValidationError("binding validity predates registration");
  if (v.validUntilLogicalMs !== null) {
    assertSafeInteger(v.validUntilLogicalMs, "validUntilLogicalMs", 1);
    if ((v.validUntilLogicalMs as number) <= (v.validFromLogicalMs as number))
      throw new TrustValidationError("binding validity is invalid");
  }
  const kind = v.bindingKind as EvidenceTrustDependencyBindingKindV1;
  if (policyRequired.has(kind) !== (v.policyDigest !== null))
    throw new TrustValidationError("binding policy nullability is invalid");
  if (upstreamRequired.has(kind) && v.upstreamBindingDigest === null)
    throw new TrustValidationError("binding upstream is required");
  const binding = structuredClone(
    v,
  ) as unknown as EvidenceTrustDependencyBindingV1;
  if (verifyDigest) {
    assertTrustDigest(binding.bindingDigest, "bindingDigest");
    if (
      binding.bindingDigest !==
      digestTrustJsonV1(
        "dependency-binding",
        (() => {
          const { bindingDigest: _digest, ...body } = binding;
          return body as unknown as JsonValue;
        })(),
      )
    )
      throw new TrustValidationError("binding digest is invalid");
  }
  return deepFreeze(binding);
}
export function validateEvidenceTrustDependencyBindingV1(
  value: unknown,
): EvidenceTrustDependencyBindingV1 {
  return validateBinding(value, true);
}
export function createEvidenceTrustDependencyBindingV1(
  input: Omit<EvidenceTrustDependencyBindingV1, "bindingDigest">,
): EvidenceTrustDependencyBindingV1 {
  const body = structuredClone(input) as Omit<
    EvidenceTrustDependencyBindingV1,
    "bindingDigest"
  >;
  const bindingDigest = digestTrustJsonV1(
    "dependency-binding",
    body as unknown as JsonValue,
  );
  return validateBinding({ ...body, bindingDigest }, true);
}
export function resolveEvidenceTrustDependencyBindingV1(
  bindings: readonly EvidenceTrustDependencyBindingV1[],
  bindingDigest: string,
  logicalTimeMs?: number,
): EvidenceTrustDependencyBindingV1 | null {
  assertTrustDigest(bindingDigest, "bindingDigest");
  if (logicalTimeMs !== undefined)
    assertSafeInteger(logicalTimeMs, "logicalTimeMs");
  const binding =
    bindings.find((candidate) => candidate.bindingDigest === bindingDigest) ??
    null;
  if (
    !binding ||
    (logicalTimeMs !== undefined &&
      (binding.validFromLogicalMs > logicalTimeMs ||
        (binding.validUntilLogicalMs !== null &&
          logicalTimeMs >= binding.validUntilLogicalMs)))
  )
    return null;
  return binding;
}
export function dependencyBindingHeadV1(
  binding: EvidenceTrustDependencyBindingV1,
): EvidenceTrustDependencyBindingHeadV1 {
  return {
    bindingKind: binding.bindingKind,
    bindingName: binding.bindingName,
    bindingVersion: binding.bindingVersion,
    bindingDigest: binding.bindingDigest,
  };
}
