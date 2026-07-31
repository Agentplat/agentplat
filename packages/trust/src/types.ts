import type { JsonValue } from "@agentplat/core";

export type TrustDigestDomainV1 =
  | "scope"
  | "subject"
  | "claim"
  | "claim-relation"
  | "attestation"
  | "attestation-relation"
  | "challenge"
  | "challenge-relation"
  | "challenge-resolution"
  | "retraction"
  | "retraction-relation"
  | "assertion"
  | "root-basis"
  | "content-resolution"
  | "content-resolution-invalidation"
  | "policy"
  | "source-binding"
  | "fusion-input"
  | "fusion-decision"
  | "profile-key"
  | "profile"
  | "eligibility-request"
  | "eligibility-decision"
  | "quarantine-key"
  | "quarantine-evidence-set"
  | "quarantine-record"
  | "recovery-evidence-set"
  | "recovery-decision"
  | "dependency-binding"
  | "causal-authorization"
  | "origin-proof"
  | "state"
  | "snapshot"
  | "snapshot-integrity"
  | "trace"
  | "observation";

export const TRUST_REASON_CODES_V1 = [
  "accepted",
  "duplicate",
  "pending_target",
  "invalid_json",
  "structural_limit_exceeded",
  "state_capacity_exceeded",
  "invalid_record",
  "invalid_identifier",
  "invalid_digest",
  "digest_mismatch",
  "unsupported_schema",
  "scope_mismatch",
  "subject_mismatch",
  "relationship_conflict",
  "relationship_target_missing",
  "evidence_cycle",
  "evidence_depth_exceeded",
  "evidence_unavailable",
  "evidence_stale",
  "content_unavailable",
  "content_digest_mismatch",
  "content_resolution_stale",
  "claim_subject_authority_invalid",
  "challenge_authority_invalid",
  "challenge_basis_unavailable",
  "source_not_effective",
  "source_role_invalid",
  "dependency_binding_missing",
  "dependency_binding_invalid",
  "dependency_group_conflict",
  "dependency_group_cap_exhausted",
  "support_threshold_missing",
  "contradiction_threshold_met",
  "fusion_contested",
  "root_basis_conflict",
  "challenge_unresolved",
  "challenge_dismissed",
  "challenge_sustained",
  "challenge_contested",
  "policy_missing",
  "policy_mismatch",
  "policy_lineage_invalid",
  "profile_unavailable",
  "profile_stale",
  "eligibility_restricted",
  "quarantine_activated",
  "quarantine_review_required",
  "quarantine_recovery_unavailable",
  "quarantine_recovery_insufficient",
  "quarantine_recovered",
  "logical_time_rollback",
  "state_conflict",
  "snapshot_invalid",
  "snapshot_integrity_invalid",
  "snapshot_rollback",
  "origin_proof_invalid",
  "remote_observation_unverified",
] as const;
export type TrustReasonCodeV1 = (typeof TRUST_REASON_CODES_V1)[number];

export interface StandaloneEvidenceScopeV1 {
  readonly schemaVersion: 1;
  readonly kind: "standalone";
  readonly tenantId: string;
  readonly namespace: string;
  readonly scopeId: string;
}
export interface MeshEvidenceScopeV1 {
  readonly schemaVersion: 1;
  readonly kind: "mesh";
  readonly tenantId: string;
  readonly meshId: string;
}
export interface ObjectiveEvidenceScopeV1 {
  readonly schemaVersion: 1;
  readonly kind: "objective";
  readonly tenantId: string;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
}
export interface WorkEvidenceScopeV1 {
  readonly schemaVersion: 1;
  readonly kind: "work";
  readonly tenantId: string;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
}
export interface ControlledRunEvidenceScopeV1 {
  readonly schemaVersion: 1;
  readonly kind: "controlled_run";
  readonly tenantId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly controlPolicyId: string;
  readonly controlPolicyVersion: number;
  readonly coordinatedScopeDigest: string | null;
}
export type EvidenceScopeV1 =
  | StandaloneEvidenceScopeV1
  | MeshEvidenceScopeV1
  | ObjectiveEvidenceScopeV1
  | WorkEvidenceScopeV1
  | ControlledRunEvidenceScopeV1;

