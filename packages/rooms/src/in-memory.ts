import { AgentPlatError } from '@agentplat/core';
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
import type {
  RoomRepository,
  RoomRepositoryTransaction,
} from './repository.js';

interface MemoryState {
  rooms: Room[];
  participants: Participant[];
  roomParticipants: RoomParticipant[];
  messages: RoomMessage[];
  tasks: RoomTask[];
  artifacts: Artifact[];
  artifactVersions: ArtifactVersion[];
  approvals: Approval[];
  policies: Policy[];
  memory: MemoryEntry[];
  contextSnapshots: ContextSnapshot[];
  runs: RoomRun[];
  toolCalls: ToolCall[];
  events: DomainEvent[];
}

const emptyState = (): MemoryState => ({
  rooms: [],
  participants: [],
  roomParticipants: [],
  messages: [],
  tasks: [],
  artifacts: [],
  artifactVersions: [],
  approvals: [],
  policies: [],
  memory: [],
  contextSnapshots: [],
  runs: [],
  toolCalls: [],
  events: [],
});

class InMemoryTransaction implements RoomRepositoryTransaction {
  constructor(
    private readonly state: MemoryState,
    private readonly transactionTenantId?: AgentPlatID
  ) {}

  private assertTenant(tenantId: AgentPlatID): void {
    if (
      this.transactionTenantId !== undefined &&
      tenantId !== this.transactionTenantId
    ) {
      throw new AgentPlatError(
        'FORBIDDEN',
        'A room transaction cannot access another tenant',
        { statusCode: 403 }
      );
    }
  }

  async getRoom(tenantId: string, roomId: string): Promise<Room | undefined> {
    this.assertTenant(tenantId);
    return this.state.rooms.find(
      (item) => item.tenantId === tenantId && item.id === roomId
    );
  }

