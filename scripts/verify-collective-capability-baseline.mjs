import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DOMAIN = "agentplat-collective-capability-baseline-v1\u0000";

export const FROZEN_COLLECTIVE_CAPABILITY_BASELINE_DIGEST_V1 =
  "sha256:3767fd5b660f6ecc82dee249dbf67bcbd79ebc63160f7795f0f43519389b746e";

const EXPECTED_OBJECTIVE_IDS = Object.freeze([
  "OBJ-01",
  "OBJ-02",
  "OBJ-03",
  "OBJ-04",
  "OBJ-05",
  "OBJ-06",
  "OBJ-07",
  "OBJ-08",
  "OBJ-09",
  "OBJ-10",
  "OBJ-11",
]);

const EXPECTED_CAPABILITY_IDS = Object.freeze([
  "autonomous-local-peer-host",
  "sparse-peer-discovery-routing",
  "durable-causal-delivery-catch-up",
  "membership-epochs-attenuated-lineage",
  "authenticated-rotation-aware-overlay-transport",
  "distributed-mission-decomposition",
  "decentralized-allocation-team-formation",
  "sparse-adversarial-agreement",
  "adversarial-context-fusion-local-credibility",
  "mission-execution-continuity-compromise-recovery",
  "autonomous-adaptation-local-replanning",
  "role-objective-context-drift-detection",
  "inference-time-intervention",
  "heterogeneous-open-black-box-adapters",
  "semantic-agility-governed-role-evolution",
  "anytime-statistical-guarantees-coupled-planning",
  "governed-agent-creation-termination",
  "versioned-agent-simulation-interoperability",
  "scale-safe-telemetry-executable-invariants",
]);

const EXPECTED_FINDING_CLASSIFICATIONS = Object.freeze([
  "existing-capability-defect",
  "validation-evidence",
  "deployment-operationalization",
  "future-baseline-proposal",
]);

const EXPECTED_EXTERNAL_OBLIGATIONS = Object.freeze([
  "production-deployment",
  "empirical-performance",
  "operational-security-certification",
  "provider-selection",
  "cost-validation",
  "data-ip-rights",
]);

const EXPECTED_DOCUMENTS = Object.freeze([
  "docs/collective-runtime/development-capability-matrix-v1.md",
  "docs/collective-runtime/capability-baseline-governance-v1.md",
  "docs/collective-runtime/program-readiness-checklist-v1.md",
]);

export function computeCollectiveCapabilityBaselineDigestV1(manifest) {
  const { baselineDigest: _baselineDigest, ...body } = manifest;
  return `sha256:${createHash("sha256")
    .update(DOMAIN)
    .update(canonicalJson(body))
    .digest("hex")}`;
}

