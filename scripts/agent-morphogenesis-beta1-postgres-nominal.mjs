#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  Client,
  Connection,
} from "../packages/workflows-temporal/node_modules/@temporalio/client/lib/index.js";
import {
  NativeConnection,
  Worker,
} from "../packages/workflows-temporal/node_modules/@temporalio/worker/lib/index.js";

import { createPostgresPool } from "../packages/postgres/dist/index.js";
import {
  PostgresMorphogenesisExecutionStoreV1,
  runMigrations as runCollectiveHostMigrations,
} from "../packages/collective-host-postgres/dist/index.js";
import {
  PostgresWorkflowStoreV1,
  runMigrations as runWorkflowMigrations,
} from "../packages/workflows-postgres/dist/index.js";
import { runMorphogenesisExampleScenario } from "../examples/agent-morphogenesis/demo.mjs";
import { InMemoryProcessRunnerV1 } from "../packages/workflows/dist/index.js";
import {
  TemporalProcessRunnerV1,
  TemporalWorkflowNotifierV1,
  createTemporalWorkflowActivitiesV1,
} from "../packages/workflows-temporal/dist/index.js";

const cli = parseOptions(process.argv.slice(2));

const diagnosticOnly = cli.diagnosticOnly;
const useTemporal = cli.temporal;
if (!diagnosticOnly)
  throw new TypeError("morphogenesis_beta1_postgres_nominal_requires_diagnostic_only");

const pool = createPostgresPool({
  max: 4,
  ...(process.env.DATABASE_URL ? {} : { database: process.env.PGDATABASE ?? "postgres" }),
});
const routes = ["authorized_agent", "authorized_person", "collective"];
const branches = ["recruit", "create"];
const results = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporalAddress = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const nativeConnection = useTemporal
  ? await NativeConnection.connect({ address: temporalAddress })
  : null;
const clientConnection = useTemporal
  ? await Connection.connect({ address: temporalAddress })
  : null;
const temporalClient = clientConnection
  ? new Client({ connection: clientConnection })
  : null;
const workflowsPath = fileURLToPath(
  new URL("../packages/workflows-temporal/dist/workflow.js", import.meta.url),
);

