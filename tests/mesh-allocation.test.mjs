import assert from "node:assert/strict";
import { createHash, webcrypto as crypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  signMeshEnvelope,
  verifyMeshEnvelope,
} from "@agentplat/mesh-crypto";
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshPayload,
} from "@agentplat/mesh-protocol";

import {
  createMeshAllocationRuntimeState,
  createMeshAllocationState,
  createMeshCoordinationState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkState,
  createMeshObjectiveWorkRuntimeState,
  createMeshDiscoveryRuntimeState,
  evaluateMeshObjectiveWorkCommand,
  evaluateVerifiedMeshDiscoveryEnvelope,
  evaluateVerifiedMeshObjectiveEnvelope,
  evaluateMeshAllocationCommand,
  evaluateMeshAllocationTimer,
  evaluateVerifiedMeshAllocationEnvelope,
  restoreMeshAllocationState,
  restoreMeshCoordinationState,
  restoreMeshObjectiveWorkState,
  selectMeshAllocationBid,
} from "@agentplat/mesh/coordination";

const fixtures = new URL(
  "../packages/mesh-protocol/fixtures/v0/",
  import.meta.url,
);
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(name, fixtures), "utf8"));
const announce = fixture("objective-announce.json");
const revise = fixture("objective-revise.json");
const cancel = fixture("objective-cancel.json");
const card = fixture("peer-card.json");
const capability = fixture("capability-advertise.json");
const offerFixture = fixture("work-offer.json");
const bidFixture = fixture("work-bid.json");
const awardFixture = fixture("work-award.json");
const acceptFixture = fixture("work-accept.json");
const declineFixture = fixture("work-decline.json");
const progressFixture = fixture("work-progress.json");
const releaseFixture = fixture("work-release.json");
const cancelWorkFixture = fixture("work-cancel.json");
const at = "2026-07-30T00:00:01.000Z";

function hashed(envelope) {
  const copy = structuredClone(envelope);
  const value = canonicalizeMeshPayload(copy.payload);
  copy.payloadHash = `sha256:${createHash("sha256").update(value.value).digest("base64url")}`;
  return copy;
}

function request(envelope, receivedAt) {
  return { envelope: hashed(envelope), verifiedAt: at, receivedAt };
}

async function signed(envelope, peerId, keys, resolver) {
  const value = await signMeshEnvelope({
    envelope,
    privateKey: keys[peerId].privateKey,
  });
  const verified = await verifyMeshEnvelope({
    envelope: value,
    resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt: at,
  });
  assert.equal(verified.verified, true);
  return { signed: value, verified: verified.envelope };
}

async function allocationRuntime(objectivePolicyPatch = {}) {
  const peers = ["peer-a", "peer-b", "peer-c"];
  const keys = Object.fromEntries(
    await Promise.all(
      peers.map(async (peerId) => [
        peerId,
        await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
          "sign",
          "verify",
        ]),
      ]),
    ),
  );
  const resolver = createStaticMeshKeyResolver(
    peers.map((peerId) => ({
      tenantId: "tenant-a",
      meshId: "mesh-a",
      peerId,
      keyId: `key-${peerId.slice(-1)}`,
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keys[peerId].publicKey,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      status: "active",
    })),
  );
  let state = createMeshAllocationRuntimeState(
    createMeshCoordinationState({ identity }),
    createMeshDiscoveryState({
      identity,
      subscriptions: ["membership", "capability", "objective"],
      admittedPeers: peers
        .filter((p) => p !== "peer-b")
        .map((peerId) => ({
          peerId,
          instanceIds: [`instance-${peerId.slice(-1)}`],
          validUntil: "2027-01-01T00:00:00.000Z",
        })),
    }),
    createMeshObjectiveWorkState({
      identity,
      issuerAuthorities: [
        {
          peerId: "peer-a",
          keyIds: ["key-a"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
      ],
    }),
    createMeshAllocationState({ identity }),
  );
  const objectiveAnnounce = structuredClone(announce);
  Object.assign(objectiveAnnounce.payload, objectivePolicyPatch);
  let d = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      state.coordination,
      state.discovery,
      state.objectives,
    ),
    request(objectiveAnnounce, 1),
  );
  assert.equal(d.accepted, true);
  state = createMeshAllocationRuntimeState(
    d.state.coordination,
    d.state.discovery,
    d.state.objectives,
    restoreMeshAllocationState({ ...state.allocation, lastLogicalTime: 1 }),
  );
  let logicalTime = 2;
  for (const peerId of ["peer-a", "peer-c"]) {
    for (const base of [card, capability]) {
      const e = structuredClone(base);
      const suffix = peerId.slice(-1);
      e.messageId = `${"A".repeat(20)}${String.fromCharCode(65 + logicalTime)}A`;
      e.sender.peerId = peerId;
      e.sender.instanceId = `instance-${suffix}`;
      e.proof.keyId = `key-${suffix}`;
      if (e.payload.ownerPeerId) e.payload.ownerPeerId = peerId;
      if (e.payload.subjectPeerId) e.payload.subjectPeerId = peerId;
      if (e.payload.instanceId) e.payload.instanceId = `instance-${suffix}`;
      if (e.payload.peerCardId) e.payload.peerCardId = `card-${suffix}`;
      if (e.payload.capabilityIds)
        e.payload.capabilityIds = [`capability-${suffix}`];
      if (e.payload.transportHints)
        e.payload.transportHints = [`https://${peerId}.example.test/mesh`];
      if (e.payload.advertisementId)
        e.payload.advertisementId = `advertisement-${suffix}`;
      if (e.payload.capabilityId)
        e.payload.capabilityId = `capability-${suffix}`;
      d = evaluateVerifiedMeshDiscoveryEnvelope(
        createMeshDiscoveryRuntimeState(state.coordination, state.discovery),
        request(e, logicalTime),
      );
      assert.equal(d.accepted, true, d.code);
      state = createMeshAllocationRuntimeState(
        d.state.coordination,
        d.state.discovery,
        Object.freeze({ ...state.objectives, lastLogicalTime: logicalTime }),
        restoreMeshAllocationState({
          ...state.allocation,
          lastLogicalTime: logicalTime,
        }),
      );
      logicalTime += 1;
    }
  }
  const work = evaluateMeshObjectiveWorkCommand(
    createMeshObjectiveWorkRuntimeState(
      state.coordination,
      state.discovery,
      state.objectives,
    ),
    {
      kind: "work.create",
      input: {
        objectiveId: "objective-a",
        workItemId: "work-item-a",
        requiredCapabilityKeys: ["summarize"],
        matchingAttributes: { language: "en" },
        completionCriteria: ["Return a concise summary."],
        inputSummary: "Summarize the approved material.",
        budgetReservationUnits: 100,
        workDeadline: "2026-07-30T01:00:00.000Z",
      },
    },
    { verifiedAt: at, receivedAt: logicalTime },
  );
  assert.equal(work.accepted, true);
  return {
    state: createMeshAllocationRuntimeState(
      work.state.coordination,
      work.state.discovery,
      work.state.objectives,
      restoreMeshAllocationState({
        ...state.allocation,
        lastLogicalTime: logicalTime,
      }),
    ),
    keys,
    resolver,
  };
}

async function awardableAllocation(objectivePolicyPatch) {
  const {
    state: initial,
    keys,
    resolver,
  } = await allocationRuntime(objectivePolicyPatch);
  const recipients = await Promise.all(
    [
      ["peer-a", "OAAAAAAAAAAAAAAAAAAAAA", 20],
      ["peer-c", "PAAAAAAAAAAAAAAAAAAAAA", 21],
    ].map(async ([peerId, messageId, sequence]) => {
      const envelope = structuredClone(offerFixture);
      envelope.messageId = messageId;
      envelope.sequence = sequence;
      envelope.sender = { peerId: "peer-b", instanceId: "instance-b" };
      envelope.audience = { kind: "peer", peerId };
      envelope.proof.keyId = "key-b";
      envelope.payload.ownerPeerId = "peer-b";
      envelope.payload.offerId = "offer-a";
      return {
        recipientPeerId: peerId,
        preparedAt: 7,
        envelope: (await signed(envelope, "peer-b", keys, resolver)).signed,
      };
    }),
  );
  const offered = evaluateMeshAllocationCommand(
    initial,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
      recipients,
    },
    at,
    7,
  );
  assert.equal(offered.accepted, true);
  const bid = structuredClone(bidFixture);
  bid.messageId = "BAAAAAAAAAAAAAAAAAAAAA";
  bid.sender = { peerId: "peer-a", instanceId: "instance-a" };
  bid.audience = { kind: "peer", peerId: "peer-b" };
  bid.proof.keyId = "key-a";
  bid.causationId = recipients[0].envelope.messageId;
  bid.payload.ownerPeerId = "peer-b";
  bid.payload.bidderPeerId = "peer-a";
  bid.payload.offerId = "offer-a";
  bid.payload.bidExpiresAt = bid.payload.bidDeadline;
  bid.expiresAt = bid.payload.bidDeadline;
  const signedBid = await signed(bid, "peer-a", keys, resolver);
  const bidded = evaluateVerifiedMeshAllocationEnvelope(offered.state, {
    envelope: signedBid.verified,
    verifiedAt: at,
    receivedAt: 8,
  });
  assert.equal(bidded.accepted, true);
  return { state: bidded.state, keys, resolver, signedBid };
}

async function preparedAward(
  keys,
  resolver,
  bidMessageId = "BAAAAAAAAAAAAAAAAAAAAA",
) {
  const award = structuredClone(awardFixture);
  award.messageId = "QAAAAAAAAAAAAAAAAAAAAA";
  award.sequence = 30;
  award.sentAt = "2026-07-30T00:00:02.000Z";
  award.expiresAt = "2026-07-30T00:00:12.000Z";
  award.sender = { peerId: "peer-b", instanceId: "instance-b" };
  award.audience = { kind: "peer", peerId: "peer-a" };
  award.proof.keyId = "key-b";
  award.causationId = bidMessageId;
  Object.assign(award.payload, {
    awardId: "award-a",
    offerId: "offer-a",
    bidId: "bid-a",
    bidRevision: 1,
    ownerPeerId: "peer-b",
    assigneePeerId: "peer-a",
    assignmentEpoch: 1,
    authorityKind: "award",
    assignmentAuthorityId: "award-a",
    fencingToken: "award-a",
    leaseStartsAt: "2026-07-30T00:00:02.000Z",
    acceptanceDeadline: "2026-07-30T00:00:15.000Z",
    leaseExpiresAt: "2026-07-30T00:00:25.000Z",
  });
  return signed(award, "peer-b", keys, resolver);
}

