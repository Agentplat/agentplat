import {
  COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1,
  COORDINATION_CONTROL_GUARANTEE_STATE_FORMAT_V1,
  CoordinationControlGuaranteeRuntimeV1,
  InMemoryCoordinationControlGuaranteeAnchorV1,
  InMemoryCoordinationControlGuaranteeStoreV1,
  adaptGuaranteeProposalToCoordinationControlV1,
  createAuthenticatedGuaranteeTeamExecutionControlPortV1,
  createCoordinationControlGuaranteeExecutionReceiptV1,
  createCoordinationControlGuaranteePolicyV1,
  createCoordinationControlGuaranteeProposalV1,
  createCoordinationControlGuaranteeV1,
  createCoordinationControlTargetV1,
  type CoordinationControlGuaranteeAnchorPortV1,
  type CoordinationControlGuaranteeExecutionControlBindingV1,
  type CoordinationControlGuaranteePortV1,
  type CoordinationControlGuaranteeProposalV1,
  type CoordinationControlGuaranteeRuntimeOptionsV1,
  type CoordinationControlGuaranteeStateV1,
  type CoordinationControlGuaranteeStoreV1,
  type CoordinationControlGuaranteeReceiptLookupPortV1,
  type CoordinationControlGuaranteeV1,
  type CoordinationControlTargetV1,
} from "@agentplat/collective-runtime/coordination-control-guarantees";
import type { TeamExecutionControlEvidenceV1 } from "@agentplat/collective-runtime/team-execution";

void COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1;
void COORDINATION_CONTROL_GUARANTEE_STATE_FORMAT_V1;
void CoordinationControlGuaranteeRuntimeV1;
void InMemoryCoordinationControlGuaranteeAnchorV1;
void InMemoryCoordinationControlGuaranteeStoreV1;
void adaptGuaranteeProposalToCoordinationControlV1;
void createCoordinationControlGuaranteePolicyV1;
void createCoordinationControlGuaranteeProposalV1;
void createCoordinationControlGuaranteeV1;
void createCoordinationControlTargetV1;

declare const options: CoordinationControlGuaranteeRuntimeOptionsV1;
declare const port: CoordinationControlGuaranteePortV1;
declare const proposal: CoordinationControlGuaranteeProposalV1;
declare const guarantee: CoordinationControlGuaranteeV1;
declare const target: CoordinationControlTargetV1;
declare const state: CoordinationControlGuaranteeStateV1;
declare const store: CoordinationControlGuaranteeStoreV1;
declare const anchor: CoordinationControlGuaranteeAnchorPortV1;
declare const receiptLookup: CoordinationControlGuaranteeReceiptLookupPortV1;
declare const controlBinding: CoordinationControlGuaranteeExecutionControlBindingV1;

const constructed: CoordinationControlGuaranteePortV1 =
  new CoordinationControlGuaranteeRuntimeV1(options);
const negotiated: Promise<CoordinationControlGuaranteeProposalV1> =
  port.negotiate({ logicalTimeMs: 1 });
const executionAdapter = createAuthenticatedGuaranteeTeamExecutionControlPortV1({
  controlBinding,
  receipts: receiptLookup,
});
const executionEvidence: Promise<TeamExecutionControlEvidenceV1 | null> =
  executionAdapter.evidence({
    proposalDigest: proposal.proposalDigest,
    logicalTimeMs: proposal.evaluatedAtLogicalMs,
  });
void createCoordinationControlGuaranteeExecutionReceiptV1;

void constructed;
void negotiated;
void executionEvidence;
void guarantee;
void target;
void state;
void store;
void anchor;
