# AgentPlat MCP

**Defines:** the separation between AgentPlat MCP contracts, read-only documentation access and future runtime operations. **Status:** documentation MCP implemented; runtime MCP specified for a later release.

`@agentplat/mcp` contains reusable binding and registry contracts. `@agentplat/mcp-docs` is an optional, read-only documentation integration. The primary MCP product is `@agentplat/mcp-runtime`: a self-hosted adapter embedded with the customer's AgentPlat deployment.

The documentation server has no credentials and performs no mutation. Run it locally with:

```sh
pnpm --filter @agentplat/mcp-docs build
node packages/mcp-docs/dist/cli.js
```

Clients that support stdio MCP can launch the binary `agentplat-mcp-docs`. Set `AGENTPLAT_ROOT` when launching it outside the repository root. Runtime operations are provided by `@agentplat/mcp-runtime`, which requires tenant/room authorization, durable idempotency, audit and explicit confirmation for mutations.
