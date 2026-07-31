import type { JsonValue } from "@agentplat/core";
import {
  deepFreeze,
  digestTrustJsonV1,
  TrustValidationError,
} from "./canonical.js";
import { digestScopeV1, digestSubjectV1 } from "./evidence.js";
import { validateEvidenceFusionDecisionV1 } from "./fusion.js";
import {
  digestEvidenceFusionPolicyV1,
  validateEvidenceFusionPolicyV1,
} from "./policy.js";
import { validateTrustProfileV1 } from "./profile.js";
import type {
  EvidenceFusionDecisionV1,
  EvidenceFusionPolicyV1,
  EvidenceTrustStateV1,
  QuarantineHeadV1,
  QuarantineRecordV1,
  QuarantineRecoveryDecisionV1,
  TrustProfileV1,
  TrustReasonCodeV1,
} from "./types.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  assertTrustDigest,
  validateReasonCodeV1,
} from "./validation.js";

export interface QuarantineEvidenceTupleV1 {
  readonly kind: "claim" | "attestation" | "content_resolution";
  readonly id: string;
  readonly digest: string;
}

export interface QuarantineActivationProjectionV1 {
  readonly dimensionId: string;
  readonly activationEvidence: readonly QuarantineEvidenceTupleV1[];
  readonly activationDependencyGroupIds: readonly string[];
  readonly effectiveNegativeWeightBasisPoints: number;
  readonly reviewIntervalMs: number;
}

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const recordKeys = [
  "schemaVersion",
  "quarantineId",
  "quarantineKey",
  "revision",
  "previousRecordId",
  "tenantId",
  "subjectDigest",
  "scopeDigest",
  "dimensionId",
  "policyDigest",
  "fusionDecisionId",
  "activationEvidenceIds",
  "activationEvidenceSetDigest",
  "activationDependencyGroupIds",
  "reasonCodes",
  "activatedAtLogicalMs",
  "reviewAfterLogicalMs",
  "status",
  "recoveredAtLogicalMs",
  "recoveryDecisionId",
] as const;
const recoveryKeys = [
  "schemaVersion",
  "recoveryDecisionId",
  "recoveryDecisionDigest",
  "quarantineId",
  "quarantineKey",
  "policyDigest",
  "fusionDecisionId",
  "evaluatedAtLogicalMs",
  "recoveryEvidenceIds",
  "recoveryEvidenceSetDigest",
  "recoveryClaimSourceDependencyGroupIds",
  "effectiveRecoveryWeightBasisPoints",
  "scoreBasisPoints",
  "uncertaintyBasisPoints",
  "disposition",
  "reasonCodes",
] as const;
const tupleKinds = ["claim", "attestation", "content_resolution"] as const;

function assertContentId(
  value: unknown,
  prefix:
    | "claim"
    | "attestation"
    | "content-resolution"
    | "fusion-decision"
    | "quarantine-record"
    | "recovery-decision",
  label: string,
): asserts value is string {
  assertIdentifier(value, label);
  if (!new RegExp(`^${prefix}:[0-9a-f]{64}$`, "u").test(value))
    throw new TrustValidationError(`${label} is not content-bound`);
}

function validateSortedIdentifiers(
  value: unknown,
  label: string,
  nonEmpty = false,
): readonly string[] {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0))
    throw new TrustValidationError(`${label} is invalid`);
  for (const item of value) assertIdentifier(item, label);
  if (
    value.some(
      (item, index) =>
        index > 0 && compare(value[index - 1] as string, item as string) >= 0,
    )
  )
    throw new TrustValidationError(
      `${label} must be canonically ordered and unique`,
    );
  return deepFreeze(structuredClone(value as string[]));
}

function validateSortedReasons(
  value: unknown,
  label: string,
): readonly TrustReasonCodeV1[] {
  const reasons = validateSortedIdentifiers(value, label);
  for (const reason of reasons) validateReasonCodeV1(reason);
  return reasons as readonly TrustReasonCodeV1[];
}

function tupleKey(value: QuarantineEvidenceTupleV1): string {
  return `${value.kind}\u0000${value.id}\u0000${value.digest}`;
}

export function validateQuarantineEvidenceTuplesV1(
  value: unknown,
  options: { readonly nonEmpty?: boolean } = {},
): readonly QuarantineEvidenceTupleV1[] {
  if (
    !Array.isArray(value) ||
    (options.nonEmpty === true && value.length === 0)
  )
    throw new TrustValidationError("quarantine evidence tuples are invalid");
  const tuples = value.map((candidate) => {
    assertExactKeys(candidate, ["kind", "id", "digest"], "evidence tuple");
    const tuple = candidate as unknown as QuarantineEvidenceTupleV1;
    if (!(tupleKinds as readonly string[]).includes(tuple.kind))
      throw new TrustValidationError("evidence tuple kind is invalid");
    assertTrustDigest(tuple.digest, "evidence tuple digest");
    const prefix =
      tuple.kind === "content_resolution" ? "content-resolution" : tuple.kind;
    assertContentId(tuple.id, prefix, "evidence tuple ID");
    if (tuple.id !== `${prefix}:${tuple.digest}`)
      throw new TrustValidationError("evidence tuple binding is invalid");
    return tuple;
  });
  if (
    tuples.some(
      (tuple, index) =>
        index > 0 && compare(tupleKey(tuples[index - 1]), tupleKey(tuple)) >= 0,
    )
  )
    throw new TrustValidationError(
      "evidence tuples must be canonically ordered and unique",
    );
  return deepFreeze(structuredClone(tuples));
}

