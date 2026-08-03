# `@agentplat/mesh-sim-postgres`

PostgreSQL custody for resumable statistical-campaign execution across jobs and
hosts. The adapter provides revision compare-and-swap, immutable slot commits,
content-addressed artifacts and atomic lease-fence validation.

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

Artifact IDs are bound once to their complete semantic index entry. Reads
revalidate canonical bytes, byte length and SHA-256 bindings. Fenced commits
lock the current execution state and sample PostgreSQL wall-clock time after
the lock is acquired. They reject expired, replaced or mismatched workers
before duplicate detection. The immutable provenance binds the exact
execution, registration, cell, run key, fence and operation deadline.

Default limits are hard upper bounds. Callers may lower them but cannot raise
them. Migrations are additive on install; rollback is explicitly confirmed and
marked destructive because it removes campaign custody tables.
