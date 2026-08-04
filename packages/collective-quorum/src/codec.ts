import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
} from "@agentplat/mesh-protocol";
import type {
  CollectiveQuorumAcceptedRecoveryValueV1,
  CollectiveQuorumAssignmentAttestationPayloadV1,
  CollectiveQuorumAssignmentRequestPayloadV1,
  CollectiveQuorumBallotV1,
  CollectiveQuorumPayloadV1,
  CollectiveQuorumRecoveryAcceptPayloadV1,
  CollectiveQuorumRecoveryAcceptedPayloadV1,
  CollectiveQuorumRecoveryPreparePayloadV1,
  CollectiveQuorumRecoveryPromisePayloadV1,
  CollectiveQuorumRecoveryProposalV1,
  CollectiveQuorumRecoveryValueV1,
  SignedCollectiveQuorumEnvelopeV1,
  UnsignedCollectiveQuorumEnvelopeV1,
} from "./contracts.js";
import {
  COLLECTIVE_QUORUM_PROTOCOL_V1,
  COLLECTIVE_QUORUM_SCHEMA_VERSION_V1,
} from "./contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const BASE64URL_SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;

export function compareCollectiveQuorumBallotsV1(
  left: CollectiveQuorumBallotV1,
  right: CollectiveQuorumBallotV1,
): -1 | 0 | 1 {
  if (left.counter !== right.counter)
    return left.counter < right.counter ? -1 : 1;
  return left.proposerPeerId < right.proposerPeerId
    ? -1
    : left.proposerPeerId > right.proposerPeerId
      ? 1
      : 0;
}

export function sameCollectiveQuorumBallotV1(
  left: CollectiveQuorumBallotV1,
  right: CollectiveQuorumBallotV1,
): boolean {
  return compareCollectiveQuorumBallotsV1(left, right) === 0;
}

export function sameCollectiveQuorumRecoveryValueV1(
  left: CollectiveQuorumRecoveryValueV1,
  right: CollectiveQuorumRecoveryValueV1,
): boolean {
  return (
    left.selectedProposalId === right.selectedProposalId &&
    left.selectedAssigneePeerId === right.selectedAssigneePeerId
  );
}

export function validateUnsignedCollectiveQuorumEnvelopeV1<
  TPayload extends CollectiveQuorumPayloadV1,
>(value: unknown): UnsignedCollectiveQuorumEnvelopeV1<TPayload> | null {
  return validateEnvelope<TPayload>(
    value,
    false,
  ) as UnsignedCollectiveQuorumEnvelopeV1<TPayload> | null;
}

export function validateSignedCollectiveQuorumEnvelopeV1<
  TPayload extends CollectiveQuorumPayloadV1 = CollectiveQuorumPayloadV1,
>(value: unknown): SignedCollectiveQuorumEnvelopeV1<TPayload> | null {
  return validateEnvelope<TPayload>(
    value,
    true,
  ) as SignedCollectiveQuorumEnvelopeV1<TPayload> | null;
}

function validateEnvelope<TPayload extends CollectiveQuorumPayloadV1>(
  value: unknown,
  signed: boolean,
):
  | SignedCollectiveQuorumEnvelopeV1<TPayload>
  | UnsignedCollectiveQuorumEnvelopeV1<TPayload>
  | null {
  if (!isRecord(value)) return null;
  if (
    !hasExactKeys(value, [
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
    value.protocol !== COLLECTIVE_QUORUM_PROTOCOL_V1 ||
    value.schemaVersion !== COLLECTIVE_QUORUM_SCHEMA_VERSION_V1 ||
    !isIdentifier(value.messageId) ||
    !isIdentifier(value.tenantId) ||
    !isIdentifier(value.meshId) ||
    !isIdentifier(value.senderPeerId) ||
    !isIdentifier(value.senderInstanceId) ||
    !isIdentifier(value.audiencePeerId) ||
    !isTimestamp(value.issuedAt) ||
    !isTimestamp(value.expiresAt)
  )
    return null;
  const ordering = compareMeshTimestamps(value.issuedAt, value.expiresAt);
  if (!ordering.ok || ordering.value >= 0) return null;
  if (!isRecord(value.proof)) return null;
  const proofKeys = signed
    ? ["algorithm", "keyId", "value"]
    : ["algorithm", "keyId"];
  if (
    !hasExactKeys(value.proof, proofKeys) ||
    value.proof.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !isIdentifier(value.proof.keyId) ||
    (signed &&
      (typeof value.proof.value !== "string" ||
        !BASE64URL_SIGNATURE.test(value.proof.value)))
  )
    return null;
  const payload = validateCollectiveQuorumPayloadV1(value.payload);
  if (!payload) return null;
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok || canonical.value.byteLength > 1_048_576) return null;
  return deepFreeze({ ...value, payload }) as
    | SignedCollectiveQuorumEnvelopeV1<TPayload>
    | UnsignedCollectiveQuorumEnvelopeV1<TPayload>;
}

export function validateCollectiveQuorumPayloadV1(
  value: unknown,
): CollectiveQuorumPayloadV1 | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "assignment.confirm.request":
      return validateAssignmentRequest(value);
    case "assignment.confirm.attestation":
      return validateAssignmentAttestation(value);
    case "recovery.prepare":
      return validateRecoveryPrepare(value);
    case "recovery.promise":
      return validateRecoveryPromise(value);
    case "recovery.accept":
      return validateRecoveryAccept(value);
    case "recovery.accepted":
      return validateRecoveryAccepted(value);
    default:
      return null;
  }
}

