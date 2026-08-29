# `@agentplat/autonomy-postgres`

PostgreSQL state and append-only decision journal for
`@agentplat/autonomy`.

Policies are immutable by tenant/domain/ID/version. Segment state uses revision
and predecessor-digest CAS. A successful state transition and its exact
decision journal record commit in one transaction.

The package provides persistence and restart continuity, not outcome truth,
approval authority or external-effect execution. Construction performs no I/O;
the host owns the pool, schema, backups and migration lifecycle.
