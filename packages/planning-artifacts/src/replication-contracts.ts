import type {
  CollectiveSyncClientV1,
  CollectiveSyncClockV1,
  CollectiveSyncMembershipV1,
  CollectiveSyncRepositoryV1,
  CollectiveSyncSigningV1,
} from "@agentplat/collective-sync";
import type {
  PlanningFragmentRepositoryV1,
} from "@agentplat/collective-planning/mesh";

import type {
  PlanningArtifactProofV1,
  PlanningArtifactScopeV1,
  PlanningArtifactSyncAdapterOptionsV1,
  ReplicatedPlanningFragmentRepositoryOptionsV1,
  SignedPlanningArtifactPublicationV1,
} from "./contracts.js";

export const PLANNING_ARTIFACT_REPLICATION_PROTOCOL_V1 =
  "agentplat.planning-artifact-replication" as const;
export const PLANNING_ARTIFACT_REPLICATION_SCHEMA_VERSION_V1 = 1 as const;
export const PLANNING_ARTIFACT_REPLICATION_MAX_REPLICAS_V1 = 16 as const;
export const PLANNING_ARTIFACT_REPLICATION_MAX_CANONICAL_BYTES_V1 =
  1_048_576 as const;
export const PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1 =
  "planning.artifact-certificates.v1" as const;
export const PLANNING_ARTIFACT_CERTIFICATE_PAYLOAD_TYPE_V1 =
  "planning.artifact.replication-certificate" as const;

export interface PlanningArtifactReplicationPolicyV1 {
  readonly schemaVersion: 1;
  readonly replicaCount: number;
  readonly writeThreshold: number;
  readonly receiptLifetimeMs: number;
}

export interface PlanningArtifactReplicaV1 {
  readonly peerId: string;
  readonly instanceId: string;
}

export interface PlanningArtifactReplicaStorePayloadV1 {
  readonly type: "artifact.replica.store";
  readonly publicationDigest: string;
  readonly publication: SignedPlanningArtifactPublicationV1;
  readonly requestedAtLogicalMs: number;
}

export interface PlanningArtifactReplicaStoredPayloadV1 {
  readonly type: "artifact.replica.stored";
  readonly requestMessageId: string;
  readonly publicationDigest: string;
  readonly contentReference: string;
  readonly fragmentDigest: string;
  readonly artifactDigest: string;
  readonly storedAtLogicalMs: number;
}

export interface PlanningArtifactCertificateStorePayloadV1 {
  readonly type: "artifact.certificate.store";
  readonly certificate: PlanningArtifactReplicationCertificateV1;
  readonly requestedAtLogicalMs: number;
}

export interface PlanningArtifactCertificateStoredPayloadV1 {
  readonly type: "artifact.certificate.stored";
  readonly requestMessageId: string;
  readonly certificateId: string;
  readonly artifactDigest: string;
  readonly storedAtLogicalMs: number;
}

export type PlanningArtifactReplicationRequestPayloadV1 =
  | PlanningArtifactReplicaStorePayloadV1
  | PlanningArtifactCertificateStorePayloadV1;

export type PlanningArtifactReplicationResponsePayloadV1 =
  | PlanningArtifactReplicaStoredPayloadV1
  | PlanningArtifactCertificateStoredPayloadV1;

export type PlanningArtifactReplicationPayloadV1 =
  | PlanningArtifactReplicationRequestPayloadV1
  | PlanningArtifactReplicationResponsePayloadV1;

export interface UnsignedPlanningArtifactReplicationEnvelopeV1<
  TPayload extends PlanningArtifactReplicationPayloadV1 =
    PlanningArtifactReplicationPayloadV1,
> {
  readonly protocol: typeof PLANNING_ARTIFACT_REPLICATION_PROTOCOL_V1;
  readonly schemaVersion: typeof PLANNING_ARTIFACT_REPLICATION_SCHEMA_VERSION_V1;
  readonly messageId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly senderPeerId: string;
  readonly senderInstanceId: string;
  readonly audiencePeerId: string;
  readonly audienceInstanceId: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly issuedAt: string;
  readonly expiresAtLogicalMs: number;
  readonly payload: TPayload;
  readonly proof: Omit<PlanningArtifactProofV1, "value">;
}

export interface SignedPlanningArtifactReplicationEnvelopeV1<
  TPayload extends PlanningArtifactReplicationPayloadV1 =
    PlanningArtifactReplicationPayloadV1,
