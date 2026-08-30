#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createMorphogenesisBudgetEnvelopeV1,
  createMorphogenesisBudgetReservationRequestV1,
} from "../packages/collective-runtime/dist/morphogenesis.js";
import {
  PostgresMorphogenesisBudgetReservationPortV1,
  runMigrations,
} from "../packages/collective-host-postgres/dist/index.js";
import { createPostgresPool } from "../packages/postgres/dist/index.js";

const options = parse(process.argv.slice(2));
if (!options.diagnosticOnly)
  throw new TypeError("morphogenesis_budget_concurrency_confirmation_missing");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = `morph_b1_budget_${randomBytes(8).toString("hex")}`;
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
const scopeDigest = sha("1");
const capacity = {
  maximumActiveAgents: 4,
  maximumNewAgents: 1,
  maximumConcurrentProvisioning: 1,
  maximumResourceUnits: 10,
  maximumInteractionUnits: 100,
  maximumActionUnits: 10,
  maximumInputTokens: 100,
  maximumOutputTokens: 100,
  maximumTotalTokens: 200,
  maximumDurationMs: 10_000,
  maximumCosts: [{ currency: "USD", micros: 0 }],
};
const budget = createMorphogenesisBudgetEnvelopeV1({
  ...capacity,
  maximumActiveAgents: 1,
});
const started = performance.now();

try {
  await runMigrations(firstPool, { schema, createSchema: true });
  const open = (pool) =>
    new PostgresMorphogenesisBudgetReservationPortV1(pool, {
      schema,
      scopeId: "readiness:concurrent-budget",
      scopeDigest,
      capacity,
      rollbackWitness: witness,
    });
  const first = open(firstPool);
  const second = open(secondPool);
  const request = (
    suffix,
    proposalCharacter,
    logicalTimeMs = 100,
    expiresAtLogicalMs = logicalTimeMs + 1_000,
  ) =>
    createMorphogenesisBudgetReservationRequestV1({
      reservationId: `reservation:readiness:${suffix}`,
      scopeDigest,
      proposalDigest: sha(proposalCharacter),
      expectedMorphologyEpoch: 1,
      operationId: `operation:readiness:${suffix}`,
      budget,
      reservedAtLogicalMs: logicalTimeMs,
      expiresAtLogicalMs,
    });
  const left = request("left", "2");
  const right = request("right", "3");
  const attempts = await Promise.allSettled([
    first.reserve(left),
    second.reserve(right),
  ]);
  assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(attempts.filter(({ status }) => status === "rejected").length, 1);
  assert.match(
    attempts.find(({ status }) => status === "rejected").reason.message,
    /maximumNewAgents is exhausted/,
  );
  const winnerRequest = attempts[0].status === "fulfilled" ? left : right;
  const loserRequest = winnerRequest === left ? right : left;
  const winner = attempts.find(({ status }) => status === "fulfilled").value;
  assert.equal((await open(secondPool).reserve(winnerRequest)).reservationDigest, winner.reservationDigest);
  assert.equal(
    (await open(firstPool).inspect({
      reservationId: winnerRequest.reservationId,
      logicalTimeMs: 110,
    })).reservationDigest,
    winner.reservationDigest,
  );
  const released = await open(secondPool).release({
    reservationId: winnerRequest.reservationId,
    proposalDigest: winnerRequest.proposalDigest,
    releaseOperationId: "operation:readiness:release",
    reasonCode: "readiness_transition_completed",
    logicalTimeMs: 120,
  });
  assert.equal(released.status, "released");
  assert.equal(
    (await open(firstPool).release({
      reservationId: winnerRequest.reservationId,
      proposalDigest: winnerRequest.proposalDigest,
      releaseOperationId: "operation:readiness:release",
      reasonCode: "readiness_transition_completed",
      logicalTimeMs: 120,
    })).reservationDigest,
    released.reservationDigest,
  );
  const successorRequest = request(
    winnerRequest === left ? "right" : "left",
    winnerRequest === left ? "3" : "2",
    130,
    140,
  );
  const successor = await open(firstPool).reserve(successorRequest);
  assert.equal(successor.status, "reserved");
  const expired = await open(secondPool).inspect({
    reservationId: successorRequest.reservationId,
    logicalTimeMs: 140,
  });
  assert.equal(expired.status, "expired");
  const rows = await firstPool.query(
    `SELECT count(*)::integer AS count,
            count(*) FILTER (WHERE status = 'reserved')::integer AS active,
            pg_total_relation_size($1::regclass)::bigint AS bytes
       FROM "${schema}".morphogenesis_budget_reservations
      WHERE scope_id = $2`,
    [`${schema}.morphogenesis_budget_reservations`, "readiness:concurrent-budget"],
  );
  assert.equal(rows.rows[0].count, 2);
  assert.equal(rows.rows[0].active, 0);
  const metrics = {
    schemaVersion: 1,
    scenarioId: "concurrent-budget-reservation",
    wall_time_ms: Math.round(performance.now() - started),
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    morphology_churn_count: 0,
    mission_continuity_ratio: 1,
    duplicate_material_effect_count: 0,
    process_rss_bytes: process.memoryUsage().rss,
    aggregate_cpu_percent: 0,
    postgres_storage_bytes: Number(rows.rows[0].bytes),
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
    concurrentAttempts: 2,
    acceptedReservations: 1,
    rejectedDoubleSpends: 1,
    exactReplay: true,
    durableRelease: true,
    durableExpiry: true,
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
        path.join(outputDirectory, "budget-concurrency-receipt.json"),
        `${JSON.stringify(receipt, null, 2)}\n`,
      ),
      writeExclusive(
        path.join(outputDirectory, "budget-concurrency-metrics.json"),
        `${JSON.stringify(metrics, null, 2)}\n`,
      ),
    ]);
  }
  console.log(JSON.stringify({
    status: "passed",
    scenarioId: receipt.scenarioId,
    receiptDigest: receipt.receiptDigest,
    concurrentAttempts: 2,
    acceptedReservations: 1,
    rejectedDoubleSpends: 1,
    durableRelease: true,
    durableExpiry: true,
    postgresStorageBytes: metrics.postgres_storage_bytes,
    operationalReadinessEstablished: false,
  }, null, 2));
} finally {
  if (/^morph_b1_budget_[a-f0-9]{16}$/u.test(schema))
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
    else throw new TypeError("morphogenesis_budget_concurrency_option_invalid");
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
