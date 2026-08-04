import { canonicalizeMeshJsonBytes } from "@agentplat/mesh-protocol";
import type {
  CollectiveCatchUpCertificateV1,
  CollectiveSyncAppendResultV1,
  CollectiveSyncChunkReadV1,
  CollectiveSyncCursorV1,
  CollectiveSyncFrontierV1,
  CollectiveSyncReceiptPayloadV1,
  CollectiveSyncRecordV1,
  CollectiveSyncRepositoryV1,
  CollectiveSyncScopeV1,
  CollectiveSyncSessionV1,
  SignedCollectiveSyncEnvelopeV1,
} from "./contracts.js";
import {
  COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
  COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1,
} from "./contracts.js";
import {
  validateCollectiveCatchUpCertificateShapeV1,
  validateCollectiveSyncSessionV1,
  validateSignedCollectiveSyncEnvelopeV1,
} from "./codec.js";
import {
  createCollectiveSyncFrontierV1,
  verifyCollectiveSyncRecordV1,
} from "./records.js";

/** Deterministic repository for tests and embedded single-process hosts. */
export class InMemoryCollectiveSyncRepositoryV1 implements CollectiveSyncRepositoryV1 {
  readonly #records = new Map<string, Map<number, CollectiveSyncRecordV1>>();
  readonly #sessions = new Map<string, CollectiveSyncSessionV1>();
  readonly #receipts = new Map<
    string,
    SignedCollectiveSyncEnvelopeV1<CollectiveSyncReceiptPayloadV1>
  >();
  readonly #certificates = new Map<string, CollectiveCatchUpCertificateV1>();

  constructor(readonly scope: CollectiveSyncScopeV1) {
    if (
      !scope?.tenantId ||
      !scope.meshId ||
      !scope.peerId ||
      !scope.instanceId ||
      !scope.policyDomainId
    )
      throw new TypeError("collective sync repository scope is required");
  }

  frontier(
    input: Parameters<CollectiveSyncRepositoryV1["frontier"]>[0],
  ): Promise<CollectiveSyncFrontierV1> {
    return createCollectiveSyncFrontierV1({
      tenantId: this.scope.tenantId,
      meshId: this.scope.meshId,
      policyDomainId: this.scope.policyDomainId,
      syncDomain: input.syncDomain,
      membership: input.membership,
      entries: this.#cursors(input.syncDomain),
    });
  }

