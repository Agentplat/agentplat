import type { WorkContractV1 } from "@agentplat/collective-control/mesh";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

export const TEAM_FORMATION_SCHEMA_VERSION_V1 = 1 as const;
export const TEAM_FORMATION_STATE_FORMAT_V1 =
  "application/vnd.agentplat.team-formation-state.v1+json" as const;
export const TEAM_FORMATION_HANDOFF_FORMAT_V1 =
  "application/vnd.agentplat.team-formation-handoff.v1+json" as const;

export type TeamFormationDecisionStatusV1 =
  "formed" | "insufficient_coverage" | "search_exhausted" | "policy_denied";

export type TeamLifecycleStatusV1 =
  "awaiting_member_contracts" | "active" | "completed" | "failed" | "cancelled";

export type TeamMemberOutcomeStatusV1 =
  "success" | "failure" | "unsafe" | "indeterminate";

export interface TeamFormationLimitsV1 {
  readonly maximumPositions: number;
  readonly maximumBidsPerPosition: number;
  readonly maximumMembers: number;
  readonly maximumSearchNodes: number;
  readonly maximumReasonCodesPerDecision: number;
  readonly maximumHistoryEntries: number;
  readonly maximumRequestTtlMs: number;
  readonly maximumTeamDurationMs: number;
  readonly maximumCommitAttempts: number;
}

/** Immutable local policy. Remote bids cannot widen these bounds. */
export interface TeamFormationPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly minimumDistinctPeers: number;
  readonly minimumIndependenceGroups: number;
  readonly maximumTotalBudgetUnits: number;
  readonly requireDistinctPeerPerPosition: boolean;
  readonly limits: TeamFormationLimitsV1;
}

export interface TeamFormationPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: TeamFormationPolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

export interface TeamFormationScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly rootWorkItemId: AgentPlatID;
  readonly rootWorkItemRevision: number;
  readonly scopeDigest: PlanningDigestV1;
}

/** One independently authorized position in a composed team. */
export interface TeamPositionV1 {
  readonly schemaVersion: 1;
  readonly positionId: AgentPlatID;
  readonly workItemId: AgentPlatID;
  readonly workItemRevision: number;
  readonly roleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly completionCriteria: readonly string[];
  readonly dependsOnPositionIds: readonly AgentPlatID[];
  readonly budgetUnits: number;
  readonly maximumActionBudgetUnits: number;
  readonly positionDigest: PlanningDigestV1;
}

/** Content-free candidate projected from an already-admitted local view. */
export interface TeamCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: AgentPlatID;
  readonly peerId: AgentPlatID;
  readonly instanceId: AgentPlatID;
  readonly independenceGroupId: AgentPlatID;
  readonly sourceCandidateDigest: PlanningDigestV1;
  readonly sourceRequestDigest: PlanningDigestV1;
  readonly sourceDecisionDigest: PlanningDigestV1;
  readonly eligibleWorkItemId: AgentPlatID;
  readonly eligibleWorkItemRevision: number;
  readonly requiredCapabilityKeys: readonly string[];
  readonly candidateDigest: PlanningDigestV1;
}

/** Local, evidence-bound evaluation of one candidate for one position. */
export interface TeamPositionBidV1 {
  readonly schemaVersion: 1;
  readonly bidId: AgentPlatID;
  readonly positionId: AgentPlatID;
  readonly candidate: TeamCandidateV1;
  readonly sourceBidDigest: PlanningDigestV1;
  readonly capacityReservationUnits: number;
  readonly budgetUnits: number;
  readonly expectedCompletionAtLogicalMs: number;
  readonly locallyEvaluatedScoreMicros: number;
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly bidDigest: PlanningDigestV1;
}

