#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  canonicalizePlanningJsonV1,
  digestPlanningJsonV1,
} from "../packages/collective-planning/dist/index.js";
import {
  analyzeCollectiveStatisticalCampaignNormativeV1,
  collectiveStatisticalCampaignNormativeExecutionIdV1,
} from "../packages/mesh-sim/dist/index.js";
import {
  validateCollectiveEvaluationCampaignRegistrationV1,
  validateNormativeOperationPlanV1,
  validateNormativeRunnerDescriptorV1,
} from "../packages/collective-planning/dist/evaluation.js";

const REQUIRED_ARTIFACTS = Object.freeze([
  "source-lock.json",
  "registration.json",
  "operation-plan.json",
  "adapter-descriptor.json",
  "authorization.json",
  "collection-manifest.json",
  "normative-analysis.json",
  "raw-rows.json",
  "paper-tables.json",
  "paper-dataset.csv",
  "analysis-input-projections.json",
]);

const LIMITS = Object.freeze({
  maximumBytes: 64 * 1024 * 1024,
  maximumDepth: 64,
  maximumNodes: 2_000_000,
  maximumKeysPerObject: 4_096,
  maximumItemsPerArray: 32_768,
});

export async function buildPublicationBundleManifestV1(input) {
  const directory = path.resolve(input.directory);
  const entries = [];
  for (const name of REQUIRED_ARTIFACTS) {
    const filePath = path.join(directory, name);
    const bytes = await readFile(filePath);
    entries.push({
      name,
      byteLength: bytes.byteLength,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });
  }
  const body = {
    schemaVersion: 1,
    kind: "agentplat-empirical-publication-bundle-v1",
    bundleStatus: "complete",
    sourceCommit: input.sourceCommit,
    registrationDigest: input.registrationDigest,
    executionId: input.executionId,
    analysisDigest: input.analysisDigest,
    rawRowCount: input.rawRowCount,
    projectionCount: input.projectionCount,
    requiredArtifacts: entries,
  };
  const manifest = {
    ...body,
    bundleDigest: digest("publication-bundle", body),
  };
  await writeFile(
    path.join(directory, "publication-bundle-manifest.json"),
    `${canonical(manifest)}\n`,
    { flag: "wx" },
  );
  return manifest;
}

export async function verifyPublicationBundleV1(directoryInput) {
  const directory = path.resolve(directoryInput);
  const manifest = await readJson(path.join(directory, "publication-bundle-manifest.json"));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== "agentplat-empirical-publication-bundle-v1" ||
    manifest.bundleStatus !== "complete" ||
    !Array.isArray(manifest.requiredArtifacts)
  ) fail("publication_bundle_manifest_invalid");
  if (manifest.requiredArtifacts.length !== REQUIRED_ARTIFACTS.length)
    fail("publication_bundle_required_artifact_set_invalid");
  const expectedNames = [...REQUIRED_ARTIFACTS].sort();
  const actualNames = manifest.requiredArtifacts.map((entry) => entry.name).sort();
  if (canonical(expectedNames) !== canonical(actualNames))
    fail("publication_bundle_required_artifact_set_invalid");
  for (const entry of manifest.requiredArtifacts) {
    const bytes = await readFile(path.join(directory, entry.name));
    const digestValue = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.byteLength !== entry.byteLength || digestValue !== entry.sha256)
      fail("publication_bundle_artifact_digest_mismatch");
  }
  const body = { ...manifest };
  delete body.bundleDigest;
  if (manifest.bundleDigest !== digest("publication-bundle", body))
    fail("publication_bundle_manifest_digest_invalid");

  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    await readJson(path.join(directory, "registration.json")),
  );
  const descriptor = validateNormativeRunnerDescriptorV1(
    await readJson(path.join(directory, "adapter-descriptor.json")),
  );
  const plan = validateNormativeOperationPlanV1(
    await readJson(path.join(directory, "operation-plan.json")),
  );
  const authorization = await readJson(path.join(directory, "authorization.json"));
  const input = await readJson(path.join(directory, "analysis-input-projections.json"));
  if (
    input.schemaVersion !== 1 ||
    input.executionId !== manifest.executionId ||
    input.aggregationSeed !== 20_260_810 ||
    !Array.isArray(input.projections) ||
    input.projections.length !== manifest.projectionCount
  ) fail("publication_bundle_analysis_input_invalid");
  const executionId = collectiveStatisticalCampaignNormativeExecutionIdV1({
    schemaVersion: 1,
    registration,
    descriptor,
    plan,
    authorization,
  });
  if (executionId !== manifest.executionId)
    fail("publication_bundle_execution_binding_invalid");
  const recomputed = analyzeCollectiveStatisticalCampaignNormativeV1({
    schemaVersion: 1,
    registration,
    executionId,
    aggregationSeed: input.aggregationSeed,
    bootstrapResamples: 10_000,
    projections: input.projections,
  });
  const storedAnalysis = await readJson(path.join(directory, "normative-analysis.json"));
  const rawRows = await readJson(path.join(directory, "raw-rows.json"));
  const tables = await readJson(path.join(directory, "paper-tables.json"));
  if (canonical(recomputed) !== canonical(storedAnalysis))
    fail("publication_bundle_analysis_reconstruction_mismatch");
  if (
    rawRows.analysisDigest !== recomputed.analysisDigest ||
    rawRows.rows.length !== recomputed.rawRows.length ||
    canonical(rawRows.rows) !== canonical(recomputed.rawRows)
  ) fail("publication_bundle_raw_rows_reconstruction_mismatch");
  const expectedTables = {
    schemaVersion: 1,
    kind: "agentplat-paper-table-source-v1",
    registrationDigest: registration.registrationDigest,
    analysisDigest: recomputed.analysisDigest,
    decision: recomputed.decision,
    reasonCodes: recomputed.reasonCodes,
    endpoints: recomputed.endpoints,
    interpretationStatus: "not_authored",
    empiricalClaimPermitted: false,
  };
  if (canonical(tables) !== canonical(expectedTables))
    fail("publication_bundle_tables_reconstruction_mismatch");
  if (manifest.rawRowCount !== recomputed.rawRows.length)
    fail("publication_bundle_raw_row_count_invalid");
  return Object.freeze({
    status: "verified",
    bundleDigest: manifest.bundleDigest,
    analysisDigest: recomputed.analysisDigest,
    rawRowCount: recomputed.rawRows.length,
    projectionCount: input.projections.length,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) fail("publication_bundle_directory_required");
  verifyPublicationBundleV1(directory)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "publication_bundle_verification_failed"}\n`);
      process.exitCode = 2;
    });
}

async function readJson(filePath) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT")
      fail(`publication_bundle_artifact_missing:${path.basename(filePath)}`);
    throw error;
  }
  if (Buffer.byteLength(text, "utf8") > LIMITS.maximumBytes)
    fail("publication_bundle_json_too_large");
  try {
    return JSON.parse(text);
  } catch {
    fail("publication_bundle_json_invalid");
  }
}

function digest(kind, value) {
  return digestPlanningJsonV1(
    "evaluation-campaign-artifact-v1",
    { schemaVersion: 1, kind, value },
    LIMITS,
  );
}

function canonical(value) {
  return canonicalizePlanningJsonV1(value, LIMITS);
}

function fail(reason) {
  throw new TypeError(reason);
}
