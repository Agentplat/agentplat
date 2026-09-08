# @agentplat/mcp-docs

Read-only MCP server for AgentPlat documentation using the official Model Context Protocol SDK. It exposes deterministic resources and tools without credentials or runtime mutation.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/mcp-docs@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

```sh
pnpm --filter @agentplat/mcp-docs build
node packages/mcp-docs/dist/cli.js
```

The CLI speaks the official MCP stdio transport and can be configured directly in clients such as Claude Code, Codex or Cursor:

```json
{
  "mcpServers": {
    "agentplat-docs": {
      "command": "agentplat-mcp-docs",
      "env": { "AGENTPLAT_ROOT": "/path/to/agentplat" }
    }
  }
}
```
