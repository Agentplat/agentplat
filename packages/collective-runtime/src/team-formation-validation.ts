import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  TEAM_FORMATION_HANDOFF_FORMAT_V1,
  TEAM_FORMATION_SCHEMA_VERSION_V1,
  TEAM_FORMATION_STATE_FORMAT_V1,
  type JointWorkContractV1,
  type TeamEpochHistoryEntryV1,
  type TeamFormationDecisionStatusV1,
  type TeamFormationDecisionV1,
  type TeamFormationHandoffEnvelopeV1,
  type TeamFormationPolicyRecordV1,
  type TeamFormationPolicyV1,
  type TeamFormationRequestV1,
  type TeamFormationScopeV1,
  type TeamFormationStateV1,
  type TeamLifecycleStatusV1,
  type TeamMemberContractBindingV1,
  type TeamMemberOutcomeStatusV1,
  type TeamMemberOutcomeV1,
  type TeamMemberSelectionV1,
  type TeamPositionBidV1,
  type TeamPositionV1,
  type TeamProposalV1,
  type TeamRecordV1,
  type TeamReconfigurationRequestV1,
  type TeamCandidateV1,
} from "./team-formation-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-= ]{0,511}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const decisionStatuses = new Set<string>([
  "formed",
  "insufficient_coverage",
  "search_exhausted",
  "policy_denied",
]);
const lifecycleStatuses = new Set<string>([
  "awaiting_member_contracts",
  "active",
  "completed",
  "failed",
  "cancelled",
]);
const outcomeStatuses = new Set<string>([
  "success",
  "failure",
  "unsafe",
  "indeterminate",
]);

export function createTeamFormationPolicyV1(
  input: TeamFormationPolicyV1,
): TeamFormationPolicyRecordV1 {
  const policy = normalizePolicy(input);
  return freeze({
    schemaVersion: 1,
    policy,
    policyDigest: digest("team-formation-policy", policy),
  });
}

export function validateTeamFormationPolicyV1(
  input: unknown,
): TeamFormationPolicyRecordV1 {
  const value = exact(
    input,
    ["policy", "policyDigest", "schemaVersion"],
    "team formation policy record",
  );
  schema(value.schemaVersion, "team formation policy record");
  const policy = normalizePolicy(value.policy as TeamFormationPolicyV1);
  const policyDigest = digest("team-formation-policy", policy);
  if (value.policyDigest !== policyDigest)
    fail("team formation policy digest is invalid");
  return freeze({ schemaVersion: 1, policy, policyDigest });
}

export function createTeamFormationScopeV1(
  input: Omit<TeamFormationScopeV1, "scopeDigest">,
): TeamFormationScopeV1 {
  const body = freeze({
    tenantId: identifier(input.tenantId, "scope.tenantId"),
    meshId: identifier(input.meshId, "scope.meshId"),
    policyDomainId: identifier(input.policyDomainId, "scope.policyDomainId"),
    missionIntentId: identifier(input.missionIntentId, "scope.missionIntentId"),
    objectiveId: identifier(input.objectiveId, "scope.objectiveId"),
    rootWorkItemId: identifier(input.rootWorkItemId, "scope.rootWorkItemId"),
    rootWorkItemRevision: positive(
      input.rootWorkItemRevision,
      "scope.rootWorkItemRevision",
    ),
  });
  return freeze({ ...body, scopeDigest: digest("team-formation-scope", body) });
}

export function validateTeamFormationScopeV1(
  input: unknown,
): TeamFormationScopeV1 {
  const value = exact(
    input,
    [
      "meshId",
      "missionIntentId",
      "objectiveId",
      "policyDomainId",
      "rootWorkItemId",
      "rootWorkItemRevision",
      "scopeDigest",
      "tenantId",
    ],
    "team formation scope",
  );
  const result = createTeamFormationScopeV1({
    tenantId: value.tenantId as string,
    meshId: value.meshId as string,
    policyDomainId: value.policyDomainId as string,
    missionIntentId: value.missionIntentId as string,
    objectiveId: value.objectiveId as string,
    rootWorkItemId: value.rootWorkItemId as string,
    rootWorkItemRevision: value.rootWorkItemRevision as number,
  });
  if (value.scopeDigest !== result.scopeDigest)
    fail("team formation scope digest is invalid");
  return result;
}

export function createTeamPositionV1(
  input: Omit<TeamPositionV1, "positionDigest">,
): TeamPositionV1 {
  schema(input.schemaVersion, "team position");
  const requiredCapabilityKeys = identifiers(
    input.requiredCapabilityKeys,
    "position.requiredCapabilityKeys",
    256,
    1,
  );
  const completionCriteria = tokens(
    input.completionCriteria,
    "position.completionCriteria",
    256,
    1,
  );
  const dependsOnPositionIds = identifiers(
    input.dependsOnPositionIds,
    "position.dependsOnPositionIds",
    256,
    0,
  );
  const body = freeze({
    schemaVersion: 1 as const,
    positionId: identifier(input.positionId, "position.positionId"),
    workItemId: identifier(input.workItemId, "position.workItemId"),
    workItemRevision: positive(
      input.workItemRevision,
      "position.workItemRevision",
    ),
    roleKey: identifier(input.roleKey, "position.roleKey"),
    requiredCapabilityKeys,
    completionCriteria,
    dependsOnPositionIds,
    budgetUnits: positive(input.budgetUnits, "position.budgetUnits"),
    maximumActionBudgetUnits: positive(
      input.maximumActionBudgetUnits,
      "position.maximumActionBudgetUnits",
    ),
  });
  if (body.maximumActionBudgetUnits > body.budgetUnits)
    fail("team position action budget exceeds position budget");
  if (body.dependsOnPositionIds.includes(body.positionId))
    fail("team position cannot depend on itself");
  return freeze({
    ...body,
    positionDigest: digest("team-position", body),
  });
}

export function validateTeamPositionV1(input: unknown): TeamPositionV1 {
  const value = exact(
    input,
    [
      "budgetUnits",
      "completionCriteria",
      "dependsOnPositionIds",
      "maximumActionBudgetUnits",
      "positionDigest",
      "positionId",
      "requiredCapabilityKeys",
      "roleKey",
      "schemaVersion",
      "workItemId",
      "workItemRevision",
    ],
    "team position",
  );
  const result = createTeamPositionV1({
    schemaVersion: value.schemaVersion as 1,
    positionId: value.positionId as string,
    workItemId: value.workItemId as string,
    workItemRevision: value.workItemRevision as number,
    roleKey: value.roleKey as string,
    requiredCapabilityKeys: value.requiredCapabilityKeys as readonly string[],
    completionCriteria: value.completionCriteria as readonly string[],
    dependsOnPositionIds: value.dependsOnPositionIds as readonly string[],
    budgetUnits: value.budgetUnits as number,
    maximumActionBudgetUnits: value.maximumActionBudgetUnits as number,
  });
  if (value.positionDigest !== result.positionDigest)
    fail("team position digest is invalid");
  return result;
}

export function createTeamCandidateV1(
  input: Omit<TeamCandidateV1, "candidateDigest">,
): TeamCandidateV1 {
  schema(input.schemaVersion, "team candidate");
  const body = freeze({
    schemaVersion: 1 as const,
    candidateId: identifier(input.candidateId, "candidate.candidateId"),
    peerId: identifier(input.peerId, "candidate.peerId"),
    instanceId: identifier(input.instanceId, "candidate.instanceId"),
    independenceGroupId: identifier(
      input.independenceGroupId,
      "candidate.independenceGroupId",
    ),
    sourceCandidateDigest: sha(
      input.sourceCandidateDigest,
      "candidate.sourceCandidateDigest",
    ),
    sourceRequestDigest: sha(
      input.sourceRequestDigest,
      "candidate.sourceRequestDigest",
    ),
    sourceDecisionDigest: sha(
      input.sourceDecisionDigest,
      "candidate.sourceDecisionDigest",
    ),
    eligibleWorkItemId: identifier(
      input.eligibleWorkItemId,
      "candidate.eligibleWorkItemId",
    ),
    eligibleWorkItemRevision: positive(
      input.eligibleWorkItemRevision,
      "candidate.eligibleWorkItemRevision",
    ),
    requiredCapabilityKeys: identifiers(
      input.requiredCapabilityKeys,
      "candidate.requiredCapabilityKeys",
      256,
      1,
    ),
  });
  return freeze({
    ...body,
    candidateDigest: digest("team-candidate", body),
  });
}

