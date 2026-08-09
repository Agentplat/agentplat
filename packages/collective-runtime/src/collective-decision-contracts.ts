import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

/** Versioned, content-free collective decision records. */
export const COLLECTIVE_DECISION_SCHEMA_VERSION_V1 = 1 as const;
export const COLLECTIVE_DECISION_STATE_FORMAT_V1 =
  "application/vnd.agentplat.collective-decision-plane.v1+json" as const;

export const COLLECTIVE_DECISION_KINDS_V1 = Object.freeze([
  "plan_fragment",
  "team_roster",
  "execution_takeover",
  "team_structure",
  "role_transition",
  "strategy_change",
] as const);

export type CollectiveDecisionKindV1 =
  (typeof COLLECTIVE_DECISION_KINDS_V1)[number];

export const COLLECTIVE_DECISION_CERTIFICATION_MODES_V1 = Object.freeze([
  "local",
  "evidence",
  "byzantine_agreement",
] as const);

export type CollectiveDecisionCertificationModeV1 =
  (typeof COLLECTIVE_DECISION_CERTIFICATION_MODES_V1)[number];

/** Stable authority coordinates. The digest excludes any decision payload. */
export interface CollectiveDecisionScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly workItemId: AgentPlatID | null;
  readonly workItemRevision: number | null;
  readonly scopeDigest: PlanningDigestV1;
}

export type CollectiveDecisionModeMapV1 = Readonly<
  Record<CollectiveDecisionKindV1, CollectiveDecisionCertificationModeV1>
>;

export type CollectiveDecisionKindCountMapV1 = Readonly<
  Record<CollectiveDecisionKindV1, number>
>;

/** A recognized evidence publisher. Trust is policy-owned, never self-asserted. */
export interface CollectiveDecisionTrustedEvidenceSourceV1 {
  readonly schemaVersion: 1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
}

export interface CollectiveDecisionPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly certificationModes: CollectiveDecisionModeMapV1;
  readonly minimumTrustedEvidenceByKind: CollectiveDecisionKindCountMapV1;
  readonly minimumByzantineAttestersByKind: CollectiveDecisionKindCountMapV1;
  readonly trustedEvidenceSources: readonly CollectiveDecisionTrustedEvidenceSourceV1[];
  readonly maximumCandidateTtlMs: number;
  readonly maximumCertificateTtlMs: number;
  readonly maximumAcceptedHeads: number;
  /** Permanent replay-protection tombstones retained by this state generation. */
  readonly maximumCompactedHeads: number;
  readonly maximumCommitAttempts: number;
}

export interface CollectiveDecisionPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: CollectiveDecisionPolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

/**
 * A proposal only references an externally stored payload. Its binding prevents
 * the same candidate from being replayed across scope, epoch, or membership.
 */
export interface CollectiveDecisionCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: AgentPlatID;
  readonly decisionKind: CollectiveDecisionKindV1;
  readonly scope: CollectiveDecisionScopeV1;
  readonly epoch: number;
  readonly membershipDigest: PlanningDigestV1;
  readonly membershipMemberIds: readonly AgentPlatID[];
  readonly proposerId: AgentPlatID;
  readonly payloadDigest: PlanningDigestV1;
  readonly preparedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly candidateDigest: PlanningDigestV1;
}

/** Immutable, content-free evidence supplied to a certification adapter. */
export interface CollectiveDecisionEvidenceV1 {
  readonly schemaVersion: 1;
  readonly evidenceId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly evidenceDigest: PlanningDigestV1;
}

export interface CollectiveDecisionCertificateV1 {
  readonly schemaVersion: 1;
  readonly certificateId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly epoch: number;
  readonly membershipDigest: PlanningDigestV1;
  readonly certificationMode: CollectiveDecisionCertificationModeV1;
  readonly issuerId: AgentPlatID;
  readonly attesterIds: readonly AgentPlatID[];
  readonly evidence: readonly CollectiveDecisionEvidenceV1[];
  /**
   * Digest of the externally retained agreement proof. Required for Byzantine
   * agreement, prohibited for local certification, optional for evidence
   * certification (where it may identify an evidence aggregation artifact).
   */
  readonly certificationProofDigest: PlanningDigestV1 | null;
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly certificateDigest: PlanningDigestV1;
}

