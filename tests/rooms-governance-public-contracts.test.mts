import {
  AgentGovernanceServiceV1,
  InMemoryAgentGovernanceStoreV1,
  type AgentGovernanceAccessV1,
  type AgentGovernanceCommandV1,
  type AgentDefinitionRegistry,
} from "@agentplat/rooms";
import { PostgresAgentGovernanceStoreV1 } from "@agentplat/rooms-postgres";
const access: AgentGovernanceAccessV1<Request> = {
  authenticate: async () => null,
  authorize: async () => false,
};
declare const definitions: AgentDefinitionRegistry;
const service = new AgentGovernanceServiceV1(
  new InMemoryAgentGovernanceStoreV1(),
  access,
  definitions,
);
void service;
void PostgresAgentGovernanceStoreV1;
const transfer: AgentGovernanceCommandV1 = {
  kind: "transfer_accept",
  transferId: "offer",
};
const delegation: AgentGovernanceCommandV1 = {
  kind: "delegations",
  delegations: [
    {
      subjectId: "s",
      // @ts-expect-error purpose authority cannot be delegated
      operation: "purpose",
      expiresAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};
// @ts-expect-error activation is unavailable in this increment
const activation: AgentGovernanceCommandV1 = { kind: "resume" };
void transfer;
void delegation;
void activation;
