#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  validateDevelopmentCapabilityManifestV1,
  validateDevelopmentCapabilityReceiptV1,
  validateDevelopmentEvidencePolicyV1,
  validateDevelopmentSourceTreeSnapshotV1,
  validateSignedDevelopmentCapabilityAttestationV1,
} from "../packages/collective-planning/dist/development-evidence.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArguments(process.argv.slice(2));
const baseline = await readJson(
  path.join(root, "config/collective-capability-baseline-v1.json"),
);
const catalog = await readJson(
  path.join(root, "config/collective-capability-evidence-v1.json"),
);

validateCatalogBinding();

if (options.mode === "snapshot") await createSnapshot();
else if (options.mode === "attest") await createAttestedBundle();
else if (options.mode === "verify") await verifyAttestedBundle();
else if (options.mode === "kms-preflight") await preflightAwsKms();
else fail("--mode must be snapshot, attest, verify or kms-preflight");

async function createSnapshot() {
  const output = requireExternalOutput("--output");
  await assertCleanHead();
  const sourceCommit = git(["rev-parse", "HEAD"]);
  const paths = gitBuffer(["ls-files", "-z"])
    .toString("utf8")
    .split("\u0000")
    .filter(Boolean)
    .sort(compareCodeUnits);
  assert(paths.length > 0, "source commit contains no tracked files");
  assertNoSubmodules();

  const bytesByPath = new Map();
  const entries = [];
  for (const relativePath of paths) {
    const bytes = new Uint8Array(await readFile(path.join(root, relativePath)));
    bytesByPath.set(relativePath, bytes);
    entries.push({
      path: relativePath,
      byteLength: bytes.byteLength,
      contentDigest: digestDevelopmentEvidenceArtifactV1(bytes),
    });
  }
  await assertCleanHead(sourceCommit);

  const sourceTree = createDevelopmentSourceTreeSnapshotV1({
    schemaVersion: 1,
    sourceCommit,
    entries,
  });
  const manifests = catalog.capabilities.map((capability) =>
    createDevelopmentCapabilityManifestV1({
      schemaVersion: 1,
      manifestId: `manifest.${capability.capabilityId}.v1`,
      capabilityId: capability.capabilityId,
      sourceCommit,
      sourceTreeDigest: sourceTree.sourceTreeDigest,
      publicSurfaceDigests: evidenceDigests(
        capability.publicSurfacePaths,
        bytesByPath,
      ),
      integrationBoundaryDigests: evidenceDigests(
        capability.integrationBoundaryPaths,
        bytesByPath,
      ),
      threatModelDigests: evidenceDigests(
        capability.threatModelPaths,
        bytesByPath,
      ),
    }),
  );
  const body = {
    schemaVersion: 1,
    kind: "agentplat-development-evidence-snapshot-v1",
    baselineId: baseline.baselineId,
    baselineDigest: baseline.baselineDigest,
    catalogId: catalog.catalogId,
    sourceTree,
    manifests,
  };
  const snapshot = {
    ...body,
    snapshotDigest: digestJson(
      "agentplat-development-evidence-snapshot-v1",
      body,
    ),
  };
  await writeJson(output, snapshot);
  console.log(
    `collective capability evidence snapshot: PASS (${manifests.length}/19 manifests, ${entries.length} tracked files)`,
  );
  console.log(`source commit: ${sourceCommit}`);
  console.log(`source tree: ${sourceTree.sourceTreeDigest}`);
  console.log(`snapshot: ${snapshot.snapshotDigest}`);
  console.log(`output: ${output}`);
}

async function preflightAwsKms() {
  const requestedKeyId = requireTextOption("--kms-key-id");
  const material = await resolveAwsKmsPublicKey(requestedKeyId);
  console.log("collective capability AWS KMS preflight: PASS");
  console.log(`key id: ${material.keyId}`);
  console.log(
    `public key fingerprint: ${digestDevelopmentEvidenceArtifactV1(material.publicKeyBytes)}`,
  );
}

