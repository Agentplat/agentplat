import type {
  AdvancingProcessRunnerV1,
  GateProviderPortV1,
  ProcessGateResultV1,
  TaskExecutorPortV1,
  WorkflowDigestV1,
  WorkflowStoreV1,
} from "@agentplat/workflows";
import type { TaskOutcomeStoreV1 } from "@agentplat/workflows/outcomes";

export const WORKFLOW_CONFORMANCE_VERSION_V1 = 1 as const;

export type WorkflowConformanceCapabilityV1 =
  | "runner.core"
  | "runner.gates"
  | "runner.cancellation"
  | "task.integrity"
  | "task.leases"
  | "outcomes.delayed"
  | "persistence.restart";

export type WorkflowConformanceCaseIdV1 =
  | "definition_and_linear_dag"
  | "start_idempotency_conflict"
  | "signal_resume_and_replay"
  | "wait_deadline"
  | "gate_expiry_fail_closed"
  | "cancellation_compensation"
  | "task_binding_usage_outcome"
  | "task_lease_takeover"
  | "persistence_distinct_reopen";

export interface WorkflowConformanceControlV1 {
  readonly taskExecutor: TaskExecutorPortV1;
  readonly gateProvider: GateProviderPortV1;
  setGateResult(stageId: string, result: ProcessGateResultV1): void;
  taskExecutionStageIds(): readonly string[];
}

export interface WorkflowConformanceRuntimeV1 {
  readonly store: WorkflowStoreV1;
  readonly runner: AdvancingProcessRunnerV1;
  readonly outcomes: TaskOutcomeStoreV1;
  readonly control: WorkflowConformanceControlV1;
}

export interface WorkflowConformanceScopeV1 {
  open(): Promise<WorkflowConformanceRuntimeV1>;
  reopen?(): Promise<WorkflowConformanceRuntimeV1>;
  cleanup(): Promise<void>;
}

export interface WorkflowConformanceFactoryV1 {
  create(input: {
    readonly caseId: WorkflowConformanceCaseIdV1;
    readonly scopeId: string;
    readonly seed: number;
    readonly signal: AbortSignal;
  }): Promise<WorkflowConformanceScopeV1>;
}

export interface WorkflowConformanceOptionsV1 {
  readonly implementationId: string;
  readonly implementationVersion: string;
  readonly implementationDigest: WorkflowDigestV1;
  readonly capabilities: readonly WorkflowConformanceCapabilityV1[];
  readonly factory: WorkflowConformanceFactoryV1;
  readonly seed: number;
  readonly caseTimeoutMs?: number;
  readonly destructiveTestConsent?: boolean;
  readonly clock?: () => Date;
}

export interface WorkflowConformanceCaseResultV1 {
  readonly caseId: WorkflowConformanceCaseIdV1;
  readonly outcome: "passed" | "failed" | "skipped";
  readonly reasonCode: string;
  readonly durationMs: number;
}

export interface WorkflowConformanceReportV1 {
  readonly schemaVersion: 1;
  readonly conformanceVersion: 1;
  readonly implementationId: string;
  readonly implementationVersion: string;
  readonly implementationDigest: WorkflowDigestV1;
  readonly capabilities: readonly WorkflowConformanceCapabilityV1[];
  readonly seed: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly cases: readonly WorkflowConformanceCaseResultV1[];
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly reportDigest: WorkflowDigestV1;
}
