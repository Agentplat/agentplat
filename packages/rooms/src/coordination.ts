import { AgentPlatError } from "@agentplat/core";
import type { Participant, RoomMessage, RoomState } from "./models.js";

/** Eligible participant projection exposed to a routing strategy. */
export interface RoomRoutingCandidate {
  participantId: string;
  aliases: string[];
  description?: string;
}

/** Persisted message and bounded candidates presented for routing. */
export interface RoomRoutingRequest {
  tenantId: string;
  roomId: string;
  message: Pick<RoomMessage, "id" | "content" | "role">;
  candidates: RoomRoutingCandidate[];
  defaultParticipantId?: string;
}

/** Evidence basis retained with a successful routing decision. */
export type RoomRoutingBasis = "explicit_reference" | "router" | "default";

/** Assigned or explicitly unassigned result of Room message routing. */
export type RoomRoutingDecision =
  | {
      kind: "assigned";
      participantIds: string[];
      basis: RoomRoutingBasis;
    }
  | { kind: "unassigned"; reason: "no_eligible_participant" | "no_match" };

/** Deterministic or constrained strategy for selecting eligible participants. */
export interface RoomRoutingStrategy {
  route(request: RoomRoutingRequest): Promise<RoomRoutingDecision>;
}

/** Optional constrained router used after deterministic references fail. */
export interface RoomParticipantRouter {
  select(request: RoomRoutingRequest): Promise<string | null | undefined>;
}

/** Minimal Room aggregate reader required by coordination components. */
export interface AgentRoomStateReader {
  getRoomState(tenantId: string, roomId: string): Promise<RoomState>;
}

/** Tenant, Room and persisted message identity used for one routing decision. */
export interface RouteAgentRoomMessageInput {
  tenantId: string;
  roomId: string;
  messageId: string;
  eligibleParticipantIds?: string[];
  defaultParticipantId?: string;
}

/**
 * Resolves the next eligible agent participants for one durable Room message.
 * Execution remains a separate, policy-checked Room task and run operation.
 */
/** Resolves persisted messages to policy-eligible Room participants. */
export class AgentRoomCoordinator {
  constructor(
    private readonly rooms: AgentRoomStateReader,
    private readonly routing: RoomRoutingStrategy,
    private readonly eligibility?: {
      eligibleParticipantIds(
        tenantId: string,
        roomId: string,
      ): Promise<string[]>;
    },
  ) {}

  async routeMessage(
    input: RouteAgentRoomMessageInput,
  ): Promise<RoomRoutingDecision> {
    const state = await this.rooms.getRoomState(input.tenantId, input.roomId);
    if (state.room.status !== "active") {
      throw new AgentPlatError(
        "CONFLICT",
        "Only active Agent Rooms can route messages",
      );
    }
    const message = state.messages.find((item) => item.id === input.messageId);
    if (!message) {
      throw new AgentPlatError("NOT_FOUND", "Room message not found");
    }
    const configuredEligible = this.eligibility
      ? await this.eligibility.eligibleParticipantIds(
          input.tenantId,
          input.roomId,
        )
      : undefined;
    const requestedEligible = input.eligibleParticipantIds;
    const eligible =
      configuredEligible || requestedEligible
        ? new Set(
            (configuredEligible ?? requestedEligible ?? []).filter(
              (participantId) =>
                !requestedEligible || requestedEligible.includes(participantId),
            ),
          )
        : undefined;
    const candidates = roomRoutingCandidates(state.participants).filter(
      (candidate) => !eligible || eligible.has(candidate.participantId),
    );
    return this.routing.route({
      tenantId: input.tenantId,
      roomId: input.roomId,
      message,
      candidates,
      defaultParticipantId: input.defaultParticipantId,
    });
  }
}

/**
 * Resolves explicit participant references such as `@research` without model
 * inference. Aliases are application-defined and matched case-insensitively.
 */
