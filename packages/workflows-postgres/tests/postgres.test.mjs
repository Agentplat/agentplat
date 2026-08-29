import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  InMemoryProcessRunnerV1,
  WorkflowOutcomeRuntimeV1,
  createProcessDefinitionV1,
  createTaskDefinitionV1,
  createTaskExecutionBindingV1,
  createTaskRunV1,
  digestWorkflowJsonV1,
  transitionTaskRunV1,
} from "@agentplat/workflows";
import {
  assertWorkflowConformancePassedV1,
  runWorkflowConformanceV1,
} from "@agentplat/workflows-conformance";
import { Pool } from "pg";

import {
  PostgresTaskOutcomeStoreV1,
  PostgresWorkflowStoreV1,
  getMigrationStatus,
  migrationDirectory,
  rollbackMigrations,
  runMigrations,
} from "../dist/index.js";

const integration = process.env.AGENTPLAT_POSTGRES_TEST === "1";

test("repository construction and migration import perform no I/O", async () => {
  const pool = new Pool({
    connectionString: "postgresql://invalid.invalid/unused",
  });
  assert.doesNotThrow(
    () => new PostgresWorkflowStoreV1(pool, { schema: "workflow_import" }),
  );
  assert.doesNotThrow(
    () => new PostgresTaskOutcomeStoreV1(pool, { schema: "workflow_import" }),
  );
  await assert.rejects(
    rollbackMigrations(pool, {
      schema: "workflow_import",
      expectedCurrentVersion: 1,
      confirm: "invalid",
      allowDataLoss: true,
    }),
    /verified external backup/u,
  );
  await pool.end();
});

test("migration declares all authoritative V1 workflow records", async () => {
  const sql = await readFile(
    `${migrationDirectory}/001_governed_workflows.up.sql`,
    "utf8",
  );
  for (const table of [
    "workflow_task_definitions",
    "workflow_process_definitions",
    "workflow_process_runs",
    "workflow_transition_events",
    "workflow_task_runs",
    "workflow_operations",
    "workflow_signals",
    "workflow_outcomes",
    "workflow_gate_requests",
    "workflow_outcome_expectations",
    "workflow_projection_checkpoints",
  ])
    assert.match(sql, new RegExp(`CREATE TABLE .*${table}`, "u"));
  assert.match(sql, /UNIQUE \(tenant_id, idempotency_key\)/u);
});

test(
  "PostgreSQL preserves workflow, task and outcome state across restart",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `workflows_${randomUUID().replaceAll("-", "")}`;
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        1,
      );
      assert.deepEqual(
        (await getMigrationStatus(pool, { schema })).pendingVersions,
        [],
      );
      const store = new PostgresWorkflowStoreV1(pool, { schema });
      const taskDefinition = createTaskDefinitionV1({
        taskDefinitionId: "task:prepare",
        version: "1",
        name: "Prepare",
        handlerKey: "handler:prepare",
        handlerDigest: digestWorkflowJsonV1("test-handler", "prepare"),
        effectClass: "internal",
      });
      const processDefinition = createProcessDefinitionV1({
        processId: "process:durable",
        version: "1",
        name: "Durable process",
        stages: [
          {
            schemaVersion: 1,
            stageId: "prepare",
            name: "Prepare",
            kind: "task",
            taskDefinitionId: "task:prepare",
            taskDefinitionVersion: "1",
            dependsOn: [],
          },
          {
            schemaVersion: 1,
            stageId: "wait",
            name: "Wait",
            kind: "await_signal",
            signalType: "fact.available",
            dependsOn: [{ stageId: "prepare", outcomes: ["succeeded"] }],
          },
        ],
      });
      const calls = [];
      const first = new InMemoryProcessRunnerV1(store, {
        taskExecutor: {
          async execute(input) {
            calls.push(input.idempotencyKey);
            return {
              status: "completed",
              result: { prepared: true },
              usage: {
                inputTokens: 2,
                outputTokens: 1,
                totalTokens: 3,
                cost: { currency: "USD", micros: 5 },
              },
            };
          },
        },
      });
      await first.registerTaskDefinition("tenant-a", taskDefinition);
      await first.registerProcessDefinition("tenant-a", processDefinition);
      const started = await first.start({
        tenantId: "tenant-a",
        runId: "run-a",
        processId: "process:durable",
        processVersion: "1",
        operationId: "operation:start",
        idempotencyKey: "start",
        subject: { subjectType: "case", subjectId: "case-a" },
        logicalTime: "2026-08-28T12:00:00.000Z",
      });
      assert.equal(started.run.status, "waiting");
      assert.equal(calls.length, 1);

      const restartedStore = new PostgresWorkflowStoreV1(pool, { schema });
      const restarted = new InMemoryProcessRunnerV1(restartedStore, {
        taskExecutor: {
          async execute() {
            throw new Error("completed task must not execute after restart");
          },
        },
      });
      const completed = await restarted.signal({
        tenantId: "tenant-a",
        runId: "run-a",
        operationId: "operation:signal",
        idempotencyKey: "signal",
        logicalTime: "2026-08-28T12:00:01.000Z",
        signal: {
          signalId: "signal-a",
          signalType: "fact.available",
          sourceType: "test",
          sourceId: "source-a",
          receivedAt: "2026-08-28T12:00:01.000Z",
        },
      });
      assert.equal(completed.run.status, "completed");
      assert.equal(calls.length, 1);
      assert.equal(
        (await restarted.describe({ tenantId: "tenant-a", runId: "run-a" }))
          .status,
        "completed",
      );
      const [taskRun] = await restartedStore.listTaskRuns({
        tenantId: "tenant-a",
      });
      assert.equal(taskRun.status, "completed");
      assert.equal(taskRun.usage.totalTokens, 3);

      const outcomeStore = new PostgresTaskOutcomeStoreV1(pool, { schema });
      const outcomeRuntime = new WorkflowOutcomeRuntimeV1(
        restartedStore,
        outcomeStore,
      );
      const outcome = {
        tenantId: "tenant-a",
        outcomeId: "outcome-a",
        taskRunId: taskRun.taskRunId,
        taskExecutionBindingDigest: taskRun.binding.bindingDigest,
        outcomeType: "quality.verdict",
        verdict: "positive",
        sourceType: "human",
        sourceId: "reviewer-a",
        observedAt: "2026-08-29T12:00:00.000Z",
        recordedAt: "2026-08-29T12:00:00.000Z",
        evidenceReferenceIds: [],
      };
      assert.equal(
        (await outcomeRuntime.record(outcome)).disposition,
        "created",
      );
      assert.equal(
        (await outcomeRuntime.record(outcome)).disposition,
        "replayed",
      );
      const restartedOutcomes = new PostgresTaskOutcomeStoreV1(pool, {
        schema,
      });
      assert.equal(
        (await restartedOutcomes.getOutcome("tenant-a", "outcome-a")).verdict,
        "positive",
      );

      const manual = createTaskRunV1({
        tenantId: "tenant-a",
        taskRunId: "task-run:manual",
        processRunId: "run-a",
        stageId: "manual",
        attempt: 1,
        idempotencyKey: "manual",
        inputDigest: digestWorkflowJsonV1("test-input", "manual"),
        binding: createTaskExecutionBindingV1(taskDefinition),
        leaseOwnerId: "worker:manual",
        leaseToken: "lease:manual:0",
        leaseGeneration: 0,
        leaseExpiresAt: "2026-08-30T12:01:00.000Z",
        logicalTime: "2026-08-30T12:00:00.000Z",
      });
      assert.equal(await restartedStore.createTaskRun(manual), true);
      assert.deepEqual(
        (
          await restartedStore.listExpiredTaskRuns({
            tenantId: "tenant-a",
            logicalTime: "2026-08-30T12:01:00.000Z",
          })
        ).map((run) => run.taskRunId),
        [manual.taskRunId],
      );
      const running = transitionTaskRunV1(manual, {
        status: "running",
        logicalTime: "2026-08-30T12:00:01.000Z",
      });
      const races = await Promise.all([
        restartedStore.compareAndSetTaskRun({
          expectedRevision: manual.revision,
          expectedStateDigest: manual.stateDigest,
          run: running,
        }),
        restartedStore.compareAndSetTaskRun({
          expectedRevision: manual.revision,
          expectedStateDigest: manual.stateDigest,
          run: running,
        }),
      ]);
      assert.deepEqual(races.sort(), [false, true]);
    } finally {
      await pool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await pool.end();
    }
  },
);