  async listRooms(tenantId: string): Promise<Room[]> {
    this.assertTenant(tenantId);
    return this.state.rooms
      .filter((item) => item.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getParticipant(
    tenantId: string,
    participantId: string
  ): Promise<Participant | undefined> {
    this.assertTenant(tenantId);
    return this.state.participants.find(
      (item) => item.tenantId === tenantId && item.id === participantId
    );
  }

  async getTask(
    tenantId: string,
    taskId: string
  ): Promise<RoomTask | undefined> {
    this.assertTenant(tenantId);
    return this.state.tasks.find(
      (item) => item.tenantId === tenantId && item.id === taskId
    );
  }

  async getArtifact(
    tenantId: string,
    artifactId: string
  ): Promise<Artifact | undefined> {
    this.assertTenant(tenantId);
    return this.state.artifacts.find(
      (item) => item.tenantId === tenantId && item.id === artifactId
    );
  }

  async getApproval(
    tenantId: string,
    approvalId: string
  ): Promise<Approval | undefined> {
    this.assertTenant(tenantId);
    return this.state.approvals.find(
      (item) => item.tenantId === tenantId && item.id === approvalId
    );
  }

  async listEvents(tenantId: string, roomId: string): Promise<DomainEvent[]> {
    this.assertTenant(tenantId);
    return this.state.events
      .filter((item) => item.tenantId === tenantId && item.roomId === roomId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  async getRoomState(
    tenantId: string,
    roomId: string
  ): Promise<RoomState | undefined> {
    this.assertTenant(tenantId);
    const room = await this.getRoom(tenantId, roomId);
    if (!room) return undefined;
    const links = this.state.roomParticipants.filter(
      (item) => item.tenantId === tenantId && item.roomId === roomId
    );
    const artifacts = this.state.artifacts
      .filter((item) => item.tenantId === tenantId && item.roomId === roomId)
      .map((artifact) => ({
        ...artifact,
        versions: this.state.artifactVersions
          .filter(
            (version) =>
              version.tenantId === tenantId &&
              version.artifactId === artifact.id
          )
          .sort((left, right) => left.version - right.version),
      }));
    return {
      room,
      participants: links
        .map((link) =>
          this.state.participants.find(
            (item) =>
              item.tenantId === tenantId && item.id === link.participantId
          )
        )
        .filter((item): item is Participant => Boolean(item)),
      messages: this.byRoom(this.state.messages, tenantId, roomId),
      tasks: this.byRoom(this.state.tasks, tenantId, roomId),
      artifacts,
      approvals: this.byRoom(this.state.approvals, tenantId, roomId),
      policies: this.byRoom(this.state.policies, tenantId, roomId),
      memory: this.state.memory.filter(
        (item) =>
          item.tenantId === tenantId &&
          (item.roomId === roomId ||
            (item.scope === 'organization' && item.scopeId === tenantId))
      ),
      contextSnapshots: this.byRoom(
        this.state.contextSnapshots,
        tenantId,
        roomId
      ),
      runs: this.byRoom(this.state.runs, tenantId, roomId),
      toolCalls: this.byRoom(this.state.toolCalls, tenantId, roomId),
      events: await this.listEvents(tenantId, roomId),
      childRooms: this.state.rooms.filter(
        (item) => item.tenantId === tenantId && item.parentRoomId === roomId
      ),
    };
  }

  async insertRoom(room: Room): Promise<void> {
    this.assertTenant(room.tenantId);
    this.assertUnique(this.state.rooms, room.tenantId, room.id, 'Room');
    this.state.rooms.push(room);
  }

  async updateRoom(room: Room): Promise<void> {
    this.assertTenant(room.tenantId);
    this.replace(this.state.rooms, room.tenantId, room.id, room, 'Room');
  }

  async insertParticipant(participant: Participant): Promise<void> {
    this.assertTenant(participant.tenantId);
    this.assertUnique(
      this.state.participants,
      participant.tenantId,
      participant.id,
      'Participant'
    );
    this.state.participants.push(participant);
  }

  async addRoomParticipant(link: RoomParticipant): Promise<void> {
    this.assertTenant(link.tenantId);
    if (
      this.state.roomParticipants.some(
        (item) =>
          item.tenantId === link.tenantId &&
          item.roomId === link.roomId &&
          item.participantId === link.participantId
      )
    ) {
      throw new AgentPlatError(
        'CONFLICT',
        'Participant is already in this room'
      );
    }
    this.state.roomParticipants.push(link);
  }

  async insertMessage(message: RoomMessage): Promise<void> {
    this.assertTenant(message.tenantId);
    this.assertUnique(
      this.state.messages,
      message.tenantId,
      message.id,
      'Message'
    );
    this.state.messages.push(message);
  }

  async insertTask(task: RoomTask): Promise<void> {
    this.assertTenant(task.tenantId);
    this.assertUnique(this.state.tasks, task.tenantId, task.id, 'Task');
    if (
      this.state.tasks.some(
        (item) =>
          item.tenantId === task.tenantId &&
          item.roomId === task.roomId &&
          item.stepId === task.stepId
      )
    ) {
      throw new AgentPlatError(
        'CONFLICT',
        `Task step \"${task.stepId}\" already exists in this room`
      );
    }
    this.state.tasks.push(task);
  }

  async updateTask(task: RoomTask): Promise<void> {
    this.assertTenant(task.tenantId);
    this.replace(this.state.tasks, task.tenantId, task.id, task, 'Task');
  }

  async insertArtifact(
    artifact: Artifact,
    version: ArtifactVersion
  ): Promise<void> {
    this.assertTenant(artifact.tenantId);
    this.assertTenant(version.tenantId);
    if (
      artifact.tenantId !== version.tenantId ||
      artifact.id !== version.artifactId ||
      artifact.currentVersion !== version.version
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'The initial artifact version must match the artifact current version'
      );
    }
    this.assertUnique(
      this.state.artifacts,
      artifact.tenantId,
      artifact.id,
      'Artifact'
    );
    this.state.artifacts.push(artifact);
    this.state.artifactVersions.push(version);
  }

  async updateArtifact(artifact: Artifact): Promise<void> {
    this.assertTenant(artifact.tenantId);
    this.replace(
      this.state.artifacts,
      artifact.tenantId,
      artifact.id,
      artifact,
      'Artifact'
    );
  }

  async insertArtifactVersion(version: ArtifactVersion): Promise<void> {
    this.assertTenant(version.tenantId);
    if (
      this.state.artifactVersions.some(
        (item) =>
          item.tenantId === version.tenantId &&
          item.artifactId === version.artifactId &&
          item.version === version.version
      )
    ) {
      throw new AgentPlatError('CONFLICT', 'Artifact version already exists');
    }
    this.state.artifactVersions.push(version);
  }

  async insertApproval(approval: Approval): Promise<void> {
    this.assertTenant(approval.tenantId);
    this.assertUnique(
      this.state.approvals,
      approval.tenantId,
      approval.id,
      'Approval'
    );
    if (
      approval.status === 'requested' &&
      this.state.approvals.some(
        (item) =>
          item.tenantId === approval.tenantId &&
          item.roomId === approval.roomId &&
          item.targetType === approval.targetType &&
          item.targetId === approval.targetId &&
          item.targetVersion === approval.targetVersion &&
          item.action === approval.action &&
          item.status === 'requested'
      )
    ) {
      throw new AgentPlatError(
        'CONFLICT',
        'An approval is already requested for this target and action'
      );
    }
    this.state.approvals.push(approval);
  }

  async updateApproval(approval: Approval): Promise<void> {
    this.assertTenant(approval.tenantId);
    this.replace(
      this.state.approvals,
      approval.tenantId,
      approval.id,
      approval,
      'Approval'
    );
  }

  async insertPolicy(policy: Policy): Promise<void> {
    this.assertTenant(policy.tenantId);
    this.assertUnique(
      this.state.policies,
      policy.tenantId,
      policy.id,
      'Policy'
    );
    this.state.policies.push(policy);
  }

  async insertMemory(entry: MemoryEntry): Promise<void> {
    this.assertTenant(entry.tenantId);
    this.assertUnique(
      this.state.memory,
      entry.tenantId,
      entry.id,
      'Memory entry'
    );
    this.state.memory.push(entry);
  }

  async insertContextSnapshot(snapshot: ContextSnapshot): Promise<void> {
    this.assertTenant(snapshot.tenantId);
    this.assertUnique(
      this.state.contextSnapshots,
      snapshot.tenantId,
      snapshot.id,
      'Context snapshot'
    );
    this.state.contextSnapshots.push(snapshot);
  }

  async insertRun(run: RoomRun): Promise<void> {
    this.assertTenant(run.tenantId);
    this.assertUnique(this.state.runs, run.tenantId, run.id, 'Run');
    this.state.runs.push(run);
  }

  async updateRun(run: RoomRun): Promise<void> {
    this.assertTenant(run.tenantId);
    this.replace(this.state.runs, run.tenantId, run.id, run, 'Run');
  }

  async insertToolCall(call: ToolCall): Promise<void> {
    this.assertTenant(call.tenantId);
    this.assertUnique(
      this.state.toolCalls,
      call.tenantId,
      call.id,
      'Tool call'
    );
    this.state.toolCalls.push(call);
  }

  async updateToolCall(call: ToolCall): Promise<void> {
    this.assertTenant(call.tenantId);
    this.replace(
      this.state.toolCalls,
      call.tenantId,
      call.id,
      call,
      'Tool call'
    );
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    this.assertTenant(event.tenantId);
    this.assertUnique(this.state.events, event.tenantId, event.id, 'Event');
    this.state.events.push(event);
  }

  private byRoom<T extends { tenantId: string; roomId: string }>(
    values: T[],
    tenantId: string,
    roomId: string
  ): T[] {
    return values.filter(
      (item) => item.tenantId === tenantId && item.roomId === roomId
    );
  }

  private assertUnique<T extends { tenantId: string; id: string }>(
    values: T[],
    tenantId: string,
    id: string,
    label: string
  ): void {
    if (values.some((item) => item.tenantId === tenantId && item.id === id)) {
      throw new AgentPlatError('CONFLICT', `${label} \"${id}\" already exists`);
    }
  }

  private replace<T extends { tenantId: string; id: string }>(
    values: T[],
    tenantId: string,
    id: string,
    value: T,
    label: string
  ): void {
    const index = values.findIndex(
      (item) => item.tenantId === tenantId && item.id === id
    );
    if (index < 0)
      throw new AgentPlatError('NOT_FOUND', `${label} \"${id}\" was not found`);
    values[index] = value;
  }
}

export class InMemoryRoomRepository implements RoomRepository {
  private state: MemoryState = emptyState();
  private transactionTail: Promise<void> = Promise.resolve();

  async transaction<T>(
    tenantId: AgentPlatID,
    work: (transaction: RoomRepositoryTransaction) => Promise<T>
  ): Promise<T> {
    if (!tenantId.trim()) {
      throw new AgentPlatError('VALIDATION_ERROR', 'tenantId is required');
    }
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const candidate = structuredClone(this.state);
      const result = await work(new InMemoryTransaction(candidate, tenantId));
      this.state = structuredClone(candidate);
      return structuredClone(result);
    } finally {
      release();
    }
  }

  async getRoom(tenantId: string, roomId: string): Promise<Room | undefined> {
    return structuredClone(
      await new InMemoryTransaction(this.state).getRoom(tenantId, roomId)
    );
  }
  async listRooms(tenantId: string): Promise<Room[]> {
    return structuredClone(
      await new InMemoryTransaction(this.state).listRooms(tenantId)
    );
  }
  async getRoomState(
    tenantId: string,
    roomId: string
  ): Promise<RoomState | undefined> {
    return structuredClone(
      await new InMemoryTransaction(this.state).getRoomState(tenantId, roomId)
    );
  }
  async getParticipant(
    tenantId: string,
    participantId: string
  ): Promise<Participant | undefined> {
    return structuredClone(
      await new InMemoryTransaction(this.state).getParticipant(
        tenantId,
        participantId
      )
    );
  }
  async getTask(
    tenantId: string,
    taskId: string
  ): Promise<RoomTask | undefined> {
    return structuredClone(
      await new InMemoryTransaction(this.state).getTask(tenantId, taskId)
    );
  }
  async getArtifact(
    tenantId: string,
    artifactId: string
  ): Promise<Artifact | undefined> {
    return structuredClone(
      await new InMemoryTransaction(this.state).getArtifact(
        tenantId,
        artifactId
      )
    );
  }
  async getApproval(
    tenantId: string,
    approvalId: string
  ): Promise<Approval | undefined> {
    return structuredClone(
      await new InMemoryTransaction(this.state).getApproval(
        tenantId,
        approvalId
      )
    );
  }
  async listEvents(tenantId: string, roomId: string): Promise<DomainEvent[]> {
    return structuredClone(
      await new InMemoryTransaction(this.state).listEvents(tenantId, roomId)
    );
  }

  clear(): void {
    this.state = emptyState();
    this.transactionTail = Promise.resolve();
  }
}
