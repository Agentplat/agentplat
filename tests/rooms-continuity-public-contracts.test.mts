import {
  AgentContinuityServiceV1,
  InMemoryAgentContinuityStoreV1,
  createRoomHandoffContinuityEvidenceV1,
  createGovernedHandoffRevisionResolverV1,
  withPurposeHandoffIntakeV1,
  type AgentOriginV1,
  type AgentContinuityEvidencePortV1,
  type AgentGovernanceCommandV1,
} from "@agentplat/rooms";
import { PostgresAgentContinuityStoreV1 } from "@agentplat/rooms-postgres";
import {
  createGovernanceAutonomySupervisionV1,
  combineGovernanceSupervisionV1,
  createEvolutionContinuityEvidenceV1,
  createGenesisGovernanceCommandV1,
} from "@agentplat/workflows-rooms";
const origin: AgentOriginV1 = {
  parentAgentId: "parent",
  continuityId: "lineage",
  kind: "genesis",
};
const create: AgentGovernanceCommandV1 = {
  kind: "create",
  governanceId: "g",
  ownerId: "owner",
  purpose: "purpose",
  definitionRevisionId: "def",
  origin,
};
const detach: AgentGovernanceCommandV1 = {
  kind: "mode",
  definitionRevisionId: "new-def",
  // @ts-expect-error model changes cannot detach inherited authority or budget
  origin: undefined,
};
const evidence: AgentContinuityEvidencePortV1 = {
  // @ts-expect-error receipt provenance is a required host verifier contract
  verify: async () => ({ compatible: true }),
};
void [
  create,
  detach,
  evidence,
  AgentContinuityServiceV1,
  InMemoryAgentContinuityStoreV1,
  PostgresAgentContinuityStoreV1,
  createRoomHandoffContinuityEvidenceV1,
  createGovernedHandoffRevisionResolverV1,
  withPurposeHandoffIntakeV1,
  createGovernanceAutonomySupervisionV1,
  combineGovernanceSupervisionV1,
  createEvolutionContinuityEvidenceV1,
  createGenesisGovernanceCommandV1,
];
