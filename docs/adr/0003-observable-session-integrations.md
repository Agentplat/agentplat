# ADR 0003: Observable session integrations remain provider-neutral

- Status: Accepted
- Date: 2026-07-15

## Context

Interactive applications need browser state, SSE consumption, audit trails,
multiple backends and operational controls around ephemeral sessions. Adding a
React runtime, OpenTelemetry SDK, database or model provider to the session
core would make the smallest public integration carry unrelated dependencies.

## Decision

- Keep `createSessionEventReducer` pure and framework-independent.
- Keep `subscribeAgentSse` in the Web-standard streaming package.
- Model audit as an optional append-only `SessionEventSink`; provide a redacting
  adapter in `@agentplat/audit`.
- Register multiple adapters/providers explicitly by platform. The framework
  does not import vendor SDKs or choose credentials/presets implicitly.
- Support hard abort, cooperative between-turn stop and timeouts. Defer
  pause/resume until a checkpoint and durable-resume contract exists.
- Expose plain numeric session metrics rather than depend on a telemetry SDK.

## Consequences

Applications can add React, OpenTelemetry, storage and vendor adapters at their
own boundary while sharing the same event and session contracts. A required
event sink fails the stream if it cannot record an event, rather than silently
claiming an auditable execution. Session records are not Room records and do
not grant Room governance semantics.
