import assert from 'node:assert/strict';
import test from 'node:test';

import { PostgresRoomExecutionSessionStore } from '../dist/index.js';

test('PostgreSQL execution session store performs tenant-scoped CAS writes', async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT')) {
        return { rows: [{ state: { sessionId: 'session-1', revision: 1 } }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const store = new PostgresRoomExecutionSessionStore(pool, {
    schema: 'agentplat_rooms',
  });
  const state = {
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'session-1',
    runId: 'run-1',
    taskId: 'task-1',
    participantId: 'agent-1',
    revision: 0,
    status: 'active',
    interventions: [],
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
  };

  assert.equal(
    await store.compareAndSet({ expectedRevision: null, state }),
    true
  );
  assert.match(calls[0].sql, /"agentplat_rooms"\.room_execution_sessions/);
  assert.deepEqual(calls[0].values.slice(0, 4), [
    'tenant-1',
    'room-1',
    'session-1',
    'run-1',
  ]);

  assert.equal(
    await store.compareAndSet({
      expectedRevision: 0,
      state: { ...state, revision: 1 },
    }),
    true
  );
  assert.match(calls[1].sql, /AND revision = \$8/);
  assert.equal(calls[1].values[7], 0);

  assert.deepEqual(await store.load('tenant-1', 'room-1', 'session-1'), {
    sessionId: 'session-1',
    revision: 1,
  });
  assert.deepEqual(calls[2].values, ['tenant-1', 'room-1', 'session-1']);
});

test('PostgreSQL execution session store rejects invalid revision transitions locally', async () => {
  let called = false;
  const store = new PostgresRoomExecutionSessionStore(
    {
      query: async () => {
        called = true;
        return { rowCount: 1, rows: [] };
      },
    },
    { schema: 'public' }
  );
  const state = {
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'session-1',
    runId: 'run-1',
    taskId: 'task-1',
    participantId: 'agent-1',
    revision: 4,
    status: 'active',
    interventions: [],
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
  };

  assert.equal(
    await store.compareAndSet({ expectedRevision: 1, state }),
    false
  );
  assert.equal(called, false);
});
