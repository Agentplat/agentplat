import assert from "node:assert/strict";

import { MESH_CONFORMANCE_CASES } from "@agentplat/mesh-conformance";
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  verifyMeshEnvelope,
} from "@agentplat/mesh-crypto";
import {
  createMeshWireVersionPolicy,
  selectMeshPeerWireVersion,
} from "@agentplat/mesh/coordination";
import { computeMeshDurableValueDigest } from "@agentplat/mesh/durability";
import {
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
  parseSignedMeshEnvelopeV0,
  parseSignedMeshEnvelopeV1,
} from "@agentplat/mesh-protocol";

const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
  "sign",
  "verify",
]);
const scope = Object.freeze({
  tenantId: "tenant-consumer",
  meshId: "mesh-consumer",
  peerId: "peer-b",
  instanceId: "peer-b-1",
});
const envelopes = await Promise.all(
  [MESH_PREVIOUS_WIRE_VERSION, MESH_WIRE_VERSION].map((wireVersion) =>
    createWebCryptoMeshEnvelopeSigner({
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
        sender: { peerId: "peer-a", instanceId: "peer-a-1" },
        audience: { kind: "peer", peerId: scope.peerId },
        sequence: wireVersion + 1,
        sentAt: "2026-08-01T00:00:00Z",
        expiresAt: "2026-08-01T00:00:30Z",
        payload: { type: "peer.ping" },
        proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId: "key-a" },
      },
      privateKey: keys.privateKey,
    }),
  ),
);
const encoded = envelopes.map((envelope) => {
  const result = canonicalizeMeshJsonBytes(envelope);
  assert.equal(result.ok, true);
  return result.value;
});
assert.equal(parseSignedMeshEnvelopeV0(encoded[0]).ok, true);
assert.equal(parseSignedMeshEnvelopeV1(encoded[1]).ok, true);

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
for (const envelope of envelopes) {
  const result = await verifyMeshEnvelope({
    envelope,
    resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt: "2026-08-01T00:00:01Z",
  });
  assert.equal(result.verified, true);
}

const selected = selectMeshPeerWireVersion({
  ...scope,
  policy: createMeshWireVersionPolicy(),
  peerCard: Object.freeze({
    peerId: scope.peerId,
    instanceId: scope.instanceId,
    peerCardId: "card-b",
    cardRevision: 1,
    protocolVersions: Object.freeze([0, 1]),
    transportHints: Object.freeze([]),
    capabilityIds: Object.freeze([]),
    validFrom: "2026-08-01T00:00:00Z",
    validUntil: "2026-08-02T00:00:00Z",
    validityVerifiedAt: "2026-08-01T00:00:01Z",
    acceptedMessageId: "CCCCCCCCCCCCCCCCCCCCCA",
    acceptedAt: 1,
    expiresAt: 100,
    status: "active",
  }),
});
assert.equal(selected.selected, true);
assert.equal(selected.binding.wireVersion, MESH_WIRE_VERSION);
assert.match(
  await computeMeshDurableValueDigest({ stable: true }),
  /^sha256:/u,
);
assert.ok(MESH_CONFORMANCE_CASES.length >= 19);

console.log(
  JSON.stringify({
    consumer: "plain-esm-mixed-version",
    status: "passed",
    node: process.version,
    wireVersions: envelopes.map(({ wireVersion }) => wireVersion),
  }),
);
