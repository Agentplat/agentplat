# AgentPlat `0.3.0-beta.3` Adaptive Mission Runtime implementation plan

Status: design candidate. No package implementation begins until this plan, ADR
0009, the threat model, evaluation contract and acceptance checklist have a
public design review with zero open P0, P1 or P2 findings.

## Outcome

Beta 3 adds an opt-in closed-loop runtime that starts with a high-level mission
intent rather than a precomputed task graph. Peers use partial observations to
propose bounded work, form temporary roles through real Mesh allocation,
execute protected effects through the Beta 2 governed path and causally replan
when the world or collective changes.

The release must prove this path with production reducers and adapters:

```text
intent -> observations -> proposals -> plan views -> Mesh Work
       -> offer/bid/award/accept -> Work Contract -> protected effect
       -> outcome/checkpoint -> plan revision or completion
```

The normative evaluation derives its trace, ledger, success and failures from
executed events. A prebuilt task list, direct assignee lookup, direct Work
Contract construction, declared-only fault or synthetic metric invalidates the
sample.

## Research hypothesis

For a bounded mission intent and sparse partial-observation topology, peers can
form and revise a useful distributed task graph using only local observations
and peer messages while preserving the Beta 2 authority and fencing
invariants. Under the registered 500-agent and 5,000-interaction ceiling, the
closed-loop collective should remain competitive with an information-equivalent
centralized planner and recover from at least one causal plan disruption without
using global state.

This is a falsifiable engineering hypothesis. Beta 3 does not claim Byzantine
agreement, arbitrary long-horizon optimality, production capacity or universal
asymptotic behavior.

### Primary endpoints

1. mission success rate derived by the environment monitor;
2. authorization, plan-authority and external-fence violation counts;
3. completed outcome value per registered interaction budget;
4. interactions from disruption to restored mission-success trajectory;
5. accepted-plan coverage and healthy-peer plan-head convergence after heal;
6. role-coherence horizon during adversarial context injection;
7. hidden-state, direct-assignment and synthetic-ledger violation counts.

Any non-zero safety, authority, hidden-state, direct-assignment, stale-fence,
duplicate-effect or synthetic-ledger violation fails the milestone.

### Secondary endpoints

- time and interactions to first executable fragment;
- proposals accepted, challenged, rejected and superseded;
- fragment graph depth, fanout, churn and live cardinality;
- work offers, bids, awards, acceptances and declines per completed outcome;
- role formation and reassignment counts;
- stranded planning and action reservations;
- message and evidence bytes per interaction;
- useful-to-total interaction ratio;
- p50, p95 and maximum replanning latency;
- abstention, challenge, quarantine and refusal rates;
- wall-clock and memory diagnostics on the controlled runner.

Diagnostics are not capacity or service-level claims.

## Release identity and baseline

- target release: `0.3.0-beta.3`;
- npm distribution tag: `next`;
- compatibility baseline: annotated `v0.3.0-beta.2`;
- published Beta 2 release commit:
  `43037e3fa05133377672ef769140912eaf87bcef`;
- post-release evidence baseline:
  `64478b1dce9f62544a865426faef710fa1f70f49`;
- Mesh wire version: `1`, unchanged;
- supported Mesh wire versions: `{0, 1}`, unchanged;
- expected coordinated public package count: `37` after adding
  `@agentplat/collective-planning`.

All package versions move together. No Beta 2 version or tag is overwritten.

## Scope

### Included

- high-level mission intent with no task or assignment oracle;
- provider-neutral plan fragments, local plan views and deterministic selection;
- peer-local proposal, acceptance, challenge, rejection and supersession;
- dynamic role bindings derived from current accepted Mesh assignment;
- opt-in projection through actual Mesh Work and allocation APIs;
- causal replanning from observations, results, capability withdrawal and
  assignment failure;
- deterministic environment, observation and invariant-monitor ports;
- closed-loop governed and fair centralized reference runners;
- conformance cases and deliberately broken implementations;
- registered 50, 100, 250 and 500-agent campaign;
- exact replay, snapshot/restore and statistical evidence;
- public package, tarball, registry-consumer and compatibility gates.

### Excluded

