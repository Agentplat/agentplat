# @agentplat/core

Foundational TypeScript primitives for AgentPlat.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/core@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

This package defines the shared language used across the framework: IDs, JSON values, metadata, lifecycle states, tenant context, actors, resource references, pagination envelopes and typed errors.

Use it when building AgentPlat-compatible runtimes, workflow stores, tools, adapters or API surfaces.
