# AgentPlat Agent Morphogenesis V1 implementation plan

Status: accepted implementation plan; future-baseline proposal.

Design authority:

- [ADR 0046](../adr/0046-agent-morphogenesis.md);
- [threat model](../security/agent-morphogenesis-threat-model.md); and
- [acceptance checklist](./agent-morphogenesis-v1-acceptance-checklist.md).

## Product outcome

AgentPlat can change the mission-scoped operational form of an agent
collective while work is in progress. A change begins with bounded evidence,
produces an exact advisory proposal, passes the decision route required by
policy, and is enacted only through the existing AgentPlat identity,
membership, role, Team, Work, action, Room and evidence boundaries.

AgentPlat Agent Morphogenesis is the governed, mission-driven evolution of an
agent collective's operational form through explicit successor epochs. It can
recruit, instantiate, specialize, reconfigure, suspend, detach and retire
agents or Teams while preserving bounded authority, causal continuity and
auditable evidence.

Morphogenesis is a coordination process. It does not grant membership, Work or
action authority and it does not make model output, a Room role, a capability
claim or a factory receipt authoritative.

## Baseline and compatibility position

- The capability is additive and opt-in under the proposed
  `@agentplat/collective-runtime/morphogenesis` subpath.
- Existing defaults and V1 public contracts remain unchanged.
- The frozen `agentplat-collective-capabilities-v1` denominator is not edited.
  A first-class morphogenesis runtime is classified as a
  `future-baseline-proposal` until an owner approves a new baseline.
- Existing implementation claims for governed creation, membership, Teams,
  topology, role evolution, mission lifecycle and evidence remain separate
  from the new composition claim.
- Source completion and conformance do not establish organizational fitness,
  improved mission outcomes or production-scale safety, liveness or cost.

## Implemented workflow dependency

The current AgentPlat checkout implements Governed Durable Workflows V1 in
`@agentplat/workflows`, with PostgreSQL, Agent Room, Temporal and conformance
adapters. Morphogenesis uses that implemented process boundary instead of
building another generic runner, stage machine, task journal, retry loop, gate,
cancellation engine or workflow durability adapter.

Ownership remains explicit:

- Governed Durable Workflows owns process definitions and runs, stage state,
  Task Runs, stable task idempotency, signals, gates, cancellation,
  compensation scheduling, usage and delayed outcome attribution;
- Morphogenesis owns morphology observations, needs, targets, proposals,
  exact decision bindings, the accepted morphology head and domain receipts;
- existing lifecycle, membership, Team, Work and action boundaries own their
  respective authorities and side effects;
- `@agentplat/workflows-postgres` owns durable process storage, while a narrow
  morphology-head adapter preserves one accepted successor through CAS; and
- `@agentplat/workflows-temporal` may wake bounded process advances but cannot
  reconstruct morphology state, decisions or authority from Temporal history.

The portable Morphogenesis subpath may depend on the browser-safe Workflow
root and outcomes entry points. It does not import PostgreSQL, Temporal, Rooms
or another adapter package; host/application composition supplies those
implementations through the existing ports.

A generic workflow gate outcome is scheduling and branch evidence, not the
exact Morphogenesis decision. After an approved gate, a bound verification
task resolves and persists the current `MorphogenesisDecisionBindingV1` before
any transformation effect can be prepared.

## Objectives

