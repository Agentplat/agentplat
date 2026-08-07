import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

/** Durable, content-free orchestration envelope for a governed mission. */
export const GOVERNED_MISSION_LIFECYCLE_SCHEMA_VERSION_V1 = 1 as const;
export const GOVERNED_MISSION_LIFECYCLE_STATE_FORMAT_V1 =
  "application/vnd.agentplat.governed-mission-lifecycle-state.v1+json" as const;

export const GOVERNED_MISSION_ACTIONS_V1 = Object.freeze([
  "certify_plan",
  "activate_allocation",
  "activate_team",
  "observe_execution",
  "enact_pause_dispatch",
  "enact_restrict_participation",
  "enact_role_transition",
  "enact_work_reassignment",
  "enact_team_adaptation",
  "enact_replanning",
] as const);

export type GovernedMissionActionV1 =
  (typeof GOVERNED_MISSION_ACTIONS_V1)[number];

export const GOVERNED_MISSION_CONTROL_ACTIONS_V1 = Object.freeze([
  "continue",
  "pause_dispatch",
  "restrict_participation",
  "request_role_transition",
  "request_work_reassignment",
  "request_team_adaptation",
  "request_replanning",
] as const);

export type GovernedMissionControlActionV1 =
  (typeof GOVERNED_MISSION_CONTROL_ACTIONS_V1)[number];

export type GovernedMissionPhaseV1 =
  | "planning"
  | "allocation"
  | "formation"
  | "execution"
  | "control"
  | "reconfiguration"
  | "paused"
  | "completed"
  | "failed";

/** Exact identity and fencing coordinates shared by every side-effecting port. */
export interface GovernedMissionScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly missionId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly workItemId: AgentPlatID;
  readonly workItemRevision: number;
  readonly authorityId: AgentPlatID;
  readonly authorityEpoch: number;
  readonly fencingToken: string;
  readonly scopeDigest: PlanningDigestV1;
}

export interface GovernedMissionBudgetV1 {
  readonly maximumActionUnits: number;
  readonly maximumReconfigurations: number;
  readonly maximumCommitAttempts: number;
  readonly maximumTransitionsPerInvocation: number;
}

export interface GovernedMissionPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  /** Immutable first-request binding; subsequent requests may only advance time. */
  readonly requestId: AgentPlatID;
  readonly planInputDigest: PlanningDigestV1;
  readonly budget: GovernedMissionBudgetV1;
}

/** A request is reference-only: no mission text, model input, or raw result may be retained. */
export interface GovernedMissionRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly scope: GovernedMissionScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly planInputDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface GovernedMissionControlProposalV1 {
  readonly proposalId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly authorityEpoch: number;
  readonly action: GovernedMissionControlActionV1;
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly proposalDigest: PlanningDigestV1;
  readonly advisoryOnly: true;
}

/** Authorization is action-, scope-, epoch-, operation-, and intent-bound. */
export interface GovernedMissionAuthorizationV1 {
  readonly authorizationId: AgentPlatID;
  readonly action: GovernedMissionActionV1;
  readonly operationId: AgentPlatID;
  readonly intentDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly authorityEpoch: number;
  readonly fencingToken: string;
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly authorizationDigest: PlanningDigestV1;
}

export interface GovernedMissionOperationV1 {
  readonly operationId: AgentPlatID;
  readonly action: GovernedMissionActionV1;
  readonly intentDigest: PlanningDigestV1;
  /** Non-null only for a control-proposed reconfiguration action. */
  readonly controlProposalDigest: PlanningDigestV1 | null;
  readonly preparedAtLogicalMs: number;
  readonly status: "prepared" | "applied";
  readonly authorizationDigest: PlanningDigestV1 | null;
  readonly resultDigest: PlanningDigestV1 | null;
}

export interface GovernedMissionOutboxRecordV1 {
  readonly operationId: AgentPlatID;
  readonly action: GovernedMissionActionV1;
  readonly intentDigest: PlanningDigestV1;
  readonly controlProposalDigest: PlanningDigestV1 | null;
  readonly status: "prepared" | "applied";
  readonly authorizationDigest: PlanningDigestV1 | null;
  readonly resultDigest: PlanningDigestV1 | null;
}

