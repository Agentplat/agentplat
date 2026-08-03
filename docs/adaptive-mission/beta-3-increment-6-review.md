# AgentPlat `0.3.0-beta.3` Increment 6 review

Status: release-candidate implementation evidence. This review records the
bounded resilience reference surface, its local conformance gates and the
independent findings remediated before publication. It does not claim package
publication, durable execution, cloud deployment or a completed statistical
campaign.

## Reviewed scope

Increment 6 adds an opt-in resilience wrapper around the nominal closed-loop
definition. The wrapper is additive: it binds a frozen nominal definition,
bounded fault plan and epoch limit into a separately digested resilience
definition. Its result binds the executed run, ordered epoch roots, one
scheduled/injected/observed record for each planned fault and stale-result
rejections. Campaign evidence binds that result to the runner, seed, limits and
the exact three fault-ID sets.

The public fault vocabulary is closed to six families:

- capability withdrawal;
- assignment decline;
- peer crash;
- peer restart;
- directed network partition; and
- directed network heal.

Fault entries are bounded, canonically ordered and have either a logical-time
or trace-event trigger. Their predecessor IDs form an explicit causal DAG.
The runner resolves a trace-event trigger to the exact earlier retained journal
event before injection; a well-formed digest that is absent from the journal is
rejected.
The runner keeps the schedule construction-bound: planning policies receive
the nominal definition and peer-local observations, not future fault details.
Every trigger must remain inside the nominal logical-time bound and no trigger
may precede the retained pre-effect checkpoint. Directed partition/heal links
must be edges in the nominal peer topology.

## Causal replanning

`runCollectiveClosedLoopCausalReplanningV1()` accepts a trigger observation and
a successor proposal only when the proposal cites that observation, has the
same logical decision time and names the active semantic-slot head as its exact
predecessor. It records the observation, proposal, slot evaluation and Work
projection through the planning reducer for every participating local view.

The resulting successor has a distinct head digest and Work-item identity; the
prior fragment is superseded rather than rewritten. An uncited trigger is
rejected before mutation. This is a bounded causal-replanning primitive, not a
claim that all runtime fault families automatically replan an arbitrary graph.

## Fault evidence and reducer coverage

`runCollectiveClosedLoopFaultMatrixV1()` drives a serialized schedule through
the supplied reducer runtime. A matrix record is emitted only if its scheduled
event exists, the reducer or driver injection is accepted, and its observer
confirms the post-condition from the resulting trace. The matrix rejects a
declared-only event, an injection-time mismatch and invalid crash/restart or
partition/heal causal pairs.
Replay requires both the underlying reducer trace and the matrix digest to
match.

The resilient runner accepts only a matrix port created by the package from an
owned snapshot of the executable driver input. The executable is retained in a
private registration, so replacing the public port object cannot inject a
precomputed result. Its mission-binding digest covers the exact nominal
planning state, Mesh state, Work Contract, checkpoint, assignment and
replacement. At execution, the runner also checks each family, time, target,
directed link and causal predecessor against the public fault plan. Configured,
declared and executed driver-fault IDs must have bijective coverage, and every
driver record must report an applied fault. Recovery requires an exact causal
crash/restart pair targeting the pre-effect winner.

Focused conformance uses the real Mesh reducers for two domain changes:

- a verified signed capability withdrawal is processed by the Mesh discovery
  boundary and is then absent from capability matching; and
- a real Mesh assignment decline is processed by the allocation reducer, after
  which only its causal next offer attempt is accepted.

Crash, resume, partition and heal remain driver/transport faults. They are not
reducer branches and do not give the reference runner an implicit retry,
membership directory or availability guarantee.

## Certified reassignment and fenced completion

The recovery seam starts from the real nominal Mesh states. It advances lease
expiry/grace with Mesh timer reducers, creates a recovery proposal, obtains the
required witness votes and certificate, issues a recovery award, records the
replacement acceptance and resumes from a checkpoint. The replacement Work
Contract is derived from the accepted epoch-two assignment; it is not made by
rewriting the epoch-one contract.

The old executor's epoch-one progress and result are delivered through the
normal Mesh allocation evaluation path after reassignment. Both are rejected
with `execution_authority_invalid` and do not change the substantive allocation
projection. Evidence retains each actual signed envelope, record ID, rejection
code, delivery logical time and the unchanged-state assertion. Those delayed
envelopes are verified while the old lease is current and evaluated only after
the epoch-two authority is installed. The construction-bound finalizer accepts
only a provenance-bound, committed protected-effect receipt whose attempt
matches the replacement Work Contract, then emits and delivers a real epoch-two
`work.result`.

The protected action timestamp is checked against both ends of the recovered
lease (`leaseStartsAt <= authorizedAt < leaseExpiresAt`). Message IDs and sender
sequences are reserved before concurrent cryptographic work, so recipient
completion order cannot change replay output.

## Fair reference campaign and replay

The resilience reference compiles a six-fault campaign and executes the same
nominal definition, public observations, fault plan, replacement peer and
limits for adaptive-collective and centralized-planner modes. The paired
campaign derives a fairness digest before execution, verifies the public
observation digest after execution and requires exact replay bindings for each
runner: resilience result, campaign evidence, trace, boundary evidence and
fault-matrix digest. Both sides and both replays must use the same decision
policy object, environment digest, monitor digest and mission-bound matrix
digest. After execution, scenario, matrix records and effective driver-fault
records must also match.

This is a deterministic, compact reference campaign. It is not the registered
50/100/250/500-agent statistical ladder, a reliability benchmark or a claim of
performance under arbitrary failures.

## Restart and deployment boundary

The reference maps the `peer.restart` family to the simulator's explicit
in-memory `peer.resume` driver behavior: the configured peer becomes available
again with retained reducer state and outbound allocator. It is not a fresh
instance lifecycle, durable restore, persistence protocol or remote service
recovery. No Increment 6 surface deploys infrastructure, contacts a cloud
service or introduces durable state.

## Release boundary

The Increment 6 merge requires the repository-wide local gate, isolated
tarball consumers, two independent re-reviews and public `main` CI to pass.
The 50–500-agent statistical ladder, durable recovery policy and production
restart/readmission model remain explicit later milestones; this compact
reference does not claim them.

## Local verification

The release-candidate tree passed the repository build and type checks, the
public terminology/secret audit, 679 unit tests with zero failures (six
existing todo cases), adapter and compatibility gates, deterministic campaign
replay, and all release/conformance checks. PostgreSQL tests that the repository
marks opt-in remained skipped; the existing PostgreSQL conformance evidence
gate passed, but this review makes no new durability claim.

Packaging verification audited all 37 isolated tarballs and 61 packed API
surfaces. It compiled unchanged Alpha 5 contracts and current declarations,
installed independent consumers through pnpm and npm, and ran the nominal and
resilience consumers on Node 20. Two independent re-reviews concluded with
zero open P0, P1 or P2 findings in the bounded Increment 6 scope. Public PR and
`main` CI evidence are recorded by the hosting workflow rather than claimed by
this local review.
