import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import {
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  AgentGovernanceServiceV1,
  InMemoryAgentGovernanceStoreV1,
  AgentExecutionControllerV1,
  PurposeMissionServiceV1,
  AgentContinuityServiceV1,
} from "@agentplat/rooms";
import { createRoomsApp } from "@agentplat/rooms-api";
import {
  migrationDirectory,
  PostgresAgentGovernanceStoreV1,
  PostgresAgentExecutionStoreV1,
  PostgresPurposeMissionStoreV1,
  PostgresAgentContinuityStoreV1,
} from "@agentplat/rooms-postgres";
import {
  createAgentGovernanceActionGatewayV1,
  createGovernanceAutonomySupervisionV1,
  createEvolutionContinuityEvidenceV1,
} from "@agentplat/workflows-rooms";
for (const exported of [
  AgentExecutionControllerV1,
  PurposeMissionServiceV1,
  AgentContinuityServiceV1,
  createRoomsApp,
  PostgresAgentGovernanceStoreV1,
  PostgresAgentExecutionStoreV1,
  PostgresPurposeMissionStoreV1,
  PostgresAgentContinuityStoreV1,
  createAgentGovernanceActionGatewayV1,
  createGovernanceAutonomySupervisionV1,
  createEvolutionContinuityEvidenceV1,
])
  assert.equal(typeof exported, "function");
const registry = new AgentDefinitionRegistry(
  new InMemoryAgentDefinitionRegistryStore(),
);
await registry.createAgent({
  tenantId: "t",
  agentId: "a",
  name: "Packed agent",
});
const legacy = await registry.createRevision({
  tenantId: "t",
  agentId: "a",
  version: "1.0.0",
  instructions: "Legacy",
  runtimeProfile: {},
});
await registry.publishRevision("t", legacy.definition.revisionId, 0);
assert.equal(legacy.definition.interaction, undefined);
assert.equal(
  (await registry.resolvePublishedRevision("t", legacy.definition.revisionId))
    .digest,
  legacy.definition.digest,
);
const candidate = await registry.createRevision({
  tenantId: "t",
  agentId: "a",
  version: "2.0.0",
  instructions: "Purpose",
  runtimeProfile: {},
  interaction: {
    schemaVersion: 1,
    interactionMode: "purpose",
    governanceId: "g",
  },
});
await registry.publishRevision("t", candidate.definition.revisionId, 0);
await assert.rejects(
  registry.resolvePublishedRevision("t", candidate.definition.revisionId),
  /qualified purpose/,
);
const service = new AgentGovernanceServiceV1(
  new InMemoryAgentGovernanceStoreV1(),
  {
    authenticate: async () => ({ tenantId: "t", subjectId: "owner" }),
    authorize: async () => true,
  },
  registry,
);
const head = await service.execute(null, {
  agentId: "a",
  operationId: "create",
  expectedRevision: null,
  command: {
    kind: "create",
    governanceId: "g",
    ownerId: "owner",
    purpose: "Bounded purpose",
    definitionRevisionId: candidate.definition.revisionId,
  },
});
assert.equal(head.status, "suspended");
const migrations = await readdir(migrationDirectory);
for (const prefix of ["013", "014", "015", "016", "017", "018"])
  assert.equal(
    migrations.filter(
      (n) => n.startsWith(prefix) && /\.(up|down)\.sql$/.test(n),
    ).length,
    2,
  );
console.log(
  "Packed purpose governance: exports, legacy resolution, qualified activation refusal and migrations verified.",
);
