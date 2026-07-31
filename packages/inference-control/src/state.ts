import type { JsonValue } from '@agentplat/core';

import {
  validateAssessmentRequestV1,
  validateInferenceAssessmentV1,
} from './assessments.js';
import {
  canonicalizeControlJsonV1,
  digestControlJsonV1,
  utf8ByteLength,
} from './canonical.js';
import { validateContextEntryV1 } from './context.js';
import { assertPolicyNarrowingV1, createPolicyRecordV1 } from './policy.js';
import { validateControlScopeV1 } from './scopes.js';
import {
  validateActionGrantStateV1,
  validateActionIdempotencyRecordV1,
  validateDependencyBindingRecordV1,
  validateDiagnosticV1,
  validateMessageIdempotencyRecordV1,
  validateOutboundMessageAttemptStateV1,
} from './state-records.js';
import {
  validateControlStreamChunkV1,
  validateControlStreamV1,
} from './streams.js';
import type {
  DependencyBindingRecordV1,
  InferenceAssessmentV1,
  InferenceControlLimitsV1,
  InferenceControlSnapshotV1,
  InferenceControlStateV1,
  RedactedInferenceControlEvidenceV1,
} from './types.js';
import {
  INFERENCE_CONTROL_LIMITS_V1,
  assertDigest,
  assertExactKeys,
  assertOneOf,
  assertSafeInteger,
  assertStrictJsonValue,
  assertString,
  deepFreeze,
  isInferenceControlReasonCodeV1,
} from './validation.js';

const STATE_KEYS = [
  'schemaVersion',
  'stateId',
  'tenantId',
  'stateGeneration',
  'logicalTimeHighWaterMs',
  'limits',
  'policies',
  'policyHeads',
  'dependencyBindings',
  'runs',
  'contextEntries',
  'assessmentRequests',
  'assessments',
  'streams',
  'streamChunks',
  'grants',
  'actionIdempotency',
  'messageAttempts',
  'messageIdempotency',
  'diagnostics',
  'traceDigest',
  'encodedBytes',
] as const;

const STATE_ARRAY_KEYS = [
  'policies',
  'policyHeads',
  'dependencyBindings',
  'runs',
  'contextEntries',
  'assessmentRequests',
  'assessments',
  'streams',
  'streamChunks',
  'grants',
  'actionIdempotency',
  'messageAttempts',
  'messageIdempotency',
  'diagnostics',
] as const;

export interface DependencyRebinderV1 {
  rebind(binding: DependencyBindingRecordV1): boolean;
}

export function createInferenceControlStateV1(input: {
  stateId: string;
  tenantId: string;
  logicalTimeMs?: number;
}): InferenceControlStateV1 {
  assertString(input.stateId, 'stateId');
  assertString(input.tenantId, 'tenantId');
  const logicalTimeHighWaterMs = input.logicalTimeMs ?? 0;
  assertSafeInteger(logicalTimeHighWaterMs, 'logicalTimeMs');
  return finalizeState({
    schemaVersion: 1,
    stateId: input.stateId,
    tenantId: input.tenantId,
    stateGeneration: 1,
    logicalTimeHighWaterMs,
    limits: INFERENCE_CONTROL_LIMITS_V1,
    policies: [],
    policyHeads: [],
    dependencyBindings: [],
    runs: [],
    contextEntries: [],
    assessmentRequests: [],
    assessments: [],
    streams: [],
    streamChunks: [],
    grants: [],
    actionIdempotency: [],
    messageAttempts: [],
    messageIdempotency: [],
    diagnostics: [],
  });
}

