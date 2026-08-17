import type { CollectiveMembershipConfigurationV1 } from "./contracts.js";
import { collectiveMembershipDigestV1 } from "./crypto.js";

/** A deterministic coordinator assignment for one membership epoch. */
export interface CollectiveCoordinatorAssignmentV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly epoch: number;
  readonly membershipConfigurationDigest: `sha256:${string}`;
  readonly coordinatorPeerId: string;
  readonly term: number;
  readonly assignmentDigest: `sha256:${string}`;
}

export type CollectiveCoordinatorTransitionReasonV1 =
  | "initial_assignment"
  | "replacement"
  | "unhealthy"
  | "capacity_change";

export interface CollectiveCoordinatorTransitionEvidenceV1 {
  readonly voterPeerIds: readonly string[];
  readonly quorumThreshold: number;
  readonly evidenceDigest: `sha256:${string}`;
}

export interface CollectiveCoordinatorTransitionV1 {
  readonly schemaVersion: 1;
  readonly from: CollectiveCoordinatorAssignmentV1 | null;
  readonly to: CollectiveCoordinatorAssignmentV1;
  readonly reason: CollectiveCoordinatorTransitionReasonV1;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly evidence: CollectiveCoordinatorTransitionEvidenceV1;
  readonly transitionDigest: `sha256:${string}`;
}

export interface ElectCollectiveCoordinatorInputV1 {
  readonly membership: CollectiveMembershipConfigurationV1;
  readonly previous: CollectiveCoordinatorAssignmentV1 | null;
  readonly strategyId?: string;
  readonly strategyVersion?: string;
  readonly term?: number;
  readonly reason?: CollectiveCoordinatorTransitionReasonV1;
  readonly eligiblePeerIds?: readonly string[];
  readonly voterPeerIds?: readonly string[];
}

/**
 * Selects the coordinator by hashing the immutable epoch and candidate id,
 * then choosing the lowest score. This avoids local clock/randomness and is
 * reproducible on every node. The previous coordinator is excluded for
 * replacement unless it is the only eligible member.
 */
export async function electCollectiveCoordinatorV1(
  input: ElectCollectiveCoordinatorInputV1,
  injectedCrypto?: Crypto,
): Promise<CollectiveCoordinatorTransitionV1> {
  const strategyId = input.strategyId ?? "deterministic-min-hash";
  const strategyVersion = input.strategyVersion ?? "1";
  const reason = input.reason ?? (input.previous ? "replacement" : "initial_assignment");
  const members = input.membership.members.map(({ peerId }) => peerId);
  const eligible = [...new Set(input.eligiblePeerIds ?? members)].filter((peerId) =>
    members.includes(peerId),
  ).sort();
  if (eligible.length === 0) throw new TypeError("coordinator_candidates_empty");
  const previousPeerId = input.previous?.coordinatorPeerId;
  const pool = eligible.length > 1 && previousPeerId
    ? eligible.filter((peerId) => peerId !== previousPeerId)
    : eligible;
  const scored = await Promise.all(pool.map(async (peerId) => ({
    peerId,
    score: await collectiveMembershipDigestV1({
      domain: "coordinator-election",
      strategyId,
      strategyVersion,
      epoch: input.membership.epoch,
      membershipConfigurationDigest: input.membership.configurationDigest,
      peerId,
    }, injectedCrypto),
  })));
  scored.sort((a, b) => a.score.localeCompare(b.score) || a.peerId.localeCompare(b.peerId));
  const coordinatorPeerId = scored[0]!.peerId;
  const term = input.term ?? ((input.previous?.term ?? 0) + 1);
  const assignmentSeed = {
    schemaVersion: 1 as const,
    tenantId: input.membership.tenantId,
    meshId: input.membership.meshId,
    policyDomainId: input.membership.policyDomainId,
    epoch: input.membership.epoch,
    membershipConfigurationDigest: input.membership.configurationDigest as `sha256:${string}`,
    coordinatorPeerId,
    term,
  };
  const assignmentDigest = await collectiveMembershipDigestV1(assignmentSeed, injectedCrypto) as `sha256:${string}`;
  const to: CollectiveCoordinatorAssignmentV1 = { ...assignmentSeed, assignmentDigest };
  if (input.previous &&
    (input.previous.epoch > to.epoch ||
      (input.previous.epoch === to.epoch && input.previous.term >= to.term) ||
      input.previous.tenantId !== to.tenantId))
    throw new TypeError("coordinator_previous_assignment_scope_invalid");
  const voterPeerIds = [...new Set(input.voterPeerIds ?? members)].filter((peerId) => members.includes(peerId)).sort();
  const quorumThreshold = input.membership.quorumThreshold;
  if (voterPeerIds.length < quorumThreshold) throw new TypeError("coordinator_quorum_insufficient");
  const evidenceSeed = { voterPeerIds, quorumThreshold, assignmentDigest };
  const evidenceDigest = await collectiveMembershipDigestV1(evidenceSeed, injectedCrypto) as `sha256:${string}`;
  const evidence = { ...evidenceSeed, evidenceDigest };
  const transitionSeed = { schemaVersion: 1 as const, from: input.previous, to, reason, strategyId, strategyVersion, evidence };
  const transitionDigest = await collectiveMembershipDigestV1(transitionSeed, injectedCrypto) as `sha256:${string}`;
  return { ...transitionSeed, transitionDigest };
}

export async function verifyCollectiveCoordinatorTransitionV1(
  transition: CollectiveCoordinatorTransitionV1,
  injectedCrypto?: Crypto,
): Promise<boolean> {
  if (!transition || transition.schemaVersion !== 1 || !transition.to?.assignmentDigest) return false;
  const { assignmentDigest, ...assignmentSeed } = transition.to;
  if (await collectiveMembershipDigestV1(assignmentSeed, injectedCrypto) !== assignmentDigest) return false;
  const { evidenceDigest, ...evidenceSeed } = transition.evidence;
  if (await collectiveMembershipDigestV1(evidenceSeed, injectedCrypto) !== evidenceDigest) return false;
  const { transitionDigest, ...transitionSeed } = transition;
  return await collectiveMembershipDigestV1(transitionSeed, injectedCrypto) === transitionDigest;
}
