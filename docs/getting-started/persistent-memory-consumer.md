# Adopt the published persistent-memory profile (1.4.0)

AgentPlat 1.4.0 publishes an opt-in persistent memory profile. See the [verified release record](../releases/1.4.0-distribution.md). This guide describes the consumer contract and migration path; the application owns identity, membership, UI, retention and deployment.

## Capabilities and boundaries

Memory entries use stable-agent subjects and separately authorized personal/shared audiences. Corrections and retirement create immutable revisions; execution evidence can pin the exact memory and reviewed definition revisions used for a run. Personal audience is tied to a verified actor, not inferred from the tenant, stable agent or conversation participant. Shared access requires current host authorization.

Legacy context APIs remain available. No migration automatically converts legacy entries or infers their owners/audiences. Retirement is a revision and does not physically erase history. Apply retention and access rules to revisions, execution snapshots, exports and backups. The host owns principal authentication, stable agent mapping, sharing policy and UI.

## PostgreSQL setup

The PostgreSQL memory ledger is independent of Room migration history. Apply it explicitly with the migration runner exported by `@agentplat/rooms-postgres`, then check its status before wiring `PostgresMemoryRevisionStoreV1` and `MemoryRevisionServiceV1`:

```ts
import {
  createPostgresPool,
  runMemoryRevisionMigrations,
  getMemoryRevisionMigrationStatus,
  PostgresMemoryRevisionStoreV1,
} from '@agentplat/rooms-postgres';
import { MemoryRevisionServiceV1 } from '@agentplat/rooms';

const pool = createPostgresPool(connectionOptions);
await runMemoryRevisionMigrations(pool, { schema: 'agent_rooms' });
const status = await getMemoryRevisionMigrationStatus(pool, { schema: 'agent_rooms' });
const memory = new MemoryRevisionServiceV1(
  new PostgresMemoryRevisionStoreV1(pool, { schema: 'agent_rooms' }),
  access,
);
```

Use the host's explicit migration process and choose `createSchema: true` only when deliberately creating the schema. The independent migration application ID is `@agentplat/room-memory-revisions`, version 1; it creates `memory_revision_heads` and `memory_revisions`, does not advance the Room ledger, and does not convert `memory_entries`. Adapter construction does not migrate automatically. Migration rollback is destructive and requires explicit data-loss consent; use service revisions for correction/retirement.

A backfill must explicitly map each legacy subject to a verified stable agent and choose an authorized audience. Never infer private ownership from tenant IDs. Use stable import operation IDs and evidence references in any separately reviewed backfill.

## Authorization and execution evidence

`MemoryRevisionAccessV1.authenticate` must resolve a verified `actor.actorId`. The framework restricts personal memory to that actor; the mandatory `authorize` callback enforces current membership and operation policy for shared memory. Historical reads must reauthorize both current and historical audiences under retention rules. Fail closed on access/storage errors; do not substitute model-selected identity or unrestricted stale data.

Record exact definition revision/digest, effective context digest and memory ID/revision/digest references for a run. Keep the execution snapshot under the same access and retention rules as its source. A prompt digest alone does not prove that a remote model executed those bytes.

## Verification evidence

The published consumer checks exercise isolated PostgreSQL schemas, public types, authorization, conflicts, concurrency, correction/retirement and pool reopen with deterministic fixtures. They do not validate production identity providers, live-model behavior or production-scale operations. They establish bounded package integration only.

For clean package-byte comparison, frozen pnpm installation, npm install/`npm ci`, and deterministic PostgreSQL consumer commands, see the [full published consumer verification guide at the release commit](https://github.com/Agentplat/agentplat/blob/efb6e976a98b487d7e82d05e64d6b0f7be6f22ca/docs/getting-started/persistent-memory-consumer.md). Use its fixture as bounded integration evidence, not production-scale validation.
