import type { JsonValue } from "@agentplat/core";
import {
  canonicalTrustJsonBytesV1,
  canonicalizeTrustJsonV1,
  deepFreeze,
  digestTrustJsonV1,
  TrustValidationError,
} from "./canonical.js";
import type {
  EvidenceTrustLimitsV1,
  EvidenceFusionPolicyV1,
  EvidenceTrustPolicyHeadV1,
  EvidenceTrustDependencyBindingV1,
  EvidenceTrustDependencyBindingHeadV1,
  EvidenceTrustRollbackAnchorV1,
  EvidenceTrustSnapshotIntegrityProofV1,
  EvidenceTrustSnapshotProtectorV1,
  EvidenceTrustSnapshotV1,
  EvidenceTrustStateV1,
  EvidenceTrustRestoreOptionsV1,
  EvidenceCausalAuthorizationV1,
} from "./types.js";
import {
  dependencyBindingHeadV1,
  digestEvidenceFusionPolicyV1,
  validateEvidenceFusionPolicyV1,
  validateEvidenceTrustDependencyBindingV1,
} from "./policy.js";
import { validateEvidenceCausalAuthorizationV1 } from "./causal.js";
import {
  deriveApplicableBindingDigests,
  evaluateEvidenceFusionV1,
  validateEvidenceFusionDecisionV1,
} from "./fusion.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  assertTrustDigest,
  validateReasonCodeV1,
} from "./validation.js";
import {
  validateEvidenceContentResolutionInvalidationV1,
  validateEvidenceContentResolutionV1,
  validateEvidenceRecordStateV1,
  projectEvidenceLifecycleV1,
  resolveEvidenceCausalAuthorityVerifierV1,
  resolveVerifiedMeshAdmissionVerifierV1,
} from "./lifecycle.js";
import { digestScopeV1, digestSubjectV1 } from "./evidence.js";
import {
  createTrustProfileV1,
  digestTrustProfileKeyV1,
  trustProfileHeadV1,
  validateTrustProfileHeadV1,
  validateTrustProfileV1,
} from "./profile.js";
import {
  createActiveQuarantineRecordV1,
  createRecoveredQuarantineRecordV1,
  createReviewRequiredQuarantineRecordV1,
  deriveQuarantineActivationsV1,
  evaluateQuarantineRecoveryV1,
  quarantineHeadV1,
  validateQuarantineHeadV1,
  validateQuarantineRecordV1,
  validateQuarantineRecoveryDecisionV1,
} from "./quarantine.js";

const stateCanonicalLimits = (maximumBytes: number) => ({
  maximumBytes,
  maximumDepth: 64,
  maximumNodes: 100_000,
  maximumKeysPerObject: 256,
  maximumItemsPerArray: 100_000,
});
const compareUnicode = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
function assertCanonicalOrder(values: readonly string[], label: string): void {
  if (
    values.some(
      (value, index) =>
        index > 0 && compareUnicode(values[index - 1], value) >= 0,
    )
  )
    throw new TrustValidationError(
      `${label} must be canonically ordered and unique`,
    );
}

export const EVIDENCE_TRUST_LIMITS_V1: Readonly<EvidenceTrustLimitsV1> =
  Object.freeze({
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
    maximumQuarantineRevisionsPerHead: 32,
    maximumRecoveryDecisions: 4096,
    maximumDiagnostics: 1024,
    maximumRecordCanonicalBytes: 65_536,
    maximumContentReferenceBytes: 4096,
    maximumInlineSummaryBytes: 4096,
    maximumStateCanonicalBytes: 67_108_864,
    maximumEvidenceAgeMs: 2_592_000_000,
    maximumReviewIntervalMs: 604_800_000,
  });
