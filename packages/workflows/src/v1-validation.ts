import type { JsonValue } from "@agentplat/core";

import {
  canonicalizeWorkflowJsonV1,
  deepFreezeWorkflowV1,
  digestWorkflowJsonV1,
  WorkflowValidationErrorV1,
} from "./v1-canonical.js";
import {
  DEFAULT_PROCESS_DEFINITION_LIMITS_V1,
  type ProcessDefinitionInputV1,
  type ProcessDefinitionLimitsV1,
  type ProcessDefinitionV1,
  type ProcessStageOutcomeV1,
  type ProcessStageV1,
  type TaskDefinitionV1,
  type WorkflowDigestV1,
} from "./v1-contracts.js";

const stageOutcomes: Readonly<
  Record<ProcessStageV1["kind"], ReadonlySet<ProcessStageOutcomeV1>>
> = Object.freeze({
  task: new Set<ProcessStageOutcomeV1>([
    "succeeded",
    "failed",
    "timed_out",
    "canceled",
    "skipped",
  ]),
  wait: new Set<ProcessStageOutcomeV1>(["succeeded", "canceled", "skipped"]),
  await_signal: new Set<ProcessStageOutcomeV1>([
    "signal_received",
    "timed_out",
    "canceled",
    "skipped",
  ]),
  gate: new Set<ProcessStageOutcomeV1>([
    "approved",
    "rejected",
    "expired",
    "failed",
    "canceled",
    "skipped",
  ]),
});

export function createProcessDefinitionV1(
  input: ProcessDefinitionInputV1,
): ProcessDefinitionV1 {
  exactKeys(
    input,
    [
      "processId",
      "version",
      "name",
      "stages",
      ...(input.cancellationTriggers ? ["cancellationTriggers"] : []),
      ...(input.limits ? ["limits"] : []),
    ],
    "process definition input",
  );
  const limits = Object.freeze({
    ...DEFAULT_PROCESS_DEFINITION_LIMITS_V1,
    ...input.limits,
  });
  const body = {
    schemaVersion: 1 as const,
    processId: input.processId,
    version: input.version,
    name: input.name,
    stages: input.stages,
    ...(input.cancellationTriggers
      ? { cancellationTriggers: input.cancellationTriggers }
      : {}),
    limits,
  };
  validateProcessDefinitionBodyV1(body);
  const definition: ProcessDefinitionV1 = {
    ...body,
    definitionDigest: digestWorkflowJsonV1("process-definition", json(body)),
  };
  return deepFreezeWorkflowV1(structuredClone(definition));
}

export function validateProcessDefinitionV1(
  input: ProcessDefinitionV1,
): ProcessDefinitionV1 {
  exactKeys(
    input,
    input.cancellationTriggers
      ? [
          "schemaVersion",
          "processId",
          "version",
          "name",
          "stages",
          "cancellationTriggers",
          "limits",
          "definitionDigest",
        ]
      : [
          "schemaVersion",
          "processId",
          "version",
          "name",
          "stages",
          "limits",
          "definitionDigest",
        ],
    "process definition",
  );
  if (input.schemaVersion !== 1) fail("process definition schema is invalid");
  validateProcessDefinitionBodyV1(input);
  digest(input.definitionDigest, "definitionDigest");
  const { definitionDigest: _definitionDigest, ...body } = input;
  if (
    input.definitionDigest !==
    digestWorkflowJsonV1("process-definition", json(body))
  )
    fail("process definition digest does not match");
  return deepFreezeWorkflowV1(structuredClone(input));
}

export function createTaskDefinitionV1(
  input: Omit<TaskDefinitionV1, "schemaVersion" | "definitionDigest">,
): TaskDefinitionV1 {
  exactKeys(
    input,
    [
      "taskDefinitionId",
      "version",
      "name",
      "handlerKey",
      "handlerDigest",
      "effectClass",
      ...(input.actionBinding ? ["actionBinding"] : []),
    ],
    "task definition input",
  );
  const body = { schemaVersion: 1 as const, ...input };
  validateTaskDefinitionBody(body);
  return deepFreezeWorkflowV1({
    ...structuredClone(body),
    definitionDigest: digestWorkflowJsonV1("task-definition", json(body)),
  });
}