export interface TeamFormationRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly scope: TeamFormationScopeV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly positions: readonly TeamPositionV1[];
  readonly bids: readonly TeamPositionBidV1[];
  readonly logicalTimeMs: number;
  readonly validUntilLogicalMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface TeamMemberSelectionV1 {
  readonly schemaVersion: 1;
  readonly memberId: AgentPlatID;
  readonly positionId: AgentPlatID;
  readonly positionDigest: PlanningDigestV1;
  readonly candidateId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly peerId: AgentPlatID;
  readonly instanceId: AgentPlatID;
  readonly independenceGroupId: AgentPlatID;
  readonly bidId: AgentPlatID;
  readonly bidDigest: PlanningDigestV1;
  readonly sourceBidDigest: PlanningDigestV1;
  readonly budgetUnits: number;
  readonly expectedCompletionAtLogicalMs: number;
  readonly locallyEvaluatedScoreMicros: number;
  readonly selectionDigest: PlanningDigestV1;
}

/** A proposed roster. It is coordination data and grants no authority. */
export interface TeamProposalV1 {
  readonly schemaVersion: 1;
  readonly teamId: AgentPlatID;
  readonly teamEpoch: number;
  readonly scope: TeamFormationScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly formationRequestDigest: PlanningDigestV1;
  readonly predecessorJointWorkContractDigest: PlanningDigestV1 | null;
  readonly positions: readonly TeamPositionV1[];
  readonly members: readonly TeamMemberSelectionV1[];
  readonly totalBudgetUnits: number;
  readonly expectedCompletionAtLogicalMs: number;
  readonly proposedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly proposalDigest: PlanningDigestV1;
}

/** Exact per-member authority projected from a current WorkContract. */
export interface TeamMemberContractBindingV1 {
  readonly schemaVersion: 1;
  readonly memberId: AgentPlatID;
  readonly selectionDigest: PlanningDigestV1;
  readonly positionId: AgentPlatID;
  readonly peerId: AgentPlatID;
  readonly instanceId: AgentPlatID;
  readonly workItemId: AgentPlatID;
  readonly workItemRevision: number;
  readonly workContractId: AgentPlatID;
  readonly workContractGeneration: number;
  readonly workContractDigest: PlanningDigestV1;
  readonly assignmentAuthorityId: AgentPlatID;
  readonly assignmentEpoch: number;
  readonly authorityGeneration: number;
  readonly fencingToken: AgentPlatID;
  readonly leaseExpiresAtLogicalMs: number;
  readonly workDeadline: string;
  readonly roleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly reservedBudgetUnits: number;
  readonly maximumActionBudgetUnits: number;
  readonly bindingDigest: PlanningDigestV1;
}

/**
 * Composition of existing individual authorities. This contract cannot be
 * presented as authority for an action; the member WorkContract remains the
 * only execution boundary.
 */
export interface JointWorkContractV1 {
  readonly schemaVersion: 1;
  readonly jointWorkContractId: AgentPlatID;
  readonly teamId: AgentPlatID;
  readonly teamEpoch: number;
  readonly proposalDigest: PlanningDigestV1;
  readonly predecessorJointWorkContractDigest: PlanningDigestV1 | null;
  readonly scopeDigest: PlanningDigestV1;
  readonly memberContracts: readonly TeamMemberContractBindingV1[];
  readonly totalReservedBudgetUnits: number;
  readonly totalMaximumActionBudgetUnits: number;
  readonly activatedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly status: "active";
  readonly jointWorkContractDigest: PlanningDigestV1;
}

export interface TeamMemberOutcomeV1 {
  readonly schemaVersion: 1;
  readonly outcomeId: AgentPlatID;
  readonly teamId: AgentPlatID;
  readonly teamEpoch: number;
  readonly jointWorkContractDigest: PlanningDigestV1;
  readonly memberId: AgentPlatID;
  readonly memberBindingDigest: PlanningDigestV1;
  readonly status: TeamMemberOutcomeStatusV1;
  readonly sourceResultDigest: PlanningDigestV1;
  readonly observedAtLogicalMs: number;
  readonly outcomeDigest: PlanningDigestV1;
}