- a new Mesh wire version or new Mesh payload discriminant;
- global Byzantine planning consensus;
- the 5,000-agent/50,000-interaction scale step;
- model training, fine-tuning or mandatory representation access;
- a hosted coordinator, membership service or policy control plane;
- autonomous Room approval or mandate installation;
- physical-world deployment or an embedded robotics runtime;
- mutable model weights during a normative run;
- claims that passing evaluation authorizes a deployment.

## Public terminology

The public surface uses only these industry terms:

- mission intent;
- planning policy;
- plan fragment and semantic slot;
- plan view and causal frontier;
- adaptive role binding;
- environment adapter;
- invariant monitor;
- closed-loop runner;
- replanning and convergence evidence.

No external program name, procurement identifier or customer-specific term is
part of a package, symbol, fixture, report or public document.

## Package and dependency architecture

### `@agentplat/collective-planning`

The package is additive, provider-neutral, side-effect free and browser safe at
its root. Importing it performs no clock, random, filesystem, network,
persistence, model, migration, registration or telemetry operation.

| Export         | Responsibility                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `.`            | strict contracts, digests, validation, pure planning reducer, snapshots                              |
| `./mesh`       | opt-in Mesh projection, critical-extension binding, current assignment and Work Contract composition |
| `./evaluation` | environment, observation, trace, monitor and runner ports; no environment implementation             |

The root depends only on browser-safe foundation contracts. `./mesh` may import
Mesh and Collective Control. `./evaluation` may import root types. No existing
package imports this package from its root entrypoint, and no dependency cycle
is allowed.

### Existing package changes

- `@agentplat/mesh-sim` gains the deterministic reference environment and
  closed-loop runner. It uses the new package, existing Mesh drivers and
  existing governed facades.
- `@agentplat/mesh-conformance/planning` gains mandatory portable planning cases
  and optional Mesh/evaluation case groups.
- `@agentplat/collective-control/evaluation` keeps every V1 export unchanged and
  adds separate V2 report contracts or re-exports compatible evaluation types
  from the planning package only through a new explicit subpath.
- `@agentplat/collective-control`, Mesh roots, Runtime, Sessions, Rooms, Trust,
  Inference Control and Framework keep existing defaults and closed unions.
- PostgreSQL is not required by the portable planning root. The normative
  durable profile uses the already published Mesh and Collective Control
  repositories; no automatic migration runs on import.

## Normative contracts

All records are closed, immutable, strictly validated and canonically digested.
Unknown fields fail. Identifiers, arrays, strings, records, graph sizes and
encoded bytes have explicit limits.

### Mission intent

```ts
interface MissionIntentV1 {
  schemaVersion: 1;
  missionIntentId: string;
  revision: number;
  predecessorDigest: PlanningDigestV1 | null;
  tenantId: string;
  policyDomainId: string;
  objective: {
    meshId: string;
    objectiveId: string;
    objectiveDocumentId: string;
    objectiveRevision: number;
    acceptedPolicyDigest: PlanningDigestV1;
  };
  mandateDigest: PlanningDigestV1;
  outcomeStatements: readonly string[];
  permittedResourceClasses: readonly string[];
  permittedCapabilityKeys: readonly string[];
  planningLimits: PlanningLimitsV1;
  selectionPolicyDigest: PlanningDigestV1;
  validFrom: string;
  validUntil: string;
  intentDigest: PlanningDigestV1;
}
```

It contains no Work Item IDs, task graph, fixed role allocation, assignee IDs,
future fault schedule, hidden world state or terminal predicate.

`PlanningLimitsV1` fixes at least:

- maximum candidate and active fragments;
- maximum fragments and revisions per peer and semantic slot;
- maximum dependency depth and fanout;
- maximum capability and outcome terms;
- maximum proposal, snapshot and trace bytes;
- maximum total and per-fragment planning budget;
- deterministic per-peer budget-shard policy;
- maximum concurrent proposals and active roles;
- proposal, observation and replanning logical-time windows.

Intent revision is exactly predecessor revision plus one, preserves tenant,
domain and Objective identity, and cannot widen the locally accepted mandate.

### Observations

`MissionObservationV1` names the exact peer, intent revision, environment cursor,
logical time, visibility class, observation kind, bounded public value or
content reference and digest. Structural validation denies named authority and
hidden-state fields; because generic JSON semantics are not machine-inferable,
the registered environment adapter allowlists each observation-kind schema and
the independent monitor detects simulator-global membership, unobserved
resources, hidden terminal state or future events.

