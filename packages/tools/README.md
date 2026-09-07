# @agentplat/tools

Tool contracts for governed agent execution.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/tools@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

This package defines tool schemas, credential requirements, invocation context, tool results, handlers and registries. It helps teams expose services to agents without losing policy, identity or audit boundaries.

`InMemoryToolRegistry` is included for local development, tests and single-process runtimes.
