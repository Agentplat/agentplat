# Decentralized collective control model V1

Status: architecture model and falsifiable hypotheses. Measured results are
tracked separately.

## System model

Let `N` be the collective size, `k` the locally bounded peer view, `f` the
configured dissemination fanout, `h` the hop limit, `c` the agreement committee
size, `m` the number of controlled semantic metrics and `r` the number of
certified artifact replicas.

Each peer owns local policy, membership-bound identity, a bounded neighbor
view, causal state, planning fragments, control state and effect fences. It
does not require a current global topology, global plan graph or globally
serialized scheduler. Remote data is admitted only through authenticated,
scope-bound and replay-protected records.

## Safety model

The composition relies on six independently checkable statements:

1. an assignment or planning decision is not execution authority;
2. an external effect requires current authorization, finality and an
   admissible semantic-horizon decision;
3. one decision coordinate cannot finalize conflicting values inside the
   configured membership/threshold assumptions;
4. assignment epochs, fences and checkpoints advance monotonically;
5. child authority and budgets can only be attenuated; and
6. missing, stale, conflicting or unauthenticated evidence fails closed.

The first five are represented by content-addressed records and enforced again
at the pre-effect invariant boundary. The sixth is the default result of every
admission and effect adapter. Availability is not promised when the required
evidence or quorum is unavailable.

## Complexity envelope

| Operation                       |                                              Local state |                                                           Message/work envelope | Governing assumption                                                                       |
| ------------------------------- | -------------------------------------------------------: | ------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------ |
| sparse peer maintenance         |                                                   `O(k)` |                                                 `O(k)` per local reconciliation | `k` is policy-bounded and independent of a complete graph                                  |
| bounded dissemination           |                                    `O(k)` dedupe/cursors |   at most `O(f^h)` attempted deliveries per update before duplicate suppression | fanout, hop, queue and interaction budgets are enforced locally                            |
| causal catch-up                 |                                     `O(q)` bounded queue |             proportional to requested missing predecessors, capped per response | artifacts are content-addressed and replicated                                             |
| distributed decomposition       |               proportional to locally relevant fragments | proportional to admitted fragment/dependency edges, not all possible peer pairs | peers exchange graph fragments, not a central mutable graph                                |
| commitment/reveal allocation    |                    proportional to local offers and bids |                bounded by participants and rounds configured for the work scope | no global truthful-capability oracle is assumed                                            |
| sparse agreement                |                      `O(c)` shares/locks per local round |   implementation-dependent committee exchange, bounded by `c`, rounds and views | committee intersection and authenticated membership satisfy the installed threshold policy |
| certified artifact availability |                                          `O(r)` receipts |                                 `O(r)` successful replica receipts per artifact | replica identities and threshold are fixed in the certificate                              |
| anytime semantic control        |                                      `O(m)` accumulators |   `O(m)` local arithmetic per observation and no collective message requirement | bounded increments, declared missingness and alpha-spending assumptions hold               |
| invariant/telemetry append      | `O(1)` per indexed head/event before configured capacity |                                              `O(1)` local digest/signature work | durable CAS, idempotency and external monotonic anchors are available                      |

These are implementation envelopes, not measured latency or success-rate
claims. The `O(f^h)` dissemination ceiling is intentionally conservative;
duplicate suppression and overlap normally reduce actual transmissions.

## Adaptation and convergence

The system does not claim deterministic global convergence under permanent
partition. It targets conditional convergence:

- causal delivery converges for an artifact when a live authenticated path and
  at least one valid replica remain available;
- a decision converges when the configured committee intersection, honest-share
  and eventual-delivery assumptions hold for a stable epoch;
- a local plan converges to a usable window when its dependencies, allocation,
  finality and semantic guarantee all remain valid long enough to commit; and
- semantic control is stochastic: the anytime-valid bound can continue,
  shorten, replan or stop without pretending to prove model correctness.

Epoch changes, equivocation, evidence expiry or loss of a required threshold
invalidate the affected convergence claim and move the local runtime to pause,
recovery, replanning or safe stop.

