import type { JsonValue } from "@agentplat/core";

import { deepFreeze, digestTrustJsonV1, TrustValidationError } from "./canonical.js";

export type PeerCredibilityOutcomeV1 = "satisfied" | "violated" | "inconclusive";
export type PeerChallengeDispositionV1 = "none" | "dismissed" | "sustained" | "contested";

export interface PeerCredibilityObservationV1 {
  readonly schemaVersion: 1;
  readonly observationId: string;
  readonly scopeDigest: string;
  readonly subjectId: string;
  readonly sourceId: string;
  readonly dependencyGroupId: string;
  readonly criterionId: string;
  readonly outcome: PeerCredibilityOutcomeV1;
  readonly confidenceBasisPoints: number;
  readonly challengeDisposition: PeerChallengeDispositionV1;
  readonly evidenceDigest: string;
  readonly observedAtLogicalMs: number;
  readonly observationDigest: string;
}

export interface PeerSourceDependencyEdgeV1 {
  readonly schemaVersion: 1;
  readonly leftSourceId: string;
  readonly rightSourceId: string;
  readonly correlationBasisPoints: number;
  readonly basisDigest: string;
  readonly validFromLogicalMs: number;
  readonly validUntilLogicalMs: number | null;
  readonly edgeDigest: string;
}

export interface PeerCredibilityPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly evidenceHorizonLogicalMs: number;
  readonly maximumRetainedObservations: number;
  readonly maximumSources: number;
  readonly maximumDependencyEdges: number;
  readonly dependencyCorrelationThresholdBasisPoints: number;
  readonly maximumDependencyGroupWeightBasisPoints: number;
  readonly minimumIndependentGroups: number;
  readonly restrictedScoreAtOrBelowBasisPoints: number;
  readonly quarantineScoreAtOrBelowBasisPoints: number;
  readonly maximumUncertaintyBasisPoints: number;
  readonly maximumCollusionPressureBasisPoints: number;
  readonly recoveryScoreBasisPoints: number;
  readonly recoveryIndependentGroups: number;
  readonly policyDigest: string;
}

export type PeerCredibilityStatusV1 =
  | "unknown"
  | "eligible"
  | "restricted"
  | "quarantined"
  | "recovering";

export interface PeerCredibilityStateV1 {
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly scopeDigest: string;
  readonly subjectId: string;
  readonly policyDigest: string;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly scoreBasisPoints: number;
  readonly uncertaintyBasisPoints: number;
  readonly collusionPressureBasisPoints: number;
  readonly independentGroupCount: number;
  readonly effectiveEvidenceWeightBasisPoints: number;
  readonly status: PeerCredibilityStatusV1;
  readonly observations: readonly PeerCredibilityObservationV1[];
  readonly dependencyEdgeDigests: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly stateDigest: string;
}

export interface PeerCredibilityStateStoreV1 {
  load(stateKey: string): Promise<PeerCredibilityStateV1 | null>;
  save(state: PeerCredibilityStateV1, expectedRevision: number | null): Promise<boolean>;
}

export class InMemoryPeerCredibilityStateStoreV1 implements PeerCredibilityStateStoreV1 {
  readonly #states = new Map<string, PeerCredibilityStateV1>();

  async load(stateKey: string): Promise<PeerCredibilityStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state ? deepFreeze(structuredClone(state)) : null;
  }

  async save(state: PeerCredibilityStateV1, expectedRevision: number | null): Promise<boolean> {
    const current = this.#states.get(state.stateKey);
    if (
      (expectedRevision === null && (current !== undefined || state.revision !== 1)) ||
      (expectedRevision !== null &&
        (!current || current.revision !== expectedRevision || state.revision !== expectedRevision + 1))
    ) return false;
    this.#states.set(state.stateKey, deepFreeze(structuredClone(state)));
    return true;
  }
}

export interface PeerCredibilityRuntimeOptionsV1 {
  readonly policy: PeerCredibilityPolicyV1;
  readonly store?: PeerCredibilityStateStoreV1;
  readonly maximumCommitAttempts?: number;
}

/**
 * Scope-local longitudinal credibility. It deliberately does not create a
 * portable or global reputation score and caps correlated sources as one group.
 */
export class PeerCredibilityRuntimeV1 {
  readonly policy: PeerCredibilityPolicyV1;
  readonly store: PeerCredibilityStateStoreV1;
  readonly maximumCommitAttempts: number;

