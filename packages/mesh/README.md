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

The foundation does not schedule host timers or accept Alpha 2 envelopes.
Driver integration is added only with the workflow increment that first creates
each timer, so a public effect cannot be emitted before loopback and simulation
drivers know how to interpret it.

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

Actual topic driver delivery remains the final Increment 1 slice.

The runtime currently accepts direct peer audiences and the Alpha 1
`peer.hello`, `peer.ping` and `peer.ping_ack` workflows only. Structurally valid
Alpha 2 discovery, allocation, lease and recovery records remain
`unsupported_message_type` until their state, authority and reducer increments
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