## When decentralization should help

The architecture predicts an advantage over a centralized coordinator when:

- the collective is much larger than each useful interaction neighborhood;
- link or peer failures are spatially localized;
- missions can be decomposed into partially independent scopes;
- local observations become stale faster than a global state can be collected;
- central ingress, scheduling or state replication would be the dominant
  bottleneck; or
- a failed coordinator would otherwise halt unrelated work.

It may be worse when the collective is small, the network is reliable, every
decision needs a complete global view, the optimization objective is tightly
coupled, or the central baseline can cheaply compute a materially better global
allocation. The open-core therefore exposes both causal/message accounting and
comparison manifests instead of asserting universal superiority.

## Falsifiable evaluation hypotheses

1. With fixed `k`, local memory and peer-maintenance work grow sublinearly in
   `N` relative to a complete topology representation.
2. Under localized failure, unaffected scopes preserve useful progress while a
   centralized baseline waits for global recovery or rescheduling.
3. Recovery communication follows the number of affected scopes and required
   replicas more closely than total collective size.
4. A semantic horizon gate lowers unsafe long-horizon effects at the cost of
   additional replanning; both quantities must be reported.
5. Agreement hardening reduces conflicting committed effects under adversarial
   peers, while quorum loss increases safe-stop frequency.

Source completion cannot establish these hypotheses. They become claims only
after paired, reproducible scenarios report success, recovery, communication,
coherence, agility and safe-stop outcomes with uncertainty bounds.

## Local transition model

For peer `i` at logical step `t`, define:

- `x_i(t)`: durable local control state, including membership, policy, causal
  heads, assignments, fences, budgets and retained evidence references;
- `v_i(t)`: the bounded local peer view;
- `e_i(t)`: newly delivered records and local observations;
- `a_i(t)`: the proposed local action, which may be `abstain`, `challenge`,
  `replan`, `recover` or `safe_stop`;
- `pi_i(t)`: the installed local policy and authority ceiling; and
- `F_i(t)`: the current effect fence resolved from authoritative state.

The peer transition is modeled as:

```text
A_i(t) = admit(e_i(t), x_i(t), v_i(t), pi_i(t))
(x_i(t+1), a_i(t)) = delta_i(x_i(t), A_i(t), pi_i(t))
effect_i(t) = commit(a_i(t), F_i(t)) only when gate_i(...) = allow
```

`admit` is fail-closed and applies authentication, membership, scope,
freshness, canonical-content, replay and capacity checks. `delta_i` is a local,
revision-checked reducer. `gate_i` re-resolves current authority rather than
trusting a planning, allocation, model or certificate response held by the
caller. No transition function may infer execution authority from message
delivery or from a content digest alone.

### Normative local rules

1. **Local knowledge:** a peer acts only on its durable state and admitted
   records; absence from the local view is not proof of global absence.
2. **Authority separation:** discovery, trust, planning, allocation and
   agreement records remain evidence until the pre-effect boundary validates
   current assignment, lease, epoch and fence.
3. **Monotonic coordinates:** revision, logical-time high-water, assignment
   epoch, fencing token and checkpoint sequence cannot decrease.
4. **Causal continuity:** a transition that declares a predecessor must either
   possess and validate it or remain unresolved.
5. **Deterministic replay:** equal canonical inputs at an equal state head
   produce an equal transition digest; external effects are mediated by a
   separately idempotent sink.
6. **Bounded work:** every queue, fanout, message, retained history, committee,
   retry loop, model operation and effect attempt has an installed limit.
7. **Attenuation:** delegation, child agents and derived roles cannot widen the
   parent authority, capability or resource ceiling.
8. **Evidence non-amplification:** repetition or correlated provenance cannot
   create additional independent support.
9. **Policy versioning:** policy changes create a new digest and state lineage;
   retained observations are not silently reinterpreted.
10. **Conservative uncertainty:** missing or contradictory evidence cannot be
    converted into an ordinary allow decision by a default branch.