| ID | Objective | Completion evidence |
| --- | --- | --- |
| `AM-OBJ-01` | Represent the current and proposed mission morphology without creating a second source of truth. | A bounded snapshot references authenticated source revisions, epochs and digests; stale or incomplete required sources fail closed. |
| `AM-OBJ-02` | Turn an admissible mission need into an exact, inert organizational-change proposal. | Need, target, ordered operations, dependencies, estimates, decision class, expiry and compensation intent are versioned, validated and digest-bound. |
| `AM-OBJ-03` | Support policy-selected decisions by an authorized agent, a person, local policy, collective certification or an explicit combination. | Every accepted decision binds the exact proposal, scope, currentness coordinates, budget and validity window; actor identity alone grants no authority. |
| `AM-OBJ-04` | Enact approved changes only through existing authoritative AgentPlat boundaries. | Creation uses governed lineage and factory contracts; enrollment uses membership epochs; Team activation requires individual Work Contracts; protected effects retain their normal grants and fences. |
| `AM-OBJ-05` | Preserve useful work and authority continuity across successor morphologies. | Unaffected completed work and permitted artifacts survive; affected causal closure is rebound or invalidated explicitly; stale agents and coordinators cannot commit progress or effects. |
| `AM-OBJ-06` | Make every transition bounded, idempotent, crash-recoverable and conflict-safe. | Stable operation IDs, durable prepare/apply receipts, revision-and-digest CAS, logical-time high-water marks and compensation state survive restart at every external boundary. |
| `AM-OBJ-07` | Operate from bounded peer-local Agent Mesh views without a global registry or scheduler. | Discovery records its view, limits and freshness; absence means no eligible candidate was found inside that declared view, never global non-existence. |
| `AM-OBJ-08` | Make the proposed change, decision, progress and result visible without converting projections into authority. | Agent Room and Mesh projections are content-minimized, deterministic, authority-neutral and explicitly applied by their owning services. |
| `AM-OBJ-09` | Evaluate the transition while preserving the AgentPlat Evidence Boundary. | The resulting receipt records success, partial success, failure, indeterminate outcome or successor recovery against declared measures without claiming automatic real-world improvement. |

## Decision model

Policy selects one of the following decision routes for each exact proposal:

| Route | Intended use |
| --- | --- |
| `local_policy` | Low-risk transformations already admitted by an installed deterministic policy. |
| `authorized_agent` | An agent with a current, explicit decision mandate for the scope, operator set, risk and budget. |
| `authorized_person` | A person acting through an authenticated Agent Room or another application-owned decision surface. |
| `collective` | Evidence-backed or quorum-certified collective agreement. |
| `composite` | A policy-defined combination such as agent recommendation plus human confirmation or independent agent review. |

An authorized agent exercises previously delegated decision authority; it does
not create authority by making a decision. Agent membership, a descriptive
role, Trust, capability evidence or participation in the proposal is
insufficient by itself.

Policy can require proposer/decider separation and must be able to prohibit an
agent from approving its own creation, promotion, authority expansion,
retirement avoidance or descendant creation. High-risk routes can require
independent assessment, a person, collective certification or a combination.

Every accepted decision binds at least:

- tenant, mission and applicable Mesh, Room, Objective and Work scope;
- current morphology digest and epoch;
- exact proposal and target digests;
- relevant membership, policy, authority and Work currentness coordinates;
- allowed operation set and reserved resource envelope;
- issuer or certifier identity and implementation binding; and
- issue, expiry and replay-protection coordinates.

A decision remains coordination authority only. Each enacted operation still
passes the authoritative boundary that owns its side effect.

`@agentplat/autonomy` may later narrow whether an installed Morphogenesis
action is eligible for less supervision, but it cannot emit a
`MorphogenesisDecisionBindingV1`, select an approving actor or replace any
decision or effect authority.

## Repository-grounded reuse map

| Morphogenesis concern | Existing AgentPlat boundary | Treatment |
| --- | --- | --- |
| Parent/child lineage, quotas and attenuation | `@agentplat/collective-membership/agent-lineage` | Reuse `AgentLineageRecordV1`, creation policy, certificates and lineage store; do not add a parallel lineage. |
| Material creation and termination | `@agentplat/collective-membership/agent-factory` | Reuse `GovernedAgentFactoryPortV1` and its CAS/idempotency behavior; add only missing profile bindings or lifecycle capabilities through versioned extensions/adapters. |
| Create, enroll, eligibility and retire | `@agentplat/collective-membership/governed-agent-lifecycle` | Use as the closed lifecycle path for Mesh agents. |
| Role definition and attenuation | `@agentplat/inference-control/governed-role-evolution` and role realignment | Reference certified role definitions and authority ceilings; do not introduce a second role catalog. |
| Candidate eligibility | capability-state, Trust, Inference Control and authenticated Mesh discovery | Compose only authenticated, fresh, source-bound projections. |
| Existing-agent recruitment | Team Formation and individual Work Contracts | Reuse candidate, roster, activation and contract validation. |
| Replacement and causal continuity | Team Formation reconfiguration, Team Execution rebind and checkpoints | Preserve unaffected work and create explicit successor Team/execution epochs. |
| Split, merge and federation | Team Topology Transformation and Topology Governance | Treat as later morphological operators; do not reproduce topology protocols. |
| Mission containment | Governed Mission Lifecycle reconfiguration port | Invoke Morphogenesis as an opt-in reconfiguration sub-saga or adapter, subject to the versioning decision below. |
| Agent or collective decision | Collective Decision and application-owned agent decision issuers | Adapt exact proposal decisions; do not overload `team_structure` with a broader meaning. |
| Human decision | `@agentplat/workflows-rooms` and Agent Room approvals | Reuse the exact version-bound approval gate; do not introduce a second human approval aggregate. |
| Room and Mesh visibility | Agent Rooms and `@agentplat/rooms-mesh` | Add authority-neutral need, diff, status and receipt projections in the adapter layer. |
| Audit and replay | AgentPlat Audit and Collective Telemetry | Emit bounded lifecycle events and receipts with recursive redaction. |
| Durable process orchestration | `ProcessDefinitionV1`, `AdvancingProcessRunnerV1`, `TaskRunV1` and `WorkflowStoreV1` | Reuse implemented stages, tasks, gates, signals, retries, compensation and operation idempotency; do not add a Morphogenesis process runner. |
| Durable infrastructure | `@agentplat/workflows-postgres`, `@agentplat/workflows-temporal` and `@agentplat/workflows-conformance` | Reuse process persistence, worker/wakeup and conformance surfaces; add only morphology-specific state and integration cases. |
| Usage and delayed outcomes | Workflow task usage and `@agentplat/workflows/outcomes` | Reuse typed token, duration and currency-safe cost records plus exact delayed-outcome attribution; outcomes remain evidence rather than authority. |

