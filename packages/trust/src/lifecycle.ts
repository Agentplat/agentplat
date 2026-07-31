import type { JsonValue } from "@agentplat/core";
import {
  canonicalTrustJsonBytesV1,
  deepFreeze,
  digestTrustJsonV1,
  TrustValidationError,
} from "./canonical.js";
import {
  digestScopeV1,
  validateEvidenceAttestationV1,
  validateEvidenceChallengeV1,
  validateEvidenceClaimV1,
  validateEvidenceRetractionV1,
} from "./evidence.js";
import { validateEvidenceTrustStateV1 } from "./state.js";
import { evaluateEvidenceFusionV1 } from "./fusion.js";
import {
  dependencyBindingHeadV1,
  digestEvidenceFusionPolicyV1,
  validateEvidenceFusionPolicyV1,
  validateEvidenceTrustDependencyBindingV1,
} from "./policy.js";
import { createEvidenceCausalAuthorizationV1 } from "./causal.js";
import type {
  EvidenceContentResolutionInvalidationV1,
  EvidenceContentProjectionStatusV1,
  EvidenceContentResolutionV1,
  EvidenceCausalAuthorizationV1,
  EvidenceRecordKindV1,
  EvidenceRecordStateV1,
  EvidenceRecordStatusV1,
  EvidenceRecordV1,
  EvidenceTrustDiagnosticV1,
  EvidenceTrustEffectV1,
  EvidenceTrustInputV1,
  EvidenceTrustReducerOptionsV1,
  EvidenceTrustReducerResultV1,
  EvidenceTrustStateV1,
  TrustReasonCodeV1,
} from "./types.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  assertToken,
  assertTrustDigest,
  validateReasonCodeV1,
} from "./validation.js";

const STATE_LIMITS = {
  maximumBytes: 67_108_864,
  maximumDepth: 64,
  maximumNodes: 100_000,
  maximumKeysPerObject: 256,
  maximumItemsPerArray: 100_000,
} as const;
const compareUnicode = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const reachedPendingAge = (
  laterLogicalMs: number,
  acceptedAtLogicalMs: number,
  maximumPendingAgeMs: number,
): boolean =>
  laterLogicalMs >= acceptedAtLogicalMs &&
  laterLogicalMs - acceptedAtLogicalMs >= maximumPendingAgeMs;

function recordKind(record: EvidenceRecordV1): EvidenceRecordKindV1 {
  if ("claimId" in record && "outcome" in record) return "claim";
  if ("attestationId" in record) return "attestation";
  if ("challengeId" in record) return "challenge";
  return "retraction";
}
function recordId(record: EvidenceRecordV1): string {
  if ("claimId" in record && "outcome" in record) return record.claimId;
  if ("attestationId" in record) return record.attestationId;
  if ("challengeId" in record) return record.challengeId;
  return record.retractionId;
}
/** The record digest is the content-bound suffix of the validated derived ID. */
export function digestEvidenceRecordV1(recordValue: unknown): string {
  const record = validateEvidenceRecordV1(recordValue);
  const id = recordId(record);
  const separator = id.indexOf(":");
  const digest = id.slice(separator + 1);
  assertTrustDigest(digest, "recordDigest");
  return digest;
}
export function validateEvidenceRecordV1(value: unknown): EvidenceRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TrustValidationError("evidence record is invalid");
  const record = value as Record<string, unknown>;
  if ("outcome" in record) return validateEvidenceClaimV1(record);
  if ("attestationId" in record) return validateEvidenceAttestationV1(record);
  if ("challengeId" in record) return validateEvidenceChallengeV1(record);
  if ("retractionId" in record) return validateEvidenceRetractionV1(record);
  throw new TrustValidationError("evidence record kind is invalid");
}
function relationDigest(record: EvidenceRecordV1): string {
  if ("claimRelationDigest" in record) return record.claimRelationDigest;
  if ("attestationRelationDigest" in record)
    return record.attestationRelationDigest;
  if ("challengeRelationDigest" in record)
    return record.challengeRelationDigest;
  return record.retractionRelationDigest;
}
function recordScopeDigest(record: EvidenceRecordV1): string {
  return digestScopeV1(record.scope);
}
function recordSource(record: EvidenceRecordV1): string {
  return record.sourceId;
}
function targetOf(
  record: EvidenceRecordV1,
): { kind: "claim" | "attestation"; id: string; digest: string } | null {
  if ("claimId" in record && "outcome" in record) return null;
  if ("attestationId" in record)
    return { kind: "claim", id: record.claimId, digest: record.claimDigest };
  return {
    kind: record.targetKind,
    id: record.targetId,
    digest: record.targetDigest,
  };
}
function basisReferences(record: EvidenceRecordV1) {
  return "basisReferences" in record ? record.basisReferences : [];
}
function requireDigest(value: unknown, label: string): string {
  assertTrustDigest(value, label);
  return value as string;
}

export function validateEvidenceRecordStateV1(
  value: unknown,
): EvidenceRecordStateV1 {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "recordKind",
      "recordId",
      "recordDigest",
      "record",
      "origin",
      "originBindingDigest",
      "originVerifierBindingDigest",
      "originProofDigest",
      "acceptedAtLogicalMs",
      "effectiveAtLogicalMs",
      "status",
    ],
    "record state",
  );
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1)
    throw new TrustValidationError("record state schema is invalid");
  const record = validateEvidenceRecordV1(input.record);
  const kind = recordKind(record),
    id = recordId(record),
    digest = digestEvidenceRecordV1(record);
  if (
    input.recordKind !== kind ||
    input.recordId !== id ||
    input.recordDigest !== digest
  )
    throw new TrustValidationError("record state does not bind record content");
  if (input.origin !== "local" && input.origin !== "verified_mesh")
    throw new TrustValidationError("record origin is invalid");
  requireDigest(input.originBindingDigest, "originBindingDigest");
  if (input.origin === "local") {
    if (
      input.originVerifierBindingDigest !== null ||
      input.originProofDigest !== null
    )
      throw new TrustValidationError("local origin metadata is invalid");
  } else {
    requireDigest(
      input.originVerifierBindingDigest,
      "originVerifierBindingDigest",
    );
    requireDigest(input.originProofDigest, "originProofDigest");
  }
  assertSafeInteger(input.acceptedAtLogicalMs, "acceptedAtLogicalMs");
  assertSafeInteger(input.effectiveAtLogicalMs, "effectiveAtLogicalMs");
  if (
    (input.effectiveAtLogicalMs as number) >
    (input.acceptedAtLogicalMs as number)
  )
    throw new TrustValidationError("record effective time follows acceptance");
  if (
    !(
      [
        "active",
        "pending",
        "retracted",
        "challenged",
        "conflicted",
        "unavailable",
      ] as string[]
    ).includes(input.status as string)
  )
    throw new TrustValidationError("record status is invalid");
  return deepFreeze({ ...input, record } as unknown as EvidenceRecordStateV1);
}

