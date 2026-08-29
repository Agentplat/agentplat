# AgentPlat Agent Morphogenesis V1 implementation plan

Status: future-baseline proposal; planning only.

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
| Human decision and visibility | Agent Rooms and `@agentplat/rooms-mesh` | Add authority-neutral request, decision, status, diff and receipt projections in the adapter layer. |
| Audit and replay | AgentPlat Audit and Collective Telemetry | Emit bounded lifecycle events and receipts with recursive redaction. |
| Durable scheduling | Governed mission state and the proposed Governed Durable Workflows design | Morphogenesis owns domain state; a generic runner may wake bounded `advance()` calls but cannot become the morphology source of truth. |

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
- `MorphogenesisTransitionStateV1`: durable revisioned saga state, operation
  journal, receipts, fences and compensation disposition;
- `MorphogenesisReceiptV1`: final currentness vector, applied operation
  receipts, resulting morphology and evaluation disposition; and
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

## Transition and commit semantics

`advance()` processes a policy-bounded amount of durable work. Callers provide
scheduling and ephemeral credentials, never inline authority, decisions,
blueprints or arbitrary observations.

The planned transition states are:

```text
observing -> assessed -> proposed -> awaiting_decision -> prepared
          -> provisioning -> attesting -> enrolling -> activating
          -> draining -> evaluating -> completed
```

Terminal or recovery dispositions include `denied`, `expired`, `cancelled`,
`failed`, `compensation_required` and `indeterminate`.

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
  routes, commit point, budget units and workflow relationship;
- record the future-baseline classification; and
- freeze public names only after the reuse map is reviewed against source.

No implementation code begins before this increment is accepted.

### Increment 1: content-free proposal engine

- implement scope, source heads, snapshot, need, target and proposal contracts;
- add canonical factories, exact validators and digest domains;
- implement bounded deterministic observation and proposal reduction;
- enforce population, resource, TTL, cooldown, hysteresis and churn limits;
- add an in-memory revision-and-digest CAS store; and
- test malformed, stale, oversized, replayed and cross-scope inputs.

No provisioning, membership or Work effects occur in this increment.

### Increment 2: decision routing

- implement the normalized decision binding and decision-resolution port;
- add local-policy, authorized-agent and Collective Decision adapters;
- add authority-neutral Agent Room decision projections;
- enforce exact digest/currentness binding and actor eligibility;
- test proposer/decider separation and prohibited self-interest cases; and
- keep every accepted decision inert until transition preparation succeeds.

### Increment 3: recruitment and catalog creation

- adapt bounded Mesh discovery and current eligibility;
- prefer eligible existing agents according to policy;
- resolve and certify exact catalog instantiation profiles;
- adapt the existing governed agent lifecycle for create-and-enroll;
- attest runtime/profile compatibility; and
- form and activate the successor Team through existing Work authority.

### Increment 4: continuity, drain and recovery

- rebind execution and preserve unaffected causal work;
- stop new assignment before drain;
- revoke or expire Work/action authority before lifecycle retirement;
- add compensation and indeterminate-effect reconciliation;
- test restart at every external boundary; and
- prove exact retries do not duplicate create, enroll, activate, retire or
  terminate effects.

### Increment 5: projections, durable adapter and reference example

- project need, diff, decision status, transition progress and receipt into an
  Agent Room without changing Room authority;
- add the repository-appropriate PostgreSQL state adapter and rollback anchor;
- emit signed or authenticated content-free telemetry through existing sinks;
- add the database-forensics reference scenario with both agent and person
  decision variants; and
- complete public types, exports, package catalog, packed consumer and release
  verification.

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

## Required planning decisions before code

1. Approve `AgentInstantiationProfileV1` or another non-conflicting canonical
   name and its binding to the existing role and agent-creation contracts.
2. Decide whether Morphogenesis uses a new versioned Collective Decision kind
   or a dedicated decision plane adapted to existing certification engines.
3. Decide how Governed Mission Lifecycle invokes the sub-saga without changing
   V1 action semantics silently.
4. Define the non-atomic observation-cut and required-source freshness rules.
5. Define typed budget units and the reservation owner across mission, Team and
   agent creation boundaries.
6. Define suspension and readiness inspection as versioned lifecycle
   capabilities without replacing the current factory port.
7. Confirm that a future generic Process Runner is scheduling infrastructure
   only and cannot become the morphology or authority source of truth.

## Planned documentation and verification surfaces

- `docs/adr/0046-agent-morphogenesis.md`;
- `docs/security/agent-morphogenesis-threat-model.md`;
- `docs/collective-runtime/agent-morphogenesis-v1-acceptance-checklist.md`;
- `examples/agent-morphogenesis`;
- package exports and public type tests;
- in-memory and durable store conformance;
- Room projection and lifecycle integration tests;
- crash, partition and adversarial scenario fixtures;
- README, architecture, AI context and changelog updates; and
- a future-baseline proposal manifest or recorded owner decision.
