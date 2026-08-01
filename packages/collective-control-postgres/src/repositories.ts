import {
  validateCollectiveAuthorityStateV1,
  validateCollectiveDecisionRecordV1,
  validateCollectiveExecutionStateV1,
  type CollectiveAuthorityRepositoryV1,
  type CollectiveAuthorityStateV1,
  type CollectiveDecisionRecordV1,
  type CollectiveDigestV1,
  type CollectiveEvidenceAnchorV1,
  type CollectiveEvidenceAppendResultV1,
  type CollectiveEvidenceSinkV1,
  type CollectiveExecutionRepositoryV1,
  type CollectiveExecutionStateV1,
} from "@agentplat/collective-control";
import {
  controlDigest,
  type ActionGrant,
  type ActionGrantRepository,
  type ActionGrantRepositoryCasResultV1,
  type ActionGrantRepositoryCreateResultV1,
  type ActionIdempotencyRecord,
  type ControlJson,
} from "@agentplat/inference-control/tools";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

export interface CollectiveControlPostgresScopeV1 {
  readonly schema?: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
}

abstract class ScopedRepositoryV1 {
  protected readonly prefix: string;

  protected constructor(
    protected readonly pool: Pool,
    readonly tenantId: string,
    readonly policyDomainId: string,
    schema = defaultPostgresSchema,
  ) {
    if (!pool) throw new TypeError("PostgreSQL pool is required");
    if (!tenantId || !policyDomainId)
      throw new TypeError("Collective repository scope is required");
    this.prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(schema, "schema"))}.`;
  }

  protected async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export class PostgresCollectiveAuthorityRepositoryV1
  extends ScopedRepositoryV1
  implements CollectiveAuthorityRepositoryV1
{
  constructor(pool: Pool, options: CollectiveControlPostgresScopeV1) {
    super(pool, options.tenantId, options.policyDomainId, options.schema);
  }

  async initialize(
    state: CollectiveAuthorityStateV1,
  ): Promise<"initialized" | "existing"> {
    const next = validateCollectiveAuthorityStateV1(state);
    this.assertScope(next);
    return this.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO ${this.prefix}collective_authority_states
          (tenant_id, policy_domain_id, generation, high_water_logical_ms, state_digest, state)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          this.tenantId,
          this.policyDomainId,
          next.generation,
          next.highWaterLogicalMs,
          next.stateDigest,
          JSON.stringify(next),
        ],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        const current = await this.readWith(client);
        if (current.stateDigest !== next.stateDigest)
          throw new Error("state_conflict");
        return "existing";
      }
      await mirrorAuthority(client, this.prefix, next);
      return "initialized";
    });
  }

  async read(): Promise<CollectiveAuthorityStateV1> {
    return this.readWith(this.pool);
  }

  async compareAndSwap(input: {
    readonly expectedGeneration: number;
    readonly expectedStateDigest: CollectiveDigestV1;
    readonly nextState: CollectiveAuthorityStateV1;
  }): Promise<boolean> {
    const next = validateCollectiveAuthorityStateV1(input.nextState);
    this.assertScope(next);
    if (next.generation !== input.expectedGeneration + 1)
      throw new Error("state_conflict");
    return this.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE ${this.prefix}collective_authority_states
            SET generation = $5, high_water_logical_ms = $6,
                state_digest = $7, state = $8::jsonb,
                updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND policy_domain_id = $2
            AND generation = $3 AND state_digest = $4
            AND high_water_logical_ms <= $6`,
        [
          this.tenantId,
          this.policyDomainId,
          input.expectedGeneration,
          input.expectedStateDigest,
          next.generation,
          next.highWaterLogicalMs,
          next.stateDigest,
          JSON.stringify(next),
        ],
      );
      if ((updated.rowCount ?? 0) === 0) return false;
      await mirrorAuthority(client, this.prefix, next);
      return true;
    });
  }

  private async readWith(
    queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">,
  ) {
    const result = await queryable.query<{ state: unknown }>(
      `SELECT state FROM ${this.prefix}collective_authority_states
        WHERE tenant_id = $1 AND policy_domain_id = $2`,
      [this.tenantId, this.policyDomainId],
    );
    if (!result.rows[0]) throw new Error("collective_authority_state_missing");
    const state = validateCollectiveAuthorityStateV1(result.rows[0].state);
    this.assertScope(state);
    return state;
  }

  private assertScope(state: CollectiveAuthorityStateV1) {
    if (
      state.tenantId !== this.tenantId ||
      state.policyDomainId !== this.policyDomainId
    )
      throw new Error("scope_mismatch");
  }
}

