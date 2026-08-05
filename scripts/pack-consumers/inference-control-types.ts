import type { ContextEntryV1 } from '@agentplat/inference-control';
import type { ControlledModelRequestV1 } from '@agentplat/inference-control/model';
import {
  createControlledAgentSseValidatorV1,
  type ControlledAgentRunEventV1,
} from '@agentplat/inference-control/runtime';
import type { ActionScope } from '@agentplat/inference-control/tools';
import type { OutboundMessageAttempt } from '@agentplat/inference-control/messages';
import type {
  RoleAlignmentPolicyV1,
  RoleAlignmentStateV1,
} from '@agentplat/inference-control/role-alignment';
import type {
  RoleAlignmentAssessmentV1,
  RoleAlignmentPortableAgentControlV1,
} from '@agentplat/inference-control/role-alignment/portable-agent';

declare const entry: ContextEntryV1;
declare const request: ControlledModelRequestV1;
declare const scope: ActionScope;
declare const attempt: OutboundMessageAttempt;
declare const envelope: Parameters<
  ReturnType<typeof createControlledAgentSseValidatorV1>['validate']
>[0];
declare const alignmentPolicy: RoleAlignmentPolicyV1;
declare const alignmentState: RoleAlignmentStateV1;
declare const alignmentAssessment: RoleAlignmentAssessmentV1;
declare const alignmentControl: RoleAlignmentPortableAgentControlV1;

const validator = createControlledAgentSseValidatorV1();
validator.validate(envelope);
void entry.contentDigest;
void request.capabilityHandleId;
void scope.policyId;
void attempt.messageDigest;
void alignmentPolicy.policyId;
void alignmentState.stateDigest;
void alignmentAssessment.targetDigest;
void alignmentControl.binding.policyDigest;
