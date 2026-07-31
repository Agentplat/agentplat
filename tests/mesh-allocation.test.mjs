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
const card = fixture("peer-card.json");
const capability = fixture("capability-advertise.json");
const offerFixture = fixture("work-offer.json");
const bidFixture = fixture("work-bid.json");
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

async function allocationRuntime() {
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
  let d = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      state.coordination,
      state.discovery,
      state.objectives,
    ),
    request(announce, 1),
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
    "work_not_ready",
  );
});
