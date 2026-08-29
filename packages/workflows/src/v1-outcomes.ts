import type { JsonValue } from "@agentplat/core";

import {
  canonicalizeWorkflowJsonV1,
  cloneWorkflowV1,
  deepFreezeWorkflowV1,
  digestWorkflowJsonV1,
  WorkflowValidationErrorV1,
} from "./v1-canonical.js";
import type {
  SubjectReferenceV1,
  TaskRunV1,
  WorkflowDigestV1,
  WorkflowStoreV1,
} from "./v1-contracts.js";
import { validateTaskRunV1 } from "./v1-task-runs.js";

export type TaskOutcomeVerdictV1 =
  "positive" | "negative" | "corrected" | "inconclusive";

export interface TaskOutcomeV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly outcomeId: string;
  readonly taskRunId: string;
  readonly taskExecutionBindingDigest: WorkflowDigestV1;
  readonly outcomeType: string;
  readonly verdict: TaskOutcomeVerdictV1;
  readonly reasonCode?: string;
  readonly severity?: "ordinary" | "critical";
  readonly scoreBasisPoints?: number;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly observedAt: string;
  readonly recordedAt: string;
  readonly evidenceReferenceIds: readonly string[];
  readonly outcomeDigest: WorkflowDigestV1;
}

export type TaskOutcomeInputV1 = Omit<
  TaskOutcomeV1,
  "schemaVersion" | "outcomeDigest"
>;

export interface TaskOutcomeStoreV1 {
  appendOutcome(outcome: TaskOutcomeV1): Promise<"created" | "replayed">;
  getOutcome(
    tenantId: string,
    outcomeId: string,
  ): Promise<TaskOutcomeV1 | undefined>;
  listOutcomes(input: {
    readonly tenantId: string;
    readonly taskRunId?: string;
    readonly outcomeType?: string;
    readonly recordedFrom?: string;
    readonly recordedThrough?: string;
  }): Promise<TaskOutcomeV1[]>;
}

export class InMemoryTaskOutcomeStoreV1 implements TaskOutcomeStoreV1 {
  readonly #outcomes = new Map<string, TaskOutcomeV1>();

  async appendOutcome(
    outcomeInput: TaskOutcomeV1,
  ): Promise<"created" | "replayed"> {
    const outcome = validateTaskOutcomeV1(outcomeInput);
    const key = `${outcome.tenantId}\0${outcome.outcomeId}`;
    const current = this.#outcomes.get(key);
    if (current) {
      if (current.outcomeDigest !== outcome.outcomeDigest)
        fail("outcome identity was reused with different bytes");
      return "replayed";
    }
    this.#outcomes.set(key, deepFreezeWorkflowV1(cloneWorkflowV1(outcome)));
    return "created";
  }

  async getOutcome(
    tenantId: string,
    outcomeId: string,
  ): Promise<TaskOutcomeV1 | undefined> {
    token(tenantId, "tenantId");
    token(outcomeId, "outcomeId");
    const value = this.#outcomes.get(`${tenantId}\0${outcomeId}`);
    return value ? cloneWorkflowV1(value) : undefined;
  }

