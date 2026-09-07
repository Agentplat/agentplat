# `@agentplat/autonomy-postgres`

PostgreSQL state and append-only decision journal for
`@agentplat/autonomy`.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/autonomy-postgres@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

Policies are immutable by tenant/domain/ID/version. Segment state uses revision
and predecessor-digest CAS. A successful state transition and its exact
decision journal record commit in one transaction.

The package provides persistence and restart continuity, not outcome truth,
approval authority or external-effect execution. Construction performs no I/O;
the host owns the pool, schema, backups and migration lifecycle.
