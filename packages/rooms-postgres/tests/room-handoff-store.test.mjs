import assert from 'node:assert/strict';
import test from 'node:test';

import { PostgresRoomHandoffStore } from '../dist/index.js';

test('PostgreSQL Room Handoff store uses tenant-scoped CAS', async () => {
  const calls = [];
  const store = new PostgresRoomHandoffStore(
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
    handoffId: 'handoff-1',
    sourceRunId: 'run-1',
    revision: 0,
    status: 'proposed',
    events: [],
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
  };
  assert.equal(
    await store.compareAndSet({ expectedRevision: null, state }),
    true
  );
  assert.match(calls[0].sql, /"agentplat_rooms"\.room_handoffs/);
  assert.equal(
    await store.compareAndSet({
      expectedRevision: 0,
      state: { ...state, revision: 1, status: 'accepted' },
    }),
    true
  );
  assert.match(calls[1].sql, /AND revision = \$9/);
  assert.equal(calls[1].values[8], 0);
});
