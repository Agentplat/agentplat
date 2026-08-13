# Collective development capability matrix V1

Status: source and integration inventory. Empirical evaluation is tracked
separately.

Frozen baseline ID: `agentplat-collective-capabilities-v1`. The denominator is
exactly 11 closure objectives and 19 source capabilities. The machine-readable
manifest and its change-control rules are defined in the
[capability baseline governance](./capability-baseline-governance-v1.md).
Audits may identify defects inside these IDs but cannot add objectives to V1.

## Purpose

This matrix is the development closure boundary for the public open-source. It
separates three different claims:

- **implemented** means a provider-neutral public contract has an executable
  reference runtime;
- **integrated** means the capability is connected to an operational path and
  cannot be bypassed merely by supplying a caller-authored result; and
- **validated in deployment** requires concrete production adapters, scenarios
  and measured evidence, which source code alone cannot establish.

No global scheduler, global topology repository or fixed central coordinator is
part of the design.

`@agentplat/collective-planning/development-evidence` is the machine-checkable
counterpart of this matrix. It can close only the 19 source capabilities for one
exact commit/tree/policy. Closure requires a locally authorized manifest and
issuer/key binding, a resolved manifest whose three evidence classes exactly
match the receipt, a source tree whose every entry is rehashed from resolved
bytes, and a detached Ed25519 attestation verified by the concrete Web Crypto
implementation. Arbitrary, unresolved or unsigned hashes cannot close the
inventory. The assessment always leaves empirical validation pending and
execution unauthorized.

## Integrated closure objectives

The current development cycle closes eleven cross-cutting objectives. A source
status of **reference-integrated** means that the open-source contains a concrete
composition and that intermediate plans, certificates, cognitive material or
effect authority cannot be replaced by a caller-supplied success value. It does
not claim that a deployment provider or an empirical campaign exists.

|   # | Objective                                   | Integrated public surface                                                                                                                                             | Enforced path                                                                                                                                                                                                                                                                                     | Source status                            |
| --: | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
|   1 | Peer-local collective runtime               | `@agentplat/collective-host/reference-integrated-stack`                                                                                                               | mission intent → distributed decomposition/allocation → finality → controlled execution → adaptation                                                                                                                                                                                              | reference-integrated                     |
|   2 | Planning-to-effect finality bridge          | reference stack, `./in-process-sparse-bft-gateway`, `./assurance-coupled-execution`                                                                                   | planning decision is recomputed from cycle/view; validator admission precedes signing; execution finality binds the planning certificate, cognitive request/receipt, semantic evidence and effect                                                                                                 | reference-integrated                     |
|   3 | Governed agent lifecycle                    | `@agentplat/collective-membership/governed-agent-lifecycle` and `@agentplat/interop/governed-lifecycle`                                                               | nominal runtime plus library-owned invocation, certified creation, successor-epoch enrollment, capability/role eligibility, stable retirement and session invalidation                                                                                                                            | reference-integrated                     |
|   4 | Autonomous compromise recovery              | `@agentplat/collective-runtime/compromise-aware-recovery` and lifecycle exclusion adapter                                                                             | nominal recovery supervisor and library-owned progress/effect invokers ensure evidence-backed sparse exclusion and governed retirement precede fenced restore, reauction or replanning                                                                                                            | reference-integrated                     |
|   5 | Operational cognitive control               | `@agentplat/inference-control/operational-control`                                                                                                                    | nominal controller plus library-owned turn/tool/effect invocation, pre/post-turn observers, intervention, black-box or representation control and mandatory pre-effect gating                                                                                                                     | reference-integrated                     |
|   6 | Statistical control coupled to coordination | semantic guarantees plus `@agentplat/collective-host/semantic-horizon-coupling`                                                                                       | construction-time nominal engine/horizon/controller bindings, private state transitions and exhaustive output validation produce continue/shorten/replan/safe-stop decisions consumed by planning and effect gates                                                                                | reference-integrated                     |
|   7 | Heterogeneous agent/environment integration | `@agentplat/interop`, `./governed-lifecycle`, `createReferenceGovernedInteropRuntimeV1`, runtime cognitive adapters                                                   | nominal closed composition over one lifecycle/store/profile, immutable client/router/admission/gate bindings, complete manifest and role validation, fenced prepare/commit effects, signed/idempotent envelopes, checkpoint transfer and lifecycle-gated portable operations                      | reference-integrated                     |
|   8 | Causal observability and replay             | `@agentplat/audit/collective-telemetry` and host telemetry adapter                                                                                                    | signed chains, digest CAS, monotonic witness, tenant/collective scope, fork rejection and mission/cycle/decision/effect replay                                                                                                                                                                    | reference-integrated                     |
|   9 | Scale-ready evaluation runtime              | `@agentplat/mesh-sim/scalable-evaluation`                                                                                                                             | isolated equal-seed sessions, full-envelope ingress after exact ACKs, authorized Ed25519 perturbation/recovery evidence, bounded accounting, recovery-to-baseline, and a nominal stack adapter with sparse-plane-first receive, exact-scope ownership, step journals and receipt-settled outboxes | reference-integrated; execution separate |
|  10 | Formal decentralized control model          | `@agentplat/collective-control/bounded-model`, `@agentplat/collective-control/bounded-progress-model` and `docs/collective-runtime/decentralized-control-model-v1.md` | executable bounded-state exploration plus conditional-progress assumptions, safety/liveness properties, fault limits, complexity and falsifiable hypotheses                                                                                                                                       | implemented and executable within bounds |
|  11 | Transition and proposal work packages       | `docs/transition/decentralized-collective-transition-plan-v1.md`                                                                                                      | phased deliverables, dependency gates, compute/cost model, risk, rights, adoption and sustainment                                                                                                                                                                                                 | documented                               |

