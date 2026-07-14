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
          ↓
RoomService
```

`ModelAdapter` owns one generation or stream. It does not execute tools, run
handoff loops, persist memory or grant approvals. `AgentProvider` owns an agent
execution strategy. `RoomService` owns tenant isolation, lifecycle, policies,
context, durable runs, artifacts and approvals.

Keeping these layers separate lets a simple application change models without
adopting an agent SDK, while advanced providers retain their native behavior.

## Direct quick run

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
import { streamToSSE } from '@agentplat/streaming';

export async function POST(request: Request) {
  const events = agentplat.stream({
    instructions: 'Be concise.',
    input: await request.text(),
    signal: request.signal,
  });
  return streamToSSE(events, { signal: request.signal });
}
```

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
