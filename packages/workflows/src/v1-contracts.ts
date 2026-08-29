import type { JsonObject } from "@agentplat/core";

export const WORKFLOW_SCHEMA_VERSION_V1 = 1 as const;

export type WorkflowDigestV1 = `sha256:${string}`;

export interface ProcessDefinitionLimitsV1 {
  readonly maximumStages: number;
  readonly maximumDependenciesPerStage: number;
  readonly maximumDependentsPerStage: number;
  readonly maximumAttemptsPerTask: number;
  readonly maximumSignalBytes: number;
  readonly maximumRetainedSignals: number;
  readonly maximumTransitionsPerAdvance: number;
  readonly maximumRetainedOperations: number;
  readonly maximumRunDurationMs: number;
  readonly maximumGateDurationMs: number;
}

export const DEFAULT_PROCESS_DEFINITION_LIMITS_V1: Readonly<ProcessDefinitionLimitsV1> =
  Object.freeze({
    maximumStages: 256,
    maximumDependenciesPerStage: 32,
    maximumDependentsPerStage: 64,
    maximumAttemptsPerTask: 16,
    maximumSignalBytes: 65_536,
    maximumRetainedSignals: 1_024,
    maximumTransitionsPerAdvance: 256,
    maximumRetainedOperations: 65_536,
    maximumRunDurationMs: 366 * 24 * 60 * 60 * 1_000,
    maximumGateDurationMs: 30 * 24 * 60 * 60 * 1_000,
  });

export type ProcessStageOutcomeV1 =
  | "succeeded"
  | "failed"
  | "timed_out"
  | "canceled"
  | "skipped"
  | "signal_received"
  | "approved"
  | "rejected"
  | "expired";

export interface ProcessStageDependencyV1 {
  readonly stageId: string;
  readonly outcomes: readonly ProcessStageOutcomeV1[];
}

export interface ProcessStageBaseV1 {
  readonly schemaVersion: 1;
  readonly stageId: string;
  readonly name: string;
  readonly dependsOn: readonly ProcessStageDependencyV1[];
  readonly dependencyMode?: "all" | "any";
  readonly timeoutMs?: number;
  readonly metadata?: JsonObject;
}

export interface TaskRetryPolicyV1 {
  readonly maximumAttempts: number;
}

export type ProcessStageV1 =
  | (ProcessStageBaseV1 & {
      readonly kind: "task";
      readonly taskDefinitionId: string;
      readonly taskDefinitionVersion: string;
      readonly retryPolicy?: TaskRetryPolicyV1;
      readonly compensationForStageId?: string;
    })
  | (ProcessStageBaseV1 & {
      readonly kind: "wait";
      readonly durationMs: number;
    })
  | (ProcessStageBaseV1 & {
      readonly kind: "await_signal";
      readonly signalType: string;
      readonly correlationKey?: string;
    })
  | (ProcessStageBaseV1 & {
      readonly kind: "gate";
      readonly gateType: string;
      readonly gateDefinitionId: string;
      readonly configuration?: JsonObject;
      readonly expiresInMs?: number;
    });

export interface ProcessCancellationTriggerV1 {
  readonly kind: "signal";
  readonly signalType: string;
  readonly correlationKey?: string;
  readonly reasonCode: string;
}

export interface ProcessDefinitionV1 {
  readonly schemaVersion: 1;
  readonly processId: string;
  readonly version: string;
  readonly name: string;
  readonly stages: readonly ProcessStageV1[];
  readonly cancellationTriggers?: readonly ProcessCancellationTriggerV1[];
  readonly limits: ProcessDefinitionLimitsV1;
  readonly definitionDigest: WorkflowDigestV1;
}

export type ProcessDefinitionInputV1 = Omit<
  ProcessDefinitionV1,
  "schemaVersion" | "definitionDigest" | "limits"
> & {
  readonly limits?: Partial<ProcessDefinitionLimitsV1>;
};

export interface TaskActionBindingV1 {
  readonly namespace: string;
  readonly toolId: string;
  readonly operation: string;
}

