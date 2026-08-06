import type { JsonValue } from "@agentplat/core";

export const CONTEXT_INTEGRITY_SCHEMA_VERSION_V1 = 1 as const;
export const CONTEXT_INTEGRITY_STATE_FORMAT_V1 =
  "application/vnd.agentplat.context-integrity.v1+json" as const;

export const CONTEXT_INTEGRITY_SOURCE_ZONES_V1 = Object.freeze([
  "doctrine_trusted",
  "mission_trusted",
  "role_trusted",
  "operator_trusted",
  "local_trusted",
  "user_untrusted",
  "environment_untrusted",
  "peer_untrusted",
  "tool_untrusted",
  "retrieval_untrusted",
  "provider_untrusted",
  "assessor_untrusted",
] as const);

export type ContextIntegritySourceZoneV1 =
  (typeof CONTEXT_INTEGRITY_SOURCE_ZONES_V1)[number];

export const CONTEXT_INTEGRITY_MEMORY_TIERS_V1 = Object.freeze([
  "doctrine",
  "mission",
  "role",
  "episodic",
  "working",
] as const);

export type ContextIntegrityMemoryTierV1 =
  (typeof CONTEXT_INTEGRITY_MEMORY_TIERS_V1)[number];

export type ContextIntegrityCheckpointV1 =
  "pre_inference" | "pre_step" | "post_output" | "pre_action";

export type ContextIntegrityTargetKindV1 = "context" | "output" | "action";

export type ContextIntegrityAssessmentDispositionV1 =
  "clear" | "caution" | "quarantine" | "deny" | "unavailable";

export type ContextIntegrityItemActionV1 =
  "admit" | "restrict" | "isolate" | "require_corroboration" | "deny";

export type ContextIntegrityStateStatusV1 =
  "active" | "degraded" | "paused" | "denied";

export interface ContextIntegrityThresholdsV1 {
  readonly cautionRiskBps: number;
  readonly quarantineRiskBps: number;
  readonly denyRiskBps: number;
  readonly maximumUncertaintyBps: number;
  readonly contradictionRiskBps: number;
}

export interface ContextIntegrityLimitsV1 {
  readonly maximumItemsPerRequest: number;
  readonly maximumRetainedHeads: number;
  readonly rollingWindowAssessments: number;
  readonly maximumReasonCodesPerAssessment: number;
  readonly maximumThreatKindsPerAssessment: number;
  readonly maximumEvidenceDigestsPerAssessment: number;
  readonly maximumCorroborationGroupsPerItem: number;
  readonly maximumSteps: number;
  readonly maximumAssessmentTtlMs: number;
  readonly maximumDecisionTtlMs: number;
  readonly maximumCommitAttempts: number;
}

export interface ContextIntegrityPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly parentPolicyDigest: string | null;
  readonly trustedSourceZones: readonly ContextIntegritySourceZoneV1[];
  readonly allowedFilterBindingDigests: readonly string[];
  readonly thresholds: ContextIntegrityThresholdsV1;
  readonly minimumCorroborationGroups: number;
  readonly adverseSignalsToPause: number;
  readonly recoverySignalsRequired: number;
  readonly allowEmptyAfterIsolation: boolean;
  readonly limits: ContextIntegrityLimitsV1;
}

export interface ContextIntegrityPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: ContextIntegrityPolicyV1;
  readonly policyDigest: string;
}

/** Exact implementation binding for a component that physically removes items. */
export interface ContextIntegrityFilterBindingV1 {
  readonly schemaVersion: 1;
  readonly filterId: string;
  readonly filterVersion: number;
  readonly filterImplementationDigest: string;
  readonly filterBindingDigest: string;
}

/** Content-free binding for one exact context, output or action item. */
export interface ContextIntegrityItemV1 {
  readonly schemaVersion: 1;
  readonly itemId: string;
  readonly sourceZone: ContextIntegritySourceZoneV1;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly sourceRevision: number;
  readonly memoryTier: ContextIntegrityMemoryTierV1;
  readonly contentDigest: string;
  readonly provenanceDigest: string;
  readonly claimKeyDigest: string | null;
  readonly claimValueDigest: string | null;
  readonly corroborationGroupIds: readonly string[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly itemDigest: string;
}

export interface ContextIntegrityScopeV1 {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly objectiveId: string;
}

export interface ContextIntegrityRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly checkpoint: ContextIntegrityCheckpointV1;
  readonly targetKind: ContextIntegrityTargetKindV1;
  readonly scope: ContextIntegrityScopeV1;
  readonly logicalTimeMs: number;
  readonly filterBindingDigest: string | null;
  readonly items: readonly ContextIntegrityItemV1[];
  readonly requestDigest: string;
}

/** Ephemeral content verified against an item digest and never retained. */
export interface ContextIntegrityEphemeralContentV1 {
  readonly itemId: string;
  readonly mediaType: "text" | "json";
  readonly content: JsonValue;
  readonly contentDigest: string;
}

export interface ContextIntegrityAssessmentV1 {
  readonly schemaVersion: 1;
  readonly assessmentId: string;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly itemId: string;
  readonly itemDigest: string;
  readonly analyzerId: string;
  readonly analyzerVersion: number;
  readonly analyzerImplementationDigest: string;
  readonly analyzerRevision: number;
  readonly disposition: ContextIntegrityAssessmentDispositionV1;
  readonly riskBps: number;
  readonly uncertaintyBps: number;
  readonly instructionConflictBps: number;
  readonly threatKinds: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly evidenceDigests: readonly string[];
  readonly assessedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly analysisDigest: string;
  readonly assessmentDigest: string;
}

