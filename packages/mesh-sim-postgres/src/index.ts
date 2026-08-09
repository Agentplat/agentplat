import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { canonicalizePlanningJsonV1 } from '@agentplat/collective-planning';
import {
  validateCollectiveEvaluationCampaignExecutionV1,
  type CollectiveEvaluationCampaignExecutionV1,
  type CollectiveEvaluationExecutionFenceV1,
} from '@agentplat/collective-planning/evaluation';
import {
  digestCollectiveStatisticalCampaignArtifactV1,
  type CollectiveStatisticalCampaignArtifactIndexEntryV1,
  type CollectiveStatisticalCampaignArtifactKindV1,
  type CollectiveStatisticalCampaignDeadlineArtifactWriterV1,
  type CollectiveStatisticalCampaignArtifactReaderV1,
  type CollectiveStatisticalCampaignArtifactWriterV1,
  type CollectiveStatisticalCampaignExecutionArtifactsV1,
  type CollectiveStatisticalCampaignFencedExecutionStoreV1,
} from '@agentplat/mesh-sim';
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from '@agentplat/postgres';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

export const MESH_SIM_POSTGRES_SCHEMA_VERSION_V1 = 1 as const;
export const MESH_SIM_POSTGRES_MIGRATION_VERSION_V1 = 2 as const;
export const DEFAULT_MESH_SIM_POSTGRES_LIMITS_V1 = Object.freeze({
  maximumArtifactBytes: 16 * 1024 * 1024,
  maximumArtifacts: 16_384,
  maximumReadKeys: 4_096,
  maximumStateBytes: 16 * 1024 * 1024,
});

export interface MeshSimPostgresLimitsV1 {
  readonly maximumArtifactBytes: number;
  readonly maximumArtifacts: number;
  readonly maximumReadKeys: number;
  readonly maximumStateBytes: number;
}
export interface PostgresCollectiveStatisticalCampaignStoreOptionsV1 {
  readonly schema?: string;
  /** Isolates logical campaigns in a shared schema; it is never interpolated into SQL. */
  readonly namespace: string;
  readonly limits?: Partial<MeshSimPostgresLimitsV1>;
}

type Row = QueryResultRow & Record<string, unknown>;
type Database = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

/**
 * PostgreSQL implementation with immutable artifact bindings and revision CAS.
 * The caller owns the pool and is responsible for applying this package's migrations.
 */
