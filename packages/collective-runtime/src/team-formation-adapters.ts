import {
  validateWorkContractV1,
  type WorkContractV1,
} from "@agentplat/collective-control/mesh";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { WorkBidPayload } from "@agentplat/mesh-protocol";

import type {
  CapabilityStateCandidateV1,
  CapabilityStateFusionDecisionV1,
  CapabilityStateFusionPortV1,
  CapabilityStateFusionRequestV1,
} from "./capability-state-contracts.js";
import {
  validateCapabilityStateCandidateV1,
  validateCapabilityStateFusionDecisionV1,
  validateCapabilityStateFusionRequestV1,
} from "./capability-state-runtime.js";
import type {
  TeamCandidateV1,
  TeamMemberContractBindingV1,
  TeamPositionBidV1,
  TeamPositionV1,
  TeamProposalV1,
} from "./team-formation-contracts.js";
import {
  createTeamCandidateV1,
  createTeamMemberContractBindingV1,
  createTeamPositionBidV1,
  validateTeamCandidateV1,
  validateTeamPositionV1,
  validateTeamProposalV1,
} from "./team-formation-validation.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;

/**
 * Projects only a locally eligible capability-state candidate. Restricted or
 * unavailable candidates cannot be promoted into team formation.
 */
export function createTeamCandidateFromCapabilityStateV1(input: {
  readonly candidate: CapabilityStateCandidateV1;
  readonly decision: CapabilityStateFusionDecisionV1;
  readonly request: CapabilityStateFusionRequestV1;
  readonly expected: Pick<
    CapabilityStateFusionPortV1,
    | "fusionId"
    | "fusionVersion"
    | "implementationId"
    | "policyId"
    | "policyVersion"
    | "policyDigest"
  >;
  readonly independenceGroupId: string;
  readonly logicalTimeMs: number;
}): TeamCandidateV1 {
  const candidate = validateCapabilityStateCandidateV1(input.candidate);
  const request = validateCapabilityStateFusionRequestV1(input.request);
  const decision = validateCapabilityStateFusionDecisionV1({
    decision: input.decision,
    request,
    expected: input.expected,
    logicalTimeMs: input.logicalTimeMs,
  });
  integer(input.logicalTimeMs, "candidate logical time", 0);
  if (
    decision.evaluatedAtLogicalMs > input.logicalTimeMs ||
    decision.expiresAtLogicalMs <= input.logicalTimeMs
  )
    throw new TypeError("capability state decision is not current");
  const projection = decision.candidates.find(
    (value) =>
      value.candidateId === candidate.candidateId &&
      value.candidateDigest === candidate.candidateDigest,
  );
  if (
    !request.candidates.some(
      (value) =>
        value.candidateId === candidate.candidateId &&
        value.candidateDigest === candidate.candidateDigest,
    )
  )
    throw new TypeError("capability state candidate is outside the request");
  if (
    request.scope.workItemId === null ||
    request.scope.workItemRevision === null
  )
    throw new TypeError("team candidate requires Work-scoped capability state");
  if (!projection || projection.disposition !== "eligible")
    throw new TypeError("capability state candidate is not eligible");
  return createTeamCandidateV1({
    schemaVersion: 1,
    candidateId: candidate.candidateId,
    peerId: candidate.peerId,
    instanceId: candidate.instanceId,
    independenceGroupId: input.independenceGroupId,
    sourceCandidateDigest: candidate.candidateDigest,
    sourceRequestDigest: request.requestDigest,
    sourceDecisionDigest: decision.decisionDigest,
    eligibleWorkItemId: request.scope.workItemId,
    eligibleWorkItemRevision: request.scope.workItemRevision,
    requiredCapabilityKeys: request.requiredCapabilityKeys,
  });
}

/**
 * Converts an already authenticated Mesh bid into local selection evidence.
 * The local score is supplied by the policy implementation, never by the
 * bidder, and the resulting record remains inert coordination data.
 */