## Explicit assumptions

The safety and liveness statements below are conditional on the installed
deployment satisfying the applicable assumptions. An evidence package must
identify which assumptions it exercises; an untested assumption remains an
assumption.

| ID  | Assumption                                                                                                                        | Consequence when false                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A1  | Canonical serialization and the selected digest and signature algorithms behave as configured.                                    | Identity and content bindings cannot be relied upon.                                                  |
| A2  | Authoritative membership and key resolvers return the current epoch and preserve historical verification material.                | A removed, substituted or unknown identity may be accepted, or valid history may become unverifiable. |
| A3  | Signing keys for correct peers are not shared and the signing boundary refuses conflicting votes forbidden by its durable lock.   | The configured agreement fault threshold no longer describes the effective adversary.                 |
| A4  | Durable CAS is atomic for one state key; rollback-sensitive state and its independent monotonic witness advance consistently.     | Restart or restore can revive stale authority or permit a conflicting transition.                     |
| A5  | Effect sinks atomically couple the effect with an idempotency and fence record.                                                   | A timeout can leave an ambiguous or duplicated external effect.                                       |
| A6  | Logical time used for expiry and ordering is monotonic within the declared tolerance.                                             | Freshness and timeout decisions may be unsound or progress may stop safely.                           |
| A7  | At least the required replica and committee thresholds remain reachable during a stable interval.                                 | Finality, recovery or artifact resolution may remain unavailable.                                     |
| A8  | For liveness only, communication among the required correct peers becomes timely for a sufficiently long interval.                | Safety can remain intact while progress is indefinitely delayed.                                      |
| A9  | Independence-group evidence is issued by an authoritative method and bounds correlated control of sources.                        | A colluding set can appear more independent than it is.                                               |
| A10 | Capability, resource and environment observations are authenticated or explicitly treated as untrusted claims.                    | Allocation quality may degrade; execution authority must still not widen.                             |
| A11 | Statistical observations satisfy the boundedness, predictability and conditional-mean assumptions registered for their estimator. | Confidence-sequence coverage is not established.                                                      |
| A12 | Provider and tool adapters honor cancellation, size, credential-isolation and result-integrity contracts.                         | The core can reject an invalid receipt but cannot make a compromised adapter safe.                    |

## Conditional safety properties

These are proof obligations for an implementation and deployment, not empirical
performance claims.

### S1: authority non-amplification

Under A1, A2, A4 and A5, a record that is not a current Work Contract or
equivalent installed authorization cannot by itself cause a protected effect.
The pre-effect check must bind the exact action payload, assignee, role,
membership epoch, allocation/finality record, budget coordinate and sink key.

### S2: finality uniqueness

For one decision coordinate and stable membership epoch, two conflicting values
cannot both be accepted by a correct verifier when committee intersection holds,
at most the configured Byzantine threshold is present, and correct validators
obey durable locking (A1-A4). A digest match alone is insufficient; signatures,
membership, phase, lock lineage and application semantics must also verify.

### S3: stale executor exclusion

After an assignment epoch or fence advances, an operation carrying an older
coordinate cannot pass the current effect boundary. This depends on the sink
reading current authoritative state rather than a cached snapshot (A2, A4 and
A5).

### S4: budget conservation

For every accepted transition, reserved, available, consumed, released and
forfeited units reconcile to the prior balance plus explicitly admitted grants.
Concurrent allocators require one shared atomic reservation boundary; local
arithmetic alone does not establish this property.

### S5: lineage attenuation

For every parent-child edge, the child's authority, capabilities, tools,
action classes and aggregate delegated budgets are subsets of the parent's
current ceiling. Revocation or termination must fence descendants before their
next protected effect.

### S6: bounded failure

Malformed, replayed, over-capacity or unverifiable input produces a bounded
reject, defer, challenge, recovery or safe-stop transition. It must not create
unbounded retry, fanout, durable growth or synchronous verifier work.

## Executable bounded model