export interface PeerTrustSubjectV1 {
  readonly schemaVersion: 1;
  readonly kind: "peer";
  readonly peerId: string;
}
export interface PeerCapabilityTrustSubjectV1 {
  readonly schemaVersion: 1;
  readonly kind: "peer_capability";
  readonly peerId: string;
  readonly capabilityKey: string;
  readonly capabilityVersion: string;
  readonly capabilityRevision: number;
}
export type TrustSubjectV1 = PeerTrustSubjectV1 | PeerCapabilityTrustSubjectV1;

export type EvidenceReferenceKindV1 =
  "evidence" | "mesh_record" | "control_record" | "external";
export interface EvidenceReferenceV1 {
  readonly schemaVersion: 1;
  readonly kind: EvidenceReferenceKindV1;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly referenceDigest: string;
}

export interface InlineSummaryEvidenceContentV1 {
  readonly kind: "inline_summary";
  readonly mediaType: string;
  readonly summary: string;
  readonly contentDigest: string;
  readonly encodedBytes: number;
}
export interface ReferenceEvidenceContentV1 {
  readonly kind: "reference";
  readonly mediaType: string;
  readonly reference: EvidenceReferenceV1;
  readonly contentDigest: string;
  readonly encodedBytes: number;
}
export type EvidenceContentV1 =
  InlineSummaryEvidenceContentV1 | ReferenceEvidenceContentV1;
export type EvidenceSourceKindV1 = "local" | "peer";
export type EvidenceOutcomeV1 = "satisfied" | "violated" | "inconclusive";

export interface EvidenceClaimV1 {
  readonly schemaVersion: 1;
  readonly claimId: string;
  readonly claimRelationDigest: string;
  readonly rootBasisDigest: string;
  readonly sourceId: string;
  readonly sourceKind: EvidenceSourceKindV1;
  readonly causationId: string | null;
  readonly subject: TrustSubjectV1;
  readonly scope: EvidenceScopeV1;
  readonly criterionId: string;
  readonly outcome: EvidenceOutcomeV1;
  readonly assertionDigest: string;
  readonly content: EvidenceContentV1 | null;
  readonly basisReferences: readonly EvidenceReferenceV1[];
  readonly observedAt: string | null;
}
export interface EvidenceAttestationV1 {
  readonly schemaVersion: 1;
  readonly attestationId: string;
  readonly attestationRelationDigest: string;
  readonly sourceId: string;
  readonly sourceKind: EvidenceSourceKindV1;
  readonly causationId: string | null;
  readonly scope: EvidenceScopeV1;
  readonly claimId: string;
  readonly claimDigest: string;
  readonly disposition: "support" | "contradict" | "inconclusive";
  readonly confidenceBasisPoints: number;
  readonly basisReferences: readonly EvidenceReferenceV1[];
  readonly observedAt: string | null;
}
export interface EvidenceChallengeV1 {
  readonly schemaVersion: 1;
  readonly challengeId: string;
  readonly challengeRelationDigest: string;
  readonly sourceId: string;
  readonly sourceKind: EvidenceSourceKindV1;
  readonly causationId: string | null;
  readonly scope: EvidenceScopeV1;
  readonly targetKind: "claim" | "attestation";
  readonly targetId: string;
  readonly targetDigest: string;
  readonly reasonCode: TrustReasonCodeV1;
  readonly basisReferences: readonly EvidenceReferenceV1[];
  readonly observedAt: string | null;
}
export interface EvidenceRetractionV1 {
  readonly schemaVersion: 1;
  readonly retractionId: string;
  readonly retractionRelationDigest: string;
  readonly sourceId: string;
  readonly sourceKind: EvidenceSourceKindV1;
  readonly causationId: string | null;
  readonly scope: EvidenceScopeV1;
  readonly targetKind: "claim" | "attestation";
  readonly targetId: string;
  readonly targetDigest: string;
  readonly reasonCode: TrustReasonCodeV1;
  readonly observedAt: string | null;
}
export type EvidenceRecordV1 =
  | EvidenceClaimV1
  | EvidenceAttestationV1
  | EvidenceChallengeV1
  | EvidenceRetractionV1;

