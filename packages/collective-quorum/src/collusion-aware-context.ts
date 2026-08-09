import {
  digestTrustJsonV1,
  type PeerCredibilityStateV1,
  validatePeerCredibilityStateV1,
} from "@agentplat/trust";
import type { JsonValue } from "@agentplat/core";

import { collectiveQuorumDigestV1 } from "./crypto.js";

export interface ContextClaimCandidateV1 {
  readonly candidateId: string;
  readonly claimDigest: string;
  readonly sourceId: string;
  readonly dependencyGroupId: string;
  readonly credibility: PeerCredibilityStateV1;
  readonly confidenceBasisPoints: number;
  readonly evidenceDigest: string;
  readonly observedAtLogicalMs: number;
}

export interface CollusionAwareContextPolicyV1 {
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly minimumIndependentGroups: number;
  readonly minimumAdmissionShareBasisPoints: number;
  readonly minimumLeadBasisPoints: number;
  readonly maximumGroupWeightBasisPoints: number;
  readonly maximumSourceAgeLogicalMs: number;
  readonly maximumCollusionPressureBasisPoints: number;
  readonly allowSafeActionWithoutConsensus: boolean;
  readonly safeActionDigest: string | null;
}

export interface CollusionAwareContextResolutionV1 {
  readonly schemaVersion: 1;
  readonly resolutionId: string;
  readonly scopeDigest: string;
  readonly subjectDigest: string;
  readonly policyDigest: string;
  readonly evaluatedAtLogicalMs: number;
  readonly disposition: "accepted" | "contested" | "insufficient" | "unsafe";
  readonly action: "admit" | "challenge" | "abstain" | "safe_action" | "quarantine";
  readonly selectedClaimDigest: string | null;
  readonly safeActionDigest: string | null;
  readonly admissionShareBasisPoints: number;
  readonly leadBasisPoints: number;
  readonly independentGroupCount: number;
  readonly collusionPressureBasisPoints: number;
  readonly includedCandidateIds: readonly string[];
  readonly excludedCandidateIds: readonly string[];
  readonly evidenceDigests: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly resolutionDigest: string;
}

export interface ContextSourceDependencyPortV1 {
  verify(input: {
    readonly scopeDigest: string;
    readonly sourceId: string;
    readonly dependencyGroupId: string;
    readonly credibilityStateDigest: string;
    readonly evidenceDigest: string;
    readonly evaluatedAtLogicalMs: number;
  }): Promise<boolean>;
}

export function createCollusionAwareContextPolicyV1(
  input: Omit<CollusionAwareContextPolicyV1, "policyDigest">,
): CollusionAwareContextPolicyV1 {
  const provisional = { ...input, policyDigest: "0".repeat(64) };
  validatePolicy(provisional);
  const body = Object.freeze(structuredClone(input));
  return Object.freeze({
    ...body,
    policyDigest: digestTrustJsonV1("policy", {
      domain: "collusion-aware-context-policy-v1",
      body,
    } as unknown as JsonValue),
  });
}

export function validateCollusionAwareContextPolicyV1(
  input: CollusionAwareContextPolicyV1,
): CollusionAwareContextPolicyV1 {
  validatePolicy(input);
  const { policyDigest, ...body } = input;
  const rebuilt = createCollusionAwareContextPolicyV1(body);
  if (rebuilt.policyDigest !== policyDigest)
    throw new TypeError("collusion-aware context policy digest is invalid");
  return rebuilt;
}

/**
 * Categorical robust fusion where correlated sources share a bounded budget.
 * It may explicitly challenge, abstain, or choose a pre-authorized safe action.
 */
