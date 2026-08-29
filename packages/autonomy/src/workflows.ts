import {
  WorkflowValidationErrorV1,
  validateTaskRunV1,
  type WorkflowStoreV1,
} from "@agentplat/workflows";
import {
  validateOutcomeCoveragePolicyV1,
  validateTaskOutcomeV1,
  type OutcomeCoveragePolicyV1,
  type TaskOutcomeStoreV1,
  type TaskOutcomeV1,
} from "@agentplat/workflows/outcomes";

import {
  AutonomyValidationErrorV1,
  type AutonomyDigestV1,
} from "./canonical.js";
import { createAutonomyEvidenceWindowV1 } from "./runtime.js";
import type { AutonomyEvidenceWindowV1 } from "./contracts.js";

export interface WorkflowAutonomyEvidenceInputV1 {
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly segmentNamespace: string;
  readonly segmentKey: string;
  readonly actionType: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly windowSequence: number;
  readonly observedFrom: string;
  readonly observedThrough: string;
  readonly outcomeType: string;
  readonly taskRunIds: readonly string[];
  readonly coveragePolicy: OutcomeCoveragePolicyV1;
}

/** Derives one bounded autonomy window from exact workflow task/outcome IDs. */
export class WorkflowAutonomyEvidenceAdapterV1 {
  constructor(
    readonly taskRuns: Pick<WorkflowStoreV1, "getTaskRun">,
    readonly outcomes: TaskOutcomeStoreV1,
  ) {}

