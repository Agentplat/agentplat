import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  JointWorkContractV1,
  TeamFormationDecisionV1,
  TeamFormationPolicyRecordV1,
  TeamFormationReductionInputV1,
  TeamFormationReductionResultV1,
  TeamFormationStateV1,
  TeamMemberContractBindingV1,
  TeamMemberOutcomeV1,
  TeamMemberSelectionV1,
  TeamPositionBidV1,
  TeamProposalV1,
  TeamRecordV1,
  TeamReconfigurationRequestV1,
} from "./team-formation-contracts.js";
import {
  createJointWorkContractV1,
  createTeamFormationDecisionV1,
  createTeamFormationStateV1,
  createTeamMemberSelectionV1,
  createTeamProposalV1,
  createTeamRecordV1,
  validateTeamFormationPolicyV1,
  validateTeamFormationRequestV1,
  validateTeamFormationStateV1,
  validateTeamMemberContractBindingV1,
  validateTeamMemberOutcomeV1,
  validateTeamReconfigurationRequestV1,
} from "./team-formation-validation.js";

interface SearchResult {
  readonly bids: readonly TeamPositionBidV1[] | null;
  readonly exploredNodes: number;
  readonly exhausted: boolean;
}

export function reduceTeamFormationV1(
  input: TeamFormationReductionInputV1,
): TeamFormationReductionResultV1 {
  const policy = validateTeamFormationPolicyV1(input.policy);
  const state = validateTeamFormationStateV1(input.state, { policy });
  const request = validateTeamFormationRequestV1(input.request);
  if (state.lastDecision?.requestDigest === request.requestDigest)
    return freeze({ state, decision: state.lastDecision });

  const reasons = new Set<string>();
  let proposal: TeamProposalV1 | null = null;
  let exploredSearchNodes = 0;
  let status: TeamFormationDecisionV1["status"] = "policy_denied";

  const policyFailure = formationPolicyFailure(state, policy, request);
  if (policyFailure) {
    reasons.add(policyFailure);
  } else {
    const search = selectRoster(
      request.positions,
      request.bids,
      policy,
      request.logicalTimeMs,
    );
    exploredSearchNodes = search.exploredNodes;
    if (search.exhausted) {
      status = "search_exhausted";
      reasons.add("formation_search_exhausted");
    } else if (!search.bids) {
      status = "insufficient_coverage";
      reasons.add("complete_roster_unavailable");
    } else {
      status = "formed";
      proposal = proposalFromBids({
        request,
        policy,
        bids: search.bids,
        teamEpoch: 1,
        predecessorJointWorkContractDigest: null,
      });
      reasons.add("complete_roster_selected");
    }
  }

  return commitFormationDecision({
    state,
    policy,
    requestDigest: request.requestDigest,
    evaluatedAtLogicalMs: request.logicalTimeMs,
    status,
    proposal,
    exploredSearchNodes,
    reasonCodes: boundedReasons(reasons, policy),
    priorHistory: freeze([]),
  });
}

