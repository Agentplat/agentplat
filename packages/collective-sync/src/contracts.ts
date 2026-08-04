import type {
  CollectiveQuorumMembershipBindingPortV1,
  CollectiveQuorumMembershipBindingV1,
} from "@agentplat/collective-quorum";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";
import type { MeshSignatureAlgorithm } from "@agentplat/mesh-protocol";

export const COLLECTIVE_SYNC_PROTOCOL_V1 = "agentplat.collective-sync" as const;
export const COLLECTIVE_SYNC_SCHEMA_VERSION_V1 = 1 as const;
export const COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1 = 256 as const;
export const COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1 = 1_048_576 as const;

export interface CollectiveSyncScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly policyDomainId: string;
}

/** JSON-safe, content-addressed evidence in one append-only causal stream. */
export interface CollectiveSyncRecordV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly syncDomain: string;
  readonly streamId: string;
  readonly sequence: number;
  readonly predecessorDigest: string | null;
  readonly payload: unknown;
  readonly payloadDigest: string;
  readonly createdAtLogicalMs: number;
  readonly recordDigest: string;
}

export interface CollectiveSyncCursorV1 {
  readonly streamId: string;
  readonly sequence: number;
  readonly headDigest: string | null;
}

export interface CollectiveSyncFrontierV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly syncDomain: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly entries: readonly CollectiveSyncCursorV1[];
  readonly frontierDigest: string;
}

interface CollectiveSyncMembershipBoundPayloadV1 {
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
}

export interface CollectiveSyncFrontierRequestPayloadV1 extends CollectiveSyncMembershipBoundPayloadV1 {
  readonly type: "sync.frontier.request";
  readonly sessionId: string;
  readonly syncDomain: string;
  readonly localFrontier: CollectiveSyncFrontierV1;
  readonly requestedAtLogicalMs: number;
}

export interface CollectiveSyncFrontierResponsePayloadV1 extends CollectiveSyncMembershipBoundPayloadV1 {
  readonly type: "sync.frontier.response";
  readonly requestMessageId: string;
  readonly sessionId: string;
  readonly sourcePeerId: string;
  readonly frontier: CollectiveSyncFrontierV1;
  readonly respondedAtLogicalMs: number;
}

export interface CollectiveSyncChunkRequestPayloadV1 extends CollectiveSyncMembershipBoundPayloadV1 {
  readonly type: "sync.chunk.request";
  readonly sessionId: string;
  readonly syncDomain: string;
  readonly targetFrontierDigest: string;
  readonly cursors: readonly CollectiveSyncCursorV1[];
  readonly maximumRecords: number;
  readonly maximumBytes: number;
  readonly requestedAtLogicalMs: number;
}

export interface CollectiveSyncChunkPayloadV1 extends CollectiveSyncMembershipBoundPayloadV1 {
  readonly type: "sync.chunk";
  readonly requestMessageId: string;
  readonly sessionId: string;
  readonly syncDomain: string;
  readonly sourceFrontier: CollectiveSyncFrontierV1;
  readonly records: readonly CollectiveSyncRecordV1[];
  readonly nextCursors: readonly CollectiveSyncCursorV1[];
  readonly hasMore: boolean;
  readonly chunkDigest: string;
  readonly respondedAtLogicalMs: number;
}

export interface CollectiveSyncReceiptPayloadV1 extends CollectiveSyncMembershipBoundPayloadV1 {
  readonly type: "sync.receipt";
  readonly sessionId: string;
  readonly syncDomain: string;
  readonly sourceFrontierDigest: string;
  readonly chunkDigest: string;
  readonly importedRecordDigests: readonly string[];
  readonly localFrontierDigest: string;
  readonly receivedAtLogicalMs: number;
}

export interface CollectiveSyncReceiptAckPayloadV1 extends CollectiveSyncMembershipBoundPayloadV1 {
  readonly type: "sync.receipt.ack";
  readonly requestMessageId: string;
  readonly sessionId: string;
  readonly chunkDigest: string;
  readonly acceptedAtLogicalMs: number;
}

export interface CollectiveSyncAttestationRequestPayloadV1 extends CollectiveSyncMembershipBoundPayloadV1 {
  readonly type: "sync.attestation.request";
  readonly sessionId: string;
  readonly syncDomain: string;
  readonly targetPeerId: string;
  readonly targetInstanceId: string;
  readonly frontier: CollectiveSyncFrontierV1;
  readonly requestedAtLogicalMs: number;
}

export interface CollectiveSyncAttestationPayloadV1 extends CollectiveSyncMembershipBoundPayloadV1 {
  readonly type: "sync.attestation";
  readonly requestMessageId: string;
  readonly sessionId: string;
  readonly syncDomain: string;
  readonly targetPeerId: string;
  readonly targetInstanceId: string;
  readonly attesterPeerId: string;
  readonly frontierDigest: string;
  readonly attestedAtLogicalMs: number;
}

export type CollectiveSyncRequestPayloadV1 =
  | CollectiveSyncFrontierRequestPayloadV1
  | CollectiveSyncChunkRequestPayloadV1
  | CollectiveSyncReceiptPayloadV1
  | CollectiveSyncAttestationRequestPayloadV1;

export type CollectiveSyncResponsePayloadV1 =
  | CollectiveSyncFrontierResponsePayloadV1
  | CollectiveSyncChunkPayloadV1
  | CollectiveSyncReceiptAckPayloadV1
  | CollectiveSyncAttestationPayloadV1;

export type CollectiveSyncPayloadV1 =
  CollectiveSyncRequestPayloadV1 | CollectiveSyncResponsePayloadV1;

