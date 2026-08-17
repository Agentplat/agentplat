import type { AgentPlatID } from "@agentplat/core";
import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";

export type PartitionRuntimeStateV1 =
  | "connected"
  | "degraded"
  | "partitioned"
  | "reconciling"
  | "converged"
  | "safe_stopped";

export interface PartitionEffectV1 {
  readonly effectId: AgentPlatID;
  readonly branchId: AgentPlatID;
  readonly kind: string;
  readonly impact: "reversible" | "compensatable" | "irreversible";
  readonly resourceKey: string;
  readonly payloadDigest: PlanningDigestV1;
  readonly predecessorEffectId: AgentPlatID | null;
}

export interface CausalBranchV1 {
  readonly branchId: AgentPlatID;
  readonly parentBranchId: AgentPlatID | null;
  readonly baseDigest: PlanningDigestV1;
  readonly headDigest: PlanningDigestV1;
  readonly epoch: number;
  readonly authorityDigest: PlanningDigestV1;
  readonly effects: readonly PartitionEffectV1[];
}

export interface DivergenceReportV1 {
  readonly divergent: boolean;
  readonly commonBaseDigest: PlanningDigestV1 | null;
  readonly branchDigests: readonly PlanningDigestV1[];
  readonly conflictingResourceKeys: readonly string[];
  readonly incompatibleEffectIds: readonly AgentPlatID[];
  readonly reportDigest: PlanningDigestV1;
}

export interface CompensationActionV1 {
  readonly effectId: AgentPlatID;
  readonly action: "rollback" | "compensate" | "retain";
  readonly reasonCode: string;
  readonly actionDigest: PlanningDigestV1;
}

export interface ReconciliationDecisionV1 {
  readonly state: "converged" | "safe_stopped";
  readonly selectedBranchId: AgentPlatID | null;
  readonly divergence: DivergenceReportV1;
  readonly compensation: readonly CompensationActionV1[];
  readonly mergedEffectIds: readonly AgentPlatID[];
  readonly decisionDigest: PlanningDigestV1;
}

const digest = (value: unknown): PlanningDigestV1 =>
  digestPlanningJsonV1("collective-planning-snapshot", value as Parameters<typeof digestPlanningJsonV1>[1]);

/** Detects forks without relying on arrival order or wall-clock timestamps. */
export function detectCausalDivergenceV1(
  branches: readonly CausalBranchV1[],
): DivergenceReportV1 {
  const bases = [...new Set(branches.map((branch) => branch.baseDigest))];
  const resources = new Map<string, PartitionEffectV1[]>();
  for (const branch of branches) {
    for (const effect of branch.effects) {
      const existing = resources.get(effect.resourceKey) ?? [];
      resources.set(effect.resourceKey, [...existing, effect]);
    }
  }
  const conflicts = [...resources.entries()]
    .filter(([, effects]) => new Set(effects.map((effect) => effect.payloadDigest)).size > 1)
    .map(([key]) => key)
    .sort();
  const incompatibleEffectIds = [...resources.values()]
    .filter((effects) => new Set(effects.map((effect) => effect.payloadDigest)).size > 1)
    .flatMap((effects) => effects.map((effect) => effect.effectId))
    .sort();
  const divergent = branches.length > 1 && (bases.length > 1 || conflicts.length > 0);
  return {
    divergent,
    commonBaseDigest: bases.length === 1 ? bases[0]! : null,
    branchDigests: branches.map((branch) => branch.headDigest).sort(),
    conflictingResourceKeys: conflicts,
    incompatibleEffectIds,
    reportDigest: digest({ bases, conflicts, incompatibleEffectIds, divergent }),
  };
}

/** Deterministic reconciliation: highest epoch, then lexicographically smallest branch id. */
export function reconcilePartitionV1(input: {
  readonly branches: readonly CausalBranchV1[];
  readonly requireQuorum: boolean;
  readonly quorum: number;
}): ReconciliationDecisionV1 {
  const divergence = detectCausalDivergenceV1(input.branches);
  const ranked = [...input.branches].sort(
    (a, b) => b.epoch - a.epoch || a.branchId.localeCompare(b.branchId),
  );
  const selected = ranked[0] ?? null;
  const compensation: CompensationActionV1[] = [];
  const merged: AgentPlatID[] = [];
  for (const branch of input.branches) {
    for (const effect of branch.effects) {
      const conflict = divergence.incompatibleEffectIds.includes(effect.effectId);
      if (!conflict || branch.branchId === selected?.branchId) {
        merged.push(effect.effectId);
        continue;
      }
      const action = effect.impact === "reversible" ? "rollback" : effect.impact === "compensatable" ? "compensate" : "retain";
      compensation.push({
        effectId: effect.effectId,
        action,
        reasonCode: "causal_conflict_lost_deterministic_winner",
        actionDigest: digest({ effectId: effect.effectId, action }),
      });
    }
  }
  const safeStopped =
    input.branches.length === 0 ||
    (input.requireQuorum && input.branches.length < input.quorum) ||
    compensation.some((action) => action.action === "retain");
  const state = safeStopped ? "safe_stopped" : "converged";
  return {
    state,
    selectedBranchId: safeStopped ? null : selected?.branchId ?? null,
    divergence,
    compensation,
    mergedEffectIds: merged.sort(),
    decisionDigest: digest({ state, selected: safeStopped ? null : selected?.branchId ?? null, divergence: divergence.reportDigest, compensation, merged }),
  };
}
