import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRoomCoordinationRuntime,
  InMemoryAgentRoomCoordinationStore,
} from '@agentplat/rooms';
import { AgentPlatError } from '@agentplat/core';

function runtime() {
  let now = Date.parse('2026-08-21T12:00:00.000Z');
  const calls = [];
  const instance = new AgentRoomCoordinationRuntime(
    new InMemoryAgentRoomCoordinationStore(),
    {
      routeMessage: async () => ({
        kind: 'assigned',
        participantIds: ['agent-1'],
        basis: 'router',
      }),
    },
    { get: async () => ({ status: 'accepted' }) },
    {
      dispatchMessage: async (input) => {
        calls.push(input);
        return { status: 'executing', runIds: ['run-1'] };
      },
      dispatchHandoff: async () => ({ status: 'completed' }),
    },
    { clock: () => new Date(now) }
  );
  return { instance, calls, advance: (ms) => (now += ms) };
}

test('coordination loop queues and dispatches a routed message with stable operation identity', async () => {
  const { instance, calls } = runtime();
  await instance.initialize({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
  });
  const queued = await instance.enqueue({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 0,
    itemId: 'item-1',
    kind: 'message',
    referenceId: 'message-1',
  });
  assert.equal(queued.items[0].operationId, 'coordination-1:message:item-1');

  const executing = await instance.runNext({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 1,
    leaseToken: 'worker-1',
  });
  assert.equal(executing.status, 'executing');
  assert.deepEqual(executing.items[0].runIds, ['run-1']);
  assert.equal(calls[0].operationId, 'coordination-1:message:item-1');

  const completed = await instance.resolveItem({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 3,
    itemId: 'item-1',
    outcome: 'completed',
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.items[0].status, 'completed');
});

test('coordination enqueue is idempotent and stale revisions are fenced', async () => {
  const { instance } = runtime();
  await instance.initialize({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
  });
  const input = {
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 0,
    itemId: 'item-1',
    kind: 'message',
    referenceId: 'message-1',
  };
  const first = await instance.enqueue(input);
  const replay = await instance.enqueue(input);
  assert.deepEqual(replay, first);
  await assert.rejects(
    instance.enqueue({ ...input, itemId: 'item-2' }),
    /revision conflict/
  );
});

test('completed human contribution resumes a waiting coordination item', async () => {
  const instance = new AgentRoomCoordinationRuntime(
    new InMemoryAgentRoomCoordinationStore(),
    {
      routeMessage: async () => ({ kind: 'unassigned', reason: 'no_match' }),
    },
    { get: async () => ({ status: 'accepted' }) },
    {
      dispatchMessage: async () => ({ status: 'completed' }),
      dispatchHandoff: async () => ({ status: 'completed' }),
    },
    {
      humanContributions: {
        get: async () => ({ status: 'completed', blocking: true }),
      },
    }
  );
  await instance.initialize({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
  });
  await instance.enqueue({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 0,
    itemId: 'item-1',
    kind: 'message',
    referenceId: 'message-1',
  });
  const waiting = await instance.runNext({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 1,
    leaseToken: 'worker-1',
  });
  assert.equal(waiting.status, 'waiting_for_human');

  const resumed = await instance.resumeFromHumanContribution({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 3,
    itemId: 'item-1',
    contributionId: 'contribution-1',
  });
  assert.equal(resumed.status, 'idle');
  assert.equal(resumed.items[0].status, 'pending');
  assert.deepEqual(resumed.items[0].contributionIds, ['contribution-1']);
});

test('coordination failures are classified, redacted and retried with stable identity', async () => {
  let now = Date.parse('2026-08-21T12:00:00.000Z');
  let fail = true;
  const operations = [];
  const instance = new AgentRoomCoordinationRuntime(
    new InMemoryAgentRoomCoordinationStore(),
    {
      routeMessage: async () => ({
        kind: 'assigned',
        participantIds: ['agent-1'],
        basis: 'router',
      }),
    },
    { get: async () => ({ status: 'accepted' }) },
    {
      dispatchMessage: async ({ operationId }) => {
        operations.push(operationId);
        if (fail) {
          fail = false;
          throw new AgentPlatError(
            'ADAPTER_ERROR',
            'provider failed api_key=should-not-leak'
          );
        }
        return { status: 'completed' };
      },
      dispatchHandoff: async () => ({ status: 'completed' }),
    },
    { clock: () => new Date(now), baseRetryMs: 10 }
  );
  await instance.initialize({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
  });
  await instance.enqueue({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 0,
    itemId: 'item-1',
    kind: 'message',
    referenceId: 'message-1',
  });
  const failed = await instance.runNext({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: 1,
    leaseToken: 'worker-1',
  });
  assert.equal(failed.items[0].errorCategory, 'transient');
  assert.equal(failed.items[0].retryable, true);
  assert.match(failed.items[0].errorMessage, /\[REDACTED\]/);
  assert.doesNotMatch(failed.items[0].errorMessage, /should-not-leak/);

  now += 11;
  const recovered = await instance.runNext({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    coordinationId: 'coordination-1',
    expectedRevision: failed.revision,
    leaseToken: 'worker-2',
  });
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.items[0].attempts, 2);
  assert.deepEqual(operations, [
    'coordination-1:message:item-1',
    'coordination-1:message:item-1',
  ]);
});