export function reduceTeamReconfigurationV1(input: {
  readonly state: TeamFormationStateV1;
  readonly policy: TeamFormationPolicyRecordV1;
  readonly request: TeamReconfigurationRequestV1;
}): TeamFormationReductionResultV1 {
  const policy = validateTeamFormationPolicyV1(input.policy);
  const state = validateTeamFormationStateV1(input.state, { policy });
  const request = validateTeamReconfigurationRequestV1(input.request);
  if (state.lastDecision?.requestDigest === request.requestDigest)
    return freeze({ state, decision: state.lastDecision });

  const reasons = new Set<string>();
  let proposal: TeamProposalV1 | null = null;
  let exploredSearchNodes = 0;
  let status: TeamFormationDecisionV1["status"] = "policy_denied";
  const team = state.team;
  const joint = team?.jointWorkContract ?? null;

  if (request.logicalTimeMs < state.logicalTimeHighWaterMs)
    reasons.add("logical_time_rollback");
  else if (!team || team.status !== "failed" || !joint)
    reasons.add("failed_team_required");
  else if (
    request.currentJointWorkContractDigest !== joint.jointWorkContractDigest
  )
    reasons.add("joint_contract_not_current");
  else if (request.logicalTimeMs >= joint.validUntilLogicalMs)
    reasons.add("joint_contract_expired");
  else if (
    request.validUntilLogicalMs - request.logicalTimeMs >
    policy.policy.limits.maximumRequestTtlMs
  )
    reasons.add("request_ttl_exceeded");
  else if (request.membershipEpoch < team.proposal.membershipEpoch)
    reasons.add("membership_epoch_rollback");
  else {
    const failed = team.proposal.members.find(
      (member) => member.memberId === request.failedMemberId,
    );
    if (!failed) reasons.add("failed_member_not_found");
    else if (
      !team.outcomes.some(
        (outcome) =>
          outcome.memberId === failed.memberId &&
          (outcome.status === "failure" || outcome.status === "unsafe"),
      )
    )
      reasons.add("failed_member_outcome_required");
    else {
      const position = team.proposal.positions.find(
        (value) => value.positionId === failed.positionId,
      )!;
      const retained = team.proposal.members.filter(
        (member) => member.memberId !== failed.memberId,
      );
      const replacementBids = request.replacementBids.filter(
        (bid) =>
          bid.positionId === position.positionId &&
          bid.candidate.candidateId !== failed.candidateId &&
          bid.observedAtLogicalMs <= request.logicalTimeMs &&
          bid.validUntilLogicalMs > request.logicalTimeMs &&
          bid.validUntilLogicalMs <= request.validUntilLogicalMs &&
          bid.expectedCompletionAtLogicalMs - request.logicalTimeMs <=
            policy.policy.limits.maximumTeamDurationMs &&
          (!policy.policy.requireDistinctPeerPerPosition ||
            !retained.some((member) => member.peerId === bid.candidate.peerId)),
      );
      exploredSearchNodes = replacementBids.length;
      const ordered = [...replacementBids].sort(compareBid);
      const selected = ordered.find((bid) => {
        const candidateMembers = [...retained, selectionProbe(bid)];
        return rosterMeetsCollectivePolicy(candidateMembers, policy);
      });
      if (!selected) {
        status = "insufficient_coverage";
        reasons.add("replacement_roster_unavailable");
      } else {
        const nextEpoch = team.teamEpoch + 1;
        const members = [
          ...retained.map((member) =>
            reseatSelection(member, team.teamId, nextEpoch),
          ),
          selectionFromBid(
            selected,
            position.positionDigest,
            team.teamId,
            nextEpoch,
          ),
        ].sort((left, right) => compare(left.positionId, right.positionId));
        const totalBudgetUnits = sum(
          members.map((member) => member.budgetUnits),
        );
        if (totalBudgetUnits > policy.policy.maximumTotalBudgetUnits) {
          reasons.add("team_budget_exceeded");
        } else {
          status = "formed";
          proposal = createTeamProposalV1({
            schemaVersion: 1,
            teamId: team.teamId,
            teamEpoch: nextEpoch,
            scope: team.proposal.scope,
            policyDigest: policy.policyDigest,
            membershipEpoch: request.membershipEpoch,
            membershipConfigurationDigest:
              request.membershipConfigurationDigest,
            formationRequestDigest: request.requestDigest,
            predecessorJointWorkContractDigest: joint.jointWorkContractDigest,
            positions: team.proposal.positions,
            members,
            totalBudgetUnits,
            expectedCompletionAtLogicalMs: Math.max(
              ...members.map((member) => member.expectedCompletionAtLogicalMs),
            ),
            proposedAtLogicalMs: request.logicalTimeMs,
            validUntilLogicalMs: request.validUntilLogicalMs,
          });
          reasons.add("replacement_roster_selected");
        }
      }
    }
  }

  const priorHistory = team
    ? freeze([
        ...team.history,
        freeze({
          schemaVersion: 1 as const,
          teamEpoch: team.teamEpoch,
          proposalDigest: team.proposal.proposalDigest,
          jointWorkContractDigest:
            team.jointWorkContract?.jointWorkContractDigest ?? null,
          status: team.status,
          closedAtLogicalMs: request.logicalTimeMs,
          reasonCode: request.reasonCode,
        }),
      ]).slice(-policy.policy.limits.maximumHistoryEntries)
    : freeze([]);

  return commitFormationDecision({
    state,
    policy,
    requestDigest: request.requestDigest,
    evaluatedAtLogicalMs: request.logicalTimeMs,
    status,
    proposal,
    exploredSearchNodes,
    reasonCodes: boundedReasons(reasons, policy),
    priorHistory,
  });
}

