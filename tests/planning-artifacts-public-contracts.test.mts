import type { PlanningArtifactAvailabilityPortV1 } from "@agentplat/collective-planning/mesh";
import type { CollectiveQuorumMembershipBindingV1 } from "@agentplat/collective-quorum";
import {
  CertifiedPlanningArtifactAvailabilityV2,
  CertifiedReplicatedPlanningFragmentRepositoryV2,
  CollectiveSyncPlanningArtifactAvailabilityV1,
  InMemoryPlanningArtifactReplicationEvidenceRepositoryV1,
  PlanningArtifactAvailabilitySyncAdapterV2,
  PlanningArtifactReplicationHttpTransportV1,
  PlanningArtifactReplicationPeerV1,
  PlanningArtifactSyncAdapterV1,
  ReplicatedPlanningFragmentRepositoryV1,
  createPlanningArtifactSyncRecordV1,
  planningArtifactCertificateStreamIdV1,
  planningArtifactStreamIdV1,
  selectPlanningArtifactReplicasV1,
  type CertifiedPlanningArtifactAvailabilityOptionsV2,
  type CertifiedReplicatedPlanningFragmentRepositoryOptionsV2,
  type PlanningArtifactAvailabilitySyncAdapterOptionsV2,
  type PlanningArtifactReplicationPeerOptionsV1,
  type PlanningArtifactSyncAdapterOptionsV1,
  type ReplicatedPlanningFragmentRepositoryOptionsV1,
} from "@agentplat/planning-artifacts";
import {
  PostgresPlanningArtifactReplicationEvidenceRepositoryV1,
  PostgresPlanningFragmentRepositoryV1,
  getMigrationStatus,
  runMigrations,
} from "@agentplat/planning-artifacts-postgres";

declare const replicatedOptions: ReplicatedPlanningFragmentRepositoryOptionsV1;
declare const adapterOptions: PlanningArtifactSyncAdapterOptionsV1;
declare const certifiedOptions: CertifiedReplicatedPlanningFragmentRepositoryOptionsV2;
declare const availabilityV2Options: CertifiedPlanningArtifactAvailabilityOptionsV2;
declare const adapterV2Options: PlanningArtifactAvailabilitySyncAdapterOptionsV2;
declare const replicationPeerOptions: PlanningArtifactReplicationPeerOptionsV1;
declare const availabilityOptions: ConstructorParameters<
  typeof CollectiveSyncPlanningArtifactAvailabilityV1
>[0];
declare const publication: Parameters<
  typeof createPlanningArtifactSyncRecordV1
>[0];
declare const membershipBinding: CollectiveQuorumMembershipBindingV1;
declare const pool: ConstructorParameters<
  typeof PostgresPlanningFragmentRepositoryV1
>[0];

const replicated = new ReplicatedPlanningFragmentRepositoryV1(
  replicatedOptions,
);
const adapter = new PlanningArtifactSyncAdapterV1(adapterOptions);
const certified = new CertifiedReplicatedPlanningFragmentRepositoryV2(
  certifiedOptions,
);
const adapterV2 = new PlanningArtifactAvailabilitySyncAdapterV2(
  adapterV2Options,
);
const replicationPeer = new PlanningArtifactReplicationPeerV1(
  replicationPeerOptions,
);
const availability: PlanningArtifactAvailabilityPortV1 =
  new CollectiveSyncPlanningArtifactAvailabilityV1(availabilityOptions);
const certifiedAvailability: PlanningArtifactAvailabilityPortV1 =
  new CertifiedPlanningArtifactAvailabilityV2(availabilityV2Options);
const evidence = new InMemoryPlanningArtifactReplicationEvidenceRepositoryV1();
const httpTransport = new PlanningArtifactReplicationHttpTransportV1({
  endpoints: { "peer.1": "http://127.0.0.1:8080" },
});
const postgres = new PostgresPlanningFragmentRepositoryV1(pool, {
  tenantId: "tenant.1",
  meshId: "mesh.1",
  peerId: "peer.1",
  instanceId: "instance.1",
  policyDomainId: "policy.1",
});
const postgresEvidence =
  new PostgresPlanningArtifactReplicationEvidenceRepositoryV1(pool, {
    tenantId: "tenant.1",
    meshId: "mesh.1",
    peerId: "peer.1",
    instanceId: "instance.1",
    policyDomainId: "policy.1",
  });

void replicated;
void adapter;
void certified;
void adapterV2;
void replicationPeer;
void availability;
void certifiedAvailability;
void evidence;
void httpTransport;
void postgres;
void postgresEvidence;
void createPlanningArtifactSyncRecordV1(publication);
void planningArtifactStreamIdV1(publication.record.fragmentDigest);
void planningArtifactCertificateStreamIdV1(publication.record.fragmentDigest);
void selectPlanningArtifactReplicasV1({
  membership: membershipBinding,
  sourcePeerId: certifiedOptions.scope.peerId,
  sourceInstanceId: certifiedOptions.scope.instanceId,
  fragmentDigest: publication.record.fragmentDigest,
  policy: certifiedOptions.replicationPolicy,
});
void runMigrations(pool);
void getMigrationStatus(pool);