/** Routes only explicit participant references found in persisted message text. */
export class ExplicitReferenceRoutingStrategy implements RoomRoutingStrategy {
  async route(request: RoomRoutingRequest): Promise<RoomRoutingDecision> {
    assertRoutingRequest(request);
    const aliases = candidateAliases(request.candidates);
    const selected: string[] = [];

    for (const reference of explicitReferences(request.message.content)) {
      const participantId = aliases.get(reference.toLowerCase());
      if (participantId && !selected.includes(participantId)) {
        selected.push(participantId);
      }
    }

    return selected.length > 0
      ? {
          kind: "assigned",
          participantIds: selected,
          basis: "explicit_reference",
        }
      : {
          kind: "unassigned",
          reason:
            request.candidates.length === 0
              ? "no_eligible_participant"
              : "no_match",
        };
  }
}

/**
 * Uses explicit references first, then an injected router, then the declared
 * default participant. The router cannot return a participant outside the
 * request's eligible candidate set.
 */
/** Combines explicit references, an optional router and a declared default. */
export class PolicyBoundRoomRoutingStrategy implements RoomRoutingStrategy {
  private readonly explicit = new ExplicitReferenceRoutingStrategy();

  constructor(private readonly router?: RoomParticipantRouter) {}

  async route(request: RoomRoutingRequest): Promise<RoomRoutingDecision> {
    const explicit = await this.explicit.route(request);
    if (explicit.kind === "assigned") return explicit;
    if (request.candidates.length === 0) return explicit;

    if (this.router) {
      const selected = await this.router.select(request);
      if (selected !== null && selected !== undefined) {
        if (
          !request.candidates.some((item) => item.participantId === selected)
        ) {
          throw new AgentPlatError(
            "VALIDATION_ERROR",
            "Room participant router returned an ineligible participant",
          );
        }
        return {
          kind: "assigned",
          participantIds: [selected],
          basis: "router",
        };
      }
    }

    if (request.defaultParticipantId) {
      if (
        !request.candidates.some(
          (item) => item.participantId === request.defaultParticipantId,
        )
      ) {
        throw new AgentPlatError(
          "VALIDATION_ERROR",
          "Default Room participant is not eligible for assignment",
        );
      }
      return {
        kind: "assigned",
        participantIds: [request.defaultParticipantId],
        basis: "default",
      };
    }

    return { kind: "unassigned", reason: "no_match" };
  }
}

/** Build routing candidates from current agent participants in a Room. */
/** Derives bounded routing candidates from the current Room projection. */
export function roomRoutingCandidates(
  participants: Participant[],
): RoomRoutingCandidate[] {
  return participants
    .filter((participant) => participant.type === "agent")
    .map((participant) => ({
      participantId: participant.id,
      aliases: participantAliases(participant),
      description:
        typeof participant.metadata?.description === "string"
          ? participant.metadata.description
          : undefined,
    }));
}

function participantAliases(participant: Participant): string[] {
  const configured = participant.metadata?.aliases;
  const aliases = Array.isArray(configured)
    ? configured.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];
  return [...new Set([participant.id, participant.displayName, ...aliases])];
}

function explicitReferences(content: string): string[] {
  const references: string[] = [];
  const pattern = /(^|\s)@([\p{L}\p{N}][\p{L}\p{N}._-]*)/gu;
  for (const match of content.matchAll(pattern)) {
    if (match[2]) references.push(match[2]);
  }
  return references;
}

function candidateAliases(
  candidates: RoomRoutingCandidate[],
): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const candidate of candidates) {
    if (!candidate.participantId.trim()) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Room routing candidate participantId is required",
      );
    }
    for (const value of candidate.aliases) {
      const alias = value.trim().toLowerCase();
      if (!alias) continue;
      const existing = aliases.get(alias);
      if (existing && existing !== candidate.participantId) {
        throw new AgentPlatError(
          "CONFLICT",
          `Room participant alias "${value}" is ambiguous`,
        );
      }
      aliases.set(alias, candidate.participantId);
    }
  }
  return aliases;
}

function assertRoutingRequest(request: RoomRoutingRequest): void {
  if (!request.tenantId.trim() || !request.roomId.trim()) {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "tenantId and roomId are required for Room routing",
    );
  }
  if (request.message.role !== "human" && request.message.role !== "agent") {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Only human or agent messages can request Room routing",
    );
  }
}