async function createAttestedBundle() {
  const snapshotPath = requireOption("--snapshot");
  const output = requireExternalOutput("--output");
  const issuerId = requireTextOption("--issuer-id");
  const snapshot = await loadAndValidateSnapshot(snapshotPath);
  await assertCleanHead(snapshot.sourceTree.sourceCommit);

  const signingMaterial = await resolveSigningMaterial();
  const keyId = signingMaterial.keyId;
  const manifests = snapshot.manifests;
  const policy = createDevelopmentEvidencePolicyV1({
    schemaVersion: 1,
    policyId: "agentplat-development-evidence-policy-v1",
    sourceCommit: snapshot.sourceTree.sourceCommit,
    sourceTreeDigest: snapshot.sourceTree.sourceTreeDigest,
    authorizations: manifests
      .map((manifest) => ({
        schemaVersion: 1,
        capabilityId: manifest.capabilityId,
        issuerId,
        keyId,
        manifestDigest: manifest.manifestDigest,
      }))
      .sort((left, right) =>
        compareCodeUnits(left.capabilityId, right.capabilityId),
      ),
  });
  const receipts = manifests.map((manifest) =>
    createDevelopmentCapabilityReceiptV1({
      schemaVersion: 1,
      receiptId: `receipt.${manifest.capabilityId}.v1`,
      capabilityId: manifest.capabilityId,
      sourceCommit: manifest.sourceCommit,
      sourceTreeDigest: manifest.sourceTreeDigest,
      policyDigest: policy.policyDigest,
      manifestDigest: manifest.manifestDigest,
      publicSurfaceDigests: manifest.publicSurfaceDigests,
      integrationBoundaryDigests: manifest.integrationBoundaryDigests,
      threatModelDigests: manifest.threatModelDigests,
    }),
  );
  const attestations = [];
  for (const receipt of receipts)
    attestations.push(
      await issueDevelopmentCapabilityAttestationV1({
        receipt,
        issuerId,
        keyId,
        signer: signingMaterial.signer,
      }),
    );
  const issuer = {
    schemaVersion: 1,
    issuerId,
    keyId,
    algorithm: "Ed25519",
    status: "active",
  };
  const assessment = await assess(
    snapshot,
    policy,
    attestations,
    issuer,
    signingMaterial.publicKey,
  );
  assertCompleteAssessment(assessment);

  const body = {
    schemaVersion: 1,
    kind: "agentplat-development-evidence-attested-bundle-v1",
    baselineId: snapshot.baselineId,
    baselineDigest: snapshot.baselineDigest,
    catalogId: snapshot.catalogId,
    snapshotDigest: snapshot.snapshotDigest,
    sourceTree: snapshot.sourceTree,
    manifests,
    policy,
    receipts,
    issuer,
    publicKeyFingerprint: digestDevelopmentEvidenceArtifactV1(
      signingMaterial.publicKeyBytes,
    ),
    attestations,
    assessment,
  };
  const bundle = {
    ...body,
    bundleDigest: digestJson(
      "agentplat-development-evidence-attested-bundle-v1",
      body,
    ),
  };
  await writeJson(output, bundle);
  console.log(
    `collective capability source attestation: PASS (${assessment.coveredCapabilityIds.length}/19 capabilities)`,
  );
  console.log(`source commit: ${assessment.sourceCommit}`);
  console.log(`assessment: ${assessment.assessmentDigest}`);
  console.log(`bundle: ${bundle.bundleDigest}`);
  console.log(`output: ${output}`);
}

