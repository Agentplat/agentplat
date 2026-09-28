import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentExecutionStoreV1,
  RoomService,
  InMemoryRoomRepository,
  RoomExecutionCoordinator,
  InMemoryRoomExecutionSessionStore,
  AgentRoomHandoffCoordinator,
  InMemoryRoomHandoffStore,
  DefaultAgentRoomCoordinationExecutionPort,
} from "@agentplat/rooms";
import {
  executionScenarios,
  setupAgentExecution,
} from "./helpers/agent-execution-scenarios.mjs";
const dependencies = () => {
  const governance = new InMemoryAgentGovernanceStoreV1();
  return {
    governance,
    store: new InMemoryAgentExecutionStoreV1(governance),
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
  };
};
test("governed execution atomically reserves cumulative budgets, rejects stale authority and reconciles uncertainty", async () => {
  await executionScenarios(dependencies());
});
test("governed Room execution fences hooks/checkpoints and rejects missing capabilities", async () => {
  const f = await setupAgentExecution(dependencies());
  assert.throws(
    () =>
      new RoomService({
        repository: new InMemoryRoomRepository(),
        requireGovernedExecution: true,
      }),
    /governance port/,
  );
  let calls = 0,
    aborted = false;
  const runtime = {
    registerProvider() {},
    supportsCheckpoint: () => true,
    run: async (_a, _i, c) => {
      calls++;
      await f.govern({ kind: "suspend" });
      try {
        await c.checkpoint({ checkpoint: "pre_action" });
      } finally {
        aborted = c.signal.aborted;
      }
      return { status: "completed", output: "must not complete" };
    },
    stream: async function* () {},
  };
  const rooms = new RoomService({
    repository: new InMemoryRoomRepository(),
    runtime,
    requireGovernedExecution: true,
    executionGovernance: f.controller,
    clock: f.clock,
  });
  const room = await rooms.createRoom("t", {
    title: "Governed",
    goal: "Run permitted work",
  });
  const participant = await rooms.addParticipant("t", room.id, {
    type: "agent",
    displayName: "Agent",
    role: "worker",
    permissions: ["task.run"],
    metadata: { agentId: "agent" },
    runtime: { platform: "mock", instructions: f.definition.instructions },
  });
  const task = await rooms.createTask("t", room.id, {
    stepId: "work",
    assignedParticipantId: participant.id,
    instruction: "Work",
    expectedOutput: "Result",
    expectedArtifactKind: "result",
    actionLevel: "draft",
  });
  await assert.rejects(rooms.runTask("t", room.id, task.id), {
    code: "FORBIDDEN",
  });
  assert.equal(
    (await rooms.getRoomState("t", room.id)).runs.at(-1).status,
    "failed",
  );
  assert.equal(calls, 1);
  assert.equal(aborted, true);
  await f.govern({ kind: "prepare_activation" });
  await f.govern({ kind: "activate" });
  const task2 = await rooms.createTask("t", room.id, {
    stepId: "work2",
    assignedParticipantId: participant.id,
    instruction: "Work",
    expectedOutput: "Result",
    expectedArtifactKind: "result",
    actionLevel: "draft",
  });
  await assert.rejects(
    rooms.runTask("t", room.id, task2.id, {
      onStarted: async () => {
        await f.govern({ kind: "suspend" });
      },
    }),
    { code: "FORBIDDEN" },
  );
  assert.equal(calls, 1);
  await f.govern({ kind: "prepare_activation" });
  await f.govern({ kind: "activate" });
  runtime.supportsCheckpoint = () => false;
  const task3 = await rooms.createTask("t", room.id, {
    stepId: "work3",
    assignedParticipantId: participant.id,
    instruction: "Work",
    expectedOutput: "Result",
    expectedArtifactKind: "result",
    actionLevel: "draft",
  });
  await assert.rejects(rooms.runTask("t", room.id, task3.id), {
    code: "FORBIDDEN",
  });
  assert.equal(calls, 1);
  runtime.supportsCheckpoint = () => true;
  runtime.run = async (_agent, _input, context) => {
    calls++;
    assert.equal(context.metadata.agentGovernance.agentId, "agent");
    await context.checkpoint({ checkpoint: "pre_action" });
    return { status: "completed", output: "Completed governed work" };
  };
  const freshTask = await rooms.createTask("t", room.id, {
    stepId: "fresh",
    assignedParticipantId: participant.id,
    instruction: "Work",
    expectedOutput: "Result",
    expectedArtifactKind: "result",
    actionLevel: "draft",
  });
  assert.equal(
    (await rooms.runTask("t", room.id, freshTask.id)).status,
    "completed",
  );
  assert.equal(calls, 2);
  await assert.rejects(rooms.runTask("t", room.id, task2.id), {
    code: "FORBIDDEN",
  });
  assert.equal(calls, 2);
  const candidate=await f.definitions.createRevision({tenantId:"t",agentId:"agent",version:"2.0.0",instructions:"Evaluate contributions",runtimeProfile:{platform:"mock"},interaction:{schemaVersion:1,interactionMode:"purpose",governanceId:"gov"}});
  await f.definitions.publishRevision("t",candidate.definition.revisionId,0);
  const sessions=new RoomExecutionCoordinator(rooms,new InMemoryRoomExecutionSessionStore(),{agentRegistry:f.definitions});
  const handoffs=new AgentRoomHandoffCoordinator(rooms,new InMemoryRoomHandoffStore(),f.definitions);
  const execution=new DefaultAgentRoomCoordinationExecutionPort(rooms,f.definitions,sessions,handoffs);
  const message=await rooms.sendMessage("t",room.id,{role:"human",content:"Prepare the result"});
  const routed=await execution.dispatchMessage({tenantId:"t",roomId:room.id,messageId:message.id,participantIds:[participant.id],operationId:"admitted-revision"});
  assert.equal(routed.status,"completed");
  assert.equal((await rooms.getRoomState("t",room.id)).tasks.at(-1).metadata.agentRevisionId,f.definition.revisionId);
  assert.equal(calls,3);
});

test("mode transitions fence existing work and cannot activate the incomplete purpose profile", async () => {
  const f = await setupAgentExecution(dependencies());
  const candidate = await f.definitions.createRevision({
    tenantId: "t",
    agentId: "agent",
    version: "2.0.0",
    instructions: f.definition.instructions,
    runtimeProfile: { platform: "mock" },
    interaction: {
      schemaVersion: 1,
      interactionMode: "purpose",
      governanceId: "gov",
    },
  });
  await f.definitions.publishRevision("t", candidate.definition.revisionId, 0);
  assert.equal(await f.controller.definitionForParticipant({tenantId:"t",participant:{id:"p",metadata:{agentId:"agent"}}}),f.definition.revisionId);
  await f.govern({
    kind: "mode",
    definitionRevisionId: candidate.definition.revisionId,
  });
  assert.equal((await f.governance.load("t", "agent")).status, "suspended");
  await assert.rejects(f.controller.assertCurrent(f.binding), {
    code: "FORBIDDEN",
  });
  await f.govern({ kind: "prepare_activation" });
  await assert.rejects(f.govern({ kind: "activate" }), { code: "FORBIDDEN" });
  assert.equal((await f.governance.load("t", "agent")).status, "transitioning");
  await f.govern({ kind: "suspend" });
  assert.equal((await f.governance.load("t", "agent")).status, "suspended");
});
