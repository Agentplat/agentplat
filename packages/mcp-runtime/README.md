# @agentplat/mcp-runtime

Self-hosted MCP adapter for an AgentPlat deployment. This package does not connect clients to a shared AgentPlat service: the host application creates the server with its own `RoomService`, identity resolution, authorization policy, durable idempotency store and audit sink.

All mutations require an idempotency key and explicit `confirm: true`. Deploy it beside the runtime it operates; never expose it with the development identity provider in production.

