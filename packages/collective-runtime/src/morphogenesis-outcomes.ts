import {
  digestWorkflowJsonV1,
  type WorkflowStoreV1,
} from "@agentplat/workflows";
import {
  WorkflowOutcomeRuntimeV1,
  validateTaskOutcomeV1,
  type OutcomeCoveragePolicyV1,
  type TaskOutcomeStoreV1,
} from "@agentplat/workflows/outcomes";

import type {
  MorphogenesisEvaluationPortV1,
  MorphogenesisProcessBindingV1,
} from "./morphogenesis-workflow.js";

export class MorphogenesisWorkflowOutcomeEvaluationPortV1
  implements MorphogenesisEvaluationPortV1
{
  readonly #runtime: WorkflowOutcomeRuntimeV1;

  constructor(
    readonly options: {
      readonly taskRuns: Pick<
        WorkflowStoreV1,
        "getTaskRun" | "listTaskRuns"
      >;
      readonly outcomes: TaskOutcomeStoreV1;
      readonly coveragePolicy: OutcomeCoveragePolicyV1;
      readonly outcomeType: string;
      readonly sourceStageId?: string;
      readonly logicalTime: (logicalTimeMs: number) => string;
    },
  ) {
    this.#runtime = new WorkflowOutcomeRuntimeV1(
      options.taskRuns,
      options.outcomes,
    );
  }

  async evaluate(input: {
    readonly binding: MorphogenesisProcessBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly disposition:
      | "success"
      | "partial_success"
      | "failure"
      | "indeterminate"
      | "successor_recovery_required";
    readonly outcomeEvidenceDigests: readonly `sha256:${string}`[];
  }> {
    const logicalTime = this.options.logicalTime(input.logicalTimeMs);
    const sourceStageId = this.options.sourceStageId ?? "activate";
    const runs = await this.options.taskRuns.listTaskRuns({
      tenantId: input.binding.tenantId,
      processRunId: input.binding.runId,
    });
    const source = runs.find(
      (run) => run.stageId === sourceStageId && run.status === "completed",
    );
    if (!source)
      return this.unresolved(input.binding, "source_task_run_unavailable");
    const coverage = await this.#runtime.coverage({
      tenantId: input.binding.tenantId,
      logicalTime,
      policy: this.options.coveragePolicy,
      bindingDigest: source.binding.bindingDigest,
    });
    const outcomes = (
      await this.options.outcomes.listOutcomes({
        tenantId: input.binding.tenantId,
        taskRunId: source.taskRunId,
        outcomeType: this.options.outcomeType,
      })
    ).map(validateTaskOutcomeV1);
    const coverageDigest = digestWorkflowJsonV1(
      "morphogenesis-outcome-coverage",
      coverage as never,
    );
    if (coverage.status !== "healthy" || outcomes.length === 0)
      return {
        disposition: "indeterminate",
        outcomeEvidenceDigests: [coverageDigest],
      };
    if (
      outcomes.some(
        ({ verdict, severity }) =>
          verdict === "negative" && severity === "critical",
      )
    )
      return {
        disposition: "successor_recovery_required",
        outcomeEvidenceDigests: evidence(outcomes, coverageDigest),
      };
    if (outcomes.some(({ verdict }) => verdict === "negative"))
      return {
        disposition: "failure",
        outcomeEvidenceDigests: evidence(outcomes, coverageDigest),
      };
    if (
      outcomes.some(({ verdict }) =>
        ["corrected", "inconclusive"].includes(verdict),
      )
    )
      return {
        disposition: "partial_success",
        outcomeEvidenceDigests: evidence(outcomes, coverageDigest),
      };
    return {
      disposition: "success",
      outcomeEvidenceDigests: evidence(outcomes, coverageDigest),
    };
  }

  unresolved(
    binding: MorphogenesisProcessBindingV1,
    reasonCode: string,
  ) {
    return {
      disposition: "indeterminate" as const,
      outcomeEvidenceDigests: [
        digestWorkflowJsonV1("morphogenesis-outcome-unresolved", {
          schemaVersion: 1,
          processBindingDigest: binding.bindingDigest,
          reasonCode,
        }),
      ],
    };
  }
}

function evidence(
  outcomes: readonly ReturnType<typeof validateTaskOutcomeV1>[],
  coverageDigest: `sha256:${string}`,
): readonly `sha256:${string}`[] {
  return Object.freeze(
    [...new Set([coverageDigest, ...outcomes.map(({ outcomeDigest }) => outcomeDigest)])].sort(),
  );
}
