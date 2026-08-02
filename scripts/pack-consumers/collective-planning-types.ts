import {
  COLLECTIVE_PLANNING_SCHEMA_VERSION,
  canonicalizePlanningJsonV1,
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanFragmentProposalV1,
  digestPlanningJsonV1,
  validateCollectivePlanningSnapshotV1,
  validateMissionIntentV1,
  validatePlanFragmentProposalV1,
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
} from '@agentplat/collective-planning';

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

const schemaVersion: typeof COLLECTIVE_PLANNING_SCHEMA_VERSION = 1;
const digest: PlanningDigestV1 = digestPlanningJsonV1('plan-view', {
  schemaVersion,
});

void canonicalizePlanningJsonV1;
void createMissionIntentV1;
void validateMissionIntentV1;
void createMissionObservationV1;
void createPlanFragmentProposalV1;
void validatePlanFragmentProposalV1;
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

// @ts-expect-error planning proposals cannot mint execution authority.
proposal.assignmentAuthorityId;
// @ts-expect-error planning proposals cannot select an assignee.
proposal.assigneePeerId;
// @ts-expect-error public planning arrays are immutable.
view.fragments.push(fragment);
