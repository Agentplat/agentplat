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
} from "@agentplat/workflows-conformance";

import {
  TemporalProcessRunnerV1,
  TemporalWorkflowNotifierV1,
} from "../dist/index.js";

test("Temporal process client preserves all shared runner semantics", async () => {
  const report = await runWorkflowConformanceV1({
    implementationId: "agentplat.temporal-process-client",
    implementationVersion: "1",
    implementationDigest: digestWorkflowJsonV1(
      "conformance-implementation",
      "temporal-client-v1",
    ),
    capabilities: [
      "outcomes.delayed",
      "runner.cancellation",
      "runner.core",
      "runner.gates",
      "task.integrity",
      "task.leases",
    ],
    factory: temporalClientFactory(),
    seed: 31,
    clock: () => new Date("2026-08-28T12:00:00.000Z"),
  });
  assert.equal(report.failed, 0);
  assert.equal(report.passed, 8);
  assert.equal(report.skipped, 1);
  assertWorkflowConformancePassedV1(report);
});

function temporalClientFactory() {
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
      const authoritative = new InMemoryProcessRunnerV1(store, {
        taskExecutor: control.taskExecutor,
        gateProvider: control.gateProvider,
      });
      const runner = new TemporalProcessRunnerV1(
        authoritative,
        new TemporalWorkflowNotifierV1({
          client: { workflow: { async signalWithStart() {} } },
          taskQueue: "conformance",
        }),
      );
      return {
        async open() {
          return { store, outcomes, runner, control };
        },
        async cleanup() {},
      };
    },
  };
}