try {
  for (const decisionRoute of routes) {
    for (const branch of branches) {
      const schema = `morph_b1_${randomBytes(8).toString("hex")}`;
      const witness = createInMemoryRollbackWitness();
      try {
        await runCollectiveHostMigrations(pool, { schema, createSchema: true });
        await runWorkflowMigrations(pool, { schema, createSchema: false });
        const executionStore = new PostgresMorphogenesisExecutionStoreV1(pool, {
          schema,
          scopeId: `beta1:${branch}:${decisionRoute}`,
          rollbackWitness: witness,
        });
        const workflowStore = new PostgresWorkflowStoreV1(pool, { schema });
        const started = performance.now();
        let temporalCycles = 0;
        const result = await runMorphogenesisExampleScenario(branch, decisionRoute, {
          executionStore,
          workflowStore,
          ...(useTemporal
            ? {
                processRunnerFactory: async ({ runnerOptions, tenantId, runId }) => {
                  const authoritative = new InMemoryProcessRunnerV1(
                    workflowStore,
                    runnerOptions,
                  );
                  const taskQueue = `agentplat-morph-b1-${process.pid}-${randomBytes(4).toString("hex")}`;
                  const workflowId = `agentplat-morph-b1:${tenantId}:${runId}:${decisionRoute}`;
                  const delegated = createTemporalWorkflowActivitiesV1({
                    runner: authoritative,
                  });
                  const activities = {
                    async advanceProcess(input) {
                      temporalCycles += 1;
                      return delegated.advanceProcess(input);
                    },
                  };
                  const worker = await Worker.create({
                    connection: nativeConnection,
                    taskQueue,
                    workflowsPath,
                    activities,
                  });
                  const workerRun = worker.run();
                  const notifier = new TemporalWorkflowNotifierV1({
                    client: temporalClient,
                    taskQueue,
                    rolloverAfterCycles: 2,
                    workflowId: () => workflowId,
                  });
                  return {
                    runner: new TemporalProcessRunnerV1(authoritative, notifier),
                    registrar: authoritative,
                    worker,
                    workerRun,
                    workflowId,
                  };
                },
                afterScenario: async ({ processRunners }) => {
                  await temporalClient.workflow
                    .getHandle(processRunners.workflowId)
                    .result();
                  processRunners.worker.shutdown();
                  await processRunners.workerRun;
                },
              }
            : {}),
        });
        const elapsedMs = Math.max(0, Math.round(performance.now() - started));
        const reopened = new PostgresMorphogenesisExecutionStoreV1(pool, {
          schema,
          scopeId: `beta1:${branch}:${decisionRoute}`,
          rollbackWitness: witness,
        });
        const retained = await reopened.load(`execution:${branch}`);
        assert.equal(retained?.phase, "completed");
        assert.equal(retained?.receipt?.receiptDigest, result.receiptDigest);
        const secondRead = await reopened.load(`execution:${branch}`);
        assert.deepEqual(secondRead, retained);
        results.push({
          branch: branch === "recruit" ? "recruit_existing" : "catalog_created",
          decisionRoute,
          status: "passed",
          elapsedMs,
          receiptDigest: result.receiptDigest,
          reopened: true,
          deterministicReopen: true,
          exactReplay: "not-exercised-by-nominal-diagnostic",
          duplicateMaterialEffects: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          temporal: useTemporal ? "real" : "not-used",
          temporalCycles,
        });
      } finally {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    }
  }
  const summary = {
    status: "passed",
    purpose: "diagnostic-conformance-only",
    postgres: "real",
    temporal: useTemporal ? "real" : "not-used",
    scenarios: results,
    scenarioCount: results.length,
    executionPermitted: false,
    empiricalEvidenceProduced: false,
    productionReadinessEstablished: false,
  };
  if (cli.outputDirectory) {
    const outputDirectory = path.resolve(cli.outputDirectory);
    if (inside(root, outputDirectory))
      throw new TypeError("morphogenesis_beta1_nominal_output_must_be_external");
    const receipts = results.map((result) => {
      const scenarioId = `nominal-${result.branch === "recruit_existing" ? "recruit" : "create"}-${result.decisionRoute === "authorized_agent" ? "agent" : result.decisionRoute === "authorized_person" ? "person" : "quorum"}`;
      const metrics = {
        schemaVersion: 1,
        scenarioId,
        wall_time_ms: result.elapsedMs,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        estimated_cost_usd: result.estimatedCostUsd,
        morphology_churn_count: 1,
        mission_continuity_ratio: 1,
        duplicate_material_effect_count: result.duplicateMaterialEffects,
      };
      const body = {
        schemaVersion: 1,
        kind: "agentplat-agent-morphogenesis-beta1-scenario-receipt-v1",
        scenarioId,
        evidenceClass: "diagnostic-operational-conformance",
        status: "passed",
        sourceCommit: gitHead(),
        branch: result.branch,
        decisionRoute: result.decisionRoute,
        postgres: "real",
        temporal: result.temporal,
        domainReceiptDigest: result.receiptDigest,
        deterministicReopen: result.deterministicReopen,
        metrics,
        readinessEstablished: false,
        productionClaimPermitted: false,
      };
      return { ...body, receiptDigest: digest("morphogenesis-beta1-scenario-receipt-v1", body) };
    });
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeExclusive(path.join(outputDirectory, "nominal-receipts.jsonl"), jsonl(receipts)),
      writeExclusive(path.join(outputDirectory, "nominal-metrics.jsonl"), jsonl(receipts.map(({ metrics }) => metrics))),
      writeExclusive(path.join(outputDirectory, "nominal-summary.json"), `${JSON.stringify({ ...summary, receiptRoot: digest("morphogenesis-beta1-nominal-root-v1", receipts.map(({ receiptDigest }) => receiptDigest)) }, null, 2)}\n`),
    ]);
  }
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await clientConnection?.close();
  await nativeConnection?.close();
  await pool.end();
}

function parseOptions(args) {
  const result = { diagnosticOnly: false, temporal: false, outputDirectory: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (value === "--diagnostic-only") result.diagnosticOnly = true;
    else if (value === "--temporal") result.temporal = true;
    else if (value === "--output-directory" && index + 1 < args.length)
      result.outputDirectory = args[++index];
    else throw new TypeError("morphogenesis_beta1_postgres_nominal_option_invalid");
  }
  return result;
}

function gitHead() {
  return (
    process.env.AGENTPLAT_CANDIDATE_COMMIT ??
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  );
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

function jsonl(values) {
  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

async function writeExclusive(file, value) {
  await writeFile(file, value, { encoding: "utf8", flag: "wx" });
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function createInMemoryRollbackWitness() {
  const heads = new Map();
  const key = (input) => `${input.scopeId}:${input.stateKind}:${input.stateKey}`;
  return {
    async verify(input) {
      const current = heads.get(key(input));
      return current?.revision === input.revision && current?.digest === input.digest;
    },
    async record(input) {
      const stateKey = key(input);
      const current = heads.get(stateKey);
      if (
        (input.previousRevision === null && current !== undefined) ||
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
