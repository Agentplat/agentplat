import type { JsonValue } from "@agentplat/core";

export const COLLECTIVE_PLANNING_SCHEMA_VERSION = 1 as const;

export type PlanningJson = JsonValue;
export type PlanningDigestV1 = `sha256:${string}`;

export type PlanningDigestDomainV1 =
  | "mission-intent"
  | "mission-observation"
  | "proposal-identity"
  | "plan-fragment-proposal"
  | "plan-selection-policy"
  | "plan-fragment-decision"
  | "plan-fragment"
  | "plan-view"
  | "adaptive-role-binding"
  | "collective-planning-snapshot";

export interface PlanningLimitsV1 {
  readonly schemaVersion: 1;
  readonly maximumCandidateFragments: number;
  readonly maximumActiveFragments: number;
  readonly maximumFragmentsPerPeer: number;
  readonly maximumRevisionsPerSemanticSlot: number;
  readonly maximumDependencyDepth: number;
  readonly maximumDependencyFanout: number;
  readonly maximumCapabilityTerms: number;
  readonly maximumOutcomeTerms: number;
  readonly maximumProposalBytes: number;
  readonly maximumSnapshotBytes: number;
  readonly maximumTraceBytes: number;
  readonly maximumTotalPlanningBudgetUnits: number;
  readonly maximumFragmentBudgetUnits: number;
  readonly budgetShardPolicy: "equal_mandate_subjects";
  readonly maximumConcurrentProposals: number;
  readonly maximumActiveRoles: number;
  readonly proposalLogicalWindowMs: number;
  readonly observationLogicalWindowMs: number;
  readonly replanningLogicalWindowMs: number;
}

export interface MissionObjectiveBindingV1 {
  readonly schemaVersion: 1;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly acceptedPolicyDigest: PlanningDigestV1;
}

export interface MissionIntentV1 {
  readonly schemaVersion: 1;
  readonly missionIntentId: string;
  readonly revision: number;
  readonly predecessorDigest: PlanningDigestV1 | null;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly objective: MissionObjectiveBindingV1;
  readonly mandateDigest: PlanningDigestV1;
  readonly outcomeStatements: readonly string[];
  readonly permittedResourceClasses: readonly string[];
  readonly permittedCapabilityKeys: readonly string[];
  readonly planningLimits: PlanningLimitsV1;
  readonly selectionPolicyDigest: PlanningDigestV1;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly intentDigest: PlanningDigestV1;
}

export type MissionObservationVisibilityV1 =
  "public" | "capability" | "resource" | "outcome" | "failure";

export interface MissionObservationV1 {
  readonly schemaVersion: 1;
  readonly observationId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly observerPeerId: string;
  readonly observerInstanceId: string;
  readonly environmentCursor: string;
  readonly logicalTimeMs: number;
  readonly visibility: MissionObservationVisibilityV1;
  readonly observationKind: string;
  readonly publicValue: PlanningJson | null;
  readonly contentReferenceDigest: PlanningDigestV1 | null;
  readonly observationDigest: PlanningDigestV1;
}

export interface PlanFragmentProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly proposalRevision: number;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly proposerPeerId: string;
  readonly proposerInstanceId: string;
  readonly semanticSlotKey: string;
  readonly predecessorFragmentDigest: PlanningDigestV1 | null;
  readonly parentFragmentDigests: readonly PlanningDigestV1[];
  readonly dependencyFragmentDigests: readonly PlanningDigestV1[];
  readonly outcomeStatements: readonly string[];
  readonly roleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly inputReferenceDigest: PlanningDigestV1;
  readonly basisObservationDigests: readonly PlanningDigestV1[];
  readonly requestedBudgetUnits: number;
  readonly workDeadline: string;
  readonly proposedAtLogicalMs: number;
  readonly proposalDigest: PlanningDigestV1;
}

export type PlanScoringDimensionKeyV1 =
  | "outcome_coverage"
  | "budget_efficiency"
  | "deadline_margin"
  | "capability_confidence"
  | "dependency_readiness"
  | "bounded_risk";

export interface PlanScoringDimensionV1 {
  readonly schemaVersion: 1;
  readonly dimension: PlanScoringDimensionKeyV1;
  readonly weight: number;
  readonly direction: "maximize" | "minimize";
}

export type PlanTieBreakKeyV1 =
  | "score"
  | "requested_budget_units"
  | "work_deadline"
  | "proposed_at_logical_ms"
  | "proposal_digest";

export interface PlanSelectionPolicyV1 {
  readonly schemaVersion: 1;
  readonly selectionPolicyId: string;
  readonly revision: number;
  readonly scoringDimensions: readonly PlanScoringDimensionV1[];
  readonly hardConstraintKeys: readonly string[];
  readonly acceptanceScoreThreshold: number;
  readonly challengeScoreThreshold: number;
  readonly tieBreakOrder: readonly PlanTieBreakKeyV1[];
  readonly policyDigest: PlanningDigestV1;
}

export type PlanFragmentDecisionStatusV1 =
  "accepted" | "challenged" | "rejected";

