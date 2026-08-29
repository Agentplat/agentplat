import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import {
  InMemoryProcessRunnerV1,
  InMemoryWorkflowStoreV1,
  createProcessDefinitionV1,
} from "@agentplat/workflows";

import {
  TemporalProcessRunnerV1,
  TemporalWorkflowNotifierV1,
  createTemporalWorkflowActivitiesV1,
} from "../dist/index.js";

const address = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const taskQueue = `agentplat-workflows-real-${process.pid}`;
const workflowId = `agentplat-workflows-real-${Date.now()}`;
const workflowsPath = fileURLToPath(
  new URL("../dist/workflow.js", import.meta.url),
);
const tenantId = "tenant:temporal-real";
const runId = "run:temporal-real";
const store = new InMemoryWorkflowStoreV1();
const base = new InMemoryProcessRunnerV1(store);
const initialTime = new Date().toISOString();
await base.registerProcessDefinition(
  tenantId,
  createProcessDefinitionV1({
    processId: "process:temporal-real",
    version: "1",
    name: "Temporal real process",
    stages: [
      {
        schemaVersion: 1,
        stageId: "timer",
        name: "Timer",
        kind: "wait",
        durationMs: 2_000,
        dependsOn: [],
      },
      {
        schemaVersion: 1,
        stageId: "signal",
        name: "Signal",
        kind: "await_signal",
        signalType: "fact.available",
        dependsOn: [{ stageId: "timer", outcomes: ["succeeded"] }],
      },
    ],
  }),
);

const native = await NativeConnection.connect({ address });
const clientConnection = await Connection.connect({ address });
const client = new Client({ connection: clientConnection });
const notifier = new TemporalWorkflowNotifierV1({
  client,
  taskQueue,
  rolloverAfterCycles: 1,
  workflowId: () => workflowId,
});
const runner = new TemporalProcessRunnerV1(base, notifier);
let activityCalls = 0;
const delegated = createTemporalWorkflowActivitiesV1({ runner: base });
const activities = {
  async advanceProcess(input) {
    activityCalls += 1;
    return delegated.advanceProcess(input);
  },
};

try {
  const worker1 = await Worker.create({
    connection: native,
    taskQueue,
    workflowsPath,
    activities,
  });
  await worker1.runUntil(async () => {
    await runner.start({
      tenantId,
      runId,
      processId: "process:temporal-real",
      processVersion: "1",
      operationId: "operation:start",
      idempotencyKey: "start",
      logicalTime: initialTime,
    });
    await waitFor(async () => {
      const run = await store.getProcessRun(tenantId, runId);
      return (
        run?.status === "waiting" &&
        run.stageStates[0]?.outcome === "succeeded" &&
        run.stageStates[1]?.status === "waiting"
      );
    });
  });

  const worker2 = await Worker.create({
    connection: native,
    taskQueue,
    workflowsPath,
    activities,
  });
  await worker2.runUntil(async () => {
    const logicalTime = new Date().toISOString();
    const signaled = await runner.signal({
      tenantId,
      runId,
      operationId: "operation:signal",
      idempotencyKey: "signal",
      logicalTime,
      signal: {
        signalId: "signal:fact",
        signalType: "fact.available",
        sourceType: "test",
        sourceId: "source:temporal-real",
        receivedAt: logicalTime,
      },
    });
    assert.equal(signaled.run.status, "completed");
    await client.workflow.getHandle(workflowId).result();
  });

  const final = await store.getProcessRun(tenantId, runId);
  assert.equal(final.status, "completed");
  assert.equal(final.stageStates[1].outcome, "signal_received");
  assert.equal(activityCalls >= 2, true);
  console.log(
    JSON.stringify({
      status: "passed",
      activityCalls,
      workerRestarted: true,
      continueAsNewThreshold: 1,
      canonicalRevision: final.revision,
    }),
  );
} finally {
  await clientConnection.close();
  await native.close();
}

async function waitFor(predicate) {
  const deadline = Date.now() + 20_000;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Temporal scenario timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
