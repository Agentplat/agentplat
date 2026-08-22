import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentDefinitionRegistry,
  AgentRoomHandoffCoordinator,
  InMemoryAgentDefinitionRegistryStore,
  InMemoryRoomHandoffStore,
} from '@agentplat/rooms';

async function setup() {
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 7, 21, 12, 0, tick++));
  const registry = new AgentDefinitionRegistry(
    new InMemoryAgentDefinitionRegistryStore(),
    { clock }
  );
  const revisions = {};
  for (const agentId of ['agent-a', 'agent-b', 'agent-c']) {
    await registry.createAgent({
      tenantId: 'tenant-1',
      agentId,
      name: agentId,
    });
    const draft = await registry.createRevision({
      tenantId: 'tenant-1',
      agentId,
      version: '1.0.0',
      instructions: `Instructions for ${agentId}`,
      runtimeProfile: { platform: 'portable' },
    });
    revisions[agentId] = draft.definition.revisionId;
    await registry.publishRevision('tenant-1', draft.definition.revisionId, 0);
  }
  const state = {
    room: { status: 'active' },
    participants: [
      {
        id: 'participant-a',
        type: 'agent',
        authorityLevel: 3,
        permissions: [],
        metadata: { agentId: 'agent-a' },
        runtime: { platform: 'portable' },
      },
      {
        id: 'participant-b',
        type: 'agent',
        authorityLevel: 3,
        permissions: ['handoff.accept'],
        metadata: { agentId: 'agent-b' },
        runtime: { platform: 'portable' },
      },
      {
        id: 'participant-c',
        type: 'agent',
        authorityLevel: 2,
        permissions: ['handoff.accept'],
        metadata: { agentId: 'agent-c' },
        runtime: { platform: 'portable' },
      },
    ],
    runs: [
      {
        id: 'run-a',
        taskId: 'task-a',
        participantId: 'participant-a',
        status: 'running',
      },
    ],
    messages: [{ id: 'message-1' }],
    artifacts: [{ id: 'artifact-1' }],
  };
  const coordinator = new AgentRoomHandoffCoordinator(
    { getRoomState: async () => structuredClone(state) },
    new InMemoryRoomHandoffStore(),
    registry,
    { clock, maximumDepth: 4 }
  );
  return { coordinator, revisions, state };
}

function proposal(revisions) {
  return {
    tenantId: 'tenant-1',
    roomId: 'room-1',
    handoffId: 'handoff-1',
    sourceParticipantId: 'participant-a',
    sourceRunId: 'run-a',
    sourceAgentRevisionId: revisions['agent-a'],
    targetParticipantId: 'participant-b',
    targetAgentRevisionId: revisions['agent-b'],
    instruction: 'Produce the supporting analysis.',
    contextMessageIds: ['message-1'],
    contextArtifactIds: ['artifact-1'],
    authorityCeiling: 3,
  };
}

test('proposes an attributable bounded Agent Room Handoff idempotently', async () => {
  const { coordinator, revisions } = await setup();
  const first = await coordinator.propose(proposal(revisions));
  const replay = await coordinator.propose(proposal(revisions));

  assert.equal(first.status, 'proposed');
  assert.equal(first.depth, 1);
  assert.deepEqual(first.participantPath, ['participant-a']);
  assert.equal(first.targetAgentRevisionId, revisions['agent-b']);
  assert.deepEqual(replay, first);
});

test('rejects self-delegation, authority widening and out-of-room context', async () => {
  const { coordinator, revisions } = await setup();
  await assert.rejects(
    coordinator.propose({
      ...proposal(revisions),
      targetParticipantId: 'participant-a',
      targetAgentRevisionId: revisions['agent-a'],
    }),
    /cannot target its source/
  );
  await assert.rejects(
    coordinator.propose({ ...proposal(revisions), authorityCeiling: 2 }),
    /cannot widen authority/
  );
  await assert.rejects(
    coordinator.propose({
      ...proposal(revisions),
      contextMessageIds: ['outside-room'],
    }),
    /outside the Room/
  );
});

test('requires target acceptance before binding and reconciles the target run', async () => {
  const { coordinator, revisions, state } = await setup();
  await coordinator.propose(proposal(revisions));
  const accepted = await coordinator.accept({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    handoffId: 'handoff-1',
    expectedRevision: 0,
    acceptedByParticipantId: 'participant-b',
  });
  assert.equal(accepted.status, 'accepted');

  state.runs.push({
    id: 'run-b',
    taskId: 'task-b',
    participantId: 'participant-b',
    status: 'running',
  });
  const running = await coordinator.bindRun({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    handoffId: 'handoff-1',
    expectedRevision: 1,
    targetTaskId: 'task-b',
    targetRunId: 'run-b',
  });
  assert.equal(running.status, 'running');

  state.runs.find((run) => run.id === 'run-b').status = 'completed';
  const completed = await coordinator.reconcile({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    handoffId: 'handoff-1',
    expectedRevision: 2,
  });
  assert.equal(completed.status, 'completed');
  assert.deepEqual(
    completed.events.map((event) => event.type),
    [
      'handoff_proposed',
      'handoff_accepted',
      'handoff_run_bound',
      'handoff_completed',
    ]
  );
});

test('recovery requires a failed predecessor and prevents participant cycles', async () => {
  const { coordinator, revisions, state } = await setup();
  await coordinator.propose(proposal(revisions));
  await coordinator.accept({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    handoffId: 'handoff-1',
    expectedRevision: 0,
    acceptedByParticipantId: 'participant-b',
  });
  state.runs.push({
    id: 'run-b',
    taskId: 'task-b',
    participantId: 'participant-b',
    status: 'running',
  });
  await coordinator.bindRun({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    handoffId: 'handoff-1',
    expectedRevision: 1,
    targetTaskId: 'task-b',
    targetRunId: 'run-b',
  });
  state.runs.find((run) => run.id === 'run-b').status = 'failed';
  await coordinator.reconcile({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    handoffId: 'handoff-1',
    expectedRevision: 2,
  });
  state.runs.push({
    id: 'run-b-recovery',
    taskId: 'task-b',
    participantId: 'participant-b',
    status: 'running',
  });

  await assert.rejects(
    coordinator.propose({
      ...proposal(revisions),
      handoffId: 'handoff-2',
      predecessorHandoffId: 'handoff-1',
      sourceParticipantId: 'participant-b',
      sourceRunId: 'run-b-recovery',
      sourceAgentRevisionId: revisions['agent-b'],
      targetParticipantId: 'participant-a',
      targetAgentRevisionId: revisions['agent-a'],
      authorityCeiling: 3,
    }),
    /cycle was detected/
  );
});
