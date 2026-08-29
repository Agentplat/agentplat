import {
  WorkflowOutcomeRuntimeV1,
  createProcessDefinitionV1,
  createTaskDefinitionV1,
  createTaskExecutionBindingV1,
  createTaskRunV1,
  digestWorkflowJsonV1,
  takeOverExpiredTaskRunV1,
  type ProcessDefinitionV1,
  type WorkflowDigestV1,
} from "@agentplat/workflows";

import {
  WORKFLOW_CONFORMANCE_VERSION_V1,
  type WorkflowConformanceCapabilityV1,
  type WorkflowConformanceCaseIdV1,
  type WorkflowConformanceCaseResultV1,
  type WorkflowConformanceOptionsV1,
  type WorkflowConformanceReportV1,
  type WorkflowConformanceRuntimeV1,
  type WorkflowConformanceScopeV1,
} from "./contracts.js";

const caseIds = Object.freeze<readonly WorkflowConformanceCaseIdV1[]>([
  "definition_and_linear_dag",
  "start_idempotency_conflict",
  "signal_resume_and_replay",
  "wait_deadline",
  "gate_expiry_fail_closed",
  "cancellation_compensation",
  "task_binding_usage_outcome",
  "task_lease_takeover",
  "persistence_distinct_reopen",
]);

const capabilities = new Set<WorkflowConformanceCapabilityV1>([
  "runner.core",
  "runner.gates",
  "runner.cancellation",
  "task.integrity",
  "task.leases",
  "outcomes.delayed",
  "persistence.restart",
]);

const requiredCapabilities: Readonly<
  Record<
    WorkflowConformanceCaseIdV1,
    readonly WorkflowConformanceCapabilityV1[]
  >
> = Object.freeze({
  definition_and_linear_dag: ["runner.core"],
  start_idempotency_conflict: ["runner.core"],
  signal_resume_and_replay: ["runner.core"],
  wait_deadline: ["runner.core"],
  gate_expiry_fail_closed: ["runner.gates"],
  cancellation_compensation: ["runner.cancellation"],
  task_binding_usage_outcome: ["task.integrity", "outcomes.delayed"],
  task_lease_takeover: ["task.leases"],
  persistence_distinct_reopen: ["persistence.restart"],
});

export async function runWorkflowConformanceV1(
  options: WorkflowConformanceOptionsV1,
): Promise<WorkflowConformanceReportV1> {
  const validated = validateOptions(options);
  const clock = options.clock ?? (() => new Date());
  const startedAt = timestamp(clock(), "conformance start");
  const results: WorkflowConformanceCaseResultV1[] = [];
  for (const caseId of caseIds) {
    const missing = requiredCapabilities[caseId].find(
      (capability) => !validated.capabilities.includes(capability),
    );
    if (missing) {
      results.push(
        Object.freeze({
          caseId,
          outcome: "skipped",
          reasonCode: `capability_not_declared:${missing}`,
          durationMs: 0,
        }),
      );
      continue;
    }
    results.push(await runCase(validated, caseId));
  }
  const finishedAt = timestamp(clock(), "conformance finish");
  const counts = {
    passed: results.filter((result) => result.outcome === "passed").length,
    failed: results.filter((result) => result.outcome === "failed").length,
    skipped: results.filter((result) => result.outcome === "skipped").length,
  };
  const body = {
    schemaVersion: 1 as const,
    conformanceVersion: WORKFLOW_CONFORMANCE_VERSION_V1,
    implementationId: validated.implementationId,
    implementationVersion: validated.implementationVersion,
    implementationDigest: validated.implementationDigest,
    capabilities: validated.capabilities,
    seed: validated.seed,
    startedAt,
    finishedAt,
    cases: results,
    ...counts,
  };
  return Object.freeze({
    ...body,
    reportDigest: digestWorkflowJsonV1("conformance-report", body as never),
  });
}

