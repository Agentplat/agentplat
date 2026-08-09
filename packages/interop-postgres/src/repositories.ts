import {
  captureInteropDigestCryptoV1,
  type InteropIdempotencyRecordV1,
  type InteropIdempotencyStoreV1,
  type InteropOutboundSequenceStoreV1,
  type InteropResponseEnvelopeV1,
  type InteropSequenceAdmissionV1,
  type InteropSequenceStoreV1,
} from "@agentplat/interop";
import {
  COGNITIVE_OPERATION_KINDS_V2,
  createWebCryptoCognitiveIntegrityV2,
  validateCognitiveSessionStateV2,
  type CognitiveDurableOperationRecordV2,
  type CognitiveDurableOperationStoreV2,
  type CognitiveSessionStateV2,
} from "@agentplat/runtime/cognitive-adapter";
import type {
  GovernedInteropSessionRecordV1,
  GovernedInteropSessionStoreV1,
} from "@agentplat/interop/governed-lifecycle";
import { validateGovernedInteropSessionRecordV1 } from "@agentplat/interop/governed-lifecycle";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const DEFAULT_MAXIMUM_RECORD_BYTES = 1_048_576;
const DEFAULT_MAXIMUM_RECEIPT_HISTORY = 100_000;

export interface InteropPostgresRepositoryOptionsV1 {
  readonly schema?: string;
  /** Isolates independent deployments in one PostgreSQL schema. */
  readonly namespace: string;
  readonly maximumRecordBytes?: number;
  readonly crypto?: Crypto;
}

export interface CognitiveInteropPostgresRepositoryOptionsV1
  extends InteropPostgresRepositoryOptionsV1 {
  /** Must be at least the maximum receipt retention configured on the adapter. */
  readonly maximumReceiptHistory?: number;
}

type Query = Pool["query"];

/** PostgreSQL CAS custody for governed interop session records. */
export class PostgresGovernedInteropSessionStoreV1 implements GovernedInteropSessionStoreV1 {
  readonly #prefix: string;
  readonly #namespace: string;
  readonly #maximumRecordBytes: number;
  readonly #crypto: Crypto;
  readonly #query: Query;

  constructor(pool: Pool, options: InteropPostgresRepositoryOptionsV1) {
    const captured = repositoryOptions(pool, options);
    this.#prefix = captured.prefix;
    this.#namespace = captured.namespace;
    this.#maximumRecordBytes = captured.maximumRecordBytes;
    this.#crypto = captured.crypto;
    this.#query = pool.query.bind(pool);
  }

