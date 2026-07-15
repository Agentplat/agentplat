# @agentplat/sessions

Typed, ephemeral multi-agent turn orchestration over an `AgentRuntime`. Sessions
coordinate speakers, bounded history, stopping rules, usage and one unified
event stream. They do not persist Rooms or grant tool permissions.

```ts
import { createMultiAgentSession } from '@agentplat/sessions';

const session = createMultiAgentSession({
  runtime,
  tenant: { tenantId: 'local' },
  speakers: [buyer, seller],
  maxRounds: 4,
  stopMarkers: ['DEAL AGREED'],
});

for await (const event of session.stream({ input: scenario, signal })) {
  // session_started, turn_started, token, turn_completed, stop_reason...
}
```

Use Agent Rooms when work must be durable, approval-gated or governed. An
optional session sink can record an event trail without changing the scheduler
contract.

For product-ready interactive sessions, the package also provides explicit
live-to-fallback provider switching (`fallbackPlatform`), token and
application-estimated cost guardrails, typed UI capability flags, and the
`buildScenarioInput` helper for simple form-driven scenarios. Fallbacks emit
`turn_failed` and `provider_fallback`; they are never silent.

Use `@agentplat/sessions/http` for a Fetch-compatible stop registry. Its local
`createMemorySessionRegistry({ ttlMs })` implementation cleans up idle handles,
and `handleSessionStop` accepts an authorization hook. Implement the exported
`SessionRegistry` interface to use a shared control channel such as Redis.

For browser clients, use `createSessionEventReducer` with
`subscribeAgentSse` from `@agentplat/streaming`. Sessions can also emit
append-only `SessionEventRecord` values through `eventSink`; choose
`sinkFailureMode: 'required'` to fail closed when the sink is unavailable.
