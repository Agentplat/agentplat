import type {
  CollectivePeerNodeAssignmentConfirmationPortV1,
  CollectivePeerNodeRecoveryElectionPortV1,
} from "@agentplat/collective-runtime/node";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";
import type { MeshSignatureAlgorithm } from "@agentplat/mesh-protocol";

export const COLLECTIVE_AGREEMENT_PROTOCOL_V1 =
  "agentplat.collective-agreement" as const;
export const COLLECTIVE_AGREEMENT_SCHEMA_VERSION_V1 = 1 as const;

export type CollectiveAgreementValueKindV1 =
  | "application"
  | "assignment_confirmation"
  | "recovery_selection"
  | "planning_slot_head"
  | "role_reconfiguration"
  | "trust_decision"
  | "synchronization_watermark"
  | "membership_reconfiguration";

/** Canonical JSON object whose digest is bound into every agreement vote. */
export interface CollectiveAgreementValueV1 {
  readonly schemaVersion: 1;
  readonly kind: CollectiveAgreementValueKindV1;
  readonly valueId: string;
  readonly previousCommitDigest: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly valueDigest: string;
}

export interface CollectiveAgreementCoordinateV1 {
  readonly policyDomainId: string;
  readonly slotId: string;
  readonly height: number;
  readonly round: number;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
}

export interface CollectiveAgreementValidatorV1 {
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
}

/**
 * Immutable validator set for one epoch. V1 requires n = 3f + 1 and commits
 * only with 2f + 1 distinct validator signatures.
 */
export interface CollectiveAgreementMembershipV1 {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly configurationDigest: string;
  readonly faultThreshold: number;
  readonly validators: readonly CollectiveAgreementValidatorV1[];
}

