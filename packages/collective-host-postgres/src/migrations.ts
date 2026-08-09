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

const applicationId = "@agentplat/collective-host-postgres";
const migrationNames = [
  "001_collective_host_runtime",
  "002_collective_host_interop",
  "003_collective_host_assurance",
  "004_anytime_semantic_guarantees",
  "005_collective_host_telemetry_outbox",
  "006_semantic_horizon_budgets",
  "007_assurance_effect_checkpoints",
  "008_autonomous_node_advances",
] as const;

export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface CollectiveHostPostgresMigrationOptionsV1 {
  readonly schema?: string;
  readonly createSchema?: boolean;
}

async function migrations() {
  const files = await Promise.all(
    migrationNames.map(async (name) => {
      const [up, down] = await Promise.all([
        readFile(
          new URL(`../migrations/${name}.up.sql`, import.meta.url),
          "utf8",
        ),
        readFile(
          new URL(`../migrations/${name}.down.sql`, import.meta.url),
          "utf8",
        ),
      ]);
      return { name, up, down };
    }),
  );
  return [
    {
      version: 1,
      ...files[0],
      destructiveDown: true,
    },
    {
      version: 2,
      ...files[1],
      destructiveDown: true,
    },
    {
      version: 3,
      ...files[2],
      destructiveDown: true,
    },
    {
      version: 4,
      ...files[3],
      destructiveDown: true,
    },
    {
      version: 5,
      ...files[4],
      destructiveDown: true,
    },
    {
      version: 6,
      ...files[5],
      destructiveDown: true,
    },
    {
      version: 7,
      ...files[6],
      destructiveDown: true,
    },
    {
      version: 8,
      ...files[7],
      destructiveDown: true,
    },
  ] as const;
}

export async function runMigrations(
  pool: Pool,
  options: CollectiveHostPostgresMigrationOptionsV1 = {},
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
  options: CollectiveHostPostgresMigrationOptionsV1 = {},
): Promise<PostgresMigrationStatus> {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    schema: options.schema,
    migrations: await migrations(),
  });
}

export function rollbackConfirmation(schema = defaultPostgresSchema): string {
  return postgresRollbackConfirmation(applicationId, schema, 8);
}

export async function rollbackMigrations(
  pool: Pool,
  input: CollectiveHostPostgresMigrationOptionsV1 & {
    readonly expectedCurrentVersion: number;
    readonly confirm: string;
    readonly allowDataLoss?: boolean;
    readonly verifiedBackup?: boolean;
  },
): Promise<PostgresMigrationStatus> {
  if (input.verifiedBackup !== true)
    throw new TypeError(
      "Collective host rollback requires a verified external backup",
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
