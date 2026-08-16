import type { PlanningDigestV1, PlanningJson } from "./contracts.js";
import { digestPlanningJsonV1 } from "./canonical.js";

export const MISSION_CONTINUITY_SCHEMA_VERSION_V1 = 1 as const;

export type MissionPlanBranchStatusV1 =
  | "active"
  | "candidate"
  | "selected"
  | "activated"
  | "rollback_pending"
  | "rolled_back"
  | "abandonment_pending"
  | "abandoned"
  | "expired";

export type MissionContinuityTransitionV1 =
  | "renewal_pending"
  | "renewed"
  | "expired"
  | "branching"
  | "branch_selected"
  | "activated"
  | "rollback_pending"
  | "rolled_back"
  | "abandonment_pending"
  | "safely_abandoned";

export interface MissionPlanBranchV1 {
  readonly schemaVersion: 1;
  readonly branchId: string;
  readonly missionId: string;
  readonly parentBranchId: string | null;
  readonly parentPlanDigest: PlanningDigestV1;
  readonly epoch: number;
  readonly plan: PlanningJson;
  readonly planDigest: PlanningDigestV1;
  readonly status: MissionPlanBranchStatusV1;
  readonly createdAtLogicalMs: number;
  readonly mandateDigest: PlanningDigestV1;
  readonly lineageDigest: PlanningDigestV1;
}

export interface MissionContinuityEvidenceV1 {
  readonly evidenceId: string;
  readonly evidenceDigest: PlanningDigestV1;
  readonly source: string;
  readonly observedAtLogicalMs: number;
  readonly summary: string;
}

export interface MissionContinuityDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly transition: MissionContinuityTransitionV1;
  readonly missionId: string;
  readonly fromBranchId: string | null;
  readonly toBranchId: string | null;
  readonly previousEpoch: number;
  readonly nextEpoch: number;
  readonly mandateDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly evidence: readonly MissionContinuityEvidenceV1[];
  readonly checkpointDigest: PlanningDigestV1 | null;
  readonly quorumDigest: PlanningDigestV1 | null;
  readonly decisionDigest: PlanningDigestV1;
}

export interface MissionContinuityStateV1 {
  readonly schemaVersion: 1;
  readonly missionId: string;
  readonly epoch: number;
  readonly activeBranchId: string | null;
  readonly branches: readonly MissionPlanBranchV1[];
  readonly decisions: readonly MissionContinuityDecisionV1[];
  readonly stateDigest: PlanningDigestV1;
}

export interface CreateMissionPlanBranchInputV1 {
  readonly branchId: string;
  readonly missionId: string;
  readonly parentBranchId: string | null;
  readonly parentPlanDigest: PlanningDigestV1;
  readonly epoch: number;
  readonly plan: PlanningJson;
  readonly mandateDigest: PlanningDigestV1;
  readonly createdAtLogicalMs: number;
}

export function createMissionPlanBranchV1(
  input: CreateMissionPlanBranchInputV1,
): MissionPlanBranchV1 {
  const planDigest = digestPlanningJsonV1("plan-fragment", input.plan);
  const lineageDigest = digestPlanningJsonV1("plan-view", {
    branchId: input.branchId,
    missionId: input.missionId,
    parentBranchId: input.parentBranchId,
    parentPlanDigest: input.parentPlanDigest,
    epoch: input.epoch,
    planDigest,
    mandateDigest: input.mandateDigest,
  });
  return Object.freeze({
    schemaVersion: 1,
    ...input,
    planDigest,
    status: input.parentBranchId === null ? "active" : "candidate",
    lineageDigest,
  });
}

export interface ApplyMissionContinuityTransitionInputV1 {
  readonly decisionId: string;
  readonly transition: MissionContinuityTransitionV1;
  readonly branchId?: string;
  readonly mandateDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly evidence?: readonly MissionContinuityEvidenceV1[];
  readonly checkpointDigest?: PlanningDigestV1 | null;
  readonly quorumDigest?: PlanningDigestV1 | null;
  readonly nextEpoch?: number;
}

const allowed: Record<MissionContinuityTransitionV1, readonly MissionPlanBranchStatusV1[]> = {
  renewal_pending: ["active"], renewed: ["active"], expired: ["active"],
  branching: ["active"], branch_selected: ["candidate"], activated: ["selected"],
  rollback_pending: ["active", "activated"], rolled_back: ["rollback_pending"],
  abandonment_pending: ["active", "activated", "candidate"], safely_abandoned: ["abandonment_pending"],
};

export function applyMissionContinuityTransitionV1(
  state: MissionContinuityStateV1,
  input: ApplyMissionContinuityTransitionInputV1,
): MissionContinuityStateV1 {
  const branch = input.branchId === undefined
    ? null
    : state.branches.find((candidate) => candidate.branchId === input.branchId) ?? null;
  if (input.branchId !== undefined && !branch) throw new Error("mission continuity branch not found");
  if (branch && !allowed[input.transition].includes(branch.status))
    throw new Error(`invalid mission continuity transition: ${branch.status} -> ${input.transition}`);
  const nextEpoch = input.nextEpoch ?? state.epoch + (input.transition === "renewed" || input.transition === "activated" ? 1 : 0);
  if (nextEpoch < state.epoch) throw new Error("mission continuity epoch cannot decrease");
  const statusByTransition: Partial<Record<MissionContinuityTransitionV1, MissionPlanBranchStatusV1>> = {
    branch_selected: "selected", activated: "activated", rollback_pending: "rollback_pending",
    rolled_back: "rolled_back", abandonment_pending: "abandonment_pending", safely_abandoned: "abandoned",
    expired: "expired",
  };
  const nextBranches = branch && statusByTransition[input.transition]
    ? state.branches.map((candidate) => candidate.branchId === branch.branchId
      ? { ...candidate, status: statusByTransition[input.transition]! }
      : candidate)
    : state.branches;
  const activeBranchId = input.transition === "activated" ? input.branchId ?? null
    : input.transition === "rolled_back" ? state.activeBranchId : state.activeBranchId;
  const decisionBase = {
    schemaVersion: 1 as const, decisionId: input.decisionId, transition: input.transition,
    missionId: state.missionId, fromBranchId: state.activeBranchId, toBranchId: input.branchId ?? null,
    previousEpoch: state.epoch, nextEpoch, mandateDigest: input.mandateDigest, policyDigest: input.policyDigest,
    evidence: input.evidence ?? [], checkpointDigest: input.checkpointDigest ?? null, quorumDigest: input.quorumDigest ?? null,
  };
  const decisionDigest = digestPlanningJsonV1("plan-fragment-decision", decisionBase as unknown as PlanningJson);
  const decision: MissionContinuityDecisionV1 = Object.freeze({ ...decisionBase, decisionDigest });
  const next = { ...state, epoch: nextEpoch, activeBranchId, branches: nextBranches, decisions: [...state.decisions, decision] };
  return Object.freeze({ ...next, stateDigest: digestPlanningJsonV1("collective-planning-snapshot", next as unknown as PlanningJson) });
}

export function createMissionContinuityStateV1(missionId: string, branch: MissionPlanBranchV1): MissionContinuityStateV1 {
  const base = { schemaVersion: 1 as const, missionId, epoch: branch.epoch, activeBranchId: branch.branchId, branches: [branch], decisions: [] };
  return Object.freeze({ ...base, stateDigest: digestPlanningJsonV1("collective-planning-snapshot", base as unknown as PlanningJson) });
}
