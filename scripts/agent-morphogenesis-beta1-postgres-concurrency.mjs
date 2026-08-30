#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createInitialMorphologyHeadV1,
  createSuccessorMorphologyHeadV1,
} from "../packages/collective-runtime/dist/morphogenesis.js";
import {
  PostgresMorphologyHeadStoreV1,
  runMigrations,
} from "../packages/collective-host-postgres/dist/index.js";
import { createPostgresPool } from "../packages/postgres/dist/index.js";

const options = parse(process.argv.slice(2));
if (!options.diagnosticOnly)
  throw new TypeError("morphogenesis_beta1_postgres_concurrency_confirmation_missing");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = `morph_b1_concurrency_${randomBytes(8).toString("hex")}`;
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
const firstPool = createPostgresPool(poolOptions);
const secondPool = createPostgresPool(poolOptions);
const witness = waitingWitness();
const scopeId = "readiness:concurrent-morphology-head";
const started = performance.now();

try {
  await runMigrations(firstPool, { schema, createSchema: true });
  const first = new PostgresMorphologyHeadStoreV1(firstPool, {
    schema,
    scopeId,
    rollbackWitness: witness,
  });
  const second = new PostgresMorphologyHeadStoreV1(secondPool, {
    schema,
    scopeId,
    rollbackWitness: witness,
  });
  const initial = createInitialMorphologyHeadV1({
    stateKey: "morphology-head:readiness-concurrency",
    scopeDigest: sha("1"),
    policyDigest: sha("2"),
    morphologyEpoch: 1,
    snapshotDigest: sha("3"),
    logicalTimeMs: 100,
  });
  assert.equal(
    await first.save({
      head: initial,
      expectedRevision: null,
      expectedHeadDigest: null,
    }),
    true,
  );
  const successor = (character, logicalTimeMs) =>
    createSuccessorMorphologyHeadV1({
      current: initial,
      commit: {
        stateKey: initial.stateKey,
        scopeDigest: initial.scopeDigest,
        policyDigest: initial.policyDigest,
        expectedMorphologyEpoch: 1,
        snapshotDigest: sha(character),
        proposalDigest: sha(character === "4" ? "6" : "7"),
        decisionDigest: sha(character === "4" ? "8" : "9"),
        receiptDigest: sha(character === "4" ? "a" : "b"),
        logicalTimeMs,
      },
    });
  const left = successor("4", 110);
  const right = successor("5", 111);
  const attempts = await Promise.all([
    first.save({
      head: left,
      expectedRevision: initial.revision,
      expectedHeadDigest: initial.headDigest,
    }),
    second.save({
      head: right,
      expectedRevision: initial.revision,
      expectedHeadDigest: initial.headDigest,
    }),
  ]);
  assert.equal(attempts.filter(Boolean).length, 1);
  const retained = await first.load(initial.stateKey);
  assert.ok(
    [left.headDigest, right.headDigest].includes(retained.headDigest),
  );
  assert.equal(retained.revision, 1);
  assert.equal(retained.morphologyEpoch, 2);
  const winner = retained.headDigest === left.headDigest ? left : right;
  const replayStore = new PostgresMorphologyHeadStoreV1(secondPool, {
    schema,
    scopeId,
    rollbackWitness: witness,
  });
  assert.equal(
    await replayStore.save({
      head: winner,
      expectedRevision: initial.revision,
      expectedHeadDigest: initial.headDigest,
    }),
    true,
  );
  const row = await firstPool.query(
    `SELECT count(*)::integer AS count,
            pg_total_relation_size($1::regclass)::bigint AS bytes
       FROM "${schema}".collective_host_runtime_states
      WHERE scope_id = $2 AND state_kind = 'morphology-head'`,
    [`${schema}.collective_host_runtime_states`, scopeId],
  );
  assert.equal(row.rows[0].count, 1);
  const metrics = {
    schemaVersion: 1,
    scenarioId: "concurrent-morphology-head",
    wall_time_ms: Math.round(performance.now() - started),
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    morphology_churn_count: 1,
    mission_continuity_ratio: 1,
    duplicate_material_effect_count: 0,
    process_rss_bytes: process.memoryUsage().rss,
    aggregate_cpu_percent: 0,
    postgres_storage_bytes: Number(row.rows[0].bytes),
    temporal_storage_bytes: 0,
    mesh_pending_inbox_rows: 0,
    mesh_pending_outbox_rows: 0,
    supervisor_resume_time_ms: 0,
  };
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-readiness-scenario-receipt-v1",
    scenarioId: metrics.scenarioId,
    status: "passed",
    evidenceClass: "operational-direct",
    sourceCommit:
      process.env.AGENTPLAT_CANDIDATE_COMMIT ?? "uncommitted-diagnostic",
    postgres: "real",
    independentPools: 2,
    attemptedSuccessors: 2,
    acceptedSuccessors: 1,
    retainedHeadDigest: retained.headDigest,
    exactWinnerReplay: true,
    metrics,
    operationalReadinessEstablished: false,
    productionClaimPermitted: false,
  };
  const receipt = {
    ...body,
    receiptDigest: digest(
      "agentplat-agent-morphogenesis-beta1-readiness-scenario-receipt-v1",
      body,
    ),
  };
  if (options.outputDirectory) {
    const outputDirectory = path.resolve(options.outputDirectory);
    const relative = path.relative(root, outputDirectory);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
      throw new TypeError("readiness evidence output must be external");
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeExclusive(
        path.join(outputDirectory, "concurrency-receipt.json"),
        `${JSON.stringify(receipt, null, 2)}\n`,
      ),
      writeExclusive(
        path.join(outputDirectory, "concurrency-metrics.json"),
        `${JSON.stringify(metrics, null, 2)}\n`,
      ),
    ]);
  }
  console.log(JSON.stringify({
    status: "passed",
    scenarioId: receipt.scenarioId,
    receiptDigest: receipt.receiptDigest,
    attemptedSuccessors: 2,
    acceptedSuccessors: 1,
    retainedHeadDigest: retained.headDigest,
    postgresStorageBytes: metrics.postgres_storage_bytes,
    operationalReadinessEstablished: false,
  }, null, 2));
} finally {
  if (/^morph_b1_concurrency_[a-f0-9]{16}$/u.test(schema))
    await firstPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await Promise.all([firstPool.end(), secondPool.end()]);
}

