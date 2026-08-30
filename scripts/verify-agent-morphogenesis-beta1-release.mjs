#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(
  root,
  "docs/research/agent-morphogenesis-beta1-release-v1",
);
const expectedFiles = [
  "README.md",
  "authorization-public-key.pem",
  "authorization.json",
  "campaign-registration.json",
  "environment-manifest.json",
  "evidence-bundle-attestation.json",
  "evidence-bundle-public-key.pem",
  "evidence-bundle.json",
  "metrics.jsonl",
  "operational-validation-report.md",
  "scenario-manifest.json",
  "scenario-receipts.jsonl",
  "source-lock.json",
];
assert.deepEqual((await readdir(directory)).sort(), expectedFiles);

const [sourceLock, registration, authorization, bundle, attestation, report] =
  await Promise.all([
    json("source-lock.json"),
    json("campaign-registration.json"),
    json("authorization.json"),
    json("evidence-bundle.json"),
    json("evidence-bundle-attestation.json"),
    readFile(path.join(directory, "operational-validation-report.md"), "utf8"),
  ]);

assert.match(sourceLock.sourceCommit, /^[0-9a-f]{40}$/u);
assert.equal(
  execFileSync("git", ["cat-file", "-t", sourceLock.sourceCommit], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  "commit",
);
assert.equal(
  execFileSync("git", ["rev-parse", `${sourceLock.sourceCommit}^{tree}`], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  sourceLock.sourceTree,
);
assert.equal(registration.expectedScenarioCount, 18);
assert.equal(authorization.sourceCommit, sourceLock.sourceCommit);
assert.equal(authorization.executionPermitted, true);
assert.equal(authorization.maximumExternalSpendUsd, 0);
assert.equal(authorization.productionClaimPermitted, false);
assert.equal(bundle.sourceCommit, sourceLock.sourceCommit);
assert.equal(bundle.sourceBindingStatus, "exact-clean-commit");
assert.equal(bundle.registrationDigest, registration.registrationDigest);
assert.equal(bundle.authorizationDigest, authorization.authorizationDigest);
assert.equal(bundle.scenarioCount, 18);
assert.equal(bundle.externalSpendUsd, 0);
assert.deepEqual(bundle.excludedCapabilities, [
  "profile-synthesis",
  "recursive-agent-creation",
  "team-split-merge-federation",
]);
assert.deepEqual(bundle.evidenceState, {
  sourceCapability: "implemented",
  conformance: "beta1-campaign-passed",
  operationalDiagnosticEvidence: "collected",
  releaseEvidence: "beta1-local-profile-passed",
  experimentalEvidence: "not-collected",
  operationalReadiness: "not-established",
  productionClaimPermitted: false,
  securityCertificationClaimPermitted: false,
});
assert.equal(attestation.bundleDigest, bundle.bundleDigest);
assert.equal(attestation.sourceCommit, bundle.sourceCommit);
assert.equal(attestation.productionClaimPermitted, false);
assert.match(report, /operational readiness is not established/u);
assert.match(report, /no production or security-certification claim is permitted/u);

for (const file of expectedFiles)
  assert.doesNotMatch(file, /private[-_]?key/iu);
const serialized = JSON.stringify({ sourceLock, registration, authorization, bundle, attestation });
assert.doesNotMatch(serialized, /BEGIN [A-Z ]*PRIVATE KEY/u);

for (const [script, args] of [
  ["scripts/agent-morphogenesis-beta1-campaign.mjs", [
    "--mode",
    "verify-authorization",
    "--authorization-directory",
    directory,
  ]],
  ["scripts/agent-morphogenesis-beta1-bundle.mjs", [
    "--mode",
    "verify",
    "--bundle-directory",
    directory,
  ]],
  ["scripts/verify-collective-capability-baseline.mjs", []],
])
  execFileSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    stdio: "pipe",
  });

console.log(
  JSON.stringify({
    status: "passed",
    sourceCommit: sourceLock.sourceCommit,
    registrationDigest: registration.registrationDigest,
    authorizationDigest: authorization.authorizationDigest,
    bundleDigest: bundle.bundleDigest,
    attestationDigest: attestation.attestationDigest,
    scenarioCount: bundle.scenarioCount,
    releaseEvidence: bundle.evidenceState.releaseEvidence,
    operationalReadiness: bundle.evidenceState.operationalReadiness,
    productionClaimPermitted: false,
    privateKeyPublished: false,
  }, null, 2),
);

async function json(name) {
  return JSON.parse(await readFile(path.join(directory, name), "utf8"));
}
