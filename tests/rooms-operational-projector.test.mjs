import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRoomOperationalEventProjector,
  InMemoryAgentRoomCoordinationStore,
  InMemoryAgentRoomProjectionCheckpointStore,
} from '@agentplat/rooms';

test('accepted Handoff operational event is projected idempotently into coordination', async () => {
  const events = [
    {
      sequence: 1,
      source: 'room_handoffs',
      sourceId: 'handoff-1',
      eventType: 'accepted',
    },
  ];
  const coordination = new InMemoryAgentRoomCoordinationStore();
  const projector = new AgentRoomOperationalEventProjector(
    {
      listAfter: async ({ afterSequence }) =>
        events.filter((event) => event.sequence > afterSequence),
    },
    new InMemoryAgentRoomProjectionCheckpointStore(),
    coordination,
    { get: async () => ({ handoffId: 'handoff-1', status: 'accepted' }) }
  );
  const first = await projector.project({
    tenantId: 'tenant-1',
    roomId: 'room-1',
  });
  assert.equal(first.projected, 1);
  const state = await coordination.load('tenant-1', 'room-1', 'room:room-1');
  assert.deepEqual(state.items[0], {
    itemId: 'handoff:handoff-1',
    kind: 'handoff',
    referenceId: 'handoff-1',
    status: 'pending',
    operationId: 'room:room-1:handoff:handoff:handoff-1',
    attempts: 0,
    runIds: [],
  });
  const replay = await projector.project({
    tenantId: 'tenant-1',
    roomId: 'room-1',
  });
  assert.equal(replay.projected, 0);
});
