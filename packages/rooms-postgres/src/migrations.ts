import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';

const migrationName = '001_agent_rooms';
const migrationLock = 'agentplat:rooms:migrations';

export const migrationDirectory = fileURLToPath(
  new URL('../migrations/', import.meta.url)
);

async function migrationSql(direction: 'up' | 'down'): Promise<string> {
  return readFile(
    new URL(`../migrations/${migrationName}.${direction}.sql`, import.meta.url),
    'utf8'
  );
}

async function hasMigrationTable(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "SELECT to_regclass('public.agentplat_schema_migrations') IS NOT NULL AS present"
  );
  return result.rows[0]?.present === true;
}

async function isApplied(client: PoolClient): Promise<boolean> {
  if (!(await hasMigrationTable(client))) return false;
  const result = await client.query(
    'SELECT 1 FROM public.agentplat_schema_migrations WHERE name = $1',
    [migrationName]
  );
  return (result.rowCount ?? 0) > 0;
}

async function withMigrationLock<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [
      migrationLock,
    ]);
    try {
      return await operation(client);
    } catch (error) {
      // The packaged SQL owns BEGIN/COMMIT. An error leaves the connection in
      // an aborted transaction until it is explicitly rolled back.
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    await client
      .query('SELECT pg_advisory_unlock(hashtext($1))', [migrationLock])
      .catch(() => undefined);
    client.release();
  }
}

/** Apply the packaged schema migration once. Safe to call during every startup. */
export async function runMigrations(pool: Pool): Promise<void> {
  await withMigrationLock(pool, async (client) => {
    if (await isApplied(client)) return;
    await client.query(await migrationSql('up'));
  });
}

/** Roll back the packaged schema migration when it is currently applied. */
export async function rollbackMigrations(pool: Pool): Promise<void> {
  await withMigrationLock(pool, async (client) => {
    if (!(await isApplied(client))) return;
    await client.query(await migrationSql('down'));
  });
}
