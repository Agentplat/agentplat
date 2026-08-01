import assert from "node:assert/strict";

import { MESH_REQUIRED_CONFORMANCE_CAPABILITIES } from "@agentplat/mesh-conformance";
import { runMeshProtocolConformance } from "@agentplat/mesh-conformance/protocol";
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  verifyMeshEnvelope,
} from "@agentplat/mesh-crypto";
import {
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
  parseSignedMeshEnvelope,
} from "@agentplat/mesh-protocol";

const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
  "sign",
  "verify",
]);
const scope = Object.freeze({
  tenantId: "tenant-conformance-consumer",
  meshId: "mesh-conformance-consumer",
  peerId: "peer-b",
});
const resolver = createStaticMeshKeyResolver([
  {
    tenantId: scope.tenantId,
    meshId: scope.meshId,
    peerId: "peer-a",
    keyId: "key-a",
    algorithm: MESH_SIGNATURE_ALGORITHM,
    publicKey: keys.publicKey,
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
    status: "active",
  },
]);

const signed = (wireVersion, messageId) =>
  createWebCryptoMeshEnvelopeSigner({
    signingPolicy: { allowedWireVersions: [wireVersion] },
  }).sign({
    envelope: {
      protocol: MESH_PROTOCOL,
      wireVersion,
      messageId,
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      type: "peer.ping",
      sender: { peerId: "peer-a", instanceId: "peer-a-1" },
      audience: { kind: "peer", peerId: scope.peerId },
      sequence: wireVersion + 1,
      sentAt: "2026-08-01T00:00:00Z",
      expiresAt: "2026-08-01T00:00:30Z",
      payload: { type: "peer.ping" },
      proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId: "key-a" },
    },
    privateKey: keys.privateKey,
  });

const [v0Envelope, v1Envelope] = await Promise.all([
  signed(MESH_PREVIOUS_WIRE_VERSION, "AAAAAAAAAAAAAAAAAAAAAA"),
  signed(MESH_WIRE_VERSION, "BBBBBBBBBBBBBBBBBBBBBA"),
]);
const encode = (value) => {
  const result = canonicalizeMeshJsonBytes(value);
  assert.equal(result.ok, true);
  return result.value;
};
const v0EnvelopeBytes = encode(v0Envelope);
const v1EnvelopeBytes = encode(v1Envelope);
const unknownEnvelopeBytes = new TextEncoder().encode(
  JSON.stringify({ ...v1Envelope, wireVersion: 2 }),
);
const substitutedV1EnvelopeBytes = new TextEncoder().encode(
  JSON.stringify({ ...v1Envelope, wireVersion: 0 }),
);
const canonicalValueA = { beta: 2, alpha: 1 };
const canonicalValueB = { alpha: 1, beta: 2 };
const expectedCanonicalBytes = encode(canonicalValueA);

const adapter = Object.freeze({
  parse(bytes, acceptedWireVersions) {
    const result = parseSignedMeshEnvelope(bytes, { acceptedWireVersions });
    return result.ok
      ? { accepted: true, wireVersion: result.value.wireVersion }
      : { accepted: false, reasonCode: result.issues[0].code };
  },
  canonicalize(value) {
    return encode(value);
  },
  async write(wireVersion) {
    return encode(
      await signed(
        wireVersion,
        wireVersion === MESH_PREVIOUS_WIRE_VERSION
          ? "CCCCCCCCCCCCCCCCCCCCCA"
          : "DDDDDDDDDDDDDDDDDDDDDA",
      ),
    );
  },
  async verify(bytes) {
    const parsed = parseSignedMeshEnvelope(bytes);
    if (!parsed.ok) return false;
    const result = await verifyMeshEnvelope({
      envelope: parsed.value,
      resolver,
      policy: DEFAULT_MESH_CRYPTO_POLICY,
      verifiedAt: "2026-08-01T00:00:01Z",
    });
    return result.verified;
  },
});

const cases = await runMeshProtocolConformance({
  declaredCapabilities: [
    ...MESH_REQUIRED_CONFORMANCE_CAPABILITIES,
    "protocol.v0.write",
  ],
  factory: () => adapter,
  fixtures: {
    v0EnvelopeBytes,
    v1EnvelopeBytes,
    unknownEnvelopeBytes,
    substitutedV1EnvelopeBytes,
    canonicalValueA,
    canonicalValueB,
    expectedCanonicalBytes,
  },
});
assert.equal(cases.length, 7);
assert.equal(
  cases.every((entry) => entry.outcome === "passed"),
  true,
);
console.log(
  JSON.stringify({
    status: "passed",
    runner: "mesh-protocol-conformance",
    cases: cases.length,
  }),
);
