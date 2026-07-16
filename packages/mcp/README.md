# `@agentplat/mcp`

MCP interoperability primitives for AgentPlat. The package supports the
stable `2025-11-25` protocol revision for the tool surface over Streamable
HTTP:

- `McpRemoteClient` connects to a remote MCP server and lists or calls tools.
- `McpToolImporter` makes remote MCP tools available through an AgentPlat
  `ToolRegistry`.
- `McpHttpServer` exposes a curated subset of AgentPlat tools to MCP clients.

The package deliberately does **not** resolve credentials, infer tenants, add
CORS, or permit arbitrary network destinations. Those decisions belong to the
embedding application or gateway.

## Consume remote MCP tools

```ts
import { McpRemoteClient, McpToolImporter } from '@agentplat/mcp';

const client = new McpRemoteClient({
  url: 'https://tools.example.com/mcp',
  clientInfo: { name: 'agentplat', version: '0.1.0' },
  headers: async () => ({
    authorization: `Bearer ${await tenantTokenProvider.getAccessToken()}`,
  }),
});

await new McpToolImporter({
  client,
  registry: toolRegistry,
  serverId: 'crm',
}).sync();
```

The importer namespaces each generated tool as `<serverId>.<toolName>` and
stores the original name in metadata. Register only endpoints approved by your
egress policy; a user-supplied URL must never be passed straight to the client.

## Expose AgentPlat tools

```ts
import { McpHttpServer } from '@agentplat/mcp';

const server = new McpHttpServer({
  serverInfo: { name: 'AgentPlat tools', version: '0.1.0' },
  registry: toolRegistry,
  async resolveExecutionContext(request) {
    const identity = await authenticate(request);
    if (!identity) return undefined;

    return {
      tenant: { tenantId: identity.tenantId, actor: identity.actor },
      allowedToolIds: identity.allowedToolIds,
    };
  },
});

// For example, in a Fetch-compatible route handler:
export const POST = (request: Request) => server.handle(request);
```

`resolveExecutionContext` runs before tool discovery and invocation. It must
derive the tenant from verified identity, enforce per-tenant tool allowlists,
and return `undefined` for unauthenticated requests. Keep raw provider tokens
out of tool metadata, event payloads, and Agent definitions.

## Scope

This is intentionally a small, auditable base: `initialize`, `tools/list`,
`tools/call`, and `notifications/initialized`. Resources, prompts, tasks,
OAuth discovery, and long-running agents will be added as separate extensions.
Use A2A rather than MCP when another system must own an agent task lifecycle,
artifacts, streaming progress, or human approval state.
