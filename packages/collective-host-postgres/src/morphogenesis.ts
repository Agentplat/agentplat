import {
  validateMorphogenesisExecutionRecordV1,
  validateMorphologyHeadV1,
  type MorphogenesisExecutionRecordV1,
  type MorphogenesisExecutionStoreV1,
  type MorphologyHeadStoreV1,
  type MorphologyHeadV1,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

export interface MorphogenesisPostgresRollbackWitnessV1 {
  verify(input: {
    readonly scopeId: string;
    readonly stateKind:
      | "morphology-head"
      | "morphogenesis-execution"
      | "morphogenesis-operator-execution"
      | "morphogenesis-operator-outcome"
      | "morphogenesis-team-topology"
      | "morphogenesis-operator-compensation"
      | "morphogenesis-strategy-adaptation"
      | "morphogenesis-strategy-governance"
      | "morphogenesis-strategy-counterfactual"
      | "morphogenesis-strategy-evidence-exchange"
      | "morphogenesis-strategy-convergence"
      | "morphogenesis-strategy-synthesis-governance"
      | "morphogenesis-synthesis-simulation-report"
      | "morphogenesis-agent-genesis-lifecycle"
      | "morphogenesis-organizational-execution"
      | "morphogenesis-organizational-governance"
      | "morphogenesis-budget-reservation";
    readonly stateKey: string;
    readonly revision: number;
    readonly digest: `sha256:${string}`;
  }): Promise<boolean>;
  record(input: {
    readonly scopeId: string;
    readonly stateKind:
      | "morphology-head"
      | "morphogenesis-execution"
      | "morphogenesis-operator-execution"
      | "morphogenesis-operator-outcome"
      | "morphogenesis-team-topology"
      | "morphogenesis-operator-compensation"
      | "morphogenesis-strategy-adaptation"
      | "morphogenesis-strategy-governance"
      | "morphogenesis-strategy-counterfactual"
      | "morphogenesis-strategy-evidence-exchange"
      | "morphogenesis-strategy-convergence"
      | "morphogenesis-strategy-synthesis-governance"
      | "morphogenesis-synthesis-simulation-report"
      | "morphogenesis-agent-genesis-lifecycle"
      | "morphogenesis-organizational-execution"
      | "morphogenesis-organizational-governance"
      | "morphogenesis-budget-reservation";
    readonly stateKey: string;
    readonly previousRevision: number | null;
    readonly previousDigest: `sha256:${string}` | null;
    readonly nextRevision: number;
    readonly nextDigest: `sha256:${string}`;
  }): Promise<boolean>;
}

export interface MorphogenesisPostgresStoreOptionsV1 {
  readonly scopeId: string;
  readonly schema?: string;
  readonly rollbackWitness: MorphogenesisPostgresRollbackWitnessV1;
}

export class PostgresMorphologyHeadStoreV1 implements MorphologyHeadStoreV1 {
  readonly #repository: MorphogenesisStateRepositoryV1<MorphologyHeadV1>;

  constructor(pool: Pool, options: MorphogenesisPostgresStoreOptionsV1) {
    this.#repository = new MorphogenesisStateRepositoryV1(
      pool,
      options,
      "morphology-head",
      validateMorphologyHeadV1,
      (state) => state.headDigest,
    );
  }

  load(stateKey: string) {
    return this.#repository.load(stateKey);
  }

  save(input: Parameters<MorphologyHeadStoreV1["save"]>[0]) {
    return this.#repository.save({
      state: input.head,
      expectedRevision: input.expectedRevision,
      expectedDigest: input.expectedHeadDigest,
    });
  }
}

export class PostgresMorphogenesisExecutionStoreV1
  implements MorphogenesisExecutionStoreV1
{
  readonly #repository: MorphogenesisStateRepositoryV1<MorphogenesisExecutionRecordV1>;

  constructor(pool: Pool, options: MorphogenesisPostgresStoreOptionsV1) {
    this.#repository = new MorphogenesisStateRepositoryV1(
      pool,
      options,
      "morphogenesis-execution",
      validateMorphogenesisExecutionRecordV1,
      (state) => state.recordDigest,
    );
  }

  load(stateKey: string) {
    return this.#repository.load(stateKey);
  }

  save(input: Parameters<MorphogenesisExecutionStoreV1["save"]>[0]) {
    return this.#repository.save({
      state: input.record,
      expectedRevision: input.expectedRevision,
      expectedDigest: input.expectedRecordDigest,
    });
  }
}

