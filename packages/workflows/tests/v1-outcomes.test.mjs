import assert from "node:assert/strict";
import test from "node:test";

import {
  createProcessDefinitionV1,
  createTaskDefinitionV1,
  digestWorkflowJsonV1,
  InMemoryProcessRunnerV1,
  InMemoryWorkflowStoreV1,
  reconcileIndeterminateTaskRunV1,
  sumTaskUsageV1,
  WorkflowValidationErrorV1,
} from "../dist/index.js";
import {
  InMemoryTaskOutcomeStoreV1,
  WorkflowOutcomeRuntimeV1,
} from "../dist/v1-outcomes.js";

const taskFinishedAt = "2026-08-01T12:00:00.000Z";
const outcomeTime = "2026-08-20T12:00:00.000Z";

function taskDefinition() {
  return createTaskDefinitionV1({
    taskDefinitionId: "task:evaluate",
    version: "1",
    name: "Evaluate",
    handlerKey: "handler:evaluate",
    handlerDigest: digestWorkflowJsonV1("test-handler", "evaluate-v1"),
    effectClass: "internal",
  });
}

function processDefinition() {
  return createProcessDefinitionV1({
    processId: "process:evaluate",
    version: "1",
    name: "Evaluation process",
    stages: [
      {
        schemaVersion: 1,
        stageId: "evaluate",
        name: "Evaluate",
        kind: "task",
        taskDefinitionId: "task:evaluate",
        taskDefinitionVersion: "1",
        dependsOn: [],
      },
    ],
  });
}

async function runtimeFixture() {
  const store = new InMemoryWorkflowStoreV1();
  const runner = new InMemoryProcessRunnerV1(store, {
    taskBindingResolver: {
      async resolve() {
        return {
          promptRevision: "prompt:7",
          promptDigest: digestWorkflowJsonV1("test-prompt", "prompt:7"),
          modelProvider: "provider-a",
          modelName: "model-a",
          modelRevision: "model:3",
          modelConfigurationDigest: digestWorkflowJsonV1(
            "test-model-config",
            "model:3",
          ),
          policyDigest: digestWorkflowJsonV1("test-policy", "policy:2"),
          toolsetDigest: digestWorkflowJsonV1("test-toolset", "toolset:4"),
          runtimeImplementationDigest: digestWorkflowJsonV1(
            "test-runtime",
            "runtime:1",
          ),
        };
      },
    },
    taskExecutor: {
      async execute() {
        return {
          status: "completed",
          result: { accepted: true },
          resultReference: "artifact:result-a",
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            durationMs: 25,
            cost: { currency: "USD", micros: 125 },
          },
        };
      },
    },
  });
  await runner.registerTaskDefinition("tenant-a", taskDefinition());
  await runner.registerProcessDefinition("tenant-a", processDefinition());
  return { store, runner };
}

