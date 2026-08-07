# Dynamic Team Formation and Joint Work Contracts V1 implementation plan

Status: implemented

## Product outcome

Allow peers to form a bounded ad hoc team when a Work domain needs multiple
complementary positions, while preserving all existing individual authority,
fencing and inference-control boundaries.

## Public package shape

`@agentplat/collective-runtime/team-formation` contains:

- strict scope, position, candidate, bid, roster, contract, outcome, state and
  handoff contracts;
- canonical factories and exact validators;
- deterministic bounded exact-roster selection;
- compare-and-swap formation, activation, outcome and reconfiguration runtime;
- capability-state, Mesh bid and Work Contract adapters; and
- per-position Work projections for existing allocation flows.

The package contains no provider SDK, transport, signer, model invocation,
global candidate registry or effect executor.

## Formation algorithm

The reducer:

1. validates the complete content-free scope, position graph and current bid
   set;
2. rejects time rollback, oversized requests, excessive bids, impossible
   budgets and concurrent non-terminal teams;
3. orders positions by local candidate scarcity and bids by locally evaluated
   score, budget, completion and digest;
4. explores complete rosters deterministically under a strict node budget;
5. enforces exact position coverage, peer separation, independence-group
   coverage and aggregate budget; and
6. emits no proposal if coverage is impossible or exhaustive search cannot be
   completed inside the bound.

## Authority composition

Each position maps to an ordinary Work Item. A roster proposal becomes active
only after every member has a current active `WorkContractV1` that matches the
selected peer and instance, position Work revision, role, capabilities,
budgets, Objective and local scope.

`JointWorkContractV1` retains the individual authority, epoch, generation,
fence and lease bindings. It is evidence of team composition, not a substitute
for member authority. Existing action gateways remain unchanged.

## Reconfiguration and outcomes

A replacement request names the exact current joint contract and a member with
a retained failure or unsafe outcome. Selection excludes the failed candidate
and, when configured, peers already occupying another position. A successful
replacement creates a new team epoch, retains a bounded predecessor history
and requires exact member-contract coverage before reactivation.

Outcomes bind one member contract and one source result digest. Duplicate
identical outcomes are idempotent; conflicting replacement is rejected. A
failed or unsafe member result fails the current team. All current members must
report success for completion.

## Compatibility

- additive opt-in package subpath;
- no Mesh wire or persistence schema changes;
- no change to single-assignee Work behavior;
- no team-level action authority;
- browser-safe provider-neutral implementation; and
- industry terminology throughout the public source and documentation.

## Completion criteria

- a complete diverse roster is selected where independent local maxima would
  violate team policy;
- missing coverage and bounded-search exhaustion fail closed;
- exact active individual Work Contracts are required for activation;
- result substitution, stale leases and contract mismatch are rejected;
- one member can be replaced under a new, predecessor-bound team epoch;
- successful member outcomes complete a team and unsafe outcomes fail it;
- CAS replay and handoff preserve exact state continuity; and
- build, public types, unit, terminology, package-catalog and packed-consumer
  verification pass.
