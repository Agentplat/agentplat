import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

export const LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1 = 1 as const;
export const LOCAL_STRATEGY_ADAPTATION_STATE_FORMAT_V1 =
  "application/vnd.agentplat.local-strategy-adaptation.v1+json" as const;
export const LOCAL_STRATEGY_ADAPTATION_HANDOFF_FORMAT_V1 =
  "application/vnd.agentplat.local-strategy-adaptation-handoff.v1+json" as const;

export const LOCAL_STRATEGY_OPERATIONS_V1 = Object.freeze([
  "plan_decomposition",
  "offer_routing",
  "bid_submission",
  "award_selection",
  "recovery_selection",
] as const);

export type LocalStrategyOperationV1 =
  (typeof LOCAL_STRATEGY_OPERATIONS_V1)[number];

export const LOCAL_STRATEGY_SAFETY_DIMENSIONS_V1 = Object.freeze([
  "trust",
  "role",
  "capability_state",
  "context_integrity",
  "authority",
] as const);

export type LocalStrategySafetyDimensionV1 =
  (typeof LOCAL_STRATEGY_SAFETY_DIMENSIONS_V1)[number];

export type LocalStrategySafetyDispositionV1 =
  "eligible" | "restricted" | "ineligible" | "unavailable";

export const LOCAL_STRATEGY_FEEDBACK_METRICS_V1 = Object.freeze([
  "mission_progress",
  "latency_efficiency",
  "resource_efficiency",
  "recovery_quality",
  "safety",
] as const);

export type LocalStrategyFeedbackMetricV1 =
  (typeof LOCAL_STRATEGY_FEEDBACK_METRICS_V1)[number];

export type LocalStrategyFeedbackOutcomeV1 =
  "success" | "failure" | "unsafe" | "indeterminate";

export interface LocalStrategyDefinitionV1 {
  readonly schemaVersion: 1;
  readonly strategyId: AgentPlatID;
  readonly strategyVersion: number;
  readonly implementationDigest: PlanningDigestV1;
  readonly operations: readonly LocalStrategyOperationV1[];
  readonly strategyDigest: PlanningDigestV1;
}

export interface LocalStrategyBaselinesV1 {
  readonly plan_decomposition: AgentPlatID;
  readonly offer_routing: AgentPlatID;
  readonly bid_submission: AgentPlatID;
  readonly award_selection: AgentPlatID;
  readonly recovery_selection: AgentPlatID;
}

export interface LocalStrategyCatalogV1 {
  readonly schemaVersion: 1;
  readonly catalogId: AgentPlatID;
  readonly catalogVersion: number;
  readonly parentCatalogDigest: PlanningDigestV1 | null;
  readonly strategies: readonly LocalStrategyDefinitionV1[];
  readonly baselines: LocalStrategyBaselinesV1;
  readonly catalogDigest: PlanningDigestV1;
}

export interface LocalStrategySafetyRequirementsV1 {
  readonly plan_decomposition: readonly LocalStrategySafetyDimensionV1[];
  readonly offer_routing: readonly LocalStrategySafetyDimensionV1[];
  readonly bid_submission: readonly LocalStrategySafetyDimensionV1[];
  readonly award_selection: readonly LocalStrategySafetyDimensionV1[];
  readonly recovery_selection: readonly LocalStrategySafetyDimensionV1[];
}

export interface LocalStrategyFeedbackMetricPolicyV1 {
  readonly schemaVersion: 1;
  readonly metric: LocalStrategyFeedbackMetricV1;
  readonly weight: number;
  readonly direction: "maximize" | "minimize";
}

export interface LocalStrategyFeedbackSourceBindingV1 {
  readonly schemaVersion: 1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
}

export interface LocalStrategyAdaptationLimitsV1 {
  readonly maximumStrategies: number;
  readonly maximumPendingDecisions: number;
  readonly maximumSafetyHeads: number;
  readonly maximumFeedbackHeads: number;
  readonly maximumReasonCodesPerSignal: number;
  readonly maximumDecisionTtlMs: number;
  readonly maximumSafetySignalTtlMs: number;
  readonly maximumFeedbackDelayMs: number;
  readonly maximumCommitAttempts: number;
}

export interface LocalStrategyAdaptationPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly requiredSafetyDimensions: LocalStrategySafetyRequirementsV1;
  readonly feedbackMetrics: readonly LocalStrategyFeedbackMetricPolicyV1[];
  readonly feedbackSources: readonly LocalStrategyFeedbackSourceBindingV1[];
  readonly minimumFeedbackSources: number;
  readonly minimumFeedbackConfidenceBps: number;
  readonly learningRateBps: number;
  readonly explorationRateBps: number;
  readonly baselineProbabilityFloorBps: number;
  readonly initialWeightMicros: number;
  readonly minimumWeightMicros: number;
  readonly maximumWeightMicros: number;
  readonly unsafePenaltyBps: number;
  readonly quarantineDurationMs: number;
  readonly limits: LocalStrategyAdaptationLimitsV1;
}

export interface LocalStrategyAdaptationPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: LocalStrategyAdaptationPolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

export interface LocalStrategyScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly workItemId: AgentPlatID | null;
  readonly workItemRevision: number | null;
}

export interface LocalStrategySelectionRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly operation: LocalStrategyOperationV1;
  readonly scope: LocalStrategyScopeV1;
  readonly logicalTimeMs: number;
  readonly contextDigest: PlanningDigestV1;
  readonly availableStrategyIds: readonly AgentPlatID[];
  readonly requestDigest: PlanningDigestV1;
}

export interface LocalStrategySafetySignalV1 {
  readonly schemaVersion: 1;
  readonly signalId: AgentPlatID;
  readonly requestId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly dimension: LocalStrategySafetyDimensionV1;
  readonly disposition: LocalStrategySafetyDispositionV1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly reasonCodes: readonly string[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly signalDigest: PlanningDigestV1;
}

export interface LocalStrategySafetySignalSourceV1 {
  readonly dimension: LocalStrategySafetyDimensionV1;
  resolve(input: {
    readonly request: LocalStrategySelectionRequestV1;
    readonly strategy: LocalStrategyDefinitionV1;
  }): Promise<LocalStrategySafetySignalV1 | null>;
}

export interface LocalStrategySafetyResolutionPortV1 {
  resolve(input: {
    readonly request: LocalStrategySelectionRequestV1;
    readonly strategies: readonly LocalStrategyDefinitionV1[];
    readonly requiredDimensions: readonly LocalStrategySafetyDimensionV1[];
  }): Promise<readonly LocalStrategySafetySignalV1[]>;
}

export interface LocalStrategyEntropyDrawV1 {
  readonly drawBps: number;
  readonly evidenceDigest: PlanningDigestV1;
}

export interface LocalStrategyEntropyPortV1 {
  readonly entropyId: AgentPlatID;
  readonly entropyVersion: number;
  readonly entropyImplementationDigest: PlanningDigestV1;
  draw(input: {
    readonly stateKey: AgentPlatID;
    readonly stateRevision: number;
    readonly entropyCounter: number;
    readonly requestDigest: PlanningDigestV1;
  }): Promise<LocalStrategyEntropyDrawV1>;
}

export interface LocalStrategyArmStateV1 {
  readonly schemaVersion: 1;
  readonly operation: LocalStrategyOperationV1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly weightMicros: number;
  readonly selectionCount: number;
  readonly feedbackCount: number;
  readonly cumulativeRewardMicros: number;
  readonly unsafeCount: number;
  readonly quarantinedUntilLogicalMs: number;
}

export interface LocalStrategyPendingDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: AgentPlatID;
  readonly decisionDigest: PlanningDigestV1;
  readonly requestId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly operation: LocalStrategyOperationV1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly contextDigest: PlanningDigestV1;
  readonly selectedAtLogicalMs: number;
  readonly feedbackExpiresAtLogicalMs: number;
}

export interface LocalStrategySafetyHeadV1 {
  readonly schemaVersion: 1;
  readonly headKey: string;
  readonly strategyId: AgentPlatID;
  readonly dimension: LocalStrategySafetyDimensionV1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly signalDigest: PlanningDigestV1;
  readonly expiresAtLogicalMs: number;
}

export interface LocalStrategyFeedbackHeadV1 {
  readonly schemaVersion: 1;
  readonly headKey: string;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly feedbackDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly outcomeId: AgentPlatID;
}

export interface LocalStrategyOperationStateV1 {
  readonly schemaVersion: 1;
  readonly operation: LocalStrategyOperationV1;
  readonly paused: boolean;
  readonly baselineOnlyUntilLogicalMs: number;
}

