import type { JsonValue } from "@agentplat/core";
import {
  deepFreeze,
  digestTrustJsonV1,
  TrustValidationError,
} from "./canonical.js";
import {
  digestRootBasisV1,
  digestScopeV1,
  digestSubjectV1,
} from "./evidence.js";
import { digestEvidenceFusionPolicyV1 } from "./policy.js";
import { causalAuthorizationReferenceKeyV1 } from "./causal.js";
import type {
  ChallengeResolutionV1,
  ChallengeResolutionResultV1,
  EvidenceAttestationV1,
  EvidenceClaimClassificationV1,
  EvidenceClaimV1,
  EvidenceCausalAuthorizationV1,
  EvidenceCriterionPolicyV1,
  EvidenceFusionDecisionV1,
  EvidenceFusionEvaluationRequestV1,
  EvidenceGroupAllocationV1,
  EvidenceRecordExclusionV1,
  EvidenceRecordStateV1,
  EvidenceTrustDependencyBindingV1,
  EvidenceTrustStateV1,
  TrustDimensionPolicyV1,
  TrustDimensionStateV1,
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

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = <T>(values: readonly T[], key: (value: T) => string): T[] =>
  [...values].sort((a, b) => compare(key(a), key(b)));
const uniqueSorted = (values: readonly string[], label: string): string[] => {
  const out = [...values].sort(compare);
  if (out.some((value, index) => index && value === out[index - 1]))
    throw new TrustValidationError(`${label} must be sorted and unique`);
  return out;
};
const assertSortedUnique = (
  values: unknown,
  label: string,
): readonly string[] => {
  if (!Array.isArray(values))
    throw new TrustValidationError(`${label} is invalid`);
  for (let index = 0; index < values.length; index += 1) {
    if (
      typeof values[index] !== "string" ||
      (index > 0 &&
        compare(values[index - 1] as string, values[index] as string) >= 0)
    )
      throw new TrustValidationError(`${label} must be sorted and unique`);
  }
  return values;
};
const assertCanonicalItems = <T>(
  values: readonly T[],
  label: string,
  key: (value: T) => string,
): void => {
  for (let index = 1; index < values.length; index += 1)
    if (compare(key(values[index - 1]), key(values[index])) >= 0)
      throw new TrustValidationError(`${label} must be sorted and unique`);
};
const assertBasisPoints = (value: unknown, label: string): number => {
  assertSafeInteger(value, label);
  if ((value as number) < 0 || (value as number) > 10_000)
    throw new TrustValidationError(`${label} is outside basis-point range`);
  return value as number;
};
const add = (a: number, b: number): number => {
  const value = a + b;
  if (!Number.isSafeInteger(value))
    throw new TrustValidationError("fusion arithmetic overflow");
  return value;
};
const product = (a: number, b: number): number => {
  const value = a * b;
  if (!Number.isSafeInteger(value))
    throw new TrustValidationError("fusion arithmetic overflow");
  return value;
};
const clamp = (value: number) => Math.max(0, Math.min(10_000, value));
const kindOf = (
  record: EvidenceRecordStateV1,
): "claim" | "attestation" | "challenge" | "retraction" => record.recordKind;
const target = (
  record: EvidenceRecordStateV1,
): { id: string; digest: string; kind: "claim" | "attestation" } | null => {
  if (record.recordKind === "attestation")
    return {
      id: (record.record as unknown as EvidenceAttestationV1).claimId,
      digest: (record.record as unknown as EvidenceAttestationV1).claimDigest,
      kind: "claim",
    };
  if (record.recordKind === "challenge" || record.recordKind === "retraction")
    return {
      id: (record.record as { targetId: string }).targetId,
      digest: (record.record as { targetDigest: string }).targetDigest,
      kind: (record.record as { targetKind: "claim" | "attestation" })
        .targetKind,
    };
  return null;
};
const sourceKey = (record: EvidenceRecordStateV1) =>
  `${record.record.sourceKind}\u0000${record.record.sourceId}`;
const recordKey = (record: EvidenceRecordStateV1) =>
  `${record.recordId}\u0000${record.recordDigest}`;
const isActive = (record: EvidenceRecordStateV1) => record.status === "active";

type ClaimState = EvidenceRecordStateV1 & {
  readonly recordKind: "claim";
  readonly record: EvidenceClaimV1;
};
const isClaim = (record: EvidenceRecordStateV1): record is ClaimState =>
  record.recordKind === "claim";

type CandidateAttestation = {
  readonly record: EvidenceRecordStateV1;
  readonly groupId: string;
  readonly sourceWeight: number;
  readonly countsForThreshold: boolean;
  readonly disposition: "support" | "contradict" | "inconclusive";
  allocated: number;
};
type CandidateGroupAllocation = {
  readonly groupId: string;
  readonly disposition: CandidateAttestation["disposition"];
  readonly candidates: readonly CandidateAttestation[];
  readonly allocatedByRecordDigest: ReadonlyMap<string, number>;
  readonly capBasisPoints: number;
  readonly allocatedWeightBasisPoints: number;
};
type ClaimWork = {
  readonly claim: ClaimState;
  readonly criterion: EvidenceCriterionPolicyV1;
  readonly sourceGroupId: string | null;
  readonly effectiveRootBasisDigest: string | null;
  readonly candidates: CandidateAttestation[];
  readonly reasons: Set<TrustReasonCodeV1>;
  classification: EvidenceClaimClassificationV1;
};

function exactScope(
  record: EvidenceRecordStateV1,
  scopeDigest: string,
): boolean {
  return digestScopeV1(record.record.scope) === scopeDigest;
}
function selectedBinding(
  state: EvidenceTrustStateV1,
  digest: string,
  policyDigest: string,
  logicalTimeMs: number,
): EvidenceTrustDependencyBindingV1 {
  const binding = state.dependencyBindings.find(
    (item) => item.bindingDigest === digest,
  );
  if (
    !binding ||
    binding.policyDigest !== policyDigest ||
    !deriveApplicableBindingDigests(
      state,
      policyDigest,
      logicalTimeMs,
    ).includes(binding.bindingDigest) ||
    binding.validFromLogicalMs > logicalTimeMs ||
    (binding.validUntilLogicalMs !== null &&
      logicalTimeMs >= binding.validUntilLogicalMs)
  )
    throw new TrustValidationError("fusion dependency binding is unavailable");
  return binding;
}
export function deriveApplicableBindingDigests(
  state: EvidenceTrustStateV1,
  policyDigest: string,
  logicalTimeMs: number,
): readonly string[] {
  const histories = new Map<string, EvidenceTrustDependencyBindingV1[]>();
  for (const binding of state.dependencyBindings) {
    const key = `${binding.bindingKind}\u0000${binding.bindingName}`;
    const history = histories.get(key) ?? [];
    history.push(binding);
    histories.set(key, history);
  }
  const heads: EvidenceTrustDependencyBindingV1[] = [];
  for (const history of histories.values()) {
    const visible = history.filter(
      (binding) => binding.registeredAtLogicalMs <= logicalTimeMs,
    );
    if (!visible.some((binding) => binding.policyDigest === policyDigest))
      continue;
    const head = visible.sort(
      (left, right) => right.bindingVersion - left.bindingVersion,
    )[0];
    if (
      !head ||
      head.policyDigest !== policyDigest ||
      head.validFromLogicalMs > logicalTimeMs ||
      (head.validUntilLogicalMs !== null &&
        logicalTimeMs >= head.validUntilLogicalMs)
    )
      throw new TrustValidationError(
        "fusion dependency binding head is unavailable",
      );
    heads.push(head);
  }
  return uniqueSorted(
    heads.map((binding) => binding.bindingDigest),
    "applicable dependency bindings",
  );
}
function reasonExclusion(
  record: EvidenceRecordStateV1,
  reason: TrustReasonCodeV1,
): EvidenceRecordExclusionV1 {
  return {
    recordKind: kindOf(record),
    recordId: record.recordId,
    recordDigest: record.recordDigest,
    reasonCodes: [reason],
  };
}
function sourceBinding(
  policy: EvidenceTrustStateV1["policies"][number],
  record: EvidenceRecordStateV1,
  role: "claim" | "attest" | "challenge",
  time: number,
) {
  const binding = policy.sourceBindings.find(
    (item) =>
      item.sourceId === record.record.sourceId &&
      item.sourceKind === record.record.sourceKind,
  );
  if (
    !binding ||
    !binding.roles.includes(role) ||
    binding.validFromLogicalMs > time ||
    time >= binding.validUntilLogicalMs
  )
    return null;
  return binding;
}
function contentUsable(
  state: EvidenceTrustStateV1,
  claim: ClaimState,
  resolverDigest: string | null,
  logicalTimeMs: number,
): boolean {
  const content = claim.record.content;
  if (!content || content.kind !== "reference" || !resolverDigest)
    return content === null || content?.kind === "inline_summary";
  const valid = state.contentResolutions.some(
    (resolution) =>
      resolution.result === "verified" &&
      resolution.resolvedAtLogicalMs <= logicalTimeMs &&
      resolution.resolverBindingDigest === resolverDigest &&
      resolution.claimId === claim.recordId &&
      resolution.claimDigest === claim.recordDigest &&
      resolution.scopeDigest === digestScopeV1(claim.record.scope) &&
      resolution.referenceId === content.reference.referenceId &&
      resolution.referenceDigest === content.reference.referenceDigest &&
      resolution.contentDigest === content.contentDigest &&
      resolution.mediaType === content.mediaType &&
      resolution.encodedBytes === content.encodedBytes &&
      !state.contentInvalidations.some(
        (invalidation) =>
          invalidation.invalidatedAtLogicalMs <= logicalTimeMs &&
          invalidation.resolutionId === resolution.resolutionId &&
          invalidation.resolutionDigest === resolution.resolutionDigest &&
          invalidation.resolverBindingDigest === resolverDigest,
      ),
  );
  return valid;
}
function recordReferenceKeys(record: EvidenceRecordStateV1): readonly string[] {
  const references =
    (
      record.record as {
        basisReferences?: readonly {
          kind: "evidence" | "mesh_record" | "control_record" | "external";
          referenceType: string;
          referenceId: string;
          referenceDigest: string;
        }[];
      }
    ).basisReferences ?? [];
  return references.map(causalAuthorizationReferenceKeyV1);
}
function authorizationMatches(
  state: EvidenceTrustStateV1,
  record: EvidenceRecordStateV1,
  policyDigest: string,
  criterionId: string,
  scopeDigest: string,
  subjectDigest: string,
  allowedRelations: readonly string[],
  targetRecord: EvidenceRecordStateV1 | null,
  logicalTimeMs: number,
  applicableBindingDigests: ReadonlySet<string>,
): EvidenceCausalAuthorizationV1 | null {
  const recordReferences = recordReferenceKeys(record);
  return (
    sorted(
      state.causalAuthorizations.filter(
        (authorization) =>
          authorization.authorizedAtLogicalMs <= logicalTimeMs &&
          applicableBindingDigests.has(authorization.authorityBindingDigest) &&
          authorization.recordId === record.recordId &&
          authorization.recordDigest === record.recordDigest &&
          authorization.recordKind === record.recordKind &&
          authorization.policyDigest === policyDigest &&
          authorization.criterionId === criterionId &&
          authorization.scopeDigest === scopeDigest &&
          authorization.subjectDigest === subjectDigest &&
          allowedRelations.includes(authorization.sourceRelation) &&
          authorization.targetRecordId === (targetRecord?.recordId ?? null) &&
          authorization.targetRecordDigest ===
            (targetRecord?.recordDigest ?? null) &&
          authorization.bases.length === recordReferences.length &&
          authorization.bases.every(
            (basis, index) =>
              basis.trustedEffectiveAtLogicalMs <=
                authorization.authorizedAtLogicalMs &&
              causalAuthorizationReferenceKeyV1(basis) ===
                recordReferences[index] &&
              (basis.kind !== "evidence" ||
                state.records.some(
                  (item) =>
                    item.recordId === basis.referenceId &&
                    item.recordDigest === basis.referenceDigest &&
                    item.recordKind === basis.referenceType &&
                    digestScopeV1(item.record.scope) === scopeDigest &&
                    basis.resolvedDigest === item.recordDigest &&
                    basis.trustedEffectiveAtLogicalMs ===
                      item.effectiveAtLogicalMs,
                )),
          ),
      ),
      (authorization) => authorization.authorizationDigest,
    )[0] ?? null
  );
}
function effectiveRootBasisDigest(
  state: EvidenceTrustStateV1,
  record: EvidenceRecordStateV1,
  policyDigest: string,
  logicalTimeMs: number,
  recordByKey: ReadonlyMap<string, EvidenceRecordStateV1>,
  applicableBindingDigests: ReadonlySet<string>,
): string | null {
  const visit = (
    candidate: EvidenceRecordStateV1,
    seen: ReadonlySet<string>,
  ): readonly EvidenceCausalAuthorizationV1["bases"][number][] | null => {
    const key = recordKey(candidate);
    if (seen.has(key)) return null;
    const authorization = sorted(
      state.causalAuthorizations.filter(
        (item) =>
          item.authorizedAtLogicalMs <= logicalTimeMs &&
          applicableBindingDigests.has(item.authorityBindingDigest) &&
          item.policyDigest === policyDigest &&
          item.recordId === candidate.recordId &&
          item.recordDigest === candidate.recordDigest &&
          item.bases.length === recordReferenceKeys(candidate).length &&
          item.bases.every(
            (basis, index) =>
              basis.trustedEffectiveAtLogicalMs <= item.authorizedAtLogicalMs &&
              causalAuthorizationReferenceKeyV1(basis) ===
                recordReferenceKeys(candidate)[index],
          ),
      ),
      (item) => item.authorizationDigest,
    )[0];
    if (!authorization) return null;
    const terminal = authorization.bases.filter(
      (basis) => basis.kind !== "evidence",
    );
    const nested: EvidenceCausalAuthorizationV1["bases"][number][] = [
      ...terminal,
    ];
    for (const basis of authorization.bases.filter(
      (item) => item.kind === "evidence",
    )) {
      const referenced = recordByKey.get(
        `${basis.referenceId}\u0000${basis.referenceDigest}`,
      );
      if (
        !referenced ||
        !isActive(referenced) ||
        referenced.recordKind !== basis.referenceType ||
        digestScopeV1(referenced.record.scope) !==
          digestScopeV1(candidate.record.scope) ||
        basis.resolvedDigest !== referenced.recordDigest ||
        basis.trustedEffectiveAtLogicalMs !== referenced.effectiveAtLogicalMs
      )
        return null;
      const roots = visit(referenced, new Set([...seen, key]));
      if (!roots) return null;
      nested.push(...roots);
    }
    return nested;
  };
  const roots = visit(record, new Set());
  if (!roots || roots.length === 0) return null;
  const unique = new Map(
    roots.map((root) => {
      const reference = {
        schemaVersion: 1 as const,
        kind: root.kind,
        referenceType: root.referenceType,
        referenceId: root.referenceId,
        referenceDigest: root.referenceDigest,
      };
      return [causalAuthorizationReferenceKeyV1(reference), reference] as const;
    }),
  );
  return digestRootBasisV1(
    sorted([...unique.values()], causalAuthorizationReferenceKeyV1),
  );
}
function authorizationBasisCutoff(
  record: EvidenceRecordStateV1,
  allowed: Pick<
    EvidenceCriterionPolicyV1["challengeAuthority"],
    "allowedBasisReferences"
  >,
  authorization: EvidenceCausalAuthorizationV1,
): number | null {
  const refs = (record.record as unknown as Record<string, unknown>)
    .basisReferences as readonly {
    kind: string;
    referenceType: string;
    referenceId: string;
    referenceDigest: string;
  }[];
  const counts = new Map<string, number>();
  let cutoff = record.effectiveAtLogicalMs;
  for (const reference of refs) {
    counts.set(
      `${reference.kind}\u0000${reference.referenceType}`,
      (counts.get(`${reference.kind}\u0000${reference.referenceType}`) ?? 0) +
        1,
    );
    const certified = authorization.bases.find(
      (basis) =>
        causalAuthorizationReferenceKeyV1(basis) ===
        causalAuthorizationReferenceKeyV1(
          reference as {
            kind: "evidence" | "mesh_record" | "control_record" | "external";
            referenceType: string;
            referenceId: string;
            referenceDigest: string;
          },
        ),
    );
    if (!certified) return null;
    cutoff = Math.max(cutoff, certified.trustedEffectiveAtLogicalMs);
  }
  for (const rule of allowed.allowedBasisReferences) {
    const count = counts.get(`${rule.kind}\u0000${rule.referenceType}`) ?? 0;
    if (count < rule.minimumCount || count > rule.maximumCount) return null;
  }
  for (const key of counts.keys())
    if (
      !allowed.allowedBasisReferences.some(
        (rule) => `${rule.kind}\u0000${rule.referenceType}` === key,
      )
    )
      return null;
  return cutoff;
}

function validateRequest(value: unknown): EvidenceFusionEvaluationRequestV1 {
  assertExactKeys(
    value,
    [
      "tenantId",
      "subject",
      "scope",
      "policyId",
      "policyVersion",
      "policyDigest",
      "dependencyBindingDigests",
    ],
    "fusion request",
  );
  const request = value as Record<string, unknown>;
  assertIdentifier(request.tenantId, "tenantId");
  const subject = validateTrustSubjectV1(request.subject);
  const scope = validateEvidenceScopeV1(request.scope);
  if (scope.tenantId !== request.tenantId)
    throw new TrustValidationError("fusion tenant does not match scope");
  assertIdentifier(request.policyId, "policyId");
  assertSafeInteger(request.policyVersion, "policyVersion", 1);
  assertTrustDigest(request.policyDigest, "policyDigest");
  if (!Array.isArray(request.dependencyBindingDigests))
    throw new TrustValidationError("dependencyBindingDigests is invalid");
  const dependencyBindingDigests = request.dependencyBindingDigests.map(
    (item) => {
      assertTrustDigest(item, "dependencyBindingDigest");
      return item as string;
    },
  );
  uniqueSorted(dependencyBindingDigests, "dependencyBindingDigests");
  return deepFreeze({
    ...request,
    subject,
    scope,
    dependencyBindingDigests,
  } as unknown as EvidenceFusionEvaluationRequestV1);
}

function decisionBody(
  decision: EvidenceFusionDecisionV1,
): Record<string, unknown> {
  const {
    fusionDecisionId: _id,
    fusionDecisionDigest: _digest,
    ...body
  } = decision;
  return body;
}
export function digestEvidenceFusionDecisionV1(
  decision: EvidenceFusionDecisionV1,
): string {
  return digestTrustJsonV1(
    "fusion-decision",
    decisionBody(decision) as JsonValue,
  );
}
function challengeBody(value: ChallengeResolutionV1): Record<string, unknown> {
  const { challengeResolutionId: _id, ...body } = value;
  return body;
}
function digestChallengeResolution(value: ChallengeResolutionV1): string {
  return digestTrustJsonV1(
    "challenge-resolution",
    challengeBody(value) as JsonValue,
  );
}
function simpleDecisionValidation(value: unknown): EvidenceFusionDecisionV1 {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "fusionDecisionId",
      "fusionDecisionDigest",
      "tenantId",
      "subject",
      "subjectDigest",
      "scope",
      "scopeDigest",
      "policyId",
      "policyVersion",
      "policyDigest",
      "evaluatedAtLogicalMs",
      "inputSetDigest",
      "consideredRecordIds",
      "includedRecordIds",
      "recordExclusions",
      "claimClassifications",
      "challengeResolutions",
      "groupAllocations",
      "dimensions",
      "previousProfileDigest",
      "reasonCodes",
    ],
    "fusion decision",
  );
  const decision = value as unknown as EvidenceFusionDecisionV1;
  if (decision.schemaVersion !== 1)
    throw new TrustValidationError("fusion decision schema is invalid");
  assertIdentifier(decision.tenantId, "tenantId");
  assertIdentifier(decision.policyId, "policyId");
  assertSafeInteger(decision.policyVersion, "policyVersion", 1);
  assertSafeInteger(decision.evaluatedAtLogicalMs, "evaluatedAtLogicalMs");
  validateTrustSubjectV1(decision.subject);
  validateEvidenceScopeV1(decision.scope);
  if (
    decision.scope.tenantId !== decision.tenantId ||
    digestSubjectV1(decision.subject) !== decision.subjectDigest ||
    digestScopeV1(decision.scope) !== decision.scopeDigest
  )
    throw new TrustValidationError(
      "fusion decision subject or scope binding is invalid",
    );
  for (const digest of [
    decision.fusionDecisionDigest,
    decision.policyDigest,
    decision.inputSetDigest,
  ])
    assertTrustDigest(digest, "fusion digest");
  if (decision.previousProfileDigest !== null)
    assertTrustDigest(decision.previousProfileDigest, "previousProfileDigest");
  for (const array of [
    decision.consideredRecordIds,
    decision.includedRecordIds,
    decision.reasonCodes,
  ] as const)
    assertSortedUnique(array, "fusion decision array");
  for (const reason of decision.reasonCodes) validateReasonCodeV1(reason);
  if (
    !Array.isArray(decision.recordExclusions) ||
    !Array.isArray(decision.claimClassifications) ||
    !Array.isArray(decision.challengeResolutions) ||
    !Array.isArray(decision.groupAllocations) ||
    !Array.isArray(decision.dimensions)
  )
    throw new TrustValidationError("fusion decision nested arrays are invalid");
  assertCanonicalItems(
    decision.recordExclusions,
    "fusion exclusions",
    (item) => `${item.recordDigest}\u0000${item.recordId}`,
  );
  assertCanonicalItems(
    decision.claimClassifications,
    "fusion classifications",
    (item) => item.claimDigest,
  );
  assertCanonicalItems(
    decision.challengeResolutions,
    "fusion challenge resolutions",
    (item) => item.challengeResolutionId,
  );
  assertCanonicalItems(
    decision.groupAllocations,
    "fusion group allocations",
    (item) =>
      `${item.stage}\u0000${item.dimensionId ?? ""}\u0000${item.criterionId ?? ""}\u0000${item.claimId ?? ""}\u0000${item.dependencyGroupId}\u0000${item.candidateRecordIds.join("\u0000")}`,
  );
  assertCanonicalItems(
    decision.dimensions,
    "fusion dimensions",
    (item) => item.dimensionId,
  );
  for (const exclusion of decision.recordExclusions) {
    assertExactKeys(
      exclusion,
      ["recordKind", "recordId", "recordDigest", "reasonCodes"],
      "fusion exclusion",
    );
    if (
      !(
        ["claim", "attestation", "challenge", "retraction"] as string[]
      ).includes(exclusion.recordKind as string)
    )
      throw new TrustValidationError("fusion exclusion kind is invalid");
    assertIdentifier(exclusion.recordId, "fusion exclusion recordId");
    assertTrustDigest(exclusion.recordDigest, "fusion exclusion recordDigest");
    for (const reason of assertSortedUnique(
      exclusion.reasonCodes,
      "fusion exclusion reasons",
    ))
      validateReasonCodeV1(reason);
  }
  for (const classification of decision.claimClassifications) {
    assertExactKeys(
      classification,
      [
        "claimId",
        "claimDigest",
        "criterionId",
        "dimensionId",
        "classification",
        "mappedValueBasisPoints",
        "supportGroupIds",
        "supportWeightBasisPoints",
        "contradictionGroupIds",
        "contradictionWeightBasisPoints",
        "rawWeightBasisPoints",
        "retainedWeightBasisPoints",
        "effectiveWeightBasisPoints",
        "claimSourceDependencyGroupId",
        "reasonCodes",
      ],
      "fusion classification",
    );
    assertIdentifier(classification.claimId, "fusion claimId");
    assertTrustDigest(classification.claimDigest, "fusion claimDigest");
    assertIdentifier(classification.criterionId, "fusion criterionId");
    assertIdentifier(classification.dimensionId, "fusion dimensionId");
    if (
      !(
        [
          "supported",
          "contradicted",
          "contested",
          "inconclusive",
          "unavailable",
        ] as string[]
      ).includes(classification.classification as string)
    )
      throw new TrustValidationError("fusion classification kind is invalid");
    if (classification.mappedValueBasisPoints !== null)
      assertBasisPoints(
        classification.mappedValueBasisPoints,
        "fusion mappedValueBasisPoints",
      );
    assertSortedUnique(classification.supportGroupIds, "fusion support groups");
    assertBasisPoints(
      classification.supportWeightBasisPoints,
      "fusion supportWeightBasisPoints",
    );
    assertSortedUnique(
      classification.contradictionGroupIds,
      "fusion contradiction groups",
    );
    assertBasisPoints(
      classification.contradictionWeightBasisPoints,
      "fusion contradictionWeightBasisPoints",
    );
    assertBasisPoints(
      classification.rawWeightBasisPoints,
      "fusion rawWeightBasisPoints",
    );
    assertBasisPoints(
      classification.retainedWeightBasisPoints,
      "fusion retainedWeightBasisPoints",
    );
    assertBasisPoints(
      classification.effectiveWeightBasisPoints,
      "fusion effectiveWeightBasisPoints",
    );
    if (classification.claimSourceDependencyGroupId !== null)
      assertIdentifier(
        classification.claimSourceDependencyGroupId,
        "fusion claimSourceDependencyGroupId",
      );
    for (const reason of assertSortedUnique(
      classification.reasonCodes,
      "fusion classification reasons",
    ))
      validateReasonCodeV1(reason);
  }
  for (const resolution of decision.challengeResolutions) {
    assertExactKeys(
      resolution,
      [
        "schemaVersion",
        "challengeResolutionId",
        "challenges",
        "targetId",
        "targetDigest",
        "challengerDependencyGroupId",
        "basisCutoffLogicalMs",
        "policyDigest",
        "evaluatedAtLogicalMs",
        "result",
        "corroboratingGroupIds",
        "corroboratingWeightBasisPoints",
        "opposingGroupIds",
        "opposingWeightBasisPoints",
        "consideredAttestationIds",
        "reasonCodes",
      ],
      "challenge resolution",
    );
    if (resolution.schemaVersion !== 1)
      throw new TrustValidationError("challenge resolution schema is invalid");
    assertIdentifier(resolution.challengeResolutionId, "challengeResolutionId");
    assertIdentifier(resolution.targetId, "challenge targetId");
    assertTrustDigest(resolution.targetDigest, "challenge targetDigest");
    assertIdentifier(
      resolution.challengerDependencyGroupId,
      "challengerDependencyGroupId",
    );
    assertSafeInteger(
      resolution.basisCutoffLogicalMs,
      "challenge basisCutoffLogicalMs",
    );
    assertTrustDigest(resolution.policyDigest, "challenge policyDigest");
    assertSafeInteger(
      resolution.evaluatedAtLogicalMs,
      "challenge evaluatedAtLogicalMs",
    );
    if (
      !(
        ["unresolved", "dismissed", "sustained", "contested"] as string[]
      ).includes(resolution.result as string)
    )
      throw new TrustValidationError("challenge result is invalid");
    if (!Array.isArray(resolution.challenges))
      throw new TrustValidationError("challenge entries are invalid");
    assertCanonicalItems(
      resolution.challenges,
      "challenge entries",
      (item) => `${item.challengeId}\u0000${item.challengeDigest}`,
    );
    for (const challenge of resolution.challenges) {
      assertExactKeys(
        challenge,
        ["challengeId", "challengeDigest", "basisCutoffLogicalMs"],
        "challenge entry",
      );
      assertIdentifier(challenge.challengeId, "challengeId");
      assertTrustDigest(challenge.challengeDigest, "challengeDigest");
      assertSafeInteger(challenge.basisCutoffLogicalMs, "challenge cutoff");
    }
    assertSortedUnique(
      resolution.corroboratingGroupIds,
      "corroborating groups",
    );
    assertBasisPoints(
      resolution.corroboratingWeightBasisPoints,
      "corroboratingWeightBasisPoints",
    );
    assertSortedUnique(resolution.opposingGroupIds, "opposing groups");
    assertBasisPoints(
      resolution.opposingWeightBasisPoints,
      "opposingWeightBasisPoints",
    );
    assertSortedUnique(
      resolution.consideredAttestationIds,
      "considered attestations",
    );
    for (const reason of assertSortedUnique(
      resolution.reasonCodes,
      "challenge reasons",
    ))
      validateReasonCodeV1(reason);
    if (
      resolution.challengeResolutionId !==
      `challenge-resolution:${digestChallengeResolution(resolution as unknown as ChallengeResolutionV1)}`
    )
      throw new TrustValidationError("challenge resolution digest is invalid");
  }
  for (const allocation of decision.groupAllocations) {
    assertExactKeys(
      allocation,
      [
        "stage",
        "dimensionId",
        "criterionId",
        "claimId",
        "dependencyGroupId",
        "candidateRecordIds",
        "capBasisPoints",
        "allocatedWeightBasisPoints",
      ],
      "fusion allocation",
    );
    if (
      !(
        ["attestation", "challenge_resolution", "profile"] as string[]
      ).includes(allocation.stage as string)
    )
      throw new TrustValidationError("fusion allocation stage is invalid");
    for (const [name, item] of [
      ["dimensionId", allocation.dimensionId],
      ["criterionId", allocation.criterionId],
      ["claimId", allocation.claimId],
    ] as const) {
      if (item !== null) assertIdentifier(item, `fusion allocation ${name}`);
    }
    assertIdentifier(
      allocation.dependencyGroupId,
      "fusion allocation dependencyGroupId",
    );
    assertSortedUnique(
      allocation.candidateRecordIds,
      "fusion allocation candidates",
    );
    assertBasisPoints(allocation.capBasisPoints, "fusion allocation cap");
    assertBasisPoints(
      allocation.allocatedWeightBasisPoints,
      "fusion allocation allocated",
    );
    if (
      (allocation.allocatedWeightBasisPoints as number) >
      (allocation.capBasisPoints as number)
    )
      throw new TrustValidationError("fusion allocation exceeds cap");
  }
  for (const dimension of decision.dimensions) {
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
      "fusion dimension",
    );
    assertIdentifier(dimension.dimensionId, "fusion dimensionId");
    for (const [name, item] of [
      ["scoreBasisPoints", dimension.scoreBasisPoints],
      ["uncertaintyBasisPoints", dimension.uncertaintyBasisPoints],
      ["coverageBasisPoints", dimension.coverageBasisPoints],
      ["ageUncertaintyBasisPoints", dimension.ageUncertaintyBasisPoints],
      [
        "contradictionPressureBasisPoints",
        dimension.contradictionPressureBasisPoints,
      ],
    ] as const)
      assertBasisPoints(item, `fusion dimension ${name}`);
    assertSafeInteger(
      dimension.effectiveWeightBasisPoints,
      "fusion dimension effectiveWeightBasisPoints",
    );
    if (dimension.effectiveWeightBasisPoints < 0)
      throw new TrustValidationError(
        "fusion dimension effectiveWeightBasisPoints is invalid",
      );
    assertSortedUnique(
      dimension.includedClaimIds,
      "fusion dimension included claims",
    );
    assertSortedUnique(
      dimension.excludedClaimIds,
      "fusion dimension excluded claims",
    );
    assertSortedUnique(
      dimension.claimSourceDependencyGroupIds,
      "fusion dimension source groups",
    );
    if (dimension.latestQualifyingEffectiveAtLogicalMs !== null)
      assertSafeInteger(
        dimension.latestQualifyingEffectiveAtLogicalMs,
        "fusion dimension latest effective time",
      );
  }
  if (
    decision.fusionDecisionDigest !==
      digestEvidenceFusionDecisionV1(decision) ||
    decision.fusionDecisionId !==
      `fusion-decision:${decision.fusionDecisionDigest}`
  )
    throw new TrustValidationError("fusion decision digest is invalid");
  return deepFreeze(structuredClone(decision));
}
export const validateEvidenceFusionDecisionV1 = simpleDecisionValidation;

