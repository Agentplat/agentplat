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

const applicationId = "@agentplat/collective-quorum-postgres";
const legacyMigrationName = "001_collective_quorum";
const agreementMigrationName = "002_collective_agreement";
const sparseRuntimeMigrationName = "003_sparse_runtime_state";

export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface CollectiveQuorumPostgresMigrationOptionsV1 {
  readonly schema?: string;
  readonly createSchema?: boolean;
}

async function migrations() {
  const [
    legacyUp,
    legacyDown,
    agreementUp,
    agreementDown,
    sparseRuntimeUp,
    sparseRuntimeDown,
  ] = await Promise.all([
    readFile(
      new URL(`../migrations/${legacyMigrationName}.up.sql`, import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(`../migrations/${legacyMigrationName}.down.sql`, import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${agreementMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${agreementMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(`../migrations/${sparseRuntimeMigrationName}.up.sql`, import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(`../migrations/${sparseRuntimeMigrationName}.down.sql`, import.meta.url),
      "utf8",
    ),
  ]);
  return [
    {
      version: 1,
      name: legacyMigrationName,
      up: legacyUp,
      down: legacyDown,
      destructiveDown: true,
      adoptIf: `
        SELECT
          to_regclass('__AGENTPLAT_SCHEMA__.collective_quorum_assignment_slots') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_quorum_recovery_acceptors') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_quorum_responses') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_quorum_certificates') IS NOT NULL
          AS present
      `,
    },
    {
      version: 2,
      name: agreementMigrationName,
      up: agreementUp,
      down: agreementDown,
      destructiveDown: true,
      adoptIf: `
        SELECT
          to_regclass('__AGENTPLAT_SCHEMA__.collective_agreement_states') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_agreement_local_votes') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_agreement_observed_votes') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.collective_agreement_commits') IS NOT NULL
          AS present
      `,
    },
    {
      version: 3,
      name: sparseRuntimeMigrationName,
      up: sparseRuntimeUp,
      down: sparseRuntimeDown,
      destructiveDown: true,
      adoptIf: `
        SELECT
          to_regclass('__AGENTPLAT_SCHEMA__.collective_sparse_runtime_states') IS NOT NULL
          AS present
      `,
    },
  ] as const;
}

export async function runMigrations(
  pool: Pool,
  options: CollectiveQuorumPostgresMigrationOptionsV1 = {},
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
  options: CollectiveQuorumPostgresMigrationOptionsV1 = {},
): Promise<PostgresMigrationStatus> {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    schema: options.schema,
    migrations: await migrations(),
  });
}

export function rollbackConfirmation(
  schema = defaultPostgresSchema,
  version = 3,
): string {
  return postgresRollbackConfirmation(applicationId, schema, version);
}

export async function rollbackMigrations(
  pool: Pool,
  input: CollectiveQuorumPostgresMigrationOptionsV1 & {
    readonly expectedCurrentVersion: number;
    readonly confirm: string;
    readonly allowDataLoss?: boolean;
    readonly verifiedBackup?: boolean;
  },
): Promise<PostgresMigrationStatus> {
  if (input.verifiedBackup !== true)
    throw new TypeError("Quorum rollback requires a verified external backup");
  return rollbackPostgresMigration(pool, {
    applicationId,
    schema: input.schema,
    migrations: await migrations(),
    expectedCurrentVersion: input.expectedCurrentVersion,
    confirm: input.confirm,
    allowDataLoss: input.allowDataLoss,
  });
}
