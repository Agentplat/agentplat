import { redactAuditDetails } from "@agentplat/audit";
import type { AuditRecord, AuditSink } from "@agentplat/audit";
import type {
  CollectiveTelemetryAnchorV1,
  CollectiveTelemetryDeliveryCommitResultV1,
  CollectiveTelemetryDeliveryReceiptV1,
  CollectiveTelemetryMonotonicAnchorPortV1,
  CollectiveTelemetryStateV1,
  CollectiveTelemetryStoreV1,
} from "@agentplat/audit/collective-telemetry";
import type { JsonObject } from "@agentplat/core";
import {
  defaultPostgresSchema,
  qualifyPostgresName,
} from "@agentplat/postgres";
import type { SessionEventRecord, SessionEventSink } from "@agentplat/sessions";
import type { Pool } from "pg";

export {
  auditMigrationDirectory,
  auditRollbackConfirmation,
  getAuditMigrationStatus,
  rollbackAuditMigrations,
  runAuditMigrations,
} from "./migrations.js";
export type { AuditPostgresMigrationOptions } from "./migrations.js";

export interface PostgresSinkOptions {
  schema?: string;
}

export interface PostgresCollectiveTelemetryStoreOptions extends PostgresSinkOptions {
  tenantId: string;
  maximumPendingDeliveryReceipts?: number;
}

export interface PostgresCollectiveTelemetryAnchorOptions extends PostgresSinkOptions {
  tenantId: string;
}

/** CAS state plus append-only signed events for collective telemetry. */
export class PostgresCollectiveTelemetryStoreV1 implements CollectiveTelemetryStoreV1 {
  private readonly stateTable: string;
  private readonly eventTable: string;
  private readonly deliveryReceiptTable: string;
  private readonly maximumPendingDeliveryReceipts: number;
  private readonly tenantId: string;
  private readonly poolQuery: Pool["query"];
  private readonly poolConnect: Pool["connect"];

  constructor(pool: Pool, options: PostgresCollectiveTelemetryStoreOptions) {
    if (!options.tenantId)
      throw new TypeError("collective telemetry tenant is required");
    const maximumPendingDeliveryReceipts =
      options.maximumPendingDeliveryReceipts ?? 4_096;
    if (
      !Number.isSafeInteger(maximumPendingDeliveryReceipts) ||
      maximumPendingDeliveryReceipts < 1 ||
      maximumPendingDeliveryReceipts > 100_000
    )
      throw new TypeError("maximumPendingDeliveryReceipts is invalid");
    const schema = options.schema ?? defaultPostgresSchema;
    this.stateTable = qualifyPostgresName(
      schema,
      "collective_telemetry_states",
    );
    this.eventTable = qualifyPostgresName(
      schema,
      "collective_telemetry_events",
    );
    this.deliveryReceiptTable = qualifyPostgresName(
      schema,
      "collective_telemetry_delivery_receipts",
    );
    this.tenantId = options.tenantId;
    this.poolQuery = pool.query.bind(pool) as Pool["query"];
    this.poolConnect = pool.connect.bind(pool) as Pool["connect"];
    this.maximumPendingDeliveryReceipts = maximumPendingDeliveryReceipts;
  }

