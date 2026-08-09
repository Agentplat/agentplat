import type {
  PlanningDigestV1,
  PlanningJson,
} from "@agentplat/collective-planning";

import type {
  MultiDomainActionEnvelopeV1,
  MultiDomainEnvironmentAdapterV1,
  MultiDomainEnvironmentDomainV1,
  MultiDomainObservationEnvelopeV1,
  MultiDomainScenarioDefinitionV1,
  MultiDomainScenarioManifestV1,
} from "./multi-domain-environment-contracts.js";
import type {
  ShardedSimulationEffectReceiptV1,
  ShardedSimulationCrossShardMessageAckV1,
  ShardedSimulationCrossShardMessageBatchV1,
  ShardedSimulationFencedActionRequestV1,
  ShardedSimulationEnvironmentBridgeV1,
  ShardedSimulationCheckpointV1,
  ShardedSimulationRestoreReceiptV1,
  ShardedSimulationPartialObservationDeliveryV1,
  ShardedSimulationScaleProfileIdV1,
} from "./sharded-simulation-contracts.js";

export const SCALABLE_EVALUATION_SCHEMA_VERSION_V1 = 1 as const;

/** Stable industry-facing aliases for the existing sharded scale profiles. */
export const SCALABLE_EVALUATION_PROFILE_IDS_V1 = Object.freeze([
  "standard-500",
  "large-5000",
  "frontier-100000",
] as const);
export type ScalableEvaluationProfileIdV1 =
  (typeof SCALABLE_EVALUATION_PROFILE_IDS_V1)[number];

export const SCALABLE_EVALUATION_DOMAINS_V1 = Object.freeze([
  "physical",
  "social",
  "cyber",
] as const);
export type ScalableEvaluationDomainV1 =
  (typeof SCALABLE_EVALUATION_DOMAINS_V1)[number];

export const SCALABLE_EVALUATION_PERTURBATION_KINDS_V1 = Object.freeze([
  "benign",
  "byzantine",
  "rogue",
  "context_poisoning",
] as const);
export type ScalableEvaluationPerturbationKindV1 =
  (typeof SCALABLE_EVALUATION_PERTURBATION_KINDS_V1)[number];

export type ScalableEvaluationTeamArchitectureV1 =
  "distributed" | "centralized" | "hybrid" | "custom";

export type ScalableEvaluationActivityKindV1 =
  "observation" | "message" | "decision" | "action" | "recovery";

export interface ScalableEvaluationBudgetV1 {
  readonly maximumInteractions: number;
  readonly maximumMessages: number;
  readonly maximumMessageBytes: number;
  /** Only the tail is retained; the chain digest commits every earlier record. */
  readonly maximumRetainedRecords: number;
}

/**
 * Configuration only. Constructing a profile never allocates peers or executes
 * an evaluation run.
 */
export interface ScalableEvaluationProfileV1 {
  readonly schemaVersion: 1;
  readonly profileId: ScalableEvaluationProfileIdV1;
  readonly shardedProfileId: ShardedSimulationScaleProfileIdV1;
  readonly agentCount: 500 | 5_000 | 100_000;
  readonly budget: ScalableEvaluationBudgetV1;
  readonly profileDigest: PlanningDigestV1;
}

export type ScalableEvaluationObservationScopeV1 =
  "peer_local" | "role_scoped" | "partition_scoped";

/** Runner-visible observation rules; hidden world state is deliberately absent. */
export interface ScalableEvaluationPartialObservabilityV1 {
  readonly schemaVersion: 1;
  readonly scope: ScalableEvaluationObservationScopeV1;
  readonly maximumObservationsPerPull: number;
  readonly allowCrossDomainAggregation: boolean;
  readonly sourceVisibilityPolicyDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
}

/** Value-only identity. Runtime callbacks are excluded from every digest. */
export interface ScalableEvaluationTeamDescriptorV1 {
  readonly schemaVersion: 1;
  readonly teamId: string;
  readonly architecture: ScalableEvaluationTeamArchitectureV1;
  readonly implementationId: string;
  readonly implementationVersion: string;
  readonly implementationDigest: PlanningDigestV1;
  readonly descriptorDigest: PlanningDigestV1;
}

/** Either side may be the reference, so centralized implementations are replaceable. */
export interface ScalableEvaluationMatchupV1 {
  readonly schemaVersion: 1;
  readonly comparisonKind: "team-vs-team";
  readonly leftTeamId: string;
  readonly rightTeamId: string;
  readonly referenceSide: "left" | "right" | "neither";
  readonly matchupDigest: PlanningDigestV1;
}

/** Selector details remain evaluator-owned; only their digest and cardinality cross the boundary. */
export interface ScalableEvaluationPerturbationV1 {
  readonly schemaVersion: 1;
  readonly perturbationId: string;
  readonly kind: ScalableEvaluationPerturbationKindV1;
  readonly domain: ScalableEvaluationDomainV1;
  readonly scheduledAtLogicalTime: number;
  readonly targetTeamIds: readonly string[];
  readonly targetAgentCount: number;
  readonly targetSelectorDigest: PlanningDigestV1;
  readonly configurationDigest: PlanningDigestV1;
}

