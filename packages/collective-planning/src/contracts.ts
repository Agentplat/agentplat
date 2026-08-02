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
  | "collective-planning-snapshot"
  | "planning-reducer-command-identity"
  | "planning-reducer-command"
  | "planning-reducer-transition"
  | "planning-reducer-state"
  | "planning-reducer-event"
  | "planning-reducer-snapshot"
  | "evaluation-registration-binding"
  | "collective-trace-event-v2"
  | "collective-trace-chain-v2"
  | "collective-trace-v2"
  | "interaction-ledger-v2"
  | "environment-initialization-v1"
  | "environment-initialization-receipt-v1"
  | "environment-observation-request-v1"
  | "environment-observation-receipt-v1"
  | "protected-effect-attempt-v1"
  | "protected-effect-receipt-v1"
  | "environment-advance-v1"
  | "environment-advance-receipt-v1"
  | "environment-state-v1"
  | "environment-snapshot-handle-v1"
  | "environment-restore-receipt-v1"
  | "invariant-monitor-policy-v1"
  | "invariant-monitor-event-v1"
  | "invariant-monitor-verdict-v1"
  | "invariant-monitor-snapshot-v1"
  | "evaluation-public-artifact-v1"
  | "evaluation-boundary-evidence-v1";

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
  readonly peerInstanceId: string;
  readonly budgetUnits: number;
}

export interface PlanningBudgetReservationV1 {
  readonly schemaVersion: 1;
  readonly reservationId: string;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly proposalDigest: PlanningDigestV1;
  readonly fragmentDigest: PlanningDigestV1 | null;
  readonly units: number;
  readonly status: "reserved" | "committed" | "released";
}

export interface PlanningAdmittedSubjectV1 {
  readonly schemaVersion: 1;
  readonly peerId: string;
  readonly peerInstanceId: string;
}

export interface PlanningObservationCursorHighWaterV1 {
  readonly schemaVersion: 1;
  readonly observerPeerId: string;
  readonly observerInstanceId: string;
  readonly environmentCursor: string;
  readonly observationId: string;
  readonly observationDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}

export interface PlanningReducerCommandHighWaterV1 {
  readonly schemaVersion: 1;
  readonly commandId: string;
  readonly commandDigest: PlanningDigestV1;
  readonly command: PlanningReducerCommandV1;
  /**
   * Reducer logical time at the first successful application. Increment 3
   * lifecycle records require this witness so restored state can re-check the
   * same bounded-time preconditions that guarded the live transition.
   */
  readonly appliedAtLogicalMs?: number;
}

export interface PlanningReducerStateV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly missionIntent: MissionIntentV1;
  readonly selectionPolicy: PlanSelectionPolicyV1;
  readonly admittedSubjects: readonly PlanningAdmittedSubjectV1[];
  readonly observations: readonly MissionObservationV1[];
  readonly planView: PlanViewV1;
  readonly recordHighWaters: readonly PlanningDomainHighWaterV1[];
  readonly observationCursorHighWaters: readonly PlanningObservationCursorHighWaterV1[];
  readonly commandHighWaters: readonly PlanningReducerCommandHighWaterV1[];
  readonly stateDigest: PlanningDigestV1;
}

interface PlanningReducerCommandBaseV1 {
  readonly schemaVersion: 1;
  readonly commandId: string;
  readonly expectedStateDigest: PlanningDigestV1 | null;
  readonly commandDigest: PlanningDigestV1;
}

export interface RecordPlanningObservationCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "observation.record";
  readonly observation: MissionObservationV1;
}

export interface RecordPlanningProposalCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "proposal.record";
  readonly proposal: PlanFragmentProposalV1;
}

export interface EvaluatePlanningSlotCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "slot.evaluate";
  readonly semanticSlotKey: string;
  readonly candidateProposalDigests: readonly PlanningDigestV1[];
  readonly decidedAtLogicalMs: number;
}

export type Increment2FragmentTransitionStatusV1 =
  "superseded" | "cancelled" | "failed";

export interface TransitionPlanningFragmentCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "fragment.transition";
  readonly fragmentId: string;
  readonly previousFragmentDigest: PlanningDigestV1;
  readonly status: Increment2FragmentTransitionStatusV1;
  readonly transitionedAtLogicalMs: number;
}

/** Portable Work identity supplied by an adapter before the resulting fragment digest exists. */
export interface PlanningWorkTargetV1 {
  readonly schemaVersion: 1;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
}

export interface ProjectPlanningFragmentToWorkCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "fragment.project-to-work";
  readonly fragmentId: string;
  readonly previousFragmentDigest: PlanningDigestV1;
  readonly workTarget: PlanningWorkTargetV1;
  readonly transitionedAtLogicalMs: number;
}

export interface ObservePlanningFragmentAssignmentCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "fragment.assignment.observe";
  readonly fragmentId: string;
  readonly previousFragmentDigest: PlanningDigestV1;
  readonly expectedWorkMapping: FragmentWorkMappingV1;
  readonly roleBinding: AdaptiveRoleBindingV1;
}

export interface ObservePlanningFragmentExecutionCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "fragment.execution.observe";
  readonly fragmentId: string;
  readonly previousFragmentDigest: PlanningDigestV1;
  readonly previousRoleBindingDigest: PlanningDigestV1;
  readonly roleBinding: AdaptiveRoleBindingV1;
}

export type ObservedTerminalFragmentStatusV1 =
  "superseded" | "cancelled" | "completed" | "failed";

export interface ObservePlanningFragmentTerminalCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "fragment.terminal.observe";
  readonly fragmentId: string;
  readonly previousFragmentDigest: PlanningDigestV1;
  readonly status: ObservedTerminalFragmentStatusV1;
  readonly expectedWorkMapping: FragmentWorkMappingV1;
  readonly expectedRoleBindingDigest: PlanningDigestV1 | null;
  readonly transitionedAtLogicalMs: number;
}

export interface ObservePlanningWorkRevisionCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "work.revision.observe";
  readonly fragmentId: string;
  readonly previousFragmentDigest: PlanningDigestV1;
  readonly expectedWorkMapping: FragmentWorkMappingV1;
  readonly workTarget: PlanningWorkTargetV1;
  /** Work is revised only while unassigned; a new assignment must derive fresh authority. */
  readonly roleBinding: null;
}

export interface AdvancePlanningLogicalTimeCommandV1 extends PlanningReducerCommandBaseV1 {
  readonly kind: "logical-time.advance";
  readonly logicalTimeMs: number;
}

export type PlanningReducerCommandV1 =
  | RecordPlanningObservationCommandV1
  | RecordPlanningProposalCommandV1
  | EvaluatePlanningSlotCommandV1
  | TransitionPlanningFragmentCommandV1
  | ProjectPlanningFragmentToWorkCommandV1
  | ObservePlanningFragmentAssignmentCommandV1
  | ObservePlanningFragmentExecutionCommandV1
  | ObservePlanningFragmentTerminalCommandV1
  | ObservePlanningWorkRevisionCommandV1
  | AdvancePlanningLogicalTimeCommandV1;

export type PlanningReducerEventKindV1 =
  | "observation.recorded"
  | "proposal.recorded"
  | "slot.evaluated"
  | "fragment.created"
  | "fragment.transitioned"
  | "fragment.projected-to-work"
  | "fragment.assignment-observed"
  | "fragment.execution-observed"
  | "fragment.terminal-observed"
  | "work.revision-observed"
  | "logical-time.advanced";

export interface PlanningReducerEventV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly kind: PlanningReducerEventKindV1;
  readonly commandId: string;
  readonly commandDigest: PlanningDigestV1;
  readonly previousStateDigest: PlanningDigestV1;
  readonly resultingStateDigest: PlanningDigestV1;
  readonly subjectId: string;
  readonly subjectDigest: PlanningDigestV1;
  readonly eventDigest: PlanningDigestV1;
}

export type PlanningReducerErrorCodeV1 =
  | "invalid_command"
  | "stale_state_digest"
  | "logical_identity_conflict"
  | "scope_mismatch"
  | "subject_not_admitted"
  | "logical_time_regression"
  | "logical_window_exceeded"
  | "record_high_water_conflict"
  | "cursor_high_water_conflict"
  | "basis_observation_missing"
  | "planning_limit_exceeded"
  | "budget_exceeded"
  | "graph_invalid"
  | "candidate_set_incomplete"
  | "fragment_transition_invalid"
  | "work_mapping_conflict"
  | "work_revision_invalid"
  | "role_binding_conflict"
  | "role_binding_invalid"
  | "increment_not_supported";

export interface PlanningReducerErrorV1 {
  readonly schemaVersion: 1;
  readonly code: PlanningReducerErrorCodeV1;
  readonly message: string;
}

export type PlanningReducerResultV1 =
  | {
      readonly status: "applied";
      readonly state: PlanningReducerStateV1;
      readonly events: readonly PlanningReducerEventV1[];
      readonly error: null;
    }
  | {
      readonly status: "idempotent";
      readonly state: PlanningReducerStateV1;
      readonly events: readonly [];
      readonly error: null;
    }
  | {
      readonly status: "rejected" | "conflict";
      readonly state: PlanningReducerStateV1;
      readonly events: readonly [];
      readonly error: PlanningReducerErrorV1;
    };

export interface PlanningReducerSnapshotV1 {
  readonly format: "agentplat.collective-planning.reducer-snapshot";
  readonly formatVersion: 1;
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly state: PlanningReducerStateV1;
  readonly snapshotDigest: PlanningDigestV1;
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