Same cursor and peer with the same digest is idempotent. Reusing the cursor with
different content is an environment conflict and invalidates the sample.

### Plan-fragment proposal

```ts
interface PlanFragmentProposalV1 {
  schemaVersion: 1;
  proposalId: string;
  missionIntentId: string;
  intentRevision: number;
  intentDigest: PlanningDigestV1;
  proposerPeerId: string;
  proposerInstanceId: string;
  semanticSlotKey: string;
  predecessorFragmentDigest: PlanningDigestV1 | null;
  parentFragmentDigests: readonly PlanningDigestV1[];
  dependencyFragmentDigests: readonly PlanningDigestV1[];
  outcomeStatements: readonly string[];
  roleKey: string;
  requiredCapabilityKeys: readonly string[];
  inputReferenceDigest: PlanningDigestV1;
  basisObservationDigests: readonly PlanningDigestV1[];
  requestedBudgetUnits: number;
  workDeadline: string;
  proposedAtLogicalMs: number;
  proposalDigest: PlanningDigestV1;
}
```

A proposal cannot name an assignee, assignment epoch, authority generation,
fencing token, Action Grant, permit or handler. Proposal IDs are stable domain
IDs deterministically derived from intent, proposer, semantic slot, predecessor
and proposal revision; callers cannot add a random nonce. Same ID/same digest is
idempotent; same ID/different digest is a conflict. One peer may submit at most
one proposal for the same intent/slot/predecessor/revision tuple.

### Selection policy and decision

`PlanSelectionPolicyV1` freezes deterministic scoring dimensions, weights,
hard constraints, challenge thresholds, tie-break order and policy digest.
The reference policy uses only declared outcomes, budget, deadlines, current
capability evidence, dependency readiness and bounded risk signals. It cannot
read simulator-global state or a model's private reasoning.

`PlanFragmentDecisionV1` is one of `accepted`, `challenged` or `rejected` and
records stable reason codes, exact input digests, selected semantic-slot head,
local plan-view revision and resulting state digest. Acceptance only admits the
fragment to the planning projection. It does not create Work or execution
authority.

### Plan fragment and view

An accepted `PlanFragmentV1` copies the exact proposal fields plus acceptance
policy, local view revision, status and fragment digest. Status is:

```text
candidate -> active -> offered -> assigned -> executing
          -> superseded | cancelled | completed | failed
```

Only valid transitions append. Terminal fragments do not reactivate.

`PlanViewV1` contains:

- identity and exact intent/policy bindings;
- local monotonically increasing revision;
- bounded append-only proposal and decision records;
- fragment records keyed by digest;
- one selected head per semantic slot;
- causal frontier and unresolved dependency set;
- planning budget shards/reservations;
- mapping from fragment digest to local Mesh Work identity;
- active adaptive-role bindings;
- logical-time high-water and state digest.

The active graph must be acyclic. Dependencies may be temporarily unresolved,
but unresolved fragments cannot become executable Work. Cycle detection,
maximum depth and fanout are enforced before state mutation.

### Adaptive role binding

`AdaptiveRoleBindingV1` binds one fragment and role to an existing current
`WorkContractV1`, assigned peer/instance, assignment authority, epoch,
generation, fence and lease. It is a convenience and evidence record, not an
independent lease or grant. It becomes terminal whenever the Work Contract,
assignment, fragment or intent is no longer current.

### Snapshot

`CollectivePlanningSnapshotV1` includes format, schema, identity, intent,
policy, plan view, domain-record high-waters and digest. Restore validates every
record, graph edge, mapping, budget total, causal frontier and digest. It cannot
infer missing authority, lower a high-water or synthesize a current role.

## Mesh integration without wire change

The planning extension key is exactly:

```text
agentplat.collective-planning.fragment.v1
```

The extension is always critical and contains a bounded binding, not the full
planning snapshot:

```ts
interface PlanningWorkExtensionV1 {
  schemaVersion: 1;
  missionIntentId: string;
  intentRevision: number;
  intentDigest: PlanningDigestV1;
  proposalDigest: PlanningDigestV1;
  fragmentDigest: PlanningDigestV1;
  semanticSlotKey: string;
  predecessorFragmentDigest: PlanningDigestV1 | null;
  dependencyFragmentDigests: readonly PlanningDigestV1[];
  planViewDigest: PlanningDigestV1;
}
```