function validateAssignmentRequest(
  value: Record<string, unknown>,
): CollectiveQuorumAssignmentRequestPayloadV1 | null {
  if (
    !hasExactKeys(value, [
      "acceptanceMessageId",
      "assignedInstanceId",
      "assignedPeerId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assignmentSlotDigest",
      "eligibleWitnessPeerIds",
      "fencingToken",
      "latestLeaseRenewalId",
      "objectiveId",
      "objectiveRevision",
      "ownerPeerId",
      "policyDomainId",
      "recoveryWitnessThreshold",
      "requestedAtLogicalMs",
      "scopeDigest",
      "type",
      "workContractDigest",
      "workContractId",
      "workItemId",
      "workItemRevision",
    ]) ||
    !isDigest(value.scopeDigest) ||
    !isDigest(value.assignmentSlotDigest) ||
    !isIdentifier(value.workContractId) ||
    !isDigest(value.workContractDigest) ||
    !isIdentifier(value.policyDomainId) ||
    !isIdentifier(value.objectiveId) ||
    !isPositiveInteger(value.objectiveRevision) ||
    !isIdentifier(value.workItemId) ||
    !isPositiveInteger(value.workItemRevision) ||
    !isIdentifier(value.ownerPeerId) ||
    !isIdentifier(value.assignedPeerId) ||
    !isIdentifier(value.assignedInstanceId) ||
    !isIdentifier(value.assignmentAuthorityId) ||
    !isPositiveInteger(value.assignmentEpoch) ||
    !isIdentifier(value.fencingToken) ||
    !isIdentifier(value.acceptanceMessageId) ||
    !(
      value.latestLeaseRenewalId === null ||
      isIdentifier(value.latestLeaseRenewalId)
    ) ||
    !isIdentifierArray(value.eligibleWitnessPeerIds, 3, 128) ||
    !isStrictMajority(
      value.recoveryWitnessThreshold,
      value.eligibleWitnessPeerIds.length,
    ) ||
    !isLogicalTime(value.requestedAtLogicalMs) ||
    value.eligibleWitnessPeerIds.includes(value.ownerPeerId) ||
    value.eligibleWitnessPeerIds.includes(value.assignedPeerId)
  )
    return null;
  return deepFreeze(
    value,
  ) as unknown as CollectiveQuorumAssignmentRequestPayloadV1;
}