  async load(
    recordKey: string,
  ): Promise<GovernedInteropSessionRecordV1 | null> {
    const key = token(recordKey, "recordKey", 256);
    const result = await this.#query<{
      revision: string | number;
      record_digest: string;
      logical_time_high_water_ms: string | number;
      record: GovernedInteropSessionRecordV1;
    }>(
      `SELECT revision, record_digest, logical_time_high_water_ms, record
         FROM ${this.#prefix}interop_governed_sessions
        WHERE namespace = $1 AND record_key = $2`,
      [this.#namespace, key],
    );
    const row = result.rows[0];
    if (!row) return null;
    const revision = safeInteger(row.revision, "stored revision", 0);
    const logicalTimeHighWaterMs = safeInteger(
      row.logical_time_high_water_ms,
      "stored logical time",
      0,
    );
    const record = jsonSnapshot(
      row.record,
      this.#maximumRecordBytes,
      "stored governed interop record",
    );
    if (
      record.recordKey !== key ||
      record.revision !== revision ||
      record.recordDigest !== row.record_digest ||
      record.logicalTimeHighWaterMs !== logicalTimeHighWaterMs
    )
      throw new TypeError(
        "governed interop PostgreSQL columns diverge from the record",
      );
    return validateGovernedInteropSessionRecordV1(record, this.#crypto);
  }

  async compareAndSet(input: {
    readonly recordKey: string;
    readonly expectedRevision: number | null;
    readonly expectedRecordDigest: string | null;
    readonly next: GovernedInteropSessionRecordV1;
  }): Promise<boolean> {
    if (!input || typeof input !== "object")
      throw new TypeError("governed interop CAS input is required");
    const recordKey = token(input.recordKey, "recordKey", 256);
    const expectedRevision = nullableSafeInteger(
      input.expectedRevision,
      "expectedRevision",
      0,
    );
    const expectedRecordDigest = nullableDigest(
      input.expectedRecordDigest,
      "expectedRecordDigest",
    );
    const next = await validateGovernedInteropSessionRecordV1(
      jsonSnapshot(
        input.next,
        this.#maximumRecordBytes,
        "governed interop record",
      ),
      this.#crypto,
    );
    if (
      next.recordKey !== recordKey ||
      next.revision !== (expectedRevision ?? -1) + 1 ||
      next.predecessorRecordDigest !== expectedRecordDigest ||
      (expectedRevision === null) !== (expectedRecordDigest === null)
    )
      return false;
    digest(next.recordDigest, "next.recordDigest");
    safeInteger(next.logicalTimeHighWaterMs, "next.logicalTimeHighWaterMs", 0);
    const encoded = JSON.stringify(next);
    if (expectedRevision === null) {
      const inserted = await this.#query(
        `INSERT INTO ${this.#prefix}interop_governed_sessions
          (namespace, record_key, revision, record_digest,
           logical_time_high_water_ms, record)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          this.#namespace,
          recordKey,
          next.revision,
          next.recordDigest,
          next.logicalTimeHighWaterMs,
          encoded,
        ],
      );
      return (inserted.rowCount ?? 0) === 1;
    }
    const updated = await this.#query(
      `UPDATE ${this.#prefix}interop_governed_sessions
          SET revision = $6, record_digest = $7,
              logical_time_high_water_ms = $8, record = $9::jsonb,
              updated_at = transaction_timestamp()
        WHERE namespace = $1 AND record_key = $2
          AND revision = $3 AND record_digest = $4
          AND logical_time_high_water_ms <= $5`,
      [
        this.#namespace,
        recordKey,
        expectedRevision,
        expectedRecordDigest,
        next.logicalTimeHighWaterMs,
        next.revision,
        next.recordDigest,
        next.logicalTimeHighWaterMs,
        encoded,
      ],
    );
    return (updated.rowCount ?? 0) === 1;
  }
}

/** Transactional PostgreSQL allocator preserving sequence heads and retry keys. */
export class PostgresInteropOutboundSequenceStoreV1 implements InteropOutboundSequenceStoreV1 {
  readonly #prefix: string;
  readonly #namespace: string;
  readonly #connect: Pool["connect"];
  readonly #query: Query;

  constructor(pool: Pool, options: InteropPostgresRepositoryOptionsV1) {
    const captured = repositoryOptions(pool, options);
    this.#prefix = captured.prefix;
    this.#namespace = captured.namespace;
    this.#connect = pool.connect.bind(pool);
    this.#query = pool.query.bind(pool);
  }

  async next(input: {
    readonly issuerId: string;
    readonly sessionId: string;
    readonly maximumSequence: number;
    readonly idempotencyKey?: string;
  }): Promise<number> {
    if (!input || typeof input !== "object")
      throw new TypeError("outbound sequence input is required");
    const issuerId = token(input.issuerId, "issuerId", 256);
    const sessionId = token(input.sessionId, "sessionId", 256);
    const maximumSequence = safeInteger(
      input.maximumSequence,
      "maximumSequence",
      1,
    );
    const idempotencyKey =
      input.idempotencyKey === undefined
        ? null
        : token(input.idempotencyKey, "idempotencyKey", 256);
    const client = await this.#connect();
    const query = client.query.bind(client);
    try {
      await query("BEGIN");
      await query(
        `INSERT INTO ${this.#prefix}interop_outbound_sequence_heads
          (namespace, issuer_id, session_id, current_sequence)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT DO NOTHING`,
        [this.#namespace, issuerId, sessionId],
      );
      const head = await query<{ current_sequence: string | number }>(
        `SELECT current_sequence
           FROM ${this.#prefix}interop_outbound_sequence_heads
          WHERE namespace = $1 AND issuer_id = $2 AND session_id = $3
          FOR UPDATE`,
        [this.#namespace, issuerId, sessionId],
      );
      const current = safeInteger(
        head.rows[0]?.current_sequence,
        "stored outbound sequence",
        0,
      );
      if (idempotencyKey !== null) {
        const prior = await query<{ sequence: string | number }>(
          `SELECT sequence
             FROM ${this.#prefix}interop_outbound_sequence_allocations
            WHERE namespace = $1 AND issuer_id = $2 AND session_id = $3
              AND idempotency_key = $4`,
          [this.#namespace, issuerId, sessionId, idempotencyKey],
        );
        const allocated = prior.rows[0]?.sequence;
        if (allocated !== undefined) {
          const sequence = safeInteger(
            allocated,
            "stored outbound allocation",
            1,
          );
          if (sequence > maximumSequence)
            throw new RangeError("interop outbound sequence capacity exceeded");
          await query("COMMIT");
          return sequence;
        }
      }
      if (current >= maximumSequence)
        throw new RangeError("interop outbound sequence capacity exceeded");
      const sequence = current + 1;
      await query(
        `UPDATE ${this.#prefix}interop_outbound_sequence_heads
            SET current_sequence = $4, updated_at = transaction_timestamp()
          WHERE namespace = $1 AND issuer_id = $2 AND session_id = $3`,
        [this.#namespace, issuerId, sessionId, sequence],
      );
      if (idempotencyKey !== null)
        await query(
          `INSERT INTO ${this.#prefix}interop_outbound_sequence_allocations
            (namespace, issuer_id, session_id, idempotency_key, sequence)
           VALUES ($1, $2, $3, $4, $5)`,
          [this.#namespace, issuerId, sessionId, idempotencyKey, sequence],
        );
      await query("COMMIT");
      return sequence;
    } catch (error) {
      await query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async current(input: {
    readonly issuerId: string;
    readonly sessionId: string;
  }): Promise<number> {
    if (!input || typeof input !== "object")
      throw new TypeError("outbound sequence scope is required");
    const issuerId = token(input.issuerId, "issuerId", 256);
    const sessionId = token(input.sessionId, "sessionId", 256);
    const result = await this.#query<{ current_sequence: string | number }>(
      `SELECT current_sequence
         FROM ${this.#prefix}interop_outbound_sequence_heads
        WHERE namespace = $1 AND issuer_id = $2 AND session_id = $3`,
      [this.#namespace, issuerId, sessionId],
    );
    const value = result.rows[0]?.current_sequence;
    return value === undefined
      ? 0
      : safeInteger(value, "stored outbound sequence", 0);
  }
}

/** Restart-safe inbound replay custody. Response bytes are retained exactly as JSON. */
export class PostgresInteropIdempotencyStoreV1 implements InteropIdempotencyStoreV1 {
  readonly #prefix: string;
  readonly #namespace: string;
  readonly #maximumRecordBytes: number;
  readonly #connect: Pool["connect"];
  readonly #query: Query;

  constructor(pool: Pool, options: InteropPostgresRepositoryOptionsV1) {
    const captured = repositoryOptions(pool, options);
    this.#prefix = captured.prefix;
    this.#namespace = captured.namespace;
    this.#maximumRecordBytes = captured.maximumRecordBytes;
    this.#connect = pool.connect.bind(pool);
    this.#query = pool.query.bind(pool);
  }

  async load(idempotencyKey: string): Promise<InteropIdempotencyRecordV1 | null> {
    const key = token(idempotencyKey, "idempotencyKey", 256);
    const result = await this.#query<{
      request_digest: string;
      reservation_id: string;
      reserved_until_logical_ms: string | number;
      response: InteropResponseEnvelopeV1 | null;
    }>(
      `SELECT request_digest, reservation_id, reserved_until_logical_ms, response
         FROM ${this.#prefix}interop_idempotency_records
        WHERE namespace = $1 AND idempotency_key = $2`,
      [this.#namespace, key],
    );
    const row = result.rows[0];
    if (!row) return null;
    const response = row.response === null ? null : jsonSnapshot(
      row.response,
      this.#maximumRecordBytes,
      "stored interop idempotency response",
    );
    return Object.freeze({
      requestDigest: digest(row.request_digest, "stored request digest"),
      reservationId: token(row.reservation_id, "stored reservationId", 256),
      reservedUntilLogicalMs: safeInteger(
        row.reserved_until_logical_ms,
        "stored reservation expiry",
        0,
      ),
      response,
    });
  }

  async reserve(input: {
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly reservationId: string;
    readonly logicalTimeMs: number;
    readonly reservedUntilLogicalMs: number;
  }): Promise<boolean> {
    const key = token(input.idempotencyKey, "idempotencyKey", 256);
    const requestDigest = digest(input.requestDigest, "requestDigest");
    const reservationId = token(input.reservationId, "reservationId", 256);
    const logicalTimeMs = safeInteger(input.logicalTimeMs, "logicalTimeMs", 0);
    const reservedUntilLogicalMs = safeInteger(
      input.reservedUntilLogicalMs,
      "reservedUntilLogicalMs",
      logicalTimeMs,
    );
    const client = await this.#connect();
    const query = client.query.bind(client);
    try {
      await query("BEGIN");
      const seeded = await query(
        `INSERT INTO ${this.#prefix}interop_idempotency_records
          (namespace, idempotency_key, request_digest, reservation_id, reserved_until_logical_ms, response)
         VALUES ($1, $2, $3, $4, $5, NULL)
         ON CONFLICT DO NOTHING`,
        [this.#namespace, key, requestDigest, reservationId, reservedUntilLogicalMs],
      );
      if ((seeded.rowCount ?? 0) === 1) {
        await query("COMMIT");
        return true;
      }
      const current = await query<{
        request_digest: string;
        response: unknown | null;
        reserved_until_logical_ms: string | number;
      }>(
        `SELECT request_digest, response, reserved_until_logical_ms
           FROM ${this.#prefix}interop_idempotency_records
          WHERE namespace = $1 AND idempotency_key = $2 FOR UPDATE`,
        [this.#namespace, key],
      );
      const row = current.rows[0];
      if (row) {
        if (digest(row.request_digest, "stored request digest") !== requestDigest)
          throw new Error("interop idempotency key was reused with different content");
        if (
          row.response !== null ||
          safeInteger(row.reserved_until_logical_ms, "stored reservation expiry", 0) >= logicalTimeMs
        ) {
          await query("COMMIT");
          return false;
        }
        await query(
          `UPDATE ${this.#prefix}interop_idempotency_records
              SET reservation_id = $3, reserved_until_logical_ms = $4,
                  updated_at = transaction_timestamp()
            WHERE namespace = $1 AND idempotency_key = $2`,
          [this.#namespace, key, reservationId, reservedUntilLogicalMs],
        );
      }
      await query("COMMIT");
      return true;
    } catch (error) {
      await query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async commit(input: {
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly reservationId: string;
    readonly response: InteropResponseEnvelopeV1;
  }): Promise<boolean> {
    const key = token(input.idempotencyKey, "idempotencyKey", 256);
    const requestDigest = digest(input.requestDigest, "requestDigest");
    const reservationId = token(input.reservationId, "reservationId", 256);
    const response = jsonSnapshot(
      input.response,
      this.#maximumRecordBytes,
      "interop idempotency response",
    );
    const encoded = JSON.stringify(response);
    const client = await this.#connect();
    const query = client.query.bind(client);
    try {
      await query("BEGIN");
      const current = await query<{
        request_digest: string;
        reservation_id: string;
        response: InteropResponseEnvelopeV1 | null;
      }>(
        `SELECT request_digest, reservation_id, response
           FROM ${this.#prefix}interop_idempotency_records
          WHERE namespace = $1 AND idempotency_key = $2 FOR UPDATE`,
        [this.#namespace, key],
      );
      const row = current.rows[0];
      if (!row || row.request_digest !== requestDigest || row.reservation_id !== reservationId) {
        await query("COMMIT");
        return false;
      }
      if (row.response !== null) {
        const existing = jsonSnapshot(row.response, this.#maximumRecordBytes, "stored interop idempotency response");
        await query("COMMIT");
        return existing.responseDigest === response.responseDigest;
      }
      await query(
        `UPDATE ${this.#prefix}interop_idempotency_records
            SET response = $3::jsonb, updated_at = transaction_timestamp()
          WHERE namespace = $1 AND idempotency_key = $2`,
        [this.#namespace, key, encoded],
      );
      await query("COMMIT");
      return true;
    } catch (error) {
      await query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

/** PostgreSQL compare-and-set high-water marks for inbound peer sequences. */
export class PostgresInteropSequenceStoreV1 implements InteropSequenceStoreV1 {
  readonly #prefix: string;
  readonly #namespace: string;
  readonly #connect: Pool["connect"];

  constructor(pool: Pool, options: InteropPostgresRepositoryOptionsV1) {
    const captured = repositoryOptions(pool, options);
    this.#prefix = captured.prefix;
    this.#namespace = captured.namespace;
    this.#connect = pool.connect.bind(pool);
  }

  async admit(input: {
    readonly issuerId: string;
    readonly sessionId: string;
    readonly operation: string;
    readonly sequence: number;
    readonly requestDigest: string;
  }): Promise<InteropSequenceAdmissionV1> {
    const issuerId = token(input.issuerId, "issuerId", 256);
    const sessionId = token(input.sessionId, "sessionId", 256);
    const operation = token(input.operation, "operation", 256);
    const sequence = safeInteger(input.sequence, "sequence", 1);
    const requestDigest = digest(input.requestDigest, "requestDigest");
    const client = await this.#connect();
    const query = client.query.bind(client);
    try {
      await query("BEGIN");
      const inserted = await query(
        `INSERT INTO ${this.#prefix}interop_inbound_sequence_heads
          (namespace, issuer_id, session_id, operation, sequence, request_digest)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [this.#namespace, issuerId, sessionId, operation, sequence, requestDigest],
      );
      if ((inserted.rowCount ?? 0) === 1) {
        await query("COMMIT");
        return "advanced";
      }
      const result = await query<{ sequence: string | number; request_digest: string }>(
        `SELECT sequence, request_digest
           FROM ${this.#prefix}interop_inbound_sequence_heads
          WHERE namespace = $1 AND issuer_id = $2 AND session_id = $3 AND operation = $4
          FOR UPDATE`,
        [this.#namespace, issuerId, sessionId, operation],
      );
      const current = result.rows[0];
      if (!current) throw new Error("inbound sequence head was not persisted");
      const head = safeInteger(current.sequence, "stored inbound sequence", 1);
      let admission: InteropSequenceAdmissionV1;
      if (sequence > head) {
        await query(
          `UPDATE ${this.#prefix}interop_inbound_sequence_heads
              SET sequence = $5, request_digest = $6, updated_at = transaction_timestamp()
            WHERE namespace = $1 AND issuer_id = $2 AND session_id = $3 AND operation = $4`,
          [this.#namespace, issuerId, sessionId, operation, sequence, requestDigest],
        );
        admission = "advanced";
      } else if (sequence < head) {
        admission = "stale";
      } else {
        admission = current.request_digest === requestDigest ? "duplicate" : "conflict";
      }
      await query("COMMIT");
      return admission;
    } catch (error) {
      await query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Durable operation journal for heterogeneous cognitive adapters. Every
 * prepare/commit transition holds the session row lock, so a claimed revision
 * cannot be saved or claimed by a second replica between the journal and state
 * writes.
 */
export class PostgresCognitiveDurableOperationStoreV2 implements CognitiveDurableOperationStoreV2 {
  readonly #prefix: string;
  readonly #namespace: string;
  readonly #maximumRecordBytes: number;
  readonly #maximumReceiptHistory: number;
  readonly #connect: Pool["connect"];
  readonly #query: Query;
  readonly #integrity = createWebCryptoCognitiveIntegrityV2();

  constructor(pool: Pool, options: CognitiveInteropPostgresRepositoryOptionsV1) {
    const captured = repositoryOptions(pool, options);
    this.#prefix = captured.prefix;
    this.#namespace = captured.namespace;
    this.#maximumRecordBytes = captured.maximumRecordBytes;
    this.#maximumReceiptHistory = safeInteger(
      options.maximumReceiptHistory ?? DEFAULT_MAXIMUM_RECEIPT_HISTORY,
      "maximumReceiptHistory",
      1,
    );
    this.#connect = pool.connect.bind(pool);
    this.#query = pool.query.bind(pool);
  }

  async load(sessionId: string): Promise<CognitiveSessionStateV2 | null> {
    const key = cognitiveId(sessionId, "sessionId");
    const result = await this.#query<{ state: CognitiveSessionStateV2 }>(
      `SELECT state FROM ${this.#prefix}interop_cognitive_sessions
        WHERE namespace = $1 AND session_id = $2`,
      [this.#namespace, key],
    );
    const row = result.rows[0];
    return row ? this.#state(row.state, "stored cognitive state") : null;
  }

  async save(state: CognitiveSessionStateV2, expectedRevision: number | null): Promise<boolean> {
    const next = await this.#state(state, "cognitive state");
    const expected = expectedRevision === null ? null : safeInteger(expectedRevision, "expectedRevision", 0);
    const client = await this.#connect();
    const query = client.query.bind(client);
    try {
      await query("BEGIN");
      const current = await query<{ revision: string | number; tenant_id: string }>(
        `SELECT revision, tenant_id FROM ${this.#prefix}interop_cognitive_sessions
          WHERE namespace = $1 AND session_id = $2 FOR UPDATE`,
        [this.#namespace, next.sessionId],
      );
      const row = current.rows[0];
      if (
        (expected === null && (row || next.revision !== 0)) ||
        (expected !== null && (!row || row.tenant_id !== next.tenantId || safeInteger(row.revision, "stored cognitive revision", 0) !== expected || next.revision !== expected + 1))
      ) {
        await query("COMMIT");
        return false;
      }
      if (expected !== null) {
        const claim = await query(
          `SELECT 1 FROM ${this.#prefix}interop_cognitive_operations
            WHERE namespace = $1 AND tenant_id = $2 AND session_id = $3
              AND expected_session_revision = $4 AND status = 'prepared'`,
          [this.#namespace, next.tenantId, next.sessionId, expected],
        );
        if ((claim.rowCount ?? claim.rows.length) !== 0) {
          await query("COMMIT");
          return false;
        }
      }
      const encoded = JSON.stringify(next);
      if (expected === null) {
        const inserted = await query(
          `INSERT INTO ${this.#prefix}interop_cognitive_sessions
            (namespace, tenant_id, session_id, agent_id, revision, state_digest, state)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT DO NOTHING`,
          [this.#namespace, next.tenantId, next.sessionId, next.agentId, next.revision, next.stateDigest, encoded],
        );
        await query("COMMIT");
        return (inserted.rowCount ?? 0) === 1;
      }
      const updated = await query(
        `UPDATE ${this.#prefix}interop_cognitive_sessions
            SET revision = $5, state_digest = $6, state = $7::jsonb,
                updated_at = transaction_timestamp()
          WHERE namespace = $1 AND tenant_id = $2 AND session_id = $3 AND revision = $4`,
        [this.#namespace, next.tenantId, next.sessionId, expected, next.revision, next.stateDigest, encoded],
      );
      await query("COMMIT");
      return (updated.rowCount ?? 0) === 1;
    } catch (error) {
      await query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async loadOperation(input: { readonly tenantId: string; readonly sessionId: string; readonly operationId: string }): Promise<CognitiveDurableOperationRecordV2 | null> {
    const tenantId = cognitiveId(input.tenantId, "tenantId");
    const sessionId = cognitiveId(input.sessionId, "sessionId");
    const operationId = cognitiveId(input.operationId, "operationId");
    const result = await this.#query<{ operation: CognitiveDurableOperationRecordV2 }>(
      `SELECT operation FROM ${this.#prefix}interop_cognitive_operations
        WHERE namespace = $1 AND tenant_id = $2 AND session_id = $3 AND operation_id = $4`,
      [this.#namespace, tenantId, sessionId, operationId],
    );
    const row = result.rows[0];
    return row ? this.#operation(row.operation, "stored cognitive operation") : null;
  }

  async prepareOperation(input: { readonly operation: Extract<CognitiveDurableOperationRecordV2, { readonly status: "prepared" }> }): Promise<boolean> {
    const operation = await this.#operation(input.operation, "prepared cognitive operation");
    if (operation.status !== "prepared") return false;
    const client = await this.#connect();
    const query = client.query.bind(client);
    try {
      await query("BEGIN");
      const session = await query<{ tenant_id: string; agent_id: string; revision: string | number; state_digest: string }>(
        `SELECT tenant_id, agent_id, revision, state_digest
           FROM ${this.#prefix}interop_cognitive_sessions
          WHERE namespace = $1 AND session_id = $2 FOR UPDATE`,
        [this.#namespace, operation.sessionId],
      );
      const current = session.rows[0];
      if (!current || current.tenant_id !== operation.tenantId || current.agent_id !== operation.agentId || safeInteger(current.revision, "stored cognitive revision", 0) !== operation.expectedSessionRevision || current.state_digest !== operation.previousStateDigest) {
        await query("COMMIT");
        return false;
      }
      const inserted = await query(
        `INSERT INTO ${this.#prefix}interop_cognitive_operations
          (namespace, tenant_id, session_id, operation_id, expected_session_revision,
           status, journal_revision, record_digest, operation)
         VALUES ($1, $2, $3, $4, $5, 'prepared', 0, $6, $7::jsonb)
         ON CONFLICT DO NOTHING`,
        [this.#namespace, operation.tenantId, operation.sessionId, operation.operationId, operation.expectedSessionRevision, operation.recordDigest, JSON.stringify(operation)],
      );
      await query("COMMIT");
      return (inserted.rowCount ?? 0) === 1;
    } catch (error) {
      await query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async commitOperation(input: { readonly operation: Extract<CognitiveDurableOperationRecordV2, { readonly status: "applied" }>; readonly expectedOperationRevision: 0 }): Promise<boolean> {
    if (input.expectedOperationRevision !== 0) return false;
    const operation = await this.#operation(input.operation, "applied cognitive operation");
    if (operation.status !== "applied") return false;
    const outcome = operation.outcome;
    const client = await this.#connect();
    const query = client.query.bind(client);
    try {
      await query("BEGIN");
      const journal = await query<{ operation: CognitiveDurableOperationRecordV2; status: string; journal_revision: string | number }>(
        `SELECT operation, status, journal_revision
           FROM ${this.#prefix}interop_cognitive_operations
          WHERE namespace = $1 AND tenant_id = $2 AND session_id = $3 AND operation_id = $4 FOR UPDATE`,
        [this.#namespace, operation.tenantId, operation.sessionId, operation.operationId],
      );
      const preparedRow = journal.rows[0];
      if (!preparedRow || preparedRow.status !== "prepared" || safeInteger(preparedRow.journal_revision, "stored journal revision", 0) !== 0) {
        await query("COMMIT");
        return false;
      }
      const prepared = await this.#operation(preparedRow.operation, "stored prepared cognitive operation");
      if (prepared.status !== "prepared" || !sameCognitiveOperationIdentity(prepared, operation)) {
        await query("COMMIT");
        return false;
      }
      const session = await query<{ tenant_id: string; agent_id: string; revision: string | number; state_digest: string }>(
        `SELECT tenant_id, agent_id, revision, state_digest
           FROM ${this.#prefix}interop_cognitive_sessions
          WHERE namespace = $1 AND session_id = $2 FOR UPDATE`,
        [this.#namespace, operation.sessionId],
      );
      const current = session.rows[0];
      if (!current || current.tenant_id !== operation.tenantId || current.agent_id !== operation.agentId || safeInteger(current.revision, "stored cognitive revision", 0) !== operation.expectedSessionRevision || current.state_digest !== operation.previousStateDigest || !validAppliedOutcome(operation, outcome)) {
        await query("COMMIT");
        return false;
      }
      const state = await this.#state(outcome.state, "applied cognitive state");
      if (state.tenantId !== operation.tenantId || state.sessionId !== operation.sessionId || state.agentId !== operation.agentId || state.revision !== operation.expectedSessionRevision + 1 || outcome.receipt.operationId !== operation.operationId || outcome.receipt.previousStateDigest !== current.state_digest || outcome.result.operationId !== operation.operationId || state.receipts.at(-1)?.receiptDigest !== outcome.receipt.receiptDigest) {
        await query("COMMIT");
        return false;
      }
      await query(
        `UPDATE ${this.#prefix}interop_cognitive_sessions
            SET revision = $5, state_digest = $6, state = $7::jsonb,
                updated_at = transaction_timestamp()
          WHERE namespace = $1 AND tenant_id = $2 AND session_id = $3 AND revision = $4`,
        [this.#namespace, operation.tenantId, operation.sessionId, operation.expectedSessionRevision, state.revision, state.stateDigest, JSON.stringify(state)],
      );
      const applied = await query(
        `UPDATE ${this.#prefix}interop_cognitive_operations
            SET status = 'applied', journal_revision = 1, record_digest = $5,
                operation = $6::jsonb, updated_at = transaction_timestamp()
          WHERE namespace = $1 AND tenant_id = $2 AND session_id = $3 AND operation_id = $4
            AND status = 'prepared' AND journal_revision = 0`,
        [this.#namespace, operation.tenantId, operation.sessionId, operation.operationId, operation.recordDigest, JSON.stringify(operation)],
      );
      if ((applied.rowCount ?? 0) !== 1) throw new Error("cognitive applied operation CAS lost");
      await query("COMMIT");
      return true;
    } catch (error) {
      await query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async #state(value: CognitiveSessionStateV2, label: string): Promise<CognitiveSessionStateV2> {
    const snapshot = jsonSnapshot(value, this.#maximumRecordBytes, label);
    return validateCognitiveSessionStateV2(snapshot, this.#integrity, this.#maximumReceiptHistory);
  }

  async #operation(value: CognitiveDurableOperationRecordV2, label: string): Promise<CognitiveDurableOperationRecordV2> {
    const operation = jsonSnapshot(value, this.#maximumRecordBytes, label);
    validateCognitiveOperationShape(operation);
    const { recordDigest, ...body } = operation;
    if ((await this.#integrity.digest("cognitive-durable-operation-v2", body as never)) !== recordDigest)
      throw new TypeError(`${label} digest is invalid`);
    if (operation.status === "applied") {
      const outcome = operation.outcome;
      await this.#state(outcome.state, `${label} outcome state`);
      const { receiptDigest, ...receiptBody } = outcome.receipt;
      if (
        digest(receiptDigest, `${label} receipt digest`) !==
        (await this.#integrity.digest("cognitive-operation-receipt-v2", receiptBody as never))
      ) throw new TypeError(`${label} receipt digest is invalid`);
      if (
        digest(outcome.result.outputDigest, `${label} output digest`) !==
        (await this.#integrity.digest("cognitive-operation-output-v2", outcome.result.output as never))
      ) throw new TypeError(`${label} output digest is invalid`);
    }
    return Object.freeze(operation);
  }
}

function cognitiveId(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}

function validateCognitiveOperationShape(
  operation: CognitiveDurableOperationRecordV2,
): void {
  if (!operation || operation.schemaVersion !== 2)
    throw new TypeError("cognitive operation schema is invalid");
  for (const [label, value] of Object.entries({
    tenantId: operation.tenantId,
    sessionId: operation.sessionId,
    agentId: operation.agentId,
    operationId: operation.operationId,
    adapterId: operation.adapterId,
    implementationId: operation.implementationId,
  })) cognitiveId(value, label);
  token(operation.adapterVersion, "adapterVersion", 128);
  digest(operation.requestDigest, "requestDigest");
  digest(operation.idempotencyKey, "idempotencyKey");
  digest(operation.previousStateDigest, "previousStateDigest");
  digest(operation.recordDigest, "recordDigest");
  safeInteger(operation.expectedSessionRevision, "expectedSessionRevision", 0);
  safeInteger(operation.preparedAtLogicalMs, "preparedAtLogicalMs", 0);
  if (
    !COGNITIVE_OPERATION_KINDS_V2.includes(operation.operation) ||
    !["prepared", "applied"].includes(operation.status) ||
    (operation.status === "prepared" && (operation.journalRevision !== 0 || operation.outcome !== null)) ||
    (operation.status === "applied" && (operation.journalRevision !== 1 || !operation.outcome))
  ) throw new TypeError("cognitive operation state is invalid");
}

function sameCognitiveOperationIdentity(
  prepared: Extract<CognitiveDurableOperationRecordV2, { readonly status: "prepared" }>,
  applied: Extract<CognitiveDurableOperationRecordV2, { readonly status: "applied" }>,
): boolean {
  return (
    prepared.tenantId === applied.tenantId &&
    prepared.sessionId === applied.sessionId &&
    prepared.agentId === applied.agentId &&
    prepared.operationId === applied.operationId &&
    prepared.operation === applied.operation &&
    prepared.adapterId === applied.adapterId &&
    prepared.adapterVersion === applied.adapterVersion &&
    prepared.implementationId === applied.implementationId &&
    prepared.requestDigest === applied.requestDigest &&
    prepared.idempotencyKey === applied.idempotencyKey &&
    prepared.expectedSessionRevision === applied.expectedSessionRevision &&
    prepared.previousStateDigest === applied.previousStateDigest &&
    prepared.preparedAtLogicalMs === applied.preparedAtLogicalMs
  );
}

function validAppliedOutcome(
  operation: Extract<CognitiveDurableOperationRecordV2, { readonly status: "applied" }>,
  outcome: Extract<CognitiveDurableOperationRecordV2, { readonly status: "applied" }>['outcome'],
): boolean {
  return (
    outcome !== null &&
    outcome.state.tenantId === operation.tenantId &&
    outcome.state.sessionId === operation.sessionId &&
    outcome.state.agentId === operation.agentId &&
    outcome.state.revision === operation.expectedSessionRevision + 1 &&
    outcome.receipt.operationId === operation.operationId &&
    outcome.result.operationId === operation.operationId
  );
}

function repositoryOptions(
  pool: Pool,
  options: InteropPostgresRepositoryOptionsV1,
): Readonly<{
  prefix: string;
  namespace: string;
  maximumRecordBytes: number;
  crypto: Crypto;
}> {
  if (
    !pool ||
    typeof pool.query !== "function" ||
    typeof pool.connect !== "function"
  )
    throw new TypeError("PostgreSQL pool is required");
  if (!options || typeof options !== "object")
    throw new TypeError("PostgreSQL repository options are required");
  const schema = normalizePostgresIdentifier(
    options.schema ?? defaultPostgresSchema,
    "schema",
  );
  return Object.freeze({
    prefix: `${quotePostgresIdentifier(schema)}.`,
    namespace: token(options.namespace, "namespace", 128),
    maximumRecordBytes: safeInteger(
      options.maximumRecordBytes ?? DEFAULT_MAXIMUM_RECORD_BYTES,
      "maximumRecordBytes",
      1,
    ),
    crypto: captureInteropDigestCryptoV1(options.crypto ?? globalThis.crypto),
  });
}

function nullableSafeInteger(
  value: unknown,
  label: string,
  minimum: number,
): number | null {
  return value === null ? null : safeInteger(value, label, minimum);
}

function safeInteger(value: unknown, label: string, minimum: number): number {
  const parsed =
    typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) < minimum)
    throw new RangeError(`${label} is invalid`);
  return parsed as number;
}

function token(value: unknown, label: string, maximumBytes: number): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value) ||
    new TextEncoder().encode(value).byteLength > maximumBytes
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !DIGEST.test(value))
    throw new TypeError(`${label} is invalid`);
  return value;
}

function nullableDigest(value: unknown, label: string): string | null {
  return value === null ? null : digest(value, label);
}

function jsonSnapshot<T>(value: T, maximumBytes: number, label: string): T {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new TypeError(`${label} is not JSON`);
  }
  if (
    encoded === undefined ||
    new TextEncoder().encode(encoded).byteLength > maximumBytes
  )
    throw new RangeError(`${label} exceeds the configured byte limit`);
  return JSON.parse(encoded) as T;
}
