import assert from "node:assert/strict";
import test from "node:test";

import {
  createProcessDefinitionV1,
  createTaskDefinitionV1,
  digestWorkflowJsonV1,
  InMemoryProcessRunnerV1,
  InMemoryProcessWorkerV1,
  InMemoryWorkflowStoreV1,
  WorkflowValidationErrorV1,
} from "../dist/index.js";

const firstTime = "2026-08-28T12:00:00.000Z";
const secondTime = "2026-08-28T12:00:01.000Z";

function task(stageId, dependsOn = [], extra = {}) {
  return {
    schemaVersion: 1,
    stageId,
    name: stageId,
    kind: "task",
    taskDefinitionId: `task:${stageId}`,
    taskDefinitionVersion: "1",
    dependsOn,
    ...extra,
  };
}

function startInput(overrides = {}) {
  return {
    tenantId: "tenant-a",
    runId: "run-a",
    processId: "process-a",
    processVersion: "1",
    operationId: "operation:start-a",
    idempotencyKey: "start-a",
    logicalTime: firstTime,
    ...overrides,
  };
}

function taskExecutor(calls = []) {
  return {
    async execute(input) {
      calls.push({
        stageId: input.stage.stageId,
        idempotencyKey: input.idempotencyKey,
      });
      return { status: "completed" };
    },
  };
}

async function registerProcess(runner, definition) {
  for (const stage of definition.stages) {
    if (stage.kind !== "task") continue;
    await runner.registerTaskDefinition(
      "tenant-a",
      createTaskDefinitionV1({
        taskDefinitionId: stage.taskDefinitionId,
        version: stage.taskDefinitionVersion,
        name: stage.name,
        handlerKey: `handler:${stage.stageId}`,
        handlerDigest: digestWorkflowJsonV1("test-handler", stage.stageId),
        effectClass: "internal",
      }),
    );
  }
  await runner.registerProcessDefinition("tenant-a", definition);
}

test("V1 definition validation freezes a canonical DAG and rejects cycles", () => {
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Neutral process",
    stages: [
      task("first"),
      task("second", [{ stageId: "first", outcomes: ["succeeded"] }]),
    ],
  });

  assert.match(definition.definitionDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(Object.isFrozen(definition.stages), true);

  assert.throws(
    () =>
      createProcessDefinitionV1({
        processId: "cyclic",
        version: "1",
        name: "Cyclic process",
        stages: [
          task("first", [{ stageId: "second", outcomes: ["succeeded"] }]),
          task("second", [{ stageId: "first", outcomes: ["succeeded"] }]),
        ],
      }),
    (error) =>
      error instanceof WorkflowValidationErrorV1 &&
      error.message.includes("cycle"),
  );
});

test("definition limits reject excessive fan-out and gate duration", () => {
  assert.throws(
    () =>
      createProcessDefinitionV1({
        processId: "fanout",
        version: "1",
        name: "Fanout",
        limits: { maximumDependentsPerStage: 1 },
        stages: [
          task("root"),
          task("left", [{ stageId: "root", outcomes: ["succeeded"] }]),
          task("right", [{ stageId: "root", outcomes: ["succeeded"] }]),
        ],
      }),
    /fan-out/u,
  );
  assert.throws(
    () =>
      createProcessDefinitionV1({
        processId: "gate-duration",
        version: "1",
        name: "Gate duration",
        limits: { maximumGateDurationMs: 1_000 },
        stages: [
          {
            schemaVersion: 1,
            stageId: "gate",
            name: "Gate",
            kind: "gate",
            gateType: "test.gate",
            gateDefinitionId: "gate",
            expiresInMs: 1_001,
            dependsOn: [],
          },
        ],
      }),
    /gate duration/u,
  );
});

test("protected external task definitions require an action binding", () => {
  assert.throws(
    () =>
      createTaskDefinitionV1({
        taskDefinitionId: "task:protected",
        version: "1",
        name: "Protected task",
        handlerKey: "protected-handler",
        handlerDigest: digestWorkflowJsonV1(
          "test-handler",
          "protected-handler",
        ),
        effectClass: "protected_external",
      }),
    /requires an action binding/u,
  );

  const definition = createTaskDefinitionV1({
    taskDefinitionId: "task:protected",
    version: "1",
    name: "Protected task",
    handlerKey: "protected-handler",
    handlerDigest: digestWorkflowJsonV1("test-handler", "protected-handler"),
    effectClass: "protected_external",
    actionBinding: {
      namespace: "neutral",
      toolId: "provider",
      operation: "apply",
    },
  });
  assert.match(definition.definitionDigest, /^sha256:/u);
});

