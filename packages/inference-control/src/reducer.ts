import type { JsonValue } from '@agentplat/core';

import {
  assessmentMatchesRequestV1,
  validateAssessmentRequestV1,
  validateInferenceAssessmentV1,
} from './assessments.js';
import {
  CapabilityRegistryV1,
  negotiateCapabilitiesV1,
  validateCapabilityNegotiationResultV1,
} from './capabilities.js';
import type { CapabilityNegotiationResultV1 } from './capabilities.js';
import {
  canonicalizeControlJsonV1,
  digestControlJsonV1,
  utf8ByteLength,
} from './canonical.js';
import { canAdmitContextEntryV1, validateContextEntryV1 } from './context.js';
import { assertPolicyNarrowingV1, createPolicyRecordV1 } from './policy.js';
import {
  validateActionGrantStateV1,
  validateOutboundMessageAttemptStateV1,
} from './state-records.js';
import { finalizeInferenceControlStateV1 } from './state.js';
import {
  createStreamWindowV1,
  validateControlStreamChunkV1,
  validateControlStreamV1,
} from './streams.js';
import type {
  ActionGrantStateV1,
  AssessmentRequestV1,
  ContextEntryV1,
  ControlRunRecordV1,
  ControlStreamChunkV1,
  DiagnosticV1,
  InferenceAssessmentV1,
  InferenceControlPolicyV1,
  InferenceControlLimitsV1,
  InferenceControlReasonCodeV1,
  InferenceControlStateV1,
  OutboundMessageAttemptStateV1,
} from './types.js';
import {
  assertDigest,
  assertExactKeys,
  assertOneOf,
  assertSafeInteger,
  assertStrictJsonValue,
  assertString,
  compareCodeUnits,
  deepFreeze,
  isInferenceControlReasonCodeV1,
} from './validation.js';

interface InputHeadV1 {
  readonly schemaVersion: 1;
  readonly inputId: string;
  readonly expectedStateGeneration: number;
  readonly logicalTimeMs: number;
}

export type InferenceControlInputV1 = InputHeadV1 &
  (
    | {
        readonly type: 'policy_registered';
        readonly policy: InferenceControlPolicyV1;
        readonly policyDigest: string;
      }
    | { readonly type: 'run_created'; readonly run: ControlRunRecordV1 }
    | { readonly type: 'context_admitted'; readonly entry: ContextEntryV1 }
    | {
        readonly type: 'context_promoted';
        readonly sourceContextEntryId: string;
        readonly entry: ContextEntryV1;
        readonly transformerBindingDigest: string;
      }
    | {
        readonly type: 'capability_negotiated';
        readonly runId: string;
        readonly capabilityHandleId: string;
        readonly descriptorDigest: string;
        readonly result: CapabilityNegotiationResultV1;
      }
    | {
        readonly type: 'assessment_requested';
        readonly request: AssessmentRequestV1;
      }
    | {
        readonly type: 'assessment_received';
        readonly assessment: InferenceAssessmentV1;
      }
    | {
        readonly type: 'provider_started';
        readonly runId: string;
        readonly generation: number;
        readonly providerRequestDigest: string;
        readonly streamId: string;
      }
    | {
        readonly type: 'provider_chunk_received';
        readonly runId: string;
        readonly chunk: ControlStreamChunkV1;
      }
    | {
        readonly type: 'provider_completed';
        readonly runId: string;
        readonly generation: number;
        readonly streamId: string;
        readonly completionContent: string;
        readonly completionDigest: string;
      }
    | {
        readonly type: 'continuation_selected';
        readonly runId: string;
        readonly assessmentId: string;
        readonly kind: 'revise' | 'retry' | 'challenge';
      }
    | {
        readonly type: 'output_release_ack';
        readonly runId: string;
        readonly streamId: string;
        readonly generation: number;
        readonly throughSequence: number;
        readonly throughByteExclusive: number;
        readonly windowDigest: string;
      }
    | { readonly type: 'grant_issued'; readonly grant: ActionGrantStateV1 }
    | {
        readonly type: 'grant_reserved';
        readonly grantId: string;
        readonly reservation: JsonValue;
      }
    | {
        readonly type: 'action_dispatch_outcome';
        readonly grantId: string;
        readonly reservationId: string;
        readonly dispatchAttemptId: string;
        readonly outcome: 'dispatched' | 'failed' | 'indeterminate';
      }
    | {
        readonly type: 'message_prepared';
        readonly message: JsonValue;
        readonly attempt: OutboundMessageAttemptStateV1;
      }
    | {
        readonly type: 'message_reserved';
        readonly messageAttemptId: string;
        readonly reservation: JsonValue;
      }
    | {
        readonly type: 'message_dispatch_outcome';
        readonly messageAttemptId: string;
        readonly reservationId: string;
        readonly messageDispatchAttemptId: string;
        readonly outcome: 'sent' | 'failed' | 'indeterminate';
      }
    | {
        readonly type: 'deadline_fired';
        readonly timerKind: 'run' | 'assessment' | 'grant' | 'message';
        readonly timerId: string;
        readonly timerGeneration: number;
      }
    | {
        readonly type: 'run_cancelled' | 'run_failed';
        readonly runId: string;
        readonly generation: number;
        readonly reasonCode: InferenceControlReasonCodeV1;
      }
  );

export type InferenceControlEffectV1 =
  | Readonly<{
      schemaVersion: 1;
      effectId: string;
      runId: string;
      generation: number;
      type: 'request_assessment';
      request: AssessmentRequestV1;
    }>
  | Readonly<{
      schemaVersion: 1;
      effectId: string;
      runId: string;
      generation: number;
      type: 'invoke_provider';
      providerRequestDigest: string;
      capabilityHandleId: string;
    }>
  | Readonly<{
      schemaVersion: 1;
      effectId: string;
      runId: string;
      generation: number;
      type: 'cancel_provider';
      streamId: string;
      reasonCode: InferenceControlReasonCodeV1;
    }>
  | Readonly<{
      schemaVersion: 1;
      effectId: string;
      runId: string;
      generation: number;
      type: 'release_output';
      streamId: string;
      fromSequence: number;
      throughSequence: number;
      fromByte: number;
      throughByteExclusive: number;
      windowDigest: string;
    }>
  | Readonly<{
      schemaVersion: 1;
      effectId: string;
      runId: string;
      generation: number;
      type: 'invoke_continuation';
      kind: 'revise' | 'retry' | 'challenge';
      sourceAssessmentId: string;
      revisedContextEntryId: string | null;
    }>
  | Readonly<{
      schemaVersion: 1;
      effectId: string;
      runId: string;
      generation: number;
      type: 'persist_grant';
      grantId: string;
      stateGeneration: number;
    }>
  | Readonly<{
      schemaVersion: 1;
      effectId: string;
      runId: string;
      generation: number;
      type: 'dispatch_action' | 'dispatch_message';
      recordId: string;
      permit: JsonValue;
    }>
  | Readonly<{
      schemaVersion: 1;
      effectId: string;
      runId: string;
      generation: number;
      type: 'emit_receipt';
      outcome: 'accepted' | 'withheld' | 'denied' | 'unavailable';
    }>
  | Readonly<{
      schemaVersion: 1;
      effectId: string;
      runId: string;
      generation: number;
      type: 'emit_diagnostic';
      diagnostic: DiagnosticV1;
    }>;

export interface InferenceControlReductionV1 {
  readonly state: InferenceControlStateV1;
  readonly accepted: boolean;
  readonly reasonCode?: InferenceControlReasonCodeV1;
  readonly effects: readonly InferenceControlEffectV1[];
}

/** Runtime dependencies deliberately remain outside the serialised state. */
export interface InferenceControlReducerDependenciesV1 {
  readonly capabilityRegistry?: CapabilityRegistryV1;
}

const terminalPhases = new Set<ControlRunRecordV1['phase']>([
  'completed',
  'denied',
  'abstained',
  'escalated',
  'cancelled',
  'failed',
]);

export function reduceInferenceControlStateV1(
  state: InferenceControlStateV1,
  input: InferenceControlInputV1,
  dependencies: InferenceControlReducerDependenciesV1 = {},
): InferenceControlReductionV1 {
  validateInputHead(input);
  if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
    return unchanged(state, 'logical_time_rollback');
  if (input.expectedStateGeneration !== state.stateGeneration)
    return unchanged(state, 'state_conflict');
  try {
    switch (input.type) {
      case 'policy_registered':
        return registerPolicy(state, input);
      case 'run_created':
        return createRun(state, input);
      case 'context_admitted':
      case 'context_promoted':
        return admitContext(state, input);
      case 'capability_negotiated':
        return capabilityNegotiated(state, input, dependencies);
      case 'assessment_requested':
        return assessmentRequested(state, input);
      case 'assessment_received':
        return assessmentReceived(state, input);
      case 'provider_started':
        return providerStarted(state, input);
      case 'provider_chunk_received':
        return providerChunkReceived(state, input);
      case 'provider_completed':
        return providerCompleted(state, input);
      case 'continuation_selected':
        return continuationSelected(state, input);
      case 'output_release_ack':
        return outputReleaseAck(state, input);
      case 'grant_issued':
        return grantIssued(state, input);
      case 'grant_reserved':
        return grantReserved(state, input);
      case 'action_dispatch_outcome':
        return actionDispatchOutcome(state, input);
      case 'message_prepared':
        return messagePrepared(state, input);
      case 'message_reserved':
        return messageReserved(state, input);
      case 'message_dispatch_outcome':
        return messageDispatchOutcome(state, input);
      case 'deadline_fired':
        return deadlineFired(state, input);
      case 'run_cancelled':
      case 'run_failed':
        return terminateRun(state, input);
    }
  } catch (error) {
    return reject(
      state,
      reasonFromError(error),
      input.logicalTimeMs,
      'unavailable',
      runIdOf(input),
    );
  }
}

