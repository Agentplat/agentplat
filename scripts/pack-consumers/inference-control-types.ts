import type { ContextEntryV1 } from '@agentplat/inference-control';
import type { ControlledModelRequestV1 } from '@agentplat/inference-control/model';
import {
  createControlledAgentSseValidatorV1,
  type ControlledAgentRunEventV1,
} from '@agentplat/inference-control/runtime';
import type { ActionScope } from '@agentplat/inference-control/tools';
import type { OutboundMessageAttempt } from '@agentplat/inference-control/messages';

declare const entry: ContextEntryV1;
declare const request: ControlledModelRequestV1;
declare const scope: ActionScope;
declare const attempt: OutboundMessageAttempt;
declare const envelope: Parameters<
  ReturnType<typeof createControlledAgentSseValidatorV1>['validate']
>[0];

const validator = createControlledAgentSseValidatorV1();
validator.validate(envelope);
void entry.contentDigest;
void request.capabilityHandleId;
void scope.policyId;
void attempt.messageDigest;
