import { AgentPlatError } from "@agentplat/core";
import type { ISODateTime, JsonValue } from "@agentplat/core";
import type { AgentRoomStateReader } from "./coordination.js";

/** Lifecycle of a governed human contribution request. */
export type HumanContributionStatus =
  | "requested"
  | "assigned"
  | "in_progress"
  | "completed"
  | "canceled"
  | "expired";

/** Append-only lifecycle event retained with a human contribution. */
export interface HumanContributionEvent {
  sequence: number;
  type:
    | "contribution_requested"
    | "contribution_assigned"
    | "contribution_started"
    | "contribution_completed"
    | "contribution_canceled"
    | "contribution_expired";
  occurredAt: ISODateTime;
}

/** Revisioned, Room-scoped request for structured human work. */
export interface HumanContributionRequest {
  tenantId: string;
  roomId: string;
  contributionId: string;
  requestedByParticipantId: string;
  assignedParticipantId?: string;
  instruction: string;
  expectedOutput: string;
  dependencies: string[];
  blocking: boolean;
  deadline?: ISODateTime;
  status: HumanContributionStatus;
  revision: number;
  result?: JsonValue;
  artifactIds: string[];
  events: HumanContributionEvent[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt?: ISODateTime;
}

/** Compare-and-set persistence and Room-scoped contribution discovery. */
export interface HumanContributionStore {
  load(
    tenantId: string,
    roomId: string,
    contributionId: string,
  ): Promise<HumanContributionRequest | undefined>;
  compareAndSet(input: {
    expectedRevision: number | null;
    state: HumanContributionRequest;
  }): Promise<boolean>;
  list(tenantId: string, roomId: string): Promise<HumanContributionRequest[]>;
}

/** Test-oriented in-memory human contribution store. */
export class InMemoryHumanContributionStore implements HumanContributionStore {
  private readonly states = new Map<string, HumanContributionRequest>();
  async load(tenantId: string, roomId: string, contributionId: string) {
    return clone(this.states.get(key(tenantId, roomId, contributionId)));
  }
  async compareAndSet(input: {
    expectedRevision: number | null;
    state: HumanContributionRequest;
  }) {
    const stateKey = key(
      input.state.tenantId,
      input.state.roomId,
      input.state.contributionId,
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

/** Governs assignment, dependency, permission and completion transitions. */
export class HumanContributionCoordinator {
  private readonly clock: () => Date;
  constructor(
    private readonly rooms: AgentRoomStateReader,
    private readonly store: HumanContributionStore,
    options: { clock?: () => Date } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async request(input: {
    tenantId: string;
    roomId: string;
    contributionId: string;
    requestedByParticipantId: string;
    assignedParticipantId?: string;
    instruction: string;
    expectedOutput: string;
    dependencies?: string[];
    blocking?: boolean;
    deadline?: ISODateTime;
  }) {
    required(input.contributionId, "contributionId");
    required(input.instruction, "instruction");
    required(input.expectedOutput, "expectedOutput");
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const requester = room.participants.find(
      (candidate) => candidate.id === input.requestedByParticipantId,
    );
    if (!requester?.permissions.includes("human_contribution.request")) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Participant lacks human_contribution.request permission",
      );
    }
    if (input.assignedParticipantId) {
      requireHuman(room.participants, input.assignedParticipantId);
    }
    const dependencies = [...new Set(input.dependencies ?? [])];
    for (const dependencyId of dependencies) {
      const dependency = await this.store.load(
        input.tenantId,
        input.roomId,
        dependencyId,
      );
      if (!dependency) {
        throw new AgentPlatError(
          "NOT_FOUND",
          "Human contribution dependency not found",
        );
      }
    }
    if (
      input.deadline &&
      (Number.isNaN(new Date(input.deadline).getTime()) ||
        new Date(input.deadline).getTime() <= this.clock().getTime())
    ) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Human contribution deadline is invalid",
      );
    }
    const now = this.now();
    const state: HumanContributionRequest = {
      tenantId: input.tenantId,
      roomId: input.roomId,
      contributionId: input.contributionId,
      requestedByParticipantId: input.requestedByParticipantId,
      assignedParticipantId: input.assignedParticipantId,
      instruction: input.instruction.trim(),
      expectedOutput: input.expectedOutput.trim(),
      dependencies,
      blocking: input.blocking ?? true,
      deadline: input.deadline,
      status: input.assignedParticipantId ? "assigned" : "requested",
      revision: 0,
      artifactIds: [],
      events: [
        { sequence: 1, type: "contribution_requested", occurredAt: now },
        ...(input.assignedParticipantId
          ? [
              {
                sequence: 2,
                type: "contribution_assigned" as const,
                occurredAt: now,
              },
            ]
          : []),
      ],
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.store.compareAndSet({ expectedRevision: null, state }))) {
      const existing = await this.get(input);
      if (sameRequest(existing, state)) return existing;
      throw new AgentPlatError("CONFLICT", "Human contribution already exists");
    }
    return clone(state)!;
  }

