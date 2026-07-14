import { createPostgresPool, runMigrations } from '@agentplat/rooms-postgres';

const pool = createPostgresPool();

try {
  await runMigrations(pool);
  console.log('Agent Room database migrations are up to date.');
} catch (error) {
  console.error('Agent Room database migration failed.', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
