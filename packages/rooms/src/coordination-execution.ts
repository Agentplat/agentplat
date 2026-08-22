import { AgentPlatError } from "@agentplat/core";
import type { JsonObject } from "@agentplat/core";
import type {
  AgentDefinitionRegistry,
  RegisteredAgentRevision,
} from "./agent-registry.js";
import type { AgentRoomCoordinationExecutionPort } from "./coordination-runtime.js";
import type { RoomExecutionCoordinator } from "./execution-session.js";
import type {
  AgentRoomHandoffCoordinator,
  RoomHandoff,
} from "./room-handoff.js";
import type { Participant, RoomRun, RoomState, RoomTask } from "./models.js";
import type { CreateTaskInput, RoomService } from "./service.js";
import type { RoomRunCheckpointHandler } from "./checkpoint-execution.js";

/** Minimal governed Room operations required by the coordination executor. */
export interface CoordinationRoomServicePort {
  getRoomState(tenantId: string, roomId: string): Promise<RoomState>;
  createTask(
    tenantId: string,
    roomId: string,
    input: CreateTaskInput,
    actorId?: string,
  ): Promise<RoomTask>;
  runTask(
    tenantId: string,
    roomId: string,
    taskId: string,
    hooks?: Parameters<RoomService["runTask"]>[3],
  ): Promise<RoomRun>;
}

/**
 * Materializes stable coordination operations into ordinary policy-checked
 * Room tasks, runs, execution sessions and Handoff reconciliation.
 */
export class DefaultAgentRoomCoordinationExecutionPort implements AgentRoomCoordinationExecutionPort {
  constructor(
    private readonly rooms: CoordinationRoomServicePort,
    private readonly definitions: Pick<
      AgentDefinitionRegistry,
      "listRevisions"
    >,
    private readonly executionSessions: RoomExecutionCoordinator,
    private readonly handoffs: AgentRoomHandoffCoordinator,
    private readonly checkpoints?: RoomRunCheckpointHandler,
  ) {}

  async dispatchMessage(input: {
    tenantId: string;
    roomId: string;
    messageId: string;
    participantIds: string[];
    operationId: string;
  }) {
    const state = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const message = state.messages.find(
      (candidate) => candidate.id === input.messageId,
    );
    if (!message)
      throw new AgentPlatError("NOT_FOUND", "Coordination message not found");
    const runIds: string[] = [];
    for (const participantId of input.participantIds) {
      const participant = requireAgentParticipant(state, participantId);
      const revision = await this.publishedRevision(
        input.tenantId,
        participant,
      );
      const task = await this.ensureTask({
        tenantId: input.tenantId,
        roomId: input.roomId,
        participant,
        operationId: `${input.operationId}:${participant.id}`,
        instruction: message.content,
        metadata: {
          coordinationOperationId: input.operationId,
          sourceMessageId: message.id,
          agentRevisionId: revision.definition.revisionId,
          agentRevisionDigest: revision.definition.digest,
        },
      });
      const run = await this.executeTask(
        input.tenantId,
        input.roomId,
        task,
        revision.definition.revisionId,
      );
      runIds.push(run.id);
    }
    return { status: "completed" as const, runIds };
  }

  async dispatchHandoff(input: { handoff: RoomHandoff; operationId: string }) {
    const handoff = input.handoff;
    if (handoff.status === "completed") {
      return {
        status: "completed" as const,
        runIds: handoff.targetRunId ? [handoff.targetRunId] : [],
      };
    }
    if (handoff.status !== "accepted") {
      throw new AgentPlatError(
        "CONFLICT",
        "Execution requires an accepted Handoff",
      );
    }
    const state = await this.rooms.getRoomState(
      handoff.tenantId,
      handoff.roomId,
    );
    const participant = requireAgentParticipant(
      state,
      handoff.targetParticipantId,
    );
    const task = await this.ensureTask({
      tenantId: handoff.tenantId,
      roomId: handoff.roomId,
      participant,
      operationId: input.operationId,
      instruction: handoff.instruction,
      metadata: {
        coordinationOperationId: input.operationId,
        handoffId: handoff.handoffId,
        authorityCeiling: handoff.authorityCeiling,
        contextMessageIds: handoff.contextMessageIds,
        contextArtifactIds: handoff.contextArtifactIds,
        agentRevisionId: handoff.targetAgentRevisionId,
        agentRevisionDigest: handoff.targetAgentRevisionDigest,
      },
    });
    let handoffRevision = handoff.revision;
    let activeSessionId = "";
    const run = await this.rooms.runTask(
      handoff.tenantId,
      handoff.roomId,
      task.id,
      {
        onStarted: async ({ run: started }) => {
          activeSessionId = sessionId(
            input.operationId,
            participant.id,
            started.id,
          );
          await this.executionSessions.openSession({
            tenantId: handoff.tenantId,
            roomId: handoff.roomId,
            sessionId: activeSessionId,
            runId: started.id,
            agentRevisionId: handoff.targetAgentRevisionId,
          });
          const bound = await this.handoffs.bindRun({
            tenantId: handoff.tenantId,
            roomId: handoff.roomId,
            handoffId: handoff.handoffId,
            expectedRevision: handoffRevision,
            targetTaskId: task.id,
            targetRunId: started.id,
          });
          handoffRevision = bound.revision;
        },
        onCheckpoint: ({ checkpoint, run, payload }) =>
          this.handleCheckpoint(
            handoff.tenantId,
            handoff.roomId,
            activeSessionId,
            run.id,
            checkpoint,
            payload,
          ),
      },
    );
    await this.executionSessions.reconcileSession({
      tenantId: handoff.tenantId,
      roomId: handoff.roomId,
      sessionId: activeSessionId,
      expectedRevision: 0,
    });
    await this.handoffs.reconcile({
      tenantId: handoff.tenantId,
      roomId: handoff.roomId,
      handoffId: handoff.handoffId,
      expectedRevision: handoffRevision,
    });
    return { status: "completed" as const, runIds: [run.id] };
  }