export function validateWorkflowConformanceReportV1(
  report: WorkflowConformanceReportV1,
): WorkflowConformanceReportV1 {
  if (
    report.schemaVersion !== 1 ||
    report.conformanceVersion !== WORKFLOW_CONFORMANCE_VERSION_V1 ||
    !/^sha256:[0-9a-f]{64}$/u.test(report.implementationDigest) ||
    !/^sha256:[0-9a-f]{64}$/u.test(report.reportDigest) ||
    report.cases.length !== caseIds.length ||
    report.cases.some((result, index) => result.caseId !== caseIds[index]) ||
    new Set(report.capabilities).size !== report.capabilities.length ||
    report.capabilities.some((capability) => !capabilities.has(capability)) ||
    [...report.capabilities]
      .sort(compareAscii)
      .some((capability, index) => capability !== report.capabilities[index])
  )
    throw new TypeError("workflow_conformance_report_invalid");
  const passed = report.cases.filter(
    (result) => result.outcome === "passed",
  ).length;
  const failed = report.cases.filter(
    (result) => result.outcome === "failed",
  ).length;
  const skipped = report.cases.filter(
    (result) => result.outcome === "skipped",
  ).length;
  if (
    passed !== report.passed ||
    failed !== report.failed ||
    skipped !== report.skipped ||
    passed + failed + skipped !== caseIds.length
  )
    throw new TypeError("workflow_conformance_report_counts_invalid");
  for (const result of report.cases) {
    if (
      !["passed", "failed", "skipped"].includes(result.outcome) ||
      !Number.isSafeInteger(result.durationMs) ||
      result.durationMs < 0 ||
      !result.reasonCode
    )
      throw new TypeError("workflow_conformance_case_result_invalid");
  }
  const { reportDigest, ...body } = report;
  if (
    reportDigest !== digestWorkflowJsonV1("conformance-report", body as never)
  )
    throw new TypeError("workflow_conformance_report_digest_invalid");
  return Object.freeze(structuredClone(report));
}

export function assertWorkflowConformancePassedV1(
  reportInput: WorkflowConformanceReportV1,
): WorkflowConformanceReportV1 {
  const report = validateWorkflowConformanceReportV1(reportInput);
  if (report.failed !== 0)
    throw new Error("workflow_conformance_report_failed");
  return report;
}

async function runCase(
  options: ValidatedOptions,
  caseId: WorkflowConformanceCaseIdV1,
): Promise<WorkflowConformanceCaseResultV1> {
  const started = Date.now();
  const abort = new AbortController();
  let scope: WorkflowConformanceScopeV1 | undefined;
  let outcome: WorkflowConformanceCaseResultV1["outcome"] = "passed";
  let reasonCode = "passed";
  try {
    scope = await withTimeout(
      options.factory.create({
        caseId,
        scopeId: `workflow-conformance:${options.seed}:${caseId}`,
        seed: options.seed,
        signal: abort.signal,
      }),
      options.caseTimeoutMs,
      abort,
    );
    await withTimeout(executeCase(caseId, scope), options.caseTimeoutMs, abort);
  } catch (error) {
    outcome = "failed";
    reasonCode =
      error instanceof ConformanceAssertionError
        ? error.code
        : error instanceof ConformanceTimeoutError
          ? "case_timeout"
          : "case_error";
  } finally {
    abort.abort();
    if (scope)
      try {
        await scope.cleanup();
      } catch {
        outcome = "failed";
        reasonCode = "cleanup_failed";
      }
  }
  return Object.freeze({
    caseId,
    outcome,
    reasonCode,
    durationMs: Math.max(0, Date.now() - started),
  });
}

async function executeCase(
  caseId: WorkflowConformanceCaseIdV1,
  scope: WorkflowConformanceScopeV1,
): Promise<void> {
  if (caseId === "persistence_distinct_reopen") return persistenceCase(scope);
  const runtime = await scope.open();
  if (caseId === "definition_and_linear_dag") return linearCase(runtime);
  if (caseId === "start_idempotency_conflict") return idempotencyCase(runtime);
  if (caseId === "signal_resume_and_replay") return signalCase(runtime);
  if (caseId === "wait_deadline") return waitCase(runtime);
  if (caseId === "gate_expiry_fail_closed") return gateCase(runtime);
  if (caseId === "cancellation_compensation") return cancellationCase(runtime);
  if (caseId === "task_lease_takeover") return taskLeaseCase(runtime);
  return taskOutcomeCase(runtime);
}

