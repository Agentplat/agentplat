#!/usr/bin/env node
import { createPostgresPool } from './pool.js';
import {
  getMigrationStatus,
  rollbackMigrations,
  runMigrations,
} from './migrations.js';

const direction = process.argv[2] ?? 'up';
if (!['up', 'down', 'status'].includes(direction)) {
  console.error('Usage: rooms-postgres migration [up|down|status]');
  process.exitCode = 2;
} else {
  const pool = createPostgresPool();
  try {
    if (direction === 'up') {
      const status = await runMigrations(pool, {
        schema: process.env.AGENTPLAT_DB_SCHEMA,
        createSchema: process.env.AGENTPLAT_DB_CREATE_SCHEMA === 'true',
      });
      console.log(
        `Agent Room PostgreSQL schema is at version ${status.currentVersion}.`
      );
    } else if (direction === 'down') {
      const status = await rollbackMigrations(pool, {
        schema: process.env.AGENTPLAT_DB_SCHEMA,
        expectedCurrentVersion: Number(
          process.env.AGENTPLAT_MIGRATE_DOWN_VERSION
        ),
        confirm: process.env.AGENTPLAT_MIGRATE_DOWN_CONFIRM ?? '',
        allowDataLoss: process.env.AGENTPLAT_ALLOW_DATA_LOSS === 'true',
      });
      console.log(
        `Agent Room PostgreSQL schema is at version ${status.currentVersion}.`
      );
    } else {
      const status = await getMigrationStatus(pool, {
        schema: process.env.AGENTPLAT_DB_SCHEMA,
      });
      console.log(JSON.stringify(status));
    }
  } finally {
    await pool.end();
  }
}
