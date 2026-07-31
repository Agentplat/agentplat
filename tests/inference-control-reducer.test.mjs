import assert from 'node:assert/strict';
import test from 'node:test';

const control = await import('../packages/inference-control/dist/index.js');

function policyFixture(descriptorDigest) {
  return {
    schemaVersion: 1,
    policyId: 'policy:reducer',
    policyVersion: 1,
    parentPolicyDigest: null,
    mode: 'buffered',
    outputRisk: 'moderate',
    checkpoints: ['post_run', 'pre_run'],
    requiredCapabilities: [
      { kind: 'final_output_assessment', value: 'full' },
      { kind: 'input_inspection', value: 'full' },
    ],
    minimumCapabilityAssurance: 'verified',
    allowedCapabilityBindings: [
      {
        schemaVersion: 1,
        capabilityId: 'capability:reducer',
        descriptorVersion: 1,
        wrapperId: 'wrapper:reducer',
        wrapperVersion: 1,
        descriptorDigest,
        requiredAssurance: 'reference_tested',
      },
    ],
    allowedContextZones: ['user_untrusted'],
    allowedTransformerBindings: [],
    allowedActions: [],
    allowedMessageChannels: [],
    assessmentBindings: [
      {
        schemaVersion: 1,
        checkpoint: 'post_run',
        assessorId: 'assessor:reducer',
        assessorVersion: 1,
        assessorBindingDigest: `sha256:${'1'.repeat(64)}`,
        maximumResponseBytes: 1024,
        maximumEvidenceReferences: 2,
        timeoutMs: 100,
      },
      {
        schemaVersion: 1,
        checkpoint: 'pre_run',
        assessorId: 'assessor:reducer',
        assessorVersion: 1,
        assessorBindingDigest: `sha256:${'1'.repeat(64)}`,
        maximumResponseBytes: 1024,
        maximumEvidenceReferences: 2,
        timeoutMs: 100,
      },
    ],
    budgets: { revisions: 1, retries: 1, challenges: 1 },
    limits: control.INFERENCE_CONTROL_LIMITS_V1,
    maximumRunDurationMs: 1_000,
    maximumAssessmentTtlMs: 100,
    maximumGrantTtlMs: 100,
    maximumMessagePermitTtlMs: 100,
    exhaustedDisposition: 'deny',
    coordinatedActionsRequired: false,
    diagnosticsPolicyId: 'diagnostics:reducer',
    redactionPolicyId: 'redaction:reducer',
  };
}

function reduce(state, input, dependencies) {
  return control.reduceInferenceControlStateV1(
    state,
    {
      schemaVersion: 1,
      expectedStateGeneration: state.stateGeneration,
      ...input,
    },
    dependencies,
  );
}