The provider-neutral entry point
`@agentplat/collective-control/bounded-model` makes S2-S6 and the effect-facing
part of S1 executable as a finite-state specification. It explores every
command at every reachable state up to the configured data and trace bounds;
it is not a statistical campaign and performs no network, model-provider or
deployment I/O.

| Document obligation         | Executable property            | Model coordinates                                                                             |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| S2 finality uniqueness      | `finality_uniqueness`          | decision coordinate and finalized value                                                       |
| Normative rule 3            | `monotonic_epoch_and_fence`    | assignment epoch and fencing token                                                            |
| S4 budget conservation      | `budget_conservation`          | available, active child-reserved, total consumed and cumulative child-consumed units          |
| S1 and S5 attenuation       | `authority_attenuation`        | parent/child capability masks and aggregate budget ceilings                                   |
| S1 effect authorization     | `effect_authorization_binding` | exact finalized membership epoch, allocation epoch/fence, assignee, capability, role and sink |
| S3 stale executor exclusion | `stale_effect_exclusion`       | effect count, exact current epoch and exact current fence                                     |
| S6 conservative failure     | `fail_closed_transitions`      | invalid command rejection and unchanged rejected state                                        |
| Checker non-vacuity         | `transition_conformance`       | reference-valid inputs are accepted with the reference next state                             |

`checkBoundedCollectiveControlModelV1()` returns one of three digest-bound
artifacts:

- `proved_within_bounds` after the complete reachable space through the
  configured depth is exhausted;
- `counterexample` with the exact command trace and before/after state digests
  when a property is violated; or
- `incomplete` when the operational state-exploration cap is reached, which is
  deliberately not reported as proof.

The checker can run the included reference reducer or another synchronous,
pure transition implementation supplied through its structural port. Bounds
cover trace depth, state and transition capacity, membership and allocation
epochs, fences, assignees, capabilities, roles, authorized effect sinks, budget
units, decision coordinates and finality values. A proof receipt establishes
only that no counterexample exists inside those finite bounds and under the
model's transition abstraction. It does not establish storage atomicity,
signature correctness, adapter behavior, network assumptions, effect-sink
idempotency or safety of a production deployment.

The explored command corpus includes valid operations, boundary-invalid
coordinates and amounts, non-object JSON values, unknown command kinds,
missing fields, wrong runtime field types and unexpected fields. The transition
port therefore receives `command: unknown`; implementations must parse rather
than rely on a TypeScript union at runtime. A rejected input must leave state
unchanged. Conversely, rejecting every input is not a proof: every
reference-valid transition must be accepted with the same canonical next state
before `proved_within_bounds` is available.

For `finalize_allocation` and `commit_effect`, the valid corpus is the complete
Cartesian product of every membership epoch, assignment epoch, fence,
assignee, capability, role and effect sink inside the configured bounds. The
negative corpus is generated independently for both commands and every field:
missing, extra, wrong-type, lower-bound and bounds-sensitive upper-bound forms
are exercised. This is intentionally more expensive than single-axis sampling;
operational state or transition caps still yield `incomplete`.

Reservations and consumption use one aggregate delegated ceiling. An active
reservation commits child capacity immediately; consuming it moves the same
units from reserved to cumulative child-consumed spend without counting them a
second time. Consequently `reservedBudgetUnits + childConsumedBudgetUnits`
cannot exceed `childBudgetCeiling`, and direct effects must leave room for all
active reservations.

`commit_effect` is unavailable until `finalize_allocation` fixes an exact
authorization tuple. The effect command must repeat the current membership
epoch, assignment epoch and fence, assignee, capability/role and authorized
effect sink exactly. Advancing any authority coordinate clears the current
allocation authorization and requires a new finality. A generic finality value
does not authorize an effect.

A proof receipt includes `effectAuthorizationCoverage`, with counts for
allocation finalizations, accepted effects, pre-finality rejection, finalized
identity mismatch rejection, compound allocation tuples and malformed
allocation rejection. The effect-authorization property also has an explicit
`witnessCount`. If any required witness class is absent, the result is
`incomplete` with `insufficient_effect_authorization_coverage`, never proof.