  async listOutcomes(input: {
    readonly tenantId: string;
    readonly taskRunId?: string;
    readonly outcomeType?: string;
    readonly recordedFrom?: string;
    readonly recordedThrough?: string;
  }): Promise<TaskOutcomeV1[]> {
    token(input.tenantId, "tenantId");
    if (input.taskRunId) token(input.taskRunId, "taskRunId");
    if (input.outcomeType) token(input.outcomeType, "outcomeType");
    if (input.recordedFrom) timestamp(input.recordedFrom, "recordedFrom");
    if (input.recordedThrough)
      timestamp(input.recordedThrough, "recordedThrough");
    if (
      input.recordedFrom &&
      input.recordedThrough &&
      input.recordedFrom > input.recordedThrough
    )
      fail("outcome recorded range is invalid");
    return [...this.#outcomes.values()]
      .filter(
        (outcome) =>
          outcome.tenantId === input.tenantId &&
          (!input.taskRunId || outcome.taskRunId === input.taskRunId) &&
          (!input.outcomeType || outcome.outcomeType === input.outcomeType) &&
          (!input.recordedFrom || outcome.recordedAt >= input.recordedFrom) &&
          (!input.recordedThrough ||
            outcome.recordedAt <= input.recordedThrough),
      )
      .sort((left, right) =>
        left.recordedAt === right.recordedAt
          ? left.outcomeId.localeCompare(right.outcomeId)
          : left.recordedAt.localeCompare(right.recordedAt),
      )
      .map((outcome) => cloneWorkflowV1(outcome));
  }
}

export type TaskOutcomeGroupByV1 =
  "execution_binding" | "prompt_revision" | "model_revision" | "subject_type";

export interface TaskOutcomeSummaryGroupV1 {
  readonly key: string | null;
  readonly total: number;
  readonly positive: number;
  readonly negative: number;
  readonly corrected: number;
  readonly inconclusive: number;
  readonly scored: number;
  readonly scoreBasisPointsSum: number;
}

export interface OutcomeCoveragePolicyV1 {
  readonly outcomeType: string;
  readonly windowMs: number;
  readonly minimumConcludedOutcomes: number;
  readonly maximumObservationLagMs: number;
  readonly maximumUnresolvedBasisPoints: number;
}

export interface OutcomeCoverageResultV1 {
  readonly status: "healthy" | "insufficient" | "stale" | "unavailable";
  readonly eligibleTaskRuns: number;
  readonly concludedOutcomes: number;
  readonly unresolvedTaskRuns: number;
  readonly unresolvedBasisPoints: number;
  readonly latestObservedAt: string | null;
  readonly reasonCode: string;
}

export class WorkflowOutcomeRuntimeV1 {
  constructor(
    readonly taskRuns: Pick<WorkflowStoreV1, "getTaskRun" | "listTaskRuns">,
    readonly outcomes: TaskOutcomeStoreV1 = new InMemoryTaskOutcomeStoreV1(),
  ) {}

  async record(input: TaskOutcomeInputV1): Promise<{
    readonly disposition: "created" | "replayed";
    readonly outcome: TaskOutcomeV1;
  }> {
    const outcome = createTaskOutcomeV1(input);
    const taskRun = await this.taskRuns.getTaskRun(
      outcome.tenantId,
      outcome.taskRunId,
    );
    if (!taskRun) fail("outcome task run was not found");
    const validatedRun = validateTaskRunV1(taskRun);
    if (
      !["completed", "failed", "canceled", "indeterminate"].includes(
        validatedRun.status,
      )
    )
      fail("outcome task run is not terminal");
    if (
      outcome.taskExecutionBindingDigest !== validatedRun.binding.bindingDigest
    )
      fail("outcome task execution binding does not match");
    const lowerBound = validatedRun.startedAt ?? validatedRun.createdAt;
    if (Date.parse(outcome.observedAt) < Date.parse(lowerBound))
      fail("outcome observation predates task execution");
    const disposition = await this.outcomes.appendOutcome(outcome);
    return deepFreezeWorkflowV1({ disposition, outcome });
  }

