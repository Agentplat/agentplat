import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  GovernedMissionPortInputV1,
  GovernedMissionReconfigurationPortV1,
} from "./mission-lifecycle-contracts.js";
import type {
  MorphogenesisStrategyGovernanceTransitionV3,
  MorphogenesisStrategyRecommendationV3,
  MorphogenesisStrategyReviewV3,
} from "./morphogenesis-strategy-governance.js";

export interface GovernedMissionMorphogenesisStrategyPortV3 {
  enact(input: GovernedMissionPortInputV1 & {
    readonly recommendationDigest: PlanningDigestV1;
  }): Promise<{
    readonly recommendation: MorphogenesisStrategyRecommendationV3;
    readonly review: MorphogenesisStrategyReviewV3;
    readonly transition: MorphogenesisStrategyGovernanceTransitionV3;
    readonly missionScopeDigest: PlanningDigestV1;
    readonly missionAuthorizationDigest: PlanningDigestV1;
  }>;
}

/** Explicit Mission action for governed strategy lifecycle; never selects an operator itself. */
export class GovernedMissionMorphogenesisStrategyReconfigurationPortV3
  implements GovernedMissionReconfigurationPortV1
{
  constructor(readonly options: {
    readonly strategies: GovernedMissionMorphogenesisStrategyPortV3;
    readonly fallback?: GovernedMissionReconfigurationPortV1;
  }) {
    if (!options?.strategies || typeof options.strategies.enact !== "function")
      throw new TypeError("mission Morphogenesis strategy port is required");
  }

  async enact(input: Parameters<GovernedMissionReconfigurationPortV1["enact"]>[0]) {
    if (input.operation.action !== "enact_morphogenesis_strategy_change") {
      if (!this.options.fallback)
        throw new TypeError("mission reconfiguration action is unavailable");
      return this.options.fallback.enact(input);
    }
    const proposal = input.controlProposal;
    const recommendationDigest = proposal.morphogenesisStrategyRecommendationDigest;
    if (proposal.action !== "request_morphogenesis_strategy_change" || !recommendationDigest)
      throw new TypeError("mission Morphogenesis strategy proposal binding is invalid");
    const result = await this.options.strategies.enact({
      request: input.request,
      scope: input.scope,
      operation: input.operation,
      authorization: input.authorization,
      state: input.state,
      recommendationDigest,
    });
    if (result.recommendation.recommendationDigest !== recommendationDigest ||
        result.review.recommendationDigest !== recommendationDigest ||
        result.transition.recommendationDigest !== recommendationDigest ||
        result.transition.reviewDigest !== result.review.reviewDigest ||
        result.missionScopeDigest !== input.scope.scopeDigest ||
        result.missionAuthorizationDigest !== input.authorization.authorizationDigest)
      throw new TypeError("mission Morphogenesis strategy result binding is invalid");
    return Object.freeze({ resultDigest: result.transition.transitionDigest });
  }
}
