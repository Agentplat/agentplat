#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));

if (options.mode === "contract-smoke") {
  exactKeys(options, ["mode"]);
  const contract = await readJson("config/agent-morphogenesis-beta1-campaign-v1.json");
  const scenarios = await readJson(contract.scenarioManifest);
  if (scenarios.scenarios.length !== scenarios.closure.requiredScenarioCount)
    fail("morphogenesis_beta1_scenario_closure_invalid");
  console.log(JSON.stringify({ status: "passed", executionPermitted: false }));
} else if (options.mode === "plan") {
  exactKeys(options, ["confirm", "mode", "output-directory", "source-sha"]);
  if (options.confirm !== "DO_NOT_RUN") fail("morphogenesis_beta1_plan_confirmation_invalid");
  if (!/^[0-9a-f]{40}$/u.test(options["source-sha"] ?? ""))
    fail("morphogenesis_beta1_source_sha_invalid");
  const outputDirectory = path.resolve(required(options, "output-directory"));
  if (isInside(root, outputDirectory)) fail("morphogenesis_beta1_output_must_be_external");
  const head = git(["rev-parse", "HEAD"]);
  if (head !== options["source-sha"]) fail("morphogenesis_beta1_source_sha_mismatch");
  if (gitStatus(["diff", "--quiet"]) !== 0 || gitStatus(["diff", "--cached", "--quiet"]) !== 0)
    fail("morphogenesis_beta1_tracked_tree_must_be_clean");

  const [contract, scenarios] = await Promise.all([
    readJson("config/agent-morphogenesis-beta1-campaign-v1.json"),
    readJson("config/agent-morphogenesis-beta1-scenarios-v1.json"),
  ]);
  const contractDigest = digest("agentplat-agent-morphogenesis-beta1-campaign-v1", contract);
  const scenarioManifestDigest = digest(
    "agentplat-agent-morphogenesis-beta1-scenarios-v1",
    scenarios,
  );
  const sourceLock = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-source-lock-v1",
    sourceCommit: head,
    sourceTree: git(["rev-parse", `${head}^{tree}`]),
    trackedTreeClean: true,
    untrackedFilesExcludedFromSourceBinding: true,
    contractDigest,
    scenarioManifestDigest,
  };
  const environment = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-environment-v1",
    osPlatform: os.platform(),
    osRelease: os.release(),
    architecture: os.arch(),
    nodeVersion: process.version,
    cpuModel: os.cpus()[0]?.model ?? "unavailable",
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    postgresEndpoint: `${process.env.PGHOST ?? "127.0.0.1"}:${process.env.PGPORT ?? "5432"}`,
    temporalEndpoint: process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233",
    credentialsRetained: false,
  };
  const registrationBody = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-registration-v1",
    campaignId: contract.campaignId,
    sourceLockDigest: digest("agentplat-agent-morphogenesis-beta1-source-lock-v1", sourceLock),
    environmentDigest: digest("agentplat-agent-morphogenesis-beta1-environment-v1", environment),
    contractDigest,
    scenarioManifestDigest,
    expectedScenarioCount: scenarios.closure.requiredScenarioCount,
    authorizationStatus: "not-issued",
    executionPermitted: false,
    resultsStatus: "not-collected",
    productionClaimPermitted: false,
  };
  const registration = {
    ...registrationBody,
    registrationDigest: digest(
      "agentplat-agent-morphogenesis-beta1-registration-v1",
      registrationBody,
    ),
  };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeImmutable(outputDirectory, "source-lock.json", sourceLock),
    writeImmutable(outputDirectory, "campaign-registration.json", registration),
    writeImmutable(outputDirectory, "scenario-manifest.json", {
      ...scenarios,
      scenarioManifestDigest,
    }),
    writeImmutable(outputDirectory, "environment-manifest.json", environment),
  ]);
  console.log(JSON.stringify({
    status: "planned",
    outputDirectory,
    sourceCommit: head,
    registrationDigest: registration.registrationDigest,
    expectedScenarioCount: registration.expectedScenarioCount,
    executionPermitted: false,
  }, null, 2));
} else {
  fail("morphogenesis_beta1_campaign_mode_invalid");
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--") continue;
    if (!key.startsWith("--") || index + 1 >= args.length) fail("morphogenesis_beta1_option_invalid");
    const name = key.slice(2);
    if (Object.hasOwn(result, name)) fail("morphogenesis_beta1_option_duplicated");
    result[name] = args[++index];
  }
  return result;
}

function exactKeys(value, expected) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(","))
    fail("morphogenesis_beta1_options_invalid");
}

function required(value, key) {
  const result = value[key];
  if (!result) fail(`morphogenesis_beta1_${key}_required`);
  return result;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gitStatus(args) {
  try {
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function writeImmutable(directory, name, value) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0`)
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function fail(code) {
  throw new TypeError(code);
}
