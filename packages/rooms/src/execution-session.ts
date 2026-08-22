import { AgentPlatError } from "@agentplat/core";
import type { ISODateTime } from "@agentplat/core";
import type { AgentRoomStateReader } from "./coordination.js";

/** Durable lifecycle of one Room run execution session. */
export type RoomExecutionSessionStatus =
  "active" | "paused" | "completed" | "failed" | "canceled";

/** Provider execution boundary at which an intervention may be applied. */
export type RunInterventionCheckpoint =
  "pre_step" | "post_output" | "pre_action";

/** Durable lifecycle of a requested run intervention. */
export type RunInterventionStatus =
  "pending" | "dispatching" | "applied" | "rejected";

/** Revision-bound human request to alter or stop an active execution. */
export interface RunIntervention {
  operationId: string;
  requestedByParticipantId: string;
  instruction: string;
  checkpoint: RunInterventionCheckpoint;
  status: RunInterventionStatus;
  attempts: number;
  dispatchToken?: string;
  dispatchLeaseExpiresAt?: ISODateTime;
  requestedAt: ISODateTime;
  resolvedAt?: ISODateTime;
  resolutionReason?: string;
}

/** Append-only event retained by a Room execution session. */
export interface RoomExecutionSessionEvent {
  sequence: number;
  type:
    | "session_opened"
    | "intervention_requested"
    | "intervention_claimed"
    | "intervention_applied"
    | "intervention_rejected"
    | "session_reconciled";
  operationId?: string;
  checkpoint?: RunInterventionCheckpoint;
  occurredAt: ISODateTime;
}

