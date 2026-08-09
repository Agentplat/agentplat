import assert from "node:assert/strict";

import {
  InMemoryTeamFormationStoreV1,
  TEAM_FORMATION_SCHEMA_VERSION_V1,
  TeamFormationRuntimeV1,
  createTeamFormationPolicyV1,
  createTeamFormationScopeV1,
} from "@agentplat/collective-runtime/team-formation";

const digest = (character) => `sha256:${character.repeat(64)}`;
const scope = createTeamFormationScopeV1({
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission",
  objectiveId: "objective",
  rootWorkItemId: "root-work",
  rootWorkItemRevision: 1,
});
const policy = createTeamFormationPolicyV1({
  schemaVersion: 1,
  policyId: "team-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  minimumDistinctPeers: 2,
  minimumIndependenceGroups: 2,
  maximumTotalBudgetUnits: 100,
  requireDistinctPeerPerPosition: true,
  limits: {
    maximumPositions: 8,
    maximumBidsPerPosition: 16,
    maximumMembers: 8,
    maximumSearchNodes: 1_000,
    maximumReasonCodesPerDecision: 8,
    maximumHistoryEntries: 8,
    maximumRequestInvalidations: 16,
    maximumRequestTtlMs: 1_000,
    maximumTeamDurationMs: 1_000,
    maximumCommitAttempts: 4,
  },
});
const runtime = new TeamFormationRuntimeV1({
  stateKey: "team-state",
  formationId: "team-formation",
  formationVersion: 1,
  implementationId: "team-formation.default",
  policy,
  store: new InMemoryTeamFormationStoreV1(),
});

assert.equal(TEAM_FORMATION_SCHEMA_VERSION_V1, 1);
assert.match(scope.scopeDigest, /^sha256:[0-9a-f]{64}$/u);
assert.notEqual(scope.scopeDigest, digest("a"));
assert.match(policy.policyDigest, /^sha256:[0-9a-f]{64}$/u);
assert.equal((await runtime.loadState()).revision, 0);
