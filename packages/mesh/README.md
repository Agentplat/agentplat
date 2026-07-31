# `@agentplat/mesh`

Provider-neutral state, input and effect contracts for independently executing
AgentPlat peers.

The package is additive to the existing Runtime, Sessions and Rooms surfaces.
Its peer kernel is defined as a synchronous state transition:

```text
state + input + logical time -> next state + ordered effects
```

The Alpha 1 implementation provides:

- deeply immutable peer, admission, liveness and replay snapshots;
- a synchronous pure reducer for lifecycle inputs, outbound liveness probes
  and effect results;
- the `processMeshEnvelope` coordinator, which applies context, cryptographic
  verification, preprovisioned admission, authority, replay, idempotency and
  causality before invoking a reducer;
- a 2,048-position sequence window per admitted peer instance;
- Mesh-wide message-ID retention for at least the protocol lifetime plus twice
  the clock-skew allowance;
- bounded pending preparations and pings, with acknowledgements consumed once
  and only from the intended peer;
- two-phase outbound delivery (`message.prepare` then `message.deliver`) so
  causal state is committed before signed bytes are released; and
- deterministic, redacted and ordered effects.

`createMeshPeerState` is the supported construction path. It validates and
freezes local identity, preprovisioned peers and resource limits.
`ALLOW_PREPROVISIONED_MESH_ADMISSION` accepts the preprovisioned table as the
complete baseline; a stricter synchronous `MeshAdmissionPolicy` may be supplied
per inbound boundary, but it cannot admit identities absent from local state.

Only `processMeshEnvelope` can invoke the package-internal accepted-envelope
transition. The public reducer has no accepted-message input, and successful
decisions expose verified data rather than a reusable capability. A rejected
envelope returns the original state reference and produces no effects.

The coordinator validates canonical, bounded identity, admission, peer, replay,
message-ID, preparation and causal state before cryptographic work. Logical time
is monotonic across reducer and inbound transitions.

The additive `@agentplat/mesh/coordination` subpath provides the Alpha 2 runtime
foundation without changing the Alpha 1 state, limits, input or effect
contracts. It defines a strict schema-versioned snapshot with bounded redacted
domain-record metadata, generation-fenced trusted timers and a bounded decision
journal. Its pure timer evaluator uses only injected logical time; an early,
stale or duplicate generation cannot mutate state, and journal exhaustion
fails closed before a due timer is consumed.

The generic coordination timer evaluator refuses workflow-owned
`objective.expiry`, `work.deadline` and `lease.expiry` timers. Those timers are
evaluated only by their Objective/Work or Allocation workflow evaluator, so
the generic path cannot consume or reinterpret them.

The foundation does not schedule host timers. Driver integration is added only
with the workflow increment that first creates each timer, so a public effect
cannot be emitted before loopback and simulation drivers know how to interpret
it.

The same subpath now exposes an independently versioned discovery projection.
Local admission is explicit and separate from Peer Cards; a card can refresh
only an admitted identity and cannot extend admission validity. Verified Peer
Card and capability records update causal high-water projections with hard
entry and encoded-byte ceilings. Expiry and passive-view eviction use injected
logical time and canonical ordering. Runtime composition also checks that every
routable projection is backed by the corresponding accepted domain record and
that sibling instances cannot mutate each other's discovery heads.

`matchMeshDiscoveryCapabilities` returns deterministic local matches and reason
codes from unexpired self-claims. `selectMeshDiscoveryTopicRecipients` resolves
a bounded recipient set only from the caller's local Peer View. Neither API
returns assignment authority, epochs, leases or fencing tokens. The evaluator
accepts only `VerifiedMeshEnvelope` values.

`createMeshDiscoveryInboundProcessor` constructs the authenticated coordination
boundary. It snapshots trusted local key resolution, cryptographic policy, Web
Crypto and protocol options outside the remote-message path. Each request then
contains only the envelope and trusted receiver times. The processor revalidates
scope, audience, freshness and critical extensions before the reference
verifier, then applies configured admission, instance ownership and an
independently restorable replay snapshot before the discovery projection.
Resolver lookup is synchronous by contract and cannot hide network I/O.
Rejections before replay return the original composite state; an authenticated
message that reaches replay but fails a domain transition retains replay
accounting without changing discovery or domain state. Rejection codes are
local diagnostics, not transport response payloads; adapters must rate-limit
ingress and avoid exposing cryptographic distinctions. Topic receipt never
relays or emits effects.

`createMeshCoordinationTopicDriver` is the final Increment 1 coordination-only
driver. It is an additive, bounded in-memory reference driver, not a production
transport or durability mechanism. Its process-local registry is a route table,
not membership: it selects recipients only from the publisher's local active
Peer View, joined to endpoints registered for those exact current instances.
It never consults a global recipient oracle, supplies a complete membership
view, fans out beyond that snapshot, or forwards a received envelope.

