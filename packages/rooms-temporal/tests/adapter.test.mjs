import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentRoomCoordinationRuntime,
  InMemoryAgentRoomCoordinationStore,
} from '@agentplat/rooms';
import {
  createTemporalAgentRoomActivities,
  TemporalAgentRoomCoordinationAdapter,
} from '../dist/index.js';

test('Temporal adapter uses signal-with-start without owning Room state', async () => {
  const calls = [];
  const adapter = new TemporalAgentRoomCoordinationAdapter({
    client: {
      workflow: {
        signalWithStart: async (...args) => calls.push(args),
      },
    },
    taskQueue: 'agent-rooms',
  });
  await adapter.notify({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 4,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].taskQueue, 'agent-rooms');
  assert.deepEqual(calls[0][1].signalArgs, [4]);
});

test('Temporal activity executes the canonical coordination runtime', async () => {
  const store = new InMemoryAgentRoomCoordinationStore();
  const runtime = new AgentRoomCoordinationRuntime(
    store,
    {
      routeMessage: async () => ({
        kind: 'assigned',
        participantIds: ['agent-1'],
        basis: 'router',
      }),
    },
    { get: async () => ({ status: 'accepted' }) },
    {
      dispatchMessage: async () => ({ status: 'completed', runIds: ['run-1'] }),
      dispatchHandoff: async () => ({ status: 'completed' }),
    }
  );
  await runtime.initialize({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
  });
  await runtime.enqueue({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 0,
    itemId: 'message-1',
    kind: 'message',
    referenceId: 'message-1',
  });

  const activities = createTemporalAgentRoomActivities({ runtime, store });
  const result = await activities.runCoordinationCycle({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 1,
    leaseToken: 'temporal-activity-1',
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.hasPending, false);
  assert.equal(result.revision, 3);
});
