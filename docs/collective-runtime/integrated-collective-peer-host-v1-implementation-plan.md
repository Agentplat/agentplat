# Integrated Collective Peer Host V1 implementation plan

Status: implemented

## Product outcome

Give an application one provider-neutral routing and scheduler lifecycle for an
operational collective peer while preserving the separate lifecycle, authority
and durability boundaries of its planning, formation, execution, exchange and
adaptation components.

## Public surface

`@agentplat/collective-runtime/host` provides:

- verified inbound classification and unambiguous durable routing;
- bounded, fair worker scheduling through `runOnce()`;
- `restore`, `start`, `drain` and `status` lifecycle operations;
- command ports for formation, activation, execution and recovery;
- optional continuity and structure-adaptation hooks; and
- transport, topology, membership and persistence boundaries, plus reference
  claim, fixed-topology and clock adapters.

## Invariants

- one admitted envelope follows exactly one route;
- unknown, ambiguous or unsupported critical semantics fail closed;
- topology staleness can pause dispatch but cannot grant authority;
- acknowledgement follows durable admission;
- each subsystem owns its state and idempotency boundary; and
- a bounded cycle prevents one subsystem from starving the others.

## Integration sequence

1. Freeze routing, lifecycle, readiness and subsystem port contracts.
2. Implement validation, deterministic routing and the bounded worker loop.
3. Add formation/execution command composition and status reporting.
4. Attach ownership continuity and structure adaptation as optional ports.
5. Export a packed, provider-neutral public entry point.

Structure-driven formation requires a fresh formation runtime. V1 never
rewrites the positions of an active team in place.

## Completion criteria

One restored host can route allocation and execution messages, progress a team
flow, recover a coordinator-owned execution and feed its final outcome into a
future structure choice. Restart preserves subsystem state when the injected
ports are durable, and stale topology pauses dispatch without mutating
authority.
