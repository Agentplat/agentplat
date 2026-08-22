import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HumanContributionCoordinator,
  InMemoryHumanContributionStore,
} from '@agentplat/rooms';

function fixture() {
  const state = {
    participants: [
      {
        id: 'agent-1',
        type: 'agent',
        permissions: ['human_contribution.request'],
      },
      {
        id: 'human-1',
        type: 'human',
        permissions: ['human_contribution.complete'],
      },
      {
        id: 'owner-1',
        type: 'human',
        permissions: ['human_contribution.assign', 'human_contribution.cancel'],
      },
    ],
    artifacts: [{ id: 'artifact-1' }],
  };
  return new HumanContributionCoordinator(
    { getRoomState: async () => structuredClone(state) },
    new InMemoryHumanContributionStore(),
    { clock: () => new Date('2026-08-21T12:00:00.000Z') }
  );
}

test('human contribution follows assignment, start and completion lifecycle', async () => {
  const coordinator = fixture();
  const requested = await coordinator.request({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    contributionId: 'contribution-1',
    requestedByParticipantId: 'agent-1',
    instruction: 'Confirm the pricing assumptions.',
    expectedOutput: 'Approved assumptions and notes',
  });
  assert.equal(requested.status, 'requested');

  const assigned = await coordinator.assign({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    contributionId: 'contribution-1',
    expectedRevision: 0,
    assignedParticipantId: 'human-1',
    assignedByParticipantId: 'owner-1',
  });
  assert.equal(assigned.status, 'assigned');

  const started = await coordinator.start({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    contributionId: 'contribution-1',
    expectedRevision: 1,
    participantId: 'human-1',
  });
  assert.equal(started.status, 'in_progress');

  const completed = await coordinator.complete({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    contributionId: 'contribution-1',
    expectedRevision: 2,
    participantId: 'human-1',
    result: { approved: true, notes: 'Use the current assumptions.' },
    artifactIds: ['artifact-1'],
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.revision, 3);
  assert.deepEqual(completed.artifactIds, ['artifact-1']);
});

test('completion requires the assigned authorized human participant', async () => {
  const coordinator = fixture();
  await coordinator.request({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    contributionId: 'contribution-1',
    requestedByParticipantId: 'agent-1',
    assignedParticipantId: 'human-1',
    instruction: 'Confirm the assumptions.',
    expectedOutput: 'A decision',
  });
  await assert.rejects(
    coordinator.complete({
      tenantId: 'tenant-1',
      roomId: 'room-1',
      contributionId: 'contribution-1',
      expectedRevision: 0,
      participantId: 'owner-1',
      result: { approved: true },
    }),
    /Only the assigned participant/
  );
});
