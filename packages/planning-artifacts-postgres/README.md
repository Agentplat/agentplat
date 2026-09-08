# `@agentplat/planning-artifacts-postgres`

Immutable PostgreSQL storage for planning fragment artifacts and certified
replication evidence. Each repository is scoped to one tenant, mesh, policy
domain, peer, and peer instance. Duplicate writes are idempotent only when
their canonical content is identical; content address, evidence identity, and
domain-identity conflicts fail closed.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/planning-artifacts-postgres@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

Run `runMigrations(pool, { schema, createSchema: true })` before constructing
`PostgresPlanningFragmentRepositoryV1` or
`PostgresPlanningArtifactReplicationEvidenceRepositoryV1`. Migration 2 adds
immutable replica receipts, replication certificates, and certificate-storage
acknowledgements. Destructive rollback requires both the normal confirmation
token and `verifiedBackup: true`.
