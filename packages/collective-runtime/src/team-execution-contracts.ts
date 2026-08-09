import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type {
  JointWorkContractV1,
  TeamPositionBidV1,
  TeamProposalV1,
} from "./team-formation-contracts.js";

export const TEAM_EXECUTION_SCHEMA_VERSION_V1 = 1 as const;
export const TEAM_EXECUTION_STATE_FORMAT_V1 =
  "application/vnd.agentplat.team-execution-state.v1+json" as const;
export const TEAM_EXECUTION_HANDOFF_FORMAT_V1 =
  "application/vnd.agentplat.team-execution-handoff.v1+json" as const;

export type TeamExecutionStatusV1 =
  "active" | "completed" | "recovery_required" | "cancelled";

export type TeamExecutionPositionStatusV1 =
  | "blocked"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "unsafe"
  | "cancelled";

export type TeamExecutionStepStatusV1 =
  "progress" | "completed" | "failed" | "unsafe" | "paused";

export type TeamExecutionControlDispositionV1 =
  "allow" | "deny" | "abstain" | "escalate";

export interface TeamExecutionLimitsV1 {
  readonly maximumPositions: number;
  readonly maximumStepsPerPosition: number;
  readonly maximumArtifactsPerStep: number;
  readonly maximumArtifactsPerPosition: number;
  readonly maximumArtifactDependencies: number;
  readonly maximumArtifactBytes: number;
  readonly maximumPeerMessagesPerStep: number;
  readonly maximumTotalPeerMessages: number;
  readonly maximumRecoveryCount: number;
  readonly maximumHistoryEntries: number;
  readonly maximumExecutionDurationMs: number;
  readonly maximumStepTtlMs: number;
  readonly maximumCommitAttempts: number;
}

/** Local immutable bounds. Remote members cannot widen these limits. */
export interface TeamExecutionPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly requireReferencedCompletionArtifact: boolean;
  readonly requireAllowedControlForProgress: boolean;
  readonly limits: TeamExecutionLimitsV1;
}

export interface TeamExecutionPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: TeamExecutionPolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

export interface TeamExecutionScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly rootWorkItemId: AgentPlatID;
  readonly rootWorkItemRevision: number;
  readonly teamId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
}

/** Reference-only execution artifact. Raw model output is never retained here. */
export interface TeamExecutionArtifactV1 {
  readonly schemaVersion: 1;
  readonly artifactId: AgentPlatID;
  readonly executionId: AgentPlatID;
  readonly executionEpoch: number;
  readonly teamId: AgentPlatID;
  readonly teamEpoch: number;
  readonly producerPositionId: AgentPlatID;
  readonly producerMemberId: AgentPlatID;
  readonly producerBindingDigest: PlanningDigestV1;
  readonly sourceDispatchDigest: PlanningDigestV1;
  readonly artifactKind: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly contentReference: string;
  readonly contentDigest: PlanningDigestV1;
  readonly dependencyArtifactDigests: readonly PlanningDigestV1[];
  readonly producedAtLogicalMs: number;
  readonly artifactDigest: PlanningDigestV1;
}

export interface TeamExecutionArtifactDraftV1 {
  readonly schemaVersion: 1;
  readonly artifactId: AgentPlatID;
  readonly artifactKind: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly contentReference: string;
  readonly contentDigest: PlanningDigestV1;
}

export interface TeamExecutionStepCommandV1 {
  readonly schemaVersion: 1;
  readonly commandId: AgentPlatID;
  readonly executionId: AgentPlatID;
  readonly executionEpoch: number;
  readonly positionId: AgentPlatID;
  readonly inputReferenceDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
  readonly validUntilLogicalMs: number;
  readonly commandDigest: PlanningDigestV1;
}

/** Prepared before external execution and reused as the idempotency boundary. */
export interface TeamExecutionStepDispatchV1 {
  readonly schemaVersion: 1;
  readonly dispatchId: AgentPlatID;
  readonly commandDigest: PlanningDigestV1;
  readonly executionId: AgentPlatID;
  readonly executionEpoch: number;
  readonly teamId: AgentPlatID;
  readonly teamEpoch: number;
  readonly jointWorkContractDigest: PlanningDigestV1;
  readonly positionId: AgentPlatID;
  readonly positionDigest: PlanningDigestV1;
  readonly positionStepSequence: number;
  readonly memberId: AgentPlatID;
  readonly memberBindingDigest: PlanningDigestV1;
  readonly workItemId: AgentPlatID;
  readonly workItemRevision: number;
  readonly dependencyArtifactDigests: readonly PlanningDigestV1[];
  readonly inputReferenceDigest: PlanningDigestV1;
  readonly preparedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly dispatchDigest: PlanningDigestV1;
}

