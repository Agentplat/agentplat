import {
  InMemoryTeamExecutionArtifactPortV1,
  InMemoryTeamExecutionStoreV1,
  TEAM_EXECUTION_HANDOFF_FORMAT_V1,
  TEAM_EXECUTION_SCHEMA_VERSION_V1,
  TEAM_EXECUTION_STATE_FORMAT_V1,
  TeamExecutionRuntimeV1,
  cancelTeamExecutionV1,
  createPortableAgentTeamMemberExecutionPortV1,
  createTeamExecutionArtifactV1,
  createTeamExecutionControlEvidenceV1,
  createTeamExecutionEpochHistoryEntryV1,
  createTeamExecutionHandoffV1,
  createTeamExecutionMetricsV1,
  createTeamExecutionPolicyV1,
  createTeamExecutionPositionStateV1,
  createTeamExecutionRebindRequestFromStateV1,
  createTeamExecutionRebindRequestV1,
  createTeamExecutionRecordV1,
  createTeamExecutionRecoverySignalV1,
  createTeamExecutionScopeV1,
  createTeamExecutionStartRequestV1,
  createTeamExecutionStateV1,
  createTeamExecutionStepCommandV1,
  createTeamExecutionStepDispatchV1,
  createTeamExecutionStepRecordV1,
  createTeamExecutionStepResultV1,
  createTeamMemberOutcomeFromExecutionRecoveryV1,
  createTeamReconfigurationRequestFromExecutionV1,
  deriveTeamExecutionIdV1,
  expireTeamExecutionStepV1,
  prepareTeamExecutionStepV1,
  rebindTeamExecutionV1,
  settleTeamExecutionStepV1,
  startTeamExecutionV1,
  validateTeamExecutionArtifactDraftV1,
  validateTeamExecutionArtifactV1,
  validateTeamExecutionControlEvidenceV1,
  validateTeamExecutionEpochHistoryEntryV1,
  validateTeamExecutionHandoffV1,
  validateTeamExecutionMetricsV1,
  validateTeamExecutionPolicyV1,
  validateTeamExecutionPositionStateV1,
  validateTeamExecutionRebindRequestV1,
  validateTeamExecutionRecordV1,
  validateTeamExecutionRecoverySignalV1,
  validateTeamExecutionScopeV1,
  validateTeamExecutionStartRequestV1,
  validateTeamExecutionStateV1,
  validateTeamExecutionStepCommandV1,
  validateTeamExecutionStepDispatchV1,
  validateTeamExecutionStepRecordV1,
  validateTeamExecutionStepResultV1,
  type PortableAgentTeamMemberBindingV1,
  type PortableAgentTeamMemberExecutionOptionsV1,
  type TeamExecutionArtifactDraftV1,
  type TeamExecutionArtifactPortV1,
  type TeamExecutionArtifactV1,
  type TeamExecutionControlDispositionV1,
  type TeamExecutionControlEvidenceV1,
  type TeamExecutionEpochHistoryEntryV1,
  type TeamExecutionHandoffEnvelopeV1,
  type TeamExecutionLimitsV1,
  type TeamExecutionMetricsV1,
  type TeamExecutionPolicyRecordV1,
  type TeamExecutionPolicyV1,
  type TeamExecutionPortV1,
  type TeamExecutionPositionStateV1,
  type TeamExecutionPositionStatusV1,
  type TeamExecutionRebindRequestV1,
  type TeamExecutionRecordV1,
  type TeamExecutionReconfigurationInputV1,
  type TeamExecutionRecoverySignalV1,
  type TeamExecutionRuntimeOptionsV1,
  type TeamExecutionScopeV1,
  type TeamExecutionStartRequestV1,
  type TeamExecutionStateV1,
  type TeamExecutionStatusV1,
  type TeamExecutionStepCommandV1,
  type TeamExecutionStepDispatchV1,
  type TeamExecutionStepRecordV1,
  type TeamExecutionStepResultV1,
  type TeamExecutionStepStatusV1,
  type TeamExecutionStoreV1,
  type TeamMemberExecutionPortV1,
} from "@agentplat/collective-runtime/team-execution";

