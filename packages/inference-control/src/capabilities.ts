import { digestControlJsonV1 } from './canonical.js';
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertOneOf,
  assertSafeInteger,
  assertString,
  compareCodeUnits,
  deepFreeze,
  sortedUnique,
} from './validation.js';
import type {
  CapabilityAssuranceV1,
  CapabilityBindingRequirementV1,
  CapabilityDescriptorV1,
  CapabilityHandleV1,
  ControlCheckpointV1,
  RequiredControlCapabilityV1,
  ReleaseModeV1,
} from './types.js';

const descriptorKeys = [
  'schemaVersion',
  'capabilityId',
  'descriptorVersion',
  'inputInspection',
  'finalOutputAssessment',
  'incrementalOutputAssessment',
  'releaseInterruption',
  'toolInterception',
  'messageInterception',
  'representationAccess',
  'declarationSource',
  'assurance',
  'wrapperId',
  'wrapperVersion',
] as const;
export function validateCapabilityDescriptorV1(
  value: unknown,
): CapabilityDescriptorV1 {
  assertExactKeys(value, descriptorKeys, 'capability descriptor');
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1)
    throw new TypeError('Unsupported capability schema');
  assertIdentifier(v.capabilityId, 'capabilityId');
  assertSafeInteger(v.descriptorVersion, 'descriptorVersion', 1);
  assertIdentifier(v.wrapperId, 'wrapperId');
  assertSafeInteger(v.wrapperVersion, 'wrapperVersion', 1);
  assertOneOf(v.inputInspection, ['full', 'none'], 'inputInspection');
  assertOneOf(
    v.finalOutputAssessment,
    ['full', 'none'],
    'finalOutputAssessment',
  );
  assertOneOf(
    v.incrementalOutputAssessment,
    ['windowed', 'none'],
    'incrementalOutputAssessment',
  );
  assertOneOf(v.releaseInterruption, ['local', 'none'], 'releaseInterruption');
  assertOneOf(
    v.toolInterception,
    ['all', 'application_only', 'none'],
    'toolInterception',
  );
  assertOneOf(
    v.messageInterception,
    ['application_only', 'none'],
    'messageInterception',
  );
  assertOneOf(
    v.representationAccess,
    ['none', 'opaque', 'token'],
    'representationAccess',
  );
  assertOneOf(v.declarationSource, ['wrapper', 'adapter'], 'declarationSource');
  assertOneOf(
    v.assurance,
    ['reference_tested', 'application_verified', 'declared'],
    'assurance',
  );
  return deepFreeze({ ...v } as unknown as CapabilityDescriptorV1);
}
export class CapabilityRegistryV1 {
  #entries = new Map<
    string,
    { descriptor: CapabilityDescriptorV1; handle: CapabilityHandleV1 }
  >();
  register(input: {
    descriptor: CapabilityDescriptorV1;
    descriptorDigest?: string;
    wrapperInstanceId: string;
  }): CapabilityHandleV1 {
    const descriptor = validateCapabilityDescriptorV1(input.descriptor);
    assertIdentifier(input.wrapperInstanceId, 'wrapperInstanceId');
    const digest = digestControlJsonV1(
      'capability',
      descriptor as unknown as import('@agentplat/core').JsonValue,
    );
    if (input.descriptorDigest !== undefined) {
      assertDigest(input.descriptorDigest, 'descriptorDigest');
      if (input.descriptorDigest !== digest)
        throw new TypeError('descriptorDigest does not match descriptor');
    }
    const id = `${descriptor.capabilityId}:${descriptor.descriptorVersion}:${descriptor.wrapperId}:${descriptor.wrapperVersion}:${input.wrapperInstanceId}`;
    const prior = this.#entries.get(id);
    if (prior && prior.handle.descriptorDigest !== digest)
      throw new TypeError(
        'Capability identity is already bound to different content',
      );
    if (prior) return prior.handle;
    const handle = deepFreeze({
      schemaVersion: 1 as const,
      capabilityHandleId: id,
      capabilityId: descriptor.capabilityId,
      descriptorVersion: descriptor.descriptorVersion,
      wrapperId: descriptor.wrapperId,
      wrapperVersion: descriptor.wrapperVersion,
      wrapperInstanceId: input.wrapperInstanceId,
      descriptorDigest: digest,
    });
    this.#entries.set(id, { descriptor, handle });
    return handle;
  }
  resolve(handleId: string): CapabilityHandleV1 | undefined {
    return this.#entries.get(handleId)?.handle;
  }
  descriptor(handleId: string): CapabilityDescriptorV1 | undefined {
    return this.#entries.get(handleId)?.descriptor;
  }
  rebind(binding: CapabilityBindingRequirementV1): CapabilityHandleV1 {
    assertExactKeys(
      binding,
      [
        'schemaVersion',
        'capabilityId',
        'descriptorVersion',
        'wrapperId',
        'wrapperVersion',
        'descriptorDigest',
        'requiredAssurance',
      ],
      'capability binding',
    );
    if (binding.schemaVersion !== 1)
      throw new TypeError('dependency_rebind_failed');
    assertDigest(binding.descriptorDigest, 'binding.descriptorDigest');
    for (const entry of this.#entries.values())
      if (
        bindingMatches(entry.handle, binding) &&
        entry.descriptor.assurance === binding.requiredAssurance
      )
        return entry.handle;
    throw new TypeError('dependency_rebind_failed');
  }
}
export function bindingMatches(
  handle: CapabilityHandleV1,
  binding: CapabilityBindingRequirementV1,
): boolean {
  return (
    handle.capabilityId === binding.capabilityId &&
    handle.descriptorVersion === binding.descriptorVersion &&
    handle.wrapperId === binding.wrapperId &&
    handle.wrapperVersion === binding.wrapperVersion &&
    handle.descriptorDigest === binding.descriptorDigest
  );
}
export interface CapabilityNegotiationInputV1 {
  readonly policyDigest: string;
  readonly descriptorDigest: string;
  readonly mode: ReleaseModeV1;
  readonly checkpoints: readonly ControlCheckpointV1[];
  readonly requiredCapabilities: readonly RequiredControlCapabilityV1[];
  readonly minimumCapabilityAssurance: CapabilityAssuranceV1;
  readonly allowedCapabilityBindings: readonly CapabilityBindingRequirementV1[];
}
export type CapabilityNegotiationResultV1 =
  | {
      schemaVersion: 1;
      policyDigest: string;
      descriptorDigest: string;
      accepted: true;
      effectiveReleaseMode: ReleaseModeV1;
      enforcedCheckpoints: readonly ControlCheckpointV1[];
      observedCheckpoints: readonly ControlCheckpointV1[];
    }
  | {
      schemaVersion: 1;
      policyDigest: string;
      descriptorDigest: string;
      accepted: false;
      reasonCode: 'policy_capability_missing' | 'release_mode_incompatible';
      missingCapabilities: readonly RequiredControlCapabilityV1[];
    };

/** Validates the complete, replayable result of a capability negotiation. */
export function validateCapabilityNegotiationResultV1(
  value: unknown,
): CapabilityNegotiationResultV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('capability negotiation result must be an object');
  const result = value as Record<string, unknown>;
  if (result.accepted === true) {
    assertExactKeys(
      result,
      [
        'schemaVersion',
        'policyDigest',
        'descriptorDigest',
        'accepted',
        'effectiveReleaseMode',
        'enforcedCheckpoints',
        'observedCheckpoints',
      ],
      'accepted capability negotiation result',
    );
    if (result.schemaVersion !== 1)
      throw new TypeError('Unsupported capability negotiation schema');
    assertDigest(result.policyDigest, 'policyDigest');
    assertDigest(result.descriptorDigest, 'descriptorDigest');
    assertOneOf(
      result.effectiveReleaseMode,
      ['observe', 'buffered', 'incremental'],
      'effectiveReleaseMode',
    );
    validateCheckpoints(result.enforcedCheckpoints, 'enforcedCheckpoints');
    validateCheckpoints(result.observedCheckpoints, 'observedCheckpoints');
    const enforced =
      result.enforcedCheckpoints as readonly ControlCheckpointV1[];
    const observed =
      result.observedCheckpoints as readonly ControlCheckpointV1[];
    if (enforced.some((checkpoint) => observed.includes(checkpoint)))
      throw new TypeError('capability negotiation checkpoint is duplicated');
    return deepFreeze(structuredClone(result) as CapabilityNegotiationResultV1);
  }
  if (result.accepted !== false)
    throw new TypeError('capability negotiation accepted must be boolean');
  assertExactKeys(
    result,
    [
      'schemaVersion',
      'policyDigest',
      'descriptorDigest',
      'accepted',
      'reasonCode',
      'missingCapabilities',
    ],
    'rejected capability negotiation result',
  );
  if (result.schemaVersion !== 1)
    throw new TypeError('Unsupported capability negotiation schema');
  assertDigest(result.policyDigest, 'policyDigest');
  assertDigest(result.descriptorDigest, 'descriptorDigest');
  assertOneOf(
    result.reasonCode,
    ['policy_capability_missing', 'release_mode_incompatible'],
    'reasonCode',
  );
  if (!Array.isArray(result.missingCapabilities))
    throw new TypeError('missingCapabilities must be an array');
  for (const requirement of result.missingCapabilities)
    validateRequirement(requirement as RequiredControlCapabilityV1);
  sortedUnique(
    result.missingCapabilities.map(
      (requirement) =>
        `${(requirement as RequiredControlCapabilityV1).kind}:${(requirement as RequiredControlCapabilityV1).value}`,
    ),
    'missingCapabilities',
  );
  return deepFreeze(structuredClone(result) as CapabilityNegotiationResultV1);
}

