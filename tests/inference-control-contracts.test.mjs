import assert from 'node:assert/strict';
import test from 'node:test';

const control = await import('../packages/inference-control/dist/index.js');

test('canonical control JSON is deterministic and rejects non-JSON shapes', () => {
  assert.equal(
    control.canonicalizeControlJsonV1({ b: 1, a: [true, null] }),
    '{"a":[true,null],"b":1}',
  );
  assert.match(
    control.digestControlJsonV1('context', { a: 1 }),
    /^sha256:[0-9a-f]{64}$/,
  );
  assert.throws(() => control.canonicalizeControlJsonV1({ value: Number.NaN }));
  assert.throws(() => control.canonicalizeControlJsonV1([, 1]));
});

test('capability registry is construction-bound and cannot rebind stale content', () => {
  const descriptor = {
    schemaVersion: 1,
    capabilityId: 'wrapper',
    descriptorVersion: 1,
    inputInspection: 'full',
    finalOutputAssessment: 'full',
    incrementalOutputAssessment: 'windowed',
    releaseInterruption: 'local',
    toolInterception: 'all',
    messageInterception: 'application_only',
    representationAccess: 'opaque',
    declarationSource: 'wrapper',
    assurance: 'application_verified',
    wrapperId: 'wrapper',
    wrapperVersion: 1,
  };
  const registry = new control.CapabilityRegistryV1();
  const handle = registry.register({ descriptor, wrapperInstanceId: 'one' });
  assert.equal(
    registry.rebind({
      schemaVersion: 1,
      capabilityId: 'wrapper',
      descriptorVersion: 1,
      wrapperId: 'wrapper',
      wrapperVersion: 1,
      descriptorDigest: handle.descriptorDigest,
      requiredAssurance: 'application_verified',
    }).capabilityHandleId,
    handle.capabilityHandleId,
  );
  assert.throws(
    () =>
      registry.rebind({
        schemaVersion: 1,
        capabilityId: 'wrapper',
        descriptorVersion: 1,
        wrapperId: 'wrapper',
        wrapperVersion: 1,
        descriptorDigest:
          'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        requiredAssurance: 'application_verified',
      }),
    /dependency_rebind_failed/,
  );
  assert.throws(
    () =>
      registry.register({
        descriptor,
        wrapperInstanceId: 'two',
        descriptorDigest: `sha256:${'0'.repeat(64)}`,
      }),
    /descriptorDigest does not match descriptor/,
  );
});

test('capability negotiation binds exact descriptor, policy and requirements', () => {
  const descriptor = control.validateCapabilityDescriptorV1({
    schemaVersion: 1,
    capabilityId: 'capability:wrapper',
    descriptorVersion: 1,
    inputInspection: 'full',
    finalOutputAssessment: 'full',
    incrementalOutputAssessment: 'windowed',
    releaseInterruption: 'local',
    toolInterception: 'all',
    messageInterception: 'application_only',
    representationAccess: 'opaque',
    declarationSource: 'wrapper',
    assurance: 'application_verified',
    wrapperId: 'wrapper:one',
    wrapperVersion: 1,
  });
  const descriptorDigest = control.digestControlJsonV1(
    'capability',
    descriptor,
  );
  const binding = {
    schemaVersion: 1,
    capabilityId: descriptor.capabilityId,
    descriptorVersion: descriptor.descriptorVersion,
    wrapperId: descriptor.wrapperId,
    wrapperVersion: descriptor.wrapperVersion,
    descriptorDigest,
    requiredAssurance: 'application_verified',
  };
  const negotiated = control.negotiateCapabilitiesV1(descriptor, {
    policyDigest: `sha256:${'1'.repeat(64)}`,
    descriptorDigest,
    mode: 'incremental',
    checkpoints: ['post_run', 'pre_run', 'stream'],
    requiredCapabilities: [
      { kind: 'final_output_assessment', value: 'full' },
      { kind: 'incremental_output_assessment', value: 'windowed' },
      { kind: 'input_inspection', value: 'full' },
      { kind: 'release_interruption', value: 'local' },
    ],
    minimumCapabilityAssurance: 'verified',
    allowedCapabilityBindings: [binding],
  });
  assert.equal(negotiated.accepted, true);
  assert.equal(negotiated.schemaVersion, 1);
  assert.deepEqual(
    control.validateCapabilityNegotiationResultV1(negotiated),
    negotiated,
  );
  assert.throws(
    () =>
      control.validateCapabilityNegotiationResultV1({
        ...negotiated,
        unexpected: true,
      }),
    /invalid shape/,
  );
  assert.deepEqual(negotiated.enforcedCheckpoints, [
    'post_run',
    'pre_run',
    'stream',
  ]);
  const rejected = control.negotiateCapabilitiesV1(descriptor, {
    policyDigest: `sha256:${'1'.repeat(64)}`,
    descriptorDigest,
    mode: 'buffered',
    checkpoints: ['pre_run'],
    requiredCapabilities: [{ kind: 'representation_access', value: 'token' }],
    minimumCapabilityAssurance: 'verified',
    allowedCapabilityBindings: [binding],
  });
  assert.deepEqual(rejected, {
    schemaVersion: 1,
    policyDigest: `sha256:${'1'.repeat(64)}`,
    descriptorDigest,
    accepted: false,
    reasonCode: 'policy_capability_missing',
    missingCapabilities: [{ kind: 'representation_access', value: 'token' }],
  });
});

