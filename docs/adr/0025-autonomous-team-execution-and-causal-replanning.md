# ADR 0025: Team execution is local, reference-driven and causally recoverable

- Status: accepted
- Date: 2026-08-07

## Context

Dynamic team formation selects complementary members and composes their
existing individual Work Contracts, but it intentionally does not execute the
resulting position graph. Applications need a portable way to run those
positions, make dependency results available to successors and replace a
failed member without rerunning unrelated completed work.

A central team scheduler would require a global graph view and create a shared
failure domain. Storing model output in coordination state would expand the
privacy and replication boundary. Treating a joint contract as execution
authority would bypass the individual leases, epochs and fencing tokens that
already protect effects.

## Decision

Add the opt-in, browser-safe
`@agentplat/collective-runtime/team-execution` entry point.

Each peer operates the same deterministic position state machine over an exact
activated team epoch. Positions become locally executable only when their
declared predecessors have completed. The runtime persists a prepared dispatch
before calling an external member executor; its digest is the idempotency key
for retries.

Member execution is delegated to a bound portable-agent session. That runtime
continues to own provider invocation and its configured inference controls.
The team runtime accepts only content-addressed result references and verifies
their availability before settlement or dependent execution.

Failure, unsafe refusal or expiry creates one recovery signal bound to the
exact position, member, result and joint contract. Existing team formation
selects and activates a replacement. Rebinding advances the execution epoch
and invalidates the failed position plus its complete downstream dependency
closure while retaining only an unaffected completed subgraph.

Neither a dispatch, artifact nor joint contract grants tool or effect
authority. Existing action gateways must continue to validate the executing
member's own Work Contract and fence.

## Consequences

- Teams can execute multi-position workflows without a global scheduler.
- Durable result references form an explicit causal dataflow between peers.
- Recovery reuses unaffected work and deterministically replays the impacted
  subgraph.
- Availability decreases when artifacts, controls, contracts or epoch
  continuity cannot be verified.
- Applications must provide idempotent member execution, durable artifact
  publication, durable compare-and-swap state and existing effect enforcement.

## Alternatives considered

### Central workflow scheduler

Rejected because it introduces a global view and a shared coordination and
availability domain.

### Persist raw member output

Rejected because it widens the sensitive-data boundary and makes replicated
execution state unsuitable for heterogeneous peers.

### Restart the complete team after any failure

Rejected because it discards valid independent work and obscures the causal
scope that actually requires replay.
