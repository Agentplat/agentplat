import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActionGrantV1,
  ActionGateway,
  LocalGrantLedger,
  actionDigest,
  actionInputDigest,
  scopeDigest,
} from '../packages/inference-control/dist/tools.js';
import {
  LocalMessageAttemptLedger,
  OutboundMessageGateway,
  outboundMessageDigest,
} from '../packages/inference-control/dist/messages.js';

const scope = Object.freeze({
  schemaVersion: 1,
  kind: 'standalone',
  tenantId: 'tenant:one',
  runId: 'run:one',
  agentId: 'agent:one',
  organizationId: null,
  workspaceId: null,
  policyId: 'policy:one',
  policyVersion: 1,
});
const binding = Object.freeze({
  schemaVersion: 1,
  actionBindingId: 'action-binding:one',
  actionBindingVersion: 1,
  namespace: 'files',
  toolId: 'tool:write',
  operation: 'write',
  dispatcherId: 'dispatcher:one',
  dispatcherVersion: 1,
  contextResolverId: 'context-resolver:one',
  contextResolverVersion: 1,
  fencingMode: 'local_only',
  handlerDigest: `sha256:${'1'.repeat(64)}`,
});

function grant(
  id = 'grant:one',
  input = {},
  grantScope = scope,
  grantBinding = binding,
) {
  const provisional = {
    schemaVersion: 1,
    grantId: id,
    stateGeneration: 1,
    scope: grantScope,
    scopeDigest: scopeDigest(grantScope),
    namespace: grantBinding.namespace,
    toolId: grantBinding.toolId,
    operation: grantBinding.operation,
    actionBindingId: grantBinding.actionBindingId,
    actionBindingVersion: grantBinding.actionBindingVersion,
    handlerDigest: grantBinding.handlerDigest,
    inputDigest: actionInputDigest(input),
    actionDigest: '',
    assessmentRequestId: 'assessment-request:one',
    assessmentId: 'assessment:one',
    assessmentTargetDigest: `sha256:${'2'.repeat(64)}`,
    idempotencyKey: `idempotency:${id}`,
    issuedAtLogicalMs: 1,
    expiresAtLogicalMs: 101,
    singleUse: true,
    status: 'issued',
    reservation: null,
  };
  return Object.freeze({
    ...provisional,
    actionDigest: actionDigest(provisional, grantBinding),
  });
}

function coordinatedScope() {
  return {
    schemaVersion: 1,
    kind: 'coordinated',
    tenantId: 'tenant:one',
    runId: 'run:one',
    agentId: 'agent:one',
    policyId: 'policy:one',
    policyVersion: 1,
    meshId: 'mesh:one',
    objectiveId: 'objective:one',
    objectiveRevision: 1,
    workItemId: 'work:one',
    workItemRevision: 1,
    peerId: 'peer:one',
    instanceId: 'instance:one',
    assignmentAuthorityId: 'authority:one',
    assignmentEpoch: 1,
    fencingToken: 'fence:one',
    leaseExpiresAtLogicalMs: 100,
    authorityGeneration: 1,
    objectiveTerminal: false,
    workTerminal: false,
  };
}

function authorityCurrent(
  resolverId,
  resolverVersion,
  currentScope,
  actionDigestValue,
) {
  return {
    schemaVersion: 1,
    status: 'current',
    resolverId,
    resolverVersion,
    scopeDigest: scopeDigest(currentScope),
    actionDigest: actionDigestValue,
    scope: currentScope,
    authorityGeneration:
      currentScope.kind === 'coordinated'
        ? currentScope.authorityGeneration
        : null,
    fencingToken:
      currentScope.kind === 'coordinated' ? currentScope.fencingToken : null,
  };
}
function authorityStale(
  resolverId,
  resolverVersion,
  currentScope,
  actionDigestValue,
) {
  return {
    schemaVersion: 1,
    status: 'stale',
    resolverId,
    resolverVersion,
    scopeDigest: scopeDigest(currentScope),
    actionDigest: actionDigestValue,
  };
}