/** Durable run binding, checkpoint state and intervention history. */
export interface RoomExecutionSession {
  tenantId: string;
  roomId: string;
  sessionId: string;
  runId: string;
  taskId: string;
  participantId: string;
  agentRevisionId?: string;
  agentRevisionDigest?: string;
  predecessorSessionId?: string;
  revision: number;
  status: RoomExecutionSessionStatus;
  interventions: RunIntervention[];
  events: RoomExecutionSessionEvent[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Compare-and-set persistence and Room-scoped execution discovery. */
export interface RoomExecutionSessionStore {
  load(
    tenantId: string,
    roomId: string,
    sessionId: string,
  ): Promise<RoomExecutionSession | undefined>;
  compareAndSet(input: {
    expectedRevision: number | null;
    state: RoomExecutionSession;
  }): Promise<boolean>;
  list(tenantId: string, roomId: string): Promise<RoomExecutionSession[]>;
}

/** Test-oriented in-memory execution session store. */
export class InMemoryRoomExecutionSessionStore implements RoomExecutionSessionStore {
  private readonly sessions = new Map<string, RoomExecutionSession>();

  async load(
    tenantId: string,
    roomId: string,
    sessionId: string,
  ): Promise<RoomExecutionSession | undefined> {
    const state = this.sessions.get(key(tenantId, roomId, sessionId));
    return state ? clone(state) : undefined;
  }

  async compareAndSet(input: {
    expectedRevision: number | null;
    state: RoomExecutionSession;
  }): Promise<boolean> {
    validateSession(input.state);
    const stateKey = key(
      input.state.tenantId,
      input.state.roomId,
      input.state.sessionId,
    );
    const current = this.sessions.get(stateKey);
    if (input.expectedRevision === null) {
      if (current || input.state.revision !== 0) return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      input.state.revision !== input.expectedRevision + 1
    ) {
      return false;
    }
    this.sessions.set(stateKey, clone(input.state));
    return true;
  }
  async list(tenantId: string, roomId: string) {
    return [...this.sessions.values()]
      .filter((state) => state.tenantId === tenantId && state.roomId === roomId)
      .map((state) => clone(state));
  }
}

/** Exact run, task, participant and agent revision bound at session creation. */
export interface OpenRoomExecutionSessionInput {
  tenantId: string;
  roomId: string;
  sessionId: string;
  runId: string;
  agentRevisionId?: string;
  predecessorSessionId?: string;
}

/** Resolves only published agent definition revisions for execution. */
export interface PublishedAgentRevisionResolver {
  resolvePublishedRevision(
    tenantId: string,
    revisionId: string,
  ): Promise<{
    agentId: string;
    revisionId: string;
    digest: string;
    runtimeProfile: Record<string, unknown>;
  }>;
}

/** Actor, checkpoint and command used to request a run intervention. */
export interface RequestRunInterventionInput {
  tenantId: string;
  roomId: string;
  sessionId: string;
  expectedRevision: number;
  operationId: string;
  requestedByParticipantId: string;
  instruction: string;
  checkpoint: RunInterventionCheckpoint;
}

/** Revision fence and outcome used to settle a run intervention. */
export interface ResolveRunInterventionInput {
  tenantId: string;
  roomId: string;
  sessionId: string;
  expectedRevision: number;
  operationId: string;
  resolution: "applied" | "rejected";
  reason?: string;
  dispatchToken?: string;
}

/** Lease and revision fence used by an intervention dispatcher. */
export interface ClaimRunInterventionInput {
  tenantId: string;
  roomId: string;
  sessionId: string;
  expectedRevision: number;
  checkpoint: RunInterventionCheckpoint;
  dispatchToken: string;
  leaseMs?: number;
}

/** Claimed intervention together with the session revision that owns it. */
export interface ClaimedRunIntervention {
  session: RoomExecutionSession;
  intervention: RunIntervention;
}

/** Governs resumable execution sessions and intervention lifecycle transitions. */
export class RoomExecutionCoordinator {
  private readonly clock: () => Date;

  constructor(
    private readonly rooms: AgentRoomStateReader,
    private readonly store: RoomExecutionSessionStore,
    private readonly options: {
      clock?: () => Date;
      agentRegistry?: PublishedAgentRevisionResolver;
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async openSession(
    input: OpenRoomExecutionSessionInput,
  ): Promise<RoomExecutionSession> {
    required(input.sessionId, "sessionId");
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    if (room.room.status !== "active") {
      throw new AgentPlatError(
        "CONFLICT",
        "Execution sessions require an active Agent Room",
      );
    }
    const run = room.runs.find((candidate) => candidate.id === input.runId);
    if (!run) throw new AgentPlatError("NOT_FOUND", "Room run not found");
    if (run.status !== "running") {
      throw new AgentPlatError(
        "CONFLICT",
        "Execution sessions require a running Room run",
      );
    }
    let agentRevisionDigest: string | undefined;
    if (this.options.agentRegistry) {
      if (!input.agentRevisionId) {
        throw new AgentPlatError(
          "VALIDATION_ERROR",
          "Execution session requires an agentRevisionId",
        );
      }
      const definition =
        await this.options.agentRegistry.resolvePublishedRevision(
          input.tenantId,
          input.agentRevisionId,
        );
      const participant = room.participants.find(
        (candidate) => candidate.id === run.participantId,
      );
      const registeredAgentId =
        typeof participant?.metadata?.agentId === "string"
          ? participant.metadata.agentId
          : participant?.id;
      if (!participant || registeredAgentId !== definition.agentId) {
        throw new AgentPlatError(
          "CONFLICT",
          "Agent revision does not match the assigned Room participant",
        );
      }
      const revisionPlatform = definition.runtimeProfile.platform;
      if (
        typeof revisionPlatform === "string" &&
        participant.runtime?.platform !== revisionPlatform
      ) {
        throw new AgentPlatError(
          "CONFLICT",
          "Agent revision runtime does not match the Room participant runtime",
        );
      }
      agentRevisionDigest = definition.digest;
    }
    if (input.predecessorSessionId) {
      const predecessor = await this.store.load(
        input.tenantId,
        input.roomId,
        input.predecessorSessionId,
      );
      if (!predecessor || predecessor.status !== "failed") {
        throw new AgentPlatError(
          "CONFLICT",
          "Execution session recovery requires a failed predecessor",
        );
      }
      if (predecessor.taskId !== run.taskId) {
        throw new AgentPlatError(
          "VALIDATION_ERROR",
          "Recovered execution session must preserve the Room task",
        );
      }
    }
    const now = this.now();
    const session: RoomExecutionSession = {
      tenantId: input.tenantId,
      roomId: input.roomId,
      sessionId: input.sessionId,
      runId: run.id,
      taskId: run.taskId,
      participantId: run.participantId,
      agentRevisionId: input.agentRevisionId,
      agentRevisionDigest,
      predecessorSessionId: input.predecessorSessionId,
      revision: 0,
      status: "active",
      interventions: [],
      events: [
        {
          sequence: 1,
          type: "session_opened",
          occurredAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    if (
      !(await this.store.compareAndSet({
        expectedRevision: null,
        state: session,
      }))
    ) {
      const existing = await this.store.load(
        input.tenantId,
        input.roomId,
        input.sessionId,
      );
      if (existing && sameSessionBinding(existing, session)) return existing;
      throw new AgentPlatError(
        "CONFLICT",
        "Execution session already exists with another binding",
      );
    }
    return clone(session);
  }

  async requestIntervention(
    input: RequestRunInterventionInput,
  ): Promise<RoomExecutionSession> {
    required(input.operationId, "operationId");
    required(input.instruction, "instruction");
    if (!["pre_step", "post_output", "pre_action"].includes(input.checkpoint)) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Run intervention checkpoint is invalid",
      );
    }
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const requester = room.participants.find(
      (participant) => participant.id === input.requestedByParticipantId,
    );
    if (!requester || requester.type !== "human") {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Run interventions require a human Agent Room participant",
      );
    }
    if (!requester.permissions.includes("run.intervene")) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Human participant lacks run.intervene permission",
      );
    }
    const current = await this.requireSession(input);
    const replay = current.interventions.find(
      (candidate) => candidate.operationId === input.operationId,
    );
    if (replay) {
      if (
        replay.instruction !== input.instruction ||
        replay.requestedByParticipantId !== input.requestedByParticipantId
      ) {
        throw new AgentPlatError(
          "CONFLICT",
          "Run intervention operationId is bound to another request",
        );
      }
      return current;
    }
    if (current.interventions.length >= 256) {
      throw new AgentPlatError(
        "CONFLICT",
        "Execution session intervention limit was reached",
      );
    }
    this.requireActive(current);
    if (
      !room.runs.some(
        (run) => run.id === current.runId && run.status === "running",
      )
    ) {
      throw new AgentPlatError(
        "CONFLICT",
        "Run intervention requires a running Room run",
      );
    }
    this.requireRevision(current, input.expectedRevision);
    const now = this.now();
    const next: RoomExecutionSession = {
      ...current,
      revision: current.revision + 1,
      interventions: [
        ...current.interventions,
        {
          operationId: input.operationId,
          requestedByParticipantId: input.requestedByParticipantId,
          instruction: input.instruction.trim(),
          checkpoint: input.checkpoint,
          status: "pending",
          attempts: 0,
          requestedAt: now,
        },
      ],
      events: appendSessionEvent(current, {
        type: "intervention_requested",
        operationId: input.operationId,
        checkpoint: input.checkpoint,
        occurredAt: now,
      }),
      updatedAt: now,
    };
    await this.commit(current.revision, next);
    return clone(next);
  }

  async getSession(input: {
    tenantId: string;
    roomId: string;
    sessionId: string;
  }): Promise<RoomExecutionSession> {
    return this.requireSession(input);
  }

  listSessions(tenantId: string, roomId: string) {
    return this.store.list(tenantId, roomId);
  }

  async listSessionEvents(
    input: {
      tenantId: string;
      roomId: string;
      sessionId: string;
    },
    afterSequence = 0,
  ): Promise<RoomExecutionSessionEvent[]> {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Execution session event sequence is invalid",
      );
    }
    const session = await this.requireSession(input);
    return session.events.filter((event) => event.sequence > afterSequence);
  }

