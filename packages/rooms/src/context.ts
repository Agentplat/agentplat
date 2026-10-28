import { AgentPlatError } from '@agentplat/core';
import { conversationReference, compareRoomMessages } from './conversations.js';
import type {
  AssembledTaskContext,
  MemoryEntry,
  Participant,
  RoomState,
  RoomTask,
} from './models.js';

/** Trusted host policy, never a scope selected by model-generated task arguments. */
export type RoomContextSelection = {
  scope: 'room' | 'thread';
  threadId?: string;
  messageIds?: string[];
  artifactIds?: string[];
  memoryIds?: string[];
};

export interface ContextBuilderOptions {
  transcriptLimit?: number;
  artifactLimit?: number;
  memoryLimit?: number;
  clock?: () => Date;
  /** Explicit host grant for coordinator access or selected cross-thread evidence. */
  selectContext?(
    state: RoomState,
    task: RoomTask,
    participant: Participant,
  ): RoomContextSelection;
  maximumContextBytes?: number;
}

export class BoundedContextBuilder {
  private readonly transcriptLimit: number;
  private readonly artifactLimit: number;
  private readonly memoryLimit: number;
  private readonly clock: () => Date;
  private readonly selectContext?: ContextBuilderOptions['selectContext'];
  private readonly maximumContextBytes?: number;

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
    this.selectContext = options.selectContext;
    this.maximumContextBytes =
      options.maximumContextBytes === undefined
        ? undefined
        : this.validLimit(options.maximumContextBytes, 'maximumContextBytes');
  }

  build(
    state: RoomState,
    task: RoomTask,
    participant: Participant
  ): AssembledTaskContext {
    if (
      task.roomId !== state.room.id ||
      task.tenantId !== state.room.tenantId
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'Task does not belong to the room'
      );
    }
    // Validate membership even with memoryLimit=0 and before invoking host policy.
    const readableMemory = readableRoomMemory(state, participant, this.clock());
    const selection =
      this.selectContext?.(
        structuredClone(state),
        structuredClone(task),
        structuredClone(participant),
      ) ??
      (task.threadId
        ? { scope: 'thread' as const, threadId: task.threadId }
        : { scope: 'room' as const });
    if (!['room', 'thread'].includes(selection.scope))
      throw new AgentPlatError('VALIDATION_ERROR', 'Invalid context scope');
    const threadId =
      selection.scope === 'thread'
        ? (selection.threadId ?? task.threadId)
        : undefined;
    const messages = state.messages.filter(
      (message) =>
        message.tenantId === state.room.tenantId &&
        message.roomId === state.room.id,
    );
    if (selection.scope === 'thread') {
      const root = messages.find((message) => message.id === threadId);
      if (
        !root ||
        root.replyToMessageId ||
        (root.threadId && root.threadId !== root.id)
      )
        throw new AgentPlatError(
          'VALIDATION_ERROR',
          'Context thread is not a root in this Room',
        );
      if (
        task.replyToMessageId &&
        !messages.some(
          (message) =>
            message.id === task.replyToMessageId &&
            (message.threadId ?? message.id) === task.threadId,
        )
      )
        throw new AgentPlatError(
          'VALIDATION_ERROR',
          'Task reply is not in its thread',
        );
    }
    const selectedMessages = messages.filter(
      (message) =>
        !threadId ||
        (message.threadId ?? message.id) === threadId ||
        selection.messageIds?.includes(message.id),
    );
    const selectedMessageIds = new Set(
      selectedMessages.map((message) => message.id),
    );
    for (const id of selection.messageIds ?? [])
      if (!selectedMessageIds.has(id))
        throw new AgentPlatError(
          'FORBIDDEN',
          'Selected message is not in this Room',
        );
    const transcript = selectedMessages
      .sort(compareRoomMessages)
      .slice(this.startFor(this.transcriptLimit));
    const anchor =
      task.replyToMessageId &&
      selectedMessages.find((message) => message.id === task.replyToMessageId);
    if (
      this.transcriptLimit > 0 &&
      anchor &&
      !transcript.some((message) => message.id === anchor.id)
    ) {
      transcript.shift();
      transcript.push(anchor);
      transcript.sort(compareRoomMessages);
    }
    const artifacts = [...state.artifacts]
      .filter(
        (artifact) =>
          artifact.tenantId === state.room.tenantId &&
          artifact.roomId === state.room.id &&
          (!threadId ||
            selection.artifactIds?.includes(artifact.id) ||
            (artifact.provenance.sourceMessageIds.length > 0 &&
              artifact.provenance.sourceMessageIds.every((id) =>
                selectedMessageIds.has(id),
              ))),
      )
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
    const memory = readableMemory
      .filter(
        (entry) =>
          !threadId ||
          selection.memoryIds?.includes(entry.id) ||
          entry.provenance.threadId === threadId ||
          entry.provenance.shared === true ||
          (entry.scope === 'agent' && entry.scopeId === participant.id),
      )
      .slice(this.startFor(this.memoryLimit));

    const context: AssembledTaskContext = {
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
        ...conversationReference(task),
      },
      transcript,
      artifacts,
      memory,
      policies: state.policies,
      provenance: {
        messageIds: transcript.map((message) => message.id),
        artifactIds: artifacts.map((artifact) => artifact.id),
        memoryIds: memory.map((entry) => entry.id),
        ...(threadId
          ? {
              threadId,
              omittedMessageCount: selectedMessages.length - transcript.length,
            }
          : {}),
      },
    };
    const budget = this.maximumContextBytes ?? (threadId ? 64_000 : undefined);
    if (budget !== undefined) {
      const bytes = () =>
        new TextEncoder().encode(JSON.stringify(context)).length;
      while (bytes() > budget) {
        const removable = context.transcript.findIndex(
          (message) => message.id !== task.replyToMessageId,
        );
        if (removable >= 0) context.transcript.splice(removable, 1);
        else if (context.artifacts.length) context.artifacts.shift();
        else if (context.memory.length) context.memory.shift();
        else
          throw new AgentPlatError(
            'VALIDATION_ERROR',
            'Required task context exceeds the byte budget',
          );
        context.provenance.messageIds = context.transcript.map(
          (message) => message.id,
        );
        context.provenance.artifactIds = context.artifacts.map(
          (artifact) => artifact.id,
        );
        context.provenance.memoryIds = context.memory.map((entry) => entry.id);
        if (threadId)
          context.provenance.omittedMessageCount =
            selectedMessages.length - context.transcript.length;
      }
    }
    return context;
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
