import type {
  GovernedActionCheckDecisionV1,
  GovernedActionCheckStageV1,
  GovernedActionGuardV1,
  GovernedActionPermitV1,
} from "@agentplat/collective-control/actions";
import type { ActionScope } from "@agentplat/inference-control/tools";

import { validateAutonomyDecisionV1 } from "./runtime.js";
import type { AutonomyDecisionV1 } from "./contracts.js";

export interface AutonomyApprovalEvidencePortV1 {
  check(input: {
    readonly decision: AutonomyDecisionV1;
    readonly stage: GovernedActionCheckStageV1;
    readonly permit: GovernedActionPermitV1;
    readonly scope: ActionScope | null;
    readonly actionDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<GovernedActionCheckDecisionV1>;
}

export interface AutonomyGovernedActionGuardOptionsV1 {
  readonly decision: AutonomyDecisionV1;
  readonly approval?: AutonomyApprovalEvidencePortV1;
  readonly base?: GovernedActionGuardV1;
  readonly maximumDecisionAgeMs?: number;
}

/** Narrows an existing governed action path; it cannot create authority. */
export function createAutonomyGovernedActionGuardV1(
  options: AutonomyGovernedActionGuardOptionsV1,
): GovernedActionGuardV1 {
  const decision = validateAutonomyDecisionV1(options.decision);
  const maximumAge = options.maximumDecisionAgeMs ?? 60_000;
  if (
    !Number.isSafeInteger(maximumAge) ||
    maximumAge < 1 ||
    maximumAge > 24 * 60 * 60 * 1_000
  )
    throw new RangeError("autonomy_action_decision_age_invalid");
  const guard: GovernedActionGuardV1 = {
    async check(input) {
      if (input.actionDigest !== decision.actionProposalDigest)
        return deny("autonomy_action_digest_mismatch");
      const decisionTime = Date.parse(decision.decidedAt);
      if (
        !Number.isSafeInteger(input.logicalTimeMs) ||
        input.logicalTimeMs < decisionTime ||
        input.logicalTimeMs - decisionTime > maximumAge
      )
        return deny("autonomy_decision_stale");
      if (decision.disposition === "deny")
        return deny("autonomy_action_denied");
      if (decision.disposition === "proposal_only")
        return deny("autonomy_effect_proposal_only");
      if (decision.disposition === "require_approval") {
        if (!options.approval)
          return deny("autonomy_approval_evidence_unavailable");
        let approval: GovernedActionCheckDecisionV1;
        try {
          approval = await options.approval.check({
            decision,
            stage: input.stage,
            permit: input.permit,
            scope: input.scope,
            actionDigest: input.actionDigest,
            logicalTimeMs: input.logicalTimeMs,
          });
        } catch {
          return deny("autonomy_approval_evidence_unavailable");
        }
        if (!approval.allowed) return approval;
      }
      if (options.base) {
        try {
          const base = await options.base.check(input);
          if (!base.allowed) return base;
        } catch {
          return deny("autonomy_base_guard_unavailable");
        }
      }
      return Object.freeze({
        allowed: true as const,
        code: "allowed" as const,
      });
    },
  };
  return Object.freeze(guard);
}

function deny(code: string): GovernedActionCheckDecisionV1 {
  return Object.freeze({ allowed: false as const, code });
}
