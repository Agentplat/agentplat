import { createHash } from 'node:crypto';

import { canonicalizePlanningJsonV1 } from '@agentplat/collective-planning';
import {
  createScalableEvaluationRestartDurabilityDeclarationV1,
  scalableEvaluationDigestV1,
  validateScalableEvaluationRunnerCheckpointV1,
  type ScalableEvaluationCheckpointStoreCasReceiptV1,
  type ScalableEvaluationDurableCheckpointStoreV1,
  type ScalableEvaluationRunnerCheckpointV1,
} from '@agentplat/mesh-sim';
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from '@agentplat/postgres';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

export const DEFAULT_POSTGRES_SCALABLE_EVALUATION_CHECKPOINT_BYTES_V1 =
  16 * 1024 * 1024;
export const MAXIMUM_POSTGRES_SCALABLE_EVALUATION_CHECKPOINT_BYTES_V1 =
  64 * 1024 * 1024;

export interface PostgresScalableEvaluationCheckpointStoreOptionsV1 {
  readonly schema?: string;
  /** Shared-table isolation boundary; values are always SQL parameters. */
  readonly namespace: string;
  readonly maximumCheckpointBytes?: number;
}

type Row = QueryResultRow & Record<string, unknown>;
type Database = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

/**
 * Restart-durable PostgreSQL head store for scalable evaluation runners.
 * CAS is serialized by namespace/run advisory lock and row lock. The caller
 * owns the pool and applies this package's migrations.
 */
