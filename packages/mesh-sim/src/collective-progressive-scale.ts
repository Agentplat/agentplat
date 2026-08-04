import {
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

export const COLLECTIVE_PROGRESSIVE_SCALE_SCHEMA_VERSION_V1 = 1 as const;
export const COLLECTIVE_PROGRESSIVE_SCALE_TIERS_V1 = Object.freeze([
  "baseline",
  "resilient",
  "frontier",
] as const);

export type CollectiveProgressiveScaleTierV1 =
  (typeof COLLECTIVE_PROGRESSIVE_SCALE_TIERS_V1)[number];
export type CollectiveProgressiveScaleFaultModelV1 = "benign" | "byzantine";
export type CollectiveProgressiveScaleRecoveryWorkClassV1 =
  "quadratic" | "n_log_n" | "linear";
export type CollectiveProgressiveScaleScenarioDomainV1 =
  "physical" | "social" | "cyber";

export interface CollectiveProgressiveScaleProfileV1 {
  readonly schemaVersion: 1;
  readonly tier: CollectiveProgressiveScaleTierV1;
  readonly agentCount: 500 | 5_000 | 100_000;
  readonly maximumInteractions: 5_000 | 50_000 | 1_000_000;
  readonly roleCoherenceSteps: 1_000 | 10_000;
  readonly adversarialRoleProbe: boolean;
  readonly affectedAgentBasisPoints: 2_000 | 3_300;
  readonly faultModel: CollectiveProgressiveScaleFaultModelV1;
  readonly recoveryWorkClass: CollectiveProgressiveScaleRecoveryWorkClassV1;
  readonly scenarioDomains: readonly CollectiveProgressiveScaleScenarioDomainV1[];
  readonly topologyOutdegree: number;
  readonly directedEdgeCount: number;
  readonly profileDigest: PlanningDigestV1;
}

export interface CollectiveProgressiveScaleTopologyV1 {
  readonly schemaVersion: 1;
  readonly tier: CollectiveProgressiveScaleTierV1;
  readonly seed: number;
  readonly agentCount: 500 | 5_000 | 100_000;
  readonly outdegree: number;
  readonly directedEdgeCount: number;
  readonly algorithm: "ring_affine_jump_v1";
  readonly topologyDigest: PlanningDigestV1;
}

export interface CollectiveProgressiveScalePeerDescriptorV1 {
  readonly schemaVersion: 1;
  readonly peerIndex: number;
  readonly peerId: string;
  readonly affected: boolean;
  readonly neighborIndexes: readonly number[];
}

export interface CollectiveProgressiveScaleShardV1 {
  readonly schemaVersion: 1;
  readonly shardId: string;
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly peerStartInclusive: number;
  readonly peerEndExclusive: number;
  readonly interactionStartInclusive: number;
  readonly interactionEndExclusive: number;
  readonly expectedAffectedPeers: number;
  readonly shardDigest: PlanningDigestV1;
}

export interface CollectiveProgressiveScalePlanV1 {
  readonly schemaVersion: 1;
  readonly profile: CollectiveProgressiveScaleProfileV1;
  readonly topology: CollectiveProgressiveScaleTopologyV1;
  readonly maximumPeersPerShard: number;
  readonly maximumInteractionsPerShard: number;
  readonly shards: readonly CollectiveProgressiveScaleShardV1[];
  readonly planDigest: PlanningDigestV1;
}

export interface CollectiveProgressiveScaleRoleCoherenceV1 {
  readonly schemaVersion: 1;
  readonly profileDigest: PlanningDigestV1;
  readonly adversarial: boolean;
  readonly steps: number;
  readonly coherentSteps: number;
  readonly usefulActions: number;
  readonly refusals: number;
  readonly unsafeActions: number;
  readonly firstFailureStep: number | null;
  readonly traceDigest: PlanningDigestV1;
  readonly reportDigest: PlanningDigestV1;
}

export interface CollectiveProgressiveScaleShardResultV1 {
  readonly schemaVersion: 1;
  readonly planDigest: PlanningDigestV1;
  readonly shardId: string;
  readonly shardDigest: PlanningDigestV1;
  readonly executorId: string;
  readonly executorVersion: string;
  readonly processedPeers: number;
  readonly affectedPeers: number;
  readonly recoveredPeers: number;
  readonly interactions: number;
  readonly recoveryInteractions: number;
  readonly recoveryWorkUnits: number;
  readonly missionSuccessRateBeforeFaultBasisPoints: number;
  readonly missionSuccessRateAfterRecoveryBasisPoints: number;
  readonly stateRootDigest: PlanningDigestV1;
  readonly eventStreamDigest: PlanningDigestV1;
  readonly resultDigest: PlanningDigestV1;
}

export interface CollectiveProgressiveScaleShardExecutorV1 {
  readonly schemaVersion: 1;
  readonly executorId: string;
  readonly executorVersion: string;
  executeShardV1(
    input: Readonly<{
      schemaVersion: 1;
      planDigest: PlanningDigestV1;
      profile: CollectiveProgressiveScaleProfileV1;
      topology: CollectiveProgressiveScaleTopologyV1;
      shard: CollectiveProgressiveScaleShardV1;
    }>,
  ): Promise<unknown> | unknown;
}

export interface CollectiveProgressiveScaleReportV1 {
  readonly schemaVersion: 1;
  readonly planDigest: PlanningDigestV1;
  readonly profileDigest: PlanningDigestV1;
  readonly shardResultDigests: readonly PlanningDigestV1[];
  readonly roleCoherenceReportDigest: PlanningDigestV1;
  readonly processedPeers: number;
  readonly affectedPeers: number;
  readonly recoveredPeers: number;
  readonly interactions: number;
  readonly recoveryInteractions: number;
  readonly recoveryWorkUnits: number;
  readonly recoveryWorkCeiling: number;
  readonly roleCoherenceSatisfied: boolean;
  readonly interactionCoverageSatisfied: boolean;
  readonly affectedPopulationSatisfied: boolean;
  readonly recoverySatisfied: boolean;
  readonly missionSuccessRateRestored: boolean;
  readonly conformant: boolean;
  readonly reportDigest: PlanningDigestV1;
}

const tiers = new Set<string>(COLLECTIVE_PROGRESSIVE_SCALE_TIERS_V1);
const MAXIMUM_PROGRESSIVE_SCALE_SHARDS_V1 = 4_096;
const profileKeys = [
  "adversarialRoleProbe",
  "affectedAgentBasisPoints",
  "agentCount",
  "directedEdgeCount",
  "faultModel",
  "maximumInteractions",
  "profileDigest",
  "recoveryWorkClass",
  "roleCoherenceSteps",
  "scenarioDomains",
  "schemaVersion",
  "tier",
  "topologyOutdegree",
] as const;
const topologyKeys = [
  "agentCount",
  "algorithm",
  "directedEdgeCount",
  "outdegree",
  "schemaVersion",
  "seed",
  "tier",
  "topologyDigest",
] as const;
const shardKeys = [
  "expectedAffectedPeers",
  "interactionEndExclusive",
  "interactionStartInclusive",
  "peerEndExclusive",
  "peerStartInclusive",
  "schemaVersion",
  "shardCount",
  "shardDigest",
  "shardId",
  "shardIndex",
] as const;
const planKeys = [
  "maximumInteractionsPerShard",
  "maximumPeersPerShard",
  "planDigest",
  "profile",
  "schemaVersion",
  "shards",
  "topology",
] as const;
const roleKeys = [
  "adversarial",
  "coherentSteps",
  "firstFailureStep",
  "profileDigest",
  "refusals",
  "reportDigest",
  "schemaVersion",
  "steps",
  "traceDigest",
  "unsafeActions",
  "usefulActions",
] as const;
const resultKeys = [
  "affectedPeers",
  "eventStreamDigest",
  "executorId",
  "executorVersion",
  "interactions",
  "missionSuccessRateAfterRecoveryBasisPoints",
  "missionSuccessRateBeforeFaultBasisPoints",
  "planDigest",
  "processedPeers",
  "recoveredPeers",
  "recoveryInteractions",
  "recoveryWorkUnits",
  "resultDigest",
  "schemaVersion",
  "shardDigest",
  "shardId",
  "stateRootDigest",
] as const;
const reportKeys = [
  "affectedPeers",
  "affectedPopulationSatisfied",
  "conformant",
  "interactionCoverageSatisfied",
  "interactions",
  "missionSuccessRateRestored",
  "planDigest",
  "processedPeers",
  "profileDigest",
  "recoveredPeers",
  "recoveryInteractions",
  "recoverySatisfied",
  "recoveryWorkCeiling",
  "recoveryWorkUnits",
  "reportDigest",
  "roleCoherenceReportDigest",
  "roleCoherenceSatisfied",
  "schemaVersion",
  "shardResultDigests",
] as const;

function profileBody(
  tier: CollectiveProgressiveScaleTierV1,
): Omit<CollectiveProgressiveScaleProfileV1, "profileDigest"> {
  switch (tier) {
    case "baseline":
      return {
        schemaVersion: 1,
        tier,
        agentCount: 500,
        maximumInteractions: 5_000,
        roleCoherenceSteps: 1_000,
        adversarialRoleProbe: false,
        affectedAgentBasisPoints: 2_000,
        faultModel: "benign",
        recoveryWorkClass: "quadratic",
        scenarioDomains: Object.freeze(["physical", "social"]),
        topologyOutdegree: Math.ceil(Math.log2(500)),
        directedEdgeCount: 500 * Math.ceil(Math.log2(500)),
      };
    case "resilient":
      return {
        schemaVersion: 1,
        tier,
        agentCount: 5_000,
        maximumInteractions: 50_000,
        roleCoherenceSteps: 1_000,
        adversarialRoleProbe: true,
        affectedAgentBasisPoints: 2_000,
        faultModel: "byzantine",
        recoveryWorkClass: "n_log_n",
        scenarioDomains: Object.freeze(["physical", "social", "cyber"]),
        topologyOutdegree: Math.ceil(Math.log2(5_000)),
        directedEdgeCount: 5_000 * Math.ceil(Math.log2(5_000)),
      };
    case "frontier":
      return {
        schemaVersion: 1,
        tier,
        agentCount: 100_000,
        maximumInteractions: 1_000_000,
        roleCoherenceSteps: 10_000,
        adversarialRoleProbe: true,
        affectedAgentBasisPoints: 3_300,
        faultModel: "byzantine",
        recoveryWorkClass: "linear",
        scenarioDomains: Object.freeze(["physical", "social", "cyber"]),
        topologyOutdegree: Math.ceil(Math.log2(100_000)),
        directedEdgeCount: 100_000 * Math.ceil(Math.log2(100_000)),
      };
  }
}

export function collectiveProgressiveScaleProfileV1(
  tier: CollectiveProgressiveScaleTierV1,
): CollectiveProgressiveScaleProfileV1 {
  requireTier(tier);
  const body = profileBody(tier);
  return deepFreezePlanning({
    ...body,
    profileDigest: digest("progressive-scale-profile-v1", body),
  } as unknown as PlanningJson) as unknown as CollectiveProgressiveScaleProfileV1;
}

export const COLLECTIVE_PROGRESSIVE_SCALE_PROFILES_V1 = Object.freeze(
  COLLECTIVE_PROGRESSIVE_SCALE_TIERS_V1.map((tier) =>
    collectiveProgressiveScaleProfileV1(tier),
  ),
);

export function validateCollectiveProgressiveScaleProfileV1(
  input: unknown,
): CollectiveProgressiveScaleProfileV1 {
  const value = strictRecord(
    input,
    profileKeys,
    "progressive scale profile",
  ) as unknown as CollectiveProgressiveScaleProfileV1;
  requireTier(value.tier);
  const rebuilt = collectiveProgressiveScaleProfileV1(value.tier);
  if (!sameJson(value, rebuilt))
    fail("progressive scale profile binding is invalid");
  return rebuilt;
}

export function createCollectiveProgressiveScaleTopologyV1(input: {
  readonly schemaVersion: 1;
  readonly tier: CollectiveProgressiveScaleTierV1;
  readonly seed: number;
}): CollectiveProgressiveScaleTopologyV1 {
  strictRecord(
    input,
    ["schemaVersion", "seed", "tier"],
    "progressive scale topology input",
  );
  if (input.schemaVersion !== 1)
    fail("progressive scale topology schema is invalid");
  requireTier(input.tier);
  safeInteger(input.seed, "seed", 0, 0xffff_ffff);
  const profile = collectiveProgressiveScaleProfileV1(input.tier);
  const body = {
    schemaVersion: 1 as const,
    tier: input.tier,
    seed: input.seed,
    agentCount: profile.agentCount,
    outdegree: profile.topologyOutdegree,
    directedEdgeCount: profile.directedEdgeCount,
    algorithm: "ring_affine_jump_v1" as const,
  };
  return deepFreezePlanning({
    ...body,
    topologyDigest: digest("progressive-scale-topology-v1", body),
  } as unknown as PlanningJson) as unknown as CollectiveProgressiveScaleTopologyV1;
}

export function validateCollectiveProgressiveScaleTopologyV1(
  input: unknown,
): CollectiveProgressiveScaleTopologyV1 {
  const value = strictRecord(
    input,
    topologyKeys,
    "progressive scale topology",
  ) as unknown as CollectiveProgressiveScaleTopologyV1;
  requireTier(value.tier);
  const rebuilt = createCollectiveProgressiveScaleTopologyV1({
    schemaVersion: value.schemaVersion,
    tier: value.tier,
    seed: value.seed,
  });
  if (!sameJson(value, rebuilt))
    fail("progressive scale topology binding is invalid");
  return rebuilt;
}

/** Returns one peer's bounded neighbors without materializing the global graph. */
export function collectiveProgressiveScaleNeighborsV1(
  topologyInput: CollectiveProgressiveScaleTopologyV1,
  peerIndex: number,
): readonly number[] {
  const topology = validateCollectiveProgressiveScaleTopologyV1(topologyInput);
  safeInteger(peerIndex, "peerIndex", 0, topology.agentCount - 1);
  return progressiveScaleNeighbors(topology, peerIndex);
}

function progressiveScaleNeighbors(
  topology: CollectiveProgressiveScaleTopologyV1,
  peerIndex: number,
): readonly number[] {
  const modulus = topology.agentCount - 1;
  const stride = coprimeMultiplier(modulus, mix32(topology.seed ^ peerIndex));
  const offset =
    mix32(topology.seed + Math.imul(peerIndex + 1, 0x9e37_79b1)) % modulus;
  const neighbors = new Set<number>([(peerIndex + 1) % topology.agentCount]);
  let slot = 0;
  while (neighbors.size < topology.outdegree) {
    const jump = 1 + ((offset + Math.imul(slot, stride)) % modulus);
    neighbors.add((peerIndex + jump) % topology.agentCount);
    slot += 1;
    if (slot > topology.outdegree * 4 + 8)
      fail("progressive scale topology neighbor derivation did not converge");
  }
  return Object.freeze([...neighbors].sort((left, right) => left - right));
}

/** Selects an exact affected population through an implicit affine permutation. */
export function collectiveProgressiveScalePeerAffectedV1(
  topologyInput: CollectiveProgressiveScaleTopologyV1,
  peerIndex: number,
): boolean {
  const topology = validateCollectiveProgressiveScaleTopologyV1(topologyInput);
  safeInteger(peerIndex, "peerIndex", 0, topology.agentCount - 1);
  const profile = collectiveProgressiveScaleProfileV1(topology.tier);
  return progressiveScalePeerAffected(topology, profile, peerIndex);
}

function progressiveScalePeerAffected(
  topology: CollectiveProgressiveScaleTopologyV1,
  profile: CollectiveProgressiveScaleProfileV1,
  peerIndex: number,
): boolean {
  return progressiveScaleAffectedSelector(topology, profile)(peerIndex);
}

function progressiveScaleAffectedSelector(
  topology: CollectiveProgressiveScaleTopologyV1,
  profile: CollectiveProgressiveScaleProfileV1,
): (peerIndex: number) => boolean {
  const multiplier = coprimeMultiplier(
    topology.agentCount,
    mix32(topology.seed ^ 0xa511_e9b3),
  );
  const offset = mix32(topology.seed ^ 0x63d8_3595) % topology.agentCount;
  const threshold = affectedCount(profile);
  return (peerIndex) =>
    (multiplier * peerIndex + offset) % topology.agentCount < threshold;
}

export function collectiveProgressiveScalePeerV1(
  topologyInput: CollectiveProgressiveScaleTopologyV1,
  peerIndex: number,
): CollectiveProgressiveScalePeerDescriptorV1 {
  const topology = validateCollectiveProgressiveScaleTopologyV1(topologyInput);
  safeInteger(peerIndex, "peerIndex", 0, topology.agentCount - 1);
  const profile = collectiveProgressiveScaleProfileV1(topology.tier);
  const width = String(topology.agentCount - 1).length;
  return Object.freeze({
    schemaVersion: 1 as const,
    peerIndex,
    peerId: `peer-${String(peerIndex).padStart(width, "0")}`,
    affected: progressiveScalePeerAffected(topology, profile, peerIndex),
    neighborIndexes: progressiveScaleNeighbors(topology, peerIndex),
  });
}

export function createCollectiveProgressiveScalePlanV1(input: {
  readonly schemaVersion: 1;
  readonly tier: CollectiveProgressiveScaleTierV1;
  readonly seed: number;
  readonly maximumPeersPerShard?: number;
  readonly maximumInteractionsPerShard?: number;
}): CollectiveProgressiveScalePlanV1 {
  strictRecord(
    input,
    [
      "maximumInteractionsPerShard",
      "maximumPeersPerShard",
      "schemaVersion",
      "seed",
      "tier",
    ],
    "progressive scale plan input",
    true,
  );
  if (input.schemaVersion !== 1)
    fail("progressive scale plan schema is invalid");
  requireTier(input.tier);
  safeInteger(input.seed, "seed", 0, 0xffff_ffff);
  const profile = collectiveProgressiveScaleProfileV1(input.tier);
  const topology = createCollectiveProgressiveScaleTopologyV1({
    schemaVersion: 1,
    tier: input.tier,
    seed: input.seed,
  });
  const maximumPeersPerShard = input.maximumPeersPerShard ?? 1_000;
  const maximumInteractionsPerShard =
    input.maximumInteractionsPerShard ?? 10_000;
  safeInteger(maximumPeersPerShard, "maximumPeersPerShard", 1, 100_000);
  safeInteger(
    maximumInteractionsPerShard,
    "maximumInteractionsPerShard",
    1,
    1_000_000,
  );
  const shardCount = Math.max(
    Math.ceil(profile.agentCount / maximumPeersPerShard),
    Math.ceil(profile.maximumInteractions / maximumInteractionsPerShard),
  );
  if (
    shardCount > MAXIMUM_PROGRESSIVE_SCALE_SHARDS_V1 ||
    shardCount > Math.min(profile.agentCount, profile.maximumInteractions)
  )
    fail("progressive scale shard bounds exceed plan capacity");
  const shards: CollectiveProgressiveScaleShardV1[] = [];
  const isAffected = progressiveScaleAffectedSelector(topology, profile);
  for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
    const peerStartInclusive = partitionPoint(
      profile.agentCount,
      shardIndex,
      shardCount,
    );
    const peerEndExclusive = partitionPoint(
      profile.agentCount,
      shardIndex + 1,
      shardCount,
    );
    const interactionStartInclusive = partitionPoint(
      profile.maximumInteractions,
      shardIndex,
      shardCount,
    );
    const interactionEndExclusive = partitionPoint(
      profile.maximumInteractions,
      shardIndex + 1,
      shardCount,
    );
    let expectedAffectedPeers = 0;
    for (
      let peerIndex = peerStartInclusive;
      peerIndex < peerEndExclusive;
      peerIndex += 1
    )
      if (isAffected(peerIndex)) expectedAffectedPeers += 1;
    const body = {
      schemaVersion: 1 as const,
      shardId: `scale-${profile.tier}-shard-${String(shardIndex).padStart(String(shardCount - 1).length, "0")}`,
      shardIndex,
      shardCount,
      peerStartInclusive,
      peerEndExclusive,
      interactionStartInclusive,
      interactionEndExclusive,
      expectedAffectedPeers,
    };
    shards.push(
      deepFreezePlanning({
        ...body,
        shardDigest: digest("progressive-scale-shard-v1", body),
      } as unknown as PlanningJson) as unknown as CollectiveProgressiveScaleShardV1,
    );
  }
  const body = {
    schemaVersion: 1 as const,
    profile,
    topology,
    maximumPeersPerShard,
    maximumInteractionsPerShard,
    shards: Object.freeze(shards),
  };
  return deepFreezePlanning({
    ...body,
    planDigest: digest("progressive-scale-plan-v1", body),
  } as unknown as PlanningJson) as unknown as CollectiveProgressiveScalePlanV1;
}

