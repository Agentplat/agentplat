#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));

if (options.mode === "contract-smoke") {
  exact(options, ["mode"]);
  console.log(JSON.stringify({ status: "passed", productionClaimPermitted: false }));
} else if (options.mode === "assemble-diagnostic") {
  exact(options, [
    "adversarial-directory",
    "early-crash-directory",
    "mesh-directory",
    "mode",
    "nominal-directory",
    "output-directory",
    "source-sha",
  ]);
  const sourceSha = required(options, "source-sha");
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) fail("morphogenesis_beta1_bundle_source_invalid");
  const outputDirectory = external(required(options, "output-directory"));
  const manifest = await json(path.join(root, "config/agent-morphogenesis-beta1-scenarios-v1.json"));
  const [nominal, early, adversarial, mesh] = await Promise.all([
    jsonl(path.join(required(options, "nominal-directory"), "nominal-receipts.jsonl")),
    jsonl(path.join(required(options, "early-crash-directory"), "early-crash-receipts.jsonl")),
    jsonl(path.join(required(options, "adversarial-directory"), "scenario-receipts.jsonl")),
    json(path.join(required(options, "mesh-directory"), "mesh-quorum-receipt.json")),
  ]);
  const replacements = new Set([
    "crash-after-proposal-before-decision",
    "crash-after-decision-before-prepare",
    "mesh-minority-partition",
  ]);
  const meshReceipt = scenarioReceiptFromMesh(mesh, sourceSha);
  const candidates = [
    ...nominal,
    ...early,
    ...adversarial.filter(({ scenarioId }) => !replacements.has(scenarioId)),
    meshReceipt,
  ];
  const expectedIds = manifest.scenarios.map(({ id }) => id);
  const byId = new Map();
  for (const receipt of candidates) {
    if (byId.has(receipt.scenarioId)) fail(`morphogenesis_beta1_bundle_duplicate:${receipt.scenarioId}`);
    byId.set(receipt.scenarioId, receipt);
  }
  if (byId.size !== expectedIds.length) fail("morphogenesis_beta1_bundle_count_invalid");
  if (expectedIds.some((id) => !byId.has(id)) || [...byId.keys()].some((id) => !expectedIds.includes(id)))
    fail("morphogenesis_beta1_bundle_scenario_set_invalid");
  const receipts = expectedIds.map((id) => byId.get(id));
  for (const receipt of receipts) validateReceipt(receipt, sourceSha);
  const metrics = receipts.map(({ metrics }) => metrics);
  const receiptRoot = digest(
    "agentplat-agent-morphogenesis-beta1-receipt-root-v1",
    receipts.map(({ receiptDigest }) => receiptDigest),
  );
  const metricsRoot = digest("agentplat-agent-morphogenesis-beta1-metrics-root-v1", metrics);
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-evidence-bundle-v1",
    campaignId: manifest.campaignId,
    sourceCommit: sourceSha,
    sourceBindingStatus: "diagnostic-uncommitted",
    scenarioManifestDigest: digest(
      "agentplat-agent-morphogenesis-beta1-scenarios-v1",
      manifest,
    ),
    scenarioCount: receipts.length,
    receiptRoot,
    metricsRoot,
    evidenceState: {
      sourceCapability: "implemented",
      conformance: "diagnostic-passed",
      operationalDiagnosticEvidence: "collected",
      experimentalEvidence: "not-collected",
      operationalReadiness: "not-established",
      productionClaimPermitted: false,
      securityCertificationClaimPermitted: false,
    },
    externalSpendUsd: 0,
    excludedCapabilities: [
      "profile-synthesis",
      "recursive-agent-creation",
      "team-split-merge-federation",
    ],
    signing: {
      algorithm: "Ed25519",
      status: "unsigned",
      domain: "agentplat-agent-morphogenesis-beta1-evidence-bundle-v1",
    },
  };
  const bundle = {
    ...body,
    bundleDigest: digest("agentplat-agent-morphogenesis-beta1-evidence-bundle-v1", body),
  };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeExclusive(path.join(outputDirectory, "scenario-receipts.jsonl"), lines(receipts)),
    writeExclusive(path.join(outputDirectory, "metrics.jsonl"), lines(metrics)),
    writeExclusive(path.join(outputDirectory, "evidence-bundle.json"), pretty(bundle)),
    writeExclusive(path.join(outputDirectory, "operational-validation-report.md"), report(bundle, receipts)),
  ]);
  console.log(JSON.stringify({
    status: "assembled-diagnostic",
    scenarioCount: bundle.scenarioCount,
    receiptRoot,
    metricsRoot,
    bundleDigest: bundle.bundleDigest,
    signingStatus: "unsigned",
    operationalReadiness: "not-established",
    productionClaimPermitted: false,
    outputDirectory,
  }, null, 2));
} else if (options.mode === "verify") {
  exact(options, ["bundle-directory", "mode"]);
  const directory = path.resolve(required(options, "bundle-directory"));
  const [bundle, receipts, metrics] = await Promise.all([
    json(path.join(directory, "evidence-bundle.json")),
    jsonl(path.join(directory, "scenario-receipts.jsonl")),
    jsonl(path.join(directory, "metrics.jsonl")),
  ]);
  const { bundleDigest: retained, ...body } = bundle;
  if (retained !== digest("agentplat-agent-morphogenesis-beta1-evidence-bundle-v1", body))
    fail("morphogenesis_beta1_bundle_digest_invalid");
  const manifest = await json(
    path.join(root, "config/agent-morphogenesis-beta1-scenarios-v1.json"),
  );
  if (
    bundle.receiptRoot !== digest("agentplat-agent-morphogenesis-beta1-receipt-root-v1", receipts.map(({ receiptDigest }) => receiptDigest)) ||
    bundle.metricsRoot !== digest("agentplat-agent-morphogenesis-beta1-metrics-root-v1", metrics) ||
    receipts.length !== bundle.scenarioCount ||
    metrics.length !== bundle.scenarioCount
  ) fail("morphogenesis_beta1_bundle_roots_invalid");
  if (
    receipts.map(({ scenarioId }) => scenarioId).join(",") !==
      manifest.scenarios.map(({ id }) => id).join(",")
  ) fail("morphogenesis_beta1_bundle_scenario_order_invalid");
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    const { receiptDigest, ...receiptBody } = receipt;
    const domain =
      receipt.kind === "agentplat-agent-morphogenesis-beta1-scenario-receipt-v1"
        ? "morphogenesis-beta1-scenario-receipt-v1"
        : receipt.kind === "agentplat-agent-morphogenesis-beta1-diagnostic-receipt-v1"
          ? "morphogenesis-beta1-diagnostic-receipt-v1"
          : fail("morphogenesis_beta1_bundle_receipt_kind_invalid");
    if (receiptDigest !== digest(domain, receiptBody))
      fail(`morphogenesis_beta1_bundle_receipt_digest_invalid:${receipt.scenarioId}`);
    if (JSON.stringify(receipt.metrics) !== JSON.stringify(metrics[index]))
      fail(`morphogenesis_beta1_bundle_metric_binding_invalid:${receipt.scenarioId}`);
  }
  console.log(JSON.stringify({ status: "verified", bundleDigest: retained, scenarioCount: receipts.length }));
} else {
  fail("morphogenesis_beta1_bundle_mode_invalid");
}

