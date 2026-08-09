import assert from "node:assert/strict";
import test from "node:test";

import {
  DEVELOPMENT_CAPABILITY_IDS_V1,
  WebCryptoDevelopmentEvidenceAttestationVerifierV1,
  assessDevelopmentCapabilitiesV1,
  createDevelopmentCapabilityManifestV1,
  createDevelopmentCapabilityReceiptV1,
  createDevelopmentEvidencePolicyV1,
  createDevelopmentSourceTreeSnapshotV1,
  digestDevelopmentEvidenceArtifactV1,
  issueDevelopmentCapabilityAttestationV1,
} from "../packages/collective-planning/dist/development-evidence.js";

const sourceCommit = "a".repeat(40);
const encoder = new TextEncoder();
const sha = (character) => `sha256:${character.repeat(64)}`;

async function fixture() {
  const artifacts = new Map();
  const evidence = new Map();
  for (const capabilityId of DEVELOPMENT_CAPABILITY_IDS_V1) {
    const classes = {
      publicSurfaceDigests: `surfaces/${capabilityId}.json`,
      integrationBoundaryDigests: `integration/${capabilityId}.json`,
      threatModelDigests: `threats/${capabilityId}.md`,
    };
    const digests = {};
    for (const [field, path] of Object.entries(classes)) {
      const bytes = encoder.encode(`${field}:${capabilityId}\n`);
      artifacts.set(path, bytes);
      digests[field] = [digestDevelopmentEvidenceArtifactV1(bytes)];
    }
    evidence.set(capabilityId, digests);
  }
  const sourceTree = createDevelopmentSourceTreeSnapshotV1({
    schemaVersion: 1,
    sourceCommit,
    entries: [...artifacts.entries()]
      .map(([path, bytes]) => ({
        path,
        byteLength: bytes.byteLength,
        contentDigest: digestDevelopmentEvidenceArtifactV1(bytes),
      }))
      .sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      ),
  });
  const manifests = DEVELOPMENT_CAPABILITY_IDS_V1.map((capabilityId) =>
    createDevelopmentCapabilityManifestV1({
      schemaVersion: 1,
      manifestId: `manifest.${capabilityId}`,
      capabilityId,
      sourceCommit,
      sourceTreeDigest: sourceTree.sourceTreeDigest,
      ...evidence.get(capabilityId),
    }),
  );
  const policy = createDevelopmentEvidencePolicyV1({
    schemaVersion: 1,
    policyId: "development-policy.v1",
    sourceCommit,
    sourceTreeDigest: sourceTree.sourceTreeDigest,
    authorizations: manifests
      .map((manifest) => ({
        schemaVersion: 1,
        capabilityId: manifest.capabilityId,
        issuerId: "build-issuer",
        keyId: "build-key.1",
        manifestDigest: manifest.manifestDigest,
      }))
      .sort((left, right) =>
        left.capabilityId < right.capabilityId
          ? -1
          : left.capabilityId > right.capabilityId
            ? 1
            : 0,
      ),
  });
  const receipts = manifests.map((manifest) =>
    createDevelopmentCapabilityReceiptV1({
      schemaVersion: 1,
      receiptId: `receipt.${manifest.capabilityId}`,
      capabilityId: manifest.capabilityId,
      sourceCommit,
      sourceTreeDigest: sourceTree.sourceTreeDigest,
      policyDigest: policy.policyDigest,
      manifestDigest: manifest.manifestDigest,
      publicSurfaceDigests: manifest.publicSurfaceDigests,
      integrationBoundaryDigests: manifest.integrationBoundaryDigests,
      threatModelDigests: manifest.threatModelDigests,
    }),
  );
  const keys = await globalThis.crypto.subtle.generateKey("Ed25519", false, [
    "sign",
    "verify",
  ]);
  const signer = {
    async sign({ attestationDigest }) {
      const value = await globalThis.crypto.subtle.sign(
        "Ed25519",
        keys.privateKey,
        encoder.encode(attestationDigest),
      );
      return Buffer.from(value).toString("base64url");
    },
  };
  const verifier = new WebCryptoDevelopmentEvidenceAttestationVerifierV1({
    keys: {
      async resolve({ issuerId, keyId }) {
        return issuerId === "build-issuer" && keyId === "build-key.1"
          ? keys.publicKey
          : null;
      },
    },
  });
  const byDigest = new Map(
    manifests.map((manifest) => [manifest.manifestDigest, manifest]),
  );
  const resolver = {
    async resolveManifest({ manifestDigest }) {
      return byDigest.get(manifestDigest) ?? null;
    },
    async resolveIssuer({ issuerId, keyId }) {
      return {
        schemaVersion: 1,
        issuerId,
        keyId,
        algorithm: "Ed25519",
        status: "active",
      };
    },
  };
  const artifactResolver = {
    async resolveSourceTree() {
      return sourceTree;
    },
    async resolveArtifact({ path }) {
      return artifacts.get(path) ?? null;
    },
  };
  return {
    artifacts,
    artifactResolver,
    manifests,
    policy,
    receipts,
    resolver,
    signer,
    sourceTree,
    verifier,
  };
}

