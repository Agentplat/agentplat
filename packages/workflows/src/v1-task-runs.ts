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
  TaskDefinitionV1,
  TaskExecutionBindingInputV1,
  TaskExecutionBindingV1,
  TaskRunStatusV1,
  TaskRunV1,
  TaskUsageAggregateV1,
  TaskUsageV1,
  WorkflowDigestV1,
} from "./v1-contracts.js";
import { validateTaskDefinitionV1 } from "./v1-validation.js";

const terminalStatuses = new Set<TaskRunStatusV1>([
  "completed",
  "failed",
  "canceled",
  "indeterminate",
]);

export function createTaskExecutionBindingV1(
  taskDefinition: TaskDefinitionV1,
  input: TaskExecutionBindingInputV1 = {},
): TaskExecutionBindingV1 {
  const definition = validateTaskDefinitionV1(taskDefinition);
  exactKeys(
    input,
    [
      ...(input.promptRevision !== undefined ? ["promptRevision"] : []),
      ...(input.promptDigest !== undefined ? ["promptDigest"] : []),
      ...(input.modelProvider !== undefined ? ["modelProvider"] : []),
      ...(input.modelName !== undefined ? ["modelName"] : []),
      ...(input.modelRevision !== undefined ? ["modelRevision"] : []),
      ...(input.modelConfigurationDigest !== undefined
        ? ["modelConfigurationDigest"]
        : []),
      ...(input.policyDigest !== undefined ? ["policyDigest"] : []),
      ...(input.toolsetDigest !== undefined ? ["toolsetDigest"] : []),
      ...(input.runtimeImplementationDigest !== undefined
        ? ["runtimeImplementationDigest"]
        : []),
    ],
    "task execution binding input",
  );
  validateBindingInput(input);
  const body = {
    taskDefinitionId: definition.taskDefinitionId,
    taskDefinitionVersion: definition.version,
    handlerDigest: definition.handlerDigest,
    ...input,
  };
  return deepFreezeWorkflowV1({
    ...cloneWorkflowV1(body),
    bindingDigest: digestWorkflowJsonV1("task-execution-binding", json(body)),
  });
}

export function validateTaskExecutionBindingV1(
  binding: TaskExecutionBindingV1,
): TaskExecutionBindingV1 {
  exactKeys(
    binding,
    [
      "taskDefinitionId",
      "taskDefinitionVersion",
      "handlerDigest",
      ...(binding.promptRevision !== undefined ? ["promptRevision"] : []),
      ...(binding.promptDigest !== undefined ? ["promptDigest"] : []),
      ...(binding.modelProvider !== undefined ? ["modelProvider"] : []),
      ...(binding.modelName !== undefined ? ["modelName"] : []),
      ...(binding.modelRevision !== undefined ? ["modelRevision"] : []),
      ...(binding.modelConfigurationDigest !== undefined
        ? ["modelConfigurationDigest"]
        : []),
      ...(binding.policyDigest !== undefined ? ["policyDigest"] : []),
      ...(binding.toolsetDigest !== undefined ? ["toolsetDigest"] : []),
      ...(binding.runtimeImplementationDigest !== undefined
        ? ["runtimeImplementationDigest"]
        : []),
      "bindingDigest",
    ],
    "task execution binding",
  );
  token(binding.taskDefinitionId, "taskDefinitionId");
  token(binding.taskDefinitionVersion, "taskDefinitionVersion");
  digest(binding.handlerDigest, "handlerDigest");
  const {
    taskDefinitionId,
    taskDefinitionVersion,
    handlerDigest,
    bindingDigest,
    ...input
  } = binding;
  validateBindingInput(input);
  digest(bindingDigest, "bindingDigest");
  const body = {
    taskDefinitionId,
    taskDefinitionVersion,
    handlerDigest,
    ...input,
  };
  if (
    bindingDigest !== digestWorkflowJsonV1("task-execution-binding", json(body))
  )
    fail("task execution binding digest does not match");
  return deepFreezeWorkflowV1(cloneWorkflowV1(binding));
}

export interface CreateTaskRunInputV1 {
  readonly tenantId: string;
  readonly taskRunId: string;
  readonly processRunId: string;
  readonly stageId: string;
  readonly attempt: number;
  readonly idempotencyKey: string;
  readonly inputDigest: WorkflowDigestV1;
  readonly binding: TaskExecutionBindingV1;
  readonly subject?: SubjectReferenceV1;
  readonly leaseOwnerId: string;
  readonly leaseToken: string;
  readonly leaseGeneration: number;
  readonly leaseExpiresAt: string;
  readonly logicalTime: string;
}

