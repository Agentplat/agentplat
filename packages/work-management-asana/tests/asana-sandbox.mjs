import assert from 'node:assert/strict';
import {
  deliveryIdempotencyKey,
  InMemoryHumanContributionDeliveryStore,
  WorkManagementDeliveryRuntime,
} from '@agentplat/rooms';
import { AsanaWorkManagementProvider } from '../dist/index.js';

const accessToken = process.env.ASANA_ACCESS_TOKEN;
const projectGid = process.env.ASANA_PROJECT_GID;
if (!accessToken || !projectGid) {
  throw new Error('ASANA_ACCESS_TOKEN and ASANA_PROJECT_GID are required');
}

const suffix = `${Date.now()}-${process.pid}`;
const contribution = {
  tenantId: 'agentplat-sandbox',
  roomId: `room-${suffix}`,
  contributionId: `contribution-${suffix}`,
  revision: 0,
  instruction: `[AgentPlat sandbox] Validate contribution delivery ${suffix}`,
  expectedOutput: 'Sandbox validation only; this task can be archived.',
};
const provider = new AsanaWorkManagementProvider({
  projectGid,
  accessToken: async () => accessToken,
});
const idempotencyKey = deliveryIdempotencyKey({
  ...contribution,
  providerId: provider.providerId,
});

// Models a process crash after the remote create but before the local receipt.
const created = await provider.createContributionTask({
  contribution,
  idempotencyKey,
});
const discovered = await provider.lookupContributionTask({ idempotencyKey });
assert.equal(discovered?.externalId, created.externalId);

const store = new InMemoryHumanContributionDeliveryStore();
const restartedRuntime = new WorkManagementDeliveryRuntime(store, [provider]);
const queued = await restartedRuntime.enqueue({
  contribution,
  providerId: provider.providerId,
});
const synchronized = await restartedRuntime.synchronize({
  contribution,
  providerId: provider.providerId,
  expectedRevision: queued.revision,
  leaseToken: `sandbox-${suffix}`,
});
assert.equal(synchronized.status, 'synchronized');
assert.equal(synchronized.externalId, created.externalId);

const updatedContribution = {
  ...contribution,
  revision: 1,
  expectedOutput: 'Sandbox create, lookup, update and recovery validated.',
};
const updateQueued = await restartedRuntime.enqueue({
  contribution: updatedContribution,
  providerId: provider.providerId,
});
const updated = await restartedRuntime.synchronize({
  contribution: updatedContribution,
  providerId: provider.providerId,
  expectedRevision: updateQueued.revision,
  leaseToken: `sandbox-update-${suffix}`,
});
assert.equal(updated.status, 'synchronized');
assert.equal(updated.externalId, created.externalId);

console.log(
  JSON.stringify({
    status: 'passed',
    externalId: created.externalId,
    externalUrl: created.externalUrl,
    createLookupUpdate: true,
    crashReconciliation: true,
  })
);
