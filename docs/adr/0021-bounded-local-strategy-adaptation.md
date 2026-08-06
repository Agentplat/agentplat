# ADR 0021: Local strategy adaptation is bounded by prior safety decisions

- Status: accepted
- Date: 2026-08-06

## Context

The peer runtime already makes local planning, offer, allocation and recovery
decisions from bounded state. Capability-state fusion, Trust, role alignment
and context integrity can conservatively remove unsafe choices. The remaining
selection rules are intentionally deterministic, but they cannot improve from
local outcomes when operating conditions change.

Allowing an agent or model to rewrite its own coordination policy would make
feedback a new authority path. It would also permit poisoned outcomes,
unbounded exploration, restart rollback and application-specific state to
silently widen the existing controls.

## Decision

Add the opt-in, provider-neutral
`@agentplat/collective-runtime/strategy-adaptation` entry point.

The controller selects only among an immutable catalog of implementation-bound
strategy identifiers. A policy names one safe baseline per operation, the
required safety dimensions, admitted feedback sources, learning and
exploration ceilings, unsafe-outcome quarantine rules and hard state limits.
It cannot create or execute a strategy implementation.

V1 uses bounded multiplicative weights. Eligible arms receive an exact
basis-point probability distribution. Exploration is capped by policy, the
baseline retains a policy floor, and the draw comes from a construction-bound
entropy port whose identity is recorded in decisions and snapshots. This
makes a test run reproducible without claiming that independently seeded peers
will choose the same arm.

Feedback must bind an unconsumed decision, its request, strategy, scope and
outcome. Every source is implementation-bound and revision checked. The
controller clips every metric, rejects insufficient or low-confidence source
sets, and reduces each metric with a deterministic median before deriving the
policy-weighted reward. Callers cannot submit a free-form reward.

An unsafe outcome quarantines the selected non-baseline strategy and rolls the
operation back to its baseline for a policy-bounded cooling period. Unsafe
baseline feedback pauses selection for that operation. A handoff copies the
complete content-free state through an exact predecessor digest and an atomic
target-store compare-and-swap.

Safety inputs only narrow the catalog. Missing, expired, rolled-back,
equivocating, restricted or negative required input cannot make a strategy
eligible. Applications adapt Trust, role, capability-state and context
integrity decisions into these inputs; the adaptation controller cannot
reinterpret their evidence or promote their disposition.

## Consequences

- Local strategies may improve from admitted outcomes without a coordinator.
- Learning is opt-in and existing selection behavior is unchanged by default.
- The safe baseline, exploration budget, reward derivation and feedback
  authorities are durable policy rather than model output.
- A selected strategy remains data. Existing planning, capability, lease,
  fencing, quorum, action and effect controls remain mandatory.
- Partitions or missing safety/feedback state may force baseline use or
  abstention.
- Durable deployments must retain the CAS state and protect any production
  entropy implementation; the in-memory store and deterministic entropy
  implementation are for local use, tests and reproducible simulation.

## Alternatives considered

### Let a model choose and rewrite coordination policies

Rejected because model output is neither policy authority nor trusted outcome
evidence, and self-modification defeats reproducibility and auditability.

### Learn one global strategy for the collective

Rejected because it introduces a global-state dependency, creates a central
failure point and erases peer-local operating conditions.

### Accept a caller-computed scalar reward

Rejected because the caller could amplify or invert one outcome without
preserving causal, source or metric evidence.

### Explore every registered strategy uniformly

Rejected because unsafe or stale arms would remain reachable and a safe
baseline would have no guaranteed probability floor.