The Work offer `inputReference` names the content-addressed fragment record. The
planning adapter verifies:

- sender and proposer identity;
- verified current planning capability and critical-extension support;
- exact intent, mandate and Objective binding;
- fragment repository digest and closed schema;
- Work fields equal the fragment's executable projection;
- dependencies are accepted and non-cyclic in the local view;
- role/capability, deadline and budget are within all upstream ceilings;
- predecessor and semantic-slot selection are current;
- no reuse of planning or Work domain IDs with different content.

For local work, the facade evaluates the proposal first, then calls existing
`work.create`, prepares a real signed offer for eligible peers and applies the
existing allocation command. For inbound work, the planning gate validates the
extension and fragment before committing the planning projection; ordinary
non-planning Work continues through existing direct APIs unchanged.

Inbound processing first evaluates the existing Mesh processor as a candidate
transition and then evaluates the planning gate against that candidate. If the
planning gate rejects, the committed transition may retain only the existing
non-evictable replay and message-ID high-waters required to prevent a rejected
envelope from becoming admissible later. It commits no Objective, Work,
allocation, planning, role, budget or effect state from the rejected envelope.

Planning negotiation uses real `work.offer`, `work.bid`, `work.award`,
`work.accept` and `work.decline` records. No evaluation path may substitute a
direct array lookup or construct assignment authority.

## Replanning semantics

Replanning is triggered only by an explicit local input:

- new environment observation;
- dependency result or failure;
- capability advertisement withdrawal or expiry;
- Trust eligibility change;
- assignment decline, lease expiry or certified recovery;
- intent revision or revocation;
- bounded logical-time deadline input.

The decision policy may propose a new fragment or a causal replacement. The
reducer decides whether it becomes the local semantic-slot head. If it
supersedes existing Work, the facade must explicitly revise or cancel that Work
through Mesh. Current protected execution may complete only if the mandate,
intent, fragment, Work Contract, assignment and fence all remain current at the
Action Gateway's final checkpoints.

A completed external effect is never undone by rewriting the plan. New plans
consume the observed outcome and append compensating work when policy permits.
An indeterminate effect remains charged and blocks unsafe re-execution until
reconciled by authoritative downstream evidence.

## Budget model

Planning has a resource-control ledger distinct from effect authority:

- deterministic shards are derived from intent policy and the sorted subject
  set frozen by the exact locally accepted mandate; discovery, capability or
  Trust changes cannot resize that set;
- proposals reserve from the proposer's shard;
- rejection or terminal non-execution releases according to explicit policy;
- superseded active work remains reserved until Mesh and governed state make
  release authoritative;
- shards never increase because of remote messages or Trust scores;
- Beta 3 does not transfer shards dynamically.

The authoritative effect ceiling remains Beta 2's mandate and action budget
repository. The effective allowance is the minimum of intent, plan shard, Mesh
Objective/Work, Work Contract and governed-action ceilings.

## Environment and evaluation ports

### Runner-visible port

`CollectiveEnvironmentPortV1` exposes only:

- deterministic initialization from a registered configuration and seed;
- bounded observation polling for one exact peer and cursor;
- application of one protected effect with idempotency and fencing bindings;
- explicit logical-time/event advancement;
- strict snapshot and restore;
- redacted public event receipts.

It does not expose all agents, all tasks, hidden state, success predicates,
future events or a method that chooses an assignee.

### Evaluator-only monitor

`CollectiveInvariantMonitorV1` receives the append-only environment and runtime
event stream. It alone derives:

- mission and partial success;
- objective value;
- authority, plan-authority and fencing violations;
- duplicate external effects;
- hidden-state/direct-assignment/synthetic-ledger violations;
- recovery and replanning intervals;
- terminal reason and first violating event.

The runner cannot query the monitor during a sample. Monitor code and digest are
registered independently from runner code.

### Event-derived ledger

Every accounted interaction corresponds to one immutable V2 trace event. The
ledger reducer counts trace events and must equal a fresh replay count. No code
may assign a desired total or add bookkeeping events to meet a threshold.