export interface ContextIntegrityAnalyzerV1 {
  readonly analyzerId: string;
  readonly analyzerVersion: number;
  readonly analyzerImplementationDigest: string;
  analyze(input: {
    readonly request: ContextIntegrityRequestV1;
    readonly item: ContextIntegrityItemV1;
    readonly content: ContextIntegrityEphemeralContentV1;
  }): Promise<ContextIntegrityAssessmentV1> | ContextIntegrityAssessmentV1;
}

export interface ContextIntegrityHeadV1 {
  readonly schemaVersion: 1;
  readonly headKey: string;
  readonly itemId: string;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly sourceRevision: number;
  readonly contentDigest: string;
  readonly analyzerId: string;
  readonly analyzerRevision: number;
  readonly analysisDigest: string;
  readonly assessmentDigest: string;
  readonly expiresAtLogicalMs: number;
}

export interface ContextIntegrityWindowEntryV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly maximumRiskBps: number;
  readonly maximumUncertaintyBps: number;
  readonly isolatedItems: number;
  readonly deniedItems: number;
  readonly evaluatedAtLogicalMs: number;
}

export interface ContextIntegrityInterventionCountsV1 {
  readonly restricted: number;
  readonly isolated: number;
  readonly corroborationRequired: number;
  readonly denied: number;
}

export interface ContextIntegrityStateV1 {
  readonly format: typeof CONTEXT_INTEGRITY_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly analyzerId: string;
  readonly analyzerVersion: number;
  readonly analyzerImplementationDigest: string;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly stepCount: number;
  readonly status: ContextIntegrityStateStatusV1;
  readonly degraded: boolean;
  readonly adverseStreak: number;
  readonly recoveryStreak: number;
  readonly interventionCounts: ContextIntegrityInterventionCountsV1;
  readonly heads: readonly ContextIntegrityHeadV1[];
  readonly rollingWindow: readonly ContextIntegrityWindowEntryV1[];
  readonly predecessorStateDigest: string | null;
  readonly lastRequestDigest: string | null;
  readonly lastDecision: ContextIntegrityDecisionV1 | null;
  readonly stateDigest: string;
}

export interface ContextIntegrityHandoffEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly contentClass: "context_integrity_state";
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyDigest: string;
  readonly analyzerId: string;
  readonly analyzerVersion: number;
  readonly analyzerImplementationDigest: string;
  readonly sourceStateKey: string;
  readonly sourceStateDigest: string;
  readonly targetStateKey: string;
  readonly exportedAtLogicalMs: number;
  readonly sourceState: ContextIntegrityStateV1;
  readonly handoffDigest: string;
}

export interface ContextIntegrityItemDecisionV1 {
  readonly schemaVersion: 1;
  readonly itemId: string;
  readonly itemDigest: string;
  readonly action: ContextIntegrityItemActionV1;
  readonly riskBps: number;
  readonly uncertaintyBps: number;
  readonly reasonCodes: readonly string[];
  readonly assessmentDigest: string | null;
}

export interface ContextIntegrityDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly analyzerId: string;
  readonly analyzerVersion: number;
  readonly analyzerImplementationDigest: string;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly disposition: "allow" | "abstain" | "deny";
  readonly filterRequired: boolean;
  readonly stateStatus: ContextIntegrityStateStatusV1;
  readonly degraded: boolean;
  readonly items: readonly ContextIntegrityItemDecisionV1[];
  readonly decisionDigest: string;
}

export interface ContextIntegrityStoreV1 {
  load(stateKey: string): Promise<ContextIntegrityStateV1 | null>;
  save(input: {
    readonly state: ContextIntegrityStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

export interface ContextIntegrityRuntimeOptionsV1 {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policy: ContextIntegrityPolicyRecordV1;
  readonly analyzer: ContextIntegrityAnalyzerV1;
  readonly store: ContextIntegrityStoreV1;
}

export interface ContextIntegrityEvaluationInputV1 {
  readonly stateKey: string;
  readonly request: ContextIntegrityRequestV1;
  readonly contents: readonly ContextIntegrityEphemeralContentV1[];
}

export interface ContextIntegrityPortV1 {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly analyzerId: string;
  readonly analyzerVersion: number;
  readonly analyzerImplementationDigest: string;
  evaluate(
    input: ContextIntegrityEvaluationInputV1,
  ): Promise<ContextIntegrityDecisionV1>;
  getState(stateKey: string): Promise<ContextIntegrityStateV1 | null>;
  exportHandoff(input: {
    readonly sourceStateKey: string;
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<ContextIntegrityHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: ContextIntegrityHandoffEnvelopeV1;
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<ContextIntegrityStateV1>;
}

export interface ContextIntegrityReductionInputV1 {
  readonly state: ContextIntegrityStateV1;
  readonly policy: ContextIntegrityPolicyRecordV1;
  readonly request: ContextIntegrityRequestV1;
  readonly assessments: readonly ContextIntegrityAssessmentV1[];
}

export interface ContextIntegrityReductionResultV1 {
  readonly state: ContextIntegrityStateV1;
  readonly decision: ContextIntegrityDecisionV1;
}

export interface ContextIntegrityRoleProjectionV1 {
  readonly roleStatus:
    "active" | "paused" | "realignment_required" | "denied" | "unavailable";
  readonly degraded: boolean;
  readonly coherenceBps: number;
  readonly uncertaintyBps: number;
  readonly projectionDigest: string;
}
