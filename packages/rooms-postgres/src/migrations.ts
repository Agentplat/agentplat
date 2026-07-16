import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  defaultPostgresSchema,
  getPostgresMigrationStatus,
  postgresRollbackConfirmation,
  rollbackPostgresMigration,
  runPostgresMigrations,
} from '@agentplat/postgres';
import type {
  PostgresMigration,
  PostgresMigrationStatus,
} from '@agentplat/postgres';
import type { Pool } from 'pg';

const applicationId = '@agentplat/rooms-postgres';
const migrationName = '001_agent_rooms';

export const migrationDirectory = fileURLToPath(
  new URL('../migrations/', import.meta.url)
);

export interface RoomPostgresMigrationOptions {
  schema?: string;
  createSchema?: boolean;
}

async function migrations(): Promise<PostgresMigration[]> {
  const [up, down] = await Promise.all([
    readFile(
      new URL(`../migrations/${migrationName}.up.sql`, import.meta.url),
      'utf8'
    ),
    readFile(
      new URL(`../migrations/${migrationName}.down.sql`, import.meta.url),
      'utf8'
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
          to_regclass('__AGENTPLAT_SCHEMA__.rooms') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.events') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.artifact_versions') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.agentplat_schema_migrations') IS NOT NULL
          AS present
      `,
    },
  ];
}

export async function runMigrations(
  pool: Pool,
  options: RoomPostgresMigrationOptions = {}
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
  options: RoomPostgresMigrationOptions = {}
): Promise<PostgresMigrationStatus> {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    schema: options.schema,
    migrations: await migrations(),
  });
}

export function rollbackConfirmation(
  schema = defaultPostgresSchema,
  version = 1
): string {
  return postgresRollbackConfirmation(applicationId, schema, version);
}

/** Roll back one version only after explicit version and data-loss confirmation. */
export async function rollbackMigrations(
  pool: Pool,
  options: RoomPostgresMigrationOptions & {
    expectedCurrentVersion: number;
    confirm: string;
    allowDataLoss?: boolean;
  }
): Promise<PostgresMigrationStatus> {
  return rollbackPostgresMigration(pool, {
    applicationId,
    schema: options.schema,
    createSchema: false,
    migrations: await migrations(),
    expectedCurrentVersion: options.expectedCurrentVersion,
    confirm: options.confirm,
    allowDataLoss: options.allowDataLoss,
  });
}
