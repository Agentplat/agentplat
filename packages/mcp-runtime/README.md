# @agentplat/mcp-runtime

Self-hosted MCP adapter for an AgentPlat deployment. This package does not connect clients to a shared AgentPlat service: the host application creates the server with its own `RoomService`, identity resolution, authorization policy, durable idempotency store and audit sink.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/mcp-runtime@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

All mutations require an idempotency key and explicit `confirm: true`. Deploy it beside the runtime it operates; never expose it with the development identity provider in production.
