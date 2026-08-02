import {
  COLLECTIVE_PLANNING_SCHEMA_VERSION,
  canonicalizePlanningJsonV1,
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanFragmentProposalV1,
  createPlanningReducerStateV1,
  createPlanningReducerCommandV1,
  createPlanningReducerSnapshotV1,
  digestPlanningJsonV1,
  planningReducerCommandDigestV1,
  createPlanningReducerEventV1,
  planningReducerEventDigestV1,
  planningReducerSnapshotDigestV1,
  planningReducerStateDigestV1,
  reducePlanningCommandV1,
  replayPlanningCommandsV1,
  restorePlanningReducerSnapshotV1,
  validateCollectivePlanningSnapshotV1,
  validateMissionIntentV1,
  validatePlanFragmentProposalV1,
  validatePlanningReducerCommandV1,
  validatePlanningReducerEventV1,
  validatePlanningReducerSnapshotV1,
  validatePlanningReducerStateV1,
  type AdaptiveRoleBindingV1,
  type CollectivePlanningSnapshotV1,
  type MissionIntentV1,
  type MissionObservationV1,
  type PlanFragmentDecisionV1,
  type PlanFragmentProposalV1,
  type PlanFragmentV1,
  type PlanningDigestV1,
  type PlanningLimitsV1,
  type PlanSelectionPolicyV1,
  type PlanViewV1,
  type PlanningAdmittedSubjectV1,
  type PlanningObservationCursorHighWaterV1,
  type PlanningReducerCommandHighWaterV1,
  type PlanningReducerCommandV1,
  type PlanningReducerErrorCodeV1,
  type PlanningReducerErrorV1,
  type PlanningReducerEventKindV1,
  type PlanningReducerEventV1,
  type PlanningReducerResultV1,
  type PlanningReducerSnapshotV1,
  type PlanningReducerStateV1,
  type CreatePlanningReducerStateInputV1,
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
declare const limits: PlanningLimitsV1;
declare const reducerState: PlanningReducerStateV1;
declare const reducerCommand: PlanningReducerCommandV1;
declare const reducerEvent: PlanningReducerEventV1;
declare const reducerResult: PlanningReducerResultV1;
declare const reducerSnapshot: PlanningReducerSnapshotV1;

const schemaVersion: typeof COLLECTIVE_PLANNING_SCHEMA_VERSION = 1;
const digest: PlanningDigestV1 = digestPlanningJsonV1("plan-view", {
  schemaVersion,
});

void canonicalizePlanningJsonV1;
void createMissionIntentV1;
void validateMissionIntentV1;
void createMissionObservationV1;
void createPlanFragmentProposalV1;
void createPlanningReducerStateV1;
void createPlanningReducerCommandV1;
void createPlanningReducerSnapshotV1;
void validatePlanFragmentProposalV1;
void validatePlanningReducerStateV1;
void validatePlanningReducerCommandV1;
void validatePlanningReducerEventV1;
void validatePlanningReducerSnapshotV1;
void planningReducerStateDigestV1;
void planningReducerCommandDigestV1;
void createPlanningReducerEventV1;
void planningReducerEventDigestV1;
void planningReducerSnapshotDigestV1;
void reducePlanningCommandV1;
void restorePlanningReducerSnapshotV1;
void replayPlanningCommandsV1;
void validateCollectivePlanningSnapshotV1;
void schemaVersion;
void digest;
void intent;
void observation;
void policy;
void proposal;
void decision;
void fragment;
void view;
void role;
void snapshot;
void limits;
void reducerState;
void reducerCommand;
void reducerEvent;
void reducerResult;
void reducerSnapshot;
void (null as PlanningAdmittedSubjectV1 | null);
void (null as PlanningObservationCursorHighWaterV1 | null);
void (null as PlanningReducerCommandHighWaterV1 | null);
void (null as CreatePlanningReducerStateInputV1 | null);
void (null as PlanningReducerEventKindV1 | null);
void (null as PlanningReducerErrorCodeV1 | null);
void (null as PlanningReducerErrorV1 | null);

// @ts-expect-error planning proposals cannot mint execution authority.
proposal.assignmentAuthorityId;
// @ts-expect-error planning proposals cannot select an assignee.
proposal.assigneePeerId;
// @ts-expect-error public planning arrays are immutable.
view.fragments.push(fragment);
// @ts-expect-error reducer commands are data, not assignment authority.
reducerCommand.assignmentAuthorityId;
// @ts-expect-error reducer state is immutable through the public type.
reducerState.observations.push(observation);
