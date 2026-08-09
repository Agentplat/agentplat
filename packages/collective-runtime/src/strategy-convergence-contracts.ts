import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  PeerStrategyEvidenceBindingV1,
  PeerStrategyEvidenceOutcomeV1,
} from "./strategy-evidence-exchange-contracts.js";
import type { LocalStrategyOperationV1 } from "./strategy-adaptation-contracts.js";

export const STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1 = 1 as const;
export const STRATEGY_CONVERGENCE_STATE_FORMAT_V1 =
  "application/vnd.agentplat.strategy-convergence-state.v1+json" as const;
export const STRATEGY_CONVERGENCE_HANDOFF_FORMAT_V1 =
  "application/vnd.agentplat.strategy-convergence-handoff.v1+json" as const;

export type StrategyConvergenceConnectivityV1 =
  "connected" | "degraded" | "partitioned" | "recovering";

export type StrategyConvergenceStatusV1 =
  | "insufficient_evidence"
  | "candidate"
  | "stable"
  | "divergent"
  | "oscillating"
  | "partitioned"
  | "recovering"
  | "unsafe";

export type StrategyConvergenceActionV1 =
  "hold" | "adopt" | "explore" | "isolate";

/** Content-free policy scope; context is represented only by its cohort digest. */
export interface StrategyConvergenceScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly cohortDigest: PlanningDigestV1;
  readonly operation: LocalStrategyOperationV1;
  readonly scopeDigest: PlanningDigestV1;
}

/**
 * A locally verified projection of one evidence certificate. It contains only
 * immutable identifiers, source coverage and aggregate outcome metadata.
 */
export interface StrategyConvergenceObservationV1 {
  readonly schemaVersion: 1;
  readonly observationId: AgentPlatID;
  readonly evidencePolicyDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly cohortDigest: PlanningDigestV1;
  readonly binding: PeerStrategyEvidenceBindingV1;
  readonly certificateDigest: PlanningDigestV1;
  readonly attesterPeerIds: readonly AgentPlatID[];
  readonly independenceGroupIds: readonly AgentPlatID[];
  readonly outcome: PeerStrategyEvidenceOutcomeV1;
  readonly confidenceBps: number;
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly observationDigest: PlanningDigestV1;
}

export interface StrategyConvergenceLimitsV1 {
  readonly maximumScopes: number;
  readonly maximumStrategiesPerScope: number;
  readonly maximumObservationsPerCycle: number;
  readonly maximumHistoryPerScope: number;
  readonly maximumSourceIdsPerObservation: number;
  readonly maximumReasonCodesPerDecision: number;
  readonly maximumObservationTtlMs: number;
  readonly maximumFutureSkewMs: number;
  readonly maximumCommitAttempts: number;
}

/** Immutable local policy. No remote observation may mutate these bounds. */
export interface StrategyConvergencePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly minimumConfidenceBps: number;
  readonly minimumDistinctPeers: number;
  readonly minimumDistinctIndependenceGroups: number;
  readonly minimumStableCycles: number;
  readonly recoveryStableCycles: number;
  readonly improvementMarginBps: number;
  readonly diversityPreservationMarginBps: number;
  readonly minimumCycleIntervalMs: number;
  readonly cooldownDurationMs: number;
  readonly oscillationWindowMs: number;
  readonly maximumTransitionsPerOscillationWindow: number;
  readonly maximumPriorInfluenceBps: number;
  readonly recommendationTtlMs: number;
  readonly limits: StrategyConvergenceLimitsV1;
}

export interface StrategyConvergencePolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: StrategyConvergencePolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

export interface StrategyConvergenceCycleRequestV1 {
  readonly schemaVersion: 1;
  readonly cycleId: AgentPlatID;
  readonly scope: StrategyConvergenceScopeV1;
  readonly currentStrategy: PeerStrategyEvidenceBindingV1;
  /** Strategies already admitted by local catalog and safety policy. */
  readonly eligibleStrategies: readonly PeerStrategyEvidenceBindingV1[];
  readonly connectivity: StrategyConvergenceConnectivityV1;
  readonly observations: readonly StrategyConvergenceObservationV1[];
  readonly logicalTimeMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface StrategyConvergenceScoreV1 {
  readonly schemaVersion: 1;
  readonly binding: PeerStrategyEvidenceBindingV1;
  readonly outcome: PeerStrategyEvidenceOutcomeV1;
  readonly scoreBps: number;
  readonly confidenceBps: number;
  readonly attesterPeerIds: readonly AgentPlatID[];
  readonly independenceGroupIds: readonly AgentPlatID[];
  readonly observationDigests: readonly PlanningDigestV1[];
  readonly credible: boolean;
  readonly unsafe: boolean;
}

/** Advisory recommendation; the local adaptation controller may ignore it. */
export interface StrategyConvergenceRecommendationV1 {
  readonly schemaVersion: 1;
  readonly scopeDigest: PlanningDigestV1;
  readonly operation: LocalStrategyOperationV1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly bindingDigest: PlanningDigestV1;
  readonly action: "hold" | "adopt";
  readonly confidenceBps: number;
  readonly influenceBps: number;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly recommendationDigest: PlanningDigestV1;
}

export interface StrategyConvergenceHistoryEntryV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: PlanningDigestV1;
  readonly currentStrategyId: AgentPlatID;
  readonly recommendedStrategyId: AgentPlatID | null;
  readonly action: StrategyConvergenceActionV1;
  readonly status: StrategyConvergenceStatusV1;
  readonly connectivity: StrategyConvergenceConnectivityV1;
  readonly evaluatedAtLogicalMs: number;
}

