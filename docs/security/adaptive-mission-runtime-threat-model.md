# Adaptive Mission Runtime threat model

Status: Beta 3 design candidate.

## Scope

This model covers the opt-in `@agentplat/collective-planning` boundary, its Mesh
projection, the deterministic environment adapter, the closed-loop evaluation
runner and the independent invariant monitor.

It composes but does not replace the existing models for Mesh, compatibility,
Evidence and Trust, Inference Control and the Governed Collective Runtime.
Existing signature, admission, replay, mandate, assignment, fencing, action,
budget and evidence guarantees remain prerequisites.

The protected security claims are:

1. planning data cannot create or widen authority;
2. normative peers receive only their local observations and peer messages;
3. every successful effect is bound to current plan, mandate, Work and
   assignment state at final dispatch;
4. replanning cannot resurrect stale work or repeat an uncertain effect;
5. reported success, safety, faults and interactions come from observed events
   and independent world-state evaluation;
6. state and evidence remain bounded, deterministic and tamper evident.

## Assets

- mission intent, policy and canonical digests;
- local observations and their visibility boundaries;
- plan proposals, decisions, fragments, views and causal frontiers;
- planning budget shards and reservations;
- Mesh Objective, Work, assignment, lease, epoch and fence state;
- adaptive role and governed Work Contract bindings;
- model/inference assessments, Trust decisions, Action Grants and permits;
- environment effects, receipts and idempotency/fencing state;
- planning snapshots, repositories, traces, reports and evidence anchors;
- hidden environment state, terminal predicates and future fault schedules;
- secret canaries used to detect boundary leakage.

## Trust boundaries

### Caller and local policy

The caller installs trusted time, identities, admitted peers, mandates,
planning policies, decision policies, repositories and environment adapters.
Configuration is construction-bound and frozen for one run. Runtime metadata,
model text, Room roles, remote extensions and environment observations cannot
replace these bindings.

### Portable planning reducer

The planning reducer is a local deterministic boundary, not a transport or
authority boundary. It accepts only the closed command kinds
`observation.record`, `proposal.record`, `slot.evaluate`,
`fragment.transition`, `fragment.project-to-work`,
`fragment.assignment.observe`, `fragment.execution.observe`,
`fragment.terminal.observe`, `work.revision.observe` and
`logical-time.advance`, each with trusted logical time, a logical command
identifier and required
`expectedStateDigest: PlanningDigestV1 | null`. A null expected digest permits
causality-only reorder; a non-null digest is an optimistic-concurrency
precondition. Snapshot restore is a separate strict API, not a command. The
reducer retains the exact admitted `(peerId, peerInstanceId)` subject set,
equal planning-budget shards, observations, cursor tombstones, plan records
and high-waters required for replay. It reads no host clock, random source,
repository, Mesh state, environment state, model output or execution state.

A cursor or command identifier may be repeated only with the same canonical
digest. A conflicting reuse is rejected before state change. All candidate
graph, budget, time and lifecycle checks precede publication of a next state;
rejection cannot retain an observation, reserve/release budget, change a head,
create an effect or mutate a timer. Candidate selection applies the frozen
policy score before its declared digest tie-break. The reducer cannot add
subjects, transfer shards or create execution authority.

The digest treats `expectedStateDigest` and `transitionedAtLogicalMs` as
first-application preconditions rather than domain content. They are validated
before initial acceptance; once the exact domain command is retained, changing
only either precondition cannot turn a retry into a new mutation. Retained
Increment 3 lifecycle evidence records the first accepted transition time and
the reducer logical-time witness, allowing snapshot validation to re-check the
same temporal window without changing idempotency identity. Logical time uses
max-register semantics, so stale advances are idempotent and cannot lower the
high-water.

The observed Work lifecycle commands never interpret discovery claims as
authority. `fragment.project-to-work` binds an accepted head to a Mesh Work
identity; assignment, execution, revision and terminal commands require exact
fragment, Work mapping and role-binding compare-and-set evidence. The adapter
must obtain the assignment epoch, assignee, lease and fence from current Mesh
state and Collective Control. A planning reducer cannot manufacture them.
Work revision is accepted only from an unassigned offered state. It cannot
carry a role binding forward across a Work revision; later execution requires a
fresh accepted assignment and derived Work Contract.

