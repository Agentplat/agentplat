#!/usr/bin/env node
import { createPostgresPool } from '@agentplat/postgres';
import {
  getAuditMigrationStatus,
  rollbackAuditMigrations,
  runAuditMigrations,
} from './migrations.js';

const direction = process.argv[2] ?? 'up';
const schema = process.env.AGENTPLAT_DB_SCHEMA;
const pool = createPostgresPool();

try {
  if (direction === 'up') {
    const status = await runAuditMigrations(pool, {
      schema,
      createSchema: process.env.AGENTPLAT_DB_CREATE_SCHEMA === 'true',
    });
    console.log(
      `Audit PostgreSQL schema is at version ${status.currentVersion}.`
    );
  } else if (direction === 'down') {
    const version = Number(process.env.AGENTPLAT_MIGRATE_DOWN_VERSION);
    const status = await rollbackAuditMigrations(pool, {
      schema,
      expectedCurrentVersion: version,
      confirm: process.env.AGENTPLAT_MIGRATE_DOWN_CONFIRM ?? '',
      allowDataLoss: process.env.AGENTPLAT_ALLOW_DATA_LOSS === 'true',
    });
    console.log(
      `Audit PostgreSQL schema is at version ${status.currentVersion}.`
    );
  } else if (direction === 'status') {
    const status = await getAuditMigrationStatus(pool, { schema });
    console.log(JSON.stringify(status));
  } else {
    console.error('Usage: audit-postgres migration [up|down|status]');
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
