#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  root,
  "config/agent-morphogenesis-beta1-campaign-v1.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const scenarios = JSON.parse(
  await readFile(
    path.join(root, "config/agent-morphogenesis-beta1-scenarios-v1.json"),
    "utf8",
  ),
);

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.kind, "agentplat-agent-morphogenesis-beta1-campaign-v1");
assert.equal(manifest.status, "planned-not-executed");
assert.equal(manifest.baselineRelationship, "future-baseline-proposal");
assert.deepEqual(manifest.verticalSlices, ["recruit_existing", "catalog_created"]);
assert.deepEqual(manifest.decisionRoutes, [
  "authorized_agent",
  "authorized_person",
  "collective",
]);
assert.deepEqual(manifest.deploymentSurfaces, [
  "postgresql-real",
  "temporal-real",
  "agent-mesh-multiprocess",
]);

for (const key of [
  "scenarioClasses",
  "requiredCrashBoundaries",
  "primaryMetrics",
  "requiredArtifacts",
  "excludedCapabilities",
]) {
  assert.ok(Array.isArray(manifest[key]) && manifest[key].length > 0, `${key} missing`);
  assert.equal(new Set(manifest[key]).size, manifest[key].length, `${key} duplicated`);
}

assert.equal(manifest.acceptanceRules.maximumExternalSpendUsd, 0);
assert.equal(manifest.acceptanceRules.maximumDuplicateMaterialEffects, 0);
assert.equal(manifest.acceptanceRules.maximumUnauthorizedActivations, 0);
assert.equal(manifest.authorityPolicy.personApprovalRequired, false);
assert.equal(manifest.authorityPolicy.authorizedAgentMayDecide, true);
assert.equal(manifest.authorityPolicy.authorizedPersonMayDecide, true);
assert.equal(manifest.authorityPolicy.collectiveCertificateMayDecide, true);
assert.equal(manifest.authorityPolicy.selfApprovalPermitted, false);
assert.equal(manifest.authorityPolicy.decisionMandateRequired, true);
assert.equal(manifest.evidenceBoundary.sourceCapability, "implemented");
assert.equal(manifest.evidenceBoundary.experimentalEvidence, "not-collected");
assert.equal(manifest.evidenceBoundary.operationalReadiness, "not-established");
assert.equal(manifest.evidenceBoundary.productionClaimPermitted, false);
assert.equal(manifest.requiredSourceBinding, "exact-clean-commit");
assert.equal(
  manifest.scenarioManifest,
  "config/agent-morphogenesis-beta1-scenarios-v1.json",
);

assert.equal(scenarios.schemaVersion, 1);
assert.equal(scenarios.campaignId, manifest.campaignId);
assert.equal(scenarios.status, "frozen-before-registered-execution");
assert.equal(scenarios.scenarios.length, scenarios.closure.requiredScenarioCount);
assert.equal(new Set(scenarios.scenarios.map(({ id }) => id)).size, scenarios.scenarios.length);
assert.deepEqual(
  [...new Set(scenarios.scenarios.map(({ class: scenarioClass }) => scenarioClass))],
  manifest.scenarioClasses,
);
assert.deepEqual(
  scenarios.scenarios
    .filter(({ class: scenarioClass }) => scenarioClass === "boundary-crash")
    .map(({ crashBoundary }) => crashBoundary),
  manifest.requiredCrashBoundaries,
);
assert.deepEqual(scenarios.requiredMetricsPerScenario, manifest.primaryMetrics);
for (const scenario of scenarios.scenarios) {
  assert.ok(typeof scenario.id === "string" && scenario.id.length > 0);
  assert.ok(manifest.scenarioClasses.includes(scenario.class));
  assert.ok(Array.isArray(scenario.surfaces) && scenario.surfaces.length > 0);
  assert.ok(scenario.surfaces.every((surface) => manifest.deploymentSurfaces.includes(surface)));
  assert.ok(typeof scenario.expectedDisposition === "string");
}

const protocolPath = path.join(root, manifest.protocolDocument);
const protocol = await readFile(protocolPath, "utf8");
for (const requiredText of [
  "Status: planned, not executed",
  "authorized agent",
  "authorized person",
  "certified collective",
  "zero duplicate material effects",
  "frozen collective capability V1 baseline remains unchanged",
]) assert.ok(protocol.includes(requiredText), `protocol missing: ${requiredText}`);

const digest = `sha256:${createHash("sha256")
  .update("agentplat-agent-morphogenesis-beta1-campaign-v1\0")
  .update(JSON.stringify(canonicalize(manifest)))
  .digest("hex")}`;

console.log(JSON.stringify({
  status: "passed",
  campaignId: manifest.campaignId,
  campaignContractDigest: digest,
  verticalSlices: manifest.verticalSlices.length,
  decisionRoutes: manifest.decisionRoutes.length,
  scenarioClasses: manifest.scenarioClasses.length,
  scenarios: scenarios.scenarios.length,
  executionPermitted: false,
}, null, 2));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  return value;
}