class MorphogenesisStateRepositoryV1<
  T extends {
    readonly stateKey: string;
    readonly revision: number;
    readonly logicalTimeHighWaterMs: number;
  },
> {
  readonly #prefix: string;

  constructor(
    readonly pool: Pool,
    readonly options: MorphogenesisPostgresStoreOptionsV1,
    readonly stateKind:
      | "morphology-head"
      | "morphogenesis-execution"
      | "morphogenesis-operator-execution"
      | "morphogenesis-operator-compensation",
    readonly validate: (input: unknown) => T,
    readonly stateDigest: (state: T) => `sha256:${string}`,
  ) {
    if (!pool || !options.scopeId || !options.rollbackWitness)
      throw new TypeError("Morphogenesis PostgreSQL store options are required");
    this.#prefix = `${quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    )}.`;
  }

  async load(stateKey: string): Promise<T | null> {
    const result = await this.pool.query<{
      revision: string | number;
      logical_time_high_water_ms: string | number;
      state_digest: string;
      state: unknown;
    }>(
      `SELECT revision, logical_time_high_water_ms, state_digest, state
         FROM ${this.#prefix}collective_host_runtime_states
        WHERE scope_id = $1 AND state_kind = $2 AND state_key = $3`,
      [this.options.scopeId, this.stateKind, stateKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    const state = this.validate(row.state);
    const digest = this.stateDigest(state);
    if (
      Number(row.revision) !== state.revision ||
      Number(row.logical_time_high_water_ms) !==
        state.logicalTimeHighWaterMs ||
      row.state_digest !== digest ||
      !(await this.options.rollbackWitness.verify({
        scopeId: this.options.scopeId,
        stateKind: this.stateKind,
        stateKey,
        revision: state.revision,
        digest,
      }))
    )
      throw new Error("Morphogenesis PostgreSQL state or rollback witness diverged");
    return state;
  }

  async save(input: {
    readonly state: T;
    readonly expectedRevision: number | null;
    readonly expectedDigest: `sha256:${string}` | null;
  }): Promise<boolean> {
    const state = this.validate(input.state);
    const digest = this.stateDigest(state);
    if (
      (input.expectedRevision === null &&
        (input.expectedDigest !== null || state.revision !== 0)) ||
      (input.expectedRevision !== null &&
        state.revision !== input.expectedRevision + 1)
    )
      return false;
    const result =
      input.expectedRevision === null
        ? await this.pool.query(
            `INSERT INTO ${this.#prefix}collective_host_runtime_states
              (scope_id, state_kind, state_key, revision,
               logical_time_high_water_ms, state_digest, state)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
             ON CONFLICT DO NOTHING`,
            [
              this.options.scopeId,
              this.stateKind,
              state.stateKey,
              state.revision,
              state.logicalTimeHighWaterMs,
              digest,
              JSON.stringify(state),
            ],
          )
        : await this.pool.query(
            `UPDATE ${this.#prefix}collective_host_runtime_states
                SET revision = $6, logical_time_high_water_ms = $7,
                    state_digest = $8, state = $9::jsonb,
                    updated_at = transaction_timestamp()
              WHERE scope_id = $1 AND state_kind = $2 AND state_key = $3
                AND revision = $4 AND state_digest = $5
                AND logical_time_high_water_ms <= $7`,
            [
              this.options.scopeId,
              this.stateKind,
              state.stateKey,
              input.expectedRevision,
              input.expectedDigest,
              state.revision,
              state.logicalTimeHighWaterMs,
              digest,
              JSON.stringify(state),
            ],
          );
    if ((result.rowCount ?? 0) !== 1) {
      const retained = await this.load(state.stateKey);
      return retained ? this.stateDigest(retained) === digest : false;
    }
    if (
      !(await this.options.rollbackWitness.record({
        scopeId: this.options.scopeId,
        stateKind: this.stateKind,
        stateKey: state.stateKey,
        previousRevision: input.expectedRevision,
        previousDigest: input.expectedDigest,
        nextRevision: state.revision,
        nextDigest: digest,
      }))
    )
      throw new Error("Morphogenesis rollback witness rejected the durable head");
    return true;
  }
}
