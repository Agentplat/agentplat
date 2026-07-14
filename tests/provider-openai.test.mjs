import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentPlatError } from '@agentplat/core';
import {
  OpenAIAgentProvider,
  createOpenAIAgent,
  extractOpenAIFileCitations,
} from '@agentplat/provider-openai';

const definition = {
  id: 'agent-openai',
  tenantId: 'tenant-a',
  name: 'OpenAI agent',
  instructions: 'Answer concisely.',
  platform: 'openai',
  metadata: {
    provider: {
      model: 'gpt-4o',
      generation: {
        temperature: 0.2,
        top_p: 0.8,
        max_output_tokens: 120,
      },
    },
    knowledge: {
      enabled: true,
      vectorStoreId: 'vs_test',
      retrieval: { max_num_results: 3 },
    },
  },
};

const context = {
  tenant: { tenantId: 'tenant-a' },
  agentId: definition.id,
};

test('OpenAI agent builder maps legacy configuration to the current SDK', () => {
  const { agent, model } = createOpenAIAgent(definition);

  assert.equal(model, 'gpt-4o');
  assert.equal(agent.model, 'gpt-4o');
  assert.deepEqual(agent.modelSettings, {
    temperature: 0.2,
    topP: 0.8,
    maxTokens: 120,
  });
  assert.equal(agent.tools.length, 1);
  assert.equal(agent.tools[0].name, 'file_search');
  assert.deepEqual(agent.tools[0].providerData.vector_store_ids, ['vs_test']);
});

test('OpenAI provider requires execution-scoped credentials', async () => {
  const provider = new OpenAIAgentProvider();

  await assert.rejects(
    provider.run(definition, { input: 'hello' }, context),
    (error) =>
      error instanceof AgentPlatError &&
      error.code === 'UNAUTHORIZED' &&
      error.statusCode === 401
  );
});

test('OpenAI citation extraction normalizes SDK provider data', () => {
  assert.deepEqual(
    extractOpenAIFileCitations({
      output: [
        {
          content: [
            {
              type: 'file_citation',
              file_id: 'file_123',
              filename: 'handbook.pdf',
              text: 'Relevant passage',
            },
          ],
        },
      ],
    }),
    [
      {
        fileId: 'file_123',
        filename: 'handbook.pdf',
        quote: 'Relevant passage',
      },
    ]
  );
});
