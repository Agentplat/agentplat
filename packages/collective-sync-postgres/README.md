# `@agentplat/collective-sync-postgres`

Transactional PostgreSQL persistence for `@agentplat/collective-sync`.

The repository stores append-only causal records, exact point reads,
compare-and-set stream heads, resumable session cursors, receipts, and catch-up
certificates for one exact peer instance. Records and head advancement commit
in the same transaction, so a restart cannot expose a partially imported
frontier.

```ts
import {
  PostgresCollectiveSyncRepositoryV1,
  runMigrations,
} from "@agentplat/collective-sync-postgres";

await runMigrations(pool, { schema: "agentplat", createSchema: true });

const repository = new PostgresCollectiveSyncRepositoryV1(pool, {
  schema: "agentplat",
  tenantId: "tenant.1",
  meshId: "mesh.1",
  peerId: "peer.1",
  instanceId: "instance.peer.1",
  policyDomainId: "policy.1",
});
```

Importing the package performs no connection, migration, or filesystem write.
Rollback is destructive and requires the exact confirmation string, an explicit
data-loss acknowledgement, and a verified external backup.
