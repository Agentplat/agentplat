import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { MeshAdaptiveOverlayCertificateV1 } from "@agentplat/mesh/adaptive-overlay";

export const COMPROMISE_AWARE_RECOVERY_SCHEMA_VERSION_V1 = 1 as const;
export const COMPROMISE_AWARE_RECOVERY_STATE_FORMAT_V1 =
  "application/vnd.agentplat.compromise-aware-recovery-state.v1+json" as const;

export interface CompromiseRecoveryScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly workItemId: AgentPlatID;
}

/** Authenticated Trust/control conclusion; raw evidence stays in its source. */
export interface CompromiseRecoveryVerdictCertificateV1 {
  readonly schemaVersion: 1;
  readonly certificateId: AgentPlatID;
  readonly scope: CompromiseRecoveryScopeV1;
  readonly subjectPeerId: AgentPlatID;
  readonly subjectPeerIndex: number;
  readonly disposition: "exclude";
  readonly cause:
    "confirmed_compromise" | "credential_compromise" | "integrity_failure";
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceRecordDigest: PlanningDigestV1;
  readonly controlProposalDigest: PlanningDigestV1;
  readonly independentWitnessPeerIds: readonly AgentPlatID[];
  readonly independentWitnessGroupIds: readonly AgentPlatID[];
  readonly witnessThreshold: number;
  /** Independently certified local sparse-view exclusion. */
  readonly sparseExclusionCertificate: MeshAdaptiveOverlayCertificateV1;
  /** Original adaptive CAS fence; exact applied-certificate replay precedes it. */
  readonly expectedAdaptiveRevision: number;
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly certificateDigest: PlanningDigestV1;
}

export interface CompromiseRecoveryTakeoverProposalV1 {
  readonly takeoverProposalId: AgentPlatID;
  readonly proposedAssigneePeerId: AgentPlatID;
  readonly acceptedAtLogicalMs: number;
}

/** Exact input for the existing threshold-certified recovery election. */
export interface CompromiseRecoveryRequestV1 {
  readonly schemaVersion: 1;
  readonly recoveryRequestId: AgentPlatID;
  readonly scope: CompromiseRecoveryScopeV1;
  readonly objectiveRevision: number;
  readonly objectiveExpiresAtLogicalMs: number;
  readonly workItemRevision: number;
  readonly priorAssignmentEpoch: number;
  readonly priorFencingToken: AgentPlatID;
  readonly proposedAssignmentEpoch: number;
  readonly takeoverProposals: readonly CompromiseRecoveryTakeoverProposalV1[];
  readonly eligibleWitnessPeerIds: readonly AgentPlatID[];
  readonly recoveryWitnessThreshold: number;
  readonly checkpointDigest: PlanningDigestV1 | null;
  readonly fallback: "reauction" | "replan";
  readonly requestDigest: PlanningDigestV1;
}

