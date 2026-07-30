# ADR 0007: Mesh simulation executes production state machines

- Status: Accepted
- Date: 2026-07-29

## Context

Distributed recovery behavior is difficult to validate with real clocks,
networks and models. A second, simplified implementation inside a simulator
would be easier to make deterministic, but its results would not demonstrate
how production code behaves.

## Decision

The Mesh peer kernel is a synchronous state transition:

```text
state + input + logical time -> next state + ordered effects
```

The reducer does not read clocks, randomness, storage, networks, tools or model
providers. Those operations are emitted as effects. Production drivers
interpret effects with real adapters; `@agentplat/mesh-sim` interprets the same
effects with virtual adapters.

The simulator uses:

- integer logical time;
- a versioned, seedable pseudo-random generator with scoped substreams;
- a priority queue ordered by logical time, priority and insertion sequence;
- immutable events and explicit limits on time and event counts;
- deterministic topology and fault plans;
- full, digest and metrics-only recording modes;
- chained event digests and version-scoped deterministic replay;
- invariant monitors after every event.

Faults are injected at adapter boundaries. Production reducers contain no
simulation branches. Model responses used by deterministic gates are recorded
or supplied by `@agentplat/runtime-mock`.

Replay is exact only for the same peer reducer, protocol schema, pseudo-random
generator version, configuration digest and complete set of recorded external
effects. Chained digests detect divergence; they do not make an unrecorded input
deterministic.

## Consequences

- The same reducers are exercised by local development, production drivers and
  scale scenarios.
- A failed scenario records its seed, configuration digest and first divergent
  event.
- Replay equality covers ordered state transitions and emitted effects, not host
  performance or wall-clock timing.
- The simulator may observe global state only to check invariants; peers cannot
  read that state.
- Performance tests can model large numbers of logical peers without creating
  one process or model call per peer.
- Real transport and persistence adapters still require separate integration
  tests.