export function digestTrustQuarantineKeyV1(value: {
  readonly tenantId: string;
  readonly subjectDigest: string;
  readonly scopeDigest: string;
  readonly dimensionId: string;
  readonly policyDigest: string;
}): string {
  assertExactKeys(
    value,
    ["tenantId", "subjectDigest", "scopeDigest", "dimensionId", "policyDigest"],
    "quarantine key",
  );
  assertIdentifier(value.tenantId, "tenantId");
  assertIdentifier(value.dimensionId, "dimensionId");
  for (const key of ["subjectDigest", "scopeDigest", "policyDigest"] as const)
    assertTrustDigest(value[key], key);
  return digestTrustJsonV1("quarantine-key", value as JsonValue);
}

export function digestQuarantineEvidenceSetV1(
  value: readonly QuarantineEvidenceTupleV1[],
  domain:
    | "quarantine-evidence-set"
    | "recovery-evidence-set" = "quarantine-evidence-set",
): string {
  const tuples = validateQuarantineEvidenceTuplesV1(value, {
    nonEmpty: domain === "quarantine-evidence-set",
  });
  return digestTrustJsonV1(domain, tuples as unknown as JsonValue);
}

export const digestTrustQuarantineEvidenceSetV1 = (
  value: readonly QuarantineEvidenceTupleV1[],
): string => digestQuarantineEvidenceSetV1(value, "quarantine-evidence-set");
export const digestTrustRecoveryEvidenceSetV1 = (
  value: readonly QuarantineEvidenceTupleV1[],
): string => digestQuarantineEvidenceSetV1(value, "recovery-evidence-set");

function quarantineRecordBody(
  value: QuarantineRecordV1,
): Omit<QuarantineRecordV1, "quarantineId"> {
  const { quarantineId: _id, ...body } = value;
  return body;
}

export function digestQuarantineRecordV1(value: QuarantineRecordV1): string {
  return digestTrustJsonV1(
    "quarantine-record",
    quarantineRecordBody(value) as unknown as JsonValue,
  );
}

export function validateQuarantineRecordV1(value: unknown): QuarantineRecordV1 {
  assertExactKeys(value, recordKeys, "quarantine record");
  const record = value as unknown as QuarantineRecordV1;
  if (record.schemaVersion !== 1)
    throw new TrustValidationError("quarantine schema is invalid");
  assertContentId(record.quarantineId, "quarantine-record", "quarantineId");
  if (record.previousRecordId !== null)
    assertContentId(
      record.previousRecordId,
      "quarantine-record",
      "previousRecordId",
    );
  assertIdentifier(record.tenantId, "tenantId");
  assertIdentifier(record.dimensionId, "dimensionId");
  assertContentId(
    record.fusionDecisionId,
    "fusion-decision",
    "fusionDecisionId",
  );
  for (const key of [
    "quarantineKey",
    "subjectDigest",
    "scopeDigest",
    "policyDigest",
    "activationEvidenceSetDigest",
  ] as const)
    assertTrustDigest(record[key], key);
  if (
    record.quarantineKey !==
    digestTrustQuarantineKeyV1({
      tenantId: record.tenantId,
      subjectDigest: record.subjectDigest,
      scopeDigest: record.scopeDigest,
      dimensionId: record.dimensionId,
      policyDigest: record.policyDigest,
    })
  )
    throw new TrustValidationError("quarantine key binding is invalid");
  assertSafeInteger(record.revision, "revision", 1);
  if ((record.revision === 1) !== (record.previousRecordId === null))
    throw new TrustValidationError("quarantine lineage is invalid");
  validateSortedIdentifiers(
    record.activationEvidenceIds,
    "activation evidence",
    true,
  );
  validateSortedIdentifiers(
    record.activationDependencyGroupIds,
    "activation groups",
    true,
  );
  const reasons = validateSortedReasons(
    record.reasonCodes,
    "quarantine reasons",
  );
  assertSafeInteger(record.activatedAtLogicalMs, "activatedAtLogicalMs");
  assertSafeInteger(record.reviewAfterLogicalMs, "reviewAfterLogicalMs");
  if (record.reviewAfterLogicalMs <= record.activatedAtLogicalMs)
    throw new TrustValidationError("quarantine review time is invalid");
  if (!(
    record.status === "active" ||
    record.status === "review_required" ||
    record.status === "recovered"
  ))
    throw new TrustValidationError("quarantine status is invalid");
  const expectedReason = {
    active: "quarantine_activated",
    review_required: "quarantine_review_required",
    recovered: "quarantine_recovered",
  }[record.status] as TrustReasonCodeV1;
  if (reasons.length !== 1 || reasons[0] !== expectedReason)
    throw new TrustValidationError("quarantine status reason is invalid");
  if (record.status === "recovered") {
    assertSafeInteger(record.recoveredAtLogicalMs, "recoveredAtLogicalMs");
    assertContentId(
      record.recoveryDecisionId,
      "recovery-decision",
      "recoveryDecisionId",
    );
    if (record.recoveredAtLogicalMs < record.reviewAfterLogicalMs)
      throw new TrustValidationError("recovery precedes review");
  } else if (
    record.recoveredAtLogicalMs !== null ||
    record.recoveryDecisionId !== null
  )
    throw new TrustValidationError("quarantine recovery fields are invalid");
  if (
    record.quarantineId !==
    `quarantine-record:${digestQuarantineRecordV1(record)}`
  )
    throw new TrustValidationError("quarantine digest is invalid");
  return deepFreeze(structuredClone(record));
}

