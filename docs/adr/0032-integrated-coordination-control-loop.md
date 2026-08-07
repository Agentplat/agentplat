# ADR 0032: Integrated coordination-control loop

- Status: accepted
- Date: 2026-08-07

## Context

Local inference control produces alignment, context, trust and capability
evidence while collective runtimes own team, execution and planning actions.
Applications need a deterministic way to turn those independent signals into
bounded coordination requests without giving a feedback component authority to
dispatch work, assign participants, or change a plan.

## Decision

Add the opt-in provider-neutral
`@agentplat/collective-runtime/coordination-control` loop built entirely around
injected evidence, state-store and delivery ports. Evidence is a content-free,
source-bound projection carrying only identifiers, revisions, bounded scores,
timestamps and digests. The loop checks configured source bindings, freshness,
scope coherence, rollback and equivocation before evaluating policy thresholds.
Policy pins the exact source-registry digest, and a required provider-neutral
resolution port authenticates each projection against its owning source record.

Its only output is a digest-bound, advisory proposal from this fixed set:
continue, pause dispatch, restrict participation, request role transition,
request work reassignment, request team adaptation, or request replanning.
Recipients retain all authority to validate, approve and enact a request.

The loop uses durable revision-and-digest compare-and-swap state, a reference
in-memory store and a small durable outbox. Production stores must maintain a
monotonic, rollback-resistant head outside the replaceable snapshot. Proposal
IDs are stable during a failed CAS retry so a
delivery adapter can be idempotent. An expired pending proposal transitions to
an explicit `expired` non-delivery record and is never reported as delivered.
Missing, stale, unbound, rollback or
equivocal evidence fails closed to a pause-dispatch proposal. Threshold changes
are damped by cooldown and hysteresis; evidence that clears the recovery margin
returns the loop to continue, preserving bounded agility.

## Consequences

- Local control and collective execution remain independently replaceable.
- No raw prompts, task content, credentials, participant assignments or model
  outputs enter coordination-control state.
- Delivery is at-least-once before proposal expiry across a delivery/commit
  interruption; adapters must deduplicate by proposal ID. Expiry is auditable
  non-delivery rather than acknowledgement.
- Policies can require multiple independent fresh sources before any non-failsafe
  recommendation is emitted.

## Alternatives considered

Giving the loop direct dispatch or assignment authority was rejected because it
would collapse approval boundaries. Importing inference-control runtime types
was rejected in favor of portable evidence projections, avoiding package cycles
and binding collective deployments to one local control implementation.

See the [threat
model](../security/integrated-coordination-control-loop-threat-model.md).