## Normative closed-loop runner

The governed runner executes these phases through public or package-internal
production boundaries:

1. create the environment and peer-local states from registered inputs;
2. install the same locally accepted mandate and Objective policy used by the
   Beta 2 governed boundary;
3. deliver only each peer's initial observation;
4. run deterministic/recorded peer decision policies;
5. reduce proposals and project accepted fragments into real Mesh Work;
6. deliver offers over the bounded local Peer View;
7. run actual bid, award, accept, lease and checkpoint/result flows;
8. derive Work Contracts only with `createWorkContractFromMeshV1`;
9. pass protected actions through Trust, inference assessment, Action Grant,
   governed permit, final currentness checks and a fenced environment sink;
10. inject registered faults at real adapter boundaries;
11. turn outcomes/failures into peer-local observations and causal replanning;
12. stop only on the registered predicate, hard bound or explicit failure;
13. finalize the trace and let the independent monitor derive the report.

The centralized baseline receives the same public intent, observations,
decision policy, resources, faults, protected-action boundary and interaction
accounting. It may maintain one centralized plan but receives no hidden state or
free communication.

## Conformance and negative implementations

Portable core cases cover:

- strict contract and digest validation;
- idempotency/conflict behavior;
- intent narrowing and revision;
- proposal decisions and stable reason codes;
- graph cycle/depth/fanout/cardinality limits;
- deterministic semantic-slot selection;
- planning-budget safety;
- snapshot/restore and high-water preservation.

Mesh cases cover:

- critical extension and capability negotiation;
- no downgrade or optional-authority fallback;
- exact fragment/Work projection binding;
- real offer/bid/award/accept flow;
- Work Contract creation only from current assignment;
- supersession, cancellation and stale-fence rejection.

Evaluation cases cover:

- environment isolation;
- event-derived ledger and monitor-only success;
- fault injection at actual boundaries;
- exact replay and snapshot/restore;
- fair baseline registration.

The suite includes deliberately broken implementations that:

- read hidden tasks or global membership;
- use a direct assignee lookup;
- treat a proposal or role as authority;
- accept a widened/cyclic fragment;
- omit a real fault while claiming its family;
- ignore supersession or an old fence;
- fabricate success or zero violations;
- pad the interaction ledger;
- omit a failed registered seed;
- leak a hidden-state canary.

Every broken implementation must fail at least one mandatory case.

## Registered evaluation campaign

The V2 contract is defined separately in
[the evaluation contract](./evaluation-contract-v2.md). The required campaign
uses:

- 50, 100, 250 and exactly 500 logical agents;
- no more than 5,000 event-derived interactions per sample;
- nominal, benign, adversarial and mixed strata;
- at least 30 paired seeds per runner/stratum at 500 agents;
- at least 10 paired seeds at smaller ladder points;
- a high-level intent with no prebuilt tasks;
- partial observations that require at least two peers' information;
- at least one registered disruption requiring a causal plan revision and role
  or assignment change in benign/mixed samples;
- 1,000 sequential role-coherence decisions under context manipulation;
- exact replay of every normative sample selected by registration;
- a sparse bounded-degree topology and no global-recipient oracle.

## Implementation increments

Each increment is independently reviewable and keeps the worktree releasable.

### Increment 0: design freeze

- ADR 0009;
- this plan;
- Adaptive Mission Runtime threat model;
- evaluation contract V2;
- Beta 3 acceptance checklist and design review;
- release-plan entry and terminology audit;
- zero open P0/P1/P2 findings.

No package code changes in this increment.

### Increment 1: portable contracts

- scaffold `@agentplat/collective-planning`;
- mission intent, observations, proposal, decision, fragment, view, role and
  snapshot contracts;
- domain-separated canonical digests;
- strict validators and malformed corpus;
- public type tests, package catalog and browser dependency gates.

Gate: pure contract tests plus Beta 2 compatibility.

Implementation review:
[Beta 3 Increment 1 review](beta-3-increment-1-review.md).

### Increment 2: pure planning reducer

- immutable plan state and transitions;
- deterministic selection policy;
- graph and planning-budget enforcement;
- logical-time inputs, idempotency and conflict handling;
- snapshot/restore and exact replay;
- property tests for arbitrary ordering, duplication and bounded graphs.