The driver copies the exact signed envelope for every selected recipient into
one atomically accepted bounded FIFO queue and serializes delivery. Each
receiver is invoked only through its construction-bound trusted clock and
inbound processor. Public receipts deliberately coarsen rejection details to
`accepted`, `rejected` or `unavailable`; detailed codes remain local diagnostics
and cannot be used as a remote validation oracle.

The first Increment 2 slice adds a separate Objective and Work Item projection.
`createMeshObjectiveWorkState` provisions bounded issuer peer/key authority;
`createMeshObjectiveWorkRuntimeState` composes it with aligned coordination and
discovery snapshots. Strict restoration binds each Objective's coordination
domain record to its `objectiveId`, retains the complete signed envelope and
derived policy for every accepted Objective revision under a hard non-evicting
limit, and canonicalizes each Work Item to that exact immutable policy head.
Restore validates the closed envelope, recomputes the canonical SHA-256 payload
digest, checks derived wall/logical expiry metadata and binds the result to the
accepted domain record. A cancelled head also retains its signed cancellation
envelope and binds its payload, digest, message, cause and trusted validation
time to the terminal record. It rejects missing, forged, orphaned or
cross-revision bindings. Objective revision `1`, exact next revisions,
cancellation and expiry are causal and terminal. An issuer may rotate among its
currently provisioned keys, but another issuer peer cannot take over an
Objective.

Local `work.create`, `work.revise` and `work.cancel` commands derive local
ownership and the exact next Work Item revision. They use only caller-injected
trusted wall and logical time, enforce the current Objective's capability,
Work Item-count, per-Work budget and deadline ceilings, and reject without
mutation when journal, timer or projection capacity is unavailable. Stable
length-prefixed timer IDs avoid ambiguous composite identifiers; exact
generations fence both Objective expiry and Work deadlines. RFC 3339
sub-millisecond differences use exact nanosecond arithmetic and round a
positive remainder up to one logical millisecond. A later Objective revision
governs later Work revisions but does not rewrite an existing Work Item or its
timer binding. Any attempt to create a timer whose stable ID collides with a
different existing timer fails closed.

`evaluateVerifiedMeshObjectiveEnvelope` is a pure already-verified boundary. It
revalidates closed protocol structure, context, admission instance and
provisioned issuer authority, but it does not perform signature verification or
replay accounting. Network adapters must not invoke it with merely parsed or
self-asserted values. Snapshot restore verifies the retained canonical payload
digest but does not resolve keys or reverify the proof, so persisted snapshots
must be integrity protected by the driver.

`createMeshObjectiveInboundProcessor` is the authenticated ingress boundary for
Objective messages. It shares the discovery replay and retained-message-ID
security snapshot, and applies checks in this order: context, cryptographic
verification, exact admission and issuer authority, replay accounting, then the
Objective domain transition. An authenticated message that reaches replay but
is rejected by the Objective domain retains normal security accounting while
leaving the domain projection unchanged. The runtime state contains immutable,
identity-aligned coordination, discovery, Objective and inbound-security
snapshots. If discovery alone advanced logical time, Objective evaluation uses
an ephemeral clock-aligned view without rewriting the Objective projection.

`createMeshCoordinationObjectiveTopicDriver` is the corresponding bounded,
in-memory Objective delivery driver. It selects recipients only from the
publisher's local active view, then captures registered routes for those exact
peer instances. It atomically admits copied signed envelopes to a bounded FIFO
queue and invokes the registered Objective inbound processor with a
construction-bound clock. Receipts expose only `accepted`, `rejected` or
`unavailable`; detailed rejection information is local diagnostic data. The
driver is sender-local: it provides no forwarding, global membership view,
durability or delivery guarantee.

An exact historical Objective record is idempotent only after this evaluator
has applied the current structure, context, admission, issuer-authority and
freshness checks; it cannot use duplicate handling to bypass them or restore an
older Objective head.

The Alpha 1 root runtime continues to accept direct peer audiences and its
`peer.hello`, `peer.ping` and `peer.ping_ack` workflows only. The explicit
coordination subpath now projects already-verified discovery and Objective
records plus local ready Work Items.

The first Allocation sub-slice adds a separately versioned, immutable
projection for a local owner's first offer attempt. The owner supplies one
recipient-specific, already-signed direct `work.offer` envelope for every
candidate selected from its bounded local capability view. The reducer validates
the exact envelopes and retains each recipient's `messageId`; a verified direct
`work.bid` must causally name that exact message ID. Bid replacements are
causal and revision-monotonic, retained signed evidence is bounded, and
deterministic selection is read-only: lowest budget units, earliest expected
completion, peer ID, then bid ID.

Opening that first offer reserves the Work Item's budget immediately and
creates a generation-fenced bid-deadline timer. When due, the timer closes the
offer and releases its reservation exactly once. The local signer that prepares
offer envelopes is a trusted driver boundary; this reducer does not verify a
signature itself.

