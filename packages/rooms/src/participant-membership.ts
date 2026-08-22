import { AgentPlatError } from "@agentplat/core";
import type { AgentRoomStateReader } from "./coordination.js";

/** Operational eligibility lifecycle for an existing Room participant. */
export type RoomParticipantMembershipStatus =
  "invited" | "enabled" | "suspended" | "left";

/** Revisioned Room-scoped routing and Handoff eligibility projection. */
export interface RoomParticipantMembership {
  tenantId: string;
  roomId: string;
  participantId: string;
  revision: number;
  status: RoomParticipantMembershipStatus;
  routingEligible: boolean;
  acceptsHandoffs: boolean;
  allowedAgentRevisionIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Compare-and-set persistence and Room-scoped membership discovery. */
export interface RoomParticipantMembershipStore {
  load(
    tenantId: string,
    roomId: string,
    participantId: string,
  ): Promise<RoomParticipantMembership | undefined>;
  list(tenantId: string, roomId: string): Promise<RoomParticipantMembership[]>;
  compareAndSet(input: {
    expectedRevision: number | null;
    state: RoomParticipantMembership;
  }): Promise<boolean>;
}

/** Test-oriented in-memory participant membership store. */
export class InMemoryRoomParticipantMembershipStore implements RoomParticipantMembershipStore {
  private readonly states = new Map<string, RoomParticipantMembership>();
  async load(tenantId: string, roomId: string, participantId: string) {
    const state = this.states.get(
      `${tenantId}\u0000${roomId}\u0000${participantId}`,
    );
    return state ? structuredClone(state) : undefined;
  }
  async list(tenantId: string, roomId: string) {
    return [...this.states.values()]
      .filter((state) => state.tenantId === tenantId && state.roomId === roomId)
      .map((state) => structuredClone(state));
  }
  async compareAndSet(input: {
    expectedRevision: number | null;
    state: RoomParticipantMembership;
  }) {
    const key = `${input.state.tenantId}\u0000${input.state.roomId}\u0000${input.state.participantId}`;
    const current = this.states.get(key);
    if (input.expectedRevision === null) {
      if (current || input.state.revision !== 0) return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      input.state.revision !== input.expectedRevision + 1
    )
      return false;
    this.states.set(key, structuredClone(input.state));
    return true;
  }
}

/** Governs membership transitions without rewriting participant history. */
export class RoomParticipantMembershipCoordinator {
  private readonly clock: () => Date;
  constructor(
    private readonly rooms: AgentRoomStateReader,
    private readonly store: RoomParticipantMembershipStore,
    options: { clock?: () => Date } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }
  async create(input: {
    tenantId: string;
    roomId: string;
    participantId: string;
    status?: RoomParticipantMembershipStatus;
    routingEligible?: boolean;
    acceptsHandoffs?: boolean;
    allowedAgentRevisionIds?: string[];
  }) {
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    if (
      !room.participants.some(
        (participant) => participant.id === input.participantId,
      )
    ) {
      throw new AgentPlatError("NOT_FOUND", "Room participant not found");
    }
    const now = this.clock().toISOString();
    const status = input.status ?? "enabled";
    const state: RoomParticipantMembership = {
      tenantId: input.tenantId,
      roomId: input.roomId,
      participantId: input.participantId,
      revision: 0,
      status,
      routingEligible: status === "enabled" && (input.routingEligible ?? true),
      acceptsHandoffs: status === "enabled" && (input.acceptsHandoffs ?? true),
      allowedAgentRevisionIds: [
        ...new Set(input.allowedAgentRevisionIds ?? []),
      ],
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.store.compareAndSet({ expectedRevision: null, state }))) {
      const existing = await this.get(input);
      return existing;
    }
    return state;
  }
  async transition(input: {
    tenantId: string;
    roomId: string;
    participantId: string;
    expectedRevision: number;
    status: RoomParticipantMembershipStatus;
    routingEligible?: boolean;
    acceptsHandoffs?: boolean;
    allowedAgentRevisionIds?: string[];
  }) {
    const current = await this.get(input);
    if (current.revision !== input.expectedRevision) conflict();
    if (current.status === "left") {
      throw new AgentPlatError(
        "CONFLICT",
        "A participant that left cannot rejoin through transition",
      );
    }
    const enabled = input.status === "enabled";
    const next: RoomParticipantMembership = {
      ...current,
      revision: current.revision + 1,
      status: input.status,
      routingEligible:
        enabled && (input.routingEligible ?? current.routingEligible),
      acceptsHandoffs:
        enabled && (input.acceptsHandoffs ?? current.acceptsHandoffs),
      allowedAgentRevisionIds:
        input.allowedAgentRevisionIds === undefined
          ? current.allowedAgentRevisionIds
          : [...new Set(input.allowedAgentRevisionIds)],
      updatedAt: this.clock().toISOString(),
    };
    if (
      !(await this.store.compareAndSet({
        expectedRevision: current.revision,
        state: next,
      }))
    )
      conflict();
    return next;
  }
  get(input: { tenantId: string; roomId: string; participantId: string }) {
    return this.store
      .load(input.tenantId, input.roomId, input.participantId)
      .then((state) => {
        if (!state)
          throw new AgentPlatError(
            "NOT_FOUND",
            "Room participant membership not found",
          );
        return state;
      });
  }
  list(tenantId: string, roomId: string) {
    return this.store.list(tenantId, roomId);
  }
  async eligibleParticipantIds(tenantId: string, roomId: string) {
    return (await this.store.list(tenantId, roomId))
      .filter(
        (membership) =>
          membership.status === "enabled" && membership.routingEligible,
      )
      .map((membership) => membership.participantId);
  }
}

function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Room participant membership revision conflict",
  );
}