  async assign(
    input: TransitionInput & {
      assignedParticipantId: string;
      assignedByParticipantId: string;
    },
  ) {
    const current = await this.get(input);
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const actor = room.participants.find(
      (candidate) => candidate.id === input.assignedByParticipantId,
    );
    if (!actor?.permissions.includes("human_contribution.assign")) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Participant lacks human_contribution.assign permission",
      );
    }
    requireHuman(room.participants, input.assignedParticipantId);
    return this.transition(
      current,
      input.expectedRevision,
      ["requested"],
      "assigned",
      {
        assignedParticipantId: input.assignedParticipantId,
      },
    );
  }

  async start(input: TransitionInput & { participantId: string }) {
    const current = await this.get(input);
    if (current.assignedParticipantId !== input.participantId) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Only the assigned participant can start this contribution",
      );
    }
    await this.requireDependenciesCompleted(current);
    return this.transition(
      current,
      input.expectedRevision,
      ["assigned"],
      "in_progress",
    );
  }

  async complete(
    input: TransitionInput & {
      participantId: string;
      result: JsonValue;
      artifactIds?: string[];
    },
  ) {
    const current = await this.get(input);
    if (current.assignedParticipantId !== input.participantId) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Only the assigned participant can complete this contribution",
      );
    }
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const human = requireHuman(room.participants, input.participantId);
    if (!human.permissions?.includes("human_contribution.complete")) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Participant lacks human_contribution.complete permission",
      );
    }
    const artifactIds = [...new Set(input.artifactIds ?? [])];
    if (
      artifactIds.some(
        (id) => !room.artifacts.some((artifact) => artifact.id === id),
      )
    ) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Contribution artifact is outside the Room",
      );
    }
    return this.transition(
      current,
      input.expectedRevision,
      ["assigned", "in_progress"],
      "completed",
      { result: input.result, artifactIds, completedAt: this.now() },
    );
  }

  async cancel(input: TransitionInput & { participantId: string }) {
    const current = await this.get(input);
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const actor = room.participants.find(
      (candidate) => candidate.id === input.participantId,
    );
    if (!actor?.permissions.includes("human_contribution.cancel")) {
      throw new AgentPlatError(
        "FORBIDDEN",
        "Participant lacks human_contribution.cancel permission",
      );
    }
    return this.transition(
      current,
      input.expectedRevision,
      ["requested", "assigned", "in_progress"],
      "canceled",
    );
  }

  async expire(input: TransitionInput) {
    const current = await this.get(input);
    if (
      !current.deadline ||
      new Date(current.deadline).getTime() > this.clock().getTime()
    ) {
      throw new AgentPlatError("CONFLICT", "Human contribution is not expired");
    }
    return this.transition(
      current,
      input.expectedRevision,
      ["requested", "assigned", "in_progress"],
      "expired",
    );
  }

  async get(input: {
    tenantId: string;
    roomId: string;
    contributionId: string;
  }) {
    const state = await this.store.load(
      input.tenantId,
      input.roomId,
      input.contributionId,
    );
    if (!state)
      throw new AgentPlatError("NOT_FOUND", "Human contribution not found");
    return state;
  }

  list(tenantId: string, roomId: string) {
    return this.store.list(tenantId, roomId);
  }

  private async requireDependenciesCompleted(state: HumanContributionRequest) {
    for (const dependencyId of state.dependencies) {
      const dependency = await this.store.load(
        state.tenantId,
        state.roomId,
        dependencyId,
      );
      if (dependency?.status !== "completed") {
        throw new AgentPlatError(
          "CONFLICT",
          "Human contribution dependency is incomplete",
        );
      }
    }
  }

  private async transition(
    current: HumanContributionRequest,
    expectedRevision: number,
    from: HumanContributionStatus[],
    to: HumanContributionStatus,
    fields: Partial<HumanContributionRequest> = {},
  ) {
    if (
      current.revision !== expectedRevision ||
      !from.includes(current.status)
    ) {
      throw new AgentPlatError(
        "CONFLICT",
        "Human contribution lifecycle conflict",
      );
    }
    const now = this.now();
    const eventType =
      `contribution_${to === "in_progress" ? "started" : to}` as HumanContributionEvent["type"];
    const next: HumanContributionRequest = {
      ...current,
      ...fields,
      revision: current.revision + 1,
      status: to,
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
        "Human contribution changed concurrently",
      );
    }
    return clone(next)!;
  }

  private now() {
    return this.clock().toISOString();
  }
}

interface TransitionInput {
  tenantId: string;
  roomId: string;
  contributionId: string;
  expectedRevision: number;
}

function requireHuman(
  participants: Array<{ id: string; type: string; permissions?: string[] }>,
  id: string,
) {
  const participant = participants.find((candidate) => candidate.id === id);
  if (!participant || participant.type !== "human") {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Human contribution assignee must be a human Room participant",
    );
  }
  return participant;
}
function required(value: string, name: string) {
  if (!value?.trim())
    throw new AgentPlatError("VALIDATION_ERROR", `${name} is required`);
}
function sameRequest(
  left: HumanContributionRequest,
  right: HumanContributionRequest,
) {
  return (
    left.instruction === right.instruction &&
    left.expectedOutput === right.expectedOutput &&
    left.assignedParticipantId === right.assignedParticipantId
  );
}
function key(tenantId: string, roomId: string, contributionId: string) {
  return `${tenantId}\u0000${roomId}\u0000${contributionId}`;
}
function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
