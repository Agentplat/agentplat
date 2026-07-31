import type { JsonObject } from '@agentplat/core';
import type { AgentSseEnvelope } from '@agentplat/streaming';
import {
  type ControlledAgentRunEventV1,
  createControlledAgentSseValidatorV1,
} from '@agentplat/inference-control/runtime';
import type { ControlledModelRequestV1 } from '@agentplat/inference-control/model';

const envelope = null as unknown as AgentSseEnvelope<ControlledAgentRunEventV1>;
const event = null as unknown as ControlledAgentRunEventV1;
const payload: JsonObject | undefined = event.payload;
const validator = createControlledAgentSseValidatorV1();
validator.validate(envelope);
void payload;

const request = null as unknown as ControlledModelRequestV1;
void request.capabilityHandleId;
