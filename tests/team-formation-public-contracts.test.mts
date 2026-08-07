import {
  InMemoryTeamFormationStoreV1,
  TEAM_FORMATION_HANDOFF_FORMAT_V1,
  TEAM_FORMATION_SCHEMA_VERSION_V1,
  TEAM_FORMATION_STATE_FORMAT_V1,
  TeamFormationRuntimeV1,
  activateTeamProposalV1,
  cancelTeamV1,
  createJointWorkContractV1,
  createTeamCandidateFromCapabilityStateV1,
  createTeamCandidateV1,
  createTeamFormationHandoffV1,
  createTeamFormationPolicyV1,
  createTeamFormationRequestV1,
  createTeamFormationScopeV1,
  createTeamFormationStateV1,
  createTeamMemberContractBindingFromWorkContractV1,
  createTeamMemberContractBindingsV1,
  createTeamMemberContractBindingV1,
  createTeamMemberOutcomeV1,
  createTeamPositionBidFromMeshV1,
  createTeamPositionBidV1,
  createTeamPositionV1,
  createTeamPositionWorkProjectionsV1,
  createTeamProposalV1,
  createTeamReconfigurationRequestV1,
  recordTeamMemberOutcomeV1,
  reduceTeamFormationV1,
  reduceTeamReconfigurationV1,
  validateJointWorkContractV1,
  validateTeamCandidateV1,
  validateTeamFormationDecisionV1,
  validateTeamFormationHandoffV1,
  validateTeamFormationPolicyV1,
  validateTeamFormationRequestV1,
  validateTeamFormationScopeV1,
  validateTeamFormationStateV1,
  validateTeamMemberContractBindingV1,
  validateTeamMemberOutcomeV1,
  validateTeamPositionBidV1,
  validateTeamPositionV1,
  validateTeamProposalV1,
  validateTeamReconfigurationRequestV1,
  type JointWorkContractV1,
  type TeamFormationDecisionV1,
  type TeamFormationHandoffEnvelopeV1,
  type TeamFormationPolicyRecordV1,
  type TeamFormationPortV1,
  type TeamFormationRequestV1,
  type TeamFormationRuntimeOptionsV1,
  type TeamFormationStateV1,
  type TeamMemberOutcomeV1,
  type TeamPositionWorkProjectionV1,
  type TeamProposalV1,
} from "@agentplat/collective-runtime/team-formation";

void InMemoryTeamFormationStoreV1;
void TEAM_FORMATION_HANDOFF_FORMAT_V1;
void TEAM_FORMATION_SCHEMA_VERSION_V1;
void TEAM_FORMATION_STATE_FORMAT_V1;
void TeamFormationRuntimeV1;
void activateTeamProposalV1;
void cancelTeamV1;
void createJointWorkContractV1;
void createTeamCandidateFromCapabilityStateV1;
void createTeamCandidateV1;
void createTeamFormationHandoffV1;
void createTeamFormationPolicyV1;
void createTeamFormationRequestV1;
void createTeamFormationScopeV1;
void createTeamFormationStateV1;
void createTeamMemberContractBindingFromWorkContractV1;
void createTeamMemberContractBindingsV1;
void createTeamMemberContractBindingV1;
void createTeamMemberOutcomeV1;
void createTeamPositionBidFromMeshV1;
void createTeamPositionBidV1;
void createTeamPositionV1;
void createTeamPositionWorkProjectionsV1;
void createTeamProposalV1;
void createTeamReconfigurationRequestV1;
void recordTeamMemberOutcomeV1;
void reduceTeamFormationV1;
void reduceTeamReconfigurationV1;
void validateJointWorkContractV1;
void validateTeamCandidateV1;
void validateTeamFormationDecisionV1;
void validateTeamFormationHandoffV1;
void validateTeamFormationPolicyV1;
void validateTeamFormationRequestV1;
void validateTeamFormationScopeV1;
void validateTeamFormationStateV1;
void validateTeamMemberContractBindingV1;
void validateTeamMemberOutcomeV1;
void validateTeamPositionBidV1;
void validateTeamPositionV1;
void validateTeamProposalV1;
void validateTeamReconfigurationRequestV1;

declare const controller: TeamFormationPortV1;
declare const request: TeamFormationRequestV1;
declare const decision: TeamFormationDecisionV1;
declare const proposal: TeamProposalV1;
declare const contract: JointWorkContractV1;
declare const state: TeamFormationStateV1;
declare const outcome: TeamMemberOutcomeV1;
declare const handoff: TeamFormationHandoffEnvelopeV1;
declare const policy: TeamFormationPolicyRecordV1;
declare const options: TeamFormationRuntimeOptionsV1;

const formed: Promise<TeamFormationDecisionV1> = controller.form(request);
const activated: Promise<JointWorkContractV1> = controller.activate({
  proposalDigest: proposal.proposalDigest,
  workContracts: [],
  logicalTimeMs: 1,
});
const recorded = controller.recordOutcome(outcome);
const loaded: Promise<TeamFormationStateV1> = controller.loadState();
const projections: readonly TeamPositionWorkProjectionV1[] =
  createTeamPositionWorkProjectionsV1({ proposal });

void formed;
void activated;
void recorded;
void loaded;
void projections;
void decision;
void contract;
void state;
void handoff;
void policy;
void options;