export interface CompromiseRecoveryExclusionReceiptV1 {
  readonly operationId: AgentPlatID;
  readonly subjectPeerId: AgentPlatID;
  readonly subjectPeerIndex: number;
  readonly certificateDigest: PlanningDigestV1;
  readonly resultingViewDigest: string;
  readonly resultingViewRevision: number;
  readonly appliedAtLogicalMs: number;
  /** Present when exclusion also retired the peer from governed membership. */
  readonly lifecycleRetirementDigest?: PlanningDigestV1;
  readonly membershipConfigurationDigest?: PlanningDigestV1;
  readonly membershipEpoch?: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CompromiseRecoveryFenceV1 {
  readonly operationId: AgentPlatID;
  readonly workItemId: AgentPlatID;
  readonly excludedPeerId: AgentPlatID;
  readonly priorAssignmentEpoch: number;
  readonly assignmentEpoch: number;
  readonly fencingToken: AgentPlatID;
  readonly installedAtLogicalMs: number;
  readonly fenceDigest: PlanningDigestV1;
}

export interface CompromiseRecoveryActivationV1 {
  readonly operationId: AgentPlatID;
  readonly electionId: AgentPlatID;
  readonly electionRound: number;
  readonly selectedProposalId: AgentPlatID;
  readonly selectedAssigneePeerId: AgentPlatID;
  readonly certifiedWitnessPeerIds: readonly AgentPlatID[];
  readonly decision: "checkpoint" | "reauction" | "replan";
  readonly checkpointDigest: PlanningDigestV1 | null;
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly activationDigest: PlanningDigestV1;
}

export interface CompromiseRecoveryRestorationV1 {
  readonly operationId: AgentPlatID;
  readonly mode: "checkpoint" | "reauction" | "replan";
  readonly artifactDigest: PlanningDigestV1;
  readonly appliedAtLogicalMs: number;
  readonly restorationDigest: PlanningDigestV1;
}

export type CompromiseRecoveryStageV1 =
  | "certified"
  | "excluded"
  | "fenced"
  | "recovery_activated"
  | "completed"
  | "blocked";

export interface CompromiseRecoveryIncidentV1 {
  readonly incidentId: AgentPlatID;
  readonly verdict: CompromiseRecoveryVerdictCertificateV1;
  readonly request: CompromiseRecoveryRequestV1;
  readonly stage: CompromiseRecoveryStageV1;
  readonly exclusion: CompromiseRecoveryExclusionReceiptV1 | null;
  readonly fence: CompromiseRecoveryFenceV1 | null;
  readonly activation: CompromiseRecoveryActivationV1 | null;
  readonly restoration: CompromiseRecoveryRestorationV1 | null;
  /** Blocked certificate chain replaced by this incident for the same subject. */
  readonly supersedesCertificateDigests: readonly PlanningDigestV1[];
  readonly failureCode: string | null;
  readonly startedAtLogicalMs: number;
  readonly updatedAtLogicalMs: number;
  readonly incidentDigest: PlanningDigestV1;
}

export interface CompromiseRecoverySupersessionV1 {
  readonly supersededCertificateDigest: PlanningDigestV1;
  readonly supersedingCertificateDigest: PlanningDigestV1;
}

/** Peer-local saga state; excluded subjects are bounded identifiers, not a graph. */
export interface CompromiseRecoveryStateV1 {
  readonly format: typeof COMPROMISE_AWARE_RECOVERY_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly scope: CompromiseRecoveryScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly activeIncident: CompromiseRecoveryIncidentV1 | null;
  readonly excludedPeerIds: readonly AgentPlatID[];
  readonly excludedPeerIndexes: readonly number[];
  readonly fenceHead: CompromiseRecoveryFenceV1 | null;
  readonly completedCertificateDigests: readonly PlanningDigestV1[];
  /** Durable terminal disposition; records are retained and never reused. */
  readonly supersededCertificates: readonly CompromiseRecoverySupersessionV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface CompromiseRecoveryStoreV1 {
  /** Atomically reads the replaceable snapshot and independent monotonic anchor. */
  loadCurrent(input: {
    readonly stateKey: AgentPlatID;
    readonly anchorKey: AgentPlatID;
  }): Promise<{
    readonly state: CompromiseRecoveryStateV1 | null;
    readonly anchor: CompromiseRecoveryAnchorV1 | null;
  }>;
  /**
   * Atomically advances the state snapshot and its rollback-resistant anchor.
   * A successful return must never expose only one side of the transition.
   * The anchor must reside on a monotonic/non-reversible protection boundary;
   * restoring the ordinary state backup must not restore an older anchor.
   */
  save(input: {
    readonly state: CompromiseRecoveryStateV1;
    readonly anchorKey: AgentPlatID;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export interface CompromiseRecoveryAnchorV1 {
  readonly revision: number;
  readonly stateDigest: PlanningDigestV1;
  readonly logicalTimeHighWaterMs: number;
}

export interface CompromiseRecoveryVerdictVerificationPortV1 {
  verify(input: {
    readonly verdict: CompromiseRecoveryVerdictCertificateV1;
    readonly policyDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

/** Must apply the embedded adaptive certificate idempotently by operationId. */
export interface CompromiseRecoveryExclusionPortV1 {
  exclude(input: {
    readonly operationId: AgentPlatID;
    readonly verdict: CompromiseRecoveryVerdictCertificateV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryExclusionReceiptV1>;
}

/** Must fence assignment CAS and every execution/effect boundary atomically. */
export interface CompromiseRecoveryFencingPortV1 {
  fence(input: {
    readonly operationId: AgentPlatID;
    readonly verdict: CompromiseRecoveryVerdictCertificateV1;
    readonly request: CompromiseRecoveryRequestV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryFenceV1>;
}

/** Activates the existing threshold-certified recovery/re-auction path. */
export interface CompromiseRecoveryActivationPortV1 {
  activate(input: {
    readonly operationId: AgentPlatID;
    readonly verdict: CompromiseRecoveryVerdictCertificateV1;
    readonly request: CompromiseRecoveryRequestV1;
    readonly fence: CompromiseRecoveryFenceV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryActivationV1>;
}

export interface CompromiseRecoveryRestorationPortV1 {
  restoreCheckpoint(input: {
    readonly operationId: AgentPlatID;
    readonly checkpointDigest: PlanningDigestV1;
    readonly activation: CompromiseRecoveryActivationV1;
    readonly fence: CompromiseRecoveryFenceV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryRestorationV1>;
  activateReauction(input: {
    readonly operationId: AgentPlatID;
    readonly activation: CompromiseRecoveryActivationV1;
    readonly fence: CompromiseRecoveryFenceV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryRestorationV1>;
  requestReplanning(input: {
    readonly operationId: AgentPlatID;
    readonly activation: CompromiseRecoveryActivationV1;
    readonly fence: CompromiseRecoveryFenceV1;
    readonly logicalTimeMs: number;
  }): Promise<CompromiseRecoveryRestorationV1>;
}

export interface CompromiseRecoveryPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly maximumVerdictLifetimeMs: number;
  readonly maximumTakeoverProposals: number;
  readonly maximumWitnesses: number;
  readonly maximumExcludedPeers: number;
  readonly maximumCompletedCertificates: number;
  readonly maximumCommitAttempts: number;
  readonly maximumRunSteps: number;
}

export interface CompromiseRecoveryRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly anchorKey: AgentPlatID;
  readonly scope: CompromiseRecoveryScopeV1;
  readonly policy: CompromiseRecoveryPolicyV1;
  readonly store: CompromiseRecoveryStoreV1;
  readonly verification: CompromiseRecoveryVerdictVerificationPortV1;
  readonly exclusion: CompromiseRecoveryExclusionPortV1;
  readonly fencing: CompromiseRecoveryFencingPortV1;
  readonly activation: CompromiseRecoveryActivationPortV1;
  readonly restoration: CompromiseRecoveryRestorationPortV1;
}

export type CompromiseRecoveryExecutionGateV1 =
  | {
      readonly allowed: true;
      readonly reasonCode: "current_fence" | "no_recovery_fence";
    }
  | { readonly allowed: false; readonly reasonCode: string };
