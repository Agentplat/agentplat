import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  TeamFormationRequestV1,
  TeamFormationScopeV1,
  TeamPositionBidV1,
  TeamPositionV1,
} from "./team-formation-contracts.js";

export const TEAM_STRUCTURE_ADAPTATION_SCHEMA_VERSION_V1 = 1 as const;
export const TEAM_STRUCTURE_ADAPTATION_STATE_FORMAT_V1 =
  "application/vnd.agentplat.team-structure-adaptation-state.v1+json" as const;
export const TEAM_STRUCTURE_ADAPTATION_HANDOFF_FORMAT_V1 =
  "application/vnd.agentplat.team-structure-adaptation-handoff.v1+json" as const;

export type TeamStructureOutcomeV1 =
  "completed" | "failed" | "unsafe" | "incomplete";

export type TeamStructureTerminalExecutionStatusV1 =
  "completed" | "recovery_required" | "cancelled";

export interface TeamStructureTemplatePositionV1 {
  readonly schemaVersion: 1;
  readonly templatePositionId: AgentPlatID;
  readonly roleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly completionCriteria: readonly string[];
  readonly dependsOnTemplatePositionIds: readonly AgentPlatID[];
  readonly budgetUnits: number;
  readonly maximumActionBudgetUnits: number;
  readonly positionTemplateDigest: PlanningDigestV1;
}

/** Approved role graph only. Templates contain no candidate, authority, or content data. */
export interface TeamStructureTemplateV1 {
  readonly schemaVersion: 1;
  readonly templateId: AgentPlatID;
  readonly templateVersion: number;
  readonly positions: readonly TeamStructureTemplatePositionV1[];
  readonly templateDigest: PlanningDigestV1;
}

/** Immutable allow-list. Adaptation cannot synthesize templates or roles. */
export interface TeamStructureTemplateCatalogV1 {
  readonly schemaVersion: 1;
  readonly catalogId: AgentPlatID;
  readonly catalogVersion: number;
  readonly parentCatalogDigest: PlanningDigestV1 | null;
  readonly baselineTemplateId: AgentPlatID;
  readonly templates: readonly TeamStructureTemplateV1[];
  readonly catalogDigest: PlanningDigestV1;
}

export interface TeamStructureAdaptationLimitsV1 {
  readonly maximumTemplates: number;
  readonly maximumPositionsPerTemplate: number;
  readonly maximumDependenciesPerPosition: number;
  readonly maximumObservations: number;
  readonly maximumDecisions: number;
  readonly maximumCommitAttempts: number;
  readonly maximumDecisionTtlMs: number;
}

/** All learning values are bounded integers; no caller-provided reward is accepted. */
export interface TeamStructureAdaptationPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly learningStepMicros: number;
  readonly minimumObservationCount: number;
  readonly initialWeightMicros: number;
  readonly minimumWeightMicros: number;
  readonly maximumWeightMicros: number;
  readonly baselineProbabilityFloorBps: number;
  readonly explorationCapBps: number;
  readonly cooldownEpochs: number;
  readonly hysteresisMicros: number;
  readonly quarantineEpochs: number;
  readonly limits: TeamStructureAdaptationLimitsV1;
}

export interface TeamStructureAdaptationPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: TeamStructureAdaptationPolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

export interface TeamStructureObservationV1 {
  readonly schemaVersion: 1;
  readonly observationId: AgentPlatID;
  readonly executionStateDigest: PlanningDigestV1;
  readonly executionId: AgentPlatID;
  readonly executionEpoch: number;
  readonly executionRecordDigest: PlanningDigestV1;
  readonly terminalExecutionStatus: TeamStructureTerminalExecutionStatusV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly jointWorkContractDigest: PlanningDigestV1;
  readonly adaptationEpoch: number;
  readonly decisionDigest: PlanningDigestV1;
  readonly teamId: AgentPlatID;
  readonly teamEpoch: number;
  readonly templateId: AgentPlatID;
  readonly templateDigest: PlanningDigestV1;
  readonly outcome: TeamStructureOutcomeV1;
  readonly completedPositionCount: number;
  readonly failedPositionCount: number;
  readonly unsafePositionCount: number;
  readonly observedAtLogicalMs: number;
  readonly observationDigest: PlanningDigestV1;
}

export interface TeamStructureTemplateArmV1 {
  readonly schemaVersion: 1;
  readonly templateId: AgentPlatID;
  readonly templateDigest: PlanningDigestV1;
  readonly weightMicros: number;
  readonly selectionCount: number;
  readonly observationCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly unsafeCount: number;
  readonly quarantinedUntilEpoch: number;
}

export interface TeamStructureObservationHeadV1 {
  readonly schemaVersion: 1;
  readonly observationId: AgentPlatID;
  readonly executionId: AgentPlatID;
  readonly executionEpoch: number;
  readonly adaptationEpoch: number;
  readonly decisionDigest: PlanningDigestV1;
  readonly teamEpoch: number;
  readonly observationDigest: PlanningDigestV1;
}

export interface TeamStructureAdaptationRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly currentAdaptationEpoch: number;
  readonly nextAdaptationEpoch: number;
  readonly logicalTimeMs: number;
  readonly validUntilLogicalMs: number;
  readonly eligibleTemplateIds: readonly AgentPlatID[];
  readonly explorationDrawBps: number;
  readonly entropyEvidenceDigest: PlanningDigestV1;
}

