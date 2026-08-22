import { AgentPlatError } from "@agentplat/core";
import type { JsonObject } from "@agentplat/core";
import type { StreamEvent } from "@agentplat/runtime";
import type { AgentRoomCoordinationStore } from "./coordination-runtime.js";
import type { RoomExecutionCoordinator } from "./execution-session.js";
import type { HumanContributionCoordinator } from "./human-contribution.js";
import type { AgentRoomHandoffCoordinator } from "./room-handoff.js";
import type { HumanContributionDeliveryStore } from "./work-management.js";
import type { RoomService } from "./service.js";
import type { AgentRoomPlanStore } from "./planner-bridge.js";
import type { RoomParticipantMembershipStore } from "./participant-membership.js";
import type { AgentRoomOperationalEventReader } from "./operational-events.js";

/** Composite cursor over Room domain and optional operational event sources. */
export interface AgentRoomLiveCursor {
  version: 1;
  roomCursor?: string;
  executionSequences: Record<string, number>;
  handoffSequences: Record<string, number>;
  contributionSequences: Record<string, number>;
  operationalSequence?: number;
}

/** Room scope, optional filters and cursor for a bounded live-view read. */
export interface AgentRoomLiveViewRequest {
  tenantId: string;
  roomId: string;
  coordinationId?: string;
  executionSessionIds?: string[];
  handoffIds?: string[];
  contributionIds?: string[];
  planIds?: string[];
  cursor?: string;
  eventLimit?: number;
}

/** Source-labelled event returned by AgentRoom LiveView and SSE. */
export interface AgentRoomLiveEvent {
  source:
    "room" | "execution" | "handoff" | "human_contribution" | "operational";
  sourceId: string;
  sequence?: number;
  type: string;
  occurredAt: string;
  payload: JsonObject;
}

/**
 * Discovers Room-scoped projections and produces bounded polling or SSE views
 * without treating a client-provided identifier list as authoritative.
 */
export class AgentRoomLiveViewService {
  constructor(
    private readonly rooms: Pick<RoomService, "getRoomState" | "listEventPage">,
    private readonly coordination?: AgentRoomCoordinationStore,
    private readonly execution?: Pick<
      RoomExecutionCoordinator,
      "getSession" | "listSessionEvents" | "listSessions"
    >,
    private readonly handoffs?: Pick<
      AgentRoomHandoffCoordinator,
      "get" | "list"
    >,
    private readonly contributions?: Pick<
      HumanContributionCoordinator,
      "get" | "list"
    >,
    private readonly deliveries?: HumanContributionDeliveryStore,
    private readonly plans?: AgentRoomPlanStore,
    private readonly memberships?: RoomParticipantMembershipStore,
    private readonly operationalEvents?: AgentRoomOperationalEventReader,
  ) {}

