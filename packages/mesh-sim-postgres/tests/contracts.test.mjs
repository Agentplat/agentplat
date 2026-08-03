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
