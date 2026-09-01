#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));

if (options.mode === "contract-smoke") {
  exact(options, ["mode"]);
  console.log(JSON.stringify({ status: "passed", productionClaimPermitted: false }));
} else if (options.mode === "assemble-sign") {
  exact(options, [
    "actor-id",
    "actor-type",
    "authorization-directory",
    "evidence-directory",
    "mode",
    "output-directory",
    "private-key",
    "registration-directory",
    "source-sha",
  ]);
  const sourceCommit = required(options, "source-sha");
  assert.match(sourceCommit, /^[0-9a-f]{40}$/u);
  assert.ok(new Set(["agent", "person"]).has(options["actor-type"]));
  assert.match(options["actor-id"], /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u);
  const evidenceDirectory = path.resolve(required(options, "evidence-directory"));
  const registrationDirectory = path.resolve(required(options, "registration-directory"));
  const authorizationDirectory = path.resolve(required(options, "authorization-directory"));
  const outputDirectory = external(required(options, "output-directory"));
  const [analysis, manifest, soakReceipt, sourceLock, registration, authorization] =
    await Promise.all([
      json(path.join(evidenceDirectory, "readiness-analysis.json")),
      json(path.join(evidenceDirectory, "readiness-artifact-manifest.json")),
      json(path.join(evidenceDirectory, "readiness-soak-receipt.json")),
      json(path.join(registrationDirectory, "source-lock.json")),
      json(path.join(registrationDirectory, "campaign-registration.json")),
      json(path.join(authorizationDirectory, "authorization.json")),
    ]);
  assert.equal(analysis.sourceCommit, sourceCommit);
  assert.equal(analysis.operationalReadiness, "beta1-local-profile-established");
  assert.equal(analysis.productionClaimPermitted, false);
  assert.equal(manifest.sourceCommit, sourceCommit);
  assert.equal(soakReceipt.sourceCommit, sourceCommit);
  assert.equal(sourceLock.sourceCommit, sourceCommit);
  assert.equal(
    git("rev-parse", `${sourceCommit}^{tree}`),
    sourceLock.sourceTree,
  );
  assert.equal(registration.registrationDigest, authorization.registrationDigest);
  assert.equal(authorization.sourceCommit, sourceCommit);
  assert.equal(Date.parse(authorization.issuedAt) <= Date.parse(soakReceipt.startedAt), true);
  assert.equal(Date.parse(authorization.expiresAt) > Date.parse(soakReceipt.completedAt), true);
  execFileSync(
    process.execPath,
    [
      path.join(root, "scripts/agent-morphogenesis-beta1-campaign.mjs"),
      "--mode",
      "verify-authorization",
      "--authorization-directory",
      authorizationDirectory,
    ],
    { cwd: root, stdio: "pipe" },
  );
  const evidenceFiles = (await readdir(evidenceDirectory)).sort();
  const evidenceArtifacts = [];
  for (const name of evidenceFiles) {
    const bytes = await readFile(path.join(evidenceDirectory, name));
    evidenceArtifacts.push({
      name,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const evidenceRoot = digest(
    "agentplat-agent-morphogenesis-beta1-readiness-evidence-root-v1",
    evidenceArtifacts,
  );
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-readiness-bundle-v1",
    sourceCommit,
    sourceTree: sourceLock.sourceTree,
    sourceBindingStatus: "exact-clean-commit",
    profileDigest: analysis.profileDigest,
    registrationDigest: registration.registrationDigest,
    authorizationDigest: authorization.authorizationDigest,
    soakReceiptDigest: soakReceipt.receiptDigest,
    analysisDigest: analysis.analysisDigest,
    artifactManifestDigest: manifest.manifestDigest,
    evidenceArtifacts,
    evidenceRoot,
    completedIterations: analysis.completedIterations,
    operationalScenarioCount: analysis.operationalScenarioCount,
    resourceSamples: analysis.resourceSamples,
    nominalP95WallTimeMs: analysis.nominalP95WallTimeMs,
    recoveryP95WallTimeMs: analysis.recoveryP95WallTimeMs,
    maximumProcessRssBytes: analysis.maximumProcessRssBytes,
    maximumAggregateCpuPercent: analysis.maximumAggregateCpuPercent,
    postgresStorageGrowthBytes: analysis.postgresStorageGrowthBytes,
    temporalStorageGrowthBytes: analysis.temporalStorageGrowthBytes,
    evidenceState: {
      sourceCapability: "implemented",
      conformance: "beta1-campaign-passed",
      operationalEvidence: "readiness-profile-collected",
      operationalReadiness: "beta1-local-profile-established",
      experimentalEvidence: "not-collected",
      productionReadiness: "not-established",
      productionClaimPermitted: false,
      securityCertificationClaimPermitted: false,
    },
    externalSpendUsd: 0,
    excludedCapabilities: [
      "profile-synthesis",
      "recursive-agent-creation",
      "team-split-merge-federation",
    ],
  };
  const bundle = {
    ...body,
    bundleDigest: digest(
      "agentplat-agent-morphogenesis-beta1-readiness-bundle-v1",
      body,
    ),
  };
  const privateKey = createPrivateKey(
    await readFile(path.resolve(required(options, "private-key")), "utf8"),
  );
  assert.equal(privateKey.asymmetricKeyType, "ed25519");
  const attestationBody = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-readiness-attestation-v1",
    bundleDigest: bundle.bundleDigest,
    sourceCommit,
    evidenceRoot,
    analysisDigest: analysis.analysisDigest,
    operationalReadiness: "beta1-local-profile-established",
    actorType: options["actor-type"],
    actorId: options["actor-id"],
    signedAt: new Date().toISOString(),
    productionClaimPermitted: false,
  };
  const attestation = {
    ...attestationBody,
    attestationDigest: digest(
      "agentplat-agent-morphogenesis-beta1-readiness-attestation-v1",
      attestationBody,
    ),
    proof: {
      algorithm: "Ed25519",
      signature: sign(
        null,
        signingBytes(
          "agentplat-agent-morphogenesis-beta1-readiness-attestation-v1",
          attestationBody,
        ),
        privateKey,
      ).toString("base64url"),
    },
  };
  const publicKey = createPublicKey(privateKey).export({
    type: "spki",
    format: "pem",
  });
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    exclusive(outputDirectory, "readiness-bundle.json", bundle),
    exclusive(outputDirectory, "readiness-attestation.json", attestation),
    writeFile(path.join(outputDirectory, "readiness-public-key.pem"), publicKey, {
      encoding: "utf8",
      flag: "wx",
    }),
    writeFile(
      path.join(outputDirectory, "operational-readiness-report.md"),
      report(bundle, analysis),
      { encoding: "utf8", flag: "wx" },
    ),
  ]);
  console.log(JSON.stringify({
    status: "assembled-and-signed",
    sourceCommit,
    bundleDigest: bundle.bundleDigest,
    attestationDigest: attestation.attestationDigest,
    evidenceRoot,
    operationalReadiness: bundle.evidenceState.operationalReadiness,
    productionReadiness: bundle.evidenceState.productionReadiness,
    productionClaimPermitted: false,
    outputDirectory,
  }, null, 2));
} else if (options.mode === "verify") {
  exact(options, ["bundle-directory", "evidence-directory", "mode"]);
  const bundleDirectory = path.resolve(required(options, "bundle-directory"));
  const evidenceDirectory = path.resolve(required(options, "evidence-directory"));
  const [bundle, attestation, publicKey] = await Promise.all([
    json(path.join(bundleDirectory, "readiness-bundle.json")),
    json(path.join(bundleDirectory, "readiness-attestation.json")),
    readFile(path.join(bundleDirectory, "readiness-public-key.pem"), "utf8"),
  ]);
  const { bundleDigest, ...bundleBody } = bundle;
  const { attestationDigest, proof, ...attestationBody } = attestation;
  assert.equal(
    bundleDigest,
    digest("agentplat-agent-morphogenesis-beta1-readiness-bundle-v1", bundleBody),
  );
  assert.equal(
    attestationDigest,
    digest(
      "agentplat-agent-morphogenesis-beta1-readiness-attestation-v1",
      attestationBody,
    ),
  );
  assert.equal(attestation.bundleDigest, bundleDigest);
  assert.equal(
    verify(
      null,
      signingBytes(
        "agentplat-agent-morphogenesis-beta1-readiness-attestation-v1",
        attestationBody,
      ),
      createPublicKey(publicKey),
      Buffer.from(proof.signature, "base64url"),
    ),
    true,
  );
  const artifacts = [];
  for (const retained of bundle.evidenceArtifacts) {
    const bytes = await readFile(path.join(evidenceDirectory, retained.name));
    const actual = {
      name: retained.name,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    assert.deepEqual(actual, retained);
    artifacts.push(actual);
  }
  assert.equal(
    bundle.evidenceRoot,
    digest(
      "agentplat-agent-morphogenesis-beta1-readiness-evidence-root-v1",
      artifacts,
    ),
  );
  assert.equal(bundle.evidenceState.operationalReadiness, "beta1-local-profile-established");
  assert.equal(bundle.evidenceState.productionReadiness, "not-established");
  assert.equal(bundle.evidenceState.productionClaimPermitted, false);
  console.log(JSON.stringify({
    status: "verified",
    sourceCommit: bundle.sourceCommit,
    bundleDigest,
    attestationDigest,
    evidenceRoot: bundle.evidenceRoot,
    operationalReadiness: bundle.evidenceState.operationalReadiness,
    productionReadiness: bundle.evidenceState.productionReadiness,
    productionClaimPermitted: false,
  }));
} else {
  fail("readiness_bundle_mode_invalid");
}

function report(bundle, analysis) {
  return `# Agent Morphogenesis Beta 1 operational readiness report\n\n` +
    `Source commit: \`${bundle.sourceCommit}\`\n\n` +
    `Bundle digest: \`${bundle.bundleDigest}\`\n\n` +
    `Operational readiness: **beta1-local-profile-established**\n\n` +
    `The supervised local/staging profile completed ${analysis.completedIterations} iterations over ${analysis.resourceSamples} resource samples. Nominal p95 was ${analysis.nominalP95WallTimeMs} ms and recovery p95 was ${analysis.recoveryP95WallTimeMs} ms. Peak RSS was ${analysis.maximumProcessRssBytes} bytes and peak aggregate CPU was ${analysis.maximumAggregateCpuPercent}%. PostgreSQL grew ${analysis.postgresStorageGrowthBytes} bytes and Temporal grew ${analysis.temporalStorageGrowthBytes} bytes.\n\n` +
    `Experimental evidence remains not collected. Production readiness and security certification are not established, and production claims are prohibited. The frozen V1 baseline and excluded future capabilities are unchanged.\n`;
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function exclusive(directory, name, value) {
  await writeFile(
    path.join(directory, name),
    `${JSON.stringify(value, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (!value.startsWith("--") || index + 1 >= args.length)
      fail("readiness_bundle_option_invalid");
    result[value.slice(2)] = args[++index];
  }
  return result;
}

function exact(value, keys) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(","))
    fail("readiness_bundle_options_invalid");
}

function required(value, key) {
  if (!value[key]) fail(`readiness_bundle_${key}_required`);
  return value[key];
}

function external(value) {
  const result = path.resolve(value);
  const relative = path.relative(root, result);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
    fail("readiness_bundle_output_must_be_external");
  return result;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${JSON.stringify(canonical(value))}`)
    .digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function signingBytes(domain, value) {
  return Buffer.from(`${domain}\0${JSON.stringify(canonical(value))}`, "utf8");
}

function fail(message) {
  throw new TypeError(message);
}
