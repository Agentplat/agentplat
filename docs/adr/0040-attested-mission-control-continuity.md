# ADR 0040: Attested mission-control continuity

- Status: Accepted
- Date: 2026-08-07

## Context

Mission execution can receive a long sequence of health decisions from an
external safety monitor, evaluator, or supervisory controller. A single
healthy sample is insufficient evidence for resuming dispatch after a fault.
The lifecycle control boundary also cannot retain raw observations or delegate
authority to an external monitor.

The integration therefore needs to prove continuity across as many as 10,000
consecutive decisions while remaining restart-safe, bounded in memory, and
isolated by mission and authority fence.

## Decision

`AttestedMissionControlRuntimeV1` implements the existing
`GovernedMissionControlPortV1` contract. The adapter accepts content-free,
externally verified decisions and emits advisory-only lifecycle proposals.

Every source decision is bound to:

- mission scope digest;
- authority epoch and a digest of the fencing coordinates;
- execution-observation digest;
- source identity and source epoch;
- monotonic sequence;
- bounded control-window identity and validity interval;
- proposal identity, action, and decision digest.

The application supplies one source-verification port, a CAS state store, and
an independent monotonic anchor. State records contain only identifiers,
digests, counters, and a bounded tail of decision coordinates.

`continue` is emitted only after `requiredHealthySteps` contiguous verified
decisions. The policy range is 1 through 10,000. Until the threshold is met,
the adapter emits the configured conservative action. Source requests for a
non-continue action remain advisory and reset the healthy counter.

Scope, authority, fence, observation, source, sequence, window, expiry,
verification, replay, and equivocation failures fail closed. They emit either
`pause_dispatch` or `request_replanning`, as configured, and reset continuity.
Sequence gaps within the policy's bounded jump limit are consumed only when
their identity is verified, allowing a later contiguous run to begin without
retaining an unbounded missing-range set. Larger jumps fail closed without
moving the high-water mark.

State updates use revision-and-digest CAS. Source evaluation occurs once per
adapter invocation and is reused across CAS retries. The monotonic anchor
witnesses the latest durable revision, digest, and logical-time high-water
mark; a restored state older than that witness cannot produce `continue`.

## Consequences

- Applications retain control of source authentication and persistence.
- Long continuity thresholds require no linear growth in retained history.
- A reused state key cannot transfer healthy progress to another mission,
  authority epoch, fence, policy, or source epoch.
- The adapter deliberately trades availability for safe pause when durable
  state or its monotonic witness is inconsistent.
- Decisions are proposals only. Lifecycle authorization and effect execution
  remain separate boundaries.

## Rejected alternatives

- Keeping the counter in process memory: restart and failover lose continuity.
- Trusting a source signature without sequence and window checks: signed replay
  and delayed delivery would still be accepted.
- Retaining every decision: storage grows with mission duration and is
  unnecessary for continuity enforcement.
- Letting the adapter execute pause or replan operations: this would collapse
  evidence, policy, authorization, and effects into one trust boundary.