export interface CollectiveAgreementMembershipPortV1 {
  current(input: {
    readonly policyDomainId: string;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveAgreementMembershipV1 | null>;
  resolve(input: {
    readonly policyDomainId: string;
    readonly epoch: number;
    readonly configurationDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveAgreementMembershipV1 | null>;
}

export interface CollectiveAgreementProofV1 {
  readonly algorithm: MeshSignatureAlgorithm;
  readonly keyId: string;
  readonly value: string;
}

export interface CollectiveAgreementProposalPayloadV1 {
  readonly type: "agreement.proposal";
  readonly proposalId: string;
  readonly coordinate: CollectiveAgreementCoordinateV1;
  readonly proposerPeerId: string;
  readonly value: CollectiveAgreementValueV1;
  readonly validRound: number | null;
  readonly justification: CollectiveAgreementVoteCertificateV1 | null;
  readonly proposedAtLogicalMs: number;
}

export type CollectiveAgreementVotePhaseV1 = "prevote" | "precommit";

export interface CollectiveAgreementVotePayloadV1 {
  readonly type: "agreement.vote";
  readonly coordinate: CollectiveAgreementCoordinateV1;
  readonly phase: CollectiveAgreementVotePhaseV1;
  readonly proposalId: string;
  readonly voterPeerId: string;
  readonly valueDigest: string | null;
  readonly votedAtLogicalMs: number;
}

export interface CollectiveAgreementCertificatePayloadV1 {
  readonly type: "agreement.certificate";
  readonly certificate: CollectiveAgreementVoteCertificateV1;
  readonly deliveredAtLogicalMs: number;
}

export interface CollectiveAgreementCommitPayloadV1 {
  readonly type: "agreement.commit";
  readonly certificate: CollectiveAgreementCommitCertificateV1;
  readonly deliveredAtLogicalMs: number;
}

export interface CollectiveAgreementAcknowledgementPayloadV1 {
  readonly type: "agreement.ack";
  readonly requestMessageId: string;
  readonly coordinate: CollectiveAgreementCoordinateV1;
  readonly acknowledgement: "commit_stored";
  readonly acknowledgedAtLogicalMs: number;
}

export type CollectiveAgreementRequestPayloadV1 =
  | CollectiveAgreementProposalPayloadV1
  | CollectiveAgreementCertificatePayloadV1
  | CollectiveAgreementCommitPayloadV1;

export type CollectiveAgreementResponsePayloadV1 =
  | CollectiveAgreementVotePayloadV1
  | CollectiveAgreementAcknowledgementPayloadV1;

export type CollectiveAgreementPayloadV1 =
  CollectiveAgreementRequestPayloadV1 | CollectiveAgreementResponsePayloadV1;

export interface UnsignedCollectiveAgreementEnvelopeV1<
  TPayload extends CollectiveAgreementPayloadV1 = CollectiveAgreementPayloadV1,
> {
  readonly protocol: typeof COLLECTIVE_AGREEMENT_PROTOCOL_V1;
  readonly schemaVersion: typeof COLLECTIVE_AGREEMENT_SCHEMA_VERSION_V1;
  readonly messageId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly senderPeerId: string;
  readonly senderInstanceId: string;
  readonly audiencePeerId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly payload: TPayload;
  readonly proof: Omit<CollectiveAgreementProofV1, "value">;
}

export interface SignedCollectiveAgreementEnvelopeV1<
  TPayload extends CollectiveAgreementPayloadV1 = CollectiveAgreementPayloadV1,
> extends Omit<UnsignedCollectiveAgreementEnvelopeV1<TPayload>, "proof"> {
  readonly proof: CollectiveAgreementProofV1;
}

export interface CollectiveAgreementVoteCertificateV1 {
  readonly schemaVersion: 1;
  readonly kind: "vote_certificate";
  readonly phase: CollectiveAgreementVotePhaseV1;
  readonly coordinate: CollectiveAgreementCoordinateV1;
  readonly proposalId: string;
  readonly valueDigest: string | null;
  readonly votes: readonly SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>[];
  readonly certificateDigest: string;
}

export interface CollectiveAgreementCommitCertificateV1 {
  readonly schemaVersion: 1;
  readonly kind: "commit_certificate";
  readonly certificateId: string;
  readonly coordinate: CollectiveAgreementCoordinateV1;
  readonly proposalId: string;
  readonly value: CollectiveAgreementValueV1;
  readonly prevoteCertificate: CollectiveAgreementVoteCertificateV1;
  readonly precommitCertificate: CollectiveAgreementVoteCertificateV1;
  readonly committedAtLogicalMs: number;
  readonly certificateDigest: string;
}

export interface CollectiveAgreementJointReconfigurationCertificateV1 {
  readonly schemaVersion: 1;
  readonly kind: "joint_reconfiguration_certificate";
  readonly priorMembership: CollectiveAgreementMembershipV1;
  readonly nextMembership: CollectiveAgreementMembershipV1;
  readonly priorCertificate: CollectiveAgreementCommitCertificateV1;
  readonly nextCertificate: CollectiveAgreementCommitCertificateV1;
  readonly certificateDigest: string;
}

export interface CollectiveAgreementCatchupBundleV1 {
  readonly schemaVersion: 1;
  readonly policyDomainId: string;
  readonly slotId: string;
  readonly fromHeightExclusive: number;
  readonly toHeightInclusive: number;
  readonly commits: readonly CollectiveAgreementCommitCertificateV1[];
  readonly bundleDigest: string;
}

export interface CollectiveAgreementEquivocationProofV1 {
  readonly schemaVersion: 1;
  readonly kind: "equivocation_proof";
  readonly accusedPeerId: string;
  readonly coordinate: CollectiveAgreementCoordinateV1;
  readonly phase: CollectiveAgreementVotePhaseV1;
  readonly first: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>;
  readonly second: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>;
  readonly proofDigest: string;
}

export interface CollectiveAgreementLocalStateV1 {
  readonly policyDomainId: string;
  readonly slotId: string;
  readonly height: number;
  readonly highestRound: number;
  readonly lockedRound: number | null;
  readonly lockedValueDigest: string | null;
}

export type CollectiveAgreementVoteRecordResultV1 =
  | {
      readonly status: "signed" | "duplicate";
      readonly vote: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>;
    }
  | {
      readonly status: "conflict" | "locked" | "stale_round";
      readonly vote?: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>;
    };

export interface CollectiveAgreementRepositoryV1 {
  readState(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly height: number;
  }): Promise<CollectiveAgreementLocalStateV1 | null>;
  recordLocalVote(input: {
    readonly coordinate: CollectiveAgreementCoordinateV1;
    readonly phase: CollectiveAgreementVotePhaseV1;
    readonly proposalId: string;
    readonly valueDigest: string | null;
    /** A verified prior prevote certificate that permits replacing a lock. */
    readonly justifiedRound: number | null;
    readonly create: () => Promise<
      SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>
    >;
  }): Promise<CollectiveAgreementVoteRecordResultV1>;
  observeVote(
    vote: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>,
  ): Promise<CollectiveAgreementEquivocationProofV1 | null>;
  saveCommit(
    certificate: CollectiveAgreementCommitCertificateV1,
  ): Promise<"stored" | "duplicate" | "conflict" | "chain_gap">;
  getCommit(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly height: number;
  }): Promise<CollectiveAgreementCommitCertificateV1 | undefined>;
  listCommits(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly fromHeightExclusive: number;
    readonly maximumCount: number;
  }): Promise<readonly CollectiveAgreementCommitCertificateV1[]>;
}

export interface CollectiveAgreementClockReadingV1 {
  readonly wallTime: string;
  readonly logicalTimeMs: number;
}

export interface CollectiveAgreementClockV1 {
  now(): CollectiveAgreementClockReadingV1;
}

export interface CollectiveAgreementSigningV1 {
  readonly privateKey: CryptoKey;
  readonly keyId: string;
  readonly algorithm: MeshSignatureAlgorithm;
}

export interface CollectiveAgreementTransportV1 {
  exchange<TRequest extends CollectiveAgreementRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveAgreementEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementResponsePayloadV1> | null>;
}

export interface CollectiveAgreementSemanticPortV1 {
  evaluate(input: {
    readonly coordinate: CollectiveAgreementCoordinateV1;
    readonly proposalId: string;
    readonly proposerPeerId: string;
    readonly value: CollectiveAgreementValueV1;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly accepted: boolean; readonly reasonCode: string }>;
}

export interface CollectiveAgreementReadinessPortV1 {
  check(input: {
    readonly operation: "proposal" | "precommit" | "commit";
    readonly coordinate: CollectiveAgreementCoordinateV1;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly ready: boolean; readonly reasonCode: string }>;
}

export interface CollectiveAgreementEquivocationSinkV1 {
  report(proof: CollectiveAgreementEquivocationProofV1): Promise<void> | void;
}

export interface CollectiveAgreementScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
}

export interface CollectiveAgreementPeerOptionsV1 {
  readonly scope: CollectiveAgreementScopeV1;
  readonly signing: CollectiveAgreementSigningV1;
  readonly resolver: MeshKeyResolver;
  readonly membership: CollectiveAgreementMembershipPortV1;
  readonly repository: CollectiveAgreementRepositoryV1;
  readonly semantics: CollectiveAgreementSemanticPortV1;
  readonly readiness?: CollectiveAgreementReadinessPortV1;
  readonly equivocation?: CollectiveAgreementEquivocationSinkV1;
  readonly clock: CollectiveAgreementClockV1;
  readonly crypto?: Crypto;
  readonly maximumEnvelopeTtlMs?: number;
}

export interface CollectiveAgreementClientOptionsV1 {
  readonly scope: CollectiveAgreementScopeV1;
  readonly signing: CollectiveAgreementSigningV1;
  readonly resolver: MeshKeyResolver;
  readonly membership: CollectiveAgreementMembershipPortV1;
  readonly repository: CollectiveAgreementRepositoryV1;
  readonly transport: CollectiveAgreementTransportV1;
  readonly equivocation?: CollectiveAgreementEquivocationSinkV1;
  readonly clock: CollectiveAgreementClockV1;
  readonly crypto?: Crypto;
  readonly requestTimeoutMs?: number;
  readonly maximumEnvelopeTtlMs?: number;
}

export interface CollectiveAgreementDecisionInputV1 {
  readonly membership: CollectiveAgreementMembershipV1;
  readonly policyDomainId: string;
  readonly slotId: string;
  readonly height: number;
  readonly round: number;
  readonly value: CollectiveAgreementValueV1;
  readonly validRound?: number | null;
  readonly justification?: CollectiveAgreementVoteCertificateV1 | null;
  readonly logicalTimeMs: number;
  readonly signal?: AbortSignal;
}

export interface CollectiveAgreementDecisionPortV1 {
  decide(
    input: CollectiveAgreementDecisionInputV1,
  ): Promise<CollectiveAgreementCommitCertificateV1 | null>;
}

export interface CollectiveAgreementPeerHandleResultV1 {
  readonly accepted: boolean;
  readonly code:
    | "accepted"
    | "invalid_envelope"
    | "wrong_scope"
    | "wrong_audience"
    | "expired"
    | "membership_unavailable"
    | "invalid_membership"
    | "invalid_proposer"
    | "invalid_certificate"
    | "not_ready"
    | "semantic_rejection"
    | "locked"
    | "stale_round"
    | "conflicting_vote"
    | "commit_conflict"
    | "chain_gap";
  readonly response?: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementResponsePayloadV1>;
}

export interface CollectiveAgreementRuntimePortsV1 {
  readonly assignmentConfirmation: CollectivePeerNodeAssignmentConfirmationPortV1;
  readonly recoveryElection: CollectivePeerNodeRecoveryElectionPortV1;
}