void InMemoryTeamExecutionArtifactPortV1;
void InMemoryTeamExecutionStoreV1;
void TEAM_EXECUTION_HANDOFF_FORMAT_V1;
void TEAM_EXECUTION_SCHEMA_VERSION_V1;
void TEAM_EXECUTION_STATE_FORMAT_V1;
void TeamExecutionRuntimeV1;
void cancelTeamExecutionV1;
void createPortableAgentTeamMemberExecutionPortV1;
void createTeamExecutionArtifactV1;
void createTeamExecutionControlEvidenceV1;
void createTeamExecutionEpochHistoryEntryV1;
void createTeamExecutionHandoffV1;
void createTeamExecutionMetricsV1;
void createTeamExecutionPolicyV1;
void createTeamExecutionPositionStateV1;
void createTeamExecutionRebindRequestFromStateV1;
void createTeamExecutionRebindRequestV1;
void createTeamExecutionRecordV1;
void createTeamExecutionRecoverySignalV1;
void createTeamExecutionScopeV1;
void createTeamExecutionStartRequestV1;
void createTeamExecutionStateV1;
void createTeamExecutionStepCommandV1;
void createTeamExecutionStepDispatchV1;
void createTeamExecutionStepRecordV1;
void createTeamExecutionStepResultV1;
void createTeamMemberOutcomeFromExecutionRecoveryV1;
void createTeamReconfigurationRequestFromExecutionV1;
void deriveTeamExecutionIdV1;
void expireTeamExecutionStepV1;
void prepareTeamExecutionStepV1;
void rebindTeamExecutionV1;
void settleTeamExecutionStepV1;
void startTeamExecutionV1;
void validateTeamExecutionArtifactDraftV1;
void validateTeamExecutionArtifactV1;
void validateTeamExecutionControlEvidenceV1;
void validateTeamExecutionEpochHistoryEntryV1;
void validateTeamExecutionHandoffV1;
void validateTeamExecutionMetricsV1;
void validateTeamExecutionPolicyV1;
void validateTeamExecutionPositionStateV1;
void validateTeamExecutionRebindRequestV1;
void validateTeamExecutionRecordV1;
void validateTeamExecutionRecoverySignalV1;
void validateTeamExecutionScopeV1;
void validateTeamExecutionStartRequestV1;
void validateTeamExecutionStateV1;
void validateTeamExecutionStepCommandV1;
void validateTeamExecutionStepDispatchV1;
void validateTeamExecutionStepRecordV1;
void validateTeamExecutionStepResultV1;

declare const controller: TeamExecutionPortV1;
declare const startRequest: TeamExecutionStartRequestV1;
declare const command: TeamExecutionStepCommandV1;
declare const result: TeamExecutionStepResultV1;
declare const rebind: TeamExecutionRebindRequestV1;
declare const handoff: TeamExecutionHandoffEnvelopeV1;

const started: Promise<TeamExecutionRecordV1> = controller.start(startRequest);
const prepared: Promise<TeamExecutionStepDispatchV1> =
  controller.prepareStep(command);
const settled: Promise<TeamExecutionRecordV1> = controller.settleStep(result);
const rebound: Promise<TeamExecutionRecordV1> = controller.rebind(rebind);
const loaded: Promise<TeamExecutionStateV1> = controller.loadState();
const imported: Promise<TeamExecutionStateV1> = controller.importHandoff({
  handoff,
  logicalTimeMs: 1,
});

void started;
void prepared;
void settled;
void rebound;
void loaded;
void imported;

type PublicTypes =
  | PortableAgentTeamMemberBindingV1
  | PortableAgentTeamMemberExecutionOptionsV1
  | TeamExecutionArtifactDraftV1
  | TeamExecutionArtifactPortV1
  | TeamExecutionArtifactV1
  | TeamExecutionControlDispositionV1
  | TeamExecutionControlEvidenceV1
  | TeamExecutionEpochHistoryEntryV1
  | TeamExecutionLimitsV1
  | TeamExecutionMetricsV1
  | TeamExecutionPolicyRecordV1
  | TeamExecutionPolicyV1
  | TeamExecutionPositionStateV1
  | TeamExecutionPositionStatusV1
  | TeamExecutionReconfigurationInputV1
  | TeamExecutionRecoverySignalV1
  | TeamExecutionRuntimeOptionsV1
  | TeamExecutionScopeV1
  | TeamExecutionStatusV1
  | TeamExecutionStepRecordV1
  | TeamExecutionStepStatusV1
  | TeamExecutionStoreV1
  | TeamMemberExecutionPortV1;

declare const publicType: PublicTypes;
void publicType;
