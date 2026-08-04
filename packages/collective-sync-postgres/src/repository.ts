import {
  COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
  COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1,
  createCollectiveSyncFrontierV1,
  validateCollectiveSyncSessionV1,
  validateSignedCollectiveSyncEnvelopeV1,
  verifyCollectiveCatchUpCertificateDigestV1,
  verifyCollectiveSyncRecordV1,
} from "@agentplat/collective-sync";
import type {
  CollectiveCatchUpCertificateV1,
  CollectiveSyncAppendResultV1,
  CollectiveSyncChunkReadV1,
  CollectiveSyncCursorV1,
  CollectiveSyncFrontierV1,
  CollectiveSyncReceiptPayloadV1,
  CollectiveSyncRecordV1,
  CollectiveSyncRepositoryV1,
  CollectiveSyncSessionV1,
  SignedCollectiveSyncEnvelopeV1,
} from "@agentplat/collective-sync";
import { canonicalizeMeshJsonBytes } from "@agentplat/mesh-protocol";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

export interface PostgresCollectiveSyncRepositoryOptionsV1 {
  readonly schema?: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly policyDomainId: string;
}

interface HeadRow {
  readonly stream_id: string;
  readonly head_sequence: string | number;
  readonly head_digest: string | null;
}

/** Crash-resumable PostgreSQL repository for one independently hosted peer instance. */
export class PostgresCollectiveSyncRepositoryV1 implements CollectiveSyncRepositoryV1 {
  readonly #prefix: string;
  readonly #scope: readonly [string, string, string, string, string];
  constructor(
    readonly pool: Pool,
    readonly options: PostgresCollectiveSyncRepositoryOptionsV1,
  ) {
    if (
      !pool ||
      !options?.tenantId ||
      !options.meshId ||
      !options.peerId ||
      !options.instanceId ||
      !options.policyDomainId
    )
      throw new TypeError(
        "PostgreSQL collective sync repository scope is required",
      );
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(options.schema ?? defaultPostgresSchema, "schema"))}.`;
    this.#scope = Object.freeze([
      options.tenantId,
      options.meshId,
      options.peerId,
      options.instanceId,
      options.policyDomainId,
    ]);
  }

  async frontier(
    input: Parameters<CollectiveSyncRepositoryV1["frontier"]>[0],
  ): Promise<CollectiveSyncFrontierV1> {
    const result = await this.pool.query<HeadRow>(
      `SELECT stream_id, head_sequence, head_digest
         FROM ${this.#prefix}collective_sync_stream_heads
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5 AND sync_domain = $6
          AND head_sequence > 0
        ORDER BY stream_id`,
      [...this.#scope, input.syncDomain],
    );
    return createCollectiveSyncFrontierV1({
      tenantId: this.options.tenantId,
      meshId: this.options.meshId,
      policyDomainId: this.options.policyDomainId,
      syncDomain: input.syncDomain,
      membership: input.membership,
      entries: result.rows.map((row) =>
        Object.freeze({
          streamId: row.stream_id,
          sequence: integer(row.head_sequence, "sync_head_sequence"),
          headDigest: row.head_digest,
        }),
      ),
    });
  }

  async append(
    input: Parameters<CollectiveSyncRepositoryV1["append"]>[0],
  ): Promise<CollectiveSyncAppendResultV1> {
    const records: CollectiveSyncRecordV1[] = [];
    for (const candidate of input.records) {
      const record = await verifyCollectiveSyncRecordV1(candidate);
      if (
        !record ||
        record.tenantId !== this.options.tenantId ||
        record.meshId !== this.options.meshId ||
        record.policyDomainId !== this.options.policyDomainId ||
        record.syncDomain !== input.syncDomain
      )
        throw new TypeError("invalid_sync_record_scope");
      records.push(record);
    }
    const outcome = await this.#transaction(async (client) => {
      const accepted: string[] = [];
      const duplicate: string[] = [];
      for (const record of records) {
        await client.query(
          `INSERT INTO ${this.#prefix}collective_sync_stream_heads
            (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
             sync_domain, stream_id, head_sequence, head_digest)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NULL)
           ON CONFLICT DO NOTHING`,
          [...this.#scope, input.syncDomain, record.streamId],
        );
        const headResult = await client.query<HeadRow>(
          `SELECT stream_id, head_sequence, head_digest
             FROM ${this.#prefix}collective_sync_stream_heads
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4 AND policy_domain_id = $5 AND sync_domain = $6
              AND stream_id = $7
            FOR UPDATE`,
          [...this.#scope, input.syncDomain, record.streamId],
        );
        const head = headResult.rows[0];
        if (!head) throw new Error("sync_head_missing");
        const existing = await client.query<{ record_digest: string }>(
          `SELECT record_digest
             FROM ${this.#prefix}collective_sync_records
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4 AND policy_domain_id = $5 AND sync_domain = $6
              AND stream_id = $7 AND sequence = $8`,
          [...this.#scope, input.syncDomain, record.streamId, record.sequence],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].record_digest !== record.recordDigest)
            throw new Error("sync_stream_fork");
          duplicate.push(record.recordDigest);
          continue;
        }
        const headSequence = integer(head.head_sequence, "sync_head_sequence");
        if (
          record.sequence !== headSequence + 1 ||
          record.predecessorDigest !== head.head_digest
        )
          throw new Error("sync_predecessor_missing_or_conflicting");
        await client.query(
          `INSERT INTO ${this.#prefix}collective_sync_records
            (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
             sync_domain, stream_id, sequence, predecessor_digest, record_digest, record)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
          [
            ...this.#scope,
            input.syncDomain,
            record.streamId,
            record.sequence,
            record.predecessorDigest,
            record.recordDigest,
            JSON.stringify(record),
          ],
        );
        await client.query(
          `UPDATE ${this.#prefix}collective_sync_stream_heads
              SET head_sequence = $8, head_digest = $9, updated_at = transaction_timestamp()
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4 AND policy_domain_id = $5 AND sync_domain = $6
              AND stream_id = $7`,
          [
            ...this.#scope,
            input.syncDomain,
            record.streamId,
            record.sequence,
            record.recordDigest,
          ],
        );
        accepted.push(record.recordDigest);
      }
      return { accepted, duplicate };
    });
    return Object.freeze({
      acceptedRecordDigests: Object.freeze(outcome.accepted),
      duplicateRecordDigests: Object.freeze(outcome.duplicate),
      frontier: await this.frontier(input),
    });
  }

  async readAfter(
    input: Parameters<CollectiveSyncRepositoryV1["readAfter"]>[0],
  ): Promise<CollectiveSyncChunkReadV1> {
    bounds(input.maximumRecords, input.maximumBytes);
    const cursorsJson = JSON.stringify(input.cursors);
    const conflicts = await this.pool.query<{ stream_id: string }>(
      `WITH cursors AS (
       SELECT * FROM jsonb_to_recordset($7::jsonb)
           AS cursor("streamId" text, sequence bigint, "headDigest" text)
       )
       SELECT cursor."streamId" AS stream_id
         FROM cursors cursor
         LEFT JOIN ${this.#prefix}collective_sync_records record
           ON record.tenant_id = $1 AND record.mesh_id = $2 AND record.peer_id = $3
          AND record.instance_id = $4 AND record.policy_domain_id = $5
          AND record.sync_domain = $6 AND record.stream_id = cursor."streamId"
          AND record.sequence = cursor.sequence
        WHERE cursor.sequence > 0 AND record.record_digest IS DISTINCT FROM cursor."headDigest"
        LIMIT 1`,
      [...this.#scope, input.syncDomain, cursorsJson],
    );
    if (conflicts.rows.length > 0) throw new Error("sync_cursor_conflict");
    const result = await this.pool.query<{ record: unknown }>(
      `WITH cursors AS (
         SELECT * FROM jsonb_to_recordset($7::jsonb)
           AS cursor("streamId" text, sequence bigint, "headDigest" text)
       )
       SELECT record.record
         FROM ${this.#prefix}collective_sync_records record
         LEFT JOIN cursors cursor ON cursor."streamId" = record.stream_id
        WHERE record.tenant_id = $1 AND record.mesh_id = $2 AND record.peer_id = $3
          AND record.instance_id = $4 AND record.policy_domain_id = $5
          AND record.sync_domain = $6
          AND record.sequence > COALESCE(cursor.sequence, 0)
        ORDER BY record.stream_id, record.sequence
        LIMIT $8`,
      [...this.#scope, input.syncDomain, cursorsJson, input.maximumRecords + 1],
    );
    const records: CollectiveSyncRecordV1[] = [];
    let bytes = 0;
    for (const row of result.rows) {
      if (records.length >= input.maximumRecords) break;
      const record = await verifyCollectiveSyncRecordV1(row.record);
      if (!record) throw new Error("sync_record_corrupt");
      const canonical = canonicalizeMeshJsonBytes(record);
      if (!canonical.ok) throw new Error("sync_record_corrupt");
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
    const next = new Map(
      input.cursors.map((cursor) => [cursor.streamId, cursor]),
    );
    for (const record of records)
      next.set(
        record.streamId,
        Object.freeze({
          streamId: record.streamId,
          sequence: record.sequence,
          headDigest: record.recordDigest,
        }),
      );
    return Object.freeze({
      records: Object.freeze(records),
      nextCursors: Object.freeze(
        [...next.values()].sort((left, right) =>
          left.streamId.localeCompare(right.streamId),
        ),
      ),
      hasMore: records.length < result.rows.length,
    });
  }

  async saveSession(session: CollectiveSyncSessionV1): Promise<void> {
    const valid = validateCollectiveSyncSessionV1(session);
    if (!valid) throw new TypeError("invalid_sync_session");
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}collective_sync_sessions
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id, session_id,
         sync_domain, membership_epoch, membership_configuration_digest,
         updated_at_logical_ms, status, session)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       ON CONFLICT (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id, session_id)
       DO UPDATE SET updated_at_logical_ms = EXCLUDED.updated_at_logical_ms,
                     status = EXCLUDED.status, session = EXCLUDED.session,
                     updated_at = transaction_timestamp()
       WHERE collective_sync_sessions.sync_domain = EXCLUDED.sync_domain
         AND collective_sync_sessions.membership_epoch = EXCLUDED.membership_epoch
         AND collective_sync_sessions.membership_configuration_digest = EXCLUDED.membership_configuration_digest
         AND (collective_sync_sessions.updated_at_logical_ms < EXCLUDED.updated_at_logical_ms
              OR (collective_sync_sessions.updated_at_logical_ms = EXCLUDED.updated_at_logical_ms
                  AND collective_sync_sessions.session = EXCLUDED.session))`,
      [
        ...this.#scope,
        valid.sessionId,
        valid.syncDomain,
        valid.membershipEpoch,
        valid.membershipConfigurationDigest,
        valid.updatedAtLogicalMs,
        valid.status,
        JSON.stringify(valid),
      ],
    );
    if ((result.rowCount ?? 0) === 0)
      throw new Error("sync_session_conflict_or_time_regression");
  }

  async loadSession(
    sessionId: string,
  ): Promise<CollectiveSyncSessionV1 | undefined> {
    const result = await this.pool.query<{ session: unknown }>(
      `SELECT session FROM ${this.#prefix}collective_sync_sessions
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5 AND session_id = $6`,
      [...this.#scope, sessionId],
    );
    if (!result.rows[0]) return undefined;
    const valid = validateCollectiveSyncSessionV1(result.rows[0].session);
    if (!valid) throw new Error("sync_session_corrupt");
    return valid;
  }

  async saveReceipt(
    receipt: SignedCollectiveSyncEnvelopeV1<CollectiveSyncReceiptPayloadV1>,
  ): Promise<void> {
    const valid =
      validateSignedCollectiveSyncEnvelopeV1<CollectiveSyncReceiptPayloadV1>(
        receipt,
      );
    if (!valid || valid.payload.type !== "sync.receipt")
      throw new TypeError("invalid_sync_receipt");
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}collective_sync_receipts
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
         message_id, chunk_digest, receipt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        valid.messageId,
        valid.payload.chunkDigest,
        JSON.stringify(valid),
      ],
    );
    if ((result.rowCount ?? 0) > 0) return;
    const existing = await this.pool.query<{ chunk_digest: string }>(
      `SELECT chunk_digest FROM ${this.#prefix}collective_sync_receipts
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5 AND message_id = $6`,
      [...this.#scope, valid.messageId],
    );
    if (existing.rows[0]?.chunk_digest !== valid.payload.chunkDigest)
      throw new Error("sync_receipt_conflict");
  }

  async saveCertificate(
    certificate: CollectiveCatchUpCertificateV1,
  ): Promise<void> {
    const valid = await verifyCollectiveCatchUpCertificateDigestV1(certificate);
    if (!valid) throw new TypeError("invalid_sync_certificate");
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}collective_sync_certificates
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id, sync_domain,
         certificate_id, certificate_digest, membership_epoch,
         certified_at_logical_ms, certificate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        valid.syncDomain,
        valid.certificateId,
        valid.certificateDigest,
        valid.membershipEpoch,
        valid.certifiedAtLogicalMs,
        JSON.stringify(valid),
      ],
    );
    if ((result.rowCount ?? 0) > 0) return;
    const existing = await this.pool.query<{ certificate_digest: string }>(
      `SELECT certificate_digest FROM ${this.#prefix}collective_sync_certificates
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5 AND certificate_id = $6`,
      [...this.#scope, valid.certificateId],
    );
    if (existing.rows[0]?.certificate_digest !== valid.certificateDigest)
      throw new Error("sync_certificate_conflict");
  }

  async getCertificate(
    certificateId: string,
  ): Promise<CollectiveCatchUpCertificateV1 | undefined> {
    const result = await this.pool.query<{ certificate: unknown }>(
      `SELECT certificate FROM ${this.#prefix}collective_sync_certificates
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5 AND certificate_id = $6`,
      [...this.#scope, certificateId],
    );
    if (!result.rows[0]) return undefined;
    const valid = await verifyCollectiveCatchUpCertificateDigestV1(
      result.rows[0].certificate,
    );
    if (!valid) throw new Error("sync_certificate_corrupt");
    return valid;
  }

  async latestCertificate(
    syncDomain: string,
  ): Promise<CollectiveCatchUpCertificateV1 | undefined> {
    const result = await this.pool.query<{ certificate: unknown }>(
      `SELECT certificate FROM ${this.#prefix}collective_sync_certificates
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5 AND sync_domain = $6
        ORDER BY membership_epoch DESC, certified_at_logical_ms DESC,
                 certificate_id DESC LIMIT 1`,
      [...this.#scope, syncDomain],
    );
    if (!result.rows[0]) return undefined;
    const valid = await verifyCollectiveCatchUpCertificateDigestV1(
      result.rows[0].certificate,
    );
    if (!valid) throw new Error("sync_certificate_corrupt");
    return valid;
  }

  async #transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function integer(value: string | number, code: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}
function bounds(records: number, bytes: number): void {
  if (
    !Number.isSafeInteger(records) ||
    records < 1 ||
    records > COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1 ||
    !Number.isSafeInteger(bytes) ||
    bytes < 1_024 ||
    bytes > COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1
  )
    throw new TypeError("invalid_sync_chunk_bounds");
}