export function activateTeamProposalV1(input: {
  readonly state: TeamFormationStateV1;
  readonly policy: TeamFormationPolicyRecordV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly memberContracts: readonly TeamMemberContractBindingV1[];
  readonly logicalTimeMs: number;
}): {
  readonly state: TeamFormationStateV1;
  readonly contract: JointWorkContractV1;
} {
  const policy = validateTeamFormationPolicyV1(input.policy);
  const state = validateTeamFormationStateV1(input.state, { policy });
  const team = state.team;
  if (
    !team ||
    team.status !== "awaiting_member_contracts" ||
    team.proposal.proposalDigest !== input.proposalDigest
  )
    fail("team proposal is not awaiting activation");
  if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
    fail("team activation logical time rolled back");
  const memberContracts = input.memberContracts.map(
    validateTeamMemberContractBindingV1,
  );
  const contract = createJointWorkContractV1({
    proposal: team.proposal,
    memberContracts,
    activatedAtLogicalMs: input.logicalTimeMs,
  });
  const nextTeam = createTeamRecordV1({
    ...team,
    status: "active",
    jointWorkContract: contract,
    outcomes: freeze([]),
    updatedAtLogicalMs: input.logicalTimeMs,
  });
  return freeze({
    state: successorState(state, policy, nextTeam, input.logicalTimeMs),
    contract,
  });
}

export function recordTeamMemberOutcomeV1(input: {
  readonly state: TeamFormationStateV1;
  readonly policy: TeamFormationPolicyRecordV1;
  readonly outcome: TeamMemberOutcomeV1;
}): { readonly state: TeamFormationStateV1; readonly team: TeamRecordV1 } {
  const policy = validateTeamFormationPolicyV1(input.policy);
  const state = validateTeamFormationStateV1(input.state, { policy });
  const outcome = validateTeamMemberOutcomeV1(input.outcome);
  const team = state.team;
  const joint = team?.jointWorkContract ?? null;
  if (!team || team.status !== "active" || !joint)
    fail("active team is required for an outcome");
  if (
    outcome.teamId !== team.teamId ||
    outcome.teamEpoch !== team.teamEpoch ||
    outcome.jointWorkContractDigest !== joint.jointWorkContractDigest
  )
    fail("team member outcome scope is invalid");
  if (outcome.observedAtLogicalMs < state.logicalTimeHighWaterMs)
    fail("team member outcome logical time rolled back");
  if (outcome.observedAtLogicalMs >= joint.validUntilLogicalMs)
    fail("team member outcome arrived after joint contract expiry");
  const binding = joint.memberContracts.find(
    (member) => member.memberId === outcome.memberId,
  );
  if (!binding || binding.bindingDigest !== outcome.memberBindingDigest)
    fail("team member outcome binding is invalid");
  if (outcome.status === "indeterminate") return freeze({ state, team });
  const prior = team.outcomes.find(
    (value) => value.memberId === outcome.memberId,
  );
  if (prior) {
    if (prior.outcomeDigest !== outcome.outcomeDigest)
      fail("team member outcome conflicts with retained outcome");
    return freeze({ state, team });
  }
  const outcomes = freeze(
    [...team.outcomes, outcome].sort((left, right) =>
      compare(left.memberId, right.memberId),
    ),
  );
  const failed = outcomes.some(
    (value) => value.status === "failure" || value.status === "unsafe",
  );
  const completed =
    outcomes.length === joint.memberContracts.length &&
    outcomes.every((value) => value.status === "success");
  const nextTeam = createTeamRecordV1({
    ...team,
    status: failed ? "failed" : completed ? "completed" : "active",
    outcomes,
    updatedAtLogicalMs: outcome.observedAtLogicalMs,
  });
  return freeze({
    state: successorState(state, policy, nextTeam, outcome.observedAtLogicalMs),
    team: nextTeam,
  });
}

