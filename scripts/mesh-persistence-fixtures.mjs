import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ALLOW_PREPROVISIONED_MESH_ADMISSION,
  createMeshPeerState,
} from "../packages/mesh/dist/index.js";
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  createWebCryptoMeshEnvelopeVerifier,
} from "../packages/mesh-crypto/dist/index.js";
import {
  createMeshAllocationState,
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkState,
  restoreMeshAllocationState,
  restoreMeshCoordinationInboundState,
  restoreMeshCoordinationState,
  restoreMeshDiscoveryState,
  restoreMeshObjectiveWorkState,
} from "../packages/mesh/dist/coordination.js";
import {
  MESH_DURABILITY_SCHEMA_VERSION,
  MESH_DURABLE_ENVELOPE_FORMAT,
  MESH_DURABLE_JOURNAL_VERSION,
  MESH_PREVIOUS_DURABILITY_SCHEMA_VERSION,
  computeMeshDurableValueDigest,
} from "../packages/mesh/dist/durability.js";
import {
  canonicalizeMeshJsonBytes,
  parseSignedMeshEnvelopeV0,
  parseSignedMeshEnvelopeV1,
} from "../packages/mesh-protocol/dist/index.js";
import {
  createMeshSimulationKernel,
  replayMeshSimulation,
  runMeshSimulation,
} from "../packages/mesh-sim/dist/index.js";

const root = process.cwd();
const fixtureRoot = path.join(root, "packages/mesh/fixtures/beta1");
const write = process.argv.includes("--write");
const identity = Object.freeze({
  tenantId: "tenant-fixture",
  meshId: "mesh-fixture",
  peerId: "peer-fixture",
  instanceId: "instance-fixture",
  keyId: "key-fixture",
});
const scope = Object.freeze({
  tenantId: identity.tenantId,
  meshId: identity.meshId,
  peerId: identity.peerId,
  instanceId: identity.instanceId,
});

const currentObjective = plain(createMeshObjectiveWorkState({ identity }));
const legacyObjective = { ...currentObjective, schemaVersion: 1 };
assert.equal(restoreMeshObjectiveWorkState(legacyObjective).schemaVersion, 2);
assert.equal(restoreMeshObjectiveWorkState(currentObjective).schemaVersion, 2);

const currentDiscovery = plain(createMeshDiscoveryState({ identity }));
const { wireVersionHighWaters: _removedHighWaters, ...legacyDiscoveryFields } =
  currentDiscovery;
const legacyDiscovery = { ...legacyDiscoveryFields, schemaVersion: 1 };
assert.equal(restoreMeshDiscoveryState(legacyDiscovery).schemaVersion, 2);
assert.equal(restoreMeshDiscoveryState(currentDiscovery).schemaVersion, 2);

const currentAllocation = plain(createMeshAllocationState({ identity }));
const allocationFixtures = [];
for (let version = 1; version <= 6; version += 1) {
  const fixture = allocationVersion(currentAllocation, version);
  assert.equal(restoreMeshAllocationState(fixture).schemaVersion, 6);
  allocationFixtures.push([`states/allocation-v${version}.json`, fixture]);
}

const coordination = plain(createMeshCoordinationState({ identity }));
const inbound = plain(createMeshCoordinationInboundState({ identity }));
assert.equal(restoreMeshCoordinationState(coordination).schemaVersion, 1);
assert.equal(restoreMeshCoordinationInboundState(inbound).schemaVersion, 1);

const v0Envelope = requiredEnvelope(
  parseSignedMeshEnvelopeV0(
    await readFile(
      path.join(root, "packages/mesh-protocol/fixtures/v0/peer-ping.json"),
    ),
  ),
);
const v1Envelope = requiredEnvelope(
  parseSignedMeshEnvelopeV1(
    await readFile(
      path.join(root, "packages/mesh-protocol/fixtures/v1/peer-ping.json"),
    ),
  ),
);
const v1Canonical = requiredCanonical(v1Envelope);
const legacySnapshotState = { schemaVersion: 1, status: "legacy_fixture" };
const currentSnapshotState = { schemaVersion: 2, status: "current_fixture" };

