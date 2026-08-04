import {
  CollectivePeerNodeQuorumEvidenceV1,
  CollectivePeerQuorumHostV1,
  CollectiveQuorumClientV1,
  CollectiveQuorumHttpTransportV1,
  CollectiveQuorumPeerV1,
  InMemoryCollectiveQuorumRepositoryV1,
  InMemoryCollectiveQuorumTransportV1,
  handleCollectiveQuorumHttpRequestV1,
  type CollectivePeerNodeQuorumPortsV1,
  type CollectiveQuorumAssignmentCertificateV1,
  type CollectiveQuorumRecoveryCertificateV1,
  type CollectiveQuorumSemanticEvidencePortV1,
} from "@agentplat/collective-quorum";
import {
  PostgresCollectiveQuorumRepositoryV1,
  getMigrationStatus,
  rollbackConfirmation,
  runMigrations,
} from "@agentplat/collective-quorum-postgres";
import type { CollectivePeerNodeRuntimeV1 } from "@agentplat/collective-runtime/node";

declare const clientOptions: ConstructorParameters<
  typeof CollectiveQuorumClientV1
>[0];
declare const peerOptions: ConstructorParameters<
  typeof CollectiveQuorumPeerV1
>[0];
declare const evidence: CollectiveQuorumSemanticEvidencePortV1;
declare const node: CollectivePeerNodeRuntimeV1;
declare const pool: ConstructorParameters<
  typeof PostgresCollectiveQuorumRepositoryV1
>[0];
declare const request: Request;
declare const assignmentCertificate: CollectiveQuorumAssignmentCertificateV1;
declare const recoveryCertificate: CollectiveQuorumRecoveryCertificateV1;

const memory = new InMemoryCollectiveQuorumRepositoryV1();
const transport = new InMemoryCollectiveQuorumTransportV1();
const client = new CollectiveQuorumClientV1(clientOptions);
const peer = new CollectiveQuorumPeerV1({ ...peerOptions, evidence });
const ports: CollectivePeerNodeQuorumPortsV1 = client.ports();
const nodeEvidence = new CollectivePeerNodeQuorumEvidenceV1({
  scope: clientOptions.scope,
  readState: async () => (await node.restore()).state,
});
const http = new CollectiveQuorumHttpTransportV1({
  endpointForPeer: (peerId) => `https://mesh.example/${peerId}/quorum`,
});
const postgres = new PostgresCollectiveQuorumRepositoryV1(pool, {
  tenantId: "tenant.1",
  meshId: "mesh.1",
  peerId: "peer.1",
  policyDomainId: "policy.1",
});

void memory;
void transport;
void peer;
void ports;
void nodeEvidence;
void http;
void postgres;
void assignmentCertificate;
void recoveryCertificate;
void handleCollectiveQuorumHttpRequestV1(peer, request);
void runMigrations(pool);
void getMigrationStatus(pool);
void rollbackConfirmation();
void CollectivePeerQuorumHostV1;
