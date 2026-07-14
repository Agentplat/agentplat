import { createAgentplat } from '@agentplat/framework';
import { MockAgentProvider } from '@agentplat/runtime-mock';

const agentplat = createAgentplat({
  platform: 'mock',
  provider: new MockAgentProvider({
    responses: ['Hello from the deterministic AgentPlat quick run.'],
  }),
});

const result = await agentplat.quickRun({
  instructions: 'Reply with a concise greeting.',
  input: 'Hello',
});

console.log(result.output);
