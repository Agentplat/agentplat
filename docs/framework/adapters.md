# AgentPlat Framework Adapter Plan

Adapters let the framework contracts run against different infrastructure without changing the contracts. During the first migration phases, production adapters remain inside the existing AgentPlat app/API and are not moved into public packages.

## Adapter Categories

- Auth adapters: Cognito JWT, AgentPlat API key, custom JWT, development auth.
- Storage adapters: DynamoDB, PostgreSQL, S3, in-memory.
- Runtime adapters: OpenAI Agents SDK Lambda, direct OpenAI provider, mock provider.
- Workflow adapters: DynamoDB process/task store, in-memory workflow store.
- Event adapters: EventBridge/SQS, webhook, in-memory event bus.
- Audit adapters: DynamoDB audit log, PostgreSQL audit log, console/test sink.
- MCP adapters: Streamable HTTP client/server tool bridge, server registry and tool bindings.
- A2A adapters: A2A v1 remote agent provider, Agent Card endpoint and
  HTTP+JSON task adapter over the runtime/workflow contracts.

## Initial Adapter Policy

- Keep production AWS adapters in `apps/agentplat/api` until route and behavior tests are stable.
- Add package-level interfaces first.
- Add in-memory test adapters before public AWS adapters.
- Avoid leaking production environment variable names into public adapter APIs.

## MCP Experimental Baseline

`@agentplat/mcp` now provides a dependency-light MCP `2025-11-25` tools
bridge. It can import an allowlisted remote server into a `ToolRegistry`, or
serve a curated subset of registry tools through a Fetch-compatible endpoint.

- The host must provide authentication and tenant resolution before discovery
  or invocation.
- Tool allowlists are per resolved execution context, never inferred from a
  caller-provided tenant header.
- Remote endpoints and bearer tokens are host-owned; the bridge must not
  accept arbitrary user-controlled URLs or persist raw credentials.
- Resources, prompts, tasks, OAuth discovery and legacy SSE transport are
  intentionally out of this first executable increment.

## A2A Experimental Baseline

`@agentplat/a2a` is a separate package rather than an MCP extension. It
implements an `AgentProvider` for remote A2A agents and exposes selected
AgentPlat agents through A2A v1 Agent Cards and HTTP+JSON endpoints.

The implementation expands the runtime/workflow boundary with structured
inputs, cooperative cancellation, non-terminal run states and A2A v1 SSE
streams (`message:stream`, `tasks/{id}:subscribe`). `WorkflowA2ATaskStore`
persists task snapshots through the existing workflow store; a shared
`A2ATaskEventStore` is required to fan out subscriptions across instances.

The next A2A increment must preserve the remaining protocol features without
loss:

- `runId` maps to a remote task ID and supports pending, cancellation and
  resume states.
- `conversationId`/Room maps to A2A context.
- artifacts, typed parts, streaming progress and approval/input-required
  states remain structured rather than being flattened to text.
- tenant identity is derived from verified OAuth/OIDC or workload identity;
  signed Agent Cards establish integrity but do not grant authorization.

## Production Compatibility Requirements

Any production adapter must preserve:

- Existing DynamoDB key formats.
- Existing auth context fields and tenant resolution.
- Existing v2 process/task statuses.
- Existing artifact metadata and storage references.
- Existing error and response behavior at API route boundaries.

## Public Release Readiness

Before publishing adapters publicly:

- Add install and smoke tests using packed packages.
- Confirm no customer-specific constants, tenants, prompts, or secrets are included.
- Document required permissions and environment variables.
- Provide a local/mock path for users without AWS infrastructure.
