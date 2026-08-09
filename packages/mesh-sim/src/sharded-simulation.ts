import {
  shardedSimulationScaleProfileV1,
  type ShardedSimulationScaleProfileIdV1,
} from "./sharded-simulation-contracts.js";
import {
  InMemoryShardedSimulationBridgeV1,
  runShardedSimulationLogicalPeersV1,
  type ShardedSimulationLogicalRunInputV1,
} from "./sharded-simulation-runtime.js";

export * from "./sharded-simulation-contracts.js";
export * from "./sharded-simulation-validation.js";
export * from "./sharded-simulation-runtime.js";

/** Convenience factory for local composition; production integrations provide their own bridge. */
export function createLocalShardedSimulationV1(
  profileId: ShardedSimulationScaleProfileIdV1,
) {
  const implementation = new InMemoryShardedSimulationBridgeV1();
  return Object.freeze({
    profile: shardedSimulationScaleProfileV1(profileId),
    bridge: Object.freeze({
      createSession: implementation.createSession.bind(implementation),
      startEpisode: implementation.startEpisode.bind(implementation),
      bindShardAssignments:
        implementation.bindShardAssignments.bind(implementation),
      pullPartialObservation:
        implementation.pullPartialObservation.bind(implementation),
      requestEffect: implementation.requestEffect.bind(implementation),
      deliverCrossShardBatch:
        implementation.deliverCrossShardBatch.bind(implementation),
      checkpoint: implementation.checkpoint.bind(implementation),
      restore: implementation.restore.bind(implementation),
    }),
    evaluator: Object.freeze({
      finalizeMetrics: implementation.finalizeMetrics.bind(implementation),
    }),
  });
}

export async function runLocalShardedSimulationV1(
  input: Omit<ShardedSimulationLogicalRunInputV1, "bridge">,
) {
  return runShardedSimulationLogicalPeersV1({
    ...input,
    bridge: new InMemoryShardedSimulationBridgeV1(),
  });
}
