# ADR 0002: Ephemeral multi-agent sessions

- Status: Accepted
- Date: 2026-07-14

## Context

Applications can use the public runtime for one agent generation and Agent
Rooms for durable governed work. Interactive simulations still had to own turn
order, bounded history, stop conditions, usage aggregation and orchestration
events. That duplicated substantial application code and produced incompatible
SSE payloads.

Putting this logic in a model adapter would couple scheduling to a vendor.
Putting it in `RoomService` would imply persistence and governance that an
ephemeral demo may not have. Reusing the workflow package would also mix a
process-state abstraction with conversational turn assembly.

## Decision

Introduce `@agentplat/sessions` as a provider-neutral layer over
`AgentRuntime`.

The first scheduler is deterministic fixed round-robin. It requires at least
two speakers and always enforces bounded rounds and bounded transcript history.
It supports content markers, a typed stop predicate and cooperative abort. It
emits a discriminated orchestration event union and preserves normalized model,
finish reason, usage and latency from completed runtime events.

Sessions are in-memory and ephemeral. They do not persist a Room, grant tool
permissions or claim durable audit. The framework facade may compose sessions
with the same runtime and tenant configuration used by quick runs and Rooms.

SSE helpers remain in `@agentplat/streaming`. They are generic over the common
`StreamEvent` shape, so runtime and session events use one versioned envelope
without introducing a Next.js, Express or browser framework dependency.

## Consequences

- Applications can replace custom simulation loops with one reusable public
  primitive while retaining their chosen model provider.
- Event payloads have stable speaker, round and turn fields, and clients can
  narrow them by event type.
- Fixed round-robin is intentionally less flexible than a graph scheduler.
  Dynamic routing and parallel turns require a future contract decision.
- Auditable simulations must explicitly write to an Agent Room or a future
  public audit sink; session events alone are not durable governance evidence.
