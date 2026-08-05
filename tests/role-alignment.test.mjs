import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertRoleAlignmentStateV1,
  createRoleAlignmentPolicyRecordV1,
  createRoleAlignmentRoleAnchorV1,
  createRoleAlignmentStateV1,
  digestRoleAlignmentJsonV1,
  observeRoleAlignmentSignalV1,
  replaceRoleAlignmentRoleV1,
  resumeRoleAlignmentStateV1,
} from '@agentplat/inference-control/role-alignment';

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    policyId: 'alignment-policy',
    policyVersion: 1,
    parentPolicyDigest: null,
    thresholds: {
      healthyCoherenceBps: 8_000,
      reinforceCoherenceBelowBps: 7_000,
      pauseCoherenceAtOrBelowBps: 4_000,
      denyCoherenceAtOrBelowBps: 1_000,
      challengeContextAtOrAboveBps: 5_000,
      maximumUncertaintyBps: 6_000,
    },
    consecutiveBreachLimit: 3,
    recoverySignalsRequired: 2,
    reinforcementCooldownSignals: 1,
    denyActionsWhileDegraded: true,
    budgets: {
      maximumReinforcements: 8,
      maximumContextChallenges: 4,
      maximumPauses: 2,
    },
    limits: {
      rollingWindowSignals: 16,
      maximumSignals: 10_000,
      maximumRetainedEvents: 256,
      maximumReasonCodesPerSignal: 8,
      maximumEvidenceReferencesPerSignal: 8,
      maximumAssessmentTtlMs: 10_000,
      maximumStateBytes: 16_777_216,
    },
    ...overrides,
  };
}

function anchor(overrides = {}) {
  return createRoleAlignmentRoleAnchorV1({
    tenantId: 'tenant-a',
    sessionId: 'session-a',
    agentId: 'agent-a',
    objectiveId: 'objective-a',
    roleBindingId: 'role-1',
    roleRevision: 1,
    predecessorRoleBindingId: null,
    roleKey: 'observer',
    roleContent: {
      instructions: ['Inspect local evidence.'],
      constraints: { maximumRisk: 'moderate' },
    },
    ...overrides,
  });
}

function stateFor(policyValue = policy()) {
  return createRoleAlignmentStateV1({
    controllerId: 'alignment-control',
    controllerVersion: 1,
    implementationId: 'alignment-build-1',
    policy: policyValue,
    roleAnchor: anchor(),
    createdAtLogicalMs: 0,
  });
}

function signal(state, sequence, overrides = {}) {
  return {
    schemaVersion: 1,
    signalId: `signal-${sequence}`,
    assessmentRequestId: `assessment-request-${sequence}`,
    assessorId: 'alignment-assessor',
    assessorVersion: 1,
    assessorBindingDigest: `sha256:${'a'.repeat(64)}`,
    tenantId: state.tenantId,
    sessionId: state.sessionId,
    agentId: state.agentId,
    stepId: `step-${sequence}`,
    checkpoint: 'pre_step',
    roleAnchorDigest: state.roleAnchor.anchorDigest,
    roleRevision: state.roleAnchor.roleRevision,
    targetDigest: `sha256:${sequence.toString(16).padStart(64, '0')}`,
    coherenceBps: 9_000,
    uncertaintyBps: 1_000,
    contextInconsistencyBps: 500,
    hardViolation: false,
    reasonCodes: ['assessment_complete'],
    evidenceReferenceIds: [`evidence-${sequence}`],
    observedAtLogicalMs: sequence,
    expiresAtLogicalMs: sequence + 1_000,
    ...overrides,
  };
}

function observe(state, policyValue, sequence, overrides = {}) {
  return observeRoleAlignmentSignalV1(
    state,
    {
      expectedRevision: state.revision,
      signal: signal(state, sequence, overrides),
    },
    policyValue
  );
}

test('longitudinal reducer reinforces drift and fences actions while degraded', () => {
  const policyValue = policy({ recoverySignalsRequired: 3 });
  let state = stateFor(policyValue);

  let reduced = observe(state, policyValue, 1, {
    coherenceBps: 6_500,
  });
  assert.equal(reduced.decision.intervention, 'reinforce_role');
  assert.equal(reduced.decision.disposition, 'allow');
  assert.equal(reduced.state.degraded, true);
  state = reduced.state;

  reduced = observe(state, policyValue, 2, {
    coherenceBps: 9_000,
    checkpoint: 'post_output',
  });
  assert.equal(reduced.state.degraded, true);
  state = reduced.state;

  reduced = observe(state, policyValue, 3, {
    coherenceBps: 9_000,
    checkpoint: 'pre_action',
  });
  assert.equal(reduced.decision.intervention, 'deny');
  assert.equal(
    reduced.decision.reasonCode,
    'action_denied_while_alignment_degraded'
  );
  assert.equal(reduced.state.status, 'denied');
  assert.equal(reduced.state.signalCount, 3);
  assert.equal(reduced.state.events.length, 3);
});

