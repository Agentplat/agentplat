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
import { getCollectiveRollbackReadinessV1 } from "./repositories.js";

const applicationId = "@agentplat/collective-control-postgres";
const migrationName = "001_collective_control";

export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface CollectiveControlPostgresMigrationOptions {
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
        to_regclass('__AGENTPLAT_SCHEMA__.collective_authority_states') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.collective_execution_states') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.collective_action_grants') IS NOT NULL
        AND to_regclass('__AGENTPLAT_SCHEMA__.collective_evidence_records') IS NOT NULL
        AS present
    `,
    },
  ] as const;
}

export async function runMigrations(
  pool: Pool,
  options: CollectiveControlPostgresMigrationOptions = {},
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
  options: CollectiveControlPostgresMigrationOptions = {},
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
  input: CollectiveControlPostgresMigrationOptions & {
    readonly expectedCurrentVersion: number;
    readonly confirm: string;
    readonly allowDataLoss?: boolean;
    readonly verifiedBackup?: boolean;
    readonly tenantId: string;
    readonly policyDomainId: string;
    readonly gatewayId: string;
  },
): Promise<PostgresMigrationStatus> {
  if (input.verifiedBackup !== true)
    throw new TypeError(
      "Collective rollback requires a verified external backup",
    );
  const readiness = await getCollectiveRollbackReadinessV1(pool, input);
  if (!readiness.ready)
    throw new TypeError("Collective rollback requires drained governed state");
  return rollbackPostgresMigration(pool, {
    applicationId,
    schema: input.schema,
    migrations: await migrations(),
    expectedCurrentVersion: input.expectedCurrentVersion,
    confirm: input.confirm,
    allowDataLoss: input.allowDataLoss,
  });
}