export function cancelTeamV1(input: {
  readonly state: TeamFormationStateV1;
  readonly policy: TeamFormationPolicyRecordV1;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
}): { readonly state: TeamFormationStateV1; readonly team: TeamRecordV1 } {
  const policy = validateTeamFormationPolicyV1(input.policy);
  const state = validateTeamFormationStateV1(input.state, { policy });
  const team = state.team;
  if (!team) fail("team is not available for cancellation");
  if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
    fail("team cancellation logical time rolled back");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(input.reasonCode))
    fail("team cancellation reason is invalid");
  if (team.status === "cancelled") return freeze({ state, team });
  if (team.status === "completed" || team.status === "failed")
    fail("terminal team cannot be cancelled");
  const nextTeam = createTeamRecordV1({
    ...team,
    status: "cancelled",
    history: freeze(
      [
        ...team.history,
        freeze({
          schemaVersion: 1 as const,
          teamEpoch: team.teamEpoch,
          proposalDigest: team.proposal.proposalDigest,
          jointWorkContractDigest:
            team.jointWorkContract?.jointWorkContractDigest ?? null,
          status: "cancelled" as const,
          closedAtLogicalMs: input.logicalTimeMs,
          reasonCode: input.reasonCode,
        }),
      ].slice(-policy.policy.limits.maximumHistoryEntries),
    ),
    updatedAtLogicalMs: input.logicalTimeMs,
  });
  return freeze({
    state: successorState(state, policy, nextTeam, input.logicalTimeMs),
    team: nextTeam,
  });
}

function formationPolicyFailure(
  state: TeamFormationStateV1,
  policy: TeamFormationPolicyRecordV1,
  request: ReturnType<typeof validateTeamFormationRequestV1>,
): string | null {
  if (request.logicalTimeMs < state.logicalTimeHighWaterMs)
    return "logical_time_rollback";
  if (
    state.team &&
    (state.team.status === "active" ||
      state.team.status === "awaiting_member_contracts")
  )
    return "non_terminal_team_exists";
  if (request.positions.length > policy.policy.limits.maximumPositions)
    return "position_limit_exceeded";
  if (request.positions.length > policy.policy.limits.maximumMembers)
    return "member_limit_exceeded";
  if (
    request.validUntilLogicalMs - request.logicalTimeMs >
    policy.policy.limits.maximumRequestTtlMs
  )
    return "request_ttl_exceeded";
  if (
    request.validUntilLogicalMs - request.logicalTimeMs >
    policy.policy.limits.maximumTeamDurationMs
  )
    return "team_duration_exceeded";
  if (
    sum(request.positions.map((position) => position.budgetUnits)) >
    policy.policy.maximumTotalBudgetUnits
  )
    return "team_budget_exceeded";
  for (const position of request.positions) {
    if (
      request.bids.filter((bid) => bid.positionId === position.positionId)
        .length > policy.policy.limits.maximumBidsPerPosition
    )
      return "position_bid_limit_exceeded";
  }
  return null;
}

