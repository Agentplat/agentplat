import assert from 'node:assert/strict';
import test from 'node:test';

import { createNormativeRunnerDescriptorV1 } from '../packages/collective-planning/dist/evaluation.js';
import { createCollectiveStatisticalCampaignNormativeAdapterResolverV1 } from '../packages/mesh-sim/dist/index.js';

const d = (value) => `sha256:${value.repeat(64)}`;

function descriptor(runnerClass = 'normative_candidate', suffix = 'test') {
  return createNormativeRunnerDescriptorV1({
    schemaVersion: 1,
    adapterId: `adapter:registry-${suffix}`,
    adapterVersion: '1',
    runnerClass,
    capabilities: {
      schemaVersion: 1,
      runners: ['adaptive_collective', 'centralized_planner'],
      scales: [50, 100, 250, 500],
      strata: ['nominal', 'benign', 'adversarial', 'mixed'],
      traceSchemaVersion: 2,
      accountingVersion: 'interaction-accounting-v2',
      environmentPortVersion: 1,
      monitorPortVersion: 1,
      exactReplay: true,
      evaluatorOwnedMetrics: true,
    },
    digests: {
      schemaVersion: 1,
      implementationDigest: d('1'),
      evaluatorDigest: d('2'),
      scenarioDefinitionDigest: d('3'),
      fixtureDigest: d('4'),
      policyDigest: d('5'),
      environmentDigest: d('6'),
      observationPolicyDigest: d('7'),
      monitorDigest: d('8'),
    },
    limits: {
      schemaVersion: 1,
      maximumAgents: 500,
      maximumOutdegree: 9,
      maximumInteractionsPerExecution: 5000,
      maximumTraceEventsPerExecution: 100000,
      maximumArtifactBytesPerExecution: 67108864,
      maximumConcurrentCells: 1,
    },
  });
}

function registration(change = {}) {
  const value = {
    schemaVersion: 1,
    descriptor: descriptor(),
    runner: {
      schemaVersion: 1,
      executeV1: () => ({ runner: 'registered' }),
    },
    projector: {
      schemaVersion: 1,
      projectV1: () => ({ projection: 'registered' }),
    },
    ...change,
  };
  return value;
}

function resolve(resolver, descriptorValue = descriptor(), change = {}) {
  return resolver.resolveRegisteredAdapterV1({
    schemaVersion: 1,
    purpose: 'collective-statistical-campaign-normative-adapter-v1',
    descriptorDigest: descriptorValue.descriptorDigest,
    implementationDigest: descriptorValue.digests.implementationDigest,
    evaluatorDigest: descriptorValue.digests.evaluatorDigest,
    planDigest: d('a'),
    authorizationDigest: d('b'),
    ...change,
  });
}

test('resolves only a registered normative descriptor with separate frozen ports', () => {
  const input = registration();
  const resolver =
    createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
      schemaVersion: 1,
      registrations: [input],
    });
  const resolved = resolve(resolver, input.descriptor);
  assert.equal(resolved.descriptorDigest, input.descriptor.descriptorDigest);
  assert.notEqual(resolved.runner, input.runner);
  assert.notEqual(resolved.projector, input.projector);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.runner), true);
  assert.equal(Object.isFrozen(resolved.projector), true);
  const original = resolved.runner.executeV1;
  input.runner.executeV1 = () => ({ runner: 'mutated' });
  assert.equal(resolve(resolver, input.descriptor).runner.executeV1, original);
});

test('requires exact descriptor implementation and evaluator commitments', () => {
  const input = registration();
  const resolver =
    createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
      schemaVersion: 1,
      registrations: [input],
    });
  assert.throws(
    () => resolve(resolver, input.descriptor, { implementationDigest: d('f') }),
    /registry_descriptor_binding_mismatch/u,
  );
  assert.throws(
    () => resolve(resolver, input.descriptor, { evaluatorDigest: d('e') }),
    /registry_descriptor_binding_mismatch/u,
  );
  assert.throws(
    () => resolve(resolver, descriptor('normative_candidate', 'other')),
    /registry_descriptor_unregistered/u,
  );
});

test('enforces optional plan and authorization allowlists', () => {
  const input = registration({
    planDigests: [d('a')],
    authorizationDigests: [d('b')],
  });
  const resolver =
    createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
      schemaVersion: 1,
      registrations: [input],
    });
  assert.doesNotThrow(() => resolve(resolver, input.descriptor));
  assert.throws(
    () => resolve(resolver, input.descriptor, { planDigest: d('c') }),
    /registry_plan_unregistered/u,
  );
  assert.throws(
    () => resolve(resolver, input.descriptor, { authorizationDigest: d('d') }),
    /registry_authorization_unregistered/u,
  );
});

test('rejects non-normative, duplicate, prototype, symbol, accessor and unknown registrations', () => {
  assert.throws(
    () =>
      createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
        schemaVersion: 1,
        registrations: [registration({ descriptor: descriptor('diagnostic') })],
      }),
    /registration_adapter_not_normative/u,
  );
  const first = registration();
  assert.throws(
    () =>
      createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
        schemaVersion: 1,
        registrations: [first, registration()],
      }),
    /registry_duplicate_descriptor/u,
  );
  const withUnknown = registration({ arbitrary: true });
  assert.throws(
    () =>
      createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
        schemaVersion: 1,
        registrations: [withUnknown],
      }),
    /registration_unknown_or_missing_field/u,
  );
  const withSymbol = registration();
  withSymbol[Symbol('unexpected')] = true;
  assert.throws(
    () =>
      createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
        schemaVersion: 1,
        registrations: [withSymbol],
      }),
    /registration_invalid/u,
  );
  const nullPrototype = Object.assign(Object.create(null), registration());
  assert.throws(
    () =>
      createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
        schemaVersion: 1,
        registrations: [nullPrototype],
      }),
    /registration_invalid/u,
  );
  const accessor = registration();
  Object.defineProperty(accessor, 'runner', {
    enumerable: true,
    get: () => registration().runner,
  });
  assert.throws(
    () =>
      createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
        schemaVersion: 1,
        registrations: [accessor],
      }),
    /registration_accessor_field/u,
  );
});

test('rejects malformed resolver inputs before lookup', () => {
  const input = registration();
  const resolver =
    createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
      schemaVersion: 1,
      registrations: [input],
    });
  assert.throws(
    () => resolve(resolver, input.descriptor, { arbitrary: true }),
    /resolver input_unknown_or_missing_field/u,
  );
  const bad = Object.assign(Object.create(null), {
    schemaVersion: 1,
    purpose: 'collective-statistical-campaign-normative-adapter-v1',
    descriptorDigest: input.descriptor.descriptorDigest,
    implementationDigest: input.descriptor.digests.implementationDigest,
    evaluatorDigest: input.descriptor.digests.evaluatorDigest,
    planDigest: d('a'),
    authorizationDigest: d('b'),
  });
  assert.throws(
    () => resolver.resolveRegisteredAdapterV1(bad),
    /resolver input_invalid/u,
  );
});