  async append(
    input: Parameters<CollectiveSyncRepositoryV1["append"]>[0],
  ): Promise<CollectiveSyncAppendResultV1> {
    const accepted: string[] = [];
    const duplicate: string[] = [];
    const staged = new Map<string, Map<number, CollectiveSyncRecordV1>>();
    for (const [key, records] of this.#records)
      staged.set(key, new Map(records));
    for (const candidate of input.records) {
      const record = await verifyCollectiveSyncRecordV1(candidate);
      if (
        !record ||
        record.tenantId !== this.scope.tenantId ||
        record.meshId !== this.scope.meshId ||
        record.policyDomainId !== this.scope.policyDomainId ||
        record.syncDomain !== input.syncDomain
      )
        throw new TypeError("invalid_sync_record_scope");
      const key = streamKey(input.syncDomain, record.streamId);
      const stream =
        staged.get(key) ?? new Map<number, CollectiveSyncRecordV1>();
      const existing = stream.get(record.sequence);
      if (existing) {
        if (existing.recordDigest !== record.recordDigest)
          throw new Error("sync_stream_fork");
        duplicate.push(record.recordDigest);
        continue;
      }
      const predecessor =
        record.sequence === 1 ? null : stream.get(record.sequence - 1);
      if (
        record.sequence > 1 &&
        predecessor?.recordDigest !== record.predecessorDigest
      )
        throw new Error("sync_predecessor_missing_or_conflicting");
      if (record.sequence === 1 && stream.size > 0)
        throw new Error("sync_stream_fork");
      const nextSequence =
        stream.size === 0 ? 1 : Math.max(...stream.keys()) + 1;
      if (record.sequence !== nextSequence)
        throw new Error("sync_sequence_gap");
      stream.set(record.sequence, record);
      staged.set(key, stream);
      accepted.push(record.recordDigest);
    }
    this.#records.clear();
    for (const [key, records] of staged) this.#records.set(key, records);
    const frontier = await this.frontier(input);
    return Object.freeze({
      acceptedRecordDigests: Object.freeze(accepted),
      duplicateRecordDigests: Object.freeze(duplicate),
      frontier,
    });
  }

  async readAfter(
    input: Parameters<CollectiveSyncRepositoryV1["readAfter"]>[0],
  ): Promise<CollectiveSyncChunkReadV1> {
    if (
      !Number.isSafeInteger(input.maximumRecords) ||
      input.maximumRecords < 1 ||
      input.maximumRecords > COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1 ||
      !Number.isSafeInteger(input.maximumBytes) ||
      input.maximumBytes < 1_024 ||
      input.maximumBytes > COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1
    )
      throw new TypeError("invalid_sync_chunk_bounds");
    const cursorMap = new Map(
      input.cursors.map((entry) => [entry.streamId, entry]),
    );
    const candidates: CollectiveSyncRecordV1[] = [];
    for (const [key, stream] of [...this.#records].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const [domain, streamId] = splitKey(key);
      if (domain !== input.syncDomain) continue;
      const cursor = cursorMap.get(streamId);
      const after = cursor?.sequence ?? 0;
      if (
        cursor &&
        after > 0 &&
        stream.get(after)?.recordDigest !== cursor.headDigest
      )
        throw new Error("sync_cursor_conflict");
      for (const [sequence, record] of [...stream].sort(
        ([left], [right]) => left - right,
      )) {
        if (sequence > after) candidates.push(record);
      }
    }
    const records: CollectiveSyncRecordV1[] = [];
    let bytes = 0;
    for (const record of candidates) {
      if (records.length >= input.maximumRecords) break;
      const canonical = canonicalizeMeshJsonBytes(record);
      if (!canonical.ok) throw new Error("sync_record_not_canonical");
      if (
        records.length > 0 &&
        bytes + canonical.value.byteLength > input.maximumBytes
      )
        break;
      if (canonical.value.byteLength > input.maximumBytes)
        throw new Error("sync_record_exceeds_chunk_limit");
      records.push(record);
      bytes += canonical.value.byteLength;
    }
    const next = new Map(cursorMap);
    for (const record of records)
      next.set(
        record.streamId,
        Object.freeze({
          streamId: record.streamId,
          sequence: record.sequence,
          headDigest: record.recordDigest,
        }),
      );
    const nextCursors = Object.freeze(
      [...next.values()].sort((left, right) =>
        left.streamId.localeCompare(right.streamId),
      ),
    );
    return Object.freeze({
      records: Object.freeze(records),
      nextCursors,
      hasMore: records.length < candidates.length,
    });
  }

  readRecord(
    input: Parameters<CollectiveSyncRepositoryV1["readRecord"]>[0],
  ): Promise<CollectiveSyncRecordV1 | undefined> {
    if (
      typeof input.syncDomain !== "string" ||
      typeof input.streamId !== "string" ||
      !Number.isSafeInteger(input.sequence) ||
      input.sequence < 1
    )
      return Promise.reject(new TypeError("invalid_sync_record_lookup"));
    return Promise.resolve(
      this.#records
        .get(streamKey(input.syncDomain, input.streamId))
        ?.get(input.sequence),
    );
  }

  saveSession(session: CollectiveSyncSessionV1): Promise<void> {
    const valid = validateCollectiveSyncSessionV1(session);
    if (!valid) return Promise.reject(new TypeError("invalid_sync_session"));
    const existing = this.#sessions.get(valid.sessionId);
    if (
      existing &&
      (existing.membershipEpoch !== valid.membershipEpoch ||
        existing.membershipConfigurationDigest !==
          valid.membershipConfigurationDigest ||
        existing.syncDomain !== valid.syncDomain)
    )
      return Promise.reject(new Error("sync_session_conflict"));
    if (existing && valid.updatedAtLogicalMs < existing.updatedAtLogicalMs)
      return Promise.reject(new Error("sync_session_time_regression"));
    if (
      existing &&
      valid.updatedAtLogicalMs === existing.updatedAtLogicalMs &&
      !canonicalEqual(existing, valid)
    )
      return Promise.reject(new Error("sync_session_same_time_conflict"));
    this.#sessions.set(valid.sessionId, valid);
    return Promise.resolve();
  }

  loadSession(sessionId: string): Promise<CollectiveSyncSessionV1 | undefined> {
    return Promise.resolve(this.#sessions.get(sessionId));
  }

  saveReceipt(
    receipt: SignedCollectiveSyncEnvelopeV1<CollectiveSyncReceiptPayloadV1>,
  ): Promise<void> {
    const valid =
      validateSignedCollectiveSyncEnvelopeV1<CollectiveSyncReceiptPayloadV1>(
        receipt,
      );
    if (!valid || valid.payload.type !== "sync.receipt")
      return Promise.reject(new TypeError("invalid_sync_receipt"));
    const existing = this.#receipts.get(valid.messageId);
    if (existing && existing.payload.chunkDigest !== valid.payload.chunkDigest)
      return Promise.reject(new Error("sync_receipt_conflict"));
    this.#receipts.set(valid.messageId, valid);
    return Promise.resolve();
  }

  saveCertificate(certificate: CollectiveCatchUpCertificateV1): Promise<void> {
    const valid = validateCollectiveCatchUpCertificateShapeV1(certificate);
    if (!valid)
      return Promise.reject(new TypeError("invalid_sync_certificate"));
    const existing = this.#certificates.get(valid.certificateId);
    if (existing && existing.certificateDigest !== valid.certificateDigest)
      return Promise.reject(new Error("sync_certificate_conflict"));
    this.#certificates.set(valid.certificateId, valid);
    return Promise.resolve();
  }

  getCertificate(
    certificateId: string,
  ): Promise<CollectiveCatchUpCertificateV1 | undefined> {
    return Promise.resolve(this.#certificates.get(certificateId));
  }

  latestCertificate(
    syncDomain: string,
  ): Promise<CollectiveCatchUpCertificateV1 | undefined> {
    const latest = [...this.#certificates.values()]
      .filter((entry) => entry.syncDomain === syncDomain)
      .sort(
        (left, right) =>
          right.membershipEpoch - left.membershipEpoch ||
          right.certifiedAtLogicalMs - left.certifiedAtLogicalMs ||
          right.certificateId.localeCompare(left.certificateId),
      )[0];
    return Promise.resolve(latest);
  }

  #cursors(syncDomain: string): readonly CollectiveSyncCursorV1[] {
    const cursors: CollectiveSyncCursorV1[] = [];
    for (const [key, stream] of this.#records) {
      const [domain, streamId] = splitKey(key);
      if (domain !== syncDomain || stream.size === 0) continue;
      const sequence = Math.max(...stream.keys());
      cursors.push(
        Object.freeze({
          streamId,
          sequence,
          headDigest: stream.get(sequence)!.recordDigest,
        }),
      );
    }
    return Object.freeze(
      cursors.sort((left, right) =>
        left.streamId.localeCompare(right.streamId),
      ),
    );
  }
}

function streamKey(domain: string, streamId: string): string {
  return `${domain}\u0000${streamId}`;
}
function splitKey(key: string): readonly [string, string] {
  const index = key.indexOf("\u0000");
  return [key.slice(0, index), key.slice(index + 1)];
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  const leftBytes = canonicalizeMeshJsonBytes(left);
  const rightBytes = canonicalizeMeshJsonBytes(right);
  if (!leftBytes.ok || !rightBytes.ok) return false;
  if (leftBytes.value.byteLength !== rightBytes.value.byteLength) return false;
  return leftBytes.value.every(
    (byte, index) => byte === rightBytes.value[index],
  );
}
