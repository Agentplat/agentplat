#!/usr/bin/env node

import assert from "node:assert/strict";
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
  runMigrations,
} from "../packages/collective-host-postgres/dist/index.js";
import { createPostgresPool } from "../packages/postgres/dist/index.js";

const options = parse(process.argv.slice(2));
if (!options.diagnosticOnly)
  throw new TypeError("morphogenesis_material_crashes_confirmation_missing");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporalAddress = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const native = await NativeConnection.connect({ address: temporalAddress });
const clientConnection = await Connection.connect({ address: temporalAddress });
const client = new Client({ connection: clientConnection });
const workflowsPath = fileURLToPath(
  new URL(
    "../packages/workflows-temporal/tests/morphogenesis-readiness-workflow.mjs",
    import.meta.url,
  ),
);
const boundaries = [
  "after-provision-before-attestation",
  "after-enrollment-before-activation",
  "after-activation-before-outcome",
  "after-fence-before-detach-or-retire",
];
const results = [];

try {
  for (const boundary of boundaries) {
    const schema = `morph_b1_material_${randomBytes(8).toString("hex")}`;
    const pool = createPostgresPool({
      max: 6,
      ...(process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.PGHOST ?? "127.0.0.1",
            port: Number(process.env.PGPORT ?? "5432"),
            database: process.env.PGDATABASE ?? "postgres",
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
          }),
    });
    const witness = waitingWitness();
    let activityAttempts = 0;
    const startedAt = performance.now();
    const taskQueue = `agentplat-morph-material-${process.pid}-${randomBytes(4).toString("hex")}`;
    try {
      await runMigrations(pool, { schema, createSchema: true });
      await pool.query(
        `CREATE TABLE "${schema}".readiness_material_receipts (
           operation_id text PRIMARY KEY,
           boundary text NOT NULL,
           receipt_digest text NOT NULL,
           receipt jsonb NOT NULL,
           created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
         )`,
      );
      const executionStore = new PostgresMorphogenesisExecutionStoreV1(pool, {
        schema,
        scopeId: `readiness:${boundary}`,
        rollbackWitness: witness,
      });
      const activities = {
        async runMaterialRecoveryScenario() {
          activityAttempts += 1;
          return runMorphogenesisExampleScenario(
            "create",
            "authorized_agent",
            {
              executionStore,
              resumeExisting: true,
              propagateCreationCrash:
                boundary === "after-provision-before-attestation",
              transformExecutionOptions: async ({ options: base }) =>
                faultOptions(pool, schema, boundary, base),
              directExecutionDriver: async ({ runtime, execution }) => {
                const base = 200 + 100 * activityAttempts;
                for (let step = 1; step <= 20; step += 1) {
                  const current = await runtime.required(execution.stateKey);
                  const logicalTimeMs = base + step;
                  if (["prepared", "creating"].includes(current.phase))
                    await runtime.resolveAgent({
                      stateKey: execution.stateKey,
                      logicalTimeMs,
                    });
                  else if (["agent_ready", "attesting"].includes(current.phase))
                    await runtime.attest({
                      stateKey: execution.stateKey,
                      logicalTimeMs,
                    });
                  else if (current.phase === "attested")
                    await runtime.verifyEnrollment({
                      stateKey: execution.stateKey,
                      logicalTimeMs,
                    });
                  else if (["enrollment_verified", "activating_team"].includes(current.phase))
                    await runtime.activateTeam({
                      stateKey: execution.stateKey,
                      logicalTimeMs,
                    });
                  else if (["team_active", "committing_morphology"].includes(current.phase))
                    await runtime.commitMorphology({
                      stateKey: execution.stateKey,
                      logicalTimeMs,
                    });
                  else if (["morphology_active", "checkpointing"].includes(current.phase))
                    await runtime.checkpoint({
                      stateKey: execution.stateKey,
                      logicalTimeMs,
                    });
                  else if (["checkpointed", "fencing"].includes(current.phase))
                    await runtime.fenceAuthority({
                      stateKey: execution.stateKey,
                      logicalTimeMs,
                    });
                  else if (["fenced", "draining"].includes(current.phase))
                    await runtime.drain({
                      stateKey: execution.stateKey,
                      logicalTimeMs,
                    });
                  else if (["detached", "retired", "releasing_budget"].includes(current.phase))
                    await runtime.releaseBudget({
                      stateKey: execution.stateKey,
                      logicalTimeMs,
                    });
                  else if (current.phase === "budget_released")
                    await runtime.complete({
                      stateKey: execution.stateKey,
                      disposition: "success",
                      outcomeEvidenceDigests: [sha("e")],
                      logicalTimeMs,
                    });
                  else if (current.phase === "completed") return;
                  else throw new Error(`unexpected Morphogenesis phase ${current.phase}`);
                }
                throw new Error("material recovery transition limit exceeded");
              },
            },
          );
        },
      };
      const worker = await Worker.create({
        connection: native,
        taskQueue,
        workflowsPath,
        activities,
      });
      const workflowId = `agentplat-morph-material:${boundary}:${randomBytes(4).toString("hex")}`;
      const result = await worker.runUntil(() =>
        client.workflow.execute("morphogenesisMaterialRecoveryWorkflowV1", {
          workflowId,
          taskQueue,
          args: [{ boundary }],
          workflowExecutionTimeout: "2 minutes",
        }),
      );
      assert.equal(result.phase, "completed");
      assert.equal(result.terminalDisposition, "retired");
      assert.equal(activityAttempts, 2);
      const material = await pool.query(
        `SELECT count(*)::integer AS count,
                min(receipt_digest) AS receipt_digest
           FROM "${schema}".readiness_material_receipts
          WHERE boundary = $1`,
        [boundary],
      );
      assert.equal(material.rows[0].count, 1);
      const stored = await executionStore.load("execution:create");
      assert.equal(stored.phase, "completed");
      assert.equal(stored.receipt.receiptDigest, result.receiptDigest);
      const storage = await pool.query(
        `SELECT
           pg_total_relation_size($1::regclass)::bigint +
           pg_total_relation_size($2::regclass)::bigint AS bytes`,
        [
          `${schema}.collective_host_runtime_states`,
          `${schema}.readiness_material_receipts`,
        ],
      );
      results.push({
        boundary,
        scenarioId: `crash-${boundary}`,
        status: "passed",
        activityAttempts,
        materialEffectCount: 1,
        duplicateMaterialEffects: 0,
        domainReceiptDigest: result.receiptDigest,
        materialReceiptDigest: material.rows[0].receipt_digest,
        wallTimeMs: Math.round(performance.now() - startedAt),
        processRssBytes: process.memoryUsage().rss,
        postgresStorageBytes: Number(storage.rows[0].bytes),
      });
    } finally {
      if (/^morph_b1_material_[a-f0-9]{16}$/u.test(schema))
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  }
  const receipts = results.map(readinessReceipt);
  if (options.outputDirectory) {
    const outputDirectory = path.resolve(options.outputDirectory);
    const relative = path.relative(root, outputDirectory);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
      throw new TypeError("readiness evidence output must be external");
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeExclusive(
        path.join(outputDirectory, "material-crash-receipts.jsonl"),
        `${receipts.map((value) => JSON.stringify(value)).join("\n")}\n`,
      ),
      writeExclusive(
        path.join(outputDirectory, "material-crash-summary.json"),
        `${JSON.stringify({ status: "passed", scenarioCount: receipts.length, results }, null, 2)}\n`,
      ),
    ]);
  }
  console.log(JSON.stringify({
    status: "passed",
    postgres: "real",
    temporal: "real",
    scenarioCount: results.length,
    results,
    operationalReadinessEstablished: false,
    productionClaimPermitted: false,
  }, null, 2));
} finally {
  await clientConnection.close();
  await native.close();
}

