# AgentPlat Architecture

**Defines:** the repository-level architecture and package boundaries. **Status:** implemented documentation.

AgentPlat is layered from core IDs/contracts and events through runtime, sessions, rooms, tools, memory, planning, collective control, trust, inference control and mesh adapters. PostgreSQL, Redis and HTTP packages are adapters; domain contracts remain portable.

Start points: `packages/core`, `packages/runtime`, `packages/rooms`, `packages/collective-runtime`, `packages/mesh`, `packages/mcp` and `examples/`. Use package READMEs for API details and ADRs for architectural decisions.

Specified future evolution is kept separate from implemented package behavior.
The [Governed Durable Workflows V1 design](./workflows/README.md) defines the
implemented core process runner, task/outcome integrity, PostgreSQL and Temporal
adapters, the Agent Room gate bridge and progressive autonomy. Unchecked
acceptance items remain explicit non-claims.

AgentPlat Agent Morphogenesis is an opt-in future-baseline composition under
`@agentplat/collective-runtime/morphogenesis`. Governed Durable Workflows owns
its process run; Morphogenesis owns bounded observations, proposals, decisions,
the morphology head and domain receipts; existing lifecycle, membership, Team,
Work and Action boundaries retain authority. PostgreSQL state lives in the
Collective Host adapter, Room/Mesh projections remain authority-neutral, and
the frozen collective capability V1 denominator is unchanged.
