import { createAgentplat } from '@agentplat/framework';
import { MockAgentProvider } from '@agentplat/runtime-mock';

const agentplat = createAgentplat({
  platform: 'mock',
  provider: new MockAgentProvider({
    responsesByAgent: {
      researcher: ['Research notes: the launch is provider-neutral.'],
      writer: ['Final brief: verified research, concise launch message.'],
    },
  }),
});

const collective = agentplat.createCollective({
  collectiveId: 'launch-team',
  objective: {
    objectiveId: 'launch-brief',
    summary: 'Produce a researched and reviewed launch brief.',
    successCriteria: ['research completed', 'final brief completed'],
  },
  plan: {
    workItems: [
      {
        workItemId: 'research',
        summary: 'Collect the relevant launch facts.',
        requiredCapabilityKeys: ['research'],
      },
      {
        workItemId: 'write',
        summary: 'Write the final brief from the research result.',
        requiredCapabilityKeys: ['writing'],
        dependsOn: ['research'],
      },
    ],
  },
  policies: {
    maximumConcurrentWorkItems: 2,
    maximumAttemptsPerWorkItem: 2,
  },
});

collective
  .register({
    agent: {
      id: 'researcher',
      tenantId: 'local',
      name: 'Researcher',
      instructions: 'Collect factual evidence for the assigned work.',
      platform: 'mock',
    },
    capabilityKeys: ['research'],
    roleKeys: ['analyst'],
  })
  .register({
    agent: {
      id: 'writer',
      tenantId: 'local',
      name: 'Writer',
      instructions: 'Use dependency results to write the final output.',
      platform: 'mock',
    },
    capabilityKeys: ['writing'],
    roleKeys: ['reviewer'],
  });

collective.subscribe((event) => {
  if (event.type === 'work.assigned' || event.type === 'work.completed') {
    console.log(event.type, event.payload);
  }
});

const execution = await collective.run({ executionId: 'launch-run-1' });
console.log({
  status: execution.status,
  results: Object.fromEntries(
    execution.workItems.map(({ workItem, result }) => [
      workItem.workItemId,
      result?.output,
    ])
  ),
});
