import {
  MESH_SPARSE_OVERLAY_PROFILES_V2,
  createMeshSparsePeerViewV2,
  createMeshSparseRoutingStateV2,
  publishMeshSparseUpdateV2,
  receiveMeshSparseDeliveryV2,
  type MeshSparseDeliveryV2,
  type MeshSparseOverlayProfileV2,
  type MeshSparseRoutingStateV2,
} from "@agentplat/mesh/overlay";

const profile: MeshSparseOverlayProfileV2 = MESH_SPARSE_OVERLAY_PROFILES_V2[1];
const view = createMeshSparsePeerViewV2({
  schemaVersion: 2,
  profile,
  topologySeed: 1,
  peerIndex: 0,
});
const state: MeshSparseRoutingStateV2 = createMeshSparseRoutingStateV2({
  schemaVersion: 2,
  profile,
  view,
});
const published = publishMeshSparseUpdateV2({
  schemaVersion: 2,
  profile,
  state,
  topic: "planning.delta",
  payloadDigest: `sha256:${"A".repeat(43)}`,
  logicalTime: 1,
  lifetime: 100,
});
const delivery: MeshSparseDeliveryV2 = published.deliveries[0];
void receiveMeshSparseDeliveryV2({
  schemaVersion: 2,
  profile,
  state,
  delivery,
  logicalTime: 2,
});

createMeshSparsePeerViewV2({
  schemaVersion: 2,
  profile,
  topologySeed: 1,
  // @ts-expect-error indexes must be numeric
  peerIndex: "peer-0",
});
