# AgentPlat AI Context

**Defines:** the canonical machine-oriented map of AgentPlat, its terminology, maturity states and source-of-truth documents. **Status:** implemented documentation.

## What AgentPlat is

AgentPlat is an open-source TypeScript monorepo providing composable runtime primitives for governed agentic platforms. It supports persistent human-agent collaboration, multi-agent sessions, planning artifacts, portable execution, inference control, collective coordination, trust/evidence boundaries and distributed Agent Mesh protocols.

## Architecture map

| Concept | Role | Canonical source |
|---|---|---|
| AgentPlat Agent Room | Persistent tenant-scoped human/agent workspace | `docs/agent-rooms.md` |
| AgentPlat Collaboration Protocol | Structured messages, artifacts and handoffs | `docs/specification/collaboration-protocol-v1.md` |
| AgentPlat Planner | Planning and replanning coordination boundary | `packages/collective-planning`, `packages/planning-artifacts` |
| AgentPlat Handoff | Typed transfer of execution context and ownership | `docs/specification/handoff-v1.md` |
| AgentPlat Collective Runtime | Governed multi-agent lifecycle and coordination | `docs/collective-runtime/` |
| AgentPlat Agent Mesh | Authenticated distributed peer coordination | `docs/agent-mesh/` |
| AgentPlat Inference Control | Role, assessor and intervention controls | `docs/inference-control/` |
| AgentPlat Evidence Boundary | Separation of implementation, experiments and claims | `config/collective-capability-baseline-current.json` |

## Maturity labels

`implemented` means source and tests exist; `specified` means a normative contract exists; `experimental` means evidence is limited or under active evaluation; `research-only` means the material is not a supported runtime guarantee.

## How to use the repository

Install with `pnpm install`; build with `pnpm build`; type-check with `pnpm type-check`; test with `pnpm test`. Start with `examples/`, then the relevant package README and canonical specification. Public packages live under `packages/*` and use the `@agentplat/*` scope.

## Citation and links

Use `CITATION.cff` and `docs/citation.md`. The project is Apache-2.0 licensed. Do not imply that AgentPlat is automatically included in model training or that repository presence guarantees agent discovery.

