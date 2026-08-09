# Dynamic Team Formation V1 threat model

## Protected properties

- Only locally admitted candidates can enter roster selection.
- Every required position is covered exactly once.
- Aggregate budget, diversity and search limits cannot be widened by a bid.
- A roster proposal grants no assignment or execution authority.
- Team activation requires exact current individual Work Contracts.
- A team epoch cannot reuse failed or stale member authority.
- A result is accepted only for the exact current member contract.
- Persisted state cannot roll logical time or silently change policy.

## Trust boundaries

The application owns authenticated Mesh intake, capability-state sources,
local bid scoring, independence classification, Work Contract issuance,
durable compare-and-swap storage and action enforcement. The team runtime
validates bindings and transitions but does not establish the truth of a remote
capability claim or independence-group label.

## Threats and controls

### Candidate or bid forgery

Candidates retain capability-state decision digests and bids retain their
authenticated source digest. The adapters require an eligible current
capability decision and exact peer, Work revision and position bindings.

### Roster capture and correlated failure

Policy can require distinct peers per position and a minimum number of local
independence groups. The reducer evaluates these properties over the complete
roster, not per-position winners.

### Combinatorial resource exhaustion

Positions, bids per position, members and search nodes are hard bounded. If
exhaustive selection cannot finish inside the node budget, the runtime emits no
proposal.

### Budget amplification

Position bids cannot exceed position budgets, and a roster cannot exceed the
local aggregate ceiling. Activation independently checks reserved and action
budgets in every member Work Contract.

### Authority laundering through a team token

The joint contract contains no new assignment or action grant. Each member
retains a distinct Work Contract, assignment authority, lease and fence.
Action gateways continue to validate those individual records.

### Partial consent or phantom members

Activation requires exact position coverage by active Work Contracts whose
assignees, roles, capabilities, Work revisions and Objective bindings match the
proposal. Partial activation is rejected.

### Stale replacement and ABA reconfiguration

A replacement request names the exact current joint contract and is accepted
only after the failed member has a retained failure or unsafe outcome. A new
proposal increments the team epoch, names its predecessor and requires a fresh
member contract for the replacement. Retained member bindings are rechecked
before the new epoch activates.

### Result substitution or equivocation

Outcomes bind team, epoch, joint contract, member binding and source-result
digest. Exact replay is idempotent. A second different outcome for the same
member is rejected.

### Persistence rollback

State commits use compare-and-swap revision checks, predecessor digests and a
logical-time high-water mark. Handoff binds source and target state keys,
policy, implementation and exact predecessor state.

### Sensitive-data retention

Contracts retain identifiers, digests, bounded capability and role keys,
budgets, timings and status. They do not accept prompts, model outputs,
credentials, raw observations or hidden reasoning.

## Residual risks

- A compromised trusted scorer can bias roster selection.
- Incorrect independence labels can overstate failure-domain diversity.
- Availability decreases under conservative bounds or incomplete local views.
- Application gateways that accept a joint contract as action authority would
  violate the integration contract.
- V1 does not provide incentive compatibility or collusion-proof mechanism
  design for strategic bidders.
