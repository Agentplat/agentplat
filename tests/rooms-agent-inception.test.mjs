import test from "node:test";
import {
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentInceptionStoreV1,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  RoomService,
  InMemoryRoomRepository,
} from "@agentplat/rooms";
import { inceptionScenarios } from "./helpers/agent-inception-scenarios.mjs";

test("persistent inception dispositions, source evidence, assessment lineage, fences and no execution authority", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1();
  await inceptionScenarios({
    governance,
    store: new InMemoryAgentInceptionStoreV1(governance),
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
    rooms: new RoomService({ repository: new InMemoryRoomRepository() }),
  });
});