test("protected tasks require the separately composed protected executor", async () => {
  const taskDefinition = createTaskDefinitionV1({
    taskDefinitionId: "task:protected",
    version: "1",
    name: "Protected task",
    handlerKey: "protected-handler",
    handlerDigest: digestWorkflowJsonV1("test-handler", "protected-handler"),
    effectClass: "protected_external",
    actionBinding: {
      namespace: "neutral",
      toolId: "provider",
      operation: "apply",
    },
  });
  const processDefinition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Protected process",
    stages: [
      task("protected", [], {
        taskDefinitionId: "task:protected",
      }),
    ],
  });
  const unprotectedRunner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: taskExecutor(),
  });
  await unprotectedRunner.registerTaskDefinition("tenant-a", taskDefinition);
  await unprotectedRunner.registerProcessDefinition(
    "tenant-a",
    processDefinition,
  );
  await assert.rejects(
    unprotectedRunner.start(startInput()),
    /protected task executor is required/u,
  );

  const protectedCalls = [];
  const protectedRunner = new InMemoryProcessRunnerV1(undefined, {
    protectedTaskExecutor: taskExecutor(protectedCalls),
  });
  await protectedRunner.registerTaskDefinition("tenant-a", taskDefinition);
  await protectedRunner.registerProcessDefinition(
    "tenant-a",
    processDefinition,
  );
  assert.equal(
    (await protectedRunner.start(startInput())).run.status,
    "completed",
  );
  assert.deepEqual(
    protectedCalls.map((call) => call.stageId),
    ["protected"],
  );
});

test("runner waits for a signal, resumes once and preserves stable task identities", async () => {
  const calls = [];
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Signal process",
    stages: [
      task("prepare"),
      {
        schemaVersion: 1,
        stageId: "wait-for-fact",
        name: "Wait for fact",
        kind: "await_signal",
        signalType: "fact.available",
        dependsOn: [{ stageId: "prepare", outcomes: ["succeeded"] }],
      },
      task("finish", [
        { stageId: "wait-for-fact", outcomes: ["signal_received"] },
      ]),
    ],
  });
  const runner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: taskExecutor(calls),
  });
  await registerProcess(runner, definition);

  const started = await runner.start(startInput());
  assert.equal(started.run.status, "waiting");
  assert.deepEqual(
    calls.map((call) => call.stageId),
    ["prepare"],
  );

  const signaled = await runner.signal({
    tenantId: "tenant-a",
    runId: "run-a",
    operationId: "operation:signal-a",
    idempotencyKey: "signal-a",
    logicalTime: secondTime,
    signal: {
      signalId: "signal-a",
      signalType: "fact.available",
      sourceType: "test",
      sourceId: "source-a",
      receivedAt: secondTime,
    },
  });
  assert.equal(signaled.run.status, "completed");
  assert.deepEqual(
    calls.map((call) => call.stageId),
    ["prepare", "finish"],
  );
  assert.deepEqual(
    calls.map((call) => call.idempotencyKey),
    [
      "workflow-task:tenant-a:run-a:prepare:1",
      "workflow-task:tenant-a:run-a:finish:1",
    ],
  );

  const replay = await runner.signal({
    tenantId: "tenant-a",
    runId: "run-a",
    operationId: "operation:signal-a",
    idempotencyKey: "signal-a",
    logicalTime: secondTime,
    signal: {
      signalId: "signal-a",
      signalType: "fact.available",
      sourceType: "test",
      sourceId: "source-a",
      receivedAt: secondTime,
    },
  });
  assert.equal(replay.disposition, "replayed");
  assert.equal(calls.length, 2);
});

test("idempotent start replays exact input and rejects conflicting reuse", async () => {
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Single task",
    stages: [task("only")],
  });
  const runner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: taskExecutor(),
  });
  await registerProcess(runner, definition);
  assert.equal((await runner.start(startInput())).disposition, "applied");
  assert.equal((await runner.start(startInput())).disposition, "replayed");
  await assert.rejects(
    runner.start(startInput({ input: { changed: true } })),
    /idempotency identity conflicts/u,
  );
});

