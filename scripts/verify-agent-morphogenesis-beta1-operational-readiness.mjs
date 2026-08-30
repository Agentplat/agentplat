#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [profile, scenarios, release, auditLedger, document] = await Promise.all([
  json("config/agent-morphogenesis-beta1-operational-readiness-v1.json"),
  json("config/agent-morphogenesis-beta1-scenarios-v1.json"),
  json("docs/research/agent-morphogenesis-beta1-release-v1/evidence-bundle.json"),
  json("config/public-audit-evidence-exceptions-v1.json"),
  readFile(
    path.join(
      root,
      "docs/research/agent-morphogenesis-beta1-operational-readiness-v1.md",
    ),
    "utf8",
  ),
]);

assert.equal(profile.schemaVersion, 1);
assert.equal(
  profile.kind,
  "agentplat-agent-morphogenesis-beta1-operational-readiness-v1",
);
assert.equal(profile.status, "frozen-before-readiness-execution");
assert.equal(release.evidenceState.releaseEvidence, "beta1-local-profile-passed");
assert.equal(release.evidenceState.operationalReadiness, "not-established");
assert.deepEqual(
  profile.operationalScenarioIds.slice(0, scenarios.scenarios.length),
  scenarios.scenarios.map(({ id }) => id),
);
assert.equal(new Set(profile.operationalScenarioIds).size, profile.operationalScenarioIds.length);
assert.equal(profile.executionGeometry.soakDurationMs, 30 * 60 * 1000);
assert.equal(profile.executionGeometry.minimumCompletedIterations, 120);
assert.equal(profile.executionGeometry.minimumIterationsPerVerticalSlice, 60);
assert.equal(profile.requiredInfrastructure.maximumExternalSpendUsd, 0);
assert.equal(profile.serviceLevelObjectives.minimumScenarioPassRatio, 1);
assert.equal(profile.serviceLevelObjectives.minimumMissionContinuityRatio, 1);
for (const key of [
  "maximumUnauthorizedActivations",
  "maximumDuplicateMaterialEffects",
  "maximumLostCommittedReceipts",
  "maximumMorphologyHeadForks",
]) assert.equal(profile.serviceLevelObjectives[key], 0);
assert.equal(profile.requiredMeasurements.length, 14);
assert.equal(new Set(profile.requiredMeasurements).size, 14);
assert.equal(profile.requiredRunbooks.length, 8);
assert.equal(new Set(profile.requiredRunbooks).size, 8);
for (const runbook of profile.requiredRunbooks) {
  const contents = await readFile(
    path.join(
      root,
      "docs/runbooks/agent-morphogenesis-beta1",
      `${runbook}.md`,
    ),
    "utf8",
  );
  assert.ok(contents.length > 400, `runbook is incomplete: ${runbook}`);
  assert.match(contents, /authority|authorization|receipt|rollback|recovery/iu);
}
assert.deepEqual(profile.publicAuditPolicy, {
  resolution: "exact-digest-exception-ledger",
  allowPathGlobExceptions: false,
  allowDirectoryExceptions: false,
  requireReasonPerFile: true,
  requireSha256PerFile: true,
  maximumExceptionBytesPerFile: 20_000_000,
});
assert.equal(auditLedger.kind, "agentplat-public-audit-evidence-exceptions-v1");
assert.equal(auditLedger.status, "frozen-exact-files");
assert.equal(auditLedger.entries.length, 22);
assert.equal(new Set(auditLedger.entries.map(({ path: file }) => file)).size, 22);
for (const entry of auditLedger.entries) {
  assert.doesNotMatch(entry.path, /[*?{}[\]]/u);
  assert.ok(entry.reason.length > 20);
  assert.ok(entry.bytes <= profile.publicAuditPolicy.maximumExceptionBytesPerFile);
  const bytes = await readFile(path.join(root, entry.path));
  assert.equal(bytes.byteLength, entry.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
}
assert.equal(
  profile.claimBoundary.operationalReadinessTarget,
  "beta1-local-profile-established",
);
assert.equal(profile.claimBoundary.productionReadiness, "not-established");
assert.equal(profile.claimBoundary.productionClaimPermitted, false);
assert.deepEqual(profile.excludedCapabilities, release.excludedCapabilities);
for (const phrase of [
  "execution pending",
  "30 minutes",
  "Source-only conformance",
  "per-file SHA-256 exception ledger",
  "production readiness",
  "The frozen collective capability V1",
]) assert.ok(document.includes(phrase), `readiness document missing: ${phrase}`);

console.log(JSON.stringify({
  status: "passed",
  profileId: profile.profileId,
  operationalScenarios: profile.operationalScenarioIds.length,
  soakDurationMs: profile.executionGeometry.soakDurationMs,
  minimumIterations: profile.executionGeometry.minimumCompletedIterations,
  requiredMeasurements: profile.requiredMeasurements.length,
  requiredRunbooks: profile.requiredRunbooks.length,
  operationalReadiness: "not-established",
  productionClaimPermitted: false,
}, null, 2));

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}