async function verifyAttestedBundle() {
  const bundlePath = requireOption("--bundle");
  const issuerId = requireTextOption("--issuer-id");
  const bundle = await readJson(bundlePath);
  validateBundleEnvelope(bundle);
  await assertCleanHead(bundle.sourceTree.sourceCommit);
  const snapshot = validateSnapshotValue({
    schemaVersion: 1,
    kind: "agentplat-development-evidence-snapshot-v1",
    baselineId: bundle.baselineId,
    baselineDigest: bundle.baselineDigest,
    catalogId: bundle.catalogId,
    sourceTree: bundle.sourceTree,
    manifests: bundle.manifests,
    snapshotDigest: bundle.snapshotDigest,
  });
  const policy = validateDevelopmentEvidencePolicyV1(bundle.policy);
  const receipts = bundle.receipts.map((item) =>
    validateDevelopmentCapabilityReceiptV1(item),
  );
  const attestations = bundle.attestations.map((item) =>
    validateSignedDevelopmentCapabilityAttestationV1(item),
  );
  const verificationMaterial = await resolveVerificationMaterial();
  const keyId = verificationMaterial.keyId;
  assert(bundle.issuer.issuerId === issuerId, "trusted issuer id mismatch");
  assert(bundle.issuer.keyId === keyId, "trusted key id mismatch");
  assert(
    receipts.length === attestations.length &&
      receipts.every(
        (receipt, index) =>
          receipt.receiptDigest === attestations[index].receipt.receiptDigest,
      ),
    "bundle receipt list does not match attested receipts",
  );
  assert(
    bundle.publicKeyFingerprint ===
      digestDevelopmentEvidenceArtifactV1(verificationMaterial.publicKeyBytes),
    "trusted public key fingerprint mismatch",
  );
  const assessment = await assess(
    snapshot,
    policy,
    attestations,
    bundle.issuer,
    verificationMaterial.publicKey,
  );
  assertCompleteAssessment(assessment);
  assert(
    canonicalJson(assessment) === canonicalJson(bundle.assessment),
    "stored assessment differs from verified assessment",
  );
  console.log(
    `collective capability source attestation: PASS (${assessment.coveredCapabilityIds.length}/19 capabilities)`,
  );
  console.log(`source commit: ${assessment.sourceCommit}`);
  console.log(`assessment: ${assessment.assessmentDigest}`);
  console.log(`bundle: ${bundle.bundleDigest}`);
}

async function loadAndValidateSnapshot(file) {
  return validateSnapshotValue(await readJson(file));
}

function validateSnapshotValue(value) {
  assert(
    value?.schemaVersion === 1 &&
      value.kind === "agentplat-development-evidence-snapshot-v1",
    "invalid development evidence snapshot envelope",
  );
  assert(
    value.baselineId === baseline.baselineId,
    "snapshot baseline id mismatch",
  );
  assert(
    value.baselineDigest === baseline.baselineDigest,
    "snapshot baseline digest mismatch",
  );
  assert(value.catalogId === catalog.catalogId, "snapshot catalog id mismatch");
  const sourceTree = validateDevelopmentSourceTreeSnapshotV1(value.sourceTree);
  assert(Array.isArray(value.manifests), "snapshot manifests must be an array");
  const manifests = value.manifests.map((item) =>
    validateDevelopmentCapabilityManifestV1(item),
  );
  assertCapabilityOrder(manifests.map(({ capabilityId }) => capabilityId));
  for (const manifest of manifests) {
    assert(
      manifest.sourceCommit === sourceTree.sourceCommit &&
        manifest.sourceTreeDigest === sourceTree.sourceTreeDigest,
      `manifest source binding mismatch: ${manifest.capabilityId}`,
    );
  }
  assertManifestEvidence(manifests, sourceTree);
  const body = {
    schemaVersion: 1,
    kind: value.kind,
    baselineId: value.baselineId,
    baselineDigest: value.baselineDigest,
    catalogId: value.catalogId,
    sourceTree,
    manifests,
  };
  assert(
    value.snapshotDigest ===
      digestJson("agentplat-development-evidence-snapshot-v1", body),
    "development evidence snapshot digest mismatch",
  );
  return { ...body, snapshotDigest: value.snapshotDigest };
}

function validateBundleEnvelope(bundle) {
  assert(
    bundle?.schemaVersion === 1 &&
      bundle.kind === "agentplat-development-evidence-attested-bundle-v1",
    "invalid attested development evidence bundle",
  );
  const { bundleDigest, ...body } = bundle;
  assert(
    bundleDigest ===
      digestJson("agentplat-development-evidence-attested-bundle-v1", body),
    "attested development evidence bundle digest mismatch",
  );
  assert(
    bundle.baselineId === baseline.baselineId,
    "bundle baseline id mismatch",
  );
  assert(
    bundle.baselineDigest === baseline.baselineDigest,
    "bundle baseline digest mismatch",
  );
  assert(bundle.catalogId === catalog.catalogId, "bundle catalog id mismatch");
  assert(Array.isArray(bundle.receipts), "bundle receipts must be an array");
  assert(
    Array.isArray(bundle.attestations),
    "bundle attestations must be an array",
  );
  assert(
    bundle.issuer?.schemaVersion === 1 &&
      bundle.issuer.algorithm === "Ed25519" &&
      bundle.issuer.status === "active",
    "bundle issuer is invalid",
  );
}

