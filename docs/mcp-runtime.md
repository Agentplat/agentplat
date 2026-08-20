# AgentPlat MCP Runtime

**Defines:** the self-hosted MCP adapter boundary for an AgentPlat deployment. **Status:** implemented reference adapter; production identity, authorization and durable idempotency storage are deployment responsibilities.

`@agentplat/mcp-runtime` is embedded beside a user's AgentPlat runtime. It is not a hosted AgentPlat control plane and does not connect MCP clients to other tenants. The host supplies its `RoomService`, authenticated tenant/actor principal, authorization implementation, durable `IdempotencyStore` and `AuditSink`.

Mutating tools (`create_room`, `send_message`, `create_task`, `submit_artifact`, `request_approval`) require `confirm: true` and an idempotency key. Read tools are separately authorized and all invocations are written to the supplied audit sink. Do not use `InMemoryIdempotencyStore` in production.