export function validateTeamCandidateV1(input: unknown): TeamCandidateV1 {
  const value = exact(
    input,
    [
      "candidateDigest",
      "candidateId",
      "eligibleWorkItemId",
      "eligibleWorkItemRevision",
      "independenceGroupId",
      "instanceId",
      "peerId",
      "requiredCapabilityKeys",
      "schemaVersion",
      "sourceCandidateDigest",
      "sourceDecisionDigest",
      "sourceRequestDigest",
    ],
    "team candidate",
  );
  const result = createTeamCandidateV1({
    schemaVersion: value.schemaVersion as 1,
    candidateId: value.candidateId as string,
    peerId: value.peerId as string,
    instanceId: value.instanceId as string,
    independenceGroupId: value.independenceGroupId as string,
    sourceCandidateDigest: value.sourceCandidateDigest as PlanningDigestV1,
    sourceRequestDigest: value.sourceRequestDigest as PlanningDigestV1,
    sourceDecisionDigest: value.sourceDecisionDigest as PlanningDigestV1,
    eligibleWorkItemId: value.eligibleWorkItemId as string,
    eligibleWorkItemRevision: value.eligibleWorkItemRevision as number,
    requiredCapabilityKeys: value.requiredCapabilityKeys as readonly string[],
  });
  if (value.candidateDigest !== result.candidateDigest)
    fail("team candidate digest is invalid");
  return result;
}

export function createTeamPositionBidV1(
  input: Omit<TeamPositionBidV1, "bidDigest">,
): TeamPositionBidV1 {
  schema(input.schemaVersion, "team position bid");
  const body = freeze({
    schemaVersion: 1 as const,
    bidId: identifier(input.bidId, "bid.bidId"),
    positionId: identifier(input.positionId, "bid.positionId"),
    candidate: validateTeamCandidateV1(input.candidate),
    sourceBidDigest: sha(input.sourceBidDigest, "bid.sourceBidDigest"),
    capacityReservationUnits: positive(
      input.capacityReservationUnits,
      "bid.capacityReservationUnits",
    ),
    budgetUnits: positive(input.budgetUnits, "bid.budgetUnits"),
    expectedCompletionAtLogicalMs: nonNegative(
      input.expectedCompletionAtLogicalMs,
      "bid.expectedCompletionAtLogicalMs",
    ),
    locallyEvaluatedScoreMicros: integerRange(
      input.locallyEvaluatedScoreMicros,
      "bid.locallyEvaluatedScoreMicros",
      0,
      1_000_000,
    ),
    observedAtLogicalMs: nonNegative(
      input.observedAtLogicalMs,
      "bid.observedAtLogicalMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "bid.validUntilLogicalMs",
    ),
  });
  if (
    body.validUntilLogicalMs <= body.observedAtLogicalMs ||
    body.expectedCompletionAtLogicalMs < body.observedAtLogicalMs
  )
    fail("team position bid time window is invalid");
  return freeze({ ...body, bidDigest: digest("team-position-bid", body) });
}

export function validateTeamPositionBidV1(input: unknown): TeamPositionBidV1 {
  const value = exact(
    input,
    [
      "bidDigest",
      "bidId",
      "budgetUnits",
      "candidate",
      "capacityReservationUnits",
      "expectedCompletionAtLogicalMs",
      "locallyEvaluatedScoreMicros",
      "observedAtLogicalMs",
      "positionId",
      "schemaVersion",
      "sourceBidDigest",
      "validUntilLogicalMs",
    ],
    "team position bid",
  );
  const result = createTeamPositionBidV1({
    schemaVersion: value.schemaVersion as 1,
    bidId: value.bidId as string,
    positionId: value.positionId as string,
    candidate: value.candidate as TeamCandidateV1,
    sourceBidDigest: value.sourceBidDigest as PlanningDigestV1,
    capacityReservationUnits: value.capacityReservationUnits as number,
    budgetUnits: value.budgetUnits as number,
    expectedCompletionAtLogicalMs:
      value.expectedCompletionAtLogicalMs as number,
    locallyEvaluatedScoreMicros: value.locallyEvaluatedScoreMicros as number,
    observedAtLogicalMs: value.observedAtLogicalMs as number,
    validUntilLogicalMs: value.validUntilLogicalMs as number,
  });
  if (value.bidDigest !== result.bidDigest)
    fail("team position bid digest is invalid");
  return result;
}

export function createTeamFormationRequestV1(
  input: Omit<TeamFormationRequestV1, "requestDigest">,
): TeamFormationRequestV1 {
  schema(input.schemaVersion, "team formation request");
  const positions = sortedRecords(
    safeArray(input.positions, "request.positions", 256).map(
      validateTeamPositionV1,
    ),
    (value) => value.positionId,
    "request positions",
  );
  const bids = sortedRecords(
    safeArray(input.bids, "request.bids", 65_536).map(
      validateTeamPositionBidV1,
    ),
    (value) =>
      `${value.positionId}\u0000${value.candidate.candidateId}\u0000${value.bidId}`,
    "request bids",
  );
  const body = freeze({
    schemaVersion: 1 as const,
    requestId: identifier(input.requestId, "request.requestId"),
    scope: validateTeamFormationScopeV1(input.scope),
    membershipEpoch: positive(input.membershipEpoch, "request.membershipEpoch"),
    membershipConfigurationDigest: sha(
      input.membershipConfigurationDigest,
      "request.membershipConfigurationDigest",
    ),
    positions,
    bids,
    logicalTimeMs: nonNegative(input.logicalTimeMs, "request.logicalTimeMs"),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "request.validUntilLogicalMs",
    ),
  });
  validateRequestRelations(body);
  return freeze({
    ...body,
    requestDigest: digest("team-formation-request", body),
  });
}

export function validateTeamFormationRequestV1(
  input: unknown,
): TeamFormationRequestV1 {
  const value = exact(
    input,
    [
      "bids",
      "logicalTimeMs",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "positions",
      "requestDigest",
      "requestId",
      "schemaVersion",
      "scope",
      "validUntilLogicalMs",
    ],
    "team formation request",
  );
  const result = createTeamFormationRequestV1({
    schemaVersion: value.schemaVersion as 1,
    requestId: value.requestId as string,
    scope: value.scope as TeamFormationScopeV1,
    membershipEpoch: value.membershipEpoch as number,
    membershipConfigurationDigest:
      value.membershipConfigurationDigest as PlanningDigestV1,
    positions: value.positions as readonly TeamPositionV1[],
    bids: value.bids as readonly TeamPositionBidV1[],
    logicalTimeMs: value.logicalTimeMs as number,
    validUntilLogicalMs: value.validUntilLogicalMs as number,
  });
  if (value.requestDigest !== result.requestDigest)
    fail("team formation request digest is invalid");
  return result;
}

export function createTeamMemberSelectionV1(
  input: Omit<TeamMemberSelectionV1, "memberId" | "selectionDigest"> & {
    readonly teamId: string;
    readonly teamEpoch: number;
  },
): TeamMemberSelectionV1 {
  schema(input.schemaVersion, "team member selection");
  const identity = freeze({
    teamId: identifier(input.teamId, "selection.teamId"),
    teamEpoch: positive(input.teamEpoch, "selection.teamEpoch"),
    positionId: identifier(input.positionId, "selection.positionId"),
    candidateId: identifier(input.candidateId, "selection.candidateId"),
  });
  const memberIdentityDigest = digest("team-member-identity", identity);
  const body = freeze({
    schemaVersion: 1 as const,
    memberId: `team-member.${memberIdentityDigest.slice(7)}`,
    positionId: identity.positionId,
    positionDigest: sha(input.positionDigest, "selection.positionDigest"),
    candidateId: identity.candidateId,
    candidateDigest: sha(input.candidateDigest, "selection.candidateDigest"),
    peerId: identifier(input.peerId, "selection.peerId"),
    instanceId: identifier(input.instanceId, "selection.instanceId"),
    independenceGroupId: identifier(
      input.independenceGroupId,
      "selection.independenceGroupId",
    ),
    bidId: identifier(input.bidId, "selection.bidId"),
    bidDigest: sha(input.bidDigest, "selection.bidDigest"),
    sourceBidDigest: sha(input.sourceBidDigest, "selection.sourceBidDigest"),
    budgetUnits: positive(input.budgetUnits, "selection.budgetUnits"),
    expectedCompletionAtLogicalMs: nonNegative(
      input.expectedCompletionAtLogicalMs,
      "selection.expectedCompletionAtLogicalMs",
    ),
    locallyEvaluatedScoreMicros: integerRange(
      input.locallyEvaluatedScoreMicros,
      "selection.locallyEvaluatedScoreMicros",
      0,
      1_000_000,
    ),
  });
  return freeze({
    ...body,
    selectionDigest: digest("team-member-selection", body),
  });
}

