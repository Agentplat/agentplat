import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  createTeamFormationPolicyV1,
  createTeamFormationScopeV1,
} from "@agentplat/collective-runtime/team-formation";
import {
  InMemoryMechanismAllocationStoreV1,
  MechanismAllocationRuntimeV1,
  commitmentHashForMechanismBidRevealV1,
  createMechanismAllocationPolicyV1,
  createMechanismBidCommitmentV1,
  createMechanismBidRevealV1,
  createMechanismMissionDecompositionProposalV1,
  createMechanismMissionScopeV1,
  createMechanismSemanticWorkSlotV1,
  createMechanismAllocationWithdrawalV1,
  createMechanismAllocationStateV1,
  createMechanismAllocationPlanV1,
  createMechanismAllocationAdmissionV1,
  mechanismAllocationEventActorV1,
  mechanismAllocationEventDigestV1,
  mechanismAllocationEventLogicalTimeV1,
  requiredCapabilitiesForMechanismAllocationEventV1,
  createTeamFormationRequestFromMechanismAllocationV1,
} from "../packages/collective-runtime/dist/mechanism-allocation.js";

const digest = (label) =>
  digestPlanningJsonV1("planning-reducer-event", { label });
const policy = createMechanismAllocationPolicyV1({
  schemaVersion: 1,
  policyId: "policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  maximumTotalDeclaredCostUnits: 100,
  maximumTotalDeclaredBudgetUnits: 100,
  maximumResourceUnitsPerPeer: 4,
  maximumSlotsPerPeer: 2,
  maximumSlotsPerIndependenceGroup: 1,
  requireDistinctIndependenceGroups: true,
  limits: {
    maximumSlots: 4,
    maximumDecompositionProposals: 2,
    maximumBidsPerSlot: 4,
    maximumCommitments: 8,
    maximumReveals: 8,
    maximumAdmissions: 32,
    maximumRounds: 3,
    maximumCommitAttempts: 3,
    maximumRoundDurationLogicalMs: 100,
  },
});
const teamScope = createTeamFormationScopeV1({
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "domain",
  missionIntentId: "intent",
  objectiveId: "objective",
  rootWorkItemId: "root",
  rootWorkItemRevision: 1,
});
const formationPolicy = createTeamFormationPolicyV1({
  schemaVersion: 1,
  policyId: "formation.policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  minimumDistinctPeers: 1,
  minimumIndependenceGroups: 1,
  maximumTotalBudgetUnits: 100,
  requireDistinctPeerPerPosition: true,
  limits: {
    maximumPositions: 4,
    maximumBidsPerPosition: 4,
    maximumMembers: 4,
    maximumSearchNodes: 100,
    maximumReasonCodesPerDecision: 8,
    maximumHistoryEntries: 8,
    maximumRequestInvalidations: 8,
    maximumRequestTtlMs: 1_000,
    maximumTeamDurationMs: 1_000,
    maximumCommitAttempts: 3,
  },
});
const proposal = createMechanismMissionDecompositionProposalV1({
  proposalId: "proposal",
  proposerPeerId: "peer.proposer",
  proposerInstanceId: "instance.proposer",
  proposerIndependenceGroupId: "group.proposer",
  scope: createMechanismMissionScopeV1({
    missionId: "mission",
    missionEpoch: 1,
    teamFormationScope: teamScope,
    planningDigest: digest("planning"),
  }),
  parentProposalDigest: null,
  causalEpoch: 1,
  observedAtLogicalMs: 10,
  validUntilLogicalMs: 110,
  slots: [
    createMechanismSemanticWorkSlotV1({
      slotId: "slot.audit",
      semanticRoleKey: "audit",
      requiredCapabilityKeys: ["audit"],
      dependsOnSlotIds: [],
      eligiblePeerIds: [],
      eligibleIndependenceGroupIds: [],
      requiredIndependenceGroupId: null,
      budgetCeilingUnits: 20,
    }),
    createMechanismSemanticWorkSlotV1({
      slotId: "slot.build",
      semanticRoleKey: "build",
      requiredCapabilityKeys: ["build"],
      dependsOnSlotIds: [],
      eligiblePeerIds: [],
      eligibleIndependenceGroupIds: [],
      requiredIndependenceGroupId: null,
      budgetCeilingUnits: 20,
    }),
  ],
});