function validateCheckpoints(value: unknown, name: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  for (const checkpoint of value)
    assertOneOf(
      checkpoint,
      ['pre_run', 'stream', 'post_run', 'pre_tool', 'pre_message'],
      name,
    );
  sortedUnique(value, name);
}
export function negotiateCapabilitiesV1(
  descriptorInput: CapabilityDescriptorV1,
  input: CapabilityNegotiationInputV1,
): CapabilityNegotiationResultV1 {
  const descriptor = validateCapabilityDescriptorV1(descriptorInput);
  assertDigest(input.policyDigest, 'policyDigest');
  assertDigest(input.descriptorDigest, 'descriptorDigest');
  assertOneOf(input.mode, ['observe', 'buffered', 'incremental'], 'mode');
  assertOneOf(
    input.minimumCapabilityAssurance,
    ['verified', 'declared'],
    'minimumCapabilityAssurance',
  );
  for (const checkpoint of input.checkpoints)
    assertOneOf(
      checkpoint,
      ['pre_run', 'stream', 'post_run', 'pre_tool', 'pre_message'],
      'checkpoint',
    );
  sortedUnique(input.checkpoints, 'checkpoints');
  for (const requirement of input.requiredCapabilities)
    validateRequirement(requirement);
  sortedUnique(
    input.requiredCapabilities.map(
      (requirement) => `${requirement.kind}:${requirement.value}`,
    ),
    'requiredCapabilities',
  );
  for (const binding of input.allowedCapabilityBindings)
    validateBinding(binding);
  const actualDigest = digestControlJsonV1(
    'capability',
    descriptor as unknown as import('@agentplat/core').JsonValue,
  );
  if (input.descriptorDigest !== actualDigest)
    throw new TypeError('descriptorDigest does not match descriptor');
  const requirements = [...input.requiredCapabilities];
  if (input.mode === 'incremental') {
    requirements.push(
      { kind: 'incremental_output_assessment', value: 'windowed' },
      { kind: 'release_interruption', value: 'local' },
    );
  }
  const missing = requirements.filter(
    (requirement) => !requirementSatisfied(descriptor, requirement),
  );
  const allowed = input.allowedCapabilityBindings.some(
    (binding) =>
      bindingMatches(
        {
          schemaVersion: 1,
          capabilityHandleId: 'negotiation',
          capabilityId: descriptor.capabilityId,
          descriptorVersion: descriptor.descriptorVersion,
          wrapperId: descriptor.wrapperId,
          wrapperVersion: descriptor.wrapperVersion,
          wrapperInstanceId: 'negotiation',
          descriptorDigest: actualDigest,
        },
        binding,
      ) && binding.requiredAssurance === descriptor.assurance,
  );
  const verified =
    descriptor.assurance === 'reference_tested' ||
    descriptor.assurance === 'application_verified';
  if (input.mode === 'observe')
    return {
      schemaVersion: 1,
      policyDigest: input.policyDigest,
      descriptorDigest: actualDigest,
      accepted: true,
      effectiveReleaseMode: 'observe',
      enforcedCheckpoints: [],
      observedCheckpoints: [...input.checkpoints].sort(),
    };
  if (
    !allowed ||
    (input.minimumCapabilityAssurance === 'verified' && !verified) ||
    descriptor.assurance === 'declared' ||
    missing.length
  )
    return {
      schemaVersion: 1,
      policyDigest: input.policyDigest,
      descriptorDigest: actualDigest,
      accepted: false,
      reasonCode: 'policy_capability_missing',
      missingCapabilities: [...missing].sort(compareRequirement),
    };
  if (
    input.mode === 'incremental' &&
    descriptor.releaseInterruption !== 'local'
  )
    return {
      schemaVersion: 1,
      policyDigest: input.policyDigest,
      descriptorDigest: actualDigest,
      accepted: false,
      reasonCode: 'release_mode_incompatible',
      missingCapabilities: [],
    };
  return {
    schemaVersion: 1,
    policyDigest: input.policyDigest,
    descriptorDigest: actualDigest,
    accepted: true,
    effectiveReleaseMode: input.mode,
    enforcedCheckpoints: [...input.checkpoints].sort(),
    observedCheckpoints: [],
  };
}

