import type {
  CollectiveQuorumMembershipBindingPortV1,
  CollectiveQuorumMembershipBindingV1,
} from "@agentplat/collective-quorum";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";
import type { MeshSignatureAlgorithm } from "@agentplat/mesh-protocol";

export const COLLECTIVE_MEMBERSHIP_PROTOCOL_V1 =
  "agentplat.collective-membership" as const;
export const COLLECTIVE_MEMBERSHIP_SCHEMA_VERSION_V1 = 1 as const;

export interface CollectiveMembershipScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly policyDomainId: string;
}

/** Portable raw Ed25519 verification key; private material never enters state. */
export interface CollectiveMembershipKeyV1 {
  readonly keyId: string;
  readonly algorithm: MeshSignatureAlgorithm;
  readonly publicKey: string;
  readonly validFrom: string;
  readonly validUntil: string;
}

export interface CollectiveMembershipMemberV1 {
  readonly peerId: string;
  readonly instanceId: string;
  readonly activeKeyId: string;
  readonly keys: readonly CollectiveMembershipKeyV1[];
}

export interface CollectiveMembershipConfigurationV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly epoch: number;
  readonly previousConfigurationDigest: string | null;
  readonly effectiveAt: string;
  readonly effectiveAtLogicalMs: number;
  readonly members: readonly CollectiveMembershipMemberV1[];
  readonly quorumThreshold: number;
  readonly configurationDigest: string;
}

export interface CollectiveMembershipKeyProofV1 {
  readonly algorithm: MeshSignatureAlgorithm;
  readonly keyId: string;
  readonly value: string;
}

export type CollectiveMembershipChangeV1 =
  | {
      readonly kind: "join";
      readonly peerId: string;
      readonly activeKeyProof: CollectiveMembershipKeyProofV1;
    }
  | {
      readonly kind: "leave";
      readonly peerId: string;
    }
  | {
      readonly kind: "rotate_key";
      readonly peerId: string;
      readonly retiringKeyId: string;
      readonly activeKeyId: string;
      readonly overlapUntil: string;
      readonly retiringKeyProof: CollectiveMembershipKeyProofV1;
      readonly activeKeyProof: CollectiveMembershipKeyProofV1;
    };

export interface CollectiveMembershipTransitionProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly fromEpoch: number;
  readonly toEpoch: number;
  readonly previousConfigurationDigest: string;
  readonly nextConfiguration: CollectiveMembershipConfigurationV1;
  readonly change: CollectiveMembershipChangeV1;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly proposalDigest: string;
}

export interface CollectiveMembershipVoteRequestPayloadV1 {
  readonly type: "membership.transition.vote.request";
  readonly proposal: CollectiveMembershipTransitionProposalV1;
  readonly requestedAtLogicalMs: number;
}

export interface CollectiveMembershipVotePayloadV1 {
  readonly type: "membership.transition.vote";
  readonly requestMessageId: string;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly voterPeerId: string;
  readonly fromEpoch: number;
  readonly toEpoch: number;
  readonly previousConfigurationDigest: string;
  readonly nextConfigurationDigest: string;
  readonly approvedAtLogicalMs: number;
}

export interface CollectiveMembershipCertificateV1 {
  readonly schemaVersion: 1;
  readonly kind: "membership_transition";
  readonly certificateId: string;
  readonly proposal: CollectiveMembershipTransitionProposalV1;
  readonly requests: readonly SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVoteRequestPayloadV1>[];
  readonly votes: readonly SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>[];
  readonly previousQuorumPeerIds: readonly string[];
  readonly nextQuorumPeerIds: readonly string[];
  readonly certifiedAt: string;
  readonly certifiedAtLogicalMs: number;
  readonly certificateDigest: string;
}

export interface CollectiveMembershipCommitRequestPayloadV1 {
  readonly type: "membership.transition.commit.request";
  readonly certificate: CollectiveMembershipCertificateV1;
  readonly requestedAtLogicalMs: number;
}

export interface CollectiveMembershipCommitAckPayloadV1 {
  readonly type: "membership.transition.commit.ack";
  readonly requestMessageId: string;
  readonly certificateId: string;
  readonly configurationEpoch: number;
  readonly configurationDigest: string;
  readonly committedAtLogicalMs: number;
}

export type CollectiveMembershipRequestPayloadV1 =
  | CollectiveMembershipVoteRequestPayloadV1
  | CollectiveMembershipCommitRequestPayloadV1;

