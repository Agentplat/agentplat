import type {
  AgentRoomOperationalEvent,
  AgentRoomOperationalEventReader,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

/** PostgreSQL reader for the transactional Room operational stream. */
export class PostgresAgentRoomOperationalEventStore implements AgentRoomOperationalEventReader {
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
    this.table = `${schema}.agent_room_operational_events`;
  }
  async listAfter(input: {
    tenantId: string;
    roomId: string;
    afterSequence: number;
    limit: number;
  }): Promise<AgentRoomOperationalEvent[]> {
    const result = await this.pool.query<{
      sequence: string | number;
      tenant_id: string;
      room_id: string;
      source: string;
      source_id: string;
      source_revision: string | number | null;
      event_type: string;
      payload: Record<string, unknown>;
      occurred_at: Date | string;
    }>(
      `SELECT * FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2 AND sequence>$3 ORDER BY sequence LIMIT $4`,
      [input.tenantId, input.roomId, input.afterSequence, input.limit],
    );
    return result.rows.map((row) => ({
      sequence: Number(row.sequence),
      tenantId: row.tenant_id,
      roomId: row.room_id,
      source: row.source,
      sourceId: row.source_id,
      sourceRevision:
        row.source_revision === null ? undefined : Number(row.source_revision),
      eventType: row.event_type,
      payload: row.payload as never,
      occurredAt:
        row.occurred_at instanceof Date
          ? row.occurred_at.toISOString()
          : String(row.occurred_at),
    }));
  }
  async listScopes(limit = 1_000) {
    const result = await this.pool.query<{
      tenant_id: string;
      room_id: string;
    }>(
      `SELECT tenant_id,room_id FROM ${this.table}
       GROUP BY tenant_id,room_id ORDER BY tenant_id,room_id LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      tenantId: row.tenant_id,
      roomId: row.room_id,
    }));
  }
}
