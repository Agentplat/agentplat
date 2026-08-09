import {
  createMeshSigningDocument,
  type VerifiedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  CollectivePeerHostAdmissionV1,
  CollectivePeerHostAdmissionClaimV1,
  CollectivePeerHostDispatchV1,
  CollectivePeerHostLimitsV1,
  CollectivePeerHostRoutePortV1,
} from "./host-contracts.js";

export const DEFAULT_COLLECTIVE_PEER_HOST_LIMITS_V1: CollectivePeerHostLimitsV1 =
  Object.freeze({
    maximumPendingPerRoute: 128,
    maximumDrainSteps: 64,
    maximumConcurrentDispatches: 1,
  });

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function assertHostIdentifierV1(value: unknown, name: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value))
    throw new TypeError(`${name} must be a non-empty host identifier`);
  return value;
}

export function normalizeHostLimitsV1(
  limits: Partial<CollectivePeerHostLimitsV1> | undefined,
): CollectivePeerHostLimitsV1 {
  const candidate = { ...DEFAULT_COLLECTIVE_PEER_HOST_LIMITS_V1, ...limits };
  for (const [name, value] of Object.entries(candidate)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`${name} must be a positive safe integer`);
  }
  return Object.freeze(candidate);
}

export function assertHostRoutePortV1(
  value: unknown,
): asserts value is CollectivePeerHostRoutePortV1 {
  const port = value as CollectivePeerHostRoutePortV1 | null;
  if (
    !port ||
    typeof port !== "object" ||
    !port.route ||
    typeof port.admit !== "function" ||
    typeof port.dispatch !== "function" ||
    typeof port.pending !== "function"
  )
    throw new TypeError("host route port is invalid");
  assertHostIdentifierV1(port.route.routeId, "route.routeId");
  if (port.route.kind !== "node" && port.route.kind !== "exchange")
    throw new TypeError("route.kind is invalid");
  if (port.route.kind === "node" && port.route.criticalExtension !== null)
    throw new TypeError("node route cannot declare a critical extension");
  if (port.route.kind === "exchange")
    assertHostIdentifierV1(
      port.route.criticalExtension,
      "exchange route criticalExtension",
    );
}

export function assertAdmissionClaimV1(
  claim: CollectivePeerHostAdmissionClaimV1,
): CollectivePeerHostAdmissionClaimV1 {
  if (!claim || typeof claim !== "object")
    throw new TypeError("host admission claim is invalid");
  assertHostIdentifierV1(claim.messageId, "claim.messageId");
  assertHostIdentifierV1(claim.routeId, "claim.routeId");
  if (
    typeof claim.envelopeIdentityDigest !== "string" ||
    !DIGEST.test(claim.envelopeIdentityDigest) ||
    (claim.status !== "claimed" && claim.status !== "admitted") ||
    typeof claim.claimedAt !== "string" ||
    !claim.claimedAt ||
    (claim.admittedAt !== null &&
      (typeof claim.admittedAt !== "string" || !claim.admittedAt)) ||
    (claim.status === "claimed" && claim.admittedAt !== null) ||
    (claim.status === "admitted" && claim.admittedAt === null)
  )
    throw new TypeError("host admission claim is invalid");
  return claim;
}

export function assertVerifiedEnvelopeShapeV1(
  envelope: VerifiedMeshEnvelope,
): VerifiedMeshEnvelope {
  const candidate = envelope as unknown as Record<string, unknown>;
  if (
    !candidate ||
    typeof candidate.messageId !== "string" ||
    !IDENTIFIER.test(candidate.messageId) ||
    typeof candidate.type !== "string" ||
    !candidate.sender ||
    typeof candidate.payload !== "object" ||
    typeof candidate.payloadHash !== "string" ||
    !candidate.proof ||
    typeof candidate.proof !== "object"
  )
    throw new TypeError("verified envelope has an invalid host shape");
  if (
    candidate.criticalExtensions !== undefined &&
    (!Array.isArray(candidate.criticalExtensions) ||
      candidate.criticalExtensions.some((item) => typeof item !== "string"))
  )
    throw new TypeError("verified envelope has invalid critical extensions");
  return envelope;
}

/** Binds the durable claim to every signed semantic field, including payloadHash. */
export function digestVerifiedMeshEnvelopeIdentityV1(
  envelope: VerifiedMeshEnvelope,
): PlanningDigestV1 {
  const verified = assertVerifiedEnvelopeShapeV1(envelope);
  return digestPlanningJsonV1(
    "collective-peer-host-envelope",
    createMeshSigningDocument(verified) as unknown as PlanningJson,
  );
}

export function assertDurableAdmissionV1(
  outcome: CollectivePeerHostAdmissionV1,
): CollectivePeerHostAdmissionV1 {
  if (!outcome || typeof outcome !== "object")
    throw new TypeError("route admission outcome is invalid");
  if (
    !["accepted", "duplicate", "rejected"].includes(outcome.status) ||
    typeof outcome.durable !== "boolean" ||
    (outcome.reasonCode !== null && typeof outcome.reasonCode !== "string")
  )
    throw new TypeError("route admission outcome is invalid");
  return outcome;
}

export function assertDispatchOutcomeV1(
  outcome: CollectivePeerHostDispatchV1,
): CollectivePeerHostDispatchV1 {
  if (!outcome || typeof outcome !== "object")
    throw new TypeError("route dispatch outcome is invalid");
  if (
    !["dispatched", "idle", "paused", "failed"].includes(outcome.status) ||
    (outcome.reasonCode !== null && typeof outcome.reasonCode !== "string")
  )
    throw new TypeError("route dispatch outcome is invalid");
  return outcome;
}
