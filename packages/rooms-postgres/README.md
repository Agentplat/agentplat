# `@agentplat/rooms-postgres`

PostgreSQL persistence for the public AgentPlat Agent Room framework. It
implements the `RoomRepository` and `RoomRepositoryTransaction` contracts from
`@agentplat/rooms` and stores room state plus its durable domain events in one
database transaction.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/rooms-postgres@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

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
  PostgresAgentDefinitionRegistryStore,
  PostgresRoomHandoffStore,
  PostgresAgentRoomCoordinationStore,
  PostgresAgentRoomPlanStore,
  PostgresHumanContributionStore,
  PostgresKnowledgeBundleStore,
  PostgresRoomParticipantMembershipStore,
  PostgresRoomExecutionSessionStore,
  PostgresRoomRepository,
  runMigrations,
} from "@agentplat/rooms-postgres";

const pool = createPostgresPool();
await runMigrations(pool, {
  schema: "agentplat_orders",
  createSchema: false, // Prefer a DBA-created, role-owned schema.
});

const repository = new PostgresRoomRepository(pool, {
  schema: "agentplat_orders",
});
// Inject repository into RoomService.

const executionSessions = new PostgresRoomExecutionSessionStore(pool, {
  schema: "agentplat_orders",
});

const agentDefinitions = new PostgresAgentDefinitionRegistryStore(pool, {
  schema: "agentplat_orders",
});

const handoffs = new PostgresRoomHandoffStore(pool, {
  schema: "agentplat_orders",
});

const coordination = new PostgresAgentRoomCoordinationStore(pool, {
  schema: "agentplat_orders",
});

const humanContributions = new PostgresHumanContributionStore(pool, {
  schema: "agentplat_orders",
});

const knowledge = new PostgresKnowledgeBundleStore(pool, {
  schema: "agentplat_orders",
});

const plans = new PostgresAgentRoomPlanStore(pool, {
  schema: "agentplat_orders",
});

const memberships = new PostgresRoomParticipantMembershipStore(pool, {
  schema: "agentplat_orders",
});

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

For the capability-by-capability V1–V12 inventory, rollout order and rollback
boundary, see the [Agent Room PostgreSQL migration guide](../../docs/agent-rooms-postgres-migration.md).

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

## Agent governance configuration (source preview)

Migration 013 adds transactional governance heads and immutable operation history.
`PostgresAgentGovernanceStoreV1(pool, { schema })` implements the Rooms governance
store port. Changes use revision CAS and commit the head plus result journal in
one transaction. Explicit rollback confirmation can target migration 013;
rolling it back removes governance data and requires explicit data-loss consent.

See [governance configuration](../../docs/agent-governance/configuration.md).
Purpose execution remains disabled; this adapter persists suspended configuration.

## Inception persistence (source preview)

Migration 014 adds immutable intake and assessments with a separate CAS head.
`PostgresAgentInceptionStoreV1` checks the governance fence in the same transaction
as each write; use the same schema as the governance adapter. Explicit rollback confirmation can target 014. No evaluation result authorizes execution.
See [inception usage](../../docs/agent-governance/inceptions.md).

## Attention signal persistence (source preview)

Migration 015 adds the immutable attention catalog and bounded stream state.
`PostgresAttentionSignalStoreV1` commits observations and pending wakeups together
under governance fencing and stream CAS. Explicit rollback confirmation can target 015. See [signal bounds and recovery](../../docs/agent-governance/signals.md).

## Governed execution persistence (source preview)

Migration 016 adds activation statuses, immutable limit/task bindings, budget totals
and effect receipts. `PostgresAgentExecutionStoreV1` serializes budget admission
with governance updates. Explicit rollback confirmation can target 016, and rollback
refuses activation history that earlier suspended-only code cannot interpret.
See [execution recovery](../../docs/agent-governance/execution.md).

## Qualified purpose mission persistence (source preview)

Migration 017 adds mission envelopes, immutable revision history and plan ownership.
`PostgresPurposeMissionStoreV1` shares the governance serialization boundary with
`PostgresAgentExecutionStoreV1` so canceled/stale mission work cannot be admitted.
Migration 017 rollback refuses purpose activation history. Current rollback confirmation
targets 018, which refuses existing governed origins.
See [mission recovery](../../docs/agent-governance/missions.md).

See [governed continuity](../../docs/agent-governance/continuity.md) for objective 8: ancestry budgets, mixed-mode Handoffs, model replacement and qualified evolution receipts.
