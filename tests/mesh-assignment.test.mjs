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
  createMeshDiscoveryRuntimeState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkState,
  createMeshObjectiveWorkRuntimeState,
  evaluateMeshAllocationCommand,
  evaluateMeshAllocationTimer,
  evaluateVerifiedMeshDiscoveryEnvelope,
  evaluateVerifiedMeshAllocationEnvelope,
  evaluateVerifiedMeshObjectiveEnvelope,
  evaluateMeshObjectiveWorkCommand,
  restoreMeshAllocationState,
  restoreMeshCoordinationState,
} from "@agentplat/mesh/coordination";

const fixtures = new URL(
  "../packages/mesh-protocol/fixtures/v0/",
  import.meta.url,
);
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(name, fixtures), "utf8"));
const announce = fixture("objective-announce.json");
const reviseFixture = fixture("objective-revise.json");
const cancelFixture = fixture("objective-cancel.json");
const cardFixture = fixture("peer-card.json");
const capabilityFixture = fixture("capability-advertise.json");
const offerFixture = fixture("work-offer.json");
const bidFixture = fixture("work-bid.json");
const awardFixture = fixture("work-award.json");
const acceptFixture = fixture("work-accept.json");
const declineFixture = fixture("work-decline.json");
const progressFixture = fixture("work-progress.json");
const checkpointFixture = fixture("work-checkpoint.json");
const resultFixture = fixture("work-result.json");
const releaseFixture = fixture("work-release.json");
const cancelWorkFixture = fixture("work-cancel.json");
const at = "2026-07-30T00:00:01.000Z";
const identity = Object.freeze({
  tenantId: "tenant-a",
  meshId: "mesh-a",
  peerId: "peer-b",
  instanceId: "instance-b",
  keyId: "key-b",
});

