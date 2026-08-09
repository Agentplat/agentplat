import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('migration keeps immutable blob, binding, state CAS and slot boundaries', async () => {
  const sql = await readFile(
    new URL('../migrations/001_mesh_sim_durability.up.sql', import.meta.url),
    'utf8',
  );
  for (const table of [
    'mesh_sim_artifact_blobs',
    'mesh_sim_artifact_bindings',
    'mesh_sim_execution_states',
    'mesh_sim_slot_commits',
  ])
    assert.match(
      sql,
      new RegExp(`CREATE TABLE __AGENTPLAT_SCHEMA__\\.${table}`),
    );
  assert.match(sql, /PRIMARY KEY \(namespace, artifact_id\)/);
  assert.match(sql, /PRIMARY KEY \(namespace, execution_id\)/);
  assert.match(sql, /PRIMARY KEY \(namespace, run_key\)/);
  assert.match(sql, /FOREIGN KEY \(namespace, content_sha256\)/);
  for (const column of [
    'execution_id',
    'registration_digest',
    'cell_id',
    'fence_worker_id',
    'fence_lease_token',
    'fence_generation',
    'fence_expires_at_ms',
    'operation_expires_at_ms',
  ])
    assert.match(sql, new RegExp(`\\b${column}\\b`));
  assert.equal(
    (sql.match(/\boperation_expires_at_ms bigint\b/g) ?? []).length,
    2,
  );
});

test('migration 002 binds scalable runner checkpoints and has an explicit rollback', async () => {
  const up = await readFile(
    new URL(
      '../migrations/002_scalable_evaluation_checkpoints.up.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const down = await readFile(
    new URL(
      '../migrations/002_scalable_evaluation_checkpoints.down.sql',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(
    up,
    /CREATE TABLE __AGENTPLAT_SCHEMA__\.mesh_sim_scalable_evaluation_checkpoints/,
  );
  assert.match(up, /PRIMARY KEY \(namespace, run_id\)/);
  assert.match(up, /revision bigint NOT NULL CHECK \(revision > 0\)/);
  assert.match(up, /previous_checkpoint_digest/);
  for (const binding of [
    'definition_digest',
    'adapter_descriptor_digest',
    'schedule_digest',
    'ports_digest',
    'configuration_digest',
    'checkpoint_sha256',
    'checkpoint_bytes',
  ])
    assert.match(up, new RegExp(`\\b${binding}\\b`));
  assert.match(up, /checkpoint_bytes BETWEEN 1 AND 67108864/);
  assert.match(
    down,
    /DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__\.mesh_sim_scalable_evaluation_checkpoints/,
  );
  const runner = await readFile(new URL('../src/migrations.ts', import.meta.url), 'utf8');
  assert.match(runner, /version: 2/);
  assert.match(runner, /name: 'scalable_evaluation_checkpoints'/);
  assert.match(runner, /002_scalable_evaluation_checkpoints\.down\.sql/);
  assert.match(runner, /destructiveDown: true/);
});
