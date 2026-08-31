import {
  createMorphogenesisDecisionAuthorizationV1,
  validateMorphogenesisDecisionCandidateV1,
  type MorphogenesisDecisionAuthorizationV1,
  type MorphogenesisDecisionCandidateV1,
  createMorphogenesisStrategyReviewV3,
  validateMorphogenesisStrategyRecommendationV3,
  type MorphogenesisStrategyRecommendationV3,
  type MorphogenesisStrategyReviewV3,
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

export function createAgentRoomMorphogenesisStrategyGateConfigurationV3(input: {
  readonly recommendation: MorphogenesisStrategyRecommendationV3;
  readonly roomId: AgentPlatID;
  readonly requestedBy?: AgentPlatID;
}): AgentRoomGateConfigurationV1 {
  const recommendation = validateMorphogenesisStrategyRecommendationV3(input.recommendation);
  if (recommendation.reviewRoute !== "authorized_person")
    fail("Morphogenesis strategy Room gate requires the authorized-person route");
  return Object.freeze({
    roomId: input.roomId,
    targetType: "action" as const,
    targetId: recommendation.recommendationId,
    action: strategyApprovalAction(recommendation),
    ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
  });
}

export function createAgentRoomMorphogenesisStrategyReviewV3(input: {
  readonly recommendation: MorphogenesisStrategyRecommendationV3;
  readonly approval: Approval;
  readonly expectedTenantId: AgentPlatID;
  readonly expectedRoomId: AgentPlatID;
  readonly actorMandateDigest: `sha256:${string}`;
  readonly independenceGroupId: AgentPlatID;
  readonly proofDigest: `sha256:${string}`;
  readonly reviewedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}): MorphogenesisStrategyReviewV3 {
  const recommendation = validateMorphogenesisStrategyRecommendationV3(input.recommendation);
  const approval = input.approval;
  if (recommendation.reviewRoute !== "authorized_person" ||
      approval.tenantId !== input.expectedTenantId ||
      approval.roomId !== input.expectedRoomId || approval.targetType !== "action" ||
      approval.targetId !== recommendation.recommendationId ||
      approval.action !== strategyApprovalAction(recommendation) ||
      !["approved", "rejected"].includes(approval.status) ||
      !approval.decidedBy || !approval.decidedAt)
    fail("Agent Room review does not bind the Morphogenesis strategy recommendation");
  return createMorphogenesisStrategyReviewV3({
    reviewId: `${approval.id}:morphogenesis-strategy` as AgentPlatID,
    recommendationId: recommendation.recommendationId,
    recommendationDigest: recommendation.recommendationDigest,
    route: "authorized_person",
    actorType: "person",
    actorId: approval.decidedBy,
    actorMandateDigest: input.actorMandateDigest,
    independenceGroupId: input.independenceGroupId,
    disposition: approval.status === "approved" ? "approved" : "rejected",
    proofDigest: input.proofDigest,
    reviewedAtLogicalMs: input.reviewedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  });
}

function morphogenesisApprovalAction(
  candidate: MorphogenesisDecisionCandidateV1,
): string {
  return `morphogenesis.approve:${candidate.candidateDigest}`;
}

function strategyApprovalAction(
  recommendation: MorphogenesisStrategyRecommendationV3,
): string {
  return `morphogenesis.strategy.review:${recommendation.recommendationDigest}`;
}

function fail(message: string): never {
  throw new TypeError(message);
}
