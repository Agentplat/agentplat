import assert from "node:assert/strict";
import test from "node:test";

import { workContractDigestV1 } from "@agentplat/collective-control/mesh";
import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  createCapabilityStateCandidateV1,
  createCapabilityStateCapacitySignalV1,
  createCapabilityStateFusionRequestV1,
  createCapabilityStateFusionStateV1,
  createCapabilityStatePolicyV1,
  reduceCapabilityStateFusionV1,
} from "@agentplat/collective-runtime/capability-state";
import {
  InMemoryTeamFormationStoreV1,
  TeamFormationRuntimeV1,
  createTeamCandidateV1,
  createTeamCandidateFromCapabilityStateV1,
  createTeamFormationPolicyV1,
  createTeamFormationRequestV1,
  createTeamFormationScopeV1,
  createTeamMemberOutcomeV1,
  createTeamPositionBidV1,
  createTeamPositionV1,
  createTeamPositionWorkProjectionsV1,
  createTeamReconfigurationRequestV1,
  validateJointWorkContractV1,
  validateTeamFormationRequestV1,
  validateTeamFormationStateV1,
} from "@agentplat/collective-runtime/team-formation";

const digest = (label) => digestPlanningJsonV1("team-candidate", { label });

function policy(overrides = {}) {
  return createTeamFormationPolicyV1({
    schemaVersion: 1,
    policyId: "team-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
    minimumDistinctPeers: 2,
    minimumIndependenceGroups: 2,
    maximumTotalBudgetUnits: 100,
    requireDistinctPeerPerPosition: true,
    limits: {
      maximumPositions: 8,
      maximumBidsPerPosition: 16,
      maximumMembers: 8,
      maximumSearchNodes: 1_000,
      maximumReasonCodesPerDecision: 8,
      maximumHistoryEntries: 8,
      maximumRequestTtlMs: 1_000,
      maximumTeamDurationMs: 1_000,
      maximumCommitAttempts: 4,
    },
    ...overrides,
  });
}

const scope = createTeamFormationScopeV1({
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission",
  objectiveId: "objective",
  rootWorkItemId: "root-work",
  rootWorkItemRevision: 1,
});

const positions = [
  createTeamPositionV1({
    schemaVersion: 1,
    positionId: "position.research",
    workItemId: "work.research",
    workItemRevision: 1,
    roleKey: "researcher",
    requiredCapabilityKeys: ["research"],
    completionCriteria: ["evidence-collected"],
    dependsOnPositionIds: [],
    budgetUnits: 40,
    maximumActionBudgetUnits: 20,
  }),
  createTeamPositionV1({
    schemaVersion: 1,
    positionId: "position.review",
    workItemId: "work.review",
    workItemRevision: 1,
    roleKey: "reviewer",
    requiredCapabilityKeys: ["review"],
    completionCriteria: ["review-complete"],
    dependsOnPositionIds: ["position.research"],
    budgetUnits: 50,
    maximumActionBudgetUnits: 25,
  }),
];

function candidate(id, group) {
  return createTeamCandidateV1({
    schemaVersion: 1,
    candidateId: id,
    peerId: `peer.${id}`,
    instanceId: `instance.${id}`,
    independenceGroupId: group,
    sourceCandidateDigest: digest(`candidate-${id}`),
    sourceRequestDigest: digest(`request-${id}`),
    sourceDecisionDigest: digest(`decision-${id}`),
    eligibleWorkItemId: id === "a" ? "work.research" : "work.review",
    eligibleWorkItemRevision: 1,
    requiredCapabilityKeys: [id === "a" ? "research" : "review"],
  });
}

const candidateA = candidate("a", "group.one");
const candidateB = candidate("b", "group.one");
const candidateC = candidate("c", "group.two");
const candidateD = candidate("d", "group.three");

function bid({
  id,
  position,
  teamCandidate,
  score,
  budget = 30,
  observed = 1,
  expires = 500,
}) {
  return createTeamPositionBidV1({
    schemaVersion: 1,
    bidId: id,
    positionId: position.positionId,
    candidate: teamCandidate,
    sourceBidDigest: digest(`source-${id}`),
    capacityReservationUnits: 1,
    budgetUnits: budget,
    expectedCompletionAtLogicalMs: 80,
    locallyEvaluatedScoreMicros: score,
    observedAtLogicalMs: observed,
    validUntilLogicalMs: expires,
  });
}

function request({
  id = "formation-1",
  logicalTimeMs = 10,
  bids,
  valid = 200,
}) {
  return createTeamFormationRequestV1({
    schemaVersion: 1,
    requestId: id,
    scope,
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership-1"),
    positions,
    bids,
    logicalTimeMs,
    validUntilLogicalMs: valid,
  });
}