function validateAssignmentAttestation(
  value: Record<string, unknown>,
): CollectiveQuorumAssignmentAttestationPayloadV1 | null {
  if (
    !hasExactKeys(value, [
      "acceptanceId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assignmentSlotDigest",
      "attesterPeerId",
      "attesterRole",
      "confirmedAtLogicalMs",
      "confirmedLeaseExpiresAt",
      "fencingToken",
      "leaseRenewalId",
      "ownerPeerId",
      "requestMessageId",
      "scopeDigest",
      "type",
    ]) ||
    !isIdentifier(value.requestMessageId) ||
    !isDigest(value.scopeDigest) ||
    !isDigest(value.assignmentSlotDigest) ||
    (value.attesterRole !== "owner" && value.attesterRole !== "witness") ||
    !isIdentifier(value.attesterPeerId) ||
    !isIdentifier(value.ownerPeerId) ||
    !isIdentifier(value.acceptanceId) ||
    !isIdentifier(value.assignmentAuthorityId) ||
    !isPositiveInteger(value.assignmentEpoch) ||
    !isIdentifier(value.fencingToken) ||
    !(value.leaseRenewalId === null || isIdentifier(value.leaseRenewalId)) ||
    !isTimestamp(value.confirmedLeaseExpiresAt) ||
    !isLogicalTime(value.confirmedAtLogicalMs) ||
    (value.attesterRole === "owner" &&
      value.attesterPeerId !== value.ownerPeerId)
  )
    return null;
  return deepFreeze(
    value,
  ) as unknown as CollectiveQuorumAssignmentAttestationPayloadV1;
}

function validateRecoveryPrepare(
  value: Record<string, unknown>,
): CollectiveQuorumRecoveryPreparePayloadV1 | null {
  if (
    !hasExactKeys(value, [
      "ballot",
      "eligibleWitnessPeerIds",
      "objectiveId",
      "objectiveRevision",
      "objectiveExpiresAtLogicalMs",
      "priorAssignmentEpoch",
      "proposals",
      "proposalsDigest",
      "proposedAssignmentEpoch",
      "recoveryWitnessThreshold",
      "requestedAtLogicalMs",
      "scopeDigest",
      "type",
      "workItemId",
      "workItemRevision",
    ]) ||
    !validRecoveryScope(value) ||
    !isBallot(value.ballot) ||
    !isDigest(value.proposalsDigest) ||
    !isProposalArray(value.proposals) ||
    !isIdentifierArray(value.eligibleWitnessPeerIds, 3, 128) ||
    !isStrictMajority(
      value.recoveryWitnessThreshold,
      value.eligibleWitnessPeerIds.length,
    ) ||
    !isLogicalTime(value.requestedAtLogicalMs)
  )
    return null;
  return deepFreeze(
    value,
  ) as unknown as CollectiveQuorumRecoveryPreparePayloadV1;
}

function validateRecoveryPromise(
  value: Record<string, unknown>,
): CollectiveQuorumRecoveryPromisePayloadV1 | null {
  if (
    !hasExactKeys(value, [
      "accepted",
      "ballot",
      "promisedAtLogicalMs",
      "requestMessageId",
      "scopeDigest",
      "type",
      "witnessPeerId",
    ]) ||
    !isIdentifier(value.requestMessageId) ||
    !isDigest(value.scopeDigest) ||
    !isBallot(value.ballot) ||
    !isIdentifier(value.witnessPeerId) ||
    !isAcceptedValueOrNull(value.accepted) ||
    !isLogicalTime(value.promisedAtLogicalMs)
  )
    return null;
  return deepFreeze(
    value,
  ) as unknown as CollectiveQuorumRecoveryPromisePayloadV1;
}

function validateRecoveryAccept(
  value: Record<string, unknown>,
): CollectiveQuorumRecoveryAcceptPayloadV1 | null {
  if (
    !hasExactKeys(value, [
      "ballot",
      "eligibleWitnessPeerIds",
      "expiresAtLogicalMs",
      "objectiveId",
      "objectiveRevision",
      "objectiveExpiresAtLogicalMs",
      "priorAssignmentEpoch",
      "promiseMessageIds",
      "proposals",
      "proposalsDigest",
      "proposedAssignmentEpoch",
      "recoveryWitnessThreshold",
      "requestedAtLogicalMs",
      "scopeDigest",
      "selected",
      "type",
      "workItemId",
      "workItemRevision",
    ]) ||
    !validRecoveryScope(value) ||
    !isBallot(value.ballot) ||
    !isDigest(value.proposalsDigest) ||
    !isProposalArray(value.proposals) ||
    !isRecoveryValue(value.selected) ||
    !isIdentifierArray(value.eligibleWitnessPeerIds, 3, 128) ||
    !isStrictMajority(
      value.recoveryWitnessThreshold,
      value.eligibleWitnessPeerIds.length,
    ) ||
    !isIdentifierArray(
      value.promiseMessageIds,
      value.recoveryWitnessThreshold as number,
      128,
    ) ||
    !isLogicalTime(value.requestedAtLogicalMs) ||
    !isLogicalTime(value.expiresAtLogicalMs) ||
    value.expiresAtLogicalMs <= value.requestedAtLogicalMs ||
    !value.proposals.some(
      (proposal) =>
        isRecord(proposal) &&
        proposal.takeoverProposalId ===
          (value.selected as Record<string, unknown>).selectedProposalId &&
        proposal.proposedAssigneePeerId ===
          (value.selected as Record<string, unknown>).selectedAssigneePeerId,
    )
  )
    return null;
  return deepFreeze(
    value,
  ) as unknown as CollectiveQuorumRecoveryAcceptPayloadV1;
}

