import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import { workContractDigestV1 } from "@agentplat/collective-control/mesh";
import {
  DistributedTeamAllocationRuntimeV2,
  InMemoryDistributedTeamAllocationStoreV2,
  distributedTeamFormationAuthorizationDigestV2,
} from "@agentplat/collective-runtime/distributed-team-allocation";
import {
  createCollectiveDecisionCandidateV1,
  createCollectiveDecisionCertificateV1,
  createCollectiveDecisionScopeV1,
  createCollectiveDecisionV1,
} from "@agentplat/collective-runtime/collective-decision";
import {
  createTeamCandidateV1,
  createTeamFormationDecisionV1,
  createTeamFormationRequestV1,
  createTeamFormationRequestInvalidationV1,
  createTeamFormationScopeV1,
  createJointWorkContractV1,
  createTeamMemberContractBindingFromWorkContractV1,
  createTeamMemberSelectionV1,
  createTeamPositionBidV1,
  createTeamPositionV1,
  createTeamProposalV1,
} from "@agentplat/collective-runtime/team-formation";
import {
  createMechanismAllocationWithdrawalV1,
  mechanismAllocationEventDigestV1,
} from "@agentplat/collective-runtime/mechanism-allocation";

const sha = (value) => digestPlanningJsonV1("mission-observation", { value });

function collectiveScopeFor(teamScope) {
  return createCollectiveDecisionScopeV1({
    tenantId: teamScope.tenantId,
    meshId: teamScope.meshId,
    policyDomainId: teamScope.policyDomainId,
    missionIntentId: teamScope.missionIntentId,
    objectiveId: teamScope.objectiveId,
    workItemId: teamScope.rootWorkItemId,
    workItemRevision: teamScope.rootWorkItemRevision,
  });
}

const defaultTeamScope = createTeamFormationScopeV1({
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission",
  objectiveId: "objective",
  rootWorkItemId: "work.root",
  rootWorkItemRevision: 1,
});
const decisionScope = collectiveScopeFor(defaultTeamScope);

function rosterDecision(input, plan, acceptedAtLogicalMs) {
  const candidate = createCollectiveDecisionCandidateV1({
    schemaVersion: 1,
    candidateId: `${input.stateKey}.roster.${plan.planDigest.slice(7, 23)}`,
    decisionKind: "team_roster",
    scope: input.decisionBinding.scope,
    epoch: input.decisionBinding.epoch,
    membershipDigest: input.decisionBinding.membershipDigest,
    membershipMemberIds: input.decisionBinding.membershipMemberIds,
    proposerId: input.decisionBinding.proposerId,
    payloadDigest: plan.planDigest,
    preparedAtLogicalMs: plan.decidedAtLogicalMs,
    expiresAtLogicalMs: input.planning.validUntilLogicalMs,
  });
  const certificate = createCollectiveDecisionCertificateV1({
    schemaVersion: 1,
    certificateId: `${input.stateKey}.certificate.${plan.planDigest.slice(7, 23)}`,
    candidateDigest: candidate.candidateDigest,
    scopeDigest: candidate.scope.scopeDigest,
    epoch: candidate.epoch,
    membershipDigest: candidate.membershipDigest,
    certificationMode: "local",
    issuerId: input.decisionBinding.proposerId,
    attesterIds: [],
    evidence: [],
    certificationProofDigest: null,
    issuedAtLogicalMs: acceptedAtLogicalMs,
    expiresAtLogicalMs: input.planning.validUntilLogicalMs,
  });
  return createCollectiveDecisionV1({
    schemaVersion: 1,
    decisionId: `${input.stateKey}.decision.${plan.planDigest.slice(7, 23)}`,
    decisionPlaneId: "test.decision-plane",
    decisionPlaneVersion: 1,
    implementationId: "test.decision-implementation",
    policyId: "test.decision-policy",
    policyVersion: 1,
    policyDigest: sha("test-decision-policy"),
    candidate,
    certificate,
    acceptedAtLogicalMs,
    expiresAtLogicalMs: certificate.expiresAtLogicalMs,
    priorStateRevision: 0,
    committedStateRevision: 1,
  });
}

