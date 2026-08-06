import assert from "node:assert/strict";
import test from "node:test";

const scale = await import("../packages/mesh-sim/dist/index.js");

test("progressive scale tiers are bound to production sparse overlay profiles", () => {
  assert.deepEqual(
    scale.COLLECTIVE_PROGRESSIVE_SCALE_OVERLAY_BINDINGS_V2.map((binding) => ({
      tier: binding.tier,
      profile: binding.overlayProfileId,
      agents: binding.agentCount,
      interactions: binding.maximumInteractions,
      degree: binding.topologyOutdegree,
      fanout: binding.maximumFanout,
    })),
    [
      {
        tier: "baseline",
        profile: "standard-500",
        agents: 500,
        interactions: 5_000,
        degree: 9,
        fanout: 2,
      },
      {
        tier: "resilient",
        profile: "large-5000",
        agents: 5_000,
        interactions: 50_000,
        degree: 13,
        fanout: 2,
      },
      {
        tier: "frontier",
        profile: "frontier-100000",
        agents: 100_000,
        interactions: 1_000_000,
        degree: 17,
        fanout: 2,
      },
    ],
  );
  for (const binding of scale.COLLECTIVE_PROGRESSIVE_SCALE_OVERLAY_BINDINGS_V2)
    assert.deepEqual(
      scale.validateCollectiveProgressiveScaleOverlayBindingV2(binding),
      binding,
    );
});

test("a large-tier execution peer receives bounded production routing state", () => {
  const peer = scale.createCollectiveProgressiveScalePeerRoutingV2({
    schemaVersion: 2,
    tier: "resilient",
    topologySeed: 73,
    peerIndex: 4_999,
    logicalTime: 11,
  });
  assert.equal(peer.binding.agentCount, 5_000);
  assert.equal(peer.binding.maximumInteractions, 50_000);
  assert.equal(peer.overlayProfile.profileId, "large-5000");
  assert.equal(peer.routingState.view.peerId, "peer-4999");
  assert.equal(peer.routingState.view.activeNeighborIndexes.length, 13);
  assert.equal(peer.routingState.view.reserveNeighborIndexes.length, 13);
  assert.equal(peer.routingState.maximumOutboundInteractions, 10);
  assert.equal(peer.routingState.view.peerIds, undefined);
  assert.equal(peer.routingState.view.edges, undefined);
  assert.deepEqual(
    scale.validateCollectiveProgressiveScalePeerRoutingV2(peer),
    peer,
  );

  assert.throws(
    () =>
      scale.validateCollectiveProgressiveScaleOverlayBindingV2({
        ...peer.binding,
        maximumInteractions: 1_000_000,
      }),
    /binding/u,
  );
});
