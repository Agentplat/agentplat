#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [profile, readinessProfile, readinessBundle, document] = await Promise.all([
  json("config/agent-morphogenesis-beta1-staging-qualification-v1.json"),
  json("config/agent-morphogenesis-beta1-operational-readiness-v1.json"),
  json("docs/research/agent-morphogenesis-beta1-readiness-v2/readiness-bundle.json"),
  readFile(path.join(root, "docs/research/agent-morphogenesis-beta1-staging-qualification-v1.md"), "utf8"),
]);

assert.equal(profile.schemaVersion, 1);
assert.equal(profile.kind, "agentplat-agent-morphogenesis-beta1-staging-qualification-v1");
assert.equal(profile.status, "frozen-before-staging-execution");
assert.equal(profile.qualificationStages.singleHostContainerPreflight.mayEstablishStagingQualification, false);
assert.equal(profile.qualificationStages.distributedStaging.mayEstablishStagingQualification, true);
assert.ok(profile.requiredInfrastructure.minimumFailureDomains >= 3);
assert.ok(profile.requiredInfrastructure.minimumAgentMeshPeerIdentities >= 4);
assert.match(profile.requiredInfrastructure.keyCustody, /kms|hsm/iu);
assert.equal(profile.executionGeometry.minimumSoakDurationMs, 24 * 60 * 60 * 1000);
assert.equal(profile.executionGeometry.targetSoakDurationMs, 72 * 60 * 60 * 1000);
assert.ok(profile.executionGeometry.minimumCompletedMorphogenesisRuns >= 1000);
assert.ok(profile.executionGeometry.minimumTenants >= 3);
assert.ok(profile.executionGeometry.minimumConcurrentMissions >= 8);
assert.equal(profile.requiredScenarioCoverage.exactCanonicalScenarioCount, 22);
assert.equal(readinessProfile.operationalScenarioIds.length, 22);
assert.equal(new Set(readinessProfile.operationalScenarioIds).size, 22);
assert.equal(profile.requiredScenarioCoverage.rejectMissingDuplicateOrUnexpectedScenarioIds, true);
assert.equal(new Set(profile.requiredFaultClasses).size, profile.requiredFaultClasses.length);
assert.ok(profile.requiredFaultClasses.length >= 10);
for (const value of Object.values(profile.isolationRequirements).slice(2)) assert.equal(value, 0);
for (const key of [
  "maximumUnauthorizedActivations",
  "maximumDuplicateMaterialEffects",
  "maximumLostCommittedReceipts",
  "maximumMorphologyHeadForks",
  "maximumCrossTenantEffects",
  "maximumCrossMissionEffects",
]) assert.equal(profile.serviceLevelObjectives[key], 0);
assert.equal(new Set(profile.requiredEvidence).size, profile.requiredEvidence.length);
assert.ok(profile.requiredEvidence.length >= 14);
assert.equal(new Set(profile.requiredRunbooks).size, profile.requiredRunbooks.length);
assert.equal(profile.requiredRunbooks.length, 10);
assert.equal(profile.claimBoundary.productionReadiness, "not-established");
assert.equal(profile.claimBoundary.productionClaimPermitted, false);
assert.equal(profile.claimBoundary.securityCertificationClaimPermitted, false);
assert.deepEqual(profile.excludedCapabilities, readinessProfile.excludedCapabilities);
assert.equal(readinessBundle.evidenceState.operationalReadiness, "beta1-local-profile-established");
assert.equal(readinessBundle.evidenceState.productionReadiness, "not-established");
const normalizedDocument = document.replace(/\s+/gu, " ");
for (const phrase of [
  "execution pending",
  "single-host container preflight",
  "independent failure domains",
  "exact 22 canonical scenarios",
  "policy-eligible agent, a person, or a qualified quorum",
  "productionClaimPermitted: false",
  "separate, explicitly authorized objective",
]) assert.ok(normalizedDocument.includes(phrase), `qualification document missing: ${phrase}`);

console.log(JSON.stringify({
  status: "passed",
  profileId: profile.profileId,
  qualificationStatus: "not-established",
  minimumFailureDomains: profile.requiredInfrastructure.minimumFailureDomains,
  canonicalScenarios: profile.requiredScenarioCoverage.exactCanonicalScenarioCount,
  minimumSoakDurationMs: profile.executionGeometry.minimumSoakDurationMs,
  targetSoakDurationMs: profile.executionGeometry.targetSoakDurationMs,
  productionClaimPermitted: false,
}, null, 2));

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}
