# Shared periodic budgets, timestamp activations and prepared notices

Status: opt-in source increment, pending coordinated package distribution. These
APIs connect the native Room Planner and existing workflow call receipts to a
shared cost account and a persistent delivery outbox. They do not install a
worker, select personal urgency, invoke models or send device notifications.

## One account across model callers

`SharedBudgetServiceV1` in `@agentplat/rooms` derives tenant and actor from a
verified host context. Its access port separately authorizes configuration,
reads, admissions, settlement and reconciliation. Bind account IDs to the actual
owner/workspace; a shared application tenant does not establish user ownership.
Category selection, model prices and upper cost bounds are trusted host policy,
never model-selected authority. Every protected model invocation needs a bound.

Configure explicit, non-overlapping `[startsAt, endsAt)` periods with a currency,
total limit and optional category sublimits. Keep category keys stable and bounded;
a period supports at most 128 used categories and 64 explicit sublimits. Amounts are safe integer currency
micros. The host calculates calendar boundaries in its chosen timezone, including
DST changes, and prepares the next period. There is no hidden UTC-month reset.
Changing a limit uses an expected configuration revision and immutable operation
receipt; it cannot erase spent or held amounts. Currency/boundaries of an existing
period are immutable. Configuration revisions do not increment on usage updates;
transactions serialize configuration and usage, preserving the latest counters.

`admit` atomically holds the maximum and creates a fenced running reservation.
Both total and category capacities must fit. It returns an admitted reservation
only to the winner; a repeated operation returns `already_admitted`, never another
permit to invoke the model. Identity spans the account's periods, so replaying an
October operation in November does not run it again. A genuinely new attempt needs
a deliberately new operation identity. Before each protected effect call
`assertCurrent`; expiring a lease does not release money or prove non-invocation.

`settle` replaces the hold with reported usage once, even when model output failed
validation. Reported cost above the reserved bound is still charged and stops new
admissions in that period. Correct prices/limits and acknowledge the overrun with
verified references through authorized configuration before reopening it.
`uncertain` retains the entire hold. Separate `reconcile` authority and verified
proof are required to charge an uncertain known outcome or release a call proven
not to have started. An active unexpired running call cannot be reconciled.
Proof strings are references to host verification, not self-authenticating proof.

Late known usage is charged to its original period. Starting a new period does
not release old uncertain reservations, erase operation identities or move their
usage. `read` exposes total/category spent and held amounts. `reservations`
provides bounded, authorized pages for operator reconciliation; cursors bind
tenant, account and period. Retain these financial identities; payload compaction
of source evidence does not reset a cost account.

## Planner, specialists and Workflows

Connect `createRoomPlannerSharedBudgetV1` to `RoomPlannerPorts.sharedBudget`.
The adapter derives a stable operation ID from native tenant, Room and Planner
operation, selects a host-owned account/category and explicitly binds currency.
All reason/task/review/direct calls pass through this admission boundary.

`configure` persists its `bindingId`. Reconstructed Planners fail closed if the
port is missing or the binding changes. Attach it to an existing Planner only
after reconciling running/uncertain legacy calls. Keep account/category resolution
stable and owner-governed. Binding configuration is not an extra execution grant.

The Planner first records local admission preparation, then admits shared cost,
then attaches the shared receipt, then invokes the effect. A denied account
admission preserves the event/task and records `sharedBudgetBlock`; a future
period can admit that pending work. A crash in preparation remains conservative
and requires reconciliation rather than guessing that no effect ran.

Known usage settles the shared account before projecting the result into the
Planner journal. Existing workflow result receipts recover a failed projection
without another inference or account charge. Connect workflow heartbeat/effect
checks to `planner.assertCurrent(scope, operationId)` so current Room authority,
conversation binding, objective version, local lease and shared cost fence remain
connected inside the task executor.

`RoomPlannerUsage`, workflow usage receipts and the local Planner budget remain
call/result evidence and optional additional Room ceilings. They do not debit a
second shared account. Do not sum those projections with account spending in a
product dashboard. The legacy Room ceiling is cumulative, not the periodic
account limit; configure an appropriate separate ceiling when using the shared
account. Create no second reservation for the same Planner-owned workflow call.

Other evidence/memory/query jobs can use `runSharedBudgetCallV1`. A denied result
must leave their source work pending and must not invoke a provider. Handle this
before starting an irreversible workflow attempt; Planner does so before calling
its workflow port. Unknown exceptions hold the reservation; a
`SharedBudgetCallErrorV1` carries independently reported usage for known-cost
failures. The caller's existing workflow/evidence journal still owns result
payloads. This helper alone is not a result-recovery engine.

## Timestamp intents and the shared delivery outbox

`ScheduledFollowupServiceV1` stores prepared notice deliveries or attributed
Planner-inbox activations. A subject can be a situation, obligation, incident or
another host-owned record. It does not create an execution objective or replace
the workflow runner. Workflows still own task attempts, outcomes and effects.