export function restoreInferenceControlStateV1(
  value: unknown,
  rebinder?: DependencyRebinderV1,
): InferenceControlStateV1 {
  assertStrictJsonValue(value);
  assertExactKeys(value, STATE_KEYS, 'state');
  const state = value as unknown as InferenceControlStateV1;
  validateEncodedState(state, rebinder);
  const restored = normalizeState(state);
  let transformed = false;
  const grants = restored.grants.map((grant) => {
    if (grant.status !== 'reserved') return grant;
    transformed = true;
    return {
      ...grant,
      stateGeneration: grant.stateGeneration + 1,
      status: 'indeterminate' as const,
    };
  });
  const messageAttempts = restored.messageAttempts.map((attempt) => {
    if (attempt.status !== 'reserved') return attempt;
    transformed = true;
    return {
      ...attempt,
      generation: attempt.generation + 1,
      status: 'indeterminate' as const,
    };
  });
  return transformed
    ? finalizeState({
        ...stateMaterial(restored),
        grants,
        messageAttempts,
        actionIdempotency: restored.actionIdempotency.map((record) => ({
          ...record,
          retainedOutcome:
            grants.find((grant) => grant.grantId === record.grantId)?.status ??
            record.retainedOutcome,
        })),
        messageIdempotency: restored.messageIdempotency.map((record) => ({
          ...record,
          retainedOutcome:
            messageAttempts.find(
              (attempt) => attempt.messageAttemptId === record.messageAttemptId,
            )?.status ?? record.retainedOutcome,
        })),
        stateGeneration: restored.stateGeneration + 1,
      })
    : restored;
}

export function createInferenceControlSnapshotV1(input: {
  snapshotId: string;
  createdAtLogicalMs: number;
  state: InferenceControlStateV1;
}): InferenceControlSnapshotV1 {
  assertString(input.snapshotId, 'snapshotId');
  assertSafeInteger(input.createdAtLogicalMs, 'createdAtLogicalMs');
  validateEncodedState(input.state, { rebind: () => true });
  const state = normalizeState(input.state);
  return deepFreeze({
    schemaVersion: 1,
    snapshotId: input.snapshotId,
    createdAtLogicalMs: input.createdAtLogicalMs,
    state,
    stateDigest: state.traceDigest,
  });
}

export function restoreInferenceControlSnapshotV1(
  value: unknown,
  rebinder?: DependencyRebinderV1,
): InferenceControlSnapshotV1 {
  assertStrictJsonValue(value);
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'snapshotId',
      'createdAtLogicalMs',
      'state',
      'stateDigest',
    ],
    'snapshot',
  );
  const snapshot = value as unknown as InferenceControlSnapshotV1;
  if (snapshot.schemaVersion !== 1)
    throw new TypeError('Unsupported snapshot schema');
  assertString(snapshot.snapshotId, 'snapshotId');
  assertSafeInteger(snapshot.createdAtLogicalMs, 'createdAtLogicalMs');
  assertDigest(snapshot.stateDigest, 'stateDigest');
  if (snapshot.stateDigest !== snapshot.state.traceDigest)
    throw new TypeError('state_conflict');
  const state = restoreInferenceControlStateV1(snapshot.state, rebinder);
  return deepFreeze({ ...snapshot, state, stateDigest: state.traceDigest });
}

export function createRedactedInferenceControlEvidenceV1(
  state: InferenceControlStateV1,
): RedactedInferenceControlEvidenceV1 {
  validateEncodedState(state, { rebind: () => true });
  return deepFreeze({
    schemaVersion: 1,
    stateId: state.stateId,
    tenantId: state.tenantId,
    stateGeneration: state.stateGeneration,
    logicalTimeHighWaterMs: state.logicalTimeHighWaterMs,
    traceDigest: state.traceDigest,
    counts: {
      policies: state.policies.length,
      runs: state.runs.length,
      contextEntries: state.contextEntries.length,
      assessments: state.assessments.length,
      streams: state.streams.length,
      grants: state.grants.length,
      messageAttempts: state.messageAttempts.length,
    },
    diagnostics: state.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    restorable: false,
  });
}

export function finalizeInferenceControlStateV1(
  material: Omit<InferenceControlStateV1, 'traceDigest' | 'encodedBytes'>,
): InferenceControlStateV1 {
  return finalizeState(material);
}

function validateEncodedState(
  state: InferenceControlStateV1,
  rebinder?: DependencyRebinderV1,
): void {
  validateStateTopology(state, rebinder);
  const material = stateMaterial(state);
  const expectedDigest = digestControlJsonV1(
    'state',
    material as unknown as JsonValue,
  );
  const expectedBytes = utf8ByteLength(
    canonicalizeControlJsonV1(material as unknown as JsonValue),
  );
  if (
    state.traceDigest !== expectedDigest ||
    state.encodedBytes !== expectedBytes
  )
    throw new TypeError('state_conflict');
}

