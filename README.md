<p align="center">
  <a href="https://agentplat.com">
    <img src="https://agentplat.com/assets/agentplat-logo.png" alt="AgentPlat" width="76" height="76">
  </a>
</p>

<h1 align="center">AgentPlat</h1>

<p align="center">
  <strong>Open-core runtime primitives for building governed agentic platforms.</strong>
</p>

<p align="center">
  <a href="https://agentplat.com">Website</a>
  ·
  <a href="https://doc.agentplat.com">Documentation</a>
  ·
  <a href="https://github.com/Agentplat/agentplat">GitHub</a>
  ·
  <a href="https://agentplat.com/#contact">Contact</a>
</p>

> Developer preview: Agent Rooms, Agent Mesh, inference-control, and Evidence
> and Trust boundaries are usable, but APIs may still change before the first
> stable release.

> **Technical architecture designed by [Grishen](https://grishen.com/).**
> AgentPlat's Agent Rooms concept originated in the paper [*Agent Rooms: A
> Conceptual Framework for Persistent Human-Governed Multi-Agent
> Collaboration*](https://doi.org/10.5281/zenodo.20564834) by Douglas Rodriguez.

AgentPlat is a downloadable framework for building self-hosted agentic platforms around **Agent Rooms**: durable workspaces where humans and agents coordinate through messages, tasks, versioned artifacts, approvals, policies and scoped memory.

Clone this repository to run the complete reference API with Node.js and PostgreSQL, or install only the packages you need. Storage, model runtimes, event delivery, tools and authentication are public extension boundaries, so a company can keep the Room domain while replacing the surrounding infrastructure.

## Architecture at a glance

```text
Agent Rooms → Collective Runtime → Agent Mesh → Safety and Evidence → Adapters
human-agent    planning, teams,     peers,       policy, authority,     models,
collaboration  recovery, continuity  sync, quorum  fencing, audit, trust  tools, PostgreSQL
```

Agent Rooms are persistent, tenant-scoped workspaces for humans and agents. The
Collective Runtime coordinates missions and recovery. Agent Mesh provides
authenticated peer coordination, causal synchronization, governed membership,
quorum and sparse views. Safety and evidence boundaries keep authority explicit
and outcomes inspectable.

See the [Agent Rooms implementation guide](https://doc.agentplat.com/agent-rooms),
the [Agent Mesh documentation](https://doc.agentplat.com/agent-mesh), and the
[Agent Rooms origin paper](https://zenodo.org/records/20564834).

The decentralized collective stack now has an explicit
[19-capability development matrix](./docs/collective-runtime/development-capability-matrix-v1.md)
covering sparse peer operation, distributed planning and agreement,
adversarial recovery, inference-time control, heterogeneous adapters,
anytime-valid semantic guarantees, governed agent creation, interoperability,
content-free telemetry and executable pre-effect invariants. The matrix keeps
source completion separate from empirical scale and performance evidence.
The accompanying
[formal control model](./docs/collective-runtime/decentralized-control-model-v1.md)
states the assumptions and falsifiable hypotheses, while the
[empirical validation protocol](./docs/collective-runtime/empirical-validation-protocol-v1.md)
turns those hypotheses into a preregistered, paper-oriented study design with
an explicit no-spend local pilot path. The accompanying
[research package](./docs/research/README.md) preserves the manuscript outline,
data dictionary and pre-results decision ledger. The
[transition plan](./docs/transition/decentralized-collective-transition-plan-v1.md)
packages deployment adapters, evaluation, cost, risk, rights and adoption as
separate gated work rather than implied properties of the source tree.
The corresponding
[frozen capability baseline](./docs/collective-runtime/capability-baseline-governance-v1.md)
fixes the V1 denominator at 11 objectives and 19 capabilities. Findings must be
classified as defects, evidence, operationalization or a future-baseline
proposal; they cannot silently expand V1.

Release owners can bind all 19 capabilities to one clean commit with the
[source capability attestation runbook](./docs/collective-runtime/source-attestation-runbook-v1.md).
The resulting Ed25519 bundle is separate from the immutable baseline and never
claims empirical validation or execution authority.

### Long-Horizon Context Integrity V1

The opt-in Context Integrity controller evaluates the complete context set,
tracks bounded content-free risk across long sessions and physically withholds
hostile, stale or contradictory items before a provider or heterogeneous agent
adapter is invoked. Partial context can continue only through an exact
policy-allowed filtering implementation; otherwise the operation fails closed.

```js
import { ContextIntegrityRuntimeV1 } from "@agentplat/inference-control/context-integrity";
import { createContextIntegrityControlledModelGateV1 } from "@agentplat/inference-control/context-integrity/model";
```

State survives restart and explicit handoff without storing prompts, outputs or
hidden reasoning. See the [implementation plan](./docs/inference-control/long-horizon-context-integrity-v1-implementation-plan.md),
[architecture decision](./docs/adr/0020-long-horizon-context-integrity.md) and
[threat model](./docs/security/long-horizon-context-integrity-threat-model.md).

### Continuous Role Alignment V1

The opt-in role-alignment controller extends Inference Control across long
portable-agent sessions. It accumulates bounded coherence, uncertainty and
context-consistency signals; applies recovery hysteresis; and can reinforce,
challenge, pause, request a successor role or deny before protected actions are
released. Checkpoint handoffs preserve the content-free control history instead
of resetting it.

```js
import { createRoleAlignmentPortableAgentControlV1 } from "@agentplat/inference-control/role-alignment/portable-agent";
```

See the [implementation plan](./docs/inference-control/continuous-role-alignment-v1-implementation-plan.md),
[acceptance checklist](./docs/inference-control/continuous-role-alignment-v1-acceptance-checklist.md),
[architecture decision](./docs/adr/0015-continuous-role-alignment.md) and
[threat model](./docs/security/continuous-role-alignment-threat-model.md).

### Adaptive Role Realignment V1

The opt-in realignment controller closes a `realignment_required` state by
discovering content-free trusted-catalog candidates, filtering proposers and
evaluators through Trust, selecting deterministically, certifying the exact
digest and installing one successor role revision in Portable Agent Runtime.
Candidates can narrow the current authority ceiling but cannot widen it.

```js
import { createRoleRealignmentPortableAgentV1 } from "@agentplat/inference-control/role-realignment/portable-agent";
```

The optional Collective Agreement adapter binds certification to the current
membership epoch and Byzantine quorum. See the [integration
guide](./docs/inference-control/adaptive-role-realignment-v1.md), [architecture
decision](./docs/adr/0016-adaptive-role-realignment.md) and [threat
model](./docs/security/adaptive-role-realignment-threat-model.md).

### Collective Trust Consensus V1

The opt-in trust-consensus adapter turns one content-free, policy-bound Trust
projection into a Byzantine-certified collective decision. Each validator
resolves the exact candidate locally before voting; the certificate binds the
subject, scope, profile, evidence-set digest, predecessor, validity window,
membership epoch and precommit witnesses.

```js
import {
  createCollectiveTrustCertificationPortV1,
  createCollectiveTrustEligibilityFilterV1,
} from "@agentplat/collective-quorum/trust-consensus";
```

Collective trust can only narrow an existing local decision. It does not create
a global reputation score, establish universal truth or grant execution
authority. See the [implementation
plan](./docs/trust/collective-trust-consensus-v1-implementation-plan.md),
[acceptance
checklist](./docs/trust/collective-trust-consensus-v1-acceptance-checklist.md),
[architecture decision](./docs/adr/0018-collective-trust-consensus.md) and
[threat model](./docs/security/collective-trust-consensus-threat-model.md).

### Sparse Collective Scale V2

The opt-in `@agentplat/mesh/overlay` runtime derives bounded active and reserve
peer views without allocating a global membership or edge list. It propagates
digest-only update references with deterministic fanout, hop, deduplication
and outbound-interaction limits. Closed profiles cover 500, 5,000 and 100,000
peers, while the existing Mesh wire and V1 coordination surfaces remain
unchanged.

```js
import {
  createMeshSparsePeerViewV2,
  createMeshSparseRoutingStateV2,
  meshSparseOverlayProfileV2,
} from "@agentplat/mesh/overlay";
```

See the [capability and integration
contract](./docs/agent-mesh/sparse-collective-scale-v2.md).

### Distributed Collective Runtime and Interoperability

The open-core includes an authenticated causal message protocol, distributed
planning and allocation, live sparse agreement, bounded partial-view committee
formation, assurance-coupled effects, autonomous mission adaptation, concrete
local inference adapters and an interoperability SDK for remote agents and
simulation environments.

```js
import { DistributedCollectiveProtocolRuntimeV1 } from "@agentplat/collective-host/distributed-protocol";
import { DistributedPlanningRuntimeV1 } from "@agentplat/collective-host/distributed-planning";
import { AssuranceCoupledExecutionRuntimeV1 } from "@agentplat/collective-host/assurance-coupled-execution";
import { AutonomousAdaptationRuntimeV1 } from "@agentplat/collective-host/autonomous-adaptation";
import { SparseAgreementRoundRuntimeV1 } from "@agentplat/collective-quorum/sparse-agreement-runtime";
import { PartialViewAgreementRuntimeV1 } from "@agentplat/collective-quorum/partial-view-agreement";
import { LocalChatCompletionsInferencePortV1 } from "@agentplat/inference-control/cognitive-adapters";
import { InteropClientV1 } from "@agentplat/interop";
```

PostgreSQL adapters preserve protocol, agreement, host and adaptation state;
WebCrypto adapters provide Ed25519 authenticity and certificate verification.
These are source/API capabilities. Deployment-specific safety, liveness and
performance still depend on the configured topology, membership, key custody,
storage, transports, models and effect sinks.

### Capability-State Fusion V1

The opt-in `@agentplat/collective-runtime/capability-state` boundary combines
content-free local Trust, role, capacity, sparse reachability and recovery
signals into one policy-bound candidate disposition. Its reducer preserves
logical-time and source-revision high-water marks, while the productive peer
node can use the result to narrow offers, bids, awards, acceptance, execution
and recovery without introducing a global scheduler.

```js
import {
  CapabilityStateFusionRuntimeV1,
  createCapabilityStatePolicyV1,
} from "@agentplat/collective-runtime/capability-state";
```

See the [implementation
plan](./docs/capability-state/capability-state-fusion-v1-implementation-plan.md),
[architecture decision](./docs/adr/0019-capability-state-fusion.md) and
[threat model](./docs/security/capability-state-fusion-threat-model.md).

### Bounded Local Strategy Adaptation V1

The opt-in `@agentplat/collective-runtime/strategy-adaptation` controller
learns which pre-registered local coordination strategy to use from causal,
source-bound outcome cohorts. Exploration, reward influence, state growth and
unsafe-strategy cooling are policy bounded; Trust, role, capability-state,
context-integrity and authority decisions remain conservative vetoes.

```js
import {
  LocalStrategyAdaptationRuntimeV1,
  LocalStrategyDispatcherV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
```

The controller cannot rewrite strategy code or create planning, assignment,
recovery or effect authority. Unsafe outcomes roll an operation back to its
safe baseline, and predecessor-bound handoff preserves learned state across a
peer restart or transfer.

See the [implementation
plan](./docs/collective-runtime/bounded-local-strategy-adaptation-v1-implementation-plan.md),
[architecture decision](./docs/adr/0021-bounded-local-strategy-adaptation.md)
and [threat
model](./docs/security/bounded-local-strategy-adaptation-threat-model.md).

### Peer-to-Peer Strategy Evidence Exchange V1

The opt-in `@agentplat/collective-runtime/strategy-evidence-exchange`
boundary lets peers share bounded, content-free evidence about outcomes of
catalog-bound local coordination strategies. Evidence is authenticated,
scope-bound and causal-sequence-checked before a peer can derive an optional
collective prior for its own local adaptation controller.

```js
import {
  PeerStrategyEvidenceExchangeRuntimeV1,
  createPeerStrategyEvidenceExchangePolicyV1,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";
```

The exchange does not distribute prompts, model outputs, strategy code or
model weights. Remote peers cannot select a local strategy, grant authority or
override a local baseline. Membership, Trust, causal continuity, source
independence, bounded gossip and robust aggregation only narrow what a local
peer may consider; unavailable, equivocal, unsafe or non-favorable evidence
cannot add positive local influence.

See the [implementation
plan](./docs/collective-runtime/peer-to-peer-strategy-evidence-exchange-v1-implementation-plan.md),
[architecture decision](./docs/adr/0022-peer-to-peer-strategy-evidence-exchange.md)
and [threat
model](./docs/security/peer-to-peer-strategy-evidence-exchange-threat-model.md).

### Decentralized Strategy Convergence and Stability V1

The opt-in `@agentplat/collective-runtime/strategy-convergence` controller
turns compatible evidence certificates into stable local recommendations.
Hysteresis, minimum cycle intervals, improvement margins, cooldown, oscillation
guards and partition recovery prevent transient collective signals from
causing uncontrolled strategy churn.

```js
import {
  StrategyConvergenceRuntimeV1,
  createStrategyConvergencePolicyV1,
} from "@agentplat/collective-runtime/strategy-convergence";
```

Every recommendation remains advisory and is limited to a strategy already
admitted by the local catalog and safety policy. Credible near-optimal local
strategies are preserved to retain diversity; partitioned, divergent,
oscillating, unsafe or insufficient views provide no positive prior.

See the [implementation
plan](./docs/collective-runtime/decentralized-strategy-convergence-stability-v1-implementation-plan.md),
[architecture decision](./docs/adr/0023-decentralized-strategy-convergence-and-stability.md)
and [threat
model](./docs/security/decentralized-strategy-convergence-threat-model.md).

### Dynamic Team Formation and Joint Work Contracts V1

The opt-in `@agentplat/collective-runtime/team-formation` runtime forms an ad
hoc roster when one Work domain needs several complementary roles or
capabilities. It evaluates complete combinations under local coverage,
diversity, budget and bounded-search policy instead of independently choosing
one assignee at a time.

```js
import {
  TeamFormationRuntimeV1,
  createTeamFormationPolicyV1,
} from "@agentplat/collective-runtime/team-formation";
```

A team proposal grants no authority. Activation requires an exact active
individual Work Contract for every selected position, and the resulting joint
contract never replaces those member leases, epochs or fencing tokens at an
action boundary. Failed members are replaced under a predecessor-bound team
epoch, while exact outcomes determine joint completion or failure.

See the [implementation
plan](./docs/collective-runtime/dynamic-team-formation-v1-implementation-plan.md),
[architecture decision](./docs/adr/0024-dynamic-team-formation-and-joint-work-contracts.md)
and [threat
model](./docs/security/dynamic-team-formation-threat-model.md).

### Autonomous Team Execution and Causal Replanning V1

The opt-in `@agentplat/collective-runtime/team-execution` runtime executes an
activated team's dependency graph through controlled portable-agent sessions.
It persists an idempotent dispatch before external work, exchanges only durable
content references, and unlocks a position only after its dependencies are
complete and locally available.

```js
import {
  TeamExecutionRuntimeV1,
  createTeamExecutionPolicyV1,
} from "@agentplat/collective-runtime/team-execution";
```

A failed, unsafe or expired position emits an exact causal recovery signal.
The existing formation runtime can replace that member under a new team epoch;
rebind retains unaffected completed work and invalidates the failed downstream
closure. Dispatches and joint contracts remain coordination data and never
replace an individual Work Contract at an action gateway.

See the [implementation
plan](./docs/collective-runtime/autonomous-team-execution-v1-implementation-plan.md),
[architecture decision](./docs/adr/0025-autonomous-team-execution-and-causal-replanning.md)
and [threat
model](./docs/security/autonomous-team-execution-threat-model.md).

### Team Execution Ownership Continuity V1

The opt-in `@agentplat/collective-runtime/team-execution-continuity` runtime
binds coordinator progress to the current Work owner and a certified,
content-addressed execution checkpoint. A successor can import that exact state
and replay pending dispatches with their original identifiers, while stale
coordinators and forked checkpoints fail closed.

The capability adds no leader election or effect authority. Applications
provide the current authority decision, durable checkpoint availability and
shared effect idempotency.

See the [implementation
plan](./docs/collective-runtime/team-execution-ownership-continuity-v1-implementation-plan.md),
[architecture decision](./docs/adr/0027-team-execution-ownership-continuity.md)
and [threat
model](./docs/security/team-execution-ownership-continuity-threat-model.md).

### Outcome-Driven Team Structure Adaptation V1

The opt-in `@agentplat/collective-runtime/team-structure-adaptation` runtime
learns a bounded local preference among policy-approved team structures from
validated execution outcomes. It can change the positions and dependency shape
proposed for a future team, but cannot mutate an active team or bypass ordinary
formation, eligibility, budget or Work Contract checks.

See the [implementation
plan](./docs/collective-runtime/outcome-driven-team-structure-adaptation-v1-implementation-plan.md),
[architecture decision](./docs/adr/0028-outcome-driven-team-structure-adaptation.md)
and [threat
model](./docs/security/team-structure-adaptation-threat-model.md).

### Integrated Collective Peer Host V1

The opt-in `@agentplat/collective-runtime/host` facade gives one peer a single
routing and worker lifecycle around independent collective runtimes. Verified
messages follow exactly one durable route, per-cycle limits prevent starvation
and stale topology pauses dispatch without granting or widening authority.
Subsystem restoration and readiness remain owned by their injected ports.

Transport, discovery, persistence, model providers and effect execution remain
application-owned ports.

See the [implementation
plan](./docs/collective-runtime/integrated-collective-peer-host-v1-implementation-plan.md),
[architecture decision](./docs/adr/0029-integrated-collective-peer-host.md) and
[threat model](./docs/security/integrated-collective-peer-host-threat-model.md).

### Certified Collective Decision Plane V1

The opt-in `@agentplat/collective-runtime/collective-decision` boundary applies
one policy to plan, roster, takeover, structure, role and strategy decisions.
Candidates bind scope, epoch, membership and payload digest; accepted heads use
durable CAS and reject rollback or a conflicting value for the same decision
slot. Local, evidence-backed and Byzantine-agreement certification modes are
explicit and fail closed. Active heads and replay-protection tombstones are
separately policy bounded.

`@agentplat/collective-quorum/collective-decision` adapts the existing signed
agreement protocol. It verifies the commit and current membership before
issuing a portable decision certificate that retains the original proof digest.
The decision remains coordination authority only and never becomes an action
grant, lease or fencing token. See [ADR 0030](./docs/adr/0030-certified-collective-decision-plane.md)
and its [threat model](./docs/security/certified-collective-decision-plane-threat-model.md).

### Mechanism-Aware Mission Allocation V1

The opt-in `@agentplat/collective-runtime/mechanism-allocation` runtime turns a
peer-local accepted planning view into bounded semantic work slots and clears a
distributed, non-monetary commit/reveal auction. Slot eligibility, dependencies,
resource use, declared cost and budget, per-peer concentration and independence
groups are enforced deterministically. Every event carries authenticated,
membership-bound admission evidence and is reverified after restore.
Equivocating bidders are excluded.

The allocation is advisory. A complete result can be projected into the normal
team-formation request, which still requires authenticated candidate evidence
and individual Work Contracts. The projection rechecks both allocation and
formation policy plus the original admissions. The limited incentive claim is
anti-front-running under authenticated identities and binding commitments; V1
does not claim strategy-proofness or universal collusion resistance. See [ADR
0031](./docs/adr/0031-mechanism-aware-mission-allocation.md) and its [threat
model](./docs/security/mechanism-aware-mission-allocation-threat-model.md).

### Integrated Coordination-Control Loop V1

The opt-in `@agentplat/collective-runtime/coordination-control` loop converts
fresh, source-bound projections of role alignment, context integrity,
uncertainty, Trust, capability and execution outcomes into typed proposals:
continue, pause, restrict, realign, reassign, adapt the team or replan. Missing,
stale, rolled-back or equivocating evidence produces a fail-closed pause.

Cooldown and hysteresis limit oscillation while a recovery margin preserves
bounded operational agility. Its durable outbox never treats expiry as delivery:
unacknowledged expiry is recorded explicitly. `@agentplat/collective-runtime/host`
exposes control, allocation and certified-decision ports through independent
opt-in facade methods; applications explicitly route a proposal through the
approval gate appropriate to that action. The host never auto-enacts advisory
output. See [ADR
0032](./docs/adr/0032-integrated-coordination-control-loop.md) and its [threat
model](./docs/security/integrated-coordination-control-loop-threat-model.md).

### Governed Autonomous Mission Lifecycle V1

The opt-in `@agentplat/collective-runtime/mission-lifecycle` runtime composes
planning, allocation, team formation, execution observation, control and
reconfiguration as one durable mission saga. Stable operation IDs,
authorization verification, revision-and-digest CAS, logical-time monotonicity
and bounded transition budgets make restart and retry behavior explicit.

Control proposals remain advisory until an injected, fenced reconfiguration
port enacts them. Pause, participation restriction, role transition,
reassignment, team adaptation and replanning return the saga to the appropriate
phase rather than silently completing it. The peer host exposes optional
advance and recovery methods without becoming an authority source. See [ADR
0033](./docs/adr/0033-governed-autonomous-mission-lifecycle.md) and its [threat
model](./docs/security/governed-autonomous-mission-lifecycle-threat-model.md).

### Heterogeneous Inference Intervention SDK V1

The opt-in `@agentplat/inference-control/intervention` subpath negotiates exact
control capabilities across opaque API models, token streams, representation
sidecars, portable agents and multimodal action agents. Trusted transformations
and sidecar work require verified receipts; durable CAS reservations bind
retries to one invocation while raw payloads remain volatile. See [ADR
0034](./docs/adr/0034-heterogeneous-inference-intervention-sdk.md) and its
[threat model](./docs/security/heterogeneous-inference-intervention-threat-model.md).

### Sharded Simulation and Scale Interoperability V1

`@agentplat/mesh-sim` exports sparse sharding, evaluator-owned checkpoint
restore, cross-shard delivery and bounded fault injection for closed profiles
up to 100,000 logical peers and 1,000,000 interactions. These contracts make
external simulation engines pluggable; constructing a conformant plan is not
evidence that a scale run occurred. Scalable team-vs-team evaluation also has
an opt-in restart-durable path: an explicit `durableStore`/`runId` pair binds
the exact definition, adapter, ports and sparse schedule to a CAS checkpoint,
while resumable environment and team ports checkpoint both isolated sessions
and reconcile stable operation IDs before the phase journal advances. Missing
cross-process continuity fails closed and no checkpoint state expands the
declared agent population. See [ADR
0035](./docs/adr/0035-sharded-simulation-scale-interoperability.md) and its
[threat model](./docs/security/sharded-simulation-scale-interoperability-threat-model.md).

### Replicated Mission Lifecycle Continuity V1

`@agentplat/collective-runtime/mission-continuity` adds a durable
`snapshot → replicate → checkpoint → takeover` path for the governed mission
saga. Certified availability, exact authority/epoch/fence binding, checkpoint
lineage, CAS and an external monotonic head preserve prepared and applied
receipts without replaying effects. See [ADR
0036](./docs/adr/0036-replicated-mission-lifecycle-continuity.md) and its
[threat model](./docs/security/replicated-mission-lifecycle-continuity-threat-model.md).

### Governed Adaptive Sparse Overlay V1

`@agentplat/mesh/adaptive-overlay` refreshes one bounded local view only after
locally governed, independently witnessed evidence is certified. Remote
partitions cannot replace the local quorum policy, and future, stale,
rolled-back or equivocal certificates fail closed. See [ADR
0037](./docs/adr/0037-governed-adaptive-sparse-overlay.md) and its [threat
model](./docs/security/governed-adaptive-sparse-overlay-threat-model.md).

### Heterogeneous Assessor Ensemble V1

`@agentplat/inference-control/assessor-ensemble` combines request-bound votes
from heterogeneous evaluators with independent-group and modality coverage.
Missing, conflicting, timed-out or uncovered evidence remains unresolved, and
the supplied operation gate dispatches only on `allow`. See [ADR
0038](./docs/adr/0038-heterogeneous-assessor-ensemble.md) and its [threat
model](./docs/security/heterogeneous-assessor-ensemble-threat-model.md).

### Attested Mission-Control Continuity V1

`@agentplat/collective-runtime/attested-mission-control` requires as many as
10,000 contiguous, verified, content-free health decisions before producing an
advisory `continue`. Durable high-water state and a monotonic anchor reset
safely across gaps, replay, restarts and authority changes. See [ADR
0040](./docs/adr/0040-attested-mission-control-continuity.md) and its [threat
model](./docs/security/attested-mission-control-continuity-threat-model.md).

### Multi-Domain Environment Adapter Kit V1

`@agentplat/mesh-sim` now registers physical, social, cyber and hybrid
environment descriptors and exact scenario manifests. Its conformance runner
checks requested-definition identity, deterministic observations, fenced
effects, restore behavior and resource/population bounds without receiving
evaluator verdicts. See [ADR
0039](./docs/adr/0039-multi-domain-environment-adapter-kit.md) and its [threat
model](./docs/security/multi-domain-environment-adapter-threat-model.md).

### Verified Benchmark Registry and Leaderboard V1

The simulation package also provides suite-specific, evaluator-verified
benchmark submissions with source/artifact/build locks, paired baselines and
derived metrics. Invalid, over-budget, duplicate and replayed-trace submissions
are never ranked. See [ADR
0041](./docs/adr/0041-verified-benchmark-registry-leaderboard.md) and its [threat
model](./docs/security/verified-benchmark-registry-threat-model.md).

### Evidence and Trust Alpha 4

`0.3.0-alpha.4` adds provider-neutral, deterministic Evidence lifecycle,
multidimensional Trust Profiles, exact policy-bound eligibility, contradiction,
quarantine, review and recovery in the new `@agentplat/trust` package. Explicit
Mesh and Inference Control adapters can consume authenticated current Trust
state to reduce candidates or refuse delegation; existing behavior remains
unchanged unless an application constructs those opt-in boundaries.

```sh
pnpm add @agentplat/trust@next
```

Alpha 4 does not claim universal truth, global reputation or atomic remote
revocation. Evidence remains scoped, source independence is local policy, and
full snapshots require a protector plus an external durable rollback anchor.
See the [Alpha 4 implementation plan](./docs/trust/alpha-4-implementation-plan.md),
[acceptance checklist](./docs/trust/alpha-4-acceptance-checklist.md),
[threat model](./docs/security/evidence-trust-threat-model.md) and
[design review](./docs/trust/alpha-4-design-review.md).

### Inference Control Alpha 3

`0.3.0-alpha.3` adds opt-in, provider-neutral control boundaries for model and
runtime inference, context provenance, capability negotiation, bounded
assessments, controlled output release, single-use Action Grants and outbound
messages. The public contracts fail closed when a required interception point,
assessment binding, authority generation or downstream fence is unavailable.
Existing Runtime, Model, Tools, Streaming, Sessions, Rooms, Framework and Agent
Mesh defaults remain unchanged unless an application installs the new wrapper
or gateway explicitly.

```sh
pnpm add @agentplat/inference-control@next
```

Alpha 3 provides deterministic local enforcement and at-most-one local
dispatch attempt. It does not claim universal safety, truth, immediate remote
compute cancellation, durable cross-process single use or exactly-once
external effects. See the [Alpha 3 implementation
plan](./docs/inference-control/alpha-3-implementation-plan.md), [acceptance
checklist](./docs/inference-control/alpha-3-acceptance-checklist.md), [threat
model](./docs/security/inference-control-threat-model.md) and [design review
record](./docs/inference-control/alpha-3-design-review.md).

## Packages

| Package                                     | Current public capability                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@agentplat/core`                           | IDs, metadata, lifecycle states, tenant context, envelopes and errors.                                                     |
| `@agentplat/framework`                      | High-level composition, safe local defaults and ephemeral quick runs.                                                      |
| `@agentplat/collective-runtime`             | Governed missions, replicated continuity, attested control, teams and recovery.                                            |
| `@agentplat/collective-host`                | Peer-local closed-loop composition across policy, trust, planning, finality and execution.                                 |
| `@agentplat/collective-host-postgres`       | Durable autonomous-node and assurance-execution state in PostgreSQL.                                                       |
| `@agentplat/collective-membership`          | Joint-quorum membership, governed agent lineage, enrollment and retirement.                                                |
| `@agentplat/collective-membership-postgres` | Durable peer membership heads, votes and certificates in PostgreSQL.                                                       |
| `@agentplat/collective-quorum`              | Signed peer quorum plus opt-in Byzantine-resilient collective agreement.                                                   |
| `@agentplat/collective-quorum-postgres`     | Durable peer promises, votes and certificates in PostgreSQL.                                                               |
| `@agentplat/collective-sync`                | Signed causal anti-entropy, catch-up certificates and readiness gates.                                                     |
| `@agentplat/collective-sync-postgres`       | Durable causal sync and execution-checkpoint evidence in PostgreSQL.                                                       |
| `@agentplat/planning-artifacts`             | Signed planning artifacts with source-first and certified multi-source availability.                                       |
| `@agentplat/planning-artifacts-postgres`    | Immutable artifact and replication-evidence persistence in PostgreSQL.                                                     |
| `@agentplat/model`                          | Provider-neutral direct model generation and streaming contracts.                                                          |
| `@agentplat/model-anthropic`                | Dependency-light Anthropic Messages adapter.                                                                               |
| `@agentplat/model-gemini`                   | Dependency-light Gemini generateContent adapter.                                                                           |
| `@agentplat/model-openai-compatible`        | Dependency-light Chat Completions adapter for compatible servers.                                                          |
| `@agentplat/rooms`                          | Agent Room domain, lifecycle, policy, context and repository contracts.                                                    |
| `@agentplat/rooms-postgres`                 | Durable PostgreSQL repository, migrations and transactional events.                                                        |
| `@agentplat/postgres`                       | Shared pool health, schema safety and versioned migration primitives.                                                      |
| `@agentplat/audit-postgres`                 | PostgreSQL audit and Session event sinks without Agent Rooms.                                                              |
| `@agentplat/rooms-api`                      | Injectable Hono REST API for the Agent Room lifecycle.                                                                     |
| `@agentplat/runtime`                        | Provider contracts plus executable provider dispatch and streaming.                                                        |
| `@agentplat/runtime-mock`                   | Deterministic, network-free provider for examples and tests.                                                               |
| `@agentplat/sessions`                       | Typed, bounded multi-agent turn orchestration over the public runtime.                                                     |
| `@agentplat/sessions-redis`                 | Redis pub/sub control for Sessions across service instances.                                                               |
| `@agentplat/streaming`                      | Versioned SSE server helpers, parser and thin browser subscription API.                                                    |
| `@agentplat/provider-openai`                | OpenAI Agents SDK execution with tenant-isolated credentials.                                                              |
| `@agentplat/workflows`                      | Process/task contracts and an in-memory workflow store.                                                                    |
| `@agentplat/memory`                         | Session/retrieval contracts and a tenant-isolated in-memory store.                                                         |
| `@agentplat/inference-control`              | Inference gates, heterogeneous assessor ensembles, context and role continuity.                                            |
| `@agentplat/interop`                        | Versioned heterogeneous agent/environment adapters with governed lifecycle gating.                                         |
| `@agentplat/interop-postgres`               | PostgreSQL custody for governed sessions, inbound replay/sequence state, outbound sequences and cognitive effect journals. |
| `@agentplat/trust`                          | Scoped Evidence, deterministic Profiles, eligibility and quarantine.                                                       |
| `@agentplat/mesh`                           | Coordination plus governed adaptive sparse views through 100,000 peers.                                                    |
| `@agentplat/mesh-crypto`                    | SHA-256 and Ed25519 signing, verification and bounded key resolution.                                                      |
| `@agentplat/mesh-protocol`                  | Strict bounded wire parsing, validation and conformance fixtures.                                                          |
| `@agentplat/mesh-sim`                       | Multi-domain simulation and bounded evaluation configuration through 100,000 agents.                                       |
| `@agentplat/mesh-sim-local`                 | Node-local immutable campaign artifacts, slot commits and locks.                                                           |
| `@agentplat/mesh-sim-postgres`              | Cross-host campaign custody, transactional leases and a restart-durable evaluation checkpoint store.                       |
| `@agentplat/tools`                          | Tool contracts and an in-memory tool registry.                                                                             |
| `@agentplat/mcp`                            | MCP server, tool-binding and registry contracts.                                                                           |
| `@agentplat/events`                         | Event contracts and an in-memory event bus.                                                                                |
| `@agentplat/audit`                          | Audit contracts, recursive redaction and signed causal telemetry/replay.                                                   |
| `@agentplat/auth`                           | Auth, permission and tenant-resolution contracts with local adapters.                                                      |

## Agent Room quickstart

Requirements: Docker Engine with Compose v2, plus `curl` and `jq` for the demo.

```sh
git clone https://github.com/Agentplat/agentplat.git
cd agentplat/examples/rooms-api
cp .env.example .env
docker compose up --build -d
bash scripts/demo.sh
```

Compose starts PostgreSQL, applies the public migration and launches the Hono API. The demo exercises the complete flow from Room creation through agent execution, artifact approval and archival. See the [reference application](./examples/rooms-api/README.md) for configuration and the [Agent Rooms guide](./docs/agent-rooms.md) for architecture and extension points.

Except for `GET /health`, the reference API requires `X-Agentplat-Tenant-Id`. This is a trusted local/self-hosted boundary, not end-user authentication. Internet-facing deployments must inject an authenticator that derives the tenant from a verified identity.

## Use as packages

For a single prompt, only import the facade:

```js
import { AgentPlat } from "@agentplat/framework";

const answer = await AgentPlat.ask({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4.1-mini",
  prompt: "Draft a launch message.",
});
```

`ask` returns plain text. Change the provider to `gemini`, `ollama` or
`openrouter`; use `compatible` with an explicit `baseURL` for another Chat
Completions endpoint.

To reuse the same configuration for advanced execution, streaming, and
multi-agent sessions, create it once with `AgentPlat.configure({...})`; see
the [`@agentplat/framework` guide](./packages/framework/README.md).

For a direct, ephemeral model call with no Room persistence:

```js
import { AgentPlat } from "@agentplat/framework";
import { chatModel } from "@agentplat/model-openai-compatible";

const result = await AgentPlat.quickRun({
  adapter: chatModel({
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_MODEL,
  }),
  instructions: "Be concise.",
  input: "Draft a launch message.",
});
```

The same `chatModel` factory has presets for `gemini`, `ollama` and
`openrouter`, plus `compatible` for any Chat Completions endpoint. See the
[model adapter guide](./packages/model-openai-compatible/README.md) for the
one-line provider changes and how to bring a non-compatible LLM through the
public `ModelAdapter` interface.

`quickRun` is intentionally not a shortcut around Room governance. Use the
Room service and PostgreSQL adapter when the work must be persistent,
auditable or approval-gated. See [portable execution](./docs/portable-execution.md)
for the model/runtime layering and Next.js or Express streaming examples.
For simulations and debates, see [multi-agent sessions](./docs/multi-agent-sessions.md).
The runnable [Next.js SSE reference](./examples/next-multi-agent-sse/README.md)
shows the complete server and browser integration path.

For an AWS deployment that reuses an existing RDS/Aurora cluster, Redis and
Secrets Manager or IAM database auth, see
[Bring your own PostgreSQL on AWS](./docs/bring-your-own-postgres-aws.md). The
path does not require DynamoDB or the Agent Rooms schema.

### npm from a fork or monorepo

When developing inside a pnpm workspace that also contains older AgentPlat
source packages, explicitly select the registry preview instead of resolving a
local workspace package: `pnpm add @agentplat/framework@next`. With npm alias
syntax, use `npm:@agentplat/framework@0.3.0-alpha.4` where a tool requires an
explicit registry target.

The low-level runtime registry remains available when an application wants
full control:

```js
import { DefaultAgentRuntime } from "@agentplat/runtime";

const runtime = new DefaultAgentRuntime();
runtime.registerProvider("local", {
  async run(_agent, input) {
    return { status: "completed", output: `local:${input.input}` };
  },
});

const agent = {
  id: "example-agent",
  tenantId: "example-tenant",
  name: "Local example",
  platform: "local",
};

const result = await runtime.run(
  agent,
  { input: "hello open core" },
  { tenant: { tenantId: agent.tenantId }, agentId: agent.id },
);
```

Run the checked-in example:

```sh
corepack pnpm install
corepack pnpm run example:quick
corepack pnpm run example:basic
corepack pnpm run example:sessions
corepack pnpm run example:collective
corepack pnpm run example:role-alignment
```

## Development

```sh
corepack pnpm install
corepack pnpm run check
```

`check` audits the checkout, removes stale build output, rebuilds every package,
audits the built tree, type-checks the workspace, runs unit tests and validates
release metadata. It then audits every package tarball, imports every declared
export from a package-isolated consumer, compiles packed TypeScript
declarations, runs the signed three-peer Mesh scenario and preserves the
aggregate functional smoke test. It also executes a clean Trust consumer across
the Trust root plus the explicit Mesh and Inference Control Trust subpaths, and
verifies the versioned 27-scenario Alpha 4 adversarial catalog.

The intentional publication allowlist is
[`config/public-packages.json`](./config/public-packages.json). Release,
versioning and pack-smoke scripts consume this same catalog so adding a
workspace directory cannot publish a package accidentally.

Package versioning and publishing are documented in [RELEASING.md](./RELEASING.md).
See [release channels](./docs/release-channels.md) for `next` versus `latest`.

## Open-core boundary

This repository contains everything needed to build and self-host an Agent Room platform; public code does not depend on AgentPlat Cloud or private packages. Hosted operations, enterprise SSO and organization-wide policy management, billing, managed infrastructure, premium connectors, advanced analytics and customer-specific verticals remain commercial products built on the same public contracts.

## License

AgentPlat open-core code is licensed under the [Apache License 2.0](./LICENSE). The AgentPlat name, logo and brand assets are covered by the [trademark guidelines](./TRADEMARKS.md).