  async summarize(input: {
    readonly tenantId: string;
    readonly groupBy: TaskOutcomeGroupByV1;
    readonly outcomeType?: string;
    readonly recordedFrom?: string;
    readonly recordedThrough?: string;
  }): Promise<readonly TaskOutcomeSummaryGroupV1[]> {
    token(input.tenantId, "tenantId");
    if (
      ![
        "execution_binding",
        "prompt_revision",
        "model_revision",
        "subject_type",
      ].includes(input.groupBy)
    )
      fail("outcome groupBy is invalid");
    if (input.outcomeType) token(input.outcomeType, "outcomeType");
    if (input.recordedFrom) timestamp(input.recordedFrom, "recordedFrom");
    if (input.recordedThrough)
      timestamp(input.recordedThrough, "recordedThrough");
    if (
      input.recordedFrom &&
      input.recordedThrough &&
      input.recordedFrom > input.recordedThrough
    )
      fail("outcome summary range is invalid");
    const outcomes = (
      await this.outcomes.listOutcomes({
        tenantId: input.tenantId,
        ...(input.outcomeType ? { outcomeType: input.outcomeType } : {}),
        ...(input.recordedFrom ? { recordedFrom: input.recordedFrom } : {}),
        ...(input.recordedThrough
          ? { recordedThrough: input.recordedThrough }
          : {}),
      })
    ).map(validateTaskOutcomeV1);
    const groups = new Map<string, MutableSummary>();
    for (const outcome of outcomes) {
      const taskRun = await this.taskRuns.getTaskRun(
        outcome.tenantId,
        outcome.taskRunId,
      );
      if (!taskRun) fail("outcome references a missing task run");
      const run = validateTaskRunV1(taskRun);
      const key = summaryKey(input.groupBy, run);
      const mapKey = key ?? "\0null";
      const group =
        groups.get(mapKey) ??
        ({
          key,
          total: 0,
          positive: 0,
          negative: 0,
          corrected: 0,
          inconclusive: 0,
          scored: 0,
          scoreBasisPointsSum: 0,
        } satisfies MutableSummary);
      group.total = checkedAdd(group.total, 1, "outcome total overflow");
      group[outcome.verdict] = checkedAdd(
        group[outcome.verdict],
        1,
        "outcome verdict overflow",
      );
      if (outcome.scoreBasisPoints !== undefined) {
        group.scored = checkedAdd(
          group.scored,
          1,
          "outcome score count overflow",
        );
        group.scoreBasisPointsSum = checkedAdd(
          group.scoreBasisPointsSum,
          outcome.scoreBasisPoints,
          "outcome score sum overflow",
        );
      }
      groups.set(mapKey, group);
    }
    return deepFreezeWorkflowV1(
      [...groups.values()]
        .sort((left, right) => (left.key ?? "").localeCompare(right.key ?? ""))
        .map((group) => ({ ...group })),
    );
  }

