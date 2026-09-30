import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionAdmissionServiceV1, InMemoryActionAdmissionStoreV1,
  createActionAdmissionDispatcherV1, actionAdmissionRequestDigestV1 }
  from '../packages/inference-control/dist/action-admission.js';
import { request, configure, snapshot, sharedAdmissionScenarios, tenantId, fences, accounts }
  from './helpers/action-admission-scenarios.mjs';

test('shared multi-resource limits survive concurrency, replay, refund and revocation', async () => {
  await sharedAdmissionScenarios(new InMemoryActionAdmissionStoreV1());
});
test('all charges reserve or none; invalid periods, units and account revisions deny', async () => {
  const store = new InMemoryActionAdmissionStoreV1(), service = await configure(store);
  const initial = await snapshot(store);
  for (const patch of [
    { charges: [{ ...request('x').charges[0], units: 1 }, { ...request('x').charges[1], units: 31 }] },
    { charges: [{ ...request('x').charges[0], unit: 'other' }] },
    { charges: [{ ...request('x').charges[0], accountRevision: 2 }] },
    { charges: [{ ...request('x').charges[0], units: -1 }] },
    { charges: [request('x').charges[0], request('x').charges[0]] },
    { nowMs: 100 }, { fences: fences.slice(1) },
  ]) await assert.rejects(service.reserve(request('invalid', patch)));
  assert.deepEqual(await snapshot(store), initial);
});
test('revocation for every scope is ordered with admission and cannot revive old bindings', async () => {
  for (const fence of fences) {
    const store = new InMemoryActionAdmissionStoreV1(), service = await configure(store);
    await service.configureFence(tenantId, { ...fence, epoch: 2, active: false });
    await assert.rejects(service.reserve(request('old')));
    await service.configureFence(tenantId, { ...fence, epoch: 3, active: true });
    await assert.rejects(service.reserve(request('old')));
    assert.equal((await service.reserve(request('fresh', {
      fences: fences.map(x => x.kind === fence.kind ? { ...x, epoch: 3 } : x),
    }))).status, 'admitted');
  }
});
test('period renewal preserves accounting and logical time never rolls back', async () => {
  const store = new InMemoryActionAdmissionStoreV1(), service = await configure(store);
  await service.reserve(request('first', { nowMs: 50 }));
  await assert.rejects(service.reserve(request('rollback', { nowMs: 49 })));
  await assert.rejects(service.configureBudget(tenantId, { ...accounts[0], revision: 2, periodEndMs: 200 }));
  const next = { ...accounts[0], accountId: 'org:operations:period:100', periodStartMs: 100, periodEndMs: 200 };
  await service.configureBudget(tenantId, next);
  await service.reserve(request('new-period', { nowMs: 100, charges: [{ accountId: next.accountId, accountRevision: 1, units: 1, unit: 'operation' }] }));
  const state = await snapshot(store);
  assert.equal(state.budgets.find(x => x.account.accountId === accounts[0].accountId).usedUnits, 1);
});
test('dispatcher records before effect and never redispatches an uncertain admission', async () => {
  const store = new InMemoryActionAdmissionStoreV1(), service = await configure(store);
  let calls = 0;
  const q = request('wrapped');
  const downstream = { dispatcherId: 'dispatcher', dispatcherVersion: 1, fencingMode: 'local_only',
    async dispatch() { calls++; throw Error('response_lost'); } };
  const input = { input: {}, context: { tenant: { tenantId } },
    permit: { gatewayId: q.gatewayId, scopeDigest: q.scopeDigest, grantId: q.grantId, dispatchAttemptId: q.dispatchAttemptId, idempotencyKey: q.idempotencyKey, actionDigest: q.actionDigest } };
  const { actionInputDigest } = await import('../packages/inference-control/dist/tools.js');
  const wrapper = createActionAdmissionDispatcherV1({ downstream, service,
    quote: async () => ({ ...q, inputDigest: actionInputDigest({}) }) });
  await assert.rejects(wrapper.dispatch(input), /response_lost/);
  await assert.rejects(wrapper.dispatch(input), /already_admitted/);
  assert.equal(calls, 1);
  assert.equal((await snapshot(store)).effects[0].status, 'indeterminate');
});

test('one dispatch identity cannot evade duplicate admission by changing effectId', async () => {
  const service = await configure(new InMemoryActionAdmissionStoreV1());
  const original = request('one');
  await service.reserve(original);
  await assert.rejects(service.reserve({ ...original, effectId: 'renamed' }), /dispatch_identity_conflict/);
});

test('actual ActionGateway composes approval evidence and resource admission before dispatch', async () => {
  const { approved, grant: prepareGrant, resolver, scope, binding } = await import('./helpers/action-approval-fixtures.mjs');
  const { ActionGateway, LocalGrantLedger, actionInputDigest, scopeDigest } = await import('../packages/inference-control/dist/tools.js');
  const { record, repository } = await approved();
  const g = prepareGrant(record);
  const store = new InMemoryActionAdmissionStoreV1(repository);
  const service = await configure(store);
  // Fixtures use a different tenant. Configure its own independent accounts.
  for (const fence of fences) await service.configureFence(scope.tenantId, fence);
  for (const account of accounts) await service.configureBudget(scope.tenantId, account);
  const ledger = new LocalGrantLedger('gateway:composed'); ledger.issue(g);
  let effects = 0;
  const dispatcher = createActionAdmissionDispatcherV1({ service,
    downstream: { dispatcherId: binding.dispatcherId, dispatcherVersion: 1, fencingMode: 'local_only',
      async dispatch() { effects++; return { ok: true, value: { written: true } }; } },
    quote: async ({ permit, input }) => ({ ...request('composed'), tenantId: scope.tenantId,
      gatewayId: permit.gatewayId, scopeDigest: permit.scopeDigest, grantId: permit.grantId,
      dispatchAttemptId: permit.dispatchAttemptId, idempotencyKey: permit.idempotencyKey,
      actionDigest: permit.actionDigest, inputDigest: actionInputDigest(input), nowMs: 3,
      approval: { approvalId: record.approvalId, targetDigest: record.targetDigest } }),
  });
  const gateway = new ActionGateway(ledger, binding, dispatcher,
    { contextResolverId: binding.contextResolverId, contextResolverVersion: 1,
      async resolve() { return { tenant: { tenantId: scope.tenantId }, toolId: binding.toolId, runId: scope.runId }; } },
    { resolverId: 'authority', resolverVersion: 1, async resolve(s, digest) {
      return { schemaVersion: 1, status: 'current', resolverId: 'authority', resolverVersion: 1,
        scope: s, scopeDigest: scopeDigest(s), actionDigest: digest, authorityGeneration: null, fencingToken: null }; } },
    resolver(repository));
  assert.equal((await gateway.invoke({ schemaVersion: 1, grantId: g.grantId, input: { value: 2 }, logicalTimeMs: 3 })).ok, true);
  assert.equal(effects, 1);
  await assert.rejects(gateway.invoke({ schemaVersion: 1, grantId: g.grantId, input: { value: 2 }, logicalTimeMs: 4 }));
  assert.equal(effects, 1);
});