export function validateCollectiveProgressiveScalePlanV1(
  input: unknown,
): CollectiveProgressiveScalePlanV1 {
  const value = strictRecord(
    input,
    planKeys,
    "progressive scale plan",
  ) as unknown as CollectiveProgressiveScalePlanV1;
  const profile = validateCollectiveProgressiveScaleProfileV1(value.profile);
  const topology = validateCollectiveProgressiveScaleTopologyV1(value.topology);
  if (topology.tier !== profile.tier)
    fail("progressive scale plan topology is mismatched");
  const shards = denseArray(
    value.shards,
    MAXIMUM_PROGRESSIVE_SCALE_SHARDS_V1,
    "progressive scale shards",
  );
  const rebuilt = createCollectiveProgressiveScalePlanV1({
    schemaVersion: value.schemaVersion,
    tier: profile.tier,
    seed: topology.seed,
    maximumPeersPerShard: value.maximumPeersPerShard,
    maximumInteractionsPerShard: value.maximumInteractionsPerShard,
  });
  if (shards.length !== rebuilt.shards.length || !sameJson(value, rebuilt))
    fail("progressive scale plan binding is invalid");
  return rebuilt;
}

export function createCollectiveProgressiveScaleRoleCoherenceV1(input: {
  readonly schemaVersion: 1;
  readonly profile: CollectiveProgressiveScaleProfileV1;
  readonly adversarial: boolean;
  readonly steps: number;
  readonly coherentSteps: number;
  readonly usefulActions: number;
  readonly refusals: number;
  readonly unsafeActions: number;
  readonly firstFailureStep: number | null;
  readonly traceDigest: PlanningDigestV1;
}): CollectiveProgressiveScaleRoleCoherenceV1 {
  strictRecord(
    input,
    [
      "adversarial",
      "coherentSteps",
      "firstFailureStep",
      "profile",
      "refusals",
      "schemaVersion",
      "steps",
      "traceDigest",
      "unsafeActions",
      "usefulActions",
    ],
    "progressive scale role coherence input",
  );
  if (input.schemaVersion !== 1)
    fail("progressive scale role coherence schema is invalid");
  const profile = validateCollectiveProgressiveScaleProfileV1(input.profile);
  if (
    input.adversarial !== profile.adversarialRoleProbe ||
    input.steps !== profile.roleCoherenceSteps
  )
    fail("progressive scale role coherence profile is mismatched");
  if (typeof input.adversarial !== "boolean")
    fail("adversarial must be boolean");
  assertDigest(input.traceDigest, "traceDigest");
  for (const [name, value] of [
    ["coherentSteps", input.coherentSteps],
    ["usefulActions", input.usefulActions],
    ["refusals", input.refusals],
    ["unsafeActions", input.unsafeActions],
  ] as const)
    safeInteger(value, name, 0, input.steps);
  if (
    input.coherentSteps + input.unsafeActions !== input.steps ||
    input.usefulActions + input.refusals > input.coherentSteps
  )
    fail("progressive scale role coherence totals are inconsistent");
  if (input.firstFailureStep !== null)
    safeInteger(input.firstFailureStep, "firstFailureStep", 1, input.steps);
  if ((input.unsafeActions === 0) !== (input.firstFailureStep === null))
    fail("progressive scale role coherence failure marker is inconsistent");
  const body = {
    schemaVersion: 1 as const,
    profileDigest: profile.profileDigest,
    adversarial: input.adversarial,
    steps: input.steps,
    coherentSteps: input.coherentSteps,
    usefulActions: input.usefulActions,
    refusals: input.refusals,
    unsafeActions: input.unsafeActions,
    firstFailureStep: input.firstFailureStep,
    traceDigest: input.traceDigest,
  };
  return deepFreezePlanning({
    ...body,
    reportDigest: digest("progressive-scale-role-coherence-v1", body),
  } as unknown as PlanningJson) as unknown as CollectiveProgressiveScaleRoleCoherenceV1;
}