export interface TeamStructureAdaptationDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: AgentPlatID;
  readonly requestId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly selectedTemplateId: AgentPlatID;
  readonly selectedTemplateDigest: PlanningDigestV1;
  readonly selectionMode:
    | "baseline"
    | "baseline_floor"
    | "explore"
    | "exploit"
    | "hysteresis"
    | "cooldown"
    | "safe_fallback";
  readonly adaptationEpoch: number;
  readonly advisoryOnly: true;
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly decisionDigest: PlanningDigestV1;
}

export interface TeamStructureAdaptationStateV1 {
  readonly format: typeof TEAM_STRUCTURE_ADAPTATION_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly adaptationId: AgentPlatID;
  readonly adaptationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly adaptationEpochHighWater: number;
  readonly arms: readonly TeamStructureTemplateArmV1[];
  readonly observationDigests: readonly PlanningDigestV1[];
  readonly observationHeads: readonly TeamStructureObservationHeadV1[];
  readonly decisions: readonly TeamStructureAdaptationDecisionV1[];
  readonly lastDecision: TeamStructureAdaptationDecisionV1 | null;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface TeamStructureObservationReductionInputV1 {
  readonly state: TeamStructureAdaptationStateV1;
  readonly catalog: TeamStructureTemplateCatalogV1;
  readonly policy: TeamStructureAdaptationPolicyRecordV1;
  readonly observation: TeamStructureObservationV1;
}

export interface TeamStructureDecisionReductionInputV1 {
  readonly state: TeamStructureAdaptationStateV1;
  readonly catalog: TeamStructureTemplateCatalogV1;
  readonly policy: TeamStructureAdaptationPolicyRecordV1;
  readonly request: TeamStructureAdaptationRequestV1;
}

export interface TeamStructureAdaptationStoreV1 {
  load(stateKey: AgentPlatID): Promise<TeamStructureAdaptationStateV1 | null>;
  save(input: {
    readonly state: TeamStructureAdaptationStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

/** Local provenance gate. Learning is impossible until this port admits the exact observation. */
export interface TeamStructureObservationAdmissionPortV1 {
  readonly admissionId: AgentPlatID;
  readonly admissionVersion: number;
  readonly implementationId: AgentPlatID;
  verify(input: {
    readonly observation: TeamStructureObservationV1;
    readonly catalog: TeamStructureTemplateCatalogV1;
  }): Promise<boolean>;
}

export interface TeamStructureAdaptationRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly adaptationId: AgentPlatID;
  readonly adaptationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly catalog: TeamStructureTemplateCatalogV1;
  readonly policy: TeamStructureAdaptationPolicyRecordV1;
  readonly observationAdmission: TeamStructureObservationAdmissionPortV1;
  readonly store: TeamStructureAdaptationStoreV1;
}

export interface TeamStructureAdaptationPortV1 {
  readonly adaptationId: AgentPlatID;
  readonly adaptationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogDigest: PlanningDigestV1;
  observe(
    observation: TeamStructureObservationV1,
  ): Promise<TeamStructureAdaptationStateV1>;
  recommend(
    request: TeamStructureAdaptationRequestV1,
  ): Promise<TeamStructureAdaptationDecisionV1>;
  loadState(): Promise<TeamStructureAdaptationStateV1>;
  exportHandoff(input: {
    readonly targetStateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }): Promise<TeamStructureAdaptationHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: TeamStructureAdaptationHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamStructureAdaptationStateV1>;
}

export interface TeamStructureAdaptationHandoffEnvelopeV1 {
  readonly format: typeof TEAM_STRUCTURE_ADAPTATION_HANDOFF_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly contentClass: "team_structure_adaptation_state";
  readonly adaptationId: AgentPlatID;
  readonly adaptationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogDigest: PlanningDigestV1;
  readonly sourceStateKey: AgentPlatID;
  readonly sourceStateDigest: PlanningDigestV1;
  readonly targetStateKey: AgentPlatID;
  readonly exportedAtLogicalMs: number;
  readonly sourceState: TeamStructureAdaptationStateV1;
  readonly handoffDigest: PlanningDigestV1;
}

export interface TeamStructurePositionBindingV1 {
  readonly templatePositionId: AgentPlatID;
  readonly positionId: AgentPlatID;
  readonly workItemId: AgentPlatID;
  readonly workItemRevision: number;
}

export interface TeamStructureMaterializationV1 {
  readonly schemaVersion: 1;
  readonly templateId: AgentPlatID;
  readonly templateDigest: PlanningDigestV1;
  readonly bindings: readonly TeamStructurePositionBindingV1[];
  readonly positions: readonly TeamPositionV1[];
  readonly materializationDigest: PlanningDigestV1;
}

export interface TeamStructureFormationAdapterInputV1 {
  readonly decision: TeamStructureAdaptationDecisionV1;
  readonly catalog: TeamStructureTemplateCatalogV1;
  readonly materialization: TeamStructureMaterializationV1;
  readonly requestId: AgentPlatID;
  readonly scope: TeamFormationScopeV1;
  readonly targetTeamEpoch: number;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly bids: readonly TeamPositionBidV1[];
  readonly logicalTimeMs: number;
  readonly validUntilLogicalMs: number;
}

export type TeamStructureFormationRequestV1 = TeamFormationRequestV1;
