import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  defaultPostgresSchema,
  getPostgresMigrationStatus,
  postgresRollbackConfirmation,
  rollbackPostgresMigration,
  runPostgresMigrations,
  type PostgresMigrationStatus,
} from "@agentplat/postgres";
import type { Pool } from "pg";

const applicationId = "@agentplat/planning-artifacts-postgres";
const artifactMigrationName = "001_planning_artifacts";
const replicationMigrationName = "002_planning_artifact_replication";

export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface PlanningArtifactsPostgresMigrationOptionsV1 {
  readonly schema?: string;
  readonly createSchema?: boolean;
}

async function migrations() {
  const [artifactUp, artifactDown, replicationUp, replicationDown] =
    await Promise.all([
      readFile(
        new URL(
          `../migrations/${artifactMigrationName}.up.sql`,
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          `../migrations/${artifactMigrationName}.down.sql`,
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          `../migrations/${replicationMigrationName}.up.sql`,
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          `../migrations/${replicationMigrationName}.down.sql`,
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  return [
    {
      version: 1,
      name: artifactMigrationName,
      up: artifactUp,
      down: artifactDown,
      destructiveDown: true,
      adoptIf: `
        SELECT to_regclass('__AGENTPLAT_SCHEMA__.planning_artifacts') IS NOT NULL AS present
      `,
    },
    {
      version: 2,
      name: replicationMigrationName,
      up: replicationUp,
      down: replicationDown,
      destructiveDown: true,
      adoptIf: `
        SELECT
          to_regclass('__AGENTPLAT_SCHEMA__.planning_artifact_replica_receipts') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.planning_artifact_replication_certificates') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.planning_artifact_certificate_acks') IS NOT NULL
          AS present
      `,
    },
  ] as const;
}

export async function runMigrations(
  pool: Pool,
  options: PlanningArtifactsPostgresMigrationOptionsV1 = {},
): Promise<PostgresMigrationStatus> {
  return runPostgresMigrations(pool, {
    applicationId,
    schema: options.schema,
    createSchema: options.createSchema,
    migrations: await migrations(),
  });
}

export async function getMigrationStatus(
  pool: Pool,
  options: PlanningArtifactsPostgresMigrationOptionsV1 = {},
): Promise<PostgresMigrationStatus> {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    schema: options.schema,
    migrations: await migrations(),
  });
}

export function rollbackConfirmation(
  schema = defaultPostgresSchema,
  version = 2,
): string {
  return postgresRollbackConfirmation(applicationId, schema, version);
}

export async function rollbackMigrations(
  pool: Pool,
  input: PlanningArtifactsPostgresMigrationOptionsV1 & {
    readonly expectedCurrentVersion: number;
    readonly confirm: string;
    readonly allowDataLoss?: boolean;
    readonly verifiedBackup?: boolean;
  },
): Promise<PostgresMigrationStatus> {
  if (input.verifiedBackup !== true)
    throw new TypeError(
      "Planning artifact rollback requires a verified external backup",
    );
  return rollbackPostgresMigration(pool, {
    applicationId,
    schema: input.schema,
    migrations: await migrations(),
    expectedCurrentVersion: input.expectedCurrentVersion,
    confirm: input.confirm,
    allowDataLoss: input.allowDataLoss,
  });
}