/** A redacted projection. It is deliberately not an EvidenceRecordV1 or Fusion input. */
export interface TrustObservationV1 {
  readonly schemaVersion: 1;
  readonly observationId: string;
  readonly observerId: string;
  readonly observerKind: EvidenceSourceKindV1;
  readonly causationId: string | null;
  readonly subject: TrustSubjectV1;
  readonly scope: EvidenceScopeV1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly profileDigest: string;
  readonly fusionDecisionDigest: string;
  readonly dimensionId: string;
  readonly scoreBand: "unknown" | "low" | "medium" | "high";
  readonly uncertaintyBand: "low" | "medium" | "high";
  readonly disposition:
    "eligible" | "restricted" | "quarantined" | "unavailable";
  readonly evidenceIds: readonly string[];
  readonly observedAt: string;
  readonly validUntil: string;
  readonly reasonCodes: readonly TrustReasonCodeV1[];
}

export interface EvidenceTrustLimitsV1 {
  readonly maximumPolicies: number;
  readonly maximumDimensionsPerPolicy: number;
  readonly maximumCriteriaPerPolicy: number;
  readonly maximumSourceBindingsPerPolicy: number;
  readonly maximumDependencyGroupsPerPolicy: number;
  readonly maximumClaims: number;
  readonly maximumAttestations: number;
  readonly maximumChallenges: number;
  readonly maximumChallengesPerSourceScope: number;
  readonly maximumPendingChallengesPerSourceScope: number;
  readonly maximumRetractions: number;
  readonly maximumContentResolutions: number;
  readonly maximumContentInvalidations: number;
  readonly maximumCausalAuthorizations: number;
  readonly maximumDependencyBindingVersions: number;
  readonly maximumPendingRecords: number;
  readonly maximumPendingAgeMs: number;
  readonly maximumBasisReferencesPerRecord: number;
  readonly maximumRelationshipDepth: number;
  readonly maximumConsideredRecordsPerFusion: number;
  readonly maximumRetainedFusionDecisions: number;
  readonly maximumProfileHeads: number;
  readonly maximumProfileRevisionsPerHead: number;
  readonly maximumQuarantineHeads: number;
  readonly maximumDiagnostics: number;
  readonly maximumRecordCanonicalBytes: number;
  readonly maximumContentReferenceBytes: number;
  readonly maximumInlineSummaryBytes: number;
  readonly maximumStateCanonicalBytes: number;
  readonly maximumEvidenceAgeMs: number;
  readonly maximumReviewIntervalMs: number;
}

export type EvidenceSourceRoleV1 = "claim" | "attest" | "challenge" | "observe";
export type ClaimSourceRelationV1 =
  | "subject_self"
  | "work_assignee"
  | "work_owner"
  | "objective_observer"
  | "recovery_witness"
  | "local_system";
