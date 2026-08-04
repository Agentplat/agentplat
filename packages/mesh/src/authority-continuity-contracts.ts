/** Public contracts for certified issuer and work-owner succession. */

export const MESH_AUTHORITY_CONTINUITY_SCHEMA_VERSION = 1 as const;

export type MeshAuthorityScopeKindV1 = "objective_issuer" | "work_owner";

export interface MeshAuthorityScopeV1 {
  readonly schemaVersion: 1;
  readonly kind: MeshAuthorityScopeKindV1;
  readonly tenantId: string;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly workItemId: string | null;
}

export interface MeshAuthorityIdentityV1 {
  readonly schemaVersion: 1;
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
}

export interface MeshAuthorityContinuityPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyRevision: number;
  readonly witnessPeerIds: readonly string[];
  readonly witnessThreshold: number;
  readonly recoveryDelayMs: number;
  readonly maximumProposalLifetimeMs: number;
  readonly validUntilLogicalMs: number;
  readonly policyDigest: string;
}

export interface MeshAuthorityHeadV1 {
  readonly schemaVersion: 1;
  readonly scope: MeshAuthorityScopeV1;
  readonly scopeKey: string;
  readonly generation: number;
  readonly holder: MeshAuthorityIdentityV1;
  readonly activatedBy: "bootstrap" | "certified_transition";
  readonly activationId: string;
  readonly predecessorHeadDigest: string | null;
  readonly fencingToken: string;
  readonly activatedAtLogicalMs: number;
  readonly holderValidUntilLogicalMs: number;
  readonly policy: MeshAuthorityContinuityPolicyV1;
  readonly headDigest: string;
}

export type MeshAuthorityTransitionModeV1 =
  "coordinated_transfer" | "witness_recovery";

export interface MeshAuthorityProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly scope: MeshAuthorityScopeV1;
  readonly scopeKey: string;
  readonly mode: MeshAuthorityTransitionModeV1;
  readonly previousHeadDigest: string;
  readonly previousGeneration: number;
  readonly proposedGeneration: number;
  readonly previousHolder: MeshAuthorityIdentityV1;
  readonly successor: MeshAuthorityIdentityV1;
  readonly successorValidUntilLogicalMs: number;
  readonly successorPolicy: MeshAuthorityContinuityPolicyV1;
  readonly proposedAtLogicalMs: number;
  readonly notBeforeLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly proposalDigest: string;
}

export interface MeshAuthorityEndorsementV1 {
  readonly schemaVersion: 1;
  readonly endorsementId: string;
  readonly scopeKey: string;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly witnessPeerId: string;
  readonly observedUnavailableSinceLogicalMs: number;
  readonly endorsedAtLogicalMs: number;
  readonly endorsementDigest: string;
}

export interface MeshAuthorityCertificateV1 {
  readonly schemaVersion: 1;
  readonly certificateId: string;
  readonly scopeKey: string;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly previousHeadDigest: string;
  readonly proposedGeneration: number;
  readonly mode: MeshAuthorityTransitionModeV1;
  readonly endorsementDigests: readonly string[];
  readonly witnessPeerIds: readonly string[];
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly certificateDigest: string;
}

export interface MeshAuthorityAcceptanceV1 {
  readonly schemaVersion: 1;
  readonly acceptanceId: string;
  readonly scopeKey: string;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly certificateId: string;
  readonly certificateDigest: string;
  readonly successor: MeshAuthorityIdentityV1;
  readonly acceptedAtLogicalMs: number;
  readonly acceptanceDigest: string;
}

export interface MeshAuthorityProofV1 {
  readonly schemaVersion: 1;
  readonly algorithm: string;
  readonly value: string;
}

export type MeshAuthoritySignedStatementV1 =
  | MeshAuthorityProposalV1
  | MeshAuthorityEndorsementV1
  | MeshAuthorityAcceptanceV1;

export interface MeshAuthoritySignedRecordV1<
  TStatement extends MeshAuthoritySignedStatementV1 =
    MeshAuthoritySignedStatementV1,
> {
  readonly schemaVersion: 1;
  readonly statement: TStatement;
  readonly signer: MeshAuthorityIdentityV1;
  readonly proof: MeshAuthorityProofV1;
}

export interface MeshAuthorityTransitionEvidenceV1 {
  readonly schemaVersion: 1;
  readonly previousHead: MeshAuthorityHeadV1;
  readonly proposal: MeshAuthoritySignedRecordV1<MeshAuthorityProposalV1>;
  readonly endorsements: readonly MeshAuthoritySignedRecordV1<MeshAuthorityEndorsementV1>[];
  readonly certificate: MeshAuthorityCertificateV1;
  readonly acceptance: MeshAuthoritySignedRecordV1<MeshAuthorityAcceptanceV1>;
  readonly resultingHeadDigest: string;
}

export interface MeshAuthorityContinuitySnapshotV1 {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly scopeKey: string;
  readonly verifierId: string;
  readonly verifierVersion: number;
  readonly verifierImplementationId: string;
  readonly eligibilityId: string;
  readonly eligibilityVersion: number;
  readonly eligibilityImplementationId: string;
  readonly maximumTransitions: number;
  readonly maximumProofBytes: number;
  readonly head: MeshAuthorityHeadV1;
  readonly activeProposal: MeshAuthoritySignedRecordV1<MeshAuthorityProposalV1> | null;
  readonly endorsements: readonly MeshAuthoritySignedRecordV1<MeshAuthorityEndorsementV1>[];
  readonly certificate: MeshAuthorityCertificateV1 | null;
  readonly transitions: readonly MeshAuthorityTransitionEvidenceV1[];
  readonly lastLogicalTimeMs: number;
  readonly snapshotDigest: string;
}