export interface GovernedMissionStateV1 {
  readonly format: typeof GOVERNED_MISSION_LIFECYCLE_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly scope: GovernedMissionScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly requestId: AgentPlatID;
  readonly planInputDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly phase: GovernedMissionPhaseV1;
  readonly actionUnitsConsumed: number;
  readonly reconfigurationCount: number;
  readonly planDecisionDigest: PlanningDigestV1 | null;
  readonly allocationDigest: PlanningDigestV1 | null;
  readonly teamDigest: PlanningDigestV1 | null;
  readonly executionObservationDigest: PlanningDigestV1 | null;
  readonly controlProposal: GovernedMissionControlProposalV1 | null;
  readonly pendingOperation: GovernedMissionOperationV1 | null;
  readonly outbox: readonly GovernedMissionOutboxRecordV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface GovernedMissionStoreV1 {
  load(stateKey: AgentPlatID): Promise<GovernedMissionStateV1 | null>;
  save(input: {
    readonly state: GovernedMissionStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export interface GovernedMissionAuthorizationPortV1 {
  authorize(input: {
    readonly action: GovernedMissionActionV1;
    readonly operationId: AgentPlatID;
    readonly intentDigest: PlanningDigestV1;
    readonly scope: GovernedMissionScopeV1;
    readonly logicalTimeMs: number;
  }): Promise<GovernedMissionAuthorizationV1 | null>;
  /** Resolves a previously retained, digest-bound authorization without issuing one. */
  verify(input: {
    readonly authorizationDigest: PlanningDigestV1;
    readonly action: GovernedMissionActionV1;
    readonly operationId: AgentPlatID;
    readonly intentDigest: PlanningDigestV1;
    readonly scope: GovernedMissionScopeV1;
  }): Promise<GovernedMissionAuthorizationV1 | null>;
}

export interface GovernedMissionDecisionPortV1 {
  certifyPlan(
    input: GovernedMissionPortInputV1,
  ): Promise<{ readonly decisionDigest: PlanningDigestV1 }>;
}
export interface GovernedMissionAllocationPortV1 {
  activateAllocation(
    input: GovernedMissionPortInputV1,
  ): Promise<{ readonly allocationDigest: PlanningDigestV1 }>;
}
export interface GovernedMissionFormationPortV1 {
  activateTeam(
    input: GovernedMissionPortInputV1,
  ): Promise<{ readonly teamDigest: PlanningDigestV1 }>;
}
export interface GovernedMissionExecutionPortV1 {
  observeExecution(
    input: GovernedMissionPortInputV1,
  ): Promise<{ readonly observationDigest: PlanningDigestV1 }>;
}
export interface GovernedMissionControlPortV1 {
  evaluate(input: {
    readonly scope: GovernedMissionScopeV1;
    readonly logicalTimeMs: number;
    readonly executionObservationDigest: PlanningDigestV1;
  }): Promise<GovernedMissionControlProposalV1>;
}
export interface GovernedMissionReconfigurationPortV1 {
  enact(
    input: GovernedMissionPortInputV1 & {
      readonly controlProposal: GovernedMissionControlProposalV1;
    },
  ): Promise<{ readonly resultDigest: PlanningDigestV1 }>;
}

export interface GovernedMissionPortInputV1 {
  readonly request: GovernedMissionRequestV1;
  readonly scope: GovernedMissionScopeV1;
  readonly operation: GovernedMissionOperationV1;
  readonly authorization: GovernedMissionAuthorizationV1;
  readonly state: GovernedMissionStateV1;
}

export interface GovernedMissionLifecyclePortsV1 {
  readonly authorization: GovernedMissionAuthorizationPortV1;
  readonly decision: GovernedMissionDecisionPortV1;
  readonly allocation: GovernedMissionAllocationPortV1;
  readonly formation: GovernedMissionFormationPortV1;
  readonly execution: GovernedMissionExecutionPortV1;
  readonly control: GovernedMissionControlPortV1;
  readonly reconfiguration: GovernedMissionReconfigurationPortV1;
}

export interface GovernedMissionLifecycleRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly policy: GovernedMissionPolicyV1;
  readonly store: GovernedMissionStoreV1;
  readonly ports: GovernedMissionLifecyclePortsV1;
}

export interface GovernedMissionLifecyclePortV1 {
  advance(request: GovernedMissionRequestV1): Promise<GovernedMissionStateV1>;
  recover(request: GovernedMissionRequestV1): Promise<GovernedMissionStateV1>;
}
