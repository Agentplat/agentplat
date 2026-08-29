import {
  PostgresTaskOutcomeStoreV1,
  PostgresWorkflowStoreV1,
  getMigrationStatus,
  migrationDirectory,
  rollbackConfirmation,
  rollbackMigrations,
  runMigrations,
  type PostgresTaskOutcomeStoreOptionsV1,
  type PostgresWorkflowStoreOptionsV1,
  type WorkflowPostgresMigrationOptionsV1,
} from "@agentplat/workflows-postgres";

void PostgresTaskOutcomeStoreV1;
void PostgresWorkflowStoreV1;
void getMigrationStatus;
void migrationDirectory;
void rollbackConfirmation;
void rollbackMigrations;
void runMigrations;

type PublicTypes =
  | PostgresTaskOutcomeStoreOptionsV1
  | PostgresWorkflowStoreOptionsV1
  | WorkflowPostgresMigrationOptionsV1;

declare const publicType: PublicTypes;
void publicType;
