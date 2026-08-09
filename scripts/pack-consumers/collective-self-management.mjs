import assert from "node:assert/strict";

import {
  TEAM_EXECUTION_CONTINUITY_SCHEMA_VERSION_V1,
  createTeamExecutionWorkOwnerAuthorityV1,
} from "@agentplat/collective-runtime/team-execution-continuity";
import {
  TEAM_STRUCTURE_ADAPTATION_SCHEMA_VERSION_V1,
  createTeamStructureTemplateCatalogV1,
  createTeamStructureTemplatePositionV1,
  createTeamStructureTemplateV1,
} from "@agentplat/collective-runtime/team-structure-adaptation";
import {
  COLLECTIVE_PEER_HOST_SCHEMA_VERSION,
  InMemoryCollectivePeerHostClaimPortV1,
} from "@agentplat/collective-runtime/host";

const digest = (character = "a") => `sha256:${character.repeat(64)}`;

const authority = createTeamExecutionWorkOwnerAuthorityV1({
  schemaVersion: 1,
  tenantId: "tenant",
  meshId: "mesh",
  objectiveId: "objective",
  rootWorkItemId: "work.root",
  generation: 1,
  holder: {
    schemaVersion: 1,
    peerId: "peer",
    instanceId: "instance",
    keyId: "key",
  },
  headDigest: digest("a"),
  fencingToken: "fence.1",
  membershipEpoch: 1,
  membershipConfigurationDigest: digest("b"),
  resumeCheckpointDigest: null,
  validUntilLogicalMs: 100,
});

const position = createTeamStructureTemplatePositionV1({
  schemaVersion: 1,
  templatePositionId: "position.research",
  roleKey: "research",
  requiredCapabilityKeys: ["research"],
  completionCriteria: ["research-complete"],
  dependsOnTemplatePositionIds: [],
  budgetUnits: 10,
  maximumActionBudgetUnits: 5,
});
const template = createTeamStructureTemplateV1({
  schemaVersion: 1,
  templateId: "template.research",
  templateVersion: 1,
  positions: [position],
});
const catalog = createTeamStructureTemplateCatalogV1({
  schemaVersion: 1,
  catalogId: "catalog.default",
  catalogVersion: 1,
  parentCatalogDigest: null,
  baselineTemplateId: template.templateId,
  templates: [template],
});

const claims = new InMemoryCollectivePeerHostClaimPortV1();
const claimed = await claims.claim({
  messageId: "message.1",
  routeId: "node",
  envelopeIdentityDigest: digest("c"),
  claimedAt: "2026-08-07T12:00:00.000Z",
});
const admitted = await claims.complete({
  messageId: "message.1",
  routeId: "node",
  envelopeIdentityDigest: digest("c"),
  admittedAt: "2026-08-07T12:00:01.000Z",
});

assert.equal(TEAM_EXECUTION_CONTINUITY_SCHEMA_VERSION_V1, 1);
assert.equal(TEAM_STRUCTURE_ADAPTATION_SCHEMA_VERSION_V1, 1);
assert.equal(COLLECTIVE_PEER_HOST_SCHEMA_VERSION, 1);
assert.equal(authority.membershipEpoch, 1);
assert.match(catalog.catalogDigest, /^sha256:[0-9a-f]{64}$/u);
assert.equal(claimed.acquired, true);
assert.equal(admitted.status, "admitted");
