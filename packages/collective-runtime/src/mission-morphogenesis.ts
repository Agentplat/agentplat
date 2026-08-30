import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  GovernedMissionPortInputV1,
  GovernedMissionReconfigurationPortV1,
} from "./mission-lifecycle-contracts.js";
import {
  validateMorphogenesisOperatorOutcomeReceiptV2,
  type MorphogenesisOperatorOutcomeReceiptV2,
} from "./morphogenesis-operator-cycle.js";

export interface GovernedMissionMorphogenesisResultV2 {
  readonly morphogenesisRequestDigest: PlanningDigestV1;
  readonly missionScopeDigest: PlanningDigestV1;
  readonly missionAuthorizationDigest: PlanningDigestV1;
  readonly expectedMorphologyEpoch: number;
  readonly outcome: MorphogenesisOperatorOutcomeReceiptV2;
}

/** Provider-neutral boundary that owns execution/reconciliation of one exact cycle. */
export interface GovernedMissionMorphogenesisPortV2 {
  enact(input: GovernedMissionPortInputV1 & {
    readonly morphogenesisRequestDigest: PlanningDigestV1;
  }): Promise<GovernedMissionMorphogenesisResultV2>;
}

/**
 * Explicit Mission Lifecycle composition. Other reconfiguration actions retain
 * their existing owner and are never reinterpreted as Morphogenesis.
 */
export class GovernedMissionMorphogenesisReconfigurationPortV2
  implements GovernedMissionReconfigurationPortV1
{
  constructor(readonly options: {
    readonly morphogenesis: GovernedMissionMorphogenesisPortV2;
    readonly fallback?: GovernedMissionReconfigurationPortV1;
  }) {
    if (!options?.morphogenesis || typeof options.morphogenesis.enact !== "function")
      throw new TypeError("mission Morphogenesis port is required");
  }

  async enact(
    input: Parameters<GovernedMissionReconfigurationPortV1["enact"]>[0],
  ): Promise<{ readonly resultDigest: PlanningDigestV1 }> {
    if (input.operation.action !== "enact_morphogenesis") {
      if (!this.options.fallback)
        throw new TypeError("mission reconfiguration action is unavailable");
      return this.options.fallback.enact(input);
    }
    const proposal = input.controlProposal;
    if (proposal.action !== "request_morphogenesis" ||
        !proposal.morphogenesisRequestDigest)
      throw new TypeError("mission Morphogenesis proposal binding is invalid");
    const result = await this.options.morphogenesis.enact({
      request: input.request,
      scope: input.scope,
      operation: input.operation,
      authorization: input.authorization,
      state: input.state,
      morphogenesisRequestDigest: proposal.morphogenesisRequestDigest,
    });
    const outcome = validateMorphogenesisOperatorOutcomeReceiptV2(result.outcome);
    if (result.morphogenesisRequestDigest !== proposal.morphogenesisRequestDigest ||
        result.missionScopeDigest !== input.scope.scopeDigest ||
        result.missionAuthorizationDigest !== input.authorization.authorizationDigest ||
        outcome.resultingMorphologyEpoch !== result.expectedMorphologyEpoch + 1)
      throw new TypeError("mission Morphogenesis result binding is invalid");
    if (outcome.disposition !== "success")
      throw new Error(`mission Morphogenesis outcome is ${outcome.disposition}`);
    return Object.freeze({ resultDigest: outcome.receiptDigest });
  }
}
