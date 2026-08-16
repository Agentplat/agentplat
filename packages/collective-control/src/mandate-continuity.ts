import type { JsonValue } from "@agentplat/core";
import { deepFreezeCollective, digestCollectiveJsonV1 } from "./canonical.js";
import type { CollectiveDigestV1, DelegationMandateV1 } from "./contracts.js";
import {
  assertCollectiveDigest,
  assertCollectiveExactKeys,
  assertCollectiveIdentifier,
  assertCollectiveSafeInteger,
  assertCollectiveTimestamp,
  CollectiveControlValidationError,
  validateDelegationMandateV1,
} from "./validation.js";

export type MandateContinuityTransitionKindV1 = "renewal" | "attenuation";

/** A signed-chain-independent receipt linking two consecutive mandates. */
export interface MandateContinuityTransitionV1 {
  readonly schemaVersion: 1;
  readonly transitionId: string;
  readonly kind: MandateContinuityTransitionKindV1;
  readonly mandateId: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly predecessorRevision: number;
  readonly predecessorDigest: CollectiveDigestV1;
  readonly successorRevision: number;
  readonly successorDigest: CollectiveDigestV1;
  readonly epoch: number;
  readonly requestedAt: string;
  readonly reasonCode: string;
  readonly transitionDigest: CollectiveDigestV1;
}

function body(input: Omit<MandateContinuityTransitionV1, "transitionDigest">) {
  return input as unknown as JsonValue;
}

export function mandateContinuityTransitionDigestV1(
  input: Omit<MandateContinuityTransitionV1, "transitionDigest">,
): CollectiveDigestV1 {
  return digestCollectiveJsonV1("mission", body(input));
}

export function createMandateContinuityTransitionV1(input: {
  readonly transitionId: string;
  readonly kind: MandateContinuityTransitionKindV1;
  readonly predecessor: DelegationMandateV1;
  readonly successor: DelegationMandateV1;
  readonly epoch: number;
  readonly requestedAt: string;
  readonly reasonCode: string;
}): MandateContinuityTransitionV1 {
  const predecessor = validateDelegationMandateV1(input.predecessor);
  const successor = validateDelegationMandateV1(input.successor);
  assertCollectiveIdentifier(input.transitionId, "transitionId");
  assertCollectiveSafeInteger(input.epoch, "epoch", 1);
  assertCollectiveTimestamp(input.requestedAt, "requestedAt");
  assertCollectiveIdentifier(input.reasonCode, "reasonCode");
  validateContinuityPair(input.kind, predecessor, successor);
  const base = {
    schemaVersion: 1 as const,
    transitionId: input.transitionId,
    kind: input.kind,
    mandateId: predecessor.statement.mandateId,
    tenantId: predecessor.statement.tenantId,
    policyDomainId: predecessor.statement.policyDomainId,
    predecessorRevision: predecessor.statement.revision,
    predecessorDigest: predecessor.mandateDigest,
    successorRevision: successor.statement.revision,
    successorDigest: successor.mandateDigest,
    epoch: input.epoch,
    requestedAt: input.requestedAt,
    reasonCode: input.reasonCode,
  };
  return deepFreezeCollective({
    ...base,
    transitionDigest: mandateContinuityTransitionDigestV1(base),
  });
}

export function validateMandateContinuityTransitionV1(
  value: unknown,
): MandateContinuityTransitionV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion", "transitionId", "kind", "mandateId", "tenantId",
      "policyDomainId", "predecessorRevision", "predecessorDigest",
      "successorRevision", "successorDigest", "epoch", "requestedAt",
      "reasonCode", "transitionDigest",
    ],
    "mandate continuity transition",
  );
  const candidate = value as unknown as MandateContinuityTransitionV1;
  if (candidate.schemaVersion !== 1 || (candidate.kind !== "renewal" && candidate.kind !== "attenuation"))
    throw new CollectiveControlValidationError("mandate continuity transition is invalid");
  for (const key of ["transitionId", "mandateId", "tenantId", "policyDomainId", "reasonCode"] as const)
    assertCollectiveIdentifier(candidate[key], key);
  for (const key of ["predecessorDigest", "successorDigest", "transitionDigest"] as const)
    assertCollectiveDigest(candidate[key], key);
  for (const key of ["predecessorRevision", "successorRevision", "epoch"] as const)
    assertCollectiveSafeInteger(candidate[key], key, 1);
  assertCollectiveTimestamp(candidate.requestedAt, "requestedAt");
  if (candidate.successorRevision !== candidate.predecessorRevision + 1)
    throw new CollectiveControlValidationError("mandate revisions must advance exactly once");
  const { transitionDigest: _ignored, ...transitionBody } = candidate;
  if (candidate.transitionDigest !== mandateContinuityTransitionDigestV1(transitionBody))
    throw new CollectiveControlValidationError("mandate continuity transition digest is invalid");
  return deepFreezeCollective(candidate);
}

function validateContinuityPair(
  kind: MandateContinuityTransitionKindV1,
  predecessor: DelegationMandateV1,
  successor: DelegationMandateV1,
): void {
  const before = predecessor.statement;
  const after = successor.statement;
  if (after.mandateId !== before.mandateId || after.tenantId !== before.tenantId || after.policyDomainId !== before.policyDomainId || after.issuerId !== before.issuerId)
    throw new CollectiveControlValidationError("mandate continuity scope changed");
  if (after.revision !== before.revision + 1 || after.predecessorDigest !== predecessor.mandateDigest)
    throw new CollectiveControlValidationError("mandate successor lineage is invalid");
  if (kind === "renewal" && Date.parse(after.validUntil) <= Date.parse(before.validUntil))
    throw new CollectiveControlValidationError("renewal must extend validity");
  if (kind === "attenuation") {
    const actionKey = (action: (typeof before.permittedActions)[number]) => `${action.namespace}\0${action.toolId}\0${action.operation}`;
    const beforeActions = new Set(before.permittedActions.map(actionKey));
    if (Date.parse(after.validUntil) > Date.parse(before.validUntil) || after.subjectPeerIds.some((id) => !before.subjectPeerIds.includes(id)) || after.permittedCapabilityKeys.some((key) => !before.permittedCapabilityKeys.includes(key)) || after.permittedActions.some((action) => !beforeActions.has(actionKey(action))) || after.work.workItemIds.some((id) => !before.work.workItemIds.includes(id)) || after.work.permittedRoleKeys.some((key) => !before.work.permittedRoleKeys.includes(key)) || after.work.maximumWorkItemRevision > before.work.maximumWorkItemRevision || after.budget.totalBudgetUnits > before.budget.totalBudgetUnits || after.budget.maximumActionBudgetUnits > before.budget.maximumActionBudgetUnits || after.budget.maximumWorkBudgetUnits > before.budget.maximumWorkBudgetUnits || after.budget.maximumConcurrentWorkReservations > before.budget.maximumConcurrentWorkReservations || after.budget.maximumConcurrentActionReservations > before.budget.maximumConcurrentActionReservations || after.budget.reservationLifetimeMs > before.budget.reservationLifetimeMs)
      throw new CollectiveControlValidationError("attenuation widened mandate scope or budget");
  }
}