async function linearCase(
  runtime: WorkflowConformanceRuntimeV1,
): Promise<void> {
  const definition = process("linear", [
    task("first"),
    task("second", [{ stageId: "first", outcomes: ["succeeded"] }]),
  ]);
  await register(runtime, definition);
  const result = await runtime.runner.start(start("linear"));
  equal(result.run.status, "completed", "linear_not_completed");
  deepEqual(
    runtime.control.taskExecutionStageIds(),
    ["first", "second"],
    "linear_execution_order_invalid",
  );
}

async function idempotencyCase(
  runtime: WorkflowConformanceRuntimeV1,
): Promise<void> {
  const definition = process("idempotency", [wait("hold", 10_000)]);
  await register(runtime, definition);
  const input = start("idempotency");
  equal(
    (await runtime.runner.start(input)).disposition,
    "applied",
    "start_not_applied",
  );
  equal(
    (await runtime.runner.start(input)).disposition,
    "replayed",
    "start_not_replayed",
  );
  let conflicted = false;
  try {
    await runtime.runner.start({ ...input, input: { changed: true } });
  } catch {
    conflicted = true;
  }
  equal(conflicted, true, "start_conflict_not_rejected");
}

async function signalCase(
  runtime: WorkflowConformanceRuntimeV1,
): Promise<void> {
  const definition = process("signal", [signalStage("signal")]);
  await register(runtime, definition);
  equal(
    (await runtime.runner.start(start("signal"))).run.status,
    "waiting",
    "signal_not_waiting",
  );
  const input = signalInput("signal", "2026-08-28T12:00:01.000Z");
  equal(
    (await runtime.runner.signal(input)).run.status,
    "completed",
    "signal_not_completed",
  );
  equal(
    (await runtime.runner.signal(input)).disposition,
    "replayed",
    "signal_not_replayed",
  );
}

async function waitCase(runtime: WorkflowConformanceRuntimeV1): Promise<void> {
  const definition = process("wait", [wait("timer", 1_000)]);
  await register(runtime, definition);
  equal(
    (await runtime.runner.start(start("wait"))).run.status,
    "waiting",
    "wait_not_waiting",
  );
  equal(
    (
      await runtime.runner.advance(
        advance("wait", "before", "2026-08-28T12:00:00.999Z"),
      )
    ).run.status,
    "waiting",
    "wait_finished_early",
  );
  equal(
    (
      await runtime.runner.advance(
        advance("wait", "due", "2026-08-28T12:00:01.000Z"),
      )
    ).run.status,
    "completed",
    "wait_not_completed",
  );
}

async function gateCase(runtime: WorkflowConformanceRuntimeV1): Promise<void> {
  runtime.control.setGateResult("gate", {
    status: "waiting",
    gateRequestId: "gate-request",
  });
  const definition = process("gate", [
    {
      schemaVersion: 1,
      stageId: "gate",
      name: "gate",
      kind: "gate",
      gateType: "conformance.gate",
      gateDefinitionId: "gate-definition",
      expiresInMs: 1_000,
      dependsOn: [],
    },
  ]);
  await register(runtime, definition);
  equal(
    (await runtime.runner.start(start("gate"))).run.status,
    "waiting",
    "gate_not_waiting",
  );
  const result = await runtime.runner.advance(
    advance("gate", "expire", "2026-08-28T12:00:01.000Z"),
  );
  equal(result.run.status, "failed", "expired_gate_did_not_fail_closed");
  equal(
    result.run.stageStates[0]?.outcome,
    "expired",
    "gate_expiry_outcome_missing",
  );
}