export function createQuarantineRecordV1(
  input: Omit<QuarantineRecordV1, "quarantineId">,
): QuarantineRecordV1 {
  const digest = digestTrustJsonV1(
    "quarantine-record",
    input as unknown as JsonValue,
  );
  return validateQuarantineRecordV1({
    ...input,
    quarantineId: `quarantine-record:${digest}`,
  });
}

export function createActiveQuarantineRecordV1(input: {
  readonly revision: number;
  readonly previousRecordId: string | null;
  readonly tenantId: string;
  readonly subjectDigest: string;
  readonly scopeDigest: string;
  readonly dimensionId: string;
  readonly policyDigest: string;
  readonly fusionDecisionId: string;
  readonly activationEvidence: readonly QuarantineEvidenceTupleV1[];
  readonly activationDependencyGroupIds: readonly string[];
  readonly activatedAtLogicalMs: number;
  readonly reviewIntervalMs: number;
}): QuarantineRecordV1 {
  assertExactKeys(
    input,
    [
      "revision",
      "previousRecordId",
      "tenantId",
      "subjectDigest",
      "scopeDigest",
      "dimensionId",
      "policyDigest",
      "fusionDecisionId",
      "activationEvidence",
      "activationDependencyGroupIds",
      "activatedAtLogicalMs",
      "reviewIntervalMs",
    ],
    "active quarantine input",
  );
  assertSafeInteger(input.activatedAtLogicalMs, "activatedAtLogicalMs");
  assertSafeInteger(input.reviewIntervalMs, "reviewIntervalMs", 1);
  if (
    input.activatedAtLogicalMs >
    Number.MAX_SAFE_INTEGER - input.reviewIntervalMs
  )
    throw new TrustValidationError("quarantine review time overflows");
  const evidence = validateQuarantineEvidenceTuplesV1(
    input.activationEvidence,
    { nonEmpty: true },
  );
  const activationEvidenceIds = [...evidence]
    .map((item) => item.id)
    .sort(compare);
  validateSortedIdentifiers(
    activationEvidenceIds,
    "activation evidence IDs",
    true,
  );
  const activationDependencyGroupIds = validateSortedIdentifiers(
    input.activationDependencyGroupIds,
    "activation groups",
    true,
  );
  return createQuarantineRecordV1({
    schemaVersion: 1,
    quarantineKey: digestTrustQuarantineKeyV1({
      tenantId: input.tenantId,
      subjectDigest: input.subjectDigest,
      scopeDigest: input.scopeDigest,
      dimensionId: input.dimensionId,
      policyDigest: input.policyDigest,
    }),
    revision: input.revision,
    previousRecordId: input.previousRecordId,
    tenantId: input.tenantId,
    subjectDigest: input.subjectDigest,
    scopeDigest: input.scopeDigest,
    dimensionId: input.dimensionId,
    policyDigest: input.policyDigest,
    fusionDecisionId: input.fusionDecisionId,
    activationEvidenceIds,
    activationEvidenceSetDigest: digestTrustQuarantineEvidenceSetV1(evidence),
    activationDependencyGroupIds,
    reasonCodes: ["quarantine_activated"],
    activatedAtLogicalMs: input.activatedAtLogicalMs,
    reviewAfterLogicalMs: input.activatedAtLogicalMs + input.reviewIntervalMs,
    status: "active",
    recoveredAtLogicalMs: null,
    recoveryDecisionId: null,
  });
}

function validateProjectionBinding(
  state: EvidenceTrustStateV1,
  profileValue: TrustProfileV1,
  decisionValue: EvidenceFusionDecisionV1,
  policyValue: EvidenceFusionPolicyV1,
): {
  readonly profile: TrustProfileV1;
  readonly decision: EvidenceFusionDecisionV1;
  readonly policy: EvidenceFusionPolicyV1;
} {
  const profile = validateTrustProfileV1(profileValue);
  const decision = validateEvidenceFusionDecisionV1(decisionValue);
  const policy = validateEvidenceFusionPolicyV1(policyValue, state.limits);
  const policyDigest = digestEvidenceFusionPolicyV1(policy);
  if (
    decision.policyId !== policy.policyId ||
    decision.policyVersion !== policy.policyVersion ||
    decision.policyDigest !== policyDigest ||
    profile.policyId !== policy.policyId ||
    profile.policyVersion !== policy.policyVersion ||
    profile.policyDigest !== policyDigest ||
    profile.tenantId !== decision.tenantId ||
    profile.subjectDigest !== decision.subjectDigest ||
    profile.scopeDigest !== decision.scopeDigest ||
    profile.fusionDecisionId !== decision.fusionDecisionId ||
    profile.fusionDecisionDigest !== decision.fusionDecisionDigest ||
    profile.inputSetDigest !== decision.inputSetDigest ||
    profile.updatedAtLogicalMs !== decision.evaluatedAtLogicalMs
  )
    throw new TrustValidationError("quarantine projection binding is invalid");
  return { profile, decision, policy };
}