export function validateTeamMemberSelectionV1(
  input: unknown,
): TeamMemberSelectionV1 {
  const value = exact(
    input,
    [
      "bidDigest",
      "bidId",
      "budgetUnits",
      "candidateDigest",
      "candidateId",
      "expectedCompletionAtLogicalMs",
      "independenceGroupId",
      "instanceId",
      "locallyEvaluatedScoreMicros",
      "memberId",
      "peerId",
      "positionDigest",
      "positionId",
      "schemaVersion",
      "selectionDigest",
      "sourceBidDigest",
    ],
    "team member selection",
  );
  schema(value.schemaVersion, "team member selection");
  const body = freeze({
    schemaVersion: 1 as const,
    memberId: identifier(value.memberId, "selection.memberId"),
    positionId: identifier(value.positionId, "selection.positionId"),
    positionDigest: sha(value.positionDigest, "selection.positionDigest"),
    candidateId: identifier(value.candidateId, "selection.candidateId"),
    candidateDigest: sha(value.candidateDigest, "selection.candidateDigest"),
    peerId: identifier(value.peerId, "selection.peerId"),
    instanceId: identifier(value.instanceId, "selection.instanceId"),
    independenceGroupId: identifier(
      value.independenceGroupId,
      "selection.independenceGroupId",
    ),
    bidId: identifier(value.bidId, "selection.bidId"),
    bidDigest: sha(value.bidDigest, "selection.bidDigest"),
    sourceBidDigest: sha(value.sourceBidDigest, "selection.sourceBidDigest"),
    budgetUnits: positive(value.budgetUnits, "selection.budgetUnits"),
    expectedCompletionAtLogicalMs: nonNegative(
      value.expectedCompletionAtLogicalMs,
      "selection.expectedCompletionAtLogicalMs",
    ),
    locallyEvaluatedScoreMicros: integerRange(
      value.locallyEvaluatedScoreMicros,
      "selection.locallyEvaluatedScoreMicros",
      0,
      1_000_000,
    ),
  });
  const selectionDigest = digest("team-member-selection", body);
  if (value.selectionDigest !== selectionDigest)
    fail("team member selection digest is invalid");
  return freeze({ ...body, selectionDigest });
}

export function createTeamProposalV1(
  input: Omit<TeamProposalV1, "teamId" | "proposalDigest"> & {
    readonly teamId?: string;
  },
): TeamProposalV1 {
  schema(input.schemaVersion, "team proposal");
  const scope = validateTeamFormationScopeV1(input.scope);
  const positions = sortedRecords(
    safeArray(input.positions, "proposal.positions", 256).map(
      validateTeamPositionV1,
    ),
    (value) => value.positionId,
    "proposal positions",
  );
  const teamSeed = freeze({
    scopeDigest: scope.scopeDigest,
    formationRequestDigest: sha(
      input.formationRequestDigest,
      "proposal.formationRequestDigest",
    ),
  });
  const derivedTeamId = `team.${digest("team-identity", teamSeed).slice(7)}`;
  const teamId = input.teamId
    ? identifier(input.teamId, "proposal.teamId")
    : derivedTeamId;
  if (input.teamEpoch === 1 && teamId !== derivedTeamId)
    fail("initial team identity is invalid");
  const members = sortedRecords(
    safeArray(input.members, "proposal.members", 256).map(
      validateTeamMemberSelectionV1,
    ),
    (value) => value.positionId,
    "proposal members",
  );
  const body = freeze({
    schemaVersion: 1 as const,
    teamId,
    teamEpoch: positive(input.teamEpoch, "proposal.teamEpoch"),
    scope,
    policyDigest: sha(input.policyDigest, "proposal.policyDigest"),
    membershipEpoch: positive(
      input.membershipEpoch,
      "proposal.membershipEpoch",
    ),
    membershipConfigurationDigest: sha(
      input.membershipConfigurationDigest,
      "proposal.membershipConfigurationDigest",
    ),
    formationRequestDigest: teamSeed.formationRequestDigest,
    predecessorJointWorkContractDigest:
      input.predecessorJointWorkContractDigest === null
        ? null
        : sha(
            input.predecessorJointWorkContractDigest,
            "proposal.predecessorJointWorkContractDigest",
          ),
    positions,
    members,
    totalBudgetUnits: positive(
      input.totalBudgetUnits,
      "proposal.totalBudgetUnits",
    ),
    expectedCompletionAtLogicalMs: nonNegative(
      input.expectedCompletionAtLogicalMs,
      "proposal.expectedCompletionAtLogicalMs",
    ),
    proposedAtLogicalMs: nonNegative(
      input.proposedAtLogicalMs,
      "proposal.proposedAtLogicalMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "proposal.validUntilLogicalMs",
    ),
  });
  validateProposalRelations(body);
  return freeze({
    ...body,
    proposalDigest: digest("team-proposal", body),
  });
}

export function validateTeamProposalV1(input: unknown): TeamProposalV1 {
  const value = exact(
    input,
    [
      "expectedCompletionAtLogicalMs",
      "formationRequestDigest",
      "members",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "policyDigest",
      "positions",
      "predecessorJointWorkContractDigest",
      "proposalDigest",
      "proposedAtLogicalMs",
      "schemaVersion",
      "scope",
      "teamEpoch",
      "teamId",
      "totalBudgetUnits",
      "validUntilLogicalMs",
    ],
    "team proposal",
  );
  const result = createTeamProposalV1({
    schemaVersion: value.schemaVersion as 1,
    teamId: value.teamId as string,
    teamEpoch: value.teamEpoch as number,
    scope: value.scope as TeamFormationScopeV1,
    policyDigest: value.policyDigest as PlanningDigestV1,
    membershipEpoch: value.membershipEpoch as number,
    membershipConfigurationDigest:
      value.membershipConfigurationDigest as PlanningDigestV1,
    formationRequestDigest: value.formationRequestDigest as PlanningDigestV1,
    predecessorJointWorkContractDigest:
      value.predecessorJointWorkContractDigest as PlanningDigestV1 | null,
    positions: value.positions as readonly TeamPositionV1[],
    members: value.members as readonly TeamMemberSelectionV1[],
    totalBudgetUnits: value.totalBudgetUnits as number,
    expectedCompletionAtLogicalMs:
      value.expectedCompletionAtLogicalMs as number,
    proposedAtLogicalMs: value.proposedAtLogicalMs as number,
    validUntilLogicalMs: value.validUntilLogicalMs as number,
  });
  if (value.proposalDigest !== result.proposalDigest)
    fail("team proposal digest is invalid");
  return result;
}