function hashed(envelope) {
  const value = structuredClone(envelope);
  const canonical = canonicalizeMeshPayload(value.payload);
  assert.equal(canonical.ok, true);
  value.payloadHash = `sha256:${createHash("sha256").update(canonical.value).digest("base64url")}`;
  return value;
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

async function assigneeRuntime(limits, { objective = true } = {}) {
  const peers = ["peer-a", "peer-b"];
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
      admittedPeers: [
        {
          peerId: "peer-a",
          instanceIds: ["instance-a"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
      ],
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
    createMeshAllocationState({
      identity,
      ...(limits === undefined ? {} : { limits }),
    }),
  );
  if (objective) {
    const acceptedObjective = evaluateVerifiedMeshObjectiveEnvelope(
      createMeshObjectiveWorkRuntimeState(
        state.coordination,
        state.discovery,
        state.objectives,
      ),
      { envelope: hashed(announce), verifiedAt: at, receivedAt: 1 },
    );
    assert.equal(acceptedObjective.accepted, true, acceptedObjective.code);
    state = createMeshAllocationRuntimeState(
      acceptedObjective.state.coordination,
      acceptedObjective.state.discovery,
      acceptedObjective.state.objectives,
      restoreMeshAllocationState({ ...state.allocation, lastLogicalTime: 1 }),
    );
  }
  return { state, keys, resolver };
}

async function preparedOffer(keys, resolver) {
  const offer = structuredClone(offerFixture);
  offer.messageId = "OAAAAAAAAAAAAAAAAAAAAA";
  offer.sequence = 2;
  offer.proof.keyId = "key-a";
  offer.sender = { peerId: "peer-a", instanceId: "instance-a" };
  offer.audience = { kind: "peer", peerId: "peer-b" };
  return signed(offer, "peer-a", keys, resolver);
}

async function preparedLaterOffer(
  keys,
  resolver,
  {
    messageId,
    offerId = "offer-b",
    offerAttempt = 2,
    previousOfferId = "offer-a",
    causationId,
    sequence = 6,
    payloadPatch = {},
  },
) {
  const offer = structuredClone(offerFixture);
  offer.messageId = messageId;
  offer.sequence = sequence;
  offer.proof.keyId = "key-a";
  offer.sender = { peerId: "peer-a", instanceId: "instance-a" };
  offer.audience = { kind: "peer", peerId: "peer-b" };
  offer.causationId = causationId;
  Object.assign(offer.payload, {
    offerId,
    offerAttempt,
    previousOfferId,
    ...payloadPatch,
  });
  return signed(offer, "peer-a", keys, resolver);
}

async function preparedObjectiveRevision(keys, resolver) {
  const revision = structuredClone(reviseFixture);
  revision.proof.keyId = "key-a";
  revision.sender = { peerId: "peer-a", instanceId: "instance-a" };
  revision.causationId = announce.messageId;
  return signed(revision, "peer-a", keys, resolver);
}

async function preparedObjectiveCancellation(keys, resolver, causationId) {
  const cancellation = structuredClone(cancelFixture);
  cancellation.messageId = "CAAAAAAAAAAAAAAAAAAAAA";
  cancellation.sequence = 8;
  cancellation.proof.keyId = "key-a";
  cancellation.sender = { peerId: "peer-a", instanceId: "instance-a" };
  cancellation.causationId = causationId;
  Object.assign(cancellation.payload, {
    objectiveDocumentId: "objective-document-a",
    objectiveRevision: 1,
  });
  return signed(cancellation, "peer-a", keys, resolver);
}

async function preparedBid(
  keys,
  resolver,
  offerMessageId,
  bidExpiresAt = bidFixture.payload.bidDeadline,
) {
  const bid = structuredClone(bidFixture);
  bid.messageId = "BAAAAAAAAAAAAAAAAAAAAA";
  bid.sequence = 3;
  bid.proof.keyId = "key-b";
  bid.sender = { peerId: "peer-b", instanceId: "instance-b" };
  bid.audience = { kind: "peer", peerId: "peer-a" };
  bid.causationId = offerMessageId;
  Object.assign(bid.payload, {
    ownerPeerId: "peer-a",
    bidderPeerId: "peer-b",
    bidExpiresAt,
  });
  bid.expiresAt = bidExpiresAt;
  return signed(bid, "peer-b", keys, resolver);
}

async function preparedAward(
  keys,
  resolver,
  bidMessageId,
  expiresAt = "2026-07-30T00:00:12.000Z",
) {
  const award = structuredClone(awardFixture);
  award.messageId = "QAAAAAAAAAAAAAAAAAAAAA";
  award.sequence = 4;
  award.proof.keyId = "key-a";
  award.sender = { peerId: "peer-a", instanceId: "instance-a" };
  award.audience = { kind: "peer", peerId: "peer-b" };
  award.causationId = bidMessageId;
  Object.assign(award.payload, {
    ownerPeerId: "peer-a",
    assigneePeerId: "peer-b",
    acceptanceDeadline: "2026-07-30T00:00:15.000Z",
    leaseExpiresAt: "2026-07-30T00:00:25.000Z",
  });
  award.expiresAt = expiresAt;
  return signed(award, "peer-a", keys, resolver);
}

async function preparedDistinctAward(keys, resolver, bidMessageId) {
  const award = structuredClone(awardFixture);
  award.messageId = "UAAAAAAAAAAAAAAAAAAAAA";
  award.sequence = 6;
  award.proof.keyId = "key-a";
  award.sender = { peerId: "peer-a", instanceId: "instance-a" };
  award.audience = { kind: "peer", peerId: "peer-b" };
  award.causationId = bidMessageId;
  Object.assign(award.payload, {
    awardId: "award-b",
    assignmentAuthorityId: "award-b",
    fencingToken: "award-b",
    ownerPeerId: "peer-a",
    assigneePeerId: "peer-b",
    acceptanceDeadline: "2026-07-30T00:00:15.000Z",
    leaseExpiresAt: "2026-07-30T00:00:25.000Z",
  });
  award.expiresAt = "2026-07-30T00:00:12.000Z";
  return signed(award, "peer-a", keys, resolver);
}

async function preparedReplacementBid(keys, resolver, offerMessageId) {
  const bid = structuredClone(bidFixture);
  bid.messageId = "VAAAAAAAAAAAAAAAAAAAAA";
  bid.sequence = 4;
  bid.proof.keyId = "key-b";
  bid.sender = { peerId: "peer-b", instanceId: "instance-b" };
  bid.audience = { kind: "peer", peerId: "peer-a" };
  bid.causationId = offerMessageId;
  Object.assign(bid.payload, {
    bidId: "bid-b",
    bidRevision: 2,
    previousBidId: "bid-a",
    ownerPeerId: "peer-a",
    bidderPeerId: "peer-b",
    bidExpiresAt: bid.payload.bidDeadline,
  });
  bid.expiresAt = bid.payload.bidDeadline;
  return signed(bid, "peer-b", keys, resolver);
}

async function preparedReplacementAward(keys, resolver, bidMessageId) {
  const award = structuredClone(awardFixture);
  award.messageId = "WAAAAAAAAAAAAAAAAAAAAA";
  award.sequence = 5;
  award.proof.keyId = "key-a";
  award.sender = { peerId: "peer-a", instanceId: "instance-a" };
  award.audience = { kind: "peer", peerId: "peer-b" };
  award.causationId = bidMessageId;
  Object.assign(award.payload, {
    bidId: "bid-b",
    bidRevision: 2,
    ownerPeerId: "peer-a",
    assigneePeerId: "peer-b",
    acceptanceDeadline: "2026-07-30T00:00:15.000Z",
    leaseExpiresAt: "2026-07-30T00:00:25.000Z",
  });
  award.expiresAt = "2026-07-30T00:00:12.000Z";
  return signed(award, "peer-a", keys, resolver);
}

async function preparedResponse(kind, keys, resolver, awardMessageId) {
  const response = structuredClone(
    kind === "work.accept" ? acceptFixture : declineFixture,
  );
  response.messageId =
    kind === "work.accept"
      ? "RAAAAAAAAAAAAAAAAAAAAA"
      : "SAAAAAAAAAAAAAAAAAAAAA";
  response.sequence = 5;
  response.proof.keyId = "key-b";
  response.sender = { peerId: "peer-b", instanceId: "instance-b" };
  response.audience = { kind: "peer", peerId: "peer-a" };
  response.causationId = awardMessageId;
  response.expiresAt = "2026-07-30T00:00:12.000Z";
  Object.assign(response.payload, {
    ownerPeerId: "peer-a",
    assigneePeerId: "peer-b",
    acceptanceDeadline: "2026-07-30T00:00:15.000Z",
  });
  return signed(response, "peer-b", keys, resolver);
}

async function awaitingAward(limits) {
  const runtime = await assigneeRuntime(limits);
  const offer = await preparedOffer(runtime.keys, runtime.resolver);
  const receivedOffer = evaluateVerifiedMeshAllocationEnvelope(runtime.state, {
    envelope: offer.verified,
    verifiedAt: at,
    receivedAt: 2,
  });
  assert.equal(receivedOffer.accepted, true, receivedOffer.code);
  const bid = await preparedBid(
    runtime.keys,
    runtime.resolver,
    offer.signed.messageId,
  );
  const prepared = evaluateMeshAllocationCommand(
    receivedOffer.state,
    {
      kind: "allocation.bid",
      offerId: "offer-a",
      preparedAt: 3,
      envelope: bid.signed,
    },
    at,
    3,
  );
  assert.equal(prepared.accepted, true, prepared.code);
  const award = await preparedAward(
    runtime.keys,
    runtime.resolver,
    bid.signed.messageId,
  );
  const receivedAward = evaluateVerifiedMeshAllocationEnvelope(prepared.state, {
    envelope: award.verified,
    verifiedAt: at,
    receivedAt: 4,
  });
  assert.equal(receivedAward.accepted, true, receivedAward.code);
  return { ...runtime, offer, bid, award, state: receivedAward.state };
}

async function activeAssignee(limits) {
  const pending = await awaitingAward(limits);
  const acceptance = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const accepted = evaluateMeshAllocationCommand(
    pending.state,
    {
      kind: "allocation.assignment_response",
      awardId: "award-a",
      preparedAt: 5,
      envelope: acceptance.signed,
    },
    at,
    5,
  );
  assert.equal(accepted.accepted, true, accepted.code);
  return { ...pending, acceptance, state: accepted.state };
}

async function preparedExecution(
  kind,
  keys,
  resolver,
  {
    messageId,
    sequence = 40,
    causationId = "RAAAAAAAAAAAAAAAAAAAAA",
    senderPeerId = "peer-b",
    senderInstanceId = `instance-${senderPeerId.slice(-1)}`,
    audiencePeerId = "peer-a",
    payloadPatch = {},
  } = {},
) {
  const source = {
    "work.progress": progressFixture,
    "work.checkpoint": checkpointFixture,
    "work.result": resultFixture,
    "work.release": releaseFixture,
    "work.cancel": cancelWorkFixture,
  }[kind];
  const envelope = structuredClone(source);
  envelope.messageId ??= "ZAAAAAAAAAAAAAAAAAAAA";
  envelope.messageId = messageId ?? envelope.messageId;
  envelope.sequence = sequence;
  envelope.sentAt = "2026-07-30T00:00:04.000Z";
  envelope.expiresAt = "2026-07-30T00:00:14.000Z";
  envelope.sender = {
    peerId: senderPeerId,
    instanceId: senderInstanceId,
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
    ownerPeerId: "peer-a",
    ownerEpoch: 1,
    assigneePeerId: "peer-b",
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
  if (
    Object.hasOwn(payloadPatch, "checkpointId") &&
    payloadPatch.checkpointId === undefined
  )
    delete envelope.payload.checkpointId;
  return signed(envelope, senderPeerId, keys, resolver);
}

async function ownerOfferedAllocation(keys, resolver) {
  const runtime = await assigneeRuntime();
  let state = runtime.state;
  for (const [envelope, logicalTime] of [
    [cardFixture, 2],
    [capabilityFixture, 3],
  ]) {
    const discovered = evaluateVerifiedMeshDiscoveryEnvelope(
      createMeshDiscoveryRuntimeState(state.coordination, state.discovery),
      {
        envelope: hashed(envelope),
        verifiedAt: at,
        receivedAt: logicalTime,
      },
    );
    assert.equal(discovered.accepted, true, discovered.code);
    state = createMeshAllocationRuntimeState(
      discovered.state.coordination,
      discovered.state.discovery,
      Object.freeze({
        ...state.objectives,
        lastLogicalTime: logicalTime,
      }),
      restoreMeshAllocationState({
        ...state.allocation,
        lastLogicalTime: logicalTime,
      }),
    );
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
    { verifiedAt: at, receivedAt: 4 },
  );
  assert.equal(work.accepted, true, work.code);
  const workState = createMeshAllocationRuntimeState(
    work.state.coordination,
    work.state.discovery,
    work.state.objectives,
    restoreMeshAllocationState({
      ...runtime.state.allocation,
      lastLogicalTime: 4,
    }),
  );
  const envelope = structuredClone(offerFixture);
  envelope.messageId = "OAAAAAAAAAAAAAAAAAAAAA";
  envelope.sequence = 9;
  envelope.proof.keyId = "key-b";
  envelope.sender = { peerId: "peer-b", instanceId: "instance-b" };
  envelope.audience = { kind: "peer", peerId: "peer-a" };
  envelope.payload.ownerPeerId = "peer-b";
  const prepared = await signed(envelope, "peer-b", keys, resolver);
  const offered = evaluateMeshAllocationCommand(
    workState,
    {
      kind: "allocation.offer",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      expectedWorkItemRevision: 1,
      recipients: [
        {
          recipientPeerId: "peer-a",
          preparedAt: 5,
          envelope: prepared.signed,
        },
      ],
    },
    at,
    5,
  );
  assert.equal(offered.accepted, true, offered.code);
  return offered.state.allocation;
}

function rejected(decision, code, state) {
  assert.deepEqual(decision, { accepted: false, code, state });
}

test("assignee records only a direct offer and its own prepared bid before accepting a causally exact award", async () => {
  const pending = await awaitingAward();
  assert.equal(
    pending.state.allocation.receivedOffers["offer-a"].envelope.messageId,
    pending.offer.signed.messageId,
  );
  assert.equal(
    pending.state.allocation.localBids["bid-a"].envelope.messageId,
    pending.bid.signed.messageId,
  );
  assert.equal(
    pending.state.allocation.receivedAwards["award-a"].status,
    "awaiting_response",
  );

  const response = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const accepted = evaluateMeshAllocationCommand(
    pending.state,
    {
      kind: "allocation.assignment_response",
      awardId: "award-a",
      preparedAt: 5,
      envelope: response.signed,
    },
    at,
    5,
  );
  assert.equal(accepted.accepted, true, accepted.code);
  assert.deepEqual(
    accepted.effects.map((effect) => effect.kind),
    ["allocation.assignment_response.dispatch"],
  );
  assert.equal(
    accepted.state.allocation.localAssignmentResponses["award-a"].responseId,
    "acceptance-a",
  );
  assert.equal(
    accepted.state.allocation.assigneeAuthorities["award-a"].acceptanceId,
    "acceptance-a",
  );

  const duplicate = evaluateMeshAllocationCommand(
    accepted.state,
    {
      kind: "allocation.assignment_response",
      awardId: "award-a",
      preparedAt: 5,
      envelope: response.signed,
    },
    at,
    5,
  );
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state, accepted.state);
});

test("assignee refuses offers unless the current Objective policy authorizes their exact binding", async () => {
  const withoutObjective = await assigneeRuntime(undefined, {
    objective: false,
  });
  const missingOffer = await preparedOffer(
    withoutObjective.keys,
    withoutObjective.resolver,
  );
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(withoutObjective.state, {
      envelope: missingOffer.verified,
      verifiedAt: at,
      receivedAt: 1,
    }),
    "received_offer_invalid",
    withoutObjective.state,
  );

  const active = await assigneeRuntime();
  const offer = await preparedOffer(active.keys, active.resolver);
  const cancellation = await preparedObjectiveCancellation(
    active.keys,
    active.resolver,
    announce.messageId,
  );
  const cancelledObjective = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      active.state.coordination,
      active.state.discovery,
      active.state.objectives,
    ),
    { envelope: cancellation.verified, verifiedAt: at, receivedAt: 2 },
  );
  assert.equal(cancelledObjective.accepted, true, cancelledObjective.code);
  const cancelled = createMeshAllocationRuntimeState(
    cancelledObjective.state.coordination,
    cancelledObjective.state.discovery,
    cancelledObjective.state.objectives,
    restoreMeshAllocationState({
      ...active.state.allocation,
      lastLogicalTime: 2,
    }),
  );
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(cancelled, {
      envelope: offer.verified,
      verifiedAt: at,
      receivedAt: 3,
    }),
    "received_offer_invalid",
    cancelled,
  );

  const revised = await assigneeRuntime();
  const revision = await preparedObjectiveRevision(
    revised.keys,
    revised.resolver,
  );
  const acceptedRevision = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      revised.state.coordination,
      revised.state.discovery,
      revised.state.objectives,
    ),
    { envelope: revision.verified, verifiedAt: at, receivedAt: 2 },
  );
  assert.equal(acceptedRevision.accepted, true, acceptedRevision.code);
  const revisedState = createMeshAllocationRuntimeState(
    acceptedRevision.state.coordination,
    acceptedRevision.state.discovery,
    acceptedRevision.state.objectives,
    restoreMeshAllocationState({
      ...revised.state.allocation,
      lastLogicalTime: 2,
    }),
  );
  const staleOffer = await preparedOffer(revised.keys, revised.resolver);
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(revisedState, {
      envelope: staleOffer.verified,
      verifiedAt: at,
      receivedAt: 3,
    }),
    "received_offer_invalid",
    revisedState,
  );

  const incompatibleOffer = hashed(offer.verified);
  incompatibleOffer.payload.requiredCapabilityKeys = ["translate"];
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(active.state, {
      envelope: incompatibleOffer,
      verifiedAt: at,
      receivedAt: 2,
    }),
    "received_offer_invalid",
    active.state,
  );
});

