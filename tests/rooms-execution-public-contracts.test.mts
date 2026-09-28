import {
  type AgentExecutionLimitRuleV1,
  type AgentExecutionBindingV1,
  type AgentGovernanceCommandV1,
  AgentExecutionControllerV1,
  AgentExecutionLimitServiceV1,
  InMemoryAgentExecutionStoreV1,
} from "@agentplat/rooms";
import { PostgresAgentExecutionStoreV1 } from "@agentplat/rooms-postgres";
import {
  createAgentGovernanceActionGatewayV1,
  agentGovernanceActionTargetDigestV1,
} from "@agentplat/workflows-rooms";
const prepare: AgentGovernanceCommandV1 = { kind: "prepare_activation" };
const activate: AgentGovernanceCommandV1 = { kind: "activate" };
const budget: AgentExecutionLimitRuleV1 = {
  kind: "budget",
  budgetId: "spend",
  unit: "USD_cent",
  maximumUnits: 100,
};
// @ts-expect-error qualitative references are not mandatory limit rules
const reference: AgentExecutionLimitRuleV1 = { kind: "reference" };
// @ts-expect-error execution bindings require a profile digest and governance scope
const unbound: AgentExecutionBindingV1 = { tenantId: "t", agentId: "a" };
void prepare;
void activate;
void budget;
void reference;
void unbound;
void AgentExecutionControllerV1;
void AgentExecutionLimitServiceV1;
void InMemoryAgentExecutionStoreV1;
void PostgresAgentExecutionStoreV1;
void createAgentGovernanceActionGatewayV1;
void agentGovernanceActionTargetDigestV1;
