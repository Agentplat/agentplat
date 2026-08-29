import {
  AutonomyValidationErrorV1,
  validateAutonomyDecisionV1,
  validateAutonomyPolicyV1,
  validateAutonomyStateV1,
  type AutonomyDecisionV1,
  type AutonomyDigestV1,
  type AutonomyPolicyV1,
  type AutonomyStateV1,
  type AutonomyStoreV1,
} from "@agentplat/autonomy";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

export interface PostgresAutonomyStoreOptionsV1 {
  readonly schema?: string;
}

interface JsonRow {
  readonly value: unknown;
}

/** Durable policy, CAS state and atomic decision journal implementation. */
export class PostgresAutonomyStoreV1 implements AutonomyStoreV1 {
  readonly #prefix: string;

  constructor(
    readonly pool: Pool,
    options: PostgresAutonomyStoreOptionsV1 = {},
  ) {
    if (!pool) throw new TypeError("PostgreSQL autonomy pool is required");
    this.#prefix = `${quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    )}.`;
  }

  async registerPolicy(
    policyInput: AutonomyPolicyV1,
  ): Promise<"created" | "replayed"> {
    const policy = validateAutonomyPolicyV1(policyInput);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}autonomy_policies
        (tenant_id,policy_domain_id,policy_id,policy_version,policy_digest,policy)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`,
      [
        policy.tenantId,
        policy.policyDomainId,
        policy.policyId,
        policy.policyVersion,
        policy.policyDigest,
        JSON.stringify(policy),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return "created";
    const current = await this.getPolicy(
      policy.tenantId,
      policy.policyDomainId,
      policy.policyId,
      policy.policyVersion,
    );
    if (!current || current.policyDigest !== policy.policyDigest)
      conflict("autonomy_policy_identity_conflict");
    return "replayed";
  }

  async getPolicy(
    tenantId: string,
    policyDomainId: string,
    policyId: string,
    policyVersion: number,
  ): Promise<AutonomyPolicyV1 | undefined> {
    const result = await this.pool.query<JsonRow>(
      `SELECT policy AS value FROM ${this.#prefix}autonomy_policies
        WHERE tenant_id=$1 AND policy_domain_id=$2 AND policy_id=$3
          AND policy_version=$4`,
      [tenantId, policyDomainId, policyId, policyVersion],
    );
    return result.rows[0]
      ? validateAutonomyPolicyV1(result.rows[0].value as AutonomyPolicyV1)
      : undefined;
  }

  async initializeState(stateInput: AutonomyStateV1): Promise<boolean> {
    const state = validateAutonomyStateV1(stateInput);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}autonomy_states
        (tenant_id,policy_domain_id,policy_id,policy_version,policy_digest,
         segment_digest,action_type,revision,state_digest,level,
         last_evidence_sequence,cooldown_until,state,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)
       ON CONFLICT DO NOTHING`,
      stateValues(state),
    );
    return (result.rowCount ?? 0) === 1;
  }

  async loadState(input: {
    readonly tenantId: string;
    readonly policyDomainId: string;
    readonly policyId: string;
    readonly segmentDigest: AutonomyDigestV1;
    readonly actionType: string;
  }): Promise<AutonomyStateV1 | undefined> {
    const result = await this.pool.query<JsonRow>(
      `SELECT state AS value FROM ${this.#prefix}autonomy_states
        WHERE tenant_id=$1 AND policy_domain_id=$2 AND policy_id=$3
          AND segment_digest=$4 AND action_type=$5`,
      [
        input.tenantId,
        input.policyDomainId,
        input.policyId,
        input.segmentDigest,
        input.actionType,
      ],
    );
    return result.rows[0]
      ? validateAutonomyStateV1(result.rows[0].value as AutonomyStateV1)
      : undefined;
  }

  async compareAndSet(input: {
    readonly expectedRevision: number;
    readonly expectedStateDigest: AutonomyDigestV1;
    readonly state: AutonomyStateV1;
    readonly decision: AutonomyDecisionV1;
  }): Promise<boolean> {
    const state = validateAutonomyStateV1(input.state);
    const decision = validateAutonomyDecisionV1(input.decision);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const update = await client.query(
        `UPDATE ${this.#prefix}autonomy_states SET
          policy_version=$4,policy_digest=$5,revision=$8,state_digest=$9,
          level=$10,last_evidence_sequence=$11,cooldown_until=$12,
          state=$13::jsonb,updated_at=$14
         WHERE tenant_id=$1 AND policy_domain_id=$2 AND policy_id=$3
           AND segment_digest=$6 AND action_type=$7
           AND revision=$15 AND state_digest=$16
           AND policy_version=$4 AND policy_digest=$5`,
        [
          ...stateUpdateValues(state),
          input.expectedRevision,
          input.expectedStateDigest,
        ],
      );
      if ((update.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return false;
      }
      const inserted = await client.query(
        `INSERT INTO ${this.#prefix}autonomy_decisions
          (tenant_id,policy_domain_id,decision_id,policy_id,policy_version,
           policy_digest,segment_digest,action_type,action_proposal_digest,
           state_revision,disposition,decision_digest,decided_at,decision)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
         ON CONFLICT DO NOTHING`,
        decisionValues(decision),
      );
      if ((inserted.rowCount ?? 0) !== 1)
        conflict("autonomy_decision_identity_conflict");
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listDecisions(input: {
    readonly tenantId: string;
    readonly policyDomainId: string;
    readonly segmentDigest?: AutonomyDigestV1;
  }): Promise<AutonomyDecisionV1[]> {
    const values: unknown[] = [input.tenantId, input.policyDomainId];
    const segment = input.segmentDigest
      ? `AND segment_digest=$${values.push(input.segmentDigest)}`
      : "";
    const result = await this.pool.query<JsonRow>(
      `SELECT decision AS value FROM ${this.#prefix}autonomy_decisions
        WHERE tenant_id=$1 AND policy_domain_id=$2 ${segment}
        ORDER BY decided_at,decision_id`,
      values,
    );
    return result.rows.map((row) =>
      validateAutonomyDecisionV1(row.value as AutonomyDecisionV1),
    );
  }
}

function stateValues(state: AutonomyStateV1): unknown[] {
  return [
    state.tenantId,
    state.policyDomainId,
    state.policyId,
    state.policyVersion,
    state.policyDigest,
    state.segmentDigest,
    state.actionType,
    state.revision,
    state.stateDigest,
    state.level,
    state.lastEvidenceSequence,
    state.cooldownUntil,
    JSON.stringify(state),
    state.createdAt,
    state.updatedAt,
  ];
}

function stateUpdateValues(state: AutonomyStateV1): unknown[] {
  return [
    state.tenantId,
    state.policyDomainId,
    state.policyId,
    state.policyVersion,
    state.policyDigest,
    state.segmentDigest,
    state.actionType,
    state.revision,
    state.stateDigest,
    state.level,
    state.lastEvidenceSequence,
    state.cooldownUntil,
    JSON.stringify(state),
    state.updatedAt,
  ];
}

function decisionValues(decision: AutonomyDecisionV1): unknown[] {
  return [
    decision.tenantId,
    decision.policyDomainId,
    decision.decisionId,
    decision.policyId,
    decision.policyVersion,
    decision.policyDigest,
    decision.segmentDigest,
    decision.actionType,
    decision.actionProposalDigest,
    decision.stateRevision,
    decision.disposition,
    decision.decisionDigest,
    decision.decidedAt,
    JSON.stringify(decision),
  ];
}

function conflict(message: string): never {
  throw new AutonomyValidationErrorV1(message);
}