function validateBinding(binding: CapabilityBindingRequirementV1): void {
  assertExactKeys(
    binding,
    [
      'schemaVersion',
      'capabilityId',
      'descriptorVersion',
      'wrapperId',
      'wrapperVersion',
      'descriptorDigest',
      'requiredAssurance',
    ],
    'capability binding',
  );
  if (binding.schemaVersion !== 1)
    throw new TypeError('Unsupported capability binding');
  assertIdentifier(binding.capabilityId, 'capabilityId');
  assertSafeInteger(binding.descriptorVersion, 'descriptorVersion', 1);
  assertIdentifier(binding.wrapperId, 'wrapperId');
  assertSafeInteger(binding.wrapperVersion, 'wrapperVersion', 1);
  assertDigest(binding.descriptorDigest, 'descriptorDigest');
  assertOneOf(
    binding.requiredAssurance,
    ['reference_tested', 'application_verified', 'declared'],
    'requiredAssurance',
  );
}
function validateRequirement(value: RequiredControlCapabilityV1): void {
  assertExactKeys(value, ['kind', 'value'], 'required capability');
  switch (value.kind) {
    case 'input_inspection':
    case 'final_output_assessment':
      assertOneOf(value.value, ['full'], 'required capability value');
      return;
    case 'incremental_output_assessment':
      assertOneOf(value.value, ['windowed'], 'required capability value');
      return;
    case 'release_interruption':
      assertOneOf(value.value, ['local'], 'required capability value');
      return;
    case 'tool_interception':
      assertOneOf(
        value.value,
        ['application_only', 'all'],
        'required capability value',
      );
      return;
    case 'message_interception':
      assertOneOf(
        value.value,
        ['application_only'],
        'required capability value',
      );
      return;
    case 'representation_access':
      assertOneOf(
        value.value,
        ['opaque', 'token'],
        'required capability value',
      );
      return;
    default:
      throw new TypeError('required capability kind is invalid');
  }
}

function requirementSatisfied(
  descriptor: CapabilityDescriptorV1,
  requirement: RequiredControlCapabilityV1,
): boolean {
  switch (requirement.kind) {
    case 'input_inspection':
      return descriptor.inputInspection === requirement.value;
    case 'final_output_assessment':
      return descriptor.finalOutputAssessment === requirement.value;
    case 'incremental_output_assessment':
      return descriptor.incrementalOutputAssessment === requirement.value;
    case 'release_interruption':
      return descriptor.releaseInterruption === requirement.value;
    case 'tool_interception':
      return requirement.value === 'application_only'
        ? descriptor.toolInterception === 'application_only' ||
            descriptor.toolInterception === 'all'
        : descriptor.toolInterception === 'all';
    case 'message_interception':
      return descriptor.messageInterception === requirement.value;
    case 'representation_access':
      return descriptor.representationAccess === requirement.value;
  }
}
function compareRequirement(
  left: RequiredControlCapabilityV1,
  right: RequiredControlCapabilityV1,
): number {
  return compareCodeUnits(
    `${left.kind}:${left.value}`,
    `${right.kind}:${right.value}`,
  );
}