export function createTeamMemberContractBindingV1(
  input: Omit<TeamMemberContractBindingV1, "bindingDigest">,
): TeamMemberContractBindingV1 {
  schema(input.schemaVersion, "team member contract binding");
  const body = freeze({
    schemaVersion: 1 as const,
    memberId: identifier(input.memberId, "memberContract.memberId"),
    selectionDigest: sha(
      input.selectionDigest,
      "memberContract.selectionDigest",
    ),
    positionId: identifier(input.positionId, "memberContract.positionId"),
    peerId: identifier(input.peerId, "memberContract.peerId"),
    instanceId: identifier(input.instanceId, "memberContract.instanceId"),
    workItemId: identifier(input.workItemId, "memberContract.workItemId"),
    workItemRevision: positive(
      input.workItemRevision,
      "memberContract.workItemRevision",
    ),
    workContractId: identifier(
      input.workContractId,
      "memberContract.workContractId",
    ),
    workContractGeneration: positive(
      input.workContractGeneration,
      "memberContract.workContractGeneration",
    ),
    workContractDigest: sha(
      input.workContractDigest,
      "memberContract.workContractDigest",
    ),
    assignmentAuthorityId: identifier(
      input.assignmentAuthorityId,
      "memberContract.assignmentAuthorityId",
    ),
    assignmentEpoch: positive(
      input.assignmentEpoch,
      "memberContract.assignmentEpoch",
    ),
    authorityGeneration: positive(
      input.authorityGeneration,
      "memberContract.authorityGeneration",
    ),
    fencingToken: identifier(input.fencingToken, "memberContract.fencingToken"),
    leaseExpiresAtLogicalMs: positive(
      input.leaseExpiresAtLogicalMs,
      "memberContract.leaseExpiresAtLogicalMs",
    ),
    workDeadline: timestamp(input.workDeadline, "memberContract.workDeadline"),
    roleKey: identifier(input.roleKey, "memberContract.roleKey"),
    requiredCapabilityKeys: identifiers(
      input.requiredCapabilityKeys,
      "memberContract.requiredCapabilityKeys",
      256,
      1,
    ),
    reservedBudgetUnits: positive(
      input.reservedBudgetUnits,
      "memberContract.reservedBudgetUnits",
    ),
    maximumActionBudgetUnits: positive(
      input.maximumActionBudgetUnits,
      "memberContract.maximumActionBudgetUnits",
    ),
  });
  if (body.maximumActionBudgetUnits > body.reservedBudgetUnits)
    fail("team member contract budget is invalid");
  return freeze({
    ...body,
    bindingDigest: digest("team-member-contract-binding", body),
  });
}

export function validateTeamMemberContractBindingV1(
  input: unknown,
): TeamMemberContractBindingV1 {
  const value = exact(
    input,
    [
      "assignmentAuthorityId",
      "assignmentEpoch",
      "authorityGeneration",
      "bindingDigest",
      "fencingToken",
      "instanceId",
      "leaseExpiresAtLogicalMs",
      "maximumActionBudgetUnits",
      "memberId",
      "peerId",
      "positionId",
      "requiredCapabilityKeys",
      "reservedBudgetUnits",
      "roleKey",
      "schemaVersion",
      "selectionDigest",
      "workContractDigest",
      "workContractGeneration",
      "workContractId",
      "workDeadline",
      "workItemId",
      "workItemRevision",
    ],
    "team member contract binding",
  );
  const result = createTeamMemberContractBindingV1({
    schemaVersion: value.schemaVersion as 1,
    memberId: value.memberId as string,
    selectionDigest: value.selectionDigest as PlanningDigestV1,
    positionId: value.positionId as string,
    peerId: value.peerId as string,
    instanceId: value.instanceId as string,
    workItemId: value.workItemId as string,
    workItemRevision: value.workItemRevision as number,
    workContractId: value.workContractId as string,
    workContractGeneration: value.workContractGeneration as number,
    workContractDigest: value.workContractDigest as PlanningDigestV1,
    assignmentAuthorityId: value.assignmentAuthorityId as string,
    assignmentEpoch: value.assignmentEpoch as number,
    authorityGeneration: value.authorityGeneration as number,
    fencingToken: value.fencingToken as string,
    leaseExpiresAtLogicalMs: value.leaseExpiresAtLogicalMs as number,
    workDeadline: value.workDeadline as string,
    roleKey: value.roleKey as string,
    requiredCapabilityKeys: value.requiredCapabilityKeys as readonly string[],
    reservedBudgetUnits: value.reservedBudgetUnits as number,
    maximumActionBudgetUnits: value.maximumActionBudgetUnits as number,
  });
  if (value.bindingDigest !== result.bindingDigest)
    fail("team member contract binding digest is invalid");
  return result;
}

export function createJointWorkContractV1(input: {
  readonly proposal: TeamProposalV1;
  readonly memberContracts: readonly TeamMemberContractBindingV1[];
  readonly activatedAtLogicalMs: number;
}): JointWorkContractV1 {
  const proposal = validateTeamProposalV1(input.proposal);
  const memberContracts = sortedRecords(
    safeArray(input.memberContracts, "joint member contracts", 256).map(
      validateTeamMemberContractBindingV1,
    ),
    (value) => value.positionId,
    "joint member contracts",
  );
  const activatedAtLogicalMs = nonNegative(
    input.activatedAtLogicalMs,
    "joint.activatedAtLogicalMs",
  );
  validateJointRelations(proposal, memberContracts, activatedAtLogicalMs);
  const validUntilLogicalMs = Math.min(
    ...memberContracts.map((value) => value.leaseExpiresAtLogicalMs),
  );
  const body = freeze({
    schemaVersion: 1 as const,
    teamId: proposal.teamId,
    teamEpoch: proposal.teamEpoch,
    proposalDigest: proposal.proposalDigest,
    predecessorJointWorkContractDigest:
      proposal.predecessorJointWorkContractDigest,
    scopeDigest: proposal.scope.scopeDigest,
    memberContracts,
    totalReservedBudgetUnits: sum(
      memberContracts.map((value) => value.reservedBudgetUnits),
      "joint reserved budget",
    ),
    totalMaximumActionBudgetUnits: sum(
      memberContracts.map((value) => value.maximumActionBudgetUnits),
      "joint action budget",
    ),
    activatedAtLogicalMs,
    validUntilLogicalMs,
    status: "active" as const,
  });
  const jointWorkContractDigest = digest("joint-work-contract", body);
  return freeze({
    ...body,
    jointWorkContractId: `joint-work-contract.${jointWorkContractDigest.slice(7)}`,
    jointWorkContractDigest,
  });
}

export function validateJointWorkContractV1(
  input: unknown,
): JointWorkContractV1 {
  const value = exact(
    input,
    [
      "activatedAtLogicalMs",
      "jointWorkContractDigest",
      "jointWorkContractId",
      "memberContracts",
      "predecessorJointWorkContractDigest",
      "proposalDigest",
      "schemaVersion",
      "scopeDigest",
      "status",
      "teamEpoch",
      "teamId",
      "totalMaximumActionBudgetUnits",
      "totalReservedBudgetUnits",
      "validUntilLogicalMs",
    ],
    "joint work contract",
  );
  schema(value.schemaVersion, "joint work contract");
  if (value.status !== "active") fail("joint work contract status is invalid");
  const memberContracts = sortedRecords(
    safeArray(value.memberContracts, "joint member contracts", 256).map(
      validateTeamMemberContractBindingV1,
    ),
    (member) => member.positionId,
    "joint member contracts",
  );
  const body = freeze({
    schemaVersion: 1 as const,
    teamId: identifier(value.teamId, "joint.teamId"),
    teamEpoch: positive(value.teamEpoch, "joint.teamEpoch"),
    proposalDigest: sha(value.proposalDigest, "joint.proposalDigest"),
    predecessorJointWorkContractDigest:
      value.predecessorJointWorkContractDigest === null
        ? null
        : sha(
            value.predecessorJointWorkContractDigest,
            "joint.predecessorJointWorkContractDigest",
          ),
    scopeDigest: sha(value.scopeDigest, "joint.scopeDigest"),
    memberContracts,
    totalReservedBudgetUnits: positive(
      value.totalReservedBudgetUnits,
      "joint.totalReservedBudgetUnits",
    ),
    totalMaximumActionBudgetUnits: positive(
      value.totalMaximumActionBudgetUnits,
      "joint.totalMaximumActionBudgetUnits",
    ),
    activatedAtLogicalMs: nonNegative(
      value.activatedAtLogicalMs,
      "joint.activatedAtLogicalMs",
    ),
    validUntilLogicalMs: positive(
      value.validUntilLogicalMs,
      "joint.validUntilLogicalMs",
    ),
    status: "active" as const,
  });
  if (
    body.totalReservedBudgetUnits !==
      sum(
        body.memberContracts.map((member) => member.reservedBudgetUnits),
        "joint reserved budget",
      ) ||
    body.totalMaximumActionBudgetUnits !==
      sum(
        body.memberContracts.map((member) => member.maximumActionBudgetUnits),
        "joint action budget",
      ) ||
    body.validUntilLogicalMs <= body.activatedAtLogicalMs
  )
    fail("joint work contract totals are invalid");
  const jointWorkContractDigest = digest("joint-work-contract", body);
  if (
    value.jointWorkContractDigest !== jointWorkContractDigest ||
    value.jointWorkContractId !==
      `joint-work-contract.${jointWorkContractDigest.slice(7)}`
  )
    fail("joint work contract binding is invalid");
  return freeze({
    ...body,
    jointWorkContractId: value.jointWorkContractId as string,
    jointWorkContractDigest,
  });
}

