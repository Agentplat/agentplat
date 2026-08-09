import assert from "node:assert/strict";

import {
  InMemoryTeamExecutionArtifactPortV1,
  InMemoryTeamExecutionStoreV1,
  TEAM_EXECUTION_SCHEMA_VERSION_V1,
  TeamExecutionRuntimeV1,
  createTeamExecutionPolicyV1,
} from "@agentplat/collective-runtime/team-execution";
import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryTeamExecutionExchangeStoreV1,
  TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
  TeamExecutionExchangeRuntimeV1,
  createTeamExecutionExchangePolicyV1,
} from "@agentplat/collective-runtime/team-execution-exchange";

const policy = createTeamExecutionPolicyV1({
  schemaVersion: 1,
  policyId: "team-execution-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  requireReferencedCompletionArtifact: true,
  requireAllowedControlForProgress: true,
  limits: {
    maximumPositions: 8,
    maximumStepsPerPosition: 16,
    maximumArtifactsPerStep: 4,
    maximumArtifactsPerPosition: 16,
    maximumArtifactDependencies: 16,
    maximumArtifactBytes: 1_048_576,
    maximumPeerMessagesPerStep: 16,
    maximumTotalPeerMessages: 256,
    maximumRecoveryCount: 4,
    maximumHistoryEntries: 8,
    maximumExecutionDurationMs: 60_000,
    maximumStepTtlMs: 10_000,
    maximumCommitAttempts: 4,
  },
});
const executor = {
  executorId: "packed-team-executor",
  executorVersion: 1,
  implementationId: "packed-team-executor.default",
  async execute() {
    throw new Error("packed consumer does not execute a member");
  },
};
const runtime = new TeamExecutionRuntimeV1({
  stateKey: "packed-team-execution",
  runtimeId: "team-execution",
  runtimeVersion: 1,
  implementationId: "team-execution.default",
  policy,
  executor,
  artifacts: new InMemoryTeamExecutionArtifactPortV1(),
  store: new InMemoryTeamExecutionStoreV1(),
});

assert.equal(TEAM_EXECUTION_SCHEMA_VERSION_V1, 1);
assert.match(policy.policyDigest, /^sha256:[0-9a-f]{64}$/u);
assert.equal((await runtime.loadState()).revision, 0);

const exchangePolicy = createTeamExecutionExchangePolicyV1({
  schemaVersion: 1,
  policyId: "packed-team-exchange-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  limits: {
    maximumRetainedInboxMessages: 16,
    maximumPendingMessages: 8,
    maximumRetainedOutboxMessages: 16,
    maximumSourceStreams: 8,
    maximumMessageTtlMs: 60_000,
    maximumFutureSkewMs: 1_000,
    maximumRecoveryBatchSize: 8,
    maximumCommitAttempts: 4,
  },
});
const exchangeScopeBody = {
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission",
  objectiveId: "objective",
  rootWorkItemId: "work.root",
  rootWorkItemRevision: 1,
  teamId: "team",
};
const exchangeRuntime = new TeamExecutionExchangeRuntimeV1({
  stateKey: "packed-team-exchange",
  runtimeId: "team-exchange",
  runtimeVersion: 1,
  implementationId: "team-exchange.default",
  localIdentity: {
    peerId: "peer",
    instanceId: "instance",
    memberId: "member",
    memberBindingDigest: digestPlanningJsonV1("team-candidate", {
      label: "member-binding",
    }),
  },
  scope: {
    ...exchangeScopeBody,
    scopeDigest: digestPlanningJsonV1(
      "team-execution-scope",
      exchangeScopeBody,
    ),
  },
  streamId: "stream.peer",
  policy: exchangePolicy,
  store: new InMemoryTeamExecutionExchangeStoreV1(),
  membership: {
    async evaluate() {
      throw new Error("packed consumer does not admit a remote member");
    },
  },
  handler: {
    async handle() {
      throw new Error("packed consumer does not handle a remote message");
    },
  },
  outbound: {
    async publish() {
      throw new Error("packed consumer does not publish a Mesh message");
    },
  },
});

assert.equal(
  TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
  "agentplat.team-execution-exchange.v1",
);
assert.match(exchangePolicy.policyDigest, /^sha256:[0-9a-f]{64}$/u);
assert.equal((await exchangeRuntime.loadState()).revision, 0);