function registerPolicy(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'policy_registered' }>,
): InferenceControlReductionV1 {
  const record = createPolicyRecordV1(input.policy);
  if (record.policyDigest !== input.policyDigest)
    return reject(state, 'state_conflict', input.logicalTimeMs);
  const exact = state.policies.find(
    (item) => item.policyDigest === record.policyDigest,
  );
  if (exact) return accept(state);
  if (
    state.policies.some(
      (item) =>
        item.policy.policyId === record.policy.policyId &&
        item.policy.policyVersion === record.policy.policyVersion,
    )
  )
    return reject(state, 'state_conflict', input.logicalTimeMs);
  const currentHead = state.policyHeads.find(
    (head) => head.policyId === record.policy.policyId,
  );
  if (currentHead && currentHead.policyVersion >= record.policy.policyVersion)
    return reject(state, 'state_conflict', input.logicalTimeMs);
  if (record.policy.parentPolicyDigest !== null) {
    const parent = state.policies.find(
      (item) => item.policyDigest === record.policy.parentPolicyDigest,
    );
    if (!parent) return reject(state, 'state_conflict', input.logicalTimeMs);
    assertPolicyNarrowingV1(parent.policy, record.policy);
  }
  return accept(
    withState(
      state,
      {
        policies: sorted(
          [...state.policies, record],
          (item) => item.policyDigest,
        ),
        policyHeads: sorted(
          [
            ...state.policyHeads.filter(
              (head) => head.policyId !== record.policy.policyId,
            ),
            {
              schemaVersion: 1,
              policyId: record.policy.policyId,
              policyVersion: record.policy.policyVersion,
              policyDigest: record.policyDigest,
            },
          ],
          (item) => item.policyId,
        ),
      },
      input.logicalTimeMs,
    ),
  );
}

function createRun(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'run_created' }>,
): InferenceControlReductionV1 {
  const run = validateCreatedRunV1(input.run);
  const policy = state.policies.find(
    (item) => item.policyDigest === run.policyDigest,
  )?.policy;
  if (
    run.schemaVersion !== 1 ||
    run.tenantId !== state.tenantId ||
    run.generation !== 1 ||
    run.phase !== 'created' ||
    run.capabilityHandleId !== null ||
    run.createdAtLogicalMs !== input.logicalTimeMs ||
    run.deadlineAtLogicalMs <= input.logicalTimeMs ||
    !policy ||
    run.deadlineAtLogicalMs - run.createdAtLogicalMs >
      Math.min(state.limits.maxRunDurationMs, policy.maximumRunDurationMs) ||
    state.runs.some((item) => item.runId === run.runId)
  )
    return reject(
      state,
      'state_conflict',
      input.logicalTimeMs,
      'denied',
      run.runId,
    );
  return accept(
    withState(
      state,
      { runs: sorted([...state.runs, run], (item) => item.runId) },
      input.logicalTimeMs,
    ),
  );
}

function validateCreatedRunV1(value: unknown): ControlRunRecordV1 {
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'runId',
      'tenantId',
      'policyDigest',
      'capabilityDescriptorDigest',
      'capabilityHandleId',
      'scope',
      'generation',
      'phase',
      'createdAtLogicalMs',
      'deadlineAtLogicalMs',
      'dispositionCounts',
      'contextEntryIds',
      'assessmentRequestIds',
      'assessmentIds',
      'streamIds',
      'grantIds',
      'messageAttemptIds',
      'outputDigest',
      'releasedBytes',
      'terminalReasonCode',
    ],
    'run',
  );
  const run = value as unknown as ControlRunRecordV1;
  if (run.schemaVersion !== 1) throw new TypeError('state_conflict');
  assertString(run.runId, 'runId');
  assertString(run.tenantId, 'tenantId');
  assertDigest(run.policyDigest, 'policyDigest');
  assertDigest(run.capabilityDescriptorDigest, 'capabilityDescriptorDigest');
  if (run.capabilityHandleId !== null)
    assertString(run.capabilityHandleId, 'capabilityHandleId');
  if (run.scope !== null) assertStrictJsonValue(run.scope);
  assertSafeInteger(run.generation, 'generation', 1);
  assertOneOf(
    run.phase,
    [
      'created',
      'input_assessed',
      'executing',
      'buffering',
      'streaming',
      'output_assessed',
      'completed',
      'denied',
      'abstained',
      'escalated',
      'cancelled',
      'failed',
    ],
    'run phase',
  );
  assertSafeInteger(run.createdAtLogicalMs, 'createdAtLogicalMs');
  assertSafeInteger(run.deadlineAtLogicalMs, 'deadlineAtLogicalMs');
  if (run.deadlineAtLogicalMs <= run.createdAtLogicalMs)
    throw new TypeError('state_conflict');
  assertExactKeys(
    run.dispositionCounts,
    ['revisions', 'retries', 'challenges'],
    'dispositionCounts',
  );
  for (const count of Object.values(run.dispositionCounts))
    assertSafeInteger(count, 'disposition count');
  assertSafeInteger(run.releasedBytes, 'releasedBytes');
  if (run.outputDigest !== null) assertDigest(run.outputDigest, 'outputDigest');
  if (
    run.terminalReasonCode !== null &&
    !isInferenceControlReasonCodeV1(run.terminalReasonCode)
  )
    throw new TypeError('state_conflict');
  for (const ids of [
    run.contextEntryIds,
    run.assessmentRequestIds,
    run.assessmentIds,
    run.streamIds,
    run.grantIds,
    run.messageAttemptIds,
  ]) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length)
      throw new TypeError('state_conflict');
    for (const id of ids) assertString(id, 'run relation id');
  }
  return deepFreeze(structuredClone(run));
}

function admitContext(
  state: InferenceControlStateV1,
  input: Extract<
    InferenceControlInputV1,
    { type: 'context_admitted' | 'context_promoted' }
  >,
): InferenceControlReductionV1 {
  const entry = validateContextEntryV1(input.entry);
  const run = state.runs.find((item) => item.runId === entry.runId);
  if (!run || terminalPhases.has(run.phase))
    return reject(state, 'state_conflict', input.logicalTimeMs);
  const prior = state.contextEntries.find(
    (item) => item.contextEntryId === entry.contextEntryId,
  );
  if (prior)
    return canonicalizeControlJsonV1(prior as unknown as JsonValue) ===
      canonicalizeControlJsonV1(entry as unknown as JsonValue)
      ? accept(state)
      : reject(state, 'state_conflict', input.logicalTimeMs);
  if (input.type === 'context_promoted') {
    const source = state.contextEntries.find(
      (item) => item.contextEntryId === input.sourceContextEntryId,
    );
    const derivation = entry.derivation;
    if (
      !source ||
      derivation === null ||
      !('transformerId' in derivation) ||
      derivation.sourceContextEntryId !== source.contextEntryId ||
      derivation.sourceContentDigest !== source.contentDigest ||
      !state.dependencyBindings.some(
        (binding) =>
          binding.kind === 'transformer' &&
          binding.bindingId === derivation.transformerId &&
          binding.bindingVersion === derivation.transformerVersion &&
          binding.bindingDigest === input.transformerBindingDigest,
      )
    )
      return reject(state, 'context_promotion_denied', input.logicalTimeMs);
  }
  const policy = state.policies.find(
    (item) => item.policyDigest === run.policyDigest,
  )?.policy;
  if (
    !policy ||
    !canAdmitContextEntryV1(
      policy,
      state.contextEntries.filter((item) => item.runId === run.runId),
      entry,
    )
  )
    return reject(state, 'context_limit_exceeded', input.logicalTimeMs);
  return accept(
    withState(
      state,
      {
        contextEntries: sorted(
          [...state.contextEntries, entry],
          (item) => item.contextEntryId,
        ),
        runs: replaceRun(state, run.runId, {
          contextEntryIds: [...run.contextEntryIds, entry.contextEntryId],
        }),
      },
      input.logicalTimeMs,
    ),
  );
}