## New domain surface

The first design increment should define only the contracts that do not already
exist under another canonical name:

- `MorphogenesisScopeV1`: exact tenant, mission and optional Room, Mesh,
  Objective and Work bindings;
- `MorphologySourceHeadV1`: source identity, revision, record digest,
  observation time, expiry and authentication evidence;
- `MorphologySnapshotV1`: bounded projection of the current form and its source
  heads, not an independently authoritative global snapshot;
- `MorphogenesisNeedV1`: bounded reason and evidence references;
- `TargetMorphologyV1`: intended successor positions, agents, lifecycle
  dispositions, topology intent and invariants;
- `MorphogenesisProposalV1`: exact current-to-target change, intent operators,
  compiled dependencies, estimates, decision class and validity;
- `AgentInstantiationProfileV1`: content-addressed composition of an existing
  certified role definition, runtime adapter requirements, instruction/tool/
  memory references, input/output contracts, budgets, scope and attestations;
- `MorphogenesisDecisionBindingV1`: normalized reference to the policy, agent,
  person, collective or composite decision that accepted the exact proposal;
- `MorphologyHeadV1` and `MorphologyHeadStoreV1`: the current accepted
  morphology epoch, predecessor, policy/currentness coordinates and a narrow
  revision-and-digest CAS boundary;
- `MorphogenesisProcessBindingV1`: exact binding of the process definition and
  run to the current morphology, proposal, target and domain policy digests;
- `MorphogenesisReceiptV1`: final currentness vector, applied operation
  receipts referenced by exact Workflow Task Run results, resulting morphology
  and evaluation disposition; and
- `MorphogenesisLineageLinkV1`: a composition record linking the proposal,
  instantiation profile and existing agent lineage without replacing
  `AgentLineageRecordV1`.

The name `AgentBlueprintV1` is intentionally avoided in this plan because
AgentPlat already exposes a dynamic role blueprint with a narrower meaning.
The final ADR must approve the instantiation-profile name and relationship.

## Operator model

Morphogenesis uses two closed, versioned layers:

1. **Intent operators** describe the organizational change requested by policy
   or a strategy: recruit, instantiate, realign, reassign, replace, split,
   merge, federate, detach, suspend or retire.
2. **Execution steps** compile that intent into the existing effect boundaries:
   resolve, reserve, provision, attest, enroll, project Room participation,
   form a successor Team, issue or rebind Work, fence, checkpoint, drain,
   retire membership and terminate material resources.

Compound intents such as `replace_agent` and `derive_agent` are never treated
as one opaque side effect. Their compiled step graph and compensation intent
are part of the proposal digest.

The compiler selects from a closed catalog of versioned
`ProcessDefinitionV1` records and binds the exact selected definition digest
into the proposal. The first release uses one fixed catalog-lifecycle
definition rather than registering one caller-generated DAG per proposal.
Pure coordination is represented by internal tasks; operations that cross a
protected external boundary use `protected_external` task definitions with an
exact action binding. Workflow task identity never replaces the certificate,
authorization, fence or stable operation ID required by the invoked AgentPlat
subsystem.