### Peer and model decision policy

A peer or model may propose work, challenge information, bid, abstain or emit an
allowed decision. It is untrusted for authority, global truth, hidden state,
budget high-waters and metrics. Raw private reasoning is not required evidence.

### Mesh transport and remote peers

Transport is adversarial. Remote peers may delay, duplicate, reorder, omit,
fork or fabricate records and may collude. Signatures prove key possession and
record integrity, not truth or authorization.

### Planning repository

The repository may be unavailable, stale, cross-tenant, corrupt or return a
different body for a requested digest. Every read is strictly validated and
rehash-verified before use. A reference alone never creates a fragment.

### Environment adapter

The runner-visible adapter is untrusted for authority but trusted to enforce its
declared observation and effect contract. It may fail, time out or return an
ambiguous effect result. The independent monitor verifies behavior from the
registered event stream and hidden state.

Portable observation validation proves closed record shape, peer/cursor
binding, size bounds, content integrity and the absence of structurally named
execution-authority fields. It cannot infer the meaning or truth of arbitrary
application JSON. Each environment adapter therefore owns an allowlisted
schema for every `observationKind`; the evaluation monitor independently checks
hidden-state canaries. Until those Increment 4 boundaries exist, the portable
contracts alone make no hidden-state non-interference claim.

### Evaluator and invariant monitor

The monitor may read registered hidden world state but cannot influence peer
decisions or execution during a sample. Its source and configuration digests
are registered separately. Report generation does not grant deployment
authority.

## Adversaries

- unauthenticated network participant;
- admitted but faulty, compromised or colluding peer;
- compromised model or decision-policy output;
- malicious Objective or planning proposer;
- stale process restored from an older snapshot;
- faulty or malicious repository/transport adapter;
- environment that fails before or after an externally visible effect;
- evaluator implementation that shortcuts the real runtime;
- operator misconfiguration or unsafe rollout;
- dependency or supply-chain attacker.

Beta 3 tolerates declared crash, omission, delay, reorder, partition and bounded
malicious proposal/context behaviors. It does not claim Byzantine agreement for
the distributed plan. Safety must hold when plan views diverge; liveness and
convergence claims apply only under the registered eventual-connectivity and
healthy-peer assumptions.

## Threats and mitigations

