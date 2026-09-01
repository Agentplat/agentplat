import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import {
  createMorphogenesisStrategyReviewV3,
  validateMorphogenesisStrategyRecommendationV3,
  type MorphogenesisStrategyRecommendationV3,
  type MorphogenesisStrategyReviewPortV3,
} from "@agentplat/collective-runtime/morphogenesis";

export interface MorphogenesisStrategyAgentMandatePortV3 {
  verify(input: {
    readonly recommendation: MorphogenesisStrategyRecommendationV3;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly recommendationDigest: PlanningDigestV1;
    readonly actorId: AgentPlatID;
    readonly actorMandateDigest: PlanningDigestV1;
    readonly independenceGroupId: AgentPlatID;
    readonly disposition: "approved" | "rejected";
    readonly proofDigest: PlanningDigestV1;
    readonly reviewedAtLogicalMs: number;
    readonly expiresAtLogicalMs: number;
  } | null>;
}

/** Maps a verified agent mandate into the common inert review contract. */
export class AuthorizedAgentMorphogenesisStrategyReviewPortV3
  implements MorphogenesisStrategyReviewPortV3
{
  constructor(readonly mandates: MorphogenesisStrategyAgentMandatePortV3) {
    if (!mandates || typeof mandates.verify !== "function")
      throw new TypeError("Morphogenesis strategy agent mandate port is required");
  }
  async review(input: {
    readonly recommendation: MorphogenesisStrategyRecommendationV3;
    readonly logicalTimeMs: number;
  }) {
    const recommendation = validateMorphogenesisStrategyRecommendationV3(input.recommendation);
    if (recommendation.reviewRoute !== "authorized_agent")
      throw new TypeError("authorized-agent strategy review route is not selected");
    const mandate = await this.mandates.verify({ recommendation, logicalTimeMs: input.logicalTimeMs });
    if (!mandate) return null;
    if (mandate.recommendationDigest !== recommendation.recommendationDigest ||
        mandate.reviewedAtLogicalMs > input.logicalTimeMs ||
        mandate.expiresAtLogicalMs <= input.logicalTimeMs)
      throw new TypeError("Morphogenesis strategy agent mandate is stale or substituted");
    return createMorphogenesisStrategyReviewV3({
      reviewId: `${recommendation.recommendationId}:agent-review`,
      recommendationId: recommendation.recommendationId,
      recommendationDigest: recommendation.recommendationDigest,
      route: "authorized_agent",
      actorType: "agent",
      actorId: mandate.actorId,
      actorMandateDigest: mandate.actorMandateDigest,
      independenceGroupId: mandate.independenceGroupId,
      disposition: mandate.disposition,
      proofDigest: mandate.proofDigest,
      reviewedAtLogicalMs: mandate.reviewedAtLogicalMs,
      expiresAtLogicalMs: mandate.expiresAtLogicalMs,
    });
  }
}
