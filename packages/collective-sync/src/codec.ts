import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
} from "@agentplat/mesh-protocol";
import type {
  CollectiveCatchUpCertificateV1,
  CollectiveSyncCursorV1,
  CollectiveSyncFrontierV1,
  CollectiveSyncPayloadV1,
  CollectiveSyncRecordV1,
  CollectiveSyncSessionV1,
  SignedCollectiveSyncEnvelopeV1,
  UnsignedCollectiveSyncEnvelopeV1,
} from "./contracts.js";
import {
  COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
  COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1,
  COLLECTIVE_SYNC_PROTOCOL_V1,
  COLLECTIVE_SYNC_SCHEMA_VERSION_V1,
} from "./contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;

export function validateCollectiveSyncRecordV1(
  value: unknown,
): CollectiveSyncRecordV1 | null {
  if (
    !record(value) ||
    !exact(value, [
      "createdAtLogicalMs",
      "meshId",
      "payload",
      "payloadDigest",
      "policyDomainId",
      "predecessorDigest",
      "recordDigest",
      "schemaVersion",
      "sequence",
      "streamId",
      "syncDomain",
      "tenantId",
    ]) ||
    value.schemaVersion !== 1 ||
    !identifier(value.tenantId) ||
    !identifier(value.meshId) ||
    !identifier(value.policyDomainId) ||
    !identifier(value.syncDomain) ||
    !identifier(value.streamId) ||
    !positive(value.sequence) ||
    !(
      (value.sequence === 1 && value.predecessorDigest === null) ||
      (value.sequence > 1 && digest(value.predecessorDigest))
    ) ||
    !jsonValue(value.payload) ||
    !digest(value.payloadDigest) ||
    !logical(value.createdAtLogicalMs) ||
    !digest(value.recordDigest)
  )
    return null;
  const canonical = canonicalizeMeshJsonBytes(value);
  if (
    !canonical.ok ||
    canonical.value.byteLength > COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1
  )
    return null;
  return freeze(value) as unknown as CollectiveSyncRecordV1;
}

export function validateCollectiveSyncFrontierV1(
  value: unknown,
): CollectiveSyncFrontierV1 | null {
  if (
    !record(value) ||
    !exact(value, [
      "entries",
      "frontierDigest",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "meshId",
      "policyDomainId",
      "schemaVersion",
      "syncDomain",
      "tenantId",
    ]) ||
    value.schemaVersion !== 1 ||
    !identifier(value.tenantId) ||
    !identifier(value.meshId) ||
    !identifier(value.policyDomainId) ||
    !identifier(value.syncDomain) ||
    !positive(value.membershipEpoch) ||
    !digest(value.membershipConfigurationDigest) ||
    !cursorArray(value.entries) ||
    !digest(value.frontierDigest)
  )
    return null;
  return freeze(value) as unknown as CollectiveSyncFrontierV1;
}

export function validateCollectiveSyncSessionV1(
  value: unknown,
): CollectiveSyncSessionV1 | null {
  if (
    !record(value) ||
    !exact(value, [
      "certificateId",
      "cursors",
      "failureCode",
      "importedRecordDigests",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "schemaVersion",
      "sessionId",
      "sourcePeerIds",
      "status",
      "syncDomain",
      "targetFrontier",
      "updatedAtLogicalMs",
    ]) ||
    value.schemaVersion !== 1 ||
    !identifier(value.sessionId) ||
    !identifier(value.syncDomain) ||
    !positive(value.membershipEpoch) ||
    !digest(value.membershipConfigurationDigest) ||
    !(
      value.targetFrontier === null ||
      validateCollectiveSyncFrontierV1(value.targetFrontier)
    ) ||
    !identifierArray(value.sourcePeerIds, 0, 128) ||
    !cursorArray(value.cursors) ||
    !digestArray(value.importedRecordDigests, 0, 65_536) ||
    !["discovering", "transferring", "certifying", "ready", "failed"].includes(
      String(value.status),
    ) ||
    !(value.certificateId === null || identifier(value.certificateId)) ||
    !(value.failureCode === null || identifier(value.failureCode)) ||
    !logical(value.updatedAtLogicalMs)
  )
    return null;
  return freeze(value) as unknown as CollectiveSyncSessionV1;
}