export interface TaskDefinitionV1 {
  readonly schemaVersion: 1;
  readonly taskDefinitionId: string;
  readonly version: string;
  readonly name: string;
  readonly handlerKey: string;
  readonly handlerDigest: WorkflowDigestV1;
  readonly effectClass: "internal" | "protected_external";
  readonly actionBinding?: TaskActionBindingV1;
  readonly definitionDigest: WorkflowDigestV1;
}

export interface TaskExecutionBindingV1 {
  readonly taskDefinitionId: string;
  readonly taskDefinitionVersion: string;
  readonly handlerDigest: WorkflowDigestV1;
  readonly promptRevision?: string;
  readonly promptDigest?: WorkflowDigestV1;
  readonly modelProvider?: string;
  readonly modelName?: string;
  readonly modelRevision?: string;
  readonly modelConfigurationDigest?: WorkflowDigestV1;
  readonly policyDigest?: WorkflowDigestV1;
  readonly toolsetDigest?: WorkflowDigestV1;
  readonly runtimeImplementationDigest?: WorkflowDigestV1;
  readonly bindingDigest: WorkflowDigestV1;
}

export type TaskExecutionBindingInputV1 = Omit<
  TaskExecutionBindingV1,
  | "taskDefinitionId"
  | "taskDefinitionVersion"
  | "handlerDigest"
  | "bindingDigest"
>;

export interface TaskUsageCostV1 {
  readonly currency: string;
  readonly micros: number;
}

export interface TaskUsageV1 {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly durationMs?: number;
  readonly cost?: TaskUsageCostV1;
}

export interface TaskUsageAggregateV1 {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly durationMs: number;
  readonly costs: readonly TaskUsageCostV1[];
}

export type TaskRunStatusV1 =
  "claimed" | "running" | "completed" | "failed" | "canceled" | "indeterminate";

export interface TaskRunV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly taskRunId: string;
  readonly processRunId: string;
  readonly stageId: string;
  readonly attempt: number;
  readonly revision: number;
  readonly idempotencyKey: string;
  readonly inputDigest: WorkflowDigestV1;
  readonly status: TaskRunStatusV1;
  readonly binding: TaskExecutionBindingV1;
  readonly subject?: SubjectReferenceV1;
  readonly usage?: TaskUsageV1;
  readonly resultReference?: string;
  readonly resultDigest?: WorkflowDigestV1;
  readonly reasonCode?: string;
  readonly retryable?: boolean;
  readonly leaseOwnerId: string;
  readonly leaseToken: string;
  readonly leaseGeneration: number;
  readonly leaseExpiresAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stateDigest: WorkflowDigestV1;
}

export type ProcessRunStatusV1 =
  | "pending"
  | "running"
  | "waiting"
  | "canceling"
  | "completed"
  | "failed"
  | "canceled";

export type ProcessStageStatusV1 =
  "blocked" | "ready" | "running" | "waiting" | "terminal";

export interface ProcessStageStateV1 {
  readonly stageId: string;
  readonly status: ProcessStageStatusV1;
  readonly outcome?: ProcessStageOutcomeV1;
  readonly attempt: number;
  readonly taskRunId?: string;
  readonly waitUntil?: string;
  readonly consumedSignalId?: string;
  readonly gateRequestId?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly reasonCode?: string;
}

export interface SubjectReferenceV1 {
  readonly subjectType: string;
  readonly subjectId: string;
}

export interface ProcessCancellationStateV1 {
  readonly operationId: string;
  readonly reasonCode: string;
  readonly requestedAt: string;
  readonly pendingCompensationStageIds: readonly string[];
}

export interface ProcessRunV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly runId: string;
  readonly processId: string;
  readonly processVersion: string;
  readonly definitionDigest: WorkflowDigestV1;
  readonly revision: number;
  readonly status: ProcessRunStatusV1;
  readonly stageStates: readonly ProcessStageStateV1[];
  readonly input?: JsonObject;
  readonly result?: JsonObject;
  readonly subject?: SubjectReferenceV1;
  readonly cancellation?: ProcessCancellationStateV1;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stateDigest: WorkflowDigestV1;
}

