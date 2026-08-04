import {
  CollectiveSyncClientV1,
  CollectiveSyncOperationalGateV1,
  CollectiveSyncPeerV1,
  CollectiveSyncReadinessGateV1,
  InMemoryCollectiveSyncRepositoryV1,
  InMemoryCollectiveSyncTransportV1,
  createCollectiveSyncRecordV1,
  handleCollectiveSyncHttpRequestV1,
  type CollectiveSyncDomainAdapterV1,
  type CollectiveSyncMembershipV1,
} from "@agentplat/collective-sync";
import {
  PostgresCollectiveSyncRepositoryV1,
  getMigrationStatus,
  rollbackConfirmation,
  runMigrations,
} from "@agentplat/collective-sync-postgres";
import type { CollectiveQuorumReadinessPortV1 } from "@agentplat/collective-quorum";
import type {
  CollectivePeerNodeStoredStateV1,
  CollectivePeerNodeSynchronizationPortV1,
} from "@agentplat/collective-runtime/node";

declare const clientOptions: ConstructorParameters<
  typeof CollectiveSyncClientV1
>[0];
declare const peerOptions: ConstructorParameters<
  typeof CollectiveSyncPeerV1
>[0];
declare const readinessOptions: ConstructorParameters<
  typeof CollectiveSyncReadinessGateV1
>[0];
declare const scope: ConstructorParameters<
  typeof InMemoryCollectiveSyncRepositoryV1
>[0];
declare const pool: ConstructorParameters<
  typeof PostgresCollectiveSyncRepositoryV1
>[0];
declare const request: Request;
declare const adapter: CollectiveSyncDomainAdapterV1;
declare const membership: CollectiveSyncMembershipV1;
declare const recoveredState: CollectivePeerNodeStoredStateV1["runtime"];

const repository = new InMemoryCollectiveSyncRepositoryV1(scope);
const transport = new InMemoryCollectiveSyncTransportV1();
const peer = new CollectiveSyncPeerV1(peerOptions);
const client = new CollectiveSyncClientV1({
  ...clientOptions,
  adapter,
  membership,
});
const readiness = new CollectiveSyncReadinessGateV1(readinessOptions);
const operational = new CollectiveSyncOperationalGateV1<
  CollectivePeerNodeStoredStateV1["runtime"]
>({
  gate: readiness,
  client,
  syncDomain: () => "mission.1",
  readState: async () => recoveredState,
});
const nodePort: CollectivePeerNodeSynchronizationPortV1 = operational;
const quorumPort: CollectiveQuorumReadinessPortV1 = operational;
const postgres = new PostgresCollectiveSyncRepositoryV1(pool, {
  tenantId: "tenant.1",
  meshId: "mesh.1",
  peerId: "peer.1",
  instanceId: "instance.1",
  policyDomainId: "policy.1",
});

void repository;
void transport;
void nodePort;
void quorumPort;
void postgres;
void createCollectiveSyncRecordV1;
void handleCollectiveSyncHttpRequestV1(peer, request);
void runMigrations(pool);
void getMigrationStatus(pool);
void rollbackConfirmation();
