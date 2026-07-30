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

Alpha 1 accepts direct peer audiences only. Mesh-topic intake, work allocation,
leases and recovery are introduced in later preview releases.

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