test("wait stage advances only after its deadline", async () => {
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Timer process",
    stages: [
      {
        schemaVersion: 1,
        stageId: "timer",
        name: "Timer",
        kind: "wait",
        durationMs: 1_000,
        dependsOn: [],
      },
    ],
  });
  const runner = new InMemoryProcessRunnerV1();
  await registerProcess(runner, definition);
  assert.equal((await runner.start(startInput())).run.status, "waiting");
  assert.equal(
    (
      await runner.advance({
        tenantId: "tenant-a",
        runId: "run-a",
        operationId: "operation:advance-a",
        idempotencyKey: "advance-a",
        logicalTime: "2026-08-28T12:00:00.999Z",
      })
    ).run.status,
    "waiting",
  );
  assert.equal(
    (
      await runner.advance({
        tenantId: "tenant-a",
        runId: "run-a",
        operationId: "operation:advance-b",
        idempotencyKey: "advance-b",
        logicalTime: secondTime,
      })
    ).run.status,
    "completed",
  );
});

test("bounded local worker discovers and advances runnable processes", async () => {
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Worker timer",
    stages: [
      {
        schemaVersion: 1,
        stageId: "timer",
        name: "Timer",
        kind: "wait",
        durationMs: 1_000,
        dependsOn: [],
      },
    ],
  });
  const store = new InMemoryWorkflowStoreV1();
  const runner = new InMemoryProcessRunnerV1(store);
  const worker = new InMemoryProcessWorkerV1(store, runner);
  await registerProcess(runner, definition);
  assert.equal((await runner.start(startInput())).run.status, "waiting");
  const result = await worker.runOnce({ logicalTime: secondTime, limit: 10 });
  assert.deepEqual(result, { inspected: 1, advancedRunIds: ["run-a"] });
  assert.equal(
    (await runner.describe({ tenantId: "tenant-a", runId: "run-a" })).status,
    "completed",
  );
  await runner.start(
    startInput({
      runId: "run-b",
      operationId: "operation:start-b",
      idempotencyKey: "start-b",
    }),
  );
  await worker.drain();
  assert.deepEqual(await worker.runOnce({ logicalTime: secondTime }), {
    inspected: 0,
    advancedRunIds: [],
  });
});

test("gate rejection selects only its matching DAG branch", async () => {
  const calls = [];
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Gate process",
    stages: [
      {
        schemaVersion: 1,
        stageId: "review",
        name: "Review",
        kind: "gate",
        gateType: "test.gate",
        gateDefinitionId: "gate-a",
        dependsOn: [],
      },
      task("approved-path", [{ stageId: "review", outcomes: ["approved"] }]),
      task("rejected-path", [{ stageId: "review", outcomes: ["rejected"] }]),
    ],
  });
  const runner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: taskExecutor(calls),
    gateProvider: {
      async resolve() {
        return { status: "rejected", gateRequestId: "gate-request-a" };
      },
    },
  });
  await registerProcess(runner, definition);
  const result = await runner.start(startInput());
  assert.equal(result.run.status, "completed");
  assert.deepEqual(
    calls.map((call) => call.stageId),
    ["rejected-path"],
  );
  assert.equal(
    result.run.stageStates.find((stage) => stage.stageId === "approved-path")
      .outcome,
    "skipped",
  );
});

test("gate expiry performs one final provider check and then fails closed", async () => {
  let gateCalls = 0;
  const taskCalls = [];
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Expiring gate",
    stages: [
      {
        schemaVersion: 1,
        stageId: "review",
        name: "Review",
        kind: "gate",
        gateType: "test.gate",
        gateDefinitionId: "gate-a",
        expiresInMs: 1_000,
        dependsOn: [],
      },
      task("expired-path", [{ stageId: "review", outcomes: ["expired"] }]),
    ],
  });
  const runner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: taskExecutor(taskCalls),
    gateProvider: {
      async resolve() {
        gateCalls += 1;
        return { status: "waiting", gateRequestId: "gate-request-a" };
      },
    },
  });
  await registerProcess(runner, definition);
  assert.equal((await runner.start(startInput())).run.status, "waiting");
  const expired = await runner.advance({
    tenantId: "tenant-a",
    runId: "run-a",
    operationId: "operation:expire",
    idempotencyKey: "expire",
    logicalTime: secondTime,
  });
  assert.equal(expired.run.status, "completed");
  assert.equal(gateCalls, 3);
  assert.deepEqual(
    taskCalls.map((call) => call.stageId),
    ["expired-path"],
  );
});

