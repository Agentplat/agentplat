import { DefaultAgentRuntime } from '@agentplat/runtime';

class LocalEchoProvider {
  async run(_agent, input) {
    return {
      status: 'completed',
      output: `local:${input.input}`,
    };
  }

  async *stream(_agent, input) {
    yield { type: 'started' };
    yield { type: 'token', content: `local:${input.input}` };
    yield { type: 'completed' };
  }
}

const runtime = new DefaultAgentRuntime();
runtime.registerProvider('local', new LocalEchoProvider());

const agent = {
  id: 'example-agent',
  tenantId: 'example-tenant',
  name: 'Local example',
  platform: 'local',
};

const result = await runtime.run(
  agent,
  { input: 'hello open core' },
  { tenant: { tenantId: agent.tenantId }, agentId: agent.id }
);

console.log(result.output);