export interface MeshAuthorityContinuityStoreV1 {
  load(
    scopeKey: string,
  ): Promise<MeshAuthorityContinuitySnapshotV1 | undefined>;
  compareAndSwap(input: {
    readonly scopeKey: string;
    readonly expectedRevision: number | null;
    readonly next: MeshAuthorityContinuitySnapshotV1;
  }): Promise<boolean>;
}

export interface MeshAuthorityEvidenceVerificationRequestV1 {
  readonly schemaVersion: 1;
  readonly purpose: "proposal" | "endorsement" | "acceptance";
  readonly scope: MeshAuthorityScopeV1;
  readonly record: MeshAuthoritySignedRecordV1;
  readonly logicalTimeMs: number;
}

export type MeshAuthorityEvidenceVerificationDecisionV1 =
  | { readonly verified: true; readonly reasonCode: "verified" }
  | { readonly verified: false; readonly reasonCode: string };

export interface MeshAuthorityEvidenceVerifierV1 {
  readonly verifierId: string;
  readonly verifierVersion: number;
  readonly implementationId: string;
  verify(
    request: MeshAuthorityEvidenceVerificationRequestV1,
  ):
    | MeshAuthorityEvidenceVerificationDecisionV1
    | Promise<MeshAuthorityEvidenceVerificationDecisionV1>;
}

export interface MeshAuthoritySuccessorEligibilityRequestV1 {
  readonly schemaVersion: 1;
  readonly scope: MeshAuthorityScopeV1;
  readonly successor: MeshAuthorityIdentityV1;
  readonly proposedGeneration: number;
  readonly logicalTimeMs: number;
}

export type MeshAuthoritySuccessorEligibilityDecisionV1 =
  | { readonly eligible: true; readonly reasonCode: "eligible" }
  | { readonly eligible: false; readonly reasonCode: string };

export interface MeshAuthoritySuccessorEligibilityV1 {
  readonly eligibilityId: string;
  readonly eligibilityVersion: number;
  readonly implementationId: string;
  check(
    request: MeshAuthoritySuccessorEligibilityRequestV1,
  ):
    | MeshAuthoritySuccessorEligibilityDecisionV1
    | Promise<MeshAuthoritySuccessorEligibilityDecisionV1>;
}

export interface MeshAuthorityContinuityRuntimeOptionsV1 {
  readonly store: MeshAuthorityContinuityStoreV1;
  readonly verifier: MeshAuthorityEvidenceVerifierV1;
  readonly eligibility: MeshAuthoritySuccessorEligibilityV1;
  readonly maximumTransitions?: number;
  readonly maximumProofBytes?: number;
}

export interface MeshAuthorityInitializeInputV1 {
  readonly head: MeshAuthorityHeadV1;
  readonly logicalTimeMs: number;
}

export interface MeshAuthorityRecordProposalInputV1 {
  readonly scopeKey: string;
  readonly expectedRevision: number;
  readonly proposal: MeshAuthoritySignedRecordV1<MeshAuthorityProposalV1>;
  readonly logicalTimeMs: number;
}

export interface MeshAuthorityRecordEndorsementInputV1 {
  readonly scopeKey: string;
  readonly expectedRevision: number;
  readonly endorsement: MeshAuthoritySignedRecordV1<MeshAuthorityEndorsementV1>;
  readonly logicalTimeMs: number;
}

export interface MeshAuthorityIssueCertificateInputV1 {
  readonly scopeKey: string;
  readonly expectedRevision: number;
  readonly proposalId: string;
  readonly logicalTimeMs: number;
}

export interface MeshAuthorityAcceptInputV1 {
  readonly scopeKey: string;
  readonly expectedRevision: number;
  readonly acceptance: MeshAuthoritySignedRecordV1<MeshAuthorityAcceptanceV1>;
  readonly logicalTimeMs: number;
}

export interface MeshAuthorityCurrentBindingV1 {
  readonly schemaVersion: 1;
  readonly scopeKey: string;
  readonly generation: number;
  readonly holder: MeshAuthorityIdentityV1;
  readonly headDigest: string;
  readonly fencingToken: string;
  readonly logicalTimeMs: number;
}

export type MeshAuthorityCurrentnessDecisionV1 =
  | {
      readonly current: true;
      readonly reasonCode: "current";
      readonly head: MeshAuthorityHeadV1;
    }
  | {
      readonly current: false;
      readonly reasonCode: string;
      readonly head: MeshAuthorityHeadV1 | null;
    };

export type MeshAuthorityContinuityErrorCodeV1 =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "STATE_CONFLICT"
  | "EVIDENCE_REJECTED"
  | "SUCCESSOR_INELIGIBLE"
  | "TRANSITION_NOT_READY";

export class MeshAuthorityContinuityErrorV1 extends Error {
  readonly name = "MeshAuthorityContinuityErrorV1";

  constructor(
    readonly code: MeshAuthorityContinuityErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}