export function createTaskRunV1(input: CreateTaskRunInputV1): TaskRunV1 {
  exactKeys(
    input,
    [
      "tenantId",
      "taskRunId",
      "processRunId",
      "stageId",
      "attempt",
      "idempotencyKey",
      "inputDigest",
      "binding",
      ...(input.subject ? ["subject"] : []),
      "leaseOwnerId",
      "leaseToken",
      "leaseGeneration",
      "leaseExpiresAt",
      "logicalTime",
    ],
    "task run input",
  );
  token(input.tenantId, "tenantId");
  token(input.taskRunId, "taskRunId");
  token(input.processRunId, "processRunId");
  token(input.stageId, "stageId");
  positive(input.attempt, "attempt");
  token(input.idempotencyKey, "idempotencyKey");
  digest(input.inputDigest, "inputDigest");
  validateTaskExecutionBindingV1(input.binding);
  if (input.subject) validateSubject(input.subject);
  token(input.leaseOwnerId, "leaseOwnerId");
  token(input.leaseToken, "leaseToken");
  nonNegative(input.leaseGeneration, "leaseGeneration");
  timestamp(input.leaseExpiresAt, "leaseExpiresAt");
  if (Date.parse(input.leaseExpiresAt) <= Date.parse(input.logicalTime))
    fail("task lease must expire after logicalTime");
  timestamp(input.logicalTime, "logicalTime");
  const body: Omit<TaskRunV1, "stateDigest"> = {
    schemaVersion: 1,
    tenantId: input.tenantId,
    taskRunId: input.taskRunId,
    processRunId: input.processRunId,
    stageId: input.stageId,
    attempt: input.attempt,
    revision: 0,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    status: "claimed",
    binding: cloneWorkflowV1(input.binding),
    ...(input.subject ? { subject: cloneWorkflowV1(input.subject) } : {}),
    leaseOwnerId: input.leaseOwnerId,
    leaseToken: input.leaseToken,
    leaseGeneration: input.leaseGeneration,
    leaseExpiresAt: input.leaseExpiresAt,
    createdAt: input.logicalTime,
    updatedAt: input.logicalTime,
  };
  return freezeTaskRun(body);
}

export interface TransitionTaskRunInputV1 {
  readonly status: TaskRunStatusV1;
  readonly logicalTime: string;
  readonly reasonCode?: string;
  readonly retryable?: boolean;
  readonly usage?: TaskUsageV1;
  readonly resultReference?: string;
  readonly resultDigest?: WorkflowDigestV1;
}

export function transitionTaskRunV1(
  currentInput: TaskRunV1,
  input: TransitionTaskRunInputV1,
): TaskRunV1 {
  const current = validateTaskRunV1(currentInput);
  exactKeys(
    input,
    [
      "status",
      "logicalTime",
      ...(input.reasonCode !== undefined ? ["reasonCode"] : []),
      ...(input.retryable !== undefined ? ["retryable"] : []),
      ...(input.usage !== undefined ? ["usage"] : []),
      ...(input.resultReference !== undefined ? ["resultReference"] : []),
      ...(input.resultDigest !== undefined ? ["resultDigest"] : []),
    ],
    "task run transition",
  );
  if (terminalStatuses.has(current.status)) {
    const same =
      current.status === input.status &&
      current.reasonCode === input.reasonCode &&
      current.retryable === input.retryable &&
      canonicalOptional(current.usage as unknown as JsonValue | undefined) ===
        canonicalOptional(input.usage as unknown as JsonValue | undefined) &&
      current.resultReference === input.resultReference &&
      current.resultDigest === input.resultDigest;
    if (same) return current;
    fail("terminal task run is immutable");
  }
  if (
    (current.status === "claimed" &&
      !["running", "canceled", "failed", "indeterminate"].includes(
        input.status,
      )) ||
    (current.status === "running" &&
      !["completed", "failed", "canceled", "indeterminate"].includes(
        input.status,
      ))
  )
    fail("task run transition is invalid");
  timestamp(input.logicalTime, "logicalTime");
  if (Date.parse(input.logicalTime) < Date.parse(current.updatedAt))
    fail("task run logical time moved backwards");
  if (input.reasonCode !== undefined) token(input.reasonCode, "reasonCode");
  if (input.retryable !== undefined && typeof input.retryable !== "boolean")
    fail("task retryable flag is invalid");
  if (input.retryable !== undefined && input.status !== "failed")
    fail("task retryable flag is only valid for failed tasks");
  if (input.usage !== undefined) validateTaskUsageV1(input.usage);
  if (input.resultReference !== undefined)
    token(input.resultReference, "resultReference");
  if (input.resultDigest !== undefined)
    digest(input.resultDigest, "resultDigest");
  if (
    input.status !== "completed" &&
    (input.resultReference !== undefined || input.resultDigest !== undefined)
  )
    fail("only a completed task can retain a result");
  if (["failed", "indeterminate"].includes(input.status) && !input.reasonCode)
    fail("failed or indeterminate task requires a reasonCode");
  const {
    stateDigest: _stateDigest,
    reasonCode: _reasonCode,
    retryable: _retryable,
    finishedAt: _finishedAt,
    ...body
  } = current;
  const next: Omit<TaskRunV1, "stateDigest"> = {
    ...body,
    revision: current.revision + 1,
    status: input.status,
    ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
    ...(input.retryable !== undefined ? { retryable: input.retryable } : {}),
    ...(input.usage !== undefined
      ? { usage: cloneWorkflowV1(input.usage) }
      : {}),
    ...(input.resultReference !== undefined
      ? { resultReference: input.resultReference }
      : {}),
    ...(input.resultDigest !== undefined
      ? { resultDigest: input.resultDigest }
      : {}),
    ...(input.status === "running" && !current.startedAt
      ? { startedAt: input.logicalTime }
      : {}),
    ...(terminalStatuses.has(input.status)
      ? { finishedAt: input.logicalTime }
      : {}),
    updatedAt: input.logicalTime,
  };
  return freezeTaskRun(next);
}

