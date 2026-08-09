# ADR 0027: Team execution authority and state move together

- Status: accepted
- Date: 2026-08-07

## Context

Distributed team execution can transport dispatches and results across peers,
but the coordinator still owns one local execution state. A lost or partitioned
coordinator can therefore stop progress even when members, artifacts and the
current work owner remain available. Copying state without authority fencing
would instead allow two coordinators to advance incompatible histories.

## Decision

Add the opt-in, provider-neutral
`@agentplat/collective-runtime/team-execution-continuity` entry point.

Continuity reuses the current Mesh `work_owner` scope for the root Work item.
It does not elect an owner. Before a dispatch becomes publishable, the runtime
binds the execution state to the current authority generation and fencing token,
creates a content-addressed checkpoint and requires an application-provided
availability certificate. Every mutating execution call carries the exact
authority and membership fence to an injected execution port that must enforce
it atomically at each durable CAS or effect boundary. The continuity store
applies the same fence to its own compare-and-swap.

A successor may resume only after validating its current authority, resolving
the latest certified checkpoint, verifying its lineage and importing it. Pending
dispatches retain their original identifiers so member-side idempotency remains
effective. With durable fence-aware ports and shared effect idempotency, stale
coordinators fail closed.

## Consequences

- Coordinator loss no longer implies loss of an otherwise recoverable team run.
- Authority, checkpoint lineage and dispatch identity remain independently
  verifiable.
- Permanent partitions preserve safety and may withhold progress.
- Durable production implementations must supply authority, checkpoint,
  certificate and CAS ports; in-memory adapters are composition aids only.

## Alternatives considered

Replicating a mutable coordinator store was rejected because it creates an
implicit multi-writer authority. Requiring an orderly handoff was rejected
because it cannot recover a permanently failed coordinator.
