# Agent Room PostgreSQL migration guide

This guide covers upgrades from the original Agent Room schema to the complete
operational schema. Migrations are additive and must be applied in order by
`@agentplat/rooms-postgres`.

## Migration inventory

| Version | Capability                | Primary persisted state                                                                           |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| 001     | Agent Room aggregate      | Rooms, participants, messages, tasks, runs, artifacts, approvals, memory, tools and domain events |
| 002     | Execution sessions        | Resumable execution state and intervention history                                                |
| 003     | Agent Definition Registry | Stable agent identities and immutable published revisions                                         |
| 004     | AgentPlat Handoffs        | Typed transfer lifecycle and revision fencing                                                     |
| 005     | Coordination              | Revisioned inbox, leases, retries and outcomes                                                    |
| 006     | Human contributions       | Requests, lifecycle events and work-management deliveries                                         |
| 007     | Knowledge bundles         | Immutable content-addressed knowledge revisions                                                   |
| 008     | Planner                   | Typed plans, materialized identities and step progress                                            |
| 009     | Participant membership    | Routing and Handoff eligibility plus allowed agent revisions                                      |
| 010     | Operational stream        | Transactional Room-scoped transition stream                                                       |
| 011     | Projection checkpoints    | Durable projector high-water positions                                                            |

## Before upgrading

1. Take and restore-test a database backup.
2. Stop application processes that can run an older schema-dependent worker.
3. Build or install one coordinated AgentPlat package version; do not mix
   versions of `@agentplat/rooms`, `@agentplat/rooms-api` and
   `@agentplat/rooms-postgres`.
4. Use the same explicit schema for the migration runner and every store.
5. Check migration status and investigate checksum drift before proceeding.

## Apply

```sh
export AGENTPLAT_DB_SCHEMA=agentplat_rooms
pnpm --filter @agentplat/rooms-postgres migrate
pnpm --filter @agentplat/rooms-postgres migrate:status
```

The runner serializes migration with a schema/application advisory lock. A
failed migration transaction does not advance the recorded schema version.
Re-running `migrate` is the supported recovery path after correcting the
underlying failure.

## Application rollout

1. Deploy the coordinated package version after migration 011 is present.
2. Start only one worker cohort for each coordination scope during the rollout;
   revision fencing still prevents stale workers from committing.
3. Confirm that new messages produce both a Room domain event and coordination
   state in the same transaction.
4. Confirm operational stream growth and projection checkpoint advancement.
5. Run the reference end-to-end and restart-recovery scenarios against a
   disposable database before promoting the deployment.

## Rollback and compatibility

Prefer a forward fix. Down migrations are destructive and the CLI requires the
observed version, the exact confirmation string and explicit data-loss opt-in.
Restore from the tested backup if an application rollback requires state that a
down migration would remove.

Older application versions do not understand the new operational projections.
Do not run an older worker concurrently with a new worker merely because the
base Room tables remain readable. Database state stays authoritative; Temporal,
SSE clients and external work-management systems are not rollback sources.
