import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresRoomConversationStore, runRoomConversationMigrations, getRoomConversationMigrationStatus } from '@agentplat/rooms-postgres';
import { PostgresArtifactStore, runMigrations } from '@agentplat/artifacts-postgres';
import { conversationScenarios } from './actor-conversation-scenarios.mjs';
import { artifactRoomAccessScenarios } from './artifact-room-access-scenarios.mjs';
const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
const schema = 'actor_consumer_' + randomUUID().replaceAll('-', '');
try {
  assert.equal((await runRoomConversationMigrations(pool, { schema, createSchema: true })).currentVersion, 1);
  assert.equal((await getRoomConversationMigrationStatus(pool, { schema })).currentVersion, 1);
  await conversationScenarios(new PostgresRoomConversationStore(pool, schema));
  await runMigrations(pool, { schema });
  await artifactRoomAccessScenarios(new PostgresArtifactStore(pool, schema));
  console.log('Actor-private conversation and shared-artifact package consumer passed.');
} finally {
  await pool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
  await pool.end();
}
