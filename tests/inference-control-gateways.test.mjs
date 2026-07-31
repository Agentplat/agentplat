import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

test('Action Gateway reserves once and concurrent use produces one dispatch', async () => {
  const ledger = new LocalGrantLedger('gateway:one');
  ledger.issue(grant());
  let calls = 0;
  const actionGateway = gateway(ledger, async () => {
    calls += 1;
    await Promise.resolve();
    return { ok: true, value: { written: true } };
  });
  const outcomes = await Promise.allSettled([
    actionGateway.invoke({
      schemaVersion: 1,
      grantId: 'grant:one',
      input: {},
      logicalTimeMs: 2,
    }),
    actionGateway.invoke({
      schemaVersion: 1,
      grantId: 'grant:one',
      input: {},
      logicalTimeMs: 2,
    }),
  ]);
  assert.equal(
    outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
    1,
  );
  assert.equal(calls, 1);
  assert.equal(ledger.get('grant:one').status, 'dispatched');
});

test('no-argument actions bind canonical empty input and scoped idempotency conflicts', async () => {
  assert.equal(actionInputDigest({}), actionInputDigest(Object.freeze({})));
  const ledger = new LocalGrantLedger('gateway:no-arguments');
  const first = grant('grant:no-arguments');
  ledger.issue(first);
  let dispatchedInput;
  await gateway(ledger, async ({ input }) => {
    dispatchedInput = input;
    return { ok: true };
  }).invoke({
    schemaVersion: 1,
    grantId: first.grantId,
    logicalTimeMs: 2,
  });
  assert.deepEqual(dispatchedInput, {});

  const replayLedger = new LocalGrantLedger('gateway:idempotency');
  const replaySource = grant('grant:idempotency:one');
  replayLedger.issue(replaySource);
  const exactReplay = {
    ...replaySource,
    grantId: 'grant:idempotency:replay',
  };
  assert.equal(replayLedger.issue(exactReplay).grantId, replaySource.grantId);
  const changedSource = grant('grant:idempotency:changed', { changed: true });
  assert.throws(
    () =>
      replayLedger.issue({
        ...changedSource,
        idempotencyKey: replaySource.idempotencyKey,
      }),
    /grant_idempotency_conflict/,
  );

  const closedLedger = new LocalGrantLedger('gateway:closed-input');
  closedLedger.issue(grant('grant:closed-input'));
  let closedDispatches = 0;
  await assert.rejects(
    gateway(closedLedger, async () => {
      closedDispatches += 1;
      return { ok: true };
    }).invoke({
      schemaVersion: 1,
      grantId: 'grant:closed-input',
      logicalTimeMs: 2,
      metadata: { credential: 'caller-supplied' },
    }),
    /action_not_permitted/,
  );
  assert.equal(closedDispatches, 0);
});

test('Action Gateway rejects argument substitution before dispatch', async () => {
  const ledger = new LocalGrantLedger('gateway:one');
  ledger.issue(grant('grant:args', { path: '/safe' }));
  let calls = 0;
  await assert.rejects(
    gateway(ledger, async () => {
      calls += 1;
      return { ok: true };
    }).invoke({
      schemaVersion: 1,
      grantId: 'grant:args',
      input: { path: '/other' },
      logicalTimeMs: 2,
    }),
    /grant_action_mismatch/,
  );
  assert.equal(calls, 0);
});

