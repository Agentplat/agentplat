import assert from 'node:assert/strict';
import test from 'node:test';

import { PostgresAgentDefinitionRegistryStore } from '../dist/index.js';

test('PostgreSQL agent registry uses tenant-scoped immutable inserts and lifecycle CAS', async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rowCount: 1, rows: [] };
    },
  };
  const store = new PostgresAgentDefinitionRegistryStore(pool, {
    schema: 'agentplat_rooms',
  });
  const agent = {
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    name: 'Agent One',
    createdAt: '2026-08-21T12:00:00.000Z',
  };
  assert.equal(await store.insertAgent(agent), true);
  assert.match(calls[0].sql, /"agentplat_rooms"\.registered_agents/);

  const definition = {
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    revisionId: 'agent-1@1.0.0:sha256:digest',
    version: '1.0.0',
    digest: `sha256:${'a'.repeat(64)}`,
    instructions: 'Complete the task.',
    capabilities: [],
    toolIds: [],
    knowledgeRefs: [],
    runtimeProfile: { platform: 'portable' },
    metadata: {},
    createdAt: agent.createdAt,
  };
  assert.equal(await store.insertRevision(definition), true);
  assert.match(calls[1].sql, /agent_definition_revisions/);

  const lifecycle = {
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    revisionId: definition.revisionId,
    revision: 0,
    status: 'draft',
    updatedAt: agent.createdAt,
  };
  assert.equal(
    await store.compareAndSetLifecycle({
      expectedRevision: null,
      lifecycle,
    }),
    true
  );
  assert.match(calls[2].sql, /agent_revision_lifecycle/);

  assert.equal(
    await store.compareAndSetLifecycle({
      expectedRevision: 0,
      lifecycle: { ...lifecycle, revision: 1, status: 'published' },
    }),
    true
  );
  assert.match(calls[3].sql, /AND revision = \$8/);
  assert.equal(calls[3].values[7], 0);

  assert.equal(
    await store.insertRevisionWithLifecycle({
      definition: { ...definition, revisionId: 'revision-atomic' },
      lifecycle: { ...lifecycle, revisionId: 'revision-atomic' },
    }),
    true
  );
  assert.match(calls[4].sql, /WITH inserted_revision AS/);
  assert.match(calls[4].sql, /INSERT INTO .*agent_revision_lifecycle/);
});

test('PostgreSQL agent registry rejects invalid lifecycle revision transitions locally', async () => {
  let called = false;
  const store = new PostgresAgentDefinitionRegistryStore({
    query: async () => {
      called = true;
      return { rowCount: 1, rows: [] };
    },
  });
  const lifecycle = {
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    revisionId: 'revision-1',
    revision: 4,
    status: 'published',
    updatedAt: '2026-08-21T12:00:00.000Z',
  };
  assert.equal(
    await store.compareAndSetLifecycle({
      expectedRevision: 1,
      lifecycle,
    }),
    false
  );
  assert.equal(called, false);
});