export type ChallengeSourceRelationV1 = ClaimSourceRelationV1 | "target_author";
export interface EvidenceBasisRuleV1 {
  readonly kind: EvidenceReferenceKindV1;
  readonly referenceType: string;
  readonly minimumCount: number;
  readonly maximumCount: number;
}
export interface ClaimAuthorityRuleV1 {
  readonly allowedSourceRelations: readonly ClaimSourceRelationV1[];
  readonly allowedBasisReferences: readonly EvidenceBasisRuleV1[];
}
export interface ChallengeAuthorityRuleV1 {
  readonly allowedSourceRelations: readonly ChallengeSourceRelationV1[];
  readonly allowedBasisReferences: readonly EvidenceBasisRuleV1[];
  readonly requireResolvedBasis: true;
}
export interface ChallengeResolutionPolicyV1 {
  readonly minimumCorroboratingGroups: number;
  readonly minimumCorroboratingWeightBasisPoints: number;
  readonly minimumOpposingGroups: number;
  readonly minimumOpposingWeightBasisPoints: number;
}
export interface TrustDimensionPolicyV1 {
  readonly dimensionId: string;
  readonly priorScoreBasisPoints: number;
  readonly priorWeightBasisPoints: number;
  readonly minimumUncertaintyBasisPoints: number;
  readonly coverageTargetBasisPoints: number;
  readonly decayIntervalMs: number;
  readonly decayBasisPointsPerInterval: number;
  readonly uncertaintyGrowthBasisPointsPerInterval: number;
  readonly minimumRetainedWeightBasisPoints: number;
  readonly contradictionUncertaintyBasisPointsPerClaim: number;
  readonly maximumContradictionUncertaintyBasisPoints: number;
  readonly degradedScoreAtOrBelowBasisPoints: number;
  readonly degradedUncertaintyAtOrAboveBasisPoints: number;
}
export interface EvidenceCriterionPolicyV1 {
  readonly criterionId: string;
  readonly dimensionId: string;
  readonly satisfiedValueBasisPoints: number;
  readonly violatedValueBasisPoints: number;
  readonly inconclusiveValueBasisPoints: number | null;
  readonly baseWeightBasisPoints: number;
  readonly maximumClaimWeightBasisPoints: number;
  readonly maximumSourceGroupContributionWeightBasisPoints: number;
  readonly minimumSupportGroups: number;
  readonly minimumSupportWeightBasisPoints: number;
  readonly minimumContradictionGroups: number;
  readonly minimumContradictionWeightBasisPoints: number;
  readonly allowClaimSourceAttestation: boolean;
  readonly contentRequired: boolean;
  readonly quarantineEligible: boolean;
  readonly recoveryEligible: boolean;
  readonly maximumAgeMs: number;
  readonly claimAuthority: ClaimAuthorityRuleV1;
  readonly challengeAuthority: ChallengeAuthorityRuleV1;
  readonly challengeResolution: ChallengeResolutionPolicyV1;
}
export interface EvidenceSourceBindingV1 {
  readonly sourceId: string;
  readonly sourceKind: EvidenceSourceKindV1;
  readonly dependencyGroupId: string;
  readonly roles: readonly EvidenceSourceRoleV1[];
  readonly maximumWeightBasisPoints: number;
  readonly validFromLogicalMs: number;
  readonly validUntilLogicalMs: number;
}
export interface DependencyGroupPolicyV1 {
  readonly dependencyGroupId: string;
  readonly maximumAttestationWeightPerClaimBasisPoints: number;
  readonly maximumProfileWeightPerDimensionCriterionBasisPoints: number;
}
export interface TrustEligibilityRequirementV1 {
  readonly dimensionId: string;
  readonly minimumScoreBasisPoints: number;
  readonly maximumUncertaintyBasisPoints: number;
}
export interface TrustEligibilityRuleV1 {
  readonly ruleId: string;
  readonly maximumProfileAgeMs: number;
  readonly requirements: readonly TrustEligibilityRequirementV1[];
}
export interface QuarantinePolicyRuleV1 {
  readonly dimensionId: string;
  readonly activationScoreAtOrBelowBasisPoints: number;
  readonly minimumNegativeClaimSourceGroups: number;
  readonly minimumNegativeWeightBasisPoints: number;
  readonly reviewIntervalMs: number;
}
export interface QuarantinePolicyV1 {
  readonly enabled: boolean;
  readonly rules: readonly QuarantinePolicyRuleV1[];
  readonly maximumActiveRecords: number;
}
export interface RecoveryPolicyRuleV1 {
  readonly dimensionId: string;
  readonly recoveryScoreAtOrAboveBasisPoints: number;
  readonly maximumRecoveryUncertaintyBasisPoints: number;
  readonly minimumRecoveryClaimSourceGroups: number;
  readonly minimumRecoveryWeightBasisPoints: number;
  readonly maximumRecoveryEvidenceAgeMs: number;
}
export interface RecoveryPolicyV1 {
  readonly rules: readonly RecoveryPolicyRuleV1[];
}
/** The digest is derived from this closed structure; it is deliberately not a field. */
export interface EvidenceFusionPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly parentPolicyDigest: string | null;
  readonly mode: "observe" | "restrict";
  readonly dimensions: readonly TrustDimensionPolicyV1[];
  readonly criteria: readonly EvidenceCriterionPolicyV1[];
  readonly sourceBindings: readonly EvidenceSourceBindingV1[];
  readonly dependencyGroups: readonly DependencyGroupPolicyV1[];
  readonly eligibilityRules: readonly TrustEligibilityRuleV1[];
  readonly quarantinePolicy: QuarantinePolicyV1;
  readonly recoveryPolicy: RecoveryPolicyV1;
  readonly limits: EvidenceTrustLimitsV1;
  readonly diagnosticsPolicyId: string;
  readonly redactionPolicyId: string;
}
export interface EvidenceTrustPolicyHeadV1 {
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
}
export type EvidenceTrustDependencyBindingKindV1 =
  | "content_resolver"
  | "causal_authority"
  | "mesh_ingress"
  | "mesh_eligibility"
  | "profile_resolver"
  | "snapshot_protector"
  | "verified_mesh_origin_verifier"
  | "model_boundary"
  | "action_dispatcher"
  | "message_dispatcher";