export function createTeamMemberOutcomeV1(
  input: Omit<TeamMemberOutcomeV1, "outcomeId" | "outcomeDigest">,
): TeamMemberOutcomeV1 {
  schema(input.schemaVersion, "team member outcome");
  const body = freeze({
    schemaVersion: 1 as const,
    teamId: identifier(input.teamId, "outcome.teamId"),
    teamEpoch: positive(input.teamEpoch, "outcome.teamEpoch"),
    jointWorkContractDigest: sha(
      input.jointWorkContractDigest,
      "outcome.jointWorkContractDigest",
    ),
    memberId: identifier(input.memberId, "outcome.memberId"),
    memberBindingDigest: sha(
      input.memberBindingDigest,
      "outcome.memberBindingDigest",
    ),
    status: outcomeStatus(input.status),
    sourceResultDigest: sha(
      input.sourceResultDigest,
      "outcome.sourceResultDigest",
    ),
    observedAtLogicalMs: nonNegative(
      input.observedAtLogicalMs,
      "outcome.observedAtLogicalMs",
    ),
  });
  const outcomeDigest = digest("team-member-outcome", body);
  return freeze({
    ...body,
    outcomeId: `team-member-outcome.${outcomeDigest.slice(7)}`,
    outcomeDigest,
  });
}

export function validateTeamMemberOutcomeV1(
  input: unknown,
): TeamMemberOutcomeV1 {
  const value = exact(
    input,
    [
      "jointWorkContractDigest",
      "memberBindingDigest",
      "memberId",
      "observedAtLogicalMs",
      "outcomeDigest",
      "outcomeId",
      "schemaVersion",
      "sourceResultDigest",
      "status",
      "teamEpoch",
      "teamId",
    ],
    "team member outcome",
  );
  const result = createTeamMemberOutcomeV1({
    schemaVersion: value.schemaVersion as 1,
    teamId: value.teamId as string,
    teamEpoch: value.teamEpoch as number,
    jointWorkContractDigest: value.jointWorkContractDigest as PlanningDigestV1,
    memberId: value.memberId as string,
    memberBindingDigest: value.memberBindingDigest as PlanningDigestV1,
    status: value.status as TeamMemberOutcomeStatusV1,
    sourceResultDigest: value.sourceResultDigest as PlanningDigestV1,
    observedAtLogicalMs: value.observedAtLogicalMs as number,
  });
  if (
    value.outcomeId !== result.outcomeId ||
    value.outcomeDigest !== result.outcomeDigest
  )
    fail("team member outcome binding is invalid");
  return result;
}

export function createTeamFormationDecisionV1(
  input: Omit<TeamFormationDecisionV1, "decisionId" | "decisionDigest">,
): TeamFormationDecisionV1 {
  schema(input.schemaVersion, "team formation decision");
  const body = freeze({
    schemaVersion: 1 as const,
    requestDigest: sha(input.requestDigest, "decision.requestDigest"),
    status: decisionStatus(input.status),
    proposal:
      input.proposal === null ? null : validateTeamProposalV1(input.proposal),
    exploredSearchNodes: nonNegative(
      input.exploredSearchNodes,
      "decision.exploredSearchNodes",
    ),
    reasonCodes: identifiers(input.reasonCodes, "decision.reasonCodes", 256, 1),
    evaluatedAtLogicalMs: nonNegative(
      input.evaluatedAtLogicalMs,
      "decision.evaluatedAtLogicalMs",
    ),
    priorStateRevision: nonNegative(
      input.priorStateRevision,
      "decision.priorStateRevision",
    ),
    committedStateRevision: nonNegative(
      input.committedStateRevision,
      "decision.committedStateRevision",
    ),
  });
  if (
    body.committedStateRevision !== body.priorStateRevision + 1 ||
    (body.status === "formed") !== (body.proposal !== null)
  )
    fail("team formation decision transition is invalid");
  const decisionDigest = digest("team-formation-decision", body);
  return freeze({
    ...body,
    decisionId: `team-formation-decision.${decisionDigest.slice(7)}`,
    decisionDigest,
  });
}

export function validateTeamFormationDecisionV1(
  input: unknown,
): TeamFormationDecisionV1 {
  const value = exact(
    input,
    [
      "committedStateRevision",
      "decisionDigest",
      "decisionId",
      "evaluatedAtLogicalMs",
      "exploredSearchNodes",
      "priorStateRevision",
      "proposal",
      "reasonCodes",
      "requestDigest",
      "schemaVersion",
      "status",
    ],
    "team formation decision",
  );
  const result = createTeamFormationDecisionV1({
    schemaVersion: value.schemaVersion as 1,
    requestDigest: value.requestDigest as PlanningDigestV1,
    status: value.status as TeamFormationDecisionStatusV1,
    proposal: value.proposal as TeamProposalV1 | null,
    exploredSearchNodes: value.exploredSearchNodes as number,
    reasonCodes: value.reasonCodes as readonly string[],
    evaluatedAtLogicalMs: value.evaluatedAtLogicalMs as number,
    priorStateRevision: value.priorStateRevision as number,
    committedStateRevision: value.committedStateRevision as number,
  });
  if (
    value.decisionId !== result.decisionId ||
    value.decisionDigest !== result.decisionDigest
  )
    fail("team formation decision binding is invalid");
  return result;
}

export function createTeamRecordV1(input: TeamRecordV1): TeamRecordV1 {
  const value = normalizeTeamRecord(input);
  return freeze(value);
}

export function validateTeamRecordV1(input: unknown): TeamRecordV1 {
  return freeze(normalizeTeamRecord(input));
}

export function createTeamFormationStateV1(input: {
  readonly stateKey: string;
  readonly formationId: string;
  readonly formationVersion: number;
  readonly implementationId: string;
  readonly policy: TeamFormationPolicyRecordV1;
  readonly revision?: number;
  readonly logicalTimeHighWaterMs?: number;
  readonly team?: TeamRecordV1 | null;
  readonly lastDecision?: TeamFormationDecisionV1 | null;
  readonly predecessorStateDigest?: PlanningDigestV1 | null;
}): TeamFormationStateV1 {
  const policy = validateTeamFormationPolicyV1(input.policy);
  const body = freeze({
    format: TEAM_FORMATION_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: identifier(input.stateKey, "state.stateKey"),
    formationId: identifier(input.formationId, "state.formationId"),
    formationVersion: positive(
      input.formationVersion,
      "state.formationVersion",
    ),
    implementationId: identifier(
      input.implementationId,
      "state.implementationId",
    ),
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.policyVersion,
    policyDigest: policy.policyDigest,
    revision: nonNegative(input.revision ?? 0, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs ?? 0,
      "state.logicalTimeHighWaterMs",
    ),
    team: input.team ? validateTeamRecordV1(input.team) : null,
    lastDecision: input.lastDecision
      ? validateTeamFormationDecisionV1(input.lastDecision)
      : null,
    predecessorStateDigest:
      input.predecessorStateDigest === undefined ||
      input.predecessorStateDigest === null
        ? null
        : sha(input.predecessorStateDigest, "state.predecessorStateDigest"),
  });
  if (
    body.team &&
    (body.team.proposal.positions.length >
      policy.policy.limits.maximumPositions ||
      body.team.proposal.members.length > policy.policy.limits.maximumMembers ||
      body.team.history.length > policy.policy.limits.maximumHistoryEntries ||
      body.team.proposal.totalBudgetUnits >
        policy.policy.maximumTotalBudgetUnits)
  )
    fail("team formation state exceeds policy bounds");
  validateStateRelations(body);
  return freeze({ ...body, stateDigest: digest("team-formation-state", body) });
}