function selectRoster(
  positions: TeamFormationReductionInputV1["request"]["positions"],
  bids: TeamFormationReductionInputV1["request"]["bids"],
  policy: TeamFormationPolicyRecordV1,
  logicalTimeMs: number,
): SearchResult {
  const candidatesByPosition = new Map(
    positions.map((position) => [
      position.positionId,
      bids
        .filter(
          (bid) =>
            bid.positionId === position.positionId &&
            bid.budgetUnits <= position.budgetUnits &&
            bid.expectedCompletionAtLogicalMs - logicalTimeMs <=
              policy.policy.limits.maximumTeamDurationMs,
        )
        .sort(compareBid),
    ]),
  );
  const orderedPositions = [...positions].sort((left, right) => {
    const count =
      candidatesByPosition.get(left.positionId)!.length -
      candidatesByPosition.get(right.positionId)!.length;
    return count || compare(left.positionId, right.positionId);
  });
  if (
    orderedPositions.some(
      (position) => candidatesByPosition.get(position.positionId)!.length === 0,
    )
  )
    return freeze({ bids: null, exploredNodes: 0, exhausted: false });

  let exploredNodes = 0;
  let exhausted = false;
  let best: TeamPositionBidV1[] | null = null;
  const current: TeamPositionBidV1[] = [];

  const visit = (index: number, budget: number): void => {
    if (exhausted) return;
    exploredNodes += 1;
    if (exploredNodes > policy.policy.limits.maximumSearchNodes) {
      exhausted = true;
      best = null;
      return;
    }
    if (index === orderedPositions.length) {
      if (!rosterMeetsCollectivePolicy(current.map(selectionProbe), policy))
        return;
      const candidate = [...current].sort((left, right) =>
        compare(left.positionId, right.positionId),
      );
      if (!best || compareRoster(candidate, best) < 0) best = candidate;
      return;
    }
    const position = orderedPositions[index]!;
    for (const bid of candidatesByPosition.get(position.positionId)!) {
      const nextBudget = budget + bid.budgetUnits;
      if (
        !Number.isSafeInteger(nextBudget) ||
        nextBudget > policy.policy.maximumTotalBudgetUnits
      )
        continue;
      if (
        policy.policy.requireDistinctPeerPerPosition &&
        current.some((value) => value.candidate.peerId === bid.candidate.peerId)
      )
        continue;
      current.push(bid);
      visit(index + 1, nextBudget);
      current.pop();
      if (exhausted) return;
    }
  };
  visit(0, 0);
  return freeze({ bids: best, exploredNodes, exhausted });
}

function rosterMeetsCollectivePolicy(
  members: readonly {
    readonly peerId: string;
    readonly independenceGroupId: string;
  }[],
  policy: TeamFormationPolicyRecordV1,
): boolean {
  return (
    new Set(members.map((member) => member.peerId)).size >=
      policy.policy.minimumDistinctPeers &&
    new Set(members.map((member) => member.independenceGroupId)).size >=
      policy.policy.minimumIndependenceGroups
  );
}

function proposalFromBids(input: {
  readonly request: ReturnType<typeof validateTeamFormationRequestV1>;
  readonly policy: TeamFormationPolicyRecordV1;
  readonly bids: readonly TeamPositionBidV1[];
  readonly teamEpoch: number;
  readonly predecessorJointWorkContractDigest: PlanningDigestV1 | null;
}): TeamProposalV1 {
  const teamId = deriveTeamId(
    input.request.scope.scopeDigest,
    input.request.requestDigest,
  );
  const positions = new Map(
    input.request.positions.map((position) => [position.positionId, position]),
  );
  const members = input.bids
    .map((bid) =>
      selectionFromBid(
        bid,
        positions.get(bid.positionId)!.positionDigest,
        teamId,
        input.teamEpoch,
      ),
    )
    .sort((left, right) => compare(left.positionId, right.positionId));
  return createTeamProposalV1({
    schemaVersion: 1,
    teamId,
    teamEpoch: input.teamEpoch,
    scope: input.request.scope,
    policyDigest: input.policy.policyDigest,
    membershipEpoch: input.request.membershipEpoch,
    membershipConfigurationDigest: input.request.membershipConfigurationDigest,
    formationRequestDigest: input.request.requestDigest,
    predecessorJointWorkContractDigest:
      input.predecessorJointWorkContractDigest,
    positions: input.request.positions,
    members,
    totalBudgetUnits: sum(members.map((member) => member.budgetUnits)),
    expectedCompletionAtLogicalMs: Math.max(
      ...members.map((member) => member.expectedCompletionAtLogicalMs),
    ),
    proposedAtLogicalMs: input.request.logicalTimeMs,
    validUntilLogicalMs: input.request.validUntilLogicalMs,
  });
}

