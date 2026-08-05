<p align="center">
  <a href="https://agentplat.com">
    <img src="https://agentplat.com/assets/agentplat-logo.png" alt="AgentPlat" width="76" height="76">
  </a>
</p>

<h1 align="center">AgentPlat</h1>

<p align="center">
  <strong>Open-core runtime primitives for building governed agentic platforms.</strong>
</p>

<p align="center">
  <a href="https://agentplat.com">Website</a>
  ·
  <a href="https://doc.agentplat.com">Documentation</a>
  ·
  <a href="https://github.com/Agentplat/agentplat">GitHub</a>
  ·
  <a href="https://agentplat.com/#contact">Contact</a>
</p>

> Developer preview: Agent Rooms, Agent Mesh, inference-control, and Evidence
> and Trust boundaries are usable, but APIs may still change before the first
> stable release.

AgentPlat is a downloadable framework for building self-hosted agentic platforms around **Agent Rooms**: durable workspaces where humans and agents coordinate through messages, tasks, versioned artifacts, approvals, policies and scoped memory.

Clone this repository to run the complete reference API with Node.js and PostgreSQL, or install only the packages you need. Storage, model runtimes, event delivery, tools and authentication are public extension boundaries, so a company can keep the Room domain while replacing the surrounding infrastructure.

### Continuous Role Alignment V1

The opt-in role-alignment controller extends Inference Control across long
portable-agent sessions. It accumulates bounded coherence, uncertainty and
context-consistency signals; applies recovery hysteresis; and can reinforce,
challenge, pause, request a successor role or deny before protected actions are
released. Checkpoint handoffs preserve the content-free control history instead
of resetting it.

```js
import { createRoleAlignmentPortableAgentControlV1 } from "@agentplat/inference-control/role-alignment/portable-agent";
```

See the [implementation plan](./docs/inference-control/continuous-role-alignment-v1-implementation-plan.md),
[acceptance checklist](./docs/inference-control/continuous-role-alignment-v1-acceptance-checklist.md),
[architecture decision](./docs/adr/0015-continuous-role-alignment.md) and
[threat model](./docs/security/continuous-role-alignment-threat-model.md).

### Adaptive Role Realignment V1

The opt-in realignment controller closes a `realignment_required` state by
discovering content-free trusted-catalog candidates, filtering proposers and
evaluators through Trust, selecting deterministically, certifying the exact
digest and installing one successor role revision in Portable Agent Runtime.
Candidates can narrow the current authority ceiling but cannot widen it.

```js
import { createRoleRealignmentPortableAgentV1 } from "@agentplat/inference-control/role-realignment/portable-agent";
```

The optional Collective Agreement adapter binds certification to the current
membership epoch and Byzantine quorum. See the [integration
guide](./docs/inference-control/adaptive-role-realignment-v1.md), [architecture
decision](./docs/adr/0016-adaptive-role-realignment.md) and [threat
model](./docs/security/adaptive-role-realignment-threat-model.md).

### Certified Role Refinement V1

The opt-in refinement controller evolves the active role in place from
longitudinal evidence. Strategies produce structured, preconditioned patches;
local semantic validation and independent Trust-eligible evaluation gate one
deterministic result. A collective certificate authorizes governed catalog
publication, while provisional monitoring can confirm the revision or trigger
certified predecessor restoration and quarantine.

```js
import { createRoleRefinementPortableAgentV1 } from "@agentplat/inference-control/role-refinement/portable-agent";
```

Coordination state contains only identifiers and digests; exact instructions,
constraints and patches remain local. See the [integration
guide](./docs/inference-control/certified-role-refinement-v1.md), [architecture
decision](./docs/adr/0017-certified-role-refinement.md) and [threat
model](./docs/security/certified-role-refinement-threat-model.md).

### Evidence and Trust Alpha 4

