# ADR 0031: Mechanism-aware mission allocation is advisory and commitment-bound

- Status: accepted
- Date: 2026-08-07

## Context

Existing team formation selects a roster for supplied positions. Some missions
need peers to propose a bounded semantic decomposition and compete for those
slots without exposing a bid that can be revised after competing bids appear.
The mechanism must work from replicated causal state, use no currency or
payment assumptions, and must not turn coordination data into authority.

## Decision

Add the opt-in `@agentplat/collective-runtime/mechanism-allocation` module. A
local peer admits a bounded, content-free decomposition proposal linked to the
existing planning state and team-formation scope. The proposal supplies semantic
slots, eligibility, dependency, budget ceilings and independence constraints.

Each round has logical commit and reveal deadlines. Bidders first submit a
slot-bound hash commitment, then reveal a declared utility, declared cost,
resource use and budget. The reducer verifies the binding and clears deterministically: highest
declared utility, then lower cost, lower resource use, peer ID and reveal ID.
It applies eligibility, budget, per-peer resource, peer/group concentration and
independence bounds. The result is explicitly an advisory allocation plan; an
ordinary WorkContract remains required before any execution.

Every proposal, commitment, reveal, clear and withdrawal crosses a
provider-neutral admission port. The admitted record binds the exact event to
an authenticated peer instance, independence group, membership configuration
and authorized capability state. Exact events and content-free evidence are
retained so restore and formation projection can re-run the external verifier.
Admission proves coordination eligibility only; it grants no execution rights.

The state is immutable and digest-addressed, records high-water logical time,
uses revision-and-digest CAS for durable state, and includes an in-memory CAS
reference store. Production stores must maintain a monotonic,
rollback-resistant head outside the replaceable snapshot. On
restore, the runtime rechecks predecessor/revision, causal bindings, time
high-water, coverage, eligibility, dependency, concentration and aggregate
policy invariants; a merely recomputed digest is not sufficient for admission.
It then replays the exact admitted event sequence from the initial state through
the deterministic reducer and requires the resulting state digest to match, so
an otherwise eligible losing reveal cannot be substituted into the plan.
Formation projection also requires the mechanism policy, the formation policy
and successful provenance re-verification. Every selected member must match an
exact retained reveal and its slot-bound commitment.
Conflicting commitment IDs or same-peer/same-slot reveals are recorded as
equivocation. Withdrawal opens a new causal round and preserves unaffected
previous selections while reopening the declared affected slots.

## Incentive property and assumptions

Under authenticated peer identities, a collision-resistant commitment hash,
shared deterministic inputs, synchronized logical deadline enforcement and no
side channel that permits replacing an admitted record, a bidder cannot revise
its revealed bid after observing another reveal. This is a limited
anti-front-running property only. V1 does not claim strategy-proofness,
truthful utility reporting, sybil resistance, or universal collusion-proofness;
those require governance and identity controls outside this mechanism.

## Consequences

- Allocation remains inspectable, replayable and non-monetary.
- Different peers can compute the same clear from the same admitted record set.
- Failed capacity can reopen a narrow subset without discarding unaffected work.
- Utility and cost are declarations, not globally verified facts.

See the [threat
model](../security/mechanism-aware-mission-allocation-threat-model.md).
