# ADR 0046: Agent Morphogenesis composes governed organizational change

- Status: Accepted
- Date: 2026-08-29

## Context

AgentPlat already provides governed agent creation and retirement, certified
membership epochs, role evolution, candidate eligibility, Team Formation,
individual Work Contracts, causal Team Execution recovery, topology
transformation, Collective Decisions, Agent Room approvals, content-free audit
and Governed Durable Workflows.

Those capabilities can each change one part of a collective, but AgentPlat has
no first-class mission-scoped control process that represents the current and
desired operational form, explains why it should change, obtains the required
decision, coordinates the existing authoritative boundaries in a safe order
and records one resulting organizational epoch.

The missing capability must not introduce a second lineage, factory,
membership protocol, Team authority, Work authority, decision aggregate,
workflow runner or global scheduler. It must also support decisions made under
policy by an authorized agent, an authorized person, local policy, a
collective certificate or an explicit combination.

## Decision

### 1. Capability and package position

Add AgentPlat Agent Morphogenesis as an opt-in provider-neutral subpath:

```text
@agentplat/collective-runtime/morphogenesis
```

The subpath owns morphology domain contracts, deterministic validation and
digests, the proposal engine, the current morphology head, decision bindings,
Workflow composition and domain receipts. Existing AgentPlat subsystem ports
remain the only authority and side-effect boundaries.

The capability is a `future-baseline-proposal`. It does not alter the frozen
`agentplat-collective-capabilities-v1` denominator or existing defaults.

### 2. Morphology is a bounded projection and successor head

`MorphologySnapshotV1` is not a globally atomic snapshot or a second source of
truth. It is a content-minimized projection over a policy-declared set of
authenticated `MorphologySourceHeadV1` records. Each source head binds:

- source identity, version and implementation digest;
- source revision and exact record digest;
- observed logical time and exclusive expiry;
- scope and authentication evidence digest; and
- whether policy marks the source required for the proposed operator set.

Policy defines required source classes, freshness windows and maximum retained
heads. Missing, stale, rolled-back, equivocating or cross-scope required
sources fail closed. The snapshot records no global-absence claim; candidate
absence means only that no eligible candidate was found in the declared
bounded view.

`MorphologyHeadV1` is the narrow authoritative state owned by Morphogenesis. It
binds one accepted morphology epoch, its predecessor, policy, currentness
vector, resulting snapshot digest and final receipt. Its store uses revision
and digest CAS, logical-time monotonicity and an external rollback-resistant
head in durable deployments. Membership, Team, execution, role, Work and
authority epochs remain authoritative in their own systems.

### 3. Use an instantiation profile, not a second role blueprint

The creation specification is named `AgentInstantiationProfileV1`.

It is a content-addressed composition of existing artifacts and constraints:

- certified governed role definition digest;
- runtime and portable-adapter requirements;
- instruction, tool-set and memory-scope artifact references;
- input/output contract references;
- model constraints and implementation binding;
- resource, interaction, action, token, time and cost ceilings;
- tenant, mission and optional Room/Objective/Work scope;
- required assessors and runtime attestations; and
- expiry, provenance and author identity.

The profile is not a role definition, identity, membership, capability proof
or authority grant. It is compiled into the existing `AgentCreationRequestV1`
and certification path. `AgentLineageRecordV1` remains the authoritative agent
lineage. A `MorphogenesisLineageLinkV1` only links the accepted proposal and
profile to that existing lineage and receipts.

### 4. Keep one factory and add narrow material controls

Morphogenesis reuses `GovernedAgentFactoryPortV1` and
`GovernedAgentLifecycleRuntimeV1` for create, enroll and retire. It does not
add the parallel factory proposed by the original concept brief.

Readiness inspection and suspension are separate, application-owned material
controls behind `AgentMaterializationControlPortV1`. They accept stable
operation IDs and return content-addressed receipts. Inspection and suspension
do not create lineage, membership, Work or action authority. Termination
continues through the governed lifecycle/factory path.

### 5. Decisions use a dedicated normalized boundary

Add `MorphogenesisDecisionPortV1` and
`MorphogenesisDecisionBindingV1`. The port resolves and verifies an exact
decision through one policy-selected route:

