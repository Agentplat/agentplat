import assert from 'node:assert/strict';
import test from 'node:test';

import { createRoleAlignmentPortableAgentControlV1 } from '@agentplat/inference-control/role-alignment/portable-agent';
import {
  PortableAgentAdapterRegistryV1,
  PortableAgentSessionRuntimeV1,
} from '@agentplat/runtime/adapter';

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    policyId: 'portable-alignment',
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
    consecutiveBreachLimit: 5,
    recoverySignalsRequired: 3,
    reinforcementCooldownSignals: 1,
    denyActionsWhileDegraded: true,
    budgets: {
      maximumReinforcements: 8,
      maximumContextChallenges: 4,
      maximumPauses: 2,
    },
    limits: {
      rollingWindowSignals: 32,
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

function role(overrides = {}) {
  return {
    schemaVersion: 1,
    roleBindingId: 'role-1',
    roleRevision: 1,
    predecessorRoleBindingId: null,
    objectiveId: 'objective-1',
    roleKey: 'observer',
    instructions: ['Inspect local evidence.'],
    constraints: { maximumRisk: 'moderate' },
    validFromLogicalMs: 0,
    validUntilLogicalMs: 100_000,
    ...overrides,
  };
}

function controlTarget(overrides = {}) {
  return {
    schemaVersion: 1,
    checkpoint: 'pre_step',
    stepSequence: 1,
    manifest: manifest(),
    sessionId: 'session-1',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    role: role(),
    request: {
      schemaVersion: 1,
      stepId: 'step-1',
      expectedSessionRevision: 0,
      interactionMode: 'observe_act',
      observations: [],
      input: { inspect: true },
      requestedOutputModalities: ['text', 'action'],
      logicalTimeMs: 10,
    },
    output: null,
    actionProposal: null,
    ...overrides,
  };
}

function manifest() {
  return {
    schemaVersion: 1,
    adapterId: 'adapter-1',
    adapterVersion: '1.0.0',
    implementationId: 'adapter-build-1',
    agentKinds: ['hybrid'],
    inputModalities: ['structured'],
    outputModalities: ['text', 'action'],
    interactionModes: ['observe_act'],
    controlPoints: ['pre_step', 'post_output', 'pre_action'],
    supportsCancellation: true,
    supportsCheckpoint: false,
    supportsRestore: false,
    maximumObservationBytes: 100_000,
    maximumOutputBytes: 100_000,
    maximumActionBytes: 100_000,
    maximumStepsPerSession: 100,
  };
}

function assessor(scoreFor = () => 9_000) {
  return {
    assess(request, target) {
      const score = scoreFor(target);
      return {
        schemaVersion: 1,
        assessmentId: `assessment-${request.stateRevision + 1}`,
        assessmentRequestId: request.assessmentRequestId,
        targetDigest: request.targetDigest,
        assessorId: 'assessor-1',
        assessorVersion: 1,
        assessorBindingDigest: `sha256:${'b'.repeat(64)}`,
        coherenceBps: score,
        uncertaintyBps: 1_000,
        contextInconsistencyBps: 500,
        hardViolation: false,
        reasonCodes: ['role_checked'],
        evidenceReferenceIds: [`evidence-${request.stateRevision + 1}`],
        assessedAtLogicalMs: request.createdAtLogicalMs,
      };
    },
  };
}

function alignmentControl(scoreFor) {
  return createRoleAlignmentPortableAgentControlV1({
    controlId: 'alignment-control',
    controlVersion: 1,
    implementationId: 'alignment-control-build-1',
    policy: policy(),
    assessorBinding: {
      schemaVersion: 1,
      assessorId: 'assessor-1',
      assessorVersion: 1,
      assessorBindingDigest: `sha256:${'b'.repeat(64)}`,
    },
    assessor: assessor(scoreFor),
    assessmentTtlMs: 1_000,
  });
}

function runtime(control) {
  const registry = new PortableAgentAdapterRegistryV1().register({
    manifest: manifest(),
    adapter: {
      async step(input) {
        return {
          schemaVersion: 1,
          sessionId: input.sessionId,
          stepId: input.request.stepId,
          stepSequence: input.stepSequence,
          status: 'completed',
          outputs: [
            {
              schemaVersion: 1,
              outputId: 'output-1',
              modality: 'text',
              content: 'candidate output',
              contentReference: null,
              metadata: {},
            },
          ],
          actionProposals: [
            {
              schemaVersion: 1,
              actionId: 'action-1',
              actionClass: 'external.write',
              input: { value: 1 },
              riskClass: 'high',
              metadata: {},
            },
          ],
          checkpoint: null,
          reasonCode: null,
          metadata: {},
        };
      },
    },
  });
  return new PortableAgentSessionRuntimeV1({ registry, control });
}

async function createSession(runtimeValue) {
  await runtimeValue.createSession({
    sessionId: 'session-1',
    tenant: { tenantId: 'tenant-1' },
    agentId: 'agent-1',
    adapterId: 'adapter-1',
    adapterVersion: '1.0.0',
    requirements: {
      agentKinds: ['hybrid'],
      inputModalities: ['structured'],
      outputModalities: ['text', 'action'],
      interactionMode: 'observe_act',
      controlPoints: ['pre_step', 'post_output', 'pre_action'],
      requireCancellation: true,
    },
    role: role(),
  });
}

test('portable runtime accumulates role coherence across all release points', async () => {
  const control = alignmentControl(() => 9_000);
  const runtimeValue = runtime(control);
  await createSession(runtimeValue);
  const outcome = await runtimeValue.step('session-1', controlTarget().request);

  assert.equal(outcome.record.status, 'completed');
  const state = await control.getState('session-1');
  assert.equal(state.signalCount, 3);
  assert.equal(state.status, 'active');
  assert.equal(state.degraded, false);
  assert.deepEqual(
    state.events.map((event) => event.signal?.checkpoint),
    ['pre_step', 'post_output', 'pre_action']
  );
});

test('portable runtime withholds a proposed action while accumulated alignment is degraded', async () => {
  const control = alignmentControl((target) =>
    target.checkpoint === 'pre_step' ? 6_500 : 9_000
  );
  const runtimeValue = runtime(control);
  await createSession(runtimeValue);
  const outcome = await runtimeValue.step('session-1', controlTarget().request);

  assert.equal(outcome.record.status, 'refused');
  assert.equal(
    outcome.record.result.reasonCode,
    'action_denied_while_alignment_degraded'
  );
  assert.deepEqual(outcome.record.result.outputs, []);
  assert.deepEqual(outcome.record.result.actionProposals, []);
  const state = await control.getState('session-1');
  assert.equal(state.status, 'denied');
  assert.equal(state.events[0].decision.intervention, 'reinforce_role');
  assert.equal(state.events.at(-1).decision.intervention, 'deny');
});

test('checkpoint handoff preserves the longitudinal window and binds the target session', async () => {
  const control = alignmentControl(() => 9_000);
  assert.deepEqual(await control.evaluate(controlTarget()), {
    disposition: 'allow',
    reasonCode: 'alignment_healthy',
  });
  const checkpointTransfer = {
    schemaVersion: 1,
    contentClass: 'portable_application_state',
    tenantId: 'tenant-1',
    objectiveId: 'objective-1',
    sourceSessionId: 'session-1',
    sourceAgentId: 'agent-1',
    sourceSessionRevision: 1,
    roleBindingId: 'role-1',
    adapterId: 'adapter-1',
    adapterVersion: '1.0.0',
    implementationId: 'adapter-build-1',
    checkpoint: {
      schemaVersion: 1,
      checkpointId: 'checkpoint-1',
      sessionId: 'session-1',
      adapterId: 'adapter-1',
      adapterVersion: '1.0.0',
      implementationId: 'adapter-build-1',
      throughStepSequence: 1,
      stateReference: 'memory://checkpoint-1',
      stateDigest: `sha256:${'c'.repeat(64)}`,
      createdAt: '2026-08-05T00:00:00.000Z',
    },
    state: { cursor: 1 },
    exportedAt: '2026-08-05T00:00:00.000Z',
  };
  const handoff = await control.exportHandoff({
    sessionId: 'session-1',
    checkpointTransfer,
    logicalTimeMs: 11,
  });
  const imported = await control.importHandoff({
    handoff,
    checkpointTransfer,
    targetSessionId: 'session-2',
    targetAgentId: 'agent-2',
    targetRole: role(),
    logicalTimeMs: 12,
  });

  assert.equal(imported.sessionId, 'session-2');
  assert.equal(imported.agentId, 'agent-2');
  assert.equal(imported.signalCount, 1);
  assert.equal(imported.rollingWindow.length, 1);
  assert.equal(imported.events.at(-1).eventType, 'session_handoff');
  assert.equal(
    (await control.getState('session-2')).stateDigest,
    imported.stateDigest
  );

  const tampered = {
    ...handoff,
    checkpointTransferDigest: `sha256:${'d'.repeat(64)}`,
  };
  await assert.rejects(
    control.importHandoff({
      handoff: tampered,
      checkpointTransfer,
      targetSessionId: 'session-3',
      targetAgentId: 'agent-3',
      targetRole: role(),
      logicalTimeMs: 12,
    }),
    /handoff/u
  );
});
