import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

export const PARTITION_OPERATION_SCHEMA_VERSION_V1 = 1 as const;
export const PARTITION_OPERATION_STATE_FORMAT_V1 =
  "application/vnd.agentplat.partition-operation-state.v1+json" as const;

export type PartitionOperationStateV1 =
  | "connected"
  | "degraded"
  | "partitioned"
  | "reconciling"
  | "converged"
  | "safe_stopped";
export type PartitionOperationModeV1 =
  | "strict_consistency"
  | "bounded_degraded"
  | "availability_preferred"
  | "reconciliation_required";
export type PartitionEffectClassV1 = "reversible" | "bounded" | "irreversible";

export interface PartitionOperationPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly mode: PartitionOperationModeV1;
  readonly maximumRiskBps: number;
  readonly maximumOfflineDurationMs: number;
  readonly maximumOfflineEffects: number;
  readonly allowedEffectClasses: readonly PartitionEffectClassV1[];
  readonly requireReconciliationBeforeIrreversible: boolean;
}
export interface PartitionOperationObservationV1 {
  readonly logicalTimeMs: number;
  readonly connectedPeerCount: number;
  readonly expectedPeerCount: number;
  readonly quorumAvailable: boolean;
  readonly divergentBranchDigests: readonly PlanningDigestV1[];
  readonly pendingEffectCount: number;
  readonly offlineDurationMs: number;
  readonly evidenceDigest: PlanningDigestV1;
}
export interface PartitionOperationRequestV1 {
  readonly operationId: AgentPlatID;
  readonly currentState: PartitionOperationStateV1;
  readonly observation: PartitionOperationObservationV1;
  readonly proposedEffectClass?: PartitionEffectClassV1;
  readonly riskBps?: number;
}
export interface PartitionOperationDecisionV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly previousState: PartitionOperationStateV1;
  readonly nextState: PartitionOperationStateV1;
  readonly mode: PartitionOperationModeV1;
  readonly allowEffect: boolean;
  readonly reasonCodes: readonly string[];
  readonly evidenceDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
}
