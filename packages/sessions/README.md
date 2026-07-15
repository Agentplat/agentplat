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

Use Agent Rooms when work must be durable, approval-gated or governed. A future
session sink can bridge this ephemeral event stream into Room audit without
changing the scheduler contract.
