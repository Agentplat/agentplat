import { AgentPlatError } from '@agentplat/core';
import type { AgentPlatID, JsonObject, JsonValue } from '@agentplat/core';
import type { EventPublisher } from '@agentplat/events';
import type { AgentRuntime } from '@agentplat/runtime';
import { BoundedContextBuilder } from './context.js';
import type {
  ActionLevel,
  Approval,
  ApprovalStatus,
  Artifact,
  ArtifactProvenance,
  ArtifactVersion,
  DomainEvent,
  MemoryEntry,
  MemoryScope,
  Participant,
  Policy,
  Room,
  RoomEventType,
  RoomMessage,
  RoomRun,
  RoomState,
  RoomStatus,
  RoomTask,
} from './models.js';
import { BasicPolicyEngine } from './policy.js';
import type {
  RoomRepository,
  RoomRepositoryTransaction,
} from './repository.js';

const participantTypes = new Set(['human', 'agent']);
const messageRoles = new Set(['human', 'agent', 'system', 'tool']);
const actionLevels = new Set(['read', 'draft', 'execute', 'external_write']);
const approvalTargetTypes = new Set(['room', 'task', 'artifact', 'action']);
const memoryScopes = new Set([
  'ephemeral',
  'agent',
  'role',
  'room',
  'artifact',
  'organization',
]);
const memoryRetentions = new Set(['transient', 'session', 'durable', 'until']);

export interface RoomServiceOptions {
  repository: RoomRepository;
  runtime?: AgentRuntime;
  eventPublisher?: EventPublisher;
  policyEngine?: BasicPolicyEngine;
  contextBuilder?: BoundedContextBuilder;
  idGenerator?: () => string;
  clock?: () => Date;
  /** Runtime timeout and recovery lease. Defaults to five minutes. */
  runTimeoutMs?: number;
  onEventPublishError?: (error: unknown, event: DomainEvent) => void;
}

export interface CreateRoomInput {
  id?: AgentPlatID;
  parentRoomId?: AgentPlatID;
  title: string;
  goal: string;
  metadata?: Room['metadata'];
  createdBy?: AgentPlatID;
}

export interface AddParticipantInput {
  id?: AgentPlatID;
  type: Participant['type'];
  displayName: string;
  role: string;
  authorityLevel?: number;
  permissions?: string[];
  boundaries?: string[];
  memoryScope?: MemoryScope;
  runtime?: Participant['runtime'];
  metadata?: Participant['metadata'];
}

export interface CreateTaskInput {
  id?: AgentPlatID;
  stepId: string;
  assignedParticipantId?: AgentPlatID;
  assignedRole?: string;
  instruction: string;
  expectedOutput: string;
  expectedArtifactKind: string;
  dependencies?: AgentPlatID[];
  acceptanceCriteria?: string[];
  actionLevel?: ActionLevel;
  approvalRequired?: boolean;
  toolIds?: string[];
  metadata?: RoomTask['metadata'];
}

export interface CreateArtifactInput {
  id?: AgentPlatID;
  type: string;
  title: string;
  content: JsonValue;
  contentType?: string;
  authors?: AgentPlatID[];
  provenance?: Partial<ArtifactProvenance>;
  assumptions?: string[];
  risks?: string[];
  createdBy?: AgentPlatID;
  metadata?: Artifact['metadata'];
}

export interface CreatePolicyInput {
  id?: AgentPlatID;
  name: string;
  allowedActions?: string[];
  deniedActions?: string[];
  requiredApprovals?: string[];
  escalationRules?: JsonObject[];
  toolPermissions?: string[];
  memoryAccessRules?: MemoryScope[];
}

export interface WriteMemoryInput {
  id?: AgentPlatID;
  scope: MemoryScope;
  scopeId?: AgentPlatID;
  content: JsonValue;
  source: string;
  confidence?: number;
  retention?: MemoryEntry['retention'];
  retainUntil?: string;
  provenance?: JsonObject;
}

interface MutationResult<T> {
  value: T;
  events: DomainEvent[];
}

export class RoomService {
  private readonly repository: RoomRepository;
  private readonly runtime?: AgentRuntime;
  private readonly eventPublisher?: EventPublisher;
  private readonly policyEngine: BasicPolicyEngine;
  private readonly contextBuilder: BoundedContextBuilder;
  private readonly idGenerator: () => string;
  private readonly clock: () => Date;
  private readonly runTimeoutMs: number;
  private readonly runLeaseGraceMs: number;
  private readonly onEventPublishError: (
    error: unknown,
    event: DomainEvent
  ) => void;

