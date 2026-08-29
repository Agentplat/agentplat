import {
  PostgresAutonomyStoreV1,
  getMigrationStatus,
  migrationDirectory,
  rollbackConfirmation,
  rollbackMigrations,
  runMigrations,
  type AutonomyPostgresMigrationOptionsV1,
  type PostgresAutonomyStoreOptionsV1,
} from "@agentplat/autonomy-postgres";

void PostgresAutonomyStoreV1;
void getMigrationStatus;
void migrationDirectory;
void rollbackConfirmation;
void rollbackMigrations;
void runMigrations;

type PublicTypes =
  AutonomyPostgresMigrationOptionsV1 | PostgresAutonomyStoreOptionsV1;

declare const publicType: PublicTypes;
void publicType;
