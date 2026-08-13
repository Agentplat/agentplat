# ADR 0029: One peer host composes distributed collective capabilities

- Status: accepted
- Date: 2026-08-07

## Context

Agentplat exposes independent planning, formation, execution, exchange,
adaptation and continuity runtimes. That separation preserves authority
boundaries, but applications currently have to invent authentication routing,
worker ordering, lifecycle, backpressure and readiness composition. Different
hosts can therefore integrate the same safe primitives inconsistently.

## Decision

Add the opt-in `@agentplat/collective-runtime/host` entry point as a thin,
transport-neutral composition root.

The host verifies or accepts already verified Mesh envelopes, classifies each
message exactly once and routes it to one durable admission port. Unknown or
ambiguous routes fail closed. A deterministic bounded `runOnce()` advances the
configured subsystems fairly; `restore`, `start`, `drain` and `status` provide a
single scheduler lifecycle and status surface. Subsystem restoration and
readiness remain the responsibility of their injected ports. Formation,
execution, continuity and structure adaptation remain replaceable structural
ports with their original authority semantics. Certified decisions,
mechanism-aware allocation and coordination control are additive optional ports
exposed by the same facade; the host delegates to them without converting
advisory output into assignment or effect authority.

The host does not own a global plan, peer directory, keys, transport, database,
model provider or effect authority.

## Consequences

- Applications gain one production-facing integration surface without collapsing
  domain boundaries.
- Stale topology pauses dispatch and never broadens authority.
- Each subsystem retains its own durable CAS state and recovery semantics.
- Server transports and persistence packages adapt to the host through ports.

## Alternatives considered

Adding orchestration to the existing peer-node runtime was rejected because it
would couple its closed planning payload registry to every optional extension.
A server-only host was rejected because it would force transport and persistence
choices into the open-source runtime.