function capabilityNegotiated(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'capability_negotiated' }>,
  dependencies: InferenceControlReducerDependenciesV1,
): InferenceControlReductionV1 {
  const run = currentRun(state, input.runId);
  const policy = run
    ? state.policies.find((item) => item.policyDigest === run.policyDigest)
        ?.policy
    : undefined;
  const handle = dependencies.capabilityRegistry?.resolve(
    input.capabilityHandleId,
  );
  const descriptor = dependencies.capabilityRegistry?.descriptor(
    input.capabilityHandleId,
  );
  if (
    !run ||
    !policy ||
    run.phase !== 'created' ||
    run.capabilityHandleId !== null ||
    !handle ||
    !descriptor ||
    handle.descriptorDigest !== input.descriptorDigest ||
    run.capabilityDescriptorDigest !== handle.descriptorDigest
  )
    return reject(
      state,
      'policy_capability_missing',
      input.logicalTimeMs,
      'denied',
      input.runId,
    );
  const result = validateCapabilityNegotiationResultV1(input.result);
  const expected = negotiateCapabilitiesV1(descriptor, {
    policyDigest: run.policyDigest,
    descriptorDigest: handle.descriptorDigest,
    mode: policy.mode,
    checkpoints: policy.checkpoints,
    requiredCapabilities: policy.requiredCapabilities,
    minimumCapabilityAssurance: policy.minimumCapabilityAssurance,
    allowedCapabilityBindings: policy.allowedCapabilityBindings,
  });
  if (
    canonicalizeControlJsonV1(result as unknown as JsonValue) !==
      canonicalizeControlJsonV1(expected as unknown as JsonValue) ||
    !result.accepted
  )
    return reject(
      state,
      result.accepted ? 'policy_capability_missing' : result.reasonCode,
      input.logicalTimeMs,
      'denied',
      input.runId,
    );
  const binding = {
    schemaVersion: 1 as const,
    kind: 'capability' as const,
    bindingId: handle.capabilityHandleId,
    bindingVersion: handle.descriptorVersion,
    bindingDigest: handle.descriptorDigest,
  };
  const existing = state.dependencyBindings.find(
    (item) =>
      item.kind === binding.kind &&
      item.bindingId === binding.bindingId &&
      item.bindingVersion === binding.bindingVersion,
  );
  if (
    existing &&
    canonicalizeControlJsonV1(existing as unknown as JsonValue) !==
      canonicalizeControlJsonV1(binding as unknown as JsonValue)
  )
    return reject(state, 'state_conflict', input.logicalTimeMs);
  return accept(
    withState(
      state,
      {
        dependencyBindings: existing
          ? state.dependencyBindings
          : sorted(
              [...state.dependencyBindings, binding],
              (item) =>
                `${item.kind}\u0000${item.bindingId}\u0000${String(item.bindingVersion).padStart(16, '0')}`,
            ),
        runs: replaceRun(state, run.runId, {
          phase: 'input_assessed',
          capabilityHandleId: handle.capabilityHandleId,
        }),
      },
      input.logicalTimeMs,
    ),
  );
}

function assessmentRequested(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'assessment_requested' }>,
): InferenceControlReductionV1 {
  const preliminary = validateAssessmentRequestV1(input.request, state.limits);
  const run = currentRun(state, preliminary.runId);
  const limits = run ? effectiveLimitsForRun(state, run) : state.limits;
  const request = validateAssessmentRequestV1(input.request, limits);
  const policy = run
    ? state.policies.find((record) => record.policyDigest === run.policyDigest)
        ?.policy
    : undefined;
  const binding = policy?.assessmentBindings.find(
    (candidate) => candidate.checkpoint === request.checkpoint,
  );
  if (
    !run ||
    !policy ||
    !binding ||
    request.tenantId !== state.tenantId ||
    request.policyId !== policy.policyId ||
    request.policyVersion !== policy.policyVersion ||
    request.assessorId !== binding.assessorId ||
    request.assessorVersion !== binding.assessorVersion ||
    request.requestGeneration !== run.generation ||
    request.status !== 'pending' ||
    request.createdAtLogicalMs !== input.logicalTimeMs ||
    request.expiresAtLogicalMs > run.deadlineAtLogicalMs ||
    request.contextEntryIds.some((id) => !run.contextEntryIds.includes(id))
  )
    return reject(state, 'assessment_invalid', input.logicalTimeMs);
  const prior = state.assessmentRequests.find(
    (item) => item.assessmentRequestId === request.assessmentRequestId,
  );
  if (prior)
    return canonicalizeControlJsonV1(prior as unknown as JsonValue) ===
      canonicalizeControlJsonV1(request as unknown as JsonValue)
      ? accept(state)
      : reject(state, 'state_conflict', input.logicalTimeMs);
  if (
    state.assessmentRequests.filter((item) => item.runId === run.runId)
      .length >= limits.maxAssessmentsPerRun
  )
    return reject(state, 'state_capacity_exceeded', input.logicalTimeMs);
  const next = withState(
    state,
    {
      assessmentRequests: sorted(
        [...state.assessmentRequests, request],
        (item) => item.assessmentRequestId,
      ),
      runs: replaceRun(state, run.runId, {
        assessmentRequestIds: [
          ...run.assessmentRequestIds,
          request.assessmentRequestId,
        ],
      }),
    },
    input.logicalTimeMs,
  );
  return accept(next, [
    effect(next, run.runId, 'request_assessment', { request }),
  ]);
}

function assessmentReceived(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'assessment_received' }>,
): InferenceControlReductionV1 {
  const preliminary = validateInferenceAssessmentV1(
    input.assessment,
    state.limits,
  );
  const preliminaryRun = currentRun(state, preliminary.runId);
  const assessment = validateInferenceAssessmentV1(
    input.assessment,
    preliminaryRun
      ? effectiveLimitsForRun(state, preliminaryRun)
      : state.limits,
  );
  const prior = state.assessments.find(
    (item) => item.assessmentId === assessment.assessmentId,
  );
  if (prior)
    return canonicalizeControlJsonV1(prior as unknown as JsonValue) ===
      canonicalizeControlJsonV1(assessment as unknown as JsonValue)
      ? accept(state)
      : reject(state, 'state_conflict', input.logicalTimeMs);
  const request = state.assessmentRequests.find(
    (item) => item.assessmentRequestId === assessment.assessmentRequestId,
  );
  if (!request)
    return reject(state, 'assessment_unsolicited', input.logicalTimeMs);
  if (
    request.assessorId !== assessment.assessorId ||
    request.assessorVersion !== assessment.assessorVersion
  )
    return reject(state, 'assessment_assessor_mismatch', input.logicalTimeMs);
  if (request.requestGeneration !== assessment.requestGeneration)
    return reject(state, 'assessment_generation_stale', input.logicalTimeMs);
  const run = currentRun(state, assessment.runId);
  if (!run || run.generation !== assessment.requestGeneration)
    return reject(state, 'assessment_generation_stale', input.logicalTimeMs);
  const policy = state.policies.find(
    (record) => record.policyDigest === run.policyDigest,
  )?.policy;
  const binding = policy?.assessmentBindings.find(
    (candidate) => candidate.checkpoint === assessment.checkpoint,
  );
  if (
    !binding ||
    assessment.evidenceReferences.length > binding.maximumEvidenceReferences ||
    utf8ByteLength(
      canonicalizeControlJsonV1(assessment as unknown as JsonValue),
    ) > binding.maximumResponseBytes
  )
    return reject(state, 'assessment_invalid', input.logicalTimeMs);
  if (!assessmentMatchesRequestV1(request, assessment, input.logicalTimeMs))
    return reject(
      state,
      input.logicalTimeMs >= request.expiresAtLogicalMs ||
        input.logicalTimeMs >= assessment.expiresAtLogicalMs
        ? 'assessment_expired'
        : 'assessment_content_mismatch',
      input.logicalTimeMs,
    );
  const requests = state.assessmentRequests.map((item) =>
    item.assessmentRequestId === request.assessmentRequestId
      ? { ...item, status: 'accepted' as const }
      : item,
  );
  const phase = assessmentPhase(run, assessment);
  const next = withState(
    state,
    {
      assessmentRequests: requests,
      assessments: sorted(
        [...state.assessments, assessment],
        (item) => item.assessmentId,
      ),
      runs: replaceRun(state, run.runId, {
        assessmentIds: [...run.assessmentIds, assessment.assessmentId],
        phase,
        terminalReasonCode:
          phase === 'denied' || phase === 'abstained' || phase === 'escalated'
            ? assessment.reasonCodes[0]!
            : run.terminalReasonCode,
      }),
    },
    input.logicalTimeMs,
  );
  const release = releaseWindowForAssessment(next, request, assessment);
  return accept(next, [
    effect(next, run.runId, 'emit_receipt', {
      outcome: assessment.disposition === 'allow' ? 'accepted' : 'withheld',
    }),
    ...(release
      ? [
          effect(next, run.runId, 'release_output', {
            streamId: release.stream.streamId,
            fromSequence: release.window.fromSequence,
            throughSequence: release.window.throughSequence,
            fromByte: release.window.fromByte,
            throughByteExclusive: release.window.throughByteExclusive,
            windowDigest: release.window.windowDigest,
          }),
        ]
      : []),
  ]);
}

