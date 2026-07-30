# ADR 0004: Agent Mesh is a separate distributed collaboration layer

- Status: Accepted
- Date: 2026-07-29

## Context

AgentPlat currently separates provider-neutral model I/O, local agent execution,
ephemeral Sessions and durable Agent Rooms. Sessions intentionally use a fixed
round-robin scheduler. Rooms intentionally centralize governed task execution
around one durable aggregate.

Distributed peers have different failure and consistency requirements. They
must tolerate partial views, duplicate and reordered messages, partitions,
stale executors and temporary loss of the control plane. Adding those semantics
to Sessions or `RoomService` would weaken their existing guarantees and make
the public runtime depend on distributed infrastructure.

## Decision

Introduce Agent Mesh as a sibling collaboration layer over the existing public
runtime.

An Agent Mesh:

- consists of independently executing Mesh Peers;
- gives every peer a bounded, partial view of other peers;
- discovers capabilities through expiring, signed declarations;
- admits peer identities through an explicit local policy and never treats a
  self-signed declaration as authority by itself;
- allocates work through offers, bids, awards and leases;
- uses epochs and fencing to reject stale completion and action attempts;
- combines evidence through explicit claims, attestations and local policies;
- keeps peer trust local, scoped and non-authoritative;
- continues accepted work without a scheduler, global directory or shared
  database;
- treats Rooms and other control-plane services as optional configuration and
  observation boundaries.

The initial public packages are:

- `@agentplat/mesh-protocol`;
- `@agentplat/mesh-crypto`;
- `@agentplat/mesh`;
- `@agentplat/inference-control`;
- `@agentplat/mesh-sim`.

Reference transports and Room integration remain separate adapters. Agent Mesh
packages are not re-exported from `@agentplat/framework` while their contracts
are in alpha.

## Consequences

- `AgentRuntime` remains the local execution boundary and does not gain
  distributed scheduling behavior.
- `MultiAgentSession` remains the deterministic centralized baseline.
- `RoomService` remains the durable governance layer and is not in the Mesh hot
  path.
- Applications may run Agent Mesh entirely in memory or provide their own
  transport, identity and persistence adapters.
- Protocol delivery, replay, recovery and resource limits require dedicated
  contracts and tests.
- A hosted control plane may configure and observe a Mesh, but public peers
  retain enough local state to continue within accepted objectives and budgets
  while their required data, credentials, policies and peers remain available.
