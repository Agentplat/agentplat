import type { JsonValue } from "@agentplat/core";
import { deepFreeze, digestTrustJsonV1, TrustValidationError } from "./canonical.js";
import { assertExactKeys, assertIdentifier, assertSafeInteger, assertTrustDigest } from "./validation.js";

/** A bounded, content-bound hop in a propagated message's custody chain. */
export interface PropagationHopV1 {
  readonly hopIndex: number;
  readonly senderId: string;
  readonly receiverId: string;
  readonly previousHopDigest: string | null;
  readonly hopDigest: string;
}

export type PropagationDispositionV1 = "active" | "quarantined" | "blocked";

/**
 * Transport-neutral envelope for content that may cross agent boundaries.
 * The envelope is deliberately independent of a transport or model provider.
 */
export interface PropagatedContentV1 {
  readonly schemaVersion: 1;
  readonly contentDigest: string;
  readonly originId: string;
  readonly originProofDigest: string;
  readonly hops: readonly PropagationHopV1[];
  readonly propagationBudget: number;
  readonly forwardsUsed: number;
  readonly disposition: PropagationDispositionV1;
  readonly quarantineReason: string | null;
}

export interface PropagationPolicyV1 {
  readonly maximumHops: number;
  readonly maximumForwards: number;
  readonly quarantineOnBudgetExhaustion: boolean;
  readonly quarantineOnOriginMismatch: boolean;
  readonly blockQuarantinedForwarding: boolean;
}

export interface PropagationAssessmentV1 {
  readonly allowed: boolean;
  readonly disposition: PropagationDispositionV1;
  readonly reasonCodes: readonly ("origin_invalid" | "hop_invalid" | "budget_exhausted" | "quarantine_active" | "forwarding_blocked")[];
  readonly envelope: PropagatedContentV1;
}

const dispositionValues = ["active", "quarantined", "blocked"] as const;
const digest = (value: JsonValue): string => digestTrustJsonV1("origin-proof", value);
const hopPayload = (hopIndex: number, senderId: string, receiverId: string, previousHopDigest: string | null, contentDigest: string): JsonValue => ({
  schemaVersion: 1, hopIndex, senderId, receiverId, previousHopDigest, contentDigest,
});

function validatePolicy(policy: PropagationPolicyV1): void {
  assertSafeInteger(policy.maximumHops, "maximumHops");
  assertSafeInteger(policy.maximumForwards, "maximumForwards");
  if (policy.maximumHops < 0 || policy.maximumForwards < 0) throw new TrustValidationError("propagation limits must be non-negative");
}

export function propagationHopDigestV1(hop: Omit<PropagationHopV1, "hopDigest"> & { readonly contentDigest: string }): string {
  assertTrustDigest(hop.contentDigest, "contentDigest");
  return digest(hopPayload(hop.hopIndex, hop.senderId, hop.receiverId, hop.previousHopDigest, hop.contentDigest));
}

export function createPropagatedContentV1(input: {
  readonly contentDigest: string;
  readonly originId: string;
  readonly originProofDigest?: string;
  readonly propagationBudget: number;
}): PropagatedContentV1 {
  assertTrustDigest(input.contentDigest, "contentDigest");
  assertIdentifier(input.originId, "originId");
  assertSafeInteger(input.propagationBudget, "propagationBudget");
  if (input.propagationBudget < 0) throw new TrustValidationError("propagationBudget must be non-negative");
  const originProofDigest = input.originProofDigest ?? digest({ schemaVersion: 1, contentDigest: input.contentDigest, originId: input.originId });
  assertTrustDigest(originProofDigest, "originProofDigest");
  return deepFreeze({ schemaVersion: 1, contentDigest: input.contentDigest, originId: input.originId, originProofDigest, hops: [], propagationBudget: input.propagationBudget, forwardsUsed: 0, disposition: "active", quarantineReason: null });
}