test("assignee offer evidence retains the critical extension policy needed for strict restore", async () => {
  const runtime = await assigneeRuntime();
  const envelope = structuredClone(offerFixture);
  envelope.messageId = "JAAAAAAAAAAAAAAAAAAAAA";
  envelope.sequence = 2;
  envelope.proof.keyId = "key-a";
  envelope.sender = { peerId: "peer-a", instanceId: "instance-a" };
  envelope.audience = { kind: "peer", peerId: "peer-b" };
  envelope.extensions = { trace: { sampled: true } };
  envelope.criticalExtensions = ["trace"];
  const offer = await signed(
    envelope,
    "peer-a",
    runtime.keys,
    runtime.resolver,
  );
  const accepted = evaluateVerifiedMeshAllocationEnvelope(runtime.state, {
    envelope: offer.verified,
    verifiedAt: at,
    receivedAt: 2,
    supportedCriticalExtensions: ["trace"],
  });
  assert.equal(accepted.accepted, true, accepted.code);
  assert.deepEqual(
    accepted.state.allocation.receivedOffers["offer-a"]
      .supportedCriticalExtensions,
    ["trace"],
  );
  assert.equal(
    Object.isFrozen(
      accepted.state.allocation.receivedOffers["offer-a"]
        .supportedCriticalExtensions,
    ),
    true,
  );
  assert.deepEqual(
    restoreMeshAllocationState(structuredClone(accepted.state.allocation)),
    accepted.state.allocation,
  );
});