  async derive(
    input: WorkflowAutonomyEvidenceInputV1,
  ): Promise<AutonomyEvidenceWindowV1> {
    validateInput(input);
    const policy = validateOutcomeCoveragePolicyV1(input.coveragePolicy);
    try {
      const runs = [];
      for (const taskRunId of input.taskRunIds) {
        const candidate = await this.taskRuns.getTaskRun(
          input.tenantId,
          taskRunId,
        );
        if (!candidate)
          throw new WorkflowValidationErrorV1(
            "autonomy_workflow_task_run_missing",
          );
        const run = validateTaskRunV1(candidate);
        if (run.tenantId !== input.tenantId || run.status !== "completed")
          throw new WorkflowValidationErrorV1(
            "autonomy_workflow_task_run_ineligible",
          );
        runs.push(run);
      }
      const latestByTask = new Map<string, TaskOutcomeV1>();
      for (const run of runs) {
        const candidates = (
          await this.outcomes.listOutcomes({
            tenantId: input.tenantId,
            taskRunId: run.taskRunId,
            outcomeType: input.outcomeType,
            recordedFrom: input.observedFrom,
            recordedThrough: input.observedThrough,
          })
        )
          .map(validateTaskOutcomeV1)
          .sort((left, right) =>
            left.recordedAt === right.recordedAt
              ? left.outcomeId.localeCompare(right.outcomeId)
              : left.recordedAt.localeCompare(right.recordedAt),
          );
        const latest = candidates.at(-1);
        if (latest) {
          if (latest.taskExecutionBindingDigest !== run.binding.bindingDigest)
            throw new WorkflowValidationErrorV1(
              "autonomy_workflow_outcome_binding_mismatch",
            );
          latestByTask.set(run.taskRunId, latest);
        }
      }
      let positive = 0;
      let negative = 0;
      let corrected = 0;
      let inconclusive = 0;
      let unresolvedTaskRuns = 0;
      const reasonCounts: Record<string, number> = {};
      for (const run of runs) {
        const outcome = latestByTask.get(run.taskRunId);
        if (!outcome || outcome.verdict === "inconclusive") {
          unresolvedTaskRuns += 1;
          if (outcome?.verdict === "inconclusive") inconclusive += 1;
          continue;
        }
        if (outcome.verdict === "positive") positive += 1;
        else if (outcome.verdict === "negative") negative += 1;
        else corrected += 1;
        if (outcome.reasonCode)
          reasonCounts[outcome.reasonCode] =
            (reasonCounts[outcome.reasonCode] ?? 0) + 1;
      }
      const concludedOutcomes = positive + negative + corrected;
      const unresolvedBasisPoints = runs.length
        ? Math.ceil((unresolvedTaskRuns * 10_000) / runs.length)
        : 10_000;
      const overdueCutoff =
        Date.parse(input.observedThrough) - policy.maximumObservationLagMs;
      const stale = runs.some(
        (run) =>
          !latestByTask.has(run.taskRunId) &&
          Date.parse(run.finishedAt ?? run.updatedAt) <= overdueCutoff,
      );
      const coverageStatus = stale
        ? "stale"
        : concludedOutcomes < policy.minimumConcludedOutcomes ||
            unresolvedBasisPoints > policy.maximumUnresolvedBasisPoints
          ? "insufficient"
          : "healthy";
      const orderedOutcomes = [...latestByTask.values()].sort((left, right) =>
        left.recordedAt === right.recordedAt
          ? left.outcomeId.localeCompare(right.outcomeId)
          : left.recordedAt.localeCompare(right.recordedAt),
      );
      const cursor = orderedOutcomes.at(-1);
      return createAutonomyEvidenceWindowV1({
        tenantId: input.tenantId,
        policyDomainId: input.policyDomainId,
        segmentNamespace: input.segmentNamespace,
        segmentKey: input.segmentKey,
        actionType: input.actionType,
        sourceId: input.sourceId,
        sourceRevision: input.sourceRevision,
        windowSequence: input.windowSequence,
        observedFrom: input.observedFrom,
        observedThrough: input.observedThrough,
        coverageStatus,
        eligibleTaskRuns: runs.length,
        concludedOutcomes,
        positive,
        negative,
        corrected,
        inconclusive,
        unresolvedTaskRuns,
        reasonCounts: Object.fromEntries(
          Object.entries(reasonCounts).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
        cursor: cursor
          ? { recordedAt: cursor.recordedAt, outcomeId: cursor.outcomeId }
          : null,
        evidenceReferenceIds: orderedOutcomes.map(
          (outcome) => outcome.outcomeId,
        ),
      });
    } catch (error) {
      if (
        error instanceof WorkflowValidationErrorV1 ||
        error instanceof AutonomyValidationErrorV1
      )
        throw error;
      return createAutonomyEvidenceWindowV1({
        tenantId: input.tenantId,
        policyDomainId: input.policyDomainId,
        segmentNamespace: input.segmentNamespace,
        segmentKey: input.segmentKey,
        actionType: input.actionType,
        sourceId: input.sourceId,
        sourceRevision: input.sourceRevision,
        windowSequence: input.windowSequence,
        observedFrom: input.observedFrom,
        observedThrough: input.observedThrough,
        coverageStatus: "unavailable",
        eligibleTaskRuns: 0,
        concludedOutcomes: 0,
        positive: 0,
        negative: 0,
        corrected: 0,
        inconclusive: 0,
        unresolvedTaskRuns: 0,
        reasonCounts: {},
        cursor: null,
        evidenceReferenceIds: [],
      });
    }
  }
}

function validateInput(input: WorkflowAutonomyEvidenceInputV1): void {
  for (const [label, value] of Object.entries({
    tenantId: input.tenantId,
    policyDomainId: input.policyDomainId,
    segmentNamespace: input.segmentNamespace,
    segmentKey: input.segmentKey,
    actionType: input.actionType,
    sourceId: input.sourceId,
    outcomeType: input.outcomeType,
  }))
    required(value, label);
  nonNegative(input.sourceRevision, "sourceRevision");
  nonNegative(input.windowSequence, "windowSequence");
  timestamp(input.observedFrom, "observedFrom");
  timestamp(input.observedThrough, "observedThrough");
  if (input.observedFrom > input.observedThrough)
    throw new AutonomyValidationErrorV1(
      "autonomy_workflow_window_time_invalid",
    );
  if (
    !Array.isArray(input.taskRunIds) ||
    input.taskRunIds.length > 4_096 ||
    new Set(input.taskRunIds).size !== input.taskRunIds.length ||
    [...input.taskRunIds]
      .sort()
      .some((taskRunId, index) => taskRunId !== input.taskRunIds[index])
  )
    throw new AutonomyValidationErrorV1(
      "autonomy_workflow_task_run_ids_invalid",
    );
  for (const taskRunId of input.taskRunIds) required(taskRunId, "taskRunId");
}

function required(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new AutonomyValidationErrorV1(`autonomy_workflow_${label}_invalid`);
}

function nonNegative(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new AutonomyValidationErrorV1(`autonomy_workflow_${label}_invalid`);
}

function timestamp(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new AutonomyValidationErrorV1(`autonomy_workflow_${label}_invalid`);
}
