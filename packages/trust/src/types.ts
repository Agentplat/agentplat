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

export interface EvidenceTrustStateV1 {
  readonly schemaVersion: 1;
  readonly stateId: string;
  readonly limits: EvidenceTrustLimitsV1;
  readonly logicalTimeHighWaterMs: number;
  readonly policies: readonly JsonValue[];
  readonly policyHeads: readonly JsonValue[];
  readonly sourceBindings: readonly JsonValue[];
  readonly dependencyBindings: readonly JsonValue[];
  readonly records: readonly JsonValue[];
  readonly contentResolutions: readonly JsonValue[];
  readonly contentInvalidations: readonly JsonValue[];
  readonly pendingRecords: readonly JsonValue[];
  readonly fusionDecisions: readonly JsonValue[];
  readonly profiles: readonly JsonValue[];
  readonly quarantines: readonly JsonValue[];
  readonly diagnostics: readonly JsonValue[];
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