Gate: portable planning conformance and negative implementations.

#### Frozen Increment 2 reducer boundary

Increment 2 is confined to the browser-safe root of
`@agentplat/collective-planning`. It adds no Mesh payload, Mesh facade,
repository, environment, evaluator, execution path or authority surface. It
does not import Mesh, Collective Control, Inference Control, a Node built-in or
an external runtime dependency.

The construction input freezes an ordered set of admitted planning subjects.
Each subject is the exact `(peerId, peerInstanceId)` pair admitted for the
intent. Equal mandate-subject shards derive only from that fixed set. Remote
input, discovery, capability, eligibility and Trust changes cannot add a
subject, transfer a shard, or increase total planning budget.

The reducer owns its complete local evidence: accepted observations, exact
cursor tombstones, proposal/decision/fragment history, budget reservations,
domain high-waters, command idempotency records and logical-time high-water.
An observation cursor reused with the same digest is idempotent; reuse with
different content is a conflict. The state never consults an external
observation repository during reduction, restore or replay.

Its public input is a closed, versioned command union. The only command kinds
are `observation.record`, `proposal.record`, `slot.evaluate`,
`fragment.transition` and `logical-time.advance`. Every command carries a
logical command identifier, required `expectedStateDigest: PlanningDigestV1 |
null` and trusted logical time. A null expected digest permits causality-only
reorder; a non-null digest is the optimistic-concurrency precondition. Snapshot
restore is a separate strict API, not a reducer command. There is no generic
patch command, initialization command, implicit timer, host clock, random
value, execution command or authority command.

Reduction is atomic. It validates the complete command, scope, high-waters,
candidate graph, policy limits and budget ledger before publishing a next state.
A rejected command returns the existing frozen state unchanged: it cannot add a
timer, change a head, retain a cursor, consume/release budget, or emit an
effect. Same logical identifier and canonical digest is idempotent; the same
identifier with different content is a conflict.

The command digest separates domain content from first-application
preconditions. `expectedStateDigest` is checked as optimistic concurrency only
before the command is first accepted. `transitionedAtLogicalMs` is checked as a
temporal admission precondition for the fragment/predecessor/status identity.
Neither participates in the idempotency digest. Once that domain identity and
content is retained, a retry with a different precondition remains idempotent;
a different observation, proposal, candidate batch, fragment transition or
logical-time value remains distinct or conflicting. The command high-water
stores the canonical domain command with both preconditions normalized, keeping
the reducer state digest independent of admission-only input. Logical time is a
monotonic max-register, so an advance at or below its high-water is idempotent.

Candidate evaluation is batch-local and deterministic. The reducer first
applies hard constraints and then the frozen policy scoring dimensions. Only
after equal scores does it use the declared digest tie-break. It creates at
most one current semantic-slot head, preserves an acyclic bounded dependency
graph, and conserves the fixed planning budget across reservations, committed
terminal use and explicitly permitted releases. Lifecycle transitions are a
safe subset only: terminal intent, fragment and role records never reactivate.

Snapshots contain all reducer-owned records, including admitted peer/instance
subjects and shards, observations/cursor tombstones, idempotency and domain
high-waters, the complete budget ledger and logical time. Strict restore and
exact command replay must produce the same state digest without a Mesh,
environment, clock, repository or other external dependency.

### Increment 3: Mesh planning facade

- planning capability profile and critical extension;
- content-addressed fragment repository port;
- local proposal-to-Work projection;
- inbound planning gate and replay-only rejection behavior;
- exact Work projection validation;
- adaptive role/Work Contract wrapper;
- supersession, revision and cancellation composition.

Gate: real three-peer intent-to-assignment scenario from packed tarballs.

### Increment 4: environment boundary and truthful metrics

- environment, observation, effect and monitor ports;
- deterministic reference world with hidden-state canaries;
- append-only V2 event trace and ledger reducer;
- independent invariant monitor;
- removal of constant success, direct assignment and ledger padding from the V2
  path while preserving V1 historical replay.

Gate: all broken evaluator implementations fail.

### Increment 5: closed-loop execution

- actual Mesh discovery/allocation/execution drivers;
- governed Objective admission and Work Contract derivation;
- Trust/inference/action path and fenced environment sink;
- outcome/checkpoint observations and completion;
- reference centralized planner under identical information.

