import assert from "node:assert/strict";
import test from "node:test";

const overlay = await import("../packages/mesh/dist/overlay.js");

const payloadDigest = `sha256:${"A".repeat(43)}`;

test("closed profiles derive bounded local views and recover through reserves", () => {
  assert.deepEqual(
    overlay.MESH_SPARSE_OVERLAY_PROFILES_V2.map((profile) => ({
      profileId: profile.profileId,
      peers: profile.maximumPeers,
      interactions: profile.maximumInteractions,
      active: profile.activeNeighborCount,
      reserve: profile.reserveNeighborCount,
    })),
    [
      {
        profileId: "standard-500",
        peers: 500,
        interactions: 5_000,
        active: 9,
        reserve: 9,
      },
      {
        profileId: "large-5000",
        peers: 5_000,
        interactions: 50_000,
        active: 13,
        reserve: 13,
      },
      {
        profileId: "frontier-100000",
        peers: 100_000,
        interactions: 1_000_000,
        active: 17,
        reserve: 17,
      },
    ],
  );

  const profile = overlay.meshSparseOverlayProfileV2("large-5000");
  const view = overlay.createMeshSparsePeerViewV2({
    schemaVersion: 2,
    profile,
    topologySeed: 73,
    peerIndex: 42,
  });
  assert.equal(view.activeNeighborIndexes.length, 13);
  assert.equal(view.reserveNeighborIndexes.length, 13);
  assert.equal(view.activeNeighborIndexes[0], 43);
  assert.equal(view.peerIds, undefined);
  assert.equal(view.edges, undefined);
  assert.equal(
    new Set([...view.activeNeighborIndexes, ...view.reserveNeighborIndexes])
      .size,
    26,
  );

  const excluded = [...view.activeNeighborIndexes.slice(0, 3)].sort(
    (left, right) => left - right,
  );
  const refreshed = overlay.refreshMeshSparsePeerViewV2({
    schemaVersion: 2,
    profile,
    view,
    excludedNeighborIndexes: excluded,
  });
  assert.equal(refreshed.revision, 1);
  assert.equal(refreshed.activeNeighborIndexes.length, 13);
  assert.equal(refreshed.reserveNeighborIndexes.length, 13);
  assert.equal(
    [
      ...refreshed.activeNeighborIndexes,
      ...refreshed.reserveNeighborIndexes,
    ].some((index) => excluded.includes(index)),
    false,
  );
  assert.deepEqual(
    overlay.validateMeshSparsePeerViewV2(profile, refreshed),
    refreshed,
  );
  const retainedIndexes = new Set([
    refreshed.peerIndex,
    ...refreshed.activeNeighborIndexes,
    ...refreshed.reserveNeighborIndexes,
    ...refreshed.excludedNeighborIndexes,
  ]);
  const arbitraryNeighbor = Array.from(
    { length: profile.maximumPeers },
    (_, index) => index,
  ).find((index) => !retainedIndexes.has(index));
  assert.notEqual(arbitraryNeighbor, undefined);
  assert.throws(
    () =>
      overlay.validateMeshSparsePeerViewV2(profile, {
        ...refreshed,
        activeNeighborIndexes: [
          ...refreshed.activeNeighborIndexes.slice(0, -1),
          arbitraryNeighbor,
        ],
      }),
    /binding/u,
  );

  const state = overlay.createMeshSparseRoutingStateV2({
    schemaVersion: 2,
    profile,
    view,
  });
  assert.equal(state.maximumOutboundInteractions, 10);
  const recovered = overlay.refreshMeshSparseRoutingStateV2({
    schemaVersion: 2,
    profile,
    state,
    excludedNeighborIndexes: excluded,
    logicalTime: 1,
  });
  assert.equal(recovered.view.revision, 1);
  assert.equal(recovered.maximumOutboundInteractions, 10);
  assert.equal(recovered.outboundInteractions, 0);
});