The owner-side award increment extends that projection with one prepared,
signed direct `work.award` envelope for the current deterministic bid. Awarding
atomically closes the bid window, replaces its timer with a generation-fenced
acceptance timer and keeps the reservation reserved. Already-verified direct
`work.accept` and `work.decline` responses are accepted only from the awarded
assignee with exact award-envelope causation, current Objective/Work bindings,
initial epoch and matching authority/token. The acceptance deadline is
exclusive: acceptance moves budget reserved-to-committed and activates the
owner's Work projection; decline or timeout releases it exactly once.
Rejected award and assignment-response inputs expose phase-specific stable
codes (`award_*`, `assignment_*` and `assignment_response_*`) so telemetry does
not misclassify them as offer or bid failures. Replaying the exact same signed
response is idempotent; reusing its ID or message ID with any different signed
envelope is a conflict.

After a reservation is released, a later offer uses exactly the next attempt
number and names the preceding offer. It opens a fresh bounded bid window and
reserves the same Work Item budget anew; it cannot rewrite the Work revision or
reuse the original attempt.

This owner-side state-machine increment establishes allocation. A later
execution-lifecycle slice consumes its accepted assignment authority; a valid
signature or admission entry alone never grants execution authority.
Reassignment and recovery remain deferred.

The paired assignee-side allocation slice accepts an already-verified direct
`work.award` only for the local peer and only when it proves the peer's retained
prepared bid and recipient-specific offer-envelope causation. Offer and award
intake independently enforce the current accepted Objective document and its
budget, capability and timing limits. Later offers preserve immutable Work
terms and require the exact predecessor offer and envelope causation after
predecessor closure. Its separately restorable bounded
projection retains the signed award, epoch, authority, fencing token, lease and
exclusive response deadline. Before that deadline, the local peer can commit
one prepared signed `work.accept` or `work.decline` and emit its dispatch
effect; exact retries are idempotent and conflicting reuse is rejected without
mutation. A successful local acceptance retains the initial assignment
authority. A due generation-fenced local response deadline closes the local
award without sending a response, and dispatch is not evidence that the owner
received a response.

The execution-lifecycle slice accepts locally prepared or authenticated inbound
`work.progress`, `work.checkpoint`, `work.result`, `work.release` and
`work.cancel` records. It retains bounded signed records and an assignment-scope
head, enforces direct audience and role authority, exact Objective/Work and
assignment bindings, current epoch and fencing token, causation and sequence
rules, and trusted Work/current-lease deadlines. Progress and checkpoints are
append-only; a result, release or cancellation is terminal and later ordinary
records are rejected. Exact replay is idempotent while identifier or canonical
content reuse conflicts fail closed. Owner cancellation of a pending award
releases its reservation; terminal active execution does not reverse committed
Objective budget accounting.

Accepted assignments immediately materialize a sequence-zero lease head and a
generation-fenced expiry timer. A locally prepared or authenticated direct
`lease.renew` record may extend only the current active lease while preserving
its assignee, epoch, authority and fencing token. Renewals form one exact
bounded predecessor chain, obey Objective duration/count and Work deadlines,
and replace the active timer generation atomically. Expiry is terminal for that
authority but retains all original assignment and renewal evidence. Terminal
execution retires the active lease timer and head without rewriting historical
records. Release and active cancellation causally name the latest accepted
renewal when one exists. Assignee execution and release remain lease-bound; the
owner may still close or cancel an expired assignment before the Work deadline.

Allocation snapshots now use schema version 5. Restore migrates versions 1–4
deterministically, derives sequence-zero lease heads and missing initial expiry
timers for legacy accepted assignments, and derives conservative bounded
limits. Strict restore revalidates retained envelopes, causal/domain bindings,
each signed renewal's complete authority and derived logical deadline, current
lease heads, historical execution deadlines, timer generations, terminal heads
and accounting before exposing the immutable snapshot.

`createMeshAllocationInboundProcessor` authenticates Allocation traffic before
domain evaluation. It construction-binds key resolution and cryptographic
policy, then orders context, signature verification, exact admission and
instance authority, replay accounting and the allocation transition. A signed
execution record rejected by the domain still consumes normal replay security
accounting; diagnostics remain local. The same boundary accepts authenticated
`lease.renew` records only after replay and admission checks. This slice does
not implement recovery certificates, reassignment, durable execution storage
or external-action authority.

`@agentplat/mesh/loopback` provides the explicit in-memory signed transport used
by the local vertical slice. `createMeshLoopbackTransport` owns composite
tenant/Mesh/peer routing, bounded FIFO delivery and per-peer serialization.
Registered peers use the same `processMeshEnvelope` boundary as future
transports. Outbound sequence allocators are included in restart snapshots,
duplicate batches repeat the exact signed envelope, and cooperative close
drains already accepted work.

Importing either entrypoint performs no network, clock, storage or key
operations. Clocks, message-ID sources, signers, keys and verification policy
are supplied explicitly when a peer is registered.