function validateStateTopology(
  state: InferenceControlStateV1,
  rebinder?: DependencyRebinderV1,
): void {
  if (state.schemaVersion !== 1)
    throw new TypeError('Unsupported state schema');
  assertString(state.stateId, 'stateId');
  assertString(state.tenantId, 'tenantId');
  assertSafeInteger(state.stateGeneration, 'stateGeneration', 1);
  assertSafeInteger(state.logicalTimeHighWaterMs, 'logicalTimeHighWaterMs');
  assertSafeInteger(state.encodedBytes, 'encodedBytes');
  assertDigest(state.traceDigest, 'traceDigest');
  assertExactKeys(
    state.limits,
    Object.keys(INFERENCE_CONTROL_LIMITS_V1),
    'state limits',
  );
  for (const key of Object.keys(INFERENCE_CONTROL_LIMITS_V1) as Array<
    keyof typeof INFERENCE_CONTROL_LIMITS_V1
  >) {
    assertSafeInteger(state.limits[key], `limits.${key}`, 1);
    if (state.limits[key] > INFERENCE_CONTROL_LIMITS_V1[key])
      throw new TypeError('state_capacity_exceeded');
  }
  for (const key of STATE_ARRAY_KEYS)
    if (!Array.isArray(state[key]))
      throw new TypeError(`${key} must be an array`);

  assertSortedUnique(
    state.policies.map((record) => record.policyDigest),
    'policy digest',
  );
  assertSortedUnique(
    state.policyHeads.map((head) => head.policyId),
    'policy head',
  );
  assertSortedUnique(
    state.dependencyBindings.map(
      (binding) =>
        `${binding.kind}\u0000${binding.bindingId}\u0000${binding.bindingVersion}`,
    ),
    'dependency binding',
  );
  for (const binding of state.dependencyBindings)
    validateDependencyBindingRecordV1(binding);
  assertSortedUnique(
    state.runs.map((run) => run.runId),
    'run ID',
  );
  assertSortedUnique(
    state.contextEntries.map((entry) => entry.contextEntryId),
    'context ID',
  );

  const policyDigests = new Set(
    state.policies.map((record) => record.policyDigest),
  );
  for (const record of state.policies) {
    const rebuilt = createPolicyRecordV1(record.policy);
    if (rebuilt.policyDigest !== record.policyDigest)
      throw new TypeError('state_conflict');
    if (record.policy.parentPolicyDigest !== null) {
      const parent = state.policies.find(
        (candidate) =>
          candidate.policyDigest === record.policy.parentPolicyDigest,
      );
      if (!parent) throw new TypeError('state_conflict');
      assertPolicyNarrowingV1(parent.policy, record.policy);
    }
  }
  for (const head of state.policyHeads) {
    const policy = state.policies.find(
      (record) => record.policyDigest === head.policyDigest,
    );
    if (
      head.schemaVersion !== 1 ||
      !policy ||
      policy.policy.policyId !== head.policyId ||
      policy.policy.policyVersion !== head.policyVersion ||
      state.policies.some(
        (candidate) =>
          candidate.policy.policyId === head.policyId &&
          candidate.policy.policyVersion > head.policyVersion,
      )
    )
      throw new TypeError('state_conflict');
  }

  const runIds = new Set(state.runs.map((run) => run.runId));
  for (const run of state.runs) {
    validateRunRecord(run);
    const policy = state.policies.find(
      (record) => record.policyDigest === run.policyDigest,
    )?.policy;
    const capabilityBinding =
      run.capabilityHandleId === null
        ? undefined
        : state.dependencyBindings.find(
            (binding) =>
              binding.kind === 'capability' &&
              binding.bindingId === run.capabilityHandleId &&
              binding.bindingDigest === run.capabilityDescriptorDigest,
          );
    const capabilityRequired = [
      'input_assessed',
      'executing',
      'buffering',
      'streaming',
      'output_assessed',
      'completed',
    ].includes(run.phase);
    if (
      run.tenantId !== state.tenantId ||
      !policy ||
      !policyDigests.has(run.policyDigest) ||
      (run.phase === 'created' && run.capabilityHandleId !== null) ||
      (run.capabilityHandleId !== null && !capabilityBinding) ||
      (capabilityRequired && !capabilityBinding) ||
      (capabilityRequired &&
        !policy.allowedCapabilityBindings.some(
          (binding) =>
            binding.descriptorDigest === run.capabilityDescriptorDigest,
        )) ||
      run.deadlineAtLogicalMs - run.createdAtLogicalMs >
        effectiveLimitsForRunState(state, run).maxRunDurationMs ||
      run.dispositionCounts.revisions >
        Math.min(policy.budgets.revisions, state.limits.maxRevisionsPerRun) ||
      run.dispositionCounts.retries >
        Math.min(policy.budgets.retries, state.limits.maxRetriesPerRun) ||
      run.dispositionCounts.challenges >
        Math.min(policy.budgets.challenges, state.limits.maxChallengesPerRun)
    )
      throw new TypeError('state_conflict');
  }
  for (const source of state.contextEntries) {
    const entry = validateContextEntryV1(source);
    if (!runIds.has(entry.runId) || entry.tenantId !== state.tenantId)
      throw new TypeError('state_conflict');
  }
  for (const run of state.runs) {
    const limits = effectiveLimitsForRunState(state, run);
    const policy = state.policies.find(
      (record) => record.policyDigest === run.policyDigest,
    )!.policy;
    const entries = state.contextEntries.filter(
      (entry) => entry.runId === run.runId,
    );
    if (
      entries.length > limits.maxContextEntriesPerRun ||
      entries.some(
        (entry) =>
          entry.encodedBytes > limits.maxContextEntryBytes ||
          !policy.allowedContextZones.includes(entry.zone),
      ) ||
      entries.reduce((total, entry) => total + entry.encodedBytes, 0) >
        limits.maxContextBytesPerRun
    )
      throw new TypeError('state_capacity_exceeded');
  }

  assertSortedUnique(
    state.assessmentRequests.map((request) => request.assessmentRequestId),
    'assessment request ID',
  );
  const requests = new Map(
    state.assessmentRequests.map((source) => {
      const preliminary = validateAssessmentRequestV1(source, state.limits);
      const run = state.runs.find((item) => item.runId === preliminary.runId);
      const request = run
        ? validateAssessmentRequestV1(
            source,
            effectiveLimitsForRunState(state, run),
          )
        : preliminary;
      const policyRecord = run
        ? state.policies.find((item) => item.policyDigest === run.policyDigest)
        : undefined;
      const assessorBinding = policyRecord?.policy.assessmentBindings.find(
        (binding) => binding.checkpoint === request.checkpoint,
      );
      if (
        !run ||
        !policyRecord ||
        request.tenantId !== state.tenantId ||
        request.policyId !== policyRecord.policy.policyId ||
        request.policyVersion !== policyRecord.policy.policyVersion ||
        request.requestGeneration > run.generation ||
        (request.status === 'pending' &&
          request.requestGeneration !== run.generation) ||
        request.expiresAtLogicalMs > run.deadlineAtLogicalMs ||
        !assessorBinding ||
        request.assessorId !== assessorBinding.assessorId ||
        request.assessorVersion !== assessorBinding.assessorVersion ||
        request.contextEntryIds.some(
          (id) =>
            !state.contextEntries.some((entry) => entry.contextEntryId === id),
        )
      )
        throw new TypeError('state_conflict');
      return [request.assessmentRequestId, request] as const;
    }),
  );
  assertSortedUnique(
    state.assessments.map((assessment) => assessment.assessmentId),
    'assessment ID',
  );
  for (const source of state.assessments) {
    const preliminary = validateInferenceAssessmentV1(source, state.limits);
    const run = state.runs.find((item) => item.runId === preliminary.runId);
    const assessment = run
      ? validateInferenceAssessmentV1(
          source,
          effectiveLimitsForRunState(state, run),
        )
      : preliminary;
    const request = requests.get(assessment.assessmentRequestId);
    const policy = run
      ? state.policies.find(
          (record) => record.policyDigest === run.policyDigest,
        )?.policy
      : undefined;
    const binding = policy?.assessmentBindings.find(
      (candidate) => candidate.checkpoint === assessment.checkpoint,
    );
    if (
      !request ||
      !binding ||
      !assessmentIdentityMatches(request, assessment) ||
      assessment.evidenceReferences.length >
        binding.maximumEvidenceReferences ||
      utf8ByteLength(
        canonicalizeControlJsonV1(assessment as unknown as JsonValue),
      ) > binding.maximumResponseBytes
    )
      throw new TypeError('state_conflict');
  }
  if (
    state.runs.some(
      (run) =>
        state.assessments.filter((assessment) => assessment.runId === run.runId)
          .length >
          effectiveLimitsForRunState(state, run).maxAssessmentsPerRun ||
        state.assessmentRequests.filter(
          (request) => request.runId === run.runId,
        ).length > effectiveLimitsForRunState(state, run).maxAssessmentsPerRun,
    )
  )
    throw new TypeError('state_capacity_exceeded');
  for (const request of state.assessmentRequests) {
    const count = state.assessments.filter(
      (assessment) =>
        assessment.assessmentRequestId === request.assessmentRequestId,
    ).length;
    if (
      (request.status === 'accepted' && count !== 1) ||
      (request.status !== 'accepted' && count !== 0)
    )
      throw new TypeError('state_conflict');
  }

  assertSortedUnique(
    state.streams.map((stream) => stream.streamId),
    'stream ID',
  );
  for (const source of state.streams) {
    const stream = validateControlStreamV1(source);
    const run = state.runs.find((item) => item.runId === stream.runId);
    if (
      !run ||
      stream.generation > run.generation ||
      (stream.status === 'open' && stream.generation !== run.generation)
    )
      throw new TypeError('state_conflict');
  }
  let priorChunkKey: string | undefined;
  for (const source of state.streamChunks) {
    const preliminary = validateControlStreamChunkV1(source, state.limits);
    const stream = state.streams.find(
      (item) => item.streamId === preliminary.streamId,
    );
    const run = stream
      ? state.runs.find((item) => item.runId === stream.runId)
      : undefined;
    const chunk = run
      ? validateControlStreamChunkV1(
          source,
          effectiveLimitsForRunState(state, run),
        )
      : preliminary;
    if (!stream || !run) throw new TypeError('state_conflict');
    const key = `${chunk.streamId}\u0000${String(chunk.generation).padStart(16, '0')}\u0000${String(chunk.sequence).padStart(16, '0')}`;
    if (priorChunkKey !== undefined && priorChunkKey >= key)
      throw new TypeError('Duplicate or unsorted stream chunk');
    priorChunkKey = key;
  }
  for (const stream of state.streams) {
    const run = state.runs.find((item) => item.runId === stream.runId)!;
    const limits = effectiveLimitsForRunState(state, run);
    const chunks = state.streamChunks.filter(
      (chunk) =>
        chunk.streamId === stream.streamId &&
        chunk.generation === stream.generation,
    );
    if (
      chunks.length !== stream.nextSequence ||
      chunks.some(
        (chunk, index) =>
          chunk.sequence !== index ||
          chunk.fromByte !==
            (index === 0 ? 0 : chunks[index - 1]!.throughByteExclusive),
      ) ||
      stream.receivedBytes !==
        (chunks.length === 0
          ? 0
          : chunks[chunks.length - 1]!.throughByteExclusive) ||
      stream.releasedThroughSequence >= stream.nextSequence ||
      stream.receivedBytes > limits.maxBufferedOutputBytes ||
      stream.receivedBytes - stream.releasedBytes >
        (state.policies.find(
          (record) => record.policyDigest === run.policyDigest,
        )!.policy.mode === 'incremental'
          ? limits.maxPendingWindowBytes
          : limits.maxBufferedOutputBytes)
    )
      throw new TypeError('stream_sequence_invalid');
  }
  for (const run of state.runs) {
    const limits = effectiveLimitsForRunState(state, run);
    const runStreams = new Set(
      state.streams
        .filter((stream) => stream.runId === run.runId)
        .map((stream) => stream.streamId),
    );
    if (
      state.streamChunks.filter((chunk) => runStreams.has(chunk.streamId))
        .length > limits.maxOutputChunksPerRun
    )
      throw new TypeError('state_capacity_exceeded');
  }

  assertSortedUnique(
    state.grants.map((grant) => grant.grantId),
    'grant ID',
  );
  for (const grant of state.grants) {
    const run = state.runs.find((item) => item.runId === grant.runId);
    validateActionGrantStateV1(
      grant,
      run ? effectiveLimitsForRunState(state, run) : state.limits,
    );
    const request = requests.get(grant.assessmentRequestId);
    const assessment = state.assessments.find(
      (item) => item.assessmentId === grant.assessmentId,
    );
    if (
      !run ||
      !request ||
      !assessment ||
      request.checkpoint !== 'pre_tool' ||
      assessment.disposition !== 'allow' ||
      request.targetDigest !== grant.assessmentTargetDigest ||
      canonicalizeControlJsonV1(request.scope) !==
        canonicalizeControlJsonV1(grant.scope) ||
      grant.scope.runId !== run.runId ||
      grant.scope.tenantId !== run.tenantId ||
      grant.expiresAtLogicalMs > run.deadlineAtLogicalMs ||
      grant.expiresAtLogicalMs > assessment.expiresAtLogicalMs ||
      (grant.scope.kind === 'coordinated' &&
        grant.expiresAtLogicalMs > grant.scope.leaseExpiresAtLogicalMs)
    )
      throw new TypeError('state_conflict');
  }
  if (
    state.grants.length > state.limits.maxRetainedGrantRecords ||
    state.grants.filter((grant) =>
      ['issued', 'reserved'].includes(grant.status),
    ).length > state.limits.maxActiveGrants
  )
    throw new TypeError('state_capacity_exceeded');
  for (const run of state.runs) {
    const limits = effectiveLimitsForRunState(state, run);
    const grants = state.grants.filter((grant) => grant.runId === run.runId);
    if (
      grants.length > limits.maxRetainedGrantRecords ||
      grants.filter((grant) => ['issued', 'reserved'].includes(grant.status))
        .length > limits.maxActiveGrants
    )
      throw new TypeError('state_capacity_exceeded');
  }
  assertSortedUnique(
    state.actionIdempotency.map(
      (record) => `${record.scopeDigest}\u0000${record.idempotencyKey}`,
    ),
    'action idempotency key',
  );
  for (const record of state.actionIdempotency) {
    validateActionIdempotencyRecordV1(record);
    const grant = state.grants.find((item) => item.grantId === record.grantId);
    if (
      !grant ||
      grant.scopeDigest !== record.scopeDigest ||
      grant.actionDigest !== record.actionDigest ||
      grant.status !== record.retainedOutcome
    )
      throw new TypeError('state_conflict');
  }
  for (const grant of state.grants)
    if (
      state.actionIdempotency.filter(
        (record) => record.grantId === grant.grantId,
      ).length !== 1
    )
      throw new TypeError('state_conflict');

  assertSortedUnique(
    state.messageAttempts.map((attempt) => attempt.messageAttemptId),
    'message attempt ID',
  );
  for (const attempt of state.messageAttempts) {
    validateOutboundMessageAttemptStateV1(attempt);
    const run = state.runs.find((item) => item.runId === attempt.runId);
    const request = requests.get(attempt.assessmentRequestId);
    const assessment = state.assessments.find(
      (item) => item.assessmentId === attempt.assessmentId,
    );
    if (
      !run ||
      !request ||
      !assessment ||
      request.checkpoint !== 'pre_message' ||
      assessment.disposition !== 'allow' ||
      request.targetDigest !== attempt.messageDigest ||
      request.scope === null ||
      digestControlJsonV1('scope', request.scope) !== attempt.scopeDigest ||
      attempt.expiresAtLogicalMs > run.deadlineAtLogicalMs ||
      attempt.expiresAtLogicalMs > assessment.expiresAtLogicalMs ||
      (request.scope.kind === 'coordinated' &&
        attempt.expiresAtLogicalMs > request.scope.leaseExpiresAtLogicalMs) ||
      attempt.expiresAtLogicalMs - attempt.preparedAtLogicalMs >
        effectiveLimitsForRunState(state, run).maxMessagePermitTtlMs
    )
      throw new TypeError('state_conflict');
  }
  if (
    state.messageAttempts.length > state.limits.maxRetainedMessageAttempts ||
    state.messageAttempts.filter((attempt) =>
      ['prepared', 'reserved'].includes(attempt.status),
    ).length > state.limits.maxActiveMessageAttempts
  )
    throw new TypeError('state_capacity_exceeded');
  for (const run of state.runs) {
    const limits = effectiveLimitsForRunState(state, run);
    const attempts = state.messageAttempts.filter(
      (attempt) => attempt.runId === run.runId,
    );
    if (
      attempts.length > limits.maxRetainedMessageAttempts ||
      attempts.filter((attempt) =>
        ['prepared', 'reserved'].includes(attempt.status),
      ).length > limits.maxActiveMessageAttempts
    )
      throw new TypeError('state_capacity_exceeded');
  }
  assertSortedUnique(
    state.messageIdempotency.map(
      (record) => `${record.scopeDigest}\u0000${record.idempotencyKey}`,
    ),
    'message idempotency key',
  );
  for (const record of state.messageIdempotency) {
    validateMessageIdempotencyRecordV1(record);
    const attempt = state.messageAttempts.find(
      (item) => item.messageAttemptId === record.messageAttemptId,
    );
    if (
      !attempt ||
      attempt.scopeDigest !== record.scopeDigest ||
      attempt.messageDigest !== record.messageDigest ||
      attempt.status !== record.retainedOutcome
    )
      throw new TypeError('state_conflict');
  }
  for (const attempt of state.messageAttempts)
    if (
      state.messageIdempotency.filter(
        (record) => record.messageAttemptId === attempt.messageAttemptId,
      ).length !== 1
    )
      throw new TypeError('state_conflict');

  if (state.diagnostics.length > state.limits.maxDiagnostics)
    throw new TypeError('state_capacity_exceeded');
  for (const diagnostic of state.diagnostics) validateDiagnosticV1(diagnostic);
  for (const binding of state.dependencyBindings) {
    validateDependencyBindingRecordV1(binding);
    if (!rebinder || !rebinder.rebind(binding))
      throw new TypeError('dependency_rebind_failed');
  }
  for (const run of state.runs) validateRunRelations(state, run);
}

