# AgentPlat `0.3.0-beta.3` Increment 5 review

Status: nominal closed-loop implementation verified locally. This document
records that surface only; it does not claim production readiness, durable
execution, campaign results, package publication or a complete
fault/replanning capability.

## Reviewed scope

- nominal closed-loop definitions and peer-local decision contracts;
- adaptive-collective and centralized-planner runner entry points;
- isolated evaluator boundary, append-only trace journal and replay comparison;
- actual Mesh discovery, offer, bid selection, award, acceptance and checkpoint
  transitions;
- governed Objective admission and Work Contract construction from an active
  accepted assignment;
- Trust eligibility, inference assessment and grant reduction, reservation,
  permit and `downstream_atomic` fenced effect composition; and
- completion only after a committed protected-effect receipt.

The surface accepts from 3 through 50 logical peers and carries a 5,000
interaction ceiling. It is intentionally an experiment/reference execution
surface, not a claim about service durability or operational scale.

## Execution model

The runner initializes the supplied evaluator boundary and requests initial
observations independently for every peer. The decision-policy context contains
only the peer identity, mission intent, that peer's observations, its local
planning view and logical time. Policy code does not receive the environment
harness, monitor, hidden world, global membership or a direct assignee lookup.

A proposal is accepted for this path only when its proposer identity matches
the local policy context and every cited basis observation was delivered to that
same peer/instance. A proposal or adaptive role remains planning information;
neither is used as action authority.

Both `adaptive_collective` and `centralized_planner` use the same registered
intent, observation stream, selection policy, mandate, peers, Mesh runtime and
protected-effect semantics. Adaptive mode invokes one peer-local decision for
each peer. Centralized mode accounts one observation directive per peer,
retains a deterministic public subset capped at 32 by the planning bound, and
invokes one distinct centralized decision. It has no additional evaluator
state or unmetered side channel.

At 50 peers, the owner discovers all 49 remote peers through Mesh. One Work
offer retains the existing Mesh fanout bound: at most 32 eligible peers receive
the offer and submit bids. The trace and public artifacts record the discovered,
offered and bidding participant sets explicitly.

## Mesh and governed action sequence

The shared runtime admits the governed Objective, creates planning Work, runs
real Mesh discovery and allocation transitions, and retains the winning result
from Mesh bid selection. It then checkpoints the accepted execution. The Work
Contract is derived while the execution and fence heads are active, rather than
after `work.result` makes execution terminal.

For the protected action, the runtime composes these real boundaries in order:

1. Trust eligibility evaluation.
2. Inference assessment and reducer-issued Action Grant.
3. Local grant-ledger reservation and governed permit issuance.
4. Final currentness checks and a `downstream_atomic` fenced environment call.
5. A signed `work.result` only when the exact effect attempt has a committed
   receipt.

If no committed receipt is available, the closed-loop runner rejects the
completion path.

Trust and inference scopes must name the exact policy IDs and assignment bound
by the Work Contract. The runner derives authorization wall time after the
signed checkpoint and within the mission validity window; action preparation
cannot supply it. Final result signing also requires identity-provenance of the
evaluator-issued receipt and exact equality between its output digest and the
result digest.

## Determinism and evidence

The runner records execution-relevant events into the evaluator-owned V2 trace
journal and finalizes through the independent environment monitor. A run result
contains digest-bound planning, Mesh and governance roots plus public artifacts;
it does not contain runner-declared mission success, safety values or a padded
interaction total.

The two replay helpers create fresh execution inputs and require equality of
the run digest, trace digest and boundary-evidence digest. Runtime cryptographic
handles are supplied separately and are excluded from serialized artifacts.

## Local verification

- the adaptive and centralized runners each complete the same 50-peer nominal
  scenario through the real Mesh allocation and governed-action boundaries;
- adaptive mode records 50 peer-local decisions, centralized mode records 50
  directives plus one centralized decision, and Mesh records 49 discovered
  peers plus the bounded 32 offer/bid participants;
- both produce the same public outcome and committed protected-effect state;
- replay reproduces each run, trace and boundary-evidence digest exactly;
- authority, policy substitution, clock injection, receipt provenance, Trust,
  inference, freshness and binding controls produce zero unauthorized commits;
- the public type surface, release graph and isolated tarball consumer pass
  their repository gates.

## Explicitly deferred

Increment 5 intentionally does not implement or claim:

- observation-triggered fragment revision or causal replanning;
- capability withdrawal, bid decline, crash/restart, partition/heal or
  reassignment handling;
- stale-result recovery beyond the current fenced action boundary;
- benign, adversarial or mixed fault campaigns; or
- durable storage, recovery-policy validation or production deployment.

Those behaviors are scoped to Increment 6 or later conformance and release
work.