test("received offer attempts form one exact causal chain and wait for predecessor closure", async () => {
  const runtime = await assigneeRuntime();
  const firstOffer = await preparedOffer(runtime.keys, runtime.resolver);
  const first = evaluateVerifiedMeshAllocationEnvelope(runtime.state, {
    envelope: firstOffer.verified,
    verifiedAt: at,
    receivedAt: 2,
  });
  assert.equal(first.accepted, true, first.code);
  const predecessor = first.state.allocation.receivedOffers["offer-a"];

  const premature = await preparedLaterOffer(runtime.keys, runtime.resolver, {
    messageId: "LAAAAAAAAAAAAAAAAAAAAA",
    causationId: firstOffer.signed.messageId,
  });
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(first.state, {
      envelope: premature.verified,
      verifiedAt: at,
      receivedAt: 3,
    }),
    "received_offer_invalid",
    first.state,
  );

  const invalidCases = [
    await preparedLaterOffer(runtime.keys, runtime.resolver, {
      messageId: "MAAAAAAAAAAAAAAAAAAAAA",
      offerAttempt: 3,
      causationId: firstOffer.signed.messageId,
    }),
    await preparedLaterOffer(runtime.keys, runtime.resolver, {
      messageId: "NAAAAAAAAAAAAAAAAAAAAA",
      previousOfferId: "offer-missing",
      causationId: firstOffer.signed.messageId,
    }),
    await preparedLaterOffer(runtime.keys, runtime.resolver, {
      messageId: "PAAAAAAAAAAAAAAAAAAAAA",
      causationId: "ZAAAAAAAAAAAAAAAAAAAAA",
    }),
    await preparedLaterOffer(runtime.keys, runtime.resolver, {
      messageId: "EAAAAAAAAAAAAAAAAAAAAA",
      causationId: firstOffer.signed.messageId,
      payloadPatch: {
        completionCriteria: ["Return a different output."],
      },
    }),
  ];
  for (const candidate of invalidCases)
    rejected(
      evaluateVerifiedMeshAllocationEnvelope(first.state, {
        envelope: candidate.verified,
        verifiedAt: at,
        receivedAt: predecessor.bidDeadlineAt,
      }),
      "received_offer_invalid",
      first.state,
    );

  const secondOffer = await preparedLaterOffer(runtime.keys, runtime.resolver, {
    messageId: "TAAAAAAAAAAAAAAAAAAAAA",
    causationId: firstOffer.signed.messageId,
  });
  const second = evaluateVerifiedMeshAllocationEnvelope(first.state, {
    envelope: secondOffer.verified,
    verifiedAt: at,
    receivedAt: predecessor.bidDeadlineAt,
  });
  assert.equal(second.accepted, true, second.code);
  assert.equal(
    second.state.allocation.receivedOffers["offer-b"].envelope.payload
      .offerAttempt,
    2,
  );

  const reordered = structuredClone(second.state.allocation);
  const reorderedOffer = reordered.receivedOffers["offer-b"];
  const reorderedReceivedAt =
    reordered.receivedOffers["offer-a"].receivedAt - 1;
  const logicalShift = reorderedOffer.receivedAt - reorderedReceivedAt;
  reorderedOffer.receivedAt = reorderedReceivedAt;
  reorderedOffer.bidDeadlineAt -= logicalShift;
  reorderedOffer.workDeadlineAt -= logicalShift;
  assert.throws(
    () => restoreMeshAllocationState(reordered),
    /received offer predecessor chain/u,
  );

  const rewritten = structuredClone(second.state.allocation);
  const rewrittenEnvelope = rewritten.receivedOffers["offer-b"].envelope;
  rewrittenEnvelope.payload.completionCriteria = ["Return a different output."];
  rewritten.receivedOffers["offer-b"].envelope = hashed(rewrittenEnvelope);
  assert.throws(
    () => restoreMeshAllocationState(rewritten),
    /received offer predecessor chain/u,
  );
});

test("a terminal local award permits the exact next offer attempt without reusing its epoch", async () => {
  const pending = await awaitingAward();
  const response = await preparedResponse(
    "work.decline",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const declined = evaluateMeshAllocationCommand(
    pending.state,
    {
      kind: "allocation.assignment_response",
      awardId: "award-a",
      preparedAt: 5,
      envelope: response.signed,
    },
    at,
    5,
  );
  assert.equal(declined.accepted, true, declined.code);
  assert.equal(
    declined.state.allocation.receivedAwards["award-a"].status,
    "declined",
  );

  const laterOffer = await preparedLaterOffer(pending.keys, pending.resolver, {
    messageId: "XAAAAAAAAAAAAAAAAAAAAA",
    causationId: pending.offer.signed.messageId,
  });
  const accepted = evaluateVerifiedMeshAllocationEnvelope(declined.state, {
    envelope: laterOffer.verified,
    verifiedAt: at,
    receivedAt: 6,
  });
  assert.equal(accepted.accepted, true, accepted.code);
  assert.equal(
    accepted.state.allocation.receivedOffers["offer-b"].envelope.payload
      .offerAttempt,
    2,
  );
  assert.equal(
    accepted.state.allocation.receivedAwards["award-a"].status,
    "declined",
  );
});

test("local bid expiry is anchored to trusted verification and awards at that expiry fail closed", async () => {
  const runtime = await assigneeRuntime();
  const offer = await preparedOffer(runtime.keys, runtime.resolver);
  const receivedOffer = evaluateVerifiedMeshAllocationEnvelope(runtime.state, {
    envelope: offer.verified,
    verifiedAt: at,
    receivedAt: 2,
  });
  assert.equal(receivedOffer.accepted, true, receivedOffer.code);
  const bid = await preparedBid(
    runtime.keys,
    runtime.resolver,
    offer.signed.messageId,
    "2026-07-30T00:00:10.000Z",
  );
  const acceptedBid = evaluateMeshAllocationCommand(
    receivedOffer.state,
    {
      kind: "allocation.bid",
      offerId: "offer-a",
      preparedAt: 3,
      envelope: bid.signed,
    },
    at,
    3,
  );
  assert.equal(acceptedBid.accepted, true, acceptedBid.code);
  const evidence = acceptedBid.state.allocation.localBids["bid-a"];
  assert.equal(evidence.validityVerifiedAt, at);
  assert.equal(evidence.bidExpiresAtLogical, 9_003);

  const award = await preparedAward(
    runtime.keys,
    runtime.resolver,
    bid.signed.messageId,
  );
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(acceptedBid.state, {
      envelope: award.verified,
      verifiedAt: evidence.bidExpiresAt,
      receivedAt: 4,
    }),
    "received_award_invalid",
    acceptedBid.state,
  );
});

test("local bids cannot exceed the exact offered budget", async () => {
  const runtime = await assigneeRuntime();
  const offer = await preparedOffer(runtime.keys, runtime.resolver);
  const received = evaluateVerifiedMeshAllocationEnvelope(runtime.state, {
    envelope: offer.verified,
    verifiedAt: at,
    receivedAt: 2,
  });
  assert.equal(received.accepted, true, received.code);
  const bidEnvelope = structuredClone(bidFixture);
  bidEnvelope.messageId = "KAAAAAAAAAAAAAAAAAAAAA";
  bidEnvelope.sequence = 3;
  bidEnvelope.proof.keyId = "key-b";
  bidEnvelope.sender = { peerId: "peer-b", instanceId: "instance-b" };
  bidEnvelope.audience = { kind: "peer", peerId: "peer-a" };
  bidEnvelope.causationId = offer.signed.messageId;
  Object.assign(bidEnvelope.payload, {
    ownerPeerId: "peer-a",
    bidderPeerId: "peer-b",
    budgetUnits: offer.signed.payload.budgetReservationUnits + 1,
    bidExpiresAt: bidEnvelope.payload.bidDeadline,
  });
  bidEnvelope.expiresAt = bidEnvelope.payload.bidDeadline;
  const bid = await signed(
    bidEnvelope,
    "peer-b",
    runtime.keys,
    runtime.resolver,
  );
  rejected(
    evaluateMeshAllocationCommand(
      received.state,
      {
        kind: "allocation.bid",
        offerId: "offer-a",
        preparedAt: 3,
        envelope: bid.signed,
      },
      at,
      3,
    ),
    "local_bid_invalid",
    received.state,
  );
});