export async function resolveCollusionAwareContextV1(input: {
  readonly scopeDigest: string;
  readonly subjectDigest: string;
  readonly candidates: readonly ContextClaimCandidateV1[];
  readonly policy: CollusionAwareContextPolicyV1;
  readonly dependencyEvidence: ContextSourceDependencyPortV1;
  readonly evaluatedAtLogicalMs: number;
  readonly crypto?: Crypto;
}): Promise<CollusionAwareContextResolutionV1> {
  validateInput(input);
  const policy = validateCollusionAwareContextPolicyV1(input.policy);
  const candidates = input.candidates.map((candidate) => Object.freeze(structuredClone(candidate)));
  const included: ContextClaimCandidateV1[] = [];
  const excluded: ContextClaimCandidateV1[] = [];
  const reasons = new Set<string>();
  for (const candidate of candidates) {
    const credibility = validatePeerCredibilityStateV1(candidate.credibility);
    const current =
      credibility.scopeDigest === input.scopeDigest &&
      credibility.subjectId === candidate.sourceId &&
      credibility.logicalTimeHighWaterMs <= input.evaluatedAtLogicalMs &&
      input.evaluatedAtLogicalMs - candidate.observedAtLogicalMs <= policy.maximumSourceAgeLogicalMs;
    if (!current) {
      excluded.push(candidate);
      reasons.add("context_source_stale_or_scope_mismatched");
    } else if (credibility.status === "quarantined") {
      excluded.push(candidate);
      reasons.add("context_source_quarantined");
    } else if (credibility.status === "unknown" || credibility.status === "recovering") {
      excluded.push(candidate);
      reasons.add("context_source_credibility_unavailable");
    } else if (!(await input.dependencyEvidence.verify({
      scopeDigest: input.scopeDigest,
      sourceId: candidate.sourceId,
      dependencyGroupId: candidate.dependencyGroupId,
      credibilityStateDigest: credibility.stateDigest,
      evidenceDigest: candidate.evidenceDigest,
      evaluatedAtLogicalMs: input.evaluatedAtLogicalMs,
    }))) {
      excluded.push(candidate);
      reasons.add("context_dependency_binding_unverified");
    } else included.push(candidate);
  }

  const byClaim = new Map<string, Map<string, number>>();
  const groups = new Set<string>();
  let totalWeight = 0;
  let maximumGroupWeight = 0;
  for (const candidate of included) {
    groups.add(candidate.dependencyGroupId);
    const groupWeight = Math.min(
      policy.maximumGroupWeightBasisPoints,
      Math.round(
        candidate.confidenceBasisPoints *
          candidate.credibility.scoreBasisPoints /
          10_000,
      ),
    );
    const claimGroups = byClaim.get(candidate.claimDigest) ?? new Map<string, number>();
    claimGroups.set(
      candidate.dependencyGroupId,
      Math.max(claimGroups.get(candidate.dependencyGroupId) ?? 0, groupWeight),
    );
    byClaim.set(candidate.claimDigest, claimGroups);
  }
  const scores = [...byClaim].map(([claimDigest, claimGroups]) => {
    const weight = [...claimGroups.values()].reduce((sum, value) => sum + value, 0);
    return { claimDigest, claimGroups, weight };
  }).sort((left, right) => right.weight - left.weight || left.claimDigest.localeCompare(right.claimDigest));
  const groupMaximums = new Map<string, number>();
  for (const score of scores)
    for (const [groupId, weight] of score.claimGroups)
      groupMaximums.set(groupId, Math.max(groupMaximums.get(groupId) ?? 0, weight));
  for (const weight of groupMaximums.values()) {
    totalWeight += weight;
    maximumGroupWeight = Math.max(maximumGroupWeight, weight);
  }
  const top = scores[0];
  const runner = scores[1];
  const admissionShareBasisPoints = !top || totalWeight === 0
    ? 0
    : clamp(Math.round(top.weight / totalWeight * 10_000));
  const leadBasisPoints = !top || totalWeight === 0
    ? 0
    : clamp(Math.round((top.weight - (runner?.weight ?? 0)) / totalWeight * 10_000));
  const groupConcentration = totalWeight === 0
    ? 10_000
    : clamp(Math.round(maximumGroupWeight / totalWeight * 10_000));
  const sourceCollusion = included.reduce(
    (maximum, candidate) => Math.max(maximum, candidate.credibility.collusionPressureBasisPoints),
    0,
  );
  const collusionPressureBasisPoints = Math.max(groupConcentration, sourceCollusion);
  const topIndependentGroups = top?.claimGroups.size ?? 0;
  const collusionUnsafe = collusionPressureBasisPoints > policy.maximumCollusionPressureBasisPoints;
  const sufficient =
    topIndependentGroups >= policy.minimumIndependentGroups &&
    admissionShareBasisPoints >= policy.minimumAdmissionShareBasisPoints &&
    leadBasisPoints >= policy.minimumLeadBasisPoints;

  let disposition: CollusionAwareContextResolutionV1["disposition"];
  let action: CollusionAwareContextResolutionV1["action"];
  let selectedClaimDigest: string | null = null;
  let safeActionDigest: string | null = null;
  if (collusionUnsafe) {
    disposition = "unsafe";
    action = "quarantine";
    reasons.add("context_collusion_pressure_exceeded");
  } else if (sufficient && top) {
    disposition = "accepted";
    action = "admit";
    selectedClaimDigest = top.claimDigest;
    reasons.add("context_independent_support_admitted");
  } else if (scores.length > 1 && groups.size >= policy.minimumIndependentGroups) {
    disposition = "contested";
    action = "challenge";
    reasons.add("context_claims_contested");
  } else if (policy.allowSafeActionWithoutConsensus && policy.safeActionDigest) {
    disposition = "insufficient";
    action = "safe_action";
    safeActionDigest = policy.safeActionDigest;
    reasons.add("context_safe_action_selected");
  } else {
    disposition = "insufficient";
    action = "abstain";
    reasons.add("context_independent_support_insufficient");
  }
  const body = {
    schemaVersion: 1 as const,
    scopeDigest: input.scopeDigest,
    subjectDigest: input.subjectDigest,
    policyDigest: policy.policyDigest,
    evaluatedAtLogicalMs: input.evaluatedAtLogicalMs,
    disposition,
    action,
    selectedClaimDigest,
    safeActionDigest,
    admissionShareBasisPoints,
    leadBasisPoints,
    independentGroupCount: topIndependentGroups,
    collusionPressureBasisPoints,
    includedCandidateIds: included.map((item) => item.candidateId).sort(),
    excludedCandidateIds: excluded.map((item) => item.candidateId).sort(),
    evidenceDigests: [...new Set(included.map((item) => item.evidenceDigest))].sort(),
    reasonCodes: [...reasons].sort(),
  };
  const resolutionDigest = await collectiveQuorumDigestV1(
    { domain: "collusion-aware-context-resolution", body },
    input.crypto,
  );
  return Object.freeze({
    ...body,
    resolutionId: `context-resolution:${resolutionDigest.slice(7, 47)}`,
    resolutionDigest,
  });
}

