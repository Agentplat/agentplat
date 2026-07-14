import type { AgentPlatID } from '@agentplat/core';
import type {
  Approval,
  Artifact,
  ArtifactVersion,
  ContextSnapshot,
  DomainEvent,
  MemoryEntry,
  Participant,
  Policy,
  Room,
  RoomMessage,
  RoomParticipant,
  RoomRun,
  RoomState,
  RoomTask,
  ToolCall,
} from './models.js';

export interface RoomRepositoryReader {
  getRoom(
    tenantId: AgentPlatID,
    roomId: AgentPlatID
  ): Promise<Room | undefined>;
  listRooms(tenantId: AgentPlatID): Promise<Room[]>;
  getRoomState(
    tenantId: AgentPlatID,
    roomId: AgentPlatID
  ): Promise<RoomState | undefined>;
  getParticipant(
    tenantId: AgentPlatID,
    participantId: AgentPlatID
  ): Promise<Participant | undefined>;
  getTask(
    tenantId: AgentPlatID,
    taskId: AgentPlatID
  ): Promise<RoomTask | undefined>;
  getArtifact(
    tenantId: AgentPlatID,
    artifactId: AgentPlatID
  ): Promise<Artifact | undefined>;
  getApproval(
    tenantId: AgentPlatID,
    approvalId: AgentPlatID
  ): Promise<Approval | undefined>;
  listEvents(
    tenantId: AgentPlatID,
    roomId: AgentPlatID
  ): Promise<DomainEvent[]>;
}

export interface RoomRepositoryTransaction extends RoomRepositoryReader {
  insertRoom(room: Room): Promise<void>;
  updateRoom(room: Room): Promise<void>;
  insertParticipant(participant: Participant): Promise<void>;
  addRoomParticipant(link: RoomParticipant): Promise<void>;
  insertMessage(message: RoomMessage): Promise<void>;
  insertTask(task: RoomTask): Promise<void>;
  updateTask(task: RoomTask): Promise<void>;
  insertArtifact(artifact: Artifact, version: ArtifactVersion): Promise<void>;
  updateArtifact(artifact: Artifact): Promise<void>;
  insertArtifactVersion(version: ArtifactVersion): Promise<void>;
  insertApproval(approval: Approval): Promise<void>;
  updateApproval(approval: Approval): Promise<void>;
  insertPolicy(policy: Policy): Promise<void>;
  insertMemory(entry: MemoryEntry): Promise<void>;
  insertContextSnapshot(snapshot: ContextSnapshot): Promise<void>;
  insertRun(run: RoomRun): Promise<void>;
  updateRun(run: RoomRun): Promise<void>;
  insertToolCall(call: ToolCall): Promise<void>;
  updateToolCall(call: ToolCall): Promise<void>;
  appendEvent(event: DomainEvent): Promise<void>;
}

export interface RoomRepository extends RoomRepositoryReader {
  transaction<T>(
    tenantId: AgentPlatID,
    work: (transaction: RoomRepositoryTransaction) => Promise<T>
  ): Promise<T>;
}