export function heartbeatTaskRunV1(
  currentInput: TaskRunV1,
  input: {
    readonly leaseToken: string;
    readonly logicalTime: string;
    readonly leaseExpiresAt: string;
  },
): TaskRunV1 {
  const current = validateTaskRunV1(currentInput);
  if (!["claimed", "running"].includes(current.status))
    fail("terminal task lease cannot heartbeat");
  if (current.leaseToken !== input.leaseToken)
    fail("task lease token is stale");
  timestamp(input.logicalTime, "logicalTime");
  timestamp(input.leaseExpiresAt, "leaseExpiresAt");
  if (
    Date.parse(input.logicalTime) < Date.parse(current.updatedAt) ||
    Date.parse(input.logicalTime) > Date.parse(current.leaseExpiresAt) ||
    Date.parse(input.leaseExpiresAt) <= Date.parse(input.logicalTime)
  )
    fail("task lease heartbeat time is invalid");
  const {
    stateDigest: _stateDigest,
    reasonCode: _reasonCode,
    retryable: _retryable,
    finishedAt: _finishedAt,
    ...body
  } = current;
  return freezeTaskRun({
    ...body,
    revision: current.revision + 1,
    leaseExpiresAt: input.leaseExpiresAt,
    updatedAt: input.logicalTime,
  });
}

export function takeOverExpiredTaskRunV1(
  currentInput: TaskRunV1,
  input: {
    readonly leaseOwnerId: string;
    readonly leaseToken: string;
    readonly logicalTime: string;
    readonly leaseExpiresAt: string;
  },
): TaskRunV1 {
  const current = validateTaskRunV1(currentInput);
  if (!["claimed", "running"].includes(current.status))
    fail("terminal task run cannot be taken over");
  token(input.leaseOwnerId, "leaseOwnerId");
  token(input.leaseToken, "leaseToken");
  timestamp(input.logicalTime, "logicalTime");
  timestamp(input.leaseExpiresAt, "leaseExpiresAt");
  if (
    Date.parse(input.logicalTime) < Date.parse(current.leaseExpiresAt) ||
    Date.parse(input.leaseExpiresAt) <= Date.parse(input.logicalTime) ||
    input.leaseToken === current.leaseToken
  )
    fail("task lease takeover is invalid");
  const { stateDigest: _stateDigest, ...body } = current;
  return freezeTaskRun({
    ...body,
    revision: current.revision + 1,
    status: "claimed",
    leaseOwnerId: input.leaseOwnerId,
    leaseToken: input.leaseToken,
    leaseGeneration: current.leaseGeneration + 1,
    leaseExpiresAt: input.leaseExpiresAt,
    updatedAt: input.logicalTime,
  });
}

