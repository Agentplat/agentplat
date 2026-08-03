import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMissionObservationV1,
  digestPlanningJsonV1,
} from '@agentplat/collective-planning';
import {
  DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  auditCollectiveEnvironmentPortV1,
  createCollectiveEnvironmentInitializationV1,
  createCollectiveEnvironmentObservationRequestV1,
  createCollectiveEvaluationBoundaryEvidenceV1,
  createCollectiveEvaluationRegistrationBindingV1,
  createCollectiveInvariantMonitorEventV1,
  createCollectiveInvariantMonitorPolicyV1,
  createCollectiveProtectedEffectAttemptV1,
  replayCollectiveInteractionLedgerV2,
  scanCollectivePublicArtifactForCanaryV1,
  validateCollectiveEvaluationBoundaryEvidenceV1,
  validateCollectiveTraceV2,
} from '@agentplat/collective-planning/evaluation';
import {
  collectiveDeterministicEnvironmentDigestV1,
  collectiveHiddenCanaryDigestV1,
  createCollectiveDeterministicEnvironmentHarnessV1,
} from '@agentplat/mesh-sim';

const hash = (value) => digestPlanningJsonV1('environment-state-v1', value);

function fixture() {
  const hiddenCanary = 'private-canary-7c36c45d';
  const registrationDigest = hash({ registration: 'evaluation-v2-alpha' });
  const intentDigest = hash({ intent: 'adaptive-mission-alpha' });
  const workContractDigest = hash({ contract: 'contract-alpha' });
  const inputDigest = hash({ input: 'payload-alpha' });
  const outputDigest = hash({ output: 'result-alpha' });
  const observations = [
    createMissionObservationV1({
      schemaVersion: 1,
      observationId: 'observation:peer-a:1',
      missionIntentId: 'mission:alpha',
      intentRevision: 1,
      intentDigest,
      observerPeerId: 'peer-a',
      observerInstanceId: 'peer-a-instance-1',
      environmentCursor: 'cursor:0',
      logicalTimeMs: 0,
      visibility: 'resource',
      observationKind: 'local-resource-available',
      publicValue: { resourceClass: 'sensor', region: 'north' },
      contentReferenceDigest: null,
    }),
    createMissionObservationV1({
      schemaVersion: 1,
      observationId: 'observation:peer-b:1',
      missionIntentId: 'mission:alpha',
      intentRevision: 1,
      intentDigest,
      observerPeerId: 'peer-b',
      observerInstanceId: 'peer-b-instance-1',
      environmentCursor: 'cursor:0',
      logicalTimeMs: 0,
      visibility: 'capability',
      observationKind: 'local-capability-available',
      publicValue: { capability: 'analysis', region: 'south' },
      contentReferenceDigest: null,
    }),
  ];
  const definition = {
    schemaVersion: 1,
    environmentId: 'deterministic-world:alpha',
    observations,
    effectRules: [
      {
        schemaVersion: 1,
        effectId: 'effect:a',
        workItemId: 'work:a',
        workItemRevision: 1,
        workContractId: 'contract:a',
        workContractDigest,
        peerId: 'peer-a',
        peerInstanceId: 'peer-a-instance-1',
        assignmentEpoch: 1,
        authorityGeneration: 1,
        fencingToken: 'fence:a:1',
        actionClass: 'publish-result',
        inputDigest,
        outputDigest,
        behavior: 'commit',
        rejectionCode: null,
      },
      {
        schemaVersion: 1,
        effectId: 'effect:b',
        workItemId: 'work:b',
        workItemRevision: 1,
        workContractId: 'contract:b',
        workContractDigest,
        peerId: 'peer-a',
        peerInstanceId: 'peer-a-instance-1',
        assignmentEpoch: 1,
        authorityGeneration: 1,
        fencingToken: 'fence:b:1',
        actionClass: 'publish-result',
        inputDigest,
        outputDigest,
        behavior: 'timeout_after_commit',
        rejectionCode: null,
      },
      {
        schemaVersion: 1,
        effectId: 'effect:c',
        workItemId: 'work:c',
        workItemRevision: 1,
        workContractId: 'contract:c',
        workContractDigest,
        peerId: 'peer-a',
        peerInstanceId: 'peer-a-instance-1',
        assignmentEpoch: 1,
        authorityGeneration: 1,
        fencingToken: 'fence:c:1',
        actionClass: 'publish-result',
        inputDigest,
        outputDigest,
        behavior: 'timeout_before_commit',
        rejectionCode: null,
      },
    ],
    hiddenCanary,
  };
  const monitorPolicy = createCollectiveInvariantMonitorPolicyV1({
    schemaVersion: 1,
    policyId: 'monitor-policy:alpha',
    registrationDigest,
    requiredEffects: [
      {
        schemaVersion: 1,
        effectId: 'effect:a',
        outcomeUnits: 4,
        objectiveValue: 10,
      },
    ],
    hiddenCanaryDigest: collectiveHiddenCanaryDigestV1(hiddenCanary),
  });
  const registration = createCollectiveEvaluationRegistrationBindingV1({
    schemaVersion: 1,
    registrationId: 'registration:alpha',
    registrationDigest,
    tenantId: 'tenant-alpha',
    missionIntentId: 'mission:alpha',
    intentRevision: 1,
    intentDigest,
    runner: 'adaptive_collective',
    stratum: 'mixed',
    seed: 41,
    environmentDigest: collectiveDeterministicEnvironmentDigestV1(definition),
    observationPolicyDigest: hash({
      observationPolicy: 'peer-local-cursor-v1',
    }),
    monitorDigest: monitorPolicy.policyDigest,
    hiddenCanaryDigest: collectiveHiddenCanaryDigestV1(hiddenCanary),
    limits: DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  });
  return {
    definition,
    hiddenCanary,
    inputDigest,
    intentDigest,
    monitorPolicy,
    outputDigest,
    registration,
    workContractDigest,
  };
}