function resolutionBody(
  resolution: EvidenceContentResolutionV1,
): Record<string, unknown> {
  const { resolutionId: _id, resolutionDigest: _digest, ...body } = resolution;
  return body;
}
export function validateEvidenceContentResolutionV1(
  value: unknown,
): EvidenceContentResolutionV1 {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "resolutionId",
      "resolutionDigest",
      "claimId",
      "claimDigest",
      "scopeDigest",
      "referenceId",
      "referenceDigest",
      "contentDigest",
      "mediaType",
      "encodedBytes",
      "result",
      "resolverBindingDigest",
      "resolvedAtLogicalMs",
    ],
    "content resolution",
  );
  const resolution = value as Record<string, unknown>;
  if (resolution.schemaVersion !== 1)
    throw new TrustValidationError("content resolution schema is invalid");
  assertIdentifier(resolution.claimId, "claimId");
  for (const key of [
    "claimDigest",
    "scopeDigest",
    "contentDigest",
    "resolverBindingDigest",
  ] as const)
    requireDigest(resolution[key], key);
  assertIdentifier(resolution.referenceId, "referenceId");
  assertToken(resolution.mediaType, "mediaType");
  assertSafeInteger(resolution.encodedBytes, "encodedBytes");
  assertSafeInteger(resolution.resolvedAtLogicalMs, "resolvedAtLogicalMs");
  if (
    !(["verified", "unavailable", "mismatched"] as string[]).includes(
      resolution.result as string,
    )
  )
    throw new TrustValidationError("content resolution result is invalid");
  const candidate = resolution as unknown as EvidenceContentResolutionV1;
  const digest = digestTrustJsonV1(
    "content-resolution",
    resolutionBody(candidate) as JsonValue,
  );
  if (
    candidate.resolutionDigest !== digest ||
    candidate.resolutionId !== `content-resolution:${digest}`
  )
    throw new TrustValidationError("content resolution digest is invalid");
  return deepFreeze(structuredClone(candidate));
}
function invalidationBody(
  invalidation: EvidenceContentResolutionInvalidationV1,
): Record<string, unknown> {
  const { invalidationId: _id, ...body } = invalidation;
  return body;
}
export function validateEvidenceContentResolutionInvalidationV1(
  value: unknown,
): EvidenceContentResolutionInvalidationV1 {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "invalidationId",
      "resolutionId",
      "resolutionDigest",
      "resolverBindingDigest",
      "invalidatedAtLogicalMs",
      "reasonCode",
    ],
    "content invalidation",
  );
  const invalidation = value as Record<string, unknown>;
  if (invalidation.schemaVersion !== 1)
    throw new TrustValidationError("content invalidation schema is invalid");
  assertIdentifier(invalidation.resolutionId, "resolutionId");
  requireDigest(invalidation.resolutionDigest, "resolutionDigest");
  requireDigest(invalidation.resolverBindingDigest, "resolverBindingDigest");
  assertSafeInteger(
    invalidation.invalidatedAtLogicalMs,
    "invalidatedAtLogicalMs",
  );
  validateReasonCodeV1(invalidation.reasonCode);
  const candidate =
    invalidation as unknown as EvidenceContentResolutionInvalidationV1;
  const digest = digestTrustJsonV1(
    "content-resolution-invalidation",
    invalidationBody(candidate) as JsonValue,
  );
  if (candidate.invalidationId !== `content-resolution-invalidation:${digest}`)
    throw new TrustValidationError("content invalidation digest is invalid");
  return deepFreeze(structuredClone(candidate));
}

function diagnostic(
  record: EvidenceRecordStateV1,
  reasonCode: TrustReasonCodeV1,
): EvidenceTrustDiagnosticV1 {
  return {
    schemaVersion: 1,
    recordId: record.recordId,
    recordDigest: record.recordDigest,
    reasonCode,
  };
}
function findExact(
  records: readonly EvidenceRecordStateV1[],
  id: string,
  digest: string,
): EvidenceRecordStateV1 | undefined {
  return records.find(
    (item) => item.recordId === id && item.recordDigest === digest,
  );
}
/** Policy-neutral content projection. Fusion decides whether an unavailable result matters. */
export function projectEvidenceContentStatusV1(
  record: EvidenceRecordStateV1,
  resolutions: readonly EvidenceContentResolutionV1[],
  invalidations: readonly EvidenceContentResolutionInvalidationV1[],
  currentBinding: string | null | undefined,
): EvidenceContentProjectionStatusV1 {
  if (record.recordKind !== "claim" || !("content" in record.record))
    return "not_required";
  const content = record.record.content;
  if (!content || content.kind !== "reference") return "not_required";
  const exact = resolutions.filter(
    (resolution) =>
      resolution.claimId === record.recordId &&
      resolution.claimDigest === record.recordDigest &&
      resolution.scopeDigest === recordScopeDigest(record.record) &&
      resolution.referenceId === content.reference.referenceId &&
      resolution.referenceDigest === content.reference.referenceDigest &&
      resolution.contentDigest === content.contentDigest &&
      resolution.mediaType === content.mediaType &&
      resolution.encodedBytes === content.encodedBytes,
  );
  const verified = exact.filter(
    (resolution) => resolution.result === "verified",
  );
  if (
    verified.some(
      (resolution) =>
        currentBinding === resolution.resolverBindingDigest &&
        !invalidations.some(
          (invalidation) =>
            invalidation.resolutionId === resolution.resolutionId &&
            invalidation.resolutionDigest === resolution.resolutionDigest &&
            invalidation.resolverBindingDigest ===
              resolution.resolverBindingDigest,
        ),
    )
  )
    return "verified";
  if (verified.length > 0) return "stale";
  if (exact.some((resolution) => resolution.result === "mismatched"))
    return "mismatched";
  return "unavailable";
}
function targetStatus(
  record: EvidenceRecordStateV1,
  records: readonly EvidenceRecordStateV1[],
): TrustReasonCodeV1 | null {
  const target = targetOf(record.record);
  if (!target) return null;
  const found = findExact(records, target.id, target.digest);
  if (!found) return "relationship_target_missing";
  if (
    found.recordKind !== target.kind ||
    recordScopeDigest(found.record) !== recordScopeDigest(record.record)
  )
    return "scope_mismatch";
  if (
    record.recordKind === "retraction" &&
    recordSource(found.record) !== recordSource(record.record)
  )
    return "claim_subject_authority_invalid";
  return null;
}
function effect(
  kind: EvidenceTrustEffectV1["kind"],
  record: EvidenceRecordStateV1 | null,
  reasonCode: TrustReasonCodeV1,
): EvidenceTrustEffectV1 {
  return {
    schemaVersion: 1,
    kind,
    recordId: record?.recordId ?? null,
    recordDigest: record?.recordDigest ?? null,
    reasonCode,
  };
}
function ordered<
  T extends {
    recordDigest?: string;
    resolutionDigest?: string;
    invalidationId?: string;
  },
>(values: readonly T[]): T[] {
  return [...values].sort((a, b) =>
    compareUnicode(
      a.recordDigest ?? a.resolutionDigest ?? a.invalidationId ?? "",
      b.recordDigest ?? b.resolutionDigest ?? b.invalidationId ?? "",
    ),
  );
}