The reference stack still receives environment-owned implementations for
identity/key custody, authenticated transport, durable storage, model/tool
providers, validator proposal policy, monotonic witnesses and transactional
effect sinks. Those are explicit trust boundaries, not caller-authored
substitutes for the eleven capabilities above.

## Development closure

|   # | Capability objective                                      | Public implementation                                                                                                                                                       | Integration boundary                                                                                                                                      | Source status              |
| --: | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
|   1 | Autonomous local peer host                                | `@agentplat/collective-host/autonomous-node`                                                                                                                                | mission intent through planning, allocation, finality, execution and adaptation                                                                           | implemented and integrated |
|   2 | Sparse peer-to-peer discovery and routing                 | `@agentplat/mesh/overlay`                                                                                                                                                   | bounded active/reserve views with local policy and no complete graph                                                                                      | implemented and integrated |
|   3 | Durable causal delivery and catch-up                      | `@agentplat/mesh/overlay-transport` and `@agentplat/collective-host/distributed-protocol`                                                                                   | per-peer queues, predecessor recovery, deduplication, retry and backpressure                                                                              | implemented and integrated |
|   4 | Membership, epochs and attenuated lineage                 | `@agentplat/collective-membership`, `./agent-lineage` and PostgreSQL adapters                                                                                               | certified membership gates agreement, factories and peer eligibility                                                                                      | implemented and integrated |
|   5 | Authenticated, rotation-aware overlay transport           | `@agentplat/mesh/overlay-transport`                                                                                                                                         | envelope binding covers peer, membership epoch, key, sequence, time and payload digest                                                                    | implemented and integrated |
|   6 | Distributed mission decomposition                         | `@agentplat/collective-planning/distributed-decomposition`                                                                                                                  | message-driven graph fragments and dependency reconciliation                                                                                              | implemented and integrated |
|   7 | Decentralized allocation and team formation               | `@agentplat/collective-host/distributed-planning` and `@agentplat/collective-runtime/distributed-team-allocation`                                                           | commitment/reveal, awards, certified roster, activation and settlement                                                                                    | implemented and integrated |
|   8 | Sparse adversarial agreement                              | `@agentplat/collective-quorum/sparse-agreement-runtime`, `./partial-view-agreement` and `./equivocation-response`                                                           | membership-bound locks, shares, finality and scope-local exclusion evidence                                                                               | implemented and integrated |
|   9 | Adversarial context fusion and local credibility          | `@agentplat/collective-quorum/mission-context-fusion`, `./collusion-aware-context` and `@agentplat/trust/peer-credibility`                                                  | incomplete/conflicting evidence resolves to certified context or an unresolved result                                                                     | implemented and integrated |
|  10 | Mission execution continuity and compromise recovery      | `@agentplat/collective-runtime/mission-continuity`, `./team-execution-continuity` and `./compromise-aware-recovery`                                                         | certified checkpoint availability, fenced takeover and exact restore/reauction/replan                                                                     | implemented and integrated |
|  11 | Autonomous adaptation and local replanning                | `@agentplat/collective-host/autonomous-adaptation` and `@agentplat/collective-runtime/autonomous-mission-loop`                                                              | causal signals drive finalized mission, strategy, role and team changes                                                                                   | implemented and integrated |
|  12 | Role, objective and context drift detection               | `@agentplat/inference-control/semantic-metrics`, `./role-alignment` and `./context-integrity`                                                                               | bounded assessments feed dispatch and replanning gates                                                                                                    | implemented and integrated |
|  13 | Inference-time intervention                               | `@agentplat/inference-control/intervention` and `./reference-controllers`                                                                                                   | pre-turn and tool/action intervention can restrict, redirect, checkpoint or stop                                                                          | implemented and integrated |
|  14 | Heterogeneous open and black-box adapters                 | `@agentplat/runtime/cognitive-adapter` and `@agentplat/inference-control/cognitive-adapters`                                                                                | portable execution/control ports cover representation-aware and ordinary agent surfaces                                                                   | implemented and integrated |
|  15 | Semantic agility and governed role evolution              | `@agentplat/inference-control/semantic-metrics` and `./governed-role-evolution`                                                                                             | nominal catalog identity, captured mission binding and library-owned resolution join diversity, novelty, hysteresis and authority attenuation constraints | implemented and integrated |
|  16 | Anytime statistical guarantees coupled to planning        | `@agentplat/inference-control/semantic-guarantees` and `@agentplat/collective-host/semantic-horizon-coupling`                                                               | continue/shorten/replan/stop directly bounds protected execution and replanning                                                                           | implemented and integrated |
|  17 | Governed creation and termination of agents               | `@agentplat/collective-membership/agent-factory`                                                                                                                            | policy, parent authority, budgets, quotas, key custody, attestation and cleanup                                                                           | implemented and integrated |
|  18 | Versioned agent/simulation interoperability               | `@agentplat/interop` and `@agentplat/interop/http`                                                                                                                          | capability handshake, signed envelopes, idempotency and checkpoint transfer                                                                               | implemented and integrated |
|  19 | Scale-safe operation, telemetry and executable invariants | `@agentplat/mesh-sim`, `@agentplat/audit/collective-telemetry`, `@agentplat/collective-host/collective-telemetry` and `@agentplat/collective-runtime/collective-invariants` | logical interaction budgets, real restore checks, signed content-free streams and pre-effect safety receipts                                              | implemented and integrated |

