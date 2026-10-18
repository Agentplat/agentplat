import { readFile } from "node:fs/promises";
import {
  validateMemoryRevisionV1,
  memoryRevisionFollowsV1,
  type MemoryRevisionStoreV1,
  type MemoryRevisionV1,
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

/** Head and immutable revision/audit event commit in one transaction. */
export class PostgresMemoryRevisionStoreV1 implements MemoryRevisionStoreV1 {
  private readonly schema: string;
  constructor(
    private readonly pool: Pool,
    options: { schema?: string } = {},
  ) {
    this.schema = quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    );
  }
  async head(t: string, m: string): Promise<MemoryRevisionV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.memory_revision_heads WHERE tenant_id=$1 AND memory_id=$2`,
        [t, m],
      )
    ).rows[0]?.record;
  }
  async revision(
    t: string,
    m: string,
    r: number,
  ): Promise<MemoryRevisionV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.memory_revisions WHERE tenant_id=$1 AND memory_id=$2 AND revision=$3`,
        [t, m, r],
      )
    ).rows[0]?.record;
  }
  async operation(
    t: string,
    m: string,
    op: string,
  ): Promise<MemoryRevisionV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.memory_revisions WHERE tenant_id=$1 AND memory_id=$2 AND operation_id=$3`,
        [t, m, op],
      )
    ).rows[0]?.record;
  }
  async commit(
    input: MemoryRevisionV1,
    expected: number | null,
  ): Promise<boolean> {
    const r = structuredClone(input);
    await validateMemoryRevisionV1(r);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const values = [r.tenantId, r.memoryId, r.revision, JSON.stringify(r)];
      if (expected === null) {
        if (!memoryRevisionFollowsV1(r, undefined, expected)) {
          await client.query("ROLLBACK");
          return false;
        }
        const inserted = await client.query(
          `INSERT INTO ${this.schema}.memory_revision_heads (tenant_id,memory_id,revision,record) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,
          values,
        );
        if (inserted.rowCount !== 1) {
          await client.query("ROLLBACK");
          return false;
        }
      } else {
        const previous = (
          await client.query(
            `SELECT record FROM ${this.schema}.memory_revision_heads WHERE tenant_id=$1 AND memory_id=$2 FOR UPDATE`,
            [r.tenantId, r.memoryId],
          )
        ).rows[0]?.record as MemoryRevisionV1 | undefined;
        if (!memoryRevisionFollowsV1(r, previous, expected)) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query(
          `UPDATE ${this.schema}.memory_revision_heads SET revision=$3,record=$4::jsonb WHERE tenant_id=$1 AND memory_id=$2`,
          values,
        );
      }
      await client.query(
        `INSERT INTO ${this.schema}.memory_revisions (tenant_id,memory_id,revision,operation_id,record) VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [r.tenantId, r.memoryId, r.revision, r.operationId, JSON.stringify(r)],
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
const applicationId = "@agentplat/room-memory-revisions";
async function migrations() {
  return [
    {
      version: 1,
      name: "001_memory_revisions",
      destructiveDown: true,
      up: await readFile(
        new URL(
          "../migrations/memory-revisions/001_memory_revisions.up.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      down: await readFile(
        new URL(
          "../migrations/memory-revisions/001_memory_revisions.down.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    },
  ];
}
export async function runMemoryRevisionMigrations(
  pool: Pool,
  options: { schema?: string; createSchema?: boolean } = {},
) {
  return runPostgresMigrations(pool, {
    applicationId,
    ...options,
    migrations: await migrations(),
  });
}
export async function getMemoryRevisionMigrationStatus(
  pool: Pool,
  options: { schema?: string } = {},
) {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    ...options,
    migrations: await migrations(),
  });
}
export function memoryRevisionRollbackConfirmation(
  schema = defaultPostgresSchema,
) {
  return postgresRollbackConfirmation(applicationId, schema, 1);
}
export async function rollbackMemoryRevisionMigrations(
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
