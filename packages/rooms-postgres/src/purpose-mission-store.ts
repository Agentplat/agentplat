import {
  purposeMissionGovernanceMatchesV1,
  validatePurposeMissionCommitV1,
  type PurposeMissionStoreV1,
  type PurposeMissionStateV1,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";
export class PostgresPurposeMissionStoreV1 implements PurposeMissionStoreV1 {
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
    a: string,
    id: string,
  ): Promise<PurposeMissionStateV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT state FROM ${this.schema}.purpose_missions WHERE tenant_id=$1 AND agent_id=$2 AND mission_id=$3`,
        [t, a, id],
      )
    ).rows[0]?.state;
  }
  async byPlan(
    t: string,
    a: string,
    id: string,
  ): Promise<PurposeMissionStateV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT m.state FROM ${this.schema}.purpose_missions m JOIN ${this.schema}.purpose_mission_plans p USING(tenant_id,agent_id,mission_id) WHERE p.tenant_id=$1 AND p.agent_id=$2 AND p.plan_id=$3`,
        [t, a, id],
      )
    ).rows[0]?.state;
  }
  async history(
    t: string,
    a: string,
    id: string,
    after: number,
    limit: number,
  ): Promise<PurposeMissionStateV1[]> {
    if (
      !Number.isSafeInteger(after) ||
      after < -1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 256
    )
      throw new Error("invalid_mission_page");
    return (
      await this.pool.query(
        `SELECT state FROM ${this.schema}.purpose_mission_history WHERE tenant_id=$1 AND agent_id=$2 AND mission_id=$3 AND revision>$4 ORDER BY revision LIMIT $5`,
        [t, a, id, after, limit],
      )
    ).rows.map((r) => r.state);
  }
  async commit(
    input: PurposeMissionStateV1,
    expected: number | null,
  ): Promise<boolean> {
    const s = structuredClone(input);
    validatePurposeMissionCommitV1(s, expected);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const h = (
        await c.query(
          `SELECT state FROM ${this.schema}.agent_governance_heads WHERE tenant_id=$1 AND agent_id=$2 FOR UPDATE`,
          [s.tenantId, s.agentId],
        )
      ).rows[0]?.state;
      if (!purposeMissionGovernanceMatchesV1(h, s)) {
        await c.query("ROLLBACK");
        return false;
      }
      const owner = (
        await c.query(
          `SELECT mission_id FROM ${this.schema}.purpose_mission_plans WHERE tenant_id=$1 AND agent_id=$2 AND plan_id=$3`,
          [s.tenantId, s.agentId, s.planId],
        )
      ).rows[0]?.mission_id;
      if (owner && owner !== s.missionId) {
        await c.query("ROLLBACK");
        return false;
      }
      const params = [
        s.tenantId,
        s.agentId,
        s.missionId,
        s.revision,
        JSON.stringify(s),
      ];
      const result =
        expected === null
          ? await c.query(
              `INSERT INTO ${this.schema}.purpose_missions (tenant_id,agent_id,mission_id,revision,state) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING RETURNING revision`,
              params,
            )
          : await c.query(
              `UPDATE ${this.schema}.purpose_missions SET revision=$4,state=$5::jsonb WHERE tenant_id=$1 AND agent_id=$2 AND mission_id=$3 AND revision=$6 RETURNING revision`,
              [...params, expected],
            );
      if (result.rowCount !== 1) {
        await c.query("ROLLBACK");
        return false;
      }
      await c.query(
        `INSERT INTO ${this.schema}.purpose_mission_plans (tenant_id,agent_id,plan_id,mission_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [s.tenantId, s.agentId, s.planId, s.missionId],
      );
      await c.query(
        `INSERT INTO ${this.schema}.purpose_mission_history (tenant_id,agent_id,mission_id,revision,state) VALUES ($1,$2,$3,$4,$5::jsonb)`,
        params,
      );
      await c.query("COMMIT");
      return true;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
