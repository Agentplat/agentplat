# Changelog

## Unreleased

- Added `@agentplat/model`, a provider-neutral direct model generation and streaming contract below the agent runtime layer.
- Added `@agentplat/model-openai-compatible`, a dependency-light Chat Completions adapter for OpenAI-compatible HTTP servers.
- Added `@agentplat/framework` with `createAgentplat`, ephemeral `quickRun`, streaming and optional Agent Room service composition.
- Added `@agentplat/streaming` with versioned SSE envelopes for Fetch-compatible and Express-style HTTP responses.
- Extended `@agentplat/runtime-mock` with ordered responses, scripted stream events, token chunks, delays and deterministic failures.
- Added `@agentplat/rooms`, the infrastructure-neutral Agent Room domain with subrooms, participants, messages, tasks, versioned artifacts, approvals, policies, scoped memory, bounded context and durable events.
- Added `@agentplat/rooms-postgres`, including tenant-qualified persistence, transactional event storage and public PostgreSQL migrations.
- Added `@agentplat/rooms-api`, an injectable Hono API with trusted-header development tenancy and replaceable authentication.
- Added `@agentplat/runtime-mock` for deterministic, network-free Room execution.
- Added a Docker Compose reference application and end-to-end Room lifecycle demo under `examples/rooms-api`.

## 0.1.0

Initial developer preview of the public AgentPlat open core:

- Provider-neutral runtime contracts and executable dispatch.
- OpenAI Agents SDK provider with execution-scoped credentials.
- Local auth, tools, memory, workflows, events and audit adapters.
- MCP contracts, release verification and isolated package smoke tests.