export interface EvidenceTrustDependencyBindingV1 {
  readonly schemaVersion: 1;
  readonly bindingName: string;
  readonly bindingVersion: number;
  readonly parentBindingDigest: string | null;
  readonly bindingKind: EvidenceTrustDependencyBindingKindV1;
  readonly implementationId: string;
  readonly implementationDigest: string;
  readonly configurationDigest: string;
  readonly policyDigest: string | null;
  readonly subjectMappingDigest: string | null;
  readonly upstreamBindingDigest: string | null;
  /** Trusted local registration time; prevents retroactive lineage rebinding. */
  readonly registeredAtLogicalMs: number;
  readonly validFromLogicalMs: number;
  readonly validUntilLogicalMs: number | null;
  readonly bindingDigest: string;
}
export interface EvidenceTrustDependencyBindingHeadV1 {
  readonly bindingKind: EvidenceTrustDependencyBindingKindV1;
  readonly bindingName: string;
  readonly bindingVersion: number;
  readonly bindingDigest: string;
}

/**
 * A retained, construction-verified authorization for an authority relation
 * that cannot be derived from the immutable Evidence record alone.  Its
 * verifier is intentionally not serialized: only this closed proof envelope
 * is retained in state.
 */
export interface EvidenceCausalAuthorizationBasisV1 {
  readonly schemaVersion: 1;
  readonly kind: EvidenceReferenceKindV1;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly referenceDigest: string;
  readonly resolvedDigest: string;
  readonly trustedEffectiveAtLogicalMs: number;
  /** Evidence references are resolved by retained Trust state and carry nulls. */
  readonly resolverBindingDigest: string | null;
  /** Terminal Mesh, Control and external roots require this construction proof. */
  readonly resolutionProofDigest: string | null;
}
export interface EvidenceCausalAuthorizationV1 {
  readonly schemaVersion: 1;
  readonly authorizationId: string;
  readonly authorizationDigest: string;
  readonly recordId: string;
  readonly recordDigest: string;
  readonly recordKind: "claim" | "challenge";
  readonly policyDigest: string;
  readonly criterionId: string;
  readonly subjectDigest: string;
  readonly scopeDigest: string;
  readonly targetRecordId: string | null;
  readonly targetRecordDigest: string | null;
  readonly sourceRelation: ChallengeSourceRelationV1;
  readonly authorityBindingDigest: string;
  readonly authorityProofDigest: string;
  readonly bases: readonly EvidenceCausalAuthorizationBasisV1[];
  readonly authorizedAtLogicalMs: number;
}

/** Runtime capability owned by the integration that resolves historic Mesh or control authority. */
export interface EvidenceTrustCausalAuthorityVerifierV1 {
  readonly authorityBindingDigest: string;
  readonly policyDigest: string;
  readonly upstreamBindingDigest: string;
  verify(authorization: EvidenceCausalAuthorizationV1): boolean;
}
export interface EvidenceTrustCausalAuthorityVerifierRegistryV1 {
  resolve(
    authorityBindingDigest: string,
  ): EvidenceTrustCausalAuthorityVerifierV1 | null;
}

export type ChallengeResolutionResultV1 =
  "unresolved" | "dismissed" | "sustained" | "contested";
export interface ChallengeResolutionV1 {
  readonly schemaVersion: 1;
  readonly challengeResolutionId: string;
  readonly challenges: readonly {
    readonly challengeId: string;
    readonly challengeDigest: string;
    readonly basisCutoffLogicalMs: number;
  }[];
  readonly targetId: string;
  readonly targetDigest: string;
  readonly challengerDependencyGroupId: string;
  readonly basisCutoffLogicalMs: number;
  readonly policyDigest: string;
  readonly evaluatedAtLogicalMs: number;
  readonly result: ChallengeResolutionResultV1;
  readonly corroboratingGroupIds: readonly string[];
  readonly corroboratingWeightBasisPoints: number;
  readonly opposingGroupIds: readonly string[];
  readonly opposingWeightBasisPoints: number;
  readonly consideredAttestationIds: readonly string[];
  readonly reasonCodes: readonly TrustReasonCodeV1[];
}
export interface EvidenceRecordExclusionV1 {
  readonly recordKind: EvidenceRecordKindV1;
  readonly recordId: string;
  readonly recordDigest: string;
  readonly reasonCodes: readonly TrustReasonCodeV1[];
}
export type EvidenceClaimClassificationKindV1 =
  "supported" | "contradicted" | "contested" | "inconclusive" | "unavailable";
