import { compareMeshTimestamps } from "@agentplat/mesh-protocol";
import type {
  CollectiveMembershipChangeV1,
  CollectiveMembershipConfigurationV1,
  CollectiveMembershipKeyProofV1,
  CollectiveMembershipKeyV1,
  CollectiveMembershipMemberV1,
  CollectiveMembershipTransitionProposalV1,
} from "./contracts.js";
import {
  validateCollectiveMembershipConfigurationV1,
  validateCollectiveMembershipTransitionProposalV1,
} from "./codec.js";
import {
  collectiveMembershipDigestV1,
  importCollectiveMembershipPublicKeyV1,
  verifyCollectiveMembershipKeyProofV1,
} from "./crypto.js";

export interface CreateCollectiveMembershipConfigurationInputV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly epoch: number;
  readonly previousConfigurationDigest: string | null;
  readonly effectiveAt: string;
  readonly effectiveAtLogicalMs: number;
  readonly members: readonly CollectiveMembershipMemberV1[];
}

export async function createCollectiveMembershipConfigurationV1(
  input: CreateCollectiveMembershipConfigurationInputV1,
  injectedCrypto?: Crypto,
): Promise<CollectiveMembershipConfigurationV1> {
  const members = Object.freeze(
    input.members
      .map((member) =>
        Object.freeze({
          ...member,
          keys: Object.freeze(
            member.keys.map((key) => Object.freeze({ ...key })).sort(keyOrder),
          ),
        }),
      )
      .sort(memberOrder),
  );
  const seed = {
    schemaVersion: 1 as const,
    tenantId: input.tenantId,
    meshId: input.meshId,
    policyDomainId: input.policyDomainId,
    epoch: input.epoch,
    previousConfigurationDigest: input.previousConfigurationDigest,
    effectiveAt: input.effectiveAt,
    effectiveAtLogicalMs: input.effectiveAtLogicalMs,
    members,
    quorumThreshold: Math.floor(members.length / 2) + 1,
  };
  const configurationDigest = await collectiveMembershipDigestV1(
    seed,
    injectedCrypto,
  );
  const configuration = validateCollectiveMembershipConfigurationV1({
    ...seed,
    configurationDigest,
  });
  if (!configuration) throw new TypeError("invalid_membership_configuration");
  return configuration;
}

export async function verifyCollectiveMembershipConfigurationV1(
  value: unknown,
  injectedCrypto?: Crypto,
): Promise<CollectiveMembershipConfigurationV1 | null> {
  const configuration = validateCollectiveMembershipConfigurationV1(value);
  if (!configuration) return null;
  const { configurationDigest, ...seed } = configuration;
  return (await collectiveMembershipDigestV1(seed, injectedCrypto)) ===
    configurationDigest
    ? configuration
    : null;
}

export async function collectiveMembershipJoinStatementDigestV1(
  current: CollectiveMembershipConfigurationV1,
  next: CollectiveMembershipConfigurationV1,
  peerId: string,
  activeKeyId: string,
  injectedCrypto?: Crypto,
): Promise<string> {
  return collectiveMembershipDigestV1(
    statement(current, next, {
      kind: "join",
      peerId,
      activeKeyId,
    }),
    injectedCrypto,
  );
}

export async function collectiveMembershipRotationStatementDigestV1(
  current: CollectiveMembershipConfigurationV1,
  next: CollectiveMembershipConfigurationV1,
  input: {
    readonly peerId: string;
    readonly retiringKeyId: string;
    readonly activeKeyId: string;
    readonly overlapUntil: string;
  },
  injectedCrypto?: Crypto,
): Promise<string> {
  return collectiveMembershipDigestV1(
    statement(current, next, {
      kind: "rotate_key",
      peerId: input.peerId,
      retiringKeyId: input.retiringKeyId,
      activeKeyId: input.activeKeyId,
      overlapUntil: input.overlapUntil,
    }),
    injectedCrypto,
  );
}