export interface ScalableEvaluationDefinitionV1 {
  readonly schemaVersion: 1;
  readonly evaluationId: string;
  readonly profile: ScalableEvaluationProfileV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly scenario: MultiDomainScenarioDefinitionV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly domains: readonly ScalableEvaluationDomainV1[];
  readonly partialObservability: ScalableEvaluationPartialObservabilityV1;
  readonly teams: readonly [
    ScalableEvaluationTeamDescriptorV1,
    ScalableEvaluationTeamDescriptorV1,
  ];
  readonly matchup: ScalableEvaluationMatchupV1;
  readonly perturbations: readonly ScalableEvaluationPerturbationV1[];
  readonly perturbationPlanDigest: PlanningDigestV1;
  readonly definitionDigest: PlanningDigestV1;
}

export interface ScalableEvaluationTeamMessageV1 {
  readonly schemaVersion: 1;
  readonly messageId: string;
  readonly sourcePeerIndex: number;
  readonly targetPeerIndex: number;
  readonly payloadDigest: PlanningDigestV1;
  /** Complete public transport value retained until exact ingress acknowledgement. */
  readonly transportEnvelope: PlanningJson;
  readonly transportEnvelopeDigest: PlanningDigestV1;
  readonly byteLength: number;
}

/** Exact post-transport handoff. The runner invokes it only after validating the bridge ACK. */
export interface ScalableEvaluationAcknowledgedMessageV1 {
  readonly schemaVersion: 1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly teamId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly logicalTime: number;
  readonly eventId: string;
  readonly batch: ShardedSimulationCrossShardMessageBatchV1;
  readonly bridgeAck: ShardedSimulationCrossShardMessageAckV1;
  readonly message: ScalableEvaluationTeamMessageV1;
}

export interface ScalableEvaluationMessageIngressReceiptV1 {
  readonly schemaVersion: 1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly teamId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly logicalTime: number;
  readonly eventId: string;
  readonly messageId: string;
  readonly transportEnvelopeDigest: PlanningDigestV1;
  readonly batchDigest: PlanningDigestV1;
  readonly bridgeAckDigest: PlanningDigestV1;
  readonly status: "admitted" | "duplicate";
  readonly receiptDigest: PlanningDigestV1;
}

/** Exact acknowledgement that one staged action has reached a terminal bridge receipt. */
export interface ScalableEvaluationActionSettlementV1 {
  readonly schemaVersion: 1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly teamId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly peerIndex: number;
  readonly logicalTime: number;
  readonly actionIndex: number;
  readonly outputDigest: PlanningDigestV1;
  readonly action: MultiDomainActionEnvelopeV1;
  readonly request: ShardedSimulationFencedActionRequestV1;
  readonly effectReceipt: ShardedSimulationEffectReceiptV1;
}

export interface ScalableEvaluationActionSettlementReceiptV1 {
  readonly schemaVersion: 1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly teamId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly peerIndex: number;
  readonly logicalTime: number;
  readonly actionIndex: number;
  readonly outputDigest: PlanningDigestV1;
  readonly actionDigest: PlanningDigestV1;
  readonly effectReceiptDigest: PlanningDigestV1;
  readonly status: "settled" | "duplicate";
  readonly receiptDigest: PlanningDigestV1;
}

/** Provider-neutral input: a team receives only the bounded public delivery. */
export interface ScalableEvaluationTeamStepInputV1 {
  readonly schemaVersion: 1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly teamId: string;
  readonly peerIndex: number;
  readonly domain: ScalableEvaluationDomainV1;
  readonly logicalTime: number;
  readonly delivery: ShardedSimulationPartialObservationDeliveryV1;
  readonly remainingInteractions: number;
  readonly remainingMessages: number;
  readonly remainingMessageBytes: number;
}

export interface ScalableEvaluationTeamStepOutputV1 {
  readonly schemaVersion: 1;
  readonly teamId: string;
  readonly logicalTime: number;
  readonly messages: readonly ScalableEvaluationTeamMessageV1[];
  readonly actions: readonly MultiDomainActionEnvelopeV1[];
  readonly publicMetadata?: PlanningJson;
  readonly outputDigest: PlanningDigestV1;
}

/**
 * A centralized baseline and any other implementation satisfy the same port.
 * The evaluation runtime binds the value descriptor, but does not invoke it.
 */
export interface ScalableEvaluationTeamPortV1 {
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  stepV1(
    input: ScalableEvaluationTeamStepInputV1,
  ):
    | ScalableEvaluationTeamStepOutputV1
    | Promise<ScalableEvaluationTeamStepOutputV1>;
  /** Required at runtime when `stepV1` emits messages; absent ports may emit none. */
  ingestAcknowledgedMessageV1?(
    input: ScalableEvaluationAcknowledgedMessageV1,
  ):
    | ScalableEvaluationMessageIngressReceiptV1
    | Promise<ScalableEvaluationMessageIngressReceiptV1>;
  /** Optional terminal settlement hook for ports that stage protected effects. */
  settleActionV1?(
    input: ScalableEvaluationActionSettlementV1,
  ):
    | ScalableEvaluationActionSettlementReceiptV1
    | Promise<ScalableEvaluationActionSettlementReceiptV1>;
}

