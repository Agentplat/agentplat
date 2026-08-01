import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";

import { runMeshProtocolConformance } from "@agentplat/mesh-conformance/protocol";
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  computeMeshPayloadHash,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  importMeshEd25519PublicKey,
  verifyMeshEnvelope,
} from "@agentplat/mesh-crypto";
import {
  createMeshWireVersionPolicy,
  selectMeshPeerWireVersion,
} from "@agentplat/mesh/coordination";
import {
  computeMeshDurableValueDigest,
  createMeshDurableSnapshotCodecRegistry,
  verifyMeshDurableJournal,
} from "@agentplat/mesh/durability";
import {
  MESH_HTTP_V0_PATH,
  MESH_HTTP_V1_PATH,
  createMeshHttpHandler,
} from "@agentplat/mesh-http";
import {
  PostgresMeshDurableRepository,
  createPostgresPool,
  runMigrations,
} from "@agentplat/mesh-postgres";
import {
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
  parseSignedMeshEnvelope,
} from "@agentplat/mesh-protocol";

const argumentsByName = parseArguments(process.argv.slice(2));
const output = argumentsByName.get("--output");
const candidateCommit = argumentsByName.get("--candidate-commit") ?? null;
const manifest = JSON.parse(
  await readFile(
    new URL("../config/mesh-beta1-benchmarks.json", import.meta.url),
    "utf8",
  ),
);
validateManifest(manifest);

const schema = `mesh_benchmark_${randomBytes(8).toString("hex")}`;
const pool = createPostgresPool({ max: 8 });
const scope = Object.freeze({
  tenantId: "tenant-benchmark",
  meshId: "mesh-benchmark",
  peerId: "peer-b",
  instanceId: "peer-b-instance",
});
const workloads = [];
let postgresVersion = null;

