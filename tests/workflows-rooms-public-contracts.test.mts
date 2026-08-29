import {
  AGENT_ROOM_APPROVAL_GATE_TYPE_V1,
  AgentRoomGateProviderV1,
  WorkflowRoomGateProjectorV1,
  createAgentRoomAutonomyApprovalEvidencePortV1,
  parseWorkflowRoomApprovalIdV1,
  validateAgentRoomGateConfigurationV1,
  workflowRoomGateRequestIdV1,
  type AgentRoomGateConfigurationV1,
  type AgentRoomGateProviderOptionsV1,
  type AgentRoomAutonomyApprovalOptionsV1,
  type WorkflowRoomGateProjectorOptionsV1,
} from "@agentplat/workflows-rooms";

void AGENT_ROOM_APPROVAL_GATE_TYPE_V1;
void AgentRoomGateProviderV1;
void WorkflowRoomGateProjectorV1;
void createAgentRoomAutonomyApprovalEvidencePortV1;
void parseWorkflowRoomApprovalIdV1;
void validateAgentRoomGateConfigurationV1;
void workflowRoomGateRequestIdV1;

type PublicTypes =
  | AgentRoomAutonomyApprovalOptionsV1
  | AgentRoomGateConfigurationV1
  | AgentRoomGateProviderOptionsV1
  | WorkflowRoomGateProjectorOptionsV1;

declare const publicType: PublicTypes;
void publicType;
