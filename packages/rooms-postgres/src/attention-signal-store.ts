import {
  validateAttentionStateCommitV1,
  type AttentionSignalStoreV1,
  type AttentionSignalCatalogV1,
  type AttentionSignalStateV1,
  type InceptionGovernanceBindingV1,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

/** Bounded stream state commits observations and pending evaluation/delivery together. */
export class PostgresAttentionSignalStoreV1 implements AttentionSignalStoreV1 {
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
  async catalog(
    t: string,
    a: string,
    id: string,
  ): Promise<AttentionSignalCatalogV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.attention_signal_catalog WHERE tenant_id=$1 AND agent_id=$2 AND record_id=$3`,
        [t, a, id],
      )
    ).rows[0]?.record;
  }
  async load(
    t: string,
    a: string,
    id: string,
  ): Promise<AttentionSignalStateV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT state FROM ${this.schema}.attention_signal_states WHERE tenant_id=$1 AND agent_id=$2 AND definition_id=$3`,
        [t, a, id],
      )
    ).rows[0]?.state;
  }
  async put(
    input: AttentionSignalCatalogV1,
    b: InceptionGovernanceBindingV1,
  ): Promise<boolean> {
    const r = structuredClone(input),
      binding = structuredClone(b);
    return this.transaction(async (c) => {
      if (!(await this.fence(c, r.tenantId, r.agentId, binding))) return false;
      const inserted = await c.query(
        `INSERT INTO ${this.schema}.attention_signal_catalog (tenant_id,agent_id,record_id,record) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING RETURNING record_id`,
        [r.tenantId, r.agentId, r.recordId, JSON.stringify(r)],
      );
      if (inserted.rowCount === 1) return true;
      const old = (
        await c.query(
          `SELECT record FROM ${this.schema}.attention_signal_catalog WHERE tenant_id=$1 AND agent_id=$2 AND record_id=$3`,
          [r.tenantId, r.agentId, r.recordId],
        )
      ).rows[0]?.record;
      return old?.digest === r.digest;
    });
  }
  async commit(
    input: AttentionSignalStateV1,
    expected: number | null,
    b: InceptionGovernanceBindingV1,
  ): Promise<boolean> {
    const s = structuredClone(input),
      binding = structuredClone(b);
    validateAttentionStateCommitV1(s, expected);
    return this.transaction(async (c) => {
      if (!(await this.fence(c, s.tenantId, s.agentId, binding))) return false;
      if (expected === null) {
        const inserted = await c.query(
          `INSERT INTO ${this.schema}.attention_signal_states (tenant_id,agent_id,definition_id,revision,state) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING RETURNING revision`,
          [
            s.tenantId,
            s.agentId,
            s.definitionId,
            s.revision,
            JSON.stringify(s),
          ],
        );
        return inserted.rowCount === 1;
      }
      const updated = await c.query(
        `UPDATE ${this.schema}.attention_signal_states SET revision=$4,state=$5::jsonb WHERE tenant_id=$1 AND agent_id=$2 AND definition_id=$3 AND revision=$6 RETURNING revision`,
        [
          s.tenantId,
          s.agentId,
          s.definitionId,
          s.revision,
          JSON.stringify(s),
          expected,
        ],
      );
      return updated.rowCount === 1;
    });
  }
  private async fence(
    c: PoolClient,
    t: string,
    a: string,
    b: InceptionGovernanceBindingV1,
  ) {
    const h = (
      await c.query(
        `SELECT state FROM ${this.schema}.agent_governance_heads WHERE tenant_id=$1 AND agent_id=$2 FOR SHARE`,
        [t, a],
      )
    ).rows[0]?.state;
    return (
      !!h &&
      h.configuration.interactionMode === "purpose" &&
      h.governanceId === b.governanceId &&
      h.revision === b.revision &&
      h.authorityEpoch === b.authorityEpoch &&
      h.configurationDigest === b.configurationDigest &&
      h.configuration.definitionRevisionId === b.definitionRevisionId
    );
  }
  private async transaction(work: (c: PoolClient) => Promise<boolean>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const result = await work(c);
      await c.query(result ? "COMMIT" : "ROLLBACK");
      return result;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
}