export function verifyCollectiveCapabilityBaselineV1(input) {
  const rootDirectory = input.rootDirectory;
  const manifest = input.manifest;
  const pointer = input.pointer;
  requireObject(manifest, "baseline manifest");
  requireObject(pointer, "current baseline pointer");

  if (
    manifest.schemaVersion !== 1 ||
    manifest.baselineId !== "agentplat-collective-capabilities-v1" ||
    manifest.baselineVersion !== 1 ||
    manifest.status !== "frozen" ||
    manifest.scope !== "source-and-publication"
  )
    fail("baseline identity or frozen scope changed; create a new version");

  const computedDigest = computeCollectiveCapabilityBaselineDigestV1(manifest);
  if (manifest.baselineDigest !== computedDigest)
    fail("baseline manifest digest does not match its canonical content");
  if (
    manifest.baselineDigest !== FROZEN_COLLECTIVE_CAPABILITY_BASELINE_DIGEST_V1
  )
    fail("V1 baseline content changed; create a new approved baseline");

  if (
    pointer.schemaVersion !== 1 ||
    pointer.currentBaselineId !== manifest.baselineId ||
    pointer.currentBaselineVersion !== manifest.baselineVersion ||
    pointer.manifestPath !== "config/collective-capability-baseline-v1.json" ||
    pointer.manifestDigest !== manifest.baselineDigest
  )
    fail("current baseline pointer is not exactly bound to frozen V1");

  requireObject(manifest.sourceCompletion, "source completion");
  if (
    manifest.sourceCompletion.status !== "complete" ||
    manifest.sourceCompletion.objectiveCount !== 11 ||
    manifest.sourceCompletion.capabilityCount !== 19 ||
    manifest.sourceCompletion.attestationStatus !== "pending-frozen-tree" ||
    manifest.sourceCompletion.empiricalValidationStatus !==
      "separate-pending" ||
    manifest.sourceCompletion.operationalReadinessStatus !== "separate-pending"
  )
    fail("source completion or external evidence boundary changed");

  requireObject(manifest.completionRule, "completion rule");
  requireObject(
    manifest.completionRule.requiredOpenSourceFindings,
    "open source finding rule",
  );
  if (
    manifest.completionRule.requiredObjectiveStatus !== "closed" ||
    manifest.completionRule.requiredCapabilityStatus !==
      "implemented-and-integrated" ||
    manifest.completionRule.requiredOpenSourceFindings.p0 !== 0 ||
    manifest.completionRule.requiredOpenSourceFindings.p1 !== 0 ||
    manifest.completionRule.requiredOpenSourceFindings.p2 !== 0 ||
    manifest.completionRule.requiresPublicReleaseGate !== true ||
    manifest.completionRule.externalObligationsAffectSourceCompletion !== false
  )
    fail("terminal source-completion rule changed");

  requireObject(manifest.changeControl, "change control");
  for (const [key, value] of Object.entries(manifest.changeControl))
    if (value !== true) fail(`change-control rule ${key} is not enforced`);

  exactArray(
    manifest.findingClassifications,
    EXPECTED_FINDING_CLASSIFICATIONS,
    "finding classifications",
  );
  exactArray(
    manifest.authoritativeDocuments,
    EXPECTED_DOCUMENTS,
    "authoritative documents",
  );

  if (!Array.isArray(manifest.objectives)) fail("objectives are not an array");
  exactArray(
    manifest.objectives.map((objective) => objective.id),
    EXPECTED_OBJECTIVE_IDS,
    "objective IDs",
  );
  const coveredCapabilities = new Set();
  for (const objective of manifest.objectives) {
    requireObject(objective, `objective ${objective?.id ?? "unknown"}`);
    if (
      typeof objective.title !== "string" ||
      !objective.title.trim() ||
      objective.status !== "closed" ||
      !Array.isArray(objective.capabilityIds) ||
      objective.capabilityIds.length === 0 ||
      new Set(objective.capabilityIds).size !== objective.capabilityIds.length
    )
      fail(`objective ${objective.id} is not closed or exactly mapped`);
    for (const capabilityId of objective.capabilityIds) {
      if (!EXPECTED_CAPABILITY_IDS.includes(capabilityId))
        fail(`objective ${objective.id} references an unknown capability`);
      coveredCapabilities.add(capabilityId);
    }
  }

  if (!Array.isArray(manifest.capabilities))
    fail("capabilities are not an array");
  exactArray(
    manifest.capabilities.map((capability) => capability.id),
    EXPECTED_CAPABILITY_IDS,
    "capability IDs",
  );
  for (const capability of manifest.capabilities) {
    requireObject(capability, `capability ${capability?.id ?? "unknown"}`);
    if (
      typeof capability.title !== "string" ||
      !capability.title.trim() ||
      capability.status !== "implemented-and-integrated" ||
      !coveredCapabilities.has(capability.id)
    )
      fail(
        `capability ${capability.id} is not implemented, integrated and traced`,
      );
  }

  if (!Array.isArray(manifest.externalObligations))
    fail("external obligations are not an array");
  exactArray(
    manifest.externalObligations.map((obligation) => obligation.id),
    EXPECTED_EXTERNAL_OBLIGATIONS,
    "external obligation IDs",
  );
  if (
    manifest.externalObligations.some(
      (obligation) => obligation.status !== "external-pending",
    )
  )
    fail("an external obligation was moved into source completion");

  const evidenceSource = readFileSync(
    resolve(
      rootDirectory,
      "packages/collective-planning/src/development-evidence.ts",
    ),
    "utf8",
  );
  const evidenceCapabilityIds = extractDevelopmentCapabilityIds(evidenceSource);
  exactArray(
    evidenceCapabilityIds,
    EXPECTED_CAPABILITY_IDS,
    "executable development capability IDs",
  );

  const authoritativeDocuments = new Map();
  for (const documentPath of EXPECTED_DOCUMENTS) {
    const absolutePath = resolve(rootDirectory, documentPath);
    if (!statSync(absolutePath).isFile())
      fail(`authoritative document is not a file: ${documentPath}`);
    const document = readFileSync(absolutePath, "utf8");
    if (!document.includes("agentplat-collective-capabilities-v1"))
      fail(`authoritative document does not cite frozen V1: ${documentPath}`);
    authoritativeDocuments.set(documentPath, document);
  }

  const matrix = authoritativeDocuments.get(EXPECTED_DOCUMENTS[0]);
  for (const entry of [...manifest.objectives, ...manifest.capabilities])
    if (!matrix.includes(entry.title))
      fail(`development matrix does not trace ${entry.id}: ${entry.title}`);

  const governance = authoritativeDocuments.get(EXPECTED_DOCUMENTS[1]);
  for (const classification of EXPECTED_FINDING_CLASSIFICATIONS)
    if (!governance.includes(`\`${classification}\``))
      fail(`governance omits finding classification: ${classification}`);

  return Object.freeze({
    baselineId: manifest.baselineId,
    baselineDigest: manifest.baselineDigest,
    closedObjectives: manifest.objectives.length,
    implementedCapabilities: manifest.capabilities.length,
    externalObligations: manifest.externalObligations.length,
    sourceCompletionStatus: manifest.sourceCompletion.status,
    attestationStatus: manifest.sourceCompletion.attestationStatus,
  });
}

