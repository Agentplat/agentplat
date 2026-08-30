#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(
  root,
  "deploy/agent-morphogenesis-beta1-staging-preflight/compose.yaml",
);
const profileFile = path.join(
  root,
  "config/agent-morphogenesis-beta1-staging-qualification-v1.json",
);
const profile = JSON.parse(await readFile(profileFile, "utf8"));
const mode = option("--mode") ?? "status";
const allowed = new Set(["contract-smoke", "up", "down", "run", "status"]);
if (!allowed.has(mode)) fail("staging_preflight_mode_invalid");
const postgresPort = port(
  process.env.AGENTPLAT_PREFLIGHT_POSTGRES_PORT ?? "55434",
  "AGENTPLAT_PREFLIGHT_POSTGRES_PORT",
);
const temporalPort = port(
  process.env.AGENTPLAT_PREFLIGHT_TEMPORAL_PORT ?? "57233",
  "AGENTPLAT_PREFLIGHT_TEMPORAL_PORT",
);

if (mode === "contract-smoke") {
  const rendered = compose("--profile", "restore", "config", "--format", "json");
  const topology = JSON.parse(rendered);
  assert.deepEqual(Object.keys(topology.services).sort(), [
    "agent-postgres",
    "restore-postgres",
    "temporal",
    "temporal-postgres",
  ]);
  assert.equal(topology.services["agent-postgres"].image, "postgres:16.6-alpine");
  assert.equal(topology.services["temporal-postgres"].image, "postgres:16.6-alpine");
  assert.equal(topology.services.temporal.image, "temporalio/auto-setup:1.27.2");
  assert.ok(topology.volumes["agent-postgres-data"]);
  assert.ok(topology.volumes["temporal-postgres-data"]);
  assert.equal(
    profile.qualificationStages.singleHostContainerPreflight.mayEstablishStagingQualification,
    false,
  );
  report("passed", { servicesHealthy: false, executionPermitted: false });
} else if (mode === "up") {
  requireConfirmation("START_SINGLE_HOST_STAGING_PREFLIGHT");
  compose("up", "-d", "--wait");
  const health = await endpoints();
  if (!health.postgresReachable || !health.temporalReachable)
    fail("staging_preflight_services_unreachable");
  report("ready", { ...health, executionPermitted: true });
} else if (mode === "down") {
  requireConfirmation("STOP_SINGLE_HOST_STAGING_PREFLIGHT");
  compose("down");
  report("stopped", { servicesHealthy: false, volumesPreserved: true });
} else if (mode === "run") {
  requireConfirmation("RUN_SINGLE_HOST_STAGING_PREFLIGHT");
  const outputDirectory = path.resolve(requiredOption("--output-directory"));
  if (inside(root, outputDirectory)) fail("staging_preflight_output_must_be_external");
  const health = await endpoints();
  if (!health.postgresReachable || !health.temporalReachable)
    fail("staging_preflight_services_unreachable");
  if (git("status", "--porcelain=v1", "--untracked-files=no") !== "")
    fail("staging_preflight_tracked_worktree_not_clean");
  await mkdir(outputDirectory, { recursive: false });
  const sourceCommit = git("rev-parse", "HEAD");
  const environment = {
    ...process.env,
    PGHOST: "127.0.0.1",
    PGPORT: String(postgresPort),
    PGDATABASE: "agentplat_morphogenesis",
    PGUSER: "agentplat",
    PGPASSWORD: "agentplat-preflight-only",
    TEMPORAL_ADDRESS: `127.0.0.1:${temporalPort}`,
    AGENTPLAT_CANDIDATE_COMMIT: sourceCommit,
  };
  execute(process.execPath, [
    "scripts/agent-morphogenesis-beta1-postgres-nominal.mjs",
    "--diagnostic-only",
    "--temporal",
    "--output-directory",
    path.join(outputDirectory, "nominal"),
  ], environment);
  execute(process.execPath, ["examples/mesh-multiprocess/demo.mjs"], {
    ...environment,
    AGENTPLAT_MORPHOGENESIS_EVIDENCE_OUTPUT: path.join(outputDirectory, "mesh"),
  });
  execute(process.execPath, [
    "scripts/agent-morphogenesis-beta1-staging-isolation.mjs",
    "--diagnostic-only",
    "--preserve-schema",
    "--output-directory",
    path.join(outputDirectory, "isolation"),
  ], environment);
  execute(process.execPath, [
    "scripts/agent-morphogenesis-beta1-staging-backup-restore.mjs",
    "--diagnostic-only",
    "--isolation-receipt",
    path.join(outputDirectory, "isolation", "isolation-receipt.json"),
    "--output-directory",
    path.join(outputDirectory, "backup-restore"),
  ], environment);
  const [nominal, mesh, isolation, backupRestore] = await Promise.all([
    JSON.parse(await readFile(path.join(outputDirectory, "nominal", "nominal-summary.json"), "utf8")),
    JSON.parse(await readFile(path.join(outputDirectory, "mesh", "mesh-quorum-receipt.json"), "utf8")),
    JSON.parse(await readFile(path.join(outputDirectory, "isolation", "isolation-receipt.json"), "utf8")),
    JSON.parse(await readFile(path.join(outputDirectory, "backup-restore", "backup-restore-receipt.json"), "utf8")),
  ]);
  assert.equal(nominal.status, "passed");
  assert.equal(nominal.scenarioCount, 6);
  assert.equal(mesh.status, "passed");
  assert.equal(mesh.peerIdentities, 4);
  assert.ok(mesh.processesStarted >= 6);
  assert.equal(mesh.morphogenesisAuthorityGrantedByTransport, false);
  assert.equal(mesh.duplicateMaterialEffectCount, 0);
  assert.equal(isolation.completedExecutions, 6);
  assert.equal(isolation.crossTenantReadsAccepted, 0);
  assert.equal(isolation.crossMissionAuthorityUsesAccepted, 0);
  assert.equal(isolation.crossScopeReceiptsAccepted, 0);
  assert.equal(backupRestore.sourceCanonicalRoot, backupRestore.restoredCanonicalRoot);
  compose(
    "exec", "-T", "agent-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "agentplat", "-d", "agentplat_morphogenesis", "-c",
    `DROP SCHEMA "${isolation.schema}" CASCADE`,
  );
  const images = Object.fromEntries(
    ["postgres:16.6-alpine", "temporalio/auto-setup:1.27.2"].map((image) => [
      image,
      docker("image", "inspect", image, "--format", "{{index .RepoDigests 0}}"),
    ]),
  );
  const manifestBody = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-preflight-manifest-v1",
    status: "passed",
    sourceCommit,
    profileId: profile.profileId,
    profileDigest: `sha256:${createHash("sha256").update(JSON.stringify(profile)).digest("hex")}`,
    topology: "single-docker-host",
    failureDomainsRepresented: 1,
    services: ["agent-postgres", "temporal-postgres", "temporal"],
    images,
    nominalScenarioCount: nominal.scenarioCount,
    meshPeerIdentities: mesh.peerIdentities,
    meshProcessesStarted: mesh.processesStarted,
    meshReceiptDigest: digest(mesh),
    isolationReceiptDigest: isolation.receiptDigest,
    backupRestoreReceiptDigest: backupRestore.receiptDigest,
    tenantCount: isolation.tenantCount,
    missionsPerTenant: isolation.missionsPerTenant,
    crossTenantEffects: 0,
    crossMissionEffects: 0,
    backupRestoreCanonicalRoot: backupRestore.restoredCanonicalRoot,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const manifest = { ...manifestBody, manifestDigest: digest(manifestBody) };
  await writeFile(
    path.join(outputDirectory, "preflight-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  report("passed", {
    ...health,
    outputDirectory,
    sourceCommit,
    manifestDigest: manifest.manifestDigest,
    executionPermitted: false,
  });
} else {
  const health = await endpoints();
  let services = [];
  try {
    services = JSON.parse(compose("ps", "--format", "json"));
  } catch {
    // Status remains useful even when the project has never been started.
  }
  report(
    health.postgresReachable && health.temporalReachable ? "ready" : "not-ready",
    { ...health, services, executionPermitted: false },
  );
}

