import type {
  AutonomousAdaptationStateV1,
  AutonomousAdaptationStoreV1,
} from "@agentplat/collective-host/autonomous-adaptation";
import type {
  AssuranceCoupledExecutionReceiptV1,
  AssuranceCoupledExecutionRecordV1,
  AssuranceCoupledExecutionStoreV1,
  AssuranceEffectCommitCheckpointV1,
} from "@agentplat/collective-host/assurance-coupled-execution";
import type {
  AutonomousCollectiveAdvanceReservationV1,
  AutonomousCollectiveNodeStateV1,
  AutonomousCollectiveNodeStoreV1,
} from "@agentplat/collective-host/autonomous-node";
import { validateAutonomousCollectiveCommandBindingV1 } from "@agentplat/collective-host/autonomous-node";
import {
  CollectiveHostTelemetryOutboxCapacityErrorV1,
  compareCollectiveHostTelemetryOutboxEntriesV1,
  validateCollectiveHostTelemetryOutboxBatchV1,
  validateCollectiveHostTelemetryOutboxEntryV1,
  type CollectiveHostTelemetryOutboxEntryV1,
} from "@agentplat/collective-host/collective-telemetry";
import type {
  DistributedCollectiveArtifactStoreV1,
  DistributedCollectiveMessageV1,
  DistributedCollectiveProtocolStateV1,
  DistributedCollectiveProtocolStoreV1,
} from "@agentplat/collective-host/distributed-protocol";
import type {
  IntegratedCollectiveHostStateV2,
  IntegratedCollectiveHostStoreV2,
} from "@agentplat/collective-host";
import type {
  LocalRuleKernelStateV1,
  LocalRuleKernelStoreV1,
} from "@agentplat/collective-control/local-rule-kernel";
import type {
  InteropIdempotencyRecordV1,
  InteropIdempotencyStoreV1,
  InteropOperationV1,
  InteropResponseEnvelopeV1,
  InteropSequenceAdmissionV1,
  InteropSequenceStoreV1,
} from "@agentplat/interop";
import type {
  AnytimeSemanticGuaranteeAnchorV1,
  AnytimeSemanticGuaranteeStateV1,
  AnytimeSemanticGuaranteeStoreV1,
} from "@agentplat/inference-control/semantic-guarantees";
import {
  validateSemanticHorizonBudgetStateV1,
  type SemanticHorizonBudgetAnchorV1,
  type SemanticHorizonBudgetMonotonicAnchorStoreV1,
  type SemanticHorizonBudgetStateV1,
  type SemanticHorizonBudgetStoreV1,
} from "@agentplat/inference-control/semantic-horizon-budget";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";
import type {
  PeerCredibilityStateStoreV1,
  PeerCredibilityStateV1,
} from "@agentplat/trust/peer-credibility";

export interface CollectiveHostPostgresScopeV1 {
  readonly schema?: string;
  readonly scopeId: string;
  readonly maximumPendingTelemetry?: number;
}

interface PersistedTelemetryOutboxRowV1 {
  readonly source_kind: unknown;
  readonly source_id: unknown;
  readonly source_sequence: unknown;
  readonly ordinal: unknown;
  readonly delivery_digest: unknown;
  readonly delivery_state: unknown;
  readonly envelope: CollectiveHostTelemetryOutboxEntryV1;
}

function telemetryCapacity(value = 4_096): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000)
    throw new TypeError("maximumPendingTelemetry is invalid");
  return value;
}

async function lockAutonomousAdvanceV1(
  client: PoolClient,
  prefix: string,
  scopeId: string,
  reservation: AutonomousCollectiveAdvanceReservationV1,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
       FROM ${prefix}collective_host_autonomous_node_advances
      WHERE scope_id = $1 AND runtime_id = $2 AND advance_id = $3
        AND holder_id = $4 AND fence = $5
        AND canonical_logical_time_ms = $6
        AND lease_until_logical_ms = $7
      FOR UPDATE`,
    [
      scopeId,
      reservation.runtimeId,
      reservation.advanceId,
      reservation.holderId,
      reservation.fence,
      reservation.canonicalLogicalTimeMs,
      reservation.leaseUntilLogicalMs,
    ],
  );
  return (result.rowCount ?? 0) === 1;
}

async function appendTelemetryV1(
  client: PoolClient,
  prefix: string,
  scopeId: string,
  maximumPendingTelemetry: number,
  entries: readonly CollectiveHostTelemetryOutboxEntryV1[],
): Promise<void> {
  if (entries.length === 0) return;
  const validated = await validateCollectiveHostTelemetryOutboxBatchV1(entries);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `${scopeId}:collective-host-telemetry-outbox`,
  ]);
  const count = await client.query<{ pending: string | number }>(
    `SELECT count(*) AS pending
       FROM ${prefix}collective_host_telemetry_outbox
      WHERE scope_id = $1`,
    [scopeId],
  );
  if (
    Number(count.rows[0]?.pending ?? 0) + validated.length >
    maximumPendingTelemetry
  )
    throw new CollectiveHostTelemetryOutboxCapacityErrorV1(
      maximumPendingTelemetry,
    );
  for (const entry of validated) {
    if (entry.deliveryState !== "pending")
      throw new TypeError("new telemetry outbox entry must be pending");
    const inserted = await client.query(
      `INSERT INTO ${prefix}collective_host_telemetry_outbox
        (scope_id, source_kind, source_id, source_sequence, ordinal,
         delivery_digest, delivery_state, envelope)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        scopeId,
        entry.sourceKind,
        entry.sourceId,
        entry.sourceSequence,
        entry.ordinal,
        entry.deliveryDigest,
        entry.deliveryState,
        JSON.stringify(entry),
      ],
    );
    if ((inserted.rowCount ?? 0) !== 1)
      throw new Error("collective host telemetry outbox coordinate conflict");
  }
}

async function loadPendingTelemetryV1(
  pool: Pool,
  prefix: string,
  scopeId: string,
  limit = 128,
): Promise<readonly CollectiveHostTelemetryOutboxEntryV1[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000)
    throw new TypeError("telemetry outbox load limit is invalid");
  const result = await pool.query<PersistedTelemetryOutboxRowV1>(
    `SELECT source_kind, source_id, source_sequence, ordinal,
            delivery_digest, delivery_state, envelope
       FROM ${prefix}collective_host_telemetry_outbox
      WHERE scope_id = $1
      ORDER BY source_kind COLLATE "C" ASC,
               source_id COLLATE "C" ASC,
               source_sequence ASC, ordinal ASC,
               delivery_digest COLLATE "C" ASC
      LIMIT $2`,
    [scopeId, limit],
  );
  const pending: CollectiveHostTelemetryOutboxEntryV1[] = [];
  for (const row of result.rows)
    pending.push(await validatePersistedTelemetryOutboxRowV1(row));
  for (let index = 1; index < pending.length; index += 1)
    if (
      sameTelemetrySourceCoordinateV1(pending[index - 1]!, pending[index]!) ||
      compareCollectiveHostTelemetryOutboxEntriesV1(
        pending[index - 1]!,
        pending[index]!,
      ) >= 0
    )
      throw new Error("PostgreSQL telemetry outbox order diverged");
  return pending;
}

