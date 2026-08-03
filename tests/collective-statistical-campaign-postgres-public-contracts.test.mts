import type { CollectiveStatisticalCampaignFencedExecutionStoreV1 } from '@agentplat/mesh-sim';
import {
  DEFAULT_MESH_SIM_POSTGRES_LIMITS_V1,
  MESH_SIM_POSTGRES_SCHEMA_VERSION_V1,
  PostgresCollectiveStatisticalCampaignStoreV1,
  createPostgresCollectiveStatisticalCampaignArtifactReaderV1,
  createPostgresCollectiveStatisticalCampaignArtifactWriterV1,
  getMeshSimPostgresMigrationStatusV1,
  meshSimPostgresMigrationDirectoryV1,
  meshSimPostgresRollbackConfirmationV1,
  rollbackMeshSimPostgresMigrationV1,
  runMeshSimPostgresMigrationsV1,
  type MeshSimPostgresLimitsV1,
  type MeshSimPostgresMigrationOptionsV1,
  type PostgresCollectiveStatisticalCampaignStoreOptionsV1,
} from '@agentplat/mesh-sim-postgres';

const schema: typeof MESH_SIM_POSTGRES_SCHEMA_VERSION_V1 = 1;
declare const pool: ConstructorParameters<
  typeof PostgresCollectiveStatisticalCampaignStoreV1
>[0];

const options: PostgresCollectiveStatisticalCampaignStoreOptionsV1 = {
  namespace: 'campaign:public-contract',
};
const store = new PostgresCollectiveStatisticalCampaignStoreV1(pool, options);
const fenced: CollectiveStatisticalCampaignFencedExecutionStoreV1 = store;

void schema;
void fenced;
void DEFAULT_MESH_SIM_POSTGRES_LIMITS_V1;
void createPostgresCollectiveStatisticalCampaignArtifactReaderV1;
void createPostgresCollectiveStatisticalCampaignArtifactWriterV1;
void getMeshSimPostgresMigrationStatusV1;
void meshSimPostgresMigrationDirectoryV1;
void meshSimPostgresRollbackConfirmationV1;
void rollbackMeshSimPostgresMigrationV1;
void runMeshSimPostgresMigrationsV1;
void (null as MeshSimPostgresLimitsV1 | null);
void (null as MeshSimPostgresMigrationOptionsV1 | null);

// @ts-expect-error a durable campaign namespace is mandatory.
new PostgresCollectiveStatisticalCampaignStoreV1(pool, {});