export interface TeamExecutionControlEvidenceV1 {
  readonly schemaVersion: 1;
  readonly controlId: AgentPlatID;
  readonly controlVersion: number;
  readonly implementationId: AgentPlatID;
  readonly disposition: TeamExecutionControlDispositionV1;
  readonly reasonCode: string;
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly evaluatedAtLogicalMs: number;
  /** Exclusive validity boundary for this control decision. */
  readonly validUntilLogicalMs: number;
  readonly evidenceDigest: PlanningDigestV1;
}

export interface TeamExecutionStepResultV1 {
  readonly schemaVersion: 1;
  readonly resultId: AgentPlatID;
  readonly dispatchDigest: PlanningDigestV1;
  readonly executorId: AgentPlatID;
  readonly executorVersion: number;
  readonly executorImplementationId: AgentPlatID;
  readonly status: TeamExecutionStepStatusV1;
  readonly artifacts: readonly TeamExecutionArtifactV1[];
  readonly peerMessageDigests: readonly PlanningDigestV1[];
  readonly control: TeamExecutionControlEvidenceV1;
  readonly sourceStepRecordDigest: PlanningDigestV1;
  readonly reasonCode: string;
  readonly completedAtLogicalMs: number;
  readonly resultDigest: PlanningDigestV1;
}

export interface TeamExecutionStepRecordV1 {
  readonly schemaVersion: 1;
  readonly dispatch: TeamExecutionStepDispatchV1;
  readonly result: TeamExecutionStepResultV1 | null;
  readonly recordDigest: PlanningDigestV1;
}

export interface TeamExecutionPositionStateV1 {
  readonly schemaVersion: 1;
  readonly positionId: AgentPlatID;
  readonly positionDigest: PlanningDigestV1;
  readonly memberId: AgentPlatID;
  readonly memberBindingDigest: PlanningDigestV1;
  readonly workItemId: AgentPlatID;
  readonly workItemRevision: number;
  readonly dependsOnPositionIds: readonly AgentPlatID[];
  readonly status: TeamExecutionPositionStatusV1;
  readonly stepSequence: number;
  readonly latestDispatchDigest: PlanningDigestV1 | null;
  readonly latestResultDigest: PlanningDigestV1 | null;
  readonly failureResultDigest: PlanningDigestV1 | null;
  readonly artifactDigests: readonly PlanningDigestV1[];
  readonly startedAtLogicalMs: number | null;
  readonly completedAtLogicalMs: number | null;
  readonly positionStateDigest: PlanningDigestV1;
}

export interface TeamExecutionMetricsV1 {
  readonly schemaVersion: 1;
  readonly totalStepAttempts: number;
  readonly totalPeerMessages: number;
  readonly completedPositions: number;
  readonly recoveryCount: number;
  readonly lastRecoveryLatencyLogicalMs: number | null;
  readonly maximumRecoveryLatencyLogicalMs: number | null;
  readonly metricsDigest: PlanningDigestV1;
}

export interface TeamExecutionRecoverySignalV1 {
  readonly schemaVersion: 1;
  readonly signalId: AgentPlatID;
  readonly executionId: AgentPlatID;
  readonly executionEpoch: number;
  readonly teamId: AgentPlatID;
  readonly teamEpoch: number;
  readonly jointWorkContractDigest: PlanningDigestV1;
  readonly failedPositionId: AgentPlatID;
  readonly failedMemberId: AgentPlatID;
  readonly failedMemberBindingDigest: PlanningDigestV1;
  readonly failureStatus: "failed" | "unsafe";
  readonly failureResultDigest: PlanningDigestV1;
  readonly reasonCode: string;
  readonly observedAtLogicalMs: number;
  readonly signalDigest: PlanningDigestV1;
}

export interface TeamExecutionEpochHistoryEntryV1 {
  readonly schemaVersion: 1;
  readonly executionEpoch: number;
  readonly teamEpoch: number;
  readonly jointWorkContractDigest: PlanningDigestV1;
  readonly terminalStateDigest: PlanningDigestV1;
  readonly recoverySignalDigest: PlanningDigestV1;
  readonly completedPositionIds: readonly AgentPlatID[];
  readonly totalStepAttempts: number;
  readonly totalPeerMessages: number;
  readonly closedAtLogicalMs: number;
  readonly historyDigest: PlanningDigestV1;
}