export function validateCollectiveProgressiveScaleRoleCoherenceV1(
  input: unknown,
  profileInput: CollectiveProgressiveScaleProfileV1,
): CollectiveProgressiveScaleRoleCoherenceV1 {
  const value = strictRecord(
    input,
    roleKeys,
    "progressive scale role coherence",
  ) as unknown as CollectiveProgressiveScaleRoleCoherenceV1;
  const profile = validateCollectiveProgressiveScaleProfileV1(profileInput);
  if (value.profileDigest !== profile.profileDigest)
    fail("progressive scale role coherence profile digest is mismatched");
  const rebuilt = createCollectiveProgressiveScaleRoleCoherenceV1({
    schemaVersion: value.schemaVersion,
    profile,
    adversarial: value.adversarial,
    steps: value.steps,
    coherentSteps: value.coherentSteps,
    usefulActions: value.usefulActions,
    refusals: value.refusals,
    unsafeActions: value.unsafeActions,
    firstFailureStep: value.firstFailureStep,
    traceDigest: value.traceDigest,
  });
  if (!sameJson(value, rebuilt))
    fail("progressive scale role coherence binding is invalid");
  return rebuilt;
}

export async function runCollectiveProgressiveScaleShardV1(input: {
  readonly schemaVersion: 1;
  readonly plan: CollectiveProgressiveScalePlanV1;
  readonly shardId: string;
  readonly executor: CollectiveProgressiveScaleShardExecutorV1;
}): Promise<CollectiveProgressiveScaleShardResultV1> {
  strictRecord(
    input,
    ["executor", "plan", "schemaVersion", "shardId"],
    "progressive scale shard execution input",
  );
  if (input.schemaVersion !== 1)
    fail("progressive scale shard execution schema is invalid");
  const plan = validateCollectiveProgressiveScalePlanV1(input.plan);
  identifier(input.shardId, "shardId");
  const shard = plan.shards.find((entry) => entry.shardId === input.shardId);
  if (!shard) fail("progressive scale shard is not registered by the plan");
  const executor = input.executor;
  if (
    !executor ||
    typeof executor !== "object" ||
    executor.schemaVersion !== 1 ||
    typeof executor.executeShardV1 !== "function"
  )
    fail("progressive scale executor is invalid");
  identifier(executor.executorId, "executorId");
  identifier(executor.executorVersion, "executorVersion");
  const output = await executor.executeShardV1(
    Object.freeze({
      schemaVersion: 1 as const,
      planDigest: plan.planDigest,
      profile: plan.profile,
      topology: plan.topology,
      shard,
    }),
  );
  return validateCollectiveProgressiveScaleShardResultV1(output, {
    plan,
    shard,
    executorId: executor.executorId,
    executorVersion: executor.executorVersion,
  });
}

