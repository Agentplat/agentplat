import type {
  AgentLineageStateV1,
  AgentLineageStoreV1,
} from "@agentplat/collective-membership/agent-lineage";
import type {
  GovernedAgentFactoryStateV1,
  GovernedAgentFactoryStoreV1,
} from "@agentplat/collective-membership/agent-factory";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

export interface PostgresGovernedAgentStateScopeV1 {
  readonly schema?: string;
  readonly scopeId: string;
}

abstract class PostgresGovernedAgentStateRepositoryV1<T extends {
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly stateDigest: string;
}> {
  readonly #prefix: string;

  protected constructor(
    protected readonly pool: Pool,
    protected readonly scopeId: string,
    private readonly stateKind: "agent-lineage" | "governed-agent-factory",
    schema = defaultPostgresSchema,
  ) {
    if (!pool || !scopeId) throw new TypeError("governed agent PostgreSQL scope is required");
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(schema, "schema"))}.`;
  }

  protected async loadState(stateKey: string): Promise<T | null> {
    const result = await this.pool.query<{
      revision: string | number;
      logical_time_high_water_ms: string | number;
      state_digest: string;
      state: T;
    }>(
      `SELECT revision, logical_time_high_water_ms, state_digest, state
         FROM ${this.#prefix}collective_membership_agent_states
        WHERE scope_id = $1 AND state_kind = $2 AND state_key = $3`,
      [this.scopeId, this.stateKind, stateKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (Number(row.revision) !== row.state.revision ||
        Number(row.logical_time_high_water_ms) !== row.state.logicalTimeHighWaterMs ||
        row.state_digest !== row.state.stateDigest)
      throw new Error("governed agent PostgreSQL state columns diverge from the document");
    return row.state;
  }

  protected async saveState(
    stateKey: string,
    state: T,
    expectedRevision: number | null,
  ): Promise<boolean> {
    if ((expectedRevision === null && state.revision !== 0) ||
        (expectedRevision !== null && state.revision !== expectedRevision + 1)) return false;
    if (expectedRevision === null) {
      const result = await this.pool.query(
        `INSERT INTO ${this.#prefix}collective_membership_agent_states
          (scope_id, state_kind, state_key, revision, logical_time_high_water_ms,
           state_digest, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT DO NOTHING`,
        [this.scopeId, this.stateKind, stateKey, state.revision,
          state.logicalTimeHighWaterMs, state.stateDigest, JSON.stringify(state)],
      );
      return (result.rowCount ?? 0) === 1;
    }
    const result = await this.pool.query(
      `UPDATE ${this.#prefix}collective_membership_agent_states
          SET revision = $5, logical_time_high_water_ms = $6,
              state_digest = $7, state = $8::jsonb,
              updated_at = transaction_timestamp()
        WHERE scope_id = $1 AND state_kind = $2 AND state_key = $3
          AND revision = $4 AND logical_time_high_water_ms <= $6`,
      [this.scopeId, this.stateKind, stateKey, expectedRevision, state.revision,
        state.logicalTimeHighWaterMs, state.stateDigest, JSON.stringify(state)],
    );
    return (result.rowCount ?? 0) === 1;
  }
}

export class PostgresAgentLineageStoreV1
  extends PostgresGovernedAgentStateRepositoryV1<AgentLineageStateV1>
  implements AgentLineageStoreV1 {
  constructor(pool: Pool, options: PostgresGovernedAgentStateScopeV1) {
    super(pool, options.scopeId, "agent-lineage", options.schema);
  }
  load(stateKey: string) { return this.loadState(stateKey); }
  save(state: AgentLineageStateV1, expectedRevision: number | null) {
    return this.saveState(state.stateKey, state, expectedRevision);
  }
}

export class PostgresGovernedAgentFactoryStoreV1
  extends PostgresGovernedAgentStateRepositoryV1<GovernedAgentFactoryStateV1>
  implements GovernedAgentFactoryStoreV1 {
  constructor(pool: Pool, options: PostgresGovernedAgentStateScopeV1) {
    super(pool, options.scopeId, "governed-agent-factory", options.schema);
  }
  load(stateKey: string) { return this.loadState(stateKey); }
  save(state: GovernedAgentFactoryStateV1, expectedRevision: number | null) {
    return this.saveState(state.stateKey, state, expectedRevision);
  }
}
