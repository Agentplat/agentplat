import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentExecutionStoreV1,
  InMemoryAgentContinuityStoreV1,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  InMemoryRoomHandoffStore,
  InMemoryRoomRepository,
} from "@agentplat/rooms";
import { governedHandoffScenarios } from "./helpers/governed-handoff-scenarios.mjs";
test("native governed Handoff binds source work, narrows tools, charges parent and reconciles child effects", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1(),
    continuity = new InMemoryAgentContinuityStoreV1(governance),
    handoffs = new InMemoryRoomHandoffStore();
  await governedHandoffScenarios({
    governance,
    continuity,
    handoffs,
    execution: new InMemoryAgentExecutionStoreV1(
      governance,
      undefined,
      continuity,
      handoffs,
    ),
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
    repository: new InMemoryRoomRepository(),
  });
});

test("coordination routes a purpose Handoff only to the registered inception port", async () => {
  const { DefaultAgentRoomCoordinationExecutionPort } =
    await import("@agentplat/rooms");
  let submitted = 0;
  const handoff = {
    status: "accepted",
    tenantId: "t",
    roomId: "room",
    handoffId: "h",
    targetParticipantId: "p",
    targetAgentRevisionId: "purpose-def",
    targetAgentRevisionDigest: "digest",
  };
  const rooms = {
    getRoomState: async () => ({
      participants: [
        { id: "p", type: "agent", metadata: { agentId: "purpose" } },
      ],
    }),
    createTask: async () => {
      throw new Error("must not create task");
    },
  };
  const definitions = {
    listRevisions: async () => [
      {
        lifecycle: { status: "published" },
        definition: {
          revisionId: "purpose-def",
          digest: "digest",
          interaction: {
            schemaVersion: 1,
            interactionMode: "purpose",
            governanceId: "g",
          },
        },
      },
    ],
  };
  const router = new DefaultAgentRoomCoordinationExecutionPort(
    rooms,
    definitions,
    {},
    {},
    undefined,
    {
      submit: async () => {},
      submitHandoff: async (input) => {
        submitted++;
        assert.equal(input.handoffId, "h");
      },
    },
  );
  assert.deepEqual(
    await router.dispatchHandoff({ handoff, operationId: "receive" }),
    { status: "completed", runIds: [] },
  );
  assert.equal(submitted, 1);
});
