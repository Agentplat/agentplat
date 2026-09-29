import { checkAgentRoomAutonomyApprovalV1 } from "./autonomy.js";
import {
  validateAutonomyDecisionV1,
  validateAutonomyEvidenceWindowV1,
  validateAutonomyPolicyV1,
  digestAutonomyJsonV1,
  type AutonomyControllerV1,
  type AutonomyPolicyV1,
  type AutonomyEvidenceWindowV1,
  type AutonomyDecisionV1,
} from "@agentplat/autonomy";
import type {
  AgentExecutionBindingV1,
  AgentExecutionSupervisionPortV1,
} from "@agentplat/rooms";
import type { RoomService } from "@agentplat/rooms";

export function agentAutonomySegmentKeyV1(
  binding: AgentExecutionBindingV1,
  policyAgentId: string,
  actionType: string,
): string {
  return digestAutonomyJsonV1(
    "agent-governance-autonomy-scope",
    JSON.parse(
      JSON.stringify({
        tenantId: binding.tenantId,
        agentId: binding.agentId,
        policyAgentId,
        configurationDigest: binding.configurationDigest,
        definitionRevisionId: binding.definitionRevisionId,
        profileDigest: binding.profileDigest,
        continuity: binding.continuity ?? [],
        actionType,
      }),
    ),
  );
}
export function createGovernanceAutonomySupervisionV1(options: {
  policy: AutonomyPolicyV1;
  controller: Pick<AutonomyControllerV1, "evaluate">;
  evidence(input: {
    binding: AgentExecutionBindingV1;
    policyAgentId: string;
    actionType: string;
    segmentKey: string;
    logicalTime: string;
  }): Promise<AutonomyEvidenceWindowV1>;
  approval?: {
    rooms: Pick<RoomService, "getRoomState">;
    roomId: string;
    approvalId(decision: AutonomyDecisionV1): Promise<string>;
  };
}): AgentExecutionSupervisionPortV1 & { supervisionId: string } {
  const policy = validateAutonomyPolicyV1(options.policy),
    supervisionId = `autonomy:${policy.policyDigest}`;
  return Object.freeze({
    supervisionId,
    supports: (id: string) => id === supervisionId,
    async assess(
      input: Parameters<AgentExecutionSupervisionPortV1["assess"]>[0],
    ) {
      if (
        input.supervisionId !== supervisionId ||
        input.binding.tenantId !== policy.tenantId
      )
        throw new Error("autonomy_scope_mismatch");
      const actionType = `${input.effect.toolId}:${input.effect.operation}`,
        segmentKey = agentAutonomySegmentKeyV1(
          input.binding,
          input.policyAgentId,
          actionType,
        );
      const evidence = validateAutonomyEvidenceWindowV1(
        await options.evidence({
          binding: structuredClone(input.binding),
          policyAgentId: input.policyAgentId,
          actionType,
          segmentKey,
          logicalTime: input.logicalTime,
        }),
      );
      if (
        evidence.tenantId !== policy.tenantId ||
        evidence.policyDomainId !== policy.policyDomainId ||
        evidence.segmentNamespace !== policy.segmentNamespace ||
        evidence.segmentKey !== segmentKey ||
        evidence.actionType !== actionType
      )
        throw new Error("autonomy_evidence_scope_mismatch");
      const decision = validateAutonomyDecisionV1(
        await options.controller.evaluate({
          tenantId: policy.tenantId,
          policyDomainId: policy.policyDomainId,
          policyId: policy.policyId,
          policyVersion: policy.policyVersion,
          segmentNamespace: policy.segmentNamespace,
          segmentKey,
          actionType,
          actionProposalDigest: input.effect.actionDigest as `sha256:${string}`,
          evidence,
          logicalTime: input.logicalTime,
        }),
      );
      if (
        decision.tenantId !== policy.tenantId ||
        decision.policyDigest !== policy.policyDigest ||
        decision.segmentDigest !== evidence.segmentDigest ||
        decision.actionType !== actionType ||
        decision.actionProposalDigest !== input.effect.actionDigest ||
        decision.decidedAt > input.logicalTime
      )
        throw new Error("autonomy_decision_scope_mismatch");
      let allowed = decision.disposition === "eligible";
      if (decision.disposition === "require_approval" && options.approval) {
        const approvalId = await options.approval.approvalId(decision);
        allowed = (
          await checkAgentRoomAutonomyApprovalV1(
            { ...options.approval, approvalId },
            decision,
            Date.parse(input.logicalTime),
          )
        ).allowed;
      }
      return { allowed, decisionDigest: decision.decisionDigest };
    },
  });
}
/** Each required owner policy narrows execution; a missing policy never defaults to eligible. */
export function combineGovernanceSupervisionV1(
  ports: AgentExecutionSupervisionPortV1[],
): AgentExecutionSupervisionPortV1 {
  const current = [...ports];
  return Object.freeze({
    supports: (id: string) =>
      current.filter((p) => p.supports(id)).length === 1,
    assess: async (
      input: Parameters<AgentExecutionSupervisionPortV1["assess"]>[0],
    ) => {
      const matches = current.filter((p) => p.supports(input.supervisionId));
      if (matches.length !== 1)
        throw new Error("supervision_policy_unavailable_or_ambiguous");
      return matches[0].assess(input);
    },
  });
}