test("cancellation prevents pending work and compensates succeeded tasks once", async () => {
  const calls = [];
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Cancelable process",
    stages: [
      task("applied"),
      {
        schemaVersion: 1,
        stageId: "wait",
        name: "Wait",
        kind: "await_signal",
        signalType: "continue",
        dependsOn: [{ stageId: "applied", outcomes: ["succeeded"] }],
      },
      task("later", [{ stageId: "wait", outcomes: ["signal_received"] }]),
      task("compensate", [], { compensationForStageId: "applied" }),
    ],
  });
  const runner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: taskExecutor(calls),
  });
  await registerProcess(runner, definition);
  assert.equal((await runner.start(startInput())).run.status, "waiting");
  const canceled = await runner.cancel({
    tenantId: "tenant-a",
    runId: "run-a",
    operationId: "operation:cancel",
    idempotencyKey: "cancel",
    reasonCode: "caller_requested",
    logicalTime: secondTime,
  });
  assert.equal(canceled.run.status, "canceled");
  assert.deepEqual(
    calls.map((call) => call.stageId),
    ["applied", "compensate"],
  );
  assert.equal(
    canceled.run.stageStates.find((stage) => stage.stageId === "later").outcome,
    "canceled",
  );
  const replay = await runner.cancel({
    tenantId: "tenant-a",
    runId: "run-a",
    operationId: "operation:cancel",
    idempotencyKey: "cancel",
    reasonCode: "caller_requested",
    logicalTime: secondTime,
  });
  assert.equal(replay.disposition, "replayed");
  assert.equal(calls.length, 2);
});

test("inactive compensation stages do not fail a successful normal run", async () => {
  const calls = [];
  const definition = createProcessDefinitionV1({
    processId: "process-normal-with-compensation",
    version: "1",
    name: "Normal process with dormant compensation",
    stages: [
      task("applied"),
      task("complete", [{ stageId: "applied", outcomes: ["succeeded"] }]),
      task("compensate", [], { compensationForStageId: "applied" }),
    ],
  });
  const runner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: taskExecutor(calls),
  });
  await registerProcess(runner, definition);
  const result = await runner.start(
    startInput({ processId: definition.processId }),
  );
  assert.equal(result.run.status, "completed");
  assert.deepEqual(
    calls.map((call) => call.stageId),
    ["applied", "complete"],
  );
  assert.equal(
    result.run.stageStates.find(({ stageId }) => stageId === "compensate")
      .status,
    "blocked",
  );
});

test("expired task lease takeover fences the old worker and preserves one settlement", async () => {
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Lease takeover",
    stages: [task("effect")],
  });
  const store = new InMemoryWorkflowStoreV1();
  let reportOldStarted;
  const oldStarted = new Promise((resolve) => {
    reportOldStarted = resolve;
  });
  let releaseOld;
  const oldRelease = new Promise((resolve) => {
    releaseOld = resolve;
  });
  let oldHeartbeatResult;
  let oldSignalAborted;
  const oldRunner = new InMemoryProcessRunnerV1(store, {
    workerId: "worker-old",
    taskLeaseDurationMs: 1_000,
    taskExecutor: {
      async execute(input) {
        reportOldStarted();
        await oldRelease;
        oldHeartbeatResult = await input.heartbeat({
          logicalTime: "2026-08-28T12:00:01.000Z",
        });
        oldSignalAborted = input.signal.aborted;
        return { status: "completed", result: { owner: "old" } };
      },
    },
  });
  await registerProcess(oldRunner, definition);
  const oldOutcome = oldRunner.start(startInput()).then(
    () => null,
    (error) => error,
  );
  await oldStarted;

  const newCalls = [];
  const newRunner = new InMemoryProcessRunnerV1(store, {
    workerId: "worker-new",
    taskLeaseDurationMs: 1_000,
    taskExecutor: {
      async execute(input) {
        newCalls.push(input.lease);
        return { status: "completed", result: { owner: "new" } };
      },
    },
  });
  const takeover = await newRunner.advance({
    tenantId: "tenant-a",
    runId: "run-a",
    operationId: "operation:takeover",
    idempotencyKey: "takeover",
    logicalTime: "2026-08-28T12:00:01.000Z",
  });
  assert.equal(takeover.run.status, "completed");
  assert.equal(newCalls.length, 1);
  assert.equal(newCalls[0].ownerId, "worker-new");
  assert.equal(newCalls[0].generation, 1);

  releaseOld();
  assert.match((await oldOutcome).message, /changed concurrently/u);
  assert.equal(oldHeartbeatResult, false);
  assert.equal(oldSignalAborted, true);
  const [taskRun] = await store.listTaskRuns({ tenantId: "tenant-a" });
  assert.equal(taskRun.status, "completed");
  assert.equal(taskRun.leaseOwnerId, "worker-new");
  assert.equal(taskRun.leaseGeneration, 1);
});

