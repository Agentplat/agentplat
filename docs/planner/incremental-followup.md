# Incremental evidence, situations and reviewed learning

Status: opt-in source increment on top of native Room conversations, pending coordinated package distribution. These APIs do not install a worker, invoke a model, connect a provider or create execution authority. The host owns verified identity, source access, extraction quality, relevance rules and user interaction.

## Evidence intake and analysis

`IncrementalEvidenceServiceV1` lives in `@agentplat/events`. Supply an indexed `IncrementalEvidenceStoreV1`, authentication/authorization and an optional clock. The principal determines the tenant; the host authorizes each consumer/source and verifies connector provenance. A consumer is a stable processing purpose, not a model version or a browser session. A shared application tenant alone does not establish user ownership: the access port must bind consumer IDs to the right account/workspace.

`receiveBatch` accepts up to 100 normalized source events, at most 100 evidence references per event and 1,000 evidence entries per batch, within a 1 MiB intake budget. It atomically persists event identities, newly discovered evidence and an optional provider checkpoint. Checkpoints use expected revisions; a failed batch cannot advance past unpersisted evidence. Provider authentication, webhook verification, fetching, cursors and source-completeness assessment remain host responsibilities.

Each event binds tenant, consumer, source, source-event ID, authenticated submitter and immutable normalized contents/mapping. Each evidence receipt binds tenant, consumer, source, evidence ID and source revision. Identical retries replay; altered contents under a known identity conflict. Different source notifications can refer to the same evidence without creating another analysis. Use a provider revision or an explicitly authorized changed-evidence identity; changing extraction code, model or configuration does not itself justify a new source revision.

Intake operation IDs also have immutable receipts. Replaying an intake returns its original counts and checkpoint receipt; those counts are not a claim that the retry inserted new work or moved the current checkpoint backward.

An event receipt is audit/provenance, not an automatic work subscription. The collector must enqueue evidence for every required processing/projection step before advancing its source checkpoint. If a label or other metadata change matters, represent that changed metadata as its own source-revision evidence and process it without paid body inference, reusing the completed content result. An event with no new evidence means this consumer has no new work; do not rely on a callback after intake to perform otherwise unrecorded effects.

The normal state flow is:

```text
pending → leased → completed → projection pending → projection applied
             ↓
          uncertain → verified reconciliation → completed or pending
```

`claim` reserves one pending receipt with a generation, worker identity, actor and lease token. Concurrent workers cannot both claim that generation. Call `assertCurrent` immediately before protected inference/tool effects. A failed local attempt known not to have started may return to pending through `fail(..., "not_started", reason, retryAfterMs)`, with a default 30-second delay (configurable from zero to 24 hours). The persisted `availableAt` keeps unavailable older evidence from blocking new arrivals across restarts; an uncertain outcome or expired lease never automatically replays inference. `reconcile` requires separate authorization and verified proof references, including proof of non-invocation before requeueing. This is an application verification boundary, not a claim that arbitrary reference text proves an outcome.

`complete` saves the bounded analysis result and reference before any domain projection. Repeated completion with the same claim/result is replay-safe. Known results remain available through `read` and `pendingProjections`, independently of the worker process that analyzed them. The service does not account model usage; callers retain their model receipts and budget controls. Shared periodic budget admission is a subsequent increment.

## Recoverable domain projection and retention

`project` reloads a completed result from authorized storage and supplies an immutable projection operation identity to a host callback. The callback performs idempotent domain writes, such as `situations.apply` and `proposals.propose`. For several affected records derive a stable child operation ID from that projection and record identity. Do not place paid inference or non-idempotent external effects in this callback.

Projection acknowledgement occurs only after the callback finishes. A crash after the first case update leaves the analysis completed and unapplied; recovery invokes the callback again with the same stored result and operation identity. Exact domain-operation receipts prevent repeated revisions. A source revision conflict remains pending for host reconciliation; it does not require analyzing the source message again. Delivery/projection is at least once, not a promise of exactly-once external effects.

`readEvent` exposes the normalized event and evidence mapping under current source authorization. Prefer stable authorized references over embedding entire provider bodies. Source payload compaction waits until **every** referenced evidence result is completed and applied. Result compaction likewise requires successful projection. The minimal event/evidence identities, input digests, result fingerprints and intake receipts remain; compaction does not make known input eligible for analysis again or restore a previously removed body on replay.

PostgreSQL uses indexed event, receipt, checkpoint and intake-operation rows, rather than a fixed-size tenant JSON stream. Intake serializes one consumer/source checkpoint; unrelated streams remain independent. There is no automatic eviction of deduplication identities or automatic account-data purge. Hosts own retention requirements, capacity monitoring and explicit deletion policy. Queue counts describe discovered work, not exhaustive source coverage. Bounds reject oversized inputs instead of silently truncating their evidence.

## Situations and authorized change feeds

`RoomSituationServiceV1` in `@agentplat/rooms` records an immutable revision per accepted operation, with a compare-and-set head. Content includes a primary Room, related conversation links, evidence/artifact references, optional deadline/attention metadata and host attributes. A situation can be informational; tracking it does not create a task or make it urgent. The library does not select three priorities or encode fiscal, mail or support rules.