export interface EvidenceClaimClassificationV1 {
  readonly claimId: string;
  readonly claimDigest: string;
  readonly criterionId: string;
  readonly dimensionId: string;
  readonly classification: EvidenceClaimClassificationKindV1;
  readonly mappedValueBasisPoints: number | null;
  readonly supportGroupIds: readonly string[];
  readonly supportWeightBasisPoints: number;
  readonly contradictionGroupIds: readonly string[];
  readonly contradictionWeightBasisPoints: number;
  readonly rawWeightBasisPoints: number;
  readonly retainedWeightBasisPoints: number;
  readonly effectiveWeightBasisPoints: number;
  readonly claimSourceDependencyGroupId: string | null;
  readonly reasonCodes: readonly TrustReasonCodeV1[];
}
export interface EvidenceGroupAllocationV1 {
  readonly stage: "attestation" | "challenge_resolution" | "profile";
  readonly dimensionId: string | null;
  readonly criterionId: string | null;
  readonly claimId: string | null;
  readonly dependencyGroupId: string;
  readonly candidateRecordIds: readonly string[];
  readonly capBasisPoints: number;
  readonly allocatedWeightBasisPoints: number;
}
export interface TrustDimensionStateV1 {
  readonly dimensionId: string;
  readonly scoreBasisPoints: number;
  readonly uncertaintyBasisPoints: number;
  readonly effectiveWeightBasisPoints: number;
  readonly coverageBasisPoints: number;
  readonly ageUncertaintyBasisPoints: number;
  readonly contradictionPressureBasisPoints: number;
  readonly includedClaimIds: readonly string[];
  readonly excludedClaimIds: readonly string[];
  readonly claimSourceDependencyGroupIds: readonly string[];
  readonly latestQualifyingEffectiveAtLogicalMs: number | null;
}
export interface EvidenceFusionDecisionV1 {
  readonly schemaVersion: 1;
  readonly fusionDecisionId: string;
  readonly fusionDecisionDigest: string;
  readonly tenantId: string;
  readonly subject: TrustSubjectV1;
  readonly subjectDigest: string;
  readonly scope: EvidenceScopeV1;
  readonly scopeDigest: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly evaluatedAtLogicalMs: number;
  readonly inputSetDigest: string;
  readonly consideredRecordIds: readonly string[];
  readonly includedRecordIds: readonly string[];
  readonly recordExclusions: readonly EvidenceRecordExclusionV1[];
  readonly claimClassifications: readonly EvidenceClaimClassificationV1[];
  readonly challengeResolutions: readonly ChallengeResolutionV1[];
  readonly groupAllocations: readonly EvidenceGroupAllocationV1[];
  readonly dimensions: readonly TrustDimensionStateV1[];
  readonly previousProfileDigest: string | null;
  readonly reasonCodes: readonly TrustReasonCodeV1[];
}
export interface EvidenceFusionEvaluationRequestV1 {
  readonly tenantId: string;
  readonly subject: TrustSubjectV1;
  readonly scope: EvidenceScopeV1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly dependencyBindingDigests: readonly string[];
}

export type EvidenceRecordKindV1 =
  "claim" | "attestation" | "challenge" | "retraction";
export type EvidenceRecordStatusV1 =
  | "active"
  | "pending"
  | "retracted"
  | "challenged"
  | "conflicted"
  | "unavailable";
export type EvidenceRecordOriginV1 = "local" | "verified_mesh";

/** The accepted, content-bound form of an evidence record. */
export interface EvidenceRecordStateV1 {
  readonly schemaVersion: 1;
  readonly recordKind: EvidenceRecordKindV1;
  readonly recordId: string;
  readonly recordDigest: string;
  readonly record: EvidenceRecordV1;
  readonly origin: EvidenceRecordOriginV1;
  readonly originBindingDigest: string;
  readonly originVerifierBindingDigest: string | null;
  readonly originProofDigest: string | null;
  readonly acceptedAtLogicalMs: number;
  readonly effectiveAtLogicalMs: number;
  readonly status: EvidenceRecordStatusV1;
}