function harnessFor(data = fixture()) {
  return createCollectiveDeterministicEnvironmentHarnessV1({
    schemaVersion: 1,
    registration: data.registration,
    monitorPolicy: data.monitorPolicy,
    definition: data.definition,
  });
}

function initialize(data, harness) {
  return harness.environment.initialize(
    createCollectiveEnvironmentInitializationV1({
      schemaVersion: 1,
      initializationId: 'initialization:alpha',
      registration: data.registration,
      initializedAtLogicalMs: 0,
    })
  );
}

function observationRequest(data, overrides = {}) {
  return createCollectiveEnvironmentObservationRequestV1({
    schemaVersion: 1,
    requestId: 'observation-request:alpha',
    registrationDigest: data.registration.bindingDigest,
    missionIntentId: data.registration.missionIntentId,
    intentRevision: data.registration.intentRevision,
    intentDigest: data.registration.intentDigest,
    peerId: 'peer-a',
    peerInstanceId: 'peer-a-instance-1',
    environmentCursor: 'cursor:0',
    maximumItems: 1,
    requestedAtLogicalMs: 0,
    ...overrides,
  });
}

function effectAttempt(
  data,
  work,
  fencingToken,
  idempotencyKey,
  overrides = {}
) {
  return createCollectiveProtectedEffectAttemptV1({
    schemaVersion: 1,
    attemptId: `attempt:${idempotencyKey}`,
    idempotencyKey,
    registrationDigest: data.registration.bindingDigest,
    tenantId: data.registration.tenantId,
    missionIntentId: data.registration.missionIntentId,
    intentRevision: data.registration.intentRevision,
    intentDigest: data.registration.intentDigest,
    peerId: 'peer-a',
    peerInstanceId: 'peer-a-instance-1',
    workItemId: `work:${work}`,
    workItemRevision: 1,
    workContractId: `contract:${work}`,
    workContractDigest: data.workContractDigest,
    assignmentEpoch: 1,
    authorityGeneration: 1,
    fencingToken,
    actionClass: 'publish-result',
    inputDigest: data.inputDigest,
    attemptedAtLogicalMs: 0,
    ...overrides,
  });
}