## Transition and commit semantics

`AdvancingProcessRunnerV1.advance()` processes a policy-bounded amount of
durable work. Callers provide scheduling and ephemeral credentials, never
inline authority, decisions, instantiation profiles or arbitrary observations.

The first versioned process definition has the following domain stages:

```text
observe -> assess -> propose -> decision_gate -> verify_decision -> prepare
        -> provision -> attest -> enroll -> activate -> await_outcome
        -> drain -> evaluate
```

The Workflow run owns generic `pending`, `running`, `waiting`, `canceling`,
`completed`, `failed` and `canceled` state. Morphogenesis interprets exact
stage outcomes and retained result references into domain dispositions such as
`denied`, `expired`, `compensation_required`, `indeterminate` or
`successor_recovery_required` in its final receipt.

The successor activation fence is the organizational commit point:

- before activation, failed work compensates toward the current morphology;
- activation requires the complete policy-declared readiness receipt set;
- activation advances the morphology epoch and invalidates stale predecessor
  authority through the owning Work, Team, role and membership boundaries;
- after activation, an unsafe result creates another explicit successor or
  recovery transition rather than pretending that distributed effects were
  atomically undone; and
- external resource termination occurs only after Work/action authority is
  fenced and required evidence is preserved.

One morphology epoch is an orchestration coordinate. It references but never
replaces membership, Team, execution, role, Work or authority epochs.

## First public capability

The first public release supports one complete mission-scoped vertical slice:

1. observe a `missing_capability` need from authenticated bounded sources;
2. search a bounded local Mesh view for eligible existing candidates;
3. recruit an eligible existing agent when policy prefers recruitment;
4. otherwise resolve a policy-approved catalog instantiation profile;
5. prepare an exact before/after morphology diff;
6. route the proposal through the policy-selected decision path, including an
   authorized-agent path and an authorized-person Room projection path;
7. invoke the existing governed create-and-enroll lifecycle when creation is
   required;
8. form and activate a successor Team through individual Work Contracts;
9. restore only permitted artifacts or checkpoints and continue the affected
   causal work;
10. drain the temporary specialist, fence its authority, retire membership and
    terminate its runtime when its lifecycle intent expires;
11. evaluate the declared need and emit the final receipt; and
12. reconcile a restart after factory success but before local acknowledgement
    without duplicate creation.

This release does not support derived specialization, model-assisted blueprint
synthesis, recursive creation, Team split/merge/federation or a learned
morphology strategy.

## Implementation sequence

### Increment 0: approve the design boundary

- add the Agent Morphogenesis ADR;
- add a threat model and first-release acceptance checklist;
- approve scope, observation-cut semantics, operator compilation, decision
  routes, commit point, budget units and exact Workflow process definition;
- record the future-baseline classification; and
- freeze public names only after the reuse map is reviewed against source.

No implementation code begins before this increment is accepted.

Exit achieved on 2026-08-29: ADR 0046 fixes the design boundary, the threat
model defines required controls and adversarial scenarios, and the unchecked
acceptance checklist separates planned behavior from implementation claims.

### Increment 1: content-free proposal engine

- implement scope, source heads, snapshot, need, target and proposal contracts;
- add canonical factories, exact validators and digest domains;
- implement bounded deterministic observation and proposal reduction;
- enforce population, resource, TTL, cooldown, hysteresis and churn limits;
- add an in-memory `MorphologyHeadStoreV1` while reusing the Workflow in-memory
  store and runner for process state; and
- test malformed, stale, oversized, replayed and cross-scope inputs.

No provisioning, membership or Work effects occur in this increment.

Exit achieved on 2026-08-29: the portable subpath exports strict scope, source
head, snapshot, need, target, proposal, catalog instantiation-profile, budget,
control-window and morphology-head contracts; registered digest domains,
deterministic validators, authenticated proposal engine, cooldown/hysteresis/
churn enforcement, an idempotent in-memory budget authority and a CAS-safe
in-memory morphology head are covered by focused and public-contract tests.
The host-layer adapter compiles a certified profile into the existing governed
agent-creation request without introducing a package cycle or second factory.

### Increment 2: decision routing

