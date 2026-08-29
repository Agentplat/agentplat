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

const applicationId = "@agentplat/workflows-postgres";
const migrationName = "001_governed_workflows";

export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface WorkflowPostgresMigrationOptionsV1 {
  readonly schema?: string;
  readonly createSchema?: boolean;
}

async function migrations() {
  const [up, down] = await Promise.all([
    readFile(
      new URL(`../migrations/${migrationName}.up.sql`, import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(`../migrations/${migrationName}.down.sql`, import.meta.url),
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
      adoptIf: `
        SELECT
          to_regclass('__AGENTPLAT_SCHEMA__.workflow_process_runs') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.workflow_task_runs') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.workflow_outcomes') IS NOT NULL
          AS present
      `,
    },
  ] as const;
}

export async function runMigrations(
  pool: Pool,
  options: WorkflowPostgresMigrationOptionsV1 = {},
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
  options: WorkflowPostgresMigrationOptionsV1 = {},
): Promise<PostgresMigrationStatus> {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    schema: options.schema,
    migrations: await migrations(),
  });
}

export function rollbackConfirmation(
  schema = defaultPostgresSchema,
  version = 1,
): string {
  return postgresRollbackConfirmation(applicationId, schema, version);
}

export async function rollbackMigrations(
  pool: Pool,
  input: WorkflowPostgresMigrationOptionsV1 & {
    readonly expectedCurrentVersion: number;
    readonly confirm: string;
    readonly allowDataLoss?: boolean;
    readonly verifiedBackup?: boolean;
  },
): Promise<PostgresMigrationStatus> {
  if (input.verifiedBackup !== true)
    throw new TypeError(
      "Workflow rollback requires a verified external backup",
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