const fixtures = [
  [
    "states/core-peer.json",
    plain(createMeshPeerState({ identity, admittedPeers: [] })),
  ],
  ["states/coordination-v1.json", coordination],
  ["states/discovery-v1.json", legacyDiscovery],
  ["states/discovery-v2.json", currentDiscovery],
  ["states/inbound-v1.json", inbound],
  ["states/objective-work-v1.json", legacyObjective],
  ["states/objective-work-v2.json", currentObjective],
  ...allocationFixtures,
  [
    "durability/wrapper-v1.json",
    {
      schemaVersion: MESH_PREVIOUS_DURABILITY_SCHEMA_VERSION,
      scope,
      envelopeWireVersion: v0Envelope.wireVersion,
      snapshot: {
        state: legacySnapshotState,
        stateDigest: await computeMeshDurableValueDigest(legacySnapshotState),
        migrationStatus: "legacy_untyped",
      },
      journalVersion: MESH_DURABLE_JOURNAL_VERSION,
    },
  ],
  [
    "durability/wrapper-v2.json",
    {
      schemaVersion: MESH_DURABILITY_SCHEMA_VERSION,
      scope,
      envelope: v1Envelope,
      envelopeFormat: MESH_DURABLE_ENVELOPE_FORMAT,
      envelopeWireVersion: v1Envelope.wireVersion,
      envelopeCanonicalBytes: Buffer.from(v1Canonical).toString("base64url"),
      envelopeDigest: await computeMeshDurableValueDigest(v1Envelope),
      snapshot: {
        format: "application/vnd.agentplat.mesh-peer-state+json",
        schemaVersion: 2,
        state: currentSnapshotState,
        stateDigest: await computeMeshDurableValueDigest(currentSnapshotState),
      },
      journalVersion: MESH_DURABLE_JOURNAL_VERSION,
    },
  ],
];

const simulation = await simulationFixtures();
fixtures.push(
  ["simulation/snapshot-v2.json", simulation.snapshot],
  ["simulation/replay-trace-v1.json", simulation.trace],
);

const migrationFiles = [
  "001_mesh_durability.up.sql",
  "001_mesh_durability.down.sql",
  "002_mesh_compatibility_metadata.up.sql",
  "002_mesh_compatibility_metadata.down.sql",
];
const migrations = [];
for (const file of migrationFiles) {
  const source = await readFile(
    path.join(root, "packages/mesh-postgres/migrations", file),
    "utf8",
  );
  migrations.push({
    file,
    rawSha256: sha256(source),
    expandedFixtureSchemaSha256: sha256(
      source.replaceAll("__AGENTPLAT_SCHEMA__", '"agentplat_fixture"'),
    ),
  });
}
fixtures.push(["postgres/migrations.json", { schemaVersion: 1, migrations }]);

const dumpManifest = {
  schemaVersion: 1,
  sourceRelease: "0.3.0-alpha.5",
  sourceMigrationVersion: 1,
  scope,
  rowCounts: { inbox: 1, journal: 1, outbox: 1, snapshots: 1 },
  sourceDigests: {
    inboxEnvelope: await computeMeshDurableValueDigest(v0Envelope),
    snapshotState: await computeMeshDurableValueDigest(legacySnapshotState),
  },
  expectedAfterMigration2: {
    currentMigrationVersion: 2,
    legacyInboxRows: 1,
    legacyOutboxRows: 1,
    legacySnapshotRows: 1,
    betaRowsMissingCanonicalBytes: 0,
    opaqueSnapshotStatus: "legacy_untyped",
  },
};
fixtures.push(["postgres/alpha5-dump-manifest.json", dumpManifest]);

const entries = [];
for (const [file, value] of fixtures.sort(([left], [right]) =>
  compareAscii(left, right),
)) {
  const source = json(value);
  const canonical = requiredCanonical(value);
  entries.push({
    file,
    rawSha256: sha256(source),
    canonicalSha256: sha256(canonical),
    expectedOutcome: "accepted",
  });
  await verifyOrWrite(path.join(fixtureRoot, file), source);
}