test('context validation recomputes content, provenance and canonical bytes', () => {
  const entry = control.createContextEntryV1({
    contextEntryId: 'context:one',
    runId: 'run:one',
    tenantId: 'tenant:one',
    zone: 'user_untrusted',
    sourceKind: 'user',
    sourceId: 'user:one',
    sourceVersion: 1,
    mediaType: 'json',
    content: { z: 1, a: 'content' },
    createdAtLogicalMs: 1,
    scope: null,
    derivation: null,
  });
  assert.throws(
    () => control.validateContextEntryV1({ ...entry, encodedBytes: 0 }),
    /state_conflict/,
  );
  assert.throws(
    () =>
      control.validateContextEntryV1({
        ...entry,
        provenanceDigest: `sha256:${'0'.repeat(64)}`,
      }),
    /state_conflict/,
  );
  assert.throws(() =>
    control.validateContextEntryV1({
      ...entry,
      contextEntryId: 'context:\u0000bad',
    }),
  );

  const standalone = {
    schemaVersion: 1,
    kind: 'standalone',
    tenantId: 'tenant:one',
    runId: 'run:one',
    agentId: 'agent:one',
    organizationId: null,
    workspaceId: null,
    policyId: 'policy:one',
    policyVersion: 1,
  };
  assert.deepEqual(control.validateControlScopeV1(standalone), standalone);
  assert.throws(
    () =>
      control.validateControlScopeV1({
        schemaVersion: 1,
        kind: 'coordinated',
        tenantId: 'tenant:one',
        runId: 'run:one',
      }),
    /coordinated scope|grant_scope_mismatch/,
  );
});

test('policy closes capability pairs and assessor bindings to enabled checkpoints', () => {
  const limits = control.INFERENCE_CONTROL_LIMITS_V1;
  const policy = {
    schemaVersion: 1,
    policyId: 'policy:one',
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
    allowedCapabilityBindings: [],
    allowedContextZones: ['user_untrusted'],
    allowedTransformerBindings: [],
    allowedActions: [],
    allowedMessageChannels: [],
    assessmentBindings: [
      {
        schemaVersion: 1,
        checkpoint: 'post_run',
        assessorId: 'assessor:one',
        assessorVersion: 1,
        assessorBindingDigest: `sha256:${'2'.repeat(64)}`,
        maximumResponseBytes: 1,
        maximumEvidenceReferences: 1,
        timeoutMs: 1,
      },
      {
        schemaVersion: 1,
        checkpoint: 'pre_run',
        assessorId: 'assessor:two',
        assessorVersion: 1,
        assessorBindingDigest: `sha256:${'3'.repeat(64)}`,
        maximumResponseBytes: 1,
        maximumEvidenceReferences: 1,
        timeoutMs: 1,
      },
    ],
    budgets: { revisions: 0, retries: 0, challenges: 0 },
    limits,
    maximumRunDurationMs: 1,
    maximumAssessmentTtlMs: 1,
    maximumGrantTtlMs: 1,
    maximumMessagePermitTtlMs: 1,
    exhaustedDisposition: 'deny',
    coordinatedActionsRequired: false,
    diagnosticsPolicyId: 'diagnostics:one',
    redactionPolicyId: 'redaction:one',
  };
  assert.doesNotThrow(() => control.validateInferenceControlPolicyV1(policy));
  assert.throws(() =>
    control.validateInferenceControlPolicyV1({
      ...policy,
      requiredCapabilities: [{ kind: 'input_inspection', value: 'none' }],
    }),
  );
  assert.throws(() =>
    control.validateInferenceControlPolicyV1({
      ...policy,
      assessmentBindings: [
        ...policy.assessmentBindings,
        { ...policy.assessmentBindings[0], checkpoint: 'stream' },
      ],
    }),
  );

  const parent = control.createPolicyRecordV1(policy);
  const narrowed = {
    ...policy,
    policyVersion: 2,
    parentPolicyDigest: parent.policyDigest,
    allowedContextZones: [],
    maximumRunDurationMs: 1,
  };
  assert.doesNotThrow(() => control.assertPolicyNarrowingV1(policy, narrowed));
  assert.throws(
    () =>
      control.assertPolicyNarrowingV1(policy, {
        ...narrowed,
        allowedContextZones: ['peer_untrusted'],
      }),
    /policy_narrowing_invalid/,
  );
});

