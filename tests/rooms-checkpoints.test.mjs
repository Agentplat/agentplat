import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InterventionAwareRoomRunCheckpointHandler,
  InMemoryRoomRepository,
  RoomService,
} from '@agentplat/rooms';
import { DefaultAgentRuntime } from '@agentplat/runtime';

async function roomWithTask(runtime, actionLevel = 'external_write') {
  const service = new RoomService({
    repository: new InMemoryRoomRepository(),
    runtime,
    requireProtectedActionCheckpoints: true,
  });
  const room = await service.createRoom('tenant-1', {
    title: 'Checkpoint Room',
    goal: 'Execute governed work',
  });
  const participant = await service.addParticipant('tenant-1', room.id, {
    type: 'agent',
    displayName: 'Worker',
    role: 'worker',
    permissions: ['task.run'],
    runtime: { platform: 'checkpoint-provider' },
  });
  const task = await service.createTask('tenant-1', room.id, {
    stepId: 'execute',
    assignedParticipantId: participant.id,
    instruction: 'Perform the operation.',
    expectedOutput: 'A result',
    expectedArtifactKind: 'result',
    actionLevel,
  });
  return { service, room, task };
}

test('RoomRun invokes pre_step, provider pre_action and post_output checkpoints', async () => {
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('checkpoint-provider', {
    supportedCheckpoints: ['pre_action'],
    run: async (_agent, _input, context) => {
      await context.checkpoint({
        checkpoint: 'pre_action',
        payload: { action: 'external-write' },
      });
      return { status: 'completed', output: 'done' };
    },
  });
  const { service, room, task } = await roomWithTask(runtime);
  const checkpoints = [];
  const run = await service.runTask('tenant-1', room.id, task.id, {
    onCheckpoint: async ({ checkpoint }) => {
      checkpoints.push(checkpoint);
      return { allowed: true };
    },
  });
  assert.equal(run.status, 'completed');
  assert.deepEqual(checkpoints, ['pre_step', 'pre_action', 'post_output']);
});

test('protected Room tasks fail closed before invoking a provider without pre_action support', async () => {
  let providerCalls = 0;
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('checkpoint-provider', {
    run: async () => {
      providerCalls += 1;
      return { status: 'completed', output: 'unsafe' };
    },
  });
  const { service, room, task } = await roomWithTask(runtime);
  await assert.rejects(
    service.runTask('tenant-1', room.id, task.id),
    /requires a pre_action checkpoint-capable Runtime/
  );
  assert.equal(providerCalls, 0);
  const state = await service.getRoomState('tenant-1', room.id);
  assert.equal(state.tasks[0].status, 'failed');
  assert.equal(state.runs[0].status, 'failed');
});

test('checkpoint denial prevents provider continuation and fails the Room run', async () => {
  let afterCheckpoint = false;
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('checkpoint-provider', {
    supportedCheckpoints: ['pre_action'],
    run: async (_agent, _input, context) => {
      await context.checkpoint({ checkpoint: 'pre_action' });
      afterCheckpoint = true;
      return { status: 'completed', output: 'unsafe' };
    },
  });
  const { service, room, task } = await roomWithTask(runtime);
  await assert.rejects(
    service.runTask('tenant-1', room.id, task.id, {
      onCheckpoint: async ({ checkpoint }) =>
        checkpoint === 'pre_action'
          ? { allowed: false, reason: 'human intervention rejected the action' }
          : { allowed: true },
    }),
    /human intervention rejected/
  );
  assert.equal(afterCheckpoint, false);
});

test('intervention-aware checkpoint drains applicable interventions before continuing', async () => {
  let revision = 2;
  let dispatches = 0;
  const handler = new InterventionAwareRoomRunCheckpointHandler(
    {
      getSession: async () => ({ revision }),
    },
    {
      dispatchNext: async () => {
        dispatches += 1;
        if (dispatches > 1) return null;
        revision += 2;
        return {
          interventions: [{ status: 'applied' }],
        };
      },
    }
  );
  assert.deepEqual(
    await handler.handle({
      tenantId: 'tenant-1',
      roomId: 'room-1',
      sessionId: 'execution-1',
      runId: 'run-1',
      checkpoint: 'pre_step',
    }),
    { allowed: true }
  );
  assert.equal(dispatches, 2);
});
