import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import {
  DEFAULT_MESH_CRYPTO_POLICY,
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
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
  parseSignedMeshEnvelope,
  parseSignedMeshEnvelopeV0,
  parseSignedMeshEnvelopeV1,
} from "@agentplat/mesh-protocol";

const argumentsByName = parseArguments(process.argv.slice(2));
const candidateCommit = argumentsByName.get("--candidate-commit") ?? null;
const output = argumentsByName.get("--output");

const v0Envelope = await readJson(
  new URL(
    "../packages/mesh-crypto/fixtures/v0/signed-peer-hello.json",
    import.meta.url,
  ),
);
const v0Public = await readJson(
  new URL(
    "../packages/mesh-crypto/fixtures/v0/peer-a-public.raw.json",
    import.meta.url,
  ),
);
const v1EnvelopeBytes = await readFile(
  new URL(
    "../packages/mesh-protocol/fixtures/v1/peer-ping.json",
    import.meta.url,
  ),
);
const v1Envelope = JSON.parse(v1EnvelopeBytes.toString("utf8"));
const v1Public = await readJson(
  new URL(
    "../packages/mesh-protocol/fixtures/v1/public-key.raw.json",
    import.meta.url,
  ),
);

const v0Verification = await verifyFixture({
  envelope: v0Envelope,
  publicKeyBytes: Uint8Array.from(v0Public.publicKey),
  keyRecord: {
    tenantId: v0Envelope.tenantId,
    meshId: v0Envelope.meshId,
    peerId: v0Envelope.sender.peerId,
    keyId: v0Envelope.proof.keyId,
    verifiedAt: "2026-07-30T12:01:00Z",
  },
});
const v1Verification = await verifyFixture({
  envelope: v1Envelope,
  publicKeyBytes: Buffer.from(v1Public.publicKeyRaw, "base64url"),
  keyRecord: {
    tenantId: v1Envelope.tenantId,
    meshId: v1Envelope.meshId,
    peerId: v1Envelope.sender.peerId,
    keyId: v1Envelope.proof.keyId,
    verifiedAt: "2026-07-30T00:00:01Z",
  },
});

assert.equal(v0Verification, true);
assert.equal(v1Verification, true);
assert.equal(parseSignedMeshEnvelopeV0(bytes(v0Envelope)).ok, true);
assert.equal(parseSignedMeshEnvelopeV1(v1EnvelopeBytes).ok, true);

const scope = Object.freeze({
  tenantId: "tenant-compatibility",
  meshId: "mesh-compatibility",
  peerId: "peer-beta-b",
  instanceId: "peer-beta-b-1",
});
const dualCard = peerCard([MESH_PREVIOUS_WIRE_VERSION, MESH_WIRE_VERSION]);
const v0Card = peerCard([MESH_PREVIOUS_WIRE_VERSION], {
  peerCardId: "card-beta-b-2",
  cardRevision: 2,
});

const betaToBeta = selectMeshPeerWireVersion({
  ...scope,
  policy: createMeshWireVersionPolicy(),
  peerCard: dualCard,
});
assert.equal(betaToBeta.selected, true);
assert.equal(betaToBeta.binding.wireVersion, MESH_WIRE_VERSION);

const betaToAlpha = selectMeshPeerWireVersion({
  ...scope,
  policy: createMeshWireVersionPolicy({
    bootstraps: [
      {
        peerId: scope.peerId,
        instanceId: scope.instanceId,
        wireVersion: MESH_PREVIOUS_WIRE_VERSION,
      },
    ],
  }),
});
assert.equal(betaToAlpha.selected, true);
assert.equal(betaToAlpha.binding.wireVersion, MESH_PREVIOUS_WIRE_VERSION);

const currentOnly = selectMeshPeerWireVersion({
  ...scope,
  policy: createMeshWireVersionPolicy({
    allowedWireVersions: [MESH_WIRE_VERSION],
  }),
  peerCard: v0Card,
});
assert.deepEqual(currentOnly, {
  selected: false,
  code: "wire_version_unavailable",
});

const downgrade = selectMeshPeerWireVersion({
  ...scope,
  policy: createMeshWireVersionPolicy(),
  peerCard: v0Card,
  highWater: betaToBeta.highWater,
});
assert.deepEqual(downgrade, {
  selected: false,
  code: "wire_version_downgrade",
});