function options(overrides = {}) {
  const planningDigest = sha("planning");
  const scopeDigest = defaultTeamScope.scopeDigest;
  const allocationState = { stateDigest: sha("allocation-state"), proposal: null };
  return {
    stateKey: "allocation-saga",
    planning: {
      planningId: "planner",
      planningRevision: 1,
      planningDigest,
      scope: defaultTeamScope,
      membershipEpoch: 1,
      membershipConfigurationDigest: sha("membership"),
      positions: [],
      validUntilLogicalMs: 100,
    },
    proposal: {
      proposalDigest: sha("proposal"),
      scope: { planningDigest, teamFormationScope: { scopeDigest } },
      slots: [],
    },
    decisionBinding: {
      scope: decisionScope,
      epoch: 1,
      membershipDigest: sha("membership"),
      membershipMemberIds: ["peer"],
      proposerId: "peer",
    },
    allocation: {
      async loadState() { return allocationState; },
      async submit() { return allocationState; },
    },
    decision: {
      async decide() { throw new Error("not reached"); },
      async verify({ certificate }) { return certificate; },
    },
    formation: { async form() { throw new Error("not reached"); }, async invalidate() { throw new Error("not reached"); }, async cancel() { throw new Error("not reached"); }, async loadState() { throw new Error("not reached"); } },
    activation: {
      async reconcile() { return null; },
      async activate() { throw new Error("not reached"); },
      async cancel() {},
    },
    events: {
      async admit({ event }) { return { event, admission: { eventDigest: sha("admission") } }; },
      async clear() { throw new Error("not reached"); },
      async withdrawal() { throw new Error("not reached"); },
    },
    candidates: { async resolve() { throw new Error("not reached"); } },
    workContracts: { async resolve() { return []; } },
    store: new InMemoryDistributedTeamAllocationStoreV2(),
    maximumCommitAttempts: 3,
    ...overrides,
  };
}

test("rejects planning and mechanism scope mismatches before beginning the saga", () => {
  const input = options();
  input.proposal.scope.teamFormationScope.scopeDigest = sha("different-scope");
  assert.throws(
    () => new DistributedTeamAllocationRuntimeV2(input),
    /scope is invalid/,
  );
});

test("durably records proposal admission before waiting for distributed bids", async () => {
  let admissions = 0;
  const input = options({
    events: {
      async admit({ event }) {
        admissions += 1;
        return { event, admission: { eventDigest: sha("wrong-admission") } };
      },
      async clear() { throw new Error("not reached"); },
      async withdrawal() { throw new Error("not reached"); },
    },
  });
  const runtime = new DistributedTeamAllocationRuntimeV2(input);
  const state = await runtime.advance({ logicalTimeMs: 1 });
  assert.equal(admissions, 1);
  assert.equal(state.phase, "awaiting_allocation");
  assert.equal(state.revision, 1);
});

test("ignores a retired plan and rejects a wrong fence in the current round", async () => {
  const proposalDigest = sha("proposal");
  const allocationState = {
    stateDigest: sha("allocation-state.retired-plan"),
    proposal: { proposalDigest },
    auction: {
      roundDigest: sha("auction.current"),
      proposalDigest,
      round: 2,
    },
    plan: {
      planDigest: sha("plan.retired"),
      auctionDigest: sha("auction.retired"),
      proposalDigest,
      round: 1,
      decidedAtLogicalMs: 1,
      unallocatedSlotIds: [],
      selections: [],
    },
  };
  const input = options({
    allocation: {
      async loadState() { return allocationState; },
      async submit() { throw new Error("not reached"); },
    },
  });
  const runtime = new DistributedTeamAllocationRuntimeV2(input);
  const awaiting = await runtime.advance({ logicalTimeMs: 1 });
  assert.equal(awaiting.phase, "awaiting_allocation");
  const stillAwaiting = await runtime.advance({ logicalTimeMs: 2 });
  assert.equal(stillAwaiting.phase, "awaiting_allocation");
  assert.equal(stillAwaiting.allocationPlanDigest, null);

  allocationState.plan = {
    ...allocationState.plan,
    round: allocationState.auction.round,
  };
  const blocked = await runtime.advance({ logicalTimeMs: 3 });
  assert.equal(blocked.phase, "blocked");
  assert.equal(blocked.lastReasonCode, "allocation_fence_invalid");
  assert.equal(blocked.allocationPlanDigest, null);
});

