import assert from 'node:assert/strict';
import test from 'node:test';
import { createConditionalActionDispatcherV1 } from '../packages/inference-control/dist/action-effects.js';
import { actionInputDigest, controlDigest } from '../packages/inference-control/dist/tools.js';
const capabilities = { executorId: 'test', executorVersion: 1, atomicPreconditions: true, idempotency: 'native', receiptLookup: true };
const input = { input: { value: 2 }, permit: { idempotencyKey: 'key', actionDigest: `sha256:${'1'.repeat(64)}` } };
const preconditions = { version: 1 }, approvedPreconditionsDigest = controlDigest('grant', preconditions);
function wrapper(execute, changes = {}) {
  return createConditionalActionDispatcherV1({ dispatcherId: 'dispatcher', dispatcherVersion: 1, fencingMode: 'local_only',
    port: { capabilities, execute }, resolvePreconditions: async () => ({ preconditions, approvedPreconditionsDigest }), ...changes });
}
function receipt(outcome = 'succeeded') {
  return { schemaVersion: 1, idempotencyKey: 'key', actionDigest: input.permit.actionDigest,
    inputDigest: actionInputDigest(input.input), preconditionsDigest: approvedPreconditionsDigest,
    outcome, proofRef: 'receipt:1', result: { ok: outcome === 'succeeded' } };
}
test('conditional dispatcher requires capabilities and binds exact reviewed preconditions', async () => {
  for (const change of [{ atomicPreconditions: false }, { idempotency: 'none' }, { receiptLookup: false }])
    assert.throws(() => wrapper(async () => receipt(), { port: { capabilities: { ...capabilities, ...change }, execute: async () => receipt() } }));
  let effects = 0;
  const d = wrapper(async q => { effects++; assert.deepEqual(q.preconditions, preconditions); return receipt(); });
  assert.equal((await d.dispatch(input)).ok, true);
  await assert.rejects(wrapper(async () => { effects++; return receipt(); }, {
    resolvePreconditions: async () => ({ preconditions: { version: 2 }, approvedPreconditionsDigest }),
  }).dispatch(input));
  assert.equal(effects, 1);
});
test('uncertain and uncorrelated receipts never become verified successes', async () => {
  for (const change of [{ idempotencyKey: 'other' }, { actionDigest: 'other' }, { inputDigest: 'other' },
    { preconditionsDigest: 'other' }, { outcome: 'unknown' }, { proofRef: '' },
    { outcome: 'not_applied', result: { ok: true } }])
    await assert.rejects(wrapper(async () => ({ ...receipt(), ...change })).dispatch(input));
  await assert.rejects(wrapper(async () => { throw Error('timeout'); }).dispatch(input), /timeout/);
  assert.equal((await wrapper(async () => receipt('not_applied')).dispatch(input)).ok, false);
});
