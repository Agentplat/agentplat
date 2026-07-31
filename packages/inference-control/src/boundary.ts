import {
  CapabilityRegistryV1,
  negotiateCapabilitiesV1,
  type CapabilityNegotiationResultV1,
} from './capabilities.js';
import { validateContextEntryV1 } from './context.js';
import { createPolicyRecordV1 } from './policy.js';
import type {
  ContextEntryV1,
  InferenceControlPolicyV1,
  ReleaseModeV1,
} from './types.js';
import { deepFreeze } from './validation.js';

export interface InferenceControlBoundaryV1 {
  readonly capabilityRegistry: CapabilityRegistryV1;
  readonly resolvePolicy: (
    policyId: string,
    policyVersion: number,
  ) => InferenceControlPolicyV1 | undefined;
}

export interface ControlBoundaryRequestV1 {
  readonly policyId: string;
  readonly policyVersion: number;
  readonly capabilityHandleId: string;
  readonly expectedMode: ReleaseModeV1;
  readonly expectedOutputRisk: 'low' | 'moderate' | 'high';
}

export interface ResolvedControlBoundaryV1 {
  readonly policy: InferenceControlPolicyV1;
  readonly policyDigest: string;
  readonly descriptorDigest: string;
  readonly negotiation: CapabilityNegotiationResultV1 & { accepted: true };
}

export function resolveControlBoundaryV1(
  boundary: InferenceControlBoundaryV1,
  request: ControlBoundaryRequestV1,
): ResolvedControlBoundaryV1 {
  const policy = boundary.resolvePolicy(
    request.policyId,
    request.policyVersion,
  );
  if (
    !policy ||
    policy.policyId !== request.policyId ||
    policy.policyVersion !== request.policyVersion ||
    policy.mode !== request.expectedMode ||
    policy.outputRisk !== request.expectedOutputRisk
  )
    throw new Error('policy_capability_missing');
  const handle = boundary.capabilityRegistry.resolve(
    request.capabilityHandleId,
  );
  const descriptor = boundary.capabilityRegistry.descriptor(
    request.capabilityHandleId,
  );
  if (!handle || !descriptor) throw new Error('policy_capability_missing');
  const record = createPolicyRecordV1(policy);
  const negotiation = negotiateCapabilitiesV1(descriptor, {
    policyDigest: record.policyDigest,
    descriptorDigest: handle.descriptorDigest,
    mode: policy.mode,
    checkpoints: policy.checkpoints,
    requiredCapabilities: policy.requiredCapabilities,
    minimumCapabilityAssurance: policy.minimumCapabilityAssurance,
    allowedCapabilityBindings: policy.allowedCapabilityBindings,
  });
  if (!negotiation.accepted) throw new Error(negotiation.reasonCode);
  return deepFreeze({
    policy,
    policyDigest: record.policyDigest,
    descriptorDigest: handle.descriptorDigest,
    negotiation,
  });
}

export function assertContextAllowedByPolicyV1(
  policy: InferenceControlPolicyV1,
  entries: readonly ContextEntryV1[],
): void {
  const validated = entries.map((entry) => validateContextEntryV1(entry));
  if (
    validated.some((entry) => !policy.allowedContextZones.includes(entry.zone))
  )
    throw new Error('context_zone_invalid');
  if (
    validated.length > policy.limits.maxContextEntriesPerRun ||
    validated.some(
      (entry) => entry.encodedBytes > policy.limits.maxContextEntryBytes,
    ) ||
    validated.reduce((total, entry) => total + entry.encodedBytes, 0) >
      policy.limits.maxContextBytesPerRun
  )
    throw new Error('context_limit_exceeded');
}
