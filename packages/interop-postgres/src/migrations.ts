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

const applicationId = "@agentplat/interop-postgres";
const migrationName = "001_governed_interop";
const durableMigrationName = "002_durable_interop_custody";

export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface InteropPostgresMigrationOptionsV1 {
  readonly schema?: string;
  readonly createSchema?: boolean;
}

async function migrations() {
  const [up, down, durableUp, durableDown] = await Promise.all([
    readFile(
      new URL(`../migrations/${migrationName}.up.sql`, import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(`../migrations/${migrationName}.down.sql`, import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(`../migrations/${durableMigrationName}.up.sql`, import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(`../migrations/${durableMigrationName}.down.sql`, import.meta.url),
      "utf8",
    ),
  ]);
  return [
    {
      version: 1,
      name: migrationName,
      up,
      down,
      destructiveDown: true,
    },
    {
      version: 2,
      name: durableMigrationName,
      up: durableUp,
      down: durableDown,
      destructiveDown: true,
    },
  ] as const;
}

export async function runMigrations(
  pool: Pool,
  options: InteropPostgresMigrationOptionsV1 = {},
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
  options: InteropPostgresMigrationOptionsV1 = {},
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
  input: InteropPostgresMigrationOptionsV1 & {
    readonly expectedCurrentVersion: number;
    readonly confirm: string;
    readonly allowDataLoss?: boolean;
    readonly verifiedBackup?: boolean;
  },
): Promise<PostgresMigrationStatus> {
  if (input.verifiedBackup !== true)
    throw new TypeError("Interop rollback requires a verified external backup");
  return rollbackPostgresMigration(pool, {
    applicationId,
    schema: input.schema,
    migrations: await migrations(),
    expectedCurrentVersion: input.expectedCurrentVersion,
    confirm: input.confirm,
    allowDataLoss: input.allowDataLoss,
  });
}
