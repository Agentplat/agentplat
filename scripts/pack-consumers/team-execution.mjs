import assert from "node:assert/strict";

import {
  InMemoryTeamExecutionArtifactPortV1,
  InMemoryTeamExecutionStoreV1,
  TEAM_EXECUTION_SCHEMA_VERSION_V1,
  TeamExecutionRuntimeV1,
  createTeamExecutionPolicyV1,
} from "@agentplat/collective-runtime/team-execution";

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
