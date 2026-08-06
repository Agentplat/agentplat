import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  LocalStrategyFeedbackMetricV1,
  LocalStrategyOperationV1,
} from "./strategy-adaptation-contracts.js";

export const PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1 = 1 as const;
export const PEER_STRATEGY_EVIDENCE_STATE_FORMAT_V1 =
  "application/vnd.agentplat.peer-strategy-evidence-exchange.v1+json" as const;
export const PEER_STRATEGY_EVIDENCE_HANDOFF_FORMAT_V1 =
  "application/vnd.agentplat.peer-strategy-evidence-exchange-handoff.v1+json" as const;
export const PEER_STRATEGY_EVIDENCE_SYNC_DOMAIN_V1 =
  "peer-strategy-evidence/v1" as const;

/** Structural subset of a collective-sync causal record. */
export interface PeerStrategyEvidenceSyncRecordV1 {
  readonly schemaVersion: 1;
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly syncDomain: typeof PEER_STRATEGY_EVIDENCE_SYNC_DOMAIN_V1;
  readonly streamId: AgentPlatID;
  readonly sequence: number;
  readonly predecessorDigest: PlanningDigestV1 | null;
  readonly payload: unknown;
  readonly payloadDigest: PlanningDigestV1;
  readonly createdAtLogicalMs: number;
  readonly recordDigest: PlanningDigestV1;
}

/** Structural frontier projection used without coupling runtime to transport. */
export interface PeerStrategyEvidenceSyncFrontierV1 {
  readonly schemaVersion: 1;
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly syncDomain: typeof PEER_STRATEGY_EVIDENCE_SYNC_DOMAIN_V1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly entries: readonly {
    readonly streamId: AgentPlatID;
    readonly sequence: number;
    readonly headDigest: PlanningDigestV1 | null;
  }[];
  readonly frontierDigest: PlanningDigestV1;
}

export type PeerStrategyEvidenceOutcomeV1 =
  | "success"
  | "failure"
  | "unsafe"
  | "indeterminate";

/**
 * A content-free cohort to which strategy evidence may be compared.
 * `contextClassDigest` names a policy-defined equivalence class, never context.
 */
export interface PeerStrategyEvidenceCohortV1 {
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly contextClassDigest: PlanningDigestV1;
  readonly cohortDigest: PlanningDigestV1;
}

/** Exact implementation and metric-semantics binding for one evidence series. */
export interface PeerStrategyEvidenceBindingV1 {
  readonly operation: LocalStrategyOperationV1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly implementationDigest: PlanningDigestV1;
  readonly feedbackSchemaDigest: PlanningDigestV1;
  readonly bindingDigest: PlanningDigestV1;
}

/** A closed, fixed-point metric value. It contains no source content. */
export interface PeerStrategyEvidenceMetricValueV1 {
  readonly schemaVersion: 1;
  readonly metric: LocalStrategyFeedbackMetricV1;
  readonly valueMicros: number;
}

export interface PeerStrategyEvidenceProofV1 {
  readonly algorithm: "Ed25519";
  readonly keyId: AgentPlatID;
  readonly value: string;
}

/**
 * Content-free outcome statement produced by the peer that made the local
 * strategy decision. The signed form is suitable for a collective-sync record.
 */
export interface UnsignedPeerStrategyOutcomeAttestationV1 {
  readonly schemaVersion: 1;
  readonly attestationId: AgentPlatID;
  readonly issuerPeerId: AgentPlatID;
  readonly issuerInstanceId: AgentPlatID;
  readonly issuerStreamId: AgentPlatID;
  readonly issuerSequence: number;
  readonly predecessorAttestationDigest: PlanningDigestV1 | null;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly cohort: PeerStrategyEvidenceCohortV1;
  readonly binding: PeerStrategyEvidenceBindingV1;
  /** Provenance only; neither digest grants remote decision authority. */
  readonly catalogDigest: PlanningDigestV1;
  readonly localPolicyDigest: PlanningDigestV1;
  readonly selectionDecisionDigest: PlanningDigestV1;
  readonly feedbackBatchDigest: PlanningDigestV1;
  readonly feedbackDecisionDigest: PlanningDigestV1;
  readonly feedbackSignalDigests: readonly PlanningDigestV1[];
  readonly outcome: PeerStrategyEvidenceOutcomeV1;
  readonly metrics: readonly PeerStrategyEvidenceMetricValueV1[];
  readonly confidenceBps: number;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly attestationDigest: PlanningDigestV1;
  readonly proof: Omit<PeerStrategyEvidenceProofV1, "value">;
}

export interface SignedPeerStrategyOutcomeAttestationV1
  extends Omit<UnsignedPeerStrategyOutcomeAttestationV1, "proof"> {
  readonly proof: PeerStrategyEvidenceProofV1;
}