function sortedTuples(
  values: readonly QuarantineEvidenceTupleV1[],
): readonly QuarantineEvidenceTupleV1[] {
  const byKey = new Map(values.map((value) => [tupleKey(value), value]));
  return validateQuarantineEvidenceTuplesV1(
    [...byKey.values()].sort((left, right) =>
      compare(tupleKey(left), tupleKey(right)),
    ),
  );
}

function exactClaimEvidence(
  state: EvidenceTrustStateV1,
  decision: EvidenceFusionDecisionV1,
  classification: EvidenceFusionDecisionV1["claimClassifications"][number],
  afterLogicalMs: number | null,
): readonly QuarantineEvidenceTupleV1[] | null {
  const claim = state.records.find(
    (record) =>
      record.recordKind === "claim" &&
      record.recordId === classification.claimId &&
      record.recordDigest === classification.claimDigest,
  );
  if (
    !claim ||
    (afterLogicalMs !== null && claim.acceptedAtLogicalMs <= afterLogicalMs)
  )
    return null;
  const tuples: QuarantineEvidenceTupleV1[] = [
    { kind: "claim", id: claim.recordId, digest: claim.recordDigest },
  ];
  for (const attestationId of classification.effectiveSupportingAttestationIds) {
    const attestation = state.records.find(
      (record) =>
        record.recordKind === "attestation" &&
        record.recordId === attestationId &&
        "claimId" in record.record &&
        "disposition" in record.record &&
        record.record.claimId === claim.recordId &&
        record.record.claimDigest === claim.recordDigest &&
        record.record.disposition === "support",
    );
    if (
      !attestation ||
      (afterLogicalMs !== null &&
        attestation.acceptedAtLogicalMs <= afterLogicalMs)
    )
      return null;
    tuples.push({
      kind: "attestation",
      id: attestation.recordId,
      digest: attestation.recordDigest,
    });
  }
  for (const resolutionId of classification.effectiveContentResolutionIds) {
    const resolution = state.contentResolutions.find(
      (candidate) =>
        candidate.resolutionId === resolutionId &&
        candidate.claimId === claim.recordId &&
        candidate.claimDigest === claim.recordDigest &&
        candidate.result === "verified" &&
        candidate.resolvedAtLogicalMs <= decision.evaluatedAtLogicalMs,
    );
    if (
      !resolution ||
      (afterLogicalMs !== null &&
        resolution.resolvedAtLogicalMs <= afterLogicalMs)
    )
      return null;
    tuples.push({
      kind: "content_resolution",
      id: resolution.resolutionId,
      digest: resolution.resolutionDigest,
    });
  }
  return sortedTuples(tuples);
}

export function deriveQuarantineActivationsV1(
  state: EvidenceTrustStateV1,
  profileValue: TrustProfileV1,
  decisionValue: EvidenceFusionDecisionV1,
  policyValue: EvidenceFusionPolicyV1,
  acceptedAfterLogicalMs: number | null = null,
): readonly QuarantineActivationProjectionV1[] {
  if (acceptedAfterLogicalMs !== null)
    assertSafeInteger(acceptedAfterLogicalMs, "acceptedAfterLogicalMs");
  const { profile, decision, policy } = validateProjectionBinding(
    state,
    profileValue,
    decisionValue,
    policyValue,
  );
  if (!policy.quarantinePolicy.enabled) return deepFreeze([]);
  const projections: QuarantineActivationProjectionV1[] = [];
  for (const rule of policy.quarantinePolicy.rules) {
    const dimension = profile.dimensions.find(
      (candidate) => candidate.dimensionId === rule.dimensionId,
    );
    if (
      !dimension ||
      dimension.scoreBasisPoints > rule.activationScoreAtOrBelowBasisPoints
    )
      continue;
    const groups = new Set<string>();
    const tuples: QuarantineEvidenceTupleV1[] = [];
    let weight = 0;
    for (const classification of decision.claimClassifications) {
      if (
        classification.dimensionId !== rule.dimensionId ||
        !dimension.includedClaimIds.includes(classification.claimId) ||
        classification.classification !== "supported" ||
        classification.effectiveWeightBasisPoints <= 0 ||
        classification.claimSourceDependencyGroupId === null
      )
        continue;
      const criterion = policy.criteria.find(
        (candidate) => candidate.criterionId === classification.criterionId,
      );
      const claim = state.records.find(
        (record) =>
          record.recordKind === "claim" &&
          record.recordId === classification.claimId &&
          record.recordDigest === classification.claimDigest,
      );
      if (
        !criterion?.quarantineEligible ||
        !claim ||
        !("outcome" in claim.record) ||
        claim.record.outcome !== "violated"
      )
        continue;
      const evidence = exactClaimEvidence(
        state,
        decision,
        classification,
        acceptedAfterLogicalMs,
      );
      if (!evidence) continue;
      groups.add(classification.claimSourceDependencyGroupId);
      weight = Math.min(
        10_000,
        weight + classification.effectiveWeightBasisPoints,
      );
      tuples.push(...evidence);
    }
    const activationDependencyGroupIds = [...groups].sort(compare);
    if (
      activationDependencyGroupIds.length <
        rule.minimumNegativeClaimSourceGroups ||
      weight < rule.minimumNegativeWeightBasisPoints
    )
      continue;
    projections.push({
      dimensionId: rule.dimensionId,
      activationEvidence: sortedTuples(tuples),
      activationDependencyGroupIds,
      effectiveNegativeWeightBasisPoints: weight,
      reviewIntervalMs: rule.reviewIntervalMs,
    });
  }
  return deepFreeze(
    projections.sort((left, right) =>
      compare(left.dimensionId, right.dimensionId),
    ),
  );
}