async function cancellationCase(
  runtime: WorkflowConformanceRuntimeV1,
): Promise<void> {
  const definition = process("cancel", [
    task("apply"),
    signalStage("hold", [{ stageId: "apply", outcomes: ["succeeded"] }]),
    task("later", [{ stageId: "hold", outcomes: ["signal_received"] }]),
    task("compensate", [], { compensationForStageId: "apply" }),
  ]);
  await register(runtime, definition);
  equal(
    (await runtime.runner.start(start("cancel"))).run.status,
    "waiting",
    "cancel_not_waiting",
  );
  const result = await runtime.runner.cancel({
    tenantId: "tenant:conformance",
    runId: "run:cancel",
    operationId: "operation:cancel",
    idempotencyKey: "cancel",
    reasonCode: "conformance_cancel",
    logicalTime: "2026-08-28T12:00:01.000Z",
  });
  equal(result.run.status, "canceled", "run_not_canceled");
  deepEqual(
    runtime.control.taskExecutionStageIds(),
    ["apply", "compensate"],
    "compensation_execution_invalid",
  );
}

async function taskOutcomeCase(
  runtime: WorkflowConformanceRuntimeV1,
): Promise<void> {
  const definition = process("outcome", [task("evaluate")]);
  await register(runtime, definition);
  await runtime.runner.start({
    ...start("outcome"),
    subject: { subjectType: "case", subjectId: "case:conformance" },
  });
  const [taskRun] = await runtime.store.listTaskRuns({
    tenantId: "tenant:conformance",
    processRunId: "run:outcome",
  });
  truthy(taskRun, "task_run_missing");
  equal(taskRun.status, "completed", "task_run_not_completed");
  equal(taskRun.usage?.totalTokens, 3, "task_usage_missing");
  const outcomes = new WorkflowOutcomeRuntimeV1(
    runtime.store,
    runtime.outcomes,
  );
  await outcomes.record({
    tenantId: "tenant:conformance",
    outcomeId: "outcome:conformance",
    taskRunId: taskRun.taskRunId,
    taskExecutionBindingDigest: taskRun.binding.bindingDigest,
    outcomeType: "conformance.verdict",
    verdict: "positive",
    sourceType: "conformance",
    sourceId: "source:conformance",
    observedAt: "2026-08-28T12:00:02.000Z",
    recordedAt: "2026-08-28T12:00:02.000Z",
    evidenceReferenceIds: [],
  });
  const summary = await outcomes.summarize({
    tenantId: "tenant:conformance",
    groupBy: "execution_binding",
    outcomeType: "conformance.verdict",
  });
  equal(summary[0]?.positive, 1, "outcome_summary_invalid");
}

async function taskLeaseCase(
  runtime: WorkflowConformanceRuntimeV1,
): Promise<void> {
  const definition = process("lease", [wait("hold", 60_000)]);
  await register(runtime, definition);
  await runtime.runner.start(start("lease"));
  const taskDefinition = createTaskDefinitionV1({
    taskDefinitionId: "task:lease",
    version: "1",
    name: "Lease",
    handlerKey: "handler:lease",
    handlerDigest: digestWorkflowJsonV1("conformance-handler", "lease"),
    effectClass: "internal",
  });
  await runtime.store.registerTaskDefinition(
    "tenant:conformance",
    taskDefinition,
  );
  const claimed = createTaskRunV1({
    tenantId: "tenant:conformance",
    taskRunId: "task-run:lease",
    processRunId: "run:lease",
    stageId: "lease-probe",
    attempt: 1,
    idempotencyKey: "task-run:lease",
    inputDigest: digestWorkflowJsonV1("conformance-input", "lease"),
    binding: createTaskExecutionBindingV1(taskDefinition),
    leaseOwnerId: "worker:old",
    leaseToken: "lease:old:0",
    leaseGeneration: 0,
    leaseExpiresAt: "2026-08-28T12:00:01.000Z",
    logicalTime: "2026-08-28T12:00:00.000Z",
  });
  equal(
    await runtime.store.createTaskRun(claimed),
    true,
    "task_lease_claim_failed",
  );
  const takeover = takeOverExpiredTaskRunV1(claimed, {
    leaseOwnerId: "worker:new",
    leaseToken: "lease:new:1",
    logicalTime: "2026-08-28T12:00:01.000Z",
    leaseExpiresAt: "2026-08-28T12:00:02.000Z",
  });
  const races = await Promise.all([
    runtime.store.compareAndSetTaskRun({
      expectedRevision: claimed.revision,
      expectedStateDigest: claimed.stateDigest,
      run: takeover,
    }),
    runtime.store.compareAndSetTaskRun({
      expectedRevision: claimed.revision,
      expectedStateDigest: claimed.stateDigest,
      run: takeover,
    }),
  ]);
  deepEqual(races.sort(), [false, true], "task_lease_takeover_not_fenced");
  const retained = await runtime.store.getTaskRun(
    "tenant:conformance",
    claimed.taskRunId,
  );
  equal(retained?.leaseOwnerId, "worker:new", "task_lease_owner_not_replaced");
  equal(retained?.leaseGeneration, 1, "task_lease_generation_not_advanced");
}

