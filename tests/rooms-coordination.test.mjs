import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRoomCoordinator,
  ExplicitReferenceRoutingStrategy,
  PolicyBoundRoomRoutingStrategy,
  roomEventPage,
} from '@agentplat/rooms';

const request = {
  tenantId: 'tenant-1',
  roomId: 'room-1',
  message: {
    id: 'message-1',
    role: 'human',
    content: 'Please ask @Research and @writer to prepare the brief.',
  },
  candidates: [
    { participantId: 'agent-1', aliases: ['research'] },
    { participantId: 'agent-2', aliases: ['writer'] },
  ],
};

test('explicit Room references route deterministically in message order', async () => {
  const strategy = new ExplicitReferenceRoutingStrategy();

  assert.deepEqual(await strategy.route(request), {
    kind: 'assigned',
    participantIds: ['agent-1', 'agent-2'],
    basis: 'explicit_reference',
  });
});

test('policy-bound Room routing uses an eligible router choice then a default', async () => {
  const selected = new PolicyBoundRoomRoutingStrategy({
    select: async () => 'agent-2',
  });
  const withoutReference = {
    ...request,
    message: { ...request.message, content: 'Prepare the brief.' },
    defaultParticipantId: 'agent-1',
  };

  assert.deepEqual(await selected.route(withoutReference), {
    kind: 'assigned',
    participantIds: ['agent-2'],
    basis: 'router',
  });

  const defaulted = new PolicyBoundRoomRoutingStrategy({
    select: async () => null,
  });
  assert.deepEqual(await defaulted.route(withoutReference), {
    kind: 'assigned',
    participantIds: ['agent-1'],
    basis: 'default',
  });
});

test('Room routing rejects ambiguous aliases and ineligible router output', async () => {
  const explicit = new ExplicitReferenceRoutingStrategy();
  await assert.rejects(
    explicit.route({
      ...request,
      candidates: [
        { participantId: 'agent-1', aliases: ['shared'] },
        { participantId: 'agent-2', aliases: ['shared'] },
      ],
    }),
    /ambiguous/
  );

  const strategy = new PolicyBoundRoomRoutingStrategy({
    select: async () => 'agent-outside-room',
  });
  await assert.rejects(
    strategy.route({
      ...request,
      message: { ...request.message, content: 'Prepare the brief.' },
    }),
    /ineligible participant/
  );
});

test('Agent Room coordinator routes only persisted messages in active Rooms', async () => {
  const state = {
    room: { id: 'room-1', status: 'active' },
    participants: [
      {
        id: 'agent-1',
        type: 'agent',
        displayName: 'Research',
        metadata: { aliases: ['research'] },
      },
      { id: 'human-1', type: 'human', displayName: 'Owner' },
    ],
    messages: [request.message],
  };
  const coordinator = new AgentRoomCoordinator(
    { getRoomState: async () => state },
    new ExplicitReferenceRoutingStrategy()
  );

  assert.deepEqual(
    await coordinator.routeMessage({
      tenantId: 'tenant-1',
      roomId: 'room-1',
      messageId: 'message-1',
      eligibleParticipantIds: ['agent-1'],
    }),
    {
      kind: 'assigned',
      participantIds: ['agent-1'],
      basis: 'explicit_reference',
    }
  );

  state.room.status = 'paused';
  await assert.rejects(
    coordinator.routeMessage({
      tenantId: 'tenant-1',
      roomId: 'room-1',
      messageId: 'message-1',
    }),
    /Only active Agent Rooms/
  );
});

test('Room event pages use Room-bound cursors and expose remaining pages', () => {
  const events = Array.from({ length: 3 }, (_, index) => ({
    id: `event-${index + 1}`,
    roomId: 'room-1',
  }));
  const first = roomEventPage('room-1', events, { limit: 2 });
  assert.deepEqual(first.events, events.slice(0, 2));
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);

  const second = roomEventPage('room-1', events, {
    limit: 2,
    cursor: first.nextCursor,
  });
  assert.deepEqual(second.events, events.slice(2));
  assert.equal(second.hasMore, false);

  assert.throws(
    () =>
      roomEventPage('another-room', events, {
        cursor: first.nextCursor,
      }),
    /invalid for this Room/
  );
});
