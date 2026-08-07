import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type {
  TeamExecutionHandoffEnvelopeV1,
  TeamExecutionPolicyRecordV1,
  TeamExecutionPortV1,
  TeamExecutionRecordV1,
  TeamExecutionScopeV1,
  TeamExecutionStateV1,
  TeamExecutionStepCommandV1,
  TeamExecutionStepDispatchV1,
  TeamExecutionStepResultV1,
} from "./team-execution-contracts.js";

export const TEAM_EXECUTION_CONTINUITY_SCHEMA_VERSION_V1 = 1 as const;
export const TEAM_EXECUTION_CONTINUITY_STATE_FORMAT_V1 =
  "application/vnd.agentplat.team-execution-continuity-state.v1+json" as const;

/** Structural counterpart of MeshAuthorityIdentityV1; no Mesh runtime import is required. */
export interface TeamExecutionContinuityHolderV1 {
  readonly schemaVersion: 1;
  readonly peerId: AgentPlatID;
  readonly instanceId: AgentPlatID;
  readonly keyId: AgentPlatID;
}

/** The work_owner authority is scoped exactly to one root work item. */
export interface TeamExecutionWorkOwnerAuthorityV1 {
  readonly schemaVersion: 1;
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly rootWorkItemId: AgentPlatID;
  readonly generation: number;
  readonly holder: TeamExecutionContinuityHolderV1;
  readonly headDigest: PlanningDigestV1;
  readonly fencingToken: AgentPlatID;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  /** Set by the certified work_owner transition that selected this holder. */
  readonly resumeCheckpointDigest: PlanningDigestV1 | null;
  readonly validUntilLogicalMs: number;
}

export type TeamExecutionContinuityAuthorityDecisionV1 =
  | {
      readonly current: true;
      readonly reasonCode: "current";
      readonly authority: TeamExecutionWorkOwnerAuthorityV1;
    }
  | {
      readonly current: false;
      readonly reasonCode: string;
      readonly authority: TeamExecutionWorkOwnerAuthorityV1 | null;
    };

