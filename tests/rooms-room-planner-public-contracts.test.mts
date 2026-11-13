import {
  createAgentRoomPlanner,
  createRuntimeRoomPlannerReasoner,
  type RoomPlannerPorts,
  type PlannerInitiativeAdmissionV1,
  type PlannerInitiativeObservationV1,
} from "@agentplat/framework";
import {
  PostgresRoomPlannerStore,
  PostgresRoomPlannerCallResults,
} from "@agentplat/rooms-postgres";
import { RoomPlannerWorkflowCalls } from "@agentplat/workflows-rooms";
import type { RoomPlannerTask, RoomPlannerProposal } from "@agentplat/rooms";
const task: RoomPlannerTask = {
  id: "research",
  participantId: "specialist",
  instruction: "Research",
  expectedOutput: "Report",
  dependencies: [],
  actionLevel: "read",
};
// @ts-expect-error Planner proposals cannot acquire external-write authority
const forbidden: RoomPlannerTask = { ...task, actionLevel: "external_write" };
const proposal: RoomPlannerProposal = {
  kind: "plan",
  objectiveId: "goal",
  expectedObjectiveRevision: null,
  title: "Report",
  criteria: [{ id: "c", description: "Verified" }],
  constraints: [],
  tasks: [task],
  content: "Working",
};
declare const ports: RoomPlannerPorts;
void createAgentRoomPlanner(ports);
void createRuntimeRoomPlannerReasoner;
void PostgresRoomPlannerStore;
void PostgresRoomPlannerCallResults;
void RoomPlannerWorkflowCalls;
void forbidden;
void proposal;

declare const admission: PlannerInitiativeAdmissionV1;
declare const observation: PlannerInitiativeObservationV1;
const nativePlanner = createAgentRoomPlanner(ports);
const initiativeScope = { tenantId: "tenant", roomId: "room" };
void nativePlanner.observeInitiative(initiativeScope, observation.id);
void nativePlanner.selectInitiative(initiativeScope, observation.id);
void nativePlanner.assertInitiativePublication(initiativeScope, observation.id);
void nativePlanner.operationCall(initiativeScope, "operation").then((call) => {
  void call.assertModelCall?.();
  void call.assertRead?.("mail.cached", initiativeScope.roomId);
});
void admission.scope.maximumReadCalls;
