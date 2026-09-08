import type { Pool } from "pg";
import {
  qualifyPostgresName,
  runPostgresMigrations,
  getPostgresMigrationStatus,
  type PostgresMigration,
} from "@agentplat/postgres";
import {
  validateRegistryEntry,
  type AgentRegistryEntry,
  type AgentRegistryStore,
} from "@agentplat/agent-registry";
export const registryMigrations: readonly PostgresMigration[] = [
  {
    version: 1,
    name: "agent_registry",
    up: `CREATE TABLE __AGENTPLAT_SCHEMA__.agent_registry (
    tenant_id text NOT NULL, entry_id text COLLATE "C" NOT NULL, revision integer NOT NULL CHECK (revision > 0),
    entry jsonb NOT NULL, PRIMARY KEY (tenant_id, entry_id),
    CHECK (entry->>'tenantId' = tenant_id), CHECK (entry->>'entryId' = entry_id), CHECK ((entry->>'revision')::integer = revision)
  );`,
    down: `DROP TABLE __AGENTPLAT_SCHEMA__.agent_registry;`,
    destructiveDown: true,
  },
];
export function runMigrations(
  pool: Pool,
  options: { schema?: string; createSchema?: boolean } = {},
) {
  return runPostgresMigrations(pool, {
    ...options,
    applicationId: "@agentplat/agent-registry-postgres",
    migrations: registryMigrations,
  });
}
export function getMigrationStatus(
  pool: Pool,
  options: { schema?: string } = {},
) {
  return getPostgresMigrationStatus(pool, {
    ...options,
    applicationId: "@agentplat/agent-registry-postgres",
    migrations: registryMigrations,
  });
}
export class PostgresAgentRegistryStore implements AgentRegistryStore {
  readonly #table: string;
  constructor(
    readonly pool: Pool,
    schema = "public",
  ) {
    this.#table = qualifyPostgresName(schema, "agent_registry");
  }
  async get(
    tenantId: string,
    entryId: string,
  ): Promise<AgentRegistryEntry | undefined> {
    const result = await this.pool.query(
      `SELECT entry FROM ${this.#table} WHERE tenant_id=$1 AND entry_id=$2`,
      [tenantId, entryId],
    );
    return result.rows[0]?.entry;
  }
  async list(
    tenantId: string,
    after: string | undefined,
    limit: number,
  ): Promise<AgentRegistryEntry[]> {
    const result = await this.pool.query(
      `SELECT entry FROM ${this.#table} WHERE tenant_id=$1 AND ($2::text IS NULL OR entry_id>$2 COLLATE "C") ORDER BY entry_id LIMIT $3`,
      [tenantId, after ?? null, limit],
    );
    return result.rows.map((r) => r.entry);
  }
  async compareAndSet(
    entry: AgentRegistryEntry,
    expectedRevision: number | null,
  ): Promise<boolean> {
    validateRegistryEntry(entry);
    if (entry.revision !== (expectedRevision ?? 0) + 1) return false;
    const result =
      expectedRevision === null
        ? await this.pool.query(
            `INSERT INTO ${this.#table} (tenant_id,entry_id,revision,entry) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [entry.tenantId, entry.entryId, entry.revision, entry],
          )
        : await this.pool.query(
            `UPDATE ${this.#table} SET revision=$3,entry=$4 WHERE tenant_id=$1 AND entry_id=$2 AND revision=$5`,
            [
              entry.tenantId,
              entry.entryId,
              entry.revision,
              entry,
              expectedRevision,
            ],
          );
    return result.rowCount === 1;
  }
}
