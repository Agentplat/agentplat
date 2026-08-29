import type {
  AdvancingProcessRunnerV1,
  CancelProcessInputV1,
  DescribeProcessInputV1,
  ProcessOperationResultV1,
  ProcessRunV1,
  ProcessRunnerV1,
  SignalProcessInputV1,
  StartProcessInputV1,
  WorkflowStoreV1,
} from "@agentplat/workflows";

import type {
  TemporalProcessCycleResultV1,
  TemporalWorkflowActivitiesV1,
} from "./contracts.js";
import {
  governedProcessWorkflowV1,
  notifyWorkflowProcessV1,
} from "./workflow.js";

export interface TemporalWorkflowNotifierOptionsV1 {
  readonly client: {
    readonly workflow: {
      signalWithStart(
        workflow: typeof governedProcessWorkflowV1,
        options: {
          readonly workflowId: string;
          readonly taskQueue: string;
          readonly args: Parameters<typeof governedProcessWorkflowV1>;
          readonly signal: {
            readonly name: "agentplat.workflow.process.notify";
          };
          readonly signalArgs: [number];
        },
      ): Promise<unknown>;
    };
  };
  readonly taskQueue: string;
  readonly rolloverAfterCycles?: number;
  readonly maximumTransitionsPerCycle?: number;
  readonly workflowId?: (input: {
    readonly tenantId: string;
    readonly runId: string;
  }) => string;
}

/** Temporal wakeup client; it never reads or writes canonical process state. */
export class TemporalWorkflowNotifierV1 {
  constructor(readonly options: TemporalWorkflowNotifierOptionsV1) {
    required(options?.taskQueue, "taskQueue");
    if (options.rolloverAfterCycles !== undefined)
      positiveLimit(
        options.rolloverAfterCycles,
        "rolloverAfterCycles",
        100_000,
      );
    if (options.maximumTransitionsPerCycle !== undefined)
      positiveLimit(
        options.maximumTransitionsPerCycle,
        "maximumTransitionsPerCycle",
        10_000,
      );
  }

  async notify(input: {
    readonly tenantId: string;
    readonly runId: string;
    readonly expectedRevision: number;
  }): Promise<void> {
    required(input.tenantId, "tenantId");
    required(input.runId, "runId");
    nonNegative(input.expectedRevision, "expectedRevision");
    const workflowId =
      this.options.workflowId?.(input) ??
      `agentplat-workflow:${encodeURIComponent(input.tenantId)}:${encodeURIComponent(input.runId)}`;
    await this.options.client.workflow.signalWithStart(
      governedProcessWorkflowV1,
      {
        workflowId,
        taskQueue: this.options.taskQueue,
        args: [
          {
            tenantId: input.tenantId,
            runId: input.runId,
            expectedRevision: input.expectedRevision,
            ...(this.options.rolloverAfterCycles !== undefined
              ? { rolloverAfterCycles: this.options.rolloverAfterCycles }
              : {}),
            ...(this.options.maximumTransitionsPerCycle !== undefined
              ? {
                  maximumTransitionsPerCycle:
                    this.options.maximumTransitionsPerCycle,
                }
              : {}),
          },
        ],
        signal: notifyWorkflowProcessV1,
        signalArgs: [input.expectedRevision],
      },
    );
  }
}

/** Commits through AgentPlat first, then sends a recoverable Temporal wakeup. */
export class TemporalProcessRunnerV1 implements AdvancingProcessRunnerV1 {
  constructor(
    readonly authoritative: AdvancingProcessRunnerV1,
    readonly notifier: TemporalWorkflowNotifierV1,
  ) {}

  async start(input: StartProcessInputV1): Promise<ProcessOperationResultV1> {
    return this.#mutate(() => this.authoritative.start(input));
  }

  async signal(input: SignalProcessInputV1): Promise<ProcessOperationResultV1> {
    return this.#mutate(() => this.authoritative.signal(input));
  }

  async cancel(input: CancelProcessInputV1): Promise<ProcessOperationResultV1> {
    return this.#mutate(() => this.authoritative.cancel(input));
  }