export interface StrategyConvergenceScopeStateV1 {
  readonly schemaVersion: 1;
  readonly scope: StrategyConvergenceScopeV1;
  readonly currentStrategy: PeerStrategyEvidenceBindingV1;
  readonly candidateStrategy: PeerStrategyEvidenceBindingV1 | null;
  readonly candidateCycles: number;
  readonly stableCycles: number;
  readonly recoveryCycles: number;
  readonly cooldownUntilLogicalMs: number;
  readonly oscillationGuardUntilLogicalMs: number;
  readonly lastStatus: StrategyConvergenceStatusV1;
  readonly lastDecision: StrategyConvergenceDecisionV1 | null;
  readonly history: readonly StrategyConvergenceHistoryEntryV1[];
}

export interface StrategyConvergenceStateV1 {
  readonly format: typeof STRATEGY_CONVERGENCE_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly controllerId: AgentPlatID;
  readonly controllerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly scopes: readonly StrategyConvergenceScopeStateV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly lastDecisionDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface StrategyConvergenceStoreV1 {
  load(stateKey: AgentPlatID): Promise<StrategyConvergenceStateV1 | null>;
  save(input: {
    readonly state: StrategyConvergenceStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

export interface StrategyConvergenceDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly status: StrategyConvergenceStatusV1;
  readonly action: StrategyConvergenceActionV1;
  readonly currentStrategyId: AgentPlatID;
  readonly recommendedStrategyId: AgentPlatID | null;
  readonly scores: readonly StrategyConvergenceScoreV1[];
  readonly recommendation: StrategyConvergenceRecommendationV1 | null;
  readonly reasonCodes: readonly string[];
  readonly evaluatedAtLogicalMs: number;
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly decisionDigest: PlanningDigestV1;
}

export interface StrategyConvergenceReductionInputV1 {
  readonly state: StrategyConvergenceStateV1;
  readonly policy: StrategyConvergencePolicyRecordV1;
  readonly request: StrategyConvergenceCycleRequestV1;
}

export interface StrategyConvergenceReductionResultV1 {
  readonly state: StrategyConvergenceStateV1;
  readonly decision: StrategyConvergenceDecisionV1;
}

export interface StrategyConvergenceHandoffEnvelopeV1 {
  readonly format: typeof STRATEGY_CONVERGENCE_HANDOFF_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly contentClass: "strategy_convergence_state";
  readonly controllerId: AgentPlatID;
  readonly controllerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly sourceStateKey: AgentPlatID;
  readonly sourceStateDigest: PlanningDigestV1;
  readonly targetStateKey: AgentPlatID;
  readonly exportedAtLogicalMs: number;
  readonly sourceState: StrategyConvergenceStateV1;
  readonly handoffDigest: PlanningDigestV1;
}

export interface StrategyConvergenceRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly controllerId: AgentPlatID;
  readonly controllerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policy: StrategyConvergencePolicyRecordV1;
  readonly store: StrategyConvergenceStoreV1;
}

export interface StrategyConvergencePortV1 {
  readonly controllerId: AgentPlatID;
  readonly controllerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  evaluate(
    request: StrategyConvergenceCycleRequestV1,
  ): Promise<StrategyConvergenceDecisionV1>;
  resolveRecommendation(input: {
    readonly scopeDigest: PlanningDigestV1;
    readonly operation: LocalStrategyOperationV1;
    readonly logicalTimeMs: number;
  }): Promise<StrategyConvergenceRecommendationV1 | null>;
  loadState(): Promise<StrategyConvergenceStateV1>;
  exportHandoff(input: {
    readonly targetStateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }): Promise<StrategyConvergenceHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: StrategyConvergenceHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<StrategyConvergenceStateV1>;
}
