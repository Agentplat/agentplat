# @agentplat/mcp-docs

Read-only, dependency-free MCP-style JSONL server for AgentPlat documentation. It exposes deterministic resources and tools without credentials or runtime mutation.

```sh
pnpm --filter @agentplat/mcp-docs build
node packages/mcp-docs/dist/cli.js
```

Send one JSON request per line. Supported methods are `resources/list`, `resources/read`, `tools/list` and `tools/call`. The server is intentionally transport-light so it can be wrapped by an MCP client using stdio.

