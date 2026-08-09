# `@agentplat/collective-host-postgres`

PostgreSQL-backed compare-and-swap state and content-addressed artifact stores
for the distributed collective protocol, integrated host, autonomous
adaptation runtime, autonomous collective node, assurance-coupled execution
ledger, and interoperability idempotency/sequence boundaries. Assurance
reservations use logical-time leases so another worker can resume after a
stopped process while completed receipts remain replayable. All records are
scoped so several tenants or meshes can share one database without sharing
runtime state.

Migration 005 adds the bounded causal telemetry outbox. Migration 006 adds
CAS-backed semantic horizon budgets and their separately persisted monotonic
rollback anchors. Migration 007 adds the monotonic assurance protected-effect
checkpoint used to reconcile commit-start crashes before semantic replay.
Migration 008 adds fenced autonomous-node advance reservations and durable
command bindings/results so a replacement process can resume the same logical
advance without repeating non-repeatable finality or protected-effect calls.
Node revisions use `saveWithTelemetry()` and assurance receipts use
`completeWithTelemetry()`;
each method writes the domain commit and ordered content-free envelopes in one
PostgreSQL transaction. A scope advisory lock makes the capacity check and
append atomic across writers. Pending rows are never pruned: they remain until
the audit sink atomically records event plus receipt. The row then advances from
`pending` to `recorded`; only a recorded row can be deleted by
`acknowledgeTelemetry(deliveryDigest)`, and the audit receipt is released before
that ACK. Enqueue, load, mark, and ACK exact-validate every envelope and
recompute its event/evidence-bound delivery digest before mutation. PostgreSQL
uses `COLLATE "C"` for the same total order as the in-memory store: source kind,
source identifier, source sequence, ordinal, and delivery digest. Unique and
coordinate checks reject conflicts while permitting already-ACKed prefixes.
A mark conflict retains both pending source and sink receipt and fails closed.
`maximumPendingTelemetry` defaults to 4096 and capacity exhaustion rolls back
the associated node/receipt commit.

`PostgresAnytimeSemanticGuaranteeStoreV1` persists the confidence-sequence
accumulator and its monotonic rollback anchor in the same atomic row. Process
replacement therefore cannot silently reset the sequential error budget.
`PostgresSemanticHorizonBudgetRepositoryV1` persists consumed horizon state and
its monotonic witness in separate tables; pass it explicitly as both the state
and anchor port when composing an operational controller or protected-effect
runtime.

Run the exported migrations before constructing a repository. Rollback is
destructive and requires both an explicit confirmation token and an externally
verified backup. `rollbackConfirmation(schema)` targets migration 008 by
default; pass the current version explicitly to `rollbackMigrations()` and do
not reuse a token generated for an older migration head.