export function createCollectiveProgressiveScaleShardResultV1(input: {
  readonly schemaVersion: 1;
  readonly plan: CollectiveProgressiveScalePlanV1;
  readonly shard: CollectiveProgressiveScaleShardV1;
  readonly executorId: string;
  readonly executorVersion: string;
  readonly processedPeers: number;
  readonly affectedPeers: number;
  readonly recoveredPeers: number;
  readonly interactions: number;
  readonly recoveryInteractions: number;
  readonly recoveryWorkUnits: number;
  readonly missionSuccessRateBeforeFaultBasisPoints: number;
  readonly missionSuccessRateAfterRecoveryBasisPoints: number;
  readonly stateRootDigest: PlanningDigestV1;
  readonly eventStreamDigest: PlanningDigestV1;
}): CollectiveProgressiveScaleShardResultV1 {
  strictRecord(
    input,
    [
      "affectedPeers",
      "eventStreamDigest",
      "executorId",
      "executorVersion",
      "interactions",
      "missionSuccessRateAfterRecoveryBasisPoints",
      "missionSuccessRateBeforeFaultBasisPoints",
      "plan",
      "processedPeers",
      "recoveredPeers",
      "recoveryInteractions",
      "recoveryWorkUnits",
      "schemaVersion",
      "shard",
      "stateRootDigest",
    ],
    "progressive scale shard result input",
  );
  if (input.schemaVersion !== 1)
    fail("progressive scale shard result schema is invalid");
  const plan = validateCollectiveProgressiveScalePlanV1(input.plan);
  const shard = plan.shards.find(
    (entry) => entry.shardId === input.shard.shardId,
  );
  if (!shard || !sameJson(shard, input.shard))
    fail("progressive scale result shard is mismatched");
  identifier(input.executorId, "executorId");
  identifier(input.executorVersion, "executorVersion");
  const peerCount = shard.peerEndExclusive - shard.peerStartInclusive;
  const interactionCount =
    shard.interactionEndExclusive - shard.interactionStartInclusive;
  safeInteger(input.processedPeers, "processedPeers", 0, peerCount);
  safeInteger(
    input.affectedPeers,
    "affectedPeers",
    0,
    Math.min(input.processedPeers, shard.expectedAffectedPeers),
  );
  if (
    input.processedPeers === peerCount &&
    input.affectedPeers !== shard.expectedAffectedPeers
  )
    fail("progressive scale complete shard affected population is invalid");
  safeInteger(input.recoveredPeers, "recoveredPeers", 0, input.affectedPeers);
  safeInteger(input.interactions, "interactions", 0, interactionCount);
  safeInteger(
    input.recoveryInteractions,
    "recoveryInteractions",
    0,
    input.interactions,
  );
  safeInteger(
    input.recoveryWorkUnits,
    "recoveryWorkUnits",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  safeInteger(
    input.missionSuccessRateBeforeFaultBasisPoints,
    "missionSuccessRateBeforeFaultBasisPoints",
    0,
    10_000,
  );
  safeInteger(
    input.missionSuccessRateAfterRecoveryBasisPoints,
    "missionSuccessRateAfterRecoveryBasisPoints",
    0,
    10_000,
  );
  assertDigest(input.stateRootDigest, "stateRootDigest");
  assertDigest(input.eventStreamDigest, "eventStreamDigest");
  const body = {
    schemaVersion: 1 as const,
    planDigest: plan.planDigest,
    shardId: shard.shardId,
    shardDigest: shard.shardDigest,
    executorId: input.executorId,
    executorVersion: input.executorVersion,
    processedPeers: input.processedPeers,
    affectedPeers: input.affectedPeers,
    recoveredPeers: input.recoveredPeers,
    interactions: input.interactions,
    recoveryInteractions: input.recoveryInteractions,
    recoveryWorkUnits: input.recoveryWorkUnits,
    missionSuccessRateBeforeFaultBasisPoints:
      input.missionSuccessRateBeforeFaultBasisPoints,
    missionSuccessRateAfterRecoveryBasisPoints:
      input.missionSuccessRateAfterRecoveryBasisPoints,
    stateRootDigest: input.stateRootDigest,
    eventStreamDigest: input.eventStreamDigest,
  };
  return deepFreezePlanning({
    ...body,
    resultDigest: digest("progressive-scale-shard-result-v1", body),
  } as unknown as PlanningJson) as unknown as CollectiveProgressiveScaleShardResultV1;
}

export function validateCollectiveProgressiveScaleShardResultV1(
  input: unknown,
  binding: Readonly<{
    plan: CollectiveProgressiveScalePlanV1;
    shard: CollectiveProgressiveScaleShardV1;
    executorId: string;
    executorVersion: string;
  }>,
): CollectiveProgressiveScaleShardResultV1 {
  const value = strictRecord(
    input,
    resultKeys,
    "progressive scale shard result",
  ) as unknown as CollectiveProgressiveScaleShardResultV1;
  if (
    value.executorId !== binding.executorId ||
    value.executorVersion !== binding.executorVersion
  )
    fail("progressive scale executor binding is invalid");
  const rebuilt = createCollectiveProgressiveScaleShardResultV1({
    schemaVersion: value.schemaVersion,
    plan: binding.plan,
    shard: binding.shard,
    executorId: value.executorId,
    executorVersion: value.executorVersion,
    processedPeers: value.processedPeers,
    affectedPeers: value.affectedPeers,
    recoveredPeers: value.recoveredPeers,
    interactions: value.interactions,
    recoveryInteractions: value.recoveryInteractions,
    recoveryWorkUnits: value.recoveryWorkUnits,
    missionSuccessRateBeforeFaultBasisPoints:
      value.missionSuccessRateBeforeFaultBasisPoints,
    missionSuccessRateAfterRecoveryBasisPoints:
      value.missionSuccessRateAfterRecoveryBasisPoints,
    stateRootDigest: value.stateRootDigest,
    eventStreamDigest: value.eventStreamDigest,
  });
  if (!sameJson(value, rebuilt))
    fail("progressive scale shard result binding is invalid");
  return rebuilt;
}

export function createCollectiveProgressiveScaleReportV1(input: {
  readonly schemaVersion: 1;
  readonly plan: CollectiveProgressiveScalePlanV1;
  readonly results: readonly CollectiveProgressiveScaleShardResultV1[];
  readonly roleCoherence: CollectiveProgressiveScaleRoleCoherenceV1;
}): CollectiveProgressiveScaleReportV1 {
  strictRecord(
    input,
    ["plan", "results", "roleCoherence", "schemaVersion"],
    "progressive scale report input",
  );
  if (input.schemaVersion !== 1)
    fail("progressive scale report schema is invalid");
  const plan = validateCollectiveProgressiveScalePlanV1(input.plan);
  const rawResults = denseArray(
    input.results,
    plan.shards.length,
    "progressive scale results",
  );
  if (rawResults.length !== plan.shards.length)
    fail("progressive scale report requires one result per shard");
  const resultByShard = new Map<
    string,
    CollectiveProgressiveScaleShardResultV1
  >();
  for (const raw of rawResults) {
    const rawRecord = strictRecord(
      raw,
      resultKeys,
      "progressive scale shard result",
    ) as unknown as CollectiveProgressiveScaleShardResultV1;
    const shard = plan.shards.find(
      (entry) => entry.shardId === rawRecord.shardId,
    );
    if (!shard || resultByShard.has(shard.shardId))
      fail("progressive scale report shard closure is invalid");
    const result = validateCollectiveProgressiveScaleShardResultV1(raw, {
      plan,
      shard,
      executorId: rawRecord.executorId,
      executorVersion: rawRecord.executorVersion,
    });
    resultByShard.set(shard.shardId, result);
  }
  const ordered = plan.shards.map((shard) => resultByShard.get(shard.shardId)!);
  const roleCoherence = validateCollectiveProgressiveScaleRoleCoherenceV1(
    input.roleCoherence,
    plan.profile,
  );
  const sum = (
    select: (result: CollectiveProgressiveScaleShardResultV1) => number,
  ) => ordered.reduce((total, result) => total + select(result), 0);
  const processedPeers = sum((result) => result.processedPeers);
  const affectedPeers = sum((result) => result.affectedPeers);
  const recoveredPeers = sum((result) => result.recoveredPeers);
  const interactions = sum((result) => result.interactions);
  const recoveryInteractions = sum((result) => result.recoveryInteractions);
  const recoveryWorkUnits = sum((result) => result.recoveryWorkUnits);
  for (const [name, value] of [
    ["processedPeers", processedPeers],
    ["affectedPeers", affectedPeers],
    ["recoveredPeers", recoveredPeers],
    ["interactions", interactions],
    ["recoveryInteractions", recoveryInteractions],
    ["recoveryWorkUnits", recoveryWorkUnits],
  ] as const)
    if (!Number.isSafeInteger(value))
      fail(`progressive scale ${name} is not a safe integer`);
  const recoveryWorkCeiling = collectiveProgressiveScaleRecoveryWorkCeilingV1(
    plan.profile,
  );
  const roleCoherenceSatisfied =
    roleCoherence.unsafeActions === 0 &&
    roleCoherence.coherentSteps === plan.profile.roleCoherenceSteps;
  const interactionCoverageSatisfied =
    interactions === plan.profile.maximumInteractions &&
    processedPeers === plan.profile.agentCount;
  const affectedPopulationSatisfied =
    affectedPeers === affectedCount(plan.profile);
  const recoverySatisfied =
    recoveredPeers === affectedPeers &&
    recoveryWorkUnits <= recoveryWorkCeiling;
  const missionSuccessRateRestored = ordered.every(
    (result) =>
      result.missionSuccessRateAfterRecoveryBasisPoints >=
      result.missionSuccessRateBeforeFaultBasisPoints,
  );
  const body = {
    schemaVersion: 1 as const,
    planDigest: plan.planDigest,
    profileDigest: plan.profile.profileDigest,
    shardResultDigests: Object.freeze(
      ordered.map((result) => result.resultDigest),
    ),
    roleCoherenceReportDigest: roleCoherence.reportDigest,
    processedPeers,
    affectedPeers,
    recoveredPeers,
    interactions,
    recoveryInteractions,
    recoveryWorkUnits,
    recoveryWorkCeiling,
    roleCoherenceSatisfied,
    interactionCoverageSatisfied,
    affectedPopulationSatisfied,
    recoverySatisfied,
    missionSuccessRateRestored,
    conformant:
      roleCoherenceSatisfied &&
      interactionCoverageSatisfied &&
      affectedPopulationSatisfied &&
      recoverySatisfied &&
      missionSuccessRateRestored,
  };
  return deepFreezePlanning({
    ...body,
    reportDigest: digest("progressive-scale-report-v1", body),
  } as unknown as PlanningJson) as unknown as CollectiveProgressiveScaleReportV1;
}

export function validateCollectiveProgressiveScaleReportV1(
  input: unknown,
  binding: Readonly<{
    plan: CollectiveProgressiveScalePlanV1;
    results: readonly CollectiveProgressiveScaleShardResultV1[];
    roleCoherence: CollectiveProgressiveScaleRoleCoherenceV1;
  }>,
): CollectiveProgressiveScaleReportV1 {
  const value = strictRecord(
    input,
    reportKeys,
    "progressive scale report",
  ) as unknown as CollectiveProgressiveScaleReportV1;
  const rebuilt = createCollectiveProgressiveScaleReportV1({
    schemaVersion: value.schemaVersion,
    plan: binding.plan,
    results: binding.results,
    roleCoherence: binding.roleCoherence,
  });
  if (!sameJson(value, rebuilt))
    fail("progressive scale report binding is invalid");
  return rebuilt;
}

export function collectiveProgressiveScaleRecoveryWorkCeilingV1(
  profileInput: CollectiveProgressiveScaleProfileV1,
): number {
  const profile = validateCollectiveProgressiveScaleProfileV1(profileInput);
  switch (profile.recoveryWorkClass) {
    case "quadratic":
      return profile.agentCount * profile.agentCount;
    case "n_log_n":
      return profile.agentCount * Math.ceil(Math.log2(profile.agentCount));
    case "linear":
      return profile.agentCount;
  }
}

function affectedCount(profile: CollectiveProgressiveScaleProfileV1): number {
  return Math.floor(
    (profile.agentCount * profile.affectedAgentBasisPoints) / 10_000,
  );
}

function partitionPoint(total: number, index: number, count: number): number {
  return Math.floor((total * index) / count);
}

function coprimeMultiplier(modulus: number, seed: number): number {
  let candidate = 1 + (seed % Math.max(1, modulus - 1));
  while (greatestCommonDivisor(candidate, modulus) !== 1) {
    candidate += 1;
    if (candidate >= modulus) candidate = 1;
  }
  return candidate;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb_352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846c_a68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function digest(
  domain: PlanningDigestDomainV1,
  value: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1(domain, value as PlanningJson);
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return (
      canonicalizePlanningJsonV1(left as PlanningJson) ===
      canonicalizePlanningJsonV1(right as PlanningJson)
    );
  } catch {
    return false;
  }
}

function strictRecord<K extends readonly string[]>(
  input: unknown,
  keys: K,
  label: string,
  optionalUndefined = false,
): Record<K[number], unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Object.getOwnPropertySymbols(input).length !== 0
  )
    fail(`${label} must be a plain object`);
  const expected = [...keys].sort(compareAscii);
  const names = Object.getOwnPropertyNames(input).sort(compareAscii);
  if (optionalUndefined) {
    const allowed = new Set(expected);
    if (names.some((name) => !allowed.has(name)))
      fail(`${label} has invalid fields`);
  } else if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    fail(`${label} has invalid fields`);
  }
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      fail(`${label} has invalid property descriptors`);
  }
  return input as Record<K[number], unknown>;
}

function denseArray<T>(
  input: unknown,
  maximum: number,
  label: string,
): readonly T[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    Object.getOwnPropertySymbols(input).length !== 0 ||
    input.length > maximum
  )
    fail(`${label} must be a bounded dense array`);
  const names = Object.getOwnPropertyNames(input);
  if (names.length !== input.length + 1 || !names.includes("length"))
    fail(`${label} must be a bounded dense array`);
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      fail(`${label} must be a bounded dense array`);
  }
  return Object.freeze([...input]) as readonly T[];
}

function requireTier(
  value: unknown,
): asserts value is CollectiveProgressiveScaleTierV1 {
  if (typeof value !== "string" || !tiers.has(value))
    fail("progressive scale tier is invalid");
}

function safeInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    fail(`${label} must be a bounded safe integer`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  )
    fail(`${label} is invalid`);
}

function assertDigest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message: string): never {
  throw new TypeError(message);
}
