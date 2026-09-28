import {
  continuityWriteCurrentV1,
  validateContinuityRecordV1,
  type AgentContinuityStoreV1,
  type AgentContinuityRecordV1,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";
export class PostgresAgentContinuityStoreV1 implements AgentContinuityStoreV1 {
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
  async load(
    t: string,
    id: string,
  ): Promise<AgentContinuityRecordV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_continuity WHERE tenant_id=$1 AND continuity_id=$2`,
        [t, id],
      )
    ).rows[0]?.record;
  }
  async operation(
    t: string,
    id: string,
    op: string,
  ): Promise<AgentContinuityRecordV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_continuity_operations WHERE tenant_id=$1 AND continuity_id=$2 AND operation_id=$3`,
        [t, id, op],
      )
    ).rows[0]?.record;
  }
  async commit(input: AgentContinuityRecordV1, expected: number | null) {
    const r = structuredClone(input);
    validateContinuityRecordV1(r, expected);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const heads = (
        await c.query(
          `SELECT agent_id,state FROM ${this.schema}.agent_governance_heads WHERE tenant_id=$1 AND agent_id=ANY($2::text[]) ORDER BY agent_id FOR UPDATE`,
          [r.tenantId, [r.parentAgentId, r.childAgentId]],
        )
      ).rows;
      if (
        !continuityWriteCurrentV1(
          heads.find((h) => h.agent_id === r.parentAgentId)?.state,
          heads.find((h) => h.agent_id === r.childAgentId)?.state,
          r,
        )
      ) {
        await c.query("ROLLBACK");
        return false;
      }
      const params = [
        r.tenantId,
        r.continuityId,
        r.parentAgentId,
        r.childAgentId,
        r.linkRevision,
        JSON.stringify(r),
      ];
      const write =
        expected === null
          ? await c.query(
              `INSERT INTO ${this.schema}.agent_continuity (tenant_id,continuity_id,parent_agent_id,child_agent_id,revision,record) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING RETURNING revision`,
              params,
            )
          : await c.query(
              `UPDATE ${this.schema}.agent_continuity SET revision=$5,record=$6::jsonb WHERE tenant_id=$1 AND continuity_id=$2 AND parent_agent_id=$3 AND child_agent_id=$4 AND revision=$7 RETURNING revision`,
              [...params, expected],
            );
      if (write.rowCount !== 1) {
        await c.query("ROLLBACK");
        return false;
      }
      await c.query(
        `INSERT INTO ${this.schema}.agent_continuity_operations (tenant_id,continuity_id,operation_id,revision,record) VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [
          r.tenantId,
          r.continuityId,
          r.operationId,
          r.linkRevision,
          JSON.stringify(r),
        ],
      );
      await c.query("COMMIT");
      return true;
    } catch (e) {
      await c.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505") return false;
      throw e;
    } finally {
      c.release();
    }
  }
}