export function validateTeamFormationStateV1(
  input: unknown,
  options: { readonly policy: TeamFormationPolicyRecordV1 },
): TeamFormationStateV1 {
  const value = exact(
    input,
    [
      "format",
      "formationId",
      "formationVersion",
      "implementationId",
      "lastDecision",
      "logicalTimeHighWaterMs",
      "policyDigest",
      "policyId",
      "policyVersion",
      "predecessorStateDigest",
      "revision",
      "schemaVersion",
      "stateDigest",
      "stateKey",
      "team",
    ],
    "team formation state",
  );
  if (value.format !== TEAM_FORMATION_STATE_FORMAT_V1)
    fail("team formation state format is invalid");
  const policy = validateTeamFormationPolicyV1(options.policy);
  const result = createTeamFormationStateV1({
    stateKey: value.stateKey as string,
    formationId: value.formationId as string,
    formationVersion: value.formationVersion as number,
    implementationId: value.implementationId as string,
    policy,
    revision: value.revision as number,
    logicalTimeHighWaterMs: value.logicalTimeHighWaterMs as number,
    team: value.team as TeamRecordV1 | null,
    lastDecision: value.lastDecision as TeamFormationDecisionV1 | null,
    predecessorStateDigest:
      value.predecessorStateDigest as PlanningDigestV1 | null,
  });
  if (
    value.schemaVersion !== 1 ||
    value.policyId !== policy.policy.policyId ||
    value.policyVersion !== policy.policy.policyVersion ||
    value.policyDigest !== policy.policyDigest ||
    value.stateDigest !== result.stateDigest
  )
    fail("team formation state binding is invalid");
  return result;
}

export function createTeamReconfigurationRequestV1(
  input: Omit<TeamReconfigurationRequestV1, "requestDigest">,
): TeamReconfigurationRequestV1 {
  schema(input.schemaVersion, "team reconfiguration request");
  const replacementBids = sortedRecords(
    safeArray(
      input.replacementBids,
      "reconfiguration.replacementBids",
      65_536,
    ).map(validateTeamPositionBidV1),
    (bid) =>
      `${bid.positionId}\u0000${bid.candidate.candidateId}\u0000${bid.bidId}`,
    "reconfiguration replacement bids",
  );
  const body = freeze({
    schemaVersion: 1 as const,
    requestId: identifier(input.requestId, "reconfiguration.requestId"),
    currentJointWorkContractDigest: sha(
      input.currentJointWorkContractDigest,
      "reconfiguration.currentJointWorkContractDigest",
    ),
    failedMemberId: identifier(
      input.failedMemberId,
      "reconfiguration.failedMemberId",
    ),
    reasonCode: identifier(input.reasonCode, "reconfiguration.reasonCode"),
    membershipEpoch: positive(
      input.membershipEpoch,
      "reconfiguration.membershipEpoch",
    ),
    membershipConfigurationDigest: sha(
      input.membershipConfigurationDigest,
      "reconfiguration.membershipConfigurationDigest",
    ),
    replacementBids,
    logicalTimeMs: nonNegative(
      input.logicalTimeMs,
      "reconfiguration.logicalTimeMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "reconfiguration.validUntilLogicalMs",
    ),
  });
  if (
    body.validUntilLogicalMs <= body.logicalTimeMs ||
    body.replacementBids.length === 0
  )
    fail("team reconfiguration request window is invalid");
  return freeze({
    ...body,
    requestDigest: digest("team-reconfiguration-request", body),
  });
}

export function validateTeamReconfigurationRequestV1(
  input: unknown,
): TeamReconfigurationRequestV1 {
  const value = exact(
    input,
    [
      "currentJointWorkContractDigest",
      "failedMemberId",
      "logicalTimeMs",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "reasonCode",
      "replacementBids",
      "requestDigest",
      "requestId",
      "schemaVersion",
      "validUntilLogicalMs",
    ],
    "team reconfiguration request",
  );
  const result = createTeamReconfigurationRequestV1({
    schemaVersion: value.schemaVersion as 1,
    requestId: value.requestId as string,
    currentJointWorkContractDigest:
      value.currentJointWorkContractDigest as PlanningDigestV1,
    failedMemberId: value.failedMemberId as string,
    reasonCode: value.reasonCode as string,
    membershipEpoch: value.membershipEpoch as number,
    membershipConfigurationDigest:
      value.membershipConfigurationDigest as PlanningDigestV1,
    replacementBids: value.replacementBids as readonly TeamPositionBidV1[],
    logicalTimeMs: value.logicalTimeMs as number,
    validUntilLogicalMs: value.validUntilLogicalMs as number,
  });
  if (value.requestDigest !== result.requestDigest)
    fail("team reconfiguration request digest is invalid");
  return result;
}

export function createTeamFormationHandoffV1(input: {
  readonly sourceState: TeamFormationStateV1;
  readonly targetStateKey: string;
  readonly exportedAtLogicalMs: number;
  readonly policy: TeamFormationPolicyRecordV1;
}): TeamFormationHandoffEnvelopeV1 {
  const sourceState = validateTeamFormationStateV1(input.sourceState, {
    policy: input.policy,
  });
  const body = freeze({
    format: TEAM_FORMATION_HANDOFF_FORMAT_V1,
    schemaVersion: 1 as const,
    contentClass: "team_formation_state" as const,
    formationId: sourceState.formationId,
    formationVersion: sourceState.formationVersion,
    implementationId: sourceState.implementationId,
    policyDigest: sourceState.policyDigest,
    sourceStateKey: sourceState.stateKey,
    sourceStateDigest: sourceState.stateDigest,
    targetStateKey: identifier(input.targetStateKey, "handoff.targetStateKey"),
    exportedAtLogicalMs: nonNegative(
      input.exportedAtLogicalMs,
      "handoff.exportedAtLogicalMs",
    ),
    sourceState,
  });
  if (
    body.targetStateKey === body.sourceStateKey ||
    body.exportedAtLogicalMs < sourceState.logicalTimeHighWaterMs
  )
    fail("team formation handoff target or time is invalid");
  return freeze({
    ...body,
    handoffDigest: digest("team-formation-handoff", body),
  });
}

export function validateTeamFormationHandoffV1(
  input: unknown,
  options: { readonly policy: TeamFormationPolicyRecordV1 },
): TeamFormationHandoffEnvelopeV1 {
  const value = exact(
    input,
    [
      "contentClass",
      "exportedAtLogicalMs",
      "format",
      "formationId",
      "formationVersion",
      "handoffDigest",
      "implementationId",
      "policyDigest",
      "schemaVersion",
      "sourceState",
      "sourceStateDigest",
      "sourceStateKey",
      "targetStateKey",
    ],
    "team formation handoff",
  );
  if (
    value.format !== TEAM_FORMATION_HANDOFF_FORMAT_V1 ||
    value.contentClass !== "team_formation_state" ||
    value.schemaVersion !== 1
  )
    fail("team formation handoff format is invalid");
  const sourceState = validateTeamFormationStateV1(value.sourceState, options);
  const result = createTeamFormationHandoffV1({
    sourceState,
    targetStateKey: value.targetStateKey as string,
    exportedAtLogicalMs: value.exportedAtLogicalMs as number,
    policy: options.policy,
  });
  if (
    value.formationId !== sourceState.formationId ||
    value.formationVersion !== sourceState.formationVersion ||
    value.implementationId !== sourceState.implementationId ||
    value.policyDigest !== sourceState.policyDigest ||
    value.sourceStateKey !== sourceState.stateKey ||
    value.sourceStateDigest !== sourceState.stateDigest ||
    value.handoffDigest !== result.handoffDigest
  )
    fail("team formation handoff binding is invalid");
  return result;
}