async function preparedResponse(kind, keys, resolver, awardMessageId) {
  const response = structuredClone(
    kind === "work.accept" ? acceptFixture : declineFixture,
  );
  response.messageId =
    kind === "work.accept"
      ? "RAAAAAAAAAAAAAAAAAAAAA"
      : "SAAAAAAAAAAAAAAAAAAAAA";
  response.sequence = 31;
  response.sentAt = "2026-07-30T00:00:03.000Z";
  response.expiresAt = "2026-07-30T00:00:12.000Z";
  response.sender = { peerId: "peer-a", instanceId: "instance-a" };
  response.audience = { kind: "peer", peerId: "peer-b" };
  response.proof.keyId = "key-a";
  response.causationId = awardMessageId;
  Object.assign(response.payload, {
    awardId: "award-a",
    ownerPeerId: "peer-b",
    assigneePeerId: "peer-a",
    assignmentEpoch: 1,
    assignmentAuthorityId: "award-a",
    fencingToken: "award-a",
    acceptanceDeadline: "2026-07-30T00:00:15.000Z",
  });
  return signed(response, "peer-a", keys, resolver);
}

async function pendingAward() {
  const runtime = await awardableAllocation();
  const award = await preparedAward(runtime.keys, runtime.resolver);
  const decision = evaluateMeshAllocationCommand(
    runtime.state,
    {
      kind: "allocation.award",
      offerId: "offer-a",
      bidId: "bid-a",
      bidRevision: 1,
      recipient: {
        recipientPeerId: "peer-a",
        preparedAt: 9,
        envelope: award.signed,
      },
    },
    at,
    9,
  );
  assert.equal(decision.accepted, true);
  return { ...runtime, award, state: decision.state };
}

async function activeOwner() {
  const pending = await pendingAward();
  const acceptance = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const accepted = evaluateVerifiedMeshAllocationEnvelope(pending.state, {
    envelope: acceptance.verified,
    verifiedAt: at,
    receivedAt: 10,
  });
  assert.equal(accepted.accepted, true, accepted.code);
  return { ...pending, acceptance, state: accepted.state };
}

async function preparedOwnerExecution(
  kind,
  keys,
  resolver,
  {
    messageId,
    sequence = 50,
    causationId = "RAAAAAAAAAAAAAAAAAAAAA",
    senderPeerId = "peer-b",
    audiencePeerId = "peer-a",
    payloadPatch = {},
  } = {},
) {
  const source = {
    "work.progress": progressFixture,
    "work.release": releaseFixture,
    "work.cancel": cancelWorkFixture,
  }[kind];
  const envelope = structuredClone(source);
  envelope.messageId = messageId ?? envelope.messageId;
  envelope.sequence = sequence;
  envelope.sentAt = "2026-07-30T00:00:04.000Z";
  envelope.expiresAt = "2026-07-30T00:00:14.000Z";
  envelope.sender = {
    peerId: senderPeerId,
    instanceId: `instance-${senderPeerId.slice(-1)}`,
  };
  envelope.audience = { kind: "peer", peerId: audiencePeerId };
  envelope.proof.keyId = `key-${senderPeerId.slice(-1)}`;
  envelope.causationId = causationId;
  Object.assign(envelope.payload, {
    objectiveId: "objective-a",
    objectiveDocumentId: "objective-document-a",
    objectiveRevision: 1,
    workItemId: "work-item-a",
    workItemRevision: 1,
    ownerPeerId: "peer-b",
    ownerEpoch: 1,
    assigneePeerId: "peer-a",
    awardId: "award-a",
    acceptanceId: "acceptance-a",
    assignmentEpoch: 1,
    assignmentAuthorityId: "award-a",
    fencingToken: "award-a",
    leaseExpiresAt: "2026-07-30T00:00:25.000Z",
    ...payloadPatch,
  });
  if (
    kind === "work.cancel" &&
    envelope.payload.assignmentState === "award_pending"
  )
    delete envelope.payload.acceptanceId;
  return signed(envelope, senderPeerId, keys, resolver);
}

const identity = Object.freeze({
  tenantId: "tenant-a",
  meshId: "mesh-a",
  peerId: "peer-b",
  instanceId: "instance-b",
  keyId: "key-b",
});

test("allocation state is strict, null-prototype, deeply frozen, and restorable", () => {
  const state = createMeshAllocationState({ identity });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.identity), true);
  for (const key of [
    "workAllocations",
    "localOffers",
    "bidHeads",
    "acceptedBidEvidence",
    "reservations",
  ]) {
    assert.equal(Object.isFrozen(state[key]), true);
    assert.equal(Object.getPrototypeOf(state[key]), null);
  }
  assert.deepEqual(restoreMeshAllocationState(structuredClone(state)), state);
  assert.throws(
    () =>
      restoreMeshAllocationState({
        ...structuredClone(state),
        unexpected: true,
      }),
    /invalid keys/u,
  );
});

test("allocation limits are closed, positive, and cannot exceed fixed ceilings", () => {
  assert.throws(
    () => createMeshAllocationState({ identity, limits: { maximumOffers: 0 } }),
    /maximumOffers/u,
  );
  assert.throws(
    () =>
      createMeshAllocationState({
        identity,
        limits: { maximumRecipientsPerOffer: 129 },
      }),
    /maximumRecipientsPerOffer/u,
  );
  assert.throws(
    () =>
      createMeshAllocationState({
        identity,
        limits: { maximumOffers: 1, extra: 1 },
      }),
    /invalid keys/u,
  );
});

test("allocation restore rejects tampered record relations before a reducer can use them", () => {
  const state = structuredClone(createMeshAllocationState({ identity }));
  state.workAllocations[JSON.stringify(["objective-a", "work-a"])] = {
    workKey: JSON.stringify(["objective-a", "work-a"]),
    objectiveId: "objective-a",
    objectiveDocumentId: "document-a",
    objectiveRevision: 1,
    objectivePolicy: {},
    work: {},
    phase: "offered",
    activeOfferId: "offer-a",
    bidDeadlineAt: 1,
    reservationId: "allocation.reservation.offer-a",
    updatedAt: 0,
  };
  assert.throws(
    () => restoreMeshAllocationState(state),
    /invalid keys|plain record/u,
  );
});

test("allocation evaluator fails closed without a locally owned Work Item and timers are idempotent", () => {
  const state = createMeshAllocationRuntimeState(
    createMeshCoordinationState({ identity }),
    createMeshDiscoveryState({
      identity,
      subscriptions: ["capability", "objective"],
    }),
    createMeshObjectiveWorkState({ identity }),
    createMeshAllocationState({ identity }),
  );
  const missing = evaluateMeshAllocationCommand(
    state,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-a",
      expectedWorkItemRevision: 1,
      recipients: [],
    },
    "2026-07-30T00:00:01.000Z",
    1,
  );
  assert.deepEqual(missing, { accepted: false, code: "work_missing", state });
  assert.deepEqual(
    selectMeshAllocationBid(state, { offerId: "unknown", evaluatedAt: 0 }),
    {
      offerId: "unknown",
      evaluatedAt: 0,
      reason: "offer_missing",
    },
  );
  const input = { kind: "timer.fired", timerId: "unknown", generation: 1 };
  const first = evaluateMeshAllocationTimer(state, input, 0);
  const second = evaluateMeshAllocationTimer(state, input, 0);
  assert.deepEqual(first, { accepted: false, code: "timer_unknown", state });
  assert.deepEqual(second, first);
});