  async coverage(input: {
    readonly tenantId: string;
    readonly logicalTime: string;
    readonly policy: OutcomeCoveragePolicyV1;
    readonly bindingDigest?: WorkflowDigestV1;
    readonly subject?: SubjectReferenceV1;
  }): Promise<OutcomeCoverageResultV1> {
    try {
      token(input.tenantId, "tenantId");
      timestamp(input.logicalTime, "logicalTime");
      validateOutcomeCoveragePolicyV1(input.policy);
      if (input.bindingDigest) digest(input.bindingDigest, "bindingDigest");
      if (input.subject) validateSubject(input.subject);
      const windowStart = new Date(
        Date.parse(input.logicalTime) - input.policy.windowMs,
      ).toISOString();
      const taskRuns = (
        await this.taskRuns.listTaskRuns({
          tenantId: input.tenantId,
          status: "completed",
          ...(input.subject ? { subject: input.subject } : {}),
        })
      )
        .map(validateTaskRunV1)
        .filter(
          (run) =>
            (run.finishedAt ?? run.updatedAt) >= windowStart &&
            (!input.bindingDigest ||
              run.binding.bindingDigest === input.bindingDigest),
        );
      const outcomes = (
        await this.outcomes.listOutcomes({
          tenantId: input.tenantId,
          outcomeType: input.policy.outcomeType,
          recordedFrom: windowStart,
          recordedThrough: input.logicalTime,
        })
      ).map(validateTaskOutcomeV1);
      const eligibleIds = new Set(taskRuns.map((run) => run.taskRunId));
      const concludedByTask = new Set(
        outcomes
          .filter(
            (outcome) =>
              eligibleIds.has(outcome.taskRunId) &&
              outcome.verdict !== "inconclusive",
          )
          .map((outcome) => outcome.taskRunId),
      );
      const unresolvedRuns = taskRuns.filter(
        (run) => !concludedByTask.has(run.taskRunId),
      );
      const unresolvedBasisPoints = taskRuns.length
        ? Math.ceil((unresolvedRuns.length * 10_000) / taskRuns.length)
        : 10_000;
      const latestObservedAt =
        outcomes
          .filter((outcome) => eligibleIds.has(outcome.taskRunId))
          .map((outcome) => outcome.observedAt)
          .sort()
          .at(-1) ?? null;
      const overdueCutoff =
        Date.parse(input.logicalTime) - input.policy.maximumObservationLagMs;
      const stale = unresolvedRuns.some(
        (run) => Date.parse(run.finishedAt ?? run.updatedAt) <= overdueCutoff,
      );
      if (stale)
        return coverageResult(
          "stale",
          taskRuns.length,
          concludedByTask.size,
          unresolvedRuns.length,
          unresolvedBasisPoints,
          latestObservedAt,
          "outcome_signal_stale",
        );
      if (
        concludedByTask.size < input.policy.minimumConcludedOutcomes ||
        unresolvedBasisPoints > input.policy.maximumUnresolvedBasisPoints
      )
        return coverageResult(
          "insufficient",
          taskRuns.length,
          concludedByTask.size,
          unresolvedRuns.length,
          unresolvedBasisPoints,
          latestObservedAt,
          "outcome_evidence_insufficient",
        );
      return coverageResult(
        "healthy",
        taskRuns.length,
        concludedByTask.size,
        unresolvedRuns.length,
        unresolvedBasisPoints,
        latestObservedAt,
        "outcome_coverage_healthy",
      );
    } catch (error) {
      if (error instanceof WorkflowValidationErrorV1) throw error;
      return coverageResult(
        "unavailable",
        0,
        0,
        0,
        10_000,
        null,
        "outcome_store_unavailable",
      );
    }
  }
}

export function createTaskOutcomeV1(input: TaskOutcomeInputV1): TaskOutcomeV1 {
  validateOutcomeInput(input);
  const body = { schemaVersion: 1 as const, ...input };
  return deepFreezeWorkflowV1({
    ...cloneWorkflowV1(body),
    outcomeDigest: digestWorkflowJsonV1("task-outcome", json(body)),
  });
}

export function validateTaskOutcomeV1(input: TaskOutcomeV1): TaskOutcomeV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "tenantId",
      "outcomeId",
      "taskRunId",
      "taskExecutionBindingDigest",
      "outcomeType",
      "verdict",
      ...(input.reasonCode !== undefined ? ["reasonCode"] : []),
      ...(input.severity !== undefined ? ["severity"] : []),
      ...(input.scoreBasisPoints !== undefined ? ["scoreBasisPoints"] : []),
      "sourceType",
      "sourceId",
      "observedAt",
      "recordedAt",
      "evidenceReferenceIds",
      "outcomeDigest",
    ],
    "task outcome",
  );
  if (input.schemaVersion !== 1) fail("task outcome schema is invalid");
  const { outcomeDigest, schemaVersion: _schemaVersion, ...body } = input;
  validateOutcomeInput(body);
  digest(outcomeDigest, "outcomeDigest");
  if (
    outcomeDigest !==
    digestWorkflowJsonV1("task-outcome", json({ schemaVersion: 1, ...body }))
  )
    fail("task outcome digest does not match");
  return deepFreezeWorkflowV1(cloneWorkflowV1(input));
}

export function validateOutcomeCoveragePolicyV1(
  input: OutcomeCoveragePolicyV1,
): OutcomeCoveragePolicyV1 {
  exactKeys(
    input,
    [
      "outcomeType",
      "windowMs",
      "minimumConcludedOutcomes",
      "maximumObservationLagMs",
      "maximumUnresolvedBasisPoints",
    ],
    "outcome coverage policy",
  );
  token(input.outcomeType, "outcomeType");
  duration(input.windowMs, "windowMs");
  nonNegative(input.minimumConcludedOutcomes, "minimumConcludedOutcomes");
  duration(input.maximumObservationLagMs, "maximumObservationLagMs");
  basisPoints(
    input.maximumUnresolvedBasisPoints,
    "maximumUnresolvedBasisPoints",
  );
  return deepFreezeWorkflowV1(cloneWorkflowV1(input));
}

