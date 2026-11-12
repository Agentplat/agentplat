import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planProviderSmoke,
  runProviderSmoke,
} from '../scripts/smoke-model-providers.mjs';

test('provider smoke preflight covers the full preset cohort without exposing configuration values', () => {
  const plan = planProviderSmoke({});
  assert.deepEqual(
    plan.map(({ provider }) => provider),
    [
      'openai',
      'gemini',
      'ollama',
      'openrouter',
      'groq',
      'mistral',
      'azure',
      'bedrock',
    ]
  );
  assert.deepEqual(plan.find(({ provider }) => provider === 'azure').missing, [
    'AZURE_OPENAI_MODEL',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_BASE_URL',
  ]);
  assert.deepEqual(plan.find(({ provider }) => provider === 'ollama').missing, [
    'OLLAMA_MODEL',
  ]);
  assert.throws(() => planProviderSmoke({}, ['unknown']), /Unknown provider/);
  assert.throws(() => planProviderSmoke({}, []), /at least one/);
  assert.throws(() => planProviderSmoke({}, ['groq', 'groq']), /duplicates/);
});

test('provider smoke rejects an incomplete cohort before contacting any provider', async () => {
  const plan = planProviderSmoke(
    { GROQ_MODEL: 'model', GROQ_API_KEY: 'secret' },
    ['groq', 'azure']
  );
  await assert.rejects(
    runProviderSmoke(plan, () => assert.fail('Must not contact any provider')),
    /Configure every/
  );
});

test('provider smoke checks generation and streaming, continues after failure and omits error details', async () => {
  const plan = planProviderSmoke(
    {
      GROQ_MODEL: 'model-a',
      GROQ_API_KEY: 'secret-a',
      MISTRAL_MODEL: 'model-b',
      MISTRAL_API_KEY: 'secret-b',
    },
    ['groq', 'mistral']
  );
  const calls = [];
  const results = await runProviderSmoke(plan, (options) => ({
    async generate(request, context) {
      calls.push([options.provider, 'generate']);
      assert.ok(context.signal instanceof AbortSignal);
      assert.equal(request.messages[0].role, 'user');
      if (options.provider === 'groq') throw new Error(options.apiKey);
      return { content: 'OK' };
    },
    async *stream() {
      calls.push([options.provider, 'stream']);
      yield { type: 'completed', result: { content: 'OK' } };
    },
  }));
  assert.deepEqual(results, [
    { provider: 'groq', status: 'failed' },
    { provider: 'mistral', status: 'passed' },
  ]);
  assert.deepEqual(calls, [
    ['groq', 'generate'],
    ['mistral', 'generate'],
    ['mistral', 'stream'],
  ]);
  assert.doesNotMatch(JSON.stringify(results), /secret/);
});

test('provider smoke rejects streams without a nonempty completed result', async () => {
  const plan = planProviderSmoke({ OLLAMA_MODEL: 'local' }, ['ollama']);
  for (const events of [
    [],
    [{ type: 'failed' }],
    [{ type: 'completed', result: { content: '' } }],
  ]) {
    const results = await runProviderSmoke(plan, () => ({
      async generate() {
        return { content: 'OK' };
      },
      async *stream() {
        yield* events;
      },
    }));
    assert.deepEqual(results, [{ provider: 'ollama', status: 'failed' }]);
  }
});