function normalizePolicy(input: TeamFormationPolicyV1): TeamFormationPolicyV1 {
  const value = exact(
    input,
    [
      "limits",
      "maximumTotalBudgetUnits",
      "minimumDistinctPeers",
      "minimumIndependenceGroups",
      "parentPolicyDigest",
      "policyId",
      "policyVersion",
      "requireDistinctPeerPerPosition",
      "schemaVersion",
    ],
    "team formation policy",
  );
  schema(value.schemaVersion, "team formation policy");
  const limitValue = exact(
    value.limits,
    [
      "maximumBidsPerPosition",
      "maximumCommitAttempts",
      "maximumHistoryEntries",
      "maximumMembers",
      "maximumPositions",
      "maximumReasonCodesPerDecision",
      "maximumRequestTtlMs",
      "maximumSearchNodes",
      "maximumTeamDurationMs",
    ],
    "team formation limits",
  );
  const limits = freeze({
    maximumPositions: bounded(
      limitValue.maximumPositions,
      "limits.maximumPositions",
      256,
    ),
    maximumBidsPerPosition: bounded(
      limitValue.maximumBidsPerPosition,
      "limits.maximumBidsPerPosition",
      4096,
    ),
    maximumMembers: bounded(
      limitValue.maximumMembers,
      "limits.maximumMembers",
      256,
    ),
    maximumSearchNodes: bounded(
      limitValue.maximumSearchNodes,
      "limits.maximumSearchNodes",
      10_000_000,
    ),
    maximumReasonCodesPerDecision: bounded(
      limitValue.maximumReasonCodesPerDecision,
      "limits.maximumReasonCodesPerDecision",
      256,
    ),
    maximumHistoryEntries: bounded(
      limitValue.maximumHistoryEntries,
      "limits.maximumHistoryEntries",
      1024,
    ),
    maximumRequestTtlMs: bounded(
      limitValue.maximumRequestTtlMs,
      "limits.maximumRequestTtlMs",
      30 * 86_400_000,
    ),
    maximumTeamDurationMs: bounded(
      limitValue.maximumTeamDurationMs,
      "limits.maximumTeamDurationMs",
      365 * 86_400_000,
    ),
    maximumCommitAttempts: bounded(
      limitValue.maximumCommitAttempts,
      "limits.maximumCommitAttempts",
      64,
    ),
  });
  if (limits.maximumMembers < limits.maximumPositions)
    fail("team formation member limit must cover positions");
  const policy = freeze({
    schemaVersion: 1 as const,
    policyId: identifier(value.policyId, "policy.policyId"),
    policyVersion: positive(value.policyVersion, "policy.policyVersion"),
    parentPolicyDigest:
      value.parentPolicyDigest === null
        ? null
        : sha(value.parentPolicyDigest, "policy.parentPolicyDigest"),
    minimumDistinctPeers: bounded(
      value.minimumDistinctPeers,
      "policy.minimumDistinctPeers",
      limits.maximumMembers,
    ),
    minimumIndependenceGroups: bounded(
      value.minimumIndependenceGroups,
      "policy.minimumIndependenceGroups",
      limits.maximumMembers,
    ),
    maximumTotalBudgetUnits: positive(
      value.maximumTotalBudgetUnits,
      "policy.maximumTotalBudgetUnits",
    ),
    requireDistinctPeerPerPosition: bool(
      value.requireDistinctPeerPerPosition,
      "policy.requireDistinctPeerPerPosition",
    ),
    limits,
  });
  return policy;
}

function normalizeTeamRecord(input: unknown): TeamRecordV1 {
  const value = exact(
    input,
    [
      "history",
      "jointWorkContract",
      "outcomes",
      "proposal",
      "schemaVersion",
      "status",
      "teamEpoch",
      "teamId",
      "updatedAtLogicalMs",
    ],
    "team record",
  );
  schema(value.schemaVersion, "team record");
  const proposal = validateTeamProposalV1(value.proposal);
  const jointWorkContract =
    value.jointWorkContract === null
      ? null
      : validateJointWorkContractV1(value.jointWorkContract);
  const outcomes = sortedRecords(
    safeArray(value.outcomes, "team outcomes", 256).map(
      validateTeamMemberOutcomeV1,
    ),
    (outcome) => outcome.memberId,
    "team outcomes",
  );
  const history = safeArray(value.history, "team history", 1024).map(
    validateHistoryEntry,
  );
  const record = freeze({
    schemaVersion: 1 as const,
    teamId: identifier(value.teamId, "team.teamId"),
    teamEpoch: positive(value.teamEpoch, "team.teamEpoch"),
    status: lifecycleStatus(value.status),
    proposal,
    jointWorkContract,
    outcomes,
    history: freeze(history),
    updatedAtLogicalMs: nonNegative(
      value.updatedAtLogicalMs,
      "team.updatedAtLogicalMs",
    ),
  });
  if (
    record.teamId !== proposal.teamId ||
    record.teamEpoch !== proposal.teamEpoch ||
    (record.status === "awaiting_member_contracts" &&
      jointWorkContract !== null) ||
    ((record.status === "active" ||
      record.status === "completed" ||
      record.status === "failed") &&
      jointWorkContract === null) ||
    (jointWorkContract !== null &&
      (jointWorkContract.teamId !== record.teamId ||
        jointWorkContract.teamEpoch !== record.teamEpoch ||
        jointWorkContract.proposalDigest !== proposal.proposalDigest)) ||
    record.outcomes.some(
      (outcome) =>
        outcome.teamId !== record.teamId ||
        outcome.teamEpoch !== record.teamEpoch ||
        jointWorkContract === null ||
        outcome.jointWorkContractDigest !==
          jointWorkContract.jointWorkContractDigest,
    )
  )
    fail("team record binding is invalid");
  return record;
}

function validateHistoryEntry(input: unknown): TeamEpochHistoryEntryV1 {
  const value = exact(
    input,
    [
      "closedAtLogicalMs",
      "jointWorkContractDigest",
      "proposalDigest",
      "reasonCode",
      "schemaVersion",
      "status",
      "teamEpoch",
    ],
    "team epoch history entry",
  );
  schema(value.schemaVersion, "team epoch history entry");
  return freeze({
    schemaVersion: 1,
    teamEpoch: positive(value.teamEpoch, "history.teamEpoch"),
    proposalDigest: sha(value.proposalDigest, "history.proposalDigest"),
    jointWorkContractDigest:
      value.jointWorkContractDigest === null
        ? null
        : sha(value.jointWorkContractDigest, "history.jointWorkContractDigest"),
    status: lifecycleStatus(value.status),
    closedAtLogicalMs: nonNegative(
      value.closedAtLogicalMs,
      "history.closedAtLogicalMs",
    ),
    reasonCode: identifier(value.reasonCode, "history.reasonCode"),
  });
}

function validateRequestRelations(
  request: Omit<TeamFormationRequestV1, "requestDigest">,
): void {
  if (
    request.positions.length === 0 ||
    request.validUntilLogicalMs <= request.logicalTimeMs
  )
    fail("team formation request window or positions are invalid");
  const positions = new Map(
    request.positions.map((position) => [position.positionId, position]),
  );
  for (const position of request.positions) {
    for (const dependency of position.dependsOnPositionIds)
      if (!positions.has(dependency))
        fail("team position dependency is outside request");
  }
  assertAcyclic(request.positions);
  const bidIds = new Set<string>();
  const bidCandidatePositions = new Set<string>();
  for (const bid of request.bids) {
    const position = positions.get(bid.positionId);
    if (!position) fail("team bid position is outside request");
    if (
      bid.candidate.eligibleWorkItemId !== position.workItemId ||
      bid.candidate.eligibleWorkItemRevision !== position.workItemRevision ||
      !position.requiredCapabilityKeys.every((key) =>
        bid.candidate.requiredCapabilityKeys.includes(key),
      )
    )
      fail("team candidate eligibility is not bound to bid position");
    if (
      bid.observedAtLogicalMs > request.logicalTimeMs ||
      bid.validUntilLogicalMs <= request.logicalTimeMs
    )
      fail("team bid is not current for request");
    if (bidIds.has(bid.bidId)) fail("team bid IDs contain duplicates");
    bidIds.add(bid.bidId);
    const key = `${bid.positionId}\u0000${bid.candidate.candidateId}`;
    if (bidCandidatePositions.has(key))
      fail("team candidate has multiple current bids for one position");
    bidCandidatePositions.add(key);
  }
}