async function markTelemetryRecordedV1(
  pool: Pool,
  prefix: string,
  scopeId: string,
  deliveryDigest: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<PersistedTelemetryOutboxRowV1>(
      `SELECT source_kind, source_id, source_sequence, ordinal,
              delivery_digest, delivery_state, envelope
         FROM ${prefix}collective_host_telemetry_outbox
        WHERE scope_id = $1 AND delivery_digest = $2
        FOR UPDATE`,
      [scopeId, deliveryDigest],
    );
    const row = current.rows[0];
    if (!row) {
      await client.query("COMMIT");
      return false;
    }
    await validatePersistedTelemetryOutboxRowV1(row);
    if (row.delivery_state === "recorded") {
      await client.query("COMMIT");
      return true;
    }
    const result = await client.query(
      `UPDATE ${prefix}collective_host_telemetry_outbox
          SET delivery_state = 'recorded'
        WHERE scope_id = $1 AND delivery_digest = $2
          AND delivery_state = 'pending'`,
      [scopeId, deliveryDigest],
    );
    await client.query("COMMIT");
    return (result.rowCount ?? 0) === 1;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function acknowledgeTelemetryV1(
  pool: Pool,
  prefix: string,
  scopeId: string,
  deliveryDigest: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<PersistedTelemetryOutboxRowV1>(
      `SELECT source_kind, source_id, source_sequence, ordinal,
              delivery_digest, delivery_state, envelope
         FROM ${prefix}collective_host_telemetry_outbox
        WHERE scope_id = $1 AND delivery_digest = $2
        FOR UPDATE`,
      [scopeId, deliveryDigest],
    );
    const row = current.rows[0];
    if (!row || row.delivery_state !== "recorded") {
      await client.query("COMMIT");
      return false;
    }
    await validatePersistedTelemetryOutboxRowV1(row);
    const result = await client.query(
      `DELETE FROM ${prefix}collective_host_telemetry_outbox
        WHERE scope_id = $1 AND delivery_digest = $2
          AND delivery_state = 'recorded'`,
      [scopeId, deliveryDigest],
    );
    await client.query("COMMIT");
    return (result.rowCount ?? 0) === 1;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function validatePersistedTelemetryOutboxRowV1(
  row: PersistedTelemetryOutboxRowV1,
): Promise<CollectiveHostTelemetryOutboxEntryV1> {
  const sourceSequence =
    typeof row.source_sequence === "string"
      ? Number(row.source_sequence)
      : row.source_sequence;
  const validated = await validateCollectiveHostTelemetryOutboxEntryV1({
    ...row.envelope,
    deliveryState: row.delivery_state as "pending" | "recorded",
  });
  if (
    row.envelope.deliveryState !== "pending" ||
    row.source_kind !== validated.sourceKind ||
    row.source_id !== validated.sourceId ||
    !Number.isSafeInteger(sourceSequence) ||
    sourceSequence !== validated.sourceSequence ||
    row.ordinal !== validated.ordinal ||
    row.delivery_digest !== validated.deliveryDigest
  )
    throw new TypeError("PostgreSQL telemetry outbox columns diverged");
  return validated;
}

function sameTelemetrySourceCoordinateV1(
  left: CollectiveHostTelemetryOutboxEntryV1,
  right: CollectiveHostTelemetryOutboxEntryV1,
): boolean {
  return (
    left.sourceKind === right.sourceKind &&
    left.sourceId === right.sourceId &&
    left.sourceSequence === right.sourceSequence &&
    left.ordinal === right.ordinal
  );
}

abstract class StateRepositoryV1<
  T extends {
    readonly revision: number;
    readonly stateDigest: string;
    readonly logicalTimeHighWaterMs: number;
  },
> {
  protected readonly prefix: string;
  protected constructor(
    protected readonly pool: Pool,
    protected readonly scopeId: string,
    private readonly stateKind: string,
    schema = defaultPostgresSchema,
  ) {
    if (!pool) throw new TypeError("PostgreSQL pool is required");
    if (!scopeId)
      throw new TypeError("collective host PostgreSQL scope is required");
    this.prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(schema, "schema"))}.`;
  }

  protected async loadState(stateKey: string): Promise<T | null> {
    const result = await this.pool.query<{
      revision: string | number;
      logical_time_high_water_ms: string | number;
      state_digest: string;
      state: T;
    }>(
      `SELECT revision, logical_time_high_water_ms, state_digest, state
         FROM ${this.prefix}collective_host_runtime_states
       WHERE scope_id = $1 AND state_kind = $2 AND state_key = $3`,
      [this.scopeId, this.stateKind, stateKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (
      Number(row.revision) !== row.state.revision ||
      Number(row.logical_time_high_water_ms) !==
        row.state.logicalTimeHighWaterMs ||
      row.state_digest !== row.state.stateDigest
    )
      throw new Error(
        "collective host PostgreSQL state columns diverge from the document",
      );
    return row.state;
  }

  protected async saveState(
    stateKey: string,
    stateDigest: string,
    logicalTimeHighWaterMs: number,
    state: T,
    expectedRevision: number | null,
  ): Promise<boolean> {
    if (
      (expectedRevision === null && state.revision !== 0) ||
      (expectedRevision !== null && state.revision !== expectedRevision + 1)
    )
      return false;
    if (expectedRevision === null) {
      const inserted = await this.pool.query(
        `INSERT INTO ${this.prefix}collective_host_runtime_states
          (scope_id, state_kind, state_key, revision, logical_time_high_water_ms, state_digest, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          this.scopeId,
          this.stateKind,
          stateKey,
          state.revision,
          logicalTimeHighWaterMs,
          stateDigest,
          JSON.stringify(state),
        ],
      );
      return (inserted.rowCount ?? 0) === 1;
    }
    const updated = await this.pool.query(
      `UPDATE ${this.prefix}collective_host_runtime_states
          SET revision = $5, logical_time_high_water_ms = $6, state_digest = $7,
              state = $8::jsonb, updated_at = transaction_timestamp()
        WHERE scope_id = $1 AND state_kind = $2 AND state_key = $3
          AND revision = $4
          AND logical_time_high_water_ms <= $6`,
      [
        this.scopeId,
        this.stateKind,
        stateKey,
        expectedRevision,
        state.revision,
        logicalTimeHighWaterMs,
        stateDigest,
        JSON.stringify(state),
      ],
    );
    return (updated.rowCount ?? 0) === 1;
  }
}

export class PostgresDistributedCollectiveProtocolStoreV1
  extends StateRepositoryV1<DistributedCollectiveProtocolStateV1>
  implements DistributedCollectiveProtocolStoreV1
{
  constructor(pool: Pool, options: CollectiveHostPostgresScopeV1) {
    super(
      pool,
      options.scopeId,
      "distributed-collective-protocol",
      options.schema,
    );
  }
  load(protocolId: string) {
    return this.loadState(protocolId);
  }
  save(
    state: DistributedCollectiveProtocolStateV1,
    expectedRevision: number | null,
  ) {
    return this.saveState(
      state.protocolId,
      state.stateDigest,
      state.logicalTimeHighWaterMs,
      state,
      expectedRevision,
    );
  }
}

