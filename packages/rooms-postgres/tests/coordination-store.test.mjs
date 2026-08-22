import assert from 'node:assert/strict';
import test from 'node:test';

import { PostgresAgentRoomCoordinationStore } from '../dist/index.js';

test('PostgreSQL Agent Room coordination store applies revision CAS', async () => {
  const calls = [];
  const store = new PostgresAgentRoomCoordinationStore(
    {
      query: async (sql, values) => {
        calls.push({ sql, values });
        return { rowCount: 1, rows: [] };
      },
    },
    { schema: 'agentplat_rooms' }
  );
  const state = {
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    revision: 0,
    status: 'idle',
    items: [],
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
  };
  assert.equal(
    await store.compareAndSet({ expectedRevision: null, state }),
    true
  );
  assert.match(calls[0].sql, /room_coordination_state/);
  assert.equal(
    await store.compareAndSet({
      expectedRevision: 0,
      state: { ...state, revision: 1, status: 'routing' },
    }),
    true
  );
  assert.equal(calls[1].values[7], 0);
});