async function assess(snapshot, policy, attestations, issuer, publicKey) {
  const manifests = new Map(
    snapshot.manifests.map((manifest) => [manifest.manifestDigest, manifest]),
  );
  const entries = new Map(
    snapshot.sourceTree.entries.map((entry) => [entry.path, entry]),
  );
  const verifier = new WebCryptoDevelopmentEvidenceAttestationVerifierV1({
    keys: {
      async resolve(input) {
        return input.issuerId === issuer.issuerId &&
          input.keyId === issuer.keyId &&
          input.algorithm === issuer.algorithm
          ? publicKey
          : null;
      },
    },
  });
  return assessDevelopmentCapabilitiesV1({
    policy,
    attestations,
    resolver: {
      async resolveManifest({ manifestDigest }) {
        return manifests.get(manifestDigest) ?? null;
      },
      async resolveIssuer(input) {
        return input.issuerId === issuer.issuerId &&
          input.keyId === issuer.keyId
          ? issuer
          : null;
      },
    },
    artifactResolver: {
      async resolveSourceTree(input) {
        return input.sourceCommit === snapshot.sourceTree.sourceCommit &&
          input.sourceTreeDigest === snapshot.sourceTree.sourceTreeDigest
          ? snapshot.sourceTree
          : null;
      },
      async resolveArtifact(input) {
        const entry = entries.get(input.path);
        if (
          !entry ||
          input.sourceCommit !== snapshot.sourceTree.sourceCommit ||
          input.sourceTreeDigest !== snapshot.sourceTree.sourceTreeDigest ||
          input.contentDigest !== entry.contentDigest ||
          input.byteLength !== entry.byteLength
        )
          return null;
        return new Uint8Array(await readFile(path.join(root, input.path)));
      },
    },
    verifier,
  });
}

function assertManifestEvidence(manifests, sourceTree) {
  const entryByPath = new Map(
    sourceTree.entries.map((entry) => [entry.path, entry]),
  );
  for (const [index, capability] of catalog.capabilities.entries()) {
    const manifest = manifests[index];
    const expected = {
      publicSurfaceDigests: evidenceEntryDigests(
        capability.publicSurfacePaths,
        entryByPath,
      ),
      integrationBoundaryDigests: evidenceEntryDigests(
        capability.integrationBoundaryPaths,
        entryByPath,
      ),
      threatModelDigests: evidenceEntryDigests(
        capability.threatModelPaths,
        entryByPath,
      ),
    };
    for (const field of Object.keys(expected))
      assert(
        canonicalJson(manifest[field]) === canonicalJson(expected[field]),
        `${capability.capabilityId}.${field} differs from evidence catalog`,
      );
  }
}

function evidenceDigests(paths, bytesByPath) {
  return paths
    .map((relativePath) => {
      const bytes = bytesByPath.get(relativePath);
      assert(bytes, `catalog path is not tracked: ${relativePath}`);
      return digestDevelopmentEvidenceArtifactV1(bytes);
    })
    .sort(compareCodeUnits);
}

function evidenceEntryDigests(paths, entryByPath) {
  return paths
    .map((relativePath) => {
      const entry = entryByPath.get(relativePath);
      assert(entry, `catalog path is absent from source tree: ${relativePath}`);
      return entry.contentDigest;
    })
    .sort(compareCodeUnits);
}

function validateCatalogBinding() {
  assert(baseline.status === "frozen", "capability baseline is not frozen");
  assert(
    catalog.baselineId === baseline.baselineId &&
      catalog.baselineDigest === baseline.baselineDigest,
    "capability evidence catalog is not bound to the frozen baseline",
  );
  assertCapabilityOrder(
    catalog.capabilities.map(({ capabilityId }) => capabilityId),
  );
}

function assertCapabilityOrder(ids) {
  assert(
    canonicalJson(ids) === canonicalJson(DEVELOPMENT_CAPABILITY_IDS_V1),
    "capability inventory differs from development evidence V1",
  );
}

function assertCompleteAssessment(value) {
  assert(
    value.developmentStatus === "development_complete",
    "source closure is incomplete",
  );
  assert(
    value.missingCapabilityIds.length === 0,
    "source closure has missing capabilities",
  );
  assert(
    value.coveredCapabilityIds.length === 19,
    "source closure does not cover 19 capabilities",
  );
  assert(
    value.empiricalValidationStatus === "pending",
    "source closure changed empirical status",
  );
  assert(
    value.executionPermitted === false,
    "source evidence cannot grant execution",
  );
}