/**
 * Explicit provider declaration for state which survives process replacement.
 * The declaration is created by this module and is bound into every durable
 * run configuration; method presence alone is never treated as durability.
 */
export interface ScalableEvaluationRestartDurabilityDeclarationV1 {
  readonly schemaVersion: 1;
  readonly protocol: "scalable-evaluation-restart-v1";
  readonly providerId: string;
  readonly continuityId: string;
  readonly maximumCheckpointBytes: number;
  readonly declarationDigest: PlanningDigestV1;
}

export interface ScalableEvaluationTeamCheckpointV1 {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly teamId: string;
  readonly definitionDigest: PlanningDigestV1;
  readonly descriptorDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTime: number;
  readonly previousCheckpointDigest: PlanningDigestV1 | null;
  readonly snapshotHandle: string;
  readonly snapshotDigest: PlanningDigestV1;
  readonly checkpointDigest: PlanningDigestV1;
}

export interface ScalableEvaluationTeamRestoreReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly teamId: string;
  readonly checkpointDigest: PlanningDigestV1;
  readonly restoredRevision: number;
  readonly receiptDigest: PlanningDigestV1;
}

/** Required team surface for a restart-durable run. */
export interface ScalableEvaluationResumableTeamPortV1
  extends ScalableEvaluationTeamPortV1 {
  readonly restartDurabilityV1: ScalableEvaluationRestartDurabilityDeclarationV1;
  reconcileStepV1(input: {
    readonly operationId: string;
    readonly step: ScalableEvaluationTeamStepInputV1;
  }):
    | ScalableEvaluationTeamStepOutputV1
    | Promise<ScalableEvaluationTeamStepOutputV1>;
  /** Returns the original canonical admitted receipt for an exact retry. */
  reconcileAcknowledgedMessageV1(input: {
    readonly operationId: string;
    readonly delivery: ScalableEvaluationAcknowledgedMessageV1;
  }):
    | ScalableEvaluationMessageIngressReceiptV1
    | Promise<ScalableEvaluationMessageIngressReceiptV1>;
  /** Returns the original canonical settled receipt for an exact retry. */
  reconcileActionSettlementV1(input: {
    readonly operationId: string;
    readonly settlement: ScalableEvaluationActionSettlementV1;
  }):
    | ScalableEvaluationActionSettlementReceiptV1
    | Promise<ScalableEvaluationActionSettlementReceiptV1>;
  checkpointV1(input: {
    readonly operationId: string;
    readonly runId: string;
    readonly definitionDigest: PlanningDigestV1;
    readonly expectedRevision: number;
    readonly logicalTime: number;
  }): ScalableEvaluationTeamCheckpointV1 | Promise<ScalableEvaluationTeamCheckpointV1>;
  restoreV1(input: {
    readonly operationId: string;
    readonly runId: string;
    readonly checkpoint: ScalableEvaluationTeamCheckpointV1;
  }):
    | ScalableEvaluationTeamRestoreReceiptV1
    | Promise<ScalableEvaluationTeamRestoreReceiptV1>;
}

/** Restart-safe extension of the provider-neutral environment bridge. */
export interface ScalableEvaluationResumableEnvironmentBridgeV1
  extends ShardedSimulationEnvironmentBridgeV1 {
  readonly restartDurabilityV1: ScalableEvaluationRestartDurabilityDeclarationV1;
  reconcileSessionV1(input: {
    readonly operationId: string;
    readonly environmentId: string;
    readonly logicalTime: number;
  }):
    | import("./sharded-simulation-contracts.js").ShardedSimulationEnvironmentSessionV1
    | Promise<import("./sharded-simulation-contracts.js").ShardedSimulationEnvironmentSessionV1>;
  reconcileEpisodeV1(input: {
    readonly operationId: string;
    readonly session: import("./sharded-simulation-contracts.js").ShardedSimulationEnvironmentSessionV1;
    readonly episodeId: string;
    readonly seed: number;
    readonly logicalTime: number;
  }):
    | import("./sharded-simulation-contracts.js").ShardedSimulationEpisodeV1
    | Promise<import("./sharded-simulation-contracts.js").ShardedSimulationEpisodeV1>;
  reconcileShardAssignmentsV1(input: {
    readonly operationId: string;
    readonly session: import("./sharded-simulation-contracts.js").ShardedSimulationEnvironmentSessionV1;
    readonly episode: import("./sharded-simulation-contracts.js").ShardedSimulationEpisodeV1;
    readonly profile: import("./sharded-simulation-contracts.js").ShardedSimulationScaleProfileV1;
    readonly assignments: readonly import("./sharded-simulation-contracts.js").ShardedSimulationShardAssignmentV1[];
  }): void | Promise<void>;
  reconcileObservationV1(input: {
    readonly operationId: string;
    readonly pull: import("./sharded-simulation-contracts.js").ShardedSimulationPartialObservationPullV1;
  }):
    | ShardedSimulationPartialObservationDeliveryV1
    | Promise<ShardedSimulationPartialObservationDeliveryV1>;
  /** Exact retries reconcile and return the original terminal effect receipt. */
  reconcileEffectV1(input: {
    readonly operationId: string;
    readonly request: ShardedSimulationFencedActionRequestV1;
  }):
    | ShardedSimulationEffectReceiptV1
    | Promise<ShardedSimulationEffectReceiptV1>;
  /** Exact retries return the original ACK, not a newly hashed duplicate ACK. */
  reconcileCrossShardBatchV1(input: {
    readonly operationId: string;
    readonly batch: ShardedSimulationCrossShardMessageBatchV1;
  }):
    | ShardedSimulationCrossShardMessageAckV1
    | Promise<ShardedSimulationCrossShardMessageAckV1>;
  reconcileCheckpointV1(input: {
    readonly operationId: string;
    readonly session: import("./sharded-simulation-contracts.js").ShardedSimulationEnvironmentSessionV1;
    readonly episode: import("./sharded-simulation-contracts.js").ShardedSimulationEpisodeV1;
    readonly expectedRevision: number;
    readonly logicalTime: number;
  }): ShardedSimulationCheckpointV1 | Promise<ShardedSimulationCheckpointV1>;
  /** Must restore a committed predecessor even after an orphan checkpoint. */
  reconcileRestoreV1(input: {
    readonly operationId: string;
    readonly request: import("./sharded-simulation-contracts.js").ShardedSimulationRestoreRequestV1;
  }): ShardedSimulationRestoreReceiptV1 | Promise<ShardedSimulationRestoreReceiptV1>;
}

