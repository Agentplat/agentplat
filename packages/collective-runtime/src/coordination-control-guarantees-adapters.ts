import type { PlanningWorkTargetV1 } from "@agentplat/collective-planning";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  CoordinationControlProposalV1,
  CoordinationControlScopeV1,
} from "./coordination-control-contracts.js";
import { createCoordinationControlProposalV1 } from "./coordination-control-validation.js";
import type {
  AuthenticatedCoordinationControlGuaranteeReceiptV1,
  CoordinationControlGuaranteeExecutionControlBindingV1,
  CoordinationControlGuaranteeExecutionReceiptV1,
  CoordinationControlGuaranteeProposalV1,
  CoordinationControlGuaranteeReceiptLookupPortV1,
  CoordinationControlGuaranteeTeamExecutionAdapterPortV1,
  CoordinationControlTargetV1,
} from "./coordination-control-guarantees-contracts.js";
import {
  createCoordinationControlTargetV1,
  executionReceiptMatchesProposal,
  validateCoordinationControlGuaranteeProposalV1,
  validateCoordinationControlGuaranteeExecutionReceiptV1,
} from "./coordination-control-guarantees-validation.js";
import { createTeamExecutionControlEvidenceV1 } from "./team-execution-validation.js";

/**
 * Exposes the enforceable gate to an existing coordination-control consumer.
 * The legacy proposal remains advisory; callers must retain the returned gate
 * proposal as the authorization decision.
 */
export function adaptGuaranteeProposalToCoordinationControlV1(input: {
  readonly proposal: CoordinationControlGuaranteeProposalV1;
  readonly proposalId: string;
}): CoordinationControlProposalV1 {
  const proposal = validateCoordinationControlGuaranteeProposalV1(input.proposal);
  return createCoordinationControlProposalV1({
    schemaVersion: 1,
    proposalId: input.proposalId,
    scope: proposal.scope,
    action: proposal.action,
    reasonCodes: proposal.reasonCodes,
    evidenceDigests: [proposal.proposalDigest],
    evaluatedAtLogicalMs: proposal.evaluatedAtLogicalMs,
    expiresAtLogicalMs: proposal.expiresAtLogicalMs,
    advisoryOnly: true,
  });
}

/**
 * Creates the only team-execution projection for guarantee proposals. Callers
 * provide a digest, never proposal bytes or control identity; the configured
 * lookup must authenticate a durable delivery receipt before evidence exists.
 */
export function createAuthenticatedGuaranteeTeamExecutionControlPortV1(input: {
  readonly controlBinding: CoordinationControlGuaranteeExecutionControlBindingV1;
  readonly receipts: CoordinationControlGuaranteeReceiptLookupPortV1;
}): CoordinationControlGuaranteeTeamExecutionAdapterPortV1 {
  const controlBinding = validateControlBinding(input?.controlBinding);
  if (!input?.receipts || typeof input.receipts.resolve !== "function")
    throw new TypeError("control guarantee authenticated receipt lookup is required");
  return Object.freeze({
    async evidence(
      request: Parameters<
        CoordinationControlGuaranteeTeamExecutionAdapterPortV1["evidence"]
      >[0],
    ) {
      if (
        !request ||
        !/^sha256:[0-9a-f]{64}$/u.test(request.proposalDigest) ||
        !Number.isSafeInteger(request.logicalTimeMs) ||
        request.logicalTimeMs < 0
      )
        throw new TypeError("control guarantee evidence request is invalid");
      let authenticated: AuthenticatedCoordinationControlGuaranteeReceiptV1 | null;
      try {
        authenticated = await input.receipts.resolve({
          proposalDigest: request.proposalDigest,
          controlBinding,
          logicalTimeMs: request.logicalTimeMs,
        });
      } catch {
        return null;
      }
      if (!authenticated) return null;
      let proposal: CoordinationControlGuaranteeProposalV1;
      let receipt: CoordinationControlGuaranteeExecutionReceiptV1;
      try {
        proposal = validateCoordinationControlGuaranteeProposalV1(
          authenticated.proposal,
        );
        receipt = validateCoordinationControlGuaranteeExecutionReceiptV1(
          authenticated.receipt,
        );
      } catch {
        return null;
      }
      if (
        proposal.proposalDigest !== request.proposalDigest ||
        !executionReceiptMatchesProposal(receipt, proposal) ||
        !sameControlBinding(receipt.controlBinding, controlBinding) ||
        request.logicalTimeMs < receipt.deliveredAtLogicalMs ||
        request.logicalTimeMs >= proposal.expiresAtLogicalMs
      )
        return null;
      return createTeamExecutionControlEvidenceV1({
        schemaVersion: 1,
        ...controlBinding,
        disposition: proposal.disposition === "allow" ? "allow" : "deny",
        reasonCode: proposal.reasonCodes[0]!,
        sourceEvidenceDigest: receipt.receiptDigest,
        evaluatedAtLogicalMs: receipt.deliveredAtLogicalMs,
        validUntilLogicalMs: proposal.expiresAtLogicalMs,
      });
    },
  });
}