test('strict state restore recomputes digest/bytes and rejects forged or exotic state', () => {
  const state = control.createInferenceControlStateV1({
    stateId: 'state:one',
    tenantId: 'tenant:one',
  });
  assert.deepEqual(
    control.restoreInferenceControlStateV1(structuredClone(state)),
    state,
  );
  assert.throws(
    () =>
      control.restoreInferenceControlStateV1({
        ...state,
        encodedBytes: state.encodedBytes + 1,
      }),
    /state_conflict/,
  );
  const exotic = Object.assign(
    Object.create({ polluted: true }),
    structuredClone(state),
  );
  assert.throws(() => control.restoreInferenceControlStateV1(exotic));
});

test('strict restore requires dependency rebinding and fences in-flight records', () => {
  const empty = control.createInferenceControlStateV1({
    stateId: 'state:two',
    tenantId: 'tenant:one',
  });
  const dependency = {
    schemaVersion: 1,
    kind: 'assessor',
    bindingId: 'assessor:one',
    bindingVersion: 1,
    bindingDigest: `sha256:${'4'.repeat(64)}`,
  };
  const capabilityDependency = {
    schemaVersion: 1,
    kind: 'capability',
    bindingId: 'capability-handle:state',
    bindingVersion: 1,
    bindingDigest: `sha256:${'5'.repeat(64)}`,
  };
  const policy = {
    schemaVersion: 1,
    policyId: 'policy:state',
    policyVersion: 1,
    parentPolicyDigest: null,
    mode: 'buffered',
    outputRisk: 'moderate',
    checkpoints: ['pre_tool'],
    requiredCapabilities: [
      { kind: 'tool_interception', value: 'application_only' },
    ],
    minimumCapabilityAssurance: 'verified',
    allowedCapabilityBindings: [
      {
        schemaVersion: 1,
        capabilityId: 'capability:state',
        descriptorVersion: 1,
        wrapperId: 'wrapper:state',
        wrapperVersion: 1,
        descriptorDigest: capabilityDependency.bindingDigest,
        requiredAssurance: 'reference_tested',
      },
    ],
    allowedContextZones: [],
    allowedTransformerBindings: [],
    allowedActions: [
      {
        schemaVersion: 1,
        namespace: 'test',
        toolId: 'tool:one',
        operation: 'invoke',
        actionBindingId: 'binding:one',
        minimumActionBindingVersion: 1,
      },
    ],
    allowedMessageChannels: [],
    assessmentBindings: [
      {
        schemaVersion: 1,
        checkpoint: 'pre_tool',
        assessorId: 'assessor:one',
        assessorVersion: 1,
        assessorBindingDigest: dependency.bindingDigest,
        maximumResponseBytes: 1024,
        maximumEvidenceReferences: 1,
        timeoutMs: 10,
      },
    ],
    budgets: { revisions: 0, retries: 0, challenges: 0 },
    limits: control.INFERENCE_CONTROL_LIMITS_V1,
    maximumRunDurationMs: 100,
    maximumAssessmentTtlMs: 10,
    maximumGrantTtlMs: 10,
    maximumMessagePermitTtlMs: 10,
    exhaustedDisposition: 'deny',
    coordinatedActionsRequired: false,
    diagnosticsPolicyId: 'diagnostics:state',
    redactionPolicyId: 'redaction:state',
  };
  const policyRecord = control.createPolicyRecordV1(policy);
  const run = {
    schemaVersion: 1,
    runId: 'run:state',
    tenantId: 'tenant:one',
    policyDigest: policyRecord.policyDigest,
    capabilityDescriptorDigest: `sha256:${'5'.repeat(64)}`,
    capabilityHandleId: 'capability-handle:state',
    scope: null,
    generation: 1,
    phase: 'executing',
    createdAtLogicalMs: 0,
    deadlineAtLogicalMs: 100,
    dispositionCounts: { revisions: 0, retries: 0, challenges: 0 },
    contextEntryIds: [],
    assessmentRequestIds: ['assessment-request:one'],
    assessmentIds: ['assessment:one'],
    streamIds: [],
    grantIds: ['grant:reserved'],
    messageAttemptIds: [],
    outputDigest: null,
    releasedBytes: 0,
    terminalReasonCode: null,
  };
  const scope = {
    schemaVersion: 1,
    kind: 'standalone',
    tenantId: 'tenant:one',
    runId: run.runId,
    agentId: 'agent:one',
    organizationId: null,
    workspaceId: null,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
  };
  const assessmentRequest = {
    schemaVersion: 1,
    assessmentRequestId: 'assessment-request:one',
    requestGeneration: 1,
    runId: run.runId,
    tenantId: run.tenantId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    checkpoint: 'pre_tool',
    assessorId: 'assessor:one',
    assessorVersion: 1,
    targetKind: 'action',
    targetDigest: `sha256:${'6'.repeat(64)}`,
    contextEntryIds: [],
    zoneDigest: `sha256:${'7'.repeat(64)}`,
    provenanceDigest: `sha256:${'8'.repeat(64)}`,
    scope,
    createdAtLogicalMs: 0,
    expiresAtLogicalMs: 10,
    status: 'accepted',
  };
  const assessment = {
    schemaVersion: 1,
    assessmentId: 'assessment:one',
    assessmentRequestId: assessmentRequest.assessmentRequestId,
    requestGeneration: assessmentRequest.requestGeneration,
    runId: assessmentRequest.runId,
    tenantId: assessmentRequest.tenantId,
    policyId: assessmentRequest.policyId,
    policyVersion: assessmentRequest.policyVersion,
    checkpoint: assessmentRequest.checkpoint,
    assessorId: assessmentRequest.assessorId,
    assessorVersion: assessmentRequest.assessorVersion,
    targetKind: assessmentRequest.targetKind,
    targetDigest: assessmentRequest.targetDigest,
    zoneDigest: assessmentRequest.zoneDigest,
    provenanceDigest: assessmentRequest.provenanceDigest,
    scope,
    disposition: 'allow',
    reasonCodes: ['assessment_required'],
    uncertaintyBasisPoints: 0,
    evidenceReferences: [],
    revisedContent: null,
    challenge: null,
    assessedAtLogicalMs: 1,
    expiresAtLogicalMs: 10,
  };
  const grant = {
    schemaVersion: 1,
    grantId: 'grant:reserved',
    runId: run.runId,
    stateGeneration: 1,
    scope,
    scopeDigest: control.digestControlJsonV1('scope', scope),
    namespace: 'test',
    toolId: 'tool:one',
    operation: 'invoke',
    actionBindingId: 'binding:one',
    actionBindingVersion: 1,
    handlerDigest: `sha256:${'9'.repeat(64)}`,
    inputDigest: `sha256:${'a'.repeat(64)}`,
    actionDigest: `sha256:${'b'.repeat(64)}`,
    assessmentRequestId: assessmentRequest.assessmentRequestId,
    assessmentId: assessment.assessmentId,
    assessmentTargetDigest: assessmentRequest.targetDigest,
    idempotencyKey: 'action:one',
    issuedAtLogicalMs: 2,
    expiresAtLogicalMs: 10,
    singleUse: true,
    status: 'reserved',
    reservation: {
      reservationId: 'reservation:one',
      dispatchAttemptId: 'dispatch:one',
    },
  };
  const material = {
    ...empty,
    stateGeneration: 2,
    logicalTimeHighWaterMs: 2,
    policies: [policyRecord],
    policyHeads: [
      {
        schemaVersion: 1,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        policyDigest: policyRecord.policyDigest,
      },
    ],
    dependencyBindings: [dependency, capabilityDependency],
    runs: [run],
    assessmentRequests: [assessmentRequest],
    assessments: [assessment],
    grants: [grant],
    actionIdempotency: [
      {
        schemaVersion: 1,
        scopeDigest: grant.scopeDigest,
        idempotencyKey: grant.idempotencyKey,
        actionDigest: grant.actionDigest,
        grantId: grant.grantId,
        retainedOutcome: 'reserved',
      },
    ],
  };
  delete material.traceDigest;
  delete material.encodedBytes;
  const inFlight = control.finalizeInferenceControlStateV1(material);
  const forgedHandle = control.finalizeInferenceControlStateV1({
    ...material,
    runs: [{ ...run, capabilityHandleId: 'capability-handle:forged' }],
  });
  assert.throws(
    () =>
      control.restoreInferenceControlStateV1(forgedHandle, {
        rebind: () => true,
      }),
    /state_conflict/,
  );
  const ttlPolicy = {
    ...policy,
    limits: { ...policy.limits, maxGrantTtlMs: 1 },
    maximumGrantTtlMs: 1,
  };
  const ttlPolicyRecord = control.createPolicyRecordV1(ttlPolicy);
  const forgedPolicyLimit = control.finalizeInferenceControlStateV1({
    ...material,
    policies: [ttlPolicyRecord],
    policyHeads: [
      {
        schemaVersion: 1,
        policyId: ttlPolicy.policyId,
        policyVersion: ttlPolicy.policyVersion,
        policyDigest: ttlPolicyRecord.policyDigest,
      },
    ],
    runs: [{ ...run, policyDigest: ttlPolicyRecord.policyDigest }],
  });
  assert.throws(
    () =>
      control.restoreInferenceControlStateV1(forgedPolicyLimit, {
        rebind: () => true,
      }),
    /grant_expired/,
  );
  assert.throws(
    () => control.restoreInferenceControlStateV1(inFlight),
    /dependency_rebind_failed/,
  );
  const restored = control.restoreInferenceControlStateV1(inFlight, {
    rebind(binding) {
      return [
        dependency.bindingDigest,
        capabilityDependency.bindingDigest,
      ].includes(binding.bindingDigest);
    },
  });
  assert.equal(restored.grants[0].status, 'indeterminate');
  assert.equal(restored.grants[0].stateGeneration, 2);
});