Gate: nominal and deterministic replay scenarios at 50 agents.

### Increment 6: causal replanning and faults

- observation-triggered fragment revision;
- capability withdrawal, decline, crash, partition/heal and stale-result paths;
- actual fault injection and coverage records;
- plan/Work cancellation, reassignment and old-fence suppression;
- snapshot/restore at every planning/effect boundary.

Gate: benign, adversarial and mixed fault matrices plus negative controls.

### Increment 7: conformance and consumer surface

- `@agentplat/mesh-conformance/planning`;
- public report validator and capability declarations;
- independent package consumer and small executable example;
- pnpm/npm, Node 20/22 and PostgreSQL durable profiles;
- documentation and operations runbook.

Gate: all 37 coordinated tarballs install without workspace links.

### Increment 8: normative campaign

- freeze registrations before execution;
- run the complete paired scale/fault campaign;
- write raw samples, traces, comparisons and summary manifest;
- verify statistics independently;
- record source, fixture, policy, environment, monitor and artifact digests.

Gate: all acceptance thresholds and exact replay pass.

### Increment 9: release

- audit public terminology and package contents;
- run full build, type, unit, adapter, conformance, compatibility and pack gates;
- compare public API and canonical/persistence fixtures with Beta 2;
- publish all 37 immutable packages under a staging tag;
- verify independent registry consumers;
- atomically promote `next`, remove staging tags and create annotated
  `v0.3.0-beta.3`;
- merge machine-readable release evidence without changing published code.

## Test strategy

### Unit and property tests

- every validator boundary and stable rejection code;
- same-ID idempotency and digest conflicts;
- graph acyclicity under arbitrary insertion/revision order;
- budget conservation for every transition prefix;
- deterministic selection and tie-breaks;
- terminal-state monotonicity;
- snapshot round-trip and stale-snapshot rejection.

### Component tests

- proposal-to-Work extension binding;
- capability negotiation and critical-extension rejection;
- real allocation and Work Contract derivation;
- plan supersession racing bid/award/accept/result;
- intent revision/revocation racing replanning and dispatch;
- evidence failure and indeterminate effect reconciliation.

### Scenario tests

- no peer initially observes enough information to solve the mission;
- peers form complementary fragments and roles;
- a capability disappears after planning and forces a new fragment/assignee;
- contradictory observation is challenged rather than amplified;
- a partition creates temporary plan divergence and heal converges healthy
  semantic-slot heads;
- stale executor returns after replanning and its effect is fenced;
- hidden-state/global-assignment/synthetic-ledger controls are detected.

### Compatibility tests

- every Beta 2 protocol fixture remains byte-identical;
- Beta 2 snapshots, rows, reports and packed consumers remain readable;
- V1 evaluation reports retain their historical validator behavior;
- Beta 2 direct Mesh and Collective Control paths remain unchanged;
- no existing required field, default or closed union changes;
- package dependency graph remains acyclic.

## Operations and rollout

Beta 3 is opt-in:

```text
planning.mode: off | shadow | enforce
planning.environment: caller-supplied
planning.decisionPolicy: caller-supplied
planning.fragmentRepository: memory | caller-supplied durable adapter
planning.metrics: digest | redacted | full
```

- `off` preserves Beta 2 behavior.
- `shadow` evaluates and records proposals but creates no Mesh Work.
- `enforce` allows accepted fragments to enter the governed Mesh path.

Rollout proceeds shadow, bounded canary, enforced canary and broader deployment.
Rollback stops new proposals, cancels or drains planning-owned Work, reconciles
indeterminate effects, verifies evidence anchors and returns to Beta 2 direct or
governed paths. Rollback never rewrites completed effects or converts planning
proposals into legacy grants.

## Release evidence

The final machine-readable ledger must bind:

- design, implementation, campaign and release commits;
- annotated tag object and dereferenced release commit;
- exact 37-package versions, integrities, timestamps and dist-tags;
- V1 compatibility and API-diff reports;
- V2 environment, monitor, registration, trace and statistics digests;
- conformance suite, fixtures and negative-control coverage;
- registry consumers and durable PostgreSQL profile;
- public audit, dependency audit and CI workflows;
- zero remaining staging tags and zero open acceptance items.