export interface ScalableEvaluationTeamBindingV1 {
  readonly schemaVersion: 1;
  readonly matchup: ScalableEvaluationMatchupV1;
  readonly left: ScalableEvaluationTeamPortV1;
  readonly right: ScalableEvaluationTeamPortV1;
}

export interface ScalableEvaluationEnvironmentBindingV1 {
  readonly schemaVersion: 1;
  readonly manifest: MultiDomainScenarioManifestV1;
  readonly bridge: ShardedSimulationEnvironmentBridgeV1;
}

export interface ScalableEvaluationAccountingInputV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly teamId: string;
  /** Strictly contiguous per team; replaces an unbounded event-id set. */
  readonly sequence: number;
  readonly logicalTime: number;
  readonly domain: ScalableEvaluationDomainV1;
  readonly kind: ScalableEvaluationActivityKindV1;
  readonly interactionCount: number;
  readonly messageCount: number;
  readonly messageBytes: number;
  readonly observationCount: number;
  readonly observationCountsByDomain: ScalableEvaluationObservationCountsV1;
  readonly actionCount: number;
  readonly successfulOutcomeCount: number;
  readonly failedOutcomeCount: number;
  readonly evidenceDigest: PlanningDigestV1;
}

export interface ScalableEvaluationCounterVectorV1 {
  readonly interactions: number;
  readonly messages: number;
  readonly messageBytes: number;
  readonly observations: number;
  readonly actions: number;
  readonly successfulOutcomes: number;
  readonly failedOutcomes: number;
}

export type ScalableEvaluationDomainCountersV1 = Readonly<
  Record<ScalableEvaluationDomainV1, ScalableEvaluationCounterVectorV1>
>;

export type ScalableEvaluationObservationCountsV1 = Readonly<
  Record<ScalableEvaluationDomainV1, number>
>;

export interface ScalableEvaluationAccountingRecordV1 extends ScalableEvaluationAccountingInputV1 {
  readonly previousChainDigest: PlanningDigestV1;
  readonly recordDigest: PlanningDigestV1;
  readonly chainDigest: PlanningDigestV1;
  readonly cumulative: ScalableEvaluationCounterVectorV1;
}

export interface ScalableEvaluationAccountingReceiptV1 {
  readonly schemaVersion: 1;
  readonly teamId: string;
  readonly sequence: number;
  readonly recordDigest: PlanningDigestV1;
  readonly chainDigest: PlanningDigestV1;
  readonly cumulative: ScalableEvaluationCounterVectorV1;
  readonly remainingInteractions: number;
  readonly remainingMessages: number;
  readonly remainingMessageBytes: number;
}

export interface ScalableEvaluationMetricTargetV1 {
  readonly metricId: string;
  readonly valueBasisPoints: number;
  readonly toleranceBasisPoints: number;
}

export interface ScalableEvaluationRecoveryBaselineV1 {
  readonly schemaVersion: 1;
  readonly baselineId: string;
  readonly teamId: string;
  readonly domain: ScalableEvaluationDomainV1;
  readonly establishedAtLogicalTime: number;
  readonly metrics: readonly ScalableEvaluationMetricTargetV1[];
  readonly baselineDigest: PlanningDigestV1;
}

