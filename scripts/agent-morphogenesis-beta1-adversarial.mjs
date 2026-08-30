#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));
const allowed = new Set(["diagnostic-only", "output-directory"]);
if (Object.keys(options).some((key) => !allowed.has(key)) || options["diagnostic-only"] !== true)
  fail("morphogenesis_beta1_adversarial_options_invalid");

const manifest = JSON.parse(
  await readFile(
    path.join(root, "config/agent-morphogenesis-beta1-scenarios-v1.json"),
    "utf8",
  ),
);
const scenarios = manifest.scenarios.filter(({ class: scenarioClass }) => scenarioClass !== "nominal");
const bindings = new Map([
  ["crash-after-proposal-before-decision", binding(
    "authorized agent decision is exact, independent and drives the fixed Workflow DAG",
    "tests/morphogenesis.test.mjs",
    "indirect",
  )],
  ["crash-after-decision-before-prepare", binding(
    "authorized agent decision is exact, independent and drives the fixed Workflow DAG",
    "tests/morphogenesis.test.mjs",
    "indirect",
  )],
  ["crash-after-provision-before-attestation", catalogCrash()],
  ["crash-after-enrollment-before-activation", catalogCrash()],
  ["crash-after-activation-before-outcome", catalogCrash()],
  ["crash-after-fence-before-terminal-agent", catalogCrash()],
  ["mesh-minority-partition", binding(
    "a partition without a witness majority fails closed",
    "packages/collective-quorum/tests/quorum.test.mjs",
    "direct",
  )],
  ["concurrent-morphology-head", binding(
    "morphology head CAS retains one exact successor and replays it",
    "tests/morphogenesis.test.mjs",
    "direct",
  )],
  ["concurrent-budget-reservation", binding(
    "budget reservations prevent concurrent double spend and replay exactly",
    "tests/morphogenesis.test.mjs",
    "direct",
  )],
  ["stale-decision-authority", binding(
    "stale decision authority is rejected without persisting a decision",
    "tests/morphogenesis.test.mjs",
    "direct",
  )],
  ["agent-self-approval", binding(
    "authorized agent decision is exact, independent and drives the fixed Workflow DAG",
    "tests/morphogenesis.test.mjs",
    "direct",
  )],
  ["dependent-actor-collusion", binding(
    "composite review requires independent approved actors",
    "tests/morphogenesis.test.mjs",
    "direct",
  )],
]);

const sourceCommit = git("rev-parse", "HEAD");
const receipts = [];
const metrics = [];
for (const scenario of scenarios) {
  const proof = bindings.get(scenario.id);
  if (!proof) fail(`morphogenesis_beta1_binding_missing:${scenario.id}`);
  const started = performance.now();
  const execution = spawnSync(
    process.execPath,
    ["--test", `--test-name-pattern=${proof.testName}`, proof.testFile],
    { cwd: root, encoding: "utf8", timeout: 30_000 },
  );
  const wallTimeMs = Math.max(0, Math.round(performance.now() - started));
  const passed = execution.status === 0;
  const outputDigest = sha256(`${execution.stdout ?? ""}\n${execution.stderr ?? ""}`);
  const metric = {
    schemaVersion: 1,
    scenarioId: scenario.id,
    wall_time_ms: wallTimeMs,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    morphology_churn_count: expectedChurn(scenario),
    mission_continuity_ratio: passed ? 1 : 0,
    duplicate_material_effect_count: passed ? 0 : null,
    measurementStatus: "source-conformance-derived-not-operational",
  };
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-diagnostic-receipt-v1",
    campaignId: manifest.campaignId,
    scenarioId: scenario.id,
    scenarioClass: scenario.class,
    expectedDisposition: scenario.expectedDisposition,
    observedDisposition: passed ? "source-test-passed" : "source-test-failed",
    status: passed ? (proof.evidenceStrength === "direct" ? "conformant" : "coverage-gap") : "failed",
    evidenceClass: "source-conformance",
    evidenceStrength: proof.evidenceStrength,
    sourceCommit,
    testFile: proof.testFile,
    testName: proof.testName,
    testOutputDigest: outputDigest,
    metrics: metric,
    operationalEvidenceProduced: false,
    readinessEstablished: false,
    productionClaimPermitted: false,
  };
  receipts.push({ ...body, receiptDigest: digest("morphogenesis-beta1-diagnostic-receipt-v1", body) });
  metrics.push(metric);
}

const gaps = receipts.filter(({ status }) => status !== "conformant").map(({ scenarioId }) => scenarioId);
const summary = {
  schemaVersion: 1,
  kind: "agentplat-agent-morphogenesis-beta1-adversarial-diagnostic-v1",
  status: receipts.some(({ status }) => status === "failed") ? "failed" : gaps.length ? "incomplete" : "passed",
  sourceCommit,
  scenarioCount: receipts.length,
  conformantScenarioCount: receipts.filter(({ status }) => status === "conformant").length,
  coverageGaps: gaps,
  operationalEvidenceProduced: false,
  campaignClosureEligible: false,
  receiptRoot: digest("morphogenesis-beta1-diagnostic-receipt-root-v1", receipts.map(({ receiptDigest }) => receiptDigest)),
};

if (options["output-directory"]) {
  const directory = path.resolve(options["output-directory"]);
  if (inside(root, directory)) fail("morphogenesis_beta1_diagnostic_output_must_be_external");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeExclusive(path.join(directory, "scenario-receipts.jsonl"), receipts.map((value) => JSON.stringify(value)).join("\n") + "\n"),
    writeExclusive(path.join(directory, "metrics.jsonl"), metrics.map((value) => JSON.stringify(value)).join("\n") + "\n"),
    writeExclusive(path.join(directory, "adversarial-diagnostic-summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
  ]);
}
console.log(JSON.stringify(summary, null, 2));
if (summary.status === "failed") process.exitCode = 1;

function catalogCrash() {
  return binding(
    "catalog creation reconciles a crash after create-and-enroll without duplicate birth",
    "tests/morphogenesis.test.mjs",
    "direct",
  );
}

function binding(testName, testFile, evidenceStrength) {
  return { testName, testFile, evidenceStrength };
}

function expectedChurn(scenario) {
  if (
    scenario.class === "boundary-crash" &&
    ![
      "after-proposal-before-decision",
      "after-decision-before-prepare",
    ].includes(scenario.crashBoundary)
  ) return 1;
  if (scenario.id === "concurrent-morphology-head") return 1;
  return 0;
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--diagnostic-only") {
      result["diagnostic-only"] = true;
      continue;
    }
    if (argument === "--output-directory" && index + 1 < args.length) {
      result["output-directory"] = args[++index];
      continue;
    }
    fail("morphogenesis_beta1_adversarial_option_invalid");
  }
  return result;
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) fail("morphogenesis_beta1_git_failed");
  return result.stdout.trim();
}

async function writeExclusive(file, value) {
  await writeFile(file, value, { encoding: "utf8", flag: "wx" });
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(`${domain}\0${JSON.stringify(canonical(value))}`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function fail(code) {
  throw new TypeError(code);
}