function validateRunRecord(run: InferenceControlStateV1['runs'][number]): void {
  assertExactKeys(
    run,
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
  if (run.schemaVersion !== 1) throw new TypeError('state_conflict');
  assertString(run.runId, 'runId');
  assertString(run.tenantId, 'tenantId');
  assertDigest(run.policyDigest, 'policyDigest');
  assertDigest(run.capabilityDescriptorDigest, 'capabilityDescriptorDigest');
  if (run.capabilityHandleId !== null)
    assertString(run.capabilityHandleId, 'capabilityHandleId');
  if (run.scope !== null) validateControlScopeV1(run.scope);
  assertSafeInteger(run.generation, 'run.generation', 1);
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
    'disposition counts',
  );
  for (const value of Object.values(run.dispositionCounts))
    assertSafeInteger(value, 'disposition count');
  assertSafeInteger(run.releasedBytes, 'releasedBytes');
  if (run.outputDigest !== null) assertDigest(run.outputDigest, 'outputDigest');
  if (
    run.terminalReasonCode !== null &&
    !isInferenceControlReasonCodeV1(run.terminalReasonCode)
  )
    throw new TypeError('state_conflict');
  for (const [label, values] of [
    ['contextEntryIds', run.contextEntryIds],
    ['assessmentRequestIds', run.assessmentRequestIds],
    ['assessmentIds', run.assessmentIds],
    ['streamIds', run.streamIds],
    ['grantIds', run.grantIds],
    ['messageAttemptIds', run.messageAttemptIds],
  ] as const) {
    if (!Array.isArray(values) || new Set(values).size !== values.length)
      throw new TypeError(`${label} must be ordered unique`);
    for (const value of values) assertString(value, label);
  }
}