function providerStarted(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'provider_started' }>,
): InferenceControlReductionV1 {
  const run = currentRun(state, input.runId);
  const policy = run
    ? state.policies.find((item) => item.policyDigest === run.policyDigest)
        ?.policy
    : undefined;
  if (
    !run ||
    !policy ||
    run.phase !== 'input_assessed' ||
    input.generation !== run.generation ||
    state.streams.some((stream) => stream.streamId === input.streamId)
  )
    return reject(state, 'stream_sequence_invalid', input.logicalTimeMs);
  assertDigest(input.providerRequestDigest, 'providerRequestDigest');
  if (input.logicalTimeMs >= run.deadlineAtLogicalMs)
    return reject(state, 'assessment_expired', input.logicalTimeMs);
  if (
    !state.dependencyBindings.some(
      (binding) =>
        binding.kind === 'capability' &&
        binding.bindingId === run.capabilityHandleId &&
        binding.bindingDigest === run.capabilityDescriptorDigest,
    )
  )
    return reject(state, 'policy_capability_missing', input.logicalTimeMs);
  if (
    policy.mode !== 'observe' &&
    policy.checkpoints.includes('pre_run') &&
    !state.assessmentRequests.some(
      (request) =>
        request.runId === run.runId &&
        request.checkpoint === 'pre_run' &&
        request.targetDigest === input.providerRequestDigest &&
        request.requestGeneration === run.generation &&
        assessmentAllowsRequest(state, request),
    )
  )
    return reject(state, 'assessment_required', input.logicalTimeMs);
  const stream = validateControlStreamV1({
    schemaVersion: 1,
    streamId: input.streamId,
    runId: input.runId,
    generation: input.generation,
    nextSequence: 0,
    releasedThroughSequence: -1,
    receivedBytes: 0,
    releasedBytes: 0,
    finalDigest: null,
    status: 'open',
  });
  return accept(
    withState(
      state,
      {
        streams: sorted([...state.streams, stream], (item) => item.streamId),
        runs: replaceRun(state, run.runId, {
          phase: policy.mode === 'buffered' ? 'buffering' : 'streaming',
          streamIds: [...run.streamIds, stream.streamId],
        }),
      },
      input.logicalTimeMs,
    ),
  );
}

function providerChunkReceived(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'provider_chunk_received' }>,
): InferenceControlReductionV1 {
  const run = currentRun(state, input.runId);
  const stream = state.streams.find(
    (item) => item.streamId === input.chunk.streamId,
  );
  const limits = run ? effectiveLimitsForRun(state, run) : state.limits;
  const policy = run
    ? state.policies.find((record) => record.policyDigest === run.policyDigest)
        ?.policy
    : undefined;
  const chunk = validateControlStreamChunkV1(input.chunk, limits);
  if (
    !run ||
    !stream ||
    stream.status !== 'open' ||
    stream.runId !== run.runId ||
    chunk.generation !== stream.generation ||
    chunk.sequence !== stream.nextSequence ||
    chunk.fromByte !== stream.receivedBytes
  )
    return reject(state, 'stream_sequence_invalid', input.logicalTimeMs);
  const existing = state.streamChunks.find(
    (item) =>
      item.chunkId === chunk.chunkId ||
      (item.streamId === chunk.streamId &&
        item.generation === chunk.generation &&
        item.sequence === chunk.sequence),
  );
  if (existing)
    return canonicalizeControlJsonV1(existing as unknown as JsonValue) ===
      canonicalizeControlJsonV1(chunk as unknown as JsonValue)
      ? accept(state)
      : reject(state, 'stream_sequence_invalid', input.logicalTimeMs);
  if (
    state.streamChunks.filter((item) => run.streamIds.includes(item.streamId))
      .length >= limits.maxOutputChunksPerRun ||
    chunk.throughByteExclusive > limits.maxBufferedOutputBytes ||
    (policy?.mode === 'incremental' &&
      chunk.throughByteExclusive - stream.releasedBytes >
        limits.maxPendingWindowBytes)
  )
    return reject(state, 'state_capacity_exceeded', input.logicalTimeMs);
  return accept(
    withState(
      state,
      {
        streamChunks: sorted(
          [...state.streamChunks, chunk],
          (item) =>
            `${item.streamId}\u0000${String(item.generation).padStart(16, '0')}\u0000${String(item.sequence).padStart(16, '0')}`,
        ),
        streams: state.streams.map((item) =>
          item.streamId === stream.streamId
            ? {
                ...item,
                nextSequence: item.nextSequence + 1,
                receivedBytes: chunk.throughByteExclusive,
              }
            : item,
        ),
      },
      input.logicalTimeMs,
    ),
  );
}

function providerCompleted(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'provider_completed' }>,
): InferenceControlReductionV1 {
  const run = currentRun(state, input.runId);
  const stream = state.streams.find((item) => item.streamId === input.streamId);
  if (
    !run ||
    !stream ||
    stream.status !== 'open' ||
    stream.generation !== input.generation
  )
    return reject(state, 'stream_sequence_invalid', input.logicalTimeMs);
  assertDigest(input.completionDigest, 'completionDigest');
  const observed = state.streamChunks
    .filter(
      (chunk) =>
        chunk.streamId === stream.streamId &&
        chunk.generation === stream.generation,
    )
    .map((chunk) => chunk.content)
    .join('');
  if (
    (observed.length > 0 && observed !== input.completionContent) ||
    digestControlJsonV1('assessment-target', input.completionContent) !==
      input.completionDigest
  )
    return reject(
      state,
      'stream_content_mismatch',
      input.logicalTimeMs,
      'denied',
      run.runId,
    );
  return accept(
    withState(
      state,
      {
        streams: state.streams.map((item) =>
          item.streamId === stream.streamId
            ? {
                ...item,
                status: 'completed' as const,
                finalDigest: input.completionDigest,
              }
            : item,
        ),
        runs: replaceRun(state, run.runId, {
          outputDigest: input.completionDigest,
        }),
      },
      input.logicalTimeMs,
    ),
  );
}

function continuationSelected(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'continuation_selected' }>,
): InferenceControlReductionV1 {
  const run = currentRun(state, input.runId);
  const assessment = state.assessments.find(
    (item) => item.assessmentId === input.assessmentId,
  );
  const policy = run
    ? state.policies.find((item) => item.policyDigest === run.policyDigest)
        ?.policy
    : undefined;
  const countKey =
    input.kind === 'revise'
      ? 'revisions'
      : input.kind === 'retry'
        ? 'retries'
        : 'challenges';
  if (
    !run ||
    !assessment ||
    !policy ||
    assessment.runId !== run.runId ||
    assessment.requestGeneration !== run.generation ||
    assessment.disposition !== input.kind
  )
    return reject(state, 'assessment_invalid', input.logicalTimeMs);
  if (run.dispositionCounts[countKey] >= policy.budgets[countKey])
    return terminateForExhaustion(state, run, policy, input.logicalTimeMs);
  const next = withState(
    state,
    {
      ...fenceRunPermissions(state, run.runId),
      runs: replaceRun(state, run.runId, {
        generation: run.generation + 1,
        capabilityHandleId: null,
        dispositionCounts: {
          ...run.dispositionCounts,
          [countKey]: run.dispositionCounts[countKey] + 1,
        },
        phase: 'created',
      }),
      streams: state.streams.map((stream) =>
        stream.runId === run.runId && stream.status === 'open'
          ? { ...stream, status: 'cancelled' as const }
          : stream,
      ),
      assessmentRequests: state.assessmentRequests.map((request) =>
        request.runId === run.runId && request.status === 'pending'
          ? { ...request, status: 'cancelled' as const }
          : request,
      ),
    },
    input.logicalTimeMs,
  );
  return accept(next, [
    effect(next, run.runId, 'invoke_continuation', {
      kind: input.kind,
      sourceAssessmentId: assessment.assessmentId,
      revisedContextEntryId: null,
    }),
  ]);
}

