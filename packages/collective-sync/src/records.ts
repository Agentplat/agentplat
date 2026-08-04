import type { CollectiveQuorumMembershipBindingV1 } from "@agentplat/collective-quorum";
import type {
  CollectiveCatchUpCertificateV1,
  CollectiveSyncCursorV1,
  CollectiveSyncFrontierV1,
  CollectiveSyncRecordV1,
  SignedCollectiveSyncEnvelopeV1,
  CollectiveSyncAttestationPayloadV1,
} from "./contracts.js";
import {
  validateCollectiveCatchUpCertificateShapeV1,
  validateCollectiveSyncFrontierV1,
  validateCollectiveSyncRecordV1,
} from "./codec.js";
import { collectiveSyncDigestV1, collectiveSyncMessageIdV1 } from "./crypto.js";

export async function createCollectiveSyncRecordV1(
  input: Omit<
    CollectiveSyncRecordV1,
    "schemaVersion" | "payloadDigest" | "recordDigest"
  > & { readonly crypto?: Crypto },
): Promise<CollectiveSyncRecordV1> {
  const payloadDigest = await collectiveSyncDigestV1(
    input.payload,
    input.crypto,
  );
  const body = {
    schemaVersion: 1 as const,
    tenantId: input.tenantId,
    meshId: input.meshId,
    policyDomainId: input.policyDomainId,
    syncDomain: input.syncDomain,
    streamId: input.streamId,
    sequence: input.sequence,
    predecessorDigest: input.predecessorDigest,
    payload: input.payload,
    payloadDigest,
    createdAtLogicalMs: input.createdAtLogicalMs,
  };
  const recordDigest = await collectiveSyncDigestV1(
    { domain: "agentplat.collective-sync.record.v1", record: body },
    input.crypto,
  );
  const record = validateCollectiveSyncRecordV1({ ...body, recordDigest });
  if (!record) throw new TypeError("invalid_sync_record");
  return record;
}

export async function verifyCollectiveSyncRecordV1(
  record: unknown,
  crypto?: Crypto,
): Promise<CollectiveSyncRecordV1 | null> {
  const valid = validateCollectiveSyncRecordV1(record);
  if (!valid) return null;
  const payloadDigest = await collectiveSyncDigestV1(valid.payload, crypto);
  const { recordDigest, ...body } = valid;
  const expected = await collectiveSyncDigestV1(
    { domain: "agentplat.collective-sync.record.v1", record: body },
    crypto,
  );
  return payloadDigest === valid.payloadDigest && expected === recordDigest
    ? valid
    : null;
}

export async function createCollectiveSyncFrontierV1(input: {
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly syncDomain: string;
  readonly membership: CollectiveQuorumMembershipBindingV1;
  readonly entries: readonly CollectiveSyncCursorV1[];
  readonly crypto?: Crypto;
}): Promise<CollectiveSyncFrontierV1> {
  const entries = Object.freeze(
    [...input.entries]
      .map((entry) => Object.freeze({ ...entry }))
      .sort((left, right) => left.streamId.localeCompare(right.streamId)),
  );
  const body = {
    schemaVersion: 1 as const,
    tenantId: input.tenantId,
    meshId: input.meshId,
    policyDomainId: input.policyDomainId,
    syncDomain: input.syncDomain,
    membershipEpoch: input.membership.epoch,
    membershipConfigurationDigest: input.membership.configurationDigest,
    entries,
  };
  const frontierDigest = await collectiveSyncDigestV1(
    { domain: "agentplat.collective-sync.frontier.v1", frontier: body },
    input.crypto,
  );
  const frontier = validateCollectiveSyncFrontierV1({
    ...body,
    frontierDigest,
  });
  if (!frontier) throw new TypeError("invalid_sync_frontier");
  return frontier;
}

export async function verifyCollectiveSyncFrontierV1(
  frontier: unknown,
  crypto?: Crypto,
): Promise<CollectiveSyncFrontierV1 | null> {
  const valid = validateCollectiveSyncFrontierV1(frontier);
  if (!valid) return null;
  const { frontierDigest, ...body } = valid;
  const expected = await collectiveSyncDigestV1(
    { domain: "agentplat.collective-sync.frontier.v1", frontier: body },
    crypto,
  );
  return expected === frontierDigest ? valid : null;
}

export async function collectiveSyncChunkDigestV1(input: {
  readonly sessionId: string;
  readonly sourceFrontierDigest: string;
  readonly records: readonly CollectiveSyncRecordV1[];
  readonly nextCursors: readonly CollectiveSyncCursorV1[];
  readonly hasMore: boolean;
  readonly crypto?: Crypto;
}): Promise<string> {
  return collectiveSyncDigestV1(
    {
      domain: "agentplat.collective-sync.chunk.v1",
      sessionId: input.sessionId,
      sourceFrontierDigest: input.sourceFrontierDigest,
      recordDigests: input.records.map(({ recordDigest }) => recordDigest),
      nextCursors: input.nextCursors,
      hasMore: input.hasMore,
    },
    input.crypto,
  );
}