export function validateCollectiveCatchUpCertificateShapeV1(
  value: unknown,
): CollectiveCatchUpCertificateV1 | null {
  if (
    !record(value) ||
    !exact(value, [
      "attestations",
      "certificateDigest",
      "certificateId",
      "certifiedAtLogicalMs",
      "frontier",
      "kind",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "meshId",
      "policyDomainId",
      "schemaVersion",
      "syncDomain",
      "targetInstanceId",
      "targetPeerId",
      "tenantId",
      "threshold",
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== "causal_catch_up" ||
    !identifier(value.certificateId) ||
    !identifier(value.tenantId) ||
    !identifier(value.meshId) ||
    !identifier(value.policyDomainId) ||
    !identifier(value.syncDomain) ||
    !identifier(value.targetPeerId) ||
    !identifier(value.targetInstanceId) ||
    !positive(value.membershipEpoch) ||
    !digest(value.membershipConfigurationDigest) ||
    !validateCollectiveSyncFrontierV1(value.frontier) ||
    !positive(value.threshold) ||
    !Array.isArray(value.attestations) ||
    value.attestations.length < value.threshold ||
    value.attestations.length > 128 ||
    value.attestations.some((entry) => {
      const envelope = validateSignedCollectiveSyncEnvelopeV1(entry);
      return !envelope || envelope.payload.type !== "sync.attestation";
    }) ||
    !logical(value.certifiedAtLogicalMs) ||
    !digest(value.certificateDigest)
  )
    return null;
  return freeze(value) as unknown as CollectiveCatchUpCertificateV1;
}

export function validateUnsignedCollectiveSyncEnvelopeV1<
  TPayload extends CollectiveSyncPayloadV1,
>(value: unknown): UnsignedCollectiveSyncEnvelopeV1<TPayload> | null {
  return envelope<TPayload>(
    value,
    false,
  ) as UnsignedCollectiveSyncEnvelopeV1<TPayload> | null;
}

export function validateSignedCollectiveSyncEnvelopeV1<
  TPayload extends CollectiveSyncPayloadV1 = CollectiveSyncPayloadV1,
>(value: unknown): SignedCollectiveSyncEnvelopeV1<TPayload> | null {
  return envelope<TPayload>(
    value,
    true,
  ) as SignedCollectiveSyncEnvelopeV1<TPayload> | null;
}

function envelope<TPayload extends CollectiveSyncPayloadV1>(
  value: unknown,
  signed: boolean,
):
  | SignedCollectiveSyncEnvelopeV1<TPayload>
  | UnsignedCollectiveSyncEnvelopeV1<TPayload>
  | null {
  if (
    !record(value) ||
    !exact(value, [
      "audienceInstanceId",
      "audiencePeerId",
      "expiresAt",
      "issuedAt",
      "meshId",
      "messageId",
      "payload",
      "policyDomainId",
      "proof",
      "protocol",
      "schemaVersion",
      "senderInstanceId",
      "senderPeerId",
      "tenantId",
    ]) ||
    value.protocol !== COLLECTIVE_SYNC_PROTOCOL_V1 ||
    value.schemaVersion !== COLLECTIVE_SYNC_SCHEMA_VERSION_V1 ||
    !identifier(value.messageId) ||
    !identifier(value.tenantId) ||
    !identifier(value.meshId) ||
    !identifier(value.policyDomainId) ||
    !identifier(value.senderPeerId) ||
    !identifier(value.senderInstanceId) ||
    !identifier(value.audiencePeerId) ||
    !identifier(value.audienceInstanceId) ||
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
  if (
    !canonical.ok ||
    canonical.value.byteLength > COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1
  )
    return null;
  return freeze({ ...value, payload }) as unknown as
    | SignedCollectiveSyncEnvelopeV1<TPayload>
    | UnsignedCollectiveSyncEnvelopeV1<TPayload>;
}

function validatePayload(value: unknown): CollectiveSyncPayloadV1 | null {
  if (!record(value) || typeof value.type !== "string") return null;
  if (
    !positive(value.membershipEpoch) ||
    !digest(value.membershipConfigurationDigest)
  )
    return null;
  switch (value.type) {
    case "sync.frontier.request":
      if (
        !exact(value, [
          "localFrontier",
          "membershipConfigurationDigest",
          "membershipEpoch",
          "requestedAtLogicalMs",
          "sessionId",
          "syncDomain",
          "type",
        ]) ||
        !identifier(value.sessionId) ||
        !identifier(value.syncDomain) ||
        !validateCollectiveSyncFrontierV1(value.localFrontier) ||
        !logical(value.requestedAtLogicalMs)
      )
        return null;
      break;
    case "sync.frontier.response":
      if (
        !exact(value, [
          "frontier",
          "membershipConfigurationDigest",
          "membershipEpoch",
          "requestMessageId",
          "respondedAtLogicalMs",
          "sessionId",
          "sourcePeerId",
          "type",
        ]) ||
        !identifier(value.requestMessageId) ||
        !identifier(value.sessionId) ||
        !identifier(value.sourcePeerId) ||
        !validateCollectiveSyncFrontierV1(value.frontier) ||
        !logical(value.respondedAtLogicalMs)
      )
        return null;
      break;
    case "sync.chunk.request":
      if (
        !exact(value, [
          "cursors",
          "maximumBytes",
          "maximumRecords",
          "membershipConfigurationDigest",
          "membershipEpoch",
          "requestedAtLogicalMs",
          "sessionId",
          "syncDomain",
          "targetFrontierDigest",
          "type",
        ]) ||
        !identifier(value.sessionId) ||
        !identifier(value.syncDomain) ||
        !digest(value.targetFrontierDigest) ||
        !cursorArray(value.cursors) ||
        !bounded(
          value.maximumRecords,
          1,
          COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1,
        ) ||
        !bounded(
          value.maximumBytes,
          1_024,
          COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
        ) ||
        !logical(value.requestedAtLogicalMs)
      )
        return null;
      break;
    case "sync.chunk":
      if (
        !exact(value, [
          "chunkDigest",
          "hasMore",
          "membershipConfigurationDigest",
          "membershipEpoch",
          "nextCursors",
          "records",
          "requestMessageId",
          "respondedAtLogicalMs",
          "sessionId",
          "sourceFrontier",
          "syncDomain",
          "type",
        ]) ||
        !identifier(value.requestMessageId) ||
        !identifier(value.sessionId) ||
        !identifier(value.syncDomain) ||
        !validateCollectiveSyncFrontierV1(value.sourceFrontier) ||
        !Array.isArray(value.records) ||
        value.records.length > COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1 ||
        value.records.some((entry) => !validateCollectiveSyncRecordV1(entry)) ||
        !cursorArray(value.nextCursors) ||
        typeof value.hasMore !== "boolean" ||
        !digest(value.chunkDigest) ||
        !logical(value.respondedAtLogicalMs)
      )
        return null;
      break;
    case "sync.receipt":
      if (
        !exact(value, [
          "chunkDigest",
          "importedRecordDigests",
          "localFrontierDigest",
          "membershipConfigurationDigest",
          "membershipEpoch",
          "receivedAtLogicalMs",
          "sessionId",
          "sourceFrontierDigest",
          "syncDomain",
          "type",
        ]) ||
        !identifier(value.sessionId) ||
        !identifier(value.syncDomain) ||
        !digest(value.sourceFrontierDigest) ||
        !digest(value.chunkDigest) ||
        !digestArray(
          value.importedRecordDigests,
          0,
          COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1,
        ) ||
        !digest(value.localFrontierDigest) ||
        !logical(value.receivedAtLogicalMs)
      )
        return null;
      break;
    case "sync.receipt.ack":
      if (
        !exact(value, [
          "acceptedAtLogicalMs",
          "chunkDigest",
          "membershipConfigurationDigest",
          "membershipEpoch",
          "requestMessageId",
          "sessionId",
          "type",
        ]) ||
        !identifier(value.requestMessageId) ||
        !identifier(value.sessionId) ||
        !digest(value.chunkDigest) ||
        !logical(value.acceptedAtLogicalMs)
      )
        return null;
      break;
    case "sync.attestation.request":
      if (
        !exact(value, [
          "frontier",
          "membershipConfigurationDigest",
          "membershipEpoch",
          "requestedAtLogicalMs",
          "sessionId",
          "syncDomain",
          "targetInstanceId",
          "targetPeerId",
          "type",
        ]) ||
        !identifier(value.sessionId) ||
        !identifier(value.syncDomain) ||
        !identifier(value.targetPeerId) ||
        !identifier(value.targetInstanceId) ||
        !validateCollectiveSyncFrontierV1(value.frontier) ||
        !logical(value.requestedAtLogicalMs)
      )
        return null;
      break;
    case "sync.attestation":
      if (
        !exact(value, [
          "attestedAtLogicalMs",
          "attesterPeerId",
          "frontierDigest",
          "membershipConfigurationDigest",
          "membershipEpoch",
          "requestMessageId",
          "sessionId",
          "syncDomain",
          "targetInstanceId",
          "targetPeerId",
          "type",
        ]) ||
        !identifier(value.requestMessageId) ||
        !identifier(value.sessionId) ||
        !identifier(value.syncDomain) ||
        !identifier(value.targetPeerId) ||
        !identifier(value.targetInstanceId) ||
        !identifier(value.attesterPeerId) ||
        !digest(value.frontierDigest) ||
        !logical(value.attestedAtLogicalMs)
      )
        return null;
      break;
    default:
      return null;
  }
  return freeze(value) as unknown as CollectiveSyncPayloadV1;
}

function cursorArray(
  value: unknown,
): value is readonly CollectiveSyncCursorV1[] {
  if (!Array.isArray(value) || value.length > 4_096) return false;
  const streams = new Set<string>();
  let previous = "";
  for (const cursor of value) {
    if (
      !record(cursor) ||
      !exact(cursor, ["headDigest", "sequence", "streamId"]) ||
      !identifier(cursor.streamId) ||
      !logical(cursor.sequence) ||
      !(
        (cursor.sequence === 0 && cursor.headDigest === null) ||
        (cursor.sequence > 0 && digest(cursor.headDigest))
      ) ||
      streams.has(cursor.streamId) ||
      cursor.streamId <= previous
    )
      return false;
    streams.add(cursor.streamId);
    previous = cursor.streamId;
  }
  return true;
}

function identifierArray(
  value: unknown,
  min: number,
  max: number,
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    new Set(value).size === value.length &&
    value.every(identifier) &&
    value.every((entry, index) => index === 0 || value[index - 1] < entry)
  );
}

function digestArray(
  value: unknown,
  min: number,
  max: number,
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    new Set(value).size === value.length &&
    value.every(digest)
  );
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
    actual.every((entry, index) => entry === expected[index])
  );
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
function logical(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
function positive(value: unknown): value is number {
  return logical(value) && Number(value) > 0;
}
function bounded(value: unknown, min: number, max: number): value is number {
  return (
    Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
  );
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && compareMeshTimestamps(value, value).ok;
}
function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  return result.ok ? result.value : 0;
}
function jsonValue(value: unknown): boolean {
  const canonical = canonicalizeMeshJsonBytes(value);
  return canonical.ok;
}
function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value as Record<string, unknown>))
    freeze(child);
  return Object.freeze(value);
}