test('context inconsistency challenges, severe drift pauses, and resume is explicit', () => {
  const policyValue = policy();
  let state = stateFor(policyValue);
  let reduced = observe(state, policyValue, 1, {
    contextInconsistencyBps: 7_000,
  });
  assert.equal(reduced.decision.intervention, 'challenge_context');
  assert.equal(reduced.decision.disposition, 'abstain');
  assert.equal(reduced.state.status, 'active');

  state = stateFor(policyValue);
  reduced = observe(state, policyValue, 1, {
    coherenceBps: 3_000,
  });
  assert.equal(reduced.decision.intervention, 'pause');
  assert.equal(reduced.state.status, 'paused');
  const resumed = resumeRoleAlignmentStateV1(
    reduced.state,
    {
      expectedRevision: reduced.state.revision,
      logicalTimeMs: 2,
      reasonCode: 'operator_review_complete',
    },
    policyValue
  );
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.degraded, true);
  assert.equal(resumed.events.at(-1).eventType, 'resumed');
});

test('repeated breaches request a role revision and exact successor unlocks it', () => {
  const policyValue = policy({
    consecutiveBreachLimit: 2,
    reinforcementCooldownSignals: 0,
  });
  let state = stateFor(policyValue);
  state = observe(state, policyValue, 1, { coherenceBps: 6_500 }).state;
  const reduced = observe(state, policyValue, 2, { coherenceBps: 6_400 });
  assert.equal(reduced.decision.intervention, 'request_realign');
  assert.equal(reduced.state.status, 'realignment_required');

  const replacement = anchor({
    roleBindingId: 'role-2',
    roleRevision: 2,
    predecessorRoleBindingId: 'role-1',
    roleKey: 'evidence-reviewer',
    roleContent: {
      instructions: ['Resolve inconsistent evidence.'],
      constraints: { maximumRisk: 'low' },
    },
  });
  const replaced = replaceRoleAlignmentRoleV1(
    reduced.state,
    {
      expectedRevision: reduced.state.revision,
      roleAnchor: replacement,
      logicalTimeMs: 3,
    },
    policyValue
  );
  assert.equal(replaced.status, 'active');
  assert.equal(replaced.degraded, false);
  assert.equal(replaced.roleAnchor.roleRevision, 2);
  assert.deepEqual(replaced.rollingWindow, []);
});

test('state restore rejects changed bindings and stale digests', () => {
  const policyValue = policy();
  const state = observe(stateFor(policyValue), policyValue, 1).state;
  assert.equal(
    assertRoleAlignmentStateV1(state, policyValue, {
      controllerId: 'alignment-control',
      sessionId: 'session-a',
    }).policyId,
    policyValue.policyId
  );
  const tampered = structuredClone(state);
  tampered.degraded = true;
  assert.throws(
    () => assertRoleAlignmentStateV1(tampered, policyValue),
    /state_invalid|state_digest_mismatch/u
  );
  const changedPolicy = { ...policyValue, policyVersion: 2 };
  assert.throws(
    () => assertRoleAlignmentStateV1(state, changedPolicy),
    /state_binding_mismatch/u
  );
  const redigested = structuredClone(state);
  redigested.interventionCounts.reinforcements = 1;
  const { stateDigest: _ignored, ...redigestedBody } = redigested;
  redigested.stateDigest = digestRoleAlignmentJsonV1('state', redigestedBody);
  assert.throws(
    () => assertRoleAlignmentStateV1(redigested, policyValue),
    /state_invalid/u
  );
  assert.match(
    createRoleAlignmentPolicyRecordV1(policyValue).policyDigest,
    /^sha256:[0-9a-f]{64}$/u
  );
});

test('long horizons retain a bounded causal tail while counters keep advancing', () => {
  const base = policy();
  const policyValue = policy({
    limits: {
      ...base.limits,
      rollingWindowSignals: 4,
      maximumRetainedEvents: 8,
    },
  });
  let state = stateFor(policyValue);
  for (let sequence = 1; sequence <= 20; sequence += 1)
    state = observe(state, policyValue, sequence).state;

  assert.equal(state.signalCount, 20);
  assert.equal(state.revision, 20);
  assert.equal(state.events.length, 8);
  assert.equal(state.events[0].eventSequence, 13);
  assert.equal(state.events.at(-1).eventSequence, 20);
  assert.equal(state.rollingWindow.length, 4);
  assert.doesNotThrow(() => assertRoleAlignmentStateV1(state, policyValue));
});
