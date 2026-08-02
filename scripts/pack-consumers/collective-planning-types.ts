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
  type PlanningWorkTargetV1,
  type ProjectPlanningFragmentToWorkCommandV1,
  type ObservePlanningFragmentAssignmentCommandV1,
  type ObservePlanningFragmentExecutionCommandV1,
  type ObservedTerminalFragmentStatusV1,
  type ObservePlanningFragmentTerminalCommandV1,
  type ObservePlanningWorkRevisionCommandV1,
} from "@agentplat/collective-planning";

import {
  PLANNING_FRAGMENT_REFERENCE_PREFIX_V1,
  PLANNING_MESH_CAPABILITY_PROFILE_V1,
  PLANNING_WORK_EXTENSION_KEY_V1,
  InMemoryPlanningFragmentRepositoryV1,
  createPlanningAdaptiveRoleV1,
  createPlanningLocalWorkProjectionV1,
  createPlanningMeshInboundProcessorV1,
  createPlanningSupersessionCommandV1,
  createPlanningWorkCancelCommandV1,
  createPlanningWorkReviseCommandV1,
  createReducerPlanningMeshAdmissionPortV1,
  planningFragmentContentReferenceV1,
  planningWorkItemIdV1,
  selectPlanningOfferRecipientsV1,
  validatePlanningFragmentRepositoryRecordV1,
  validatePlanningLocalWorkProjectionV1,
  validatePlanningWorkExtensionV1,
  validatePlanningWorkProjectionV1,
  type InMemoryPlanningFragmentRepositoryOptionsV1,
  type PlanningAdaptiveRoleInputV1,
  type PlanningAdaptiveRoleResultV1,
  type PlanningFragmentRepositoryV1,
  type PlanningFragmentRepositoryRecordV1,
  type PlanningLocalWorkProjectionV1,
  type PlanningMeshAdmissionDecisionV1,
  type PlanningMeshAdmissionInputV1,
  type PlanningMeshAdmissionPortV1,
  type PlanningMeshInboundDecisionV1,
  type PlanningMeshInboundProcessorOptionsV1,
  type PlanningMeshInboundProcessorV1,
  type PlanningMeshInboundRejectionCodeV1,
  type PlanningMeshInboundRuntimeStateV1,
  type PlanningMeshWorkLifecycleCommandV1,
  type PlanningRecipientSelectionInputV1,
  type PlanningRecipientV1,
  type PlanningWorkExtensionV1,
  type PlanningWorkProjectionValidationInputV1,
} from "@agentplat/collective-planning/mesh";

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
void (null as PlanningWorkTargetV1 | null);
void (null as ProjectPlanningFragmentToWorkCommandV1 | null);
void (null as ObservePlanningFragmentAssignmentCommandV1 | null);
void (null as ObservePlanningFragmentExecutionCommandV1 | null);
void (null as ObservedTerminalFragmentStatusV1 | null);
void (null as ObservePlanningFragmentTerminalCommandV1 | null);
void (null as ObservePlanningWorkRevisionCommandV1 | null);
void (null as PlanningFragmentRepositoryRecordV1 | null);
void (null as PlanningFragmentRepositoryV1 | null);
void (null as InMemoryPlanningFragmentRepositoryOptionsV1 | null);
void (null as PlanningLocalWorkProjectionV1 | null);
void (null as PlanningRecipientSelectionInputV1 | null);
void (null as PlanningRecipientV1 | null);
void (null as PlanningMeshAdmissionInputV1 | null);
void (null as PlanningMeshAdmissionDecisionV1 | null);
void (null as PlanningMeshAdmissionPortV1 | null);
void (null as PlanningMeshInboundRuntimeStateV1 | null);
void (null as PlanningMeshInboundRejectionCodeV1 | null);
void (null as PlanningMeshInboundDecisionV1 | null);
void (null as PlanningMeshInboundProcessorV1 | null);
void (null as PlanningMeshInboundProcessorOptionsV1 | null);
void (null as PlanningAdaptiveRoleInputV1 | null);
void (null as PlanningAdaptiveRoleResultV1 | null);
void (null as PlanningMeshWorkLifecycleCommandV1 | null);
void (null as PlanningWorkExtensionV1 | null);
void (null as PlanningWorkProjectionValidationInputV1 | null);
void PLANNING_FRAGMENT_REFERENCE_PREFIX_V1;
void PLANNING_MESH_CAPABILITY_PROFILE_V1;
void PLANNING_WORK_EXTENSION_KEY_V1;
void InMemoryPlanningFragmentRepositoryV1;
void createPlanningAdaptiveRoleV1;
void createPlanningLocalWorkProjectionV1;
void createPlanningMeshInboundProcessorV1;
void createPlanningSupersessionCommandV1;
void createPlanningWorkCancelCommandV1;
void createPlanningWorkReviseCommandV1;
void createReducerPlanningMeshAdmissionPortV1;
void planningFragmentContentReferenceV1;
void planningWorkItemIdV1;
void selectPlanningOfferRecipientsV1;
void validatePlanningFragmentRepositoryRecordV1;
void validatePlanningLocalWorkProjectionV1;
void validatePlanningWorkExtensionV1;
void validatePlanningWorkProjectionV1;

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
