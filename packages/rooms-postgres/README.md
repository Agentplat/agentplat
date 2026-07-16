# `@agentplat/rooms-postgres`

PostgreSQL persistence for the public Agentplat Agent Room framework. It
implements the `RoomRepository` and `RoomRepositoryTransaction` contracts from
`@agentplat/rooms` and stores room state plus its durable domain events in one
database transaction.

## Configure and migrate

The pool accepts an explicit `connectionString`. With no options it uses
`DATABASE_URL` when present, otherwise `pg`'s standard `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER`, and `PGPASSWORD` environment variables.

The adapter defaults to `public` for compatibility. For a shared cluster,
allocate one schema per application and pass the same schema to migrations and
the repository. Every object is fully qualified, so the adapter does not rely
on a mutable `search_path`.

```ts
import {
  createPostgresPool,
  PostgresRoomRepository,
  runMigrations,
} from '@agentplat/rooms-postgres';

const pool = createPostgresPool();
await runMigrations(pool, {
  schema: 'agentplat_orders',
  createSchema: false, // Prefer a DBA-created, role-owned schema.
});

const repository = new PostgresRoomRepository(pool, {
  schema: 'agentplat_orders',
});
// Inject repository into RoomService.

await pool.end();
```

After building the package, migrations can also be run from the workspace:

```sh
pnpm --filter @agentplat/rooms-postgres migrate
```

Set `AGENTPLAT_DB_SCHEMA` in the migration task. Migrations are serialized with
a schema/application advisory lock and recorded with version plus checksum in
`<schema>._agentplat_migrations`. Editing an applied migration is rejected.

`migrate:down` removes every Agent Room table. It rolls back only the observed
top version and requires `AGENTPLAT_MIGRATE_DOWN_VERSION`, the exact
`AGENTPLAT_MIGRATE_DOWN_CONFIRM` value returned by `rollbackConfirmation`, and
`AGENTPLAT_ALLOW_DATA_LOSS=true`. Use it only after a tested backup/restore;
prefer a forward fix in production.

The packaged SQL uses the explicit `__AGENTPLAT_SCHEMA__` token. Use the
package runner to render it, or replace it with a quoted identifier when a
separate migration orchestrator owns execution.

## Transaction model

Every service mutation runs through `repository.transaction(tenantId, work)`.
The adapter uses a dedicated client and `BEGIN` / `COMMIT` / `ROLLBACK`; state
changes and `appendEvent` calls therefore succeed or fail together. Durable
events are ordered by a database-generated sequence. Publishing to an
in-process or external event bus happens after the service transaction commits.

All reads and writes include `tenant_id`, and every relationship uses a
tenant-qualified foreign key. A transaction is bound to one tenant and rejects
attempted cross-tenant access before querying PostgreSQL. This adapter does not
enable PostgreSQL row-level security; the API/authentication adapter remains
responsible for supplying a trusted tenant identity.

Artifact versions cannot be updated or deleted, and events are append-only.
Rooms are archived rather than physically deleted so their history remains
available.

For SSL verification, RDS IAM authentication, Secrets Manager, CI migration
tasks, pool budgets and multi-app tenancy, see the repository
[AWS BYOI guide](../../docs/bring-your-own-postgres-aws.md).

## Integration tests

The test suite is opt-in to avoid touching an arbitrary developer database.
Point the standard `PG*` variables at a disposable database and set
`AGENTPLAT_POSTGRES_TEST=1`, then run:

```sh
pnpm --filter @agentplat/rooms-postgres test
```

The integration test applies and rolls back the migration and verifies tenant
isolation, aggregate hydration, transactional rollback, immutable artifact
versions, and append-only events.