`0.3.0-alpha.4` adds provider-neutral, deterministic Evidence lifecycle,
multidimensional Trust Profiles, exact policy-bound eligibility, contradiction,
quarantine, review and recovery in the new `@agentplat/trust` package. Explicit
Mesh and Inference Control adapters can consume authenticated current Trust
state to reduce candidates or refuse delegation; existing behavior remains
unchanged unless an application constructs those opt-in boundaries.

```sh
pnpm add @agentplat/trust@next
```

Alpha 4 does not claim universal truth, global reputation or atomic remote
revocation. Evidence remains scoped, source independence is local policy, and
full snapshots require a protector plus an external durable rollback anchor.
See the [Alpha 4 implementation plan](./docs/trust/alpha-4-implementation-plan.md),
[acceptance checklist](./docs/trust/alpha-4-acceptance-checklist.md),
[threat model](./docs/security/evidence-trust-threat-model.md) and
[design review](./docs/trust/alpha-4-design-review.md).

### Inference Control Alpha 3

`0.3.0-alpha.3` adds opt-in, provider-neutral control boundaries for model and
runtime inference, context provenance, capability negotiation, bounded
assessments, controlled output release, single-use Action Grants and outbound
messages. The public contracts fail closed when a required interception point,
assessment binding, authority generation or downstream fence is unavailable.
Existing Runtime, Model, Tools, Streaming, Sessions, Rooms, Framework and Agent
Mesh defaults remain unchanged unless an application installs the new wrapper
or gateway explicitly.

```sh
pnpm add @agentplat/inference-control@next
```

Alpha 3 provides deterministic local enforcement and at-most-one local
dispatch attempt. It does not claim universal safety, truth, immediate remote
compute cancellation, durable cross-process single use or exactly-once
external effects. See the [Alpha 3 implementation
plan](./docs/inference-control/alpha-3-implementation-plan.md), [acceptance
checklist](./docs/inference-control/alpha-3-acceptance-checklist.md), [threat
model](./docs/security/inference-control-threat-model.md) and [design review
record](./docs/inference-control/alpha-3-design-review.md).

## Packages