`apply` requires a stable situation ID, operation ID, expected revision, complete new content and a cause. Primary Room identity stays fixed; additional origins use related links. Requests replay against their original operation receipt, even if later revisions exist. Hosts choose grouping keys, including separate periods for recurring obligations, and must validate link ownership and actual source evidence in `authorize`.

An extractor's delta is not a replacement snapshot. The host merges new facts with the current situation, preserving prior deadlines, responsibility and evidence unless a verified correction supersedes them. Missing fields in the next source message do not prove earlier facts ceased to apply; expected revisions prevent concurrent writers from silently replacing a newer state.

States are `open`, `waiting`, `snoozed`, `resolved` and `dismissed`. Snoozing requires a future time. Closing requires an explicit owner instruction or evidence; reading, absence and policy alone cannot resolve a matter. A machine cannot assert an authenticated human instruction. Reopening a terminal situation likewise needs new evidence or an owner instruction. These checks verify cause type and authenticated origin; semantic verification that a message actually proves completion remains host policy.

`read`, paginated `history`, `list` and `changes` recheck authorization. Multi-Room queries require an explicit authorized set of primary Rooms. Opaque cursors bind tenant, query type and Room set; adding/removing a Room requires a new query/snapshot. Change feeds retain versions with provenance and authorize against the current head as well as the historical record. PostgreSQL serializes journal writers per tenant/domain so sequence cursors do not skip a lower sequence committed after a higher one.

A Master-style application composes these situation changes with existing Room event pages for messages/results. The framework does not create a Master Room or implicitly read every Room. It remains possible to query non-urgent tracked matters without proactively announcing them.

## Durable learning proposals

`MemoryProposalServiceV1` adds a review lifecycle alongside the existing `MemoryRevisionServiceV1`. Direct explicit owner instructions can still use the existing memory append API. Inferred patterns use `propose` and stay outside active memory until acceptance; this is context persistence, not model-weight training.

A proposal fixes its memory destination, expected memory revision, subject, audience, content, evidence and reason. Subjects remain generic (`person`, `room`, `agent`, or a host-defined subject); memory audience/permission checks are unchanged. Hosts authorize proposing and reading independently and supply the appropriate personal/shared discovery index. Readable memory snapshots for agents must retain the existing audience and source permissions; proposals do not grant new access.

`accept` and `reject` require a separately authenticated human decision and a verified interaction reference. Personal proposals require their owner; shared audiences use the host's authorization policy. Do not expose a model-callable acceptance tool using ambient owner credentials. The access port must distinguish actual owner interaction from an agent operating on the owner's behalf.

Apply the same distinction at the raw memory-write port: inferred personal preferences must not bypass review by calling `append` with ambient owner credentials. Direct explicit owner instructions remain authorized writes. The proposal service composes existing memory authority; it does not revoke separate write grants installed by a host.

Acceptance first persists an `accepting` decision, then appends to the existing memory ledger with a deterministic operation identity, then stores the accepted memory revision/digest. Concurrent rejection cannot overtake an admitted acceptance. A crash after memory commit resumes the same internal operation and does not create a second memory revision. The original deciding principal and decision identity are required for replay.

If a newer explicit memory revision already occupies the intended slot, the proposal becomes `conflicted`; it cannot overwrite that revision. Create a refreshed proposal for a new decision rather than silently updating the expected memory revision. Rejection never writes active memory. Retiring accepted knowledge uses the existing explicit memory retirement API; the proposal stays as an audit record, not an active preference. Unknown authorization/storage outcomes retain a recoverable `accepting` state rather than guessing whether the write happened.

## Storage and consumer verification

Portable adapters:

- `InMemoryIncrementalEvidenceStoreV1` / `PostgresIncrementalEvidenceStoreV1`.
- `InMemoryRoomSituationStoreV1` / `PostgresRoomSituationStoreV1`.
- `InMemoryMemoryProposalStoreV1` / `PostgresMemoryProposalStoreV1`.
- Existing memory-revision stores remain the only owner of accepted memory.

PostgreSQL adapters are in `@agentplat/rooms-postgres`, with an explicit direct dependency on the event contracts. Initialize with `runIncrementalEvidenceMigrations` and `runRoomFollowupMigrations`; memory still uses `runMemoryRevisionMigrations`. These three ledgers are independent of the base Room migration head. Constructors do not migrate or access the network. Their status and destructive rollback APIs follow the existing migration conventions; dropping follow-up tables does not drop accepted memory revisions.

Run `node examples/incremental-followup.mjs` after building to exercise personal-mail and support-ticket consumers with the same APIs, simulated analysis and a deliberate partial-projection crash. No provider or paid model is used. Shared memory/SQL scenarios cover exact retries, source/cursor races, uncertainty, retained identities, more than 1,024 events, compaction, multi-Room cursors, proposal decisions and retirement. New-pool integration tests recover a stored analysis, its partially written situation and accepted memory together. These establish bounded software behavior, not extraction quality or production provider reliability.

Next platform increment: shared periodic budgets, scheduled activations and notification policy. Provider integrations, user-specific importance, the Master UI and delivery channels remain application work.
