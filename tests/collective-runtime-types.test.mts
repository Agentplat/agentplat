import {
  InMemoryCollectiveStateStore,
  createCollective,
  type CollectiveExecutionSnapshot,
} from '@agentplat/collective-runtime';
import { DefaultAgentRuntime } from '@agentplat/runtime';

const runtime = new DefaultAgentRuntime();
const collective = createCollective({
  collectiveId: 'typed-collective',
  objective: { objectiveId: 'typed-objective', summary: 'Typed objective' },
  plan: {
    workItems: [
      {
        workItemId: 'typed-work',
        summary: 'Typed work',
        requiredCapabilityKeys: ['typed'],
      },
    ],
  },
  runtime,
  tenant: { tenantId: 'typed-tenant' },
  stateStore: new InMemoryCollectiveStateStore(),
});

const result: Promise<CollectiveExecutionSnapshot> = collective.run();
void result;
