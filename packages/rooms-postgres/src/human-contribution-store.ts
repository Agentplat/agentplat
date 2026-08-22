import type {
  HumanContributionDelivery,
  HumanContributionDeliveryStore,
  HumanContributionRequest,
  HumanContributionStore,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

class JsonCasStore<
  T extends {
    tenantId: string;
    roomId: string;
    revision: number;
    status: string;
    createdAt: string;
    updatedAt: string;
  },
> {
  constructor(
    private readonly pool: Pool,
    private readonly table: string,
    private readonly idColumn: string,
  ) {}
  async load(
    tenantId: string,
    roomId: string,
    id: string,
  ): Promise<T | undefined> {
    const result = await this.pool.query<{ state: T }>(
      `SELECT state FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2 AND ${this.idColumn}=$3`,
      [tenantId, roomId, id],
    );
    return result.rows[0]?.state
      ? structuredClone(result.rows[0].state)
      : undefined;
  }
  async compareAndSet(id: string, expectedRevision: number | null, state: T) {
    if (expectedRevision === null) {
      if (state.revision !== 0) return false;
      const result = await this.pool.query(
        `INSERT INTO ${this.table} (tenant_id,room_id,${this.idColumn},revision,status,state,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
         ON CONFLICT (tenant_id,room_id,${this.idColumn}) DO NOTHING`,
        [
          state.tenantId,
          state.roomId,
          id,
          state.revision,
          state.status,
          JSON.stringify(state),
          state.createdAt,
          state.updatedAt,
        ],
      );
      return result.rowCount === 1;
    }
    if (state.revision !== expectedRevision + 1) return false;
    const result = await this.pool.query(
      `UPDATE ${this.table} SET revision=$4,status=$5,state=$6::jsonb,updated_at=$7
       WHERE tenant_id=$1 AND room_id=$2 AND ${this.idColumn}=$3 AND revision=$8`,
      [
        state.tenantId,
        state.roomId,
        id,
        state.revision,
        state.status,
        JSON.stringify(state),
        state.updatedAt,
        expectedRevision,
      ],
    );
    return result.rowCount === 1;
  }
  async list(tenantId: string, roomId?: string): Promise<T[]> {
    const result = await this.pool.query<{ state: T }>(
      `SELECT state FROM ${this.table}
       WHERE tenant_id=$1 AND ($2::text IS NULL OR room_id=$2)
       ORDER BY created_at`,
      [tenantId, roomId ?? null],
    );
    return result.rows.map((row) => structuredClone(row.state));
  }
}

function tables(pool: Pool, schemaInput?: string) {
  const schema = quotePostgresIdentifier(
    normalizePostgresIdentifier(schemaInput ?? defaultPostgresSchema, "schema"),
  );
  return {
    contributions: new JsonCasStore<HumanContributionRequest>(
      pool,
      `${schema}.human_contributions`,
      "contribution_id",
    ),
    deliveries: new JsonCasStore<HumanContributionDelivery>(
      pool,
      `${schema}.human_contribution_deliveries`,
      "delivery_id",
    ),
  };
}

/** PostgreSQL compare-and-set human contribution store. */
export class PostgresHumanContributionStore implements HumanContributionStore {
  private readonly delegate;
  constructor(pool: Pool, options: { schema?: string } = {}) {
    this.delegate = tables(pool, options.schema).contributions;
  }
  load(tenantId: string, roomId: string, contributionId: string) {
    return this.delegate.load(tenantId, roomId, contributionId);
  }
  compareAndSet(input: {
    expectedRevision: number | null;
    state: HumanContributionRequest;
  }) {
    return this.delegate.compareAndSet(
      input.state.contributionId,
      input.expectedRevision,
      input.state,
    );
  }
  list(tenantId: string, roomId: string) {
    return this.delegate.list(tenantId, roomId);
  }
}

/** PostgreSQL compare-and-set work-management delivery store. */
export class PostgresHumanContributionDeliveryStore implements HumanContributionDeliveryStore {
  private readonly delegate;
  constructor(pool: Pool, options: { schema?: string } = {}) {
    this.delegate = tables(pool, options.schema).deliveries;
  }
  load(tenantId: string, roomId: string, deliveryId: string) {
    return this.delegate.load(tenantId, roomId, deliveryId);
  }
  compareAndSet(input: {
    expectedRevision: number | null;
    state: HumanContributionDelivery;
  }) {
    return this.delegate.compareAndSet(
      input.state.deliveryId,
      input.expectedRevision,
      input.state,
    );
  }
  list(tenantId: string, roomId?: string) {
    return this.delegate.list(tenantId, roomId);
  }
}
