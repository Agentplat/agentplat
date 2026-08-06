import type { TrustEligibilityDecisionV1 } from "@agentplat/trust";
import type { RoleRealignmentTrustEligibilityPortV1 } from "@agentplat/inference-control/role-realignment/portable-agent";
import {
  InMemoryCollectiveTrustDecisionRepositoryV1,
  applyCollectiveTrustCommitV1,
  collectiveTrustSlotIdV1,
  createCollectiveTrustAgreementSemanticPortV1,
  createCollectiveTrustCandidateV1,
  createCollectiveTrustCertificationPortV1,
  createCollectiveTrustEligibilityFilterV1,
  createCollectiveTrustInferenceEligibilityResolverV1,
  createCollectiveTrustMeshEligibilityResolverV1,
  evaluateCollectiveTrustGateV1,
  reconstructCertifiedCollectiveTrustDecisionV1,
  validateCertifiedCollectiveTrustDecisionV1,
  validateCollectiveTrustCandidateV1,
} from "@agentplat/collective-quorum/trust-consensus";
import type {
  CertifiedCollectiveTrustDecisionV1,
  CollectiveTrustCandidateV1,
  CollectiveTrustDecisionRepositoryV1,
  CollectiveTrustEligibilityPortV1,
  CollectiveTrustGateDecisionV1,
} from "@agentplat/collective-quorum/trust-consensus";

const repository: CollectiveTrustDecisionRepositoryV1 =
  new InMemoryCollectiveTrustDecisionRepositoryV1();
const candidate = null as unknown as CollectiveTrustCandidateV1;
const certified = null as unknown as CertifiedCollectiveTrustDecisionV1;
const local = null as unknown as TrustEligibilityDecisionV1;
declare const gate: CollectiveTrustGateDecisionV1;

void applyCollectiveTrustCommitV1;
void collectiveTrustSlotIdV1(candidate);
void createCollectiveTrustAgreementSemanticPortV1;
void createCollectiveTrustCandidateV1;
void createCollectiveTrustCertificationPortV1;
void evaluateCollectiveTrustGateV1;
void reconstructCertifiedCollectiveTrustDecisionV1;
void validateCertifiedCollectiveTrustDecisionV1(certified);
void validateCollectiveTrustCandidateV1(candidate);
void repository;

type ExistingEligibilityInput = {
  readonly tenantId: string;
  readonly logicalTimeMs: number;
};

const existing: CollectiveTrustEligibilityPortV1<ExistingEligibilityInput> = {
  evaluate: () => local,
};
const filtered = createCollectiveTrustEligibilityFilterV1({
  tenantId: (input) => input.tenantId,
  logicalTimeMs: (input) => input.logicalTimeMs,
  local: existing,
  collective: { resolve: () => certified },
  policy: { schemaVersion: 1, requireCertificate: true },
});
void filtered.evaluate({ tenantId: "tenant.1", logicalTimeMs: 1 });

type RoleEligibilityInput = Parameters<
  RoleRealignmentTrustEligibilityPortV1["evaluate"]
>[0];
const roleLocal = null as unknown as RoleRealignmentTrustEligibilityPortV1;
const roleFiltered: RoleRealignmentTrustEligibilityPortV1 =
  createCollectiveTrustEligibilityFilterV1<RoleEligibilityInput>({
    tenantId: (input) => input.tenantId,
    logicalTimeMs: (input) => input.logicalTimeMs,
    local: roleLocal,
    collective: { resolve: () => certified },
    policy: { schemaVersion: 1, requireCertificate: true },
  });
void roleFiltered;

const meshFiltered = createCollectiveTrustMeshEligibilityResolverV1({
  bindingDigest: "d".repeat(64),
  local: {
    bindingDigest: "e".repeat(64),
    evaluate: () => "eligible",
  },
  gates: { resolve: () => gate },
});
void meshFiltered.evaluate({ peerId: "peer.1", capabilities: [] });

const inferenceLocal =
  null as unknown as import("@agentplat/inference-control/trust").TrustEligibilityResolverV1;
const inferenceFiltered = createCollectiveTrustInferenceEligibilityResolverV1({
  resolverId: "collective.trust.inference.1",
  resolverVersion: 1,
  resolverDigest: "0".repeat(64),
  local: inferenceLocal,
  gates: { resolve: () => gate },
});
void inferenceFiltered;

// @ts-expect-error Collective gate decisions are immutable public evidence.
gate.disposition = "eligible";
