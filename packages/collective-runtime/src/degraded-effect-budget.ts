/**
 * Risk controls for effects issued while connectivity or quorum is degraded.
 * This module is deliberately provider-neutral: callers supply the effect
 * metadata and the authority that owns the offline budget.
 */

export type EffectImpact = "negligible" | "low" | "moderate" | "high" | "critical";
export type EffectReversibility = "reversible" | "compensatable" | "irreversible";
export type EffectRiskClass = "bounded" | "restricted" | "prohibited";

export interface EffectDescriptor {
  readonly effectId: string;
  readonly kind: string;
  readonly impact: EffectImpact;
  readonly reversibility: EffectReversibility;
  readonly actionCost?: number;
  readonly resourceCost?: number;
  readonly estimatedDurationMs?: number;
  readonly targetScope?: string;
}

export interface DegradedRiskBudget {
  readonly budgetId: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly maxActions: number;
  readonly maxResourceUnits: number;
  readonly maxDurationMs: number;
  readonly allowedRiskClasses: readonly EffectRiskClass[];
  readonly consumedActions?: number;
  readonly consumedResourceUnits?: number;
  readonly consumedDurationMs?: number;
}

export interface DegradedBudgetUsage {
  readonly actions: number;
  readonly resourceUnits: number;
  readonly durationMs: number;
}

export interface DegradedDecisionReceipt {
  readonly receiptVersion: "degraded-decision-receipt.v1";
  readonly receiptId: string;
  readonly decisionId: string;
  readonly budgetId: string;
  readonly effectId: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly mode: "degraded";
  readonly riskClass: EffectRiskClass;
  readonly usage: DegradedBudgetUsage;
  readonly remaining: DegradedBudgetUsage;
  readonly decision: "allowed" | "denied";
  readonly denialReason?:
    | "budget_expired"
    | "risk_class_not_allowed"
    | "action_limit"
    | "resource_limit"
    | "duration_limit"
    | "invalid_effect";
  readonly authorityDigest?: string;
  readonly evidenceDigest?: string;
}

const IMPACT_RANK: Record<EffectImpact, number> = {
  negligible: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

/** Classify an effect before it is considered against an offline budget. */
export function classifyDegradedEffect(effect: EffectDescriptor): EffectRiskClass {
  if (effect.impact === "critical" || effect.reversibility === "irreversible") {
    return "prohibited";
  }
  if (effect.impact === "high" || effect.reversibility === "compensatable") {
    return "restricted";
  }
  return "bounded";
}

function usageOf(effect: EffectDescriptor): DegradedBudgetUsage {
  return {
    actions: effect.actionCost ?? 1,
    resourceUnits: effect.resourceCost ?? 0,
    durationMs: effect.estimatedDurationMs ?? 0,
  };
}

function remaining(budget: DegradedRiskBudget, used: DegradedBudgetUsage): DegradedBudgetUsage {
  return {
    actions: Math.max(0, budget.maxActions - (budget.consumedActions ?? 0) - used.actions),
    resourceUnits: Math.max(
      0,
      budget.maxResourceUnits - (budget.consumedResourceUnits ?? 0) - used.resourceUnits,
    ),
    durationMs: Math.max(0, budget.maxDurationMs - (budget.consumedDurationMs ?? 0) - used.durationMs),
  };
}

/** Evaluate an effect and return an auditable receipt without mutating the budget. */
export function evaluateDegradedEffect(input: {
  readonly effect: EffectDescriptor;
  readonly budget: DegradedRiskBudget;
  readonly nowMs: number;
  readonly decisionId: string;
  readonly receiptId: string;
  readonly authorityDigest?: string;
  readonly evidenceDigest?: string;
}): DegradedDecisionReceipt {
  const { effect, budget } = input;
  const riskClass = classifyDegradedEffect(effect);
  const usage = usageOf(effect);
  const current = {
    actions: budget.consumedActions ?? 0,
    resourceUnits: budget.consumedResourceUnits ?? 0,
    durationMs: budget.consumedDurationMs ?? 0,
  };
  let denialReason: DegradedDecisionReceipt["denialReason"];
  if (!effect.effectId || !effect.kind || IMPACT_RANK[effect.impact] === undefined) denialReason = "invalid_effect";
  else if (input.nowMs >= budget.expiresAtMs || input.nowMs < budget.issuedAtMs) denialReason = "budget_expired";
  else if (!budget.allowedRiskClasses.includes(riskClass)) denialReason = "risk_class_not_allowed";
  else if (current.actions + usage.actions > budget.maxActions) denialReason = "action_limit";
  else if (current.resourceUnits + usage.resourceUnits > budget.maxResourceUnits) denialReason = "resource_limit";
  else if (current.durationMs + usage.durationMs > budget.maxDurationMs) denialReason = "duration_limit";
  const accepted = denialReason === undefined;
  return {
    receiptVersion: "degraded-decision-receipt.v1",
    receiptId: input.receiptId,
    decisionId: input.decisionId,
    budgetId: budget.budgetId,
    effectId: effect.effectId,
    issuedAtMs: input.nowMs,
    expiresAtMs: budget.expiresAtMs,
    mode: "degraded",
    riskClass,
    usage,
    remaining: remaining(budget, accepted ? usage : { actions: 0, resourceUnits: 0, durationMs: 0 }),
    decision: accepted ? "allowed" : "denied",
    ...(denialReason ? { denialReason } : {}),
    ...(input.authorityDigest ? { authorityDigest: input.authorityDigest } : {}),
    ...(input.evidenceDigest ? { evidenceDigest: input.evidenceDigest } : {}),
  };
}

/** Apply an accepted receipt to a budget, returning a new immutable budget. */
export function consumeDegradedBudget(
  budget: DegradedRiskBudget,
  receipt: DegradedDecisionReceipt,
): DegradedRiskBudget {
  if (receipt.decision !== "allowed" || receipt.budgetId !== budget.budgetId) return budget;
  return {
    ...budget,
    consumedActions: (budget.consumedActions ?? 0) + receipt.usage.actions,
    consumedResourceUnits: (budget.consumedResourceUnits ?? 0) + receipt.usage.resourceUnits,
    consumedDurationMs: (budget.consumedDurationMs ?? 0) + receipt.usage.durationMs,
  };
}
