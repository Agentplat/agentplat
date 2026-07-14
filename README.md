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

> Developer preview: the contracts, local adapters and OpenAI provider are usable, but a durable workflow runner and stable APIs are still under development.

AgentPlat defines portable runtime, workflow, memory, tool, event, audit and auth boundaries for teams building agentic products. The open packages are infrastructure-neutral; hosted operations, enterprise capabilities and customer applications live outside this repository.

## Packages

| Package                      | Current public capability                                              |
| ---------------------------- | ---------------------------------------------------------------------- |
| `@agentplat/core`            | IDs, metadata, lifecycle states, tenant context, envelopes and errors. |
| `@agentplat/runtime`         | Provider contracts plus executable provider dispatch and streaming.    |
| `@agentplat/provider-openai` | OpenAI Agents SDK execution with tenant-isolated credentials.          |
| `@agentplat/workflows`       | Process/task contracts and an in-memory workflow store.                |
| `@agentplat/memory`          | Session/retrieval contracts and a tenant-isolated in-memory store.     |
| `@agentplat/tools`           | Tool contracts and an in-memory tool registry.                         |
| `@agentplat/mcp`             | MCP server, tool-binding and registry contracts.                       |
| `@agentplat/events`          | Event contracts and an in-memory event bus.                            |
| `@agentplat/audit`           | Audit contracts, recursive redaction and an in-memory sink.            |
| `@agentplat/auth`            | Auth, permission and tenant-resolution contracts with local adapters.  |

## Local example

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
corepack pnpm run example:basic
```

## Development

```sh
corepack pnpm install
corepack pnpm run check
```

`check` builds every package, type-checks the workspace, runs unit tests, validates release metadata, packs every package and installs the tarballs in an isolated consumer project.

Package versioning and publishing are documented in [RELEASING.md](./RELEASING.md).

## Open-core boundary

This repository contains the reusable runtime and extension contracts. The hosted control plane, enterprise SSO and policy management, billing, managed infrastructure, premium connectors and customer-specific verticals are proprietary products built on these public boundaries.

## License

AgentPlat open-core code is licensed under the Apache License 2.0. The AgentPlat name, logo and brand assets are covered by separate trademark guidelines.