test("signed recipient offers reserve once, accept causal signed bids, rank, and release on the deadline", async () => {
  const { state: initial, keys, resolver } = await allocationRuntime();
  const recipients = [];
  for (const [peerId, messageId] of [
    ["peer-a", "OAAAAAAAAAAAAAAAAAAAAA"],
    ["peer-c", "PAAAAAAAAAAAAAAAAAAAAA"],
  ]) {
    const envelope = structuredClone(offerFixture);
    envelope.messageId = messageId;
    envelope.sequence = peerId === "peer-a" ? 20 : 21;
    envelope.sender = { peerId: "peer-b", instanceId: "instance-b" };
    envelope.audience = { kind: "peer", peerId };
    envelope.proof.keyId = "key-b";
    envelope.payload.ownerPeerId = "peer-b";
    envelope.payload.offerId = "offer-a";
    recipients.push({
      recipientPeerId: peerId,
      preparedAt: 7,
      envelope: (await signed(envelope, "peer-b", keys, resolver)).signed,
    });
  }
  const wrongKeyRecipients = structuredClone(recipients);
  wrongKeyRecipients[0].envelope.proof.keyId = "key-a";
  const wrongKey = evaluateMeshAllocationCommand(
    initial,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
      recipients: wrongKeyRecipients,
    },
    at,
    7,
  );
  assert.equal(wrongKey.code, "offer_invalid");
  assert.equal(wrongKey.state, initial);
  assert.equal(
    evaluateMeshAllocationCommand(
      initial,
      {
        kind: "allocation.offer",
        objectiveId: "objective-a",
        workItemId: "work-item-a",
        expectedWorkItemRevision: 1,
        recipients: recipients.slice(0, 1),
      },
      at,
      7,
    ).code,
    "offer_invalid",
  );
  const offered = evaluateMeshAllocationCommand(
    initial,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
      recipients,
    },
    at,
    7,
  );
  assert.equal(offered.accepted, true);
  assert.equal(offered.effects.length, 2);
  assert.equal(
    offered.state.objectives.objectives["objective-a"].reservedBudgetUnits,
    100,
  );
  assert.equal(Object.isFrozen(offered.effects), true);
  assert.equal(
    Object.isFrozen(
      offered.state.allocation.localOffers["offer-a"].recipientOffers,
    ),
    true,
  );
  const missingTimerCoordination = Object.freeze({
    ...offered.state.coordination,
    timers: Object.freeze(Object.create(null)),
  });
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        missingTimerCoordination,
        offered.state.discovery,
        offered.state.objectives,
        offered.state.allocation,
      ),
    /timer or reservation binding/u,
  );
  const accountingSnapshot = structuredClone(offered.state.objectives);
  accountingSnapshot.objectives["objective-a"].reservedBudgetUnits = 99;
  const wrongAccounting = restoreMeshObjectiveWorkState(accountingSnapshot);
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        offered.state.coordination,
        offered.state.discovery,
        wrongAccounting,
        offered.state.allocation,
      ),
    /reservation accounting/u,
  );
  const bid = structuredClone(bidFixture);
  bid.messageId = "BAAAAAAAAAAAAAAAAAAAAA";
  bid.sender = { peerId: "peer-a", instanceId: "instance-a" };
  bid.audience = { kind: "peer", peerId: "peer-b" };
  bid.proof.keyId = "key-a";
  bid.causationId = recipients[0].envelope.messageId;
  bid.payload.ownerPeerId = "peer-b";
  bid.payload.bidderPeerId = "peer-a";
  bid.payload.offerId = "offer-a";
  bid.payload.bidExpiresAt = bid.payload.bidDeadline;
  bid.expiresAt = bid.payload.bidDeadline;
  const overBudget = structuredClone(bid);
  overBudget.messageId = "IAAAAAAAAAAAAAAAAAAAAA";
  overBudget.payload.bidId = "bid-over-budget";
  overBudget.payload.budgetUnits = 101;
  const overBudgetSigned = await signed(overBudget, "peer-a", keys, resolver);
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(offered.state, {
      envelope: overBudgetSigned.verified,
      verifiedAt: at,
      receivedAt: 8,
    }).code,
    "bid_invalid",
  );
  const signedBid = await signed(bid, "peer-a", keys, resolver);
  const accepted = evaluateVerifiedMeshAllocationEnvelope(offered.state, {
    envelope: signedBid.verified,
    verifiedAt: at,
    receivedAt: 8,
  });
  assert.equal(accepted.accepted, true);
  const bidC = structuredClone(bid);
  bidC.messageId = "GAAAAAAAAAAAAAAAAAAAAA";
  bidC.sender = { peerId: "peer-c", instanceId: "instance-c" };
  bidC.proof.keyId = "key-c";
  bidC.causationId = recipients[1].envelope.messageId;
  bidC.payload.bidId = "bid-c";
  bidC.payload.bidderPeerId = "peer-c";
  bidC.payload.advertisementId = "advertisement-c";
  bidC.payload.capabilityId = "capability-c";
  const signedBidC = await signed(bidC, "peer-c", keys, resolver);
  const withBids = evaluateVerifiedMeshAllocationEnvelope(accepted.state, {
    envelope: signedBidC.verified,
    verifiedAt: at,
    receivedAt: 9,
  });
  assert.equal(withBids.accepted, true);
  const conflict = structuredClone(bid);
  conflict.messageId = "JAAAAAAAAAAAAAAAAAAAAA";
  conflict.payload.budgetUnits = 99;
  const conflictSigned = await signed(conflict, "peer-a", keys, resolver);
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(withBids.state, {
      envelope: conflictSigned.verified,
      verifiedAt: at,
      receivedAt: 10,
    }).code,
    "domain_record_conflict",
  );
  const badCause = structuredClone(bid);
  badCause.messageId = "CAAAAAAAAAAAAAAAAAAAAA";
  badCause.causationId = "DAAAAAAAAAAAAAAAAAAAAA";
  const badCauseSigned = await signed(badCause, "peer-a", keys, resolver);
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(withBids.state, {
      envelope: badCauseSigned.verified,
      verifiedAt: at,
      receivedAt: 10,
    }).code,
    "bid_causation_invalid",
  );
  const invalidRevision = structuredClone(bid);
  invalidRevision.messageId = "EAAAAAAAAAAAAAAAAAAAAA";
  invalidRevision.payload.bidId = "bid-a-v2";
  invalidRevision.payload.bidRevision = 2;
  invalidRevision.payload.previousBidId = "wrong-bid";
  invalidRevision.causationId = recipients[0].envelope.messageId;
  const invalidRevisionSigned = await signed(
    invalidRevision,
    "peer-a",
    keys,
    resolver,
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(withBids.state, {
      envelope: invalidRevisionSigned.verified,
      verifiedAt: at,
      receivedAt: 10,
    }).code,
    "bid_predecessor_invalid",
  );
  const replacement = structuredClone(invalidRevision);
  replacement.messageId = "FAAAAAAAAAAAAAAAAAAAAA";
  replacement.payload.previousBidId = "bid-a";
  replacement.causationId = recipients[0].envelope.messageId;
  const replacementSigned = await signed(replacement, "peer-a", keys, resolver);
  const replaced = evaluateVerifiedMeshAllocationEnvelope(withBids.state, {
    envelope: replacementSigned.verified,
    verifiedAt: at,
    receivedAt: 10,
  });
  assert.equal(replaced.accepted, true);
  assert.equal(
    replaced.state.allocation.bidHeads[JSON.stringify(["offer-a", "peer-a"])]
      .bidId,
    "bid-a-v2",
  );
  const duplicate = evaluateVerifiedMeshAllocationEnvelope(replaced.state, {
    envelope: signedBid.verified,
    verifiedAt: at,
    receivedAt: 11,
  });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  const before = selectMeshAllocationBid(accepted.state, {
    offerId: "offer-a",
    evaluatedAt: 8,
  });
  assert.equal(before.reason, "selected");
  const timer = replaced.state.coordination.timers["allocation.bid.offer-a"];
  const selected = selectMeshAllocationBid(replaced.state, {
    offerId: "offer-a",
    evaluatedAt: 11,
  });
  assert.equal(selected.reason, "selected");
  assert.equal(selected.bid.bidId, "bid-a-v2");
  assert.equal(
    selectMeshAllocationBid(replaced.state, {
      offerId: "offer-a",
      evaluatedAt: timer.dueAt,
    }).reason,
    "bid_window_closed",
  );
  const forgedValidity = structuredClone(replaced.state.allocation);
  forgedValidity.acceptedBidEvidence["bid-a-v2"].validityVerifiedAt =
    "2026-07-29T23:59:31.000Z";
  assert.throws(
    () => restoreMeshAllocationState(forgedValidity),
    /orphaned from accepted evidence/u,
  );
  const forgedDigest = structuredClone(replaced.state.coordination);
  forgedDigest.domainRecords[
    JSON.stringify(["work.bid", "bid-a-v2"])
  ].contentDigest = "A".repeat(43);
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        restoreMeshCoordinationState(forgedDigest),
        replaced.state.discovery,
        replaced.state.objectives,
        replaced.state.allocation,
      ),
    /remote bid domain record binding/u,
  );
  const closed = evaluateMeshAllocationTimer(
    replaced.state,
    {
      kind: "timer.fired",
      timerId: timer.timerId,
      generation: timer.generation,
    },
    timer.dueAt,
  );
  assert.equal(closed.accepted, true);
  assert.equal(
    closed.state.objectives.objectives["objective-a"].reservedBudgetUnits,
    0,
  );
  assert.equal(
    closed.state.allocation.reservations["allocation.reservation.offer-a"]
      .status,
    "released",
  );
  assert.equal(
    selectMeshAllocationBid(closed.state, {
      offerId: "offer-a",
      evaluatedAt: timer.dueAt,
    }).reason,
    "offer_closed",
  );
  assert.equal(
    evaluateMeshAllocationTimer(
      closed.state,
      {
        kind: "timer.fired",
        timerId: timer.timerId,
        generation: timer.generation,
      },
      timer.dueAt,
    ).code,
    "timer_unknown",
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(closed.state, {
      envelope: signedBid.verified,
      verifiedAt: at,
      receivedAt: timer.dueAt + 1,
    }).code,
    "bid_deadline_elapsed",
  );
  assert.equal(
    evaluateMeshAllocationCommand(
      closed.state,
      {
        kind: "allocation.offer",
        objectiveId: "objective-a",
        workItemId: "work-item-a",
        expectedWorkItemRevision: 1,
        recipients,
      },
      at,
      timer.dueAt,
    ).code,
    "offer_invalid",
  );
});