async function assertCleanHead(expectedCommit) {
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  assert(
    status.length === 0,
    "repository must be clean before source attestation",
  );
  const commit = git(["rev-parse", "HEAD"]);
  if (expectedCommit)
    assert(
      commit === expectedCommit,
      "repository HEAD differs from evidence source commit",
    );
}

function assertNoSubmodules() {
  const index = git(["ls-files", "-s"]);
  assert(
    !index.split("\n").some((line) => line.startsWith("160000 ")),
    "source attestation does not accept submodule entries",
  );
}

async function importPemKey(file, label, format, usages) {
  const bytes = await readPemBytes(file, label);
  return globalThis.crypto.subtle.importKey(
    format,
    bytes,
    { name: "Ed25519" },
    false,
    usages,
  );
}

async function readPemBytes(file, label) {
  const value = await readFile(path.resolve(file), "utf8");
  const pattern = new RegExp(
    `^-----BEGIN ${label}-----\\n([A-Za-z0-9+/=\\n]+)\\n-----END ${label}-----\\n?$`,
    "u",
  );
  const match = pattern.exec(value.replace(/\r\n/gu, "\n"));
  assert(match, `invalid ${label} PEM file`);
  return Buffer.from(match[1].replace(/\n/gu, ""), "base64");
}

async function resolveSigningMaterial() {
  const kmsKeyId = optionalTextOption("--kms-key-id");
  const privateKeyPath = optionalOption("--private-key");
  const publicKeyPath = optionalOption("--public-key");
  if (kmsKeyId) {
    assert(
      !privateKeyPath && !publicKeyPath,
      "--kms-key-id cannot be combined with --private-key or --public-key",
    );
    return resolveAwsKmsSigningMaterial(kmsKeyId);
  }
  assert(
    privateKeyPath && publicKeyPath,
    "--private-key and --public-key are required unless --kms-key-id is supplied",
  );
  const keyId = requireTextOption("--key-id");
  const [privateKey, publicKey, publicKeyBytes] = await Promise.all([
    importPemKey(privateKeyPath, "PRIVATE KEY", "pkcs8", ["sign"]),
    importPemKey(publicKeyPath, "PUBLIC KEY", "spki", ["verify"]),
    readPemBytes(publicKeyPath, "PUBLIC KEY"),
  ]);
  return {
    keyId,
    publicKey,
    publicKeyBytes,
    signer: {
      async sign(input) {
        assert(input.keyId === keyId, "signer key binding mismatch");
        const signature = await globalThis.crypto.subtle.sign(
          "Ed25519",
          privateKey,
          new TextEncoder().encode(input.attestationDigest),
        );
        return Buffer.from(signature).toString("base64url");
      },
    },
  };
}

async function resolveVerificationMaterial() {
  const kmsKeyId = optionalTextOption("--kms-key-id");
  const publicKeyPath = optionalOption("--public-key");
  assert(
    Boolean(kmsKeyId) !== Boolean(publicKeyPath),
    "supply exactly one of --kms-key-id or --public-key",
  );
  if (kmsKeyId) return resolveAwsKmsPublicKey(kmsKeyId);
  const keyId = requireTextOption("--key-id");
  const [publicKey, publicKeyBytes] = await Promise.all([
    importPemKey(publicKeyPath, "PUBLIC KEY", "spki", ["verify"]),
    readPemBytes(publicKeyPath, "PUBLIC KEY"),
  ]);
  return { keyId, publicKey, publicKeyBytes };
}