test('evaluation subpath derives ledger and monitor verdict from immutable event streams', () => {
  const data = fixture();
  const harness = harnessFor(data);
  assert.equal(
    auditCollectiveEnvironmentPortV1(harness.environment).passed,
    true
  );
  assert.equal(initialize(data, harness).status, 'initialized');
  assert.equal(
    harness.environment.observe(observationRequest(data)).receipt.status,
    'delivered'
  );
  assert.equal(
    harness.environment.applyEffect(
      effectAttempt(data, 'a', 'fence:a:1', 'effect-a-key')
    ).status,
    'committed'
  );
  const result = harness.finalize([{ publicResult: 'complete' }]);
  assert.equal(result.evidence.monitorVerdict.missionSuccess, true);
  assert.equal(result.evidence.monitorVerdict.partialSuccessUnits, 4);
  assert.equal(result.evidence.monitorVerdict.objectiveValue, 10);
  assert.equal(result.trace.ledger.observation, 1);
  assert.equal(result.trace.ledger.protected_action, 1);
  assert.deepEqual(
    replayCollectiveInteractionLedgerV2(
      result.trace.events,
      data.registration.limits.maximumInteractions
    ),
    result.trace.ledger
  );
  assert.throws(
    () =>
      replayCollectiveInteractionLedgerV2(
        [...result.trace.events].reverse(),
        data.registration.limits.maximumInteractions
      ),
    /append-only trace/u
  );

  const syntheticLedger = structuredClone(result.trace);
  syntheticLedger.ledger.total += 7;
  assert.throws(
    () => validateCollectiveTraceV2(syntheticLedger, data.registration),
    /replay|match|ledger/u
  );

  const constantVerdict = structuredClone(result.evidence);
  constantVerdict.monitorVerdict.missionSuccess = false;
  assert.throws(
    () =>
      validateCollectiveEvaluationBoundaryEvidenceV1(
        constantVerdict,
        data.hiddenCanary
      ),
    /verdict does not match/u
  );

  const originalCommit = result.evidence.monitorEvents.find(
    (event) => event.kind === 'effect.committed'
  );
  const syntheticCommit = createCollectiveInvariantMonitorEventV1({
    schemaVersion: 1,
    monitorEventId: originalCommit.monitorEventId,
    registrationDigest: originalCommit.registrationDigest,
    traceEventId: result.trace.events.find(
      (event) => event.kind === 'environment.effect.attempted'
    ).eventId,
    logicalTimeMs: originalCommit.logicalTimeMs,
    kind: originalCommit.kind,
    effectId: originalCommit.effectId,
    violationCode: originalCommit.violationCode,
    recordDigest: originalCommit.recordDigest,
    previousMonitorEventDigest: null,
  });
  assert.throws(
    () =>
      createCollectiveEvaluationBoundaryEvidenceV1({
        registration: data.registration,
        trace: result.trace,
        monitorPolicy: data.monitorPolicy,
        monitorEvents: [syntheticCommit],
        publicArtifacts: [],
        hiddenCanary: data.hiddenCanary,
      }),
    /committed trace witness/u
  );
});

test('reference world enforces peer-local cursors, exact fences, and before/after-commit semantics', () => {
  const data = fixture();
  const harness = harnessFor(data);
  const emptyMonitorSnapshot = harness.monitor.snapshot(null);
  initialize(data, harness);
  const delivered = harness.environment.observe(observationRequest(data));
  assert.equal(delivered.observations.length, 1);
  assert.equal(delivered.observations[0].observerPeerId, 'peer-a');
  assert.throws(
    () => harness.monitor.restore(emptyMonitorSnapshot),
    /may not roll back events/u
  );
  const conflict = harness.environment.observe(
    observationRequest(data, {
      requestId: 'observation-request:conflict',
      maximumItems: 2,
    })
  );
  assert.equal(conflict.receipt.reasonCode, 'cursor_conflict');
  const requestIdConflict = harness.environment.observe(
    observationRequest(data, {
      environmentCursor: 'cursor:1',
      maximumItems: 1,
    })
  );
  assert.equal(requestIdConflict.receipt.reasonCode, 'request_id_conflict');

  const stale = harness.environment.applyEffect(
    effectAttempt(data, 'a', 'fence:a:0', 'stale-key')
  );
  assert.equal(stale.reasonCode, 'stale_fence');
  const substitutedPeer = harness.environment.applyEffect(
    effectAttempt(data, 'a', 'fence:a:1', 'peer-substitution-key', {
      peerId: 'peer-b',
      peerInstanceId: 'peer-b-instance-1',
    })
  );
  assert.equal(substitutedPeer.reasonCode, 'work_contract_mismatch');

  const afterAttempt = effectAttempt(data, 'b', 'fence:b:1', 'after-key');
  assert.equal(
    harness.environment.applyEffect(afterAttempt).reasonCode,
    'timeout_after_commit'
  );
  assert.equal(
    harness.environment.applyEffect(afterAttempt).status,
    'committed'
  );
  const beforeAttempt = effectAttempt(data, 'c', 'fence:c:1', 'before-key');
  assert.equal(
    harness.environment.applyEffect(beforeAttempt).reasonCode,
    'timeout_before_commit'
  );
  const attemptIdConflict = effectAttempt(
    data,
    'c',
    'fence:c:1',
    'before-key-conflict',
    { attemptId: beforeAttempt.attemptId }
  );
  assert.equal(
    harness.environment.applyEffect(attemptIdConflict).reasonCode,
    'attempt_id_conflict'
  );
  assert.equal(
    harness.environment.applyEffect(beforeAttempt).reasonCode,
    'timeout_before_commit'
  );

  const result = harness.finalize();
  assert.equal(result.evidence.monitorVerdict.staleFenceViolations, 1);
  assert.equal(result.evidence.monitorVerdict.planAuthorityViolations, 1);
  assert.equal(result.evidence.monitorVerdict.missionSuccess, false);
});

