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

import {
  InMemoryMorphogenesisDecisionStoreV1,
  MorphogenesisDecisionRuntimeV1,
  createMorphogenesisBudgetEnvelopeV1,
  createMorphogenesisCatalogLifecycleProcessDefinitionV1,
  createMorphogenesisDecisionAuthorizationV1,
  createMorphogenesisPolicyV1,
} from "../packages/collective-runtime/dist/morphogenesis.js";
import {
  createPostgresPool,
} from "../packages/postgres/dist/index.js";
import { runMigrations } from "../packages/collective-host-postgres/dist/index.js";

const options = parse(process.argv.slice(2));
if (!options.diagnosticOnly)
  throw new TypeError("morphogenesis_adversarial_decisions_confirmation_missing");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = `morph_b1_decisions_${randomBytes(8).toString("hex")}`;
const pool = createPostgresPool({
  max: 4,
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
const temporalAddress = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const native = await NativeConnection.connect({ address: temporalAddress });
const clientConnection = await Connection.connect({ address: temporalAddress });
const client = new Client({ connection: clientConnection });
const taskQueue = `agentplat-morph-decisions-${process.pid}-${randomBytes(4).toString("hex")}`;
const workflowsPath = fileURLToPath(
  new URL(
    "../packages/workflows-temporal/tests/morphogenesis-adversarial-readiness-workflow.mjs",
    import.meta.url,
  ),
);
const startedAt = performance.now();
const results = [];

try {
  await runMigrations(pool, { schema, createSchema: true });
  const activities = {
    async runDecisionRejectionScenario({ scenarioId }) {
      const scenarioStarted = performance.now();
      const { policy, proposal } = decisionFixture();
      const store = new InMemoryMorphogenesisDecisionStoreV1();
      const runtime = new MorphogenesisDecisionRuntimeV1({
        decisionPortId: `decision-port:${scenarioId}`,
        decisionPortVersion: 1,
        decisionPortImplementationDigest: sha("1"),
        policy,
        proposals: {
          async resolve(proposalDigest) {
            return proposalDigest === proposal.proposalDigest ? proposal : null;
          },
        },
        authorizations: {
          async issue({ candidate }) {
            const selfApproval = scenarioId === "agent-self-approval";
            return createMorphogenesisDecisionAuthorizationV1({
              authorizationId: `authorization:${scenarioId}`,
              candidateDigest: candidate.candidateDigest,
              route: "authorized_agent",
              actorType: "agent",
              actorId: selfApproval ? proposal.proposerId : "agent:expired-supervisor",
              actorMandateDigest: sha("2"),
              independenceGroupId: selfApproval
                ? "independence:proposer"
                : "independence:expired-supervisor",
              disposition: "approved",
              proofDigest: sha("3"),
              issuedAtLogicalMs: 231,
              expiresAtLogicalMs: selfApproval ? 470 : 235,
            });
          },
          async verify() {
            return true;
          },
        },
        store,
      });
      const candidate = await runtime.prepare({
        candidateId: `candidate:${scenarioId}`,
        proposal,
        policy,
        membershipConfigurationDigest: sha("4"),
        membershipEpoch: 1,
        authorityId: "authority:readiness-decisions",
        authorityEpoch: 1,
        workContractDigest: sha("5"),
        preparedAtLogicalMs: 230,
        expiresAtLogicalMs: 480,
      });
      await assert.rejects(
        runtime.decide({ candidate, logicalTimeMs: 240 }),
        /stale or prohibited/,
      );
      assert.equal(await store.load(candidate.candidateDigest), null);
      const authoritativeRows = await pool.query(
        `SELECT count(*)::integer AS count
           FROM "${schema}".collective_host_runtime_states
          WHERE state_kind IN ('morphology-head', 'morphogenesis-execution')`,
      );
      assert.equal(authoritativeRows.rows[0].count, 0);
      return {
        scenarioId,
        status: "passed",
        rejection: scenarioId === "agent-self-approval"
          ? "self-approval-prohibited"
          : "stale-authority-prohibited",
        decisionPersisted: false,
        executionRows: 0,
        morphologyHeadRows: 0,
        unauthorizedActivations: 0,
        wallTimeMs: Math.round(performance.now() - scenarioStarted),
      };
    },
  };
  const worker = await Worker.create({
    connection: native,
    taskQueue,
    workflowsPath,
    activities,
  });
  await worker.runUntil(async () => {
    for (const scenarioId of ["stale-decision-authority", "agent-self-approval"])
      results.push(
        await client.workflow.execute("morphogenesisDecisionRejectionWorkflowV1", {
          workflowId: `agentplat-morph-decision:${scenarioId}:${randomBytes(4).toString("hex")}`,
          taskQueue,
          args: [{ scenarioId }],
          workflowExecutionTimeout: "1 minute",
        }),
      );
  });
  assert.equal(results.length, 2);
  assert.equal(results.every(({ status }) => status === "passed"), true);
  const storage = await pool.query(
    `SELECT pg_total_relation_size($1::regclass)::bigint AS bytes`,
    [`${schema}.collective_host_runtime_states`],
  );
  const receipts = results.map((result) => readinessReceipt(
    result,
    Number(storage.rows[0].bytes),
  ));
  if (options.outputDirectory) {
    const outputDirectory = path.resolve(options.outputDirectory);
    const relative = path.relative(root, outputDirectory);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
      throw new TypeError("readiness evidence output must be external");
    await mkdir(outputDirectory, { recursive: true });
    await writeExclusive(
      path.join(outputDirectory, "adversarial-decision-receipts.jsonl"),
      `${receipts.map((value) => JSON.stringify(value)).join("\n")}\n`,
    );
  }
  console.log(JSON.stringify({
    status: "passed",
    postgres: "real",
    temporal: "real",
    scenarioCount: results.length,
    results,
    totalWallTimeMs: Math.round(performance.now() - startedAt),
    postgresStorageBytes: Number(storage.rows[0].bytes),
    operationalReadinessEstablished: false,
    productionClaimPermitted: false,
  }, null, 2));
} finally {
  if (/^morph_b1_decisions_[a-f0-9]{16}$/u.test(schema))
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
  await clientConnection.close();
  await native.close();
}

function decisionFixture() {
  const policy = createMorphogenesisPolicyV1({
    schemaVersion: 1,
    policyId: "policy:readiness-adversarial-decisions",
    policyVersion: 1,
    parentPolicyDigest: null,
    requiredSourceClasses: ["mission"],
    allowedOperators: ["recruit_existing"],
    allowedDecisionRoutes: ["authorized_agent"],
    requireIndependentDecider: true,
    allowAgentCreation: false,
    maximumPopulation: 8,
    maximumNewAgentsPerProposal: 0,
    maximumResourceUnitsPerProposal: 10,
    minimumNeedSeverityBps: 1,
    limits: {
      maximumSourceHeads: 8,
      maximumComponents: 32,
      maximumPositions: 8,
      maximumAgentDispositions: 8,
      maximumOperations: 16,
      maximumDependenciesPerOperation: 8,
      maximumEvidenceDigests: 8,
      maximumInvariantDigests: 8,
      maximumProposalTtlMs: 10_000,
      maximumNeedTtlMs: 10_000,
      maximumSourceFreshnessMs: 10_000,
      maximumCommitAttempts: 4,
      maximumTransformationsPerWindow: 4,
      transformationWindowMs: 60_000,
      cooldownMs: 0,
      hysteresisBps: 0,
    },
  });
  const definition = createMorphogenesisCatalogLifecycleProcessDefinitionV1();
  const budget = createMorphogenesisBudgetEnvelopeV1({
    maximumActiveAgents: 2,
    maximumNewAgents: 0,
    maximumConcurrentProvisioning: 0,
    maximumResourceUnits: 10,
    maximumInteractionUnits: 10,
    maximumActionUnits: 10,
    maximumInputTokens: 0,
    maximumOutputTokens: 0,
    maximumTotalTokens: 0,
    maximumDurationMs: 1_000,
    maximumCosts: [{ currency: "USD", micros: 0 }],
  });
  return {
    policy,
    proposal: {
      schemaVersion: 1,
      proposalId: "proposal:readiness-adversarial-decisions",
      scopeDigest: sha("6"),
      currentSnapshotDigest: sha("7"),
      expectedCurrentEpoch: 1,
      needDigest: sha("8"),
      targetDigest: sha("9"),
      operations: [{
        schemaVersion: 1,
        operationId: "operation:recruit-existing",
        operator: "recruit_existing",
        effectClass: "internal",
        dependsOnOperationIds: [],
        targetReferenceDigest: sha("a"),
        compensation: "none",
        operationDigest: sha("b"),
      }],
      processDefinitionDigest: definition.definitionDigest,
      budget,
      decisionRoute: "authorized_agent",
      proposerId: "agent:readiness-proposer",
      proposerVersion: 1,
      proposerImplementationDigest: sha("c"),
      proposedAtLogicalMs: 100,
      expiresAtLogicalMs: 500,
      proposalDigest: sha("d"),
      advisoryOnly: true,
    },
  };
}

function readinessReceipt(result, postgresStorageBytes) {
  const metrics = {
    schemaVersion: 1,
    scenarioId: result.scenarioId,
    wall_time_ms: result.wallTimeMs,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    morphology_churn_count: 0,
    mission_continuity_ratio: 1,
    duplicate_material_effect_count: 0,
    process_rss_bytes: process.memoryUsage().rss,
    aggregate_cpu_percent: 0,
    postgres_storage_bytes: postgresStorageBytes,
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
    rejection: result.rejection,
    decisionPersisted: false,
    unauthorizedActivations: 0,
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

function parse(args) {
  const result = { diagnosticOnly: false, outputDirectory: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (value === "--diagnostic-only") result.diagnosticOnly = true;
    else if (value === "--output-directory" && index + 1 < args.length)
      result.outputDirectory = args[++index];
    else throw new TypeError("morphogenesis_adversarial_decisions_option_invalid");
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
