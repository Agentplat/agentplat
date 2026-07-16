import assert from 'node:assert/strict';
import test from 'node:test';

import {
  A2AHttpClient,
  A2AHttpServer,
  A2ATaskService,
  InMemoryA2ATaskStore,
  type A2AAgentCard,
  type A2ATask,
} from '../src/index.ts';

const card: A2AAgentCard = {
  name: 'Test Agent',
  description: 'A test A2A agent',
  version: '1.0.0',
  supportedInterfaces: [
    {
      url: 'https://agent.example/',
      protocolBinding: 'HTTP+JSON',
      protocolVersion: '1.0',
    },
  ],
  skills: [],
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  capabilities: { streaming: true },
};

test('client parses A2A v1 SSE stream envelopes', async () => {
  const client = new A2AHttpClient({
    agentCardUrl: 'https://agent.example/',
    fetch: async (input) => {
      const url = String(input);
      if (url.includes('.well-known/agent-card.json')) {
        return Response.json(card);
      }
      return new Response(
        'data: {"statusUpdate":{"taskId":"task-1","contextId":"ctx-1","status":{"state":"TASK_STATE_WORKING","timestamp":"2026-01-01T00:00:00.000Z"}}}\n\n',
        { headers: { 'content-type': 'text/event-stream' } }
      );
    },
  });

  const events = [];
  for await (const event of client.sendStreamingMessage({
    messageId: 'message-1',
    role: 'ROLE_USER',
    parts: [{ text: 'hello' }],
  })) {
    events.push(event);
  }
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    statusUpdate: {
      taskId: 'task-1',
      contextId: 'ctx-1',
      status: {
        state: 'TASK_STATE_WORKING',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    },
  });
});

test('subscription delivers a snapshot then the persisted terminal update', async () => {
  const store = new InMemoryA2ATaskStore();
  const task: A2ATask = {
    id: 'task-2',
    contextId: 'ctx-2',
    status: {
      state: 'TASK_STATE_WORKING',
      timestamp: '2026-01-01T00:00:00.000Z',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastModified: '2026-01-01T00:00:00.000Z',
  };
  await store.save('tenant-1', task);
  const server = new A2AHttpServer({
    card,
    runtime: { run: async () => ({ status: 'completed' }) } as never,
    taskStore: store,
    resolveExecutionContext: async () => ({ tenant: { tenantId: 'tenant-1' } }),
    resolveAgent: async () => undefined,
  });
  const response = await server.handle(
    new Request('https://agent.example/tasks/task-2:subscribe')
  );
  assert.equal(response.status, 200);
  const reader = response
    .body!.pipeThrough(new TextDecoderStream())
    .getReader();
  const initial = await reader.read();
  assert.match(initial.value!, /"task"/);

  await new A2ATaskService(store).updateStatus('tenant-1', 'task-2', {
    state: 'TASK_STATE_COMPLETED',
    timestamp: '2026-01-01T00:00:01.000Z',
  });
  const terminal = await reader.read();
  assert.match(terminal.value!, /TASK_STATE_COMPLETED/);
  assert.equal((await reader.read()).done, true);
});

test('server exposes A2A message:stream as SSE', async () => {
  const server = new A2AHttpServer({
    card,
    runtime: {
      run: async () => ({ status: 'completed', output: 'done' }),
    } as never,
    resolveExecutionContext: async () => ({ tenant: { tenantId: 'tenant-1' } }),
    resolveAgent: async () => ({ id: 'agent-1' }) as never,
  });
  const response = await server.handle(
    new Request('https://agent.example/message:stream', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          messageId: 'message-3',
          role: 'ROLE_USER',
          parts: [{ text: 'hello' }],
        },
      }),
    })
  );
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const body = await response.text();
  assert.match(body, /"task"/);
  assert.match(body, /TASK_STATE_COMPLETED/);
});
