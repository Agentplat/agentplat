import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
} from "@agentplat/mesh-protocol";
import type {
  CollectiveMembershipCertificateV1,
  CollectiveMembershipChangeV1,
  CollectiveMembershipConfigurationV1,
  CollectiveMembershipKeyProofV1,
  CollectiveMembershipKeyV1,
  CollectiveMembershipMemberV1,
  CollectiveMembershipPayloadV1,
  CollectiveMembershipTransitionProposalV1,
  SignedCollectiveMembershipEnvelopeV1,
  UnsignedCollectiveMembershipEnvelopeV1,
} from "./contracts.js";
import {
  COLLECTIVE_MEMBERSHIP_PROTOCOL_V1,
  COLLECTIVE_MEMBERSHIP_SCHEMA_VERSION_V1,
} from "./contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RAW_ED25519_KEY = /^[A-Za-z0-9_-]{43}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;

export function validateCollectiveMembershipConfigurationV1(
  value: unknown,
): CollectiveMembershipConfigurationV1 | null {
  if (
    !record(value) ||
    !exact(value, [
      "configurationDigest",
      "effectiveAt",
      "effectiveAtLogicalMs",
      "epoch",
      "members",
      "meshId",
      "policyDomainId",
      "previousConfigurationDigest",
      "quorumThreshold",
      "schemaVersion",
      "tenantId",
    ]) ||
    value.schemaVersion !== 1 ||
    !identifier(value.tenantId) ||
    !identifier(value.meshId) ||
    !identifier(value.policyDomainId) ||
    !positive(value.epoch) ||
    !(
      (value.epoch === 1 && value.previousConfigurationDigest === null) ||
      (value.epoch > 1 && digest(value.previousConfigurationDigest))
    ) ||
    !timestamp(value.effectiveAt) ||
    !logicalTime(value.effectiveAtLogicalMs) ||
    !memberArray(value.members) ||
    !activeKeysValid(value.members, value.effectiveAt) ||
    value.quorumThreshold !== Math.floor(value.members.length / 2) + 1 ||
    !digest(value.configurationDigest)
  )
    return null;
  return deepFreeze(value) as unknown as CollectiveMembershipConfigurationV1;
}

export function validateCollectiveMembershipTransitionProposalV1(
  value: unknown,
): CollectiveMembershipTransitionProposalV1 | null {
  if (
    !record(value) ||
    !exact(value, [
      "change",
      "expiresAtLogicalMs",
      "fromEpoch",
      "nextConfiguration",
      "previousConfigurationDigest",
      "proposalDigest",
      "proposalId",
      "proposedAtLogicalMs",
      "schemaVersion",
      "toEpoch",
    ]) ||
    value.schemaVersion !== 1 ||
    !identifier(value.proposalId) ||
    !positive(value.fromEpoch) ||
    value.toEpoch !== value.fromEpoch + 1 ||
    !digest(value.previousConfigurationDigest) ||
    !validateCollectiveMembershipConfigurationV1(value.nextConfiguration) ||
    !change(value.change) ||
    !logicalTime(value.proposedAtLogicalMs) ||
    !logicalTime(value.expiresAtLogicalMs) ||
    value.expiresAtLogicalMs <= value.proposedAtLogicalMs ||
    !digest(value.proposalDigest)
  )
    return null;
  const next = value.nextConfiguration as CollectiveMembershipConfigurationV1;
  if (
    next.epoch !== value.toEpoch ||
    next.previousConfigurationDigest !== value.previousConfigurationDigest
  )
    return null;
  return deepFreeze(
    value,
  ) as unknown as CollectiveMembershipTransitionProposalV1;
}