function validateRunRelations(
  state: InferenceControlStateV1,
  run: InferenceControlStateV1['runs'][number],
): void {
  const relations: Array<[readonly string[], readonly string[]]> = [
    [
      run.contextEntryIds,
      state.contextEntries
        .filter((item) => item.runId === run.runId)
        .map((item) => item.contextEntryId),
    ],
    [
      run.assessmentRequestIds,
      state.assessmentRequests
        .filter((item) => item.runId === run.runId)
        .map((item) => item.assessmentRequestId),
    ],
    [
      run.assessmentIds,
      state.assessments
        .filter((item) => item.runId === run.runId)
        .map((item) => item.assessmentId),
    ],
    [
      run.streamIds,
      state.streams
        .filter((item) => item.runId === run.runId)
        .map((item) => item.streamId),
    ],
    [
      run.grantIds,
      state.grants
        .filter((item) => item.runId === run.runId)
        .map((item) => item.grantId),
    ],
    [
      run.messageAttemptIds,
      state.messageAttempts
        .filter((item) => item.runId === run.runId)
        .map((item) => item.messageAttemptId),
    ],
  ];
  for (const [declared, actual] of relations) {
    if (
      declared.length !== actual.length ||
      declared.some((id) => !actual.includes(id))
    )
      throw new TypeError('state_conflict');
  }
}

