import { pathToFileURL } from 'node:url';

const providers = [
  ['openai', 'OPENAI', true, false],
  ['gemini', 'GEMINI', true, false],
  ['ollama', 'OLLAMA', false, false],
  ['openrouter', 'OPENROUTER', true, false],
  ['groq', 'GROQ', true, false],
  ['mistral', 'MISTRAL', true, false],
  ['azure', 'AZURE_OPENAI', true, true],
  ['bedrock', 'BEDROCK', true, true],
];

/** Validate the complete selected cohort before making any model calls. */
export function planProviderSmoke(env, selected = providers.map(([id]) => id)) {
  if (selected.length === 0 || new Set(selected).size !== selected.length)
    throw new Error('Select at least one provider without duplicates');
  return selected.map((provider) => {
    const preset = providers.find(([id]) => id === provider);
    if (!preset) throw new Error(`Unknown provider: ${provider}`);
    const [, prefix, needsKey, needsURL] = preset;
    const model = env[`${prefix}_MODEL`]?.trim();
    const apiKey = env[`${prefix}_API_KEY`]?.trim();
    const baseURL = env[`${prefix}_BASE_URL`]?.trim();
    const missing = [
      ...(!model ? [`${prefix}_MODEL`] : []),
      ...(needsKey && !apiKey ? [`${prefix}_API_KEY`] : []),
      ...(needsURL && !baseURL ? [`${prefix}_BASE_URL`] : []),
    ];
    return { provider, model, apiKey, baseURL, missing };
  });
}

/** Each configured provider must complete both generation and streaming. */
export async function runProviderSmoke(plan, createAdapter) {
  if (plan.some(({ missing }) => missing.length > 0))
    throw new Error(
      'Configure every selected provider before running live smoke tests'
    );
  const results = [];
  for (const { provider, model, apiKey, baseURL } of plan) {
    try {
      const adapter = createAdapter({
        provider,
        defaultModel: model,
        apiKey,
        baseURL,
      });
      const request = {
        messages: [{ role: 'user', content: 'Reply with OK.' }],
      };
      const context = {
        tenant: { tenantId: 'provider-smoke' },
        signal: AbortSignal.timeout(60_000),
      };
      const generated = await adapter.generate(request, context);
      if (!generated.content?.trim()) throw new Error('Empty generation');
      let completed = false;
      for await (const event of adapter.stream(request, {
        ...context,
        signal: AbortSignal.timeout(60_000),
      })) {
        if (event.type === 'failed') throw new Error('Stream failed');
        if (event.type === 'completed')
          completed = Boolean(event.result.content?.trim());
      }
      if (!completed) throw new Error('Incomplete stream');
      results.push({ provider, status: 'passed' });
    } catch {
      // Provider errors can contain credentials or response content. Do not log them.
      results.push({ provider, status: 'failed' });
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--live' && !arg.startsWith('--providers=')))
    throw new Error(
      'Usage: node scripts/smoke-model-providers.mjs [--providers=groq,mistral,azure,bedrock] [--live]'
    );
  const selected = args
    .find((arg) => arg.startsWith('--providers='))
    ?.slice('--providers='.length)
    .split(',');
  const plan = planProviderSmoke(process.env, selected);
  for (const { provider, missing } of plan)
    console.log(
      `${provider}: ${missing.length ? `missing ${missing.join(', ')}` : 'configured'}`
    );
  if (!args.includes('--live')) {
    console.log(
      'Preflight only. Add --live to send two model requests per selected provider.'
    );
    return;
  }
  if (plan.some(({ missing }) => missing.length > 0))
    throw new Error(
      'Configure every selected provider before running live smoke tests'
    );
  const { chatModel } = await import('@agentplat/model-openai-compatible');
  const results = await runProviderSmoke(plan, chatModel);
  for (const { provider, status } of results)
    console.log(`${provider}: ${status}`);
  if (results.some(({ status }) => status !== 'passed')) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