export interface ScalableEvaluationPerturbationObservationV1 {
  readonly schemaVersion: 1;
  readonly perturbationId: string;
  readonly teamId: string;
  readonly domain: ScalableEvaluationDomainV1;
  readonly scheduledAtLogicalTime: number;
  readonly injectedAtLogicalTime: number;
  readonly observedAtLogicalTime: number;
  readonly evidenceDigest: PlanningDigestV1;
  readonly observationDigest: PlanningDigestV1;
}

export interface ScalableEvaluationRecoverySampleV1 {
  readonly schemaVersion: 1;
  readonly sampleId: string;
  readonly perturbationId: string;
  readonly teamId: string;
  readonly domain: ScalableEvaluationDomainV1;
  readonly logicalTime: number;
  readonly metrics: readonly Readonly<{
    metricId: string;
    valueBasisPoints: number;
  }>[];
  readonly maximumDistanceBasisPoints: number;
  readonly withinBaselineTolerance: boolean;
  readonly recoveryInteractions: number;
  readonly recoveryMessages: number;
  /** Provider-signed, scope-bound measurement verified before accounting. */
  readonly measurement: ScalableEvaluationRecoveryMeasurementReceiptV1;
  readonly sampleDigest: PlanningDigestV1;
}

export interface ScalableEvaluationRecoverySummaryV1 {
  readonly schemaVersion: 1;
  readonly perturbationId: string;
  readonly teamId: string;
  readonly domain: ScalableEvaluationDomainV1;
  readonly baselineDigest: PlanningDigestV1;
  readonly observedAtLogicalTime: number;
  readonly recoveredAtLogicalTime: number | null;
  readonly withinBaselineTolerance: boolean;
  readonly recoveryInteractions: number;
  readonly recoveryMessages: number;
  readonly latestSampleDigest: PlanningDigestV1 | null;
  readonly summaryDigest: PlanningDigestV1;
}

export interface ScalableEvaluationTeamSummaryV1 {
  readonly schemaVersion: 1;
  readonly teamId: string;
  readonly architecture: ScalableEvaluationTeamArchitectureV1;
  readonly lastSequence: number;
  readonly lastLogicalTime: number;
  readonly counters: ScalableEvaluationCounterVectorV1;
  readonly countersByDomain: ScalableEvaluationDomainCountersV1;
  readonly accountingChainDigest: PlanningDigestV1;
  readonly recoveryEpisodeCount: number;
  readonly recoveredEpisodeCount: number;
  readonly recoveryRateBasisPoints: number;
  readonly completedRecoveryInteractions: number;
  readonly completedRecoveryMessages: number;
  readonly summaryDigest: PlanningDigestV1;
}

export interface ScalableEvaluationSnapshotV1 {
  readonly schemaVersion: 1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly profileDigest: PlanningDigestV1;
  readonly teamSummaries: readonly ScalableEvaluationTeamSummaryV1[];
  readonly perturbationObservations: readonly ScalableEvaluationPerturbationObservationV1[];
  readonly recoverySummaries: readonly ScalableEvaluationRecoverySummaryV1[];
  readonly recentAccountingRecords: readonly ScalableEvaluationAccountingRecordV1[];
  readonly snapshotDigest: PlanningDigestV1;
}

export interface ScalableEvaluationRuntimeTeamStateV1 {
  readonly schemaVersion: 1;
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  readonly sequence: number;
  readonly lastLogicalTime: number;
  readonly chainDigest: PlanningDigestV1;
  readonly counters: ScalableEvaluationCounterVectorV1;
  readonly countersByDomain: ScalableEvaluationDomainCountersV1;
}

export interface ScalableEvaluationRuntimeRecoveryStateV1 {
  readonly schemaVersion: 1;
  readonly perturbationId: string;
  readonly teamId: string;
  readonly domain: ScalableEvaluationDomainV1;
  readonly baseline: ScalableEvaluationRecoveryBaselineV1;
  readonly observedAtLogicalTime: number;
  readonly startingInteractions: number;
  readonly startingMessages: number;
  readonly recoveredAtLogicalTime: number | null;
  readonly withinBaselineTolerance: boolean;
  readonly latestSampleDigest: PlanningDigestV1 | null;
  readonly recoveryInteractions: number;
  readonly recoveryMessages: number;
}

/** Canonical, hash-chained, bounded accounting state for process replacement. */
export interface ScalableEvaluationRuntimeStateV1 {
  readonly schemaVersion: 1;
  readonly definitionDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly revision: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly teams: readonly ScalableEvaluationRuntimeTeamStateV1[];
  readonly baselines: readonly ScalableEvaluationRecoveryBaselineV1[];
  readonly perturbationObservations: readonly ScalableEvaluationPerturbationObservationV1[];
  readonly recoveries: readonly ScalableEvaluationRuntimeRecoveryStateV1[];
  readonly environmentBindings: readonly Readonly<{
    readonly teamId: string;
    readonly sessionId: string;
    readonly episodeId: string;
  }>[];
  /** Physical bounded ring slots; cursor is the next replacement slot. */
  readonly recordTail: readonly ScalableEvaluationAccountingRecordV1[];
  readonly recordTailCursor: number;
  readonly stateDigest: PlanningDigestV1;
}

