import test from "node:test";
import {
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentExecutionStoreV1,
  InMemoryPurposeMissionStoreV1,
  InMemoryAgentInceptionStoreV1,
  InMemoryAttentionSignalStoreV1,
  InMemoryAgentRoomPlanStore,
  InMemoryRoomRepository,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
} from "@agentplat/rooms";
import { purposeMissionScenarios } from "./helpers/purpose-mission-scenarios.mjs";
test("qualified purpose missions evaluate evidence, execute governed plans, review outcomes and recover safely", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1(),
    missions = new InMemoryPurposeMissionStoreV1(governance);
  await purposeMissionScenarios({
    governance,
    missions,
    execution: new InMemoryAgentExecutionStoreV1(governance, missions),
    plans: new InMemoryAgentRoomPlanStore(),
    repository: new InMemoryRoomRepository(),
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
    inceptions: new InMemoryAgentInceptionStoreV1(governance),
    signals: new InMemoryAttentionSignalStoreV1(governance),
  });
});
