import type { JsonValue } from '@agentplat/core';

import { canonicalizeControlJsonV1, utf8ByteLength } from './canonical.js';
import { sha256Hex } from './sha256.js';
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertOneOf,
  assertSafeInteger,
  assertStrictJsonValue,
  assertString,
  deepFreeze,
  sortedUnique,
} from './validation.js';

export const ROLE_ALIGNMENT_SCHEMA_VERSION_V1 = 1 as const;
export const ROLE_ALIGNMENT_BASIS_POINTS_V1 = 10_000 as const;

export type RoleAlignmentCheckpointV1 =
  'pre_step' | 'post_output' | 'pre_action';

export type RoleAlignmentInterventionV1 =
  | 'continue'
  | 'reinforce_role'
  | 'challenge_context'
  | 'pause'
  | 'request_realign'
  | 'deny';

export type RoleAlignmentStateStatusV1 =
  'active' | 'paused' | 'realignment_required' | 'denied' | 'closed';

export interface RoleAlignmentThresholdsV1 {
  readonly healthyCoherenceBps: number;
  readonly reinforceCoherenceBelowBps: number;
  readonly pauseCoherenceAtOrBelowBps: number;
  readonly denyCoherenceAtOrBelowBps: number;
  readonly challengeContextAtOrAboveBps: number;
  readonly maximumUncertaintyBps: number;
}

export interface RoleAlignmentBudgetsV1 {
  readonly maximumReinforcements: number;
  readonly maximumContextChallenges: number;
  readonly maximumPauses: number;
}

export interface RoleAlignmentLimitsV1 {
  readonly rollingWindowSignals: number;
  readonly maximumSignals: number;
  readonly maximumRetainedEvents: number;
  readonly maximumReasonCodesPerSignal: number;
  readonly maximumEvidenceReferencesPerSignal: number;
  readonly maximumAssessmentTtlMs: number;
  readonly maximumStateBytes: number;
}

export interface RoleAlignmentPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly parentPolicyDigest: string | null;
  readonly thresholds: RoleAlignmentThresholdsV1;
  readonly consecutiveBreachLimit: number;
  readonly recoverySignalsRequired: number;
  readonly reinforcementCooldownSignals: number;
  readonly denyActionsWhileDegraded: boolean;
  readonly budgets: RoleAlignmentBudgetsV1;
  readonly limits: RoleAlignmentLimitsV1;
}

export interface RoleAlignmentPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: RoleAlignmentPolicyV1;
  readonly policyDigest: string;
}

/**
 * Content-free binding to one concrete role revision. Instructions and
 * constraints remain in the owning runtime and are represented only by a
 * digest at this boundary.
 */
export interface RoleAlignmentRoleAnchorV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly objectiveId: string;
  readonly roleBindingId: string;
  readonly roleRevision: number;
  readonly predecessorRoleBindingId: string | null;
  readonly roleKey: string;
  readonly roleContentDigest: string;
  readonly anchorDigest: string;
}

