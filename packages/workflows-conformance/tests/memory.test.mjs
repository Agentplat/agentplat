import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryProcessRunnerV1,
  InMemoryWorkflowStoreV1,
  digestWorkflowJsonV1,
} from "@agentplat/workflows";
import { InMemoryTaskOutcomeStoreV1 } from "@agentplat/workflows/outcomes";

import {
  assertWorkflowConformancePassedV1,
  runWorkflowConformanceV1,
  validateWorkflowConformanceReportV1,
} from "../dist/index.js";

const declaredCapabilities = Object.freeze([
  "outcomes.delayed",
  "runner.cancellation",
  "runner.core",
  "runner.gates",
  "task.integrity",
  "task.leases",
]);

test("memory runner passes every declared workflow conformance case", async () => {
  const report = await runWorkflowConformanceV1({
    implementationId: "agentplat.memory-workflow",
    implementationVersion: "1",
    implementationDigest: digestWorkflowJsonV1(
      "conformance-implementation",
      "memory-v1",
    ),
    capabilities: declaredCapabilities,
    factory: memoryFactory(),
    seed: 17,
    clock: () => new Date("2026-08-28T12:00:00.000Z"),
  });
  assert.equal(report.failed, 0);
  assert.equal(report.passed, 8);
  assert.equal(report.skipped, 1);
  assert.equal(
    report.cases.find(
      (result) => result.caseId === "persistence_distinct_reopen",
    ).outcome,
    "skipped",
  );
  assert.equal(
    assertWorkflowConformancePassedV1(report).reportDigest,
    report.reportDigest,
  );
  assert.throws(
    () =>
      validateWorkflowConformanceReportV1({
        ...report,
        passed: report.passed + 1,
      }),
    /counts_invalid/u,
  );
});

test("persistence capability requires destructive-test consent", async () => {
  await assert.rejects(
    runWorkflowConformanceV1({
      implementationId: "invalid.persistence",
      implementationVersion: "1",
      implementationDigest: digestWorkflowJsonV1(
        "conformance-implementation",
        "invalid",
      ),
      capabilities: ["persistence.restart"],
      factory: memoryFactory(),
      seed: 1,
    }),
    /destructive_consent_required/u,
  );
});

function memoryFactory() {
  return {
    async create() {
      const store = new InMemoryWorkflowStoreV1();
      const outcomes = new InMemoryTaskOutcomeStoreV1();
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
      const runner = new InMemoryProcessRunnerV1(store, {
        taskExecutor: control.taskExecutor,
        gateProvider: control.gateProvider,
      });
      const runtime = { store, runner, outcomes, control };
      return {
        async open() {
          return runtime;
        },
        async cleanup() {},
      };
    },
  };
}
