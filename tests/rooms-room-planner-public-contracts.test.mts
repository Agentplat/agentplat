import {
  createAgentRoomPlanner,
  createRuntimeRoomPlannerReasoner,
  type RoomPlannerPorts,
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
