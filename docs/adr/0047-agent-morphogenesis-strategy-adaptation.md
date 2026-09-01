# ADR 0047: Agent Morphogenesis strategy adaptation reuses bounded local learning

- Status: accepted
- Date: 2026-08-30

## Context

Agent Morphogenesis V2 can enact governed organizational changes but does not
choose proposal-generation strategies from prior outcomes. AgentPlat already
has bounded local strategy adaptation, peer evidence exchange and stability
guards. A separate Morphogenesis learner would duplicate those controls and
create a new feedback authority path.

## Decision

Agent Morphogenesis Strategy Adaptation V3 specializes the existing
`plan_decomposition` learning operation. A V3 definition binds one immutable
local strategy to a Morphogenesis policy, blueprint catalog, proposal generator
and admitted operator set. Selection remains advisory and is causally bound to
the generated proposal and compiled operator plan before an observed outcome
can become feedback.

Only observed, source-bound measurements enter the existing learner.
Counterfactual simulation has a separate record family and can only produce an
advisory report. It cannot masquerade as feedback.

Promotion, degradation, retirement and rollback use a separate durable
governance state. A recommendation is persisted before review and requires an
exact independent review by an authorized agent, person or collective route.
Neither learned weights nor a recommendation grant execution authority.

Mission Lifecycle exposes a distinct opt-in strategy-change action. Trust
narrows the existing safety dimension. Memory, Agent Rooms and Agent Mesh store
or project content-free records only. PostgreSQL reuses Collective Host runtime
state and the existing rollback witness.

## Consequences

- Existing learning, baseline, exploration, quarantine and convergence
  semantics remain authoritative and reusable.
- Catalog and policy versions are content-bound; strategy implementations are
  never generated or rewritten by feedback.
- Terminal recommendation identities are retained for the state generation;
  capacity exhaustion fails closed instead of reopening replay slots.
- Simulation is reproducible from exact model, environment, seed and budget
  bindings, but provides no operational or causal improvement claim.
- Production and empirical evaluation remain separate obligations.

## Rejected alternatives

- A global Morphogenesis optimizer: central authority and failure domain.
- Model-written strategies: implementation mutation from untrusted output.
- Caller-supplied rewards: outcome amplification without causal evidence.
- Automatic promotion from weights or simulation: feedback becomes authority.
