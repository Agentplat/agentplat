# `@agentplat/collective-control-postgres`

Explicit PostgreSQL durability for `@agentplat/collective-control` authority,
execution, Action Grant and evidence repositories.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/collective-control-postgres@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

The adapter owns no policy transitions. Applications run the additive migration
explicitly, initialize scoped repositories, and use the portable reducers for
every authority or execution decision. Construction performs no I/O, starts no
worker and creates no timer. Caller-owned pools are never closed.

Migration rollback is destructive and requires the exact confirmation token.
Before rollback, `getCollectiveRollbackReadinessV1` must report no active work,
reserved/dispatching permits, active grants or indeterminate effects.

## Optional standalone action approvals (1.2.0)

`./action-approvals` provides a tenant-scoped approval repository and a separately
invoked migration. Existing migrations and grant repositories retain their behavior.
See [standalone action control](../../docs/action-control/README.md) for guarantees,
verification and remaining composition requirements.

`./action-admission` adds an opt-in tenant-serialized PostgreSQL store and separate
migration for revocation fences, shared budget accounts and effect receipts. This
reference adapter does not claim production-scale throughput or bounded history.
