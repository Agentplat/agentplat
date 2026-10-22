# `@agentplat/artifacts-postgres`

PostgreSQL `ArtifactStore` adapter for `@agentplat/artifacts`. It persists the
current artifact head and every immutable revision. Create and compare-and-set
updates run in transactions; the expected head revision is checked by the
database update itself, so concurrent writers cannot silently overwrite one
another. All reads are tenant and artifact scoped.

```ts
await runMigrations(pool, { schema: "agentplat", createSchema: true });
const store = new PostgresArtifactStore(pool, "agentplat");
const artifacts = new ArtifactService({ store, events });
```

The migration ledger and advisory locking come from `@agentplat/postgres`.
Migration rollback drops artifact data and is marked destructive. Back up and
review the selected schema before running it. Artifact references enter the
event outbox in the same transaction as each write. A worker can retry delivery
with `drainArtifactOutbox(store, publisher)`; delivery is at least once, so
consumers should deduplicate using the stable event ID. Pending rows are retained
after delivery for operational inspection and need application retention.

Run `pnpm --filter @agentplat/artifacts-postgres test` for adapter contract
checks. A live PostgreSQL service is not required by the focused tests.
