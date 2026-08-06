import {
  createMeshSparsePeerViewV2,
  createMeshSparseRoutingStateV2,
  meshSparseOverlayProfileV2,
  validateMeshSparseOverlayProfileV2,
  validateMeshSparseRoutingStateV2,
  type MeshSparseOverlayDigestV2,
  type MeshSparseOverlayProfileIdV2,
  type MeshSparseOverlayProfileV2,
  type MeshSparseRoutingStateV2,
} from "@agentplat/mesh/overlay";
import {
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  collectiveProgressiveScaleProfileV1,
  validateCollectiveProgressiveScaleProfileV1,
  type CollectiveProgressiveScaleProfileV1,
  type CollectiveProgressiveScaleTierV1,
} from "./collective-progressive-scale.js";

export interface CollectiveProgressiveScaleOverlayBindingV2 {
  readonly schemaVersion: 2;
  readonly tier: CollectiveProgressiveScaleTierV1;
  readonly overlayProfileId: MeshSparseOverlayProfileIdV2;
  readonly progressiveProfileDigest: PlanningDigestV1;
  readonly overlayProfileDigest: MeshSparseOverlayDigestV2;
  readonly agentCount: 500 | 5_000 | 100_000;
  readonly maximumInteractions: 5_000 | 50_000 | 1_000_000;
  readonly topologyOutdegree: number;
  readonly maximumFanout: number;
  readonly maximumHops: number;
  readonly bindingDigest: PlanningDigestV1;
}

export interface CollectiveProgressiveScalePeerRoutingV2 {
  readonly schemaVersion: 2;
  readonly binding: CollectiveProgressiveScaleOverlayBindingV2;
  readonly overlayProfile: MeshSparseOverlayProfileV2;
  readonly routingState: MeshSparseRoutingStateV2;
}

const tierToOverlayProfile = Object.freeze({
  baseline: "standard-500",
  resilient: "large-5000",
  frontier: "frontier-100000",
} as const satisfies Record<
  CollectiveProgressiveScaleTierV1,
  MeshSparseOverlayProfileIdV2
>);

const bindingKeys = [
  "agentCount",
  "bindingDigest",
  "maximumFanout",
  "maximumHops",
  "maximumInteractions",
  "overlayProfileDigest",
  "overlayProfileId",
  "progressiveProfileDigest",
  "schemaVersion",
  "tier",
  "topologyOutdegree",
] as const;

/** Binds the existing scale-evidence profile to the production overlay. */
export function createCollectiveProgressiveScaleOverlayBindingV2(input: {
  readonly schemaVersion: 2;
  readonly tier: CollectiveProgressiveScaleTierV1;
}): CollectiveProgressiveScaleOverlayBindingV2 {
  exact(input, ["schemaVersion", "tier"], "progressive overlay binding input");
  if (input.schemaVersion !== 2)
    fail("progressive overlay binding schema is invalid");
  const progressiveProfile = collectiveProgressiveScaleProfileV1(input.tier);
  const overlayProfile = meshSparseOverlayProfileV2(
    tierToOverlayProfile[input.tier],
  );
  assertCompatible(progressiveProfile, overlayProfile);
  const body = {
    schemaVersion: 2 as const,
    tier: input.tier,
    overlayProfileId: overlayProfile.profileId,
    progressiveProfileDigest: progressiveProfile.profileDigest,
    overlayProfileDigest: overlayProfile.profileDigest,
    agentCount: progressiveProfile.agentCount,
    maximumInteractions: progressiveProfile.maximumInteractions,
    topologyOutdegree: progressiveProfile.topologyOutdegree,
    maximumFanout: overlayProfile.maximumFanout,
    maximumHops: overlayProfile.maximumHops,
  };
  return deepFreezePlanning({
    ...body,
    bindingDigest: digestPlanningJsonV1(
      "progressive-scale-overlay-binding-v2",
      body as unknown as PlanningJson,
    ),
  } as unknown as PlanningJson) as unknown as CollectiveProgressiveScaleOverlayBindingV2;
}

export const COLLECTIVE_PROGRESSIVE_SCALE_OVERLAY_BINDINGS_V2 = Object.freeze(
  (["baseline", "resilient", "frontier"] as const).map((tier) =>
    createCollectiveProgressiveScaleOverlayBindingV2({
      schemaVersion: 2,
      tier,
    }),
  ),
);

