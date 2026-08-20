# AgentPlat MCP

**Defines:** the separation between AgentPlat MCP contracts, read-only documentation access and future runtime operations. **Status:** documentation MCP implemented; runtime MCP specified for a later release.

`@agentplat/mcp` contains reusable binding and registry contracts. `@agentplat/mcp-docs` provides a read-only JSONL server exposing canonical resources and tools such as `search_agentplat_docs`, `get_concept`, `get_spec`, `find_code_example`, `map_requirements`, `get_validation_status` and `get_citation`.

The server has no credentials and performs no mutation. Run it locally with:

```sh
pnpm --filter @agentplat/mcp-docs build
node packages/mcp-docs/dist/cli.js
```

Clients that support stdio MCP can launch the binary `agentplat-mcp-docs`. Set `AGENTPLAT_ROOT` when launching it outside the repository root. A future runtime MCP must be a separate package and enforce tenant/room authorization, idempotency, audit and explicit confirmation for mutations.