/** Adapter boundary for @agentplat/mesh/continuity currentness checks. */
export interface TeamExecutionContinuityAuthorityPortV1 {
  current(input: {
    readonly scope: TeamExecutionScopeV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionContinuityAuthorityDecisionV1>;
}

export interface TeamExecutionContinuityMembershipPortV1 {
  current(input: {
    readonly scope: TeamExecutionScopeV1;
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly current: boolean; readonly reasonCode: string }>;
}

/**
 * A fence-aware execution boundary. Production implementations must apply the
 * supplied holder/generation/head/token/membership authority at every execution
 * CAS and external-effect boundary.
 */
export interface TeamExecutionContinuityFencedExecutionPortV1 {
  readonly runtimeId: AgentPlatID;
  readonly runtimeVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  start(input: {
    readonly request: Parameters<TeamExecutionPortV1["start"]>[0];
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  }): Promise<TeamExecutionRecordV1>;
  prepareStep(input: {
    readonly command: TeamExecutionStepCommandV1;
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  }): Promise<TeamExecutionStepDispatchV1>;
  settleStep(input: {
    readonly result: TeamExecutionStepResultV1;
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  }): Promise<TeamExecutionRecordV1>;
  runStep(input: {
    readonly request: Parameters<TeamExecutionPortV1["runStep"]>[0];
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  }): Promise<TeamExecutionRecordV1>;
  expireStep(input: {
    readonly request: Parameters<TeamExecutionPortV1["expireStep"]>[0];
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  }): Promise<TeamExecutionRecordV1>;
  rebind(input: {
    readonly request: Parameters<TeamExecutionPortV1["rebind"]>[0];
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  }): Promise<TeamExecutionRecordV1>;
  cancel(input: {
    readonly request: Parameters<TeamExecutionPortV1["cancel"]>[0];
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  }): Promise<TeamExecutionRecordV1>;
  loadState(): Promise<TeamExecutionStateV1>;
  exportHandoff(input: {
    readonly targetStateKey: AgentPlatID;
    readonly logicalTimeMs: number;
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  }): Promise<TeamExecutionHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: TeamExecutionHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  }): Promise<TeamExecutionStateV1>;
}

export interface TeamExecutionContinuityAvailabilityCertificateV1 {
  readonly schemaVersion: 1;
  readonly checkpointDigest: PlanningDigestV1;
  readonly availableReplicaIds: readonly AgentPlatID[];
  readonly threshold: number;
  readonly certifiedAtLogicalMs: number;
  readonly certificateDigest: PlanningDigestV1;
}

export interface TeamExecutionContinuityCheckpointV1 {
  readonly schemaVersion: 1;
  readonly checkpointId: AgentPlatID;
  readonly scope: TeamExecutionScopeV1;
  readonly authority: TeamExecutionWorkOwnerAuthorityV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly predecessorCheckpointDigest: PlanningDigestV1 | null;
  readonly executionStateDigest: PlanningDigestV1;
  readonly handoff: TeamExecutionHandoffEnvelopeV1;
  readonly availability: TeamExecutionContinuityAvailabilityCertificateV1;
  readonly createdAtLogicalMs: number;
  readonly checkpointDigest: PlanningDigestV1;
}

export interface TeamExecutionContinuityCheckpointRepositoryV1 {
  get(
    checkpointDigest: PlanningDigestV1,
  ): Promise<TeamExecutionContinuityCheckpointV1 | null>;
  getById(
    checkpointId: AgentPlatID,
  ): Promise<TeamExecutionContinuityCheckpointV1 | null>;
  put(checkpoint: TeamExecutionContinuityCheckpointV1): Promise<void>;
}

export interface TeamExecutionContinuityAvailabilityPortV1 {
  certify(input: {
    readonly scope: TeamExecutionScopeV1;
    readonly checkpointDigest: PlanningDigestV1;
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionContinuityAvailabilityCertificateV1>;
  verify(input: {
    readonly scope: TeamExecutionScopeV1;
    readonly certificate: TeamExecutionContinuityAvailabilityCertificateV1;
    readonly checkpointDigest: PlanningDigestV1;
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface TeamExecutionContinuityStateV1 {
  readonly format: typeof TEAM_EXECUTION_CONTINUITY_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly scope: TeamExecutionScopeV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly authority: TeamExecutionWorkOwnerAuthorityV1 | null;
  readonly checkpointHeadDigest: PlanningDigestV1 | null;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface TeamExecutionContinuityStoreV1 {
  load(stateKey: AgentPlatID): Promise<TeamExecutionContinuityStateV1 | null>;
  /** Production stores must compare holder/generation/head/token/membership in the same CAS. */
  save(input: {
    readonly state: TeamExecutionContinuityStateV1;
    readonly expectedRevision: number | null;
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface TeamExecutionContinuityRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly scope: TeamExecutionScopeV1;
  readonly localHolder: TeamExecutionContinuityHolderV1;
  readonly executionPolicy: TeamExecutionPolicyRecordV1;
  readonly execution: TeamExecutionContinuityFencedExecutionPortV1;
  readonly authority: TeamExecutionContinuityAuthorityPortV1;
  readonly membership: TeamExecutionContinuityMembershipPortV1;
  readonly checkpoints: TeamExecutionContinuityCheckpointRepositoryV1;
  readonly availability: TeamExecutionContinuityAvailabilityPortV1;
  readonly store: TeamExecutionContinuityStoreV1;
  readonly maximumCommitAttempts?: number;
}

export interface TeamExecutionContinuityCheckpointRequestV1 {
  readonly checkpointId: AgentPlatID;
  readonly targetStateKey: AgentPlatID;
  readonly logicalTimeMs: number;
}

export interface TeamExecutionContinuityTakeoverRequestV1 {
  readonly checkpointDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}

export interface TeamExecutionContinuityTakeoverResultV1 {
  readonly state: TeamExecutionContinuityStateV1;
  readonly execution: TeamExecutionStateV1;
  /** These are reconstructed from the imported state; their dispatchId is unchanged. */
  readonly pendingDispatches: readonly TeamExecutionStepDispatchV1[];
}

export interface TeamExecutionContinuityPortV1 {
  loadState(): Promise<TeamExecutionContinuityStateV1>;
  initialize(input: {
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionContinuityStateV1>;
  checkpoint(
    request: TeamExecutionContinuityCheckpointRequestV1,
  ): Promise<TeamExecutionContinuityCheckpointV1>;
  takeover(
    request: TeamExecutionContinuityTakeoverRequestV1,
  ): Promise<TeamExecutionContinuityTakeoverResultV1>;
  start(
    request: Parameters<TeamExecutionPortV1["start"]>[0],
  ): Promise<TeamExecutionRecordV1>;
  prepareStep(
    command: TeamExecutionStepCommandV1,
  ): Promise<TeamExecutionStepDispatchV1>;
  settleStep(result: TeamExecutionStepResultV1): Promise<TeamExecutionRecordV1>;
  runStep(
    input: Parameters<TeamExecutionPortV1["runStep"]>[0],
  ): Promise<TeamExecutionRecordV1>;
  expireStep(
    input: Parameters<TeamExecutionPortV1["expireStep"]>[0],
  ): Promise<TeamExecutionRecordV1>;
  rebind(
    request: Parameters<TeamExecutionPortV1["rebind"]>[0],
  ): Promise<TeamExecutionRecordV1>;
  cancel(
    input: Parameters<TeamExecutionPortV1["cancel"]>[0],
  ): Promise<TeamExecutionRecordV1>;
}