export function evaluateQuarantineRecoveryV1(
  state: EvidenceTrustStateV1,
  quarantineValue: QuarantineRecordV1,
  profileValue: TrustProfileV1,
  decisionValue: EvidenceFusionDecisionV1,
  policyValue: EvidenceFusionPolicyV1,
  logicalTimeMs: number,
): QuarantineRecoveryDecisionV1 {
  const quarantine = validateQuarantineRecordV1(quarantineValue);
  assertSafeInteger(logicalTimeMs, "logicalTimeMs");
  const { profile, decision, policy } = validateProjectionBinding(
    state,
    profileValue,
    decisionValue,
    policyValue,
  );
  const exhaustedActive =
    quarantine.status === "active" &&
    logicalTimeMs >= quarantine.reviewAfterLogicalMs &&
    quarantine.revision >= state.limits.maximumQuarantineRevisionsPerHead;
  if (
    (quarantine.status !== "review_required" && !exhaustedActive) ||
    quarantine.policyDigest !== profile.policyDigest ||
    quarantine.tenantId !== profile.tenantId ||
    quarantine.subjectDigest !== profile.subjectDigest ||
    quarantine.scopeDigest !== profile.scopeDigest ||
    decision.evaluatedAtLogicalMs !== logicalTimeMs ||
    logicalTimeMs < quarantine.reviewAfterLogicalMs
  )
    throw new TrustValidationError("quarantine review binding is invalid");
  const rule = policy.recoveryPolicy.rules.find(
    (candidate) => candidate.dimensionId === quarantine.dimensionId,
  );
  const dimension = profile.dimensions.find(
    (candidate) => candidate.dimensionId === quarantine.dimensionId,
  );
  const reasons = new Set<TrustReasonCodeV1>();
  const evidence: QuarantineEvidenceTupleV1[] = [];
  const groups = new Set<string>();
  let weight = 0;
  let unresolvedNegative = false;
  let unresolvedRecoveryEvidence = false;
  const blockerReasons = new Set<TrustReasonCodeV1>();
  const exactRecord = (recordId: string, recordDigest: string) =>
    state.records.find(
      (record) =>
        record.recordId === recordId && record.recordDigest === recordDigest,
    ) ?? null;
  const relationDigest = (
    record: EvidenceTrustStateV1["records"][number],
  ): string => {
    if ("claimRelationDigest" in record.record)
      return record.record.claimRelationDigest;
    if ("attestationRelationDigest" in record.record)
      return record.record.attestationRelationDigest;
    if ("challengeRelationDigest" in record.record)
      return record.record.challengeRelationDigest;
    return record.record.retractionRelationDigest;
  };
  const conflictedAtDecision = (
    record: EvidenceTrustStateV1["records"][number],
  ): boolean =>
    state.records.filter(
      (candidate) =>
        candidate.recordKind === record.recordKind &&
        candidate.acceptedAtLogicalMs <= decision.evaluatedAtLogicalMs &&
        relationDigest(candidate) === relationDigest(record),
    ).length > 1;
  const claimForRecord = (record: EvidenceTrustStateV1["records"][number]) => {
    if (record.recordKind === "claim") return record;
    if (
      (record.recordKind === "attestation" ||
        record.recordKind === "retraction") &&
      "claimId" in record.record &&
      "claimDigest" in record.record
    )
      return exactRecord(record.record.claimId, record.record.claimDigest);
    if (record.recordKind === "challenge") {
      if (!("targetId" in record.record)) return null;
      const target = exactRecord(
        record.record.targetId,
        record.record.targetDigest,
      );
      if (!target) return null;
      if (target.recordKind === "claim") return target;
      if (
        target.recordKind === "attestation" &&
        "claimId" in target.record &&
        "claimDigest" in target.record
      )
        return exactRecord(target.record.claimId, target.record.claimDigest);
    }
    if (record.recordKind === "retraction" && "targetId" in record.record) {
      const target = exactRecord(
        record.record.targetId,
        record.record.targetDigest,
      );
      if (!target) return null;
      if (target.recordKind === "claim") return target;
      if (
        target.recordKind === "attestation" &&
        "claimId" in target.record &&
        "claimDigest" in target.record
      )
        return exactRecord(target.record.claimId, target.record.claimDigest);
    }
    return null;
  };
  const relevantEquivocation = state.records.some((record) => {
    if (
      !conflictedAtDecision(record) ||
      record.acceptedAtLogicalMs <= quarantine.activatedAtLogicalMs ||
      record.acceptedAtLogicalMs > decision.evaluatedAtLogicalMs ||
      digestScopeV1(record.record.scope) !== quarantine.scopeDigest
    )
      return false;
    const claim = claimForRecord(record);
    if (
      !claim ||
      !("criterionId" in claim.record) ||
      !("outcome" in claim.record)
    )
      return false;
    if (digestSubjectV1(claim.record.subject) !== quarantine.subjectDigest)
      return false;
    const criterionId = claim.record.criterionId;
    const criterion = policy.criteria.find(
      (candidate) => candidate.criterionId === criterionId,
    );
    return (
      criterion?.dimensionId === quarantine.dimensionId &&
      (criterion.quarantineEligible || criterion.recoveryEligible)
    );
  });
  if (relevantEquivocation) {
    unresolvedRecoveryEvidence = true;
    blockerReasons.add("relationship_conflict");
  }
  for (const resolution of decision.challengeResolutions) {
    if (resolution.result === "dismissed" || resolution.result === "sustained")
      continue;
    const blocksRecovery = resolution.challenges.some((reference) => {
      const challenge = exactRecord(
        reference.challengeId,
        reference.challengeDigest,
      );
      if (
        !challenge ||
        challenge.recordKind !== "challenge" ||
        challenge.acceptedAtLogicalMs <= quarantine.activatedAtLogicalMs ||
        challenge.acceptedAtLogicalMs > decision.evaluatedAtLogicalMs ||
        digestScopeV1(challenge.record.scope) !== quarantine.scopeDigest
      )
        return false;
      const claim = claimForRecord(challenge);
      if (
        !claim ||
        !("criterionId" in claim.record) ||
        digestSubjectV1(claim.record.subject) !== quarantine.subjectDigest
      )
        return false;
      const criterionId = claim.record.criterionId;
      const criterion = policy.criteria.find(
        (candidate) => candidate.criterionId === criterionId,
      );
      return (
        criterion?.dimensionId === quarantine.dimensionId &&
        (criterion.quarantineEligible || criterion.recoveryEligible)
      );
    });
    if (!blocksRecovery) continue;
    unresolvedRecoveryEvidence = true;
    blockerReasons.add(
      resolution.result === "contested"
        ? "challenge_contested"
        : "challenge_unresolved",
    );
  }
  if (rule && dimension) {
    for (const classification of decision.claimClassifications) {
      if (classification.dimensionId !== quarantine.dimensionId) continue;
      const criterion = policy.criteria.find(
        (candidate) => candidate.criterionId === classification.criterionId,
      );
      const claim = state.records.find(
        (record) =>
          record.recordKind === "claim" &&
          record.recordId === classification.claimId &&
          record.recordDigest === classification.claimDigest,
      );
      if (!criterion || !claim || !("outcome" in claim.record)) continue;
      const included = dimension.includedClaimIds.includes(
        classification.claimId,
      );
      const claimConflicted = conflictedAtDecision(claim);
      const negativeExcludedAsUnresolved = decision.recordExclusions.some(
        (exclusion) =>
          exclusion.recordKind === "claim" &&
          exclusion.recordId === classification.claimId &&
          exclusion.recordDigest === classification.claimDigest &&
          (exclusion.reasonCodes.includes("root_basis_conflict") ||
            exclusion.reasonCodes.includes("challenge_unresolved") ||
            exclusion.reasonCodes.includes("fusion_contested")),
      );
      if (
        claim.record.outcome === "violated" &&
        criterion.quarantineEligible &&
        claim.acceptedAtLogicalMs > quarantine.activatedAtLogicalMs &&
        (claimConflicted ||
          (classification.classification === "supported" && included) ||
          classification.classification === "contested" ||
          (classification.classification === "unavailable" &&
            (classification.reasonCodes.includes("challenge_unresolved") ||
              classification.reasonCodes.includes("root_basis_conflict"))) ||
          negativeExcludedAsUnresolved)
      )
        unresolvedNegative = true;
      if (
        claim.record.outcome === "violated" &&
        claimConflicted &&
        claim.acceptedAtLogicalMs > quarantine.activatedAtLogicalMs
      )
        blockerReasons.add("relationship_conflict");
      const recoveryClaimUnresolved =
        claim.record.outcome === "satisfied" &&
        criterion.recoveryEligible &&
        claim.acceptedAtLogicalMs > quarantine.activatedAtLogicalMs &&
        (classification.classification === "contested" ||
          (classification.classification === "unavailable" &&
            classification.reasonCodes.includes("challenge_unresolved")) ||
          negativeExcludedAsUnresolved);
      const recoverySupportUnresolved = decision.recordExclusions.some(
        (exclusion) => {
          if (
            exclusion.recordKind !== "attestation" ||
            !(
              exclusion.reasonCodes.includes("challenge_unresolved") ||
              exclusion.reasonCodes.includes("dependency_group_conflict")
            )
          )
            return false;
          const attestation = state.records.find(
            (record) =>
              record.recordKind === "attestation" &&
              record.recordId === exclusion.recordId &&
              record.recordDigest === exclusion.recordDigest &&
              "claimId" in record.record &&
              record.record.claimId === claim.recordId &&
              record.acceptedAtLogicalMs > quarantine.activatedAtLogicalMs,
          );
          if (attestation)
            for (const reason of exclusion.reasonCodes)
              if (
                reason === "challenge_unresolved" ||
                reason === "dependency_group_conflict"
              )
                blockerReasons.add(reason);
          return attestation !== undefined;
        },
      );
      if (recoveryClaimUnresolved || recoverySupportUnresolved) {
        unresolvedRecoveryEvidence = true;
        if (classification.classification === "contested")
          blockerReasons.add("fusion_contested");
        for (const exclusion of decision.recordExclusions)
          if (
            exclusion.recordId === classification.claimId &&
            exclusion.recordDigest === classification.claimDigest
          )
            for (const reason of exclusion.reasonCodes)
              if (
                reason === "root_basis_conflict" ||
                reason === "challenge_unresolved" ||
                reason === "fusion_contested"
              )
                blockerReasons.add(reason);
      }
      const selfClaim =
        claim.record.sourceKind === "peer" &&
        claim.record.sourceId === decision.subject.peerId;
      if (
        claim.record.outcome !== "satisfied" ||
        !criterion.recoveryEligible ||
        selfClaim ||
        !included ||
        classification.classification !== "supported" ||
        classification.effectiveWeightBasisPoints <= 0 ||
        classification.claimSourceDependencyGroupId === null ||
        quarantine.activationDependencyGroupIds.includes(
          classification.claimSourceDependencyGroupId,
        ) ||
        claim.acceptedAtLogicalMs <= quarantine.activatedAtLogicalMs ||
        logicalTimeMs - claim.effectiveAtLogicalMs >
          rule.maximumRecoveryEvidenceAgeMs
      )
        continue;
      const claimEvidence = exactClaimEvidence(
        state,
        decision,
        classification,
        quarantine.activatedAtLogicalMs,
      );
      if (!claimEvidence) continue;
      groups.add(classification.claimSourceDependencyGroupId);
      weight = Math.min(
        10_000,
        weight + classification.effectiveWeightBasisPoints,
      );
      evidence.push(...claimEvidence);
    }
  }
  if (unresolvedNegative) blockerReasons.add("challenge_unresolved");
  for (const reason of blockerReasons) reasons.add(reason);
  const recoveryEvidence = sortedTuples(evidence);
  const recoveryGroups = [...groups].sort(compare);
  const revisionAvailable =
    quarantine.revision < state.limits.maximumQuarantineRevisionsPerHead;
  let disposition: QuarantineRecoveryDecisionV1["disposition"];
  if (!rule || !dimension || !revisionAvailable) {
    disposition = "unavailable";
    reasons.add("quarantine_recovery_unavailable");
  } else if (
    unresolvedNegative ||
    unresolvedRecoveryEvidence ||
    dimension.scoreBasisPoints < rule.recoveryScoreAtOrAboveBasisPoints ||
    dimension.uncertaintyBasisPoints >
      rule.maximumRecoveryUncertaintyBasisPoints ||
    recoveryGroups.length < rule.minimumRecoveryClaimSourceGroups ||
    weight < rule.minimumRecoveryWeightBasisPoints
  ) {
    disposition = "insufficient";
    reasons.add("quarantine_recovery_insufficient");
  } else {
    disposition = "recovered";
    reasons.add("quarantine_recovered");
  }
  return createQuarantineRecoveryDecisionV1({
    schemaVersion: 1,
    quarantineId: quarantine.quarantineId,
    quarantineKey: quarantine.quarantineKey,
    policyDigest: quarantine.policyDigest,
    fusionDecisionId: decision.fusionDecisionId,
    evaluatedAtLogicalMs: logicalTimeMs,
    recoveryEvidenceIds: recoveryEvidence.map((item) => item.id).sort(compare),
    recoveryEvidenceSetDigest:
      digestTrustRecoveryEvidenceSetV1(recoveryEvidence),
    recoveryClaimSourceDependencyGroupIds: recoveryGroups,
    effectiveRecoveryWeightBasisPoints: weight,
    scoreBasisPoints: dimension?.scoreBasisPoints ?? 0,
    uncertaintyBasisPoints: dimension?.uncertaintyBasisPoints ?? 10_000,
    disposition,
    reasonCodes: [...reasons].sort(compare),
  });
}

