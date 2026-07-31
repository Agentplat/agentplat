import type { JsonValue } from "@agentplat/core";
import {
  deepFreeze,
  digestTrustJsonV1,
  TrustValidationError,
} from "./canonical.js";
import { digestScopeV1, digestSubjectV1 } from "./evidence.js";
import { digestEvidenceFusionPolicyV1 } from "./policy.js";
import { digestTrustProfileKeyV1 } from "./profile.js";
import { validateEvidenceTrustStateV1 } from "./state.js";
import type {
  EvidenceTrustStateV1,
  TrustEligibilityDecisionV1,
  TrustEligibilityRequestV1,
  TrustEligibilityRequirementV1,
  TrustReasonCodeV1,
} from "./types.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  assertTrustDigest,
  validateEvidenceScopeV1,
  validateReasonCodeV1,
  validateTrustSubjectV1,
} from "./validation.js";

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const requestKeys = [
  "schemaVersion",
  "tenantId",
  "subject",
  "subjectDigest",
  "scope",
  "scopeDigest",
  "policyId",
  "policyVersion",
  "policyDigest",
  "profileId",
  "profileDigest",
  "maximumProfileAgeMs",
  "requirements",
] as const;
const decisionKeys = [
  "schemaVersion",
  "eligibilityDecisionId",
  "requestDigest",
  "subjectDigest",
  "scopeDigest",
  "policyDigest",
  "profileId",
  "profileDigest",
  "quarantineRecordIds",
  "evaluatedAtLogicalMs",
  "disposition",
  "requirementResults",
  "reasonCodes",
] as const;

function validateRequirements(
  value: unknown,
): readonly TrustEligibilityRequirementV1[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new TrustValidationError("eligibility requirements are invalid");
  const result = value.map((item) => {
    assertExactKeys(
      item,
      [
        "dimensionId",
        "minimumScoreBasisPoints",
        "maximumUncertaintyBasisPoints",
      ],
      "eligibility requirement",
    );
    const requirement = item as unknown as TrustEligibilityRequirementV1;
    assertIdentifier(requirement.dimensionId, "dimensionId");
    assertSafeInteger(
      requirement.minimumScoreBasisPoints,
      "minimumScoreBasisPoints",
    );
    assertSafeInteger(
      requirement.maximumUncertaintyBasisPoints,
      "maximumUncertaintyBasisPoints",
    );
    if (
      requirement.minimumScoreBasisPoints > 10_000 ||
      requirement.maximumUncertaintyBasisPoints > 10_000
    )
      throw new TrustValidationError("eligibility threshold is invalid");
    return requirement;
  });
  if (
    result.some(
      (item, index) =>
        index > 0 &&
        compare(result[index - 1].dimensionId, item.dimensionId) >= 0,
    )
  )
    throw new TrustValidationError(
      "eligibility requirements must be canonically ordered and unique",
    );
  return deepFreeze(structuredClone(result));
}

function requirementsEqual(
  left: readonly TrustEligibilityRequirementV1[],
  right: readonly TrustEligibilityRequirementV1[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.dimensionId === right[index].dimensionId &&
        item.minimumScoreBasisPoints === right[index].minimumScoreBasisPoints &&
        item.maximumUncertaintyBasisPoints ===
          right[index].maximumUncertaintyBasisPoints,
    )
  );
}

export function validateTrustEligibilityRequestV1(
  value: unknown,
): TrustEligibilityRequestV1 {
  assertExactKeys(value, requestKeys, "eligibility request");
  const request = value as unknown as TrustEligibilityRequestV1;
  if (request.schemaVersion !== 1)
    throw new TrustValidationError("eligibility request schema is invalid");
  assertIdentifier(request.tenantId, "tenantId");
  const subject = validateTrustSubjectV1(request.subject);
  const scope = validateEvidenceScopeV1(request.scope);
  if (
    scope.tenantId !== request.tenantId ||
    request.subjectDigest !== digestSubjectV1(subject) ||
    request.scopeDigest !== digestScopeV1(scope)
  )
    throw new TrustValidationError("eligibility request binding is invalid");
  for (const key of [
    "subjectDigest",
    "scopeDigest",
    "policyDigest",
    "profileDigest",
  ] as const)
    assertTrustDigest(request[key], key);
  for (const key of ["policyId", "profileId"] as const)
    assertIdentifier(request[key], key);
  if (request.profileId !== `profile:${request.profileDigest}`)
    throw new TrustValidationError("eligibility profile binding is invalid");
  assertSafeInteger(request.policyVersion, "policyVersion", 1);
  assertSafeInteger(request.maximumProfileAgeMs, "maximumProfileAgeMs", 1);
  return deepFreeze({
    ...request,
    subject,
    scope,
    requirements: validateRequirements(request.requirements),
  });
}
export const createTrustEligibilityRequestV1 =
  validateTrustEligibilityRequestV1;