export interface CollectiveDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: AgentPlatID;
  readonly decisionPlaneId: AgentPlatID;
  readonly decisionPlaneVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly candidate: CollectiveDecisionCandidateV1;
  readonly certificate: CollectiveDecisionCertificateV1;
  readonly acceptedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly decisionDigest: PlanningDigestV1;
}

/**
 * Minimal permanent tombstone for an expired accepted decision. It releases
 * the full-record retention budget without permitting its slot to reopen.
 */
export interface CollectiveDecisionCompactedHeadV1 {
  readonly schemaVersion: 1;
  readonly decisionId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly decisionKind: CollectiveDecisionKindV1;
  readonly epoch: number;
  readonly candidateDigest: PlanningDigestV1;
  readonly certificateDigest: PlanningDigestV1;
  readonly certificationProofDigest: PlanningDigestV1 | null;
  readonly decisionDigest: PlanningDigestV1;
  readonly committedStateRevision: number;
  readonly compactedHeadDigest: PlanningDigestV1;
}

export interface CollectiveDecisionStateV1 {
  readonly format: typeof COLLECTIVE_DECISION_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly decisionPlaneId: AgentPlatID;
  readonly decisionPlaneVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly accepted: readonly CollectiveDecisionV1[];
  readonly compacted: readonly CollectiveDecisionCompactedHeadV1[];
  readonly stateDigest: PlanningDigestV1;
}

/**
 * Narrow trust boundary. Implementations authenticate evidence, membership and
 * agreement proofs before returning a certificate; this runtime then verifies
 * its immutable bindings, policy restrictions, expiry and CAS admission.
 */
export interface CollectiveDecisionCertificationPortV1 {
  certify(input: {
    readonly candidate: CollectiveDecisionCandidateV1;
    readonly policy: CollectiveDecisionPolicyRecordV1;
  }): Promise<CollectiveDecisionCertificateV1>;
  /** Authenticate the concrete proof/evidence behind a supplied certificate. */
  verify(input: {
    readonly candidate: CollectiveDecisionCandidateV1;
    readonly certificate: CollectiveDecisionCertificateV1;
    readonly policy: CollectiveDecisionPolicyRecordV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

/**
 * Atomic revision-checked durable state boundary. Production adapters must
 * preserve state-digest integrity and a rollback-resistant persistence anchor.
 */
export interface CollectiveDecisionStoreV1 {
  load(stateKey: AgentPlatID): Promise<CollectiveDecisionStateV1 | null>;
  save(input: {
    readonly state: CollectiveDecisionStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

export interface CollectiveDecisionRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly decisionPlaneId: AgentPlatID;
  readonly decisionPlaneVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policy: CollectiveDecisionPolicyRecordV1;
  readonly certification: CollectiveDecisionCertificationPortV1;
  readonly store: CollectiveDecisionStoreV1;
}

export interface CollectiveDecisionCommitInputV1 {
  readonly decisionId: AgentPlatID;
  readonly candidate: CollectiveDecisionCandidateV1;
  readonly certificate: CollectiveDecisionCertificateV1;
  readonly logicalTimeMs: number;
}

export interface CollectiveDecisionPortV1 {
  prepare(
    input: Omit<CollectiveDecisionCandidateV1, "candidateDigest">,
  ): CollectiveDecisionCandidateV1;
  certify(
    candidate: CollectiveDecisionCandidateV1,
  ): Promise<CollectiveDecisionCertificateV1>;
  verify(input: {
    readonly candidate: CollectiveDecisionCandidateV1;
    readonly certificate: CollectiveDecisionCertificateV1;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveDecisionCertificateV1>;
  commit(input: CollectiveDecisionCommitInputV1): Promise<CollectiveDecisionV1>;
  decide(input: {
    readonly decisionId: AgentPlatID;
    readonly candidate: Omit<CollectiveDecisionCandidateV1, "candidateDigest">;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveDecisionV1>;
}
