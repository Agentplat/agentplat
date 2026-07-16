# `@agentplat/interop`

Fetch-compatible mount helper for the AgentPlat MCP and A2A servers. It only
routes protocol traffic; authentication, tenant resolution and authorization
remain in each server configuration.

```ts
const handleInterop = createInteroperabilityHandler({
  mcp: { path: '/interop/mcp', server: mcpServer },
  a2a: { path: '/interop/a2a', server: a2aServer },
});

// Next.js route, Hono, Lambda/Web adapter, or any Request/Response runtime:
const response = await handleInterop(request);
```

Configure `A2AHttpServer` with the same `basePath` as the A2A route. This
publishes the Agent Card at
`/interop/a2a/.well-known/agent-card.json`.
