import assert from "node:assert/strict";
import { AgentRoomCoordinationRuntime, RoomService } from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresAgentRoomCoordinationStore,
  PostgresRoomRepository,
} from "@agentplat/rooms-postgres";
import { DefaultAgentRuntime } from "@agentplat/runtime";
import { MockAgentProvider } from "@agentplat/runtime-mock";

const { RECOVERY_TENANT_ID: tenantId } = process.env;
assert.ok(tenantId, "Run through proposal-recovery.mjs");
const phase = process.argv[2];
const roomId = "proposal-recovery";
const coordinationId = "proposal-recovery-work";
const pool = createPostgresPool();
const store = new PostgresAgentRoomCoordinationStore(pool, {
  schema: process.env.RECOVERY_SCHEMA,
});
const runtime = new DefaultAgentRuntime();
runtime.registerProvider("mock", new MockAgentProvider());
const rooms = new RoomService({
  repository: new PostgresRoomRepository(pool, {
    schema: process.env.RECOVERY_SCHEMA,
  }),
  runtime,
});
try {
  const coordination = new AgentRoomCoordinationRuntime(
    store,
    {
      routeMessage: async () => ({
        kind: "assigned",
        participantIds: ["writer"],
        basis: "router",
      }),
    },
    {
      get: async () => {
        throw new Error("No handoff in this example");
      },
    },
    {
      dispatchMessage: async ({ operationId }) => {
        assert.equal(operationId, "proposal-recovery-work:message:proposal");
        let state = await rooms.getRoomState(tenantId, roomId);
        let run = state.runs.find(
          (r) => r.taskId === "draft" && r.status === "completed",
        );
        if (!run) run = await rooms.runTask(tenantId, roomId, "draft");
        if (phase === "first") {
          // The Room result is committed, but coordination has not acknowledged it.
          process.send({ ready: true, runId: run.id, operationId });
          await new Promise(() => {
            setInterval(() => {}, 1000);
          });
        }
        return { status: "completed", runIds: [run.id] };
      },
      dispatchHandoff: async () => {
        throw new Error("No handoff in this example");
      },
    },
  );
  if (phase === "first") {
    await rooms.createRoom(tenantId, {
      id: roomId,
      title: "Recover a proposal",
      goal: "Keep completed research and draft after worker interruption",
    });
    const writer = await rooms.addParticipant(tenantId, roomId, {
      id: "writer",
      type: "agent",
      displayName: "Writer",
      role: "writer",
      runtime: { platform: "mock" },
    });
    for (const step of ["research", "draft"]) {
      await rooms.createTask(tenantId, roomId, {
        id: step,
        stepId: step,
        assignedParticipantId: writer.id,
        instruction:
          step === "research"
            ? "Research the four-week pilot"
            : "Draft using the persisted research",
        expectedOutput: "Proposal material",
        expectedArtifactKind: step,
        actionLevel: "draft",
        dependencies: step === "draft" ? ["research"] : [],
      });
    }
    await rooms.runTask(tenantId, roomId, "research");
    const message = await rooms.sendMessage(tenantId, roomId, {
      role: "system",
      content: "Prepare the proposal",
    });
    await coordination.initialize({ tenantId, roomId, coordinationId });
    await coordination.enqueue({
      tenantId,
      roomId,
      coordinationId,
      expectedRevision: 0,
      itemId: "proposal",
      kind: "message",
      referenceId: message.id,
    });
  } else assert.equal(phase, "successor");
  const state = await store.load(tenantId, roomId, coordinationId);
  const result = await coordination.runNext({
    tenantId,
    roomId,
    coordinationId,
    expectedRevision: state.revision,
    leaseToken: phase,
    leaseMs: 300,
  });
  assert.equal(result.status, "completed");
  const final = await rooms.getRoomState(tenantId, roomId);
  assert.equal(
    final.runs.length,
    2,
    "Completed research and draft must not execute again",
  );
  assert.equal(final.artifacts.length, 2);
  assert.equal(result.items[0].attempts, 2);
  assert.equal(result.items[0].runIds[0], process.env.RECOVERY_EXPECTED_RUN);
  console.log(
    JSON.stringify({
      roomId,
      tenantId,
      operationId: result.items[0].operationId,
      attempts: 2,
      runs: final.runs.map((r) => r.id),
      artifacts: final.artifacts.map((a) => a.id),
    }),
  );
} finally {
  await pool.end();
}
