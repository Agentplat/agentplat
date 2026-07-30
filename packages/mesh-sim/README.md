# `@agentplat/mesh-sim`

Deterministic simulation kernel for AgentPlat Mesh peers.

The kernel uses the production `reduceMeshPeer` function for local commands and
the production `processMeshEnvelope` boundary for every remote delivery. There
is no simulation-only accepted-message path.

Alpha 1 provides:

- integer logical time and a total-order priority queue;
- versioned `xorshift32-v1` random substreams scoped by caller-defined names;
- explicit event, queue, logical-time and internal-step limits;
- signed message preparation and delivery across configured topology links;
- immutable SHA-256 state and chained trace digests;
- invariant monitors evaluated after every event;
- restart snapshots containing queue, PRNG and outbound allocator state; and
- replay comparison reporting the first semantic divergence.

Cryptographic handles, private keys and callbacks are runtime dependencies and
are excluded from configuration digests, snapshots and traces. Replays within
one test or process may reuse the same generated key handles; private material
is never serialized.