export interface EvidenceContentResolutionV1 {
  readonly schemaVersion: 1;
  readonly resolutionId: string;
  readonly resolutionDigest: string;
  readonly claimId: string;
  readonly claimDigest: string;
  readonly scopeDigest: string;
  readonly referenceId: string;
  readonly referenceDigest: string;
  readonly contentDigest: string;
  readonly mediaType: string;
  readonly encodedBytes: number;
  readonly result: "verified" | "unavailable" | "mismatched";
  readonly resolverBindingDigest: string;
  readonly resolvedAtLogicalMs: number;
}
export type EvidenceContentProjectionStatusV1 =
  "verified" | "unavailable" | "mismatched" | "stale" | "not_required";

export interface EvidenceContentResolutionInvalidationV1 {
  readonly schemaVersion: 1;
  readonly invalidationId: string;
  readonly resolutionId: string;
  readonly resolutionDigest: string;
  readonly resolverBindingDigest: string;
  readonly invalidatedAtLogicalMs: number;
  readonly reasonCode: TrustReasonCodeV1;
}

export interface EvidenceTrustDiagnosticV1 {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly recordDigest: string;
  readonly reasonCode: TrustReasonCodeV1;
}

/** Runtime capability owned by the authenticated Mesh ingress adapter, never wire data. */
export interface EvidenceTrustVerifiedMeshAdmissionVerifierV1 {
  readonly verifierBindingDigest: string;
  readonly upstreamBindingDigest: string;
  verify(input: {
    readonly recordId: string;
    readonly recordDigest: string;
    readonly originBindingDigest: string;
    readonly originVerifierBindingDigest: string;
    readonly originProofDigest: string;
    readonly effectiveAtLogicalMs: number;
  }): boolean;
}

/** Construction-bound historical registry; Mesh owns its retention and lookup. */
export interface EvidenceTrustVerifiedMeshAdmissionVerifierRegistryV1 {
  resolve(
    verifierBindingDigest: string,
  ): EvidenceTrustVerifiedMeshAdmissionVerifierV1 | null;
}

export interface EvidenceTrustReducerOptionsV1 {
  /** Construction-bound synchronous capability supplied only by Mesh ingress. */
  readonly verifiedMeshAdmissionVerifierRegistry?: EvidenceTrustVerifiedMeshAdmissionVerifierRegistryV1;
  /** The active resolver binding required for positive content resolutions. */
  readonly currentContentResolverBindingDigest?: string | null;
  /** Construction-bound verifier for retained causal-authority certificates. */
  readonly causalAuthorityVerifierRegistry?: EvidenceTrustCausalAuthorityVerifierRegistryV1;
}
export interface EvidenceTrustRestoreOptionsV1 {
  readonly verifiedMeshAdmissionVerifierRegistry?: EvidenceTrustVerifiedMeshAdmissionVerifierRegistryV1;
  readonly currentContentResolverBindingDigest?: string | null;
  readonly causalAuthorityVerifierRegistry?: EvidenceTrustCausalAuthorityVerifierRegistryV1;
}

export type EvidenceTrustInputV1 =
  | {
      readonly schemaVersion: 1;
      readonly kind: "policy_registered";
      readonly policy: EvidenceFusionPolicyV1;
      readonly logicalTimeMs: number;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "dependency_binding_registered";
      readonly binding: EvidenceTrustDependencyBindingV1;
      readonly logicalTimeMs: number;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "causal_authorization_recorded";
      readonly authorization: Omit<
        EvidenceCausalAuthorizationV1,
        "authorizationId" | "authorizationDigest" | "authorizedAtLogicalMs"
      >;
      readonly logicalTimeMs: number;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "fusion_evaluated";
      readonly request: EvidenceFusionEvaluationRequestV1;
      readonly logicalTimeMs: number;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "record_admitted";
      readonly record: EvidenceRecordV1;
      readonly origin: EvidenceRecordOriginV1;
      readonly originBindingDigest: string;
      readonly originVerifierBindingDigest: string | null;
      readonly originProofDigest: string | null;
      /** Historical effective time; it may not be later than admission time. */
      readonly effectiveAtLogicalMs: number;
      readonly logicalTimeMs: number;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "content_resolution_recorded";
      readonly resolution: Omit<
        EvidenceContentResolutionV1,
        "resolutionId" | "resolutionDigest" | "resolvedAtLogicalMs"
      >;
      readonly logicalTimeMs: number;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "content_resolution_invalidated";
      readonly invalidation: Omit<
        EvidenceContentResolutionInvalidationV1,
        "invalidationId" | "invalidatedAtLogicalMs"
      >;
      readonly logicalTimeMs: number;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "advance_logical_time";
      readonly logicalTimeMs: number;
    };