- implement the normalized decision binding and decision-resolution port;
- add local-policy, authorized-agent and Collective Decision adapters;
- adapt the authorized-person route through the existing Agent Room Workflow
  gate and compose the policy-selected gate provider;
- resolve the exact decision binding after gate approval rather than treating
  the gate outcome as decision authority;
- enforce exact digest/currentness binding and actor eligibility;
- test proposer/decider separation and prohibited self-interest cases; and
- keep every accepted decision inert until transition preparation succeeds.

Exit achieved on 2026-08-29: the subpath exports normalized candidate,
authorization and decision bindings for local-policy, authorized-agent,
authorized-person, collective and composite routes; exact replay storage,
currentness and independent-decider enforcement; a fixed catalog-lifecycle
Workflow definition, task definitions, execution bindings and post-gate
verification; an Agent Room approval adapter; and a Collective Agreement
application-certificate adapter. Focused tests cover agent approval,
self-approval rejection, human Room approval, collective certification,
unavailable gates and the complete in-memory Workflow decision path.

### Increment 3: recruitment and catalog creation

- adapt bounded Mesh discovery and current eligibility;
- prefer eligible existing agents according to policy;
- resolve and certify exact catalog instantiation profiles;
- adapt the existing governed agent lifecycle for create-and-enroll;
- attest runtime/profile compatibility; and
- form and activate the successor Team through existing Work authority;
- register the compiled process and exact task definitions with their handler,
  policy, runtime and protected-action bindings.

Exit achieved on 2026-08-29: bounded discovery records its declared view and
fails closed when incomplete; current eligible agents are preferred; catalog
creation requires an approved decision, active budget reservation and current
certified profile; create-and-enroll is journaled before effect and reconciles
the original operation after acknowledgement loss; the nominal governed agent
lifecycle adapter advances membership; and the Team Formation adapter forms
the actual roster before resolving exact individual Work Contracts. The fixed
Workflow DAG drives the portable execution saga through provision, attest,
enrollment verification and Team activation.

### Increment 4: continuity, drain and recovery

- rebind execution and preserve unaffected causal work;
- stop new assignment before drain;
- revoke or expire Work/action authority before lifecycle retirement;
- reuse Workflow cancellation and reverse-order compensation while retaining
  subsystem-specific compensation receipts;
- reconcile `TaskRunV1` indeterminate effects through the original subsystem
  operation ID and receipt lookup;
- test restart at every external boundary; and
- prove exact retries do not duplicate create, enroll, activate, retire or
  terminate effects.

Exit achieved on 2026-08-29: Team activation retains an execution-state digest,
preserved artifacts and invalidated causal closure; morphology-head activation
is a separate idempotent commit; post-outcome checkpoint, Work/Action fencing,
detach or governed retirement, budget release and evaluation each have stable
prepared/applied operations and receipts; post-commit compensation fails closed
into successor recovery instead of undoing committed effects; and a fresh
runtime instance reconciles acknowledgement loss after create, attest, Team
activation, checkpoint, fence, retirement and budget release without replaying
the confirmed effect. The host supplies concrete Team Execution continuity,
Work/Action fence, Action Gateway and governed lifecycle adapters.

### Increment 5: projections, durable adapter and reference example

- project need, diff, decision status, transition progress and receipt into an
  Agent Room without changing Room authority;
- add the repository-appropriate PostgreSQL adapter and rollback anchor for
  `MorphologyHeadStoreV1`, while reusing `@agentplat/workflows-postgres` for
  process state;
- run Morphogenesis composition cases against the Workflow in-memory,
  PostgreSQL and Temporal surfaces and their conformance semantics;
- emit signed or authenticated content-free telemetry through existing sinks;
- add the database-forensics reference scenario with both agent and person
  decision variants; and
- complete public types, exports, package catalog, packed consumer and release
  verification.

Exit achieved on 2026-08-29: PostgreSQL morphology-head and execution stores
reuse Collective Host state with exact CAS, read validation and an external
rollback witness; Workflow process state remains in Workflows PostgreSQL and
Temporal remains wakeup-only; Agent Room artifacts/messages/participation and
authenticated sparse Agent Mesh need projections remain authority-neutral;
signed content-free telemetry replays the durable execution event chain; delayed
outcomes bind exact Task Runs and missing coverage remains indeterminate; the
reference example covers recruit/create, agent/person decisions and crash
reconciliation; public contracts, documentation and future-baseline
specification are published; and workspace build, type-check, unit/adapters,
audit, baseline, release, public-consumer and pack-smoke gates pass.