export async function createCollectiveCatchUpCertificateV1(input: {
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly syncDomain: string;
  readonly targetPeerId: string;
  readonly targetInstanceId: string;
  readonly membership: CollectiveQuorumMembershipBindingV1;
  readonly frontier: CollectiveSyncFrontierV1;
  readonly threshold: number;
  readonly attestations: readonly SignedCollectiveSyncEnvelopeV1<CollectiveSyncAttestationPayloadV1>[];
  readonly certifiedAtLogicalMs: number;
  readonly crypto?: Crypto;
}): Promise<CollectiveCatchUpCertificateV1> {
  const frontier = await verifyCollectiveSyncFrontierV1(
    input.frontier,
    input.crypto,
  );
  if (
    !frontier ||
    frontier.tenantId !== input.tenantId ||
    frontier.meshId !== input.meshId ||
    frontier.policyDomainId !== input.policyDomainId ||
    frontier.syncDomain !== input.syncDomain ||
    frontier.membershipEpoch !== input.membership.epoch ||
    frontier.membershipConfigurationDigest !==
      input.membership.configurationDigest
  )
    throw new TypeError("invalid_sync_certificate_frontier");
  const attestations = Object.freeze(
    [...input.attestations].sort((left, right) =>
      left.senderPeerId.localeCompare(right.senderPeerId),
    ),
  );
  const body = {
    schemaVersion: 1 as const,
    kind: "causal_catch_up" as const,
    tenantId: input.tenantId,
    meshId: input.meshId,
    policyDomainId: input.policyDomainId,
    syncDomain: input.syncDomain,
    targetPeerId: input.targetPeerId,
    targetInstanceId: input.targetInstanceId,
    membershipEpoch: input.membership.epoch,
    membershipConfigurationDigest: input.membership.configurationDigest,
    frontier,
    threshold: input.threshold,
    attestations,
    certifiedAtLogicalMs: input.certifiedAtLogicalMs,
  };
  const certificateDigest = await collectiveSyncDigestV1(
    { domain: "agentplat.collective-sync.certificate.v1", certificate: body },
    input.crypto,
  );
  const certificateId = await collectiveSyncMessageIdV1(
    "certificate",
    certificateDigest,
    input.crypto,
  );
  const certificate = validateCollectiveCatchUpCertificateShapeV1({
    ...body,
    certificateId,
    certificateDigest,
  });
  if (!certificate) throw new TypeError("invalid_sync_certificate");
  return certificate;
}

export async function verifyCollectiveCatchUpCertificateDigestV1(
  certificate: unknown,
  crypto?: Crypto,
): Promise<CollectiveCatchUpCertificateV1 | null> {
  const valid = validateCollectiveCatchUpCertificateShapeV1(certificate);
  if (!valid) return null;
  if (!(await verifyCollectiveSyncFrontierV1(valid.frontier, crypto)))
    return null;
  const { certificateId: _id, certificateDigest, ...body } = valid;
  const expected = await collectiveSyncDigestV1(
    { domain: "agentplat.collective-sync.certificate.v1", certificate: body },
    crypto,
  );
  const expectedId = await collectiveSyncMessageIdV1(
    "certificate",
    expected,
    crypto,
  );
  return expected === certificateDigest && expectedId === valid.certificateId
    ? valid
    : null;
}

export function compareCollectiveSyncFrontiersV1(
  local: CollectiveSyncFrontierV1,
  target: CollectiveSyncFrontierV1,
): "equal" | "behind" | "ahead" | "diverged" {
  if (local.frontierDigest === target.frontierDigest) return "equal";
  const localMap = new Map(
    local.entries.map((entry) => [entry.streamId, entry]),
  );
  const targetMap = new Map(
    target.entries.map((entry) => [entry.streamId, entry]),
  );
  let behind = false;
  let ahead = false;
  for (const streamId of new Set([...localMap.keys(), ...targetMap.keys()])) {
    const left = localMap.get(streamId);
    const right = targetMap.get(streamId);
    const leftSequence = left?.sequence ?? 0;
    const rightSequence = right?.sequence ?? 0;
    if (leftSequence < rightSequence) behind = true;
    if (leftSequence > rightSequence) ahead = true;
    if (
      leftSequence === rightSequence &&
      leftSequence > 0 &&
      left?.headDigest !== right?.headDigest
    )
      return "diverged";
  }
  return behind && ahead
    ? "diverged"
    : behind
      ? "behind"
      : ahead
        ? "ahead"
        : "diverged";
}