export function reconcileIndeterminateTaskRunV1(
  currentInput: TaskRunV1,
  input:
    | {
        readonly status: "completed";
        readonly logicalTime: string;
        readonly resultReference?: string;
        readonly resultDigest?: WorkflowDigestV1;
        readonly usage?: TaskUsageV1;
      }
    | {
        readonly status: "failed" | "canceled";
        readonly logicalTime: string;
        readonly reasonCode: string;
        readonly usage?: TaskUsageV1;
      },
): TaskRunV1 {
  const current = validateTaskRunV1(currentInput);
  if (current.status !== "indeterminate")
    fail("only an indeterminate task can be reconciled");
  timestamp(input.logicalTime, "logicalTime");
  if (Date.parse(input.logicalTime) < Date.parse(current.updatedAt))
    fail("task reconciliation logical time moved backwards");
  if (input.usage) validateTaskUsageV1(input.usage);
  if (input.status === "completed") {
    if (input.resultReference) token(input.resultReference, "resultReference");
    if (input.resultDigest) digest(input.resultDigest, "resultDigest");
  } else {
    token(input.reasonCode, "reasonCode");
  }
  const {
    stateDigest: _stateDigest,
    reasonCode: _reasonCode,
    retryable: _retryable,
    finishedAt: _finishedAt,
    ...body
  } = current;
  const next: Omit<TaskRunV1, "stateDigest"> = {
    ...body,
    revision: current.revision + 1,
    status: input.status,
    ...(input.status === "completed"
      ? {
          ...(input.resultReference
            ? { resultReference: input.resultReference }
            : {}),
          ...(input.resultDigest ? { resultDigest: input.resultDigest } : {}),
        }
      : { reasonCode: input.reasonCode }),
    ...(input.usage ? { usage: cloneWorkflowV1(input.usage) } : {}),
    finishedAt: input.logicalTime,
    updatedAt: input.logicalTime,
  };
  return freezeTaskRun(next);
}

export function validateTaskRunV1(input: TaskRunV1): TaskRunV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "tenantId",
      "taskRunId",
      "processRunId",
      "stageId",
      "attempt",
      "revision",
      "idempotencyKey",
      "inputDigest",
      "status",
      "binding",
      ...(input.subject !== undefined ? ["subject"] : []),
      ...(input.usage !== undefined ? ["usage"] : []),
      ...(input.resultReference !== undefined ? ["resultReference"] : []),
      ...(input.resultDigest !== undefined ? ["resultDigest"] : []),
      ...(input.reasonCode !== undefined ? ["reasonCode"] : []),
      ...(input.retryable !== undefined ? ["retryable"] : []),
      "leaseOwnerId",
      "leaseToken",
      "leaseGeneration",
      "leaseExpiresAt",
      ...(input.startedAt !== undefined ? ["startedAt"] : []),
      ...(input.finishedAt !== undefined ? ["finishedAt"] : []),
      "createdAt",
      "updatedAt",
      "stateDigest",
    ],
    "task run",
  );
  if (input.schemaVersion !== 1) fail("task run schema is invalid");
  token(input.tenantId, "tenantId");
  token(input.taskRunId, "taskRunId");
  token(input.processRunId, "processRunId");
  token(input.stageId, "stageId");
  positive(input.attempt, "attempt");
  nonNegative(input.revision, "revision");
  token(input.idempotencyKey, "idempotencyKey");
  digest(input.inputDigest, "inputDigest");
  if (
    ![
      "claimed",
      "running",
      "completed",
      "failed",
      "canceled",
      "indeterminate",
    ].includes(input.status)
  )
    fail("task run status is invalid");
  validateTaskExecutionBindingV1(input.binding);
  if (input.subject) validateSubject(input.subject);
  if (input.usage) validateTaskUsageV1(input.usage);
  if (input.resultReference) token(input.resultReference, "resultReference");
  if (input.resultDigest) digest(input.resultDigest, "resultDigest");
  if (input.reasonCode) token(input.reasonCode, "reasonCode");
  if (input.retryable !== undefined && typeof input.retryable !== "boolean")
    fail("task retryable flag is invalid");
  if (input.retryable !== undefined && input.status !== "failed")
    fail("task retryable flag is only valid for failed tasks");
  token(input.leaseOwnerId, "leaseOwnerId");
  token(input.leaseToken, "leaseToken");
  nonNegative(input.leaseGeneration, "leaseGeneration");
  timestamp(input.leaseExpiresAt, "leaseExpiresAt");
  timestamp(input.createdAt, "createdAt");
  timestamp(input.updatedAt, "updatedAt");
  if (input.startedAt) timestamp(input.startedAt, "startedAt");
  if (input.finishedAt) timestamp(input.finishedAt, "finishedAt");
  if (terminalStatuses.has(input.status) !== Boolean(input.finishedAt))
    fail("task run terminal timestamp is inconsistent");
  if (input.status === "running" && !input.startedAt)
    fail("running task requires startedAt");
  if (
    input.status !== "completed" &&
    (input.resultReference || input.resultDigest)
  )
    fail("non-completed task cannot retain a result");
  const { stateDigest, ...body } = input;
  digest(stateDigest, "stateDigest");
  if (stateDigest !== taskRunDigest(body))
    fail("task run state digest does not match");
  return deepFreezeWorkflowV1(cloneWorkflowV1(input));
}

