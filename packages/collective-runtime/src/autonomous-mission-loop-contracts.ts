import type { JsonObject } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { MeshExecutionHeadProjection } from "@agentplat/mesh/coordination";
import type {
  PortableAgentObservationV1,
  PortableAgentStepRequestV1,
} from "@agentplat/runtime/adapter";

import type {
  CollectivePeerNodeExecuteOutcomeV1,
  CollectivePeerNodePlanOutcomeV1,
  CollectivePeerNodeRunOutcomeV1,
  CollectivePeerNodeRuntimePortV1,
  CollectivePeerNodeSnapshotV1,
} from "./node-contracts.js";

export const AUTONOMOUS_MISSION_LOOP_SCHEMA_VERSION_V1 = 1 as const;
export const AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1 =
  "application/vnd.agentplat.autonomous-mission-loop-state.v1+json" as const;

export type AutonomousMissionLoopActionV1 =
  | "transport"
  | "plan"
  | "execute"
  | "wait";

export type AutonomousMissionLoopOperationStatusV1 =
  | "prepared"
  | "applied"
  | "deferred"
  | "failed";

export interface AutonomousMissionLoopScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly missionIntentId: string;
  readonly scopeDigest: PlanningDigestV1;
}

/** Immutable local bounds. Remote peers and model output cannot widen them. */
export interface AutonomousMissionLoopPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly planningAgentIds: readonly string[];
  readonly planWhenIdle: boolean;
  readonly planningCooldownMs: number;
  readonly executionRetryDelayMs: number;
  readonly idleDelayMs: number;
  readonly maximumCyclesPerRun: number;
  readonly maximumCommitAttempts: number;
  readonly maximumRetainedOperations: number;
  readonly requestedOutputModalities: PortableAgentStepRequestV1["requestedOutputModalities"];
}

/**
 * Volatile execution material. Exact retries for one operationId must return
 * the same materialDigest, but raw values are never retained by this runtime.
 */
export interface AutonomousMissionExecutionMaterialV1 {
  readonly materialDigest: PlanningDigestV1;
  readonly observations: readonly PortableAgentObservationV1[];
  readonly input: JsonObject | null;
  readonly requestedOutputModalities?: PortableAgentStepRequestV1["requestedOutputModalities"];
}

export interface AutonomousMissionExecutionMaterialPortV1 {
  resolve(input: {
    readonly operationId: string;
    readonly scope: AutonomousMissionLoopScopeV1;
    readonly snapshot: CollectivePeerNodeSnapshotV1;
    readonly assignment: MeshExecutionHeadProjection;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<AutonomousMissionExecutionMaterialV1 | null>;
}

export interface AutonomousMissionLoopClockV1 {
  now(): {
    readonly logicalTimeMs: number;
  };
}

export interface AutonomousMissionLoopOperationV1 {
  readonly operationId: string;
  readonly sequence: number;
  readonly action: AutonomousMissionLoopActionV1;
  readonly agentId: string | null;
  readonly workItemId: string | null;
  readonly assignmentAuthorityId: string | null;
  readonly assignmentEpoch: number | null;
  readonly stepId: string | null;
  readonly materialDigest: PlanningDigestV1 | null;
  readonly preparedAtLogicalMs: number;
  readonly completedAtLogicalMs: number | null;
  readonly status: AutonomousMissionLoopOperationStatusV1;
  readonly reasonCode: string;
  readonly resultDigest: PlanningDigestV1 | null;
  readonly operationDigest: PlanningDigestV1;
}

export interface AutonomousMissionLoopStateV1 {
  readonly format: typeof AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly scope: AutonomousMissionLoopScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly cycleSequence: number;
  readonly operationSequence: number;
  readonly planningCursor: number;
  readonly nextPlanningAtLogicalMs: number;
  readonly nextExecutionAtLogicalMs: number;
  readonly pendingOperation: AutonomousMissionLoopOperationV1 | null;
  readonly recentOperations: readonly AutonomousMissionLoopOperationV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface AutonomousMissionLoopAnchorV1 {
  readonly stateKey: string;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly stateDigest: PlanningDigestV1;
}

/**
 * One consistent read and atomic state+anchor CAS. The production anchor must
 * live on an independent monotonic protection boundary: restoring the state
 * snapshot must not restore an older anchor. Implementations must never derive
 * or repair the anchor from the replaceable snapshot.
 */
export interface AutonomousMissionLoopStoreV1 {
  loadCurrent(input: {
    readonly stateKey: string;
    readonly anchorKey: string;
  }): Promise<{
    readonly state: AutonomousMissionLoopStateV1 | null;
    readonly anchor: AutonomousMissionLoopAnchorV1 | null;
  }>;
  save(input: {
    readonly state: AutonomousMissionLoopStateV1;
    readonly anchorKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export interface AutonomousMissionLoopRuntimeOptionsV1 {
  readonly stateKey: string;
  readonly anchorKey: string;
  readonly scope: AutonomousMissionLoopScopeV1;
  readonly policy: AutonomousMissionLoopPolicyV1;
  readonly node: Pick<
    CollectivePeerNodeRuntimePortV1,
    "restore" | "runOnce" | "plan" | "execute"
  >;
  readonly executionMaterial: AutonomousMissionExecutionMaterialPortV1;
  readonly clock: AutonomousMissionLoopClockV1;
  readonly store: AutonomousMissionLoopStoreV1;
}

export interface AutonomousMissionLoopCycleResultV1 {
  readonly action: AutonomousMissionLoopActionV1;
  readonly status: "applied" | "deferred" | "failed";
  readonly reasonCode: string;
  readonly operation: AutonomousMissionLoopOperationV1 | null;
  readonly nodeRevision: number;
  readonly state: AutonomousMissionLoopStateV1;
  readonly transport: CollectivePeerNodeRunOutcomeV1 | null;
  readonly planning: CollectivePeerNodePlanOutcomeV1 | null;
  readonly execution: CollectivePeerNodeExecuteOutcomeV1 | null;
}

export interface AutonomousMissionLoopPortV1 {
  loadState(): Promise<AutonomousMissionLoopStateV1>;
  runCycle(input?: {
    readonly signal?: AbortSignal;
  }): Promise<AutonomousMissionLoopCycleResultV1>;
  run(input?: {
    readonly maximumCycles?: number;
    readonly signal?: AbortSignal;
  }): Promise<readonly AutonomousMissionLoopCycleResultV1[]>;
  start(input: { readonly signal: AbortSignal }): Promise<void>;
}
