# AgentPlat Agent Morphogenesis Strategy Adaptation V3

**Defines:** additive, opt-in learning and governance for Morphogenesis proposal
strategies. **Status:** source capability; no operational, production or
organizational-improvement claim.

V3 extends Agent Morphogenesis V2 and reuses
`@agentplat/collective-runtime/strategy-adaptation`. It does not change V1/V2
defaults or create an alternate execution authority.

## Required separation

A conforming implementation keeps these stages distinct:

1. observed outcomes and measurements;
2. bounded local learning and advisory selection;
3. proposal/plan generation bound to the selected implementation;
4. counterfactual analysis;
5. recommendation;
6. review by an authorized agent, person or quorum;
7. catalog lifecycle transition; and
8. ordinary governed Morphogenesis decision and execution.

No earlier stage substitutes for a later one.

## Catalog and selection

`MorphogenesisStrategyCatalogV3` binds version and parent catalog, the exact
immutable local strategy catalog, its plan-decomposition baseline and each
strategy's Morphogenesis policy, blueprint catalog, generator implementation
and supported operators.

`MorphogenesisStrategyContextV3` binds scope, morphology epoch, snapshot, need,
target, policy, risk, cost and deadline. Selection delegates to the existing
learner, including safety dimensions, baseline floor, exploration budget,
weights, quarantine and entropy binding. The resulting V3 selection is
`advisoryOnly`.

`MorphogenesisStrategyExecutionBindingV3` links the selected definition to the
generated proposal, compiled plan and generator receipt. Only an outcome for
that exact plan may become feedback.

## Comparable outcome evidence

An observed measurement contains exactly the existing five metrics:

- mission progress;
- latency efficiency;
- resource efficiency;
- recovery quality; and
- safety.

Disposition mapping is conservative: partial success counts as failure,
successor recovery counts as unsafe and missing evidence remains indeterminate.
Source identity, revision, confidence, provenance and outcome evidence are
retained. A caller cannot submit a scalar reward.

## Governance

Governance actions are `promote`, `degrade`, `retire` and `rollback`.
Recommendations bind the exact adaptation state, catalog, evidence,
counterfactual report, risk, cost, confidence, proposer, route and expiry.

Reviews normalize authorized-agent, authorized-person and collective routes.
Policy may require proposer/reviewer independence. Approved changes use CAS and
retain permanent terminal identities for the state generation. Baseline
retirement, stale recommendations, self-review, low confidence, rapid switching
and transition-window exhaustion fail closed.

## Counterfactual analysis

Scenarios bind context, catalog, candidates, simulator identity/version/code,
environment, seed, interaction budget and lifetime. Estimates bind all those
coordinates and the complete five-metric vector. Reports may classify
favorable, regression, damage or inconclusive and recommend an advisory action.

Counterfactual estimates are a distinct type and cannot be converted through
the observed-feedback adapter. Only an independently reviewed recommendation
can alter governance state.

## Integrations

- Mission Lifecycle uses explicit
  `request_morphogenesis_strategy_change`/`enact_morphogenesis_strategy_change`.
- Trust supplies only the existing restrictive safety signal.
- AgentPlat Memory stores scoped, content-free recall records and is never the
  governance authority.
- Agent Rooms project selection, recommendation, review and transition.
- Agent Mesh transports unsigned recommendation projections; authenticated
  delivery still grants no authority.
- PostgreSQL persists adaptation state, governance state and immutable
  counterfactual reports with CAS/digest validation and rollback witness.

## Public entry points

- `@agentplat/collective-runtime/morphogenesis`
- `@agentplat/collective-runtime/strategy-adaptation`
- `@agentplat/collective-runtime/mission-lifecycle`
- `@agentplat/collective-host/morphogenesis-strategy-memory`
- `@agentplat/collective-host-postgres`
- `@agentplat/rooms-mesh/morphogenesis`

## Evidence boundary

Deterministic tests prove source behavior only. Simulated advantages,
counterfactual rankings and local weight changes are not evidence that a
strategy improves real missions. Such claims require preregistered operational
and empirical evidence collected outside source completion.