export class PostgresCollectiveExecutionRepositoryV1
  extends ScopedRepositoryV1
  implements CollectiveExecutionRepositoryV1
{
  constructor(pool: Pool, options: CollectiveControlPostgresScopeV1) {
    super(pool, options.tenantId, options.policyDomainId, options.schema);
  }

  async initialize(
    state: CollectiveExecutionStateV1,
  ): Promise<"initialized" | "existing"> {
    const next = validateCollectiveExecutionStateV1(state);
    this.assertScope(next);
    return this.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO ${this.prefix}collective_execution_states
          (tenant_id, policy_domain_id, generation, high_water_logical_ms, state_digest, state)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          this.tenantId,
          this.policyDomainId,
          next.generation,
          next.highWaterLogicalMs,
          next.stateDigest,
          JSON.stringify(next),
        ],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        const current = await this.readWith(client);
        if (current.stateDigest !== next.stateDigest)
          throw new Error("state_conflict");
        return "existing";
      }
      await mirrorExecution(client, this.prefix, next);
      return "initialized";
    });
  }

  async read(): Promise<CollectiveExecutionStateV1> {
    return this.readWith(this.pool);
  }

  async compareAndSwap(input: {
    readonly expectedGeneration: number;
    readonly expectedStateDigest: CollectiveDigestV1;
    readonly nextState: CollectiveExecutionStateV1;
  }): Promise<boolean> {
    const next = validateCollectiveExecutionStateV1(input.nextState);
    this.assertScope(next);
    if (next.generation !== input.expectedGeneration + 1)
      throw new Error("state_conflict");
    return this.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE ${this.prefix}collective_execution_states
            SET generation = $5, high_water_logical_ms = $6,
                state_digest = $7, state = $8::jsonb,
                updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND policy_domain_id = $2
            AND generation = $3 AND state_digest = $4
            AND high_water_logical_ms <= $6`,
        [
          this.tenantId,
          this.policyDomainId,
          input.expectedGeneration,
          input.expectedStateDigest,
          next.generation,
          next.highWaterLogicalMs,
          next.stateDigest,
          JSON.stringify(next),
        ],
      );
      if ((updated.rowCount ?? 0) === 0) return false;
      await mirrorExecution(client, this.prefix, next);
      return true;
    });
  }

  private async readWith(
    queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">,
  ) {
    const result = await queryable.query<{ state: unknown }>(
      `SELECT state FROM ${this.prefix}collective_execution_states
        WHERE tenant_id = $1 AND policy_domain_id = $2`,
      [this.tenantId, this.policyDomainId],
    );
    if (!result.rows[0]) throw new Error("collective_execution_state_missing");
    const state = validateCollectiveExecutionStateV1(result.rows[0].state);
    this.assertScope(state);
    return state;
  }

  private assertScope(state: CollectiveExecutionStateV1) {
    if (
      state.tenantId !== this.tenantId ||
      state.policyDomainId !== this.policyDomainId
    )
      throw new Error("scope_mismatch");
  }
}

export interface PostgresActionGrantRepositoryOptionsV1 {
  readonly schema?: string;
  readonly tenantId: string;
  readonly gatewayId: string;
}

export class PostgresActionGrantRepositoryV1 implements ActionGrantRepository {
  private readonly prefix: string;

  constructor(
    private readonly pool: Pool,
    options: PostgresActionGrantRepositoryOptionsV1,
  ) {
    if (!pool || !options.tenantId || !options.gatewayId)
      throw new TypeError("Action Grant repository scope is required");
    this.tenantId = options.tenantId;
    this.gatewayId = options.gatewayId;
    this.prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(options.schema ?? defaultPostgresSchema, "schema"))}.`;
  }

  readonly tenantId: string;
  readonly gatewayId: string;

  async observeLogicalTime(logicalTimeMs: number): Promise<void> {
    if (!Number.isSafeInteger(logicalTimeMs) || logicalTimeMs < 0)
      throw new TypeError("logicalTimeMs must be a non-negative safe integer");
    const result = await this.pool.query(
      `INSERT INTO ${this.prefix}collective_grant_clocks
        (tenant_id, gateway_id, high_water_logical_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, gateway_id) DO UPDATE
         SET high_water_logical_ms = EXCLUDED.high_water_logical_ms
       WHERE ${this.prefix}collective_grant_clocks.high_water_logical_ms <= EXCLUDED.high_water_logical_ms`,
      [this.tenantId, this.gatewayId, logicalTimeMs],
    );
    if ((result.rowCount ?? 0) === 0) throw new Error("logical_time_rollback");
  }

  async loadGrant(grantId: string): Promise<ActionGrant | undefined> {
    const result = await this.pool.query<{ grant: ActionGrant }>(
      `SELECT grant_record AS grant FROM ${this.prefix}collective_action_grants
        WHERE tenant_id = $1 AND gateway_id = $2 AND grant_id = $3`,
      [this.tenantId, this.gatewayId, grantId],
    );
    return result.rows[0]?.grant;
  }

  async loadIdempotency(
    scopeDigest: string,
    key: string,
  ): Promise<ActionIdempotencyRecord | undefined> {
    const result = await this.pool.query<{
      idempotency: ActionIdempotencyRecord;
    }>(
      `SELECT idempotency FROM ${this.prefix}collective_action_grants
        WHERE tenant_id = $1 AND gateway_id = $2
          AND scope_digest = $3 AND idempotency_key = $4`,
      [this.tenantId, this.gatewayId, scopeDigest, key],
    );
    return result.rows[0]?.idempotency;
  }

  async createGrant(input: {
    readonly grant: ActionGrant;
    readonly idempotency: ActionIdempotencyRecord;
  }): Promise<ActionGrantRepositoryCreateResultV1> {
    assertGrantPair(input.grant, input.idempotency);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [
          `${this.tenantId.length}:${this.tenantId}${this.gatewayId.length}:${this.gatewayId}`,
        ],
      );
      const existing = await client.query<{
        grant: ActionGrant;
        grant_digest: string;
      }>(
        `SELECT grant_record AS grant, grant_digest FROM ${this.prefix}collective_action_grants
          WHERE tenant_id = $1 AND gateway_id = $2 AND grant_id = $3`,
        [this.tenantId, this.gatewayId, input.grant.grantId],
      );
      if (existing.rows[0]) {
        const same = existing.rows[0].grant_digest === grantDigest(input.grant);
        await client.query("COMMIT");
        return Object.freeze({
          status: same ? "existing" : "conflict",
          conflictKind: same ? null : "grant",
          grant: existing.rows[0].grant,
        });
      }
      const duplicate = await client.query<{
        grant: ActionGrant;
        action_digest: string;
      }>(
        `SELECT grant_record AS grant, action_digest FROM ${this.prefix}collective_action_grants
          WHERE tenant_id = $1 AND gateway_id = $2
            AND scope_digest = $3 AND idempotency_key = $4`,
        [
          this.tenantId,
          this.gatewayId,
          input.idempotency.scopeDigest,
          input.idempotency.idempotencyKey,
        ],
      );
      if (duplicate.rows[0]) {
        const same =
          duplicate.rows[0].action_digest === input.idempotency.actionDigest;
        await client.query("COMMIT");
        return Object.freeze({
          status: same ? "existing" : "conflict",
          conflictKind: same ? null : "idempotency",
          grant: duplicate.rows[0].grant,
        });
      }
      await client.query(
        `INSERT INTO ${this.prefix}collective_action_grants
          (tenant_id, gateway_id, grant_id, scope_digest, idempotency_key,
           action_digest, state_generation, grant_digest, status, grant_record, idempotency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)`,
        [
          this.tenantId,
          this.gatewayId,
          input.grant.grantId,
          input.grant.scopeDigest,
          input.grant.idempotencyKey,
          input.grant.actionDigest,
          input.grant.stateGeneration,
          grantDigest(input.grant),
          input.grant.status,
          JSON.stringify(input.grant),
          JSON.stringify(input.idempotency),
        ],
      );
      await client.query("COMMIT");
      return Object.freeze({
        status: "created",
        conflictKind: null,
        grant: input.grant,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async compareAndSwapGrant(input: {
    readonly grantId: string;
    readonly expectedStateGeneration: number;
    readonly expectedGrantDigest: string;
    readonly nextGrant: ActionGrant;
    readonly nextIdempotency: ActionIdempotencyRecord;
  }): Promise<ActionGrantRepositoryCasResultV1> {
    assertGrantPair(input.nextGrant, input.nextIdempotency);
    if (input.nextGrant.grantId !== input.grantId)
      throw new Error("state_conflict");
    const result = await this.pool.query<{ grant: ActionGrant }>(
      `UPDATE ${this.prefix}collective_action_grants
          SET state_generation=$6, grant_digest=$7, status=$8,
              grant_record=$9::jsonb, idempotency=$10::jsonb,
              updated_at=transaction_timestamp()
        WHERE tenant_id=$1 AND gateway_id=$2 AND grant_id=$3
          AND state_generation=$4 AND grant_digest=$5
          AND scope_digest=$11 AND idempotency_key=$12
        RETURNING grant_record AS grant`,
      [
        this.tenantId,
        this.gatewayId,
        input.grantId,
        input.expectedStateGeneration,
        input.expectedGrantDigest,
        input.nextGrant.stateGeneration,
        grantDigest(input.nextGrant),
        input.nextGrant.status,
        JSON.stringify(input.nextGrant),
        JSON.stringify(input.nextIdempotency),
        input.nextGrant.scopeDigest,
        input.nextGrant.idempotencyKey,
      ],
    );
    if (result.rows[0])
      return Object.freeze({ status: "updated", grant: result.rows[0].grant });
    return Object.freeze({
      status: "conflict",
      grant: (await this.loadGrant(input.grantId)) ?? null,
    });
  }
}

export class PostgresCollectiveEvidenceSinkV1
  extends ScopedRepositoryV1
  implements CollectiveEvidenceSinkV1
{
  private readonly maximumRecords: number;

  constructor(
    pool: Pool,
    options: CollectiveControlPostgresScopeV1 & {
      readonly maximumRecords?: number;
    },
  ) {
    super(pool, options.tenantId, options.policyDomainId, options.schema);
    this.maximumRecords = options.maximumRecords ?? 262_144;
    if (!Number.isSafeInteger(this.maximumRecords) || this.maximumRecords < 1)
      throw new TypeError("maximumRecords must be a positive safe integer");
  }

  async append(
    recordInput: CollectiveDecisionRecordV1,
  ): Promise<CollectiveEvidenceAppendResultV1> {
    const record = validateCollectiveDecisionRecordV1(recordInput);
    if (
      record.tenantId !== this.tenantId ||
      record.policyDomainId !== this.policyDomainId
    )
      throw new Error("scope_mismatch");
    return this.transaction(async (client) => {
      await client.query(
        `INSERT INTO ${this.prefix}collective_evidence_anchors
          (tenant_id, policy_domain_id, record_count, latest_record_digest)
         VALUES ($1,$2,0,NULL) ON CONFLICT DO NOTHING`,
        [this.tenantId, this.policyDomainId],
      );
      const anchorResult = await client.query<{
        record_count: string;
        latest_record_digest: CollectiveDigestV1 | null;
      }>(
        `SELECT record_count::text, latest_record_digest
           FROM ${this.prefix}collective_evidence_anchors
          WHERE tenant_id=$1 AND policy_domain_id=$2 FOR UPDATE`,
        [this.tenantId, this.policyDomainId],
      );
      const count = boundedCount(anchorResult.rows[0]!.record_count);
      const latest = anchorResult.rows[0]!.latest_record_digest;
      const duplicate = await client.query<{
        record_digest: CollectiveDigestV1;
      }>(
        `SELECT record_digest FROM ${this.prefix}collective_evidence_records
          WHERE tenant_id=$1 AND policy_domain_id=$2 AND record_id=$3`,
        [this.tenantId, this.policyDomainId, record.recordId],
      );
      if (duplicate.rows[0])
        return appendResult(
          this.tenantId,
          this.policyDomainId,
          duplicate.rows[0].record_digest === record.recordDigest
            ? "duplicate"
            : "chain_conflict",
          count,
          latest,
        );
      if (count >= this.maximumRecords)
        return appendResult(
          this.tenantId,
          this.policyDomainId,
          "capacity_exceeded",
          count,
          latest,
        );
      if (record.previousRecordDigest !== latest)
        return appendResult(
          this.tenantId,
          this.policyDomainId,
          "chain_conflict",
          count,
          latest,
        );
      const sequence = count + 1;
      await client.query(
        `INSERT INTO ${this.prefix}collective_evidence_records
          (tenant_id, policy_domain_id, sequence, record_id,
           previous_record_digest, record_digest, record)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          this.tenantId,
          this.policyDomainId,
          sequence,
          record.recordId,
          record.previousRecordDigest,
          record.recordDigest,
          JSON.stringify(record),
        ],
      );
      await client.query(
        `UPDATE ${this.prefix}collective_evidence_anchors
            SET record_count=$3, latest_record_digest=$4
          WHERE tenant_id=$1 AND policy_domain_id=$2`,
        [this.tenantId, this.policyDomainId, sequence, record.recordDigest],
      );
      return appendResult(
        this.tenantId,
        this.policyDomainId,
        "appended",
        sequence,
        record.recordDigest,
      );
    });
  }

  async anchor(): Promise<CollectiveEvidenceAnchorV1> {
    const result = await this.pool.query<{
      record_count: string;
      latest_record_digest: CollectiveDigestV1 | null;
    }>(
      `SELECT record_count::text, latest_record_digest
         FROM ${this.prefix}collective_evidence_anchors
        WHERE tenant_id=$1 AND policy_domain_id=$2`,
      [this.tenantId, this.policyDomainId],
    );
    return Object.freeze({
      schemaVersion: 1,
      tenantId: this.tenantId,
      policyDomainId: this.policyDomainId,
      recordCount: result.rows[0]
        ? boundedCount(result.rows[0].record_count)
        : 0,
      latestRecordDigest: result.rows[0]?.latest_record_digest ?? null,
    });
  }
}

export interface CollectiveRollbackReadinessV1 {
  readonly activeWorkContracts: number;
  readonly activeActionPermits: number;
  readonly activeActionGrants: number;
  readonly indeterminateRecords: number;
  readonly repositoryIntegrityValid: boolean;
  readonly ready: boolean;
}

export interface CollectiveRepositoryIntegrityV1 {
  readonly valid: boolean;
  readonly authorityStateValid: boolean;
  readonly executionStateValid: boolean;
  readonly actionGrantsValid: boolean;
  readonly evidenceChainValid: boolean;
}

export interface CollectiveEvidenceVerificationV1 {
  readonly valid: boolean;
  readonly retainedRecordCount: number;
  readonly totalRecordCount: number;
  readonly retainedFromSequence: number;
  readonly latestRecordDigest: CollectiveDigestV1 | null;
}

export interface CollectiveEvidencePruneResultV1 {
  readonly deletedRecords: number;
  readonly retainedFromSequence: number;
  readonly retainedPredecessorDigest: CollectiveDigestV1 | null;
}

/** Verifies every retained link against the durable retention boundary. */
export async function verifyCollectiveEvidenceChainV1(
  pool: Pool,
  options: CollectiveControlPostgresScopeV1,
): Promise<CollectiveEvidenceVerificationV1> {
  const prefix = schemaPrefix(options.schema);
  const anchor = await pool.query<{
    record_count: string;
    latest_record_digest: CollectiveDigestV1 | null;
    retained_from_sequence: string;
    retained_predecessor_digest: CollectiveDigestV1 | null;
  }>(
    `SELECT record_count::text, latest_record_digest,
            retained_from_sequence::text, retained_predecessor_digest
       FROM ${prefix}collective_evidence_anchors
      WHERE tenant_id=$1 AND policy_domain_id=$2`,
    [options.tenantId, options.policyDomainId],
  );
  if (!anchor.rows[0])
    return Object.freeze({
      valid: true,
      retainedRecordCount: 0,
      totalRecordCount: 0,
      retainedFromSequence: 1,
      latestRecordDigest: null,
    });
  const totalRecordCount = boundedCount(anchor.rows[0].record_count);
  const retainedFromSequence = boundedCount(
    anchor.rows[0].retained_from_sequence,
  );
  const records = await pool.query<{
    sequence: string;
    previous_record_digest: CollectiveDigestV1 | null;
    record_digest: CollectiveDigestV1;
    record: unknown;
  }>(
    `SELECT sequence::text, previous_record_digest, record_digest, record
       FROM ${prefix}collective_evidence_records
      WHERE tenant_id=$1 AND policy_domain_id=$2 ORDER BY sequence`,
    [options.tenantId, options.policyDomainId],
  );
  let previous = anchor.rows[0].retained_predecessor_digest;
  let expectedSequence = retainedFromSequence;
  let valid = true;
  for (const row of records.rows) {
    let record: CollectiveDecisionRecordV1;
    try {
      record = validateCollectiveDecisionRecordV1(row.record);
    } catch {
      valid = false;
      break;
    }
    if (
      boundedCount(row.sequence) !== expectedSequence ||
      row.previous_record_digest !== previous ||
      record.previousRecordDigest !== previous ||
      record.recordDigest !== row.record_digest
    ) {
      valid = false;
      break;
    }
    previous = row.record_digest;
    expectedSequence += 1;
  }
  const expectedLatest =
    totalRecordCount === 0
      ? null
      : records.rows.length === 0
        ? anchor.rows[0].retained_predecessor_digest
        : previous;
  if (
    expectedLatest !== anchor.rows[0].latest_record_digest ||
    expectedSequence !== totalRecordCount + 1
  )
    valid = false;
  return Object.freeze({
    valid,
    retainedRecordCount: records.rows.length,
    totalRecordCount,
    retainedFromSequence,
    latestRecordDigest: anchor.rows[0].latest_record_digest,
  });
}

/**
 * Prunes only a verified prefix after every governed reservation has drained.
 * The predecessor digest remains durable so the retained suffix is verifiable.
 */
export async function pruneCollectiveEvidenceBeforeV1(
  pool: Pool,
  options: CollectiveControlPostgresScopeV1 & {
    readonly gatewayId: string;
    readonly retainFromSequence: number;
  },
): Promise<CollectiveEvidencePruneResultV1> {
  if (
    !Number.isSafeInteger(options.retainFromSequence) ||
    options.retainFromSequence < 1
  )
    throw new TypeError("retainFromSequence must be a positive safe integer");
  const readiness = await getCollectiveRollbackReadinessV1(pool, options);
  if (!readiness.ready) throw new Error("collective_retention_not_ready");
  const verified = await verifyCollectiveEvidenceChainV1(pool, options);
  if (!verified.valid) throw new Error("collective_evidence_chain_invalid");
  const prefix = schemaPrefix(options.schema);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const anchor = await client.query<{
      record_count: string;
      retained_from_sequence: string;
    }>(
      `SELECT record_count::text, retained_from_sequence::text
         FROM ${prefix}collective_evidence_anchors
        WHERE tenant_id=$1 AND policy_domain_id=$2 FOR UPDATE`,
      [options.tenantId, options.policyDomainId],
    );
    if (!anchor.rows[0]) {
      await client.query("COMMIT");
      return Object.freeze({
        deletedRecords: 0,
        retainedFromSequence: 1,
        retainedPredecessorDigest: null,
      });
    }
    const count = boundedCount(anchor.rows[0].record_count);
    const current = boundedCount(anchor.rows[0].retained_from_sequence);
    if (
      options.retainFromSequence < current ||
      options.retainFromSequence > count + 1
    )
      throw new Error("collective_retention_boundary_invalid");
    const boundary = await client.query<{
      previous_record_digest: CollectiveDigestV1 | null;
    }>(
      `SELECT previous_record_digest
         FROM ${prefix}collective_evidence_records
        WHERE tenant_id=$1 AND policy_domain_id=$2 AND sequence=$3`,
      [options.tenantId, options.policyDomainId, options.retainFromSequence],
    );
    const predecessor =
      options.retainFromSequence === count + 1
        ? (
            await client.query<{
              latest_record_digest: CollectiveDigestV1 | null;
            }>(
              `SELECT latest_record_digest FROM ${prefix}collective_evidence_anchors
            WHERE tenant_id=$1 AND policy_domain_id=$2`,
              [options.tenantId, options.policyDomainId],
            )
          ).rows[0]!.latest_record_digest
        : boundary.rows[0]?.previous_record_digest;
    if (predecessor === undefined)
      throw new Error("collective_retention_boundary_invalid");
    const deleted = await client.query(
      `DELETE FROM ${prefix}collective_evidence_records
        WHERE tenant_id=$1 AND policy_domain_id=$2 AND sequence < $3`,
      [options.tenantId, options.policyDomainId, options.retainFromSequence],
    );
    await client.query(
      `UPDATE ${prefix}collective_evidence_anchors
          SET retained_from_sequence=$3, retained_predecessor_digest=$4
        WHERE tenant_id=$1 AND policy_domain_id=$2`,
      [
        options.tenantId,
        options.policyDomainId,
        options.retainFromSequence,
        predecessor,
      ],
    );
    await client.query("COMMIT");
    return Object.freeze({
      deletedRecords: deleted.rowCount ?? 0,
      retainedFromSequence: options.retainFromSequence,
      retainedPredecessorDigest: predecessor,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getCollectiveRollbackReadinessV1(
  pool: Pool,
  options: CollectiveControlPostgresScopeV1 & { readonly gatewayId: string },
): Promise<CollectiveRollbackReadinessV1> {
  const prefix = schemaPrefix(options.schema);
  const result = await pool.query<{
    active_work: string;
    active_permits: string;
    active_grants: string;
    indeterminate: string;
  }>(
    `SELECT
      (SELECT count(*) FROM ${prefix}collective_work_contracts
        WHERE tenant_id=$1 AND policy_domain_id=$2
          AND status IN ('proposed','active','completing'))::text AS active_work,
      (SELECT count(*) FROM ${prefix}collective_action_permits
        WHERE tenant_id=$1 AND policy_domain_id=$2
          AND status IN ('issued','reserved','dispatching'))::text AS active_permits,
      (SELECT count(*) FROM ${prefix}collective_action_grants
        WHERE tenant_id=$1 AND gateway_id=$3
          AND status IN ('issued','reserved'))::text AS active_grants,
      ((SELECT count(*) FROM ${prefix}collective_action_permits
        WHERE tenant_id=$1 AND policy_domain_id=$2 AND status='indeterminate') +
       (SELECT count(*) FROM ${prefix}collective_action_grants
        WHERE tenant_id=$1 AND gateway_id=$3 AND status='indeterminate'))::text AS indeterminate`,
    [options.tenantId, options.policyDomainId, options.gatewayId],
  );
  const activeWorkContracts = boundedCount(result.rows[0]!.active_work);
  const activeActionPermits = boundedCount(result.rows[0]!.active_permits);
  const activeActionGrants = boundedCount(result.rows[0]!.active_grants);
  const indeterminateRecords = boundedCount(result.rows[0]!.indeterminate);
  const integrity = await verifyCollectiveRepositoryIntegrityV1(pool, options);
  return Object.freeze({
    activeWorkContracts,
    activeActionPermits,
    activeActionGrants,
    indeterminateRecords,
    repositoryIntegrityValid: integrity.valid,
    ready:
      activeWorkContracts +
        activeActionPermits +
        activeActionGrants +
        indeterminateRecords ===
        0 && integrity.valid,
  });
}

/** Detects state/mirror, grant-column and evidence-chain tampering. */
export async function verifyCollectiveRepositoryIntegrityV1(
  pool: Pool,
  options: CollectiveControlPostgresScopeV1 & { readonly gatewayId: string },
): Promise<CollectiveRepositoryIntegrityV1> {
  const prefix = schemaPrefix(options.schema);
  let authorityStateValid = false;
  let executionStateValid = false;
  let actionGrantsValid = false;
  try {
    const authorityResult = await pool.query<{ state: unknown }>(
      `SELECT state FROM ${prefix}collective_authority_states
        WHERE tenant_id=$1 AND policy_domain_id=$2`,
      [options.tenantId, options.policyDomainId],
    );
    if (!authorityResult.rows[0]) {
      authorityStateValid = true;
    } else {
      const authority = validateCollectiveAuthorityStateV1(
        authorityResult.rows[0].state,
      );
      const mandates = await pool.query<{
        mandate_id: string;
        revision: string;
        mandate_digest: string;
      }>(
        `SELECT mandate_id, revision::text, mandate_digest
           FROM ${prefix}collective_mandates
          WHERE tenant_id=$1 AND policy_domain_id=$2
          ORDER BY mandate_id, revision`,
        [options.tenantId, options.policyDomainId],
      );
      const revocations = await pool.query<{
        mandate_id: string;
        generation: string;
        revocation_digest: string;
      }>(
        `SELECT mandate_id, generation::text, revocation_digest
           FROM ${prefix}collective_revocations
          WHERE tenant_id=$1 AND policy_domain_id=$2
          ORDER BY mandate_id, generation`,
        [options.tenantId, options.policyDomainId],
      );
      authorityStateValid =
        JSON.stringify(mandates.rows) ===
          JSON.stringify(
            authority.mandates.map((record) => ({
              mandate_id: record.mandate.statement.mandateId,
              revision: String(record.mandate.statement.revision),
              mandate_digest: record.mandate.mandateDigest,
            })),
          ) &&
        JSON.stringify(revocations.rows) ===
          JSON.stringify(
            authority.revocations.map((record) => ({
              mandate_id: record.revocation.statement.mandateId,
              generation: String(record.revocation.statement.generation),
              revocation_digest: record.revocation.revocationDigest,
            })),
          );
    }
  } catch {
    authorityStateValid = false;
  }
  try {
    const executionResult = await pool.query<{ state: unknown }>(
      `SELECT state FROM ${prefix}collective_execution_states
        WHERE tenant_id=$1 AND policy_domain_id=$2`,
      [options.tenantId, options.policyDomainId],
    );
    if (!executionResult.rows[0]) {
      executionStateValid = true;
    } else {
      const execution = validateCollectiveExecutionStateV1(
        executionResult.rows[0].state,
      );
      const work = await pool.query<{
        work_contract_id: string;
        generation: string;
        status: string;
        work_contract_digest: string;
      }>(
        `SELECT work_contract_id, generation::text, status, work_contract_digest
           FROM ${prefix}collective_work_contracts
          WHERE tenant_id=$1 AND policy_domain_id=$2 ORDER BY work_contract_id`,
        [options.tenantId, options.policyDomainId],
      );
      const reservations = await pool.query<{
        reservation_id: string;
        generation: string;
        status: string;
        reservation_digest: string;
      }>(
        `SELECT reservation_id, generation::text, status, reservation_digest
           FROM ${prefix}collective_budget_reservations
          WHERE tenant_id=$1 AND policy_domain_id=$2 ORDER BY reservation_id`,
        [options.tenantId, options.policyDomainId],
      );
      const permits = await pool.query<{
        permit_id: string;
        generation: string;
        status: string;
        permit_digest: string;
      }>(
        `SELECT permit_id, generation::text, status, permit_digest
           FROM ${prefix}collective_action_permits
          WHERE tenant_id=$1 AND policy_domain_id=$2 ORDER BY permit_id`,
        [options.tenantId, options.policyDomainId],
      );
      executionStateValid =
        JSON.stringify(work.rows) ===
          JSON.stringify(
            execution.workContracts.map((record) => ({
              work_contract_id: record.workContractId,
              generation: String(record.generation),
              status: record.status,
              work_contract_digest: record.workContractDigest,
            })),
          ) &&
        JSON.stringify(reservations.rows) ===
          JSON.stringify(
            execution.budgetReservations.map((record) => ({
              reservation_id: record.reservationId,
              generation: String(record.generation),
              status: record.status,
              reservation_digest: record.reservationDigest,
            })),
          ) &&
        JSON.stringify(permits.rows) ===
          JSON.stringify(
            execution.actionPermits.map((record) => ({
              permit_id: record.permitId,
              generation: String(record.generation),
              status: record.status,
              permit_digest: record.permitDigest,
            })),
          );
    }
  } catch {
    executionStateValid = false;
  }
  try {
    const grants = await pool.query<{
      grant_record: ActionGrant;
      grant_digest: string;
      scope_digest: string;
      idempotency_key: string;
      action_digest: string;
      state_generation: string;
      status: string;
    }>(
      `SELECT grant_record, grant_digest, scope_digest, idempotency_key,
              action_digest, state_generation::text, status
           FROM ${prefix}collective_action_grants
          WHERE tenant_id=$1 AND gateway_id=$2`,
      [options.tenantId, options.gatewayId],
    );
    actionGrantsValid = grants.rows.every((row) => {
      const grant = row.grant_record;
      return (
        grant?.schemaVersion === 1 &&
        grant.scope.tenantId === options.tenantId &&
        grantDigest(grant) === row.grant_digest &&
        grant.scopeDigest === row.scope_digest &&
        grant.idempotencyKey === row.idempotency_key &&
        grant.actionDigest === row.action_digest &&
        String(grant.stateGeneration) === row.state_generation &&
        grant.status === row.status
      );
    });
  } catch {
    actionGrantsValid = false;
  }
  const evidenceChainValid = (
    await verifyCollectiveEvidenceChainV1(pool, options)
  ).valid;
  return Object.freeze({
    valid:
      authorityStateValid &&
      executionStateValid &&
      actionGrantsValid &&
      evidenceChainValid,
    authorityStateValid,
    executionStateValid,
    actionGrantsValid,
    evidenceChainValid,
  });
}

async function mirrorAuthority(
  client: PoolClient,
  prefix: string,
  state: CollectiveAuthorityStateV1,
) {
  await client.query(
    `DELETE FROM ${prefix}collective_mandates WHERE tenant_id=$1 AND policy_domain_id=$2`,
    [state.tenantId, state.policyDomainId],
  );
  await client.query(
    `DELETE FROM ${prefix}collective_revocations WHERE tenant_id=$1 AND policy_domain_id=$2`,
    [state.tenantId, state.policyDomainId],
  );
  for (const record of state.mandates)
    await client.query(
      `INSERT INTO ${prefix}collective_mandates
      (tenant_id,policy_domain_id,mandate_id,revision,mandate_digest,record)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        state.tenantId,
        state.policyDomainId,
        record.mandate.statement.mandateId,
        record.mandate.statement.revision,
        record.mandate.mandateDigest,
        JSON.stringify(record),
      ],
    );
  for (const record of state.revocations)
    await client.query(
      `INSERT INTO ${prefix}collective_revocations
      (tenant_id,policy_domain_id,mandate_id,generation,revocation_digest,record)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        state.tenantId,
        state.policyDomainId,
        record.revocation.statement.mandateId,
        record.revocation.statement.generation,
        record.revocation.revocationDigest,
        JSON.stringify(record),
      ],
    );
}

async function mirrorExecution(
  client: PoolClient,
  prefix: string,
  state: CollectiveExecutionStateV1,
) {
  await client.query(
    `DELETE FROM ${prefix}collective_work_contracts WHERE tenant_id=$1 AND policy_domain_id=$2`,
    [state.tenantId, state.policyDomainId],
  );
  await client.query(
    `DELETE FROM ${prefix}collective_budget_reservations WHERE tenant_id=$1 AND policy_domain_id=$2`,
    [state.tenantId, state.policyDomainId],
  );
  await client.query(
    `DELETE FROM ${prefix}collective_action_permits WHERE tenant_id=$1 AND policy_domain_id=$2`,
    [state.tenantId, state.policyDomainId],
  );
  for (const record of state.workContracts)
    await client.query(
      `INSERT INTO ${prefix}collective_work_contracts
      (tenant_id,policy_domain_id,work_contract_id,generation,status,work_contract_digest,record)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        state.tenantId,
        state.policyDomainId,
        record.workContractId,
        record.generation,
        record.status,
        record.workContractDigest,
        JSON.stringify(record),
      ],
    );
  for (const record of state.budgetReservations)
    await client.query(
      `INSERT INTO ${prefix}collective_budget_reservations
      (tenant_id,policy_domain_id,reservation_id,generation,status,reservation_digest,record)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        state.tenantId,
        state.policyDomainId,
        record.reservationId,
        record.generation,
        record.status,
        record.reservationDigest,
        JSON.stringify(record),
      ],
    );
  for (const record of state.actionPermits)
    await client.query(
      `INSERT INTO ${prefix}collective_action_permits
      (tenant_id,policy_domain_id,permit_id,generation,status,permit_digest,record)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        state.tenantId,
        state.policyDomainId,
        record.permitId,
        record.generation,
        record.status,
        record.permitDigest,
        JSON.stringify(record),
      ],
    );
}

function assertGrantPair(grant: ActionGrant, record: ActionIdempotencyRecord) {
  if (
    !grant ||
    !record ||
    grant.schemaVersion !== 1 ||
    record.schemaVersion !== 1 ||
    grant.grantId !== record.grantId ||
    grant.scopeDigest !== record.scopeDigest ||
    grant.idempotencyKey !== record.idempotencyKey ||
    grant.actionDigest !== record.actionDigest ||
    record.retainedOutcome !== grant.status
  )
    throw new TypeError("Action Grant repository pair is invalid");
}

function grantDigest(grant: ActionGrant): string {
  return controlDigest("grant", grant as unknown as ControlJson);
}

function boundedCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new RangeError("PostgreSQL row count exceeds safe bounds");
  return count;
}

function schemaPrefix(schema?: string): string {
  return `${quotePostgresIdentifier(normalizePostgresIdentifier(schema ?? defaultPostgresSchema, "schema"))}.`;
}

function appendResult(
  tenantId: string,
  policyDomainId: string,
  code: CollectiveEvidenceAppendResultV1["code"],
  recordCount: number,
  latestRecordDigest: CollectiveDigestV1 | null,
): CollectiveEvidenceAppendResultV1 {
  return Object.freeze({
    accepted: code === "appended" || code === "duplicate",
    durable: code === "appended" || code === "duplicate",
    code,
    anchor: Object.freeze({
      schemaVersion: 1,
      tenantId,
      policyDomainId,
      recordCount,
      latestRecordDigest,
    }),
  });
}