export interface LocalStrategyAdaptationStateV1 {
  readonly format: typeof LOCAL_STRATEGY_ADAPTATION_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly controllerId: AgentPlatID;
  readonly controllerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogId: AgentPlatID;
  readonly catalogVersion: number;
  readonly catalogDigest: PlanningDigestV1;
  readonly entropyId: AgentPlatID;
  readonly entropyVersion: number;
  readonly entropyImplementationDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly entropyCounter: number;
  readonly arms: readonly LocalStrategyArmStateV1[];
  readonly operations: readonly LocalStrategyOperationStateV1[];
  readonly pendingDecisions: readonly LocalStrategyPendingDecisionV1[];
  readonly safetyHeads: readonly LocalStrategySafetyHeadV1[];
  readonly feedbackHeads: readonly LocalStrategyFeedbackHeadV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly lastDecisionDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface LocalStrategyProbabilityV1 {
  readonly schemaVersion: 1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly probabilityBps: number;
  readonly signalDigests: readonly PlanningDigestV1[];
  readonly priorDigests: readonly PlanningDigestV1[];
}

export type LocalStrategyCollectivePriorOutcomeV1 =
  | "success"
  | "failure"
  | "unsafe"
  | "indeterminate";

/** Advisory, request-bound evidence. It is never a strategy or authority grant. */
export interface LocalStrategyCollectivePriorV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly operation: LocalStrategyOperationV1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly certificateDigest: PlanningDigestV1;
  readonly outcome: LocalStrategyCollectivePriorOutcomeV1;
  readonly scoreMicros: number;
  readonly confidenceBps: number;
  readonly requestedInfluenceBps: number;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly priorDigest: PlanningDigestV1;
}

export interface LocalStrategyCollectivePriorConfigurationV1 {
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly minimumConfidenceBps: number;
  readonly maximumInfluenceBps: number;
  readonly maximumPriorTtlMs: number;
}

export interface LocalStrategyCollectivePriorSourceV1 {
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  resolve(input: {
    readonly request: LocalStrategySelectionRequestV1;
    readonly strategies: readonly LocalStrategyDefinitionV1[];
  }): Promise<readonly LocalStrategyCollectivePriorV1[]>;
}

export type LocalStrategySelectionModeV1 =
  "baseline" | "explore" | "exploit" | "abstain";

export interface LocalStrategySelectionDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: AgentPlatID;
  readonly controllerId: AgentPlatID;
  readonly controllerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogId: AgentPlatID;
  readonly catalogVersion: number;
  readonly catalogDigest: PlanningDigestV1;
  readonly entropyId: AgentPlatID;
  readonly entropyVersion: number;
  readonly entropyImplementationDigest: PlanningDigestV1;
  readonly requestId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly operation: LocalStrategyOperationV1;
  readonly baselineStrategyId: AgentPlatID;
  readonly selectedStrategyId: AgentPlatID | null;
  readonly selectedStrategyDigest: PlanningDigestV1 | null;
  readonly mode: LocalStrategySelectionModeV1;
  readonly probabilities: readonly LocalStrategyProbabilityV1[];
  readonly drawBps: number | null;
  readonly entropyEvidenceDigest: PlanningDigestV1 | null;
  readonly reasonCodes: readonly string[];
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly decisionDigest: PlanningDigestV1;
}

export interface LocalStrategyFeedbackMetricValueV1 {
  readonly schemaVersion: 1;
  readonly metric: LocalStrategyFeedbackMetricV1;
  readonly valueMicros: number;
}

export interface LocalStrategyFeedbackSignalV1 {
  readonly schemaVersion: 1;
  readonly feedbackId: AgentPlatID;
  readonly decisionId: AgentPlatID;
  readonly decisionDigest: PlanningDigestV1;
  readonly requestId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly operation: LocalStrategyOperationV1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly contextDigest: PlanningDigestV1;
  readonly outcomeId: AgentPlatID;
  readonly outcomeRevision: number;
  readonly outcome: LocalStrategyFeedbackOutcomeV1;
  readonly metrics: readonly LocalStrategyFeedbackMetricValueV1[];
  readonly confidenceBps: number;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly provenanceDigest: PlanningDigestV1;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly feedbackDigest: PlanningDigestV1;
}

export interface LocalStrategyFeedbackBatchV1 {
  readonly schemaVersion: 1;
  readonly batchId: AgentPlatID;
  readonly decisionId: AgentPlatID;
  readonly decisionDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
  readonly signals: readonly LocalStrategyFeedbackSignalV1[];
  readonly batchDigest: PlanningDigestV1;
}

