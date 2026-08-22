import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryRoomExecutionSessionStore,
  RoomExecutionCoordinator,
} from '@agentplat/rooms';

function fixture() {
  const state = {
    room: { id: 'room-1', status: 'active' },
    participants: [
      { id: 'human-1', type: 'human', permissions: ['run.intervene'] },
      { id: 'agent-1', type: 'agent', permissions: [] },
    ],
    runs: [
      {
        id: 'run-1',
        taskId: 'task-1',
        participantId: 'agent-1',
        status: 'running',
      },
    ],
  };
  let tick = 0;
  const coordinator = new RoomExecutionCoordinator(
    { getRoomState: async () => structuredClone(state) },
    new InMemoryRoomExecutionSessionStore(),
    {
      clock: () => new Date(Date.UTC(2026, 7, 21, 12, 0, tick++)),
    }
  );
  return { coordinator, state };
}

const openInput = {
  tenantId: 'tenant-1',
  roomId: 'room-1',
  sessionId: 'execution-1',
  runId: 'run-1',
  agentRevisionId: 'agent-revision-4',
};

test('opens an idempotent execution session bound to one running Room run', async () => {
  const { coordinator } = fixture();
  const first = await coordinator.openSession(openInput);
  const replay = await coordinator.openSession(openInput);

  assert.equal(first.revision, 0);
  assert.equal(first.status, 'active');
  assert.equal(first.taskId, 'task-1');
  assert.equal(first.participantId, 'agent-1');
  assert.deepEqual(replay, first);

  await assert.rejects(
    coordinator.openSession({ ...openInput, runId: 'another-run' }),
    /Room run not found/
  );
});

test('records idempotent human-in-the-loop run interventions', async () => {
  const { coordinator } = fixture();
  await coordinator.openSession(openInput);
  const request = {
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    expectedRevision: 0,
    operationId: 'intervention-1',
    requestedByParticipantId: 'human-1',
    instruction: 'Use the approved pricing assumptions.',
    checkpoint: 'pre_step',
  };
  const updated = await coordinator.requestIntervention(request);
  assert.equal(updated.revision, 1);
  assert.deepEqual(updated.interventions[0], {
    operationId: 'intervention-1',
    requestedByParticipantId: 'human-1',
    instruction: 'Use the approved pricing assumptions.',
    checkpoint: 'pre_step',
    status: 'pending',
    attempts: 0,
    requestedAt: '2026-08-21T12:00:01.000Z',
  });

  const replay = await coordinator.requestIntervention(request);
  assert.deepEqual(replay, updated);

  await assert.rejects(
    coordinator.requestIntervention({
      ...request,
      instruction: 'A conflicting instruction.',
    }),
    /bound to another request/
  );
});

test('rejects interventions from agents and stale concurrent updates', async () => {
  const { coordinator } = fixture();
  await coordinator.openSession(openInput);
  const base = {
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    expectedRevision: 0,
    operationId: 'intervention-1',
    instruction: 'Adjust the summary.',
    checkpoint: 'post_output',
  };
  await assert.rejects(
    coordinator.requestIntervention({
      ...base,
      requestedByParticipantId: 'agent-1',
    }),
    /human Agent Room participant/
  );

  await coordinator.requestIntervention({
    ...base,
    requestedByParticipantId: 'human-1',
  });
  await assert.rejects(
    coordinator.requestIntervention({
      ...base,
      operationId: 'intervention-2',
      requestedByParticipantId: 'human-1',
    }),
    /revision conflict/
  );
});

test('resolves interventions once and reconciles terminal Room runs', async () => {
  const { coordinator, state } = fixture();
  await coordinator.openSession(openInput);
  await coordinator.requestIntervention({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    expectedRevision: 0,
    operationId: 'intervention-1',
    requestedByParticipantId: 'human-1',
    instruction: 'Adjust the summary.',
    checkpoint: 'post_output',
  });
  const applied = await coordinator.resolveIntervention({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    expectedRevision: 1,
    operationId: 'intervention-1',
    resolution: 'applied',
  });
  assert.equal(applied.revision, 2);
  assert.equal(applied.interventions[0].status, 'applied');

  state.runs[0].status = 'completed';
  const completed = await coordinator.reconcileSession({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    expectedRevision: 2,
  });
  assert.equal(completed.revision, 3);
  assert.equal(completed.status, 'completed');
});

test('recovery sessions require a failed predecessor for the same task', async () => {
  const { coordinator, state } = fixture();
  await coordinator.openSession(openInput);
  state.runs[0].status = 'failed';
  await coordinator.reconcileSession({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    expectedRevision: 0,
  });
  state.runs.push({
    id: 'run-2',
    taskId: 'task-1',
    participantId: 'agent-1',
    status: 'running',
  });

  const recovered = await coordinator.openSession({
    ...openInput,
    sessionId: 'execution-2',
    runId: 'run-2',
    predecessorSessionId: 'execution-1',
  });
  assert.equal(recovered.predecessorSessionId, 'execution-1');
  assert.equal(recovered.status, 'active');
});