function runtime() {
  const raw = new MechanismAllocationRuntimeV1({
    stateKey: "state",
    allocationId: "allocation",
    allocationVersion: 1,
    implementationId: "implementation",
    policy,
    store: new InMemoryMechanismAllocationStoreV1(),
    admission: admissionPort,
  });
  return {
    loadState: () => raw.loadState(),
    submit: (event) => raw.submit(admitted(event)),
  };
}
function sealedBid({
  state,
  id,
  peer,
  group,
  slot,
  utility,
  committedAt = 20,
  revealedAt = 70,
}) {
  const bidderInstanceId = `instance.${peer}`;
  const revealBody = {
    revealId: `reveal.${id}`,
    auctionDigest: state.auction.roundDigest,
    round: state.auction.round,
    bidderPeerId: peer,
    bidderInstanceId,
    bidderIndependenceGroupId: group,
    slotId: slot,
    declaredUtilityMicros: utility,
    declaredCostUnits: 10,
    declaredResourceUnits: 1,
    declaredBudgetUnits: 10,
    availabilityUntilLogicalMs: state.auction.revealDeadlineLogicalMs + 90,
    nonceDigest: digest(`nonce.${id}`),
  };
  const commitment = createMechanismBidCommitmentV1({
    commitmentId: `commit.${id}`,
    auctionDigest: state.auction.roundDigest,
    round: state.auction.round,
    bidderPeerId: peer,
    bidderInstanceId,
    bidderIndependenceGroupId: group,
    slotId: slot,
    commitmentHash: commitmentHashForMechanismBidRevealV1(revealBody),
    committedAtLogicalMs: committedAt,
  });
  const reveal = createMechanismBidRevealV1({
    ...revealBody,
    commitmentId: commitment.commitmentId,
    revealedAtLogicalMs: revealedAt,
  });
  return { commitment, reveal };
}
const admissionPort = Object.freeze({
  admissionId: "admission",
  admissionVersion: 1,
  implementationId: "admission.test",
  async verify() {
    return true;
  },
});
function admitted(event, overrides = {}) {
  const actor = mechanismAllocationEventActorV1(event);
  const eventDigest = mechanismAllocationEventDigestV1(event);
  const eventTime = mechanismAllocationEventLogicalTimeV1(event);
  return {
    event,
    admission: createMechanismAllocationAdmissionV1({
      admissionId: `admission.${eventDigest.slice(7, 31)}`,
      eventKind: event.kind,
      eventDigest,
      actorPeerId: actor.peerId,
      actorInstanceId: actor.instanceId,
      actorIndependenceGroupId: actor.independenceGroupId,
      membershipEpoch: 1,
      membershipConfigurationDigest: digest("membership"),
      capabilityStateDigest: digest(`capability.${actor.peerId}`),
      authorizedCapabilityKeys:
        requiredCapabilitiesForMechanismAllocationEventV1(event, proposal),
      authenticatedAtLogicalMs: eventTime,
      validUntilLogicalMs: eventTime + 1_000,
      evidenceDigest: digest(`evidence.${eventDigest}`),
      ...overrides,
    }),
  };
}
const clearEvent = (logicalTimeMs) => ({
  kind: "clear",
  logicalTimeMs,
  clearingPeerId: "peer.clearer",
  clearingInstanceId: "instance.clearer",
  clearingIndependenceGroupId: "group.clearer",
});