| Threat                                        | Required mitigation                                                                                             | Verification                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Proposal treated as execution authority       | Planning contracts contain no assignment/grant fields; only current Mesh assignment can create `WorkContractV1` | Broken planner attempts direct Work Contract/effect            |
| Room, Trust or role label mints authority     | Explicitly contextual/proposal-only; governed currentness rechecked at dispatch                                 | Ambient-authority negative cases                               |
| Remote intent or fragment widens mandate      | Intersect intent/fragment with locally installed current mandate and Objective policy                           | Cross-tenant, capability, budget, validity widening corpus     |
| Hidden task or world-state oracle             | Split runner port from evaluator monitor; canary hidden fields; deny global enumeration                         | Oracle planner must fail monitor/conformance                   |
| Global membership or direct assignee lookup   | Recipient selection uses local Peer View; assignment only via offer/bid/award/accept                            | Global lookup/direct assignment negative drivers               |
| Critical-extension downgrade                  | Capability negotiation, exact critical key, unknown-critical rejection, no retry at lower semantics             | Mixed-capability and downgrade tests                           |
| Fragment/Work substitution                    | Content-addressed fragment plus exact extension and Work-projection equality                                    | Substitute digest, role, budget, input, dependency or deadline |
| Same logical ID with different content        | Domain ID high-water plus canonical digest conflict                                                             | Duplicate versus equivocation fixtures                         |
| Cyclic or explosive task graph                | Depth, fanout, cardinality, revision, byte and budget limits before mutation                                    | Cycle, diamond, deep-chain and flood property tests            |
| Semantic-slot race                            | Append-only candidates; deterministic selection; explicit supersession and Work cancellation                    | Reorder, duplicate and concurrent proposal schedules           |
| Digest-grinding tie-break abuse               | Closed proposal fields, no free nonce, policy score before digest tie-break, per-peer proposal limits           | Equivalent proposal flood and tie cases                        |
| Planning budget oversubscription              | Deterministic immutable peer shards and prefix conservation checks; no remote widening                          | Concurrent proposal/replan budget property tests               |
| Cursor or command replay conflict             | Retained cursor tombstones and command idempotency records bind each logical identifier to one canonical digest | Duplicate, conflicting reuse and restore replay tests          |
| Reducer rejection partially changes state     | Validate the complete closed command before publication; preserve the prior frozen state on rejection           | Invalid graph, budget, time and lifecycle transition tests     |
| Unused shard impersonation                    | Shard identity bound to admitted peer and instance; no Beta 3 shard transfer                                    | Cross-peer/cross-instance reservation attempts                 |
| Stale intent or policy revision               | Exact predecessor, revision and digest high-waters; stale records terminal/rejected                             | Reorder, rollback and fork tests                               |
| Replanning resurrects stale Work              | Supersession calls explicit Mesh revise/cancel; final currentness checks include fragment head                  | Plan change racing award, accept, result and effect            |
| Old executor commits after reassignment       | Existing epoch/generation/fence checks plus atomic environment sink                                             | Crash, takeover and late-result matrix                         |
| Duplicate or indeterminate external effect    | Existing idempotency, reservation and fencing; indeterminate remains charged until evidence reconciliation      | Failure before/after commit and lost response                  |
| Capability or role poisoning                  | Advertisements are self-claims; local eligibility and Trust may only restrict; assignment still required        | False/stale/withdrawn capability scenarios                     |
| Contradictory observation amplification       | Basis digests, challenges, bounded uncertainty and policy-controlled abstention                                 | Conflicting observation/adversarial context campaign           |
| Plan divergence mistaken for consensus        | Reports expose per-peer heads and convergence percentage; no global-certificate claim                           | Partition/heal with temporary divergence                       |
| Snapshot rollback                             | Strict format/schema/digest validation and non-decreasing intent, plan, budget and domain high-waters           | Restore older/corrupt/cross-identity snapshot                  |
| Repository body substitution                  | Recompute digest and validate exact tenant/domain/intent binding                                                | Same reference returning different bytes                       |
| Fault claimed but not injected                | Every exercised family requires concrete trace events at registered boundaries                                  | Declared-only fault negative runner                            |
| Synthetic interaction ledger                  | One immutable event per count; independent replay recomputes ledger                                             | Padding and omitted-event negative runners                     |
| Constant or runner-supplied success           | Monitor derives success/violations from hidden state and event trace                                            | Constant-success negative monitor comparison                   |
| Failed-seed omission                          | Frozen registration and exact seed-set validator; failures remain mission outcomes                              | Missing/extra/reclassified seed reports                        |
| Sensitive observation or hidden-state leak    | Bounded redaction classes, canaries, no raw prompt/private reasoning requirement                                | Trace/report/package canary scan                               |
| Denial of service                             | Hard limits, backpressure and explicit terminal codes; never evict current safety high-waters                   | Capacity and byte-bound tests                                  |
| Import-time side effect or supply-chain drift | Side-effect-free roots, lockfile/audit gates and isolated tarball consumers                                     | Browser traversal, pack audit and dependency audit             |

## Authority matrix

| Record or decision             | May propose work | May create Mesh Work               | May assign work                | May create Work Contract | May authorize effect          |
| ------------------------------ | ---------------- | ---------------------------------- | ------------------------------ | ------------------------ | ----------------------------- |
| Environment observation        | no               | no                                 | no                             | no                       | no                            |
| Model/peer decision            | yes              | no                                 | no                             | no                       | no                            |
| Accepted plan fragment         | yes              | only through local planning facade | no                             | no                       | no                            |
| Plan-view head                 | yes              | may select facade input            | no                             | no                       | no                            |
| Room proposal/approval         | contextual only  | no                                 | no                             | no                       | no                            |
| Trust decision                 | no               | no                                 | may restrict eligibility       | no                       | no                            |
| Mesh offer/bid                 | no               | offer references existing Work     | no                             | no                       | no                            |
| Mesh award/acceptance          | no               | no                                 | yes, under current lease/fence | enables derivation       | no                            |
| Current Work Contract          | no               | no                                 | no                             | is the contract          | enables grant evaluation only |
| Action Grant + governed permit | no               | no                                 | no                             | no                       | one bounded dispatch attempt  |

