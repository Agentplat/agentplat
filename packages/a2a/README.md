# `@agentplat/a2a`

Agent-to-Agent interoperability primitives for AgentPlat using A2A v1 HTTP+JSON.

- `A2AHttpClient` discovers an Agent Card, sends messages, streams SSE events,
  reads tasks, requests cancellation and subscribes to active tasks.
- `A2ARemoteAgentProvider` makes a remote A2A agent available to an AgentPlat
  `AgentRuntime`.
- `A2AHttpServer` exposes an Agent Card plus `message:send`, `message:stream`,
  task retrieval, cancellation and SSE task subscriptions from a
  Fetch-compatible application.

## Consume a remote agent

```ts
import { A2AHttpClient, A2ARemoteAgentProvider } from '@agentplat/a2a';

runtime.registerProvider(
  'a2a',
  new A2ARemoteAgentProvider({
    clientForAgent: () =>
      new A2AHttpClient({
        agentCardUrl: 'https://research.example/.well-known/agent-card.json',
        headers: () => ({ authorization: `Bearer ${getTenantAccessToken()}` }),
      }),
  })
);
```

The caller must select the remote endpoint from a trusted integration binding;
never turn an end-user supplied URL into an A2A client.

## Expose an AgentPlat agent

```ts
import { A2AHttpServer } from '@agentplat/a2a';

const server = new A2AHttpServer({
  card: {
    name: 'AgentPlat analyst',
    description: 'Produces governed research summaries.',
    version: '0.1.0',
    supportedInterfaces: [
      {
        url: 'https://agents.example/a2a',
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
      },
    ],
    skills: [
      { id: 'research', name: 'Research', description: 'Research a topic.' },
    ],
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain'],
    capabilities: { streaming: true },
  },
  runtime,
  basePath: '/a2a',
  async resolveExecutionContext(request) {
    const identity = await authenticate(request);
    return identity ? { tenant: { tenantId: identity.tenantId } } : undefined;
  },
  async resolveAgent() {
    return analystAgent;
  },
});
```

`resolveExecutionContext` must derive the tenant from verified identity. Agent
Cards are public metadata by default; they do not authorize invocation.

## Long-running tasks and streaming

A non-terminal run is saved in the configured `A2ATaskStore`. Use
`A2ATaskService` from a worker to persist status/artifact updates before they
are broadcast. `InMemoryA2ATaskStore` supports local SSE subscriptions;
`WorkflowA2ATaskStore` persists snapshots in the existing `WorkflowStore`.

For a multi-instance deployment, provide an `A2ATaskEventStore` backed by the
application's shared event transport. It must fan out events to every instance;
the package deliberately does not prescribe Redis, EventBridge or a database.
The current `AgentRuntime` is request/response, so `message:stream` emits the
final update after a synchronous runtime completes. External workers can emit
incremental status/artifact updates through `A2ATaskService`.

Signed Agent Cards, task push notifications and legacy v0.3 compatibility are
not included.