test("assignee refuses a second award for an already claimed Objective Work epoch", async () => {
  const runtime = await assigneeRuntime();
  const offer = await preparedOffer(runtime.keys, runtime.resolver);
  const receivedOffer = evaluateVerifiedMeshAllocationEnvelope(runtime.state, {
    envelope: offer.verified,
    verifiedAt: at,
    receivedAt: 2,
  });
  assert.equal(receivedOffer.accepted, true, receivedOffer.code);
  const bid = await preparedBid(
    runtime.keys,
    runtime.resolver,
    offer.signed.messageId,
  );
  const acceptedBid = evaluateMeshAllocationCommand(
    receivedOffer.state,
    {
      kind: "allocation.bid",
      offerId: "offer-a",
      preparedAt: 3,
      envelope: bid.signed,
    },
    at,
    3,
  );
  assert.equal(acceptedBid.accepted, true, acceptedBid.code);
  const firstAward = await preparedAward(
    runtime.keys,
    runtime.resolver,
    bid.signed.messageId,
  );
  const acceptedAward = evaluateVerifiedMeshAllocationEnvelope(
    acceptedBid.state,
    {
      envelope: firstAward.verified,
      verifiedAt: at,
      receivedAt: 4,
    },
  );
  assert.equal(acceptedAward.accepted, true, acceptedAward.code);
  const secondAward = await preparedDistinctAward(
    runtime.keys,
    runtime.resolver,
    bid.signed.messageId,
  );
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(acceptedAward.state, {
      envelope: secondAward.verified,
      verifiedAt: at,
      receivedAt: 5,
    }),
    "received_award_duplicate_conflict",
    acceptedAward.state,
  );
});

test("an award must bind the current local bid head and bids stop after award intake", async () => {
  const runtime = await assigneeRuntime();
  const offer = await preparedOffer(runtime.keys, runtime.resolver);
  const receivedOffer = evaluateVerifiedMeshAllocationEnvelope(runtime.state, {
    envelope: offer.verified,
    verifiedAt: at,
    receivedAt: 2,
  });
  assert.equal(receivedOffer.accepted, true, receivedOffer.code);
  const firstBid = await preparedBid(
    runtime.keys,
    runtime.resolver,
    offer.signed.messageId,
  );
  const firstPrepared = evaluateMeshAllocationCommand(
    receivedOffer.state,
    {
      kind: "allocation.bid",
      offerId: "offer-a",
      preparedAt: 3,
      envelope: firstBid.signed,
    },
    at,
    3,
  );
  assert.equal(firstPrepared.accepted, true, firstPrepared.code);
  const replacementBid = await preparedReplacementBid(
    runtime.keys,
    runtime.resolver,
    offer.signed.messageId,
  );
  const replacementPrepared = evaluateMeshAllocationCommand(
    firstPrepared.state,
    {
      kind: "allocation.bid",
      offerId: "offer-a",
      preparedAt: 4,
      envelope: replacementBid.signed,
    },
    at,
    4,
  );
  assert.equal(replacementPrepared.accepted, true, replacementPrepared.code);

  const staleAward = await preparedAward(
    runtime.keys,
    runtime.resolver,
    firstBid.signed.messageId,
  );
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(replacementPrepared.state, {
      envelope: staleAward.verified,
      verifiedAt: at,
      receivedAt: 5,
    }),
    "received_award_invalid",
    replacementPrepared.state,
  );

  const currentAward = await preparedReplacementAward(
    runtime.keys,
    runtime.resolver,
    replacementBid.signed.messageId,
  );
  const awarded = evaluateVerifiedMeshAllocationEnvelope(
    replacementPrepared.state,
    {
      envelope: currentAward.verified,
      verifiedAt: at,
      receivedAt: 5,
    },
  );
  assert.equal(awarded.accepted, true, awarded.code);
  const lateRevision = structuredClone(replacementBid.signed);
  lateRevision.messageId = "XAAAAAAAAAAAAAAAAAAAAA";
  lateRevision.sequence = 6;
  lateRevision.payload.bidId = "bid-c";
  lateRevision.payload.bidRevision = 3;
  lateRevision.payload.previousBidId = "bid-b";
  const lateSigned = await signed(
    lateRevision,
    "peer-b",
    runtime.keys,
    runtime.resolver,
  );
  rejected(
    evaluateMeshAllocationCommand(
      awarded.state,
      {
        kind: "allocation.bid",
        offerId: "offer-a",
        preparedAt: 6,
        envelope: lateSigned.signed,
      },
      at,
      6,
    ),
    "local_bid_invalid",
    awarded.state,
  );
});

test("cross-offer award causation fails as a decision instead of throwing", async () => {
  const runtime = await assigneeRuntime();
  const firstOffer = await preparedOffer(runtime.keys, runtime.resolver);
  const receivedFirst = evaluateVerifiedMeshAllocationEnvelope(runtime.state, {
    envelope: firstOffer.verified,
    verifiedAt: at,
    receivedAt: 2,
  });
  assert.equal(receivedFirst.accepted, true, receivedFirst.code);
  const bid = await preparedBid(
    runtime.keys,
    runtime.resolver,
    firstOffer.signed.messageId,
  );
  const prepared = evaluateMeshAllocationCommand(
    receivedFirst.state,
    {
      kind: "allocation.bid",
      offerId: "offer-a",
      preparedAt: 3,
      envelope: bid.signed,
    },
    at,
    3,
  );
  assert.equal(prepared.accepted, true, prepared.code);

  const secondOfferEnvelope = structuredClone(offerFixture);
  secondOfferEnvelope.messageId = "YAAAAAAAAAAAAAAAAAAAAA";
  secondOfferEnvelope.sequence = 4;
  secondOfferEnvelope.proof.keyId = "key-a";
  secondOfferEnvelope.sender = {
    peerId: "peer-a",
    instanceId: "instance-a",
  };
  secondOfferEnvelope.audience = { kind: "peer", peerId: "peer-b" };
  secondOfferEnvelope.payload.offerId = "offer-b";
  secondOfferEnvelope.payload.workItemId = "work-item-b";
  const secondOffer = await signed(
    secondOfferEnvelope,
    "peer-a",
    runtime.keys,
    runtime.resolver,
  );
  const receivedSecond = evaluateVerifiedMeshAllocationEnvelope(
    prepared.state,
    {
      envelope: secondOffer.verified,
      verifiedAt: at,
      receivedAt: 4,
    },
  );
  assert.equal(receivedSecond.accepted, true, receivedSecond.code);

  const crossAwardEnvelope = structuredClone(awardFixture);
  crossAwardEnvelope.messageId = "ZAAAAAAAAAAAAAAAAAAAAA";
  crossAwardEnvelope.sequence = 5;
  crossAwardEnvelope.proof.keyId = "key-a";
  crossAwardEnvelope.sender = {
    peerId: "peer-a",
    instanceId: "instance-a",
  };
  crossAwardEnvelope.audience = { kind: "peer", peerId: "peer-b" };
  crossAwardEnvelope.causationId = bid.signed.messageId;
  Object.assign(crossAwardEnvelope.payload, {
    offerId: "offer-b",
    workItemId: "work-item-b",
    ownerPeerId: "peer-a",
    assigneePeerId: "peer-b",
    acceptanceDeadline: "2026-07-30T00:00:15.000Z",
    leaseExpiresAt: "2026-07-30T00:00:25.000Z",
  });
  crossAwardEnvelope.expiresAt = "2026-07-30T00:00:12.000Z";
  const crossAward = await signed(
    crossAwardEnvelope,
    "peer-a",
    runtime.keys,
    runtime.resolver,
  );
  let decision;
  assert.doesNotThrow(() => {
    decision = evaluateVerifiedMeshAllocationEnvelope(receivedSecond.state, {
      envelope: crossAward.verified,
      verifiedAt: at,
      receivedAt: 5,
    });
  });
  rejected(decision, "received_award_invalid", receivedSecond.state);
});