| Package                                     | Current public capability                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@agentplat/core`                           | IDs, metadata, lifecycle states, tenant context, envelopes and errors.               |
| `@agentplat/framework`                      | High-level composition, safe local defaults and ephemeral quick runs.                |
| `@agentplat/collective-runtime`             | Governed collectives, recovery and replicated execution checkpoints.                 |
| `@agentplat/collective-membership`          | Joint-quorum membership epochs and overlapping signing-key rotation.                 |
| `@agentplat/collective-membership-postgres` | Durable peer membership heads, votes and certificates in PostgreSQL.                 |
| `@agentplat/collective-quorum`              | Signed peer quorum plus opt-in Byzantine-resilient collective agreement.             |
| `@agentplat/collective-quorum-postgres`     | Durable peer promises, votes and certificates in PostgreSQL.                         |
| `@agentplat/collective-sync`                | Signed causal anti-entropy, catch-up certificates and readiness gates.               |
| `@agentplat/collective-sync-postgres`       | Durable causal sync and execution-checkpoint evidence in PostgreSQL.                 |
| `@agentplat/planning-artifacts`             | Signed planning artifacts with source-first and certified multi-source availability. |
| `@agentplat/planning-artifacts-postgres`    | Immutable artifact and replication-evidence persistence in PostgreSQL.               |
| `@agentplat/model`                          | Provider-neutral direct model generation and streaming contracts.                    |
| `@agentplat/model-anthropic`                | Dependency-light Anthropic Messages adapter.                                         |
| `@agentplat/model-gemini`                   | Dependency-light Gemini generateContent adapter.                                     |
| `@agentplat/model-openai-compatible`        | Dependency-light Chat Completions adapter for compatible servers.                    |
| `@agentplat/rooms`                          | Agent Room domain, lifecycle, policy, context and repository contracts.              |
| `@agentplat/rooms-postgres`                 | Durable PostgreSQL repository, migrations and transactional events.                  |
| `@agentplat/postgres`                       | Shared pool health, schema safety and versioned migration primitives.                |
| `@agentplat/audit-postgres`                 | PostgreSQL audit and Session event sinks without Agent Rooms.                        |
| `@agentplat/rooms-api`                      | Injectable Hono REST API for the Agent Room lifecycle.                               |
| `@agentplat/runtime`                        | Provider contracts plus executable provider dispatch and streaming.                  |
| `@agentplat/runtime-mock`                   | Deterministic, network-free provider for examples and tests.                         |
| `@agentplat/sessions`                       | Typed, bounded multi-agent turn orchestration over the public runtime.               |
| `@agentplat/sessions-redis`                 | Redis pub/sub control for Sessions across service instances.                         |
| `@agentplat/streaming`                      | Versioned SSE server helpers, parser and thin browser subscription API.              |
| `@agentplat/provider-openai`                | OpenAI Agents SDK execution with tenant-isolated credentials.                        |
| `@agentplat/workflows`                      | Process/task contracts and an in-memory workflow store.                              |
| `@agentplat/memory`                         | Session/retrieval contracts and a tenant-isolated in-memory store.                   |
| `@agentplat/inference-control`              | Inference gates plus longitudinal role-alignment and handoff control.                |
| `@agentplat/trust`                          | Scoped Evidence, deterministic Profiles, eligibility and quarantine.                 |
| `@agentplat/mesh`                           | Bounded peer coordination, allocation, leases, fencing and recovery.                 |
| `@agentplat/mesh-crypto`                    | SHA-256 and Ed25519 signing, verification and bounded key resolution.                |
| `@agentplat/mesh-protocol`                  | Strict bounded wire parsing, validation and conformance fixtures.                    |
| `@agentplat/mesh-sim`                       | Versioned faults, snapshots, invariants, trace digests and replay.                   |
| `@agentplat/mesh-sim-local`                 | Node-local immutable campaign artifacts, slot commits and locks.                     |
| `@agentplat/mesh-sim-postgres`              | Cross-host campaign custody with transactional leases and fencing.                   |
| `@agentplat/tools`                          | Tool contracts and an in-memory tool registry.                                       |
| `@agentplat/mcp`                            | MCP server, tool-binding and registry contracts.                                     |
| `@agentplat/events`                         | Event contracts and an in-memory event bus.                                          |
| `@agentplat/audit`                          | Audit contracts, recursive redaction and an in-memory sink.                          |
| `@agentplat/auth`                           | Auth, permission and tenant-resolution contracts with local adapters.                |

## Agent Room quickstart

Requirements: Docker Engine with Compose v2, plus `curl` and `jq` for the demo.

```sh
git clone https://github.com/Agentplat/agentplat.git
cd agentplat/examples/rooms-api
cp .env.example .env
docker compose up --build -d
bash scripts/demo.sh
```

Compose starts PostgreSQL, applies the public migration and launches the Hono API. The demo exercises the complete flow from Room creation through agent execution, artifact approval and archival. See the [reference application](./examples/rooms-api/README.md) for configuration and the [Agent Rooms guide](./docs/agent-rooms.md) for architecture and extension points.

Except for `GET /health`, the reference API requires `X-Agentplat-Tenant-Id`. This is a trusted local/self-hosted boundary, not end-user authentication. Internet-facing deployments must inject an authenticator that derives the tenant from a verified identity.

## Use as packages

For a single prompt, only import the facade:

```js
import { AgentPlat } from "@agentplat/framework";

const answer = await AgentPlat.ask({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4.1-mini",
  prompt: "Draft a launch message.",
});
```

`ask` returns plain text. Change the provider to `gemini`, `ollama` or
`openrouter`; use `compatible` with an explicit `baseURL` for another Chat
Completions endpoint.

To reuse the same configuration for advanced execution, streaming, and
multi-agent sessions, create it once with `AgentPlat.configure({...})`; see
the [`@agentplat/framework` guide](./packages/framework/README.md).

For a direct, ephemeral model call with no Room persistence:

```js
import { AgentPlat } from "@agentplat/framework";
import { chatModel } from "@agentplat/model-openai-compatible";