export type ScalableEvaluationRunnerPhaseV1 =
  | "perturbation"
  | "observation"
  | "team_step"
  | "action"
  | "message"
  | "accounting"
  | "recovery"
  | "advance"
  | "complete";

/** Provider-neutral durable runner checkpoint; saga state is bounded by one step. */
export interface ScalableEvaluationRunnerCheckpointV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly revision: number;
  readonly previousCheckpointDigest: PlanningDigestV1 | null;
  readonly definitionDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly scheduleDigest: PlanningDigestV1;
  readonly portsDigest: PlanningDigestV1;
  readonly configurationDigest: PlanningDigestV1;
  readonly phase: ScalableEvaluationRunnerPhaseV1;
  readonly stepIndex: number;
  readonly teamIndex: number;
  readonly phaseCursor: number;
  readonly processedSteps: number;
  readonly logicalTime: number;
  readonly traceDigest: PlanningDigestV1;
  readonly activeRecoveries: readonly string[];
  readonly runtimeState: ScalableEvaluationRuntimeStateV1;
  readonly teamEnvironments: readonly Readonly<{
    readonly teamId: string;
    readonly session: import("./sharded-simulation-contracts.js").ShardedSimulationEnvironmentSessionV1;
    readonly episode: import("./sharded-simulation-contracts.js").ShardedSimulationEpisodeV1;
    readonly environmentCheckpoint: ShardedSimulationCheckpointV1;
    readonly teamCheckpoint: ScalableEvaluationTeamCheckpointV1;
  }>[];
  /** Current one-step saga only; never contains declared-population state. */
  readonly saga: PlanningJson;
  readonly checkpointDigest: PlanningDigestV1;
}

export interface ScalableEvaluationCheckpointStoreCasReceiptV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly revision: number;
  readonly checkpointDigest: PlanningDigestV1;
  readonly status: "stored" | "duplicate" | "conflict";
  readonly currentRevision: number | null;
  readonly receiptDigest: PlanningDigestV1;
}

/** Provider-neutral CAS store. Implementations must survive process replacement. */
export interface ScalableEvaluationDurableCheckpointStoreV1 {
  readonly restartDurabilityV1: ScalableEvaluationRestartDurabilityDeclarationV1;
  loadV1(input: {
    readonly runId: string;
  }):
    | ScalableEvaluationRunnerCheckpointV1
    | null
    | Promise<ScalableEvaluationRunnerCheckpointV1 | null>;
  compareAndSwapV1(input: {
    readonly runId: string;
    readonly expectedRevision: number | null;
    readonly checkpoint: ScalableEvaluationRunnerCheckpointV1;
  }):
    | ScalableEvaluationCheckpointStoreCasReceiptV1
    | Promise<ScalableEvaluationCheckpointStoreCasReceiptV1>;
}

export interface ScalableEvaluationCounterDeltaV1 {
  readonly interactions: number;
  readonly messages: number;
  readonly messageBytes: number;
  readonly observations: number;
  readonly actions: number;
  readonly successfulOutcomes: number;
  readonly failedOutcomes: number;
  readonly recoveredEpisodes: number;
  readonly completedRecoveryInteractions: number;
  readonly completedRecoveryMessages: number;
}

/** Signed deltas are left minus right. No winner is inferred by the runtime. */
export interface ScalableEvaluationComparisonV1 {
  readonly schemaVersion: 1;
  readonly comparisonKind: "team-vs-team";
  readonly definitionDigest: PlanningDigestV1;
  readonly matchupDigest: PlanningDigestV1;
  readonly left: ScalableEvaluationTeamSummaryV1;
  readonly right: ScalableEvaluationTeamSummaryV1;
  readonly leftMinusRight: ScalableEvaluationCounterDeltaV1;
  readonly comparisonDigest: PlanningDigestV1;
}

export function isScalableEvaluationDomainV1(
  value: MultiDomainEnvironmentDomainV1,
): value is ScalableEvaluationDomainV1 {
  return value !== "hybrid";
}

/** Runtime dependencies accepted by the environment binder. */
export interface ScalableEvaluationEnvironmentInputV1 {
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly adapter: MultiDomainEnvironmentAdapterV1;
  readonly abortSignal?: { readonly aborted: boolean };
}

/** Typed helper for observation validation at the accounting boundary. */
export interface ScalableEvaluationPartialObservationInputV1 {
  readonly accounting: Omit<
    ScalableEvaluationAccountingInputV1,
    | "kind"
    | "interactionCount"
    | "messageCount"
    | "messageBytes"
    | "observationCount"
    | "observationCountsByDomain"
    | "actionCount"
    | "successfulOutcomeCount"
    | "failedOutcomeCount"
  >;
  readonly peerIndex: number;
  readonly delivery: ShardedSimulationPartialObservationDeliveryV1;
  readonly observations: readonly MultiDomainObservationEnvelopeV1[];
}

/** A bounded logical work item. Schedules are intentionally sparse at every scale. */
export interface ScalableEvaluationRunnerStepV1 {
  readonly schemaVersion: 1;
  readonly peerIndex: number;
  readonly domain: ScalableEvaluationDomainV1;
  readonly cursor: string | null;
}

