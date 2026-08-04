import type { WorkContractV1 } from "@agentplat/collective-control";
import type {
  CollectivePeerNodeAssignmentConfirmationPortV1,
  CollectivePeerNodeRecoveryElectionPortV1,
  CollectivePeerNodeStoredStateV1,
} from "@agentplat/collective-runtime/node";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";
import type { MeshSignatureAlgorithm } from "@agentplat/mesh-protocol";

export const COLLECTIVE_QUORUM_PROTOCOL_V1 =
  "agentplat.collective-quorum" as const;
export const COLLECTIVE_QUORUM_SCHEMA_VERSION_V1 = 1 as const;

export interface CollectiveQuorumScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly policyDomainId: string;
}

export interface CollectiveQuorumBallotV1 {
  readonly counter: number;
  readonly proposerPeerId: string;
}

export interface CollectiveQuorumRecoveryProposalV1 {
  readonly takeoverProposalId: string;
  readonly proposedAssigneePeerId: string;
  readonly acceptedAtLogicalMs: number;
}

export interface CollectiveQuorumRecoveryValueV1 {
  readonly selectedProposalId: string;
  readonly selectedAssigneePeerId: string;
}

export interface CollectiveQuorumAcceptedRecoveryValueV1 {
  readonly ballot: CollectiveQuorumBallotV1;
  readonly value: CollectiveQuorumRecoveryValueV1;
}

/** Immutable membership snapshot that pins a quorum operation to one epoch. */
export interface CollectiveQuorumMembershipBindingV1 {
  readonly epoch: number;
  readonly configurationDigest: string;
  readonly memberPeerIds: readonly string[];
  readonly memberInstances: readonly {
    readonly peerId: string;
    readonly instanceId: string;
  }[];
}

