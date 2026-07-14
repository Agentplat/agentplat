import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

export interface PostgresPoolOptions extends PoolConfig {
  /** Falls back to DATABASE_URL, then to pg's standard PG* environment variables. */
  connectionString?: string;
}

export function createPostgresPool(options: PostgresPoolOptions = {}): Pool {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  return new Pool({
    ...options,
    ...(connectionString ? { connectionString } : {}),
  });
}
