import {
  COLLECTIVE_PLANNING_SCHEMA_VERSION,
  CollectivePlanningValidationError,
  DEFAULT_PLANNING_JSON_LIMITS_V1,
  adaptiveRoleBindingDigestV1,
  assertMissionIntentRevisionV1,
  assertPlanningDigest,
  assertPlanningExactKeys,
  assertPlanningIdentifier,
  assertPlanningSafeInteger,
  assertPlanningTimestamp,
  assertPlanningToken,
  assertSnapshotHighWatersNotLoweredV1,
  canonicalizePlanningJsonV1,
  collectivePlanningSnapshotDigestV1,
  createAdaptiveRoleBindingV1,
  createCollectivePlanningSnapshotV1,
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanFragmentDecisionV1,
  createPlanFragmentProposalV1,
  createPlanFragmentV1,
  createPlanSelectionPolicyV1,
  createPlanViewV1,
  createPlanningLimitsV1,
  deepFreezePlanning,
  derivePlanFragmentIdV1,
  derivePlanFragmentProposalIdV1,
  digestPlanningJsonV1,
  missionIntentDigestV1,
  missionObservationDigestV1,
  planFragmentDecisionDigestV1,
  planFragmentDigestV1,
  planFragmentProposalDigestV1,
  planSelectionPolicyDigestV1,
  planViewDigestV1,
  createPlanningReducerStateV1,
  validatePlanningReducerStateV1,
  planningReducerStateDigestV1,
  createPlanningReducerCommandV1,
  validatePlanningReducerCommandV1,
  planningReducerCommandDigestV1,
  createPlanningReducerEventV1,
  validatePlanningReducerEventV1,
  planningReducerEventDigestV1,
  createPlanningReducerSnapshotV1,
  validatePlanningReducerSnapshotV1,
  planningReducerSnapshotDigestV1,
  reducePlanningCommandV1,
  restorePlanningReducerSnapshotV1,
  replayPlanningCommandsV1,
  planningUtf8ByteLengthV1,
  sha256HexPlanningV1,
  validateAdaptiveRoleBindingV1,
  validateCollectivePlanningSnapshotV1,
  validateMissionIntentV1,
  validateMissionObservationV1,
  validatePlanFragmentDecisionV1,
  validatePlanFragmentProposalV1,
  validatePlanFragmentV1,
  validatePlanSelectionPolicyV1,
  validatePlanViewV1,
  validatePlanningLimitsV1,
  type AdaptiveRoleBindingV1,
  type AdaptiveRoleStatusV1,
  type CollectivePlanningSnapshotV1,
  type FragmentWorkMappingV1,
  type MissionIntentV1,
  type MissionObjectiveBindingV1,
  type MissionObservationV1,
  type MissionObservationVisibilityV1,
  type PlanFragmentDecisionStatusV1,
  type PlanFragmentDecisionV1,
  type PlanFragmentProposalV1,
  type PlanFragmentStatusV1,
  type PlanFragmentV1,
  type PlanningBudgetReservationV1,
  type PlanningBudgetShardV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningDomainHighWaterV1,
  type PlanningJson,
  type PlanningJsonLimitsV1,
  type PlanningLimitsV1,
  type PlanScoringDimensionKeyV1,
  type PlanScoringDimensionV1,
  type PlanSelectionPolicyV1,
  type PlanSemanticSlotHeadV1,
  type PlanTieBreakKeyV1,
  type PlanViewV1,
  type PlanFragmentProposalIdentityV1,
  type PlanningAdmittedSubjectV1,
  type PlanningObservationCursorHighWaterV1,
  type PlanningReducerCommandHighWaterV1,
  type PlanningReducerStateV1,
  type CreatePlanningReducerStateInputV1,
  type PlanningReducerCommandV1,
  type RecordPlanningObservationCommandV1,
  type RecordPlanningProposalCommandV1,
  type EvaluatePlanningSlotCommandV1,
  type TransitionPlanningFragmentCommandV1,
  type AdvancePlanningLogicalTimeCommandV1,
  type Increment2FragmentTransitionStatusV1,
  type PlanningReducerEventKindV1,
  type PlanningReducerEventV1,
  type PlanningReducerErrorCodeV1,
  type PlanningReducerErrorV1,
  type PlanningReducerResultV1,
  type PlanningReducerSnapshotV1,
} from "@agentplat/collective-planning";