export function createReviewRequiredQuarantineRecordV1(
  value: QuarantineRecordV1,
  reviewedAtLogicalMs: number,
): QuarantineRecordV1 {
  const current = validateQuarantineRecordV1(value);
  assertSafeInteger(reviewedAtLogicalMs, "reviewedAtLogicalMs");
  if (
    current.status !== "active" ||
    reviewedAtLogicalMs < current.reviewAfterLogicalMs
  )
    throw new TrustValidationError("quarantine is not ready for review");
  return createQuarantineRecordV1({
    ...quarantineRecordBody(current),
    revision: current.revision + 1,
    previousRecordId: current.quarantineId,
    reasonCodes: ["quarantine_review_required"],
    status: "review_required",
  });
}

function recoveryDecisionBody(
  value: QuarantineRecoveryDecisionV1,
): Omit<
  QuarantineRecoveryDecisionV1,
  "recoveryDecisionId" | "recoveryDecisionDigest"
> {
  const {
    recoveryDecisionId: _id,
    recoveryDecisionDigest: _digest,
    ...body
  } = value;
  return body;
}

export function digestQuarantineRecoveryDecisionV1(
  value: QuarantineRecoveryDecisionV1,
): string {
  return digestTrustJsonV1(
    "recovery-decision",
    recoveryDecisionBody(value) as unknown as JsonValue,
  );
}