const unknownEnvelope = bytes({ ...v1Envelope, wireVersion: 2 });
const unknown = parseSignedMeshEnvelope(unknownEnvelope);
assert.equal(unknown.ok, false);
assert.equal(unknown.issues[0].code, "unsupported_wire_version");

const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
  "sign",
  "verify",
]);
const v0Prepared = await preparedPing({
  wireVersion: MESH_PREVIOUS_WIRE_VERSION,
  messageId: "AAAAAAAAAAAAAAAAAAAAEA",
  privateKey: keys.privateKey,
});
const v1Prepared = await preparedPing({
  wireVersion: MESH_WIRE_VERSION,
  messageId: "AAAAAAAAAAAAAAAAAAAAEQ",
  privateKey: keys.privateKey,
});
const v0PreparedBytes = canonicalizeMeshJsonBytes(v0Prepared);
const v1PreparedBytes = canonicalizeMeshJsonBytes(v1Prepared);
assert.equal(v0PreparedBytes.ok, true);
assert.equal(v1PreparedBytes.ok, true);
assert.notEqual(v0Prepared.proof.value, v1Prepared.proof.value);
assert.notEqual(digest(v0PreparedBytes.value), digest(v1PreparedBytes.value));

const cells = Object.freeze([
  cell("beta1_to_beta1", "accepted", 1, {
    parser: "v1",
    signature: "verified",
  }),
  cell("beta1_compatibility_to_alpha5", "accepted", 0, {
    parser: "v0",
    signingPolicy: "explicit",
  }),
  cell("alpha5_to_beta1", "accepted", 0, {
    frozenFixture: "signed-peer-hello",
    signature: "verified",
  }),
  cell("beta1_current_only_to_alpha5", "unavailable", null, {
    sent: false,
  }),
  cell("beta1_pinned_v1_to_stale_v0", "downgrade_rejected", null, {
    sent: false,
  }),
  cell("beta1_mixed_topic", "partitioned", null, {
    selectedWireVersions: [0, 1],
    exactBytes: true,
    distinctMessageIds: true,
  }),
  cell("unknown_v2_to_beta1", "unsupported", null, {
    downgradeAttempted: false,
    sent: false,
  }),
]);

const report = Object.freeze({
  schemaVersion: 1,
  releaseVersion: "0.3.0-beta.1",
  candidateCommit,
  status: "passed",
  cells,
  summary: Object.freeze({
    total: cells.length,
    passed: cells.length,
    failed: 0,
  }),
  fixtureDigests: Object.freeze({
    alpha5V0: digest(bytes(v0Envelope)),
    beta1V1: digest(v1EnvelopeBytes),
  }),
});

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output === undefined) process.stdout.write(serialized);
else await writeFile(output, serialized, { encoding: "utf8", mode: 0o644 });

async function verifyFixture({ envelope, publicKeyBytes, keyRecord }) {
  const publicKey = await importMeshEd25519PublicKey(publicKeyBytes);
  const resolver = createStaticMeshKeyResolver([
    {
      tenantId: keyRecord.tenantId,
      meshId: keyRecord.meshId,
      peerId: keyRecord.peerId,
      keyId: keyRecord.keyId,
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey,
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
      status: "active",
    },
  ]);
  const result = await verifyMeshEnvelope({
    envelope,
    resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt: keyRecord.verifiedAt,
  });
  return result.verified;
}

async function preparedPing({ wireVersion, messageId, privateKey }) {
  return createWebCryptoMeshEnvelopeSigner({
    signingPolicy: { allowedWireVersions: [wireVersion] },
  }).sign({
    envelope: {
      protocol: MESH_PROTOCOL,
      wireVersion,
      messageId,
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      type: "peer.ping",
      sender: { peerId: "peer-beta-a", instanceId: "peer-beta-a-1" },
      audience: { kind: "peer", peerId: scope.peerId },
      sequence: wireVersion + 1,
      sentAt: "2026-08-01T00:00:00Z",
      expiresAt: "2026-08-01T00:00:30Z",
      payload: { type: "peer.ping" },
      proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId: "key-beta-a" },
    },
    privateKey,
  });
}

function peerCard(protocolVersions, overrides = {}) {
  return Object.freeze({
    peerId: scope.peerId,
    instanceId: scope.instanceId,
    peerCardId: "card-beta-b-1",
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
    ...overrides,
  });
}

function cell(id, outcome, selectedWireVersion, evidence) {
  return Object.freeze({
    id,
    outcome,
    selectedWireVersion,
    evidence: Object.freeze(evidence),
  });
}

function bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
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