function gateway(ledger, dispatch, limits) {
  return new ActionGateway(
    ledger,
    binding,
    {
      dispatcherId: binding.dispatcherId,
      dispatcherVersion: binding.dispatcherVersion,
      fencingMode: 'local_only',
      dispatch,
    },
    {
      contextResolverId: binding.contextResolverId,
      contextResolverVersion: binding.contextResolverVersion,
      async resolve(currentScope) {
        return {
          tenant: { tenantId: currentScope.tenantId },
          toolId: binding.toolId,
          runId: currentScope.runId,
        };
      },
    },
    {
      resolverId: 'authority:one',
      resolverVersion: 1,
      async resolve(currentScope, actionDigestValue) {
        return authorityCurrent(
          'authority:one',
          1,
          currentScope,
          actionDigestValue,
        );
      },
    },
    {
      assessorId: 'assessor:one',
      assessorVersion: 1,
      async consumeCurrent() {
        return true;
      },
    },
    limits,
  );
}

function options(input = {}) {
  return { grantId: 'grant:builder', scope, binding, input,
    assessmentRequestId: 'assessment-request:one', assessmentId: 'assessment:one',
    assessmentTargetDigest: `sha256:${'2'.repeat(64)}`,
    idempotencyKey: 'idempotency:grant:builder', issuedAtLogicalMs: 1,
    expiresAtLogicalMs: 101 };
}

test('builder preserves legacy bytes and gateway accepts the prepared grant', async () => {
  const input = { path: '/safe' };
  const prepared = createActionGrantV1(options(input));
  assert.deepEqual(prepared, grant('grant:builder', input));
  const ledger = new LocalGrantLedger('gateway:builder');
  ledger.issue(prepared);
  let calls = 0;
  await gateway(ledger, async () => { calls++; return { ok: true }; })
    .invoke({ schemaVersion: 1, grantId: prepared.grantId, input, logicalTimeMs: 2 });
  assert.equal(calls, 1);
  await assert.rejects(gateway(ledger, async () => { calls++; return { ok: true }; })
    .invoke({ schemaVersion: 1, grantId: prepared.grantId, input, logicalTimeMs: 2 }));
  assert.equal(calls, 1);
});

test('builder snapshots scope and binds input without mutating callers', () => {
  const o = options({ nested: { value: 1 } });
  o.scope = { ...scope };
  const prepared = createActionGrantV1(o);
  o.scope.agentId = 'other';
  o.input.nested.value = 2;
  assert.equal(prepared.scope.agentId, scope.agentId);
  assert.equal(prepared.inputDigest, actionInputDigest({ nested: { value: 1 } }));
  assert.ok(Object.isFrozen(prepared));
  assert.ok(Object.isFrozen(prepared.scope));
});

test('builder rejects malformed references, scope, binding, input and lifetimes', () => {
  for (const patch of [
    { scope: { ...scope, tenantId: '' } },
    { binding: { ...binding, actionBindingVersion: 0 } },
    { assessmentId: '' }, { assessmentTargetDigest: 'unverified' },
    { issuedAtLogicalMs: -1 }, { expiresAtLogicalMs: 1 },
    { expiresAtLogicalMs: 120002 }, { idempotencyKey: '' },
    { input: { value: NaN } }, { input: { payload: 'x'.repeat(65536) } },
  ]) assert.throws(() => createActionGrantV1({ ...options(), ...patch }));
});

test('builder supports coordinated scopes without adding execution authority', () => {
  const prepared = createActionGrantV1({ ...options(), scope: coordinatedScope() });
  assert.equal(prepared.scope.kind, 'coordinated');
  assert.equal(prepared.reservation, null);
  assert.equal(prepared.status, 'issued');
});

test('preparing and issuing a grant cannot bypass the current assessment', async () => {
  const ledger = new LocalGrantLedger('gateway:denied');
  const prepared = createActionGrantV1(options());
  ledger.issue(prepared);
  let effects = 0;
  const g = gateway(ledger, async () => { effects++; return { ok: true }; });
  const denied = new ActionGateway(ledger, binding, g.dispatcher,
    g.contextResolver, g.authorityResolver,
    { assessorId: 'assessor:one', assessorVersion: 1, async consumeCurrent() { return false; } });
  await assert.rejects(denied.invoke({ schemaVersion: 1,
    grantId: prepared.grantId, input: {}, logicalTimeMs: 2 }));
  assert.equal(effects, 0);
});