export type CollectiveMembershipResponsePayloadV1 =
  CollectiveMembershipVotePayloadV1 | CollectiveMembershipCommitAckPayloadV1;

export type CollectiveMembershipPayloadV1 =
  CollectiveMembershipRequestPayloadV1 | CollectiveMembershipResponsePayloadV1;

export interface CollectiveMembershipProofV1 {
  readonly algorithm: MeshSignatureAlgorithm;
  readonly keyId: string;
  readonly value: string;
}

export interface UnsignedCollectiveMembershipEnvelopeV1<
  TPayload extends CollectiveMembershipPayloadV1 =
    CollectiveMembershipPayloadV1,
> {
  readonly protocol: typeof COLLECTIVE_MEMBERSHIP_PROTOCOL_V1;
  readonly schemaVersion: typeof COLLECTIVE_MEMBERSHIP_SCHEMA_VERSION_V1;
  readonly messageId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly senderPeerId: string;
  readonly senderInstanceId: string;
  readonly audiencePeerId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly payload: TPayload;
  readonly proof: Omit<CollectiveMembershipProofV1, "value">;
}

export interface SignedCollectiveMembershipEnvelopeV1<
  TPayload extends CollectiveMembershipPayloadV1 =
    CollectiveMembershipPayloadV1,
> extends Omit<UnsignedCollectiveMembershipEnvelopeV1<TPayload>, "proof"> {
  readonly proof: CollectiveMembershipProofV1;
}

export interface CollectiveMembershipClockReadingV1 {
  readonly wallTime: string;
  readonly logicalTimeMs: number;
}

export interface CollectiveMembershipClockV1 {
  now(): CollectiveMembershipClockReadingV1;
}

export interface CollectiveMembershipSigningV1 {
  readonly privateKey: CryptoKey;
  readonly keyId: string;
  readonly algorithm: MeshSignatureAlgorithm;
}

export interface CollectiveMembershipRepositoryV1 {
  initialize(configuration: CollectiveMembershipConfigurationV1): Promise<void>;
  configurations(): Promise<readonly CollectiveMembershipConfigurationV1[]>;
  voteTransition(input: {
    readonly fromEpoch: number;
    readonly proposalDigest: string;
    readonly requestMessageId: string;
    readonly create: () => Promise<
      SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>
    >;
  }): Promise<SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1> | null>;
  commitTransition(input: {
    readonly expectedEpoch: number;
    readonly certificate: CollectiveMembershipCertificateV1;
  }): Promise<boolean>;
  saveCertificate(
    certificate: CollectiveMembershipCertificateV1,
  ): Promise<void>;
  getCertificate(
    certificateId: string,
  ): Promise<CollectiveMembershipCertificateV1 | undefined>;
}

export interface CollectiveMembershipRegistryV1
  extends MeshKeyResolver, CollectiveQuorumMembershipBindingPortV1 {
  current(): CollectiveMembershipConfigurationV1;
  configuration(epoch: number): CollectiveMembershipConfigurationV1 | undefined;
  instanceIds(peerId: string): readonly string[];
  binding(
    configuration: CollectiveMembershipConfigurationV1,
  ): CollectiveQuorumMembershipBindingV1;
  apply(configuration: CollectiveMembershipConfigurationV1): Promise<void>;
}

export interface CollectiveMembershipTransportV1 {
  exchange<TRequest extends CollectiveMembershipRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveMembershipEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1> | null>;
}

export interface CollectiveMembershipPeerOptionsV1 {
  readonly scope: CollectiveMembershipScopeV1;
  readonly signing: CollectiveMembershipSigningV1;
  readonly registry: CollectiveMembershipRegistryV1;
  readonly repository: CollectiveMembershipRepositoryV1;
  readonly clock: CollectiveMembershipClockV1;
  readonly crypto?: Crypto;
  readonly maximumEnvelopeTtlMs?: number;
}

export interface CollectiveMembershipClientOptionsV1 extends CollectiveMembershipPeerOptionsV1 {
  readonly transport: CollectiveMembershipTransportV1;
  readonly requestTimeoutMs?: number;
}

export interface CollectiveMembershipPeerHandleResultV1 {
  readonly accepted: boolean;
  readonly code:
    | "accepted"
    | "invalid_envelope"
    | "wrong_audience"
    | "expired"
    | "not_member"
    | "transition_rejected"
    | "vote_conflict"
    | "certificate_rejected";
  readonly response?: SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1>;
}
