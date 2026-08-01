# ADR 0009: Adaptive planning is proposal-driven, locally bounded and execution-authority neutral

- Status: Proposed
- Date: 2026-08-01

## Context

AgentPlat `0.3.0-beta.2` composes local delegation, Mesh assignment, Trust,
Inference Control, action grants, budget reservations, fencing and durable
evidence. It can prove whether a known Work Item is currently authorized and
whether one protected effect may be dispatched. Its normative collective
evaluation, however, begins with a complete task graph and constructs reference
assignments directly. It therefore evaluates governance of a supplied plan, not
formation and revision of that plan by peers with partial observations.

The next additive boundary must accept only a high-level mission intent. Peers
must be able to propose bounded work from local observations, expose those
proposals through existing peer-to-peer coordination, form temporary roles from
accepted assignments and revise work when observations, capabilities or
availability change. Planning output must never become execution authority by
itself.

Extending the frozen Mesh payload union or changing `wireVersion: 1` would make
the planning experiment a protocol migration instead of an additive capability.
Using simulator-global state, a precomputed task list or a hidden membership
oracle would make the experiment centralized even if its final assignments were
sent over Mesh.

## Decision

Introduce one additive, provider-neutral package,
`@agentplat/collective-planning`.

- Its browser-safe root owns mission-intent, plan-fragment, plan-view,
  selection-policy, adaptive-role and environment-port contracts; canonical
  digests; strict validation; and pure immutable reducers.
- Its explicit `./mesh` subpath composes accepted plan fragments with existing
  Mesh Objective, Work, offer, bid, award, acceptance, lease, result and
  recovery APIs. It may depend on `@agentplat/collective-control`, but the
  existing packages do not depend on it.
- Its explicit `./evaluation` subpath owns evaluation-only event, observation,
  environment and invariant-monitor ports. It performs no simulation or model
  I/O on import.
- `@agentplat/mesh-sim` supplies the deterministic reference environment and
  the normative closed-loop runner. The runner uses production reducers and
  adapters; it does not reproduce their decisions with experiment-only logic.

`MissionIntentV1` contains desired outcomes, public constraints, validity,
resource classes, planning limits and an exact governed Objective reference. It
contains no task list, dependency graph, assignment, fixed role-to-peer map or
hidden success predicate.

A peer decision policy may emit `PlanFragmentProposalV1` from its current local
observations. A proposal describes one semantic work slot, required outcomes,
dependencies, role/capability requirements, budget request, deadline and basis
digests. It is data, not authority. A pure local planning policy returns an
accepted, challenged or rejected decision under the exact intent, mandate,
Objective revision, planning policy and local resource view.

Accepted local fragments are projected into existing Mesh Work Items. Their
`work.offer` envelopes carry the critical extension
`agentplat.collective-planning.fragment.v1`. The extension binds the mission
intent, proposal, fragment, semantic slot, predecessor, dependency and local
plan-view digests. The existing Work payload remains byte-compatible and is the
canonical executable projection. The adapter rejects any mismatch between the
extension, the content-addressed fragment and the Work payload before planning
state is committed.

Planning-capable peers advertise an ordinary capability record. A sender only
uses the critical extension for recipients whose verified current capability
and locally configured extension support match. Older peers reject the unknown
critical extension. There is no downgrade retry, optional-authority fallback or
new Mesh message type.

Each peer retains an append-only bounded candidate set and a local
`PlanViewV1`. A semantic slot has at most one active local head under one frozen
`PlanSelectionPolicyV1`. Selection is deterministic for an identical candidate
set and policy, with the fragment digest as the final tie-break. Peers may
temporarily disagree because their observations and candidate sets differ.
Beta 3 measures eventual convergence after communication heals; it does not
claim Byzantine agreement or a globally authoritative plan.

Replanning appends a causally linked fragment revision. Superseding a fragment
causes the planning facade to revise or cancel the associated local Mesh Work
Item through existing APIs. An accepted Mesh assignment creates the existing
`WorkContractV1` through `createWorkContractFromMeshV1`; the planning package
wraps it with the exact fragment and plan-view digests. The adaptive role exists
only while that Work Contract and assignment remain current. A plan decision,
role label, model output or simulator observation cannot issue an assignment,
Action Grant or governed permit.

