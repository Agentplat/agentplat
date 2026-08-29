import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryProcessRunnerV1,
  InMemoryWorkflowStoreV1,
  createProcessDefinitionV1,
} from "@agentplat/workflows";

import {
  TemporalProcessRunnerV1,
  TemporalWorkflowNotifierV1,
  TemporalWorkflowReconcilerV1,
  createTemporalWorkflowActivitiesV1,
} from "../dist/index.js";

const firstTime = "2026-08-28T12:00:00.000Z";

test("notifier uses stable signal-with-start without owning process state", async () => {
  const calls = [];
  const notifier = new TemporalWorkflowNotifierV1({
    client: {
      workflow: {
        async signalWithStart(...args) {
          calls.push(args);
        },
      },
    },
    taskQueue: "workflow-tests",
    rolloverAfterCycles: 12,
    maximumTransitionsPerCycle: 8,
  });
  await notifier.notify({
    tenantId: "tenant-a",
    runId: "run-a",
    expectedRevision: 4,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].taskQueue, "workflow-tests");
  assert.equal(calls[0][1].workflowId, "agentplat-workflow:tenant-a:run-a");
  assert.deepEqual(calls[0][1].signalArgs, [4]);
  assert.equal(calls[0][1].args[0].rolloverAfterCycles, 12);
  assert.equal(calls[0][1].args[0].maximumTransitionsPerCycle, 8);
});

test("mutation commits before notification failure and reconciler recovers it", async () => {
  const store = new InMemoryWorkflowStoreV1();
  const base = new InMemoryProcessRunnerV1(store);
  await base.registerProcessDefinition("tenant-a", waitDefinition());
  const failing = new TemporalProcessRunnerV1(
    base,
    new TemporalWorkflowNotifierV1({
      client: {
        workflow: {
          async signalWithStart() {
            throw new Error("Temporal unavailable");
          },
        },
      },
      taskQueue: "workflow-tests",
    }),
  );
  await assert.rejects(failing.start(startInput()), /Temporal unavailable/u);
  assert.equal(
    (await base.describe({ tenantId: "tenant-a", runId: "run-a" })).status,
    "waiting",
  );

  const notifications = [];
  const reconciler = new TemporalWorkflowReconcilerV1(
    store,
    new TemporalWorkflowNotifierV1({
      client: {
        workflow: {
          async signalWithStart(_workflow, options) {
            notifications.push(options);
          },
        },
      },
      taskQueue: "workflow-tests",
    }),
  );
  assert.deepEqual(await reconciler.reconcile(), {
    inspected: 1,
    notifiedRunIds: ["run-a"],
    failedRunIds: [],
  });
  assert.equal(notifications[0].args[0].expectedRevision, 1);
});

test("activity advances only canonical state and exposes the next durable wakeup", async () => {
  const store = new InMemoryWorkflowStoreV1();
  const runner = new InMemoryProcessRunnerV1(store);
  await runner.registerProcessDefinition("tenant-a", waitDefinition());
  const started = await runner.start(startInput());
  assert.equal(started.run.status, "waiting");
  const activities = createTemporalWorkflowActivitiesV1({ runner });
  const before = await activities.advanceProcess({
    tenantId: "tenant-a",
    runId: "run-a",
    expectedRevision: started.run.revision,
    operationId: "temporal:before",
    logicalTime: "2026-08-28T12:00:00.999Z",
    leaseToken: "lease:before",
  });
  assert.equal(before.status, "waiting");
  assert.equal(before.nextWakeupAt, "2026-08-28T12:00:01.000Z");
  const due = await activities.advanceProcess({
    tenantId: "tenant-a",
    runId: "run-a",
    expectedRevision: before.revision,
    operationId: "temporal:due",
    logicalTime: "2026-08-28T12:00:01.000Z",
    leaseToken: "lease:due",
  });
  assert.equal(due.status, "completed");
  assert.equal(due.terminal, true);
  assert.equal(due.nextWakeupAt, null);
});

test("terminal mutations still notify so an existing Temporal workflow can close", async () => {
  const store = new InMemoryWorkflowStoreV1();
  const runner = new InMemoryProcessRunnerV1(store);
  await runner.registerProcessDefinition("tenant-a", {
    ...createProcessDefinitionV1({
      processId: "process:terminal",
      version: "1",
      name: "Terminal",
      stages: [
        {
          schemaVersion: 1,
          stageId: "zero",
          name: "Zero wait",
          kind: "wait",
          durationMs: 1,
          dependsOn: [],
        },
      ],
    }),
  });
  await runner.start({
    ...startInput(),
    processId: "process:terminal",
  });
  const calls = [];
  const wrapped = new TemporalProcessRunnerV1(
    runner,
    new TemporalWorkflowNotifierV1({
      client: {
        workflow: {
          async signalWithStart(...args) {
            calls.push(args);
          },
        },
      },
      taskQueue: "workflow-tests",
    }),
  );
  const result = await wrapped.signal({
    tenantId: "tenant-a",
    runId: "run-a",
    operationId: "operation:irrelevant",
    idempotencyKey: "irrelevant",
    logicalTime: "2026-08-28T12:00:00.001Z",
    signal: {
      signalId: "irrelevant",
      signalType: "irrelevant",
      sourceType: "test",
      sourceId: "source",
      receivedAt: "2026-08-28T12:00:00.001Z",
    },
  });
  assert.equal(result.run.status, "completed");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1].signalArgs, [result.run.revision]);
});

function waitDefinition() {
  return createProcessDefinitionV1({
    processId: "process:wait",
    version: "1",
    name: "Wait",
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
}

function startInput() {
  return {
    tenantId: "tenant-a",
    runId: "run-a",
    processId: "process:wait",
    processVersion: "1",
    operationId: "operation:start",
    idempotencyKey: "start",
    logicalTime: firstTime,
  };
}
