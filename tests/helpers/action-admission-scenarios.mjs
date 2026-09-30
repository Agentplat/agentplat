import assert from 'node:assert/strict';
import { ActionAdmissionServiceV1 } from '../../packages/inference-control/dist/action-admission.js';
export const tenantId = 'tenant:admission';
export const fences = ['agent','connector','organization'].map(kind => ({ kind, id: `${kind}:1`, epoch: 1, active: true }));
export const accounts = [
  { accountId: 'org:operations:period:0', unit: 'operation', periodStartMs: 0, periodEndMs: 100, maximumUnits: 3, revision: 1 },
  { accountId: 'org:spend:period:0', unit: 'cent', periodStartMs: 0, periodEndMs: 100, maximumUnits: 30, revision: 1 },
];
export function request(effectId, changes = {}) {
  return { tenantId, effectId, gatewayId: 'gateway:1', scopeDigest: `sha256:${'4'.repeat(64)}`, grantId: `grant:${effectId}`, dispatchAttemptId: `attempt:${effectId}`,
    idempotencyKey: `key:${effectId}`, actionDigest: `sha256:${'1'.repeat(64)}`, inputDigest: `sha256:${'2'.repeat(64)}`,
    fences, charges: accounts.map(x => ({ accountId: x.accountId, accountRevision: 1, unit: x.unit, units: x.unit === 'cent' ? 10 : 1 })),
    nowMs: 1, approval: null, ...changes };
}
export async function configure(store) {
  const service = new ActionAdmissionServiceV1(store);
  for (const fence of fences) await service.configureFence(tenantId, fence);
  for (const account of accounts) await service.configureBudget(tenantId, account);
  return service;
}
export async function snapshot(store) {
  return store.transaction(tenantId, state => ({ state, result: state }));
}
export async function sharedAdmissionScenarios(store, second = store) {
  const service = await configure(store), other = new ActionAdmissionServiceV1(second);
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
    (i % 2 ? service : other).reserve(request(`effect:${i}`))));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 3);
  const winner = results.find(x => x.status === 'fulfilled').value.receipt;
  let state = await snapshot(store);
  assert.deepEqual(accounts.map(a => state.budgets.find(x => x.account.accountId === a.accountId).usedUnits), [3, 30]);
  assert.equal((await service.reserve({ ...winner.request, nowMs: 2 })).status, 'replayed');
  await assert.rejects(service.reserve({ ...winner.request, inputDigest: `sha256:${'3'.repeat(64)}`, nowMs: 2 }));
  await assert.rejects(service.reconcile(tenantId, winner.request.effectId, async () => null));
  const proof = { requestDigest: winner.requestDigest, outcome: 'not_applied', proofRef: 'terminal:external:receipt' };
  await Promise.all([service.reconcile(tenantId, winner.request.effectId, async () => proof),
    other.reconcile(tenantId, winner.request.effectId, async () => proof)]);
  state = await snapshot(store);
  assert.deepEqual(accounts.map(a => state.budgets.find(x => x.account.accountId === a.accountId).usedUnits), [2, 20]);
  await assert.rejects(service.reconcile(tenantId, winner.request.effectId,
    async () => ({ ...proof, outcome: 'succeeded' })));
  // Budget holds remain spent across policy revision and revocation.
  await service.configureBudget(tenantId, { ...accounts[0], revision: 2, maximumUnits: 2 });
  await assert.rejects(other.reserve(request('after-cap-change', { nowMs: 3 })));
  await service.configureFence(tenantId, { ...fences[1], epoch: 2, active: false });
  await assert.rejects(other.reserve(request('suspended', { nowMs: 3 })));
  state = await snapshot(store);
  assert.deepEqual(accounts.map(a => state.budgets.find(x => x.account.accountId === a.accountId).usedUnits), [2, 20]);
  return winner;
}
