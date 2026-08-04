import type {
  PlanningArtifactAvailabilityPortV1,
  PlanningFragmentRepositoryRecordV1,
  PlanningFragmentRepositoryV1,
} from "@agentplat/collective-planning/mesh";
import type {
  CollectiveSyncClientV1,
  CollectiveSyncClockV1,
  CollectiveSyncMembershipV1,
  CollectiveSyncRepositoryV1,
  CollectiveSyncSigningV1,
} from "@agentplat/collective-sync";
import type { MeshSignatureAlgorithm } from "@agentplat/mesh-protocol";

export const PLANNING_ARTIFACT_SYNC_DOMAIN_V1 =
  "planning.artifacts.v1" as const;
export const PLANNING_ARTIFACT_PAYLOAD_TYPE_V1 =
  "planning.artifact.publication" as const;
export const PLANNING_ARTIFACT_MAX_CANONICAL_BYTES_V1 = 262_144 as const;

export interface PlanningArtifactScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly policyDomainId: string;
}

export interface PlanningArtifactProofV1 {
  readonly algorithm: MeshSignatureAlgorithm;
  readonly keyId: string;
  readonly value: string;
}

export interface UnsignedPlanningArtifactPublicationV1 {
  readonly schemaVersion: 1;
  readonly kind: "planning_artifact";
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly contentReference: string;
  readonly artifactDigest: string;
  readonly record: PlanningFragmentRepositoryRecordV1;
  readonly issuedAt: string;
  readonly publishedAtLogicalMs: number;
  readonly proof: Omit<PlanningArtifactProofV1, "value">;
}

export interface SignedPlanningArtifactPublicationV1 extends Omit<
  UnsignedPlanningArtifactPublicationV1,
  "proof"
> {
  readonly proof: PlanningArtifactProofV1;
}

export interface PlanningArtifactSyncPayloadV1 {
  readonly schemaVersion: 1;
  readonly type: typeof PLANNING_ARTIFACT_PAYLOAD_TYPE_V1;
  readonly publication: SignedPlanningArtifactPublicationV1;
}

export interface ReplicatedPlanningFragmentRepositoryOptionsV1 {
  readonly scope: PlanningArtifactScopeV1;
  readonly repository: PlanningFragmentRepositoryV1;
  readonly syncRepository: CollectiveSyncRepositoryV1;
  readonly membership: CollectiveSyncMembershipV1;
  readonly signing: CollectiveSyncSigningV1;
  readonly clock: CollectiveSyncClockV1;
  readonly maximumArtifactBytes?: number;
  readonly crypto?: Crypto;
}

export interface PlanningArtifactSyncAdapterOptionsV1 {
  readonly scope: Omit<PlanningArtifactScopeV1, "peerId" | "instanceId">;
  readonly repository: PlanningFragmentRepositoryV1;
  readonly membership: CollectiveSyncMembershipV1;
  readonly clock: CollectiveSyncClockV1;
  readonly maximumArtifactBytes?: number;
  readonly crypto?: Crypto;
}

export interface CollectiveSyncPlanningArtifactAvailabilityOptionsV1 {
  readonly repository: PlanningFragmentRepositoryV1;
  readonly client: CollectiveSyncClientV1;
}

export type PlanningArtifactAvailabilityV1 = PlanningArtifactAvailabilityPortV1;