/** Re-derives all lifecycle status; no clocks, I/O, or mutable global state are read. */
export function projectEvidenceLifecycleV1(input: {
  readonly records: readonly EvidenceRecordStateV1[];
  readonly logicalTimeMs: number;
  readonly limits: EvidenceTrustStateV1["limits"];
  readonly contentResolutions: readonly EvidenceContentResolutionV1[];
  readonly contentInvalidations: readonly EvidenceContentResolutionInvalidationV1[];
  readonly currentContentResolverBindingDigest?: string | null;
}): {
  records: EvidenceRecordStateV1[];
  diagnostics: EvidenceTrustDiagnosticV1[];
} {
  const records = ordered(input.records);
  const recordKey = (recordId: string, recordDigest: string): string =>
    `${recordId}\u0000${recordDigest}`;
  const byId = new Map(
    records.map((record) => [
      recordKey(record.recordId, record.recordDigest),
      record,
    ]),
  );
  const relations = new Map<string, number>();
  for (const record of records) {
    const key = `${record.recordKind}:${relationDigest(record.record)}`;
    relations.set(key, (relations.get(key) ?? 0) + 1);
  }

  type Result = {
    readonly status: EvidenceRecordStatusV1;
    readonly reason: TrustReasonCodeV1;
    readonly resolvedAt: number;
    readonly maximumBasisDepth: number;
  };
  const evaluateAll = (
    retracted: ReadonlySet<string>,
    challenged: ReadonlySet<string>,
  ): ReadonlyMap<string, Result> => {
    const memo = new Map<string, Result>();
    const evaluate = (
      record: EvidenceRecordStateV1,
      remainingBasisDepth: number,
      path: ReadonlySet<string>,
    ): Result => {
      const memoKey = `${record.recordDigest}\u0000${remainingBasisDepth}`;
      const cached = memo.get(memoKey);
      if (cached) return cached;
      const result = derive(record, remainingBasisDepth, path);
      memo.set(memoKey, result);
      return result;
    };
    const derive = (
      record: EvidenceRecordStateV1,
      remainingBasisDepth: number,
      path: ReadonlySet<string>,
    ): Result => {
      const unavailable = (
        reason: TrustReasonCodeV1,
        resolvedAt = record.acceptedAtLogicalMs,
        maximumBasisDepth = 0,
      ): Result => ({
        status: "unavailable",
        reason,
        resolvedAt,
        maximumBasisDepth,
      });
      if (
        (relations.get(
          `${record.recordKind}:${relationDigest(record.record)}`,
        ) ?? 0) > 1
      )
        return {
          status: "conflicted",
          reason: "relationship_conflict",
          resolvedAt: record.acceptedAtLogicalMs,
          maximumBasisDepth: 0,
        };
      let resolvedAt = record.acceptedAtLogicalMs;
      let maximumBasisDepth = 0;
      const pending = (): Result =>
        reachedPendingAge(
          input.logicalTimeMs,
          record.acceptedAtLogicalMs,
          input.limits.maximumPendingAgeMs,
        )
          ? unavailable("evidence_unavailable", resolvedAt, maximumBasisDepth)
          : {
              status: "pending",
              reason: "pending_target",
              resolvedAt,
              maximumBasisDepth,
            };

      const direct = targetOf(record.record);
      if (direct) {
        const target = byId.get(recordKey(direct.id, direct.digest));
        if (!target) return pending();
        if (
          target.recordKind !== direct.kind ||
          recordScopeDigest(target.record) !== recordScopeDigest(record.record)
        )
          return unavailable("scope_mismatch", resolvedAt, maximumBasisDepth);
        if (
          record.recordKind === "retraction" &&
          recordSource(target.record) !== recordSource(record.record)
        )
          return unavailable(
            "claim_subject_authority_invalid",
            resolvedAt,
            maximumBasisDepth,
          );

        // Direct relationship edges establish presence and causal timing. They
        // do not consume evidence-basis depth and Challenge/Retraction records
        // remain inspectable when their exact target is independently
        // ineffective, as required by policy-bound resolution and audit.
        if (path.has(target.recordDigest))
          return unavailable("evidence_cycle", resolvedAt, maximumBasisDepth);
        const targetResult = evaluate(
          target,
          remainingBasisDepth,
          new Set([...path, target.recordDigest]),
        );
        resolvedAt = Math.max(resolvedAt, targetResult.resolvedAt);
        if (targetResult.status === "pending") return pending();
        if (
          record.recordKind === "attestation" &&
          targetResult.status !== "active"
        )
          return unavailable(
            targetResult.reason === "evidence_cycle" ||
              targetResult.reason === "evidence_depth_exceeded" ||
              targetResult.reason === "scope_mismatch"
              ? targetResult.reason
              : "evidence_unavailable",
            resolvedAt,
            maximumBasisDepth,
          );
      }

      for (const reference of basisReferences(record.record)) {
        if (reference.kind !== "evidence") continue;
        const target = byId.get(
          recordKey(reference.referenceId, reference.referenceDigest),
        );
        if (!target) return pending();
        if (
          recordScopeDigest(target.record) !== recordScopeDigest(record.record)
        )
          return unavailable("scope_mismatch", resolvedAt, maximumBasisDepth);
        if (path.has(target.recordDigest))
          return unavailable("evidence_cycle", resolvedAt, maximumBasisDepth);
        if (remainingBasisDepth === 0)
          return unavailable(
            "evidence_depth_exceeded",
            resolvedAt,
            maximumBasisDepth + 1,
          );
        const targetResult = evaluate(
          target,
          remainingBasisDepth - 1,
          new Set([...path, target.recordDigest]),
        );
        resolvedAt = Math.max(resolvedAt, targetResult.resolvedAt);
        maximumBasisDepth = Math.max(
          maximumBasisDepth,
          1 + targetResult.maximumBasisDepth,
        );
        if (targetResult.status === "pending") return pending();
        if (
          targetResult.status !== "active" ||
          retracted.has(target.recordDigest) ||
          challenged.has(target.recordDigest)
        )
          return unavailable(
            record.recordKind === "challenge"
              ? "challenge_basis_unavailable"
              : targetResult.reason === "evidence_cycle" ||
                  targetResult.reason === "evidence_depth_exceeded" ||
                  targetResult.reason === "scope_mismatch"
                ? targetResult.reason
                : "evidence_unavailable",
            resolvedAt,
            maximumBasisDepth,
          );
      }
      if (
        reachedPendingAge(
          resolvedAt,
          record.acceptedAtLogicalMs,
          input.limits.maximumPendingAgeMs,
        )
      )
        return unavailable(
          "evidence_unavailable",
          resolvedAt,
          maximumBasisDepth,
        );
      return {
        status: "active",
        reason: "accepted",
        resolvedAt,
        maximumBasisDepth,
      };
    };
    return new Map(
      records.map((record) => [
        record.recordDigest,
        evaluate(
          record,
          input.limits.maximumRelationshipDepth,
          new Set([record.recordDigest]),
        ),
      ]),
    );
  };

  const base = evaluateAll(new Set(), new Set());
  const retracted = new Set(
    records
      .filter(
        (record) =>
          record.recordKind === "retraction" &&
          base.get(record.recordDigest)?.status === "active" &&
          base.get(targetOf(record.record)?.digest ?? "")?.status === "active",
      )
      .map((record) => targetOf(record.record)?.digest)
      .filter((digest): digest is string => digest !== undefined),
  );
  const afterRetractions = evaluateAll(retracted, new Set());
  const challengeCandidates = new Set(
    records
      .filter(
        (record) =>
          record.recordKind === "challenge" &&
          afterRetractions.get(record.recordDigest)?.status === "active",
      )
      .map((record) => record.recordDigest),
  );
  const candidateRecords = records.filter((record) =>
    challengeCandidates.has(record.recordDigest),
  );
  const targetDigests = [
    ...new Set(
      candidateRecords
        .map((record) => targetOf(record.record)?.digest)
        .filter((digest): digest is string => digest !== undefined),
    ),
  ].sort(compareUnicode);
  const targetIndex = new Map(
    targetDigests.map((recordDigest, index) => [recordDigest, index]),
  );
  const wordCount = Math.ceil(targetDigests.length / 32);
  const sensitiveMemo = new Map<string, Uint32Array>();
  const sensitiveVisiting = new Set<string>();
  const mergeBits = (target: Uint32Array, source: Uint32Array): void => {
    for (let index = 0; index < target.length; index += 1)
      target[index] = (target[index] | source[index]) >>> 0;
  };
  const setBit = (bits: Uint32Array, index: number): void => {
    bits[Math.floor(index / 32)] =
      (bits[Math.floor(index / 32)] | (1 << (index % 32))) >>> 0;
  };
  const hasBit = (bits: Uint32Array, index: number): boolean =>
    (bits[Math.floor(index / 32)] & (1 << (index % 32))) !== 0;
  const challengeSensitiveTargets = (
    record: EvidenceRecordStateV1,
  ): Uint32Array => {
    const cached = sensitiveMemo.get(record.recordDigest);
    if (cached) return cached;
    const bits = new Uint32Array(wordCount);
    if (sensitiveVisiting.has(record.recordDigest)) return bits;
    sensitiveVisiting.add(record.recordDigest);
    if (record.recordKind === "attestation") {
      const direct = targetOf(record.record);
      const target = direct
        ? byId.get(recordKey(direct.id, direct.digest))
        : undefined;
      if (target) mergeBits(bits, challengeSensitiveTargets(target));
    }
    for (const reference of basisReferences(record.record)) {
      if (reference.kind !== "evidence") continue;
      const index = targetIndex.get(reference.referenceDigest);
      if (index !== undefined) setBit(bits, index);
      const target = byId.get(
        recordKey(reference.referenceId, reference.referenceDigest),
      );
      if (target) mergeBits(bits, challengeSensitiveTargets(target));
    }
    sensitiveVisiting.delete(record.recordDigest);
    sensitiveMemo.set(record.recordDigest, bits);
    return bits;
  };
  const sensitiveByChallenge = candidateRecords.map((record) =>
    challengeSensitiveTargets(record),
  );
  const challengeTargetIndexes = candidateRecords.map((record) =>
    targetIndex.get(targetOf(record.record)!.digest)!,
  );
  const groupUnknown = new Uint32Array(targetDigests.length);
  for (const index of challengeTargetIndexes) groupUnknown[index] += 1;
  const groupHasActive = new Uint8Array(targetDigests.length);
  const challengeState = new Uint8Array(candidateRecords.length);
  const unresolvedGroups = new Uint32Array(candidateRecords.length);
  for (let challenge = 0; challenge < candidateRecords.length; challenge += 1)
    for (let group = 0; group < targetDigests.length; group += 1)
      if (hasBit(sensitiveByChallenge[challenge], group))
        unresolvedGroups[challenge] += 1;
  const queue: number[] = [];
  const assignChallenge = (index: number, state: 1 | 2): void => {
    if (challengeState[index] !== 0) return;
    challengeState[index] = state;
    queue.push(index);
  };
  for (let index = 0; index < candidateRecords.length; index += 1)
    if (unresolvedGroups[index] === 0) assignChallenge(index, 1);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const challenge = queue[cursor];
    const group = challengeTargetIndexes[challenge];
    groupUnknown[group] -= 1;
    if (challengeState[challenge] === 1 && groupHasActive[group] === 0) {
      groupHasActive[group] = 1;
      for (
        let dependent = 0;
        dependent < candidateRecords.length;
        dependent += 1
      )
        if (hasBit(sensitiveByChallenge[dependent], group))
          assignChallenge(dependent, 2);
    } else if (
      challengeState[challenge] === 2 &&
      groupHasActive[group] === 0 &&
      groupUnknown[group] === 0
    ) {
      for (
        let dependent = 0;
        dependent < candidateRecords.length;
        dependent += 1
      ) {
        if (!hasBit(sensitiveByChallenge[dependent], group)) continue;
        unresolvedGroups[dependent] -= 1;
        if (unresolvedGroups[dependent] === 0) assignChallenge(dependent, 1);
      }
    }
  }
  // State 1 is the well-founded lower fixed point. State 0 is an unresolved
  // recursive blocker cycle; state 2 is definitely blocked. Both are
  // unavailable and therefore cannot mark a target.
  const activeChallenges = new Set(
    candidateRecords
      .filter((_record, index) => challengeState[index] === 1)
      .map((record) => record.recordDigest),
  );
  const unresolvedChallengeDependencies = new Set(
    [...challengeCandidates].filter(
      (recordDigest) => !activeChallenges.has(recordDigest),
    ),
  );
  const challenged = new Set(
    records
      .filter((record) => activeChallenges.has(record.recordDigest))
      .map((record) => targetOf(record.record)?.digest)
      .filter((digest): digest is string => digest !== undefined),
  );
  const final = evaluateAll(retracted, challenged);
  if (
    [...activeChallenges].some(
      (recordDigest) => final.get(recordDigest)?.status !== "active",
    )
  )
    throw new TrustValidationError(
      "challenge projection disagrees with lifecycle closure",
    );
  const projected = records.map((record) => {
    const result = final.get(record.recordDigest)!;
    const status = unresolvedChallengeDependencies.has(record.recordDigest)
      ? "unavailable"
      : retracted.has(record.recordDigest)
        ? "retracted"
        : result.status !== "active"
          ? result.status
          : challenged.has(record.recordDigest)
            ? "challenged"
            : "active";
    const reason = unresolvedChallengeDependencies.has(record.recordDigest)
      ? "challenge_basis_unavailable"
      : status === "challenged"
        ? "challenge_unresolved"
        : status === "retracted"
          ? "evidence_unavailable"
          : result.reason;
    return { record: { ...record, status } as EvidenceRecordStateV1, reason };
  });
  return {
    records: projected.map((entry) => entry.record),
    diagnostics: projected.map((entry) =>
      diagnostic(entry.record, entry.reason),
    ),
  };
}

