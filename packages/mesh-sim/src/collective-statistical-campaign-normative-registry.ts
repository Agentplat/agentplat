import {
  validateNormativeRunnerDescriptorV1,
  type NormativeRunnerDescriptorV1,
} from '@agentplat/collective-planning/evaluation';

import type { PlanningDigestV1 } from '@agentplat/collective-planning';

import type {
  CollectiveStatisticalCampaignNormativeAdapterResolverPortV1,
  CollectiveStatisticalCampaignNormativeProjectionPortV1,
  CollectiveStatisticalCampaignNormativeRunnerPortV1,
  CollectiveStatisticalCampaignResolvedNormativeAdapterV1,
} from './collective-statistical-campaign-normative-operation.js';

const MAXIMUM_REGISTRATIONS = 128;
const MAXIMUM_BINDING_DIGESTS = 4_096;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;

export interface CollectiveStatisticalCampaignNormativeAdapterRegistrationV1 {
  readonly schemaVersion: 1;
  readonly descriptor: NormativeRunnerDescriptorV1;
  readonly runner: CollectiveStatisticalCampaignNormativeRunnerPortV1;
  readonly projector: CollectiveStatisticalCampaignNormativeProjectionPortV1;
  /** When present, only these operation plans may resolve this adapter. */
  readonly planDigests?: readonly PlanningDigestV1[];
  /** When present, only these signed operation statements may resolve it. */
  readonly authorizationDigests?: readonly PlanningDigestV1[];
}

export interface CollectiveStatisticalCampaignNormativeAdapterRegistryV1 {
  readonly schemaVersion: 1;
  readonly registrations: readonly CollectiveStatisticalCampaignNormativeAdapterRegistrationV1[];
}

/**
 * Builds a closed, in-memory trusted resolver from explicit registrations.
 * It deliberately accepts no module specifiers, URLs, credentials or runtime
 * registration calls: all runnable ports are fixed when this factory returns.
 */
export function createCollectiveStatisticalCampaignNormativeAdapterResolverV1(
  input: CollectiveStatisticalCampaignNormativeAdapterRegistryV1,
): CollectiveStatisticalCampaignNormativeAdapterResolverPortV1 {
  assertExactRecord(input, ['registrations', 'schemaVersion'], 'registry');
  if (input.schemaVersion !== 1) fail('registry_schema_invalid');
  const registrations = snapshotArray(
    input.registrations,
    MAXIMUM_REGISTRATIONS,
    'registrations',
  ).map(normalizeRegistration);
  const byDescriptor = new Map<PlanningDigestV1, NormalizedRegistration>();
  for (const registration of registrations) {
    if (byDescriptor.has(registration.descriptor.descriptorDigest))
      fail('registry_duplicate_descriptor');
    byDescriptor.set(registration.descriptor.descriptorDigest, registration);
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    resolveRegisteredAdapterV1(
      input: Parameters<
        CollectiveStatisticalCampaignNormativeAdapterResolverPortV1['resolveRegisteredAdapterV1']
      >[0],
    ) {
      assertExactRecord(
        input,
        [
          'authorizationDigest',
          'descriptorDigest',
          'evaluatorDigest',
          'implementationDigest',
          'planDigest',
          'purpose',
          'schemaVersion',
        ],
        'resolver input',
      );
      if (
        input.schemaVersion !== 1 ||
        input.purpose !== 'collective-statistical-campaign-normative-adapter-v1'
      )
        fail('resolver_input_invalid');
      assertDigest(input.descriptorDigest, 'descriptorDigest');
      assertDigest(input.implementationDigest, 'implementationDigest');
      assertDigest(input.evaluatorDigest, 'evaluatorDigest');
      assertDigest(input.planDigest, 'planDigest');
      assertDigest(input.authorizationDigest, 'authorizationDigest');

      const registration = byDescriptor.get(input.descriptorDigest);
      if (!registration) fail('registry_descriptor_unregistered');
      if (
        registration.descriptor.digests.implementationDigest !==
          input.implementationDigest ||
        registration.descriptor.digests.evaluatorDigest !==
          input.evaluatorDigest
      )
        fail('registry_descriptor_binding_mismatch');
      if (
        registration.planDigests &&
        !registration.planDigests.has(input.planDigest)
      )
        fail('registry_plan_unregistered');
      if (
        registration.authorizationDigests &&
        !registration.authorizationDigests.has(input.authorizationDigest)
      )
        fail('registry_authorization_unregistered');
      return Object.freeze({
        schemaVersion: 1 as const,
        descriptorDigest: registration.descriptor.descriptorDigest,
        implementationDigest:
          registration.descriptor.digests.implementationDigest,
        evaluatorDigest: registration.descriptor.digests.evaluatorDigest,
        runner: registration.runner,
        projector: registration.projector,
      });
    },
  });
}

