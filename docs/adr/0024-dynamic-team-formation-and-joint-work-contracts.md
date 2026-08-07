# ADR 0024: Dynamic teams compose individual Work authority

- Status: accepted
- Date: 2026-08-07

## Context

The existing planning and Mesh layers can decompose an Objective into Work,
discover candidates through partial peer views and assign each Work Item to one
peer. A complex Work domain may nevertheless require several complementary
capabilities that no single peer can provide. Selecting each assignee
independently can also produce an invalid roster: locally strong choices may
duplicate one failure domain, exceed a shared budget or leave a required
position uncovered.

Widening an award so that one record grants authority to several peers would
change the frozen Mesh allocation and fencing model. It would also create an
ambiguous shared authority at effect gateways. A central team scheduler would
reintroduce a global view and shared failure domain.

## Decision

Add the opt-in, browser-safe
`@agentplat/collective-runtime/team-formation` entry point.

Formation consumes a bounded set of positions and locally admitted position
bids. A deterministic exact-roster search enforces position coverage, total
budget, distinct-peer and independence-group policy. Search work is bounded;
exhaustion returns no roster rather than an unproven partial optimum.

A selected roster becomes a `TeamProposalV1`. The proposal is coordination
data and creates no assignment or execution authority. Each selected member
must independently receive and accept an ordinary Mesh award and obtain an
active `WorkContractV1`. Only exact coverage by those contracts can activate a
`JointWorkContractV1`.

The joint contract is a content-addressed composition of individual contract
bindings. Every action continues to require the member's own Work Contract,
assignment authority, epoch, lease and fencing token. The joint contract is
never accepted as an action grant or assignment fence.

Member replacement advances the team epoch and names the predecessor joint
contract. Unchanged members may be rebound to the new roster while retaining
their valid individual contracts. The replacement must supply a new individual
contract; failed or stale authority cannot cross the epoch boundary.

Member results are retained as content-free outcome bindings. A required
failure or unsafe outcome fails the team. Completion requires a successful
outcome for every member in the current epoch.

## Consequences

- Applications can form ad hoc, multi-capability teams without a global
  candidate registry or shared execution authority.
- Existing Mesh wire records, Work Contracts and action gateways remain
  unchanged.
- Formation availability is intentionally reduced when policy bounds,
  independence requirements or exhaustive-search limits cannot be satisfied.
- Applications must provide authenticated bid evidence, trustworthy local
  scoring, independence classifications and durable compare-and-swap storage.
- The in-memory store is suitable only for local composition and simulation.

## Alternatives considered

### Multi-assignee Mesh award

Rejected for V1 because it would alter frozen allocation, lease, recovery and
fencing semantics and would encourage authority laundering through a shared
team token.

### Central team scheduler

Rejected because it requires a global candidate view and creates a shared
availability and compromise domain.

### Greedy position-by-position selection

Rejected because a locally optimal first selection can make the complete
roster infeasible or violate diversity and aggregate-budget constraints.
