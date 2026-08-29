import type { JsonObject } from "@agentplat/core";

import type {
  ProcessDefinitionV1,
  ProcessRunStatusV1,
  ProcessRunV1,
  ProcessStageStateV1,
} from "./v1-contracts.js";
import { createProcessRunSnapshotV1 } from "./v1-runtime.js";
import {
  createProcessDefinitionV1,
  validateProcessDefinitionV1,
} from "./v1-validation.js";
import { WorkflowValidationErrorV1 } from "./v1-canonical.js";

export interface LegacyProcessStageInputV1 {
  readonly id: string;
  readonly name: string;
  readonly taskId: string;
  readonly skillId?: string;
  readonly retryLimit?: number;
  readonly timeoutSec?: number;
  readonly metadata?: JsonObject;
}

export interface LegacyProcessDefinitionInputV1 {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description?: string;
  readonly stages: readonly LegacyProcessStageInputV1[];
}

export interface LegacyProcessStageStateInputV1 {
  readonly stageId: string;
  readonly taskId: string;
  readonly status: "pending" | "running" | "completed" | "failed" | "canceled";
  readonly taskRunId?: string;
  readonly retryCount?: number;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly errorMessage?: string;
}

export interface LegacyProcessRunInputV1 {
  readonly tenantId: string;
  readonly runId: string;
  readonly processId: string;
  readonly processVersion?: string;
  readonly status: "pending" | "running" | "completed" | "failed" | "canceled";
  readonly stageStates: readonly LegacyProcessStageStateInputV1[];
  readonly artifactIds?: readonly string[];
  readonly childTaskRunIds?: readonly string[];
  readonly input?: JsonObject;
  readonly result?: JsonObject;
  readonly errorMessage?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export function upgradeLegacyProcessDefinitionV1(
  legacy: LegacyProcessDefinitionInputV1,
  options: {
    readonly taskDefinitionVersion?: (
      stage: LegacyProcessStageInputV1,
    ) => string;
  } = {},
): ProcessDefinitionV1 {
  if (!Array.isArray(legacy.stages) || legacy.stages.length < 1)
    fail("legacy_process_stages_invalid");
  return createProcessDefinitionV1({
    processId: legacy.id,
    version: legacy.version,
    name: legacy.name,
    stages: legacy.stages.map((stage, index) => ({
      schemaVersion: 1,
      stageId: stage.id,
      name: stage.name,
      kind: "task",
      taskDefinitionId: stage.taskId,
      taskDefinitionVersion: options.taskDefinitionVersion?.(stage) ?? "legacy",
      dependsOn:
        index === 0
          ? []
          : [
              {
                stageId: legacy.stages[index - 1]!.id,
                outcomes: ["succeeded"],
              },
            ],
      ...(stage.retryLimit !== undefined
        ? { retryPolicy: { maximumAttempts: stage.retryLimit + 1 } }
        : {}),
      ...(stage.timeoutSec !== undefined
        ? { timeoutMs: secondsToMilliseconds(stage.timeoutSec) }
        : {}),
      ...(stage.metadata ? { metadata: stage.metadata } : {}),
    })),
  });
}

export function upgradeLegacyProcessRunV1(
  legacy: LegacyProcessRunInputV1,
  definitionInput: ProcessDefinitionV1,
  options: { readonly logicalTime: string },
): ProcessRunV1 {
  const definition = validateProcessDefinitionV1(definitionInput);
  if (
    legacy.processId !== definition.processId ||
    (legacy.processVersion !== undefined &&
      legacy.processVersion !== definition.version)
  )
    fail("legacy_run_definition_binding_mismatch");
  if (legacy.stageStates.length !== definition.stages.length)
    fail("legacy_run_stage_count_ambiguous");
  if (legacy.artifactIds?.length || legacy.errorMessage)
    fail("legacy_run_contains_unrepresentable_state");
  const childTaskRunIds = new Set(legacy.childTaskRunIds ?? []);
  const representedTaskRunIds = new Set(
    legacy.stageStates
      .map((state) => state.taskRunId)
      .filter((value): value is string => Boolean(value)),
  );
  if (
    [...childTaskRunIds].some(
      (taskRunId) => !representedTaskRunIds.has(taskRunId),
    )
  )
    fail("legacy_run_contains_unrepresentable_task_reference");
  let terminalFailureSeen = false;
  let activeCount = 0;
  const stageStates: ProcessStageStateV1[] = legacy.stageStates.map(
    (state, index) => {
      const stage = definition.stages[index]!;
      if (
        stage.kind !== "task" ||
        state.stageId !== stage.stageId ||
        state.taskId !== stage.taskDefinitionId
      )
        fail("legacy_run_stage_binding_ambiguous");
      if (terminalFailureSeen && state.status !== "pending")
        fail("legacy_run_progression_ambiguous");
      if (state.status === "failed" || state.status === "canceled")
        terminalFailureSeen = true;
      if (state.status === "running") activeCount += 1;
      const attempt =
        state.status === "pending" ? 0 : (state.retryCount ?? 0) + 1;
      const common = {
        stageId: state.stageId,
        attempt,
        ...(state.taskRunId ? { taskRunId: state.taskRunId } : {}),
        ...(state.startedAt ? { startedAt: state.startedAt } : {}),
        ...(state.finishedAt ? { finishedAt: state.finishedAt } : {}),
        ...(state.errorMessage ? { reasonCode: state.errorMessage } : {}),
      };
      if (state.status === "completed")
        return { ...common, status: "terminal", outcome: "succeeded" };
      if (state.status === "failed")
        return { ...common, status: "terminal", outcome: "failed" };
      if (state.status === "canceled")
        return { ...common, status: "terminal", outcome: "canceled" };
      if (state.status === "running") return { ...common, status: "running" };
      const predecessorsComplete = legacy.stageStates
        .slice(0, index)
        .every((candidate) => candidate.status === "completed");
      return {
        ...common,
        status:
          predecessorsComplete && !terminalFailureSeen ? "ready" : "blocked",
      };
    },
  );
  if (activeCount > 1) fail("legacy_run_has_multiple_active_stages");
  assertLegacyRunStatus(legacy, stageStates);
  timestamp(options.logicalTime, "logicalTime");
  const createdAt = legacy.createdAt ?? legacy.startedAt ?? options.logicalTime;
  const updatedAt =
    legacy.updatedAt ??
    legacy.finishedAt ??
    legacy.startedAt ??
    options.logicalTime;
  timestamp(createdAt, "createdAt");
  timestamp(updatedAt, "updatedAt");
  return createProcessRunSnapshotV1({
    schemaVersion: 1,
    tenantId: legacy.tenantId,
    runId: legacy.runId,
    processId: legacy.processId,
    processVersion: definition.version,
    definitionDigest: definition.definitionDigest,
    revision: 0,
    status: legacy.status as ProcessRunStatusV1,
    stageStates,
    ...(legacy.input ? { input: legacy.input } : {}),
    ...(legacy.result ? { result: legacy.result } : {}),
    createdAt,
    updatedAt,
  });
}

function assertLegacyRunStatus(
  run: LegacyProcessRunInputV1,
  states: readonly ProcessStageStateV1[],
): void {
  if (
    (run.status === "completed" &&
      !states.every(
        (state) => state.status === "terminal" && state.outcome === "succeeded",
      )) ||
    (run.status === "failed" &&
      !states.some((state) => state.outcome === "failed")) ||
    (run.status === "canceled" &&
      !states.some((state) => state.outcome === "canceled")) ||
    (run.status === "pending" &&
      states.some((state) => state.status === "running")) ||
    (run.status === "running" &&
      !states.some(
        (state) => state.status === "running" || state.status === "ready",
      ))
  )
    fail("legacy_run_status_ambiguous");
}

function secondsToMilliseconds(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    fail("legacy_stage_timeout_invalid");
  const milliseconds = value * 1_000;
  if (!Number.isSafeInteger(milliseconds))
    fail("legacy_stage_timeout_overflow");
  return milliseconds;
}

function timestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) fail(`legacy_${label}_invalid`);
}

function fail(message: string): never {
  throw new WorkflowValidationErrorV1(message);
}