  async load(streamId: string): Promise<CollectiveTelemetryStateV1 | null> {
    const result = await this.poolQuery<{
      revision: string | number;
      sequence: string | number;
      logical_time_high_water_ms: string | number;
      state_digest: string;
      state: CollectiveTelemetryStateV1;
    }>(
      `SELECT revision, sequence, logical_time_high_water_ms, state_digest, state
         FROM ${this.stateTable}
        WHERE tenant_id = $1 AND stream_id = $2`,
      [this.tenantId, streamId],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (
      row.state.tenantId !== this.tenantId ||
      row.state.streamId !== streamId ||
      row.state.revision !== Number(row.revision) ||
      row.state.sequence !== Number(row.sequence) ||
      row.state.logicalTimeHighWaterMs !==
        Number(row.logical_time_high_water_ms) ||
      row.state.stateDigest !== row.state_digest
    )
      throw new Error(
        "collective telemetry PostgreSQL columns diverge from state",
      );
    return row.state;
  }

  async save(
    state: CollectiveTelemetryStateV1,
    expectedRevision: number | null,
    expectedStateDigest: string | null,
  ): Promise<boolean> {
    state = structuredClone(state);
    if (
      state.tenantId !== this.tenantId ||
      state.revision !==
        (expectedRevision === null ? 0 : expectedRevision + 1) ||
      (expectedRevision === null) !== (expectedStateDigest === null)
    )
      return false;
    const client = await this.poolConnect();
    try {
      await client.query("BEGIN");
      const result =
        expectedRevision === null
          ? await client.query(
              `INSERT INTO ${this.stateTable}
              (tenant_id, stream_id, revision, sequence, logical_time_high_water_ms, state_digest, state)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING`,
              [
                state.tenantId,
                state.streamId,
                state.revision,
                state.sequence,
                state.logicalTimeHighWaterMs,
                state.stateDigest,
                JSON.stringify(state),
              ],
            )
          : await client.query(
              `UPDATE ${this.stateTable}
                SET revision = $4, sequence = $5, logical_time_high_water_ms = $6,
                    state_digest = $7, state = $8::jsonb, updated_at = transaction_timestamp()
              WHERE tenant_id = $1 AND stream_id = $2 AND revision = $3
                AND state_digest = $9
                AND sequence < $5 AND logical_time_high_water_ms <= $6`,
              [
                state.tenantId,
                state.streamId,
                expectedRevision,
                state.revision,
                state.sequence,
                state.logicalTimeHighWaterMs,
                state.stateDigest,
                JSON.stringify(state),
                expectedStateDigest,
              ],
            );
      if ((result.rowCount ?? 0) !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      const event = state.events.at(-1);
      if (event && event.sequence === state.sequence) {
        await client.query(
          `INSERT INTO ${this.eventTable}
            (tenant_id, stream_id, sequence, event_id, event_digest, event)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`,
          [
            state.tenantId,
            state.streamId,
            event.sequence,
            event.eventId,
            event.eventDigest,
            JSON.stringify(event),
          ],
        );
        const retained = await client.query<{ event_digest: string }>(
          `SELECT event_digest FROM ${this.eventTable}
            WHERE tenant_id = $1 AND event_id = $2`,
          [state.tenantId, event.eventId],
        );
        if (retained.rows[0]?.event_digest !== event.eventDigest)
          throw new Error("collective telemetry event identity conflict");
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async loadDelivery(
    streamId: string,
    deliveryDigest: string,
  ): Promise<CollectiveTelemetryDeliveryReceiptV1 | null> {
    const result = await this.poolQuery<{
      record_input_digest: string;
      event_digest: string;
      sequence: string | number;
    }>(
      `SELECT record_input_digest, event_digest, sequence
         FROM ${this.deliveryReceiptTable}
        WHERE tenant_id = $1 AND stream_id = $2 AND delivery_digest = $3`,
      [this.tenantId, streamId, deliveryDigest],
    );
    const row = result.rows[0];
    return row
      ? {
          schemaVersion: 1,
          streamId,
          deliveryDigest,
          recordInputDigest: row.record_input_digest,
          eventDigest: row.event_digest,
          sequence: Number(row.sequence),
        }
      : null;
  }

  async commitDelivery(input: {
    readonly state: CollectiveTelemetryStateV1;
    readonly expectedRevision: number;
    readonly expectedStateDigest: string;
    readonly receipt: CollectiveTelemetryDeliveryReceiptV1;
  }): Promise<CollectiveTelemetryDeliveryCommitResultV1> {
    input = structuredClone(input);
    if (
      input.state.tenantId !== this.tenantId ||
      input.state.streamId !== input.receipt.streamId ||
      input.state.revision !== input.expectedRevision + 1
    )
      return "conflict";
    const event = input.state.events.at(-1);
    if (
      !event ||
      event.sequence !== input.state.sequence ||
      event.eventDigest !== input.receipt.eventDigest ||
      event.sequence !== input.receipt.sequence
    )
      throw new TypeError(
        "collective telemetry delivery receipt/event binding is invalid",
      );
    const client = await this.poolConnect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${this.tenantId}:collective-telemetry-deliveries`],
      );
      const existing = await client.query<{ record_input_digest: string }>(
        `SELECT record_input_digest
           FROM ${this.deliveryReceiptTable}
          WHERE tenant_id = $1 AND stream_id = $2 AND delivery_digest = $3`,
        [this.tenantId, input.receipt.streamId, input.receipt.deliveryDigest],
      );
      if (existing.rows[0]) {
        if (
          existing.rows[0].record_input_digest !==
          input.receipt.recordInputDigest
        )
          throw new Error("collective telemetry delivery digest collision");
        await client.query("COMMIT");
        return "already_recorded";
      }
      const count = await client.query<{ pending: string | number }>(
        `SELECT count(*) AS pending FROM ${this.deliveryReceiptTable}
          WHERE tenant_id = $1`,
        [this.tenantId],
      );
      if (
        Number(count.rows[0]?.pending ?? 0) >=
        this.maximumPendingDeliveryReceipts
      )
        throw new Error(
          "collective telemetry delivery receipt capacity exhausted",
        );
      const saved = await client.query(
        `UPDATE ${this.stateTable}
            SET revision = $4, sequence = $5,
                logical_time_high_water_ms = $6, state_digest = $7,
                state = $8::jsonb, updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND stream_id = $2 AND revision = $3
            AND state_digest = $9 AND sequence < $5
            AND logical_time_high_water_ms <= $6`,
        [
          input.state.tenantId,
          input.state.streamId,
          input.expectedRevision,
          input.state.revision,
          input.state.sequence,
          input.state.logicalTimeHighWaterMs,
          input.state.stateDigest,
          JSON.stringify(input.state),
          input.expectedStateDigest,
        ],
      );
      if ((saved.rowCount ?? 0) !== 1) {
        await client.query("ROLLBACK");
        return "conflict";
      }
      await client.query(
        `INSERT INTO ${this.eventTable}
          (tenant_id, stream_id, sequence, event_id, event_digest, event)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          input.state.tenantId,
          input.state.streamId,
          event.sequence,
          event.eventId,
          event.eventDigest,
          JSON.stringify(event),
        ],
      );
      await client.query(
        `INSERT INTO ${this.deliveryReceiptTable}
          (tenant_id, stream_id, delivery_digest, record_input_digest,
           event_digest, sequence)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          input.state.tenantId,
          input.state.streamId,
          input.receipt.deliveryDigest,
          input.receipt.recordInputDigest,
          input.receipt.eventDigest,
          input.receipt.sequence,
        ],
      );
      await client.query("COMMIT");
      return "committed";
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseDelivery(
    streamId: string,
    deliveryDigest: string,
  ): Promise<boolean> {
    await this.poolQuery(
      `DELETE FROM ${this.deliveryReceiptTable}
        WHERE tenant_id = $1 AND stream_id = $2 AND delivery_digest = $3`,
      [this.tenantId, streamId, deliveryDigest],
    );
    return true;
  }
}

/**
 * Bounded monotonic witness for telemetry stream heads. It can be placed
 * on a separately protected PostgreSQL pool/schema from the mutable stream
 * state so an application-state rollback cannot silently roll the witness
 * back with it.
 */
export class PostgresCollectiveTelemetryMonotonicAnchorV1 implements CollectiveTelemetryMonotonicAnchorPortV1 {
  private readonly table: string;
  private readonly tenantId: string;
  private readonly poolQuery: Pool["query"];
  private readonly poolConnect: Pool["connect"];

  constructor(pool: Pool, options: PostgresCollectiveTelemetryAnchorOptions) {
    validateTelemetryIdentifier(options.tenantId, "tenantId");
    this.tenantId = options.tenantId;
    this.table = qualifyPostgresName(
      options.schema ?? defaultPostgresSchema,
      "collective_telemetry_monotonic_anchors",
    );
    this.poolQuery = pool.query.bind(pool) as Pool["query"];
    this.poolConnect = pool.connect.bind(pool) as Pool["connect"];
  }

  async load(anchorKey: string): Promise<CollectiveTelemetryAnchorV1 | null> {
    validateTelemetryIdentifier(anchorKey, "anchorKey");
    const result = await this.poolQuery<{
      revision: string | number;
      sequence: string | number;
      state_digest: string;
      logical_time_high_water_ms: string | number;
    }>(
      `SELECT revision, sequence, state_digest, logical_time_high_water_ms
         FROM ${this.table}
        WHERE tenant_id = $1 AND anchor_key = $2`,
      [this.tenantId, anchorKey],
    );
    return result.rows[0] ? telemetryAnchorFromRow(result.rows[0]) : null;
  }

  async save(input: {
    readonly anchorKey: string;
    readonly anchor: CollectiveTelemetryAnchorV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
  }): Promise<boolean> {
    const request = {
      anchorKey: input.anchorKey,
      anchor: Object.freeze({ ...input.anchor }),
      expectedRevision: input.expectedRevision,
      expectedStateDigest: input.expectedStateDigest,
    };
    validateTelemetryIdentifier(request.anchorKey, "anchorKey");
    validateTelemetryAnchor(request.anchor);
    if (
      (request.expectedRevision === null) !==
        (request.expectedStateDigest === null) ||
      (request.expectedRevision !== null &&
        (!Number.isSafeInteger(request.expectedRevision) ||
          request.expectedRevision < 0)) ||
      (request.expectedStateDigest !== null &&
        !/^sha256:[0-9a-f]{64}$/.test(request.expectedStateDigest)) ||
      request.anchor.revision !== (request.expectedRevision ?? -1) + 1
    )
      return false;
    const client = await this.poolConnect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${this.tenantId}:collective-telemetry-anchor:${request.anchorKey}`],
      );
      const retained = await client.query<{
        revision: string | number;
        sequence: string | number;
        state_digest: string;
        logical_time_high_water_ms: string | number;
      }>(
        `SELECT revision, sequence, state_digest, logical_time_high_water_ms
           FROM ${this.table}
          WHERE tenant_id = $1 AND anchor_key = $2`,
        [this.tenantId, request.anchorKey],
      );
      const current = retained.rows[0]
        ? telemetryAnchorFromRow(retained.rows[0])
        : null;
      if (
        (current?.revision ?? null) !== request.expectedRevision ||
        (current?.stateDigest ?? null) !== request.expectedStateDigest ||
        request.anchor.sequence < (current?.sequence ?? -1) ||
        request.anchor.logicalTimeHighWaterMs <
          (current?.logicalTimeHighWaterMs ?? -1)
      ) {
        await client.query("ROLLBACK");
        return false;
      }
      const advanced =
        current === null
          ? await client.query(
              `INSERT INTO ${this.table}
              (tenant_id, anchor_key, revision, sequence, state_digest,
               logical_time_high_water_ms, previous_state_digest)
             VALUES ($1,$2,$3,$4,$5,$6,NULL)
             ON CONFLICT DO NOTHING`,
              [
                this.tenantId,
                request.anchorKey,
                request.anchor.revision,
                request.anchor.sequence,
                request.anchor.stateDigest,
                request.anchor.logicalTimeHighWaterMs,
              ],
            )
          : await client.query(
              `UPDATE ${this.table}
                SET revision = $4, sequence = $5, state_digest = $6,
                    logical_time_high_water_ms = $7,
                    previous_state_digest = $8
              WHERE tenant_id = $1 AND anchor_key = $2
                AND revision = $3 AND state_digest = $8`,
              [
                this.tenantId,
                request.anchorKey,
                request.expectedRevision,
                request.anchor.revision,
                request.anchor.sequence,
                request.anchor.stateDigest,
                request.anchor.logicalTimeHighWaterMs,
                request.expectedStateDigest,
              ],
            );
      if ((advanced.rowCount ?? 0) !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function telemetryAnchorFromRow(row: {
  revision: string | number;
  sequence: string | number;
  state_digest: string;
  logical_time_high_water_ms: string | number;
}): CollectiveTelemetryAnchorV1 {
  const anchor = Object.freeze({
    revision: Number(row.revision),
    sequence: Number(row.sequence),
    stateDigest: row.state_digest,
    logicalTimeHighWaterMs: Number(row.logical_time_high_water_ms),
  });
  validateTelemetryAnchor(anchor);
  return anchor;
}

function validateTelemetryAnchor(anchor: CollectiveTelemetryAnchorV1): void {
  if (
    !anchor ||
    !Number.isSafeInteger(anchor.revision) ||
    anchor.revision < 0 ||
    !Number.isSafeInteger(anchor.sequence) ||
    anchor.sequence < 0 ||
    anchor.sequence !== anchor.revision ||
    !Number.isSafeInteger(anchor.logicalTimeHighWaterMs) ||
    anchor.logicalTimeHighWaterMs < 0 ||
    !/^sha256:[0-9a-f]{64}$/.test(anchor.stateDigest)
  )
    throw new TypeError("collective telemetry anchor is invalid");
}

function validateTelemetryIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value))
    throw new TypeError(`collective telemetry ${label} is invalid`);
}

/** Append-only, redacting PostgreSQL AuditSink. */
export class PostgresAuditSink implements AuditSink {
  private readonly table: string;

  constructor(
    private readonly pool: Pool,
    options: PostgresSinkOptions = {},
  ) {
    this.table = qualifyPostgresName(
      options.schema ?? defaultPostgresSchema,
      "audit_records",
    );
  }

  async write(record: AuditRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table} (
         tenant_id, id, actor_id, actor_type, action, resource, details,
         ip_address, user_agent, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [
        record.tenantId,
        record.id,
        record.actorId ?? null,
        record.actorType ?? null,
        record.action,
        JSON.stringify(record.resource),
        JSON.stringify(
          record.details ? redactAuditDetails(record.details) : {},
        ),
        record.ipAddress ?? null,
        record.userAgent ?? null,
        record.createdAt,
      ],
    );
  }
}

/** Durable SessionEventSink that does not require any Agent Room tables. */
export class PostgresSessionEventSink implements SessionEventSink {
  private readonly table: string;

  constructor(
    private readonly pool: Pool,
    options: PostgresSinkOptions = {},
  ) {
    this.table = qualifyPostgresName(
      options.schema ?? defaultPostgresSchema,
      "session_events",
    );
  }

  async append(record: SessionEventRecord): Promise<void> {
    const event = redactAuditDetails(record.event as unknown as JsonObject);
    await this.pool.query(
      `INSERT INTO ${this.table} (
         tenant_id, session_id, sequence, event_id, occurred_at, event
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (tenant_id, event_id) DO NOTHING`,
      [
        record.tenantId,
        record.sessionId,
        record.sequence,
        record.eventId,
        record.occurredAt,
        JSON.stringify(event),
      ],
    );
  }
}

export function createPostgresAuditSink(
  pool: Pool,
  options?: PostgresSinkOptions,
): PostgresAuditSink {
  return new PostgresAuditSink(pool, options);
}

export function createPostgresSessionEventSink(
  pool: Pool,
  options?: PostgresSinkOptions,
): PostgresSessionEventSink {
  return new PostgresSessionEventSink(pool, options);
}
