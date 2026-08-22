import type {
  KnowledgeBundleRevision,
  KnowledgeBundleStore,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

/** PostgreSQL immutable knowledge bundle revision store. */
export class PostgresKnowledgeBundleStore implements KnowledgeBundleStore {
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
    this.table = `${schema}.knowledge_bundle_revisions`;
  }
  async load(tenantId: string, reference: string) {
    const result = await this.pool.query<{ bundle: KnowledgeBundleRevision }>(
      `SELECT bundle FROM ${this.table} WHERE tenant_id=$1 AND reference=$2`,
      [tenantId, reference],
    );
    return result.rows[0]?.bundle
      ? structuredClone(result.rows[0].bundle)
      : undefined;
  }
  async list(tenantId: string, bundleId: string) {
    const result = await this.pool.query<{ bundle: KnowledgeBundleRevision }>(
      `SELECT bundle FROM ${this.table} WHERE tenant_id=$1 AND bundle_id=$2 ORDER BY version`,
      [tenantId, bundleId],
    );
    return result.rows.map((row) => structuredClone(row.bundle));
  }
  async insert(bundle: KnowledgeBundleRevision) {
    try {
      const result = await this.pool.query(
        `INSERT INTO ${this.table}
          (tenant_id,bundle_id,version,reference,digest,bundle,created_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (tenant_id,reference) DO NOTHING`,
        [
          bundle.tenantId,
          bundle.bundleId,
          bundle.version,
          bundle.reference,
          bundle.digest,
          JSON.stringify(bundle),
          bundle.createdAt,
        ],
      );
      return result.rowCount === 1;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    }
  }
}
