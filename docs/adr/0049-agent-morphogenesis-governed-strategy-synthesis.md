# ADR 0049: Govern strategy synthesis as an inert catalog pipeline

Status: accepted

## Decision

Agent Morphogenesis V5 generates declarative candidates rather than installing
code or creating authority. It reuses V2 blueprint/profile references, V3
Strategy Adaptation and governance, V4 evidence, counterfactual simulation,
Blueprint Registry, Trust, Inference Control, Agent Rooms and Agent Mesh.

The mandatory sequence is gap → draft → simulation → independent certification
→ local eligibility gates → agent/person/quorum review → experimental canary →
reviewed certification/degradation/retirement/rollback.

## Consequences

- Model output is untrusted and cannot become an executable artifact directly.
- Every implementation and material reference is content-addressed.
- Experimental candidates cannot enter ordinary selection.
- Mesh shares evidence and recommendations, never authority.
- Local policy may require any supported reviewer route, including a person,
  but V5 has no human-only global requirement.
- Operational quality remains an empirical question outside source completion.