  private async executeTask(
    tenantId: string,
    roomId: string,
    task: RoomTask,
    agentRevisionId: string,
  ) {
    const state = await this.rooms.getRoomState(tenantId, roomId);
    if (task.status === "completed") {
      const prior = state.runs.find(
        (run) => run.taskId === task.id && run.status === "completed",
      );
      if (!prior)
        throw new AgentPlatError(
          "CONFLICT",
          "Completed task has no completed run",
        );
      return prior;
    }
    let sessionRevision = 0;
    let activeSessionId = "";
    const run = await this.rooms.runTask(tenantId, roomId, task.id, {
      onStarted: async ({ run: started, participant }) => {
        activeSessionId = sessionId(task.id, participant.id, started.id);
        const session = await this.executionSessions.openSession({
          tenantId,
          roomId,
          sessionId: activeSessionId,
          runId: started.id,
          agentRevisionId,
        });
        sessionRevision = session.revision;
      },
      onCheckpoint: ({ checkpoint, run, payload }) =>
        this.handleCheckpoint(
          tenantId,
          roomId,
          activeSessionId,
          run.id,
          checkpoint,
          payload,
        ),
    });
    await this.executionSessions.reconcileSession({
      tenantId,
      roomId,
      sessionId: activeSessionId,
      expectedRevision: sessionRevision,
    });
    return run;
  }

  private async handleCheckpoint(
    tenantId: string,
    roomId: string,
    executionSessionId: string,
    runId: string,
    checkpoint: "pre_step" | "post_output" | "pre_action",
    payload?: JsonObject,
  ) {
    return (
      (await this.checkpoints?.handle({
        tenantId,
        roomId,
        sessionId: executionSessionId,
        runId,
        checkpoint,
        payload,
      })) ?? { allowed: true as const }
    );
  }

  private async ensureTask(input: {
    tenantId: string;
    roomId: string;
    participant: Participant;
    operationId: string;
    instruction: string;
    metadata: JsonObject;
  }) {
    const id = await deterministicId("coordination-task", input.operationId);
    const state = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const existing = state.tasks.find((candidate) => candidate.id === id);
    if (existing) {
      if (
        existing.assignedParticipantId !== input.participant.id ||
        existing.metadata?.coordinationOperationId !==
          input.metadata.coordinationOperationId
      ) {
        throw new AgentPlatError(
          "CONFLICT",
          "Deterministic coordination task binding conflict",
        );
      }
      return existing;
    }
    return this.rooms.createTask(
      input.tenantId,
      input.roomId,
      {
        id,
        stepId: id,
        assignedParticipantId: input.participant.id,
        instruction: input.instruction,
        expectedOutput: "A result satisfying the delegated instruction",
        expectedArtifactKind: "coordination-result",
        actionLevel: "draft",
        metadata: input.metadata,
      },
      input.participant.id,
    );
  }

  private async publishedRevision(tenantId: string, participant: Participant) {
    const agentId =
      typeof participant.metadata?.agentId === "string"
        ? participant.metadata.agentId
        : participant.id;
    const published = (await this.definitions.listRevisions(tenantId, agentId))
      .filter((item) => item.lifecycle.status === "published")
      .sort((left, right) =>
        right.definition.version.localeCompare(left.definition.version),
      );
    if (!published[0]) {
      throw new AgentPlatError(
        "CONFLICT",
        "No published agent revision is available",
      );
    }
    return published[0];
  }
}

function requireAgentParticipant(state: RoomState, participantId: string) {
  const participant = state.participants.find(
    (candidate) => candidate.id === participantId,
  );
  if (!participant || participant.type !== "agent") {
    throw new AgentPlatError("NOT_FOUND", "Agent Room participant not found");
  }
  return participant;
}

function sessionId(operationId: string, participantId: string, runId: string) {
  return `execution:${operationId}:${participantId}:${runId}`;
}

async function deterministicId(domain: string, value: string) {
  const bytes = new TextEncoder().encode(`${domain}\u0000${value}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `${domain}:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}