- `local_policy`;
- `authorized_agent`;
- `authorized_person`;
- `collective`; or
- `composite`.

Adapters may reuse Agent Room approvals, Collective Decision certification or
an application-owned authorized-agent issuer. V1 does not add a
`morphogenesis` kind to `CollectiveDecisionKindV1` and does not overload
`team_structure` with a broader meaning.

An authorized agent must have a current explicit decision mandate bound to the
scope, operator set, risk and budget. Membership, role, Trust, capability or
proposal authorship alone is insufficient. Policy can require independent
assessment and proposer/decider separation, and can prohibit an agent from
approving its own creation, promotion, authority expansion, retirement
avoidance or descendant creation.

Every binding names the exact current morphology, proposal, target, policy,
budget, relevant subsystem epochs, actor/certifier, issue time and expiry. It
remains coordination authority only.

### 6. Governed Durable Workflows owns the process run

Morphogenesis depends only on the browser-safe `@agentplat/workflows` root and
outcomes entry point. It uses the implemented `ProcessDefinitionV1`,
`AdvancingProcessRunnerV1`, `TaskRunV1`, gates, signals, cancellation,
compensation, usage and delayed outcome contracts instead of building another
runner or generic transition store.

The first release selects one fixed definition from a closed catalog:

```text
agentplat.morphogenesis.catalog-lifecycle.v1

observe -> assess -> propose -> decision_gate -> verify_decision -> prepare
        -> provision -> attest -> enroll -> activate -> await_outcome
        -> drain -> evaluate
```

The exact definition digest is part of `MorphogenesisProposalV1` and
`MorphogenesisProcessBindingV1`. A proposal cannot register arbitrary Workflow
code or a caller-generated DAG.

The decision gate routes through a construction-bound composite provider. The
authorized-person route delegates to `@agentplat/workflows-rooms`; agent,
local-policy, collective and composite routes use their exact decision
adapters. A generic `approved` gate outcome only selects a Workflow branch. A
following `verify_decision` task must resolve and persist the current exact
`MorphogenesisDecisionBindingV1` before `prepare` can succeed.

Internal tasks may perform only declared pure or coordination work. A task that
crosses a protected external boundary is `protected_external` and has an exact
Action Gateway binding. Workflow task identity remains distinct from the
stable operation ID, certificate, authorization and fence required by the
invoked subsystem.

`@agentplat/workflows-postgres` owns durable process state and
`@agentplat/workflows-temporal` may provide wakeups, retries and history
rollover. Neither owns the morphology head or reconstructs authority.

### 7. Mission Lifecycle integration remains backward compatible

The first release can start in either of two explicit ways:

1. an application-owned issuer starts the exact Morphogenesis process after an
   admissible need is recorded; or
2. a `MorphogenesisMissionReconfigurationAdapterV1` handles the existing
   `request_team_adaptation` action when the proposed change is limited to the
   first-release missing-capability Team composition path.

The adapter returns only a result digest to Governed Mission Lifecycle. It
cannot reinterpret other V1 reconfiguration actions. General creation,
retirement, split, merge, federation or cross-Team organizational evolution is
not silently encoded as `request_team_adaptation`; a future versioned Mission
Lifecycle contract is required if those operations become direct lifecycle
actions.

### 8. Operators compile to existing bounded steps

Morphogenesis distinguishes organizational intent operators from execution
steps. `replace_agent` and `derive_agent` are compound intents, not opaque
effects. The accepted proposal binds an ordered dependency graph over existing
boundaries such as resolve, reserve, provision, attest, enroll, form successor
Team, bind Work, checkpoint, fence, drain, retire membership and terminate.

The first release admits only:

- `recruit_existing`;
- `instantiate_agent` from an approved catalog profile;
- the Team/Work operations required to activate the successor;
- `detach_agent` after Work fencing; and
- `retire_agent` for the created temporary specialist.

Derived/synthesized profiles, recursive spawning, role synthesis and Team
split/merge/federation remain later capabilities.

### 9. Activation is the organizational commit point