test("owner award atomically closes bids and a causal accept commits its reservation once", async () => {
  const { state, keys, resolver, signedBid } = await awardableAllocation();
  const award = await preparedAward(keys, resolver);
  assert.equal(
    evaluateMeshAllocationCommand(
      state,
      {
        kind: "allocation.award",
        offerId: "offer-a",
        bidId: "bid-not-selected",
        bidRevision: 1,
        recipient: {
          recipientPeerId: "peer-a",
          preparedAt: 9,
          envelope: award.signed,
        },
      },
      at,
      9,
    ).code,
    "bid_invalid",
  );
  const awarded = evaluateMeshAllocationCommand(
    state,
    {
      kind: "allocation.award",
      offerId: "offer-a",
      bidId: "bid-a",
      bidRevision: 1,
      recipient: {
        recipientPeerId: "peer-a",
        preparedAt: 9,
        envelope: award.signed,
      },
    },
    at,
    9,
  );
  assert.equal(awarded.accepted, true);
  assert.equal(awarded.effects.length, 1);
  assert.equal(awarded.effects[0].kind, "allocation.award.dispatch");
  assert.equal(
    awarded.state.allocation.workAllocations[
      JSON.stringify(["objective-a", "work-item-a"])
    ].phase,
    "award_pending",
  );
  assert.equal(
    awarded.state.allocation.localAwards["award-a"].assignmentAuthorityId,
    "award-a",
  );
  assert.equal(
    awarded.state.allocation.localAwards["award-a"].fencingToken,
    "award-a",
  );
  assert.equal(
    awarded.state.objectives.objectives["objective-a"].reservedBudgetUnits,
    100,
  );
  assert.equal(
    awarded.state.objectives.objectives["objective-a"].committedBudgetUnits,
    0,
  );
  assert.equal(
    evaluateMeshAllocationTimer(
      awarded.state,
      { kind: "timer.fired", timerId: "allocation.bid.offer-a", generation: 1 },
      10,
    ).code,
    "timer_unknown",
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(awarded.state, {
      envelope: signedBid.verified,
      verifiedAt: at,
      receivedAt: 10,
    }).code,
    "bid_deadline_elapsed",
  );
  const wrongCause = await preparedResponse(
    "work.accept",
    keys,
    resolver,
    "TAAAAAAAAAAAAAAAAAAAAA",
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(awarded.state, {
      envelope: wrongCause.verified,
      verifiedAt: at,
      receivedAt: 10,
    }).accepted,
    false,
  );
  const wrongAssignee = structuredClone(acceptFixture);
  wrongAssignee.messageId = "UAAAAAAAAAAAAAAAAAAAAA";
  wrongAssignee.sequence = 32;
  wrongAssignee.sentAt = "2026-07-30T00:00:03.000Z";
  wrongAssignee.expiresAt = "2026-07-30T00:00:12.000Z";
  wrongAssignee.sender = { peerId: "peer-c", instanceId: "instance-c" };
  wrongAssignee.audience = { kind: "peer", peerId: "peer-b" };
  wrongAssignee.proof.keyId = "key-c";
  wrongAssignee.causationId = award.signed.messageId;
  wrongAssignee.payload.assigneePeerId = "peer-c";
  const wrongAssigneeSigned = await signed(
    wrongAssignee,
    "peer-c",
    keys,
    resolver,
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(awarded.state, {
      envelope: wrongAssigneeSigned.verified,
      verifiedAt: at,
      receivedAt: 10,
    }).accepted,
    false,
  );
  const accept = await preparedResponse(
    "work.accept",
    keys,
    resolver,
    award.signed.messageId,
  );
  const accepted = evaluateVerifiedMeshAllocationEnvelope(awarded.state, {
    envelope: accept.verified,
    verifiedAt: at,
    receivedAt: 10,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(
    accepted.state.allocation.localAwards["award-a"].status,
    "accepted",
  );
  assert.equal(
    accepted.state.allocation.reservations["allocation.reservation.offer-a"]
      .status,
    "committed",
  );
  assert.equal(
    accepted.state.objectives.objectives["objective-a"].reservedBudgetUnits,
    0,
  );
  assert.equal(
    accepted.state.objectives.objectives["objective-a"].committedBudgetUnits,
    100,
  );
  const populatedV2 = structuredClone(accepted.state.allocation);
  populatedV2.schemaVersion = 2;
  delete populatedV2.receivedOffers;
  delete populatedV2.localBids;
  delete populatedV2.receivedAwards;
  delete populatedV2.localAssignmentResponses;
  delete populatedV2.assigneeAuthorities;
  delete populatedV2.limits.maximumReceivedOffers;
  delete populatedV2.limits.maximumLocalBids;
  delete populatedV2.limits.maximumReceivedAwards;
  delete populatedV2.limits.maximumLocalAssignmentResponses;
  delete populatedV2.limits.maximumAssignmentAuthorities;
  const migratedV2 = restoreMeshAllocationState(populatedV2);
  assert.equal(migratedV2.schemaVersion, 5);
  assert.deepEqual(
    migratedV2.localOffers,
    accepted.state.allocation.localOffers,
  );
  assert.deepEqual(
    migratedV2.localAwards,
    accepted.state.allocation.localAwards,
  );
  assert.deepEqual(
    migratedV2.assignmentResponses,
    accepted.state.allocation.assignmentResponses,
  );
  assert.deepEqual(
    migratedV2.workAllocations,
    accepted.state.allocation.workAllocations,
  );
  assert.deepEqual(
    migratedV2.reservations,
    accepted.state.allocation.reservations,
  );
  assert.equal(Object.keys(migratedV2.leaseHeads).length, 1);
  assert.deepEqual(migratedV2.leaseRenewals, Object.create(null));
  const mismatchedCommitTime = structuredClone(accepted.state.allocation);
  mismatchedCommitTime.reservations[
    "allocation.reservation.offer-a"
  ].committedAt = 9;
  assert.throws(
    () => restoreMeshAllocationState(mismatchedCommitTime),
    /committed allocation reservation binding/u,
  );
  const acceptanceTimer =
    awarded.state.coordination.timers["allocation.acceptance.award-a"];
  assert.equal(
    evaluateMeshAllocationTimer(
      accepted.state,
      {
        kind: "timer.fired",
        timerId: acceptanceTimer.timerId,
        generation: acceptanceTimer.generation,
      },
      acceptanceTimer.dueAt,
    ).code,
    "timer_unknown",
  );
  const repeatedAccept = evaluateVerifiedMeshAllocationEnvelope(
    accepted.state,
    {
      envelope: accept.verified,
      verifiedAt: at,
      receivedAt: 11,
    },
  );
  assert.equal(repeatedAccept.accepted, true);
  assert.equal(repeatedAccept.duplicate, true);
});

test("award commands fail closed on immutable terms, preparation metadata, and shape", async () => {
  const { state, keys, resolver } = await awardableAllocation();
  const wrongScope = await preparedAward(keys, resolver);
  const wrongScopeEnvelope = structuredClone(wrongScope.signed);
  wrongScopeEnvelope.objectiveId = "objective-other";
  wrongScopeEnvelope.payload.objectiveId = "objective-other";
  const resignedScope = await signed(
    wrongScopeEnvelope,
    "peer-b",
    keys,
    resolver,
  );
  assert.equal(
    evaluateMeshAllocationCommand(
      state,
      {
        kind: "allocation.award",
        offerId: "offer-a",
        bidId: "bid-a",
        bidRevision: 1,
        recipient: {
          recipientPeerId: "peer-a",
          preparedAt: 9,
          envelope: resignedScope.signed,
        },
      },
      at,
      9,
    ).code,
    "award_invalid",
  );
  const shortWork = await preparedAward(keys, resolver);
  const shortWorkEnvelope = structuredClone(shortWork.signed);
  shortWorkEnvelope.payload.workDeadline = "2026-07-30T00:00:20.000Z";
  assert.rejects(
    () => signed(shortWorkEnvelope, "peer-b", keys, resolver),
    /invalid_envelope/u,
  );
  const tooLong = await preparedAward(keys, resolver);
  const tooLongEnvelope = structuredClone(tooLong.signed);
  tooLongEnvelope.payload.leaseExpiresAt = "2026-07-31T00:00:00.000Z";
  assert.rejects(
    () => signed(tooLongEnvelope, "peer-b", keys, resolver),
    /invalid_envelope/u,
  );
  const valid = await preparedAward(keys, resolver);
  assert.equal(
    evaluateMeshAllocationCommand(
      state,
      {
        kind: "allocation.award",
        offerId: "offer-a",
        bidId: "bid-a",
        bidRevision: 1,
        recipient: {
          recipientPeerId: "peer-a",
          preparedAt: 8,
          envelope: valid.signed,
        },
      },
      at,
      9,
    ).code,
    "award_invalid",
  );
  assert.throws(
    () =>
      evaluateMeshAllocationCommand(
        state,
        {
          kind: "allocation.award",
          offerId: "offer-a",
          bidId: "bid-a",
          bidRevision: 1,
          recipient: {
            recipientPeerId: "peer-a",
            preparedAt: 9,
            envelope: valid.signed,
          },
          extra: true,
        },
        at,
        9,
      ),
    /invalid mesh local award command/iu,
  );
  assert.throws(
    () =>
      evaluateMeshAllocationCommand(
        state,
        {
          kind: "allocation.offer",
          objectiveId: "objective-a",
          workItemId: "work-item-a",
          expectedWorkItemRevision: 1,
          recipients: [],
          extra: true,
        },
        at,
        9,
      ),
    /invalid mesh local offer command/iu,
  );
  assert.throws(
    () =>
      evaluateMeshAllocationCommand(
        state,
        {
          kind: "allocation.offer",
          objectiveId: "objective-a",
          workItemId: "work-item-a",
          expectedWorkItemRevision: 1,
          recipients: [
            {
              recipientPeerId: "peer-a",
              preparedAt: 9,
              envelope: valid.signed,
              extra: true,
            },
          ],
        },
        at,
        9,
      ),
    /invalid mesh local offer command/iu,
  );
  assert.throws(
    () =>
      selectMeshAllocationBid(state, {
        offerId: "offer-a",
        evaluatedAt: 9,
        extra: true,
      }),
    /invalid mesh allocation selection input/iu,
  );
});

test("award rejects a stale Objective revision while an accepted award keeps its frozen revision until cancellation", async () => {
  const awardable = await awardableAllocation();
  const revision = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      awardable.state.coordination,
      awardable.state.discovery,
      awardable.state.objectives,
    ),
    request(revise, 9),
  );
  assert.equal(revision.accepted, true);
  const revisedBeforeAward = createMeshAllocationRuntimeState(
    revision.state.coordination,
    revision.state.discovery,
    revision.state.objectives,
    restoreMeshAllocationState({
      ...awardable.state.allocation,
      lastLogicalTime: 9,
    }),
  );
  const staleAward = await preparedAward(awardable.keys, awardable.resolver);
  const staleDecision = evaluateMeshAllocationCommand(
    revisedBeforeAward,
    {
      kind: "allocation.award",
      offerId: "offer-a",
      bidId: "bid-a",
      bidRevision: 1,
      recipient: {
        recipientPeerId: "peer-a",
        preparedAt: 10,
        envelope: staleAward.signed,
      },
    },
    at,
    10,
  );
  assert.equal(staleDecision.accepted, false);
  assert.equal(staleDecision.state, revisedBeforeAward);

  const pending = await pendingAward();
  const restrictiveRevision = structuredClone(revise);
  restrictiveRevision.payload.acceptanceWindowMs = 1;
  restrictiveRevision.payload.maximumLeaseDurationMs = 1;
  const revisedPending = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      pending.state.coordination,
      pending.state.discovery,
      pending.state.objectives,
    ),
    request(restrictiveRevision, 10),
  );
  assert.equal(revisedPending.accepted, true);
  const pendingUnderRevision = createMeshAllocationRuntimeState(
    revisedPending.state.coordination,
    revisedPending.state.discovery,
    revisedPending.state.objectives,
    restoreMeshAllocationState({
      ...pending.state.allocation,
      lastLogicalTime: 10,
    }),
  );
  const response = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const accepted = evaluateVerifiedMeshAllocationEnvelope(
    pendingUnderRevision,
    {
      envelope: response.verified,
      verifiedAt: at,
      receivedAt: 11,
    },
  );
  assert.equal(accepted.accepted, true);

  const cancelledPending = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      pendingUnderRevision.coordination,
      pendingUnderRevision.discovery,
      pendingUnderRevision.objectives,
    ),
    request(cancel, 11),
  );
  assert.equal(cancelledPending.accepted, true);
  const cancelledRuntime = createMeshAllocationRuntimeState(
    cancelledPending.state.coordination,
    cancelledPending.state.discovery,
    cancelledPending.state.objectives,
    restoreMeshAllocationState({
      ...pendingUnderRevision.allocation,
      lastLogicalTime: 11,
    }),
  );
  const rejected = evaluateVerifiedMeshAllocationEnvelope(cancelledRuntime, {
    envelope: response.verified,
    verifiedAt: at,
    receivedAt: 12,
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.state, cancelledRuntime);
});

test("award policy ceilings use the signed intervals even after delayed verification", async () => {
  const acceptance = await awardableAllocation();
  const acceptanceEnvelope = structuredClone(
    (await preparedAward(acceptance.keys, acceptance.resolver)).signed,
  );
  Object.assign(acceptanceEnvelope, {
    sentAt: "2026-07-30T00:00:00.000Z",
    expiresAt: "2026-07-30T00:00:40.000Z",
  });
  Object.assign(acceptanceEnvelope.payload, {
    leaseStartsAt: "2026-07-30T00:00:00.000Z",
    acceptanceDeadline: "2026-07-30T00:00:40.000Z",
    leaseExpiresAt: "2026-07-30T00:00:45.000Z",
  });
  const signedAcceptance = await signed(
    acceptanceEnvelope,
    "peer-b",
    acceptance.keys,
    acceptance.resolver,
  );
  const delayedAcceptance = await verifyMeshEnvelope({
    envelope: signedAcceptance.signed,
    resolver: acceptance.resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt: "2026-07-30T00:00:35.000Z",
  });
  assert.equal(delayedAcceptance.verified, true);
  const acceptanceDecision = evaluateMeshAllocationCommand(
    acceptance.state,
    {
      kind: "allocation.award",
      offerId: "offer-a",
      bidId: "bid-a",
      bidRevision: 1,
      recipient: {
        recipientPeerId: "peer-a",
        preparedAt: 9,
        envelope: signedAcceptance.signed,
      },
    },
    "2026-07-30T00:00:35.000Z",
    9,
  );
  assert.equal(acceptanceDecision.accepted, false);
  assert.equal(acceptanceDecision.state, acceptance.state);

  const lease = await awardableAllocation({
    acceptanceWindowMs: 60_000,
    maximumLeaseDurationMs: 10_000,
  });
  const leaseEnvelope = structuredClone(
    (await preparedAward(lease.keys, lease.resolver)).signed,
  );
  Object.assign(leaseEnvelope, {
    sentAt: "2026-07-30T00:00:00.000Z",
    expiresAt: "2026-07-30T00:00:59.000Z",
  });
  Object.assign(leaseEnvelope.payload, {
    leaseStartsAt: "2026-07-30T00:00:00.000Z",
    acceptanceDeadline: "2026-07-30T00:00:59.000Z",
    leaseExpiresAt: "2026-07-30T00:01:00.000Z",
  });
  const signedLease = await signed(
    leaseEnvelope,
    "peer-b",
    lease.keys,
    lease.resolver,
  );
  const delayedLease = await verifyMeshEnvelope({
    envelope: signedLease.signed,
    resolver: lease.resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt: "2026-07-30T00:00:55.000Z",
  });
  assert.equal(delayedLease.verified, true);
  const leaseDecision = evaluateMeshAllocationCommand(
    lease.state,
    {
      kind: "allocation.award",
      offerId: "offer-a",
      bidId: "bid-a",
      bidRevision: 1,
      recipient: {
        recipientPeerId: "peer-a",
        preparedAt: 9,
        envelope: signedLease.signed,
      },
    },
    "2026-07-30T00:00:55.000Z",
    9,
  );
  assert.equal(leaseDecision.accepted, false);
  assert.equal(leaseDecision.state, lease.state);
});

