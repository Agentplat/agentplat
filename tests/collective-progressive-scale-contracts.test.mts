import {
  COLLECTIVE_PROGRESSIVE_SCALE_PROFILES_V1,
  collectiveProgressiveScalePeerV1,
  createCollectiveProgressiveScalePlanV1,
  runCollectiveProgressiveScaleShardV1,
  type CollectiveProgressiveScaleProfileV1,
  type CollectiveProgressiveScaleShardExecutorV1,
} from "@agentplat/mesh-sim";

const profile: CollectiveProgressiveScaleProfileV1 =
  COLLECTIVE_PROGRESSIVE_SCALE_PROFILES_V1[2];
const plan = createCollectiveProgressiveScalePlanV1({
  schemaVersion: 1,
  tier: profile.tier,
  seed: 1,
});
collectiveProgressiveScalePeerV1(plan.topology, 0);

declare const executor: CollectiveProgressiveScaleShardExecutorV1;
void runCollectiveProgressiveScaleShardV1({
  schemaVersion: 1,
  plan,
  shardId: plan.shards[0].shardId,
  executor,
});

createCollectiveProgressiveScalePlanV1({
  schemaVersion: 1,
  // @ts-expect-error tiers are a closed industry profile set
  tier: "custom",
  seed: 1,
});