export function evaluateEvidenceFusionV1(
  state: EvidenceTrustStateV1,
  requestValue: EvidenceFusionEvaluationRequestV1,
  logicalTimeMs: number,
): EvidenceFusionDecisionV1 {
  const request = validateRequest(requestValue);
  assertSafeInteger(logicalTimeMs, "logicalTimeMs");
  if (logicalTimeMs < state.logicalTimeHighWaterMs)
    throw new TrustValidationError("logical time rollback");
  const policy = state.policies.find(
    (item) =>
      item.policyId === request.policyId &&
      item.policyVersion === request.policyVersion &&
      digestEvidenceFusionPolicyV1(item) === request.policyDigest,
  );
  if (!policy) throw new TrustValidationError("fusion policy is unavailable");
  const expectedBindingDigests = deriveApplicableBindingDigests(
    state,
    request.policyDigest,
    logicalTimeMs,
  );
  if (
    expectedBindingDigests.length !== request.dependencyBindingDigests.length ||
    expectedBindingDigests.some(
      (digest, index) => digest !== request.dependencyBindingDigests[index],
    )
  )
    throw new TrustValidationError(
      "fusion dependency bindings are not the current exact set",
    );
  const bindings = request.dependencyBindingDigests.map((digest) =>
    selectedBinding(state, digest, request.policyDigest, logicalTimeMs),
  );
  const applicableBindingDigests = new Set(request.dependencyBindingDigests);
  const resolverDigest =
    bindings.find((binding) => binding.bindingKind === "content_resolver")
      ?.bindingDigest ?? null;
  const scopeDigest = digestScopeV1(request.scope);
  const subjectDigest = digestSubjectV1(request.subject);
  const exclusions: EvidenceRecordExclusionV1[] = [];
  const allocations: EvidenceGroupAllocationV1[] = [];
  const allScopeRecords = sorted(
    state.records.filter(
      (record) =>
        record.acceptedAtLogicalMs <= logicalTimeMs &&
        exactScope(record, scopeDigest),
    ),
    (record) => record.recordDigest,
  );
  if (allScopeRecords.length > policy.limits.maximumConsideredRecordsPerFusion)
    throw new TrustValidationError(
      "fusion considered-record capacity exceeded",
    );
  const recordByKey = new Map(
    allScopeRecords.map((record) => [recordKey(record), record]),
  );
  const criteria = new Map(
    policy.criteria.map((criterion) => [criterion.criterionId, criterion]),
  );
  const groups = new Map(
    policy.dependencyGroups.map((group) => [group.dependencyGroupId, group]),
  );
  const works: ClaimWork[] = [];
  for (const claim of allScopeRecords.filter(
    (record): record is ClaimState =>
      isClaim(record) &&
      digestSubjectV1(record.record.subject) === subjectDigest,
  )) {
    const criterion = criteria.get(claim.record.criterionId);
    if (!criterion) {
      exclusions.push(reasonExclusion(claim, "source_not_effective"));
      continue;
    }
    const claimBinding = sourceBinding(policy, claim, "claim", logicalTimeMs);
    const reasons = new Set<TrustReasonCodeV1>();
    if (!["active", "challenged"].includes(claim.status))
      reasons.add("evidence_unavailable");
    if (!claimBinding) reasons.add("source_not_effective");
    const claimAuthorization = authorizationMatches(
      state,
      claim,
      request.policyDigest,
      criterion.criterionId,
      scopeDigest,
      subjectDigest,
      criterion.claimAuthority.allowedSourceRelations,
      null,
      logicalTimeMs,
      applicableBindingDigests,
    );
    if (
      !claimAuthorization ||
      authorizationBasisCutoff(
        claim,
        criterion.claimAuthority,
        claimAuthorization,
      ) === null
    )
      reasons.add("claim_subject_authority_invalid");
    const rootDigest = effectiveRootBasisDigest(
      state,
      claim,
      request.policyDigest,
      logicalTimeMs,
      recordByKey,
      applicableBindingDigests,
    );
    if (!rootDigest) reasons.add("source_not_effective");
    if (logicalTimeMs - claim.effectiveAtLogicalMs > criterion.maximumAgeMs)
      reasons.add("evidence_stale");
    if (
      criterion.contentRequired &&
      !contentUsable(state, claim, resolverDigest, logicalTimeMs)
    )
      reasons.add("content_unavailable");
    const attestations: CandidateAttestation[] = [];
    if (reasons.size === 0 || claim.status === "challenged") {
      for (const attestation of allScopeRecords.filter(
        (record) =>
          record.recordKind === "attestation" &&
          (record.status === "active" || record.status === "challenged"),
      )) {
        const related = target(attestation);
        if (
          !related ||
          related.id !== claim.recordId ||
          related.digest !== claim.recordDigest
        )
          continue;
        const binding = sourceBinding(
          policy,
          attestation,
          "attest",
          logicalTimeMs,
        );
        if (!binding) {
          exclusions.push(reasonExclusion(attestation, "source_not_effective"));
          continue;
        }
        const sameSource = sourceKey(attestation) === sourceKey(claim);
        if (sameSource && !criterion.allowClaimSourceAttestation) {
          exclusions.push(reasonExclusion(attestation, "source_not_effective"));
          continue;
        }
        const confidence = (
          attestation.record as { confidenceBasisPoints: number }
        ).confidenceBasisPoints;
        attestations.push({
          record: attestation,
          groupId: binding.dependencyGroupId,
          sourceWeight: Math.floor(
            product(binding.maximumWeightBasisPoints, confidence) / 10_000,
          ),
          countsForThreshold: !sameSource,
          disposition: (
            attestation.record as {
              disposition: "support" | "contradict" | "inconclusive";
            }
          ).disposition,
          allocated: 0,
        });
      }
    }
    works.push({
      claim,
      criterion,
      sourceGroupId: claimBinding?.dependencyGroupId ?? null,
      effectiveRootBasisDigest: rootDigest,
      candidates: attestations,
      reasons,
      classification: null as unknown as EvidenceClaimClassificationV1,
    });
  }
  const candidateByClaim = new Map(
    works.map((work) => [work.claim.recordDigest, work]),
  );
  const allocateAttestationCandidates = (
    candidates: readonly CandidateAttestation[],
  ): readonly CandidateGroupAllocation[] => {
    const byGroup = new Map<string, CandidateAttestation[]>();
    for (const candidate of candidates)
      (
        byGroup.get(candidate.groupId) ??
        byGroup.set(candidate.groupId, []).get(candidate.groupId)!
      ).push(candidate);
    return sorted([...byGroup.entries()], ([groupId]) => groupId).map(
      ([groupId, groupCandidates]) => {
        const disposition = groupCandidates.some(
          (candidate) =>
            candidate.disposition === "contradict" &&
            candidate.sourceWeight > 0,
        )
          ? "contradict"
          : groupCandidates.some(
                (candidate) =>
                  candidate.disposition === "support" &&
                  candidate.sourceWeight > 0,
              )
            ? "support"
            : "inconclusive";
        const eligible = groupCandidates
          .filter((candidate) => candidate.disposition === disposition)
          .sort(
            (a, b) =>
              b.record.acceptedAtLogicalMs - a.record.acceptedAtLogicalMs ||
              compare(a.record.recordDigest, b.record.recordDigest),
          );
        const cap =
          groups.get(groupId)?.maximumAttestationWeightPerClaimBasisPoints ?? 0;
        let remaining = cap;
        const allocatedByRecordDigest = new Map<string, number>();
        for (const candidate of eligible) {
          const allocated = Math.min(candidate.sourceWeight, remaining);
          allocatedByRecordDigest.set(candidate.record.recordDigest, allocated);
          remaining -= allocated;
        }
        return {
          groupId,
          disposition,
          candidates: eligible,
          allocatedByRecordDigest,
          capBasisPoints: cap,
          allocatedWeightBasisPoints: cap - remaining,
        };
      },
    );
  };
  const resolutions: ChallengeResolutionV1[] = [];
  const diagnosticByRecordDigest = new Map(
    state.diagnostics.map((item) => [item.recordDigest, item.reasonCode]),
  );
  const byTarget = new Map<
    string,
    {
      challenge: EvidenceRecordStateV1;
      groupId: string;
      cutoff: number;
      target: EvidenceRecordStateV1;
      work: ClaimWork;
    }[]
  >();
  for (const challenge of allScopeRecords.filter(
    (record) =>
      record.recordKind === "challenge" &&
      (isActive(record) ||
        (record.status === "unavailable" &&
          diagnosticByRecordDigest.get(record.recordDigest) ===
            "challenge_basis_unavailable")),
  )) {
    const relation = target(challenge);
    if (!relation) continue;
    const targetRecord = recordByKey.get(
      `${relation.id}\u0000${relation.digest}`,
    );
    if (!targetRecord) continue;
    const claim =
      targetRecord.recordKind === "claim"
        ? targetRecord
        : recordByKey.get(
            `${(targetRecord.record as { claimId: string }).claimId}\u0000${(targetRecord.record as { claimDigest: string }).claimDigest}`,
          );
    const work = claim ? candidateByClaim.get(claim.recordDigest) : undefined;
    if (!claim || !work) continue;
    const binding = sourceBinding(
      policy,
      challenge,
      "challenge",
      logicalTimeMs,
    );
    const authorization = authorizationMatches(
      state,
      challenge,
      request.policyDigest,
      work.criterion.criterionId,
      scopeDigest,
      subjectDigest,
      work.criterion.challengeAuthority.allowedSourceRelations,
      targetRecord,
      logicalTimeMs,
      applicableBindingDigests,
    );
    const cutoff = authorization
      ? authorizationBasisCutoff(
          challenge,
          work.criterion.challengeAuthority,
          authorization,
        )
      : null;
    if (!binding || cutoff === null) {
      exclusions.push(
        reasonExclusion(challenge, "challenge_basis_unavailable"),
      );
      continue;
    }
    const key = `${relation.kind}\u0000${relation.id}\u0000${relation.digest}\u0000${binding.dependencyGroupId}`;
    const value = {
      challenge,
      groupId: binding.dependencyGroupId,
      cutoff,
      target: targetRecord,
      work,
    };
    const list = byTarget.get(key) ?? [];
    list.push(value);
    byTarget.set(key, list);
  }
  type ChallengeGroup = {
    readonly key: string;
    readonly entries: readonly {
      challenge: EvidenceRecordStateV1;
      groupId: string;
      cutoff: number;
      target: EvidenceRecordStateV1;
      work: ClaimWork;
    }[];
    readonly targetKind: "claim" | "attestation";
    readonly targetId: string;
    readonly targetDigest: string;
    readonly challengerGroupId: string;
    readonly dependencies: readonly string[];
  };
  const targetGroups = new Map<string, string[]>();
  for (const [key] of byTarget) {
    const targetKey = key.split("\u0000").slice(0, 3).join("\u0000");
    const values = targetGroups.get(targetKey) ?? [];
    values.push(key);
    targetGroups.set(targetKey, values);
  }
  const groupsByKey = new Map<string, ChallengeGroup>();
  for (const [key, entries] of sorted(
    [...byTarget.entries()],
    ([entry]) => entry,
  )) {
    const [targetKind, targetId, targetDigest, challengerGroupId] =
      key.split("\u0000");
    const work = entries[0].work;
    const targetRecord = entries[0].target;
    const targetKey = `${targetKind}\u0000${targetId}\u0000${targetDigest}`;
    const dependencies = new Set<string>();
    for (const entry of entries) {
      const references = (
        entry.challenge.record as {
          basisReferences: readonly {
            kind: string;
            referenceType: string;
            referenceId: string;
            referenceDigest: string;
          }[];
        }
      ).basisReferences;
      for (const reference of references) {
        if (reference.kind !== "evidence") continue;
        if (
          reference.referenceType !== "claim" &&
          reference.referenceType !== "attestation"
        )
          continue;
        for (const dependency of targetGroups.get(
          `${reference.referenceType}\u0000${reference.referenceId}\u0000${reference.referenceDigest}`,
        ) ?? [])
          dependencies.add(dependency);
      }
    }
    const cutoff = Math.min(...entries.map((entry) => entry.cutoff));
    const targetAuthorGroup =
      targetKind === "attestation"
        ? (sourceBinding(policy, targetRecord, "attest", logicalTimeMs)
            ?.dependencyGroupId ?? null)
        : work.sourceGroupId;
    const candidates = work.candidates.filter(
      (candidate) =>
        candidate.record.acceptedAtLogicalMs > cutoff &&
        candidate.groupId !== challengerGroupId &&
        candidate.groupId !== targetAuthorGroup &&
        candidate.countsForThreshold &&
        (targetKind !== "attestation" ||
          candidate.record.recordId !== targetId),
    );
    for (const candidate of candidates)
      for (const dependency of targetGroups.get(
        `attestation\u0000${candidate.record.recordId}\u0000${candidate.record.recordDigest}`,
      ) ?? [])
        dependencies.add(dependency);
    groupsByKey.set(key, {
      key,
      entries,
      targetKind: targetKind as "claim" | "attestation",
      targetId,
      targetDigest,
      challengerGroupId,
      dependencies: uniqueSorted([...dependencies], "challenge dependencies"),
    });
  }
  const settled = new Map<string, ChallengeResolutionV1>();
  const attestationAvailable = (record: EvidenceRecordStateV1): boolean => {
    if (record.status !== "active" && record.status !== "challenged")
      return false;
    const keys =
      targetGroups.get(
        `attestation\u0000${record.recordId}\u0000${record.recordDigest}`,
      ) ?? [];
    if (keys.length === 0) return true;
    return keys.every((key) => settled.get(key)?.result === "dismissed");
  };
  const resolveGroup = (
    group: ChallengeGroup,
    forcedUnresolved = false,
  ): ChallengeResolutionV1 => {
    const entries = group.entries;
    const work = entries[0].work;
    const targetRecord = entries[0].target;
    const cutoff = Math.min(...entries.map((entry) => entry.cutoff));
    const targetAuthorGroup =
      group.targetKind === "attestation"
        ? (sourceBinding(policy, targetRecord, "attest", logicalTimeMs)
            ?.dependencyGroupId ?? null)
        : work.sourceGroupId;
    const candidates = work.candidates.filter(
      (candidate) =>
        candidate.record.acceptedAtLogicalMs > cutoff &&
        candidate.groupId !== group.challengerGroupId &&
        candidate.groupId !== targetAuthorGroup &&
        candidate.countsForThreshold &&
        (group.targetKind !== "attestation" ||
          candidate.record.recordId !== group.targetId) &&
        attestationAvailable(candidate.record),
    );
    const supportForClaim = group.targetKind === "claim";
    const groupsFor = new Map<
      string,
      { support: number; contradict: number; ids: string[] }
    >();
    for (const groupAllocation of allocateAttestationCandidates(candidates)) {
      const entry = { support: 0, contradict: 0, ids: [] as string[] };
      for (const candidate of groupAllocation.candidates) {
        const allocated =
          groupAllocation.allocatedByRecordDigest.get(
            candidate.record.recordDigest,
          ) ?? 0;
        entry.ids.push(candidate.record.recordId);
        if (candidate.disposition === "support")
          entry.support = add(entry.support, allocated);
        if (candidate.disposition === "contradict")
          entry.contradict = add(entry.contradict, allocated);
      }
      groupsFor.set(groupAllocation.groupId, entry);
    }
    const targetDisposition =
      group.targetKind === "attestation"
        ? (
            targetRecord.record as {
              disposition: "support" | "contradict" | "inconclusive";
            }
          ).disposition
        : null;
    const corroborating = [...groupsFor.entries()].filter(([, value]) =>
      supportForClaim
        ? value.support > 0
        : targetDisposition === "support"
          ? value.support > 0
          : targetDisposition === "contradict"
            ? value.contradict > 0
            : false,
    );
    const opposing = [...groupsFor.entries()].filter(([, value]) =>
      supportForClaim
        ? value.contradict > 0
        : targetDisposition === "support"
          ? value.contradict > 0
          : targetDisposition === "contradict"
            ? value.support > 0
            : false,
    );
    const corroboratingWeight = corroborating.reduce(
      (sum, [, value]) =>
        clamp(
          add(
            sum,
            supportForClaim || targetDisposition === "support"
              ? value.support
              : value.contradict,
          ),
        ),
      0,
    );
    const opposingWeight = opposing.reduce(
      (sum, [, value]) =>
        clamp(
          add(
            sum,
            supportForClaim || targetDisposition === "support"
              ? value.contradict
              : value.support,
          ),
        ),
      0,
    );
    const rule = work.criterion.challengeResolution;
    const targetUnavailable =
      !["active", "challenged"].includes(targetRecord.status) ||
      (group.targetKind === "claim"
        ? work.reasons.size > 0
        : !work.candidates.some(
            (candidate) =>
              candidate.record.recordId === targetRecord.recordId &&
              candidate.record.recordDigest === targetRecord.recordDigest,
          ));
    const result: ChallengeResolutionResultV1 = forcedUnresolved
      ? "unresolved"
      : targetUnavailable
        ? "sustained"
        : corroborating.length >= rule.minimumCorroboratingGroups &&
            corroboratingWeight >= rule.minimumCorroboratingWeightBasisPoints &&
            opposing.length >= rule.minimumOpposingGroups &&
            opposingWeight >= rule.minimumOpposingWeightBasisPoints
          ? "contested"
          : opposing.length >= rule.minimumOpposingGroups &&
              opposingWeight >= rule.minimumOpposingWeightBasisPoints
            ? "sustained"
            : corroborating.length >= rule.minimumCorroboratingGroups &&
                corroboratingWeight >=
                  rule.minimumCorroboratingWeightBasisPoints
              ? "dismissed"
              : "unresolved";
    const bare = {
      schemaVersion: 1 as const,
      challenges: sorted(
        entries,
        (entry) =>
          `${entry.challenge.recordId}\u0000${entry.challenge.recordDigest}`,
      ).map((entry) => ({
        challengeId: entry.challenge.recordId,
        challengeDigest: entry.challenge.recordDigest,
        basisCutoffLogicalMs: entry.cutoff,
      })),
      targetId: group.targetId,
      targetDigest: group.targetDigest,
      challengerDependencyGroupId: group.challengerGroupId,
      basisCutoffLogicalMs: cutoff,
      policyDigest: request.policyDigest,
      evaluatedAtLogicalMs: logicalTimeMs,
      result,
      corroboratingGroupIds: uniqueSorted(
        corroborating.map(([id]) => id),
        "corroborating groups",
      ),
      corroboratingWeightBasisPoints: corroboratingWeight,
      opposingGroupIds: uniqueSorted(
        opposing.map(([id]) => id),
        "opposing groups",
      ),
      opposingWeightBasisPoints: opposingWeight,
      consideredAttestationIds: uniqueSorted(
        candidates.map((candidate) => candidate.record.recordId),
        "considered attestations",
      ),
      reasonCodes: (forcedUnresolved
        ? ["challenge_basis_unavailable", "challenge_unresolved"]
        : [
            result === "dismissed"
              ? "challenge_dismissed"
              : result === "sustained"
                ? "challenge_sustained"
                : result === "contested"
                  ? "challenge_contested"
                  : "challenge_unresolved",
          ]) as TrustReasonCodeV1[],
    };
    const challengeResolutionId = `challenge-resolution:${digestChallengeResolution({ ...bare, challengeResolutionId: "" })}`;
    return { ...bare, challengeResolutionId };
  };
  while (true) {
    const ready = sorted(
      [...groupsByKey.values()].filter(
        (group) =>
          !settled.has(group.key) &&
          group.dependencies.every((dependency) => settled.has(dependency)),
      ),
      (group) => group.key,
    );
    if (ready.length === 0) break;
    for (const group of ready)
      settled.set(
        group.key,
        resolveGroup(
          group,
          group.dependencies.some(
            (dependency) => settled.get(dependency)?.result !== "dismissed",
          ),
        ),
      );
  }
  for (const group of sorted(
    [...groupsByKey.values()].filter((group) => !settled.has(group.key)),
    (group) => group.key,
  ))
    settled.set(group.key, resolveGroup(group, true));
  const blockingClaims = new Set<string>();
  const blockingAttestations = new Set<string>();
  for (const group of sorted([...groupsByKey.values()], (group) => group.key)) {
    const resolution = settled.get(group.key)!;
    const work = group.entries[0].work;
    resolutions.push(resolution);
    allocations.push({
      stage: "challenge_resolution",
      dimensionId: work.criterion.dimensionId,
      criterionId: work.criterion.criterionId,
      claimId: work.claim.recordId,
      dependencyGroupId: group.challengerGroupId,
      candidateRecordIds: resolution.consideredAttestationIds,
      capBasisPoints: 10_000,
      allocatedWeightBasisPoints: Math.max(
        resolution.corroboratingWeightBasisPoints,
        resolution.opposingWeightBasisPoints,
      ),
    });
    if (group.targetKind === "claim" && resolution.result !== "dismissed")
      blockingClaims.add(group.targetDigest);
    if (group.targetKind === "attestation" && resolution.result !== "dismissed")
      blockingAttestations.add(group.targetDigest);
  }
  for (const work of works) {
    for (const candidate of work.candidates) candidate.allocated = 0;
    const availableCandidates = work.candidates.filter((candidate) => {
      if (!blockingAttestations.has(candidate.record.recordDigest)) return true;
      exclusions.push(
        reasonExclusion(candidate.record, "challenge_unresolved"),
      );
      return false;
    });
    const groupAllocations = allocateAttestationCandidates(availableCandidates);
    const dispositionByGroup = new Map(
      groupAllocations.map((allocation) => [
        allocation.groupId,
        allocation.disposition,
      ]),
    );
    for (const candidate of availableCandidates) {
      if (
        candidate.sourceWeight > 0 &&
        candidate.disposition !== dispositionByGroup.get(candidate.groupId)
      )
        exclusions.push(
          reasonExclusion(candidate.record, "dependency_group_conflict"),
        );
    }
    for (const allocation of groupAllocations) {
      for (const candidate of allocation.candidates)
        candidate.allocated =
          allocation.allocatedByRecordDigest.get(
            candidate.record.recordDigest,
          ) ?? 0;
      allocations.push({
        stage: "attestation",
        dimensionId: work.criterion.dimensionId,
        criterionId: work.criterion.criterionId,
        claimId: work.claim.recordId,
        dependencyGroupId: allocation.groupId,
        candidateRecordIds: uniqueSorted(
          allocation.candidates.map((candidate) => candidate.record.recordId),
          "attestation candidates",
        ),
        capBasisPoints: allocation.capBasisPoints,
        allocatedWeightBasisPoints: allocation.allocatedWeightBasisPoints,
      });
    }
  }
  const supported: ClaimWork[] = [];
  for (const work of works) {
    const supportGroups = new Set<string>(),
      contradictionGroups = new Set<string>();
    let supportWeight = 0,
      contradictionWeight = 0;
    for (const candidate of work.candidates) {
      if (candidate.allocated === 0) continue;
      if (candidate.disposition === "support") {
        supportWeight = clamp(add(supportWeight, candidate.allocated));
        if (candidate.countsForThreshold) supportGroups.add(candidate.groupId);
      } else if (candidate.disposition === "contradict") {
        contradictionWeight = clamp(
          add(contradictionWeight, candidate.allocated),
        );
        if (candidate.countsForThreshold)
          contradictionGroups.add(candidate.groupId);
      }
    }
    let classification: EvidenceClaimClassificationV1["classification"] =
      "inconclusive";
    if (work.reasons.size || blockingClaims.has(work.claim.recordDigest))
      classification = "unavailable";
    else if (
      supportGroups.size >= work.criterion.minimumSupportGroups &&
      supportWeight >= work.criterion.minimumSupportWeightBasisPoints &&
      contradictionGroups.size >= work.criterion.minimumContradictionGroups &&
      contradictionWeight >=
        work.criterion.minimumContradictionWeightBasisPoints
    )
      classification = "contested";
    else if (
      supportGroups.size >= work.criterion.minimumSupportGroups &&
      supportWeight >= work.criterion.minimumSupportWeightBasisPoints
    )
      classification = "supported";
    else if (
      contradictionGroups.size >= work.criterion.minimumContradictionGroups &&
      contradictionWeight >=
        work.criterion.minimumContradictionWeightBasisPoints
    )
      classification = "contradicted";
    const mappedValue =
      classification === "supported"
        ? work.claim.record.outcome === "satisfied"
          ? work.criterion.satisfiedValueBasisPoints
          : work.claim.record.outcome === "violated"
            ? work.criterion.violatedValueBasisPoints
            : work.criterion.inconclusiveValueBasisPoints
        : null;
    const rawWeight =
      classification === "supported"
        ? Math.min(
            work.criterion.maximumClaimWeightBasisPoints,
            work.criterion.baseWeightBasisPoints,
            supportWeight,
          )
        : 0;
    const dimension = policy.dimensions.find(
      (item) => item.dimensionId === work.criterion.dimensionId,
    )!;
    const intervals = Math.floor(
      (logicalTimeMs - work.claim.effectiveAtLogicalMs) /
        dimension.decayIntervalMs,
    );
    const retention = Math.max(
      dimension.minimumRetainedWeightBasisPoints,
      10_000 - product(intervals, dimension.decayBasisPointsPerInterval),
    );
    const effectiveWeight = rawWeight
      ? Math.floor(product(rawWeight, retention) / 10_000)
      : 0;
    work.classification = {
      claimId: work.claim.recordId,
      claimDigest: work.claim.recordDigest,
      criterionId: work.criterion.criterionId,
      dimensionId: work.criterion.dimensionId,
      classification,
      mappedValueBasisPoints: mappedValue,
      supportGroupIds: uniqueSorted([...supportGroups], "support groups"),
      supportWeightBasisPoints: supportWeight,
      contradictionGroupIds: uniqueSorted(
        [...contradictionGroups],
        "contradiction groups",
      ),
      contradictionWeightBasisPoints: contradictionWeight,
      rawWeightBasisPoints: rawWeight,
      retainedWeightBasisPoints: retention,
      effectiveWeightBasisPoints: effectiveWeight,
      claimSourceDependencyGroupId: work.sourceGroupId,
      reasonCodes: uniqueSorted(
        [
          ...work.reasons,
          ...(classification === "unavailable" &&
          blockingClaims.has(work.claim.recordDigest)
            ? ["challenge_unresolved"]
            : []),
        ],
        "claim reasons",
      ) as TrustReasonCodeV1[],
    };
    if (
      classification === "supported" &&
      mappedValue !== null &&
      effectiveWeight > 0 &&
      work.sourceGroupId !== null
    )
      supported.push(work);
    else
      exclusions.push(
        reasonExclusion(
          work.claim,
          classification === "contested"
            ? "fusion_contested"
            : classification === "unavailable"
              ? "evidence_unavailable"
              : "support_threshold_missing",
        ),
      );
  }
  const retained: ClaimWork[] = [];
  const rootGroups = new Map<string, ClaimWork[]>();
  const rootConflictByDimension = new Map<string, number>();
  for (const work of supported) {
    if (work.effectiveRootBasisDigest === null) {
      exclusions.push(reasonExclusion(work.claim, "source_not_effective"));
      continue;
    }
    const key = `${work.criterion.dimensionId}\u0000${work.effectiveRootBasisDigest}`;
    (rootGroups.get(key) ?? rootGroups.set(key, []).get(key)!).push(work);
  }
  for (const values of rootGroups.values()) {
    if (
      new Set(values.map((work) => work.classification.mappedValueBasisPoints))
        .size !== 1
    ) {
      rootConflictByDimension.set(
        values[0].criterion.dimensionId,
        add(
          rootConflictByDimension.get(values[0].criterion.dimensionId) ?? 0,
          1,
        ),
      );
      for (const work of values)
        exclusions.push(reasonExclusion(work.claim, "root_basis_conflict"));
      continue;
    }
    retained.push(
      [...values].sort(
        (a, b) =>
          b.classification.effectiveWeightBasisPoints -
            a.classification.effectiveWeightBasisPoints ||
          b.claim.effectiveAtLogicalMs - a.claim.effectiveAtLogicalMs ||
          compare(a.claim.recordDigest, b.claim.recordDigest),
      )[0],
    );
  }
  const dimensions: TrustDimensionStateV1[] = [];
  for (const dimension of policy.dimensions) {
    const accepted = retained
      .filter((work) => work.criterion.dimensionId === dimension.dimensionId)
      .sort(
        (a, b) =>
          b.claim.effectiveAtLogicalMs - a.claim.effectiveAtLogicalMs ||
          compare(a.claim.recordDigest, b.claim.recordDigest),
      );
    const capRemaining = new Map<string, number>();
    for (const work of accepted) {
      const group = groups.get(work.sourceGroupId!)!;
      const key = `${work.criterion.criterionId}\u0000${work.sourceGroupId}`;
      const cap = Math.min(
        work.criterion.maximumSourceGroupContributionWeightBasisPoints,
        group.maximumProfileWeightPerDimensionCriterionBasisPoints,
      );
      const remaining = capRemaining.get(key) ?? cap;
      const allocated = Math.min(
        work.classification.effectiveWeightBasisPoints,
        remaining,
      );
      if (allocated < work.classification.effectiveWeightBasisPoints)
        exclusions.push(
          reasonExclusion(work.claim, "dependency_group_cap_exhausted"),
        );
      capRemaining.set(key, remaining - allocated);
      work.classification = {
        ...work.classification,
        effectiveWeightBasisPoints: allocated,
      };
      allocations.push({
        stage: "profile",
        dimensionId: dimension.dimensionId,
        criterionId: work.criterion.criterionId,
        claimId: work.claim.recordId,
        dependencyGroupId: work.sourceGroupId!,
        candidateRecordIds: [work.claim.recordId],
        capBasisPoints: cap,
        allocatedWeightBasisPoints: allocated,
      });
    }
    const effective = accepted.reduce(
      (sum, work) => add(sum, work.classification.effectiveWeightBasisPoints),
      0,
    );
    const qualifying = accepted.filter(
      (work) => work.classification.effectiveWeightBasisPoints > 0,
    );
    const numerator = accepted.reduce(
      (sum, work) =>
        add(
          sum,
          product(
            work.classification.mappedValueBasisPoints!,
            work.classification.effectiveWeightBasisPoints,
          ),
        ),
      product(
        dimension.priorScoreBasisPoints,
        dimension.priorWeightBasisPoints,
      ),
    );
    const denominator = add(dimension.priorWeightBasisPoints, effective);
    if (denominator <= 0)
      throw new TrustValidationError("fusion denominator is invalid");
    const score = Math.floor(numerator / denominator);
    const coverage = Math.min(
      10_000,
      Math.floor(
        product(effective, 10_000) / dimension.coverageTargetBasisPoints,
      ),
    );
    const ageUncertainty = qualifying.length
      ? Math.min(
          10_000,
          Math.max(
            ...qualifying.map((work) =>
              Math.min(
                10_000,
                product(
                  Math.floor(
                    (logicalTimeMs - work.claim.effectiveAtLogicalMs) /
                      dimension.decayIntervalMs,
                  ),
                  dimension.uncertaintyGrowthBasisPointsPerInterval,
                ),
              ),
            ),
          ),
        )
      : 0;
    const contestedCount =
      works.filter(
        (work) =>
          work.criterion.dimensionId === dimension.dimensionId &&
          (work.classification.classification === "contested" ||
            (work.classification.classification === "unavailable" &&
              work.claim.status === "challenged")),
      ).length + (rootConflictByDimension.get(dimension.dimensionId) ?? 0);
    const pressure = Math.min(
      dimension.maximumContradictionUncertaintyBasisPoints,
      product(
        contestedCount,
        dimension.contradictionUncertaintyBasisPointsPerClaim,
      ),
    );
    dimensions.push({
      dimensionId: dimension.dimensionId,
      scoreBasisPoints: clamp(score),
      uncertaintyBasisPoints: Math.max(
        dimension.minimumUncertaintyBasisPoints,
        10_000 - coverage,
        ageUncertainty,
        pressure,
      ),
      effectiveWeightBasisPoints: effective,
      coverageBasisPoints: coverage,
      ageUncertaintyBasisPoints: ageUncertainty,
      contradictionPressureBasisPoints: pressure,
      includedClaimIds: uniqueSorted(
        qualifying.map((work) => work.claim.recordId),
        "included claims",
      ),
      excludedClaimIds: uniqueSorted(
        works
          .filter(
            (work) =>
              work.criterion.dimensionId === dimension.dimensionId &&
              !qualifying.includes(work),
          )
          .map((work) => work.claim.recordId),
        "excluded claims",
      ),
      claimSourceDependencyGroupIds: uniqueSorted(
        qualifying.map((work) => work.sourceGroupId!),
        "claim source groups",
      ),
      latestQualifyingEffectiveAtLogicalMs: qualifying.length
        ? Math.max(...qualifying.map((work) => work.claim.effectiveAtLogicalMs))
        : null,
    });
  }
  const consideredRecordIds = uniqueSorted(
    allScopeRecords.map((record) => record.recordId),
    "considered records",
  );
  const inputSetDigest = digestTrustJsonV1("fusion-input", {
    subjectDigest,
    scopeDigest,
    policyDigest: request.policyDigest,
    evaluatedAtLogicalMs: logicalTimeMs,
    records: allScopeRecords.map((record) => ({
      recordKind: record.recordKind,
      recordId: record.recordId,
      recordDigest: record.recordDigest,
      status: record.status,
      originBindingDigest: record.originBindingDigest,
      originVerifierBindingDigest: record.originVerifierBindingDigest,
      originProofDigest: record.originProofDigest,
      acceptedAtLogicalMs: record.acceptedAtLogicalMs,
      effectiveAtLogicalMs: record.effectiveAtLogicalMs,
    })),
    contentResolutions: state.contentResolutions
      .filter((item) => item.resolvedAtLogicalMs <= logicalTimeMs)
      .map((item) => ({
        resolutionId: item.resolutionId,
        resolutionDigest: item.resolutionDigest,
        resolvedAtLogicalMs: item.resolvedAtLogicalMs,
      })),
    contentInvalidations: state.contentInvalidations
      .filter((item) => item.invalidatedAtLogicalMs <= logicalTimeMs)
      .map((item) => ({
        invalidationId: item.invalidationId,
        resolutionId: item.resolutionId,
        resolutionDigest: item.resolutionDigest,
        resolverBindingDigest: item.resolverBindingDigest,
        invalidatedAtLogicalMs: item.invalidatedAtLogicalMs,
      })),
    causalAuthorizations: state.causalAuthorizations
      .filter((item) => item.authorizedAtLogicalMs <= logicalTimeMs)
      .map((item) => ({
        authorizationId: item.authorizationId,
        authorizationDigest: item.authorizationDigest,
        recordId: item.recordId,
        recordDigest: item.recordDigest,
        authorityBindingDigest: item.authorityBindingDigest,
        authorizedAtLogicalMs: item.authorizedAtLogicalMs,
      })),
    dependencyBindingDigests: request.dependencyBindingDigests,
  } as unknown as JsonValue);
  const exclusionGroups = new Map<string, EvidenceRecordExclusionV1>();
  for (const exclusion of exclusions) {
    const key = `${exclusion.recordDigest}\u0000${exclusion.recordId}`;
    const prior = exclusionGroups.get(key);
    exclusionGroups.set(key, {
      ...exclusion,
      reasonCodes: uniqueSorted(
        [...(prior?.reasonCodes ?? []), ...exclusion.reasonCodes],
        "fusion exclusion reasons",
      ) as TrustReasonCodeV1[],
    });
  }
  const normalizedExclusions = sorted(
    [...exclusionGroups.values()],
    (item) => `${item.recordDigest}\u0000${item.recordId}`,
  );
  const bare = {
    schemaVersion: 1 as const,
    tenantId: request.tenantId,
    subject: request.subject,
    subjectDigest,
    scope: request.scope,
    scopeDigest,
    policyId: request.policyId,
    policyVersion: request.policyVersion,
    policyDigest: request.policyDigest,
    evaluatedAtLogicalMs: logicalTimeMs,
    inputSetDigest,
    consideredRecordIds,
    includedRecordIds: uniqueSorted(
      [
        ...new Set([
          ...retained.map((work) => work.claim.recordId),
          ...works.flatMap((work) =>
            work.candidates
              .filter((candidate) => candidate.allocated > 0)
              .map((candidate) => candidate.record.recordId),
          ),
          ...resolutions.flatMap((resolution) => [
            ...resolution.challenges.map((challenge) => challenge.challengeId),
            ...resolution.consideredAttestationIds,
          ]),
        ]),
      ],
      "included records",
    ),
    recordExclusions: normalizedExclusions,
    claimClassifications: sorted(
      works.map((work) => work.classification),
      (item) => item.claimDigest,
    ),
    challengeResolutions: sorted(
      resolutions,
      (item) => item.challengeResolutionId,
    ),
    groupAllocations: sorted(
      allocations,
      (item) =>
        `${item.stage}\u0000${item.dimensionId ?? ""}\u0000${item.criterionId ?? ""}\u0000${item.claimId ?? ""}\u0000${item.dependencyGroupId}\u0000${item.candidateRecordIds.join("\u0000")}`,
    ),
    dimensions: sorted(dimensions, (item) => item.dimensionId),
    previousProfileDigest: null,
    reasonCodes: uniqueSorted(
      [
        ...new Set([
          ...normalizedExclusions.flatMap((item) => item.reasonCodes),
          ...resolutions.flatMap((item) => item.reasonCodes),
        ]),
      ],
      "fusion reasons",
    ) as TrustReasonCodeV1[],
  };
  const digest = digestTrustJsonV1(
    "fusion-decision",
    bare as unknown as JsonValue,
  );
  return validateEvidenceFusionDecisionV1({
    ...bare,
    fusionDecisionDigest: digest,
    fusionDecisionId: `fusion-decision:${digest}`,
  });
}
