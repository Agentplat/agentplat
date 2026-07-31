import { canonicalizeControlJsonV1, digestControlJsonV1 } from './canonical.js';
import type { JsonValue } from '@agentplat/core';
import type {
  InferenceControlPolicyV1,
  PolicyRecordV1,
  RequiredControlCapabilityV1,
} from './types.js';
import {
  INFERENCE_CONTROL_LIMITS_V1,
  assertDigest,
  assertControlToken,
  assertExactKeys,
  assertIdentifier,
  assertOneOf,
  assertSafeInteger,
  assertString,
  deepFreeze,
  sortedUnique,
} from './validation.js';

export function validateInferenceControlPolicyV1(
  value: unknown,
): InferenceControlPolicyV1 {
  const keys = [
    'schemaVersion',
    'policyId',
    'policyVersion',
    'parentPolicyDigest',
    'mode',
    'outputRisk',
    'checkpoints',
    'requiredCapabilities',
    'minimumCapabilityAssurance',
    'allowedCapabilityBindings',
    'allowedContextZones',
    'allowedTransformerBindings',
    'allowedActions',
    'allowedMessageChannels',
    'assessmentBindings',
    'budgets',
    'limits',
    'maximumRunDurationMs',
    'maximumAssessmentTtlMs',
    'maximumGrantTtlMs',
    'maximumMessagePermitTtlMs',
    'exhaustedDisposition',
    'coordinatedActionsRequired',
    'diagnosticsPolicyId',
    'redactionPolicyId',
  ];
  assertExactKeys(value, keys, 'policy');
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) throw new TypeError('Unsupported policy schema');
  for (const key of [
    'policyId',
    'diagnosticsPolicyId',
    'redactionPolicyId',
  ] as const)
    assertIdentifier(v[key], key);
  assertSafeInteger(v.policyVersion, 'policyVersion', 1);
  if (v.parentPolicyDigest !== null)
    assertDigest(v.parentPolicyDigest, 'parentPolicyDigest');
  assertOneOf(v.mode, ['observe', 'buffered', 'incremental'], 'mode');
  assertOneOf(v.outputRisk, ['low', 'moderate', 'high'], 'outputRisk');
  assertOneOf(
    v.minimumCapabilityAssurance,
    ['verified', 'declared'],
    'minimumCapabilityAssurance',
  );
  assertOneOf(
    v.exhaustedDisposition,
    ['abstain', 'escalate', 'deny'],
    'exhaustedDisposition',
  );
  for (const key of [
    'checkpoints',
    'requiredCapabilities',
    'allowedCapabilityBindings',
    'allowedContextZones',
    'allowedTransformerBindings',
    'allowedActions',
    'allowedMessageChannels',
    'assessmentBindings',
  ] as const)
    if (!Array.isArray(v[key])) throw new TypeError(`${key} must be an array`);
  const checkpoints = v.checkpoints as unknown[];
  for (const checkpoint of checkpoints)
    assertOneOf(
      checkpoint,
      ['pre_run', 'stream', 'post_run', 'pre_tool', 'pre_message'],
      'checkpoint',
    );
  sortedUnique(checkpoints as string[], 'checkpoints');
  const capabilities = v.requiredCapabilities as unknown[];
  const capabilityKeys = capabilities.map((item, index) => {
    assertExactKeys(item, ['kind', 'value'], `requiredCapabilities[${index}]`);
    const capability = item as Record<string, unknown>;
    assertOneOf(
      capability.kind,
      [
        'input_inspection',
        'final_output_assessment',
        'incremental_output_assessment',
        'release_interruption',
        'tool_interception',
        'message_interception',
        'representation_access',
      ],
      'capability.kind',
    );
    assertCapabilityPair(capability.kind, capability.value);
    return `${capability.kind}:${capability.value}`;
  });
  sortedUnique(capabilityKeys, 'requiredCapabilities');
  for (const [index, item] of (
    v.allowedCapabilityBindings as unknown[]
  ).entries()) {
    assertExactKeys(
      item,
      [
        'schemaVersion',
        'capabilityId',
        'descriptorVersion',
        'wrapperId',
        'wrapperVersion',
        'descriptorDigest',
        'requiredAssurance',
      ],
      `allowedCapabilityBindings[${index}]`,
    );
    const binding = item as Record<string, unknown>;
    if (binding.schemaVersion !== 1)
      throw new TypeError('Unsupported capability binding');
    for (const key of ['capabilityId', 'wrapperId'] as const)
      assertIdentifier(binding[key], key);
    for (const key of ['descriptorVersion', 'wrapperVersion'] as const)
      assertSafeInteger(binding[key], key, 1);
    assertDigest(binding.descriptorDigest, 'descriptorDigest');
    assertOneOf(
      binding.requiredAssurance,
      ['reference_tested', 'application_verified', 'declared'],
      'requiredAssurance',
    );
  }
  for (const zone of v.allowedContextZones as unknown[])
    assertOneOf(
      zone,
      [
        'policy',
        'objective',
        'local_trusted',
        'user_untrusted',
        'peer_untrusted',
        'tool_untrusted',
        'retrieval_untrusted',
        'provider_untrusted',
        'assessor_untrusted',
      ],
      'context zone',
    );
  sortedUnique(v.allowedContextZones as string[], 'allowedContextZones');
  for (const [index, item] of (
    v.allowedTransformerBindings as unknown[]
  ).entries()) {
    assertExactKeys(
      item,
      ['id', 'version'],
      `allowedTransformerBindings[${index}]`,
    );
    const binding = item as Record<string, unknown>;
    assertIdentifier(binding.id, 'transformer.id');
    assertSafeInteger(binding.version, 'transformer.version', 1);
  }
  for (const [index, item] of (v.allowedActions as unknown[]).entries()) {
    assertExactKeys(
      item,
      [
        'schemaVersion',
        'namespace',
        'toolId',
        'operation',
        'actionBindingId',
        'minimumActionBindingVersion',
      ],
      `allowedActions[${index}]`,
    );
    const action = item as Record<string, unknown>;
    if (action.schemaVersion !== 1)
      throw new TypeError('Unsupported action pattern');
    for (const key of [
      'namespace',
      'toolId',
      'operation',
      'actionBindingId',
    ] as const) {
      key === 'namespace' || key === 'operation'
        ? assertControlToken(action[key], key)
        : assertIdentifier(action[key], key);
    }
    assertSafeInteger(
      action.minimumActionBindingVersion,
      'minimumActionBindingVersion',
      1,
    );
  }
  for (const channel of v.allowedMessageChannels as unknown[])
    assertControlToken(channel, 'message channel');
  sortedUnique(v.allowedMessageChannels as string[], 'allowedMessageChannels');
  const assessorCheckpoints: string[] = [];
  for (const [index, item] of (v.assessmentBindings as unknown[]).entries()) {
    assertExactKeys(
      item,
      [
        'schemaVersion',
        'checkpoint',
        'assessorId',
        'assessorVersion',
        'assessorBindingDigest',
        'maximumResponseBytes',
        'maximumEvidenceReferences',
        'timeoutMs',
      ],
      `assessmentBindings[${index}]`,
    );
    const binding = item as Record<string, unknown>;
    if (binding.schemaVersion !== 1)
      throw new TypeError('Unsupported assessor binding');
    assertOneOf(
      binding.checkpoint,
      ['pre_run', 'stream', 'post_run', 'pre_tool', 'pre_message'],
      'assessment checkpoint',
    );
    assessorCheckpoints.push(binding.checkpoint);
    assertIdentifier(binding.assessorId, 'assessorId');
    assertSafeInteger(binding.assessorVersion, 'assessorVersion', 1);
    assertDigest(binding.assessorBindingDigest, 'assessorBindingDigest');
    assertSafeInteger(binding.maximumResponseBytes, 'maximumResponseBytes', 1);
    assertSafeInteger(
      binding.maximumEvidenceReferences,
      'maximumEvidenceReferences',
      1,
    );
    assertSafeInteger(binding.timeoutMs, 'timeoutMs', 1);
  }
  if (
    new Set(assessorCheckpoints).size !== assessorCheckpoints.length ||
    assessorCheckpoints.length !== checkpoints.length ||
    checkpoints.some(
      (checkpoint) => !assessorCheckpoints.includes(checkpoint as string),
    )
  )
    throw new TypeError(
      'Each checkpoint requires exactly one assessor binding',
    );
  assertExactKeys(v.budgets, ['revisions', 'retries', 'challenges'], 'budgets');
  for (const key of ['revisions', 'retries', 'challenges'] as const)
    assertSafeInteger(
      (v.budgets as Record<string, unknown>)[key],
      `budgets.${key}`,
    );
  assertExactKeys(v.limits, Object.keys(INFERENCE_CONTROL_LIMITS_V1), 'limits');
  for (const key of Object.keys(INFERENCE_CONTROL_LIMITS_V1) as Array<
    keyof typeof INFERENCE_CONTROL_LIMITS_V1
  >) {
    const limit = (v.limits as unknown as Record<string, unknown>)[key];
    assertSafeInteger(limit, `limits.${key}`, 1);
    if ((limit as number) > INFERENCE_CONTROL_LIMITS_V1[key])
      throw new TypeError(`limits.${key} exceeds its hard ceiling`);
  }
  for (const key of [
    'maximumRunDurationMs',
    'maximumAssessmentTtlMs',
    'maximumGrantTtlMs',
    'maximumMessagePermitTtlMs',
  ] as const)
    assertSafeInteger(v[key], key, 1);
  if (typeof v.coordinatedActionsRequired !== 'boolean')
    throw new TypeError('coordinatedActionsRequired must be boolean');
  const limits = v.limits as unknown as InferenceControlPolicyV1['limits'];
  if (
    (v.maximumRunDurationMs as number) > limits.maxRunDurationMs ||
    (v.maximumAssessmentTtlMs as number) > limits.maxAssessmentTtlMs ||
    (v.maximumGrantTtlMs as number) > limits.maxGrantTtlMs ||
    (v.maximumMessagePermitTtlMs as number) > limits.maxMessagePermitTtlMs
  )
    throw new TypeError('Policy TTL exceeds its limits');
  if (
    (v.allowedActions as unknown[]).length > 0 &&
    (!checkpoints.includes('pre_tool') ||
      !assessorCheckpoints.includes('pre_tool'))
  )
    throw new TypeError('Actions require pre_tool assessment');
  if (
    (v.allowedMessageChannels as unknown[]).length > 0 &&
    (!checkpoints.includes('pre_message') ||
      !assessorCheckpoints.includes('pre_message'))
  )
    throw new TypeError('Messages require pre_message assessment');
  if (
    v.outputRisk === 'high' &&
    (v.mode !== 'buffered' ||
      v.minimumCapabilityAssurance !== 'verified' ||
      !checkpoints.includes('pre_run') ||
      !checkpoints.includes('post_run'))
  )
    throw new TypeError('release_mode_incompatible');
  return deepFreeze({ ...v } as unknown as InferenceControlPolicyV1);
}

