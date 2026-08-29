import { validateAutonomyDecisionV1 } from "@agentplat/autonomy";
import type { AutonomyApprovalEvidencePortV1 } from "@agentplat/autonomy/actions";
import type { RoomService } from "@agentplat/rooms";

export interface AgentRoomAutonomyApprovalOptionsV1 {
  readonly rooms: Pick<RoomService, "getRoomState">;
  readonly roomId: string;
  readonly approvalId: string;
}

/** Resolves one exact Room approval as supervision evidence, never authority. */
export function createAgentRoomAutonomyApprovalEvidencePortV1(
  options: AgentRoomAutonomyApprovalOptionsV1,
): AutonomyApprovalEvidencePortV1 {
  if (!options?.roomId || !options.approvalId)
    throw new TypeError("room_autonomy_approval_options_invalid");
  const port: AutonomyApprovalEvidencePortV1 = {
    async check(input) {
      const decision = validateAutonomyDecisionV1(input.decision);
      const state = await options.rooms.getRoomState(
        decision.tenantId,
        options.roomId,
      );
      const approval = state.approvals.find(
        (candidate) => candidate.id === options.approvalId,
      );
      if (!approval) return deny("room_autonomy_approval_missing");
      if (
        approval.roomId !== options.roomId ||
        approval.targetType !== "action" ||
        approval.targetId !== decision.actionProposalDigest ||
        approval.action !== decision.actionType
      )
        return deny("room_autonomy_approval_binding_mismatch");
      if (
        approval.status !== "approved" ||
        !approval.decidedAt ||
        Date.parse(approval.decidedAt) > input.logicalTimeMs
      )
        return deny("room_autonomy_approval_not_current");
      return Object.freeze({
        allowed: true as const,
        code: "allowed" as const,
      });
    },
  };
  return Object.freeze(port);
}

function deny(code: string) {
  return Object.freeze({ allowed: false as const, code });
}
