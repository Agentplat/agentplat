# AgentPlat Framework Package Reference

Framework packages provide public, provider-neutral contracts and adapters.
Production hosts remain responsible for authentication, tenant resolution and
network policy when mounting protocol adapters.

## Package Graph

```text
@agentplat/core
  @agentplat/auth
  @agentplat/events
  @agentplat/audit
  @agentplat/tools
    @agentplat/mcp
    @agentplat/a2a
      @agentplat/interop
  @agentplat/memory
  @agentplat/workflows
    @agentplat/runtime
  @agentplat/cli
```

## Packages

### `@agentplat/core`

Foundational contracts shared by all framework packages:

- Tenant and actor context.
- Resource IDs and references.
- Lifecycle statuses.
- API result and pagination envelopes.
- Common metadata.
- Framework errors.

### `@agentplat/auth`

Authentication and authorization contracts:

- Auth context.
- Permission and scope model.
- Tenant resolver interface.
- Auth provider and verifier interfaces.

Production Cognito/API-key behavior remains in the Go API until an adapter is introduced and tested.

### `@agentplat/events`

Event contracts:

- Event envelope.
- Publisher and subscriber interfaces.
- Webhook sink interface.
- Event bus abstraction.

### `@agentplat/audit`

Audit contracts:

- Audit record model.
- Audit sink interface.
- Redaction helper.
- Audit action metadata.

### `@agentplat/tools`

Tool contracts:

- Tool definition.
- JSON-schema-like parameter contract.
- Tool registry interface.
- Credential requirement metadata.
- Tool invocation context and result.

### `@agentplat/mcp`

Experimental MCP tool interoperability:

- Streamable HTTP MCP client (`initialize`, `tools/list`, `tools/call`).
- Remote-tool importer for an AgentPlat `ToolRegistry`.
- Fetch-compatible MCP server for an allowlisted subset of AgentPlat tools.
- MCP server definition, tool binding and registry interfaces.

Authentication, tenant resolution, OAuth token acquisition, CORS and network
egress policy remain owned by the embedding host.

### `@agentplat/a2a`

Experimental A2A v1 HTTP+JSON interoperability:

- Agent Card discovery and compatible-interface selection.
- A remote A2A agent adapter for `AgentRuntime`.
- Fetch-compatible Agent Card, message, SSE stream and task endpoint adapter.
- Tenant-scoped in-memory event store plus a `WorkflowStore` persistence adapter.

Signed Agent Cards, push notifications and legacy v0.3 compatibility are not
included yet.

### `@agentplat/interop`

Framework-neutral Fetch handler that mounts MCP and A2A under explicit paths.
It does not handle authentication or policy; those stay in the supplied MCP/A2A
server resolvers. See [the host integration guide](host-integration.md).

### `@agentplat/memory`

Memory and knowledge contracts:

- Session and message models.
- Memory store interface.
- Knowledge source and document reference contracts.
- Vector store reference.
- Retriever interface.

### `@agentplat/workflows`

Workflow contracts:

- Task definition and task run.
- Process definition and process run.
- Stage state.
- Artifact contract.
- Workflow store and runner interfaces.

### `@agentplat/runtime`

Agent runtime contracts:

- Agent definition.
- Runtime execution context.
- Agent provider interface.
- Agent runtime interface.
- Streaming event contract.
- Agent run result.

### `@agentplat/cli`

Future CLI contracts:

- Command names.
- Command context.
- Command result.

The CLI package is intentionally minimal until scaffolding commands are implemented.
