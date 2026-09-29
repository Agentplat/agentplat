import {
  type PurposeMissionDecisionV1,
  type PurposeMissionOutcomeV1,
  type AgentPurposeControlPortV1,
  PurposeMissionServiceV1,
  InMemoryPurposeMissionStoreV1,
  createPurposeRoomInputPortV1,
} from "@agentplat/rooms";
import { PostgresPurposeMissionStoreV1 } from "@agentplat/rooms-postgres";
const decision: PurposeMissionDecisionV1 = {
  disposition: "needs_evidence",
  explanation: "Insufficient observations",
  uncertainty: "Causal attribution unknown",
};
const mutation: PurposeMissionDecisionV1 = {
  // @ts-expect-error a completion decision cannot mutate purpose
  disposition: "change_purpose",
  explanation: "x",
  uncertainty: "x",
};
// @ts-expect-error task completion is not an outcome coverage verdict
const coverage: PurposeMissionOutcomeV1["coverage"] = "task_completed";
declare const control: AgentPurposeControlPortV1;
void decision;
void mutation;
void coverage;
void control;
void PurposeMissionServiceV1;
void InMemoryPurposeMissionStoreV1;
void PostgresPurposeMissionStoreV1;
void createPurposeRoomInputPortV1;
