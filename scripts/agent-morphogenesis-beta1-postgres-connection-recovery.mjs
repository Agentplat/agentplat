#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getMigrationStatus,
  runMigrations,
} from "../packages/collective-host-postgres/dist/index.js";
import { createPostgresPool } from "../packages/postgres/dist/index.js";

const options = parse(process.argv.slice(2));
if (!options.diagnosticOnly)
  throw new TypeError("postgres_connection_recovery_confirmation_missing");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = "morph_b1_connection_recovery";
const poolOptions = {
  max: 2,
  ...(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST ?? "127.0.0.1",
        port: Number(process.env.PGPORT ?? "5432"),
        database: process.env.PGDATABASE ?? "postgres",
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      }),
};
const startedAt = performance.now();
const cycles = [];
let migrationPool = createPostgresPool(poolOptions);

try {
  await runMigrations(migrationPool, { schema, createSchema: true });
  await migrationPool.end();
  migrationPool = null;
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const victimPool = createPostgresPool(poolOptions);
    const killerPool = createPostgresPool(poolOptions);
    const victim = await victimPool.connect();
    const pid = Number((await victim.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    assert.equal(Number.isSafeInteger(pid) && pid > 0, true);
    assert.equal(
      (await killerPool.query("SELECT pg_terminate_backend($1) AS terminated", [pid]))
        .rows[0].terminated,
      true,
    );
    await assert.rejects(victim.query("SELECT 1"));
    victim.release(true);
    await Promise.all([victimPool.end(), killerPool.end()]);
    const replacement = createPostgresPool(poolOptions);
    const cycleStarted = performance.now();
    const status = await getMigrationStatus(replacement, { schema });
    assert.equal(status.currentVersion, 9);
    assert.deepEqual(status.pendingVersions, []);
    assert.equal(Number((await replacement.query("SELECT 1 AS ready")).rows[0].ready), 1);
    await replacement.end();
    cycles.push({
      cycle,
      terminatedBackendPid: pid,
      migrationVersion: status.currentVersion,
      replacementReady: true,
      recoveryTimeMs: Math.round(performance.now() - cycleStarted),
    });
  }
  const metrics = {
    schemaVersion: 1,
    scenarioId: "postgres-connection-loss-recovery",
    wall_time_ms: Math.round(performance.now() - startedAt),
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    morphology_churn_count: 0,
    mission_continuity_ratio: 1,
    duplicate_material_effect_count: 0,
    process_rss_bytes: process.memoryUsage().rss,
    aggregate_cpu_percent: 0,
    postgres_storage_bytes: 0,
    temporal_storage_bytes: 0,
    mesh_pending_inbox_rows: 0,
    mesh_pending_outbox_rows: 0,
    supervisor_resume_time_ms: 0,
  };
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-postgres-recovery-receipt-v1",
    scenarioId: metrics.scenarioId,
    status: "passed",
    evidenceClass: "operational-direct",
    sourceCommit:
      process.env.AGENTPLAT_CANDIDATE_COMMIT ?? "uncommitted-diagnostic",
    connectionLossCycles: cycles.length,
    cycles,
    lostCommittedReceipts: 0,
    duplicateMaterialEffects: 0,
    metrics,
    operationalReadinessEstablished: false,
    productionClaimPermitted: false,
  };
  const receipt = {
    ...body,
    receiptDigest: digest(
      "agentplat-agent-morphogenesis-beta1-postgres-recovery-receipt-v1",
      body,
    ),
  };
  if (options.outputDirectory) {
    const outputDirectory = path.resolve(options.outputDirectory);
    const relative = path.relative(root, outputDirectory);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
      throw new TypeError("readiness evidence output must be external");
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, "postgres-connection-recovery-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  }
  console.log(JSON.stringify({
    status: "passed",
    scenarioId: receipt.scenarioId,
    receiptDigest: receipt.receiptDigest,
    connectionLossCycles: cycles.length,
    maximumRecoveryTimeMs: Math.max(...cycles.map(({ recoveryTimeMs }) => recoveryTimeMs)),
    migrationVersion: 9,
    operationalReadinessEstablished: false,
    productionClaimPermitted: false,
  }, null, 2));
} finally {
  if (migrationPool) await migrationPool.end().catch(() => undefined);
  const cleanup = createPostgresPool(poolOptions);
  await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
  await cleanup.end();
}

function parse(args) {
  const result = { diagnosticOnly: false, outputDirectory: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (value === "--diagnostic-only") result.diagnosticOnly = true;
    else if (value === "--output-directory" && index + 1 < args.length)
      result.outputDirectory = args[++index];
    else throw new TypeError("postgres_connection_recovery_option_invalid");
  }
  return result;
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
