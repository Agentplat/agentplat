import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentPlat, createAgentplat } from '@agentplat/framework';
import {
  chatModel,
  OpenAICompatibleModelAdapter,
} from '@agentplat/model-openai-compatible';
import { InMemoryRoomRepository } from '@agentplat/rooms';
import { MockAgentProvider } from '@agentplat/runtime-mock';
import { encodeSseEvent, pipeSSE, streamToSSE } from '@agentplat/streaming';

const capabilities = {
  streaming: true,
  tools: false,
  structuredOutput: false,
  vision: false,
};

function runtimeAgent(platform = 'mock') {
  return {
    id: 'agent-a',
    tenantId: 'tenant-a',
    name: 'Agent A',
    platform,
  };
}

function runtimeContext(signal) {
  return {
    tenant: { tenantId: 'tenant-a' },
    agentId: 'agent-a',
    runId: 'run-a',
    signal,
  };
}

test('AgentPlat.quickRun maps simple input to a portable model adapter', async () => {
  let received;
  const adapter = {
    id: 'portable-test',
    capabilities,
    async generate(request, context) {
      received = { request, context };
      return {
        id: 'model-result-a',
        model: request.model,
        content: 'Portable answer',
        finishReason: 'stop',
        usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
      };
    },
  };

  const result = await AgentPlat.quickRun({
    adapter,
    tenantId: 'tenant-a',
    instructions: 'Be concise.',
    input: 'Hello',
    modelName: 'portable-model',
    runId: 'run-a',
    agentId: 'agent-a',
  });

  assert.equal(result.output, 'Portable answer');
  assert.equal(result.metadata.adapter, 'portable-test');
  assert.deepEqual(result.result.usage, {
    inputTokens: 2,
    outputTokens: 2,
    totalTokens: 4,
  });
  assert.equal(result.result.finishReason, 'stop');
  assert.equal(typeof result.result.latencyMs, 'number');
  assert.deepEqual(received.request.messages, [
    { role: 'developer', content: 'Be concise.' },
    { role: 'user', content: 'Hello' },
  ]);
  assert.equal(received.request.model, 'portable-model');
  assert.equal(received.context.tenant.tenantId, 'tenant-a');
  assert.equal(received.context.requestId, 'run-a');
});

test('AgentPlat.ask returns plain text from a provider preset', async () => {
  const answer = await AgentPlat.ask({
    provider: 'ollama',
    model: 'llama3.2',
    prompt: 'Say hello.',
    system: 'Be concise.',
    fetch: async (url, init) => {
      assert.equal(url, 'http://localhost:11434/v1/chat/completions');
      assert.equal(JSON.parse(init.body).model, 'llama3.2');
      return Response.json({
        choices: [
          {
            message: { role: 'assistant', content: 'Hello.' },
            finish_reason: 'stop',
          },
        ],
      });
    },
  });

  assert.equal(answer, 'Hello.');
});

test('createAgentplat composes an optional RoomService around the same runtime', async () => {
  const adapter = {
    id: 'rooms-test',
    capabilities,
    async generate() {
      return { content: 'Draft', finishReason: 'stop' };
    },
  };
  const platform = createAgentplat({
    adapter,
    tenant: { tenantId: 'tenant-a' },
    rooms: { repository: new InMemoryRoomRepository() },
  });

  assert.ok(platform.rooms);
  assert.equal(
    (
      await platform.rooms.createRoom('tenant-a', {
        title: 'Framework room',
        goal: 'Verify composition',
      })
    ).status,
    'active'
  );
});

test('createAgentplat registers multiple neutral platforms and validates session speakers', async () => {
  const mock = new MockAgentProvider({
    responsesByAgent: { buyer: ['Buyer'], seller: ['Seller'] },
  });
  const platform = createAgentplat({
    platform: 'mock',
    platforms: {
      mock: { provider: mock },
      fallback: {
        provider: new MockAgentProvider({ responses: ['Fallback'] }),
      },
    },
  });
  const session = platform.createSession({
    maxRounds: 1,
    speakers: [
      { id: 'buyer', name: 'Buyer', instructions: 'Buy', platform: 'mock' },
      { id: 'seller', name: 'Seller', instructions: 'Sell', platform: 'mock' },
    ],
  });
  assert.equal((await session.run({ input: 'Negotiate.' })).turnsCompleted, 2);
  assert.throws(
    () =>
      platform.createSession({
        speakers: [
          { id: 'a', name: 'A', instructions: 'A', platform: 'unknown' },
          { id: 'b', name: 'B', instructions: 'B', platform: 'mock' },
        ],
      }),
    /No provider is configured/
  );
});