  constructor(options: PeerCredibilityRuntimeOptionsV1) {
    this.policy = validatePeerCredibilityPolicyV1(options.policy);
    this.store = options.store ?? new InMemoryPeerCredibilityStateStoreV1();
    this.maximumCommitAttempts = integer(options.maximumCommitAttempts ?? 4, "maximumCommitAttempts", 1, 32);
  }

  async observe(input: {
    readonly scopeDigest: string;
    readonly subjectId: string;
    readonly observation: PeerCredibilityObservationV1;
    readonly dependencyEdges: readonly PeerSourceDependencyEdgeV1[];
    readonly evaluatedAtLogicalMs: number;
  }): Promise<PeerCredibilityStateV1> {
    const observation = validatePeerCredibilityObservationV1(input.observation);
    digest(input.scopeDigest, "scopeDigest");
    identifier(input.subjectId, "subjectId");
    integer(input.evaluatedAtLogicalMs, "evaluatedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER);
    if (observation.scopeDigest !== input.scopeDigest || observation.subjectId !== input.subjectId)
      fail("peer credibility observation scope mismatch");
    const edges = input.dependencyEdges.map(validatePeerSourceDependencyEdgeV1);
    if (edges.length > this.policy.maximumDependencyEdges)
      fail("peer credibility dependency edge capacity exceeded");
    const stateKey = peerCredibilityStateKeyV1(input.scopeDigest, input.subjectId, this.policy.policyDigest);

    for (let attempt = 0; attempt < this.maximumCommitAttempts; attempt += 1) {
      const current = await this.store.load(stateKey);
      if (current && input.evaluatedAtLogicalMs < current.logicalTimeHighWaterMs)
        fail("peer credibility logical time rollback");
      if (current?.observations.some((item) => item.observationId === observation.observationId)) {
        const retained = current.observations.find((item) => item.observationId === observation.observationId);
        if (retained?.observationDigest !== observation.observationDigest)
          fail("peer credibility observation equivocation");
        return current;
      }
      const horizonStart = Math.max(0, input.evaluatedAtLogicalMs - this.policy.evidenceHorizonLogicalMs);
      const observations = [...(current?.observations ?? []), observation]
        .filter((item) => item.observedAtLogicalMs >= horizonStart && item.observedAtLogicalMs <= input.evaluatedAtLogicalMs)
        .sort((left, right) =>
          left.observedAtLogicalMs - right.observedAtLogicalMs || left.observationId.localeCompare(right.observationId),
        )
        .slice(-this.policy.maximumRetainedObservations);
      if (new Set(observations.map((item) => item.sourceId)).size > this.policy.maximumSources)
        fail("peer credibility source capacity exceeded");
      const projected = evaluatePeerCredibilityV1({
        policy: this.policy,
        priorStatus: current?.status ?? "unknown",
        scopeDigest: input.scopeDigest,
        subjectId: input.subjectId,
        observations,
        dependencyEdges: edges,
        evaluatedAtLogicalMs: input.evaluatedAtLogicalMs,
        revision: (current?.revision ?? 0) + 1,
      });
      if (await this.store.save(projected, current?.revision ?? null)) return projected;
    }
    fail("peer credibility commit attempts exhausted");
  }
}

export function createPeerCredibilityPolicyV1(
  input: Omit<PeerCredibilityPolicyV1, "policyDigest">,
): PeerCredibilityPolicyV1 {
  validatePolicyBody(input);
  const body = deepFreeze(structuredClone(input));
  return deepFreeze({
    ...body,
    policyDigest: digestTrustJsonV1("policy", body as unknown as JsonValue),
  });
}

export function validatePeerCredibilityPolicyV1(
  input: PeerCredibilityPolicyV1,
): PeerCredibilityPolicyV1 {
  const { policyDigest, ...body } = input;
  digest(policyDigest, "policyDigest");
  const rebuilt = createPeerCredibilityPolicyV1(body);
  if (rebuilt.policyDigest !== policyDigest) fail("peer credibility policy digest mismatch");
  return rebuilt;
}

export function createPeerCredibilityObservationV1(
  input: Omit<PeerCredibilityObservationV1, "observationDigest">,
): PeerCredibilityObservationV1 {
  validateObservationBody(input);
  const body = deepFreeze(structuredClone(input));
  return deepFreeze({
    ...body,
    observationDigest: digestTrustJsonV1("observation", body as unknown as JsonValue),
  });
}

export function validatePeerCredibilityObservationV1(
  input: PeerCredibilityObservationV1,
): PeerCredibilityObservationV1 {
  const { observationDigest, ...body } = input;
  digest(observationDigest, "observationDigest");
  const rebuilt = createPeerCredibilityObservationV1(body);
  if (rebuilt.observationDigest !== observationDigest)
    fail("peer credibility observation digest mismatch");
  return rebuilt;
}

export function createPeerSourceDependencyEdgeV1(
  input: Omit<PeerSourceDependencyEdgeV1, "edgeDigest">,
): PeerSourceDependencyEdgeV1 {
  validateEdgeBody(input);
  const normalized = input.leftSourceId < input.rightSourceId
    ? input
    : { ...input, leftSourceId: input.rightSourceId, rightSourceId: input.leftSourceId };
  const body = deepFreeze(structuredClone(normalized));
  return deepFreeze({
    ...body,
    edgeDigest: digestTrustJsonV1("dependency-binding", body as unknown as JsonValue),
  });
}

export function validatePeerSourceDependencyEdgeV1(
  input: PeerSourceDependencyEdgeV1,
): PeerSourceDependencyEdgeV1 {
  const { edgeDigest, ...body } = input;
  digest(edgeDigest, "edgeDigest");
  const rebuilt = createPeerSourceDependencyEdgeV1(body);
  if (rebuilt.edgeDigest !== edgeDigest) fail("peer dependency edge digest mismatch");
  return rebuilt;
}

export function evaluatePeerCredibilityV1(input: {
  readonly policy: PeerCredibilityPolicyV1;
  readonly priorStatus: PeerCredibilityStatusV1;
  readonly scopeDigest: string;
  readonly subjectId: string;
  readonly observations: readonly PeerCredibilityObservationV1[];
  readonly dependencyEdges: readonly PeerSourceDependencyEdgeV1[];
  readonly evaluatedAtLogicalMs: number;
  readonly revision: number;
}): PeerCredibilityStateV1 {
  const policy = validatePeerCredibilityPolicyV1(input.policy);
  const observations = input.observations.map(validatePeerCredibilityObservationV1);
  const activeEdges = input.dependencyEdges
    .map(validatePeerSourceDependencyEdgeV1)
    .filter((edge) =>
      edge.correlationBasisPoints >= policy.dependencyCorrelationThresholdBasisPoints &&
      edge.validFromLogicalMs <= input.evaluatedAtLogicalMs &&
      (edge.validUntilLogicalMs === null || input.evaluatedAtLogicalMs < edge.validUntilLogicalMs),
    )
    .sort((left, right) => left.edgeDigest.localeCompare(right.edgeDigest));
  const sources = [...new Set(observations.map((item) => item.sourceId))].sort();
  const groups = correlatedGroups(sources, observations, activeEdges);
  const evidenceByGroup = new Map<string, { weighted: number; value: number; sources: Set<string>; supportiveSources: Set<string> }>();
  const reasons = new Set<string>();
  for (const observation of observations) {
    if (observation.outcome === "inconclusive" || observation.challengeDisposition === "sustained") {
      if (observation.challengeDisposition === "sustained") reasons.add("sustained_challenge_excluded");
      continue;
    }
    const age = input.evaluatedAtLogicalMs - observation.observedAtLogicalMs;
    if (age < 0 || age > policy.evidenceHorizonLogicalMs) continue;
    const freshness = Math.max(0, policy.evidenceHorizonLogicalMs - age) / policy.evidenceHorizonLogicalMs;
    const challengeFactor = observation.challengeDisposition === "contested" ? 0.5 : 1;
    const weight = observation.confidenceBasisPoints * freshness * challengeFactor;
    const value = observation.outcome === "satisfied" ? 10_000 : 0;
    const groupId = groups.get(observation.sourceId) ?? `source:${observation.sourceId}`;
    const bucket = evidenceByGroup.get(groupId) ?? {
      weighted: 0,
      value: 0,
      sources: new Set<string>(),
      supportiveSources: new Set<string>(),
    };
    bucket.weighted += weight;
    bucket.value += weight * value;
    bucket.sources.add(observation.sourceId);
    if (observation.outcome === "satisfied") bucket.supportiveSources.add(observation.sourceId);
    evidenceByGroup.set(groupId, bucket);
  }
  let totalWeight = 0;
  let totalValue = 0;
  let largestGroupWeight = 0;
  let largestAlignedSupportWeight = 0;
  for (const bucket of evidenceByGroup.values()) {
    const capped = Math.min(bucket.weighted, policy.maximumDependencyGroupWeightBasisPoints);
    const groupMean = bucket.weighted === 0 ? 0 : bucket.value / bucket.weighted;
    totalWeight += capped;
    totalValue += capped * groupMean;
    largestGroupWeight = Math.max(largestGroupWeight, capped);
    if (bucket.supportiveSources.size > 1)
      largestAlignedSupportWeight = Math.max(largestAlignedSupportWeight, capped);
  }
  const independentGroupCount = evidenceByGroup.size;
  const scoreBasisPoints = totalWeight === 0 ? 0 : clampBps(totalValue / totalWeight);
  const coverage = Math.min(10_000, Math.round(totalWeight / Math.max(1, policy.minimumIndependentGroups)));
  const groupShortfall = independentGroupCount >= policy.minimumIndependentGroups
    ? 0
    : Math.round((policy.minimumIndependentGroups - independentGroupCount) / policy.minimumIndependentGroups * 10_000);
  const uncertaintyBasisPoints = clampBps(Math.max(10_000 - coverage, groupShortfall));
  const concentration = totalWeight === 0 ? 10_000 : Math.round(largestGroupWeight / totalWeight * 10_000);
  const alignedCorrelation = totalWeight === 0 ? 0 : Math.round(largestAlignedSupportWeight / totalWeight * 10_000);
  const collusionPressureBasisPoints = clampBps(Math.max(concentration, alignedCorrelation));
  if (independentGroupCount < policy.minimumIndependentGroups) reasons.add("independent_evidence_insufficient");
  if (collusionPressureBasisPoints > policy.maximumCollusionPressureBasisPoints)
    reasons.add("correlated_support_concentration");
  if (uncertaintyBasisPoints > policy.maximumUncertaintyBasisPoints)
    reasons.add("credibility_uncertainty_above_threshold");
  const status = credibilityStatus({
    priorStatus: input.priorStatus,
    scoreBasisPoints,
    uncertaintyBasisPoints,
    collusionPressureBasisPoints,
    independentGroupCount,
    policy,
  });
  if (status === "quarantined") reasons.add("peer_quarantine_required");
  else if (status === "restricted") reasons.add("peer_restriction_required");
  else if (status === "recovering") reasons.add("peer_recovery_in_progress");
  else if (status === "eligible") reasons.add("peer_credibility_supported");
  else reasons.add("peer_credibility_unknown");
  const stateBody = {
    schemaVersion: 1 as const,
    stateKey: peerCredibilityStateKeyV1(input.scopeDigest, input.subjectId, policy.policyDigest),
    scopeDigest: input.scopeDigest,
    subjectId: input.subjectId,
    policyDigest: policy.policyDigest,
    revision: input.revision,
    logicalTimeHighWaterMs: input.evaluatedAtLogicalMs,
    scoreBasisPoints,
    uncertaintyBasisPoints,
    collusionPressureBasisPoints,
    independentGroupCount,
    effectiveEvidenceWeightBasisPoints: clampBps(totalWeight),
    status,
    observations: [...observations].sort((left, right) =>
      left.observedAtLogicalMs - right.observedAtLogicalMs || left.observationId.localeCompare(right.observationId),
    ),
    dependencyEdgeDigests: activeEdges.map((item) => item.edgeDigest),
    reasonCodes: [...reasons].sort(),
  };
  return deepFreeze({
    ...stateBody,
    stateDigest: digestTrustJsonV1("state", stateBody as unknown as JsonValue),
  });
}

export function peerCredibilityStateKeyV1(
  scopeDigest: string,
  subjectId: string,
  policyDigest: string,
): string {
  digest(scopeDigest, "scopeDigest");
  identifier(subjectId, "subjectId");
  digest(policyDigest, "policyDigest");
  return `peer-credibility:${scopeDigest}:${subjectId}:${policyDigest}`;
}

export function validatePeerCredibilityStateV1(
  input: PeerCredibilityStateV1,
): PeerCredibilityStateV1 {
  if (!input || input.schemaVersion !== 1) fail("peer credibility state schema invalid");
  digest(input.scopeDigest, "scopeDigest");
  identifier(input.subjectId, "subjectId");
  digest(input.policyDigest, "policyDigest");
  if (input.stateKey !== peerCredibilityStateKeyV1(input.scopeDigest, input.subjectId, input.policyDigest))
    fail("peer credibility state key invalid");
  integer(input.revision, "revision", 1, Number.MAX_SAFE_INTEGER);
  integer(input.logicalTimeHighWaterMs, "logicalTimeHighWaterMs", 0, Number.MAX_SAFE_INTEGER);
  bps(input.scoreBasisPoints, "scoreBasisPoints");
  bps(input.uncertaintyBasisPoints, "uncertaintyBasisPoints");
  bps(input.collusionPressureBasisPoints, "collusionPressureBasisPoints");
  integer(input.independentGroupCount, "independentGroupCount", 0, 100_000);
  bps(input.effectiveEvidenceWeightBasisPoints, "effectiveEvidenceWeightBasisPoints");
  if (!["unknown", "eligible", "restricted", "quarantined", "recovering"].includes(input.status))
    fail("peer credibility state status invalid");
  const observationIds = new Set<string>();
  let priorObservation: PeerCredibilityObservationV1 | null = null;
  for (const observationInput of input.observations) {
    const observation = validatePeerCredibilityObservationV1(observationInput);
    if (
      observationIds.has(observation.observationId) ||
      observation.scopeDigest !== input.scopeDigest ||
      observation.subjectId !== input.subjectId ||
      observation.observedAtLogicalMs > input.logicalTimeHighWaterMs ||
      (priorObservation !== null && (
        priorObservation.observedAtLogicalMs > observation.observedAtLogicalMs ||
        (priorObservation.observedAtLogicalMs === observation.observedAtLogicalMs && priorObservation.observationId > observation.observationId)
      ))
    ) fail("peer credibility state observation binding invalid");
    observationIds.add(observation.observationId);
    priorObservation = observation;
  }
  canonicalDigests(input.dependencyEdgeDigests, "dependencyEdgeDigests");
  canonicalIdentifiers(input.reasonCodes, "reasonCodes");
  const { stateDigest, ...body } = input;
  digest(stateDigest, "stateDigest");
  if (digestTrustJsonV1("state", body as unknown as JsonValue) !== stateDigest)
    fail("peer credibility state digest invalid");
  return deepFreeze(structuredClone(input));
}

function correlatedGroups(
  sources: readonly string[],
  observations: readonly PeerCredibilityObservationV1[],
  edges: readonly PeerSourceDependencyEdgeV1[],
): ReadonlyMap<string, string> {
  const parent = new Map(sources.map((source) => [source, source]));
  const find = (source: string): string => {
    const current = parent.get(source) ?? source;
    if (current === source) return source;
    const root = find(current);
    parent.set(source, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left), rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    parent.set(second, first);
  };
  for (const edge of edges) union(edge.leftSourceId, edge.rightSourceId);
  const sourceByDeclaredGroup = new Map<string, string>();
  for (const observation of observations) {
    const prior = sourceByDeclaredGroup.get(observation.dependencyGroupId);
    if (prior) union(prior, observation.sourceId);
    else sourceByDeclaredGroup.set(observation.dependencyGroupId, observation.sourceId);
  }
  return new Map(sources.map((source) => [source, `correlated:${find(source)}`]));
}

function credibilityStatus(input: {
  readonly priorStatus: PeerCredibilityStatusV1;
  readonly scoreBasisPoints: number;
  readonly uncertaintyBasisPoints: number;
  readonly collusionPressureBasisPoints: number;
  readonly independentGroupCount: number;
  readonly policy: PeerCredibilityPolicyV1;
}): PeerCredibilityStatusV1 {
  const { policy } = input;
  if (input.independentGroupCount === 0) return "unknown";
  if (
    input.scoreBasisPoints <= policy.quarantineScoreAtOrBelowBasisPoints ||
    input.collusionPressureBasisPoints > policy.maximumCollusionPressureBasisPoints
  ) return "quarantined";
  if (
    input.scoreBasisPoints <= policy.restrictedScoreAtOrBelowBasisPoints ||
    input.uncertaintyBasisPoints > policy.maximumUncertaintyBasisPoints ||
    input.independentGroupCount < policy.minimumIndependentGroups
  ) return "restricted";
  if (
    (input.priorStatus === "quarantined" || input.priorStatus === "restricted" || input.priorStatus === "recovering") &&
    (input.scoreBasisPoints < policy.recoveryScoreBasisPoints ||
      input.independentGroupCount < policy.recoveryIndependentGroups)
  ) return "recovering";
  return "eligible";
}

function validatePolicyBody(input: Omit<PeerCredibilityPolicyV1, "policyDigest">): void {
  if (input.schemaVersion !== 1) fail("peer credibility policy schema invalid");
  identifier(input.policyId, "policyId");
  integer(input.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  integer(input.evidenceHorizonLogicalMs, "evidenceHorizonLogicalMs", 1, Number.MAX_SAFE_INTEGER);
  integer(input.maximumRetainedObservations, "maximumRetainedObservations", 1, 100_000);
  integer(input.maximumSources, "maximumSources", 1, 100_000);
  integer(input.maximumDependencyEdges, "maximumDependencyEdges", 0, 1_000_000);
  bps(input.dependencyCorrelationThresholdBasisPoints, "dependencyCorrelationThresholdBasisPoints");
  bps(input.maximumDependencyGroupWeightBasisPoints, "maximumDependencyGroupWeightBasisPoints");
  integer(input.minimumIndependentGroups, "minimumIndependentGroups", 1, 10_000);
  bps(input.restrictedScoreAtOrBelowBasisPoints, "restrictedScoreAtOrBelowBasisPoints");
  bps(input.quarantineScoreAtOrBelowBasisPoints, "quarantineScoreAtOrBelowBasisPoints");
  bps(input.maximumUncertaintyBasisPoints, "maximumUncertaintyBasisPoints");
  bps(input.maximumCollusionPressureBasisPoints, "maximumCollusionPressureBasisPoints");
  bps(input.recoveryScoreBasisPoints, "recoveryScoreBasisPoints");
  integer(input.recoveryIndependentGroups, "recoveryIndependentGroups", 1, 10_000);
  if (input.quarantineScoreAtOrBelowBasisPoints > input.restrictedScoreAtOrBelowBasisPoints)
    fail("peer credibility quarantine threshold exceeds restriction threshold");
  if (input.recoveryScoreBasisPoints <= input.restrictedScoreAtOrBelowBasisPoints)
    fail("peer credibility recovery threshold must exceed restriction threshold");
}

function validateObservationBody(input: Omit<PeerCredibilityObservationV1, "observationDigest">): void {
  if (input.schemaVersion !== 1) fail("peer credibility observation schema invalid");
  identifier(input.observationId, "observationId");
  digest(input.scopeDigest, "scopeDigest");
  identifier(input.subjectId, "subjectId");
  identifier(input.sourceId, "sourceId");
  identifier(input.dependencyGroupId, "dependencyGroupId");
  identifier(input.criterionId, "criterionId");
  if (!["satisfied", "violated", "inconclusive"].includes(input.outcome))
    fail("peer credibility outcome invalid");
  bps(input.confidenceBasisPoints, "confidenceBasisPoints");
  if (!["none", "dismissed", "sustained", "contested"].includes(input.challengeDisposition))
    fail("peer challenge disposition invalid");
  digest(input.evidenceDigest, "evidenceDigest");
  integer(input.observedAtLogicalMs, "observedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER);
}

function validateEdgeBody(input: Omit<PeerSourceDependencyEdgeV1, "edgeDigest">): void {
  if (input.schemaVersion !== 1) fail("peer dependency edge schema invalid");
  identifier(input.leftSourceId, "leftSourceId");
  identifier(input.rightSourceId, "rightSourceId");
  if (input.leftSourceId === input.rightSourceId) fail("peer dependency self edge invalid");
  bps(input.correlationBasisPoints, "correlationBasisPoints");
  digest(input.basisDigest, "basisDigest");
  integer(input.validFromLogicalMs, "validFromLogicalMs", 0, Number.MAX_SAFE_INTEGER);
  if (input.validUntilLogicalMs !== null) {
    integer(input.validUntilLogicalMs, "validUntilLogicalMs", 1, Number.MAX_SAFE_INTEGER);
    if (input.validUntilLogicalMs <= input.validFromLogicalMs)
      fail("peer dependency edge validity window invalid");
  }
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} invalid`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value))
    fail(`${label} invalid`);
}

function canonicalIdentifiers(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 100_000) fail(`${label} invalid`);
  values.forEach((item) => identifier(item, label));
  const canonical = [...new Set(values)].sort();
  if (canonical.length !== values.length || canonical.some((item, index) => item !== values[index]))
    fail(`${label} must be canonical`);
}

function canonicalDigests(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 1_000_000) fail(`${label} invalid`);
  values.forEach((item) => digest(item, label));
  const canonical = [...new Set(values)].sort();
  if (canonical.length !== values.length || canonical.some((item, index) => item !== values[index]))
    fail(`${label} must be canonical`);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    fail(`${label} invalid`);
  return value as number;
}

function bps(value: unknown, label: string): number {
  return integer(value, label, 0, 10_000);
}

function clampBps(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

function fail(message: string): never {
  throw new TrustValidationError(message);
}
