#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = await json(
  path.join(
    root,
    "config/agent-morphogenesis-beta1-operational-readiness-v1.json",
  ),
);
const options = parse(process.argv.slice(2));

if (options.mode === "contract-smoke") {
  exact(options, ["mode"]);
  console.log(JSON.stringify({ status: "passed", operationalReadiness: "not-established" }));
} else if (options.mode === "collect") {
  exact(options, ["mode", "output-directory", "supervisor-directory"]);
  const supervisorDirectory = path.resolve(required(options, "supervisor-directory"));
  const outputDirectory = external(required(options, "output-directory"));
  const [config, state, soakReceipt, events, samples] = await Promise.all([
    json(path.join(supervisorDirectory, "supervisor-config.json")),
    json(path.join(supervisorDirectory, "supervisor-state.json")),
    json(path.join(supervisorDirectory, "readiness-soak-receipt.json")),
    jsonl(path.join(supervisorDirectory, "supervisor-events.jsonl")),
    jsonl(path.join(supervisorDirectory, "resource-samples.jsonl")),
  ]);
  validateSupervisor(config, state, soakReceipt, events, samples);
  const operationFiles = await files(path.join(supervisorDirectory, "operations"));
  const artifactManifest = [];
  const receipts = [];
  const metrics = [];
  for (const file of operationFiles) {
    const bytes = await readFile(file);
    const relativePath = normalize(
      path.relative(path.join(supervisorDirectory, "operations"), file),
    );
    artifactManifest.push({
      relativePath,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (file.endsWith("receipts.jsonl"))
      receipts.push(
        ...(await jsonl(file)).map((value) => ({ source: relativePath, value })),
      );
    else if (file.endsWith("receipt.json"))
      receipts.push({ source: relativePath, value: JSON.parse(bytes.toString("utf8")) });
    if (file.endsWith("metrics.jsonl"))
      metrics.push(
        ...(await jsonl(file)).map((value) => ({ source: relativePath, value })),
      );
    else if (file.endsWith("metrics.json"))
      metrics.push({ source: relativePath, value: JSON.parse(bytes.toString("utf8")) });
  }
  assert.equal(artifactManifest.length > 0, true);
  assert.equal(new Set(artifactManifest.map(({ relativePath }) => relativePath)).size, artifactManifest.length);
  const nominalMetrics = metrics
    .filter(({ source }) => source.includes("nominal-round-"))
    .map(({ value }) => value);
  assert.equal(nominalMetrics.length, 120);
  const recruit = nominalMetrics.filter(({ scenarioId }) =>
    scenarioId.startsWith("nominal-recruit-"),
  );
  const created = nominalMetrics.filter(({ scenarioId }) =>
    scenarioId.startsWith("nominal-create-"),
  );
  assert.equal(recruit.length, 60);
  assert.equal(created.length, 60);
  const recoveryMetrics = receipts
    .filter(({ source }) =>
      source.includes("material-crashes") || source.includes("early-crashes"),
    )
    .flatMap(({ value }) =>
      value.metrics && typeof value.metrics.wall_time_ms === "number"
        ? [value.metrics]
        : [],
    );
  assert.equal(recoveryMetrics.length, 6);
  const nominalP95WallTimeMs = percentile(
    nominalMetrics.map(({ wall_time_ms }) => wall_time_ms),
    0.95,
  );
  const recoveryP95WallTimeMs = percentile(
    recoveryMetrics.map(({ wall_time_ms }) => wall_time_ms),
    0.95,
  );
  const coveredScenarioIds = new Set();
  for (const { source, value } of receipts) {
    if (typeof value.scenarioId === "string")
      coveredScenarioIds.add(value.scenarioId);
    for (const scenarioId of value.metrics?.scenarioIds ?? [])
      coveredScenarioIds.add(scenarioId);
    if (
      source.includes("mesh-cycle-") &&
      value.morphogenesisMinorityPartitionFailedClosed === true
    )
      coveredScenarioIds.add("mesh-minority-partition");
    if (
      source.includes("mesh-cycle-") &&
      value.morphogenesisDependentCollusionRejected === true
    )
      coveredScenarioIds.add("dependent-actor-collusion");
  }
  if (soakReceipt.supervisorResumeCount > 0)
    coveredScenarioIds.add("supervisor-restart-resume");
  assert.deepEqual(
    [...coveredScenarioIds].sort(),
    [...profile.operationalScenarioIds].sort(),
  );
  const analysisBody = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-readiness-analysis-v1",
    sourceCommit: config.sourceCommit,
    profileDigest: config.profileDigest,
    status: "passed",
    soakReceiptDigest: soakReceipt.receiptDigest,
    completedIterations: soakReceipt.completedIterations,
    recruitIterations: soakReceipt.recruitIterations,
    catalogCreatedIterations: soakReceipt.catalogCreatedIterations,
    meshCycles: soakReceipt.meshCycles,
    supervisorResumeCount: soakReceipt.supervisorResumeCount,
    supervisorResumeP95Ms: percentile(soakReceipt.supervisorResumeTimesMs, 0.95),
    nominalP95WallTimeMs,
    recoveryP95WallTimeMs,
    resourceSamples: samples.length,
    maximumProcessRssBytes: soakReceipt.maximumProcessRssBytes,
    maximumAggregateCpuPercent: soakReceipt.maximumAggregateCpuPercent,
    postgresStorageGrowthBytes: soakReceipt.postgresStorageGrowthBytes,
    temporalStorageGrowthBytes: soakReceipt.temporalStorageGrowthBytes,
    duplicateMaterialEffects: soakReceipt.duplicateMaterialEffects,
    unauthorizedActivations: soakReceipt.unauthorizedActivations,
    lostCommittedReceipts: soakReceipt.lostCommittedReceipts,
    morphologyHeadForks: soakReceipt.morphologyHeadForks,
    missionContinuityRatio: soakReceipt.missionContinuityRatio,
    externalSpendUsd: soakReceipt.externalSpendUsd,
    operationalScenarioCount: profile.operationalScenarioIds.length,
    coveredScenarioIds: [...coveredScenarioIds].sort(),
    operationalReadiness: "beta1-local-profile-established",
    experimentalEvidence: "not-collected",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  assertSlos(analysisBody);
  const analysis = {
    ...analysisBody,
    analysisDigest: digest(
      "agentplat-agent-morphogenesis-beta1-readiness-analysis-v1",
      analysisBody,
    ),
  };
  const manifestBody = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-readiness-artifact-manifest-v1",
    sourceCommit: config.sourceCommit,
    soakReceiptDigest: soakReceipt.receiptDigest,
    artifacts: artifactManifest,
    artifactCount: artifactManifest.length,
  };
  const manifest = {
    ...manifestBody,
    manifestDigest: digest(
      "agentplat-agent-morphogenesis-beta1-readiness-artifact-manifest-v1",
      manifestBody,
    ),
  };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    exclusive(outputDirectory, "readiness-analysis.json", analysis),
    exclusive(outputDirectory, "readiness-artifact-manifest.json", manifest),
    exclusive(outputDirectory, "readiness-soak-receipt.json", soakReceipt),
    writeExclusive(
      path.join(outputDirectory, "readiness-operation-receipts.jsonl"),
      `${receipts.map((value) => JSON.stringify(value)).join("\n")}\n`,
    ),
    writeExclusive(
      path.join(outputDirectory, "readiness-operation-metrics.jsonl"),
      `${metrics.map((value) => JSON.stringify(value)).join("\n")}\n`,
    ),
    writeExclusive(
      path.join(outputDirectory, "supervisor-events.jsonl"),
      `${events.map((value) => JSON.stringify(value)).join("\n")}\n`,
    ),
    writeExclusive(
      path.join(outputDirectory, "resource-samples.jsonl"),
      `${samples.map((value) => JSON.stringify(value)).join("\n")}\n`,
    ),
  ]);
  console.log(JSON.stringify({
    status: "collected",
    sourceCommit: config.sourceCommit,
    analysisDigest: analysis.analysisDigest,
    manifestDigest: manifest.manifestDigest,
    operationArtifacts: artifactManifest.length,
    operationReceipts: receipts.length,
    operationMetrics: metrics.length,
    resourceSamples: samples.length,
    nominalP95WallTimeMs,
    recoveryP95WallTimeMs,
    operationalReadiness: analysis.operationalReadiness,
    productionClaimPermitted: false,
    outputDirectory,
  }, null, 2));
} else if (options.mode === "verify") {
  exact(options, ["evidence-directory", "mode"]);
  const directory = path.resolve(required(options, "evidence-directory"));
  const [analysis, manifest, soakReceipt, events, samples] = await Promise.all([
    json(path.join(directory, "readiness-analysis.json")),
    json(path.join(directory, "readiness-artifact-manifest.json")),
    json(path.join(directory, "readiness-soak-receipt.json")),
    jsonl(path.join(directory, "supervisor-events.jsonl")),
    jsonl(path.join(directory, "resource-samples.jsonl")),
  ]);
  const { analysisDigest, ...analysisBody } = analysis;
  const { manifestDigest, ...manifestBody } = manifest;
  assert.equal(
    analysisDigest,
    digest("agentplat-agent-morphogenesis-beta1-readiness-analysis-v1", analysisBody),
  );
  assert.equal(
    manifestDigest,
    digest("agentplat-agent-morphogenesis-beta1-readiness-artifact-manifest-v1", manifestBody),
  );
  assert.equal(analysis.soakReceiptDigest, soakReceipt.receiptDigest);
  assert.deepEqual(
    analysis.coveredScenarioIds,
    [...profile.operationalScenarioIds].sort(),
  );
  validateEventChain(events);
  assert.equal(samples.length, analysis.resourceSamples);
  assertSlos(analysis);
  console.log(JSON.stringify({
    status: "verified",
    sourceCommit: analysis.sourceCommit,
    analysisDigest,
    manifestDigest,
    resourceSamples: samples.length,
    operationalReadiness: analysis.operationalReadiness,
    productionClaimPermitted: false,
  }));
} else {
  fail("readiness_evidence_mode_invalid");
}