function stateEncodedBytes(
  state: Omit<EvidenceTrustStateV1, "encodedBytes">,
): number {
  return canonicalTrustJsonBytesV1(
    { ...state, encodedBytes: 0 } as unknown as JsonValue,
    { ...STATE_LIMITS, maximumBytes: state.limits.maximumStateCanonicalBytes },
  ).byteLength;
}
function validateInputShape(input: unknown): EvidenceTrustInputV1 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TrustValidationError("reducer input is invalid");
  const candidate = input as Record<string, unknown>;
  if (candidate.kind === "record_admitted")
    assertExactKeys(
      candidate,
      [
        "schemaVersion",
        "kind",
        "record",
        "origin",
        "originBindingDigest",
        "originVerifierBindingDigest",
        "originProofDigest",
        "effectiveAtLogicalMs",
        "logicalTimeMs",
      ],
      "record admission input",
    );
  else if (candidate.kind === "policy_registered")
    assertExactKeys(
      candidate,
      ["schemaVersion", "kind", "policy", "logicalTimeMs"],
      "policy registration input",
    );
  else if (candidate.kind === "dependency_binding_registered")
    assertExactKeys(
      candidate,
      ["schemaVersion", "kind", "binding", "logicalTimeMs"],
      "dependency binding registration input",
    );
  else if (candidate.kind === "causal_authorization_recorded")
    assertExactKeys(
      candidate,
      ["schemaVersion", "kind", "authorization", "logicalTimeMs"],
      "causal authorization input",
    );
  else if (candidate.kind === "fusion_evaluated")
    assertExactKeys(
      candidate,
      ["schemaVersion", "kind", "request", "logicalTimeMs"],
      "fusion evaluation input",
    );
  else if (candidate.kind === "content_resolution_recorded")
    assertExactKeys(
      candidate,
      ["schemaVersion", "kind", "resolution", "logicalTimeMs"],
      "content resolution input",
    );
  else if (candidate.kind === "content_resolution_invalidated")
    assertExactKeys(
      candidate,
      ["schemaVersion", "kind", "invalidation", "logicalTimeMs"],
      "content invalidation input",
    );
  else if (candidate.kind === "advance_logical_time")
    assertExactKeys(
      candidate,
      ["schemaVersion", "kind", "logicalTimeMs"],
      "logical time input",
    );
  else throw new TrustValidationError("reducer input kind is invalid");
  if (candidate.schemaVersion !== 1)
    throw new TrustValidationError("reducer input schema is invalid");
  assertSafeInteger(candidate.logicalTimeMs, "logicalTimeMs");
  if (candidate.kind === "record_admitted") {
    assertSafeInteger(candidate.effectiveAtLogicalMs, "effectiveAtLogicalMs");
    if (
      (candidate.effectiveAtLogicalMs as number) >
      (candidate.logicalTimeMs as number)
    )
      throw new TrustValidationError(
        "record effective time follows acceptance",
      );
  }
  return candidate as unknown as EvidenceTrustInputV1;
}