export function validateCollectiveProgressiveScaleOverlayBindingV2(
  input: unknown,
): CollectiveProgressiveScaleOverlayBindingV2 {
  const value = exact(input, bindingKeys, "progressive overlay binding");
  const rebuilt = createCollectiveProgressiveScaleOverlayBindingV2({
    schemaVersion: value.schemaVersion,
    tier: value.tier,
  });
  if (!same(value, rebuilt)) fail("progressive overlay binding is invalid");
  return rebuilt;
}

/** Constructs one production routing state from a progressive scale tier. */
export function createCollectiveProgressiveScalePeerRoutingV2(input: {
  readonly schemaVersion: 2;
  readonly tier: CollectiveProgressiveScaleTierV1;
  readonly topologySeed: number;
  readonly peerIndex: number;
  readonly logicalTime?: number;
}): CollectiveProgressiveScalePeerRoutingV2 {
  exact(
    input,
    ["peerIndex", "schemaVersion", "tier", "topologySeed"],
    "progressive peer routing input",
    ["logicalTime"],
  );
  if (input.schemaVersion !== 2)
    fail("progressive peer routing schema is invalid");
  const binding = createCollectiveProgressiveScaleOverlayBindingV2({
    schemaVersion: 2,
    tier: input.tier,
  });
  const overlayProfile = meshSparseOverlayProfileV2(binding.overlayProfileId);
  const view = createMeshSparsePeerViewV2({
    schemaVersion: 2,
    profile: overlayProfile,
    topologySeed: input.topologySeed,
    peerIndex: input.peerIndex,
  });
  const routingState = createMeshSparseRoutingStateV2({
    schemaVersion: 2,
    profile: overlayProfile,
    view,
    logicalTime: input.logicalTime,
  });
  return Object.freeze({
    schemaVersion: 2 as const,
    binding,
    overlayProfile,
    routingState,
  });
}

export function validateCollectiveProgressiveScalePeerRoutingV2(
  input: unknown,
): CollectiveProgressiveScalePeerRoutingV2 {
  const value = exact(
    input,
    ["binding", "overlayProfile", "routingState", "schemaVersion"],
    "progressive peer routing",
  );
  if (value.schemaVersion !== 2)
    fail("progressive peer routing schema is invalid");
  const binding = validateCollectiveProgressiveScaleOverlayBindingV2(
    value.binding,
  );
  const overlayProfile = validateMeshSparseOverlayProfileV2(
    value.overlayProfile,
  );
  if (
    overlayProfile.profileId !== binding.overlayProfileId ||
    overlayProfile.profileDigest !== binding.overlayProfileDigest
  )
    fail("progressive peer routing overlay binding is invalid");
  const routingState = validateMeshSparseRoutingStateV2(
    overlayProfile,
    value.routingState,
  );
  return Object.freeze({
    schemaVersion: 2 as const,
    binding,
    overlayProfile,
    routingState,
  });
}

function assertCompatible(
  progressiveInput: CollectiveProgressiveScaleProfileV1,
  overlayInput: MeshSparseOverlayProfileV2,
): void {
  const progressive =
    validateCollectiveProgressiveScaleProfileV1(progressiveInput);
  const overlay = validateMeshSparseOverlayProfileV2(overlayInput);
  if (
    progressive.agentCount !== overlay.maximumPeers ||
    progressive.maximumInteractions !== overlay.maximumInteractions ||
    progressive.topologyOutdegree !== overlay.activeNeighborCount
  )
    fail("progressive and overlay scale profiles are incompatible");
}

function exact<K extends readonly string[], O extends readonly string[]>(
  input: unknown,
  keys: K,
  label: string,
  optional: O = [] as unknown as O,
): Record<K[number], any> & Partial<Record<O[number], any>> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Object.getOwnPropertySymbols(input).length !== 0
  )
    fail(`${label} must be a plain object`);
  const names = Object.getOwnPropertyNames(input);
  const allowed = new Set<string>([...keys, ...optional]);
  if (
    keys.some((key) => !names.includes(key)) ||
    names.some((name) => !allowed.has(name))
  )
    fail(`${label} has invalid fields`);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      fail(`${label} must contain enumerable data properties only`);
  }
  return input as Record<K[number], any> & Partial<Record<O[number], any>>;
}

function same(left: unknown, right: unknown): boolean {
  try {
    return (
      canonicalizePlanningJsonV1(left as PlanningJson) ===
      canonicalizePlanningJsonV1(right as PlanningJson)
    );
  } catch {
    return false;
  }
}

function fail(message: string): never {
  throw new TypeError(message);
}
