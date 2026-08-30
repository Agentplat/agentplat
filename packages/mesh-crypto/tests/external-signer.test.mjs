import assert from "node:assert/strict";
import test from "node:test";

import {
  createStaticMeshKeyResolver,
  createHttpMeshExternalSignaturePortV1,
  signMeshEnvelopeExternally,
  verifyMeshEnvelope,
} from "../dist/index.js";
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
} from "@agentplat/mesh-protocol";

function unsigned(keyId = "key:peer-a") {
  return {
    protocol: MESH_PROTOCOL,
    wireVersion: MESH_WIRE_VERSION,
    messageId: "EEEEEEEEEEEEEEEEEEEEEA",
    tenantId: "tenant:test",
    meshId: "mesh:test",
    type: "peer.ping",
    sender: { peerId: "peer-a", instanceId: "instance-a" },
    audience: { kind: "peer", peerId: "peer-b" },
    sequence: 1,
    sentAt: "2026-08-30T12:00:00.000Z",
    expiresAt: "2026-08-30T12:00:30.000Z",
    payload: { type: "peer.ping" },
    proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId },
  };
}

test("external signer canonicalizes locally while the private key stays behind the port", async () => {
  const pair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]);
  let observed;
  const envelope = await signMeshEnvelopeExternally({
    envelope: unsigned(),
    signaturePort: {
      async sign(input) {
        observed = input;
        return new Uint8Array(
          await crypto.subtle.sign("Ed25519", pair.privateKey, input.signingBytes),
        );
      },
    },
  });
  assert.equal(observed.algorithm, "Ed25519");
  assert.equal(observed.keyId, "key:peer-a");
  assert.ok(observed.signingBytes.byteLength > 32);
  const resolver = createStaticMeshKeyResolver([{
    tenantId: "tenant:test",
    meshId: "mesh:test",
    peerId: "peer-a",
    keyId: "key:peer-a",
    algorithm: "Ed25519",
    publicKey: pair.publicKey,
    status: "active",
    validFrom: "2026-08-30T00:00:00.000Z",
    validUntil: "2026-08-31T00:00:00.000Z",
  }]);
  const verified = await verifyMeshEnvelope({
    envelope,
    resolver,
    policy: { allowedAlgorithms: ["Ed25519"] },
    verifiedAt: "2026-08-30T12:00:01.000Z",
  });
  assert.equal(verified.verified, true);
});

test("external signer fails closed on a non-Ed25519 signature", async () => {
  await assert.rejects(
    signMeshEnvelopeExternally({
      envelope: unsigned(),
      signaturePort: { async sign() { return new Uint8Array(32); } },
    }),
    /crypto_operation_failed/,
  );
});

test("HTTPS signature port binds request digest, key and projected authorization", async () => {
  const pair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]);
  const keyId = "kms-key-staging-1";
  let authorization;
  const port = createHttpMeshExternalSignaturePortV1({
    endpoint: "https://signer.staging.invalid/v1/sign",
    expectedKeyId: keyId,
    authorizationHeader: async () => "Bearer projected-token",
    fetch: async (_url, init) => {
      authorization = init.headers.authorization;
      const request = JSON.parse(init.body);
      const signingBytes = Buffer.from(request.signingBytes, "base64url");
      const signature = new Uint8Array(
        await crypto.subtle.sign("Ed25519", pair.privateKey, signingBytes),
      );
      return Response.json({
        schemaVersion: 1,
        kind: "agentplat-mesh-external-signature-response-v1",
        requestDigest: request.requestDigest,
        algorithm: request.algorithm,
        keyId: request.keyId,
        signature: Buffer.from(signature).toString("base64url"),
      });
    },
  });
  const envelope = await signMeshEnvelopeExternally({
    envelope: unsigned(keyId),
    signaturePort: port,
  });
  assert.equal(envelope.proof.keyId, keyId);
  assert.equal(authorization, "Bearer projected-token");
});

test("HTTPS signature port rejects HTTP and replayed response bindings", async () => {
  assert.throws(
    () => createHttpMeshExternalSignaturePortV1({
      endpoint: "http://signer.invalid",
      expectedKeyId: "key:test",
    }),
    /credential-free HTTPS/,
  );
  const port = createHttpMeshExternalSignaturePortV1({
    endpoint: "https://signer.invalid",
    expectedKeyId: "key:test",
    fetch: async () => Response.json({
      schemaVersion: 1,
      kind: "agentplat-mesh-external-signature-response-v1",
      requestDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      algorithm: "Ed25519",
      keyId: "key:test",
      signature: "A".repeat(86),
    }),
  });
  await assert.rejects(
    port.sign({ algorithm: "Ed25519", keyId: "key:test", signingBytes: new Uint8Array([1]) }),
    /crypto_operation_failed/,
  );
});