export interface PeerStrategyEvidenceLimitsV1 {
  readonly maximumAttestations: number;
  readonly maximumAttestationsPerPeer: number;
  readonly maximumSourceHeads: number;
  readonly maximumCertificates: number;
  readonly maximumFeedbackSignalDigests: number;
  readonly maximumAttestationTtlMs: number;
  readonly maximumFutureSkewMs: number;
  readonly maximumReasonCodesPerDecision: number;
  readonly maximumCommitAttempts: number;
  readonly maximumGossipFanout: number;
  readonly maximumGossipHops: number;
}

/** Immutable local policy that bounds what remote evidence may influence. */
export interface PeerStrategyEvidencePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly feedbackSchemaDigest: PlanningDigestV1;
  readonly minimumDistinctPeers: number;
  readonly minimumDistinctIndependenceGroups: number;
  readonly minimumConfidenceBps: number;
  readonly maximumPriorInfluenceBps: number;
  readonly limits: PeerStrategyEvidenceLimitsV1;
}

export interface PeerStrategyEvidencePolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: PeerStrategyEvidencePolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

export type PeerStrategyEvidenceEligibilityDispositionV1 =
  | "eligible"
  | "restricted"
  | "ineligible"
  | "unavailable";

/** A local, expiring admission decision; remote attestations do not supply it. */
export interface PeerStrategyEvidenceEligibilityDecisionV1 {
  readonly schemaVersion: 1;
  readonly attestationDigest: PlanningDigestV1;
  readonly disposition: PeerStrategyEvidenceEligibilityDispositionV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly expiresAtLogicalMs: number;
}

/**
 * Local eligibility gate. Implementations bind the signed issuer to membership,
 * key validity and any Trust policy before an attestation can affect a prior.
 */
