# ADR 0028: Team structures adapt locally from bounded outcome evidence

- Status: accepted
- Date: 2026-08-07

## Context

Team formation selects members for caller-supplied positions, while execution
records the result. The next formation cannot use those outcomes to prefer a
different approved structure, so parallelism, specialization and dependency
shape remain static even when local evidence consistently favors another form.

## Decision

Add the opt-in
`@agentplat/collective-runtime/team-structure-adaptation` entry point.

Each peer owns a bounded learner over an immutable, policy-approved catalog of
team structure templates. It derives content-free observations from validated
execution state and updates deterministic integer scores through CAS. Baseline
floors, minimum samples, exploration limits, cooldown, hysteresis and quarantine
bound change. Unsafe or failed outcomes cannot improve a template.

A selection is advisory and applies only to a future adaptation cycle.
Materialization produces ordinary team-formation positions for a fresh
formation runtime at team epoch 1; formation still enforces coverage, budget,
diversity, member eligibility and individual Work Contracts.

## Consequences

- Repeated execution outcomes can change future team topology without a global
  optimizer or global reputation score.
- Peers with different local evidence may preserve useful structural diversity.
- Active teams never mutate in place.
- The catalog owner remains responsible for approving roles, capabilities and
  dependency graphs.

## Alternatives considered

Accepting an arbitrary scalar reward was rejected because it hides provenance
and permits callers to steer policy around safety outcomes. Generating new roles
or dependencies with a model was rejected because V1 must remain catalog-bound.
