import {
  CollectiveAgreementClientV1,
  CollectiveAgreementPeerV1,
  InMemoryCollectiveAgreementRepositoryV1,
  InMemoryCollectiveAgreementTransportV1,
  applyCollectiveAgreementCatchupBundleV1,
  collectiveAgreementProposerV1,
  createCollectiveAgreementCatchupBundleV1,
  createCollectiveAgreementEquivocationEvidenceV1,
  createCollectiveAgreementJointReconfigurationCertificateV1,
  createCollectiveAgreementMembershipReconfigurationValueV1,
  createCollectiveAgreementMembershipV1,
  createCollectiveAgreementPlanningSlotValueV1,
  createCollectiveAgreementRuntimePortsV1,
  createCollectiveAgreementSynchronizationValueV1,
  createCollectiveAgreementValueV1,
  handleCollectiveAgreementHttpRequestV1,
  verifyCollectiveAgreementCommitCertificateV1,
  verifyCollectiveAgreementJointReconfigurationCertificateV1,
  verifyCollectiveAgreementLiveEnvelopeV1,
} from "@agentplat/collective-quorum/agreement";
import type {
  CollectiveAgreementCommitCertificateV1,
  CollectiveAgreementDecisionPortV1,
  CollectiveAgreementEquivocationProofV1,
  CollectiveAgreementMembershipPortV1,
  CollectiveAgreementMembershipV1,
  CollectiveAgreementRepositoryV1,
  CollectiveAgreementRuntimePortsV1,
} from "@agentplat/collective-quorum/agreement";
import {
  PostgresCollectiveAgreementRepositoryV1,
  runMigrations,
} from "@agentplat/collective-quorum-postgres/agreement";

const repository: CollectiveAgreementRepositoryV1 =
  new InMemoryCollectiveAgreementRepositoryV1();
const membership = null as unknown as CollectiveAgreementMembershipV1;
const membershipPort = null as unknown as CollectiveAgreementMembershipPortV1;
const decision = null as unknown as CollectiveAgreementDecisionPortV1;
const proof = null as unknown as CollectiveAgreementEquivocationProofV1;
const commit = null as unknown as CollectiveAgreementCommitCertificateV1;
const resolver =
  null as unknown as import("@agentplat/mesh-crypto").MeshKeyResolver;
const clock =
  null as unknown as import("@agentplat/collective-quorum/agreement").CollectiveAgreementClockV1;

void CollectiveAgreementClientV1;
void CollectiveAgreementPeerV1;
void InMemoryCollectiveAgreementTransportV1;
void PostgresCollectiveAgreementRepositoryV1;
void repository;
void membership;
void membershipPort;
void decision;
void proof;
void commit;
void applyCollectiveAgreementCatchupBundleV1;
void collectiveAgreementProposerV1;
void createCollectiveAgreementCatchupBundleV1;
void createCollectiveAgreementEquivocationEvidenceV1;
void createCollectiveAgreementJointReconfigurationCertificateV1;
void createCollectiveAgreementMembershipReconfigurationValueV1;
void createCollectiveAgreementMembershipV1;
void createCollectiveAgreementPlanningSlotValueV1;
void createCollectiveAgreementRuntimePortsV1;
void createCollectiveAgreementSynchronizationValueV1;
void createCollectiveAgreementValueV1;
void handleCollectiveAgreementHttpRequestV1;
void verifyCollectiveAgreementCommitCertificateV1;
void verifyCollectiveAgreementJointReconfigurationCertificateV1;
void verifyCollectiveAgreementLiveEnvelopeV1;
void runMigrations;

const ports: CollectiveAgreementRuntimePortsV1 =
  createCollectiveAgreementRuntimePortsV1({
    policyDomainId: "policy.1",
    agreement: decision,
    membership: membershipPort,
    resolver,
    clock,
  });
void ports.assignmentConfirmation;
void ports.recoveryElection;