  async claimIntervention(
    input: ClaimRunInterventionInput,
  ): Promise<ClaimedRunIntervention | null> {
    required(input.dispatchToken, "dispatchToken");
    const leaseMs = input.leaseMs ?? 30_000;
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 300_000) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Run intervention leaseMs must be between 1 and 300000",
      );
    }
    const current = await this.requireSession(input);
    this.requireActive(current);
    this.requireRevision(current, input.expectedRevision);
    const now = this.clock();
    const target = current.interventions.find(
      (candidate) =>
        candidate.checkpoint === input.checkpoint &&
        (candidate.status === "pending" ||
          (candidate.status === "dispatching" &&
            candidate.dispatchLeaseExpiresAt !== undefined &&
            new Date(candidate.dispatchLeaseExpiresAt).getTime() <=
              now.getTime())),
    );
    if (!target) return null;
    const next: RoomExecutionSession = {
      ...current,
      revision: current.revision + 1,
      interventions: current.interventions.map((candidate) =>
        candidate.operationId === target.operationId
          ? {
              ...candidate,
              status: "dispatching",
              attempts: candidate.attempts + 1,
              dispatchToken: input.dispatchToken,
              dispatchLeaseExpiresAt: new Date(
                now.getTime() + leaseMs,
              ).toISOString(),
            }
          : candidate,
      ),
      events: appendSessionEvent(current, {
        type: "intervention_claimed",
        operationId: target.operationId,
        checkpoint: target.checkpoint,
        occurredAt: now.toISOString(),
      }),
      updatedAt: now.toISOString(),
    };
    await this.commit(current.revision, next);
    return {
      session: clone(next),
      intervention: clone(
        next.interventions.find(
          (candidate) => candidate.operationId === target.operationId,
        )!,
      ),
    };
  }

  async resolveIntervention(
    input: ResolveRunInterventionInput,
  ): Promise<RoomExecutionSession> {
    const current = await this.requireSession(input);
    this.requireActive(current);
    this.requireRevision(current, input.expectedRevision);
    const target = current.interventions.find(
      (candidate) => candidate.operationId === input.operationId,
    );
    if (!target) {
      throw new AgentPlatError("NOT_FOUND", "Run intervention not found");
    }
    if (target.status === "dispatching") {
      if (
        !input.dispatchToken ||
        input.dispatchToken !== target.dispatchToken
      ) {
        throw new AgentPlatError(
          "CONFLICT",
          "Run intervention dispatch ownership was lost",
        );
      }
    } else if (target.status !== "pending") {
      if (target.status === input.resolution) return current;
      throw new AgentPlatError(
        "CONFLICT",
        "Run intervention was already resolved differently",
      );
    }
    const now = this.now();
    const next: RoomExecutionSession = {
      ...current,
      revision: current.revision + 1,
      interventions: current.interventions.map((candidate) =>
        candidate.operationId === input.operationId
          ? {
              ...candidate,
              status: input.resolution,
              resolvedAt: now,
              resolutionReason: input.reason,
              dispatchToken: undefined,
              dispatchLeaseExpiresAt: undefined,
            }
          : candidate,
      ),
      events: appendSessionEvent(current, {
        type:
          input.resolution === "applied"
            ? "intervention_applied"
            : "intervention_rejected",
        operationId: target.operationId,
        checkpoint: target.checkpoint,
        occurredAt: now,
      }),
      updatedAt: now,
    };
    await this.commit(current.revision, next);
    return clone(next);
  }

  async reconcileSession(input: {
    tenantId: string;
    roomId: string;
    sessionId: string;
    expectedRevision: number;
  }): Promise<RoomExecutionSession> {
    const current = await this.requireSession(input);
    this.requireRevision(current, input.expectedRevision);
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const run = room.runs.find((candidate) => candidate.id === current.runId);
    if (!run) throw new AgentPlatError("NOT_FOUND", "Room run not found");
    const status = run.status === "running" ? current.status : run.status;
    if (status === current.status) return current;
    const next: RoomExecutionSession = {
      ...current,
      revision: current.revision + 1,
      status,
      events: appendSessionEvent(current, {
        type: "session_reconciled",
        occurredAt: this.now(),
      }),
      updatedAt: this.now(),
    };
    await this.commit(current.revision, next);
    return clone(next);
  }

  private async requireSession(input: {
    tenantId: string;
    roomId: string;
    sessionId: string;
  }): Promise<RoomExecutionSession> {
    const state = await this.store.load(
      input.tenantId,
      input.roomId,
      input.sessionId,
    );
    if (!state) {
      throw new AgentPlatError("NOT_FOUND", "Execution session not found");
    }
    return state;
  }

  private requireActive(state: RoomExecutionSession): void {
    if (state.status !== "active") {
      throw new AgentPlatError("CONFLICT", "Execution session is not active");
    }
  }

  private requireRevision(
    state: RoomExecutionSession,
    expectedRevision: number,
  ): void {
    if (state.revision !== expectedRevision) {
      throw new AgentPlatError(
        "CONFLICT",
        "Execution session revision conflict",
      );
    }
  }

  private async commit(
    expectedRevision: number,
    state: RoomExecutionSession,
  ): Promise<void> {
    if (!(await this.store.compareAndSet({ expectedRevision, state }))) {
      throw new AgentPlatError(
        "CONFLICT",
        "Execution session changed concurrently",
      );
    }
  }

  private now(): ISODateTime {
    return this.clock().toISOString();
  }
}

