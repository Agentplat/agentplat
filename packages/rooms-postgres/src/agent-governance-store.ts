import {
  validateGovernanceCommitV1,
  validateGovernancePageV1,
  type AgentGovernanceStoreV1,
  type AgentGovernanceHeadV1,
  type AgentGovernanceOperationV1,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

/** Transactional head + append-only configuration/result journal. */
export class PostgresAgentGovernanceStoreV1 implements AgentGovernanceStoreV1 {
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
    tenantId: string,
    agentId: string,
  ): Promise<AgentGovernanceHeadV1 | undefined> {
    const result = await this.pool.query(
      `SELECT state FROM ${this.schema}.agent_governance_heads WHERE tenant_id=$1 AND agent_id=$2`,
      [tenantId, agentId],
    );
    return result.rows[0]?.state;
  }
  async operation(
    tenantId: string,
    agentId: string,
    operationId: string,
  ): Promise<AgentGovernanceOperationV1 | undefined> {
    const result = await this.pool.query(
      `SELECT operation FROM ${this.schema}.agent_governance_operations WHERE tenant_id=$1 AND agent_id=$2 AND operation_id=$3`,
      [tenantId, agentId, operationId],
    );
    return result.rows[0]?.operation;
  }
  async history(
    tenantId: string,
    agentId: string,
    afterRevision: number,
    limit: number,
  ): Promise<AgentGovernanceOperationV1[]> {
    validateGovernancePageV1(afterRevision, limit);
    const result = await this.pool.query(
      `SELECT operation FROM ${this.schema}.agent_governance_operations WHERE tenant_id=$1 AND agent_id=$2 AND revision>$3 ORDER BY revision LIMIT $4`,
      [tenantId, agentId, afterRevision, limit],
    );
    return result.rows.map((row) => row.operation);
  }
  async commit(input: AgentGovernanceOperationV1): Promise<boolean> {
    const op = structuredClone(input);
    validateGovernanceCommitV1(op);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (op.expectedRevision === null) {
        const inserted = await client.query(
          `INSERT INTO ${this.schema}.agent_governance_heads (tenant_id,agent_id,revision,state) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING RETURNING revision`,
          [
            op.tenantId,
            op.agentId,
            op.result.revision,
            JSON.stringify(op.result),
          ],
        );
        if (inserted.rowCount !== 1) {
          await client.query("ROLLBACK");
          return false;
        }
      } else {
        const changed = await client.query(
          `UPDATE ${this.schema}.agent_governance_heads SET revision=$3,state=$4::jsonb WHERE tenant_id=$1 AND agent_id=$2 AND revision=$5 RETURNING revision`,
          [
            op.tenantId,
            op.agentId,
            op.result.revision,
            JSON.stringify(op.result),
            op.expectedRevision,
          ],
        );
        if (changed.rowCount !== 1) {
          await client.query("ROLLBACK");
          return false;
        }
      }
      await client.query(
        `INSERT INTO ${this.schema}.agent_governance_operations (tenant_id,agent_id,operation_id,revision,operation) VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [
          op.tenantId,
          op.agentId,
          op.operationId,
          op.result.revision,
          JSON.stringify(op),
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
