import assert from 'node:assert/strict';
import test from 'node:test';
import { createActionApprovalTargetV1, ActionApprovalServiceV1,
  InMemoryActionApprovalRepositoryV1, createActionApprovalAssessmentResolverV1,
} from '../packages/inference-control/dist/action-approvals.js';
import { createActionGrantV1 } from '../packages/inference-control/dist/tools.js';

import { scope, binding, target, requester, approver, access, approved, grant, resolver } from './helpers/action-approval-fixtures.mjs';

test('approval request is immutable, replayable and cannot cross tenants or identities', async () => {
  const { repository, service, record } = await approved();
  const replay = await service.request(requester, { approvalId: 'approval:1', target: target(),
    createdAtMs: 1, expiresAtMs: 1000 });
  assert.deepEqual(replay, record);
  assert.equal(await repository.load('tenant:2', 'approval:1'), undefined);
  await assert.rejects(service.request({ ...requester, tenantId: 'tenant:2' }, {
    approvalId: 'approval:2', target: target(), createdAtMs: 1, expiresAtMs: 1000 }));
  await assert.rejects(service.request(requester, { approvalId: 'approval:1',
    target: target({ input: { value: 3 } }), createdAtMs: 1, expiresAtMs: 1000 }));
});

test('only authorized independent people decide exact pending requests', async () => {
  for (const actor of [null, requester, { ...approver, actorId: requester.actorId },
    { ...approver, tenantId: 'tenant:2' }, { ...approver, kind: 'agent' }]) {
    const service = new ActionApprovalServiceV1(new InMemoryActionApprovalRepositoryV1(), access);
    const r = await service.request(requester, { approvalId: 'approval:1', target: target(), createdAtMs: 1, expiresAtMs: 10 });
    await assert.rejects(service.decide(actor, { tenantId: 'tenant:1', approvalId: r.approvalId,
      targetDigest: r.targetDigest, decision: 'approved', nowMs: 2 }));
  }
  const { service, record } = await approved();
  await assert.rejects(service.decide(approver, { tenantId: 'tenant:1', approvalId: record.approvalId,
    targetDigest: 'changed', decision: 'approved', nowMs: 3 }));
});

test('approval narrows base assessment, exact facts and expiry; uncertainty denies', async () => {
  for (const change of [ { input: { value: 3 } }, { preconditions: { version: 2 } },
    { policy: { version: 2 } }, { authority: { agent: 2, connector: 1, organization: 1 } },
    { authority: { agent: 1, connector: 2, organization: 1 } },
    { authority: { agent: 1, connector: 1, organization: 2 } } ]) {
    const { repository, record } = await approved();
    assert.equal(await resolver(repository, async () => target(change)).consumeCurrent(grant(record), 3), false);
    assert.equal((await repository.load('tenant:1', record.approvalId)).status, 'invalidated');
  }
  const { repository, record } = await approved();
  const g = grant(record);
  assert.equal(await resolver(repository).consumeCurrent(g, 3), true);
  assert.equal(await resolver(repository, undefined, false).consumeCurrent(g, 3), false);
  assert.equal(await resolver(repository, async () => { throw Error('offline'); }).consumeCurrent(g, 3), false);
  assert.equal(await resolver(repository).consumeCurrent({ ...g, inputDigest: `sha256:${'3'.repeat(64)}` }, 3), false);
});

test('expiry and invalidation are durable, preserve the decision and cannot be revived by clock rollback', async () => {
  const { repository, record, service } = await approved();
  const g = grant(record), r = resolver(repository);
  assert.equal(await r.consumeCurrent(g, 20), true);
  assert.equal(await r.consumeCurrent(g, 19), false);
  assert.equal(await r.consumeCurrent(g, 1000), false);
  assert.equal(await r.consumeCurrent(g, 3), false);
  const expired = await repository.load('tenant:1', record.approvalId);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.decidedBy, record.decidedBy);
  assert.equal(expired.decidedAtMs, record.decidedAtMs);
  const another = await approved();
  await another.service.invalidate(approver, { tenantId: 'tenant:1', approvalId: 'approval:1',
    targetDigest: another.record.targetDigest, nowMs: 4 });
  assert.equal(await resolver(another.repository).consumeCurrent(grant(another.record), 4), false);
});

test('concurrent grants cannot reuse one approval for multiple effects', async () => {
  const { repository, record } = await approved();
  const r = resolver(repository);
  const outcomes = await Promise.all([r.consumeCurrent(grant(record, 'one'), 3), r.consumeCurrent(grant(record, 'two'), 3)]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(await r.consumeCurrent(grant(record, outcomes[0] ? 'one' : 'two'), 3), true);
});

test('decision races have one durable winner and failed authorization never transitions', async () => {
  const repository = new InMemoryActionApprovalRepositoryV1();
  const service = new ActionApprovalServiceV1(repository, access);
  const r = await service.request(requester, { approvalId: 'approval:1', target: target(), createdAtMs: 1, expiresAtMs: 10 });
  const results = await Promise.allSettled(['approved','rejected'].map(decision => service.decide(approver,
    { tenantId: 'tenant:1', approvalId: r.approvalId, targetDigest: r.targetDigest, decision, nowMs: 2 })));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  const denied = new ActionApprovalServiceV1(repository, { ...access, async canDecide() { return false; } });
  await assert.rejects(denied.decide(approver, { tenantId: 'tenant:1', approvalId: r.approvalId,
    targetDigest: r.targetDigest, decision: 'approved', nowMs: 3 }));
});
