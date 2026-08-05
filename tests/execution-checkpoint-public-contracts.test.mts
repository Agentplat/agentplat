import {
  CertifiedExecutionCheckpointAvailabilityV1,
  ExecutionCheckpointHttpTransportV1,
  ExecutionCheckpointReplicationPeerV1,
  InMemoryExecutionCheckpointArtifactRepositoryV1,
  InMemoryExecutionCheckpointEvidenceRepositoryV1,
  type ExecutionCheckpointAvailabilityPortV1,
  type ExecutionCheckpointMembershipV1,
  type ExecutionCheckpointReplicationPolicyV1,
  type ExecutionCheckpointScopeV1,
  type ExecutionCheckpointSigningV1,
} from "@agentplat/collective-runtime/checkpoints";
import type { CollectivePeerNodeRuntimeConfigV1 } from "@agentplat/collective-runtime/node";
import { PostgresExecutionCheckpointRepositoryV1 } from "@agentplat/collective-sync-postgres/checkpoints";
import type {
  PortableAgentAdapterV1,
  PortableAgentCheckpointTransferV1,
  PortableAgentTransferSessionRuntimePortV1,
} from "@agentplat/runtime/adapter";

declare const pool: ConstructorParameters<
  typeof PostgresExecutionCheckpointRepositoryV1
>[0];
declare const scope: ExecutionCheckpointScopeV1;
declare const policy: ExecutionCheckpointReplicationPolicyV1;
declare const membership: ExecutionCheckpointMembershipV1;
declare const signing: ExecutionCheckpointSigningV1;

const artifacts = new InMemoryExecutionCheckpointArtifactRepositoryV1();
const evidence = new InMemoryExecutionCheckpointEvidenceRepositoryV1();
const peer = new ExecutionCheckpointReplicationPeerV1({
  scope,
  policy,
  artifacts,
  evidence,
  membership,
  signing,
  clock: {
    now: () => ({ wallTime: new Date().toISOString(), logicalTimeMs: 1 }),
  },
});
const transport = new ExecutionCheckpointHttpTransportV1({
  endpoints: { [scope.peerId]: "https://peer.example" },
});
const availability: ExecutionCheckpointAvailabilityPortV1 =
  new CertifiedExecutionCheckpointAvailabilityV1({
    scope,
    policy,
    artifacts,
    evidence,
    membership,
    signing,
    transport,
    clock: {
      now: () => ({ wallTime: new Date().toISOString(), logicalTimeMs: 1 }),
    },
  });
const postgres = new PostgresExecutionCheckpointRepositoryV1(pool, {
  ...scope,
  schema: "agentplat",
});

const transferRuntime: PortableAgentTransferSessionRuntimePortV1 = {
  getSession: async () => undefined,
  step: async () => ({}) as never,
  exportCheckpoint: async () => ({}) as PortableAgentCheckpointTransferV1,
  importCheckpoint: async () => ({}) as never,
  resume: async () => ({}) as never,
};
const adapter: PortableAgentAdapterV1 = {
  step: async () => ({}) as never,
  exportCheckpoint: async () => ({
    schemaVersion: 1,
    contentClass: "portable_application_state",
    state: {},
  }),
  importCheckpoint: async () => ({}) as never,
};
const nodeOptions = {
  executionCheckpoints: availability,
} satisfies Pick<CollectivePeerNodeRuntimeConfigV1, "executionCheckpoints">;

void [peer, postgres, transferRuntime, adapter, nodeOptions];