function selectionFromBid(
  bid: TeamPositionBidV1,
  positionDigest: PlanningDigestV1,
  teamId: string,
  teamEpoch: number,
): TeamMemberSelectionV1 {
  return createTeamMemberSelectionV1({
    schemaVersion: 1,
    teamId,
    teamEpoch,
    positionId: bid.positionId,
    positionDigest,
    candidateId: bid.candidate.candidateId,
    candidateDigest: bid.candidate.candidateDigest,
    peerId: bid.candidate.peerId,
    instanceId: bid.candidate.instanceId,
    independenceGroupId: bid.candidate.independenceGroupId,
    bidId: bid.bidId,
    bidDigest: bid.bidDigest,
    sourceBidDigest: bid.sourceBidDigest,
    budgetUnits: bid.budgetUnits,
    expectedCompletionAtLogicalMs: bid.expectedCompletionAtLogicalMs,
    locallyEvaluatedScoreMicros: bid.locallyEvaluatedScoreMicros,
  });
}

function reseatSelection(
  member: TeamMemberSelectionV1,
  teamId: string,
  teamEpoch: number,
): TeamMemberSelectionV1 {
  return createTeamMemberSelectionV1({
    schemaVersion: 1,
    teamId,
    teamEpoch,
    positionId: member.positionId,
    positionDigest: member.positionDigest,
    candidateId: member.candidateId,
    candidateDigest: member.candidateDigest,
    peerId: member.peerId,
    instanceId: member.instanceId,
    independenceGroupId: member.independenceGroupId,
    bidId: member.bidId,
    bidDigest: member.bidDigest,
    sourceBidDigest: member.sourceBidDigest,
    budgetUnits: member.budgetUnits,
    expectedCompletionAtLogicalMs: member.expectedCompletionAtLogicalMs,
    locallyEvaluatedScoreMicros: member.locallyEvaluatedScoreMicros,
  });
}

function selectionProbe(bid: TeamPositionBidV1): {
  readonly peerId: string;
  readonly independenceGroupId: string;
} {
  return freeze({
    peerId: bid.candidate.peerId,
    independenceGroupId: bid.candidate.independenceGroupId,
  });
}

