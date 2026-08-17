import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type {
  MechanismAllocationPlanV1,
  MechanismAllocationPolicyV1,
  MechanismAllocationSelectionV1,
  MechanismBidRevealV1,
  MechanismMissionDecompositionProposalV1,
} from "./mechanism-allocation-contracts.js";

/** Stable metadata used to select and audit an allocation implementation. */
export interface MechanismAllocationStrategyDefinitionV1 {
  readonly strategyId: string;
  readonly strategyVersion: number;
  readonly capabilities: readonly string[];
  readonly strategyDigest: PlanningDigestV1;
}

export interface MechanismAllocationStrategyInputV1 {
  readonly proposal: MechanismMissionDecompositionProposalV1;
  readonly reveals: readonly MechanismBidRevealV1[];
  readonly policy: MechanismAllocationPolicyV1;
  readonly auctionDigest: PlanningDigestV1;
  readonly round: number;
  readonly causalEpoch: number;
  readonly decidedAtLogicalMs: number;
}

export interface MechanismAllocationStrategyV1 {
  readonly definition: MechanismAllocationStrategyDefinitionV1;
  allocate(input: MechanismAllocationStrategyInputV1): readonly MechanismAllocationSelectionV1[];
}

export function createMechanismAllocationStrategyDefinitionV1(
  input: Omit<MechanismAllocationStrategyDefinitionV1, "strategyDigest">,
): MechanismAllocationStrategyDefinitionV1 {
  if (!input.strategyId || !Number.isInteger(input.strategyVersion) || input.strategyVersion < 1)
    throw new TypeError("allocation strategy identity is invalid");
  const body = { ...input, capabilities: [...input.capabilities].sort() };
  return Object.freeze({ ...input, capabilities: body.capabilities, strategyDigest: digestPlanningJsonV1("adaptive-role-binding", body as unknown as PlanningJson) });
}

/** Registry with immutable replacement semantics: one definition per strategy id/version. */
export class MechanismAllocationStrategyRegistryV1 {
  readonly #strategies = new Map<string, MechanismAllocationStrategyV1>();
  register(strategy: MechanismAllocationStrategyV1): this {
    const key = `${strategy.definition.strategyId}@${strategy.definition.strategyVersion}`;
    const existing = this.#strategies.get(key);
    if (existing && existing.definition.strategyDigest !== strategy.definition.strategyDigest)
      throw new TypeError(`allocation strategy definition conflict: ${key}`);
    this.#strategies.set(key, strategy);
    return this;
  }
  get(strategyId: string, strategyVersion: number): MechanismAllocationStrategyV1 | undefined {
    return this.#strategies.get(`${strategyId}@${strategyVersion}`);
  }
  list(): readonly MechanismAllocationStrategyDefinitionV1[] {
    return [...this.#strategies.values()].map((strategy) => strategy.definition);
  }
}

/** Reference implementation: deterministic utility/cost ordering, preserving current semantics. */
export const referenceMechanismAllocationStrategyV1: MechanismAllocationStrategyV1 = Object.freeze({
  definition: createMechanismAllocationStrategyDefinitionV1({
    strategyId: "reference.utility-cost-order",
    strategyVersion: 1,
    capabilities: ["deterministic", "bounded", "policy-aware"],
  }),
  allocate(input: MechanismAllocationStrategyInputV1) {
    const bySlot = new Map<string, MechanismBidRevealV1[]>();
    for (const reveal of input.reveals) {
      const values = bySlot.get(reveal.slotId) ?? [];
      values.push(reveal);
      bySlot.set(reveal.slotId, values);
    }
    const selected: MechanismAllocationSelectionV1[] = [];
    for (const slot of input.proposal.slots) {
      const candidates = (bySlot.get(slot.slotId) ?? []).filter((reveal) =>
        slot.eligiblePeerIds.includes(reveal.bidderPeerId) &&
        reveal.declaredCostUnits <= slot.budgetCeilingUnits,
      );
      candidates.sort((a, b) => b.declaredUtilityMicros - a.declaredUtilityMicros || a.declaredCostUnits - b.declaredCostUnits || a.bidderPeerId.localeCompare(b.bidderPeerId));
      const winner = candidates[0];
      if (!winner) continue;
      selected.push({
        schemaVersion: 1,
        slotId: slot.slotId,
        revealId: winner.revealId,
        revealDigest: winner.revealDigest,
        bidderPeerId: winner.bidderPeerId,
        bidderInstanceId: winner.bidderInstanceId,
        bidderIndependenceGroupId: winner.bidderIndependenceGroupId,
        declaredUtilityMicros: winner.declaredUtilityMicros,
        declaredCostUnits: winner.declaredCostUnits,
        declaredResourceUnits: winner.declaredResourceUnits,
        declaredBudgetUnits: winner.declaredBudgetUnits,
        selectionDigest: winner.revealDigest,
      });
    }
    return selected;
  },
});