export function digestTrustEligibilityRequestV1(
  value: TrustEligibilityRequestV1,
): string {
  return digestTrustJsonV1(
    "eligibility-request",
    validateTrustEligibilityRequestV1(value) as unknown as JsonValue,
  );
}

function decisionBody(
  value: TrustEligibilityDecisionV1,
): Omit<TrustEligibilityDecisionV1, "eligibilityDecisionId"> {
  const { eligibilityDecisionId: _id, ...body } = value;
  return body;
}

export function digestTrustEligibilityDecisionV1(
  value: TrustEligibilityDecisionV1,
): string {
  return digestTrustJsonV1(
    "eligibility-decision",
    decisionBody(value) as unknown as JsonValue,
  );
}

export function validateTrustEligibilityDecisionV1(
  value: unknown,
): TrustEligibilityDecisionV1 {
  assertExactKeys(value, decisionKeys, "eligibility decision");
  const decision = value as unknown as TrustEligibilityDecisionV1;
  if (decision.schemaVersion !== 1)
    throw new TrustValidationError("eligibility decision schema is invalid");
  for (const key of ["eligibilityDecisionId", "profileId"] as const)
    assertIdentifier(decision[key], key);
  for (const key of [
    "requestDigest",
    "subjectDigest",
    "scopeDigest",
    "policyDigest",
    "profileDigest",
  ] as const)
    assertTrustDigest(decision[key], key);
  if (decision.profileId !== `profile:${decision.profileDigest}`)
    throw new TrustValidationError("eligibility profile binding is invalid");
  assertSafeInteger(decision.evaluatedAtLogicalMs, "evaluatedAtLogicalMs");
  if (
    !Array.isArray(decision.quarantineRecordIds) ||
    decision.quarantineRecordIds.some((item) => {
      try {
        assertIdentifier(item, "quarantineRecordId");
        return false;
      } catch {
        return true;
      }
    }) ||
    decision.quarantineRecordIds.some(
      (item, index) =>
        index > 0 &&
        compare(decision.quarantineRecordIds[index - 1], item) >= 0,
    )
  )
    throw new TrustValidationError("quarantine IDs are invalid");
  if (!Array.isArray(decision.requirementResults))
    throw new TrustValidationError(
      "eligibility requirement results are invalid",
    );
  for (const result of decision.requirementResults) {
    assertExactKeys(
      result,
      [
        "dimensionId",
        "observedScoreBasisPoints",
        "observedUncertaintyBasisPoints",
        "met",
      ],
      "eligibility requirement result",
    );
    assertIdentifier(result.dimensionId, "dimensionId");
    const bothUnavailable =
      result.observedScoreBasisPoints === null &&
      result.observedUncertaintyBasisPoints === null;
    const bothAvailable =
      result.observedScoreBasisPoints !== null &&
      result.observedUncertaintyBasisPoints !== null;
    if (!bothUnavailable && !bothAvailable)
      throw new TrustValidationError(
        "eligibility observations are inconsistent",
      );
    for (const key of [
      "observedScoreBasisPoints",
      "observedUncertaintyBasisPoints",
    ] as const) {
      const observation = result[key];
      if (observation !== null) {
        assertSafeInteger(observation, key);
        if (observation > 10_000)
          throw new TrustValidationError(
            "observed eligibility value is invalid",
          );
      }
    }
    if (typeof result.met !== "boolean" || (bothUnavailable && result.met))
      throw new TrustValidationError("eligibility met is invalid");
  }
  if (
    decision.requirementResults.some(
      (item, index) =>
        index > 0 &&
        compare(
          decision.requirementResults[index - 1].dimensionId,
          item.dimensionId,
        ) >= 0,
    )
  )
    throw new TrustValidationError(
      "eligibility results must be canonically ordered and unique",
    );
  if (
    !(
      ["eligible", "restricted", "quarantined", "unavailable"] as string[]
    ).includes(decision.disposition)
  )
    throw new TrustValidationError("eligibility disposition is invalid");
  if (
    !Array.isArray(decision.reasonCodes) ||
    decision.reasonCodes.some((reason) => {
      try {
        validateReasonCodeV1(reason);
        return false;
      } catch {
        return true;
      }
    }) ||
    decision.reasonCodes.some(
      (item, index) =>
        index > 0 && compare(decision.reasonCodes[index - 1], item) >= 0,
    )
  )
    throw new TrustValidationError("eligibility reasons are invalid");
  if (
    decision.eligibilityDecisionId !==
    `eligibility-decision:${digestTrustEligibilityDecisionV1(decision)}`
  )
    throw new TrustValidationError("eligibility decision digest is invalid");
  return deepFreeze(structuredClone(decision));
}

