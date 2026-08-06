import { validateTrustEligibilityDecisionV1 } from "@agentplat/trust";
import type {
  CollectiveTrustEligibilityFilterOptionsV1,
  CollectiveTrustEligibilityPortV1,
} from "./trust-consensus-contracts.js";
import { evaluateCollectiveTrustGateV1 } from "./trust-consensus-codec.js";

/**
 * Composes with existing candidate-filtering ports. It returns the original
 * local Trust decision only when both local and collective policy admit it.
 */
export function createCollectiveTrustEligibilityFilterV1<TInput>(
  options: CollectiveTrustEligibilityFilterOptionsV1<TInput>,
): CollectiveTrustEligibilityPortV1<TInput> {
  if (
    !options ||
    typeof options.tenantId !== "function" ||
    typeof options.logicalTimeMs !== "function" ||
    !options.local ||
    typeof options.local.evaluate !== "function" ||
    !options.collective ||
    typeof options.collective.resolve !== "function" ||
    !options.policy ||
    (options.observe && typeof options.observe !== "function")
  )
    throw new TypeError("collective trust filter options are required");
  return Object.freeze({
    evaluate: async (input: TInput) => {
      let localValue;
      try {
        localValue = await options.local.evaluate(input);
      } catch {
        return null;
      }
      if (!localValue) return null;
      let local;
      try {
        local = validateTrustEligibilityDecisionV1(localValue);
      } catch {
        return null;
      }
      let collective;
      try {
        collective = await options.collective.resolve({
          request: input,
          localDecision: local,
        });
      } catch {
        return null;
      }
      let gate;
      try {
        gate = await evaluateCollectiveTrustGateV1({
          tenantId: options.tenantId(input),
          localDecision: local,
          certifiedDecision: collective,
          policy: options.policy,
          logicalTimeMs: options.logicalTimeMs(input),
          crypto: options.crypto,
        });
      } catch {
        return null;
      }
      try {
        await options.observe?.(gate);
      } catch {
        // Observability cannot turn a denied decision into an eligible one.
        return null;
      }
      return gate.disposition === "eligible" ? localValue : null;
    },
  });
}
