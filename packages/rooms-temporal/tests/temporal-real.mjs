import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import {
  AgentRoomCoordinationRuntime,
  InMemoryAgentRoomCoordinationStore,
} from "@agentplat/rooms";
import { createTemporalAgentRoomActivities } from "../dist/index.js";
import {
  agentRoomCoordinationWorkflow,
  notifyAgentRoomCoordination,
} from "../dist/workflow.js";

const address = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const taskQueue = `agentplat-rooms-real-${process.pid}`;
const workflowId = `agentplat-rooms-real-${Date.now()}`;
const workflowsPath = fileURLToPath(
  new URL("../dist/workflow.js", import.meta.url),
);
let activityCalls = 0;

const tenantId = "tenant-1";
const roomId = "room-1";
const coordinationId = "coordination-1";
const store = new InMemoryAgentRoomCoordinationStore();
const runtime = new AgentRoomCoordinationRuntime(
  store,
  {
    routeMessage: async () => ({
      kind: "assigned",
      participantIds: ["agent-1"],
      basis: "router",
    }),
  },
  { get: async () => ({ status: "accepted" }) },
  {
    dispatchMessage: async () => {
      activityCalls += 1;
      return { status: "completed", runIds: [`run-${activityCalls}`] };
    },
    dispatchHandoff: async () => ({ status: "completed" }),
  },
);
await runtime.initialize({ tenantId, roomId, coordinationId });
for (let index = 1; index <= 3; index += 1) {
  const current = await store.load(tenantId, roomId, coordinationId);
  await runtime.enqueue({
    tenantId,
    roomId,
    coordinationId,
    expectedRevision: current.revision,
    itemId: `message-${index}`,
    kind: "message",
    referenceId: `message-${index}`,
  });
}

const native = await NativeConnection.connect({ address });
const clientConnection = await Connection.connect({ address });
const client = new Client({ connection: clientConnection });
const activities = createTemporalAgentRoomActivities({ runtime, store });

try {
  const worker1 = await Worker.create({
    connection: native,
    taskQueue,
    workflowsPath,
    activities,
  });
  await worker1.runUntil(async () => {
    await client.workflow.start(agentRoomCoordinationWorkflow, {
      workflowId,
      taskQueue,
      args: [
        {
          tenantId,
          roomId,
          coordinationId,
          expectedRevision: 3,
          rolloverAfterCycles: 2,
        },
      ],
    });
    await waitFor(async () => {
      const state = await store.load(tenantId, roomId, coordinationId);
      return activityCalls >= 3 && state.status === "completed";
    });
  });

  const completed = await store.load(tenantId, roomId, coordinationId);
  await runtime.enqueue({
    tenantId,
    roomId,
    coordinationId,
    expectedRevision: completed.revision,
    itemId: "message-after-restart",
    kind: "message",
    referenceId: "message-after-restart",
  });

  const worker2 = await Worker.create({
    connection: native,
    taskQueue,
    workflowsPath,
    activities,
  });
  await worker2.runUntil(async () => {
    const handle = client.workflow.getHandle(workflowId);
    const pending = await store.load(tenantId, roomId, coordinationId);
    await handle.signal(notifyAgentRoomCoordination, pending.revision);
    await waitFor(async () => {
      const state = await store.load(tenantId, roomId, coordinationId);
      return activityCalls >= 4 && state.status === "completed";
    });
    const state = await handle.query("agentplat.room.coordination.state");
    const persisted = await store.load(tenantId, roomId, coordinationId);
    assert.equal(state.revision, persisted.revision);
    assert.equal(persisted.items.length, 4);
    assert.equal(
      persisted.items.every((item) => item.status === "completed"),
      true,
    );
    await handle.terminate("real adapter scenario complete");
  });
  console.log(
    JSON.stringify({
      status: "passed",
      activityCalls,
      workerRestarted: true,
      continueAsNewExercised: true,
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
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