export interface RoleAlignmentSignalV1 {
  readonly schemaVersion: 1;
  readonly signalId: string;
  readonly assessmentRequestId: string;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly stepId: string;
  readonly checkpoint: RoleAlignmentCheckpointV1;
  readonly roleAnchorDigest: string;
  readonly roleRevision: number;
  readonly targetDigest: string;
  readonly coherenceBps: number;
  readonly uncertaintyBps: number;
  readonly contextInconsistencyBps: number;
  readonly hardViolation: boolean;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface RoleAlignmentDecisionV1 {
  readonly schemaVersion: 1;
  readonly disposition: 'allow' | 'deny' | 'abstain' | 'escalate';
  readonly intervention: RoleAlignmentInterventionV1;
  readonly reasonCode: string;
  readonly effectiveCoherenceBps: number;
  readonly degraded: boolean;
  readonly stateStatus: RoleAlignmentStateStatusV1;
}

export interface RoleAlignmentWindowEntryV1 {
  readonly schemaVersion: 1;
  readonly signalId: string;
  readonly stepId: string;
  readonly checkpoint: RoleAlignmentCheckpointV1;
  readonly coherenceBps: number;
  readonly uncertaintyBps: number;
  readonly contextInconsistencyBps: number;
  readonly hardViolation: boolean;
  readonly observedAtLogicalMs: number;
}

export type RoleAlignmentEventTypeV1 =
  | 'signal_evaluated'
  | 'role_replaced'
  | 'session_handoff'
  | 'resumed'
  | 'closed';

/** Content-free causal record. It never stores prompts, outputs or actions. */
export interface RoleAlignmentEventV1 {
  readonly schemaVersion: 1;
  readonly eventSequence: number;
  readonly eventType: RoleAlignmentEventTypeV1;
  readonly inputDigest: string;
  readonly roleAnchorDigest: string;
  readonly signal: RoleAlignmentSignalV1 | null;
  readonly decision: RoleAlignmentDecisionV1 | null;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
  readonly previousEventDigest: string | null;
  readonly eventDigest: string;
}

export interface RoleAlignmentInterventionCountsV1 {
  readonly reinforcements: number;
  readonly contextChallenges: number;
  readonly pauses: number;
}

export interface RoleAlignmentStateV1 {
  readonly schemaVersion: 1;
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly objectiveId: string;
  readonly roleAnchor: RoleAlignmentRoleAnchorV1;
  readonly status: RoleAlignmentStateStatusV1;
  readonly revision: number;
  readonly signalCount: number;
  readonly degraded: boolean;
  readonly consecutiveBreaches: number;
  readonly recoveryStreak: number;
  readonly interventionCounts: RoleAlignmentInterventionCountsV1;
  readonly lastInterventionEventSequence: number | null;
  readonly rollingWindow: readonly RoleAlignmentWindowEntryV1[];
  readonly rollingCoherenceBps: number | null;
  readonly lastLogicalTimeMs: number;
  readonly lastEventDigest: string | null;
  readonly events: readonly RoleAlignmentEventV1[];
  readonly stateDigest: string;
}

export interface CreateRoleAlignmentStateInputV1 {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policy: RoleAlignmentPolicyV1;
  readonly roleAnchor: RoleAlignmentRoleAnchorV1;
  readonly createdAtLogicalMs: number;
}

export interface ObserveRoleAlignmentSignalInputV1 {
  readonly expectedRevision: number;
  readonly signal: RoleAlignmentSignalV1;
}

export interface RoleAlignmentReductionResultV1 {
  readonly state: RoleAlignmentStateV1;
  readonly decision: RoleAlignmentDecisionV1;
  readonly event: RoleAlignmentEventV1;
}

export interface ReplaceRoleAlignmentRoleInputV1 {
  readonly expectedRevision: number;
  readonly roleAnchor: RoleAlignmentRoleAnchorV1;
  readonly logicalTimeMs: number;
}

export interface RestoreRoleAlignmentRoleInputV1 {
  readonly expectedRevision: number;
  readonly roleAnchor: RoleAlignmentRoleAnchorV1;
  readonly authorizationDigest: string;
  readonly logicalTimeMs: number;
}

export interface RebindRoleAlignmentSessionInputV1 {
  readonly expectedRevision: number;
  readonly targetRoleAnchor: RoleAlignmentRoleAnchorV1;
  readonly transferDigest: string;
  readonly logicalTimeMs: number;
}

const encoder = new TextEncoder();
const checkpoints: readonly RoleAlignmentCheckpointV1[] = [
  'pre_step',
  'post_output',
  'pre_action',
];
const interventions: readonly RoleAlignmentInterventionV1[] = [
  'continue',
  'reinforce_role',
  'challenge_context',
  'pause',
  'request_realign',
  'deny',
];
const statuses: readonly RoleAlignmentStateStatusV1[] = [
  'active',
  'paused',
  'realignment_required',
  'denied',
  'closed',
];

export function digestRoleAlignmentJsonV1(
  domain:
    | 'policy'
    | 'role_anchor'
    | 'signal'
    | 'target'
    | 'event'
    | 'state'
    | 'handoff',
  value: JsonValue
): string {
  const canonical = canonicalizeControlJsonV1(value);
  return `sha256:${sha256Hex(
    encoder.encode(
      `agentplat.inference-control/role-alignment/${domain}/v1\0${canonical}`
    )
  )}`;
}

export function createRoleAlignmentPolicyRecordV1(
  input: RoleAlignmentPolicyV1
): RoleAlignmentPolicyRecordV1 {
  const policy = validateRoleAlignmentPolicyV1(input);
  return deepFreeze({
    schemaVersion: 1 as const,
    policy,
    policyDigest: digestRoleAlignmentJsonV1(
      'policy',
      policy as unknown as JsonValue
    ),
  });
}

export function validateRoleAlignmentPolicyV1(
  input: RoleAlignmentPolicyV1
): RoleAlignmentPolicyV1 {
  assertExactKeys(
    input,
    [
      'schemaVersion',
      'policyId',
      'policyVersion',
      'parentPolicyDigest',
      'thresholds',
      'consecutiveBreachLimit',
      'recoverySignalsRequired',
      'reinforcementCooldownSignals',
      'denyActionsWhileDegraded',
      'budgets',
      'limits',
    ],
    'role alignment policy'
  );
  if (input.schemaVersion !== 1)
    throw new TypeError('role_alignment_policy_invalid');
  assertIdentifier(input.policyId, 'policyId');
  assertSafeInteger(input.policyVersion, 'policyVersion', 1);
  if (input.parentPolicyDigest !== null)
    assertDigest(input.parentPolicyDigest, 'parentPolicyDigest');
  if (typeof input.denyActionsWhileDegraded !== 'boolean')
    throw new TypeError('role_alignment_policy_invalid');
  assertSafeInteger(input.consecutiveBreachLimit, 'consecutiveBreachLimit', 1);
  assertSafeInteger(
    input.recoverySignalsRequired,
    'recoverySignalsRequired',
    1
  );
  assertSafeInteger(
    input.reinforcementCooldownSignals,
    'reinforcementCooldownSignals'
  );
  validateThresholds(input.thresholds);
  validateBudgets(input.budgets);
  validateLimits(input.limits);
  return cloneJson(input);
}

export function createRoleAlignmentRoleAnchorV1(input: {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly objectiveId: string;
  readonly roleBindingId: string;
  readonly roleRevision: number;
  readonly predecessorRoleBindingId: string | null;
  readonly roleKey: string;
  readonly roleContent: JsonValue;
}): RoleAlignmentRoleAnchorV1 {
  for (const [label, value] of [
    ['tenantId', input.tenantId],
    ['sessionId', input.sessionId],
    ['agentId', input.agentId],
    ['objectiveId', input.objectiveId],
    ['roleBindingId', input.roleBindingId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.roleRevision, 'roleRevision', 1);
  if (input.predecessorRoleBindingId !== null)
    assertIdentifier(
      input.predecessorRoleBindingId,
      'predecessorRoleBindingId'
    );
  assertString(input.roleKey, 'roleKey');
  assertStrictJsonValue(input.roleContent);
  const roleContentDigest = digestRoleAlignmentJsonV1(
    'role_anchor',
    input.roleContent
  );
  const withoutDigest = {
    schemaVersion: 1 as const,
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    agentId: input.agentId,
    objectiveId: input.objectiveId,
    roleBindingId: input.roleBindingId,
    roleRevision: input.roleRevision,
    predecessorRoleBindingId: input.predecessorRoleBindingId,
    roleKey: input.roleKey,
    roleContentDigest,
  };
  return deepFreeze({
    ...withoutDigest,
    anchorDigest: digestRoleAlignmentJsonV1(
      'role_anchor',
      withoutDigest as unknown as JsonValue
    ),
  });
}

export function validateRoleAlignmentRoleAnchorV1(
  input: RoleAlignmentRoleAnchorV1
): RoleAlignmentRoleAnchorV1 {
  assertExactKeys(
    input,
    [
      'schemaVersion',
      'tenantId',
      'sessionId',
      'agentId',
      'objectiveId',
      'roleBindingId',
      'roleRevision',
      'predecessorRoleBindingId',
      'roleKey',
      'roleContentDigest',
      'anchorDigest',
    ],
    'role alignment anchor'
  );
  if (input.schemaVersion !== 1)
    throw new TypeError('role_alignment_anchor_invalid');
  for (const [label, value] of [
    ['tenantId', input.tenantId],
    ['sessionId', input.sessionId],
    ['agentId', input.agentId],
    ['objectiveId', input.objectiveId],
    ['roleBindingId', input.roleBindingId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.roleRevision, 'roleRevision', 1);
  if (input.predecessorRoleBindingId !== null)
    assertIdentifier(
      input.predecessorRoleBindingId,
      'predecessorRoleBindingId'
    );
  assertString(input.roleKey, 'roleKey');
  assertDigest(input.roleContentDigest, 'roleContentDigest');
  assertDigest(input.anchorDigest, 'anchorDigest');
  const { anchorDigest: _ignored, ...withoutDigest } = input;
  if (
    digestRoleAlignmentJsonV1(
      'role_anchor',
      withoutDigest as unknown as JsonValue
    ) !== input.anchorDigest
  )
    throw new TypeError('role_alignment_anchor_invalid');
  return cloneJson(input);
}

export function createRoleAlignmentStateV1(
  input: CreateRoleAlignmentStateInputV1
): RoleAlignmentStateV1 {
  assertIdentifier(input.controllerId, 'controllerId');
  assertSafeInteger(input.controllerVersion, 'controllerVersion', 1);
  assertIdentifier(input.implementationId, 'implementationId');
  assertSafeInteger(input.createdAtLogicalMs, 'createdAtLogicalMs');
  const policyRecord = createRoleAlignmentPolicyRecordV1(input.policy);
  const roleAnchor = validateRoleAlignmentRoleAnchorV1(input.roleAnchor);
  const state = withStateDigest({
    schemaVersion: 1,
    controllerId: input.controllerId,
    controllerVersion: input.controllerVersion,
    implementationId: input.implementationId,
    policyId: policyRecord.policy.policyId,
    policyVersion: policyRecord.policy.policyVersion,
    policyDigest: policyRecord.policyDigest,
    tenantId: roleAnchor.tenantId,
    sessionId: roleAnchor.sessionId,
    agentId: roleAnchor.agentId,
    objectiveId: roleAnchor.objectiveId,
    roleAnchor,
    status: 'active',
    revision: 0,
    signalCount: 0,
    degraded: false,
    consecutiveBreaches: 0,
    recoveryStreak: 0,
    interventionCounts: {
      reinforcements: 0,
      contextChallenges: 0,
      pauses: 0,
    },
    lastInterventionEventSequence: null,
    rollingWindow: [],
    rollingCoherenceBps: null,
    lastLogicalTimeMs: input.createdAtLogicalMs,
    lastEventDigest: null,
    events: [],
  });
  ensureStateCapacity(state, policyRecord.policy);
  return state;
}

export function observeRoleAlignmentSignalV1(
  stateInput: RoleAlignmentStateV1,
  input: ObserveRoleAlignmentSignalInputV1,
  policyInput: RoleAlignmentPolicyV1
): RoleAlignmentReductionResultV1 {
  const policy = assertRoleAlignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireExpectedRevision(state, input.expectedRevision);
  if (state.status !== 'active')
    throw new TypeError(`role_alignment_${state.status}`);
  const signal = validateSignal(input.signal, state, policy);
  if (state.signalCount >= policy.limits.maximumSignals)
    throw new TypeError('role_alignment_capacity_exhausted');

  const windowEntry: RoleAlignmentWindowEntryV1 = deepFreeze({
    schemaVersion: 1,
    signalId: signal.signalId,
    stepId: signal.stepId,
    checkpoint: signal.checkpoint,
    coherenceBps: signal.coherenceBps,
    uncertaintyBps: signal.uncertaintyBps,
    contextInconsistencyBps: signal.contextInconsistencyBps,
    hardViolation: signal.hardViolation,
    observedAtLogicalMs: signal.observedAtLogicalMs,
  });
  const rollingWindow = [...state.rollingWindow, windowEntry].slice(
    -policy.limits.rollingWindowSignals
  );
  const rollingCoherenceBps = average(
    rollingWindow.map(({ coherenceBps }) => coherenceBps)
  );
  const healthyNow = isHealthy(signal, policy);
  const consecutiveBreaches = healthyNow ? 0 : state.consecutiveBreaches + 1;
  const recoveryStreak = healthyNow
    ? state.degraded
      ? state.recoveryStreak + 1
      : 0
    : 0;
  const degraded = healthyNow
    ? state.degraded && recoveryStreak < policy.recoverySignalsRequired
    : true;
  const effectiveCoherenceBps = Math.min(
    signal.coherenceBps,
    rollingCoherenceBps
  );
  const provisional = chooseIntervention({
    state,
    signal,
    policy,
    degraded,
    consecutiveBreaches,
    effectiveCoherenceBps,
  });
  const decision = makeDecision(
    provisional.intervention,
    provisional.reasonCode,
    effectiveCoherenceBps,
    degraded
  );
  const event = createEvent({
    state,
    eventType: 'signal_evaluated',
    inputDigest: signal.targetDigest,
    roleAnchorDigest: state.roleAnchor.anchorDigest,
    signal,
    decision,
    reasonCode: decision.reasonCode,
    logicalTimeMs: signal.observedAtLogicalMs,
  });
  const interventionCounts = countIntervention(
    state.interventionCounts,
    decision.intervention
  );
  const nextState = withStateDigest({
    ...withoutStateDigest(state),
    status: decision.stateStatus,
    revision: state.revision + 1,
    signalCount: state.signalCount + 1,
    degraded,
    consecutiveBreaches,
    recoveryStreak,
    interventionCounts,
    lastInterventionEventSequence:
      decision.intervention === 'continue'
        ? state.lastInterventionEventSequence
        : event.eventSequence,
    rollingWindow,
    rollingCoherenceBps,
    lastLogicalTimeMs: signal.observedAtLogicalMs,
    lastEventDigest: event.eventDigest,
    events: retainEvents(state.events, event, policy),
  });
  ensureStateCapacity(nextState, policy);
  return deepFreeze({ state: nextState, decision, event });
}

export function replaceRoleAlignmentRoleV1(
  stateInput: RoleAlignmentStateV1,
  input: ReplaceRoleAlignmentRoleInputV1,
  policyInput: RoleAlignmentPolicyV1
): RoleAlignmentStateV1 {
  const policy = assertRoleAlignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireExpectedRevision(state, input.expectedRevision);
  if (state.status === 'closed') throw new TypeError('role_alignment_closed');
  assertSafeInteger(input.logicalTimeMs, 'logicalTimeMs');
  if (input.logicalTimeMs < state.lastLogicalTimeMs)
    throw new TypeError('role_alignment_clock_rollback');
  const anchor = validateRoleAlignmentRoleAnchorV1(input.roleAnchor);
  if (
    anchor.tenantId !== state.tenantId ||
    anchor.sessionId !== state.sessionId ||
    anchor.agentId !== state.agentId ||
    anchor.objectiveId !== state.objectiveId ||
    anchor.roleRevision !== state.roleAnchor.roleRevision + 1 ||
    anchor.predecessorRoleBindingId !== state.roleAnchor.roleBindingId ||
    anchor.anchorDigest === state.roleAnchor.anchorDigest
  )
    throw new TypeError('role_alignment_role_transition_invalid');
  const event = createEvent({
    state,
    eventType: 'role_replaced',
    inputDigest: anchor.anchorDigest,
    roleAnchorDigest: anchor.anchorDigest,
    signal: null,
    decision: null,
    reasonCode: 'role_replaced',
    logicalTimeMs: input.logicalTimeMs,
  });
  const next = withStateDigest({
    ...withoutStateDigest(state),
    roleAnchor: anchor,
    status: 'active',
    revision: state.revision + 1,
    degraded: false,
    consecutiveBreaches: 0,
    recoveryStreak: 0,
    interventionCounts: {
      reinforcements: 0,
      contextChallenges: 0,
      pauses: 0,
    },
    lastInterventionEventSequence: null,
    rollingWindow: [],
    rollingCoherenceBps: null,
    lastLogicalTimeMs: input.logicalTimeMs,
    lastEventDigest: event.eventDigest,
    events: retainEvents(state.events, event, policy),
  });
  ensureStateCapacity(next, policy);
  return next;
}

/** Restores only the exact predecessor of the active role under certification. */
export function restoreRoleAlignmentRoleV1(
  stateInput: RoleAlignmentStateV1,
  input: RestoreRoleAlignmentRoleInputV1,
  policyInput: RoleAlignmentPolicyV1
): RoleAlignmentStateV1 {
  const policy = assertRoleAlignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireExpectedRevision(state, input.expectedRevision);
  if (state.status === 'closed') throw new TypeError('role_alignment_closed');
  assertSafeInteger(input.logicalTimeMs, 'logicalTimeMs');
  assertDigest(input.authorizationDigest, 'authorizationDigest');
  if (input.logicalTimeMs < state.lastLogicalTimeMs)
    throw new TypeError('role_alignment_clock_rollback');
  const anchor = validateRoleAlignmentRoleAnchorV1(input.roleAnchor);
  if (
    anchor.tenantId !== state.tenantId ||
    anchor.sessionId !== state.sessionId ||
    anchor.agentId !== state.agentId ||
    anchor.objectiveId !== state.objectiveId ||
    anchor.roleRevision + 1 !== state.roleAnchor.roleRevision ||
    state.roleAnchor.predecessorRoleBindingId !== anchor.roleBindingId ||
    anchor.anchorDigest === state.roleAnchor.anchorDigest
  )
    throw new TypeError('role_alignment_role_restoration_invalid');
  const event = createEvent({
    state,
    eventType: 'role_replaced',
    inputDigest: input.authorizationDigest,
    roleAnchorDigest: anchor.anchorDigest,
    signal: null,
    decision: null,
    reasonCode: 'role_restored_under_certification',
    logicalTimeMs: input.logicalTimeMs,
  });
  const next = withStateDigest({
    ...withoutStateDigest(state),
    roleAnchor: anchor,
    status: 'active',
    revision: state.revision + 1,
    degraded: false,
    consecutiveBreaches: 0,
    recoveryStreak: 0,
    interventionCounts: {
      reinforcements: 0,
      contextChallenges: 0,
      pauses: 0,
    },
    lastInterventionEventSequence: null,
    rollingWindow: [],
    rollingCoherenceBps: null,
    lastLogicalTimeMs: input.logicalTimeMs,
    lastEventDigest: event.eventDigest,
    events: retainEvents(state.events, event, policy),
  });
  ensureStateCapacity(next, policy);
  return next;
}

export function resumeRoleAlignmentStateV1(
  stateInput: RoleAlignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
    readonly reasonCode: string;
  },
  policyInput: RoleAlignmentPolicyV1
): RoleAlignmentStateV1 {
  const policy = assertRoleAlignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireExpectedRevision(state, input.expectedRevision);
  if (state.status !== 'paused')
    throw new TypeError('role_alignment_not_paused');
  assertSafeInteger(input.logicalTimeMs, 'logicalTimeMs');
  assertIdentifier(input.reasonCode, 'reasonCode');
  if (input.logicalTimeMs < state.lastLogicalTimeMs)
    throw new TypeError('role_alignment_clock_rollback');
  const event = createEvent({
    state,
    eventType: 'resumed',
    inputDigest: digestRoleAlignmentJsonV1('event', {
      expectedRevision: input.expectedRevision,
      reasonCode: input.reasonCode,
    }),
    roleAnchorDigest: state.roleAnchor.anchorDigest,
    signal: null,
    decision: null,
    reasonCode: input.reasonCode,
    logicalTimeMs: input.logicalTimeMs,
  });
  const next = withStateDigest({
    ...withoutStateDigest(state),
    status: 'active',
    revision: state.revision + 1,
    lastLogicalTimeMs: input.logicalTimeMs,
    lastEventDigest: event.eventDigest,
    events: retainEvents(state.events, event, policy),
  });
  ensureStateCapacity(next, policy);
  return next;
}

export function closeRoleAlignmentStateV1(
  stateInput: RoleAlignmentStateV1,
  input: {
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
    readonly reasonCode: string;
  },
  policyInput: RoleAlignmentPolicyV1
): RoleAlignmentStateV1 {
  const policy = assertRoleAlignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireExpectedRevision(state, input.expectedRevision);
  if (state.status === 'closed') return state;
  assertSafeInteger(input.logicalTimeMs, 'logicalTimeMs');
  assertIdentifier(input.reasonCode, 'reasonCode');
  if (input.logicalTimeMs < state.lastLogicalTimeMs)
    throw new TypeError('role_alignment_clock_rollback');
  const event = createEvent({
    state,
    eventType: 'closed',
    inputDigest: digestRoleAlignmentJsonV1('event', {
      reasonCode: input.reasonCode,
    }),
    roleAnchorDigest: state.roleAnchor.anchorDigest,
    signal: null,
    decision: null,
    reasonCode: input.reasonCode,
    logicalTimeMs: input.logicalTimeMs,
  });
  const next = withStateDigest({
    ...withoutStateDigest(state),
    status: 'closed',
    revision: state.revision + 1,
    lastLogicalTimeMs: input.logicalTimeMs,
    lastEventDigest: event.eventDigest,
    events: retainEvents(state.events, event, policy),
  });
  ensureStateCapacity(next, policy);
  return next;
}

/**
 * Rebinds a verified source state to a new portable session while preserving
 * its causal record and rolling coherence window.
 */
export function rebindRoleAlignmentSessionV1(
  stateInput: RoleAlignmentStateV1,
  input: RebindRoleAlignmentSessionInputV1,
  policyInput: RoleAlignmentPolicyV1
): RoleAlignmentStateV1 {
  const policy = assertRoleAlignmentStateV1(stateInput, policyInput);
  const state = stateInput;
  requireExpectedRevision(state, input.expectedRevision);
  if (state.status === 'closed') throw new TypeError('role_alignment_closed');
  assertSafeInteger(input.logicalTimeMs, 'logicalTimeMs');
  assertDigest(input.transferDigest, 'transferDigest');
  if (input.logicalTimeMs < state.lastLogicalTimeMs)
    throw new TypeError('role_alignment_clock_rollback');
  const anchor = validateRoleAlignmentRoleAnchorV1(input.targetRoleAnchor);
  if (
    anchor.tenantId !== state.tenantId ||
    anchor.objectiveId !== state.objectiveId ||
    anchor.sessionId === state.sessionId
  )
    throw new TypeError('role_alignment_handoff_invalid');
  const reboundBase: RoleAlignmentStateV1 = {
    ...state,
    sessionId: anchor.sessionId,
    agentId: anchor.agentId,
    roleAnchor: anchor,
  };
  const event = createEvent({
    state: reboundBase,
    eventType: 'session_handoff',
    inputDigest: input.transferDigest,
    roleAnchorDigest: anchor.anchorDigest,
    signal: null,
    decision: null,
    reasonCode: 'session_handoff_imported',
    logicalTimeMs: input.logicalTimeMs,
  });
  const next = withStateDigest({
    ...withoutStateDigest(reboundBase),
    revision: state.revision + 1,
    lastLogicalTimeMs: input.logicalTimeMs,
    lastEventDigest: event.eventDigest,
    events: retainEvents(state.events, event, policy),
  });
  ensureStateCapacity(next, policy);
  return next;
}

export function assertRoleAlignmentStateV1(
  input: RoleAlignmentStateV1,
  policyInput: RoleAlignmentPolicyV1,
  binding: {
    readonly controllerId?: string;
    readonly controllerVersion?: number;
    readonly implementationId?: string;
    readonly sessionId?: string;
  } = {}
): RoleAlignmentPolicyV1 {
  const policyRecord = createRoleAlignmentPolicyRecordV1(policyInput);
  assertExactKeys(
    input,
    [
      'schemaVersion',
      'controllerId',
      'controllerVersion',
      'implementationId',
      'policyId',
      'policyVersion',
      'policyDigest',
      'tenantId',
      'sessionId',
      'agentId',
      'objectiveId',
      'roleAnchor',
      'status',
      'revision',
      'signalCount',
      'degraded',
      'consecutiveBreaches',
      'recoveryStreak',
      'interventionCounts',
      'lastInterventionEventSequence',
      'rollingWindow',
      'rollingCoherenceBps',
      'lastLogicalTimeMs',
      'lastEventDigest',
      'events',
      'stateDigest',
    ],
    'role alignment state'
  );
  if (input.schemaVersion !== 1)
    throw new TypeError('role_alignment_state_invalid');
  for (const [label, value] of [
    ['controllerId', input.controllerId],
    ['implementationId', input.implementationId],
    ['policyId', input.policyId],
    ['tenantId', input.tenantId],
    ['sessionId', input.sessionId],
    ['agentId', input.agentId],
    ['objectiveId', input.objectiveId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.controllerVersion, 'controllerVersion', 1);
  assertSafeInteger(input.policyVersion, 'policyVersion', 1);
  assertDigest(input.policyDigest, 'policyDigest');
  assertDigest(input.stateDigest, 'stateDigest');
  assertOneOf(input.status, statuses, 'status');
  for (const [label, value] of [
    ['revision', input.revision],
    ['signalCount', input.signalCount],
    ['consecutiveBreaches', input.consecutiveBreaches],
    ['recoveryStreak', input.recoveryStreak],
    ['lastLogicalTimeMs', input.lastLogicalTimeMs],
  ] as const)
    assertSafeInteger(value, label);
  if (typeof input.degraded !== 'boolean')
    throw new TypeError('role_alignment_state_invalid');
  if (
    input.policyId !== policyRecord.policy.policyId ||
    input.policyVersion !== policyRecord.policy.policyVersion ||
    input.policyDigest !== policyRecord.policyDigest ||
    (binding.controllerId !== undefined &&
      input.controllerId !== binding.controllerId) ||
    (binding.controllerVersion !== undefined &&
      input.controllerVersion !== binding.controllerVersion) ||
    (binding.implementationId !== undefined &&
      input.implementationId !== binding.implementationId) ||
    (binding.sessionId !== undefined && input.sessionId !== binding.sessionId)
  )
    throw new TypeError('role_alignment_state_binding_mismatch');
  const anchor = validateRoleAlignmentRoleAnchorV1(input.roleAnchor);
  if (
    anchor.tenantId !== input.tenantId ||
    anchor.sessionId !== input.sessionId ||
    anchor.agentId !== input.agentId ||
    anchor.objectiveId !== input.objectiveId
  )
    throw new TypeError('role_alignment_state_binding_mismatch');
  validateInterventionCounts(input.interventionCounts);
  if (input.lastInterventionEventSequence !== null)
    assertSafeInteger(
      input.lastInterventionEventSequence,
      'lastInterventionEventSequence',
      1
    );
  if (!Array.isArray(input.rollingWindow) || !Array.isArray(input.events))
    throw new TypeError('role_alignment_state_invalid');
  if (
    input.rollingWindow.length >
      policyRecord.policy.limits.rollingWindowSignals ||
    input.signalCount > policyRecord.policy.limits.maximumSignals ||
    input.events.length > policyRecord.policy.limits.maximumRetainedEvents
  )
    throw new TypeError('role_alignment_capacity_exhausted');
  if (
    input.revision < input.events.length ||
    (input.revision === 0) !== (input.events.length === 0) ||
    (input.lastInterventionEventSequence !== null &&
      input.lastInterventionEventSequence > input.revision)
  )
    throw new TypeError('role_alignment_state_invalid');
  for (const entry of input.rollingWindow) validateWindowEntry(entry);
  const firstRetainedEventSequence = input.revision - input.events.length + 1;
  const completeHistory = firstRetainedEventSequence === 1;
  let previousEventDigest: string | null = completeHistory
    ? null
    : (input.events[0]?.previousEventDigest ?? null);
  if (!completeHistory && previousEventDigest === null)
    throw new TypeError('role_alignment_event_chain_invalid');
  let previousLogicalTimeMs = -1;
  let signals = 0;
  let replayStatus: RoleAlignmentStateStatusV1 = 'active';
  let replayDegraded = false;
  let replayConsecutiveBreaches = 0;
  let replayRecoveryStreak = 0;
  let replayCounts: RoleAlignmentInterventionCountsV1 = {
    reinforcements: 0,
    contextChallenges: 0,
    pauses: 0,
  };
  let replayLastIntervention: number | null = null;
  let replayWindow: RoleAlignmentWindowEntryV1[] = [];
  let replayAnchorDigest: string | null = null;
  for (let index = 0; index < input.events.length; index += 1) {
    const event = validateEvent(input.events[index], policyRecord.policy);
    if (
      event.eventSequence !== firstRetainedEventSequence + index ||
      event.previousEventDigest !== previousEventDigest ||
      event.logicalTimeMs < previousLogicalTimeMs
    )
      throw new TypeError('role_alignment_event_chain_invalid');
    previousEventDigest = event.eventDigest;
    previousLogicalTimeMs = event.logicalTimeMs;
    if (event.signal !== null) signals += 1;
    if (!completeHistory) continue;
    if (event.eventType === 'signal_evaluated') {
      if (
        replayStatus !== 'active' ||
        event.signal === null ||
        event.decision === null
      )
        throw new TypeError('role_alignment_event_chain_invalid');
      if (
        replayAnchorDigest !== null &&
        event.roleAnchorDigest !== replayAnchorDigest
      )
        throw new TypeError('role_alignment_event_chain_invalid');
      replayAnchorDigest = event.roleAnchorDigest;
      const windowEntry: RoleAlignmentWindowEntryV1 = {
        schemaVersion: 1,
        signalId: event.signal.signalId,
        stepId: event.signal.stepId,
        checkpoint: event.signal.checkpoint,
        coherenceBps: event.signal.coherenceBps,
        uncertaintyBps: event.signal.uncertaintyBps,
        contextInconsistencyBps: event.signal.contextInconsistencyBps,
        hardViolation: event.signal.hardViolation,
        observedAtLogicalMs: event.signal.observedAtLogicalMs,
      };
      replayWindow = [...replayWindow, windowEntry].slice(
        -policyRecord.policy.limits.rollingWindowSignals
      );
      const healthyNow = isHealthy(event.signal, policyRecord.policy);
      replayConsecutiveBreaches = healthyNow
        ? 0
        : replayConsecutiveBreaches + 1;
      replayRecoveryStreak = healthyNow
        ? replayDegraded
          ? replayRecoveryStreak + 1
          : 0
        : 0;
      replayDegraded = healthyNow
        ? replayDegraded &&
          replayRecoveryStreak < policyRecord.policy.recoverySignalsRequired
        : true;
      const effectiveCoherenceBps = Math.min(
        event.signal.coherenceBps,
        average(replayWindow.map(({ coherenceBps }) => coherenceBps))
      );
      const replayState: RoleAlignmentStateV1 = {
        ...input,
        revision: event.eventSequence - 1,
        status: replayStatus,
        degraded: replayDegraded,
        consecutiveBreaches: replayConsecutiveBreaches,
        recoveryStreak: replayRecoveryStreak,
        interventionCounts: replayCounts,
        lastInterventionEventSequence: replayLastIntervention,
        events: input.events.slice(0, index),
      };
      const expectedIntervention = chooseIntervention({
        state: replayState,
        signal: event.signal,
        policy: policyRecord.policy,
        degraded: replayDegraded,
        consecutiveBreaches: replayConsecutiveBreaches,
        effectiveCoherenceBps,
      });
      const expectedDecision = makeDecision(
        expectedIntervention.intervention,
        expectedIntervention.reasonCode,
        effectiveCoherenceBps,
        replayDegraded
      );
      if (
        canonicalizeControlJsonV1(event.decision as unknown as JsonValue) !==
        canonicalizeControlJsonV1(expectedDecision as unknown as JsonValue)
      )
        throw new TypeError('role_alignment_decision_invalid');
      replayStatus = event.decision.stateStatus;
      replayCounts = countIntervention(
        replayCounts,
        event.decision.intervention
      );
      if (event.decision.intervention !== 'continue')
        replayLastIntervention = event.eventSequence;
    } else if (event.eventType === 'role_replaced') {
      if (
        replayStatus === 'closed' ||
        (replayAnchorDigest !== null &&
          event.roleAnchorDigest === replayAnchorDigest)
      )
        throw new TypeError('role_alignment_event_chain_invalid');
      replayAnchorDigest = event.roleAnchorDigest;
      replayStatus = 'active';
      replayDegraded = false;
      replayConsecutiveBreaches = 0;
      replayRecoveryStreak = 0;
      replayCounts = {
        reinforcements: 0,
        contextChallenges: 0,
        pauses: 0,
      };
      replayLastIntervention = null;
      replayWindow = [];
    } else if (event.eventType === 'resumed') {
      if (replayStatus !== 'paused')
        throw new TypeError('role_alignment_event_chain_invalid');
      replayStatus = 'active';
    } else if (event.eventType === 'closed') {
      if (replayStatus === 'closed')
        throw new TypeError('role_alignment_event_chain_invalid');
      replayStatus = 'closed';
    } else {
      if (replayStatus === 'closed')
        throw new TypeError('role_alignment_event_chain_invalid');
      replayAnchorDigest = event.roleAnchorDigest;
    }
  }
  const expectedRolling = replayWindow.length
    ? average(replayWindow.map(({ coherenceBps }) => coherenceBps))
    : null;
  if (
    input.lastEventDigest !== previousEventDigest ||
    signals > input.signalCount ||
    (input.events.length > 0 &&
      (input.lastLogicalTimeMs !==
        input.events[input.events.length - 1].logicalTimeMs ||
        input.roleAnchor.anchorDigest !==
          input.events[input.events.length - 1].roleAnchorDigest))
  )
    throw new TypeError('role_alignment_state_invalid');
  if (
    completeHistory &&
    (signals !== input.signalCount ||
      input.status !== replayStatus ||
      input.degraded !== replayDegraded ||
      input.consecutiveBreaches !== replayConsecutiveBreaches ||
      input.recoveryStreak !== replayRecoveryStreak ||
      input.interventionCounts.reinforcements !== replayCounts.reinforcements ||
      input.interventionCounts.contextChallenges !==
        replayCounts.contextChallenges ||
      input.interventionCounts.pauses !== replayCounts.pauses ||
      input.lastInterventionEventSequence !== replayLastIntervention ||
      input.rollingCoherenceBps !== expectedRolling ||
      canonicalizeControlJsonV1(input.rollingWindow as unknown as JsonValue) !==
        canonicalizeControlJsonV1(replayWindow as unknown as JsonValue) ||
      (replayAnchorDigest !== null &&
        input.roleAnchor.anchorDigest !== replayAnchorDigest))
  )
    throw new TypeError('role_alignment_state_invalid');
  const expectedStateDigest = digestRoleAlignmentJsonV1(
    'state',
    withoutStateDigest(input) as unknown as JsonValue
  );
  if (expectedStateDigest !== input.stateDigest)
    throw new TypeError('role_alignment_state_digest_mismatch');
  ensureStateCapacity(input, policyRecord.policy);
  return policyRecord.policy;
}

export function findRoleAlignmentDecisionV1(
  state: RoleAlignmentStateV1,
  inputDigest: string
): RoleAlignmentDecisionV1 | undefined {
  assertDigest(inputDigest, 'inputDigest');
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index];
    if (event.inputDigest === inputDigest && event.decision !== null)
      return event.decision;
  }
  return undefined;
}

export function decisionForInactiveRoleAlignmentStateV1(
  state: RoleAlignmentStateV1
): RoleAlignmentDecisionV1 {
  switch (state.status) {
    case 'paused':
      return makeDecision(
        'pause',
        'alignment_paused',
        state.rollingCoherenceBps ?? 0,
        state.degraded
      );
    case 'realignment_required':
      return makeDecision(
        'request_realign',
        'role_realignment_required',
        state.rollingCoherenceBps ?? 0,
        state.degraded
      );
    case 'denied':
    case 'closed':
      return makeDecision(
        'deny',
        state.status === 'closed' ? 'alignment_closed' : 'alignment_denied',
        state.rollingCoherenceBps ?? 0,
        state.degraded
      );
    case 'active':
      throw new TypeError('role_alignment_state_is_active');
  }
}

function validateThresholds(input: RoleAlignmentThresholdsV1): void {
  assertExactKeys(
    input,
    [
      'healthyCoherenceBps',
      'reinforceCoherenceBelowBps',
      'pauseCoherenceAtOrBelowBps',
      'denyCoherenceAtOrBelowBps',
      'challengeContextAtOrAboveBps',
      'maximumUncertaintyBps',
    ],
    'role alignment thresholds'
  );
  for (const [label, value] of Object.entries(input)) basisPoints(value, label);
  if (
    input.denyCoherenceAtOrBelowBps > input.pauseCoherenceAtOrBelowBps ||
    input.pauseCoherenceAtOrBelowBps >= input.reinforceCoherenceBelowBps ||
    input.reinforceCoherenceBelowBps > input.healthyCoherenceBps
  )
    throw new TypeError('role_alignment_threshold_order_invalid');
}

function validateBudgets(input: RoleAlignmentBudgetsV1): void {
  assertExactKeys(
    input,
    ['maximumReinforcements', 'maximumContextChallenges', 'maximumPauses'],
    'role alignment budgets'
  );
  assertSafeInteger(input.maximumReinforcements, 'maximumReinforcements', 1);
  assertSafeInteger(
    input.maximumContextChallenges,
    'maximumContextChallenges',
    1
  );
  assertSafeInteger(input.maximumPauses, 'maximumPauses', 1);
}

function validateLimits(input: RoleAlignmentLimitsV1): void {
  assertExactKeys(
    input,
    [
      'rollingWindowSignals',
      'maximumSignals',
      'maximumRetainedEvents',
      'maximumReasonCodesPerSignal',
      'maximumEvidenceReferencesPerSignal',
      'maximumAssessmentTtlMs',
      'maximumStateBytes',
    ],
    'role alignment limits'
  );
  assertSafeInteger(input.rollingWindowSignals, 'rollingWindowSignals', 1);
  assertSafeInteger(input.maximumSignals, 'maximumSignals', 1);
  assertSafeInteger(input.maximumRetainedEvents, 'maximumRetainedEvents', 1);
  assertSafeInteger(
    input.maximumReasonCodesPerSignal,
    'maximumReasonCodesPerSignal',
    1
  );
  assertSafeInteger(
    input.maximumEvidenceReferencesPerSignal,
    'maximumEvidenceReferencesPerSignal',
    1
  );
  assertSafeInteger(input.maximumAssessmentTtlMs, 'maximumAssessmentTtlMs', 1);
  assertSafeInteger(input.maximumStateBytes, 'maximumStateBytes', 1_024);
  if (
    input.rollingWindowSignals > 4_096 ||
    input.maximumSignals > 1_000_000 ||
    input.maximumRetainedEvents > 4_096 ||
    input.maximumRetainedEvents < input.rollingWindowSignals ||
    input.rollingWindowSignals > input.maximumSignals ||
    input.maximumReasonCodesPerSignal > 64 ||
    input.maximumEvidenceReferencesPerSignal > 256 ||
    input.maximumAssessmentTtlMs > 3_600_000 ||
    input.maximumStateBytes > 67_108_864
  )
    throw new TypeError('role_alignment_limit_invalid');
}

function validateSignal(
  input: RoleAlignmentSignalV1,
  state: RoleAlignmentStateV1,
  policy: RoleAlignmentPolicyV1
): RoleAlignmentSignalV1 {
  validateSignalShape(input, policy);
  if (
    input.tenantId !== state.tenantId ||
    input.sessionId !== state.sessionId ||
    input.agentId !== state.agentId ||
    input.roleAnchorDigest !== state.roleAnchor.anchorDigest ||
    input.roleRevision !== state.roleAnchor.roleRevision ||
    input.observedAtLogicalMs < state.lastLogicalTimeMs
  )
    throw new TypeError('role_alignment_signal_binding_invalid');
  return cloneJson(input);
}

function validateSignalShape(
  input: RoleAlignmentSignalV1,
  policy: RoleAlignmentPolicyV1
): void {
  assertExactKeys(
    input,
    [
      'schemaVersion',
      'signalId',
      'assessmentRequestId',
      'assessorId',
      'assessorVersion',
      'assessorBindingDigest',
      'tenantId',
      'sessionId',
      'agentId',
      'stepId',
      'checkpoint',
      'roleAnchorDigest',
      'roleRevision',
      'targetDigest',
      'coherenceBps',
      'uncertaintyBps',
      'contextInconsistencyBps',
      'hardViolation',
      'reasonCodes',
      'evidenceReferenceIds',
      'observedAtLogicalMs',
      'expiresAtLogicalMs',
    ],
    'role alignment signal'
  );
  if (input.schemaVersion !== 1)
    throw new TypeError('role_alignment_signal_invalid');
  for (const [label, value] of [
    ['signalId', input.signalId],
    ['assessmentRequestId', input.assessmentRequestId],
    ['assessorId', input.assessorId],
    ['tenantId', input.tenantId],
    ['sessionId', input.sessionId],
    ['agentId', input.agentId],
    ['stepId', input.stepId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.assessorVersion, 'assessorVersion', 1);
  assertDigest(input.assessorBindingDigest, 'assessorBindingDigest');
  assertOneOf(input.checkpoint, checkpoints, 'checkpoint');
  assertDigest(input.roleAnchorDigest, 'roleAnchorDigest');
  assertSafeInteger(input.roleRevision, 'roleRevision', 1);
  assertDigest(input.targetDigest, 'targetDigest');
  basisPoints(input.coherenceBps, 'coherenceBps');
  basisPoints(input.uncertaintyBps, 'uncertaintyBps');
  basisPoints(input.contextInconsistencyBps, 'contextInconsistencyBps');
  if (typeof input.hardViolation !== 'boolean')
    throw new TypeError('role_alignment_signal_invalid');
  validateStringArray(
    input.reasonCodes,
    policy.limits.maximumReasonCodesPerSignal,
    'reasonCodes'
  );
  validateStringArray(
    input.evidenceReferenceIds,
    policy.limits.maximumEvidenceReferencesPerSignal,
    'evidenceReferenceIds'
  );
  assertSafeInteger(input.observedAtLogicalMs, 'observedAtLogicalMs');
  assertSafeInteger(input.expiresAtLogicalMs, 'expiresAtLogicalMs');
  if (
    input.expiresAtLogicalMs <= input.observedAtLogicalMs ||
    input.expiresAtLogicalMs - input.observedAtLogicalMs >
      policy.limits.maximumAssessmentTtlMs
  )
    throw new TypeError('role_alignment_signal_binding_invalid');
}

function validateWindowEntry(input: RoleAlignmentWindowEntryV1): void {
  assertExactKeys(
    input,
    [
      'schemaVersion',
      'signalId',
      'stepId',
      'checkpoint',
      'coherenceBps',
      'uncertaintyBps',
      'contextInconsistencyBps',
      'hardViolation',
      'observedAtLogicalMs',
    ],
    'role alignment window entry'
  );
  if (input.schemaVersion !== 1)
    throw new TypeError('role_alignment_state_invalid');
  assertIdentifier(input.signalId, 'signalId');
  assertIdentifier(input.stepId, 'stepId');
  assertOneOf(input.checkpoint, checkpoints, 'checkpoint');
  basisPoints(input.coherenceBps, 'coherenceBps');
  basisPoints(input.uncertaintyBps, 'uncertaintyBps');
  basisPoints(input.contextInconsistencyBps, 'contextInconsistencyBps');
  if (typeof input.hardViolation !== 'boolean')
    throw new TypeError('role_alignment_state_invalid');
  assertSafeInteger(input.observedAtLogicalMs, 'observedAtLogicalMs');
}

function validateEvent(
  input: RoleAlignmentEventV1,
  policy: RoleAlignmentPolicyV1
): RoleAlignmentEventV1 {
  assertExactKeys(
    input,
    [
      'schemaVersion',
      'eventSequence',
      'eventType',
      'inputDigest',
      'roleAnchorDigest',
      'signal',
      'decision',
      'reasonCode',
      'logicalTimeMs',
      'previousEventDigest',
      'eventDigest',
    ],
    'role alignment event'
  );
  if (input.schemaVersion !== 1)
    throw new TypeError('role_alignment_event_chain_invalid');
  assertSafeInteger(input.eventSequence, 'eventSequence', 1);
  assertOneOf(
    input.eventType,
    [
      'signal_evaluated',
      'role_replaced',
      'session_handoff',
      'resumed',
      'closed',
    ],
    'eventType'
  );
  assertDigest(input.inputDigest, 'inputDigest');
  assertDigest(input.roleAnchorDigest, 'roleAnchorDigest');
  assertIdentifier(input.reasonCode, 'reasonCode');
  assertSafeInteger(input.logicalTimeMs, 'logicalTimeMs');
  if (input.previousEventDigest !== null)
    assertDigest(input.previousEventDigest, 'previousEventDigest');
  assertDigest(input.eventDigest, 'eventDigest');
  if (
    (input.signal === null) !== (input.decision === null) ||
    (input.eventType === 'signal_evaluated') !== (input.signal !== null)
  )
    throw new TypeError('role_alignment_event_chain_invalid');
  if (input.signal !== null) {
    validateSignalShape(input.signal, policy);
    validateDecision(input.decision as RoleAlignmentDecisionV1);
    if (
      input.signal.targetDigest !== input.inputDigest ||
      input.signal.roleAnchorDigest !== input.roleAnchorDigest ||
      input.signal.observedAtLogicalMs !== input.logicalTimeMs ||
      input.decision?.reasonCode !== input.reasonCode
    )
      throw new TypeError('role_alignment_event_chain_invalid');
  }
  const { eventDigest: _ignored, ...withoutDigest } = input;
  if (
    digestRoleAlignmentJsonV1(
      'event',
      withoutDigest as unknown as JsonValue
    ) !== input.eventDigest
  )
    throw new TypeError('role_alignment_event_chain_invalid');
  return input;
}

function validateDecision(input: RoleAlignmentDecisionV1): void {
  assertExactKeys(
    input,
    [
      'schemaVersion',
      'disposition',
      'intervention',
      'reasonCode',
      'effectiveCoherenceBps',
      'degraded',
      'stateStatus',
    ],
    'role alignment decision'
  );
  if (input.schemaVersion !== 1)
    throw new TypeError('role_alignment_decision_invalid');
  assertOneOf(
    input.disposition,
    ['allow', 'deny', 'abstain', 'escalate'],
    'disposition'
  );
  assertOneOf(input.intervention, interventions, 'intervention');
  assertIdentifier(input.reasonCode, 'reasonCode');
  basisPoints(input.effectiveCoherenceBps, 'effectiveCoherenceBps');
  if (typeof input.degraded !== 'boolean')
    throw new TypeError('role_alignment_decision_invalid');
  assertOneOf(input.stateStatus, statuses, 'stateStatus');
  const normalized = makeDecision(
    input.intervention,
    input.reasonCode,
    input.effectiveCoherenceBps,
    input.degraded
  );
  if (
    normalized.disposition !== input.disposition ||
    normalized.stateStatus !== input.stateStatus
  )
    throw new TypeError('role_alignment_decision_invalid');
}

function validateInterventionCounts(
  input: RoleAlignmentInterventionCountsV1
): void {
  assertExactKeys(
    input,
    ['reinforcements', 'contextChallenges', 'pauses'],
    'role alignment intervention counts'
  );
  assertSafeInteger(input.reinforcements, 'reinforcements');
  assertSafeInteger(input.contextChallenges, 'contextChallenges');
  assertSafeInteger(input.pauses, 'pauses');
}

function chooseIntervention(input: {
  state: RoleAlignmentStateV1;
  signal: RoleAlignmentSignalV1;
  policy: RoleAlignmentPolicyV1;
  degraded: boolean;
  consecutiveBreaches: number;
  effectiveCoherenceBps: number;
}): { intervention: RoleAlignmentInterventionV1; reasonCode: string } {
  const { state, signal, policy } = input;
  if (
    signal.hardViolation ||
    signal.coherenceBps <= policy.thresholds.denyCoherenceAtOrBelowBps
  )
    return { intervention: 'deny', reasonCode: 'alignment_hard_violation' };
  if (
    signal.checkpoint === 'pre_action' &&
    input.degraded &&
    policy.denyActionsWhileDegraded
  )
    return {
      intervention: 'deny',
      reasonCode: 'action_denied_while_alignment_degraded',
    };
  if (input.consecutiveBreaches >= policy.consecutiveBreachLimit)
    return {
      intervention: 'request_realign',
      reasonCode: 'role_realignment_required',
    };
  if (
    signal.coherenceBps <= policy.thresholds.pauseCoherenceAtOrBelowBps ||
    signal.uncertaintyBps > policy.thresholds.maximumUncertaintyBps
  ) {
    if (state.interventionCounts.pauses >= policy.budgets.maximumPauses)
      return {
        intervention: 'request_realign',
        reasonCode: 'alignment_pause_budget_exhausted',
      };
    return { intervention: 'pause', reasonCode: 'alignment_pause_required' };
  }
  if (
    signal.contextInconsistencyBps >=
    policy.thresholds.challengeContextAtOrAboveBps
  ) {
    if (
      state.interventionCounts.contextChallenges >=
      policy.budgets.maximumContextChallenges
    )
      return {
        intervention: 'request_realign',
        reasonCode: 'context_challenge_budget_exhausted',
      };
    return {
      intervention: 'challenge_context',
      reasonCode: 'context_challenge_required',
    };
  }
  if (
    input.degraded ||
    input.effectiveCoherenceBps < policy.thresholds.reinforceCoherenceBelowBps
  ) {
    if (
      state.interventionCounts.reinforcements >=
      policy.budgets.maximumReinforcements
    )
      return {
        intervention: 'request_realign',
        reasonCode: 'role_reinforcement_budget_exhausted',
      };
    if (
      state.lastInterventionEventSequence !== null &&
      state.revision + 1 - state.lastInterventionEventSequence <=
        policy.reinforcementCooldownSignals
    )
      return {
        intervention: 'continue',
        reasonCode: 'role_reinforcement_cooldown',
      };
    return {
      intervention: 'reinforce_role',
      reasonCode: 'role_reinforcement_required',
    };
  }
  return { intervention: 'continue', reasonCode: 'alignment_healthy' };
}

function makeDecision(
  intervention: RoleAlignmentInterventionV1,
  reasonCode: string,
  effectiveCoherenceBps: number,
  degraded: boolean
): RoleAlignmentDecisionV1 {
  const disposition =
    intervention === 'continue' || intervention === 'reinforce_role'
      ? 'allow'
      : intervention === 'challenge_context' || intervention === 'pause'
        ? 'abstain'
        : intervention === 'request_realign'
          ? 'escalate'
          : 'deny';
  const stateStatus: RoleAlignmentStateStatusV1 =
    intervention === 'pause'
      ? 'paused'
      : intervention === 'request_realign'
        ? 'realignment_required'
        : intervention === 'deny'
          ? 'denied'
          : 'active';
  return deepFreeze({
    schemaVersion: 1,
    disposition,
    intervention,
    reasonCode,
    effectiveCoherenceBps,
    degraded,
    stateStatus,
  });
}

function createEvent(input: {
  readonly state: RoleAlignmentStateV1;
  readonly eventType: RoleAlignmentEventTypeV1;
  readonly inputDigest: string;
  readonly roleAnchorDigest: string;
  readonly signal: RoleAlignmentSignalV1 | null;
  readonly decision: RoleAlignmentDecisionV1 | null;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
}): RoleAlignmentEventV1 {
  const withoutDigest = {
    schemaVersion: 1 as const,
    eventSequence: input.state.revision + 1,
    eventType: input.eventType,
    inputDigest: input.inputDigest,
    roleAnchorDigest: input.roleAnchorDigest,
    signal: input.signal,
    decision: input.decision,
    reasonCode: input.reasonCode,
    logicalTimeMs: input.logicalTimeMs,
    previousEventDigest: input.state.lastEventDigest,
  };
  return deepFreeze({
    ...withoutDigest,
    eventDigest: digestRoleAlignmentJsonV1(
      'event',
      withoutDigest as unknown as JsonValue
    ),
  });
}

function withStateDigest(
  input: Omit<RoleAlignmentStateV1, 'stateDigest'>
): RoleAlignmentStateV1 {
  const cloned = cloneJson(input);
  return deepFreeze({
    ...cloned,
    stateDigest: digestRoleAlignmentJsonV1(
      'state',
      cloned as unknown as JsonValue
    ),
  });
}

function withoutStateDigest(
  state: RoleAlignmentStateV1
): Omit<RoleAlignmentStateV1, 'stateDigest'> {
  const { stateDigest: _ignored, ...withoutDigest } = state;
  return withoutDigest;
}

function countIntervention(
  counts: RoleAlignmentInterventionCountsV1,
  intervention: RoleAlignmentInterventionV1
): RoleAlignmentInterventionCountsV1 {
  return {
    reinforcements:
      counts.reinforcements + (intervention === 'reinforce_role' ? 1 : 0),
    contextChallenges:
      counts.contextChallenges + (intervention === 'challenge_context' ? 1 : 0),
    pauses: counts.pauses + (intervention === 'pause' ? 1 : 0),
  };
}

function retainEvents(
  retained: readonly RoleAlignmentEventV1[],
  event: RoleAlignmentEventV1,
  policy: RoleAlignmentPolicyV1
): readonly RoleAlignmentEventV1[] {
  return [...retained, event].slice(-policy.limits.maximumRetainedEvents);
}

function isHealthy(
  signal: RoleAlignmentSignalV1,
  policy: RoleAlignmentPolicyV1
): boolean {
  return (
    !signal.hardViolation &&
    signal.coherenceBps >= policy.thresholds.healthyCoherenceBps &&
    signal.uncertaintyBps <= policy.thresholds.maximumUncertaintyBps &&
    signal.contextInconsistencyBps <
      policy.thresholds.challengeContextAtOrAboveBps
  );
}

function average(values: readonly number[]): number {
  if (values.length === 0) throw new TypeError('role_alignment_window_empty');
  return Math.floor(
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
}

function basisPoints(value: unknown, label: string): asserts value is number {
  assertSafeInteger(value, label);
  if ((value as number) > ROLE_ALIGNMENT_BASIS_POINTS_V1)
    throw new TypeError(`${label}_out_of_range`);
}

function validateStringArray(
  input: readonly string[],
  maximum: number,
  label: string
): void {
  if (!Array.isArray(input) || input.length > maximum)
    throw new TypeError(`role_alignment_${label}_invalid`);
  for (const value of input) assertIdentifier(value, label);
  sortedUnique(input, label);
}

function requireExpectedRevision(
  state: RoleAlignmentStateV1,
  expectedRevision: number
): void {
  assertSafeInteger(expectedRevision, 'expectedRevision');
  if (state.revision !== expectedRevision)
    throw new TypeError('role_alignment_revision_conflict');
}

function ensureStateCapacity(
  state: RoleAlignmentStateV1,
  policy: RoleAlignmentPolicyV1
): void {
  if (
    utf8ByteLength(canonicalizeControlJsonV1(state as unknown as JsonValue)) >
    policy.limits.maximumStateBytes
  )
    throw new TypeError('role_alignment_state_capacity_exhausted');
}

function cloneJson<T>(input: T): T {
  assertStrictJsonValue(input as unknown);
  return deepFreeze(
    JSON.parse(canonicalizeControlJsonV1(input as unknown as JsonValue)) as T
  );
}