export interface TeamEpochHistoryEntryV1 {
  readonly schemaVersion: 1;
  readonly teamEpoch: number;
  readonly proposalDigest: PlanningDigestV1;
  readonly jointWorkContractDigest: PlanningDigestV1 | null;
  readonly status: TeamLifecycleStatusV1;
  readonly closedAtLogicalMs: number;
  readonly reasonCode: string;
}

export interface TeamRecordV1 {
  readonly schemaVersion: 1;
  readonly teamId: AgentPlatID;
  readonly teamEpoch: number;
  readonly status: TeamLifecycleStatusV1;
  readonly proposal: TeamProposalV1;
  readonly jointWorkContract: JointWorkContractV1 | null;
  readonly outcomes: readonly TeamMemberOutcomeV1[];
  readonly history: readonly TeamEpochHistoryEntryV1[];
  readonly updatedAtLogicalMs: number;
}

export interface TeamFormationDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly status: TeamFormationDecisionStatusV1;
  readonly proposal: TeamProposalV1 | null;
  readonly exploredSearchNodes: number;
  readonly reasonCodes: readonly string[];
  readonly evaluatedAtLogicalMs: number;
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly decisionDigest: PlanningDigestV1;
}

export interface TeamFormationStateV1 {
  readonly format: typeof TEAM_FORMATION_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly formationId: AgentPlatID;
  readonly formationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly team: TeamRecordV1 | null;
  readonly lastDecision: TeamFormationDecisionV1 | null;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface TeamFormationReductionInputV1 {
  readonly state: TeamFormationStateV1;
  readonly policy: TeamFormationPolicyRecordV1;
  readonly request: TeamFormationRequestV1;
}

export interface TeamFormationReductionResultV1 {
  readonly state: TeamFormationStateV1;
  readonly decision: TeamFormationDecisionV1;
}

export interface TeamReconfigurationRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly currentJointWorkContractDigest: PlanningDigestV1;
  readonly failedMemberId: AgentPlatID;
  readonly reasonCode: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly replacementBids: readonly TeamPositionBidV1[];
  readonly logicalTimeMs: number;
  readonly validUntilLogicalMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface TeamActivationRequestV1 {
  readonly proposalDigest: PlanningDigestV1;
  readonly workContracts: readonly WorkContractV1[];
  readonly logicalTimeMs: number;
}

export interface TeamFormationStoreV1 {
  load(stateKey: AgentPlatID): Promise<TeamFormationStateV1 | null>;
  save(input: {
    readonly state: TeamFormationStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

export interface TeamFormationRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly formationId: AgentPlatID;
  readonly formationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policy: TeamFormationPolicyRecordV1;
  readonly store: TeamFormationStoreV1;
}

export interface TeamFormationPortV1 {
  readonly formationId: AgentPlatID;
  readonly formationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  form(request: TeamFormationRequestV1): Promise<TeamFormationDecisionV1>;
  activate(request: TeamActivationRequestV1): Promise<JointWorkContractV1>;
  recordOutcome(outcome: TeamMemberOutcomeV1): Promise<TeamRecordV1>;
  reconfigure(
    request: TeamReconfigurationRequestV1,
  ): Promise<TeamFormationDecisionV1>;
  cancel(input: {
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<TeamRecordV1>;
  loadState(): Promise<TeamFormationStateV1>;
  exportHandoff(input: {
    readonly targetStateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }): Promise<TeamFormationHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: TeamFormationHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamFormationStateV1>;
}

export interface TeamFormationHandoffEnvelopeV1 {
  readonly format: typeof TEAM_FORMATION_HANDOFF_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly contentClass: "team_formation_state";
  readonly formationId: AgentPlatID;
  readonly formationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly sourceStateKey: AgentPlatID;
  readonly sourceStateDigest: PlanningDigestV1;
  readonly targetStateKey: AgentPlatID;
  readonly exportedAtLogicalMs: number;
  readonly sourceState: TeamFormationStateV1;
  readonly handoffDigest: PlanningDigestV1;
}
