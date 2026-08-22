import type { AgentRoomPlan, AgentRoomPlanStore } from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

/** PostgreSQL compare-and-set Agent Room plan store. */
export class PostgresAgentRoomPlanStore implements AgentRoomPlanStore {
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
    this.table = `${schema}.room_plans`;
  }
  async load(tenantId: string, roomId: string, planId: string) {
    const result = await this.pool.query<{ state: AgentRoomPlan }>(
      `SELECT state FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2 AND plan_id=$3`,
      [tenantId, roomId, planId],
    );
    return result.rows[0]?.state
      ? structuredClone(result.rows[0].state)
      : undefined;
  }
  async list(tenantId: string, roomId: string) {
    const result = await this.pool.query<{ state: AgentRoomPlan }>(
      `SELECT state FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2 ORDER BY plan_version,plan_id`,
      [tenantId, roomId],
    );
    return result.rows.map((row) => structuredClone(row.state));
  }
  async compareAndSet(input: {
    expectedRevision: number | null;
    state: AgentRoomPlan;
  }) {
    const state = input.state;
    if (input.expectedRevision === null) {
      if (state.revision !== 0) return false;
      const result = await this.pool.query(
        `INSERT INTO ${this.table}
          (tenant_id,room_id,plan_id,plan_version,predecessor_plan_id,revision,status,state,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
         ON CONFLICT (tenant_id,room_id,plan_id) DO NOTHING`,
        [
          state.tenantId,
          state.roomId,
          state.planId,
          state.planVersion,
          state.predecessorPlanId ?? null,
          state.revision,
          state.status,
          JSON.stringify(state),
          state.createdAt,
          state.updatedAt,
        ],
      );
      return result.rowCount === 1;
    }
    if (state.revision !== input.expectedRevision + 1) return false;
    const result = await this.pool.query(
      `UPDATE ${this.table} SET revision=$4,status=$5,state=$6::jsonb,updated_at=$7
       WHERE tenant_id=$1 AND room_id=$2 AND plan_id=$3 AND revision=$8`,
      [
        state.tenantId,
        state.roomId,
        state.planId,
        state.revision,
        state.status,
        JSON.stringify(state),
        state.updatedAt,
        input.expectedRevision,
      ],
    );
    return result.rowCount === 1;
  }
}