function extractDevelopmentCapabilityIds(source) {
  const match = source.match(
    /export const DEVELOPMENT_CAPABILITY_IDS_V1 = \[([\s\S]*?)\] as const;/u,
  );
  if (!match) fail("executable capability ID set is unavailable");
  return [...match[1].matchAll(/"([a-z0-9-]+)"/gu)].map((entry) => entry[1]);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function exactArray(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  )
    fail(`${label} changed; create a new approved baseline`);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is not an object`);
}

function fail(message) {
  throw new TypeError(`collective capability baseline invalid: ${message}`);
}

function loadJson(rootDirectory, relativePath) {
  return JSON.parse(readFileSync(resolve(rootDirectory, relativePath), "utf8"));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const rootDirectory = process.cwd();
  const manifest = loadJson(
    rootDirectory,
    "config/collective-capability-baseline-v1.json",
  );
  if (process.argv.includes("--print-digest")) {
    process.stdout.write(
      `${computeCollectiveCapabilityBaselineDigestV1(manifest)}\n`,
    );
  } else {
    const pointer = loadJson(
      rootDirectory,
      "config/collective-capability-baseline-current.json",
    );
    const result = verifyCollectiveCapabilityBaselineV1({
      rootDirectory,
      manifest,
      pointer,
    });
    process.stdout.write(
      `Verified frozen capability baseline ${result.baselineId}: ${result.closedObjectives}/${result.closedObjectives} objectives and ${result.implementedCapabilities}/${result.implementedCapabilities} capabilities source-complete; attestation ${result.attestationStatus}; ${result.externalObligations} external obligations remain separate.\n`,
    );
  }
}