function assertCapabilityPair(kind: unknown, value: unknown): void {
  switch (kind) {
    case 'input_inspection':
    case 'final_output_assessment':
      assertOneOf(value, ['full'], 'capability.value');
      return;
    case 'incremental_output_assessment':
      assertOneOf(value, ['windowed'], 'capability.value');
      return;
    case 'release_interruption':
      assertOneOf(value, ['local'], 'capability.value');
      return;
    case 'tool_interception':
      assertOneOf(value, ['application_only', 'all'], 'capability.value');
      return;
    case 'message_interception':
      assertOneOf(value, ['application_only'], 'capability.value');
      return;
    case 'representation_access':
      assertOneOf(value, ['opaque', 'token'], 'capability.value');
      return;
    default:
      throw new TypeError('capability.kind is invalid');
  }
}
export function createPolicyRecordV1(
  policy: InferenceControlPolicyV1,
): PolicyRecordV1 {
  const validated = validateInferenceControlPolicyV1(policy);
  return deepFreeze({
    schemaVersion: 1,
    policyDigest: digestControlJsonV1(
      'policy',
      validated as unknown as import('@agentplat/core').JsonValue,
    ),
    policy: validated,
  });
}

/**
 * Validates an Objective-scoped policy revision against its immutable local
 * parent. A remote revision may remove authority or tighten a bound, but may
 * not select a different enforcement model, dependency, action, channel or
 * larger resource/continuation budget.
 */
