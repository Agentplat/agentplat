import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  defaultPostgresSchema,
  getPostgresMigrationStatus,
  postgresRollbackConfirmation,
  rollbackPostgresMigration,
  runPostgresMigrations,
} from "@agentplat/postgres";
import type { PostgresMigrationStatus } from "@agentplat/postgres";
import type { Pool } from "pg";

const applicationId = "@agentplat/collective-sync-postgres";
const migrationNames = [
  "001_collective_sync",
  "002_execution_checkpoints",
] as const;

export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface CollectiveSyncPostgresMigrationOptionsV1 {
  readonly schema?: string;
  readonly createSchema?: boolean;
}

async function migrations() {
  const files = await Promise.all(
    migrationNames.flatMap((name) => [
      readFile(
        new URL(`../migrations/${name}.up.sql`, import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(`../migrations/${name}.down.sql`, import.meta.url),
        "utf8",
      ),
    ]),
  );
  return [
    {
      version: 1,
      name: migrationNames[0],
      up: files[0],
      down: files[1],
      destructiveDown: true,
      adoptIf: `
      SELECT
        to_regclass('__AGENTPLAT_SCHEMA__.collective_sync_stream_heads') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.collective_sync_records') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.collective_sync_sessions') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.collective_sync_receipts') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.collective_sync_certificates') IS NOT NULL
        AS present
    `,
    },
    {
      version: 2,
      name: migrationNames[1],
      up: files[2],
      down: files[3],
      destructiveDown: true,
      adoptIf: `
      SELECT
        to_regclass('__AGENTPLAT_SCHEMA__.execution_checkpoint_artifacts') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.execution_checkpoint_receipts') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.execution_checkpoint_certificates') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.execution_checkpoint_certificate_acks') IS NOT NULL
        AS present
    `,
    },
  ] as const;
}

export async function runMigrations(
  pool: Pool,
  options: CollectiveSyncPostgresMigrationOptionsV1 = {},
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
  options: CollectiveSyncPostgresMigrationOptionsV1 = {},
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
  input: CollectiveSyncPostgresMigrationOptionsV1 & {
    readonly expectedCurrentVersion: number;
    readonly confirm: string;
    readonly allowDataLoss?: boolean;
    readonly verifiedBackup?: boolean;
  },
): Promise<PostgresMigrationStatus> {
  if (input.verifiedBackup !== true)
    throw new TypeError(
      "Collective sync rollback requires a verified external backup",
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