export function validateQuarantineRecoveryDecisionV1(
  value: unknown,
): QuarantineRecoveryDecisionV1 {
  assertExactKeys(value, recoveryKeys, "recovery decision");
  const decision = value as unknown as QuarantineRecoveryDecisionV1;
  if (decision.schemaVersion !== 1)
    throw new TrustValidationError("recovery schema is invalid");
  assertContentId(
    decision.recoveryDecisionId,
    "recovery-decision",
    "recoveryDecisionId",
  );
  assertContentId(decision.quarantineId, "quarantine-record", "quarantineId");
  assertContentId(
    decision.fusionDecisionId,
    "fusion-decision",
    "fusionDecisionId",
  );
  for (const key of [
    "recoveryDecisionDigest",
    "quarantineKey",
    "policyDigest",
    "recoveryEvidenceSetDigest",
  ] as const)
    assertTrustDigest(decision[key], key);
  assertSafeInteger(decision.evaluatedAtLogicalMs, "evaluatedAtLogicalMs");
  validateSortedIdentifiers(decision.recoveryEvidenceIds, "recovery evidence");
  validateSortedIdentifiers(
    decision.recoveryClaimSourceDependencyGroupIds,
    "recovery groups",
  );
  for (const key of [
    "effectiveRecoveryWeightBasisPoints",
    "scoreBasisPoints",
    "uncertaintyBasisPoints",
  ] as const) {
    assertSafeInteger(decision[key], key);
    if (decision[key] > 10_000)
      throw new TrustValidationError("recovery basis points are invalid");
  }
  if (!(
    decision.disposition === "unavailable" ||
    decision.disposition === "insufficient" ||
    decision.disposition === "recovered"
  ))
    throw new TrustValidationError("recovery disposition is invalid");
  const reasons = validateSortedReasons(
    decision.reasonCodes,
    "recovery reasons",
  );
  const primaryReason = {
    unavailable: "quarantine_recovery_unavailable",
    insufficient: "quarantine_recovery_insufficient",
    recovered: "quarantine_recovered",
  }[decision.disposition] as TrustReasonCodeV1;
  if (!reasons.includes(primaryReason))
    throw new TrustValidationError("recovery disposition reason is invalid");
  if (
    decision.disposition === "recovered" &&
    (decision.recoveryEvidenceIds.length === 0 ||
      decision.recoveryClaimSourceDependencyGroupIds.length === 0 ||
      decision.effectiveRecoveryWeightBasisPoints === 0)
  )
    throw new TrustValidationError("recovered decision has no evidence");
  if (
    decision.recoveryDecisionDigest !==
      digestQuarantineRecoveryDecisionV1(decision) ||
    decision.recoveryDecisionId !==
      `recovery-decision:${decision.recoveryDecisionDigest}`
  )
    throw new TrustValidationError("recovery digest is invalid");
  return deepFreeze(structuredClone(decision));
}