declare const intent: MissionIntentV1;
declare const observation: MissionObservationV1;
declare const policy: PlanSelectionPolicyV1;
declare const proposal: PlanFragmentProposalV1;
declare const decision: PlanFragmentDecisionV1;
declare const fragment: PlanFragmentV1;
declare const view: PlanViewV1;
declare const role: AdaptiveRoleBindingV1;
declare const snapshot: CollectivePlanningSnapshotV1;
declare const reducerState: PlanningReducerStateV1;
declare const reducerCommand: PlanningReducerCommandV1;
declare const reducerEvent: PlanningReducerEventV1;
declare const reducerResult: PlanningReducerResultV1;
declare const reducerSnapshot: PlanningReducerSnapshotV1;

const schemaVersion: typeof COLLECTIVE_PLANNING_SCHEMA_VERSION = 1;
const json: PlanningJson = { bounded: [true, null, 1, "portable"] };
const digest: PlanningDigestV1 = digestPlanningJsonV1("mission-intent", json);
const domain: PlanningDigestDomainV1 = "plan-fragment";
const visibility: MissionObservationVisibilityV1 = "resource";
const dimensionKey: PlanScoringDimensionKeyV1 = "bounded_risk";
const tieBreakKey: PlanTieBreakKeyV1 = "proposal_digest";
const decisionStatus: PlanFragmentDecisionStatusV1 = "challenged";
const fragmentStatus: PlanFragmentStatusV1 = "superseded";
const roleStatus: AdaptiveRoleStatusV1 = "terminal";
const transitionStatus: Increment2FragmentTransitionStatusV1 = "superseded";
const reducerEventKind: PlanningReducerEventKindV1 = "slot.evaluated";
const reducerErrorCode: PlanningReducerErrorCodeV1 = "budget_exceeded";

void (null as MissionObjectiveBindingV1 | null);
void (null as PlanningLimitsV1 | null);
void (null as PlanScoringDimensionV1 | null);
void (null as PlanSemanticSlotHeadV1 | null);
void (null as PlanningBudgetShardV1 | null);
void (null as PlanningBudgetReservationV1 | null);
void (null as FragmentWorkMappingV1 | null);
void (null as PlanningDomainHighWaterV1 | null);
void (null as PlanningJsonLimitsV1 | null);
void (null as PlanFragmentProposalIdentityV1 | null);
void (null as PlanningAdmittedSubjectV1 | null);
void (null as PlanningObservationCursorHighWaterV1 | null);
void (null as PlanningReducerCommandHighWaterV1 | null);
void (null as CreatePlanningReducerStateInputV1 | null);
void (null as RecordPlanningObservationCommandV1 | null);
void (null as RecordPlanningProposalCommandV1 | null);
void (null as EvaluatePlanningSlotCommandV1 | null);
void (null as TransitionPlanningFragmentCommandV1 | null);
void (null as AdvancePlanningLogicalTimeCommandV1 | null);
void (null as PlanningReducerErrorV1 | null);