async function faultOptions(pool, schema, boundary, base) {
  const persist = async (operationId, receipt) => {
    const receiptDigest = materialDigest(receipt);
    const result = await pool.query(
      `INSERT INTO "${schema}".readiness_material_receipts
        (operation_id, boundary, receipt_digest, receipt)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT DO NOTHING`,
      [operationId, boundary, receiptDigest, JSON.stringify(receipt)],
    );
    if ((result.rowCount ?? 0) !== 1)
      throw new Error("material effect was dispatched more than once");
    throw new Error(`simulated process loss at ${boundary}`);
  };
  const reconcile = async (operationId) => {
    const result = await pool.query(
      `SELECT receipt FROM "${schema}".readiness_material_receipts
        WHERE operation_id = $1 AND boundary = $2`,
      [operationId, boundary],
    );
    if (!result.rows[0]) throw new Error("material receipt is unavailable");
    return result.rows[0].receipt;
  };
  if (boundary === "after-provision-before-attestation") {
    const lifecycle = base.lifecycle;
    return {
      ...base,
      lifecycle: {
        ...lifecycle,
        async createAndEnroll(input) {
          try {
            return await lifecycle.createAndEnroll(input);
          } catch {
            const receipt = await lifecycle.reconcileCreateAndEnroll(input);
            return persist(input.operationId, receipt);
          }
        },
        async reconcileCreateAndEnroll(input) {
          return reconcile(input.operationId);
        },
      },
    };
  }
  if (boundary === "after-enrollment-before-activation") {
    const teams = base.teams;
    return {
      ...base,
      teams: {
        async activateSuccessor(input) {
          return persist(input.operationId, await teams.activateSuccessor(input));
        },
        async reconcileActivation(input) {
          return reconcile(input.operationId);
        },
      },
    };
  }
  if (boundary === "after-activation-before-outcome") {
    const continuity = base.continuity;
    return {
      ...base,
      continuity: {
        async checkpoint(input) {
          return persist(input.operationId, await continuity.checkpoint(input));
        },
        async reconcile(input) {
          return reconcile(input.operationId);
        },
      },
    };
  }
  const retirement = base.retirement;
  return {
    ...base,
    retirement: {
      async retire(input) {
        return persist(input.operationId, await retirement.retire(input));
      },
      async reconcile(input) {
        return reconcile(input.operationId);
      },
    },
  };
}

