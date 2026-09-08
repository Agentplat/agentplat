# `@agentplat/agent-registry-postgres`

PostgreSQL adapter for `@agentplat/agent-registry`. `PostgresAgentRegistryStore`
implements tenant-scoped reads, ordered pages and atomic revision CAS.

Use `runMigrations(pool, { schema, createSchema: true })` and
`getMigrationStatus(pool, { schema })`. Migrations use `@agentplat/postgres`'s
checksum ledger and advisory locking. Registry data stays in the configured
schema. The exported `registryMigrations` includes an explicitly destructive down
migration for operator-controlled rollback.

See `docs/interop/a2a-agent-registry.md`. Run `pnpm test` here; the real PostgreSQL
cross-package test runs through repository command `pnpm test:a2a`.

## Installation (developer preview)

```sh
npm install @agentplat/agent-registry-postgres@next
```

Keep all `@agentplat/*` dependencies on the same coordinated preview version.
