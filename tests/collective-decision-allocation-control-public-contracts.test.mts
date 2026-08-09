import {
  COLLECTIVE_DECISION_SCHEMA_VERSION_V1,
  InMemoryCollectiveDecisionStoreV1,
  createCollectiveDecisionRuntimeV1,
  type CollectiveDecisionCandidateV1,
  type CollectiveDecisionCertificateV1,
  type CollectiveDecisionPolicyV1,
  type CollectiveDecisionPortV1,
  type CollectiveDecisionRuntimeOptionsV1,
  type CollectiveDecisionStateV1,
} from "@agentplat/collective-runtime/collective-decision";
import {
  MECHANISM_ALLOCATION_SCHEMA_VERSION_V1,
  InMemoryMechanismAllocationStoreV1,
  MechanismAllocationRuntimeV1,
  createMechanismDecompositionFromPlanningStateV1,
  createTeamFormationRequestFromMechanismAllocationV1,
  verifyMechanismAllocationStateAdmissionsV1,
  type MechanismAllocationAdmittedEventV1,
  type MechanismAllocationAdmissionPortV1,
  type MechanismAllocationPortV1,
  type MechanismAllocationRuntimeOptionsV1,
  type MechanismAllocationStateV1,
} from "@agentplat/collective-runtime/mechanism-allocation";
import {
  COORDINATION_CONTROL_SCHEMA_VERSION_V1,
  CoordinationControlRuntimeV1,
  InMemoryCoordinationControlStoreV1,
  type CoordinationControlEvidenceV1,
  type CoordinationControlEvidenceResolutionPortV1,
  type CoordinationControlPortV1,
  type CoordinationControlProposalV1,
  type CoordinationControlRuntimeOptionsV1,
} from "@agentplat/collective-runtime/coordination-control";
import type { CollectivePeerHostFacadeV1 } from "@agentplat/collective-runtime/host";
import {
  createCollectiveDecisionAgreementCertificationPortV1,
  type CollectiveDecisionAgreementCertificationOptionsV1,
} from "@agentplat/collective-quorum/collective-decision";

void COLLECTIVE_DECISION_SCHEMA_VERSION_V1;
void MECHANISM_ALLOCATION_SCHEMA_VERSION_V1;
void COORDINATION_CONTROL_SCHEMA_VERSION_V1;
void InMemoryCollectiveDecisionStoreV1;
void InMemoryMechanismAllocationStoreV1;
void InMemoryCoordinationControlStoreV1;
void MechanismAllocationRuntimeV1;
void CoordinationControlRuntimeV1;
void createMechanismDecompositionFromPlanningStateV1;
void createTeamFormationRequestFromMechanismAllocationV1;
void verifyMechanismAllocationStateAdmissionsV1;

declare const decisionOptions: CollectiveDecisionRuntimeOptionsV1;
declare const decisionCandidate: CollectiveDecisionCandidateV1;
declare const decisionCertificate: CollectiveDecisionCertificateV1;
declare const decisionPolicy: CollectiveDecisionPolicyV1;
declare const decisionPort: CollectiveDecisionPortV1;
declare const admittedEvent: MechanismAllocationAdmittedEventV1;
declare const admissionPort: MechanismAllocationAdmissionPortV1;
declare const allocationOptions: MechanismAllocationRuntimeOptionsV1;
declare const allocationPort: MechanismAllocationPortV1;
declare const controlEvidence: readonly CoordinationControlEvidenceV1[];
declare const evidenceResolution: CoordinationControlEvidenceResolutionPortV1;
declare const controlOptions: CoordinationControlRuntimeOptionsV1;
declare const controlPort: CoordinationControlPortV1;
declare const host: CollectivePeerHostFacadeV1;
declare const agreementOptions: CollectiveDecisionAgreementCertificationOptionsV1;

const constructedDecisionPort: CollectiveDecisionPortV1 =
  createCollectiveDecisionRuntimeV1(decisionOptions);
const verifiedCertificate: Promise<CollectiveDecisionCertificateV1> =
  decisionPort.verify({
    candidate: decisionCandidate,
    certificate: decisionCertificate,
    logicalTimeMs: 1,
  });
const allocated: Promise<MechanismAllocationStateV1> =
  allocationPort.submit(admittedEvent);
const constructedAllocationPort: MechanismAllocationPortV1 =
  new MechanismAllocationRuntimeV1(allocationOptions);
const controlled: Promise<CoordinationControlProposalV1> = controlPort.evaluate(
  { logicalTimeMs: 1, evidence: controlEvidence },
);
const constructedControlPort: CoordinationControlPortV1 =
  new CoordinationControlRuntimeV1(controlOptions);
const hostAllocated: Promise<MechanismAllocationStateV1> =
  host.allocate(admittedEvent);
const agreementCertification =
  createCollectiveDecisionAgreementCertificationPortV1(agreementOptions);

declare const decisionState: CollectiveDecisionStateV1;
void constructedDecisionPort;
void verifiedCertificate;
void admissionPort;
void allocated;
void constructedAllocationPort;
void evidenceResolution;
void controlled;
void constructedControlPort;
void hostAllocated;
void agreementCertification;
void decisionState.compacted;
void decisionPolicy.maximumCompactedHeads;