/**
 * Baselines are evaluator inputs, not team inputs. A perturbation requires one
 * baseline for every targeted team/domain pair before execution starts.
 */
export interface ScalableEvaluationRunnerRecoveryBaselineV1 {
  readonly schemaVersion: 1;
  readonly baselineId: string;
  readonly teamId: string;
  readonly domain: ScalableEvaluationDomainV1;
  readonly metrics: readonly ScalableEvaluationMetricTargetV1[];
}

export type ScalableEvaluationEvidenceKindV1 =
  "perturbation_injection" | "recovery_measurement";

export interface ScalableEvaluationEvidenceProviderAuthorizationV1 {
  readonly schemaVersion: 1;
  readonly authorizationId: string;
  readonly providerId: string;
  readonly keyId: string;
  readonly algorithm: "Ed25519";
  readonly status: "active" | "revoked";
  readonly evidenceKinds: readonly ScalableEvaluationEvidenceKindV1[];
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly teamIds: readonly string[];
  readonly authorizationDigest: PlanningDigestV1;
}

export interface ScalableEvaluationEvidenceAuthorizationResolverV1 {
  resolve(input: {
    readonly providerId: string;
    readonly keyId: string;
    readonly authorizationDigest: PlanningDigestV1;
  }): Promise<ScalableEvaluationEvidenceProviderAuthorizationV1 | null>;
}

export interface ScalableEvaluationEvidencePublicKeyResolverV1 {
  resolve(input: {
    readonly providerId: string;
    readonly keyId: string;
    readonly algorithm: "Ed25519";
  }): Promise<CryptoKey | null>;
}

export interface ScalableEvaluationEvidenceSignerV1 {
  sign(input: {
    readonly providerId: string;
    readonly keyId: string;
    readonly algorithm: "Ed25519";
    readonly evidenceDigest: PlanningDigestV1;
  }): Promise<string>;
}

export interface ScalableEvaluationEvidenceProofV1 {
  readonly algorithm: "Ed25519";
  readonly providerId: string;
  readonly keyId: string;
  readonly authorizationDigest: PlanningDigestV1;
  /** Detached Ed25519 signature encoded as unpadded base64url. */
  readonly value: string;
}

export interface ScalableEvaluationEvidenceVerifierV1 {
  verify(input: {
    readonly evidenceKind: ScalableEvaluationEvidenceKindV1;
    readonly definition: ScalableEvaluationDefinitionV1;
    readonly teamId: string;
    readonly evidenceDigest: PlanningDigestV1;
    readonly proof: ScalableEvaluationEvidenceProofV1;
  }): Promise<boolean>;
}

/** Provider measurement; its signature binds the exact recovery sample scope. */
export interface ScalableEvaluationRecoveryMeasurementReceiptV1 {
  readonly schemaVersion: 1;
  readonly sampleId: string;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly perturbationId: string;
  readonly perturbationConfigurationDigest: PlanningDigestV1;
  readonly teamId: string;
  readonly domain: ScalableEvaluationDomainV1;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly scheduledAtLogicalTime: number;
  readonly logicalTime: number;
  readonly metrics: readonly Readonly<{
    readonly metricId: string;
    readonly valueBasisPoints: number;
  }>[];
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly providerId: string;
  readonly keyId: string;
  readonly authorizationDigest: PlanningDigestV1;
  readonly algorithm: "Ed25519";
  readonly evidenceDigest: PlanningDigestV1;
  readonly proof: ScalableEvaluationEvidenceProofV1;
  readonly receiptDigest: PlanningDigestV1;
}

/** Runtime provider port; returned measurements require concrete verification. */
export interface ScalableEvaluationRecoveryMetricPortV1 {
  sampleV1(input: {
    readonly definition: ScalableEvaluationDefinitionV1;
    readonly perturbation: ScalableEvaluationPerturbationV1;
    readonly teamId: string;
    readonly domain: ScalableEvaluationDomainV1;
    readonly sampleId: string;
    readonly sessionId: string;
    readonly episodeId: string;
    readonly logicalTime: number;
  }):
    | ScalableEvaluationRecoveryMeasurementReceiptV1
    | Promise<ScalableEvaluationRecoveryMeasurementReceiptV1>;
}

export interface ScalableEvaluationResumableRecoveryMetricPortV1
  extends ScalableEvaluationRecoveryMetricPortV1 {
  readonly restartDurabilityV1: ScalableEvaluationRestartDurabilityDeclarationV1;
  reconcileSampleV1(input: {
    readonly operationId: string;
    readonly definition: ScalableEvaluationDefinitionV1;
    readonly perturbation: ScalableEvaluationPerturbationV1;
    readonly teamId: string;
    readonly domain: ScalableEvaluationDomainV1;
    readonly sampleId: string;
    readonly sessionId: string;
    readonly episodeId: string;
    readonly logicalTime: number;
  }):
    | ScalableEvaluationRecoveryMeasurementReceiptV1
    | Promise<ScalableEvaluationRecoveryMeasurementReceiptV1>;
}