export function validateTaskDefinitionV1(
  input: TaskDefinitionV1,
): TaskDefinitionV1 {
  exactKeys(
    input,
    input.actionBinding
      ? [
          "schemaVersion",
          "taskDefinitionId",
          "version",
          "name",
          "handlerKey",
          "handlerDigest",
          "effectClass",
          "actionBinding",
          "definitionDigest",
        ]
      : [
          "schemaVersion",
          "taskDefinitionId",
          "version",
          "name",
          "handlerKey",
          "handlerDigest",
          "effectClass",
          "definitionDigest",
        ],
    "task definition",
  );
  validateTaskDefinitionBody(input);
  digest(input.definitionDigest, "definitionDigest");
  const { definitionDigest: _definitionDigest, ...body } = input;
  if (
    input.definitionDigest !==
    digestWorkflowJsonV1("task-definition", json(body))
  )
    fail("task definition digest does not match");
  return deepFreezeWorkflowV1(structuredClone(input));
}

export function topologicalProcessStageIdsV1(
  definition: ProcessDefinitionV1,
): readonly string[] {
  validateProcessDefinitionV1(definition);
  const byId = new Map(
    definition.stages.map((stage) => [stage.stageId, stage]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: string[] = [];
  const visit = (stageId: string): void => {
    if (visited.has(stageId)) return;
    if (visiting.has(stageId)) fail("process definition contains a cycle");
    visiting.add(stageId);
    const stage = byId.get(stageId)!;
    for (const dependency of stage.dependsOn) visit(dependency.stageId);
    visiting.delete(stageId);
    visited.add(stageId);
    result.push(stageId);
  };
  for (const stage of definition.stages) visit(stage.stageId);
  return Object.freeze(result);
}

function validateProcessDefinitionBodyV1(input: {
  readonly schemaVersion: 1;
  readonly processId: string;
  readonly version: string;
  readonly name: string;
  readonly stages: readonly ProcessStageV1[];
  readonly cancellationTriggers?: ProcessDefinitionV1["cancellationTriggers"];
  readonly limits: ProcessDefinitionLimitsV1;
}): void {
  token(input.processId, "processId");
  token(input.version, "version");
  text(input.name, "name", 256);
  validateLimits(input.limits);
  if (
    !Array.isArray(input.stages) ||
    input.stages.length < 1 ||
    input.stages.length > input.limits.maximumStages
  )
    fail("process stages are outside limits");
  const stageIds = new Set<string>();
  for (const stage of input.stages) {
    validateStage(stage, input.limits);
    if (stageIds.has(stage.stageId)) fail("process stage ID is duplicated");
    stageIds.add(stage.stageId);
  }
  if (
    !input.stages.some(
      (stage) => stage.kind !== "task" || !stage.compensationForStageId,
    )
  )
    fail("process definition requires a normal stage");
  const stageById = new Map<string, ProcessStageV1>(
    input.stages.map((stage) => [stage.stageId, stage]),
  );
  const dependentCounts = new Map<string, number>();
  for (const stage of input.stages) {
    for (const dependency of stage.dependsOn) {
      const source = stageById.get(dependency.stageId);
      if (!source) fail("process stage dependency is missing");
      const dependentCount = (dependentCounts.get(source.stageId) ?? 0) + 1;
      if (dependentCount > input.limits.maximumDependentsPerStage)
        fail("process stage fan-out exceeds definition limits");
      dependentCounts.set(source.stageId, dependentCount);
      if (source.stageId === stage.stageId)
        fail("process stage cannot depend on itself");
      for (const outcome of dependency.outcomes)
        if (!stageOutcomes[source.kind].has(outcome))
          fail("process stage dependency outcome is impossible");
    }
    if (stage.kind === "task" && stage.compensationForStageId) {
      const target = stageById.get(stage.compensationForStageId);
      if (!target || target.kind !== "task" || target.compensationForStageId)
        fail("compensation target is invalid");
      if (stage.dependsOn.length > 0)
        fail("compensation stage dependencies are unsupported in V1");
    }
  }
  assertAcyclic(input.stages);
  if (input.cancellationTriggers) {
    if (!Array.isArray(input.cancellationTriggers))
      fail("cancellation triggers are invalid");
    const identities = new Set<string>();
    for (const trigger of input.cancellationTriggers) {
      exactKeys(
        trigger,
        trigger.correlationKey
          ? ["kind", "signalType", "correlationKey", "reasonCode"]
          : ["kind", "signalType", "reasonCode"],
        "cancellation trigger",
      );
      if (trigger.kind !== "signal") fail("cancellation trigger is invalid");
      token(trigger.signalType, "cancellation signalType");
      if (trigger.correlationKey)
        token(trigger.correlationKey, "cancellation correlationKey");
      token(trigger.reasonCode, "cancellation reasonCode");
      const identity = `${trigger.signalType}\0${trigger.correlationKey ?? ""}`;
      if (identities.has(identity)) fail("cancellation trigger is duplicated");
      identities.add(identity);
    }
  }
}

function validateStage(
  stage: ProcessStageV1,
  limits: ProcessDefinitionLimitsV1,
): void {
  const common = ["schemaVersion", "stageId", "name", "kind", "dependsOn"];
  if (stage.dependencyMode !== undefined) common.push("dependencyMode");
  if (stage.timeoutMs !== undefined) common.push("timeoutMs");
  if (stage.metadata !== undefined) common.push("metadata");
  const specific: string[] = [];
  if (stage.kind === "task") {
    specific.push("taskDefinitionId", "taskDefinitionVersion");
    if (stage.retryPolicy !== undefined) specific.push("retryPolicy");
    if (stage.compensationForStageId !== undefined)
      specific.push("compensationForStageId");
  } else if (stage.kind === "wait") {
    specific.push("durationMs");
  } else if (stage.kind === "await_signal") {
    specific.push("signalType");
    if (stage.correlationKey !== undefined) specific.push("correlationKey");
  } else if (stage.kind === "gate") {
    specific.push("gateType", "gateDefinitionId");
    if (stage.configuration !== undefined) specific.push("configuration");
    if (stage.expiresInMs !== undefined) specific.push("expiresInMs");
  } else {
    fail("process stage kind is invalid");
  }
  exactKeys(stage, [...common, ...specific], "process stage");
  if (stage.schemaVersion !== 1) fail("process stage schema is invalid");
  token(stage.stageId, "stageId");
  text(stage.name, "stage name", 256);
  if (
    !Array.isArray(stage.dependsOn) ||
    stage.dependsOn.length > limits.maximumDependenciesPerStage
  )
    fail("stage dependencies are outside limits");
  if (stage.dependencyMode && !["all", "any"].includes(stage.dependencyMode))
    fail("stage dependency mode is invalid");
  if (stage.timeoutMs !== undefined) positive(stage.timeoutMs, "timeoutMs");
  if (
    stage.timeoutMs !== undefined &&
    stage.timeoutMs > limits.maximumRunDurationMs
  )
    fail("stage timeout exceeds maximum run duration");
  if (stage.metadata !== undefined) json(stage.metadata);
  const dependencyIds = new Set<string>();
  for (const dependency of stage.dependsOn) {
    exactKeys(dependency, ["stageId", "outcomes"], "stage dependency");
    token(dependency.stageId, "dependency stageId");
    if (
      !Array.isArray(dependency.outcomes) ||
      dependency.outcomes.length < 1 ||
      (dependency.outcomes as readonly ProcessStageOutcomeV1[]).some(
        (outcome) =>
          !stageOutcomes.task.has(outcome) &&
          !stageOutcomes.wait.has(outcome) &&
          !stageOutcomes.await_signal.has(outcome) &&
          !stageOutcomes.gate.has(outcome),
      ) ||
      new Set(dependency.outcomes).size !== dependency.outcomes.length
    )
      fail("stage dependency outcomes are invalid");
    if (dependencyIds.has(dependency.stageId))
      fail("stage dependency is duplicated");
    dependencyIds.add(dependency.stageId);
  }
  if (stage.kind === "task") {
    token(stage.taskDefinitionId, "taskDefinitionId");
    token(stage.taskDefinitionVersion, "taskDefinitionVersion");
    if (stage.retryPolicy) {
      exactKeys(stage.retryPolicy, ["maximumAttempts"], "task retry policy");
      positive(stage.retryPolicy.maximumAttempts, "maximumAttempts");
      if (stage.retryPolicy.maximumAttempts > limits.maximumAttemptsPerTask)
        fail("task retry attempts exceed definition limits");
    }
    if (stage.compensationForStageId)
      token(stage.compensationForStageId, "compensationForStageId");
  } else if (stage.kind === "wait") {
    positive(stage.durationMs, "durationMs");
    if (stage.durationMs > limits.maximumRunDurationMs)
      fail("wait duration exceeds maximum run duration");
  } else if (stage.kind === "await_signal") {
    token(stage.signalType, "signalType");
    if (stage.correlationKey) token(stage.correlationKey, "correlationKey");
  } else {
    token(stage.gateType, "gateType");
    token(stage.gateDefinitionId, "gateDefinitionId");
    if (stage.configuration !== undefined) json(stage.configuration);
    if (stage.expiresInMs !== undefined)
      positive(stage.expiresInMs, "expiresInMs");
    if (
      stage.expiresInMs !== undefined &&
      stage.expiresInMs > limits.maximumGateDurationMs
    )
      fail("gate duration exceeds definition limits");
  }
}

function validateTaskDefinitionBody(
  input: Omit<TaskDefinitionV1, "definitionDigest">,
): void {
  if (input.schemaVersion !== 1) fail("task definition schema is invalid");
  token(input.taskDefinitionId, "taskDefinitionId");
  token(input.version, "task definition version");
  text(input.name, "task definition name", 256);
  token(input.handlerKey, "handlerKey");
  digest(input.handlerDigest, "handlerDigest");
  if (
    !(["internal", "protected_external"] as string[]).includes(
      input.effectClass,
    )
  )
    fail("task effect class is invalid");
  if (input.effectClass === "protected_external" && !input.actionBinding)
    fail("protected external task requires an action binding");
  if (input.effectClass === "internal" && input.actionBinding)
    fail("internal task cannot declare an action binding");
  if (input.actionBinding) {
    exactKeys(
      input.actionBinding,
      ["namespace", "toolId", "operation"],
      "task action binding",
    );
    token(input.actionBinding.namespace, "action namespace");
    token(input.actionBinding.toolId, "action toolId");
    token(input.actionBinding.operation, "action operation");
  }
}

function validateLimits(limits: ProcessDefinitionLimitsV1): void {
  exactKeys(
    limits,
    [
      "maximumStages",
      "maximumDependenciesPerStage",
      "maximumDependentsPerStage",
      "maximumAttemptsPerTask",
      "maximumSignalBytes",
      "maximumRetainedSignals",
      "maximumTransitionsPerAdvance",
      "maximumRetainedOperations",
      "maximumRunDurationMs",
      "maximumGateDurationMs",
    ],
    "process definition limits",
  );
  positive(limits.maximumStages, "maximumStages");
  positive(limits.maximumDependenciesPerStage, "maximumDependenciesPerStage");
  positive(limits.maximumDependentsPerStage, "maximumDependentsPerStage");
  positive(limits.maximumAttemptsPerTask, "maximumAttemptsPerTask");
  positive(limits.maximumSignalBytes, "maximumSignalBytes");
  positive(limits.maximumRetainedSignals, "maximumRetainedSignals");
  positive(limits.maximumTransitionsPerAdvance, "maximumTransitionsPerAdvance");
  positive(limits.maximumRetainedOperations, "maximumRetainedOperations");
  positive(limits.maximumRunDurationMs, "maximumRunDurationMs");
  positive(limits.maximumGateDurationMs, "maximumGateDurationMs");
  if (limits.maximumStages > DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumStages)
    fail("maximumStages exceeds the V1 ceiling");
  if (
    limits.maximumDependenciesPerStage >
    DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumDependenciesPerStage
  )
    fail("maximumDependenciesPerStage exceeds the V1 ceiling");
  if (
    limits.maximumDependentsPerStage >
    DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumDependentsPerStage
  )
    fail("maximumDependentsPerStage exceeds the V1 ceiling");
  if (
    limits.maximumAttemptsPerTask >
      DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumAttemptsPerTask ||
    limits.maximumSignalBytes >
      DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumSignalBytes ||
    limits.maximumRetainedSignals >
      DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumRetainedSignals ||
    limits.maximumTransitionsPerAdvance >
      DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumTransitionsPerAdvance ||
    limits.maximumRetainedOperations >
      DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumRetainedOperations ||
    limits.maximumRunDurationMs >
      DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumRunDurationMs ||
    limits.maximumGateDurationMs >
      DEFAULT_PROCESS_DEFINITION_LIMITS_V1.maximumGateDurationMs
  )
    fail("process definition limit exceeds the V1 ceiling");
}

function assertAcyclic(stages: readonly ProcessStageV1[]): void {
  const byId = new Map(stages.map((stage) => [stage.stageId, stage]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (stageId: string): void => {
    if (visited.has(stageId)) return;
    if (visiting.has(stageId)) fail("process definition contains a cycle");
    visiting.add(stageId);
    for (const dependency of byId.get(stageId)!.dependsOn)
      visit(dependency.stageId);
    visiting.delete(stageId);
    visited.add(stageId);
  };
  for (const stage of stages) visit(stage.stageId);
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

function text(value: unknown, label: string, maximum: number): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
    fail(`${label} is invalid`);
}

function positive(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail(`${label} must be a positive safe integer`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is WorkflowDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
}

function fail(message: string): never {
  throw new WorkflowValidationErrorV1(message);
}
