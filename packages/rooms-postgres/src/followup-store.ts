import { readFile } from "node:fs/promises";
import {
  followupRevisionFollowsV1,
  situationFollowsV1,
  memoryProposalFollowsV1,
  validateRoomSituationV1,
  validateMemoryProposalV1,
  type FollowupRevisionV1,
  type FollowupRevisionStoreV1,
  type RoomSituationV1,
  type RoomSituationStoreV1,
  type RoomSituationChangeV1,
  type MemoryProposalV1,
  type MemoryProposalStoreV1,
  type MemorySubjectV1,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
  runPostgresMigrations,
  getPostgresMigrationStatus,
  rollbackPostgresMigration,
  postgresRollbackConfirmation,
} from "@agentplat/postgres";
import type { Pool } from "pg";

class PostgresFollowupRevisionStoreV1<
  Record extends FollowupRevisionV1,
> implements FollowupRevisionStoreV1<Record> {
  protected readonly schema: string;
  constructor(
    protected readonly pool: Pool,
    protected readonly kind: "situation" | "memory_proposal",
    private readonly validate: (record: Record) => void,
    options: { schema?: string } = {},
  ) {
    this.schema = quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    );
  }
  async head(tenantId: string, id: string): Promise<Record | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.followup_heads WHERE tenant_id=$1 AND kind=$2 AND id=$3`,
        [tenantId, this.kind, id],
      )
    ).rows[0]?.record;
  }
  async operation(
    tenantId: string,
    id: string,
    operationId: string,
  ): Promise<Record | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.followup_revisions WHERE tenant_id=$1 AND kind=$2 AND id=$3 AND operation_id=$4`,
        [tenantId, this.kind, id, operationId],
      )
    ).rows[0]?.record;
  }
  async history(
    tenantId: string,
    id: string,
    after: number,
    limit: number,
  ): Promise<Record[]> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.followup_revisions WHERE tenant_id=$1 AND kind=$2 AND id=$3 AND revision>$4 ORDER BY revision LIMIT $5`,
        [tenantId, this.kind, id, after, limit],
      )
    ).rows.map((row) => row.record);
  }
  async commit(input: Record, expected: number | null) {
    const record = structuredClone(input);
    this.validate(record);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Sequences become visible in commit order for this tenant/domain feed.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [JSON.stringify([record.tenantId, this.kind, "followup-journal"])],
      );
      const old = (
        await client.query(
          `SELECT record FROM ${this.schema}.followup_heads WHERE tenant_id=$1 AND kind=$2 AND id=$3 FOR UPDATE`,
          [record.tenantId, this.kind, record.id],
        )
      ).rows[0]?.record;
      if (!followupRevisionFollowsV1(record, old, expected)) {
        await client.query("ROLLBACK");
        return false;
      }
      if (
        this.kind === "situation"
          ? !situationFollowsV1(record as unknown as RoomSituationV1, old)
          : !memoryProposalFollowsV1(record as unknown as MemoryProposalV1, old)
      ) {
        await client.query("ROLLBACK");
        return false;
      }
      const operation = (
        await client.query(
          `SELECT 1 FROM ${this.schema}.followup_revisions WHERE tenant_id=$1 AND kind=$2 AND id=$3 AND operation_id=$4`,
          [record.tenantId, this.kind, record.id, record.operationId],
        )
      ).rows[0];
      if (operation) {
        await client.query("ROLLBACK");
        return false;
      }
      const row = record as unknown as {
        primaryRoomId?: string;
        subject?: MemorySubjectV1;
      };
      const values = [
        record.tenantId,
        this.kind,
        record.id,
        record.revision,
        JSON.stringify(record),
        row.primaryRoomId ?? null,
        row.subject?.type ?? null,
        row.subject?.id ?? null,
      ];
      await client.query(
        `INSERT INTO ${this.schema}.followup_heads(tenant_id,kind,id,revision,record,primary_room_id,subject_type,subject_id) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) ON CONFLICT(tenant_id,kind,id) DO UPDATE SET revision=EXCLUDED.revision,record=EXCLUDED.record,primary_room_id=EXCLUDED.primary_room_id,subject_type=EXCLUDED.subject_type,subject_id=EXCLUDED.subject_id`,
        values,
      );
      await client.query(
        `INSERT INTO ${this.schema}.followup_revisions(tenant_id,kind,id,revision,operation_id,request_digest,record,primary_room_id,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [
          record.tenantId,
          this.kind,
          record.id,
          record.revision,
          record.operationId,
          record.requestDigest,
          JSON.stringify(record),
          row.primaryRoomId ?? null,
          record.recordedAt,
        ],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    } finally {
      client.release();
    }
  }
}
export class PostgresRoomSituationStoreV1
  extends PostgresFollowupRevisionStoreV1<RoomSituationV1>
  implements RoomSituationStoreV1
{
  constructor(pool: Pool, options: { schema?: string } = {}) {
    super(pool, "situation", validateRoomSituationV1, options);
  }
  async list(
    tenantId: string,
    roomIds: string[],
    afterId: string | undefined,
    limit: number,
  ): Promise<RoomSituationV1[]> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.followup_heads WHERE tenant_id=$1 AND kind='situation' AND primary_room_id=ANY($2::text[]) AND ($3::text IS NULL OR id COLLATE "C">$3 COLLATE "C") ORDER BY id COLLATE "C" LIMIT $4`,
        [tenantId, roomIds, afterId ?? null, limit],
      )
    ).rows.map((row) => row.record);
  }
  async changes(
    tenantId: string,
    roomIds: string[],
    after: number,
    limit: number,
  ): Promise<RoomSituationChangeV1[]> {
    return (
      await this.pool.query(
        `SELECT sequence,record FROM ${this.schema}.followup_revisions WHERE tenant_id=$1 AND kind='situation' AND primary_room_id=ANY($2::text[]) AND sequence>$3 ORDER BY sequence LIMIT $4`,
        [tenantId, roomIds, after, limit],
      )
    ).rows.map((row) => ({
      sequence: Number(row.sequence),
      record: row.record,
    }));
  }
}
export class PostgresMemoryProposalStoreV1
  extends PostgresFollowupRevisionStoreV1<MemoryProposalV1>
  implements MemoryProposalStoreV1
{
  constructor(pool: Pool, options: { schema?: string } = {}) {
    super(pool, "memory_proposal", validateMemoryProposalV1, options);
  }
  async list(
    tenantId: string,
    subject: MemorySubjectV1,
    afterId: string | undefined,
    limit: number,
  ): Promise<MemoryProposalV1[]> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.followup_heads WHERE tenant_id=$1 AND kind='memory_proposal' AND subject_type=$2 AND subject_id=$3 AND ($4::text IS NULL OR id COLLATE "C">$4 COLLATE "C") ORDER BY id COLLATE "C" LIMIT $5`,
        [tenantId, subject.type, subject.id, afterId ?? null, limit],
      )
    ).rows.map((row) => row.record);
  }
}
const applicationId = "@agentplat/room-followup";
async function migrations() {
  return [
    {
      version: 1,
      name: "001_room_followup",
      destructiveDown: true,
      up: await readFile(
        new URL(
          "../migrations/room-followup/001_room_followup.up.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      down: await readFile(
        new URL(
          "../migrations/room-followup/001_room_followup.down.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    },
  ];
}
export async function runRoomFollowupMigrations(
  pool: Pool,
  options: { schema?: string; createSchema?: boolean } = {},
) {
  return runPostgresMigrations(pool, {
    applicationId,
    ...options,
    migrations: await migrations(),
  });
}
export async function getRoomFollowupMigrationStatus(
  pool: Pool,
  options: { schema?: string } = {},
) {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    ...options,
    migrations: await migrations(),
  });
}
export function roomFollowupRollbackConfirmation(
  schema = defaultPostgresSchema,
) {
  return postgresRollbackConfirmation(applicationId, schema, 1);
}
export async function rollbackRoomFollowupMigrations(
  pool: Pool,
  options: {
    schema?: string;
    expectedCurrentVersion: number;
    confirm: string;
    allowDataLoss?: boolean;
  },
) {
  return rollbackPostgresMigration(pool, {
    applicationId,
    ...options,
    createSchema: false,
    migrations: await migrations(),
  });
}