export interface PlanFragmentDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly proposalId: string;
  readonly proposalDigest: PlanningDigestV1;
  readonly selectionPolicyDigest: PlanningDigestV1;
  readonly status: PlanFragmentDecisionStatusV1;
  readonly reasonCodes: readonly string[];
  readonly inputCandidateDigests: readonly PlanningDigestV1[];
  /** The accepted proposal digest that becomes this slot's next head. */
  readonly selectedSemanticSlotHeadDigest: PlanningDigestV1 | null;
  readonly localPlanViewRevision: number;
  readonly decidedAtLogicalMs: number;
  readonly resultingStateDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
}

export type PlanFragmentStatusV1 =
  | "candidate"
  | "active"
  | "offered"
  | "assigned"
  | "executing"
  | "superseded"
  | "cancelled"
  | "completed"
  | "failed";

export interface PlanFragmentV1 {
  readonly schemaVersion: 1;
  readonly fragmentId: string;
  readonly fragmentRevision: number;
  readonly previousStateDigest: PlanningDigestV1 | null;
  readonly proposalId: string;
  readonly proposalRevision: number;
  readonly proposalDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly proposerPeerId: string;
  readonly proposerInstanceId: string;
  readonly semanticSlotKey: string;
  readonly predecessorFragmentDigest: PlanningDigestV1 | null;
  readonly parentFragmentDigests: readonly PlanningDigestV1[];
  readonly dependencyFragmentDigests: readonly PlanningDigestV1[];
  readonly outcomeStatements: readonly string[];
  readonly roleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly inputReferenceDigest: PlanningDigestV1;
  readonly basisObservationDigests: readonly PlanningDigestV1[];
  readonly requestedBudgetUnits: number;
  readonly workDeadline: string;
  readonly proposedAtLogicalMs: number;
  readonly acceptancePolicyDigest: PlanningDigestV1;
  readonly acceptedAtLogicalMs: number;
  readonly localPlanViewRevision: number;
  readonly status: PlanFragmentStatusV1;
  readonly fragmentDigest: PlanningDigestV1;
}

export interface PlanSemanticSlotHeadV1 {
  readonly schemaVersion: 1;
  readonly semanticSlotKey: string;
  readonly fragmentDigest: PlanningDigestV1;
}

export interface PlanningBudgetShardV1 {
  readonly schemaVersion: 1;
  readonly peerId: string;
  readonly budgetUnits: number;
}

export interface PlanningBudgetReservationV1 {
  readonly schemaVersion: 1;
  readonly reservationId: string;
  readonly peerId: string;
  readonly proposalDigest: PlanningDigestV1;
  readonly fragmentDigest: PlanningDigestV1 | null;
  readonly units: number;
  readonly status: "reserved" | "committed" | "released";
}

export interface FragmentWorkMappingV1 {
  readonly schemaVersion: 1;
  readonly fragmentDigest: PlanningDigestV1;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
}

export type AdaptiveRoleStatusV1 = "current" | "terminal";

export interface AdaptiveRoleBindingV1 {
  readonly schemaVersion: 1;
  readonly roleBindingId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly planViewDigest: PlanningDigestV1;
  readonly fragmentDigest: PlanningDigestV1;
  readonly roleKey: string;
  readonly workContractId: string;
  readonly workContractDigest: PlanningDigestV1;
  readonly assignedPeerId: string;
  readonly assignedInstanceId: string;
  readonly assignmentAuthorityId: string;
  readonly assignmentEpoch: number;
  readonly authorityGeneration: number;
  readonly fencingToken: string;
  readonly leaseExpiresAtLogicalMs: number;
  readonly status: AdaptiveRoleStatusV1;
  readonly terminalReasonCode: string | null;
  readonly roleBindingDigest: PlanningDigestV1;
}

export interface PlanViewV1 {
  readonly schemaVersion: 1;
  readonly planViewId: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly selectionPolicyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly proposals: readonly PlanFragmentProposalV1[];
  readonly decisions: readonly PlanFragmentDecisionV1[];
  readonly fragments: readonly PlanFragmentV1[];
  readonly selectedHeads: readonly PlanSemanticSlotHeadV1[];
  readonly causalFrontierDigests: readonly PlanningDigestV1[];
  readonly unresolvedDependencyDigests: readonly PlanningDigestV1[];
  readonly budgetShards: readonly PlanningBudgetShardV1[];
  readonly budgetReservations: readonly PlanningBudgetReservationV1[];
  readonly workMappings: readonly FragmentWorkMappingV1[];
  readonly activeRoleBindings: readonly AdaptiveRoleBindingV1[];
  readonly logicalTimeHighWaterMs: number;
  readonly stateDigest: PlanningDigestV1;
}

export interface PlanningDomainHighWaterV1 {
  readonly schemaVersion: 1;
  readonly domain: "observation" | "proposal" | "decision" | "fragment";
  readonly recordId: string;
  readonly revision: number;
  readonly digest: PlanningDigestV1;
}

export interface CollectivePlanningSnapshotV1 {
  readonly format: "agentplat.collective-planning.snapshot";
  readonly formatVersion: 1;
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly missionIntent: MissionIntentV1;
  readonly selectionPolicy: PlanSelectionPolicyV1;
  readonly planView: PlanViewV1;
  readonly domainHighWaters: readonly PlanningDomainHighWaterV1[];
  readonly snapshotDigest: PlanningDigestV1;
}