function outputReleaseAck(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'output_release_ack' }>,
): InferenceControlReductionV1 {
  const run = currentRun(state, input.runId);
  const stream = state.streams.find((item) => item.streamId === input.streamId);
  const policy = run
    ? state.policies.find((item) => item.policyDigest === run.policyDigest)
        ?.policy
    : undefined;
  if (
    !run ||
    !stream ||
    !policy ||
    stream.generation !== input.generation ||
    input.throughSequence <= stream.releasedThroughSequence ||
    input.throughSequence >= stream.nextSequence ||
    input.throughByteExclusive <= stream.releasedBytes ||
    input.throughByteExclusive > stream.receivedBytes
  )
    return reject(state, 'stream_sequence_invalid', input.logicalTimeMs);
  assertDigest(input.windowDigest, 'windowDigest');
  const chunks = state.streamChunks.filter(
    (chunk) =>
      chunk.streamId === stream.streamId &&
      chunk.generation === stream.generation &&
      chunk.sequence > stream.releasedThroughSequence &&
      chunk.sequence <= input.throughSequence,
  );
  const window = createStreamWindowV1(stream, chunks);
  if (
    window.fromSequence !== stream.releasedThroughSequence + 1 ||
    window.fromByte !== stream.releasedBytes ||
    window.throughSequence !== input.throughSequence ||
    window.throughByteExclusive !== input.throughByteExclusive ||
    window.windowDigest !== input.windowDigest
  )
    return reject(state, 'stream_content_mismatch', input.logicalTimeMs);
  if (
    window.utf8Bytes > effectiveLimitsForRun(state, run).maxPendingWindowBytes
  )
    return reject(state, 'state_capacity_exceeded', input.logicalTimeMs);
  const assessmentMatches =
    policy.mode === 'incremental'
      ? state.assessmentRequests.some(
          (request) =>
            request.runId === run.runId &&
            request.checkpoint === 'stream' &&
            request.targetKind === 'stream_window' &&
            request.targetDigest === window.windowDigest &&
            request.requestGeneration === run.generation &&
            assessmentAllowsRequest(state, request),
        )
      : state.assessmentRequests.some(
          (request) =>
            request.runId === run.runId &&
            request.checkpoint === 'post_run' &&
            request.targetDigest === run.outputDigest &&
            request.requestGeneration === run.generation &&
            assessmentAllowsRequest(state, request),
        );
  // An acknowledgement confirms a previously emitted, assessment-authorised
  // release. It never authorises or emits a second release itself.
  if (!assessmentMatches)
    return reject(state, 'assessment_required', input.logicalTimeMs);
  const next = withState(
    state,
    {
      streams: state.streams.map((item) =>
        item.streamId === stream.streamId
          ? {
              ...item,
              releasedThroughSequence: input.throughSequence,
              releasedBytes: input.throughByteExclusive,
            }
          : item,
      ),
      runs: replaceRun(state, run.runId, {
        releasedBytes: input.throughByteExclusive,
      }),
    },
    input.logicalTimeMs,
  );
  return accept(next);
}

function grantIssued(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'grant_issued' }>,
): InferenceControlReductionV1 {
  const run = currentRun(state, input.grant.runId);
  const limits = run ? effectiveLimitsForRun(state, run) : state.limits;
  const policy = run
    ? state.policies.find((record) => record.policyDigest === run.policyDigest)
        ?.policy
    : undefined;
  validateActionGrantStateV1(input.grant, limits);
  const request = state.assessmentRequests.find(
    (item) => item.assessmentRequestId === input.grant.assessmentRequestId,
  );
  const assessment = state.assessments.find(
    (item) => item.assessmentId === input.grant.assessmentId,
  );
  if (
    !run ||
    !policy ||
    run.capabilityHandleId === null ||
    !request ||
    !assessment ||
    request.checkpoint !== 'pre_tool' ||
    request.status !== 'accepted' ||
    request.requestGeneration !== run.generation ||
    assessment.disposition !== 'allow' ||
    assessment.assessmentRequestId !== request.assessmentRequestId ||
    !assessmentAllowsRequest(state, request) ||
    request.targetDigest !== input.grant.assessmentTargetDigest ||
    request.runId !== run.runId ||
    assessment.requestGeneration !== run.generation ||
    canonicalizeControlJsonV1(request.scope) !==
      canonicalizeControlJsonV1(input.grant.scope) ||
    input.grant.status !== 'issued' ||
    input.grant.reservation !== null ||
    input.grant.issuedAtLogicalMs !== input.logicalTimeMs ||
    input.grant.expiresAtLogicalMs > run.deadlineAtLogicalMs ||
    input.grant.expiresAtLogicalMs > assessment.expiresAtLogicalMs ||
    !policy.allowedActions.some(
      (action) =>
        action.namespace === input.grant.namespace &&
        action.toolId === input.grant.toolId &&
        action.operation === input.grant.operation &&
        action.actionBindingId === input.grant.actionBindingId &&
        input.grant.actionBindingVersion >= action.minimumActionBindingVersion,
    ) ||
    (policy.coordinatedActionsRequired &&
      input.grant.scope.kind !== 'coordinated') ||
    (input.grant.scope.kind === 'coordinated' &&
      input.grant.expiresAtLogicalMs >
        input.grant.scope.leaseExpiresAtLogicalMs)
  )
    return reject(state, 'grant_assessment_mismatch', input.logicalTimeMs);
  const prior = state.grants.find(
    (item) => item.grantId === input.grant.grantId,
  );
  if (prior)
    return canonicalizeControlJsonV1(prior as unknown as JsonValue) ===
      canonicalizeControlJsonV1(input.grant as unknown as JsonValue)
      ? accept(state)
      : reject(state, 'state_conflict', input.logicalTimeMs);
  if (
    state.grants.filter((item) => ['issued', 'reserved'].includes(item.status))
      .length >= state.limits.maxActiveGrants ||
    state.grants.length >= state.limits.maxRetainedGrantRecords
  )
    return reject(state, 'state_capacity_exceeded', input.logicalTimeMs);
  if (
    state.grants.filter(
      (item) =>
        item.runId === run.runId &&
        ['issued', 'reserved'].includes(item.status),
    ).length >= limits.maxActiveGrants ||
    state.grants.filter((item) => item.runId === run.runId).length >=
      limits.maxRetainedGrantRecords ||
    input.grant.expiresAtLogicalMs - input.grant.issuedAtLogicalMs >
      limits.maxGrantTtlMs
  )
    return reject(state, 'state_capacity_exceeded', input.logicalTimeMs);
  const idempotency = state.actionIdempotency.find(
    (item) =>
      item.scopeDigest === input.grant.scopeDigest &&
      item.idempotencyKey === input.grant.idempotencyKey,
  );
  if (idempotency)
    return reject(
      state,
      idempotency.actionDigest === input.grant.actionDigest
        ? 'grant_consumed'
        : 'grant_idempotency_conflict',
      input.logicalTimeMs,
    );
  const next = withState(
    state,
    {
      grants: sorted([...state.grants, input.grant], (item) => item.grantId),
      actionIdempotency: sorted(
        [
          ...state.actionIdempotency,
          {
            schemaVersion: 1,
            scopeDigest: input.grant.scopeDigest,
            idempotencyKey: input.grant.idempotencyKey,
            actionDigest: input.grant.actionDigest,
            grantId: input.grant.grantId,
            retainedOutcome: input.grant.status,
          },
        ],
        (item) => `${item.scopeDigest}\u0000${item.idempotencyKey}`,
      ),
      runs: replaceRun(state, run.runId, {
        grantIds: [...run.grantIds, input.grant.grantId],
      }),
    },
    input.logicalTimeMs,
  );
  return accept(next, [
    effect(next, run.runId, 'persist_grant', {
      grantId: input.grant.grantId,
      stateGeneration: next.stateGeneration,
    }),
  ]);
}

function grantReserved(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'grant_reserved' }>,
): InferenceControlReductionV1 {
  const grant = state.grants.find((item) => item.grantId === input.grantId);
  const run = grant ? currentRun(state, grant.runId) : undefined;
  const request = grant
    ? state.assessmentRequests.find(
        (item) => item.assessmentRequestId === grant.assessmentRequestId,
      )
    : undefined;
  if (
    !grant ||
    !run ||
    run.capabilityHandleId === null ||
    !request ||
    request.requestGeneration !== run.generation ||
    request.status !== 'accepted' ||
    grant.status !== 'issued' ||
    input.logicalTimeMs >= grant.expiresAtLogicalMs
  )
    return reject(
      state,
      grant ? 'grant_expired' : 'grant_missing',
      input.logicalTimeMs,
    );
  const grants = state.grants.map((item) =>
    item.grantId === grant.grantId
      ? {
          ...item,
          stateGeneration: item.stateGeneration + 1,
          status: 'reserved' as const,
          reservation: input.reservation,
        }
      : item,
  );
  return accept(
    withState(
      state,
      {
        grants,
        actionIdempotency: updateActionOutcome(
          state,
          grant.grantId,
          'reserved',
        ),
      },
      input.logicalTimeMs,
    ),
  );
}

function actionDispatchOutcome(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'action_dispatch_outcome' }>,
): InferenceControlReductionV1 {
  const grant = state.grants.find((item) => item.grantId === input.grantId);
  if (!grant || grant.status !== 'reserved' || grant.reservation === null)
    return reject(state, 'state_conflict', input.logicalTimeMs);
  const reservation = grant.reservation as Record<string, JsonValue>;
  if (
    reservation.reservationId !== input.reservationId ||
    reservation.dispatchAttemptId !== input.dispatchAttemptId
  )
    return reject(state, 'state_conflict', input.logicalTimeMs);
  const grants = state.grants.map((item) =>
    item.grantId === grant.grantId
      ? {
          ...item,
          stateGeneration: item.stateGeneration + 1,
          status: input.outcome,
        }
      : item,
  );
  return accept(
    withState(
      state,
      {
        grants,
        actionIdempotency: updateActionOutcome(
          state,
          grant.grantId,
          input.outcome,
        ),
      },
      input.logicalTimeMs,
    ),
  );
}

