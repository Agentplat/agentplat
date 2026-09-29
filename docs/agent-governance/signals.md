# Attention signals and durable evaluation wakeups (source preview)

Objective 5 adds quantitative, qualitative and event signals. Observations direct
attention and wake evaluation; they never grant action authority. Numeric ranges
and qualitative references are interpretive guidance, not hard limits. This is
source implementation, not a published npm feature or empirical accuracy claim.

## Definition, reference and activation

`AttentionSignalServiceV1` consumes an `AttentionSignalStoreV1`, the existing
governance store, a verified `AttentionSignalAccessV1<Context>` and a clock.
Definitions and references are immutable content-addressed catalog records.

```ts
const definition = await signals.define(ownerCredentials, {
  agentId: "retention-agent",
  expectedGovernanceRevision: head.revision,
  definition: {
    signalId: "cac", kind: "quantitative",
    description: "Customer acquisition cost in USD; collectors normalize currency",
    sourceIds: ["analytics", "finance"],
    freshnessMs: 86_400_000, cadenceMs: 60_000,
    evaluationWindowMs: 3_600_000, maximumEvaluationsPerWindow: 6,
    maximumObservations: 256, maximumWakeups: 128,
  },
});
const reference = await signals.reference(ownerCredentials, {
  agentId: "retention-agent",
  expectedGovernanceRevision: head.revision,
  reference: {
    definitionId: definition.recordId,
    interpretation: { kind: "quantitative", minimum: 20, maximum: 80 },
  },
});
```

Creation requires both host authorization and current owner or an unexpired
`signals`/`references` delegation. Catalog publication is inert and does not
change the live configuration. Select returned record IDs through the existing
governance `signals` and `references` commands, preserving any other selections.
Those controlled changes advance the governance epoch. Editing a definition or
reference means creating a new record and selecting it; callers cannot overwrite
a record to bypass governance. All reference IDs selected in governance must
resolve, even when they belong to other signals.

Qualitative definitions use string observations and a reference such as
`{ kind: "qualitative", criterion: "Predictable access to credit and stable institutions" }`.
Event definitions use descriptive string observations and can also have qualitative
references. Numbers must be finite; unavailable observations have a null value.
This increment does not connect a specific analytics, IPC or market data provider.
The host owns collector adapters, data normalization and source verification.

## Observation intake

```ts
await signals.observe(collectorCredentials, {
  agentId: "retention-agent", definitionId: definition.recordId,
  sourceId: "analytics", eventId: "cac-2026-09-28",
  observedAt: "2026-09-28T12:00:00.000Z",
  availability: "observed", value: 95, evidenceRefs: ["report:acquisition-20260928"],
});
```

Only currently selected definitions accept new observations. The collector must
be authenticated and authorized for the particular source, definition and evidence
references; the source must also appear in the definition. An owner cannot
implicitly impersonate a collector. Evidence references are host-verified opaque
attribution, not proof that a reported value is true.

Identity is `(tenant, agent, definition, source, event)`. An exact duplicate
returns the original record; different bytes under that identity conflict. The
record retains the verified submitter, reported and received times, payload digest,
current governance binding, reference IDs, stale-on-arrival and out-of-order flags.
Future observation timestamps are rejected. Out-of-order data remain evidence but
do not replace a newer source reading. Observations and pending evaluation IDs
are persisted together, so a crash cannot retain the observation but lose its wakeup
intent. Exact retries can return historical governance bindings.

## Coverage and bounded scheduling

The host periodically calls `tick(credentials, { agentId, definitionId })`,
including while sources are silent. `get` returns current source coverage plus its
`asOf` timestamp. Each source is missing, fresh, stale or unavailable. Freshness is
computed from observation time, not arrival time. There is no automatic inference
that an absent source is healthy. The latest source reading is selected by
observation time, then receive time and identity for deterministic ties.

`tick` schedules an evaluation when new observations are pending, coverage changes
(including silence becoming stale), governance/reference selection changes, or
fresh sources disagree. Quantitative and qualitative contradictions are conservatively
identified by differing fresh values; interpretation and resolution belong to an
assessor. Same-source conflicting values at the latest timestamp also remain visible.

