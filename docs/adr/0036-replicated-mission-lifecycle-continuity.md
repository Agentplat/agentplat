# ADR 0036: Replicated mission lifecycle continuity

- Status: accepted
- Date: 2026-08-07

## Context

The governed mission lifecycle persists a content-free saga containing scope
identifiers, counters, digests, prepared operation identities, and applied
receipts. A process failure must not discard that state, repeat a confirmed
effect, or allow a new process to select its own authority.

Ordinary database replication is insufficient as an application contract. A
consumer needs evidence that a specific, policy-bound lifecycle revision is
available, belongs to one checkpoint lineage, and may be restored by the
currently authorized holder.

## Decision

Provide a provider-neutral `mission-continuity` runtime with four explicit
durable phases:

1. `snapshot` validates and captures an exact `GovernedMissionStateV1`.
2. `replicate` obtains an availability certificate for the candidate
   checkpoint.
3. `checkpoint` commits the certified candidate as the lineage head.
4. `takeover` restores the exact lifecycle state through a destination CAS.

Each phase has a stable caller-supplied operation ID and a durable
`prepared`/`applied` outbox record. Retrying an interrupted phase reuses that
identity and its artifact digest. Reusing an ID for different input is
equivocation and fails closed.

The snapshot embeds the complete lifecycle state, which is itself
reference-only. The snapshot and candidate checkpoint bind:

- lifecycle state key, revision, and digest;
- complete validated lifecycle state and predecessor checkpoint;
- mission scope and policy digests;
- authority ID, authority epoch, fencing token, holder generation, and holder;
- creation logical time.

The availability certificate binds the checkpoint and authority digests, a
canonical replica set, threshold, and certification logical time. Availability
is verified before checkpoint commit and again before takeover.

Authority is an input from an external authority port. The continuity runtime
does not elect holders. A takeover requires a newer holder generation whose
authority explicitly names the checkpoint as its resume point. The underlying
mission authority ID, epoch, fence, scope, and policy remain identical; rotating
those coordinates requires a separately governed mission transition.

The restore boundary is a dedicated durable CAS port. It may atomically install
the checkpoint revision over an older local revision. It rejects a newer local
revision as rollback and a different state at the same revision as
equivocation. An exact existing digest is an idempotent success.

## Applied-effect semantics

Continuity never calls decision, allocation, formation, execution, control, or
reconfiguration ports. It copies the validated lifecycle state exactly.
Consequently:

- `applied` outbox records and their authorization/result digests remain
  applied and are not dispatched again;
- a single `prepared` operation retains its operation and intent identities so
  the lifecycle's normal recovery path can decide how to resume it;
- completed and paused states remain terminal or paused after restore.

## Failure model

Artifact repositories and restore ports can succeed immediately before a
process interruption. A retry discovers the artifact by stable ID or observes
the exact restored state, then completes the local applied receipt. CAS
conflicts are retried within a bounded limit. Logical time cannot regress.

The public in-memory implementations are deterministic composition aids. A
production deployment must provide durable, linearizable storage, immutable
artifact retention, authoritative currentness checks, and an availability
certificate backed by independent replicas. The continuity store must also
advance a rollback-resistant monotonic anchor atomically with each successful
save; loading a missing, older, or same-revision divergent snapshot fails
closed.

## Consequences

- Mission execution can move between process instances without replaying
  confirmed effects.
- Checkpoints are independently verifiable and provider-neutral.
- The runtime rejects rollback, lineage forks, stale authority, changed policy,
  and availability ambiguity.
- Consumers must operate an authority service, artifact repository,
  availability certifier, continuity CAS store, and lifecycle restore CAS.
- The continuity CAS store and its external monotonic head form one durable
  commit boundary in production.
- Checkpoints intentionally retain lifecycle metadata and digests, but no raw
  mission text, model input, tool payload, or result content.