  async get(input: AgentRoomLiveViewRequest) {
    const cursor = decodeCursor(input.cursor, input.roomId);
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const roomEvents = await this.rooms.listEventPage(
      input.tenantId,
      input.roomId,
      { cursor: cursor.roomCursor, limit: input.eventLimit ?? 100 },
    );
    const events: AgentRoomLiveEvent[] = this.operationalEvents
      ? []
      : roomEvents.events.map((event) => ({
          source: "room",
          sourceId: input.roomId,
          type: event.type,
          occurredAt: event.occurredAt,
          payload: event.payload,
        }));
    let operationalHasMore = false;
    if (this.operationalEvents) {
      const operational = await this.operationalEvents.listAfter({
        tenantId: input.tenantId,
        roomId: input.roomId,
        afterSequence: cursor.operationalSequence ?? 0,
        limit: input.eventLimit ?? 100,
      });
      for (const event of operational) {
        events.push({
          source: "operational",
          sourceId: event.sourceId,
          sequence: event.sequence,
          type: `${event.source}.${event.eventType}`,
          occurredAt: event.occurredAt,
          payload: event.payload,
        });
        cursor.operationalSequence = event.sequence;
      }
      operationalHasMore = operational.length === (input.eventLimit ?? 100);
    }

    const coordination =
      input.coordinationId && this.coordination
        ? await this.coordination.load(
            input.tenantId,
            input.roomId,
            input.coordinationId,
          )
        : undefined;
    const coordinationStates = this.coordination?.list
      ? await this.coordination.list(input.tenantId, input.roomId)
      : coordination
        ? [coordination]
        : [];
    const executionSessions = [];
    const sessionIds =
      input.executionSessionIds ??
      (this.execution
        ? (await this.execution.listSessions(input.tenantId, input.roomId)).map(
            (session) => session.sessionId,
          )
        : []);
    for (const sessionId of sessionIds) {
      if (!this.execution) break;
      const session = await this.execution.getSession({
        tenantId: input.tenantId,
        roomId: input.roomId,
        sessionId,
      });
      executionSessions.push(session);
      const after = cursor.executionSequences[sessionId] ?? 0;
      const sessionEvents = this.operationalEvents
        ? []
        : await this.execution.listSessionEvents(
            { tenantId: input.tenantId, roomId: input.roomId, sessionId },
            after,
          );
      for (const event of sessionEvents) {
        events.push({
          source: "execution",
          sourceId: sessionId,
          sequence: event.sequence,
          type: event.type,
          occurredAt: event.occurredAt,
          payload: {},
        });
        cursor.executionSequences[sessionId] = event.sequence;
      }
    }
    const handoffStates = [];
    const handoffIds =
      input.handoffIds ??
      (this.handoffs
        ? (await this.handoffs.list(input.tenantId, input.roomId)).map(
            (handoff) => handoff.handoffId,
          )
        : []);
    for (const handoffId of handoffIds) {
      if (!this.handoffs) break;
      const handoff = await this.handoffs.get({
        tenantId: input.tenantId,
        roomId: input.roomId,
        handoffId,
      });
      handoffStates.push(handoff);
      const after = cursor.handoffSequences[handoffId] ?? 0;
      for (const event of (this.operationalEvents ? [] : handoff.events).filter(
        (candidate) => candidate.sequence > after,
      )) {
        events.push({
          source: "handoff",
          sourceId: handoffId,
          sequence: event.sequence,
          type: event.type,
          occurredAt: event.occurredAt,
          payload: {},
        });
        cursor.handoffSequences[handoffId] = event.sequence;
      }
    }
    const humanContributions = [];
    const contributionIds =
      input.contributionIds ??
      (this.contributions
        ? (await this.contributions.list(input.tenantId, input.roomId)).map(
            (contribution) => contribution.contributionId,
          )
        : []);
    for (const contributionId of contributionIds) {
      if (!this.contributions) break;
      const contribution = await this.contributions.get({
        tenantId: input.tenantId,
        roomId: input.roomId,
        contributionId,
      });
      humanContributions.push(contribution);
      const after = cursor.contributionSequences[contributionId] ?? 0;
      for (const event of (this.operationalEvents
        ? []
        : contribution.events
      ).filter((candidate) => candidate.sequence > after)) {
        events.push({
          source: "human_contribution",
          sourceId: contributionId,
          sequence: event.sequence,
          type: event.type,
          occurredAt: event.occurredAt,
          payload: {},
        });
        cursor.contributionSequences[contributionId] = event.sequence;
      }
    }
    cursor.roomCursor = roomEvents.nextCursor;
    events.sort(
      (left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) ||
        left.source.localeCompare(right.source) ||
        (left.sequence ?? 0) - (right.sequence ?? 0),
    );
    return {
      room: room.room,
      participants: room.participants,
      coordination,
      coordinationStates,
      activeRuns: room.runs.filter((run) => run.status === "running"),
      executionSessions,
      handoffs: handoffStates,
      humanContributions,
      deliveries: this.deliveries
        ? await this.deliveries.list(input.tenantId, input.roomId)
        : [],
      plans: this.plans
        ? input.planIds
          ? (
              await Promise.all(
                input.planIds.map((planId) =>
                  this.plans!.load(input.tenantId, input.roomId, planId),
                ),
              )
            ).filter(Boolean)
          : await this.plans.list(input.tenantId, input.roomId)
        : [],
      participantMemberships: this.memberships
        ? await this.memberships.list(input.tenantId, input.roomId)
        : [],
      events,
      nextCursor: encodeCursor(input.roomId, cursor),
      hasMore: this.operationalEvents ? operationalHasMore : roomEvents.hasMore,
    };
  }

  async *stream(
    input: AgentRoomLiveViewRequest,
    options: { signal?: AbortSignal; pollMs?: number } = {},
  ): AsyncIterable<StreamEvent<"agent_room_live_view">> {
    let cursor = input.cursor;
    let first = true;
    while (!options.signal?.aborted) {
      const view = await this.get({ ...input, cursor });
      if (first || view.events.length > 0) {
        yield {
          type: "agent_room_live_view",
          payload: view as unknown as JsonObject,
        };
        first = false;
      }
      cursor = view.nextCursor;
      await delay(options.pollMs ?? 1_000, options.signal);
    }
  }
}

function decodeCursor(
  value: string | undefined,
  roomId: string,
): AgentRoomLiveCursor {
  if (!value) {
    return {
      version: 1,
      executionSequences: {},
      handoffSequences: {},
      contributionSequences: {},
    };
  }
  try {
    const parsed = JSON.parse(
      decodeURIComponent(value),
    ) as AgentRoomLiveCursor & {
      roomId?: string;
    };
    if (parsed.version !== 1 || parsed.roomId !== roomId) throw new Error();
    return parsed;
  } catch {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Agent Room live cursor is invalid",
    );
  }
}
function encodeCursor(roomId: string, cursor: AgentRoomLiveCursor) {
  return encodeURIComponent(JSON.stringify({ ...cursor, roomId }));
}
function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
