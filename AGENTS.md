# AgentPlat — Agent Instructions

AgentPlat is an open-source TypeScript monorepo of runtime primitives for governed multi-agent systems: Agent Rooms, Collective Runtime, Agent Mesh, inference control, memory, trust and portable execution.

## Read first

- `README.md`: project overview and quickstarts.
- `AI.md`: concise machine-oriented project map.
- `docs/ai/context.md`: detailed agent context and evidence boundaries.
- `docs/specification/agentplat-spec-v1.md`: normative vocabulary and compatibility model.
- `docs/architecture.md`: package and subsystem boundaries.

## Development

```sh
pnpm install
pnpm build
pnpm type-check
pnpm test
```

Use the smallest relevant package/example command while iterating. Preserve existing uncommitted work. Do not claim production-scale empirical validation from source code or unit tests; consult `config/collective-capability-baseline-current.json` and `docs/research/` for evidence.

## Conventions

Use canonical AgentPlat terms. Prefer existing contracts and adapters over new parallel abstractions. Keep public APIs typed, backward-compatible within the release line, and covered by tests. Changes to schemas, protocol fixtures, evidence catalogs or release checks must include their corresponding verification.

## Canonical names

AgentPlat Agent Room, AgentPlat Collaboration Protocol, AgentPlat Planner, AgentPlat Handoff, AgentPlat Collective Runtime, AgentPlat Agent Mesh, AgentPlat Inference Control and AgentPlat Evidence Boundary.

