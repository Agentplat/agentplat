import { createConditionalActionDispatcherV1, type ActionConditionalExecutionPortV1 }
  from '@agentplat/inference-control/action-effects';
import type { ActionDispatcher } from '@agentplat/inference-control/tools';
declare const port: ActionConditionalExecutionPortV1;
declare const resolvePreconditions: Parameters<typeof createConditionalActionDispatcherV1>[0]['resolvePreconditions'];
const dispatcher: ActionDispatcher = createConditionalActionDispatcherV1({ dispatcherId: 'conditional',
  dispatcherVersion: 1, fencingMode: 'local_only', port, resolvePreconditions });
void dispatcher;
