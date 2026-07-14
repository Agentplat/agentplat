# `@agentplat/rooms-postgres`

PostgreSQL persistence for the public Agentplat Agent Room framework. It
implements the `RoomRepository` and `RoomRepositoryTransaction` contracts from
`@agentplat/rooms` and stores room state plus its durable domain events in one
database transaction.

## Configure and migrate

The pool accepts an explicit `connectionString`. With no options it uses
`DATABASE_URL` when present, otherwise `pg`'s standard `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER`, and `PGPASSWORD` environment variables.

The adapter owns its tables and migration ledger in the `public` schema and
fully qualifies every database object. It therefore works with a restricted or
custom session `search_path`; the database role must have the corresponding
usage and creation privileges on `public` when applying the migration.

```ts
import {
  createPostgresPool,
  PostgresRoomRepository,
  runMigrations,
} from '@agentplat/rooms-postgres';

const pool = createPostgresPool();
await runMigrations(pool);

const repository = new PostgresRoomRepository(pool);
// Inject repository into RoomService.

await pool.end();
```

After building the package, migrations can also be run from the workspace:

```sh
pnpm --filter @agentplat/rooms-postgres migrate
```

`migrate:down` removes every Agent Room table and is intended only for local
development or controlled rollback. The packaged SQL is available under
`migrations/` for deployments that use Flyway, Liquibase, dbmate, or another
migration orchestrator.

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
