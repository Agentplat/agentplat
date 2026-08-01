# Agent Mesh Beta 1 compatibility operations

Agentplat `0.3.0-beta.1` freezes the first Beta compatibility profile. New
producers write wire v1. Readers retain wire v0 for an explicit compatibility
window, and durable storage records enough metadata to distinguish wrapper,
wire, snapshot-content and database versions.

## Upgrade sequence

1. Back up the Alpha 5 database and verify that the backup can be restored.
2. Deploy Beta readers with v0 and v1 verification enabled.
3. Apply PostgreSQL migration 2 with `runMigrations`. It is additive,
   checksum-bound and advisory-locked.
4. Inspect `getCompatibilityStatus`. Legacy snapshots remain marked as opaque;
   no shape-based inference is performed.
5. Run `backfillLegacySnapshots` with the application-owned codec, a bounded
   batch size and a deterministic target format/schema.
6. Compare scope counts and canonical digests before enabling current-only
   operation.
7. Publish verified Peer Cards advertising supported versions. Select the
   highest authenticated common version and retain the returned high-water.
8. Remove v0 production bootstraps only after every intended peer is confirmed
   on v1. Keeping v0 read compatibility does not enable v0 signing.

The public verification commands are:

```sh
pnpm run verify:mesh-compatibility
pnpm run verify:mesh-postgres-faults
pnpm run verify:mesh-soak -- --messages 9 --repetitions 2
pnpm run benchmark:mesh-adapters
pnpm run verify:pack
```

The PostgreSQL fault, soak and benchmark commands require a caller-provided
test database. They create uniquely named schemas and remove them when the run
finishes.

## Rollback sequence

Prefer an application rollback that leaves additive migration 2 installed.
Configure Beta senders for explicit v0 compatibility before replacing a Beta
worker with Alpha 5. Never rewrite a committed v1 outbox record as v0; drain it
with a Beta worker or reconcile it explicitly.

Before a destructive database down migration:

1. call `getRollbackReadiness`;
2. drain or explicitly account for every v1 inbox/outbox row, typed snapshot
   and schema-2 journal entry;
3. verify an external backup;
4. supply the exact `rollbackConfirmation` string, expected version and
   `allowDataLoss: true`;
5. supply `allowIncompatibleRows: true` only as a recorded data-loss decision.

Published package versions, registry integrity records and annotated Git tags
are immutable. Rollback changes deployment selection; it does not delete or
overwrite release artifacts.

## Evidence interpretation

Compatibility and correctness checks are normative. Benchmark measurements
record their Node, PostgreSQL, operating-system, CPU, memory, sample,
concurrency and percentile context. They are diagnostic measurements for one
candidate and must not be presented as universal service-level objectives.
