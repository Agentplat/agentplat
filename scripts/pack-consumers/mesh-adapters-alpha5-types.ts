import type {
  MeshDurableJournalEntry,
  MeshDurableRepository,
  MeshDurableScope,
  MeshDurableWorker,
} from '@agentplat/mesh/durability';
import type {
  MeshHttpClient,
  MeshHttpDeliveryResult,
  MeshHttpHandler,
  MeshHttpReceipt,
} from '@agentplat/mesh-http';
import {
  PostgresMeshDurableRepository,
  createPostgresPool,
  type PostgresMeshDurableRepositoryOptions,
} from '@agentplat/mesh-postgres';
import type {
  RoomMeshBridge,
  RoomMeshIdempotencyRepository,
  RoomMeshInboundProjection,
  RoomMeshObjectivePolicy,
  RoomMeshProjectionSink,
  RoomMeshWorkPolicy,
} from '@agentplat/rooms-mesh';

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

const pool = createPostgresPool({ max: 1 });
const postgresRepository: MeshDurableRepository =
  new PostgresMeshDurableRepository(pool, postgresOptions);

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
