import {
  validateAutonomyDecisionV1,
  type AutonomyDecisionV1,
} from "@agentplat/autonomy";
import type { AutonomyApprovalEvidencePortV1 } from "@agentplat/autonomy/actions";
import type { RoomService } from "@agentplat/rooms";

export interface AgentRoomAutonomyApprovalOptionsV1 {
  readonly rooms: Pick<RoomService, "getRoomState">;
  readonly roomId: string;
  readonly approvalId: string;
}

/** Shared exact approval check for both existing collective guards and governed Room actions. */
export async function checkAgentRoomAutonomyApprovalV1(
  options: AgentRoomAutonomyApprovalOptionsV1,
  input: AutonomyDecisionV1,
  logicalTimeMs: number,
) {
  const decision = validateAutonomyDecisionV1(input);
  const state = await options.rooms.getRoomState(
    decision.tenantId,
    options.roomId,
  );
  const approval = state.approvals.find(
    (candidate) => candidate.id === options.approvalId,
  );
  if (!approval) return deny("room_autonomy_approval_missing");
  if (
    approval.tenantId !== decision.tenantId ||
    approval.roomId !== options.roomId ||
    approval.targetType !== "action" ||
    approval.targetId !== decision.actionProposalDigest ||
    approval.action !== decision.actionType
  )
    return deny("room_autonomy_approval_binding_mismatch");
  if (
    approval.status !== "approved" ||
    !approval.decidedAt ||
    Date.parse(approval.decidedAt) > logicalTimeMs
  )
    return deny("room_autonomy_approval_not_current");
  return Object.freeze({ allowed: true as const, code: "allowed" as const });
}
/** Resolves one exact Room approval as supervision evidence, never authority. */
export function createAgentRoomAutonomyApprovalEvidencePortV1(
  options: AgentRoomAutonomyApprovalOptionsV1,
): AutonomyApprovalEvidencePortV1 {
  if (!options?.roomId || !options.approvalId)
    throw new TypeError("room_autonomy_approval_options_invalid");
  return Object.freeze({
    async check(input: Parameters<AutonomyApprovalEvidencePortV1["check"]>[0]) {
      return checkAgentRoomAutonomyApprovalV1(
        options,
        input.decision,
        input.logicalTimeMs,
      );
    },
  });
}
function deny(code: string) {
  return Object.freeze({ allowed: false as const, code });
}
