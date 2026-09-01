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

import { runMorphogenesisExampleScenario } from "../examples/agent-morphogenesis/demo.mjs";
import {
  PostgresMorphogenesisExecutionStoreV1,
  runMigrations as runHostMigrations,
} from "../packages/collective-host-postgres/dist/index.js";
import { createPostgresPool } from "../packages/postgres/dist/index.js";
import { InMemoryProcessRunnerV1 } from "../packages/workflows/dist/index.js";
import {
  PostgresWorkflowStoreV1,
  runMigrations as runWorkflowMigrations,
} from "../packages/workflows-postgres/dist/index.js";
import {
  TemporalProcessRunnerV1,
  TemporalWorkflowNotifierV1,
  createTemporalWorkflowActivitiesV1,
} from "../packages/workflows-temporal/dist/index.js";

const cli = parseOptions(process.argv.slice(2));
if (!cli.diagnosticOnly) throw new TypeError("morphogenesis_beta1_early_crashes_options_invalid");

const temporalAddress = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const native = await NativeConnection.connect({ address: temporalAddress });
const clientConnection = await Connection.connect({ address: temporalAddress });
const client = new Client({ connection: clientConnection });
const workflowsPath = fileURLToPath(
  new URL("../packages/workflows-temporal/dist/workflow.js", import.meta.url),
);
const pool = createPostgresPool({
  max: 4,
  ...(process.env.DATABASE_URL ? {} : { database: process.env.PGDATABASE ?? "postgres" }),
});
const results = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  for (const boundary of [
    "after-proposal-before-decision",
    "after-decision-before-prepare",
  ]) {
    const schema = `morph_b1_early_${randomBytes(8).toString("hex")}`;
    const witness = rollbackWitness();
    const workers = [];
    let gateStatus = "waiting";
    let activeRunner;
    let workerGeneration = 0;
    let temporalCycles = 0;
    try {
      await runHostMigrations(pool, { schema, createSchema: true });
      await runWorkflowMigrations(pool, { schema });
      const workflowStore = new PostgresWorkflowStoreV1(pool, { schema });
      const executionStore = new PostgresMorphogenesisExecutionStoreV1(pool, {
        schema,
        scopeId: `beta1:${boundary}`,
        rollbackWitness: witness,
      });
      const createRunner = async ({ runnerOptions, tenantId, runId }) => {
        workerGeneration += 1;
        const authoritative = new InMemoryProcessRunnerV1(workflowStore, {
          ...runnerOptions,
          workerId: `worker:${boundary}:${workerGeneration}`,
        });
        const taskQueue = `agentplat-morph-b1-early-${process.pid}-${boundary}`;
        const workflowId = `agentplat-morph-b1-early:${boundary}`;
        const delegated = createTemporalWorkflowActivitiesV1({ runner: authoritative });
        const worker = await Worker.create({
          connection: native,
          taskQueue,
          workflowsPath,
          activities: {
            async advanceProcess(input) {
              temporalCycles += 1;
              return delegated.advanceProcess(input);
            },
          },
        });
        const workerRun = worker.run();
        const runner = new TemporalProcessRunnerV1(
          authoritative,
          new TemporalWorkflowNotifierV1({
            client,
            taskQueue,
            workflowId: () => workflowId,
            rolloverAfterCycles: 2,
          }),
        );
        const value = { runner, registrar: authoritative, authoritative, worker, workerRun, workflowId };
        workers.push(value);
        activeRunner = value;
        return value;
      };
      const startedAt = performance.now();
      const result = await runMorphogenesisExampleScenario(
        "recruit",
        "authorized_agent",
        {
          workflowStore,
          executionStore,
          gateProvider: {
            async resolve() {
              return { status: gateStatus, gateRequestId: `gate:${boundary}` };
            },
          },
          processRunnerFactory: createRunner,
          afterWorkflowStart: async ({ started, runnerOptions, tenantId, runId }) => {
            const gate = started.run.stageStates.find(({ stageId }) => stageId === "decision_gate");
            assert.equal(gate.status, "waiting");
            assert.equal(started.run.stageStates.find(({ stageId }) => stageId === "prepare").status, "blocked");
            await stop(activeRunner);
            const reopened = new PostgresWorkflowStoreV1(pool, { schema });
            const retained = await reopened.getProcessRun(tenantId, runId);
            assert.equal(retained.stateDigest, started.run.stateDigest);
            gateStatus = "approved";
            const replacement = await createRunner({ runnerOptions, tenantId, runId });
            if (boundary === "after-decision-before-prepare") {
              const partial = await replacement.runner.advance({
                tenantId,
                runId,
                operationId: `advance:${boundary}:decision`,
                idempotencyKey: `advance:${boundary}:decision`,
                logicalTime: "2026-08-29T12:00:10.000Z",
                maximumTransitions: 2,
              });
              assert.equal(
                partial.run.stageStates.find(({ stageId }) => stageId === "prepare").status,
                "ready",
              );
              await stop(replacement);
              const secondReplacement = await createRunner({ runnerOptions, tenantId, runId });
              await secondReplacement.runner.advance({
                tenantId,
                runId,
                operationId: `advance:${boundary}:prepare`,
                idempotencyKey: `advance:${boundary}:prepare`,
                logicalTime: "2026-08-29T12:00:20.000Z",
              });
              return { runner: secondReplacement.runner };
            }
            await replacement.runner.advance({
              tenantId,
              runId,
              operationId: `advance:${boundary}:decision`,
              idempotencyKey: `advance:${boundary}:decision`,
              logicalTime: "2026-08-29T12:00:10.000Z",
            });
            return { runner: replacement.runner };
          },
          afterScenario: async () => {
            await client.workflow.getHandle(activeRunner.workflowId).result();
            await stop(activeRunner);
          },
        },
      );
      results.push({
        boundary,
        status: "passed",
        receiptDigest: result.receiptDigest,
        workerGenerations: workerGeneration,
        temporalCycles,
        wallTimeMs: Math.round(performance.now() - startedAt),
        duplicateMaterialEffects: 0,
      });
    } finally {
      for (const worker of workers) await stop(worker);
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  }
  const summary = {
    status: "passed",
    purpose: "diagnostic-conformance-only",
    postgres: "real",
    temporal: "real",
    results,
    operationalEvidenceProduced: false,
    campaignClosureEligible: false,
  };
  if (cli.outputDirectory) {
    const outputDirectory = path.resolve(cli.outputDirectory);
    if (inside(root, outputDirectory))
      throw new TypeError("morphogenesis_beta1_early_output_must_be_external");
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const receipts = results.map((result) => {
      const scenarioId = `crash-${result.boundary}`;
      const metrics = {
        schemaVersion: 1,
        scenarioId,
        wall_time_ms: result.wallTimeMs,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
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
        sourceCommit,
        postgres: "real",
        temporal: "real",
        crashBoundary: result.boundary,
        workerGenerations: result.workerGenerations,
        temporalCycles: result.temporalCycles,
        domainReceiptDigest: result.receiptDigest,
        metrics,
        readinessEstablished: false,
        productionClaimPermitted: false,
      };
      return { ...body, receiptDigest: digest("morphogenesis-beta1-scenario-receipt-v1", body) };
    });
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeExclusive(path.join(outputDirectory, "early-crash-receipts.jsonl"), jsonl(receipts)),
      writeExclusive(path.join(outputDirectory, "early-crash-metrics.jsonl"), jsonl(receipts.map(({ metrics }) => metrics))),
      writeExclusive(path.join(outputDirectory, "early-crash-summary.json"), `${JSON.stringify({ ...summary, receiptRoot: digest("morphogenesis-beta1-early-crash-root-v1", receipts.map(({ receiptDigest }) => receiptDigest)) }, null, 2)}\n`),
    ]);
  }
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await pool.end();
  await clientConnection.close();
  await native.close();
}

function parseOptions(args) {
  const result = { diagnosticOnly: false, outputDirectory: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (value === "--diagnostic-only") result.diagnosticOnly = true;
    else if (value === "--output-directory" && index + 1 < args.length)
      result.outputDirectory = args[++index];
    else throw new TypeError("morphogenesis_beta1_early_crashes_option_invalid");
  }
  return result;
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

async function stop(value) {
  if (!value || value.stopped) return;
  value.stopped = true;
  value.worker.shutdown();
  await value.workerRun;
}

function rollbackWitness() {
  const heads = new Map();
  const key = (input) => `${input.scopeId}:${input.stateKind}:${input.stateKey}`;
  return {
    async verify(input) {
      const current = heads.get(key(input));
      return current?.revision === input.revision && current?.digest === input.digest;
    },
    async record(input) {
      const current = heads.get(key(input));
      if (
        (input.previousRevision === null && current) ||
        (input.previousRevision !== null &&
          (current?.revision !== input.previousRevision || current?.digest !== input.previousDigest))
      ) return false;
      heads.set(key(input), { revision: input.nextRevision, digest: input.nextDigest });
      return true;
    },
  };
}