/** Optional integration port supplied by a certified membership registry. */
export interface CollectiveQuorumMembershipBindingPortV1 {
  currentBinding(input: {
    readonly logicalTimeMs: number;
  }): Promise<CollectiveQuorumMembershipBindingV1 | null>;
  resolveBinding(input: {
    readonly epoch: number;
    readonly configurationDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveQuorumMembershipBindingV1 | null>;
}

interface CollectiveQuorumMembershipBoundPayloadV1 {
  readonly membershipEpoch?: number;
  readonly membershipConfigurationDigest?: string;
}

export interface CollectiveQuorumAssignmentRequestPayloadV1 extends CollectiveQuorumMembershipBoundPayloadV1 {
  readonly type: "assignment.confirm.request";
  readonly scopeDigest: string;
  readonly assignmentSlotDigest: string;
  readonly workContractId: string;
  readonly workContractDigest: string;
  readonly policyDomainId: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly assignedPeerId: string;
  readonly assignedInstanceId: string;
  readonly assignmentAuthorityId: string;
  readonly assignmentEpoch: number;
  readonly fencingToken: string;
  readonly acceptanceMessageId: string;
  readonly latestLeaseRenewalId: string | null;
  readonly eligibleWitnessPeerIds: readonly string[];
  readonly recoveryWitnessThreshold: number;
  readonly requestedAtLogicalMs: number;
}

export interface CollectiveQuorumAssignmentAttestationPayloadV1 extends CollectiveQuorumMembershipBoundPayloadV1 {
  readonly type: "assignment.confirm.attestation";
  readonly requestMessageId: string;
  readonly scopeDigest: string;
  readonly assignmentSlotDigest: string;
  readonly attesterRole: "owner" | "witness";
  readonly attesterPeerId: string;
  readonly ownerPeerId: string;
  readonly acceptanceId: string;
  readonly assignmentAuthorityId: string;
  readonly assignmentEpoch: number;
  readonly fencingToken: string;
  readonly leaseRenewalId: string | null;
  readonly confirmedLeaseExpiresAt: string;
  readonly confirmedAtLogicalMs: number;
}

export interface CollectiveQuorumRecoveryPreparePayloadV1 extends CollectiveQuorumMembershipBoundPayloadV1 {
  readonly type: "recovery.prepare";
  readonly scopeDigest: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
  readonly objectiveExpiresAtLogicalMs: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly priorAssignmentEpoch: number;
  readonly proposedAssignmentEpoch: number;
  readonly ballot: CollectiveQuorumBallotV1;
  readonly proposalsDigest: string;
  readonly proposals: readonly CollectiveQuorumRecoveryProposalV1[];
  readonly eligibleWitnessPeerIds: readonly string[];
  readonly recoveryWitnessThreshold: number;
  readonly requestedAtLogicalMs: number;
}

export interface CollectiveQuorumRecoveryPromisePayloadV1 extends CollectiveQuorumMembershipBoundPayloadV1 {
  readonly type: "recovery.promise";
  readonly requestMessageId: string;
  readonly scopeDigest: string;
  readonly ballot: CollectiveQuorumBallotV1;
  readonly witnessPeerId: string;
  readonly accepted: CollectiveQuorumAcceptedRecoveryValueV1 | null;
  readonly promisedAtLogicalMs: number;
}

export interface CollectiveQuorumRecoveryAcceptPayloadV1 extends CollectiveQuorumMembershipBoundPayloadV1 {
  readonly type: "recovery.accept";
  readonly scopeDigest: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
  readonly objectiveExpiresAtLogicalMs: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly priorAssignmentEpoch: number;
  readonly proposedAssignmentEpoch: number;
  readonly ballot: CollectiveQuorumBallotV1;
  readonly proposalsDigest: string;
  readonly proposals: readonly CollectiveQuorumRecoveryProposalV1[];
  readonly selected: CollectiveQuorumRecoveryValueV1;
  readonly eligibleWitnessPeerIds: readonly string[];
  readonly recoveryWitnessThreshold: number;
  readonly promiseMessageIds: readonly string[];
  readonly requestedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface CollectiveQuorumRecoveryAcceptedPayloadV1 extends CollectiveQuorumMembershipBoundPayloadV1 {
  readonly type: "recovery.accepted";
  readonly requestMessageId: string;
  readonly scopeDigest: string;
  readonly ballot: CollectiveQuorumBallotV1;
  readonly selected: CollectiveQuorumRecoveryValueV1;
  readonly witnessPeerId: string;
  readonly acceptedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export type CollectiveQuorumRequestPayloadV1 =
  | CollectiveQuorumAssignmentRequestPayloadV1
  | CollectiveQuorumRecoveryPreparePayloadV1
  | CollectiveQuorumRecoveryAcceptPayloadV1;

export type CollectiveQuorumResponsePayloadV1 =
  | CollectiveQuorumAssignmentAttestationPayloadV1
  | CollectiveQuorumRecoveryPromisePayloadV1
  | CollectiveQuorumRecoveryAcceptedPayloadV1;

export type CollectiveQuorumPayloadV1 =
  CollectiveQuorumRequestPayloadV1 | CollectiveQuorumResponsePayloadV1;

export interface CollectiveQuorumProofV1 {
  readonly algorithm: MeshSignatureAlgorithm;
  readonly keyId: string;
  readonly value: string;
}

export interface UnsignedCollectiveQuorumEnvelopeV1<
  TPayload extends CollectiveQuorumPayloadV1 = CollectiveQuorumPayloadV1,
> {
  readonly protocol: typeof COLLECTIVE_QUORUM_PROTOCOL_V1;
  readonly schemaVersion: typeof COLLECTIVE_QUORUM_SCHEMA_VERSION_V1;
  readonly messageId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly senderPeerId: string;
  readonly senderInstanceId: string;
  readonly audiencePeerId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly payload: TPayload;
  readonly proof: Omit<CollectiveQuorumProofV1, "value">;
}

export interface SignedCollectiveQuorumEnvelopeV1<
  TPayload extends CollectiveQuorumPayloadV1 = CollectiveQuorumPayloadV1,
> extends Omit<UnsignedCollectiveQuorumEnvelopeV1<TPayload>, "proof"> {
  readonly proof: CollectiveQuorumProofV1;
}

export interface CollectiveQuorumAssignmentCertificateV1 {
  readonly schemaVersion: 1;
  readonly kind: "assignment_confirmation";
  readonly certificateId: string;
  readonly scopeDigest: string;
  readonly requests: readonly SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentRequestPayloadV1>[];
  readonly ownerAttestation: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1>;
  readonly witnessAttestations: readonly SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1>[];
  readonly certificateDigest: string;
}

export interface CollectiveQuorumRecoveryCertificateV1 {
  readonly schemaVersion: 1;
  readonly kind: "recovery_election";
  readonly certificateId: string;
  readonly scopeDigest: string;
  readonly ballot: CollectiveQuorumBallotV1;
  readonly prepares: readonly SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPreparePayloadV1>[];
  readonly promises: readonly SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1>[];
  readonly accepts: readonly SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptPayloadV1>[];
  readonly accepted: readonly SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptedPayloadV1>[];
  readonly selected: CollectiveQuorumRecoveryValueV1;
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly certificateDigest: string;
}

export type CollectiveQuorumCertificateV1 =
  | CollectiveQuorumAssignmentCertificateV1
  | CollectiveQuorumRecoveryCertificateV1;

export interface CollectiveQuorumRecoveryAcceptorStateV1 {
  readonly promisedBallot: CollectiveQuorumBallotV1 | null;
  readonly accepted: CollectiveQuorumAcceptedRecoveryValueV1 | null;
}

export interface CollectiveQuorumRepositoryV1 {
  nextBallot(input: {
    readonly scopeDigest: string;
    readonly proposerPeerId: string;
  }): Promise<CollectiveQuorumBallotV1>;
  attestAssignment(input: {
    readonly assignmentSlotDigest: string;
    readonly valueDigest: string;
    readonly requestMessageId: string;
    readonly create: () => Promise<
      SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1>
    >;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1> | null>;
  promiseRecovery(input: {
    readonly scopeDigest: string;
    readonly ballot: CollectiveQuorumBallotV1;
    readonly requestMessageId: string;
    readonly create: (
      accepted: CollectiveQuorumAcceptedRecoveryValueV1 | null,
    ) => Promise<
      SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1>
    >;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1> | null>;
  acceptRecovery(input: {
    readonly scopeDigest: string;
    readonly ballot: CollectiveQuorumBallotV1;
    readonly value: CollectiveQuorumRecoveryValueV1;
    readonly requestMessageId: string;
    readonly create: () => Promise<
      SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptedPayloadV1>
    >;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptedPayloadV1> | null>;
  saveCertificate(certificate: CollectiveQuorumCertificateV1): Promise<void>;
  getCertificate(
    certificateId: string,
  ): Promise<CollectiveQuorumCertificateV1 | undefined>;
}

export interface CollectiveQuorumClockReadingV1 {
  readonly wallTime: string;
  readonly logicalTimeMs: number;
}

export interface CollectiveQuorumClockV1 {
  now(): CollectiveQuorumClockReadingV1;
}

export interface CollectiveQuorumSigningV1 {
  readonly privateKey: CryptoKey;
  readonly keyId: string;
  readonly algorithm: MeshSignatureAlgorithm;
}

export interface CollectiveQuorumTransportV1 {
  exchange<TRequest extends CollectiveQuorumRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveQuorumEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1> | null>;
}

export interface CollectiveQuorumSemanticEvidencePortV1 {
  confirmAssignment(input: {
    readonly request: CollectiveQuorumAssignmentRequestPayloadV1;
    readonly localPeerId: string;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly acceptanceId: string;
    readonly confirmedLeaseExpiresAt: string;
    readonly attesterRole: "owner" | "witness";
  } | null>;
  acceptsRecoveryValue(input: {
    readonly request:
      | CollectiveQuorumRecoveryPreparePayloadV1
      | CollectiveQuorumRecoveryAcceptPayloadV1;
    readonly selected: CollectiveQuorumRecoveryValueV1;
    readonly localPeerId: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export type CollectiveQuorumReadinessOperationV1 =
  "assignment_attestation" | "recovery_promise" | "recovery_acceptance";

/** Optional fail-closed gate supplied by membership-bound state catch-up. */
export interface CollectiveQuorumReadinessPortV1 {
  check(input: {
    readonly operation: CollectiveQuorumReadinessOperationV1;
    readonly policyDomainId: string;
    readonly scopeDigest: string;
    readonly membershipEpoch?: number;
    readonly membershipConfigurationDigest?: string;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly ready: boolean; readonly reasonCode: string }>;
}

export interface CollectiveQuorumPeerOptionsV1 {
  readonly scope: CollectiveQuorumScopeV1;
  readonly signing: CollectiveQuorumSigningV1;
  readonly resolver: MeshKeyResolver;
  readonly membership?: CollectiveQuorumMembershipBindingPortV1;
  readonly repository: CollectiveQuorumRepositoryV1;
  readonly evidence: CollectiveQuorumSemanticEvidencePortV1;
  readonly readiness?: CollectiveQuorumReadinessPortV1;
  readonly clock: CollectiveQuorumClockV1;
  readonly crypto?: Crypto;
  readonly maximumEnvelopeTtlMs?: number;
}

export interface CollectiveQuorumClientOptionsV1 extends Omit<
  CollectiveQuorumPeerOptionsV1,
  "evidence"
> {
  readonly transport: CollectiveQuorumTransportV1;
  readonly maximumAttempts?: number;
  readonly requestTimeoutMs?: number;
}

export interface CollectiveQuorumPeerHandleResultV1 {
  readonly accepted: boolean;
  readonly code:
    | "accepted"
    | "invalid_envelope"
    | "wrong_audience"
    | "expired"
    | "not_ready"
    | "semantic_evidence_unavailable"
    | "ballot_rejected"
    | "invalid_quorum";
  readonly response?: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1>;
}

export interface CollectivePeerNodeQuorumEvidenceOptionsV1 {
  readonly scope: CollectiveQuorumScopeV1;
  readonly readState: () =>
    Promise<CollectivePeerNodeStoredStateV1> | CollectivePeerNodeStoredStateV1;
}

export interface CollectivePeerNodeQuorumPortsV1 {
  readonly assignmentConfirmation: CollectivePeerNodeAssignmentConfirmationPortV1;
  readonly recoveryElection: CollectivePeerNodeRecoveryElectionPortV1;
}

export interface CollectiveQuorumAssignmentInputV1 {
  readonly workContract: WorkContractV1;
  readonly acceptanceMessageId: string;
  readonly latestLeaseRenewalId: string | null;
  readonly eligibleWitnessPeerIds: readonly string[];
  readonly recoveryWitnessThreshold: number;
  readonly logicalTimeMs: number;
}

export type CollectiveQuorumRecoveryInputV1 = Parameters<
  CollectivePeerNodeRecoveryElectionPortV1["select"]
>[0];
