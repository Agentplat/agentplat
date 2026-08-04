# `@agentplat/planning-artifacts-postgres`

Immutable PostgreSQL storage for planning fragment artifacts. Each repository is
scoped to one tenant, mesh, policy domain, peer, and peer instance. Duplicate
writes are idempotent only when their canonical content is identical; content
address and domain-identity conflicts fail closed.

Run `runMigrations(pool, { schema, createSchema: true })` before constructing
`PostgresPlanningFragmentRepositoryV1`. Destructive rollback requires both the
normal confirmation token and `verifiedBackup: true`.
