import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRoomCoordinator,
  ExplicitReferenceRoutingStrategy,
  InMemoryRoomParticipantMembershipStore,
  RoomParticipantMembershipCoordinator,
} from '@agentplat/rooms';

test('participant membership controls routing eligibility through revisioned lifecycle', async () => {
  const state = {
    room: { status: 'active' },
    participants: [
      {
        id: 'agent-1',
        type: 'agent',
        displayName: 'Research',
        metadata: { aliases: ['research'] },
      },
    ],
    messages: [
      { id: 'message-1', role: 'human', content: '@research continue.' },
    ],
  };
  const rooms = { getRoomState: async () => structuredClone(state) };
  const memberships = new RoomParticipantMembershipCoordinator(
    rooms,
    new InMemoryRoomParticipantMembershipStore()
  );
  const enabled = await memberships.create({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    participantId: 'agent-1',
  });
  const coordinator = new AgentRoomCoordinator(
    rooms,
    new ExplicitReferenceRoutingStrategy(),
    memberships
  );
  assert.equal(
    (
      await coordinator.routeMessage({
        tenantId: 'tenant-1',
        roomId: 'room-1',
        messageId: 'message-1',
      })
    ).kind,
    'assigned'
  );

  await memberships.transition({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    participantId: 'agent-1',
    expectedRevision: enabled.revision,
    status: 'suspended',
  });
  assert.deepEqual(
    await coordinator.routeMessage({
      tenantId: 'tenant-1',
      roomId: 'room-1',
      messageId: 'message-1',
    }),
    { kind: 'unassigned', reason: 'no_eligible_participant' }
  );
});
