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

The additive V2 profile compiles advanced organizational operators into those
same owners. Governed operator admission binds an approved agent/person/quorum
decision to a Policy V2 plan and execution fence; a separate durable
compensation journal handles pre-commit reversal. Mission Lifecycle and Interop
are explicit opt-in entry points, never alternate authority planes.

Morphogenesis Strategy Adaptation V3 reuses the existing local strategy
adaptation reducer, Trust safety projections and Collective Host persistence.
Its catalog, outcome and counterfactual records are content-free; a separate
governance CAS state owns lifecycle status while ordinary Morphogenesis
decision/execution continues to own organizational effects.

Morphogenesis Collective Strategy Intelligence V4 specializes the existing
Strategy Evidence Exchange, Collective Sync and Strategy Convergence. Agent
Mesh carries content-free signed evidence; receiving peers reapply local
catalog, Trust, compatibility, diversity and governance policy. Collective
certificates are bounded advice and never remote execution authority.

Morphogenesis Governed Strategy Synthesis V5 turns evidenced catalog gaps into
declarative candidates. Generation, reproducible simulation, independent
certification, Blueprint/Trust/Inference eligibility, governance review,
experimental canary and catalog materialization are distinct boundaries. No
stage installs code or creates execution authority.

Morphogenesis Governed Agent Genesis V6 composes V2 synthesized profiles with
the existing Agent Factory, Membership, attestation, retirement, Rooms, Mesh
and Work owners. Sandbox and probation remain authority-free; reviewed
admission, Membership, attestation and Work issuance are separate durable
boundaries.

Morphogenesis Governed Organizational Evolution V7 coordinates whole-collective
successor epochs through existing Morphogenesis, Dynamic Topology, Membership,
Work and Action owners. Plans, canaries and handoffs remain content-free and do
not consolidate authority.

Morphogenesis Constitutional Continuity V8 preserves mission and authority
invariants across organizational generations. Proofs and meta-review authorize
only successor constitutional epochs; local subsystem owners remain unchanged.