Cadence groups pending observations into one wakeup. A per-definition fixed-window
quota bounds scheduled evaluations. Throttling leaves the pending IDs durable for
a later tick. Concurrent writers use CAS, so a losing writer must retry; it cannot
silently advance the queue or consume extra budget. There is no automatic action
when a value leaves a reference range: the assessor receives reference IDs and can
retrieve their interpretations with `catalog`.

Each wakeup contains immutable governance, observation and reference IDs, coverage
at scheduling time, contradiction indication and `executionAuthorized: false`.
Coverage in a delayed wakeup is historical; the consumer must recheck current
freshness/governance before evaluating or acting. Older undelivered wakeups become
obsolete on a later tick after governance changes, and cannot be claimed or settled
under the new epoch. Removing a definition prevents new intake and delivery; retained
history remains readable. No automatic model invocation is installed.

## Delivery and recovery

`claim` leases one pending wakeup to an authenticated worker with a caller token,
server-incremented generation and expiry. Exact live-lease retries return the same
lease. Expired leases can be taken over; the old generation cannot acknowledge them.
`complete` acknowledges only the current worker, token, generation and governance.
`deliverOne` composes those operations around a host-provided sink:

```ts
await signals.tick(workerCredentials, scope);
await signals.deliverOne(workerCredentials, {
  ...scope, claimToken: uniqueAttemptId, leaseMs: 30_000,
}, evaluationQueue);
```

The sink must deduplicate by wakeup ID and reject a different payload under the
same ID. A crash after sink acceptance but before acknowledgement replays the same
payload after lease expiry. Delivery is at least once, not a claim of exactly-once
external effects. A governance change can race delivery after claim: the sink and
consumer must treat the included binding as advice requiring current validation.
The sink queues evaluation requests; it must not interpret them as business effects.

`attentionWakeupToProcessSignalV1` in `@agentplat/workflows-rooms` converts a wakeup
into an existing `ProcessSignalV1` with stable ID, digest and received time. It is a
pure mapping and does not call a runner, advance a workflow or create tasks. The
workflow owner chooses routing, validates capacity and authorization, persists the
signal, and controls later advancement through its existing gates.

## Storage, bounds and HTTP

Use `InMemoryAttentionSignalStoreV1(governanceMemoryStore)` for ephemeral work, or
`PostgresAttentionSignalStoreV1(pool, { schema })` with migration 015. The PostgreSQL
adapter locks the governance row while committing stream state. Catalog records
are protected against SQL update/delete; observation preservation and transitions
inside bounded stream state are enforced by the service and CAS. Store credentials
and direct low-level adapter calls remain trusted application boundaries.

The stream is a bounded aggregate containing retained observations and wakeup/delivery
state. Limits are per definition, not an organization-wide cost budget. There are
at most 16 sources, 32 evidence refs per observation, 256 retained observations and
1024 retained wakeups; applications should normally choose smaller limits. Payload
strings and lease durations are bounded. At capacity the service explicitly rejects
new work rather than evicting deduplication identities or dropping pending evaluation.
Long-running deployments must arrange authorized definition rotation and archival;
automatic retention/compaction is not part of this increment.

`createRoomsApp({ service, attentionSignals })` exposes optional endpoints:

- `POST /agents/:agentId/attention/definitions` and `/references` publish candidates.
- `GET /agents/:agentId/attention/catalog/:recordId` reads a definition/reference.
- `GET /agents/:agentId/attention/streams/:definitionId` reads state and current coverage.
- `POST` to that stream's `/observations`, `/tick`, `/claim` and `/complete` provides
  ingestion and bounded worker operations. URL-encode catalog/definition IDs.

Each route independently authenticates the raw request through the supplied port.
Permissions distinguish configuration, observation, read and worker operations.
The application owns worker scheduling; these APIs install no global timer or cron.

## Verified evidence

Shared memory/PostgreSQL scenarios cover all signal kinds, both reference kinds,
owner checks, tenant isolation, duplicate/conflicting/future/out-of-order input,
silent/stale/unavailable/contradictory sources, cadence, quotas, explicit capacity
exhaustion, lease takeover, crash-after-delivery replay and governance races.
PostgreSQL adds connection reopen, catalog immutability, simultaneous CAS and
migration rollback/reapply. HTTP and public-type checks cover the exported boundaries;
the workflow mapping test verifies stable existing signal deduplication without
running a process. Source freshness does not establish source truth or good judgment.
