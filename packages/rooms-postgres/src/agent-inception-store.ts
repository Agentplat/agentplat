import {
  validateInceptionAssessmentRecordV1,
  validateGovernancePageV1,
  type AgentInceptionStoreV1,
  type AgentInceptionV1,
  type InceptionAssessmentV1,
  type InceptionGovernanceBindingV1,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

export class PostgresAgentInceptionStoreV1 implements AgentInceptionStoreV1 {
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
  async get(
    t: string,
    a: string,
    i: string,
  ): Promise<AgentInceptionV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_inceptions WHERE tenant_id=$1 AND agent_id=$2 AND inception_id=$3`,
        [t, a, i],
      )
    ).rows[0]?.record;
  }
  async assessment(
    t: string,
    a: string,
    i: string,
    id: string,
  ): Promise<InceptionAssessmentV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_inception_assessments WHERE tenant_id=$1 AND agent_id=$2 AND inception_id=$3 AND assessment_id=$4`,
        [t, a, i, id],
      )
    ).rows[0]?.record;
  }
  async latest(
    t: string,
    a: string,
    i: string,
  ): Promise<InceptionAssessmentV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_inception_assessments WHERE tenant_id=$1 AND agent_id=$2 AND inception_id=$3 ORDER BY revision DESC LIMIT 1`,
        [t, a, i],
      )
    ).rows[0]?.record;
  }
  async history(
    t: string,
    a: string,
    i: string,
    after: number,
    limit: number,
  ): Promise<InceptionAssessmentV1[]> {
    validateGovernancePageV1(after, limit);
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_inception_assessments WHERE tenant_id=$1 AND agent_id=$2 AND inception_id=$3 AND revision>$4 ORDER BY revision LIMIT $5`,
        [t, a, i, after, limit],
      )
    ).rows.map((x) => x.record);
  }
  async insert(input: AgentInceptionV1): Promise<boolean> {
    const r = structuredClone(input);
    return this.transaction(async (client) => {
      if (!(await this.fence(client, r.tenantId, r.agentId, r.governance)))
        return false;
      await client.query(
        `INSERT INTO ${this.schema}.agent_inceptions (tenant_id,agent_id,inception_id,record) VALUES ($1,$2,$3,$4::jsonb)`,
        [r.tenantId, r.agentId, r.inceptionId, JSON.stringify(r)],
      );
      await client.query(
        `INSERT INTO ${this.schema}.agent_inception_heads (tenant_id,agent_id,inception_id) VALUES ($1,$2,$3)`,
        [r.tenantId, r.agentId, r.inceptionId],
      );
      return true;
    });
  }
  async append(input: InceptionAssessmentV1): Promise<boolean> {
    const r = structuredClone(input);
    validateInceptionAssessmentRecordV1(r);
    return this.transaction(async (client) => {
      // Serialize with governance UPDATE, so a stale evaluation cannot commit after a change.
      if (!(await this.fence(client, r.tenantId, r.agentId, r.governance)))
        return false;
      const inception = (
        await client.query(
          `SELECT record FROM ${this.schema}.agent_inceptions WHERE tenant_id=$1 AND agent_id=$2 AND inception_id=$3`,
          [r.tenantId, r.agentId, r.inceptionId],
        )
      ).rows[0]?.record;
      if (!inception || inception.roomId !== r.roomId) return false;
      const changed = await client.query(
        `UPDATE ${this.schema}.agent_inception_heads SET revision=$4,assessment_digest=$5 WHERE tenant_id=$1 AND agent_id=$2 AND inception_id=$3 AND revision=$6 AND assessment_digest IS NOT DISTINCT FROM $7 RETURNING revision`,
        [
          r.tenantId,
          r.agentId,
          r.inceptionId,
          r.revision,
          r.assessmentDigest,
          r.revision - 1,
          r.previousAssessmentDigest,
        ],
      );
      if (changed.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO ${this.schema}.agent_inception_assessments (tenant_id,agent_id,inception_id,assessment_id,revision,record) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          r.tenantId,
          r.agentId,
          r.inceptionId,
          r.assessmentId,
          r.revision,
          JSON.stringify(r),
        ],
      );
      return true;
    });
  }
  private async fence(
    client: PoolClient,
    t: string,
    a: string,
    b: InceptionGovernanceBindingV1,
  ) {
    const h = (
      await client.query(
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
  private async transaction(
    work: (client: PoolClient) => Promise<boolean>,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query(result ? "COMMIT" : "ROLLBACK");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    } finally {
      client.release();
    }
  }
}
