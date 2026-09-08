# @agentplat/memory

Memory and retrieval contracts for scoped agent context.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/memory@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

This package defines sessions, messages, knowledge sources, vector-store references, retrieval results and retriever interfaces. It is designed for tenant-aware memory systems where context boundaries are explicit.

`InMemoryMemoryStore` provides an isolated local adapter and rejects cross-tenant session access.
