import {
  CollectiveMembershipClientV1,
  CollectiveMembershipHostV1,
  CollectiveMembershipHttpTransportV1,
  CollectiveMembershipPeerV1,
  InMemoryCollectiveMembershipRegistryV1,
  InMemoryCollectiveMembershipRepositoryV1,
  InMemoryCollectiveMembershipTransportV1,
  createCollectiveMembershipConfigurationV1,
  createCollectiveMembershipKeyProofV1,
  createCollectiveMembershipTransitionProposalV1,
  handleCollectiveMembershipHttpRequestV1,
  restoreCollectiveMembershipRegistryV1,
  type CollectiveMembershipCertificateV1,
  type CollectiveMembershipConfigurationV1,
  type CollectiveMembershipRegistryV1,
} from "@agentplat/collective-membership";
import {
  PostgresCollectiveMembershipRepositoryV1,
  getMigrationStatus,
  rollbackConfirmation,
  runMigrations,
} from "@agentplat/collective-membership-postgres";

declare const clientOptions: ConstructorParameters<
  typeof CollectiveMembershipClientV1
>[0];
declare const peerOptions: ConstructorParameters<
  typeof CollectiveMembershipPeerV1
>[0];
declare const configuration: CollectiveMembershipConfigurationV1;
declare const certificate: CollectiveMembershipCertificateV1;
declare const registry: CollectiveMembershipRegistryV1;
declare const pool: ConstructorParameters<
  typeof PostgresCollectiveMembershipRepositoryV1
>[0];
declare const request: Request;

const memory = new InMemoryCollectiveMembershipRepositoryV1();
const transport = new InMemoryCollectiveMembershipTransportV1();
const client = new CollectiveMembershipClientV1(clientOptions);
const peer = new CollectiveMembershipPeerV1(peerOptions);
const host = new CollectiveMembershipHostV1({
  client: clientOptions,
  peer: peerOptions,
});
const http = new CollectiveMembershipHttpTransportV1({
  endpointForPeer: (peerId) => `https://mesh.example/${peerId}/membership`,
});
const postgres = new PostgresCollectiveMembershipRepositoryV1(pool, {
  tenantId: "tenant.1",
  meshId: "mesh.1",
  peerId: "peer.1",
  policyDomainId: "policy.1",
});

void memory;
void transport;
void client;
void peer;
void host;
void http;
void postgres;
void certificate;
void registry.currentBinding({ logicalTimeMs: 100 });
void handleCollectiveMembershipHttpRequestV1(peer, request);
void InMemoryCollectiveMembershipRegistryV1.create({
  configurations: [configuration],
});
void restoreCollectiveMembershipRegistryV1({ repository: memory });
void createCollectiveMembershipConfigurationV1;
void createCollectiveMembershipKeyProofV1;
void createCollectiveMembershipTransitionProposalV1;
void runMigrations(pool);
void getMigrationStatus(pool);
void rollbackConfirmation();
