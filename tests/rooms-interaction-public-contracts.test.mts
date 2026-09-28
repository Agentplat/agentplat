import {
  type AgentInteractionBindingV1,
  type CreateAgentDefinitionRevisionInput,
  resolveAgentInteractionBindingV1,
} from '@agentplat/rooms';

const legacy: CreateAgentDefinitionRevisionInput = {
  tenantId: 't', agentId: 'a', version: '1.0.0', instructions: 'Work', runtimeProfile: {},
};
const purpose: AgentInteractionBindingV1 = {
  schemaVersion: 1, interactionMode: 'purpose', governanceId: 'g',
};
const configured: CreateAgentDefinitionRevisionInput = { ...legacy, interaction: purpose };
resolveAgentInteractionBindingV1(configured);
// @ts-expect-error purpose configuration requires a governance reference
const missing: AgentInteractionBindingV1 = { schemaVersion: 1, interactionMode: 'purpose' };
// @ts-expect-error unknown modes are not accepted
const unknown: AgentInteractionBindingV1 = { schemaVersion: 1, interactionMode: 'automatic' };
void missing; void unknown;