export async function createCollectiveMembershipTransitionProposalV1(input: {
  readonly current: CollectiveMembershipConfigurationV1;
  readonly next: CollectiveMembershipConfigurationV1;
  readonly change: CollectiveMembershipChangeV1;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly crypto?: Crypto;
}): Promise<CollectiveMembershipTransitionProposalV1> {
  if (
    !(await validTransition(
      input.current,
      input.next,
      input.change,
      input.crypto,
    ))
  )
    throw new TypeError("invalid_membership_transition");
  const seed = {
    schemaVersion: 1 as const,
    fromEpoch: input.current.epoch,
    toEpoch: input.next.epoch,
    previousConfigurationDigest: input.current.configurationDigest,
    nextConfiguration: input.next,
    change: input.change,
    proposedAtLogicalMs: input.proposedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  };
  const proposalDigest = await collectiveMembershipDigestV1(seed, input.crypto);
  const proposalId = `membership.transition.${proposalDigest.slice(7, 47)}`;
  const proposal = validateCollectiveMembershipTransitionProposalV1({
    ...seed,
    proposalId,
    proposalDigest,
  });
  if (!proposal) throw new TypeError("invalid_membership_transition");
  return proposal;
}

export async function verifyCollectiveMembershipTransitionProposalV1(input: {
  readonly current: CollectiveMembershipConfigurationV1;
  readonly proposal: unknown;
  readonly crypto?: Crypto;
}): Promise<CollectiveMembershipTransitionProposalV1 | null> {
  const proposal = validateCollectiveMembershipTransitionProposalV1(
    input.proposal,
  );
  if (
    !proposal ||
    proposal.fromEpoch !== input.current.epoch ||
    proposal.previousConfigurationDigest !==
      input.current.configurationDigest ||
    !(await verifyCollectiveMembershipConfigurationV1(
      proposal.nextConfiguration,
      input.crypto,
    )) ||
    !(await validTransition(
      input.current,
      proposal.nextConfiguration,
      proposal.change,
      input.crypto,
    ))
  )
    return null;
  const { proposalId, proposalDigest, ...seed } = proposal;
  const expected = await collectiveMembershipDigestV1(seed, input.crypto);
  return expected === proposalDigest &&
    proposalId === `membership.transition.${expected.slice(7, 47)}`
    ? proposal
    : null;
}

async function validTransition(
  current: CollectiveMembershipConfigurationV1,
  next: CollectiveMembershipConfigurationV1,
  change: CollectiveMembershipChangeV1,
  crypto?: Crypto,
): Promise<boolean> {
  if (
    !(await verifyCollectiveMembershipConfigurationV1(current, crypto)) ||
    !(await verifyCollectiveMembershipConfigurationV1(next, crypto)) ||
    next.tenantId !== current.tenantId ||
    next.meshId !== current.meshId ||
    next.policyDomainId !== current.policyDomainId ||
    next.epoch !== current.epoch + 1 ||
    next.previousConfigurationDigest !== current.configurationDigest ||
    next.effectiveAtLogicalMs <= current.effectiveAtLogicalMs ||
    compare(next.effectiveAt, current.effectiveAt) <= 0
  )
    return false;
  const before = new Map(
    current.members.map((member) => [member.peerId, member]),
  );
  const after = new Map(next.members.map((member) => [member.peerId, member]));
  const added = next.members.filter((member) => !before.has(member.peerId));
  const removed = current.members.filter((member) => !after.has(member.peerId));
  const changed = current.members.filter((member) => {
    const candidate = after.get(member.peerId);
    return candidate && !sameMember(member, candidate);
  });

  if (change.kind === "join") {
    const joined = after.get(change.peerId);
    if (
      added.length !== 1 ||
      added[0]?.peerId !== change.peerId ||
      removed.length !== 0 ||
      changed.length !== 0 ||
      !joined ||
      joined.keys.length !== 1 ||
      joined.activeKeyId !== change.activeKeyProof.keyId
    )
      return false;
    const key = joined.keys.find(({ keyId }) => keyId === joined.activeKeyId);
    if (
      !key ||
      compare(key.validFrom, next.effectiveAt) > 0 ||
      compare(key.validUntil, next.effectiveAt) <= 0
    )
      return false;
    const statementDigest = await collectiveMembershipJoinStatementDigestV1(
      current,
      next,
      change.peerId,
      joined.activeKeyId,
      crypto,
    );
    return verifyProof(statementDigest, change.activeKeyProof, key, crypto);
  }

  if (change.kind === "leave")
    return (
      removed.length === 1 &&
      removed[0]?.peerId === change.peerId &&
      added.length === 0 &&
      changed.length === 0
    );

  const prior = before.get(change.peerId);
  const rotated = after.get(change.peerId);
  if (
    !prior ||
    !rotated ||
    added.length !== 0 ||
    removed.length !== 0 ||
    changed.length !== 1 ||
    changed[0]?.peerId !== change.peerId ||
    prior.instanceId !== rotated.instanceId ||
    prior.activeKeyId !== change.retiringKeyId ||
    rotated.activeKeyId !== change.activeKeyId ||
    change.retiringKeyProof.keyId !== change.retiringKeyId ||
    change.activeKeyProof.keyId !== change.activeKeyId
  )
    return false;
  const oldKey = prior.keys.find(({ keyId }) => keyId === change.retiringKeyId);
  const retainedOld = rotated.keys.find(
    ({ keyId }) => keyId === change.retiringKeyId,
  );
  const newKey = rotated.keys.find(({ keyId }) => keyId === change.activeKeyId);
  const addedKeys = rotated.keys.filter(
    (key) => !prior.keys.some(({ keyId }) => keyId === key.keyId),
  );
  if (
    !oldKey ||
    !retainedOld ||
    !sameKeyIdentity(oldKey, retainedOld) ||
    compare(retainedOld.validUntil, oldKey.validUntil) > 0 ||
    retainedOld.validUntil !== change.overlapUntil ||
    !newKey ||
    addedKeys.length !== 1 ||
    addedKeys[0]?.keyId !== newKey.keyId ||
    prior.keys.some((key) => {
      const candidate = rotated.keys.find(({ keyId }) => keyId === key.keyId);
      return (
        !candidate ||
        (key.keyId !== change.retiringKeyId &&
          (!sameKeyIdentity(key, candidate) ||
            key.validUntil !== candidate.validUntil))
      );
    }) ||
    compare(newKey.validFrom, next.effectiveAt) > 0 ||
    compare(change.overlapUntil, next.effectiveAt) <= 0 ||
    compare(change.overlapUntil, oldKey.validUntil) > 0 ||
    compare(change.overlapUntil, newKey.validUntil) >= 0
  )
    return false;
  const statementDigest = await collectiveMembershipRotationStatementDigestV1(
    current,
    next,
    change,
    crypto,
  );
  const [oldProof, newProof] = await Promise.all([
    verifyProof(statementDigest, change.retiringKeyProof, oldKey, crypto),
    verifyProof(statementDigest, change.activeKeyProof, newKey, crypto),
  ]);
  return oldProof && newProof;
}