function scenarioReceiptFromMesh(mesh, sourceSha) {
  if (
    mesh.status !== "passed" ||
    mesh.morphogenesisQuorumThreshold !== 3 ||
    mesh.morphogenesisIndependentSupportCount !== 3 ||
    mesh.morphogenesisMinorityPartitionFailedClosed !== true ||
    mesh.morphogenesisAuthorityGrantedByTransport !== false
  ) fail("morphogenesis_beta1_mesh_receipt_invalid");
  const metrics = {
    schemaVersion: 1,
    scenarioId: "mesh-minority-partition",
    wall_time_ms: mesh.wallTimeMs,
    input_tokens: mesh.inputTokens,
    output_tokens: mesh.outputTokens,
    estimated_cost_usd: mesh.estimatedCostUsd,
    morphology_churn_count: mesh.morphologyChurnCount,
    mission_continuity_ratio: mesh.missionContinuityRatio,
    duplicate_material_effect_count: mesh.duplicateMaterialEffectCount,
  };
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-scenario-receipt-v1",
    scenarioId: "mesh-minority-partition",
    evidenceClass: "diagnostic-operational-conformance",
    status: "passed",
    sourceCommit: sourceSha,
    postgres: "real",
    temporal: "not-applicable",
    agentMesh: "multiprocess-real",
    peerIdentities: mesh.peerIdentities,
    processCount: mesh.processesStarted,
    quorumThreshold: mesh.morphogenesisQuorumThreshold,
    minorityPartitionFailedClosed: true,
    metrics,
    readinessEstablished: false,
    productionClaimPermitted: false,
  };
  return { ...body, receiptDigest: digest("morphogenesis-beta1-scenario-receipt-v1", body) };
}

