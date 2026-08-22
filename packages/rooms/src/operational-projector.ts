import { AgentPlatError } from "@agentplat/core";
import type { AgentRoomCoordinationStore } from "./coordination-runtime.js";
import type { AgentRoomOperationalEventReader } from "./operational-events.js";
import type { AgentRoomHandoffCoordinator } from "./room-handoff.js";
import type { AgentRoomPlannerBridge } from "./planner-bridge.js";

/** Durable compare-and-set high-water storage for an idempotent projector. */
export interface AgentRoomProjectionCheckpointStore {
  load(projectionId: string): Promise<number>;
  compareAndSet(input: {
    projectionId: string;
    expectedSequence: number;
    nextSequence: number;
  }): Promise<boolean>;
}

/** Test-oriented in-memory projection checkpoint store. */
export class InMemoryAgentRoomProjectionCheckpointStore implements AgentRoomProjectionCheckpointStore {
  private readonly sequences = new Map<string, number>();
  async load(projectionId: string) {
    return this.sequences.get(projectionId) ?? 0;
  }
  async compareAndSet(input: {
    projectionId: string;
    expectedSequence: number;
    nextSequence: number;
  }) {
    if (
      (this.sequences.get(input.projectionId) ?? 0) !== input.expectedSequence
    )
      return false;
    this.sequences.set(input.projectionId, input.nextSequence);
    return true;
  }
}

/** Projects transactional operational events into durable coordination work. */
export class AgentRoomOperationalEventProjector {
  constructor(
    private readonly events: AgentRoomOperationalEventReader,
    private readonly checkpoints: AgentRoomProjectionCheckpointStore,
    private readonly coordination: AgentRoomCoordinationStore,
    private readonly handoffs: Pick<AgentRoomHandoffCoordinator, "get">,
    private readonly planner?: Pick<
      AgentRoomPlannerBridge,
      "reconcileFromEvent"
    >,
  ) {}

  async project(input: {
    tenantId: string;
    roomId: string;
    coordinationId?: string;
    limit?: number;
  }) {
    const projectionId = `agent-room-coordination:${input.tenantId}:${input.roomId}`;
    let sequence = await this.checkpoints.load(projectionId);
    const events = await this.events.listAfter({
      tenantId: input.tenantId,
      roomId: input.roomId,
      afterSequence: sequence,
      limit: input.limit ?? 100,
    });
    for (const event of events) {
      if (event.source === "room_handoffs" && event.eventType === "accepted") {
        const handoff = await this.handoffs.get({
          tenantId: input.tenantId,
          roomId: input.roomId,
          handoffId: event.sourceId,
        });
        await this.enqueueHandoff(
          input.tenantId,
          input.roomId,
          input.coordinationId ?? `room:${input.roomId}`,
          handoff.handoffId,
        );
      }
      if (event.source === "events" && this.planner) {
        await this.planner.reconcileFromEvent({
          tenantId: input.tenantId,
          roomId: input.roomId,
          triggerEventId: event.sourceId,
        });
      }
      if (
        !(await this.checkpoints.compareAndSet({
          projectionId,
          expectedSequence: sequence,
          nextSequence: event.sequence,
        }))
      ) {
        throw new AgentPlatError(
          "CONFLICT",
          "Operational event projection checkpoint changed concurrently",
        );
      }
      sequence = event.sequence;
    }
    return { projected: events.length, sequence };
  }

  async projectAll(limit = 1_000) {
    if (!this.events.listScopes) {
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Operational event reader does not support scope discovery",
      );
    }
    const results = [];
    for (const scope of await this.events.listScopes(limit)) {
      results.push(await this.project(scope));
    }
    return results;
  }

  private async enqueueHandoff(
    tenantId: string,
    roomId: string,
    coordinationId: string,
    handoffId: string,
  ) {
    const current = await this.coordination.load(
      tenantId,
      roomId,
      coordinationId,
    );
    const itemId = `handoff:${handoffId}`;
    if (current?.items.some((item) => item.itemId === itemId)) return;
    const now = new Date().toISOString();
    const item = {
      itemId,
      kind: "handoff" as const,
      referenceId: handoffId,
      status: "pending" as const,
      operationId: `${coordinationId}:handoff:${itemId}`,
      attempts: 0,
      runIds: [],
    };
    const next = current
      ? {
          ...current,
          revision: current.revision + 1,
          status: "idle" as const,
          items: [...current.items, item],
          updatedAt: now,
        }
      : {
          tenantId,
          roomId,
          coordinationId,
          revision: 0,
          status: "idle" as const,
          items: [item],
          createdAt: now,
          updatedAt: now,
        };
    if (
      !(await this.coordination.compareAndSet({
        expectedRevision: current?.revision ?? null,
        state: next,
      }))
    ) {
      throw new AgentPlatError(
        "CONFLICT",
        "Handoff coordination inbox changed concurrently",
      );
    }
  }
}
