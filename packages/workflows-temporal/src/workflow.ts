import {
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  uuid4,
} from "@temporalio/workflow";

import type {
  TemporalProcessCycleResultV1,
  TemporalWorkflowActivitiesV1,
} from "./contracts.js";

const notifySignal = defineSignal<[number]>(
  "agentplat.workflow.process.notify",
);

export const notifyWorkflowProcessV1: {
  readonly name: "agentplat.workflow.process.notify";
} = notifySignal as unknown as {
  readonly name: "agentplat.workflow.process.notify";
};

export interface TemporalWorkflowProcessInputV1 {
  readonly tenantId: string;
  readonly runId: string;
  readonly expectedRevision: number;
  readonly cycle?: number;
  readonly totalCycles?: number;
  readonly rolloverAfterCycles?: number;
  readonly maximumTransitionsPerCycle?: number;
  /** Internal rollover continuity; callers normally omit these fields. */
  readonly nextWakeupAt?: string | null;
  readonly wakeImmediately?: boolean;
}

const stateQuery = defineQuery<{
  readonly cycle: number;
  readonly totalCycles: number;
  readonly revision: number;
  readonly status: string;
  readonly nextWakeupAt: string | null;
}>("agentplat.workflow.process.state");

const { advanceProcess } = proxyActivities<TemporalWorkflowActivitiesV1>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 5 },
});

export async function governedProcessWorkflowV1(
  input: TemporalWorkflowProcessInputV1,
): Promise<void> {
  if (
    !input.tenantId ||
    !input.runId ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    (input.cycle !== undefined &&
      (!Number.isSafeInteger(input.cycle) || input.cycle < 0)) ||
    (input.totalCycles !== undefined &&
      (!Number.isSafeInteger(input.totalCycles) || input.totalCycles < 0)) ||
    (input.rolloverAfterCycles !== undefined &&
      (!Number.isSafeInteger(input.rolloverAfterCycles) ||
        input.rolloverAfterCycles < 1 ||
        input.rolloverAfterCycles > 100_000)) ||
    (input.maximumTransitionsPerCycle !== undefined &&
      (!Number.isSafeInteger(input.maximumTransitionsPerCycle) ||
        input.maximumTransitionsPerCycle < 1 ||
        input.maximumTransitionsPerCycle > 10_000)) ||
    (input.nextWakeupAt !== undefined &&
      input.nextWakeupAt !== null &&
      !Number.isFinite(Date.parse(input.nextWakeupAt)))
  )
    throw new TypeError("temporal_workflow_input_invalid");
  let notifiedRevision: number | null =
    input.wakeImmediately === false ? null : input.expectedRevision;
  let revision = input.expectedRevision;
  let cycle = input.cycle ?? 0;
  let totalCycles = input.totalCycles ?? 0;
  let status = "running";
  let nextWakeupAt: string | null = input.nextWakeupAt ?? null;
  setHandler(notifySignal, (candidateRevision) => {
    notifiedRevision = Math.max(notifiedRevision ?? 0, candidateRevision);
  });
  setHandler(stateQuery, () => ({
    cycle,
    totalCycles,
    revision,
    status,
    nextWakeupAt,
  }));

  for (;;) {
    if (notifiedRevision === null) {
      if (nextWakeupAt === null) {
        await condition(() => notifiedRevision !== null);
      } else {
        const timeoutMs = Math.max(0, Date.parse(nextWakeupAt) - Date.now());
        await condition(() => notifiedRevision !== null, timeoutMs);
      }
    }
    const expectedRevision = Math.max(revision, notifiedRevision ?? revision);
    notifiedRevision = null;
    const operationId = `temporal-cycle:${totalCycles}:${expectedRevision}`;
    const result: TemporalProcessCycleResultV1 = await advanceProcess({
      tenantId: input.tenantId,
      runId: input.runId,
      expectedRevision,
      operationId,
      logicalTime: new Date(Date.now()).toISOString(),
      leaseToken: `temporal:${uuid4()}`,
      ...(input.maximumTransitionsPerCycle !== undefined
        ? { maximumTransitions: input.maximumTransitionsPerCycle }
        : {}),
    });
    cycle += 1;
    totalCycles += 1;
    revision = result.revision;
    status = result.status;
    nextWakeupAt = result.nextWakeupAt;
    if (result.terminal) return;
    if (result.hasReady) notifiedRevision = result.revision;
    if (
      cycle >= (input.rolloverAfterCycles ?? 1_000) &&
      (result.hasReady || result.nextWakeupAt !== null) &&
      notifiedRevision === null
    ) {
      await continueAsNew<typeof governedProcessWorkflowV1>({
        ...input,
        expectedRevision: result.revision,
        cycle: 0,
        totalCycles,
        nextWakeupAt: result.nextWakeupAt,
        wakeImmediately: result.hasReady,
      });
    }
  }
}