export interface ProcessSignalV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly runId: string;
  readonly signalId: string;
  readonly signalType: string;
  readonly correlationKey?: string;
  readonly payload?: JsonObject;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceRevision?: number;
  readonly receivedAt: string;
  readonly signalDigest: WorkflowDigestV1;
}

export type ProcessSignalInputV1 = Omit<
  ProcessSignalV1,
  "schemaVersion" | "signalDigest"
>;

export interface StartProcessInputV1 {
  readonly tenantId: string;
  readonly runId: string;
  readonly processId: string;
  readonly processVersion: string;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly input?: JsonObject;
  readonly subject?: SubjectReferenceV1;
  readonly logicalTime: string;
}

export interface SignalProcessInputV1 {
  readonly tenantId: string;
  readonly runId: string;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly signal: Omit<ProcessSignalInputV1, "tenantId" | "runId">;
  readonly logicalTime: string;
}

export interface CancelProcessInputV1 {
  readonly tenantId: string;
  readonly runId: string;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly reasonCode: string;
  readonly logicalTime: string;
}

export interface DescribeProcessInputV1 {
  readonly tenantId: string;
  readonly runId: string;
}

export interface AdvanceProcessInputV1 extends DescribeProcessInputV1 {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly logicalTime: string;
  readonly maximumTransitions?: number;
}

export interface ProcessOperationResultV1 {
  readonly disposition: "applied" | "replayed";
  readonly run: ProcessRunV1;
}

export interface ProcessRunnerV1 {
  start(input: StartProcessInputV1): Promise<ProcessOperationResultV1>;
  signal(input: SignalProcessInputV1): Promise<ProcessOperationResultV1>;
  cancel(input: CancelProcessInputV1): Promise<ProcessOperationResultV1>;
  describe(input: DescribeProcessInputV1): Promise<ProcessRunV1 | undefined>;
}

export interface AdvancingProcessRunnerV1 extends ProcessRunnerV1 {
  advance(input: AdvanceProcessInputV1): Promise<ProcessOperationResultV1>;
}

export interface ProcessWorkerRunInputV1 {
  readonly logicalTime: string;
  readonly tenantId?: string;
  readonly limit?: number;
  readonly maximumTransitionsPerRun?: number;
}

export interface ProcessWorkerRunResultV1 {
  readonly inspected: number;
  readonly advancedRunIds: readonly string[];
}

export interface ProcessWorkerV1 {
  runOnce(input: ProcessWorkerRunInputV1): Promise<ProcessWorkerRunResultV1>;
  drain(): Promise<void>;
}

export interface ProcessTaskExecutionRequestV1 {
  readonly tenantId: string;
  readonly runId: string;
  readonly stage: Extract<ProcessStageV1, { kind: "task" }>;
  readonly taskDefinition: TaskDefinitionV1;
  readonly attempt: number;
  readonly taskRunId: string;
  readonly idempotencyKey: string;
  readonly binding: TaskExecutionBindingV1;
  readonly processInput?: JsonObject;
  readonly lease: {
    readonly ownerId: string;
    readonly token: string;
    readonly generation: number;
    readonly expiresAt: string;
  };
  readonly heartbeat: (input: {
    readonly logicalTime: string;
  }) => Promise<boolean>;
  readonly signal: AbortSignal;
}

export type ProcessTaskExecutionResultV1 =
  | {
      readonly status: "completed";
      readonly result?: JsonObject;
      readonly resultReference?: string;
      readonly resultDigest?: WorkflowDigestV1;
      readonly usage?: TaskUsageV1;
    }
  | {
      readonly status: "failed";
      readonly reasonCode: string;
      readonly retryable?: boolean;
      readonly usage?: TaskUsageV1;
    }
  | {
      readonly status: "indeterminate";
      readonly reasonCode: string;
      readonly usage?: TaskUsageV1;
    }
  | {
      readonly status: "in_flight";
      readonly reasonCode: string;
    };