test("sealed bids clear deterministically with concentration bounds and remain advisory", async () => {
  const controller = runtime();
  let state = await controller.submit({ kind: "proposal", proposal });
  const a = sealedBid({
    state,
    id: "a",
    peer: "peer.a",
    group: "group.one",
    slot: "slot.audit",
    utility: 100,
  });
  const b = sealedBid({
    state,
    id: "b",
    peer: "peer.b",
    group: "group.one",
    slot: "slot.build",
    utility: 200,
  });
  const c = sealedBid({
    state,
    id: "c",
    peer: "peer.c",
    group: "group.two",
    slot: "slot.build",
    utility: 150,
  });
  for (const bid of [a, b, c])
    state = await controller.submit({
      kind: "commitment",
      commitment: bid.commitment,
    });
  for (const bid of [c, a, b])
    state = await controller.submit({ kind: "reveal", reveal: bid.reveal });
  state = await controller.submit(clearEvent(110));
  assert.equal(state.plan.advisoryOnly, true);
  assert.deepEqual(
    state.plan.selections.map((selection) => [
      selection.slotId,
      selection.bidderPeerId,
    ]),
    [
      ["slot.audit", "peer.a"],
      ["slot.build", "peer.c"],
    ],
  );
  const formation = await createTeamFormationRequestFromMechanismAllocationV1({
    state,
    allocationPolicy: policy,
    formationPolicy,
    admission: admissionPort,
    requestId: "formation.from.mechanism",
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership"),
    bindings: state.plan.selections.map((selection) => ({
      slotId: selection.slotId,
      workItemId: `work.${selection.slotId}`,
      workItemRevision: 1,
      completionCriteria: [`${selection.slotId}.complete`],
      maximumActionBudgetUnits: 5,
      peerInstanceId: `instance.${selection.bidderPeerId}`,
      sourceCandidateDigest: digest(`candidate.${selection.slotId}`),
      sourceRequestDigest: digest(`request.${selection.slotId}`),
      sourceDecisionDigest: digest(`decision.${selection.slotId}`),
      expectedCompletionAtLogicalMs: 150,
      observedAtLogicalMs: 110,
      validUntilLogicalMs: 200,
    })),
    logicalTimeMs: 110,
    validUntilLogicalMs: 200,
  });
  assert.deepEqual(
    formation.bids.map((bid) => [bid.positionId, bid.candidate.peerId]),
    [
      ["slot.audit", "peer.a"],
      ["slot.build", "peer.c"],
    ],
  );
});

test("a withdrawal advances only the affected slot into a new round", async () => {
  const controller = runtime();
  let state = await controller.submit({ kind: "proposal", proposal });
  const first = [
    sealedBid({
      state,
      id: "a",
      peer: "peer.a",
      group: "group.one",
      slot: "slot.audit",
      utility: 100,
    }),
    sealedBid({
      state,
      id: "c",
      peer: "peer.c",
      group: "group.two",
      slot: "slot.build",
      utility: 150,
    }),
  ];
  for (const bid of first)
    state = await controller.submit({
      kind: "commitment",
      commitment: bid.commitment,
    });
  for (const bid of first)
    state = await controller.submit({ kind: "reveal", reveal: bid.reveal });
  state = await controller.submit(clearEvent(120));
  const backdated = createMechanismAllocationWithdrawalV1({
    withdrawalId: "withdrawal.backdated",
    auctionDigest: state.auction.roundDigest,
    round: state.auction.round,
    peerId: "peer.a",
    peerInstanceId: "instance.peer.a",
    peerIndependenceGroupId: "group.one",
    affectedSlotIds: ["slot.audit"],
    reasonCode: "capacity_lost",
    observedAtLogicalMs: 115,
  });
  await assert.rejects(
    () => controller.submit({ kind: "withdrawal", withdrawal: backdated }),
    /withdrawal is invalid/,
  );
  state = await controller.submit({
    kind: "withdrawal",
    withdrawal: createMechanismAllocationWithdrawalV1({
      withdrawalId: "withdrawal",
      auctionDigest: state.auction.roundDigest,
      round: state.auction.round,
      peerId: "peer.a",
      peerInstanceId: "instance.peer.a",
      peerIndependenceGroupId: "group.one",
      affectedSlotIds: ["slot.audit"],
      reasonCode: "capacity_lost",
      observedAtLogicalMs: 121,
    }),
  });
  const replacement = sealedBid({
    state,
    id: "d",
    peer: "peer.d",
    group: "group.three",
    slot: "slot.audit",
    utility: 80,
    committedAt: 130,
    revealedAt: 180,
  });
  state = await controller.submit({
    kind: "commitment",
    commitment: replacement.commitment,
  });
  state = await controller.submit({
    kind: "reveal",
    reveal: replacement.reveal,
  });
  state = await controller.submit(clearEvent(221));
  assert.deepEqual(
    state.plan.selections.map((selection) => [
      selection.slotId,
      selection.bidderPeerId,
    ]),
    [
      ["slot.audit", "peer.d"],
      ["slot.build", "peer.c"],
    ],
  );
});

