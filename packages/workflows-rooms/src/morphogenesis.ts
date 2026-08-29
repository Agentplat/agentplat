import {
  createMorphogenesisDecisionAuthorizationV1,
  validateMorphogenesisDecisionCandidateV1,
  type MorphogenesisDecisionAuthorizationV1,
  type MorphogenesisDecisionCandidateV1,
} from "@agentplat/collective-runtime/morphogenesis";
import type { AgentPlatID } from "@agentplat/core";
import type { Approval } from "@agentplat/rooms";

import type { AgentRoomGateConfigurationV1 } from "./index.js";

export function createAgentRoomMorphogenesisGateConfigurationV1(input: {
  readonly candidate: MorphogenesisDecisionCandidateV1;
  readonly roomId: AgentPlatID;
  readonly requestedBy?: AgentPlatID;
}): AgentRoomGateConfigurationV1 {
  const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
  if (candidate.decisionRoute !== "authorized_person")
    fail("morphogenesis Room gate requires the authorized-person route");
  return Object.freeze({
    roomId: input.roomId,
    targetType: "action" as const,
    targetId: candidate.candidateId,
    action: morphogenesisApprovalAction(candidate),
    ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
  });
}

export function createAgentRoomMorphogenesisDecisionAuthorizationV1(input: {
  readonly candidate: MorphogenesisDecisionCandidateV1;
  readonly approval: Approval;
  readonly expectedTenantId: AgentPlatID;
  readonly expectedRoomId: AgentPlatID;
  readonly actorMandateDigest: `sha256:${string}`;
  readonly independenceGroupId: AgentPlatID;
  readonly proofDigest: `sha256:${string}`;
  readonly decidedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}): MorphogenesisDecisionAuthorizationV1 {
  const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
  const approval = input.approval;
  if (
    candidate.decisionRoute !== "authorized_person" ||
    approval.tenantId !== input.expectedTenantId ||
    approval.roomId !== input.expectedRoomId ||
    approval.targetType !== "action" ||
    approval.targetId !== candidate.candidateId ||
    approval.action !== morphogenesisApprovalAction(candidate) ||
    !["approved", "rejected"].includes(approval.status) ||
    !approval.decidedBy ||
    !approval.decidedAt
  )
    fail("Agent Room decision does not bind the Morphogenesis candidate");
  return createMorphogenesisDecisionAuthorizationV1({
    authorizationId: `${approval.id}:morphogenesis` as AgentPlatID,
    candidateDigest: candidate.candidateDigest,
    route: "authorized_person",
    actorType: "person",
    actorId: approval.decidedBy,
    actorMandateDigest: input.actorMandateDigest,
    independenceGroupId: input.independenceGroupId,
    disposition: approval.status === "approved" ? "approved" : "rejected",
    proofDigest: input.proofDigest,
    issuedAtLogicalMs: input.decidedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  });
}

function morphogenesisApprovalAction(
  candidate: MorphogenesisDecisionCandidateV1,
): string {
  return `morphogenesis.approve:${candidate.candidateDigest}`;
}

function fail(message: string): never {
  throw new TypeError(message);
}