Every result binds four separate identities: the declared transition
implementation digest, the canonical command-corpus digest, the bounded-space
definition digest derived from the model identifier, bounds and corpus, and the
deterministic digest of the reachable state set actually visited before the
result or operational cutoff. The bounded-space digest identifies what was
configured for exploration; `exploredStateSetDigest` identifies what the run
reached. Custom transition ports must provide their own implementation content
digest. The reference port uses
`REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_DIGEST_V1`, derived from its
exported versioned semantic descriptor. This identity is reproducibility
metadata, not remote attestation of loaded code.

## Executable conditional progress model

Safety does not imply progress. The provider-neutral entry point
`@agentplat/collective-control/bounded-progress-model` (the package manifest's
`./bounded-progress-model` subpath) executes the following conditional targets:

- **L1 — delivery:** under A2, A6-A8 and a non-exhausted queue, an admitted
  content reference eventually reaches every required reachable recipient or
  produces a terminal delivery failure.
- **L2 — decision:** during a stable epoch with at most the configured faulty
  validators, a correct proposer/view and sufficient timely communication, an
  admissible value eventually finalizes or the operation returns a bounded
  unavailable result.
- **L3 — recovery:** when a certified checkpoint and its required replicas are
  reachable, a replacement with current authority eventually restores that
  exact checkpoint or selects a bounded reauction/replan path.
- **L4 — adaptation:** after an admitted drift or outcome signal persists past
  configured hysteresis, the local controller eventually proposes an allowed
  adaptation or emits an explicit no-safe-adaptation decision.

The executable abstraction initializes each antecedent as true: causal input
and its predecessor are available, quorum is available, a certified checkpoint
and successor are available, and an admitted persistent signal plus fair
scheduling are available. A deterministic four-slot scheduler then gives one
turn to each obligation.

| Target | Executable property                     | Fair-scheduler transition                                                |
| ------ | --------------------------------------- | ------------------------------------------------------------------------ |
| L1     | `causal_delivery_progress`              | available causal input becomes delivered in slot 0                       |
| L2     | `quorum_finality_progress`              | the quorum-available decision finalizes in slot 1                        |
| L3     | `successor_recovery_progress`           | the available successor restores the certified checkpoint in slot 2      |
| L4     | `persistent_signal_adaptation_progress` | the persistent admitted signal produces an adaptation decision in slot 3 |

`checkBoundedCollectiveProgressModelV1()` returns
`proved_within_bounds`, a digest-bound property-specific `counterexample`, or
`incomplete`. A horizon shorter than one complete scheduler cycle is
`incomplete`, never proof. The event corpus includes malformed runtime values,
and a custom transition must accept every reference-valid scheduler tick with
the exact canonical next state, so rejecting all work cannot produce a vacuous
proof. Results bind the transition implementation, event corpus, configured
bounds and actual explored state set.

No liveness claim is made during permanent partition, quorum loss, exhausted
resource budgets, unavailable authoritative state, or an indefinitely hanging
external adapter. Nor does the checker establish that its antecedents or fair
scheduling hold in a deployment. Production hosts therefore need deadlines,
cancellation, backpressure, availability evidence and operator-visible terminal
reason codes.

## Byzantine and collusion limits

### Agreement threshold

For a committee of size `c = 3b + 1`, the standard quorum threshold is
`2b + 1`, where `b` is the maximum number of Byzantine validators assumed for
that committee and epoch. Safety relies on any two quorums intersecting in at
least `b + 1` validators and therefore at least one correct validator. Sparse
committee selection does not improve this threshold: it changes cost and risk
concentration, and its selection seed and eligibility inputs must themselves be
membership-bound and resistant to manipulation.

The model does not claim safety when:

- more than `b` selected validators are Byzantine;
- a correct validator can lose or roll back its durable lock;
- membership configurations overlap incorrectly during reconfiguration;
- the selection seed can be ground after candidate identities are known; or
- the verifier accepts a committee, threshold or policy supplied only by the
  untrusted certificate.