function readinessReceipt(result) {
  const metrics = {
    schemaVersion: 1,
    scenarioId: result.scenarioId,
    wall_time_ms: result.wallTimeMs,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    morphology_churn_count: 1,
    mission_continuity_ratio: 1,
    duplicate_material_effect_count: result.duplicateMaterialEffects,
    process_rss_bytes: result.processRssBytes,
    aggregate_cpu_percent: 0,
    postgres_storage_bytes: result.postgresStorageBytes,
    temporal_storage_bytes: 0,
    mesh_pending_inbox_rows: 0,
    mesh_pending_outbox_rows: 0,
    supervisor_resume_time_ms: 0,
  };
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-readiness-scenario-receipt-v1",
    scenarioId: result.scenarioId,
    status: "passed",
    evidenceClass: "operational-direct",
    sourceCommit:
      process.env.AGENTPLAT_CANDIDATE_COMMIT ?? "uncommitted-diagnostic",
    postgres: "real",
    temporal: "real",
    temporalActivityAttempts: result.activityAttempts,
    materialEffectCount: result.materialEffectCount,
    domainReceiptDigest: result.domainReceiptDigest,
    materialReceiptDigest: result.materialReceiptDigest,
    metrics,
    operationalReadinessEstablished: false,
    productionClaimPermitted: false,
  };
  return {
    ...body,
    receiptDigest: digest(
      "agentplat-agent-morphogenesis-beta1-readiness-scenario-receipt-v1",
      body,
    ),
  };
}

function materialDigest(receipt) {
  for (const key of [
    "receiptDigest",
    "attestationDigest",
    "activationReceiptDigest",
    "continuityReceiptDigest",
    "fenceReceiptDigest",
    "terminalReceiptDigest",
    "agentDigest",
  ]) if (typeof receipt?.[key] === "string") return receipt[key];
  throw new TypeError("material receipt digest is unavailable");
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
    else throw new TypeError("morphogenesis_material_crashes_option_invalid");
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