export type LocalStrategyFeedbackStatusV1 =
  "applied" | "pending_sources" | "indeterminate" | "idempotent" | "rejected";

export interface LocalStrategyFeedbackDecisionV1 {
  readonly schemaVersion: 1;
  readonly feedbackDecisionId: AgentPlatID;
  readonly batchId: AgentPlatID;
  readonly batchDigest: PlanningDigestV1;
  readonly decisionId: AgentPlatID;
  readonly decisionDigest: PlanningDigestV1;
  readonly status: LocalStrategyFeedbackStatusV1;
  readonly outcome: LocalStrategyFeedbackOutcomeV1 | null;
  readonly rewardMicros: number | null;
  readonly reasonCodes: readonly string[];
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly feedbackDecisionDigest: PlanningDigestV1;
}

export interface LocalStrategyAdaptationStoreV1 {
  load(stateKey: AgentPlatID): Promise<LocalStrategyAdaptationStateV1 | null>;
  save(input: {
    readonly state: LocalStrategyAdaptationStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

export interface LocalStrategySelectionReductionInputV1 {
  readonly state: LocalStrategyAdaptationStateV1;
  readonly policy: LocalStrategyAdaptationPolicyRecordV1;
  readonly catalog: LocalStrategyCatalogV1;
  readonly request: LocalStrategySelectionRequestV1;
  readonly safetySignals: readonly LocalStrategySafetySignalV1[];
  readonly collectivePriorConfiguration: LocalStrategyCollectivePriorConfigurationV1 | null;
  readonly collectivePriors: readonly LocalStrategyCollectivePriorV1[];
  readonly entropyDraw: LocalStrategyEntropyDrawV1 | null;
}

export interface LocalStrategySelectionReductionResultV1 {
  readonly state: LocalStrategyAdaptationStateV1;
  readonly decision: LocalStrategySelectionDecisionV1;
}

export interface LocalStrategyFeedbackReductionInputV1 {
  readonly state: LocalStrategyAdaptationStateV1;
  readonly policy: LocalStrategyAdaptationPolicyRecordV1;
  readonly catalog: LocalStrategyCatalogV1;
  readonly batch: LocalStrategyFeedbackBatchV1;
}

export interface LocalStrategyFeedbackReductionResultV1 {
  readonly state: LocalStrategyAdaptationStateV1;
  readonly decision: LocalStrategyFeedbackDecisionV1;
}

export interface LocalStrategyAdaptationRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly controllerId: AgentPlatID;
  readonly controllerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policy: LocalStrategyAdaptationPolicyRecordV1;
  readonly catalog: LocalStrategyCatalogV1;
  readonly safety: LocalStrategySafetyResolutionPortV1;
  readonly entropy: LocalStrategyEntropyPortV1;
  readonly store: LocalStrategyAdaptationStoreV1;
  readonly collectivePrior?: {
    readonly configuration: LocalStrategyCollectivePriorConfigurationV1;
    readonly source: LocalStrategyCollectivePriorSourceV1;
  };
}

export interface LocalStrategyHandoffEnvelopeV1 {
  readonly format: typeof LOCAL_STRATEGY_ADAPTATION_HANDOFF_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly contentClass: "local_strategy_adaptation_state";
  readonly controllerId: AgentPlatID;
  readonly controllerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogDigest: PlanningDigestV1;
  readonly entropyImplementationDigest: PlanningDigestV1;
  readonly sourceStateKey: AgentPlatID;
  readonly sourceStateDigest: PlanningDigestV1;
  readonly targetStateKey: AgentPlatID;
  readonly exportedAtLogicalMs: number;
  readonly sourceState: LocalStrategyAdaptationStateV1;
  readonly handoffDigest: PlanningDigestV1;
}

export interface LocalStrategyAdaptationPortV1 {
  readonly controllerId: AgentPlatID;
  readonly controllerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogId: AgentPlatID;
  readonly catalogVersion: number;
  readonly catalogDigest: PlanningDigestV1;
  select(
    request: LocalStrategySelectionRequestV1,
  ): Promise<LocalStrategySelectionDecisionV1>;
  observe(
    batch: LocalStrategyFeedbackBatchV1,
  ): Promise<LocalStrategyFeedbackDecisionV1>;
  loadState(): Promise<LocalStrategyAdaptationStateV1>;
  exportHandoff(input: {
    readonly targetStateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }): Promise<LocalStrategyHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: LocalStrategyHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<LocalStrategyAdaptationStateV1>;
}