export class PostgresAutonomousAdaptationStoreV1
  extends StateRepositoryV1<AutonomousAdaptationStateV1>
  implements AutonomousAdaptationStoreV1
{
  constructor(pool: Pool, options: CollectiveHostPostgresScopeV1) {
    super(pool, options.scopeId, "autonomous-adaptation", options.schema);
  }
  load(runtimeId: string) {
    return this.loadState(runtimeId);
  }
  save(state: AutonomousAdaptationStateV1, expectedRevision: number | null) {
    return this.saveState(
      state.runtimeId,
      state.stateDigest,
      state.logicalTimeHighWaterMs,
      state,
      expectedRevision,
    );
  }
}

export class PostgresAutonomousCollectiveNodeStoreV1
  extends StateRepositoryV1<AutonomousCollectiveNodeStateV1>
  implements AutonomousCollectiveNodeStoreV1
{
  readonly #maximumPendingTelemetry: number;
  constructor(pool: Pool, options: CollectiveHostPostgresScopeV1) {
    super(pool, options.scopeId, "autonomous-collective-node", options.schema);
    this.#maximumPendingTelemetry = telemetryCapacity(
      options.maximumPendingTelemetry,
    );
  }
  load(runtimeId: string) {
    return this.loadState(runtimeId);
  }
  save(
    state: AutonomousCollectiveNodeStateV1,
    expectedRevision: number | null,
  ) {
    return this.saveState(
      state.runtimeId,
      state.stateDigest,
      state.logicalTimeHighWaterMs,
      state,
      expectedRevision,
    );
  }

  async reserveAdvance(input: {
    readonly runtimeId: string;
    readonly expectedRevision: number;
    readonly requestedLogicalTimeMs: number;
    readonly holderId: string;
    readonly leaseDurationMs: number;
  }): Promise<AutonomousCollectiveAdvanceReservationV1 | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const state = await client.query<{ revision: string | number }>(
        `SELECT revision
           FROM ${this.prefix}collective_host_runtime_states
          WHERE scope_id = $1 AND state_kind = 'autonomous-collective-node'
            AND state_key = $2
          FOR UPDATE`,
        [this.scopeId, input.runtimeId],
      );
      if (Number(state.rows[0]?.revision) !== input.expectedRevision) {
        await client.query("ROLLBACK");
        return null;
      }
      const active = await client.query<{
        advance_id: string;
        expected_revision: string | number;
        canonical_logical_time_ms: string | number;
        holder_id: string;
        lease_until_logical_ms: string | number;
        fence: string | number;
      }>(
        `SELECT advance_id, expected_revision, canonical_logical_time_ms,
                holder_id, lease_until_logical_ms, fence
           FROM ${this.prefix}collective_host_autonomous_node_advances
          WHERE scope_id = $1 AND runtime_id = $2
          FOR UPDATE`,
        [this.scopeId, input.runtimeId],
      );
      const prior = active.rows[0];
      if (
        prior &&
        input.requestedLogicalTimeMs <= Number(prior.lease_until_logical_ms)
      ) {
        await client.query("ROLLBACK");
        return null;
      }
      const sameRevision =
        prior && Number(prior.expected_revision) === input.expectedRevision;
      const reservation: AutonomousCollectiveAdvanceReservationV1 = {
        schemaVersion: 1,
        runtimeId: input.runtimeId,
        advanceId: sameRevision
          ? prior.advance_id
          : `advance:${input.runtimeId}:${input.expectedRevision}`,
        expectedRevision: input.expectedRevision,
        canonicalLogicalTimeMs: sameRevision
          ? Number(prior.canonical_logical_time_ms)
          : input.requestedLogicalTimeMs,
        holderId: input.holderId,
        leaseUntilLogicalMs:
          input.requestedLogicalTimeMs + input.leaseDurationMs,
        fence: Number(prior?.fence ?? 0) + 1,
      };
      await client.query(
        `INSERT INTO ${this.prefix}collective_host_autonomous_node_advances
          (scope_id, runtime_id, advance_id, expected_revision,
           canonical_logical_time_ms, holder_id, lease_until_logical_ms, fence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (scope_id, runtime_id) DO UPDATE SET
           advance_id = EXCLUDED.advance_id,
           expected_revision = EXCLUDED.expected_revision,
           canonical_logical_time_ms = EXCLUDED.canonical_logical_time_ms,
           holder_id = EXCLUDED.holder_id,
           lease_until_logical_ms = EXCLUDED.lease_until_logical_ms,
           fence = EXCLUDED.fence,
           updated_at = transaction_timestamp()`,
        [
          this.scopeId,
          reservation.runtimeId,
          reservation.advanceId,
          reservation.expectedRevision,
          reservation.canonicalLogicalTimeMs,
          reservation.holderId,
          reservation.leaseUntilLogicalMs,
          reservation.fence,
        ],
      );
      await client.query("COMMIT");
      return Object.freeze(reservation);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async assertAdvanceFence(
    reservation: AutonomousCollectiveAdvanceReservationV1,
    logicalTimeMs: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1
         FROM ${this.prefix}collective_host_autonomous_node_advances
        WHERE scope_id = $1 AND runtime_id = $2 AND advance_id = $3
          AND holder_id = $4 AND fence = $5
          AND canonical_logical_time_ms = $6
          AND lease_until_logical_ms = $7
          AND lease_until_logical_ms >= $8`,
      [
        this.scopeId,
        reservation.runtimeId,
        reservation.advanceId,
        reservation.holderId,
        reservation.fence,
        reservation.canonicalLogicalTimeMs,
        reservation.leaseUntilLogicalMs,
        logicalTimeMs,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async saveAdvance(
    state: AutonomousCollectiveNodeStateV1,
    expectedRevision: number,
    reservation: AutonomousCollectiveAdvanceReservationV1,
    telemetry: readonly CollectiveHostTelemetryOutboxEntryV1[] = [],
  ): Promise<boolean> {
    const validated = telemetry.length > 0
      ? await validateCollectiveHostTelemetryOutboxBatchV1(telemetry)
      : [];
    if (
      state.revision !== expectedRevision + 1 ||
      (validated.length > 0 &&
        (validated.length !== 1 ||
          validated[0]!.sourceKind !== "autonomous_node" ||
          validated[0]!.sourceId !== state.runtimeId ||
          validated[0]!.sourceSequence !== state.revision ||
          validated[0]!.ordinal !== 0 ||
          validated[0]!.event.operationDigest !== state.stateDigest))
    )
      return false;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const fence = await client.query(
        `SELECT 1
           FROM ${this.prefix}collective_host_autonomous_node_advances
          WHERE scope_id = $1 AND runtime_id = $2 AND advance_id = $3
            AND holder_id = $4 AND fence = $5
            AND canonical_logical_time_ms = $6
            AND lease_until_logical_ms = $7
            AND lease_until_logical_ms >= $6
          FOR UPDATE`,
        [
          this.scopeId,
          reservation.runtimeId,
          reservation.advanceId,
          reservation.holderId,
          reservation.fence,
          reservation.canonicalLogicalTimeMs,
          reservation.leaseUntilLogicalMs,
        ],
      );
      if ((fence.rowCount ?? 0) !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      if (validated.length > 0)
        await appendTelemetryV1(
          client,
          this.prefix,
          this.scopeId,
          this.#maximumPendingTelemetry,
          validated,
        );
      const updated = await client.query(
        `UPDATE ${this.prefix}collective_host_runtime_states
            SET revision = $4, logical_time_high_water_ms = $5,
                state_digest = $6, state = $7::jsonb,
                updated_at = transaction_timestamp()
          WHERE scope_id = $1 AND state_kind = 'autonomous-collective-node'
            AND state_key = $2 AND revision = $3
            AND logical_time_high_water_ms <= $5`,
        [
          this.scopeId,
          state.runtimeId,
          expectedRevision,
          state.revision,
          state.logicalTimeHighWaterMs,
          state.stateDigest,
          JSON.stringify(state),
        ],
      );
      if ((updated.rowCount ?? 0) !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        `DELETE FROM ${this.prefix}collective_host_autonomous_node_commands
          WHERE scope_id = $1 AND runtime_id = $2 AND status = 'completed'`,
        [this.scopeId, state.runtimeId],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseAdvance(
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ${this.prefix}collective_host_autonomous_node_advances
        WHERE scope_id = $1 AND runtime_id = $2 AND advance_id = $3
          AND holder_id = $4 AND fence = $5`,
      [
        this.scopeId,
        reservation.runtimeId,
        reservation.advanceId,
        reservation.holderId,
        reservation.fence,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  /**
   * The dispatch transaction deliberately holds the advance row lock only for
   * one external command. This trades lease-takeover latency for a closed
   * fence-to-invocation boundary. A process death leaves the separately
   * committed pending row; retry must reconcile at the idempotent port before
   * applying again.
   */
  async runAdvanceCommand<T>(input: {
    readonly reservation: AutonomousCollectiveAdvanceReservationV1;
    readonly commandId: string;
    readonly commandDigest: string;
    readonly commandBinding: unknown;
    readonly effect: () => Promise<T>;
  } & (
    | { readonly recovery: "repeatable" }
    | {
        readonly recovery: "reconcile";
        readonly reconcile: () => Promise<{ readonly found: true; readonly value: T } | { readonly found: false }>;
      }
  )): Promise<T> {
    validateAutonomousCollectiveCommandBindingV1(input.commandBinding);
    const coordinates = [
      this.scopeId,
      input.reservation.runtimeId,
      input.commandId,
    ];
    let previouslyPending = false;
    const prepare = await this.pool.connect();
    try {
      await prepare.query("BEGIN");
      const fence = await lockAutonomousAdvanceV1(
        prepare,
        this.prefix,
        this.scopeId,
        input.reservation,
      );
      if (!fence)
        throw new Error("autonomous collective node advance fence is stale");
      const existing = await prepare.query<{
        command_digest: string;
        status: string;
        result: T | null;
      }>(
        `SELECT command_digest, status, result, command_binding
           FROM ${this.prefix}collective_host_autonomous_node_commands
          WHERE scope_id = $1 AND runtime_id = $2 AND command_id = $3
          FOR UPDATE`,
        coordinates,
      );
      const row = existing.rows[0];
      if (row && row.command_digest !== input.commandDigest)
        throw new TypeError("autonomous advance command digest mismatch");
      previouslyPending = Boolean(row);
      if (!row)
        await prepare.query(
          `INSERT INTO ${this.prefix}collective_host_autonomous_node_commands
            (scope_id, runtime_id, command_id, command_digest, command_binding, status)
           VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')`,
          [...coordinates, input.commandDigest, JSON.stringify(input.commandBinding)],
        );
      await prepare.query("COMMIT");
    } catch (error) {
      await prepare.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      prepare.release();
    }

    const dispatch = await this.pool.connect();
    try {
      await dispatch.query("BEGIN");
      const fence = await lockAutonomousAdvanceV1(
        dispatch,
        this.prefix,
        this.scopeId,
        input.reservation,
      );
      if (!fence)
        throw new Error("autonomous collective node advance fence is stale");
      const command = await dispatch.query<{
        command_digest: string;
        status: string;
        result: T | null;
      }>(
        `SELECT command_digest, status, result
           FROM ${this.prefix}collective_host_autonomous_node_commands
          WHERE scope_id = $1 AND runtime_id = $2 AND command_id = $3
          FOR UPDATE`,
        coordinates,
      );
      const row = command.rows[0];
      if (!row || row.command_digest !== input.commandDigest)
        throw new TypeError("autonomous advance command binding changed");
      if (row.status === "completed") {
        if (input.recovery === "reconcile") {
          const authoritative = await input.reconcile();
          if (!authoritative.found)
            throw new Error(
              "completed autonomous command has no authoritative receipt",
            );
          await dispatch.query("COMMIT");
          return authoritative.value;
        }
        await dispatch.query("COMMIT");
        return row.result as T;
      }
      const reconciled = previouslyPending && input.recovery === "reconcile"
        ? await input.reconcile()
        : { found: false as const };
      const result = reconciled.found ? reconciled.value : await input.effect();
      await dispatch.query(
        `UPDATE ${this.prefix}collective_host_autonomous_node_commands
            SET status = 'completed', result = $4::jsonb,
                updated_at = transaction_timestamp()
          WHERE scope_id = $1 AND runtime_id = $2 AND command_id = $3
            AND command_digest = $5 AND status = 'pending'`,
        [
          ...coordinates,
          JSON.stringify(result === undefined ? null : result),
          input.commandDigest,
        ],
      );
      await dispatch.query("COMMIT");
      return result;
    } catch (error) {
      await dispatch.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      dispatch.release();
    }
  }

  async loadAdvanceCommandBinding(
    reservation: AutonomousCollectiveAdvanceReservationV1,
    commandId: string,
  ): Promise<unknown | null> {
    const result = await this.pool.query<{ command_binding: unknown }>(
      `SELECT command_binding
         FROM ${this.prefix}collective_host_autonomous_node_commands
        WHERE scope_id = $1 AND runtime_id = $2 AND command_id = $3
          AND EXISTS (
            SELECT 1
              FROM ${this.prefix}collective_host_autonomous_node_advances a
             WHERE a.scope_id = $1 AND a.runtime_id = $2
               AND a.advance_id = $4 AND a.holder_id = $5 AND a.fence = $6
          )`,
      [
        this.scopeId,
        reservation.runtimeId,
        commandId,
        reservation.advanceId,
        reservation.holderId,
        reservation.fence,
      ],
    );
    return result.rows[0]?.command_binding ?? null;
  }

  async saveWithTelemetry(
    state: AutonomousCollectiveNodeStateV1,
    expectedRevision: number | null,
    telemetry: readonly CollectiveHostTelemetryOutboxEntryV1[],
  ): Promise<boolean> {
    const validated =
      await validateCollectiveHostTelemetryOutboxBatchV1(telemetry);
    if (
      validated.length !== 1 ||
      validated[0]!.sourceKind !== "autonomous_node" ||
      validated[0]!.sourceId !== state.runtimeId ||
      validated[0]!.sourceSequence !== state.revision ||
      validated[0]!.ordinal !== 0 ||
      validated[0]!.event.operationDigest !== state.stateDigest
    )
      throw new TypeError("node telemetry/state binding is invalid");
    if (
      (expectedRevision === null && state.revision !== 0) ||
      (expectedRevision !== null && state.revision !== expectedRevision + 1)
    )
      return false;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await appendTelemetryV1(
        client,
        this.prefix,
        this.scopeId,
        this.#maximumPendingTelemetry,
        validated,
      );
      const result =
        expectedRevision === null
          ? await client.query(
              `INSERT INTO ${this.prefix}collective_host_runtime_states
              (scope_id, state_kind, state_key, revision,
               logical_time_high_water_ms, state_digest, state)
             VALUES ($1, 'autonomous-collective-node', $2, $3, $4, $5, $6::jsonb)
             ON CONFLICT DO NOTHING`,
              [
                this.scopeId,
                state.runtimeId,
                state.revision,
                state.logicalTimeHighWaterMs,
                state.stateDigest,
                JSON.stringify(state),
              ],
            )
          : await client.query(
              `UPDATE ${this.prefix}collective_host_runtime_states
                SET revision = $4, logical_time_high_water_ms = $5,
                    state_digest = $6, state = $7::jsonb,
                    updated_at = transaction_timestamp()
              WHERE scope_id = $1 AND state_kind = 'autonomous-collective-node'
                AND state_key = $2 AND revision = $3
                AND logical_time_high_water_ms <= $5`,
              [
                this.scopeId,
                state.runtimeId,
                expectedRevision,
                state.revision,
                state.logicalTimeHighWaterMs,
                state.stateDigest,
                JSON.stringify(state),
              ],
            );
      if ((result.rowCount ?? 0) !== 1) {
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

  loadPendingTelemetry(limit?: number) {
    return loadPendingTelemetryV1(this.pool, this.prefix, this.scopeId, limit);
  }

  markTelemetryRecorded(deliveryDigest: string) {
    return markTelemetryRecordedV1(
      this.pool,
      this.prefix,
      this.scopeId,
      deliveryDigest,
    );
  }

  acknowledgeTelemetry(deliveryDigest: string) {
    return acknowledgeTelemetryV1(
      this.pool,
      this.prefix,
      this.scopeId,
      deliveryDigest,
    );
  }
}

/**
 * Durable reservation and receipt ledger for assurance-coupled effects. A
 * lease permits a fresh worker to resume after a process stops mid-execution;
 * the protected effect port remains responsible for executionId idempotency.
 */
export class PostgresAssuranceCoupledExecutionStoreV1 implements AssuranceCoupledExecutionStoreV1 {
  readonly #prefix: string;
  readonly #maximumPendingTelemetry: number;

  constructor(
    private readonly pool: Pool,
    private readonly scopeId: string,
    schema = defaultPostgresSchema,
    maximumPendingTelemetry = 4_096,
  ) {
    if (!pool || !scopeId)
      throw new TypeError("assurance execution PostgreSQL scope is required");
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(schema, "schema"))}.`;
    this.#maximumPendingTelemetry = telemetryCapacity(maximumPendingTelemetry);
  }

  async load(
    executionId: string,
  ): Promise<AssuranceCoupledExecutionRecordV1 | null> {
    const result = await this.pool.query<{
      execution_input_digest: string;
      reservation_id: string;
      reserved_until_logical_ms: string | number;
      effect_checkpoint: AssuranceEffectCommitCheckpointV1 | null;
      receipt: AssuranceCoupledExecutionReceiptV1 | null;
    }>(
      `SELECT execution_input_digest, reservation_id, reserved_until_logical_ms,
              effect_checkpoint, receipt
         FROM ${this.#prefix}collective_host_assurance_executions
        WHERE scope_id = $1 AND execution_id = $2`,
      [this.scopeId, executionId],
    );
    const row = result.rows[0];
    return row
      ? Object.freeze({
          schemaVersion: 1,
          executionId,
          executionInputDigest: row.execution_input_digest,
          reservationId: row.reservation_id,
          reservedUntilLogicalMs: Number(row.reserved_until_logical_ms),
          effectCheckpoint: row.effect_checkpoint,
          receipt: row.receipt,
        })
      : null;
  }

  async checkpointEffect(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly checkpoint: AssuranceEffectCommitCheckpointV1;
  }): Promise<boolean> {
    const result = await this.pool.query<{ checkpoint_digest: string }>(
      `UPDATE ${this.#prefix}collective_host_assurance_executions
          SET effect_checkpoint = $5::jsonb,
              effect_checkpoint_digest = $6,
              updated_at = transaction_timestamp()
        WHERE scope_id = $1 AND execution_id = $2
          AND execution_input_digest = $3 AND reservation_id = $4
          AND receipt IS NULL
          AND (
            effect_checkpoint_digest = $6
            OR (
              effect_checkpoint IS NULL
              AND ($5::jsonb)->>'phase' IN ('gate_pending', 'prepared')
            )
            OR (
              (
                (effect_checkpoint->>'phase' = 'gate_pending'
                  AND ($5::jsonb)->>'phase' IN ('prepared', 'effect_committed'))
                OR
                (effect_checkpoint->>'phase' = 'prepared'
                  AND ($5::jsonb)->>'phase' = 'effect_committed')
              )
              AND (effect_checkpoint->'pendingReceipt'->>'receiptDigest') =
                  (($5::jsonb)->'pendingReceipt'->>'receiptDigest')
            )
          )
      RETURNING effect_checkpoint_digest AS checkpoint_digest`,
      [
        this.scopeId,
        input.executionId,
        input.executionInputDigest,
        input.reservationId,
        JSON.stringify(input.checkpoint),
        input.checkpoint.checkpointDigest,
      ],
    );
    return (
      result.rows[0]?.checkpoint_digest === input.checkpoint.checkpointDigest
    );
  }

  async reserve(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly logicalTimeMs: number;
    readonly reservedUntilLogicalMs: number;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}collective_host_assurance_executions
         (scope_id, execution_id, execution_input_digest, reservation_id,
          reserved_until_logical_ms, receipt, receipt_digest)
       VALUES ($1, $2, $3, $4, $6, NULL, NULL)
       ON CONFLICT (scope_id, execution_id) DO UPDATE
         SET reservation_id = EXCLUDED.reservation_id,
             reserved_until_logical_ms = EXCLUDED.reserved_until_logical_ms,
             updated_at = transaction_timestamp()
       WHERE collective_host_assurance_executions.receipt IS NULL
         AND collective_host_assurance_executions.execution_input_digest = EXCLUDED.execution_input_digest
         AND collective_host_assurance_executions.reserved_until_logical_ms < $5`,
      [
        this.scopeId,
        input.executionId,
        input.executionInputDigest,
        input.reservationId,
        input.logicalTimeMs,
        input.reservedUntilLogicalMs,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async complete(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly receipt: AssuranceCoupledExecutionReceiptV1;
  }): Promise<boolean> {
    const result = await this.pool.query<{ receipt_digest: string }>(
      `UPDATE ${this.#prefix}collective_host_assurance_executions
          SET receipt = $5::jsonb, receipt_digest = $6,
              updated_at = transaction_timestamp()
        WHERE scope_id = $1 AND execution_id = $2
          AND execution_input_digest = $3
          AND ((receipt IS NULL AND reservation_id = $4) OR receipt_digest = $6)
      RETURNING receipt_digest`,
      [
        this.scopeId,
        input.executionId,
        input.executionInputDigest,
        input.reservationId,
        JSON.stringify(input.receipt),
        input.receipt.receiptDigest,
      ],
    );
    return result.rows[0]?.receipt_digest === input.receipt.receiptDigest;
  }

  async completeWithTelemetry(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly receipt: AssuranceCoupledExecutionReceiptV1;
    readonly telemetry: readonly CollectiveHostTelemetryOutboxEntryV1[];
  }): Promise<boolean> {
    const validated = await validateCollectiveHostTelemetryOutboxBatchV1(
      input.telemetry,
    );
    const expectedLength = input.receipt.semanticHorizonDecisionDigest ? 2 : 1;
    if (
      validated.length !== expectedLength ||
      validated.some(
        (entry) =>
          entry.sourceKind !== "assurance_execution" ||
          entry.sourceId !== input.executionId ||
          entry.sourceSequence !== 1,
      ) ||
      validated[0]!.event.operationDigest !== input.receipt.receiptDigest ||
      (expectedLength === 2 &&
        validated[1]!.event.operationDigest !==
          input.receipt.semanticHorizonDecisionDigest)
    )
      throw new TypeError("assurance telemetry/receipt binding is invalid");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        execution_input_digest: string;
        reservation_id: string;
        receipt_digest: string | null;
      }>(
        `SELECT execution_input_digest, reservation_id, receipt_digest
           FROM ${this.#prefix}collective_host_assurance_executions
          WHERE scope_id = $1 AND execution_id = $2
          FOR UPDATE`,
        [this.scopeId, input.executionId],
      );
      const row = current.rows[0];
      if (
        !row ||
        row.execution_input_digest !== input.executionInputDigest ||
        row.receipt_digest !== null ||
        row.reservation_id !== input.reservationId
      ) {
        await client.query("COMMIT");
        return false;
      }
      await appendTelemetryV1(
        client,
        this.#prefix,
        this.scopeId,
        this.#maximumPendingTelemetry,
        validated,
      );
      const result = await client.query(
        `UPDATE ${this.#prefix}collective_host_assurance_executions
            SET receipt = $5::jsonb, receipt_digest = $6,
                updated_at = transaction_timestamp()
          WHERE scope_id = $1 AND execution_id = $2
            AND execution_input_digest = $3 AND reservation_id = $4
            AND receipt IS NULL`,
        [
          this.scopeId,
          input.executionId,
          input.executionInputDigest,
          input.reservationId,
          JSON.stringify(input.receipt),
          input.receipt.receiptDigest,
        ],
      );
      if ((result.rowCount ?? 0) !== 1) {
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

  loadPendingTelemetry(limit?: number) {
    return loadPendingTelemetryV1(this.pool, this.#prefix, this.scopeId, limit);
  }

  markTelemetryRecorded(deliveryDigest: string) {
    return markTelemetryRecordedV1(
      this.pool,
      this.#prefix,
      this.scopeId,
      deliveryDigest,
    );
  }

  acknowledgeTelemetry(deliveryDigest: string) {
    return acknowledgeTelemetryV1(
      this.pool,
      this.#prefix,
      this.scopeId,
      deliveryDigest,
    );
  }

  async release(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ${this.#prefix}collective_host_assurance_executions
        WHERE scope_id = $1 AND execution_id = $2
          AND execution_input_digest = $3 AND reservation_id = $4
          AND receipt IS NULL AND effect_checkpoint IS NULL`,
      [
        this.scopeId,
        input.executionId,
        input.executionInputDigest,
        input.reservationId,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }
}

/** Atomic state plus rollback anchor for the anytime semantic guarantee engine. */
export class PostgresAnytimeSemanticGuaranteeStoreV1
  implements AnytimeSemanticGuaranteeStoreV1, AnytimeSemanticGuaranteeAnchorV1
{
  readonly #prefix: string;

  constructor(
    private readonly pool: Pool,
    private readonly scopeId: string,
    schema = defaultPostgresSchema,
  ) {
    if (!pool || !scopeId)
      throw new TypeError("semantic guarantee PostgreSQL scope is required");
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(schema, "schema"))}.`;
  }

  async load(
    stateKey: string,
  ): Promise<AnytimeSemanticGuaranteeStateV1 | null> {
    const result = await this.pool.query<{
      revision: string | number;
      sequence_high_water: string | number;
      logical_time_high_water_ms: string | number;
      state_digest: string;
      state: AnytimeSemanticGuaranteeStateV1;
    }>(
      `SELECT revision, sequence_high_water, logical_time_high_water_ms, state_digest, state
         FROM ${this.#prefix}collective_host_semantic_guarantee_states
        WHERE scope_id = $1 AND state_key = $2`,
      [this.scopeId, stateKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (
      Number(row.revision) !== row.state.revision ||
      Number(row.sequence_high_water) !== row.state.sequenceHighWater ||
      Number(row.logical_time_high_water_ms) !==
        row.state.logicalTimeHighWaterMs ||
      row.state_digest !== row.state.stateDigest ||
      row.state.stateKey !== stateKey
    )
      throw new Error(
        "semantic guarantee PostgreSQL columns diverge from the document",
      );
    return row.state;
  }

  async readAnchor(stateKey: string) {
    const result = await this.pool.query<{
      revision: string | number;
      sequence_high_water: string | number;
      logical_time_high_water_ms: string | number;
      state_digest: string;
    }>(
      `SELECT revision, sequence_high_water, logical_time_high_water_ms, state_digest
         FROM ${this.#prefix}collective_host_semantic_guarantee_states
        WHERE scope_id = $1 AND state_key = $2`,
      [this.scopeId, stateKey],
    );
    const row = result.rows[0];
    return row
      ? {
          revision: Number(row.revision),
          sequenceHighWater: Number(row.sequence_high_water),
          logicalTimeHighWaterMs: Number(row.logical_time_high_water_ms),
          stateDigest: row.state_digest,
        }
      : null;
  }

  async compareAndSet(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: AnytimeSemanticGuaranteeStateV1;
  }): Promise<boolean> {
    if (
      input.next.stateKey !== input.stateKey ||
      input.next.revision !== (input.expectedRevision ?? 0) + 1
    )
      return false;
    if (input.expectedRevision === null) {
      if (input.expectedStateDigest !== null) return false;
      const inserted = await this.pool.query(
        `INSERT INTO ${this.#prefix}collective_host_semantic_guarantee_states
          (scope_id, state_key, revision, sequence_high_water,
           logical_time_high_water_ms, state_digest, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          this.scopeId,
          input.stateKey,
          input.next.revision,
          input.next.sequenceHighWater,
          input.next.logicalTimeHighWaterMs,
          input.next.stateDigest,
          JSON.stringify(input.next),
        ],
      );
      return (inserted.rowCount ?? 0) === 1;
    }
    if (input.expectedStateDigest === null) return false;
    const updated = await this.pool.query(
      `UPDATE ${this.#prefix}collective_host_semantic_guarantee_states
          SET revision = $5, sequence_high_water = $6,
              logical_time_high_water_ms = $7, state_digest = $8,
              state = $9::jsonb, updated_at = transaction_timestamp()
        WHERE scope_id = $1 AND state_key = $2
          AND revision = $3 AND state_digest = $4
          AND sequence_high_water < $6
          AND logical_time_high_water_ms <= $7`,
      [
        this.scopeId,
        input.stateKey,
        input.expectedRevision,
        input.expectedStateDigest,
        input.next.revision,
        input.next.sequenceHighWater,
        input.next.logicalTimeHighWaterMs,
        input.next.stateDigest,
        JSON.stringify(input.next),
      ],
    );
    return (updated.rowCount ?? 0) === 1;
  }
}

/**
 * Durable semantic horizon budget state plus a separately persisted monotonic
 * witness. Deployments may place the anchor table on a separately protected
 * PostgreSQL authority while retaining the same interface.
 */
export class PostgresSemanticHorizonBudgetRepositoryV1
  implements
    SemanticHorizonBudgetStoreV1,
    SemanticHorizonBudgetMonotonicAnchorStoreV1
{
  readonly #prefix: string;

  constructor(
    private readonly pool: Pool,
    private readonly scopeId: string,
    schema = defaultPostgresSchema,
  ) {
    if (!pool || !scopeId)
      throw new TypeError(
        "semantic horizon budget PostgreSQL scope is required",
      );
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(schema, "schema"))}.`;
  }

  async load(stateKey: string): Promise<SemanticHorizonBudgetStateV1 | null> {
    const result = await this.pool.query<{
      revision: string | number;
      state_digest: string;
      state: SemanticHorizonBudgetStateV1;
    }>(
      `SELECT revision, state_digest, state
         FROM ${this.#prefix}collective_host_semantic_horizon_budget_states
        WHERE scope_id = $1 AND state_key = $2`,
      [this.scopeId, stateKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    const state = validateSemanticHorizonBudgetStateV1(row.state, stateKey);
    if (
      Number(row.revision) !== state.revision ||
      row.state_digest !== state.stateDigest
    )
      throw new Error(
        "semantic horizon budget PostgreSQL columns diverge from the document",
      );
    return state;
  }

  async compareAndSet(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: SemanticHorizonBudgetStateV1;
  }): Promise<boolean> {
    const next = validateSemanticHorizonBudgetStateV1(
      input.next,
      input.stateKey,
    );
    if (
      next.revision !== (input.expectedRevision ?? 0) + 1 ||
      next.predecessorStateDigest !== input.expectedStateDigest
    )
      return false;
    if (input.expectedRevision === null) {
      if (input.expectedStateDigest !== null) return false;
      const inserted = await this.pool.query(
        `INSERT INTO ${this.#prefix}collective_host_semantic_horizon_budget_states
          (scope_id, state_key, revision, state_digest, state)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          this.scopeId,
          input.stateKey,
          next.revision,
          next.stateDigest,
          JSON.stringify(next),
        ],
      );
      return (inserted.rowCount ?? 0) === 1;
    }
    if (input.expectedStateDigest === null) return false;
    const updated = await this.pool.query(
      `UPDATE ${this.#prefix}collective_host_semantic_horizon_budget_states
          SET revision = $5, state_digest = $6, state = $7::jsonb,
              updated_at = transaction_timestamp()
        WHERE scope_id = $1 AND state_key = $2
          AND revision = $3 AND state_digest = $4
          AND $8 = state_digest`,
      [
        this.scopeId,
        input.stateKey,
        input.expectedRevision,
        input.expectedStateDigest,
        next.revision,
        next.stateDigest,
        JSON.stringify(next),
        next.predecessorStateDigest,
      ],
    );
    return (updated.rowCount ?? 0) === 1;
  }

  async readAnchor(
    stateKey: string,
  ): Promise<SemanticHorizonBudgetAnchorV1 | null> {
    const result = await this.pool.query<{
      revision: string | number;
      state_digest: string;
    }>(
      `SELECT revision, state_digest
         FROM ${this.#prefix}collective_host_semantic_horizon_budget_anchors
        WHERE scope_id = $1 AND state_key = $2`,
      [this.scopeId, stateKey],
    );
    const row = result.rows[0];
    return row
      ? Object.freeze({
          revision: Number(row.revision),
          stateDigest: row.state_digest,
        })
      : null;
  }

  async compareAndSetAnchor(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: SemanticHorizonBudgetAnchorV1;
  }): Promise<boolean> {
    if (input.next.revision !== (input.expectedRevision ?? 0) + 1) return false;
    if (input.expectedRevision === null) {
      if (input.expectedStateDigest !== null) return false;
      const inserted = await this.pool.query(
        `INSERT INTO ${this.#prefix}collective_host_semantic_horizon_budget_anchors
          (scope_id, state_key, revision, state_digest)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [
          this.scopeId,
          input.stateKey,
          input.next.revision,
          input.next.stateDigest,
        ],
      );
      return (inserted.rowCount ?? 0) === 1;
    }
    if (input.expectedStateDigest === null) return false;
    const updated = await this.pool.query(
      `UPDATE ${this.#prefix}collective_host_semantic_horizon_budget_anchors
          SET revision = $5, state_digest = $6,
              updated_at = transaction_timestamp()
        WHERE scope_id = $1 AND state_key = $2
          AND revision = $3 AND state_digest = $4`,
      [
        this.scopeId,
        input.stateKey,
        input.expectedRevision,
        input.expectedStateDigest,
        input.next.revision,
        input.next.stateDigest,
      ],
    );
    return (updated.rowCount ?? 0) === 1;
  }
}

export class PostgresIntegratedCollectiveHostStoreV2
  extends StateRepositoryV1<IntegratedCollectiveHostStateV2>
  implements IntegratedCollectiveHostStoreV2
{
  constructor(pool: Pool, options: CollectiveHostPostgresScopeV1) {
    super(pool, options.scopeId, "integrated-collective-host", options.schema);
  }
  load(hostId: string) {
    return this.loadState(hostId);
  }
  save(
    state: IntegratedCollectiveHostStateV2,
    expectedRevision: number | null,
  ) {
    return this.saveState(
      state.hostId,
      state.stateDigest,
      state.logicalTimeHighWaterMs,
      state,
      expectedRevision,
    );
  }
}

export class PostgresLocalRuleKernelStoreV1
  extends StateRepositoryV1<LocalRuleKernelStateV1>
  implements LocalRuleKernelStoreV1
{
  constructor(pool: Pool, options: CollectiveHostPostgresScopeV1) {
    super(pool, options.scopeId, "local-rule-kernel", options.schema);
  }
  load(stateKey: string) {
    return this.loadState(stateKey);
  }
  save(state: LocalRuleKernelStateV1, expectedRevision: number | null) {
    return this.saveState(
      state.stateKey,
      state.stateDigest,
      state.logicalTimeHighWaterMs,
      state,
      expectedRevision,
    );
  }
}

export class PostgresPeerCredibilityStateStoreV1
  extends StateRepositoryV1<PeerCredibilityStateV1>
  implements PeerCredibilityStateStoreV1
{
  constructor(pool: Pool, options: CollectiveHostPostgresScopeV1) {
    super(pool, options.scopeId, "peer-credibility", options.schema);
  }
  load(stateKey: string) {
    return this.loadState(stateKey);
  }
  save(state: PeerCredibilityStateV1, expectedRevision: number | null) {
    return this.saveState(
      state.stateKey,
      state.stateDigest,
      state.logicalTimeHighWaterMs,
      state,
      expectedRevision,
    );
  }
}

export class PostgresDistributedCollectiveArtifactStoreV1 implements DistributedCollectiveArtifactStoreV1 {
  readonly #prefix: string;
  constructor(
    private readonly pool: Pool,
    private readonly scopeId: string,
    schema = defaultPostgresSchema,
  ) {
    if (!pool || !scopeId)
      throw new TypeError("collective artifact PostgreSQL scope is required");
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(schema, "schema"))}.`;
  }
  async put(message: DistributedCollectiveMessageV1): Promise<void> {
    const result = await this.pool.query<{ message_digest: string }>(
      `INSERT INTO ${this.#prefix}collective_host_protocol_artifacts
        (scope_id, artifact_digest, message_digest, artifact)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (scope_id, artifact_digest) DO UPDATE
         SET artifact_digest = EXCLUDED.artifact_digest
       RETURNING message_digest`,
      [
        this.scopeId,
        message.artifactDigest,
        message.messageDigest,
        JSON.stringify(message),
      ],
    );
    if (result.rows[0]?.message_digest !== message.messageDigest)
      throw new Error("collective artifact digest collision");
  }
  async get(
    artifactDigest: DistributedCollectiveMessageV1["artifactDigest"],
  ): Promise<DistributedCollectiveMessageV1 | null> {
    const result = await this.pool.query<{
      artifact: DistributedCollectiveMessageV1;
    }>(
      `SELECT artifact FROM ${this.#prefix}collective_host_protocol_artifacts
       WHERE scope_id = $1 AND artifact_digest = $2`,
      [this.scopeId, artifactDigest],
    );
    return result.rows[0]?.artifact ?? null;
  }
}

/**
 * Shared idempotency boundary for replicated interoperability routers. A row
 * lock makes reservation takeover and response commit linearizable per key.
 */
export class PostgresInteropIdempotencyStoreV1 implements InteropIdempotencyStoreV1 {
  readonly #prefix: string;
  constructor(
    private readonly pool: Pool,
    private readonly scopeId: string,
    schema = defaultPostgresSchema,
  ) {
    if (!pool || !scopeId)
      throw new TypeError("interop PostgreSQL scope is required");
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(schema, "schema"))}.`;
  }

  async load(
    idempotencyKey: string,
  ): Promise<InteropIdempotencyRecordV1 | null> {
    const result = await this.pool.query<{
      request_digest: string;
      reservation_id: string;
      reserved_until_logical_ms: string | number;
      response: InteropResponseEnvelopeV1 | null;
    }>(
      `SELECT request_digest, reservation_id, reserved_until_logical_ms, response
         FROM ${this.#prefix}collective_host_interop_idempotency
        WHERE scope_id = $1 AND idempotency_key = $2`,
      [this.scopeId, idempotencyKey],
    );
    const row = result.rows[0];
    return row
      ? Object.freeze({
          requestDigest: row.request_digest,
          reservationId: row.reservation_id,
          reservedUntilLogicalMs: Number(row.reserved_until_logical_ms),
          response: row.response,
        })
      : null;
  }

  async reserve(input: {
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly reservationId: string;
    readonly logicalTimeMs: number;
    readonly reservedUntilLogicalMs: number;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        request_digest: string;
        reserved_until_logical_ms: string | number;
        response: InteropResponseEnvelopeV1 | null;
      }>(
        `SELECT request_digest, reserved_until_logical_ms, response
           FROM ${this.#prefix}collective_host_interop_idempotency
          WHERE scope_id = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [this.scopeId, input.idempotencyKey],
      );
      const row = current.rows[0];
      if (!row) {
        await client.query(
          `INSERT INTO ${this.#prefix}collective_host_interop_idempotency
            (scope_id, idempotency_key, request_digest, reservation_id,
             reserved_until_logical_ms, response, response_digest)
           VALUES ($1, $2, $3, $4, $5, NULL, NULL)`,
          [
            this.scopeId,
            input.idempotencyKey,
            input.requestDigest,
            input.reservationId,
            input.reservedUntilLogicalMs,
          ],
        );
        await client.query("COMMIT");
        return true;
      }
      if (row.request_digest !== input.requestDigest)
        throw new Error(
          "interop idempotency key was reused with different content",
        );
      if (
        row.response ||
        Number(row.reserved_until_logical_ms) >= input.logicalTimeMs
      ) {
        await client.query("COMMIT");
        return false;
      }
      await client.query(
        `UPDATE ${this.#prefix}collective_host_interop_idempotency
            SET reservation_id = $3, reserved_until_logical_ms = $4,
                updated_at = transaction_timestamp()
          WHERE scope_id = $1 AND idempotency_key = $2`,
        [
          this.scopeId,
          input.idempotencyKey,
          input.reservationId,
          input.reservedUntilLogicalMs,
        ],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
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
    const result = await this.pool.query<{ response_digest: string }>(
      `UPDATE ${this.#prefix}collective_host_interop_idempotency
          SET response = $5::jsonb, response_digest = $6,
              updated_at = transaction_timestamp()
        WHERE scope_id = $1 AND idempotency_key = $2
          AND request_digest = $3 AND reservation_id = $4
          AND (response IS NULL OR response_digest = $6)
      RETURNING response_digest`,
      [
        this.scopeId,
        input.idempotencyKey,
        input.requestDigest,
        input.reservationId,
        JSON.stringify(input.response),
        input.response.responseDigest,
      ],
    );
    return result.rows[0]?.response_digest === input.response.responseDigest;
  }
}

/** Durable monotonic sequence admission shared by every router replica. */
export class PostgresInteropSequenceStoreV1 implements InteropSequenceStoreV1 {
  readonly #prefix: string;
  constructor(
    private readonly pool: Pool,
    private readonly scopeId: string,
    schema = defaultPostgresSchema,
  ) {
    if (!pool || !scopeId)
      throw new TypeError("interop PostgreSQL scope is required");
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(schema, "schema"))}.`;
  }

  async admit(input: {
    readonly issuerId: string;
    readonly sessionId: string;
    readonly operation: InteropOperationV1;
    readonly sequence: number;
    readonly requestDigest: string;
  }): Promise<InteropSequenceAdmissionV1> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        sequence: string | number;
        request_digest: string;
      }>(
        `SELECT sequence, request_digest
           FROM ${this.#prefix}collective_host_interop_sequence_heads
          WHERE scope_id = $1 AND issuer_id = $2 AND session_id = $3 AND operation = $4
          FOR UPDATE`,
        [this.scopeId, input.issuerId, input.sessionId, input.operation],
      );
      const row = current.rows[0];
      if (!row) {
        await client.query(
          `INSERT INTO ${this.#prefix}collective_host_interop_sequence_heads
            (scope_id, issuer_id, session_id, operation, sequence, request_digest)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            this.scopeId,
            input.issuerId,
            input.sessionId,
            input.operation,
            input.sequence,
            input.requestDigest,
          ],
        );
        await client.query("COMMIT");
        return "advanced";
      }
      const currentSequence = Number(row.sequence);
      if (input.sequence < currentSequence) {
        await client.query("COMMIT");
        return "stale";
      }
      if (input.sequence === currentSequence) {
        await client.query("COMMIT");
        return input.requestDigest === row.request_digest
          ? "duplicate"
          : "conflict";
      }
      await client.query(
        `UPDATE ${this.#prefix}collective_host_interop_sequence_heads
            SET sequence = $5, request_digest = $6, updated_at = transaction_timestamp()
          WHERE scope_id = $1 AND issuer_id = $2 AND session_id = $3 AND operation = $4`,
        [
          this.scopeId,
          input.issuerId,
          input.sessionId,
          input.operation,
          input.sequence,
          input.requestDigest,
        ],
      );
      await client.query("COMMIT");
      return "advanced";
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