export function evaluateTrustEligibilityV1(
  stateValue: EvidenceTrustStateV1,
  requestValue: TrustEligibilityRequestV1,
  logicalTimeMs: number,
): TrustEligibilityDecisionV1 {
  const state = validateEvidenceTrustStateV1(stateValue);
  const request = validateTrustEligibilityRequestV1(requestValue);
  assertSafeInteger(logicalTimeMs, "logicalTimeMs");
  if (logicalTimeMs < state.logicalTimeHighWaterMs)
    throw new TrustValidationError("logical time rollback");

  const policy = state.policies.find(
    (item) =>
      item.policyId === request.policyId &&
      item.policyVersion === request.policyVersion &&
      digestEvidenceFusionPolicyV1(item) === request.policyDigest,
  );
  const templates =
    policy?.eligibilityRules.filter(
      (rule) =>
        rule.maximumProfileAgeMs === request.maximumProfileAgeMs &&
        requirementsEqual(rule.requirements, request.requirements),
    ) ?? [];
  if (templates.length !== 1)
    throw new TrustValidationError(
      "eligibility request is not an exact policy template",
    );

  const reasons = new Set<TrustReasonCodeV1>();
  const policyHead = state.policyHeads.find(
    (head) => head.policyId === request.policyId,
  );
  if (
    !policyHead ||
    policyHead.policyVersion !== request.policyVersion ||
    policyHead.policyDigest !== request.policyDigest
  )
    reasons.add("policy_mismatch");

  const profileKey = digestTrustProfileKeyV1({
    tenantId: request.tenantId,
    subjectDigest: request.subjectDigest,
    scopeDigest: request.scopeDigest,
    policyDigest: request.policyDigest,
  });
  const profile =
    state.profiles.find(
      (item) =>
        item.profileId === request.profileId &&
        item.profileDigest === request.profileDigest,
    ) ?? null;
  const profileHead = state.profileHeads.find(
    (head) => head.profileKey === profileKey,
  );
  const hasUnmaterializedSuccessor = state.fusionDecisions.some(
    (decision) =>
      decision.tenantId === request.tenantId &&
      decision.subjectDigest === request.subjectDigest &&
      decision.scopeDigest === request.scopeDigest &&
      decision.policyId === request.policyId &&
      decision.policyVersion === request.policyVersion &&
      decision.policyDigest === request.policyDigest &&
      decision.previousProfileDigest === request.profileDigest &&
      decision.evaluatedAtLogicalMs <= logicalTimeMs &&
      !state.profiles.some(
        (candidate) =>
          candidate.fusionDecisionId === decision.fusionDecisionId &&
          candidate.fusionDecisionDigest === decision.fusionDecisionDigest,
      ),
  );
  const profileAvailable =
    profile !== null &&
    !hasUnmaterializedSuccessor &&
    profileHead?.profileId === request.profileId &&
    profileHead.profileDigest === request.profileDigest &&
    profile.tenantId === request.tenantId &&
    profile.subjectDigest === request.subjectDigest &&
    profile.scopeDigest === request.scopeDigest &&
    profile.policyId === request.policyId &&
    profile.policyVersion === request.policyVersion &&
    profile.policyDigest === request.policyDigest &&
    profile.updatedAtLogicalMs <= logicalTimeMs;
  if (!profileAvailable) reasons.add("profile_unavailable");
  else if (
    logicalTimeMs - profile.updatedAtLogicalMs >
    request.maximumProfileAgeMs
  )
    reasons.add("profile_stale");

  const dimensions = new Map(
    profileAvailable
      ? profile.dimensions.map((item) => [item.dimensionId, item])
      : [],
  );
  let hasUnavailableRequirement = false;
  let hasRestrictedRequirement = false;
  const requirementResults = request.requirements.map((requirement) => {
    const dimension = dimensions.get(requirement.dimensionId);
    if (!dimension) hasUnavailableRequirement = true;
    else if (
      dimension.uncertaintyBasisPoints >
      requirement.maximumUncertaintyBasisPoints
    )
      hasUnavailableRequirement = true;
    else if (dimension.scoreBasisPoints < requirement.minimumScoreBasisPoints)
      hasRestrictedRequirement = true;
    return {
      dimensionId: requirement.dimensionId,
      observedScoreBasisPoints: dimension?.scoreBasisPoints ?? null,
      observedUncertaintyBasisPoints: dimension?.uncertaintyBasisPoints ?? null,
      met:
        dimension !== undefined &&
        dimension.scoreBasisPoints >= requirement.minimumScoreBasisPoints &&
        dimension.uncertaintyBasisPoints <=
          requirement.maximumUncertaintyBasisPoints,
    };
  });
  if (hasUnavailableRequirement) reasons.add("profile_unavailable");
  if (hasRestrictedRequirement) reasons.add("eligibility_restricted");

  const quarantineHeads = new Map(
    state.quarantineHeads.map((head) => [head.quarantineKey, head]),
  );
  const quarantines = state.quarantines
    .filter((item) => {
      const head = quarantineHeads.get(item.quarantineKey);
      return (
        item.tenantId === request.tenantId &&
        item.subjectDigest === request.subjectDigest &&
        item.scopeDigest === request.scopeDigest &&
        item.policyDigest === request.policyDigest &&
        request.requirements.some(
          (requirement) => requirement.dimensionId === item.dimensionId,
        ) &&
        (item.status === "active" || item.status === "review_required") &&
        head?.quarantineId === item.quarantineId &&
        head.status === item.status
      );
    })
    .sort((left, right) => compare(left.quarantineId, right.quarantineId));
  if (
    quarantines.some(
      (item) =>
        item.status === "active" && item.reviewAfterLogicalMs > logicalTimeMs,
    )
  )
    reasons.add("quarantine_activated");
  if (
    quarantines.some(
      (item) =>
        item.status === "review_required" ||
        (item.status === "active" &&
          item.reviewAfterLogicalMs <= logicalTimeMs),
    )
  )
    reasons.add("quarantine_review_required");

  const disposition =
    reasons.has("policy_mismatch") ||
    reasons.has("profile_unavailable") ||
    reasons.has("profile_stale")
      ? "unavailable"
      : quarantines.length > 0
        ? "quarantined"
        : reasons.has("eligibility_restricted")
          ? "restricted"
          : "eligible";
  const body = {
    schemaVersion: 1 as const,
    requestDigest: digestTrustEligibilityRequestV1(request),
    subjectDigest: request.subjectDigest,
    scopeDigest: request.scopeDigest,
    policyDigest: request.policyDigest,
    profileId: request.profileId,
    profileDigest: request.profileDigest,
    quarantineRecordIds: quarantines.map((item) => item.quarantineId),
    evaluatedAtLogicalMs: logicalTimeMs,
    disposition,
    requirementResults,
    reasonCodes: [...reasons].sort(compare),
  };
  const digest = digestTrustJsonV1(
    "eligibility-decision",
    body as unknown as JsonValue,
  );
  return validateTrustEligibilityDecisionV1({
    ...body,
    eligibilityDecisionId: `eligibility-decision:${digest}`,
  });
}
