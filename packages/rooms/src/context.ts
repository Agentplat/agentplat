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
    const memory = state.memory
      .filter((entry) => this.canReadMemory(entry, participant, state))
      .filter(
        (entry) =>
          entry.retention !== 'until' ||
          !entry.retainUntil ||
          new Date(entry.retainUntil).getTime() > this.clock().getTime()
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(this.startFor(this.memoryLimit));

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

  private canReadMemory(
    entry: MemoryEntry,
    participant: Participant,
    state: RoomState
  ): boolean {
    const scope = entry.scope;

    const targetsParticipant =
      (scope === 'ephemeral' || scope === 'room') &&
      (!entry.scopeId || entry.scopeId === state.room.id)
        ? true
        : scope === 'agent'
          ? entry.scopeId === participant.id
          : scope === 'role'
            ? entry.scopeId === participant.role
            : scope === 'artifact'
              ? state.artifacts.some(
                  (artifact) => artifact.id === entry.scopeId
                )
              : scope === 'organization';
    if (!targetsParticipant) return false;
    if (scope === 'ephemeral' || scope === 'room') return true;
    if (scope === participant.memoryScope) return true;

    return state.policies.some((policy) =>
      policy.memoryAccessRules.includes(scope as never)
    );
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