test('strict restore rebinds every construction dependency kind exactly', () => {
  const empty = control.createInferenceControlStateV1({
    stateId: 'state:dependencies',
    tenantId: 'tenant:dependencies',
  });
  const kinds = [
    'capability',
    'assessor',
    'transformer',
    'action_dispatcher',
    'action_context_resolver',
    'authority_resolver',
    'message_dispatcher',
  ];
  const dependencies = kinds
    .map((kind, index) => ({
      schemaVersion: 1,
      kind,
      bindingId: `${kind}:one`,
      bindingVersion: 1,
      bindingDigest: `sha256:${String(index + 1).repeat(64)}`,
    }))
    .sort((left, right) =>
      `${left.kind}\u0000${left.bindingId}\u00001`.localeCompare(
        `${right.kind}\u0000${right.bindingId}\u00001`,
      ),
    );
  const {
    traceDigest: _traceDigest,
    encodedBytes: _encodedBytes,
    ...material
  } = empty;
  const bound = control.finalizeInferenceControlStateV1({
    ...material,
    dependencyBindings: dependencies,
  });
  assert.throws(
    () => control.restoreInferenceControlStateV1(bound),
    /dependency_rebind_failed/,
  );
  const rebound = [];
  assert.doesNotThrow(() =>
    control.restoreInferenceControlStateV1(bound, {
      rebind(binding) {
        rebound.push(binding.kind);
        return dependencies.some(
          (candidate) =>
            candidate.kind === binding.kind &&
            candidate.bindingId === binding.bindingId &&
            candidate.bindingVersion === binding.bindingVersion &&
            candidate.bindingDigest === binding.bindingDigest,
        );
      },
    }),
  );
  assert.deepEqual(rebound.sort(), [...kinds].sort());
  assert.throws(
    () =>
      control.restoreInferenceControlStateV1(bound, {
        rebind(binding) {
          return binding.kind !== 'authority_resolver';
        },
      }),
    /dependency_rebind_failed/,
  );
});