test('opaque snapshots restore into a fresh harness without exposing hidden state', () => {
  const data = fixture();
  const source = harnessFor(data);
  initialize(data, source);
  const snapshot = source.environment.snapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'environmentStateDigest',
    'eventCount',
    'format',
    'logicalTimeMs',
    'registrationDigest',
    'schemaVersion',
    'seed',
    'snapshotDigest',
    'snapshotId',
    'traceRoot',
  ]);
  assert.equal(JSON.stringify(snapshot).includes(data.hiddenCanary), false);

  source.environment.observe(observationRequest(data));
  assert.equal(
    source.environment.restore(snapshot).reasonCode,
    'snapshot_rollback_rejected'
  );

  const divergent = harnessFor(data);
  divergent.environment.initialize(
    createCollectiveEnvironmentInitializationV1({
      schemaVersion: 1,
      initializationId: 'initialization:divergent',
      registration: data.registration,
      initializedAtLogicalMs: 1,
    })
  );
  assert.equal(
    divergent.environment.restore(snapshot).reasonCode,
    'snapshot_history_conflict'
  );

  const resumed = harnessFor(data);
  assert.equal(resumed.environment.restore(snapshot).status, 'restored');
  resumed.environment.observe(observationRequest(data));
  const resumedTrace = resumed.finalize().trace;

  const replay = harnessFor(data);
  initialize(data, replay);
  replay.environment.observe(observationRequest(data));
  assert.equal(resumedTrace.traceDigest, replay.finalize().trace.traceDigest);
});

test('boundary audit rejects oracle ports and canary encodings', () => {
  const data = fixture();
  const oraclePort = Object.freeze({
    version: 1,
    initialize() {},
    observe() {},
    applyEffect() {},
    advance() {},
    snapshot() {},
    restore() {},
    globalOracle() {},
  });
  const audit = auditCollectiveEnvironmentPortV1(oraclePort);
  assert.equal(audit.passed, false);
  assert.ok(
    audit.findings.some(
      (finding) => finding.code === 'runner_port_forbidden_member'
    )
  );
  const directAssignmentPort = Object.freeze({
    ...oraclePort,
    globalOracle: undefined,
    directAssign() {},
  });
  assert.ok(
    auditCollectiveEnvironmentPortV1(directAssignmentPort).findings.some(
      (finding) =>
        finding.code === 'runner_port_forbidden_member' &&
        finding.detail.includes('directAssign')
    )
  );
  let accessorInvoked = false;
  const accessorPort = {
    initialize() {},
    observe() {},
    applyEffect() {},
    advance() {},
    snapshot() {},
    restore() {},
  };
  Object.defineProperty(accessorPort, 'version', {
    enumerable: true,
    get() {
      accessorInvoked = true;
      return 1;
    },
  });
  Object.freeze(accessorPort);
  assert.equal(auditCollectiveEnvironmentPortV1(accessorPort).passed, false);
  assert.equal(accessorInvoked, false);

  const attachedState = () => {};
  Object.defineProperty(attachedState, 'hiddenState', {
    value: data.hiddenCanary,
  });
  const attachedStatePort = Object.freeze({
    version: 1,
    initialize() {},
    observe: attachedState,
    applyEffect() {},
    advance() {},
    snapshot() {},
    restore() {},
  });
  assert.ok(
    auditCollectiveEnvironmentPortV1(attachedStatePort).findings.some(
      (finding) => finding.code === 'runner_port_forbidden_member'
    )
  );

  assert.equal(
    scanCollectivePublicArtifactForCanaryV1(
      { value: data.hiddenCanary },
      data.hiddenCanary
    ),
    true
  );
  assert.equal(
    scanCollectivePublicArtifactForCanaryV1(
      { value: Buffer.from(data.hiddenCanary).toString('base64') },
      data.hiddenCanary
    ),
    true
  );
  const escapedCanary = 'private-"escaped\n-canary';
  assert.equal(
    scanCollectivePublicArtifactForCanaryV1(
      { value: escapedCanary },
      escapedCanary
    ),
    true
  );
  const harness = harnessFor(data);
  initialize(data, harness);
  assert.throws(
    () => harness.finalize([{ leaked: data.hiddenCanary }]),
    /canary leaked/u
  );
  const cleanResult = harness.finalize([{ status: 'clean' }]);
  assert.throws(
    () =>
      validateCollectiveEvaluationBoundaryEvidenceV1(
        cleanResult.evidence,
        'different-private-canary'
      ),
    /outside its registration binding/u
  );
});