function runtime({
  stateKey = "team-state",
  policyRecord = policy(),
  store,
} = {}) {
  const stateStore = store ?? new InMemoryTeamFormationStoreV1();
  return {
    store: stateStore,
    controller: new TeamFormationRuntimeV1({
      stateKey,
      formationId: "team-formation",
      formationVersion: 1,
      implementationId: "team-formation.default",
      policy: policyRecord,
      store: stateStore,
    }),
  };
}

function workContract(proposal, peerId, instanceId, suffix) {
  const member = proposal.members.find((value) => value.peerId === peerId);
  const position = proposal.positions.find(
    (value) => value.positionId === member.positionId,
  );
  const body = {
    schemaVersion: 1,
    workContractId: `work-contract.${suffix}`,
    generation: 1,
    tenantId: proposal.scope.tenantId,
    policyDomainId: proposal.scope.policyDomainId,
    mandate: {
      schemaVersion: 1,
      mandateId: "mandate",
      mandateRevision: 1,
      mandateDigest: digest("mandate"),
    },
    objective: {
      schemaVersion: 1,
      meshId: proposal.scope.meshId,
      objectiveId: proposal.scope.objectiveId,
      objectiveDocumentId: "objective-document",
      objectiveRevision: 1,
      acceptedMessageId: "objective-accepted",
      acceptedPolicyDigest: digest("objective-policy"),
    },
    assignment: {
      schemaVersion: 1,
      workItemId: position.workItemId,
      workItemRevision: position.workItemRevision,
      ownerPeerId: "peer.owner",
      assignedPeerId: peerId,
      assignedInstanceId: instanceId,
      assignmentAuthorityId: `authority.${suffix}`,
      assignmentEpoch: 1,
      authorityGeneration: 1,
      fencingToken: `fence.${suffix}`,
      leaseExpiresAtLogicalMs: 180,
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
    createdAtLogicalMs: 20,
    updatedAtLogicalMs: 20,
    status: "active",
    terminalReasonCode: null,
  };
  return { ...body, workContractDigest: workContractDigestV1(body) };
}

function normalBids() {
  return [
    bid({
      id: "bid.research.a",
      position: positions[0],
      teamCandidate: candidateA,
      score: 900_000,
    }),
    bid({
      id: "bid.review.b",
      position: positions[1],
      teamCandidate: candidateB,
      score: 950_000,
    }),
    bid({
      id: "bid.review.c",
      position: positions[1],
      teamCandidate: candidateC,
      score: 800_000,
    }),
  ];
}

test("forms a complete diverse roster instead of selecting incompatible local maxima", async () => {
  const { controller } = runtime();
  const formationRequest = request({ bids: normalBids() });
  const decision = await controller.form(formationRequest);

  assert.equal(decision.status, "formed");
  assert.deepEqual(
    decision.proposal.members.map((member) => member.peerId),
    [candidateA.peerId, candidateC.peerId],
  );
  assert.equal(decision.proposal.totalBudgetUnits, 60);
  assert.ok(decision.exploredSearchNodes > 0);

  const replay = await controller.form(formationRequest);
  assert.equal(replay.decisionDigest, decision.decisionDigest);
  assert.equal((await controller.loadState()).revision, 1);

  const projections = createTeamPositionWorkProjectionsV1({
    proposal: decision.proposal,
  });
  assert.equal(projections.length, 2);
  assert.deepEqual(projections[1].dependsOnWorkItemIds, ["work.research"]);
});

test("admits a team candidate only from an exact current eligible capability decision", () => {
  const capabilityCandidate = createCapabilityStateCandidateV1({
    schemaVersion: 1,
    candidateId: "candidate.capability-a",
    kind: "peer",
    peerId: "peer.capability-a",
    instanceId: "instance.capability-a",
    agentId: null,
    requiredCapabilityKeys: ["research"],
    advertisedCapabilityKeys: ["research"],
    sourceEvidenceDigest: digest("capability-evidence"),
    sourceRecordId: "capability-card-a",
    sourceRevision: 1,
  });
  const capabilityPolicy = createCapabilityStatePolicyV1({
    schemaVersion: 1,
    policyId: "capability-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
    requiredDimensions: {
      offer_recipient: ["capacity"],
      bid: ["capacity"],
      award: ["capacity"],
      assignment_acceptance: ["capacity"],
      recovery: ["capacity"],
    },
    maximumCandidates: 4,
    maximumReasonCodesPerSignal: 4,
    maximumStateHeads: 16,
    maximumDecisionTtlMs: 100,
    maximumCommitAttempts: 4,
  });
  const capabilityRequest = createCapabilityStateFusionRequestV1({
    schemaVersion: 1,
    requestId: "capability-request",
    operation: "award",
    scope: {
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      policyDomainId: scope.policyDomainId,
      missionIntentId: scope.missionIntentId,
      objectiveId: scope.objectiveId,
      workItemId: positions[0].workItemId,
      workItemRevision: positions[0].workItemRevision,
    },
    logicalTimeMs: 10,
    requiredCapabilityKeys: ["research"],
    candidates: [capabilityCandidate],
  });
  const capabilityDecision = reduceCapabilityStateFusionV1({
    state: createCapabilityStateFusionStateV1({
      stateKey: "capability-state",
      fusionId: "capability-fusion",
      fusionVersion: 1,
      implementationId: "capability-fusion.default",
      policy: capabilityPolicy,
    }),
    policy: capabilityPolicy,
    request: capabilityRequest,
    signals: [
      createCapabilityStateCapacitySignalV1({
        candidate: capabilityCandidate,
        binding: {
          signalId: "capacity-signal",
          sourceId: "capacity-source",
          sourceVersion: 1,
          sourceImplementationDigest: digest("capacity-source"),
          sourceRevision: 1,
          observedAtLogicalMs: 5,
          expiresAtLogicalMs: 50,
        },
        activeAssignments: 0,
        maximumConcurrency: 2,
        acceptingWork: true,
      }),
    ],
  }).decision;
  const projected = createTeamCandidateFromCapabilityStateV1({
    candidate: capabilityCandidate,
    decision: capabilityDecision,
    request: capabilityRequest,
    expected: {
      fusionId: "capability-fusion",
      fusionVersion: 1,
      implementationId: "capability-fusion.default",
      policyId: capabilityPolicy.policy.policyId,
      policyVersion: capabilityPolicy.policy.policyVersion,
      policyDigest: capabilityPolicy.policyDigest,
    },
    independenceGroupId: "group.capability-a",
    logicalTimeMs: 10,
  });

  assert.equal(projected.peerId, capabilityCandidate.peerId);
  assert.equal(
    projected.sourceDecisionDigest,
    capabilityDecision.decisionDigest,
  );
});

test("activates only with exact individual WorkContracts and completes from joint outcomes", async () => {
  const { controller } = runtime({ stateKey: "activation-state" });
  const decision = await controller.form(request({ bids: normalBids() }));
  const proposal = decision.proposal;
  const contracts = proposal.members.map((member, index) =>
    workContract(proposal, member.peerId, member.instanceId, `${index + 1}`),
  );
  await assert.rejects(
    controller.activate({
      proposalDigest: proposal.proposalDigest,
      workContracts: contracts.slice(0, 1),
      logicalTimeMs: 29,
    }),
    /exact member coverage/u,
  );
  const joint = await controller.activate({
    proposalDigest: proposal.proposalDigest,
    workContracts: contracts,
    logicalTimeMs: 30,
  });

  assert.equal(validateJointWorkContractV1(joint).memberContracts.length, 2);
  assert.equal(joint.status, "active");
  assert.equal(joint.totalMaximumActionBudgetUnits, 45);

  for (const [index, member] of joint.memberContracts.entries()) {
    const team = await controller.recordOutcome(
      createTeamMemberOutcomeV1({
        schemaVersion: 1,
        teamId: joint.teamId,
        teamEpoch: joint.teamEpoch,
        jointWorkContractDigest: joint.jointWorkContractDigest,
        memberId: member.memberId,
        memberBindingDigest: member.bindingDigest,
        status: "success",
        sourceResultDigest: digest(`result-${index}`),
        observedAtLogicalMs: 40 + index,
      }),
    );
    assert.equal(team.status, index === 0 ? "active" : "completed");
  }
});

test("reconfigures one failed member under a new team epoch without minting authority", async () => {
  const { controller } = runtime({ stateKey: "reconfiguration-state" });
  const initial = await controller.form(request({ bids: normalBids() }));
  const initialContracts = initial.proposal.members.map((member, index) =>
    workContract(
      initial.proposal,
      member.peerId,
      member.instanceId,
      `initial-${index}`,
    ),
  );
  const joint = await controller.activate({
    proposalDigest: initial.proposal.proposalDigest,
    workContracts: initialContracts,
    logicalTimeMs: 30,
  });
  const failed = initial.proposal.members.find(
    (member) => member.positionId === "position.review",
  );
  const failedBinding = joint.memberContracts.find(
    (member) => member.memberId === failed.memberId,
  );
  const replacementBid = bid({
    id: "bid.review.d",
    position: positions[1],
    teamCandidate: candidateD,
    score: 850_000,
    observed: 31,
    expires: 170,
  });
  const premature = await controller.reconfigure(
    createTeamReconfigurationRequestV1({
      schemaVersion: 1,
      requestId: "replace-active-reviewer",
      currentJointWorkContractDigest: joint.jointWorkContractDigest,
      failedMemberId: failed.memberId,
      reasonCode: "member_unavailable",
      membershipEpoch: 2,
      membershipConfigurationDigest: digest("membership-2"),
      replacementBids: [replacementBid],
      logicalTimeMs: 32,
      validUntilLogicalMs: 170,
    }),
  );
  assert.equal(premature.status, "policy_denied");
  assert.deepEqual(premature.reasonCodes, ["failed_team_required"]);
  const failedTeam = await controller.recordOutcome(
    createTeamMemberOutcomeV1({
      schemaVersion: 1,
      teamId: joint.teamId,
      teamEpoch: joint.teamEpoch,
      jointWorkContractDigest: joint.jointWorkContractDigest,
      memberId: failed.memberId,
      memberBindingDigest: failedBinding.bindingDigest,
      status: "unsafe",
      sourceResultDigest: digest("unsafe-review-result"),
      observedAtLogicalMs: 35,
    }),
  );
  assert.equal(failedTeam.status, "failed");
  const reconfiguration = createTeamReconfigurationRequestV1({
    schemaVersion: 1,
    requestId: "replace-reviewer",
    currentJointWorkContractDigest: joint.jointWorkContractDigest,
    failedMemberId: failed.memberId,
    reasonCode: "member_unavailable",
    membershipEpoch: 2,
    membershipConfigurationDigest: digest("membership-2"),
    replacementBids: [replacementBid],
    logicalTimeMs: 40,
    validUntilLogicalMs: 170,
  });
  const decision = await controller.reconfigure(reconfiguration);

  assert.equal(decision.status, "formed");
  assert.equal(decision.proposal.teamId, initial.proposal.teamId);
  assert.equal(decision.proposal.teamEpoch, 2);
  assert.equal(
    decision.proposal.predecessorJointWorkContractDigest,
    joint.jointWorkContractDigest,
  );
  assert.ok(
    decision.proposal.members.some(
      (member) => member.peerId === candidateD.peerId,
    ),
  );
  assert.equal((await controller.loadState()).team.history.length, 1);
});

test("fails closed when exhaustive roster search exceeds its local bound", async () => {
  const boundedPolicy = policy({
    limits: {
      ...policy().policy.limits,
      maximumSearchNodes: 1,
    },
  });
  const { controller } = runtime({
    stateKey: "search-bound-state",
    policyRecord: boundedPolicy,
  });
  const decision = await controller.form(request({ bids: normalBids() }));
  assert.equal(decision.status, "search_exhausted");
  assert.equal(decision.proposal, null);
  assert.ok(decision.reasonCodes.includes("formation_search_exhausted"));
});

test("rejects contract and request tampering without invoking accessors", () => {
  const formationRequest = request({ bids: normalBids() });
  assert.throws(
    () =>
      validateTeamFormationRequestV1({
        ...formationRequest,
        requestDigest: digest("tampered"),
      }),
    /digest/u,
  );

  let invoked = false;
  const hostile = { ...formationRequest };
  Object.defineProperty(hostile, "positions", {
    enumerable: true,
    get() {
      invoked = true;
      return positions;
    },
  });
  assert.throws(() => validateTeamFormationRequestV1(hostile), /shape/u);
  assert.equal(invoked, false);

  const crossPositionBid = bid({
    id: "bid.research.wrong-capability",
    position: positions[0],
    teamCandidate: candidateB,
    score: 999_000,
  });
  assert.throws(
    () =>
      request({
        id: "cross-position-candidate",
        bids: [crossPositionBid, normalBids()[2]],
      }),
    /eligibility/u,
  );
});

test("handoff preserves the exact active team and state predecessor", async () => {
  const source = runtime({ stateKey: "handoff-source" });
  const decision = await source.controller.form(
    request({ bids: normalBids() }),
  );
  const contracts = decision.proposal.members.map((member, index) =>
    workContract(
      decision.proposal,
      member.peerId,
      member.instanceId,
      `handoff-${index}`,
    ),
  );
  await source.controller.activate({
    proposalDigest: decision.proposal.proposalDigest,
    workContracts: contracts,
    logicalTimeMs: 30,
  });
  const handoff = await source.controller.exportHandoff({
    targetStateKey: "handoff-target",
    logicalTimeMs: 40,
  });
  const target = runtime({ stateKey: "handoff-target" });
  const restored = await target.controller.importHandoff({
    handoff,
    logicalTimeMs: 41,
  });

  assert.equal(restored.team.status, "active");
  assert.equal(restored.team.teamId, decision.proposal.teamId);
  assert.equal(restored.predecessorStateDigest, handoff.sourceStateDigest);
  assert.equal(
    validateTeamFormationStateV1(restored, { policy: policy() }).stateDigest,
    restored.stateDigest,
  );
});
