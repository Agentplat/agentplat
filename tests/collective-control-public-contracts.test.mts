import {
  COLLECTIVE_CONTROL_SCHEMA_VERSION,
  createCollectiveAuthorityStateV1,
  createCollectiveExecutionStateV1,
  type CollectiveAuthorityStateV1,
  type CollectiveExecutionStateV1,
  type DelegationMandateV1,
} from "@agentplat/collective-control";
import {
  issueGovernedActionPermitV1,
  type GovernedActionPermitV1,
} from "@agentplat/collective-control/actions";
import { COLLECTIVE_EVALUATION_CONTRACT_VERSION } from "@agentplat/collective-control/evaluation";
import {
  MemoryCollectiveAuthorityRepositoryV1,
  MemoryCollectiveExecutionRepositoryV1,
} from "@agentplat/collective-control/memory";
import {
  createGovernedMeshObjectiveInboundProcessorV1,
  createWorkContractFromMeshV1,
  evaluateWorkContractCurrentnessV1,
  parseDelegationMandateReferenceV1,
  registerWorkContractV1,
  type GovernedMeshObjectiveInboundProcessorV1,
  type WorkContractV1,
} from "@agentplat/collective-control/mesh";
import type { MandateRoomProvenanceV1 } from "@agentplat/collective-control/rooms";

declare const mandate: DelegationMandateV1;
declare const permit: GovernedActionPermitV1;
declare const workContract: WorkContractV1;
declare const executionState: CollectiveExecutionStateV1;

const authorityState: CollectiveAuthorityStateV1 =
  createCollectiveAuthorityStateV1({
    tenantId: "tenant:public-test",
    policyDomainId: "policy-domain:public-test",
  });
const emptyExecutionState = createCollectiveExecutionStateV1({
  tenantId: "tenant:public-test",
  policyDomainId: "policy-domain:public-test",
});
const authorityRepository = new MemoryCollectiveAuthorityRepositoryV1(
  authorityState,
);
const executionRepository = new MemoryCollectiveExecutionRepositoryV1(
  emptyExecutionState,
);

void registerWorkContractV1;
void createGovernedMeshObjectiveInboundProcessorV1;
void createWorkContractFromMeshV1;
void evaluateWorkContractCurrentnessV1;
void parseDelegationMandateReferenceV1;
void (null as GovernedMeshObjectiveInboundProcessorV1 | null);
void issueGovernedActionPermitV1;
void mandate;
void permit;
void workContract;
void executionState;
void authorityRepository;
void executionRepository;
void (null as MandateRoomProvenanceV1 | null);
void COLLECTIVE_CONTROL_SCHEMA_VERSION;
void COLLECTIVE_EVALUATION_CONTRACT_VERSION;

// @ts-expect-error schema versions are closed and cannot be widened.
const invalidSchemaVersion: typeof COLLECTIVE_CONTROL_SCHEMA_VERSION = 2;
// @ts-expect-error a governed permit cannot use an unrecognized status.
const invalidPermitStatus: GovernedActionPermitV1["status"] = "approved";
// @ts-expect-error execution state arrays are immutable through the public type.
emptyExecutionState.actionPermits.push(permit);

void invalidSchemaVersion;
void invalidPermitStatus;