function validateSession(state: RoomExecutionSession): void {
  required(state.tenantId, "tenantId");
  required(state.roomId, "roomId");
  required(state.sessionId, "sessionId");
  required(state.runId, "runId");
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Execution session revision is invalid",
    );
  }
}

function required(value: string, name: string): void {
  if (!value?.trim()) {
    throw new AgentPlatError("VALIDATION_ERROR", `${name} is required`);
  }
}

function sameSessionBinding(
  left: RoomExecutionSession,
  right: RoomExecutionSession,
): boolean {
  return (
    left.runId === right.runId &&
    left.taskId === right.taskId &&
    left.participantId === right.participantId &&
    left.agentRevisionId === right.agentRevisionId &&
    left.agentRevisionDigest === right.agentRevisionDigest &&
    left.predecessorSessionId === right.predecessorSessionId
  );
}

function key(tenantId: string, roomId: string, sessionId: string): string {
  return `${tenantId}\u0000${roomId}\u0000${sessionId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function appendSessionEvent(
  state: RoomExecutionSession,
  event: Omit<RoomExecutionSessionEvent, "sequence">,
): RoomExecutionSessionEvent[] {
  return [
    ...state.events,
    { ...event, sequence: (state.events.at(-1)?.sequence ?? 0) + 1 },
  ];
}