function validateInput(input: {
  readonly scopeDigest: string;
  readonly subjectDigest: string;
  readonly candidates: readonly ContextClaimCandidateV1[];
  readonly policy: CollusionAwareContextPolicyV1;
  readonly dependencyEvidence: ContextSourceDependencyPortV1;
  readonly evaluatedAtLogicalMs: number;
}): void {
  trustDigest(input.scopeDigest, "scopeDigest");
  trustDigest(input.subjectDigest, "subjectDigest");
  integer(input.evaluatedAtLogicalMs, "evaluatedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER);
  validateCollusionAwareContextPolicyV1(input.policy);
  if (!input.dependencyEvidence || typeof input.dependencyEvidence.verify !== "function")
    throw new TypeError("context dependency evidence port is required");
  if (input.candidates.length > 100_000) throw new RangeError("context candidate limit exceeded");
  const ids = new Set<string>();
  for (const candidate of input.candidates) {
    identifier(candidate.candidateId, "candidateId");
    if (ids.has(candidate.candidateId)) throw new TypeError("context candidate id is duplicated");
    ids.add(candidate.candidateId);
    quorumDigest(candidate.claimDigest, "claimDigest");
    identifier(candidate.sourceId, "sourceId");
    identifier(candidate.dependencyGroupId, "dependencyGroupId");
    bps(candidate.confidenceBasisPoints, "confidenceBasisPoints");
    trustDigest(candidate.evidenceDigest, "evidenceDigest");
    integer(candidate.observedAtLogicalMs, "observedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER);
    trustDigest(candidate.credibility.stateDigest, "credibility.stateDigest");
  }
}

function validatePolicy(policy: CollusionAwareContextPolicyV1): void {
  identifier(policy.policyId, "policyId");
  integer(policy.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  trustDigest(policy.policyDigest, "policyDigest");
  integer(policy.minimumIndependentGroups, "minimumIndependentGroups", 1, 10_000);
  bps(policy.minimumAdmissionShareBasisPoints, "minimumAdmissionShareBasisPoints");
  bps(policy.minimumLeadBasisPoints, "minimumLeadBasisPoints");
  bps(policy.maximumGroupWeightBasisPoints, "maximumGroupWeightBasisPoints");
  integer(policy.maximumSourceAgeLogicalMs, "maximumSourceAgeLogicalMs", 1, Number.MAX_SAFE_INTEGER);
  bps(policy.maximumCollusionPressureBasisPoints, "maximumCollusionPressureBasisPoints");
  if (policy.safeActionDigest !== null) quorumDigest(policy.safeActionDigest, "safeActionDigest");
  if (policy.allowSafeActionWithoutConsensus !== (policy.safeActionDigest !== null))
    throw new TypeError("safe action policy binding is invalid");
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value))
    throw new TypeError(`${label} is invalid`);
}

function trustDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    throw new TypeError(`${label} is invalid`);
}

function quorumDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    throw new TypeError(`${label} is invalid`);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new RangeError(`${label} is invalid`);
  return value as number;
}

function bps(value: unknown, label: string): number {
  return integer(value, label, 0, 10_000);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(value)));
}
