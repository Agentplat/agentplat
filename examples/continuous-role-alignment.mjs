import { createRoleAlignmentPortableAgentControlV1 } from '@agentplat/inference-control/role-alignment/portable-agent';

const policy = {
  schemaVersion: 1,
  policyId: 'alignment:example',
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
};

const bindingDigest = `sha256:${'1'.repeat(64)}`;
const control = createRoleAlignmentPortableAgentControlV1({
  controlId: 'alignment:example',
  controlVersion: 1,
  implementationId: 'alignment:example:v1',
  policy,
  assessorBinding: {
    schemaVersion: 1,
    assessorId: 'assessor:example',
    assessorVersion: 1,
    assessorBindingDigest: bindingDigest,
  },
  assessmentTtlMs: 1_000,
  assessor: {
    assess(request, target) {
      const drift = target.request.stepId === 'step:drift';
      return {
        schemaVersion: 1,
        assessmentId: `assessment:${request.stateRevision + 1}`,
        assessmentRequestId: request.assessmentRequestId,
        targetDigest: request.targetDigest,
        assessorId: 'assessor:example',
        assessorVersion: 1,
        assessorBindingDigest: bindingDigest,
        coherenceBps: drift && target.checkpoint === 'pre_step' ? 6_500 : 9_000,
        uncertaintyBps: 1_000,
        contextInconsistencyBps: 500,
        hardViolation: false,
        reasonCodes: ['example_role_check'],
        evidenceReferenceIds: [`evidence:${request.stateRevision + 1}`],
        assessedAtLogicalMs: request.createdAtLogicalMs,
      };
    },
  },
});

const manifest = {
  schemaVersion: 1,
  adapterId: 'adapter:example',
  adapterVersion: '1.0.0',
  implementationId: 'adapter:example:v1',
  agentKinds: ['hybrid'],
  inputModalities: ['structured'],
  outputModalities: ['text', 'action'],
  interactionModes: ['observe_act'],
  controlPoints: ['pre_step', 'post_output', 'pre_action'],
  supportsCancellation: true,
  supportsCheckpoint: false,
  supportsRestore: false,
  maximumObservationBytes: 65_536,
  maximumOutputBytes: 65_536,
  maximumActionBytes: 65_536,
  maximumStepsPerSession: 10_000,
};

const role = {
  schemaVersion: 1,
  roleBindingId: 'role:observer:1',
  roleRevision: 1,
  predecessorRoleBindingId: null,
  objectiveId: 'objective:inspect',
  roleKey: 'evidence-observer',
  instructions: ['Inspect evidence and do not modify external state.'],
  constraints: { externalWrites: false },
  validFromLogicalMs: 0,
  validUntilLogicalMs: 100_000,
};

function target(stepId, checkpoint, logicalTimeMs) {
  return {
    schemaVersion: 1,
    checkpoint,
    manifest,
    sessionId: 'session:example',
    tenantId: 'tenant:example',
    agentId: 'agent:example',
    role,
    request: {
      schemaVersion: 1,
      stepId,
      expectedSessionRevision: 0,
      interactionMode: 'observe_act',
      observations: [],
      input: { inspect: true },
      requestedOutputModalities: ['text', 'action'],
      logicalTimeMs,
    },
    output:
      checkpoint === 'post_output'
        ? {
            schemaVersion: 1,
            outputId: `output:${stepId}`,
            modality: 'text',
            content: 'candidate output',
            contentReference: null,
            metadata: {},
          }
        : null,
    actionProposal:
      checkpoint === 'pre_action'
        ? {
            schemaVersion: 1,
            actionId: `action:${stepId}`,
            actionClass: 'external.write',
            input: { value: 1 },
            riskClass: 'high',
            metadata: {},
          }
        : null,
  };
}

const healthy = await control.evaluate(target('step:healthy', 'pre_step', 10));
const drift = await control.evaluate(target('step:drift', 'pre_step', 11));
const protectedAction = await control.evaluate(
  target('step:drift', 'pre_action', 12)
);
const state = await control.getState('session:example');

console.log(
  JSON.stringify(
    {
      healthy,
      drift,
      protectedAction,
      state: {
        status: state.status,
        signalCount: state.signalCount,
        degraded: state.degraded,
        rollingCoherenceBps: state.rollingCoherenceBps,
      },
    },
    null,
    2
  )
);
