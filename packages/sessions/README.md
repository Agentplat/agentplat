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

For browser clients, use `createSessionEventReducer` with
`subscribeAgentSse` from `@agentplat/streaming`. Sessions can also emit
append-only `SessionEventRecord` values through `eventSink`; choose
`sinkFailureMode: 'required'` to fail closed when the sink is unavailable.