test("offer policy uses each signed bid-window interval after delayed verification", async () => {
  const { state, keys, resolver } = await allocationRuntime({
    bidWindowMs: 10_000,
  });
  const recipients = await Promise.all(
    [
      ["peer-a", "TAAAAAAAAAAAAAAAAAAAAA"],
      ["peer-c", "UAAAAAAAAAAAAAAAAAAAAA"],
    ].map(async ([peerId, messageId], index) => {
      const envelope = structuredClone(offerFixture);
      envelope.messageId = messageId;
      envelope.sequence = 50 + index;
      envelope.sender = { peerId: "peer-b", instanceId: "instance-b" };
      envelope.audience = { kind: "peer", peerId };
      envelope.proof.keyId = "key-b";
      envelope.payload.ownerPeerId = "peer-b";
      return {
        recipientPeerId: peerId,
        preparedAt: 7,
        envelope: (await signed(envelope, "peer-b", keys, resolver)).signed,
      };
    }),
  );
  const decision = evaluateMeshAllocationCommand(
    state,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
      recipients,
    },
    "2026-07-30T00:00:55.000Z",
    7,
  );
  assert.equal(decision.accepted, false);
  assert.equal(decision.state, state);
});

test("assignment responses reject mismatched authority, boundary time, cross-terminal records, and reused message IDs", async () => {
  const pending = await pendingAward();
  const missingAward = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const missingAwardEnvelope = structuredClone(missingAward.signed);
  missingAwardEnvelope.payload.awardId = "award-missing";
  const resignedMissingAward = await signed(
    missingAwardEnvelope,
    "peer-a",
    pending.keys,
    pending.resolver,
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(pending.state, {
      envelope: resignedMissingAward.verified,
      verifiedAt: at,
      receivedAt: 10,
    }).code,
    "award_missing",
  );
  const wrongAuthority = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const forgedAuthority = structuredClone(wrongAuthority.signed);
  forgedAuthority.payload.assignmentAuthorityId = "other-award";
  forgedAuthority.payload.fencingToken = "other-award";
  const resigned = await signed(
    forgedAuthority,
    "peer-a",
    pending.keys,
    pending.resolver,
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(pending.state, {
      envelope: resigned.verified,
      verifiedAt: at,
      receivedAt: 10,
    }).code,
    "assignment_response_invalid",
  );
  const response = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const timer =
    pending.state.coordination.timers["allocation.acceptance.award-a"];
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(pending.state, {
      envelope: response.verified,
      verifiedAt: at,
      receivedAt: timer.dueAt,
    }).code,
    "assignment_response_deadline_elapsed",
  );
  const reusedMessage = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const reusedEnvelope = structuredClone(reusedMessage.signed);
  reusedEnvelope.messageId = pending.award.signed.messageId;
  const reusedSigned = await signed(
    reusedEnvelope,
    "peer-a",
    pending.keys,
    pending.resolver,
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(pending.state, {
      envelope: reusedSigned.verified,
      verifiedAt: at,
      receivedAt: 10,
    }).code,
    "assignment_response_duplicate_conflict",
  );
  const accepted = evaluateVerifiedMeshAllocationEnvelope(pending.state, {
    envelope: response.verified,
    verifiedAt: at,
    receivedAt: 10,
  });
  assert.equal(accepted.accepted, true);
  const duplicate = evaluateVerifiedMeshAllocationEnvelope(accepted.state, {
    envelope: response.verified,
    verifiedAt: at,
    receivedAt: 11,
  });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  const sameIdDifferentEnvelope = structuredClone(response.signed);
  sameIdDifferentEnvelope.causationId = "ZAAAAAAAAAAAAAAAAAAAAA";
  const resignedDuplicate = await signed(
    sameIdDifferentEnvelope,
    "peer-a",
    pending.keys,
    pending.resolver,
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(accepted.state, {
      envelope: resignedDuplicate.verified,
      verifiedAt: at,
      receivedAt: 11,
    }).code,
    "assignment_response_duplicate_conflict",
  );
  const activeUpdatedAt = structuredClone(accepted.state.allocation);
  activeUpdatedAt.workAllocations[
    JSON.stringify(["objective-a", "work-item-a"])
  ].updatedAt -= 1;
  assert.throws(
    () => restoreMeshAllocationState(activeUpdatedAt),
    /active Work allocation/u,
  );
  const decline = await preparedResponse(
    "work.decline",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(accepted.state, {
      envelope: decline.verified,
      verifiedAt: at,
      receivedAt: 11,
    }).code,
    "assignment_response_duplicate_conflict",
  );
});

test("decline and acceptance timeout release a pending award exactly once", async () => {
  const first = await awardableAllocation();
  const award = await preparedAward(first.keys, first.resolver);
  const awarded = evaluateMeshAllocationCommand(
    first.state,
    {
      kind: "allocation.award",
      offerId: "offer-a",
      bidId: "bid-a",
      bidRevision: 1,
      recipient: {
        recipientPeerId: "peer-a",
        preparedAt: 9,
        envelope: award.signed,
      },
    },
    at,
    9,
  );
  assert.equal(awarded.accepted, true);
  const decline = await preparedResponse(
    "work.decline",
    first.keys,
    first.resolver,
    award.signed.messageId,
  );
  const declined = evaluateVerifiedMeshAllocationEnvelope(awarded.state, {
    envelope: decline.verified,
    verifiedAt: at,
    receivedAt: 10,
  });
  assert.equal(declined.accepted, true);
  assert.equal(
    declined.state.allocation.localAwards["award-a"].status,
    "declined",
  );
  assert.equal(
    declined.state.allocation.reservations["allocation.reservation.offer-a"]
      .status,
    "released",
  );
  assert.equal(
    declined.state.objectives.objectives["objective-a"].reservedBudgetUnits,
    0,
  );
  assert.equal(
    declined.state.objectives.objectives["objective-a"].committedBudgetUnits,
    0,
  );
  const readyUpdatedAt = structuredClone(declined.state.allocation);
  readyUpdatedAt.workAllocations[
    JSON.stringify(["objective-a", "work-item-a"])
  ].updatedAt -= 1;
  assert.throws(
    () => restoreMeshAllocationState(readyUpdatedAt),
    /ready Work allocation/u,
  );
  const mismatchedDeclineTime = structuredClone(declined.state.allocation);
  mismatchedDeclineTime.reservations[
    "allocation.reservation.offer-a"
  ].releasedAt = 9;
  assert.throws(
    () => restoreMeshAllocationState(mismatchedDeclineTime),
    /released allocation reservation time/u,
  );

  const second = await awardableAllocation();
  const secondAward = await preparedAward(second.keys, second.resolver);
  const pending = evaluateMeshAllocationCommand(
    second.state,
    {
      kind: "allocation.award",
      offerId: "offer-a",
      bidId: "bid-a",
      bidRevision: 1,
      recipient: {
        recipientPeerId: "peer-a",
        preparedAt: 9,
        envelope: secondAward.signed,
      },
    },
    at,
    9,
  );
  assert.equal(pending.accepted, true);
  const timer =
    pending.state.coordination.timers["allocation.acceptance.award-a"];
  const fullJournalSnapshot = structuredClone(pending.state.coordination);
  fullJournalSnapshot.limits.maximumJournalEntries =
    fullJournalSnapshot.journal.length;
  const fullJournalRuntime = createMeshAllocationRuntimeState(
    restoreMeshCoordinationState(fullJournalSnapshot),
    pending.state.discovery,
    pending.state.objectives,
    pending.state.allocation,
  );
  const saturatedTimeout = evaluateMeshAllocationTimer(
    fullJournalRuntime,
    {
      kind: "timer.fired",
      timerId: timer.timerId,
      generation: timer.generation,
    },
    timer.dueAt,
  );
  assert.equal(saturatedTimeout.accepted, false);
  assert.equal(saturatedTimeout.code, "journal_capacity_exceeded");
  assert.equal(saturatedTimeout.state, fullJournalRuntime);
  const timedOut = evaluateMeshAllocationTimer(
    pending.state,
    {
      kind: "timer.fired",
      timerId: timer.timerId,
      generation: timer.generation,
    },
    timer.dueAt,
  );
  assert.equal(timedOut.accepted, true);
  assert.equal(
    timedOut.state.allocation.localAwards["award-a"].status,
    "timed_out",
  );
  assert.equal(
    timedOut.state.allocation.reservations["allocation.reservation.offer-a"]
      .status,
    "released",
  );
  assert.equal(
    timedOut.state.objectives.objectives["objective-a"].reservedBudgetUnits,
    0,
  );
  const prematureTimeout = structuredClone(timedOut.state.allocation);
  prematureTimeout.reservations["allocation.reservation.offer-a"].releasedAt =
    timer.dueAt - 1;
  assert.throws(
    () => restoreMeshAllocationState(prematureTimeout),
    /released allocation reservation time/u,
  );
  const lateAccept = await preparedResponse(
    "work.accept",
    second.keys,
    second.resolver,
    secondAward.signed.messageId,
  );
  assert.equal(
    evaluateVerifiedMeshAllocationEnvelope(timedOut.state, {
      envelope: lateAccept.verified,
      verifiedAt: at,
      receivedAt: timer.dueAt,
    }).accepted,
    false,
  );
  assert.equal(
    evaluateMeshAllocationTimer(
      timedOut.state,
      {
        kind: "timer.fired",
        timerId: timer.timerId,
        generation: timer.generation,
      },
      timer.dueAt,
    ).code,
    "timer_unknown",
  );
});