export function validateTaskUsageV1(input: TaskUsageV1): TaskUsageV1 {
  exactKeys(
    input,
    [
      ...(input.inputTokens !== undefined ? ["inputTokens"] : []),
      ...(input.outputTokens !== undefined ? ["outputTokens"] : []),
      ...(input.totalTokens !== undefined ? ["totalTokens"] : []),
      ...(input.durationMs !== undefined ? ["durationMs"] : []),
      ...(input.cost !== undefined ? ["cost"] : []),
    ],
    "task usage",
  );
  if (Object.keys(input).length === 0) fail("task usage cannot be empty");
  if (input.inputTokens !== undefined)
    nonNegative(input.inputTokens, "inputTokens");
  if (input.outputTokens !== undefined)
    nonNegative(input.outputTokens, "outputTokens");
  if (input.totalTokens !== undefined)
    nonNegative(input.totalTokens, "totalTokens");
  if (
    input.inputTokens !== undefined &&
    input.outputTokens !== undefined &&
    input.totalTokens !== undefined &&
    checkedAdd(
      input.inputTokens,
      input.outputTokens,
      "token usage overflow",
    ) !== input.totalTokens
  )
    fail("totalTokens does not equal inputTokens plus outputTokens");
  if (input.durationMs !== undefined)
    nonNegative(input.durationMs, "durationMs");
  if (input.cost) {
    exactKeys(input.cost, ["currency", "micros"], "task usage cost");
    token(input.cost.currency, "cost currency");
    nonNegative(input.cost.micros, "cost micros");
  }
  return deepFreezeWorkflowV1(cloneWorkflowV1(input));
}

export function sumTaskUsageV1(
  usages: readonly TaskUsageV1[],
): TaskUsageAggregateV1 {
  if (!Array.isArray(usages)) fail("task usages are invalid");
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let durationMs = 0;
  const costs = new Map<string, number>();
  for (const usageInput of usages) {
    const usage = validateTaskUsageV1(usageInput);
    inputTokens = checkedAdd(
      inputTokens,
      usage.inputTokens ?? 0,
      "input token usage overflow",
    );
    outputTokens = checkedAdd(
      outputTokens,
      usage.outputTokens ?? 0,
      "output token usage overflow",
    );
    totalTokens = checkedAdd(
      totalTokens,
      usage.totalTokens ?? 0,
      "total token usage overflow",
    );
    durationMs = checkedAdd(
      durationMs,
      usage.durationMs ?? 0,
      "duration usage overflow",
    );
    if (usage.cost)
      costs.set(
        usage.cost.currency,
        checkedAdd(
          costs.get(usage.cost.currency) ?? 0,
          usage.cost.micros,
          "cost usage overflow",
        ),
      );
  }
  return deepFreezeWorkflowV1({
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs,
    costs: [...costs.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, micros]) => ({ currency, micros })),
  });
}

function freezeTaskRun(body: Omit<TaskRunV1, "stateDigest">): TaskRunV1 {
  return deepFreezeWorkflowV1({
    ...cloneWorkflowV1(body),
    stateDigest: taskRunDigest(body),
  });
}

function taskRunDigest(body: Omit<TaskRunV1, "stateDigest">): WorkflowDigestV1 {
  return digestWorkflowJsonV1("task-run-state", json(body));
}

function validateBindingInput(input: TaskExecutionBindingInputV1): void {
  for (const [key, value] of Object.entries(input)) {
    if (key.endsWith("Digest")) digest(value, key);
    else token(value, key);
  }
  if (input.promptDigest && !input.promptRevision)
    fail("promptDigest requires promptRevision");
  if (
    (input.modelName ||
      input.modelRevision ||
      input.modelConfigurationDigest) &&
    !input.modelProvider
  )
    fail("model details require modelProvider");
}

function validateSubject(subject: SubjectReferenceV1): void {
  exactKeys(subject, ["subjectType", "subjectId"], "subject reference");
  token(subject.subjectType, "subjectType");
  token(subject.subjectId, "subjectId");
}

function canonicalOptional(value: JsonValue | undefined): string | undefined {
  return value === undefined ? undefined : canonicalizeWorkflowJsonV1(value);
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

function nonNegative(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} must be a non-negative safe integer`);
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
