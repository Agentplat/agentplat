import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRoomCoordinationRuntime,
  AgentRoomCoordinationWorker,
  InMemoryRoomRepository,
  RepositoryAgentRoomCoordinationStore,
  RoomService,
} from '@agentplat/rooms';

test('continuous worker discovers automatically enqueued messages and completes coordination', async () => {
  const repository = new InMemoryRoomRepository();
  const rooms = new RoomService({ repository, automaticCoordination: {} });
  const room = await rooms.createRoom('tenant-1', {
    title: 'Worker Room',
    goal: 'Process without manual enqueue',
  });
  await rooms.sendMessage('tenant-1', room.id, {
    role: 'human',
    content: 'Run automatically.',
  });
  const store = new RepositoryAgentRoomCoordinationStore(repository);
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
  const worker = new AgentRoomCoordinationWorker(store, runtime, {
    workerId: 'worker-1',
    pollMs: 1,
    leaseMs: 30,
  });
  const metrics = await worker.runOnce();
  assert.equal(metrics.completed, 1);
  const state = await store.load('tenant-1', room.id, `room:${room.id}`);
  assert.equal(state.status, 'completed');
  assert.equal(state.items[0].attempts, 1);
});

test('continuous worker supports wakeup and graceful shutdown', async () => {
  const store = new (class {
    async listReady() {
      return [];
    }
    async load() {}
    async compareAndSet() {
      return false;
    }
  })();
  const worker = new AgentRoomCoordinationWorker(store, {}, { pollMs: 60_000 });
  const running = worker.start();
  worker.notify();
  worker.stop();
  await running;
  assert.equal(worker.metrics().active, 0);
});