function validateSupervisor(config, state, receipt, events, samples) {
  assert.equal(state.status, "completed");
  assert.equal(state.failure, null);
  assert.equal(state.receiptDigest, receipt.receiptDigest);
  assert.equal(receipt.sourceCommit, config.sourceCommit);
  assert.equal(receipt.profileDigest, config.profileDigest);
  assert.equal(receipt.durationMs >= config.soakDurationMs, true);
  assert.equal(receipt.completedIterations >= config.minimumCompletedIterations, true);
  assert.equal(receipt.meshCycles, config.meshCyclesRequired);
  assert.equal(receipt.postgresConnectionLossCycles, config.postgresLossCyclesRequired);
  const { receiptDigest, ...body } = receipt;
  assert.equal(
    receiptDigest,
    digest("agentplat-agent-morphogenesis-beta1-readiness-soak-receipt-v1", body),
  );
  validateEventChain(events);
  assert.equal(events.at(-1).type, "completed");
  assert.equal(events.at(-1).detail.receiptDigest, receipt.receiptDigest);
  assert.equal(samples.length, receipt.resourceSamples);
  assert.equal(samples.length, state.resourceSamples);
  assert.equal(
    Math.max(...samples.map(({ processRssBytes }) => processRssBytes)),
    receipt.maximumProcessRssBytes,
  );
  assert.equal(
    Math.max(...samples.map(({ aggregateCpuPercent }) => aggregateCpuPercent)),
    receipt.maximumAggregateCpuPercent,
  );
}