### Collusion and Sybil resistance

Correlation caps and independence groups reduce repeated influence only to the
extent that A9 holds. They do not discover hidden common control, coordinated
model behavior or a compromised independence issuer. Membership admission,
key custody, organizational provenance and challenge evidence remain distinct
controls. A Sybil set admitted as independent identities can violate the model
without breaking a signature.

Quarantine is scoped and evidence-backed. It must not become an unreviewable
global reputation score, and recovery requires new independent evidence under a
new validity window. Uncertain collusion should reduce authority or availability
rather than be silently converted to a categorical accusation.

## Communication, storage and recovery bounds

Let `s` be the number of shard committees, `p` the number of missing causal
records requested during catch-up, `u` the number of unavailable peers being
replaced and `R` the maximum agreement rounds/views admitted by policy.

| Path                   |                               Local storage envelope |                                           Communication/work envelope | Qualification                                                                    |
| ---------------------- | ---------------------------------------------------: | --------------------------------------------------------------------: | -------------------------------------------------------------------------------- |
| peer view refresh      |                                               `O(k)` |                                               `O(k)` candidate checks | excludes authoritative membership storage                                        |
| one sparse update      |    `O(k + d)` for view and bounded dedupe window `d` |                                 `O(min(N, f^h))` attempted deliveries | duplicate suppression may reduce, never increase, this ceiling                   |
| causal catch-up        |    `O(p)` imported records plus bounded cursor state |          `O(p)` records and `O(ceil(p/q))` chunks for chunk bound `q` | excludes content-replica transfer bytes                                          |
| one committee round    |                             `O(c)` local votes/locks | commonly `O(c^2)` signed vote deliveries without an aggregation relay | threshold aggregation can reduce certificate size but not validation obligations |
| sharded finality       |         `O(sc)` committee evidence before compaction |        up to `O(s c^2 R)` vote deliveries in the unoptimized envelope | assumes bounded `s`, `c` and `R`                                                 |
| artifact certification |                                      `O(r)` receipts |                 `O(r)` successful writes plus bounded failed attempts | content bytes are accounted separately                                           |
| checkpoint takeover    |                   `O(r + u)` evidence and candidates |         `O(r + u)` resolution/election messages plus checkpoint bytes | restore cost depends on checkpoint size and adapter                              |
| local semantic update  | `O(m)` accumulators plus bounded evidence references |                     `O(m)` arithmetic and no required network message | assessor/model cost is separate                                                  |

Recovery must also bound time and amplification. A single missing predecessor
cannot trigger an unbounded recursive fetch; a failed replica cannot be retried
without a per-source attempt and byte budget; and one unavailable peer cannot
cause unrelated scopes to reauction unless a causal dependency requires it.

## Statistical coherence guarantees

For metric `j`, transform each admitted observation to `X_(j,n)` in `[0,1]` and
fix an error budget `delta_j` before observing the sequence. One auditable
anytime schedule is:

```text
delta_(j,n) = delta_j / (n(n + 1))
w_(j,n) = sqrt(log(2 / delta_(j,n)) / (2n))
```

Under A11, a two-sided Hoeffding-Azuma interval around the running mean of
conditional means uses half-width `w_(j,n)`. Since
`sum_(n>=1) 1/(n(n+1)) = 1`, union-bounding across times and assigning
`sum_j delta_j <= delta_family` yields the registered family-wise error budget.
Repeated reads do not spend additional error because spending is indexed by
admitted sample count.

This guarantee is about the transformed metric stream. It does not prove latent
semantic correctness, causality, assessor calibration, future performance or
independence. Missing metrics require a predeclared rule: fail closed,
directional worst-case imputation, or predictable skip supported by assumption
evidence. Policy, transformation, direction, missingness and evidence digests
must remain fixed for the state lineage.

Coherence reporting should include interval endpoints, sample count,
missingness, assumption-evidence identifiers and all enabled dimensions. A
single aggregate score must not hide a failed hard constraint.

