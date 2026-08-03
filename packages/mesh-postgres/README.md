# `@agentplat/mesh-postgres`

Optional PostgreSQL durability for Agentplat Mesh. It stores a tenant- and
instance-scoped inbox, current strict snapshot, append-only hash-chained journal
and at-least-once outbox.

```ts
import {
  PostgresMeshDurableRepository,
  createPostgresPool,
  runMigrations,
} from "@agentplat/mesh-postgres";

const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });
await runMigrations(pool, { schema: "agentplat", createSchema: true });

const repository = new PostgresMeshDurableRepository(pool, {
  schema: "agentplat",
});
```

Import and construction do not connect, migrate or start workers. Migrations
are explicit and destructive rollback requires the exact confirmation returned
by `rollbackConfirmation`, the expected version, `allowDataLoss: true`, a
verified external backup and an explicit decision for any Beta-only rows.

Migration 2 is additive. It records the durable wrapper version, envelope
format/wire version/canonical bytes, snapshot content format/schema and journal
version without guessing legacy snapshot content. `getCompatibilityStatus`
returns counts only. Applications migrate opaque Alpha snapshots through
`backfillLegacySnapshots` with an explicit deterministic codec in bounded,
resumable batches. `getRollbackReadiness` reports whether retained Beta rows
can be read by the preceding Alpha reader, including v1 envelopes, typed snapshots and
schema-2 journal entries that cannot be represented by that reader.

Migration 3 is also additive. It adds an opt-in planning/recovery stream whose
scope binds the exact tenant, policy domain, mission intent revision and digest,
selection-policy digest, peer and peer instance. The stream stores a strictly
validated `PlanningReducerSnapshotV1`, closed recovery high-waters and one
hash-chained event per compare-and-swap commit.

`PostgresPlanningRecoveryDurableRepositoryV1` never treats a planning record as
execution authority. Assignment epochs must advance exactly once and rotate the
fencing token; replay, revocation, budget, logical-time, plan and fragment
high-waters cannot decrease. A snapshot may initialize an empty stream, while a
non-empty stream accepts only its identical snapshot through `restore()`; later
state must arrive through verified commits so the local journal cannot acquire
an unverifiable gap or fork.

Construct recovery state with `createPlanningRecoveryStateV1`, bind it to a real
planning snapshot with `createPlanningRecoveryDurableStateV1`, and then call
`initialize`, `commit`, `read` or `inspectEvents`. The in-memory implementation
uses the same validation and is intended for conformance tests, not as durable
storage.

The pool remains caller-owned. `repository.close()` intentionally does not call
`pool.end()`.

## Delivery semantics

An envelope is acknowledged only after its inbox row commits. Inbox claims use
`FOR UPDATE SKIP LOCKED`, a random token, a monotonically increasing generation
and PostgreSQL transaction time. Snapshot compare-and-swap, journal append,
outbox insert and inbox settlement commit atomically.

Outbox delivery is at least once. A worker may retry after the receiver has
already committed, so receivers must use the durable message key and Mesh replay
boundary. Database claims schedule work; they do not create Objective, lease,
assignment or action authority.

Every loaded envelope is passed through the strict protocol parser, every
snapshot digest is recomputed, and every inspected journal entry is recomputed
from its chain document. Database credentials, signing keys and externally
referenced content are not stored by this adapter.
