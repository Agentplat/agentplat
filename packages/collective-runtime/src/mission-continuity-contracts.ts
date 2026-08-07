import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  GovernedMissionStateV1,
  GovernedMissionStoreV1,
} from "./mission-lifecycle-contracts.js";

export const MISSION_CONTINUITY_SCHEMA_VERSION_V1 = 1 as const;
export const MISSION_CONTINUITY_STATE_FORMAT_V1 =
  "application/vnd.agentplat.mission-continuity-state.v1+json" as const;

export interface MissionContinuityHolderV1 {
  readonly holderId: AgentPlatID;
  readonly instanceId: AgentPlatID;
}

/**
 * External, already-decided authority. Continuity never elects a holder or
 * widens the mission authority scope.
 */
export interface MissionContinuityAuthorityV1 {
  readonly schemaVersion: 1;
  readonly authorityId: AgentPlatID;
  readonly authorityEpoch: number;
  readonly fencingToken: string;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly generation: number;
  readonly holder: MissionContinuityHolderV1;
  readonly resumeCheckpointDigest: PlanningDigestV1 | null;
  readonly validUntilLogicalMs: number;
  readonly authorityDigest: PlanningDigestV1;
}

export type MissionContinuityAuthorityDecisionV1 =
  | {
      readonly current: true;
      readonly reasonCode: "current";
      readonly authority: MissionContinuityAuthorityV1;
    }
  | {
      readonly current: false;
      readonly reasonCode: string;
      readonly authority: MissionContinuityAuthorityV1 | null;
    };

