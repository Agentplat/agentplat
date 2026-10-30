# ADR 0059 Incremental evidence and reviewed follow-up

Status: implemented in source, pending coordinated distribution.

## Context

Provider notifications can repeat, source checkpoints can race, and a model can
finish before its derived facts are applied. Re-reading the same source or
repeating an uncertain model call loses cost and evidence boundaries. Durable
matters and inferred personal preferences need different lifecycle owners:
recording an occurrence is not resolving a matter or accepting a preference.

## Decision

Extend the existing event package with authenticated incremental-evidence
receipts. Intake commits normalized event identities, evidence identities and
an optional source checkpoint atomically. Use indexed per-record SQL storage
with source-scoped synchronization rather than a growing tenant snapshot.
Model claims are fenced; expired/uncertain calls require explicit reconciliation.
Known pre-inference failures use a persisted retry time so unavailable older
evidence does not starve newer arrivals.
Completed results persist before idempotent domain projection. Compact payloads
only after their results are applied, retaining deduplication identities.

Add Room situation revisions with stable identity, explicit causes and authorized
multi-Room change feeds. Situations remain distinct from execution objectives.
The host retains source verification, urgency and grouping policy. Change-feed
sequence allocation follows serialized tenant/domain commit order.

Add pending learning proposals around existing memory revisions. Proposals cannot
modify active memory before a human decision. A persisted accepting decision and
deterministic memory operation recover an interrupted acceptance. Concurrent
explicit memory changes win through the existing expected-revision contract.
Use a small shared journal adapter for situation/proposal storage, not a second
memory engine.

## Consequences

The memory and PostgreSQL adapters share contract scenarios; PostgreSQL uses
independent explicit ledgers for evidence and follow-up. Memory revisions keep
their current ledger and authority. Hosts own collectors, workers, budget
admission, retention/capacity policy and external effects. No Gmail SDK or
product-specific priority rules enter the core packages.

Idempotency applies to known persisted identities and internal operations.
Projection can be delivered more than once; its writes must use operation
receipts. Unknown inference is never automatically retried. An acceptance can
remain recoverable while authorization/storage is unavailable. These are
software contracts, not guarantees of model reasoning quality or exactly-once
provider execution.
