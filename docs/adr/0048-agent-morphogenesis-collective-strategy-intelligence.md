# ADR 0048: Reuse Exchange and Convergence for Morphogenesis V4

Status: accepted

## Decision

Agent Morphogenesis V4 specializes the existing Strategy Evidence Exchange,
Collective Sync projection and Strategy Convergence instead of introducing a
parallel federation protocol. The specialization adds exact V3 lineage and
local compatibility gates. Collective results remain bounded advice and may
only produce V3 governance recommendations reviewed by an authorized agent,
person or quorum.

## Consequences

- Agent Mesh transports content-free signed evidence without remote control.
- Membership, Trust, independence, replay, equivocation, partition and
  convergence behavior stay consistent with existing runtime primitives.
- Local catalogs and policies remain sovereign and incompatible cohorts do not
  merge.
- Robust aggregation and diversity controls reduce, but cannot prove absence
  of, poisoning or collusion.
- PostgreSQL can reuse the established CAS/digest/witness state repository.
