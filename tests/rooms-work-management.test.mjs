import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryHumanContributionDeliveryStore,
  LocalWorkManagementProvider,
  WorkManagementDeliveryRuntime,
} from '@agentplat/rooms';

const contribution = {
  tenantId: 'tenant-1',
  roomId: 'room-1',
  contributionId: 'contribution-1',
  revision: 0,
  instruction: 'Confirm the assumptions.',
};

test('delivery runtime creates one external task and synchronizes later revisions', async () => {
  const runtime = new WorkManagementDeliveryRuntime(
    new InMemoryHumanContributionDeliveryStore(),
    [new LocalWorkManagementProvider()],
    { clock: () => new Date('2026-08-21T12:00:00.000Z') }
  );
  const queued = await runtime.enqueue({ contribution, providerId: 'local' });
  const synchronized = await runtime.synchronize({
    contribution,
    providerId: 'local',
    expectedRevision: queued.revision,
    leaseToken: 'worker-1',
  });
  assert.equal(synchronized.status, 'synchronized');
  assert.equal(synchronized.externalId, 'local:contribution-1');
  assert.equal(synchronized.synchronizedContributionRevision, 0);

  const updatedContribution = { ...contribution, revision: 1 };
  const requeued = await runtime.enqueue({
    contribution: updatedContribution,
    providerId: 'local',
  });
  assert.equal(requeued.status, 'pending');
  const updated = await runtime.synchronize({
    contribution: updatedContribution,
    providerId: 'local',
    expectedRevision: requeued.revision,
    leaseToken: 'worker-2',
  });
  assert.equal(updated.synchronizedContributionRevision, 1);
  assert.deepEqual(await runtime.metrics('tenant-1'), {
    pending: 0,
    processing: 0,
    synchronized: 1,
    failed: 0,
  });
});

test('delivery recovery uses provider lookup after external create succeeds before local acknowledgement', async () => {
  let now = Date.parse('2026-08-21T12:00:00.000Z');
  const tasks = new Map();
  let first = true;
  const provider = {
    providerId: 'recoverable',
    lookupContributionTask: async ({ idempotencyKey }) =>
      tasks.get(idempotencyKey) ?? null,
    createContributionTask: async ({ contribution, idempotencyKey }) => {
      const result = { externalId: `external:${contribution.contributionId}` };
      tasks.set(idempotencyKey, result);
      if (first) {
        first = false;
        throw new Error('lost acknowledgement');
      }
      return result;
    },
    updateContributionTask: async () => undefined,
  };
  const runtime = new WorkManagementDeliveryRuntime(
    new InMemoryHumanContributionDeliveryStore(),
    [provider],
    { clock: () => new Date(now), baseRetryMs: 10 }
  );
  const queued = await runtime.enqueue({
    contribution,
    providerId: provider.providerId,
  });
  const failed = await runtime.synchronize({
    contribution,
    providerId: provider.providerId,
    expectedRevision: queued.revision,
    leaseToken: 'worker-1',
  });
  assert.equal(failed.status, 'failed');
  assert.match(failed.lastError, /lost acknowledgement/);

  now += 11;
  const recovered = await runtime.synchronize({
    contribution,
    providerId: provider.providerId,
    expectedRevision: failed.revision,
    leaseToken: 'worker-2',
  });
  assert.equal(recovered.status, 'synchronized');
  assert.equal(recovered.externalId, 'external:contribution-1');
  assert.equal(tasks.size, 1);
});