export function createTeamPositionBidFromMeshV1(input: {
  readonly candidate: TeamCandidateV1;
  readonly position: TeamPositionV1;
  readonly bid: WorkBidPayload;
  readonly sourceBidDigest: PlanningDigestV1;
  readonly locallyEvaluatedScoreMicros: number;
  readonly observedAtLogicalMs: number;
  readonly expectedCompletionAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
}): TeamPositionBidV1 {
  const candidate = validateTeamCandidateV1(input.candidate);
  const position = validateTeamPositionV1(input.position);
  const bid = input.bid;
  if (
    !bid ||
    bid.type !== "work.bid" ||
    bid.bidderPeerId !== candidate.peerId ||
    bid.workItemId !== position.workItemId ||
    bid.workItemRevision !== position.workItemRevision ||
    candidate.eligibleWorkItemId !== position.workItemId ||
    candidate.eligibleWorkItemRevision !== position.workItemRevision ||
    !position.requiredCapabilityKeys.every((key) =>
      candidate.requiredCapabilityKeys.includes(key),
    ) ||
    bid.budgetUnits > position.budgetUnits ||
    bid.budgetUnits < 1 ||
    bid.capacityReservationUnits < 1 ||
    !Number.isSafeInteger(bid.budgetUnits) ||
    !Number.isSafeInteger(bid.capacityReservationUnits) ||
    typeof bid.bidId !== "string"
  )
    throw new TypeError("Mesh bid is not bound to the team position");
  if (!DIGEST.test(input.sourceBidDigest))
    throw new TypeError("Mesh bid source digest is invalid");
  return createTeamPositionBidV1({
    schemaVersion: 1,
    bidId: bid.bidId,
    positionId: position.positionId,
    candidate,
    sourceBidDigest: input.sourceBidDigest,
    capacityReservationUnits: bid.capacityReservationUnits,
    budgetUnits: bid.budgetUnits,
    expectedCompletionAtLogicalMs: input.expectedCompletionAtLogicalMs,
    locallyEvaluatedScoreMicros: input.locallyEvaluatedScoreMicros,
    observedAtLogicalMs: input.observedAtLogicalMs,
    validUntilLogicalMs: input.validUntilLogicalMs,
  });
}

/**
 * Binds one selected member to its existing active individual WorkContract.
 * No team-level record can substitute for this authority at an action gateway.
 */
export function createTeamMemberContractBindingFromWorkContractV1(input: {
  readonly proposal: TeamProposalV1;
  readonly workContract: WorkContractV1;
  readonly logicalTimeMs: number;
}): TeamMemberContractBindingV1 {
  const proposal = validateTeamProposalV1(input.proposal);
  const work = validateWorkContractV1(input.workContract);
  integer(input.logicalTimeMs, "member contract logical time", 0);
  if (
    work.status !== "active" ||
    work.tenantId !== proposal.scope.tenantId ||
    work.policyDomainId !== proposal.scope.policyDomainId ||
    work.objective.meshId !== proposal.scope.meshId ||
    work.objective.objectiveId !== proposal.scope.objectiveId ||
    work.assignment.leaseExpiresAtLogicalMs <= input.logicalTimeMs
  )
    throw new TypeError("WorkContract is not active for the team scope");
  const member = proposal.members.find((value) => {
    const candidatePosition = proposal.positions.find(
      (candidate) => candidate.positionId === value.positionId,
    );
    return (
      value.peerId === work.assignment.assignedPeerId &&
      value.instanceId === work.assignment.assignedInstanceId &&
      candidatePosition?.workItemId === work.assignment.workItemId &&
      candidatePosition.workItemRevision === work.assignment.workItemRevision
    );
  });
  if (!member)
    throw new TypeError("WorkContract assignee is outside the team proposal");
  const position = proposal.positions.find(
    (value) => value.positionId === member.positionId,
  )!;
  if (
    work.assignment.workItemId !== position.workItemId ||
    work.assignment.workItemRevision !== position.workItemRevision ||
    work.roleKey !== position.roleKey ||
    !position.requiredCapabilityKeys.every((key) =>
      work.requiredCapabilityKeys.includes(key),
    ) ||
    work.reservedBudgetUnits <
      Math.min(position.budgetUnits, member.budgetUnits) ||
    work.maximumActionBudgetUnits < position.maximumActionBudgetUnits
  )
    throw new TypeError("WorkContract does not satisfy the selected position");
  return createTeamMemberContractBindingV1({
    schemaVersion: 1,
    memberId: member.memberId,
    selectionDigest: member.selectionDigest,
    positionId: position.positionId,
    peerId: member.peerId,
    instanceId: member.instanceId,
    workItemId: work.assignment.workItemId,
    workItemRevision: work.assignment.workItemRevision,
    workContractId: work.workContractId,
    workContractGeneration: work.generation,
    workContractDigest: work.workContractDigest,
    assignmentAuthorityId: work.assignment.assignmentAuthorityId,
    assignmentEpoch: work.assignment.assignmentEpoch,
    authorityGeneration: work.assignment.authorityGeneration,
    fencingToken: work.assignment.fencingToken,
    leaseExpiresAtLogicalMs: work.assignment.leaseExpiresAtLogicalMs,
    workDeadline: work.assignment.workDeadline,
    roleKey: work.roleKey,
    requiredCapabilityKeys: work.requiredCapabilityKeys,
    reservedBudgetUnits: work.reservedBudgetUnits,
    maximumActionBudgetUnits: work.maximumActionBudgetUnits,
  });
}

