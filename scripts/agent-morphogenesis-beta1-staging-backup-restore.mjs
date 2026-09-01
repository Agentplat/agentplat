#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--contract-smoke")) {
  console.log(JSON.stringify({
    status: "passed",
    backupFormat: "postgres-custom",
    restoreTarget: "clean-ephemeral-postgres-instance",
    executionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
  process.exit(0);
}
if (!process.argv.includes("--diagnostic-only"))
  throw new TypeError("staging_backup_restore_requires_diagnostic_only");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(
  root,
  "deploy/agent-morphogenesis-beta1-staging-preflight/compose.yaml",
);
const isolationReceiptPath = path.resolve(requiredOption("--isolation-receipt"));
const outputDirectory = path.resolve(requiredOption("--output-directory"));
if (inside(root, isolationReceiptPath) || inside(root, outputDirectory))
  throw new TypeError("staging_backup_restore_paths_must_be_external");
const isolation = JSON.parse(await readFile(isolationReceiptPath, "utf8"));
assert.equal(isolation.status, "passed");
assert.match(isolation.schema, /^morph_staging_isolation_[0-9a-f]{16}$/u);
assert.equal(isolation.completedExecutions, 6);
await mkdir(outputDirectory, { recursive: true });

const backupPath = path.join(outputDirectory, "agentplat-postgres-backup.dump");
let restoreStarted = false;
try {
  compose(["--profile", "restore", "rm", "-s", "-f", "restore-postgres"]);
  compose(["--profile", "restore", "up", "-d", "--wait", "restore-postgres"]);
  restoreStarted = true;
  const backup = composeBuffer([
    "exec", "-T", "agent-postgres",
    "pg_dump", "-U", "agentplat", "-d", "agentplat_morphogenesis",
    "--format=custom", `--schema=${isolation.schema}`,
  ]);
  assert.ok(backup.byteLength > 1_024);
  await writeFile(backupPath, backup, { flag: "wx", mode: 0o600 });
  composeBuffer([
    "--profile", "restore", "exec", "-T", "restore-postgres",
    "pg_restore", "-U", "agentplat_restore", "-d", "agentplat_restore",
    "--exit-on-error", "--no-owner", "--no-privileges",
  ], backup);

  const query = canonicalQuery(isolation.schema);
  const sourceRows = composeBuffer([
    "exec", "-T", "agent-postgres", "psql", "-XAt",
    "-U", "agentplat", "-d", "agentplat_morphogenesis", "-c", query,
  ]);
  const restoredRows = composeBuffer([
    "--profile", "restore", "exec", "-T", "restore-postgres", "psql", "-XAt",
    "-U", "agentplat_restore", "-d", "agentplat_restore", "-c", query,
  ]);
  assert.ok(sourceRows.byteLength > 0);
  assert.deepEqual(restoredRows, sourceRows);
  const restoredCounts = compose([
    "--profile", "restore", "exec", "-T", "restore-postgres", "psql", "-XAt",
    "-U", "agentplat_restore", "-d", "agentplat_restore", "-c",
    `SELECT
       (SELECT count(*) FROM "${isolation.schema}".collective_host_runtime_states
         WHERE state_kind='morphogenesis-execution') || ':' ||
       (SELECT count(*) FROM "${isolation.schema}".workflow_process_runs);`,
  ]);
  assert.equal(restoredCounts, "6:6");
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-backup-restore-receipt-v1",
    status: "passed",
    evidenceClass: "single-host-staging-preflight",
    sourceSchema: isolation.schema,
    sourceIsolationReceiptDigest: isolation.receiptDigest,
    backupFormat: "postgres-custom",
    backupBytes: backup.byteLength,
    backupDigest: sha(backup),
    sourceCanonicalRoot: sha(sourceRows),
    restoredCanonicalRoot: sha(restoredRows),
    restoredMorphogenesisExecutions: 6,
    restoredWorkflowRuns: 6,
    restoreTarget: "clean-ephemeral-postgres-instance",
    restoreTargetDataDestroyedAfterVerification: true,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const receipt = { ...body, receiptDigest: digest(body) };
  await writeFile(
    path.join(outputDirectory, "backup-restore-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (restoreStarted)
    compose(["--profile", "restore", "rm", "-s", "-f", "restore-postgres"]);
}

function canonicalQuery(schema) {
  return `SELECT 'morphogenesis' || E'\\t' || scope_id || E'\\t' || state_key || E'\\t' || state_digest || E'\\t' || state::text
    FROM "${schema}".collective_host_runtime_states
   WHERE state_kind='morphogenesis-execution'
   UNION ALL
  SELECT 'workflow' || E'\\t' || tenant_id || E'\\t' || run_id || E'\\t' || state::text
    FROM "${schema}".workflow_process_runs
   ORDER BY 1;`;
}

function compose(args) {
  return composeBuffer(args).toString("utf8").trim();
}

function composeBuffer(args, input) {
  return execFileSync("docker", ["compose", "-f", composeFile, ...args], {
    cwd: root,
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
  });
}

function requiredOption(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sha(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digest(value) {
  return sha(JSON.stringify(value));
}