Before successor activation, failures compensate toward the current
morphology through Workflow cancellation and reverse-order compensation plus
the owning subsystem receipts. Activation requires the complete
policy-declared readiness set and CAS acceptance of the successor morphology
head.

Activation advances the morphology epoch and invalidates predecessor authority
through the owning Team, Work, role and membership boundaries. External
resource termination occurs only after Work/action authority is fenced and
required evidence is preserved.

After activation, committed distributed effects are not described as atomically
rolled back. Failure produces an explicit successor recovery transition. A
possibly committed external effect remains `indeterminate` until reconciled by
its original stable operation ID.

### 10. Budgets are reserved once and rechecked everywhere

Add a `MorphogenesisBudgetReservationPortV1` for an application-owned,
tenant-scoped budget authority. One accepted proposal reserves a typed maximum
envelope before material effects. The envelope distinguishes:

- population and concurrently provisioned agents;
- descendants and derivation depth;
- resource, interaction and action units;
- input, output and total tokens;
- duration; and
- currency-specific cost micros.

Reservations are proposal-, morphology-epoch-, operation- and expiry-bound,
idempotent and CAS-safe. They prevent concurrent Morphogenesis proposals from
double-spending the same configured envelope but never widen or replace the
budgets enforced again by agent creation, Team Formation, Work Contracts,
Inference Control or action gateways. Workflow `TaskUsageV1` records observed
usage; it is not the reservation authority.

### 11. Durable morphology state uses the collective host adapter

The in-memory implementation lives with the portable Morphogenesis subpath.
`PostgresMorphologyHeadStoreV1` is added to
`@agentplat/collective-host-postgres`, which already owns durable collective
host runtime state. That adapter receives a direct declared dependency on
`@agentplat/collective-runtime` and follows the platform adapter admission and
package-boundary rules. No new top-level Morphogenesis PostgreSQL package is
introduced for V1.

Agent Room approval continues through `@agentplat/workflows-rooms`. Morphology
need, before/after diff, progress and final receipt projections remain
authority-neutral adapters in the Room/Mesh integration layer.

## Consequences

- Agent Morphogenesis becomes a mission-scoped organization control plane, not
  an authority source or global scheduler.
- Existing creation, membership, Team, Work, role, effect and Workflow APIs
  remain source compatible and opt-in.
- The new portable package work is limited to morphology domain contracts,
  reduction, policies, adapters to existing ports and one narrow CAS head.
- Workflow conformance can be reused for process behavior, while morphology
  conformance remains responsible for domain currentness, decision and commit
  invariants.
- Human participation is policy-selectable rather than mandatory. Authorized
  agent decisions remain bounded, independently verifiable and auditable.
- Production deployments still own identity, key custody, authenticated
  decision issuers, monotonic rollback witnesses, provider credentials,
  external effect sinks and operational policy.
- Passing source, unit, conformance or reference-example tests demonstrates
  behavior only. It does not prove organizational improvement, global
  optimality, production readiness or exactly-once external effects.

## Alternatives considered

### Add a top-level Morphogenesis package

Rejected for V1. The capability is a Collective Runtime reconfiguration
composition and does not yet require independent versioning or dependency
ownership.

### Add another Morphogenesis runner and durable saga store

Rejected. Governed Durable Workflows already supplies the generic DAG, gate,
task, retry, cancellation, compensation and durable runner semantics.

### Require a person for every transformation

Rejected. Policy may require a person, but an explicitly authorized agent,
local policy, collective certificate or composite route can decide within its
installed limits.

### Treat Workflow gate approval as Morphogenesis authority

Rejected. A gate is process scheduling state. The exact current decision must
be resolved independently before effects.

### Build a globally atomic morphology snapshot

Rejected. Agent Mesh is sparse and the source systems have independent epochs.
A bounded authenticated observation cut plus use-time currentness checks
preserves the distributed architecture.

### Extend or replace the governed agent factory

Rejected. The existing factory owns creation and termination semantics.
Readiness and suspension are narrow material-control ports.

### Overload current Mission Lifecycle or Collective Decision enums

Rejected. Reusing a narrower V1 enum value for broader Morphogenesis semantics
would silently change compatibility. Explicit adapters or future versioned
contracts are required.