function validateEventChain(events) {
  let predecessor = null;
  for (const [index, event] of events.entries()) {
    assert.equal(event.sequence, index + 1);
    assert.equal(event.previousEventDigest, predecessor);
    const { eventDigest, ...body } = event;
    assert.equal(
      eventDigest,
      digest("morphogenesis-readiness-supervisor-event-v1", body),
    );
    predecessor = eventDigest;
  }
}

function assertSlos(value) {
  const slo = profile.serviceLevelObjectives;
  assert.equal(value.completedIterations >= profile.executionGeometry.minimumCompletedIterations, true);
  assert.equal(value.nominalP95WallTimeMs <= slo.maximumNominalP95WallTimeMs, true);
  assert.equal(value.recoveryP95WallTimeMs <= slo.maximumRecoveryP95WallTimeMs, true);
  assert.equal(value.supervisorResumeP95Ms <= slo.maximumSupervisorResumeTimeMs, true);
  assert.equal(value.maximumProcessRssBytes <= slo.maximumPeakProcessRssBytes, true);
  assert.equal(value.maximumAggregateCpuPercent <= slo.maximumAggregateCpuPercent, true);
  assert.equal(value.postgresStorageGrowthBytes <= slo.maximumPostgresStorageGrowthBytes, true);
  assert.equal(value.temporalStorageGrowthBytes <= slo.maximumTemporalStorageGrowthBytes, true);
  assert.equal(value.duplicateMaterialEffects, 0);
  assert.equal(value.unauthorizedActivations, 0);
  assert.equal(value.lostCommittedReceipts, 0);
  assert.equal(value.morphologyHeadForks, 0);
  assert.equal(value.missionContinuityRatio, 1);
  assert.equal(value.externalSpendUsd, 0);
}

function percentile(values, probability) {
  assert.ok(values.length > 0);
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}

async function files(directory) {
  const result = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) result.push(target);
      else fail("readiness operation artifact type invalid");
    }
  }
  return result.sort();
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function jsonl(file) {
  return (await readFile(file, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function exclusive(directory, name, value) {
  await writeExclusive(
    path.join(directory, name),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

async function writeExclusive(file, contents) {
  await writeFile(file, contents, { encoding: "utf8", flag: "wx" });
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (!value.startsWith("--") || index + 1 >= args.length)
      fail("readiness_evidence_option_invalid");
    result[value.slice(2)] = args[++index];
  }
  return result;
}

function exact(value, keys) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(","))
    fail("readiness_evidence_options_invalid");
}

function required(value, key) {
  if (!value[key]) fail(`readiness_evidence_${key}_required`);
  return value[key];
}

function external(value) {
  const result = path.resolve(value);
  const relative = path.relative(root, result);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
    fail("readiness_evidence_output_must_be_external");
  return result;
}

function normalize(value) {
  return value.split(path.sep).join("/");
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

function fail(message) {
  throw new TypeError(message);
}
