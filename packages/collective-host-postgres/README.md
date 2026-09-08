# `@agentplat/collective-host-postgres`

PostgreSQL-backed compare-and-swap state and content-addressed artifact stores
for the distributed collective protocol, integrated host, autonomous
adaptation runtime, autonomous collective node, assurance-coupled execution
ledger, and interoperability idempotency/sequence boundaries. Assurance
reservations use logical-time leases so another worker can resume after a
stopped process while completed receipts remain replayable. All records are
scoped so several tenants or meshes can share one database without sharing
runtime state.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/collective-host-postgres@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

Migration 005 adds the bounded causal telemetry outbox. Migration 006 adds
CAS-backed semantic horizon budgets and their separately persisted monotonic
rollback anchors. Migration 007 adds the monotonic assurance protected-effect
checkpoint used to reconcile commit-start crashes before semantic replay.
Migration 008 adds fenced autonomous-node advance reservations and durable
command bindings/results so a replacement process can resume the same logical
advance without repeating non-repeatable finality or protected-effect calls.
Migration 009 adds scope-serialized Morphogenesis budget reservations so
independent workers cannot double-spend one capacity envelope; exact retries,
logical expiry and release remain content-bound and durable.
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
verified backup. `rollbackConfirmation(schema)` targets migration 009 by
default; pass the current version explicitly to `rollbackMigrations()` and do
not reuse a token generated for an older migration head.

`PostgresMorphogenesisBudgetReservationPortV1` implements the public
Morphogenesis budget authority with a PostgreSQL advisory transaction lock per
scope. Independent pools serialize capacity inspection and insertion, so two
different reservation IDs cannot both consume the same remaining envelope.
Exact retries return the retained digest; changed-input identity reuse,
cross-scope requests and over-capacity reservations fail closed. Release and
logical expiry advance the reservation once and bind an external rollback
witness. The capacity configuration is construction-bound and is not restored
from database rows.

Advanced Morphogenesis reuses `collective_host_runtime_states` rather than a
parallel database schema. `PostgresMorphogenesisOperatorExecutionStoreV2`,
`PostgresMorphogenesisOperatorOutcomeStoreV2` and
`PostgresMorphogenesisOperatorCompensationStoreV2` and
`PostgresMorphogenesisTeamTopologyStateStoreV2` persist the operator journal,
immutable outcome and Dynamic Topology state. Each reopen validates the full
content digest and external rollback witness; topology certification and
activation use independent CAS revisions even when both belong to one topology
epoch.

V3 strategy adaptation uses the same table and witness for the existing local
learner state, Morphogenesis strategy-governance state and immutable
counterfactual reports. Simulated reports remain separate from observed
feedback records.

For staging and other deployments that require a witness outside the database
protection domain, `HttpMorphogenesisRollbackWitnessV1` implements the same
Morphogenesis witness port over credential-free HTTPS endpoints. Supply an
authorization callback backed by workload identity; the adapter does not store
tokens. Requests bind the full state coordinate and predecessor/successor head
to a digest, and successful responses must echo that digest and the exact head.
Malformed, replayed, oversized, non-JSON, rejected or divergent responses fail
closed. The remote service remains responsible for monotonic durable storage,
identity policy, audit retention and availability.

```ts
import { HttpMorphogenesisRollbackWitnessV1 } from "@agentplat/collective-host-postgres";

const rollbackWitness = new HttpMorphogenesisRollbackWitnessV1({
  endpoint: "https://witness.staging.internal/agentplat/",
  authorizationHeader: async () => `Bearer ${await workloadIdentityToken()}`,
});
```

Do not place witness credentials in the endpoint URL. An HTTP witness on the
same host, account or failure domain as PostgreSQL is not independent staging
evidence and does not establish production readiness.