const manifest = {
  schemaVersion: 1,
  releaseLine: "0.3.0-beta.1",
  fixtureCount: entries.length,
  coverage: {
    allocationSchemas: [1, 2, 3, 4, 5, 6],
    discoverySchemas: [1, 2],
    durableWrapperSchemas: [1, 2],
    objectiveWorkSchemas: [1, 2],
    postgresMigrations: [1, 2],
  },
  entries,
};
await verifyOrWrite(path.join(fixtureRoot, "manifest.json"), json(manifest));

console.log(
  `${write ? "Wrote" : "Verified"} ${entries.length} Mesh persistence fixtures.`,
);

async function verifyOrWrite(file, source) {
  if (write) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, source, "utf8");
    return;
  }
  assert.equal(
    await readFile(file, "utf8"),
    source,
    `${path.relative(root, file)} is stale; run pnpm run fixtures:mesh-persistence:write`,
  );
}

async function simulationFixtures() {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  const state = createMeshPeerState({ identity, admittedPeers: [] });
  const resolver = createStaticMeshKeyResolver([
    {
      tenantId: identity.tenantId,
      meshId: identity.meshId,
      peerId: identity.peerId,
      keyId: identity.keyId,
      algorithm: "Ed25519",
      publicKey: keyPair.publicKey,
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
      status: "active",
    },
  ]);
  const config = {
    seed: 24_601,
    prngVersion: "xorshift32-v1",
    recordingMode: "full",
    startTime: "2026-08-01T00:00:00Z",
    peers: [
      {
        peerId: identity.peerId,
        state,
        signer: createWebCryptoMeshEnvelopeSigner(),
        verifier: createWebCryptoMeshEnvelopeVerifier(),
        resolver,
        cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
        admissionPolicy: ALLOW_PREPROVISIONED_MESH_ADMISSION,
        privateKey: keyPair.privateKey,
      },
    ],
    links: [],
    limits: {
      maximumEvents: 8,
      maximumLogicalTime: 1_000,
      maximumQueuedEvents: 8,
      maximumInternalSteps: 8,
    },
    invariants: [],
  };
  const kernel = await createMeshSimulationKernel(config);
  const snapshot = plain(kernel.snapshot());
  const trace = plain(await runMeshSimulation(config, []));
  const replay = await replayMeshSimulation(config, [], trace);
  assert.equal(replay.matches, true);
  return { snapshot, trace };
}

function allocationVersion(current, version) {
  const value = structuredClone(current);
  value.schemaVersion = version;
  if (version < 6) {
    remove(value, [
      "assignmentFenceHeads",
      "witnessAssignments",
      "takeoverProposals",
      "leaseVotes",
      "recoveryCertificates",
    ]);
    remove(value.limits, [
      "maximumAssignmentFenceHeads",
      "maximumWitnessAssignments",
      "maximumTakeoverProposals",
      "maximumLeaseVotes",
      "maximumRecoveryCertificates",
    ]);
  }
  if (version < 5) {
    remove(value, ["leaseRenewals", "leaseHeads"]);
    remove(value.limits, ["maximumLeaseRenewals"]);
  }
  if (version < 4) {
    remove(value, ["executionRecords", "executionHeads"]);
    remove(value.limits, [
      "maximumExecutionRecords",
      "maximumExecutionRecordsPerAssignment",
      "maximumExecutionHeads",
    ]);
  }
  if (version < 3) {
    remove(value, [
      "receivedOffers",
      "localBids",
      "receivedAwards",
      "localAssignmentResponses",
      "assigneeAuthorities",
    ]);
    remove(value.limits, [
      "maximumReceivedOffers",
      "maximumLocalBids",
      "maximumReceivedAwards",
      "maximumLocalAssignmentResponses",
      "maximumAssignmentAuthorities",
    ]);
  }
  if (version < 2) {
    remove(value, ["localAwards", "assignmentResponses"]);
    remove(value.limits, ["maximumAwards", "maximumAssignmentResponses"]);
  }
  return value;
}

function remove(record, keys) {
  for (const key of keys) delete record[key];
}

function requiredEnvelope(result) {
  assert.equal(result.ok, true);
  return result.value;
}

function requiredCanonical(value) {
  const result = canonicalizeMeshJsonBytes(value);
  assert.equal(result.ok, true);
  return result.value;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function json(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareAscii(left, right))
      .map(([key, nested]) => [key, sortValue(nested)]),
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