  constructor(options: RoomServiceOptions) {
    this.repository = options.repository;
    this.runtime = options.runtime;
    this.eventPublisher = options.eventPublisher;
    this.policyEngine = options.policyEngine ?? new BasicPolicyEngine();
    this.idGenerator =
      options.idGenerator ?? (() => globalThis.crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date());
    this.contextBuilder =
      options.contextBuilder ??
      new BoundedContextBuilder({ clock: this.clock });
    this.runTimeoutMs = options.runTimeoutMs ?? 300_000;
    if (!Number.isInteger(this.runTimeoutMs) || this.runTimeoutMs <= 0) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'runTimeoutMs must be a positive integer'
      );
    }
    // Leave enough time for the timeout handler to fence and persist a failed
    // run before another process can recover the lease.
    this.runLeaseGraceMs = Math.min(
      30_000,
      Math.max(1_000, Math.ceil(this.runTimeoutMs * 0.1))
    );
    this.onEventPublishError = options.onEventPublishError ?? (() => undefined);
  }

  async createRoom(tenantId: string, input: CreateRoomInput): Promise<Room> {
    this.required(tenantId, 'tenantId');
    this.required(input.title, 'title');
    this.required(input.goal, 'goal');
    const result = await this.repository.transaction(
      tenantId,
      async (transaction) => {
        if (input.parentRoomId) {
          const parent = await transaction.getRoom(
            tenantId,
            input.parentRoomId
          );
          if (!parent) throw this.notFound('Parent room', input.parentRoomId);
          this.assertRoomWritable(parent);
        }
        const now = this.now();
        const room: Room = {
          id: input.id ?? this.id(),
          tenantId,
          parentRoomId: input.parentRoomId,
          title: input.title.trim(),
          goal: input.goal.trim(),
          status: 'active',
          metadata: input.metadata,
          createdBy: input.createdBy,
          createdAt: now,
          updatedAt: now,
        };
        const events = [
          this.event(
            tenantId,
            room.id,
            input.parentRoomId ? 'subroom_created' : 'room_created',
            {
              roomId: room.id,
              parentRoomId: room.parentRoomId ?? null,
              title: room.title,
            },
            input.createdBy
          ),
        ];
        await transaction.insertRoom(room);
        await this.appendEvents(transaction, events);
        return { value: room, events };
      }
    );
    await this.publish(result.events);
    return result.value;
  }

  async updateRoom(
    tenantId: string,
    roomId: string,
    input: {
      title?: string;
      goal?: string;
      metadata?: Room['metadata'];
      actorId?: string;
    }
  ): Promise<Room> {
    if (input.title !== undefined) this.required(input.title, 'title');
    if (input.goal !== undefined) this.required(input.goal, 'goal');
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      this.assertRoomWritable(room);
      const updated: Room = {
        ...room,
        title: input.title?.trim() || room.title,
        goal: input.goal?.trim() || room.goal,
        metadata: input.metadata ?? room.metadata,
        updatedAt: this.now(),
      };
      const event = this.event(
        tenantId,
        roomId,
        'room_updated',
        { roomId },
        input.actorId
      );
      await transaction.updateRoom(updated);
      await transaction.appendEvent(event);
      return { value: updated, events: [event] };
    });
  }

  async transitionRoom(
    tenantId: string,
    roomId: string,
    action: 'pause' | 'resume' | 'complete' | 'archive',
    actorId?: string
  ): Promise<Room> {
    const transitions: Record<
      typeof action,
      { from: RoomStatus; to: RoomStatus; event: RoomEventType }
    > = {
      pause: { from: 'active', to: 'paused', event: 'room_paused' },
      resume: { from: 'paused', to: 'active', event: 'room_resumed' },
      complete: { from: 'active', to: 'completed', event: 'room_completed' },
      archive: { from: 'completed', to: 'archived', event: 'room_archived' },
    };
    if (!Object.hasOwn(transitions, action)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'Room transition action is not supported'
      );
    }
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      const transition = transitions[action];
      if (room.status !== transition.from) {
        throw new AgentPlatError(
          'CONFLICT',
          `Room cannot ${action} from status \"${room.status}\"`,
          { statusCode: 409 }
        );
      }
      if (action === 'complete') {
        const state = await transaction.getRoomState(tenantId, roomId);
        if (
          state?.tasks.some(
            (task) => !['completed', 'canceled'].includes(task.status)
          ) ||
          state?.approvals.some(
            (approval) => approval.status === 'requested'
          ) ||
          state?.artifacts.some((artifact) => artifact.status !== 'approved') ||
          state?.childRooms.some(
            (child) => !['completed', 'archived'].includes(child.status)
          )
        ) {
          throw new AgentPlatError(
            'CONFLICT',
            'Complete tasks and subrooms, resolve approvals, and approve all artifacts before completing the room',
            { statusCode: 409 }
          );
        }
      }
      const now = this.now();
      const updated: Room = {
        ...room,
        status: transition.to,
        updatedAt: now,
        completedAt: action === 'complete' ? now : room.completedAt,
        archivedAt: action === 'archive' ? now : room.archivedAt,
      };
      const event = this.event(
        tenantId,
        roomId,
        transition.event,
        { roomId, status: updated.status },
        actorId
      );
      await transaction.updateRoom(updated);
      await transaction.appendEvent(event);
      return { value: updated, events: [event] };
    });
  }

  async pauseRoom(
    tenantId: string,
    roomId: string,
    actorId?: string
  ): Promise<Room> {
    return this.transitionRoom(tenantId, roomId, 'pause', actorId);
  }

  async resumeRoom(
    tenantId: string,
    roomId: string,
    actorId?: string
  ): Promise<Room> {
    return this.transitionRoom(tenantId, roomId, 'resume', actorId);
  }

  async completeRoom(
    tenantId: string,
    roomId: string,
    actorId?: string
  ): Promise<Room> {
    return this.transitionRoom(tenantId, roomId, 'complete', actorId);
  }

  async archiveRoom(
    tenantId: string,
    roomId: string,
    actorId?: string
  ): Promise<Room> {
    return this.transitionRoom(tenantId, roomId, 'archive', actorId);
  }

  async addParticipant(
    tenantId: string,
    roomId: string,
    input: AddParticipantInput,
    actorId?: string
  ): Promise<Participant> {
    this.required(input.displayName, 'displayName');
    this.required(input.role, 'role');
    this.stringArray(input.permissions, 'permissions');
    this.stringArray(input.boundaries, 'boundaries');
    if (!participantTypes.has(input.type)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'type must be human or agent'
      );
    }
    if (
      !Number.isInteger(input.authorityLevel ?? 0) ||
      (input.authorityLevel ?? 0) < 0
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'authorityLevel must be a non-negative integer'
      );
    }
    if (input.type === 'agent' && !input.runtime?.platform) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'Agent participants require runtime.platform'
      );
    }
    if (input.runtime)
      this.required(input.runtime.platform, 'runtime.platform');
    if (input.memoryScope && !memoryScopes.has(input.memoryScope)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'memoryScope is not supported'
      );
    }
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      this.assertRoomWritable(room);
      const id = input.id ?? this.id();
      const existing = await transaction.getParticipant(tenantId, id);
      const now = this.now();
      const participant: Participant = existing ?? {
        id,
        tenantId,
        type: input.type,
        displayName: input.displayName.trim(),
        role: input.role.trim(),
        authorityLevel: input.authorityLevel ?? 0,
        permissions: input.permissions ?? [],
        boundaries: input.boundaries ?? [],
        memoryScope: input.memoryScope,
        runtime: input.runtime,
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now,
      };
      if (!existing) await transaction.insertParticipant(participant);
      await transaction.addRoomParticipant({
        tenantId,
        roomId,
        participantId: id,
        joinedAt: now,
      });
      const event = this.event(
        tenantId,
        roomId,
        'participant_added',
        {
          roomId,
          participantId: id,
          participantType: participant.type,
          role: participant.role,
        },
        actorId
      );
      await transaction.appendEvent(event);
      return { value: participant, events: [event] };
    });
  }

  async sendMessage(
    tenantId: string,
    roomId: string,
    input: {
      id?: string;
      authorParticipantId?: string;
      role: RoomMessage['role'];
      content: string;
      metadata?: RoomMessage['metadata'];
    }
  ): Promise<RoomMessage> {
    this.required(input.content, 'content');
    if (!messageRoles.has(input.role)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'role is not a supported message role'
      );
    }
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      this.assertRoomWritable(room);
      if (input.authorParticipantId) {
        await this.requireRoomParticipant(
          transaction,
          tenantId,
          roomId,
          input.authorParticipantId
        );
      }
      const message: RoomMessage = {
        id: input.id ?? this.id(),
        tenantId,
        roomId,
        authorParticipantId: input.authorParticipantId,
        role: input.role,
        content: input.content,
        metadata: input.metadata,
        createdAt: this.now(),
      };
      const event = this.event(
        tenantId,
        roomId,
        'message_created',
        { roomId, messageId: message.id, role: message.role },
        input.authorParticipantId
      );
      await transaction.insertMessage(message);
      await transaction.appendEvent(event);
      return { value: message, events: [event] };
    });
  }

  async createTask(
    tenantId: string,
    roomId: string,
    input: CreateTaskInput,
    actorId?: string
  ): Promise<RoomTask> {
    this.required(input.stepId, 'stepId');
    this.required(input.instruction, 'instruction');
    this.required(input.expectedOutput, 'expectedOutput');
    this.required(input.expectedArtifactKind, 'expectedArtifactKind');
    this.stringArray(input.dependencies, 'dependencies');
    this.stringArray(input.acceptanceCriteria, 'acceptanceCriteria');
    this.stringArray(input.toolIds, 'toolIds');
    if (input.actionLevel && !actionLevels.has(input.actionLevel)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'actionLevel is not supported'
      );
    }
    if (
      input.approvalRequired !== undefined &&
      typeof input.approvalRequired !== 'boolean'
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'approvalRequired must be a boolean'
      );
    }
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      this.assertRoomWritable(room);
      if (input.assignedParticipantId) {
        const assignedParticipant = await this.requireRoomParticipant(
          transaction,
          tenantId,
          roomId,
          input.assignedParticipantId
        );
        if (assignedParticipant.type !== 'agent') {
          throw new AgentPlatError(
            'VALIDATION_ERROR',
            'Executable Room tasks can only be assigned to agent participants'
          );
        }
      }
      for (const dependencyId of input.dependencies ?? []) {
        const dependency = await transaction.getTask(tenantId, dependencyId);
        if (!dependency || dependency.roomId !== roomId) {
          throw new AgentPlatError(
            'VALIDATION_ERROR',
            `Dependency \"${dependencyId}\" is not in this room`
          );
        }
      }
      const now = this.now();
      const task: RoomTask = {
        id: input.id ?? this.id(),
        tenantId,
        roomId,
        stepId: input.stepId,
        assignedParticipantId: input.assignedParticipantId,
        assignedRole: input.assignedRole,
        instruction: input.instruction,
        expectedOutput: input.expectedOutput,
        expectedArtifactKind: input.expectedArtifactKind,
        dependencies: input.dependencies ?? [],
        acceptanceCriteria: input.acceptanceCriteria ?? [],
        actionLevel: input.actionLevel ?? 'execute',
        approvalRequired: input.approvalRequired ?? false,
        toolIds: input.toolIds ?? [],
        status: 'pending',
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now,
      };
      const events = [
        this.event(
          tenantId,
          roomId,
          'task_created',
          { roomId, taskId: task.id, stepId: task.stepId },
          actorId
        ),
      ];
      if (task.assignedParticipantId || task.assignedRole) {
        events.push(
          this.event(
            tenantId,
            roomId,
            'task_assigned',
            {
              roomId,
              taskId: task.id,
              participantId: task.assignedParticipantId ?? null,
              role: task.assignedRole ?? null,
            },
            actorId
          )
        );
      }
      await transaction.insertTask(task);
      await this.appendEvents(transaction, events);
      return { value: task, events };
    });
  }

  async runTask(
    tenantId: string,
    roomId: string,
    taskId: string
  ): Promise<RoomRun> {
    if (!this.runtime) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        'No agent runtime is configured'
      );
    }
    const runId = this.id();
    const snapshotId = this.id();
    const claim = await this.repository.transaction(
      tenantId,
      async (transaction) => {
        const state = await transaction.getRoomState(tenantId, roomId);
        if (!state) throw this.notFound('Room', roomId);
        if (state.room.status !== 'active') {
          throw new AgentPlatError(
            'CONFLICT',
            'Tasks can only run in active rooms',
            {
              statusCode: 409,
            }
          );
        }
        let currentTask = await transaction.getTask(tenantId, taskId);
        if (!currentTask || currentTask.roomId !== roomId)
          throw this.notFound('Task', taskId);
        const startedAt = this.now();
        const claimEvents: DomainEvent[] = [];
        if (currentTask.status === 'running') {
          const staleRun = state.runs.find(
            (run) =>
              run.taskId === taskId &&
              run.status === 'running' &&
              new Date(run.leaseExpiresAt).getTime() <=
                new Date(startedAt).getTime()
          );
          if (!staleRun) {
            throw new AgentPlatError(
              'CONFLICT',
              'Task was already claimed by another run'
            );
          }
          const staleMessage = 'Run lease expired before completion';
          await transaction.updateRun({
            ...staleRun,
            status: 'failed',
            errorMessage: staleMessage,
            completedAt: startedAt,
          });
          currentTask = {
            ...currentTask,
            status: 'failed',
            errorMessage: staleMessage,
            updatedAt: startedAt,
          };
          await transaction.updateTask(currentTask);
          claimEvents.push(
            this.event(tenantId, roomId, 'task_run_failed', {
              roomId,
              taskId,
              runId: staleRun.id,
              error: staleMessage,
              recovered: true,
            })
          );
        }
        if (!['pending', 'failed'].includes(currentTask.status)) {
          throw new AgentPlatError(
            'CONFLICT',
            'Task was already claimed by another run'
          );
        }
        const incompleteDependencyId = currentTask.dependencies.find(
          (id) =>
            state.tasks.find((candidate) => candidate.id === id)?.status !==
            'completed'
        );
        if (incompleteDependencyId) {
          throw new AgentPlatError(
            'CONFLICT',
            `Dependency \"${incompleteDependencyId}\" is missing or not completed`
          );
        }
        const participant = this.resolveAgentParticipant(state, currentTask);
        const decision = this.policyEngine.evaluateTask(
          currentTask,
          participant,
          state.policies
        );
        if (!decision.allowed) {
          throw new AgentPlatError('FORBIDDEN', decision.reason, {
            statusCode: 403,
          });
        }
        if (
          decision.approvalRequired &&
          !state.approvals.some(
            (approval) =>
              approval.targetType === 'task' &&
              approval.targetId === currentTask.id &&
              approval.action === `task.run.${currentTask.actionLevel}` &&
              approval.status === 'approved'
          )
        ) {
          throw new AgentPlatError(
            'FORBIDDEN',
            'Task execution requires a granted approval',
            { statusCode: 403 }
          );
        }
        const context = this.contextBuilder.build(
          state,
          currentTask,
          participant
        );
        const running: RoomRun = {
          id: runId,
          tenantId,
          roomId,
          taskId,
          participantId: participant.id,
          runtime: participant.runtime?.platform ?? 'unknown',
          status: 'running',
          startedAt,
          leaseExpiresAt: new Date(
            new Date(startedAt).getTime() + this.runTimeoutMs
          ).toISOString(),
        };
        await transaction.updateTask({
          ...currentTask,
          status: 'running',
          errorMessage: undefined,
          updatedAt: startedAt,
        });
        await transaction.insertRun(running);
        await transaction.insertContextSnapshot({
          id: snapshotId,
          tenantId,
          roomId,
          taskId,
          runId,
          context,
          createdAt: startedAt,
        });
        const event = this.event(
          tenantId,
          roomId,
          'task_run_started',
          { roomId, taskId, runId, participantId: participant.id },
          participant.id
        );
        claimEvents.push(event);
        await this.appendEvents(transaction, claimEvents);
        return {
          value: {
            running,
            context,
            participant,
            task: currentTask,
            policies: state.policies,
          },
          events: claimEvents,
        };
      }
    );
    await this.publish(claim.events);
    const { context, participant, task, policies } = claim.value;

    // Publishing happens after the claim commits. It may be arbitrarily slow,
    // so fence the claim again and start a fresh lease immediately before the
    // provider is invoked. If another process recovered the original lease,
    // this caller exits without producing duplicate runtime side effects.
    const running = await this.repository.transaction(
      tenantId,
      async (transaction) => {
        const state = await transaction.getRoomState(tenantId, roomId);
        const currentTask = await transaction.getTask(tenantId, taskId);
        const currentRun = state?.runs.find(
          (candidate) => candidate.id === runId
        );
        if (
          !currentTask ||
          currentTask.status !== 'running' ||
          currentRun?.status !== 'running'
        ) {
          throw new AgentPlatError(
            'CONFLICT',
            'Run no longer owns the task execution lease',
            { statusCode: 409 }
          );
        }
        const renewed: RoomRun = {
          ...currentRun,
          leaseExpiresAt: this.leaseExpiresAt(this.now()),
        };
        await transaction.updateRun(renewed);
        return renewed;
      }
    );

    const startedMs = this.clock().getTime();
    const abortController = new AbortController();
    try {
      const runtimeResult = await this.withTimeout(
        this.runtime.run(
          {
            id: participant.id,
            tenantId,
            name: participant.displayName,
            instructions: participant.runtime?.instructions,
            platform: participant.runtime?.platform ?? 'mock',
            modelName: participant.runtime?.modelName,
            config: participant.runtime?.config,
          },
          {
            input: [this.toJson(context)],
            mode: 'invoke',
            metadata: {
              roomId,
              taskId,
              expectedArtifactKind: task.expectedArtifactKind,
            },
          },
          {
            tenant: { tenantId },
            runId,
            agentId: participant.id,
            signal: abortController.signal,
            policies: this.toJson({ policies }),
            metadata: { roomId, taskId, contextSnapshotId: snapshotId },
          }
        ),
        this.runTimeoutMs,
        (timeoutError) => abortController.abort(timeoutError)
      );
      if (runtimeResult.status !== 'completed') {
        throw new AgentPlatError(
          'ADAPTER_ERROR',
          runtimeResult.errorMessage ?? 'Agent runtime did not complete'
        );
      }
      const completedAt = this.now();
      const latencyMs = Math.max(0, this.clock().getTime() - startedMs);
      const artifactOutput = this.parseArtifactOutput(
        runtimeResult.result,
        task,
        runtimeResult.output
      );
      return this.mutate(tenantId, async (transaction) => {
        const state = await transaction.getRoomState(tenantId, roomId);
        const currentTask = await transaction.getTask(tenantId, taskId);
        const currentRun = state?.runs.find(
          (candidate) => candidate.id === runId
        );
        if (
          !currentTask ||
          currentTask.status !== 'running' ||
          currentRun?.status !== 'running'
        ) {
          throw new AgentPlatError(
            'CONFLICT',
            'Run no longer owns the task completion lease',
            { statusCode: 409 }
          );
        }
        const artifactId = this.id();
        const artifact: Artifact = {
          id: artifactId,
          tenantId,
          roomId,
          type: artifactOutput.type,
          title: artifactOutput.title,
          status: 'draft',
          currentVersion: 1,
          authors: [participant.id],
          provenance: {
            sourceMessageIds: context.provenance.messageIds,
            sourceArtifactIds: context.provenance.artifactIds,
            sourceMemoryIds: context.provenance.memoryIds,
            runId,
          },
          assumptions: artifactOutput.assumptions,
          risks: artifactOutput.risks,
          createdAt: completedAt,
          updatedAt: completedAt,
        };
        const version: ArtifactVersion = {
          id: this.id(),
          tenantId,
          artifactId,
          version: 1,
          content: artifactOutput.content,
          contentType: artifactOutput.contentType,
          createdBy: participant.id,
          createdAt: completedAt,
        };
        const completedRun: RoomRun = {
          ...running,
          status: 'completed',
          output: runtimeResult.output,
          latencyMs,
          completedAt,
        };
        await transaction.insertArtifact(artifact, version);
        await transaction.updateTask({
          ...currentTask,
          status: 'completed',
          errorMessage: undefined,
          updatedAt: completedAt,
          completedAt,
        });
        await transaction.updateRun(completedRun);
        const events = [
          this.event(
            tenantId,
            roomId,
            'artifact_created',
            { roomId, artifactId, taskId, runId },
            participant.id
          ),
          this.event(
            tenantId,
            roomId,
            'task_run_completed',
            { roomId, taskId, runId, artifactId },
            participant.id
          ),
        ];
        await this.appendEvents(transaction, events);
        return { value: completedRun, events };
      });
    } catch (error) {
      const failedAt = this.now();
      const message =
        error instanceof Error ? error.message : 'Agent runtime failed';
      await this.mutate(tenantId, async (transaction) => {
        const state = await transaction.getRoomState(tenantId, roomId);
        const currentTask = await transaction.getTask(tenantId, taskId);
        const currentRun = state?.runs.find(
          (candidate) => candidate.id === runId
        );
        if (
          !currentTask ||
          currentTask.status !== 'running' ||
          currentRun?.status !== 'running'
        ) {
          return { value: currentRun ?? running, events: [] };
        }
        const failedRun: RoomRun = {
          ...running,
          status: 'failed',
          errorMessage: message,
          completedAt: failedAt,
        };
        await transaction.updateTask({
          ...currentTask,
          status: 'failed',
          errorMessage: message,
          updatedAt: failedAt,
        });
        await transaction.updateRun(failedRun);
        const event = this.event(tenantId, roomId, 'task_run_failed', {
          roomId,
          taskId,
          runId,
          error: message,
        });
        await transaction.appendEvent(event);
        return { value: failedRun, events: [event] };
      });
      throw error;
    }
  }

  async createArtifact(
    tenantId: string,
    roomId: string,
    input: CreateArtifactInput
  ): Promise<Artifact> {
    this.required(input.type, 'type');
    this.required(input.title, 'title');
    this.stringArray(input.authors, 'authors');
    this.stringArray(input.assumptions, 'assumptions');
    this.stringArray(input.risks, 'risks');
    this.stringArray(
      input.provenance?.sourceMessageIds,
      'provenance.sourceMessageIds'
    );
    this.stringArray(
      input.provenance?.sourceArtifactIds,
      'provenance.sourceArtifactIds'
    );
    this.stringArray(
      input.provenance?.sourceMemoryIds,
      'provenance.sourceMemoryIds'
    );
    if (input.content === undefined) {
      throw new AgentPlatError('VALIDATION_ERROR', 'content is required');
    }
    if (input.contentType !== undefined)
      this.required(input.contentType, 'contentType');
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      this.assertRoomWritable(room);
      const now = this.now();
      const artifact: Artifact = {
        id: input.id ?? this.id(),
        tenantId,
        roomId,
        type: input.type,
        title: input.title,
        status: 'draft',
        currentVersion: 1,
        authors: input.authors ?? (input.createdBy ? [input.createdBy] : []),
        provenance: {
          sourceMessageIds: input.provenance?.sourceMessageIds ?? [],
          sourceArtifactIds: input.provenance?.sourceArtifactIds ?? [],
          sourceMemoryIds: input.provenance?.sourceMemoryIds ?? [],
          runId: input.provenance?.runId,
        },
        assumptions: input.assumptions ?? [],
        risks: input.risks ?? [],
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now,
      };
      const version: ArtifactVersion = {
        id: this.id(),
        tenantId,
        artifactId: artifact.id,
        version: 1,
        content: input.content,
        contentType: input.contentType ?? 'application/json',
        createdBy: input.createdBy,
        createdAt: now,
      };
      const event = this.event(
        tenantId,
        roomId,
        'artifact_created',
        { roomId, artifactId: artifact.id },
        input.createdBy
      );
      await transaction.insertArtifact(artifact, version);
      await transaction.appendEvent(event);
      return { value: artifact, events: [event] };
    });
  }

  async createArtifactVersion(
    tenantId: string,
    roomId: string,
    artifactId: string,
    input: { content: JsonValue; contentType?: string; createdBy?: string }
  ): Promise<ArtifactVersion> {
    if (input.content === undefined) {
      throw new AgentPlatError('VALIDATION_ERROR', 'content is required');
    }
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      this.assertRoomWritable(room);
      const artifact = await transaction.getArtifact(tenantId, artifactId);
      if (!artifact || artifact.roomId !== roomId)
        throw this.notFound('Artifact', artifactId);
      const state = await transaction.getRoomState(tenantId, roomId);
      if (
        state?.approvals.some(
          (approval) =>
            approval.targetType === 'artifact' &&
            approval.targetId === artifactId &&
            approval.status === 'requested'
        )
      ) {
        throw new AgentPlatError(
          'CONFLICT',
          'Resolve the requested approval before creating a new artifact version',
          { statusCode: 409 }
        );
      }
      const now = this.now();
      const version: ArtifactVersion = {
        id: this.id(),
        tenantId,
        artifactId,
        version: artifact.currentVersion + 1,
        content: input.content,
        contentType: input.contentType ?? 'application/json',
        createdBy: input.createdBy,
        createdAt: now,
      };
      await transaction.insertArtifactVersion(version);
      await transaction.updateArtifact({
        ...artifact,
        currentVersion: version.version,
        status: 'draft',
        updatedAt: now,
      });
      const event = this.event(
        tenantId,
        roomId,
        'artifact_updated',
        { roomId, artifactId, version: version.version },
        input.createdBy
      );
      await transaction.appendEvent(event);
      return { value: version, events: [event] };
    });
  }

  async requestApproval(
    tenantId: string,
    roomId: string,
    input: {
      id?: string;
      targetType: Approval['targetType'];
      targetId: string;
      action?: string;
      requestedBy?: string;
    }
  ): Promise<Approval> {
    if (!approvalTargetTypes.has(input.targetType)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'targetType is not supported'
      );
    }
    this.required(input.targetId, 'targetId');
    if (input.action !== undefined) this.required(input.action, 'action');
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      this.assertRoomWritable(room);
      let targetVersion: number | undefined;
      let action = input.action;
      if (input.targetType === 'artifact') {
        const artifact = await transaction.getArtifact(
          tenantId,
          input.targetId
        );
        if (!artifact || artifact.roomId !== roomId)
          throw this.notFound('Artifact', input.targetId);
        targetVersion = artifact.currentVersion;
        await transaction.updateArtifact({
          ...artifact,
          status: 'pending_approval',
          updatedAt: this.now(),
        });
      } else if (input.targetType === 'task') {
        const task = await transaction.getTask(tenantId, input.targetId);
        if (!task || task.roomId !== roomId)
          throw this.notFound('Task', input.targetId);
        action ??= `task.run.${task.actionLevel}`;
      } else if (input.targetType === 'room' && input.targetId !== roomId) {
        throw new AgentPlatError(
          'VALIDATION_ERROR',
          'Approval room target must match the current room'
        );
      }
      const state = await transaction.getRoomState(tenantId, roomId);
      if (
        input.requestedBy &&
        !state?.participants.some(
          (participant) => participant.id === input.requestedBy
        )
      ) {
        throw new AgentPlatError(
          'VALIDATION_ERROR',
          'requestedBy must be a room participant'
        );
      }
      if (
        state?.approvals.some(
          (candidate) =>
            candidate.status === 'requested' &&
            candidate.targetType === input.targetType &&
            candidate.targetId === input.targetId &&
            candidate.targetVersion === targetVersion &&
            candidate.action === action
        )
      ) {
        throw new AgentPlatError(
          'CONFLICT',
          'An approval is already requested for this target and action',
          { statusCode: 409 }
        );
      }
      const now = this.now();
      const approval: Approval = {
        id: input.id ?? this.id(),
        tenantId,
        roomId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetVersion,
        action,
        status: 'requested',
        requestedBy: input.requestedBy,
        createdAt: now,
        updatedAt: now,
      };
      const event = this.event(
        tenantId,
        roomId,
        'approval_requested',
        {
          roomId,
          approvalId: approval.id,
          targetType: approval.targetType,
          targetId: approval.targetId,
          targetVersion: approval.targetVersion ?? null,
        },
        input.requestedBy
      );
      await transaction.insertApproval(approval);
      await transaction.appendEvent(event);
      return { value: approval, events: [event] };
    });
  }

  async resolveApproval(
    tenantId: string,
    approvalId: string,
    status: Exclude<ApprovalStatus, 'requested'>,
    input: { decidedBy: string; comment?: string }
  ): Promise<Approval> {
    this.required(input.decidedBy, 'decidedBy');
    if (!['approved', 'rejected', 'needs_revision'].includes(status)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'Approval status is not supported'
      );
    }
    return this.mutate(tenantId, async (transaction) => {
      const approval = await transaction.getApproval(tenantId, approvalId);
      if (!approval) throw this.notFound('Approval', approvalId);
      if (approval.status !== 'requested') {
        throw new AgentPlatError(
          'CONFLICT',
          'Approval has already been resolved'
        );
      }
      const state = await transaction.getRoomState(tenantId, approval.roomId);
      if (!state) throw this.notFound('Room', approval.roomId);
      this.assertRoomWritable(state.room);
      const decider = state.participants.find(
        (participant) => participant.id === input.decidedBy
      );
      if (!decider || decider.type !== 'human') {
        throw new AgentPlatError(
          'FORBIDDEN',
          'Approvals must be resolved by a human room participant'
        );
      }
      const approvalPermissions = [
        '*',
        'approve',
        'approval.resolve',
        `approve:${approval.targetType}`,
        ...(approval.action ? [`approve:${approval.action}`] : []),
      ];
      if (
        !decider.permissions.some((permission) =>
          approvalPermissions.includes(permission)
        )
      ) {
        throw new AgentPlatError(
          'FORBIDDEN',
          'Participant does not have permission to resolve this approval'
        );
      }
      const now = this.now();
      const resolved: Approval = {
        ...approval,
        status,
        decidedBy: input.decidedBy,
        comment: input.comment,
        updatedAt: now,
        decidedAt: now,
      };
      await transaction.updateApproval(resolved);
      if (approval.targetType === 'artifact') {
        const artifact = await transaction.getArtifact(
          tenantId,
          approval.targetId
        );
        if (!artifact || artifact.roomId !== approval.roomId) {
          throw this.notFound('Artifact', approval.targetId);
        }
        if (artifact.currentVersion !== approval.targetVersion) {
          throw new AgentPlatError(
            'CONFLICT',
            'Approval does not target the artifact current version',
            { statusCode: 409 }
          );
        }
        await transaction.updateArtifact({
          ...artifact,
          status,
          updatedAt: now,
        });
      } else if (approval.targetType === 'task') {
        const task = await transaction.getTask(tenantId, approval.targetId);
        if (!task || task.roomId !== approval.roomId) {
          throw this.notFound('Task', approval.targetId);
        }
      } else if (
        approval.targetType === 'room' &&
        approval.targetId !== approval.roomId
      ) {
        throw new AgentPlatError(
          'VALIDATION_ERROR',
          'Approval room target is invalid'
        );
      }
      const eventTypes: Record<typeof status, RoomEventType> = {
        approved: 'approval_granted',
        rejected: 'approval_rejected',
        needs_revision: 'approval_needs_revision',
      };
      const event = this.event(
        tenantId,
        approval.roomId,
        eventTypes[status],
        { roomId: approval.roomId, approvalId, targetId: approval.targetId },
        input.decidedBy
      );
      await transaction.appendEvent(event);
      return { value: resolved, events: [event] };
    });
  }

  async createPolicy(
    tenantId: string,
    roomId: string,
    input: CreatePolicyInput,
    actorId?: string
  ): Promise<Policy> {
    this.required(input.name, 'name');
    this.stringArray(input.allowedActions, 'allowedActions');
    this.stringArray(input.deniedActions, 'deniedActions');
    this.stringArray(input.requiredApprovals, 'requiredApprovals');
    this.stringArray(input.toolPermissions, 'toolPermissions');
    this.stringArray(input.memoryAccessRules, 'memoryAccessRules');
    if (
      input.escalationRules !== undefined &&
      (!Array.isArray(input.escalationRules) ||
        input.escalationRules.some(
          (rule) => !rule || typeof rule !== 'object' || Array.isArray(rule)
        ))
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'escalationRules must be an array of objects'
      );
    }
    if (
      (input.memoryAccessRules ?? []).some((scope) => !memoryScopes.has(scope))
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'memoryAccessRules contains an unsupported scope'
      );
    }
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      this.assertRoomWritable(room);
      const now = this.now();
      const policy: Policy = {
        id: input.id ?? this.id(),
        tenantId,
        roomId,
        name: input.name,
        allowedActions: input.allowedActions ?? [],
        deniedActions: input.deniedActions ?? [],
        requiredApprovals: input.requiredApprovals ?? [],
        escalationRules: input.escalationRules ?? [],
        toolPermissions: input.toolPermissions ?? [],
        memoryAccessRules: input.memoryAccessRules ?? ['room'],
        createdAt: now,
        updatedAt: now,
      };
      const event = this.event(
        tenantId,
        roomId,
        'policy_created',
        { roomId, policyId: policy.id },
        actorId
      );
      await transaction.insertPolicy(policy);
      await transaction.appendEvent(event);
      return { value: policy, events: [event] };
    });
  }

  async writeMemory(
    tenantId: string,
    roomId: string,
    input: WriteMemoryInput,
    actorId?: string
  ): Promise<MemoryEntry> {
    this.required(input.source, 'source');
    if (input.content === undefined) {
      throw new AgentPlatError('VALIDATION_ERROR', 'content is required');
    }
    if (!memoryScopes.has(input.scope)) {
      throw new AgentPlatError('VALIDATION_ERROR', 'scope is not supported');
    }
    if (input.retention && !memoryRetentions.has(input.retention)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'retention is not supported'
      );
    }
    if (input.retention === 'until' && !input.retainUntil) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'retainUntil is required when retention is until'
      );
    }
    if (['agent', 'role', 'artifact'].includes(input.scope) && !input.scopeId) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'scopeId is required for scoped memory'
      );
    }
    if (
      !Number.isFinite(input.confidence ?? 1) ||
      (input.confidence ?? 1) < 0 ||
      (input.confidence ?? 1) > 1
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'confidence must be between 0 and 1'
      );
    }
    if (
      input.retainUntil !== undefined &&
      Number.isNaN(new Date(input.retainUntil).getTime())
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'retainUntil must be a valid ISO date-time'
      );
    }
    return this.mutate(tenantId, async (transaction) => {
      const room = await this.requireRoom(transaction, tenantId, roomId);
      this.assertRoomWritable(room);
      const state = await transaction.getRoomState(tenantId, roomId);
      let scopeId = input.scopeId;
      if (input.scope === 'agent') {
        if (
          !state?.participants.some((participant) => participant.id === scopeId)
        ) {
          throw new AgentPlatError(
            'VALIDATION_ERROR',
            'Agent memory scopeId must be a room participant'
          );
        }
      } else if (input.scope === 'role') {
        if (
          !state?.participants.some(
            (participant) => participant.role === scopeId
          )
        ) {
          throw new AgentPlatError(
            'VALIDATION_ERROR',
            'Role memory scopeId must be present in the room'
          );
        }
      } else if (input.scope === 'artifact') {
        const artifact = scopeId
          ? await transaction.getArtifact(tenantId, scopeId)
          : undefined;
        if (!artifact || artifact.roomId !== roomId) {
          throw new AgentPlatError(
            'VALIDATION_ERROR',
            'Artifact memory scopeId must belong to the room'
          );
        }
      } else if (input.scope === 'organization') {
        if (scopeId && scopeId !== tenantId) {
          throw new AgentPlatError(
            'VALIDATION_ERROR',
            'Organization memory scopeId must match the current tenant'
          );
        }
        scopeId = tenantId;
      } else {
        scopeId = roomId;
      }
      const entry: MemoryEntry = {
        id: input.id ?? this.id(),
        tenantId,
        roomId: input.scope === 'organization' ? undefined : roomId,
        scope: input.scope,
        scopeId,
        content: input.content,
        source: input.source,
        confidence: input.confidence ?? 1,
        retention: input.retention ?? 'durable',
        retainUntil: input.retainUntil,
        provenance: input.provenance ?? {},
        createdAt: this.now(),
      };
      const event = this.event(
        tenantId,
        roomId,
        'memory_written',
        { roomId, memoryId: entry.id, scope: entry.scope },
        actorId
      );
      await transaction.insertMemory(entry);
      await transaction.appendEvent(event);
      return { value: entry, events: [event] };
    });
  }

  async getRoomState(tenantId: string, roomId: string): Promise<RoomState> {
    const state = await this.repository.getRoomState(tenantId, roomId);
    if (!state) throw this.notFound('Room', roomId);
    return state;
  }

  async listRooms(tenantId: string): Promise<Room[]> {
    return this.repository.listRooms(tenantId);
  }

  async listEvents(tenantId: string, roomId: string): Promise<DomainEvent[]> {
    if (!(await this.repository.getRoom(tenantId, roomId)))
      throw this.notFound('Room', roomId);
    return this.repository.listEvents(tenantId, roomId);
  }

  private async mutate<T>(
    tenantId: string,
    work: (transaction: RoomRepositoryTransaction) => Promise<MutationResult<T>>
  ): Promise<T> {
    this.required(tenantId, 'tenantId');
    const result = await this.repository.transaction(tenantId, work);
    await this.publish(result.events);
    return result.value;
  }

  private async publish(events: DomainEvent[]): Promise<void> {
    if (!this.eventPublisher) return;
    for (const event of events) {
      try {
        await this.eventPublisher.publish(event);
      } catch (error) {
        try {
          this.onEventPublishError(error, event);
        } catch {
          // State and its durable event already committed. Observability
          // hooks must not change the outcome of the domain operation.
        }
      }
    }
  }

  private async appendEvents(
    transaction: RoomRepositoryTransaction,
    events: DomainEvent[]
  ): Promise<void> {
    for (const event of events) await transaction.appendEvent(event);
  }

  private async requireRoom(
    transaction: RoomRepositoryTransaction,
    tenantId: string,
    roomId: string
  ): Promise<Room> {
    const room = await transaction.getRoom(tenantId, roomId);
    if (!room) throw this.notFound('Room', roomId);
    return room;
  }

  private async requireRoomParticipant(
    transaction: RoomRepositoryTransaction,
    tenantId: string,
    roomId: string,
    participantId: string
  ): Promise<Participant> {
    const state = await transaction.getRoomState(tenantId, roomId);
    const participant = state?.participants.find(
      (item) => item.id === participantId
    );
    if (!participant) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        `Participant \"${participantId}\" is not in this room`
      );
    }
    return participant;
  }

  private resolveAgentParticipant(
    state: RoomState,
    task: RoomTask
  ): Participant {
    const participant = task.assignedParticipantId
      ? state.participants.find(
          (candidate) => candidate.id === task.assignedParticipantId
        )
      : state.participants.find(
          (candidate) =>
            candidate.type === 'agent' &&
            (!task.assignedRole || candidate.role === task.assignedRole)
        );
    if (!participant || participant.type !== 'agent') {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'Task requires an assigned agent participant'
      );
    }
    return participant;
  }

  private assertRoomWritable(room: Room): void {
    if (room.status === 'completed' || room.status === 'archived') {
      throw new AgentPlatError(
        'CONFLICT',
        `Room is ${room.status} and cannot be modified`,
        { statusCode: 409 }
      );
    }
  }

  private parseArtifactOutput(
    result: JsonObject | undefined,
    task: RoomTask,
    output?: string
  ): {
    type: string;
    title: string;
    content: JsonValue;
    contentType: string;
    assumptions: string[];
    risks: string[];
  } {
    const candidate = result?.artifact;
    const artifact =
      candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        ? (candidate as JsonObject)
        : {};
    const strings = (value: JsonValue | undefined): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
    return {
      type:
        typeof artifact.type === 'string'
          ? artifact.type
          : task.expectedArtifactKind,
      title:
        typeof artifact.title === 'string'
          ? artifact.title
          : `${task.stepId} output`,
      content: artifact.content ?? output ?? '',
      contentType:
        typeof artifact.contentType === 'string'
          ? artifact.contentType
          : 'text/plain',
      assumptions: strings(artifact.assumptions),
      risks: strings(artifact.risks),
    };
  }

  private event(
    tenantId: string,
    roomId: string,
    type: RoomEventType,
    payload: JsonObject,
    actorId?: string
  ): DomainEvent {
    return {
      id: this.id(),
      tenantId,
      roomId,
      type,
      source: 'agentplat.rooms',
      subject: { type: 'room', id: roomId, tenantId },
      payload,
      metadata: actorId ? { actorId } : undefined,
      actorId,
      occurredAt: this.now(),
    };
  }

  private toJson(value: unknown): JsonObject {
    return JSON.parse(JSON.stringify(value)) as JsonObject;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    onTimeout?: (error: AgentPlatError) => void
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        const error = new AgentPlatError(
          'ADAPTER_ERROR',
          `Agent runtime timed out after ${timeoutMs}ms`
        );
        try {
          onTimeout?.(error);
        } catch {
          // Cancellation is cooperative. A provider-specific abort hook must
          // not prevent the timeout from fencing the persisted run.
        }
        reject(error);
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timedOut]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  private id(): string {
    return this.idGenerator();
  }

  private leaseExpiresAt(startedAt: string): string {
    return new Date(
      new Date(startedAt).getTime() + this.runTimeoutMs + this.runLeaseGraceMs
    ).toISOString();
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private required(value: unknown, field: string): void {
    if (typeof value !== 'string' || !value.trim()) {
      throw new AgentPlatError('VALIDATION_ERROR', `${field} is required`);
    }
  }

  private stringArray(value: unknown, field: string): void {
    if (
      value !== undefined &&
      (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        `${field} must be an array of strings`
      );
    }
  }

  private notFound(label: string, id: string): AgentPlatError {
    return new AgentPlatError('NOT_FOUND', `${label} \"${id}\" was not found`, {
      statusCode: 404,
    });
  }
}