`replace` writes up to 100 timestamp intents atomically, using the expected
schedule revision and a strictly newer subject revision. Empty intents cancel
the earlier schedule. `extend` adds immutable milestones to an unchanged subject
revision without invalidating existing ones, allowing a host to roll forward
daily reminder horizons without another model call. Replays return their original
receipt; altered contents under a known identity conflict.

The host supplies absolute UTC timestamps after applying personal timezone,
urgency, quiet-time, all-day and recurrence policy. There is no built-in daily
hour, personal rule or recurrence daemon. Coincident milestones with identical
keys/content coalesce; use one canonical milestone key for the same occurrence.

`activateDue` scans an authorized Room set in bounded batches and atomically
queues each eligible delivery once. Unavailable subject/permission checks retain
the intent with a persisted retry delay, allowing later ready work to progress. `scheduledPlannerEventV1` translates a Planner
activation to the existing timer event contract, preserving provenance, references
and thread. A delivery adapter can persist/admit that event through the existing
Planner inbox; intake is not a model call. Prepared notices carry title, body,
optional action label, recipient, channel and native conversation references.

`enqueue` creates an immediate prepared notice with the same
tenant/subject/revision/milestone identity as a scheduled occurrence. Master and
Room projections must use that shared identity and canonical origin/content.
Different content under the same identity conflicts instead of producing a second
notification. Different intentional recipients/channels need distinct milestone
keys. Re-enqueuing an already delivered identity does not send it again. If that
identity already names a future scheduled milestone, an immediate duplicate
preserves its date and retry delay rather than bringing it forward.

`createRoomPlannerNoticeDeliveryV1` bridges the existing Planner communication
outbox to this durable queue. Its host `prepare` callback supplies concrete title,
action, scope and references, or suppresses an irrelevant communication. Preserve
the Planner's subject/milestone identity rather than deriving a fresh ID in each
view. A legacy notification's `delivered` acknowledgement at this bridge means
durably enqueued downstream; only the delivery outbox owns the adapter receipt.

## Delivery, cancellation and uncertainty

Hosts must implement `isCurrent` by reloading subject revision/status, membership,
recipient/channel access and every referenced destination. It is checked before
claiming and again before the adapter effect; the adapter must call the provided
`assertCurrent` immediately before its protected send/intake. Schedule replacement
also invalidates stale internal revisions. Resolution, dismissal or postponement
must produce a new subject revision and update/cancel its schedule. Previously
queued stale deliveries are canceled before invocation. A concurrent change after
an authorized send cannot retract that external effect.

`drain` claims bounded pending items with a native actor/token/lease, uses the
delivery ID as the adapter idempotency key, and records a real receipt reference.
It returns confirmed/current item states and explicit failed IDs while allowing
other ready items to continue. A pre-adapter failure returns to pending with a
persisted delay. Adapter errors, expired delivery leases and acknowledgement
losses become uncertain and are not automatically sent again. `list` provides
authorized, query-bound pages by delivery status for diagnostics and recovery.

Use separately authorized `reconcile` with actual adapter verification to mark an
uncertain delivery as delivered or prove non-delivery and requeue after a delay.
A repeated reconciliation operation is replay-safe. Provider deduplication and
receipt verification remain adapter obligations; there is no exactly-once claim
for arbitrary transports. A Web Push acceptance receipt, for example, is not proof
that a person read a notification. The host must expose its actual receipt level.

Delivering already prepared content never consumes a model budget. Model budget
exhaustion can defer a Planner activation's later reasoning while ordinary inbox
intake and prepared reminders continue. Source work, delayed notices and unknown
outcomes remain durable across process restarts.

## Persistence and verification

Memory adapters are reference implementations. PostgreSQL adapters are
`PostgresSharedBudgetStoreV1` and `PostgresScheduledFollowupStoreV1` in
`@agentplat/rooms-postgres`. `runPlannerOperationsMigrations` manages an independent
ledger. Explicit status and confirmed destructive rollback follow existing
adapter conventions. Base Room migration 020, workflow migration 001 and the
evidence/situation/memory ledgers remain unchanged. Constructors perform no I/O.
Account/subject transactions serialize indexed records; they never rewrite one
growing tenant snapshot. Store transaction callbacks are storage-only, bounded
and atomic; never perform model, transport or authorization effects inside them.

After building, run `node examples/planner-operations.mjs`. Personal-mail and
support consumers use one account and identical APIs; prepared notices continue
after its model budget is exhausted. `pnpm verify:planner-operations-consumer`
requires an isolated PostgreSQL database and verifies installed tarballs,
TypeScript contracts, native conversations, workflows, new-pool recovery and
prepared notice delivery. Shared memory/PostgreSQL tests exercise races, period
boundaries, sublimits, known/uncertain costs, admission/projection crash windows,
cancellation, horizon extension and lost delivery acknowledgements. These tests
establish software behavior, not provider reliability or production-scale evidence.

Next: coordinated distribution/adoption, then application integration. Personal
priorities, actual model prices, calendar policy, Gmail/Pub/Sub, Web Push devices
and the Master Room UI remain host application work.
