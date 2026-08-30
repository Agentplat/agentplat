#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(
  root,
  "docs/research/agent-morphogenesis-beta1-readiness-v2",
);
const expectedFiles = [
  "README.md",
  "authorization-public-key.pem",
  "authorization.json",
  "campaign-registration.json",
  "environment-manifest.json",
  "operational-readiness-report.md",
  "readiness-analysis.json",
  "readiness-artifact-manifest.json",
  "readiness-attestation.json",
  "readiness-bundle.json",
  "readiness-operation-metrics.jsonl",
  "readiness-operation-receipts.jsonl",
  "readiness-public-key.pem",
  "readiness-soak-receipt.json",
  "resource-samples.jsonl",
  "scenario-manifest.json",
  "source-lock.json",
  "supervisor-config.json",
  "supervisor-events.jsonl",
  "supervisor-state.json",
];
assert.deepEqual((await readdir(directory)).sort(), expectedFiles);
for (const file of expectedFiles) assert.doesNotMatch(file, /private[-_]?key/iu);

const [sourceLock, analysis, bundle, attestation, soakReceipt, state, readme] =
  await Promise.all([
    json("source-lock.json"),
    json("readiness-analysis.json"),
    json("readiness-bundle.json"),
    json("readiness-attestation.json"),
    json("readiness-soak-receipt.json"),
    json("supervisor-state.json"),
    readFile(path.join(directory, "README.md"), "utf8"),
  ]);
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
assert.equal(state.status, "completed");
assert.equal(state.failure, null);
assert.equal(state.receiptDigest, soakReceipt.receiptDigest);
assert.equal(analysis.operationalReadiness, "beta1-local-profile-established");
assert.equal(analysis.coveredScenarioIds.length, 22);
assert.deepEqual(
  analysis.coveredScenarioIds,
  [...analysis.coveredScenarioIds].sort(),
);
assert.equal(analysis.productionReadiness, "not-established");
assert.equal(analysis.productionClaimPermitted, false);
assert.equal(bundle.sourceCommit, sourceLock.sourceCommit);
assert.equal(bundle.evidenceState.operationalReadiness, analysis.operationalReadiness);
assert.equal(bundle.evidenceState.experimentalEvidence, "not-collected");
assert.equal(bundle.evidenceState.productionReadiness, "not-established");
assert.equal(bundle.evidenceState.productionClaimPermitted, false);
assert.equal(attestation.bundleDigest, bundle.bundleDigest);
assert.equal(attestation.operationalReadiness, analysis.operationalReadiness);
assert.equal(attestation.productionClaimPermitted, false);
assert.match(
  readme,
  /Production readiness and\s+security certification are not established/u,
);

const serialized = JSON.stringify({ sourceLock, analysis, bundle, attestation, soakReceipt });
assert.doesNotMatch(serialized, /BEGIN [A-Z ]*PRIVATE KEY/u);

for (const [script, args] of [
  ["scripts/agent-morphogenesis-beta1-readiness-evidence.mjs", [
    "--mode",
    "verify",
    "--evidence-directory",
    directory,
  ]],
  ["scripts/agent-morphogenesis-beta1-readiness-bundle.mjs", [
    "--mode",
    "verify",
    "--bundle-directory",
    directory,
    "--evidence-directory",
    directory,
  ]],
  ["scripts/verify-agent-morphogenesis-beta1-operational-readiness.mjs", []],
  ["scripts/verify-collective-capability-baseline.mjs", []],
])
  execFileSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    stdio: "pipe",
  });

console.log(JSON.stringify({
  status: "passed",
  sourceCommit: sourceLock.sourceCommit,
  soakReceiptDigest: soakReceipt.receiptDigest,
  analysisDigest: analysis.analysisDigest,
  bundleDigest: bundle.bundleDigest,
  attestationDigest: attestation.attestationDigest,
  completedIterations: soakReceipt.completedIterations,
  resourceSamples: soakReceipt.resourceSamples,
  operationalReadiness: analysis.operationalReadiness,
  experimentalEvidence: analysis.experimentalEvidence,
  productionReadiness: analysis.productionReadiness,
  productionClaimPermitted: false,
  privateKeyPublished: false,
}, null, 2));

async function json(name) {
  return JSON.parse(await readFile(path.join(directory, name), "utf8"));
}
