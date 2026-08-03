import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  getPostgresMigrationStatus,
  postgresRollbackConfirmation,
  rollbackPostgresMigration,
  runPostgresMigrations,
  type PostgresMigration,
  type PostgresMigrationStatus,
} from '@agentplat/postgres';
import type { Pool } from 'pg';

const APPLICATION_ID = 'agentplat-mesh-sim';

export const meshSimPostgresMigrationDirectoryV1 = fileURLToPath(
  new URL('../migrations/', import.meta.url),
);

const migrations = Object.freeze([
  Object.freeze({
    version: 1,
    name: 'mesh_sim_durability',
    up: readFileSync(
      new URL('../migrations/001_mesh_sim_durability.up.sql', import.meta.url),
      'utf8',
    ),
    down: readFileSync(
      new URL(
        '../migrations/001_mesh_sim_durability.down.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    destructiveDown: true,
  }),
] satisfies readonly PostgresMigration[]);

export interface MeshSimPostgresMigrationOptionsV1 {
  readonly schema?: string;
}

export function runMeshSimPostgresMigrationsV1(
  pool: Pool,
  options: MeshSimPostgresMigrationOptionsV1 = {},
): Promise<PostgresMigrationStatus> {
  return runPostgresMigrations(pool, {
    applicationId: APPLICATION_ID,
    schema: options.schema,
    migrations,
  });
}

export function getMeshSimPostgresMigrationStatusV1(
  pool: Pool,
  options: MeshSimPostgresMigrationOptionsV1 = {},
): Promise<PostgresMigrationStatus> {
  return getPostgresMigrationStatus(pool, {
    applicationId: APPLICATION_ID,
    schema: options.schema,
    migrations,
  });
}

export function rollbackMeshSimPostgresMigrationV1(
  pool: Pool,
  input: MeshSimPostgresMigrationOptionsV1 &
    Readonly<{
      expectedCurrentVersion: number;
      confirm: string;
      allowDataLoss?: boolean;
    }>,
): Promise<PostgresMigrationStatus> {
  return rollbackPostgresMigration(pool, {
    applicationId: APPLICATION_ID,
    schema: input.schema,
    migrations,
    expectedCurrentVersion: input.expectedCurrentVersion,
    confirm: input.confirm,
    allowDataLoss: input.allowDataLoss,
  });
}

export function meshSimPostgresRollbackConfirmationV1(
  schema: string,
  version: number,
): string {
  return postgresRollbackConfirmation(APPLICATION_ID, schema, version);
}
