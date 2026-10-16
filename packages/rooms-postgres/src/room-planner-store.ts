import type {
  RoomPlannerScope,
  RoomPlannerState,
  RoomPlannerStore,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

/** One CAS commits goals, decisions, inbox, budget reservations and notification outbox together. */
export class PostgresRoomPlannerStore implements RoomPlannerStore {
  private readonly table: string;
  private readonly historyTable: string;
  constructor(
    private readonly pool: Pool,
    options: { schema?: string } = {},
  ) {
    const schema = quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    );
    this.table = `${schema}.room_planner_states`;
    this.historyTable = `${schema}.room_planner_history`;
  }
  async load(scope: RoomPlannerScope): Promise<RoomPlannerState | undefined> {
    const result = await this.pool.query<{ state: RoomPlannerState }>(
      `SELECT state FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2`,
      [scope.tenantId, scope.roomId],
    );
    return result.rows[0]?.state;
  }
  async list(): Promise<RoomPlannerScope[]> {
    const result = await this.pool.query<{
      tenant_id: string;
      room_id: string;
    }>(
      `SELECT tenant_id,room_id FROM ${this.table} ORDER BY tenant_id,room_id`,
    );
    return result.rows.map((row) => ({
      tenantId: row.tenant_id,
      roomId: row.room_id,
    }));
  }
  async compareAndSet(expected: number | null, state: RoomPlannerState) {
    if (state.revision !== (expected === null ? 0 : expected + 1)) return false;
    const values = [
      state.tenantId,
      state.roomId,
      state.revision,
      JSON.stringify(state),
      expected,
    ];
    const query =
      expected === null
        ? `INSERT INTO ${this.table}(tenant_id,room_id,revision,state) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING RETURNING *`
        : `UPDATE ${this.table} SET revision=$3,state=$4::jsonb WHERE tenant_id=$1 AND room_id=$2 AND revision=$5 RETURNING *`;
    const result = await this.pool.query(
      `WITH changed AS (${query}) INSERT INTO ${this.historyTable}(tenant_id,room_id,revision,state) SELECT tenant_id,room_id,revision,state FROM changed RETURNING revision`,
      expected === null ? values.slice(0, 4) : values,
    );
    return result.rowCount === 1;
  }
}

/** Idempotent workflow result receipts; the caller must check current execution fencing before put. */
export class PostgresRoomPlannerCallResults {
  private readonly table: string;
  constructor(
    private readonly pool: Pool,
    options: { schema?: string } = {},
  ) {
    const schema = quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    );
    this.table = `${schema}.room_planner_call_results`;
  }
  async put(
    scope: RoomPlannerScope,
    id: string,
    result: import("@agentplat/core").JsonObject,
  ) {
    const saved = await this.pool.query(
      `INSERT INTO ${this.table}(tenant_id,room_id,operation_id,result) VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT(tenant_id,room_id,operation_id) DO UPDATE SET result=${this.table}.result
      WHERE ${this.table}.result=EXCLUDED.result RETURNING operation_id`,
      [scope.tenantId, scope.roomId, id, JSON.stringify(result)],
    );
    if (saved.rowCount !== 1)
      throw new Error("Workflow result identity conflict");
  }
  async get(
    scope: RoomPlannerScope,
    id: string,
  ): Promise<import("@agentplat/core").JsonObject | undefined> {
    return (
      await this.pool.query(
        `SELECT result FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2 AND operation_id=$3`,
        [scope.tenantId, scope.roomId, id],
      )
    ).rows[0]?.result;
  }
}
