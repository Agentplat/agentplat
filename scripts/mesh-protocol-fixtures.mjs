import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
  canonicalizeMeshPayload,
  canonicalizeMeshSigningDocument,
  parseSignedMeshEnvelopeV0,
  parseSignedMeshEnvelopeV1,
} from "../packages/mesh-protocol/dist/index.js";

const root = process.cwd();
const fixtureRoot = path.join(root, "packages/mesh-protocol/fixtures");
const v0Root = path.join(fixtureRoot, "v0");
const v1Root = path.join(fixtureRoot, "v1");
const write = process.argv.includes("--write");
const rotateTestKey = process.argv.includes("--rotate-test-key");
if (rotateTestKey && !write) {
  throw new Error("--rotate-test-key requires --write");
}

const fixtureNames = (await readdir(v0Root))
  .filter((name) => name.endsWith(".json") && name !== "manifest.json")
  .sort(compareAscii);
assert.ok(fixtureNames.length > 0, "No wire-v0 protocol fixtures found");

if (write) {
  await mkdir(v1Root, { recursive: true });
  const signingKey = await loadSigningKey();
  for (const name of fixtureNames) {
    const v0 = JSON.parse(await readFile(path.join(v0Root, name), "utf8"));
    let v1 = {
      ...v0,
      wireVersion: MESH_WIRE_VERSION,
      ...(v0.type === "peer.card"
        ? {
            payload: {
              ...v0.payload,
              protocolVersions: [MESH_PREVIOUS_WIRE_VERSION, MESH_WIRE_VERSION],
            },
          }
        : {}),
    };
    if (signingKey === undefined) {
      const existing = JSON.parse(
        await readFile(path.join(v1Root, name), "utf8"),
      );
      v1 = {
        ...v1,
        payloadHash: existing.payloadHash,
        proof: existing.proof,
      };
    } else {
      v1 = await signFixture(v1, signingKey.privateKey);
    }
    await writeFile(
      path.join(v1Root, name),
      `${JSON.stringify(v1, null, 2)}\n`,
      "utf8",
    );
  }
  if (signingKey !== undefined) {
    await writeFile(
      path.join(v1Root, "public-key.raw.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          algorithm: "Ed25519",
          keyId: "fixture-key-v1",
          publicKeyRaw: base64Url(signingKey.publicKeyRaw),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
}

const v1PublicKeyRecord = JSON.parse(
  await readFile(path.join(v1Root, "public-key.raw.json"), "utf8"),
);
assert.deepEqual(Object.keys(v1PublicKeyRecord).sort(), [
  "algorithm",
  "keyId",
  "publicKeyRaw",
  "schemaVersion",
]);
assert.equal(v1PublicKeyRecord.schemaVersion, 1);
assert.equal(v1PublicKeyRecord.algorithm, "Ed25519");
assert.equal(v1PublicKeyRecord.keyId, "fixture-key-v1");
const v1PublicKeyRaw = fromBase64Url(v1PublicKeyRecord.publicKeyRaw);
assert.equal(v1PublicKeyRaw.byteLength, 32);
const v1PublicKey = await crypto.subtle.importKey(
  "raw",
  v1PublicKeyRaw,
  "Ed25519",
  false,
  ["verify"],
);

const manifests = await Promise.all([
  buildManifest(v0Root, MESH_PREVIOUS_WIRE_VERSION),
  buildManifest(v1Root, MESH_WIRE_VERSION, v1PublicKey),
]);

for (const [index, manifest] of manifests.entries()) {
  const directory = index === 0 ? v0Root : v1Root;
  const manifestPath = path.join(directory, "manifest.json");
  const source = `${JSON.stringify(manifest, null, 2)}\n`;
  if (write) {
    await writeFile(manifestPath, source, "utf8");
  } else {
    assert.equal(
      await readFile(manifestPath, "utf8"),
      source,
      `${path.relative(root, manifestPath)} is stale; run pnpm run fixtures:mesh-protocol:write`,
    );
  }
}

console.log(
  `${write ? "Wrote" : "Verified"} ${fixtureNames.length} fixtures for each supported Mesh wire version.`,
);

async function buildManifest(directory, wireVersion, publicKey) {
  const entries = [];
  for (const name of fixtureNames) {
    const filePath = path.join(directory, name);
    const bytes = await readFile(filePath);
    const parsed = JSON.parse(bytes.toString("utf8"));
    assert.equal(parsed.wireVersion, wireVersion, `${name} wire version`);
    const canonicalEnvelope = required(
      canonicalizeMeshJsonBytes(parsed),
      `${name} canonical envelope`,
    );
    const canonicalPayload = required(
      canonicalizeMeshPayload(parsed.payload),
      `${name} canonical payload`,
    );
    const signingDocument = required(
      canonicalizeMeshSigningDocument(parsed),
      `${name} signing document`,
    );
    const payloadDigest = await sha256Bytes(canonicalPayload);
    if (wireVersion === MESH_WIRE_VERSION) {
      assert.equal(
        parsed.payloadHash,
        `sha256:${base64Url(payloadDigest)}`,
        `${name} payload hash`,
      );
      assert.equal(parsed.proof.keyId, v1PublicKeyRecord.keyId, name);
      assert.equal(
        await crypto.subtle.verify(
          "Ed25519",
          publicKey,
          fromBase64Url(parsed.proof.value),
          signingDocument,
        ),
        true,
        `${name} signature`,
      );
    }
    const v0 = parseSignedMeshEnvelopeV0(bytes);
    const v1 = parseSignedMeshEnvelopeV1(bytes);
    assert.equal(v0.ok, wireVersion === MESH_PREVIOUS_WIRE_VERSION, name);
    assert.equal(v1.ok, wireVersion === MESH_WIRE_VERSION, name);
    entries.push({
      file: name,
      messageType: parsed.type,
      wireVersion,
      rawSha256: sha256(bytes),
      canonicalEnvelopeSha256: sha256(canonicalEnvelope),
      canonicalPayloadSha256: sha256(canonicalPayload),
      signingDocumentSha256: sha256(signingDocument),
      ...(wireVersion === MESH_WIRE_VERSION
        ? {
            keyId: v1PublicKeyRecord.keyId,
            publicKeyRawSha256: sha256(v1PublicKeyRaw),
            signature: "verified",
          }
        : {}),
      parser: {
        v0: v0.ok ? "accepted" : v0.issues[0].code,
        v1: v1.ok ? "accepted" : v1.issues[0].code,
      },
    });
  }
  return {
    schemaVersion: 1,
    wireVersion,
    ...(wireVersion === MESH_WIRE_VERSION
      ? {
          signingKey: {
            algorithm: "Ed25519",
            keyId: v1PublicKeyRecord.keyId,
            publicKeyFile: "public-key.raw.json",
            publicKeyRawSha256: sha256(v1PublicKeyRaw),
          },
        }
      : {}),
    fixtureCount: entries.length,
    entries,
  };
}

async function loadSigningKey() {
  const encoded = process.env.AGENTPLAT_MESH_FIXTURE_PRIVATE_KEY_PKCS8;
  if (!rotateTestKey && encoded === undefined) return undefined;
  const pair = rotateTestKey
    ? await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])
    : {
        privateKey: await crypto.subtle.importKey(
          "pkcs8",
          fromBase64Url(encoded),
          "Ed25519",
          true,
          ["sign"],
        ),
      };
  const publicKey =
    "publicKey" in pair
      ? pair.publicKey
      : await derivePublicKey(pair.privateKey);
  return {
    privateKey: pair.privateKey,
    publicKeyRaw: new Uint8Array(
      await crypto.subtle.exportKey("raw", publicKey),
    ),
  };
}

async function derivePublicKey(privateKey) {
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  delete jwk.d;
  return crypto.subtle.importKey("jwk", jwk, "Ed25519", true, ["verify"]);
}

async function signFixture(input, privateKey) {
  const payloadBytes = required(
    canonicalizeMeshPayload(input.payload),
    `${input.type} canonical payload`,
  );
  const payloadHash = `sha256:${base64Url(await sha256Bytes(payloadBytes))}`;
  const unsigned = {
    ...input,
    payloadHash,
    proof: {
      algorithm: "Ed25519",
      keyId: "fixture-key-v1",
    },
  };
  const signingDocument = required(
    canonicalizeMeshSigningDocument(unsigned),
    `${input.type} signing document`,
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("Ed25519", privateKey, signingDocument),
  );
  return {
    ...unsigned,
    proof: { ...unsigned.proof, value: base64Url(signature) },
  };
}

function required(result, label) {
  assert.equal(result.ok, true, label);
  return result.value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256Bytes(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /^[A-Za-z0-9_-]+$/u);
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