## Executable safety statements

The invariant guard makes the cross-package assumptions explicit at the effect
boundary:

1. No external effect is admitted without exact authorization, finality and an
   admissible semantic-horizon decision.
2. One membership epoch and decision coordinate cannot acquire two different
   final decisions in the same local state.
3. Budget transitions conserve units and remain within the installed maximum.
4. Child authority and budgets cannot exceed their parent lineage.
5. Epoch, fence and checkpoint coordinates cannot roll back or equivocate.
6. Missing, unauthenticated, stale, contradictory or capacity-exhausted
   evidence fails closed.

## What remains outside source closure

The following are evidence and deployment obligations, not missing open-source
algorithms:

- install real identity, membership, key-custody, certificate, time and
  monotonic-anchor providers;
- connect production model/tool adapters and transactional effect sinks;
- execute increasing-scale, long-horizon, degraded-network and adversarial
  scenarios against declared baselines;
- calibrate statistical assumptions and publish reproducible measurement
  artifacts; and
- certify operational security and compliance controls in the target hosting
  environment.

Until those activities are executed, the accurate claim is **development
surface complete, empirical performance unproven**.

The assumptions, complexity envelopes and falsifiable comparison hypotheses
are defined in the
[decentralized collective control model](./decentralized-control-model-v1.md).
The remaining release, evaluation, hosting and organizational evidence is
tracked in the [program readiness checklist](./program-readiness-checklist-v1.md).