function validateOutcomeInput(input: TaskOutcomeInputV1): void {
  exactKeys(
    input,
    [
      "tenantId",
      "outcomeId",
      "taskRunId",
      "taskExecutionBindingDigest",
      "outcomeType",
      "verdict",
      ...(input.reasonCode !== undefined ? ["reasonCode"] : []),
      ...(input.severity !== undefined ? ["severity"] : []),
      ...(input.scoreBasisPoints !== undefined ? ["scoreBasisPoints"] : []),
      "sourceType",
      "sourceId",
      "observedAt",
      "recordedAt",
      "evidenceReferenceIds",
    ],
    "task outcome input",
  );
  token(input.tenantId, "tenantId");
  token(input.outcomeId, "outcomeId");
  token(input.taskRunId, "taskRunId");
  digest(input.taskExecutionBindingDigest, "taskExecutionBindingDigest");
  token(input.outcomeType, "outcomeType");
  if (
    !["positive", "negative", "corrected", "inconclusive"].includes(
      input.verdict,
    )
  )
    fail("task outcome verdict is invalid");
  if (input.reasonCode !== undefined) token(input.reasonCode, "reasonCode");
  if (
    input.severity !== undefined &&
    !["ordinary", "critical"].includes(input.severity)
  )
    fail("task outcome severity is invalid");
  if (input.scoreBasisPoints !== undefined)
    basisPoints(input.scoreBasisPoints, "scoreBasisPoints");
  token(input.sourceType, "sourceType");
  token(input.sourceId, "sourceId");
  timestamp(input.observedAt, "observedAt");
  timestamp(input.recordedAt, "recordedAt");
  if (Date.parse(input.recordedAt) < Date.parse(input.observedAt))
    fail("task outcome was recorded before it was observed");
  if (
    !Array.isArray(input.evidenceReferenceIds) ||
    input.evidenceReferenceIds.length > 64 ||
    new Set(input.evidenceReferenceIds).size !==
      input.evidenceReferenceIds.length
  )
    fail("task outcome evidence references are invalid");
  for (const reference of input.evidenceReferenceIds)
    token(reference, "evidenceReferenceId");
}

function summaryKey(
  groupBy: TaskOutcomeGroupByV1,
  run: TaskRunV1,
): string | null {
  if (groupBy === "execution_binding") return run.binding.bindingDigest;
  if (groupBy === "prompt_revision") return run.binding.promptRevision ?? null;
  if (groupBy === "model_revision") return run.binding.modelRevision ?? null;
  return run.subject?.subjectType ?? null;
}

function coverageResult(
  status: OutcomeCoverageResultV1["status"],
  eligibleTaskRuns: number,
  concludedOutcomes: number,
  unresolvedTaskRuns: number,
  unresolvedBasisPoints: number,
  latestObservedAt: string | null,
  reasonCode: string,
): OutcomeCoverageResultV1 {
  return deepFreezeWorkflowV1({
    status,
    eligibleTaskRuns,
    concludedOutcomes,
    unresolvedTaskRuns,
    unresolvedBasisPoints,
    latestObservedAt,
    reasonCode,
  });
}

function validateSubject(subject: SubjectReferenceV1): void {
  exactKeys(subject, ["subjectType", "subjectId"], "subject reference");
  token(subject.subjectType, "subjectType");
  token(subject.subjectId, "subjectId");
}

function checkedAdd(left: number, right: number, message: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail(message);
  return result;
}

function exactKeys(
  value: object,
  expected: readonly string[],
  label: string,
): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getOwnPropertySymbols(value).length > 0
  )
    fail(`${label} is invalid`);
  const actual = Object.getOwnPropertyNames(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length ||
    actual.some((key, index) => key !== keys[index])
  )
    fail(`${label} has an unexpected shape`);
}

function json(value: unknown): JsonValue {
  canonicalizeWorkflowJsonV1(value as JsonValue);
  return value as JsonValue;
}

function token(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(`${label} is invalid`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is WorkflowDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
}

function positive(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail(`${label} must be a positive safe integer`);
}

function duration(value: unknown, label: string): void {
  positive(value, label);
  if ((value as number) > 10 * 366 * 24 * 60 * 60 * 1_000)
    fail(`${label} exceeds the V1 duration ceiling`);
}

function nonNegative(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} must be a non-negative safe integer`);
}

function basisPoints(value: unknown, label: string): void {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 10_000
  )
    fail(`${label} must be between 0 and 10000`);
}

function timestamp(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail(`${label} is invalid`);
}

function fail(message: string): never {
  throw new WorkflowValidationErrorV1(message);
}

interface MutableSummary {
  key: string | null;
  total: number;
  positive: number;
  negative: number;
  corrected: number;
  inconclusive: number;
  scored: number;
  scoreBasisPointsSum: number;
}
