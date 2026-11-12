import assert from 'node:assert/strict';
import test from 'node:test';
import { chatModel } from '@agentplat/model-openai-compatible';

const context = {
  tenant: { tenantId: 'tenant-a' },
  requestId: 'request-a',
};
const request = { messages: [{ role: 'user', content: 'Hello' }] };

for (const [provider, baseURL, explicitEndpoint] of [
  ['openai', 'https://api.openai.com/v1', false],
  ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', false],
  ['openrouter', 'https://openrouter.ai/api/v1', false],
  ['azure', 'https://test-resource.openai.azure.com/openai/v1', true],
  [
    'bedrock',
    'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
    true,
  ],
  ['groq', 'https://api.groq.com/openai/v1'],
  ['mistral', 'https://api.mistral.ai/v1'],
]) {
  test(`${provider} preset sends authenticated Chat Completions and normalizes the result`, async () => {
    let calls = 0;
    const adapter = chatModel({
      provider,
      ...(explicitEndpoint ? { baseURL } : {}),
      apiKey: 'test-key',
      defaultModel: 'test-model',
      fetch: async (url, init) => {
        calls++;
        assert.equal(url, `${baseURL}/chat/completions`);
        assert.equal(init.method, 'POST');
        assert.equal(init.headers.Authorization, 'Bearer test-key');
        assert.deepEqual(JSON.parse(init.body), {
          model: 'test-model',
          messages: request.messages,
          stream: false,
        });
        return Response.json({
          model: 'test-model',
          choices: [
            { message: { content: 'Hello back' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        });
      },
    });
    const result = await adapter.generate(request, context);
    assert.equal(calls, 1);
    assert.equal(result.content, 'Hello back');
    assert.equal(result.finishReason, 'stop');
    assert.deepEqual(result.usage, {
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
    });
  });

  test(`${provider} preset requires credentials before making an HTTP request`, async () => {
    const adapter = chatModel({
      provider,
      ...(explicitEndpoint ? { baseURL } : {}),
      defaultModel: 'test-model',
      fetch: async () =>
        assert.fail('Must not call provider without credentials'),
    });
    await assert.rejects(adapter.generate(request, context), {
      code: 'UNAUTHORIZED',
    });
  });

  test(`${provider} preset preserves endpoint, authentication and capability overrides`, async () => {
    const adapter = chatModel({
      provider,
      baseURL: 'http://localhost:1234/v1/',
      requireApiKey: false,
      capabilities: { vision: false },
      fetch: async (url, init) => {
        assert.equal(url, 'http://localhost:1234/v1/chat/completions');
        assert.equal(init.headers.Authorization, undefined);
        assert.equal(JSON.parse(init.body).model, 'request-model');
        return Response.json({
          choices: [{ message: { content: 'Local' }, finish_reason: 'stop' }],
        });
      },
    });
    assert.equal(adapter.capabilities.vision, false);
    assert.equal(
      (await adapter.generate({ ...request, model: 'request-model' }, context))
        .content,
      'Local'
    );
  });

  test(`${provider} preset streams through the shared adapter with execution credentials`, async () => {
    const adapter = chatModel({
      provider,
      ...(explicitEndpoint ? { baseURL } : {}),
      defaultModel: 'test-model',
      fetch: async (url, init) => {
        assert.equal(url, `${baseURL}/chat/completions`);
        assert.equal(init.headers.Authorization, 'Bearer execution-key');
        assert.equal(JSON.parse(init.body).stream, true);
        return new Response(
          [
            'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
            'data: [DONE]',
            '',
          ].join('\n')
        );
      },
    });
    const events = [];
    for await (const event of adapter.stream(request, {
      ...context,
      credentials: { apiKey: 'execution-key' },
    }))
      events.push(event);
    assert.deepEqual(
      events.map((event) => event.type),
      ['started', 'text_delta', 'completed']
    );
    assert.equal(events[2].result.content, 'Hello');
    assert.equal(events[2].result.finishReason, 'stop');
  });
}

for (const provider of ['azure', 'bedrock', 'compatible']) {
  for (const baseURL of [undefined, '', '   ']) {
    test(`${provider} rejects missing or blank baseURL (${JSON.stringify(baseURL)})`, () => {
      assert.throws(() => chatModel({ provider, baseURL }), {
        code: 'VALIDATION_ERROR',
        message: `baseURL is required when provider is "${provider}"`,
      });
    });
  }
}

for (const provider of ['azure', 'bedrock']) {
  test(`${provider} resolves fresh bearer credentials for each execution`, async () => {
    let resolved = 0;
    const adapter = chatModel({
      provider,
      baseURL: 'https://deployment.example/openai/v1',
      defaultModel: 'deployment-name',
      apiKey: 'fallback-key',
      apiKeyResolver: (execution) => {
        assert.equal(execution.tenant.tenantId, 'tenant-a');
        return `token-${++resolved}`;
      },
      fetch: async (_url, init) => {
        assert.equal(init.headers.Authorization, `Bearer token-${resolved}`);
        return Response.json({
          choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        });
      },
    });
    await adapter.generate(request, context);
    await adapter.generate(request, context);
    assert.equal(resolved, 2);
  });

  test(`${provider} propagates cancellation and HTTP authentication errors`, async () => {
    const controller = new AbortController();
    let calls = 0;
    const adapter = chatModel({
      provider,
      baseURL: 'https://deployment.example/openai/v1',
      defaultModel: 'deployment-name',
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        calls++;
        assert.equal(init.signal, controller.signal);
        return new Response('', { status: 401 });
      },
    });
    await assert.rejects(
      adapter.generate(request, { ...context, signal: controller.signal }),
      { code: 'UNAUTHORIZED' }
    );
    controller.abort();
    await assert.rejects(
      adapter.generate(request, { ...context, signal: controller.signal }),
      { code: 'ADAPTER_ERROR', message: controller.signal.reason.message }
    );
    assert.equal(calls, 1);
  });
}

test('ollama keeps its unauthenticated local default', async () => {
  const adapter = chatModel({
    provider: 'ollama',
    defaultModel: 'local-model',
    fetch: async (url, init) => {
      assert.equal(url, 'http://localhost:11434/v1/chat/completions');
      assert.equal(init.headers.Authorization, undefined);
      return Response.json({
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      });
    },
  });
  assert.equal((await adapter.generate(request, context)).content, 'OK');
});
