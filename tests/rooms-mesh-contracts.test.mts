import type {
  RoomMeshBridge,
  RoomMeshBridgeApplyResult,
  RoomMeshIdempotencyRepository,
  RoomMeshInboundProjection,
  RoomMeshObjectivePolicy,
  RoomMeshObjectiveProjection,
  RoomMeshProjectionClaimResult,
  RoomMeshProjectionSink,
  RoomMeshWorkPolicy,
  RoomMeshWorkProjection,
} from "@agentplat/rooms-mesh";
import {
  createMemoryRoomMeshIdempotencyRepository,
  createRoomMeshBridge,
  createRoomServiceMeshSink,
  projectAcceptedMeshWorkToRoom,
  projectRoomTaskToMeshWork,
  projectRoomToMeshObjective,
} from "@agentplat/rooms-mesh";

void createMemoryRoomMeshIdempotencyRepository;
void createRoomMeshBridge;
void createRoomServiceMeshSink;
void projectAcceptedMeshWorkToRoom;
void projectRoomTaskToMeshWork;
void projectRoomToMeshObjective;

declare const bridge: RoomMeshBridge;
declare const projection: RoomMeshInboundProjection;
declare const result: RoomMeshBridgeApplyResult;
declare const repository: RoomMeshIdempotencyRepository;
declare const claim: RoomMeshProjectionClaimResult;
declare const sink: RoomMeshProjectionSink;
declare const objectivePolicy: RoomMeshObjectivePolicy;
declare const objectiveProjection: RoomMeshObjectiveProjection;
declare const workPolicy: RoomMeshWorkPolicy;
declare const workProjection: RoomMeshWorkProjection;

void bridge;
void projection;
void result;
void repository;
void claim;
void sink;
void objectivePolicy;
void objectiveProjection;
void workPolicy;
void workProjection;
