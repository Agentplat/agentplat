import type { JsonObject } from "@agentplat/core";
import type { AgentGovernanceHeadV1 } from "./agent-governance.js";
import type {
  AgentExecutionBindingV1,
  AgentEffectDescriptorV1,
} from "./agent-execution.js";
import type { Participant, RoomTask } from "./models.js";

export interface AgentPurposeWorkBindingV1 {
  missionId: string;
  workEpoch: number;
  decisionDigest: string;
  planId: string;
  stepId: string;
}
export function equalPurposeWorkBindingV1(
  a: AgentPurposeWorkBindingV1 | undefined,
  b: AgentPurposeWorkBindingV1 | undefined,
): boolean {
  if (!a || !b) return a === b;
  return (
    a.missionId === b.missionId &&
    a.workEpoch === b.workEpoch &&
    a.decisionDigest === b.decisionDigest &&
    a.planId === b.planId &&
    a.stepId === b.stepId
  );
}
export interface AgentPurposeExecutionProjectionV1 {
  schemaVersion: 1;
  tenantId: string;
  agentId: string;
  missionId: string;
  status: string;
  workEpoch: number;
  workDecisionDigest: string | null;
  planId: string;
  governanceRevision: number;
  configurationDigest: string;
  expiresAt: string;
}
/** Qualified host composition, never a user-supplied activation flag. */
export interface AgentPurposeControlPortV1 {
  configurationDigest(): Promise<string>;
  admit(head: AgentGovernanceHeadV1): Promise<void>;
  bindTask(input: {
    binding: AgentExecutionBindingV1;
    participant: Participant;
    task: RoomTask;
  }): Promise<AgentPurposeWorkBindingV1>;
  checkDelegation?(
    binding: AgentExecutionBindingV1,
    inceptionMessageId: string,
    contentDigest: string,
  ): Promise<boolean>;
  checkWork(binding: AgentExecutionBindingV1): Promise<boolean>;
  checkEffect(
    binding: AgentExecutionBindingV1,
    effect: AgentEffectDescriptorV1,
  ): Promise<boolean>;
  context(binding: AgentExecutionBindingV1): Promise<JsonObject>;
}
export function agentPurposeWorkFenceMatchesV1(
  p: AgentPurposeExecutionProjectionV1 | undefined,
  b: AgentExecutionBindingV1,
  now = new Date().toISOString(),
): boolean {
  const w = b.purposeWork;
  return (
    !!p &&
    p.schemaVersion === 1 &&
    !!w &&
    p.tenantId === b.tenantId &&
    p.agentId === b.agentId &&
    p.missionId === w.missionId &&
    p.status === "runnable" &&
    p.workEpoch === w.workEpoch &&
    p.workDecisionDigest === w.decisionDigest &&
    p.planId === w.planId &&
    p.governanceRevision === b.revision &&
    p.configurationDigest === b.configurationDigest &&
    p.expiresAt > now
  );
}
