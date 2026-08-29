# `@agentplat/workflows-postgres`

PostgreSQL durability for Governed Durable Workflows V1. The package persists
immutable task/process definitions, revisioned process and task runs,
idempotent operations, signals, transition events and delayed outcomes.

`PostgresWorkflowStoreV1` implements the same `WorkflowStoreV1` contract as the
in-memory reference. `PostgresTaskOutcomeStoreV1` implements the browser-safe
outcome port from `@agentplat/workflows/outcomes`.

```ts
import {
  PostgresTaskOutcomeStoreV1,
  PostgresWorkflowStoreV1,
  runMigrations,
} from "@agentplat/workflows-postgres";

await runMigrations(pool);
const workflows = new PostgresWorkflowStoreV1(pool);
const outcomes = new PostgresTaskOutcomeStoreV1(pool);
```

Repository construction performs no I/O. The host owns the pool, schema,
authentication, backups and migration execution. Rollback is destructive and
requires the package confirmation plus an explicitly verified external backup.

PostgreSQL provides durable CAS and identity constraints, not an exactly-once
external-effect guarantee. Effect sinks must atomically enforce the supplied
task idempotency identity or fence.
