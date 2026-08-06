import type {
  EvidenceFusionDecisionV1,
  QuarantineRecoveryDecisionV1,
  TrustEligibilityDecisionV1,
  TrustProfileV1,
} from "@agentplat/trust";
import type {
  CollectiveAgreementCommitCertificateV1,
  CollectiveAgreementDecisionPortV1,
  CollectiveAgreementMembershipPortV1,
  CollectiveAgreementSemanticPortV1,
} from "./agreement-contracts.js";

export type CollectiveTrustDispositionV1 =
  "eligible" | "restricted" | "quarantined" | "recovery_candidate";

export interface CollectiveTrustCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly tenantId: string;
  readonly subjectDigest: string;
  readonly scopeDigest: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly profileDigest: string;
  readonly fusionDecisionDigest: string;
  readonly eligibilityDecisionDigest: string;
  readonly evidenceSetDigest: string;
  readonly recoveryDecisionDigest: string | null;
  readonly disposition: CollectiveTrustDispositionV1;
  readonly previousCertifiedDecisionDigest: string | null;
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
}

export interface CertifiedCollectiveTrustDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly decisionDigest: string;
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly tenantId: string;
  readonly subjectDigest: string;
  readonly scopeDigest: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly profileDigest: string;
  readonly fusionDecisionDigest: string;
  readonly eligibilityDecisionDigest: string;
  readonly evidenceSetDigest: string;
  readonly recoveryDecisionDigest: string | null;
  readonly disposition: CollectiveTrustDispositionV1;
  readonly previousCertifiedDecisionDigest: string | null;
  readonly witnessPeerIds: readonly string[];
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly sourceCommitDigest: string;
  readonly observedAtLogicalMs: number;
  readonly certifiedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
}

export type CollectiveTrustGateDispositionV1 =
  "eligible" | "restricted" | "quarantined" | "unavailable";

export type CollectiveTrustGateReasonV1 =
  | "eligible"
  | "local_unavailable"
  | "local_restricted"
  | "local_quarantined"
  | "collective_unavailable"
  | "collective_binding_mismatch"
  | "collective_expired"
  | "collective_restricted"
  | "collective_quarantined"
  | "collective_recovery_pending";

export interface CollectiveTrustGatePolicyV1 {
  readonly schemaVersion: 1;
  readonly requireCertificate: boolean;
}

export interface CollectiveTrustGateDecisionV1 {
  readonly schemaVersion: 1;
  readonly gateDecisionId: string;
  readonly gateDecisionDigest: string;
  readonly tenantId: string;
  readonly subjectDigest: string;
  readonly scopeDigest: string;
  readonly policyDigest: string;
  readonly localEligibilityDecisionId: string;
  readonly localEligibilityDecisionDigest: string;
  readonly certifiedDecisionId: string | null;
  readonly certifiedDecisionDigest: string | null;
  readonly requireCertificate: boolean;
  readonly evaluatedAtLogicalMs: number;
  readonly disposition: CollectiveTrustGateDispositionV1;
  readonly reasonCode: CollectiveTrustGateReasonV1;
}

export interface CollectiveTrustCandidateConstructionInputV1 {
  readonly tenantId: string;
  readonly profile: TrustProfileV1;
  readonly fusionDecision: EvidenceFusionDecisionV1;
  readonly eligibilityDecision: TrustEligibilityDecisionV1;
  readonly recoveryDecision?: QuarantineRecoveryDecisionV1 | null;
  readonly previousCertifiedDecisionDigest: string | null;
  readonly validUntilLogicalMs: number;
  readonly crypto?: Crypto;
}