function normalizeReducerOptions(
  options: EvidenceTrustReducerOptionsV1,
): EvidenceTrustReducerOptionsV1 {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TrustValidationError("reducer options are invalid");
  assertExactKeys(
    options,
    [
      "verifiedMeshAdmissionVerifierRegistry",
      "currentContentResolverBindingDigest",
      "causalAuthorityVerifierRegistry",
    ].filter((key) => key in options),
    "reducer options",
  );
  const registry = options.verifiedMeshAdmissionVerifierRegistry;
  if (registry !== undefined) {
    assertExactKeys(registry, ["resolve"], "mesh admission verifier registry");
    if (typeof registry.resolve !== "function")
      throw new TrustValidationError(
        "mesh admission verifier registry is invalid",
      );
  }
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
  if (
    options.currentContentResolverBindingDigest !== undefined &&
    options.currentContentResolverBindingDigest !== null
  )
    assertTrustDigest(
      options.currentContentResolverBindingDigest,
      "currentContentResolverBindingDigest",
    );
  const checkedRegistry =
    registry as EvidenceTrustReducerOptionsV1["verifiedMeshAdmissionVerifierRegistry"];
  const checkedCausalRegistry =
    causalRegistry as EvidenceTrustReducerOptionsV1["causalAuthorityVerifierRegistry"];
  return Object.freeze({
    ...(checkedRegistry
      ? {
          verifiedMeshAdmissionVerifierRegistry: Object.freeze({
            resolve: checkedRegistry.resolve.bind(checkedRegistry),
          }),
        }
      : {}),
    ...(options.currentContentResolverBindingDigest !== undefined
      ? {
          currentContentResolverBindingDigest:
            options.currentContentResolverBindingDigest,
        }
      : {}),
    ...(options.causalAuthorityVerifierRegistry !== undefined
      ? {
          causalAuthorityVerifierRegistry: Object.freeze({
            resolve: checkedCausalRegistry!.resolve.bind(checkedCausalRegistry),
          }),
        }
      : {}),
  }) as unknown as EvidenceTrustReducerOptionsV1;
}

export function resolveVerifiedMeshAdmissionVerifierV1(
  registry: NonNullable<
    EvidenceTrustReducerOptionsV1["verifiedMeshAdmissionVerifierRegistry"]
  >,
  bindingDigest: string,
) {
  const verifier = registry.resolve(bindingDigest);
  if (verifier === null) return null;
  assertExactKeys(
    verifier,
    ["verifierBindingDigest", "upstreamBindingDigest", "verify"],
    "mesh admission verifier",
  );
  assertTrustDigest(verifier.verifierBindingDigest, "verifierBindingDigest");
  assertTrustDigest(verifier.upstreamBindingDigest, "upstreamBindingDigest");
  if (typeof verifier.verify !== "function")
    throw new TrustValidationError("mesh admission verifier is invalid");
  return Object.freeze({
    verifierBindingDigest: verifier.verifierBindingDigest,
    upstreamBindingDigest: verifier.upstreamBindingDigest,
    verify: verifier.verify.bind(verifier),
  });
}

export function resolveEvidenceCausalAuthorityVerifierV1(
  registry: NonNullable<
    EvidenceTrustReducerOptionsV1["causalAuthorityVerifierRegistry"]
  >,
  bindingDigest: string,
) {
  const verifier = registry.resolve(bindingDigest);
  if (verifier === null) return null;
  assertExactKeys(
    verifier,
    [
      "authorityBindingDigest",
      "policyDigest",
      "upstreamBindingDigest",
      "verify",
    ],
    "causal authority verifier",
  );
  assertTrustDigest(verifier.authorityBindingDigest, "authorityBindingDigest");
  assertTrustDigest(verifier.policyDigest, "policyDigest");
  assertTrustDigest(verifier.upstreamBindingDigest, "upstreamBindingDigest");
  if (typeof verifier.verify !== "function")
    throw new TrustValidationError("causal authority verifier is invalid");
  return Object.freeze({
    authorityBindingDigest: verifier.authorityBindingDigest,
    policyDigest: verifier.policyDigest,
    upstreamBindingDigest: verifier.upstreamBindingDigest,
    verify: verifier.verify.bind(verifier),
  });
}