test("conflicting sealed alternatives exclude the equivocating peer and causal time rejects a late backdate", async () => {
  const controller = runtime();
  let state = await controller.submit({ kind: "proposal", proposal });
  const honest = sealedBid({
    state,
    id: "honest",
    peer: "peer.honest",
    group: "group.two",
    slot: "slot.audit",
    utility: 10,
  });
  const first = sealedBid({
    state,
    id: "first",
    peer: "peer.bad",
    group: "group.one",
    slot: "slot.audit",
    utility: 500,
  });
  const second = sealedBid({
    state,
    id: "second",
    peer: "peer.bad",
    group: "group.one",
    slot: "slot.audit",
    utility: 600,
  });
  state = await controller.submit({
    kind: "commitment",
    commitment: first.commitment,
  });
  state = await controller.submit({
    kind: "commitment",
    commitment: second.commitment,
  });
  state = await controller.submit({
    kind: "commitment",
    commitment: honest.commitment,
  });
  state = await controller.submit({ kind: "reveal", reveal: first.reveal });
  state = await controller.submit({ kind: "reveal", reveal: honest.reveal });
  await assert.rejects(() =>
    controller.submit({
      kind: "commitment",
      commitment: createMechanismBidCommitmentV1({
        ...second.commitment,
        commitmentId: "commit.backdated",
        committedAtLogicalMs: 21,
      }),
    }),
  );
  state = await controller.submit(clearEvent(110));
  assert.equal(
    state.plan.selections.find((selection) => selection.slotId === "slot.audit")
      .bidderPeerId,
    "peer.honest",
  );
  assert.equal(state.equivocations.length, 1);
});

test("runtime fails closed on a recomputed but causally inconsistent restored snapshot", async () => {
  const controller = runtime();
  let state = await controller.submit({ kind: "proposal", proposal });
  const bid = sealedBid({
    state,
    id: "restore",
    peer: "peer.restore",
    group: "group.one",
    slot: "slot.audit",
    utility: 10,
  });
  state = await controller.submit({
    kind: "commitment",
    commitment: bid.commitment,
  });
  const tampered = createMechanismAllocationStateV1({
    ...state,
    logicalTimeHighWaterMs: 10,
  });
  const restored = new MechanismAllocationRuntimeV1({
    stateKey: "state",
    allocationId: "allocation",
    allocationVersion: 1,
    implementationId: "implementation",
    policy,
    admission: admissionPort,
    store: {
      async load() {
        return tampered;
      },
      async save() {
        return false;
      },
    },
  });
  await assert.rejects(() => restored.loadState(), /logical time high water/);
});

