import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CognitiveRunInterventionAdapter,
  InMemoryRoomExecutionSessionStore,
  RoomExecutionCoordinator,
  RunInterventionDispatcher,
} from '@agentplat/rooms';

function setup() {
  let now = Date.parse('2026-08-21T12:00:00.000Z');
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
  const coordinator = new RoomExecutionCoordinator(
    { getRoomState: async () => structuredClone(state) },
    new InMemoryRoomExecutionSessionStore(),
    { clock: () => new Date(now) }
  );
  return {
    coordinator,
    advance: (milliseconds) => {
      now += milliseconds;
    },
  };
}

async function prepared(coordinator) {
  await coordinator.openSession({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    runId: 'run-1',
  });
  return coordinator.requestIntervention({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    expectedRevision: 0,
    operationId: 'intervention-1',
    requestedByParticipantId: 'human-1',
    instruction: 'Use the approved assumptions.',
    checkpoint: 'pre_step',
  });
}

test('dispatcher claims and applies one intervention with a stable idempotency key', async () => {
  const { coordinator } = setup();
  await prepared(coordinator);
  const calls = [];
  const dispatcher = new RunInterventionDispatcher(coordinator, {
    apply: async (input) => {
      calls.push(input);
      return { status: 'applied' };
    },
  });

  const state = await dispatcher.dispatchNext({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    expectedRevision: 1,
    checkpoint: 'pre_step',
    dispatchToken: 'worker-1:claim-1',
  });
  assert.equal(state.revision, 3);
  assert.equal(state.interventions[0].status, 'applied');
  assert.equal(state.interventions[0].attempts, 1);
  assert.match(calls[0].idempotencyKey, /intervention-1$/);
  assert.equal(calls[0].checkpoint, 'pre_step');
});

test('failed dispatch remains leased and can be retried only after expiry', async () => {
  const { coordinator, advance } = setup();
  await prepared(coordinator);
  const failing = new RunInterventionDispatcher(coordinator, {
    apply: async () => {
      throw new Error('runtime unavailable');
    },
  });
  await assert.rejects(
    failing.dispatchNext({
      tenantId: 'tenant-1',
      roomId: 'room-1',
      sessionId: 'execution-1',
      expectedRevision: 1,
      checkpoint: 'pre_step',
      dispatchToken: 'worker-1:claim-1',
      leaseMs: 100,
    }),
    /runtime unavailable/
  );
  await assert.rejects(
    coordinator.resolveIntervention({
      tenantId: 'tenant-1',
      roomId: 'room-1',
      sessionId: 'execution-1',
      expectedRevision: 2,
      operationId: 'intervention-1',
      resolution: 'applied',
      dispatchToken: 'another-worker',
    }),
    /dispatch ownership was lost/
  );

  const successful = new RunInterventionDispatcher(coordinator, {
    apply: async () => ({ status: 'applied' }),
  });
  assert.equal(
    await successful.dispatchNext({
      tenantId: 'tenant-1',
      roomId: 'room-1',
      sessionId: 'execution-1',
      expectedRevision: 2,
      checkpoint: 'pre_step',
      dispatchToken: 'worker-2:claim-1',
      leaseMs: 100,
    }),
    null
  );

  advance(101);
  const recovered = await successful.dispatchNext({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    expectedRevision: 2,
    checkpoint: 'pre_step',
    dispatchToken: 'worker-2:claim-2',
    leaseMs: 100,
  });
  assert.equal(recovered.interventions[0].status, 'applied');
  assert.equal(recovered.interventions[0].attempts, 2);
});

test('cognitive adapter binds intervention to the portable cognitive session', async () => {
  let request;
  const adapter = new CognitiveRunInterventionAdapter({
    runtime: {
      getSession: async () => ({
        tenantId: 'tenant-1',
        sessionId: 'execution-1',
        agentId: 'agent-1',
        revision: 4,
        logicalTimeHighWaterMs: 10,
      }),
      execute: async (input) => {
        request = input;
        return {
          result: {
            status: 'completed',
            reasonCode: 'intervention_applied',
          },
        };
      },
    },
    digest: async (domain) => `digest:${domain}`,
    authorityDigest: async () => 'authority-digest',
    roleBindingDigest: async () => 'role-digest',
    clock: () => 11,
  });
  const result = await adapter.apply(
    {
      session: {
        tenantId: 'tenant-1',
        roomId: 'room-1',
        sessionId: 'execution-1',
        runId: 'run-1',
        taskId: 'task-1',
        participantId: 'agent-1',
      },
      intervention: {
        operationId: 'intervention-1',
        instruction: 'Use approved assumptions.',
      },
      checkpoint: 'pre_action',
      idempotencyKey: 'stable-key',
    },
    {}
  );

  assert.deepEqual(result, {
    status: 'applied',
    reason: 'intervention_applied',
  });
  assert.equal(request.operation, 'intervention');
  assert.equal(request.expectedRevision, 4);
  assert.equal(request.payload.checkpoint, 'pre_action');
  assert.equal(request.authorityDigest, 'authority-digest');
  assert.equal(request.roleBindingDigest, 'role-digest');
});