test('pure reducer correlates assessments, fences rollback, and rejects sequence gaps', () => {
  const registry = new control.CapabilityRegistryV1();
  const descriptor = {
    schemaVersion: 1,
    capabilityId: 'capability:reducer',
    descriptorVersion: 1,
    inputInspection: 'full',
    finalOutputAssessment: 'full',
    incrementalOutputAssessment: 'none',
    releaseInterruption: 'local',
    toolInterception: 'none',
    messageInterception: 'none',
    representationAccess: 'none',
    declarationSource: 'wrapper',
    assurance: 'reference_tested',
    wrapperId: 'wrapper:reducer',
    wrapperVersion: 1,
  };
  const handle = registry.register({
    descriptor,
    wrapperInstanceId: 'instance:reducer',
  });
  const policy = policyFixture(handle.descriptorDigest);
  const policyRecord = control.createPolicyRecordV1(policy);
  let state = control.createInferenceControlStateV1({
    stateId: 'state:reducer',
    tenantId: 'tenant:reducer',
  });
  let result = reduce(state, {
    inputId: 'input:policy',
    type: 'policy_registered',
    policy,
    policyDigest: policyRecord.policyDigest,
    logicalTimeMs: 0,
  });
  assert.equal(result.accepted, true);
  state = result.state;

  const run = {
    schemaVersion: 1,
    runId: 'run:reducer',
    tenantId: 'tenant:reducer',
    policyDigest: policyRecord.policyDigest,
    capabilityDescriptorDigest: handle.descriptorDigest,
    capabilityHandleId: null,
    scope: null,
    generation: 1,
    phase: 'created',
    createdAtLogicalMs: 0,
    deadlineAtLogicalMs: 1_000,
    dispositionCounts: { revisions: 0, retries: 0, challenges: 0 },
    contextEntryIds: [],
    assessmentRequestIds: [],
    assessmentIds: [],
    streamIds: [],
    grantIds: [],
    messageAttemptIds: [],
    outputDigest: null,
    releasedBytes: 0,
    terminalReasonCode: null,
  };
  result = reduce(state, {
    inputId: 'input:run',
    type: 'run_created',
    run,
    logicalTimeMs: 0,
  });
  assert.equal(result.accepted, true);
  state = result.state;

  const ordinalContextIds = ['context:é', 'context:Z'];
  for (const contextEntryId of ordinalContextIds) {
    const entry = control.createContextEntryV1({
      contextEntryId,
      runId: run.runId,
      tenantId: run.tenantId,
      zone: 'user_untrusted',
      sourceKind: 'user',
      sourceId: 'user:ordinal-order',
      sourceVersion: 1,
      mediaType: 'text',
      content: contextEntryId,
      createdAtLogicalMs: 0,
      scope: null,
      derivation: null,
    });
    result = reduce(state, {
      inputId: `input:${contextEntryId}`,
      type: 'context_admitted',
      entry,
      logicalTimeMs: 0,
    });
    assert.equal(result.accepted, true);
    state = result.state;
  }
  assert.deepEqual(
    state.contextEntries.map((entry) => entry.contextEntryId),
    [...ordinalContextIds].sort(),
  );
  assert.deepEqual(state.runs[0].contextEntryIds, ordinalContextIds);

  const beforeNegotiation = reduce(state, {
    inputId: 'input:provider-before-negotiation',
    type: 'provider_started',
    runId: run.runId,
    generation: 1,
    providerRequestDigest: `sha256:${'9'.repeat(64)}`,
    streamId: 'stream:before-negotiation',
    logicalTimeMs: 0,
  });
  assert.equal(beforeNegotiation.accepted, false);
  state = beforeNegotiation.state;

  const negotiation = control.negotiateCapabilitiesV1(descriptor, {
    policyDigest: policyRecord.policyDigest,
    descriptorDigest: handle.descriptorDigest,
    mode: policy.mode,
    checkpoints: policy.checkpoints,
    requiredCapabilities: policy.requiredCapabilities,
    minimumCapabilityAssurance: policy.minimumCapabilityAssurance,
    allowedCapabilityBindings: policy.allowedCapabilityBindings,
  });
  result = reduce(
    state,
    {
      inputId: 'input:capability',
      type: 'capability_negotiated',
      runId: run.runId,
      capabilityHandleId: handle.capabilityHandleId,
      descriptorDigest: handle.descriptorDigest,
      result: negotiation,
      logicalTimeMs: 0,
    },
    { capabilityRegistry: registry },
  );
  assert.equal(result.accepted, true);
  state = result.state;

  const request = {
    schemaVersion: 1,
    assessmentRequestId: 'assessment-request:reducer',
    requestGeneration: 1,
    runId: run.runId,
    tenantId: run.tenantId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    checkpoint: 'pre_run',
    assessorId: 'assessor:reducer',
    assessorVersion: 1,
    targetKind: 'provider_request',
    targetDigest: `sha256:${'3'.repeat(64)}`,
    contextEntryIds: [],
    zoneDigest: `sha256:${'4'.repeat(64)}`,
    provenanceDigest: `sha256:${'5'.repeat(64)}`,
    scope: null,
    createdAtLogicalMs: 0,
    expiresAtLogicalMs: 100,
    status: 'pending',
  };
  result = reduce(state, {
    inputId: 'input:request',
    type: 'assessment_requested',
    request,
    logicalTimeMs: 0,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.effects[0].type, 'request_assessment');
  state = result.state;

  const assessment = {
    schemaVersion: 1,
    assessmentId: 'assessment:reducer',
    assessmentRequestId: request.assessmentRequestId,
    requestGeneration: request.requestGeneration,
    runId: request.runId,
    tenantId: request.tenantId,
    policyId: request.policyId,
    policyVersion: request.policyVersion,
    checkpoint: request.checkpoint,
    assessorId: request.assessorId,
    assessorVersion: request.assessorVersion,
    targetKind: request.targetKind,
    targetDigest: request.targetDigest,
    zoneDigest: request.zoneDigest,
    provenanceDigest: request.provenanceDigest,
    scope: null,
    disposition: 'allow',
    reasonCodes: ['assessment_required'],
    uncertaintyBasisPoints: 0,
    evidenceReferences: [],
    revisedContent: null,
    challenge: null,
    assessedAtLogicalMs: 1,
    expiresAtLogicalMs: 100,
  };
  const unsolicited = reduce(state, {
    inputId: 'input:unsolicited',
    type: 'assessment_received',
    assessment: {
      ...assessment,
      assessmentId: 'assessment:unsolicited',
      assessmentRequestId: 'assessment-request:unknown',
    },
    logicalTimeMs: 1,
  });
  assert.equal(unsolicited.accepted, false);
  assert.equal(unsolicited.reasonCode, 'assessment_unsolicited');
  assert.equal(
    unsolicited.effects.some((effect) => effect.type === 'release_output'),
    false,
  );
  state = unsolicited.state;

  result = reduce(state, {
    inputId: 'input:assessment',
    type: 'assessment_received',
    assessment,
    logicalTimeMs: 1,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.state.runs[0].phase, 'input_assessed');
  state = result.state;

  const beforeRollback = state;
  result = reduce(state, {
    inputId: 'input:rollback',
    type: 'deadline_fired',
    timerKind: 'run',
    timerId: run.runId,
    timerGeneration: 1,
    logicalTimeMs: 0,
  });
  assert.equal(result.reasonCode, 'logical_time_rollback');
  assert.equal(result.state, beforeRollback);

  result = reduce(state, {
    inputId: 'input:provider-started',
    type: 'provider_started',
    runId: run.runId,
    generation: 1,
    providerRequestDigest: request.targetDigest,
    streamId: 'stream:reducer',
    logicalTimeMs: 2,
  });
  assert.equal(result.accepted, true);
  state = result.state;
  const content = 'hello';
  result = reduce(state, {
    inputId: 'input:chunk-gap',
    type: 'provider_chunk_received',
    runId: run.runId,
    chunk: {
      schemaVersion: 1,
      chunkId: 'chunk:gap',
      streamId: 'stream:reducer',
      generation: 1,
      sequence: 1,
      fromByte: 0,
      throughByteExclusive: 5,
      utf8Bytes: 5,
      content,
      contentDigest: control.digestControlJsonV1('assessment-target', content),
    },
    logicalTimeMs: 3,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reasonCode, 'stream_sequence_invalid');
  assert.equal(result.state.streamChunks.length, 0);
  assert.doesNotThrow(() =>
    control.restoreInferenceControlStateV1(result.state, {
      rebind: () => true,
    }),
  );

  const utf8Content = 'é';
  const validUtf8 = reduce(result.state, {
    inputId: 'input:utf8-chunk',
    type: 'provider_chunk_received',
    runId: run.runId,
    chunk: {
      schemaVersion: 1,
      chunkId: 'chunk:utf8',
      streamId: 'stream:reducer',
      generation: 1,
      sequence: 0,
      fromByte: 0,
      throughByteExclusive: 2,
      utf8Bytes: 2,
      content: utf8Content,
      contentDigest: control.digestControlJsonV1(
        'assessment-target',
        utf8Content,
      ),
    },
    logicalTimeMs: 4,
  });
  assert.equal(validUtf8.accepted, true);
  const completionMismatch = reduce(validUtf8.state, {
    inputId: 'input:completion-mismatch',
    type: 'provider_completed',
    runId: run.runId,
    generation: 1,
    streamId: 'stream:reducer',
    completionContent: 'e',
    completionDigest: control.digestControlJsonV1('assessment-target', 'e'),
    logicalTimeMs: 5,
  });
  assert.equal(completionMismatch.accepted, false);
  assert.equal(completionMismatch.reasonCode, 'stream_content_mismatch');
  assert.equal(completionMismatch.state.runs[0].outputDigest, null);

  const cancelled = reduce(completionMismatch.state, {
    inputId: 'input:cancel',
    type: 'run_cancelled',
    runId: run.runId,
    generation: 1,
    reasonCode: 'assessment_required',
    logicalTimeMs: 6,
  });
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.state.runs[0].phase, 'cancelled');
  assert.equal(cancelled.state.streams[0].status, 'cancelled');

  const lateChunk = reduce(cancelled.state, {
    inputId: 'input:late-chunk',
    type: 'provider_chunk_received',
    runId: run.runId,
    chunk: {
      schemaVersion: 1,
      chunkId: 'chunk:late',
      streamId: 'stream:reducer',
      generation: 1,
      sequence: 1,
      fromByte: 2,
      throughByteExclusive: 7,
      utf8Bytes: 5,
      content,
      contentDigest: control.digestControlJsonV1('assessment-target', content),
    },
    logicalTimeMs: 7,
  });
  assert.equal(lateChunk.accepted, false);
  assert.equal(lateChunk.state.streamChunks.length, 1);

  const lateAssessment = reduce(lateChunk.state, {
    inputId: 'input:late-assessment',
    type: 'assessment_received',
    assessment: { ...assessment, assessmentId: 'assessment:late' },
    logicalTimeMs: 7,
  });
  assert.equal(lateAssessment.accepted, false);
  assert.equal(lateAssessment.reasonCode, 'assessment_generation_stale');
  assert.equal(
    lateAssessment.effects.some((effect) => effect.type === 'release_output'),
    false,
  );

  const scope = {
    schemaVersion: 1,
    kind: 'standalone',
    tenantId: run.tenantId,
    runId: run.runId,
    agentId: 'agent:late',
    organizationId: null,
    workspaceId: null,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
  };
  const lateGrant = reduce(lateAssessment.state, {
    inputId: 'input:late-grant',
    type: 'grant_issued',
    grant: {
      schemaVersion: 1,
      grantId: 'grant:late',
      runId: run.runId,
      stateGeneration: lateAssessment.state.stateGeneration,
      scope,
      scopeDigest: control.digestControlJsonV1('scope', scope),
      namespace: 'test',
      toolId: 'tool:late',
      operation: 'invoke',
      actionBindingId: 'binding:late',
      actionBindingVersion: 1,
      handlerDigest: `sha256:${'6'.repeat(64)}`,
      inputDigest: control.digestControlJsonV1('action-input', {}),
      actionDigest: control.digestControlJsonV1('action', { late: true }),
      assessmentRequestId: request.assessmentRequestId,
      assessmentId: assessment.assessmentId,
      assessmentTargetDigest: request.targetDigest,
      idempotencyKey: 'late',
      issuedAtLogicalMs: 7,
      expiresAtLogicalMs: 50,
      singleUse: true,
      status: 'issued',
      reservation: null,
    },
    logicalTimeMs: 7,
  });
  assert.equal(lateGrant.accepted, false);
  assert.equal(lateGrant.state.grants.length, 0);
  assert.equal(
    lateGrant.effects.some((effect) => effect.type === 'persist_grant'),
    false,
  );
});

test('reducer rejects unknown keys before mutating state', () => {
  const state = control.createInferenceControlStateV1({
    stateId: 'state:shape',
    tenantId: 'tenant:shape',
  });
  assert.throws(() =>
    control.reduceInferenceControlStateV1(state, {
      schemaVersion: 1,
      inputId: 'input:shape',
      type: 'run_created',
      expectedStateGeneration: state.stateGeneration,
      logicalTimeMs: 0,
      run: {},
      extra: true,
    }),
  );
  assert.equal(state.runs.length, 0);
});

test('wrong and stale assessments have no protected effect and continuation budgets terminate', () => {
  const descriptorDigest = `sha256:${'a'.repeat(64)}`;
  const policy = policyFixture(descriptorDigest);
  const policyRecord = control.createPolicyRecordV1(policy);
  let state = control.createInferenceControlStateV1({
    stateId: 'state:continuation',
    tenantId: 'tenant:reducer',
  });
  state = reduce(state, {
    inputId: 'continuation:policy',
    type: 'policy_registered',
    policy,
    policyDigest: policyRecord.policyDigest,
    logicalTimeMs: 0,
  }).state;
  const run = {
    schemaVersion: 1,
    runId: 'run:continuation',
    tenantId: state.tenantId,
    policyDigest: policyRecord.policyDigest,
    capabilityDescriptorDigest: descriptorDigest,
    capabilityHandleId: null,
    scope: null,
    generation: 1,
    phase: 'created',
    createdAtLogicalMs: 0,
    deadlineAtLogicalMs: 1_000,
    dispositionCounts: { revisions: 0, retries: 0, challenges: 0 },
    contextEntryIds: [],
    assessmentRequestIds: [],
    assessmentIds: [],
    streamIds: [],
    grantIds: [],
    messageAttemptIds: [],
    outputDigest: null,
    releasedBytes: 0,
    terminalReasonCode: null,
  };
  state = reduce(state, {
    inputId: 'continuation:run',
    type: 'run_created',
    run,
    logicalTimeMs: 0,
  }).state;
  const request = (id, generation, logicalTimeMs) => ({
    schemaVersion: 1,
    assessmentRequestId: id,
    requestGeneration: generation,
    runId: run.runId,
    tenantId: run.tenantId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    checkpoint: 'pre_run',
    assessorId: 'assessor:reducer',
    assessorVersion: 1,
    targetKind: 'provider_request',
    targetDigest: control.digestControlJsonV1('provider-request', { id }),
    contextEntryIds: [],
    zoneDigest: control.digestControlJsonV1('context', []),
    provenanceDigest: control.digestControlJsonV1('provenance', []),
    scope: null,
    createdAtLogicalMs: logicalTimeMs,
    expiresAtLogicalMs: logicalTimeMs + 100,
    status: 'pending',
  });
  const assessment = (source, id, disposition, logicalTimeMs) => ({
    schemaVersion: 1,
    assessmentId: id,
    assessmentRequestId: source.assessmentRequestId,
    requestGeneration: source.requestGeneration,
    runId: source.runId,
    tenantId: source.tenantId,
    policyId: source.policyId,
    policyVersion: source.policyVersion,
    checkpoint: source.checkpoint,
    assessorId: source.assessorId,
    assessorVersion: source.assessorVersion,
    targetKind: source.targetKind,
    targetDigest: source.targetDigest,
    zoneDigest: source.zoneDigest,
    provenanceDigest: source.provenanceDigest,
    scope: source.scope,
    disposition,
    reasonCodes: ['assessment_required'],
    uncertaintyBasisPoints: 0,
    evidenceReferences: [],
    revisedContent: null,
    challenge: null,
    assessedAtLogicalMs: logicalTimeMs,
    expiresAtLogicalMs: source.expiresAtLogicalMs,
  });

  const first = request('assessment-request:retry:one', 1, 1);
  const pendingSibling = request('assessment-request:retry:stale', 1, 1);
  for (const item of [first, pendingSibling])
    state = reduce(state, {
      inputId: `request:${item.assessmentRequestId}`,
      type: 'assessment_requested',
      request: item,
      logicalTimeMs: 1,
    }).state;

  const wrong = reduce(state, {
    inputId: 'assessment:wrong-assessor',
    type: 'assessment_received',
    assessment: {
      ...assessment(pendingSibling, 'assessment:wrong', 'retry', 2),
      assessorId: 'assessor:wrong',
    },
    logicalTimeMs: 2,
  });
  assert.equal(wrong.accepted, false);
  assert.equal(wrong.reasonCode, 'assessment_assessor_mismatch');
  assert.equal(
    wrong.effects.some((effect) => effect.type === 'release_output'),
    false,
  );
  state = wrong.state;

  const firstAssessment = assessment(first, 'assessment:retry:one', 'retry', 2);
  state = reduce(state, {
    inputId: 'assessment:retry:one',
    type: 'assessment_received',
    assessment: firstAssessment,
    logicalTimeMs: 2,
  }).state;
  let result = reduce(state, {
    inputId: 'continuation:retry:one',
    type: 'continuation_selected',
    runId: run.runId,
    assessmentId: firstAssessment.assessmentId,
    kind: 'retry',
    logicalTimeMs: 3,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.state.runs[0].generation, 2);
  assert.equal(result.state.runs[0].capabilityHandleId, null);
  state = result.state;

  const stale = reduce(state, {
    inputId: 'assessment:retry:stale',
    type: 'assessment_received',
    assessment: assessment(
      pendingSibling,
      'assessment:retry:stale',
      'retry',
      4,
    ),
    logicalTimeMs: 4,
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reasonCode, 'assessment_generation_stale');
  assert.equal(stale.state.runs[0].generation, 2);
  assert.equal(
    stale.effects.some((effect) =>
      ['release_output', 'persist_grant', 'dispatch_message'].includes(
        effect.type,
      ),
    ),
    false,
  );
  state = stale.state;

  const second = request('assessment-request:retry:two', 2, 5);
  state = reduce(state, {
    inputId: 'request:retry:two',
    type: 'assessment_requested',
    request: second,
    logicalTimeMs: 5,
  }).state;
  const secondAssessment = assessment(
    second,
    'assessment:retry:two',
    'retry',
    6,
  );
  state = reduce(state, {
    inputId: 'assessment:retry:two',
    type: 'assessment_received',
    assessment: secondAssessment,
    logicalTimeMs: 6,
  }).state;
  result = reduce(state, {
    inputId: 'continuation:retry:exhausted',
    type: 'continuation_selected',
    runId: run.runId,
    assessmentId: secondAssessment.assessmentId,
    kind: 'retry',
    logicalTimeMs: 7,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.state.runs[0].phase, 'denied');
  assert.equal(
    result.state.runs[0].terminalReasonCode,
    'assessment_budget_exhausted',
  );
});

test('capacity saturation preserves admitted context, assessments, grants, and diagnostics', () => {
  const registry = new control.CapabilityRegistryV1();
  const descriptor = {
    schemaVersion: 1,
    capabilityId: 'capability:capacity',
    descriptorVersion: 1,
    inputInspection: 'full',
    finalOutputAssessment: 'none',
    incrementalOutputAssessment: 'none',
    releaseInterruption: 'local',
    toolInterception: 'application_only',
    messageInterception: 'none',
    representationAccess: 'none',
    declarationSource: 'wrapper',
    assurance: 'reference_tested',
    wrapperId: 'wrapper:capacity',
    wrapperVersion: 1,
  };
  const handle = registry.register({
    descriptor,
    wrapperInstanceId: 'instance:capacity',
  });
  const initial = control.createInferenceControlStateV1({
    stateId: 'state:capacity',
    tenantId: 'tenant:capacity',
  });
  const limits = {
    ...initial.limits,
    maxContextEntriesPerRun: 1,
    maxAssessmentsPerRun: 1,
    maxActiveGrants: 1,
    maxRetainedGrantRecords: 2,
    maxDiagnostics: 1,
  };
  const {
    traceDigest: _traceDigest,
    encodedBytes: _encodedBytes,
    ...initialMaterial
  } = initial;
  let state = control.finalizeInferenceControlStateV1({
    ...initialMaterial,
    limits,
  });
  const policy = {
    schemaVersion: 1,
    policyId: 'policy:capacity',
    policyVersion: 1,
    parentPolicyDigest: null,
    mode: 'observe',
    outputRisk: 'low',
    checkpoints: ['pre_tool'],
    requiredCapabilities: [
      { kind: 'tool_interception', value: 'application_only' },
    ],
    minimumCapabilityAssurance: 'verified',
    allowedCapabilityBindings: [
      {
        schemaVersion: 1,
        capabilityId: descriptor.capabilityId,
        descriptorVersion: descriptor.descriptorVersion,
        wrapperId: descriptor.wrapperId,
        wrapperVersion: descriptor.wrapperVersion,
        descriptorDigest: handle.descriptorDigest,
        requiredAssurance: 'reference_tested',
      },
    ],
    allowedContextZones: ['user_untrusted'],
    allowedTransformerBindings: [],
    allowedActions: [
      {
        schemaVersion: 1,
        namespace: 'capacity',
        toolId: 'tool:capacity',
        operation: 'invoke',
        actionBindingId: 'binding:capacity',
        minimumActionBindingVersion: 1,
      },
    ],
    allowedMessageChannels: [],
    assessmentBindings: [
      {
        schemaVersion: 1,
        checkpoint: 'pre_tool',
        assessorId: 'assessor:capacity',
        assessorVersion: 1,
        assessorBindingDigest: `sha256:${'1'.repeat(64)}`,
        maximumResponseBytes: 2_048,
        maximumEvidenceReferences: 1,
        timeoutMs: 100,
      },
    ],
    budgets: { revisions: 0, retries: 0, challenges: 0 },
    limits,
    maximumRunDurationMs: 100,
    maximumAssessmentTtlMs: 100,
    maximumGrantTtlMs: 100,
    maximumMessagePermitTtlMs: 100,
    exhaustedDisposition: 'deny',
    coordinatedActionsRequired: false,
    diagnosticsPolicyId: 'diagnostics:capacity',
    redactionPolicyId: 'redaction:capacity',
  };
  const policyRecord = control.createPolicyRecordV1(policy);
  state = reduce(state, {
    inputId: 'capacity:policy',
    type: 'policy_registered',
    policy,
    policyDigest: policyRecord.policyDigest,
    logicalTimeMs: 0,
  }).state;
  const run = {
    schemaVersion: 1,
    runId: 'run:capacity',
    tenantId: state.tenantId,
    policyDigest: policyRecord.policyDigest,
    capabilityDescriptorDigest: handle.descriptorDigest,
    capabilityHandleId: null,
    scope: null,
    generation: 1,
    phase: 'created',
    createdAtLogicalMs: 0,
    deadlineAtLogicalMs: 100,
    dispositionCounts: { revisions: 0, retries: 0, challenges: 0 },
    contextEntryIds: [],
    assessmentRequestIds: [],
    assessmentIds: [],
    streamIds: [],
    grantIds: [],
    messageAttemptIds: [],
    outputDigest: null,
    releasedBytes: 0,
    terminalReasonCode: null,
  };
  state = reduce(state, {
    inputId: 'capacity:run',
    type: 'run_created',
    run,
    logicalTimeMs: 0,
  }).state;
  const negotiation = control.negotiateCapabilitiesV1(descriptor, {
    policyDigest: policyRecord.policyDigest,
    descriptorDigest: handle.descriptorDigest,
    mode: policy.mode,
    checkpoints: policy.checkpoints,
    requiredCapabilities: policy.requiredCapabilities,
    minimumCapabilityAssurance: policy.minimumCapabilityAssurance,
    allowedCapabilityBindings: policy.allowedCapabilityBindings,
  });
  state = reduce(
    state,
    {
      inputId: 'capacity:capability',
      type: 'capability_negotiated',
      runId: run.runId,
      capabilityHandleId: handle.capabilityHandleId,
      descriptorDigest: handle.descriptorDigest,
      result: negotiation,
      logicalTimeMs: 0,
    },
    { capabilityRegistry: registry },
  ).state;
  const contextEntry = (id) =>
    control.createContextEntryV1({
      contextEntryId: id,
      runId: run.runId,
      tenantId: run.tenantId,
      zone: 'user_untrusted',
      sourceKind: 'user',
      sourceId: 'user:capacity',
      sourceVersion: 1,
      mediaType: 'text',
      content: id,
      createdAtLogicalMs: 1,
      scope: null,
      derivation: null,
    });
  state = reduce(state, {
    inputId: 'capacity:context:one',
    type: 'context_admitted',
    entry: contextEntry('context:capacity:one'),
    logicalTimeMs: 1,
  }).state;
  let result = reduce(state, {
    inputId: 'capacity:context:two',
    type: 'context_admitted',
    entry: contextEntry('context:capacity:two'),
    logicalTimeMs: 1,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reasonCode, 'context_limit_exceeded');
  assert.deepEqual(
    result.state.contextEntries.map((entry) => entry.contextEntryId),
    ['context:capacity:one'],
  );
  assert.equal(result.state.diagnostics.length, 1);
  state = result.state;

  const scope = {
    schemaVersion: 1,
    kind: 'standalone',
    tenantId: run.tenantId,
    runId: run.runId,
    agentId: 'agent:capacity',
    organizationId: null,
    workspaceId: null,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
  };
  const targetDigest = control.digestControlJsonV1('action', {
    capacity: true,
  });
  const request = {
    schemaVersion: 1,
    assessmentRequestId: 'assessment-request:capacity:one',
    requestGeneration: 1,
    runId: run.runId,
    tenantId: run.tenantId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    checkpoint: 'pre_tool',
    assessorId: 'assessor:capacity',
    assessorVersion: 1,
    targetKind: 'action',
    targetDigest,
    contextEntryIds: [],
    zoneDigest: control.digestControlJsonV1('context', []),
    provenanceDigest: control.digestControlJsonV1('provenance', []),
    scope,
    createdAtLogicalMs: 2,
    expiresAtLogicalMs: 50,
    status: 'pending',
  };
  state = reduce(state, {
    inputId: 'capacity:request:one',
    type: 'assessment_requested',
    request,
    logicalTimeMs: 2,
  }).state;
  const assessment = {
    schemaVersion: 1,
    assessmentId: 'assessment:capacity:one',
    assessmentRequestId: request.assessmentRequestId,
    requestGeneration: request.requestGeneration,
    runId: request.runId,
    tenantId: request.tenantId,
    policyId: request.policyId,
    policyVersion: request.policyVersion,
    checkpoint: request.checkpoint,
    assessorId: request.assessorId,
    assessorVersion: request.assessorVersion,
    targetKind: request.targetKind,
    targetDigest: request.targetDigest,
    zoneDigest: request.zoneDigest,
    provenanceDigest: request.provenanceDigest,
    scope,
    disposition: 'allow',
    reasonCodes: ['assessment_required'],
    uncertaintyBasisPoints: 0,
    evidenceReferences: [],
    revisedContent: null,
    challenge: null,
    assessedAtLogicalMs: 3,
    expiresAtLogicalMs: 50,
  };
  state = reduce(state, {
    inputId: 'capacity:assessment:one',
    type: 'assessment_received',
    assessment,
    logicalTimeMs: 3,
  }).state;
  result = reduce(state, {
    inputId: 'capacity:request:two',
    type: 'assessment_requested',
    request: {
      ...request,
      assessmentRequestId: 'assessment-request:capacity:two',
      createdAtLogicalMs: 3,
      expiresAtLogicalMs: 51,
    },
    logicalTimeMs: 3,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reasonCode, 'state_capacity_exceeded');
  assert.equal(result.state.assessmentRequests.length, 1);
  assert.equal(result.state.assessments.length, 1);
  assert.equal(result.state.diagnostics.length, 1);
  state = result.state;

  const actionGrant = (id, idempotencyKey) => ({
    schemaVersion: 1,
    grantId: id,
    runId: run.runId,
    stateGeneration: state.stateGeneration,
    scope,
    scopeDigest: control.digestControlJsonV1('scope', scope),
    namespace: 'capacity',
    toolId: 'tool:capacity',
    operation: 'invoke',
    actionBindingId: 'binding:capacity',
    actionBindingVersion: 1,
    handlerDigest: `sha256:${'3'.repeat(64)}`,
    inputDigest: control.digestControlJsonV1('action-input', {}),
    actionDigest: targetDigest,
    assessmentRequestId: request.assessmentRequestId,
    assessmentId: assessment.assessmentId,
    assessmentTargetDigest: targetDigest,
    idempotencyKey,
    issuedAtLogicalMs: 4,
    expiresAtLogicalMs: 10,
    singleUse: true,
    status: 'issued',
    reservation: null,
  });
  state = reduce(state, {
    inputId: 'capacity:grant:one',
    type: 'grant_issued',
    grant: actionGrant('grant:capacity:one', 'idempotency:capacity:one'),
    logicalTimeMs: 4,
  }).state;
  result = reduce(state, {
    inputId: 'capacity:grant:two',
    type: 'grant_issued',
    grant: actionGrant('grant:capacity:two', 'idempotency:capacity:two'),
    logicalTimeMs: 4,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reasonCode, 'state_capacity_exceeded');
  assert.deepEqual(
    result.state.grants.map((grant) => grant.grantId),
    ['grant:capacity:one'],
  );
  assert.equal(result.state.diagnostics.length, 1);
  const cancelled = reduce(result.state, {
    inputId: 'capacity:cancel',
    type: 'run_cancelled',
    runId: run.runId,
    generation: 1,
    reasonCode: 'assessment_required',
    logicalTimeMs: 5,
  });
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.state.grants[0].status, 'expired');
  assert.equal(cancelled.state.actionIdempotency[0].retainedOutcome, 'expired');
  const staleReservation = reduce(cancelled.state, {
    inputId: 'capacity:reserve-after-cancel',
    type: 'grant_reserved',
    grantId: 'grant:capacity:one',
    reservation: {
      reservationId: 'reservation:capacity:stale',
      dispatchAttemptId: 'dispatch:capacity:stale',
    },
    logicalTimeMs: 5,
  });
  assert.equal(staleReservation.accepted, false);
  assert.equal(staleReservation.reasonCode, 'grant_expired');
  assert.equal(staleReservation.state, cancelled.state);
});
