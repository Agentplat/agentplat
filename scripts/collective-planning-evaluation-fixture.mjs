import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { digestPlanningJsonV1 } from '@agentplat/collective-planning';
import {
  DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  createCollectiveEvaluationBoundaryEvidenceV1,
  createCollectiveEvaluationRegistrationBindingV1,
  createCollectiveInvariantMonitorEventV1,
  createCollectiveInvariantMonitorPolicyV1,
  createCollectiveTraceEventV2,
  createCollectiveTraceV2,
  validateCollectiveEvaluationBoundaryEvidenceV1,
} from '@agentplat/collective-planning/evaluation';

const fixturePath = new URL(
  '../packages/collective-planning/fixtures/beta3/evaluation-boundary-v1.json',
  import.meta.url
);
const hiddenCanary = 'fixture-canary-0001';
const hash = (value) => digestPlanningJsonV1('environment-state-v1', value);

function createFixture() {
  const registrationDigest = hash({ registration: 'fixture-registration-v1' });
  const hiddenCanaryDigest = hash({ hiddenCanary });
  const monitorPolicy = createCollectiveInvariantMonitorPolicyV1({
    schemaVersion: 1,
    policyId: 'fixture-monitor-policy-v1',
    registrationDigest,
    requiredEffects: [
      {
        schemaVersion: 1,
        effectId: 'effect:fixture',
        outcomeUnits: 2,
        objectiveValue: 5,
      },
    ],
    hiddenCanaryDigest,
  });
  const registration = createCollectiveEvaluationRegistrationBindingV1({
    schemaVersion: 1,
    registrationId: 'fixture-registration-v1',
    registrationDigest,
    tenantId: 'tenant-fixture',
    missionIntentId: 'mission-fixture',
    intentRevision: 1,
    intentDigest: hash({ intent: 'fixture-intent-v1' }),
    runner: 'adaptive_collective',
    stratum: 'nominal',
    seed: 17,
    environmentDigest: hash({ environment: 'fixture-environment-v1' }),
    observationPolicyDigest: hash({ observationPolicy: 'fixture-policy-v1' }),
    monitorDigest: monitorPolicy.policyDigest,
    hiddenCanaryDigest,
    limits: DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  });
  const attempted = createCollectiveTraceEventV2({
    schemaVersion: 2,
    eventId: 'fixture-event:0001',
    causalParentIds: [],
    registrationDigest: registration.bindingDigest,
    seed: registration.seed,
    runner: registration.runner,
    logicalTimeMs: 3,
    tenantId: registration.tenantId,
    missionIntentId: registration.missionIntentId,
    peerId: 'peer-fixture',
    component: 'environment',
    kind: 'environment.effect.attempted',
    status: 'observed',
    reasonCode: null,
    recordDigest: hash({ attempt: 'fixture-attempt-v1' }),
    stateDigestBefore: hash({ state: 0 }),
    stateDigestAfter: hash({ state: 0 }),
    faultBinding: null,
    previousTraceChainDigest: null,
  });
  const committed = createCollectiveTraceEventV2({
    schemaVersion: 2,
    eventId: 'fixture-event:0002',
    causalParentIds: [attempted.eventId],
    registrationDigest: registration.bindingDigest,
    seed: registration.seed,
    runner: registration.runner,
    logicalTimeMs: 3,
    tenantId: registration.tenantId,
    missionIntentId: registration.missionIntentId,
    peerId: 'peer-fixture',
    component: 'environment',
    kind: 'environment.effect.committed',
    status: 'accepted',
    reasonCode: null,
    recordDigest: hash({ effect: 'effect:fixture' }),
    stateDigestBefore: hash({ state: 0 }),
    stateDigestAfter: hash({ state: 1 }),
    faultBinding: null,
    previousTraceChainDigest: attempted.traceChainDigest,
  });
  const trace = createCollectiveTraceV2(registration, [attempted, committed]);
  const monitorEvent = createCollectiveInvariantMonitorEventV1({
    schemaVersion: 1,
    monitorEventId: 'fixture-monitor-event:0001',
    registrationDigest,
    traceEventId: committed.eventId,
    logicalTimeMs: 3,
    kind: 'effect.committed',
    effectId: 'effect:fixture',
    violationCode: null,
    recordDigest: hash({ effect: 'effect:fixture', committed: true }),
    previousMonitorEventDigest: null,
  });
  return createCollectiveEvaluationBoundaryEvidenceV1({
    registration,
    trace,
    monitorPolicy,
    monitorEvents: [monitorEvent],
    publicArtifacts: [{ status: 'complete', effectId: 'effect:fixture' }],
    hiddenCanary,
  });
}

const expected = createFixture();
if (process.argv.includes('--print')) {
  process.stdout.write(`${JSON.stringify(expected, null, 2)}\n`);
} else {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  assert.deepEqual(fixture, expected);
  assert.deepEqual(
    validateCollectiveEvaluationBoundaryEvidenceV1(fixture, hiddenCanary),
    expected
  );
  process.stdout.write(
    `${JSON.stringify({ status: 'passed', traceDigest: expected.trace.traceDigest, ledgerDigest: expected.trace.ledger.ledgerDigest, verdictDigest: expected.monitorVerdict.verdictDigest, evidenceDigest: expected.evidenceDigest })}\n`
  );
}