function validateReceipt(receipt, sourceSha) {
  if (
    !receipt ||
    !["passed", "conformant"].includes(receipt.status) ||
    receipt.sourceCommit !== sourceSha ||
    receipt.readinessEstablished !== false ||
    receipt.productionClaimPermitted !== false ||
    !receipt.metrics
  ) fail(`morphogenesis_beta1_receipt_invalid:${receipt?.scenarioId ?? "unknown"}`);
  for (const key of [
    "wall_time_ms",
    "input_tokens",
    "output_tokens",
    "estimated_cost_usd",
    "morphology_churn_count",
    "mission_continuity_ratio",
    "duplicate_material_effect_count",
  ]) if (typeof receipt.metrics[key] !== "number" || !Number.isFinite(receipt.metrics[key]))
    fail(`morphogenesis_beta1_metric_invalid:${receipt.scenarioId}:${key}`);
  if (receipt.metrics.duplicate_material_effect_count !== 0)
    fail(`morphogenesis_beta1_duplicate_effect:${receipt.scenarioId}`);
}

function report(bundle, receipts) {
  const rows = receipts.map((receipt) =>
    `| ${receipt.scenarioId} | ${receipt.status} | ${receipt.evidenceClass} | ${receipt.metrics.wall_time_ms} | ${receipt.metrics.morphology_churn_count} | ${receipt.metrics.mission_continuity_ratio} |`,
  );
  return `# Agent Morphogenesis Beta 1 diagnostic validation report\n\n` +
    `Source commit: \`${bundle.sourceCommit}\`  \nBundle digest: \`${bundle.bundleDigest}\`  \nScenarios: ${bundle.scenarioCount}\n\n` +
    `This is diagnostic operational conformance. Experimental evidence is not collected, operational readiness is not established, and no production or security-certification claim is permitted.\n\n` +
    `| Scenario | Status | Evidence class | Wall ms | Churn | Continuity |\n|---|---|---|---:|---:|---:|\n${rows.join("\n")}\n\n` +
    `External spend: USD 0. Profile synthesis, recursive creation and Team split/merge/federation were excluded.\n`;
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (!value.startsWith("--") || index + 1 >= args.length) fail("morphogenesis_beta1_bundle_option_invalid");
    result[value.slice(2)] = args[++index];
  }
  return result;
}

function exact(value, keys) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(","))
    fail("morphogenesis_beta1_bundle_options_invalid");
}

function required(value, key) {
  if (!value[key]) fail(`morphogenesis_beta1_bundle_${key}_required`);
  return value[key];
}

function external(value) {
  const result = path.resolve(value);
  const relative = path.relative(root, result);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
    fail("morphogenesis_beta1_bundle_output_must_be_external");
  return result;
}

async function json(file) {
  return JSON.parse(await readFile(path.resolve(file), "utf8"));
}

async function jsonl(file) {
  return (await readFile(path.resolve(file), "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\0${JSON.stringify(canonical(value))}`).digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function lines(values) {
  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeExclusive(file, value) {
  await writeFile(file, value, { encoding: "utf8", flag: "wx" });
}

function fail(code) {
  throw new TypeError(code);
}