async function attestAll(value) {
  return Promise.all(
    value.receipts.map((receipt) =>
      issueDevelopmentCapabilityAttestationV1({
        receipt,
        issuerId: "build-issuer",
        keyId: "build-key.1",
        signer: value.signer,
      }),
    ),
  );
}

test("verified source artifacts and Ed25519 attestations close development without granting execution", async () => {
  const value = await fixture();
  const assessment = await assessDevelopmentCapabilitiesV1({
    policy: value.policy,
    attestations: await attestAll(value),
    resolver: value.resolver,
    artifactResolver: value.artifactResolver,
    verifier: value.verifier,
  });
  assert.equal(assessment.developmentStatus, "development_complete");
  assert.equal(assessment.empiricalValidationStatus, "pending");
  assert.equal(assessment.executionPermitted, false);
  assert.equal(
    assessment.coveredCapabilityIds.length,
    DEVELOPMENT_CAPABILITY_IDS_V1.length,
  );
});

test("arbitrary well-formed evidence hashes cannot close an authorized capability", async () => {
  const value = await fixture();
  const original = value.receipts[0];
  const { receiptDigest: _receiptDigest, ...receiptBody } = original;
  const receipt = createDevelopmentCapabilityReceiptV1({
    ...receiptBody,
    publicSurfaceDigests: [sha("f")],
  });
  const attestation = await issueDevelopmentCapabilityAttestationV1({
    receipt,
    issuerId: "build-issuer",
    keyId: "build-key.1",
    signer: value.signer,
  });
  await assert.rejects(
    assessDevelopmentCapabilitiesV1({
      policy: value.policy,
      attestations: [attestation],
      resolver: value.resolver,
      artifactResolver: value.artifactResolver,
      verifier: value.verifier,
    }),
    /receipt is not authorized by manifest/,
  );
});

test("forged signatures and unauthorized issuers fail closed", async () => {
  const value = await fixture();
  const [attestation] = await attestAll({
    ...value,
    receipts: [value.receipts[0]],
  });
  await assert.rejects(
    assessDevelopmentCapabilitiesV1({
      policy: value.policy,
      attestations: [
        {
          ...attestation,
          proof: {
            ...attestation.proof,
            value: Buffer.alloc(64, 120).toString("base64url"),
          },
        },
      ],
      resolver: value.resolver,
      artifactResolver: value.artifactResolver,
      verifier: value.verifier,
    }),
    /signature is invalid/,
  );
  await assert.rejects(
    assessDevelopmentCapabilitiesV1({
      policy: value.policy,
      attestations: [
        {
          ...attestation,
          issuerId: "other-issuer",
          proof: { ...attestation.proof, issuerId: "other-issuer" },
        },
      ],
      resolver: value.resolver,
      artifactResolver: value.artifactResolver,
      verifier: value.verifier,
    }),
    /attestation binding mismatch|not authorized by policy/,
  );
});

test("artifact bytes are rehashed before any capability is covered", async () => {
  const value = await fixture();
  const attestations = await attestAll(value);
  let corrupted = false;
  await assert.rejects(
    assessDevelopmentCapabilitiesV1({
      policy: value.policy,
      attestations,
      resolver: value.resolver,
      artifactResolver: {
        ...value.artifactResolver,
        async resolveArtifact(input) {
          if (!corrupted) {
            corrupted = true;
            return encoder.encode("different source bytes");
          }
          return value.artifactResolver.resolveArtifact(input);
        },
      },
      verifier: value.verifier,
    }),
    /artifact length mismatch|artifact digest mismatch/,
  );
});

test("a caller-authored boolean verifier cannot close source development", async () => {
  const value = await fixture();
  await assert.rejects(
    assessDevelopmentCapabilitiesV1({
      policy: value.policy,
      attestations: await attestAll(value),
      resolver: value.resolver,
      artifactResolver: value.artifactResolver,
      verifier: {
        async verify() {
          return true;
        },
      },
    }),
    /concrete development evidence Ed25519 verifier is required/,
  );
});

test("overriding a branded verifier method cannot bypass internal Web Crypto", async () => {
  const value = await fixture();
  const [attestation] = await attestAll({
    ...value,
    receipts: [value.receipts[0]],
  });
  value.verifier.verify = async () => true;
  await assert.rejects(
    assessDevelopmentCapabilitiesV1({
      policy: value.policy,
      attestations: [
        {
          ...attestation,
          proof: {
            ...attestation.proof,
            value: Buffer.alloc(64, 121).toString("base64url"),
          },
        },
      ],
      resolver: value.resolver,
      artifactResolver: value.artifactResolver,
      verifier: value.verifier,
    }),
    /signature is invalid/,
  );
});
