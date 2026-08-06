import {
  publishMeshSparseUpdateV2,
  receiveMeshSparseDeliveryV2,
  type MeshSparseDeliveryV2,
  type MeshSparseOverlayDigestV2,
  type MeshSparseOverlayProfileV2,
  type MeshSparsePublishResultV2,
  type MeshSparseReceiveResultV2,
  type MeshSparseRoutingStateV2,
} from "@agentplat/mesh/overlay";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

/** Fixed content-free announcement topic for signed evidence objects. */
export const PEER_STRATEGY_EVIDENCE_GOSSIP_TOPIC_V1 =
  "peer-strategy-evidence.v1" as const;

export interface PeerStrategyEvidenceGossipPolicyV1 {
  readonly maximumFanout: number;
  readonly maximumHops: number;
  readonly maximumLifetimeMs: number;
}

/**
 * Publishes only the digest of an attestation or collective-sync record. The
 * object itself remains available through the caller's authenticated store.
 */
export function publishPeerStrategyEvidenceGossipV1(input: {
  readonly profile: MeshSparseOverlayProfileV2;
  readonly state: MeshSparseRoutingStateV2;
  readonly payloadDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
  readonly lifetimeMs: number;
  readonly policy: PeerStrategyEvidenceGossipPolicyV1;
}): MeshSparsePublishResultV2 {
  const policy = validatePolicy(input.policy, input.profile);
  if (!Number.isSafeInteger(input.logicalTimeMs) || input.logicalTimeMs < 0)
    throw new TypeError("peer_strategy_evidence_gossip_time_invalid");
  if (!Number.isSafeInteger(input.lifetimeMs) || input.lifetimeMs < 1 || input.lifetimeMs > policy.maximumLifetimeMs)
    throw new TypeError("peer_strategy_evidence_gossip_lifetime_invalid");
  return publishMeshSparseUpdateV2({
    schemaVersion: 2,
    profile: input.profile,
    state: input.state,
    topic: PEER_STRATEGY_EVIDENCE_GOSSIP_TOPIC_V1,
    payloadDigest: toMeshSparseDigestV2(input.payloadDigest),
    logicalTime: input.logicalTimeMs,
    lifetime: input.lifetimeMs,
    fanout: policy.maximumFanout,
  });
}

/**
 * Receives and forwards a content-free announcement. A stricter evidence
 * policy can stop forwarding before the overlay's profile hop ceiling.
 */
export function receivePeerStrategyEvidenceGossipV1(input: {
  readonly profile: MeshSparseOverlayProfileV2;
  readonly state: MeshSparseRoutingStateV2;
  readonly delivery: MeshSparseDeliveryV2;
  readonly logicalTimeMs: number;
  readonly policy: PeerStrategyEvidenceGossipPolicyV1;
}): MeshSparseReceiveResultV2 {
  const policy = validatePolicy(input.policy, input.profile);
  if (input.delivery.update.topic !== PEER_STRATEGY_EVIDENCE_GOSSIP_TOPIC_V1)
    throw new TypeError("peer_strategy_evidence_gossip_topic_invalid");
  if (input.delivery.hop > policy.maximumHops)
    throw new TypeError("peer_strategy_evidence_gossip_hop_limit_exceeded");
  const result = receiveMeshSparseDeliveryV2({
    schemaVersion: 2,
    profile: input.profile,
    state: input.state,
    delivery: input.delivery,
    logicalTime: input.logicalTimeMs,
  });
  if (!result.accepted || result.deliveries.length === 0) return result;
  return Object.freeze({
    ...result,
    deliveries: Object.freeze(
      result.deliveries.filter((delivery) => delivery.hop <= policy.maximumHops),
    ),
  }) as MeshSparseReceiveResultV2;
}

/** Converts the same SHA-256 bytes between planning and sparse-overlay forms. */
export function toMeshSparseDigestV2(digest: PlanningDigestV1): MeshSparseOverlayDigestV2 {
  if (typeof digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(digest))
    throw new TypeError("peer_strategy_evidence_payload_digest_invalid");
  const bytes = new Uint8Array(
    digest.slice(7).match(/.{2}/gu)!.map((part) => Number.parseInt(part, 16)),
  );
  return `sha256:${base64url(bytes)}` as MeshSparseOverlayDigestV2;
}

/** Restores the planning digest representation from a received overlay update. */
export function fromMeshSparseDigestV2(digest: MeshSparseOverlayDigestV2): PlanningDigestV1 {
  if (typeof digest !== "string" || !/^sha256:[A-Za-z0-9_-]{43}$/u.test(digest))
    throw new TypeError("peer_strategy_evidence_overlay_digest_invalid");
  const bytes = base64urlBytes(digest.slice(7));
  if (!bytes || bytes.length !== 32)
    throw new TypeError("peer_strategy_evidence_overlay_digest_invalid");
  return `sha256:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as PlanningDigestV1;
}

function validatePolicy(
  policy: PeerStrategyEvidenceGossipPolicyV1,
  profile: MeshSparseOverlayProfileV2,
): PeerStrategyEvidenceGossipPolicyV1 {
  if (
    !policy ||
    !Number.isSafeInteger(policy.maximumFanout) ||
    policy.maximumFanout < 1 ||
    policy.maximumFanout > profile.maximumFanout ||
    !Number.isSafeInteger(policy.maximumHops) ||
    policy.maximumHops < 1 ||
    policy.maximumHops > profile.maximumHops ||
    !Number.isSafeInteger(policy.maximumLifetimeMs) ||
    policy.maximumLifetimeMs < 1 ||
    policy.maximumLifetimeMs > 86_400_000
  )
    throw new TypeError("peer_strategy_evidence_gossip_policy_invalid");
  return policy;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=/gu, "");
}

function base64urlBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (entry) => entry.charCodeAt(0));
  } catch {
    return null;
  }
}