const limitKeys = Object.keys(
  EVIDENCE_TRUST_LIMITS_V1,
) as (keyof EvidenceTrustLimitsV1)[];
export function validateEvidenceTrustLimitsV1(
  value: unknown,
): EvidenceTrustLimitsV1 {
  assertExactKeys(value, limitKeys, "limits");
  const limits = value as Record<string, unknown>;
  for (const key of limitKeys) {
    assertSafeInteger(limits[key], key, 1);
    if ((limits[key] as number) > EVIDENCE_TRUST_LIMITS_V1[key])
      throw new TrustValidationError(`${key} exceeds V1 ceiling`);
  }
  return deepFreeze(
    structuredClone(limits) as unknown as EvidenceTrustLimitsV1,
  );
}
const stateKeys = [
  "schemaVersion",
  "stateId",
  "limits",
  "logicalTimeHighWaterMs",
  "policies",
  "policyHeads",
  "sourceBindings",
  "dependencyBindings",
  "dependencyBindingHeads",
  "causalAuthorizations",
  "records",
  "contentResolutions",
  "contentInvalidations",
  "pendingRecords",
  "fusionDecisions",
  "profiles",
  "profileHeads",
  "quarantines",
  "quarantineHeads",
  "recoveryDecisions",
  "diagnostics",
  "traceDigest",
  "encodedBytes",
] as const;
export function createEvidenceTrustStateV1(input: {
  readonly stateId: string;
  readonly limits?: EvidenceTrustLimitsV1;
}): EvidenceTrustStateV1 {
  assertIdentifier(input.stateId, "stateId");
  const limits = validateEvidenceTrustLimitsV1(
    input.limits ?? EVIDENCE_TRUST_LIMITS_V1,
  );
  const state = {
    schemaVersion: 1 as const,
    stateId: input.stateId,
    limits,
    logicalTimeHighWaterMs: 0,
    policies: [],
    policyHeads: [],
    sourceBindings: [],
    dependencyBindings: [],
    dependencyBindingHeads: [],
    causalAuthorizations: [],
    records: [],
    contentResolutions: [],
    contentInvalidations: [],
    pendingRecords: [],
    fusionDecisions: [],
    profiles: [],
    profileHeads: [],
    quarantines: [],
    quarantineHeads: [],
    recoveryDecisions: [],
    diagnostics: [],
    traceDigest: digestTrustJsonV1("trace", []),
    encodedBytes: 0,
  };
  const encodedBytes = canonicalTrustJsonBytesV1(
    state as unknown as JsonValue,
    stateCanonicalLimits(limits.maximumStateCanonicalBytes),
  ).byteLength;
  return validateEvidenceTrustStateV1({ ...state, encodedBytes });
}
export function validateEvidenceTrustStateV1(
  value: unknown,
): EvidenceTrustStateV1 {
  assertExactKeys(value, stateKeys, "state");
  const state = value as Record<string, unknown>;
  if (state.schemaVersion !== 1)
    throw new TrustValidationError("state schema is invalid");
  assertIdentifier(state.stateId, "stateId");
  const limits = validateEvidenceTrustLimitsV1(state.limits);
  assertSafeInteger(state.logicalTimeHighWaterMs, "logicalTimeHighWaterMs");
  const logicalTimeHighWaterMs = state.logicalTimeHighWaterMs as number;
  assertTrustDigest(state.traceDigest, "traceDigest");
  assertSafeInteger(state.encodedBytes, "encodedBytes");
  for (const key of ["sourceBindings"] as const) {
    if (!Array.isArray(state[key]) || state[key].length !== 0)
      throw new TrustValidationError(
        `${key} is unavailable before its increment`,
      );
  }
  if (!Array.isArray(state.fusionDecisions))
    throw new TrustValidationError("fusion decisions are invalid");
  const fusionDecisions = state.fusionDecisions.map(
    validateEvidenceFusionDecisionV1,
  );
  if (fusionDecisions.length > limits.maximumRetainedFusionDecisions)
    throw new TrustValidationError("fusion decision capacity exceeded");
  assertCanonicalOrder(
    fusionDecisions.map((decision) => decision.fusionDecisionDigest),
    "fusion decisions",
  );
  if (
    new Set(fusionDecisions.map((decision) => decision.fusionDecisionId))
      .size !== fusionDecisions.length
  )
    throw new TrustValidationError("fusion decision IDs must be unique");
  if (!Array.isArray(state.policies) || !Array.isArray(state.policyHeads))
    throw new TrustValidationError("policy state arrays are invalid");
  const policies = state.policies.map((policy) =>
    validateEvidenceFusionPolicyV1(policy, limits),
  );
  for (const decision of fusionDecisions) {
    if (
      !policies.some(
        (policy) =>
          policy.policyId === decision.policyId &&
          policy.policyVersion === decision.policyVersion &&
          digestEvidenceFusionPolicyV1(policy) === decision.policyDigest,
      )
    )
      throw new TrustValidationError("fusion decision policy is unavailable");
  }
  if (policies.length > limits.maximumPolicies)
    throw new TrustValidationError("policy capacity exceeded");
  assertCanonicalOrder(
    policies.map(
      (policy) =>
        `${policy.policyId}\u0000${String(policy.policyVersion).padStart(16, "0")}\u0000${digestEvidenceFusionPolicyV1(policy)}`,
    ),
    "policies",
  );
  const policyByDigest = new Map(
    policies.map((policy) => [digestEvidenceFusionPolicyV1(policy), policy]),
  );
  const policyVersions = new Set<string>();
  for (const policy of policies) {
    const digest = digestEvidenceFusionPolicyV1(policy);
    const versionKey = `${policy.policyId}\u0000${policy.policyVersion}`;
    if (policyVersions.has(versionKey))
      throw new TrustValidationError("policy version is duplicated");
    policyVersions.add(versionKey);
    if ((policy.policyVersion === 1) !== (policy.parentPolicyDigest === null))
      throw new TrustValidationError("policy lineage is invalid");
    if (policy.parentPolicyDigest !== null) {
      const parent = policyByDigest.get(policy.parentPolicyDigest);
      if (
        !parent ||
        parent.policyId !== policy.policyId ||
        parent.policyVersion + 1 !== policy.policyVersion ||
        digest === policy.parentPolicyDigest
      )
        throw new TrustValidationError("policy lineage is invalid");
    }
  }
  const policyHeads = state.policyHeads.map((head) => {
    assertExactKeys(
      head,
      ["policyId", "policyVersion", "policyDigest"],
      "policy head",
    );
    const value = head as Record<string, unknown>;
    assertIdentifier(value.policyId, "policyHead.policyId");
    assertSafeInteger(value.policyVersion, "policyHead.policyVersion", 1);
    assertTrustDigest(value.policyDigest, "policyHead.policyDigest");
    return value as unknown as EvidenceTrustPolicyHeadV1;
  });
  assertCanonicalOrder(
    policyHeads.map((head) => head.policyId),
    "policy heads",
  );
  const expectedPolicyHeads = policies
    .reduce((heads, policy) => {
      const prior = heads.get(policy.policyId);
      if (!prior || prior.policyVersion < policy.policyVersion)
        heads.set(policy.policyId, {
          policyId: policy.policyId,
          policyVersion: policy.policyVersion,
          policyDigest: digestEvidenceFusionPolicyV1(policy),
        });
      return heads;
    }, new Map<string, EvidenceTrustPolicyHeadV1>())
    .values();
  const canonicalPolicyHeads = [...expectedPolicyHeads].sort((a, b) =>
    compareUnicode(a.policyId, b.policyId),
  );
  if (
    policyHeads.length !== canonicalPolicyHeads.length ||
    policyHeads.some(
      (head, index) =>
        head.policyId !== canonicalPolicyHeads[index].policyId ||
        head.policyVersion !== canonicalPolicyHeads[index].policyVersion ||
        head.policyDigest !== canonicalPolicyHeads[index].policyDigest,
    )
  )
    throw new TrustValidationError("policy heads do not match policy history");
  if (
    !Array.isArray(state.dependencyBindings) ||
    !Array.isArray(state.dependencyBindingHeads)
  )
    throw new TrustValidationError(
      "dependency binding state arrays are invalid",
    );
  const dependencyBindings = state.dependencyBindings.map(
    validateEvidenceTrustDependencyBindingV1,
  );
  if (dependencyBindings.length > limits.maximumDependencyBindingVersions)
    throw new TrustValidationError("dependency binding capacity exceeded");
  assertCanonicalOrder(
    dependencyBindings.map(
      (binding) =>
        `${binding.bindingKind}\u0000${binding.bindingName}\u0000${String(binding.bindingVersion).padStart(16, "0")}\u0000${binding.bindingDigest}`,
    ),
    "dependency bindings",
  );
  const policyDigests = new Set(policies.map(digestEvidenceFusionPolicyV1));
  const bindingByDigest = new Map(
    dependencyBindings.map((binding) => [binding.bindingDigest, binding]),
  );
  const bindingVersions = new Set<string>();
  for (const binding of dependencyBindings) {
    if (
      binding.policyDigest !== null &&
      !policyDigests.has(binding.policyDigest)
    )
      throw new TrustValidationError(
        "dependency binding policy is unregistered",
      );
    const versionKey = `${binding.bindingKind}\u0000${binding.bindingName}\u0000${binding.bindingVersion}`;
    if (bindingVersions.has(versionKey))
      throw new TrustValidationError(
        "dependency binding version is duplicated",
      );
    bindingVersions.add(versionKey);
    if (
      (binding.bindingVersion === 1) !==
      (binding.parentBindingDigest === null)
    )
      throw new TrustValidationError("dependency binding lineage is invalid");
    if (binding.parentBindingDigest !== null) {
      const parent = bindingByDigest.get(binding.parentBindingDigest);
      if (
        !parent ||
        parent.bindingKind !== binding.bindingKind ||
        parent.bindingName !== binding.bindingName ||
        parent.bindingVersion + 1 !== binding.bindingVersion
      )
        throw new TrustValidationError("dependency binding lineage is invalid");
    }
    if (
      binding.upstreamBindingDigest !== null &&
      !bindingByDigest.has(binding.upstreamBindingDigest)
    )
      throw new TrustValidationError(
        "dependency binding upstream is unregistered",
      );
  }
  const dependencyBindingHeads = state.dependencyBindingHeads.map((head) => {
    assertExactKeys(
      head,
      ["bindingKind", "bindingName", "bindingVersion", "bindingDigest"],
      "dependency binding head",
    );
    const value = head as Record<string, unknown>;
    if (
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
      ].includes(value.bindingKind as string)
    )
      throw new TrustValidationError("dependency binding head kind is invalid");
    assertIdentifier(value.bindingName, "dependencyBindingHead.bindingName");
    assertSafeInteger(
      value.bindingVersion,
      "dependencyBindingHead.bindingVersion",
      1,
    );
    assertTrustDigest(
      value.bindingDigest,
      "dependencyBindingHead.bindingDigest",
    );
    return value as unknown as EvidenceTrustDependencyBindingHeadV1;
  });
  assertCanonicalOrder(
    dependencyBindingHeads.map(
      (head) => `${head.bindingKind}\u0000${head.bindingName}`,
    ),
    "dependency binding heads",
  );
  const expectedDependencyHeads = dependencyBindings
    .reduce((heads, binding) => {
      const key = `${binding.bindingKind}\u0000${binding.bindingName}`;
      const prior = heads.get(key);
      if (!prior || prior.bindingVersion < binding.bindingVersion)
        heads.set(key, dependencyBindingHeadV1(binding));
      return heads;
    }, new Map<string, EvidenceTrustDependencyBindingHeadV1>())
    .values();
  const canonicalDependencyHeads = [...expectedDependencyHeads].sort((a, b) =>
    compareUnicode(
      `${a.bindingKind}\u0000${a.bindingName}`,
      `${b.bindingKind}\u0000${b.bindingName}`,
    ),
  );
  if (
    dependencyBindingHeads.length !== canonicalDependencyHeads.length ||
    dependencyBindingHeads.some(
      (head, index) =>
        head.bindingKind !== canonicalDependencyHeads[index].bindingKind ||
        head.bindingName !== canonicalDependencyHeads[index].bindingName ||
        head.bindingVersion !==
          canonicalDependencyHeads[index].bindingVersion ||
        head.bindingDigest !== canonicalDependencyHeads[index].bindingDigest,
    )
  )
    throw new TrustValidationError(
      "dependency binding heads do not match binding history",
    );
  if (!Array.isArray(state.causalAuthorizations))
    throw new TrustValidationError("causal authorizations are invalid");
  const causalAuthorizations = state.causalAuthorizations.map(
    validateEvidenceCausalAuthorizationV1,
  );
  if (causalAuthorizations.length > limits.maximumCausalAuthorizations)
    throw new TrustValidationError("causal authorization capacity exceeded");
  assertCanonicalOrder(
    causalAuthorizations.map((item) => item.authorizationDigest),
    "causal authorizations",
  );
  if (
    new Set(causalAuthorizations.map((item) => item.authorizationId)).size !==
    causalAuthorizations.length
  )
    throw new TrustValidationError("causal authorization IDs must be unique");
  if (
    !Array.isArray(state.records) ||
    !Array.isArray(state.contentResolutions) ||
    !Array.isArray(state.contentInvalidations) ||
    !Array.isArray(state.pendingRecords) ||
    !Array.isArray(state.diagnostics)
  )
    throw new TrustValidationError("lifecycle state arrays are invalid");
  const records = state.records.map(validateEvidenceRecordStateV1);
  assertCanonicalOrder(
    records.map((item) => item.recordDigest),
    "records",
  );
  if (new Set(records.map((item) => item.recordId)).size !== records.length)
    throw new TrustValidationError("record IDs must be unique");
  if (records.some((item) => item.acceptedAtLogicalMs > logicalTimeHighWaterMs))
    throw new TrustValidationError(
      "record acceptance exceeds state high-water",
    );
  for (const authorization of causalAuthorizations) {
    if (authorization.authorizedAtLogicalMs > logicalTimeHighWaterMs)
      throw new TrustValidationError(
        "causal authorization exceeds state high-water",
      );
    const record = records.find(
      (item) =>
        item.recordId === authorization.recordId &&
        item.recordDigest === authorization.recordDigest &&
        item.recordKind === authorization.recordKind,
    );
    const binding = bindingByDigest.get(authorization.authorityBindingDigest);
    const policy = policyByDigest.get(authorization.policyDigest);
    const references =
      record && "basisReferences" in record.record
        ? record.record.basisReferences
        : [];
    const referenceKey = (item: {
      kind: string;
      referenceType: string;
      referenceId: string;
      referenceDigest: string;
    }) =>
      `${item.kind}\u0000${item.referenceType}\u0000${item.referenceId}\u0000${item.referenceDigest}`;
    const target =
      authorization.recordKind === "challenge"
        ? records.find(
            (item) =>
              item.recordId === authorization.targetRecordId &&
              item.recordDigest === authorization.targetRecordDigest,
          )
        : null;
    const claim =
      record?.recordKind === "claim"
        ? record
        : target?.recordKind === "claim"
          ? target
          : target?.recordKind === "attestation"
            ? records.find(
                (item) =>
                  item.recordId ===
                    (target.record as { claimId: string }).claimId &&
                  item.recordDigest ===
                    (target.record as { claimDigest: string }).claimDigest,
              )
            : null;
    const criterion =
      claim?.recordKind === "claim" && policy
        ? policy.criteria.find(
            (item) =>
              item.criterionId ===
              (claim.record as { criterionId: string }).criterionId,
          )
        : undefined;
    const allowed =
      authorization.recordKind === "claim"
        ? criterion?.claimAuthority.allowedSourceRelations
        : criterion?.challengeAuthority.allowedSourceRelations;
    const basisRules =
      authorization.recordKind === "claim"
        ? criterion?.claimAuthority.allowedBasisReferences
        : criterion?.challengeAuthority.allowedBasisReferences;
    const counts = new Map<string, number>();
    for (const reference of references)
      counts.set(
        `${reference.kind}\u0000${reference.referenceType}`,
        (counts.get(`${reference.kind}\u0000${reference.referenceType}`) ?? 0) +
          1,
      );
    const basesAllowed =
      basisRules !== undefined &&
      basisRules.every((rule) => {
        const count =
          counts.get(`${rule.kind}\u0000${rule.referenceType}`) ?? 0;
        return count >= rule.minimumCount && count <= rule.maximumCount;
      }) &&
      [...counts.keys()].every((key) =>
        basisRules.some(
          (rule) => `${rule.kind}\u0000${rule.referenceType}` === key,
        ),
      );
    const resolvedEvidenceBasesValid = authorization.bases.every((basis) => {
      if (basis.kind !== "evidence") return true;
      const referenced = records.find(
        (item) =>
          item.recordId === basis.referenceId &&
          item.recordDigest === basis.referenceDigest,
      );
      return (
        referenced !== undefined &&
        referenced.recordKind === basis.referenceType &&
        digestScopeV1(referenced.record.scope) === authorization.scopeDigest &&
        basis.resolvedDigest === referenced.recordDigest &&
        basis.trustedEffectiveAtLogicalMs === referenced.effectiveAtLogicalMs
      );
    });
    const visibleHead = binding
      ? dependencyBindings
          .filter(
            (item) =>
              item.bindingKind === binding.bindingKind &&
              item.bindingName === binding.bindingName &&
              item.registeredAtLogicalMs <= authorization.authorizedAtLogicalMs,
          )
          .sort((left, right) => right.bindingVersion - left.bindingVersion)[0]
      : null;
    if (
      !record ||
      !binding ||
      !policy ||
      binding.bindingKind !== "causal_authority" ||
      binding.policyDigest !== authorization.policyDigest ||
      binding.registeredAtLogicalMs > authorization.authorizedAtLogicalMs ||
      binding.validFromLogicalMs > authorization.authorizedAtLogicalMs ||
      (binding.validUntilLogicalMs !== null &&
        authorization.authorizedAtLogicalMs >= binding.validUntilLogicalMs) ||
      visibleHead?.bindingDigest !== binding.bindingDigest ||
      authorization.authorizedAtLogicalMs < record.acceptedAtLogicalMs ||
      !claim ||
      claim.recordKind !== "claim" ||
      authorization.criterionId !==
        (claim.record as { criterionId: string }).criterionId ||
      authorization.subjectDigest !==
        digestSubjectV1(
          (claim.record as { subject: Parameters<typeof digestSubjectV1>[0] })
            .subject,
        ) ||
      authorization.scopeDigest !== digestScopeV1(record.record.scope) ||
      (authorization.recordKind === "claim"
        ? authorization.targetRecordId !== null ||
          authorization.targetRecordDigest !== null
        : !target ||
          authorization.targetRecordId !== target.recordId ||
          authorization.targetRecordDigest !== target.recordDigest) ||
      !allowed?.includes(authorization.sourceRelation) ||
      !basesAllowed ||
      !resolvedEvidenceBasesValid ||
      references.length !== authorization.bases.length ||
      references.some(
        (reference, index) =>
          referenceKey(reference) !== referenceKey(authorization.bases[index]),
      )
    )
      throw new TrustValidationError("causal authorization binding is invalid");
  }
  if (!Array.isArray(state.profiles) || !Array.isArray(state.profileHeads))
    throw new TrustValidationError("profile state arrays are invalid");
  const profiles = state.profiles.map(validateTrustProfileV1);
  const profileHistories = new Map<string, typeof profiles>();
  const profileIds = new Set<string>();
  for (const profile of profiles) {
    if (
      profile.updatedAtLogicalMs > logicalTimeHighWaterMs ||
      profileIds.has(profile.profileId)
    )
      throw new TrustValidationError("profile history is invalid");
    profileIds.add(profile.profileId);
    const profileKey = digestTrustProfileKeyV1({
      tenantId: profile.tenantId,
      scopeDigest: profile.scopeDigest,
      subjectDigest: profile.subjectDigest,
      policyDigest: profile.policyDigest,
    });
    const history = profileHistories.get(profileKey) ?? [];
    history.push(profile);
    profileHistories.set(profileKey, history);
  }
  if (profileHistories.size > limits.maximumProfileHeads)
    throw new TrustValidationError("profile head capacity exceeded");
  assertCanonicalOrder(
    profiles.map((profile) => {
      const profileKey = digestTrustProfileKeyV1({
        tenantId: profile.tenantId,
        scopeDigest: profile.scopeDigest,
        subjectDigest: profile.subjectDigest,
        policyDigest: profile.policyDigest,
      });
      return `${profileKey}\u0000${String(profile.revision).padStart(16, "0")}\u0000${profile.profileDigest}`;
    }),
    "profiles",
  );
  const expectedProfileHeads: EvidenceTrustStateV1["profileHeads"][number][] =
    [];
  for (const [profileKey, history] of profileHistories) {
    if (history.length > limits.maximumProfileRevisionsPerHead)
      throw new TrustValidationError("profile revision capacity exceeded");
    history.sort((left, right) => left.revision - right.revision);
    for (let index = 0; index < history.length; index += 1) {
      const profile = history[index];
      const previous = history[index - 1] ?? null;
      if (
        profile.revision !== index + 1 ||
        profile.previousProfileId !== (previous?.profileId ?? null) ||
        profile.previousProfileDigest !== (previous?.profileDigest ?? null)
      )
        throw new TrustValidationError("profile lineage is invalid");
      const decision = fusionDecisions.find(
        (item) =>
          item.fusionDecisionId === profile.fusionDecisionId &&
          item.fusionDecisionDigest === profile.fusionDecisionDigest,
      );
      const policy = policyByDigest.get(profile.policyDigest);
      if (!decision || !policy)
        throw new TrustValidationError(
          "profile Fusion decision or policy is unavailable",
        );
      const recomputed = createTrustProfileV1({
        fusionDecision: decision,
        policy,
        revision: profile.revision,
        previousProfileId: previous?.profileId ?? null,
        previousProfileDigest: previous?.profileDigest ?? null,
        updatedAtLogicalMs: profile.updatedAtLogicalMs,
      });
      if (recomputed.profileDigest !== profile.profileDigest)
        throw new TrustValidationError("profile does not rederive from Fusion");
    }
    expectedProfileHeads.push(trustProfileHeadV1(history[history.length - 1]));
    if (expectedProfileHeads.at(-1)?.profileKey !== profileKey)
      throw new TrustValidationError("profile key is inconsistent");
  }
  const profileHeads = state.profileHeads.map(validateTrustProfileHeadV1);
  assertCanonicalOrder(
    profileHeads.map((head) => head.profileKey),
    "profile heads",
  );
  expectedProfileHeads.sort((left, right) =>
    compareUnicode(left.profileKey, right.profileKey),
  );
  if (
    profileHeads.length !== expectedProfileHeads.length ||
    profileHeads.some(
      (head, index) =>
        head.profileKey !== expectedProfileHeads[index].profileKey ||
        head.profileId !== expectedProfileHeads[index].profileId ||
        head.profileDigest !== expectedProfileHeads[index].profileDigest ||
        head.revision !== expectedProfileHeads[index].revision,
    )
  )
    throw new TrustValidationError(
      "profile heads do not match profile history",
    );
  if (
    !Array.isArray(state.quarantines) ||
    !Array.isArray(state.quarantineHeads) ||
    !Array.isArray(state.recoveryDecisions)
  )
    throw new TrustValidationError("quarantine state arrays are invalid");
  const recoveryDecisions = state.recoveryDecisions.map(
    validateQuarantineRecoveryDecisionV1,
  );
  if (
    recoveryDecisions.length > limits.maximumRecoveryDecisions ||
    recoveryDecisions.some(
      (decision) => decision.evaluatedAtLogicalMs > logicalTimeHighWaterMs,
    )
  )
    throw new TrustValidationError("recovery decision state is invalid");
  assertCanonicalOrder(
    recoveryDecisions.map((decision) => decision.recoveryDecisionDigest),
    "recovery decisions",
  );
  if (
    new Set(recoveryDecisions.map((decision) => decision.recoveryDecisionId))
      .size !== recoveryDecisions.length
  )
    throw new TrustValidationError("recovery decision IDs must be unique");
  const quarantines = state.quarantines.map(validateQuarantineRecordV1);
  const quarantineIds = new Set<string>();
  const quarantineHistories = new Map<string, typeof quarantines>();
  for (const quarantine of quarantines) {
    if (
      quarantineIds.has(quarantine.quarantineId) ||
      quarantine.activatedAtLogicalMs > logicalTimeHighWaterMs ||
      (quarantine.recoveredAtLogicalMs !== null &&
        quarantine.recoveredAtLogicalMs > logicalTimeHighWaterMs)
    )
      throw new TrustValidationError("quarantine history is invalid");
    quarantineIds.add(quarantine.quarantineId);
    const history = quarantineHistories.get(quarantine.quarantineKey) ?? [];
    history.push(quarantine);
    quarantineHistories.set(quarantine.quarantineKey, history);
  }
  if (quarantineHistories.size > limits.maximumQuarantineHeads)
    throw new TrustValidationError("quarantine head capacity exceeded");
  assertCanonicalOrder(
    quarantines.map(
      (quarantine) =>
        `${quarantine.quarantineKey}\u0000${String(quarantine.revision).padStart(16, "0")}\u0000${quarantine.quarantineId}`,
    ),
    "quarantines",
  );
  const expectedQuarantineHeads: EvidenceTrustStateV1["quarantineHeads"][number][] =
    [];
  for (const [quarantineKey, history] of quarantineHistories) {
    if (history.length > limits.maximumQuarantineRevisionsPerHead)
      throw new TrustValidationError("quarantine revision capacity exceeded");
    history.sort((left, right) => left.revision - right.revision);
    for (let index = 0; index < history.length; index += 1) {
      const quarantine = history[index];
      const previous = history[index - 1] ?? null;
      if (
        quarantine.revision !== index + 1 ||
        quarantine.previousRecordId !== (previous?.quarantineId ?? null)
      )
        throw new TrustValidationError("quarantine lineage is invalid");
      if (quarantine.status === "active") {
        if (previous !== null && previous.status !== "recovered")
          throw new TrustValidationError(
            "quarantine activation transition is invalid",
          );
        const decision = fusionDecisions.find(
          (candidate) =>
            candidate.fusionDecisionId === quarantine.fusionDecisionId,
        );
        const profile = decision
          ? profiles.find(
              (candidate) =>
                candidate.fusionDecisionId === decision.fusionDecisionId &&
                candidate.fusionDecisionDigest ===
                  decision.fusionDecisionDigest,
            )
          : null;
        const policy = policyByDigest.get(quarantine.policyDigest);
        if (!decision || !profile || !policy)
          throw new TrustValidationError(
            "quarantine activation inputs are unavailable",
          );
        const projection = deriveQuarantineActivationsV1(
          value as unknown as EvidenceTrustStateV1,
          profile,
          decision,
          policy,
          previous?.recoveredAtLogicalMs ?? null,
        ).find((candidate) => candidate.dimensionId === quarantine.dimensionId);
        if (!projection)
          throw new TrustValidationError(
            "quarantine activation does not rederive",
          );
        const expected = createActiveQuarantineRecordV1({
          revision: quarantine.revision,
          previousRecordId: previous?.quarantineId ?? null,
          tenantId: decision.tenantId,
          subjectDigest: decision.subjectDigest,
          scopeDigest: decision.scopeDigest,
          dimensionId: projection.dimensionId,
          policyDigest: decision.policyDigest,
          fusionDecisionId: decision.fusionDecisionId,
          activationEvidence: projection.activationEvidence,
          activationDependencyGroupIds: projection.activationDependencyGroupIds,
          activatedAtLogicalMs: decision.evaluatedAtLogicalMs,
          reviewIntervalMs: projection.reviewIntervalMs,
        });
        if (expected.quarantineId !== quarantine.quarantineId)
          throw new TrustValidationError(
            "quarantine activation record does not rederive",
          );
      } else if (quarantine.status === "review_required") {
        if (!previous || previous.status !== "active")
          throw new TrustValidationError(
            "quarantine review transition is invalid",
          );
        const expected = createReviewRequiredQuarantineRecordV1(
          previous,
          previous.reviewAfterLogicalMs,
        );
        if (expected.quarantineId !== quarantine.quarantineId)
          throw new TrustValidationError(
            "quarantine review record does not rederive",
          );
      } else {
        if (!previous || previous.status !== "review_required")
          throw new TrustValidationError(
            "quarantine recovery transition is invalid",
          );
        const recovery = recoveryDecisions.find(
          (candidate) =>
            candidate.recoveryDecisionId === quarantine.recoveryDecisionId,
        );
        if (!recovery)
          throw new TrustValidationError(
            "quarantine recovery decision is unavailable",
          );
        const expected = createRecoveredQuarantineRecordV1(previous, recovery);
        if (expected.quarantineId !== quarantine.quarantineId)
          throw new TrustValidationError(
            "quarantine recovery record does not rederive",
          );
      }
    }
    const head = quarantineHeadV1(history[history.length - 1]);
    if (head.quarantineKey !== quarantineKey)
      throw new TrustValidationError("quarantine key is inconsistent");
    expectedQuarantineHeads.push(head);
  }
  expectedQuarantineHeads.sort((left, right) =>
    compareUnicode(left.quarantineKey, right.quarantineKey),
  );
  const quarantineHeads = state.quarantineHeads.map(validateQuarantineHeadV1);
  assertCanonicalOrder(
    quarantineHeads.map((head) => head.quarantineKey),
    "quarantine heads",
  );
  if (
    quarantineHeads.length !== expectedQuarantineHeads.length ||
    quarantineHeads.some(
      (head, index) =>
        head.quarantineKey !== expectedQuarantineHeads[index].quarantineKey ||
        head.quarantineId !== expectedQuarantineHeads[index].quarantineId ||
        head.revision !== expectedQuarantineHeads[index].revision ||
        head.status !== expectedQuarantineHeads[index].status,
    )
  )
    throw new TrustValidationError(
      "quarantine heads do not match quarantine history",
    );
  for (const policy of policies) {
    const policyDigest = digestEvidenceFusionPolicyV1(policy);
    const activeCount = quarantineHeads.filter((head) => {
      const record = quarantines.find(
        (candidate) => candidate.quarantineId === head.quarantineId,
      );
      return (
        record?.policyDigest === policyDigest &&
        (head.status === "active" || head.status === "review_required")
      );
    }).length;
    if (activeCount > policy.quarantinePolicy.maximumActiveRecords)
      throw new TrustValidationError("active quarantine capacity exceeded");
  }
  if (
    quarantineHeads.some((head) => {
      const record = quarantines.find(
        (candidate) => candidate.quarantineId === head.quarantineId,
      );
      return (
        head.status === "active" &&
        record !== undefined &&
        record.reviewAfterLogicalMs <= logicalTimeHighWaterMs
      );
    })
  )
    throw new TrustValidationError("quarantine review transition is overdue");
  for (const recovery of recoveryDecisions) {
    const quarantine = quarantines.find(
      (candidate) => candidate.quarantineId === recovery.quarantineId,
    );
    const decision = fusionDecisions.find(
      (candidate) => candidate.fusionDecisionId === recovery.fusionDecisionId,
    );
    const profile = decision
      ? profiles.find(
          (candidate) =>
            candidate.fusionDecisionId === decision.fusionDecisionId &&
            candidate.fusionDecisionDigest === decision.fusionDecisionDigest,
        )
      : null;
    const policy = policyByDigest.get(recovery.policyDigest);
    if (
      !quarantine ||
      quarantine.status !== "review_required" ||
      !decision ||
      !profile ||
      !policy
    )
      throw new TrustValidationError(
        "recovery decision inputs are unavailable",
      );
    const expected = evaluateQuarantineRecoveryV1(
      value as unknown as EvidenceTrustStateV1,
      quarantine,
      profile,
      decision,
      policy,
      recovery.evaluatedAtLogicalMs,
    );
    if (expected.recoveryDecisionDigest !== recovery.recoveryDecisionDigest)
      throw new TrustValidationError("recovery decision does not rederive");
  }
  const counts = { claim: 0, attestation: 0, challenge: 0, retraction: 0 };
  for (const record of records) counts[record.recordKind] += 1;
  if (
    counts.claim > limits.maximumClaims ||
    counts.attestation > limits.maximumAttestations ||
    counts.challenge > limits.maximumChallenges ||
    counts.retraction > limits.maximumRetractions
  )
    throw new TrustValidationError("record family capacity exceeded");
  if (
    records.some(
      (item) =>
        "basisReferences" in item.record &&
        item.record.basisReferences.length >
          limits.maximumBasisReferencesPerRecord,
    )
  )
    throw new TrustValidationError("basis reference capacity exceeded");
  if (
    records.some(
      (item) =>
        item.recordKind === "claim" &&
        "content" in item.record &&
        item.record.content !== null &&
        item.record.content.encodedBytes >
          (item.record.content.kind === "reference"
            ? limits.maximumContentReferenceBytes
            : limits.maximumInlineSummaryBytes),
    )
  )
    throw new TrustValidationError("evidence content size limit exceeded");
  const challengeCounts = new Map<string, { total: number; pending: number }>();
  for (const record of records) {
    if (record.recordKind !== "challenge") continue;
    const key = `${record.record.sourceKind}\u0000${record.record.sourceId}\u0000${digestScopeV1(record.record.scope)}`;
    const count = challengeCounts.get(key) ?? { total: 0, pending: 0 };
    count.total += 1;
    if (record.status === "pending") count.pending += 1;
    challengeCounts.set(key, count);
  }
  if (
    [...challengeCounts.values()].some(
      (count) =>
        count.total > limits.maximumChallengesPerSourceScope ||
        count.pending > limits.maximumPendingChallengesPerSourceScope,
    )
  )
    throw new TrustValidationError("challenge source scope capacity exceeded");
  const resolutions = state.contentResolutions.map(
    validateEvidenceContentResolutionV1,
  );
  assertCanonicalOrder(
    resolutions.map((item) => item.resolutionDigest),
    "content resolutions",
  );
  if (
    new Set(resolutions.map((item) => item.resolutionId)).size !==
    resolutions.length
  )
    throw new TrustValidationError("content resolution IDs must be unique");
  if (
    resolutions.length > limits.maximumContentResolutions ||
    resolutions.some(
      (item) => item.resolvedAtLogicalMs > logicalTimeHighWaterMs,
    )
  )
    throw new TrustValidationError("content resolution state is invalid");
  for (const resolution of resolutions) {
    const claim = records.find(
      (item) =>
        item.recordKind === "claim" &&
        item.recordId === resolution.claimId &&
        item.recordDigest === resolution.claimDigest,
    );
    const content =
      claim && "content" in claim.record ? claim.record.content : null;
    if (
      !claim ||
      digestScopeV1(claim.record.scope) !== resolution.scopeDigest ||
      !content ||
      content.kind !== "reference" ||
      content.reference.referenceId !== resolution.referenceId ||
      content.reference.referenceDigest !== resolution.referenceDigest ||
      content.contentDigest !== resolution.contentDigest ||
      content.mediaType !== resolution.mediaType ||
      content.encodedBytes !== resolution.encodedBytes
    )
      throw new TrustValidationError(
        "content resolution does not bind claim content",
      );
  }
  const invalidations = state.contentInvalidations.map(
    validateEvidenceContentResolutionInvalidationV1,
  );
  assertCanonicalOrder(
    invalidations.map((item) => item.invalidationId),
    "content invalidations",
  );
  if (
    new Set(invalidations.map((item) => item.invalidationId)).size !==
    invalidations.length
  )
    throw new TrustValidationError("content invalidation IDs must be unique");
  if (
    invalidations.length > limits.maximumContentInvalidations ||
    invalidations.some(
      (item) => item.invalidatedAtLogicalMs > logicalTimeHighWaterMs,
    )
  )
    throw new TrustValidationError("content invalidation state is invalid");
  if (
    invalidations.some(
      (item) =>
        !resolutions.some(
          (resolution) =>
            resolution.resolutionId === item.resolutionId &&
            resolution.resolutionDigest === item.resolutionDigest &&
            resolution.resolverBindingDigest === item.resolverBindingDigest &&
            item.invalidatedAtLogicalMs >= resolution.resolvedAtLogicalMs,
        ),
    )
  )
    throw new TrustValidationError(
      "content invalidation does not bind a resolution",
    );
  const pendingRecords = state.pendingRecords.map((item) => {
    assertIdentifier(item, "pendingRecord");
    return item as string;
  });
  assertCanonicalOrder(pendingRecords, "pending records");
  const expectedPending = records
    .filter((item) => item.status === "pending")
    .map((item) => item.recordId)
    .sort(compareUnicode);
  if (
    pendingRecords.length !== expectedPending.length ||
    pendingRecords.some((item, index) => item !== expectedPending[index])
  )
    throw new TrustValidationError("pending index does not match records");
  if (pendingRecords.length > limits.maximumPendingRecords)
    throw new TrustValidationError("pending record capacity exceeded");
  const diagnostics = state.diagnostics.map((item) => {
    assertExactKeys(
      item,
      ["schemaVersion", "recordId", "recordDigest", "reasonCode"],
      "diagnostic",
    );
    const value = item as Record<string, unknown>;
    if (value.schemaVersion !== 1)
      throw new TrustValidationError("diagnostic schema is invalid");
    assertIdentifier(value.recordId, "diagnostic.recordId");
    assertTrustDigest(value.recordDigest, "diagnostic.recordDigest");
    validateReasonCodeV1(value.reasonCode);
    return value as unknown as EvidenceTrustStateV1["diagnostics"][number];
  });
  assertCanonicalOrder(
    diagnostics.map((item) => item.recordDigest),
    "diagnostics",
  );
  if (diagnostics.length > limits.maximumDiagnostics)
    throw new TrustValidationError("diagnostic capacity exceeded");
  if (
    diagnostics.some(
      (diagnostic) =>
        !records.some(
          (record) =>
            record.recordId === diagnostic.recordId &&
            record.recordDigest === diagnostic.recordDigest,
        ),
    )
  )
    throw new TrustValidationError("diagnostic does not bind a record");
  const cloned = structuredClone({
    ...state,
    limits,
    policies,
    policyHeads,
    dependencyBindings,
    dependencyBindingHeads,
    causalAuthorizations,
    records,
    contentResolutions: resolutions,
    contentInvalidations: invalidations,
    pendingRecords,
    diagnostics,
    fusionDecisions,
    profiles,
    profileHeads,
    quarantines,
    quarantineHeads,
    recoveryDecisions,
  }) as unknown as EvidenceTrustStateV1;
  for (const decision of fusionDecisions) {
    const decisionProfileKey = digestTrustProfileKeyV1({
      tenantId: decision.tenantId,
      scopeDigest: decision.scopeDigest,
      subjectDigest: decision.subjectDigest,
      policyDigest: decision.policyDigest,
    });
    const priorProfile =
      decision.previousProfileDigest === null
        ? null
        : (profiles.find(
            (profile) =>
              profile.profileDigest === decision.previousProfileDigest &&
              digestTrustProfileKeyV1({
                tenantId: profile.tenantId,
                scopeDigest: profile.scopeDigest,
                subjectDigest: profile.subjectDigest,
                policyDigest: profile.policyDigest,
              }) === decisionProfileKey &&
              profile.updatedAtLogicalMs <= decision.evaluatedAtLogicalMs,
          ) ?? null);
    if (decision.previousProfileDigest !== null && priorProfile === null)
      throw new TrustValidationError(
        "fusion decision previous profile is unavailable",
      );
    const historicalResolutions = resolutions.filter(
      (item) => item.resolvedAtLogicalMs <= decision.evaluatedAtLogicalMs,
    );
    const historicalInvalidations = invalidations.filter(
      (item) => item.invalidatedAtLogicalMs <= decision.evaluatedAtLogicalMs,
    );
    const historicalProjection = projectEvidenceLifecycleV1({
      records: records.filter(
        (item) => item.acceptedAtLogicalMs <= decision.evaluatedAtLogicalMs,
      ),
      logicalTimeMs: decision.evaluatedAtLogicalMs,
      limits,
      contentResolutions: historicalResolutions,
      contentInvalidations: historicalInvalidations,
    });
    const historicalState = {
      ...cloned,
      logicalTimeHighWaterMs: decision.evaluatedAtLogicalMs,
      policyHeads: [
        ...policyHeads.filter((head) => head.policyId !== decision.policyId),
        {
          policyId: decision.policyId,
          policyVersion: decision.policyVersion,
          policyDigest: decision.policyDigest,
        },
      ].sort((left, right) => compareUnicode(left.policyId, right.policyId)),
      records: historicalProjection.records,
      contentResolutions: historicalResolutions,
      contentInvalidations: historicalInvalidations,
      causalAuthorizations: causalAuthorizations.filter(
        (item) => item.authorizedAtLogicalMs <= decision.evaluatedAtLogicalMs,
      ),
      pendingRecords: historicalProjection.records
        .filter((item) => item.status === "pending")
        .map((item) => item.recordId),
      diagnostics: historicalProjection.diagnostics,
      fusionDecisions: [],
      profileHeads: [
        ...profileHeads.filter(
          (head) => head.profileKey !== decisionProfileKey,
        ),
        ...(priorProfile === null ? [] : [trustProfileHeadV1(priorProfile)]),
      ].sort((left, right) =>
        compareUnicode(left.profileKey, right.profileKey),
      ),
    } as unknown as EvidenceTrustStateV1;
    const dependencyBindingDigests = deriveApplicableBindingDigests(
      historicalState,
      decision.policyDigest,
      decision.evaluatedAtLogicalMs,
    );
    const recomputed = evaluateEvidenceFusionV1(
      historicalState,
      {
        tenantId: decision.tenantId,
        subject: decision.subject,
        scope: decision.scope,
        policyId: decision.policyId,
        policyVersion: decision.policyVersion,
        policyDigest: decision.policyDigest,
        dependencyBindingDigests,
      },
      decision.evaluatedAtLogicalMs,
    );
    if (recomputed.fusionDecisionDigest !== decision.fusionDecisionDigest)
      throw new TrustValidationError(
        "fusion decision does not rederive from state",
      );
  }
  const bytes = canonicalTrustJsonBytesV1(
    { ...cloned, encodedBytes: 0 } as unknown as JsonValue,
    stateCanonicalLimits(limits.maximumStateCanonicalBytes),
  );
  if (bytes.byteLength !== cloned.encodedBytes)
    throw new TrustValidationError("encodedBytes does not match state");
  return deepFreeze(cloned);
}
function snapshotMaterial(
  snapshot: Pick<
    EvidenceTrustSnapshotV1,
    | "stateId"
    | "generation"
    | "previousSnapshotDigest"
    | "createdAtLogicalMs"
    | "snapshotDigest"
    | "stateDigest"
  >,
): Uint8Array {
  return new TextEncoder().encode(
    `agentplat.trust/snapshot-integrity/v1\0${canonicalizeTrustJsonV1({
      stateId: snapshot.stateId,
      generation: snapshot.generation,
      previousSnapshotDigest: snapshot.previousSnapshotDigest,
      createdAtLogicalMs: snapshot.createdAtLogicalMs,
      snapshotDigest: snapshot.snapshotDigest,
      stateDigest: snapshot.stateDigest,
    })}`,
  );
}
export function createEvidenceTrustSnapshotV1(input: {
  readonly state: EvidenceTrustStateV1;
  readonly generation: number;
  readonly previousSnapshotDigest: string | null;
  readonly createdAtLogicalMs: number;
  readonly protector: EvidenceTrustSnapshotProtectorV1;
}): EvidenceTrustSnapshotV1 {
  const state = validateEvidenceTrustStateV1(input.state);
  assertSafeInteger(input.generation, "generation", 1);
  assertSafeInteger(input.createdAtLogicalMs, "createdAtLogicalMs");
  if (input.createdAtLogicalMs < state.logicalTimeHighWaterMs)
    throw new TrustValidationError("snapshot time precedes state high-water");
  if ((input.generation === 1) !== (input.previousSnapshotDigest === null))
    throw new TrustValidationError(
      "snapshot generation and predecessor are incoherent",
    );
  if (input.previousSnapshotDigest !== null)
    assertTrustDigest(input.previousSnapshotDigest, "previousSnapshotDigest");
  assertTrustDigest(input.protector.bindingDigest, "protector.bindingDigest");
  const stateDigest = digestTrustJsonV1(
    "state",
    state as unknown as JsonValue,
    stateCanonicalLimits(state.limits.maximumStateCanonicalBytes),
  );
  const unsigned = {
    schemaVersion: 1 as const,
    stateId: state.stateId,
    generation: input.generation,
    previousSnapshotDigest: input.previousSnapshotDigest,
    createdAtLogicalMs: input.createdAtLogicalMs,
    stateDigest,
    state,
  };
  const snapshotDigest = digestTrustJsonV1(
    "snapshot",
    unsigned as unknown as JsonValue,
    stateCanonicalLimits(state.limits.maximumStateCanonicalBytes),
  );
  const proof = input.protector.protect(
    snapshotMaterial({ ...unsigned, snapshotDigest }),
  );
  return validateEvidenceTrustSnapshotV1({
    ...unsigned,
    snapshotId: `snapshot:${snapshotDigest}`,
    snapshotDigest,
    integrityProof: {
      ...proof,
      protectorBindingDigest: input.protector.bindingDigest,
    },
  });
}
export function validateEvidenceTrustSnapshotV1(
  value: unknown,
): EvidenceTrustSnapshotV1 {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "snapshotId",
      "snapshotDigest",
      "stateId",
      "generation",
      "previousSnapshotDigest",
      "createdAtLogicalMs",
      "stateDigest",
      "state",
      "integrityProof",
    ],
    "snapshot",
  );
  const snapshot = value as Record<string, unknown>;
  if (snapshot.schemaVersion !== 1)
    throw new TrustValidationError("snapshot schema is invalid");
  assertIdentifier(snapshot.stateId, "stateId");
  assertSafeInteger(snapshot.generation, "generation", 1);
  assertSafeInteger(snapshot.createdAtLogicalMs, "createdAtLogicalMs");
  if (
    (snapshot.generation === 1) !==
    (snapshot.previousSnapshotDigest === null)
  )
    throw new TrustValidationError(
      "snapshot generation and predecessor are incoherent",
    );
  if (snapshot.previousSnapshotDigest !== null)
    assertTrustDigest(
      snapshot.previousSnapshotDigest,
      "previousSnapshotDigest",
    );
  assertTrustDigest(snapshot.snapshotDigest, "snapshotDigest");
  assertTrustDigest(snapshot.stateDigest, "stateDigest");
  const state = validateEvidenceTrustStateV1(snapshot.state);
  if ((snapshot.createdAtLogicalMs as number) < state.logicalTimeHighWaterMs)
    throw new TrustValidationError("snapshot time precedes state high-water");
  if (
    state.stateId !== snapshot.stateId ||
    digestTrustJsonV1(
      "state",
      state as unknown as JsonValue,
      stateCanonicalLimits(state.limits.maximumStateCanonicalBytes),
    ) !== snapshot.stateDigest
  )
    throw new TrustValidationError("snapshot state digest is invalid");
  const unsigned = {
    schemaVersion: 1,
    stateId: snapshot.stateId,
    generation: snapshot.generation,
    previousSnapshotDigest: snapshot.previousSnapshotDigest,
    createdAtLogicalMs: snapshot.createdAtLogicalMs,
    stateDigest: snapshot.stateDigest,
    state,
  };
  const expected = digestTrustJsonV1(
    "snapshot",
    unsigned as unknown as JsonValue,
    stateCanonicalLimits(state.limits.maximumStateCanonicalBytes),
  );
  if (
    snapshot.snapshotId !== `snapshot:${expected}` ||
    snapshot.snapshotDigest !== expected
  )
    throw new TrustValidationError("snapshot digest is invalid");
  assertExactKeys(
    snapshot.integrityProof,
    ["protectorBindingDigest", "algorithmId", "keyId", "encoding", "proof"],
    "integrityProof",
  );
  const proof = snapshot.integrityProof as Record<string, unknown>;
  assertTrustDigest(proof.protectorBindingDigest, "protectorBindingDigest");
  for (const key of ["algorithmId", "keyId", "proof"] as const)
    assertIdentifier(proof[key], key);
  if (proof.encoding !== "base64url")
    throw new TrustValidationError("integrity proof encoding is invalid");
  return deepFreeze({
    ...snapshot,
    state,
    integrityProof: proof,
  } as unknown as EvidenceTrustSnapshotV1);
}
export function restoreEvidenceTrustSnapshotV1(
  snapshotValue: unknown,
  anchor: EvidenceTrustRollbackAnchorV1,
  protector: EvidenceTrustSnapshotProtectorV1,
  options: EvidenceTrustRestoreOptionsV1 = {},
): EvidenceTrustStateV1 {
  assertExactKeys(
    options,
    [
      "verifiedMeshAdmissionVerifierRegistry",
      "currentContentResolverBindingDigest",
      "causalAuthorityVerifierRegistry",
    ].filter((key) => key in options),
    "restore options",
  );
  if (
    options.currentContentResolverBindingDigest !== undefined &&
    options.currentContentResolverBindingDigest !== null
  )
    assertTrustDigest(
      options.currentContentResolverBindingDigest,
      "currentContentResolverBindingDigest",
    );
  const causalRegistry = options.causalAuthorityVerifierRegistry;
  if (causalRegistry !== undefined) {
    assertExactKeys(
      causalRegistry,
      ["resolve"],
      "causal authority verifier registry",
    );
    if (typeof causalRegistry.resolve !== "function")
      throw new TrustValidationError(
        "causal authority verifier registry is invalid",
      );
  }
  const snapshot = validateEvidenceTrustSnapshotV1(snapshotValue);
  assertExactKeys(
    anchor,
    [
      "schemaVersion",
      "stateId",
      "requiredGeneration",
      "requiredSnapshotDigest",
      "minimumLogicalHighWaterMs",
      "protectorBindingDigest",
    ],
    "rollback anchor",
  );
  if (anchor.schemaVersion !== 1)
    throw new TrustValidationError("rollback anchor schema is invalid");
  assertIdentifier(anchor.stateId, "anchor stateId");
  assertSafeInteger(anchor.requiredGeneration, "requiredGeneration", 1);
  assertTrustDigest(anchor.requiredSnapshotDigest, "requiredSnapshotDigest");
  assertSafeInteger(
    anchor.minimumLogicalHighWaterMs,
    "minimumLogicalHighWaterMs",
  );
  assertTrustDigest(anchor.protectorBindingDigest, "protectorBindingDigest");
  if (
    snapshot.stateId !== anchor.stateId ||
    snapshot.generation !== anchor.requiredGeneration ||
    snapshot.snapshotDigest !== anchor.requiredSnapshotDigest ||
    snapshot.integrityProof.protectorBindingDigest !==
      anchor.protectorBindingDigest ||
    protector.bindingDigest !== anchor.protectorBindingDigest ||
    snapshot.state.logicalTimeHighWaterMs < anchor.minimumLogicalHighWaterMs
  )
    throw new TrustValidationError("snapshot rollback validation failed");
  if (!protector.verify(snapshotMaterial(snapshot), snapshot.integrityProof))
    throw new TrustValidationError("snapshot integrity validation failed");
  const verifiedRecords = snapshot.state.records.filter(
    (record) => record.origin === "verified_mesh",
  );
  const registry = options.verifiedMeshAdmissionVerifierRegistry;
  if (verifiedRecords.length > 0 && !registry)
    throw new TrustValidationError(
      "verified mesh restore requires admission verifier",
    );
  if (registry) {
    assertExactKeys(registry, ["resolve"], "mesh admission verifier registry");
    if (typeof registry.resolve !== "function")
      throw new TrustValidationError(
        "mesh admission verifier registry is invalid",
      );
    for (const record of verifiedRecords) {
      const verifier = resolveVerifiedMeshAdmissionVerifierV1(
        registry as unknown as NonNullable<
          EvidenceTrustRestoreOptionsV1["verifiedMeshAdmissionVerifierRegistry"]
        >,
        record.originVerifierBindingDigest as string,
      );
      if (
        !verifier ||
        verifier.verifierBindingDigest !== record.originVerifierBindingDigest ||
        verifier.upstreamBindingDigest !== record.originBindingDigest ||
        record.originProofDigest === null ||
        !verifier.verify({
          recordId: record.recordId,
          recordDigest: record.recordDigest,
          originBindingDigest: record.originBindingDigest,
          originVerifierBindingDigest: record.originVerifierBindingDigest,
          originProofDigest: record.originProofDigest,
          effectiveAtLogicalMs: record.effectiveAtLogicalMs,
        })
      )
        throw new TrustValidationError(
          "verified mesh restore validation failed",
        );
    }
  }
  if (snapshot.state.causalAuthorizations.length > 0 && !causalRegistry)
    throw new TrustValidationError(
      "causal authority restore requires verifier registry",
    );
  if (causalRegistry) {
    for (const authorization of snapshot.state.causalAuthorizations) {
      const binding = snapshot.state.dependencyBindings.find(
        (item) => item.bindingDigest === authorization.authorityBindingDigest,
      );
      const verifier = resolveEvidenceCausalAuthorityVerifierV1(
        causalRegistry as unknown as NonNullable<
          EvidenceTrustRestoreOptionsV1["causalAuthorityVerifierRegistry"]
        >,
        authorization.authorityBindingDigest,
      );
      if (
        !binding ||
        !verifier ||
        binding.bindingKind !== "causal_authority" ||
        binding.policyDigest !== authorization.policyDigest ||
        verifier.authorityBindingDigest !==
          authorization.authorityBindingDigest ||
        verifier.policyDigest !== authorization.policyDigest ||
        verifier.upstreamBindingDigest !== binding.upstreamBindingDigest ||
        !verifier.verify(authorization)
      )
        throw new TrustValidationError(
          "causal authority restore validation failed",
        );
    }
  }
  const projected = projectEvidenceLifecycleV1({
    records: snapshot.state.records,
    logicalTimeMs: snapshot.state.logicalTimeHighWaterMs,
    limits: snapshot.state.limits,
    contentResolutions: snapshot.state.contentResolutions,
    contentInvalidations: snapshot.state.contentInvalidations,
    currentContentResolverBindingDigest:
      options.currentContentResolverBindingDigest,
  });
  const expectedPending = projected.records
    .filter((record) => record.status === "pending")
    .map((record) => record.recordId)
    .sort(compareUnicode);
  const expectedDiagnostics = projected.diagnostics.slice(
    0,
    snapshot.state.limits.maximumDiagnostics,
  );
  if (
    projected.records.length !== snapshot.state.records.length ||
    projected.records.some(
      (record, index) =>
        record.recordDigest !== snapshot.state.records[index]?.recordDigest ||
        record.status !== snapshot.state.records[index]?.status ||
        record.effectiveAtLogicalMs !==
          snapshot.state.records[index]?.effectiveAtLogicalMs,
    ) ||
    expectedDiagnostics.length !== snapshot.state.diagnostics.length ||
    expectedDiagnostics.some(
      (diagnostic, index) =>
        diagnostic.recordDigest !==
          snapshot.state.diagnostics[index]?.recordDigest ||
        diagnostic.reasonCode !== snapshot.state.diagnostics[index]?.reasonCode,
    ) ||
    expectedPending.length !== snapshot.state.pendingRecords.length ||
    expectedPending.some(
      (record, index) => record !== snapshot.state.pendingRecords[index],
    )
  )
    throw new TrustValidationError("snapshot lifecycle projection is invalid");
  return snapshot.state;
}
