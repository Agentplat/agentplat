# Beta 3 Increment 2 review: pure planning reducer

Status: locally accepted; public CI and merge remain pending.

This review records the implemented Increment 2 boundary and its local
evidence. It does not claim that later Mesh, environment, evaluation, registry
publication or release gates have passed.

## Scope

Increment 2 adds the pure reducer at the browser-safe root of
`@agentplat/collective-planning`. The reducer owns immutable local planning
state, deterministic selection, bounded graph and budget validation,
idempotency/conflict handling, logical-time progression, self-contained
snapshot/restore and exact replay.

The admitted subject set is frozen at construction as ordered peer and instance
pairs. Equal subject shards are derived from that set and cannot be increased,
transferred or resized by remote input. The reducer retains observations and
cursor tombstones as replay evidence. A cursor or command identifier reused
with the same canonical digest is idempotent; conflicting reuse fails closed.

The command union is closed. The exact command kinds are
`observation.record`, `proposal.record`, `slot.evaluate`,
`fragment.transition` and `logical-time.advance`. Each carries schema version,
command identity, trusted logical time and required
`expectedStateDigest: PlanningDigestV1 | null`. A null expected digest permits
causality-only reorder; a non-null digest is an optimistic-concurrency
precondition. Snapshot restore is a separate strict API, not a command. A
reducer command does not perform I/O, call a model, read host time, select an
assignee, create Mesh Work, issue a grant, authorize an effect, or schedule a
timer.

The idempotency digest covers domain content, not first-application
preconditions. `expectedStateDigest` is checked only as optimistic concurrency
before initial acceptance; `transitionedAtLogicalMs` is checked only as the
temporal admission precondition for its fragment/predecessor/status identity.
Retries that change only either precondition are idempotent after acceptance.
Domain-payload substitution remains a conflict. Command high-waters retain the
canonical domain command with both preconditions normalized, so admission-only
values do not change the state digest. Logical time is a monotonic max-register,
and an advance at or below the current high-water is idempotent.

The reducer validates complete inputs before transition publication. Rejected
commands preserve the exact prior frozen state. Candidate batches apply hard
constraints and the frozen policy score before the policy-declared digest
tie-break. The result has at most one semantic-slot head, an acyclic bounded
dependency graph and a conserved planning-budget ledger. Terminal records do
not reactivate. Snapshots include every record necessary to restore and replay
without consulting Mesh, an environment, a repository or a clock.

## Local gate evidence

- 32 focused contract/reducer tests cover frozen input/output, the closed
  command union, atomic rejection, logical time, optimistic concurrency,
  idempotency and conflict handling;
- table-driven selection tests cover every scoring dimension in both
  directions, thresholds, instant-aware deadline ordering and the final digest
  tie-break;
- graph/property tests cover reorder, duplicates, conflicts, current-head
  changes, cycle prevention, depth, fanout, cardinality and exact/+1 limits;
- budget-prefix tests cover both admitted peer/instance shards, reserve,
  commit, release, failure, no-winner and successful supersession prefixes;
- valid redigested snapshot tests reach layout, history, reservation, cursor,
  command and record high-water rollback checks; full command replay is bound
  to a golden state digest and exact event digests;
- package build/type-check, public type contracts and direct packed-consumer
  behavior pass for the complete browser-safe root surface;
- independent contract, architecture and adversarial reviews report zero open
  P0, P1 or P2 findings after remediation.

## Deferred items

Mesh projection, critical-extension validation, repository ports, Work
projection, allocation, role/Work Contract composition, execution authority,
environment adapters, invariant monitoring, evaluation traces, durable
profiles, registry publication and release evidence remain outside Increment 2.
Those components must not be inferred from reducer acceptance.

## Review conclusion

The implemented boundary is additive and preserves the existing authority
split: planning records remain non-authoritative. Increment 2 is locally
accepted. Integration approval remains contingent on public CI and merge;
later increments retain their independent Mesh, environment, evaluation,
packaging and release gates.
