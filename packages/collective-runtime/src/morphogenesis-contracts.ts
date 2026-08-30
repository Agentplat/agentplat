import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type { WorkflowDigestV1 } from "@agentplat/workflows";

export const MORPHOGENESIS_SCHEMA_VERSION_V1 = 1 as const;
export const MORPHOLOGY_HEAD_STATE_FORMAT_V1 =
  "application/vnd.agentplat.morphology-head.v1+json" as const;
export const MORPHOGENESIS_CATALOG_LIFECYCLE_PROCESS_ID_V1 =
  "agentplat.morphogenesis.catalog-lifecycle.v1" as const;
export const MORPHOGENESIS_CATALOG_LIFECYCLE_PROCESS_VERSION_V1 =
  "1" as const;

export const MORPHOLOGY_SOURCE_CLASSES_V1 = Object.freeze([
  "mission",
  "room",
  "planning",
  "execution",
  "team",
  "membership",
  "trust",
  "capability",
  "work",
  "role",
  "topology",
  "cost",
  "environment",
] as const);

export type MorphologySourceClassV1 =
  (typeof MORPHOLOGY_SOURCE_CLASSES_V1)[number];

export const MORPHOLOGY_COMPONENT_KINDS_V1 = Object.freeze([
  "agent",
  "team",
  "role",
  "capability",
  "work_contract",
  "membership",
  "topology",
  "room_participation",
  "artifact",
  "checkpoint",
] as const);

export type MorphologyComponentKindV1 =
  (typeof MORPHOLOGY_COMPONENT_KINDS_V1)[number];

export const MORPHOGENESIS_REASON_CODES_V1 = Object.freeze([
  "missing_capability",
  "insufficient_capacity",
  "quality_below_policy",
  "deadline_risk",
  "cost_inefficiency",
  "agent_failure",
  "trust_or_safety_restriction",
  "context_or_role_misalignment",
  "environment_change",
  "mission_phase_change",
  "redundant_capacity",
  "authorized_change_request",
] as const);

export type MorphogenesisReasonCodeV1 =
  (typeof MORPHOGENESIS_REASON_CODES_V1)[number];

export const MORPHOGENESIS_DECISION_ROUTES_V1 = Object.freeze([
  "local_policy",
  "authorized_agent",
  "authorized_person",
  "collective",
  "composite",
] as const);

export type MorphogenesisDecisionRouteV1 =
  (typeof MORPHOGENESIS_DECISION_ROUTES_V1)[number];

export const MORPHOGENESIS_OPERATORS_V1 = Object.freeze([
  "recruit_existing",
  "instantiate_agent",
  "derive_agent",
  "realign_role",
  "reassign_work",
  "replace_agent",
  "split_team",
  "merge_teams",
  "federate_teams",
  "detach_agent",
  "suspend_agent",
  "retire_agent",
] as const);

export type MorphogenesisOperatorV1 =
  (typeof MORPHOGENESIS_OPERATORS_V1)[number];

export const MORPHOGENESIS_FIRST_RELEASE_OPERATORS_V1 = Object.freeze([
  "recruit_existing",
  "instantiate_agent",
  "detach_agent",
  "retire_agent",
] as const satisfies readonly MorphogenesisOperatorV1[]);

export type MorphogenesisEffectClassV1 = "internal" | "protected_external";

export type MorphologyAgentDispositionKindV1 =
  | "retain"
  | "rebind"
  | "drain"
  | "detach"
  | "suspend"
  | "retire";

export type MorphologyPositionFillModeV1 =
  | "retain_current"
  | "recruit_existing"
  | "instantiate_catalog";

export interface MorphogenesisScopeV1 {
  readonly schemaVersion: 1;
  readonly tenantId: AgentPlatID;
  readonly morphologyId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly missionId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly meshId: AgentPlatID | null;
  readonly roomId: AgentPlatID | null;
  readonly workItemId: AgentPlatID | null;
  readonly workItemRevision: number | null;
  readonly scopeDigest: PlanningDigestV1;
}

export interface MorphologySourceHeadV1 {
  readonly schemaVersion: 1;
  readonly sourceHeadId: AgentPlatID;
  readonly sourceClass: MorphologySourceClassV1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly sourceRecordDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly authenticationEvidenceDigest: PlanningDigestV1;
  readonly required: boolean;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly sourceHeadDigest: PlanningDigestV1;
}

export interface MorphologyComponentReferenceV1 {
  readonly schemaVersion: 1;
  readonly componentKind: MorphologyComponentKindV1;
  readonly componentId: AgentPlatID;
  readonly sourceHeadDigest: PlanningDigestV1;
  readonly recordDigest: PlanningDigestV1;
  readonly revision: number | null;
  readonly epoch: number | null;
  readonly componentDigest: PlanningDigestV1;
}