test("rejects a replayed activation contract at its exclusive expiry", async () => {
  const scope = createTeamFormationScopeV1({
    tenantId: "tenant",
    meshId: "mesh",
    policyDomainId: "policy-domain",
    missionIntentId: "mission",
    objectiveId: "objective",
    rootWorkItemId: "work.activation",
    rootWorkItemRevision: 1,
  });
  const position = createTeamPositionV1({
    schemaVersion: 1,
    positionId: "position.activation",
    workItemId: "work.activation",
    workItemRevision: 1,
    roleKey: "worker",
    requiredCapabilityKeys: ["work"],
    completionCriteria: ["done"],
    dependsOnPositionIds: [],
    budgetUnits: 10,
    maximumActionBudgetUnits: 5,
  });
  const candidate = createTeamCandidateV1({
    schemaVersion: 1,
    candidateId: "candidate.activation",
    peerId: "peer.activation",
    instanceId: "instance.activation",
    independenceGroupId: "group.activation",
    sourceCandidateDigest: sha("activation-candidate"),
    sourceRequestDigest: sha("activation-request-source"),
    sourceDecisionDigest: sha("activation-decision-source"),
    eligibleWorkItemId: position.workItemId,
    eligibleWorkItemRevision: position.workItemRevision,
    requiredCapabilityKeys: position.requiredCapabilityKeys,
  });
  const positionBid = createTeamPositionBidV1({
    schemaVersion: 1,
    bidId: "allocation-saga.bid.position.activation.1",
    positionId: position.positionId,
    candidate,
    sourceBidDigest: sha("activation-bid"),
    capacityReservationUnits: 1,
    budgetUnits: 10,
    expectedCompletionAtLogicalMs: 4,
    locallyEvaluatedScoreMicros: 50,
    observedAtLogicalMs: 3,
    validUntilLogicalMs: 100,
  });
  const formationRequest = createTeamFormationRequestV1({
    schemaVersion: 1,
    requestId: `allocation-saga.formation.${sha("allocation-plan").slice(7, 23)}`,
    scope,
    membershipEpoch: 1,
    membershipConfigurationDigest: sha("membership"),
    positions: [position],
    bids: [positionBid],
    logicalTimeMs: 3,
    validUntilLogicalMs: 100,
  });
  const selection = createTeamMemberSelectionV1({
    schemaVersion: 1,
    teamId: `team.${digestPlanningJsonV1("team-identity", {
      scopeDigest: scope.scopeDigest,
      formationRequestDigest: formationRequest.requestDigest,
    }).slice(7)}`,
    teamEpoch: 1,
    positionId: position.positionId,
    positionDigest: position.positionDigest,
    candidateId: candidate.candidateId,
    candidateDigest: candidate.candidateDigest,
    peerId: candidate.peerId,
    instanceId: candidate.instanceId,
    independenceGroupId: candidate.independenceGroupId,
    bidId: positionBid.bidId,
    bidDigest: positionBid.bidDigest,
    sourceBidDigest: positionBid.sourceBidDigest,
    budgetUnits: positionBid.budgetUnits,
    expectedCompletionAtLogicalMs: positionBid.expectedCompletionAtLogicalMs,
    locallyEvaluatedScoreMicros: positionBid.locallyEvaluatedScoreMicros,
  });
  const formedProposal = createTeamProposalV1({
    schemaVersion: 1,
    teamEpoch: 1,
    scope,
    policyDigest: sha("formation-policy"),
    membershipEpoch: formationRequest.membershipEpoch,
    membershipConfigurationDigest:
      formationRequest.membershipConfigurationDigest,
    formationRequestDigest: formationRequest.requestDigest,
    predecessorJointWorkContractDigest: null,
    positions: [position],
    members: [selection],
    totalBudgetUnits: positionBid.budgetUnits,
    expectedCompletionAtLogicalMs:
      positionBid.expectedCompletionAtLogicalMs,
    proposedAtLogicalMs: formationRequest.logicalTimeMs,
    validUntilLogicalMs: formationRequest.validUntilLogicalMs,
  });
  const concurrentFormationDecision = createTeamFormationDecisionV1({
    schemaVersion: 1,
    requestDigest: sha("concurrent-formation-request"),
    status: "policy_denied",
    proposal: null,
    exploredSearchNodes: 0,
    reasonCodes: ["concurrent_request_rejected"],
    evaluatedAtLogicalMs: formationRequest.logicalTimeMs + 1,
    priorStateRevision: 1,
    committedStateRevision: 2,
  });
  const activationFormationState = {
    // Another request may overwrite lastDecision while the exact Team remains
    // current. Reconciliation and cleanup must discover the Team proposal.
    lastDecision: concurrentFormationDecision,
    team: {
      teamId: formedProposal.teamId,
      teamEpoch: formedProposal.teamEpoch,
      status: "awaiting_member_contracts",
      proposal: formedProposal,
    },
  };
  const workBody = {
    schemaVersion: 1,
    workContractId: "work-contract.activation",
    generation: 1,
    tenantId: scope.tenantId,
    policyDomainId: scope.policyDomainId,
    mandate: {
      schemaVersion: 1,
      mandateId: "mandate.activation",
      mandateRevision: 1,
      mandateDigest: sha("activation-mandate"),
    },
    objective: {
      schemaVersion: 1,
      meshId: scope.meshId,
      objectiveId: scope.objectiveId,
      objectiveDocumentId: "objective-document.activation",
      objectiveRevision: 1,
      acceptedMessageId: "objective-message.activation",
      acceptedPolicyDigest: sha("activation-objective-policy"),
    },
    assignment: {
      schemaVersion: 1,
      workItemId: position.workItemId,
      workItemRevision: position.workItemRevision,
      ownerPeerId: "peer.owner",
      assignedPeerId: candidate.peerId,
      assignedInstanceId: candidate.instanceId,
      assignmentAuthorityId: "authority.activation",
      assignmentEpoch: 1,
      authorityGeneration: 1,
      fencingToken: "fence.activation",
      leaseExpiresAtLogicalMs: 30,
      workDeadline: "2030-01-01T00:00:00.000Z",
    },
    roleKey: position.roleKey,
    requiredCapabilityKeys: position.requiredCapabilityKeys,
    completionCriteria: position.completionCriteria,
    inputReferenceDigest: null,
    reservedBudgetUnits: position.budgetUnits,
    maximumActionBudgetUnits: position.maximumActionBudgetUnits,
    trustPolicyId: "trust-policy",
    inferencePolicyId: "inference-policy",
    createdAtLogicalMs: 3,
    updatedAtLogicalMs: 3,
    status: "active",
    terminalReasonCode: null,
  };
  const workContract = {
    ...workBody,
    workContractDigest: workContractDigestV1(workBody),
  };
  const expiredContract = createJointWorkContractV1({
    proposal: formedProposal,
    memberContracts: [createTeamMemberContractBindingFromWorkContractV1({
      proposal: formedProposal,
      workContract,
      logicalTimeMs: 3,
    })],
    activatedAtLogicalMs: 3,
  });
  const plan = {
    planDigest: sha("allocation-plan"),
    auctionDigest: sha("activation-auction"),
    proposalDigest: sha("proposal"),
    round: 1,
    decidedAtLogicalMs: 3,
    unallocatedSlotIds: [],
    selections: [{
      slotId: position.positionId,
      bidderPeerId: candidate.peerId,
      bidderInstanceId: candidate.instanceId,
      bidderIndependenceGroupId: candidate.independenceGroupId,
      revealDigest: positionBid.sourceBidDigest,
      declaredResourceUnits: positionBid.capacityReservationUnits,
      declaredBudgetUnits: positionBid.budgetUnits,
      declaredUtilityMicros: positionBid.locallyEvaluatedScoreMicros,
    }],
  };
  const allocationState = {
    stateDigest: sha("allocation-state.active"),
    proposal: { proposalDigest: plan.proposalDigest },
    auction: {
      roundDigest: plan.auctionDigest,
      proposalDigest: plan.proposalDigest,
      round: plan.round,
    },
    plan,
  };
  let workContractTime = null;
  let activationTime = null;
  let activationFence = null;
  let recoveredContract = null;
  let cancelledContractDigest = null;
  let cancelledActivationFormationProposal = null;
  const activationCleanupOrder = [];
  let withdrawalReason = null;
  const input = options({
    planning: {
      planningId: "planner",
      planningRevision: 1,
      planningDigest: sha("planning"),
      scope,
      membershipEpoch: 1,
      membershipConfigurationDigest: sha("membership"),
      positions: [position],
      validUntilLogicalMs: 100,
    },
    proposal: {
      proposalDigest: sha("proposal"),
      scope: {
        planningDigest: sha("planning"),
        teamFormationScope: { scopeDigest: scope.scopeDigest },
      },
      slots: [{
        slotId: position.positionId,
        semanticRoleKey: position.roleKey,
        requiredCapabilityKeys: position.requiredCapabilityKeys,
        budgetCeilingUnits: position.budgetUnits,
      }],
    },
    decisionBinding: {
      scope: collectiveScopeFor(scope),
      epoch: 1,
      membershipDigest: sha("membership"),
      membershipMemberIds: ["peer"],
      proposerId: "peer",
    },
    allocation: {
      async loadState() { return allocationState; },
      async submit() { return allocationState; },
    },
    formation: {
      async form() { throw new Error("not reached"); },
      async invalidate(input) {
        activationCleanupOrder.push("invalidation");
        const { logicalTimeMs, ...material } = input;
        return createTeamFormationRequestInvalidationV1({
          schemaVersion: 1,
          ...material,
          invalidatedAtLogicalMs: logicalTimeMs,
        });
      },
      async cancel({ expectedProposalDigest }) {
        activationCleanupOrder.push("formation");
        cancelledActivationFormationProposal = expectedProposalDigest;
        activationFormationState.team.status = "cancelled";
        return activationFormationState.team;
      },
      async loadState() { return activationFormationState; },
    },
    activation: {
      async reconcile() { return recoveredContract; },
      async activate({ fence, logicalTimeMs }) {
        activationFence = fence;
        activationTime = logicalTimeMs;
        activationFormationState.team.status = "active";
        recoveredContract = expiredContract;
        return expiredContract;
      },
      async cancel({ jointWorkContractDigest }) {
        activationCleanupOrder.push("activation");
        cancelledContractDigest = jointWorkContractDigest;
        recoveredContract = null;
      },
    },
    workContracts: {
      async resolve({ logicalTimeMs }) {
        workContractTime = logicalTimeMs;
        return [workContract];
      },
    },
    events: {
      async admit() { throw new Error("not reached"); },
      async clear() { throw new Error("not reached"); },
      async withdrawal({ reasonCode, logicalTimeMs }) {
        withdrawalReason = reasonCode;
        const event = {
          kind: "withdrawal",
          withdrawal: createMechanismAllocationWithdrawalV1({
            withdrawalId: "activation-replay-withdrawal",
            auctionDigest: sha("activation-auction"),
            round: 1,
            peerId: "peer.activation",
            peerInstanceId: "instance.activation",
            peerIndependenceGroupId: "group.activation",
            affectedSlotIds: ["slot.activation"],
            reasonCode,
            observedAtLogicalMs: logicalTimeMs,
          }),
        };
        return {
          event,
          admission: {
            eventDigest: mechanismAllocationEventDigestV1(event),
          },
        };
      },
    },
  });
  const decision = rosterDecision(input, plan, 3);
  const formationAuthorizationDigest =
    distributedTeamFormationAuthorizationDigestV2({
      stateKey: input.stateKey,
      planningDigest: input.planning.planningDigest,
      proposalDigest: input.proposal.proposalDigest,
      allocationStateDigest: allocationState.stateDigest,
      allocationAuctionDigest: plan.auctionDigest,
      allocationRound: plan.round,
      allocationPlanDigest: plan.planDigest,
      decision,
      decisionDigest: decision.decisionDigest,
    }, formationRequest);
  assert.notEqual(
    formationAuthorizationDigest,
    distributedTeamFormationAuthorizationDigestV2({
      stateKey: input.stateKey,
      planningDigest: input.planning.planningDigest,
      proposalDigest: input.proposal.proposalDigest,
      allocationStateDigest: sha("allocation-state.advanced"),
      allocationAuctionDigest: plan.auctionDigest,
      allocationRound: plan.round,
      allocationPlanDigest: plan.planDigest,
      decision,
      decisionDigest: decision.decisionDigest,
    }, formationRequest),
  );
  const body = {
    format: "application/vnd.agentplat.distributed-team-allocation-state.v2+json",
    schemaVersion: 2,
    stateKey: input.stateKey,
    planningDigest: input.planning.planningDigest,
    proposalDigest: input.proposal.proposalDigest,
    revision: 1,
    logicalTimeHighWaterMs: 3,
    phase: "activation_pending",
    allocationStateDigest: allocationState.stateDigest,
    allocationAuctionDigest: plan.auctionDigest,
    allocationRound: plan.round,
    allocationPlanDigest: plan.planDigest,
    decision,
    decisionDigest: decision.decisionDigest,
    formationRequestId: formationRequest.requestId,
    formationRequestLogicalTimeMs: 3,
    formationRequest,
    formationRequestDigest: formationRequest.requestDigest,
    formationAuthorizationDigest,
    formationProposalDigest: formedProposal.proposalDigest,
    jointWorkContractDigest: null,
    reallocationCount: 0,
    lastReasonCode: null,
    predecessorStateDigest: sha("previous-state"),
  };
  await input.store.save({
    state: {
      ...body,
      stateDigest: digestPlanningJsonV1("collective-planning-snapshot", body),
    },
    expectedRevision: null,
    expectedStateDigest: null,
  });
  const runtime = new DistributedTeamAllocationRuntimeV2(input);
  const state = await runtime.advance({ logicalTimeMs: 40 });
  assert.equal(workContractTime, 40);
  assert.equal(activationTime, 40);
  assert.deepEqual(activationFence, {
    allocationStateDigest: allocationState.stateDigest,
    auctionDigest: plan.auctionDigest,
    allocationRound: plan.round,
    allocationPlanDigest: plan.planDigest,
  });
  assert.equal(cancelledContractDigest, expiredContract.jointWorkContractDigest);
  assert.equal(
    cancelledActivationFormationProposal,
    formedProposal.proposalDigest,
  );
  assert.deepEqual(activationCleanupOrder, [
    "activation",
    "invalidation",
    "formation",
  ]);
  assert.equal(withdrawalReason, "activation_rejected_or_expired");
  assert.equal(state.phase, "reallocation_pending");

  const formationReplayBody = {
    ...body,
    phase: "formation_pending",
    formationProposalDigest: null,
  };
  const formationReplayStore = new InMemoryDistributedTeamAllocationStoreV2();
  await formationReplayStore.save({
    state: {
      ...formationReplayBody,
      stateDigest: digestPlanningJsonV1(
        "collective-planning-snapshot",
        formationReplayBody,
      ),
    },
    expectedRevision: null,
    expectedStateDigest: null,
  });
  let replayedFormCalls = 0;
  const durableFormationState = {
    lastDecision: concurrentFormationDecision,
    team: {
      teamId: formedProposal.teamId,
      teamEpoch: formedProposal.teamEpoch,
      status: "awaiting_member_contracts",
      proposal: formedProposal,
    },
  };
  const formationReplayRuntime = new DistributedTeamAllocationRuntimeV2({
    ...input,
    store: formationReplayStore,
    formation: {
      async form() {
        replayedFormCalls += 1;
        throw new Error("must reconcile durable formation");
      },
      async invalidate() { throw new Error("not reached"); },
      async cancel() { throw new Error("not reached"); },
      async loadState() { return durableFormationState; },
    },
  });
  const reconciledFormation = await formationReplayRuntime.advance({
    logicalTimeMs: 10,
  });
  assert.equal(replayedFormCalls, 0);
  assert.equal(reconciledFormation.phase, "activation_pending");
  assert.equal(
    reconciledFormation.formationProposalDigest,
    formedProposal.proposalDigest,
  );

  const advancedAllocation = {
    ...allocationState,
    stateDigest: sha("allocation-state.next-round"),
    auction: {
      ...allocationState.auction,
      roundDigest: sha("activation-auction.next-round"),
      round: 2,
    },
    plan: null,
  };
  const formationCleanupStore = new InMemoryDistributedTeamAllocationStoreV2();
  await formationCleanupStore.save({
    state: {
      ...formationReplayBody,
      stateDigest: digestPlanningJsonV1(
        "collective-planning-snapshot",
        formationReplayBody,
      ),
    },
    expectedRevision: null,
    expectedStateDigest: null,
  });
  let cancelledFormationProposal = null;
  const formationCleanupOrder = [];
  const formationCleanupRuntime = new DistributedTeamAllocationRuntimeV2({
    ...input,
    store: formationCleanupStore,
    allocation: {
      async loadState() { return advancedAllocation; },
      async submit() { throw new Error("not reached"); },
    },
    formation: {
      async form() { throw new Error("not reached"); },
      async invalidate(input) {
        formationCleanupOrder.push("invalidation");
        const { logicalTimeMs, ...material } = input;
        return createTeamFormationRequestInvalidationV1({
          schemaVersion: 1,
          ...material,
          invalidatedAtLogicalMs: logicalTimeMs,
        });
      },
      async cancel({ expectedProposalDigest }) {
        formationCleanupOrder.push("formation");
        cancelledFormationProposal = expectedProposalDigest;
        durableFormationState.team.status = "cancelled";
        return durableFormationState.team;
      },
      async loadState() { return durableFormationState; },
    },
  });
  const cleanedFormation = await formationCleanupRuntime.advance({
    logicalTimeMs: 11,
  });
  assert.equal(cancelledFormationProposal, formedProposal.proposalDigest);
  assert.deepEqual(formationCleanupOrder, ["invalidation", "formation"]);
  assert.equal(cleanedFormation.phase, "awaiting_allocation");

  const emptyFormationCleanupStore =
    new InMemoryDistributedTeamAllocationStoreV2();
  await emptyFormationCleanupStore.save({
    state: {
      ...formationReplayBody,
      stateDigest: digestPlanningJsonV1(
        "collective-planning-snapshot",
        formationReplayBody,
      ),
    },
    expectedRevision: null,
    expectedStateDigest: null,
  });
  let invalidatedWithoutProposal = null;
  let emptyFormationCancelCalls = 0;
  const emptyFormationCleanupRuntime = new DistributedTeamAllocationRuntimeV2({
    ...input,
    store: emptyFormationCleanupStore,
    allocation: {
      async loadState() { return advancedAllocation; },
      async submit() { throw new Error("not reached"); },
    },
    formation: {
      async form() { throw new Error("not reached"); },
      async invalidate(input) {
        invalidatedWithoutProposal = input.formationRequestDigest;
        const { logicalTimeMs, ...material } = input;
        return createTeamFormationRequestInvalidationV1({
          schemaVersion: 1,
          ...material,
          invalidatedAtLogicalMs: logicalTimeMs,
        });
      },
      async cancel() {
        emptyFormationCancelCalls += 1;
        throw new Error("must not cancel without an exact proposal");
      },
      async loadState() {
        return { lastDecision: concurrentFormationDecision, team: null };
      },
    },
  });
  const cleanedEmptyFormation = await emptyFormationCleanupRuntime.advance({
    logicalTimeMs: 11,
  });
  assert.equal(invalidatedWithoutProposal, formationRequest.requestDigest);
  assert.equal(emptyFormationCancelCalls, 0);
  assert.equal(cleanedEmptyFormation.phase, "awaiting_allocation");

  const orphanStore = new InMemoryDistributedTeamAllocationStoreV2();
  await orphanStore.save({
    state: {
      ...body,
      stateDigest: digestPlanningJsonV1("collective-planning-snapshot", body),
    },
    expectedRevision: null,
    expectedStateDigest: null,
  });
  let orphanCancellation = null;
  activationFormationState.team.status = "active";
  cancelledActivationFormationProposal = null;
  activationCleanupOrder.length = 0;
  const orphanRuntime = new DistributedTeamAllocationRuntimeV2({
    ...input,
    store: orphanStore,
    allocation: {
      async loadState() { return advancedAllocation; },
      async submit() { throw new Error("not reached"); },
    },
    activation: {
      async reconcile() { return expiredContract; },
      async activate() { throw new Error("not reached"); },
      async cancel({ jointWorkContractDigest }) {
        activationCleanupOrder.push("activation");
        orphanCancellation = jointWorkContractDigest;
      },
    },
  });
  const reconciled = await orphanRuntime.advance({ logicalTimeMs: 10 });
  assert.equal(orphanCancellation, expiredContract.jointWorkContractDigest);
  assert.equal(
    cancelledActivationFormationProposal,
    formedProposal.proposalDigest,
  );
  assert.deepEqual(activationCleanupOrder, [
    "activation",
    "invalidation",
    "formation",
  ]);
  assert.equal(reconciled.phase, "awaiting_allocation");
  assert.equal(reconciled.lastReasonCode, "allocation_fence_advanced");
});