export interface MissionContinuityAuthorityPortV1 {
  current(input: {
    readonly scopeDigest: PlanningDigestV1;
    readonly policyDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<MissionContinuityAuthorityDecisionV1>;
}

/** Certificate produced only after the candidate checkpoint is durable. */
export interface MissionContinuityAvailabilityCertificateV1 {
  readonly schemaVersion: 1;
  readonly checkpointDigest: PlanningDigestV1;
  readonly authorityDigest: PlanningDigestV1;
  readonly availableReplicaIds: readonly AgentPlatID[];
  readonly threshold: number;
  readonly certifiedAtLogicalMs: number;
  readonly certificateDigest: PlanningDigestV1;
}

export interface MissionContinuityAvailabilityPortV1 {
  certify(input: {
    readonly operationId: AgentPlatID;
    readonly checkpointDigest: PlanningDigestV1;
    readonly snapshotDigest: PlanningDigestV1;
    readonly authority: MissionContinuityAuthorityV1;
    readonly logicalTimeMs: number;
  }): Promise<MissionContinuityAvailabilityCertificateV1>;
  verify(input: {
    readonly checkpointDigest: PlanningDigestV1;
    readonly snapshotDigest: PlanningDigestV1;
    readonly certificate: MissionContinuityAvailabilityCertificateV1;
    readonly authority: MissionContinuityAuthorityV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

/**
 * Content-free snapshot: the embedded lifecycle state contains identifiers,
 * counters and digests, never mission text, model inputs, or raw results.
 */
export interface MissionContinuitySnapshotV1 {
  readonly schemaVersion: 1;
  readonly snapshotId: AgentPlatID;
  readonly checkpointId: AgentPlatID;
  readonly missionState: GovernedMissionStateV1;
  readonly missionStateDigest: PlanningDigestV1;
  readonly predecessorCheckpointDigest: PlanningDigestV1 | null;
  readonly policyDigest: PlanningDigestV1;
  readonly authority: MissionContinuityAuthorityV1;
  readonly createdAtLogicalMs: number;
  readonly checkpointDigest: PlanningDigestV1;
  readonly snapshotDigest: PlanningDigestV1;
}

export interface MissionContinuityCheckpointV1 {
  readonly schemaVersion: 1;
  readonly checkpointId: AgentPlatID;
  readonly snapshotDigest: PlanningDigestV1;
  readonly missionStateDigest: PlanningDigestV1;
  readonly missionStateRevision: number;
  readonly missionStateKey: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly authority: MissionContinuityAuthorityV1;
  readonly predecessorCheckpointDigest: PlanningDigestV1 | null;
  readonly createdAtLogicalMs: number;
  readonly availability: MissionContinuityAvailabilityCertificateV1;
  readonly checkpointDigest: PlanningDigestV1;
}

export interface MissionContinuityRepositoryV1 {
  getSnapshot(
    snapshotDigest: PlanningDigestV1,
  ): Promise<MissionContinuitySnapshotV1 | null>;
  getSnapshotById(
    snapshotId: AgentPlatID,
  ): Promise<MissionContinuitySnapshotV1 | null>;
  putSnapshot(snapshot: MissionContinuitySnapshotV1): Promise<void>;
  getCertificate(
    certificateDigest: PlanningDigestV1,
  ): Promise<MissionContinuityAvailabilityCertificateV1 | null>;
  getCertificateForCheckpoint(
    checkpointDigest: PlanningDigestV1,
  ): Promise<MissionContinuityAvailabilityCertificateV1 | null>;
  putCertificate(
    certificate: MissionContinuityAvailabilityCertificateV1,
  ): Promise<void>;
  getCheckpoint(
    checkpointDigest: PlanningDigestV1,
  ): Promise<MissionContinuityCheckpointV1 | null>;
  getCheckpointById(
    checkpointId: AgentPlatID,
  ): Promise<MissionContinuityCheckpointV1 | null>;
  putCheckpoint(checkpoint: MissionContinuityCheckpointV1): Promise<void>;
}

export type MissionContinuityActionV1 =
  "snapshot" | "replicate" | "checkpoint" | "takeover";

export interface MissionContinuityOperationV1 {
  readonly operationId: AgentPlatID;
  readonly action: MissionContinuityActionV1;
  readonly inputDigest: PlanningDigestV1;
  readonly preparedAtLogicalMs: number;
  readonly status: "prepared" | "applied";
  readonly artifactDigest: PlanningDigestV1 | null;
}

export interface MissionContinuityStateV1 {
  readonly format: typeof MISSION_CONTINUITY_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly missionStateKey: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly authority: MissionContinuityAuthorityV1 | null;
  readonly checkpointHeadDigest: PlanningDigestV1 | null;
  readonly restoredMissionStateDigest: PlanningDigestV1 | null;
  readonly pendingOperation: MissionContinuityOperationV1 | null;
  readonly outbox: readonly MissionContinuityOperationV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface MissionContinuityStoreV1 {
  load(stateKey: AgentPlatID): Promise<MissionContinuityStateV1 | null>;
  save(input: {
    readonly state: MissionContinuityStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

/**
 * Rollback-resistant head kept outside the replaceable continuity snapshot.
 * A durable store adapter must advance this anchor atomically with save().
 */
export interface MissionContinuityMonotonicAnchorV1 {
  readAnchor(stateKey: AgentPlatID): Promise<{
    readonly revision: number;
    readonly logicalTimeHighWaterMs: number;
    readonly stateDigest: PlanningDigestV1;
  } | null>;
}

/** Destination-side atomic restore boundary. */
export interface MissionContinuityRestorePortV1 {
  load(stateKey: AgentPlatID): ReturnType<GovernedMissionStoreV1["load"]>;
  restore(input: {
    readonly state: GovernedMissionStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
    readonly checkpointDigest: PlanningDigestV1;
    readonly authority: MissionContinuityAuthorityV1;
  }): Promise<boolean>;
}

export interface MissionContinuityRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly missionStateKey: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly source: Pick<GovernedMissionStoreV1, "load">;
  readonly restore: MissionContinuityRestorePortV1;
  readonly authority: MissionContinuityAuthorityPortV1;
  readonly availability: MissionContinuityAvailabilityPortV1;
  readonly repository: MissionContinuityRepositoryV1;
  readonly store: MissionContinuityStoreV1;
  readonly monotonicAnchor?: MissionContinuityMonotonicAnchorV1;
  readonly maximumCommitAttempts?: number;
  readonly maximumOperations?: number;
}

export interface MissionContinuitySnapshotRequestV1 {
  readonly operationId: AgentPlatID;
  readonly snapshotId: AgentPlatID;
  readonly checkpointId: AgentPlatID;
  readonly expectedMissionStateDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}
export interface MissionContinuityReplicateRequestV1 {
  readonly operationId: AgentPlatID;
  readonly snapshotDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}
export interface MissionContinuityCheckpointRequestV1 {
  readonly operationId: AgentPlatID;
  readonly snapshotDigest: PlanningDigestV1;
  readonly certificateDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}
export interface MissionContinuityTakeoverRequestV1 {
  readonly operationId: AgentPlatID;
  readonly checkpointDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}
export interface MissionContinuityTakeoverResultV1 {
  readonly continuityState: MissionContinuityStateV1;
  readonly missionState: GovernedMissionStateV1;
  readonly pendingOperationPreserved: boolean;
  readonly appliedOperationCount: number;
}

export interface MissionContinuityPortV1 {
  loadState(): Promise<MissionContinuityStateV1>;
  snapshot(
    request: MissionContinuitySnapshotRequestV1,
  ): Promise<MissionContinuitySnapshotV1>;
  replicate(
    request: MissionContinuityReplicateRequestV1,
  ): Promise<MissionContinuityAvailabilityCertificateV1>;
  checkpoint(
    request: MissionContinuityCheckpointRequestV1,
  ): Promise<MissionContinuityCheckpointV1>;
  takeover(
    request: MissionContinuityTakeoverRequestV1,
  ): Promise<MissionContinuityTakeoverResultV1>;
}