async function persistenceCase(
  scope: WorkflowConformanceScopeV1,
): Promise<void> {
  if (!scope.reopen) throw new ConformanceAssertionError("reopen_missing");
  const first = await scope.open();
  const definition = process("restart", [
    task("prepare"),
    signalStage("resume", [{ stageId: "prepare", outcomes: ["succeeded"] }]),
  ]);
  await register(first, definition);
  equal(
    (await first.runner.start(start("restart"))).run.status,
    "waiting",
    "restart_not_waiting",
  );
  const reopened = await scope.reopen();
  const result = await reopened.runner.signal(
    signalInput("restart", "2026-08-28T12:00:01.000Z"),
  );
  equal(result.run.status, "completed", "restart_not_completed");
  deepEqual(
    reopened.control.taskExecutionStageIds(),
    ["prepare"],
    "restart_reexecuted_task",
  );
  equal(
    (
      await reopened.store.listTaskRuns({
        tenantId: "tenant:conformance",
        processRunId: "run:restart",
      })
    ).length,
    1,
    "restart_task_state_missing",
  );
}

async function register(
  runtime: WorkflowConformanceRuntimeV1,
  definition: ProcessDefinitionV1,
): Promise<void> {
  for (const stage of definition.stages) {
    if (stage.kind !== "task") continue;
    await runtime.store.registerTaskDefinition(
      "tenant:conformance",
      createTaskDefinitionV1({
        taskDefinitionId: stage.taskDefinitionId,
        version: stage.taskDefinitionVersion,
        name: stage.name,
        handlerKey: `handler:${stage.stageId}`,
        handlerDigest: digestWorkflowJsonV1(
          "conformance-handler",
          stage.stageId,
        ),
        effectClass: "internal",
      }),
    );
  }
  await runtime.store.registerProcessDefinition(
    "tenant:conformance",
    definition,
  );
}

function process(
  id: string,
  stages: ProcessDefinitionV1["stages"],
): ProcessDefinitionV1 {
  return createProcessDefinitionV1({
    processId: `process:${id}`,
    version: "1",
    name: id,
    stages,
  });
}

function task(
  stageId: string,
  dependsOn: ProcessDefinitionV1["stages"][number]["dependsOn"] = [],
  extra: { readonly compensationForStageId?: string } = {},
) {
  return {
    schemaVersion: 1 as const,
    stageId,
    name: stageId,
    kind: "task" as const,
    taskDefinitionId: `task:${stageId}`,
    taskDefinitionVersion: "1",
    dependsOn,
    ...extra,
  };
}

function wait(stageId: string, durationMs: number) {
  return {
    schemaVersion: 1 as const,
    stageId,
    name: stageId,
    kind: "wait" as const,
    durationMs,
    dependsOn: [],
  };
}