test("digest-only updates forward once, bind their chain and enforce local quota", () => {
  const profile = overlay.meshSparseOverlayProfileV2("large-5000");
  const createState = (peerIndex) =>
    overlay.createMeshSparseRoutingStateV2({
      schemaVersion: 2,
      profile,
      view: overlay.createMeshSparsePeerViewV2({
        schemaVersion: 2,
        profile,
        topologySeed: 19,
        peerIndex,
      }),
    });
  let origin = createState(0);
  const published = overlay.publishMeshSparseUpdateV2({
    schemaVersion: 2,
    profile,
    state: origin,
    topic: "planning.delta",
    payloadDigest,
    logicalTime: 1,
    lifetime: 100,
  });
  origin = published.state;
  assert.equal(published.deliveries.length, 2);
  assert.equal(published.update.payload, undefined);
  assert.equal(origin.outboundInteractions, 2);

  const firstDelivery = published.deliveries[0];
  const receiver = createState(firstDelivery.recipientPeerIndex);
  const accepted = overlay.receiveMeshSparseDeliveryV2({
    schemaVersion: 2,
    profile,
    state: receiver,
    delivery: firstDelivery,
    logicalTime: 2,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.duplicate, false);
  assert.equal(accepted.deliveries.length, 2);
  assert.equal(
    accepted.deliveries.every(
      (delivery) =>
        delivery.previousDeliveryDigest === firstDelivery.deliveryDigest &&
        delivery.hop === 2,
    ),
    true,
  );

  const duplicate = overlay.receiveMeshSparseDeliveryV2({
    schemaVersion: 2,
    profile,
    state: accepted.state,
    delivery: firstDelivery,
    logicalTime: 3,
  });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.deliveries.length, 0);
  assert.equal(
    duplicate.state.outboundInteractions,
    accepted.state.outboundInteractions,
  );

  const expired = overlay.receiveMeshSparseDeliveryV2({
    schemaVersion: 2,
    profile,
    state: receiver,
    delivery: firstDelivery,
    logicalTime: 101,
  });
  assert.deepEqual(
    { accepted: expired.accepted, code: expired.code },
    { accepted: false, code: "update_expired" },
  );

  const mismatched = overlay.receiveMeshSparseDeliveryV2({
    schemaVersion: 2,
    profile: overlay.meshSparseOverlayProfileV2("standard-500"),
    state: overlay.createMeshSparseRoutingStateV2({
      schemaVersion: 2,
      profile: overlay.meshSparseOverlayProfileV2("standard-500"),
      view: overlay.createMeshSparsePeerViewV2({
        schemaVersion: 2,
        profile: overlay.meshSparseOverlayProfileV2("standard-500"),
        topologySeed: 19,
        peerIndex: firstDelivery.recipientPeerIndex % 500,
      }),
    }),
    delivery: firstDelivery,
    logicalTime: 2,
  });
  assert.deepEqual(
    { accepted: mismatched.accepted, code: mismatched.code },
    { accepted: false, code: "profile_mismatch" },
  );

  assert.throws(
    () =>
      overlay.validateMeshSparseDeliveryV2(profile, {
        ...firstDelivery,
        recipientPeerIndex: firstDelivery.recipientPeerIndex + 1,
      }),
    /binding/u,
  );

  for (let sequence = 0; sequence < 5; sequence += 1) {
    const next = overlay.publishMeshSparseUpdateV2({
      schemaVersion: 2,
      profile,
      state: origin,
      topic: "planning.delta",
      payloadDigest,
      logicalTime: sequence + 2,
      lifetime: 100,
    });
    origin = next.state;
  }
  assert.equal(origin.outboundInteractions, 10);
  const exhausted = overlay.publishMeshSparseUpdateV2({
    schemaVersion: 2,
    profile,
    state: origin,
    topic: "planning.delta",
    payloadDigest,
    logicalTime: 7,
    lifetime: 100,
  });
  assert.equal(exhausted.deliveries.length, 0);
  assert.equal(exhausted.state.outboundInteractions, 10);
});

test("the large profile reaches 5,000 local views inside its 50,000 interaction ceiling", () => {
  const profile = overlay.meshSparseOverlayProfileV2("large-5000");
  const states = Array.from({ length: profile.maximumPeers }, (_, peerIndex) =>
    overlay.createMeshSparseRoutingStateV2({
      schemaVersion: 2,
      profile,
      view: overlay.createMeshSparsePeerViewV2({
        schemaVersion: 2,
        profile,
        topologySeed: 73,
        peerIndex,
      }),
    }),
  );
  const published = overlay.publishMeshSparseUpdateV2({
    schemaVersion: 2,
    profile,
    state: states[0],
    topic: "planning.delta",
    payloadDigest,
    logicalTime: 1,
    lifetime: 100,
  });
  states[0] = published.state;
  const queue = [...published.deliveries];
  let cursor = 0;
  let acceptedUpdates = 1;
  while (cursor < queue.length) {
    const delivery = queue[cursor];
    cursor += 1;
    const peerIndex = delivery.recipientPeerIndex;
    const result = overlay.receiveMeshSparseDeliveryV2({
      schemaVersion: 2,
      profile,
      state: states[peerIndex],
      delivery,
      logicalTime: 2,
    });
    states[peerIndex] = result.state;
    if (result.accepted && !result.duplicate) {
      acceptedUpdates += 1;
      queue.push(...result.deliveries);
    }
  }
  const outboundInteractions = states.reduce(
    (total, state) => total + state.outboundInteractions,
    0,
  );
  assert.equal(acceptedUpdates, 5_000);
  assert.equal(queue.length, 10_000);
  assert.equal(outboundInteractions, queue.length);
  assert.equal(outboundInteractions <= profile.maximumInteractions, true);
  assert.equal(
    Math.max(...states.map((state) => state.outboundInteractions)),
    2,
  );
});
