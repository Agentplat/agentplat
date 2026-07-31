import type { JsonValue } from '@agentplat/core';

import { canonicalizeControlJsonV1, utf8ByteLength } from './canonical.js';
import { validateControlScopeV1 } from './scopes.js';
import type {
  AssessmentRequestV1,
  InferenceAssessmentV1,
  InferenceControlLimitsV1,
} from './types.js';
import {
  assertDigest,
  assertExactKeys,
  assertOneOf,
  assertSafeInteger,
  assertStrictJsonValue,
  assertString,
  deepFreeze,
  isInferenceControlReasonCodeV1,
  sortedUnique,
} from './validation.js';

const checkpoints = [
  'pre_run',
  'stream',
  'post_run',
  'pre_tool',
  'pre_message',
] as const;
const targetKinds = [
  'provider_request',
  'stream_window',
  'final_output',
  'action',
  'outbound_message',
] as const;
const dispositions = [
  'allow',
  'revise',
  'retry',
  'challenge',
  'abstain',
  'escalate',
  'deny',
] as const;

const REQUEST_KEYS = [
  'schemaVersion',
  'assessmentRequestId',
  'requestGeneration',
  'runId',
  'tenantId',
  'policyId',
  'policyVersion',
  'checkpoint',
  'assessorId',
  'assessorVersion',
  'targetKind',
  'targetDigest',
  'contextEntryIds',
  'zoneDigest',
  'provenanceDigest',
  'scope',
  'createdAtLogicalMs',
  'expiresAtLogicalMs',
  'status',
] as const;

const ASSESSMENT_KEYS = [
  'schemaVersion',
  'assessmentId',
  'assessmentRequestId',
  'requestGeneration',
  'runId',
  'tenantId',
  'policyId',
  'policyVersion',
  'checkpoint',
  'assessorId',
  'assessorVersion',
  'targetKind',
  'targetDigest',
  'zoneDigest',
  'provenanceDigest',
  'scope',
  'disposition',
  'reasonCodes',
  'uncertaintyBasisPoints',
  'evidenceReferences',
  'revisedContent',
  'challenge',
  'assessedAtLogicalMs',
  'expiresAtLogicalMs',
] as const;

export function validateAssessmentRequestV1(
  value: unknown,
  limits: InferenceControlLimitsV1,
): AssessmentRequestV1 {
  assertExactKeys(value, REQUEST_KEYS, 'assessment request');
  const request = value as unknown as AssessmentRequestV1;
  if (request.schemaVersion !== 1) throw new TypeError('assessment_invalid');
  for (const [label, item] of [
    ['assessmentRequestId', request.assessmentRequestId],
    ['runId', request.runId],
    ['tenantId', request.tenantId],
    ['policyId', request.policyId],
    ['assessorId', request.assessorId],
  ] as const)
    assertString(item, label);
  assertSafeInteger(request.requestGeneration, 'requestGeneration', 1);
  assertSafeInteger(request.policyVersion, 'policyVersion', 1);
  assertSafeInteger(request.assessorVersion, 'assessorVersion', 1);
  assertOneOf(request.checkpoint, checkpoints, 'checkpoint');
  assertOneOf(request.targetKind, targetKinds, 'targetKind');
  const expectedTarget: Record<
    AssessmentRequestV1['checkpoint'],
    AssessmentRequestV1['targetKind']
  > = {
    pre_run: 'provider_request',
    stream: 'stream_window',
    post_run: 'final_output',
    pre_tool: 'action',
    pre_message: 'outbound_message',
  };
  if (request.targetKind !== expectedTarget[request.checkpoint])
    throw new TypeError('assessment_invalid');
  assertDigest(request.targetDigest, 'targetDigest');
  assertDigest(request.zoneDigest, 'zoneDigest');
  assertDigest(request.provenanceDigest, 'provenanceDigest');
  if (!Array.isArray(request.contextEntryIds))
    throw new TypeError('assessment_invalid');
  for (const id of request.contextEntryIds) assertString(id, 'contextEntryId');
  if (new Set(request.contextEntryIds).size !== request.contextEntryIds.length)
    throw new TypeError('assessment_invalid');
  if (request.scope !== null) validateControlScopeV1(request.scope);
  assertSafeInteger(request.createdAtLogicalMs, 'createdAtLogicalMs');
  assertSafeInteger(request.expiresAtLogicalMs, 'expiresAtLogicalMs');
  if (
    request.expiresAtLogicalMs <= request.createdAtLogicalMs ||
    request.expiresAtLogicalMs - request.createdAtLogicalMs >
      limits.maxAssessmentTtlMs
  )
    throw new TypeError('assessment_expired');
  assertOneOf(
    request.status,
    ['pending', 'accepted', 'expired', 'cancelled'],
    'assessment status',
  );
  assertAssessmentSize(value as JsonValue, limits);
  return deepFreeze(structuredClone(request));
}

