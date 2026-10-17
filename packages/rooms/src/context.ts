import { AgentPlatError } from '@agentplat/core';
import type {
  AssembledTaskContext,
  MemoryEntry,
  Participant,
  RoomState,
  RoomTask,
} from './models.js';

export interface ContextBuilderOptions {
  transcriptLimit?: number;
  artifactLimit?: number;
  memoryLimit?: number;
  clock?: () => Date;
}

export class BoundedContextBuilder {
  private readonly transcriptLimit: number;
  private readonly artifactLimit: number;
  private readonly memoryLimit: number;
  private readonly clock: () => Date;

  constructor(options: ContextBuilderOptions = {}) {
    this.transcriptLimit = this.validLimit(
      options.transcriptLimit ?? 20,
      'transcriptLimit'
    );
    this.artifactLimit = this.validLimit(
      options.artifactLimit ?? 10,
      'artifactLimit'
    );
    this.memoryLimit = this.validLimit(
      options.memoryLimit ?? 20,
      'memoryLimit'
    );
    this.clock = options.clock ?? (() => new Date());
  }

  build(
    state: RoomState,
    task: RoomTask,
    participant: Participant
  ): AssembledTaskContext {
    if (task.roomId !== state.room.id) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'Task does not belong to the room'
      );
    }
    const transcript = [...state.messages]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(this.startFor(this.transcriptLimit));
    const artifacts = [...state.artifacts]
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(this.startFor(this.artifactLimit))
      .map(({ versions, ...artifact }) => {
        const current = versions.find(
          (version) => version.version === artifact.currentVersion
        );
        return {
          ...artifact,
          content: current?.content,
          contentType: current?.contentType,
        };
      });
    const memory = readableRoomMemory(state, participant, this.clock()).slice(
      this.startFor(this.memoryLimit)
    );

    return {
      agentIdentity: {
        participantId: participant.id,
        displayName: participant.displayName,
        role: participant.role,
        authorityLevel: participant.authorityLevel,
        boundaries: participant.boundaries,
      },
      room: { id: state.room.id, goal: state.room.goal },
      task: {
        id: task.id,
        instruction: task.instruction,
        expectedOutput: task.expectedOutput,
        acceptanceCriteria: task.acceptanceCriteria,
      },
      transcript,
      artifacts,
      memory,
      policies: state.policies,
      provenance: {
        messageIds: transcript.map((message) => message.id),
        artifactIds: artifacts.map((artifact) => artifact.id),
        memoryIds: memory.map((entry) => entry.id),
      },
    };
  }

  private validLimit(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        `${name} must be a non-negative integer`
      );
    }
    return value;
  }

  private startFor(limit: number): number {
    return limit === 0 ? Number.POSITIVE_INFINITY : -limit;
  }
}

/** Shared legacy memory view for context assembly and tool retrieval. */
export function readableRoomMemory(
  state: RoomState,
  participant: Participant,
  now: Date = new Date()
): MemoryEntry[] {
  if (
    participant.tenantId !== state.room.tenantId ||
    !state.participants.some(
      (p) => p.id === participant.id && p.tenantId === participant.tenantId
    )
  ) {
    throw new AgentPlatError(
      'FORBIDDEN',
      'Memory reader is not a Room participant'
    );
  }
  return state.memory
    .filter((entry) => {
      if (entry.tenantId !== state.room.tenantId) return false;
      if (
        entry.retention === 'until' &&
        (!entry.retainUntil ||
          !Number.isFinite(Date.parse(entry.retainUntil)) ||
          Date.parse(entry.retainUntil) <= now.getTime())
      )
        return false;
      const scope = entry.scope;
      const target =
        scope === 'ephemeral' || scope === 'room'
          ? !entry.scopeId || entry.scopeId === state.room.id
          : scope === 'agent'
            ? entry.scopeId === participant.id
            : scope === 'role'
              ? entry.scopeId === participant.role
              : scope === 'artifact'
                ? state.artifacts.some((a) => a.id === entry.scopeId)
                : scope === 'organization' &&
                  entry.scopeId === state.room.tenantId;
      return (
        target &&
        (scope === 'ephemeral' ||
          scope === 'room' ||
          scope === participant.memoryScope ||
          state.policies.some((p) => p.memoryAccessRules.includes(scope)))
      );
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