export interface EvidenceTrustEffectV1 {
  readonly schemaVersion: 1;
  readonly kind:
    | "policy_registered"
    | "dependency_binding_registered"
    | "causal_authorization_recorded"
    | "fusion_evaluated"
    | "record_accepted"
    | "record_duplicate"
    | "record_status_changed"
    | "content_resolution_recorded"
    | "content_invalidation_recorded"
    | "logical_time_advanced";
  readonly recordId: string | null;
  readonly recordDigest: string | null;
  readonly reasonCode: TrustReasonCodeV1;
}
export interface EvidenceTrustReducerResultV1 {
  readonly state: EvidenceTrustStateV1;
  readonly effects: readonly EvidenceTrustEffectV1[];
}

export interface EvidenceTrustStateV1 {
  readonly schemaVersion: 1;
  readonly stateId: string;
  readonly limits: EvidenceTrustLimitsV1;
  readonly logicalTimeHighWaterMs: number;
  readonly policies: readonly EvidenceFusionPolicyV1[];
  readonly policyHeads: readonly EvidenceTrustPolicyHeadV1[];
  /** No duplicate source authority: bindings are canonical only inside policies. */
  readonly sourceBindings: readonly [];
  readonly dependencyBindings: readonly EvidenceTrustDependencyBindingV1[];
  readonly dependencyBindingHeads: readonly EvidenceTrustDependencyBindingHeadV1[];
  readonly causalAuthorizations: readonly EvidenceCausalAuthorizationV1[];
  readonly records: readonly EvidenceRecordStateV1[];
  readonly contentResolutions: readonly EvidenceContentResolutionV1[];
  readonly contentInvalidations: readonly EvidenceContentResolutionInvalidationV1[];
  readonly pendingRecords: readonly string[];
  readonly fusionDecisions: readonly EvidenceFusionDecisionV1[];
  readonly profiles: readonly JsonValue[];
  readonly quarantines: readonly JsonValue[];
  readonly diagnostics: readonly EvidenceTrustDiagnosticV1[];
  readonly traceDigest: string;
  readonly encodedBytes: number;
}

export interface EvidenceTrustSnapshotIntegrityProofV1 {
  readonly protectorBindingDigest: string;
  readonly algorithmId: string;
  readonly keyId: string;
  readonly encoding: "base64url";
  readonly proof: string;
}
export interface EvidenceTrustSnapshotV1 {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly snapshotDigest: string;
  readonly stateId: string;
  readonly generation: number;
  readonly previousSnapshotDigest: string | null;
  readonly createdAtLogicalMs: number;
  readonly stateDigest: string;
  readonly state: EvidenceTrustStateV1;
  readonly integrityProof: EvidenceTrustSnapshotIntegrityProofV1;
}
export interface EvidenceTrustRollbackAnchorV1 {
  readonly schemaVersion: 1;
  readonly stateId: string;
  readonly requiredGeneration: number;
  readonly requiredSnapshotDigest: string;
  readonly minimumLogicalHighWaterMs: number;
  readonly protectorBindingDigest: string;
}
export interface EvidenceTrustSnapshotProtectorV1 {
  readonly bindingDigest: string;
  protect(
    materialBytes: Uint8Array,
  ): Omit<EvidenceTrustSnapshotIntegrityProofV1, "protectorBindingDigest">;
  verify(
    materialBytes: Uint8Array,
    proof: EvidenceTrustSnapshotIntegrityProofV1,
  ): boolean;
}

export interface MeshEvidenceEnvelopeMaterialV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly meshId: string;
  readonly objectiveId: string | null;
  readonly senderPeerId: string;
  readonly causationId: string | null;
}
export type MeshEvidenceWireScopeV1 =
  | { readonly kind: "mesh" }
  | { readonly kind: "objective"; readonly objectiveRevision: number }
  | {
      readonly kind: "work";
      readonly objectiveRevision: number;
      readonly workItemId: string;
      readonly workItemRevision: number;
      readonly assignmentEpoch: number;
      readonly assignmentAuthorityId: string;
      readonly fencingToken: string;
    };