const result = await AgentPlat.quickRun({
  adapter: chatModel({
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_MODEL,
  }),
  instructions: "Be concise.",
  input: "Draft a launch message.",
});
```

The same `chatModel` factory has presets for `gemini`, `ollama` and
`openrouter`, plus `compatible` for any Chat Completions endpoint. See the
[model adapter guide](./packages/model-openai-compatible/README.md) for the
one-line provider changes and how to bring a non-compatible LLM through the
public `ModelAdapter` interface.

`quickRun` is intentionally not a shortcut around Room governance. Use the
Room service and PostgreSQL adapter when the work must be persistent,
auditable or approval-gated. See [portable execution](./docs/portable-execution.md)
for the model/runtime layering and Next.js or Express streaming examples.
For simulations and debates, see [multi-agent sessions](./docs/multi-agent-sessions.md).
The runnable [Next.js SSE reference](./examples/next-multi-agent-sse/README.md)
shows the complete server and browser integration path.

For an AWS deployment that reuses an existing RDS/Aurora cluster, Redis and
Secrets Manager or IAM database auth, see
[Bring your own PostgreSQL on AWS](./docs/bring-your-own-postgres-aws.md). The
path does not require DynamoDB or the Agent Rooms schema.

### npm from a fork or monorepo

When developing inside a pnpm workspace that also contains older AgentPlat
source packages, explicitly select the registry preview instead of resolving a
local workspace package: `pnpm add @agentplat/framework@next`. With npm alias
syntax, use `npm:@agentplat/framework@0.3.0-alpha.4` where a tool requires an
explicit registry target.

The low-level runtime registry remains available when an application wants
full control:

```js
import { DefaultAgentRuntime } from "@agentplat/runtime";

const runtime = new DefaultAgentRuntime();
runtime.registerProvider("local", {
  async run(_agent, input) {
    return { status: "completed", output: `local:${input.input}` };
  },
});

const agent = {
  id: "example-agent",
  tenantId: "example-tenant",
  name: "Local example",
  platform: "local",
};

const result = await runtime.run(
  agent,
  { input: "hello open core" },
  { tenant: { tenantId: agent.tenantId }, agentId: agent.id },
);
```

Run the checked-in example:

```sh
corepack pnpm install
corepack pnpm run example:quick
corepack pnpm run example:basic
corepack pnpm run example:sessions
corepack pnpm run example:collective
corepack pnpm run example:role-alignment
corepack pnpm run example:role-refinement
```

## Development

```sh
corepack pnpm install
corepack pnpm run check
```

`check` audits the checkout, removes stale build output, rebuilds every package,
audits the built tree, type-checks the workspace, runs unit tests and validates
release metadata. It then audits every package tarball, imports every declared
export from a package-isolated consumer, compiles packed TypeScript
declarations, runs the signed three-peer Mesh scenario and preserves the
aggregate functional smoke test. It also executes a clean Trust consumer across
the Trust root plus the explicit Mesh and Inference Control Trust subpaths, and
verifies the versioned 27-scenario Alpha 4 adversarial catalog.

The intentional publication allowlist is
[`config/public-packages.json`](./config/public-packages.json). Release,
versioning and pack-smoke scripts consume this same catalog so adding a
workspace directory cannot publish a package accidentally.

Package versioning and publishing are documented in [RELEASING.md](./RELEASING.md).
See [release channels](./docs/release-channels.md) for `next` versus `latest`.

## Open-core boundary

This repository contains everything needed to build and self-host an Agent Room platform; public code does not depend on AgentPlat Cloud or private packages. Hosted operations, enterprise SSO and organization-wide policy management, billing, managed infrastructure, premium connectors, advanced analytics and customer-specific verticals remain commercial products built on the same public contracts.

## License

AgentPlat open-core code is licensed under the [Apache License 2.0](./LICENSE). The AgentPlat name, logo and brand assets are covered by the [trademark guidelines](./TRADEMARKS.md).