void COLLECTIVE_PLANNING_SCHEMA_VERSION;
void CollectivePlanningValidationError;
void DEFAULT_PLANNING_JSON_LIMITS_V1;
void adaptiveRoleBindingDigestV1;
void assertMissionIntentRevisionV1;
void assertPlanningDigest;
void assertPlanningExactKeys;
void assertPlanningIdentifier;
void assertPlanningSafeInteger;
void assertPlanningTimestamp;
void assertPlanningToken;
void assertSnapshotHighWatersNotLoweredV1;
void canonicalizePlanningJsonV1;
void collectivePlanningSnapshotDigestV1;
void sha256HexPlanningV1;
void planningUtf8ByteLengthV1;
void deepFreezePlanning;
void digestPlanningJsonV1;
void missionIntentDigestV1;
void missionObservationDigestV1;
void planFragmentProposalDigestV1;
void planSelectionPolicyDigestV1;
void planFragmentDecisionDigestV1;
void derivePlanFragmentIdV1;
void planFragmentDigestV1;
void planViewDigestV1;
void derivePlanFragmentProposalIdV1;
void createMissionIntentV1;
void validateMissionIntentV1;
void createPlanningLimitsV1;
void validatePlanningLimitsV1;
void createMissionObservationV1;
void validateMissionObservationV1;
void createPlanSelectionPolicyV1;
void validatePlanSelectionPolicyV1;
void createPlanFragmentProposalV1;
void validatePlanFragmentProposalV1;
void createPlanFragmentDecisionV1;
void validatePlanFragmentDecisionV1;
void createPlanFragmentV1;
void validatePlanFragmentV1;
void createPlanViewV1;
void validatePlanViewV1;
void createAdaptiveRoleBindingV1;
void validateAdaptiveRoleBindingV1;
void createCollectivePlanningSnapshotV1;
void validateCollectivePlanningSnapshotV1;
void createPlanningReducerStateV1;
void validatePlanningReducerStateV1;
void planningReducerStateDigestV1;
void createPlanningReducerCommandV1;
void validatePlanningReducerCommandV1;
void planningReducerCommandDigestV1;
void createPlanningReducerEventV1;
void validatePlanningReducerEventV1;
void planningReducerEventDigestV1;
void createPlanningReducerSnapshotV1;
void validatePlanningReducerSnapshotV1;
void planningReducerSnapshotDigestV1;
void reducePlanningCommandV1;
void restorePlanningReducerSnapshotV1;
void replayPlanningCommandsV1;
void schemaVersion;
void json;
void digest;
void domain;
void visibility;
void dimensionKey;
void tieBreakKey;
void decisionStatus;
void fragmentStatus;
void roleStatus;
void intent;
void observation;
void policy;
void proposal;
void decision;
void fragment;
void view;
void role;
void snapshot;
void reducerState;
void reducerCommand;
void reducerEvent;
void reducerResult;
void reducerSnapshot;
void transitionStatus;
void reducerEventKind;
void reducerErrorCode;

// @ts-expect-error schema versions are closed and cannot be widened.
const invalidSchemaVersion: typeof COLLECTIVE_PLANNING_SCHEMA_VERSION = 2;
// @ts-expect-error proposal arrays are immutable through the public type.
proposal.requiredCapabilityKeys.push("capability:unreviewed");
// @ts-expect-error planning proposals cannot select an assignee.
proposal.assignedPeerId;
// @ts-expect-error planning proposals cannot mint an assignment epoch.
proposal.assignmentEpoch;
// @ts-expect-error planning proposals cannot carry an authority generation.
proposal.authorityGeneration;
// @ts-expect-error planning proposals cannot carry a fencing token.
proposal.fencingToken;
// @ts-expect-error planning proposals cannot issue an action grant.
proposal.actionGrantId;
// @ts-expect-error planning proposals cannot issue a governed permit.
proposal.permitId;
// @ts-expect-error planning proposals cannot select an execution handler.
proposal.handlerDigest;
// @ts-expect-error mission intent cannot contain a precomputed task graph.
intent.taskGraph;
// @ts-expect-error mission intent cannot preselect an assignee.
intent.assignedPeerId;
// @ts-expect-error mission intent cannot expose a hidden terminal predicate.
intent.terminalPredicate;
// @ts-expect-error peer observations cannot expose global membership.
observation.globalMembership;
// @ts-expect-error peer observations cannot expose hidden world state.
observation.hiddenState;
// @ts-expect-error planning decisions cannot select an execution assignee.
decision.assignedPeerId;
// @ts-expect-error planning decisions cannot issue an action grant.
decision.actionGrantId;
// @ts-expect-error accepted fragments remain neutral to assignment authority.
fragment.assignmentAuthorityId;
// @ts-expect-error fragment state history is immutable through the public type.
fragment.previousStateDigest = null;
// @ts-expect-error accepted fragments cannot carry fencing tokens.
fragment.fencingToken;
// @ts-expect-error a role binding exposes evidence, never a grant.
role.actionGrantId;
// @ts-expect-error a role binding exposes evidence, never a permit.
role.permitId;
// @ts-expect-error a plan view is immutable through its public type.
view.fragments.push(fragment);
// @ts-expect-error a plan view cannot issue a governed permit.
view.permitId;
// @ts-expect-error a snapshot cannot mint execution authority.
snapshot.actionGrantId;
// @ts-expect-error reducer state is immutable through its public type.
reducerState.observations.push(observation);
// @ts-expect-error reducer commands do not grant assignment authority.
reducerCommand.assignmentAuthorityId;
// @ts-expect-error reducer state cannot carry a governed permit.
reducerState.permitId;
// @ts-expect-error reducer events never mint an action grant.
reducerEvent.actionGrantId;

void invalidSchemaVersion;
