# MCP + A2A Host Integration Guide

`@agentplat/interop` is intentionally the final transport mount point, not an
application framework. It works in any environment that converts an HTTP
request to the standard Web `Request` and returns a Web `Response`.

## Minimal mount

```ts
import { createInteroperabilityHandler } from '@agentplat/interop';

const a2aServer = new A2AHttpServer({
  basePath: '/interop/a2a',
  card: a2aCard,
  runtime,
  resolveExecutionContext,
  resolveAgent,
  taskStore,
});

const handleInterop = createInteroperabilityHandler({
  mcp: { path: '/interop/mcp', server: mcpServer },
  a2a: { path: '/interop/a2a', server: a2aServer },
});
```

Mount `handleInterop(request)` inside the host's existing route mechanism. The
A2A Agent Card is then available at
`GET /interop/a2a/.well-known/agent-card.json`; MCP receives `POST
/interop/mcp`.

## Host-owned responsibilities

The host supplies the only application-specific pieces:

- Resolve identity from the existing verified session/JWT/workload identity.
- Derive `tenantId` from that identity, never from an MCP or A2A request field.
- Apply tenant-specific MCP tool allowlists and select permitted A2A agents.
- Issue short-lived outbound credentials in the remote-client header callback.
- Apply the normal gateway limits: rate limiting, request-size limits, WAF,
  CORS (if browser access is intended), logging and tracing.
- Use a shared `A2ATaskEventStore` when A2A task subscriptions span instances.

## Pre-release checklist

- Verify unauthenticated MCP/A2A operations return no tool or agent metadata.
- Verify a tenant cannot request another tenant through an A2A `tenant` field.
- Exercise `message:send`, `message:stream`, task retrieval/cancellation and
  reconnecting task subscriptions through the deployed gateway.
- Test MCP `initialize`, `tools/list` and `tools/call` with an allowlisted and
  a denied tool.
- Keep remote MCP/A2A URLs in controlled integration configuration; do not
  accept a caller-supplied endpoint.