test('quiescent snapshot replay is identical and reports the first controlled divergence', () => {
  const initial = control.createInferenceControlStateV1({
    stateId: 'state:replay',
    tenantId: 'tenant:replay',
  });
  const snapshot = control.createInferenceControlSnapshotV1({
    snapshotId: 'snapshot:replay',
    createdAtLogicalMs: 0,
    state: initial,
  });
  const restored = control.restoreInferenceControlSnapshotV1(
    structuredClone(snapshot),
  ).state;
  assert.deepEqual(restored, initial);
  const input = {
    schemaVersion: 1,
    inputId: 'input:replay',
    type: 'run_created',
    expectedStateGeneration: initial.stateGeneration,
    logicalTimeMs: 1,
    run: {
      schemaVersion: 1,
      runId: 'run:replay',
      tenantId: initial.tenantId,
      policyDigest: `sha256:${'1'.repeat(64)}`,
      capabilityDescriptorDigest: `sha256:${'2'.repeat(64)}`,
      capabilityHandleId: null,
      scope: null,
      generation: 1,
      phase: 'created',
      createdAtLogicalMs: 1,
      deadlineAtLogicalMs: 2,
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
    },
  };
  const uninterrupted = control.reduceInferenceControlStateV1(initial, input);
  const resumed = control.reduceInferenceControlStateV1(restored, input);
  assert.deepEqual(resumed, uninterrupted);
  assert.equal(resumed.state.traceDigest, uninterrupted.state.traceDigest);

  const changed = control.reduceInferenceControlStateV1(initial, {
    ...input,
    inputId: 'input:replay:changed',
    run: { ...input.run, runId: 'run:replay:changed' },
  });
  const decisions = [uninterrupted, resumed];
  const changedDecisions = [changed, resumed];
  const firstReplayDivergence = decisions.findIndex(
    (decision, index) =>
      decision.state.traceDigest !== changedDecisions[index].state.traceDigest,
  );
  assert.equal(firstReplayDivergence, 0);
});