test('OpenAI-compatible model generation uses the standard endpoint without leaking credentials', async () => {
  let observed;
  const adapter = new OpenAICompatibleModelAdapter({
    apiKey: 'test-key',
    defaultModel: 'test-model',
    fetch: async (url, init) => {
      observed = {
        url,
        authorization: new Headers(init.headers).get('authorization'),
        body: JSON.parse(init.body),
      };
      return Response.json({
        id: 'chatcmpl-a',
        model: 'test-model',
        choices: [
          {
            message: { role: 'assistant', content: 'Hello' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 3,
          completion_tokens: 1,
          total_tokens: 4,
        },
      });
    },
  });

  const result = await adapter.generate(
    { messages: [{ role: 'user', content: 'Hi' }] },
    { tenant: { tenantId: 'tenant-a' }, requestId: 'request-a' }
  );

  assert.equal(observed.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(observed.authorization, 'Bearer test-key');
  assert.equal(observed.body.stream, false);
  assert.equal(result.content, 'Hello');
  assert.deepEqual(result.usage, {
    inputTokens: 3,
    outputTokens: 1,
    totalTokens: 4,
  });
  assert.doesNotMatch(JSON.stringify(result), /test-key/);
});

test('chatModel selects portable provider presets without SDK dependencies', () => {
  const gemini = chatModel({
    provider: 'gemini',
    apiKey: 'test-key',
    defaultModel: 'gemini-2.5-flash',
  });
  const ollama = chatModel({
    provider: 'ollama',
    defaultModel: 'llama3.2',
  });

  assert.ok(gemini instanceof OpenAICompatibleModelAdapter);
  assert.ok(ollama instanceof OpenAICompatibleModelAdapter);
  assert.throws(
    () => chatModel({ provider: 'compatible', defaultModel: 'custom-model' }),
    /baseURL is required/
  );
});

test('OpenAI-compatible streaming normalizes SSE text chunks', async () => {
  const wire = [
    'data: {"id":"chatcmpl-a","model":"test-model","choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}',
    '',
    'data: {"id":"chatcmpl-a","model":"test-model","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  const adapter = new OpenAICompatibleModelAdapter({
    baseURL: 'http://localhost:11434/v1',
    requireApiKey: false,
    defaultModel: 'local-model',
    fetch: async () =>
      new Response(wire, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  });

  const events = [];
  for await (const event of adapter.stream(
    { messages: [{ role: 'user', content: 'Hi' }] },
    { tenant: { tenantId: 'tenant-a' } }
  )) {
    events.push(event);
  }

  assert.deepEqual(
    events.map((event) => event.type),
    ['started', 'text_delta', 'text_delta', 'completed']
  );
  assert.equal(events.at(-1).result.content, 'Hello');
});

test('ChatAgentProvider preserves completed usage, model and latency in streams', async () => {
  const adapter = {
    id: 'stream-metadata',
    capabilities,
    async generate() {
      return { content: 'unused' };
    },
    async *stream() {
      yield { type: 'started', model: 'portable-model' };
      yield { type: 'text_delta', content: 'Portable' };
      yield {
        type: 'completed',
        result: {
          content: 'Portable',
          model: 'portable-model',
          finishReason: 'stop',
          usage: { inputTokens: 4, outputTokens: 1, totalTokens: 5 },
        },
      };
    },
  };
  const platform = createAgentplat({ adapter });
  const events = [];

  for await (const event of platform.stream({
    instructions: 'Be portable.',
    input: 'Hello',
  })) {
    events.push(event);
  }

  const completed = events.at(-1);
  assert.equal(completed.type, 'completed');
  assert.equal(completed.payload.model, 'portable-model');
  assert.equal(completed.payload.finishReason, 'stop');
  assert.deepEqual(completed.payload.usage, {
    inputTokens: 4,
    outputTokens: 1,
    totalTokens: 5,
  });
  assert.equal(typeof completed.payload.latencyMs, 'number');
});

test('streamToSSE returns a versioned Fetch-compatible event stream', async () => {
  async function* events() {
    yield { type: 'started', runId: 'run-a' };
    yield { type: 'token', runId: 'run-a', content: 'Hello' };
    yield { type: 'completed', runId: 'run-a', content: 'Hello' };
  }

  const response = streamToSSE(events(), { retryMs: 1_000 });
  const body = await response.text();
  assert.match(response.headers.get('content-type'), /^text\/event-stream/);
  assert.match(body, /retry: 1000/);
  assert.match(body, /event: agentplat\.token/);
  assert.match(body, /"version":1/);
  assert.match(body, /"sequence":3/);
});

test('pipeSSE writes headers and honors Node response backpressure', async () => {
  const headers = new Map();
  const chunks = [];
  let ended = false;
  let first = true;
  const response = {
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    write(chunk) {
      chunks.push(chunk);
      if (first) {
        first = false;
        return false;
      }
      return true;
    },
    once(event, listener) {
      assert.equal(event, 'drain');
      queueMicrotask(listener);
    },
    end() {
      ended = true;
    },
  };
  async function* events() {
    yield { type: 'token', runId: 'run-a', content: 'A' };
  }

  await pipeSSE(events(), response);
  assert.match(headers.get('content-type'), /^text\/event-stream/);
  assert.equal(ended, true);
  assert.match(chunks.join(''), /agentplat\.token/);
});

test('MockAgentProvider supports ordered responses and scripted token streams', async () => {
  const provider = new MockAgentProvider({ responses: ['First', 'Second'] });
  assert.equal(
    (await provider.run(runtimeAgent(), { input: 'one' }, runtimeContext()))
      .output,
    'First'
  );
  assert.equal(
    (await provider.run(runtimeAgent(), { input: 'two' }, runtimeContext()))
      .output,
    'Second'
  );
  assert.equal(
    (await provider.run(runtimeAgent(), { input: 'three' }, runtimeContext()))
      .output,
    'Second'
  );

  const streaming = new MockAgentProvider({
    responses: ['ignored'],
    streamTokens: ['Hello', ' world'],
  });
  const events = [];
  for await (const event of streaming.stream(
    runtimeAgent(),
    { input: 'stream' },
    runtimeContext()
  )) {
    events.push(event);
  }
  assert.deepEqual(
    events.map((event) => [event.type, event.content]),
    [
      ['started', undefined],
      ['token', 'Hello'],
      ['token', ' world'],
      ['completed', 'ignored'],
    ]
  );
});

test('encodeSseEvent rejects invalid sequence numbers', () => {
  assert.throws(() => encodeSseEvent({ type: 'started' }, 0), /positive/);
});