export function createTeamMemberContractBindingsV1(input: {
  readonly proposal: TeamProposalV1;
  readonly workContracts: readonly WorkContractV1[];
  readonly logicalTimeMs: number;
}): readonly TeamMemberContractBindingV1[] {
  const proposal = validateTeamProposalV1(input.proposal);
  if (
    !Array.isArray(input.workContracts) ||
    input.workContracts.length !== proposal.members.length
  )
    throw new TypeError("team activation requires exact member coverage");
  const bindings = input.workContracts.map((workContract) =>
    createTeamMemberContractBindingFromWorkContractV1({
      proposal,
      workContract,
      logicalTimeMs: input.logicalTimeMs,
    }),
  );
  if (
    new Set(bindings.map((binding) => binding.positionId)).size !==
    bindings.length
  )
    throw new TypeError(
      "team activation contains duplicate position authority",
    );
  return Object.freeze(
    [...bindings].sort((left, right) =>
      left.positionId < right.positionId
        ? -1
        : left.positionId > right.positionId
          ? 1
          : 0,
    ),
  );
}

export interface TeamPositionWorkProjectionV1 {
  readonly schemaVersion: 1;
  readonly teamId: string;
  readonly teamEpoch: number;
  readonly proposalDigest: PlanningDigestV1;
  readonly memberId: string;
  readonly selectionDigest: PlanningDigestV1;
  readonly positionId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly roleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly completionCriteria: readonly string[];
  readonly dependsOnWorkItemIds: readonly string[];
  readonly selectedPeerId: string;
  readonly selectedInstanceId: string;
  readonly reservedBudgetUnits: number;
  readonly maximumActionBudgetUnits: number;
}

/**
 * Projects a roster into ordinary per-member Work inputs. Applications still
 * use the existing Mesh offer/bid/award/accept path for every projection.
 */
export function createTeamPositionWorkProjectionsV1(input: {
  readonly proposal: TeamProposalV1;
}): readonly TeamPositionWorkProjectionV1[] {
  const proposal = validateTeamProposalV1(input.proposal);
  const positionById = new Map(
    proposal.positions.map((position) => [position.positionId, position]),
  );
  return Object.freeze(
    proposal.members.map((member) => {
      const position = positionById.get(member.positionId)!;
      return Object.freeze({
        schemaVersion: 1 as const,
        teamId: proposal.teamId,
        teamEpoch: proposal.teamEpoch,
        proposalDigest: proposal.proposalDigest,
        memberId: member.memberId,
        selectionDigest: member.selectionDigest,
        positionId: position.positionId,
        workItemId: position.workItemId,
        workItemRevision: position.workItemRevision,
        roleKey: position.roleKey,
        requiredCapabilityKeys: position.requiredCapabilityKeys,
        completionCriteria: position.completionCriteria,
        dependsOnWorkItemIds: Object.freeze(
          position.dependsOnPositionIds.map(
            (positionId) => positionById.get(positionId)!.workItemId,
          ),
        ),
        selectedPeerId: member.peerId,
        selectedInstanceId: member.instanceId,
        reservedBudgetUnits: member.budgetUnits,
        maximumActionBudgetUnits: position.maximumActionBudgetUnits,
      });
    }),
  );
}

function integer(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new TypeError(`${label} is invalid`);
}
