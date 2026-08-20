import type { JsonObject, JsonValue } from '@agentplat/core';

export type ControlDigestDomainV1 =
  | 'context'
  | 'provenance'
  | 'policy'
  | 'scope'
  | 'capability'
  | 'assessment-target'
  | 'provider-request'
  | 'stream-window'
  | 'handler-binding'
  | 'action'
  | 'action-input'
  | 'message'
  | 'state'
  | 'trace';

export type ContextZoneV1 =
  | 'policy'
  | 'objective'
  | 'local_trusted'
  | 'user_untrusted'
  | 'peer_untrusted'
  | 'tool_untrusted'
  | 'retrieval_untrusted'
  | 'provider_untrusted'
  | 'assessor_untrusted';
export type ContextSourceKindV1 =
  'local' | 'user' | 'peer' | 'tool' | 'retrieval' | 'provider' | 'assessor';
export type ReleaseModeV1 = 'observe' | 'buffered' | 'incremental';
export type CapabilityAssuranceV1 = 'verified' | 'declared';
export type ControlCheckpointV1 =
  'pre_run' | 'stream' | 'post_run' | 'pre_tool' | 'pre_message';

export interface StandaloneControlScopeV1 extends JsonObject {
  readonly schemaVersion: 1;
  readonly kind: 'standalone';
  readonly tenantId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly policyId: string;
  readonly policyVersion: number;
}

export interface CoordinatedControlScopeV1 extends JsonObject {
  readonly schemaVersion: 1;
  readonly kind: 'coordinated';
  readonly tenantId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly peerId: string;
  readonly instanceId: string;
  readonly assignmentAuthorityId: string;
  readonly assignmentEpoch: number;
  readonly fencingToken: string;
  readonly leaseExpiresAtLogicalMs: number;
  readonly authorityGeneration: number;
  readonly objectiveTerminal: boolean;
  readonly workTerminal: boolean;
}

export type ControlScopeV1 =
  StandaloneControlScopeV1 | CoordinatedControlScopeV1;

export type RequiredControlCapabilityV1 =
  | Readonly<{ kind: 'input_inspection'; value: 'full' }>
  | Readonly<{ kind: 'final_output_assessment'; value: 'full' }>
  | Readonly<{ kind: 'incremental_output_assessment'; value: 'windowed' }>
  | Readonly<{ kind: 'release_interruption'; value: 'local' }>
  | Readonly<{ kind: 'tool_interception'; value: 'application_only' | 'all' }>
  | Readonly<{ kind: 'message_interception'; value: 'application_only' }>
  | Readonly<{ kind: 'representation_access'; value: 'opaque' | 'token' }>;

export interface InferenceControlLimitsV1 {
  readonly maxContextEntriesPerRun: number;
  readonly maxContextEntryBytes: number;
  readonly maxContextBytesPerRun: number;
  readonly maxProvenanceReferencesPerEntry: number;
  readonly maxAssessmentsPerRun: number;
  readonly maxAssessmentBytes: number;
  readonly maxEvidenceReferencesPerAssessment: number;
  readonly maxRevisionsPerRun: number;
  readonly maxRetriesPerRun: number;
  readonly maxChallengesPerRun: number;
  readonly maxOutputChunksPerRun: number;
  readonly maxOutputChunkBytes: number;
  readonly maxPendingWindowBytes: number;
  readonly maxBufferedOutputBytes: number;
  readonly maxActionInputBytes: number;
  readonly maxOutboundMessageBytes: number;
  readonly maxDispatchAttemptsPerRun: number;
  readonly maxActiveGrants: number;
  readonly maxRetainedGrantRecords: number;
  readonly maxActiveMessageAttempts: number;
  readonly maxRetainedMessageAttempts: number;
  readonly maxDiagnostics: number;
  readonly maxStateBytes: number;
  readonly maxRunDurationMs: number;
  readonly maxAssessorResponseTimeoutMs: number;
  readonly maxAssessmentTtlMs: number;
  readonly maxGrantTtlMs: number;
  readonly maxMessagePermitTtlMs: number;
}

