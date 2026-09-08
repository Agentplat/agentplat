<p align="center"><a href="https://agentplat.com"><img src="https://agentplat.com/assets/agentplat-logo.png" alt="AgentPlat" width="76" height="76"></a></p>

# AgentPlat

**Build applications where humans and agents work together, with persistent state, approvals, and controlled execution on your own infrastructure.**

AgentPlat is an open-source TypeScript framework for persistent human-agent collaboration, with shared artifacts, human approvals and controlled execution on your infrastructure. AgentPlat Agent Rooms give your application participants, messages, tasks, versioned artifacts and human contributions. Apache-2.0 licensed public adapters let you choose models, storage and execution infrastructure.

[Website](https://agentplat.com) · [Documentation](https://doc.agentplat.com) · [GitHub](https://github.com/Agentplat/agentplat)

> Developer preview: APIs may change between prereleases. Implementation, distribution and operational evidence are separate. See [component maturity](docs/component-maturity.md).

## A concrete use case

Build an internal proposal workflow: one agent researches, another drafts, and a person requests changes and approves the result. Persist the artifacts and decisions, then recover interrupted coordination using the same work identities.

AgentPlat supplies the work model and integration boundaries. Your application supplies business logic, UI, verified identity, policy and external connectors. Hosting and model usage remain your responsibility.

## First execution

Requirements: Node.js 22.13+, pnpm (via Corepack), and Git. This example needs no model key, database or external inference.

```sh
git clone https://github.com/Agentplat/agentplat.git
cd agentplat
corepack pnpm install --frozen-lockfile
corepack pnpm run example:quick
```

Expected output: `Hello from the deterministic AgentPlat quick run.` This execution is ephemeral; it does not persist a Room or enforce Room approvals.

[Connect a real model](docs/getting-started/first-execution.md) when you are ready to make explicit provider calls.

## Choose your next step

[When to use AgentPlat and alternatives](docs/when-to-use-agentplat.md) · [Evidence for adopters](docs/evidence-for-adopters.md)

| Need                                                  | Start here                                                                                   | Infrastructure                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| A model call or bounded session                       | [First execution](docs/getting-started/first-execution.md)                                   | Node.js; model endpoint optional    |
| Internal platforms with durable work and human review | **[Persistent human-agent collaboration](docs/getting-started/persistent-collaboration.md)** | PostgreSQL; Docker or local Node.js |
| Coordination between independent agent processes      | [Distributed coordination](docs/getting-started/distributed-coordination.md)                 | PostgreSQL and local HTTP peers     |

For the recommended collaboration path:

```sh
cd examples/rooms-api
cp .env.example .env
docker compose up --build -d
node scripts/proposal-demo.mjs
```

The guided demo prints the Room ID, research and proposal artifacts, a human revision decision, the approved version and event history. The default provider is deterministic and makes no external model calls.

## Architecture

```text
Agent Rooms → Collective Runtime → Agent Mesh
persistent    planning and         authenticated
human work    coordination         peer coordination
        ↘ policy, trust, inference controls and audit ↙
                  replaceable adapters
```

Use only the layers your application needs. PostgreSQL, model runtimes, event delivery, tools and authentication are public integration boundaries.

[A2A and Agent Registry integration](docs/interop/a2a-agent-registry.md) · [Architecture](docs/architecture.md) · [Advanced capability catalog](docs/capability-catalog.md) · [Specification](docs/specification/agentplat-spec-v1.md) · [Package facade](packages/framework/README.md)

## Maturity and integration guarantees

Use the [component maturity matrix](docs/component-maturity.md) to distinguish source availability, distribution checks, integration tests and bounded operational evidence. Consult [release channels](docs/release-channels.md) before selecting npm versions.

Controls must be connected to the execution path. Protected action checkpoints are opt-in in the current library release. External effect idempotency and verified identity remain application responsibilities. Follow the [integration guide](docs/getting-started/integration-controls.md).

No source-completion or simulator result implies general production readiness. The [AgentPlat Evidence Boundary](docs/research/README.md) preserves those distinctions.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) for a first contribution, adapter example and focused checks.

```sh
corepack pnpm run build
corepack pnpm run type-check
corepack pnpm run test:unit
corepack pnpm run check
```

Coding agents: read [AGENTS.md](AGENTS.md), [AI.md](AI.md) and [detailed context](docs/ai/context.md). Public distribution uses the [package allowlist](config/public-packages.json).

## License and attribution

Code: [Apache-2.0](LICENSE). Brand assets: [trademark guidelines](TRADEMARKS.md).
Technical architecture designed by [Grishen](https://grishen.com/). Agent Rooms originated in Douglas Rodriguez's [conceptual framework paper](https://doi.org/10.5281/zenodo.20564834).

<!-- Preserve historical README fragment destinations; advanced material lives in the catalog. -->

<a id="architecture-at-a-glance"></a>
<a id="agent-readable-project-context"></a>
<a id="long-horizon-context-integrity-v1"></a>
<a id="continuous-role-alignment-v1"></a>
<a id="adaptive-role-realignment-v1"></a>
<a id="collective-trust-consensus-v1"></a>
<a id="sparse-collective-scale-v2"></a>
<a id="distributed-collective-runtime-and-interoperability"></a>
<a id="capability-state-fusion-v1"></a>
<a id="bounded-local-strategy-adaptation-v1"></a>
<a id="peer-to-peer-strategy-evidence-exchange-v1"></a>
<a id="decentralized-strategy-convergence-and-stability-v1"></a>
<a id="dynamic-team-formation-and-joint-work-contracts-v1"></a>
<a id="autonomous-team-execution-and-causal-replanning-v1"></a>
<a id="team-execution-ownership-continuity-v1"></a>
<a id="outcome-driven-team-structure-adaptation-v1"></a>
<a id="integrated-collective-peer-host-v1"></a>
<a id="certified-collective-decision-plane-v1"></a>
<a id="mechanism-aware-mission-allocation-v1"></a>
<a id="integrated-coordination-control-loop-v1"></a>
<a id="governed-autonomous-mission-lifecycle-v1"></a>
<a id="agent-morphogenesis-v1"></a>
<a id="heterogeneous-inference-intervention-sdk-v1"></a>
<a id="sharded-simulation-and-scale-interoperability-v1"></a>
<a id="replicated-mission-lifecycle-continuity-v1"></a>
<a id="governed-adaptive-sparse-overlay-v1"></a>
<a id="heterogeneous-assessor-ensemble-v1"></a>
<a id="attested-mission-control-continuity-v1"></a>
<a id="multi-domain-environment-adapter-kit-v1"></a>
<a id="verified-benchmark-registry-and-leaderboard-v1"></a>
<a id="evidence-and-trust-alpha-4"></a>
<a id="inference-control-alpha-3"></a>
<a id="packages"></a>
<a id="agent-room-quickstart"></a>
<a id="use-as-packages"></a>
<a id="npm-from-a-fork-or-monorepo"></a>
<a id="development"></a>
<a id="open-source-deployment-boundary"></a>
<a id="license"></a>

[Open the relocated capability and package catalog](docs/capability-catalog.md).