function messagePrepared(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'message_prepared' }>,
): InferenceControlReductionV1 {
  validateOutboundMessageAttemptStateV1(input.attempt);
  const run = currentRun(state, input.attempt.runId);
  const limits = run ? effectiveLimitsForRun(state, run) : state.limits;
  const request = state.assessmentRequests.find(
    (item) => item.assessmentRequestId === input.attempt.assessmentRequestId,
  );
  const assessment = state.assessments.find(
    (item) => item.assessmentId === input.attempt.assessmentId,
  );
  if (
    !run ||
    run.capabilityHandleId === null ||
    !request ||
    !assessment ||
    input.attempt.preparedAtLogicalMs !== input.logicalTimeMs ||
    request.checkpoint !== 'pre_message' ||
    request.status !== 'accepted' ||
    request.requestGeneration !== run.generation ||
    assessment.disposition !== 'allow' ||
    assessment.assessmentRequestId !== request.assessmentRequestId ||
    !assessmentAllowsRequest(state, request) ||
    request.targetDigest !== input.attempt.messageDigest ||
    request.scope === null ||
    digestControlJsonV1('scope', request.scope) !== input.attempt.scopeDigest ||
    request.runId !== run.runId ||
    assessment.requestGeneration !== run.generation
  )
    return reject(state, 'assessment_required', input.logicalTimeMs);
  if (
    state.messageAttempts.length >= state.limits.maxRetainedMessageAttempts ||
    state.messageAttempts.filter((item) => item.runId === run.runId).length >=
      limits.maxRetainedMessageAttempts ||
    input.attempt.expiresAtLogicalMs <= input.logicalTimeMs ||
    input.attempt.expiresAtLogicalMs > run.deadlineAtLogicalMs ||
    input.attempt.expiresAtLogicalMs > assessment.expiresAtLogicalMs ||
    (request.scope.kind === 'coordinated' &&
      input.attempt.expiresAtLogicalMs >
        request.scope.leaseExpiresAtLogicalMs) ||
    input.attempt.expiresAtLogicalMs - input.attempt.preparedAtLogicalMs >
      limits.maxMessagePermitTtlMs ||
    state.messageAttempts.filter((item) =>
      ['prepared', 'reserved'].includes(item.status),
    ).length >= state.limits.maxActiveMessageAttempts ||
    state.messageAttempts.filter(
      (item) =>
        item.runId === run.runId &&
        ['prepared', 'reserved'].includes(item.status),
    ).length >= limits.maxActiveMessageAttempts
  )
    return reject(state, 'state_capacity_exceeded', input.logicalTimeMs);
  const prior = state.messageIdempotency.find(
    (item) =>
      item.scopeDigest === input.attempt.scopeDigest &&
      item.idempotencyKey === input.attempt.idempotencyKey,
  );
  if (prior)
    return reject(
      state,
      prior.messageDigest === input.attempt.messageDigest
        ? 'message_indeterminate'
        : 'message_idempotency_conflict',
      input.logicalTimeMs,
    );
  return accept(
    withState(
      state,
      {
        messageAttempts: sorted(
          [...state.messageAttempts, input.attempt],
          (item) => item.messageAttemptId,
        ),
        messageIdempotency: sorted(
          [
            ...state.messageIdempotency,
            {
              schemaVersion: 1,
              scopeDigest: input.attempt.scopeDigest,
              idempotencyKey: input.attempt.idempotencyKey,
              messageDigest: input.attempt.messageDigest,
              messageAttemptId: input.attempt.messageAttemptId,
              retainedOutcome: input.attempt.status,
            },
          ],
          (item) => `${item.scopeDigest}\u0000${item.idempotencyKey}`,
        ),
        runs: replaceRun(state, run.runId, {
          messageAttemptIds: [
            ...run.messageAttemptIds,
            input.attempt.messageAttemptId,
          ],
        }),
      },
      input.logicalTimeMs,
    ),
  );
}

function messageReserved(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'message_reserved' }>,
): InferenceControlReductionV1 {
  const attempt = state.messageAttempts.find(
    (item) => item.messageAttemptId === input.messageAttemptId,
  );
  const run = attempt ? currentRun(state, attempt.runId) : undefined;
  const request = attempt
    ? state.assessmentRequests.find(
        (item) => item.assessmentRequestId === attempt.assessmentRequestId,
      )
    : undefined;
  if (
    !attempt ||
    !run ||
    run.capabilityHandleId === null ||
    !request ||
    request.requestGeneration !== run.generation ||
    request.status !== 'accepted' ||
    attempt.status !== 'prepared' ||
    input.logicalTimeMs >= attempt.expiresAtLogicalMs
  )
    return reject(
      state,
      attempt ? 'message_indeterminate' : 'message_not_permitted',
      input.logicalTimeMs,
    );
  const attempts = state.messageAttempts.map((item) =>
    item.messageAttemptId === attempt.messageAttemptId
      ? {
          ...item,
          generation: item.generation + 1,
          status: 'reserved' as const,
          reservation: input.reservation,
          reservedAtLogicalMs: input.logicalTimeMs,
        }
      : item,
  );
  return accept(
    withState(
      state,
      {
        messageAttempts: attempts,
        messageIdempotency: updateMessageOutcome(
          state,
          attempt.messageAttemptId,
          'reserved',
        ),
      },
      input.logicalTimeMs,
    ),
  );
}

function messageDispatchOutcome(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'message_dispatch_outcome' }>,
): InferenceControlReductionV1 {
  const attempt = state.messageAttempts.find(
    (item) => item.messageAttemptId === input.messageAttemptId,
  );
  if (!attempt || attempt.status !== 'reserved' || attempt.reservation === null)
    return reject(state, 'state_conflict', input.logicalTimeMs);
  const reservation = attempt.reservation as Record<string, JsonValue>;
  if (
    reservation.reservationId !== input.reservationId ||
    reservation.messageDispatchAttemptId !== input.messageDispatchAttemptId
  )
    return reject(state, 'state_conflict', input.logicalTimeMs);
  const attempts = state.messageAttempts.map((item) =>
    item.messageAttemptId === attempt.messageAttemptId
      ? {
          ...item,
          generation: item.generation + 1,
          status: input.outcome,
        }
      : item,
  );
  return accept(
    withState(
      state,
      {
        messageAttempts: attempts,
        messageIdempotency: updateMessageOutcome(
          state,
          attempt.messageAttemptId,
          input.outcome,
        ),
      },
      input.logicalTimeMs,
    ),
  );
}

function deadlineFired(
  state: InferenceControlStateV1,
  input: Extract<InferenceControlInputV1, { type: 'deadline_fired' }>,
): InferenceControlReductionV1 {
  if (input.timerKind === 'run') {
    const run = currentRun(state, input.timerId);
    if (
      !run ||
      run.generation !== input.timerGeneration ||
      input.logicalTimeMs < run.deadlineAtLogicalMs
    )
      return reject(state, 'state_conflict', input.logicalTimeMs);
    return terminate(
      state,
      run,
      'failed',
      'assessment_expired',
      input.logicalTimeMs,
    );
  }
  if (input.timerKind === 'assessment') {
    const request = state.assessmentRequests.find(
      (item) => item.assessmentRequestId === input.timerId,
    );
    if (
      !request ||
      request.requestGeneration !== input.timerGeneration ||
      request.status !== 'pending' ||
      input.logicalTimeMs < request.expiresAtLogicalMs
    )
      return reject(state, 'state_conflict', input.logicalTimeMs);
    return accept(
      withState(
        state,
        {
          assessmentRequests: state.assessmentRequests.map((item) =>
            item.assessmentRequestId === request.assessmentRequestId
              ? { ...item, status: 'expired' as const }
              : item,
          ),
        },
        input.logicalTimeMs,
      ),
    );
  }
  if (input.timerKind === 'grant') {
    const grant = state.grants.find((item) => item.grantId === input.timerId);
    if (
      !grant ||
      grant.stateGeneration !== input.timerGeneration ||
      grant.status !== 'issued' ||
      input.logicalTimeMs < grant.expiresAtLogicalMs
    )
      return reject(state, 'state_conflict', input.logicalTimeMs);
    const grants = state.grants.map((item) =>
      item.grantId === grant.grantId
        ? {
            ...item,
            stateGeneration: item.stateGeneration + 1,
            status: 'expired' as const,
          }
        : item,
    );
    return accept(
      withState(
        state,
        {
          grants,
          actionIdempotency: updateActionOutcome(
            state,
            grant.grantId,
            'expired',
          ),
        },
        input.logicalTimeMs,
      ),
    );
  }
  const attempt = state.messageAttempts.find(
    (item) => item.messageAttemptId === input.timerId,
  );
  if (
    !attempt ||
    attempt.generation !== input.timerGeneration ||
    attempt.status !== 'prepared' ||
    input.logicalTimeMs < attempt.expiresAtLogicalMs
  )
    return reject(state, 'state_conflict', input.logicalTimeMs);
  const attempts = state.messageAttempts.map((item) =>
    item.messageAttemptId === attempt.messageAttemptId
      ? { ...item, generation: item.generation + 1, status: 'expired' as const }
      : item,
  );
  return accept(
    withState(
      state,
      {
        messageAttempts: attempts,
        messageIdempotency: updateMessageOutcome(
          state,
          attempt.messageAttemptId,
          'expired',
        ),
      },
      input.logicalTimeMs,
    ),
  );
}