function commitFormationDecision(input: {
  readonly state: TeamFormationStateV1;
  readonly policy: TeamFormationPolicyRecordV1;
  readonly requestDigest: PlanningDigestV1;
  readonly evaluatedAtLogicalMs: number;
  readonly status: TeamFormationDecisionV1["status"];
  readonly proposal: TeamProposalV1 | null;
  readonly exploredSearchNodes: number;
  readonly reasonCodes: readonly string[];
  readonly priorHistory: TeamRecordV1["history"];
}): TeamFormationReductionResultV1 {
  const decision = createTeamFormationDecisionV1({
    schemaVersion: 1,
    requestDigest: input.requestDigest,
    status: input.status,
    proposal: input.proposal,
    exploredSearchNodes: input.exploredSearchNodes,
    reasonCodes: input.reasonCodes,
    evaluatedAtLogicalMs: input.evaluatedAtLogicalMs,
    priorStateRevision: input.state.revision,
    committedStateRevision: input.state.revision + 1,
  });
  const team = input.proposal
    ? createTeamRecordV1({
        schemaVersion: 1,
        teamId: input.proposal.teamId,
        teamEpoch: input.proposal.teamEpoch,
        status: "awaiting_member_contracts",
        proposal: input.proposal,
        jointWorkContract: null,
        outcomes: freeze([]),
        history: input.priorHistory,
        updatedAtLogicalMs: input.evaluatedAtLogicalMs,
      })
    : input.state.team;
  const next = createTeamFormationStateV1({
    stateKey: input.state.stateKey,
    formationId: input.state.formationId,
    formationVersion: input.state.formationVersion,
    implementationId: input.state.implementationId,
    policy: input.policy,
    revision: input.state.revision + 1,
    logicalTimeHighWaterMs: Math.max(
      input.state.logicalTimeHighWaterMs,
      input.evaluatedAtLogicalMs,
    ),
    team,
    lastDecision: decision,
    predecessorStateDigest: input.state.stateDigest,
  });
  return freeze({ state: next, decision });
}

function successorState(
  state: TeamFormationStateV1,
  policy: TeamFormationPolicyRecordV1,
  team: TeamRecordV1,
  logicalTimeMs: number,
): TeamFormationStateV1 {
  return createTeamFormationStateV1({
    stateKey: state.stateKey,
    formationId: state.formationId,
    formationVersion: state.formationVersion,
    implementationId: state.implementationId,
    policy,
    revision: state.revision + 1,
    logicalTimeHighWaterMs: Math.max(
      state.logicalTimeHighWaterMs,
      logicalTimeMs,
    ),
    team,
    lastDecision: state.lastDecision,
    predecessorStateDigest: state.stateDigest,
  });
}

function compareBid(left: TeamPositionBidV1, right: TeamPositionBidV1): number {
  return (
    right.locallyEvaluatedScoreMicros - left.locallyEvaluatedScoreMicros ||
    left.budgetUnits - right.budgetUnits ||
    left.expectedCompletionAtLogicalMs - right.expectedCompletionAtLogicalMs ||
    compare(left.bidDigest, right.bidDigest)
  );
}

function compareRoster(
  left: readonly TeamPositionBidV1[],
  right: readonly TeamPositionBidV1[],
): number {
  const leftScore = sum(left.map((bid) => bid.locallyEvaluatedScoreMicros));
  const rightScore = sum(right.map((bid) => bid.locallyEvaluatedScoreMicros));
  const leftBudget = sum(left.map((bid) => bid.budgetUnits));
  const rightBudget = sum(right.map((bid) => bid.budgetUnits));
  const leftCompletion = Math.max(
    ...left.map((bid) => bid.expectedCompletionAtLogicalMs),
  );
  const rightCompletion = Math.max(
    ...right.map((bid) => bid.expectedCompletionAtLogicalMs),
  );
  return (
    rightScore - leftScore ||
    leftBudget - rightBudget ||
    leftCompletion - rightCompletion ||
    compare(
      left.map((bid) => bid.bidDigest).join("\u0000"),
      right.map((bid) => bid.bidDigest).join("\u0000"),
    )
  );
}

function deriveTeamId(
  scopeDigest: PlanningDigestV1,
  formationRequestDigest: PlanningDigestV1,
): string {
  const value = digestPlanningJsonV1("team-identity", {
    scopeDigest,
    formationRequestDigest,
  } as PlanningJson);
  return `team.${value.slice(7)}`;
}

function boundedReasons(
  values: ReadonlySet<string>,
  policy: TeamFormationPolicyRecordV1,
): readonly string[] {
  const result = [...values]
    .sort(compare)
    .slice(0, policy.policy.limits.maximumReasonCodesPerDecision);
  return freeze(result.length > 0 ? result : ["formation_denied"]);
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total))
      fail("team aggregate exceeds safe integer range");
  }
  return total;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function fail(message: string): never {
  throw new TypeError(message);
}