### Later increments

- derived specialization with attenuated lineage;
- independently certified model-assisted instantiation-profile synthesis;
- replacement strategies beyond missing capability;
- split, merge and federation composition;
- bounded strategy adaptation from measured outcomes; and
- reproducible empirical evaluation kept outside source completion.

## Minimum acceptance conditions

### Functional

- the same current morphology and evidence produce the same proposal digest;
- an eligible existing agent is recruited when creation is disallowed;
- catalog creation occurs only after bounded discovery and an exact accepted
  decision;
- successor Team activation retains unaffected Work bindings;
- a temporary created agent can be drained and retired safely; and
- the Room exposes proposal, decision, progress and result without completing
  tasks or approving artifacts implicitly.

### Decision and authority

- a person is not required when policy admits an authorized agent, local policy
  or collective route;
- an agent decision without a current explicit decision mandate is rejected;
- membership, Trust, role or capability alone cannot approve a proposal;
- prohibited self-approval and proposal/decision conflicts fail closed;
- a Workflow gate outcome without a current exact decision binding cannot
  prepare or enact a transformation;
- stale morphology, membership, policy, authority, Work or decision bindings
  fail closed; and
- factory, membership, Team and morphology receipts cannot substitute for
  individual Work or action authority.

### Safety and continuity

- authority attenuation, population, descendants, budget, TTL and churn limits
  are enforced before effects;
- one current morphology epoch accepts at most one successor;
- stale agents and coordinators cannot commit progress or protected effects;
- authority fencing and evidence preservation precede resource termination;
- partitions cannot produce conflicting accepted successor morphologies; and
- control state excludes credentials, hidden reasoning, raw prompts and raw
  model output.

### Idempotency and recovery

- exact retries reuse stable operation IDs and retained receipts;
- Workflow operation, Task Run and subsystem operation identities remain
  deterministically related but semantically distinct;
- changed input under an existing operation ID conflicts;
- factory success followed by local timeout reconciles without duplicate
  creation;
- prepared and applied effects recover without guessing whether an effect ran;
- CAS races retain one accepted successor; and
- post-commit recovery creates an explicit successor transition instead of an
  unsupported atomic rollback claim.

### Evidence boundary

- tests and examples state exactly which behavior is implemented or simulated;
- no source or conformance result is described as proof of organizational
  improvement, global optimality or production readiness; and
- any outcome comparison declares its measures, window, coverage and missing
  data.

## Decisions fixed for implementation

ADR 0046 fixes the previous planning questions as follows:

1. Use `AgentInstantiationProfileV1` and compile it into the existing role and
   agent-creation boundaries.
2. Use a dedicated normalized Morphogenesis decision port with adapters to
   existing certification engines; do not change or overload V1 decision
   kinds.
3. Admit explicit starts and a first-release `request_team_adaptation` adapter;
   broader direct Mission Lifecycle actions require a future version.
4. Use a bounded non-atomic observation cut with authenticated source heads,
   policy-required freshness and use-time currentness checks.
5. Add one application-owned typed budget reservation port; downstream
   subsystem budgets continue to recheck independently.
6. Add a narrow materialization inspection/suspension port without replacing
   `GovernedAgentFactoryPortV1`.
7. Use the fixed
   `agentplat.morphogenesis.catalog-lifecycle.v1` Workflow definition, exact
   task effect classes, compensation graph and post-gate decision verification.
8. Put `PostgresMorphologyHeadStoreV1` in
   `@agentplat/collective-host-postgres` and update platform boundaries as
   required.

## Planned documentation and verification surfaces

- `docs/adr/0046-agent-morphogenesis.md`;
- `docs/security/agent-morphogenesis-threat-model.md`;
- `docs/collective-runtime/agent-morphogenesis-v1-acceptance-checklist.md`;
- `examples/agent-morphogenesis`;
- package exports and public type tests;
- `MorphologyHeadStoreV1` memory/durable conformance plus Workflow composition
  against memory, PostgreSQL and Temporal runners;
- Room projection and lifecycle integration tests;
- crash, partition and adversarial scenario fixtures;
- platform-boundary, README, architecture, AI context and changelog updates; and
- a future-baseline proposal manifest or recorded owner decision.