function sameKeyIdentity(
  left: CollectiveMembershipKeyV1,
  right: CollectiveMembershipKeyV1,
): boolean {
  return (
    left.keyId === right.keyId &&
    left.algorithm === right.algorithm &&
    left.publicKey === right.publicKey &&
    left.validFrom === right.validFrom
  );
}

function sameMember(
  left: CollectiveMembershipMemberV1,
  right: CollectiveMembershipMemberV1,
): boolean {
  return (
    left.peerId === right.peerId &&
    left.instanceId === right.instanceId &&
    left.activeKeyId === right.activeKeyId &&
    left.keys.length === right.keys.length &&
    left.keys.every((key, index) => {
      const candidate = right.keys[index];
      return (
        candidate !== undefined &&
        sameKeyIdentity(key, candidate) &&
        key.validUntil === candidate.validUntil
      );
    })
  );
}

async function verifyProof(
  statementDigest: string,
  proof: CollectiveMembershipKeyProofV1,
  key: CollectiveMembershipKeyV1,
  crypto?: Crypto,
): Promise<boolean> {
  try {
    return verifyCollectiveMembershipKeyProofV1({
      statementDigest,
      proof,
      publicKey: await importCollectiveMembershipPublicKeyV1(key, crypto),
      crypto,
    });
  } catch {
    return false;
  }
}

function statement(
  current: CollectiveMembershipConfigurationV1,
  next: CollectiveMembershipConfigurationV1,
  change: Record<string, unknown>,
) {
  return {
    domain: "agentplat.collective-membership.transition-key-proof.v1",
    tenantId: current.tenantId,
    meshId: current.meshId,
    policyDomainId: current.policyDomainId,
    fromEpoch: current.epoch,
    toEpoch: next.epoch,
    previousConfigurationDigest: current.configurationDigest,
    nextConfigurationDigest: next.configurationDigest,
    change,
  } as const;
}

function compare(left: string, right: string): number {
  const order = compareMeshTimestamps(left, right);
  return order.ok ? order.value : 1;
}

function memberOrder(
  left: CollectiveMembershipMemberV1,
  right: CollectiveMembershipMemberV1,
): number {
  return left.peerId.localeCompare(right.peerId);
}

function keyOrder(
  left: CollectiveMembershipKeyV1,
  right: CollectiveMembershipKeyV1,
): number {
  return left.keyId.localeCompare(right.keyId);
}