export interface CollectiveSyncProofV1 {
  readonly algorithm: MeshSignatureAlgorithm;
  readonly keyId: string;
  readonly value: string;
}

export interface UnsignedCollectiveSyncEnvelopeV1<
  TPayload extends CollectiveSyncPayloadV1 = CollectiveSyncPayloadV1,
> {
  readonly protocol: typeof COLLECTIVE_SYNC_PROTOCOL_V1;
  readonly schemaVersion: typeof COLLECTIVE_SYNC_SCHEMA_VERSION_V1;
  readonly messageId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly senderPeerId: string;
  readonly senderInstanceId: string;
  readonly audiencePeerId: string;
  readonly audienceInstanceId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly payload: TPayload;
  readonly proof: Omit<CollectiveSyncProofV1, "value">;
}

export interface SignedCollectiveSyncEnvelopeV1<
  TPayload extends CollectiveSyncPayloadV1 = CollectiveSyncPayloadV1,
> extends Omit<UnsignedCollectiveSyncEnvelopeV1<TPayload>, "proof"> {
  readonly proof: CollectiveSyncProofV1;
}

export interface CollectiveCatchUpCertificateV1 {
  readonly schemaVersion: 1;
  readonly kind: "causal_catch_up";
  readonly certificateId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly syncDomain: string;
  readonly targetPeerId: string;
  readonly targetInstanceId: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly frontier: CollectiveSyncFrontierV1;
  readonly threshold: number;
  readonly attestations: readonly SignedCollectiveSyncEnvelopeV1<CollectiveSyncAttestationPayloadV1>[];
  readonly certifiedAtLogicalMs: number;
  readonly certificateDigest: string;
}

export type CollectiveSyncSessionStatusV1 =
  "discovering" | "transferring" | "certifying" | "ready" | "failed";

export interface CollectiveSyncSessionV1 {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly syncDomain: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly targetFrontier: CollectiveSyncFrontierV1 | null;
  readonly sourcePeerIds: readonly string[];
  readonly cursors: readonly CollectiveSyncCursorV1[];
  readonly importedRecordDigests: readonly string[];
  readonly status: CollectiveSyncSessionStatusV1;
  readonly certificateId: string | null;
  readonly failureCode: string | null;
  readonly updatedAtLogicalMs: number;
}

export interface CollectiveSyncAppendResultV1 {
  readonly acceptedRecordDigests: readonly string[];
  readonly duplicateRecordDigests: readonly string[];
  readonly frontier: CollectiveSyncFrontierV1;
}

export interface CollectiveSyncChunkReadV1 {
  readonly records: readonly CollectiveSyncRecordV1[];
  readonly nextCursors: readonly CollectiveSyncCursorV1[];
  readonly hasMore: boolean;
}

export interface CollectiveSyncRepositoryV1 {
  frontier(input: {
    readonly syncDomain: string;
    readonly membership: CollectiveQuorumMembershipBindingV1;
  }): Promise<CollectiveSyncFrontierV1>;
  append(input: {
    readonly syncDomain: string;
    readonly membership: CollectiveQuorumMembershipBindingV1;
    readonly records: readonly CollectiveSyncRecordV1[];
  }): Promise<CollectiveSyncAppendResultV1>;
  readAfter(input: {
    readonly syncDomain: string;
    readonly membership: CollectiveQuorumMembershipBindingV1;
    readonly cursors: readonly CollectiveSyncCursorV1[];
    readonly maximumRecords: number;
    readonly maximumBytes: number;
  }): Promise<CollectiveSyncChunkReadV1>;
  saveSession(session: CollectiveSyncSessionV1): Promise<void>;
  loadSession(sessionId: string): Promise<CollectiveSyncSessionV1 | undefined>;
  saveReceipt(
    receipt: SignedCollectiveSyncEnvelopeV1<CollectiveSyncReceiptPayloadV1>,
  ): Promise<void>;
  saveCertificate(certificate: CollectiveCatchUpCertificateV1): Promise<void>;
  getCertificate(
    certificateId: string,
  ): Promise<CollectiveCatchUpCertificateV1 | undefined>;
  latestCertificate(
    syncDomain: string,
  ): Promise<CollectiveCatchUpCertificateV1 | undefined>;
}

export interface CollectiveSyncDomainAdapterV1 {
  /** Reapply normal authority and semantic validation to every imported record. */
  validate(record: CollectiveSyncRecordV1): Promise<boolean>;
  /**
   * Replay a committed contiguous batch through the domain's existing reducer.
   * A crash may repeat a committed batch, so normal reducer idempotence must be
   * preserved rather than replaced with a synchronization-only mutation path.
   */
  replay(records: readonly CollectiveSyncRecordV1[]): Promise<void>;
}

export interface CollectiveSyncClockReadingV1 {
  readonly wallTime: string;
  readonly logicalTimeMs: number;
}

export interface CollectiveSyncClockV1 {
  now(): CollectiveSyncClockReadingV1;
}

export interface CollectiveSyncSigningV1 {
  readonly privateKey: CryptoKey;
  readonly keyId: string;
  readonly algorithm: MeshSignatureAlgorithm;
}

export interface CollectiveSyncTransportV1 {
  exchange<TRequest extends CollectiveSyncRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveSyncEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveSyncEnvelopeV1<CollectiveSyncResponsePayloadV1> | null>;
}

export interface CollectiveSyncMembershipV1
  extends CollectiveQuorumMembershipBindingPortV1, MeshKeyResolver {}

export interface CollectiveSyncReadinessDecisionV1 {
  readonly ready: boolean;
  readonly reasonCode: string;
  readonly certificateId: string | null;
  readonly frontierDigest: string | null;
}