function terminateRun(
  state: InferenceControlStateV1,
  input: Extract<
    InferenceControlInputV1,
    { type: 'run_cancelled' | 'run_failed' }
  >,
): InferenceControlReductionV1 {
  const run = currentRun(state, input.runId);
  if (!run || run.generation !== input.generation)
    return reject(state, 'assessment_generation_stale', input.logicalTimeMs);
  return terminate(
    state,
    run,
    input.type === 'run_cancelled' ? 'cancelled' : 'failed',
    input.reasonCode,
    input.logicalTimeMs,
  );
}

function terminate(
  state: InferenceControlStateV1,
  run: ControlRunRecordV1,
  phase: Extract<
    ControlRunRecordV1['phase'],
    'cancelled' | 'failed' | 'denied' | 'abstained' | 'escalated'
  >,
  reasonCode: InferenceControlReasonCodeV1,
  logicalTimeMs: number,
): InferenceControlReductionV1 {
  const next = withState(
    state,
    {
      ...fenceRunPermissions(state, run.runId),
      runs: replaceRun(state, run.runId, {
        phase,
        generation: run.generation + 1,
        terminalReasonCode: reasonCode,
      }),
      streams: state.streams.map((stream) =>
        stream.runId === run.runId && stream.status === 'open'
          ? { ...stream, status: 'cancelled' as const }
          : stream,
      ),
      assessmentRequests: state.assessmentRequests.map((request) =>
        request.runId === run.runId && request.status === 'pending'
          ? { ...request, status: 'cancelled' as const }
          : request,
      ),
    },
    logicalTimeMs,
  );
  return accept(next);
}

function terminateForExhaustion(
  state: InferenceControlStateV1,
  run: ControlRunRecordV1,
  policy: InferenceControlPolicyV1,
  logicalTimeMs: number,
): InferenceControlReductionV1 {
  return terminate(
    state,
    run,
    policy.exhaustedDisposition === 'deny'
      ? 'denied'
      : policy.exhaustedDisposition === 'abstain'
        ? 'abstained'
        : 'escalated',
    'assessment_budget_exhausted',
    logicalTimeMs,
  );
}

function assessmentPhase(
  run: ControlRunRecordV1,
  assessment: InferenceAssessmentV1,
): ControlRunRecordV1['phase'] {
  if (assessment.disposition === 'deny') return 'denied';
  if (assessment.disposition === 'abstain') return 'abstained';
  if (assessment.disposition === 'escalate') return 'escalated';
  if (assessment.disposition !== 'allow') return run.phase;
  if (assessment.checkpoint === 'pre_run') return 'input_assessed';
  if (assessment.checkpoint === 'post_run') return 'output_assessed';
  return run.phase;
}

function validateInputHead(input: InferenceControlInputV1): void {
  const common = [
    'schemaVersion',
    'inputId',
    'type',
    'expectedStateGeneration',
    'logicalTimeMs',
  ];
  const variants: Record<string, readonly string[]> = {
    policy_registered: ['policy', 'policyDigest'],
    run_created: ['run'],
    context_admitted: ['entry'],
    context_promoted: [
      'sourceContextEntryId',
      'entry',
      'transformerBindingDigest',
    ],
    capability_negotiated: [
      'runId',
      'capabilityHandleId',
      'descriptorDigest',
      'result',
    ],
    assessment_requested: ['request'],
    assessment_received: ['assessment'],
    provider_started: [
      'runId',
      'generation',
      'providerRequestDigest',
      'streamId',
    ],
    provider_chunk_received: ['runId', 'chunk'],
    provider_completed: [
      'runId',
      'generation',
      'streamId',
      'completionContent',
      'completionDigest',
    ],
    continuation_selected: ['runId', 'assessmentId', 'kind'],
    output_release_ack: [
      'runId',
      'streamId',
      'generation',
      'throughSequence',
      'throughByteExclusive',
      'windowDigest',
    ],
    grant_issued: ['grant'],
    grant_reserved: ['grantId', 'reservation'],
    action_dispatch_outcome: [
      'grantId',
      'reservationId',
      'dispatchAttemptId',
      'outcome',
    ],
    message_prepared: ['message', 'attempt'],
    message_reserved: ['messageAttemptId', 'reservation'],
    message_dispatch_outcome: [
      'messageAttemptId',
      'reservationId',
      'messageDispatchAttemptId',
      'outcome',
    ],
    deadline_fired: ['timerKind', 'timerId', 'timerGeneration'],
    run_cancelled: ['runId', 'generation', 'reasonCode'],
    run_failed: ['runId', 'generation', 'reasonCode'],
  };
  const variant = variants[(input as { type?: unknown }).type as string];
  if (!variant) throw new TypeError('state_conflict');
  assertExactKeys(input, [...common, ...variant], 'reducer input');
  if (input.schemaVersion !== 1) throw new TypeError('state_conflict');
  assertString(input.inputId, 'inputId');
  assertSafeInteger(
    input.expectedStateGeneration,
    'expectedStateGeneration',
    1,
  );
  assertSafeInteger(input.logicalTimeMs, 'logicalTimeMs');
}

function currentRun(
  state: InferenceControlStateV1,
  runId: string,
): ControlRunRecordV1 | undefined {
  const run = state.runs.find((item) => item.runId === runId);
  return run && !terminalPhases.has(run.phase) ? run : undefined;
}

/** The serialised state can only tighten a policy, never dilute it. */
function effectiveLimitsForRun(
  state: InferenceControlStateV1,
  run: ControlRunRecordV1,
): InferenceControlLimitsV1 {
  const policy = state.policies.find(
    (record) => record.policyDigest === run.policyDigest,
  )?.policy;
  if (!policy) throw new TypeError('state_conflict');
  const limits = {} as Record<keyof InferenceControlLimitsV1, number>;
  for (const key of Object.keys(state.limits) as Array<
    keyof InferenceControlLimitsV1
  >)
    limits[key] = Math.min(state.limits[key], policy.limits[key]);
  limits.maxRunDurationMs = Math.min(
    limits.maxRunDurationMs,
    policy.maximumRunDurationMs,
  );
  limits.maxAssessmentTtlMs = Math.min(
    limits.maxAssessmentTtlMs,
    policy.maximumAssessmentTtlMs,
  );
  limits.maxGrantTtlMs = Math.min(
    limits.maxGrantTtlMs,
    policy.maximumGrantTtlMs,
  );
  limits.maxMessagePermitTtlMs = Math.min(
    limits.maxMessagePermitTtlMs,
    policy.maximumMessagePermitTtlMs,
  );
  return limits as InferenceControlLimitsV1;
}

/** An accepted assessment is usable only when it exactly closes its request. */
function assessmentAllowsRequest(
  state: InferenceControlStateV1,
  request: AssessmentRequestV1,
): boolean {
  return state.assessments.some(
    (assessment) =>
      assessment.assessmentRequestId === request.assessmentRequestId &&
      assessment.disposition === 'allow' &&
      assessment.requestGeneration === request.requestGeneration &&
      assessment.runId === request.runId &&
      assessment.tenantId === request.tenantId &&
      assessment.policyId === request.policyId &&
      assessment.policyVersion === request.policyVersion &&
      assessment.checkpoint === request.checkpoint &&
      assessment.assessorId === request.assessorId &&
      assessment.assessorVersion === request.assessorVersion &&
      assessment.targetKind === request.targetKind &&
      assessment.targetDigest === request.targetDigest &&
      assessment.zoneDigest === request.zoneDigest &&
      assessment.provenanceDigest === request.provenanceDigest &&
      canonicalizeControlJsonV1(assessment.scope) ===
        canonicalizeControlJsonV1(request.scope),
  );
}

/**
 * Derives the only currently unreleased window an accepted assessment may
 * authorise.  There is no caller-controlled byte or sequence range here.
 */
function releaseWindowForAssessment(
  state: InferenceControlStateV1,
  request: AssessmentRequestV1,
  assessment: InferenceAssessmentV1,
) {
  if (assessment.disposition !== 'allow') return null;
  const run = currentRun(state, request.runId);
  const policy = run
    ? state.policies.find((record) => record.policyDigest === run.policyDigest)
        ?.policy
    : undefined;
  if (!run || !policy || policy.mode === 'observe') return null;
  const streams = state.streams.filter(
    (stream) =>
      stream.runId === run.runId && stream.generation === run.generation,
  );
  if (
    policy.mode === 'incremental' &&
    request.checkpoint === 'stream' &&
    request.targetKind === 'stream_window' &&
    policy.checkpoints.includes('stream')
  ) {
    for (const stream of streams) {
      const chunks = state.streamChunks.filter(
        (chunk) =>
          chunk.streamId === stream.streamId &&
          chunk.generation === stream.generation &&
          chunk.sequence > stream.releasedThroughSequence,
      );
      for (let end = 1; end <= chunks.length; end += 1) {
        const window = createStreamWindowV1(stream, chunks.slice(0, end));
        if (
          window.windowDigest === assessment.targetDigest &&
          window.utf8Bytes <=
            effectiveLimitsForRun(state, run).maxPendingWindowBytes
        )
          return { stream, window };
      }
    }
    return null;
  }
  if (
    policy.mode === 'buffered' &&
    request.checkpoint === 'post_run' &&
    request.targetKind === 'final_output' &&
    policy.checkpoints.includes('post_run') &&
    run.outputDigest === assessment.targetDigest
  ) {
    for (const stream of streams) {
      if (stream.status !== 'completed') continue;
      const chunks = state.streamChunks.filter(
        (chunk) =>
          chunk.streamId === stream.streamId &&
          chunk.generation === stream.generation &&
          chunk.sequence > stream.releasedThroughSequence,
      );
      if (!chunks.length) continue;
      const window = createStreamWindowV1(stream, chunks);
      if (
        window.utf8Bytes <=
        effectiveLimitsForRun(state, run).maxPendingWindowBytes
      )
        return { stream, window };
    }
  }
  return null;
}

