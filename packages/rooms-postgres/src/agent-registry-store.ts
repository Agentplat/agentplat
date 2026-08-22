import type {
  AgentDefinitionRegistryStore,
  AgentDefinitionRevision,
  AgentRevisionLifecycle,
  RegisteredAgent,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

/** Schema selection for PostgreSQL Agent Definition Registry persistence. */
export interface PostgresAgentDefinitionRegistryStoreOptions {
  schema?: string;
}

/** PostgreSQL immutable-definition and lifecycle-CAS registry store. */
export class PostgresAgentDefinitionRegistryStore implements AgentDefinitionRegistryStore {
  private readonly schema: string;

  constructor(
    private readonly pool: Pool,
    options: PostgresAgentDefinitionRegistryStoreOptions = {},
  ) {
    this.schema = quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    );
  }

  async getAgent(tenantId: string, agentId: string) {
    const result = await this.pool.query<{
      tenant_id: string;
      agent_id: string;
      name: string;
      description: string | null;
      created_at: Date | string;
    }>(
      `SELECT * FROM ${this.schema}.registered_agents
       WHERE tenant_id = $1 AND agent_id = $2`,
      [tenantId, agentId],
    );
    const row = result.rows[0];
    return row
      ? {
          tenantId: row.tenant_id,
          agentId: row.agent_id,
          name: row.name,
          description: row.description ?? undefined,
          createdAt: iso(row.created_at),
        }
      : undefined;
  }

  async insertAgent(agent: RegisteredAgent): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO ${this.schema}.registered_agents
         (tenant_id, agent_id, name, description, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, agent_id) DO NOTHING`,
      [
        agent.tenantId,
        agent.agentId,
        agent.name,
        agent.description ?? null,
        agent.createdAt,
      ],
    );
    return result.rowCount === 1;
  }

  async getRevision(tenantId: string, revisionId: string) {
    const result = await this.pool.query<{
      definition: AgentDefinitionRevision;
    }>(
      `SELECT definition FROM ${this.schema}.agent_definition_revisions
       WHERE tenant_id = $1 AND revision_id = $2`,
      [tenantId, revisionId],
    );
    return clone(result.rows[0]?.definition);
  }

  async listRevisions(tenantId: string, agentId: string) {
    const result = await this.pool.query<{
      definition: AgentDefinitionRevision;
    }>(
      `SELECT definition FROM ${this.schema}.agent_definition_revisions
       WHERE tenant_id = $1 AND agent_id = $2
       ORDER BY version, revision_id`,
      [tenantId, agentId],
    );
    return result.rows.map((row) => clone(row.definition)!);
  }

  async insertRevision(revision: AgentDefinitionRevision): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO ${this.schema}.agent_definition_revisions
         (tenant_id, agent_id, revision_id, version, digest, definition, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (tenant_id, revision_id) DO NOTHING`,
      [
        revision.tenantId,
        revision.agentId,
        revision.revisionId,
        revision.version,
        revision.digest,
        JSON.stringify(revision),
        revision.createdAt,
      ],
    );
    return result.rowCount === 1;
  }

  async insertRevisionWithLifecycle(input: {
    definition: AgentDefinitionRevision;
    lifecycle: AgentRevisionLifecycle;
  }): Promise<boolean> {
    const definition = input.definition;
    const lifecycle = input.lifecycle;
    if (lifecycle.revision !== 0) return false;
    try {
      const result = await this.pool.query(
        `WITH inserted_revision AS (
         INSERT INTO ${this.schema}.agent_definition_revisions
           (tenant_id, agent_id, revision_id, version, digest, definition, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (tenant_id, revision_id) DO NOTHING
         RETURNING tenant_id, agent_id, revision_id
       )
       INSERT INTO ${this.schema}.agent_revision_lifecycle
         (tenant_id, agent_id, revision_id, revision, status, lifecycle, updated_at)
       SELECT tenant_id, agent_id, revision_id, $8, $9, $10::jsonb, $11
       FROM inserted_revision
       ON CONFLICT (tenant_id, revision_id) DO NOTHING`,
        [
          definition.tenantId,
          definition.agentId,
          definition.revisionId,
          definition.version,
          definition.digest,
          JSON.stringify(definition),
          definition.createdAt,
          lifecycle.revision,
          lifecycle.status,
          JSON.stringify(lifecycle),
          lifecycle.updatedAt,
        ],
      );
      return result.rowCount === 1;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    }
  }

  async getLifecycle(tenantId: string, revisionId: string) {
    const result = await this.pool.query<{ lifecycle: AgentRevisionLifecycle }>(
      `SELECT lifecycle FROM ${this.schema}.agent_revision_lifecycle
       WHERE tenant_id = $1 AND revision_id = $2`,
      [tenantId, revisionId],
    );
    return clone(result.rows[0]?.lifecycle);
  }

  async compareAndSetLifecycle(input: {
    expectedRevision: number | null;
    lifecycle: AgentRevisionLifecycle;
  }): Promise<boolean> {
    const state = input.lifecycle;
    if (input.expectedRevision === null) {
      if (state.revision !== 0) return false;
      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.agent_revision_lifecycle
           (tenant_id, agent_id, revision_id, revision, status, lifecycle, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (tenant_id, revision_id) DO NOTHING`,
        [
          state.tenantId,
          state.agentId,
          state.revisionId,
          state.revision,
          state.status,
          JSON.stringify(state),
          state.updatedAt,
        ],
      );
      return result.rowCount === 1;
    }
    if (state.revision !== input.expectedRevision + 1) return false;
    const result = await this.pool.query(
      `UPDATE ${this.schema}.agent_revision_lifecycle
       SET revision = $4, status = $5, lifecycle = $6::jsonb, updated_at = $7
       WHERE tenant_id = $1 AND agent_id = $2 AND revision_id = $3
         AND revision = $8`,
      [
        state.tenantId,
        state.agentId,
        state.revisionId,
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

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