export interface CapabilityDescriptorV1 {
  readonly schemaVersion: 1;
  readonly capabilityId: string;
  readonly descriptorVersion: number;
  readonly inputInspection: 'full' | 'none';
  readonly finalOutputAssessment: 'full' | 'none';
  readonly incrementalOutputAssessment: 'windowed' | 'none';
  readonly releaseInterruption: 'local' | 'none';
  readonly toolInterception: 'all' | 'application_only' | 'none';
  readonly messageInterception: 'application_only' | 'none';
  readonly representationAccess: 'none' | 'opaque' | 'token';
  readonly declarationSource: 'wrapper' | 'adapter';
  readonly assurance: 'reference_tested' | 'application_verified' | 'declared';
  readonly wrapperId: string;
  readonly wrapperVersion: number;
}

export interface CapabilityHandleV1 {
  readonly schemaVersion: 1;
  readonly capabilityHandleId: string;
  readonly capabilityId: string;
  readonly descriptorVersion: number;
  readonly wrapperId: string;
  readonly wrapperVersion: number;
  readonly wrapperInstanceId: string;
  readonly descriptorDigest: string;
}

export interface CapabilityBindingRequirementV1 {
  readonly schemaVersion: 1;
  readonly capabilityId: string;
  readonly descriptorVersion: number;
  readonly wrapperId: string;
  readonly wrapperVersion: number;
  readonly descriptorDigest: string;
  readonly requiredAssurance:
    'reference_tested' | 'application_verified' | 'declared';
}

export interface PromotionRecordV1 {
  readonly sourceContextEntryId: string;
  readonly sourceContentDigest: string;
  readonly transformerId: string;
  readonly transformerVersion: number;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly targetZone: Exclude<ContextZoneV1, 'policy' | 'objective'>;
  readonly promotedAtLogicalMs: number;
}
export interface AssessorRevisionRecordV1 {
  readonly sourceContextEntryId: string;
  readonly sourceContentDigest: string;
  readonly assessmentRequestId: string;
  readonly assessmentId: string;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly targetZone: 'assessor_untrusted';
  readonly createdAtLogicalMs: number;
}
export interface ContextEntryV1 {
  readonly schemaVersion: 1;
  readonly contextEntryId: string;
  readonly runId: string;
  readonly tenantId: string;
  readonly zone: ContextZoneV1;
  readonly sourceKind: ContextSourceKindV1;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly mediaType: 'text' | 'json';
  readonly content: string | JsonValue;
  readonly contentDigest: string;
  readonly provenanceDigest: string;
  readonly encodedBytes: number;
  readonly createdAtLogicalMs: number;
  readonly scope: ControlScopeV1 | null;
  readonly derivation: PromotionRecordV1 | AssessorRevisionRecordV1 | null;
}

export interface AssessorBindingV1 {
  readonly schemaVersion: 1;
  readonly checkpoint: ControlCheckpointV1;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
  readonly maximumResponseBytes: number;
  readonly maximumEvidenceReferences: number;
  readonly timeoutMs: number;
}
export interface ActionPatternV1 {
  readonly schemaVersion: 1;
  readonly namespace: string;
  readonly toolId: string;
  readonly operation: string;
  readonly actionBindingId: string;
  readonly minimumActionBindingVersion: number;
}
export interface InferenceControlPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly parentPolicyDigest: string | null;
  readonly mode: ReleaseModeV1;
  readonly outputRisk: 'low' | 'moderate' | 'high';
  readonly checkpoints: readonly ControlCheckpointV1[];
  readonly requiredCapabilities: readonly RequiredControlCapabilityV1[];
  readonly minimumCapabilityAssurance: CapabilityAssuranceV1;
  readonly allowedCapabilityBindings: readonly CapabilityBindingRequirementV1[];
  readonly allowedContextZones: readonly ContextZoneV1[];
  readonly allowedTransformerBindings: readonly {
    readonly id: string;
    readonly version: number;
  }[];
  readonly allowedActions: readonly ActionPatternV1[];
  readonly allowedMessageChannels: readonly string[];
  readonly assessmentBindings: readonly AssessorBindingV1[];
  readonly budgets: Readonly<{
    revisions: number;
    retries: number;
    challenges: number;
  }>;
  readonly limits: InferenceControlLimitsV1;
  readonly maximumRunDurationMs: number;
  readonly maximumAssessmentTtlMs: number;
  readonly maximumGrantTtlMs: number;
  readonly maximumMessagePermitTtlMs: number;
  readonly exhaustedDisposition: 'abstain' | 'escalate' | 'deny';
  readonly coordinatedActionsRequired: boolean;
  readonly diagnosticsPolicyId: string;
  readonly redactionPolicyId: string;
}

