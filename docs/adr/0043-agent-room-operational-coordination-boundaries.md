# ADR 0043: Agent Room operational coordination boundaries

- Status: Accepted
- Date: 2026-08-21

## Context

Agent Room needs durable coordination, resumable execution, typed transfers of
work, progressive plans, live projections and optional infrastructure adapters.
These capabilities must not create a second source of truth beside the Room
aggregate, grant authority through transport state, or force applications to
install a particular workflow engine or work-management provider.

## Decision

1. A persisted human or agent `RoomMessage`, its domain event and its initial
   coordination item are committed by one `RoomRepository` transaction.
2. `AgentRoomCoordinationWorker` discovers ready Room-scoped coordination state
   and processes it with revision fencing, leases, heartbeat renewal, bounded
   retries and graceful drain. Stable operation IDs fence duplicate effects.
3. PostgreSQL remains authoritative for Room and operational state. A
   transactional operational stream records committed transitions and durable
   projection checkpoints make replay idempotent.
4. AgentPlat Handoffs are typed, revision-bound, authority-bounded records.
   Free-form output and tool calls can propose them, but only the Handoff
   lifecycle and Room policy authorize their execution.
5. AgentPlat Planner materializes only dependency-complete steps. Room events
   reconcile step progress and terminal plan status before unlocking more work.
6. AgentRoom LiveView discovers Room-scoped projections server-side. Client
   identifiers are optional filters, not completeness requirements.
7. Temporal is an optional durable-workflow adapter. Its workflow signals and
   histories wake the canonical coordination runtime; they do not own Room
   state or domain authority.
8. Work-management adapters, including the Asana reference adapter, are
   optional projections for human contribution delivery. External task state
   never completes or overrides an AgentPlat contribution automatically.

## Consequences

- Applications can run the in-process worker or Temporal without changing the
  Agent Room domain contracts.
- A committed message cannot exist without its initial coordination work when
  automatic coordination is enabled.
- Projectors and external providers must be replay-safe and idempotent because
  a crash may occur after an effect and before a local checkpoint.
- PostgreSQL upgrades require the ordered migrations documented in
  `docs/agent-rooms-postgres-migration.md`.
- New workflow or work-management providers belong in optional adapter packages
  and must preserve the same authority boundary.
