import type { ProcessRunStatusV1 } from "@agentplat/workflows";

export interface TemporalProcessCycleInputV1 {
  readonly tenantId: string;
  readonly runId: string;
  readonly expectedRevision: number;
  readonly operationId: string;
  readonly logicalTime: string;
  readonly leaseToken: string;
  readonly maximumTransitions?: number;
}

export interface TemporalProcessCycleResultV1 {
  readonly revision: number;
  readonly status: ProcessRunStatusV1;
  readonly terminal: boolean;
  readonly hasReady: boolean;
  readonly nextWakeupAt: string | null;
}

export interface TemporalWorkflowActivitiesV1 {
  advanceProcess(
    input: TemporalProcessCycleInputV1,
  ): Promise<TemporalProcessCycleResultV1>;
}