export function validateInferenceAssessmentV1(
  value: unknown,
  limits: InferenceControlLimitsV1,
): InferenceAssessmentV1 {
  assertExactKeys(value, ASSESSMENT_KEYS, 'assessment');
  const assessment = value as unknown as InferenceAssessmentV1;
  if (assessment.schemaVersion !== 1) throw new TypeError('assessment_invalid');
  for (const [label, item] of [
    ['assessmentId', assessment.assessmentId],
    ['assessmentRequestId', assessment.assessmentRequestId],
    ['runId', assessment.runId],
    ['tenantId', assessment.tenantId],
    ['policyId', assessment.policyId],
    ['assessorId', assessment.assessorId],
  ] as const)
    assertString(item, label);
  assertSafeInteger(assessment.requestGeneration, 'requestGeneration', 1);
  assertSafeInteger(assessment.policyVersion, 'policyVersion', 1);
  assertSafeInteger(assessment.assessorVersion, 'assessorVersion', 1);
  assertOneOf(assessment.checkpoint, checkpoints, 'checkpoint');
  assertOneOf(assessment.targetKind, targetKinds, 'targetKind');
  for (const [label, digest] of [
    ['targetDigest', assessment.targetDigest],
    ['zoneDigest', assessment.zoneDigest],
    ['provenanceDigest', assessment.provenanceDigest],
  ] as const)
    assertDigest(digest, label);
  if (assessment.scope !== null) validateControlScopeV1(assessment.scope);
  assertOneOf(assessment.disposition, dispositions, 'disposition');
  if (
    !Array.isArray(assessment.reasonCodes) ||
    assessment.reasonCodes.length < 1 ||
    assessment.reasonCodes.length > 16 ||
    assessment.reasonCodes.some(
      (reason) => !isInferenceControlReasonCodeV1(reason),
    )
  )
    throw new TypeError('assessment_invalid');
  sortedUnique(assessment.reasonCodes, 'reasonCodes');
  assertSafeInteger(
    assessment.uncertaintyBasisPoints,
    'uncertaintyBasisPoints',
  );
  if (assessment.uncertaintyBasisPoints > 10_000)
    throw new TypeError('assessment_invalid');
  if (
    !Array.isArray(assessment.evidenceReferences) ||
    assessment.evidenceReferences.length >
      limits.maxEvidenceReferencesPerAssessment
  )
    throw new TypeError('assessment_invalid');
  for (const reference of assessment.evidenceReferences) {
    assertString(reference, 'evidenceReference');
    if (utf8ByteLength(reference) > 1_024)
      throw new TypeError('assessment_invalid');
  }
  if (
    new Set(assessment.evidenceReferences).size !==
    assessment.evidenceReferences.length
  )
    throw new TypeError('assessment_invalid');
  if (assessment.revisedContent !== null)
    assertStrictJsonValue(assessment.revisedContent);
  if (assessment.challenge !== null)
    assertStrictJsonValue(assessment.challenge);
  if (
    (assessment.disposition === 'revise') !==
      (assessment.revisedContent !== null) ||
    (assessment.disposition === 'challenge') !== (assessment.challenge !== null)
  )
    throw new TypeError('assessment_invalid');
  assertSafeInteger(assessment.assessedAtLogicalMs, 'assessedAtLogicalMs');
  assertSafeInteger(assessment.expiresAtLogicalMs, 'expiresAtLogicalMs');
  if (assessment.expiresAtLogicalMs <= assessment.assessedAtLogicalMs)
    throw new TypeError('assessment_expired');
  assertAssessmentSize(value as JsonValue, limits);
  return deepFreeze(structuredClone(assessment));
}

export function assessmentMatchesRequestV1(
  request: AssessmentRequestV1,
  assessment: InferenceAssessmentV1,
  logicalTimeMs: number,
): boolean {
  if (
    request.status !== 'pending' ||
    logicalTimeMs >= request.expiresAtLogicalMs ||
    logicalTimeMs >= assessment.expiresAtLogicalMs ||
    assessment.assessedAtLogicalMs > logicalTimeMs
  )
    return false;
  const copied = [
    'assessmentRequestId',
    'requestGeneration',
    'runId',
    'tenantId',
    'policyId',
    'policyVersion',
    'checkpoint',
    'assessorId',
    'assessorVersion',
    'targetKind',
    'targetDigest',
    'zoneDigest',
    'provenanceDigest',
  ] as const;
  if (copied.some((key) => request[key] !== assessment[key])) return false;
  return (
    canonicalizeControlJsonV1(request.scope) ===
    canonicalizeControlJsonV1(assessment.scope)
  );
}

function assertAssessmentSize(
  value: JsonValue,
  limits: InferenceControlLimitsV1,
): void {
  if (
    utf8ByteLength(canonicalizeControlJsonV1(value)) > limits.maxAssessmentBytes
  )
    throw new TypeError('assessment_invalid');
}
