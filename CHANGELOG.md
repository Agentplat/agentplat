# Changelog

## Unreleased

## 0.2.0-beta.5 - 2026-07-15

- Added `AgentPlat.ask`, a facade-only prompt-to-text API with portable LLM
  provider presets and no runtime or adapter setup.

## 0.2.0-beta.4 - 2026-07-15

- Added SDK-free `chatModel` presets for OpenAI, Gemini, Ollama, OpenRouter
  and explicitly configured Chat Completions-compatible endpoints.

## 0.2.0-beta.3 - 2026-07-15

- Added a runnable Next.js App Router multi-agent SSE reference with browser
  cancellation and reducer-backed UI state.
- Added `subscribeAgentSse`, `createSessionEventReducer`, persona turn-input
  helpers and dependency-free session metrics.
- Added optional append-only session event sinks, including redacted audit sink
  integration with explicit best-effort or required failure behavior.
- Added neutral multi-platform runtime/framework registration and validation.
- Added session and turn timeouts plus cooperative between-turn stop control.
- Documented npm preview release channels and promotion expectations.

## 0.2.0-beta.2 - 2026-07-14

- Added `@agentplat/sessions` with deterministic multi-agent rounds, bounded
  history, stopping rules, typed orchestration events and usage aggregation.
- Added client-side SSE parsing and a Next.js App Router response helper that
  propagates `request.signal` to model execution.
- Re-exported runtime, session and SSE contract types from `@agentplat/framework`.
- Preserved normalized provider usage, finish reason, model and latency in
  completed runtime and composed session events.
- Added per-agent response and event tapes to `@agentplat/runtime-mock` for
  deterministic multi-speaker tests.

## 0.2.0-beta.1 - 2026-07-14

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
