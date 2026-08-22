import type { RoomHandoff, RoomHandoffStore } from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

/** Schema selection for PostgreSQL Handoff persistence. */
export interface PostgresRoomHandoffStoreOptions {
  schema?: string;
}

/** PostgreSQL compare-and-set AgentPlat Handoff store. */
export class PostgresRoomHandoffStore implements RoomHandoffStore {
  private readonly table: string;

  constructor(
    private readonly pool: Pool,
    options: PostgresRoomHandoffStoreOptions = {},
  ) {
    const schema = normalizePostgresIdentifier(
      options.schema ?? defaultPostgresSchema,
      "schema",
    );
    this.table = `${quotePostgresIdentifier(schema)}.room_handoffs`;
  }

  async load(tenantId: string, roomId: string, handoffId: string) {
    const result = await this.pool.query<{ state: RoomHandoff }>(
      `SELECT state FROM ${this.table}
       WHERE tenant_id = $1 AND room_id = $2 AND handoff_id = $3`,
      [tenantId, roomId, handoffId],
    );
    return result.rows[0]?.state
      ? structuredClone(result.rows[0].state)
      : undefined;
  }
  async list(tenantId: string, roomId: string) {
    const result = await this.pool.query<{ state: RoomHandoff }>(
      `SELECT state FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2 ORDER BY created_at,handoff_id`,
      [tenantId, roomId],
    );
    return result.rows.map((row) => structuredClone(row.state));
  }

  async compareAndSet(input: {
    expectedRevision: number | null;
    state: RoomHandoff;
  }): Promise<boolean> {
    const state = input.state;
    if (input.expectedRevision === null) {
      if (state.revision !== 0) return false;
      const result = await this.pool.query(
        `INSERT INTO ${this.table}
           (tenant_id, room_id, handoff_id, predecessor_handoff_id, source_run_id,
            target_run_id, revision, status, state, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
         ON CONFLICT (tenant_id, room_id, handoff_id) DO NOTHING`,
        [
          state.tenantId,
          state.roomId,
          state.handoffId,
          state.predecessorHandoffId ?? null,
          state.sourceRunId,
          state.targetRunId ?? null,
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
      `UPDATE ${this.table}
       SET target_run_id = $4, revision = $5, status = $6,
           state = $7::jsonb, updated_at = $8
       WHERE tenant_id = $1 AND room_id = $2 AND handoff_id = $3
         AND revision = $9`,
      [
        state.tenantId,
        state.roomId,
        state.handoffId,
        state.targetRunId ?? null,
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
