# @agentplat/framework

High-level composition for applications that want a short path to AgentPlat
without hiding the replaceable runtime and Room contracts.

For the shortest path, send one prompt and receive plain text:

```ts
import { AgentPlat } from '@agentplat/framework';

const answer = await AgentPlat.ask({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4.1-mini',
  prompt: 'Draft a friendly release note.',
});
```

Change `provider` to `gemini`, `ollama` or `openrouter`, or use `compatible`
with an explicit `baseURL`. `ask` is ephemeral and returns only text; use
`quickRun` when you need usage, finish reason, normalized events or a custom
`ModelAdapter`.

When that prompt becomes a reusable agent, configure it once and progressively
use the same object for a normal run, streaming, or a multi-agent session:

```ts
const researcher = AgentPlat.configure({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4.1-mini',
  instructions: 'Research carefully and cite uncertainty.',
  tenantId: 'acme',
});

const answer = await researcher.ask('Compare two options.');
for await (const event of researcher.stream('Give a live update.')) {
  // normalized AgentStreamEvent
}

const discussion = researcher.createSession({
  speakers: [analyst, reviewer], // speakers use platform: 'chat'
  maxRounds: 3,
});
```

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