function waitingWitness() {
  const heads = new Map();
  const key = (input) => `${input.scopeId}:${input.stateKind}:${input.stateKey}`;
  return {
    async verify(input) {
      const deadline = Date.now() + 250;
      do {
        const current = heads.get(key(input));
        if (current?.revision === input.revision && current?.digest === input.digest)
          return true;
        await new Promise((resolve) => setTimeout(resolve, 1));
      } while (Date.now() < deadline);
      return false;
    },
    async record(input) {
      const stateKey = key(input);
      const current = heads.get(stateKey);
      if (
        (input.previousRevision === null && current) ||
        (input.previousRevision !== null &&
          (current?.revision !== input.previousRevision ||
            current?.digest !== input.previousDigest))
      ) return false;
      heads.set(stateKey, {
        revision: input.nextRevision,
        digest: input.nextDigest,
      });
      return true;
    },
  };
}

function parse(args) {
  const result = { diagnosticOnly: false, outputDirectory: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (value === "--diagnostic-only") result.diagnosticOnly = true;
    else if (value === "--output-directory" && index + 1 < args.length)
      result.outputDirectory = args[++index];
    else throw new TypeError("morphogenesis_beta1_postgres_concurrency_option_invalid");
  }
  return result;
}

function sha(character) {
  return `sha256:${character.repeat(64)}`;
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

async function writeExclusive(file, contents) {
  await writeFile(file, contents, { encoding: "utf8", flag: "wx" });
}