test("assignee rejects non-local and non-causal award/response variants without mutating state", async () => {
  const pending = await awaitingAward();
  const cases = [
    [
      "scope",
      (envelope) => {
        envelope.tenantId = "tenant-other";
      },
      "scope_mismatch",
    ],
    [
      "audience",
      (envelope) => {
        envelope.audience.peerId = "peer-a";
      },
      "audience_mismatch",
    ],
    [
      "causation",
      (envelope) => {
        envelope.causationId = "XAAAAAAAAAAAAAAAAAAAAA";
      },
      "received_award_invalid",
    ],
    [
      "epoch",
      (envelope) => {
        envelope.payload.assignmentEpoch = 2;
      },
      "received_award_invalid",
    ],
    [
      "token",
      (envelope) => {
        envelope.payload.fencingToken = "different-token";
      },
      "invalid_verified_envelope",
    ],
    [
      "lease",
      (envelope) => {
        envelope.payload.leaseExpiresAt = "2026-07-30T00:00:01.000Z";
      },
      "invalid_verified_envelope",
    ],
  ];
  for (const [, mutate, code] of cases) {
    const envelope = hashed(pending.award.verified);
    mutate(envelope);
    const canonical = canonicalizeMeshPayload(envelope.payload);
    assert.equal(canonical.ok, true);
    envelope.payloadHash = `sha256:${createHash("sha256").update(canonical.value).digest("base64url")}`;
    rejected(
      evaluateVerifiedMeshAllocationEnvelope(pending.state, {
        envelope,
        verifiedAt: at,
        receivedAt: 5,
      }),
      code,
      pending.state,
    );
  }
  const response = await preparedResponse(
    "work.decline",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const wrongTokenResponse = structuredClone(response.signed);
  wrongTokenResponse.payload.fencingToken = "wrong-token";
  rejected(
    evaluateMeshAllocationCommand(
      pending.state,
      {
        kind: "allocation.assignment_response",
        awardId: "award-a",
        preparedAt: 5,
        envelope: wrongTokenResponse,
      },
      at,
      5,
    ),
    "local_assignment_response_invalid",
    pending.state,
  );
});

test("assignee response deadline is exclusive and closes a local award without synthesizing a response", async () => {
  const pending = await awaitingAward();
  const deadline =
    pending.state.allocation.receivedAwards["award-a"].acceptanceDeadlineAt;
  const timerId = "allocation.assignee_response.award-a";
  const before = evaluateMeshAllocationTimer(
    pending.state,
    { kind: "timer.fired", timerId, generation: 1 },
    deadline - 1,
  );
  assert.deepEqual(before, {
    accepted: false,
    code: "timer_not_due",
    state: pending.state,
  });
  const due = evaluateMeshAllocationTimer(
    pending.state,
    { kind: "timer.fired", timerId, generation: 1 },
    deadline,
  );
  assert.equal(due.accepted, true, due.code);
  assert.equal(
    due.state.allocation.receivedAwards["award-a"].status,
    "timed_out",
  );
  assert.equal(
    Object.hasOwn(due.state.allocation.localAssignmentResponses, "award-a"),
    false,
  );
  const response = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  rejected(
    evaluateMeshAllocationCommand(
      due.state,
      {
        kind: "allocation.assignment_response",
        awardId: "award-a",
        preparedAt: deadline,
        envelope: response.signed,
      },
      at,
      deadline,
    ),
    "local_assignment_response_deadline_elapsed",
    due.state,
  );
});

test("assignee bounds, restore/migration and conflicting exact identifiers fail closed", async () => {
  const pending = await awaitingAward({
    maximumReceivedAwards: 1,
    maximumLocalAssignmentResponses: 1,
    maximumAssignmentAuthorities: 1,
  });
  assert.deepEqual(
    restoreMeshAllocationState(structuredClone(pending.state.allocation)),
    pending.state.allocation,
  );
  const conflict = structuredClone(pending.award.verified);
  conflict.messageId = "TAAAAAAAAAAAAAAAAAAAAA";
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(pending.state, {
      envelope: conflict,
      verifiedAt: at,
      receivedAt: 5,
    }),
    "received_award_duplicate_conflict",
    pending.state,
  );
  const overCapacity = structuredClone(pending.state.allocation);
  overCapacity.receivedAwards["award-extra"] = structuredClone(
    overCapacity.receivedAwards["award-a"],
  );
  overCapacity.receivedAwards["award-extra"].awardId = "award-extra";
  assert.throws(
    () => restoreMeshAllocationState(overCapacity),
    /limits|capacity|binding/u,
  );
  const v2 = structuredClone(createMeshAllocationState({ identity }));
  v2.schemaVersion = 2;
  delete v2.receivedOffers;
  delete v2.localBids;
  delete v2.receivedAwards;
  delete v2.localAssignmentResponses;
  delete v2.assigneeAuthorities;
  delete v2.limits.maximumReceivedOffers;
  delete v2.limits.maximumLocalBids;
  delete v2.limits.maximumReceivedAwards;
  delete v2.limits.maximumLocalAssignmentResponses;
  delete v2.limits.maximumAssignmentAuthorities;
  assert.equal(restoreMeshAllocationState(v2).schemaVersion, 4);
});

test("restore rejects a message identifier collision across retained owner and assignee evidence", async () => {
  const pending = await awaitingAward();
  const owner = await ownerOfferedAllocation(pending.keys, pending.resolver);
  const collision = structuredClone(pending.state.allocation);
  collision.workAllocations = structuredClone(owner.workAllocations);
  collision.localOffers = structuredClone(owner.localOffers);
  collision.reservations = structuredClone(owner.reservations);
  collision.lastLogicalTime = owner.lastLogicalTime;
  assert.throws(
    () => restoreMeshAllocationState(collision),
    /messageId is not unique/u,
  );
});