export interface PeerStrategyEvidenceEligibilityPortV1 {
  evaluate(input: {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceEligibilityDecisionV1>;
}

export interface PeerStrategyEvidenceMembershipResolutionPortV1 {
  resolve(input: {
    readonly tenantId: AgentPlatID;
    readonly meshId: AgentPlatID;
    readonly peerId: AgentPlatID;
    readonly instanceId: AgentPlatID;
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly keyId: AgentPlatID;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly publicKey: CryptoKey;
    readonly decisionDigest: PlanningDigestV1;
    readonly expiresAtLogicalMs: number;
  } | null>;
}

export interface PeerStrategyEvidenceTrustProjectionPortV1 {
  evaluate(input: {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly disposition: PeerStrategyEvidenceEligibilityDispositionV1;
    readonly decisionDigest: PlanningDigestV1;
    readonly expiresAtLogicalMs: number;
  }>;
}

/**
 * Local independence classifier. Equal group IDs are never counted as distinct
 * evidence sources, even when they have different peers or process instances.
 */
export interface PeerStrategyEvidenceIndependencePortV1 {
  classify(input: {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly independenceGroupId: AgentPlatID;
    readonly classificationDigest: PlanningDigestV1;
    readonly expiresAtLogicalMs: number;
  } | null>;
}

/** Monotonic causal head retained for one authenticated issuer peer. */
export interface PeerStrategyEvidenceSourceHeadV1 {
  readonly schemaVersion: 1;
  readonly headKey: string;
  readonly issuerPeerId: AgentPlatID;
  readonly issuerInstanceId: AgentPlatID;
  readonly issuerStreamId: AgentPlatID;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly issuerSequence: number;
  readonly attestationDigest: PlanningDigestV1;
  /** Once true, evidence from this instance remains excluded. */
  readonly equivocated: boolean;
  readonly expiresAtLogicalMs: number;
}

/**
 * Deterministic summary of independently admitted attestations. This is
 * advisory evidence, not a quorum decision, command, or authority grant.
 */
export interface PeerStrategyEvidenceCertificateV1 {
  readonly schemaVersion: 1;
  readonly certificateId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly cohortDigest: PlanningDigestV1;
  readonly binding: PeerStrategyEvidenceBindingV1;
  readonly attestationDigests: readonly PlanningDigestV1[];
  readonly attesterPeerIds: readonly AgentPlatID[];
  readonly independenceGroupIds: readonly AgentPlatID[];
  readonly outcome: PeerStrategyEvidenceOutcomeV1;
  readonly metrics: readonly PeerStrategyEvidenceMetricValueV1[];
  readonly confidenceBps: number;
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly certificateDigest: PlanningDigestV1;
}

/** Bounded local input that a strategy-adaptation integration may choose to use. */
export interface PeerStrategyEvidenceAdvisoryPriorV1 {
  readonly schemaVersion: 1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly certificateDigest: PlanningDigestV1;
  readonly outcome: PeerStrategyEvidenceOutcomeV1;
  readonly metrics: readonly PeerStrategyEvidenceMetricValueV1[];
  readonly confidenceBps: number;
  readonly influenceBps: number;
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly priorDigest: PlanningDigestV1;
}

export interface PeerStrategyEvidenceStateV1 {
  readonly format: typeof PEER_STRATEGY_EVIDENCE_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly exchangerId: AgentPlatID;
  readonly exchangerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly sourceHeads: readonly PeerStrategyEvidenceSourceHeadV1[];
  readonly attestations: readonly SignedPeerStrategyOutcomeAttestationV1[];
  /** Bounded, unaggregated records waiting for their causal predecessor. */
  readonly pendingAttestations: readonly SignedPeerStrategyOutcomeAttestationV1[];
  readonly certificates: readonly PeerStrategyEvidenceCertificateV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

/** Atomic revision-checked state boundary. */
export interface PeerStrategyEvidenceStoreV1 {
  load(stateKey: AgentPlatID): Promise<PeerStrategyEvidenceStateV1 | null>;
  save(input: {
    readonly state: PeerStrategyEvidenceStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

export type PeerStrategyEvidenceAdmissionStatusV1 =
  | "admitted"
  | "duplicate"
  | "pending_predecessor"
  | "rejected";

export interface PeerStrategyEvidenceAdmissionDecisionV1 {
  readonly schemaVersion: 1;
  readonly attestationId: AgentPlatID;
  readonly attestationDigest: PlanningDigestV1;
  readonly status: PeerStrategyEvidenceAdmissionStatusV1;
  readonly eligibilityDecisionDigest: PlanningDigestV1 | null;
  readonly reasonCodes: readonly string[];
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly admissionDecisionDigest: PlanningDigestV1;
}

export type PeerStrategyEvidenceCertificateStatusV1 =
  | "certified"
  | "insufficient_evidence"
  | "unsafe"
  | "idempotent"
  | "rejected";

export interface PeerStrategyEvidenceCertificateDecisionV1 {
  readonly schemaVersion: 1;
  readonly cohortDigest: PlanningDigestV1;
  readonly bindingDigest: PlanningDigestV1;
  readonly status: PeerStrategyEvidenceCertificateStatusV1;
  readonly certificate: PeerStrategyEvidenceCertificateV1 | null;
  readonly reasonCodes: readonly string[];
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly certificateDecisionDigest: PlanningDigestV1;
}

export interface PeerStrategyEvidenceHandoffEnvelopeV1 {
  readonly format: typeof PEER_STRATEGY_EVIDENCE_HANDOFF_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly contentClass: "peer_strategy_evidence_exchange_state";
  readonly exchangerId: AgentPlatID;
  readonly exchangerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly sourceStateKey: AgentPlatID;
  readonly sourceStateDigest: PlanningDigestV1;
  readonly targetStateKey: AgentPlatID;
  readonly exportedAtLogicalMs: number;
  readonly sourceState: PeerStrategyEvidenceStateV1;
  readonly handoffDigest: PlanningDigestV1;
}

/**
 * Adapter boundary for storing signed attestations in the existing authenticated
 * causal synchronization protocol. It does not make networking implicit.
 */
export interface PeerStrategyEvidenceCollectiveSyncAdapterPortV1 {
  readonly syncDomain: typeof PEER_STRATEGY_EVIDENCE_SYNC_DOMAIN_V1;
  toRecord(input: {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    /** Digest of the preceding sync record, distinct from the attestation digest. */
    readonly predecessorRecordDigest: PlanningDigestV1 | null;
  }): Promise<PeerStrategyEvidenceSyncRecordV1>;
  fromRecord(input: {
    readonly record: PeerStrategyEvidenceSyncRecordV1;
  }): Promise<SignedPeerStrategyOutcomeAttestationV1 | null>;
}

/** Explicit transport/scheduling seam; implementations may use sparse gossip. */
export interface PeerStrategyEvidenceCollectiveSyncTransportPortV1 {
  publish(input: {
    readonly records: readonly PeerStrategyEvidenceSyncRecordV1[];
    readonly maximumFanout: number;
    readonly maximumHops: number;
  }): Promise<void>;
  frontier(input: {
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceSyncFrontierV1 | null>;
}

export interface PeerStrategyEvidenceRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly exchangerId: AgentPlatID;
  readonly exchangerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policy: PeerStrategyEvidencePolicyRecordV1;
  readonly eligibility: PeerStrategyEvidenceEligibilityPortV1;
  readonly independence: PeerStrategyEvidenceIndependencePortV1;
  readonly store: PeerStrategyEvidenceStoreV1;
}

/** Construction-bound runtime port. It exposes evidence, never remote control. */
export interface PeerStrategyEvidenceExchangePortV1 {
  readonly exchangerId: AgentPlatID;
  readonly exchangerVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  admit(input: {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceAdmissionDecisionV1>;
  certify(input: {
    readonly cohort: PeerStrategyEvidenceCohortV1;
    readonly binding: PeerStrategyEvidenceBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceCertificateDecisionV1>;
  resolvePriors(input: {
    readonly cohort: PeerStrategyEvidenceCohortV1;
    readonly binding: PeerStrategyEvidenceBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<readonly PeerStrategyEvidenceAdvisoryPriorV1[]>;
  loadState(): Promise<PeerStrategyEvidenceStateV1>;
  exportHandoff(input: {
    readonly targetStateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: PeerStrategyEvidenceHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceStateV1>;
}