function replaceRun(
  state: InferenceControlStateV1,
  runId: string,
  patch: Partial<ControlRunRecordV1>,
): readonly ControlRunRecordV1[] {
  return state.runs.map((run) =>
    run.runId === runId ? { ...run, ...patch } : run,
  );
}

function withState(
  state: InferenceControlStateV1,
  patch: Partial<InferenceControlStateV1>,
  logicalTimeMs: number,
): InferenceControlStateV1 {
  const {
    traceDigest: _traceDigest,
    encodedBytes: _encodedBytes,
    ...material
  } = {
    ...state,
    ...patch,
    stateGeneration: state.stateGeneration + 1,
    logicalTimeHighWaterMs: Math.max(
      state.logicalTimeHighWaterMs,
      logicalTimeMs,
    ),
  };
  return finalizeInferenceControlStateV1(material);
}

function accept(
  state: InferenceControlStateV1,
  effects: readonly InferenceControlEffectV1[] = [],
): InferenceControlReductionV1 {
  return deepFreeze({ accepted: true, state, effects: [...effects] });
}

function unchanged(
  state: InferenceControlStateV1,
  reasonCode: InferenceControlReasonCodeV1,
): InferenceControlReductionV1 {
  return deepFreeze({ accepted: false, reasonCode, state, effects: [] });
}

function reject(
  state: InferenceControlStateV1,
  reasonCode: InferenceControlReasonCodeV1,
  logicalTimeMs: number,
  outcome: DiagnosticV1['outcome'] = 'withheld',
  runId: string | null = null,
): InferenceControlReductionV1 {
  const diagnostic: DiagnosticV1 = {
    schemaVersion: 1,
    diagnosticId: `diagnostic:${state.stateGeneration + 1}:${state.diagnostics.length + 1}`,
    logicalTimeMs,
    runId,
    checkpoint: null,
    reasonCode,
    outcome,
    sizeBucket: 0,
    correlationId: null,
  };
  // A rejection must not evict prior audit evidence.  If the state cannot
  // accommodate another diagnostic, preserve it verbatim and fail closed.
  if (state.diagnostics.length >= state.limits.maxDiagnostics)
    return unchanged(state, reasonCode);
  let next: InferenceControlStateV1;
  try {
    next = withState(
      state,
      { diagnostics: [...state.diagnostics, diagnostic] },
      logicalTimeMs,
    );
  } catch {
    return unchanged(state, reasonCode);
  }
  return deepFreeze({
    accepted: false,
    reasonCode,
    state: next,
    effects: [
      effect(next, runId ?? 'control', 'emit_diagnostic', { diagnostic }),
    ],
  });
}

function effect<T extends InferenceControlEffectV1['type']>(
  state: InferenceControlStateV1,
  runId: string,
  type: T,
  payload: Omit<
    Extract<InferenceControlEffectV1, { type: T }>,
    'schemaVersion' | 'effectId' | 'runId' | 'generation' | 'type'
  >,
): Extract<InferenceControlEffectV1, { type: T }> {
  return deepFreeze({
    schemaVersion: 1,
    effectId: `effect:${state.stateGeneration}:${type}:${runId}`,
    runId,
    generation:
      state.runs.find((run) => run.runId === runId)?.generation ??
      state.stateGeneration,
    type,
    ...payload,
  } as Extract<InferenceControlEffectV1, { type: T }>);
}

function updateActionOutcome(
  state: InferenceControlStateV1,
  grantId: string,
  outcome: InferenceControlStateV1['actionIdempotency'][number]['retainedOutcome'],
): InferenceControlStateV1['actionIdempotency'] {
  return state.actionIdempotency.map((record) =>
    record.grantId === grantId
      ? { ...record, retainedOutcome: outcome }
      : record,
  );
}

function updateMessageOutcome(
  state: InferenceControlStateV1,
  messageAttemptId: string,
  outcome: InferenceControlStateV1['messageIdempotency'][number]['retainedOutcome'],
): InferenceControlStateV1['messageIdempotency'] {
  return state.messageIdempotency.map((record) =>
    record.messageAttemptId === messageAttemptId
      ? { ...record, retainedOutcome: outcome }
      : record,
  );
}

function fenceRunPermissions(
  state: InferenceControlStateV1,
  runId: string,
): Pick<
  InferenceControlStateV1,
  'grants' | 'actionIdempotency' | 'messageAttempts' | 'messageIdempotency'
> {
  const grants = state.grants.map((grant) => {
    if (grant.runId !== runId) return grant;
    if (grant.status === 'issued')
      return {
        ...grant,
        stateGeneration: grant.stateGeneration + 1,
        status: 'expired' as const,
      };
    if (grant.status === 'reserved')
      return {
        ...grant,
        stateGeneration: grant.stateGeneration + 1,
        status: 'indeterminate' as const,
      };
    return grant;
  });
  const messageAttempts = state.messageAttempts.map((attempt) => {
    if (attempt.runId !== runId) return attempt;
    if (attempt.status === 'prepared')
      return {
        ...attempt,
        generation: attempt.generation + 1,
        status: 'expired' as const,
      };
    if (attempt.status === 'reserved')
      return {
        ...attempt,
        generation: attempt.generation + 1,
        status: 'indeterminate' as const,
      };
    return attempt;
  });
  return {
    grants,
    actionIdempotency: state.actionIdempotency.map((record) => ({
      ...record,
      retainedOutcome:
        grants.find((grant) => grant.grantId === record.grantId)?.status ??
        record.retainedOutcome,
    })),
    messageAttempts,
    messageIdempotency: state.messageIdempotency.map((record) => ({
      ...record,
      retainedOutcome:
        messageAttempts.find(
          (attempt) => attempt.messageAttemptId === record.messageAttemptId,
        )?.status ?? record.retainedOutcome,
    })),
  };
}

function sorted<T>(
  items: readonly T[],
  key: (item: T) => string,
): readonly T[] {
  return [...items].sort((left, right) =>
    compareCodeUnits(key(left), key(right)),
  );
}

function reasonFromError(error: unknown): InferenceControlReasonCodeV1 {
  const message = error instanceof Error ? error.message : '';
  const values: readonly InferenceControlReasonCodeV1[] = [
    'context_zone_invalid',
    'context_promotion_denied',
    'context_limit_exceeded',
    'policy_capability_missing',
    'assessment_required',
    'assessment_invalid',
    'assessment_indeterminate',
    'assessment_expired',
    'assessment_scope_mismatch',
    'assessment_content_mismatch',
    'assessment_budget_exhausted',
    'release_mode_incompatible',
    'release_buffer_exceeded',
    'stream_abort_unavailable',
    'action_not_permitted',
    'grant_missing',
    'grant_expired',
    'grant_consumed',
    'grant_scope_mismatch',
    'grant_action_mismatch',
    'grant_input_mismatch',
    'grant_assessment_mismatch',
    'grant_epoch_stale',
    'grant_fence_stale',
    'grant_idempotency_conflict',
    'gateway_unavailable',
    'downstream_fence_rejected',
    'downstream_indeterminate',
    'state_capacity_exceeded',
    'state_conflict',
    'logical_time_rollback',
    'assessment_unsolicited',
    'assessment_assessor_mismatch',
    'assessment_generation_stale',
    'stream_sequence_invalid',
    'stream_content_mismatch',
    'message_not_permitted',
    'message_indeterminate',
    'message_idempotency_conflict',
    'dependency_rebind_failed',
  ];
  return values.includes(message as InferenceControlReasonCodeV1)
    ? (message as InferenceControlReasonCodeV1)
    : 'state_conflict';
}

function runIdOf(input: InferenceControlInputV1): string | null {
  if ('runId' in input && typeof input.runId === 'string') return input.runId;
  if ('run' in input) return input.run.runId;
  if ('entry' in input) return input.entry.runId;
  if ('request' in input) return input.request.runId;
  if ('assessment' in input) return input.assessment.runId;
  if ('grant' in input) return input.grant.runId;
  if ('attempt' in input) return input.attempt.runId;
  return null;
}
