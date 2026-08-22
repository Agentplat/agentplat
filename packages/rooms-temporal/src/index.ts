import {
  agentRoomCoordinationWorkflow,
  notifyAgentRoomCoordination,
} from "./workflow.js";
import type {
  AgentRoomCoordinationRuntime,
  AgentRoomCoordinationStore,
} from "@agentplat/rooms";
import type { TemporalAgentRoomActivities } from "./contracts.js";

/** Structural Temporal client and naming options used by the wakeup adapter. */
export interface TemporalAgentRoomCoordinationAdapterOptions {
  client: {
    workflow: {
      signalWithStart(
        workflow: typeof agentRoomCoordinationWorkflow,
        options: {
          workflowId: string;
          taskQueue: string;
          args: Parameters<typeof agentRoomCoordinationWorkflow>;
          signal: {
            readonly name: "agentplat.room.coordination.notify";
          };
          signalArgs: [number];
        },
      ): Promise<unknown>;
    };
  };
  taskQueue: string;
  workflowId?(input: {
    tenantId: string;
    roomId: string;
    coordinationId: string;
  }): string;
}

/** Transport adapter only; Agent Room state remains in the injected durable stores. */
export class TemporalAgentRoomCoordinationAdapter {
  constructor(
    private readonly options: TemporalAgentRoomCoordinationAdapterOptions,
  ) {}

  async notify(input: {
    tenantId: string;
    roomId: string;
    coordinationId: string;
    expectedRevision: number;
  }): Promise<void> {
    const workflowId =
      this.options.workflowId?.(input) ??
      `agentplat-room:${encodeURIComponent(input.tenantId)}:${encodeURIComponent(input.roomId)}:${encodeURIComponent(input.coordinationId)}`;
    await this.options.client.workflow.signalWithStart(
      agentRoomCoordinationWorkflow,
      {
        workflowId,
        taskQueue: this.options.taskQueue,
        args: [input],
        signal: notifyAgentRoomCoordination,
        signalArgs: [input.expectedRevision],
      },
    );
  }
}

/** Binds Temporal activities to canonical coordination state and execution. */
export function createTemporalAgentRoomActivities(input: {
  runtime: AgentRoomCoordinationRuntime;
  store: AgentRoomCoordinationStore;
}): TemporalAgentRoomActivities {
  return {
    runCoordinationCycle: async (cycle) => {
      const state = await input.runtime.runNext({
        tenantId: cycle.tenantId,
        roomId: cycle.roomId,
        coordinationId: cycle.coordinationId,
        expectedRevision: cycle.expectedRevision,
        leaseToken: cycle.leaseToken,
      });
      const persisted =
        (await input.store.load(
          cycle.tenantId,
          cycle.roomId,
          cycle.coordinationId,
        )) ?? state;
      const hasPending = persisted.items.some(
        (item) => item.status === "pending" || item.status === "processing",
      );
      return {
        revision: persisted.revision,
        status: persisted.status,
        hasPending,
      };
    },
  };
}

export * from "./contracts.js";