test("a terminal award consumes its owner assignment epoch across a causal reoffer", async () => {
  const pending = await pendingAward();
  const decline = await preparedResponse(
    "work.decline",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const declined = evaluateVerifiedMeshAllocationEnvelope(pending.state, {
    envelope: decline.verified,
    verifiedAt: at,
    receivedAt: 10,
  });
  assert.equal(declined.accepted, true);
  assert.equal(
    declined.state.allocation.localAwards["award-a"].status,
    "declined",
  );

  const firstOffer = declined.state.allocation.localOffers["offer-a"];
  const recipients = await Promise.all(
    [
      ["peer-a", "TAAAAAAAAAAAAAAAAAAAAA", 40],
      ["peer-c", "UAAAAAAAAAAAAAAAAAAAAA", 41],
    ].map(async ([peerId, messageId, sequence]) => {
      const envelope = structuredClone(offerFixture);
      envelope.messageId = messageId;
      envelope.sequence = sequence;
      envelope.sender = { peerId: "peer-b", instanceId: "instance-b" };
      envelope.audience = { kind: "peer", peerId };
      envelope.proof.keyId = "key-b";
      envelope.causationId = firstOffer.recipientOffers[peerId].messageId;
      Object.assign(envelope.payload, {
        offerId: "offer-b",
        offerAttempt: 2,
        previousOfferId: "offer-a",
        ownerPeerId: "peer-b",
      });
      return {
        recipientPeerId: peerId,
        preparedAt: 11,
        envelope: (
          await signed(envelope, "peer-b", pending.keys, pending.resolver)
        ).signed,
      };
    }),
  );
  const reoffered = evaluateMeshAllocationCommand(
    declined.state,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
      recipients,
    },
    at,
    11,
  );
  assert.equal(reoffered.accepted, true, reoffered.code);

  const bid = structuredClone(bidFixture);
  Object.assign(bid, {
    messageId: "VAAAAAAAAAAAAAAAAAAAAA",
    sequence: 42,
    sender: { peerId: "peer-a", instanceId: "instance-a" },
    audience: { kind: "peer", peerId: "peer-b" },
    causationId: recipients[0].envelope.messageId,
    proof: { ...bid.proof, keyId: "key-a" },
  });
  Object.assign(bid.payload, {
    bidId: "bid-b",
    offerId: "offer-b",
    offerAttempt: 2,
    bidderPeerId: "peer-a",
  });
  const signedBid = await signed(bid, "peer-a", pending.keys, pending.resolver);
  const bidded = evaluateVerifiedMeshAllocationEnvelope(reoffered.state, {
    envelope: signedBid.verified,
    verifiedAt: at,
    receivedAt: 12,
  });
  assert.equal(bidded.accepted, true, bidded.code);

  const replacementAward = structuredClone(awardFixture);
  Object.assign(replacementAward, {
    messageId: "WAAAAAAAAAAAAAAAAAAAAA",
    sequence: 43,
    sentAt: "2026-07-30T00:00:02.000Z",
    expiresAt: "2026-07-30T00:00:12.000Z",
    sender: { peerId: "peer-b", instanceId: "instance-b" },
    audience: { kind: "peer", peerId: "peer-a" },
    causationId: signedBid.signed.messageId,
    proof: { ...replacementAward.proof, keyId: "key-b" },
  });
  Object.assign(replacementAward.payload, {
    awardId: "award-b",
    offerId: "offer-b",
    bidId: "bid-b",
    bidRevision: 1,
    offerAttempt: 2,
    ownerPeerId: "peer-b",
    assigneePeerId: "peer-a",
    assignmentEpoch: 1,
    authorityKind: "award",
    assignmentAuthorityId: "award-b",
    fencingToken: "award-b",
    leaseStartsAt: "2026-07-30T00:00:02.000Z",
    acceptanceDeadline: "2026-07-30T00:00:15.000Z",
    leaseExpiresAt: "2026-07-30T00:00:25.000Z",
  });
  const signedReplacement = await signed(
    replacementAward,
    "peer-b",
    pending.keys,
    pending.resolver,
  );
  const rejected = evaluateMeshAllocationCommand(
    bidded.state,
    {
      kind: "allocation.award",
      offerId: "offer-b",
      bidId: "bid-b",
      bidRevision: 1,
      recipient: {
        recipientPeerId: "peer-a",
        preparedAt: 13,
        envelope: signedReplacement.signed,
      },
    },
    at,
    13,
  );
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, "award_invalid");

  const forged = structuredClone(bidded.state.allocation);
  const forgedAward = structuredClone(forged.localAwards["award-a"]);
  Object.assign(forgedAward, {
    awardId: "award-b",
    offerId: "offer-b",
    bidId: "bid-b",
    bidRevision: 1,
    offerAttempt: 2,
    assignmentAuthorityId: "award-b",
    fencingToken: "award-b",
    reservationId: "allocation.reservation.offer-b",
    acceptanceDeadlineAt: 14_013,
    acceptanceDeadlineTimerId: "allocation.acceptance.award-b",
    leaseExpiresAtLogical: 24_013,
    createdAt: 13,
    validityVerifiedAt: at,
    status: "timed_out",
    recipientAward: {
      recipientPeerId: "peer-a",
      messageId: signedReplacement.signed.messageId,
      preparedAt: 13,
      envelope: signedReplacement.signed,
    },
  });
  forged.localAwards["award-b"] = forgedAward;
  forged.lastLogicalTime = 13;
  assert.throws(
    () => restoreMeshAllocationState(forged),
    /local award assignment scope is not unique/u,
  );
});

test("allocation v1 snapshots migrate and award restoration rejects forged bindings", async () => {
  const v1 = structuredClone(createMeshAllocationState({ identity }));
  v1.schemaVersion = 1;
  v1.limits.maximumOffers = 7;
  delete v1.localAwards;
  delete v1.assignmentResponses;
  delete v1.limits.maximumAwards;
  delete v1.limits.maximumAssignmentResponses;
  const migrated = restoreMeshAllocationState(v1);
  assert.equal(migrated.schemaVersion, 5);
  assert.equal(migrated.limits.maximumOffers, 7);
  assert.deepEqual(migrated.leaseHeads, Object.create(null));
  assert.deepEqual(migrated.leaseRenewals, Object.create(null));

  const { state, keys, resolver } = await awardableAllocation();
  const populatedV1 = structuredClone(state.allocation);
  populatedV1.schemaVersion = 1;
  delete populatedV1.localAwards;
  delete populatedV1.assignmentResponses;
  delete populatedV1.limits.maximumAwards;
  delete populatedV1.limits.maximumAssignmentResponses;
  for (const offer of Object.values(populatedV1.localOffers))
    delete offer.validityVerifiedAt;
  const migratedPopulated = restoreMeshAllocationState(populatedV1);
  assert.equal(
    migratedPopulated.localOffers["offer-a"].validityVerifiedAt,
    "2026-07-30T00:00:01.000000000Z",
  );

  const offeredUpdatedAt = structuredClone(state.allocation);
  offeredUpdatedAt.workAllocations[
    JSON.stringify(["objective-a", "work-item-a"])
  ].updatedAt -= 1;
  assert.throws(
    () => restoreMeshAllocationState(offeredUpdatedAt),
    /offered Work allocation/u,
  );

  const orphanedWork = structuredClone(state.allocation);
  orphanedWork.localOffers = {};
  orphanedWork.bidHeads = {};
  orphanedWork.acceptedBidEvidence = {};
  orphanedWork.reservations = {};
  Object.assign(
    orphanedWork.workAllocations[
      JSON.stringify(["objective-a", "work-item-a"])
    ],
    {
      phase: "ready",
      activeOfferId: undefined,
      bidDeadlineAt: undefined,
      reservationId: undefined,
    },
  );
  assert.throws(
    () => restoreMeshAllocationState(orphanedWork),
    /Work allocation is orphaned/u,
  );

  const forgedOfferDeadline = structuredClone(state.allocation);
  forgedOfferDeadline.localOffers["offer-a"].bidDeadlineAt += 1;
  assert.throws(
    () => restoreMeshAllocationState(forgedOfferDeadline),
    /predecessor or timer|deadline/u,
  );

  const award = await preparedAward(keys, resolver);
  const awarded = evaluateMeshAllocationCommand(
    state,
    {
      kind: "allocation.award",
      offerId: "offer-a",
      bidId: "bid-a",
      bidRevision: 1,
      recipient: {
        recipientPeerId: "peer-a",
        preparedAt: 9,
        envelope: award.signed,
      },
    },
    at,
    9,
  );
  assert.equal(awarded.accepted, true);
  const forged = structuredClone(awarded.state.allocation);
  forged.localAwards["award-a"].assignmentAuthorityId = "forged-award";
  assert.throws(
    () => restoreMeshAllocationState(forged),
    /authority|award|binding/u,
  );

  const pendingUpdatedAt = structuredClone(awarded.state.allocation);
  pendingUpdatedAt.workAllocations[
    JSON.stringify(["objective-a", "work-item-a"])
  ].updatedAt -= 1;
  assert.throws(
    () => restoreMeshAllocationState(pendingUpdatedAt),
    /pending award Work allocation/u,
  );
});

test("allocation v1 migration preserves sub-millisecond bid deadlines without predating signed offers", async () => {
  const { state, keys } = await allocationRuntime();
  const sentAt = "2026-07-30T00:00:00.000000000Z";
  const bidDeadline = "2026-07-30T00:00:00.001500000Z";
  const recipients = await Promise.all(
    [
      ["peer-a", "NAAAAAAAAAAAAAAAAAAAAA", 60],
      ["peer-c", "MAAAAAAAAAAAAAAAAAAAAA", 61],
    ].map(async ([peerId, messageId, sequence]) => {
      const envelope = structuredClone(offerFixture);
      envelope.messageId = messageId;
      envelope.sequence = sequence;
      envelope.sentAt = sentAt;
      envelope.expiresAt = bidDeadline;
      envelope.sender = { peerId: "peer-b", instanceId: "instance-b" };
      envelope.audience = { kind: "peer", peerId };
      envelope.proof.keyId = "key-b";
      envelope.payload.ownerPeerId = "peer-b";
      envelope.payload.bidDeadline = bidDeadline;
      return {
        recipientPeerId: peerId,
        preparedAt: 7,
        envelope: await signMeshEnvelope({
          envelope,
          privateKey: keys["peer-b"].privateKey,
        }),
      };
    }),
  );
  const offered = evaluateMeshAllocationCommand(
    state,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
      recipients,
    },
    sentAt,
    7,
  );
  assert.equal(offered.accepted, true, offered.code);
  assert.equal(
    offered.state.allocation.localOffers["offer-a"].bidDeadlineAt,
    9,
  );

  const v1 = structuredClone(offered.state.allocation);
  v1.schemaVersion = 1;
  delete v1.localAwards;
  delete v1.assignmentResponses;
  delete v1.limits.maximumAwards;
  delete v1.limits.maximumAssignmentResponses;
  delete v1.localOffers["offer-a"].validityVerifiedAt;
  const migrated = restoreMeshAllocationState(v1);
  assert.equal(migrated.localOffers["offer-a"].validityVerifiedAt, sentAt);
  assert.equal(migrated.localOffers["offer-a"].bidDeadlineAt, 9);
});

