import {
  createInferenceControlStateV1,
  type CapabilityDescriptorV1,
  type ContextEntryV1,
  type InferenceControlPolicyV1,
} from '@agentplat/inference-control';

const descriptor: CapabilityDescriptorV1 = {
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
void descriptor;
void createInferenceControlStateV1({ stateId: 's', tenantId: 't' });
void (null as unknown as ContextEntryV1);
void (null as unknown as InferenceControlPolicyV1);