export interface MorphologyPopulationCountersV1 {
  readonly activeAgents: number;
  readonly dormantAgents: number;
  readonly activeTeams: number;
  readonly concurrentlyProvisioningAgents: number;
}

export interface MorphologyResourceCountersV1 {
  readonly configuredResourceUnits: number;
  readonly reservedResourceUnits: number;
  readonly consumedInteractionUnits: number;
}

export interface MorphologySnapshotV1 {
  readonly schemaVersion: 1;
  readonly snapshotId: AgentPlatID;
  readonly scope: MorphogenesisScopeV1;
  readonly morphologyEpoch: number;
  readonly previousMorphologyDigest: PlanningDigestV1 | null;
  readonly policyDigest: PlanningDigestV1;
  readonly implementationDigest: PlanningDigestV1;
  readonly sourceHeads: readonly MorphologySourceHeadV1[];
  readonly components: readonly MorphologyComponentReferenceV1[];
  readonly population: MorphologyPopulationCountersV1;
  readonly resources: MorphologyResourceCountersV1;
  readonly observedAtLogicalMs: number;
  readonly logicalTimeHighWaterMs: number;
  readonly snapshotDigest: PlanningDigestV1;
}

export interface MorphogenesisNeedV1 {
  readonly schemaVersion: 1;
  readonly needId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly currentSnapshotDigest: PlanningDigestV1;
  readonly reasonCode: MorphogenesisReasonCodeV1;
  readonly severityBps: number;
  readonly boundedViewDigest: PlanningDigestV1 | null;
  readonly candidateSearchLimit: number | null;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly detectedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly needDigest: PlanningDigestV1;
}

export interface TargetMorphologyPositionV1 {
  readonly schemaVersion: 1;
  readonly positionId: AgentPlatID;
  readonly roleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly dependsOnPositionIds: readonly AgentPlatID[];
  readonly fillMode: MorphologyPositionFillModeV1;
  readonly currentAgentId: AgentPlatID | null;
  readonly instantiationProfileDigest: PlanningDigestV1 | null;
  readonly resourceBudgetUnits: number;
  readonly maximumActionBudgetUnits: number;
  readonly positionDigest: PlanningDigestV1;
}

export interface TargetMorphologyAgentDispositionV1 {
  readonly schemaVersion: 1;
  readonly agentId: AgentPlatID;
  readonly expectedLineageDigest: PlanningDigestV1;
  readonly disposition: MorphologyAgentDispositionKindV1;
  readonly targetPositionId: AgentPlatID | null;
  readonly targetRoleDefinitionDigest: PlanningDigestV1 | null;
  readonly reasonCode: string;
  readonly dispositionDigest: PlanningDigestV1;
}

export interface TargetMorphologyV1 {
  readonly schemaVersion: 1;
  readonly targetId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly currentSnapshotDigest: PlanningDigestV1;
  readonly expectedCurrentEpoch: number;
  readonly positions: readonly TargetMorphologyPositionV1[];
  readonly agentDispositions: readonly TargetMorphologyAgentDispositionV1[];
  readonly invariantDigests: readonly PlanningDigestV1[];
  readonly estimatedActiveAgents: number;
  readonly estimatedNewAgents: number;
  readonly estimatedResourceUnits: number;
  readonly targetDigest: PlanningDigestV1;
}

export interface MorphogenesisCurrencyAmountV1 {
  readonly currency: string;
  readonly micros: number;
}

export interface MorphogenesisBudgetEnvelopeV1 {
  readonly maximumActiveAgents: number;
  readonly maximumNewAgents: number;
  readonly maximumConcurrentProvisioning: number;
  readonly maximumResourceUnits: number;
  readonly maximumInteractionUnits: number;
  readonly maximumActionUnits: number;
  readonly maximumInputTokens: number;
  readonly maximumOutputTokens: number;
  readonly maximumTotalTokens: number;
  readonly maximumDurationMs: number;
  readonly maximumCosts: readonly MorphogenesisCurrencyAmountV1[];
  readonly budgetDigest: PlanningDigestV1;
}

export type MorphogenesisCompensationKindV1 =
  | "none"
  | "release_budget"
  | "terminate_unenrolled"
  | "detach_successor"
  | "restore_predecessor_before_commit";

export interface MorphogenesisOperationV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly operator: MorphogenesisOperatorV1;
  readonly effectClass: MorphogenesisEffectClassV1;
  readonly dependsOnOperationIds: readonly AgentPlatID[];
  readonly targetReferenceDigest: PlanningDigestV1;
  readonly compensation: MorphogenesisCompensationKindV1;
  readonly operationDigest: PlanningDigestV1;
}