interface NormalizedRegistration {
  readonly descriptor: NormativeRunnerDescriptorV1;
  readonly runner: CollectiveStatisticalCampaignNormativeRunnerPortV1;
  readonly projector: CollectiveStatisticalCampaignNormativeProjectionPortV1;
  readonly planDigests: ReadonlySet<PlanningDigestV1> | null;
  readonly authorizationDigests: ReadonlySet<PlanningDigestV1> | null;
}

function normalizeRegistration(
  input: CollectiveStatisticalCampaignNormativeAdapterRegistrationV1,
): NormalizedRegistration {
  assertExactRecord(
    input,
    [
      'authorizationDigests',
      'descriptor',
      'planDigests',
      'projector',
      'runner',
      'schemaVersion',
    ],
    'registration',
    ['authorizationDigests', 'planDigests'],
  );
  if (input.schemaVersion !== 1) fail('registration_schema_invalid');
  const descriptor = validateNormativeRunnerDescriptorV1(input.descriptor);
  if (descriptor.runnerClass !== 'normative_candidate')
    fail('registration_adapter_not_normative');
  return Object.freeze({
    descriptor,
    runner: normalizeRunner(input.runner),
    projector: normalizeProjector(input.projector),
    planDigests: normalizeOptionalDigestSet(input.planDigests, 'planDigests'),
    authorizationDigests: normalizeOptionalDigestSet(
      input.authorizationDigests,
      'authorizationDigests',
    ),
  });
}

function normalizeRunner(
  input: CollectiveStatisticalCampaignNormativeRunnerPortV1,
): CollectiveStatisticalCampaignNormativeRunnerPortV1 {
  assertExactRecord(input, ['executeV1', 'schemaVersion'], 'runner');
  if (input.schemaVersion !== 1 || typeof input.executeV1 !== 'function')
    fail('runner_invalid');
  return Object.freeze({
    schemaVersion: 1 as const,
    executeV1: input.executeV1,
  });
}

function normalizeProjector(
  input: CollectiveStatisticalCampaignNormativeProjectionPortV1,
): CollectiveStatisticalCampaignNormativeProjectionPortV1 {
  assertExactRecord(input, ['projectV1', 'schemaVersion'], 'projector');
  if (input.schemaVersion !== 1 || typeof input.projectV1 !== 'function')
    fail('projector_invalid');
  return Object.freeze({
    schemaVersion: 1 as const,
    projectV1: input.projectV1,
  });
}

function normalizeOptionalDigestSet(
  input: readonly PlanningDigestV1[] | undefined,
  label: string,
): ReadonlySet<PlanningDigestV1> | null {
  if (input === undefined) return null;
  const values = snapshotArray(input, MAXIMUM_BINDING_DIGESTS, label);
  if (values.length === 0) fail(`${label}_empty`);
  const result = new Set<PlanningDigestV1>();
  for (const value of values) {
    assertDigest(value, label);
    if (result.has(value)) fail(`${label}_duplicate`);
    result.add(value);
  }
  return result;
}

function snapshotArray<T>(
  input: readonly T[],
  maximum: number,
  label: string,
): T[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    Object.getOwnPropertySymbols(input).length !== 0 ||
    input.length > maximum
  )
    fail(`${label}_invalid`);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of Object.getOwnPropertyNames(input)) {
    if (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(key))
      fail(`${label}_unknown_field`);
  }
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor))
      fail(`${label}_sparse_or_accessor`);
  }
  return [...input];
}

function assertExactRecord(
  input: unknown,
  allowed: readonly string[],
  label: string,
  optional: readonly string[] = [],
): asserts input is Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.getOwnPropertySymbols(input).length !== 0
  )
    fail(`${label}_invalid`);
  const own = Object.getOwnPropertyNames(input).sort();
  const expected = [...allowed].sort();
  if (
    own.some((key) => !expected.includes(key)) ||
    expected.some((key) => !optional.includes(key) && !own.includes(key))
  )
    fail(`${label}_unknown_or_missing_field`);
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor))
      fail(`${label}_accessor_field`);
  }
}

function assertDigest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== 'string' || !digestPattern.test(value))
    fail(`${label}_invalid`);
}

function fail(reason: string): never {
  throw new TypeError(
    `collective_statistical_campaign_normative_registry_${reason}`,
  );
}
