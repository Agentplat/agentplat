# @agentplat/mcp-docs

Read-only MCP server for AgentPlat documentation using the official Model Context Protocol SDK. It exposes deterministic resources and tools without credentials or runtime mutation.

```sh
pnpm --filter @agentplat/mcp-docs build
node packages/mcp-docs/dist/cli.js
```

The CLI speaks the official MCP stdio transport and can be configured directly in clients such as Claude Code, Codex or Cursor:

```json
{"mcpServers":{"agentplat-docs":{"command":"agentplat-mcp-docs","env":{"AGENTPLAT_ROOT":"/path/to/agentplat"}}}}
```