test("restore revalidates trusted wall-time context for every assignee evidence kind", async () => {
  const pending = await awaitingAward();
  const response = await preparedResponse(
    "work.accept",
    pending.keys,
    pending.resolver,
    pending.award.signed.messageId,
  );
  const accepted = evaluateMeshAllocationCommand(
    pending.state,
    {
      kind: "allocation.assignment_response",
      awardId: "award-a",
      preparedAt: 5,
      envelope: response.signed,
    },
    at,
    5,
  );
  assert.equal(accepted.accepted, true, accepted.code);
  const base = accepted.state.allocation;
  const forgedVerifiedAt = "2026-07-29T23:00:00.000Z";

  const forgedOffer = structuredClone(base);
  forgedOffer.receivedOffers["offer-a"].validityVerifiedAt = forgedVerifiedAt;
  forgedOffer.receivedOffers["offer-a"].bidDeadlineAt = 3_660_002;
  forgedOffer.receivedOffers["offer-a"].workDeadlineAt = 7_200_002;
  forgedOffer.assigneeAuthorities["award-a"].workDeadlineAt = 7_200_002;
  assert.throws(
    () => restoreMeshAllocationState(forgedOffer),
    /received offer projection/u,
  );

  const forgedBid = structuredClone(base);
  forgedBid.localBids["bid-a"].validityVerifiedAt = forgedVerifiedAt;
  forgedBid.localBids["bid-a"].bidExpiresAtLogical = 3_660_003;
  assert.throws(
    () => restoreMeshAllocationState(forgedBid),
    /local bid projection/u,
  );

  const forgedAward = structuredClone(base);
  forgedAward.receivedAwards["award-a"].validityVerifiedAt = forgedVerifiedAt;
  forgedAward.receivedAwards["award-a"].acceptanceDeadlineAt = 3_615_004;
  forgedAward.receivedAwards["award-a"].leaseExpiresAtLogical = 3_625_004;
  forgedAward.assigneeAuthorities["award-a"].leaseExpiresAtLogical = 3_625_004;
  assert.throws(
    () => restoreMeshAllocationState(forgedAward),
    /received award projection/u,
  );

  const forgedResponse = structuredClone(base);
  forgedResponse.localAssignmentResponses["award-a"].validityVerifiedAt =
    forgedVerifiedAt;
  assert.throws(
    () => restoreMeshAllocationState(forgedResponse),
    /local assignment response projection/u,
  );
});

test("an active assignee appends a causally ordered execution trail and terminal result exactly once", async () => {
  const active = await activeAssignee();
  const progress = await preparedExecution(
    "work.progress",
    active.keys,
    active.resolver,
    { messageId: "XAAAAAAAAAAAAAAAAAAAAA" },
  );
  const progressed = evaluateMeshAllocationCommand(
    active.state,
    {
      kind: "allocation.execution",
      preparedAt: 6,
      envelope: progress.signed,
    },
    at,
    6,
  );
  assert.equal(progressed.accepted, true, progressed.code);
  assert.deepEqual(
    progressed.effects.map((effect) => effect.kind),
    ["allocation.execution.dispatch"],
  );
  assert.equal(
    progressed.state.allocation.executionRecords["progress-a"].direction,
    "local",
  );
  const scope = Object.keys(progressed.state.allocation.executionHeads)[0];
  assert.equal(
    progressed.state.allocation.executionHeads[scope].latestProgressSequence,
    1,
  );

  const duplicate = evaluateMeshAllocationCommand(
    progressed.state,
    {
      kind: "allocation.execution",
      preparedAt: 6,
      envelope: progress.signed,
    },
    at,
    6,
  );
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state, progressed.state);

  const gap = await preparedExecution(
    "work.progress",
    active.keys,
    active.resolver,
    {
      messageId: "YAAAAAAAAAAAAAAAAAAAAA",
      sequence: 41,
      payloadPatch: { progressId: "progress-b", progressSequence: 3 },
    },
  );
  rejected(
    evaluateMeshAllocationCommand(
      progressed.state,
      {
        kind: "allocation.execution",
        preparedAt: 7,
        envelope: gap.signed,
      },
      at,
      7,
    ),
    "execution_phase_invalid",
    progressed.state,
  );

  const checkpoint = await preparedExecution(
    "work.checkpoint",
    active.keys,
    active.resolver,
    { messageId: "ZAAAAAAAAAAAAAAAAAAAAA", sequence: 42 },
  );
  const checkpointed = evaluateMeshAllocationCommand(
    progressed.state,
    {
      kind: "allocation.execution",
      preparedAt: 7,
      envelope: checkpoint.signed,
    },
    at,
    7,
  );
  assert.equal(checkpointed.accepted, true, checkpointed.code);

  const result = await preparedExecution(
    "work.result",
    active.keys,
    active.resolver,
    {
      messageId: "HAAAAAAAAAAAAAAAAAAAAA",
      sequence: 43,
      causationId: checkpoint.signed.messageId,
      payloadPatch: { checkpointId: "checkpoint-a" },
    },
  );
  const completed = evaluateMeshAllocationCommand(
    checkpointed.state,
    {
      kind: "allocation.execution",
      preparedAt: 8,
      envelope: result.signed,
    },
    at,
    8,
  );
  assert.equal(completed.accepted, true, completed.code);
  assert.equal(
    completed.state.allocation.executionHeads[scope].phase,
    "completed",
  );
  assert.equal(
    completed.state.allocation.executionHeads[scope].resultId,
    "result-a",
  );

  const afterTerminal = await preparedExecution(
    "work.progress",
    active.keys,
    active.resolver,
    {
      messageId: "IAAAAAAAAAAAAAAAAAAAAA",
      sequence: 44,
      payloadPatch: { progressId: "progress-c", progressSequence: 2 },
    },
  );
  rejected(
    evaluateMeshAllocationCommand(
      completed.state,
      {
        kind: "allocation.execution",
        preparedAt: 9,
        envelope: afterTerminal.signed,
      },
      at,
      9,
    ),
    "execution_phase_invalid",
    completed.state,
  );
});

test("an assignee rejects stale authority and accepts only the owner's active cancellation", async () => {
  const active = await activeAssignee();
  const stale = await preparedExecution(
    "work.progress",
    active.keys,
    active.resolver,
    {
      messageId: "JAAAAAAAAAAAAAAAAAAAAA",
      payloadPatch: {
        assignmentAuthorityId: "stale-token",
        fencingToken: "stale-token",
      },
    },
  );
  rejected(
    evaluateMeshAllocationCommand(
      active.state,
      {
        kind: "allocation.execution",
        preparedAt: 6,
        envelope: stale.signed,
      },
      at,
      6,
    ),
    "execution_authority_invalid",
    active.state,
  );

  const ownerCancel = await preparedExecution(
    "work.cancel",
    active.keys,
    active.resolver,
    {
      messageId: "KAAAAAAAAAAAAAAAAAAAAA",
      senderPeerId: "peer-a",
      audiencePeerId: "peer-b",
      payloadPatch: {
        cancellationId: "work-cancellation-active",
        assignmentState: "active",
      },
    },
  );
  const cancelled = evaluateVerifiedMeshAllocationEnvelope(active.state, {
    envelope: ownerCancel.verified,
    verifiedAt: at,
    receivedAt: 6,
  });
  assert.equal(cancelled.accepted, true, cancelled.code);
  const scope = Object.keys(cancelled.state.allocation.executionHeads)[0];
  assert.equal(
    cancelled.state.allocation.executionHeads[scope].phase,
    "cancelled",
  );

  const expired = await preparedExecution(
    "work.progress",
    active.keys,
    active.resolver,
    {
      messageId: "LAAAAAAAAAAAAAAAAAAAAA",
      payloadPatch: { progressId: "progress-expired", progressSequence: 1 },
    },
  );
  rejected(
    evaluateMeshAllocationCommand(
      active.state,
      {
        kind: "allocation.execution",
        preparedAt:
          active.state.allocation.assigneeAuthorities["award-a"]
            .leaseExpiresAtLogical,
        envelope: expired.signed,
      },
      at,
      active.state.allocation.assigneeAuthorities["award-a"]
        .leaseExpiresAtLogical,
    ),
    "execution_deadline_elapsed",
    active.state,
  );
});

