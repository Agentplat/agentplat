# @agentplat/workflows

Workflow contracts and a deterministic V1 runner for long-running agentic
processes.

This package defines tasks, task runs, process definitions, stages, artifacts and workflow stores. It gives agentic products a durable vocabulary for orchestration, retries, handoffs, status tracking and output capture.

The existing contracts and `InMemoryWorkflowStore` remain available. The
additive V1 surface provides validated task, wait, signal and generic gate DAGs,
canonical definition/state digests, idempotent process operations and an
`InMemoryProcessRunnerV1` for local composition and conformance-oriented tests.
Every task attempt is retained as a revisioned `TaskRunV1` with its exact
handler/prompt/model/policy/tool binding, input digest, stable idempotency key,
usage and result references. Bounded leases support heartbeat renewal and
generation-fenced takeover. An old owner receives cooperative abort and cannot
settle after replacement. Ambiguous protected effects become `indeterminate`
until explicit reconciliation; they are not silently retried.

```ts
import {
  createProcessDefinitionV1,
  InMemoryProcessRunnerV1,
} from "@agentplat/workflows";

const definition = createProcessDefinitionV1({
  processId: "process:review",
  version: "1",
  name: "Review process",
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
      stageId: "decision",
      name: "Decision",
      kind: "await_signal",
      signalType: "decision.recorded",
      dependsOn: [{ stageId: "prepare", outcomes: ["succeeded"] }],
    },
  ],
});
```

`InMemoryProcessRunnerV1` is browser-safe and intentionally makes no restart,
multi-process, durable timer or exactly-once external-effect claim. Effectful
executors must honor the stable task idempotency identity and protected effects
still require the existing AgentPlat action boundary. PostgreSQL, Agent Room
and Temporal adapters remain specified future increments.

`@agentplat/workflows/outcomes` adds delayed outcome attribution, version-bound
distribution summaries and a coverage monitor that distinguishes healthy,
insufficient, stale and unavailable evidence. Outcome types, reasons, subjects
and sources are opaque caller vocabulary; the package does not define a generic
accuracy metric or treat missing outcomes as success.
