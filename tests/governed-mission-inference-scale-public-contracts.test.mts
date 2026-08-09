import {
  GOVERNED_MISSION_LIFECYCLE_SCHEMA_VERSION_V1,
  GovernedMissionLifecycleRuntimeV1,
  InMemoryGovernedMissionStoreV1,
  type GovernedMissionLifecyclePortV1,
  type GovernedMissionLifecycleRuntimeOptionsV1,
  type GovernedMissionRequestV1,
  type GovernedMissionStateV1,
} from "@agentplat/collective-runtime/mission-lifecycle";
import type { CollectivePeerHostFacadeV1 } from "@agentplat/collective-runtime/host";
import {
  HETEROGENEOUS_INFERENCE_INTERVENTION_SCHEMA_VERSION_V1,
  HeterogeneousInferenceInterventionRuntimeV1,
  InMemoryInferenceInterventionStateStoreV1,
  type HeterogeneousInferenceInterventionRuntimeOptionsV1,
  type InferenceInterventionOperationGateRequestV1,
  type InferenceInterventionOperationGateResultV1,
  type InferenceInterventionResultV1,
} from "@agentplat/inference-control/intervention";
import {
  SHARDED_SIMULATION_SCALE_PROFILES_V1,
  InMemoryShardedSimulationBridgeV1,
  createLocalShardedSimulationV1,
  createShardedSimulationAssignmentsV1,
  runShardedSimulationLogicalPeersV1,
  shardedSimulationAssignmentForPeerV1,
  shardedSimulationScaleProfileV1,
  type ShardedSimulationLogicalRunInputV1,
  type ShardedSimulationLogicalRunResultV1,
} from "@agentplat/mesh-sim";

declare const missionOptions: GovernedMissionLifecycleRuntimeOptionsV1;
declare const missionRequest: GovernedMissionRequestV1;
declare const host: CollectivePeerHostFacadeV1;
declare const interventionOptions: HeterogeneousInferenceInterventionRuntimeOptionsV1;
declare const interventionInput: Parameters<
  HeterogeneousInferenceInterventionRuntimeV1["invoke"]
>[0];
declare const gateRequest: InferenceInterventionOperationGateRequestV1;
declare const shardedRunInput: ShardedSimulationLogicalRunInputV1;

const missionLifecycle: GovernedMissionLifecyclePortV1 =
  new GovernedMissionLifecycleRuntimeV1(missionOptions);
const advancedMission: Promise<GovernedMissionStateV1> =
  missionLifecycle.advance(missionRequest);
const recoveredMission: Promise<GovernedMissionStateV1> =
  host.recoverMission(missionRequest);
const hostAdvance: Promise<GovernedMissionStateV1> =
  host.advanceMission(missionRequest);

const intervention = new HeterogeneousInferenceInterventionRuntimeV1(
  interventionOptions,
);
const interventionResult: Promise<InferenceInterventionResultV1> =
  intervention.invoke(interventionInput);
const gateResult: Promise<InferenceInterventionOperationGateResultV1> =
  intervention.gateOperation(gateRequest);

const profile = shardedSimulationScaleProfileV1("peers-500-interactions-5000");
const assignments = createShardedSimulationAssignmentsV1({
  profile,
  shardCount: 10,
});
const assignment = shardedSimulationAssignmentForPeerV1(assignments, 42);
const local = createLocalShardedSimulationV1("peers-500-interactions-5000");
const shardedResult: Promise<ShardedSimulationLogicalRunResultV1> =
  runShardedSimulationLogicalPeersV1(shardedRunInput);

void GOVERNED_MISSION_LIFECYCLE_SCHEMA_VERSION_V1;
void HETEROGENEOUS_INFERENCE_INTERVENTION_SCHEMA_VERSION_V1;
void SHARDED_SIMULATION_SCALE_PROFILES_V1;
void InMemoryGovernedMissionStoreV1;
void InMemoryInferenceInterventionStateStoreV1;
void InMemoryShardedSimulationBridgeV1;
void advancedMission;
void recoveredMission;
void hostAdvance;
void interventionResult;
void gateResult;
void assignment;
void local;
void shardedResult;

// @ts-expect-error lifecycle schema versions are closed.
const invalidMissionSchema: typeof GOVERNED_MISSION_LIFECYCLE_SCHEMA_VERSION_V1 = 2;
// @ts-expect-error scale profiles are a closed registry.
shardedSimulationScaleProfileV1("peers-1000-interactions-10000");

void invalidMissionSchema;