test("award snapshots reject forged fields, domains, timers, accounting, and terminal bindings", async () => {
  const pending = await pendingAward();
  const forgedReservedAt = structuredClone(pending.state.allocation);
  forgedReservedAt.reservations["allocation.reservation.offer-a"].reservedAt -=
    1;
  assert.throws(
    () => restoreMeshAllocationState(forgedReservedAt),
    /reservation binding/u,
  );
  const earlyBid = structuredClone(pending.state.allocation);
  earlyBid.acceptedBidEvidence["bid-a"].acceptedAt =
    earlyBid.localOffers["offer-a"].createdAt - 1;
  earlyBid.bidHeads[JSON.stringify(["offer-a", "peer-a"])].acceptedAt =
    earlyBid.localOffers["offer-a"].createdAt - 1;
  assert.throws(
    () => restoreMeshAllocationState(earlyBid),
    /accepted bid evidence/u,
  );

  const awardBeforeBid = structuredClone(pending.state.allocation);
  const awardProjection = awardBeforeBid.localAwards["award-a"];
  awardProjection.createdAt = 7;
  awardProjection.recipientAward.preparedAt = 7;
  awardProjection.acceptanceDeadlineAt -= 2;
  awardProjection.leaseExpiresAtLogical -= 2;
  assert.throws(() => restoreMeshAllocationState(awardBeforeBid), /award/u);

  const extra = structuredClone(pending.state.allocation);
  extra.localAwards["award-a"].unexpected = true;
  assert.throws(() => restoreMeshAllocationState(extra), /invalid keys/u);

  const forgedDeadline = structuredClone(pending.state.allocation);
  forgedDeadline.localAwards["award-a"].acceptanceDeadlineAt += 1;
  assert.throws(
    () => restoreMeshAllocationState(forgedDeadline),
    /deadline|logical|award/u,
  );

  const optionalField = structuredClone(pending.state.allocation);
  optionalField.workAllocations[
    JSON.stringify(["objective-a", "work-item-a"])
  ].activeAcceptanceId = "acceptance-smuggled";
  assert.throws(
    () => restoreMeshAllocationState(optionalField),
    /invalid keys|pending award Work allocation/u,
  );

  const committedWithoutAccept = structuredClone(pending.state.allocation);
  const reservation =
    committedWithoutAccept.reservations["allocation.reservation.offer-a"];
  reservation.status = "committed";
  reservation.committedAt = 9;
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        pending.state.coordination,
        pending.state.discovery,
        pending.state.objectives,
        restoreMeshAllocationState(committedWithoutAccept),
      ),
    /award|reservation|accounting|immutable snapshot/u,
  );

  const acceptedWithDecline = structuredClone(pending.state.allocation);
  acceptedWithDecline.localAwards["award-a"].status = "accepted";
  assert.throws(
    () => restoreMeshAllocationState(acceptedWithDecline),
    /award|response|reservation/u,
  );

  for (const [field, value] of [
    ["recordType", "work.bid"],
    ["recordId", "award-other"],
    ["acceptedAt", 8],
  ]) {
    const coordination = structuredClone(pending.state.coordination);
    coordination.domainRecords[JSON.stringify(["work.award", "award-a"])][
      field
    ] = value;
    assert.throws(
      () =>
        createMeshAllocationRuntimeState(
          restoreMeshCoordinationState(coordination),
          pending.state.discovery,
          pending.state.objectives,
          pending.state.allocation,
        ),
      /award|domain|binding/u,
      field,
    );
  }

  const duplicateDomainMessage = structuredClone(pending.state.coordination);
  const domainRecords = Object.values(duplicateDomainMessage.domainRecords);
  domainRecords[1].messageId = domainRecords[0].messageId;
  assert.throws(
    () => restoreMeshCoordinationState(duplicateDomainMessage),
    /domain messageId is not unique/u,
  );

  const crossDomainAllocation = structuredClone(pending.state.allocation);
  const offerDomainKey = JSON.stringify(["work.offer", "offer-a"]);
  const foreignDomain = Object.entries(
    pending.state.coordination.domainRecords,
  ).find(([key]) => key !== offerDomainKey)?.[1];
  assert.ok(foreignDomain);
  const offerRecipients =
    crossDomainAllocation.localOffers["offer-a"].recipientOffers;
  const unselectedRecipient = Object.values(offerRecipients).find(
    (prepared) =>
      prepared.messageId !==
      pending.state.coordination.domainRecords[offerDomainKey].messageId,
  );
  assert.ok(unselectedRecipient);
  unselectedRecipient.messageId = foreignDomain.messageId;
  unselectedRecipient.envelope.messageId = foreignDomain.messageId;
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        pending.state.coordination,
        pending.state.discovery,
        pending.state.objectives,
        restoreMeshAllocationState(crossDomainAllocation),
      ),
    /offer domain record binding/u,
  );

  const orphanTimer = structuredClone(pending.state.coordination);
  delete orphanTimer.timers["allocation.acceptance.award-a"];
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        restoreMeshCoordinationState(orphanTimer),
        pending.state.discovery,
        pending.state.objectives,
        pending.state.allocation,
      ),
    /timer|award|binding/u,
  );

  const extraTimer = structuredClone(pending.state.coordination);
  extraTimer.timers["allocation.acceptance.orphan"] = {
    ...extraTimer.timers["allocation.acceptance.award-a"],
    timerId: "allocation.acceptance.orphan",
  };
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        restoreMeshCoordinationState(extraTimer),
        pending.state.discovery,
        pending.state.objectives,
        pending.state.allocation,
      ),
    /acceptance timer is orphaned/u,
  );
});

test("award snapshot restoration binds local evidence to its state identity and immutable award terms", async () => {
  const pending = await pendingAward();
  const alterAward = async (mutate) => {
    const snapshot = structuredClone(pending.state.allocation);
    const envelope = snapshot.localAwards["award-a"].recipientAward.envelope;
    mutate(envelope);
    snapshot.localAwards["award-a"].recipientAward.envelope =
      await signMeshEnvelope({
        envelope,
        privateKey: pending.keys["peer-b"].privateKey,
      });
    return snapshot;
  };

  for (const [label, mutate] of [
    ["tenant", (envelope) => (envelope.tenantId = "tenant-other")],
    ["mesh", (envelope) => (envelope.meshId = "mesh-other")],
    [
      "objective",
      (envelope) => {
        envelope.objectiveId = "objective-other";
        envelope.payload.objectiveId = "objective-other";
      },
    ],
  ]) {
    const snapshot = await alterAward(mutate);
    assert.throws(
      () => restoreMeshAllocationState(snapshot),
      /award|binding|scope|identity/u,
      label,
    );
  }

  const mismatchedPreparedAt = structuredClone(pending.state.allocation);
  mismatchedPreparedAt.localAwards["award-a"].recipientAward.preparedAt = 8;
  assert.throws(
    () => restoreMeshAllocationState(mismatchedPreparedAt),
    /prepared|award|binding/u,
  );

  const mismatchedWorkBinding = structuredClone(pending.state.allocation);
  mismatchedWorkBinding.localAwards["award-a"].work.inputSummary =
    "A forged award-local Work snapshot.";
  assert.throws(
    () => restoreMeshAllocationState(mismatchedWorkBinding),
    /award|binding/u,
  );

  const response = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const accepted = evaluateVerifiedMeshAllocationEnvelope(pending.state, {
    envelope: response.verified,
    verifiedAt: at,
    receivedAt: 10,
    supportedCriticalExtensions: ["extension.example"],
  });
  assert.equal(accepted.accepted, true);
  const mutableExtensions = structuredClone(accepted.state.allocation);
  const restored = restoreMeshAllocationState(mutableExtensions);
  assert.equal(
    Object.isFrozen(
      restored.assignmentResponses["award-a"].supportedCriticalExtensions,
    ),
    true,
  );

  const earlyResponse = structuredClone(accepted.state.allocation);
  earlyResponse.assignmentResponses["award-a"].acceptedAt = 8;
  assert.throws(
    () => restoreMeshAllocationState(earlyResponse),
    /response evidence binding/u,
  );

  const lateResponse = structuredClone(accepted.state.allocation);
  lateResponse.assignmentResponses["award-a"].acceptedAt =
    lateResponse.localAwards["award-a"].acceptanceDeadlineAt;
  lateResponse.lastLogicalTime =
    lateResponse.localAwards["award-a"].acceptanceDeadlineAt;
  assert.throws(
    () => restoreMeshAllocationState(lateResponse),
    /response evidence binding/u,
  );

  const duplicateExtensions = structuredClone(accepted.state.allocation);
  duplicateExtensions.assignmentResponses[
    "award-a"
  ].supportedCriticalExtensions = ["extension.example", "extension.example"];
  assert.throws(
    () => restoreMeshAllocationState(duplicateExtensions),
    /critical extensions/u,
  );
});

test("allocation snapshot award and response limits reject over-capacity records", () => {
  const awards = structuredClone(
    createMeshAllocationState({ identity, limits: { maximumAwards: 1 } }),
  );
  awards.localAwards = { first: {}, second: {} };
  assert.throws(
    () => restoreMeshAllocationState(awards),
    /exceeds its limits/u,
  );

  const responses = structuredClone(
    createMeshAllocationState({
      identity,
      limits: { maximumAssignmentResponses: 1 },
    }),
  );
  responses.assignmentResponses = { first: {}, second: {} };
  assert.throws(
    () => restoreMeshAllocationState(responses),
    /exceeds its limits/u,
  );
});

