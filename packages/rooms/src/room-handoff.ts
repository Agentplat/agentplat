import { AgentPlatError } from "@agentplat/core";
import type { ISODateTime } from "@agentplat/core";
import type { AgentRoomStateReader } from "./coordination.js";
import type { PublishedAgentRevisionResolver } from "./execution-session.js";

/** Governed lifecycle of an AgentPlat Handoff. */
export type RoomHandoffStatus =
  "proposed" | "accepted" | "rejected" | "running" | "completed" | "failed";

/** Append-only lifecycle event retained within a Handoff projection. */
export interface RoomHandoffEvent {
  sequence: number;
  type:
    | "handoff_proposed"
    | "handoff_accepted"
    | "handoff_rejected"
    | "handoff_run_bound"
    | "handoff_completed"
    | "handoff_failed";
  occurredAt: ISODateTime;
}

/** Typed, revision-bound and authority-bounded transfer between Room agents. */
export interface RoomHandoff {
  tenantId: string;
  roomId: string;
  handoffId: string;
  predecessorHandoffId?: string;
  sourceParticipantId: string;
  sourceRunId: string;
  sourceTaskId: string;
  sourceAgentRevisionId: string;
  targetParticipantId: string;
  targetAgentRevisionId: string;
  targetAgentRevisionDigest: string;
  instruction: string;
  contextMessageIds: string[];
  contextArtifactIds: string[];
  authorityCeiling: number;
  depth: number;
  participantPath: string[];
  status: RoomHandoffStatus;
  revision: number;
  targetTaskId?: string;
  targetRunId?: string;
  resolutionReason?: string;
  events: RoomHandoffEvent[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Compare-and-set persistence and Room-scoped discovery for Handoffs. */
export interface RoomHandoffStore {
  load(
    tenantId: string,
    roomId: string,
    handoffId: string,
  ): Promise<RoomHandoff | undefined>;
  compareAndSet(input: {
    expectedRevision: number | null;
    state: RoomHandoff;
  }): Promise<boolean>;
  list(tenantId: string, roomId: string): Promise<RoomHandoff[]>;
}

/** Test-oriented in-memory Handoff store. */
export class InMemoryRoomHandoffStore implements RoomHandoffStore {
  private readonly states = new Map<string, RoomHandoff>();

  async load(tenantId: string, roomId: string, handoffId: string) {
    return clone(this.states.get(key(tenantId, roomId, handoffId)));
  }

  async compareAndSet(input: {
    expectedRevision: number | null;
    state: RoomHandoff;
  }): Promise<boolean> {
    const stateKey = key(
      input.state.tenantId,
      input.state.roomId,
      input.state.handoffId,
    );
    const current = this.states.get(stateKey);
    if (input.expectedRevision === null) {
      if (current || input.state.revision !== 0) return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      input.state.revision !== input.expectedRevision + 1
    ) {
      return false;
    }
    this.states.set(stateKey, clone(input.state)!);
    return true;
  }
  async list(tenantId: string, roomId: string) {
    return [...this.states.values()]
      .filter((state) => state.tenantId === tenantId && state.roomId === roomId)
      .map((state) => clone(state)!);
  }
}

/** Complete provenance and authority input required to propose a Handoff. */
export interface ProposeRoomHandoffInput {
  tenantId: string;
  roomId: string;
  handoffId: string;
  predecessorHandoffId?: string;
  sourceParticipantId: string;
  sourceRunId: string;
  sourceAgentRevisionId: string;
  targetParticipantId: string;
  targetAgentRevisionId: string;
  instruction: string;
  contextMessageIds?: string[];
  contextArtifactIds?: string[];
  authorityCeiling: number;
}

/** Governs proposal, acceptance, execution binding and terminal reconciliation. */
export class AgentRoomHandoffCoordinator {
  private readonly clock: () => Date;
  private readonly maximumDepth: number;

  constructor(
    private readonly rooms: AgentRoomStateReader,
    private readonly store: RoomHandoffStore,
    private readonly agentRegistry: PublishedAgentRevisionResolver,
    private readonly options: {
      clock?: () => Date;
      maximumDepth?: number;
      membership?: {
        get(input: {
          tenantId: string;
          roomId: string;
          participantId: string;
        }): Promise<{
          status: string;
          acceptsHandoffs: boolean;
          allowedAgentRevisionIds: string[];
        }>;
      };
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.maximumDepth = options.maximumDepth ?? 8;
  }

  async propose(input: ProposeRoomHandoffInput): Promise<RoomHandoff> {
    required(input.handoffId, "handoffId");
    required(input.instruction, "instruction");
    if (input.sourceParticipantId === input.targetParticipantId) {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent Room Handoff cannot target its source",
      );
    }
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    if (room.room.status !== "active") {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent Room Handoff requires an active Room",
      );
    }
    const source = room.participants.find(
      (candidate) => candidate.id === input.sourceParticipantId,
    );
    const target = room.participants.find(
      (candidate) => candidate.id === input.targetParticipantId,
    );
    if (
      !source ||
      source.type !== "agent" ||
      !target ||
      target.type !== "agent"
    ) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Agent Room Handoff requires source and target agent participants",
      );
    }
    const sourceRun = room.runs.find(
      (candidate) =>
        candidate.id === input.sourceRunId &&
        candidate.participantId === source.id,
    );
    if (!sourceRun || sourceRun.status !== "running") {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent Room Handoff requires a running source Room run",
      );
    }
    if (
      !Number.isSafeInteger(input.authorityCeiling) ||
      input.authorityCeiling < 0 ||
      input.authorityCeiling > source.authorityLevel ||
      target.authorityLevel > input.authorityCeiling
    ) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Agent Room Handoff cannot widen authority",
      );
    }
    const targetRevision = await this.agentRegistry.resolvePublishedRevision(
      input.tenantId,
      input.targetAgentRevisionId,
    );
    if (this.options.membership) {
      const membership = await this.options.membership.get({
        tenantId: input.tenantId,
        roomId: input.roomId,
        participantId: target.id,
      });
      if (membership.status !== "enabled" || !membership.acceptsHandoffs) {
        throw new AgentPlatError(
          "FORBIDDEN",
          "Target participant is not eligible for Handoffs",
        );
      }
      if (
        membership.allowedAgentRevisionIds.length > 0 &&
        !membership.allowedAgentRevisionIds.includes(
          input.targetAgentRevisionId,
        )
      ) {
        throw new AgentPlatError(
          "FORBIDDEN",
          "Target agent revision is not allowed in this Room",
        );
      }
    }
    const targetAgentId =
      typeof target.metadata?.agentId === "string"
        ? target.metadata.agentId
        : target.id;
    if (targetRevision.agentId !== targetAgentId) {
      throw new AgentPlatError(
        "CONFLICT",
        "Target agent revision does not match the Room participant",
      );
    }
    const targetPlatform = targetRevision.runtimeProfile.platform;
    if (
      typeof targetPlatform === "string" &&
      target.runtime?.platform !== targetPlatform
    ) {
      throw new AgentPlatError(
        "CONFLICT",
        "Target agent revision runtime does not match the Room participant",
      );
    }
    const sourceRevision = await this.agentRegistry.resolvePublishedRevision(
      input.tenantId,
      input.sourceAgentRevisionId,
    );
    const sourceAgentId =
      typeof source.metadata?.agentId === "string"
        ? source.metadata.agentId
        : source.id;
    if (sourceRevision.agentId !== sourceAgentId) {
      throw new AgentPlatError(
        "CONFLICT",
        "Source agent revision does not match the Room participant",
      );
    }

    let depth = 1;
    let participantPath = [source.id];
    if (input.predecessorHandoffId) {
      const predecessor = await this.requireHandoff(
        input.tenantId,
        input.roomId,
        input.predecessorHandoffId,
      );
      if (predecessor.status !== "failed") {
        throw new AgentPlatError(
          "CONFLICT",
          "Handoff recovery requires a failed predecessor",
        );
      }
      if (predecessor.targetParticipantId !== source.id) {
        throw new AgentPlatError(
          "CONFLICT",
          "Handoff recovery source must own the failed predecessor",
        );
      }
      if (input.authorityCeiling > predecessor.authorityCeiling) {
        throw new AgentPlatError(
          "FORBIDDEN",
          "Handoff recovery cannot widen predecessor authority",
        );
      }
      depth = predecessor.depth + 1;
      participantPath = [
        ...predecessor.participantPath,
        predecessor.targetParticipantId,
      ];
    }
    if (depth > this.maximumDepth) {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent Room Handoff depth limit was reached",
      );
    }
    if (participantPath.includes(target.id)) {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent Room Handoff cycle was detected",
      );
    }
    const messageIds = boundedRefs(input.contextMessageIds, 64, "message");
    const artifactIds = boundedRefs(input.contextArtifactIds, 32, "artifact");
    if (
      messageIds.some((id) => !room.messages.some((item) => item.id === id))
    ) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Handoff message context is outside the Room",
      );
    }
    if (
      artifactIds.some((id) => !room.artifacts.some((item) => item.id === id))
    ) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Handoff artifact context is outside the Room",
      );
    }
    const now = this.now();
    const handoff: RoomHandoff = {
      tenantId: input.tenantId,
      roomId: input.roomId,
      handoffId: input.handoffId,
      predecessorHandoffId: input.predecessorHandoffId,
      sourceParticipantId: source.id,
      sourceRunId: sourceRun.id,
      sourceTaskId: sourceRun.taskId,
      sourceAgentRevisionId: sourceRevision.revisionId,
      targetParticipantId: target.id,
      targetAgentRevisionId: targetRevision.revisionId,
      targetAgentRevisionDigest: targetRevision.digest,
      instruction: input.instruction.trim(),
      contextMessageIds: messageIds,
      contextArtifactIds: artifactIds,
      authorityCeiling: input.authorityCeiling,
      depth,
      participantPath,
      status: "proposed",
      revision: 0,
      events: [{ sequence: 1, type: "handoff_proposed", occurredAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    if (
      !(await this.store.compareAndSet({
        expectedRevision: null,
        state: handoff,
      }))
    ) {
      const existing = await this.requireHandoff(
        input.tenantId,
        input.roomId,
        input.handoffId,
      );
      if (sameProposal(existing, handoff)) return existing;
      throw new AgentPlatError("CONFLICT", "Agent Room Handoff already exists");
    }
    return clone(handoff)!;
  }

  async accept(input: TransitionInput & { acceptedByParticipantId: string }) {
    const current = await this.requireHandoffFromInput(input);
    if (input.acceptedByParticipantId !== current.targetParticipantId) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Only the target participant can accept the Handoff",
      );
    }
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const target = room.participants.find(
      (candidate) => candidate.id === current.targetParticipantId,
    );
    if (!target?.permissions.includes("handoff.accept")) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Target participant lacks handoff.accept permission",
      );
    }
    return this.transition(
      current,
      input.expectedRevision,
      "proposed",
      "accepted",
    );
  }

  async reject(
    input: TransitionInput & {
      rejectedByParticipantId: string;
      reason?: string;
    },
  ) {
    const current = await this.requireHandoffFromInput(input);
    if (input.rejectedByParticipantId !== current.targetParticipantId) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Only the target participant can reject the Handoff",
      );
    }
    return this.transition(
      current,
      input.expectedRevision,
      "proposed",
      "rejected",
      input.reason,
    );
  }

  async bindRun(
    input: TransitionInput & { targetTaskId: string; targetRunId: string },
  ) {
    const current = await this.requireHandoffFromInput(input);
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const run = room.runs.find(
      (candidate) =>
        candidate.id === input.targetRunId &&
        candidate.taskId === input.targetTaskId &&
        candidate.participantId === current.targetParticipantId &&
        candidate.status === "running",
    );
    if (!run) {
      throw new AgentPlatError(
        "CONFLICT",
        "Handoff target run binding is invalid",
      );
    }
    return this.transition(
      current,
      input.expectedRevision,
      "accepted",
      "running",
      undefined,
      {
        targetTaskId: input.targetTaskId,
        targetRunId: input.targetRunId,
      },
    );
  }

  async reconcile(input: TransitionInput): Promise<RoomHandoff> {
    const current = await this.requireHandoffFromInput(input);
    if (current.status !== "running" || !current.targetRunId) return current;
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const run = room.runs.find(
      (candidate) => candidate.id === current.targetRunId,
    );
    if (!run)
      throw new AgentPlatError("NOT_FOUND", "Handoff target run not found");
    if (run.status === "running") return current;
    return this.transition(
      current,
      input.expectedRevision,
      "running",
      run.status === "completed" ? "completed" : "failed",
      run.errorMessage,
    );
  }

  async get(input: { tenantId: string; roomId: string; handoffId: string }) {
    return this.requireHandoffFromInput(input);
  }

  list(tenantId: string, roomId: string) {
    return this.store.list(tenantId, roomId);
  }

  private async transition(
    current: RoomHandoff,
    expectedRevision: number,
    from: RoomHandoffStatus,
    to: RoomHandoffStatus,
    reason?: string,
    fields: Partial<Pick<RoomHandoff, "targetTaskId" | "targetRunId">> = {},
  ) {
    if (current.revision !== expectedRevision || current.status !== from) {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent Room Handoff lifecycle conflict",
      );
    }
    const now = this.now();
    const eventTypes: Partial<
      Record<RoomHandoffStatus, RoomHandoffEvent["type"]>
    > = {
      accepted: "handoff_accepted",
      rejected: "handoff_rejected",
      running: "handoff_run_bound",
      completed: "handoff_completed",
      failed: "handoff_failed",
    };
    const eventType = eventTypes[to];
    if (!eventType) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Agent Room Handoff transition is invalid",
      );
    }
    const next: RoomHandoff = {
      ...current,
      ...fields,
      revision: current.revision + 1,
      status: to,
      resolutionReason: reason,
      events: [
        ...current.events,
        {
          sequence: current.events.length + 1,
          type: eventType,
          occurredAt: now,
        },
      ],
      updatedAt: now,
    };
    if (!(await this.store.compareAndSet({ expectedRevision, state: next }))) {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent Room Handoff changed concurrently",
      );
    }
    return clone(next)!;
  }

  private async requireHandoffFromInput(input: {
    tenantId: string;
    roomId: string;
    handoffId: string;
  }) {
    return this.requireHandoff(input.tenantId, input.roomId, input.handoffId);
  }

  private async requireHandoff(
    tenantId: string,
    roomId: string,
    handoffId: string,
  ) {
    const handoff = await this.store.load(tenantId, roomId, handoffId);
    if (!handoff)
      throw new AgentPlatError("NOT_FOUND", "Agent Room Handoff not found");
    return handoff;
  }

  private now(): ISODateTime {
    return this.clock().toISOString();
  }
}

interface TransitionInput {
  tenantId: string;
  roomId: string;
  handoffId: string;
  expectedRevision: number;
}

function boundedRefs(
  values: string[] | undefined,
  limit: number,
  label: string,
) {
  const normalized = [...new Set(values ?? [])];
  if (normalized.length > limit || normalized.some((value) => !value.trim())) {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      `Handoff ${label} references are invalid or exceed ${limit}`,
    );
  }
  return normalized;
}

function sameProposal(left: RoomHandoff, right: RoomHandoff): boolean {
  return (
    left.sourceRunId === right.sourceRunId &&
    left.targetParticipantId === right.targetParticipantId &&
    left.targetAgentRevisionId === right.targetAgentRevisionId &&
    left.instruction === right.instruction &&
    left.authorityCeiling === right.authorityCeiling
  );
}

function required(value: string, name: string) {
  if (!value?.trim())
    throw new AgentPlatError("VALIDATION_ERROR", `${name} is required`);
}

function key(tenantId: string, roomId: string, handoffId: string) {
  return `${tenantId}\u0000${roomId}\u0000${handoffId}`;
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