## State-machine safety requirements

### Intent

```text
proposed -> active -> superseded | revoked | expired | completed
```

- revisions are exactly monotonic and predecessor-bound;
- identity and Objective scope never change in place;
- terminal intent never reactivates;
- revocation blocks new proposals, Work and effects while permitting bounded
  cancellation/reconciliation.

### Fragment

```text
candidate -> active -> offered -> assigned -> executing
          -> superseded | cancelled | completed | failed
```

- dependency readiness and semantic-slot head are rechecked before Work;
- no terminal-to-active transition;
- supersession does not erase prior Work/effect evidence;
- a fragment cannot bind more than one current Work identity.

### Role

```text
pending -> active -> released | expired | revoked | superseded
```

- activation requires current Work Contract and assignment;
- role expiry is no later than the lease, Work deadline, intent or mandate;
- role labels never imply capabilities or permissions.

## Planning-graph invariants

- every active fragment belongs to the exact active intent revision;
- semantic-slot heads are unique within one local view;
- predecessor edges form chains and dependency edges form a DAG;
- active depth, fanout and cardinality stay under signed/local ceilings;
- dependency IDs/digests are exact and cannot alias across intents;
- an unresolved or superseded dependency prevents dependent execution;
- budget reserved plus released plus terminally consumed reconciles exactly;
- rejection leaves state, timers, budgets and effects unchanged;
- pruning never removes current heads, unresolved dependencies, domain
  high-waters, effect evidence or digests needed for replay.

## Evaluation integrity requirements

- registrations are frozen before normative samples;
- runner, environment, monitor, decision policy, fixtures and fault schedules
  have independent digests;
- environment hidden state is inaccessible to runner modules and serialized
  separately;
- actual boundary events identify their accounting kind and causal parent;
- replay recomputes every ledger, state digest, success and violation value;
- faults have scheduled, injected and observed events;
- monitor source cannot be replaced by runner output;
- no sample is discarded for mission or safety failure;
- live-provider output is normative only when the full recorded decision stream
  is immutable and replayable;
- wall-clock and memory stay diagnostic.

## Privacy and evidence

Ordinary evidence includes identifiers, digests, reason codes, bounded labels,
logical times, counts and redacted references. It excludes raw prompts, secrets,
private reasoning, unrestricted observation values, credentials, complete model
context and hidden environment state.

Full planning snapshots and traces may contain sensitive application data. They
are caller-managed, non-telemetry artifacts. Redacted projections are
non-restorable and cannot become authority.

## Residual risks

- Eventually connected honest peers may still make suboptimal local plans.
- A compromised majority can prevent useful progress or keep views divergent;
  Beta 3 makes no Byzantine agreement claim.
- Deterministic budget shards can strand capacity and reduce mission success.
- Model and environment abstractions may not represent every deployment.
- Passing the registered campaign proves only the exercised contracts and
  assumptions.
- Exactly-once effects still require downstream atomic idempotency or fencing.

These limits must appear in package documentation, reports and release notes.

## Release blockers

The release is blocked by:

- any path from proposal/role/observation to authority without current Mesh and
  governed bindings;
- any normative hidden-state or global-membership read;
- any synthetic success, safety, fault or interaction record;
- any graph/budget prefix exceeding a declared ceiling;
- any stale fence or duplicate effect accepted;
- any downgrade or changed Beta 2 wire/persistence fixture;
- any missing registered seed or negative implementation that passes;
- any secret canary in ordinary evidence or package contents;
- any open P0, P1 or P2 design/implementation finding.