test("a released offer permits exactly the causal next monotonic offer attempt", async () => {
  const { state: initial, keys, resolver } = await allocationRuntime();
  const makeRecipients = async (
    offerId,
    offerAttempt,
    previousOfferId,
    deadline,
    ids,
    preparedAt,
  ) =>
    Promise.all(
      ["peer-a", "peer-c"].map(async (peerId, index) => {
        const envelope = structuredClone(offerFixture);
        envelope.messageId = ids[index];
        envelope.sequence = 40 + index;
        envelope.expiresAt = deadline;
        envelope.sender = { peerId: "peer-b", instanceId: "instance-b" };
        envelope.audience = { kind: "peer", peerId };
        envelope.proof.keyId = "key-b";
        if (offerAttempt > 1)
          envelope.causationId = [
            "VAAAAAAAAAAAAAAAAAAAAA",
            "WAAAAAAAAAAAAAAAAAAAAA",
          ][index];
        Object.assign(envelope.payload, {
          offerId,
          offerAttempt,
          ...(previousOfferId === undefined ? {} : { previousOfferId }),
          ownerPeerId: "peer-b",
          bidDeadline: deadline,
        });
        return {
          recipientPeerId: peerId,
          preparedAt,
          envelope: (await signed(envelope, "peer-b", keys, resolver)).signed,
        };
      }),
    );
  const firstRecipients = await makeRecipients(
    "offer-a",
    1,
    undefined,
    "2026-07-30T00:00:10.000Z",
    ["VAAAAAAAAAAAAAAAAAAAAA", "WAAAAAAAAAAAAAAAAAAAAA"],
    7,
  );
  const first = evaluateMeshAllocationCommand(
    initial,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
      recipients: firstRecipients,
    },
    at,
    7,
  );
  assert.equal(first.accepted, true);
  const timer = first.state.coordination.timers["allocation.bid.offer-a"];
  const released = evaluateMeshAllocationTimer(
    first.state,
    {
      kind: "timer.fired",
      timerId: timer.timerId,
      generation: timer.generation,
    },
    timer.dueAt,
  );
  assert.equal(released.accepted, true);
  const prematureBidRelease = structuredClone(released.state.allocation);
  prematureBidRelease.reservations[
    "allocation.reservation.offer-a"
  ].releasedAt = timer.dueAt - 1;
  assert.throws(
    () => restoreMeshAllocationState(prematureBidRelease),
    /released allocation reservation time/u,
  );
  const secondRecipients = await makeRecipients(
    "offer-b",
    2,
    "offer-a",
    "2026-07-30T00:00:20.000Z",
    ["XAAAAAAAAAAAAAAAAAAAAA", "YAAAAAAAAAAAAAAAAAAAAA"],
    timer.dueAt + 1,
  );
  const wrongCausationRecipients = structuredClone(secondRecipients);
  wrongCausationRecipients[1].envelope.causationId = "VAAAAAAAAAAAAAAAAAAAAA";
  wrongCausationRecipients[1].envelope = (
    await signed(wrongCausationRecipients[1].envelope, "peer-b", keys, resolver)
  ).signed;
  assert.equal(
    evaluateMeshAllocationCommand(
      released.state,
      {
        kind: "allocation.offer",
        objectiveId: "objective-a",
        workItemId: "work-item-a",
        expectedWorkItemRevision: 1,
        recipients: wrongCausationRecipients,
      },
      at,
      timer.dueAt + 1,
    ).accepted,
    false,
  );
  const second = evaluateMeshAllocationCommand(
    released.state,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
      recipients: secondRecipients,
    },
    at,
    timer.dueAt + 1,
  );
  assert.equal(second.accepted, true, second.code);
  assert.equal(second.state.allocation.localOffers["offer-b"].offerAttempt, 2);
  assert.equal(
    second.state.allocation.localOffers["offer-b"].previousOfferId,
    "offer-a",
  );
  assert.equal(
    second.state.objectives.objectives["objective-a"].reservedBudgetUnits,
    100,
  );

  const beforePredecessorRelease = structuredClone(second.state.allocation);
  const secondOffer = beforePredecessorRelease.localOffers["offer-b"];
  const predecessorReleasedAt =
    beforePredecessorRelease.reservations["allocation.reservation.offer-a"]
      .releasedAt;
  const logicalShift = secondOffer.createdAt - (predecessorReleasedAt - 1);
  secondOffer.createdAt = predecessorReleasedAt - 1;
  secondOffer.bidDeadlineAt -= logicalShift;
  for (const prepared of Object.values(secondOffer.recipientOffers))
    prepared.preparedAt = secondOffer.createdAt;
  beforePredecessorRelease.reservations[
    "allocation.reservation.offer-b"
  ].reservedAt = secondOffer.createdAt;
  beforePredecessorRelease.workAllocations[
    JSON.stringify(["objective-a", "work-item-a"])
  ].bidDeadlineAt = secondOffer.bidDeadlineAt;
  assert.throws(
    () => restoreMeshAllocationState(beforePredecessorRelease),
    /predecessor chain/u,
  );

  const invalidAttempt = structuredClone(second.state.allocation);
  invalidAttempt.localOffers["offer-b"].offerAttempt = 3;
  for (const prepared of Object.values(
    invalidAttempt.localOffers["offer-b"].recipientOffers,
  )) {
    prepared.envelope.payload.offerAttempt = 3;
    prepared.envelope = hashed(prepared.envelope);
  }
  assert.throws(
    () => restoreMeshAllocationState(invalidAttempt),
    /predecessor chain/u,
  );

  const invalidPredecessor = structuredClone(second.state.allocation);
  invalidPredecessor.localOffers["offer-b"].previousOfferId = "offer-missing";
  for (const prepared of Object.values(
    invalidPredecessor.localOffers["offer-b"].recipientOffers,
  )) {
    prepared.envelope.payload.previousOfferId = "offer-missing";
    prepared.envelope = hashed(prepared.envelope);
  }
  assert.throws(
    () => restoreMeshAllocationState(invalidPredecessor),
    /predecessor chain/u,
  );

  const invalidCausation = structuredClone(second.state.allocation);
  invalidCausation.localOffers["offer-b"].recipientOffers[
    "peer-a"
  ].envelope.causationId = "ZAAAAAAAAAAAAAAAAAAAAA";
  assert.throws(
    () => restoreMeshAllocationState(invalidCausation),
    /predecessor causation/u,
  );
});

test("an owner retains received execution evidence, keeps committed budget, and can close an assignment", async () => {
  const active = await activeOwner();
  const progress = await preparedOwnerExecution(
    "work.progress",
    active.keys,
    active.resolver,
    {
      messageId: "NAAAAAAAAAAAAAAAAAAAAA",
      senderPeerId: "peer-a",
      audiencePeerId: "peer-b",
    },
  );
  const progressed = evaluateVerifiedMeshAllocationEnvelope(active.state, {
    envelope: progress.verified,
    verifiedAt: at,
    receivedAt: 11,
  });
  assert.equal(progressed.accepted, true, progressed.code);
  assert.equal(
    progressed.state.allocation.executionRecords["progress-a"].direction,
    "received",
  );
  assert.equal(
    progressed.state.objectives.objectives["objective-a"].committedBudgetUnits,
    100,
  );

  const close = await preparedOwnerExecution(
    "work.release",
    active.keys,
    active.resolver,
    {
      messageId: "MAAAAAAAAAAAAAAAAAAAAA",
      payloadPatch: {
        releaseId: "release-owner-close",
        releaseAuthority: "owner",
        releaseDisposition: "close",
      },
    },
  );
  const released = evaluateMeshAllocationCommand(
    progressed.state,
    { kind: "allocation.execution", preparedAt: 12, envelope: close.signed },
    at,
    12,
  );
  assert.equal(released.accepted, true, released.code);
  const scope = Object.keys(released.state.allocation.executionHeads)[0];
  assert.equal(
    released.state.allocation.executionHeads[scope].phase,
    "released",
  );
  assert.equal(
    released.state.objectives.objectives["objective-a"].committedBudgetUnits,
    100,
  );

  const reoffer = await preparedOwnerExecution(
    "work.release",
    active.keys,
    active.resolver,
    {
      messageId: "8AAAAAAAAAAAAAAAAAAAAA",
      payloadPatch: {
        releaseId: "release-owner-reoffer",
        releaseAuthority: "owner",
        releaseDisposition: "reoffer",
      },
    },
  );
  const rejected = evaluateMeshAllocationCommand(
    progressed.state,
    { kind: "allocation.execution", preparedAt: 12, envelope: reoffer.signed },
    at,
    12,
  );
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, "execution_phase_invalid");
  assert.equal(rejected.state, progressed.state);
});

test("owner cancellation releases a pending reservation but active cancellation never uncommits it", async () => {
  const pending = await pendingAward();
  const pendingCancel = await preparedOwnerExecution(
    "work.cancel",
    pending.keys,
    pending.resolver,
    {
      messageId: "6AAAAAAAAAAAAAAAAAAAAA",
      causationId: pending.award.signed.messageId,
      payloadPatch: {
        cancellationId: "work-cancellation-pending",
        assignmentState: "award_pending",
      },
    },
  );
  const cancelledPending = evaluateMeshAllocationCommand(
    pending.state,
    {
      kind: "allocation.execution",
      preparedAt: 10,
      envelope: pendingCancel.signed,
    },
    at,
    10,
  );
  assert.equal(cancelledPending.accepted, true, cancelledPending.code);
  assert.equal(
    cancelledPending.state.allocation.localAwards["award-a"].status,
    "cancelled",
  );
  assert.equal(
    cancelledPending.state.allocation.reservations[
      "allocation.reservation.offer-a"
    ].status,
    "released",
  );
  assert.equal(
    cancelledPending.state.objectives.objectives["objective-a"]
      .reservedBudgetUnits,
    0,
  );
  assert.equal(
    Object.hasOwn(
      cancelledPending.state.coordination.timers,
      "allocation.acceptance.award-a",
    ),
    false,
  );

  const active = await activeOwner();
  const activeCancel = await preparedOwnerExecution(
    "work.cancel",
    active.keys,
    active.resolver,
    {
      messageId: "7AAAAAAAAAAAAAAAAAAAAA",
      payloadPatch: {
        cancellationId: "work-cancellation-active-owner",
        assignmentState: "active",
      },
    },
  );
  const cancelledActive = evaluateMeshAllocationCommand(
    active.state,
    {
      kind: "allocation.execution",
      preparedAt: 11,
      envelope: activeCancel.signed,
    },
    at,
    11,
  );
  assert.equal(cancelledActive.accepted, true, cancelledActive.code);
  assert.equal(
    cancelledActive.state.objectives.objectives["objective-a"]
      .committedBudgetUnits,
    100,
  );
});

test("execution schema migration initializes empty retained evidence and strict restore catches tampering", () => {
  const v3 = structuredClone(createMeshAllocationState({ identity }));
  v3.schemaVersion = 3;
  delete v3.executionRecords;
  delete v3.executionHeads;
  delete v3.limits.maximumExecutionRecords;
  delete v3.limits.maximumExecutionHeads;
  delete v3.limits.maximumExecutionRecordsPerAssignment;
  const restored = restoreMeshAllocationState(v3);
  assert.equal(restored.schemaVersion, 5);
  assert.deepEqual(restored.executionRecords, Object.create(null));
  assert.deepEqual(restored.executionHeads, Object.create(null));
  assert.deepEqual(restored.leaseRenewals, Object.create(null));
  assert.deepEqual(restored.leaseHeads, Object.create(null));

  const invalid = structuredClone(restored);
  invalid.executionRecords = { forged: {} };
  assert.throws(
    () => restoreMeshAllocationState(invalid),
    /execution|record|plain/u,
  );
});
