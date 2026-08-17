import type {
  InferenceControlPolicyV1,
  PolicyRecordV1,
  ContextZoneV1,
  ActionPatternV1,
} from '@agentplat/inference-control';
import {
  createPolicyRecordV1,
  validateInferenceControlPolicyV1,
} from '@agentplat/inference-control';
import type { CollectiveDecisionV1 } from './collective-decision-contracts.js';
import { validateCollectiveDecisionV1 } from './collective-decision-validation.js';

/**
 * The only authority that may enlarge a local policy is a separately reviewed
 * policy deployment. A collective decision can therefore only project a
 * narrower policy, never mint capabilities from its payload.
 */
export interface CollectiveInferenceAssignmentV1 {
  readonly agentId: string;
  readonly roleId: string;
  readonly authorityGeneration: number;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly leaseExpiresAtLogicalMs: number;
}

export interface CollectiveInferencePolicyRestrictionsV1 {
  readonly allowedContextZones?: readonly ContextZoneV1[];
  readonly allowedActions?: readonly ActionPatternV1[];
  readonly allowedMessageChannels?: readonly string[];
  readonly maximumRunDurationMs?: number;
  readonly maximumGrantTtlMs?: number;
  readonly maximumMessagePermitTtlMs?: number;
  readonly coordinatedActionsRequired?: boolean;
}

export interface CollectiveInferencePolicyProjectionInputV1 {
  readonly decision: CollectiveDecisionV1;
  readonly baseline: PolicyRecordV1;
  readonly assignment: CollectiveInferenceAssignmentV1;
  readonly restrictions?: CollectiveInferencePolicyRestrictionsV1;
  readonly logicalTimeMs: number;
}

export interface CollectiveInferencePolicyProjectionV1 {
  readonly schemaVersion: 1;
  readonly decisionDigest: string;
  readonly policy: PolicyRecordV1;
  readonly assignment: CollectiveInferenceAssignmentV1;
  readonly effectiveFromLogicalMs: number;
  readonly effectiveUntilLogicalMs: number;
}

const intersect = <T>(base: readonly T[], requested: readonly T[]): T[] =>
  base.filter((item) => requested.includes(item));

const actionKey = (action: ActionPatternV1): string =>
  `${action.namespace}:${action.toolId}:${action.operation}:${action.actionBindingId}`;

/** Project a certified collective decision into a fail-closed local policy. */
export function projectCollectiveDecisionToInferencePolicyV1(
  input: CollectiveInferencePolicyProjectionInputV1,
): CollectiveInferencePolicyProjectionV1 {
  const decision = validateCollectiveDecisionV1(input.decision);
  const baseline = validateInferenceControlPolicyV1(input.baseline.policy);
  if (input.baseline.policyDigest !== createPolicyRecordV1(baseline).policyDigest)
    throw new TypeError('baseline_policy_digest_mismatch');
  if (!Number.isSafeInteger(input.logicalTimeMs) || input.logicalTimeMs < 0)
    throw new TypeError('logicalTimeMs is invalid');
  if (decision.expiresAtLogicalMs <= input.logicalTimeMs)
    throw new TypeError('collective_decision_expired');
  const restrictions = input.restrictions ?? {};
  const allowedContextZones = restrictions.allowedContextZones
    ? intersect(baseline.allowedContextZones, restrictions.allowedContextZones)
    : [...baseline.allowedContextZones];
  const allowedActions = restrictions.allowedActions
    ? baseline.allowedActions.filter((action) =>
        restrictions.allowedActions!.some((candidate) => actionKey(candidate) === actionKey(action)),
      )
    : [...baseline.allowedActions];
  const allowedMessageChannels = restrictions.allowedMessageChannels
    ? intersect(baseline.allowedMessageChannels, restrictions.allowedMessageChannels)
    : [...baseline.allowedMessageChannels];
  const policy = {
    ...baseline,
    policyVersion: baseline.policyVersion + 1,
    parentPolicyDigest: input.baseline.policyDigest,
    allowedContextZones,
    allowedActions,
    allowedMessageChannels,
    maximumRunDurationMs: Math.min(
      baseline.maximumRunDurationMs,
      restrictions.maximumRunDurationMs ?? baseline.maximumRunDurationMs,
    ),
    maximumGrantTtlMs: Math.min(
      baseline.maximumGrantTtlMs,
      restrictions.maximumGrantTtlMs ?? baseline.maximumGrantTtlMs,
    ),
    maximumMessagePermitTtlMs: Math.min(
      baseline.maximumMessagePermitTtlMs,
      restrictions.maximumMessagePermitTtlMs ?? baseline.maximumMessagePermitTtlMs,
    ),
    coordinatedActionsRequired: restrictions.coordinatedActionsRequired ?? true,
  } satisfies InferenceControlPolicyV1;
  const record = createPolicyRecordV1(policy);
  return Object.freeze({
    schemaVersion: 1,
    decisionDigest: decision.decisionDigest,
    policy: record,
    assignment: Object.freeze({ ...input.assignment }),
    effectiveFromLogicalMs: input.logicalTimeMs,
    effectiveUntilLogicalMs: Math.min(
      decision.expiresAtLogicalMs,
      input.assignment.leaseExpiresAtLogicalMs,
    ),
  });
}
