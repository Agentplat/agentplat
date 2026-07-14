# ADR 0001: Separate model I/O from agent execution

- Status: Accepted
- Date: 2026-07-14

## Context

Applications need both simple model generation and richer agent runtimes.
Requiring an agent SDK for every chat call increases adoption cost, while
reducing every agent runtime to a Chat Completions interface removes native
loops, tools, tracing and orchestration capabilities.

Provider SDKs must also remain optional so installing the Agentplat framework
does not install every supported model vendor.

## Decision

Agentplat defines three distinct layers:

1. `ModelAdapter` performs one provider-neutral generation or stream.
2. `AgentProvider` performs an agent execution strategy and may own a loop.
3. `RoomService` applies durable collaboration, governance and persistence.

`ChatAgentProvider` adapts a `ModelAdapter` to one `AgentProvider` execution.
Provider-specific packages remain separate dependencies. The high-level
`@agentplat/framework` package composes these contracts without importing a
provider implementation.

## Consequences

- Simple applications can replace a model adapter without changing Room code.
- Advanced runtimes keep provider-native behavior instead of targeting the
  lowest common denominator.
- Tool execution is not performed inside `ModelAdapter`; a governed Tool
  Gateway remains a higher-layer responsibility.
- New providers must document which optional capabilities they implement and
  must honor cancellation signals.
- Changes to any exported layer follow the fixed workspace SemVer and changelog
  policy in `RELEASING.md`.
