import {
  condition,
  continueAsNew,
  defineSignal,
  defineQuery,
  proxyActivities,
  setHandler,
  sleep,
  uuid4,
} from "@temporalio/workflow";
import type {
  TemporalAgentRoomActivities,
  TemporalCoordinationCycleResult,
} from "./contracts.js";

const notifySignal = defineSignal<[number]>(
  "agentplat.room.coordination.notify",
);
/** Public Temporal signal used to wake or start Room coordination. */
export const notifyAgentRoomCoordination: {
  readonly name: "agentplat.room.coordination.notify";
} = notifySignal as unknown as {
  readonly name: "agentplat.room.coordination.notify";
};

/** Stable Room scope and rollover configuration for the Temporal workflow. */
export interface TemporalAgentRoomWorkflowInput {
  tenantId: string;
  roomId: string;
  coordinationId: string;
  expectedRevision: number;
  cycle?: number;
  rolloverAfterCycles?: number;
}

const getAgentRoomCoordinationWorkflowState = defineQuery<{
  cycle: number;
  revision: number;
}>("agentplat.room.coordination.state");

const { runCoordinationCycle } = proxyActivities<TemporalAgentRoomActivities>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

/**
 * Waits for durable coordination notifications and invokes bounded activity
 * cycles, rolling workflow history with `continueAsNew`.
 */
export async function agentRoomCoordinationWorkflow(
  input: TemporalAgentRoomWorkflowInput,
): Promise<void> {
  let notifiedRevision: number | null = input.expectedRevision;
  let cycle = input.cycle ?? 0;
  let revision = input.expectedRevision;
  setHandler(notifySignal, (revision) => {
    notifiedRevision = Math.max(notifiedRevision ?? 0, revision);
  });
  setHandler(getAgentRoomCoordinationWorkflowState, () => ({
    cycle,
    revision,
  }));

  for (;;) {
    await condition(() => notifiedRevision !== null);
    const expectedRevision: number = notifiedRevision!;
    notifiedRevision = null;
    const result: TemporalCoordinationCycleResult = await runCoordinationCycle({
      tenantId: input.tenantId,
      roomId: input.roomId,
      coordinationId: input.coordinationId,
      expectedRevision,
      leaseToken: `temporal:${uuid4()}`,
    });
    cycle += 1;
    revision = result.revision;
    if (result.hasPending) {
      notifiedRevision = result.revision;
      await sleep("100 milliseconds");
    }
    if (cycle >= (input.rolloverAfterCycles ?? 1_000)) {
      await continueAsNew<typeof agentRoomCoordinationWorkflow>({
        ...input,
        expectedRevision: result.revision,
        cycle: 0,
      });
    }
  }
}