test('Action Gateway enforces policy byte limits and a hard JSON-depth fence before dispatch', async () => {
  const oversizedInput = { payload: 'x'.repeat(512) };
  const oversizedLedger = new LocalGrantLedger('gateway:bounded-input');
  oversizedLedger.issue(grant('grant:bounded-input', oversizedInput));
  let dispatches = 0;
  await assert.rejects(
    gateway(
      oversizedLedger,
      async () => {
        dispatches += 1;
        return { ok: true };
      },
      { maxActionInputBytes: 128 },
    ).invoke({
      schemaVersion: 1,
      grantId: 'grant:bounded-input',
      input: oversizedInput,
      logicalTimeMs: 2,
    }),
    /action_not_permitted/,
  );

  let deeplyNestedInput = { value: true };
  for (let depth = 0; depth < 65; depth += 1)
    deeplyNestedInput = { child: deeplyNestedInput };
  const deepLedger = new LocalGrantLedger('gateway:bounded-depth');
  deepLedger.issue(grant('grant:bounded-depth', deeplyNestedInput));
  await assert.rejects(
    gateway(deepLedger, async () => {
      dispatches += 1;
      return { ok: true };
    }).invoke({
      schemaVersion: 1,
      grantId: 'grant:bounded-depth',
      input: deeplyNestedInput,
      logicalTimeMs: 2,
    }),
    /action_not_permitted/,
  );
  assert.equal(dispatches, 0);
});