try {
  const migrationStarted = performance.now();
  await runMigrations(pool, { schema, createSchema: true });
  const migrationMs = elapsed(migrationStarted);
  postgresVersion = String(
    (await pool.query("SHOW server_version")).rows[0].server_version,
  );
  const repository = new PostgresMeshDurableRepository(pool, {
    schema,
    maximumPendingInboxRowsPerScope: 1_024,
  });
  const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    "sign",
    "verify",
  ]);
  const resolver = createStaticMeshKeyResolver([
    {
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      peerId: "peer-a",
      keyId: "peer-a-key",
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keys.publicKey,
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
      status: "active",
    },
  ]);
  const fixtures = await loadProtocolFixtures();
  const boundaryEnvelope = await signedPing({
    privateKey: keys.privateKey,
    messageId: messageId(1),
    wireVersion: MESH_WIRE_VERSION,
    sequence: 1,
    extensions: { boundary: "x".repeat(65_536) },
  });
  const boundaryBytes = canonicalizeMeshJsonBytes(boundaryEnvelope);
  assert.equal(boundaryBytes.ok, true);

  workloads.push(
    await measure(
      "protocol.parse.v0.typical",
      manifest.profiles.typical,
      fixtures.v0EnvelopeBytes.byteLength,
      () => {
        const parsed = parseSignedMeshEnvelope(fixtures.v0EnvelopeBytes);
        assert.equal(parsed.ok, true);
      },
    ),
    await measure(
      "protocol.parse.v1.typical",
      manifest.profiles.typical,
      fixtures.v1EnvelopeBytes.byteLength,
      () => {
        const parsed = parseSignedMeshEnvelope(fixtures.v1EnvelopeBytes);
        assert.equal(parsed.ok, true);
      },
    ),
    await measure(
      "protocol.canonicalize.v1.boundary",
      manifest.profiles.boundary,
      boundaryBytes.value.byteLength,
      () => {
        const canonical = canonicalizeMeshJsonBytes(boundaryEnvelope);
        assert.equal(canonical.ok, true);
      },
    ),
  );

  let cryptoSequence = 10_000;
  workloads.push(
    await measure(
      "crypto.hash_sign_verify.typical",
      manifest.profiles.typical,
      fixtures.v1EnvelopeBytes.byteLength,
      async () => {
        cryptoSequence += 1;
        const envelope = await signedPing({
          privateKey: keys.privateKey,
          messageId: messageId(cryptoSequence),
          wireVersion: MESH_WIRE_VERSION,
          sequence: cryptoSequence,
        });
        assert.match(
          await computeMeshPayloadHash({ payload: envelope.payload }),
          /^sha256:/u,
        );
        const verified = await verifyMeshEnvelope({
          envelope,
          resolver,
          policy: DEFAULT_MESH_CRYPTO_POLICY,
          verifiedAt: "2026-08-01T00:00:01Z",
        });
        assert.equal(verified.verified, true);
      },
    ),
  );

  const negotiationScope = Object.freeze({
    tenantId: scope.tenantId,
    meshId: scope.meshId,
    peerId: "peer-b",
    instanceId: "peer-b-instance",
  });
  const policy = createMeshWireVersionPolicy();
  const cards = [
    peerCard(negotiationScope, "card-v0", [MESH_PREVIOUS_WIRE_VERSION]),
    peerCard(negotiationScope, "card-v1", [
      MESH_PREVIOUS_WIRE_VERSION,
      MESH_WIRE_VERSION,
    ]),
  ];
  let cardIndex = 0;
  workloads.push(
    await measure(
      "negotiation.mixed_cohort.typical",
      manifest.profiles.typical,
      Buffer.byteLength(JSON.stringify(cards)),
      () => {
        const selected = selectMeshPeerWireVersion({
          ...negotiationScope,
          policy,
          peerCard: cards[cardIndex++ % cards.length],
        });
        assert.equal(selected.selected, true);
      },
    ),
  );

  let accepted = 0;
  const accept = async () => ({ accepted: true, duplicate: accepted++ > 0 });
  const handlers = {
    [MESH_PREVIOUS_WIRE_VERSION]: createMeshHttpHandler({
      target: scope,
      wireVersion: MESH_PREVIOUS_WIRE_VERSION,
      accept,
    }),
    [MESH_WIRE_VERSION]: createMeshHttpHandler({ target: scope, accept }),
  };
  const httpEnvelopes = {
    [MESH_PREVIOUS_WIRE_VERSION]: await signedPing({
      privateKey: keys.privateKey,
      messageId: messageId(15_000),
      wireVersion: MESH_PREVIOUS_WIRE_VERSION,
      sequence: 15_000,
    }),
    [MESH_WIRE_VERSION]: await signedPing({
      privateKey: keys.privateKey,
      messageId: messageId(15_001),
      wireVersion: MESH_WIRE_VERSION,
      sequence: 15_001,
    }),
  };
  const httpBytes = {
    [MESH_PREVIOUS_WIRE_VERSION]: canonicalizeMeshJsonBytes(
      httpEnvelopes[MESH_PREVIOUS_WIRE_VERSION],
    ).value,
    [MESH_WIRE_VERSION]: canonicalizeMeshJsonBytes(
      httpEnvelopes[MESH_WIRE_VERSION],
    ).value,
  };
  let httpIndex = 0;
  workloads.push(
    await measure(
      "http.ingress_exact_retry.typical",
      manifest.profiles.typical,
      fixtures.v1EnvelopeBytes.byteLength,
      async () => {
        const useV0 = httpIndex++ % 2 === 0;
        const wireVersion = useV0
          ? MESH_PREVIOUS_WIRE_VERSION
          : MESH_WIRE_VERSION;
        const body = httpBytes[wireVersion];
        const path = useV0 ? MESH_HTTP_V0_PATH : MESH_HTTP_V1_PATH;
        const response = await handlers[wireVersion](
          new Request(`http://127.0.0.1${path}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          }),
        );
        assert.equal(response.status, 202);
      },
    ),
  );

  const postgresProfile = manifest.profiles.postgres;
  const inboundEnvelopes = await Promise.all(
    Array.from({ length: postgresProfile.samples }, (_, index) =>
      signedPing({
        privateKey: keys.privateKey,
        messageId: messageId(20_000 + index),
        wireVersion: MESH_WIRE_VERSION,
        sequence: 20_000 + index,
      }),
    ),
  );
  let receiptIndex = 0;
  workloads.push(
    await measure(
      "postgres.receipt.typical",
      postgresProfile,
      canonicalizeMeshJsonBytes(inboundEnvelopes[0]).value.byteLength,
      async () => {
        const received = await repository.receive({
          scope,
          envelope: inboundEnvelopes[receiptIndex++],
        });
        assert.equal(received.accepted, true);
        assert.equal(received.duplicate, false);
      },
    ),
  );

  let transitionIndex = 0;
  workloads.push(
    await measure(
      "postgres.claim_transition_journal_outbox.typical",
      postgresProfile,
      canonicalizeMeshJsonBytes(inboundEnvelopes[0]).value.byteLength,
      async () => {
        const [inbox] = await repository.claimInbox({
          scope,
          workerId: "benchmark-transition",
          limit: 1,
          leaseDurationMs: 30_000,
        });
        assert.ok(inbox);
        const index = transitionIndex++;
        const outgoing = await signedPing({
          privateKey: keys.privateKey,
          messageId: messageId(30_000 + index),
          wireVersion: MESH_WIRE_VERSION,
          sequence: 30_000 + index,
          senderPeerId: "peer-b",
          senderInstanceId: scope.instanceId,
          audiencePeerId: "peer-a",
        });
        const committed = await repository.commitInboxTransition({
          inbox,
          expectedSnapshotRevision: index,
          transitionId: `benchmark-transition-${index}`,
          outcome: "applied",
          nextState: { count: index + 1 },
          journal: [
            { entryId: `benchmark-journal-${index}`, kind: "inbox.applied" },
          ],
          outbox: [
            { effectId: `benchmark-effect-${index}`, envelope: outgoing },
          ],
        });
        assert.equal(committed.committed, true);
        const [outbox] = await repository.claimOutbox({
          scope,
          workerId: "benchmark-outbox",
          limit: 1,
          leaseDurationMs: 30_000,
        });
        assert.ok(outbox);
        assert.equal(
          await repository.settleOutbox({
            outbox,
            settlement: { disposition: "delivered" },
          }),
          true,
        );
      },
    ),
  );
  assert.equal(
    await verifyMeshDurableJournal({
      entries: await repository.inspectJournal({ scope, limit: 256 }),
    }),
    true,
  );

  const snapshotFormat = "application/vnd.agentplat.benchmark-state+json";
  const registry = createMeshDurableSnapshotCodecRegistry([
    {
      descriptor: { format: snapshotFormat, schemaVersion: 2 },
      readableSchemaVersions: [1, 2],
      encode(value) {
        return { count: value.count, label: value.label };
      },
      decode(state, schemaVersion) {
        return {
          count: state.count,
          label: schemaVersion === 1 ? "migrated" : state.label,
        };
      },
      migrate(state) {
        return { count: state.count, label: "migrated" };
      },
    },
  ]);
  const legacyState = { count: 1 };
  const legacySnapshot = Object.freeze({
    schemaVersion: 2,
    scope,
    revision: 1,
    state: legacyState,
    stateDigest: await computeMeshDurableValueDigest(legacyState),
    snapshotFormat,
    snapshotSchemaVersion: 1,
    committedAt: "2026-08-01T00:00:00Z",
  });
  workloads.push(
    await measure(
      "snapshot.migrate_restore.boundary",
      manifest.profiles.boundary,
      Buffer.byteLength(JSON.stringify(legacySnapshot)),
      async () => {
        const migrated = await registry.migrate(legacySnapshot);
        assert.equal(migrated.descriptor.schemaVersion, 2);
      },
    ),
  );

  const protocolFactory = await createProtocolFactory(fixtures);
  workloads.push(
    await measure(
      "conformance.protocol_runner.typical",
      {
        ...manifest.profiles.typical,
        operationsPerSample: 1,
        samples: Math.min(5, manifest.profiles.typical.samples),
      },
      fixtures.v0EnvelopeBytes.byteLength + fixtures.v1EnvelopeBytes.byteLength,
      async () => {
        const results = await runMeshProtocolConformance({
          factory: protocolFactory,
          fixtures,
          declaredCapabilities: [
            "protocol.v0.read",
            "protocol.v1.read",
            "protocol.v0.write",
            "protocol.v1.write",
            "protocol.canonical",
          ],
          timeoutMs: 5_000,
        });
        assert.equal(
          results.every(
            (result) =>
              result.outcome === "passed" || result.outcome === "not_declared",
          ),
          true,
        );
      },
    ),
  );

  assert.deepEqual(
    workloads.map(({ id }) => id),
    manifest.workloads,
  );
  const report = {
    schemaVersion: 1,
    releaseVersion: manifest.releaseVersion,
    candidateCommit,
    status: "passed",
    diagnosticOnly: true,
    environment: {
      node: process.version,
      postgres: postgresVersion,
      os: `${platform()} ${release()}`,
      architecture: arch(),
      cpuCount: cpus().length,
      memoryBytes: totalmem(),
    },
    migrationMs,
    workloads,
    summary: {
      workloadCount: workloads.length,
      errorCount: workloads.reduce((sum, item) => sum + item.errorCount, 0),
      correctnessViolations: 0,
    },
    interpretation:
      "Diagnostic measurements for this environment; not a universal service-level objective.",
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === undefined) process.stdout.write(serialized);
  else await writeFile(output, serialized, { encoding: "utf8", mode: 0o644 });
} finally {
  if (/^mesh_benchmark_[a-f0-9]{16}$/u.test(schema)) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  await pool.end();
}

async function measure(id, profile, inputBytes, operation) {
  const durations = [];
  let errorCount = 0;
  for (let sample = 0; sample < profile.samples; sample += 1) {
    const started = performance.now();
    try {
      for (
        let operationIndex = 0;
        operationIndex < profile.operationsPerSample;
        operationIndex += 1
      ) {
        await operation();
      }
    } catch (error) {
      errorCount += 1;
      throw error;
    }
    durations.push(elapsed(started));
  }
  const sorted = [...durations].sort((left, right) => left - right);
  const totalOperations = profile.samples * profile.operationsPerSample;
  const totalMilliseconds = durations.reduce((sum, value) => sum + value, 0);
  return Object.freeze({
    id,
    samples: profile.samples,
    operationsPerSample: profile.operationsPerSample,
    concurrency: profile.concurrency,
    inputBytes,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    throughputOperationsPerSecond: round(
      totalOperations / Math.max(totalMilliseconds / 1_000, 0.000_001),
    ),
    errorCount,
  });
}

async function signedPing({
  privateKey,
  messageId: id,
  wireVersion,
  sequence,
  extensions,
  senderPeerId = "peer-a",
  senderInstanceId = "peer-a-instance",
  audiencePeerId = scope.peerId,
}) {
  return createWebCryptoMeshEnvelopeSigner({
    signingPolicy: { allowedWireVersions: [wireVersion] },
  }).sign({
    envelope: {
      protocol: MESH_PROTOCOL,
      wireVersion,
      messageId: id,
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      type: "peer.ping",
      sender: { peerId: senderPeerId, instanceId: senderInstanceId },
      audience: { kind: "peer", peerId: audiencePeerId },
      sequence,
      sentAt: "2026-08-01T00:00:00Z",
      expiresAt: "2026-08-01T00:00:30Z",
      payload: { type: "peer.ping" },
      ...(extensions === undefined ? {} : { extensions }),
      proof: {
        algorithm: MESH_SIGNATURE_ALGORITHM,
        keyId: "peer-a-key",
      },
    },
    privateKey,
  });
}

async function loadProtocolFixtures() {
  const root = new URL("../packages/mesh-protocol/fixtures/", import.meta.url);
  const [v0EnvelopeBytes, v1EnvelopeBytes, fixturePublic] = await Promise.all([
    readFile(new URL("v0/peer-ping.json", root)),
    readFile(new URL("v1/peer-ping.json", root)),
    readFile(new URL("v1/public-key.raw.json", root), "utf8").then(JSON.parse),
  ]);
  const v1 = JSON.parse(v1EnvelopeBytes.toString("utf8"));
  return Object.freeze({
    v0EnvelopeBytes,
    v1EnvelopeBytes,
    unknownEnvelopeBytes: Buffer.from(
      JSON.stringify({ ...v1, wireVersion: 2 }),
    ),
    substitutedV1EnvelopeBytes: Buffer.from(
      JSON.stringify({ ...v1, wireVersion: 0 }),
    ),
    canonicalValueA: { b: 2, a: 1 },
    canonicalValueB: { a: 1, b: 2 },
    expectedCanonicalBytes: Buffer.from('{"a":1,"b":2}'),
    fixturePublic,
  });
}

async function createProtocolFactory(fixtures) {
  const generatedKeys = await crypto.subtle.generateKey(
    MESH_SIGNATURE_ALGORITHM,
    true,
    ["sign", "verify"],
  );
  const fixtureKey = await importMeshEd25519PublicKey(
    Buffer.from(fixtures.fixturePublic.publicKeyRaw, "base64url"),
  );
  const resolver = createStaticMeshKeyResolver([
    {
      tenantId: "tenant-a",
      meshId: "mesh-a",
      peerId: "peer-a",
      keyId: "fixture-key-v1",
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: fixtureKey,
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
      status: "active",
    },
    {
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      peerId: "peer-a",
      keyId: "peer-a-key",
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: generatedKeys.publicKey,
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
      status: "active",
    },
  ]);
  return () => ({
    parse(value, acceptedWireVersions) {
      const result = parseSignedMeshEnvelope(value, { acceptedWireVersions });
      return result.ok
        ? { accepted: true, wireVersion: result.value.wireVersion }
        : { accepted: false, reasonCode: result.issues[0].code };
    },
    canonicalize(value) {
      const result = canonicalizeMeshJsonBytes(value);
      if (!result.ok) throw new TypeError(result.issues[0].code);
      return result.value;
    },
    async write(wireVersion) {
      const envelope = await createWebCryptoMeshEnvelopeSigner({
        signingPolicy: { allowedWireVersions: [wireVersion] },
      }).sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion,
          messageId:
            wireVersion === MESH_PREVIOUS_WIRE_VERSION
              ? "AAAAAAAAAAAAAAAAAAAAAA"
              : "BBBBBBBBBBBBBBBBBBBBBA",
          tenantId: scope.tenantId,
          meshId: scope.meshId,
          type: "peer.ping",
          sender: { peerId: "peer-a", instanceId: "peer-a-instance" },
          audience: { kind: "peer", peerId: scope.peerId },
          sequence: wireVersion + 1,
          sentAt: "2026-08-01T00:00:00Z",
          expiresAt: "2026-08-01T00:00:30Z",
          payload: { type: "peer.ping" },
          proof: {
            algorithm: MESH_SIGNATURE_ALGORITHM,
            keyId: "peer-a-key",
          },
        },
        privateKey: generatedKeys.privateKey,
      });
      return Buffer.from(JSON.stringify(envelope));
    },
    async verify(value) {
      const parsed = parseSignedMeshEnvelope(value);
      if (!parsed.ok) return false;
      const verified = await verifyMeshEnvelope({
        envelope: parsed.value,
        resolver,
        policy: DEFAULT_MESH_CRYPTO_POLICY,
        verifiedAt: "2026-08-01T00:00:01Z",
      });
      return verified.verified;
    },
  });
}

function peerCard(inputScope, peerCardId, protocolVersions) {
  return Object.freeze({
    peerId: inputScope.peerId,
    instanceId: inputScope.instanceId,
    peerCardId,
    cardRevision: 1,
    protocolVersions: Object.freeze([...protocolVersions]),
    transportHints: Object.freeze([]),
    capabilityIds: Object.freeze([]),
    validFrom: "2026-08-01T00:00:00Z",
    validUntil: "2026-08-02T00:00:00Z",
    validityVerifiedAt: "2026-08-01T00:00:01Z",
    acceptedMessageId: "AAAAAAAAAAAAAAAAAAAAAQ",
    acceptedAt: 1,
    expiresAt: 100,
    status: "active",
  });
}

function messageId(value) {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(value, 12);
  return bytes.toString("base64url");
}

function elapsed(started) {
  return round(performance.now() - started);
}

function percentile(sorted, fraction) {
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function validateManifest(value) {
  if (
    value?.schemaVersion !== 1 ||
    value.releaseVersion !== "0.3.0-beta.1" ||
    value.diagnosticOnly !== true ||
    !Array.isArray(value.workloads) ||
    !value.profiles
  ) {
    throw new TypeError("Invalid Mesh Beta 1 benchmark manifest");
  }
  for (const profile of Object.values(value.profiles)) {
    if (
      !Number.isSafeInteger(profile.samples) ||
      profile.samples < 1 ||
      profile.samples > 256 ||
      !Number.isSafeInteger(profile.operationsPerSample) ||
      profile.operationsPerSample < 1 ||
      profile.operationsPerSample > 256 ||
      !Number.isSafeInteger(profile.concurrency) ||
      profile.concurrency < 1 ||
      profile.concurrency > 64
    ) {
      throw new RangeError("Invalid Mesh Beta 1 benchmark profile");
    }
  }
}

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name !== "--candidate-commit" && name !== "--output") {
      throw new TypeError(`Unsupported argument: ${name}`);
    }
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new TypeError(`${name} requires a value`);
    }
    result.set(name, value);
    index += 1;
  }
  return result;
}