export class PostgresCollectiveStatisticalCampaignStoreV1 implements CollectiveStatisticalCampaignFencedExecutionStoreV1 {
  readonly schemaVersion = 1 as const;
  readonly #prefix: string;
  readonly #namespace: string;
  readonly #limits: MeshSimPostgresLimitsV1;
  constructor(
    readonly pool: Pool,
    options: PostgresCollectiveStatisticalCampaignStoreOptionsV1,
  ) {
    if (!pool || typeof pool.connect !== 'function')
      throw new TypeError('PostgreSQL pool is required');
    if (!options || typeof options !== 'object')
      throw new TypeError('store options are required');
    this.#namespace = token(options.namespace, 'namespace', 128);
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(options.schema ?? defaultPostgresSchema, 'schema'))}.`;
    this.#limits = limits(options.limits);
  }

  createArtifactWriterV1(): CollectiveStatisticalCampaignDeadlineArtifactWriterV1 {
    return Object.freeze({
      schemaVersion: 1 as const,
      putArtifactV1: (
        input: Parameters<
          CollectiveStatisticalCampaignArtifactWriterV1['putArtifactV1']
        >[0],
      ) => this.putArtifact(input, null),
      putArtifactBeforeDeadlineV1: (
        input: Parameters<
          CollectiveStatisticalCampaignDeadlineArtifactWriterV1['putArtifactBeforeDeadlineV1']
        >[0],
      ) => {
        const { operationExpiresAtMs, ...artifact } = input;
        return this.putArtifact(artifact, operationExpiresAtMs);
      },
    });
  }
  createArtifactReaderV1(
    artifacts: readonly CollectiveStatisticalCampaignArtifactIndexEntryV1[],
  ): CollectiveStatisticalCampaignArtifactReaderV1 {
    const indexed = new Map<
      string,
      CollectiveStatisticalCampaignArtifactIndexEntryV1
    >();
    if (
      !Array.isArray(artifacts) ||
      artifacts.length > this.#limits.maximumArtifacts
    )
      throw new RangeError('artifact index exceeds limit');
    for (const entry of artifacts) {
      const id = token(entry?.artifactId, 'artifactId', 256);
      if (indexed.has(id))
        throw new TypeError('artifact index contains duplicate id');
      indexed.set(id, Object.freeze({ ...entry }));
    }
    const ids = Object.freeze([...indexed.keys()].sort());
    return Object.freeze({
      schemaVersion: 1 as const,
      listArtifactIdsV1: async () => ids,
      openArtifactV1: (artifactId: string) =>
        this.openArtifact(indexed.get(token(artifactId, 'artifactId', 256))),
    });
  }

  async readExecutionStateV1(
    input: Readonly<{ executionId: string; registrationDigest: string }>,
  ): Promise<CollectiveEvaluationCampaignExecutionV1 | null> {
    const executionId = token(input.executionId, 'executionId', 256);
    const registrationDigest = digest(
      input.registrationDigest,
      'registrationDigest',
    );
    const result = await this.query<Row>(
      `SELECT state, state_sha256 FROM ${this.#prefix}mesh_sim_execution_states WHERE namespace = $1 AND execution_id = $2`,
      [this.#namespace, executionId],
    );
    if (result.rowCount === 0) return null;
    const bytes = jsonBytes(
      result.rows[0]!.state,
      this.#limits.maximumStateBytes,
    );
    if (sha256(bytes) !== String(result.rows[0]!.state_sha256))
      throw new TypeError('execution state hash mismatch');
    const state = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as CollectiveEvaluationCampaignExecutionV1;
    if (
      state.executionId !== executionId ||
      state.registrationDigest !== registrationDigest
    )
      throw new TypeError('execution state identity conflict');
    return state;
  }

  async compareAndSwapExecutionStateV1(
    input: Readonly<{
      executionId: string;
      expectedExecutionDigest: string | null;
      state: CollectiveEvaluationCampaignExecutionV1;
    }>,
  ): Promise<'committed' | 'duplicate' | 'conflict'> {
    const result = await this.compareAndSwapExecutionState(input, null);
    if (result === 'expired')
      throw new TypeError('unexpected operation expiry');
    return result;
  }

  async compareAndSwapExecutionStateWithDeadlineV1(
    input: Readonly<{
      executionId: string;
      expectedExecutionDigest: string | null;
      operationExpiresAtMs: number;
      state: CollectiveEvaluationCampaignExecutionV1;
    }>,
  ): Promise<'committed' | 'duplicate' | 'conflict' | 'expired'> {
    const operationExpiresAtMs = optionalTime(
      input.operationExpiresAtMs,
      'operationExpiresAtMs',
    );
    if (operationExpiresAtMs === null)
      throw new TypeError('operationExpiresAtMs is required');
    return this.compareAndSwapExecutionState(
      {
        executionId: input.executionId,
        expectedExecutionDigest: input.expectedExecutionDigest,
        state: input.state,
      },
      operationExpiresAtMs,
    );
  }

  private async compareAndSwapExecutionState(
    input: Readonly<{
      executionId: string;
      expectedExecutionDigest: string | null;
      state: CollectiveEvaluationCampaignExecutionV1;
    }>,
    operationExpiresAtMs: number | null,
  ): Promise<'committed' | 'duplicate' | 'conflict' | 'expired'> {
    const executionId = token(input.executionId, 'executionId', 256);
    if (input.expectedExecutionDigest !== null)
      digest(input.expectedExecutionDigest, 'expectedExecutionDigest');
    const state = validateCollectiveEvaluationCampaignExecutionV1(input.state);
    if (state.executionId !== executionId)
      throw new TypeError('execution state identity conflict');
    const bytes = jsonBytes(state, this.#limits.maximumStateBytes);
    const contentHash = sha256(bytes);
    return this.transaction(async (db) => {
      await this.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`${this.#namespace}\u001fstate\u001f${executionId}`],
        db,
      );
      const current = await this.query<Row>(
        `SELECT state, state_sha256 FROM ${this.#prefix}mesh_sim_execution_states WHERE namespace=$1 AND execution_id=$2 FOR UPDATE`,
        [this.#namespace, executionId],
        db,
      );
      if (operationExpiresAtMs !== null) {
        const clockResult = await this.query<Row>(
          `SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms`,
          [],
          db,
        );
        if (Number(clockResult.rows[0]!.now_ms) >= operationExpiresAtMs)
          return 'expired';
      }
      if (current.rowCount === 0) {
        if (input.expectedExecutionDigest !== null) return 'conflict';
        const inserted = await this.query<Row>(
          `INSERT INTO ${this.#prefix}mesh_sim_execution_states (namespace, execution_id, registration_digest, execution_digest, state, state_sha256) VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT DO NOTHING RETURNING state`,
          [
            this.#namespace,
            executionId,
            state.registrationDigest,
            state.executionDigest,
            new TextDecoder().decode(bytes),
            contentHash,
          ],
          db,
        );
        if (inserted.rowCount === 1) return 'committed';
        const raced = await this.query<Row>(
          `SELECT state, state_sha256 FROM ${this.#prefix}mesh_sim_execution_states WHERE namespace=$1 AND execution_id=$2 FOR UPDATE`,
          [this.#namespace, executionId],
          db,
        );
        if (raced.rowCount !== 1) return 'conflict';
        const racedBytes = jsonBytes(
          raced.rows[0]!.state,
          this.#limits.maximumStateBytes,
        );
        if (sha256(racedBytes) !== String(raced.rows[0]!.state_sha256))
          throw new TypeError('execution state hash mismatch');
        return equal(racedBytes, bytes) ? 'duplicate' : 'conflict';
      }
      const row = current.rows[0]!;
      const existing = jsonBytes(row.state, this.#limits.maximumStateBytes);
      if (sha256(existing) !== String(row.state_sha256))
        throw new TypeError('execution state hash mismatch');
      const prior = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(existing),
      ) as CollectiveEvaluationCampaignExecutionV1;
      if (prior.executionDigest !== input.expectedExecutionDigest)
        return 'conflict';
      if (equal(existing, bytes)) return 'duplicate';
      await this.query(
        `UPDATE ${this.#prefix}mesh_sim_execution_states SET registration_digest=$3, execution_digest=$4, state=$5::jsonb, state_sha256=$6, updated_at=transaction_timestamp() WHERE namespace=$1 AND execution_id=$2`,
        [
          this.#namespace,
          executionId,
          state.registrationDigest,
          state.executionDigest,
          new TextDecoder().decode(bytes),
          contentHash,
        ],
        db,
      );
      return 'committed';
    });
  }

  async readExecutionsV1(runKeys: readonly string[]) {
    if (
      !Array.isArray(runKeys) ||
      runKeys.length > this.#limits.maximumReadKeys ||
      new Set(runKeys).size !== runKeys.length
    )
      throw new RangeError('execution read keys are invalid');
    const values = await Promise.all(
      runKeys.map(async (runKey) => {
        const key = token(runKey, 'runKey', 256);
        const result = await this.query<Row>(
          `SELECT execution, execution_sha256 FROM ${this.#prefix}mesh_sim_slot_commits WHERE namespace=$1 AND run_key=$2`,
          [this.#namespace, key],
        );
        if (result.rowCount === 0)
          return Object.freeze({ runKey: key, execution: null });
        const bytes = jsonBytes(
          result.rows[0]!.execution,
          this.#limits.maximumArtifactBytes,
        );
        if (sha256(bytes) !== String(result.rows[0]!.execution_sha256))
          throw new TypeError('slot execution hash mismatch');
        const execution = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        ) as CollectiveStatisticalCampaignExecutionArtifactsV1;
        if (execution.runKey !== key)
          throw new TypeError('slot execution identity conflict');
        return Object.freeze({ runKey: key, execution });
      }),
    );
    return Object.freeze(values);
  }

  async commitExecutionV1(
    input: Readonly<{
      runKey: string;
      execution: CollectiveStatisticalCampaignExecutionArtifactsV1;
    }>,
  ): Promise<'committed' | 'duplicate'> {
    token(input.runKey, 'runKey', 256);
    throw new TypeError(
      'unfenced PostgreSQL execution commits are unsupported',
    );
  }

  async readExecutionWithFenceV1(
    input: Readonly<{
      executionId: string;
      registrationDigest: string;
      cellId: string;
      runKey: string;
      fence: CollectiveEvaluationExecutionFenceV1;
      operationExpiresAtMs?: number | null;
    }>,
  ): Promise<CollectiveStatisticalCampaignExecutionArtifactsV1 | null> {
    const executionId = token(input.executionId, 'executionId', 256);
    const registrationDigest = digest(
      input.registrationDigest,
      'registrationDigest',
    );
    const cellId = token(input.cellId, 'cellId', 256);
    const runKey = token(input.runKey, 'runKey', 256);
    const fence = normalizeFence(input.fence);
    const operationExpiresAtMs = optionalTime(
      input.operationExpiresAtMs,
      'operationExpiresAtMs',
    );
    const result = await this.query<Row>(
      `SELECT execution, execution_sha256, execution_id, registration_digest,
              cell_id, fence_worker_id, fence_lease_token, fence_generation,
              fence_expires_at_ms, operation_expires_at_ms
         FROM ${this.#prefix}mesh_sim_slot_commits
        WHERE namespace=$1 AND run_key=$2`,
      [this.#namespace, runKey],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0]!;
    if (
      !sameStoredProvenance(
        row,
        executionId,
        registrationDigest,
        cellId,
        fence,
        operationExpiresAtMs,
      )
    )
      throw new TypeError('slot commit fence provenance mismatch');
    const bytes = jsonBytes(row.execution, this.#limits.maximumArtifactBytes);
    if (sha256(bytes) !== String(row.execution_sha256))
      throw new TypeError('slot execution hash mismatch');
    const execution = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as CollectiveStatisticalCampaignExecutionArtifactsV1;
    if (
      execution.executionId !== executionId ||
      execution.cellId !== cellId ||
      execution.runKey !== runKey
    )
      throw new TypeError('slot execution identity conflict');
    return execution;
  }

  async commitExecutionWithFenceV1(
    input: Readonly<{
      executionId: string;
      registrationDigest: string;
      cellId: string;
      runKey: string;
      fence: CollectiveEvaluationExecutionFenceV1;
      operationExpiresAtMs?: number | null;
      execution: CollectiveStatisticalCampaignExecutionArtifactsV1;
    }>,
  ): Promise<'committed' | 'duplicate' | 'stale_fence'> {
    const executionId = token(input.executionId, 'executionId', 256);
    const registrationDigest = digest(
      input.registrationDigest,
      'registrationDigest',
    );
    const cellId = token(input.cellId, 'cellId', 256);
    const runKey = token(input.runKey, 'runKey', 256);
    const fence = normalizeFence(input.fence);
    const operationExpiresAtMs = optionalTime(
      input.operationExpiresAtMs,
      'operationExpiresAtMs',
    );
    if (
      !input.execution ||
      input.execution.executionId !== executionId ||
      input.execution.cellId !== cellId ||
      input.execution.runKey !== runKey
    )
      throw new TypeError('slot execution identity conflict');
    const bytes = jsonBytes(input.execution, this.#limits.maximumArtifactBytes);
    const hash = sha256(bytes);
    return this.transaction(async (db) => {
      const current = await this.query<Row>(
        `SELECT state, state_sha256
           FROM ${this.#prefix}mesh_sim_execution_states
          WHERE namespace=$1 AND execution_id=$2
          FOR UPDATE`,
        [this.#namespace, executionId],
        db,
      );
      if (current.rowCount !== 1) return 'stale_fence';
      const stateBytes = jsonBytes(
        current.rows[0]!.state,
        this.#limits.maximumStateBytes,
      );
      if (sha256(stateBytes) !== String(current.rows[0]!.state_sha256))
        throw new TypeError('execution state hash mismatch');
      const state = validateCollectiveEvaluationCampaignExecutionV1(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(stateBytes),
        ),
      );
      const clockResult = await this.query<Row>(
        `SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms`,
        [],
        db,
      );
      const nowMs = Number(clockResult.rows[0]!.now_ms);
      if (
        (operationExpiresAtMs !== null && nowMs >= operationExpiresAtMs) ||
        state.registrationDigest !== registrationDigest ||
        !activeFence(state, cellId, runKey, fence, nowMs)
      )
        return 'stale_fence';
      const existing = await this.query<Row>(
        `SELECT execution_sha256, execution_id, registration_digest, cell_id,
                fence_worker_id, fence_lease_token, fence_generation,
                fence_expires_at_ms, operation_expires_at_ms
           FROM ${this.#prefix}mesh_sim_slot_commits
          WHERE namespace=$1 AND run_key=$2
          FOR UPDATE`,
        [this.#namespace, runKey],
        db,
      );
      if (existing.rowCount !== 0) {
        if (String(existing.rows[0]!.execution_sha256) !== hash)
          throw new TypeError('slot commit conflict');
        if (
          !sameStoredProvenance(
            existing.rows[0]!,
            executionId,
            registrationDigest,
            cellId,
            fence,
            operationExpiresAtMs,
          )
        )
          throw new TypeError('slot commit fence provenance mismatch');
        return 'duplicate';
      }
      await this.query(
        `INSERT INTO ${this.#prefix}mesh_sim_slot_commits
           (namespace,run_key,execution_id,registration_digest,cell_id,
            fence_worker_id,fence_lease_token,fence_generation,
            fence_expires_at_ms,operation_expires_at_ms,execution,execution_sha256)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
        [
          this.#namespace,
          runKey,
          executionId,
          registrationDigest,
          cellId,
          fence.workerId,
          fence.leaseToken,
          fence.generation,
          fence.expiresAtMs,
          operationExpiresAtMs,
          new TextDecoder().decode(bytes),
          hash,
        ],
        db,
      );
      return 'committed';
    });
  }

  private async putArtifact(
    input: Parameters<
      CollectiveStatisticalCampaignArtifactWriterV1['putArtifactV1']
    >[0],
    operationExpiresAtMs: number | null,
  ): Promise<CollectiveStatisticalCampaignArtifactIndexEntryV1> {
    if (operationExpiresAtMs !== null)
      optionalTime(operationExpiresAtMs, 'operationExpiresAtMs');
    const artifactId = token(input?.artifactId, 'artifactId', 256);
    if (
      !Number.isSafeInteger(input.maximumBytes) ||
      input.maximumBytes < 1 ||
      input.maximumBytes > this.#limits.maximumArtifactBytes
    )
      throw new RangeError('artifact maximumBytes is invalid');
    const bytes = await collect(input.bytes, input.maximumBytes);
    let value: unknown;
    try {
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      throw new TypeError('artifact is not valid UTF-8 JSON');
    }
    const sha = sha256(bytes);
    const entry = Object.freeze({
      schemaVersion: 1 as const,
      artifactId,
      kind: input.kind,
      path: `artifacts/sha256/${sha}.json`,
      byteLength: bytes.byteLength,
      sha256: sha,
      canonicalDigest: digestCollectiveStatisticalCampaignArtifactV1(
        input.kind as CollectiveStatisticalCampaignArtifactKindV1,
        value as never,
      ),
    });
    const binding = jsonBytes(entry, this.#limits.maximumArtifactBytes);
    await this.transaction(async (db) => {
      for (const lockKey of [
        `${this.#namespace}\u001fartifact\u001f${artifactId}`,
        `${this.#namespace}\u001fcontent\u001f${sha}`,
      ])
        await this.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [lockKey],
          db,
        );
      if (operationExpiresAtMs !== null) {
        const clockResult = await this.query<Row>(
          `SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms`,
          [],
          db,
        );
        if (Number(clockResult.rows[0]!.now_ms) >= operationExpiresAtMs)
          throw new TypeError('artifact operation deadline expired');
      }
      await this.query(
        `INSERT INTO ${this.#prefix}mesh_sim_artifact_blobs (namespace,content_sha256,bytes) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [this.#namespace, sha, Buffer.from(bytes)],
        db,
      );
      const blob = await this.query<Row>(
        `SELECT bytes FROM ${this.#prefix}mesh_sim_artifact_blobs WHERE namespace=$1 AND content_sha256=$2 FOR UPDATE`,
        [this.#namespace, sha],
        db,
      );
      if (sha256(asBytes(blob.rows[0]!.bytes)) !== sha)
        throw new TypeError('artifact content hash mismatch');
      const current = await this.query<Row>(
        `SELECT binding, binding_sha256, operation_expires_at_ms FROM ${this.#prefix}mesh_sim_artifact_bindings WHERE namespace=$1 AND artifact_id=$2 FOR UPDATE`,
        [this.#namespace, artifactId],
        db,
      );
      if (current.rowCount !== 0) {
        const prior = asBytes(current.rows[0]!.binding);
        if (
          sha256(prior) !== String(current.rows[0]!.binding_sha256) ||
          !equal(prior, binding) ||
          optionalStoredTime(current.rows[0]!.operation_expires_at_ms) !==
            operationExpiresAtMs
        )
          throw new TypeError('artifact binding conflict');
        return;
      }
      const count = await this.query<Row>(
        `SELECT count(*)::text AS count FROM ${this.#prefix}mesh_sim_artifact_bindings WHERE namespace=$1`,
        [this.#namespace],
        db,
      );
      if (Number(count.rows[0]!.count) >= this.#limits.maximumArtifacts)
        throw new RangeError('artifact limit exceeded');
      await this.query(
        `INSERT INTO ${this.#prefix}mesh_sim_artifact_bindings (namespace,artifact_id,content_sha256,binding,binding_sha256,operation_expires_at_ms) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          this.#namespace,
          artifactId,
          sha,
          Buffer.from(binding),
          sha256(binding),
          operationExpiresAtMs,
        ],
        db,
      );
    });
    return entry;
  }
  private async *openArtifact(
    entry: CollectiveStatisticalCampaignArtifactIndexEntryV1 | undefined,
  ): AsyncIterable<Uint8Array> {
    if (!entry) throw new TypeError('artifact is not indexed');
    const binding = await this.query<Row>(
      `SELECT content_sha256,binding,binding_sha256 FROM ${this.#prefix}mesh_sim_artifact_bindings WHERE namespace=$1 AND artifact_id=$2`,
      [this.#namespace, entry.artifactId],
    );
    if (binding.rowCount !== 1)
      throw new TypeError('artifact binding is missing');
    const row = binding.rows[0]!;
    const bytes = asBytes(row.binding);
    if (
      sha256(bytes) !== String(row.binding_sha256) ||
      !equal(bytes, jsonBytes(entry, this.#limits.maximumArtifactBytes))
    )
      throw new TypeError('artifact binding changed');
    const blob = await this.query<Row>(
      `SELECT bytes FROM ${this.#prefix}mesh_sim_artifact_blobs WHERE namespace=$1 AND content_sha256=$2`,
      [this.#namespace, String(row.content_sha256)],
    );
    if (blob.rowCount !== 1) throw new TypeError('artifact content is missing');
    const content = asBytes(blob.rows[0]!.bytes);
    if (
      content.byteLength !== entry.byteLength ||
      sha256(content) !== entry.sha256
    )
      throw new TypeError('artifact content hash mismatch');
    yield content;
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

export function createPostgresCollectiveStatisticalCampaignArtifactWriterV1(
  store: PostgresCollectiveStatisticalCampaignStoreV1,
) {
  return store.createArtifactWriterV1();
}
export function createPostgresCollectiveStatisticalCampaignArtifactReaderV1(
  store: PostgresCollectiveStatisticalCampaignStoreV1,
  artifacts: readonly CollectiveStatisticalCampaignArtifactIndexEntryV1[],
) {
  return store.createArtifactReaderV1(artifacts);
}

function limits(
  input: Partial<MeshSimPostgresLimitsV1> | undefined,
): MeshSimPostgresLimitsV1 {
  const result = { ...DEFAULT_MESH_SIM_POSTGRES_LIMITS_V1, ...input };
  for (const key of Object.keys(DEFAULT_MESH_SIM_POSTGRES_LIMITS_V1)) {
    const value = result[key as keyof MeshSimPostgresLimitsV1];
    const hardMaximum =
      DEFAULT_MESH_SIM_POSTGRES_LIMITS_V1[key as keyof MeshSimPostgresLimitsV1];
    if (!Number.isSafeInteger(value) || value < 1 || value > hardMaximum)
      throw new RangeError(`${key} is invalid`);
  }
  return Object.freeze(result);
}
function token(value: unknown, label: string, max: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}
function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
  return value;
}
function jsonBytes(value: unknown, maximum: number): Uint8Array {
  const bytes = new TextEncoder().encode(
    canonicalizePlanningJsonV1(value as never, {
      maximumBytes: maximum,
      maximumDepth: 64,
      maximumNodes: 2_000_000,
      maximumKeysPerObject: 4_096,
      maximumItemsPerArray: 262_144,
    }),
  );
  if (bytes.byteLength < 1 || bytes.byteLength > maximum)
    throw new RangeError('stored value exceeds byte limit');
  return bytes;
}
function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function asBytes(value: unknown): Uint8Array {
  if (Buffer.isBuffer(value)) return new Uint8Array(value as Uint8Array);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  throw new TypeError('database bytea value is invalid');
}
function equal(a: Uint8Array, b: Uint8Array): boolean {
  return (
    a.byteLength === b.byteLength &&
    a.every((value, index) => value === b[index])
  );
}
async function collect(
  stream: AsyncIterable<Uint8Array>,
  maximum: number,
): Promise<Uint8Array> {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function')
    throw new TypeError('artifact byte stream is invalid');
  const chunks: Uint8Array[] = [];
  let size = 0,
    count = 0;
  for await (const chunk of stream) {
    if (
      !(chunk instanceof Uint8Array) ||
      chunk.byteLength === 0 ||
      ++count > 65_536 ||
      (size += chunk.byteLength) > maximum
    )
      throw new RangeError('artifact stream exceeds limit');
    chunks.push(Uint8Array.from(chunk));
  }
  if (size < 1) throw new RangeError('artifact stream is empty');
  const result = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.byteLength;
  }
  return result;
}

function normalizeFence(
  value: CollectiveEvaluationExecutionFenceV1,
): CollectiveEvaluationExecutionFenceV1 {
  if (
    !value ||
    typeof value !== 'object' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1 ||
    !Number.isSafeInteger(value.expiresAtMs) ||
    value.expiresAtMs < 0
  )
    throw new TypeError('execution fence is invalid');
  return Object.freeze({
    workerId: token(value.workerId, 'fence workerId', 256),
    leaseToken: token(value.leaseToken, 'fence leaseToken', 256),
    generation: value.generation,
    expiresAtMs: value.expiresAtMs,
  });
}

function optionalTime(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label} is invalid`);
  return value;
}

function sameStoredProvenance(
  row: Row,
  executionId: string,
  registrationDigest: string,
  cellId: string,
  fence: CollectiveEvaluationExecutionFenceV1,
  operationExpiresAtMs: number | null,
): boolean {
  return (
    String(row.execution_id) === executionId &&
    String(row.registration_digest) === registrationDigest &&
    String(row.cell_id) === cellId &&
    String(row.fence_worker_id) === fence.workerId &&
    String(row.fence_lease_token) === fence.leaseToken &&
    Number(row.fence_generation) === fence.generation &&
    Number(row.fence_expires_at_ms) === fence.expiresAtMs &&
    optionalStoredTime(row.operation_expires_at_ms) === operationExpiresAtMs
  );
}

function optionalStoredTime(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new TypeError('stored operation expiry is invalid');
  return parsed;
}

function activeFence(
  state: CollectiveEvaluationCampaignExecutionV1,
  cellId: string,
  runKey: string,
  fence: CollectiveEvaluationExecutionFenceV1,
  nowMs: number,
): boolean {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0)
    throw new TypeError('database clock is invalid');
  const cell = state.cells.find((candidate) => candidate.cellId === cellId);
  const current = cell?.lease;
  const slot = cell?.runs.find((candidate) => candidate.runKey === runKey);
  return (
    cell?.status === 'running' &&
    slot?.status === 'running' &&
    current !== null &&
    current !== undefined &&
    current.expiresAtMs > nowMs &&
    current.workerId === fence.workerId &&
    current.leaseToken === fence.leaseToken &&
    current.generation === fence.generation &&
    current.expiresAtMs === fence.expiresAtMs
  );
}

export {
  getMeshSimPostgresMigrationStatusV1,
  meshSimPostgresMigrationDirectoryV1,
  meshSimPostgresRollbackConfirmationV1,
  rollbackMeshSimPostgresMigrationV1,
  runMeshSimPostgresMigrationsV1,
} from './migrations.js';
export type { MeshSimPostgresMigrationOptionsV1 } from './migrations.js';
export * from './scalable-evaluation-checkpoint-store.js';
