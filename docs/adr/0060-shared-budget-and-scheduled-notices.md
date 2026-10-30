# ADR 0060 Shared periodic cost and scheduled follow-up

Status: implemented in source, pending coordinated distribution.

## Context

Per-Room ceilings cannot express one owner budget across reasoning, specialists,
evidence analysis and consolidation. Source/projection idempotency does not own
cost admission or prove external notification delivery. Date-only changes should
activate existing coordination or send prepared content without repeating models.

## Decision

Generalize Planner reservation/usage contracts into an optional shared account
service under Rooms. Serialize native tenant/account transactions across explicit
periods, total/category holds, usage and operation receipts. Preserve identities
across period transitions. Never expire an uncertain reservation into free money.
Charge known overruns and require authorized acknowledgement before reopening.

Connect all native Planner call kinds through a persisted host binding. Keep
local/workflow journals as result/usage evidence, not additional shared debits.
Persist preparation before account admission and settle the account before local
result projection. Reuse workflow result receipts for recovery. Expose the same
Planner fence at workflow heartbeat/effect boundaries; other model callers use
the account directly or a bounded helper without creating another result engine.

Add indexed timestamp intents and a shared delivery outbox alongside existing
Planner inbox/communication ownership. Date intents only enqueue typed Planner
events or prepared notices. Subject/schedule revisions cancel stale work; stable
subject/revision/milestone identities coalesce Room/Master projections. Extend
unchanged reminder horizons without re-running reasoning. Real adapter receipts,
uncertain outcomes and proof-based reconciliation remain distinct states.

Use portable stores with memory and PostgreSQL adapters and one independent
operations migration ledger. Existing Room/workflow/evidence/follow-up/memory
ledgers retain their ownership. Do not introduce a scheduler daemon, another
workflow runner, personal priority policy or provider-specific dependencies.

## Consequences

The host owns authenticated identity, account/category selection, prices, period
and calendar calculations, delivery policy and connectors. It must install the
admission and fence at every protected model/effect boundary. Prepared reminders
are independent of model balance. Unknown external effects can remain blocked
until real reconciliation; no arbitrary transport gets exactly-once guarantees.
Shared contract tests and packed consumer recovery verify bounded software
behavior, not extraction quality, empirical scale or provider reliability.
