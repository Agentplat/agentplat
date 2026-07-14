import type {
  AgentPlatID,
  ISODateTime,
  JsonObject,
  JsonValue,
  Metadata,
  TenantScoped,
} from '@agentplat/core';
import type { AgentPlatEvent } from '@agentplat/events';

export type RoomStatus = 'active' | 'paused' | 'completed' | 'archived';
export type ParticipantType = 'human' | 'agent';
export type MemoryScope =
  'ephemeral' | 'agent' | 'role' | 'room' | 'artifact' | 'organization';
export type TaskStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'canceled';
export type ActionLevel = 'read' | 'draft' | 'execute' | 'external_write';
export type ArtifactStatus =
  'draft' | 'pending_approval' | 'approved' | 'rejected' | 'needs_revision';
export type ApprovalStatus =
  'requested' | 'approved' | 'rejected' | 'needs_revision';
export type RunStatus = 'running' | 'completed' | 'failed' | 'canceled';

export interface Room extends TenantScoped {
  id: AgentPlatID;
  parentRoomId?: AgentPlatID;
  title: string;
  goal: string;
  status: RoomStatus;
  metadata?: Metadata;
  createdBy?: AgentPlatID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt?: ISODateTime;
  archivedAt?: ISODateTime;
}

export interface Participant extends TenantScoped {
  id: AgentPlatID;
  type: ParticipantType;
  displayName: string;
  role: string;
  authorityLevel: number;
  permissions: string[];
  boundaries: string[];
  memoryScope?: MemoryScope;
  runtime?: {
    platform: string;
    modelName?: string;
    instructions?: string;
    config?: JsonObject;
  };
  metadata?: Metadata;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface RoomParticipant extends TenantScoped {
  roomId: AgentPlatID;
  participantId: AgentPlatID;
  joinedAt: ISODateTime;
}

export interface RoomMessage extends TenantScoped {
  id: AgentPlatID;
  roomId: AgentPlatID;
  authorParticipantId?: AgentPlatID;
  role: 'human' | 'agent' | 'system' | 'tool';
  content: string;
  metadata?: Metadata;
  createdAt: ISODateTime;
}

export interface RoomTask extends TenantScoped {
  id: AgentPlatID;
  roomId: AgentPlatID;
  stepId: string;
  assignedParticipantId?: AgentPlatID;
  assignedRole?: string;
  instruction: string;
  expectedOutput: string;
  expectedArtifactKind: string;
  dependencies: AgentPlatID[];
  acceptanceCriteria: string[];
  actionLevel: ActionLevel;
  approvalRequired: boolean;
  toolIds: string[];
  status: TaskStatus;
  errorMessage?: string;
  metadata?: Metadata;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt?: ISODateTime;
}

export interface ArtifactProvenance {
  sourceMessageIds: AgentPlatID[];
  sourceArtifactIds: AgentPlatID[];
  sourceMemoryIds: AgentPlatID[];
  runId?: AgentPlatID;
}

export interface Artifact extends TenantScoped {
  id: AgentPlatID;
  roomId: AgentPlatID;
  type: string;
  title: string;
  status: ArtifactStatus;
  currentVersion: number;
  authors: AgentPlatID[];
  provenance: ArtifactProvenance;
  assumptions: string[];
  risks: string[];
  metadata?: Metadata;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ArtifactVersion extends TenantScoped {
  id: AgentPlatID;
  artifactId: AgentPlatID;
  version: number;
  content: JsonValue;
  contentType: string;
  createdBy?: AgentPlatID;
  createdAt: ISODateTime;
}

export interface Approval extends TenantScoped {
  id: AgentPlatID;
  roomId: AgentPlatID;
  targetType: 'room' | 'task' | 'artifact' | 'action';
  targetId: AgentPlatID;
  /** Artifact version reviewed by this approval; undefined for other targets. */
  targetVersion?: number;
  action?: string;
  status: ApprovalStatus;
  requestedBy?: AgentPlatID;
  decidedBy?: AgentPlatID;
  comment?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  decidedAt?: ISODateTime;
}

export interface Policy extends TenantScoped {
  id: AgentPlatID;
  roomId: AgentPlatID;
  name: string;
  allowedActions: string[];
  deniedActions: string[];
  requiredApprovals: string[];
  escalationRules: JsonObject[];
  toolPermissions: string[];
  memoryAccessRules: MemoryScope[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MemoryEntry extends TenantScoped {
  id: AgentPlatID;
  roomId?: AgentPlatID;
  scope: MemoryScope;
  scopeId?: AgentPlatID;
  content: JsonValue;
  source: string;
  confidence: number;
  retention: 'transient' | 'session' | 'durable' | 'until';
  retainUntil?: ISODateTime;
  provenance: JsonObject;
  createdAt: ISODateTime;
}

export interface AssembledTaskContext {
  agentIdentity: {
    participantId: AgentPlatID;
    displayName: string;
    role: string;
    authorityLevel: number;
    boundaries: string[];
  };
  room: { id: AgentPlatID; goal: string };
  task: {
    id: AgentPlatID;
    instruction: string;
    expectedOutput: string;
    acceptanceCriteria: string[];
  };
  transcript: RoomMessage[];
  artifacts: Array<
    Artifact & {
      content?: JsonValue;
      contentType?: string;
    }
  >;
  memory: MemoryEntry[];
  policies: Policy[];
  provenance: {
    messageIds: AgentPlatID[];
    artifactIds: AgentPlatID[];
    memoryIds: AgentPlatID[];
  };
}

export interface ContextSnapshot extends TenantScoped {
  id: AgentPlatID;
  roomId: AgentPlatID;
  taskId: AgentPlatID;
  runId: AgentPlatID;
  context: AssembledTaskContext;
  createdAt: ISODateTime;
}

export interface RoomRun extends TenantScoped {
  id: AgentPlatID;
  roomId: AgentPlatID;
  taskId: AgentPlatID;
  participantId: AgentPlatID;
  runtime: string;
  status: RunStatus;
  output?: string;
  errorMessage?: string;
  tokenUsage?: JsonObject;
  latencyMs?: number;
  startedAt: ISODateTime;
  leaseExpiresAt: ISODateTime;
  completedAt?: ISODateTime;
}

export interface ToolCall extends TenantScoped {
  id: AgentPlatID;
  roomId: AgentPlatID;
  runId: AgentPlatID;
  toolId: string;
  input: JsonObject;
  output?: JsonValue;
  status: 'requested' | 'completed' | 'failed' | 'denied';
  latencyMs?: number;
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
}

export type RoomEventType =
  | 'room_created'
  | 'room_updated'
  | 'room_paused'
  | 'room_resumed'
  | 'participant_added'
  | 'message_created'
  | 'task_created'
  | 'task_assigned'
  | 'task_run_started'
  | 'task_run_completed'
  | 'task_run_failed'
  | 'artifact_created'
  | 'artifact_updated'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_rejected'
  | 'approval_needs_revision'
  | 'memory_written'
  | 'policy_created'
  | 'subroom_created'
  | 'room_completed'
  | 'room_archived';

export interface DomainEvent extends AgentPlatEvent {
  type: RoomEventType;
  roomId: AgentPlatID;
  actorId?: AgentPlatID;
}

export interface RoomState {
  room: Room;
  participants: Participant[];
  messages: RoomMessage[];
  tasks: RoomTask[];
  artifacts: Array<Artifact & { versions: ArtifactVersion[] }>;
  approvals: Approval[];
  policies: Policy[];
  memory: MemoryEntry[];
  contextSnapshots: ContextSnapshot[];
  runs: RoomRun[];
  toolCalls: ToolCall[];
  events: DomainEvent[];
  childRooms: Room[];
}
