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

const applicationId = "@agentplat/collective-membership-postgres";
const migrationNames = [
  "001_collective_membership",
  "002_governed_agent_states",
] as const;

export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface CollectiveMembershipPostgresMigrationOptionsV1 {
  readonly schema?: string;
  readonly createSchema?: boolean;
}

async function migrations() {
  const files = await Promise.all(migrationNames.map(async (name) => {
    const [up, down] = await Promise.all([
      readFile(new URL(`../migrations/${name}.up.sql`, import.meta.url), "utf8"),
      readFile(new URL(`../migrations/${name}.down.sql`, import.meta.url), "utf8"),
    ]);
    return { name, up, down };
  }));
  return [
    {
      version: 1,
      ...files[0],
      destructiveDown: true,
      adoptIf: `
        SELECT
          to_regclass('__AGENTPLAT_SCHEMA__.collective_membership_heads') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_membership_configurations') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_membership_vote_slots') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_membership_responses') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_membership_certificates') IS NOT NULL
          AS present
      `,
    },
    {
      version: 2,
      ...files[1],
      destructiveDown: true,
      adoptIf: `
        SELECT
          to_regclass('__AGENTPLAT_SCHEMA__.collective_membership_agent_states') IS NOT NULL
          AS present
      `,
    },
  ] as const;
}

export async function runMigrations(
  pool: Pool,
  options: CollectiveMembershipPostgresMigrationOptionsV1 = {},
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
  options: CollectiveMembershipPostgresMigrationOptionsV1 = {},
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
  input: CollectiveMembershipPostgresMigrationOptionsV1 & {
    readonly expectedCurrentVersion: number;
    readonly confirm: string;
    readonly allowDataLoss?: boolean;
    readonly verifiedBackup?: boolean;
  },
): Promise<PostgresMigrationStatus> {
  if (input.verifiedBackup !== true)
    throw new TypeError(
      "Membership rollback requires a verified external backup",
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
