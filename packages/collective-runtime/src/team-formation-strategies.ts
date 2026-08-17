import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";
import type {
  TeamFormationPolicyRecordV1,
  TeamFormationRequestV1,
  TeamPositionBidV1,
} from "./team-formation-contracts.js";
import {
  validateTeamFormationPolicyV1,
  validateTeamFormationRequestV1,
} from "./team-formation-validation.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;

/** Public descriptor used to select and audit a formation strategy. */
export interface TeamFormationStrategyDescriptorV1 {
  readonly strategyId: string;
  readonly strategyVersion: number;
  readonly capabilities: readonly string[];
  readonly implementationDigest: PlanningDigestV1;
}

export interface TeamFormationStrategyInputV1 {
  readonly request: TeamFormationRequestV1;
  readonly policy: TeamFormationPolicyRecordV1;
}

export interface TeamFormationStrategyResultV1 {
  readonly status: "formed" | "insufficient_coverage" | "search_exhausted";
  readonly selectedBids: readonly TeamPositionBidV1[];
  readonly exploredNodes: number;
}

/**
 * Interchangeable team formation/negotiation algorithm. Implementations must
 * be deterministic for the same canonical request and policy.
 */
export interface TeamFormationStrategyV1 {
  readonly descriptor: TeamFormationStrategyDescriptorV1;
  select(input: TeamFormationStrategyInputV1): TeamFormationStrategyResultV1;
}

export function createTeamFormationStrategyDescriptorV1(input: {
  readonly strategyId: string;
  readonly strategyVersion: number;
  readonly capabilities: readonly string[];
  readonly implementation?: string;
}): TeamFormationStrategyDescriptorV1 {
  const strategyId = identifier(input.strategyId, "strategyId");
  if (!Number.isSafeInteger(input.strategyVersion) || input.strategyVersion < 1)
    throw new TypeError("strategyVersion must be a positive integer");
  const capabilities = [...new Set(input.capabilities)].sort();
  if (capabilities.some((value) => !IDENTIFIER.test(value)))
    throw new TypeError("strategy capabilities must be identifiers");
  const implementationDigest = digestPlanningJsonV1(
    "local-strategy-definition",
    {
      strategyId,
      strategyVersion: input.strategyVersion,
      capabilities,
      implementation: input.implementation ?? null,
    },
  );
  return Object.freeze({
    strategyId,
    strategyVersion: input.strategyVersion,
    capabilities: Object.freeze(capabilities),
    implementationDigest,
  });
}

/** Registry with explicit replacement semantics and immutable snapshots. */
export class TeamFormationStrategyRegistryV1 {
  readonly #strategies = new Map<string, TeamFormationStrategyV1>();

  register(strategy: TeamFormationStrategyV1): this {
    if (!strategy || !strategy.descriptor || typeof strategy.select !== "function")
      throw new TypeError("team formation strategy is invalid");
    const key = `${strategy.descriptor.strategyId}@${strategy.descriptor.strategyVersion}`;
    if (this.#strategies.has(key))
      throw new TypeError(`team formation strategy already registered: ${key}`);
    this.#strategies.set(key, strategy);
    return this;
  }

  replace(strategy: TeamFormationStrategyV1): this {
    if (!strategy?.descriptor?.strategyId)
      throw new TypeError("team formation strategy is invalid");
    this.#strategies.set(`${strategy.descriptor.strategyId}@${strategy.descriptor.strategyVersion}`, strategy);
    return this;
  }

  get(strategyId: string, strategyVersion = 1): TeamFormationStrategyV1 {
    const strategy = this.#strategies.get(`${strategyId}@${strategyVersion}`);
    if (!strategy) throw new TypeError(`unknown team formation strategy: ${strategyId}@${strategyVersion}`);
    return strategy;
  }

  list(): readonly TeamFormationStrategyDescriptorV1[] {
    return Object.freeze(
      [...this.#strategies.values()]
        .map(({ descriptor }) => descriptor)
        .sort((a, b) => a.strategyId.localeCompare(b.strategyId)),
    );
  }
}

/**
 * Reference deterministic strategy. It preserves the runtime's core
 * invariants (one bid per position, member uniqueness, independence and
 * budget limits) while leaving the surrounding state machine unchanged.
 */
export const referenceTeamFormationStrategyV1: TeamFormationStrategyV1 = {
  descriptor: createTeamFormationStrategyDescriptorV1({
    strategyId: "reference.greedy-team-formation",
    strategyVersion: 1,
    capabilities: ["deterministic", "budget-aware", "independence-aware"],
    implementation: "score-descending-with-stable-tiebreak",
  }),
  select(input) {
    const request = validateTeamFormationRequestV1(input.request);
    const policy = validateTeamFormationPolicyV1(input.policy);
    const bidsByPosition = new Map<string, TeamPositionBidV1[]>();
    for (const bid of request.bids) {
      const list = bidsByPosition.get(bid.positionId) ?? [];
      list.push(bid);
      bidsByPosition.set(bid.positionId, list);
    }
    const selected: TeamPositionBidV1[] = [];
    const members = new Set<string>();
    const groups = new Set<string>();
    let totalBudget = 0;
    let exploredNodes = 0;
    for (const position of request.positions) {
      const candidates = (bidsByPosition.get(position.positionId) ?? [])
        .filter((bid) => bid.validUntilLogicalMs > request.logicalTimeMs)
        .sort((a, b) =>
          b.locallyEvaluatedScoreMicros - a.locallyEvaluatedScoreMicros ||
          a.bidDigest.localeCompare(b.bidDigest),
        );
      let chosen: TeamPositionBidV1 | undefined;
      for (const bid of candidates) {
        exploredNodes += 1;
        if (members.has(bid.candidate.candidateId)) continue;
        if (
          policy.policy.requireDistinctPeerPerPosition &&
          selected.some((value) => value.candidate.peerId === bid.candidate.peerId)
        ) continue;
        if (
          groups.has(bid.candidate.independenceGroupId) &&
          policy.policy.minimumIndependenceGroups > 1
        ) continue;
        if (totalBudget + bid.budgetUnits > policy.policy.maximumTotalBudgetUnits)
          continue;
        chosen = bid;
        break;
      }
      if (!chosen) {
        return Object.freeze({
          status: "insufficient_coverage" as const,
          selectedBids: Object.freeze([]),
          exploredNodes,
        });
      }
      selected.push(chosen);
      members.add(chosen.candidate.candidateId);
      groups.add(chosen.candidate.independenceGroupId);
      totalBudget += chosen.budgetUnits;
    }
    if (selected.length > policy.policy.limits.maximumMembers)
      return Object.freeze({ status: "search_exhausted", selectedBids: Object.freeze([]), exploredNodes });
    return Object.freeze({
      status: "formed" as const,
      selectedBids: Object.freeze(selected),
      exploredNodes,
    });
  },
};

export function createDefaultTeamFormationStrategyRegistryV1(): TeamFormationStrategyRegistryV1 {
  return new TeamFormationStrategyRegistryV1().register(referenceTeamFormationStrategyV1);
}

function identifier(value: string, label: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value))
    throw new TypeError(`${label} must be a valid identifier`);
  return value;
}
