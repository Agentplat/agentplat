import type {
  MeshDurableJournalEntry,
  MeshDurableRepository,
  MeshDurableScope,
  MeshDurableWorker,
} from "@agentplat/mesh/durability";
import type {
  MeshHttpClient,
  MeshHttpDeliveryResult,
  MeshHttpHandler,
  MeshHttpReceipt,
} from "@agentplat/mesh-http";
import {
  PostgresPlanningRecoveryDurableRepositoryV1,
  PostgresMeshDurableRepository,
  createPlanningRecoveryDurableStateV1,
  createPlanningRecoveryStateV1,
  createPostgresPool,
  type PlanningRecoveryDurableScopeV1,
  type PlanningRecoveryDurableStateV1,
  type PostgresPlanningRecoveryDurableRepositoryOptionsV1,
  type PostgresMeshDurableRepositoryOptions,
} from "@agentplat/mesh-postgres";
import type {
  RoomMeshBridge,
  RoomMeshIdempotencyRepository,
  RoomMeshInboundProjection,
  RoomMeshObjectivePolicy,
  RoomMeshProjectionSink,
  RoomMeshWorkPolicy,
} from "@agentplat/rooms-mesh";

declare const durableRepository: MeshDurableRepository;
declare const durableScope: MeshDurableScope;
declare const durableWorker: MeshDurableWorker;
declare const journal: MeshDurableJournalEntry;
declare const httpClient: MeshHttpClient;
declare const httpHandler: MeshHttpHandler;
declare const delivery: MeshHttpDeliveryResult;
declare const receipt: MeshHttpReceipt;
declare const postgresOptions: PostgresMeshDurableRepositoryOptions;
declare const bridge: RoomMeshBridge;
declare const idempotency: RoomMeshIdempotencyRepository;
declare const projection: RoomMeshInboundProjection;
declare const sink: RoomMeshProjectionSink;
declare const objectivePolicy: RoomMeshObjectivePolicy;
declare const workPolicy: RoomMeshWorkPolicy;
declare const planningRecoveryScope: PlanningRecoveryDurableScopeV1;
declare const planningRecoveryOptions: PostgresPlanningRecoveryDurableRepositoryOptionsV1;
declare const planningRecoveryState: PlanningRecoveryDurableStateV1;

const pool = createPostgresPool({ max: 1 });
const postgresRepository: MeshDurableRepository =
  new PostgresMeshDurableRepository(pool, postgresOptions);
const planningRecoveryRepository =
  new PostgresPlanningRecoveryDurableRepositoryV1(
    pool,
    planningRecoveryOptions,
  );
const planningRecoveryStateFactory: typeof createPlanningRecoveryDurableStateV1 =
  createPlanningRecoveryDurableStateV1;
const planningRecoveryRecoveryFactory: typeof createPlanningRecoveryStateV1 =
  createPlanningRecoveryStateV1;

void durableRepository;
void durableScope;
void durableWorker;
void journal;
void httpClient;
void httpHandler;
void delivery;
void receipt;
void postgresRepository;
void bridge;
void idempotency;
void projection;
void sink;
void objectivePolicy;
void workPolicy;
void planningRecoveryScope;
void planningRecoveryState;
void planningRecoveryRepository;
void planningRecoveryStateFactory;
void planningRecoveryRecoveryFactory;