export class PostgresScalableEvaluationCheckpointStoreV1
  implements ScalableEvaluationDurableCheckpointStoreV1
{
  readonly restartDurabilityV1;
  readonly #prefix: string;
  readonly #namespace: string;
  readonly #maximumCheckpointBytes: number;

  constructor(
    readonly pool: Pool,
    options: PostgresScalableEvaluationCheckpointStoreOptionsV1,
  ) {
    if (!pool || typeof pool.connect !== 'function')
      throw new TypeError('PostgreSQL pool is required');
    if (!options || typeof options !== 'object')
      throw new TypeError('checkpoint store options are required');
    this.#namespace = token(options.namespace, 'namespace', 128);
    const schema = normalizePostgresIdentifier(
      options.schema ?? defaultPostgresSchema,
      'schema',
    );
    this.#prefix = `${quotePostgresIdentifier(schema)}.`;
    this.#maximumCheckpointBytes = checkpointLimit(
      options.maximumCheckpointBytes,
    );
    this.restartDurabilityV1 =
      createScalableEvaluationRestartDurabilityDeclarationV1({
        providerId: 'agentplat.mesh-sim-postgres.scalable-evaluation.v1',
        continuityId: `postgres:${schema}:${this.#namespace}`,
        maximumCheckpointBytes: this.#maximumCheckpointBytes,
      });
  }

  async loadV1(input: {
    readonly runId: string;
  }): Promise<ScalableEvaluationRunnerCheckpointV1 | null> {
    const runId = token(input?.runId, 'runId', 256);
    const result = await this.query<Row>(
      `SELECT run_id, revision, checkpoint_digest, previous_checkpoint_digest,
              definition_digest, adapter_descriptor_digest, schedule_digest,
              ports_digest, configuration_digest, checkpoint,
              checkpoint_sha256, checkpoint_bytes
         FROM ${this.#prefix}mesh_sim_scalable_evaluation_checkpoints
        WHERE namespace=$1 AND run_id=$2`,
      [this.#namespace, runId],
    );
    if (result.rowCount === 0) return null;
    return this.validateStoredRow(result.rows[0]!, runId).checkpoint;
  }

  async compareAndSwapV1(input: {
    readonly runId: string;
    readonly expectedRevision: number | null;
    readonly checkpoint: ScalableEvaluationRunnerCheckpointV1;
  }): Promise<ScalableEvaluationCheckpointStoreCasReceiptV1> {
    const runId = token(input?.runId, 'runId', 256);
    const expectedRevision = optionalRevision(input?.expectedRevision);
    const checkpoint = validateScalableEvaluationRunnerCheckpointV1(
      input?.checkpoint,
    );
    if (checkpoint.runId !== runId)
      throw new TypeError('checkpoint run identity conflict');
    const bytes = checkpointBytes(
      checkpoint,
      this.#maximumCheckpointBytes,
    );
    const contentHash = sha256(bytes);
    return this.transaction(async (db) => {
      await this.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`${this.#namespace}\u001fscalable-evaluation\u001f${runId}`],
        db,
      );
      const current = await this.query<Row>(
        `SELECT run_id, revision, checkpoint_digest, previous_checkpoint_digest,
                definition_digest, adapter_descriptor_digest, schedule_digest,
                ports_digest, configuration_digest, checkpoint,
                checkpoint_sha256, checkpoint_bytes
           FROM ${this.#prefix}mesh_sim_scalable_evaluation_checkpoints
          WHERE namespace=$1 AND run_id=$2
          FOR UPDATE`,
        [this.#namespace, runId],
        db,
      );
      if (current.rowCount === 0) {
        if (
          expectedRevision !== null ||
          checkpoint.revision !== 1 ||
          checkpoint.previousCheckpointDigest !== null
        )
          return casReceipt(checkpoint, 'conflict', null);
        await this.query(
          `INSERT INTO ${this.#prefix}mesh_sim_scalable_evaluation_checkpoints
             (namespace, run_id, revision, checkpoint_digest,
              previous_checkpoint_digest, definition_digest,
              adapter_descriptor_digest, schedule_digest, ports_digest,
              configuration_digest, checkpoint, checkpoint_sha256,
              checkpoint_bytes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
          rowValues(this.#namespace, runId, checkpoint, bytes, contentHash),
          db,
        );
        return casReceipt(checkpoint, 'stored', checkpoint.revision);
      }
      const stored = this.validateStoredRow(current.rows[0]!, runId);
      const intendedPredecessorRevision =
        checkpoint.revision === 1 ? null : checkpoint.revision - 1;
      if (
        equal(stored.bytes, bytes) &&
        stored.checkpoint.checkpointDigest === checkpoint.checkpointDigest
      )
        return casReceipt(
          checkpoint,
          expectedRevision === intendedPredecessorRevision
            ? 'duplicate'
            : 'conflict',
          stored.checkpoint.revision,
        );
      if (
        expectedRevision !== stored.checkpoint.revision ||
        checkpoint.revision !== stored.checkpoint.revision + 1 ||
        checkpoint.previousCheckpointDigest !==
          stored.checkpoint.checkpointDigest ||
        !sameConfiguration(stored.checkpoint, checkpoint)
      )
        return casReceipt(
          checkpoint,
          'conflict',
          stored.checkpoint.revision,
        );
      await this.query(
        `UPDATE ${this.#prefix}mesh_sim_scalable_evaluation_checkpoints
            SET revision=$3, checkpoint_digest=$4,
                previous_checkpoint_digest=$5, definition_digest=$6,
                adapter_descriptor_digest=$7, schedule_digest=$8,
                ports_digest=$9, configuration_digest=$10,
                checkpoint=$11::jsonb, checkpoint_sha256=$12,
                checkpoint_bytes=$13, updated_at=transaction_timestamp()
          WHERE namespace=$1 AND run_id=$2`,
        rowValues(this.#namespace, runId, checkpoint, bytes, contentHash),
        db,
      );
      return casReceipt(checkpoint, 'stored', checkpoint.revision);
    });
  }

  private validateStoredRow(
    row: Row,
    runId: string,
  ): {
    readonly checkpoint: ScalableEvaluationRunnerCheckpointV1;
    readonly bytes: Uint8Array;
  } {
    const bytes = checkpointBytes(
      row.checkpoint,
      this.#maximumCheckpointBytes,
    );
    const recordedBytes = storedInteger(
      row.checkpoint_bytes,
      'checkpoint byte length',
    );
    if (
      recordedBytes !== bytes.byteLength ||
      String(row.checkpoint_sha256) !== sha256(bytes)
    )
      throw new TypeError('checkpoint content hash mismatch');
    const checkpoint = validateScalableEvaluationRunnerCheckpointV1(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    if (
      String(row.run_id) !== runId ||
      storedInteger(row.revision, 'checkpoint revision') !==
        checkpoint.revision ||
      String(row.checkpoint_digest) !== checkpoint.checkpointDigest ||
      nullableString(row.previous_checkpoint_digest) !==
        checkpoint.previousCheckpointDigest ||
      String(row.definition_digest) !== checkpoint.definitionDigest ||
      String(row.adapter_descriptor_digest) !==
        checkpoint.adapterDescriptorDigest ||
      String(row.schedule_digest) !== checkpoint.scheduleDigest ||
      String(row.ports_digest) !== checkpoint.portsDigest ||
      String(row.configuration_digest) !== checkpoint.configurationDigest
    )
      throw new TypeError('checkpoint column binding mismatch');
    return Object.freeze({ checkpoint, bytes });
  }

  private query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[],
    db: Database = this.pool,
  ) {
    return db.query<R>(text, values);
  }

  private async transaction<T>(
    work: (db: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function checkpointLimit(value: number | undefined): number {
  const selected =
    value ?? DEFAULT_POSTGRES_SCALABLE_EVALUATION_CHECKPOINT_BYTES_V1;
  if (
    !Number.isSafeInteger(selected) ||
    selected < 1 ||
    selected > MAXIMUM_POSTGRES_SCALABLE_EVALUATION_CHECKPOINT_BYTES_V1
  )
    throw new RangeError('maximumCheckpointBytes is invalid');
  return selected;
}

function checkpointBytes(value: unknown, maximum: number): Uint8Array {
  let canonical: string;
  try {
    canonical = canonicalizePlanningJsonV1(value as never, {
      maximumBytes: maximum,
      maximumDepth: 64,
      maximumNodes: 2_000_000,
      maximumKeysPerObject: 4_096,
      maximumItemsPerArray: 262_144,
    });
  } catch (error) {
    throw new RangeError('checkpoint exceeds configured limits', {
      cause: error,
    });
  }
  const bytes = new TextEncoder().encode(canonical);
  if (bytes.byteLength < 1 || bytes.byteLength > maximum)
    throw new RangeError('checkpoint exceeds configured byte limit');
  return bytes;
}

function rowValues(
  namespace: string,
  runId: string,
  checkpoint: ScalableEvaluationRunnerCheckpointV1,
  bytes: Uint8Array,
  contentHash: string,
): unknown[] {
  return [
    namespace,
    runId,
    checkpoint.revision,
    checkpoint.checkpointDigest,
    checkpoint.previousCheckpointDigest,
    checkpoint.definitionDigest,
    checkpoint.adapterDescriptorDigest,
    checkpoint.scheduleDigest,
    checkpoint.portsDigest,
    checkpoint.configurationDigest,
    new TextDecoder().decode(bytes),
    contentHash,
    bytes.byteLength,
  ];
}

function sameConfiguration(
  left: ScalableEvaluationRunnerCheckpointV1,
  right: ScalableEvaluationRunnerCheckpointV1,
): boolean {
  return (
    left.definitionDigest === right.definitionDigest &&
    left.adapterDescriptorDigest === right.adapterDescriptorDigest &&
    left.scheduleDigest === right.scheduleDigest &&
    left.portsDigest === right.portsDigest &&
    left.configurationDigest === right.configurationDigest
  );
}

function casReceipt(
  checkpoint: ScalableEvaluationRunnerCheckpointV1,
  status: ScalableEvaluationCheckpointStoreCasReceiptV1['status'],
  currentRevision: number | null,
): ScalableEvaluationCheckpointStoreCasReceiptV1 {
  const body = {
    schemaVersion: 1 as const,
    runId: checkpoint.runId,
    revision: checkpoint.revision,
    checkpointDigest: checkpoint.checkpointDigest,
    status,
    currentRevision,
  };
  return Object.freeze({
    ...body,
    receiptDigest: scalableEvaluationDigestV1(
      'checkpoint-store-cas-receipt',
      body,
    ),
  });
}

function optionalRevision(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new TypeError('expectedRevision is invalid');
  return value as number;
}

function storedInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new TypeError(`${label} is invalid`);
  return parsed;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function token(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}