function effectiveLimitsForRunState(
  state: InferenceControlStateV1,
  run: InferenceControlStateV1['runs'][number],
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

function assessmentIdentityMatches(
  request: InferenceControlStateV1['assessmentRequests'][number],
  assessment: InferenceAssessmentV1,
): boolean {
  const fields = [
    'assessmentRequestId',
    'requestGeneration',
    'runId',
    'tenantId',
    'policyId',
    'policyVersion',
    'checkpoint',
    'assessorId',
    'assessorVersion',
    'targetKind',
    'targetDigest',
    'zoneDigest',
    'provenanceDigest',
  ] as const;
  return (
    fields.every((field) => request[field] === assessment[field]) &&
    canonicalizeControlJsonV1(request.scope) ===
      canonicalizeControlJsonV1(assessment.scope)
  );
}

function stateMaterial(
  state: InferenceControlStateV1,
): Omit<InferenceControlStateV1, 'traceDigest' | 'encodedBytes'> {
  const {
    traceDigest: _traceDigest,
    encodedBytes: _encodedBytes,
    ...material
  } = state;
  return material;
}

function finalizeState(
  material: Omit<InferenceControlStateV1, 'traceDigest' | 'encodedBytes'>,
): InferenceControlStateV1 {
  const normalized = normalizeControlJson(material) as unknown as Omit<
    InferenceControlStateV1,
    'traceDigest' | 'encodedBytes'
  >;
  const json = normalized as unknown as JsonValue;
  const traceDigest = digestControlJsonV1('state', json);
  const encodedBytes = utf8ByteLength(canonicalizeControlJsonV1(json));
  if (encodedBytes > normalized.limits.maxStateBytes)
    throw new TypeError('state_capacity_exceeded');
  return deepFreeze({ ...normalized, traceDigest, encodedBytes });
}

function normalizeState(
  state: InferenceControlStateV1,
): InferenceControlStateV1 {
  const normalized = normalizeControlJson(
    state,
  ) as unknown as InferenceControlStateV1;
  return deepFreeze({ ...normalized });
}

function normalizeControlJson(value: unknown): JsonValue {
  if (value === null || typeof value !== 'object') return value as JsonValue;
  if (Array.isArray(value)) return value.map(normalizeControlJson);
  const result = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(value).sort())
    result[key] = normalizeControlJson((value as Record<string, unknown>)[key]);
  return result;
}

function assertSortedUnique(values: readonly string[], label: string): void {
  if (values.some((value, index) => index > 0 && values[index - 1]! >= value))
    throw new TypeError(`Duplicate or unsorted ${label}`);
}
