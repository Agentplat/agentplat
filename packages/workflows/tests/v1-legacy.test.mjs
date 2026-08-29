import assert from "node:assert/strict";
import test from "node:test";

import {
  upgradeLegacyProcessDefinitionV1,
  upgradeLegacyProcessRunV1,
} from "../dist/index.js";

const legacyDefinition = {
  id: "process:legacy",
  version: "7",
  name: "Legacy process",
  stages: [
    {
      id: "first",
      name: "First",
      taskId: "task:first",
      retryLimit: 2,
      timeoutSec: 5,
    },
    { id: "second", name: "Second", taskId: "task:second" },
  ],
};

test("legacy linear definition upgrades deterministically into a V1 DAG", () => {
  const first = upgradeLegacyProcessDefinitionV1(legacyDefinition);
  const second = upgradeLegacyProcessDefinitionV1(
    structuredClone(legacyDefinition),
  );
  assert.equal(first.definitionDigest, second.definitionDigest);
  assert.equal(first.stages[0].taskDefinitionVersion, "legacy");
  assert.deepEqual(first.stages[0].retryPolicy, { maximumAttempts: 3 });
  assert.equal(first.stages[0].timeoutMs, 5_000);
  assert.deepEqual(first.stages[1].dependsOn, [
    { stageId: "first", outcomes: ["succeeded"] },
  ]);
});

test("legacy completed run preserves exact task identities and terminality", () => {
  const definition = upgradeLegacyProcessDefinitionV1(legacyDefinition);
  const run = upgradeLegacyProcessRunV1(
    {
      tenantId: "tenant-a",
      runId: "run:legacy",
      processId: "process:legacy",
      processVersion: "7",
      status: "completed",
      stageStates: [
        {
          stageId: "first",
          taskId: "task:first",
          taskRunId: "task-run:first",
          status: "completed",
          retryCount: 1,
          startedAt: "2026-08-28T12:00:00.000Z",
          finishedAt: "2026-08-28T12:00:01.000Z",
        },
        {
          stageId: "second",
          taskId: "task:second",
          taskRunId: "task-run:second",
          status: "completed",
          startedAt: "2026-08-28T12:00:01.000Z",
          finishedAt: "2026-08-28T12:00:02.000Z",
        },
      ],
      childTaskRunIds: ["task-run:first", "task-run:second"],
      startedAt: "2026-08-28T12:00:00.000Z",
      finishedAt: "2026-08-28T12:00:02.000Z",
    },
    definition,
    { logicalTime: "2026-08-28T12:00:03.000Z" },
  );
  assert.equal(run.status, "completed");
  assert.equal(run.stageStates[0].attempt, 2);
  assert.equal(run.stageStates[0].outcome, "succeeded");
  assert.equal(run.stageStates[1].taskRunId, "task-run:second");
  assert.match(run.stateDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("legacy conversion refuses missing stages and unrepresentable state", () => {
  const definition = upgradeLegacyProcessDefinitionV1(legacyDefinition);
  assert.throws(
    () =>
      upgradeLegacyProcessRunV1(
        {
          tenantId: "tenant-a",
          runId: "run:ambiguous",
          processId: "process:legacy",
          status: "running",
          stageStates: [],
        },
        definition,
        { logicalTime: "2026-08-28T12:00:00.000Z" },
      ),
    /stage_count_ambiguous/u,
  );
  assert.throws(
    () =>
      upgradeLegacyProcessRunV1(
        {
          tenantId: "tenant-a",
          runId: "run:artifact",
          processId: "process:legacy",
          status: "completed",
          artifactIds: ["artifact:legacy"],
          stageStates: [
            { stageId: "first", taskId: "task:first", status: "completed" },
            {
              stageId: "second",
              taskId: "task:second",
              status: "completed",
            },
          ],
        },
        definition,
        { logicalTime: "2026-08-28T12:00:00.000Z" },
      ),
    /unrepresentable_state/u,
  );
});