export function validateCollectiveMembershipCertificateShapeV1(
  value: unknown,
): CollectiveMembershipCertificateV1 | null {
  if (
    !record(value) ||
    !exact(value, [
      "certificateDigest",
      "certificateId",
      "certifiedAt",
      "certifiedAtLogicalMs",
      "kind",
      "nextQuorumPeerIds",
      "previousQuorumPeerIds",
      "proposal",
      "requests",
      "schemaVersion",
      "votes",
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== "membership_transition" ||
    !identifier(value.certificateId) ||
    !validateCollectiveMembershipTransitionProposalV1(value.proposal) ||
    !Array.isArray(value.requests) ||
    value.requests.length < 2 ||
    value.requests.length > 128 ||
    value.requests.some(
      (request) => !validateSignedCollectiveMembershipEnvelopeV1(request),
    ) ||
    !Array.isArray(value.votes) ||
    value.votes.length < 2 ||
    value.votes.length > 128 ||
    value.votes.some(
      (vote) => !validateSignedCollectiveMembershipEnvelopeV1(vote),
    ) ||
    !identifierArray(value.previousQuorumPeerIds, 2, 128) ||
    !identifierArray(value.nextQuorumPeerIds, 2, 128) ||
    !timestamp(value.certifiedAt) ||
    !logicalTime(value.certifiedAtLogicalMs) ||
    !digest(value.certificateDigest)
  )
    return null;
  return deepFreeze(value) as unknown as CollectiveMembershipCertificateV1;
}

export function validateUnsignedCollectiveMembershipEnvelopeV1<
  TPayload extends CollectiveMembershipPayloadV1,
>(value: unknown): UnsignedCollectiveMembershipEnvelopeV1<TPayload> | null {
  return envelope<TPayload>(
    value,
    false,
  ) as UnsignedCollectiveMembershipEnvelopeV1<TPayload> | null;
}

export function validateSignedCollectiveMembershipEnvelopeV1<
  TPayload extends CollectiveMembershipPayloadV1 =
    CollectiveMembershipPayloadV1,
>(value: unknown): SignedCollectiveMembershipEnvelopeV1<TPayload> | null {
  return envelope<TPayload>(
    value,
    true,
  ) as SignedCollectiveMembershipEnvelopeV1<TPayload> | null;
}

function envelope<TPayload extends CollectiveMembershipPayloadV1>(
  value: unknown,
  signed: boolean,
):
  | SignedCollectiveMembershipEnvelopeV1<TPayload>
  | UnsignedCollectiveMembershipEnvelopeV1<TPayload>
  | null {
  if (
    !record(value) ||
    !exact(value, [
      "audiencePeerId",
      "expiresAt",
      "issuedAt",
      "meshId",
      "messageId",
      "payload",
      "proof",
      "protocol",
      "schemaVersion",
      "senderInstanceId",
      "senderPeerId",
      "tenantId",
    ]) ||
    value.protocol !== COLLECTIVE_MEMBERSHIP_PROTOCOL_V1 ||
    value.schemaVersion !== COLLECTIVE_MEMBERSHIP_SCHEMA_VERSION_V1 ||
    !identifier(value.messageId) ||
    !identifier(value.tenantId) ||
    !identifier(value.meshId) ||
    !identifier(value.senderPeerId) ||
    !identifier(value.senderInstanceId) ||
    !identifier(value.audiencePeerId) ||
    !timestamp(value.issuedAt) ||
    !timestamp(value.expiresAt) ||
    compare(value.issuedAt, value.expiresAt) >= 0 ||
    !record(value.proof) ||
    !exact(
      value.proof,
      signed ? ["algorithm", "keyId", "value"] : ["algorithm", "keyId"],
    ) ||
    value.proof.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !identifier(value.proof.keyId) ||
    (signed && !signature(value.proof.value))
  )
    return null;
  const payload = validatePayload(value.payload);
  if (!payload) return null;
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok || canonical.value.byteLength > 1_048_576) return null;
  return deepFreeze({ ...value, payload }) as
    | SignedCollectiveMembershipEnvelopeV1<TPayload>
    | UnsignedCollectiveMembershipEnvelopeV1<TPayload>;
}

function validatePayload(value: unknown): CollectiveMembershipPayloadV1 | null {
  if (!record(value) || typeof value.type !== "string") return null;
  if (value.type === "membership.transition.vote.request") {
    if (
      !exact(value, ["proposal", "requestedAtLogicalMs", "type"]) ||
      !validateCollectiveMembershipTransitionProposalV1(value.proposal) ||
      !logicalTime(value.requestedAtLogicalMs)
    )
      return null;
    return deepFreeze(value) as unknown as CollectiveMembershipPayloadV1;
  }
  if (value.type === "membership.transition.vote") {
    if (
      !exact(value, [
        "approvedAtLogicalMs",
        "fromEpoch",
        "nextConfigurationDigest",
        "previousConfigurationDigest",
        "proposalDigest",
        "proposalId",
        "requestMessageId",
        "toEpoch",
        "type",
        "voterPeerId",
      ]) ||
      !identifier(value.requestMessageId) ||
      !identifier(value.proposalId) ||
      !digest(value.proposalDigest) ||
      !identifier(value.voterPeerId) ||
      !positive(value.fromEpoch) ||
      value.toEpoch !== value.fromEpoch + 1 ||
      !digest(value.previousConfigurationDigest) ||
      !digest(value.nextConfigurationDigest) ||
      !logicalTime(value.approvedAtLogicalMs)
    )
      return null;
    return deepFreeze(value) as unknown as CollectiveMembershipPayloadV1;
  }
  if (value.type === "membership.transition.commit.request") {
    if (
      !exact(value, ["certificate", "requestedAtLogicalMs", "type"]) ||
      !validateCollectiveMembershipCertificateShapeV1(value.certificate) ||
      !logicalTime(value.requestedAtLogicalMs)
    )
      return null;
    return deepFreeze(value) as unknown as CollectiveMembershipPayloadV1;
  }
  if (value.type === "membership.transition.commit.ack") {
    if (
      !exact(value, [
        "certificateId",
        "committedAtLogicalMs",
        "configurationDigest",
        "configurationEpoch",
        "requestMessageId",
        "type",
      ]) ||
      !identifier(value.requestMessageId) ||
      !identifier(value.certificateId) ||
      !positive(value.configurationEpoch) ||
      !digest(value.configurationDigest) ||
      !logicalTime(value.committedAtLogicalMs)
    )
      return null;
    return deepFreeze(value) as unknown as CollectiveMembershipPayloadV1;
  }
  return null;
}

function memberArray(
  value: unknown,
): value is readonly CollectiveMembershipMemberV1[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 128)
    return false;
  const peerIds = new Set<string>();
  const instanceIds = new Set<string>();
  const publicKeys = new Set<string>();
  for (const member of value) {
    if (
      !record(member) ||
      !exact(member, ["activeKeyId", "instanceId", "keys", "peerId"]) ||
      !identifier(member.peerId) ||
      !identifier(member.instanceId) ||
      !identifier(member.activeKeyId) ||
      peerIds.has(member.peerId) ||
      instanceIds.has(member.instanceId) ||
      !keyArray(member.keys) ||
      member.keys.some((key) => publicKeys.has(key.publicKey)) ||
      !member.keys.some((key) => key.keyId === member.activeKeyId)
    )
      return false;
    peerIds.add(member.peerId);
    instanceIds.add(member.instanceId);
    for (const key of member.keys) publicKeys.add(key.publicKey);
  }
  return [...value]
    .map((member) => member.peerId)
    .every(
      (peerId, index, peerIds) => index === 0 || peerIds[index - 1]! < peerId,
    );
}