test("runtime and formation projection reject fabricated admission and selection provenance", async () => {
  const denied = new MechanismAllocationRuntimeV1({
    stateKey: "denied",
    allocationId: "allocation",
    allocationVersion: 1,
    implementationId: "implementation",
    policy,
    store: new InMemoryMechanismAllocationStoreV1(),
    admission: {
      ...admissionPort,
      async verify() {
        return false;
      },
    },
  });
  await assert.rejects(
    () => denied.submit(admitted({ kind: "proposal", proposal })),
    /authorization was denied/,
  );
  const controller = runtime();
  let state = await controller.submit({ kind: "proposal", proposal });
  const loserBid = sealedBid({
    state,
    id: "provenance.loser",
    peer: "peer.loser",
    group: "group.three",
    slot: "slot.audit",
    utility: 50,
  });
  const first = [
    sealedBid({
      state,
      id: "provenance.a",
      peer: "peer.a",
      group: "group.one",
      slot: "slot.audit",
      utility: 100,
    }),
    sealedBid({
      state,
      id: "provenance.c",
      peer: "peer.c",
      group: "group.two",
      slot: "slot.build",
      utility: 150,
    }),
    loserBid,
  ];
  for (const bid of first)
    state = await controller.submit({
      kind: "commitment",
      commitment: bid.commitment,
    });
  for (const bid of first)
    state = await controller.submit({ kind: "reveal", reveal: bid.reveal });
  state = await controller.submit(clearEvent(110));

  const forgedAdmission = createMechanismAllocationAdmissionV1({
    ...state.admissions[0],
    evidenceDigest: digest("forged.evidence"),
  });
  const forgedState = createMechanismAllocationStateV1({
    ...state,
    admissions: [forgedAdmission, ...state.admissions.slice(1)],
  });
  const denyingPort = Object.freeze({
    ...admissionPort,
    async verify({ admission }) {
      return admission.evidenceDigest !== forgedAdmission.evidenceDigest;
    },
  });
  const restored = new MechanismAllocationRuntimeV1({
    stateKey: "state",
    allocationId: "allocation",
    allocationVersion: 1,
    implementationId: "implementation",
    policy,
    admission: denyingPort,
    store: {
      async load() {
        return forgedState;
      },
      async save() {
        return false;
      },
    },
  });
  await assert.rejects(
    () => restored.loadState(),
    /restored admission was denied/,
  );
  const bindings = state.plan.selections.map((selection) => ({
    slotId: selection.slotId,
    workItemId: `work.${selection.slotId}`,
    workItemRevision: 1,
    completionCriteria: [`${selection.slotId}.complete`],
    maximumActionBudgetUnits: 5,
    peerInstanceId: selection.bidderInstanceId,
    sourceCandidateDigest: digest("ignored.candidate"),
    sourceRequestDigest: digest("ignored.request"),
    sourceDecisionDigest: digest("ignored.decision"),
    expectedCompletionAtLogicalMs: 150,
    observedAtLogicalMs: 110,
    validUntilLogicalMs: 200,
  }));
  await assert.rejects(
    () =>
      createTeamFormationRequestFromMechanismAllocationV1({
        state: forgedState,
        allocationPolicy: policy,
        formationPolicy,
        admission: denyingPort,
        requestId: "formation.forged",
        membershipEpoch: 1,
        membershipConfigurationDigest: digest("membership"),
        bindings,
        logicalTimeMs: 110,
        validUntilLogicalMs: 200,
      }),
    /restored admission was denied/,
  );

  const changed = state.plan.selections.map((selection, index) =>
    index === 0
      ? {
          ...selection,
          declaredUtilityMicros: selection.declaredUtilityMicros + 1,
        }
      : selection,
  );
  const mismatchedPlan = createMechanismAllocationPlanV1({
    ...state.plan,
    selections: changed,
  });
  const mismatchedState = createMechanismAllocationStateV1({
    ...state,
    plan: mismatchedPlan,
  });
  await assert.rejects(
    () =>
      createTeamFormationRequestFromMechanismAllocationV1({
        state: mismatchedState,
        allocationPolicy: policy,
        formationPolicy,
        admission: admissionPort,
        requestId: "formation.invalid",
        membershipEpoch: 1,
        membershipConfigurationDigest: digest("membership"),
        bindings,
        logicalTimeMs: 110,
        validUntilLogicalMs: 200,
      }),
    /selection provenance/,
  );

  const substitutedSelections = state.plan.selections.map((selection) =>
    selection.slotId === "slot.audit"
      ? {
          slotId: loserBid.reveal.slotId,
          revealId: loserBid.reveal.revealId,
          revealDigest: loserBid.reveal.revealDigest,
          bidderPeerId: loserBid.reveal.bidderPeerId,
          bidderInstanceId: loserBid.reveal.bidderInstanceId,
          bidderIndependenceGroupId: loserBid.reveal.bidderIndependenceGroupId,
          declaredUtilityMicros: loserBid.reveal.declaredUtilityMicros,
          declaredCostUnits: loserBid.reveal.declaredCostUnits,
          declaredResourceUnits: loserBid.reveal.declaredResourceUnits,
          declaredBudgetUnits: loserBid.reveal.declaredBudgetUnits,
        }
      : selection,
  );
  const substitutedPlan = createMechanismAllocationPlanV1({
    ...state.plan,
    selections: substitutedSelections,
  });
  const substitutedState = createMechanismAllocationStateV1({
    ...state,
    plan: substitutedPlan,
  });
  const substitutedRuntime = new MechanismAllocationRuntimeV1({
    stateKey: "state",
    allocationId: "allocation",
    allocationVersion: 1,
    implementationId: "implementation",
    policy,
    admission: admissionPort,
    store: {
      async load() {
        return substitutedState;
      },
      async save() {
        return false;
      },
    },
  });
  await assert.rejects(
    () => substitutedRuntime.loadState(),
    /deterministic event replay/,
  );
  await assert.rejects(
    () =>
      createTeamFormationRequestFromMechanismAllocationV1({
        state: substitutedState,
        allocationPolicy: policy,
        formationPolicy,
        admission: admissionPort,
        requestId: "formation.substituted",
        membershipEpoch: 1,
        membershipConfigurationDigest: digest("membership"),
        bindings,
        logicalTimeMs: 110,
        validUntilLogicalMs: 200,
      }),
    /deterministic event replay/,
  );
});
