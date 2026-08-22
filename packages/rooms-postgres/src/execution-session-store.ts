import type {
  RoomExecutionSession,
  RoomExecutionSessionStore,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

/** Schema selection for PostgreSQL execution session persistence. */
export interface PostgresRoomExecutionSessionStoreOptions {
  schema?: string;
}

/** PostgreSQL compare-and-set execution session store. */
export class PostgresRoomExecutionSessionStore implements RoomExecutionSessionStore {
  private readonly table: string;

  constructor(
    private readonly pool: Pool,
    options: PostgresRoomExecutionSessionStoreOptions = {},
  ) {
    const schema = normalizePostgresIdentifier(
      options.schema ?? defaultPostgresSchema,
      "schema",
    );
    this.table = `${quotePostgresIdentifier(schema)}.room_execution_sessions`;
  }

  async load(
    tenantId: string,
    roomId: string,
    sessionId: string,
  ): Promise<RoomExecutionSession | undefined> {
    const result = await this.pool.query<{ state: RoomExecutionSession }>(
      `SELECT state FROM ${this.table}
       WHERE tenant_id = $1 AND room_id = $2 AND session_id = $3`,
      [tenantId, roomId, sessionId],
    );
    const state = result.rows[0]?.state;
    return state ? structuredClone(state) : undefined;
  }
  async list(tenantId: string, roomId: string) {
    const result = await this.pool.query<{ state: RoomExecutionSession }>(
      `SELECT state FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2 ORDER BY created_at,session_id`,
      [tenantId, roomId],
    );
    return result.rows.map((row) => structuredClone(row.state));
  }

  async compareAndSet(input: {
    expectedRevision: number | null;
    state: RoomExecutionSession;
  }): Promise<boolean> {
    const state = structuredClone(input.state);
    if (input.expectedRevision === null) {
      if (state.revision !== 0) return false;
      const inserted = await this.pool.query(
        `INSERT INTO ${this.table}
           (tenant_id, room_id, session_id, run_id, revision, state, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (tenant_id, room_id, session_id) DO NOTHING`,
        [
          state.tenantId,
          state.roomId,
          state.sessionId,
          state.runId,
          state.revision,
          JSON.stringify(state),
          state.createdAt,
          state.updatedAt,
        ],
      );
      return inserted.rowCount === 1;
    }
    if (state.revision !== input.expectedRevision + 1) return false;
    const updated = await this.pool.query(
      `UPDATE ${this.table}
       SET run_id = $4, revision = $5, state = $6::jsonb, updated_at = $7
       WHERE tenant_id = $1 AND room_id = $2 AND session_id = $3
         AND revision = $8`,
      [
        state.tenantId,
        state.roomId,
        state.sessionId,
        state.runId,
        state.revision,
        JSON.stringify(state),
        state.updatedAt,
        input.expectedRevision,
      ],
    );
    return updated.rowCount === 1;
  }
}