test("execution cancel authority, local identity, and pending-award lease bindings fail closed", async () => {
  const active = await activeAssignee();
  const badActiveCancel = await preparedExecution(
    "work.cancel",
    active.keys,
    active.resolver,
    {
      messageId: "0AAAAAAAAAAAAAAAAAAAAA",
      senderPeerId: "peer-a",
      audiencePeerId: "peer-b",
      payloadPatch: {
        cancellationId: "work-cancellation-wrong-acceptance",
        assignmentState: "active",
        acceptanceId: "acceptance-wrong",
      },
    },
  );
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(active.state, {
      envelope: badActiveCancel.verified,
      verifiedAt: at,
      receivedAt: 6,
    }),
    "execution_authority_invalid",
    active.state,
  );

  const localSenderMismatch = await preparedExecution(
    "work.progress",
    active.keys,
    active.resolver,
    {
      messageId: "1AAAAAAAAAAAAAAAAAAAAA",
      senderInstanceId: "instance-forged",
      payloadPatch: { progressId: "progress-foreign-local" },
    },
  );
  rejected(
    evaluateMeshAllocationCommand(
      active.state,
      {
        kind: "allocation.execution",
        preparedAt: 6,
        envelope: localSenderMismatch.signed,
      },
      at,
      6,
    ),
    "execution_authority_invalid",
    active.state,
  );

  const pending = await awaitingAward();
  const pendingLeaseMismatch = await preparedExecution(
    "work.cancel",
    pending.keys,
    pending.resolver,
    {
      messageId: "2AAAAAAAAAAAAAAAAAAAAA",
      causationId: pending.award.signed.messageId,
      senderPeerId: "peer-a",
      audiencePeerId: "peer-b",
      payloadPatch: {
        cancellationId: "work-cancellation-pending-wrong-lease",
        assignmentState: "award_pending",
        leaseExpiresAt: "2026-07-30T00:00:26.000Z",
      },
    },
  );
  rejected(
    evaluateVerifiedMeshAllocationEnvelope(pending.state, {
      envelope: pendingLeaseMismatch.verified,
      verifiedAt: at,
      receivedAt: 5,
    }),
    "execution_authority_invalid",
    pending.state,
  );
});

test("execution record capacity is bounded per assignment without mutating accepted evidence", async () => {
  const active = await activeAssignee({
    maximumExecutionRecords: 2,
    maximumExecutionHeads: 1,
    maximumExecutionRecordsPerAssignment: 1,
  });
  const first = await preparedExecution(
    "work.progress",
    active.keys,
    active.resolver,
    { messageId: "3AAAAAAAAAAAAAAAAAAAAA" },
  );
  const accepted = evaluateMeshAllocationCommand(
    active.state,
    {
      kind: "allocation.execution",
      preparedAt: 6,
      envelope: first.signed,
    },
    at,
    6,
  );
  assert.equal(accepted.accepted, true, accepted.code);
  const second = await preparedExecution(
    "work.progress",
    active.keys,
    active.resolver,
    {
      messageId: "4AAAAAAAAAAAAAAAAAAAAA",
      payloadPatch: {
        progressId: "progress-capacity-second",
        progressSequence: 2,
      },
    },
  );
  rejected(
    evaluateMeshAllocationCommand(
      accepted.state,
      {
        kind: "allocation.execution",
        preparedAt: 7,
        envelope: second.signed,
      },
      at,
      7,
    ),
    "execution_records_per_assignment_exceeded",
    accepted.state,
  );
});

test("execution snapshot restoration binds heads, terminal records, and coordination domain evidence", async () => {
  const active = await activeAssignee();
  const result = await preparedExecution(
    "work.result",
    active.keys,
    active.resolver,
    {
      messageId: "5AAAAAAAAAAAAAAAAAAAAA",
      payloadPatch: { checkpointId: undefined },
    },
  );
  const completed = evaluateMeshAllocationCommand(
    active.state,
    {
      kind: "allocation.execution",
      preparedAt: 6,
      envelope: result.signed,
    },
    at,
    6,
  );
  assert.equal(completed.accepted, true, completed.code);
  const scope = Object.keys(completed.state.allocation.executionHeads)[0];

  for (const [field, value] of [
    ["fencingToken", "forged-token"],
    ["leaseExpiresAt", "2026-07-30T00:00:26.000Z"],
    ["terminalRecordId", "forged-result"],
  ]) {
    const forged = structuredClone(completed.state.allocation);
    forged.executionHeads[scope][field] = value;
    assert.throws(
      () => restoreMeshAllocationState(forged),
      /execution|head|record|authority/u,
    );
  }

  const missingDomain = structuredClone(completed.state.coordination);
  delete missingDomain.domainRecords[
    JSON.stringify(["work.result", "result-a"])
  ];
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        restoreMeshCoordinationState(missingDomain),
        completed.state.discovery,
        completed.state.objectives,
        completed.state.allocation,
      ),
    /execution|domain|journal/u,
  );
});

test("execution restore requires unique journal evidence and a final terminal sequence", async () => {
  const active = await activeAssignee();
  const checkpoint = await preparedExecution(
    "work.checkpoint",
    active.keys,
    active.resolver,
    { messageId: "cAAAAAAAAAAAAAAAAAAAAA" },
  );
  const checkpointed = evaluateMeshAllocationCommand(
    active.state,
    {
      kind: "allocation.execution",
      preparedAt: 6,
      envelope: checkpoint.signed,
    },
    at,
    6,
  );
  assert.equal(checkpointed.accepted, true, checkpointed.code);
  const result = await preparedExecution(
    "work.result",
    active.keys,
    active.resolver,
    {
      messageId: "dAAAAAAAAAAAAAAAAAAAAA",
      sequence: 41,
      causationId: checkpoint.signed.messageId,
      payloadPatch: { checkpointId: "checkpoint-a" },
    },
  );
  const completed = evaluateMeshAllocationCommand(
    checkpointed.state,
    {
      kind: "allocation.execution",
      preparedAt: 6,
      envelope: result.signed,
    },
    at,
    6,
  );
  assert.equal(completed.accepted, true, completed.code);
  const resultKey = JSON.stringify(["work.result", "result-a"]);
  const checkpointKey = JSON.stringify(["work.checkpoint", "checkpoint-a"]);

  assert.doesNotThrow(() =>
    createMeshAllocationRuntimeState(
      restoreMeshCoordinationState(
        structuredClone(completed.state.coordination),
      ),
      completed.state.discovery,
      completed.state.objectives,
      completed.state.allocation,
    ),
  );

  const duplicateEvidence = structuredClone(completed.state.coordination);
  const resultJournal = duplicateEvidence.journal.find(
    (entry) => entry.domainRecordKey === resultKey,
  );
  duplicateEvidence.journal.push({
    ...resultJournal,
    sequence: duplicateEvidence.localEventSequence + 1,
  });
  duplicateEvidence.localEventSequence += 1;
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        restoreMeshCoordinationState(duplicateEvidence),
        completed.state.discovery,
        completed.state.objectives,
        completed.state.allocation,
      ),
    /execution.*domain|journal/u,
  );

  const postTerminal = structuredClone(completed.state.coordination);
  const terminalJournal = postTerminal.journal.find(
    (entry) => entry.domainRecordKey === resultKey,
  );
  const checkpointJournal = postTerminal.journal.find(
    (entry) => entry.domainRecordKey === checkpointKey,
  );
  [terminalJournal.sequence, checkpointJournal.sequence] = [
    checkpointJournal.sequence,
    terminalJournal.sequence,
  ];
  postTerminal.journal.sort((left, right) => left.sequence - right.sequence);
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        restoreMeshCoordinationState(postTerminal),
        completed.state.discovery,
        completed.state.objectives,
        completed.state.allocation,
      ),
    /execution.*terminal|journal/u,
  );
});
