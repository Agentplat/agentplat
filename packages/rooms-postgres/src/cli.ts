#!/usr/bin/env node
import { createPostgresPool } from './pool.js';
import { rollbackMigrations, runMigrations } from './migrations.js';

const direction = process.argv[2] ?? 'up';
if (direction !== 'up' && direction !== 'down') {
  console.error('Usage: rooms-postgres migration [up|down]');
  process.exitCode = 2;
} else {
  const pool = createPostgresPool();
  try {
    if (direction === 'up') {
      await runMigrations(pool);
      console.log('Agent Room PostgreSQL migrations are up to date.');
    } else {
      await rollbackMigrations(pool);
      console.log('Agent Room PostgreSQL migration rolled back.');
    }
  } finally {
    await pool.end();
  }
}