test('redacted evidence is non-restorable and telemetry failure is non-authoritative', async () => {
  const initial = control.createInferenceControlStateV1({
    stateId: 'state:evidence',
    tenantId: 'tenant:evidence',
  });
  const reduction = control.reduceInferenceControlStateV1(initial, {
    schemaVersion: 1,
    inputId: 'input:missing-policy',
    type: 'run_created',
    expectedStateGeneration: initial.stateGeneration,
    logicalTimeMs: 1,
    run: {
      schemaVersion: 1,
      runId: 'run:evidence',
      tenantId: 'tenant:evidence',
      policyDigest: `sha256:${'1'.repeat(64)}`,
      capabilityDescriptorDigest: `sha256:${'2'.repeat(64)}`,
      capabilityHandleId: null,
      scope: null,
      generation: 1,
      phase: 'created',
      createdAtLogicalMs: 1,
      deadlineAtLogicalMs: 2,
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
    },
  });
  assert.equal(reduction.accepted, false);
  const evidence = control.createRedactedInferenceControlEvidenceV1(
    reduction.state,
  );
  assert.equal(evidence.restorable, false);
  assert.equal(Object.hasOwn(evidence, 'contextEntries'), false);
  assert.throws(() => control.restoreInferenceControlStateV1(evidence));
  const stateDigest = reduction.state.traceDigest;
  const delivery = await control.emitControlDiagnosticsBestEffortV1(
    reduction.state.diagnostics,
    {
      async emit() {
        throw new Error('telemetry unavailable');
      },
    },
  );
  assert.deepEqual(delivery, { attempted: 1, delivered: 0, unavailable: 1 });
  assert.equal(reduction.state.traceDigest, stateDigest);
});