export function createQuarantineRecoveryDecisionV1(
  input: Omit<
    QuarantineRecoveryDecisionV1,
    "recoveryDecisionId" | "recoveryDecisionDigest"
  >,
): QuarantineRecoveryDecisionV1 {
  const digest = digestTrustJsonV1(
    "recovery-decision",
    input as unknown as JsonValue,
  );
  return validateQuarantineRecoveryDecisionV1({
    ...input,
    recoveryDecisionDigest: digest,
    recoveryDecisionId: `recovery-decision:${digest}`,
  });
}

export function createRecoveredQuarantineRecordV1(
  value: QuarantineRecordV1,
  decisionValue: QuarantineRecoveryDecisionV1,
): QuarantineRecordV1 {
  const current = validateQuarantineRecordV1(value);
  const decision = validateQuarantineRecoveryDecisionV1(decisionValue);
  if (
    current.status !== "review_required" ||
    decision.disposition !== "recovered" ||
    decision.quarantineId !== current.quarantineId ||
    decision.quarantineKey !== current.quarantineKey ||
    decision.policyDigest !== current.policyDigest ||
    decision.evaluatedAtLogicalMs < current.reviewAfterLogicalMs
  )
    throw new TrustValidationError(
      "recovery decision does not bind the current quarantine",
    );
  return createQuarantineRecordV1({
    ...quarantineRecordBody(current),
    revision: current.revision + 1,
    previousRecordId: current.quarantineId,
    fusionDecisionId: decision.fusionDecisionId,
    reasonCodes: ["quarantine_recovered"],
    status: "recovered",
    recoveredAtLogicalMs: decision.evaluatedAtLogicalMs,
    recoveryDecisionId: decision.recoveryDecisionId,
  });
}

export function quarantineHeadV1(value: QuarantineRecordV1): QuarantineHeadV1 {
  const record = validateQuarantineRecordV1(value);
  return deepFreeze({
    quarantineKey: record.quarantineKey,
    quarantineId: record.quarantineId,
    revision: record.revision,
    status: record.status,
  });
}

export function validateQuarantineHeadV1(value: unknown): QuarantineHeadV1 {
  assertExactKeys(
    value,
    ["quarantineKey", "quarantineId", "revision", "status"],
    "quarantine head",
  );
  const head = value as unknown as QuarantineHeadV1;
  assertTrustDigest(head.quarantineKey, "quarantineKey");
  assertContentId(head.quarantineId, "quarantine-record", "quarantineId");
  assertSafeInteger(head.revision, "revision", 1);
  if (!(
    head.status === "active" ||
    head.status === "review_required" ||
    head.status === "recovered"
  ))
    throw new TrustValidationError("quarantine head status is invalid");
  return deepFreeze(structuredClone(head));
}