export interface CollectiveTrustCandidateResolutionPortV1 {
  validate(input: {
    readonly candidate: CollectiveTrustCandidateV1;
    readonly proposerPeerId: string;
    readonly policyDomainId: string;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly accepted: boolean; readonly reasonCode: string }>;
}

export interface CollectiveTrustProposerEligibilityPortV1 {
  evaluate(input: {
    readonly tenantId: string;
    readonly proposerPeerId: string;
    readonly candidateDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean> | boolean;
}

export interface CollectiveTrustDecisionHeadPortV1 {
  head(input: {
    readonly tenantId: string;
    readonly subjectDigest: string;
    readonly scopeDigest: string;
    readonly policyDigest: string;
  }): Promise<CertifiedCollectiveTrustDecisionV1 | null>;
}

export interface CollectiveTrustAgreementSemanticOptionsV1 {
  readonly policyDomainId: string;
  readonly candidates: CollectiveTrustCandidateResolutionPortV1;
  readonly heads: CollectiveTrustDecisionHeadPortV1;
  readonly proposerEligibility?: CollectiveTrustProposerEligibilityPortV1;
  readonly fallback?: CollectiveAgreementSemanticPortV1;
}

export interface CollectiveTrustAgreementCoordinateV1 {
  readonly height: number;
  readonly round: number;
  readonly previousCommitDigest: string | null;
}

export interface CollectiveTrustAgreementCoordinatePortV1 {
  resolve(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly candidateDigest: string;
    readonly previousCertifiedDecisionDigest: string | null;
    readonly logicalTimeMs: number;
  }):
    | Promise<CollectiveTrustAgreementCoordinateV1>
    | CollectiveTrustAgreementCoordinateV1;
}

export type CollectiveTrustDecisionSaveResultV1 =
  "stored" | "duplicate" | "conflict" | "stale_head" | "chain_gap";

export interface CollectiveTrustDecisionRepositoryV1 extends CollectiveTrustDecisionHeadPortV1 {
  save(input: {
    readonly decision: CertifiedCollectiveTrustDecisionV1;
    readonly expectedHeadDigest: string | null;
  }): Promise<CollectiveTrustDecisionSaveResultV1>;
  get(
    decisionDigest: string,
  ): Promise<CertifiedCollectiveTrustDecisionV1 | null>;
  list(input: {
    readonly tenantId: string;
    readonly subjectDigest: string;
    readonly scopeDigest: string;
    readonly policyDigest: string;
    readonly maximumCount: number;
  }): Promise<readonly CertifiedCollectiveTrustDecisionV1[]>;
}

export interface CollectiveTrustCertificationOptionsV1 {
  readonly policyDomainId: string;
  readonly agreement: CollectiveAgreementDecisionPortV1;
  readonly membership: CollectiveAgreementMembershipPortV1;
  readonly coordinates: CollectiveTrustAgreementCoordinatePortV1;
  readonly repository: CollectiveTrustDecisionRepositoryV1;
  readonly resolver: import("@agentplat/mesh-crypto").MeshKeyResolver;
  readonly clock: import("./agreement-contracts.js").CollectiveAgreementClockV1;
  readonly crypto?: Crypto;
}

export interface CollectiveTrustCertificationPortV1 {
  certify(input: {
    readonly candidate: CollectiveTrustCandidateV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<CertifiedCollectiveTrustDecisionV1 | null>;
}

export interface CollectiveTrustDecisionReconstructionInputV1 {
  readonly policyDomainId: string;
  readonly candidate: CollectiveTrustCandidateV1;
  readonly previousDecision: CertifiedCollectiveTrustDecisionV1 | null;
  readonly commit: CollectiveAgreementCommitCertificateV1;
  readonly membership: import("./agreement-contracts.js").CollectiveAgreementMembershipV1;
  readonly resolver: import("@agentplat/mesh-crypto").MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}

export interface CollectiveTrustEligibilityPortV1<TInput> {
  evaluate(
    input: TInput,
  ):
    | Promise<TrustEligibilityDecisionV1 | null>
    | TrustEligibilityDecisionV1
    | null;
}

export interface CollectiveTrustCertifiedDecisionResolverV1<TInput> {
  resolve(input: {
    readonly request: TInput;
    readonly localDecision: TrustEligibilityDecisionV1;
  }):
    | Promise<CertifiedCollectiveTrustDecisionV1 | null>
    | CertifiedCollectiveTrustDecisionV1
    | null;
}

export interface CollectiveTrustEligibilityFilterOptionsV1<TInput> {
  readonly tenantId: (input: TInput) => string;
  readonly logicalTimeMs: (input: TInput) => number;
  readonly local: CollectiveTrustEligibilityPortV1<TInput>;
  readonly collective: CollectiveTrustCertifiedDecisionResolverV1<TInput>;
  readonly policy: CollectiveTrustGatePolicyV1;
  readonly observe?: (
    decision: CollectiveTrustGateDecisionV1,
  ) => Promise<void> | void;
  readonly crypto?: Crypto;
}

export interface CollectiveTrustSynchronousGateResolverV1<TInput> {
  resolve(input: TInput): CollectiveTrustGateDecisionV1 | null;
}

export interface CollectiveTrustMeshEligibilityOptionsV1<
  TCandidate extends import("@agentplat/mesh/trust").MeshTrustCandidateV1,
> {
  readonly bindingDigest: string;
  readonly local: import("@agentplat/mesh/trust").MeshTrustEligibilityResolverV1;
  readonly gates: CollectiveTrustSynchronousGateResolverV1<TCandidate>;
}

export interface CollectiveTrustInferenceEligibilityOptionsV1 {
  readonly resolverId: string;
  readonly resolverVersion: number;
  readonly resolverDigest: string;
  readonly local: import("@agentplat/inference-control/trust").TrustEligibilityResolverV1;
  readonly gates: CollectiveTrustSynchronousGateResolverV1<
    import("@agentplat/inference-control/trust").TrustEligibilityTargetV1
  >;
}