/** Security-preserving compatibility name; this now configures a trusted port. */
export const adaptGuaranteeProposalToTeamExecutionControlV1 =
  createAuthenticatedGuaranteeTeamExecutionControlPortV1;

function validateControlBinding(
  input: CoordinationControlGuaranteeExecutionControlBindingV1 | undefined,
): CoordinationControlGuaranteeExecutionControlBindingV1 {
  if (
    !input ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(input.controlId) ||
    !Number.isSafeInteger(input.controlVersion) ||
    input.controlVersion < 1 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(input.implementationId)
  )
    throw new TypeError("control guarantee execution control binding is invalid");
  return Object.freeze({ ...input });
}

function sameControlBinding(
  left: CoordinationControlGuaranteeExecutionControlBindingV1,
  right: CoordinationControlGuaranteeExecutionControlBindingV1,
): boolean {
  return (
    left.controlId === right.controlId &&
    left.controlVersion === right.controlVersion &&
    left.implementationId === right.implementationId
  );
}

/**
 * Binds a portable planning work target to a control target without exposing
 * planning content. The caller supplies the policy thresholds and assumptions.
 */
export function createPlanningWorkControlTargetV1(input: {
  readonly workTarget: PlanningWorkTargetV1;
  readonly scope: CoordinationControlScopeV1;
  readonly targetId: string;
  readonly planningId: string;
  readonly planningRecordDigest: PlanningDigestV1;
  readonly plannedHorizonMs: number;
  readonly minimumAlignmentBps: number;
  readonly minimumCoherenceBps: number;
  readonly minimumAgilityBps: number;
  readonly minimumConfidenceBps: number;
  readonly maximumRiskBps: number;
  readonly maximumUncertaintyBps: number;
  readonly requiredContextAssumptionDigests: readonly PlanningDigestV1[];
  readonly requiredThreatAssumptionDigests: readonly PlanningDigestV1[];
  readonly requiredCheckpointDigests: readonly PlanningDigestV1[];
  readonly requiredActions: CoordinationControlTargetV1["requiredActions"];
  readonly issuedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
}): CoordinationControlTargetV1 {
  if (
    !input.workTarget ||
    input.workTarget.schemaVersion !== 1 ||
    input.workTarget.workItemId !== input.scope.workItemId
  ) throw new TypeError("planning work target is outside the control scope");
  return createCoordinationControlTargetV1({
    schemaVersion: 1,
    targetId: input.targetId,
    scope: input.scope,
    planningId: input.planningId,
    planningRevision: input.workTarget.workItemRevision,
    planningRecordDigest: input.planningRecordDigest,
    plannedHorizonMs: input.plannedHorizonMs,
    minimumAlignmentBps: input.minimumAlignmentBps,
    minimumCoherenceBps: input.minimumCoherenceBps,
    minimumAgilityBps: input.minimumAgilityBps,
    minimumConfidenceBps: input.minimumConfidenceBps,
    maximumRiskBps: input.maximumRiskBps,
    maximumUncertaintyBps: input.maximumUncertaintyBps,
    requiredContextAssumptionDigests: input.requiredContextAssumptionDigests,
    requiredThreatAssumptionDigests: input.requiredThreatAssumptionDigests,
    requiredCheckpointDigests: input.requiredCheckpointDigests,
    requiredActions: input.requiredActions,
    issuedAtLogicalMs: input.issuedAtLogicalMs,
    validUntilLogicalMs: input.validUntilLogicalMs,
  });
}
