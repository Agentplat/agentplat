import type { Pool } from "pg";
import {
  qualifyPostgresName,
  runPostgresMigrations,
  getPostgresMigrationStatus,
  type PostgresMigration,
} from "@agentplat/postgres";
import type { RoomConversation, RoomConversationStore } from "@agentplat/rooms";

export const roomConversationMigrations: readonly PostgresMigration[] = [
  {
    version: 1,
    name: "actor_private_room_conversations_v1",
    up: `CREATE TABLE __AGENTPLAT_SCHEMA__.room_actor_conversations (
    tenant_id text NOT NULL, room_id text NOT NULL, conversation_id text NOT NULL,
    actor_id text NOT NULL CHECK (length(actor_id) > 0), revision integer NOT NULL CHECK (revision >= 0),
    document jsonb NOT NULL,
    PRIMARY KEY (tenant_id, room_id, conversation_id),
    CHECK ((document->>'schemaVersion')::integer = 1),
    CHECK (document->>'tenantId' = tenant_id), CHECK (document->>'roomId' = room_id),
    CHECK (document->>'id' = conversation_id), CHECK (document->>'actorId' = actor_id),
    CHECK ((document->>'revision')::integer = revision)
  ); CREATE INDEX room_actor_conversations_audience ON __AGENTPLAT_SCHEMA__.room_actor_conversations (tenant_id, room_id, actor_id);`,
    down: "DROP TABLE __AGENTPLAT_SCHEMA__.room_actor_conversations;",
    destructiveDown: true,
  },
];
export function runRoomConversationMigrations(
  pool: Pool,
  options: { schema?: string; createSchema?: boolean } = {},
) {
  return runPostgresMigrations(pool, {
    ...options,
    applicationId: "@agentplat/rooms-postgres/actor-conversations",
    migrations: roomConversationMigrations,
  });
}
export function getRoomConversationMigrationStatus(
  pool: Pool,
  options: { schema?: string } = {},
) {
  return getPostgresMigrationStatus(pool, {
    ...options,
    applicationId: "@agentplat/rooms-postgres/actor-conversations",
    migrations: roomConversationMigrations,
  });
}
/** Trusted persistence adapter; use ActorRoomConversations at the application boundary. */
export class PostgresRoomConversationStore implements RoomConversationStore {
  private readonly table: string;
  constructor(
    private readonly pool: Pool,
    schema = "public",
  ) {
    this.table = qualifyPostgresName(schema, "room_actor_conversations");
  }
  async load(
    tenantId: string,
    roomId: string,
    id: string,
  ): Promise<RoomConversation | undefined> {
    const r = await this.pool.query(
      `SELECT document FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2 AND conversation_id=$3`,
      [tenantId, roomId, id],
    );
    return r.rows[0]?.document;
  }
  async list(
    tenantId: string,
    roomId: string,
    actorId: string,
  ): Promise<RoomConversation[]> {
    const r = await this.pool.query(
      `SELECT document FROM ${this.table} WHERE tenant_id=$1 AND room_id=$2 AND actor_id=$3 ORDER BY conversation_id`,
      [tenantId, roomId, actorId],
    );
    return r.rows.map((row) => row.document);
  }
  async compareAndSet(
    d: RoomConversation,
    expected: number | null,
  ): Promise<boolean> {
    if (
      d.schemaVersion !== 1 ||
      !d.actorId ||
      d.revision !== (expected === null ? 0 : expected + 1)
    )
      return false;
    const params = [d.tenantId, d.roomId, d.id, d.actorId, d.revision, d];
    const r =
      expected === null
        ? await this.pool.query(
            `INSERT INTO ${this.table} (tenant_id,room_id,conversation_id,actor_id,revision,document) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
            params,
          )
        : await this.pool.query(
            `UPDATE ${this.table} SET revision=$5, document=$6 WHERE tenant_id=$1 AND room_id=$2 AND conversation_id=$3 AND actor_id=$4 AND revision=$7`,
            [...params, expected],
          );
    return r.rowCount === 1;
  }
}
