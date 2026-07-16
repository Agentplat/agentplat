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

const applicationId = '@agentplat/audit-postgres';
const migrationName = '001_audit_and_session_events';

export const auditMigrationDirectory = fileURLToPath(
  new URL('../migrations/', import.meta.url)
);

export interface AuditPostgresMigrationOptions {
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
    },
  ];
}

export async function runAuditMigrations(
  pool: Pool,
  options: AuditPostgresMigrationOptions = {}
): Promise<PostgresMigrationStatus> {
  return runPostgresMigrations(pool, {
    applicationId,
    schema: options.schema,
    createSchema: options.createSchema,
    migrations: await migrations(),
  });
}

export async function getAuditMigrationStatus(
  pool: Pool,
  options: AuditPostgresMigrationOptions = {}
): Promise<PostgresMigrationStatus> {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    schema: options.schema,
    migrations: await migrations(),
  });
}

export function auditRollbackConfirmation(
  schema = defaultPostgresSchema,
  version = 1
): string {
  return postgresRollbackConfirmation(applicationId, schema, version);
}

export async function rollbackAuditMigrations(
  pool: Pool,
  options: AuditPostgresMigrationOptions & {
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