test(
  "PostgreSQL passes the complete workflow conformance suite including reopen",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const prefix = `workflow_conf_${randomUUID().replaceAll("-", "")}`;
    const createdSchemas = [];
    let ordinal = 0;
    try {
      const report = await runWorkflowConformanceV1({
        implementationId: "agentplat.postgres-workflow",
        implementationVersion: "1",
        implementationDigest: digestWorkflowJsonV1(
          "conformance-implementation",
          "postgres-v1",
        ),
        capabilities: [
          "outcomes.delayed",
          "persistence.restart",
          "runner.cancellation",
          "runner.core",
          "runner.gates",
          "task.integrity",
          "task.leases",
        ],
        destructiveTestConsent: true,
        factory: {
          async create() {
            ordinal += 1;
            const schema = `${prefix}_${ordinal}`;
            createdSchemas.push(schema);
            await runMigrations(pool, { schema, createSchema: true });
            const stageIds = [];
            const gateResults = new Map();
            const control = {
              taskExecutor: {
                async execute(input) {
                  stageIds.push(input.stage.stageId);
                  return {
                    status: "completed",
                    result: { completed: true },
                    usage: {
                      inputTokens: 2,
                      outputTokens: 1,
                      totalTokens: 3,
                      durationMs: 5,
                    },
                  };
                },
              },
              gateProvider: {
                async resolve(input) {
                  return (
                    gateResults.get(input.stageId) ?? {
                      status: "waiting",
                      gateRequestId: `gate:${input.stageId}`,
                    }
                  );
                },
              },
              setGateResult(stageId, result) {
                gateResults.set(stageId, result);
              },
              taskExecutionStageIds() {
                return [...stageIds];
              },
            };
            const open = async () => {
              const store = new PostgresWorkflowStoreV1(pool, { schema });
              return {
                store,
                outcomes: new PostgresTaskOutcomeStoreV1(pool, { schema }),
                runner: new InMemoryProcessRunnerV1(store, {
                  taskExecutor: control.taskExecutor,
                  gateProvider: control.gateProvider,
                }),
                control,
              };
            };
            return {
              open,
              reopen: open,
              async cleanup() {
                await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
              },
            };
          },
        },
        seed: 23,
        caseTimeoutMs: 20_000,
        clock: () => new Date("2026-08-28T12:00:00.000Z"),
      });
      assert.equal(report.passed, 9);
      assert.equal(report.failed, 0);
      assert.equal(report.skipped, 0);
      assertWorkflowConformancePassedV1(report);
    } finally {
      for (const schema of createdSchemas)
        await pool
          .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
          .catch(() => undefined);
      await pool.end();
    }
  },
);
