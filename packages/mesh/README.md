# `@agentplat/mesh`

Provider-neutral state, input and effect contracts for independently executing
AgentPlat peers.

The package is additive to the existing Runtime, Sessions and Rooms surfaces.
Its peer kernel is defined as a synchronous state transition:

```text
state + input + logical time -> next state + ordered effects
```

The initial alpha contract covers preprovisioned peer admission, accepted
membership messages, bounded replay state and observable effects. Work
allocation, leases and recovery are introduced in later preview releases.

`@agentplat/mesh/loopback` contains contracts for the in-memory signed transport
used by the local vertical slice. Importing either entrypoint performs no
network, clock, storage or key operations.