export function appendPropagationHopV1(envelope: PropagatedContentV1, senderId: string, receiverId: string, policy: PropagationPolicyV1): PropagationAssessmentV1 {
  validatePropagationEnvelopeV1(envelope); validatePolicy(policy); assertIdentifier(senderId, "senderId"); assertIdentifier(receiverId, "receiverId");
  if (envelope.disposition !== "active" && policy.blockQuarantinedForwarding) return assess(envelope, "forwarding_blocked", "blocked");
  const nextIndex = envelope.hops.length;
  const previous = envelope.hops.at(-1)?.hopDigest ?? null;
  if (nextIndex >= policy.maximumHops || envelope.forwardsUsed >= policy.maximumForwards || envelope.propagationBudget <= 0) {
    const disposition = policy.quarantineOnBudgetExhaustion ? "quarantined" : "blocked";
    return assess({ ...envelope, disposition, quarantineReason: "budget_exhausted" }, "budget_exhausted", disposition);
  }
  const hopBase = { hopIndex: nextIndex, senderId, receiverId, previousHopDigest: previous };
  const hop: PropagationHopV1 = {
    ...hopBase,
    hopDigest: propagationHopDigestV1({ ...hopBase, contentDigest: envelope.contentDigest }),
  };
  const next = { ...envelope, hops: [...envelope.hops, hop], forwardsUsed: envelope.forwardsUsed + 1, propagationBudget: envelope.propagationBudget - 1 };
  return { allowed: true, disposition: "active", reasonCodes: [], envelope: deepFreeze(next) };
}

export function assessPropagationV1(envelope: PropagatedContentV1, policy: PropagationPolicyV1): PropagationAssessmentV1 {
  validatePropagationEnvelopeV1(envelope); validatePolicy(policy);
  if (envelope.disposition !== "active") return assess(envelope, envelope.disposition === "blocked" ? "forwarding_blocked" : "quarantine_active", envelope.disposition);
  if (envelope.hops.length > policy.maximumHops || envelope.forwardsUsed > policy.maximumForwards || envelope.propagationBudget < 0) return assess(envelope, "budget_exhausted", policy.quarantineOnBudgetExhaustion ? "quarantined" : "blocked");
  return { allowed: true, disposition: "active", reasonCodes: [], envelope };
}

export const canForwardPropagatedContentV1 = (envelope: PropagatedContentV1, policy: PropagationPolicyV1): boolean => assessPropagationV1(envelope, policy).allowed;

function assess(envelope: PropagatedContentV1, reason: PropagationAssessmentV1["reasonCodes"][number], disposition: PropagationDispositionV1): PropagationAssessmentV1 {
  return { allowed: false, disposition, reasonCodes: [reason], envelope: deepFreeze(envelope) };
}

export function validatePropagationEnvelopeV1(value: unknown): asserts value is PropagatedContentV1 {
  assertExactKeys(value, ["schemaVersion", "contentDigest", "originId", "originProofDigest", "hops", "propagationBudget", "forwardsUsed", "disposition", "quarantineReason"], "propagation envelope");
  const envelope = value as unknown as PropagatedContentV1;
  if (envelope.schemaVersion !== 1 || !dispositionValues.includes(envelope.disposition)) throw new TrustValidationError("propagation envelope is invalid");
  assertTrustDigest(envelope.contentDigest, "contentDigest"); assertTrustDigest(envelope.originProofDigest, "originProofDigest"); assertIdentifier(envelope.originId, "originId");
  assertSafeInteger(envelope.propagationBudget, "propagationBudget"); assertSafeInteger(envelope.forwardsUsed, "forwardsUsed");
  if (envelope.propagationBudget < 0 || envelope.forwardsUsed < 0 || !Array.isArray(envelope.hops)) throw new TrustValidationError("propagation counters are invalid");
  let previous: string | null = null;
  envelope.hops.forEach((candidate, index) => {
    const hop = candidate as PropagationHopV1;
    assertExactKeys(hop, ["hopIndex", "senderId", "receiverId", "previousHopDigest", "hopDigest"], "propagation hop");
    if (hop.hopIndex !== index || hop.previousHopDigest !== previous) throw new TrustValidationError("propagation hop chain is invalid");
    assertIdentifier(hop.senderId, "hop senderId"); assertIdentifier(hop.receiverId, "hop receiverId"); assertTrustDigest(hop.hopDigest, "hopDigest");
    if (propagationHopDigestV1({ hopIndex: hop.hopIndex, senderId: hop.senderId, receiverId: hop.receiverId, previousHopDigest: hop.previousHopDigest, contentDigest: envelope.contentDigest }) !== hop.hopDigest) throw new TrustValidationError("propagation hop digest is invalid");
    previous = hop.hopDigest;
  });
}