export interface TeamExecutionRecordV1 {
  readonly schemaVersion: 1;
  readonly executionId: AgentPlatID;
  readonly executionEpoch: number;
  readonly scope: TeamExecutionScopeV1;
  readonly status: TeamExecutionStatusV1;
  readonly terminalReasonCode: string | null;
  readonly proposal: TeamProposalV1;
  readonly jointWorkContract: JointWorkContractV1;
  readonly positions: readonly TeamExecutionPositionStateV1[];
  readonly artifacts: readonly TeamExecutionArtifactV1[];
  readonly steps: readonly TeamExecutionStepRecordV1[];
  readonly recoverySignal: TeamExecutionRecoverySignalV1 | null;
  readonly metrics: TeamExecutionMetricsV1;
  readonly history: readonly TeamExecutionEpochHistoryEntryV1[];
  readonly startedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly updatedAtLogicalMs: number;
  readonly recordDigest: PlanningDigestV1;
}

export interface TeamExecutionStateV1 {
  readonly format: typeof TEAM_EXECUTION_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly runtimeId: AgentPlatID;
  readonly runtimeVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly execution: TeamExecutionRecordV1 | null;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface TeamExecutionStartRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly proposal: TeamProposalV1;
  readonly jointWorkContract: JointWorkContractV1;
  readonly logicalTimeMs: number;
  readonly validUntilLogicalMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface TeamExecutionRebindRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly expectedStateDigest: PlanningDigestV1;
  readonly recoverySignalDigest: PlanningDigestV1;
  readonly proposal: TeamProposalV1;
  readonly jointWorkContract: JointWorkContractV1;
  readonly logicalTimeMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface TeamExecutionArtifactPortV1 {
  publish(artifact: TeamExecutionArtifactV1): Promise<void>;
  ensureAvailable(artifact: TeamExecutionArtifactV1): Promise<boolean>;
}

export interface TeamMemberExecutionPortV1 {
  readonly executorId: AgentPlatID;
  readonly executorVersion: number;
  readonly implementationId: AgentPlatID;
  execute(input: {
    readonly dispatch: TeamExecutionStepDispatchV1;
    readonly dependencyArtifacts: readonly TeamExecutionArtifactV1[];
    readonly signal?: AbortSignal;
  }): Promise<TeamExecutionStepResultV1>;
}

export interface TeamExecutionStoreV1 {
  load(stateKey: AgentPlatID): Promise<TeamExecutionStateV1 | null>;
  save(input: {
    readonly state: TeamExecutionStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

export interface TeamExecutionRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly runtimeId: AgentPlatID;
  readonly runtimeVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policy: TeamExecutionPolicyRecordV1;
  readonly executor: TeamMemberExecutionPortV1;
  readonly artifacts: TeamExecutionArtifactPortV1;
  readonly store: TeamExecutionStoreV1;
}

export interface TeamExecutionPortV1 {
  readonly runtimeId: AgentPlatID;
  readonly runtimeVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  start(request: TeamExecutionStartRequestV1): Promise<TeamExecutionRecordV1>;
  prepareStep(
    command: TeamExecutionStepCommandV1,
  ): Promise<TeamExecutionStepDispatchV1>;
  settleStep(result: TeamExecutionStepResultV1): Promise<TeamExecutionRecordV1>;
  runStep(input: {
    readonly command: TeamExecutionStepCommandV1;
    readonly signal?: AbortSignal;
  }): Promise<TeamExecutionRecordV1>;
  expireStep(input: {
    readonly dispatchDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionRecordV1>;
  rebind(request: TeamExecutionRebindRequestV1): Promise<TeamExecutionRecordV1>;
  cancel(input: {
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionRecordV1>;
  loadState(): Promise<TeamExecutionStateV1>;
  exportHandoff(input: {
    readonly targetStateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: TeamExecutionHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionStateV1>;
}

export interface TeamExecutionHandoffEnvelopeV1 {
  readonly format: typeof TEAM_EXECUTION_HANDOFF_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly contentClass: "team_execution_state";
  readonly runtimeId: AgentPlatID;
  readonly runtimeVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly sourceStateKey: AgentPlatID;
  readonly sourceStateDigest: PlanningDigestV1;
  readonly targetStateKey: AgentPlatID;
  readonly exportedAtLogicalMs: number;
  readonly sourceState: TeamExecutionStateV1;
  readonly handoffDigest: PlanningDigestV1;
}

export interface TeamExecutionReconfigurationInputV1 {
  readonly recoverySignal: TeamExecutionRecoverySignalV1;
  readonly currentJointWorkContractDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly replacementBids: readonly TeamPositionBidV1[];
  readonly logicalTimeMs: number;
  readonly validUntilLogicalMs: number;
}
