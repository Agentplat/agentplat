#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

if (process.argv.includes("--contract-smoke")) {
  console.log(JSON.stringify({
    status: "passed",
    tenantCount: 3,
    missionsPerTenant: 2,
    executionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
  process.exit(0);
}
if (!process.argv.includes("--diagnostic-only"))
  throw new TypeError("staging_isolation_requires_diagnostic_only");
const outputDirectory = requiredOption("--output-directory");
const preserveSchema = process.argv.includes("--preserve-schema");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolvedOutput = path.resolve(outputDirectory);
if (inside(root, resolvedOutput))
  throw new TypeError("staging_isolation_output_must_be_external");

const pool = createPostgresPool({
  max: 8,
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
const schema = `morph_staging_isolation_${randomBytes(8).toString("hex")}`;
const witness = rollbackWitness();
const cases = Array.from({ length: 3 }, (_, tenantIndex) =>
  Array.from({ length: 2 }, (_, missionIndex) => ({
    tenantIndex: tenantIndex + 1,
    missionIndex: missionIndex + 1,
  })),
).flat();

try {
  await runCollectiveHostMigrations(pool, { schema, createSchema: true });
  await runWorkflowMigrations(pool, { schema, createSchema: false });
  const workflowStore = new PostgresWorkflowStoreV1(pool, { schema });
  const executions = [];
  for (const item of cases) {
    const tenantId = `tenant:staging-${item.tenantIndex}`;
    const missionId = `mission:staging-${item.tenantIndex}-${item.missionIndex}`;
    const scopeId = `${tenantId}:${missionId}`;
    const executionStateKey = `execution:isolation:${item.tenantIndex}:${item.missionIndex}`;
    const runId = `workflow:isolation:${item.tenantIndex}:${item.missionIndex}`;
    const store = new PostgresMorphogenesisExecutionStoreV1(pool, {
      schema,
      scopeId,
      rollbackWitness: witness,
    });
    const result = await runMorphogenesisExampleScenario(
      "recruit",
      item.missionIndex === 1 ? "authorized_agent" : "collective",
      {
        executionStore: store,
        workflowStore,
        executionStateKey,
        morphologyHeadStateKey: `head:isolation:${item.tenantIndex}:${item.missionIndex}`,
        runId,
        operationSuffix: `:${item.tenantIndex}:${item.missionIndex}`,
        scope: {
          tenantId,
          morphologyId: `morphology:isolation:${item.tenantIndex}:${item.missionIndex}`,
          policyDomainId: `policy-domain:staging-${item.tenantIndex}`,
          missionId,
          missionIntentId: `mission-intent:staging-${item.tenantIndex}-${item.missionIndex}`,
          objectiveId: `objective:staging-${item.tenantIndex}-${item.missionIndex}`,
          meshId: "mesh:staging-preflight",
          roomId: `room:staging-${item.tenantIndex}`,
          workItemId: `work:staging-${item.tenantIndex}-${item.missionIndex}`,
          workItemRevision: 1,
        },
      },
    );
    const retained = await store.load(executionStateKey);
    assert.equal(retained?.phase, "completed");
    assert.equal(retained.scope.tenantId, tenantId);
    assert.equal(retained.scope.missionId, missionId);
    assert.equal(retained.receipt?.scopeDigest, retained.scope.scopeDigest);
    assert.equal(retained.receipt?.receiptDigest, result.receiptDigest);
    executions.push({
      ...item,
      tenantId,
      missionId,
      scopeId,
      scopeDigest: retained.scope.scopeDigest,
      executionStateKey,
      runId,
      receiptDigest: result.receiptDigest,
      store,
    });
  }

  let attemptedCrossTenantReads = 0;
  let attemptedCrossMissionReads = 0;
  for (const owner of executions) {
    for (const candidate of executions) {
      if (owner === candidate) continue;
      const loaded = await owner.store.load(candidate.executionStateKey);
      assert.equal(loaded, null);
      if (owner.tenantId === candidate.tenantId) attemptedCrossMissionReads += 1;
      else attemptedCrossTenantReads += 1;
      if (owner.tenantId !== candidate.tenantId) {
        const wrongTenantRun = await workflowStore.getProcessRun(
          owner.tenantId,
          candidate.runId,
        );
        assert.equal(wrongTenantRun, undefined);
      }
    }
  }

  const stateRows = await pool.query(
    `SELECT scope_id, state_key, state_digest, state
       FROM "${schema}".collective_host_runtime_states
      WHERE state_kind = 'morphogenesis-execution'
      ORDER BY scope_id, state_key`,
  );
  assert.equal(stateRows.rowCount, 6);
  assert.equal(new Set(stateRows.rows.map(({ scope_id }) => scope_id)).size, 6);
  const workflowRows = await pool.query(
    `SELECT tenant_id, run_id, state
       FROM "${schema}".workflow_process_runs
      ORDER BY tenant_id, run_id`,
  );
  assert.equal(workflowRows.rowCount, 6);
  const durableStateRoot = digest({
    morphogenesis: stateRows.rows,
    workflows: workflowRows.rows,
  });
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-isolation-receipt-v1",
    status: "passed",
    evidenceClass: "single-host-staging-preflight",
    schema,
    tenantCount: 3,
    missionsPerTenant: 2,
    completedExecutions: executions.length,
    attemptedCrossTenantReads,
    attemptedCrossMissionReads,
    crossTenantReadsAccepted: 0,
    crossTenantWritesAccepted: 0,
    crossMissionAuthorityUsesAccepted: 0,
    crossScopeReceiptsAccepted: 0,
    durableStateRoot,
    receipts: executions.map(({ store: _store, ...execution }) => execution),
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const receipt = { ...body, receiptDigest: digest(body) };
  await mkdir(resolvedOutput, { recursive: true });
  await writeFile(
    path.join(resolvedOutput, "isolation-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (!preserveSchema)
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
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
        (input.previousRevision === null && current !== undefined) ||
        (input.previousRevision !== null &&
          (current?.revision !== input.previousRevision ||
            current?.digest !== input.previousDigest))
      ) return false;
      heads.set(key(input), {
        revision: input.nextRevision,
        digest: input.nextDigest,
      });
      return true;
    },
  };
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

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