test("prepares one stable formation request before replaying form at later current times", async () => {
  const scope = createTeamFormationScopeV1({
    tenantId: "tenant",
    meshId: "mesh",
    policyDomainId: "policy-domain",
    missionIntentId: "mission",
    objectiveId: "objective",
    rootWorkItemId: "work.root",
    rootWorkItemRevision: 1,
  });
  const position = createTeamPositionV1({
    schemaVersion: 1,
    positionId: "position.one",
    workItemId: "work.one",
    workItemRevision: 1,
    roleKey: "worker",
    requiredCapabilityKeys: ["work"],
    completionCriteria: ["done"],
    dependsOnPositionIds: [],
    budgetUnits: 10,
    maximumActionBudgetUnits: 5,
  });
  const candidate = createTeamCandidateV1({
    schemaVersion: 1,
    candidateId: "candidate.one",
    peerId: "peer.one",
    instanceId: "instance.one",
    independenceGroupId: "group.one",
    sourceCandidateDigest: sha("candidate-source"),
    sourceRequestDigest: sha("candidate-request"),
    sourceDecisionDigest: sha("candidate-decision"),
    eligibleWorkItemId: position.workItemId,
    eligibleWorkItemRevision: position.workItemRevision,
    requiredCapabilityKeys: position.requiredCapabilityKeys,
  });
  const plan = {
    planDigest: sha("stable-plan"),
    auctionDigest: sha("stable-auction"),
    proposalDigest: sha("proposal"),
    round: 1,
    decidedAtLogicalMs: 2,
    unallocatedSlotIds: [],
    selections: [{
      slotId: position.positionId,
      bidderPeerId: candidate.peerId,
      bidderInstanceId: candidate.instanceId,
      bidderIndependenceGroupId: candidate.independenceGroupId,
      revealDigest: sha("stable-reveal"),
      declaredResourceUnits: 1,
      declaredBudgetUnits: 10,
      declaredUtilityMicros: 50,
    }],
  };
  const allocationState = {
    stateDigest: sha("stable-allocation"),
    proposal: { proposalDigest: plan.proposalDigest },
    auction: {
      roundDigest: plan.auctionDigest,
      proposalDigest: plan.proposalDigest,
      round: plan.round,
    },
    plan,
  };
  const formationRequests = [];
  let candidateResolutions = 0;
  let decisionVerifications = 0;
  const input = options({
    planning: {
      planningId: "planner",
      planningRevision: 1,
      planningDigest: sha("planning"),
      scope,
      membershipEpoch: 1,
      membershipConfigurationDigest: sha("membership"),
      positions: [position],
      validUntilLogicalMs: 100,
    },
    proposal: {
      proposalDigest: sha("proposal"),
      scope: {
        planningDigest: sha("planning"),
        teamFormationScope: { scopeDigest: scope.scopeDigest },
      },
      slots: [{
        slotId: position.positionId,
        semanticRoleKey: position.roleKey,
        requiredCapabilityKeys: position.requiredCapabilityKeys,
        budgetCeilingUnits: position.budgetUnits,
      }],
    },
    decisionBinding: {
      scope: collectiveScopeFor(scope),
      epoch: 1,
      membershipDigest: sha("membership"),
      membershipMemberIds: ["peer"],
      proposerId: "peer",
    },
    decision: {
      async decide() { throw new Error("not reached"); },
      async verify({ certificate }) {
        decisionVerifications += 1;
        return certificate;
      },
    },
    allocation: {
      async loadState() { return allocationState; },
      async submit() { return allocationState; },
    },
    candidates: {
      async resolve() {
        candidateResolutions += 1;
        return candidate;
      },
    },
    formation: {
      async form(request) {
        formationRequests.push(request);
        throw new Error("simulated interruption after form dispatch");
      },
      async invalidate() { throw new Error("not reached"); },
      async cancel() { throw new Error("not reached"); },
      async loadState() { return { lastDecision: null, team: null }; },
    },
  });
  const decision = rosterDecision(input, plan, 5);
  const initialBody = {
    format: "application/vnd.agentplat.distributed-team-allocation-state.v2+json",
    schemaVersion: 2,
    stateKey: input.stateKey,
    planningDigest: input.planning.planningDigest,
    proposalDigest: input.proposal.proposalDigest,
    revision: 1,
    logicalTimeHighWaterMs: 5,
    phase: "formation_pending",
    allocationStateDigest: allocationState.stateDigest,
    allocationAuctionDigest: plan.auctionDigest,
    allocationRound: plan.round,
    allocationPlanDigest: plan.planDigest,
    decision,
    decisionDigest: decision.decisionDigest,
    formationRequestId: `allocation-saga.formation.${plan.planDigest.slice(7, 23)}`,
    formationRequestLogicalTimeMs: 5,
    formationRequest: null,
    formationRequestDigest: null,
    formationAuthorizationDigest: null,
    formationProposalDigest: null,
    jointWorkContractDigest: null,
    reallocationCount: 0,
    lastReasonCode: null,
    predecessorStateDigest: sha("stable-predecessor"),
  };
  await input.store.save({
    state: {
      ...initialBody,
      stateDigest: digestPlanningJsonV1(
        "collective-planning-snapshot",
        initialBody,
      ),
    },
    expectedRevision: null,
    expectedStateDigest: null,
  });
  const runtime = new DistributedTeamAllocationRuntimeV2(input);
  const prepared = await runtime.advance({ logicalTimeMs: 10 });
  assert.equal(prepared.phase, "formation_pending");
  assert.ok(prepared.formationRequestDigest);
  assert.equal(formationRequests.length, 0);
  await assert.rejects(
    runtime.advance({ logicalTimeMs: 20 }),
    /simulated interruption/,
  );
  await assert.rejects(
    runtime.advance({ logicalTimeMs: 30 }),
    /simulated interruption/,
  );
  assert.equal(formationRequests.length, 2);
  assert.equal(candidateResolutions, 1);
  assert.equal(decisionVerifications, 5);
  assert.deepEqual(formationRequests[1], prepared.formationRequest);
  assert.equal(formationRequests[0].requestId, initialBody.formationRequestId);
  assert.equal(formationRequests[0].logicalTimeMs, 5);
  assert.equal(
    formationRequests[1].requestDigest,
    formationRequests[0].requestDigest,
  );
});
