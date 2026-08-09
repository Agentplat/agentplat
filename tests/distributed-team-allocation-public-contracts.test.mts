import {
  DISTRIBUTED_TEAM_ALLOCATION_STATE_FORMAT_V2,
  DistributedTeamAllocationRuntimeV2,
  InMemoryDistributedTeamAllocationStoreV2,
  distributedTeamFormationAuthorizationDigestV2,
  type DistributedTeamAllocationActivationContextV2,
  type DistributedTeamAllocationActivationPortV2,
  type DistributedTeamAllocationCandidatePortV2,
  type DistributedTeamAllocationDecisionBindingV2,
  type DistributedTeamAllocationEventPortV2,
  type DistributedTeamAllocationFenceV2,
  type DistributedTeamAllocationFormationPortV2,
  type DistributedTeamAllocationPlanningV2,
  type DistributedTeamAllocationPortV2,
  type DistributedTeamAllocationRuntimeOptionsV2,
  type DistributedTeamAllocationStateV2,
  type DistributedTeamAllocationStoreV2,
  type DistributedTeamAllocationWorkContractPortV2,
} from "@agentplat/collective-runtime/distributed-team-allocation";

void DISTRIBUTED_TEAM_ALLOCATION_STATE_FORMAT_V2;
void DistributedTeamAllocationRuntimeV2;
void InMemoryDistributedTeamAllocationStoreV2;

declare const options: DistributedTeamAllocationRuntimeOptionsV2;
declare const port: DistributedTeamAllocationPortV2;
declare const state: DistributedTeamAllocationStateV2;
declare const planning: DistributedTeamAllocationPlanningV2;
declare const decisionBinding: DistributedTeamAllocationDecisionBindingV2;
declare const events: DistributedTeamAllocationEventPortV2;
declare const activation: DistributedTeamAllocationActivationPortV2;
declare const activationContext: DistributedTeamAllocationActivationContextV2;
declare const fence: DistributedTeamAllocationFenceV2;
declare const formation: DistributedTeamAllocationFormationPortV2;
declare const candidates: DistributedTeamAllocationCandidatePortV2;
declare const workContracts: DistributedTeamAllocationWorkContractPortV2;
declare const store: DistributedTeamAllocationStoreV2;

const constructed: DistributedTeamAllocationPortV2 =
  new DistributedTeamAllocationRuntimeV2(options);
const advanced: Promise<DistributedTeamAllocationStateV2> = port.advance({
  logicalTimeMs: 1,
});
const preparedFormationIdentity: string | null = state.formationRequestId;
const preparedFormationTime: number | null =
  state.formationRequestLogicalTimeMs;
const preparedFormationRequest = state.formationRequest;
const certifiedRosterDecision = state.decision;
const formationAuthorizationDigest = state.formationAuthorizationDigest;
const allocationAuctionDigest = state.allocationAuctionDigest;
const allocationRound = state.allocationRound;
const invalidatedFormation = formation.invalidate({
  formationRequestDigest: state.formationRequestDigest!,
  formationAuthorizationDigest: state.formationAuthorizationDigest!,
  reasonCode: "allocation_fence_advanced",
  logicalTimeMs: 1,
  requestValidUntilLogicalMs: state.formationRequest!.validUntilLogicalMs,
});
const cancelledFormation = formation.cancel({
  reasonCode: "allocation_fence_advanced",
  logicalTimeMs: 1,
  expectedProposalDigest: state.formationProposalDigest!,
});

void constructed;
void advanced;
void preparedFormationIdentity;
void preparedFormationTime;
void preparedFormationRequest;
void certifiedRosterDecision;
void formationAuthorizationDigest;
void allocationAuctionDigest;
void allocationRound;
void invalidatedFormation;
void cancelledFormation;
void distributedTeamFormationAuthorizationDigestV2;
void planning;
void decisionBinding;
void events;
void activation;
void activationContext;
void fence;
void formation;
void candidates;
void workContracts;
void store;