Planning quotas and deterministic per-peer budget shards prevent unbounded plan
growth without pretending to be the effect-authority ledger. The Beta 2
mandate, Work Contract, action reservation and downstream fence remain the
authoritative ceilings. Shards derive from the exact mandate subject set frozen
by the intent, never from a mutable discovery or Trust view. Every planning
limit is intersected with those existing ceilings and can only narrow them.

The evaluation boundary is split:

```text
high-level MissionIntentV1
             |
             v
peer-local observation -> decision policy -> fragment proposal
             |                                  |
             |                         local planning gate
             |                                  |
             +----------------------- accepted fragment
                                                |
                                                v
existing Mesh work.create -> offer -> bid -> award -> accept
                                                |
                                                v
current assignment -> WorkContract -> Trust/inference -> grant/permit
                                                |
                                                v
                          fenced environment effect and observable outcome

runner-visible environment port               evaluator-only monitor
observations + effect receipts                 hidden state + invariants
```

The runner receives only bounded per-peer observations and effect receipts. An
independent invariant monitor sees hidden world state and derives mission
success, partial success and safety violations. The interaction ledger is
generated from executed boundary events. Padding, declared-but-uninjected
faults, constant success values and direct assignment shortcuts invalidate a
report.

## Invariants

1. A mission intent, plan proposal, fragment, role or plan-view digest never
   grants execution authority.
2. A fragment can become executable only through an accepted current Mesh
   assignment and the existing governed Work Contract path.
3. Planning cannot widen mandate capability, budget, validity, subject,
   Objective, Work or action scope.
4. No normative peer, planner or runner can read global membership, future
   faults, hidden world state or the terminal predicate.
5. Every fragment revision names its exact predecessor and observed causal
   basis; same ID with a different digest is a conflict.
6. Active fragment graphs are acyclic, bounded in depth, fanout, cardinality,
   bytes, revisions and budget.
7. A stale plan head, Objective revision, Work revision, assignment epoch,
   authority generation or fencing token cannot produce an effect.
8. Replanning never rewrites accepted history. It appends a decision and
   explicitly revises, cancels, completes or leaves prior work terminal.
9. Identical intent, policy, observations, candidate records, seed and logical
   time produce the same state, effects, trace and digests.
10. Evaluation success and safety values are derived by the independent
    monitor from observed events and world state, never supplied by the runner.
11. Existing direct APIs remain outside this opt-in boundary and keep Beta 2
    behavior.
12. Mesh wire V1, Beta 2 canonical fixtures and persistence records remain
    byte-identical.

## Consequences

- AgentPlat gains a real closed-loop path from intent to adaptive governed
  effects without adding a hosted controller.
- Distributed planning remains eventually convergent and safety-bounded; Beta
  3 does not claim global consensus under malicious peers.
- The reference evaluation becomes more expensive because every normative
  interaction traverses actual reducers and adapters.
- The package remains usable with deterministic policies, recorded model
  decisions, open-weight providers or black-box APIs. Live-provider campaigns
  remain diagnostic unless their complete decision surface is registered.
- Scaling beyond 500 agents and explicit Byzantine-tolerance targets remain a
  later milestone after the closed-loop experiment is credible.

## Rejected alternatives

- **Increase only the simulated population.** This would scale the existing
  shortcut instead of exercising distributed plan formation.
- **Put planning authority in Rooms, Trust or model output.** Those layers
  provide governance context, evidence or proposals; they do not own Mesh or
  action authority.
- **Add planning message types to Mesh V1.** This changes a frozen closed union
  and is unnecessary for the first closed-loop capability.
- **Require one global plan certificate.** That would introduce a consensus
  claim and fault model not needed for Beta 3. Byzantine plan consensus is
  deferred.
- **Let the environment return assignments or tasks.** That is centralized
  orchestration and invalidates the experiment.
