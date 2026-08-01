import {
  MESH_CONFORMANCE_CAPABILITIES,
  MESH_CONFORMANCE_CASES,
  MESH_CONFORMANCE_REPORT_SCHEMA_VERSION,
  MESH_REQUIRED_CONFORMANCE_CAPABILITIES,
  createMeshConformanceReport,
  validateMeshConformanceReport,
  type MeshConformanceCapability,
  type MeshConformanceCaseResult,
  type MeshConformanceReport,
} from "@agentplat/mesh-conformance";
import {
  runMeshProtocolConformance,
  type MeshProtocolConformanceAdapter,
  type MeshProtocolConformanceFixtures,
} from "@agentplat/mesh-conformance/protocol";
import {
  runMeshTransportConformance,
  type MeshTransportConformanceAdapter,
} from "@agentplat/mesh-conformance/transport";
import {
  runMeshDurabilityConformance,
  type MeshDurabilityConformanceAdapter,
} from "@agentplat/mesh-conformance/durability";
import {
  runMeshRoomsConformance,
  type MeshRoomsConformanceAdapter,
} from "@agentplat/mesh-conformance/rooms";

const capabilities: readonly MeshConformanceCapability[] =
  MESH_CONFORMANCE_CAPABILITIES;
const required: readonly MeshConformanceCapability[] =
  MESH_REQUIRED_CONFORMANCE_CAPABILITIES;
const schemaVersion: 1 = MESH_CONFORMANCE_REPORT_SCHEMA_VERSION;
const caseId: string = MESH_CONFORMANCE_CASES[0]!.id;

declare const cases: readonly MeshConformanceCaseResult[];
const report: MeshConformanceReport = createMeshConformanceReport({
  conformanceVersion: "0.3.0-beta.1",
  suiteDigest: `sha256:${"a".repeat(64)}`,
  fixtureManifestDigest: `sha256:${"b".repeat(64)}`,
  implementation: { name: "consumer", version: "1.0.0" },
  declaredCapabilities: capabilities,
  seed: 1,
  startedAt: "2026-08-01T00:00:00Z",
  endedAt: "2026-08-01T00:00:01Z",
  cases,
});
const validated: MeshConformanceReport = validateMeshConformanceReport(report);

declare const protocolAdapter: MeshProtocolConformanceAdapter;
declare const protocolFixtures: MeshProtocolConformanceFixtures;
declare const transportAdapter: MeshTransportConformanceAdapter;
declare const durabilityAdapter: MeshDurabilityConformanceAdapter;
declare const roomsAdapter: MeshRoomsConformanceAdapter;

void runMeshProtocolConformance({
  declaredCapabilities: required,
  factory: () => protocolAdapter,
  fixtures: protocolFixtures,
});
void runMeshTransportConformance({
  declaredCapabilities: capabilities,
  factory: () => transportAdapter,
  signedEnvelopeBytes: new Uint8Array([1]),
});
void runMeshDurabilityConformance({
  declaredCapabilities: capabilities,
  factory: () => durabilityAdapter,
  allowDestructiveTests: true,
});
void runMeshRoomsConformance({
  declaredCapabilities: capabilities,
  factory: () => roomsAdapter,
  allowDestructiveTests: true,
});

void schemaVersion;
void caseId;
void validated;