function validateRecoveryAccepted(
  value: Record<string, unknown>,
): CollectiveQuorumRecoveryAcceptedPayloadV1 | null {
  if (
    !hasExactKeys(value, [
      "acceptedAtLogicalMs",
      "ballot",
      "expiresAtLogicalMs",
      "requestMessageId",
      "scopeDigest",
      "selected",
      "type",
      "witnessPeerId",
    ]) ||
    !isIdentifier(value.requestMessageId) ||
    !isDigest(value.scopeDigest) ||
    !isBallot(value.ballot) ||
    !isRecoveryValue(value.selected) ||
    !isIdentifier(value.witnessPeerId) ||
    !isLogicalTime(value.acceptedAtLogicalMs) ||
    !isLogicalTime(value.expiresAtLogicalMs) ||
    value.expiresAtLogicalMs <= value.acceptedAtLogicalMs
  )
    return null;
  return deepFreeze(
    value,
  ) as unknown as CollectiveQuorumRecoveryAcceptedPayloadV1;
}

function validRecoveryScope(value: Record<string, unknown>): boolean {
  return (
    isDigest(value.scopeDigest) &&
    isIdentifier(value.objectiveId) &&
    isPositiveInteger(value.objectiveRevision) &&
    isLogicalTime(value.objectiveExpiresAtLogicalMs) &&
    isIdentifier(value.workItemId) &&
    isPositiveInteger(value.workItemRevision) &&
    isPositiveInteger(value.priorAssignmentEpoch) &&
    value.proposedAssignmentEpoch === (value.priorAssignmentEpoch as number) + 1
  );
}

function isProposalArray(
  value: unknown,
): value is readonly CollectiveQuorumRecoveryProposalV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256)
    return false;
  const ids = new Set<string>();
  for (const proposal of value) {
    if (
      !isRecord(proposal) ||
      !hasExactKeys(proposal, [
        "acceptedAtLogicalMs",
        "proposedAssigneePeerId",
        "takeoverProposalId",
      ]) ||
      !isIdentifier(proposal.takeoverProposalId) ||
      !isIdentifier(proposal.proposedAssigneePeerId) ||
      !isLogicalTime(proposal.acceptedAtLogicalMs) ||
      ids.has(proposal.takeoverProposalId)
    )
      return false;
    ids.add(proposal.takeoverProposalId);
  }
  return true;
}

function isAcceptedValueOrNull(
  value: unknown,
): value is CollectiveQuorumAcceptedRecoveryValueV1 | null {
  return (
    value === null ||
    (isRecord(value) &&
      hasExactKeys(value, ["ballot", "value"]) &&
      isBallot(value.ballot) &&
      isRecoveryValue(value.value))
  );
}

function isBallot(value: unknown): value is CollectiveQuorumBallotV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["counter", "proposerPeerId"]) &&
    isPositiveInteger(value.counter) &&
    isIdentifier(value.proposerPeerId)
  );
}

function isRecoveryValue(
  value: unknown,
): value is CollectiveQuorumRecoveryValueV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["selectedAssigneePeerId", "selectedProposalId"]) &&
    isIdentifier(value.selectedProposalId) &&
    isIdentifier(value.selectedAssigneePeerId)
  );
}

function isStrictMajority(value: unknown, memberCount: number): boolean {
  return (
    isPositiveInteger(value) && value <= memberCount && value > memberCount / 2
  );
}

function isIdentifierArray(
  value: unknown,
  minimum: number,
  maximum: number,
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.every(isIdentifier) &&
    new Set(value).size === value.length &&
    [...value].sort().every((entry, index) => entry === value[index])
  );
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && compareMeshTimestamps(value, value).ok;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isLogicalTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return (
    keys.length === sorted.length &&
    keys.every((key, index) => key === sorted[index])
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