/**
 * Receipt returned by the simulation provider after it has actually applied a
 * scheduled perturbation. The runner records the receipt digest as evidence;
 * it never fabricates an injection observation from the evaluation plan.
 */
export interface ScalableEvaluationPerturbationInjectionReceiptV1 {
  readonly schemaVersion: 1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly perturbationId: string;
  readonly teamId: string;
  readonly perturbationConfigurationDigest: PlanningDigestV1;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly scheduledAtLogicalTime: number;
  readonly injectedAtLogicalTime: number;
  readonly accepted: true;
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly providerId: string;
  readonly keyId: string;
  readonly authorizationDigest: PlanningDigestV1;
  readonly algorithm: "Ed25519";
  readonly evidenceDigest: PlanningDigestV1;
  readonly proof: ScalableEvaluationEvidenceProofV1;
  readonly receiptDigest: PlanningDigestV1;
}

/** Provider-neutral simulation control surface for real fault injection. */
export interface ScalableEvaluationPerturbationPortV1 {
  injectV1(input: {
    readonly evaluationDefinitionDigest: PlanningDigestV1;
    readonly perturbation: ScalableEvaluationPerturbationV1;
    readonly teamId: string;
    readonly sessionId: string;
    readonly episodeId: string;
    readonly logicalTime: number;
  }):
    | ScalableEvaluationPerturbationInjectionReceiptV1
    | Promise<ScalableEvaluationPerturbationInjectionReceiptV1>;
}

export interface ScalableEvaluationResumablePerturbationPortV1
  extends ScalableEvaluationPerturbationPortV1 {
  readonly restartDurabilityV1: ScalableEvaluationRestartDurabilityDeclarationV1;
  reconcileInjectionV1(input: {
    readonly operationId: string;
    readonly evaluationDefinitionDigest: PlanningDigestV1;
    readonly perturbation: ScalableEvaluationPerturbationV1;
    readonly teamId: string;
    readonly sessionId: string;
    readonly episodeId: string;
    readonly logicalTime: number;
  }):
    | ScalableEvaluationPerturbationInjectionReceiptV1
    | Promise<ScalableEvaluationPerturbationInjectionReceiptV1>;
}

/**
 * Provider-neutral action fencing supplied by the embedding application.
 * There is deliberately no synthetic runner-owned fallback.
 */
export interface ScalableEvaluationActionAuthorityV1 {
  issueV1(input: {
    readonly teamId: string;
    readonly peerIndex: number;
    readonly logicalTime: number;
    readonly actionIndex: number;
    readonly sessionId: string;
    readonly episodeId: string;
  }): { readonly executionEpoch: number; readonly fenceToken: string };
}

export interface ScalableEvaluationResumableActionAuthorityV1
  extends ScalableEvaluationActionAuthorityV1 {
  readonly restartDurabilityV1: ScalableEvaluationRestartDurabilityDeclarationV1;
  reconcileV1(input: {
    readonly operationId: string;
    readonly teamId: string;
    readonly peerIndex: number;
    readonly logicalTime: number;
    readonly actionIndex: number;
    readonly sessionId: string;
    readonly episodeId: string;
  }): { readonly executionEpoch: number; readonly fenceToken: string };
}

export interface ScalableEvaluationExecutionResultV1 {
  readonly schemaVersion: 1;
  readonly status: "completed" | "cancelled" | "budget_exhausted";
  readonly processedSteps: number;
  /** One isolated, equal-seed environment state per compared team. */
  readonly teamEnvironments: readonly ScalableEvaluationTeamEnvironmentBindingV1[];
  readonly traceDigest: PlanningDigestV1;
  readonly snapshot: ScalableEvaluationSnapshotV1;
  readonly comparison: ScalableEvaluationComparisonV1;
  readonly resultDigest: PlanningDigestV1;
}

export interface ScalableEvaluationRunnerInputV1 {
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly adapter: MultiDomainEnvironmentAdapterV1;
  readonly ports: readonly [
    ScalableEvaluationTeamPortV1,
    ScalableEvaluationTeamPortV1,
  ];
  readonly shardCount: number;
  readonly steps: readonly ScalableEvaluationRunnerStepV1[];
  readonly recoveryBaselines?: readonly ScalableEvaluationRunnerRecoveryBaselineV1[];
  readonly recoveryMetrics?: ScalableEvaluationRecoveryMetricPortV1;
  readonly perturbationPort?: ScalableEvaluationPerturbationPortV1;
  readonly evidenceVerifier?: ScalableEvaluationEvidenceVerifierV1;
  readonly actionAuthority?: ScalableEvaluationActionAuthorityV1;
  /** Both values are required together and select restart-durable execution. */
  readonly durableStore?: ScalableEvaluationDurableCheckpointStoreV1;
  readonly runId?: string;
  readonly abortSignal?: { readonly aborted: boolean };
}

export interface ScalableEvaluationTeamEnvironmentBindingV1 {
  readonly schemaVersion: 1;
  readonly teamId: string;
  readonly sessionDigest: PlanningDigestV1;
  readonly episodeDigest: PlanningDigestV1;
  readonly bindingDigest: PlanningDigestV1;
}
