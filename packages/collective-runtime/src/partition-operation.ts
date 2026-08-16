import { digestPlanningJsonV1, type PlanningJson } from "@agentplat/collective-planning";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import {
  PARTITION_OPERATION_SCHEMA_VERSION_V1,
  type PartitionOperationDecisionV1,
  type PartitionOperationPolicyV1,
  type PartitionOperationRequestV1,
  type PartitionOperationStateV1,
} from "./partition-operation-contracts.js";

const states = new Set<PartitionOperationStateV1>([
  "connected", "degraded", "partitioned", "reconciling", "converged", "safe_stopped",
]);
const modes = new Set(["strict_consistency", "bounded_degraded", "availability_preferred", "reconciliation_required"]);
const classes = new Set(["reversible", "bounded", "irreversible"]);
const digest = (label: string, value: unknown): PlanningDigestV1 =>
  digestPlanningJsonV1("proposal-identity", { label, value } as unknown as PlanningJson);

export function validatePartitionOperationPolicyV1(policy: PartitionOperationPolicyV1): void {
  if (policy.schemaVersion !== 1 || !policy.policyId || policy.policyVersion < 1 || !modes.has(policy.mode)) throw new TypeError("invalid_partition_policy");
  if (!Number.isSafeInteger(policy.maximumRiskBps) || policy.maximumRiskBps < 0 || policy.maximumRiskBps > 10_000) throw new TypeError("invalid_partition_risk_limit");
  if (!Number.isSafeInteger(policy.maximumOfflineDurationMs) || policy.maximumOfflineDurationMs < 0 || !Number.isSafeInteger(policy.maximumOfflineEffects) || policy.maximumOfflineEffects < 0) throw new TypeError("invalid_partition_budget");
  if (!policy.allowedEffectClasses.every((value) => classes.has(value))) throw new TypeError("invalid_partition_effect_class");
}

export function decidePartitionOperationV1(input: { readonly policy: PartitionOperationPolicyV1; readonly request: PartitionOperationRequestV1 }): PartitionOperationDecisionV1 {
  const { policy, request } = input;
  validatePartitionOperationPolicyV1(policy);
  if (!states.has(request.currentState) || request.observation.connectedPeerCount < 0 || request.observation.expectedPeerCount < 0 || request.observation.offlineDurationMs < 0) throw new TypeError("invalid_partition_request");
  const o = request.observation;
  const disconnected = !o.quorumAvailable || o.connectedPeerCount < o.expectedPeerCount;
  const divergent = o.divergentBranchDigests.length > 0;
  let nextState: PartitionOperationStateV1 = request.currentState;
  const reasons: string[] = [];
  if (divergent) { nextState = "reconciling"; reasons.push("causal_branches_divergent"); }
  else if (disconnected) { nextState = o.connectedPeerCount === 0 ? "partitioned" : "degraded"; reasons.push("quorum_unavailable"); }
  else if (request.currentState === "partitioned" || request.currentState === "degraded" || request.currentState === "reconciling") { nextState = "converged"; reasons.push("connectivity_and_quorum_restored"); }
  else nextState = "connected";
  const effect = request.proposedEffectClass;
  const risk = request.riskBps ?? 0;
  let allowEffect = Boolean(effect && policy.allowedEffectClasses.includes(effect) && risk <= policy.maximumRiskBps);
  if (policy.mode === "strict_consistency" && disconnected) { allowEffect = false; reasons.push("strict_consistency_requires_quorum"); }
  if (policy.mode === "reconciliation_required" && (disconnected || divergent)) { allowEffect = false; reasons.push("reconciliation_required"); }
  if (effect === "irreversible" && (disconnected || (divergent && policy.requireReconciliationBeforeIrreversible))) { allowEffect = false; reasons.push("irreversible_effect_blocked"); }
  if (o.pendingEffectCount >= policy.maximumOfflineEffects && disconnected) { allowEffect = false; reasons.push("offline_effect_budget_exhausted"); }
  if (o.offlineDurationMs > policy.maximumOfflineDurationMs && disconnected) { allowEffect = false; reasons.push("offline_duration_budget_exhausted"); }
  if (nextState === "partitioned" && policy.mode === "strict_consistency") nextState = "safe_stopped";
  if (!allowEffect && effect && !reasons.includes("effect_not_permitted")) reasons.push("effect_not_permitted");
  const body = { schemaVersion: PARTITION_OPERATION_SCHEMA_VERSION_V1, operationId: request.operationId, previousState: request.currentState, nextState, mode: policy.mode, allowEffect, reasonCodes: [...new Set(reasons)].sort(), evidenceDigest: o.evidenceDigest };
  return Object.freeze({ ...body, decisionDigest: digest("partition-operation-decision", body) });
}