export interface PolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policyDigest: string;
  readonly policy: InferenceControlPolicyV1;
}
export interface PolicyHeadV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
}
export interface DependencyBindingRecordV1 {
  readonly schemaVersion: 1;
  readonly kind:
    | 'capability'
    | 'assessor'
    | 'transformer'
    | 'action_dispatcher'
    | 'action_context_resolver'
    | 'authority_resolver'
    | 'message_dispatcher';
  readonly bindingId: string;
  readonly bindingVersion: number;
  readonly bindingDigest: string;
}
export interface ControlRunRecordV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly tenantId: string;
  readonly policyDigest: string;
  readonly capabilityDescriptorDigest: string;
  readonly capabilityHandleId: string | null;
  readonly scope: ControlScopeV1 | null;
  readonly generation: number;
  readonly phase:
    | 'created'
    | 'input_assessed'
    | 'executing'
    | 'buffering'
    | 'streaming'
    | 'output_assessed'
    | 'completed'
    | 'denied'
    | 'abstained'
    | 'escalated'
    | 'cancelled'
    | 'failed';
  readonly createdAtLogicalMs: number;
  readonly deadlineAtLogicalMs: number;
  readonly dispositionCounts: Readonly<{
    revisions: number;
    retries: number;
    challenges: number;
  }>;
  readonly contextEntryIds: readonly string[];
  readonly assessmentRequestIds: readonly string[];
  readonly assessmentIds: readonly string[];
  readonly streamIds: readonly string[];
  readonly grantIds: readonly string[];
  readonly messageAttemptIds: readonly string[];
  readonly outputDigest: string | null;
  readonly releasedBytes: number;
  readonly terminalReasonCode: InferenceControlReasonCodeV1 | null;
}
export type AssessmentTargetKindV1 =
  | 'provider_request'
  | 'stream_window'
  | 'final_output'
  | 'action'
  | 'outbound_message';
export type AssessmentDispositionV1 =
  'allow' | 'revise' | 'retry' | 'challenge' | 'abstain' | 'escalate' | 'deny';

export interface AssessmentRequestV1 {
  readonly schemaVersion: 1;
  readonly assessmentRequestId: string;
  readonly requestGeneration: number;
  readonly runId: string;
  readonly tenantId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly checkpoint: ControlCheckpointV1;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly targetKind: AssessmentTargetKindV1;
  readonly targetDigest: string;
  readonly contextEntryIds: readonly string[];
  readonly zoneDigest: string;
  readonly provenanceDigest: string;
  readonly scope: ControlScopeV1 | null;
  readonly createdAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly status: 'pending' | 'accepted' | 'expired' | 'cancelled';
}

