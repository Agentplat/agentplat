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

> Developer preview: Agent Rooms, local adapters and provider contracts are usable, but APIs may still change before the first stable release.

AgentPlat is a downloadable framework for building self-hosted agentic platforms around **Agent Rooms**: durable workspaces where humans and agents coordinate through messages, tasks, versioned artifacts, approvals, policies and scoped memory.

Clone this repository to run the complete reference API with Node.js and PostgreSQL, or install only the packages you need. Storage, model runtimes, event delivery, tools and authentication are public extension boundaries, so a company can keep the Room domain while replacing the surrounding infrastructure.

## Packages

| Package                              | Current public capability                                               |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `@agentplat/core`                    | IDs, metadata, lifecycle states, tenant context, envelopes and errors.  |
| `@agentplat/framework`               | High-level composition, safe local defaults and ephemeral quick runs.   |
| `@agentplat/model`                   | Provider-neutral direct model generation and streaming contracts.       |
| `@agentplat/model-openai-compatible` | Dependency-light Chat Completions adapter for compatible servers.       |
| `@agentplat/rooms`                   | Agent Room domain, lifecycle, policy, context and repository contracts. |
| `@agentplat/rooms-postgres`          | Durable PostgreSQL repository, migrations and transactional events.     |
| `@agentplat/rooms-api`               | Injectable Hono REST API for the Agent Room lifecycle.                  |
| `@agentplat/runtime`                 | Provider contracts plus executable provider dispatch and streaming.     |
| `@agentplat/runtime-mock`            | Deterministic, network-free provider for examples and tests.            |
| `@agentplat/sessions`                | Typed, bounded multi-agent turn orchestration over the public runtime.  |
| `@agentplat/streaming`               | Versioned SSE server helpers, parser and thin browser subscription API. |
| `@agentplat/provider-openai`         | OpenAI Agents SDK execution with tenant-isolated credentials.           |
| `@agentplat/workflows`               | Process/task contracts and an in-memory workflow store.                 |
| `@agentplat/memory`                  | Session/retrieval contracts and a tenant-isolated in-memory store.      |
| `@agentplat/tools`                   | Tool contracts and an in-memory tool registry.                          |
| `@agentplat/mcp`                     | MCP server, tool-binding and registry contracts.                        |
| `@agentplat/events`                  | Event contracts and an in-memory event bus.                             |
| `@agentplat/audit`                   | Audit contracts, recursive redaction and an in-memory sink.             |
| `@agentplat/auth`                    | Auth, permission and tenant-resolution contracts with local adapters.   |

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
import { AgentPlat } from '@agentplat/framework';

const answer = await AgentPlat.ask({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4.1-mini',
  prompt: 'Draft a launch message.',
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
import { AgentPlat } from '@agentplat/framework';
import { chatModel } from '@agentplat/model-openai-compatible';

const result = await AgentPlat.quickRun({
  adapter: chatModel({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_MODEL,
  }),
  instructions: 'Be concise.',
  input: 'Draft a launch message.',
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

### npm from a fork or monorepo

When developing inside a pnpm workspace that also contains older AgentPlat
source packages, explicitly select the registry preview instead of resolving a
local workspace package: `pnpm add @agentplat/framework@next`. With npm alias
syntax, use `npm:@agentplat/framework@0.2.0-beta.9` where a tool requires an
explicit registry target.

The low-level runtime registry remains available when an application wants
full control:

```js
import { DefaultAgentRuntime } from '@agentplat/runtime';

const runtime = new DefaultAgentRuntime();
runtime.registerProvider('local', {
  async run(_agent, input) {
    return { status: 'completed', output: `local:${input.input}` };
  },
});

const agent = {
  id: 'example-agent',
  tenantId: 'example-tenant',
  name: 'Local example',
  platform: 'local',
};

const result = await runtime.run(
  agent,
  { input: 'hello open core' },
  { tenant: { tenantId: agent.tenantId }, agentId: agent.id }
);
```

Run the checked-in example:

```sh
corepack pnpm install
corepack pnpm run example:quick
corepack pnpm run example:basic
corepack pnpm run example:sessions
```

## Development

```sh
corepack pnpm install
corepack pnpm run check
```

`check` builds every package, type-checks the workspace, runs unit tests, validates release metadata, packs every package and installs the tarballs in an isolated consumer project.

Package versioning and publishing are documented in [RELEASING.md](./RELEASING.md).
See [release channels](./docs/release-channels.md) for `next` versus `latest`.

## Open-core boundary

This repository contains everything needed to build and self-host an Agent Room platform; public code does not depend on AgentPlat Cloud or private packages. Hosted operations, enterprise SSO and organization-wide policy management, billing, managed infrastructure, premium connectors, advanced analytics and customer-specific verticals remain commercial products built on the same public contracts.

## License

AgentPlat open-core code is licensed under the [Apache License 2.0](./LICENSE). The AgentPlat name, logo and brand assets are covered by the [trademark guidelines](./TRADEMARKS.md).
