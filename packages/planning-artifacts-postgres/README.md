# `@agentplat/planning-artifacts-postgres`

Immutable PostgreSQL storage for planning fragment artifacts and certified
replication evidence. Each repository is scoped to one tenant, mesh, policy
domain, peer, and peer instance. Duplicate writes are idempotent only when
their canonical content is identical; content address, evidence identity, and
domain-identity conflicts fail closed.

Run `runMigrations(pool, { schema, createSchema: true })` before constructing
`PostgresPlanningFragmentRepositoryV1` or
`PostgresPlanningArtifactReplicationEvidenceRepositoryV1`. Migration 2 adds
immutable replica receipts, replication certificates, and certificate-storage
acknowledgements. Destructive rollback requires both the normal confirmation
token and `verifiedBackup: true`.