test("task heartbeat renews the current lease before fenced settlement", async () => {
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Heartbeat",
    stages: [task("heartbeat")],
  });
  const store = new InMemoryWorkflowStoreV1();
  const runner = new InMemoryProcessRunnerV1(store, {
    workerId: "worker-heartbeat",
    taskLeaseDurationMs: 1_000,
    taskExecutor: {
      async execute(input) {
        assert.equal(
          await input.heartbeat({
            logicalTime: "2026-08-28T12:00:00.500Z",
          }),
          true,
        );
        assert.equal(input.signal.aborted, false);
        return { status: "completed" };
      },
    },
  });
  await registerProcess(runner, definition);
  assert.equal((await runner.start(startInput())).run.status, "completed");
  const [taskRun] = await store.listTaskRuns({ tenantId: "tenant-a" });
  assert.equal(taskRun.status, "completed");
  assert.equal(taskRun.revision, 3);
  assert.equal(taskRun.leaseExpiresAt, "2026-08-28T12:00:01.500Z");
  assert.equal(taskRun.finishedAt, "2026-08-28T12:00:00.500Z");
});

test("run duration and retained-operation ceilings fail closed", async () => {
  const definition = createProcessDefinitionV1({
    processId: "process-a",
    version: "1",
    name: "Bounded process",
    limits: {
      maximumRunDurationMs: 1_000,
      maximumRetainedOperations: 1,
    },
    stages: [
      {
        schemaVersion: 1,
        stageId: "timer",
        name: "Timer",
        kind: "wait",
        durationMs: 1_000,
        dependsOn: [],
      },
    ],
  });
  const runner = new InMemoryProcessRunnerV1();
  await runner.registerProcessDefinition("tenant-a", definition);
  assert.equal((await runner.start(startInput())).run.status, "waiting");
  await assert.rejects(
    runner.advance({
      tenantId: "tenant-a",
      runId: "run-a",
      operationId: "operation:over-limit",
      idempotencyKey: "over-limit",
      logicalTime: "2026-08-28T12:00:01.001Z",
    }),
    /retained operation limit/u,
  );

  const durationRunner = new InMemoryProcessRunnerV1();
  await durationRunner.registerProcessDefinition(
    "tenant-a",
    createProcessDefinitionV1({
      processId: "duration",
      version: "1",
      name: "Duration",
      limits: { maximumRunDurationMs: 1_000 },
      stages: [
        {
          schemaVersion: 1,
          stageId: "timer",
          name: "Timer",
          kind: "wait",
          durationMs: 1_000,
          dependsOn: [],
        },
      ],
    }),
  );
  await durationRunner.start(
    startInput({
      processId: "duration",
      runId: "run-duration",
      operationId: "operation:duration-start",
      idempotencyKey: "duration-start",
    }),
  );
  const timedOut = await durationRunner.advance({
    tenantId: "tenant-a",
    runId: "run-duration",
    operationId: "operation:duration-expired",
    idempotencyKey: "duration-expired",
    logicalTime: "2026-08-28T12:00:01.001Z",
  });
  assert.equal(timedOut.run.status, "failed");
  assert.equal(timedOut.run.stageStates[0].outcome, "timed_out");
});
