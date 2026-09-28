import test from "node:test";
import {
  InMemoryAgentGovernanceStoreV1,
  InMemoryAttentionSignalStoreV1,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
} from "@agentplat/rooms";
import { attentionSignalScenarios } from "./helpers/attention-signal-scenarios.mjs";
test("attention signals preserve provenance, references, freshness, bounded wakeups and crash recovery", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1();
  await attentionSignalScenarios({
    governance,
    store: new InMemoryAttentionSignalStoreV1(governance),
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
  });
});
