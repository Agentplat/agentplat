import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  CapabilityStateCandidateV1,
  CapabilityStateDispositionV1,
  CapabilityStateFusionRequestV1,
  CapabilityStateSignalSourceV1,
  CapabilityStateSignalV1,
} from "./capability-state-contracts.js";
import {
  createCapabilityStateSignalV1,
  validateCapabilityStateCandidateV1,
  validateCapabilityStateFusionRequestV1,
} from "./capability-state-runtime.js";

export interface CapabilityStateSignalBindingV1 {
  readonly signalId: string;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface CapabilityStateSignalFactoryInputV1 {
  readonly candidate: CapabilityStateCandidateV1;
  readonly binding: CapabilityStateSignalBindingV1;
  readonly reasonCodes?: readonly string[];
}

export function createCapabilityStateTrustSignalV1(
  input: CapabilityStateSignalFactoryInputV1 & {
    readonly trustDisposition: CapabilityStateDispositionV1;
  },
): CapabilityStateSignalV1 {
  return signal(input, "trust", input.trustDisposition, [
    `trust_${input.trustDisposition}`,
  ]);
}

export function createCapabilityStateRoleSignalV1(
  input: CapabilityStateSignalFactoryInputV1 & {
    readonly roleStatus:
      | "active"
      | "paused"
      | "realignment_required"
      | "denied"
      | "closed"
      | "unavailable";
    readonly degraded: boolean;
  },
): CapabilityStateSignalV1 {
  let disposition: CapabilityStateDispositionV1;
  if (input.roleStatus === "denied" || input.roleStatus === "closed")
    disposition = "ineligible";
  else if (
    input.roleStatus === "paused" ||
    input.roleStatus === "realignment_required" ||
    input.roleStatus === "unavailable"
  )
    disposition = "unavailable";
  else disposition = input.degraded ? "restricted" : "eligible";
  return signal(input, "role", disposition, [
    `role_${input.roleStatus}`,
    ...(input.degraded ? ["role_degraded"] : []),
  ]);
}

export function createCapabilityStateCapacitySignalV1(
  input: CapabilityStateSignalFactoryInputV1 & {
    readonly activeAssignments: number;
    readonly maximumConcurrency: number;
    readonly acceptingWork: boolean;
  },
): CapabilityStateSignalV1 {
  integer(input.activeAssignments, "activeAssignments", 0);
  integer(input.maximumConcurrency, "maximumConcurrency", 1);
  const disposition: CapabilityStateDispositionV1 = !input.acceptingWork
    ? "ineligible"
    : input.activeAssignments >= input.maximumConcurrency
      ? "ineligible"
      : "eligible";
  return signal(input, "capacity", disposition, [
    !input.acceptingWork
      ? "capacity_withdrawn"
      : disposition === "ineligible"
        ? "capacity_saturated"
        : "capacity_available",
  ]);
}

export function createCapabilityStateReachabilitySignalV1(
  input: CapabilityStateSignalFactoryInputV1 & {
    readonly routeStatus: "active" | "reserve" | "unreachable" | "unavailable";
  },
): CapabilityStateSignalV1 {
  const disposition: CapabilityStateDispositionV1 =
    input.routeStatus === "active" || input.routeStatus === "reserve"
      ? "eligible"
      : input.routeStatus === "unreachable"
        ? "ineligible"
        : "unavailable";
  return signal(input, "reachability", disposition, [
    `route_${input.routeStatus}`,
  ]);
}

export function createCapabilityStateRecoverySignalV1(
  input: CapabilityStateSignalFactoryInputV1 & {
    readonly recoveryStatus: "ready" | "not_required" | "unavailable";
  },
): CapabilityStateSignalV1 {
  return signal(
    input,
    "recovery",
    input.recoveryStatus === "unavailable" ? "unavailable" : "eligible",
    [`recovery_${input.recoveryStatus}`],
  );
}

/**
 * Adapts a local projection callback to one strict dimension source. The
 * callback sees only the already-bounded request and candidate.
 */
export function createCapabilityStateSignalSourceV1(input: {
  readonly dimension: CapabilityStateSignalSourceV1["dimension"];
  readonly resolve: (input: {
    readonly request: CapabilityStateFusionRequestV1;
    readonly candidate: CapabilityStateCandidateV1;
  }) => Promise<CapabilityStateSignalV1 | null>;
}): CapabilityStateSignalSourceV1 {
  if (!input || typeof input.resolve !== "function")
    throw new TypeError("capability state source callback is required");
  return Object.freeze({
    dimension: input.dimension,
    async resolve(value: {
      readonly request: CapabilityStateFusionRequestV1;
      readonly candidate: CapabilityStateCandidateV1;
    }) {
      const request = validateCapabilityStateFusionRequestV1(value.request);
      const candidate = validateCapabilityStateCandidateV1(value.candidate);
      if (
        !request.candidates.some(
          (current) =>
            current.candidateId === candidate.candidateId &&
            current.candidateDigest === candidate.candidateDigest,
        )
      )
        throw new TypeError(
          "capability state source candidate is outside request",
        );
      const resolved = await input.resolve({ request, candidate });
      if (resolved !== null && resolved.dimension !== input.dimension)
        throw new TypeError(
          "capability state source returned the wrong dimension",
        );
      return resolved;
    },
  });
}

function signal(
  input: CapabilityStateSignalFactoryInputV1,
  dimension: CapabilityStateSignalV1["dimension"],
  disposition: CapabilityStateDispositionV1,
  defaultReasons: readonly string[],
): CapabilityStateSignalV1 {
  const candidate = validateCapabilityStateCandidateV1(input.candidate);
  const reasons = [...new Set(input.reasonCodes ?? defaultReasons)].sort();
  return createCapabilityStateSignalV1({
    schemaVersion: 1,
    signalId: input.binding.signalId,
    candidateId: candidate.candidateId,
    candidateDigest: candidate.candidateDigest,
    dimension,
    disposition,
    sourceId: input.binding.sourceId,
    sourceVersion: input.binding.sourceVersion,
    sourceImplementationDigest: input.binding.sourceImplementationDigest,
    sourceRevision: input.binding.sourceRevision,
    reasonCodes: reasons,
    observedAtLogicalMs: input.binding.observedAtLogicalMs,
    expiresAtLogicalMs: input.binding.expiresAtLogicalMs,
  });
}

function integer(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new TypeError(`${label} is invalid`);
}