function validateProposalRelations(
  proposal: Omit<TeamProposalV1, "proposalDigest">,
): void {
  if (
    proposal.positions.length === 0 ||
    proposal.members.length !== proposal.positions.length ||
    proposal.validUntilLogicalMs <= proposal.proposedAtLogicalMs ||
    proposal.expectedCompletionAtLogicalMs < proposal.proposedAtLogicalMs
  )
    fail("team proposal coverage or window is invalid");
  if (
    (proposal.teamEpoch === 1) !==
    (proposal.predecessorJointWorkContractDigest === null)
  )
    fail("team proposal predecessor is invalid");
  const positions = new Map(
    proposal.positions.map((position) => [position.positionId, position]),
  );
  let budget = 0;
  let latest = 0;
  for (const member of proposal.members) {
    const position = positions.get(member.positionId);
    if (!position || position.positionDigest !== member.positionDigest)
      fail("team proposal member position binding is invalid");
    budget = safeAdd(budget, member.budgetUnits, "proposal budget");
    latest = Math.max(latest, member.expectedCompletionAtLogicalMs);
  }
  if (
    budget !== proposal.totalBudgetUnits ||
    latest !== proposal.expectedCompletionAtLogicalMs
  )
    fail("team proposal totals are invalid");
}

function validateJointRelations(
  proposal: TeamProposalV1,
  contracts: readonly TeamMemberContractBindingV1[],
  logicalTimeMs: number,
): void {
  if (
    contracts.length !== proposal.members.length ||
    logicalTimeMs < proposal.proposedAtLogicalMs ||
    logicalTimeMs >= proposal.validUntilLogicalMs
  )
    fail("joint work contract coverage or time is invalid");
  const positions = new Map(
    proposal.positions.map((position) => [position.positionId, position]),
  );
  const selections = new Map(
    proposal.members.map((member) => [member.positionId, member]),
  );
  for (const contract of contracts) {
    const position = positions.get(contract.positionId);
    const selection = selections.get(contract.positionId);
    if (
      !position ||
      !selection ||
      contract.memberId !== selection.memberId ||
      contract.selectionDigest !== selection.selectionDigest ||
      contract.peerId !== selection.peerId ||
      contract.instanceId !== selection.instanceId ||
      contract.workItemId !== position.workItemId ||
      contract.workItemRevision !== position.workItemRevision ||
      contract.roleKey !== position.roleKey ||
      !position.requiredCapabilityKeys.every((key) =>
        contract.requiredCapabilityKeys.includes(key),
      ) ||
      contract.reservedBudgetUnits < memberBudgetFloor(position, selection) ||
      contract.maximumActionBudgetUnits < position.maximumActionBudgetUnits ||
      contract.leaseExpiresAtLogicalMs <= logicalTimeMs
    )
      fail("joint work contract member binding is invalid");
  }
}

function memberBudgetFloor(
  position: TeamPositionV1,
  selection: TeamMemberSelectionV1,
): number {
  return Math.min(position.budgetUnits, selection.budgetUnits);
}

function validateStateRelations(
  state: Omit<TeamFormationStateV1, "stateDigest">,
): void {
  if (state.revision === 0) {
    if (
      state.team !== null ||
      state.lastDecision !== null ||
      state.predecessorStateDigest !== null
    )
      fail("initial team formation state is invalid");
    return;
  }
  if (state.predecessorStateDigest === null)
    fail("team formation state predecessor is missing");
  if (
    state.lastDecision !== null &&
    state.lastDecision.committedStateRevision > state.revision
  )
    fail("team formation state decision revision is invalid");
  if (
    state.team &&
    state.team.updatedAtLogicalMs > state.logicalTimeHighWaterMs
  )
    fail("team formation state logical time is invalid");
}

function assertAcyclic(positions: readonly TeamPositionV1[]): void {
  const byId = new Map(
    positions.map((position) => [position.positionId, position]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (positionId: string): void => {
    if (visiting.has(positionId)) fail("team position graph contains a cycle");
    if (visited.has(positionId)) return;
    visiting.add(positionId);
    for (const dependency of byId.get(positionId)!.dependsOnPositionIds)
      visit(dependency);
    visiting.delete(positionId);
    visited.add(positionId);
  };
  for (const position of positions) visit(position.positionId);
}

function digest(
  domain: PlanningDigestDomainV1,
  value: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1(domain, value as PlanningJson);
}

function exact(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Object.getOwnPropertySymbols(input).length > 0
  )
    fail(`${label} is invalid`);
  const value = input as Record<string, unknown>;
  const actual = Object.getOwnPropertyNames(value).sort(compare);
  const expected = [...keys].sort(compare);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} shape is invalid`);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      fail(`${label} shape is invalid`);
  }
  return value;
}

function safeArray(input: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(input)) fail(`${label} is invalid`);
  const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > maximum ||
    Object.getOwnPropertySymbols(input).length > 0 ||
    Object.getOwnPropertyNames(input).length !== length + 1
  )
    fail(`${label} is invalid`);
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      fail(`${label} is invalid`);
    result.push(descriptor.value);
  }
  return result;
}

function sortedRecords<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): readonly T[] {
  const result = [...values].sort((left, right) =>
    compare(key(left), key(right)),
  );
  for (let index = 1; index < result.length; index += 1)
    if (key(result[index - 1]!) === key(result[index]!))
      fail(`${label} contain duplicates`);
  return freeze(result);
}

function identifiers(
  input: unknown,
  label: string,
  maximum: number,
  minimum: number,
): readonly string[] {
  const values = safeArray(input, label, maximum).map((value, index) =>
    identifier(value, `${label}[${index}]`),
  );
  if (values.length < minimum) fail(`${label} has too few entries`);
  return sortedUnique(values, label);
}

function tokens(
  input: unknown,
  label: string,
  maximum: number,
  minimum: number,
): readonly string[] {
  const values = safeArray(input, label, maximum).map((value, index) =>
    token(value, `${label}[${index}]`),
  );
  if (values.length < minimum) fail(`${label} has too few entries`);
  return sortedUnique(values, label);
}

function sortedUnique(
  values: readonly string[],
  label: string,
): readonly string[] {
  const result = [...values].sort(compare);
  if (new Set(result).size !== result.length)
    fail(`${label} contain duplicates`);
  return freeze(result);
}

function identifier(input: unknown, label: string): string {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}

function token(input: unknown, label: string): string {
  if (typeof input !== "string" || !TOKEN.test(input))
    fail(`${label} is invalid`);
  return input;
}

function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function timestamp(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input) ||
    new Date(input).toISOString() !== input
  )
    fail(`${label} is invalid`);
  return input;
}

function schema(input: unknown, label: string): void {
  if (input !== TEAM_FORMATION_SCHEMA_VERSION_V1)
    fail(`${label} schema is invalid`);
}

function decisionStatus(input: unknown): TeamFormationDecisionStatusV1 {
  if (typeof input !== "string" || !decisionStatuses.has(input))
    fail("team formation decision status is invalid");
  return input as TeamFormationDecisionStatusV1;
}

function lifecycleStatus(input: unknown): TeamLifecycleStatusV1 {
  if (typeof input !== "string" || !lifecycleStatuses.has(input))
    fail("team lifecycle status is invalid");
  return input as TeamLifecycleStatusV1;
}

function outcomeStatus(input: unknown): TeamMemberOutcomeStatusV1 {
  if (typeof input !== "string" || !outcomeStatuses.has(input))
    fail("team member outcome status is invalid");
  return input as TeamMemberOutcomeStatusV1;
}

function positive(input: unknown, label: string): number {
  return integerRange(input, label, 1, Number.MAX_SAFE_INTEGER);
}

function nonNegative(input: unknown, label: string): number {
  return integerRange(input, label, 0, Number.MAX_SAFE_INTEGER);
}

function bounded(input: unknown, label: string, maximum: number): number {
  return integerRange(input, label, 1, maximum);
}

function integerRange(
  input: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(input) ||
    (input as number) < minimum ||
    (input as number) > maximum
  )
    fail(`${label} is invalid`);
  return input as number;
}

function bool(input: unknown, label: string): boolean {
  if (typeof input !== "boolean") fail(`${label} is invalid`);
  return input;
}

function sum(values: readonly number[], label: string): number {
  return values.reduce((total, value) => safeAdd(total, value, label), 0);
}

function safeAdd(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) fail(`${label} exceeds safe integer range`);
  return value;
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