export interface TaskExecutorPortV1 {
  execute(
    input: ProcessTaskExecutionRequestV1,
  ): Promise<ProcessTaskExecutionResultV1>;
}

export interface TaskExecutionBindingResolverV1 {
  resolve(input: {
    readonly tenantId: string;
    readonly runId: string;
    readonly stage: Extract<ProcessStageV1, { kind: "task" }>;
    readonly taskDefinition: TaskDefinitionV1;
    readonly processInput?: JsonObject;
  }): Promise<TaskExecutionBindingInputV1>;
}

export interface ProcessGateRequestV1 {
  readonly tenantId: string;
  readonly runId: string;
  readonly stageId: string;
  readonly gateType: string;
  readonly gateDefinitionId: string;
  readonly configuration?: JsonObject;
  readonly processInput?: JsonObject;
  readonly requestedAt: string;
  readonly expiresAt?: string;
  readonly logicalTime: string;
}

export type ProcessGateResultV1 =
  | { readonly status: "waiting"; readonly gateRequestId: string }
  | {
      readonly status: "approved" | "rejected" | "expired" | "failed";
      readonly gateRequestId: string;
      readonly reasonCode?: string;
    };

export interface GateProviderPortV1 {
  resolve(input: ProcessGateRequestV1): Promise<ProcessGateResultV1>;
}

export interface WorkflowOperationRecordV1 {
  readonly tenantId: string;
  readonly operationKind: "start" | "signal" | "cancel" | "advance";
  readonly idempotencyKey: string;
  readonly requestDigest: WorkflowDigestV1;
  readonly runId: string;
}

export interface WorkflowStoreV1 {
  registerTaskDefinition(
    tenantId: string,
    definition: TaskDefinitionV1,
  ): Promise<"created" | "replayed">;
  getTaskDefinition(
    tenantId: string,
    taskDefinitionId: string,
    taskDefinitionVersion: string,
  ): Promise<TaskDefinitionV1 | undefined>;
  registerProcessDefinition(
    tenantId: string,
    definition: ProcessDefinitionV1,
  ): Promise<"created" | "replayed">;
  getProcessDefinition(
    tenantId: string,
    processId: string,
    processVersion: string,
  ): Promise<ProcessDefinitionV1 | undefined>;
  createTaskRun(run: TaskRunV1): Promise<boolean>;
  getTaskRun(
    tenantId: string,
    taskRunId: string,
  ): Promise<TaskRunV1 | undefined>;
  findTaskRunByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<TaskRunV1 | undefined>;
  listTaskRuns(input: {
    readonly tenantId: string;
    readonly processRunId?: string;
    readonly status?: TaskRunStatusV1;
    readonly subject?: SubjectReferenceV1;
  }): Promise<TaskRunV1[]>;
  compareAndSetTaskRun(input: {
    readonly expectedRevision: number;
    readonly expectedStateDigest: WorkflowDigestV1;
    readonly run: TaskRunV1;
  }): Promise<boolean>;
  createProcessRun(run: ProcessRunV1): Promise<boolean>;
  getProcessRun(
    tenantId: string,
    runId: string,
  ): Promise<ProcessRunV1 | undefined>;
  listRunnableProcessRuns(input: {
    readonly tenantId?: string;
    readonly limit: number;
  }): Promise<ProcessRunV1[]>;
  compareAndSetProcessRun(input: {
    readonly expectedRevision: number;
    readonly expectedStateDigest: WorkflowDigestV1;
    readonly run: ProcessRunV1;
  }): Promise<boolean>;
  getOperation(
    tenantId: string,
    operationKind: WorkflowOperationRecordV1["operationKind"],
    idempotencyKey: string,
  ): Promise<WorkflowOperationRecordV1 | undefined>;
  saveOperation(record: WorkflowOperationRecordV1): Promise<boolean>;
  countOperations(tenantId: string, runId: string): Promise<number>;
  appendSignal(signal: ProcessSignalV1): Promise<"created" | "replayed">;
  listSignals(tenantId: string, runId: string): Promise<ProcessSignalV1[]>;
}