> extends Omit<
  UnsignedPlanningArtifactReplicationEnvelopeV1<TPayload>,
  "proof"
> {
  readonly proof: PlanningArtifactProofV1;
}

export interface PlanningArtifactReplicationCertificateV1 {
  readonly schemaVersion: 1;
  readonly kind: "planning_artifact_replication";
  readonly certificateId: string;
  readonly certificateDigest: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly publicationDigest: string;
  readonly contentReference: string;
  readonly fragmentDigest: string;
  readonly artifactDigest: string;
  readonly policy: PlanningArtifactReplicationPolicyV1;
  readonly selectedReplicas: readonly PlanningArtifactReplicaV1[];
  readonly receipts: readonly SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>[];
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface PlanningArtifactCertificateSyncPayloadV1 {
  readonly schemaVersion: 1;
  readonly type: typeof PLANNING_ARTIFACT_CERTIFICATE_PAYLOAD_TYPE_V1;
  readonly certificate: PlanningArtifactReplicationCertificateV1;
}

export interface PlanningArtifactReplicationEvidenceRepositoryV1 {
  putReceipt(
    receipt: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>,
  ): Promise<
    SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>
  >;
  getReceipt(
    requestMessageId: string,
  ): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1> | null>;
  putCertificate(
    certificate: PlanningArtifactReplicationCertificateV1,
  ): Promise<PlanningArtifactReplicationCertificateV1>;
  getCertificate(input: {
    readonly fragmentDigest: string;
    readonly membershipConfigurationDigest: string;
  }): Promise<PlanningArtifactReplicationCertificateV1 | null>;
  putCertificateAck(
    acknowledgement: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>,
  ): Promise<
    SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>
  >;
  getCertificateAck(
    requestMessageId: string,
  ): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1> | null>;
}

export interface InMemoryPlanningArtifactReplicationEvidenceOptionsV1 {
  readonly maximumReceipts?: number;
  readonly maximumCertificates?: number;
  readonly maximumAcknowledgements?: number;
}

export interface PlanningArtifactReplicationTransportV1 {
  exchange(input: {
    readonly peerId: string;
    readonly request: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationRequestPayloadV1>;
    readonly signal?: AbortSignal;
  }): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationResponsePayloadV1> | null>;
}

export interface PlanningArtifactReplicationPeerOptionsV1 {
  readonly scope: PlanningArtifactScopeV1;
  readonly repository: PlanningFragmentRepositoryV1;
  readonly evidenceRepository: PlanningArtifactReplicationEvidenceRepositoryV1;
  readonly syncRepository: CollectiveSyncRepositoryV1;
  readonly membership: CollectiveSyncMembershipV1;
  readonly signing: CollectiveSyncSigningV1;
  readonly clock: CollectiveSyncClockV1;
  readonly policy: PlanningArtifactReplicationPolicyV1;
  readonly maximumArtifactBytes?: number;
  readonly crypto?: Crypto;
}

export interface CertifiedReplicatedPlanningFragmentRepositoryOptionsV2 extends ReplicatedPlanningFragmentRepositoryOptionsV1 {
  readonly evidenceRepository: PlanningArtifactReplicationEvidenceRepositoryV1;
  readonly replicationTransport: PlanningArtifactReplicationTransportV1;
  readonly replicationPolicy: PlanningArtifactReplicationPolicyV1;
}

export interface PlanningArtifactAvailabilitySyncAdapterOptionsV2 extends PlanningArtifactSyncAdapterOptionsV1 {
  readonly evidenceRepository: PlanningArtifactReplicationEvidenceRepositoryV1;
  readonly replicationPolicy: PlanningArtifactReplicationPolicyV1;
}

export interface CertifiedPlanningArtifactAvailabilityOptionsV2 {
  readonly scope: PlanningArtifactScopeV1;
  readonly repository: PlanningFragmentRepositoryV1;
  readonly evidenceRepository: PlanningArtifactReplicationEvidenceRepositoryV1;
  readonly client: CollectiveSyncClientV1;
  readonly membership: CollectiveSyncMembershipV1;
  readonly clock: CollectiveSyncClockV1;
  readonly replicationPolicy: PlanningArtifactReplicationPolicyV1;
  readonly crypto?: Crypto;
}

export interface PlanningArtifactReplicationHttpTransportOptionsV1 {
  readonly endpoints: Readonly<Record<string, string>>;
  readonly path?: string;
  readonly fetch?: typeof fetch;
  readonly headers?: Readonly<Record<string, string>>;
}