export function assertPolicyNarrowingV1(
  parentInput: InferenceControlPolicyV1,
  childInput: InferenceControlPolicyV1,
): InferenceControlPolicyV1 {
  const parent = validateInferenceControlPolicyV1(parentInput);
  const child = validateInferenceControlPolicyV1(childInput);
  const parentDigest = createPolicyRecordV1(parent).policyDigest;
  if (
    child.parentPolicyDigest !== parentDigest ||
    child.policyId !== parent.policyId ||
    child.policyVersion <= parent.policyVersion ||
    child.mode !== parent.mode ||
    riskRank(child.outputRisk) < riskRank(parent.outputRisk) ||
    child.exhaustedDisposition !== parent.exhaustedDisposition ||
    child.diagnosticsPolicyId !== parent.diagnosticsPolicyId ||
    child.redactionPolicyId !== parent.redactionPolicyId ||
    (parent.coordinatedActionsRequired && !child.coordinatedActionsRequired) ||
    (parent.minimumCapabilityAssurance === 'verified' &&
      child.minimumCapabilityAssurance !== 'verified')
  )
    throw new TypeError('policy_narrowing_invalid');

  if (!sameStrings(parent.checkpoints, child.checkpoints))
    throw new TypeError('policy_narrowing_invalid');
  for (const required of parent.requiredCapabilities)
    if (
      !child.requiredCapabilities.some((candidate) =>
        capabilityRequirementCovers(candidate, required),
      )
    )
      throw new TypeError('policy_narrowing_invalid');
  if (
    !isCanonicalSubset(
      child.allowedCapabilityBindings,
      parent.allowedCapabilityBindings,
    ) ||
    !isStringSubset(child.allowedContextZones, parent.allowedContextZones) ||
    !isCanonicalSubset(
      child.allowedTransformerBindings,
      parent.allowedTransformerBindings,
    ) ||
    !isStringSubset(child.allowedMessageChannels, parent.allowedMessageChannels)
  )
    throw new TypeError('policy_narrowing_invalid');

  for (const action of child.allowedActions) {
    const ceiling = parent.allowedActions.find(
      (candidate) =>
        candidate.namespace === action.namespace &&
        candidate.toolId === action.toolId &&
        candidate.operation === action.operation &&
        candidate.actionBindingId === action.actionBindingId,
    );
    if (
      !ceiling ||
      action.minimumActionBindingVersion < ceiling.minimumActionBindingVersion
    )
      throw new TypeError('policy_narrowing_invalid');
  }

  for (const binding of child.assessmentBindings) {
    const ceiling = parent.assessmentBindings.find(
      (candidate) => candidate.checkpoint === binding.checkpoint,
    );
    if (
      !ceiling ||
      binding.assessorId !== ceiling.assessorId ||
      binding.assessorVersion !== ceiling.assessorVersion ||
      binding.assessorBindingDigest !== ceiling.assessorBindingDigest ||
      binding.maximumResponseBytes > ceiling.maximumResponseBytes ||
      binding.maximumEvidenceReferences > ceiling.maximumEvidenceReferences ||
      binding.timeoutMs > ceiling.timeoutMs
    )
      throw new TypeError('policy_narrowing_invalid');
  }

  for (const key of ['revisions', 'retries', 'challenges'] as const)
    if (child.budgets[key] > parent.budgets[key])
      throw new TypeError('policy_narrowing_invalid');
  for (const key of Object.keys(INFERENCE_CONTROL_LIMITS_V1) as Array<
    keyof typeof INFERENCE_CONTROL_LIMITS_V1
  >)
    if (child.limits[key] > parent.limits[key])
      throw new TypeError('policy_narrowing_invalid');
  for (const key of [
    'maximumRunDurationMs',
    'maximumAssessmentTtlMs',
    'maximumGrantTtlMs',
    'maximumMessagePermitTtlMs',
  ] as const)
    if (child[key] > parent[key])
      throw new TypeError('policy_narrowing_invalid');
  return child;
}

function riskRank(value: InferenceControlPolicyV1['outputRisk']): number {
  return value === 'low' ? 0 : value === 'moderate' ? 1 : 2;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

function isStringSubset(
  subset: readonly string[],
  ceiling: readonly string[],
): boolean {
  return subset.every((value) => ceiling.includes(value));
}

function isCanonicalSubset<T>(
  subset: readonly T[],
  ceiling: readonly T[],
): boolean {
  const allowed = new Set(
    ceiling.map((value) => canonicalizeControlJsonV1(value as JsonValue)),
  );
  return subset.every((value) =>
    allowed.has(canonicalizeControlJsonV1(value as JsonValue)),
  );
}

function capabilityRequirementCovers(
  candidate: RequiredControlCapabilityV1,
  ceiling: RequiredControlCapabilityV1,
): boolean {
  if (candidate.kind !== ceiling.kind) return false;
  if (candidate.kind === 'tool_interception')
    return (
      candidate.value === ceiling.value ||
      (candidate.value === 'all' && ceiling.value === 'application_only')
    );
  return candidate.value === ceiling.value;
}
