import type { PlanningArtifactAvailabilityPortV1 } from "@agentplat/collective-planning/mesh";
import {
  CollectiveSyncPlanningArtifactAvailabilityV1,
  PlanningArtifactSyncAdapterV1,
  ReplicatedPlanningFragmentRepositoryV1,
  createPlanningArtifactSyncRecordV1,
  planningArtifactStreamIdV1,
  type PlanningArtifactSyncAdapterOptionsV1,
  type ReplicatedPlanningFragmentRepositoryOptionsV1,
} from "@agentplat/planning-artifacts";
import {
  PostgresPlanningFragmentRepositoryV1,
  getMigrationStatus,
  runMigrations,
} from "@agentplat/planning-artifacts-postgres";

declare const replicatedOptions: ReplicatedPlanningFragmentRepositoryOptionsV1;
declare const adapterOptions: PlanningArtifactSyncAdapterOptionsV1;
declare const availabilityOptions: ConstructorParameters<
  typeof CollectiveSyncPlanningArtifactAvailabilityV1
>[0];
declare const publication: Parameters<
  typeof createPlanningArtifactSyncRecordV1
>[0];
declare const pool: ConstructorParameters<
  typeof PostgresPlanningFragmentRepositoryV1
>[0];

const replicated = new ReplicatedPlanningFragmentRepositoryV1(
  replicatedOptions,
);
const adapter = new PlanningArtifactSyncAdapterV1(adapterOptions);
const availability: PlanningArtifactAvailabilityPortV1 =
  new CollectiveSyncPlanningArtifactAvailabilityV1(availabilityOptions);
const postgres = new PostgresPlanningFragmentRepositoryV1(pool, {
  tenantId: "tenant.1",
  meshId: "mesh.1",
  peerId: "peer.1",
  instanceId: "instance.1",
  policyDomainId: "policy.1",
});

void replicated;
void adapter;
void availability;
void postgres;
void createPlanningArtifactSyncRecordV1(publication);
void planningArtifactStreamIdV1(publication.record.fragmentDigest);
void runMigrations(pool);
void getMigrationStatus(pool);