async function resolveAwsKmsSigningMaterial(requestedKeyId) {
  const material = await resolveAwsKmsPublicKey(requestedKeyId);
  const aws = awsKmsCommandPrefix();
  return {
    ...material,
    signer: {
      async sign(input) {
        assert(input.keyId === material.keyId, "signer key binding mismatch");
        const response = awsJson([
          ...aws,
          "kms",
          "sign",
          "--key-id",
          material.keyId,
          "--message",
          Buffer.from(input.attestationDigest).toString("base64"),
          "--message-type",
          "RAW",
          "--signing-algorithm",
          "ED25519_SHA_512",
        ]);
        assert(
          response?.KeyId === material.keyId,
          "AWS KMS signing key binding mismatch",
        );
        assert(
          typeof response.Signature === "string" &&
            response.Signature.length > 0,
          "AWS KMS returned an invalid signature",
        );
        const signature = Buffer.from(response.Signature, "base64");
        assert(
          signature.byteLength === 64,
          "AWS KMS returned a non-Ed25519 signature",
        );
        return signature.toString("base64url");
      },
    },
  };
}

async function resolveAwsKmsPublicKey(requestedKeyId) {
  const response = awsJson([
    ...awsKmsCommandPrefix(),
    "kms",
    "get-public-key",
    "--key-id",
    requestedKeyId,
  ]);
  assert(
    typeof response?.KeyId === "string" && response.KeyId.length > 0,
    "AWS KMS returned an invalid key id",
  );
  assert(
    response.KeySpec === "ECC_NIST_EDWARDS25519",
    "AWS KMS key must use ECC_NIST_EDWARDS25519",
  );
  assert(
    response.KeyUsage === "SIGN_VERIFY",
    "AWS KMS key must permit signing and verification",
  );
  assert(
    Array.isArray(response.SigningAlgorithms) &&
      response.SigningAlgorithms.includes("ED25519_SHA_512"),
    "AWS KMS key must support ED25519_SHA_512",
  );
  assert(
    typeof response.PublicKey === "string" && response.PublicKey.length > 0,
    "AWS KMS returned no public key",
  );
  const publicKeyBytes = Buffer.from(response.PublicKey, "base64");
  const publicKey = await globalThis.crypto.subtle.importKey(
    "spki",
    publicKeyBytes,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  assert(
    publicKey.type === "public" && publicKey.algorithm.name === "Ed25519",
    "AWS KMS public key is not Ed25519",
  );
  const suppliedKeyId = optionalTextOption("--key-id");
  if (suppliedKeyId)
    assert(
      suppliedKeyId === response.KeyId,
      "--key-id must equal the canonical AWS KMS key id",
    );
  return { keyId: response.KeyId, publicKey, publicKeyBytes };
}

function awsKmsCommandPrefix() {
  const args = [];
  const profile = optionalTextOption("--aws-profile");
  const region = optionalTextOption("--aws-region");
  if (profile) args.push("--profile", profile);
  if (region) args.push("--region", region);
  return args;
}

function awsJson(args) {
  const executable = options["aws-cli"] || "aws";
  const output = execFileSync(executable, [...args, "--output", "json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  try {
    return JSON.parse(output);
  } catch {
    fail("AWS KMS returned invalid JSON");
  }
}

function parseArguments(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--") continue;
    if (!key.startsWith("--")) fail(`unexpected argument: ${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) fail(`missing value for ${key}`);
    parsed[key.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function requireOption(name) {
  const value = options[name.slice(2)];
  if (!value) fail(`${name} is required`);
  return path.resolve(value);
}

function optionalOption(name) {
  const value = options[name.slice(2)];
  return value ? path.resolve(value) : null;
}

function requireExternalOutput(name) {
  const value = requireOption(name);
  const relative = path.relative(root, value);
  assert(
    relative.startsWith("..") || path.isAbsolute(relative),
    `${name} must be outside the repository so the attested tree stays clean`,
  );
  return value;
}

function requireTextOption(name) {
  const value = options[name.slice(2)];
  if (!value || value.trim() !== value || value.length > 256)
    fail(`${name} must be a non-empty identifier of at most 256 characters`);
  return value;
}

function optionalTextOption(name) {
  const value = options[name.slice(2)];
  if (!value) return null;
  if (value.trim() !== value || value.length > 256)
    fail(`${name} must be a non-empty identifier of at most 256 characters`);
  return value;
}

async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(file), "utf8"));
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function digestJson(domain, value) {
  return `sha256:${createHash("sha256")
    .update(domain)
    .update("\u0000")
    .update(canonicalJson(value))
    .digest("hex")}`;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareCodeUnits)
        .map((key) => [key, canonicalize(value[key])]),
    );
  return value;
}

function git(args) {
  return gitBuffer(args).toString("utf8").trim();
}

function gitBuffer(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(message);
}
