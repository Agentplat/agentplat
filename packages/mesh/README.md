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
`objective.expiry` and `work.deadline` timers. Those timers are evaluated only
by the Objective/Work workflow evaluator, so the generic path cannot consume
or reinterpret them.

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
must be integrity protected by the driver. The authenticated shared replay
boundary and Objective topic delivery are the next Increment 2 slice.

An exact historical Objective record is idempotent only after this evaluator
has applied the current structure, context, admission, issuer-authority and
freshness checks; it cannot use duplicate handling to bypass them or restore an
older Objective head.

The Alpha 1 root runtime continues to accept direct peer audiences and its
`peer.hello`, `peer.ping` and `peer.ping_ack` workflows only. The explicit
coordination subpath now projects already-verified discovery and Objective
records plus local ready Work Items. Allocation, execution, lease and recovery
records remain unsupported until their state, authority and reducer increments
are implemented. A valid signature or admission entry does not grant that
authority.

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
