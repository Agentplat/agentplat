import {
  COLLECTIVE_PROGRESSIVE_SCALE_OVERLAY_BINDINGS_V2,
  createCollectiveProgressiveScaleOverlayBindingV2,
  createCollectiveProgressiveScalePeerRoutingV2,
  type CollectiveProgressiveScaleOverlayBindingV2,
} from "@agentplat/mesh-sim";

const binding: CollectiveProgressiveScaleOverlayBindingV2 =
  createCollectiveProgressiveScaleOverlayBindingV2({
    schemaVersion: 2,
    tier: "resilient",
  });
void binding;
void COLLECTIVE_PROGRESSIVE_SCALE_OVERLAY_BINDINGS_V2;

createCollectiveProgressiveScalePeerRoutingV2({
  schemaVersion: 2,
  tier: "frontier",
  topologySeed: 73,
  peerIndex: 99_999,
});

createCollectiveProgressiveScaleOverlayBindingV2({
  schemaVersion: 2,
  // @ts-expect-error tiers remain a closed profile set
  tier: "unbounded",
});