export interface InferenceAssessmentV1 {
  readonly schemaVersion: 1;
  readonly assessmentId: string;
  readonly assessmentRequestId: string;
  readonly requestGeneration: number;
  readonly runId: string;
  readonly tenantId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly checkpoint: ControlCheckpointV1;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly targetKind: AssessmentTargetKindV1;
  readonly targetDigest: string;
  readonly zoneDigest: string;
  readonly provenanceDigest: string;
  readonly scope: ControlScopeV1 | null;
  readonly disposition: AssessmentDispositionV1;
  readonly reasonCodes: readonly InferenceControlReasonCodeV1[];
  readonly uncertaintyBasisPoints: number;
  /** Optional semantic-alignment aggregate carried when the assessor exposes it. */
  readonly semanticMetrics?: {
    readonly roleCoherenceBps: number | null;
    readonly missionAlignmentBps: number | null;
    readonly contextConflictBps: number | null;
    readonly uncertaintyBps: number | null;
    readonly courseActionDiversityBps: number | null;
    readonly courseActionNoveltyBps: number | null;
  };
  readonly evidenceReferences: readonly string[];
  readonly revisedContent: JsonValue | null;
  readonly challenge: JsonValue | null;
  readonly assessedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface ControlStreamV1 {
  readonly schemaVersion: 1;
  readonly streamId: string;
  readonly runId: string;
  readonly generation: number;
  readonly nextSequence: number;
  readonly releasedThroughSequence: number;
  readonly receivedBytes: number;
  readonly releasedBytes: number;
  readonly finalDigest: string | null;
  readonly status: 'open' | 'completed' | 'cancelled' | 'failed';
}

export interface ControlStreamChunkV1 {
  readonly schemaVersion: 1;
  readonly chunkId: string;
  readonly streamId: string;
  readonly generation: number;
  readonly sequence: number;
  readonly fromByte: number;
  readonly throughByteExclusive: number;
  readonly utf8Bytes: number;
  readonly content: string;
  readonly contentDigest: string;
}

export interface StreamWindowV1 {
  readonly schemaVersion: 1;
  readonly streamId: string;
  readonly generation: number;
  readonly fromSequence: number;
  readonly throughSequence: number;
  readonly fromByte: number;
  readonly throughByteExclusive: number;
  readonly utf8Bytes: number;
  readonly chunkDigests: readonly string[];
  readonly windowDigest: string;
}

export interface ActionGrantStateV1 {
  readonly schemaVersion: 1;
  readonly grantId: string;
  readonly runId: string;
  readonly stateGeneration: number;
  readonly scope: ControlScopeV1;
  readonly scopeDigest: string;
  readonly namespace: string;
  readonly toolId: string;
  readonly operation: string;
  readonly actionBindingId: string;
  readonly actionBindingVersion: number;
  readonly handlerDigest: string;
  readonly inputDigest: string;
  readonly actionDigest: string;
  readonly assessmentRequestId: string;
  readonly assessmentId: string;
  readonly assessmentTargetDigest: string;
  readonly idempotencyKey: string;
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly singleUse: true;
  readonly status:
    | 'issued'
    | 'reserved'
    | 'dispatched'
    | 'failed'
    | 'indeterminate'
    | 'expired';
  readonly reservation: JsonValue | null;
}

export interface ActionIdempotencyRecordV1 {
  readonly schemaVersion: 1;
  readonly scopeDigest: string;
  readonly idempotencyKey: string;
  readonly actionDigest: string;
  readonly grantId: string;
  readonly retainedOutcome: ActionGrantStateV1['status'];
}

export interface OutboundMessageAttemptStateV1 {
  readonly schemaVersion: 1;
  readonly messageAttemptId: string;
  readonly runId: string;
  readonly messageId: string;
  readonly assessmentRequestId: string;
  readonly assessmentId: string;
  readonly messageDigest: string;
  readonly scopeDigest: string;
  readonly idempotencyKey: string;
  readonly generation: number;
  readonly dispatcherId: string;
  readonly dispatcherVersion: number;
  readonly dispatcherDigest: string;
  readonly status:
    'prepared' | 'reserved' | 'sent' | 'failed' | 'indeterminate' | 'expired';
  readonly reservation: JsonValue | null;
  readonly preparedAtLogicalMs: number;
  readonly reservedAtLogicalMs: number | null;
  readonly expiresAtLogicalMs: number;
}

export interface MessageIdempotencyRecordV1 {
  readonly schemaVersion: 1;
  readonly scopeDigest: string;
  readonly idempotencyKey: string;
  readonly messageDigest: string;
  readonly messageAttemptId: string;
  readonly retainedOutcome: OutboundMessageAttemptStateV1['status'];
}

export interface DiagnosticV1 {
  readonly schemaVersion: 1;
  readonly diagnosticId: string;
  readonly runId: string | null;
  readonly checkpoint: ControlCheckpointV1 | null;
  readonly reasonCode: InferenceControlReasonCodeV1;
  readonly logicalTimeMs: number;
  readonly outcome: 'accepted' | 'withheld' | 'denied' | 'unavailable';
  readonly sizeBucket: 0 | 1 | 2 | 3 | 4;
  readonly correlationId: string | null;
}
export interface InferenceControlStateV1 {
  readonly schemaVersion: 1;
  readonly stateId: string;
  readonly tenantId: string;
  readonly stateGeneration: number;
  readonly logicalTimeHighWaterMs: number;
  readonly limits: InferenceControlLimitsV1;
  readonly policies: readonly PolicyRecordV1[];
  readonly policyHeads: readonly PolicyHeadV1[];
  readonly dependencyBindings: readonly DependencyBindingRecordV1[];
  readonly runs: readonly ControlRunRecordV1[];
  readonly contextEntries: readonly ContextEntryV1[];
  readonly assessmentRequests: readonly AssessmentRequestV1[];
  readonly assessments: readonly InferenceAssessmentV1[];
  readonly streams: readonly ControlStreamV1[];
  readonly streamChunks: readonly ControlStreamChunkV1[];
  readonly grants: readonly ActionGrantStateV1[];
  readonly actionIdempotency: readonly ActionIdempotencyRecordV1[];
  readonly messageAttempts: readonly OutboundMessageAttemptStateV1[];
  readonly messageIdempotency: readonly MessageIdempotencyRecordV1[];
  readonly diagnostics: readonly DiagnosticV1[];
  readonly traceDigest: string;
  readonly encodedBytes: number;
}

export interface InferenceControlSnapshotV1 {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly createdAtLogicalMs: number;
  readonly state: InferenceControlStateV1;
  readonly stateDigest: string;
}

export interface RedactedInferenceControlEvidenceV1 {
  readonly schemaVersion: 1;
  readonly stateId: string;
  readonly tenantId: string;
  readonly stateGeneration: number;
  readonly logicalTimeHighWaterMs: number;
  readonly traceDigest: string;
  readonly counts: Readonly<{
    policies: number;
    runs: number;
    contextEntries: number;
    assessments: number;
    streams: number;
    grants: number;
    messageAttempts: number;
  }>;
  readonly diagnostics: readonly DiagnosticV1[];
  readonly restorable: false;
}

export const INFERENCE_CONTROL_REASON_CODES_V1 = [
  'context_zone_invalid',
  'context_promotion_denied',
  'context_limit_exceeded',
  'policy_capability_missing',
  'assessment_required',
  'assessment_invalid',
  'assessment_indeterminate',
  'assessment_expired',
  'assessment_scope_mismatch',
  'assessment_content_mismatch',
  'assessment_budget_exhausted',
  'release_mode_incompatible',
  'release_buffer_exceeded',
  'stream_abort_unavailable',
  'action_not_permitted',
  'grant_missing',
  'grant_expired',
  'grant_consumed',
  'grant_scope_mismatch',
  'grant_action_mismatch',
  'grant_input_mismatch',
  'grant_assessment_mismatch',
  'grant_epoch_stale',
  'grant_fence_stale',
  'grant_idempotency_conflict',
  'gateway_unavailable',
  'downstream_fence_rejected',
  'downstream_indeterminate',
  'state_capacity_exceeded',
  'state_conflict',
  'logical_time_rollback',
  'assessment_unsolicited',
  'assessment_assessor_mismatch',
  'assessment_generation_stale',
  'stream_sequence_invalid',
  'stream_content_mismatch',
  'message_not_permitted',
  'message_indeterminate',
  'message_idempotency_conflict',
  'dependency_rebind_failed',
] as const;
export type InferenceControlReasonCodeV1 =
  (typeof INFERENCE_CONTROL_REASON_CODES_V1)[number];