function signalStage(
  stageId: string,
  dependsOn: ProcessDefinitionV1["stages"][number]["dependsOn"] = [],
) {
  return {
    schemaVersion: 1 as const,
    stageId,
    name: stageId,
    kind: "await_signal" as const,
    signalType: "fact.available",
    dependsOn,
  };
}

function start(id: string) {
  return {
    tenantId: "tenant:conformance",
    runId: `run:${id}`,
    processId: `process:${id}`,
    processVersion: "1",
    operationId: `operation:start:${id}`,
    idempotencyKey: `start:${id}`,
    logicalTime: "2026-08-28T12:00:00.000Z",
  };
}

function signalInput(id: string, logicalTime: string) {
  return {
    tenantId: "tenant:conformance",
    runId: `run:${id}`,
    operationId: `operation:signal:${id}`,
    idempotencyKey: `signal:${id}`,
    logicalTime,
    signal: {
      signalId: `signal:${id}`,
      signalType: "fact.available",
      sourceType: "conformance",
      sourceId: "source:conformance",
      receivedAt: logicalTime,
    },
  };
}

function advance(id: string, suffix: string, logicalTime: string) {
  return {
    tenantId: "tenant:conformance",
    runId: `run:${id}`,
    operationId: `operation:advance:${id}:${suffix}`,
    idempotencyKey: `advance:${id}:${suffix}`,
    logicalTime,
  };
}

function validateOptions(
  options: WorkflowConformanceOptionsV1,
): ValidatedOptions {
  required(options.implementationId, "implementationId");
  required(options.implementationVersion, "implementationVersion");
  if (!/^sha256:[0-9a-f]{64}$/u.test(options.implementationDigest))
    throw new TypeError("workflow_conformance_implementation_digest_invalid");
  if (
    !Array.isArray(options.capabilities) ||
    new Set(options.capabilities).size !== options.capabilities.length ||
    options.capabilities.some((capability) => !capabilities.has(capability))
  )
    throw new TypeError("workflow_conformance_capabilities_invalid");
  const sorted = [...options.capabilities].sort(compareAscii);
  if (
    sorted.some(
      (capability, index) => capability !== options.capabilities[index],
    )
  )
    throw new TypeError("workflow_conformance_capabilities_unsorted");
  if (!Number.isSafeInteger(options.seed) || options.seed < 0)
    throw new RangeError("workflow_conformance_seed_invalid");
  const caseTimeoutMs = options.caseTimeoutMs ?? 10_000;
  if (
    !Number.isSafeInteger(caseTimeoutMs) ||
    caseTimeoutMs < 100 ||
    caseTimeoutMs > 120_000
  )
    throw new RangeError("workflow_conformance_timeout_invalid");
  if (
    options.capabilities.includes("persistence.restart") &&
    options.destructiveTestConsent !== true
  )
    throw new TypeError("workflow_conformance_destructive_consent_required");
  if (!options.factory?.create)
    throw new TypeError("workflow_conformance_factory_invalid");
  return {
    ...options,
    capabilities: Object.freeze(sorted),
    caseTimeoutMs,
  };
}

function timestamp(value: Date, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new TypeError(`${label} is invalid`);
  return value.toISOString();
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  abort: AbortController,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          abort.abort();
          reject(new ConformanceTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function equal(left: unknown, right: unknown, code: string): void {
  if (left !== right) throw new ConformanceAssertionError(code);
}

function deepEqual(left: unknown, right: unknown, code: string): void {
  if (JSON.stringify(left) !== JSON.stringify(right))
    throw new ConformanceAssertionError(code);
}

function truthy(value: unknown, code: string): asserts value {
  if (!value) throw new ConformanceAssertionError(code);
}

function required(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160)
    throw new TypeError(`workflow_conformance_${label}_invalid`);
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

class ConformanceAssertionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class ConformanceTimeoutError extends Error {}

type ValidatedOptions = WorkflowConformanceOptionsV1 & {
  readonly capabilities: readonly WorkflowConformanceCapabilityV1[];
  readonly caseTimeoutMs: number;
};