## Alignment-agility tradeoff

Alignment and agility are separate objectives:

- **alignment** limits role, mission, context, authority and safety deviation;
- **agility** limits the delay and interaction cost required to detect change,
  explore alternatives, replan and restore useful progress.

Aggressive adaptation may shorten recovery while increasing plan churn,
semantic variance and unsafe proposal pressure. Conservative gating may reduce
unsafe effects while increasing abstention, safe-stop and missed-opportunity
cost. The controller therefore uses a constrained policy rather than one scalar
reward:

```text
minimize   adaptation delay + interaction cost + churn penalty
subject to lower(coherence_j) >= threshold_j for higher-is-better metrics
           upper(risk_j) <= threshold_j for lower-is-better metrics
           authority, budget and fence invariants hold exactly
```

Hysteresis, minimum dwell time, change budgets and rollback criteria are part
of the policy digest. Evaluation must report useful progress and refusal
separately so a system cannot appear aligned merely by doing nothing.

## Paired baseline hypotheses

Each hypothesis is a prospective comparison, not a repository claim. The
centralized baseline must receive equivalent observations, capabilities,
resource ceilings, fault schedules and effect protections. Seeds or scenario
instances should be paired, and architecture-specific overhead must remain in
the accounting ledger.

| ID  | Falsifiable hypothesis                                                                                                                                 | Primary quantities                                                | Important counter-result                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| H1  | Fixed-degree local state grows more slowly with `N` than a complete centralized topology representation.                                               | peak peer state, coordinator state, topology messages             | central compression matches cost without loss of progress             |
| H2  | Localized failures preserve more unaffected-scope progress than loss of the central coordinator.                                                       | unaffected completed value, stalled scopes, recovery delay        | decentralized recovery propagates equal or wider disruption           |
| H3  | Recovery traffic is explained better by affected scopes/replicas than by total `N`.                                                                    | recovery bytes/messages versus `u`, `r` and `N`                   | traffic remains proportional to total population                      |
| H4  | Sparse agreement reduces coordination cost relative to all-member agreement while preserving the registered conflict rate bound under its fault model. | vote messages, certificate bytes, conflicting effects             | committee concentration increases conflict or safe-stop beyond policy |
| H5  | Semantic horizon control lowers unsafe executable effects at an explicit cost in replans, abstentions and delay.                                       | unsafe effects, useful decisions, replans, latency                | only refusal improves while useful progress collapses                 |
| H6  | Local context freshness improves decisions when global collection latency exceeds observation lifetime.                                                | observation age, decision value, correction rate                  | fragmented context produces more error than staleness avoids          |
| H7  | Distributed allocation restores eligible capacity faster after local withdrawals.                                                                      | time/interactions to reassignment, budget waste                   | central reoptimization is cheaper and equally available               |
| H8  | Governed role adaptation recovers coherence faster than a fixed-role policy without widening authority.                                                | coherence interval, adaptation delay, authority violations        | churn increases without useful recovery                               |
| H9  | Certified replication reduces unrecoverable work after producer loss at bounded storage and communication cost.                                        | recoverable checkpoints/artifacts, replica bytes/messages         | replication cost dominates saved work                                 |
| H10 | No architecture is uniformly superior across small reliable and large degraded regimes.                                                                | paired mission value, cost, safe-stop and tail latency by stratum | one architecture dominates only if registered intervals support it    |

Comparisons should predeclare equivalence or non-inferiority margins, primary
metrics, multiplicity handling, missing-run policy and stopping rules. Raw
paired outcomes, invalid-run reasons and resource ledgers remain available for
independent recomputation.

## Non-claims and transition boundary

This model does not claim global optimality, universal availability, semantic
truth, immunity to collusion, a verified production security posture, a fixed
cost advantage or measured superiority over a centralized design. Those are
separate evidence questions.

The reusable delivery sequence, work packages, cost model, rights boundary and
36-month adoption gates are defined in the
[decentralized collective transition plan](../transition/decentralized-collective-transition-plan-v1.md).