test('canary scanning covers every ordinary evidence artifact class', () => {
  const data = fixture();
  for (const artifactClass of [
    'log',
    'trace',
    'report',
    'snapshot',
    'tarball_manifest',
  ]) {
    assert.equal(
      scanCollectivePublicArtifactForCanaryV1(
        {
          schemaVersion: 1,
          artifactClass,
          records: [{ status: 'clean', digest: hash({ artifactClass }) }],
        },
        data.hiddenCanary
      ),
      false
    );
    assert.equal(
      scanCollectivePublicArtifactForCanaryV1(
        {
          schemaVersion: 1,
          artifactClass,
          records: [
            {
              status: 'leaked',
              value: Buffer.from(data.hiddenCanary).toString('base64'),
            },
          ],
        },
        data.hiddenCanary
      ),
      true
    );
  }
});

test('evaluator monitor records remain independent and evidence-complete', () => {
  const data = fixture();
  const harness = harnessFor(data);
  const initialization = initialize(data, harness);
  harness.monitor.record(
    createCollectiveInvariantMonitorEventV1({
      schemaVersion: 1,
      monitorEventId: 'monitor-event:external:1',
      registrationDigest: data.registration.registrationDigest,
      traceEventId: null,
      logicalTimeMs: initialization.logicalTimeMs,
      kind: 'direct_assignment.violation',
      effectId: null,
      violationCode: 'runner_direct_assignment',
      recordDigest: hash({ finding: 'runner_direct_assignment' }),
      previousMonitorEventDigest: null,
    })
  );
  const result = harness.finalize();
  assert.equal(result.evidence.monitorVerdict.directAssignmentViolations, 1);
  assert.deepEqual(
    result.monitorSnapshot.events,
    result.evidence.monitorEvents
  );
});

test('interaction ceiling is replay-derived and forces a terminal monitor failure', () => {
  const data = fixture();
  const registration = createCollectiveEvaluationRegistrationBindingV1({
    schemaVersion: 1,
    registrationId: data.registration.registrationId,
    registrationDigest: data.registration.registrationDigest,
    tenantId: data.registration.tenantId,
    missionIntentId: data.registration.missionIntentId,
    intentRevision: data.registration.intentRevision,
    intentDigest: data.registration.intentDigest,
    runner: data.registration.runner,
    stratum: data.registration.stratum,
    seed: data.registration.seed,
    environmentDigest: data.registration.environmentDigest,
    observationPolicyDigest: data.registration.observationPolicyDigest,
    monitorDigest: data.registration.monitorDigest,
    hiddenCanaryDigest: data.registration.hiddenCanaryDigest,
    limits: { ...data.registration.limits, maximumInteractions: 1 },
  });
  const limited = { ...data, registration };
  const harness = harnessFor(limited);
  initialize(limited, harness);
  harness.environment.observe(observationRequest(limited));
  harness.environment.applyEffect(
    effectAttempt(limited, 'a', 'fence:a:1', 'limit-key')
  );
  const result = harness.finalize();
  assert.equal(result.trace.ledger.limitExceeded, true);
  assert.equal(result.evidence.monitorVerdict.missionSuccess, false);
  assert.equal(
    result.evidence.monitorVerdict.terminalReason,
    'terminal_failure'
  );
});

test('evaluation validators reject hostile array prototypes without invoking them', () => {
  let iteratorInvoked = false;
  const hostileEvents = [];
  Object.setPrototypeOf(hostileEvents, {
    [Symbol.iterator]() {
      iteratorInvoked = true;
      return [][Symbol.iterator]();
    },
  });
  assert.throws(
    () => replayCollectiveInteractionLedgerV2(hostileEvents, 10),
    /must be an array/u
  );
  assert.equal(iteratorInvoked, false);
});
