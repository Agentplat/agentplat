import {
  validateTaskOutcomeV1,
  type TaskOutcomeStoreV1,
  type TaskOutcomeV1,
} from "@agentplat/workflows/outcomes";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import { WorkflowValidationErrorV1 } from "@agentplat/workflows";
import type { Pool } from "pg";

export interface PostgresTaskOutcomeStoreOptionsV1 {
  readonly schema?: string;
}

interface JsonRow {
  readonly value: unknown;
}

/** Durable delayed-outcome storage with exact identity conflict detection. */
export class PostgresTaskOutcomeStoreV1 implements TaskOutcomeStoreV1 {
  readonly #prefix: string;

  constructor(
    readonly pool: Pool,
    options: PostgresTaskOutcomeStoreOptionsV1 = {},
  ) {
    if (!pool) throw new TypeError("PostgreSQL outcome pool is required");
    this.#prefix = `${quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    )}.`;
  }

  async appendOutcome(
    outcomeInput: TaskOutcomeV1,
  ): Promise<"created" | "replayed"> {
    const outcome = validateTaskOutcomeV1(outcomeInput);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}workflow_outcomes
        (tenant_id,outcome_id,task_run_id,binding_digest,outcome_type,verdict,
         outcome_digest,observed_at,recorded_at,outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        outcome.tenantId,
        outcome.outcomeId,
        outcome.taskRunId,
        outcome.taskExecutionBindingDigest,
        outcome.outcomeType,
        outcome.verdict,
        outcome.outcomeDigest,
        outcome.observedAt,
        outcome.recordedAt,
        JSON.stringify(outcome),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return "created";
    const current = await this.getOutcome(outcome.tenantId, outcome.outcomeId);
    if (!current || current.outcomeDigest !== outcome.outcomeDigest)
      throw new WorkflowValidationErrorV1("workflow_outcome_identity_conflict");
    return "replayed";
  }

  async getOutcome(
    tenantId: string,
    outcomeId: string,
  ): Promise<TaskOutcomeV1 | undefined> {
    required(tenantId, "tenantId");
    required(outcomeId, "outcomeId");
    const result = await this.pool.query<JsonRow>(
      `SELECT outcome AS value FROM ${this.#prefix}workflow_outcomes
        WHERE tenant_id=$1 AND outcome_id=$2`,
      [tenantId, outcomeId],
    );
    return result.rows[0]
      ? validateTaskOutcomeV1(result.rows[0].value as TaskOutcomeV1)
      : undefined;
  }

  async listOutcomes(input: {
    readonly tenantId: string;
    readonly taskRunId?: string;
    readonly outcomeType?: string;
    readonly recordedFrom?: string;
    readonly recordedThrough?: string;
  }): Promise<TaskOutcomeV1[]> {
    required(input.tenantId, "tenantId");
    const values: unknown[] = [input.tenantId];
    const conditions = ["tenant_id=$1"];
    if (input.taskRunId)
      conditions.push(`task_run_id=$${values.push(input.taskRunId)}`);
    if (input.outcomeType)
      conditions.push(`outcome_type=$${values.push(input.outcomeType)}`);
    if (input.recordedFrom)
      conditions.push(`recorded_at>=$${values.push(input.recordedFrom)}`);
    if (input.recordedThrough)
      conditions.push(`recorded_at<=$${values.push(input.recordedThrough)}`);
    const result = await this.pool.query<JsonRow>(
      `SELECT outcome AS value FROM ${this.#prefix}workflow_outcomes
        WHERE ${conditions.join(" AND ")}
        ORDER BY recorded_at,outcome_id`,
      values,
    );
    return result.rows.map((row) =>
      validateTaskOutcomeV1(row.value as TaskOutcomeV1),
    );
  }
}

function required(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160)
    throw new TypeError(`workflow_outcome_${label}_invalid`);
}
