# @agentplat/framework

High-level composition for applications that want a short path to AgentPlat
without hiding the replaceable runtime and Room contracts.

```ts
import { AgentPlat } from '@agentplat/framework';
import { openAICompatible } from '@agentplat/model-openai-compatible';

const result = await AgentPlat.quickRun({
  adapter: openAICompatible({
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_MODEL,
  }),
  instructions: 'Be concise.',
  input: 'Draft a launch message.',
});
```

`quickRun` is intentionally ephemeral: it does not create a Room, durable
events or approvals. Pass a Room repository in `rooms` to `createAgentplat`
when building a governed Agent Room platform.

For ephemeral debates and simulations, a configured facade can create a typed,
bounded multi-agent session over the same runtime:

```ts
const session = agentplat.createSession({
  speakers: [buyer, seller],
  maxRounds: 4,
  stopMarkers: ['DEAL AGREED'],
});

for await (const event of session.stream({ input: scenario, signal })) {
  // MultiAgentSessionEvent is re-exported by this package.
}
```

For applications with mock and live backends in one process, pass a `platforms`
map containing explicit adapters/providers. The framework validates registered
speaker platforms without importing optional model SDKs.