test("runner persists exact task bindings, usage and result digest", async () => {
  const { store, runner } = await runtimeFixture();
  const result = await runner.start({
    tenantId: "tenant-a",
    runId: "run-a",
    processId: "process:evaluate",
    processVersion: "1",
    operationId: "operation:start-a",
    idempotencyKey: "start-a",
    input: { item: "opaque-a" },
    subject: { subjectType: "case", subjectId: "case-a" },
    logicalTime: taskFinishedAt,
  });
  assert.equal(result.run.status, "completed");
  const [taskRun] = await store.listTaskRuns({ tenantId: "tenant-a" });
  assert.equal(taskRun.status, "completed");
  assert.equal(taskRun.binding.promptRevision, "prompt:7");
  assert.equal(taskRun.binding.modelRevision, "model:3");
  assert.match(taskRun.binding.bindingDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(taskRun.usage.totalTokens, 15);
  assert.equal(taskRun.subject.subjectId, "case-a");
  assert.match(taskRun.resultDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    (
      await store.findTaskRunByIdempotencyKey(
        "tenant-a",
        "workflow-task:tenant-a:run-a:evaluate:1",
      )
    ).taskRunId,
    taskRun.taskRunId,
  );
});

test("usage aggregation preserves currency partitions and rejects bad totals", () => {
  assert.deepEqual(
    sumTaskUsageV1([
      {
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
        durationMs: 10,
        cost: { currency: "USD", micros: 20 },
      },
      {
        inputTokens: 1,
        outputTokens: 3,
        totalTokens: 4,
        durationMs: 5,
        cost: { currency: "EUR", micros: 7 },
      },
      { cost: { currency: "USD", micros: 2 } },
    ]),
    {
      inputTokens: 5,
      outputTokens: 5,
      totalTokens: 10,
      durationMs: 15,
      costs: [
        { currency: "EUR", micros: 7 },
        { currency: "USD", micros: 22 },
      ],
    },
  );
  assert.throws(
    () =>
      sumTaskUsageV1([{ inputTokens: 2, outputTokens: 3, totalTokens: 99 }]),
    /totalTokens/u,
  );
});

test("delayed outcomes bind the original execution and aggregate by version", async () => {
  const { store, runner } = await runtimeFixture();
  await runner.start({
    tenantId: "tenant-a",
    runId: "run-a",
    processId: "process:evaluate",
    processVersion: "1",
    operationId: "operation:start-a",
    idempotencyKey: "start-a",
    subject: { subjectType: "case", subjectId: "case-a" },
    logicalTime: taskFinishedAt,
  });
  const [taskRun] = await store.listTaskRuns({ tenantId: "tenant-a" });
  const outcomeStore = new InMemoryTaskOutcomeStoreV1();
  const outcomes = new WorkflowOutcomeRuntimeV1(store, outcomeStore);
  const recorded = await outcomes.record({
    tenantId: "tenant-a",
    outcomeId: "outcome-a",
    taskRunId: taskRun.taskRunId,
    taskExecutionBindingDigest: taskRun.binding.bindingDigest,
    outcomeType: "quality.verdict",
    verdict: "positive",
    reasonCode: "accepted",
    scoreBasisPoints: 9_000,
    sourceType: "human",
    sourceId: "reviewer-a",
    observedAt: outcomeTime,
    recordedAt: outcomeTime,
    evidenceReferenceIds: ["artifact:review-a"],
  });
  assert.equal(recorded.disposition, "created");
  assert.equal(
    (
      await outcomes.record({
        tenantId: "tenant-a",
        outcomeId: "outcome-a",
        taskRunId: taskRun.taskRunId,
        taskExecutionBindingDigest: taskRun.binding.bindingDigest,
        outcomeType: "quality.verdict",
        verdict: "positive",
        reasonCode: "accepted",
        scoreBasisPoints: 9_000,
        sourceType: "human",
        sourceId: "reviewer-a",
        observedAt: outcomeTime,
        recordedAt: outcomeTime,
        evidenceReferenceIds: ["artifact:review-a"],
      })
    ).disposition,
    "replayed",
  );
  assert.deepEqual(
    await outcomes.summarize({
      tenantId: "tenant-a",
      groupBy: "prompt_revision",
      outcomeType: "quality.verdict",
    }),
    [
      {
        key: "prompt:7",
        total: 1,
        positive: 1,
        negative: 0,
        corrected: 0,
        inconclusive: 0,
        scored: 1,
        scoreBasisPointsSum: 9_000,
      },
    ],
  );
  assert.equal(
    (
      await outcomes.coverage({
        tenantId: "tenant-a",
        logicalTime: outcomeTime,
        bindingDigest: taskRun.binding.bindingDigest,
        policy: {
          outcomeType: "quality.verdict",
          windowMs: 30 * 24 * 60 * 60 * 1_000,
          minimumConcludedOutcomes: 1,
          maximumObservationLagMs: 24 * 60 * 60 * 1_000,
          maximumUnresolvedBasisPoints: 0,
        },
      })
    ).status,
    "healthy",
  );
});

test("outcomes reject binding substitution and stale coverage detects silence", async () => {
  const { store, runner } = await runtimeFixture();
  await runner.start({
    tenantId: "tenant-a",
    runId: "run-a",
    processId: "process:evaluate",
    processVersion: "1",
    operationId: "operation:start-a",
    idempotencyKey: "start-a",
    logicalTime: taskFinishedAt,
  });
  const [taskRun] = await store.listTaskRuns({ tenantId: "tenant-a" });
  const outcomes = new WorkflowOutcomeRuntimeV1(store);
  await assert.rejects(
    outcomes.record({
      tenantId: "tenant-a",
      outcomeId: "outcome-a",
      taskRunId: taskRun.taskRunId,
      taskExecutionBindingDigest: digestWorkflowJsonV1(
        "wrong-binding",
        "wrong",
      ),
      outcomeType: "quality.verdict",
      verdict: "negative",
      sourceType: "environment",
      sourceId: "environment-a",
      observedAt: outcomeTime,
      recordedAt: outcomeTime,
      evidenceReferenceIds: [],
    }),
    /binding does not match/u,
  );
  const coverage = await outcomes.coverage({
    tenantId: "tenant-a",
    logicalTime: outcomeTime,
    policy: {
      outcomeType: "quality.verdict",
      windowMs: 30 * 24 * 60 * 60 * 1_000,
      minimumConcludedOutcomes: 1,
      maximumObservationLagMs: 24 * 60 * 60 * 1_000,
      maximumUnresolvedBasisPoints: 0,
    },
  });
  assert.equal(coverage.status, "stale");
  assert.equal(coverage.reasonCode, "outcome_signal_stale");
});

test("protected executor uncertainty is retained as indeterminate", async () => {
  const store = new InMemoryWorkflowStoreV1();
  const runner = new InMemoryProcessRunnerV1(store, {
    protectedTaskExecutor: {
      async execute() {
        throw new Error("response lost");
      },
    },
  });
  const protectedTask = createTaskDefinitionV1({
    taskDefinitionId: "task:protected",
    version: "1",
    name: "Protected",
    handlerKey: "handler:protected",
    handlerDigest: digestWorkflowJsonV1("test-handler", "protected"),
    effectClass: "protected_external",
    actionBinding: {
      namespace: "neutral",
      toolId: "provider",
      operation: "apply",
    },
  });
  const process = createProcessDefinitionV1({
    processId: "process:protected",
    version: "1",
    name: "Protected process",
    stages: [
      {
        schemaVersion: 1,
        stageId: "protected",
        name: "Protected",
        kind: "task",
        taskDefinitionId: "task:protected",
        taskDefinitionVersion: "1",
        retryPolicy: { maximumAttempts: 3 },
        dependsOn: [],
      },
    ],
  });
  await runner.registerTaskDefinition("tenant-a", protectedTask);
  await runner.registerProcessDefinition("tenant-a", process);
  const result = await runner.start({
    tenantId: "tenant-a",
    runId: "run-protected",
    processId: "process:protected",
    processVersion: "1",
    operationId: "operation:protected",
    idempotencyKey: "protected",
    logicalTime: taskFinishedAt,
  });
  assert.equal(result.run.status, "waiting");
  const [taskRun] = await store.listTaskRuns({ tenantId: "tenant-a" });
  assert.equal(taskRun.status, "indeterminate");
  assert.equal(taskRun.reasonCode, "protected_task_executor_error");
  assert.equal(taskRun.attempt, 1);
  const reconciled = reconcileIndeterminateTaskRunV1(taskRun, {
    status: "completed",
    logicalTime: "2026-08-01T12:00:01.000Z",
    resultDigest: digestWorkflowJsonV1("test-result", "reconciled"),
  });
  assert.equal(
    await store.compareAndSetTaskRun({
      expectedRevision: taskRun.revision,
      expectedStateDigest: taskRun.stateDigest,
      run: reconciled,
    }),
    true,
  );
  assert.equal(
    (
      await runner.advance({
        tenantId: "tenant-a",
        runId: "run-protected",
        operationId: "operation:reconcile",
        idempotencyKey: "reconcile",
        logicalTime: "2026-08-01T12:00:01.000Z",
      })
    ).run.status,
    "completed",
  );
});

test("coverage reports unavailable without widening missing evidence", async () => {
  const outcomes = new WorkflowOutcomeRuntimeV1({
    async getTaskRun() {
      throw new Error("unavailable");
    },
    async listTaskRuns() {
      throw new Error("unavailable");
    },
  });
  const result = await outcomes.coverage({
    tenantId: "tenant-a",
    logicalTime: outcomeTime,
    policy: {
      outcomeType: "quality.verdict",
      windowMs: 30 * 24 * 60 * 60 * 1_000,
      minimumConcludedOutcomes: 1,
      maximumObservationLagMs: 24 * 60 * 60 * 1_000,
      maximumUnresolvedBasisPoints: 0,
    },
  });
  assert.deepEqual(result, {
    status: "unavailable",
    eligibleTaskRuns: 0,
    concludedOutcomes: 0,
    unresolvedTaskRuns: 0,
    unresolvedBasisPoints: 10_000,
    latestObservedAt: null,
    reasonCode: "outcome_store_unavailable",
  });
});