export interface MorphogenesisProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly currentSnapshotDigest: PlanningDigestV1;
  readonly expectedCurrentEpoch: number;
  readonly needDigest: PlanningDigestV1;
  readonly targetDigest: PlanningDigestV1;
  readonly operations: readonly MorphogenesisOperationV1[];
  readonly processDefinitionDigest: WorkflowDigestV1;
  readonly budget: MorphogenesisBudgetEnvelopeV1;
  readonly decisionRoute: MorphogenesisDecisionRouteV1;
  readonly proposerId: AgentPlatID;
  readonly proposerVersion: number;
  readonly proposerImplementationDigest: PlanningDigestV1;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly proposalDigest: PlanningDigestV1;
  readonly advisoryOnly: true;
}

export interface MorphogenesisLimitsV1 {
  readonly maximumSourceHeads: number;
  readonly maximumComponents: number;
  readonly maximumPositions: number;
  readonly maximumAgentDispositions: number;
  readonly maximumOperations: number;
  readonly maximumDependenciesPerOperation: number;
  readonly maximumEvidenceDigests: number;
  readonly maximumInvariantDigests: number;
  readonly maximumProposalTtlMs: number;
  readonly maximumNeedTtlMs: number;
  readonly maximumSourceFreshnessMs: number;
  readonly maximumCommitAttempts: number;
  readonly maximumTransformationsPerWindow: number;
  readonly transformationWindowMs: number;
  readonly cooldownMs: number;
  readonly hysteresisBps: number;
}

export interface MorphogenesisPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly requiredSourceClasses: readonly MorphologySourceClassV1[];
  readonly allowedOperators: readonly MorphogenesisOperatorV1[];
  readonly allowedDecisionRoutes: readonly MorphogenesisDecisionRouteV1[];
  readonly requireIndependentDecider: boolean;
  readonly allowAgentCreation: boolean;
  readonly maximumPopulation: number;
  readonly maximumNewAgentsPerProposal: number;
  readonly maximumResourceUnitsPerProposal: number;
  readonly minimumNeedSeverityBps: number;
  readonly limits: MorphogenesisLimitsV1;
}

export interface MorphogenesisPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: MorphogenesisPolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

export const MORPHOGENESIS_ADVANCED_CAPABILITIES_V2 = Object.freeze([
  "derived_profiles",
  "synthesized_profiles",
  "role_realignments",
  "work_reassignments",
  "agent_replacements",
  "agent_suspensions",
  "team_topology_transformations",
  "recursive_creation",
] as const);

export type MorphogenesisAdvancedCapabilityV2 =
  (typeof MORPHOGENESIS_ADVANCED_CAPABILITIES_V2)[number];

export interface MorphogenesisPolicyV2
  extends Omit<MorphogenesisPolicyV1, "schemaVersion"> {
  readonly schemaVersion: 2;
  readonly enabledAdvancedCapabilities:
    readonly MorphogenesisAdvancedCapabilityV2[];
  readonly maximumDerivedAgentsPerProposal: number;
  readonly maximumSynthesizedAgentsPerProposal: number;
  readonly maximumRoleChangesPerProposal: number;
  readonly maximumWorkReassignmentsPerProposal: number;
  readonly maximumReplacementsPerProposal: number;
  readonly maximumSuspensionsPerProposal: number;
  readonly maximumTopologyOperationsPerProposal: number;
  readonly maximumCreationDepth: number;
}

export interface MorphogenesisPolicyRecordV2 {
  readonly schemaVersion: 2;
  readonly policy: MorphogenesisPolicyV2;
  readonly policyDigest: PlanningDigestV1;
}

export type MorphogenesisPolicyAnyV1 =
  | MorphogenesisPolicyV1
  | MorphogenesisPolicyV2;

export type MorphogenesisPolicyRecordAnyV1 =
  | MorphogenesisPolicyRecordV1
  | MorphogenesisPolicyRecordV2;

export interface MorphologyHeadV1 {
  readonly format: typeof MORPHOLOGY_HEAD_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly morphologyEpoch: number;
  readonly snapshotDigest: PlanningDigestV1;
  readonly acceptedProposalDigest: PlanningDigestV1 | null;
  readonly decisionDigest: PlanningDigestV1 | null;
  readonly receiptDigest: PlanningDigestV1 | null;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorHeadDigest: PlanningDigestV1 | null;
  readonly headDigest: PlanningDigestV1;
}

export interface MorphologyHeadStoreV1 {
  load(stateKey: AgentPlatID): Promise<MorphologyHeadV1 | null>;
  save(input: {
    readonly head: MorphologyHeadV1;
    readonly expectedRevision: number | null;
    readonly expectedHeadDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export interface MorphologyHeadCommitV1 {
  readonly stateKey: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly expectedMorphologyEpoch: number;
  readonly snapshotDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly receiptDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}