  async advance(
    input: Parameters<AdvancingProcessRunnerV1["advance"]>[0],
  ): Promise<ProcessOperationResultV1> {
    return this.#mutate(() => this.authoritative.advance(input));
  }

  async describe(
    input: DescribeProcessInputV1,
  ): Promise<ProcessRunV1 | undefined> {
    return this.authoritative.describe(input);
  }

  async #mutate(
    mutation: () => Promise<ProcessOperationResultV1>,
  ): Promise<ProcessOperationResultV1> {
    const result = await mutation();
    await this.notifier.notify({
      tenantId: result.run.tenantId,
      runId: result.run.runId,
      expectedRevision: result.run.revision,
    });
    return result;
  }
}

/** Bounded recovery for mutations committed before a notification failure. */
export class TemporalWorkflowReconcilerV1 {
  constructor(
    readonly store: Pick<WorkflowStoreV1, "listRunnableProcessRuns">,
    readonly notifier: TemporalWorkflowNotifierV1,
  ) {}

  async reconcile(
    input: {
      readonly tenantId?: string;
      readonly limit?: number;
    } = {},
  ): Promise<{
    readonly inspected: number;
    readonly notifiedRunIds: readonly string[];
    readonly failedRunIds: readonly string[];
  }> {
    const limit = input.limit ?? 100;
    positiveLimit(limit, "limit", 1_000);
    const runs = await this.store.listRunnableProcessRuns({
      tenantId: input.tenantId,
      limit,
    });
    const notifiedRunIds: string[] = [];
    const failedRunIds: string[] = [];
    for (const run of runs)
      try {
        await this.notifier.notify({
          tenantId: run.tenantId,
          runId: run.runId,
          expectedRevision: run.revision,
        });
        notifiedRunIds.push(run.runId);
      } catch {
        failedRunIds.push(run.runId);
      }
    return Object.freeze({
      inspected: runs.length,
      notifiedRunIds: Object.freeze(notifiedRunIds),
      failedRunIds: Object.freeze(failedRunIds),
    });
  }
}

export function createTemporalWorkflowActivitiesV1(input: {
  readonly runner: AdvancingProcessRunnerV1;
}): TemporalWorkflowActivitiesV1 {
  if (!input?.runner)
    throw new TypeError("Temporal workflow runner is required");
  return {
    advanceProcess: async (cycle) => {
      const current = await input.runner.describe({
        tenantId: cycle.tenantId,
        runId: cycle.runId,
      });
      if (!current) throw new Error("workflow_process_missing");
      if (current.revision < cycle.expectedRevision)
        throw new Error("workflow_process_revision_not_committed");
      const result = terminal(current.status)
        ? { disposition: "replayed" as const, run: current }
        : await input.runner.advance({
            tenantId: cycle.tenantId,
            runId: cycle.runId,
            operationId: cycle.operationId,
            idempotencyKey: cycle.operationId,
            logicalTime: cycle.logicalTime,
            ...(cycle.maximumTransitions !== undefined
              ? { maximumTransitions: cycle.maximumTransitions }
              : {}),
          });
      return summarize(result.run);
    },
  };
}

function summarize(run: ProcessRunV1): TemporalProcessCycleResultV1 {
  const wakeups = run.stageStates
    .filter((state) => state.status === "waiting" && state.waitUntil)
    .map((state) => state.waitUntil!)
    .sort();
  return Object.freeze({
    revision: run.revision,
    status: run.status,
    terminal: terminal(run.status),
    hasReady:
      run.status === "running" ||
      run.status === "canceling" ||
      run.stageStates.some(
        (state) => state.status === "ready" || state.status === "running",
      ),
    nextWakeupAt: wakeups[0] ?? null,
  });
}

function terminal(status: ProcessRunV1["status"]): boolean {
  return ["completed", "failed", "canceled"].includes(status);
}

function required(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 256)
    throw new TypeError(`temporal_workflow_${label}_invalid`);
}

function nonNegative(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new RangeError(`temporal_workflow_${label}_invalid`);
}

function positiveLimit(value: unknown, label: string, maximum: number): void {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > maximum
  )
    throw new RangeError(`temporal_workflow_${label}_invalid`);
}

export * from "./contracts.js";