function report(status, detail) {
  console.log(JSON.stringify({
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-preflight-status-v1",
    status,
    profileId: profile.profileId,
    topology: "single-docker-host",
    failureDomainsRepresented: 1,
    profileDigest: `sha256:${createHash("sha256").update(JSON.stringify(profile)).digest("hex")}`,
    endpoints: {
      postgres: `127.0.0.1:${postgresPort}`,
      temporal: `127.0.0.1:${temporalPort}`,
    },
    ...detail,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
}

async function endpoints() {
  const [postgresReachable, temporalReachable] = await Promise.all([
    reachable(postgresPort),
    reachable(temporalPort),
  ]);
  return { postgresReachable, temporalReachable };
}

function compose(...args) {
  return execFileSync("docker", ["compose", "-f", composeFile, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function docker(...args) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function execute(command, args, env) {
  execFileSync(command, args, { cwd: root, env, stdio: "inherit" });
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function requireConfirmation(expected) {
  if (option("--confirm") !== expected)
    fail("staging_preflight_confirmation_invalid");
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requiredOption(name) {
  const value = option(name);
  if (!value) fail("staging_preflight_required_option_missing");
  return value;
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function port(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535)
    throw new TypeError(`${name} port is invalid`);
  return parsed;
}

function reachable(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(750, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function fail(code) {
  throw new Error(code);
}
