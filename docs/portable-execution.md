# Portable model execution

AgentPlat separates direct model I/O from agent orchestration and durable Agent
Room governance:

```text
ModelAdapter
  ├── OpenAI-compatible Chat Completions
  ├── future Anthropic / Gemini adapters
  └── local compatible servers
          ↓
ChatAgentProvider or a full AgentProvider
          ↓
DefaultAgentRuntime
  ├── MultiAgentSession (ephemeral, multi-turn)
  └── RoomService (durable and governed)
```

`ModelAdapter` owns one generation or stream. It does not execute tools, run
handoff loops, persist memory or grant approvals. `AgentProvider` owns an agent
execution strategy. `MultiAgentSession` owns bounded speaker turns and transcript
assembly. `RoomService` owns tenant isolation, lifecycle, policies, context,
durable runs, artifacts and approvals.

Keeping these layers separate lets a simple application change models without
adopting an agent SDK, while advanced providers retain their native behavior.

## Direct quick run

For the simplest prompt/response use case, use the facade-only `ask` method:

```ts
import { AgentPlat } from '@agentplat/framework';

const answer = await AgentPlat.ask({
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.5-flash',
  prompt: 'Summarize this proposal in three bullets.',
});
```

`ask` returns a `string` and supports the `openai`, `gemini`, `ollama`,
`openrouter` and `compatible` presets. It is still one ephemeral model call:
it does not create a Room or durable audit record.

Use `quickRun` below when the caller needs normalized usage, finish reason or
full runtime output.

## Reusable advanced composition

`AgentPlat.configure` keeps provider configuration declarative as an
application grows. It returns a reusable agent with `run`, `ask`, `stream` and
`createSession` methods:

```ts
const analyst = AgentPlat.configure({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4.1-mini',
  instructions: 'Act as a careful market analyst.',
  tenantId: 'acme',
});

const result = await analyst.run('Evaluate this opportunity.');
for await (const event of analyst.stream('Explain your reasoning live.')) {
  // AgentStreamEvent
}

const review = analyst.createSession({
  speakers: [analystSpeaker, reviewerSpeaker],
  maxRounds: 3,
});
```

All session speakers in this configuration use `platform: 'chat'`. For
multiple models or a provider with a non-compatible protocol, use
`createAgentplat` with its public `platforms` map and custom adapters.

```ts
import { AgentPlat } from '@agentplat/framework';
import { openAICompatible } from '@agentplat/model-openai-compatible';

const result = await AgentPlat.quickRun({
  adapter: openAICompatible({
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_MODEL,
  }),
  instructions: 'You are a concise negotiation assistant.',
  input: 'I am interested in the car.',
});

console.log(result.output);
```

No environment variable is read implicitly by the framework or adapter. This
makes credential ownership explicit and avoids process-global tenant leakage.
`quickRun` supplies generated IDs, tenant `local`, no tool registry and a
deny-oriented policy context. It remains ephemeral and does not claim Room
audit, persistence or approvals.

## Reusable composition with Rooms

```ts
import { createAgentplat } from '@agentplat/framework';
import { openAICompatible } from '@agentplat/model-openai-compatible';
import { PostgresRoomRepository } from '@agentplat/rooms-postgres';

const agentplat = createAgentplat({
  adapter: openAICompatible({
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_MODEL,
  }),
  tenant: { tenantId: 'acme' },
  rooms: { repository: new PostgresRoomRepository(pool) },
});

const room = await agentplat.rooms?.createRoom('acme', {
  title: 'Launch room',
  goal: 'Prepare an approved launch brief',
});
```

Production code must derive the tenant from verified authentication rather
than user-controlled input.

## Streaming in Next.js or Fetch-compatible handlers

```ts
import { toNextSseResponse } from '@agentplat/streaming';

export async function POST(request: Request) {
  const input = await request.text();
  return toNextSseResponse(request, (signal) =>
    agentplat.stream({ instructions: 'Be concise.', input, signal })
  );
}
```

For multi-turn simulations, typed orchestration events and the browser parser,
see [multi-agent sessions](./multi-agent-sessions.md).

## Streaming in Express

```ts
import { pipeSSE } from '@agentplat/streaming';

app.post('/agent', async (request, response) => {
  await pipeSSE(
    agentplat.stream({
      instructions: 'Be concise.',
      input: request.body.input,
    }),
    response
  );
});
```

The SSE envelope is versioned and ordered. Unexpected error details are hidden
unless `exposeErrors` is enabled for local debugging. Runtime events and their
payloads must never include API keys or other credentials.

## OpenAI-compatible versus Agents SDK

The compatible adapter uses the Chat Completions HTTP format and has no SDK
dependency. Configure `baseURL` and `requireApiKey: false` for a trusted local
compatible server. Compatibility varies by server and model.

Use `@agentplat/provider-openai` when the application needs the OpenAI Agents
SDK runner and the provider-specific capabilities implemented by that adapter.
The two adapters are complementary and neither is imported by the
provider-neutral runtime.
