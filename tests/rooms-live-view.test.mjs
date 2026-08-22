import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRoomLiveViewService,
  InMemoryRoomRepository,
  RoomService,
} from '@agentplat/rooms';

test('Agent Room live view returns a composite cursor and only new events', async () => {
  const rooms = new RoomService({ repository: new InMemoryRoomRepository() });
  const room = await rooms.createRoom('tenant-1', {
    title: 'Live Room',
    goal: 'Expose one live projection',
  });
  const live = new AgentRoomLiveViewService(rooms);
  const first = await live.get({ tenantId: 'tenant-1', roomId: room.id });
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].type, 'room_created');
  assert.ok(first.nextCursor);

  await rooms.sendMessage('tenant-1', room.id, {
    role: 'human',
    content: 'Continue.',
  });
  const second = await live.get({
    tenantId: 'tenant-1',
    roomId: room.id,
    cursor: first.nextCursor,
  });
  assert.deepEqual(
    second.events.map((event) => event.type),
    ['message_created']
  );
});

test('Agent Room live stream emits the version-neutral live view event', async () => {
  const rooms = new RoomService({ repository: new InMemoryRoomRepository() });
  const room = await rooms.createRoom('tenant-1', {
    title: 'Streaming Room',
    goal: 'Stream a live projection',
  });
  const live = new AgentRoomLiveViewService(rooms);
  const controller = new AbortController();
  const iterator = live
    .stream(
      { tenantId: 'tenant-1', roomId: room.id },
      { signal: controller.signal, pollMs: 1 }
    )
    [Symbol.asyncIterator]();
  const first = await iterator.next();
  controller.abort();
  await iterator.return();
  assert.equal(first.value.type, 'agent_room_live_view');
  assert.equal(first.value.payload.room.id, room.id);
});

test('Agent Room live view discovers Room-scoped projections without client IDs', async () => {
  const rooms = new RoomService({ repository: new InMemoryRoomRepository() });
  const room = await rooms.createRoom('tenant-1', {
    title: 'Discovery Room',
    goal: 'Discover every projection',
  });
  const live = new AgentRoomLiveViewService(
    rooms,
    { list: async () => [{ coordinationId: 'coordination-1' }] },
    {
      listSessions: async () => [{ sessionId: 'session-1' }],
      getSession: async () => ({ sessionId: 'session-1' }),
      listSessionEvents: async () => [],
    },
    {
      list: async () => [{ handoffId: 'handoff-1' }],
      get: async () => ({ handoffId: 'handoff-1', events: [] }),
    },
    {
      list: async () => [{ contributionId: 'contribution-1' }],
      get: async () => ({ contributionId: 'contribution-1', events: [] }),
    },
    { list: async () => [{ deliveryId: 'delivery-1' }] },
    { list: async () => [{ planId: 'plan-1' }] },
    { list: async () => [{ participantId: 'participant-1' }] }
  );
  const view = await live.get({ tenantId: 'tenant-1', roomId: room.id });
  assert.equal(view.coordinationStates.length, 1);
  assert.equal(view.executionSessions.length, 1);
  assert.equal(view.handoffs.length, 1);
  assert.equal(view.humanContributions.length, 1);
  assert.equal(view.deliveries.length, 1);
  assert.equal(view.plans.length, 1);
  assert.equal(view.participantMemberships.length, 1);
});
