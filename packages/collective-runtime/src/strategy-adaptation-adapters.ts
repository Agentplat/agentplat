import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  LocalStrategyDefinitionV1,
  LocalStrategySafetyDimensionV1,
  LocalStrategySafetyDispositionV1,
  LocalStrategySafetySignalSourceV1,
  LocalStrategySafetySignalV1,
  LocalStrategySelectionRequestV1,
} from "./strategy-adaptation-contracts.js";
import {
  createLocalStrategySafetySignalV1,
  validateLocalStrategyDefinitionV1,
  validateLocalStrategySelectionRequestV1,
} from "./strategy-adaptation-runtime.js";

export interface LocalStrategySafetySignalBindingV1 {
  readonly signalId: string;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface LocalStrategySafetyProjectionInputV1 {
  readonly request: LocalStrategySelectionRequestV1;
  readonly strategy: LocalStrategyDefinitionV1;
  readonly binding: LocalStrategySafetySignalBindingV1;
  readonly reasonCodes?: readonly string[];
}

export function createLocalStrategyTrustSafetySignalV1(
  input: LocalStrategySafetyProjectionInputV1 & {
    readonly trustDisposition:
      "eligible" | "restricted" | "quarantined" | "unavailable";
  },
): LocalStrategySafetySignalV1 {
  return signal(
    input,
    "trust",
    input.trustDisposition === "quarantined"
      ? "ineligible"
      : input.trustDisposition,
    [`trust_${input.trustDisposition}`],
  );
}

export function createLocalStrategyRoleSafetySignalV1(
  input: LocalStrategySafetyProjectionInputV1 & {
    readonly disposition: "allow" | "deny" | "abstain" | "escalate";
    readonly stateStatus:
      "active" | "paused" | "realignment_required" | "denied" | "closed";
    readonly degraded: boolean;
  },
): LocalStrategySafetySignalV1 {
  const disposition: LocalStrategySafetyDispositionV1 =
    input.disposition === "deny" ||
    input.stateStatus === "denied" ||
    input.stateStatus === "closed"
      ? "ineligible"
      : input.disposition !== "allow" || input.stateStatus !== "active"
        ? "unavailable"
        : input.degraded
          ? "restricted"
          : "eligible";
  return signal(input, "role", disposition, [
    `role_${input.stateStatus}`,
    ...(input.degraded ? ["role_degraded"] : []),
  ]);
}

export function createLocalStrategyCapabilitySafetySignalV1(
  input: LocalStrategySafetyProjectionInputV1 & {
    readonly capabilityDisposition:
      "eligible" | "restricted" | "ineligible" | "unavailable";
  },
): LocalStrategySafetySignalV1 {
  return signal(input, "capability_state", input.capabilityDisposition, [
    `capability_state_${input.capabilityDisposition}`,
  ]);
}

export function createLocalStrategyContextIntegritySafetySignalV1(
  input: LocalStrategySafetyProjectionInputV1 & {
    readonly disposition: "allow" | "abstain" | "deny";
    readonly stateStatus: "active" | "degraded" | "paused" | "denied";
    readonly degraded: boolean;
  },
): LocalStrategySafetySignalV1 {
  const disposition: LocalStrategySafetyDispositionV1 =
    input.disposition === "deny" || input.stateStatus === "denied"
      ? "ineligible"
      : input.disposition !== "allow" || input.stateStatus === "paused"
        ? "unavailable"
        : input.degraded || input.stateStatus === "degraded"
          ? "restricted"
          : "eligible";
  return signal(input, "context_integrity", disposition, [
    `context_integrity_${input.stateStatus}`,
  ]);
}

export function createLocalStrategyAuthoritySafetySignalV1(
  input: LocalStrategySafetyProjectionInputV1 & {
    readonly current: boolean;
    readonly authorized: boolean;
  },
): LocalStrategySafetySignalV1 {
  const disposition: LocalStrategySafetyDispositionV1 = !input.authorized
    ? "ineligible"
    : !input.current
      ? "unavailable"
      : "eligible";
  return signal(input, "authority", disposition, [
    !input.authorized
      ? "authority_denied"
      : input.current
        ? "authority_current"
        : "authority_not_current",
  ]);
}

export function createLocalStrategySafetySignalSourceV1(input: {
  readonly dimension: LocalStrategySafetyDimensionV1;
  readonly resolve: (input: {
    readonly request: LocalStrategySelectionRequestV1;
    readonly strategy: LocalStrategyDefinitionV1;
  }) => Promise<LocalStrategySafetySignalV1 | null>;
}): LocalStrategySafetySignalSourceV1 {
  if (!input || typeof input.resolve !== "function")
    throw new TypeError("strategy safety source callback is required");
  return Object.freeze({
    dimension: input.dimension,
    async resolve(value: {
      readonly request: LocalStrategySelectionRequestV1;
      readonly strategy: LocalStrategyDefinitionV1;
    }) {
      const request = validateLocalStrategySelectionRequestV1(value.request);
      const strategy = validateLocalStrategyDefinitionV1(value.strategy);
      if (!request.availableStrategyIds.includes(strategy.strategyId))
        throw new TypeError(
          "strategy safety source received an unavailable strategy",
        );
      const resolved = await input.resolve({ request, strategy });
      if (resolved !== null && resolved.dimension !== input.dimension)
        throw new TypeError(
          "strategy safety source returned the wrong dimension",
        );
      return resolved;
    },
  });
}

function signal(
  input: LocalStrategySafetyProjectionInputV1,
  dimension: LocalStrategySafetyDimensionV1,
  disposition: LocalStrategySafetyDispositionV1,
  defaults: readonly string[],
): LocalStrategySafetySignalV1 {
  const request = validateLocalStrategySelectionRequestV1(input.request);
  const strategy = validateLocalStrategyDefinitionV1(input.strategy);
  if (
    !request.availableStrategyIds.includes(strategy.strategyId) ||
    !strategy.operations.includes(request.operation)
  )
    throw new TypeError("strategy safety projection binding is invalid");
  return createLocalStrategySafetySignalV1({
    schemaVersion: 1,
    signalId: input.binding.signalId,
    requestId: request.requestId,
    requestDigest: request.requestDigest,
    strategyId: strategy.strategyId,
    strategyDigest: strategy.strategyDigest,
    dimension,
    disposition,
    sourceId: input.binding.sourceId,
    sourceVersion: input.binding.sourceVersion,
    sourceImplementationDigest: input.binding.sourceImplementationDigest,
    sourceRevision: input.binding.sourceRevision,
    reasonCodes: [...new Set(input.reasonCodes ?? defaults)].sort(),
    observedAtLogicalMs: input.binding.observedAtLogicalMs,
    expiresAtLogicalMs: input.binding.expiresAtLogicalMs,
  });
}
