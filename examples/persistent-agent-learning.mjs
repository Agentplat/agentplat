// Deterministic local composition; use durable stores and a host worker in deployment.
import { pathToFileURL } from "node:url";
import {
  MemoryRevisionServiceV1,
  InMemoryMemoryRevisionStoreV1,
  resolveMemoryRevisionSnapshotV1,
} from "@agentplat/rooms";
import {
  createTaskDefinitionV1,
  createProcessDefinitionV1,
  InMemoryWorkflowStoreV1,
  InMemoryProcessRunnerV1,
  digestWorkflowJsonV1,
} from "@agentplat/workflows";
import { WorkflowOutcomeRuntimeV1 } from "@agentplat/workflows/outcomes";

export async function persistentAgentLearningExample() {
  const tenantId = "example",
    start = "2026-10-17T12:00:00.000Z",
    later = "2026-10-18T12:00:00.000Z";
  const memory = new MemoryRevisionServiceV1(
    new InMemoryMemoryRevisionStoreV1(),
    {
      authenticate: async (credentials) =>
        credentials === "owner-token"
          ? { tenantId, actor: { actorId: "owner", actorType: "human" } }
          : null,
      authorize: async () => true, // Reference host policy; production must check shared memberships.
    },
    { clock: () => new Date(start) },
  );
  await memory.append("owner-token", {
    memoryId: "response-style",
    operationId: "explicit-preference",
    expectedRevision: null,
    subject: { type: "agent", id: "adviser" },
    audience: { kind: "personal", subjectId: "owner" },
    content: { style: "concise" },
    evidenceRefs: ["declaration:1"],
    observedAt: start,
    validFrom: start,
    status: "active",
    reason: "Explicit user preference",
  });
  const snapshot = await resolveMemoryRevisionSnapshotV1(
    memory,
    "owner-token",
    ["response-style"],
  );
  const store = new InMemoryWorkflowStoreV1();
  const runner = new InMemoryProcessRunnerV1(store, {
    taskBindingResolver: {
      resolve: async () => ({
        promptRevision: "instructions:1",
        promptDigest: digestWorkflowJsonV1("prompt", "instructions:1"),
      }),
    },
    taskExecutor: {
      execute: async () => ({
        status: "completed",
        result: {
          schemaVersion: 1,
          kind: "finding",
          statement: "Deterministic example claim",
          evidenceRefs: ["public-document:1@revision:1"],
          memory: snapshot.references,
        },
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cost: { currency: "USD", micros: 0 },
        },
      }),
    },
  });
  await runner.registerTaskDefinition(
    tenantId,
    createTaskDefinitionV1({
      taskDefinitionId: "research",
      version: "1",
      name: "Research",
      handlerKey: "research",
      handlerDigest: digestWorkflowJsonV1("handler", "research:1"),
      effectClass: "internal",
    }),
  );
  await runner.registerProcessDefinition(
    tenantId,
    createProcessDefinitionV1({
      processId: "reviewable-research",
      version: "1",
      name: "Research and future review",
      stages: [
        {
          schemaVersion: 1,
          stageId: "research",
          name: "Research",
          kind: "task",
          taskDefinitionId: "research",
          taskDefinitionVersion: "1",
          dependsOn: [],
        },
        {
          schemaVersion: 1,
          stageId: "review-due",
          name: "Wait for review",
          kind: "wait",
          durationMs: 86400000,
          dependsOn: [{ stageId: "research", outcomes: ["succeeded"] }],
        },
      ],
    }),
  );
  const input = {
    tenantId,
    runId: "research:obligation:1",
    processId: "reviewable-research",
    processVersion: "1",
    operationId: "start",
    idempotencyKey: "obligation:1",
    logicalTime: start,
    subject: { subjectType: "research-question", subjectId: "question:1" },
  };
  await runner.start(input);
  await runner.start(input); // External scheduler replay does not create a second task attempt.
  // A host scheduler/worker supplies this wakeup. There is no cron inside the example.
  await runner.advance({
    tenantId,
    runId: input.runId,
    operationId: "due",
    idempotencyKey: "due:1",
    logicalTime: later,
  });
  const [task] = await store.listTaskRuns({ tenantId });
  const outcomes = new WorkflowOutcomeRuntimeV1(store);
  await outcomes.record({
    tenantId,
    outcomeId: "review:1",
    taskRunId: task.taskRunId,
    taskExecutionBindingDigest: task.binding.bindingDigest,
    outcomeType: "factual-review",
    verdict: "inconclusive",
    sourceType: "verified-reviewer",
    sourceId: "reviewer:1",
    observedAt: later,
    recordedAt: later,
    evidenceReferenceIds: ["review-evidence:1"],
  });
  return {
    snapshot,
    taskRuns: await store.listTaskRuns({ tenantId }),
    summary: await outcomes.summarize({ tenantId, groupBy: "prompt_revision" }),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await persistentAgentLearningExample();
  console.log(
    JSON.stringify(
      {
        memory: result.snapshot.references,
        attempts: result.taskRuns.length,
        outcomes: result.summary,
      },
      null,
      2,
    ),
  );
}
