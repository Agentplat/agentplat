import type { JsonValue } from "@agentplat/core";
import type { MeshKeyRecord } from "@agentplat/mesh-crypto";
import type { MeshSignatureAlgorithm } from "@agentplat/mesh-protocol";
import type { PortableAgentCheckpointTransferV1 } from "@agentplat/runtime/adapter";

export const EXECUTION_CHECKPOINT_PROTOCOL_V1 =
  "agentplat.execution-checkpoint.v1" as const;
export const EXECUTION_CHECKPOINT_SCHEMA_VERSION_V1 = 1 as const;
export const EXECUTION_CHECKPOINT_HTTP_PATH_V1 =
  "/agentplat/execution-checkpoints/v1/exchange" as const;

export interface ExecutionCheckpointScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly peerId: string;
  readonly instanceId: string;
}

export interface ExecutionCheckpointMembershipBindingV1 {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly configurationDigest: string;
  readonly memberInstances: readonly {
    readonly peerId: string;
    readonly instanceId: string;
  }[];
}

export interface ExecutionCheckpointMembershipV1 {
  currentBinding(input: {
    readonly logicalTimeMs: number;
  }): Promise<ExecutionCheckpointMembershipBindingV1 | null>;
  resolveBinding(input: {
    readonly epoch: number;
    readonly configurationDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<ExecutionCheckpointMembershipBindingV1 | null>;
  resolve(input: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly peerId: string;
    readonly keyId: string;
    readonly algorithm: MeshSignatureAlgorithm;
  }): MeshKeyRecord | undefined;
}

export interface ExecutionCheckpointSigningV1 {
  readonly algorithm: MeshSignatureAlgorithm;
  readonly keyId: string;
  readonly privateKey: CryptoKey;
}

export interface ExecutionCheckpointClockV1 {
  now(): { readonly wallTime: string; readonly logicalTimeMs: number };
}

export interface ExecutionCheckpointProofV1 {
  readonly algorithm: MeshSignatureAlgorithm;
  readonly keyId: string;
  readonly value: string;
}

export interface ExecutionCheckpointReplicationPolicyV1 {
  readonly schemaVersion: 1;
  readonly replicaCount: number;
  readonly writeThreshold: number;
  readonly certificateCustodyThreshold: number;
  readonly evidenceLifetimeMs: number;
  readonly maximumArtifactBytes: number;
}

export interface ExecutionCheckpointManifestV1 {
  readonly schemaVersion: 1;
  readonly checkpointId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly workContractDigest: string;
  readonly roleBindingDigest: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly implementationId: string;
  readonly throughStepSequence: number;
  readonly stateDigest: string;
  readonly transferDigest: string;
  readonly contentReference: string;
  readonly createdAt: string;
  readonly publishedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface ExecutionCheckpointArtifactV1 {
  readonly schemaVersion: 1;
  readonly manifest: ExecutionCheckpointManifestV1;
  readonly transfer: PortableAgentCheckpointTransferV1;
  readonly artifactDigest: string;
}

export interface UnsignedExecutionCheckpointPublicationV1 {
  readonly schemaVersion: 1;
  readonly kind: "execution_checkpoint";
  readonly artifact: ExecutionCheckpointArtifactV1;
  readonly proof: Omit<ExecutionCheckpointProofV1, "value">;
}

export interface SignedExecutionCheckpointPublicationV1 extends Omit<
  UnsignedExecutionCheckpointPublicationV1,
  "proof"
> {
  readonly proof: ExecutionCheckpointProofV1;
}

export interface ExecutionCheckpointReplicaV1 {
  readonly peerId: string;
  readonly instanceId: string;
}

export type ExecutionCheckpointRequestPayloadV1 =
  | {
      readonly type: "checkpoint.artifact.store";
      readonly publication: SignedExecutionCheckpointPublicationV1;
    }
  | {
      readonly type: "checkpoint.certificate.store";
      readonly certificate: ExecutionCheckpointReplicationCertificateV1;
    }
  | {
      readonly type: "checkpoint.certificate.get";
      readonly checkpointId: string;
    }
  | {
      readonly type: "checkpoint.artifact.get";
      readonly checkpointId: string;
      readonly artifactDigest: string;
    };

export type ExecutionCheckpointResponsePayloadV1 =
  | {
      readonly type: "checkpoint.artifact.stored";
      readonly requestMessageId: string;
      readonly checkpointId: string;
      readonly artifactDigest: string;
      readonly storedAtLogicalMs: number;
    }
  | {
      readonly type: "checkpoint.certificate.stored";
      readonly requestMessageId: string;
      readonly checkpointId: string;
      readonly certificateId: string;
      readonly storedAtLogicalMs: number;
    }
  | {
      readonly type: "checkpoint.certificate.found";
      readonly requestMessageId: string;
      readonly checkpointId: string;
      readonly certificate: ExecutionCheckpointReplicationCertificateV1 | null;
    }
  | {
      readonly type: "checkpoint.artifact.found";
      readonly requestMessageId: string;
      readonly checkpointId: string;
      readonly artifact: ExecutionCheckpointArtifactV1 | null;
    };

export type ExecutionCheckpointPayloadV1 =
  ExecutionCheckpointRequestPayloadV1 | ExecutionCheckpointResponsePayloadV1;

export interface UnsignedExecutionCheckpointEnvelopeV1<
  TPayload extends ExecutionCheckpointPayloadV1 = ExecutionCheckpointPayloadV1,
> {
  readonly protocol: typeof EXECUTION_CHECKPOINT_PROTOCOL_V1;
  readonly schemaVersion: 1;
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
  readonly proof: Omit<ExecutionCheckpointProofV1, "value">;
}

export interface SignedExecutionCheckpointEnvelopeV1<
  TPayload extends ExecutionCheckpointPayloadV1 = ExecutionCheckpointPayloadV1,
> extends Omit<UnsignedExecutionCheckpointEnvelopeV1<TPayload>, "proof"> {
  readonly proof: ExecutionCheckpointProofV1;
}

export interface ExecutionCheckpointReplicationCertificateV1 {
  readonly schemaVersion: 1;
  readonly kind: "execution_checkpoint_replication";
  readonly certificateId: string;
  readonly certificateDigest: string;
  readonly checkpointId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly artifactDigest: string;
  readonly contentReference: string;
  readonly policy: ExecutionCheckpointReplicationPolicyV1;
  readonly selectedReplicas: readonly ExecutionCheckpointReplicaV1[];
  readonly receipts: readonly SignedExecutionCheckpointEnvelopeV1<{
    readonly type: "checkpoint.artifact.stored";
    readonly requestMessageId: string;
    readonly checkpointId: string;
    readonly artifactDigest: string;
    readonly storedAtLogicalMs: number;
  }>[];
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface ExecutionCheckpointArtifactRepositoryV1 {
  put(
    artifact: ExecutionCheckpointArtifactV1,
  ): Promise<ExecutionCheckpointArtifactV1>;
  get(checkpointId: string): Promise<ExecutionCheckpointArtifactV1 | null>;
}

export interface ExecutionCheckpointEvidenceRepositoryV1 {
  putReceipt(
    receipt: SignedExecutionCheckpointEnvelopeV1<
      Extract<
        ExecutionCheckpointResponsePayloadV1,
        { readonly type: "checkpoint.artifact.stored" }
      >
    >,
  ): Promise<
    SignedExecutionCheckpointEnvelopeV1<
      Extract<
        ExecutionCheckpointResponsePayloadV1,
        { readonly type: "checkpoint.artifact.stored" }
      >
    >
  >;
  getReceipt(
    messageId: string,
  ): Promise<SignedExecutionCheckpointEnvelopeV1<
    Extract<
      ExecutionCheckpointResponsePayloadV1,
      { readonly type: "checkpoint.artifact.stored" }
    >
  > | null>;
  putCertificate(
    certificate: ExecutionCheckpointReplicationCertificateV1,
  ): Promise<ExecutionCheckpointReplicationCertificateV1>;
  getCertificate(
    checkpointId: string,
  ): Promise<ExecutionCheckpointReplicationCertificateV1 | null>;
  putCertificateAck(
    acknowledgement: SignedExecutionCheckpointEnvelopeV1<
      Extract<
        ExecutionCheckpointResponsePayloadV1,
        { readonly type: "checkpoint.certificate.stored" }
      >
    >,
  ): Promise<
    SignedExecutionCheckpointEnvelopeV1<
      Extract<
        ExecutionCheckpointResponsePayloadV1,
        { readonly type: "checkpoint.certificate.stored" }
      >
    >
  >;
  getCertificateAck(
    messageId: string,
  ): Promise<SignedExecutionCheckpointEnvelopeV1<
    Extract<
      ExecutionCheckpointResponsePayloadV1,
      { readonly type: "checkpoint.certificate.stored" }
    >
  > | null>;
}

export interface ExecutionCheckpointTransportV1 {
  exchange(input: {
    readonly peerId: string;
    readonly request: SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointRequestPayloadV1>;
    readonly signal?: AbortSignal;
  }): Promise<SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointResponsePayloadV1> | null>;
}

export interface ExecutionCheckpointPublishInputV1 {
  readonly transfer: PortableAgentCheckpointTransferV1;
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly workContractDigest: string;
  readonly roleBindingDigest: string;
  readonly signal?: AbortSignal;
}

export interface ExecutionCheckpointResolveInputV1 {
  readonly checkpointId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly previousAssignmentEpoch: number;
  readonly signal?: AbortSignal;
}

export interface ExecutionCheckpointAvailabilityPortV1 {
  publish(
    input: ExecutionCheckpointPublishInputV1,
  ): Promise<ExecutionCheckpointReplicationCertificateV1>;
  resolve(
    input: ExecutionCheckpointResolveInputV1,
  ): Promise<ExecutionCheckpointArtifactV1 | null>;
}

export interface ExecutionCheckpointPeerOptionsV1 {
  readonly scope: ExecutionCheckpointScopeV1;
  readonly policy: ExecutionCheckpointReplicationPolicyV1;
  readonly artifacts: ExecutionCheckpointArtifactRepositoryV1;
  readonly evidence: ExecutionCheckpointEvidenceRepositoryV1;
  readonly membership: ExecutionCheckpointMembershipV1;
  readonly signing: ExecutionCheckpointSigningV1;
  readonly clock: ExecutionCheckpointClockV1;
  readonly crypto?: Crypto;
}

export interface CertifiedExecutionCheckpointAvailabilityOptionsV1 extends ExecutionCheckpointPeerOptionsV1 {
  readonly transport: ExecutionCheckpointTransportV1;
}

export type ExecutionCheckpointJsonV1 = JsonValue;