test('Action Gateway snapshots mutable input and rejects unfenced coordinated authority', async () => {
  const fencedLedger = new LocalGrantLedger('gateway:one');
  fencedLedger.issue(grant('grant:coordinated', {}, coordinatedScope()));
  await assert.rejects(
    gateway(fencedLedger, async () => ({ ok: true })).invoke({
      schemaVersion: 1,
      grantId: 'grant:coordinated',
      input: {},
      logicalTimeMs: 2,
    }),
    /dependency_rebind_failed/,
  );

  const mutable = { path: '/safe' };
  const snapshotLedger = new LocalGrantLedger('gateway:one');
  snapshotLedger.issue(grant('grant:snapshot-input', mutable));
  let received;
  const actionGateway = new ActionGateway(
    snapshotLedger,
    binding,
    {
      dispatcherId: binding.dispatcherId,
      dispatcherVersion: binding.dispatcherVersion,
      fencingMode: 'local_only',
      async dispatch({ input }) {
        received = input;
        return { ok: true };
      },
    },
    {
      contextResolverId: binding.contextResolverId,
      contextResolverVersion: binding.contextResolverVersion,
      async resolve() {
        mutable.path = '/substituted';
        return {
          tenant: { tenantId: scope.tenantId },
          toolId: binding.toolId,
          runId: scope.runId,
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
  );
  await actionGateway.invoke({
    schemaVersion: 1,
    grantId: 'grant:snapshot-input',
    input: mutable,
    logicalTimeMs: 2,
  });
  assert.equal(received.path, '/safe');
  assert.equal(Object.isFrozen(received), true);
});

test('authority advance and ambiguous dispatch never create a second action attempt', async () => {
  const racedLedger = new LocalGrantLedger('gateway:race');
  racedLedger.issue(grant('grant:race'));
  let authorityReads = 0;
  let racedDispatches = 0;
  const raced = new ActionGateway(
    racedLedger,
    binding,
    {
      dispatcherId: binding.dispatcherId,
      dispatcherVersion: binding.dispatcherVersion,
      fencingMode: 'local_only',
      async dispatch() {
        racedDispatches += 1;
        return { ok: true };
      },
    },
    {
      contextResolverId: binding.contextResolverId,
      contextResolverVersion: binding.contextResolverVersion,
      async resolve() {
        return {
          tenant: { tenantId: scope.tenantId },
          toolId: binding.toolId,
          runId: scope.runId,
        };
      },
    },
    {
      resolverId: 'authority:race',
      resolverVersion: 1,
      async resolve(currentScope, actionDigestValue) {
        authorityReads += 1;
        return {
          ...authorityCurrent(
            'authority:race',
            1,
            currentScope,
            actionDigestValue,
          ),
          authorityGeneration: authorityReads,
          fencingToken: `fence:${authorityReads}`,
        };
      },
    },
    {
      assessorId: 'assessor:one',
      assessorVersion: 1,
      async consumeCurrent() {
        return true;
      },
    },
  );
  await assert.rejects(
    raced.invoke({
      schemaVersion: 1,
      grantId: 'grant:race',
      logicalTimeMs: 2,
    }),
    /grant_fence_stale/,
  );
  assert.equal(racedDispatches, 0);
  assert.equal(racedLedger.get('grant:race').status, 'failed');

  const ambiguousLedger = new LocalGrantLedger('gateway:ambiguous');
  ambiguousLedger.issue(grant('grant:ambiguous'));
  let ambiguousDispatches = 0;
  const ambiguous = gateway(ambiguousLedger, async () => {
    ambiguousDispatches += 1;
    throw new Error('timeout_after_dispatch_start');
  });
  await assert.rejects(
    ambiguous.invoke({
      schemaVersion: 1,
      grantId: 'grant:ambiguous',
      logicalTimeMs: 2,
    }),
    /timeout_after_dispatch_start/,
  );
  assert.equal(ambiguousLedger.get('grant:ambiguous').status, 'indeterminate');
  await assert.rejects(
    ambiguous.invoke({
      schemaVersion: 1,
      grantId: 'grant:ambiguous',
      logicalTimeMs: 3,
    }),
    /grant_consumed/,
  );
  assert.equal(ambiguousDispatches, 1);
});

test('coordinated actions require atomic downstream fencing and revalidate after context resolution', async () => {
  const coordinated = coordinatedScope();
  const atomicBinding = { ...binding, fencingMode: 'downstream_atomic' };
  const localLedger = new LocalGrantLedger('gateway:coordinated');
  localLedger.issue(grant('grant:local-fence', {}, coordinated, atomicBinding));
  let localDispatches = 0;
  const localGateway = new ActionGateway(
    localLedger,
    atomicBinding,
    {
      dispatcherId: atomicBinding.dispatcherId,
      dispatcherVersion: atomicBinding.dispatcherVersion,
      fencingMode: 'local_only',
      async dispatch() {
        localDispatches += 1;
        return { ok: true };
      },
    },
    {
      contextResolverId: atomicBinding.contextResolverId,
      contextResolverVersion: atomicBinding.contextResolverVersion,
      async resolve() {
        return {
          tenant: { tenantId: coordinated.tenantId },
          toolId: atomicBinding.toolId,
          runId: coordinated.runId,
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
  );
  await assert.rejects(
    localGateway.invoke({
      schemaVersion: 1,
      grantId: 'grant:local-fence',
      logicalTimeMs: 2,
    }),
    /grant_action_mismatch/,
  );
  assert.equal(localDispatches, 0);

  const racedLedger = new LocalGrantLedger('gateway:coordinated-race');
  racedLedger.issue(grant('grant:late-fence', {}, coordinated, atomicBinding));
  let stale = false;
  let dispatches = 0;
  const racedGateway = new ActionGateway(
    racedLedger,
    atomicBinding,
    {
      dispatcherId: atomicBinding.dispatcherId,
      dispatcherVersion: atomicBinding.dispatcherVersion,
      fencingMode: 'downstream_atomic',
      async dispatch() {
        dispatches += 1;
        return { ok: true };
      },
    },
    {
      contextResolverId: atomicBinding.contextResolverId,
      contextResolverVersion: atomicBinding.contextResolverVersion,
      async resolve() {
        stale = true;
        return {
          tenant: { tenantId: coordinated.tenantId },
          toolId: atomicBinding.toolId,
          runId: coordinated.runId,
        };
      },
    },
    {
      resolverId: 'authority:one',
      resolverVersion: 1,
      async resolve(currentScope, actionDigestValue) {
        return stale
          ? authorityStale('authority:one', 1, currentScope, actionDigestValue)
          : authorityCurrent(
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
  );
  await assert.rejects(
    racedGateway.invoke({
      schemaVersion: 1,
      grantId: 'grant:late-fence',
      logicalTimeMs: 2,
    }),
    /grant_fence_stale/,
  );
  assert.equal(dispatches, 0);
});

test('authority responses must be closed, resolver-bound, and correlated before dispatch or send', async () => {
  const actionLedger = new LocalGrantLedger('gateway:authority');
  actionLedger.issue(grant('grant:bad-authority'));
  let dispatches = 0;
  const actionGateway = new ActionGateway(
    actionLedger,
    binding,
    {
      dispatcherId: binding.dispatcherId,
      dispatcherVersion: binding.dispatcherVersion,
      fencingMode: 'local_only',
      async dispatch() {
        dispatches += 1;
        return { ok: true };
      },
    },
    {
      contextResolverId: binding.contextResolverId,
      contextResolverVersion: binding.contextResolverVersion,
      async resolve() {
        return {
          tenant: { tenantId: scope.tenantId },
          toolId: binding.toolId,
          runId: scope.runId,
        };
      },
    },
    {
      resolverId: 'authority:one',
      resolverVersion: 1,
      async resolve(currentScope, actionDigestValue) {
        return {
          ...authorityCurrent(
            'authority:one',
            1,
            currentScope,
            actionDigestValue,
          ),
          unexpected: true,
        };
      },
    },
    {
      assessorId: 'assessor:one',
      assessorVersion: 1,
      async consumeCurrent() {
        return true;
      },
    },
  );
  await assert.rejects(
    actionGateway.invoke({
      schemaVersion: 1,
      grantId: 'grant:bad-authority',
      logicalTimeMs: 2,
    }),
    /authority_result_invalid/,
  );
  assert.equal(dispatches, 0);

  const { message, attempt } = messageFixture('message:bad-authority');
  const messageLedger = new LocalMessageAttemptLedger(
    'gateway:message-authority',
  );
  messageLedger.prepare(attempt);
  let sends = 0;
  const messageGateway = new OutboundMessageGateway(
    messageLedger,
    {
      dispatcherId: attempt.dispatcherId,
      dispatcherVersion: attempt.dispatcherVersion,
      dispatcherDigest: attempt.dispatcherDigest,
      fencingMode: 'local_only',
      async send() {
        sends += 1;
        return { ok: true };
      },
    },
    {
      resolverId: 'authority:one',
      resolverVersion: 1,
      async resolve() {
        return { status: 'current' };
      },
    },
    {
      assessorId: 'assessor:one',
      assessorVersion: 1,
      async consumeCurrent() {
        return true;
      },
    },
    ['updates'],
  );
  await assert.rejects(
    messageGateway.send({ schemaVersion: 1, message, logicalTimeMs: 2 }),
    /authority_result_invalid/,
  );
  assert.equal(sends, 0);
});

test('assessment revocation during awaited gateway work fails at the final pre-effect boundary', async () => {
  const actionLedger = new LocalGrantLedger('gateway:assessment-race');
  actionLedger.issue(grant('grant:assessment-race'));
  let actionAssessmentCurrent = true;
  let actionAssessmentChecks = 0;
  let dispatches = 0;
  const actionGateway = new ActionGateway(
    actionLedger,
    binding,
    {
      dispatcherId: binding.dispatcherId,
      dispatcherVersion: binding.dispatcherVersion,
      fencingMode: 'local_only',
      async dispatch() {
        dispatches += 1;
        return { ok: true };
      },
    },
    {
      contextResolverId: binding.contextResolverId,
      contextResolverVersion: binding.contextResolverVersion,
      async resolve() {
        actionAssessmentCurrent = false;
        return {
          tenant: { tenantId: scope.tenantId },
          toolId: binding.toolId,
          runId: scope.runId,
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
        actionAssessmentChecks += 1;
        return actionAssessmentCurrent;
      },
    },
  );
  await assert.rejects(
    actionGateway.invoke({
      schemaVersion: 1,
      grantId: 'grant:assessment-race',
      logicalTimeMs: 2,
    }),
    /grant_assessment_mismatch/,
  );
  assert.equal(actionAssessmentChecks, 2);
  assert.equal(dispatches, 0);
  assert.equal(actionLedger.get('grant:assessment-race').status, 'failed');

  const { message, attempt } = messageFixture('message:assessment-race');
  const messageLedger = new LocalMessageAttemptLedger(
    'gateway:message-assessment-race',
  );
  messageLedger.prepare(attempt);
  let messageAssessmentCurrent = true;
  let messageAssessmentChecks = 0;
  let authorityChecks = 0;
  let sends = 0;
  const messageGateway = new OutboundMessageGateway(
    messageLedger,
    {
      dispatcherId: attempt.dispatcherId,
      dispatcherVersion: attempt.dispatcherVersion,
      dispatcherDigest: attempt.dispatcherDigest,
      fencingMode: 'local_only',
      async send() {
        sends += 1;
        return { ok: true };
      },
    },
    {
      resolverId: 'authority:one',
      resolverVersion: 1,
      async resolve(currentScope, actionDigestValue) {
        authorityChecks += 1;
        if (authorityChecks === 1) messageAssessmentCurrent = false;
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
        messageAssessmentChecks += 1;
        return messageAssessmentCurrent;
      },
    },
    ['updates'],
  );
  await assert.rejects(
    messageGateway.send({ schemaVersion: 1, message, logicalTimeMs: 2 }),
    /assessment_required/,
  );
  assert.equal(messageAssessmentChecks, 2);
  assert.equal(sends, 0);
  assert.equal(messageLedger.get(attempt.messageAttemptId).status, 'failed');
});

test('reserved Action Grant restores as indeterminate and never issued', () => {
  const source = new LocalGrantLedger('gateway:one');
  source.issue(grant('grant:restore'));
  const snapshot = source.snapshot();
  const reserved = {
    ...snapshot.grants[0],
    status: 'reserved',
    stateGeneration: 2,
    reservation: {
      schemaVersion: 1,
      reservationId: 'grant:restore:reservation:2',
      dispatchAttemptId: 'grant:restore:dispatch:2',
      reservedByGatewayId: 'gateway:one',
      reservedStateGeneration: 2,
      authorityGeneration: null,
      fencingToken: null,
      reservedAtLogicalMs: 2,
    },
  };
  const reservedSnapshot = {
    schemaVersion: 1,
    highWaterLogicalMs: 2,
    grants: [reserved],
  };
  const restored = new LocalGrantLedger('gateway:one');
  restored.restore(reservedSnapshot);
  assert.equal(restored.get('grant:restore').status, 'indeterminate');
  assert.throws(
    () => restored.restore(source.snapshot()),
    /Invalid Action Grant snapshot/,
  );
});

function messageFixture(id = 'message:one') {
  const unsigned = {
    schemaVersion: 1,
    messageId: id,
    runId: scope.runId,
    tenantId: scope.tenantId,
    channel: 'updates',
    recipient: 'operator:one',
    mediaType: 'json',
    content: { result: 'ready' },
    scope,
    idempotencyKey: `idempotency:${id}`,
  };
  const message = Object.freeze({
    ...unsigned,
    messageDigest: outboundMessageDigest(unsigned),
  });
  const attempt = Object.freeze({
    schemaVersion: 1,
    messageAttemptId: `message-attempt:${id}`,
    messageId: id,
    assessmentRequestId: 'assessment-request:message',
    assessmentId: 'assessment:message',
    messageDigest: message.messageDigest,
    scopeDigest: scopeDigest(scope),
    idempotencyKey: message.idempotencyKey,
    generation: 1,
    dispatcherId: 'message-dispatcher:one',
    dispatcherVersion: 1,
    dispatcherDigest: `sha256:${'3'.repeat(64)}`,
    status: 'prepared',
    reservation: null,
    reservedAtLogicalMs: null,
    expiresAtLogicalMs: 100,
  });
  return { message, attempt };
}

test('Outbound Message Gateway consumes one assessment and sends once', async () => {
  const { message, attempt } = messageFixture();
  const ledger = new LocalMessageAttemptLedger('gateway:message');
  ledger.prepare(attempt);
  let sends = 0;
  const outbound = new OutboundMessageGateway(
    ledger,
    {
      dispatcherId: attempt.dispatcherId,
      dispatcherVersion: attempt.dispatcherVersion,
      dispatcherDigest: attempt.dispatcherDigest,
      fencingMode: 'local_only',
      async send() {
        sends += 1;
        return { ok: true };
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
    ['updates'],
  );
  await assert.rejects(
    outbound.send({
      schemaVersion: 1,
      message,
      logicalTimeMs: 2,
      metadata: { credential: 'caller-supplied' },
    }),
    /message_not_permitted/,
  );
  await assert.rejects(
    outbound.send({
      schemaVersion: 1,
      message: { ...message, metadata: true },
      logicalTimeMs: 2,
    }),
    /message_not_permitted/,
  );
  assert.equal(sends, 0);
  await outbound.send({ schemaVersion: 1, message, logicalTimeMs: 2 });
  assert.equal(sends, 1);
  assert.equal(ledger.get(attempt.messageAttemptId).status, 'sent');
  await assert.rejects(
    outbound.send({ schemaVersion: 1, message, logicalTimeMs: 3 }),
    /message_indeterminate/,
  );
  assert.equal(sends, 1);
});

test('Outbound Message Gateway enforces the policy byte limit before assessment or send', async () => {
  const fixture = messageFixture('message:bounded');
  const unsigned = {
    ...fixture.message,
    content: { payload: 'x'.repeat(1_024) },
  };
  delete unsigned.messageDigest;
  const message = {
    ...unsigned,
    messageDigest: outboundMessageDigest(unsigned),
  };
  const attempt = {
    ...fixture.attempt,
    messageDigest: message.messageDigest,
  };
  const ledger = new LocalMessageAttemptLedger('gateway:bounded-message');
  ledger.prepare(attempt);
  let assessments = 0;
  let sends = 0;
  const outbound = new OutboundMessageGateway(
    ledger,
    {
      dispatcherId: attempt.dispatcherId,
      dispatcherVersion: attempt.dispatcherVersion,
      dispatcherDigest: attempt.dispatcherDigest,
      fencingMode: 'local_only',
      async send() {
        sends += 1;
        return { ok: true };
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
        assessments += 1;
        return true;
      },
    },
    ['updates'],
    { maxOutboundMessageBytes: 512 },
  );
  await assert.rejects(
    outbound.send({ schemaVersion: 1, message, logicalTimeMs: 2 }),
    /message_not_permitted/,
  );
  assert.equal(assessments, 0);
  assert.equal(sends, 0);
  assert.equal(ledger.get(attempt.messageAttemptId).status, 'prepared');
});

test('reserved message attempt restores as indeterminate without send', () => {
  const { attempt } = messageFixture('message:restore');
  const source = new LocalMessageAttemptLedger('gateway:message');
  source.prepare(attempt);
  const snapshot = source.snapshot();
  const reserved = {
    ...snapshot.attempts[0],
    status: 'reserved',
    generation: 2,
    reservedAtLogicalMs: 2,
    reservation: {
      schemaVersion: 1,
      reservationId: `${attempt.messageAttemptId}:reservation:2`,
      messageDispatchAttemptId: `${attempt.messageAttemptId}:dispatch:2`,
      reservedByGatewayId: 'gateway:message',
      reservedStateGeneration: 2,
      authorityGeneration: null,
      fencingToken: null,
      reservedAtLogicalMs: 2,
    },
  };
  const reservedSnapshot = {
    schemaVersion: 1,
    highWaterLogicalMs: 2,
    attempts: [reserved],
  };
  const restored = new LocalMessageAttemptLedger('gateway:message');
  restored.restore(reservedSnapshot);
  assert.equal(restored.get(attempt.messageAttemptId).status, 'indeterminate');
});

test('ledgers reject forged snapshots and conflicting duplicates atomically', () => {
  const ledger = new LocalGrantLedger('gateway:one');
  const clean = ledger.snapshot();
  const valid = grant('grant:snapshot');
  const forged = { ...valid, inputDigest: 'sha256:forged' };
  assert.throws(
    () =>
      ledger.restore({
        schemaVersion: 1,
        highWaterLogicalMs: 1,
        grants: [forged],
      }),
    /Invalid Action Grant snapshot/,
  );
  assert.deepEqual(ledger.snapshot(), clean);
  assert.throws(
    () =>
      ledger.restore({
        schemaVersion: 1,
        highWaterLogicalMs: 1,
        grants: [valid, valid],
      }),
    /state_conflict/,
  );
  assert.deepEqual(ledger.snapshot(), clean);
});

test('Outbound Message Gateway rejects tenant/run substitution despite matching attempt digest', async () => {
  const { message, attempt } = messageFixture('message:scope-substitution');
  const substitutedUnsigned = { ...message, tenantId: 'tenant:other' };
  const substituted = {
    ...substitutedUnsigned,
    messageDigest: outboundMessageDigest(substitutedUnsigned),
  };
  const substitutedAttempt = {
    ...attempt,
    messageDigest: substituted.messageDigest,
  };
  const ledger = new LocalMessageAttemptLedger('gateway:message');
  ledger.prepare(substitutedAttempt);
  const gateway = new OutboundMessageGateway(
    ledger,
    {
      dispatcherId: attempt.dispatcherId,
      dispatcherVersion: attempt.dispatcherVersion,
      dispatcherDigest: attempt.dispatcherDigest,
      fencingMode: 'local_only',
      async send() {
        throw new Error('must_not_send');
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
    ['updates'],
  );
  await assert.rejects(
    gateway.send({
      schemaVersion: 1,
      message: substituted,
      logicalTimeMs: 2,
    }),
    /message_not_permitted/,
  );
});

test('message scopes are exact, expiry advances high-water, and coordinated sends require atomic fencing', async () => {
  const malformedScope = {
    schemaVersion: 1,
    kind: 'coordinated',
    tenantId: scope.tenantId,
    runId: scope.runId,
  };
  const malformedUnsigned = {
    schemaVersion: 1,
    messageId: 'message:malformed-scope',
    runId: scope.runId,
    tenantId: scope.tenantId,
    channel: 'updates',
    recipient: 'operator:one',
    mediaType: 'text',
    content: 'blocked',
    scope: malformedScope,
    idempotencyKey: 'idempotency:malformed-scope',
  };
  const malformedMessage = {
    ...malformedUnsigned,
    messageDigest: outboundMessageDigest(malformedUnsigned),
  };
  const malformedAttempt = {
    ...messageFixture('message:malformed-scope').attempt,
    messageDigest: malformedMessage.messageDigest,
    scopeDigest: scopeDigest(malformedScope),
    idempotencyKey: malformedMessage.idempotencyKey,
  };
  const malformedLedger = new LocalMessageAttemptLedger('gateway:malformed');
  malformedLedger.prepare(malformedAttempt);
  let malformedSends = 0;
  const malformedGateway = new OutboundMessageGateway(
    malformedLedger,
    {
      dispatcherId: malformedAttempt.dispatcherId,
      dispatcherVersion: malformedAttempt.dispatcherVersion,
      dispatcherDigest: malformedAttempt.dispatcherDigest,
      fencingMode: 'downstream_atomic',
      async send() {
        malformedSends += 1;
        return { ok: true };
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
    ['updates'],
  );
  await assert.rejects(
    malformedGateway.send({
      schemaVersion: 1,
      message: malformedMessage,
      logicalTimeMs: 1,
    }),
    /message_not_permitted/,
  );
  assert.equal(malformedSends, 0);

  const expiring = messageFixture('message:expires');
  const expiringAttempt = { ...expiring.attempt, expiresAtLogicalMs: 10 };
  const expiryLedger = new LocalMessageAttemptLedger('gateway:expiry');
  expiryLedger.prepare(expiringAttempt);
  const expiryGateway = new OutboundMessageGateway(
    expiryLedger,
    {
      dispatcherId: expiringAttempt.dispatcherId,
      dispatcherVersion: expiringAttempt.dispatcherVersion,
      dispatcherDigest: expiringAttempt.dispatcherDigest,
      fencingMode: 'local_only',
      async send() {
        throw new Error('must_not_send');
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
    ['updates'],
  );
  await assert.rejects(
    expiryGateway.send({
      schemaVersion: 1,
      message: expiring.message,
      logicalTimeMs: 10,
    }),
    /message_indeterminate/,
  );
  assert.equal(
    expiryLedger.get(expiringAttempt.messageAttemptId).status,
    'expired',
  );
  await assert.rejects(
    expiryGateway.send({
      schemaVersion: 1,
      message: expiring.message,
      logicalTimeMs: 9,
    }),
    /logical_time_rollback/,
  );

  const coordinated = coordinatedScope();
  const coordinatedUnsigned = {
    ...messageFixture('message:coordinated').message,
    scope: coordinated,
  };
  const coordinatedMessage = {
    ...coordinatedUnsigned,
    messageDigest: outboundMessageDigest(coordinatedUnsigned),
  };
  const coordinatedAttempt = {
    ...messageFixture('message:coordinated').attempt,
    messageDigest: coordinatedMessage.messageDigest,
    scopeDigest: scopeDigest(coordinated),
  };
  const coordinatedLedger = new LocalMessageAttemptLedger(
    'gateway:coordinated',
  );
  coordinatedLedger.prepare(coordinatedAttempt);
  const coordinatedGateway = new OutboundMessageGateway(
    coordinatedLedger,
    {
      dispatcherId: coordinatedAttempt.dispatcherId,
      dispatcherVersion: coordinatedAttempt.dispatcherVersion,
      dispatcherDigest: coordinatedAttempt.dispatcherDigest,
      fencingMode: 'local_only',
      async send() {
        throw new Error('must_not_send');
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
    ['updates'],
  );
  await assert.rejects(
    coordinatedGateway.send({
      schemaVersion: 1,
      message: coordinatedMessage,
      logicalTimeMs: 2,
    }),
    /dependency_rebind_failed/,
  );
});

test('message denial and ambiguous send produce zero retry sends', async () => {
  const deniedFixture = messageFixture('message:denied');
  const deniedLedger = new LocalMessageAttemptLedger('gateway:denied');
  deniedLedger.prepare(deniedFixture.attempt);
  let deniedSends = 0;
  const denied = new OutboundMessageGateway(
    deniedLedger,
    {
      dispatcherId: deniedFixture.attempt.dispatcherId,
      dispatcherVersion: deniedFixture.attempt.dispatcherVersion,
      dispatcherDigest: deniedFixture.attempt.dispatcherDigest,
      fencingMode: 'local_only',
      async send() {
        deniedSends += 1;
        return { ok: true };
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
        return false;
      },
    },
    ['updates'],
  );
  await assert.rejects(
    denied.send({
      schemaVersion: 1,
      message: deniedFixture.message,
      logicalTimeMs: 2,
    }),
    /assessment_required/,
  );
  assert.equal(deniedSends, 0);
  assert.equal(
    deniedLedger.get(deniedFixture.attempt.messageAttemptId).status,
    'prepared',
  );

  const ambiguousFixture = messageFixture('message:ambiguous');
  const ambiguousLedger = new LocalMessageAttemptLedger('gateway:ambiguous');
  ambiguousLedger.prepare(ambiguousFixture.attempt);
  let sends = 0;
  const ambiguous = new OutboundMessageGateway(
    ambiguousLedger,
    {
      dispatcherId: ambiguousFixture.attempt.dispatcherId,
      dispatcherVersion: ambiguousFixture.attempt.dispatcherVersion,
      dispatcherDigest: ambiguousFixture.attempt.dispatcherDigest,
      fencingMode: 'local_only',
      async send() {
        sends += 1;
        throw new Error('timeout_after_send_start');
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
    ['updates'],
  );
  await assert.rejects(
    ambiguous.send({
      schemaVersion: 1,
      message: ambiguousFixture.message,
      logicalTimeMs: 2,
    }),
    /timeout_after_send_start/,
  );
  assert.equal(
    ambiguousLedger.get(ambiguousFixture.attempt.messageAttemptId).status,
    'indeterminate',
  );
  await assert.rejects(
    ambiguous.send({
      schemaVersion: 1,
      message: ambiguousFixture.message,
      logicalTimeMs: 3,
    }),
    /message_indeterminate/,
  );
  assert.equal(sends, 1);
});