function activeKeysValid(
  members: readonly CollectiveMembershipMemberV1[],
  effectiveAt: string,
): boolean {
  return members.every((member) => {
    const key = member.keys.find(({ keyId }) => keyId === member.activeKeyId);
    return (
      key !== undefined &&
      compare(key.validFrom, effectiveAt) <= 0 &&
      compare(key.validUntil, effectiveAt) > 0
    );
  });
}

function keyArray(
  value: unknown,
): value is readonly CollectiveMembershipKeyV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    return false;
  const ids = new Set<string>();
  const publicKeys = new Set<string>();
  for (const key of value) {
    if (
      !record(key) ||
      !exact(key, [
        "algorithm",
        "keyId",
        "publicKey",
        "validFrom",
        "validUntil",
      ]) ||
      !identifier(key.keyId) ||
      key.algorithm !== MESH_SIGNATURE_ALGORITHM ||
      typeof key.publicKey !== "string" ||
      !RAW_ED25519_KEY.test(key.publicKey) ||
      !timestamp(key.validFrom) ||
      !timestamp(key.validUntil) ||
      compare(key.validFrom, key.validUntil) >= 0 ||
      ids.has(key.keyId) ||
      publicKeys.has(key.publicKey)
    )
      return false;
    ids.add(key.keyId);
    publicKeys.add(key.publicKey);
  }
  return [...value]
    .map((key) => key.keyId)
    .every((keyId, index, keyIds) => index === 0 || keyIds[index - 1]! < keyId);
}

function change(value: unknown): value is CollectiveMembershipChangeV1 {
  if (!record(value) || !identifier(value.peerId)) return false;
  if (value.kind === "join")
    return (
      exact(value, ["activeKeyProof", "kind", "peerId"]) &&
      keyProof(value.activeKeyProof)
    );
  if (value.kind === "leave") return exact(value, ["kind", "peerId"]);
  if (value.kind === "rotate_key")
    return (
      exact(value, [
        "activeKeyId",
        "activeKeyProof",
        "kind",
        "overlapUntil",
        "peerId",
        "retiringKeyId",
        "retiringKeyProof",
      ]) &&
      identifier(value.retiringKeyId) &&
      identifier(value.activeKeyId) &&
      value.retiringKeyId !== value.activeKeyId &&
      timestamp(value.overlapUntil) &&
      keyProof(value.retiringKeyProof) &&
      keyProof(value.activeKeyProof)
    );
  return false;
}

function keyProof(value: unknown): value is CollectiveMembershipKeyProofV1 {
  return (
    record(value) &&
    exact(value, ["algorithm", "keyId", "value"]) &&
    value.algorithm === MESH_SIGNATURE_ALGORITHM &&
    identifier(value.keyId) &&
    signature(value.value)
  );
}

function identifierArray(
  value: unknown,
  minimum: number,
  maximum: number,
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.every(identifier) &&
    new Set(value).size === value.length &&
    [...value].sort().every((entry, index) => entry === value[index])
  );
}

function compare(left: unknown, right: unknown): number {
  if (typeof left !== "string" || typeof right !== "string") return 1;
  const result = compareMeshTimestamps(left, right);
  return result.ok ? result.value : 1;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && compareMeshTimestamps(value, value).ok;
}

function logicalTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function signature(value: unknown): value is string {
  return typeof value === "string" && SIGNATURE.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>))
      deepFreeze(nested);
  }
  return value;
}
