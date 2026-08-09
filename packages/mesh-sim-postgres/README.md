# `@agentplat/mesh-sim-postgres`

PostgreSQL custody for resumable statistical-campaign execution across jobs and
hosts. The adapter provides revision compare-and-swap, immutable slot commits,
content-addressed artifacts, atomic lease-fence validation and a restart-durable
head store for scalable team-vs-team evaluation.

The caller supplies a scoped namespace and owns the `pg` pool lifecycle. Apply
the packaged migration before opening the store:

```ts
import { createPostgresPool } from "@agentplat/postgres";
import {
  PostgresCollectiveStatisticalCampaignStoreV1,
  runMeshSimPostgresMigrationsV1,
} from "@agentplat/mesh-sim-postgres";

const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });
await runMeshSimPostgresMigrationsV1(pool);

const store = new PostgresCollectiveStatisticalCampaignStoreV1(pool, {
  namespace: "campaign:execution:attempt",
});
```

For `runScalableEvaluationV1()`, construct the production checkpoint store and
pass it with a stable run identifier:

```ts
import { PostgresScalableEvaluationCheckpointStoreV1 } from "@agentplat/mesh-sim-postgres";

const durableStore = new PostgresScalableEvaluationCheckpointStoreV1(pool, {
  namespace: "evaluation:production",
  maximumCheckpointBytes: 16 * 1024 * 1024,
});

await runScalableEvaluationV1({
  ...evaluation,
  runId: "evaluation-run:2026-08-08:001",
  durableStore,
});
```

`PostgresScalableEvaluationCheckpointStoreV1` implements the provider-neutral
`ScalableEvaluationDurableCheckpointStoreV1`. It creates a genuine nominal
restart-durability declaration, canonicalizes and validates every checkpoint,
and verifies both its SHA-256 content hash and the duplicated relational
bindings on load. CAS uses a transaction-scoped advisory lock followed by a
row lock. An exact replay of the same revision and bytes returns `duplicate`;
a stale predecessor, revision gap, changed definition, adapter, schedule,
ports or configuration returns `conflict` without modifying the head.

Migration 002 adds one head row per `(namespace, run_id)` with revision,
checkpoint/predecessor digests, exact configuration bindings, canonical JSON,
SHA-256 and byte length. The default maximum checkpoint size is 16 MiB. A
caller may lower it; neither the API nor the database accepts more than 64 MiB.
The namespace and run identifier remain SQL parameters and are also covered by
the store's advisory-lock identity.

Artifact IDs are bound once to their complete semantic index entry. Reads
revalidate canonical bytes, byte length and SHA-256 bindings. Fenced commits
lock the current execution state and sample PostgreSQL wall-clock time after
the lock is acquired. They reject expired, replaced or mismatched workers
before duplicate detection. The immutable provenance binds the exact
execution, registration, cell, run key, fence and operation deadline.

Default limits are hard upper bounds. Callers may lower them but cannot raise
them. Migrations are additive on install. Rollback from version 2 removes the
scalable-evaluation checkpoint heads and therefore requires the existing
explicit destructive rollback confirmation.
