import type { AgentRoomProjectionCheckpointStore } from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

/** PostgreSQL compare-and-set projector high-water store. */
export class PostgresAgentRoomProjectionCheckpointStore implements AgentRoomProjectionCheckpointStore {
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
    this.table = `${schema}.agent_room_projection_checkpoints`;
  }
  async load(projectionId: string) {
    const result = await this.pool.query<{ sequence: string | number }>(
      `SELECT sequence FROM ${this.table} WHERE projection_id=$1`,
      [projectionId],
    );
    return result.rows[0] ? Number(result.rows[0].sequence) : 0;
  }
  async compareAndSet(input: {
    projectionId: string;
    expectedSequence: number;
    nextSequence: number;
  }) {
    if (input.expectedSequence === 0) {
      const result = await this.pool.query(
        `INSERT INTO ${this.table} (projection_id,sequence) VALUES ($1,$2) ON CONFLICT (projection_id) DO UPDATE SET sequence=EXCLUDED.sequence,updated_at=now() WHERE ${this.table}.sequence=$3`,
        [input.projectionId, input.nextSequence, input.expectedSequence],
      );
      return result.rowCount === 1;
    }
    const result = await this.pool.query(
      `UPDATE ${this.table} SET sequence=$2,updated_at=now() WHERE projection_id=$1 AND sequence=$3`,
      [input.projectionId, input.nextSequence, input.expectedSequence],
    );
    return result.rowCount === 1;
  }
}