export function reduceEvidenceTrustStateV1(
  stateValue: EvidenceTrustStateV1,
  inputValue: EvidenceTrustInputV1,
  options: EvidenceTrustReducerOptionsV1 = {},
): EvidenceTrustReducerResultV1 {
  const state = validateEvidenceTrustStateV1(stateValue),
    input = validateInputShape(inputValue),
    normalizedOptions = normalizeReducerOptions(options);
  if (state.causalAuthorizations.length > 0) {
    const registry = normalizedOptions.causalAuthorityVerifierRegistry;
    if (!registry)
      throw new TrustValidationError(
        "retained causal authority requires verifier registry",
      );
    for (const authorization of state.causalAuthorizations) {
      const binding = state.dependencyBindings.find(
        (item) => item.bindingDigest === authorization.authorityBindingDigest,
      );
      const verifier = resolveEvidenceCausalAuthorityVerifierV1(
        registry,
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
          "retained causal authority verification failed",
        );
    }
  }
  if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
    throw new TrustValidationError("logical time rollback");
  let records = [...state.records],
    resolutions = [...state.contentResolutions],
    invalidations = [...state.contentInvalidations],
    policies = [...state.policies],
    dependencyBindings = [...state.dependencyBindings],
    fusionDecisions = [...state.fusionDecisions],
    causalAuthorizations = [...state.causalAuthorizations];
  const effects: EvidenceTrustEffectV1[] = [];
  if (input.kind === "fusion_evaluated") {
    const decision = evaluateEvidenceFusionV1(
      state,
      input.request,
      input.logicalTimeMs,
    );
    const existing = fusionDecisions.find(
      (candidate) => candidate.fusionDecisionId === decision.fusionDecisionId,
    );
    if (existing) {
      if (existing.fusionDecisionDigest !== decision.fusionDecisionDigest)
        throw new TrustValidationError(
          "fusion decision ID conflicts with existing content",
        );
      effects.push(effect("fusion_evaluated", null, "duplicate"));
    } else {
      if (fusionDecisions.length >= state.limits.maximumRetainedFusionDecisions)
        throw new TrustValidationError("fusion decision capacity exceeded");
      fusionDecisions.push(decision);
      effects.push(effect("fusion_evaluated", null, "accepted"));
    }
  } else if (input.kind === "policy_registered") {
    const policy = validateEvidenceFusionPolicyV1(input.policy, state.limits);
    const policyDigest = digestEvidenceFusionPolicyV1(policy);
    const existing = policies.find(
      (candidate) =>
        candidate.policyId === policy.policyId &&
        candidate.policyVersion === policy.policyVersion,
    );
    if (existing) {
      if (digestEvidenceFusionPolicyV1(existing) !== policyDigest)
        throw new TrustValidationError(
          "policy version conflicts with existing content",
        );
      effects.push(effect("record_duplicate", null, "duplicate"));
    } else {
      if (policies.length >= state.limits.maximumPolicies)
        throw new TrustValidationError("policy capacity exceeded");
      if ((policy.policyVersion === 1) !== (policy.parentPolicyDigest === null))
        throw new TrustValidationError("policy lineage is invalid");
      if (policy.parentPolicyDigest !== null) {
        const parent = policies.find(
          (candidate) =>
            digestEvidenceFusionPolicyV1(candidate) ===
            policy.parentPolicyDigest,
        );
        if (
          !parent ||
          parent.policyId !== policy.policyId ||
          parent.policyVersion + 1 !== policy.policyVersion
        )
          throw new TrustValidationError("policy lineage is invalid");
      }
      policies.push(policy);
      effects.push(effect("policy_registered", null, "accepted"));
    }
  } else if (input.kind === "dependency_binding_registered") {
    const binding = validateEvidenceTrustDependencyBindingV1(input.binding);
    const existing = dependencyBindings.find(
      (candidate) =>
        candidate.bindingKind === binding.bindingKind &&
        candidate.bindingName === binding.bindingName &&
        candidate.bindingVersion === binding.bindingVersion,
    );
    if (existing) {
      if (existing.bindingDigest !== binding.bindingDigest)
        throw new TrustValidationError(
          "dependency binding version conflicts with existing content",
        );
      effects.push(effect("record_duplicate", null, "duplicate"));
    } else {
      if (
        dependencyBindings.length >=
        state.limits.maximumDependencyBindingVersions
      )
        throw new TrustValidationError("dependency binding capacity exceeded");
      if (binding.registeredAtLogicalMs !== input.logicalTimeMs)
        throw new TrustValidationError(
          "dependency binding registration time is invalid",
        );
      if (
        binding.policyDigest !== null &&
        !policies.some(
          (policy) =>
            digestEvidenceFusionPolicyV1(policy) === binding.policyDigest,
        )
      )
        throw new TrustValidationError(
          "dependency binding policy is unregistered",
        );
      if (
        (binding.bindingVersion === 1) !==
        (binding.parentBindingDigest === null)
      )
        throw new TrustValidationError("dependency binding lineage is invalid");
      if (binding.parentBindingDigest !== null) {
        const parent = dependencyBindings.find(
          (candidate) =>
            candidate.bindingDigest === binding.parentBindingDigest,
        );
        if (
          !parent ||
          parent.bindingKind !== binding.bindingKind ||
          parent.bindingName !== binding.bindingName ||
          parent.bindingVersion + 1 !== binding.bindingVersion
        )
          throw new TrustValidationError(
            "dependency binding lineage is invalid",
          );
      }
      if (
        binding.upstreamBindingDigest !== null &&
        !dependencyBindings.some(
          (candidate) =>
            candidate.bindingDigest === binding.upstreamBindingDigest,
        )
      )
        throw new TrustValidationError(
          "dependency binding upstream is unregistered",
        );
      dependencyBindings.push(binding);
      effects.push(effect("dependency_binding_registered", null, "accepted"));
    }
  } else if (input.kind === "causal_authorization_recorded") {
    const authorization = createEvidenceCausalAuthorizationV1({
      ...(input.authorization as Omit<
        EvidenceCausalAuthorizationV1,
        "authorizationId" | "authorizationDigest" | "authorizedAtLogicalMs"
      >),
      authorizedAtLogicalMs: input.logicalTimeMs,
    });
    const record = findExact(
      records,
      authorization.recordId,
      authorization.recordDigest,
    );
    const binding = dependencyBindings.find(
      (item) => item.bindingDigest === authorization.authorityBindingDigest,
    );
    const visibleHead = binding
      ? dependencyBindings
          .filter(
            (item) =>
              item.bindingKind === binding.bindingKind &&
              item.bindingName === binding.bindingName &&
              item.registeredAtLogicalMs <= input.logicalTimeMs,
          )
          .sort((left, right) => right.bindingVersion - left.bindingVersion)[0]
      : null;
    if (
      !record ||
      record.recordKind !== authorization.recordKind ||
      !binding ||
      binding.bindingKind !== "causal_authority" ||
      binding.policyDigest !== authorization.policyDigest ||
      binding.registeredAtLogicalMs > input.logicalTimeMs ||
      binding.validFromLogicalMs > input.logicalTimeMs ||
      (binding.validUntilLogicalMs !== null &&
        input.logicalTimeMs >= binding.validUntilLogicalMs) ||
      visibleHead?.bindingDigest !== binding.bindingDigest
    )
      throw new TrustValidationError("causal authorization binding is invalid");
    const registry = normalizedOptions.causalAuthorityVerifierRegistry;
    const verifier = registry
      ? resolveEvidenceCausalAuthorityVerifierV1(
          registry,
          authorization.authorityBindingDigest,
        )
      : null;
    if (
      !verifier ||
      verifier.authorityBindingDigest !==
        authorization.authorityBindingDigest ||
      verifier.policyDigest !== authorization.policyDigest ||
      verifier.upstreamBindingDigest !== binding.upstreamBindingDigest ||
      !verifier.verify(authorization)
    )
      throw new TrustValidationError("causal authorization proof is invalid");
    const existing = causalAuthorizations.find(
      (item) => item.authorizationId === authorization.authorizationId,
    );
    if (existing) {
      if (existing.authorizationDigest !== authorization.authorizationDigest)
        throw new TrustValidationError(
          "causal authorization ID conflicts with existing content",
        );
      effects.push(effect("causal_authorization_recorded", null, "duplicate"));
    } else {
      if (
        causalAuthorizations.length >= state.limits.maximumCausalAuthorizations
      )
        throw new TrustValidationError(
          "causal authorization capacity exceeded",
        );
      causalAuthorizations.push(authorization);
      effects.push(effect("causal_authorization_recorded", null, "accepted"));
    }
  } else if (input.kind === "record_admitted") {
    const record = validateEvidenceRecordV1(input.record),
      digest = digestEvidenceRecordV1(record),
      id = recordId(record);
    requireDigest(input.originBindingDigest, "originBindingDigest");
    if (input.origin !== "local" && input.origin !== "verified_mesh")
      throw new TrustValidationError("record origin is invalid");
    if (input.origin === "local") {
      if (
        input.originVerifierBindingDigest !== null ||
        input.originProofDigest !== null
      )
        throw new TrustValidationError("local origin metadata is invalid");
    } else {
      requireDigest(
        input.originVerifierBindingDigest,
        "originVerifierBindingDigest",
      );
      requireDigest(input.originProofDigest, "originProofDigest");
      const registry = normalizedOptions.verifiedMeshAdmissionVerifierRegistry;
      const originVerifierBindingDigest =
        input.originVerifierBindingDigest as string;
      const originProofDigest = input.originProofDigest as string;
      const verifier = registry
        ? resolveVerifiedMeshAdmissionVerifierV1(
            registry,
            originVerifierBindingDigest,
          )
        : null;
      if (
        !verifier ||
        verifier.verifierBindingDigest !== originVerifierBindingDigest ||
        verifier.upstreamBindingDigest !== input.originBindingDigest ||
        !verifier.verify({
          recordId: id,
          recordDigest: digest,
          originBindingDigest: input.originBindingDigest,
          originVerifierBindingDigest,
          originProofDigest,
          effectiveAtLogicalMs: input.effectiveAtLogicalMs,
        })
      )
        throw new TrustValidationError("verified mesh origin proof is invalid");
    }
    if (
      basisReferences(record).length >
      state.limits.maximumBasisReferencesPerRecord
    )
      throw new TrustValidationError("basis reference limit exceeded");
    if (
      recordKind(record) === "claim" &&
      "content" in record &&
      record.content !== null
    ) {
      const contentLimit =
        record.content.kind === "reference"
          ? state.limits.maximumContentReferenceBytes
          : state.limits.maximumInlineSummaryBytes;
      if (record.content.encodedBytes > contentLimit)
        throw new TrustValidationError("evidence content size limit exceeded");
    }
    if (
      canonicalTrustJsonBytesV1(record as unknown as JsonValue).byteLength >
      state.limits.maximumRecordCanonicalBytes
    )
      throw new TrustValidationError("record size limit exceeded");
    const existing = records.find((item) => item.recordId === id);
    if (existing) {
      if (existing.recordDigest !== digest)
        throw new TrustValidationError(
          "record ID conflicts with existing content",
        );
      effects.push(effect("record_duplicate", existing, "duplicate"));
    } else {
      const familyLimit = {
        claim: state.limits.maximumClaims,
        attestation: state.limits.maximumAttestations,
        challenge: state.limits.maximumChallenges,
        retraction: state.limits.maximumRetractions,
      }[recordKind(record)];
      if (
        records.filter((item) => item.recordKind === recordKind(record))
          .length >= familyLimit
      )
        throw new TrustValidationError("record family capacity exceeded");
      if (recordKind(record) === "challenge") {
        const scopeDigest = recordScopeDigest(record);
        const sourceChallenges = records.filter(
          (item) =>
            item.recordKind === "challenge" &&
            recordSource(item.record) === record.sourceId &&
            item.record.sourceKind === record.sourceKind &&
            recordScopeDigest(item.record) === scopeDigest,
        );
        if (
          sourceChallenges.length >=
          state.limits.maximumChallengesPerSourceScope
        )
          throw new TrustValidationError(
            "challenge source scope capacity exceeded",
          );
        if (
          targetStatus({ record } as EvidenceRecordStateV1, records) ===
            "relationship_target_missing" &&
          sourceChallenges.filter((item) => item.status === "pending").length >=
            state.limits.maximumPendingChallengesPerSourceScope
        )
          throw new TrustValidationError(
            "pending challenge source scope capacity exceeded",
          );
      }
      const admitted: EvidenceRecordStateV1 = {
        schemaVersion: 1,
        recordKind: recordKind(record),
        recordId: id,
        recordDigest: digest,
        record,
        origin: input.origin,
        originBindingDigest: input.originBindingDigest,
        originVerifierBindingDigest: input.originVerifierBindingDigest,
        originProofDigest: input.originProofDigest,
        acceptedAtLogicalMs: input.logicalTimeMs,
        effectiveAtLogicalMs: input.effectiveAtLogicalMs,
        status: "active",
      };
      records.push(admitted);
      effects.push(effect("record_accepted", admitted, "accepted"));
    }
  } else if (input.kind === "content_resolution_recorded") {
    const resolution = input.resolution as Record<string, unknown>;
    assertExactKeys(
      resolution,
      [
        "schemaVersion",
        "claimId",
        "claimDigest",
        "scopeDigest",
        "referenceId",
        "referenceDigest",
        "contentDigest",
        "mediaType",
        "encodedBytes",
        "result",
        "resolverBindingDigest",
      ],
      "content resolution input",
    );
    const body = { ...resolution, resolvedAtLogicalMs: input.logicalTimeMs };
    const digest = digestTrustJsonV1("content-resolution", body as JsonValue);
    const accepted = validateEvidenceContentResolutionV1({
      ...body,
      resolutionDigest: digest,
      resolutionId: `content-resolution:${digest}`,
    });
    const claim = findExact(records, accepted.claimId, accepted.claimDigest);
    if (
      !claim ||
      claim.recordKind !== "claim" ||
      recordScopeDigest(claim.record) !== accepted.scopeDigest
    )
      throw new TrustValidationError("content resolution target is invalid");
    const content = "content" in claim.record ? claim.record.content : null;
    if (
      !content ||
      content.kind !== "reference" ||
      content.reference.referenceId !== accepted.referenceId ||
      content.reference.referenceDigest !== accepted.referenceDigest ||
      content.contentDigest !== accepted.contentDigest ||
      content.mediaType !== accepted.mediaType ||
      content.encodedBytes !== accepted.encodedBytes
    )
      throw new TrustValidationError(
        "content resolution does not match claim descriptor",
      );
    if (
      accepted.result === "verified" &&
      normalizedOptions.currentContentResolverBindingDigest !==
        accepted.resolverBindingDigest
    )
      throw new TrustValidationError("content resolver binding is not current");
    if (
      !resolutions.some((item) => item.resolutionId === accepted.resolutionId)
    ) {
      if (resolutions.length >= state.limits.maximumContentResolutions)
        throw new TrustValidationError("content resolution capacity exceeded");
      resolutions.push(accepted);
      effects.push(effect("content_resolution_recorded", null, "accepted"));
    } else effects.push(effect("record_duplicate", null, "duplicate"));
  } else if (input.kind === "content_resolution_invalidated") {
    const invalidation = input.invalidation as Record<string, unknown>;
    assertExactKeys(
      invalidation,
      [
        "schemaVersion",
        "resolutionId",
        "resolutionDigest",
        "resolverBindingDigest",
        "reasonCode",
      ],
      "content invalidation input",
    );
    const body = {
      ...invalidation,
      invalidatedAtLogicalMs: input.logicalTimeMs,
    };
    const digest = digestTrustJsonV1(
      "content-resolution-invalidation",
      body as JsonValue,
    );
    const accepted = validateEvidenceContentResolutionInvalidationV1({
      ...body,
      invalidationId: `content-resolution-invalidation:${digest}`,
    });
    const resolution = resolutions.find(
      (item) =>
        item.resolutionId === accepted.resolutionId &&
        item.resolutionDigest === accepted.resolutionDigest,
    );
    if (
      !resolution ||
      resolution.resolverBindingDigest !== accepted.resolverBindingDigest
    )
      throw new TrustValidationError("content invalidation target is invalid");
    if (
      !invalidations.some(
        (item) => item.invalidationId === accepted.invalidationId,
      )
    ) {
      if (invalidations.length >= state.limits.maximumContentInvalidations)
        throw new TrustValidationError(
          "content invalidation capacity exceeded",
        );
      invalidations.push(accepted);
      effects.push(effect("content_invalidation_recorded", null, "accepted"));
    } else effects.push(effect("record_duplicate", null, "duplicate"));
  } else effects.push(effect("logical_time_advanced", null, "accepted"));
  const derived = projectEvidenceLifecycleV1({
    records,
    logicalTimeMs: input.logicalTimeMs,
    limits: state.limits,
    contentResolutions: resolutions,
    contentInvalidations: invalidations,
    currentContentResolverBindingDigest:
      normalizedOptions.currentContentResolverBindingDigest,
  });
  if (
    derived.records.filter((item) => item.status === "pending").length >
    state.limits.maximumPendingRecords
  )
    throw new TrustValidationError("pending record capacity exceeded");
  const statusReasons = new Map(
    derived.diagnostics.map((item) => [item.recordDigest, item.reasonCode]),
  );
  const finalizedEffects = effects.map((item) =>
    item.kind === "record_accepted" && item.recordDigest !== null
      ? {
          ...item,
          reasonCode: statusReasons.get(item.recordDigest) ?? item.reasonCode,
        }
      : item,
  );
  effects.splice(0, effects.length, ...finalizedEffects);
  for (const item of derived.records) {
    const before = state.records.find(
      (candidate) => candidate.recordDigest === item.recordDigest,
    );
    if (before && before.status !== item.status)
      effects.push(
        effect(
          "record_status_changed",
          item,
          statusReasons.get(item.recordDigest) ?? "evidence_unavailable",
        ),
      );
  }
  const nextBase = {
    ...state,
    logicalTimeHighWaterMs: input.logicalTimeMs,
    policies: policies.sort((a, b) =>
      compareUnicode(
        `${a.policyId}\u0000${String(a.policyVersion).padStart(16, "0")}\u0000${digestEvidenceFusionPolicyV1(a)}`,
        `${b.policyId}\u0000${String(b.policyVersion).padStart(16, "0")}\u0000${digestEvidenceFusionPolicyV1(b)}`,
      ),
    ),
    policyHeads: [
      ...[...policies]
        .reduce((heads, policy) => {
          const prior = heads.get(policy.policyId);
          if (!prior || prior.policyVersion < policy.policyVersion)
            heads.set(policy.policyId, {
              policyId: policy.policyId,
              policyVersion: policy.policyVersion,
              policyDigest: digestEvidenceFusionPolicyV1(policy),
            });
          return heads;
        }, new Map<string, EvidenceTrustStateV1["policyHeads"][number]>())
        .values(),
    ].sort((a, b) => compareUnicode(a.policyId, b.policyId)),
    dependencyBindings: dependencyBindings.sort((a, b) =>
      compareUnicode(
        `${a.bindingKind}\u0000${a.bindingName}\u0000${String(a.bindingVersion).padStart(16, "0")}\u0000${a.bindingDigest}`,
        `${b.bindingKind}\u0000${b.bindingName}\u0000${String(b.bindingVersion).padStart(16, "0")}\u0000${b.bindingDigest}`,
      ),
    ),
    dependencyBindingHeads: [
      ...[...dependencyBindings]
        .reduce((heads, binding) => {
          const key = `${binding.bindingKind}\u0000${binding.bindingName}`;
          const prior = heads.get(key);
          if (!prior || prior.bindingVersion < binding.bindingVersion)
            heads.set(key, dependencyBindingHeadV1(binding));
          return heads;
        }, new Map<string, EvidenceTrustStateV1["dependencyBindingHeads"][number]>())
        .values(),
    ].sort((a, b) =>
      compareUnicode(
        `${a.bindingKind}\u0000${a.bindingName}`,
        `${b.bindingKind}\u0000${b.bindingName}`,
      ),
    ),
    causalAuthorizations: causalAuthorizations.sort((a, b) =>
      compareUnicode(a.authorizationDigest, b.authorizationDigest),
    ),
    fusionDecisions: fusionDecisions.sort((a, b) =>
      compareUnicode(a.fusionDecisionDigest, b.fusionDecisionDigest),
    ),
    records: derived.records,
    contentResolutions: ordered(resolutions),
    contentInvalidations: ordered(invalidations),
    pendingRecords: derived.records
      .filter((item) => item.status === "pending")
      .map((item) => item.recordId)
      .sort(compareUnicode),
    diagnostics: derived.diagnostics.slice(0, state.limits.maximumDiagnostics),
    traceDigest: digestTrustJsonV1("trace", {
      previousTraceDigest: state.traceDigest,
      inputKind: input.kind,
      logicalTimeMs: input.logicalTimeMs,
      effects: effects
        .map((item) => ({
          kind: item.kind,
          recordDigest: item.recordDigest,
          reasonCode: item.reasonCode,
        }))
        .sort((a, b) =>
          compareUnicode(
            `${a.kind}:${a.recordDigest ?? ""}`,
            `${b.kind}:${b.recordDigest ?? ""}`,
          ),
        ),
    } as JsonValue),
  };
  const encodedBytes = stateEncodedBytes(nextBase);
  if (encodedBytes > state.limits.maximumStateCanonicalBytes)
    throw new TrustValidationError("state capacity exceeded");
  const next = validateEvidenceTrustStateV1({ ...nextBase, encodedBytes });
  return deepFreeze({
    state: next,
    effects: [...effects].sort((a, b) =>
      compareUnicode(
        `${a.kind}:${a.recordDigest ?? ""}`,
        `${b.kind}:${b.recordDigest ?? ""}`,
      ),
    ),
  });
}
